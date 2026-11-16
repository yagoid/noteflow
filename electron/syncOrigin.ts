// Origin of the notes dir — which remote this device's notes dir belongs to,
// per sync backend. Backend-agnostic: GitHub Sync uses it today; NoteFlow Cloud
// (identity = account userId) and the CLI read and write the same key.
//
// The problem it solves: the local notes dir does not know which remote it was
// reconciled with. Connecting GitHub to repo A, disconnecting and connecting to
// repo B used to merge everything: A's notes were uploaded to B without asking.
// Now each backend remembers the identity it last reconciled the dir with
// (`settings.json → syncOrigin`, userData — LOCAL, never synced) and a change of
// identity with local notes on disk asks the user first (merge / use only the
// remote's notes / cancel).
//
// Shape of `settings.syncOrigin` (Cloud and the CLI read it — keep it stable):
//   { github?: { repoId: number; owner: string; repo: string },
//     cloud?:  { userId: string } }
// `github.repoId` is GitHub's numeric repo id (survives renames and transfers);
// it is always written when known — the app fetches it before adopting an
// identity, so it is only missing if GET /repos/{owner}/{repo} failed at that
// moment (the next successful pull backfills it). Comparison: by repoId when
// both sides have it, else owner/repo case-insensitively.
//
// Pure decision + pure helpers over a parsed settings object, plus thin file
// wrappers (fs only, no Electron) — same pattern as syncState.ts. Tested in
// tests/electron/syncOrigin.test.ts.

import fs from 'fs'
import path from 'path'
import { writeSettingsFile } from './settingsFile'
import { listSyncedNoteDirs } from './localOnlyNotes'

export type SyncBackendKind = 'github' | 'cloud'

/** A remote identity a notes dir can be reconciled with. */
export type SyncIdentity =
  | { kind: 'github'; owner: string; repo: string; repoId?: number }
  | { kind: 'cloud'; userId: string }

/** Stored JSON of one backend (see the module comment for the exact shape). */
export interface GithubOriginRecord {
  /** Present whenever it was known when written (always, in practice). */
  repoId?: number
  owner: string
  repo: string
}
export interface CloudOriginRecord {
  userId: string
}
export interface SyncOriginRecord {
  github?: GithubOriginRecord
  cloud?: CloudOriginRecord
}

/** Key of the origin record inside settings.json. */
export const SYNC_ORIGIN_KEY = 'syncOrigin'

// ── Comparison ────────────────────────────────────────────────────────────────

/**
 * Same remote? GitHub: by numeric repoId when BOTH sides carry it (a renamed or
 * transferred repo keeps its id), otherwise owner/repo case-insensitively
 * (GitHub names are case-insensitive). Cloud: by userId. Different kinds never match.
 */
export function sameIdentity(a: SyncIdentity, b: SyncIdentity): boolean {
  if (a.kind === 'github' && b.kind === 'github') {
    if (typeof a.repoId === 'number' && typeof b.repoId === 'number') return a.repoId === b.repoId
    return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
  }
  if (a.kind === 'cloud' && b.kind === 'cloud') return a.userId === b.userId
  return false
}

/** Whether every stored field already equals the new identity's (nothing to rewrite). */
function identicalRecord(stored: SyncIdentity, next: SyncIdentity): boolean {
  if (stored.kind === 'github' && next.kind === 'github') {
    return (
      stored.owner === next.owner &&
      stored.repo === next.repo &&
      (next.repoId === undefined || stored.repoId === next.repoId)
    )
  }
  if (stored.kind === 'cloud' && next.kind === 'cloud') return stored.userId === next.userId
  return false
}

// ── Labels ────────────────────────────────────────────────────────────────────

/** Human-readable label: 'owner/repo' for GitHub, the userId for Cloud (the UI shows its own email). */
export function identityLabel(id: SyncIdentity): string {
  return id.kind === 'github' ? `${id.owner}/${id.repo}` : id.userId
}

/**
 * Folder-name-safe label of an identity, used to name its archive folder:
 * 'github-<owner>-<repo>' / 'cloud-<first 8 chars of the userId>'. Only
 * [a-z0-9._-], lowercased, bounded.
 */
export function identityArchiveLabel(id: SyncIdentity): string {
  const raw = id.kind === 'github' ? `github-${id.owner}-${id.repo}` : `cloud-${id.userId.slice(0, 8)}`
  return sanitizeLabel(raw)
}

/** [a-z0-9._-] only (other runs → '-'), no leading dots/dashes, at most 80 chars; never empty. */
export function sanitizeLabel(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 80)
    .replace(/[.-]+$/, '')
  return cleaned || 'origin'
}

// ── Reading / writing the record inside a parsed settings object ─────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Tolerant parse of `settings.syncOrigin` (malformed entries are ignored). */
export function readSyncOrigin(settings: Record<string, unknown>): SyncOriginRecord {
  const raw = settings[SYNC_ORIGIN_KEY]
  if (!isObject(raw)) return {}
  const out: SyncOriginRecord = {}
  const gh = raw.github
  if (isObject(gh) && typeof gh.owner === 'string' && gh.owner && typeof gh.repo === 'string' && gh.repo) {
    out.github = { owner: gh.owner, repo: gh.repo }
    if (typeof gh.repoId === 'number' && Number.isFinite(gh.repoId)) out.github = { repoId: gh.repoId, ...out.github }
  }
  const cl = raw.cloud
  if (isObject(cl) && typeof cl.userId === 'string' && cl.userId) out.cloud = { userId: cl.userId }
  return out
}

