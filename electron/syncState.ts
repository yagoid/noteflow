// Pure state logic for GitHub sync durability: a persistent journal of pending
// remote mutations (so pushes/deletes that fail are retried instead of lost) and
// a cache of already-reconciled blob SHAs (so pullNotes can skip unchanged note
// dirs / metadata files without a per-file GET). Lives in electron/ but imports
// nothing from Electron — githubSync.ts injects the file IO — following the same
// pure-module pattern as electron/entitlements.ts. Persisted by githubSync.ts as
// `sync-state.json` in userData (LOCAL device state — never in the notes dir, it
// must not sync). Covered by tests/electron/syncState.test.ts.

export type SyncOpType = 'upsert' | 'delete' | 'deleteDir'

export interface SyncJournalOp {
  op: SyncOpType
  /** ISO timestamp of when the op was FIRST queued (kept across re-queues/retries). */
  queuedAt: string
  /** Failed attempts so far. Never used to drop an op — a lost remote delete = resurrected note. */
  attempts: number
}

export interface SyncState {
  version: 1
  /**
   * Pending remote mutations, keyed by notes-dir-relative path: '<dir>/<file>.md'
   * or '<name>.json' for upsert/delete ops, bare '<dir>' for deleteDir ops.
   */
  ops: Record<string, SyncJournalOp>
  /**
   * Blob SHAs (from the Git Trees API) already reconciled by a pull, keyed by
   * remote path: '<dir>/note.md' anchors, '<dir>/<sec>.md' sections (see
   * planSectionRefresh) and root metadata filenames.
   */
  shas: Record<string, string>
}

/** What retrySyncJournal should do for a journal entry, given local file existence. */
export type RetryAction = 'discard' | SyncOpType

const OP_TYPES: readonly SyncOpType[] = ['upsert', 'delete', 'deleteDir']

export function emptySyncState(): SyncState {
  return { version: 1, ops: {}, shas: {} }
}

/**
 * Tolerant deserialization: a missing, corrupt or wrong-shaped file degrades to
 * an empty state (sync must never be blocked by local state damage). Unknown or
 * malformed entries are dropped individually.
 */
export function parseSyncState(raw: string | null | undefined): SyncState {
  const state = emptySyncState()
  if (!raw) return state
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return state
  }
  if (typeof data !== 'object' || data === null) return state
  const obj = data as Record<string, unknown>

  if (typeof obj.ops === 'object' && obj.ops !== null) {
    for (const [key, value] of Object.entries(obj.ops as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue
      const entry = value as Record<string, unknown>
      if (!OP_TYPES.includes(entry.op as SyncOpType)) continue
      state.ops[key] = {
        op: entry.op as SyncOpType,
        queuedAt: typeof entry.queuedAt === 'string' ? entry.queuedAt : new Date(0).toISOString(),
        attempts: typeof entry.attempts === 'number' && Number.isFinite(entry.attempts) ? entry.attempts : 0,
      }
    }
  }

  if (typeof obj.shas === 'object' && obj.shas !== null) {
    for (const [key, value] of Object.entries(obj.shas as Record<string, unknown>)) {
      if (typeof value === 'string') state.shas[key] = value
    }
  }

  return state
}

export function serializeSyncState(state: SyncState): string {
  return JSON.stringify({ version: 1, ops: state.ops, shas: state.shas })
}

// ── Journal transitions ───────────────────────────────────────────────────────
// All mutators return true when the state actually changed (caller persists only then).

/**
 * Records a pending remote mutation. Re-recording the SAME op for a key is a
 * no-op (keeps queuedAt/attempts — e.g. a debounce timer being re-armed while
 * typing); a DIFFERENT op replaces the entry (e.g. a delete supersedes a
 * pending upsert of the same file). Recording a 'deleteDir' also drops every
 * file-level op under '<dir>/' — those files are going away with the dir, and
 * keeping their upserts would both block the pull deletion rule and make the
 * retry re-push files of a deleted note.
 */
