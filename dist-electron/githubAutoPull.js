"use strict";
// Pure decisions of the GitHub auto-sync loop (the timer lives in main.ts, the
// I/O in githubSync.autoPullNotes). Tested in tests/electron/githubAutoPull.test.ts.
//
// The loop ticks every 15 s while a NoteFlow window is focused and every 5 min
// otherwise. Each tick first asks GitHub for the branch head with the ETag of
// the last answer (`GET /repos/{o}/{r}/git/ref/heads/{branch}` +
// `If-None-Match`): 304 — or 200 with the same commit — means the remote has
// not moved since the last complete auto pull, so the tree is not fetched.
// A full pull still runs at least every GITHUB_FULL_PULL_MAX_AGE_MS (the old
// fixed cadence), so whatever a pull does besides applying remote changes
// (clearing syncError, temporary-note expiry, catch-up) never waits longer
// than it did before.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GITHUB_FOCUS_TICK_MIN_GAP_MS = exports.GITHUB_FULL_PULL_MAX_AGE_MS = exports.GITHUB_AUTO_SYNC_IDLE_INTERVAL_MS = exports.GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS = void 0;
exports.githubAutoSyncDelayMs = githubAutoSyncDelayMs;
exports.remoteHeadKey = remoteHeadKey;
exports.planAutoPull = planAutoPull;
exports.headChanged = headChanged;
exports.headToConfirm = headToConfirm;
exports.shouldRunFocusTick = shouldRunFocusTick;
exports.focusRescheduleDelayMs = focusRescheduleDelayMs;
/** Tick interval while some NoteFlow window has the focus. */
exports.GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS = 15000;
/** Tick interval while no NoteFlow window has the focus (minimized, tray, another app). */
exports.GITHUB_AUTO_SYNC_IDLE_INTERVAL_MS = 5 * 60 * 1000;
/** A complete pull older than this is redone even if the head did not move. */
exports.GITHUB_FULL_PULL_MAX_AGE_MS = 5 * 60 * 1000;
/** Focusing the app runs a tick right away unless one started less than this ago. */
exports.GITHUB_FOCUS_TICK_MIN_GAP_MS = 5000;
function githubAutoSyncDelayMs(focused) {
    return focused ? exports.GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS : exports.GITHUB_AUTO_SYNC_IDLE_INTERVAL_MS;
}
/** Identity of a branch head: repo case-insensitive (like GitHub), branch exact. */
function remoteHeadKey(owner, repo, branch) {
    return `${owner}/${repo}`.toLowerCase() + '#' + branch;
}
function planAutoPull(input) {
    const { seen, key, now, mustReconcile } = input;
    if (!seen || seen.key !== key || mustReconcile)
        return { kind: 'full' };
    const age = now - seen.pulledAt;
    // age < 0: the clock went back — no way to tell how old it is.
    if (age < 0 || age >= exports.GITHUB_FULL_PULL_MAX_AGE_MS)
        return { kind: 'full' };
    return { kind: 'check', ...(seen.etag ? { etag: seen.etag } : {}) };
}
/**
 * Whether a `check` plan must pull after all. Only a positive "same head"
 * answer skips: 304 to the seen ETag, or 200 with the seen commit. Anything
 * else (another commit, no sha, an error) pulls — the pull reports the error.
 */
function headChanged(seen, response) {
    if (response.status === 304)
        return seen.etag === undefined;
    if (response.status === 200)
        return response.sha === undefined || response.sha !== seen.sha;
    return true;
}
/**
 * Whether an auto pull may confirm the head it read: a 200 with a commit, and
 * a pull that finished complete (no errors, not `incomplete` — truncated tree,
 * origin gate, transient GET failure). Otherwise the next tick pulls again.
 */
function headToConfirm(response, result) {
    if (response.status !== 200 || response.sha === undefined)
        return null;
    if (result.errors.length > 0 || result.incomplete === true)
        return null;
    return { sha: response.sha, ...(response.etag ? { etag: response.etag } : {}) };
}
/** Focus tick: not while a tick runs, nor within the minimum gap of the last one. */
function shouldRunFocusTick(now, lastTickStartedAt, running) {
    if (running)
        return false;
    if (lastTickStartedAt === null)
        return true;
    const since = now - lastTickStartedAt;
    return since < 0 || since >= exports.GITHUB_FOCUS_TICK_MIN_GAP_MS;
}
/**
 * Focus that did NOT run a tick (shouldRunFocusTick false, no tick running):
 * the pending timer may still be the unfocused 5-min one. Returns the delay to
 * reschedule it with — the focus tick as soon as the minimum gap allows,
 * never later than the focused cadence — or null to keep the timer, which is
 * due sooner already (`dueAt` = when it fires, null if none is armed).
 */
function focusRescheduleDelayMs(now, lastTickStartedAt, dueAt) {
    const sinceLast = lastTickStartedAt === null ? Infinity : now - lastTickStartedAt;
    const delay = sinceLast < 0
        ? 0
        : Math.min(Math.max(0, exports.GITHUB_FOCUS_TICK_MIN_GAP_MS - sinceLast), exports.GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS);
    if (dueAt !== null && dueAt - now <= delay)
        return null;
    return delay;
}
