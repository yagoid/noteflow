"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AI_SETTINGS = void 0;
exports.markStale = markStale;
exports.markStaleUnknown = markStaleUnknown;
exports.getStale = getStale;
exports.init = init;
exports.isEnabled = isEnabled;
exports.primeSettings = primeSettings;
exports.getSettings = getSettings;
exports.applySettings = applySettings;
exports.scheduleIndex = scheduleIndex;
exports.scheduleIndexData = scheduleIndexData;
exports.removeFromIndex = removeFromIndex;
exports.reindexAll = reindexAll;
exports.search = search;
exports.related = related;
exports.graph = graph;
/**
 * aiIndex.ts — runs in the main process. Owns the AI utilityProcess lifecycle and
 * exposes a small async API consumed by the IPC handlers and the fs:write-note hook.
 *
 * The heavy work (embeddings, SQLite) lives in aiWorker.ts; this module only forks it,
 * mediates a request/response message protocol, debounces incremental indexing (mirrors
 * githubSync.schedulePush), and respawns the worker if it crashes (the index persists).
 */
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const indexStaleness_1 = require("./indexStaleness");
const protocol_1 = require("./protocol");
exports.DEFAULT_AI_SETTINGS = {
    enabled: false,
    modelId: protocol_1.DEFAULT_AI_MODEL,
    lastIndexedModelId: null,
    chunking: 'section',
};
let child = null;
let ready = false;
let manualStop = false;
let starting = null;
let settings = { ...exports.DEFAULT_AI_SETTINGS };
let notesDir = '';
// Notes that don't live in the notes dir (linked .md files, electron/linkedNotes.ts), handed
// to the worker as data on a full reindex.
let extraNotes = () => [];
let eventSink = {};
let nextId = 1;
const pending = new Map();
const indexTimers = new Map();
const INDEX_DEBOUNCE_MS = 2500;
// After this long with no AI traffic at all, kill the whole worker process — not just unload the
// model. onnxruntime-node does not reliably return its native arena memory to the OS on dispose(),
// so the model-unload inside the worker only drops it to ~70 MB resident; the only sure way to
// reclaim everything is to let the process exit. The index lives on disk, so the next search/graph/
// related lazily respawns it via ensureStarted() with nothing lost.
const WORKER_IDLE_STOP_MS = 90000;
let idleStopTimer = null;
function cancelWorkerIdleStop() {
    if (idleStopTimer) {
        clearTimeout(idleStopTimer);
        idleStopTimer = null;
    }
}
// (Re)arm the idle-stop timer. Called on every request so any AI activity resets the countdown.
// Only tears the worker down when it's actually idle (no in-flight requests, not mid-start).
function bumpWorkerActivity() {
    cancelWorkerIdleStop();
    idleStopTimer = setTimeout(() => {
        idleStopTimer = null;
        if (!child || !ready)
            return; // worker already gone → nothing to do; next request re-arms
        if (starting || pending.size > 0) {
            bumpWorkerActivity();
            return;
        } // still busy → re-check later
        void stop().catch((err) => console.error('[aiIndex] idle stop failed:', String(err)));
    }, WORKER_IDLE_STOP_MS);
}
// ── Pending index state ("the index is out of date") ────────────────────────
// The renderer's stale marker must reflect what the index actually holds, so main owns the truth:
// a note dir enters the pending set the moment it is written and only leaves when the worker says
// it indexed it. Deriving it from the worker's 'idle' state does not work — that also fires on
// worker boot, model unload and errors, none of which mean "indexed".
//
// Persisted because the gap is durable: scheduleIndex drops the work when the worker is dormant
// (see below), so those edits stay unindexed until the next explicit reindex — across restarts too.
// The rules themselves live in indexStaleness.ts (pure, unit-tested).
let pendingState = null;
let lastStaleSent = null;
function pendingPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'ai-index', 'pending.json');
}
/** Lazy so nothing touches userData before the app is ready. */
function pendingNotes() {
    if (pendingState)
        return pendingState;
    try {
        pendingState = indexStaleness_1.IndexStaleness.fromJSON(JSON.parse(fs_1.default.readFileSync(pendingPath(), 'utf-8')));
    }
    catch {
        pendingState = new indexStaleness_1.IndexStaleness(); // missing or unreadable → nothing pending
    }
    return pendingState;
}
/** Persist, then notify — but only when the value the renderer sees actually changed. */
function pendingChanged() {
    try {
        const file = pendingPath();
        fs_1.default.mkdirSync(path_1.default.dirname(file), { recursive: true });
        fs_1.default.writeFileSync(file, JSON.stringify(pendingNotes().toJSON()), 'utf-8');
    }
    catch (err) {
        // Never let bookkeeping break a note save — worst case the marker resets on the next boot.
        console.error('[aiIndex] failed to persist pending index state:', String(err));
    }
    const next = getStale();
    if (lastStaleSent && lastStaleSent.stale === next.stale && lastStaleSent.count === next.count)
        return;
    lastStaleSent = next;
    eventSink.stale?.(next);
}
/** Flag one note dir as waiting for the index to catch up. No-op while AI is off. */
function markStale(dirPath) {
    if (!settings.enabled)
        return;
    if (pendingNotes().markDir(path_1.default.basename(dirPath), Date.now()))
        pendingChanged();
}
/** Flag a change we cannot pin to a note dir (e.g. notes deleted by a sync pull). */
function markStaleUnknown() {
    if (!settings.enabled)
        return;
    if (pendingNotes().markUnknown(Date.now()))
        pendingChanged();
}
function getStale() {
    if (!settings.enabled)
        return { stale: false, count: 0 };
    return pendingNotes().info();
}
function clearPending(dirPath, since) {
    if (pendingNotes().clearDir(path_1.default.basename(dirPath), since))
        pendingChanged();
}
function clearPendingBefore(since) {
    if (pendingNotes().clearBefore(since))
        pendingChanged();
}
function clearAllPending() {
    if (pendingNotes().clearAll())
        pendingChanged();
}
// ── Public API ──────────────────────────────────────────────────────────────
function init(opts) {
    notesDir = opts.notesDir;
    eventSink = { progress: opts.onProgress, state: opts.onState, stale: opts.onStale };
    if (opts.extraNotes)
        extraNotes = opts.extraNotes;
}
function isEnabled() {
    return settings.enabled;
}
/**
 * Set the persisted settings at boot. Nothing is started here: the lightweight worker (SQLite
 * only, ~70 MB) spins up lazily the first time the brain view asks for graph/related, and the
 * heavy model loads only on an explicit reindex / reactivate. So a fresh boot costs 0 MB of AI.
 */