/** The identity stored for one backend, or undefined (never reconciled / unknown). */
export function getStoredIdentity(settings: Record<string, unknown>, kind: SyncBackendKind): SyncIdentity | undefined {
  const origin = readSyncOrigin(settings)
  if (kind === 'github') {
    const gh = origin.github
    return gh ? { kind: 'github', owner: gh.owner, repo: gh.repo, ...(gh.repoId !== undefined ? { repoId: gh.repoId } : {}) } : undefined
  }
  const cl = origin.cloud
  return cl ? { kind: 'cloud', userId: cl.userId } : undefined
}

/**
 * A copy of `settings` with the backend's origin set to `id`. Every other key —
 * including the other backend's origin and unknown keys written by a newer
 * client — is preserved. Does not mutate the input.
 */
export function withSyncOrigin(settings: Record<string, unknown>, id: SyncIdentity): Record<string, unknown> {
  const current = isObject(settings[SYNC_ORIGIN_KEY]) ? { ...(settings[SYNC_ORIGIN_KEY] as Record<string, unknown>) } : {}
  if (id.kind === 'github') {
    current.github = {
      ...(typeof id.repoId === 'number' ? { repoId: id.repoId } : {}),
      owner: id.owner,
      repo: id.repo,
    } satisfies GithubOriginRecord
  } else {
    current.cloud = { userId: id.userId } satisfies CloudOriginRecord
  }
  return { ...settings, [SYNC_ORIGIN_KEY]: current }
}

// ── Decision ──────────────────────────────────────────────────────────────────

export type OriginDecision =
  | {
      action: 'proceed'
      /** Write `next` as the backend's origin now (before syncing anything). */
      adopt: boolean
      /**
       * - `no-origin`: nothing stored for the backend — first connection, or an
       *   install from before this feature with a live connection: adopted
       *   without asking (same rule as Cloud's "unknown owner").
       * - `same`: same remote (adopt only refreshes renamed owner/repo or a
       *   missing repoId).
       * - `changed-empty`: another remote, but no synced notes on disk — nothing
       *   to protect; the per-remote sync state must be reset by the caller.
       */
      reason: 'no-origin' | 'same' | 'changed-empty'
    }
  | {
      action: 'ask'
      previous: SyncIdentity
      next: SyncIdentity
    }

/**
 * Should syncing with `next` go ahead, or must the user choose first?
 * Asks ONLY when the identity changed AND there are synced notes on disk.
 * `hasLocalNotes` is lazy — the dir is only listed when the identity changed —
 * and must answer true when it can't tell (fail-closed).
 */
export function decideOrigin(input: {
  stored: SyncIdentity | undefined
  next: SyncIdentity
  hasLocalNotes: () => boolean
}): OriginDecision {
  const { stored, next } = input
  if (!stored) return { action: 'proceed', adopt: true, reason: 'no-origin' }
  if (sameIdentity(stored, next)) return { action: 'proceed', adopt: !identicalRecord(stored, next), reason: 'same' }
  if (!input.hasLocalNotes()) return { action: 'proceed', adopt: true, reason: 'changed-empty' }
  return { action: 'ask', previous: stored, next }
}

// ── IO wrappers (fs only) ─────────────────────────────────────────────────────

/**
 * Are there notes on disk that would sync (folders with a note.md, minus the
 * local-only ones)? Fail-closed: a notes dir that can't be listed — or isn't
 * given — answers true. An existing but EMPTY dir answers false.
 */
export function hasSyncedLocalNotes(notesDir: string | null | undefined): boolean {
  if (!notesDir) return true
  try {
    fs.readdirSync(notesDir) // listNoteDirs swallows errors into [] — probe explicitly
  } catch (err) {
    // A notes dir that doesn't exist yet holds no notes.
    return (err as NodeJS.ErrnoException)?.code !== 'ENOENT'
  }
  try {
    return listSyncedNoteDirs(notesDir).length > 0
  } catch {
    return true
  }
}

/** settings.json parsed, or null when it can't be read/parsed (fail-closed callers). Missing file → {}. */
export function readSettingsStrict(settingsPath: string): Record<string, unknown> | null {
  let raw: string
  try {
    raw = fs.readFileSync(settingsPath, 'utf-8')
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'ENOENT' ? {} : null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Read-modify-write of the backend's origin in settings.json: re-reads the file
 * right before writing so keys written by others (the CLI shares this file on
 * Windows) are kept. Refuses (returns false) when the file exists but can't be
 * parsed — writing would wipe it.
 */
export function writeSyncOriginFile(settingsPath: string, id: SyncIdentity): boolean {
  const current = readSettingsStrict(settingsPath)
  if (current === null) return false
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    writeSettingsFile(settingsPath, withSyncOrigin(current, id))
    return true
  } catch {
    return false
  }
}
