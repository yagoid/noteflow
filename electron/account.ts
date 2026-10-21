// NoteFlow account (Supabase Auth + entitlements) — main-process session layer.
//
// Structural mirror of githubSync.ts: settings persisted under a section of
// settings.json with the secret encrypted via safeStorage (base64 fallback),
// module-level state, a public status object for the renderer, and an
// onStatusChanged callback that main.ts wires to a broadcast.
//
// Auth is Supabase GoTrue over plain REST (no @supabase/supabase-js dep):
//   POST /auth/v1/otp                          → email a one-time code (8 digits)
//   POST /auth/v1/verify                       → code → session (access+refresh)
//   POST /auth/v1/token?grant_type=refresh_token → rotate session
//   POST /auth/v1/logout?scope=local           → revoke THIS session only
//                                                (best-effort; the default scope
//                                                would sign out every device and
//                                                the CLI too)
// Entitlements come from PostgREST: GET /rest/v1/subscriptions (RLS-scoped).
//
// Security model: the refresh token is encrypted at rest and NEVER crosses to
// the renderer; the access token lives only in main-process memory. The
// renderer sees exclusively the public status {configured, signedIn, email,
// entitlements, entitlementsKnown, entitlementsFetchedAt, sessionLocked, …}.
//
// Resilience (see entitlementsRetry.ts for the pure parts):
//   - Entitlements are UNKNOWN until fetched (entitlementsKnown=false) — never
//     "not entitled". The last good answer is cached in settings.json →
//     account.entitlementsCache (not secret) so a restart is known from t=0.
//   - Transient fetch failures are retried with backoff, immediately on
//     powerMonitor 'resume', and on an offline→online flip of net.isOnline().
//   - A refresh token that can't be DECRYPTED (keychain locked: Linux before the
//     keyring unlocks, a denied macOS Keychain prompt) is NOT a sign-out: the
//     blob stays on disk and the session is flagged `sessionLocked` until a
//     later decrypt succeeds.
//   - `sessionGeneration` is bumped on every sign-out/sign-in so a network
//     call that started under a previous session can never write its result
//     (rotated token, entitlements) into the current one.

import { app, net, powerMonitor } from 'electron'
import fs from 'fs'
import path from 'path'
import { encryptSecret, decryptSecret } from './ai/llm/secret'
import { SUPABASE_URL, SUPABASE_ANON_KEY, LEMONSQUEEZY_CHECKOUT_URLS, isCloudConfigured } from './cloudConfig'
import { computeEntitlements, Entitlements, NO_ENTITLEMENTS, SubscriptionRow } from './entitlements'
import {
  entitlementsRetryDelayMs,
  isRetryableEntitlementsFailure,
  parseEntitlementsCache,
  type EntitlementsCache,
} from './entitlementsRetry'
import { writeSettingsFile } from './settingsFile'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountSettings {
  email?: string
  userId?: string
  encryptedRefreshToken?: string  // safeStorage-encrypted (base64 fallback), like githubSync's PAT
  /** Last successfully fetched entitlements (not secret), valid only for `userId`. */
  entitlementsCache?: EntitlementsCache
}

export interface AccountStatus {
  configured: boolean
  signedIn: boolean
  email?: string
  entitlements: Entitlements
  /**
   * False until entitlements have been fetched (or restored from the on-disk
   * cache) for this session. While false, `entitlements` is a placeholder and
   * means UNKNOWN — consumers must not treat it as "not entitled".
   */
  entitlementsKnown: boolean
  entitlementsFetchedAt?: string  // ISO — when entitlements were last fetched from the server (or the cached time)
  /**
   * The session exists on disk but its refresh token can't be decrypted right
   * now (system keychain locked). Still signedIn — retried automatically.
   */
  sessionLocked: boolean
  /** True when this build ships a Lemon Squeezy checkout URL for NoteFlow AI (gates the Subscribe button). */
  aiCheckoutConfigured: boolean
  /** Same, for the NoteFlow Cloud product (gates the Subscribe button in the Cloud panel). */
  cloudCheckoutConfigured: boolean
  /** Same, for the NoteFlow Bundle (AI + Cloud) product. */
  bundleCheckoutConfigured: boolean
}

