// NoteFlow Cloud E2EE sync engine (phase 4.2, stage 2) — the paid counterpart
// of githubSync.ts, speaking to the public.files table (migration 0004) via
// PostgREST. Same file-per-relative-path model and the SAME conflict rule (the
// note folder is the unit, note.md's `updated:` decides), so main.ts can route
// through either backend behind the SyncProvider interface (syncProvider.ts).
//
// Deliberate differences vs GitHub Sync (documented in monetization.md § 4):
//   - NO mutation queue: the Contents API serialization invariant is a GitHub
//     workaround — Postgres handles concurrent upserts natively. Writes are
//     direct upserts (Prefer: resolution=merge-duplicates) with a single retry.
//   - Deletions propagate via TOMBSTONES (deleted=true, content_ct blanked),
//     not via absence: the incremental pull can't see "missing" rows, and a
//     tombstone is exactly the "this was deleted" signal absence used to imply.
//     Local deletion still applies the safety rule (local updated <= lastSync).
//   - NO sha cache: the incremental pull (updated_at > cursor, index of
//     migration 0004) already skips unchanged rows without any per-file GET.
//   - The journal of pending remote mutations IS kept (offline durability) —
//     it reuses the pure transitions of syncState.ts, persisted in its own
//     userData/cloud-sync-state.json (never shared with the GitHub journal:
//     the two backends must not replay each other's ops).
//   - Autosync is PUSH-driven (stage 3): a Supabase Realtime subscription
//     (cloudRealtime.ts) signals remote changes and main.ts runs the sync
//     cycle; the CLOUD_AUTO_SYNC_INTERVAL_MS loop stays as a safety net.
//
// E2EE invariants: every row is encrypted with cloudCrypto.ts before leaving
// the process; the DEK comes from cloudKeys.ts (main-process memory only) and
// every push/pull gates on the key session being unlocked.

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import * as account from './account'
import * as cloudKeys from './cloudKeys'
import * as cloudRealtime from './cloudRealtime'
import * as githubSync from './githubSync'
import { supabaseRest } from './cloudKeys'
import { isCloudConfigured } from './cloudConfig'
import { NOTE_MD, listNoteDirs } from './noteFormat'
import { generateNoteKey, derivePathKeyHmac, unwrapKey, decryptContent } from './cloudCrypto'
import {
  CLOUD_METADATA_FILENAMES,
  CloudFileRow,
  CloudPullEntry,
  noteDirOf,
  isAnchorPath,
  isSafeCloudRelPath,
  extractUpdatedTimestamp,
  parseUpdatedTimestamp,
  resolveRowUpdatedAt,
  shouldApplyRemoteDir,
  shouldApplyRemoteDeletion,
  groupEntriesByDir,
  nextPullCursor,
  buildFileUpsertRow,
  decryptFileRow,
} from './cloudSyncLogic'
import {
  type SyncState,
  parseSyncState,
  serializeSyncState,
  journalRecord,
  journalRecordIfAbsent,
  journalComplete,
  journalFail,
  resolveRetryAction,
  shouldPullSkipDir,
  shouldPullSkipFile,
} from './syncState'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Safety-net cadence of the periodic sync loop. Remote changes normally arrive
 * via the Realtime subscription (cloudRealtime.ts) within seconds — this timer
 * only covers a down/undelivered WebSocket and drains the journal of pending
 * local mutations while offline.
 */
export const CLOUD_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000

// Same debounce as the GitHub push: avoids spamming the API while typing.
const PUSH_DEBOUNCE_MS = 5000

// PostgREST caps responses (Supabase default max-rows 1000) — page the pull.
const PULL_PAGE_SIZE = 1000

const LOCKED_ERROR = 'Cloud keys are locked. Unlock NoteFlow Cloud to sync.'
const SUBSCRIPTION_ERROR = 'An active NoteFlow Cloud subscription is required to upload changes.'
const NOT_SIGNED_IN_ERROR = 'Sign in to your NoteFlow account to use NoteFlow Cloud.'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CloudSyncSettings {
  enabled: boolean
  /** Wall-clock time of the last successful pull — deletion-safety rule + UI. */
  lastSync?: string
  /** Watermark of remote updated_at already reconciled — incremental pull filter. */
  pullCursor?: string
  /** DEK cached encrypted with safeStorage — owned by cloudKeys.ts. */
  encryptedDek?: string
  /** Encryption mode of the account's keys ('managed' | 'e2ee') — owned by cloudKeys.ts. */
  keysMode?: string
}

export type InitialPullStatus = 'pending' | 'ok' | 'failed'

