// Pure state logic for GitHub sync durability: a persistent journal of pending
// remote mutations (so pushes/deletes that fail are retried instead of lost) and
// a cache of already-reconciled blob SHAs (so pullNotes can skip unchanged note
// dirs / metadata files without a per-file GET, and the BASE of the conditional
// push's three-way check — see "GitHub conditional push" below). Lives in electron/ but imports
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
  /**
   * The conditional mutation of this op was REJECTED because the remote already
   * holds a version this device never saw. Still a local change the remote
   * lacks — the deletion guards keep seeing it as pending — but the journal
   * drain skips it: re-sending would be rejected again. The pull resolves it
   * (the remote version is applied, the local one kept as a conflict copy when
   * it differs, and the op completed), and a new local edit re-records the op,
   * which clears the flag.
   *   - NoteFlow Cloud: `upsert` ops only (RPC cloud_upsert_file said "stale":
   *     the server holds a newer version of the note folder).
   *   - GitHub Sync: `upsert` AND `delete` ops of note files (the three-way
   *     check of planConditionalUpsert / planConditionalDelete found that the
   *     remote file changed since this device last reconciled it).
   */
  stale?: true
  /**
   * NoteFlow Cloud only (GitHub ignores it): upload UNCONDITIONALLY (intentional resurrection of a
   * folder kept over a remote tombstone — the tombstone is newer than the local
   * edit by design, so a conditional upload would be rejected). Survives
   * re-records and failed attempts so a failed forced push is retried forced.
   */
  force?: true
  /**
   * Both backends: the pull already preserved the local content of this
   * pending upsert as a CONFLICT COPY (a new note folder) before applying a
   * newer remote version of its folder over it (or deleting it). Set on every
   * pending upsert under the folder (journalMarkDirConflictCopied) so a retry
   * of a half-failed apply does not make a second identical copy; a new local
   * edit re-records the op and clears it (that edit is new content).
   */
  conflictCopied?: true
}

/** Options of journalRecord — only NoteFlow Cloud passes them. */
export interface JournalRecordOptions {
  /** Flag an upsert as forced (see SyncJournalOp.force). Never cleared by a later non-forced record. */
  force?: boolean
}

