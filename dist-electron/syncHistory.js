"use strict";
// In-memory activity history behind the mini bar chart of the titlebar sync
// card (SyncStatusButton.tsx). Each sync backend (githubSync.ts, cloudSync.ts)
// owns one recorder; getActiveSyncStatus (syncProvider.ts) exposes the live
// backend's entries as `history` and its running day total as `filesToday`. Deliberately NOT persisted — it starts empty
// on every launch and only describes this session.
//
// Pure module: no Electron imports (same pattern as syncState.ts / mirrorPlan.ts).
// Covered by tests/electron/syncHistory.test.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYNC_HISTORY_BUCKET_MS = exports.SYNC_HISTORY_MAX = void 0;
exports.appendSyncHistory = appendSyncHistory;
exports.localDayKey = localDayKey;
exports.addToDayTotal = addToDayTotal;
exports.filesOnDay = filesOnDay;
exports.createSyncHistory = createSyncHistory;
/** Ring size — also the max number of bars the card draws. */
exports.SYNC_HISTORY_MAX = 24;
/**
 * Operations landing in the same fixed time bucket are folded into ONE entry.
 * Single-file pushes are debounced per path (5 s) and a note save is 2+ files,
 * so without this every pause while typing would push a bar of its own and the
 * 24 slots would cover a couple of minutes. One bucket per minute keeps the
 * chart readable: a bar = "what synced in that minute".
 */
exports.SYNC_HISTORY_BUCKET_MS = 60000;
/**
 * Returns a NEW history with the operation appended: folded into the last
 * entry when both fall in the same `bucketMs` window (files summed, `ok` ANDed,
 * `at` moved to `now`), otherwise pushed as a new entry and the oldest dropped
 * beyond `max`. Negative/NaN file counts are clamped to 0.
 */
function appendSyncHistory(history, files, ok, now, max = exports.SYNC_HISTORY_MAX, bucketMs = exports.SYNC_HISTORY_BUCKET_MS) {
    const count = Number.isFinite(files) && files > 0 ? Math.floor(files) : 0;
    const at = new Date(now).toISOString();
    const last = history[history.length - 1];
    if (last && Math.floor(Date.parse(last.at) / bucketMs) === Math.floor(now / bucketMs)) {
        return [...history.slice(0, -1), { at, files: last.files + count, ok: last.ok && ok }];
    }
    const next = [...history, { at, files: count, ok }];
    return next.length > max ? next.slice(next.length - max) : next;
}
/** 'YYYY-MM-DD' of `now` in the process's local time zone. */
function localDayKey(now) {
    const d = new Date(now);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Adds `files` to the day total, restarting from 0 when the local date changed. */
function addToDayTotal(total, files, now) {
    const count = Number.isFinite(files) && files > 0 ? Math.floor(files) : 0;
    const day = localDayKey(now);
    return { day, files: (total && total.day === day ? total.files : 0) + count };
}
/** Files moved on `now`'s local day — 0 when the stored total belongs to an earlier day. */
function filesOnDay(total, now) {
    return total && total.day === localDayKey(now) ? total.files : 0;
}
/** A per-backend recorder; `clock` is injectable for tests. */
function createSyncHistory(clock = Date.now) {
    let entries = [];
    let dayTotal = null;
    return {
        record(files, ok) {
            const now = clock();
            entries = appendSyncHistory(entries, files, ok, now);
            dayTotal = addToDayTotal(dayTotal, files, now);
        },
        list() {
            return entries.map((e) => ({ ...e }));
        },
        filesToday() {
            return filesOnDay(dayTotal, clock());
        },
    };
}