export function journalRecord(state: SyncState, key: string, op: SyncOpType, nowIso: string): boolean {
  let changed = false
  if (op === 'deleteDir') {
    const prefix = `${key}/`
    for (const k of Object.keys(state.ops)) {
      if (k.startsWith(prefix)) {
        delete state.ops[k]
        changed = true
      }
    }
  }
  const existing = state.ops[key]
  if (existing && existing.op === op) return changed
  state.ops[key] = { op, queuedAt: nowIso, attempts: 0 }
  return true
}

/**
 * Records an op only when the key has NO entry at all. This is the safe form
 * for failure paths (the push catch blocks re-journal their upsert in case a
 * racing retry completed the entry under them): plain journalRecord would
 * REPLACE a newer 'delete'/'deleteDir' intent recorded for the same key while
 * the push was in flight — and if that delete then also fails (correlated
 * outage), its journalFail is an op-mismatch no-op, the journal is left as
 * 'upsert' for a file that no longer exists locally, and the next retry
 * DISCARDS it: the remote delete is silently lost and the section resurrects
 * on the next pull. Semantics: entry absent → re-created; entry present (same
 * or different op) → untouched (a same-op entry gets its attempts++ via
 * journalFail; a newer delete intent wins — the failed upsert is irrelevant,
 * the file is going away).
 */
export function journalRecordIfAbsent(state: SyncState, key: string, op: SyncOpType, nowIso: string): boolean {
  if (state.ops[key]) return false
  return journalRecord(state, key, op, nowIso)
}

/**
 * Removes a journal entry after the mutation landed remotely. Only removes when
 * the current entry matches `op` — a stale completion (e.g. an in-flight delete
 * finishing after the file was re-created and re-queued as upsert) must not
 * clear the newer intent.
 */
export function journalComplete(state: SyncState, key: string, op: SyncOpType): boolean {
  const entry = state.ops[key]
  if (!entry || entry.op !== op) return false
  delete state.ops[key]
  return true
}

/** Marks a failed attempt. The entry stays — nothing is ever dropped on failure. */
export function journalFail(state: SyncState, key: string, op: SyncOpType): boolean {
  const entry = state.ops[key]
  if (!entry || entry.op !== op) return false
  entry.attempts++
  return true
}

/**
 * Decides what the journal drain should do with an entry. An upsert whose local
 * file no longer exists is discarded — there is nothing left to push, and the
 * actual removal is covered by its own delete/deleteDir entry. Deletes are
 * always executed regardless of local state.
 */
export function resolveRetryAction(op: SyncOpType, localFileExists: boolean): RetryAction {
  if (op === 'upsert' && !localFileExists) return 'discard'
  return op
}

// ── Pull decisions ────────────────────────────────────────────────────────────

/**
 * Should pullNotes skip this REMOTE dir entirely? True while its remote
 * deleteDir hasn't landed — pulling it would resurrect a locally-deleted note.
 */
export function shouldPullSkipDir(state: SyncState, dir: string): boolean {
  return state.ops[dir]?.op === 'deleteDir'
}

/**
 * Should pullNotes skip writing this REMOTE file? True while its remote delete
 * hasn't landed — writing it would resurrect a locally-deleted section.
 */
export function shouldPullSkipFile(state: SyncState, relPath: string): boolean {
  return state.ops[relPath]?.op === 'delete'
}

/**
 * Should the pull's local-deletion rule keep this LOCAL dir even though the
 * remote doesn't have it? True while any file under '<dir>/' has a pending
 * upsert — its push never landed, so the remote absence doesn't mean "deleted
 * remotely" and removing the dir locally would be data loss. The journal entry
 * exists from the moment the debounce timer is ARMED, so this also covers the
 * 5 s debounce window. The Cloud pull applies the same guard to an anchor
 * tombstone (remote deletion of the whole note).
 */
export function shouldDeletionRuleSkipDir(state: SyncState, dir: string): boolean {
  const prefix = `${dir}/`
  for (const [key, entry] of Object.entries(state.ops)) {
    if (entry.op === 'upsert' && key.startsWith(prefix)) return true
  }
  return false
}

