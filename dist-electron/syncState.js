"use strict";
// Pure state logic for GitHub sync durability: a persistent journal of pending
// remote mutations (so pushes/deletes that fail are retried instead of lost) and
// a cache of already-reconciled blob SHAs (so pullNotes can skip unchanged note
// dirs / metadata files without a per-file GET). Lives in electron/ but imports
// nothing from Electron — githubSync.ts injects the file IO — following the same
// pure-module pattern as electron/entitlements.ts. Persisted by githubSync.ts as
// `sync-state.json` in userData (LOCAL device state — never in the notes dir, it
// must not sync). Covered by tests/electron/syncState.test.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptySyncState = emptySyncState;
exports.parseSyncState = parseSyncState;
exports.serializeSyncState = serializeSyncState;
exports.journalRecord = journalRecord;
exports.journalRecordIfAbsent = journalRecordIfAbsent;
exports.journalMarkStale = journalMarkStale;
exports.journalMarkDirStale = journalMarkDirStale;
exports.journalMarkDirConflictCopied = journalMarkDirConflictCopied;
exports.conflictCopyCandidates = conflictCopyCandidates;
exports.planAnchorTombstone = planAnchorTombstone;
exports.journalComplete = journalComplete;
exports.journalFail = journalFail;
exports.resolveRetryAction = resolveRetryAction;
exports.shouldPullSkipDir = shouldPullSkipDir;
exports.shouldPullSkipFile = shouldPullSkipFile;
exports.shouldDeletionRuleSkipDir = shouldDeletionRuleSkipDir;
exports.hasPendingUpsert = hasPendingUpsert;
exports.shouldRunDeletionRule = shouldRunDeletionRule;
exports.getCachedSha = getCachedSha;
exports.setCachedSha = setCachedSha;
exports.planRemoteDirDelete = planRemoteDirDelete;
exports.shouldRefreshSections = shouldRefreshSections;
exports.planSectionRefresh = planSectionRefresh;
exports.pruneShas = pruneShas;
exports.isGitHubEmptyRepoError = isGitHubEmptyRepoError;
const OP_TYPES = ['upsert', 'delete', 'deleteDir'];
function emptySyncState() {
    return { version: 1, ops: {}, shas: {} };
}
/**
 * Tolerant deserialization: a missing, corrupt or wrong-shaped file degrades to
 * an empty state (sync must never be blocked by local state damage). Unknown or
 * malformed entries are dropped individually.
 */
