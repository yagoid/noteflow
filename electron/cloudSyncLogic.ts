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
import { NOTE_MD, splitFrontmatter } from './noteFormat'
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
export function planPullQuery(s: {
  pullSeq?: number
  pullCursor?: string
  lastSync?: string
}): PullPlan {
  if (typeof s.pullSeq === 'number' && Number.isSafeInteger(s.pullSeq) && s.pullSeq >= 0) {
    return { afterSeq: s.pullSeq, includeDeleted: true }
  }
  if (s.pullCursor || s.lastSync) return { afterSeq: 0, includeDeleted: true }
  return { afterSeq: 0, includeDeleted: false }
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
 * — undecryptable and unsafe-path rows included: they will never become
 * decryptable/safe, so waiting on them would re-fetch them forever. Starts at
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