/**
 * Machine-readable reason for a failed account operation, so the renderer can
 * show a localized message instead of the raw English string from GoTrue.
 *
 * MIRROR: `AccountErrorCode` in `src/types/index.ts` (the renderer can't import
 * from `electron/`) and one i18n entry per code under `settings.account.errors`.
 *
 * Note there is no separate `expiredCode`: GoTrue answers a wrong code and an
 * expired one with the very same payload (`otp_expired` / "Token has expired or
 * is invalid"), so `invalidCode` covers both and the UI offers "Resend code".
 */
export type AccountErrorCode =
  | 'notConfigured'      // this build ships no Supabase project
  | 'invalidEmail'       // client-side check before calling GoTrue
  | 'emptyCode'          // client-side check before calling GoTrue
  | 'invalidCode'        // wrong or expired one-time code
  | 'rateLimited'        // HTTP 429 (too many codes requested / attempts)
  | 'network'            // fetch threw (offline, DNS, timeout)
  | 'unexpectedResponse' // 2xx whose body isn't a usable session
  | 'sendFailed'         // any other failure while emailing the code
  | 'verifyFailed'       // any other failure while verifying the code
  | 'notSignedIn'        // the operation needs a session and there is none
  | 'refreshFailed'      // subscriptions query or token refresh failed server-side
  | 'sessionLocked'      // the saved session can't be decrypted right now (keychain locked)
  | 'checkoutUnavailable'// no checkout URL for that product in this build
  | 'checkoutInvalidUrl' // the configured checkout URL didn't parse

export interface AccountOpResult {
  ok: boolean
  /** English fallback (logs, and builds whose UI has no copy for the code yet). */
  error?: string
  /** Preferred by the UI: localized through i18n. */
  errorCode?: AccountErrorCode
}

export type RefreshEntitlementsResult = AccountOpResult & { entitlements: Entitlements }

/** Why no access token could be produced — the internal, discriminated form. */
export type AccessTokenFailure = 'noSession' | 'network' | 'server' | 'locked'
export type AccessTokenResult = { ok: true; token: string } | { ok: false; reason: AccessTokenFailure }

// ── Settings helpers (same idiom as githubSync) ───────────────────────────────

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

// ── Module state ──────────────────────────────────────────────────────────────

let accountSettings: AccountSettings | null = null

// Access token lives ONLY in memory (GoTrue access tokens expire in ~1h; the
// persisted refresh token mints new ones on demand).
let accessToken: string | null = null
let accessTokenExpiresAtMs = 0

let entitlements: Entitlements = NO_ENTITLEMENTS
let entitlementsFetchedAt: string | undefined
// UNKNOWN until fetched or restored from the cache — see AccountStatus.
let entitlementsKnown = false
// True while the known entitlements come from the on-disk cache rather than a
// fetch made in this run (main.ts keeps the AI auto-switch baseline off it).
let entitlementsFromCache = false

// Refresh token on disk but undecryptable right now (keychain locked) — I1.
let sessionLocked = false

// Bumped by every sign-out (clearSession) and sign-in (verifyOtp). Anything that
// awaits the network captures it first and drops its result if it changed.
let sessionGeneration = 0

// A rotated refresh token (or the entitlements cache) that couldn't be written
// to settings.json yet. The in-memory accountSettings is then the ONLY copy of
// the live refresh token — never replaced by a re-read of the stale disk copy.
let pendingPersist = false
// Same, for a sign-out whose removal of the `account` section failed: without a
// retry an offline/locked-file sign-out would come back after a restart.
let pendingClear = false
let persistRetryTimer: ReturnType<typeof setInterval> | null = null
const PERSIST_ATTEMPTS = 3
const PERSIST_RETRY_MS = 30_000

