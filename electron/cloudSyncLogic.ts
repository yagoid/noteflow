// Pure logic for NoteFlow Cloud sync (phase 4.2, stage 2): row↔file mapping,
// timestamp resolution, conflict decisions and the encrypt/decrypt bridge
// between notes-dir-relative files and rows of public.files (migration 0004).
// Lives in electron/ but imports nothing from Electron — cloudSync.ts injects
// all IO — following the same pure-module pattern as syncState.ts /
// entitlements.ts. Covered by tests/electron/cloudSync.test.ts.
//
// Model recap (see .claude/context/monetization.md § 4): one row per file,
// keyed by an opaque deterministic path_key; every column *_ct is a sealed
// AES-256-GCM blob (cloudCrypto.ts); updated_at is plaintext ON PURPOSE — it is
// the basis of conflict resolution (note folder = unit of conflict, same rule
// as the GitHub Sync pull). The incremental pull does NOT use it as a cursor
// (it is the EDIT time, set by clients): it pages by `seq`, a change number the
// server assigns on every write (migration 0008).

import yaml from 'js-yaml'
import { createHash } from 'node:crypto'
import { NOTE_MD, noteDirname, splitFrontmatter } from './noteFormat'
import type { CloudBase } from './syncState'
import {
  derivePathKeyHmac,
  wrapKey,
  unwrapKey,
  encryptContent,
  decryptContent,
} from './cloudCrypto'

// Root-level JSON files that sync alongside the note folders.
// ⚠️ Keep in sync with METADATA_FILENAMES in githubSync.ts (private there).
export const CLOUD_METADATA_FILENAMES = [
  'groups.json',
  'folders.json',
  'section-colors.json',
  'note-order.json',
  'templates.json',
  'ui-settings.json',
] as const

// ── Row shapes ────────────────────────────────────────────────────────────────

/**
 * Columns a client writes to public.files (user_id added by the engine on
 * insert). Never includes `seq`: the server assigns it (trigger of migration
 * 0008) and ignores whatever a client sends.
 */
export interface CloudFileUpsertRow {
  path_key: string
  path_ct: string
  content_ct: string
  key_ct: string
  updated_at: string
  deleted: boolean
}

/** Wire shape of a public.files row as the pull reads it. */
export interface CloudFileRow extends CloudFileUpsertRow {
  /** Server-assigned change number (migration 0008) — the incremental-pull cursor. */
  seq: number
}

/** Columns every pull/anchor read selects (keep `seq`: it feeds the cursor). */
export const CLOUD_PULL_COLUMNS = 'path_key,path_ct,content_ct,key_ct,updated_at,deleted,seq'

/** A decrypted row, ready to be applied to disk. */
export interface CloudPullEntry {
  relPath: string
  /** Empty string for tombstones (their content_ct is blanked server-side). */
  content: string
  /** Unwrapped per-note key of the row (lets the engine seed its key cache). */
  noteKey: Uint8Array
  updatedAt: string
  updatedAtMs: number
  deleted: boolean
}

// ── Path mapping ──────────────────────────────────────────────────────────────

/**
 * Note directory of a notes-dir-relative path ('<dir>/<file>.md' → '<dir>'),
 * or null for root-level files (metadata json). The dir is the unit of both
 * the shared per-note key and conflict resolution.
 */
export function noteDirOf(relPath: string): string | null {
  const i = relPath.indexOf('/')
  return i > 0 ? relPath.slice(0, i) : null
}

/** True for '<dir>/note.md' — the anchor whose `updated:` decides conflicts. */
export function isAnchorPath(relPath: string): boolean {
  const dir = noteDirOf(relPath)
  return dir !== null && relPath === `${dir}/${NOTE_MD}`
}

/**
 * Whether a DECRYPTED relPath is safe to write inside the notes dir. Pulled
 * paths come from server-stored ciphertext — a compromised server can't forge
 * them (GCM would fail without the DEK), but defense in depth costs nothing:
 * only '<dir>/<file>.md' (one level deep) or a known root metadata json,
 * never traversal segments or separators that escape the notes dir.
 */
export function isSafeCloudRelPath(relPath: string): boolean {
  if (!relPath || relPath.includes('\\') || relPath.startsWith('/')) return false
  const parts = relPath.split('/')
  if (parts.some((p) => !p || p === '.' || p === '..')) return false
  if (parts.length === 1) return (CLOUD_METADATA_FILENAMES as readonly string[]).includes(relPath)
  return parts.length === 2 && parts[1].endsWith('.md')
}

/**
 * Section files a note.md (anchor) references: `sections[].file` of its
 * frontmatter (fallback '<id>.md', same as parseNoteDir), deduped. Encrypted
 * notes keep everything inside note.md → []. Only plain one-level '.md'
 * filenames survive (no separators, no dot segments, never note.md itself) —
 * the pull uses this list to fetch the sections of an anchor it applies that
 * did not travel in the same batch. Mirror: listAnchorSectionFiles in cli/noteflow.js.
 */
export function listAnchorSectionFiles(anchorContent: string): string[] {
  const { frontmatter } = splitFrontmatter(anchorContent)
  if (!frontmatter) return []
  let data: unknown
  try {
    data = yaml.load(frontmatter)
  } catch {
    return []
  }
  if (!data || typeof data !== 'object') return []
  const fm = data as Record<string, unknown>
  if (fm.encryption || !Array.isArray(fm.sections)) return []
  const files: string[] = []
  for (const sec of fm.sections) {
    if (!sec || typeof sec !== 'object') continue
    const { id, file } = sec as Record<string, unknown>
    const name = file != null ? String(file) : id != null ? `${String(id)}.md` : null
    if (name === null || !isPlainSectionFilename(name) || files.includes(name)) continue
    files.push(name)
  }
  return files
}

function isPlainSectionFilename(name: string): boolean {
  return (
    name.endsWith('.md') &&
    name !== NOTE_MD &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.startsWith('.')
  )
}

// ── Timestamps ────────────────────────────────────────────────────────────────

// Same regex-based extraction as githubSync.ts (private there): the `updated:`
// value of the note.md frontmatter, without a full YAML parse.
export function extractUpdatedTimestamp(content: string): string | null {
  const match = content.match(/^updated:\s*['"]?([^'"\n]+)['"]?\s*$/m)
  return match ? match[1].trim() : null
}

export function parseUpdatedTimestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * updated_at of a pushed row. Decision (documented in monetization.md § 4):
 *   - '<dir>/note.md'   → its own frontmatter `updated:`;
 *   - '<dir>/<sec>.md'  → the ANCHOR's `updated:` (anchorContent read from disk
 *     by the engine) — sections carry no own timestamp, and inheriting the
 *     anchor's guarantees a note edit lands as one coherent group in the
 *     incremental pull window of other devices;
 *   - root metadata json → nowIso (write time — these files have no frontmatter);
 *   - fallback nowIso when the frontmatter is missing or unparseable.
 * Always normalized to ISO so Postgres timestamptz comparisons are exact.
 */
export function resolveRowUpdatedAt(
  relPath: string,
  content: string,
  anchorContent: string | null,
  nowIso: string
): string {
  const dir = noteDirOf(relPath)
  if (dir === null) return nowIso
  const source = isAnchorPath(relPath) ? content : anchorContent
  const ms = parseUpdatedTimestamp(extractUpdatedTimestamp(source ?? ''))
  return ms === null ? nowIso : new Date(ms).toISOString()
}

// ── Conflict decisions (mirror of the GitHub Sync pull rules) ─────────────────

/**
 * Should the pull write a remote note dir over the local one? Newer remote
 * anchor wins WHOLESALE; missing local = fresh note from another device.
 * Unparseable remote timestamp → never apply (can't reason about it).
 */
export function shouldApplyRemoteDir(
  remoteUpdatedMs: number | null,
  localUpdatedMs: number | null
): boolean {
  if (remoteUpdatedMs === null) return false
  if (localUpdatedMs === null) return true
  return remoteUpdatedMs > localUpdatedMs
}

/**
 * Should the pull apply ONE remote section row ('<dir>/<sec>.md', content or
 * tombstone) on its own, when its folder's anchor is not being applied (absent
 * from the batch, or not newer than the local one) and the folder exists
 * locally? Sections inherit the `updated:` of their anchor's version
 * (resolveRowUpdatedAt), so:
 *   - `>=` covers "same version, the section reached the server after the
 *     anchor" (the anchor was applied — or written here — before);
 *   - a local folder with its own newer edits has a strictly greater
 *     `updated`, and is respected.
 * Unparseable/unknown local timestamp → apply (same stance as
 * shouldApplyRemoteDir); unknown remote timestamp → never apply.
 */
export function shouldApplyRemoteSection(
  sectionUpdatedMs: number | null,
  localUpdatedMs: number | null
): boolean {
  if (sectionUpdatedMs === null) return false
  if (localUpdatedMs === null) return true
  return sectionUpdatedMs >= localUpdatedMs
}