/** Renderer-safe status — never carries key material. */
export interface CloudSyncStatus {
  configured: boolean
  enabled: boolean
  signedIn: boolean
  keysState: cloudKeys.CloudKeysState
  /** 'managed' | 'e2ee' | null (no keys, or mode unknown yet) — drives the Cloud panel. */
  keysMode: cloudKeys.CloudKeysMode
  lastSync?: string
  error?: string
  initialPullStatus: InitialPullStatus
  /**
   * True while the Realtime channel is joined. Informational: shown in the
   * titlebar sync status card. Joining/dropping the channel emits no event —
   * the UI reads it whenever it refreshes the status.
   */
  realtimeConnected: boolean
}

interface PullResult {
  pulled: number
  deleted: number
  errors: string[]
  updatedFiles: string[]
  hadDeletions: boolean
  hadMetadataChanges: boolean
}

// ── Settings helpers ──────────────────────────────────────────────────────────

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
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data), 'utf-8')
}

// Merge-writes only the fields this module owns — cloudKeys.ts stores
// encryptedDek in the same settings.cloudSync section.
function patchSettings(patch: Partial<CloudSyncSettings>): void {
  const settings = readSettings()
  const section = { ...((settings.cloudSync as Record<string, unknown>) ?? {}), ...patch }
  for (const key of Object.keys(section)) {
    if ((section as Record<string, unknown>)[key] === undefined) delete (section as Record<string, unknown>)[key]
  }
  settings.cloudSync = section
  writeSettings(settings)
  cloudSettings = section as unknown as CloudSyncSettings
}

// ── Module state ──────────────────────────────────────────────────────────────

let notesDirPath: string | null = null
let cloudSettings: CloudSyncSettings | null = null
let syncError: string | undefined
let initialPullStatus: InitialPullStatus = 'pending'
let statusListener: (() => void) | null = null

// Pending debounced pushes, keyed by relPath (same semantics as githubSync).
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Per-note-key cache: '<dir>' (note folders) or '<name>.json' (root metadata)
// → unwrapped note key. Seeded by pulls, populated on demand by pushes.
const noteKeyCache = new Map<string, Uint8Array>()

// In-flight remote mutations (upserts/tombstones) — the auto-sync pull defers
// while > 0, same stand-down as GitHub's queue counter.
let pendingMutations = 0

// Set on an RLS 403: pauses journal upsert drains while the LOCAL entitlement
// also says "no cloud" so an expired subscription doesn't retry-loop every
// poll tick. Cleared by any successful write.
let entitlementBlocked = false

let retryInFlight = false

// ── Durable journal (reuses syncState.ts, own file — never GitHub's) ──────────

let syncState: SyncState | null = null

function getSyncStatePath(): string {
  return path.join(app.getPath('userData'), 'cloud-sync-state.json')
}

function getState(): SyncState {
  if (!syncState) {
    let raw: string | null = null
    try {
      raw = fs.readFileSync(getSyncStatePath(), 'utf-8')
    } catch {
      raw = null
    }
    syncState = parseSyncState(raw)
  }
  return syncState
}

function persistState(): void {
  try {
    fs.writeFileSync(getSyncStatePath(), serializeSyncState(getState()), 'utf-8')
  } catch (err) {
    console.error('[CloudSync] failed to persist cloud-sync-state.json:', String(err))
  }
}

// ── Public lifecycle / status ─────────────────────────────────────────────────

export function loadCloudSyncSettings(): CloudSyncSettings {
  const settings = readSettings()
  cloudSettings = (settings.cloudSync as CloudSyncSettings) ?? { enabled: false }
  return cloudSettings
}

/** Boot hook: remembers the notes dir (needed to read anchors/journal drains). */
export function initCloudSync(notesDir: string): void {
  notesDirPath = notesDir
  loadCloudSyncSettings()
}

export function isCloudSyncEnabled(): boolean {
  return (cloudSettings ?? loadCloudSyncSettings()).enabled
}

export function getCloudSyncStatus(): CloudSyncStatus {
  const s = cloudSettings ?? loadCloudSyncSettings()
  return {
    configured: isCloudConfigured(),
    enabled: s.enabled,
    signedIn: account.getAccountStatus().signedIn,
    keysState: cloudKeys.getKeysState(),
    keysMode: cloudKeys.getKeysMode(),
    lastSync: s.lastSync,
    error: syncError,
    initialPullStatus,
    realtimeConnected: cloudRealtime.isCloudRealtimeConnected(),
  }
}

export function onStatusChanged(cb: () => void): void {
  statusListener = cb
}

function setInitialPullStatus(status: InitialPullStatus): void {
  if (initialPullStatus === status) return
  initialPullStatus = status
  statusListener?.()
}