let statusListener: (() => void) | null = null

// Single-flight guard: GoTrue ROTATES the refresh token on every use, so two
// concurrent refreshes would race — the loser would persist an already-consumed
// token and sign the user out.
let refreshInFlight: Promise<AccessTokenResult> | null = null

// Single-flight for the entitlements fetch (boot timer, retry timer, resume,
// online flip and the Refresh button can all fire close together). Keyed by the
// session generation: a new sign-in must never join a fetch of the old session.
let entitlementsInFlight: Promise<RefreshEntitlementsResult> | null = null
let entitlementsInFlightGeneration = -1

// Backoff state for transient entitlements failures.
let retryAttempt = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
// Electron's main process has no 'online' event: while a retry is pending we
// poll net.isOnline() and retry at once on an offline→online flip.
let onlinePollTimer: ReturnType<typeof setInterval> | null = null
let lastOnline = true
const ONLINE_POLL_MS = 10_000
let powerHooksInstalled = false

const NOT_CONFIGURED_ERROR = 'NoteFlow account services are not available in this build.'
const NETWORK_ERROR = 'Could not reach the NoteFlow account service. Check your connection and try again.'
const SESSION_LOCKED_ERROR = "Couldn't unlock your saved session. Your system keychain may be locked."

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface SupabaseResponse {
  status: number
  json: unknown
}

/** JSON request against the Supabase project. Throws only on network/timeout errors. */
async function supabaseRequest(
  endpoint: string,
  opts: { method?: string; body?: unknown; accessToken?: string } = {}
): Promise<SupabaseResponse> {
  const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // 204 / empty body — fine
  }
  return { status: res.status, json }
}

/** Extracts a human-readable message from a GoTrue/PostgREST error payload. */
function extractErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    for (const key of ['msg', 'message', 'error_description', 'error']) {
      if (typeof o[key] === 'string' && o[key]) return o[key] as string
    }
  }
  return fallback
}

/** GoTrue's machine-readable reason (`error_code`), when the payload carries one. */
function extractErrorCode(json: unknown): string {
  if (json && typeof json === 'object') {
    const raw = (json as Record<string, unknown>).error_code
    if (typeof raw === 'string') return raw
  }
  return ''
}

// ── Session persistence ───────────────────────────────────────────────────────

export function loadAccountSettings(): AccountSettings {
  // The disk copy is stale while a write is pending (it may hold an already
  // consumed refresh token, or a session that was signed out) — memory wins.
  if ((pendingPersist || pendingClear) && accountSettings) return accountSettings
  const settings = readSettings()
  accountSettings = (settings.account as AccountSettings) ?? {}
  applyEntitlementsCache()
  return accountSettings
}

/** Seeds the in-memory entitlements from the on-disk cache, if it belongs to the stored session. */
function applyEntitlementsCache(): void {
  if (entitlementsKnown) return // a fetch from this run is fresher than anything on disk
  const cached = parseEntitlementsCache(accountSettings?.entitlementsCache, accountSettings?.userId)
  if (!cached) return
  entitlements = cached.entitlements
  entitlementsFetchedAt = cached.fetchedAt
  entitlementsKnown = true
  entitlementsFromCache = true
}

/**
 * Writes the in-memory section to disk — or REMOVES it (`remove`, sign-out) —
 * retrying a few times. Never throws.
 */
function writeAccountToDisk(remove = false): boolean {
  let lastError: unknown
  for (let i = 0; i < PERSIST_ATTEMPTS; i++) {
    try {
      const settings = readSettings()
      if (remove) delete settings.account
      else settings.account = accountSettings ?? {}
      writeSettings(settings)
      return true
    } catch (err: unknown) {
      lastError = err
    }
  }
  console.error(
    `[Account] could not ${remove ? 'remove' : 'write'} the session in settings.json (will retry):`,
    String(lastError)
  )
  return false
}