/**
 * Should a remote tombstone delete the local copy? Safety rule shared with the
 * GitHub pull: only when the local `updated` is <= lastSync — i.e. the remote
 * knew this state and deleted it since. Newer local edits win (they'll be
 * re-pushed); no lastSync (first reconcile) or unknown age → never delete.
 */
export function shouldApplyRemoteDeletion(
  localUpdatedMs: number | null,
  lastSyncMs: number | null
): boolean {
  if (lastSyncMs === null) return false
  if (localUpdatedMs === null) return false
  return localUpdatedMs <= lastSyncMs
}

// ── Pull grouping / cursor (seq) ──────────────────────────────────────────────

/** Splits decrypted pull entries into note-dir groups + root-level files. */
export function groupEntriesByDir<T extends { relPath: string }>(
  entries: T[]
): { dirs: Map<string, T[]>; rootFiles: T[] } {
  const dirs = new Map<string, T[]>()
  const rootFiles: T[] = []
  for (const e of entries) {
    const dir = noteDirOf(e.relPath)
    if (dir === null) {
      rootFiles.push(e)
      continue
    }
    let group = dirs.get(dir)
    if (!group) {
      group = []
      dirs.set(dir, group)
    }
    group.push(e)
  }
  return { dirs, rootFiles }
}

/** Where the incremental pull starts and whether it reads tombstones. */
export interface PullPlan {
  /** Fetch rows with `seq > afterSeq` (0 = every row). */
  afterSeq: number
  /** False only for the very first reconcile (`deleted=eq.false`). */
  includeDeleted: boolean
}

/**
 * Picks the pull mode from the persisted sync state:
 *   - `pullSeq` known → incremental from it, tombstones included;
 *   - no `pullSeq` but a legacy `pullCursor` or a `lastSync` (device coming
 *     from the updated_at-cursor version) → ONE full reconcile from seq 0,
 *     tombstones included: it also recovers whatever the old cursor skipped
 *     (the conflict rules decide what gets applied);
 *   - nothing (first sync) → full, live rows only — with no lastSync there is
 *     nothing local that a tombstone could safely delete.
 */
export function planPullQuery(
  s: {
    pullSeq?: number
    pullCursor?: string
    lastSync?: string
  },
  opts?: { bootstrapBases?: boolean },
): PullPlan {
  const hasPullSeq = typeof s.pullSeq === 'number' && Number.isSafeInteger(s.pullSeq) && s.pullSeq >= 0
  // The one-time bases bootstrap (needsBasesBootstrap) re-reads everything,
  // tombstones included — the same mode as the legacy-cursor reconcile.
  if (opts?.bootstrapBases && (hasPullSeq || s.pullCursor || s.lastSync)) return { afterSeq: 0, includeDeleted: true }
  if (hasPullSeq) return { afterSeq: s.pullSeq as number, includeDeleted: true }
  if (s.pullCursor || s.lastSync) return { afterSeq: 0, includeDeleted: true }
  return { afterSeq: 0, includeDeleted: false }
}

/**
 * Must this pull be the ONE-TIME bases bootstrap? A device that already
 * synced with a build without bases (pullSeq / legacy cursor / lastSync) and
 * has not bootstrapped yet (settings.cloudSync.basesBootstrapped, persisted in
 * the same write that advances pullSeq): its folders have no base, so the
 * three-way reconcile would not apply and an offline edit made before the
 * first pull of the new build would clobber remote edits exactly like the bug
 * it fixes. The bootstrap pull re-reads every row (planPullQuery) and
 * reconciles every local folder three-way with bases synthesized from the
 * watermark and the journal (synthesizeBootstrapBases). Not gated on "no
 * bases yet": an aborted bootstrap leaves some bases behind and must still be
 * retried. A first sync (no previous state) never needs it.
 */
export function needsBasesBootstrap(s: {
  pullSeq?: number
  pullCursor?: string
  lastSync?: string
  basesBootstrapped?: boolean
}): boolean {
  if (s.basesBootstrapped === true) return false
  const hasPullSeq = typeof s.pullSeq === 'number' && Number.isSafeInteger(s.pullSeq) && s.pullSeq >= 0
  return hasPullSeq || Boolean(s.pullCursor) || Boolean(s.lastSync)
}

/** Rows per page of every Cloud listing — PostgREST caps responses (Supabase default max-rows 1000). */
export const CLOUD_PAGE_SIZE = 1000

/**
 * Reads a WHOLE `public.files` listing by KEYSET pagination over `seq`:
 * `fetchPage(after)` must request `order=seq.asc&seq=gt.<after>&limit=<pageSize>`
 * (plus its own filters) and resolve with that page — or throw. Stops at the
 * first short page. Not offsets/Range: an upsert moves a row to a higher seq,
 * so an offset window shifts mid-listing and can skip rows; a keyset can't.
 * A full page whose last seq doesn't move the keyset forward throws (it would
 * loop forever). Any failed page propagates: the callers never act on a
 * partial listing — a capped listing is exactly how a note deletion used to
 * tombstone nothing and still be marked done. Used by the pull
 * (fetchChangedRows) and by the deletion listing (listRemotePaths).
 * Mirror: collectSeqPages in cli/noteflow.js.
 */
export async function collectSeqPages<T extends { seq?: unknown }>(
  fetchPage: (afterSeq: number) => Promise<T[]>,
  afterSeq: number,
  pageSize: number = CLOUD_PAGE_SIZE,
  errorLabel = 'Cloud listing failed',
): Promise<T[]> {
  const rows: T[] = []
  let after = afterSeq
  for (;;) {
    const page = await fetchPage(after)
    rows.push(...page)
    if (page.length < pageSize) return rows
    const last = parseRowSeq(page[page.length - 1].seq)
    if (last === null || last <= after) throw new Error(`${errorLabel} (invalid seq paging)`)
    after = last
  }
}

/** A row's seq as a safe non-negative integer, or null (bigint may arrive as a string). */
export function parseRowSeq(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null
}

/**
 * Advances the incremental-pull watermark to the max `seq` of ALL fetched rows
 * — rows that failed to apply or decrypt included: holding the watermark on
 * them would re-fetch the whole tail forever. Failed rows are kept alive by
 * the pull retry set instead (settings.cloudSync.pullRetry, see
 * nextPullRetry), persisted in the same write as the watermark. Starts at
 * 0 when there was no watermark, so a pull that saw nothing still leaves the
 * device in seq mode. `seq` is assigned by the server on every write
 * (migration 0008) and, per user, becomes visible in order — unlike
 * updated_at, which is the client's EDIT time and would let late uploads fall
 * below the cursor.
 */
export function nextPullSeq(current: number | undefined, rows: Array<{ seq?: unknown }>): number {
  let max = typeof current === 'number' && Number.isSafeInteger(current) && current >= 0 ? current : 0
  for (const row of rows) {
    const seq = parseRowSeq(row.seq)
    if (seq !== null && seq > max) max = seq
  }
  return max
}

// ── Row crypto (cloudCrypto only — no IO) ─────────────────────────────────────

/**
 * Builds the encrypted upsert row for a file. All rows of the same note folder
 * must be built with the SAME noteKey (the engine caches one key per dir);
 * root metadata files get their own per-file key.
 */
export async function buildFileUpsertRow(
  dek: Uint8Array,
  noteKey: Uint8Array,
  relPath: string,
  content: string,
  updatedAt: string,
  deleted = false
): Promise<CloudFileUpsertRow> {
  return {
    path_key: await derivePathKeyHmac(dek, relPath),
    path_ct: await encryptContent(noteKey, relPath),
    content_ct: deleted ? '' : await encryptContent(noteKey, content),
    key_ct: await wrapKey(noteKey, dek),
    updated_at: updatedAt,
    deleted,
  }
}

/**
 * Decrypts a pulled row back to a relPath + content. Throws on a wrong DEK or
 * tampered blobs (GCM auth). Tombstones (deleted, blank content_ct) decrypt to
 * an empty content — their path_ct/key_ct stay intact server-side.
 */
export async function decryptFileRow(
  dek: Uint8Array,
  row: CloudFileUpsertRow
): Promise<CloudPullEntry> {
  const noteKey = await unwrapKey(row.key_ct, dek)
  const relPath = await decryptContent(noteKey, row.path_ct)
  const content = row.deleted || !row.content_ct ? '' : await decryptContent(noteKey, row.content_ct)
  const updatedAtMs = Date.parse(row.updated_at)
  return {
    relPath,
    content,
    noteKey,
    updatedAt: row.updated_at,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    deleted: row.deleted,
  }
}

// ── Conditional uploads (migration 0011) ──────────────────────────────────────

/** RPC of migration 0011 that note rows go through ('<dir>/note.md' and its sections). */
export const CLOUD_CONDITIONAL_UPSERT_RPC = 'cloud_upsert_file'

/**
 * Outcome of `POST /rest/v1/rpc/cloud_upsert_file`:
 *   - 'uploaded'  → written (also a same-version re-upload: ties are accepted);
 *   - 'stale'     → rejected: the server holds a NEWER version of the note
 *                   folder (anchor or this row, tombstones included) — the
 *                   function returned `false`;
 *   - 'missing'   → the server doesn't have the function yet (0011 not
 *                   deployed): 404 or PostgREST's PGRST202 → the caller falls
 *                   back to the legacy unconditional upsert;
 *   - 'forbidden' → RLS rejected the write (403 — no active cloud entitlement);
 *   - 'error'     → any other HTTP failure.
 * Mirror: classifyConditionalUpsert in cli/noteflow.js.
 */