/** True while remote writes/deletes are in flight (auto-sync pull defers). */
export function hasPendingRemoteMutations(): boolean {
  return pendingMutations > 0
}

/**
 * Turns Cloud sync on. Requires a signed-in account; the key session may still
 * be locked (pushes gate themselves and drain from the journal after unlock).
 * Mutual exclusion with GitHub Sync is routed in main.ts via syncProvider.ts.
 */
export function enableCloudSync(): { ok: boolean; error?: string } {
  if (!isCloudConfigured()) return { ok: false, error: 'NoteFlow Cloud is not available in this build.' }
  if (!account.getAccountStatus().signedIn) return { ok: false, error: NOT_SIGNED_IN_ERROR }
  patchSettings({ enabled: true })
  // GitHub Sync is now paused (syncProvider gives Cloud priority) and its
  // `lastSync` freezes while notes keep arriving here, so its pull's
  // local-deletion rule ("absent from remote + older than lastSync ⇒ deleted
  // remotely") stops being sound. Flag it so the next GitHub pull reconciles
  // instead of deleting. No-op if GitHub isn't connected.
  githubSync.markNeedsFullReconcile()
  syncError = undefined
  setInitialPullStatus('pending')
  statusListener?.()
  return { ok: true }
}

/**
 * Turns Cloud sync off. Deliberately KEEPS lastSync/pullCursor (re-enabling
 * resumes incrementally) and the journal (pending deletes must still land —
 * dropping them would resurrect notes on other devices). Key material is
 * untouched; locking is a separate action (cloudKeys.lockCloudKeys).
 */
export function disableCloudSync(): { ok: boolean } {
  pushTimers.forEach((t) => clearTimeout(t))
  pushTimers.clear()
  patchSettings({ enabled: false })
  // GitHub Sync is about to resume with a `lastSync` it can't trust: while Cloud
  // was on it received no pushes, and notes that arrived here from another device
  // keep their ORIGINAL `updated` (older than lastSync), so GitHub's catch-up
  // never uploaded them. Without this, its next pull sees them as "absent from
  // remote + older than lastSync" and deletes live notes. Marking on the way OUT
  // also covers users whose Cloud was enabled by an earlier build (no flag was
  // ever set for them) — there is no startup backfill.
  githubSync.markNeedsFullReconcile()
  syncError = undefined
  setInitialPullStatus('pending')
  statusListener?.()
  return { ok: true }
}

// ── REST helpers ──────────────────────────────────────────────────────────────

// RLS write rejection (42501 → 403): no active cloud entitlement. 401 is a
// session problem, NOT a subscription one — it surfaces as a generic error.
function isWriteForbidden(status: number): boolean {
  return status === 403
}

/** One retry on network errors / 5xx — Postgres upserts are idempotent. */
async function restWithRetry(
  fn: () => Promise<{ status: number; json: unknown }>
): Promise<{ status: number; json: unknown }> {
  try {
    const res = await fn()
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000))
      return await fn()
    }
    return res
  } catch {
    await new Promise((r) => setTimeout(r, 1000))
    return fn()
  }
}

function requireDek(): Uint8Array {
  const dek = cloudKeys.getDek()
  if (!dek) throw new Error(LOCKED_ERROR)
  return dek
}

function requireNotesDir(): string {
  if (!notesDirPath) throw new Error('CloudSync not initialized (notes dir unknown)')
  return notesDirPath
}

/**
 * Note key for a folder ('<dir>') or root metadata file ('<name>.json'):
 * cache → remote anchor row (unwrap its key_ct — keeps every row of a folder
 * on the SAME key) → freshly generated for brand-new notes.
 */
async function getNoteKeyFor(scope: string, dek: Uint8Array): Promise<Uint8Array> {
  const cached = noteKeyCache.get(scope)
  if (cached) return cached

  const anchorRel = scope.endsWith('.json') ? scope : `${scope}/${NOTE_MD}`
  const pathKey = await derivePathKeyHmac(dek, anchorRel)
  const res = await supabaseRest(
    `/rest/v1/files?select=key_ct&path_key=eq.${encodeURIComponent(pathKey)}`
  )
  let noteKey: Uint8Array | null = null
  if (res.status < 400 && Array.isArray(res.json) && res.json.length > 0) {
    try {
      noteKey = await unwrapKey((res.json[0] as { key_ct: string }).key_ct, dek)
    } catch {
      // Undecryptable remote key (should not happen with the right DEK) —
      // fall through to a fresh key; rows are self-contained so old rows
      // still decrypt with their own key_ct.
      noteKey = null
    }
  }
  if (!noteKey) noteKey = generateNoteKey()
  noteKeyCache.set(scope, noteKey)
  return noteKey
}