export interface SyncState {
  version: 1
  /**
   * Pending remote mutations, keyed by notes-dir-relative path: '<dir>/<file>.md'
   * or '<name>.json' for upsert/delete ops, bare '<dir>' for deleteDir ops.
   */
  ops: Record<string, SyncJournalOp>
  /**
   * Blob SHAs already reconciled by this device, keyed by remote path:
   * '<dir>/note.md' anchors, '<dir>/<sec>.md' sections (see
   * planSectionRefresh) and root metadata filenames. Written by the pull (tree
   * sha) AND after every push of this device (sha of the content it uploaded,
   * or found identical) — it is the BASE of the GitHub three-way check
   * (planConditionalUpsert & co.).
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
      const op: SyncJournalOp = {
        op: entry.op as SyncOpType,
        queuedAt: typeof entry.queuedAt === 'string' ? entry.queuedAt : new Date(0).toISOString(),
        attempts: typeof entry.attempts === 'number' && Number.isFinite(entry.attempts) ? entry.attempts : 0,
      }
      // Op flags: kept only in their exact `true` form. `stale` exists on
      // upserts (both backends) and on GitHub's section deletes.
      if ((op.op === 'upsert' || op.op === 'delete') && entry.stale === true) op.stale = true
      if (op.op === 'upsert' && entry.force === true) op.force = true
      if (op.op === 'upsert' && entry.conflictCopied === true) op.conflictCopied = true
      state.ops[key] = op
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
 * Records a pending remote mutation. Re-recording the SAME op for a key keeps
 * queuedAt/attempts (e.g. a debounce timer being re-armed while typing); for an
 * upsert it also clears `stale` (a new local edit — its upload deserves a new
 * conditional attempt) and `conflictCopied` (the new content was never copied)
 * and adds `force` when asked, but never drops an
 * existing `force`. A DIFFERENT op replaces the entry (e.g. a delete
 * supersedes a pending upsert of the same file). Recording a 'deleteDir' also
 * drops every file-level op under '<dir>/' — those files are going away with
 * the dir, and keeping their upserts would both block the pull deletion rule
 * and make the retry re-push files of a deleted note.
 */
export function journalRecord(
  state: SyncState,
  key: string,
  op: SyncOpType,
  nowIso: string,
  opts?: JournalRecordOptions,
): boolean {
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
  const force = op === 'upsert' && opts?.force === true
  const existing = state.ops[key]
  if (existing && existing.op === op) {
    if (existing.stale) {
      delete existing.stale
      changed = true
    }
    if (existing.conflictCopied) {
      delete existing.conflictCopied
      changed = true
    }
    if (force && !existing.force) {
      existing.force = true
      changed = true
    }
    return changed
  }
  state.ops[key] = force ? { op, queuedAt: nowIso, attempts: 0, force: true } : { op, queuedAt: nowIso, attempts: 0 }
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
export function journalRecordIfAbsent(
  state: SyncState,
  key: string,
  op: SyncOpType,
  nowIso: string,
  opts?: JournalRecordOptions,
): boolean {
  if (state.ops[key]) return false
  return journalRecord(state, key, op, nowIso, opts)
}

/**
 * Flags a pending op as `stale` (its conditional mutation was rejected — the
 * remote holds a version this device never saw). Only an EXISTING entry of
 * exactly `op` is flagged, never re-created: if the pull already reconciled the
 * path (and completed the op) while the mutation was in flight, there is
 * nothing left to keep — re-creating it would leave a phantom pending edit that
 * guards the note against remote deletions forever. NoteFlow Cloud only ever
 * flags upserts (the default); GitHub also flags section deletes.
 */
export function journalMarkStale(state: SyncState, key: string, op: 'upsert' | 'delete' = 'upsert'): boolean {
  const entry = state.ops[key]
  if (!entry || entry.op !== op || entry.stale) return false
  entry.stale = true
  return true
}

/**
 * NoteFlow Cloud: flags EVERY pending upsert under '<dir>/' as stale — the
 * pull is about to apply a strictly newer remote version of the folder
 * wholesale (the local version lost, LWW). Done BEFORE the first disk write:
 * if the apply fails halfway, a still-live upsert of a section would be
 * drained with the content of the losing version but the `updated` of the
 * remote anchor just written (a tie the server accepts) and clobber the
 * server's newer section. Stale ops are skipped by the drain and resolved by
 * the retry of the failed apply. Forced ops are flagged too (their
 * resurrection lost against a newer remote version).
 */
export function journalMarkDirStale(state: SyncState, dir: string): boolean {
  const prefix = `${dir}/`
  let changed = false
  for (const [key, entry] of Object.entries(state.ops)) {
    if (entry.op === 'upsert' && key.startsWith(prefix) && !entry.stale) {
      entry.stale = true
      changed = true
    }
  }
  return changed
}

/**
 * Both backends: flags EVERY pending upsert under '<dir>/' as
 * `conflictCopied` — the pull has just written a conflict copy holding their
 * local content (see SyncJournalOp.conflictCopied). Persisted right after the
 * copy is written and BEFORE the folder is overwritten/deleted.
 */
export function journalMarkDirConflictCopied(state: SyncState, dir: string): boolean {
  const prefix = `${dir}/`
  let changed = false
  for (const [key, entry] of Object.entries(state.ops)) {
    if (entry.op === 'upsert' && key.startsWith(prefix) && !entry.conflictCopied) {
      entry.conflictCopied = true
      changed = true
    }
  }
  return changed
}

/**
 * NoteFlow Cloud pull: the pending upserts under '<dir>/' (stale or not) whose
 * local content has NOT been preserved as a conflict copy yet — the candidates
 * planConflictCopy (cloudSyncLogic.ts) compares against the server's version.
 */
export function conflictCopyCandidates(state: SyncState, dir: string): string[] {
  const prefix = `${dir}/`
  const out: string[] = []
  for (const [key, entry] of Object.entries(state.ops)) {
    if (entry.op === 'upsert' && key.startsWith(prefix) && !entry.conflictCopied) out.push(key)
  }
  return out
}

/**
 * NoteFlow Cloud pull: what to do with a remote ANCHOR TOMBSTONE of a folder
 * that exists locally, given its pending upserts:
 *   - 'none'  → nothing pending: the usual deletion rule (updated <= lastSync);
 *   - 'keep'  → at least one pending upsert is NOT stale — an unsynced local
 *               edit the server never rejected: keep the note and re-upload it
 *               forced (intentional resurrection);
 *   - 'lost'  → every pending upsert is stale — the server already said the
 *               local version lost against a newer one, and that newer version
 *               is now deleted — AND the local note is not newer than the
 *               deletion (`localUpdatedMs <= tombstoneUpdatedMs`; a tombstone's
 *               updated_at is the deletion time): complete the stale ops and
 *               delete locally (LWW; the local copy is a known-lost version).
 *               The timestamp check is required because the journal does not
 *               see every local edit: edits made while Cloud is disabled or by
 *               the CLI are never journaled by the app (edits made while the
 *               push gate is closed — before the first pull, keys locked — ARE
 *               journaled, see planLocalPush) — a local `updated` newer than
 *               the deletion is such an edit, so it is kept ('keep').
 *               Unknown local `updated` (null) → 'keep' (never delete blind).
 */
export type AnchorTombstoneAction = 'none' | 'keep' | 'lost'

export function planAnchorTombstone(
  state: SyncState,
  dir: string,
  localUpdatedMs: number | null,
  tombstoneUpdatedMs: number,
): AnchorTombstoneAction {
  const prefix = `${dir}/`
  let pending = 0
  let stale = 0
  for (const [key, entry] of Object.entries(state.ops)) {
    if (entry.op !== 'upsert' || !key.startsWith(prefix)) continue
    pending++
    if (entry.stale) stale++
  }
  if (pending === 0) return 'none'
  if (stale < pending) return 'keep'
  return localUpdatedMs !== null && localUpdatedMs <= tombstoneUpdatedMs ? 'lost' : 'keep'
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

/**
 * Is this GitHub API error answer the "repository has no commits yet" case?
 * Connecting to an existing but EMPTY repo is legitimate: the Git Trees API
 * (the pull's listing) replies HTTP 409 "Git Repository is empty." and the
 * Contents API 404 "This repository is empty." — there is simply nothing to
 * list, so the pull must treat it as an empty remote, not a failure (it used to
 * leave initialPullStatus 'failed' and the error visible until a manual sync).
 * Safe for the deletion rule: an empty listing has no v2 marker, so
 * shouldRunDeletionRule never deletes anything from it. Both the status and
 * GitHub's message must match — any other 409/404 stays an error.
 */
export function isGitHubEmptyRepoError(status: number | undefined, message: string): boolean {
  return (status === 409 || status === 404) && /repository is empty/i.test(message)
}

// ── GitHub conditional push (three-way check per file) ────────────────────────
// The Contents API's `sha` is only a concurrency token: a PUT/DELETE carrying
// the CURRENT sha always lands, so a push queued (or drained from the journal)
// after another device updated the same file used to overwrite that update
// everywhere, with no copy and no notice (QA B3). The fix is a three-way
// comparison per note file, with the reconciled-SHA cache as the BASE:
//   B = `state.shas[p]` — the blob this device last reconciled (pulled,
//       adopted, or pushed itself). undefined = unknown;
//   R = the blob currently on GitHub (Contents API GET sha, or the tree sha
//       in the pull). null = absent;
//   L = git blob sha of the local content. null = absent.
// "The remote moved since this device saw it" = B defined && R !== B.
// An unknown base (B undefined: cache lost, pre-upgrade files, first connect)
// keeps the historical last-writer-wins behaviour — never a spurious conflict.
// Only note files ('<dir>/<file>.md') are conditional, and only while GitHub
// is the active provider (NoteFlow Cloud off, read fail-closed): root metadata
// JSONs, the README, the format marker and the Cloud-mode mirror stay
// unconditional.

/** Note files ('<dir>/<file>.md') are the only conditional remote paths. */
export function isNoteFilePath(relPath: string): boolean {
  return /^[^/]+\/[^/]+\.md$/.test(relPath)
}

/** One note file seen from the three sides (see the section comment above). */
export interface ThreeWayShas {
  base: string | undefined
  remote: string | null
  local: string | null
}

/**
 * Has BOTH sides changed this file since the base, to different contents?
 * B defined && R !== B && L !== B && L !== R. Unknown base → never.
 */
export function isThreeWayConflict(s: ThreeWayShas): boolean {
  return s.base !== undefined && s.remote !== s.base && s.local !== s.base && s.local !== s.remote
}

/**
 * Upload of a note file (`local` = blob sha of the content being pushed):
 *   - 'identical' → the remote already holds exactly this content: no PUT
 *                   (the commit-free guard), cache it as the base;
 *   - 'put'       → absent remotely (create — also when the base is known: a
 *                   local edit beats a remote deletion, like Cloud's
 *                   resurrection), unknown base (historical), or the remote is
 *                   still the base;
 *   - 'conflict'  → the remote moved since this device saw it: NO PUT — the
 *                   op is flagged stale and the pull resolves the folder.
 * It is 'conflict' even when the content being pushed IS the base (an old
 * version re-sent): pushing it would revert the remote change.
 */
export type ConditionalUpsertPlan = 'identical' | 'put' | 'conflict'

export function planConditionalUpsert(
  base: string | undefined,
  remote: string | null,
  local: string,
): ConditionalUpsertPlan {
  if (remote !== null && remote === local) return 'identical'
  if (remote === null) return 'put'
  if (base === undefined || remote === base) return 'put'
  return 'conflict'
}

/**
 * Removal of a note file (a dropped section):
 *   - 'gone'     → nothing on the remote, nothing to do;
 *   - 'delete'   → unknown base (historical) or the remote is still the base;
 *   - 'conflict' → the remote file changed since this device saw it: NO
 *                  DELETE (the remote edit would vanish) — the op is flagged
 *                  stale and the pull restores the remote folder.
 */
export type ConditionalDeletePlan = 'gone' | 'delete' | 'conflict'

export function planConditionalDelete(base: string | undefined, remote: string | null): ConditionalDeletePlan {
  if (remote === null) return 'gone'
  if (base === undefined || remote === base) return 'delete'
  return 'conflict'
}

/**
 * Removal of a whole note folder (deleteDir): the blobs of the folder that
 * changed remotely since this device last reconciled them (base known and
 * tree sha different). Non-empty → the caller must NOT delete anything — the
 * remote edit beats the local deletion: the 'deleteDir' op is completed, the
 * cached bases under the folder dropped, and the next pull downloads the
 * remote note again. `ignore` = paths this device itself mutated after the
 * tree listing was taken (their tree sha is older than the cached base).
 */
export function remoteDirChangesSinceBase(
  state: SyncState,
  blobs: readonly TreeBlobRef[],
  ignore?: (relPath: string) => boolean,
): string[] {
  const changed: string[] = []
  for (const b of blobs) {
    if (ignore?.(b.path)) continue
    const base = state.shas[b.path]
    if (base !== undefined && base !== b.sha) changed.push(b.path)
  }
  return changed
}

/** Is any op under '<dir>/' flagged stale (a rejected conditional mutation)? */
export function hasStaleOpUnder(state: SyncState, dir: string): boolean {
  const prefix = `${dir}/`
  for (const [key, entry] of Object.entries(state.ops)) {
    if (entry.stale && key.startsWith(prefix)) return true
  }
  return false
}

/** GitHub pull: what to do with a remote note folder (planGithubDirConflict). */
export interface GithubDirConflictPlan {
  /** Take the conflict path: remote folder applied wholesale, local kept as a copy if it differs. */
  conflict: boolean
  /**
   * No conflict, but the remote moved and every local file is still at its
   * base (or already equal to the remote, or absent with no base): apply the
   * remote folder WHATEVER the `updated:` timestamps say (clock skew, a web-UI
   * edit that kept `updated`). Never set together with `conflict`.
   */
  fastForward: boolean
  /**
   * Local files changed since their base (or with an unknown base) — the
   * candidates planConflictCopy compares with the remote version. Empty when
   * every pending upsert under the folder is already `conflictCopied` (a retry
   * of a half-failed apply must not copy twice); one pending upsert WITHOUT
   * the flag (a newer edit) brings the copy back. Always empty for a
   * fast-forward.
   */
  copyCandidates: string[]
}

/**
 * GitHub pull, per remote note folder (only while GitHub is the active
 * provider): the folder takes the CONFLICT PATH when an op under it is stale
 * (the push/delete already found the remote moved) OR any of its files — tree
 * ∪ cached ∪ local — is a three-way conflict (isThreeWayConflict). The latter
 * needs no journal: it also catches edits the app never journaled (the CLI
 * with the app closed) and the "local strictly newer" case, where the
 * historical rule kept the local folder and the next push overwrote the
 * remote edit. Without a conflict it may still be a FAST-FORWARD (see
 * GithubDirConflictPlan.fastForward), applied through the same path with no
 * copy. `paths` carries every file of the folder with its three shas.
 */
export function planGithubDirConflict(
  state: SyncState,
  dir: string,
  paths: ReadonlyArray<ThreeWayShas & { path: string }>,
): GithubDirConflictPlan {
  const conflict = hasStaleOpUnder(state, dir) || paths.some(isThreeWayConflict)
  if (!conflict) {
    // Fast-forward (QA B3 review): the remote moved for some file whose base is
    // known, and nothing local diverges from its base. The historical rule
    // would keep the local folder when the remote `updated:` is not newer,
    // cache the remote sha as reconciled, and the next local edit would PUT
    // over the remote change. A file that never existed locally and has no
    // base (a section added remotely) does not block it.
    const moved = paths.some((p) => p.base !== undefined && p.remote !== p.base && p.local !== p.remote)
    const clean = paths.every(
      (p) => p.local === p.remote || (p.base !== undefined && p.local === p.base) || (p.base === undefined && p.local === null),
    )
    return { conflict: false, fastForward: moved && clean, copyCandidates: [] }
  }
  const prefix = `${dir}/`
  // Dedupe of a retried, half-failed apply: skip the copy only while EVERY
  // pending upsert under the folder was already copied. A pending upsert
  // without the flag is an edit made after that copy — it must get one too
  // (a second, overlapping copy is acceptable; a lost edit is not).
  let flagged = 0
  let unflagged = 0
  for (const [key, entry] of Object.entries(state.ops)) {
    if (entry.op !== 'upsert' || !key.startsWith(prefix)) continue
    if (entry.conflictCopied === true) flagged++
    else unflagged++
  }
  if (flagged > 0 && unflagged === 0) return { conflict: true, fastForward: false, copyCandidates: [] }
  const copyCandidates = paths
    .filter((p) => p.local !== null && p.local !== p.base)
    .map((p) => p.path)
  return { conflict: true, fastForward: false, copyCandidates }
}

/**
 * Completes EVERY op under '<dir>/' (upserts and deletes, stale or not): the
 * pull has just left the folder exactly as the remote holds it, so no pending
 * local mutation of it may land afterwards. The folder's own 'deleteDir' key
 * ('<dir>', no slash) is never touched.
 */
export function journalCompleteDir(state: SyncState, dir: string): boolean {
  const prefix = `${dir}/`
  let changed = false
  for (const key of Object.keys(state.ops)) {
    if (key.startsWith(prefix)) {
      delete state.ops[key]
      changed = true
    }
  }
  return changed
}

/**
 * Clears `stale` from an op whose path no longer exists on the remote at all
 * (complete tree listing): there is nothing left to conflict with, so the
 * drain may run it again — an upsert re-creates the file (a local edit beats a
 * remote deletion), a delete finds it already gone.
 */
export function journalClearStale(state: SyncState, key: string): boolean {
  const entry = state.ops[key]
  if (!entry || !entry.stale) return false
  delete entry.stale
  return true
}

/** Drops the cached (base) shas of every file under '<dir>/'. */
export function dropCachedShasUnder(state: SyncState, dir: string): boolean {
  const prefix = `${dir}/`
  let changed = false
  for (const key of Object.keys(state.shas)) {
    if (key.startsWith(prefix)) {
      delete state.shas[key]
      changed = true
    }
  }
  return changed
}