export type ConditionalUpsertOutcome = 'uploaded' | 'stale' | 'missing' | 'forbidden' | 'error'

export function classifyConditionalUpsert(status: number, json: unknown): ConditionalUpsertOutcome {
  const code = json && typeof json === 'object' ? (json as { code?: unknown }).code : undefined
  if (status === 404 || code === 'PGRST202') return 'missing'
  if (status === 403) return 'forbidden'
  if (status >= 400) return 'error'
  return json === false ? 'stale' : 'uploaded'
}

// ── Base-seq conditional uploads (migration 0014) ─────────────────────────────

/**
 * RPC of migration 0014 that note rows go through first: the write lands only
 * when the server row of this path (tombstone included) is still the version
 * this device last reconciled (`p_base_seq` = its base seq, see
 * SyncState.bases) or does not exist. `p_base_seq` null (unknown base) → the
 * updated_at rule of 0011. Returns the row's new seq, or null when stale.
 */
export const CLOUD_BASE_UPSERT_RPC = 'cloud_upsert_file_v2'

/** classifyBaseUpsert: the outcome plus, when uploaded, the seq the server assigned (null = unknown). */
export interface BaseUpsertResult {
  outcome: ConditionalUpsertOutcome
  seq: number | null
}

/**
 * Outcome of `POST /rest/v1/rpc/cloud_upsert_file_v2` — same meanings as
 * classifyConditionalUpsert ('missing' = 0014 not deployed → the caller falls
 * back to cloud_upsert_file), but the function answers a bigint: the new seq
 * when written, JSON `null` when stale. A success with an unreadable seq is
 * still 'uploaded' (the server wrote it) with `seq: null` — the caller then
 * forgets the base instead of recording a wrong one.
 */
export function classifyBaseUpsert(status: number, json: unknown): BaseUpsertResult {
  const code = json && typeof json === 'object' ? (json as { code?: unknown }).code : undefined
  if (status === 404 || code === 'PGRST202') return { outcome: 'missing', seq: null }
  if (status === 403) return { outcome: 'forbidden', seq: null }
  if (status >= 400) return { outcome: 'error', seq: null }
  if (json === null || json === undefined) return { outcome: 'stale', seq: null }
  return { outcome: 'uploaded', seq: parseRowSeq(json) }
}

// ── Pull retry set (failed applies) ───────────────────────────────────────────

/**
 * A remote row whose apply failed on this device (disk error writing its
 * folder / metadata file, or a row that didn't decrypt). Persisted in
 * settings.cloudSync.pullRetry keyed by path_key, in the SAME write that
 * advances pullSeq: the watermark moves past the row, and this set is what
 * keeps it alive — the next pull re-fetches it by path_key.
 */
export interface PullRetryEntry {
  /** Decrypted relPath (absent for decrypt failures) — local diagnostics only. */
  relPath?: string
  /** Failed attempts so far. */
  attempts: number
}

export type PullRetrySet = Record<string, PullRetryEntry>

/** Undecryptable rows are given up after this many pulls (permanent corruption must not keep the error forever). */
export const PULL_RETRY_MAX_DECRYPT_ATTEMPTS = 5

/**
 * Rows that fail to APPLY are given up after this many pulls (~hours of
 * 5-minute safety-net pulls, more with Realtime): enough for a transient lock
 * (antivirus, sync client) to clear, while a permanent local error
 * (ENAMETOOLONG, EACCES) doesn't block "Mirror to GitHub" and show the error
 * forever.
 */
export const PULL_RETRY_MAX_APPLY_ATTEMPTS = 50

/** Path keys per `path_key=in.(…)` request of the retry re-fetch (keeps the URL short). */
export const PULL_RETRY_CHUNK = 100

/** Tolerant read of settings.cloudSync.pullRetry: malformed entries are dropped. */
export function parsePullRetry(raw: unknown): PullRetrySet {
  const out: PullRetrySet = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const attempts = typeof v.attempts === 'number' && Number.isFinite(v.attempts) && v.attempts >= 0 ? v.attempts : 0
    out[key] = typeof v.relPath === 'string' ? { relPath: v.relPath, attempts } : { attempts }
  }
  return out
}

/**
 * The pull batch: the main incremental fetch plus the rows re-fetched for the
 * retry set, deduped by path_key — the main fetch wins (same row, and it
 * carries the seq that feeds the watermark).
 */
export function mergeRetryRows<T extends { path_key: string }>(mainRows: T[], retryRows: T[]): T[] {
  const seen = new Set(mainRows.map((r) => r.path_key))
  const out = [...mainRows]
  for (const row of retryRows) {
    if (seen.has(row.path_key)) continue
    seen.add(row.path_key)
    out.push(row)
  }
  return out
}

/** What failed in one pull (everything else that was fetched applied, or was skipped by a rule). */
export interface PullFailures {
  /** path_key → relPath of rows whose apply failed (whole folder group, or a metadata file). */
  apply: Map<string, string>
  /** path_keys of rows that did not decrypt. */
  decrypt: Iterable<string>
}

/**
 * Retry set to persist after a pull. Built from this pull's failures ONLY:
 * every row of the previous set was re-fetched into the batch, so a key that
 * did not fail again either applied (leaves) or is gone from the server
 * (nothing to apply — leaves too). Apply failures are dropped once they
 * reach PULL_RETRY_MAX_APPLY_ATTEMPTS (a permanent local error must not keep
 * the error forever), decrypt failures once they reach
 * PULL_RETRY_MAX_DECRYPT_ATTEMPTS. Unsafe-path rows never enter (permanent).
 * Callers count what was dropped with countDroppedRetries (log a count only).
 * Mirror: nextPullRetry in cli/noteflow.js.
 */
export function nextPullRetry(
  prev: PullRetrySet,
  failures: PullFailures,
  maxDecryptAttempts: number = PULL_RETRY_MAX_DECRYPT_ATTEMPTS,
  maxApplyAttempts: number = PULL_RETRY_MAX_APPLY_ATTEMPTS,
): PullRetrySet {
  const next: PullRetrySet = {}
  const decided = new Set<string>()
  for (const [key, relPath] of failures.apply) {
    decided.add(key)
    const attempts = (prev[key]?.attempts ?? 0) + 1
    if (attempts < maxApplyAttempts) next[key] = { relPath, attempts }
  }
  for (const key of failures.decrypt) {
    if (decided.has(key)) continue
    decided.add(key)
    const attempts = (prev[key]?.attempts ?? 0) + 1
    if (attempts < maxDecryptAttempts) next[key] = { attempts }
  }
  return next
}

/** How many of this pull's failed rows nextPullRetry gave up on (reached their max attempts). */
export function countDroppedRetries(failures: PullFailures, next: PullRetrySet): number {
  const keys = new Set<string>([...failures.apply.keys(), ...failures.decrypt])
  let dropped = 0
  for (const key of keys) if (!next[key]) dropped++
  return dropped
}

// ── Account owner of the sync state ───────────────────────────────────────────

/**
 * Must the persisted Cloud sync state (pullSeq/lastSync/pullRetry, the journal,
 * the note-key cache) be discarded for the signed-in account? Only when its
 * recorded owner is ANOTHER account: a foreign watermark would skip every row
 * of this account below it, and a foreign journal would replay the other
 * account's edits/deletions here. An unknown owner (state written before the
 * owner was recorded) is ADOPTED by the caller, not reset — resetting is not
 * free (the first full pull skips tombstones, so notes deleted elsewhere would
 * stay on disk). Signed out (no current user) → nothing to compare. Same
 * semantics as the CLI's cliCloudForUser.
 */
export function shouldResetCloudState(
  storedOwner: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (!currentUserId || !storedOwner) return false
  return storedOwner !== currentUserId
}

// ── Root metadata merge (first sync / unsynced local edits) ───────────────────

/** Root metadata files that are arrays of `{ id }` objects and can be merged by id. */
export const CLOUD_MERGEABLE_METADATA = ['groups.json', 'folders.json', 'templates.json'] as const

export function isMergeableMetadata(relPath: string): boolean {
  return (CLOUD_MERGEABLE_METADATA as readonly string[]).includes(relPath)
}

function parseIdArray(json: string | null): Array<Record<string, unknown> & { id: string }> | null {
  if (json === null) return null
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    if (typeof (item as { id?: unknown }).id !== 'string') return null
  }
  return data as Array<Record<string, unknown> & { id: string }>
}

/**
 * Union by `id` of two metadata JSON arrays (groups.json / folders.json /
 * templates.json — arrays of objects with a string id). Colliding ids take the
 * `prefer` side's object; the preferred side's order comes first, then the
 * other side's extras in their order. Returns the merged JSON in the app's
 * on-disk format (2-space indent), or null when either side isn't such an
 * array (not mergeable — the caller picks a side). These entries have no
 * tombstones, so one deleted on a single side comes back from the other:
 * accepted — losing a device's groups/folders/templates is worse.
 */