function stopPersistRetry(): void {
  if (persistRetryTimer) clearInterval(persistRetryTimer)
  persistRetryTimer = null
}

function ensurePersistRetry(): void {
  if (!persistRetryTimer) persistRetryTimer = setInterval(flushPendingPersist, PERSIST_RETRY_MS)
}

function writeOrMarkPending(): void {
  // Writing the current section also supersedes a pending removal: the disk
  // then holds exactly the session in memory (a new sign-in after a failed
  // sign-out write).
  if (writeAccountToDisk()) {
    pendingPersist = false
    pendingClear = false
    stopPersistRetry()
    return
  }
  pendingPersist = true
  pendingClear = false
  ensurePersistRetry()
}

/** Retries a write/removal that failed earlier (every account operation, a timer, app quit). */
function flushPendingPersist(): void {
  if (pendingClear) {
    if (writeAccountToDisk(true)) {
      pendingClear = false
      stopPersistRetry()
    }
  } else if (pendingPersist) {
    writeOrMarkPending()
  }
}

/** Last-chance flush of a pending session write/removal — main.ts calls it on before-quit. */
export function flushAccountPersistence(): void {
  flushPendingPersist()
}

/**
 * Replaces the WHOLE `account` section. Memory is updated first and is the
 * source of truth: a failed disk write is retried later, never reported as a
 * network error (after a rotation the old refresh token is already consumed —
 * dropping the new one would sign the user out). Callers build `next` from the
 * CURRENT accountSettings so the token and the entitlements cache never drop
 * each other.
 */
function persistAccountSettings(next: AccountSettings): void {
  accountSettings = next
  writeOrMarkPending()
}

function cancelEntitlementsRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryAttempt = 0
  if (onlinePollTimer) clearInterval(onlinePollTimer)
  onlinePollTimer = null
}

function clearSession(): void {
  sessionGeneration++
  cancelEntitlementsRetry()
  pendingPersist = false
  accountSettings = {}
  accessToken = null
  accessTokenExpiresAtMs = 0
  entitlements = NO_ENTITLEMENTS
  entitlementsFetchedAt = undefined
  entitlementsKnown = false
  entitlementsFromCache = false
  sessionLocked = false
  // The in-memory session is gone either way. A failed removal is retried
  // (timer, next account operation, before-quit) so the signed-out session
  // can't come back on the next boot.
  if (writeAccountToDisk(true)) {
    pendingClear = false
    stopPersistRetry()
  } else {
    pendingClear = true
    ensurePersistRetry()
  }
}

function notifyStatusChanged(): void {
  statusListener?.()
}

/**
 * Flips the keychain-locked flag. The broadcast is DEFERRED: this runs inside
 * refreshAccessToken before refreshInFlight is assigned, and a synchronous
 * listener (main.ts → autoUnlockManaged → getAccessToken) would otherwise start
 * a second, concurrent refresh — exactly the rotation race single-flight avoids.
 */
