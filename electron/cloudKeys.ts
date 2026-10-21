// NoteFlow Cloud key session (phase 4.2, stage 2) — main-process only.
//
// Manages the user's DEK (master key) lifecycle against public.user_keys
// (migrations 0004/0005) in the account's encryption MODE:
//   - 'managed' (standard, the DEFAULT — Obsidian Sync model): the user keeps
//     no secret. The client generates the DEK and deposits it in the cloud-keys
//     Edge Function, which wraps it with the OPERATOR key; unlock re-fetches it
//     silently (autoUnlockManaged) — a signed-in managed user never sees an
//     unlock screen. Honest trade-off, stated in the UI: NoteFlow could
//     technically read managed notes.
//   - 'e2ee' (private, opt-in): setup generates DEK + recovery code and uploads
//     the two passphrase/recovery-wrapped copies; unlock downloads them and
//     unwraps locally; the server never sees the DEK. Switching modes is
//     explicit and user-confirmed in both directions: managed → e2ee
//     (upgradeCloudKeysToE2ee) and e2ee → managed
//     (downgradeCloudKeysToManaged, which invalidates passphrase + recovery).
// Crypto primitives live in cloudCrypto.ts (pure); REST follows the account.ts
// pattern (plain fetch, a fresh access token per request via
// account.getAccessTokenResult(); a missing token throws a reason-tagged error
// from cloudAccessErrors.ts).
//
// Security model:
//   - The DEK lives ONLY in main-process memory. It never crosses to the
//     renderer and is never written to disk in the clear.
//   - Optional convenience cache: the DEK is persisted encrypted with OS-level
//     safeStorage in settings.json (cloudSync.encryptedDek) so the passphrase
//     isn't asked on every boot — ONLY when safeStorage is really available
//     (never the base64 fallback used for tokens: a base64'd master key on
//     disk would void the E2EE promise). Same rule in managed mode — no
//     safeStorage simply means no cache there: the DEK is re-fetched from the
//     server on each boot, frictionlessly. Cleared by lockCloudKeys().
//   - The recovery code is returned ONCE (setupCloudKeys /
//     upgradeCloudKeysToE2ee) and never persisted or logged anywhere.

import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import * as account from './account'
import { SUPABASE_URL, SUPABASE_ANON_KEY, CLOUD_KEYS_URL, isCloudConfigured } from './cloudConfig'
import { encryptSecret, decryptSecret } from './ai/llm/secret'
import { accessTokenError, isAccessTokenError, cloudAccessErrorMessage, CLOUD_SESSION_LOCKED_ERROR } from './cloudAccessErrors'
import { writeSettingsFile } from './settingsFile'
import {
  KEY_BYTES,
  DEFAULT_KDF_ITERATIONS,
  toB64Url,
  fromB64Url,
  generateDek,
  generateKdfSalt,
  generateRecoveryCode,
  looksLikeRecoveryCode,
  deriveKek,
  deriveRecoveryKek,
  wrapKey,
  unwrapKey,
} from './cloudCrypto'

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * 'unlocked' — DEK in memory, sync can encrypt/decrypt.
 * 'locked'   — no DEK in memory (keys may exist server-side, or presence unknown).
 * 'no-keys'  — confirmed that the account has no user_keys row yet (setup needed).
 */
export type CloudKeysState = 'unlocked' | 'locked' | 'no-keys'

/**
 * Encryption mode of the account's user_keys row; null = no row or not known
 * yet this session. Persisted (it is not secret) in settings.cloudSync.keysMode
 * once learned, so a managed device shows the silent auto-unlock spinner — not
 * a passphrase form — from the very first status snapshot after boot.
 */
export type CloudKeysMode = 'managed' | 'e2ee' | null

export interface CloudKeysOpResult {
  ok: boolean
  error?: string
}

/**
 * Machine-readable failure of upgradeCloudKeysToE2ee that the renderer
 * localizes. 'already-e2ee' — the account was already switched to private mode
 * (typically from another device while this one still believed it was managed);
 * nothing was rewritten and no recovery code was issued.
 */
export type CloudUpgradeErrorCode = 'already-e2ee'