export function mergeMetadataById(
  localJson: string | null,
  remoteJson: string | null,
  prefer: 'local' | 'remote',
): string | null {
  const local = parseIdArray(localJson)
  const remote = parseIdArray(remoteJson)
  if (!local || !remote) return null
  const [first, second] = prefer === 'local' ? [local, remote] : [remote, local]
  const ids = new Set<string>()
  const merged: unknown[] = []
  for (const item of [...first, ...second]) {
    if (ids.has(item.id)) continue
    ids.add(item.id)
    merged.push(item)
  }
  return JSON.stringify(merged, null, 2)
}

/**
 * Whether the pull treats a root metadata file as an UNSYNCED LOCAL EDIT
 * (planMetadataPull's `pendingUpsert`). Never on the first pull of a device or
 * account (`firstPull`): a pending op there may be a gate-closed journal entry
 * (fresh device with e2ee locked, a restart after a failed first sync, the
 * boot-time ui-settings seed, an account switch) — honoring it would keep the
 * local file and the first-sync catch-up would push it over the account's copy
 * (account A's ui-settings/note-order into account B). The first pull keeps
 * its documented rule instead: backup, then remote wins / union preferring
 * remote; the op is settled and the catch-up uploads what ended on disk.
 * Mirror: metadataPendingForPull in cli/noteflow.js.
 */
export function metadataPendingForPull(pendingUpsert: boolean, firstPull: boolean): boolean {
  return pendingUpsert && !firstPull
}

/** What the pull does with one remote root metadata row. */
export type MetadataPullDecision =
  | { action: 'keep' }
  | { action: 'write'; content: string; backup: boolean; merged: boolean }

/**
 * Pull decision for a root metadata file (remote content vs the local file):
 *   - identical → keep;
 *   - pending local upsert (an unsynced local edit — the pull runs BEFORE the
 *     journal drain): mergeable files get the union preferring LOCAL (the op
 *     stays and uploads it); the others keep the local file (local wins, the
 *     drain uploads it);
 *   - first pull of this device/account (no previous lastSync): the local file
 *     is backed up before being overwritten; mergeable files get the union
 *     preferring REMOTE (the first-sync catch-up then uploads it), the others
 *     take the remote;
 *   - otherwise → remote wins (LWW, as the GitHub pull).
 * An unmergeable pair (malformed JSON on either side) falls back to the
 * non-merge rule of its case. `backup` is only ever set on the first pull.
 */
export function planMetadataPull(
  relPath: string,
  localContent: string | null,
  remoteContent: string,
  opts: { pendingUpsert: boolean; firstPull: boolean },
): MetadataPullDecision {
  if (localContent === remoteContent) return { action: 'keep' }
  const backup = opts.firstPull && localContent !== null
  if (opts.pendingUpsert) {
    if (localContent === null) return { action: 'write', content: remoteContent, backup: false, merged: false }
    const merged = isMergeableMetadata(relPath) ? mergeMetadataById(localContent, remoteContent, 'local') : null
    if (merged === null || merged === localContent) return { action: 'keep' }
    return { action: 'write', content: merged, backup, merged: true }
  }
  if (opts.firstPull && localContent !== null && isMergeableMetadata(relPath)) {
    const merged = mergeMetadataById(localContent, remoteContent, 'remote')
    if (merged !== null) {
      return merged === localContent
        ? { action: 'keep' }
        : { action: 'write', content: merged, backup, merged: true }
    }
  }
  return { action: 'write', content: remoteContent, backup, merged: false }
}

// ── Remote deletes (tombstone vs physical DELETE) ────────────────────────────

/** Next step of removeRemoteByPathKeys. */
export type RemoteDeleteStep = 'tombstone' | 'delete' | 'defer' | 'done' | 'fail'

/**
 * Decides how a remote delete proceeds — a two-step decision: call it first
 * WITHOUT `patchStatus` (what to try), then again with the tombstone PATCH's
 * HTTP status (what to do with its answer).
 *
 * Deletes are tombstones (PATCH deleted=true) so other devices see them on
 * their incremental pull. RLS gates that UPDATE on the cloud entitlement, so a
 * user KNOWN to have no subscription falls back to a physical DELETE (allowed
 * by ownership alone; other devices are not notified — they can't push either).
 * That fallback is destructive for every other device, so it is only taken on
 * a VERIFIED entitlement: one fetched in this run. Unknown entitlements (never
 * fetched) and the on-disk cache (`verified: false`) only ever tombstone; a 403
 * then means 'defer' — the caller throws, the op stays journaled and is retried
 * once the entitlements are verified.
 *  - entitled: the local view says the cloud entitlement is active.
 *  - verified: that view comes from a fetch made in this run.
 *  - patchStatus: HTTP status of the tombstone PATCH (omit on the first step).
 */
export function planRemoteDelete(s: { entitled: boolean; verified: boolean; patchStatus?: number }): RemoteDeleteStep {
  if (s.patchStatus === undefined) return s.entitled || !s.verified ? 'tombstone' : 'delete'
  if (s.patchStatus < 400) return 'done'
  if (s.patchStatus !== 403) return 'fail'
  // 403 from RLS: no active entitlement server-side. Only a verified local view
  // may fall through to the physical DELETE (a stale verified `true` included).
  return s.verified ? 'delete' : 'defer'
}

// ── Local push routing (push gate) ────────────────────────────────────────────

/**
 * What schedulePush does with a local edit of `relPath`:
 *   - 'ignore'  → Cloud disabled or not configured: nothing is journaled
 *     (edits made while Cloud is off are caught up later by
 *     flushPendingLocalChanges, by their `updated`);
 *   - 'journal' → push gate closed (the initial pull of this run is not 'ok':
 *     booted offline, managed keys that couldn't unlock offline, e2ee keys
 *     locked, account just switched): the upsert is JOURNALED without arming a
 *     timer. Nothing is uploaded yet — the journal drain also waits for the
 *     gate — but the pull now sees it as a pending local edit: its deletion
 *     guards keep it, and a newer remote version applied over it first keeps
 *     it as a conflict copy (an unjournaled edit was silently overwritten by
 *     the first pull). After that pull, flushPendingLocalChanges + the drain
 *     upload it;
 *   - 'push'    → arm the debounced (journaled) push.
 */
export type LocalPushAction = 'ignore' | 'journal' | 'push'

export function planLocalPush(s: {
  enabled: boolean
  configured: boolean
  initialPullStatus: 'pending' | 'ok' | 'failed'
}): LocalPushAction {
  if (!s.enabled || !s.configured) return 'ignore'
  return s.initialPullStatus === 'ok' ? 'push' : 'journal'
}

// ── Conflict copies (offline edit vs a newer remote version) ──────────────────
// The pull is last-writer-wins per note folder. When it is about to overwrite
// (newer remote anchor, applied wholesale) or delete (anchor tombstone over a
// known-lost version) a folder that still holds a local edit the server never
// accepted (a pending upsert in the journal), that edit would vanish silently
// everywhere. Instead the LOCAL version is first kept as a conflict copy — a
// new note folder with a new id — and the pull then proceeds as before.
// Mirror: planConflictCopy / buildConflictCopy in cli/noteflow.js.

/** note.md minus its top-level `updated:` line (every save rewrites it). */
function anchorWithoutUpdated(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/^updated:[^\n]*(\n|$)/m, '')
}

/**
 * Does the pull have to keep a conflict copy before overwriting/deleting a
 * folder? `candidates` = the pending upserts under '<dir>/' not yet copied
 * (conflictCopyCandidates, syncState.ts); `local` = their content on disk
 * (null / absent = the file no longer exists → contributes nothing);
 * `server` = the content each path will have after the apply (null / absent =
 * deleted, unknown or not on the server). A copy is needed iff some pending
 * path exists locally and differs from the server's: the anchor (note.md) is
 * compared WITHOUT its `updated:` line (it always differs), sections
 * byte-for-byte. For an anchor tombstone every server content is null → a copy
 * whenever a pending file still exists locally.
 *
 * Encrypted notes (an `encryption:` block in note.md, no section files): only
 * the anchor can be compared, and re-encrypting changes the iv/ciphertext even
 * when the plaintext is identical — so a copy is usually made even for "the
 * same" content. That is deliberate and safe: the main process cannot decrypt
 * the note to tell, and a superfluous copy costs far less than a lost edit.
 */
export function planConflictCopy(
  candidates: readonly string[],
  local: Readonly<Record<string, string | null | undefined>>,
  server: Readonly<Record<string, string | null | undefined>>,
): boolean {
  for (const relPath of candidates) {
    const mine = local[relPath]
    if (mine === null || mine === undefined) continue
    const theirs = server[relPath]
    if (theirs === null || theirs === undefined) return true
    const differs = isAnchorPath(relPath)
      ? anchorWithoutUpdated(mine) !== anchorWithoutUpdated(theirs)
      : mine !== theirs
    if (differs) return true
  }
  return false
}