function parseSyncState(raw) {
    const state = emptySyncState();
    if (!raw)
        return state;
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        return state;
    }
    if (typeof data !== 'object' || data === null)
        return state;
    const obj = data;
    if (typeof obj.ops === 'object' && obj.ops !== null) {
        for (const [key, value] of Object.entries(obj.ops)) {
            if (typeof value !== 'object' || value === null)
                continue;
            const entry = value;
            if (!OP_TYPES.includes(entry.op))
                continue;
            const op = {
                op: entry.op,
                queuedAt: typeof entry.queuedAt === 'string' ? entry.queuedAt : new Date(0).toISOString(),
                attempts: typeof entry.attempts === 'number' && Number.isFinite(entry.attempts) ? entry.attempts : 0,
            };
            // Cloud-only upsert flags: kept only in their exact `true` form.
            if (op.op === 'upsert' && entry.stale === true)
                op.stale = true;
            if (op.op === 'upsert' && entry.force === true)
                op.force = true;
            if (op.op === 'upsert' && entry.conflictCopied === true)
                op.conflictCopied = true;
            state.ops[key] = op;
        }
    }
    if (typeof obj.shas === 'object' && obj.shas !== null) {
        for (const [key, value] of Object.entries(obj.shas)) {
            if (typeof value === 'string')
                state.shas[key] = value;
        }
    }
    return state;
}
function serializeSyncState(state) {
    return JSON.stringify({ version: 1, ops: state.ops, shas: state.shas });
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
function journalRecord(state, key, op, nowIso, opts) {
    let changed = false;
    if (op === 'deleteDir') {
        const prefix = `${key}/`;
        for (const k of Object.keys(state.ops)) {
            if (k.startsWith(prefix)) {
                delete state.ops[k];
                changed = true;
            }
        }
    }
    const force = op === 'upsert' && opts?.force === true;
    const existing = state.ops[key];
    if (existing && existing.op === op) {
        if (existing.stale) {
            delete existing.stale;
            changed = true;
        }
        if (existing.conflictCopied) {
            delete existing.conflictCopied;
            changed = true;
        }
        if (force && !existing.force) {
            existing.force = true;
            changed = true;
        }
        return changed;
    }
    state.ops[key] = force ? { op, queuedAt: nowIso, attempts: 0, force: true } : { op, queuedAt: nowIso, attempts: 0 };
    return true;
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
function journalRecordIfAbsent(state, key, op, nowIso, opts) {
    if (state.ops[key])
        return false;
    return journalRecord(state, key, op, nowIso, opts);
}
/**
 * NoteFlow Cloud: flags a pending upsert as `stale` (its conditional upload was
 * rejected — the server holds a newer version). Only an EXISTING upsert entry
 * is flagged, never re-created: if the pull already reconciled the path (and
 * completed the op) while the upload was in flight, there is nothing left to
 * keep — re-creating it would leave a phantom pending edit that guards the
 * note against remote deletions forever.
 */
function journalMarkStale(state, key) {
    const entry = state.ops[key];
    if (!entry || entry.op !== 'upsert' || entry.stale)
        return false;
    entry.stale = true;
    return true;
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
function journalMarkDirStale(state, dir) {
    const prefix = `${dir}/`;
    let changed = false;
    for (const [key, entry] of Object.entries(state.ops)) {
        if (entry.op === 'upsert' && key.startsWith(prefix) && !entry.stale) {
            entry.stale = true;
            changed = true;
        }
    }
    return changed;
}
/**
 * NoteFlow Cloud: flags EVERY pending upsert under '<dir>/' as
 * `conflictCopied` — the pull has just written a conflict copy holding their
 * local content (see SyncJournalOp.conflictCopied). Persisted right after the
 * copy is written and BEFORE the folder is overwritten/deleted.
 */
function journalMarkDirConflictCopied(state, dir) {
    const prefix = `${dir}/`;
    let changed = false;
    for (const [key, entry] of Object.entries(state.ops)) {
        if (entry.op === 'upsert' && key.startsWith(prefix) && !entry.conflictCopied) {
            entry.conflictCopied = true;
            changed = true;
        }
    }
    return changed;
}
/**
 * NoteFlow Cloud pull: the pending upserts under '<dir>/' (stale or not) whose
 * local content has NOT been preserved as a conflict copy yet — the candidates
 * planConflictCopy (cloudSyncLogic.ts) compares against the server's version.
 */
function conflictCopyCandidates(state, dir) {
    const prefix = `${dir}/`;
    const out = [];
    for (const [key, entry] of Object.entries(state.ops)) {
        if (entry.op === 'upsert' && key.startsWith(prefix) && !entry.conflictCopied)
            out.push(key);
    }
    return out;
}
function planAnchorTombstone(state, dir, localUpdatedMs, tombstoneUpdatedMs) {
    const prefix = `${dir}/`;
    let pending = 0;
    let stale = 0;
    for (const [key, entry] of Object.entries(state.ops)) {
        if (entry.op !== 'upsert' || !key.startsWith(prefix))
            continue;
        pending++;
        if (entry.stale)
            stale++;
    }
    if (pending === 0)
        return 'none';
    if (stale < pending)
        return 'keep';
    return localUpdatedMs !== null && localUpdatedMs <= tombstoneUpdatedMs ? 'lost' : 'keep';
}
/**
 * Removes a journal entry after the mutation landed remotely. Only removes when
 * the current entry matches `op` — a stale completion (e.g. an in-flight delete
 * finishing after the file was re-created and re-queued as upsert) must not
 * clear the newer intent.
 */
function journalComplete(state, key, op) {
    const entry = state.ops[key];
    if (!entry || entry.op !== op)
        return false;
    delete state.ops[key];
    return true;
}
/** Marks a failed attempt. The entry stays — nothing is ever dropped on failure. */
function journalFail(state, key, op) {
    const entry = state.ops[key];
    if (!entry || entry.op !== op)
        return false;
    entry.attempts++;
    return true;
}
/**
 * Decides what the journal drain should do with an entry. An upsert whose local
 * file no longer exists is discarded — there is nothing left to push, and the
 * actual removal is covered by its own delete/deleteDir entry. Deletes are
 * always executed regardless of local state.
 */
function resolveRetryAction(op, localFileExists) {
    if (op === 'upsert' && !localFileExists)
        return 'discard';
    return op;
}
// ── Pull decisions ────────────────────────────────────────────────────────────
/**
 * Should pullNotes skip this REMOTE dir entirely? True while its remote
 * deleteDir hasn't landed — pulling it would resurrect a locally-deleted note.
 */
function shouldPullSkipDir(state, dir) {
    return state.ops[dir]?.op === 'deleteDir';
}
/**
 * Should pullNotes skip writing this REMOTE file? True while its remote delete
 * hasn't landed — writing it would resurrect a locally-deleted section.
 */
function shouldPullSkipFile(state, relPath) {
    return state.ops[relPath]?.op === 'delete';
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
function shouldDeletionRuleSkipDir(state, dir) {
    const prefix = `${dir}/`;
    for (const [key, entry] of Object.entries(state.ops)) {
        if (entry.op === 'upsert' && key.startsWith(prefix))
            return true;
    }
    return false;
}
/**
 * Is there a pending (not yet landed) upsert of exactly this file? A remote
 * deletion of it must not be applied locally meanwhile: that would remove the
 * unpushed edit from disk, and the journal drain would then DISCARD the upsert
 * (resolveRetryAction: local file gone) — the edit lost for good. Used by the
 * Cloud pull for loose-section tombstones (the dir-level counterpart is
 * shouldDeletionRuleSkipDir) and by the GitHub pull's section refresh.
 */
function hasPendingUpsert(state, relPath) {
    return state.ops[relPath]?.op === 'upsert';
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
function shouldRunDeletionRule(lastSyncTime, needsFullReconcile, cloudEnabled, remoteIsV2, treeTruncated) {
    if (needsFullReconcile || cloudEnabled || treeTruncated)
        return false;
    // An unparseable lastSync (NaN) must not authorize deletions either: every
    // `updated > lastSync` comparison would be false and the rule would delete
    // every dir missing from the remote.
    if (lastSyncTime === null || !Number.isFinite(lastSyncTime))
        return false;
    return remoteIsV2;
}
// ── Reconciled-SHA cache ──────────────────────────────────────────────────────
function getCachedSha(state, relPath) {
    return state.shas[relPath];
}
function setCachedSha(state, relPath, sha) {
    if (state.shas[relPath] === sha)
        return false;
    state.shas[relPath] = sha;
    return true;
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
function planRemoteDirDelete(blobs, truncated, dir) {
    if (truncated) {
        throw new Error(`the remote file listing is truncated (repository too large) — cannot safely delete "${dir}"`);
    }
    return blobs.filter((b) => b.path.startsWith(`${dir}/`));
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
function shouldRefreshSections(needsFullReconcile, cloudEnabled) {
    return !needsFullReconcile && !cloudEnabled;
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
function planSectionRefresh(state, sections, localSha, opts) {
    const plan = { adopt: [], changed: [] };
    for (const blob of sections) {
        if (shouldPullSkipFile(state, blob.path) || hasPendingUpsert(state, blob.path))
            continue;
        if (state.shas[blob.path] === blob.sha)
            continue;
        if (localSha(blob.path) === blob.sha)
            plan.adopt.push(blob);
        else if (opts.refreshAllowed && opts.isListedLocally(blob.path))
            plan.changed.push(blob);
    }
    return plan;
}
/** Drops cached SHAs for paths no longer present in the remote tree (keeps the file bounded). */
function pruneShas(state, presentPaths) {
    let changed = false;
    for (const key of Object.keys(state.shas)) {
        if (!presentPaths.has(key)) {
            delete state.shas[key];
            changed = true;
        }
    }
    return changed;
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
function isGitHubEmptyRepoError(status, message) {
    return (status === 409 || status === 404) && /repository is empty/i.test(message);
}