/** Uploads one file as an encrypted upsert row. Throws with an actionable message. */
async function pushSingleFile(relPath: string, content: string): Promise<void> {
  const dek = requireDek()
  const userId = account.getUserId()
  if (!userId) throw new Error(NOT_SIGNED_IN_ERROR)

  const dir = noteDirOf(relPath)
  const scope = dir ?? relPath
  const noteKey = await getNoteKeyFor(scope, dek)

  // Sections inherit the anchor's `updated:` (read fresh from disk).
  let anchorContent: string | null = null
  if (dir && !isAnchorPath(relPath)) {
    try {
      anchorContent = fs.readFileSync(path.join(requireNotesDir(), dir, NOTE_MD), 'utf-8')
    } catch {
      anchorContent = null
    }
  }
  const updatedAt = resolveRowUpdatedAt(relPath, content, anchorContent, new Date().toISOString())
  const row = await buildFileUpsertRow(dek, noteKey, relPath, content, updatedAt)

  const res = await restWithRetry(() =>
    supabaseRest('/rest/v1/files?on_conflict=user_id,path_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: userId, ...row },
    })
  )
  if (isWriteForbidden(res.status)) {
    // RLS rejected the write — no active cloud entitlement. Actionable error,
    // and entitlementBlocked pauses journal drains (no retry loop).
    entitlementBlocked = true
    throw new Error(SUBSCRIPTION_ERROR)
  }
  if (res.status >= 400) throw new Error(`Cloud upload failed (HTTP ${res.status})`)
  entitlementBlocked = false
}

/**
 * Propagates deletions for a set of relPaths: tombstones (deleted=true,
 * content_ct blanked) so other devices pick them up on their incremental pull.
 * RLS gates UPDATE on the entitlement, so without a subscription this falls
 * back to a physical DELETE (allowed by ownership alone) — the row disappears
 * but, by design, other devices are not notified (they can't push either).
 */
async function removeRemotePaths(relPaths: string[]): Promise<void> {
  if (relPaths.length === 0) return
  const dek = requireDek()
  const pathKeys = await Promise.all(relPaths.map((p) => derivePathKeyHmac(dek, p)))
  await removeRemoteByPathKeys(pathKeys)
}

