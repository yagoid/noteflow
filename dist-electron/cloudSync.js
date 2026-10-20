"use strict";
// NoteFlow Cloud E2EE sync engine (phase 4.2, stage 2) — the paid counterpart
// of githubSync.ts, speaking to the public.files table (migration 0004) via
// PostgREST. Same file-per-relative-path model and the SAME conflict rule (the
// note folder is the unit, note.md's `updated:` decides), so main.ts can route
// through either backend behind the SyncProvider interface (syncProvider.ts).
//
// Deliberate differences vs GitHub Sync (documented in monetization.md § 4):
//   - NO mutation queue: the Contents API serialization invariant is a GitHub
//     workaround — Postgres handles concurrent upserts natively. Writes are
//     direct upserts (Prefer: resolution=merge-duplicates) with a single retry.
//   - Deletions propagate via TOMBSTONES (deleted=true, content_ct blanked),
//     not via absence: the incremental pull can't see "missing" rows, and a
//     tombstone is exactly the "this was deleted" signal absence used to imply.
//     Local deletion still applies the safety rule (local updated <= lastSync).
//   - NO sha cache: the incremental pull (seq > pullSeq, the server-assigned
//     change number of migration 0008) already skips unchanged rows without
//     any per-file GET.
//   - The journal of pending remote mutations IS kept (offline durability) —
//     it reuses the pure transitions of syncState.ts, persisted in its own
//     userData/cloud-sync-state.json (never shared with the GitHub journal:
//     the two backends must not replay each other's ops).
//   - Autosync is PUSH-driven (stage 3): a Supabase Realtime subscription
//     (cloudRealtime.ts) signals remote changes and main.ts runs the sync
//     cycle; the CLOUD_AUTO_SYNC_INTERVAL_MS loop stays as a safety net.
//
// E2EE invariants: every row is encrypted with cloudCrypto.ts before leaving
// the process; the DEK comes from cloudKeys.ts (main-process memory only) and
// every push/pull gates on the key session being unlocked.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOUD_AUTO_SYNC_INTERVAL_MS = void 0;
exports.getSyncHistory = getSyncHistory;
exports.getSyncFilesToday = getSyncFilesToday;
exports.loadCloudSyncSettings = loadCloudSyncSettings;
exports.initCloudSync = initCloudSync;
exports.isCloudSyncEnabled = isCloudSyncEnabled;
exports.getCloudSyncStatus = getCloudSyncStatus;
exports.onStatusChanged = onStatusChanged;
exports.hasPendingRemoteMutations = hasPendingRemoteMutations;
exports.enableCloudSync = enableCloudSync;
exports.disableCloudSync = disableCloudSync;
exports.schedulePush = schedulePush;
exports.pushPathsNow = pushPathsNow;
exports.scheduleDelete = scheduleDelete;
exports.scheduleDeleteDir = scheduleDeleteDir;
exports.pullNotes = pullNotes;
exports.retrySyncJournal = retrySyncJournal;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const account = __importStar(require("./account"));
const cloudKeys = __importStar(require("./cloudKeys"));
const cloudRealtime = __importStar(require("./cloudRealtime"));
const githubSync = __importStar(require("./githubSync"));
const cloudKeys_1 = require("./cloudKeys");
const cloudConfig_1 = require("./cloudConfig");
const noteFormat_1 = require("./noteFormat");
const cloudCrypto_1 = require("./cloudCrypto");
const cloudSyncLogic_1 = require("./cloudSyncLogic");
const syncState_1 = require("./syncState");
const syncHistory_1 = require("./syncHistory");
// ── Constants ─────────────────────────────────────────────────────────────────
/**
 * Safety-net cadence of the periodic sync loop. Remote changes normally arrive
 * via the Realtime subscription (cloudRealtime.ts) within seconds — this timer
 * only covers a down/undelivered WebSocket and drains the journal of pending
 * local mutations while offline.
 */