function setSessionLocked(locked: boolean): void {
  if (sessionLocked === locked) return
  sessionLocked = locked
  setImmediate(notifyStatusChanged)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function onStatusChanged(cb: () => void): void {
  statusListener = cb
}

export function getAccountStatus(): AccountStatus {
  const s = accountSettings ?? loadAccountSettings()
  const configured = isCloudConfigured()
  const signedIn = configured && !!(s.encryptedRefreshToken && s.userId)
  return {
    configured,
    signedIn,
    email: signedIn ? s.email : undefined,
    entitlements: signedIn ? entitlements : NO_ENTITLEMENTS,
    entitlementsKnown: signedIn && entitlementsKnown,
    entitlementsFetchedAt: signedIn ? entitlementsFetchedAt : undefined,
    sessionLocked: signedIn && sessionLocked,
    aiCheckoutConfigured: LEMONSQUEEZY_CHECKOUT_URLS.ai.length > 0,
    cloudCheckoutConfigured: LEMONSQUEEZY_CHECKOUT_URLS.cloud.length > 0,
    bundleCheckoutConfigured: LEMONSQUEEZY_CHECKOUT_URLS.bundle.length > 0,
  }
}

/**
 * Main-process only: true while the known entitlements are the ones restored
 * from the on-disk cache (no fetch has succeeded yet in this run). main.ts uses
 * it so the cached value never becomes the AI auto-switch baseline.
 */
export function areEntitlementsFromCache(): boolean {
  return entitlementsFromCache
}

/** Supabase user id of the signed-in session (main-process only — used to tag
 *  the Lemon Squeezy checkout; it never crosses to the renderer). */
export function getUserId(): string | null {
  const s = accountSettings ?? loadAccountSettings()
  return s.userId ?? null
}

/** Emails a one-time sign-in code (creates the account on first sign-in). */
export async function requestOtp(email: string): Promise<AccountOpResult> {
  if (!isCloudConfigured()) return { ok: false, error: NOT_CONFIGURED_ERROR, errorCode: 'notConfigured' }
  const trimmed = email.trim()
  if (!trimmed || !trimmed.includes('@')) {
    return { ok: false, error: 'Please enter a valid email address.', errorCode: 'invalidEmail' }
  }

  try {
    const res = await supabaseRequest('/auth/v1/otp', {
      method: 'POST',
      body: { email: trimmed, create_user: true },
    })
    if (res.status >= 400) {
      if (res.status === 429) {
        return { ok: false, error: 'Too many attempts. Please wait a moment and try again.', errorCode: 'rateLimited' }
      }
      return {
        ok: false,
        error: extractErrorMessage(res.json, 'Could not send the sign-in code.'),
        errorCode: 'sendFailed',
      }
    }
    return { ok: true }
  } catch (err: unknown) {
    console.error('[Account] requestOtp failed:', String(err))
    return { ok: false, error: NETWORK_ERROR, errorCode: 'network' }
  }
}

/** Exchanges the emailed code for a session, persists it and fetches entitlements. */
export async function verifyOtp(email: string, code: string): Promise<AccountOpResult> {
  if (!isCloudConfigured()) return { ok: false, error: NOT_CONFIGURED_ERROR, errorCode: 'notConfigured' }
  const trimmedCode = code.trim()
  if (!trimmedCode) return { ok: false, error: 'Please enter the code from your email.', errorCode: 'emptyCode' }

  try {
    const res = await supabaseRequest('/auth/v1/verify', {
      method: 'POST',
      body: { type: 'email', email: email.trim(), token: trimmedCode },
    })
    if (res.status >= 400) {
      if (res.status === 429) {
        return { ok: false, error: 'Too many attempts. Please wait a moment and try again.', errorCode: 'rateLimited' }
      }
      // GoTrue reports both a wrong code and an expired one as
      // "Token has expired or is invalid" (error_code: otp_expired) — one code.
      const raw = extractErrorMessage(res.json, '')
      const rawCode = extractErrorCode(res.json)
      if (rawCode === 'otp_expired' || /expired|invalid/i.test(raw)) {
        return {
          ok: false,
          error: 'That code is invalid or has expired. Request a new one and try again.',
          errorCode: 'invalidCode',
        }
      }
      return { ok: false, error: raw || 'Could not verify the code.', errorCode: 'verifyFailed' }
    }

    const session = res.json as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      user?: { id?: string; email?: string }
    }
    if (!session?.access_token || !session.refresh_token || !session.user?.id) {
      return { ok: false, error: 'Unexpected response from the account service.', errorCode: 'unexpectedResponse' }
    }

    // A new identity: anything still in flight (or scheduled) for a previous
    // session must not land on this one, and its entitlements start UNKNOWN.
    sessionGeneration++
    cancelEntitlementsRetry()
    entitlements = NO_ENTITLEMENTS
    entitlementsFetchedAt = undefined
    entitlementsKnown = false
    entitlementsFromCache = false
    sessionLocked = false

    persistAccountSettings({
      email: session.user.email ?? email.trim(),
      userId: session.user.id,
      encryptedRefreshToken: encryptSecret(session.refresh_token),
    })
    accessToken = session.access_token
    accessTokenExpiresAtMs = Date.now() + (session.expires_in ?? 3600) * 1000

    // First entitlements fetch — best-effort; a failure must not undo the
    // sign-in (a transient one schedules the backoff by itself).
    try {
      await refreshEntitlements()
    } catch { /* refreshEntitlements never throws, but be safe */ }

    notifyStatusChanged()
    return { ok: true }
  } catch (err: unknown) {
    console.error('[Account] verifyOtp failed:', String(err))
    return { ok: false, error: NETWORK_ERROR, errorCode: 'network' }
  }
}