// js-yaml parses unquoted ISO timestamps as Date objects: back to ISO strings
// (what the app itself writes) before re-dumping the frontmatter.
function datesToIso(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(datesToIso)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = datesToIso(v)
    return out
  }
  return value
}

function loadAnchorFrontmatter(anchorContent: string): { data: Record<string, unknown>; body: string } | null {
  const { frontmatter, body } = splitFrontmatter(anchorContent)
  if (!frontmatter) return null
  let data: unknown
  try {
    data = yaml.load(frontmatter)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return { data: datesToIso(data) as Record<string, unknown>, body }
}

/** Title of a note.md (same default as the parsers: 'Untitled'). */
export function anchorTitle(anchorContent: string): string {
  const fm = loadAnchorFrontmatter(anchorContent)
  const title = fm?.data.title
  return title === undefined || title === null || title === '' ? 'Untitled' : String(title)
}

/**
 * Title of a conflict copy: '<original> (<label> YYYY-MM-DD HH:mm)', local
 * time. `label` comes localized from the caller ("conflict copy").
 */
export function conflictCopyTitle(original: string, label: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`
  return `${original} (${label} ${stamp})`
}

/**
 * Builds the conflict copy of a local note folder (`localFiles`: filename →
 * content, note.md required). The note.md frontmatter keeps EVERYTHING
 * (group, folder, tags, created, archived, favorited, expiresAt, the sections
 * list with the same `file` names, the encryption block…) except `id`,
 * `title` and `updated` (= nowIso), re-dumped with the same yaml options as
 * serializeNoteFolder; section files are copied byte-for-byte under the same
 * filenames, so `sections[].file` stays valid. An encrypted note keeps its
 * encryption block: the copy opens with the same password (the title is clear
 * frontmatter, so it is renamed all the same). Dir = '<slug>-<newId>' with the
 * app's slug rule (noteDirname). `onlySections` (filenames) restricts the
 * copy to those sections: its note.md lists only them and only their files
 * are copied (the Cloud three-way pull keeps just the sections in conflict).
 * Throws when note.md is missing or its frontmatter is unreadable — the
 * caller must then NOT overwrite the folder.
 */
export function buildConflictCopy(
  localFiles: Readonly<Record<string, string>>,
  opts: { newId: string; title: string; nowIso: string; onlySections?: readonly string[] },
): { dir: string; files: Record<string, string> } {
  const anchor = localFiles[NOTE_MD]
  if (anchor === undefined) throw new Error('conflict copy: the local folder has no note.md')
  const fm = loadAnchorFrontmatter(anchor)
  if (!fm) throw new Error('conflict copy: unreadable note.md frontmatter')
  // Assigning existing keys keeps their position in the dump.
  const data: Record<string, unknown> = { ...fm.data, id: opts.newId, title: opts.title, updated: opts.nowIso }
  // Subset copy (Cloud three-way pull): only the conflicting sections — the
  // copy's note.md lists just those, and only their files travel.
  const only = opts.onlySections ? new Set(opts.onlySections) : null
  if (only && Array.isArray(data.sections)) {
    data.sections = data.sections.filter((sec) => {
      const name = sectionFileOf(sec)
      return name !== null && only.has(name)
    })
  }
  const yamlStr = yaml.dump(data, { lineWidth: -1, quotingType: '"' })
  const files: Record<string, string> = { [NOTE_MD]: `---\n${yamlStr}---\n${fm.body}` }
  for (const [name, content] of Object.entries(localFiles)) {
    if (name !== NOTE_MD && (!only || only.has(name))) files[name] = content
  }
  return { dir: noteDirname(opts.newId, opts.title), files }
}

/** File name of one `sections[]` entry of a note.md frontmatter (fallback '<id>.md', as parseNoteDir). */
function sectionFileOf(sec: unknown): string | null {
  if (!sec || typeof sec !== 'object') return null
  const { id, file } = sec as Record<string, unknown>
  if (file != null) return String(file)
  return id != null ? `${String(id)}.md` : null
}

// ── Three-way reconcile per file (bases, migration 0014) ──────────────────────
// The pull used to decide a note folder by note.md's `updated:` alone (LWW),
// with no notion of "the server version a local edit was made on". A device
// that edited offline after missing a remote version saw its anchor as the
// newer one, kept its folder, re-queued every file and the conditional upload
// (updated_at rule of 0011) accepted it: the remote sections were clobbered
// everywhere, without a copy (reproduced in production). Every device now
// remembers, per file, its BASE (SyncState.bases: the server seq it last
// reconciled + a hash of that content) and the pull compares base / local /
// remote PER FILE — each section is its own file, note.md is the anchor whose
// frontmatter is merged. Uploads carry the base seq (cloud_upsert_file_v2).
// No base known (state of earlier builds) → the historical rules, unchanged.

/** Base hash of a remote TOMBSTONE that a local edit is kept over (see CloudBase.hash). */
export const TOMBSTONE_BASE_HASH = ''

/**
 * Hash of a note file's content for its base (sha-256, hex). note.md is hashed
 * WITHOUT its `updated:` line: every save rewrites it, so it says nothing
 * about whether the note's metadata changed.
 */
export function hashForBase(relPath: string, content: string): string {
  const text = isAnchorPath(relPath) ? anchorWithoutUpdated(content) : content
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * What the pull does with ONE remote row of a file, given the file's base:
 *   - 'legacy'     → no base known (or no usable seq): the historical rules;
 *   - 'outdated'   → the row is OLDER than the base (seq < base.seq — e.g. this
 *                    device uploaded a newer version while the pull ran): ignore;
 *   - 'keep'       → the remote did not change since the base: keep local (a
 *                    local change is uploaded with that base);
 *   - 'apply'      → only the remote changed (or the local file is gone): write /
 *                    delete the remote version, record the base, settle uploads;
 *   - 'adopt'      → both changed to the SAME content: record the base, settle;
 *   - 'keep-local' → remote tombstone over a changed local file: keep it and
 *                    re-upload it (its base becomes the tombstone's seq);
 *   - 'conflict'   → both changed, to different contents.
 * `localChanged` = local hash ≠ base hash OR a pending upsert in the journal.
 * Hashes are hashForBase (null = file missing locally / remote tombstone).
 */
export type FileReconcileAction = 'legacy' | 'outdated' | 'keep' | 'apply' | 'adopt' | 'keep-local' | 'conflict'

export interface FileReconcileInput {
  base: CloudBase | undefined
  localHash: string | null
  pending: boolean
  remoteSeq: number | null
  remoteHash: string | null
}

export function planFileReconcile(s: FileReconcileInput): FileReconcileAction {
  if (!s.base || s.remoteSeq === null) return 'legacy'
  if (s.remoteSeq < s.base.seq) return 'outdated'
  if (s.remoteSeq === s.base.seq) return 'keep'
  const localChanged = s.pending || s.localHash !== s.base.hash
  if (!localChanged) return 'apply'
  if (s.localHash === s.remoteHash) return 'adopt'
  if (s.remoteHash === null) return 'keep-local'
  if (s.localHash === null) return 'apply' // deleted here, edited remotely: the remote edit wins
  return 'conflict'
}

function anchorHashOf(content: string): string {
  return createHash('sha256').update(anchorWithoutUpdated(content), 'utf8').digest('hex')
}

function updatedMsOf(content: string): number | null {
  return parseUpdatedTimestamp(extractUpdatedTimestamp(content))
}

/** `content` with the value of its first top-level `updated:` line replaced (rest of the text untouched). */
function withUpdated(content: string, value: string): string {
  return content.replace(/^updated:[^\r\n]*/m, `updated: ${JSON.stringify(value)}`)
}

/**
 * Can't merge two changed anchors field by field: either is encrypted (the
 * frontmatter only holds the ciphertext of the whole note) or unreadable.
 */
function anchorsNeedWholeCopy(local: string, remote: string, baseHash: string): boolean {
  const lh = anchorHashOf(local)
  const rh = anchorHashOf(remote)
  if (lh === rh || lh === baseHash || rh === baseHash) return false
  const l = loadAnchorFrontmatter(local)
  const r = loadAnchorFrontmatter(remote)
  return !l || !r || Boolean(l.data.encryption) || Boolean(r.data.encryption)
}

export interface AnchorMergeInput {
  local: string
  remote: string
  /** Base hash of '<dir>/note.md' (hashForBase). */
  baseHash: string
  /** Section FILENAMES on disk once the section rows of the pull are applied. */
  sectionFilesOnDisk: ReadonlySet<string>
  /** Section FILENAMES with a known base (they existed in a version this device reconciled). */
  knownSectionFiles: ReadonlySet<string>
  /** The folder keeps local changes that will be uploaded (sections kept local). */
  folderKeepsLocalChanges: boolean
  /** Section FILENAMES whose local change the plan keeps on disk — always listed in the result. */
  keptLocalSectionFiles: ReadonlySet<string>
  /** Section FILENAMES the plan writes from the remote over a MISSING local file — listed when the remote anchor lists them. */
  restoredRemoteSectionFiles?: ReadonlySet<string>
  nowIso: string
}

export interface AnchorMergeResult {
  content: string
  /**
   * 'local' / 'remote' → that side as is; 'merged' → a new anchor (differs from
   * both: it must be uploaded); 'whole' → not mergeable (encrypted/unreadable):
   * `content` is the remote and the caller keeps the WHOLE local folder as a copy.
   */
  source: 'local' | 'remote' | 'merged' | 'whole'
}

/**
 * Frontmatter merge of note.md (compared WITHOUT `updated:` against the base hash):
 *   - same content both sides → the remote, or the local when the folder keeps
 *     newer local edits (its later `updated` must reach the server);
 *   - only the remote changed → the remote (carrying the later local `updated`
 *     when the folder keeps newer local edits — the server's anchor must say
 *     when the note last changed);
 *   - only the local changed → the local (its `updated` becomes now when the
 *     remote's is not older — the server's `updated` never moves backwards);
 *   - both changed → BASE = the remote anchor (title, group, folder, sections
 *     metadata… from the remote) plus the local sections it lacks whose file
 *     exists here (created on this device since the base); a section listed
 *     only remotely is dropped when it is missing here and was known (deleted
 *     on this device since the base); `aiHidden` of a section and `favorited`
 *     are OR-ed, `tags` united; `updated` = now (a new local edit, uploaded
 *     with the remote seq as its base).
 * In EVERY case the sections whose local change is kept on disk
 * (`keptLocalSectionFiles`) stay listed (withKeptLocalSections).
 * Encrypted or unreadable anchors that both changed → 'whole'.
 */
export function mergeAnchors(m: AnchorMergeInput): AnchorMergeResult {
  const chosen = chooseAnchor(m)
  return chosen.source === 'whole' ? chosen : withKeptLocalSections(chosen, m)
}

function dumpAnchor(data: Record<string, unknown>, body: string): string {
  return `---\n${yaml.dump(data, { lineWidth: -1, quotingType: '"' })}---\n${body}`
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function chooseAnchor(m: AnchorMergeInput): AnchorMergeResult {
  const lh = anchorHashOf(m.local)
  const rh = anchorHashOf(m.remote)
  const localMs = updatedMsOf(m.local)
  const remoteMs = updatedMsOf(m.remote)
  const bumpToLocal = m.folderKeepsLocalChanges && localMs !== null && (remoteMs === null || localMs > remoteMs)

  if (lh === rh) return bumpToLocal ? { content: m.local, source: 'local' } : { content: m.remote, source: 'remote' }
  if (lh === m.baseHash) {
    if (!bumpToLocal) return { content: m.remote, source: 'remote' }
    const content = withUpdated(m.remote, extractUpdatedTimestamp(m.local) ?? m.nowIso)
    return content === m.remote ? { content, source: 'remote' } : { content, source: 'merged' }
  }
  if (rh === m.baseHash) {
    // Only the local changed — but its `updated` may be OLDER than the remote's
    // (a remote save that only bumped it): never move the server's `updated`
    // backwards (clients still on the LWW rule — CLI, older builds — would
    // ignore this version), so it becomes "now".
    if (remoteMs !== null && (localMs === null || remoteMs >= localMs)) {
      const content = withUpdated(m.local, m.nowIso)
      return content === m.local ? { content, source: 'local' } : { content, source: 'merged' }
    }
    return { content: m.local, source: 'local' }
  }

  const l = loadAnchorFrontmatter(m.local)
  const r = loadAnchorFrontmatter(m.remote)
  if (!l || !r || l.data.encryption || r.data.encryption) return { content: m.remote, source: 'whole' }
  const remoteSections: unknown[] = Array.isArray(r.data.sections) ? r.data.sections : []
  const localSections: unknown[] = Array.isArray(l.data.sections) ? l.data.sections : []
  const localByFile = new Map<string, Record<string, unknown>>()
  for (const sec of localSections) {
    const file = sectionFileOf(sec)
    if (file !== null) localByFile.set(file, sec as Record<string, unknown>)
  }
  const remoteListed = new Set(remoteSections.map(sectionFileOf).filter((f): f is string => f !== null))
  const kept = remoteSections
    .filter((sec) => {
      const file = sectionFileOf(sec)
      if (file === null || localByFile.has(file) || m.sectionFilesOnDisk.has(file)) return true
      // Listed only remotely and missing here: deleted on this device since the
      // base when it was known; otherwise added remotely (its row may still be on its way).
      return !m.knownSectionFiles.has(file)
    })
    .map((sec) => {
      // Hidden from the AI on EITHER side stays hidden (privacy beats a lost
      // un-hide: there is no base content to tell which side changed it).
      const file = sectionFileOf(sec)
      const mine = file === null ? undefined : localByFile.get(file)
      const theirs = sec as Record<string, unknown>
      return mine?.aiHidden === true && theirs.aiHidden !== true ? { ...theirs, aiHidden: true } : sec
    })
  const added = localSections.filter((sec) => {
    const file = sectionFileOf(sec)
    return file !== null && !remoteListed.has(file) && m.sectionFilesOnDisk.has(file)
  })
  const data: Record<string, unknown> = { ...r.data, sections: [...kept, ...added], updated: m.nowIso }
  // Cheap, safe field merges: tags are derived from the sections' content
  // (both sides' content survives → union), and a favorite on either side stays.
  const tags = [...new Set([...stringArray(r.data.tags), ...stringArray(l.data.tags)])]
  if (Array.isArray(r.data.tags) || Array.isArray(l.data.tags)) data.tags = tags
  if (l.data.favorited === true || l.data.pinned === true) data.favorited = true
  return { content: dumpAnchor(data, r.body), source: 'merged' }
}

/**
 * Whatever side won, the sections whose LOCAL changes the plan keeps on disk
 * (`keptLocalSectionFiles`: kept over an unchanged remote, or over a remote
 * tombstone) must stay listed — otherwise the edit would live in a file no
 * anchor references (an invisible orphan, re-uploaded as such). Appended with
 * their local metadata; the result is a new version (`updated` = now).
 */
function withKeptLocalSections(chosen: AnchorMergeResult, m: AnchorMergeInput): AnchorMergeResult {
  const restored = m.restoredRemoteSectionFiles ?? new Set<string>()
  if (m.keptLocalSectionFiles.size === 0 && restored.size === 0) return chosen
  const fm = loadAnchorFrontmatter(chosen.content)
  if (!fm || fm.data.encryption) return chosen
  const sections: unknown[] = Array.isArray(fm.data.sections) ? fm.data.sections : []
  const listed = new Set(sections.map(sectionFileOf).filter((f): f is string => f !== null))
  const extras: unknown[] = []
  // Local sections whose change is kept, and remote sections written back over
  // a file missing here (a remote edit beats a local deletion — their file is
  // on disk again, so they must be visible too).
  for (const [side, files] of [[m.local, m.keptLocalSectionFiles], [m.remote, restored]] as const) {
    if (files.size === 0) continue
    const other = loadAnchorFrontmatter(side)
    if (!other || !Array.isArray(other.data.sections)) continue
    for (const sec of other.data.sections) {
      const file = sectionFileOf(sec)
      if (file === null || listed.has(file) || !files.has(file)) continue
      listed.add(file)
      extras.push(sec)
    }
  }
  if (extras.length === 0) return chosen
  return { content: dumpAnchor({ ...fm.data, sections: [...sections, ...extras], updated: m.nowIso }, fm.body), source: 'merged' }
}

/** One remote row of a folder for planThreeWayDir (decrypted). */
export interface ThreeWayRemoteRow {
  relPath: string
  seq: number | null
  /** null = tombstone. */
  content: string | null
  updatedAtMs: number
}

export interface ThreeWayDirInput {
  dir: string
  /** Every '.md' of the local folder (relPath → content); must hold '<dir>/note.md'. */
  local: Readonly<Record<string, string>>
  /** Remote rows of the folder to reconcile (pull batch + fetched). An anchor tombstone is never passed (handled before). */
  remote: readonly ThreeWayRemoteRow[]
  bases: Readonly<Record<string, CloudBase>>
  /** relPaths with a pending upsert in the journal (stale or not). */
  pendingUpserts: ReadonlySet<string>
  /** …of which flagged stale (the drain skips them: re-queued when they must still go up). */
  staleUpserts: ReadonlySet<string>
  /** …of which already kept in a conflict copy (dedupe of a retried, half-failed apply). */
  copiedUpserts: ReadonlySet<string>
  /** relPaths with a pending remote delete (never written back). */
  pendingDeletes: ReadonlySet<string>
  /** relPath → hashForBase of this device's uploads still waiting for their answer (their echo is adopted). */
  inFlightHashes?: ReadonlyMap<string, string>
  nowIso: string
}

export interface ThreeWayDirPlan {
  /** Files to write — sections first, note.md last. */
  writes: Array<{ relPath: string; content: string }>
  /** Section files to remove (remote tombstones applied). */
  removes: string[]
  /** New bases (null = drop). */
  bases: Record<string, CloudBase | null>
  /** relPaths now holding the server's content: complete their pending upsert, cancel their timer. */
  settle: string[]
  /** relPaths to (re-)upload from their final disk content — with base = the seq just reconciled. */
  upload: string[]
  /** Subset of `upload` sent unconditionally (no base: the legacy tombstone-over-pending-edit rule). */
  force: string[]
  /** Section FILENAMES whose local version goes to a conflict copy holding only them. */
  copySections: string[]
  /** The anchors could not be merged: the WHOLE local folder goes to a conflict copy. */
  copyWhole: boolean
}

/** Historical per-section rule (no base): the anchor's `updated` decides, pending edits are guarded. */
function planLegacySection(
  row: ThreeWayRemoteRow,
  local: string | null,
  pending: boolean,
  localUpdatedMs: number | null,
): FileReconcileAction {
  if (row.content === null) {
    if (local === null) return 'adopt' // already gone
    if (pending) return 'keep-local'
    return shouldApplyRemoteSection(row.updatedAtMs, localUpdatedMs) ? 'apply' : 'keep'
  }
  // Missing here and no pending delete (the caller skips those): nothing local
  // to lose — typically a section added on another device. Never skipped by
  // the `updated` rule: the anchor may list it, and a missing file would be
  // recreated empty by the editor and uploaded blank over the real one.
  if (local === null) return 'apply'
  if (local === row.content) return 'adopt'
  if (!shouldApplyRemoteSection(row.updatedAtMs, localUpdatedMs)) return 'keep'
  return local !== null && pending ? 'conflict' : 'apply'
}

/**
 * Three-way reconcile of ONE note folder that exists locally and whose anchor
 * has a known base (the pull's caller checks both). Pure: the caller reads the
 * folder, executes the plan (conflict copy first — it reads the local disk —,
 * then the writes, the bases, the settles and the uploads) and handles the
 * anchor tombstone before (historical rule). Per remote section row:
 * planFileReconcile (rows without a base → planLegacySection, the historical
 * per-section rule). A conflicting section: the remote goes into the note and
 * the local version into a copy holding ONLY the conflicting sections
 * (`copySections`; an op already flagged conflictCopied is not copied twice).
 * The anchor is decided by mergeAnchors once the sections are known (which
 * files remain, whether local edits are kept); an unmergeable conflict
 * (encrypted note) applies the remote folder and copies the WHOLE local one,
 * as before. Whatever ends different from the server is re-uploaded.
 */
export function planThreeWayDir(input: ThreeWayDirInput): ThreeWayDirPlan {
  const { dir } = input
  const prefix = `${dir}/`
  const anchorRel = `${dir}/${NOTE_MD}`
  const plan: ThreeWayDirPlan = {
    writes: [],
    removes: [],
    bases: {},
    settle: [],
    upload: [],
    force: [],
    copySections: [],
    copyWhole: false,
  }
  const localAnchor = input.local[anchorRel]
  if (localAnchor === undefined) throw new Error('three-way reconcile: the local folder has no note.md')
  const localUpdatedMs = updatedMsOf(localAnchor)
  const fileName = (rel: string) => rel.slice(prefix.length)
  const anchorRow = input.remote.find((r) => r.relPath === anchorRel && r.content !== null) ?? null
  // The echo of an upload of THIS device still waiting for its answer (the
  // server committed it, the response that records its base has not arrived):
  // its row IS this device's version — adopted as the base, never a conflict
  // with a newer local save (that would push the latest edit into a copy).
  const echoBase = (rel: string, row: ThreeWayRemoteRow): CloudBase | undefined => {
    const base = input.bases[rel]
    if (row.content === null || row.seq === null || (base && row.seq <= base.seq)) return base
    const hash = hashForBase(rel, row.content)
    if (input.inFlightHashes?.get(rel) !== hash) return base
    plan.bases[rel] = { seq: row.seq, hash }
    return plan.bases[rel] as CloudBase
  }
  const anchorBase = anchorRow ? echoBase(anchorRel, anchorRow) : input.bases[anchorRel]

  // 1. The anchor's verdict first: an unmergeable conflict turns the whole folder remote.
  let anchorAction: FileReconcileAction = 'keep'
  let whole = false
  if (anchorRow) {
    anchorAction = planFileReconcile({
      base: anchorBase,
      localHash: hashForBase(anchorRel, localAnchor),
      pending: input.pendingUpserts.has(anchorRel),
      remoteSeq: anchorRow.seq,
      remoteHash: hashForBase(anchorRel, anchorRow.content as string),
    })
    whole = anchorAction === 'conflict' && anchorBase !== undefined &&
      anchorsNeedWholeCopy(localAnchor, anchorRow.content as string, anchorBase.hash)
  }

  // 2. Sections, one file at a time. `keptLocal`: section files whose local
  // change stays on disk (the anchor must keep listing them).
  const keptLocal = new Set<string>()
  const restored = new Set<string>() // remote content written over a missing local file
  const conflicts: string[] = []
  const after = new Map<string, string | null>() // relPath → content once applied (null = removed)
  const recordBase = (rel: string, seq: number | null, content: string | null) => {
    if (content === null) plan.bases[rel] = null
    else if (seq !== null) plan.bases[rel] = { seq, hash: hashForBase(rel, content) }
  }
  for (const row of input.remote) {
    const rel = row.relPath
    if (rel === anchorRel || !rel.startsWith(prefix) || input.pendingDeletes.has(rel)) continue
    const local = input.local[rel] ?? null
    const pending = input.pendingUpserts.has(rel)
    const base = echoBase(rel, row)
    let action = planFileReconcile({
      base,
      localHash: local === null ? null : hashForBase(rel, local),
      pending,
      remoteSeq: row.seq,
      remoteHash: row.content === null ? null : hashForBase(rel, row.content),
    })
    if (action === 'legacy') action = planLegacySection(row, local, pending, localUpdatedMs)
    // The whole local folder goes to the copy: every remote row is applied.
    if (whole && action !== 'outdated') action = local === row.content ? 'adopt' : 'apply'
    switch (action) {
      case 'outdated':
        break
      case 'keep': {
        if (local === null) break
        const changed = base ? pending || hashForBase(rel, local) !== base.hash : true
        if (!changed) break
        keptLocal.add(fileName(rel))
        // A stale op is skipped by the drain, and an unjournaled change has no
        // op at all: both must still go up (with the base just confirmed).
        if (input.staleUpserts.has(rel) || (base !== undefined && !pending)) plan.upload.push(rel)
        break
      }
      case 'apply':
        if (row.content === null) {
          if (local !== null) plan.removes.push(rel)
        } else if (local !== row.content) {
          plan.writes.push({ relPath: rel, content: row.content })
          if (local === null) restored.add(fileName(rel))
        }
        after.set(rel, row.content)
        recordBase(rel, row.seq, row.content)
        plan.settle.push(rel)
        break
      case 'adopt':
        after.set(rel, row.content)
        recordBase(rel, row.seq, row.content)
        plan.settle.push(rel)
        break
      case 'keep-local': {
        // The local edit beats the remote deletion and goes up again. A
        // tombstone newer than the local version would reject an updated_at
        // (0011) upload — the legacy rule and the fallback of a server without
        // 0014 — so that one is FORCED, as before; otherwise it goes up on top
        // of the tombstone's seq (its new base, with the tombstone's empty hash).
        const tombstoneNewer = shouldApplyRemoteSection(row.updatedAtMs, localUpdatedMs)
        keptLocal.add(fileName(rel))
        if (base !== undefined && row.seq !== null) plan.bases[rel] = { seq: row.seq, hash: TOMBSTONE_BASE_HASH }
        if (tombstoneNewer || base !== undefined || input.staleUpserts.has(rel)) plan.upload.push(rel)
        if (tombstoneNewer) plan.force.push(rel)
        break
      }
      case 'conflict':
        conflicts.push(rel)
        plan.writes.push({ relPath: rel, content: row.content as string })
        after.set(rel, row.content)
        recordBase(rel, row.seq, row.content)
        plan.settle.push(rel)
        break
    }
  }

  // Local section edits this batch did not touch (pending, or changed since
  // their base) are kept too — the anchor must then carry the local `updated`.
  for (const [rel, content] of Object.entries(input.local)) {
    if (rel === anchorRel || !rel.startsWith(prefix) || after.has(rel)) continue
    const base = input.bases[rel]
    if (input.pendingUpserts.has(rel) || (base !== undefined && hashForBase(rel, content) !== base.hash)) {
      keptLocal.add(fileName(rel))
    }
  }

  // 3. The anchor, once the sections are known.
  if (anchorRow && anchorAction !== 'outdated' && anchorAction !== 'keep') {
    const remote = anchorRow.content as string
    let final: string
    if (anchorAction === 'legacy' || anchorBase === undefined) {
      final = shouldApplyRemoteDir(updatedMsOf(remote), localUpdatedMs) ? remote : localAnchor
    } else if (whole) {
      final = remote
    } else {
      const onDisk = new Set<string>()
      for (const rel of Object.keys(input.local)) if (rel !== anchorRel && rel.startsWith(prefix)) onDisk.add(fileName(rel))
      for (const [rel, content] of after) {
        if (content === null) onDisk.delete(fileName(rel))
        else onDisk.add(fileName(rel))
      }
      const known = new Set<string>()
      for (const rel of Object.keys(input.bases)) if (rel !== anchorRel && rel.startsWith(prefix)) known.add(fileName(rel))
      final = mergeAnchors({
        local: localAnchor,
        remote,
        baseHash: anchorBase.hash,
        sectionFilesOnDisk: onDisk,
        knownSectionFiles: known,
        folderKeepsLocalChanges: keptLocal.size > 0,
        keptLocalSectionFiles: keptLocal,
        restoredRemoteSectionFiles: restored,
        nowIso: input.nowIso,
      }).content
    }
    const legacy = anchorAction === 'legacy' || anchorBase === undefined
    if (!legacy) recordBase(anchorRel, anchorRow.seq, remote)
    if (final !== localAnchor) plan.writes.push({ relPath: anchorRel, content: final })
    if (final === remote) plan.settle.push(anchorRel)
    else if (!legacy) plan.upload.push(anchorRel) // a new local version on top of the remote seq
  } else if (anchorAction === 'keep' && anchorBase !== undefined) {
    // Remote anchor unchanged since the base: a stale op (skipped by the drain)
    // or an unjournaled change of the local one still has to go up.
    const pending = input.pendingUpserts.has(anchorRel)
    if (input.staleUpserts.has(anchorRel) || (!pending && hashForBase(anchorRel, localAnchor) !== anchorBase.hash)) {
      plan.upload.push(anchorRel)
    }
  }

  // 4. Conflict copy.
  if (whole) {
    // The remote folder wins wholesale: every pending upload under it is moot.
    for (const rel of input.pendingUpserts) if (rel.startsWith(prefix) && !plan.settle.includes(rel)) plan.settle.push(rel)
    plan.upload = []
    plan.force = []
    const pendingUnder = [...input.pendingUpserts].filter((rel) => rel.startsWith(prefix))
    plan.copyWhole = !(pendingUnder.length > 0 && pendingUnder.every((rel) => input.copiedUpserts.has(rel)))
  } else {
    plan.copySections = conflicts.filter((rel) => !input.copiedUpserts.has(rel)).map(fileName)
  }
  return plan
}

/**
 * The first-sync / gate-reopened catch-up (flushPendingLocalChanges): which
 * files of one note folder to upload. A file with a known base goes up only
 * when its content differs from that base (re-queuing a whole folder used to
 * clobber remote sections this device had not even touched); a file without
 * a base keeps the historical folder gate (`dirGate`: the anchor's `updated`
 * is newer than the previous lastSync, or there is none).
 */
export function filesNeedingCatchUp(
  files: ReadonlyArray<{ relPath: string; content: string }>,
  bases: Readonly<Record<string, CloudBase>>,
  dirGate: boolean,
): string[] {
  const out: string[] = []
  for (const f of files) {
    const base = bases[f.relPath]
    if (base ? hashForBase(f.relPath, f.content) !== base.hash : dirGate) out.push(f.relPath)
  }
  return out
}

/** Hash of a synthesized base whose content is unknown: never equals a real hash (always "local changed"). */
export const UNKNOWN_BASE_HASH = 'unknown'

/**
 * Bases of one local folder for the ONE-TIME bootstrap pull
 * (needsBasesBootstrap), for the files that have no real base yet. The pull
 * re-reads every row; per remote row of the folder:
 *   - SEEN by this device before (seq <= the previous watermark `seenSeq`,
 *     and not in the pull retry set — `notSeen`): its content is what this
 *     device last reconciled → a REAL base `{seq, hash(row)}` (`seen`: the
 *     caller persists it). Local identical → nothing to do; local different →
 *     a local change, kept and uploaded on top of that seq. A seen TOMBSTONE
 *     gets no base (the historical rule decides it);
 *   - NOT seen (a remote change made since this device last pulled): the
 *     version it replaced is gone from the server, so the base is ASSUMED
 *     (`assumed`, for the planner only), with a seq just below the row's:
 *       · the file has a pending upsert (an offline edit journaled before the
 *         first pull of this build), or the folder has unjournaled local edits
 *         (note.md not pending but its `updated` is after lastSync — Cloud
 *         disabled, CLI) → UNKNOWN content: both sides changed → identical =
 *         adopt, different = CONFLICT (remote in the note, local in a copy;
 *         note.md is merged) — never a silent overwrite;
 *       · otherwise the local file is taken as unchanged since the last sync
 *         (its own hash; '' when missing) → the remote change applies.
 * Mirrors what planFileReconcile needs: assumed bases always sit below the
 * row's seq, so a row is never 'keep'/'outdated' on a guess.
 */
export function synthesizeBootstrapBases(o: {
  dir: string
  local: Readonly<Record<string, string>>
  remote: readonly ThreeWayRemoteRow[]
  bases: Readonly<Record<string, CloudBase>>
  pendingUpserts: ReadonlySet<string>
  seenSeq: number | null
  notSeen: ReadonlySet<string>
  lastSyncMs: number | null
}): { seen: Record<string, CloudBase>; assumed: Record<string, CloudBase> } {
  const prefix = `${o.dir}/`
  const anchorRel = `${o.dir}/${NOTE_MD}`
  const seen: Record<string, CloudBase> = {}
  const assumed: Record<string, CloudBase> = {}
  const localAnchor = o.local[anchorRel]
  const localUpdatedMs = localAnchor === undefined ? null : updatedMsOf(localAnchor)
  const unjournaled =
    !o.pendingUpserts.has(anchorRel) && o.lastSyncMs !== null && localUpdatedMs !== null && localUpdatedMs > o.lastSyncMs
  for (const row of o.remote) {
    const rel = row.relPath
    if (!rel.startsWith(prefix) || o.bases[rel] || row.seq === null) continue
    if (o.seenSeq !== null && row.seq <= o.seenSeq && !o.notSeen.has(rel)) {
      if (row.content !== null) seen[rel] = { seq: row.seq, hash: hashForBase(rel, row.content) }
      continue
    }
    const local = o.local[rel]
    const hash =
      o.pendingUpserts.has(rel) || unjournaled
        ? UNKNOWN_BASE_HASH
        : local === undefined
          ? TOMBSTONE_BASE_HASH
          : hashForBase(rel, local)
    assumed[rel] = { seq: row.seq - 1, hash }
  }
  return { seen, assumed }
}

/**
 * Folders whose bootstrap reconcile FAILED (disk error → pull retry set) and
 * must still get the bootstrap context when their rows come back: their
 * assumed bases were never persisted, so without it the retry would fall back
 * to the historical LWW rule — the original bug. Persisted in
 * settings.cloudSync.basesBootstrapPending with the context of the bootstrap
 * pull (its previous watermark, lastSync and retry keys), written in the same
 * patch that advances pullSeq.
 */
export interface BasesBootstrapPending {
  seenSeq: number | null
  lastSyncMs: number | null
  retryKeys: string[]
  dirs: string[]
}

/** Tolerant read of settings.cloudSync.basesBootstrapPending (null = none / malformed). */
export function parseBootstrapPending(raw: unknown): BasesBootstrapPending | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = raw as Record<string, unknown>
  const dirs = stringArray(v.dirs)
  if (dirs.length === 0) return null
  const num = (x: unknown) => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : null)
  return { seenSeq: num(v.seenSeq), lastSyncMs: num(v.lastSyncMs), retryKeys: stringArray(v.retryKeys), dirs }
}

/**
 * The pending set after a pull. `started` = this pull WAS the bootstrap (its
 * context): the pending set becomes exactly the folders that failed. Otherwise
 * the folders reconciled with the pending context this time (`done`) leave;
 * failed ones stay. Empty → null (the setting is removed).
 */
export function nextBootstrapPending(
  prev: BasesBootstrapPending | null,
  pull: {
    started: Omit<BasesBootstrapPending, 'dirs'> | null
    failed: ReadonlySet<string>
    done: ReadonlySet<string>
  },
): BasesBootstrapPending | null {
  if (pull.started) return pull.failed.size > 0 ? { ...pull.started, dirs: [...pull.failed] } : null
  if (!prev) return null
  const dirs = prev.dirs.filter((d) => !pull.done.has(d))
  return dirs.length > 0 ? { ...prev, dirs } : null
}

/** Debounce of the pull a stale upload asks for (a burst of rejections = one pull). */
export const STALE_PULL_DELAY_MS = 3_000
/** Floor between two stale-triggered pulls: a file that keeps going stale can't loop pulls. */
export const STALE_PULL_MIN_INTERVAL_MS = 30_000

/** Delay before the pull a stale upload asks for, given when the previous stale-triggered pull ran (0 = never). */
export function staleResolvePullDelay(nowMs: number, lastStalePullMs: number): number {
  return Math.max(STALE_PULL_DELAY_MS, lastStalePullMs + STALE_PULL_MIN_INTERVAL_MS - nowMs)
}