/**
 * Is there a pending (not yet landed) upsert of exactly this file? A remote
 * deletion of it must not be applied locally meanwhile: that would remove the
 * unpushed edit from disk, and the journal drain would then DISCARD the upsert
 * (resolveRetryAction: local file gone) — the edit lost for good. Used by the
 * Cloud pull for loose-section tombstones (the dir-level counterpart is
 * shouldDeletionRuleSkipDir) and by the GitHub pull's section refresh.
 */
export function hasPendingUpsert(state: SyncState, relPath: string): boolean {
  return state.ops[relPath]?.op === 'upsert'
}

/**
 * Should the pull run its local-deletion rule at all ("dir absent from remote +
 * older than lastSync ⇒ it was deleted remotely")? The rule is only sound while
 * `lastSync` really means "the remote knew everything on disk at that instant":
 * - `lastSyncTime === null`: never synced — nothing can be assumed deleted.
 * - `!remoteIsV2`: format v1↔v2 transition guard, the pull is additive only.
 * - `cloudEnabled`: NoteFlow Cloud is the active provider, so GitHub Sync is
 *   PAUSED (no pushes are routed to it) and its `lastSync` no longer tracks what
 *   the repo actually holds — notes arriving via Cloud never reach it while
 *   looking "older than lastSync". While paused GitHub is a write-only mirror:
 *   it may never delete anything locally. This is the bug that made a user lose
 *   42 notes on a manual pull from Settings → Sync → GitHub.
 * - `needsFullReconcile`: one-shot flag set when Cloud takes over, consumed by
 *   the first successful GitHub pull. It governs the FULL upload catch-up (and
 *   also blocks deletion, for the window where it outlives `cloudEnabled` — e.g.
 *   Cloud disabled again before that first pull, with `lastSync` still stale).
 * - `treeTruncated`: GitHub cut the recursive tree listing short (very large
 *   repo). "Absent from the listing" then doesn't mean "absent from the remote",
 *   so the rule would delete local notes that still exist remotely.
 */
export function shouldRunDeletionRule(
  lastSyncTime: number | null,
  needsFullReconcile: boolean,
  cloudEnabled: boolean,
  remoteIsV2: boolean,
  treeTruncated: boolean,
): boolean {
  if (needsFullReconcile || cloudEnabled || treeTruncated) return false
  // An unparseable lastSync (NaN) must not authorize deletions either: every
  // `updated > lastSync` comparison would be false and the rule would delete
  // every dir missing from the remote.
  if (lastSyncTime === null || !Number.isFinite(lastSyncTime)) return false
  return remoteIsV2
}

// ── Reconciled-SHA cache ──────────────────────────────────────────────────────

export function getCachedSha(state: SyncState, relPath: string): string | undefined {
  return state.shas[relPath]
}

export function setCachedSha(state: SyncState, relPath: string, sha: string): boolean {
  if (state.shas[relPath] === sha) return false
  state.shas[relPath] = sha
  return true
}

/** A blob of the remote tree (GitHub Git Trees API): notes-dir-relative path + git blob sha. */
export interface TreeBlobRef {
  path: string
  sha: string
}

/**
 * Blobs to delete for a remote note folder ('<dir>' → every blob under
 * '<dir>/'). THROWS when the tree listing came back truncated (GitHub caps
 * recursive listings of very large repos): files of the folder may be missing
 * from it, and deleting only the listed ones would let the caller complete the
 * journal entry while the rest of the note stays on the remote. Throwing
 * BEFORE deleting anything keeps the 'deleteDir' journaled (retried) and the
 * remote note whole — never half-deleted.
 */
export function planRemoteDirDelete(blobs: TreeBlobRef[], truncated: boolean, dir: string): TreeBlobRef[] {
  if (truncated) {
    throw new Error(`the remote file listing is truncated (repository too large) — cannot safely delete "${dir}"`)
  }
  return blobs.filter((b) => b.path.startsWith(`${dir}/`))
}