/**
 * Returns a valid access token, refreshing via the persisted refresh token when
 * the in-memory one is missing or expires within 60s — or WHY it can't: no
 * session (none stored, or the refresh token was revoked → session cleared +
 * notified), network, a server error, or a keychain-locked session.
 */
export async function getAccessTokenResult(): Promise<AccessTokenResult> {
  if (!isCloudConfigured()) return { ok: false, reason: 'noSession' }
  flushPendingPersist()
  if (accessToken && accessTokenExpiresAtMs - Date.now() > 60_000) return { ok: true, token: accessToken }

  if (refreshInFlight) return refreshInFlight
  refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null })
  return refreshInFlight
}

/**
 * Drops the in-memory access token after a server rejected it (a 401 from
 * PostgREST or from the NoteFlow AI proxy), so the next getAccessToken mints a
 * fresh one — or cleanly hits the 400/401 sign-out if the refresh token was
 * revoked too — instead of replaying a dead token until it expires locally.
 * With `token`, only that exact token is dropped (a newer one minted meanwhile
 * is kept). The refresh token and the session are untouched.
 */
export function invalidateAccessToken(token?: string): void {
  if (token !== undefined && accessToken !== token) return
  accessToken = null
  accessTokenExpiresAtMs = 0
}

/** Thin wrapper for callers that only care about the token (cloudSync, cloudKeys, llm, realtime). */
export async function getAccessToken(): Promise<string | null> {
  const result = await getAccessTokenResult()
  return result.ok ? result.token : null
}

async function refreshAccessToken(): Promise<AccessTokenResult> {
  const generation = sessionGeneration
  const s = accountSettings ?? loadAccountSettings()
  if (!s.encryptedRefreshToken || !s.userId) return { ok: false, reason: 'noSession' }

  let refreshToken: string
  try {
    refreshToken = decryptSecret(s.encryptedRefreshToken)
  } catch (err: unknown) {
    // safeStorage can fail TEMPORARILY (Linux before the keyring is unlocked, a
    // denied macOS Keychain prompt). Not a sign-out: keep the blob on disk and
    // the session signed in, flag it locked and let the retries try again.
    // Nothing is rotated or persisted while locked.
    console.error('[Account] could not decrypt the refresh token (keychain locked?):', String(err))
    setSessionLocked(true)
    return { ok: false, reason: 'locked' }
  }
  setSessionLocked(false)

  let res: SupabaseResponse
  try {
    res = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    })
  } catch (err: unknown) {
    if (generation !== sessionGeneration) return { ok: false, reason: 'noSession' }
    // Network/timeout — keep the session; a later call will retry.
    console.error('[Account] token refresh network error:', String(err))
    return { ok: false, reason: 'network' }
  }

  // Signed out (or in as someone else) while the request was in flight: the
  // answer belongs to a session that no longer exists — persisting its rotated
  // token would resurrect it. Drop everything.
  if (generation !== sessionGeneration) return { ok: false, reason: 'noSession' }

  if (res.status === 400 || res.status === 401) {
    // Refresh token revoked/expired — the user is effectively signed out.
    console.warn('[Account] refresh token rejected — signing out')
    clearSession()
    notifyStatusChanged()
    return { ok: false, reason: 'noSession' }
  }
  if (res.status >= 400) {
    console.error('[Account] token refresh failed:', extractErrorMessage(res.json, `HTTP ${res.status}`))
    return { ok: false, reason: 'server' } // transient — keep the session, caller can retry later
  }

  const session = res.json as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!session?.access_token) return { ok: false, reason: 'server' }

  accessToken = session.access_token
  accessTokenExpiresAtMs = Date.now() + (session.expires_in ?? 3600) * 1000
  // GoTrue ROTATES the refresh token on every grant — persist the new one or
  // the next refresh would present a consumed token and get signed out. Built
  // from the CURRENT settings (not `s`) so a concurrently written entitlements
  // cache survives; a failed disk write keeps it in memory and retries.
  if (session.refresh_token) {
    let encrypted: string | null = null
    try {
      encrypted = encryptSecret(session.refresh_token)
    } catch (err: unknown) {
      console.error('[Account] could not encrypt the rotated refresh token:', String(err))
    }
    if (encrypted) persistAccountSettings({ ...(accountSettings ?? s), encryptedRefreshToken: encrypted })
  }
  return { ok: true, token: accessToken }
}