exports.CLOUD_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
// Same debounce as the GitHub push: avoids spamming the API while typing.
const PUSH_DEBOUNCE_MS = 5000;
const LOCKED_ERROR = 'Cloud keys are locked. Unlock NoteFlow Cloud to sync.';
const SUBSCRIPTION_ERROR = 'An active NoteFlow Cloud subscription is required to upload changes.';
const NOT_SIGNED_IN_ERROR = 'Sign in to your NoteFlow account to use NoteFlow Cloud.';
// ── Settings helpers ──────────────────────────────────────────────────────────
function getSettingsPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
}
function readSettings() {
    try {
        return JSON.parse(fs_1.default.readFileSync(getSettingsPath(), 'utf-8'));
    }
    catch {
        return {};
    }
}
function writeSettings(data) {
    fs_1.default.writeFileSync(getSettingsPath(), JSON.stringify(data), 'utf-8');
}
// Merge-writes only the fields this module owns — cloudKeys.ts stores
// encryptedDek in the same settings.cloudSync section.
function patchSettings(patch) {
    const settings = readSettings();
    const section = { ...(settings.cloudSync ?? {}), ...patch };
    for (const key of Object.keys(section)) {
        if (section[key] === undefined)
            delete section[key];
    }
    settings.cloudSync = section;
    writeSettings(settings);
    cloudSettings = section;
}
// ── Module state ──────────────────────────────────────────────────────────────
let notesDirPath = null;
let cloudSettings = null;
let syncError;
let initialPullStatus = 'pending';
let statusListener = null;
// Pending debounced pushes, keyed by relPath (same semantics as githubSync).
const pushTimers = new Map();
// Session-only activity history for the titlebar sync card (see syncHistory.ts).
// Uploads/tombstones are counted by trackActivity, downloads at the end of pullNotes.
const syncHistory = (0, syncHistory_1.createSyncHistory)();
/** This session's sync activity (oldest first) — exposed via getActiveSyncStatus. */
function getSyncHistory() {
    return syncHistory.list();
}
/** Files moved today (local day) this session — the sync card's "X files today". */
function getSyncFilesToday() {
    return syncHistory.filesToday();
}
// Per-note-key cache: '<dir>' (note folders) or '<name>.json' (root metadata)
// → unwrapped note key. Seeded by pulls, populated on demand by pushes.
const noteKeyCache = new Map();
// In-flight remote mutations (upserts/tombstones) — the auto-sync pull defers
// while > 0, same stand-down as GitHub's queue counter.
let pendingMutations = 0;
// Set on an RLS 403: pauses journal upsert drains while the LOCAL entitlement
// also says "no cloud" so an expired subscription doesn't retry-loop every
// poll tick. Cleared by any successful write.
let entitlementBlocked = false;
let retryInFlight = false;
// ── Durable journal (reuses syncState.ts, own file — never GitHub's) ──────────
let syncState = null;
function getSyncStatePath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'cloud-sync-state.json');
}
function getState() {
    if (!syncState) {
        let raw = null;
        try {
            raw = fs_1.default.readFileSync(getSyncStatePath(), 'utf-8');
        }
        catch {
            raw = null;
        }
        syncState = (0, syncState_1.parseSyncState)(raw);
    }
    return syncState;
}
function persistState() {
    try {
        fs_1.default.writeFileSync(getSyncStatePath(), (0, syncState_1.serializeSyncState)(getState()), 'utf-8');
    }
    catch (err) {
        console.error('[CloudSync] failed to persist cloud-sync-state.json:', String(err));
    }
}
// ── Public lifecycle / status ─────────────────────────────────────────────────
function loadCloudSyncSettings() {
    const settings = readSettings();
    cloudSettings = settings.cloudSync ?? { enabled: false };
    return cloudSettings;
}
/** Boot hook: remembers the notes dir (needed to read anchors/journal drains). */
function initCloudSync(notesDir) {
    notesDirPath = notesDir;
    loadCloudSyncSettings();
}
function isCloudSyncEnabled() {
    return (cloudSettings ?? loadCloudSyncSettings()).enabled;
}
function getCloudSyncStatus() {
    const s = cloudSettings ?? loadCloudSyncSettings();
    return {
        configured: (0, cloudConfig_1.isCloudConfigured)(),
        enabled: s.enabled,
        signedIn: account.getAccountStatus().signedIn,
        keysState: cloudKeys.getKeysState(),
        keysMode: cloudKeys.getKeysMode(),
        lastSync: s.lastSync,
        error: syncError,
        initialPullStatus,
        realtimeConnected: cloudRealtime.isCloudRealtimeConnected(),
    };
}
function onStatusChanged(cb) {
    statusListener = cb;
}
function setInitialPullStatus(status) {
    if (initialPullStatus === status)
        return;
    initialPullStatus = status;
    statusListener?.();
}
/** True while remote writes/deletes are in flight (auto-sync pull defers). */
function hasPendingRemoteMutations() {
    return pendingMutations > 0;
}
/**
 * Turns Cloud sync on. Requires a signed-in account; the key session may still
 * be locked (pushes gate themselves and drain from the journal after unlock).
 * Mutual exclusion with GitHub Sync is routed in main.ts via syncProvider.ts.
 */
function enableCloudSync() {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, error: 'NoteFlow Cloud is not available in this build.' };
    if (!account.getAccountStatus().signedIn)
        return { ok: false, error: NOT_SIGNED_IN_ERROR };
    patchSettings({ enabled: true });
    // GitHub Sync is now paused (syncProvider gives Cloud priority) and its
    // `lastSync` freezes while notes keep arriving here, so its pull's
    // local-deletion rule ("absent from remote + older than lastSync ⇒ deleted
    // remotely") stops being sound. Flag it so the next GitHub pull reconciles
    // instead of deleting. No-op if GitHub isn't connected.
    githubSync.markNeedsFullReconcile();
    syncError = undefined;
    setInitialPullStatus('pending');
    statusListener?.();
    return { ok: true };
}
/**
 * Turns Cloud sync off. Deliberately KEEPS lastSync/pullSeq (re-enabling
 * resumes incrementally) and the journal (pending deletes must still land —
 * dropping them would resurrect notes on other devices). Key material is
 * untouched; locking is a separate action (cloudKeys.lockCloudKeys).
 */
function disableCloudSync() {
    pushTimers.forEach((t) => clearTimeout(t));
    pushTimers.clear();
    patchSettings({ enabled: false });
    // GitHub Sync is about to resume with a `lastSync` it can't trust: while Cloud
    // was on it received no pushes, and notes that arrived here from another device
    // keep their ORIGINAL `updated` (older than lastSync), so GitHub's catch-up
    // never uploaded them. Without this, its next pull sees them as "absent from
    // remote + older than lastSync" and deletes live notes. Marking on the way OUT
    // also covers users whose Cloud was enabled by an earlier build (no flag was
    // ever set for them) — there is no startup backfill.
    githubSync.markNeedsFullReconcile();
    syncError = undefined;
    setInitialPullStatus('pending');
    statusListener?.();
    return { ok: true };
}
// ── REST helpers ──────────────────────────────────────────────────────────────
// RLS write rejection (42501 → 403): no active cloud entitlement. 401 is a
// session problem, NOT a subscription one — it surfaces as a generic error.
function isWriteForbidden(status) {
    return status === 403;
}
/** One retry on network errors / 5xx — Postgres upserts are idempotent. */
async function restWithRetry(fn) {
    try {
        const res = await fn();
        if (res.status >= 500) {
            await new Promise((r) => setTimeout(r, 1000));
            return await fn();
        }
        return res;
    }
    catch {
        await new Promise((r) => setTimeout(r, 1000));
        return fn();
    }
}
function requireDek() {
    const dek = cloudKeys.getDek();
    if (!dek)
        throw new Error(LOCKED_ERROR);
    return dek;
}
function requireNotesDir() {
    if (!notesDirPath)
        throw new Error('CloudSync not initialized (notes dir unknown)');
    return notesDirPath;
}
/**
 * Note key for a folder ('<dir>') or root metadata file ('<name>.json'):
 * cache → remote anchor row (unwrap its key_ct — keeps every row of a folder
 * on the SAME key) → freshly generated for brand-new notes.
 */