async function removeRemoteByPathKeys(pathKeys: string[]): Promise<void> {
  if (pathKeys.length === 0) return
  const filter = `path_key=in.(${pathKeys.map((k) => `"${k}"`).join(',')})`

  const hasEntitlement = account.getAccountStatus().entitlements.cloud
  if (hasEntitlement) {
    const res = await restWithRetry(() =>
      supabaseRest(`/rest/v1/files?${filter}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { deleted: true, content_ct: '', updated_at: new Date().toISOString() },
      })
    )
    if (res.status < 400) return
    if (!isWriteForbidden(res.status)) throw new Error(`Cloud delete failed (HTTP ${res.status})`)
    // 403 despite local entitlement (stale) — fall through to physical delete.
  }
  const res = await restWithRetry(() =>
    supabaseRest(`/rest/v1/files?${filter}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  )
  if (res.status >= 400) throw new Error(`Cloud delete failed (HTTP ${res.status})`)
}

/**
 * All non-deleted remote rows decrypted to (relPath, path_key) — used by
 * scheduleDeleteDir, which must tombstone every row under '<dir>/' without a
 * plaintext prefix filter (path_key is opaque by design). content_ct is not
 * selected, so the payload stays small even for large corpora.
 */
async function listRemotePaths(dek: Uint8Array): Promise<Array<{ relPath: string; pathKey: string }>> {
  const res = await supabaseRest(
    '/rest/v1/files?select=path_key,path_ct,key_ct&deleted=eq.false'
  )
  if (res.status >= 400) throw new Error(`Cloud listing failed (HTTP ${res.status})`)
  const out: Array<{ relPath: string; pathKey: string }> = []
  for (const raw of (Array.isArray(res.json) ? res.json : []) as Array<Record<string, string>>) {
    try {
      const noteKey = await unwrapKey(raw.key_ct, dek)
      const relPath = await decryptContent(noteKey, raw.path_ct)
      out.push({ relPath, pathKey: raw.path_key })
    } catch {
      // Undecryptable row — skip (can't belong to this DEK).
    }
  }
  return out
}

// ── Push (debounced, journaled — mirror of the GitHub semantics) ──────────────

/**
 * Debounced single-file push. `relPath` is the notes-dir-relative path and the
 * debounce key. Gated (like GitHub) until the initial pull succeeds so a stale
 * local file can't overwrite a newer remote row; deferred edits are re-queued
 * by flushPendingLocalChanges when the pull lands.
 */
export function schedulePush(
  relPath: string,
  content: string,
  onStart?: () => void,
  onComplete?: (error?: string) => void
): void {
  const s = cloudSettings ?? loadCloudSyncSettings()
  if (!s.enabled || !isCloudConfigured()) {
    onComplete?.()
    return
  }
  if (initialPullStatus !== 'ok') {
    console.warn(`[CloudSync] Push deferred for ${relPath}: initialPullStatus=${initialPullStatus}`)
    onComplete?.(`sync-gated:${initialPullStatus}`)
    return
  }
  schedulePushUnguarded(relPath, content, onStart, onComplete)
}

function schedulePushUnguarded(
  relPath: string,
  content: string,
  onStart?: () => void,
  onComplete?: (error?: string) => void
): void {
  const existing = pushTimers.get(relPath)
  if (existing) clearTimeout(existing)

  // Journal at timer-arming time so the op survives the app closing during the
  // debounce window (retrySyncJournal re-reads the on-disk content later).
  if (journalRecord(getState(), relPath, 'upsert', new Date().toISOString())) persistState()

  const timer = setTimeout(async () => {
    pushTimers.delete(relPath)
    onStart?.()
    pendingMutations++
    try {
      await pushSingleFile(relPath, content)
      if (journalComplete(getState(), relPath, 'upsert')) persistState()
      patchSettings({ lastSync: new Date().toISOString() })
      syncError = undefined
      onComplete?.()
    } catch (err: unknown) {
      // IfAbsent: never clobber a newer delete/deleteDir intent recorded while
      // this push was in flight (same rationale as githubSync).
      journalRecordIfAbsent(getState(), relPath, 'upsert', new Date().toISOString())
      journalFail(getState(), relPath, 'upsert')
      persistState()
      syncError = err instanceof Error ? err.message : String(err)
      console.error('[CloudSync] push failed:', syncError)
      onComplete?.(syncError)
    } finally {
      pendingMutations--
    }
  }, PUSH_DEBOUNCE_MS)

  pushTimers.set(relPath, timer)
}

/**
 * Pushes a set of files NOW (awaited, no debounce, content read from disk).
 * Same contract as githubSync.pushPathsNow: used by bulk imports / agentic
 * writes, does NOT bump lastSync, no-op while the push gate is closed.
 */
export async function pushPathsNow(
  notesDir: string,
  relPaths: string[]
): Promise<{ pushed: number; errors: string[] }> {
  const s = cloudSettings ?? loadCloudSyncSettings()
  if (!s.enabled || !isCloudConfigured()) return { pushed: 0, errors: [] }
  if (initialPullStatus !== 'ok') return { pushed: 0, errors: [] }

  let pushed = 0
  const errors: string[] = []
  let stateChanged = false
  for (const relPath of relPaths) {
    const existing = pushTimers.get(relPath)
    if (existing) {
      clearTimeout(existing)
      pushTimers.delete(relPath)
    }
    pendingMutations++
    try {
      const content = fs.readFileSync(path.join(notesDir, relPath), 'utf-8')
      await pushSingleFile(relPath, content)
      pushed++
      if (journalComplete(getState(), relPath, 'upsert')) stateChanged = true
    } catch (err) {
      errors.push(relPath)
      journalRecordIfAbsent(getState(), relPath, 'upsert', new Date().toISOString())
      journalFail(getState(), relPath, 'upsert')
      stateChanged = true
      syncError = err instanceof Error ? err.message : String(err)
      console.error(`[CloudSync] pushPathsNow failed for ${relPath}:`, String(err))
    } finally {
      pendingMutations--
    }
  }
  if (stateChanged) persistState()
  if (pushed > 0 && errors.length === 0) syncError = undefined
  return { pushed, errors }
}

// ── Delete (tombstones) ───────────────────────────────────────────────────────

/** Tombstones a single remote file ('<dir>/<file>.md') — dropped sections. */
export async function scheduleDelete(relPath: string): Promise<void> {
  const s = cloudSettings ?? loadCloudSyncSettings()
  if (!s.enabled || !isCloudConfigured()) return

  const existing = pushTimers.get(relPath)
  if (existing) {
    clearTimeout(existing)
    pushTimers.delete(relPath)
  }
  if (journalRecord(getState(), relPath, 'delete', new Date().toISOString())) persistState()

  pendingMutations++
  try {
    await removeRemotePaths([relPath])
    if (journalComplete(getState(), relPath, 'delete')) persistState()
  } catch (err: unknown) {
    journalFail(getState(), relPath, 'delete')
    persistState()
    syncError = `Failed to delete ${relPath} on NoteFlow Cloud: ${String(err)}`
    console.error('[CloudSync] delete failed:', String(err))
  } finally {
    pendingMutations--
  }
}

/** Tombstones every remote row under '<dir>/' — note deletion. */
export async function scheduleDeleteDir(dir: string): Promise<void> {
  const s = cloudSettings ?? loadCloudSyncSettings()
  if (!s.enabled || !isCloudConfigured()) return

  for (const key of [...pushTimers.keys()]) {
    if (key.startsWith(`${dir}/`)) {
      clearTimeout(pushTimers.get(key)!)
      pushTimers.delete(key)
    }
  }
  if (journalRecord(getState(), dir, 'deleteDir', new Date().toISOString())) persistState()

  pendingMutations++
  try {
    await deleteRemoteDirNow(dir)
    if (journalComplete(getState(), dir, 'deleteDir')) persistState()
  } catch (err: unknown) {
    journalFail(getState(), dir, 'deleteDir')
    persistState()
    syncError = `Failed to delete note folder "${dir}" on NoteFlow Cloud: ${String(err)}`
    console.error('[CloudSync] delete dir failed:', String(err))
  } finally {
    pendingMutations--
  }
}

async function deleteRemoteDirNow(dir: string): Promise<void> {
  const dek = requireDek()
  const remote = await listRemotePaths(dek)
  const targets = remote.filter((r) => r.relPath.startsWith(`${dir}/`))
  noteKeyCache.delete(dir)
  await removeRemoteByPathKeys(targets.map((t) => t.pathKey))
}

// ── Pull (incremental by updated_at) ──────────────────────────────────────────

async function fetchChangedRows(cursor: string | undefined): Promise<CloudFileRow[]> {
  const rows: CloudFileRow[] = []
  const base =
    '/rest/v1/files?select=path_key,path_ct,content_ct,key_ct,updated_at,deleted&order=updated_at.asc' +
    (cursor
      ? `&updated_at=gt.${encodeURIComponent(cursor)}`
      : // First reconcile: tombstones are irrelevant (nothing local to delete
        // safely — lastSync is null) and would only cost bandwidth.
        '&deleted=eq.false')
  for (let offset = 0; ; offset += PULL_PAGE_SIZE) {
    const res = await supabaseRest(base, {
      headers: { Range: `${offset}-${offset + PULL_PAGE_SIZE - 1}`, 'Range-Unit': 'items' },
    })
    if (res.status === 416) break // requested range past the end — done paging
    if (res.status >= 400) throw new Error(`Cloud pull failed (HTTP ${res.status})`)
    const page = Array.isArray(res.json) ? (res.json as CloudFileRow[]) : []
    rows.push(...page)
    if (page.length < PULL_PAGE_SIZE) break
  }
  return rows
}

/** Fetches + decrypts the remote anchor row of a dir (or null). */
async function fetchRemoteAnchor(dek: Uint8Array, dir: string): Promise<CloudPullEntry | null> {
  const pathKey = await derivePathKeyHmac(dek, `${dir}/${NOTE_MD}`)
  const res = await supabaseRest(
    `/rest/v1/files?select=path_key,path_ct,content_ct,key_ct,updated_at,deleted&path_key=eq.${encodeURIComponent(pathKey)}`
  )
  if (res.status >= 400 || !Array.isArray(res.json) || res.json.length === 0) return null
  try {
    return await decryptFileRow(dek, res.json[0] as CloudFileRow)
  } catch {
    return null
  }
}

/**
 * Incremental pull: fetches rows with updated_at > pullCursor, decrypts them,
 * groups by note folder and applies the SAME conflict rule as the GitHub pull
 * (newer remote anchor wins wholesale; tombstones delete locally only when
 * local updated <= lastSync). Returns the githubSync.pullNotes result shape.
 */
export async function pullNotes(notesDir: string): Promise<PullResult> {
  const empty: PullResult = {
    pulled: 0,
    deleted: 0,
    errors: [],
    updatedFiles: [],
    hadDeletions: false,
    hadMetadataChanges: false,
  }
  const s = cloudSettings ?? loadCloudSyncSettings()
  if (!s.enabled || !isCloudConfigured()) return empty

  const dek = cloudKeys.getDek()
  if (!dek) {
    syncError = LOCKED_ERROR
    if (initialPullStatus === 'pending') setInitialPullStatus('failed')
    return { ...empty, errors: [LOCKED_ERROR] }
  }

  let pulled = 0
  let deleted = 0
  const errors: string[] = []
  const updatedFiles: string[] = []
  let hadMetadataChanges = false
  const previousLastSync = s.lastSync
  const lastSyncMs = s.lastSync ? Date.parse(s.lastSync) : null
  const state = getState()

  try {
    const rows = await fetchChangedRows(s.pullCursor)

    const entries: CloudPullEntry[] = []
    for (const row of rows) {
      try {
        const entry = await decryptFileRow(dek, row)
        if (!isSafeCloudRelPath(entry.relPath)) {
          errors.push(`unsafe remote path skipped: ${entry.relPath}`)
          continue
        }
        entries.push(entry)
        // Seed the per-folder key cache so pushes reuse the same note key.
        noteKeyCache.set(noteDirOf(entry.relPath) ?? entry.relPath, entry.noteKey)
      } catch (err) {
        errors.push(`row ${row.path_key}: ${String(err)}`)
      }
    }

    const { dirs, rootFiles } = groupEntriesByDir(entries)

    for (const [dir, group] of dirs) {
      try {
        // Journal guard: a pending remote deleteDir means this dir was deleted
        // locally — applying remote rows would resurrect the note.
        if (shouldPullSkipDir(state, dir)) continue

        // The anchor decides. It normally travels in the same incremental
        // window as its sections (they inherit its timestamp); if only section
        // rows made it (interrupted push on the origin device), fetch it.
        let anchor = group.find((e) => isAnchorPath(e.relPath)) ?? null
        if (!anchor) anchor = await fetchRemoteAnchor(dek, dir)
        if (!anchor) continue // never fully uploaded — the origin's journal will finish it

        const localDirPath = path.join(notesDir, dir)
        const localAnchorPath = path.join(localDirPath, NOTE_MD)
        let localUpdatedMs: number | null = null
        if (fs.existsSync(localAnchorPath)) {
          localUpdatedMs = parseUpdatedTimestamp(
            extractUpdatedTimestamp(fs.readFileSync(localAnchorPath, 'utf-8'))
          )
        }

        if (anchor.deleted) {
          // Note deleted remotely — apply locally only under the safety rule.
          if (
            fs.existsSync(localAnchorPath) &&
            shouldApplyRemoteDeletion(localUpdatedMs, lastSyncMs)
          ) {
            fs.rmSync(localDirPath, { recursive: true, force: true })
            deleted++
          }
          continue
        }

        if (
          fs.existsSync(localAnchorPath) &&
          !shouldApplyRemoteDir(anchor.updatedAtMs, localUpdatedMs)
        ) {
          continue // local is newer or equal — decision made, cursor advances anyway
        }

        fs.mkdirSync(localDirPath, { recursive: true })
        fs.writeFileSync(localAnchorPath, anchor.content, 'utf-8')
        for (const entry of group) {
          if (isAnchorPath(entry.relPath)) continue
          // Journal guard: don't resurrect a section whose remote delete is pending.
          if (shouldPullSkipFile(state, entry.relPath)) continue
          const localFile = path.join(notesDir, entry.relPath)
          if (entry.deleted) {
            try { fs.unlinkSync(localFile) } catch { /* already gone */ }
          } else {
            fs.writeFileSync(localFile, entry.content, 'utf-8')
          }
        }
        updatedFiles.push(localDirPath)
        pulled++
      } catch (err) {
        errors.push(`${dir}: ${String(err)}`)
      }
    }

    // Root metadata json — LWW like the GitHub pull (remote write wins).
    for (const entry of rootFiles) {
      try {
        if (entry.deleted) continue // metadata is never deleted by the app
        if (!(CLOUD_METADATA_FILENAMES as readonly string[]).includes(entry.relPath)) continue
        const metadataPath = path.join(notesDir, entry.relPath)
        const localContent = fs.existsSync(metadataPath)
          ? fs.readFileSync(metadataPath, 'utf-8')
          : null
        if (localContent !== entry.content) {
          fs.writeFileSync(metadataPath, entry.content, 'utf-8')
          hadMetadataChanges = true
        }
      } catch (err) {
        errors.push(`${entry.relPath}: ${String(err)}`)
      }
    }

    patchSettings({
      lastSync: new Date().toISOString(),
      pullCursor: nextPullCursor(s.pullCursor, entries),
    })
    syncError = undefined
    const wasNotOk = initialPullStatus !== 'ok'
    if (wasNotOk) {
      setInitialPullStatus('ok')
      flushPendingLocalChanges(notesDir, previousLastSync)
    }
  } catch (err: unknown) {
    const msg = String(err).includes('not-signed-in')
      ? NOT_SIGNED_IN_ERROR
      : err instanceof Error
        ? err.message
        : String(err)
    syncError = msg
    errors.push(msg)
    if (initialPullStatus === 'pending') setInitialPullStatus('failed')
  }

  return {
    pulled,
    deleted,
    errors,
    updatedFiles,
    hadDeletions: deleted > 0,
    hadMetadataChanges,
  }
}

/**
 * Called when the initial pull transitions to 'ok'. Re-queues pushes for any
 * note whose anchor is newer than the previous lastSync (edits made while the
 * gate was closed / while Cloud was disabled) — same on-disk detection as
 * githubSync. On the very first sync (no previous lastSync) this uploads the
 * ENTIRE local corpus, including the root metadata files.
 */
function flushPendingLocalChanges(notesDir: string, previousLastSync: string | undefined): void {
  const lastSyncMs = previousLastSync ? Date.parse(previousLastSync) : null
  for (const dir of listNoteDirs(notesDir)) {
    const dirPath = path.join(notesDir, dir)
    try {
      const anchor = fs.readFileSync(path.join(dirPath, NOTE_MD), 'utf-8')
      const updatedMs = parseUpdatedTimestamp(extractUpdatedTimestamp(anchor))
      if (updatedMs === null) continue
      if (lastSyncMs !== null && updatedMs <= lastSyncMs) continue
      for (const f of fs.readdirSync(dirPath)) {
        if (!f.endsWith('.md')) continue
        try {
          schedulePushUnguarded(`${dir}/${f}`, fs.readFileSync(path.join(dirPath, f), 'utf-8'))
        } catch { /* unreadable file — skip */ }
      }
    } catch { /* unreadable dir — skip */ }
  }
  // Initial upload: metadata json files have no timestamp — push them once.
  if (lastSyncMs === null) {
    for (const filename of CLOUD_METADATA_FILENAMES) {
      try {
        const p = path.join(notesDir, filename)
        if (fs.existsSync(p)) schedulePushUnguarded(filename, fs.readFileSync(p, 'utf-8'))
      } catch { /* skip */ }
    }
  }
}

// ── Journal retry (durability for failed remote mutations) ───────────────────

/**
 * Drains the journal of pending remote mutations (offline edits, failed
 * tombstones, pushes deferred while the keys were locked). Same contract as
 * githubSync.retrySyncJournal: upserts re-read the CURRENT disk content,
 * deletes always re-run, nothing is dropped on failure, lastSync is NOT
 * bumped. Skips silently while the keys are locked or (for writes) while an
 * RLS 403 said the subscription lapsed and the local entitlement agrees.
 */
export async function retrySyncJournal(notesDir: string): Promise<void> {
  const s = cloudSettings ?? loadCloudSyncSettings()
  if (!s.enabled || !isCloudConfigured()) return
  if (initialPullStatus !== 'ok') return
  if (retryInFlight) return
  if (!cloudKeys.getDek()) return // locked — ops stay journaled until unlock

  const state = getState()
  const entries = Object.entries(state.ops).sort((a, b) => a[1].queuedAt.localeCompare(b[1].queuedAt))
  if (entries.length === 0) return

  // Entitlement pause: a previous RLS 403 + no local cloud entitlement means
  // every write would 403 again — skip this tick instead of retry-looping.
  // (Physical deletes WOULD be allowed by RLS, but removeRemotePaths prefers
  // tombstones when entitled; keeping the whole drain paused is simpler and
  // the ops are not lost.)
  if (entitlementBlocked && !account.getAccountStatus().entitlements.cloud) return

  retryInFlight = true
  try {
    for (const [key, entry] of entries) {
      if (entry.op === 'upsert' && pushTimers.has(key)) continue // live timer will handle it

      const action = resolveRetryAction(entry.op, fs.existsSync(path.join(notesDir, key)))
      if (action === 'discard') {
        if (journalComplete(state, key, entry.op)) persistState()
        continue
      }

      pendingMutations++
      try {
        if (action === 'upsert') {
          const content = fs.readFileSync(path.join(notesDir, key), 'utf-8')
          await pushSingleFile(key, content)
          // Race guard (see githubSync): a fresh debounce timer armed while this
          // retry was in flight owns the entry now — leave it alive.
          if (pushTimers.has(key)) continue
        } else if (action === 'delete') {
          await removeRemotePaths([key])
        } else {
          await deleteRemoteDirNow(key)
        }
        if (journalComplete(state, key, entry.op)) persistState()
        syncError = undefined
      } catch (err: unknown) {
        journalFail(state, key, entry.op)
        persistState()
        syncError = `Cloud sync retry (${entry.op} ${key}) failed: ${String(err)}`
        console.error(`[CloudSync] journal retry failed for ${entry.op} ${key}:`, String(err))
      } finally {
        pendingMutations--
      }
    }
  } finally {
    retryInFlight = false
  }
}