/** Revokes THIS session server-side (best-effort) and clears local state. */
export async function signOut(): Promise<AccountOpResult> {
  const token = accessToken // don't mint a fresh token just to revoke it
  if (token) {
    try {
      // scope=local: revoke only this device's session. The default (global)
      // would also sign out every other device and the CLI.
      await supabaseRequest('/auth/v1/logout?scope=local', { method: 'POST', accessToken: token })
    } catch (err: unknown) {
      console.warn('[Account] logout request failed (ignored):', String(err))
    }
  }
  clearSession()
  notifyStatusChanged()
  return { ok: true }
}

// ── Entitlements (fetch + retry) ──────────────────────────────────────────────

const TOKEN_FAILURE_RESULT: Record<AccessTokenFailure, { error: string; errorCode: AccountErrorCode }> = {
  noSession: { error: 'Not signed in.', errorCode: 'notSignedIn' },
  network: { error: NETWORK_ERROR, errorCode: 'network' },
  server: { error: 'Could not refresh the account session.', errorCode: 'refreshFailed' },
  locked: { error: SESSION_LOCKED_ERROR, errorCode: 'sessionLocked' },
}

/**
 * Re-reads the user's subscription rows and re-derives {ai, cloud}. Never
 * throws. A transient failure schedules a retry with backoff; a success resets
 * it, caches the answer on disk and broadcasts.
 */
export function refreshEntitlements(): Promise<RefreshEntitlementsResult> {
  if (entitlementsInFlight && entitlementsInFlightGeneration === sessionGeneration) return entitlementsInFlight
  entitlementsInFlightGeneration = sessionGeneration
  const run = fetchEntitlements().finally(() => {
    if (entitlementsInFlight === run) entitlementsInFlight = null
  })
  entitlementsInFlight = run
  return run
}