async function getNoteKeyFor(scope, dek) {
    const cached = noteKeyCache.get(scope);
    if (cached)
        return cached;
    const anchorRel = scope.endsWith('.json') ? scope : `${scope}/${noteFormat_1.NOTE_MD}`;
    const pathKey = await (0, cloudCrypto_1.derivePathKeyHmac)(dek, anchorRel);
    const res = await (0, cloudKeys_1.supabaseRest)(`/rest/v1/files?select=key_ct&path_key=eq.${encodeURIComponent(pathKey)}`);
    let noteKey = null;
    if (res.status < 400 && Array.isArray(res.json) && res.json.length > 0) {
        try {
            noteKey = await (0, cloudCrypto_1.unwrapKey)(res.json[0].key_ct, dek);
        }
        catch {
            // Undecryptable remote key (should not happen with the right DEK) —
            // fall through to a fresh key; rows are self-contained so old rows
            // still decrypt with their own key_ct.
            noteKey = null;
        }
    }
    if (!noteKey)
        noteKey = (0, cloudCrypto_1.generateNoteKey)();
    noteKeyCache.set(scope, noteKey);
    return noteKey;
}
/**
 * Runs a remote mutation and logs it in the activity history: the file count
 * it resolves with on success, a failed (ok=false) entry if it throws.
 */
async function trackActivity(op) {
    let files;
    try {
        files = await op();
    }
    catch (err) {
        syncHistory.record(0, false);
        throw err;
    }
    syncHistory.record(files, true);
}
/** Uploads one file as an encrypted upsert row. Throws with an actionable message. */
function pushSingleFile(relPath, content) {
    return trackActivity(async () => {
        await uploadFileRow(relPath, content);
        return 1;
    });
}
async function uploadFileRow(relPath, content) {
    const dek = requireDek();
    const userId = account.getUserId();
    if (!userId)
        throw new Error(NOT_SIGNED_IN_ERROR);
    const dir = (0, cloudSyncLogic_1.noteDirOf)(relPath);
    const scope = dir ?? relPath;
    const noteKey = await getNoteKeyFor(scope, dek);
    // Sections inherit the anchor's `updated:` (read fresh from disk).
    let anchorContent = null;
    if (dir && !(0, cloudSyncLogic_1.isAnchorPath)(relPath)) {
        try {
            anchorContent = fs_1.default.readFileSync(path_1.default.join(requireNotesDir(), dir, noteFormat_1.NOTE_MD), 'utf-8');
        }
        catch {
            anchorContent = null;
        }
    }
    const updatedAt = (0, cloudSyncLogic_1.resolveRowUpdatedAt)(relPath, content, anchorContent, new Date().toISOString());
    const row = await (0, cloudSyncLogic_1.buildFileUpsertRow)(dek, noteKey, relPath, content, updatedAt);
    const res = await restWithRetry(() => (0, cloudKeys_1.supabaseRest)('/rest/v1/files?on_conflict=user_id,path_key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { user_id: userId, ...row },
    }));
    if (isWriteForbidden(res.status)) {
        // RLS rejected the write — no active cloud entitlement. Actionable error,
        // and entitlementBlocked pauses journal drains (no retry loop).
        entitlementBlocked = true;
        throw new Error(SUBSCRIPTION_ERROR);
    }
    if (res.status >= 400)
        throw new Error(`Cloud upload failed (HTTP ${res.status})`);
    entitlementBlocked = false;
}
/**
 * Propagates deletions for a set of relPaths: tombstones (deleted=true,
 * content_ct blanked) so other devices pick them up on their incremental pull.
 * RLS gates UPDATE on the entitlement, so without a subscription this falls
 * back to a physical DELETE (allowed by ownership alone) — the row disappears
 * but, by design, other devices are not notified (they can't push either).
 */
async function removeRemotePaths(relPaths) {
    if (relPaths.length === 0)
        return;
    await trackActivity(async () => {
        const dek = requireDek();
        const pathKeys = await Promise.all(relPaths.map((p) => (0, cloudCrypto_1.derivePathKeyHmac)(dek, p)));
        await removeRemoteByPathKeys(pathKeys);
        return pathKeys.length;
    });
}
async function removeRemoteByPathKeys(pathKeys) {
    if (pathKeys.length === 0)
        return;
    const filter = `path_key=in.(${pathKeys.map((k) => `"${k}"`).join(',')})`;
    const hasEntitlement = account.getAccountStatus().entitlements.cloud;
    if (hasEntitlement) {
        const res = await restWithRetry(() => (0, cloudKeys_1.supabaseRest)(`/rest/v1/files?${filter}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: { deleted: true, content_ct: '', updated_at: new Date().toISOString() },
        }));
        if (res.status < 400)
            return;
        if (!isWriteForbidden(res.status))
            throw new Error(`Cloud delete failed (HTTP ${res.status})`);
        // 403 despite local entitlement (stale) — fall through to physical delete.
    }
    const res = await restWithRetry(() => (0, cloudKeys_1.supabaseRest)(`/rest/v1/files?${filter}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
    }));
    if (res.status >= 400)
        throw new Error(`Cloud delete failed (HTTP ${res.status})`);
}
/**
 * All non-deleted remote rows decrypted to (relPath, path_key) — used by
 * scheduleDeleteDir, which must tombstone every row under '<dir>/' without a
 * plaintext prefix filter (path_key is opaque by design). content_ct is not
 * selected, so the payload stays small even for large corpora.
 * Paged by keyset over `seq` (collectSeqPages): PostgREST caps a response at
 * max-rows (1000 by default), and a single capped GET used to miss the rows of
 * a note beyond the first 1000 — nothing was tombstoned, the deleteDir was
 * completed anyway and the note resurrected on every other device. A failed
 * page throws, so the deleteDir stays journaled (retried), never half-done.
 */
