"use strict";
// Per-device log of the notes edited each day — the history behind the "notes
// edited" half of the activity chart in Settings → General
// (src/components/Settings/ActivityPulse.tsx). A note's frontmatter only keeps
// its LAST edit (`updated`), so without this log every earlier editing day is
// lost; sections created need no log (`section.created` is already full history).
//
// Persisted by main in userData/activity-log.json — LOCAL to this device, never in
// the notes dir, never synced. Only note ids are stored (no titles, no content):
//
//   { "version": 1, "days": { "2026-10-15": ["abc12345", "xyz98765"] } }
//
// Day keys are LOCAL calendar days (YYYY-MM-DD); each array has no duplicates.
// Days older than ACTIVITY_LOG_KEEP_DAYS are pruned on every write.
//
// Pure module: no Electron imports (same pattern as syncHistory.ts / syncState.ts).
// Covered by tests/electron/activityLog.test.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_LOG_KEEP_DAYS = exports.ACTIVITY_LOG_VERSION = void 0;
exports.emptyActivityLog = emptyActivityLog;
exports.parseActivityLog = parseActivityLog;
exports.serializeActivityLog = serializeActivityLog;
exports.pruneActivityLog = pruneActivityLog;
exports.recordActivityEdit = recordActivityEdit;
const syncHistory_1 = require("./syncHistory");
exports.ACTIVITY_LOG_VERSION = 1;
/** Days kept (today included). The chart reads at most 112 days + 6 lead-in days. */
exports.ACTIVITY_LOG_KEEP_DAYS = 120;
/** Sanity caps against a corrupt or hand-edited file. */
const MAX_ID_LENGTH = 64;
const MAX_IDS_PER_DAY = 5000;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
function emptyActivityLog() {
    return { version: exports.ACTIVITY_LOG_VERSION, days: {} };
}
function isValidId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH;
}
/**
 * Parses the persisted JSON. Missing, corrupt or unknown-version content degrades
 * to an empty log; invalid day keys and ids are dropped, duplicates removed.
 */
function parseActivityLog(raw) {
    if (!raw)
        return emptyActivityLog();
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        return emptyActivityLog();
    }
    if (!data || typeof data !== 'object')
        return emptyActivityLog();
    const { version, days } = data;
    if (version !== exports.ACTIVITY_LOG_VERSION || !days || typeof days !== 'object' || Array.isArray(days)) {
        return emptyActivityLog();
    }
    const out = {};
    for (const [day, ids] of Object.entries(days)) {
        if (!DAY_KEY_RE.test(day) || !Array.isArray(ids))
            continue;
        const clean = [...new Set(ids.filter(isValidId))].slice(0, MAX_IDS_PER_DAY);
        if (clean.length > 0)
            out[day] = clean;
    }
    return { version: exports.ACTIVITY_LOG_VERSION, days: out };
}
function serializeActivityLog(log) {
    return JSON.stringify(log);
}
/** Day key of the oldest day kept when today is `now`'s local day. */
function cutoffDayKey(now, keepDays) {
    const d = new Date(now);
    // Date constructor (not ms arithmetic) so DST changes cannot shift the day
    return (0, syncHistory_1.localDayKey)(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (keepDays - 1)).getTime());
}
/**
 * Returns a NEW log without the days older than `keepDays` local days (today
 * included). The same log object comes back when nothing was dropped.
 */
function pruneActivityLog(log, now, keepDays = exports.ACTIVITY_LOG_KEEP_DAYS) {
    const cutoff = cutoffDayKey(now, keepDays);
    // YYYY-MM-DD keys compare chronologically as plain strings
    const kept = Object.entries(log.days).filter(([day]) => day >= cutoff);
    if (kept.length === Object.keys(log.days).length)
        return log;
    return { version: exports.ACTIVITY_LOG_VERSION, days: Object.fromEntries(kept) };
}
/**
 * Returns a NEW log with `noteId` added to `now`'s local day (no duplicates) and
 * old days pruned — or the SAME log object when nothing changed (id already
 * recorded today, invalid id), so callers can skip the disk write.
 */
function recordActivityEdit(log, noteId, now, keepDays = exports.ACTIVITY_LOG_KEEP_DAYS) {
    if (!isValidId(noteId))
        return log;
    const day = (0, syncHistory_1.localDayKey)(now);
    const ids = log.days[day] ?? [];
    if (ids.includes(noteId) || ids.length >= MAX_IDS_PER_DAY)
        return pruneActivityLog(log, now, keepDays);
    return pruneActivityLog({ version: exports.ACTIVITY_LOG_VERSION, days: { ...log.days, [day]: [...ids, noteId] } }, now, keepDays);
}