// E2EE columns are nullable since migration 0005 (a managed row doesn't have
// them); the mode CHECK guarantees they are all present when mode = 'e2ee'.
interface UserKeysRow {
  mode: 'managed' | 'e2ee'
  dek_pass_ct: string | null
  pass_salt: string | null
  pass_iterations: number | null
  dek_recovery_ct: string | null
  recovery_salt: string | null
  recovery_iterations: number | null
}

// ── Settings helpers (same idiom as account.ts / githubSync.ts) ───────────────

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  writeSettingsFile(getSettingsPath(), data) // owner-only (0600) on POSIX
}

// Merges a patch into the cloudSync section without clobbering fields owned by
// cloudSync.ts (enabled/lastSync/pullSeq) — both modules read-modify-write
// the same settings.json section.
function patchCloudSection(patch: Record<string, unknown>): void {
  const settings = readSettings()
  const section = (settings.cloudSync as Record<string, unknown>) ?? {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete section[key]
    else section[key] = value
  }
  settings.cloudSync = section
  writeSettings(settings)
}

// ── Supabase REST helper (shared with cloudSync.ts) ───────────────────────────

export interface SupabaseRestResponse {
  status: number
  json: unknown
}

/**
 * Authenticated PostgREST request with a FRESH access token per call (GoTrue
 * tokens expire in ~1h — never cache them as if they were API keys). Throws on
 * network/timeout errors, or a reason-tagged error (cloudAccessErrors.ts) when
 * no token can be obtained: signed out, account service unreachable, or a
 * keychain-locked session.
 */
export async function supabaseRest(
  endpoint: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<SupabaseRestResponse> {
  const tokenResult = await account.getAccessTokenResult()
  if (!tokenResult.ok) throw accessTokenError(tokenResult.reason)
  const token = tokenResult.token
  const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // 201/204 with empty body — fine
  }
  return { status: res.status, json }
}

// ── Module state ──────────────────────────────────────────────────────────────

// The DEK — main-process memory only.
let dek: Uint8Array | null = null

// Whether the account has a user_keys row: null = not checked yet this session.
let remoteKeysKnown: boolean | null = null

// Encryption mode of the account's keys (see CloudKeysMode).
let keysMode: CloudKeysMode = null

const NOT_SIGNED_IN_ERROR = 'Sign in to your NoteFlow account first.'
const NETWORK_ERROR = 'Could not reach the NoteFlow Cloud service. Check your connection and try again.'
const ALREADY_E2EE_ERROR = 'This account already uses private end-to-end encryption.'