async function listRemotePaths(dek) {
    const rows = await (0, cloudSyncLogic_1.collectSeqPages)(async (after) => {
        const res = await (0, cloudKeys_1.supabaseRest)(`/rest/v1/files?select=path_key,path_ct,key_ct,seq&deleted=eq.false&order=seq.asc&seq=gt.${after}&limit=${cloudSyncLogic_1.CLOUD_PAGE_SIZE}`);
        if (res.status >= 400)
            throw new Error(`Cloud listing failed (HTTP ${res.status})`);
        return Array.isArray(res.json) ? res.json : [];
    }, 0);
    const out = [];
    for (const raw of rows) {
        try {
            const noteKey = await (0, cloudCrypto_1.unwrapKey)(raw.key_ct, dek);
            const relPath = await (0, cloudCrypto_1.decryptContent)(noteKey, raw.path_ct);
            out.push({ relPath, pathKey: raw.path_key });
        }
        catch {
            // Undecryptable row — skip (can't belong to this DEK).
        }
    }
    return out;
}
// ── Push (debounced, journaled — mirror of the GitHub semantics) ──────────────
/**
 * Debounced single-file push. `relPath` is the notes-dir-relative path and the
 * debounce key. Gated (like GitHub) until the initial pull succeeds so a stale
 * local file can't overwrite a newer remote row; deferred edits are re-queued
 * by flushPendingLocalChanges when the pull lands.
 */
function schedulePush(relPath, content, onStart, onComplete) {
    const s = cloudSettings ?? loadCloudSyncSettings();
    if (!s.enabled || !(0, cloudConfig_1.isCloudConfigured)()) {
        onComplete?.();
        return;
    }
    if (initialPullStatus !== 'ok') {
        console.warn(`[CloudSync] Push deferred for ${relPath}: initialPullStatus=${initialPullStatus}`);
        onComplete?.(`sync-gated:${initialPullStatus}`);
        return;
    }
    schedulePushUnguarded(relPath, content, onStart, onComplete);
}
function schedulePushUnguarded(relPath, content, onStart, onComplete) {
    const existing = pushTimers.get(relPath);
    if (existing)
        clearTimeout(existing);
    // Journal at timer-arming time so the op survives the app closing during the
    // debounce window (retrySyncJournal re-reads the on-disk content later).
    if ((0, syncState_1.journalRecord)(getState(), relPath, 'upsert', new Date().toISOString()))
        persistState();
    const timer = setTimeout(async () => {
        pushTimers.delete(relPath);
        onStart?.();
        pendingMutations++;
        try {
            await pushSingleFile(relPath, content);
            if ((0, syncState_1.journalComplete)(getState(), relPath, 'upsert'))
                persistState();
            patchSettings({ lastSync: new Date().toISOString() });
            syncError = undefined;
            onComplete?.();
        }
        catch (err) {
            // IfAbsent: never clobber a newer delete/deleteDir intent recorded while
            // this push was in flight (same rationale as githubSync).
            (0, syncState_1.journalRecordIfAbsent)(getState(), relPath, 'upsert', new Date().toISOString());
            (0, syncState_1.journalFail)(getState(), relPath, 'upsert');
            persistState();
            syncError = err instanceof Error ? err.message : String(err);
            console.error('[CloudSync] push failed:', syncError);
            onComplete?.(syncError);
        }
        finally {
            pendingMutations--;
        }
    }, PUSH_DEBOUNCE_MS);
    pushTimers.set(relPath, timer);
}
/**
 * Pushes a set of files NOW (awaited, no debounce, content read from disk).
 * Same contract as githubSync.pushPathsNow: used by bulk imports / agentic
 * writes, does NOT bump lastSync, no-op while the push gate is closed.
 */
async function pushPathsNow(notesDir, relPaths) {
    const s = cloudSettings ?? loadCloudSyncSettings();
    if (!s.enabled || !(0, cloudConfig_1.isCloudConfigured)())
        return { pushed: 0, errors: [] };
    if (initialPullStatus !== 'ok')
        return { pushed: 0, errors: [] };
    let pushed = 0;
    const errors = [];
    let stateChanged = false;
    for (const relPath of relPaths) {
        const existing = pushTimers.get(relPath);
        if (existing) {
            clearTimeout(existing);
            pushTimers.delete(relPath);
        }
        pendingMutations++;
        try {
            const content = fs_1.default.readFileSync(path_1.default.join(notesDir, relPath), 'utf-8');
            await pushSingleFile(relPath, content);
            pushed++;
            if ((0, syncState_1.journalComplete)(getState(), relPath, 'upsert'))
                stateChanged = true;
        }
        catch (err) {
            errors.push(relPath);
            (0, syncState_1.journalRecordIfAbsent)(getState(), relPath, 'upsert', new Date().toISOString());
            (0, syncState_1.journalFail)(getState(), relPath, 'upsert');
            stateChanged = true;
            syncError = err instanceof Error ? err.message : String(err);
            console.error(`[CloudSync] pushPathsNow failed for ${relPath}:`, String(err));
        }
        finally {
            pendingMutations--;
        }
    }
    if (stateChanged)
        persistState();
    if (pushed > 0 && errors.length === 0)
        syncError = undefined;
    return { pushed, errors };
}
// ── Delete (tombstones) ───────────────────────────────────────────────────────
/** Tombstones a single remote file ('<dir>/<file>.md') — dropped sections. */
async function scheduleDelete(relPath) {
    const s = cloudSettings ?? loadCloudSyncSettings();
    if (!s.enabled || !(0, cloudConfig_1.isCloudConfigured)())
        return;
    const existing = pushTimers.get(relPath);
    if (existing) {
        clearTimeout(existing);
        pushTimers.delete(relPath);
    }
    if ((0, syncState_1.journalRecord)(getState(), relPath, 'delete', new Date().toISOString()))
        persistState();
    pendingMutations++;
    try {
        await removeRemotePaths([relPath]);
        if ((0, syncState_1.journalComplete)(getState(), relPath, 'delete'))
            persistState();
    }
    catch (err) {
        (0, syncState_1.journalFail)(getState(), relPath, 'delete');
        persistState();
        syncError = `Failed to delete ${relPath} on NoteFlow Cloud: ${String(err)}`;
        console.error('[CloudSync] delete failed:', String(err));
    }
    finally {
        pendingMutations--;
    }
}
/** Tombstones every remote row under '<dir>/' — note deletion. */
async function scheduleDeleteDir(dir) {
    const s = cloudSettings ?? loadCloudSyncSettings();
    if (!s.enabled || !(0, cloudConfig_1.isCloudConfigured)())
        return;
    for (const key of [...pushTimers.keys()]) {
        if (key.startsWith(`${dir}/`)) {
            clearTimeout(pushTimers.get(key));
            pushTimers.delete(key);
        }
    }
    if ((0, syncState_1.journalRecord)(getState(), dir, 'deleteDir', new Date().toISOString()))
        persistState();
    pendingMutations++;
    try {
        await deleteRemoteDirNow(dir);
        if ((0, syncState_1.journalComplete)(getState(), dir, 'deleteDir'))
            persistState();
    }
    catch (err) {
        (0, syncState_1.journalFail)(getState(), dir, 'deleteDir');
        persistState();
        syncError = `Failed to delete note folder "${dir}" on NoteFlow Cloud: ${String(err)}`;
        console.error('[CloudSync] delete dir failed:', String(err));
    }
    finally {
        pendingMutations--;
    }
}
function deleteRemoteDirNow(dir) {
    return trackActivity(async () => {
        const dek = requireDek();
        const remote = await listRemotePaths(dek);
        const targets = remote.filter((r) => r.relPath.startsWith(`${dir}/`));
        noteKeyCache.delete(dir);
        await removeRemoteByPathKeys(targets.map((t) => t.pathKey));
        return targets.length;
    });
}
// ── Pull (incremental by server-assigned seq) ─────────────────────────────────
/**
 * Rows changed since the watermark, in seq order. KEYSET pagination
 * (`seq=gt.<last>&order=seq.asc&limit=N` until a short page), not offsets: an
 * offset window shifts when rows are written mid-pull (an upsert moves a row
 * to the end), which could skip rows; a keyset on a server-assigned seq can't.
 * The mode (incremental / one-time full reconcile / first sync) comes from
 * planPullQuery.
 */