function primeSettings(next) {
    settings = next;
}
function getSettings() {
    return settings;
}
/** Load the heavy model (lazy, in the worker) and reindex if the stored vectors are stale/missing.
 *  This is the "reactivate" path — the only thing besides the Reindex button that wakes the model. */
async function activateModel() {
    await ensureStarted(); // light SQLite worker
    const res = (await request('load-model', {}));
    if (res?.needsReindex) {
        await reindexAll();
        return;
    }
    // The stored vectors are reusable, so nothing was rebuilt — but notes edited while AI was off
    // never reached the index (scheduleIndex is a no-op then) and we have no record of which ones.
    markStaleUnknown();
}
/** Apply a new settings snapshot: start/stop/restart the worker as needed. */
async function applySettings(next) {
    const prev = settings;
    settings = next;
    if (!next.enabled) {
        // Disable → fully stop the worker (drops both SQLite and the model). Pending work goes with it:
        // warning about a stale index makes no sense while AI is off, and re-enabling reindexes anyway.
        await stop();
        clearAllPending();
        return;
    }
    const modelChanged = prev.modelId !== next.modelId;
    if (modelChanged && child) {
        // Model swap → restart so the worker picks up the new model on its next lazy load.
        await stop();
    }
    await ensureStarted(); // light worker (SQLite only); the model stays unloaded until needed
    // Turning AI on, or switching models, is an explicit activation → load the model + reindex.
    if (!prev.enabled || modelChanged)
        await activateModel();
}
/** Debounced incremental index of a single note directory (called from fs:write-note). */
function scheduleIndex(dirPath) {
    if (!settings.enabled)
        return;
    // Mark before the debounce: from this instant the index is behind, whether or not the run below
    // ever happens.
    markStale(dirPath);
    const key = path_1.default.basename(dirPath);
    const existing = indexTimers.get(key);
    if (existing)
        clearTimeout(existing);
    indexTimers.set(key, setTimeout(async () => {
        indexTimers.delete(key);
        // Only index if the model is already up this session — never wake the worker/model from a save.
        // While dormant the edit is skipped; the next explicit reindex catches it up (it stays pending).
        if (!child || !ready)
            return;
        const startedAt = Date.now();
        try {
            await request('index-note', { dirPath });
            clearPending(dirPath, startedAt); // only now is this note really in the index
        }
        catch (err) {
            console.error('[aiIndex] index-note failed:', String(err));
        }
    }, INDEX_DEBOUNCE_MS));
}
/**
 * scheduleIndex for a note handed over as data (a linked .md — not a notes-dir folder). Same
 * debounce, staleness and dormancy rules; the note is read at run time (`read`), null = gone.
 */