/** Section blobs of one remote note folder, split by what the pull must do with them. */
export interface SectionRefreshPlan {
  /** The local file already holds exactly this blob: just record its sha (no request). */
  adopt: TreeBlobRef[]
  /** Remote content differs from the reconciled sha AND from the local file. */
  changed: TreeBlobRef[]
}

/**
 * May the GitHub pull REFRESH sections of the same version (download a section
 * blob over the local file)? Not while GitHub is a stale mirror by design:
 *   - `cloudEnabled`: NoteFlow Cloud is the active provider and GitHub only
 *     gets the pull's upload catch-up, which filters by the anchor's `updated`.
 *     A note can reach GitHub as "anchor t2 + old section X" while Cloud
 *     already brought X' to disk with the same t2 — refreshing would write X
 *     over X', and the catch-up (compared against the tree just read) would
 *     then drop the X' upload: X' lost.
 *   - `needsFullReconcile`: the first pull after Cloud is switched off; the
 *     repo is still that stale mirror until its full catch-up lands.
 * Read `cloudEnabled` fail-closed (isCloudSyncEnabledFailClosed), like the
 * deletion rule. When false the pull keeps the historical skip.
 */
export function shouldRefreshSections(needsFullReconcile: boolean, cloudEnabled: boolean): boolean {
  return !needsFullReconcile && !cloudEnabled
}

export interface SectionRefreshOptions {
  /** shouldRefreshSections(...): false → nothing is ever `changed` (no anchor GET, no write, no cache). */
  refreshAllowed: boolean
  /**
   * Whether the LOCAL anchor (note.md) lists this section file. Unlisted blobs
   * are never `changed`: e.g. two devices migrating the same v1 note to v2 get
   * the same `updated` but different random section ids, and the other
   * device's files would land here as orphans.
   */
  isListedLocally: (relPath: string) => boolean
}

/**
 * GitHub pull, per note folder: which SECTION blobs of the tree are not
 * reconciled yet. The anchor sha alone can't tell: the push uploads note.md and
 * the sections in SEPARATE commits, so a pull landing in between applies the
 * new anchor with the old sections and caches the anchor sha — from then on the
 * folder would be skipped forever and the new sections never downloaded.
 * Per section:
 *   - pending remote delete (shouldPullSkipFile) or pending upsert of the local
 *     file (unpushed edit) → ignored: its own journal op will change the remote;
 *   - tree sha == cached (reconciled) sha → nothing to do;
 *   - tree sha == sha of the LOCAL file → `adopt` (cache it, zero requests —
 *     covers this device's own pushes and caches written by older builds);
 *   - refresh not allowed (stale mirror, see shouldRefreshSections) or not
 *     listed by the local anchor → ignored (historical skip, NOT cached);
 *   - otherwise → `changed` (the caller decides with the anchors' `updated`).
 * `localSha` returns the git blob sha of the local file, or null if missing /
 * unreadable; it is only called for blobs that are not cached, so the steady
 * state costs no disk reads.
 */
export function planSectionRefresh(
  state: SyncState,
  sections: TreeBlobRef[],
  localSha: (relPath: string) => string | null,
  opts: SectionRefreshOptions,
): SectionRefreshPlan {
  const plan: SectionRefreshPlan = { adopt: [], changed: [] }
  for (const blob of sections) {
    if (shouldPullSkipFile(state, blob.path) || hasPendingUpsert(state, blob.path)) continue
    if (state.shas[blob.path] === blob.sha) continue
    if (localSha(blob.path) === blob.sha) plan.adopt.push(blob)
    else if (opts.refreshAllowed && opts.isListedLocally(blob.path)) plan.changed.push(blob)
  }
  return plan
}

/** Drops cached SHAs for paths no longer present in the remote tree (keeps the file bounded). */
export function pruneShas(state: SyncState, presentPaths: ReadonlySet<string>): boolean {
  let changed = false
  for (const key of Object.keys(state.shas)) {
    if (!presentPaths.has(key)) {
      delete state.shas[key]
      changed = true
    }
  }
  return changed
}