async function fetchChangedRows(s) {
    const plan = (0, cloudSyncLogic_1.planPullQuery)(s);
    return (0, cloudSyncLogic_1.collectSeqPages)(async (after) => {
        const res = await (0, cloudKeys_1.supabaseRest)(`/rest/v1/files?select=${cloudSyncLogic_1.CLOUD_PULL_COLUMNS}&order=seq.asc&seq=gt.${after}&limit=${cloudSyncLogic_1.CLOUD_PAGE_SIZE}` +
            // First reconcile: tombstones are irrelevant (nothing local to delete
            // safely — lastSync is null) and would only cost bandwidth.
            (plan.includeDeleted ? '' : '&deleted=eq.false'));
        if (res.status >= 400)
            throw new Error(`Cloud pull failed (HTTP ${res.status})`);
        return Array.isArray(res.json) ? res.json : [];
    }, plan.afterSeq, cloudSyncLogic_1.CLOUD_PAGE_SIZE, 'Cloud pull failed');
}
/** Fetches + decrypts the remote anchor row of a dir (or null). */
async function fetchRemoteAnchor(dek, dir) {
    const pathKey = await (0, cloudCrypto_1.derivePathKeyHmac)(dek, `${dir}/${noteFormat_1.NOTE_MD}`);
    const res = await (0, cloudKeys_1.supabaseRest)(`/rest/v1/files?select=${cloudSyncLogic_1.CLOUD_PULL_COLUMNS}&path_key=eq.${encodeURIComponent(pathKey)}`);
    if (res.status >= 400 || !Array.isArray(res.json) || res.json.length === 0)
        return null;
    try {
        return await (0, cloudSyncLogic_1.decryptFileRow)(dek, res.json[0]);
    }
    catch {
        return null;
    }
}
/**
 * A failure that must abort the WHOLE pull (no pullSeq/lastSync persisted)
 * instead of being recorded as a per-folder error: the per-folder catch
 * re-throws it. The pull is idempotent, so the next one retries from the same
 * watermark — advancing it would lose that remote version on this device.
 */
class PullAbortError extends Error {
}
/**
 * Fetches + decrypts specific remote rows by relPath in ONE request
 * (`path_key=in.(…)`). Used for the sections an applied anchor lists that did
 * not travel in its batch (uploaded earlier → below the seq watermark). Rows
 * the server doesn't have yet are simply absent (they'll arrive later with a
 * higher seq). Undecryptable rows, or ones whose decrypted path isn't the one
 * requested / isn't safe, are reported in `errors` and skipped (permanent);
 * a failed REQUEST (HTTP/network) throws PullAbortError.
 */