async function fetchEntitlements(): Promise<RefreshEntitlementsResult> {
  if (!isCloudConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR, errorCode: 'notConfigured', entitlements: NO_ENTITLEMENTS }
  }
  flushPendingPersist()

  const generation = sessionGeneration
  // The answer of a fetch that started under a previous session is ignored —
  // not applied, not cached, not retried.
  const stale = (): RefreshEntitlementsResult => ({
    ok: false, error: 'Not signed in.', errorCode: 'notSignedIn', entitlements: NO_ENTITLEMENTS,
  })

  const tokenResult = await getAccessTokenResult()
  if (generation !== sessionGeneration) return stale()
  if (!tokenResult.ok) return entitlementsFailure(TOKEN_FAILURE_RESULT[tokenResult.reason])

  let res: SupabaseResponse
  try {
    res = await supabaseRequest('/rest/v1/subscriptions?select=product,status,renews_at', {
      accessToken: tokenResult.token,
    })
  } catch (err: unknown) {
    if (generation !== sessionGeneration) return stale()
    console.error('[Account] refreshEntitlements failed:', String(err))
    return entitlementsFailure({ error: NETWORK_ERROR, errorCode: 'network' })
  }
  if (generation !== sessionGeneration) return stale()

  if (res.status >= 400 || !Array.isArray(res.json)) {
    // A 401 means the in-memory access token is no longer accepted: drop it so
    // the retry mints a fresh one instead of replaying it until it expires.
    if (res.status === 401) invalidateAccessToken(tokenResult.token)
    return entitlementsFailure({
      error: extractErrorMessage(res.json, 'Could not load subscription status.'),
      errorCode: 'refreshFailed',
    })
  }

  entitlements = computeEntitlements(res.json as SubscriptionRow[])
  entitlementsFetchedAt = new Date().toISOString()
  entitlementsKnown = true
  entitlementsFromCache = false
  cancelEntitlementsRetry() // a success resets the backoff
  const current = accountSettings ?? {}
  if (current.userId) {
    persistAccountSettings({
      ...current,
      entitlementsCache: {
        userId: current.userId,
        ai: entitlements.ai,
        cloud: entitlements.cloud,
        fetchedAt: entitlementsFetchedAt,
      },
    })
  }
  notifyStatusChanged()
  return { ok: true, entitlements }
}

function entitlementsFailure(failure: { error: string; errorCode: AccountErrorCode }): RefreshEntitlementsResult {
  if (isRetryableEntitlementsFailure(failure.errorCode)) scheduleEntitlementsRetry()
  else cancelEntitlementsRetry() // nothing will change by waiting (no session / no project)
  return { ok: false, ...failure, entitlements }
}

function scheduleEntitlementsRetry(): void {
  if (!getAccountStatus().signedIn) return
  if (retryTimer) clearTimeout(retryTimer)
  const delay = entitlementsRetryDelayMs(retryAttempt)
  retryAttempt++
  retryTimer = setTimeout(() => {
    retryTimer = null
    void refreshEntitlements()
  }, delay)
  startOnlinePoll()
}

/** Skips the pending backoff wait and retries now, from the shortest delay again. */
function retryEntitlementsNow(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryAttempt = 0
  void refreshEntitlements()
}

function startOnlinePoll(): void {
  if (onlinePollTimer) return
  lastOnline = net.isOnline()
  onlinePollTimer = setInterval(() => {
    const online = net.isOnline()
    const cameBack = online && !lastOnline
    lastOnline = online
    if (cameBack && retryTimer) retryEntitlementsNow()
  }, ONLINE_POLL_MS)
}

/** Resume from sleep: a pending retry (or still-unknown entitlements) is retried at once. */
function installPowerHooks(): void {
  if (powerHooksInstalled) return
  powerHooksInstalled = true
  powerMonitor.on('resume', () => {
    if (!getAccountStatus().signedIn) return
    if (retryTimer || !entitlementsKnown || sessionLocked) retryEntitlementsNow()
  })
}

/**
 * App-startup hook (call after app ready — powerMonitor needs it): loads the
 * persisted session (+ its cached entitlements) and, if there is one, refreshes
 * entitlements in the background. Deferred so it never competes with the boot
 * path (same spirit as the AI worker warmup); a failure enters the backoff.
 */
export function initAccount(): void {
  loadAccountSettings()
  if (!isCloudConfigured()) return
  installPowerHooks()
  if (!getAccountStatus().signedIn) return
  setTimeout(() => {
    refreshEntitlements().catch((err) => {
      console.error('[Account] startup entitlements refresh failed:', String(err))
    })
  }, 5_000)
}
