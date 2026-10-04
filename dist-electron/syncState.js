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
exports.journalComplete = journalComplete;
exports.journalFail = journalFail;
exports.resolveRetryAction = resolveRetryAction;
exports.shouldPullSkipDir = shouldPullSkipDir;
exports.shouldPullSkipFile = shouldPullSkipFile;
exports.shouldDeletionRuleSkipDir = shouldDeletionRuleSkipDir;
exports.shouldRunDeletionRule = shouldRunDeletionRule;
exports.getCachedSha = getCachedSha;
exports.setCachedSha = setCachedSha;
exports.pruneShas = pruneShas;
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
            state.ops[key] = {
                op: entry.op,
                queuedAt: typeof entry.queuedAt === 'string' ? entry.queuedAt : new Date(0).toISOString(),
                attempts: typeof entry.attempts === 'number' && Number.isFinite(entry.attempts) ? entry.attempts : 0,
            };
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
 * Records a pending remote mutation. Re-recording the SAME op for a key is a
 * no-op (keeps queuedAt/attempts — e.g. a debounce timer being re-armed while
 * typing); a DIFFERENT op replaces the entry (e.g. a delete supersedes a
 * pending upsert of the same file). Recording a 'deleteDir' also drops every
 * file-level op under '<dir>/' — those files are going away with the dir, and
 * keeping their upserts would both block the pull deletion rule and make the
 * retry re-push files of a deleted note.
 */
function journalRecord(state, key, op, nowIso) {
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
    const existing = state.ops[key];
    if (existing && existing.op === op)
        return changed;
    state.ops[key] = { op, queuedAt: nowIso, attempts: 0 };
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
function journalRecordIfAbsent(state, key, op, nowIso) {
    if (state.ops[key])
        return false;
    return journalRecord(state, key, op, nowIso);
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
 * remotely" and removing the dir locally would be data loss.
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