async function fetchRemoteRows(dek, relPaths) {
    if (relPaths.length === 0)
        return { entries: [], errors: [] };
    const byKey = new Map();
    for (const rel of relPaths)
        byKey.set(await (0, cloudCrypto_1.derivePathKeyHmac)(dek, rel), rel);
    const filter = `path_key=in.(${[...byKey.keys()].map((k) => `"${k}"`).join(',')})`;
    let res;
    try {
        res = await (0, cloudKeys_1.supabaseRest)(`/rest/v1/files?select=${cloudSyncLogic_1.CLOUD_PULL_COLUMNS}&${filter}`);
    }
    catch (err) {
        throw new PullAbortError(`Cloud section fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status >= 400)
        throw new PullAbortError(`Cloud section fetch failed (HTTP ${res.status})`);
    const entries = [];
    const errors = [];
    for (const row of (Array.isArray(res.json) ? res.json : [])) {
        const expected = byKey.get(row.path_key);
        try {
            const entry = await (0, cloudSyncLogic_1.decryptFileRow)(dek, row);
            if (entry.relPath !== expected || !(0, cloudSyncLogic_1.isSafeCloudRelPath)(entry.relPath)) {
                errors.push(`unexpected remote section skipped: ${entry.relPath}`);
                continue;
            }
            entries.push(entry);
        }
        catch (err) {
            errors.push(`row ${row.path_key}: ${String(err)}`);
        }
    }
    return { entries, errors };
}
/**
 * Writes (or, for a tombstone, removes) one remote section file. Returns
 * whether the disk changed — identical content is left alone, so this
 * device's own rows coming back in its next pull are no-ops.
 */
function applyRemoteSectionFile(notesDir, entry) {
    const localFile = path_1.default.join(notesDir, entry.relPath);
    if (entry.deleted) {
        try {
            fs_1.default.unlinkSync(localFile);
            return true;
        }
        catch {
            return false; // already gone
        }
    }
    try {
        if (fs_1.default.readFileSync(localFile, 'utf-8') === entry.content)
            return false;
    }
    catch { /* missing locally — write it */ }
    fs_1.default.writeFileSync(localFile, entry.content, 'utf-8');
    return true;
}
/**
 * Incremental pull: fetches rows with seq > pullSeq (or a full reconcile, see
 * planPullQuery), decrypts them, groups by note folder and applies the SAME
 * conflict rule as the GitHub pull (newer remote anchor wins wholesale;
 * tombstones delete locally only when local updated <= lastSync) plus the
 * loose-section rule (shouldApplyRemoteSection). Returns the
 * githubSync.pullNotes result shape.
 */
async function pullNotes(notesDir) {
    const empty = {
        pulled: 0,
        deleted: 0,
        errors: [],
        updatedFiles: [],
        hadDeletions: false,
        hadMetadataChanges: false,
    };
    const s = cloudSettings ?? loadCloudSyncSettings();
    if (!s.enabled || !(0, cloudConfig_1.isCloudConfigured)())
        return empty;
    const dek = cloudKeys.getDek();
    if (!dek) {
        syncError = LOCKED_ERROR;
        if (initialPullStatus === 'pending')
            setInitialPullStatus('failed');
        syncHistory.record(0, false);
        return { ...empty, errors: [LOCKED_ERROR] };
    }
    let pulled = 0;
    let deleted = 0;
    // Files this pull changed on disk (written or removed) — for the activity history.
    let filesDown = 0;
    const errors = [];
    const updatedFiles = [];
    let hadMetadataChanges = false;
    const previousLastSync = s.lastSync;
    const lastSyncMs = s.lastSync ? Date.parse(s.lastSync) : null;
    const state = getState();
    try {
        const rows = await fetchChangedRows(s);
        const entries = [];
        for (const row of rows) {
            try {
                const entry = await (0, cloudSyncLogic_1.decryptFileRow)(dek, row);
                if (!(0, cloudSyncLogic_1.isSafeCloudRelPath)(entry.relPath)) {
                    errors.push(`unsafe remote path skipped: ${entry.relPath}`);
                    continue;
                }
                entries.push(entry);
                // Seed the per-folder key cache so pushes reuse the same note key.
                noteKeyCache.set((0, cloudSyncLogic_1.noteDirOf)(entry.relPath) ?? entry.relPath, entry.noteKey);
            }
            catch (err) {
                errors.push(`row ${row.path_key}: ${String(err)}`);
            }
        }
        const { dirs, rootFiles } = (0, cloudSyncLogic_1.groupEntriesByDir)(entries);
        for (const [dir, group] of dirs) {
            try {
                // Journal guard: a pending remote deleteDir means this dir was deleted
                // locally — applying remote rows would resurrect the note.
                if ((0, syncState_1.shouldPullSkipDir)(state, dir))
                    continue;
                const localDirPath = path_1.default.join(notesDir, dir);
                const localAnchorPath = path_1.default.join(localDirPath, noteFormat_1.NOTE_MD);
                const localExists = fs_1.default.existsSync(localAnchorPath);
                const localUpdatedMs = localExists
                    ? (0, cloudSyncLogic_1.parseUpdatedTimestamp)((0, cloudSyncLogic_1.extractUpdatedTimestamp)(fs_1.default.readFileSync(localAnchorPath, 'utf-8')))
                    : null;
                // The anchor decides.
                let anchor = group.find((e) => (0, cloudSyncLogic_1.isAnchorPath)(e.relPath)) ?? null;
                if (anchor?.deleted) {
                    if (!localExists)
                        continue;
                    // Journal guard (same as the GitHub pull's deletion rule): a pending
                    // upsert under '<dir>/' is a local edit that hasn't reached the server
                    // (failed push, or still inside the 5 s debounce — it is journaled
                    // when the timer is armed). `updated <= lastSync` can't see it: a push
                    // of ANOTHER note moves lastSync past this note's `updated`. Deleting
                    // here would rm the edit and the drain would then discard its upsert.
                    // The local note wins and is RESURRECTED on purpose: the whole folder
                    // is re-uploaded, so every row loses its tombstone (re-pushing only the
                    // pending file would leave the other sections tombstoned → other
                    // devices would get an anchor without its sections).
                    if ((0, syncState_1.shouldDeletionRuleSkipDir)(state, dir)) {
                        requeueDirForUpload(notesDir, dir);
                        continue;
                    }
                    // Note deleted remotely — apply locally only under the safety rule.
                    if ((0, cloudSyncLogic_1.shouldApplyRemoteDeletion)(localUpdatedMs, lastSyncMs)) {
                        fs_1.default.rmSync(localDirPath, { recursive: true, force: true });
                        deleted++;
                        filesDown++;
                    }
                    continue;
                }
                if (!anchor && !localExists) {
                    // Only section rows of a note this device doesn't have: fetch its
                    // anchor. Absent (never fully uploaded — the origin's journal will
                    // finish it) or deleted → nothing to write.
                    anchor = await fetchRemoteAnchor(dek, dir);
                    if (!anchor || anchor.deleted)
                        continue;
                }
                let changed = 0;
                if (anchor && (!localExists || (0, cloudSyncLogic_1.shouldApplyRemoteDir)(anchor.updatedAtMs, localUpdatedMs))) {
                    // Newer remote anchor (or a note new to this device): wholesale.
                    // Sections the anchor lists that are NOT in this batch and NOT on
                    // disk were uploaded earlier (below the watermark — e.g. they landed
                    // in a previous pull before their anchor existed remotely and were
                    // skipped). Fetch them BEFORE writing anything: an anchor on disk
                    // without its section files would make the editor recreate them
                    // empty and push those blanks over the real ones on the next save.
                    // Listed sections already on disk are not fetched (the renderer only
                    // uploads the sections that changed, so this would re-download
                    // unchanged ones on almost every applied edit): they are up to date,
                    // or their own newer row arrives with a higher seq (loose-section
                    // rule). Accepted edge: a stale local section in a conflict where the
                    // local folder was strictly newer — LWW, as before.
                    const inGroup = new Set(group.map((e) => e.relPath));
                    const missing = (0, cloudSyncLogic_1.listAnchorSectionFiles)(anchor.content)
                        .map((f) => `${dir}/${f}`)
                        .filter((rel) => !inGroup.has(rel) &&
                        !(0, syncState_1.shouldPullSkipFile)(state, rel) &&
                        !fs_1.default.existsSync(path_1.default.join(notesDir, rel)));
                    const fetched = await fetchRemoteRows(dek, missing);
                    errors.push(...fetched.errors.map((e) => `${dir}: ${e}`));
                    fs_1.default.mkdirSync(localDirPath, { recursive: true });
                    fs_1.default.writeFileSync(localAnchorPath, anchor.content, 'utf-8');
                    changed++;
                    for (const entry of group) {
                        if ((0, cloudSyncLogic_1.isAnchorPath)(entry.relPath))
                            continue;
                        // Journal guard: don't resurrect a section whose remote delete is pending.
                        if ((0, syncState_1.shouldPullSkipFile)(state, entry.relPath))
                            continue;
                        if (applyRemoteSectionFile(notesDir, entry))
                            changed++;
                    }
                    // Listed sections the server doesn't have yet stay as they are: their
                    // upload is still pending on the origin and will arrive later (higher
                    // seq) through the loose-section rule. A listed-but-tombstoned row is
                    // inconsistent — left alone too.
                    for (const entry of fetched.entries) {
                        if (entry.deleted)
                            continue;
                        if (applyRemoteSectionFile(notesDir, entry))
                            changed++;
                    }
                }
                else {
                    // Anchor not applied (absent from this batch, or not newer) and the
                    // folder exists locally: sections apply ONE BY ONE. With a seq
                    // cursor, an anchor and its sections can land in different pulls
                    // (separate uploads); dropping the group here would lose the
                    // section content for good (shouldApplyRemoteSection).
                    for (const entry of group) {
                        if ((0, cloudSyncLogic_1.isAnchorPath)(entry.relPath))
                            continue;
                        if ((0, syncState_1.shouldPullSkipFile)(state, entry.relPath))
                            continue;
                        // A section tombstone must not remove an unpushed edit of that file
                        // (its updated_at is the deletion time, so the rule below would let
                        // it through): the pending upsert re-uploads it and wins, on purpose.
                        if (entry.deleted && (0, syncState_1.hasPendingUpsert)(state, entry.relPath))
                            continue;
                        if (!(0, cloudSyncLogic_1.shouldApplyRemoteSection)(entry.updatedAtMs, localUpdatedMs))
                            continue;
                        if (applyRemoteSectionFile(notesDir, entry))
                            changed++;
                    }
                    if (changed === 0)
                        continue; // local is newer, or already identical
                }
                filesDown += changed;
                updatedFiles.push(localDirPath);
                pulled++;
            }
            catch (err) {
                if (err instanceof PullAbortError)
                    throw err; // abort the pull: watermark stays put
                errors.push(`${dir}: ${String(err)}`);
            }
        }
        // Root metadata json — LWW like the GitHub pull (remote write wins).
        for (const entry of rootFiles) {
            try {
                if (entry.deleted)
                    continue; // metadata is never deleted by the app
                if (!cloudSyncLogic_1.CLOUD_METADATA_FILENAMES.includes(entry.relPath))
                    continue;
                const metadataPath = path_1.default.join(notesDir, entry.relPath);
                const localContent = fs_1.default.existsSync(metadataPath)
                    ? fs_1.default.readFileSync(metadataPath, 'utf-8')
                    : null;
                if (localContent !== entry.content) {
                    fs_1.default.writeFileSync(metadataPath, entry.content, 'utf-8');
                    hadMetadataChanges = true;
                    filesDown++;
                }
            }
            catch (err) {
                errors.push(`${entry.relPath}: ${String(err)}`);
            }
        }
        patchSettings({
            lastSync: new Date().toISOString(),
            // Max seq of EVERY fetched row (undecryptable/unsafe ones too — they
            // never become applicable). The legacy updated_at cursor goes away.
            pullSeq: (0, cloudSyncLogic_1.nextPullSeq)(s.pullSeq, rows),
            pullCursor: undefined,
        });
        syncError = undefined;
        const wasNotOk = initialPullStatus !== 'ok';
        if (wasNotOk) {
            setInitialPullStatus('ok');
            flushPendingLocalChanges(notesDir, previousLastSync);
        }
    }
    catch (err) {
        const msg = String(err).includes('not-signed-in')
            ? NOT_SIGNED_IN_ERROR
            : err instanceof Error
                ? err.message
                : String(err);
        syncError = msg;
        errors.push(msg);
        if (initialPullStatus === 'pending')
            setInitialPullStatus('failed');
    }
    // Uploads (incl. the catch-up queued above) are counted as they land, by
    // trackActivity; this entry is the download side of the pull.
    syncHistory.record(filesDown, errors.length === 0);
    return {
        pulled,
        deleted,
        errors,
        updatedFiles,
        hadDeletions: deleted > 0,
        hadMetadataChanges,
    };
}
/**
 * Called when the initial pull transitions to 'ok'. Re-queues pushes for any
 * note whose anchor is newer than the previous lastSync (edits made while the
 * gate was closed / while Cloud was disabled) — same on-disk detection as
 * githubSync. On the very first sync (no previous lastSync) this uploads the
 * ENTIRE local corpus, including the root metadata files.
 */
function flushPendingLocalChanges(notesDir, previousLastSync) {
    const lastSyncMs = previousLastSync ? Date.parse(previousLastSync) : null;
    for (const dir of (0, noteFormat_1.listNoteDirs)(notesDir)) {
        const dirPath = path_1.default.join(notesDir, dir);
        try {
            const anchor = fs_1.default.readFileSync(path_1.default.join(dirPath, noteFormat_1.NOTE_MD), 'utf-8');
            const updatedMs = (0, cloudSyncLogic_1.parseUpdatedTimestamp)((0, cloudSyncLogic_1.extractUpdatedTimestamp)(anchor));
            if (updatedMs === null)
                continue;
            if (lastSyncMs !== null && updatedMs <= lastSyncMs)
                continue;
            for (const f of fs_1.default.readdirSync(dirPath)) {
                if (!f.endsWith('.md'))
                    continue;
                try {
                    schedulePushUnguarded(`${dir}/${f}`, fs_1.default.readFileSync(path_1.default.join(dirPath, f), 'utf-8'));
                }
                catch { /* unreadable file — skip */ }
            }
        }
        catch { /* unreadable dir — skip */ }
    }
    // Initial upload: metadata json files have no timestamp — push them once.
    if (lastSyncMs === null) {
        for (const filename of cloudSyncLogic_1.CLOUD_METADATA_FILENAMES) {
            try {
                const p = path_1.default.join(notesDir, filename);
                if (fs_1.default.existsSync(p))
                    schedulePushUnguarded(filename, fs_1.default.readFileSync(p, 'utf-8'));
            }
            catch { /* skip */ }
        }
    }
}
/**
 * Re-uploads EVERY '.md' of a local note folder (debounced + journaled, like
 * flushPendingLocalChanges) — used when the pull keeps a note whose anchor
 * arrived as a tombstone because a local edit of it is still pending. Files
 * with a live debounce timer are left to it (same content source: disk).
 */
function requeueDirForUpload(notesDir, dir) {
    const dirPath = path_1.default.join(notesDir, dir);
    let files;
    try {
        files = fs_1.default.readdirSync(dirPath);
    }
    catch {
        return; // unreadable dir — its pending upserts still stand in the journal
    }
    for (const f of files) {
        const relPath = `${dir}/${f}`;
        if (!f.endsWith('.md') || pushTimers.has(relPath))
            continue;
        try {
            schedulePushUnguarded(relPath, fs_1.default.readFileSync(path_1.default.join(dirPath, f), 'utf-8'));
        }
        catch { /* unreadable file — skip */ }
    }
}
// ── Journal retry (durability for failed remote mutations) ───────────────────
/**
 * Drains the journal of pending remote mutations (offline edits, failed
 * tombstones, pushes deferred while the keys were locked). Same contract as
 * githubSync.retrySyncJournal: upserts re-read the CURRENT disk content,
 * deletes always re-run, nothing is dropped on failure, lastSync is NOT
 * bumped. Skips silently while the keys are locked or (for writes) while an
 * RLS 403 said the subscription lapsed and the local entitlement agrees.
 */
async function retrySyncJournal(notesDir) {
    const s = cloudSettings ?? loadCloudSyncSettings();
    if (!s.enabled || !(0, cloudConfig_1.isCloudConfigured)())
        return;
    if (initialPullStatus !== 'ok')
        return;
    if (retryInFlight)
        return;
    if (!cloudKeys.getDek())
        return; // locked — ops stay journaled until unlock
    const state = getState();
    const entries = Object.entries(state.ops).sort((a, b) => a[1].queuedAt.localeCompare(b[1].queuedAt));
    if (entries.length === 0)
        return;
    // Entitlement pause: a previous RLS 403 + no local cloud entitlement means
    // every write would 403 again — skip this tick instead of retry-looping.
    // (Physical deletes WOULD be allowed by RLS, but removeRemotePaths prefers
    // tombstones when entitled; keeping the whole drain paused is simpler and
    // the ops are not lost.)
    if (entitlementBlocked && !account.getAccountStatus().entitlements.cloud)
        return;
    retryInFlight = true;
    try {
        for (const [key, entry] of entries) {
            if (entry.op === 'upsert' && pushTimers.has(key))
                continue; // live timer will handle it
            const action = (0, syncState_1.resolveRetryAction)(entry.op, fs_1.default.existsSync(path_1.default.join(notesDir, key)));
            if (action === 'discard') {
                if ((0, syncState_1.journalComplete)(state, key, entry.op))
                    persistState();
                continue;
            }
            pendingMutations++;
            try {
                if (action === 'upsert') {
                    const content = fs_1.default.readFileSync(path_1.default.join(notesDir, key), 'utf-8');
                    await pushSingleFile(key, content);
                    // Race guard (see githubSync): a fresh debounce timer armed while this
                    // retry was in flight owns the entry now — leave it alive.
                    if (pushTimers.has(key))
                        continue;
                }
                else if (action === 'delete') {
                    await removeRemotePaths([key]);
                }
                else {
                    await deleteRemoteDirNow(key);
                }
                if ((0, syncState_1.journalComplete)(state, key, entry.op))
                    persistState();
                syncError = undefined;
            }
            catch (err) {
                (0, syncState_1.journalFail)(state, key, entry.op);
                persistState();
                syncError = `Cloud sync retry (${entry.op} ${key}) failed: ${String(err)}`;
                console.error(`[CloudSync] journal retry failed for ${entry.op} ${key}:`, String(err));
            }
            finally {
                pendingMutations--;
            }
        }
    }
    finally {
        retryInFlight = false;
    }
}