function scheduleIndexData(key, read) {
    if (!settings.enabled)
        return;
    markStale(key);
    const timerKey = `data:${key}`;
    const existing = indexTimers.get(timerKey);
    if (existing)
        clearTimeout(existing);
    indexTimers.set(timerKey, setTimeout(async () => {
        indexTimers.delete(timerKey);
        if (!child || !ready)
            return;
        const startedAt = Date.now();
        try {
            const data = read();
            if (data)
                await request('index-note-data', data);
            else
                await request('remove-note', { dirPath: key });
            clearPending(key, startedAt);
        }
        catch (err) {
            console.error('[aiIndex] index-note-data failed:', String(err));
        }
    }, INDEX_DEBOUNCE_MS));
}
function removeFromIndex(dirPath) {
    if (!settings.enabled)
        return;
    if (!child || !ready) {
        markStaleUnknown();
        return;
    } // index keeps serving a note that no longer exists
    const startedAt = Date.now();
    request('remove-note', { dirPath })
        .then(() => clearPending(dirPath, startedAt))
        .catch((err) => {
        console.error('[aiIndex] remove-note failed:', String(err));
        markStaleUnknown();
    });
}
async function reindexAll() {
    await ensureStarted();
    const startedAt = Date.now();
    let extra = [];
    try {
        extra = extraNotes();
    }
    catch (err) {
        console.error('[aiIndex] extra notes unavailable:', String(err));
    }
    const res = await request('reindex-all', { notesDir, extra });
    // Everything written before the rebuild started is now in the index; notes touched during it stay.
    clearPendingBefore(startedAt);
    return res;
}
async function search(query, k = 10) {
    if (!settings.enabled)
        return [];
    try {
        await ensureStarted();
        return await request('search', { query, k });
    }
    catch (err) {
        // Worker stopped/restarting (e.g. user toggled off mid-request) → no results, not an error.
        console.warn('[aiIndex] search aborted:', String(err));
        return [];
    }
}
async function related(noteId, sectionId, k = 6) {
    if (!settings.enabled)
        return [];
    try {
        await ensureStarted();
        return await request('related', { noteId, sectionId, k });
    }
    catch (err) {
        console.warn('[aiIndex] related aborted:', String(err));
        return [];
    }
}
/** Note-to-note content edges for the brain graph (Phase 2). [] if AI is off or empty. */
async function graph() {
    if (!settings.enabled)
        return [];
    try {
        await ensureStarted();
        return await request('graph', {});
    }
    catch (err) {
        // Worker stopped/restarting (e.g. user toggled off mid-request) → no edges, not an error.
        console.warn('[aiIndex] graph aborted:', String(err));
        return [];
    }
}
// ── Worker lifecycle ────────────────────────────────────────────────────────
function ensureStarted() {
    if (child && ready)
        return Promise.resolve();
    if (starting)
        return starting;
    starting = start().finally(() => { starting = null; });
    return starting;
}
async function start() {
    if (child)
        return;
    manualStop = false;
    const dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'ai-index', 'index.db');
    const cacheDir = path_1.default.join(electron_1.app.getPath('userData'), 'ai-models');
    // aiIndex.js is compiled to dist-electron/ai/, so the worker is a sibling here.
    const workerPath = path_1.default.join(__dirname, 'aiWorker.js');
    const proc = electron_1.utilityProcess.fork(workerPath, [], {
        serviceName: 'noteflow-ai',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout?.on('data', (d) => console.log('[aiWorker]', d.toString().trimEnd()));
    proc.stderr?.on('data', (d) => console.error('[aiWorker:err]', d.toString().trimEnd()));
    child = proc;
    await new Promise((resolve, reject) => {
        let settled = false;
        proc.on('message', (msg) => onMessage(msg));
        proc.on('exit', (code) => {
            if (!settled) {
                settled = true;
                reject(new Error(`AI worker exited before init (code ${code})`));
            }
            onExit(code);
        });
        // Send init once spawned. Electron queues the message until the child port is up.
        // init is light (opens the DB, no model) → resolves fast. We never reindex here: the model
        // is only loaded on an explicit reindex/reactivate, so a fresh start costs ~70 MB, not ~600.
        proc.once('spawn', () => {
            request('init', { modelId: settings.modelId, cacheDir, dbPath })
                .then(() => {
                ready = true;
                settled = true;
                resolve();
            })
                .catch((err) => {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            });
        });
    });
}
async function stop() {
    manualStop = true;
    cancelWorkerIdleStop();
    for (const t of indexTimers.values())
        clearTimeout(t);
    indexTimers.clear();
    for (const { reject } of pending.values())
        reject(new Error('AI worker stopped'));
    pending.clear();
    const proc = child;
    child = null;
    ready = false;
    if (proc)
        proc.kill();
}
function onExit(code) {
    child = null;
    ready = false;
    cancelWorkerIdleStop();
    for (const { reject } of pending.values())
        reject(new Error('AI worker exited'));
    pending.clear();
    if (!manualStop && settings.enabled) {
        // Unexpected crash → respawn after a short delay. The on-disk index survives.
        console.warn(`[aiIndex] worker exited (code ${code}); respawning…`);
        setTimeout(() => { ensureStarted().catch((err) => console.error('[aiIndex] respawn failed:', String(err))); }, 1000);
    }
}
function onMessage(msg) {
    switch (msg.type) {
        case 'result': {
            const p = pending.get(msg.id);
            if (p) {
                pending.delete(msg.id);
                p.resolve(msg.payload);
            }
            break;
        }
        case 'error': {
            const p = pending.get(msg.id);
            if (p) {
                pending.delete(msg.id);
                p.reject(new Error(msg.error));
            }
            break;
        }
        case 'progress':
            eventSink.progress?.(msg.payload);
            break;
        case 'state':
            eventSink.state?.(msg.payload);
            break;
    }
}
function request(type, payload) {
    if (!child)
        return Promise.reject(new Error('AI worker not running'));
    bumpWorkerActivity(); // any traffic resets the idle-stop countdown
    const id = nextId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.postMessage({ type, id, payload });
    });
}