/** Message for an access-token failure (isAccessTokenError): signed out ≠ offline ≠ keychain locked. */
function accessTokenErrorMessage(err: unknown): string {
  return cloudAccessErrorMessage(err, {
    notSignedIn: NOT_SIGNED_IN_ERROR,
    unreachable: NETWORK_ERROR,
    locked: CLOUD_SESSION_LOCKED_ERROR,
  }) ?? NETWORK_ERROR
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getKeysState(): CloudKeysState {
  if (dek) return 'unlocked'
  if (remoteKeysKnown === false) return 'no-keys'
  return 'locked'
}

export function getKeysMode(): CloudKeysMode {
  return keysMode
}

/** The raw DEK for cloudSync.ts (main-process only — NEVER expose over IPC). */
export function getDek(): Uint8Array | null {
  return dek
}

// Remembers the mode across boots (it is public info, unlike the DEK). Devices
// set up before the dual-mode feature simply have no value → null until the
// next unlock backfills it.
function setKeysMode(mode: CloudKeysMode): void {
  if (keysMode === mode) return
  keysMode = mode
  patchCloudSection({ keysMode: mode ?? undefined })
}

/**
 * App-startup hook: restores the persisted keys mode and the DEK from the
 * safeStorage cache (if present and decryptable) so an already-set-up device
 * boots unlocked. Managed devices without a usable cache are unlocked shortly
 * after by autoUnlockManaged (wired in main.ts) — never by asking the user.
 */
export function initCloudKeys(): void {
  const section = (readSettings().cloudSync as Record<string, unknown>) ?? {}
  if (section.keysMode === 'managed' || section.keysMode === 'e2ee') {
    keysMode = section.keysMode
  }
  const cached = section.encryptedDek
  if (typeof cached !== 'string' || !cached) return
  try {
    const raw = fromB64Url(decryptSecret(cached))
    if (raw.length !== KEY_BYTES) throw new Error(`cached DEK has ${raw.length} bytes`)
    dek = raw
    remoteKeysKnown = true // a cached DEK implies setup/unlock succeeded before
  } catch (err: unknown) {
    // Keyring changed or value corrupted — drop the cache; the user re-unlocks
    // (managed re-unlocks silently from the server).
    console.error('[CloudKeys] failed to restore cached DEK:', String(err))
    patchCloudSection({ encryptedDek: undefined })
  }
}

function cacheDek(): void {
  if (!dek) return
  // safeStorage ONLY — never write the master key with the base64 fallback.
  // In managed mode a missing safeStorage is harmless: autoUnlockManaged just
  // re-fetches the DEK from the server on the next boot.
  if (!safeStorage.isEncryptionAvailable()) return
  try {
    patchCloudSection({ encryptedDek: encryptSecret(toB64Url(dek)) })
  } catch (err: unknown) {
    console.error('[CloudKeys] failed to cache DEK:', String(err))
  }
}

// ── cloud-keys Edge Function client (managed mode) ────────────────────────────

interface CloudKeysFnResponse {
  status: number
  json: unknown
}

/** POST to the cloud-keys Edge Function with a fresh access token (ai-proxy caller pattern). */
async function callCloudKeysFn(route: 'setup' | 'unlock' | 'downgrade', body?: unknown): Promise<CloudKeysFnResponse> {
  const tokenResult = await account.getAccessTokenResult()
  if (!tokenResult.ok) throw accessTokenError(tokenResult.reason)
  const token = tokenResult.token
  const res = await fetch(`${CLOUD_KEYS_URL}/${route}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // empty body — fine
  }
  return { status: res.status, json }
}

/** Server error message from the cloud-keys {error: {message, code}} shape. */
function fnErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === 'object') {
    const error = (json as Record<string, unknown>).error
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message
      if (typeof message === 'string' && message) return message
    }
  }
  return fallback
}

/**
 * First-time Cloud setup in MANAGED (standard) mode — the default: generates
 * the DEK client-side (same generator as e2ee) and deposits it in the
 * cloud-keys Edge Function, which wraps it with the operator key and inserts
 * the user_keys row. No passphrase, no recovery code — nothing to remember.
 */
export async function setupCloudKeysManaged(): Promise<CloudKeysOpResult> {
  if (!isCloudConfigured()) return { ok: false, error: 'NoteFlow Cloud is not available in this build.' }
  try {
    const newDek = generateDek()
    const res = await callCloudKeysFn('setup', { dek: toB64Url(newDek) })
    if (res.status === 409) {
      remoteKeysKnown = true
      return { ok: false, error: 'Cloud keys already exist for this account.' }
    }
    if (res.status >= 400) {
      return { ok: false, error: fnErrorMessage(res.json, `Could not set up NoteFlow Cloud (HTTP ${res.status}).`) }
    }
    dek = newDek
    remoteKeysKnown = true
    setKeysMode('managed')
    cacheDek()
    return { ok: true }
  } catch (err: unknown) {
    if (isAccessTokenError(err)) return { ok: false, error: accessTokenErrorMessage(err) }
    console.error('[CloudKeys] managed setup failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }
}

// Single-flight: boot hook, sign-in transitions, the autosync tick and the
// Settings panel may all ask at once.
let autoUnlockInFlight: Promise<boolean> | null = null

/**
 * Silent unlock for MANAGED accounts: fetches the DEK from the cloud-keys
 * Edge Function when there is a session and no DEK in memory. A 404 marks the
 * account as no-keys; a 409 marks it as e2ee (that unlock is local and user-
 * driven); network errors leave the state untouched (callers retry on their
 * next tick). Resolves true when the public keys state/mode changed. Never
 * throws and never prompts — a signed-in managed user must never see an
 * unlock screen.
 */
export function autoUnlockManaged(): Promise<boolean> {
  if (autoUnlockInFlight) return autoUnlockInFlight
  autoUnlockInFlight = doAutoUnlockManaged().finally(() => { autoUnlockInFlight = null })
  return autoUnlockInFlight
}

async function doAutoUnlockManaged(): Promise<boolean> {
  if (!isCloudConfigured()) return false
  if (dek) return false
  if (keysMode === 'e2ee') return false // passphrase unlock — user-driven
  if (remoteKeysKnown === false) return false // confirmed no-keys — setup needed
  if (!account.getAccountStatus().signedIn) return false

  try {
    const res = await callCloudKeysFn('unlock')
    // Read the public state through the getters: the guards above narrowed the
    // raw variables, but they may have been mutated during the await (e.g. an
    // e2ee unlock or a setup finishing), and getters escape TS's narrowing.
    if (res.status === 404) {
      const changed = getKeysState() !== 'no-keys' || getKeysMode() !== null
      remoteKeysKnown = false
      setKeysMode(null)
      return changed
    }
    if (res.status === 409) {
      // The row exists but is e2ee — record it so the UI shows the passphrase
      // form instead of the auto-unlock spinner.
      const changed = getKeysMode() !== 'e2ee'
      remoteKeysKnown = true
      setKeysMode('e2ee')
      return changed
    }
    if (res.status >= 400) {
      console.error(`[CloudKeys] managed auto-unlock failed (HTTP ${res.status})`)
      return false
    }
    const rawDek = (res.json as { dek?: unknown } | null)?.dek
    if (typeof rawDek !== 'string' || !rawDek) throw new Error('unlock response carried no dek')
    const bytes = fromB64Url(rawDek)
    if (bytes.length !== KEY_BYTES) throw new Error(`unlocked DEK has ${bytes.length} bytes`)
    dek = bytes
    remoteKeysKnown = true
    setKeysMode('managed')
    cacheDek()
    return true
  } catch (err: unknown) {
    // Offline / expired session — stay locked; callers retry silently.
    if (!isAccessTokenError(err)) {
      console.error('[CloudKeys] managed auto-unlock failed:', String(err))
    }
    return false
  }
}

/**
 * Best-effort re-read of the account's encryption mode (GET user_keys?select=mode).
 * An unlocked device never asks the server again (autoUnlockManaged returns
 * early with a DEK in memory), so it would otherwise keep showing — and acting
 * on — a mode another device has since switched. Called when the Cloud panel
 * opens. A missing row is recorded the same way as the cloud-keys 404 (no-keys,
 * mode null). Resolves true when the public keys state/mode changed; never
 * throws (offline / signed out / HTTP errors leave the state untouched).
 */
export async function refreshKeysMode(): Promise<boolean> {
  if (!isCloudConfigured()) return false
  if (!account.getAccountStatus().signedIn) return false
  try {
    const res = await supabaseRest('/rest/v1/user_keys?select=mode')
    if (res.status >= 400) return false
    const rows = Array.isArray(res.json) ? (res.json as Array<{ mode?: unknown }>) : []
    const stateBefore = getKeysState()
    const modeBefore = getKeysMode()
    if (rows.length === 0) {
      remoteKeysKnown = false
      setKeysMode(null)
    } else {
      remoteKeysKnown = true
      setKeysMode(rows[0].mode === 'managed' ? 'managed' : 'e2ee')
    }
    return getKeysState() !== stateBefore || getKeysMode() !== modeBefore
  } catch (err: unknown) {
    if (!isAccessTokenError(err)) {
      console.error('[CloudKeys] keys mode refresh failed:', String(err))
    }
    return false
  }
}

/**
 * Upgrade managed → e2ee (private mode): wraps the CURRENT DEK with a new
 * passphrase KEK + a new recovery KEK and rewrites the user_keys row via
 * PostgREST (ownership RLS allows it), clearing dek_managed_ct. The DEK does
 * NOT change, so no file blob is re-encrypted — which also means notes synced
 * while in managed mode were potentially readable by the operator until now
 * (documented trade-off; DEK rotation would mean a full re-upload keyed by the
 * HMAC path_key and is out of scope). Returns the recovery code ONCE.
 * The reverse switch exists too (downgradeCloudKeysToManaged) — both are
 * explicit, user-confirmed operations.
 *
 * The PATCH is conditional on the row still being managed (mode=eq.managed):
 * a device with a stale keysMode must never rewrap over a row another device
 * already upgraded — that would silently invalidate the passphrase and the
 * recovery code the user saved there. Zero rows updated ⇒ errorCode
 * 'already-e2ee' (no recovery code; the session stays unlocked because the DEK
 * is the same in both modes).
 */
export async function upgradeCloudKeysToE2ee(
  passphrase: string
): Promise<CloudKeysOpResult & { recoveryCode?: string; errorCode?: CloudUpgradeErrorCode }> {
  if (!isCloudConfigured()) return { ok: false, error: 'NoteFlow Cloud is not available in this build.' }
  if (passphrase.length < 8) return { ok: false, error: 'The passphrase must be at least 8 characters long.' }
  if (!dek) return { ok: false, error: 'Cloud keys are locked. Try again in a moment.' }
  if (keysMode === 'e2ee') {
    return { ok: false, error: ALREADY_E2EE_ERROR, errorCode: 'already-e2ee' }
  }
  if (keysMode !== 'managed') {
    return { ok: false, error: 'The encryption mode of this account is not known yet. Try again in a moment.' }
  }

  try {
    const userId = account.getUserId()
    if (!userId) return { ok: false, error: NOT_SIGNED_IN_ERROR }

    const recoveryCode = generateRecoveryCode()
    const passSalt = generateKdfSalt()
    const recoverySalt = generateKdfSalt()
    const passKek = await deriveKek(passphrase, passSalt, DEFAULT_KDF_ITERATIONS)
    const recoveryKek = await deriveRecoveryKek(recoveryCode, recoverySalt, DEFAULT_KDF_ITERATIONS)

    // Conditional on mode=eq.managed (compare-and-swap): with
    // return=representation PostgREST answers the rows it actually updated, so
    // an empty array means the row was no longer managed. select=mode keeps the
    // fresh wrapped keys out of the response body.
    const res = await supabaseRest(
      `/rest/v1/user_keys?user_id=eq.${encodeURIComponent(userId)}&mode=eq.managed&select=mode`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: {
          mode: 'e2ee',
          dek_managed_ct: null,
          dek_pass_ct: await wrapKey(dek, passKek),
          pass_salt: toB64Url(passSalt),
          pass_iterations: DEFAULT_KDF_ITERATIONS,
          dek_recovery_ct: await wrapKey(dek, recoveryKek),
          recovery_salt: toB64Url(recoverySalt),
          recovery_iterations: DEFAULT_KDF_ITERATIONS,
          updated_at: new Date().toISOString(),
        },
      }
    )
    if (res.status >= 400) {
      return { ok: false, error: `Could not switch to private mode (HTTP ${res.status}).` }
    }
    if (!Array.isArray(res.json) || res.json.length === 0) {
      // Another device already switched the account to private mode. Record it
      // (the panel then shows the e2ee controls) and drop the recovery code we
      // generated — it wraps nothing on the server and must never be shown.
      remoteKeysKnown = true
      setKeysMode('e2ee')
      return { ok: false, error: ALREADY_E2EE_ERROR, errorCode: 'already-e2ee' }
    }

    setKeysMode('e2ee')
    return { ok: true, recoveryCode }
  } catch (err: unknown) {
    if (isAccessTokenError(err)) return { ok: false, error: accessTokenErrorMessage(err) }
    console.error('[CloudKeys] upgrade to e2ee failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }
}

/**
 * Downgrade e2ee → managed (standard mode) — explicit and user-confirmed in
 * the UI, never silent: deposits the CURRENT in-memory DEK in the cloud-keys
 * Edge Function (same trust as the managed setup), which wraps it with the
 * operator key and rewrites the row (mode 'managed', every passphrase/recovery
 * column nulled — the old passphrase and recovery code STOP working; unlocking
 * becomes session-automatic). The DEK does NOT change, so no file blob is
 * re-encrypted; from now on the operator could technically read the notes
 * (the honest managed trade-off, warned about before confirming).
 * Requires the keys to be unlocked.
 */
export async function downgradeCloudKeysToManaged(): Promise<CloudKeysOpResult> {
  if (!isCloudConfigured()) return { ok: false, error: 'NoteFlow Cloud is not available in this build.' }
  if (!dek) return { ok: false, error: 'Cloud keys are locked. Try again in a moment.' }
  if (keysMode !== 'e2ee') {
    return { ok: false, error: 'This account already uses standard encryption.' }
  }

  try {
    const res = await callCloudKeysFn('downgrade', { dek: toB64Url(dek) })
    if (res.status >= 400) {
      return { ok: false, error: fnErrorMessage(res.json, `Could not switch to standard mode (HTTP ${res.status}).`) }
    }
    setKeysMode('managed')
    cacheDek() // the DEK is unchanged; refresh the cache in case it was missing
    return { ok: true }
  } catch (err: unknown) {
    if (isAccessTokenError(err)) return { ok: false, error: accessTokenErrorMessage(err) }
    console.error('[CloudKeys] downgrade to managed failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }
}

/**
 * First-time Cloud setup in E2EE (private) mode: generates the DEK + recovery
 * code, wraps the DEK with the passphrase KEK and the recovery KEK, and
 * uploads the user_keys row. Returns the recovery code — shown ONCE to the
 * user, never persisted.
 */
export async function setupCloudKeys(
  passphrase: string
): Promise<CloudKeysOpResult & { recoveryCode?: string }> {
  if (!isCloudConfigured()) return { ok: false, error: 'NoteFlow Cloud is not available in this build.' }
  if (passphrase.length < 8) return { ok: false, error: 'The passphrase must be at least 8 characters long.' }

  try {
    // Refuse to overwrite existing keys — replacing the DEK would orphan every
    // row already encrypted with it. (Key rotation is a future, explicit flow.)
    const existing = await supabaseRest('/rest/v1/user_keys?select=user_id')
    if (existing.status >= 400) {
      return { ok: false, error: `Could not check existing cloud keys (HTTP ${existing.status}).` }
    }
    if (Array.isArray(existing.json) && existing.json.length > 0) {
      remoteKeysKnown = true
      return { ok: false, error: 'Cloud keys already exist for this account. Unlock them with your passphrase instead.' }
    }

    const userId = account.getUserId()
    if (!userId) return { ok: false, error: NOT_SIGNED_IN_ERROR }

    const newDek = generateDek()
    const recoveryCode = generateRecoveryCode()
    const passSalt = generateKdfSalt()
    const recoverySalt = generateKdfSalt()
    const passKek = await deriveKek(passphrase, passSalt, DEFAULT_KDF_ITERATIONS)
    const recoveryKek = await deriveRecoveryKek(recoveryCode, recoverySalt, DEFAULT_KDF_ITERATIONS)

    const res = await supabaseRest('/rest/v1/user_keys', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        user_id: userId,
        mode: 'e2ee',
        dek_pass_ct: await wrapKey(newDek, passKek),
        pass_salt: toB64Url(passSalt),
        pass_iterations: DEFAULT_KDF_ITERATIONS,
        dek_recovery_ct: await wrapKey(newDek, recoveryKek),
        recovery_salt: toB64Url(recoverySalt),
        recovery_iterations: DEFAULT_KDF_ITERATIONS,
      },
    })
    if (res.status >= 400) {
      return { ok: false, error: `Could not store the cloud keys (HTTP ${res.status}).` }
    }

    dek = newDek
    remoteKeysKnown = true
    setKeysMode('e2ee')
    cacheDek()
    return { ok: true, recoveryCode }
  } catch (err: unknown) {
    if (isAccessTokenError(err)) return { ok: false, error: accessTokenErrorMessage(err) }
    console.error('[CloudKeys] setup failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }
}

/**
 * Unlocks an E2EE key session: downloads user_keys and unwraps the DEK with
 * the given secret — tried as passphrase first, then as recovery code when it
 * has the exact shape of one (30 normalized chars; checked BEFORE deriving so
 * a mistyped passphrase gets a clear error instead of a silent KDF mismatch).
 * Fails with a clear message on managed rows (their unlock is automatic).
 */
export async function unlockCloudKeys(secret: string): Promise<CloudKeysOpResult> {
  if (!isCloudConfigured()) return { ok: false, error: 'NoteFlow Cloud is not available in this build.' }
  if (!secret) return { ok: false, error: 'Enter your passphrase or recovery code.' }

  let row: UserKeysRow
  try {
    const res = await supabaseRest(
      '/rest/v1/user_keys?select=mode,dek_pass_ct,pass_salt,pass_iterations,dek_recovery_ct,recovery_salt,recovery_iterations'
    )
    if (res.status >= 400) {
      return { ok: false, error: `Could not load the cloud keys (HTTP ${res.status}).` }
    }
    const rows = Array.isArray(res.json) ? (res.json as UserKeysRow[]) : []
    if (rows.length === 0) {
      remoteKeysKnown = false
      setKeysMode(null)
      return { ok: false, error: 'No cloud keys exist for this account yet. Set up NoteFlow Cloud first.' }
    }
    remoteKeysKnown = true
    row = rows[0]
    setKeysMode(row.mode === 'managed' ? 'managed' : 'e2ee') // backfills pre-0005 devices
  } catch (err: unknown) {
    if (isAccessTokenError(err)) return { ok: false, error: accessTokenErrorMessage(err) }
    console.error('[CloudKeys] unlock fetch failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }

  if (row.mode === 'managed' || !row.dek_pass_ct || !row.pass_salt || !row.pass_iterations) {
    return {
      ok: false,
      error: 'This account uses standard encryption — there is no passphrase; unlocking happens automatically.',
    }
  }

  // 1) As passphrase.
  try {
    const kek = await deriveKek(secret, fromB64Url(row.pass_salt), row.pass_iterations)
    dek = await unwrapKey(row.dek_pass_ct, kek)
    cacheDek()
    return { ok: true }
  } catch {
    // wrong passphrase — maybe it's the recovery code
  }

  // 2) As recovery code — only when it actually has the shape of one.
  if (looksLikeRecoveryCode(secret) && row.dek_recovery_ct && row.recovery_salt && row.recovery_iterations) {
    try {
      const kek = await deriveRecoveryKek(secret, fromB64Url(row.recovery_salt), row.recovery_iterations)
      dek = await unwrapKey(row.dek_recovery_ct, kek)
      cacheDek()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Incorrect passphrase or recovery code.' }
    }
  }

  return { ok: false, error: 'Incorrect passphrase.' }
}

/**
 * Drops the in-memory DEK and the safeStorage cache. Sync gates itself off.
 * The persisted keysMode is kept (it is not secret and drives the locked UI).
 * Meaningful for e2ee only — a signed-in managed session re-unlocks silently,
 * which is why the UI doesn't offer Lock in managed mode.
 */
export function lockCloudKeys(): void {
  dek = null
  patchCloudSection({ encryptedDek: undefined })
}

/**
 * Sign-out teardown (main.ts / accountTransition.ts): everything this module
 * knows is scoped to ONE account, so it all goes — the DEK and its cache (this
 * machine must no longer be able to decrypt the notes), plus the two pieces of
 * learned session state, `remoteKeysKnown` and `keysMode`, INCLUDING the
 * persisted keysMode. Keeping them would poison the next account signing in on
 * this machine, and a restart would NOT heal it (keysMode lives in
 * settings.cloudSync): an account whose keys are managed, landing on a device
 * left in 'e2ee', would be stuck forever on a passphrase form that
 * autoUnlockManaged refuses to bypass and unlockCloudKeys refuses to accept;
 * a stale `remoteKeysKnown === false` would push it into a setup form that ends
 * in a 409. Both are re-learned in one round-trip by the next auto-unlock.
 */
export function resetCloudKeysSession(): void {
  dek = null
  remoteKeysKnown = null
  keysMode = null
  patchCloudSection({ encryptedDek: undefined, keysMode: undefined })
}
