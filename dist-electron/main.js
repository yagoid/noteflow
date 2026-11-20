"use strict";
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
const electron_1 = require("electron");
const url_1 = require("url");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const githubSync = __importStar(require("./githubSync"));
const cloudSync = __importStar(require("./cloudSync"));
const cloudSyncLogic_1 = require("./cloudSyncLogic");
const cloudKeys = __importStar(require("./cloudKeys"));
const cloudRealtime = __importStar(require("./cloudRealtime"));
const cloudVersions = __importStar(require("./cloudVersions"));
const syncProvider_1 = require("./syncProvider");
const syncCycle_1 = require("./syncCycle");
const account = __importStar(require("./account"));
const cliConnect = __importStar(require("./cliConnect"));
const feedback = __importStar(require("./feedback"));
const accountTransition_1 = require("./accountTransition");
const cloudConfig_1 = require("./cloudConfig");
const aiIndex = __importStar(require("./ai/aiIndex"));
const llm = __importStar(require("./ai/llm"));
const agentTools = __importStar(require("./ai/llm/tools"));
const chatUndo = __importStar(require("./ai/chatUndo"));
const chatContext = __importStar(require("./ai/chatContext"));
const aiAutocomplete = __importStar(require("./ai/autocomplete"));
const managedErrors_1 = require("./ai/llm/managedErrors");
const entitlementsRetry_1 = require("./entitlementsRetry");
const noteFormat = __importStar(require("./noteFormat"));
const agentTasks = __importStar(require("./agentTasks"));
const agentTasksFile = __importStar(require("./agentTasksFile"));
const agentLock = __importStar(require("./agentLock"));
const agentRun = __importStar(require("./agentRun"));
const agentRunIo = __importStar(require("./agentRunIo"));
const uiSettings_1 = require("./uiSettings");
const importers = __importStar(require("./importers"));
const migration_1 = require("./migration");
const localOnlyNotes_1 = require("./localOnlyNotes");
const notesArchive = __importStar(require("./notesArchive"));
const syncOrigin_1 = require("./syncOrigin");
const originChoiceKey_1 = require("./originChoiceKey");
const welcomeNote_1 = require("./welcomeNote");
const tempNoteExpiry_1 = require("./tempNoteExpiry");
const updateAsset_1 = require("./updateAsset");
const relaunchArgs_1 = require("./relaunchArgs");
const openWithArgs_1 = require("./openWithArgs");
const v8Flags_1 = require("./v8Flags");
const navigationGuard_1 = require("./navigationGuard");
const drawingText_1 = require("./drawingText");
const activityLog_1 = require("./activityLog");
const i18n_1 = require("./i18n");
const settingsFile_1 = require("./settingsFile");
const whatsNewSeen_1 = require("./whatsNewSeen");
const stickyBounds_1 = require("./stickyBounds");
const windowPlacement_1 = require("./windowPlacement");
const snippetsFile_1 = require("./snippetsFile");
const notesWatchFilter_1 = require("./notesWatchFilter");
const linkedNotes = __importStar(require("./linkedNotes"));
const linkedNotesLogic_1 = require("./linkedNotesLogic");
// Images referenced relatively by a linked note (`assets/x.png` next to an external .md) are
// served through this scheme: `nflinked://n/<encoded note id>/<encoded relative src>` (the src
// is ONE encoded segment so `../` survives URL normalization). Registered before `ready`.
const LINKED_ASSET_SCHEME = 'nflinked';
electron_1.protocol.registerSchemesAsPrivileged([
    // Only <img> loads it: no fetch / CORS / service-worker privileges.
    { scheme: LINKED_ASSET_SCHEME, privileges: { standard: true, secure: true } },
]);
function getIconPath() {
    if (process.platform === 'win32')
        return path_1.default.join(__dirname, '../public/icon.ico');
    // In dev, the icon lives in public/; in production Vite copies it to dist/
    // (only dist/ and dist-electron/ are packed into the ASAR, not public/)
    const dir = (electron_1.app.isPackaged || process.env.NOTEFLOW_NATIVE) ? '../dist' : '../public';
    return path_1.default.join(__dirname, `${dir}/icon.png`);
}
const isDev = process.env.NODE_ENV === 'development' || (!electron_1.app.isPackaged && !process.env.NOTEFLOW_NATIVE);
let mainWindow = null;
let tray = null;
// Whether the global shortcut failed to register — changes the tray tooltip. Kept
// as module state so the tooltip survives a language change (applyTrayMenu re-reads it).
let shortcutUnavailable = false;
let isQuitting = false;
// A relaunch (second instance) that arrived before the startup path created the main
// window: whenReady brings the window up once it's ready (see revealMainWindow).
let showMainWindowWhenCreated = false;
// A launch that arrived while quitting already scheduled its relaunch after exit (once).
let relaunchAfterQuitScheduled = false;
// The in-app updater is quitting to install: it relaunches NoteFlow itself, so a launch
// that arrives meanwhile must not schedule another one (see revealMainWindow).
let quittingForUpdate = false;
let autoSyncTimer = null;
// Track paths recently written by the app so fs.watch can ignore them.
// Keys are notes-dir-relative with forward slashes: '<dir>' or '<dir>/<file>'.
const recentInternalWrites = new Set();
function markInternalWrite(relPath) {
    recentInternalWrites.add(relPath);
    setTimeout(() => recentInternalWrites.delete(relPath), 1500);
}
// ── Push state tracking ───────────────────────────────────────────────────────
// Tracks files whose push is in flight: added by schedulePush's onStart (when
// the 5 s debounce fires, not when it's armed) and by the durable chat push.
// Every add/delete notifies all renderer windows (not just empty↔non-empty
// transitions): the sync button shows an uploading indicator and its hover
// card re-reads the in-flight count on each event.
const pendingPushFiles = new Set();
// Remote deletes in flight (note folders and dropped section files — keyed like
// the journal: '<dir>' / '<dir>/<file>'), see scheduleRemoteDelete. A separate
// set so a delete settling never clears an upload of the same path.
const pendingRemoteDeletes = new Set();
/** Uploads + deletes in flight — the 'pushing' state and the card's floor count. */
function inFlightRemoteWrites() {
    return pendingPushFiles.size + pendingRemoteDeletes.size;
}
function notifyPushState() {
    const state = inFlightRemoteWrites() > 0 ? 'pushing' : 'idle';
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('sync:push-state', state));
}
/**
 * Deletes a note folder ('dir') or a single file ('<dir>/<file>.md') on the
 * live backend, tracked as in flight (trackInFlight): the backend journals the
 * delete synchronously, so without this the renderer's refresh right after the
 * local delete would see a journal entry with no push timer → "not uploaded",
 * and nothing would re-read the status once the delete landed. In flight it
 * shows as "uploading"; when it settles the push-state event refreshes the
 * status (synced, or the error/journal entry if it failed). No-op tracking
 * when no backend is connected (the backend returns right away).
 */
function scheduleRemoteDelete(kind, key) {
    const sync = (0, syncProvider_1.getActiveSyncProvider)();
    const work = () => (kind === 'dir' ? sync.scheduleDeleteDir(key) : sync.scheduleDelete(key));
    if (!sync.isConnected()) {
        void work();
        return;
    }
    (0, syncCycle_1.trackInFlight)(pendingRemoteDeletes, key, work, notifyPushState).catch((err) => {
        console.error('[Sync] remote delete failed:', String(err));
    });
}
const registeredAlarms = new Map();
const firedAlarms = new Set();
function alarmKey(e) {
    return `${e.alarmAt}|${e.noteTitle}|${e.taskText}`;
}
function checkAlarms() {
    const now = new Date();
    for (const [key, entry] of registeredAlarms) {
        if (firedAlarms.has(key))
            continue;
        if (now >= new Date(entry.alarmAt)) {
            firedAlarms.add(key);
            try {
                if (electron_1.Notification.isSupported()) {
                    new electron_1.Notification({
                        title: `📅 ${entry.noteTitle}`,
                        body: entry.taskText,
                        silent: false,
                    }).show();
                }
            }
            catch (err) {
                console.error('[Alarms] Notification failed:', err);
            }
        }
    }
}
let alarmTimer = null;
function checkExpiredNotes() {
    try {
        const now = new Date();
        for (const dir of noteFormat.listNoteDirs(NOTES_DIR)) {
            const dirPath = path_1.default.join(NOTES_DIR, dir);
            try {
                const content = fs_1.default.readFileSync(path_1.default.join(dirPath, noteFormat.NOTE_MD), 'utf-8');
                const match = content.match(/^expiresAt:\s*(.+)$/m);
                if (!match)
                    continue;
                const raw = match[1].trim().replace(/^["']|["']$/g, '');
                const expiresAt = new Date(raw);
                if (isNaN(expiresAt.getTime()) || now < expiresAt)
                    continue;
                markInternalWrite(dir);
                try {
                    for (const f of fs_1.default.readdirSync(dirPath))
                        markInternalWrite(`${dir}/${f}`);
                }
                catch { /* ignore */ }
                fs_1.default.rmSync(dirPath, { recursive: true, force: true });
                electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
                scheduleRemoteDelete('dir', dir);
            }
            catch {
                // ignore per-note errors
            }
        }
    }
    catch (err) {
        console.error('[TempNotes] checkExpiredNotes failed:', err);
    }
}
/**
 * Gate in front of checkExpiredNotes(). Without sync it runs on the timer
 * (startup + every 60s) as always; with a sync backend connected it runs ONLY
 * right after a clean pull of that backend, so a device holding a stale
 * temporary copy (e.g. made permanent elsewhere while this one slept) pulls
 * the newer version before it can delete the note locally and remotely.
 * Rationale and the "no pull ⇒ no expiry" trade-off: tempNoteExpiry.ts.
 */
function maybeCheckExpiredNotes(trigger) {
    const sync = (0, syncProvider_1.getActiveSyncProvider)();
    // Cloud is the active provider iff it is enabled. Count it as connected even
    // while signed out / not yet restored: otherwise the timer would expire notes
    // and journal remote deletes that land once the session comes back.
    const connected = sync.id === 'cloud' || sync.isConnected();
    if ((0, tempNoteExpiry_1.shouldRunExpiryCheck)(trigger, { backend: sync.id, connected })) {
        checkExpiredNotes();
    }
}
function startAlarmEngine() {
    if (alarmTimer)
        return;
    alarmTimer = setInterval(() => {
        checkAlarms();
        maybeCheckExpiredNotes({ kind: 'timer' });
    }, 60000);
}
electron_1.ipcMain.on('alarms:schedule', (_event, incoming) => {
    registeredAlarms.clear();
    for (const e of incoming) {
        registeredAlarms.set(alarmKey(e), e);
    }
    // Immediately fire any alarms that are already due (including missed ones)
    checkAlarms();
});
function emitSyncStatusChanged() {
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('sync:status-changed');
    });
}
// Broadcasts the PUBLIC account status (never tokens) to every window.
function emitAccountStatusChanged() {
    const status = account.getAccountStatus();
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('account:status-changed', status);
    });
}
// Baseline for the 'ai' and 'cloud' entitlements, established on the FIRST FRESH status
// observation of the CURRENT signed-in identity (the first successful fetch after app boot with a
// persisted session, or right after sign-in) and never used to trigger anything by itself — a
// naive false→true edge on that first read would force-switch the provider / turn Cloud on at
// every single launch for an already-subscribed user, even one who deliberately kept a BYO-key
// provider or Cloud off. Only a REAL transition seen LATER for the SAME identity in the same run
// (e.g. the user subscribes, comes back and hits Refresh in Settings → Account) auto-activates
// that surface: 'ai' → managed provider, 'cloud' → NoteFlow Cloud (bundle = both). Activation on
// a real sign-in is planAccountTransition's job, not this one's.
// account.ts now PERSISTS the last known entitlements (account.entitlementsCache) so the UI is
// known from t=0, but that cached value — like still-unknown entitlements — is NOT a fresh
// observation: it neither sets nor moves the baseline (account.areEntitlementsFromCache), so
// neither cached-false→true nor unknown→true count as a transition.
// Keyed by identity (the signed-in email, or `null` while signed out) so that signing out and
// signing back in — as the same account or a different one — always re-establishes a fresh
// baseline instead of carrying over a stale `false` from a previous session: without this, an
// account B that already had the entitlement before this process even started would look like
// it just "transitioned" the moment it signs in after account A (which lacked it) signs out.
// A keychain-locked session (status.sessionLocked) keeps signedIn + identity, so it is NOT a
// sign-out for this nor for planAccountTransition. Logic: stepEntitlementBaseline, composed by
// planEntitlementSurfaces (which also switches a surface OFF on a confirmed lapse).
let entitlementBaseline = accountTransition_1.NO_ENTITLEMENT_BASELINE;
// Last observed account snapshot — the "previous" side of the sign-in/sign-out
// edge that planAccountTransition() reasons about. Seeded at boot from the
// persisted session (app.whenReady), so a session restored from disk is NOT
// seen as a sign-in transition.
let lastAccountSnapshot = { signedIn: false, identity: null };
function accountIdentityOf(status) {
    return status.signedIn ? (status.email ?? null) : null;
}
// Small non-secret record of a pending activation of the paid surfaces: what the
// signing-out session had enabled, or — on a sign-in whose entitlements are not
// known yet — "switch on whatever is paid" (see accountTransition.ts).
function readAccountRestore() {
    return (0, accountTransition_1.parseAccountRestore)(readSettings().accountRestore);
}
function writeAccountRestore(record) {
    const settings = readSettings();
    if (record)
        settings.accountRestore = record;
    else
        delete settings.accountRestore;
    writeSettings(settings);
}
/**
 * An explicit user action on a paid surface (Cloud enable/disable, switching the
 * LLM provider) overrules the pending restore record for that surface — the app
 * must never flip a live decision back behind the user's back when the deferred
 * entitlements finally land. See clearRestoreSurface.
 */
function dropRestoreSurface(surface) {
    const next = (0, accountTransition_1.clearRestoreSurface)(readAccountRestore(), account.getAccountStatus().signedIn, surface);
    if (next !== undefined)
        writeAccountRestore(next);
}
// Applies the plan of accountTransition.ts: tear the paid subsystems down on
// sign-out (Cloud off, DEK dropped, assistant back to a BYO/local provider) and
// switch on what is paid on sign-in (or on a subscribe while signed in — see
// handleAccountStatusChanged). Every branch is a no-op unless the plan asked for
// it, so this runs on every account status change.
function applyAccountTransition(plan) {
    let cloudChanged = false;
    if (plan.disableCloud) {
        // Keeps lastSync/pullSeq/journal — re-enabling resumes incrementally.
        // Releases the mutual exclusion too: GitHub Sync resumes on its next tick.
        cloudSync.disableCloudSync();
        stopCloudAutoSync();
        cloudChanged = true;
    }
    if (plan.resetKeys) {
        // Not just lockCloudKeys(): the LEARNED key state (remoteKeysKnown, keysMode)
        // belongs to the session that is leaving — see cloudKeys.resetCloudKeysSession.
        cloudKeys.resetCloudKeysSession();
        cloudChanged = true;
    }
    if (plan.enableCloud) {
        // No initial pull from here: the DEK is normally null on this path (a
        // sign-out drops it and its cache; a first sign-in never had one), so
        // pulling now would only set syncError = "Cloud keys are locked".
        // runCloudSyncCycle does it in the right order — managed auto-unlock →
        // pull → drain journal (an e2ee user gets the passphrase prompt; no keys
        // yet → the Cloud card's key setup).
        const res = cloudSync.enableCloudSync();
        if (res.ok) {
            startCloudAutoSync();
            runCloudSyncCycle().catch((err) => console.error('[Cloud] restore sync cycle failed:', String(err)));
        }
        cloudChanged = true;
    }
    if (plan.setAiProvider) {
        const cfg = readLlmSettings();
        if (cfg.active !== plan.setAiProvider) {
            writeLlmSettings(llm.withActiveProvider(cfg, plan.setAiProvider));
        }
    }
    if (plan.restore !== undefined)
        writeAccountRestore(plan.restore);
    // lockCloudKeys()/enable+disable don't all emit by themselves — one broadcast
    // covers the lot (and reconciles the Realtime subscription).
    if (cloudChanged)
        emitCloudStatusChanged();
}
function handleAccountStatusChanged() {
    const status = account.getAccountStatus();
    const identity = status.signedIn ? (status.email ?? '') : null;
    // Entitlement changes while signed in: a real fresh false→true for the same
    // identity switches the surface on (subscribed while running), and a FRESH
    // answer that an entitlement is gone switches its surface off, like a
    // sign-out (lapsed — also on the first fetch after a boot). Unknown/cached
    // entitlements never switch anything off. See planEntitlementSurfaces.
    const llmBefore = readLlmSettings();
    const surfaces = (0, accountTransition_1.planEntitlementSurfaces)(entitlementBaseline, {
        identity,
        entitlements: status.entitlements,
        fresh: status.entitlementsKnown && !account.areEntitlementsFromCache(),
    }, {
        cloudEnabled: cloudSync.isCloudSyncEnabled(),
        aiManaged: llmBefore.active === 'noteflow',
        aiFallbackProvider: llm.byoFallbackProvider(llmBefore),
    });
    entitlementBaseline = surfaces.next;
    if (surfaces.setAiProvider && llmBefore.active !== surfaces.setAiProvider) {
        // Written BEFORE the broadcast below so the renderer's config reload (aiChatStore /
        // LlmConfigView react to onAccountStatusChanged) already sees the new active provider.
        writeLlmSettings(llm.withActiveProvider(llmBefore, surfaces.setAiProvider));
    }
    cloudSync.bindCloudSyncToAccount(account.getUserId()); // another account's Cloud sync state is reset
    // Sign-out teardown / sign-in activation of the paid subsystems. Read AFTER the
    // provider switch above so the plan sees the current provider; both paths write
    // BEFORE the broadcast below, so the renderer reloads with the final state.
    // (The two never collide: the entitlement plan only acts for the SAME identity
    // on a stable session or on a confirmed loss, the transition plan's activation
    // on a fresh sign-in or a pending record — needing the entitlement true, which
    // excludes a loss in the same observation — and each skips what is already on.)
    const previous = lastAccountSnapshot;
    lastAccountSnapshot = { signedIn: status.signedIn, identity: accountIdentityOf(status) };
    const llmCfg = readLlmSettings();
    const cloudEnabled = cloudSync.isCloudSyncEnabled();
    const plan = (0, accountTransition_1.planAccountTransition)(previous, {
        signedIn: status.signedIn,
        identity: accountIdentityOf(status),
        entitlements: status.entitlements,
        entitlementsKnown: status.entitlementsKnown,
    }, {
        cloudEnabled,
        aiManaged: llmCfg.active === 'noteflow',
        aiFallbackProvider: llm.byoFallbackProvider(llmCfg),
        restore: readAccountRestore(),
    });
    // Subscribed to Cloud while signed in (same identity, fresh false→true): switch
    // it on through the same path as a sign-in activation; a confirmed lapse
    // switches it off through the sign-out one (disableCloud keeps the journal and
    // lets GitHub Sync resume — the keys are NOT reset: same account). AFTER
    // bindCloudSyncToAccount, so it lands on this account's sync state.
    // (Spread, never mutate: the plan may be the shared NO_OP object.)
    applyAccountTransition(surfaces.enableCloud || surfaces.disableCloud
        ? {
            ...plan,
            enableCloud: plan.enableCloud || surfaces.enableCloud,
            disableCloud: plan.disableCloud || surfaces.disableCloud,
        }
        : plan);
    // Managed cloud keys unlock silently as soon as a session exists (fresh
    // sign-in, or account events on a restored one). No-op for e2ee / no-keys /
    // already-unlocked sessions — see cloudKeys.autoUnlockManaged.
    if (status.signedIn) {
        cloudKeys.autoUnlockManaged()
            .then((changed) => { if (changed)
            emitCloudStatusChanged(); })
            .catch(() => { });
    }
    // Account transitions gate the cloud Realtime subscription too (it needs a
    // session for its JWT): most notably sign-out must tear the socket down —
    // no cloud:status event fires in that path.
    syncCloudRealtimeState();
    // A usable managed plan (fresh sign-in, boot with a restored session, entitlements
    // arriving) → refresh NoteFlow AI's model catalog in the background (throttled).
    if (status.signedIn && (0, entitlementsRetry_1.isManagedAiUsable)(status))
        void refreshManagedCatalog();
    // Inline autocomplete follows the plan too (its Settings row and the editor's ghost text).
    handleAutocompleteAccountChange();
    emitAccountStatusChanged();
}
// Notes that arrive from a pull are content the semantic index has never seen. Schedule the
// incremental index for each pulled note dir (skipped while the worker is dormant, but it still
// flags the index as behind) and mark deletions/metadata as an unattributable change.
function indexPulledNotes(result) {
    if (!aiIndex.isEnabled())
        return;
    for (const dirPath of result.updatedFiles)
        aiIndex.scheduleIndex(dirPath);
    if (result.hadDeletions || result.hadMetadataChanges)
        aiIndex.markStaleUnknown();
}
/** Renderer reload for the files of a pull, the same for both backends. */
function broadcastPulledNotes(result, opts) {
    // The pull wrote note folders: the dir the local archive had emptied holds notes
    // again. Cleared here because the per-note reload below never goes through
    // fs:read-all-notes, the other place that notices.
    if (result.updatedFiles.length > 0)
        notesDirEmptiedByArchive = false;
    // A pull may bring an agent.md back next to a note that is encrypted here
    // (see purgeAgentFileIfEncrypted): it goes again.
    for (const dirPath of result.updatedFiles) {
        try {
            purgeAgentFileIfEncrypted(path_1.default.basename(dirPath));
        }
        catch { /* never fails the pull */ }
    }
    // A manual sync also reloads everything when the pull brought nothing: it
    // covers files already on disk (written by an auto-sync) whose event the UI
    // missed — a manual sync should always bring the store in sync with disk.
    if (result.hadDeletions || result.hadMetadataChanges || (opts.manual && result.pulled === 0)) {
        electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
    }
    else {
        for (const filePath of result.updatedFiles) {
            electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', filePath, null));
        }
    }
}
function broadcastPullResult(result, backend, opts = { manual: false }) {
    indexPulledNotes(result);
    broadcastPulledNotes(result, opts);
    emitSyncStatusChanged();
    expireNotesAfterPull(result, backend);
}
// Every pull funnels here (broadcastPullResult + the manual GitHub pull): with sync
// connected this is the only place temporary notes are expired — see maybeCheckExpiredNotes.
function expireNotesAfterPull(result, backend) {
    maybeCheckExpiredNotes({
        kind: 'pull',
        backend,
        errorCount: result.errors.length,
        incomplete: result.incomplete === true,
    });
}
function startAutoSync() {
    if (autoSyncTimer)
        return;
    autoSyncTimer = setInterval(async () => {
        // Mutual exclusion: while NoteFlow Cloud is enabled it owns the sync loop
        // (see syncProvider.ts) — the GitHub timer stands down without being torn
        // down, so disabling Cloud resumes GitHub on the next tick.
        if (cloudSync.isCloudSyncEnabled())
            return;
        if (!githubSync.getSyncStatus().connected)
            return;
        // Drain the journal of failed remote mutations BEFORE pulling: a pending
        // upsert/delete that never landed would otherwise make the pull delete the
        // note locally or resurrect it (retrySyncJournal awaits each op, so the
        // mutation queue is drained when it returns).
        try {
            await githubSync.retrySyncJournal(NOTES_DIR);
        }
        catch (err) {
            console.error('[AutoSync] journal retry failed:', String(err));
        }
        // Stand down while local writes/deletes are still draining to the remote: pulling
        // now could re-add a note whose remote delete hasn't landed yet (the next tick,
        // 5 min later, runs with the queue drained). Manual pulls are unaffected.
        if (githubSync.hasPendingRemoteMutations()) {
            console.log('[AutoSync] skipping pull — remote mutations pending');
            return;
        }
        try {
            const result = await githubSync.pullNotes(NOTES_DIR);
            broadcastPullResult(result, 'github');
        }
        catch (err) {
            console.error('[AutoSync] pull failed:', String(err));
            emitSyncStatusChanged();
        }
    }, githubSync.GITHUB_AUTO_SYNC_INTERVAL_MS);
}
function stopAutoSync() {
    if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
        autoSyncTimer = null;
    }
}
// A conditional GitHub push/delete was held back because the file changed on
// GitHub since this device last saw it (githubSync.onRemoteConflict): pull soon
// — its conflict path applies the remote folder and keeps the local version as
// a conflict copy — instead of waiting for the next 5-min tick (which would
// resolve it too). Debounced (a burst of held-back files = one pull), only with
// GitHub as the active provider and its first pull done, and deferred like the
// tick while own remote mutations are still draining.
const GITHUB_CONFLICT_PULL_DELAY_MS = 3000;
let githubConflictPullTimer = null;
function scheduleGithubConflictPull() {
    if (githubConflictPullTimer)
        clearTimeout(githubConflictPullTimer);
    githubConflictPullTimer = setTimeout(() => {
        githubConflictPullTimer = null;
        void runGithubConflictPull();
    }, GITHUB_CONFLICT_PULL_DELAY_MS);
}
async function runGithubConflictPull() {
    if (cloudSync.isCloudSyncEnabled())
        return;
    const status = githubSync.getSyncStatus();
    if (!status.connected || status.initialPullStatus !== 'ok')
        return;
    if (githubSync.hasPendingRemoteMutations()) {
        scheduleGithubConflictPull(); // retry once the queue has drained
        return;
    }
    try {
        const result = await githubSync.pullNotes(NOTES_DIR);
        broadcastPullResult(result, 'github');
    }
    catch (err) {
        console.error('[Sync] conflict pull failed:', String(err));
        emitSyncStatusChanged();
    }
}
// ── NoteFlow Cloud autosync (Realtime signal + safety-net timer — stage 3) ────
let cloudAutoSyncTimer = null;
// Broadcasts the PUBLIC cloud status (never key material) to every window.
// Every cloud state transition funnels through here, which makes it the one
// choke point to also reconcile the Realtime subscription with the new state
// (enable/disable, setup, unlock/lock, managed auto-unlock — all emit).
function emitCloudStatusChanged() {
    syncCloudRealtimeState();
    const status = cloudSync.getCloudSyncStatus();
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('cloud:status-changed', status);
    });
}
// How long a MANUAL cycle waits for uploads/deletions already in flight to
// land before it pulls (an automatic cycle stands down right away instead).
const MANUAL_SYNC_SETTLE_TIMEOUT_MS = 15000;
// Single-flight guard: Realtime signals, the safety-net timer, the stale-resolve
// pull AND the manual sync all funnel into this runner — a cycle requested
// while one is running queues ONE more cycle after it (coalesces bursts, never
// overlaps pulls), and each caller waits for the cycle that covers its request.
const cloudSyncCycle = (0, syncCycle_1.createCoalescedRunner)((flags) => runCloudSyncCycleOnce(flags), (queued, incoming) => ({ manual: queued.manual || incoming.manual }));
/**
 * One cloud sync cycle: managed auto-unlock if needed → stand down if writes
 * are in flight → incremental pull (+ its notes broadcast) → drain the journal
 * → status broadcast. The pull
 * goes FIRST (unlike the GitHub tick): Cloud uploads of note rows are
 * conditional (a version older than the server's is rejected as stale), and
 * pulling first lets the newer remote versions land and settle the matching
 * pending uploads before the drain re-sends anything. The pull's journal
 * guards (pending deleteDir/delete/upsert) keep unsynced local intents safe.
 */
async function runCloudSyncCycle() {
    await cloudSyncCycle.run({ manual: false });
}
/**
 * The body of a cycle; resolves with the pull result (null when the cycle
 * stood down before pulling). A MANUAL cycle differs in three ways: with the
 * keys still locked it pulls anyway (the pull reports "Cloud keys are locked",
 * which is what the user who clicked needs to see — the drain stays a no-op);
 * with writes in flight it waits for them to land (bounded) instead of standing
 * down; and its notes broadcast is the manual one (full reload when nothing
 * was pulled — broadcastPulledNotes).
 */
async function runCloudSyncCycleOnce({ manual }) {
    if (!cloudSync.isCloudSyncEnabled())
        return null;
    // The notes dir belongs to another NoteFlow account (origin choice pending)
    // or settings.json is unreadable: nothing moves — no unlock, pull nor drain
    // (the engine refuses too). Re-derived, not cached: the CLI may have
    // switched the session behind the app.
    cloudSync.refreshCloudOriginGate();
    if (cloudSync.isCloudOriginGateBlocked()) {
        emitCloudStatusChanged();
        return null;
    }
    // Locked keys: managed sessions re-unlock silently (e.g. the boot attempt
    // ran offline); e2ee stays locked until the user types the passphrase.
    // Pending ops stay journaled and drain after unlock either way.
    if (cloudSync.getCloudSyncStatus().keysState !== 'unlocked') {
        const changed = await cloudKeys.autoUnlockManaged().catch(() => false);
        if (changed)
            emitCloudStatusChanged();
        if (!manual && cloudSync.getCloudSyncStatus().keysState !== 'unlocked')
            return null;
    }
    // Stand down while writes are in flight (the next cycle runs once they
    // land): pulling now could resurrect a note whose remote delete hasn't
    // landed yet. A manual sync gives them a moment to land first.
    if (cloudSync.hasPendingRemoteMutations()) {
        const settled = manual &&
            (await (0, syncCycle_1.waitUntil)(() => !cloudSync.hasPendingRemoteMutations(), MANUAL_SYNC_SETTLE_TIMEOUT_MS));
        if (!settled) {
            console.log('[CloudAutoSync] skipping cycle — remote mutations pending');
            if (manual)
                emitCloudStatusChanged();
            return null;
        }
    }
    let result = null;
    try {
        result = await cloudSync.pullNotes(NOTES_DIR);
        // Broadcast BEFORE the drain: an open editor must reload the pulled
        // version right away — the drain can take a while, and every second the
        // editor keeps the old content is a chance to save it over the pull.
        broadcastPullResult(result, 'cloud', { manual });
    }
    catch (err) {
        console.error('[CloudAutoSync] pull failed:', String(err));
        if (manual)
            result = { ...emptyPullResult(), errors: [String(err)] };
    }
    try {
        await cloudSync.retrySyncJournal(NOTES_DIR);
    }
    catch (err) {
        console.error('[CloudAutoSync] journal retry failed:', String(err));
    }
    emitCloudStatusChanged();
    return result;
}
function emptyPullResult() {
    return { pulled: 0, deleted: 0, errors: [], updatedFiles: [], hadDeletions: false, hadMetadataChanges: false };
}
// A conditional Cloud upload came back stale (cloudSync.onRemoteConflict: the
// server holds a version of the file this device has not reconciled — the
// drain skips stale ops, the pull resolves them by its three-way merge): run a
// cycle soon instead of waiting for the next Realtime signal / 5-min tick.
// Coalesced (one armed timer at a time), with a floor between two such pulls
// (staleResolvePullDelay) so a file that keeps going stale can't loop pulls;
// deferred while own writes are still in flight (the cycle would stand down).
let cloudStalePullTimer = null;
let lastCloudStalePullAt = 0;
function scheduleCloudStalePull() {
    if (cloudStalePullTimer)
        return;
    cloudStalePullTimer = setTimeout(() => {
        cloudStalePullTimer = null;
        void runCloudStalePull();
    }, (0, cloudSyncLogic_1.staleResolvePullDelay)(Date.now(), lastCloudStalePullAt));
}
async function runCloudStalePull() {
    if (!cloudSync.isCloudSyncEnabled() || cloudSync.getCloudSyncStatus().initialPullStatus !== 'ok')
        return;
    if (cloudSync.hasPendingRemoteMutations()) {
        scheduleCloudStalePull(); // retry once the uploads in flight have landed
        return;
    }
    lastCloudStalePullAt = Date.now();
    await runCloudSyncCycle().catch((err) => console.error('[CloudAutoSync] stale-resolve cycle failed:', String(err)));
}
// A push from another device lands as a BURST of Realtime events (one per row
// of the note folder) — debounce them into a single sync cycle.
const CLOUD_REALTIME_DEBOUNCE_MS = 1500;
let cloudRealtimeDebounce = null;
function onCloudRemoteChange() {
    if (cloudRealtimeDebounce)
        clearTimeout(cloudRealtimeDebounce);
    cloudRealtimeDebounce = setTimeout(() => {
        cloudRealtimeDebounce = null;
        runCloudSyncCycle().catch((err) => console.error('[CloudRealtime] sync cycle failed:', String(err)));
    }, CLOUD_REALTIME_DEBOUNCE_MS);
}
// Reconciles the Realtime subscription with the current state: it runs only
// while Cloud sync is enabled, there is a session, the keys are unlocked
// (events are useless while a pull can't decrypt anyway) AND the origin gate
// is open (a pending origin choice must not trigger cycles — the cycle would
// stand down anyway). The gate's transitions emit cloud:status-changed, which
// lands here. Both start and stop are idempotent, so calling this on every
// status transition is safe.
function syncCloudRealtimeState() {
    const status = cloudSync.getCloudSyncStatus();
    if (status.enabled && status.signedIn && status.keysState === 'unlocked' && !cloudSync.isCloudOriginGateBlocked()) {
        cloudRealtime.startCloudRealtime(onCloudRemoteChange);
    }
    else {
        cloudRealtime.stopCloudRealtime();
        if (cloudRealtimeDebounce) {
            clearTimeout(cloudRealtimeDebounce);
            cloudRealtimeDebounce = null;
        }
    }
}
// Orchestrator: starts BOTH halves of the cloud autosync — the Realtime
// subscription (instant signal) and the periodic safety-net loop (covers a
// down WebSocket and drains the journal while offline).
function startCloudAutoSync() {
    syncCloudRealtimeState();
    if (cloudAutoSyncTimer)
        return;
    cloudAutoSyncTimer = setInterval(() => {
        runCloudSyncCycle().catch((err) => console.error('[CloudAutoSync] sync cycle failed:', String(err)));
    }, cloudSync.CLOUD_AUTO_SYNC_INTERVAL_MS);
}
function stopCloudAutoSync() {
    cloudRealtime.stopCloudRealtime();
    if (cloudRealtimeDebounce) {
        clearTimeout(cloudRealtimeDebounce);
        cloudRealtimeDebounce = null;
    }
    if (cloudAutoSyncTimer) {
        clearInterval(cloudAutoSyncTimer);
        cloudAutoSyncTimer = null;
    }
}
// Running from the Microsoft Store package (MSIX/APPX). Electron sets
// process.windowsStore only inside a packaged Windows Store app.
const IS_STORE_BUILD = process.windowsStore === true;
const OLD_NOTES_DIR = path_1.default.join(os_1.default.homedir(), 'scratch-notes');
// The default location (syncOrigin.defaultNotesDir — the sync engines use it too:
// an origin record without `notesDir` belongs to it). On Linux it follows the XDG
// Base Directory Specification using ~/.local/share as base, deliberately not
// process.env.XDG_DATA_HOME: snap/flatpak runtimes override it to their sandboxed
// paths, which would make notes inaccessible outside the dev environment.
// NOTEFLOW_NOTES_DIR overrides the location (testing / scripting; mirrors the CLI).
const NOTES_DIR = process.env.NOTEFLOW_NOTES_DIR || (0, syncOrigin_1.defaultNotesDir)();
// Migrate old ~/scratch-notes → new NOTES_DIR
if (fs_1.default.existsSync(OLD_NOTES_DIR) && !fs_1.default.existsSync(NOTES_DIR)) {
    fs_1.default.mkdirSync(path_1.default.dirname(NOTES_DIR), { recursive: true });
    fs_1.default.renameSync(OLD_NOTES_DIR, NOTES_DIR);
}
// On Linux: migrate legacy ~/noteflow-notes → ~/.local/share/noteflow-notes
if (process.platform === 'linux') {
    const legacyLinuxDir = path_1.default.join(os_1.default.homedir(), 'noteflow-notes');
    if (fs_1.default.existsSync(legacyLinuxDir) && !fs_1.default.existsSync(NOTES_DIR)) {
        fs_1.default.mkdirSync(path_1.default.dirname(NOTES_DIR), { recursive: true });
        fs_1.default.renameSync(legacyLinuxDir, NOTES_DIR);
    }
}
// Ensure notes directory exists. Remembered for the first-run welcome note: a
// dir created just now is certainly empty (no need to retry its listing).
const NOTES_DIR_CREATED_AT_STARTUP = !fs_1.default.existsSync(NOTES_DIR);
if (NOTES_DIR_CREATED_AT_STARTUP) {
    fs_1.default.mkdirSync(NOTES_DIR, { recursive: true });
}
const GROUPS_FILE = path_1.default.join(NOTES_DIR, 'groups.json');
const FOLDERS_FILE = path_1.default.join(NOTES_DIR, 'folders.json');
const SECTION_COLORS_FILE = path_1.default.join(NOTES_DIR, 'section-colors.json');
const NOTE_ORDER_FILE = path_1.default.join(NOTES_DIR, 'note-order.json');
const TEMPLATES_FILE = path_1.default.join(NOTES_DIR, 'templates.json');
const SNIPPETS_FILE = path_1.default.join(NOTES_DIR, 'snippets.json');
const UI_SETTINGS_FILE = path_1.default.join(NOTES_DIR, 'ui-settings.json');
const SECTION_COLOR_VALUES = new Set([
    '--accent',
    '--accent-2',
    '--red',
    '--cyan',
    '--purple',
    '--text',
    '--orange',
    '--pink',
]);
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:']);
const ALLOWED_UPDATE_HOSTS = new Set(['github.com']);
const ALLOWED_UPDATE_REDIRECT_HOSTS = new Set([
    'github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com',
]);
function normalizeSectionColorKey(name) {
    return name.trim().toLowerCase();
}
/**
 * Mirror of normalizeGroupColor() in src/lib/tagColors.ts (main can't import from src/):
 * a theme var stays as-is, a free colour is normalized to lowercase '#rrggbb'
 * ('#rgb' shorthand expanded); anything else is dropped.
 */
function normalizeSectionColorValue(value) {
    if (typeof value !== 'string')
        return null;
    const v = value.trim();
    if (SECTION_COLOR_VALUES.has(v))
        return v;
    if (/^#[0-9a-f]{6}$/i.test(v))
        return v.toLowerCase();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
    if (short)
        return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
    return null;
}
function sanitizeSectionColors(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return {};
    const next = {};
    for (const [key, value] of Object.entries(raw)) {
        const color = normalizeSectionColorValue(value);
        if (!color)
            continue;
        const normalizedKey = normalizeSectionColorKey(key);
        if (!normalizedKey)
            continue;
        next[normalizedKey] = color;
    }
    return next;
}
// Root-level entries of the notes dir that can never be a note directory
const RESERVED_ROOT_NAMES = new Set([
    'groups.json',
    'folders.json',
    'section-colors.json',
    'note-order.json',
    'templates.json',
    'snippets.json',
    'ui-settings.json',
    'README.md',
    noteFormat.FORMAT_MARKER_FILE,
]);
/** Validates a note directory name (accepts an absolute dir path; uses its basename). */
function ensureSafeDirname(dirOrPath) {
    if (typeof dirOrPath !== 'string')
        throw new Error('Invalid note directory');
    const dir = path_1.default.basename(dirOrPath.replace(/[\\/]+$/, '')).trim();
    if (!dir || dir === '.' || dir === '..')
        throw new Error('Invalid note directory');
    if (dir.includes('/') || dir.includes('\\'))
        throw new Error('Invalid note directory');
    if (dir.startsWith('.') || RESERVED_ROOT_NAMES.has(dir))
        throw new Error('Invalid note directory');
    if (dir.length > 160)
        throw new Error('Note directory name is too long');
    return dir;
}
/** Validates a file name inside a note directory (note.md or a section .md). */
function ensureSafeNoteFile(file) {
    if (typeof file !== 'string')
        throw new Error('Invalid note file name');
    const name = file.trim();
    if (!name || name === '.' || name === '..')
        throw new Error('Invalid note file name');
    if (name.includes('/') || name.includes('\\') || path_1.default.basename(name) !== name)
        throw new Error('Invalid note file name');
    if (!name.toLowerCase().endsWith('.md'))
        throw new Error('Only markdown note files are allowed');
    if (name.length > 160)
        throw new Error('Note file name is too long');
    return name;
}
function parseHttpsUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function isAllowedInitialUpdateUrl(url) {
    if (!ALLOWED_UPDATE_HOSTS.has(url.hostname))
        return false;
    return (0, updateAsset_1.isAllowedUpdateAssetPath)(url.pathname);
}
function isAllowedRedirectUpdateUrl(url) {
    return ALLOWED_UPDATE_REDIRECT_HOSTS.has(url.hostname);
}
function createWindow(hidden = false) {
    // Default size, clamped to the work area so it never overflows small screens.
    const workArea = electron_1.screen.getPrimaryDisplay().workAreaSize;
    const win = new electron_1.BrowserWindow({
        width: Math.max(700, Math.min(1440, Math.round(workArea.width * 0.92))),
        height: Math.max(500, Math.min(920, Math.round(workArea.height * 0.92))),
        minWidth: 700,
        minHeight: 500,
        frame: false,
        transparent: false,
        backgroundColor: '#1a1b26',
        titleBarStyle: 'hidden',
        show: false,
        icon: getIconPath(),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // Prevent Chromium from throttling/killing the renderer while hidden in the
            // tray. Without this, the renderer can crash after suspend or prolonged idle,
            // leaving a blank window that requires a full process restart to recover.
            backgroundThrottling: false,
        },
    });
    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    // Page zoom is owned by the renderer: themeStore.initTheme() applies the "UI
    // text size" via webFrame.setZoomFactor on every load (all window kinds), which
    // also overrides any zoom Chromium persisted in userData (old versions set
    // zoomFactor: scaleFactor). Don't reset it here: did-finish-load fires after
    // initTheme() and would undo the user's scale.
    win.once('ready-to-show', () => {
        if (hidden)
            return; // startup mode: stay hidden in tray
        win.show();
    });
    // Hide instead of close — keeps the process alive for fast re-open
    win.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            win.hide();
        }
    });
    // Tell the renderer when the window stops being seen. With backgroundThrottling off (above)
    // Chromium never reports the page as hidden: `document.hidden` stays false and
    // requestAnimationFrame keeps firing at full rate while the window sits minimised or hidden in
    // the tray, so anything that animates (the 3D brain) would keep drawing for nobody. The state
    // is read when the event fires rather than inferred from which event it was.
    const sendVisibility = () => {
        if (win.isDestroyed() || win.webContents.isDestroyed())
            return;
        win.webContents.send('window:visibility', win.isVisible() && !win.isMinimized());
    };
    win.on('show', sendVisibility);
    win.on('hide', sendVisibility);
    win.on('minimize', sendVisibility);
    win.on('restore', sendVisibility);
    // Auto-recover when the renderer process crashes or is killed by the OS
    // (common after system suspend/resume or prolonged idle under memory pressure).
    win.webContents.on('render-process-gone', (_event, details) => {
        if (details.reason === 'clean-exit')
            return;
        console.error('[Renderer] Process gone:', details.reason, details.exitCode);
        if (isDev) {
            win.loadURL('http://localhost:5173');
        }
        else {
            win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
        }
        // After the reload, send notes-updated once the renderer is ready.
        // The powerMonitor.resume signals may have already been sent to the old
        // (now dead) renderer, so the new one needs its own trigger.
        win.webContents.once('did-finish-load', () => {
            setTimeout(() => {
                if (!win.isDestroyed())
                    win.webContents.send('notes-updated');
            }, 2000);
        });
    });
    win.on('unresponsive', () => {
        console.warn('[Renderer] Unresponsive — reloading');
        win.webContents.reload();
        win.webContents.once('did-finish-load', () => {
            setTimeout(() => {
                if (!win.isDestroyed())
                    win.webContents.send('notes-updated');
            }, 2000);
        });
    });
    return win;
}
/**
 * Builds a pixel-accurate rounded-rectangle region using 1px horizontal strips.
 * Passed to win.setShape() so Windows DWM knows the true window shape —
 * CSS border-radius alone is ignored by the DWM when the window loses focus.
 */
function roundedRectRegion(w, h, r) {
    const R = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
    const rects = [];
    for (let y = 0; y < R; y++) {
        const d = R - y - 0.5;
        const xOff = Math.max(0, R - Math.round(Math.sqrt(Math.max(0, R * R - d * d))));
        rects.push({ x: xOff, y, width: w - 2 * xOff, height: 1 });
        rects.push({ x: xOff, y: h - 1 - y, width: w - 2 * xOff, height: 1 });
    }
    if (h > 2 * R) {
        rects.push({ x: 0, y: R, width: w, height: h - 2 * R });
    }
    return rects;
}
// Corner radius of the sticky window's DWM region. Must match the CSS `rounded-lg`
// (8px) used by both the expanded sticky and the folded pill (StickyApp.tsx), so the
// clip region and the CSS border line up. Applies to the folded state too: on Windows
// an opaque frameless window can't be shorter than ~39px, so the folded window is
// taller than the requested FOLDED_H and the pill fills it (h-screen).
const STICKY_RADIUS = 8;
// Minimum width/height of an expanded sticky (lifted while folded).
const STICKY_MIN_SIZE = 200;
// Size of the folded pill when a sticky opens already folded (startup). Must match
// FOLDED_W/FOLDED_H in StickyApp.tsx, which the renderer sends on a regular fold.
const STICKY_FOLDED_W = 220;
const STICKY_FOLDED_H = 32;
function applyStickyShape(win, w, h) {
    // win.setShape() is Windows-only (DWM); no-op on Linux/macOS
    if (process.platform !== 'win32')
        return;
    const [ww, hh] = w !== undefined ? [w, h] : win.getSize();
    win.setShape(roundedRectRegion(ww, hh, STICKY_RADIUS));
}
// Stores the pre-fold bounds per window so unfold can restore them exactly
const prevBoundsMap = new Map();
// Tracks all open sticky windows to cascade their initial positions
const stickyWindows = new Set();
// win.id → the note a sticky shows (a transient linked note shown there isn't discarded).
const stickyNoteIds = new Map();
// Tracks currently folded sticky windows to stack their pills vertically
const foldedWindows = new Set();
// ── Remembered sticky geometry (settings.json → stickyBounds, per PC) ────────
// See electron/stickyBounds.ts. win.id → key of the (noteId, sectionId) the
// sticky was opened with.
const stickyKeys = new Map();
// win.id → bounds the folded pill had when the fold animation ended. A pill
// still there was not moved/resized by the user, so nothing new is remembered.
const foldedSettledBounds = new Map();
// win.id → running fold/unfold animation. Programmatic moves/resizes made by it
// are never remembered as the user's choice (macOS emits 'moved' for them too).
const stickyAnimations = new Map();
function saveStickyBounds(key, patch) {
    const settings = readSettings();
    const next = (0, stickyBounds_1.withStickyBounds)((0, stickyBounds_1.sanitizeStickyBounds)(settings.stickyBounds), key, patch);
    if (JSON.stringify(next) === JSON.stringify(settings.stickyBounds))
        return;
    settings.stickyBounds = next;
    writeSettings(settings);
}
// The remembered rect of `kind` for `key`, only if it is still on a connected
// display (a disconnected monitor → null → default placement).
function rememberedStickyRect(key, kind) {
    const rect = (0, stickyBounds_1.sanitizeStickyBounds)(readSettings().stickyBounds)[key]?.[kind];
    if (!rect)
        return null;
    return (0, stickyBounds_1.isRectVisible)(rect, electron_1.screen.getAllDisplays().map((d) => d.bounds)) ? rect : null;
}
function wasStickyLeftFolded(key) {
    return (0, stickyBounds_1.sanitizeStickyBounds)(readSettings().stickyBounds)[key]?.isFolded === true;
}
// Remembers whether the sticky of `key` is folded (fold/unfold, and an expanded open):
// a startup sticky reopens in that state after a reboot. Only writes on a change.
function rememberStickyFolded(key, folded) {
    if (wasStickyLeftFolded(key) !== folded)
        saveStickyBounds(key, { isFolded: folded });
}
// Another open sticky of the same key already uses its remembered spot (the
// same note/section opened twice): place this one by default instead of on top.
function stickyKeyInUse(win, key, among) {
    for (const w of among) {
        if (w !== win && !w.isDestroyed() && stickyKeys.get(w.id) === key)
            return true;
    }
    return false;
}
// 'moved'/'resized' → one save ~400 ms after the last event. On Windows they fire
// once at the end of a drag, but on macOS 'moved' is an alias of 'move' and fires
// continuously while dragging (and on programmatic setPosition). The guards in
// rememberStickyBounds are evaluated when the timer fires, not when scheduled.
const STICKY_BOUNDS_SAVE_DEBOUNCE_MS = 400;
const stickyBoundsSaveDebounce = (0, stickyBounds_1.createKeyedDebounce)(STICKY_BOUNDS_SAVE_DEBOUNCE_MS);
function scheduleRememberStickyBounds(win) {
    stickyBoundsSaveDebounce.schedule(win.id, () => rememberStickyBounds(win));
}
// Save points that must not wait (fold, unfold, close): drop the pending debounced
// save and remember the current bounds right now.
function rememberStickyBoundsNow(win) {
    stickyBoundsSaveDebounce.cancel(win.id);
    rememberStickyBounds(win);
}
// Called (debounced) after the user moves/resizes a sticky ('moved'/'resized':
// Windows/macOS; Linux has neither) and, as the cross-platform save points, on
// fold, unfold and close. Mid-animation bounds are never saved.
function rememberStickyBounds(win) {
    // Minimized: the OS may report parking coordinates (e.g. -32000 on Windows).
    if (win.isDestroyed() || win.isMinimized() || stickyAnimations.has(win.id))
        return;
    const key = stickyKeys.get(win.id);
    // Not yet placed (ready-to-show adds it to stickyWindows after positioning).
    if (!key || !stickyWindows.has(win))
        return;
    const bounds = win.getBounds();
    // Never overwrite a good spot with one that wouldn't be restored anyway.
    if (!(0, stickyBounds_1.isRectVisible)(bounds, electron_1.screen.getAllDisplays().map((d) => d.bounds)))
        return;
    if (!foldedWindows.has(win)) {
        saveStickyBounds(key, { expanded: bounds });
        return;
    }
    // Folded: only a pill the user actually moved/resized becomes its spot; one
    // left where the fold put it (e.g. the default corner stack) changes nothing.
    const settled = foldedSettledBounds.get(win.id);
    if (!settled || !(0, stickyBounds_1.rectChanged)(bounds, settled))
        return;
    foldedSettledBounds.set(win.id, bounds);
    saveStickyBounds(key, { folded: bounds });
}
function getFoldedPosition(display, foldedW, _foldedH) {
    const { x, y, width } = display.workArea;
    const targetX = x + width - foldedW - 8;
    const GAP = 4;
    // Find the bottom edge of the lowest folded pill already in the corner
    let nextY = y + 40;
    for (const w of foldedWindows) {
        if (w.isDestroyed())
            continue;
        const [wx, wy] = w.getPosition();
        const [, wh] = w.getSize();
        if (Math.abs(wx - targetX) < 20) {
            nextY = Math.max(nextY, wy + wh + GAP);
        }
    }
    return { x: targetX, y: nextY };
}
function getStickyInitialPosition(winWidth, _winHeight) {
    const display = electron_1.screen.getPrimaryDisplay();
    const { x: wa_x, y: wa_y, width: wa_w } = display.workArea;
    const BASE_X = wa_x + Math.round((wa_w - winWidth) / 2);
    const BASE_Y = wa_y + 60;
    const STEP = 30;
    for (let i = 0; i < 20; i++) {
        const cx = BASE_X + i * STEP;
        const cy = BASE_Y + i * STEP;
        const overlaps = [...stickyWindows].some(w => {
            if (w.isDestroyed())
                return false;
            const [wx, wy] = w.getPosition();
            return Math.abs(wx - cx) < STEP && Math.abs(wy - cy) < STEP;
        });
        if (!overlaps)
            return { x: cx, y: cy };
    }
    return { x: BASE_X, y: BASE_Y };
}
function animateStickyWindow(win, from, to, duration, onComplete) {
    const id = win.id;
    // A new animation replaces the running one (e.g. unfold clicked mid-fold)
    // instead of both intervals fighting over the window.
    const running = stickyAnimations.get(id);
    if (running)
        clearInterval(running);
    const startTime = Date.now();
    const tick = setInterval(() => {
        if (win.isDestroyed()) {
            clearInterval(tick);
            stickyAnimations.delete(id);
            return;
        }
        const t = Math.min((Date.now() - startTime) / duration, 1);
        const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const x = Math.round(from.x + (to.x - from.x) * e);
        const y = Math.round(from.y + (to.y - from.y) * e);
        const w = Math.round(from.width + (to.width - from.width) * e);
        const h = Math.round(from.height + (to.height - from.height) * e);
        win.setMinimumSize(1, 1);
        win.setSize(w, h);
        win.setPosition(x, y);
        // Shape from the real size: the OS may clamp the request (Windows enforces a
        // ~39px minimum height on opaque frameless windows, so 32 becomes 39).
        applyStickyShape(win);
        if (t >= 1) {
            clearInterval(tick);
            stickyAnimations.delete(id);
            onComplete?.();
        }
    }, 16);
    stickyAnimations.set(id, tick);
}
// `restoreFolded` (startup stickies): reopen folded if it was left folded last time.
// A sticky opened from the app always opens expanded.
function createStickyWindow(noteId, sectionId, { restoreFolded = false } = {}) {
    // On Windows, `transparent: true` stops compositing correctly after some Win11
    // updates (24H2/25H2), leaving the sticky window near-invisible. The rounded
    // corners come from setShape() (DWM region clip) there, so transparency is
    // redundant: use an opaque neutral background instead. On Linux/macOS setShape()
    // is a no-op and CSS rounding still needs transparency.
    const isWin = process.platform === 'win32';
    const win = new electron_1.BrowserWindow({
        width: 300,
        height: 300,
        minWidth: STICKY_MIN_SIZE,
        minHeight: STICKY_MIN_SIZE,
        frame: false,
        transparent: !isWin,
        backgroundColor: isWin ? '#1e1e1e' : '#00000000',
        titleBarStyle: 'hidden',
        show: false,
        alwaysOnTop: true,
        icon: getIconPath(),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const key = (0, stickyBounds_1.stickyBoundsKey)(noteId, sectionId);
    const startFolded = restoreFolded && wasStickyLeftFolded(key);
    // Hash routing pattern for the sticky page (`folded=1`: StickyApp starts as the pill)
    const hash = `#sticky?noteId=${encodeURIComponent(noteId)}&sectionId=${encodeURIComponent(sectionId)}${startFolded ? '&folded=1' : ''}`;
    if (isDev) {
        win.loadURL(`http://localhost:5173/${hash}`);
    }
    else {
        // In production, file:// URLs need the hash at the end
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'), { hash });
    }
    // Apply the OS-level window shape so Windows DWM respects the rounded corners
    // even when the window loses focus (CSS border-radius is ignored by DWM).
    win.on('resize', () => applyStickyShape(win));
    stickyKeys.set(win.id, key);
    stickyNoteIds.set(win.id, noteId);
    win.on('moved', () => scheduleRememberStickyBounds(win));
    win.on('resized', () => scheduleRememberStickyBounds(win));
    win.on('close', () => rememberStickyBoundsNow(win));
    win.on('closed', () => {
        stickyBoundsSaveDebounce.cancel(win.id);
        prevBoundsMap.delete(win.id);
        stickyWindows.delete(win);
        foldedWindows.delete(win);
        stickyKeys.delete(win.id);
        foldedSettledBounds.delete(win.id);
        const running = stickyAnimations.get(win.id);
        if (running)
            clearInterval(running);
        stickyAnimations.delete(win.id);
        stickyNoteIds.delete(win.id);
        releaseTransientNote(noteId);
    });
    win.once('ready-to-show', () => {
        // Reopen where the user last left this sticky (and at that size), unless it
        // is off every connected display or the same sticky is already open there.
        const remembered = rememberedStickyRect(key, 'expanded');
        const expanded = remembered && !stickyKeyInUse(win, key, stickyWindows)
            ? {
                ...remembered,
                width: Math.max(remembered.width, STICKY_MIN_SIZE),
                height: Math.max(remembered.height, STICKY_MIN_SIZE),
            }
            : { ...getStickyInitialPosition(300, 300), width: 300, height: 300 };
        if (startFolded) {
            // Reopen as the pill, like a fold without the animation: the expanded bounds
            // are only what unfold goes back to (never resized to the pill's size), and
            // the pill goes to its remembered spot or the default corner stack (computed
            // before adding `win` to foldedWindows, as in window:fold-to-corner).
            prevBoundsMap.set(win.id, expanded);
            const rememberedPill = rememberedStickyRect(key, 'folded');
            const pill = rememberedPill && !stickyKeyInUse(win, key, foldedWindows)
                ? rememberedPill
                : {
                    ...getFoldedPosition(electron_1.screen.getDisplayNearestPoint(expanded), STICKY_FOLDED_W, STICKY_FOLDED_H),
                    width: STICKY_FOLDED_W,
                    height: STICKY_FOLDED_H,
                };
            win.setMinimumSize(1, 1);
            win.setBounds(pill);
            foldedWindows.add(win);
        }
        else {
            win.setBounds(expanded);
            // Opened expanded: that is now its state to restore (unless the same sticky
            // is still folded in another window).
            if (!stickyKeyInUse(win, key, foldedWindows))
                rememberStickyFolded(key, false);
        }
        stickyWindows.add(win);
        applyStickyShape(win);
        win.show();
        // Real bounds once shown (the OS may clamp the pill's height): the baseline to
        // tell a pill the user moved from one left where it opened.
        if (startFolded)
            foldedSettledBounds.set(win.id, win.getBounds());
    });
    return win;
}
// ── Section windows ──────────────────────────────────────────────────────────
// Editor-only windows for one section of a note ("Open in new window"): a normal,
// resizable, frameless window (NOT always-on-top) that loads the app with
// `#section-window?noteId=…&sectionId=…` → SectionWindowApp. The renderer runs as a
// secondary window (no alarms on load, no persisted UI state, no pruning) and keeps
// in sync through the regular `notes-updated` broadcast. Closing destroys it.
// Value = the section the window is showing right now (the renderer reports changes
// via window:section-window-target), so re-opening that section focuses it.
const sectionWindows = new Map();
function loadSectionWindow(win, noteId, sectionId) {
    const hash = `#section-window?noteId=${encodeURIComponent(noteId)}&sectionId=${encodeURIComponent(sectionId)}`;
    if (isDev) {
        win.loadURL(`http://localhost:5173/${hash}`);
    }
    else {
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'), { hash });
    }
}
// `nearCursor`: a note dragged out of a window — open where it was dropped (the pointer is
// still there) instead of cascading. An existing window on that section is only focused.
function createSectionWindow(noteId, sectionId, nearCursor = false) {
    for (const [existing, target] of sectionWindows) {
        if (existing.isDestroyed())
            continue;
        if (target.noteId === noteId && target.sectionId === sectionId) {
            if (existing.isMinimized())
                existing.restore();
            existing.show();
            existing.focus();
            return existing;
        }
    }
    const WIDTH = 760;
    const HEIGHT = 680;
    // Cascade from the last open section window so new ones don't stack exactly.
    const last = [...sectionWindows.keys()].filter((w) => !w.isDestroyed()).pop();
    const cursor = nearCursor ? electron_1.screen.getCursorScreenPoint() : null;
    const bounds = cursor
        ? (0, windowPlacement_1.placeWindowAtPoint)(cursor, { width: WIDTH, height: HEIGHT }, electron_1.screen.getDisplayNearestPoint(cursor).workArea)
        : last
            ? (() => { const [x, y] = last.getPosition(); return { x: x + 30, y: y + 30, width: WIDTH, height: HEIGHT }; })()
            : { width: WIDTH, height: HEIGHT };
    const win = new electron_1.BrowserWindow({
        ...bounds,
        minWidth: 420,
        minHeight: 320,
        frame: false,
        transparent: false,
        backgroundColor: '#1a1b26',
        titleBarStyle: 'hidden',
        show: false,
        icon: getIconPath(),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    sectionWindows.set(win, { noteId, sectionId });
    loadSectionWindow(win, noteId, sectionId);
    win.once('ready-to-show', () => {
        win.show();
        win.focus();
    });
    win.on('closed', () => {
        const target = sectionWindows.get(win);
        sectionWindows.delete(win);
        if (target)
            releaseTransientNote(target.noteId);
    });
    // Same recovery as the main window: reload a crashed/hung renderer, back on the
    // section it was showing.
    win.webContents.on('render-process-gone', (_event, details) => {
        if (details.reason === 'clean-exit' || win.isDestroyed())
            return;
        console.error('[SectionWindow] Renderer gone:', details.reason, details.exitCode);
        const target = sectionWindows.get(win) ?? { noteId, sectionId };
        loadSectionWindow(win, target.noteId, target.sectionId);
    });
    win.on('unresponsive', () => {
        console.warn('[SectionWindow] Unresponsive — reloading');
        win.webContents.reload();
    });
    return win;
}
// ── Detached AI chat window ───────────────────────────────────────────────────
// The editor's chat sidebar can move to its own frameless window (`#ai-chat` → AiChatWindowApp).
// The conversation MOVES with it: the main window hands its chat state over (`ai:chat-window-open`),
// the chat window takes it on load (`ai:chat-window-get-state`) and gives it back when it closes
// (`ai:chat-window-return` → `ai:chat-window-returned` to the main window). Only one renderer owns
// the conversation at a time, so two windows never write ai-chats.json concurrently. Main also
// relays the main window's open note/section (for the context bar) and the chat window's
// requests that need the main window (open a note, AI settings).
let chatWindow = null;
let chatHandoff = null; // served to the chat window on (re)load until it hands it back
let chatEditorTarget = null; // latest note/section open in the main window
let returnChatWindow = null;
/** Saved size (and position, if it still lands on a screen) of the chat window. */
function readChatWindowBounds() {
    const b = (readSettings().aiChatWindow ?? {}).bounds;
    if (!b || ![b.x, b.y, b.width, b.height].every((v) => typeof v === 'number' && Number.isFinite(v)))
        return null;
    const bounds = b;
    // Forget a position that no longer lands on any screen (monitor unplugged).
    const visible = electron_1.screen.getAllDisplays().some(({ workArea: wa }) => bounds.x < wa.x + wa.width && bounds.x + bounds.width > wa.x && bounds.y < wa.y + wa.height && bounds.y + bounds.height > wa.y);
    return visible ? bounds : { width: bounds.width, height: bounds.height };
}
function saveChatWindowBounds(win) {
    if (win.isDestroyed() || win.isMinimized())
        return;
    const settings = readSettings();
    writeSettings({ ...settings, aiChatWindow: { ...(settings.aiChatWindow ?? {}), bounds: win.getNormalBounds() } });
}
function loadChatWindow(win) {
    if (isDev)
        win.loadURL('http://localhost:5173/#ai-chat');
    else
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'), { hash: 'ai-chat' });
}
function focusChatWindow() {
    const win = chatWindow;
    if (!win || win.isDestroyed())
        return;
    if (win.isMinimized())
        win.restore();
    win.show();
    win.focus();
}
function createChatWindow() {
    if (chatWindow && !chatWindow.isDestroyed()) {
        focusChatWindow();
        return chatWindow;
    }
    const saved = readChatWindowBounds();
    const placed = saved?.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {};
    const win = new electron_1.BrowserWindow({
        width: saved?.width ?? 440,
        height: saved?.height ?? 680,
        ...placed,
        minWidth: 340,
        minHeight: 360,
        frame: false,
        // Opaque on every platform: like the section window it has square corners, so it doesn't
        // need the sticky's transparency (which Windows 11 24H2+ composites badly).
        transparent: false,
        backgroundColor: '#1a1b26',
        titleBarStyle: 'hidden',
        show: false,
        // Pinning (always on top) is the renderer's toggle, off on every open.
        alwaysOnTop: false,
        icon: getIconPath(),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    chatWindow = win;
    let returned = false;
    // Hand the conversation back to the main window exactly once, then destroy the window.
    const finish = (handoff) => {
        if (returned)
            return;
        returned = true;
        chatHandoff = null;
        if (returnChatWindow === finish)
            returnChatWindow = null;
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('ai:chat-window-returned', handoff ?? null);
        if (!win.isDestroyed()) {
            saveChatWindowBounds(win); // destroy() skips the 'close' event
            win.destroy();
        }
    };
    returnChatWindow = finish;
    loadChatWindow(win);
    win.once('ready-to-show', () => { win.show(); win.focus(); });
    // Any close (button, Alt+F4, taskbar) first asks the renderer for the conversation — it cancels
    // a running reply and answers with `ai:chat-window-return`. Bounded, so it can always close.
    win.on('close', (e) => {
        saveChatWindowBounds(win);
        if (returned || isQuitting)
            return;
        e.preventDefault();
        win.webContents.send('ai:chat-window-request-close');
        setTimeout(() => finish(null), 2500);
    });
    // The chat window follows the main window: if that one goes away, so does this one.
    const owner = mainWindow;
    const onOwnerClosed = () => {
        if (win.isDestroyed())
            return;
        returned = true;
        win.destroy();
    };
    owner?.once('closed', onOwnerClosed);
    win.on('closed', () => {
        if (chatWindow === win)
            chatWindow = null;
        owner?.removeListener('closed', onOwnerClosed);
        finish(null); // no-op when the conversation already came back
    });
    // A crashed/hung renderer reloads and takes the conversation again (the last one handed over).
    win.webContents.on('render-process-gone', (_event, details) => {
        if (details.reason === 'clean-exit' || win.isDestroyed())
            return;
        console.error('[ChatWindow] Renderer gone:', details.reason, details.exitCode);
        loadChatWindow(win);
    });
    win.on('unresponsive', () => {
        console.warn('[ChatWindow] Unresponsive — reloading');
        win.webContents.reload();
    });
    return win;
}
const isChatWindowSender = (sender) => !!chatWindow && !chatWindow.isDestroyed() && chatWindow.webContents === sender;
const isMainWindowSender = (sender) => !!mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents === sender;
electron_1.ipcMain.handle('ai:chat-window-open', (event, handoff) => {
    if (!isMainWindowSender(event.sender))
        return { ok: false };
    if (chatWindow && !chatWindow.isDestroyed()) {
        focusChatWindow();
        return { ok: true };
    }
    chatHandoff = handoff && typeof handoff === 'object' ? handoff : null;
    createChatWindow();
    return { ok: true };
});
electron_1.ipcMain.handle('ai:chat-window-is-open', () => !!chatWindow && !chatWindow.isDestroyed());
electron_1.ipcMain.handle('ai:chat-window-get-state', (event) => {
    if (!isChatWindowSender(event.sender))
        return { handoff: null, editorTarget: null };
    return { handoff: chatHandoff, editorTarget: chatEditorTarget };
});
electron_1.ipcMain.on('ai:chat-window-focus', () => focusChatWindow());
// "Bring back here" from the main window: same path as closing the chat window.
electron_1.ipcMain.on('ai:chat-window-recall', () => {
    if (chatWindow && !chatWindow.isDestroyed())
        chatWindow.close();
});
electron_1.ipcMain.on('ai:chat-window-return', (event, handoff) => {
    if (!isChatWindowSender(event.sender))
        return;
    returnChatWindow?.(handoff && typeof handoff === 'object' ? handoff : null);
});
electron_1.ipcMain.on('ai:chat-window-editor-target', (event, target) => {
    if (!isMainWindowSender(event.sender))
        return;
    chatEditorTarget = target && typeof target === 'object' ? target : null;
    if (chatWindow && !chatWindow.isDestroyed())
        chatWindow.webContents.send('ai:chat-window-editor-target', chatEditorTarget);
});
// "Ask AI" from the main window's command palette while the chat is detached: the chat window
// starts a new chat with the prompt.
electron_1.ipcMain.on('ai:chat-window-ask', (event, prompt) => {
    if (!isMainWindowSender(event.sender) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20000)
        return;
    if (!chatWindow || chatWindow.isDestroyed())
        return;
    focusChatWindow();
    chatWindow.webContents.send('ai:chat-window-ask', prompt);
});
electron_1.ipcMain.on('ai:chat-window-command', (event, cmd) => {
    if (!isChatWindowSender(event.sender) || !cmd || typeof cmd !== 'object')
        return;
    const c = cmd;
    let safe = null;
    if (c.type === 'open-note' && isWindowTargetId(c.noteId)) {
        safe = { type: 'open-note', noteId: c.noteId, ...(isWindowTargetId(c.sectionId) ? { sectionId: c.sectionId } : {}) };
    }
    else if (c.type === 'open-ai-settings') {
        safe = { type: 'open-ai-settings' };
    }
    if (!safe || !mainWindow || mainWindow.isDestroyed())
        return;
    showWindow();
    mainWindow.webContents.send('ai:chat-window-command', safe);
});
function createTray() {
    const dir = (electron_1.app.isPackaged || process.env.NOTEFLOW_NATIVE) ? '../dist' : '../public';
    const iconPath = process.platform === 'win32'
        ? path_1.default.join(__dirname, `${dir}/icon.ico`)
        : path_1.default.join(__dirname, `${dir}/tray-icon.png`);
    let icon = electron_1.nativeImage.createFromPath(iconPath);
    // Resize to 16×16 so Windows renders it correctly in the system tray
    if (!icon.isEmpty()) {
        icon = icon.resize({ width: 16, height: 16 });
    }
    else {
        icon = electron_1.nativeImage.createEmpty();
    }
    tray = new electron_1.Tray(icon);
    applyTrayMenu();
    tray.on('click', () => toggleWindow());
}
/** Resolves the active UI language from the persisted setting (lazy OS locale). */
function currentTrayLang() {
    const setting = readSettings().language;
    return (0, i18n_1.resolveLang)(setting, () => electron_1.app.getLocale());
}
/**
 * Full main-process message tree in the active language, resolved at call-time so
 * notifications and native dialogs follow the current `language` setting live.
 */
function mainMessages() {
    return (0, i18n_1.getMessages)(currentTrayLang());
}
/**
 * (Re)builds the tray context menu + tooltip in the current language. Called on
 * tray creation and whenever the language changes, so the menu switches live.
 */
function applyTrayMenu() {
    if (!tray)
        return;
    const t = (0, i18n_1.getTrayMessages)(currentTrayLang());
    tray.setToolTip(shortcutUnavailable ? t.tooltipShortcutUnavailable : t.tooltip);
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: t.open,
            click: () => toggleWindow(),
        },
        {
            label: t.newNote,
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => {
                showWindow();
                mainWindow?.webContents.send('new-note');
            },
        },
        { type: 'separator' },
        {
            label: t.openNotesFolder,
            click: () => electron_1.shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err)),
        },
        { type: 'separator' },
        {
            label: t.quit,
            click: () => {
                mainWindow?.webContents.session.flushStorageData();
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
}
/**
 * Brings the main window up and gives it focus.
 *
 * On Windows show()+focus() is not enough when the call comes from the
 * 'second-instance' event: clicking the pinned taskbar icon spawns a second
 * process, that process loses the single-instance lock and quits, but while it
 * lives IT is the foreground process — so Windows blocks SetForegroundWindow
 * for us and the window comes up BEHIND the others (the reported "first click
 * does nothing, you have to click twice" bug). The always-on-top bounce is the
 * usual workaround: flip it on, restore the previous value and move to top,
 * which pulls the window to the front without leaving it pinned.
 */
function showWindow() {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    if (mainWindow.isMinimized())
        mainWindow.restore();
    mainWindow.show();
    if (process.platform === 'win32') {
        const wasAlwaysOnTop = mainWindow.isAlwaysOnTop();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.setAlwaysOnTop(wasAlwaysOnTop);
        mainWindow.moveTop();
    }
    mainWindow.focus();
}
/**
 * A relaunch request (pinned taskbar/dock icon → 'second-instance', macOS dock
 * 'activate'): shows the main window. Before the startup path has created it
 * (whenReady still awaiting the migration, the welcome note or, at login, up to
 * 10 s of initial pull) the request is remembered and honoured once the window
 * is ready, instead of being dropped. A destroyed main window is not expected
 * (its close only hides it until quitting) but is recreated rather than leaving
 * the click without effect. While quitting there is nothing to show: the launch
 * is relaunched after this process exits instead (relaunchAfterQuit).
 */
function revealMainWindow(argv = [], workingDirectory = process.cwd()) {
    if (isQuitting) {
        relaunchAfterQuit(argv, workingDirectory);
        return;
    }
    if (!mainWindow) {
        showMainWindowWhenCreated = true;
        return;
    }
    if (mainWindow.isDestroyed()) {
        mainWindow = createWindow(true);
        mainWindow.once('ready-to-show', () => showWindow());
        return;
    }
    showWindow();
}
/**
 * A launch (the pinned taskbar/dock icon clicked right after "Quit") that reached
 * this process while it was quitting: start NoteFlow again once we've exited, so
 * the click isn't lost ("the first click doesn't open it").
 *
 * Why it reaches us at all: Electron keeps the single-instance lock until 'quit',
 * after every window has closed (renderers unloading, pending edits flushing), so
 * a launch in between loses the lock, notifies us via 'second-instance' and
 * exits. The lock is deliberately NOT released earlier (before-quit): the new
 * instance would start while this one still flushes edits, rewrites the sync
 * state (cloud-sync-state.json, GitHub's) and activity-log.json, and holds the
 * LevelDB lock of localStorage in userData — Chromium could leave the new
 * renderer with an in-memory localStorage (theme and settings lost for that
 * session). A relaunch after exit has no overlap at all.
 *
 * Once per quit, however many launches arrive. app.relaunch() spawns its
 * relauncher right away, which waits for this process to exit, so it works at any
 * point of the quit; after 'quit' the lock is free and no 'second-instance'
 * arrives any more (the new launch just starts). AppImage: app.relaunch's helper
 * lives in the old FUSE mount, unmounted on exit, so use the detached shell
 * helper that waits for our pid (relaunchAppImageAfterExit, no args → no startup
 * flag). Skipped when the updater is quitting to install: it relaunches itself,
 * and the Windows installer must not have the old exe started under it.
 */
function relaunchAfterQuit(argv, workingDirectory = process.cwd()) {
    if (relaunchAfterQuitScheduled || quittingForUpdate)
        return;
    relaunchAfterQuitScheduled = true;
    const appImagePath = process.env.APPIMAGE;
    const ownAppImage = process.platform === 'linux' && (0, updateAsset_1.isRunningFromOwnAppImage)({
        appImage: appImagePath,
        appDir: process.env.APPDIR,
        execPath: process.execPath,
    });
    if (appImagePath && ownAppImage) {
        relaunchAppImageAfterExit(appImagePath);
        return;
    }
    // A file it asked to open ("Open with NoteFlow", `NoteFlow notes.md`) travels in the args;
    // a relative one is made absolute: the relaunched process starts in OUR directory.
    electron_1.app.relaunch({ args: (0, openWithArgs_1.absolutizeFileArgs)((0, relaunchArgs_1.secondInstanceRelaunchArgs)(argv), workingDirectory, isExistingFile) });
}
// ── "Open with NoteFlow" (files from the OS: argv, second-instance, open-file) ─────
// A file the OS (or a terminal) opens with NoteFlow is linked as a TRANSIENT linked note
// (closed → unlinked; never the file) and opened in the main window's active pane. Main grants
// the path itself (linkedNotes.grantLinkPaths: the user chose it in the OS) and links it here —
// the renderer never asks to link a path of its own. The window takes the resulting note ids
// with `linked:take-open-requests` (on load, and when nudged by `linked:open-requested`), so
// nothing is lost if they arrive before it's ready. See patterns.md § "Notas vinculadas" →
// "Abrir desde el sistema / notas temporales".
function isExistingFile(p) {
    try {
        return fs_1.default.statSync(p).isFile();
    }
    catch {
        return false;
    }
}
function openTargetOptions(cwd) {
    return { cwd, exclude: [process.execPath, electron_1.app.getAppPath()], isFile: isExistingFile };
}
/** The files a launch's argv asks to open (dev / e2e: `electron <app> …`, the app path skipped). */
function launchFiles(argv, cwd) {
    return (0, openWithArgs_1.launchFilePaths)(argv, { ...openTargetOptions(cwd), defaultApp: !!process.defaultApp });
}
// linkedNotes.init has loaded the registry: files can be linked.
let linkedNotesReady = false;
const pendingOpenFiles = [];
let openRequests = { ids: [], errors: [] };
let openFilesQueue = Promise.resolve();
function queueOpenFiles(paths) {
    if (paths.length === 0)
        return;
    pendingOpenFiles.push(...paths);
    if (linkedNotesReady)
        processOpenFiles();
}
/** Links the pending files (transient, one at a time) and tells the main window to open them. */
function processOpenFiles() {
    openFilesQueue = openFilesQueue.then(async () => {
        // Each file once: a second copy would find its single-use grant consumed (`notGranted`).
        const paths = (0, openWithArgs_1.uniqueOpenPaths)(pendingOpenFiles.splice(0));
        if (paths.length === 0)
            return;
        linkedNotes.grantLinkPaths(paths);
        const res = await linkedNotes.link(paths, undefined, { transient: true });
        // In the order they were opened (an already linked file opens its note, kept or not).
        const idByKey = new Map([...res.linked, ...res.existing].map((w) => [(0, linkedNotesLogic_1.linkedPathKey)(w.path), w.id]));
        for (const p of paths) {
            const id = idByKey.get((0, linkedNotesLogic_1.linkedPathKey)(p));
            if (id && !openRequests.ids.includes(id))
                openRequests.ids.push(id);
        }
        openRequests.errors.push(...res.errors);
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('linked:open-requested');
    }).catch((err) => console.error('[linked] open with NoteFlow failed:', String(err)));
}
/**
 * A sticky / section window that showed `noteId` closed (or moved to another note): if it's a
 * transient linked note, the main window decides whether it's closed everywhere now.
 */
function releaseTransientNote(noteId) {
    if (!linkedNotes.isTransient(noteId) || !mainWindow || mainWindow.isDestroyed())
        return;
    mainWindow.webContents.send('linked:transient-released', noteId);
}
/** Whether a sticky or section window shows the note (main's own bookkeeping). */
function isNoteOpenInOtherWindow(noteId) {
    for (const [winId, id] of stickyNoteIds) {
        if (id !== noteId)
            continue;
        const win = electron_1.BrowserWindow.fromId(winId);
        if (win && !win.isDestroyed())
            return true;
    }
    for (const [win, target] of sectionWindows) {
        if (target.noteId === noteId && !win.isDestroyed())
            return true;
    }
    return false;
}
function toggleWindow() {
    if (!mainWindow)
        return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
    }
    else {
        showWindow();
    }
}
/**
 * Watches the notes dir for external changes (CLI, sync from another device).
 * Events are normalized to '<dir>' or '<dir>/<file>' (forward slashes) and
 * debounced per note dir; the broadcast always carries the note DIRECTORY path
 * so the renderer re-reads the whole note. Root-level files (metadata json,
 * README, format marker, leftover flat .md) are ignored — except the groups
 * metadata (groups.json / folders.json / note-order.json, e.g. written by the
 * CLI), which broadcasts a light `groups-updated` so the renderer reloads only
 * its groups store (otherwise its next group action would undo the CLI edit).
 *
 * Windows/macOS use native recursive watching. Node has no recursive fs.watch
 * on Linux, so there we watch the root (dir add/remove) plus one watcher per
 * note dir (file changes), refreshing the watcher set on root events.
 */
function startNotesWatcher() {
    const pendingWatchDebounce = new Map();
    const broadcastAll = () => electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
    const broadcastDir = (dir) => {
        const dirPath = path_1.default.join(NOTES_DIR, dir);
        electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', dirPath, null));
    };
    const handleEvent = (rel) => {
        if (rel === null) {
            // Filename unavailable (inotify edge case) — full reload covers all cases
            const existing = pendingWatchDebounce.get('__all__');
            if (existing)
                clearTimeout(existing);
            pendingWatchDebounce.set('__all__', setTimeout(() => {
                pendingWatchDebounce.delete('__all__');
                broadcastAll();
            }, 150));
            return;
        }
        // Groups metadata written outside the app (CLI). Our own writes are marked
        // internal (applyGroupsSet / applyFoldersSet / note-order:set). One debounce
        // key for the three files: a CLI command can touch several at once.
        if ((0, notesWatchFilter_1.isGroupsMetadataFile)(rel)) {
            if (recentInternalWrites.has(rel))
                return;
            const existing = pendingWatchDebounce.get('__groups__');
            if (existing)
                clearTimeout(existing);
            pendingWatchDebounce.set('__groups__', setTimeout(() => {
                pendingWatchDebounce.delete('__groups__');
                electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('groups-updated'));
            }, 150));
            return;
        }
        const parts = rel.split('/');
        const dir = parts[0];
        // agent.md (the reserved agent-task file of a note folder, agentTasks.ts)
        // is not part of the note the editor holds: a change of it never reloads
        // the note — it has its own event. Only its own internal-write mark counts
        // (a note save marks the whole dir, and an agent's report landing in that
        // window must still be seen).
        if (agentTasks.isAgentFilePath(rel)) {
            if (recentInternalWrites.has(rel))
                return;
            const key = `__agent__/${dir}`;
            const existing = pendingWatchDebounce.get(key);
            if (existing)
                clearTimeout(existing);
            pendingWatchDebounce.set(key, setTimeout(() => {
                pendingWatchDebounce.delete(key);
                broadcastAgentTasksChanged(dir);
            }, 150));
            return;
        }
        // Root-level files (json/README/marker/flat .md) — note dirs never contain a dot
        if (parts.length === 1 && dir.includes('.'))
            return;
        if (parts.length === 2 && !parts[1].endsWith('.md'))
            return;
        if (parts.length > 2)
            return;
        if (recentInternalWrites.has(rel) || recentInternalWrites.has(dir))
            return;
        // Debounce per note dir: a single save touches note.md + section files,
        // and fs.watch can fire multiple times per write (Windows). 150 ms lets
        // the multi-file write settle into ONE broadcast.
        const existing = pendingWatchDebounce.get(dir);
        if (existing)
            clearTimeout(existing);
        pendingWatchDebounce.set(dir, setTimeout(() => {
            pendingWatchDebounce.delete(dir);
            let isNoteDir = false;
            try {
                isNoteDir = fs_1.default.existsSync(path_1.default.join(NOTES_DIR, dir, noteFormat.NOTE_MD));
            }
            catch { /* treat as gone */ }
            if (isNoteDir)
                broadcastDir(dir);
            else
                broadcastAll(); // dir deleted/renamed (or not a note dir) — full reload covers it
        }, 150));
    };
    if (process.platform === 'linux') {
        const dirWatchers = new Map();
        const watchDir = (dir) => {
            if (dirWatchers.has(dir))
                return;
            try {
                const w = fs_1.default.watch(path_1.default.join(NOTES_DIR, dir), { persistent: false }, (_t, filename) => {
                    handleEvent(filename ? `${dir}/${filename}` : dir);
                });
                w.on('error', () => {
                    dirWatchers.delete(dir);
                    try {
                        w.close();
                    }
                    catch { /* ignore */ }
                });
                dirWatchers.set(dir, w);
            }
            catch { /* dir vanished between scan and watch */ }
        };
        const refreshDirWatchers = () => {
            const current = new Set(noteFormat.listNoteDirs(NOTES_DIR));
            for (const dir of current)
                watchDir(dir);
            for (const [dir, w] of dirWatchers) {
                if (!current.has(dir)) {
                    try {
                        w.close();
                    }
                    catch { /* ignore */ }
                    dirWatchers.delete(dir);
                }
            }
        };
        refreshDirWatchers();
        fs_1.default.watch(NOTES_DIR, { persistent: false }, (_t, filename) => {
            // A root event usually means a note dir appeared/disappeared
            setTimeout(refreshDirWatchers, 200);
            handleEvent(filename ? filename.replace(/\\/g, '/') : null);
        });
    }
    else {
        fs_1.default.watch(NOTES_DIR, { recursive: true, persistent: false }, (_t, filename) => {
            handleEvent(filename ? filename.replace(/\\/g, '/') : null);
        });
    }
}
function registerGlobalShortcut() {
    // Ctrl+Shift+Space — toggle window from anywhere
    const ret = electron_1.globalShortcut.register('CommandOrControl+Shift+Space', () => {
        toggleWindow();
    });
    if (!ret) {
        console.error('Failed to register global shortcut Ctrl+Shift+Space');
        // Update tray tooltip so the user knows the shortcut is unavailable
        // (common on Linux when an input method or another app captures it).
        // Recorded in module state so a later language change keeps this variant.
        shortcutUnavailable = true;
        tray?.setToolTip((0, i18n_1.getTrayMessages)(currentTrayLang()).tooltipShortcutUnavailable);
    }
}
// ── IPC Handlers ─────────────────────────────────────────────────────────────
electron_1.ipcMain.handle('fs:read-note-dir', (_event, dir) => {
    try {
        refuseLinkedTarget(dir);
        const safeDir = ensureSafeDirname(dir);
        return noteFormat.readNoteDirRecord(NOTES_DIR, safeDir);
    }
    catch {
        return null;
    }
});
/**
 * Linked notes (external text files, linkedNotes.ts) never go through the note-FOLDER
 * primitives: a linked file's path reduced to its basename would otherwise name an entry of
 * the notes dir (`notes.md`, `config.json`). What identifies one is the registry (the full
 * path of a linked file) and the linked id prefix. On top of that, any basename ending in
 * `.md` is refused (note folders never do). No other extension is: a folder migrated from a
 * v1 flat note keeps its old file stem, which may hold a dot (`notes.2023`), and a linked
 * file can never sit inside the notes dir (`insideNotesDir`), so a bare basename can't
 * reach it anyway.
 */
function refuseLinkedTarget(dirOrPath) {
    if (typeof dirOrPath !== 'string')
        return;
    const base = path_1.default.basename(dirOrPath.replace(/[\\/]+$/, ''));
    if (base.startsWith(linkedNotesLogic_1.LINKED_ID_PREFIX) || (0, linkedNotesLogic_1.isMarkdownPath)(base) || linkedNotes.isLinkedPath(dirOrPath)) {
        throw new Error('Refusing to treat a linked file as a note folder');
    }
}
// Core note write — shared by the IPC handler and the agentic chat tools.
// `senderId` (the originating window) is excluded from the broadcast filter; pass undefined
// (e.g. for tool-driven writes) so every window — including the chat's — refreshes.
// `durablePush` lands the files on the remote NOW (awaited) instead of via the per-file
// debounced path — see the comment at the push step for why the chat tools need it.
function applyNoteWrite(payload, senderId, opts) {
    refuseLinkedTarget(payload.dir);
    const dir = ensureSafeDirname(payload.dir);
    const dirPath = path_1.default.join(NOTES_DIR, dir);
    // A late save (a debounced editor, a sticky closing) of a note just moved to
    // the local archive must not recreate it — see archiveLocalNotesForOriginSwitch.
    // Once the folder exists again (a pull brought that note back), writes go through.
    if (archivedNoteDirs.has(dir) && !fs_1.default.existsSync(dirPath)) {
        throw new Error('This note was moved to the local copies folder');
    }
    // Validate everything before touching disk
    const writes = Object.entries(payload.files ?? {}).map(([f, content]) => {
        if (typeof content !== 'string')
            throw new Error('Invalid note file content');
        return [ensureSafeNoteFile(f), content];
    });
    const deletes = (payload.deleteFiles ?? []).map((f) => ensureSafeNoteFile(f));
    if (writes.length === 0)
        throw new Error('Empty note write');
    fs_1.default.mkdirSync(dirPath, { recursive: true });
    notesDirEmptiedByArchive = false; // the dir holds a note again
    markInternalWrite(dir);
    for (const [f] of writes)
        markInternalWrite(`${dir}/${f}`);
    for (const f of deletes)
        markInternalWrite(`${dir}/${f}`);
    // note.md first so a crash mid-write always leaves a consistent anchor
    writes.sort(([a], [b]) => (a === noteFormat.NOTE_MD ? -1 : b === noteFormat.NOTE_MD ? 1 : 0));
    for (const [f, content] of writes) {
        fs_1.default.writeFileSync(path_1.default.join(dirPath, f), content, 'utf-8');
    }
    for (const f of deletes) {
        try {
            fs_1.default.unlinkSync(path_1.default.join(dirPath, f));
        }
        catch { /* already gone */ }
    }
    // A note that is (now) encrypted keeps no agent.md: its reports are plain text.
    const anchorWrite = writes.find(([f]) => f === noteFormat.NOTE_MD);
    if (anchorWrite && agentTasksFile.noteMdLooksEncrypted(anchorWrite[1])) {
        try {
            purgeAgentFileIfEncrypted(dir, anchorWrite[1]);
        }
        catch { /* best effort: never fails the save */ }
    }
    // Single broadcast per note write — the renderer re-reads the whole dir
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('notes-updated', dirPath, senderId);
    });
    const sync = (0, syncProvider_1.getActiveSyncProvider)();
    const connected = sync.isConnected();
    for (const f of deletes)
        scheduleRemoteDelete('file', `${dir}/${f}`);
    // Keep the semantic index up to date (debounced; no-op when AI is disabled).
    if (aiIndex.isEnabled())
        aiIndex.scheduleIndex(dirPath);
    // Durable push (agentic chat tools): land the written files on the remote NOW
    // instead of via the per-file debounced path. The debounced path bumps
    // `lastSync` on each completion, so a freshly AI-created note that hasn't been
    // pushed yet would be seen as `updated <= lastSync` by a racing auto-sync pull
    // and DELETED from disk — the same failure the bulk-import path guards against
    // with pushPathsNow. (While the push gate is closed nothing is sent —
    // GitHub: flushPendingLocalChanges re-pushes after the first successful pull;
    // Cloud also journals the paths so its first pull sees them as pending.)
    if (opts?.durablePush) {
        if (!connected)
            return Promise.resolve();
        const relPaths = writes.map(([f]) => `${dir}/${f}`);
        relPaths.forEach((p) => pendingPushFiles.add(p));
        notifyPushState();
        return sync
            .pushPathsNow(NOTES_DIR, relPaths)
            .then(() => undefined)
            .catch((err) => { console.error('[chat] durable push failed:', String(err)); })
            .finally(() => {
            relPaths.forEach((p) => pendingPushFiles.delete(p));
            notifyPushState();
        });
    }
    for (const [f, content] of writes) {
        const relPath = `${dir}/${f}`;
        if (connected) {
            sync.schedulePush(relPath, content, () => { pendingPushFiles.add(relPath); notifyPushState(); }, () => { pendingPushFiles.delete(relPath); notifyPushState(); });
        }
        else {
            sync.schedulePush(relPath, content);
        }
    }
}
// Core note deletion — shared by the IPC handler and the agentic chat tools.
function applyNoteDelete(dirOrPath) {
    refuseLinkedTarget(dirOrPath);
    const dir = ensureSafeDirname(dirOrPath);
    const dirPath = path_1.default.join(NOTES_DIR, dir);
    markInternalWrite(dir);
    try {
        for (const f of fs_1.default.readdirSync(dirPath))
            markInternalWrite(`${dir}/${f}`);
    }
    catch { /* ignore */ }
    fs_1.default.rmSync(dirPath, { recursive: true, force: true });
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('notes-updated');
    });
    scheduleRemoteDelete('dir', dir);
    aiIndex.removeFromIndex(dirPath);
}
// ── Archive of the local notes on an origin switch (notesArchive.ts) ─────────
// "Use only the remote's notes": the notes that would sync are MOVED to
// userData/notes-archive/<label>-<ISO>/ (never deleted) before the first pull
// from the new remote. Backend-agnostic: GitHub calls it today, NoteFlow Cloud
// will with its own label.
/** Root of the local archives (outside the notes dir — never synced). */
function notesArchiveRoot() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'notes-archive');
}
// Note folders moved to the archive this session: a write to one of them that
// would recreate it is refused (applyNoteWrite).
const archivedNoteDirs = new Set();
// The archive left the notes dir without a single note: an empty listing is the
// truth, not the transient empty readdir fs:read-all-notes retries for (~4 s).
// Cleared as soon as a note is written — by a save (applyNoteWrite) or by a pull
// of either backend (broadcastPulledNotes) — or a listing finds notes again.
let notesDirEmptiedByArchive = false;
/**
 * Note folders that just left the notes dir for the local archive: late writes
 * to them are refused, the AI index forgets them and every window is told which
 * notes are gone (`notes-archived`) so it drops them from memory. The path-less
 * `notes-updated` that follows can't do that part: the renderer ignores an
 * EMPTY reload while it holds notes (a transient empty readdir on Windows) —
 * and an emptied dir is what "use only the remote's notes" leaves until the
 * pull brings something. Nothing is deleted here, on disk or remotely.
 */
function forgetArchivedNoteDirs(dirs, noteIds) {
    for (const dir of dirs) {
        archivedNoteDirs.add(dir);
        aiIndex.removeFromIndex(path_1.default.join(NOTES_DIR, dir));
    }
    const ids = [...new Set(noteIds)];
    if (dirs.length === 0 && ids.length === 0)
        return;
    if (noteFormat.listNoteDirs(NOTES_DIR).length === 0)
        notesDirEmptiedByArchive = true;
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-archived', { noteIds: ids, dirs }));
}
/** Closes the sticky and section windows showing any of `noteIds`; resolves once closed (bounded). */
function closeWindowsShowingNotes(noteIds, timeoutMs = 2000) {
    const targets = [];
    for (const [winId, noteId] of stickyNoteIds) {
        const win = electron_1.BrowserWindow.fromId(winId);
        if (win && !win.isDestroyed() && noteIds.has(noteId))
            targets.push(win);
    }
    for (const [win, target] of sectionWindows) {
        if (!win.isDestroyed() && noteIds.has(target.noteId))
            targets.push(win);
    }
    if (targets.length === 0)
        return Promise.resolve();
    return new Promise((resolve) => {
        let left = targets.length;
        const timer = setTimeout(resolve, timeoutMs);
        const done = () => { if (--left === 0) {
            clearTimeout(timer);
            resolve();
        } };
        for (const win of targets) {
            win.once('closed', done);
            // close (not destroy): their beforeunload flushes the pending edits first.
            win.close();
        }
    });
}
/** The switch that asked for the archive was no longer pending when it was about to run. */
class OriginSwitchAbortedError extends Error {
    constructor() {
        super('the origin choice changed before the notes were archived');
        this.name = 'OriginSwitchAbortedError';
    }
}
/**
 * Moves the notes that would sync (and their metadata) to a new local archive
 * — see notesArchive.ts — and brings the app's state in line: the editors'
 * pending saves land first (they are archived with the note), windows showing
 * those notes are closed, the watcher ignores the moves, the AI index forgets
 * them, every window drops them from memory (forgetArchivedNoteDirs) and
 * reloads. Throws NotesArchiveError when nothing could be moved (everything
 * undone): the caller must not pull then. `stillValid` is checked right before
 * the (synchronous) archive, after the waits for windows and pending saves: if
 * the switch is no longer what the user chose, nothing is moved
 * (OriginSwitchAbortedError).
 */
async function archiveLocalNotesForOriginSwitch(label, origin, opts = {}) {
    const before = (0, localOnlyNotes_1.listSyncedNoteDirs)(NOTES_DIR);
    const idByDir = new Map();
    for (const dir of before) {
        const note = noteFormat.parseNoteDir(path_1.default.join(NOTES_DIR, dir));
        if (note)
            idByDir.set(dir, note.id);
    }
    await closeWindowsShowingNotes(new Set(idByDir.values()));
    await flushMainWindowEdits();
    if (opts.stillValid && !opts.stillValid())
        throw new OriginSwitchAbortedError();
    // The watcher must not echo the moves back as external edits.
    const candidates = (0, localOnlyNotes_1.listSyncedNoteDirs)(NOTES_DIR);
    for (const dir of candidates) {
        markInternalWrite(dir);
        try {
            for (const f of fs_1.default.readdirSync(path_1.default.join(NOTES_DIR, dir)))
                markInternalWrite(`${dir}/${f}`);
        }
        catch { /* ignore */ }
    }
    for (const f of notesArchive.ARCHIVED_METADATA_FILES)
        markInternalWrite(f);
    // Linked notes (outside the notes dir) keep their group/folder and the colour
    // of their single section: those entries stay in the filtered groups.json /
    // folders.json / section-colors.json.
    const linked = linkedNotes.list();
    const knownIds = (dirs) => dirs.map((dir) => idByDir.get(dir)).filter((id) => !!id);
    let result;
    try {
        result = notesArchive.archiveSyncedNotes({
            notesDir: NOTES_DIR,
            archiveRoot: notesArchiveRoot(),
            label,
            origin,
            keep: {
                groupIds: linked.map((n) => n.group).filter((g) => typeof g === 'string'),
                folderIds: linked.map((n) => n.folder).filter((f) => typeof f === 'string'),
                sectionNames: linked.map((n) => n.sectionName).filter((name) => typeof name === 'string'),
            },
        });
    }
    catch (err) {
        // The undo failed half way: the folders that stayed in the archive are gone
        // from the notes dir all the same (the caller reloads the windows).
        if (err instanceof notesArchive.NotesArchiveError && !err.rolledBack) {
            const stranded = candidates.filter((dir) => !fs_1.default.existsSync(path_1.default.join(NOTES_DIR, dir, noteFormat.NOTE_MD)));
            forgetArchivedNoteDirs(stranded, knownIds(stranded));
        }
        throw err;
    }
    forgetArchivedNoteDirs(result.movedDirs, [...result.movedNoteIds, ...knownIds(result.movedDirs)]);
    if (result.movedFiles.length > 0)
        aiIndex.markStaleUnknown();
    console.log(`[Sync] archived ${result.movedDirs.length} note(s) and ${result.movedFiles.length} metadata file(s) to ${result.archiveDir}`);
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
    return result;
}
// ── Agent tasks (agent.md — agentTasks.ts) ───────────────────────────────────
// A note folder's reserved agent.md holds one block per task handed to an
// external AI agent (written by the CLI's `noteflow task …`). It is NOT a
// section: never listed in note.md, never part of what the editor loads or
// saves. The renderer reads it through these handlers and hears about changes
// through 'agent-tasks:changed'. Main never touches note.md or a section here:
// the 🤖 marker on the task's line belongs to the renderer (it owns the note's
// content) — see discardableAgentIds for how the two are coordinated.
function agentFileOf(dir) {
    return path_1.default.join(NOTES_DIR, dir, agentTasks.AGENT_MD);
}
function agentTaskSettings() {
    return agentTasks.sanitizeAgentTaskSettings(readSettings().agentTasks);
}
function broadcastAgentTasksChanged(dir) {
    const dirPath = path_1.default.join(NOTES_DIR, dir);
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('agent-tasks:changed', dirPath));
}
// The lock between processes (agentLock.ts): the CLI of an agent — its
// `noteflow task` commands, the heartbeat of `noteflow run` — writes the same
// agent.md, so every write of the app takes the CLI's lock of that note folder
// around its read → modify → write. It lives in the CLI's settings dir, which
// is not this app's userData everywhere (and never under `npm run dev`).
const agentLockEnv = {
    io: {
        mkdirp: (dir) => { fs_1.default.mkdirSync(dir, { recursive: true }); },
        createExclusive: (file, text) => fs_1.default.writeFileSync(file, text, { encoding: 'utf-8', flag: 'wx' }),
        readText: (file) => fs_1.default.readFileSync(file, 'utf-8'),
        mtimeMs: (file) => fs_1.default.statSync(file).mtimeMs,
        unlink: (file) => fs_1.default.unlinkSync(file),
    },
    lockDir: agentLock.agentLockDirFor(process.platform, process.env, os_1.default.homedir()),
    pid: process.pid,
    host: os_1.default.hostname(),
    now: () => Date.now(),
    newToken: () => (0, crypto_1.randomBytes)(8).toString('hex'),
    pidAlive(pid) {
        try {
            process.kill(pid, 0);
            return true;
        }
        catch (err) {
            return err.code === 'EPERM';
        }
    },
};
const agentAtomicIo = {
    writeText: (file, text) => fs_1.default.writeFileSync(file, text, 'utf-8'),
    rename: (from, to) => fs_1.default.renameSync(from, to),
    unlink: (file) => fs_1.default.unlinkSync(file),
    // A few milliseconds, a handful of times at most (agentLock.ATOMIC_RENAME_*).
    pause: (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); },
};
/** The lock of a note folder stayed busy (an agent's CLI is writing) or could not be created: nothing was written — try again. */
class AgentLockBusyError extends Error {
    constructor(dir, reason, detail) {
        super(`The agent tasks of "${dir}" are being written by another process (${reason}${detail ? `: ${detail}` : ''}) — nothing was changed`);
    }
}
/**
 * Runs `work` (synchronous: read → change → write) holding the CLI's lock of
 * note folder `dir`. The wait for a busy lock is asynchronous and short
 * (agentLock.AGENT_LOCK_APP_WAIT_MS): main is never blocked on it.
 */
async function withAgentNoteLock(dir, work) {
    const res = await agentLock.withAgentLock(agentLockEnv, dir, work, {
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    if (res.ok)
        return res.value;
    throw new AgentLockBusyError(dir, res.reason, res.detail);
}
// The real disk, sync and windows behind agentTasksFile.ts (where the logic of
// these handlers lives, tested against an in-memory folder).
const agentFileDeps = {
    readAgentText(dir) {
        try {
            return fs_1.default.readFileSync(agentFileOf(dir), 'utf-8');
        }
        catch {
            return null;
        }
    },
    // Atomic (temp file + rename): the CLI of an agent reads this file at any moment.
    writeAgentText: (dir, content) => agentLock.writeFileAtomic(agentAtomicIo, agentFileOf(dir), content, process.pid, (0, crypto_1.randomBytes)(4).toString('hex')),
    removeAgentFile: (dir) => fs_1.default.unlinkSync(agentFileOf(dir)),
    markInternalWrite: (rel) => markInternalWrite(rel),
    pushFile(rel, content) {
        const sync = (0, syncProvider_1.getActiveSyncProvider)();
        if (sync.isConnected()) {
            sync.schedulePush(rel, content, () => { pendingPushFiles.add(rel); notifyPushState(); }, () => { pendingPushFiles.delete(rel); notifyPushState(); });
        }
        else {
            sync.schedulePush(rel, content);
        }
    },
    pushDelete: (rel) => scheduleRemoteDelete('file', rel),
    notifyChanged: (dir) => broadcastAgentTasksChanged(dir),
    readNoteMd(dir) {
        try {
            return fs_1.default.readFileSync(path_1.default.join(NOTES_DIR, dir, noteFormat.NOTE_MD), 'utf-8');
        }
        catch {
            return null;
        }
    },
    readNote(dir) {
        const note = noteFormat.parseNoteDir(path_1.default.join(NOTES_DIR, dir));
        return note ? { sections: note.sections, encrypted: !!note.encryption } : null;
    },
    listNoteDirs: () => noteFormat.listNoteDirs(NOTES_DIR),
};
/**
 * See agentTasksFile.purgeAgentFileIfEncrypted (an encrypted note keeps no
 * agent.md). Whether there is anything to purge is read without the lock; the
 * purge itself runs under it, a moment later (`retry`: once more after a busy
 * lock — and again on the next save or pull of the note).
 */
function purgeAgentFileIfEncrypted(dir, noteMd, retry = true) {
    if (agentFileDeps.readAgentText(dir) === null)
        return;
    if (!(noteMd !== undefined ? agentTasksFile.noteMdLooksEncrypted(noteMd) : agentTasksFile.isNoteDirEncrypted(agentFileDeps, dir)))
        return;
    void withAgentNoteLock(dir, () => agentTasksFile.purgeAgentFileIfEncrypted(agentFileDeps, dir, noteMd)).catch((err) => {
        if (err instanceof AgentLockBusyError && retry)
            setTimeout(() => purgeAgentFileIfEncrypted(dir, undefined, false), 5000);
        else
            console.warn('[agent-tasks] could not remove the agent.md of an encrypted note:', err);
    });
}
/** Validated note dir of an agent-tasks IPC call (throws on anything that is not a note folder name). */
function agentTasksDir(dirOrPath) {
    if (typeof dirOrPath !== 'string')
        throw new Error('Invalid note directory');
    refuseLinkedTarget(dirOrPath);
    const dir = ensureSafeDirname(dirOrPath);
    ensureSafeNoteFile(agentTasks.AGENT_MD);
    if (!fs_1.default.existsSync(path_1.default.join(NOTES_DIR, dir, noteFormat.NOTE_MD)))
        throw new Error('Not a note folder');
    return dir;
}
electron_1.ipcMain.handle('agent-tasks:read', (_event, dirOrPath) => {
    try {
        return agentTasksFile.readAgentTasks(agentFileDeps, agentTasksDir(dirOrPath), agentTaskSettings().discardAfterDays, Date.now());
    }
    catch {
        return { blocks: [], discardable: [] };
    }
});
// Removes ONE block (and the file with its last one). Never touches a section:
// the renderer removes the 🤖 marker from the task's line BEFORE calling this.
// Every write below runs under the note folder's lock (withAgentNoteLock);
// `busy: true` = the lock stayed taken, nothing was written, the caller may retry.
electron_1.ipcMain.handle('agent-tasks:dismiss', async (_event, dirOrPath, id) => {
    try {
        const dir = agentTasksDir(dirOrPath);
        return { ok: true, ...(await withAgentNoteLock(dir, () => agentTasksFile.dismissAgentTask(agentFileDeps, dir, id))) };
    }
    catch (err) {
        return { ok: false, removed: false, busy: err instanceof AgentLockBusyError, error: String(err) };
    }
});
// Orphan bookkeeping of a note's blocks (agentTasksFile.maintainAgentTasks):
// the sections are read from DISK; `liveIds` adds the ids the caller still
// holds in memory (an editor with unsaved changes) — they are never orphaned.
electron_1.ipcMain.handle('agent-tasks:maintain', async (_event, dirOrPath, liveIds) => {
    try {
        const dir = agentTasksDir(dirOrPath);
        return { ok: true, ...(await withAgentNoteLock(dir, () => agentTasksFile.maintainAgentTasks(agentFileDeps, dir, liveIds, Date.now()))) };
    }
    catch (err) {
        return { ok: false, changed: false, blocks: [], busy: err instanceof AgentLockBusyError, error: String(err) };
    }
});
// The app changed the state on a task's line and saved it: the block of that
// task takes the state its line has on disk (agentTasksFile.reconcileAgentBlock).
electron_1.ipcMain.handle('agent-tasks:reconcile', async (_event, dirOrPath, id) => {
    try {
        const dir = agentTasksDir(dirOrPath);
        return { ok: true, ...(await withAgentNoteLock(dir, () => agentTasksFile.reconcileAgentBlock(agentFileDeps, dir, id, Date.now()))) };
    }
    catch (err) {
        return { ok: false, changed: false, busy: err instanceof AgentLockBusyError, error: String(err) };
    }
});
// A fresh task id, unique across every readable note of the notes dir (the
// sections' markers and the blocks of every agent.md) plus `alsoTaken` (ids the
// renderer holds in unsaved content). Reads and parses EVERY note: the app's
// own "hand to an agent" does not use it (it makes the id in the renderer,
// against what the window holds in memory — src/components/Editor/useAgentTask.ts).
electron_1.ipcMain.handle('agent-tasks:new-id', (_event, alsoTaken) => agentTasks.newAgentTaskId(agentTasksFile.takenAgentIds(agentFileDeps, alsoTaken), () => (0, crypto_1.randomBytes)(1)[0]));
// The patch can only name the keys patchAgentTaskSettings knows: `folders` and
// `approved` (what "Run" may launch, and where) are NOT writable from here.
// settings.json `agentTasks` — local to this machine, never synced; the CLI
// reads `onFinish` and `staleMinutes` from the same object. A change is told to
// every window ('agent-tasks:settings-changed'): the switch of Settings → AI
// applies at once to the open editors, sticky notes included.
electron_1.ipcMain.handle('agent-tasks:get-settings', () => agentTaskSettings());
electron_1.ipcMain.handle('agent-tasks:set-settings', (_event, patch) => {
    const settings = readSettings();
    const plan = agentTasksFile.planAgentSettingsUpdate(settings.agentTasks, patch);
    if (plan.changed) {
        settings.agentTasks = plan.next;
        writeSettings(settings);
        electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('agent-tasks:settings-changed', plan.settings));
    }
    return plan.settings;
});
// ── Agent tasks: "Run" (agentRunIo.ts / agentRun.ts) ─────────────────────────
// Launches an agent on tasks of a note: the bundled CLI (`noteflow run`) in an
// external terminal window, or a desktop app through a link. What the page can
// make main do here (the whole reasoning is at the head of agentRun.ts):
//   - a request carries a note id, task ids and text — never a command, a path
//     or a link;
//   - the presets are fixed; a CUSTOM command / link is text of settings.json,
//     which the page can write ('agent-tasks:set-settings'), so it is launched
//     only after the user approved that exact text in a native dialog — the
//     approval lives in `agentTasks.approved`, which no IPC of the page writes
//     (nor `agentTasks.folders`: a folder is only set by the native dialog;
//     there is no generic "write settings.json" channel — each 'settings:*' /
//     '*:set-*' handler writes its own key);
//   - nothing launches with the feature off or for an encrypted note.
// Links go through this dedicated channel ('app:open-url' stays https-only).
const agentRunHost = {
    readSettings: () => readSettings(),
    writeSettings: (data) => writeSettings(data),
    notesDirOverride: process.env.NOTEFLOW_NOTES_DIR ? NOTES_DIR : null,
    noteEncrypted(noteId) {
        const dir = noteFormat.listNoteDirs(NOTES_DIR).find((d) => d === noteId || d.endsWith(`-${noteId}`));
        return dir !== undefined && agentTasksFile.isNoteDirEncrypted(agentFileDeps, dir);
    },
    texts: () => mainMessages().dialogs,
};
const agentRunParent = (event) => electron_1.BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
// Whether "Run" can open a terminal with the CLI in this build (not the Microsoft Store one).
electron_1.ipcMain.handle('agent-run:info', () => ({ terminal: agentRunIo.terminalAvailable() }));
// The project folder of a note (settings.json → agentTasks.folders, local to this machine).
electron_1.ipcMain.handle('agent-run:get-folder', (_event, noteId) => agentRunIo.getFolder(agentRunHost, noteId));
electron_1.ipcMain.handle('agent-run:pick-folder', (event, noteId) => agentRunIo.pickFolder(agentRunHost, noteId, agentRunParent(event)));
electron_1.ipcMain.handle('agent-run:clear-folder', (_event, noteId) => {
    agentRunIo.clearFolder(agentRunHost, noteId);
});
// Settings → AI: may this custom link template be opened? (The same check 'agent-run:open-app' makes.)
electron_1.ipcMain.handle('agent-run:check-url', (_event, template) => typeof template === 'string' && agentRun.agentUrlTemplateScheme(template) !== null);
// Before a task is queued or moved: can a run start for this note? Asks for the folder and for
// the approval of a custom command / link (native dialogs) and checks the agent is installed.
electron_1.ipcMain.handle('agent-run:preflight', (event, noteId) => agentRunIo.preflight(agentRunHost, noteId, agentRunParent(event)));
electron_1.ipcMain.handle('agent-run:terminal', (event, request) => agentRunIo.runInTerminal(agentRunHost, request, agentRunParent(event)));
electron_1.ipcMain.handle('agent-run:open-app', (event, request) => agentRunIo.openApp(agentRunHost, request, agentRunParent(event)));
electron_1.ipcMain.handle('fs:write-note', (event, payload) => {
    try {
        applyNoteWrite(payload, event.sender.id);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('fs:delete-note', (_event, dirOrPath) => {
    try {
        applyNoteDelete(dirOrPath);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('fs:read-all-notes', async () => {
    // Do NOT catch outer errors — let them propagate so the renderer can
    // distinguish a genuine empty directory from a transient FS failure.
    // On Windows, readdirSync can return [] without throwing when the filesystem
    // isn't ready yet (e.g. OS waking from sleep, app starting at boot).
    // Retry so we don't mistake a transient empty result for no notes.
    // Not after the local archive emptied the dir: then empty is the real answer.
    const attempts = notesDirEmptiedByArchive ? 1 : 6;
    let dirs = [];
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0)
            await new Promise((r) => setTimeout(r, 800));
        dirs = noteFormat.listNoteDirs(NOTES_DIR);
        if (dirs.length > 0)
            break;
    }
    if (dirs.length > 0)
        notesDirEmptiedByArchive = false;
    return dirs
        .map((dir) => noteFormat.readNoteDirRecord(NOTES_DIR, dir))
        .filter((rec) => rec !== null);
});
electron_1.ipcMain.handle('fs:notes-dir', () => NOTES_DIR);
// ── Linked notes (external text files edited in place — linkedNotes.ts) ─────────
// Writes only ever target files in the registry, resolved there by id (`linked:write`,
// `linked:save-asset` into a Markdown file's assets/). What can ENTER the registry (via
// `linked:link` / `linked:relocate`) is only a path the USER chose — granted in main, single
// use, for a few minutes (linkedNotes.grantLinkPaths): what the native picker returned
// (`linked:pick-files`), or what the preload saw in a real (isTrusted) drop from the OS
// (`linked:grant-drop`). Then it must be an existing TEXT file (no NUL byte, valid UTF-8)
// outside the notes dir. A compromised renderer can't link — and so rewrite — an arbitrary
// file (`.bashrc`, `.git/config`, `~/.ssh/authorized_keys`): it can't grant a path itself.
electron_1.ipcMain.handle('linked:list', () => linkedNotes.list());
electron_1.ipcMain.handle('linked:get', (_event, idOrPath) => linkedNotes.get(idOrPath));
electron_1.ipcMain.handle('linked:pick-files', async (event, opts) => {
    const o = opts && typeof opts === 'object' ? opts : {};
    const multi = !!o.multi;
    const parent = electron_1.BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    const dialogs = mainMessages().dialogs;
    // Any text file can be linked: "All files" first (the default), Markdown as a shortcut —
    // first when locating the file of a linked Markdown note (`markdown`).
    const markdownFilter = { name: dialogs.linkFilterMarkdown, extensions: ['md', 'markdown'] };
    const allFilter = { name: dialogs.linkFilterAllFiles, extensions: ['*'] };
    const dialogOpts = {
        title: multi ? dialogs.linkFiles : dialogs.relocateLinkedFile,
        filters: o.markdown === true ? [markdownFilter, allFilter] : [allFilter, markdownFilter],
        properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
    };
    const result = parent ? await electron_1.dialog.showOpenDialog(parent, dialogOpts) : await electron_1.dialog.showOpenDialog(dialogOpts);
    if (result.canceled)
        return [];
    // What the user picked may be linked (once, for a few minutes) — nothing else.
    linkedNotes.grantLinkPaths(result.filePaths);
    return result.filePaths;
});
// Files of a REAL drop from the OS (the preload only sends what an isTrusted drop event
// carried, with webUtils.getPathForFile — a synthetic File has no path). Not exposed to the
// page: the renderer only gets to link them afterwards, through `linked:link`.
electron_1.ipcMain.on('linked:grant-drop', (_event, paths) => {
    if (Array.isArray(paths))
        linkedNotes.grantLinkPaths(paths);
});
electron_1.ipcMain.handle('linked:link', (event, paths) => linkedNotes.link(paths, event.sender.id));
electron_1.ipcMain.handle('linked:relocate', (event, id, newPath) => linkedNotes.relocate(id, newPath, event.sender.id));
electron_1.ipcMain.handle('linked:unlink', (event, id) => ({ ok: linkedNotes.unlink(id, event.sender.id) }));
electron_1.ipcMain.handle('linked:update-meta', (event, id, patch) => linkedNotes.updateMeta(id, patch, event.sender.id));
// "Open with NoteFlow": the notes main linked from the OS for the main window to open (taken
// once), and the transient ones it closed — discarded only if main agrees (no unwritten draft,
// not shown in a sticky / section window). Neither takes a path: nothing can be linked here.
electron_1.ipcMain.handle('linked:take-open-requests', (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents)
        return { ids: [], errors: [] };
    const taken = openRequests;
    openRequests = { ids: [], errors: [] };
    return taken;
});
electron_1.ipcMain.handle('linked:keep', (event, id) => linkedNotes.keep(id, event.sender.id));
electron_1.ipcMain.handle('linked:discard-transient', async (event, id) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents)
        return { discarded: false };
    return { discarded: await linkedNotes.discardTransient(id, isNoteOpenInOtherWindow, event.sender.id) };
});
// (The renderer logs the edit in the activity log itself, like any note edit.)
electron_1.ipcMain.handle('linked:write', (event, id, body, baseHash) => linkedNotes.writeBody(id, body, baseHash, event.sender.id));
electron_1.ipcMain.handle('linked:save-asset', (_event, id, name, mime, data) => linkedNotes.saveAsset(id, name, mime, data));
electron_1.ipcMain.handle('linked:asset-data-uri', (_event, id, src) => linkedNotes.assetDataUri(id, src));
electron_1.ipcMain.handle('linked:set-draft', (_event, id, draft) => { linkedNotes.setDraft(id, draft); });
electron_1.ipcMain.handle('linked:show-in-folder', (_event, id) => {
    const note = (0, linkedNotesLogic_1.isLinkedNoteId)(id) ? linkedNotes.get(id) : null;
    if (!note)
        return { ok: false };
    // Missing file: open its folder instead (if that still exists).
    if (fs_1.default.existsSync(note.path))
        electron_1.shell.showItemInFolder(note.path);
    else if (fs_1.default.existsSync(path_1.default.dirname(note.path)))
        void electron_1.shell.openPath(path_1.default.dirname(note.path));
    else
        return { ok: false };
    return { ok: true };
});
electron_1.ipcMain.handle('linked:recheck', () => linkedNotes.recheck());
/** Serves `nflinked://n/<id>/<src>`: only images, only relative to a linked file's folder. */
async function handleLinkedAssetRequest(request) {
    try {
        const url = new URL(request.url);
        const [, encodedId, encodedSrc] = url.pathname.split('/');
        const id = decodeURIComponent(encodedId ?? '');
        const src = decodeURIComponent(encodedSrc ?? '');
        const file = await linkedNotes.resolveAsset(id, src);
        if (!file)
            return new Response(null, { status: 404 });
        return await electron_1.net.fetch((0, url_1.pathToFileURL)(file).toString());
    }
    catch {
        return new Response(null, { status: 404 });
    }
}
/** Linked-note functions the agent's tools need (ToolContext.linked). */
function linkedToolApi() {
    const asDiskNote = (n) => ({
        id: n.id,
        title: n.title,
        // `#` in a plain-text file (a comment in a .py, a .yaml…) is not a tag.
        tags: (0, linkedNotesLogic_1.isMarkdownPath)(n.path) ? agentTools.extractTags(n.body) : [],
        created: n.created,
        updated: n.updated,
        ...(n.group ? { group: n.group } : {}),
        ...(n.folder ? { folder: n.folder } : {}),
        ...(n.archived ? { archived: true } : {}),
        ...(n.favorited ? { favorited: true } : {}),
        sections: [{ id: 'body', name: n.sectionName, content: n.body, ...(n.aiHidden ? { aiHidden: true } : {}) }],
    });
    return {
        list: () => linkedNotes.list().map(asDiskNote),
        get: (id) => {
            const n = linkedNotes.get(id);
            return n ? asDiskNote(n) : null;
        },
        writeBody: async (id, content) => {
            const n = linkedNotes.get(id);
            if (!n)
                return { ok: false, error: 'not linked' };
            if (n.status !== 'ok' || !n.hash)
                return { ok: false, error: `the file is ${n.status === 'readonly' ? 'read-only' : n.status === 'missing' ? 'missing' : n.status === 'checking' ? 'still being read' : n.error === 'loneCr' ? 'read-only in NoteFlow (old Mac line breaks)' : 'unreadable'}` };
            // Based on the version main last read: if the file changed outside since, it's a conflict.
            const res = await linkedNotes.writeBody(id, content, n.hash);
            if (res.ok)
                return { ok: true };
            return { ok: false, error: res.reason === 'conflict' ? 'the file changed outside NoteFlow' : res.reason };
        },
        updateMeta: (id, patch) => { linkedNotes.updateMeta(id, patch); },
        unlink: (id) => { linkedNotes.unlink(id); },
    };
}
electron_1.ipcMain.handle('app:open-notes-folder', () => electron_1.shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err)));
electron_1.ipcMain.handle('app:get-version', () => electron_1.app.getVersion());
// Microsoft Store build (MSIX). The Store installs updates itself, and inside the
// package the app can't run the NSIS installer, write the HKCU Run key (registry
// writes are virtualized) or put the bundled CLI on PATH — see IS_STORE_BUILD uses.
electron_1.ipcMain.handle('app:get-distribution', () => (IS_STORE_BUILD ? 'store' : 'direct'));
// In-app feedback (Settings → About). No account required: electron/feedback.ts
// sends it with the session token when there is one, anonymously otherwise.
// The UI language goes along only if the user ticked the diagnostics box.
electron_1.ipcMain.handle('feedback:send', (_event, payload) => {
    return feedback.sendFeedback(payload, currentTrayLang());
});
// E2E COUPLING: scripts/update-e2e.cjs tests the updater on real installed builds by
// monkeypatching `https.get` (this handler) and `net.fetch` (app:download-and-install)
// from outside. Switching either HTTP client (or the URLs) requires updating that
// harness's fake release feed (installFeed) to intercept BOTH: the previous published
// build it updates FROM still makes the old calls.
electron_1.ipcMain.handle('app:check-update', () => {
    // if (!app.isPackaged) return { hasUpdate: false }
    // Store build: updates come from the Microsoft Store, never from GitHub.
    if (IS_STORE_BUILD)
        return Promise.resolve({ hasUpdate: false });
    // A failed check (offline, timeout, rate limit, bad answer) resolves
    // UPDATE_CHECK_FAILED — never a bare {hasUpdate:false}, which the UI would
    // show as "Up to date".
    return new Promise((resolve) => {
        const req = https_1.default.get('https://api.github.com/repos/yagoid/noteflow/releases/latest', { headers: { 'User-Agent': 'NoteFlow-App' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    // Result shape + asset choice live in updateAsset.ts (pure, tested); here
                    // we only probe the environment. On Linux without an installable asset
                    // (Arch, Fedora…) the URL is the releases page, opened in the browser.
                    const isLinux = process.platform === 'linux';
                    resolve((0, updateAsset_1.buildUpdateCheckResult)(res.statusCode, data, electron_1.app.getVersion(), (latest) => (0, updateAsset_1.pickUpdateTarget)({
                        platform: process.platform,
                        version: latest,
                        isAppImage: isLinux && (0, updateAsset_1.isRunningFromOwnAppImage)({
                            appImage: process.env.APPIMAGE,
                            appDir: process.env.APPDIR,
                            execPath: process.execPath,
                        }),
                        isDebian: isLinux && fs_1.default.existsSync('/etc/debian_version'),
                    })));
                }
                catch {
                    resolve(updateAsset_1.UPDATE_CHECK_FAILED);
                }
            });
        });
        req.on('error', () => resolve(updateAsset_1.UPDATE_CHECK_FAILED));
        req.setTimeout(8000, () => { req.destroy(); resolve(updateAsset_1.UPDATE_CHECK_FAILED); });
    });
});
electron_1.ipcMain.handle('app:open-url', (_event, rawUrl) => {
    const parsed = parseHttpsUrl(rawUrl);
    if (!parsed) {
        console.warn('[Security] Blocked external URL:', rawUrl);
        return;
    }
    electron_1.shell.openExternal(parsed.toString()).catch((err) => {
        console.error('Failed to open external URL:', err);
    });
});
/**
 * Starts the (already replaced) AppImage once this process has exited. Not
 * app.relaunch(): Electron's Linux relauncher is /proc/self/exe inside the OLD FUSE
 * mount, which the AppImage runtime unmounts when we exit — the helper dies before it
 * starts the new AppImage. A detached /bin/sh outside the mount waits for our pid and
 * execs it instead (details and the pure argv/env builders in updateAsset.ts). If the
 * shell can't be started, fall back to app.relaunch(), which still works when the
 * AppImage runs extracted (APPIMAGE_EXTRACT_AND_RUN=1).
 */
function relaunchAppImageAfterExit(appImagePath) {
    const fallback = (err) => {
        console.error('AppImage relaunch helper failed, falling back to app.relaunch:', err);
        electron_1.app.relaunch({ execPath: appImagePath });
    };
    try {
        const appDir = process.env.APPDIR;
        const { command, args } = (0, updateAsset_1.appImageRelaunchSpawnArgs)(process.pid, appImagePath);
        const helper = (0, child_process_1.spawn)(command, args, {
            detached: true,
            stdio: 'ignore',
            env: (0, updateAsset_1.sanitizeAppImageEnv)(process.env, appDir),
            cwd: (0, updateAsset_1.appImageRelaunchCwd)(process.cwd(), appDir, os_1.default.homedir()),
        });
        // Spawn failures (ENOENT /bin/sh, bad cwd) arrive async, before the quit completes.
        helper.on('error', fallback);
        helper.unref();
    }
    catch (err) {
        fallback(err);
    }
}
// E2E COUPLING: see app:check-update — scripts/update-e2e.cjs intercepts this net.fetch,
// and detects the AppImage relaunch by its temp work dir in a new process's argv or
// environ: the relaunch helper must keep passing the AppImage path (under that dir) and
// unrelated env vars such as NOTEFLOW_NOTES_DIR (sanitizeAppImageEnv keeps them).
electron_1.ipcMain.handle('app:download-and-install', async (_event, url) => {
    if (IS_STORE_BUILD)
        return { success: false, error: 'Updates come from the Microsoft Store' };
    try {
        const initialUrl = parseHttpsUrl(url);
        if (!initialUrl || !isAllowedInitialUpdateUrl(initialUrl)) {
            throw new Error('Blocked update URL');
        }
        const response = await electron_1.net.fetch(initialUrl.toString());
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        if (response.url) {
            const finalUrl = parseHttpsUrl(response.url);
            if (!finalUrl || !isAllowedRedirectUpdateUrl(finalUrl)) {
                throw new Error(`Blocked redirected update URL: ${response.url}`);
            }
        }
        const tmpDir = electron_1.app.getPath('temp');
        const fileName = path_1.default.basename(initialUrl.pathname) || 'NoteFlow-update.exe';
        const dest = path_1.default.join(tmpDir, fileName);
        const total = parseInt(response.headers.get('content-length') || '0');
        let downloaded = 0;
        const writer = fs_1.default.createWriteStream(dest);
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            writer.write(Buffer.from(value));
            downloaded += value.length;
            const percent = total ? Math.round((downloaded / total) * 100) : -1;
            electron_1.BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update:download-progress', percent));
        }
        await new Promise((resolve, reject) => {
            writer.end();
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        // Download done — signal the install phase so the UI can show "Installing…"
        // for the brief moment before the app quits/relaunches. (spawn below is
        // instantaneous on Windows, so we can't derive this from the 100% progress.)
        electron_1.BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update:installing'));
        if (process.platform === 'linux') {
            // Only .deb and .AppImage are published for Linux (see updateAsset.ts).
            const kind = (0, updateAsset_1.updateAssetKind)(dest);
            if (kind === 'deb') {
                await new Promise((resolve) => {
                    const proc = (0, child_process_1.spawn)('pkexec', ['dpkg', '-i', dest], { stdio: 'ignore' });
                    proc.on('error', () => {
                        // pkexec not available, fall back to xdg-open
                        electron_1.shell.openPath(dest);
                        resolve();
                    });
                    proc.on('close', (code) => {
                        if (code === 0) {
                            quittingForUpdate = true;
                            electron_1.app.relaunch();
                            electron_1.app.quit();
                        }
                        resolve();
                    });
                });
            }
            else if (kind === 'appimage') {
                // AppImage: replace the running AppImage in place and relaunch.
                // process.env.APPIMAGE holds the absolute path of the AppImage the user
                // launched (set by the AppImage runtime). No root needed: it lives in the
                // user's space. APPIMAGE is inherited by children of ANY AppImage, so only
                // trust it when this process really runs from it — otherwise we would
                // rename NoteFlow over another app's file.
                const appImagePath = process.env.APPIMAGE;
                const ownAppImage = (0, updateAsset_1.isRunningFromOwnAppImage)({
                    appImage: appImagePath,
                    appDir: process.env.APPDIR,
                    execPath: process.execPath,
                });
                if (appImagePath && ownAppImage) {
                    try {
                        const dir = path_1.default.dirname(appImagePath);
                        const tmpTarget = path_1.default.join(dir, `.${path_1.default.basename(appImagePath)}.new`);
                        // Copy into the target dir, then atomic rename. The rename leaves the
                        // currently-running inode untouched (the FUSE mount keeps working) and
                        // points the path at the new file — never overwrite the mounted file
                        // in place, that would corrupt the running process.
                        fs_1.default.copyFileSync(dest, tmpTarget);
                        fs_1.default.chmodSync(tmpTarget, 0o755);
                        fs_1.default.renameSync(tmpTarget, appImagePath);
                        quittingForUpdate = true;
                        relaunchAppImageAfterExit(appImagePath);
                        electron_1.app.quit();
                    }
                    catch (err) {
                        console.error('AppImage in-place update failed, opening file:', err);
                        await electron_1.shell.openPath(dest);
                    }
                }
                else {
                    // Not running from our own AppImage (dev / .deb launched from another
                    // AppImage / unusual packaging) — just open it.
                    await electron_1.shell.openPath(dest);
                }
            }
            else {
                // Not a Linux package (the allow-check still admits .exe/.dmg) — just open it.
                await electron_1.shell.openPath(dest);
            }
        }
        else if (process.platform === 'darwin') {
            // macOS: the build is not notarized, so we can't use Squirrel.Mac for a
            // seamless in-place update. Open the downloaded DMG in Finder and let the
            // user drag NoteFlow to Applications, replacing the old copy. We keep the
            // app running so the user can read the instructions; they relaunch manually.
            await electron_1.shell.openPath(dest);
            if (electron_1.Notification.isSupported()) {
                const n = mainMessages().notifications;
                new electron_1.Notification({
                    title: n.updateDownloadedTitle,
                    body: n.updateDownloadedBody,
                }).show();
            }
        }
        else {
            // Windows: run the NSIS installer with --updated (NOT /S). This keeps the
            // installer's native progress window visible while skipping the "please close
            // the application" popup: electron-builder's app-running check auto-closes the
            // running instance (no MessageBox) when the --updated flag is set. --force-run
            // relaunches NoteFlow when done. We also app.quit() ourselves so the exit is
            // graceful and prompt — otherwise the installer would force-kill us after a
            // retry, since our window-close hides to tray instead of quitting. detached+unref
            // keep the installer alive after we exit. (per-user NSIS install → no UAC.)
            const installer = (0, child_process_1.spawn)(dest, ['--updated', '--force-run'], {
                detached: true,
                stdio: 'ignore',
            });
            installer.unref();
            quittingForUpdate = true;
            setTimeout(() => electron_1.app.quit(), 1000);
        }
        return { success: true };
    }
    catch (err) {
        return { success: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('app:choose-notes-dir', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: mainMessages().dialogs.chooseNotesFolder,
    });
    return result.canceled ? null : result.filePaths[0];
});
// For 'md'/'txt' the entries are plain { filename, content } files; for
// '.noteflow'/'json' they are v2 folder bundles { dir, files } dumped as JSON.
electron_1.ipcMain.handle('notes:export', async (_event, entries, format, hint) => {
    try {
        const safeHint = hint
            ? hint.replace(/[^a-z0-9 ._-]/gi, '').trim().replace(/\s+/g, '-') || 'note'
            : null;
        if (format === 'txt' || format === 'md') {
            const plain = entries;
            if (plain.length === 1) {
                const defaultName = safeHint ? `${safeHint}.${format}` : plain[0].filename;
                const result = await electron_1.dialog.showSaveDialog(mainWindow, {
                    title: mainMessages().dialogs.exportNote,
                    defaultPath: path_1.default.join(os_1.default.homedir(), defaultName),
                    filters: [{ name: format === 'txt' ? 'Plain Text' : 'Markdown', extensions: [format] }],
                });
                if (result.canceled || !result.filePath)
                    return { ok: false, canceled: true };
                fs_1.default.writeFileSync(result.filePath, plain[0].content, 'utf-8');
                return { ok: true, filePath: result.filePath };
            }
            else {
                const result = await electron_1.dialog.showOpenDialog(mainWindow, {
                    title: mainMessages().dialogs.chooseDestinationFolder,
                    properties: ['openDirectory'],
                });
                if (result.canceled || result.filePaths.length === 0)
                    return { ok: false, canceled: true };
                const dir = result.filePaths[0];
                for (const entry of plain) {
                    fs_1.default.writeFileSync(path_1.default.join(dir, entry.filename), entry.content, 'utf-8');
                }
                return { ok: true, filePath: dir };
            }
        }
        // .noteflow (default)
        const dateStr = new Date().toISOString().slice(0, 10);
        const defaultNoteflowName = safeHint
            ? `${safeHint}.noteflow`
            : `noteflow-export-${dateStr}.noteflow`;
        const result = await electron_1.dialog.showSaveDialog(mainWindow, {
            title: mainMessages().dialogs.exportNotes,
            defaultPath: path_1.default.join(os_1.default.homedir(), defaultNoteflowName),
            filters: [
                { name: 'NoteFlow Export', extensions: ['noteflow'] },
                { name: 'JSON', extensions: ['json'] },
            ],
        });
        if (result.canceled || !result.filePath) {
            return { ok: false, canceled: true, error: 'Canceled' };
        }
        const exportFile = {
            version: 2,
            exported: new Date().toISOString(),
            app: 'noteflow',
            notes: entries,
        };
        fs_1.default.writeFileSync(result.filePath, JSON.stringify(exportFile, null, 2), 'utf-8');
        return { ok: true, filePath: result.filePath };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('notes:parse-import-file', async () => {
    try {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: mainMessages().dialogs.importNotes,
            filters: [
                { name: 'All supported', extensions: ['noteflow', 'json', 'txt', 'md'] },
                { name: 'NoteFlow Export', extensions: ['noteflow', 'json'] },
                { name: 'Text / Markdown', extensions: ['txt', 'md'] },
            ],
            properties: ['openFile'],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { ok: false, canceled: true, error: 'Canceled' };
        }
        const filePath = result.filePaths[0];
        const ext = path_1.default.extname(filePath).toLowerCase().slice(1);
        if (ext === 'txt' || ext === 'md') {
            const textContent = fs_1.default.readFileSync(filePath, 'utf-8');
            const title = path_1.default.basename(filePath, path_1.default.extname(filePath));
            const id = (0, crypto_1.randomBytes)(4).toString('hex');
            const secId = (0, crypto_1.randomBytes)(3).toString('hex');
            const now = new Date().toISOString();
            const slug = title.replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'note';
            const { files } = noteFormat.serializeNoteFolder({
                id,
                title,
                tags: [],
                created: now,
                updated: now,
                sections: [{ id: secId, name: 'Note', content: textContent, isRawMode: true, created: now, updated: now }],
            });
            return {
                ok: true,
                file: {
                    version: 2,
                    exported: now,
                    app: 'noteflow',
                    notes: [{ dir: `${slug}-${id}`, files }],
                },
            };
        }
        const raw = fs_1.default.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.app !== 'noteflow' || !Array.isArray(parsed.notes)) {
            return { ok: false, error: 'Invalid .noteflow file format' };
        }
        if (parsed.version === 2) {
            return { ok: true, file: parsed };
        }
        if (parsed.version === 1) {
            // Old export: each entry is one flat .md with inline sections — convert
            // to a v2 folder bundle so the rest of the pipeline only sees v2.
            const notes = [];
            for (const entry of parsed.notes) {
                if (typeof entry?.filename !== 'string' || typeof entry?.content !== 'string')
                    continue;
                const note = noteFormat.parseLegacyNoteRaw(entry.content);
                const dir = entry.filename.replace(/\.md$/i, '');
                const { files } = noteFormat.serializeNoteFolder(note, { preserveUpdated: true });
                notes.push({ dir, files });
            }
            return { ok: true, file: { version: 2, exported: String(parsed.exported ?? ''), app: 'noteflow', notes } };
        }
        return { ok: false, error: 'Unsupported .noteflow version' };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
// Import from other note apps. Main does IO only (unzip / walk dirs) and returns
// a normalized intermediate; the renderer converts HTML→md, resolves groups and
// serializes to the v2 folder format (see electron/importers/).
electron_1.ipcMain.handle('notes:parse-external-import', async (_event, source) => {
    try {
        let srcPath;
        if (source === 'md-folder') {
            const result = await electron_1.dialog.showOpenDialog(mainWindow, {
                title: mainMessages().dialogs.chooseMarkdownFolder,
                properties: ['openDirectory'],
            });
            if (result.canceled || result.filePaths.length === 0)
                return { ok: false, canceled: true };
            srcPath = result.filePaths[0];
        }
        else {
            const result = await electron_1.dialog.showOpenDialog(mainWindow, {
                title: source === 'notion' ? mainMessages().dialogs.importNotion : mainMessages().dialogs.importGoogleKeep,
                filters: [{ name: 'Zip archive', extensions: ['zip'] }],
                properties: ['openFile'],
            });
            if (result.canceled || result.filePaths.length === 0)
                return { ok: false, canceled: true };
            srcPath = result.filePaths[0];
        }
        const parsed = importers.parseExternalSource(source, srcPath);
        return { ok: true, source: parsed.source, notes: parsed.notes };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('notes:write-imported', async (_event, entries) => {
    const written = [];
    const errors = [];
    const writtenPaths = [];
    const sync = (0, syncProvider_1.getActiveSyncProvider)();
    const connected = sync.isConnected();
    for (const entry of entries) {
        try {
            const dir = ensureSafeDirname(entry.dir);
            const writes = Object.entries(entry.files ?? {}).map(([f, content]) => {
                if (typeof content !== 'string')
                    throw new Error('Import content must be a string');
                return [ensureSafeNoteFile(f), content];
            });
            if (!writes.some(([f]) => f === noteFormat.NOTE_MD))
                throw new Error('Imported note is missing note.md');
            const dirPath = path_1.default.join(NOTES_DIR, dir);
            fs_1.default.mkdirSync(dirPath, { recursive: true });
            markInternalWrite(dir);
            for (const [f, content] of writes) {
                markInternalWrite(`${dir}/${f}`);
                fs_1.default.writeFileSync(path_1.default.join(dirPath, f), content, 'utf-8');
                writtenPaths.push(`${dir}/${f}`);
            }
            written.push(dir);
        }
        catch (err) {
            errors.push(`${entry.dir}: ${String(err)}`);
        }
    }
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('notes-updated');
    });
    // Durably push the imported files NOW (awaited, batched) instead of relying on
    // per-file debounced pushes. The debounced path bumps lastSync on each
    // completion, so while a large import drains a racing auto-sync pull would see
    // the not-yet-pushed notes as stale and delete them. Landing them on the remote
    // up front prevents that.
    if (connected && writtenPaths.length > 0) {
        try {
            const res = await sync.pushPathsNow(NOTES_DIR, writtenPaths);
            if (res.errors.length > 0)
                errors.push(...res.errors.map((p) => `push failed: ${p}`));
        }
        catch (err) {
            errors.push(`push failed: ${String(err)}`);
        }
    }
    return { written, errors };
});
// ── GitHub Sync ───────────────────────────────────────────────────────────────
electron_1.ipcMain.handle('sync:get-status', () => {
    return githubSync.getSyncStatus();
});
// Backend-tagged status of whichever sync provider is live (Cloud when enabled,
// else GitHub, else 'none') — drives the titlebar sync button and its status
// card. The in-flight sets live here (not in syncProvider), so their size is passed in.
electron_1.ipcMain.handle('sync:get-active-status', () => {
    return (0, syncProvider_1.getActiveSyncStatus)(inFlightRemoteWrites());
});
electron_1.ipcMain.handle('sync:initiate', async (_event, repo) => {
    return githubSync.initiateDeviceFlow(repo, NOTES_DIR, (result) => {
        electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('sync-auth-complete', result));
        if (result.ok && result.pendingOriginChoice) {
            // Connected, but the notes dir came from another remote: nothing was
            // pulled; the renderer shows the choice (sync:resolve-origin). The tick
            // re-checks the gate on its own; no migration until it is resolved.
            emitSyncStatusChanged();
            startAutoSync();
            return;
        }
        if (result.ok) {
            electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
            startAutoSync();
            // Fresh connection: make sure the remote carries the v2 format marker
            // (and convert any v1 leftovers if connecting to an old notes repo).
            githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).then((didMigrate) => {
                if (didMigrate) {
                    // Remote-only notes may have been imported locally — full reload
                    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
                }
            }).catch((err) => {
                console.error('[Sync] remote format migration failed:', String(err));
            });
        }
    });
});
electron_1.ipcMain.handle('sync:cancel-auth', () => {
    githubSync.cancelDeviceFlow();
    return { ok: true };
});
/** Disconnects GitHub Sync (Settings "Disconnect", and "Cancel" of the origin choice). */
function disconnectGithubSync() {
    stopAutoSync();
    githubSync.disconnectGitHub();
    // On Windows the CLI shares this settings.json: its copy of the token
    // ("Connect the CLI too") must not outlive the connection it was for.
    cliConnect.cleanupAfterAppGithubDisconnect();
    // The renderer's sync surfaces (titlebar button, sidebar identity line) follow this event;
    // disconnectGitHub only emits it when initialPullStatus actually changes.
    emitSyncStatusChanged();
}
electron_1.ipcMain.handle('sync:disconnect', () => {
    disconnectGithubSync();
    return { ok: true };
});
/** archiveLocalNotesForOriginSwitch failed: the IPC answer (and the UI reload if notes moved anyway). */
function archiveFailure(err) {
    if (err instanceof OriginSwitchAbortedError)
        return { ok: false, error: 'not-pending' };
    const detail = err instanceof notesArchive.NotesArchiveError && !err.rolledBack
        ? `${err.message} — kept in ${err.archiveDir}: ${err.stranded.join('; ')}`
        : err instanceof Error ? err.message : String(err);
    console.error('[Sync] archiving the local notes failed:', detail);
    // Some notes may already be in the archive (undo failed): reload the UI.
    if (err instanceof notesArchive.NotesArchiveError && !err.rolledBack) {
        electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
    }
    return { ok: false, error: 'archive-failed', detail };
}
// The notes dir came from another remote than the live backend's and holds
// notes (the origin gate of githubSync / cloudSync): the user's choice.
// `backend` defaults to 'github' (the original contract); the reentrancy guard
// is shared — one choice at a time, whichever backend asks. A backend with no
// choice pending answers 'not-pending' (cancel included).
// - merge: today's connect — pull, then every local note goes up.
// - replace: the local notes are moved to the local archive first (never
//   deleted); if that fails nothing is pulled and the choice stays pending.
//   Then pull only.
// - cancel: GitHub → disconnect; Cloud → Cloud sync off (signed in, notes and
//   stored origin untouched).
let resolveOriginInFlight = false;
electron_1.ipcMain.handle('sync:resolve-origin', async (_event, choice, backend, key) => {
    if (choice !== 'merge' && choice !== 'replace' && choice !== 'cancel')
        return { ok: false, error: 'invalid' };
    if (backend !== undefined && backend !== 'github' && backend !== 'cloud')
        return { ok: false, error: 'invalid' };
    if (resolveOriginInFlight)
        return { ok: false, error: 'busy' };
    if (backend === 'cloud')
        return resolveCloudOrigin(choice, key);
    // The answer is for the choice the user saw (`key`, originChoiceKey.ts): if
    // another one is pending now — or none — nothing is applied.
    const pendingGithub = githubSync.getOriginChoice();
    if (!(0, originChoiceKey_1.originChoiceStillPending)(key, pendingGithub ? (0, originChoiceKey_1.githubOriginChoiceKey)(pendingGithub) : null)) {
        return { ok: false, error: 'not-pending' };
    }
    if (choice === 'cancel') {
        disconnectGithubSync();
        return { ok: true };
    }
    resolveOriginInFlight = true;
    try {
        if (choice === 'replace') {
            const previous = githubSync.getStoredOriginIdentity();
            const label = previous ? (0, syncOrigin_1.identityArchiveLabel)(previous) : 'github';
            const chosen = githubSync.getOriginChoice();
            // Up to ~3.5 s of waits (windows closing, pending saves) happen before the
            // archive: by then a disconnect, Cloud being enabled or another
            // connection may have changed what the user answered to.
            const stillValid = () => {
                if (cloudSync.isCloudSyncEnabled() || !githubSync.getSyncStatus().connected)
                    return false;
                if (githubSync.refreshOriginGate() !== 'ask')
                    return false;
                const now = githubSync.getOriginChoice();
                return !!now &&
                    now.previous.owner === chosen.previous.owner && now.previous.repo === chosen.previous.repo &&
                    now.next.owner === chosen.next.owner && now.next.repo === chosen.next.repo;
            };
            try {
                await archiveLocalNotesForOriginSwitch(label, previous ?? undefined, { stillValid });
            }
            catch (err) {
                emitSyncStatusChanged();
                return archiveFailure(err);
            }
        }
        const res = await githubSync.resolveOriginChoice(choice, NOTES_DIR);
        if (!res.ok) {
            emitSyncStatusChanged();
            return { ok: false, error: res.error };
        }
        broadcastPullResult(res.pull, 'github', { manual: true });
        startAutoSync();
        githubSync.retrySyncJournal(NOTES_DIR).catch((err) => {
            console.error('[Sync] journal retry after the origin choice failed:', String(err));
        });
        githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).then((didMigrate) => {
            if (didMigrate)
                electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
        }).catch((err) => {
            console.error('[Sync] remote format migration failed:', String(err));
        });
        return { ok: true };
    }
    finally {
        resolveOriginInFlight = false;
    }
});
/**
 * NoteFlow Cloud's origin choice (cloudSync's origin gate: the notes dir came
 * from another account, or GitHub's "use only the notes from …" replaced them).
 * - merge: adopt the signed-in account (reset of the per-account state) and run
 *   a cycle — its first sync downloads the account's notes and the catch-up
 *   uploads every local note.
 * - replace: archive the local notes (label of where they came from), adopt
 *   (marking the GitHub origin stale in the same write), disconnect GitHub if
 *   it is connected (its repo holds the notes that were just set aside) and
 *   run a cycle — pull only, nothing synced is left to upload.
 * - cancel: Cloud sync off — exactly what "Turn off" in Settings does (the
 *   autosync stops and the Cloud half of a pending restore record is dropped,
 *   so entitlements landing later don't switch it back on and ask again). The
 *   session, the notes and the stored origin stay: turning Cloud on by hand
 *   asks again. A NEW sign-in still switches on what is paid (and asks).
 */
async function resolveCloudOrigin(choice, key) {
    const chosen = cloudSync.getCloudOriginChoice();
    // Only the choice the user saw (`key`): another account signed in meanwhile → not this one.
    if (!chosen || !(0, originChoiceKey_1.originChoiceStillPending)(key, (0, originChoiceKey_1.cloudOriginChoiceKey)(chosen)))
        return { ok: false, error: 'not-pending' };
    if (choice === 'cancel') {
        cloudSync.disableCloudSync();
        stopCloudAutoSync();
        dropRestoreSurface('cloud');
        emitCloudStatusChanged();
        emitSyncStatusChanged(); // GitHub's gate depends on Cloud being on
        return { ok: true };
    }
    resolveOriginInFlight = true;
    try {
        if (choice === 'replace') {
            // The archive is named after where the notes came from: the previous
            // account, or — for a stale origin — the GitHub repo that replaced them.
            const from = chosen.stale
                ? chosen.staleFrom ? { kind: 'github', owner: chosen.staleFrom.owner, repo: chosen.staleFrom.repo } : null
                : cloudSync.getStoredCloudOriginIdentity();
            const label = from ? (0, syncOrigin_1.identityArchiveLabel)(from) : 'previous-sync';
            // Up to ~3.5 s of waits (windows closing, pending saves) happen before
            // the archive: a sign-out, another account or Cloud turned off may have
            // changed what the user answered to.
            const stillValid = () => {
                if (!cloudSync.isCloudSyncEnabled() || account.getUserId() !== chosen.next.userId)
                    return false;
                if (cloudSync.refreshCloudOriginGate() !== 'ask')
                    return false;
                const now = cloudSync.getCloudOriginChoice();
                return !!now &&
                    now.previous.userId === chosen.previous.userId && now.next.userId === chosen.next.userId &&
                    now.stale === chosen.stale;
            };
            try {
                await archiveLocalNotesForOriginSwitch(label, from ?? undefined, { stillValid });
            }
            catch (err) {
                emitCloudStatusChanged();
                return archiveFailure(err);
            }
        }
        const res = cloudSync.resolveCloudOriginChoice(choice);
        if (!res.ok) {
            emitCloudStatusChanged();
            return { ok: false, error: res.error };
        }
        // Its repo still holds the notes that were just set aside: GitHub Sync is
        // disconnected (incl. the CLI's copy of the token); its origin was marked
        // stale by the adoption, so reconnecting it with notes on disk asks.
        if (choice === 'replace' && githubSync.getSyncStatus().connected)
            disconnectGithubSync();
        emitCloudStatusChanged(); // the gate is open: realtime joins (syncCloudRealtimeState)
        startCloudAutoSync();
        // unlock → pull (first sync of the account) → catch-up → drain. A manual
        // cycle: it pulls even with the keys still locked (the error shows), and
        // its notes broadcast reloads everything.
        await cloudManualSync();
        return { ok: true };
    }
    finally {
        resolveOriginInFlight = false;
    }
}
// Settings → Sync: is there any local archive (copies of notes set aside by
// "use only the remote's notes")? And open its folder.
electron_1.ipcMain.handle('sync:archives-status', () => {
    return { hasArchives: notesArchive.hasArchives(notesArchiveRoot()) };
});
electron_1.ipcMain.handle('sync:open-archives', async () => {
    const root = notesArchiveRoot();
    if (!notesArchive.hasArchives(root))
        return { ok: false };
    const error = await electron_1.shell.openPath(root);
    return error ? { ok: false } : { ok: true };
});
// Manual GitHub sync + its broadcast (shared by sync:pull and sync:pull-active).
// Drains the journal first, like the autosync tick (startAutoSync): pushes
// that failed offline go up on the click instead of waiting for the next
// 5-min tick. No-op until the first pull succeeded (retrySyncJournal gates
// itself). Unlike the tick, the pull is not deferred by writes in flight.
async function githubManualPull() {
    try {
        await githubSync.retrySyncJournal(NOTES_DIR);
    }
    catch (err) {
        console.error('[Sync] manual journal retry failed:', String(err));
    }
    const result = await githubSync.pullNotes(NOTES_DIR);
    indexPulledNotes(result);
    // Guarded no-op once the remote is already on format v2
    githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).then((didMigrate) => {
        if (didMigrate) {
            // Remote-only notes may have been imported locally — full reload
            electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
        }
    }).catch((err) => {
        console.error('[Sync] remote format migration failed:', String(err));
    });
    broadcastPulledNotes(result, { manual: true });
    expireNotesAfterPull(result, 'github');
    return result;
}
// Settings → GitHub "Sync now". Refused while NoteFlow Cloud owns the sync loop:
// the paused repo can still hold notes deleted under Cloud, and pulling it would
// bring them back (the UI hides the button then; "Mirror to GitHub" is the way
// to refresh the repo). The titlebar goes through sync:pull-active instead.
electron_1.ipcMain.handle('sync:pull', async () => {
    if (cloudSync.isCloudSyncEnabled()) {
        return {
            pulled: 0,
            deleted: 0,
            errors: [],
            updatedFiles: [],
            hadDeletions: false,
            hadMetadataChanges: false,
            error: 'cloud-enabled',
        };
    }
    const result = await githubManualPull();
    // Nothing was synced: the notes dir came from another remote (the engine's
    // origin gate) — the user has to choose first.
    return githubSync.getOriginChoice() ? { ...result, error: 'origin-choice-pending' } : result;
});
// Mirror local → repo: leaves the GitHub repo as an exact copy of what is on
// disk (uploads what differs, deletes what is gone). Offered ONLY while NoteFlow
// Cloud owns the sync loop — that is when GitHub is a paused write-only mirror
// and the repo rots. The Cloud gate lives here and not in githubSync.ts, which
// cannot import cloudSync.ts (that module imports it — it would be a cycle).
// Local notes are untouched, so no 'notes-updated' broadcast; the sync status
// (lastSync/error) does change, hence the usual status broadcast.
// The mirror deletes from the repo everything missing on disk, so it also waits
// for the Cloud initial pull: on a fresh device the disk is not the account's
// state yet, and mirroring it would wipe every note not downloaded so far. Same
// while remote rows that failed to apply here are pending a retry
// (hasPendingPullRetries): the disk is missing them too.
electron_1.ipcMain.handle('sync:mirror-to-github', async () => {
    if (!cloudSync.isCloudSyncEnabled()) {
        return { ok: false, pushed: 0, deleted: 0, skipped: 0, errors: [], warnings: [], error: 'cloud-required' };
    }
    // The notes on disk may belong to another account (origin choice pending):
    // mirroring them would push them to the repo as if they were this account's.
    if (cloudSync.isCloudOriginGateBlocked()) {
        return { ok: false, pushed: 0, deleted: 0, skipped: 0, errors: [], warnings: [], error: 'origin-choice-pending' };
    }
    if (cloudSync.getCloudSyncStatus().initialPullStatus !== 'ok' || cloudSync.hasPendingPullRetries()) {
        return { ok: false, pushed: 0, deleted: 0, skipped: 0, errors: [], warnings: [], error: 'cloud-initial-pull-pending' };
    }
    const result = await githubSync.mirrorToGitHub(NOTES_DIR);
    emitSyncStatusChanged();
    return result;
});
// Routes the titlebar's manual pull to whichever backend is live: Cloud when
// enabled (they are mutually exclusive), GitHub otherwise. Same broadcast
// contract as sync:pull / cloud:pull so the store reloads either way.
electron_1.ipcMain.handle('sync:pull-active', async () => {
    return cloudSync.isCloudSyncEnabled() ? cloudManualSync() : githubManualPull();
});
// ── Settings → Sync → "Connect the CLI too" (electron/cliConnect.ts) ─────────
// The CLI gets its OWN access to the backend the app uses: its own Cloud
// session (the CLI's login, run as a child process) or a copy of the app's
// GitHub token. The email / token come from main, never from the renderer.
electron_1.ipcMain.handle('cli-connect:get-status', () => cliConnect.getStatus());
function cliConnectEmail() {
    const status = account.getAccountStatus();
    return status.signedIn && status.email ? status.email : null;
}
// While the backend's origin choice is pending the app itself syncs nothing
// with it: the CLI must not get access either (it would sync these notes with
// that remote on its own, behind the user's pending answer).
function cloudOriginPendingForCli() {
    return !!cloudSync.getCloudOriginChoice() || (cloudSync.isCloudSyncEnabled() && cloudSync.isCloudOriginGateBlocked());
}
electron_1.ipcMain.handle('cli-connect:cloud-send-code', async () => {
    const email = cliConnectEmail();
    if (!email)
        return { ok: false, error: 'notSignedIn' };
    if (cloudOriginPendingForCli())
        return { ok: false, error: 'originChoicePending' };
    return cliConnect.cloudSendCode(email);
});
electron_1.ipcMain.handle('cli-connect:cloud-verify', async (_event, code) => {
    const email = cliConnectEmail();
    if (!email)
        return { ok: false, error: 'notSignedIn' };
    if (cloudOriginPendingForCli())
        return { ok: false, error: 'originChoicePending' };
    // Digits (spaces/dashes tolerated, like the CLI's normalizeOtpCode) — anything
    // else never reaches the CLI's argv.
    const clean = typeof code === 'string' ? code.replace(/[\s-]/g, '') : '';
    if (!/^\d{6,10}$/.test(clean))
        return { ok: false, error: 'invalidCode' };
    return cliConnect.cloudVerifyCode(email, clean);
});
electron_1.ipcMain.handle('cli-connect:cloud-disconnect', async () => cliConnect.cloudDisconnect());
electron_1.ipcMain.handle('cli-connect:github-connect', () => {
    if (githubSync.getOriginChoice() || githubSync.isOriginGateBlocked())
        return { ok: false, error: 'originChoicePending' };
    const connection = githubSync.getConnectionForCli();
    if (!connection)
        return { ok: false, error: 'notConnected' };
    return cliConnect.githubConnect(connection);
});
electron_1.ipcMain.handle('cli-connect:github-disconnect', () => cliConnect.githubDisconnect());
// ── NoteFlow account (Supabase Auth + entitlements) ───────────────────────────
// Session/tokens live in electron/account.ts (main-process only); the renderer
// exchanges exclusively the public status.
electron_1.ipcMain.handle('account:get-status', () => {
    return account.getAccountStatus();
});
electron_1.ipcMain.handle('account:request-otp', (_event, email) => {
    return account.requestOtp(email);
});
electron_1.ipcMain.handle('account:verify-otp', (_event, email, code) => {
    return account.verifyOtp(email, code);
});
electron_1.ipcMain.handle('account:sign-out', () => {
    return account.signOut();
});
// "Delete account": account.deleteAccount asks the delete-account Edge Function
// and, on success, clears the session — whose sign-out edge already runs the
// usual teardown in handleAccountStatusChanged (Cloud off, DEK dropped, assistant
// back to BYO). On top of that, here:
//  - Cloud is switched off again as a safety net: the remote copy is gone, so
//    nothing may keep pushing even if that edge was not observed. Local notes are
//    never touched (disableCloudSync keeps the files, the journal and lastSync);
//  - the accountRestore record that sign-out edge wrote is dropped: a brand-new
//    account created later with the same email must not get Cloud / NoteFlow AI
//    switched on by a record of the deleted one (a real sign-in still activates
//    whatever that account pays for).
// A failure (billing not cancelled, session expired, network…) and `staleSession`
// (another session took over meanwhile — its state is not ours) skip all of it.
electron_1.ipcMain.handle('account:delete', async () => {
    const result = await account.deleteAccount();
    if (!result.ok || result.staleSession)
        return result;
    try {
        if (cloudSync.isCloudSyncEnabled()) {
            cloudSync.disableCloudSync();
            stopCloudAutoSync();
            emitCloudStatusChanged();
        }
    }
    catch (err) {
        console.error('[Account] failed to disable Cloud sync after deleting the account:', String(err));
    }
    try {
        writeAccountRestore(null);
    }
    catch (err) {
        console.error('[Account] failed to drop the restore record after deleting the account:', String(err));
    }
    return result;
});
electron_1.ipcMain.handle('account:refresh-entitlements', () => {
    return account.refreshEntitlements();
});
// Opens the Lemon Squeezy checkout in the browser, tagged with the Supabase
// user id (checkout[custom][user_id], URL-encoded) so the billing webhook can
// attribute the purchase. Built here in main so the user id never crosses to
// the renderer.
electron_1.ipcMain.handle('account:open-checkout', (_event, product) => {
    const base = product === 'ai' || product === 'cloud' || product === 'bundle'
        ? cloudConfig_1.LEMONSQUEEZY_CHECKOUT_URLS[product]
        : '';
    if (!base)
        return { ok: false, error: 'Checkout is not available yet.', errorCode: 'checkoutUnavailable' };
    const userId = account.getUserId();
    if (!userId)
        return { ok: false, error: 'Sign in to your NoteFlow account first.', errorCode: 'notSignedIn' };
    const sep = base.includes('?') ? '&' : '?';
    const url = parseHttpsUrl(`${base}${sep}checkout%5Bcustom%5D%5Buser_id%5D=${encodeURIComponent(userId)}`);
    if (!url)
        return { ok: false, error: 'Invalid checkout URL.', errorCode: 'checkoutInvalidUrl' };
    electron_1.shell.openExternal(url.toString()).catch((err) => {
        console.error('Failed to open checkout URL:', err);
    });
    return { ok: true };
});
// "Manage subscription": opens the Lemon Squeezy customer portal (cancel,
// change plan, payment method, invoices). account.resolveBillingPortal asks the
// billing-portal Edge Function for the user's pre-signed link and falls back to
// the store's generic portal (sign-in by email); either URL is already checked
// against the https + *.lemonsqueezy.com allowlist. `via` lets the UI explain
// the fallback.
electron_1.ipcMain.handle('account:open-billing-portal', async () => {
    const target = await account.resolveBillingPortal();
    if (!target.ok)
        return target;
    try {
        await electron_1.shell.openExternal(target.url);
    }
    catch (err) {
        console.error('Failed to open the billing portal:', err);
        return { ok: false, error: 'Could not open the billing portal.', errorCode: 'billingPortalUnavailable' };
    }
    return { ok: true, via: target.via };
});
// "Upgrade to Bundle" (one of AI / Cloud already on a Lemon Squeezy
// subscription): changes the plan of THAT subscription server-side (Edge
// Function billing-change-plan, prorated) — never a second checkout. The
// Bundle entitlement arrives via the webhook; account.ts re-fetches until then.
electron_1.ipcMain.handle('account:upgrade-to-bundle', () => {
    return account.upgradeToBundle();
});
// ── NoteFlow Cloud (encrypted sync — phase 4.2) ───────────────────────────────
// Key material lives in electron/cloudKeys.ts (main-process memory only); the
// renderer exchanges exclusively the public CloudSyncStatus. These handlers
// are the complete main-side surface (UI: Settings → Sync → CloudPanel).
electron_1.ipcMain.handle('cloud:get-status', () => {
    return cloudSync.getCloudSyncStatus();
});
// passphrase → generates DEK + recovery code, uploads user_keys, unlocks.
// E2EE (private) mode — opt-in. The recovery code is returned ONCE for display
// and never persisted.
electron_1.ipcMain.handle('cloud:setup', async (_event, passphrase) => {
    const res = await cloudKeys.setupCloudKeys(passphrase);
    emitCloudStatusChanged();
    return res;
});
// Managed (standard) mode — the default: the DEK is generated client-side and
// deposited in the cloud-keys Edge Function (wrapped by the operator key).
// Nothing to remember; the session ends up unlocked directly.
electron_1.ipcMain.handle('cloud:setup-managed', async () => {
    const res = await cloudKeys.setupCloudKeysManaged();
    emitCloudStatusChanged();
    return res;
});
// Upgrade managed → e2ee. Returns the new recovery code ONCE.
electron_1.ipcMain.handle('cloud:upgrade-e2ee', async (_event, passphrase) => {
    const res = await cloudKeys.upgradeCloudKeysToE2ee(passphrase);
    emitCloudStatusChanged();
    return res;
});
// Downgrade e2ee → managed (explicit, confirmed in the UI — never silent).
// The old passphrase and recovery code stop working after this.
electron_1.ipcMain.handle('cloud:downgrade-managed', async () => {
    const res = await cloudKeys.downgradeCloudKeysToManaged();
    emitCloudStatusChanged();
    return res;
});
// Silent managed unlock (no-op for e2ee/no-keys/unlocked). The Cloud panel
// polls this while it shows the "Unlocking…" state so an offline boot recovers
// as soon as the network is back.
electron_1.ipcMain.handle('cloud:auto-unlock', async () => {
    const changed = await cloudKeys.autoUnlockManaged();
    if (changed)
        emitCloudStatusChanged();
    return { ok: true };
});
// Best-effort re-read of the account's encryption mode (the Cloud panel calls
// it on open): an unlocked device never re-asks the server, so a switch made on
// another device would otherwise go unnoticed here. Never throws.
electron_1.ipcMain.handle('cloud:refresh-keys-mode', async () => {
    const changed = await cloudKeys.refreshKeysMode();
    if (changed)
        emitCloudStatusChanged();
    return { changed };
});
// passphrase or recovery code → unlocks the key session. Pending journaled
// pushes drain in the sync cycle that the Realtime join triggers (the status
// broadcast starts the subscription — syncCloudRealtimeState), or on the
// next autosync tick at the latest.
electron_1.ipcMain.handle('cloud:unlock', async (_event, secret) => {
    const res = await cloudKeys.unlockCloudKeys(secret);
    emitCloudStatusChanged();
    return res;
});
electron_1.ipcMain.handle('cloud:lock', () => {
    cloudKeys.lockCloudKeys();
    emitCloudStatusChanged();
    return { ok: true };
});
// Dismisses the "kept as conflict copies" notice of the titlebar sync card —
// both backends' (session-only state in cloudSync / githubSync; the copies
// themselves stay as notes). The card shows the active backend's notice.
electron_1.ipcMain.handle('sync:dismiss-conflict-copies', () => {
    cloudSync.dismissConflictCopies();
    githubSync.dismissConflictCopies();
    emitCloudStatusChanged();
    emitSyncStatusChanged();
    return { ok: true };
});
// Enabling Cloud takes over from GitHub Sync (mutually exclusive — see
// syncProvider.ts): the GitHub autosync stands down and the cloud autosync
// (Realtime + safety-net loop) starts, kicking an initial pull (which flushes
// local changes after). Used by the cloud:enable IPC below — the user enables
// Cloud by hand from an unlocked panel, so the DEK is there and pulling right
// away is correct. applyAccountTransition (the automatic activation on sign-in
// and on subscribe) deliberately does NOT use it: it calls enableCloudSync +
// startCloudAutoSync + runCloudSyncCycle WITHOUT an initial pull, because the
// DEK may be null at that point (a pull would only set "Cloud keys are locked")
// and runCloudSyncCycle unlocks first. Don't unify the two.
function enableCloudSyncWithInitialPull() {
    const res = cloudSync.enableCloudSync();
    if (res.ok) {
        startCloudAutoSync();
        cloudSync
            .pullNotes(NOTES_DIR)
            .then((result) => {
            broadcastPullResult(result, 'cloud');
            emitCloudStatusChanged();
        })
            .catch((err) => console.error('[Cloud] initial pull failed:', String(err)));
    }
    return res;
}
electron_1.ipcMain.handle('cloud:enable', () => {
    const res = enableCloudSyncWithInitialPull();
    dropRestoreSurface('cloud');
    emitCloudStatusChanged();
    return res;
});
electron_1.ipcMain.handle('cloud:disable', () => {
    const res = cloudSync.disableCloudSync();
    stopCloudAutoSync();
    dropRestoreSurface('cloud');
    emitCloudStatusChanged();
    return res;
});
// Manual Cloud sync (shared by cloud:pull and sync:pull-active): a FULL cycle
// through the same single-flight runner as the autosync — pull (+ the manual
// notes broadcast) then drain the journal — so edits whose push failed offline
// go up on the click instead of waiting for the next 5-min tick. Clicked while
// a cycle runs, it waits for a fresh one queued after it. Returns the pull
// result (empty when the cycle stood down: Cloud just disabled, or writes
// still in flight after the settle timeout — the status then shows them as
// pending changes).
async function cloudManualSync() {
    const result = await cloudSyncCycle.run({ manual: true });
    // Nothing was synced: the notes dir came from another account — the user
    // has to choose first (the cycle stood down at the origin gate).
    if (cloudSync.getCloudOriginChoice())
        return { ...(result ?? emptyPullResult()), error: 'origin-choice-pending' };
    return result ?? emptyPullResult();
}
// Manual sync (same broadcast contract as sync:pull).
electron_1.ipcMain.handle('cloud:pull', async () => cloudManualSync());
// Per-section version history (electron/cloudVersions.ts). Never throw: every
// failure is { ok: false, errorCode }. Restoring a version has no IPC on
// purpose — the renderer saves the old text as a normal edit, and the server
// trigger keeps the content it replaces as one more version.
electron_1.ipcMain.handle('cloud:versions-list', (_event, target) => cloudVersions.listSectionVersions(NOTES_DIR, target));
electron_1.ipcMain.handle('cloud:versions-get', (_event, target, id) => cloudVersions.getSectionVersion(NOTES_DIR, target, id));
// Before a restore: keeps the section's CURRENT content as one more version
// (lands its pending Cloud upload first, then RPC cloud_snapshot_file). Never
// throws; failures are { ok: false, errorCode } and the renderer asks before
// replacing anything.
electron_1.ipcMain.handle('cloud:versions-snapshot', (_event, target) => cloudVersions.snapshotSectionVersion(NOTES_DIR, target));
// ── Settings (userData/settings.json) ────────────────────────────────────────
function readSettings() {
    try {
        return JSON.parse(fs_1.default.readFileSync(path_1.default.join(electron_1.app.getPath('userData'), 'settings.json'), 'utf-8'));
    }
    catch {
        return {};
    }
}
function writeSettings(data) {
    (0, settingsFile_1.writeSettingsFile)(path_1.default.join(electron_1.app.getPath('userData'), 'settings.json'), data); // owner-only (0600) on POSIX
}
// ── First-run welcome note (welcomeNote.ts) ──────────────────────────────────
/** One listing of the notes dir: any note folder or loose `.md`? Unreadable → true (never create in it). */
function notesDirHasNotesOnce() {
    try {
        return fs_1.default.readdirSync(NOTES_DIR, { withFileTypes: true }).some((e) => e.isDirectory()
            ? fs_1.default.existsSync(path_1.default.join(NOTES_DIR, e.name, noteFormat.NOTE_MD))
            : e.name.toLowerCase().endsWith('.md'));
    }
    catch {
        return true;
    }
}
/**
 * Whether the notes dir holds any note. Same retry as fs:read-all-notes: on
 * Windows readdirSync can return [] without throwing while the filesystem isn't
 * ready (boot, wake from sleep). Skipped when this start created the dir (it is
 * empty for sure — a real first install pays no delay).
 */
async function notesDirHasNotes() {
    const attempts = NOTES_DIR_CREATED_AT_STARTUP ? 1 : 6;
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0)
            await new Promise((r) => setTimeout(r, 800));
        if (notesDirHasNotesOnce())
            return true;
    }
    return false;
}
/**
 * Creates the local-only welcome note on a real first run and records the
 * decision (`welcomeNoteSeeded`) in settings.json either way — see
 * welcomeNote.ts. Called at startup after the format migration, before the
 * initial pull and the watcher. A fresh install is told apart by settings.json
 * NOT EXISTING yet (nothing writes it before this point of the startup): an
 * install that already has one is an existing user updating → never created.
 * A settings.json that exists but can't be parsed is left alone (writing it back
 * would wipe it); the decision waits for a start where it reads fine.
 */
async function seedWelcomeNoteIfFirstRun() {
    let settings = {};
    let settingsExisted = true;
    try {
        settings = JSON.parse(fs_1.default.readFileSync(path_1.default.join(electron_1.app.getPath('userData'), 'settings.json'), 'utf-8'));
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            return;
        settingsExisted = false;
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
        return;
    const current = settings;
    const alreadySeeded = current[welcomeNote_1.WELCOME_SEEDED_KEY] === true;
    if (alreadySeeded)
        return;
    const decision = (0, welcomeNote_1.planWelcomeNote)({
        alreadySeeded,
        settingsExisted,
        // Only listed when it can change the answer (a fresh settings.json).
        hasNotes: settingsExisted ? true : await notesDirHasNotes(),
        syncConfigured: (0, welcomeNote_1.isSyncConfigured)(current),
    });
    if (decision === 'skip')
        return;
    if (decision === 'create') {
        const newId = (chars) => (0, crypto_1.randomBytes)(Math.ceil(chars / 2)).toString('hex').slice(0, chars);
        const note = (0, welcomeNote_1.buildWelcomeNote)(currentTrayLang(), process.platform, new Date().toISOString(), newId);
        const dirPath = path_1.default.join(NOTES_DIR, noteFormat.noteDirname(note.id, note.title));
        try {
            const { files } = noteFormat.serializeNoteFolder(note, { preserveUpdated: true });
            fs_1.default.mkdirSync(dirPath, { recursive: true });
            // note.md first, like applyNoteWrite: an interrupted write leaves a consistent anchor.
            fs_1.default.writeFileSync(path_1.default.join(dirPath, noteFormat.NOTE_MD), files[noteFormat.NOTE_MD], 'utf-8');
            for (const [file, content] of Object.entries(files)) {
                if (file !== noteFormat.NOTE_MD)
                    fs_1.default.writeFileSync(path_1.default.join(dirPath, file), content, 'utf-8');
            }
        }
        catch (err) {
            console.error('[Welcome] could not create the welcome note:', String(err));
            try {
                fs_1.default.rmSync(dirPath, { recursive: true, force: true });
            }
            catch { /* ignore */ }
            return; // not recorded: retried on the next start
        }
    }
    writeSettings({ ...readSettings(), [welcomeNote_1.WELCOME_SEEDED_KEY]: true });
}
// ── AI / Semantic index ───────────────────────────────────────────────────────
function readAiSettings() {
    const raw = (readSettings().ai ?? {});
    return { ...aiIndex.DEFAULT_AI_SETTINGS, ...raw };
}
function writeAiSettings(next) {
    const settings = readSettings();
    settings.ai = next;
    writeSettings(settings);
}
function emitAiState(state) {
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:index-state', state));
}
function emitAiProgress(progress) {
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:reindex-progress', progress));
}
function emitAiStale(info) {
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:index-stale', info));
}
electron_1.ipcMain.handle('ai:get-settings', () => readAiSettings());
electron_1.ipcMain.handle('ai:set-settings', async (_event, patch) => {
    const prev = readAiSettings();
    const next = { ...prev, ...patch };
    try {
        await aiIndex.applySettings(next);
        writeAiSettings(next); // persist only once activation/teardown actually succeeded
        return next;
    }
    catch (err) {
        // Activation failed (e.g. model download/load error). Roll the in-memory settings back so a
        // retry re-triggers activation instead of silently no-op'ing (a persisted enabled:true would
        // make applySettings skip the load+reindex). Surface the error to the renderer.
        aiIndex.primeSettings(prev);
        throw err;
    }
});
electron_1.ipcMain.handle('ai:related', (_event, noteId, sectionId, k) => aiIndex.related(noteId, sectionId, k));
electron_1.ipcMain.handle('ai:search', (_event, query, k) => aiIndex.search(query, k));
electron_1.ipcMain.handle('ai:graph', () => aiIndex.graph());
electron_1.ipcMain.handle('ai:reindex-all', () => aiIndex.reindexAll());
electron_1.ipcMain.handle('ai:get-stale', () => aiIndex.getStale());
// ── LLM provider (chat / second brain) ─────────────────────────────────────────
// The provider runs here in main; the API key lives encrypted in settings.aiLlm and never
// reaches the renderer. RAG retrieval reuses the local index (aiIndex.search/graph).
function readLlmSettings() {
    const raw = (readSettings().aiLlm ?? {});
    return { ...llm.DEFAULT_LLM_CONFIG, ...raw };
}
function writeLlmSettings(next) {
    const settings = readSettings();
    settings.aiLlm = next;
    writeSettings(settings);
}
// `preset` (optional): read that preset's OWN config instead of the active one — Settings → AI
// shows every source's fields before it is activated (llm.toPublicFor). An unknown id falls
// back to the active config. Without it, the behaviour is unchanged.
electron_1.ipcMain.handle('ai:llm-get-config', (_event, preset) => {
    const cfg = readLlmSettings();
    return llm.isKnownPreset(preset) ? llm.toPublicFor(cfg, preset) : llm.toPublic(cfg);
});
// The managed preset carries the EFFECTIVE model catalog (cached from the proxy, else
// the backup constants) — see refreshManagedCatalog below. The renderer asks for the
// presets whenever the assistant or Settings → AI loads, so that is also when a stale
// catalog gets refreshed (throttled, in the background: a change arrives by event).
electron_1.ipcMain.handle('ai:llm-presets', () => {
    if ((0, entitlementsRetry_1.isManagedAiUsable)(account.getAccountStatus()))
        void refreshManagedCatalog();
    return llm.listPresets();
});
// ── NoteFlow AI model catalog ──────────────────────────────────────────────────
// The managed plan's catalog is served by the proxy (GET /models, from the Supabase
// table ai_models) and cached in settings.aiManagedCatalog, so models added server-side
// appear without an app release and the picker works offline / across restarts.
// Refreshed in the background whenever the managed plan is usable — account status
// changes (sign-in, boot, entitlements) and every ai:llm-presets read (assistant /
// Settings → AI opening), throttled to MANAGED_CATALOG_MIN_INTERVAL_MS after a success —
// and forced by the panel's "Load" button and by a chat 400 `model_not_allowed` (a model
// retired server-side, see friendlyChatError). Contract (electron/ai/llm/managedCatalog.ts):
// never touches the user's stored model, and a failed download or an unusable body never
// replaces the good cache.
const MANAGED_CATALOG_MIN_INTERVAL_MS = 10 * 60000;
let managedCatalogRefresh = null;
let managedCatalogFetchedAt = 0;
/** Seeds the in-memory catalog from settings.json (boot). An unusable stored value is
 *  ignored (the backup constants apply until the next successful download). */
function loadManagedCatalogCache() {
    llm.setCachedManagedCatalog(llm.parseStoredManagedCatalog(readSettings().aiManagedCatalog));
}
function refreshManagedCatalog(force = false) {
    if (managedCatalogRefresh)
        return managedCatalogRefresh;
    if (!force && Date.now() - managedCatalogFetchedAt < MANAGED_CATALOG_MIN_INTERVAL_MS) {
        return Promise.resolve({ ok: true });
    }
    managedCatalogRefresh = runManagedCatalogRefresh().finally(() => {
        managedCatalogRefresh = null;
    });
    return managedCatalogRefresh;
}
async function runManagedCatalogRefresh() {
    try {
        const fetched = await llm.fetchManagedCatalog(mainMessages().chatErrors);
        managedCatalogFetchedAt = Date.now();
        if (!fetched) {
            // The proxy answered, but not with a usable catalog (corrupt, empty, or a proxy
            // too old to send the metadata): keep whatever is in force.
            console.warn('[LLM] NoteFlow AI sent no usable model catalog — keeping the current one');
            return { ok: true };
        }
        const before = llm.effectiveManagedCatalog();
        if (!llm.sameManagedCatalog(fetched, llm.getCachedManagedCatalog())) {
            const settings = readSettings();
            settings.aiManagedCatalog = llm.toStoredManagedCatalog(fetched);
            writeSettings(settings);
            llm.setCachedManagedCatalog(fetched);
        }
        // Only the presets change (settings.aiLlm is never touched): the renderer re-pulls
        // presets + config, so the picker, the quota suffixes and the vision flag follow.
        if (!llm.sameManagedCatalog(before, fetched)) {
            electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:llm-presets-changed'));
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
electron_1.ipcMain.handle('ai:llm-set-config', (_event, patch) => {
    let cfg = readLlmSettings();
    // `preset` given: the field edits go to THAT preset (Settings → AI edits a source before
    // activating it). It never switches the active provider — `active` is ignored on this path,
    // and neither the BYO memory (withActiveProvider) nor a pending restore (dropRestoreSurface)
    // is touched. An unknown id is refused outright rather than mapped through presetOf's fallback.
    if (patch.preset !== undefined) {
        if (!llm.isKnownPreset(patch.preset)) {
            console.warn(`[LLM] ignored an edit for unknown preset "${String(patch.preset)}"`);
            return llm.toPublic(cfg);
        }
        cfg = llm.withPresetFields(cfg, patch.preset, patch);
        writeLlmSettings(cfg);
        return llm.toPublicFor(cfg, patch.preset);
    }
    // withActiveProvider remembers the BYO provider being left behind when the
    // managed plan takes over — a later sign-out reverts to it. Picking a provider
    // by hand is also an explicit decision that overrules a pending restore.
    if (patch.active !== undefined) {
        cfg = llm.withActiveProvider(cfg, patch.active);
        dropRestoreSurface('ai');
    }
    // Without `preset`, field edits apply to the ACTIVE preset (each provider keeps its own
    // key/model/baseUrl). withPresetFields drops a model outside a curated catalog and a base
    // URL on a pinned preset (see llm.acceptsModel / llm.acceptsBaseUrl).
    cfg = llm.withPresetFields(cfg, cfg.active, patch);
    writeLlmSettings(cfg);
    return llm.toPublic(cfg);
});
/** Config to list models of / test: the active one, or — with a known `preset` id — that
 *  preset's own config seen as active (in memory only, never persisted). */
function llmConfigFor(preset) {
    const cfg = readLlmSettings();
    return llm.isKnownPreset(preset) ? llm.asActivePreset(cfg, preset) : cfg;
}
electron_1.ipcMain.handle('ai:llm-list-models', async (_event, preset) => {
    const cfg = llmConfigFor(preset);
    // NoteFlow AI: "Load" re-downloads the catalog (forced) and answers with the effective
    // one — on a failure the cached catalog stays in force and only the error is reported.
    if (cfg.active === 'noteflow') {
        const res = await refreshManagedCatalog(true);
        return res.ok
            ? { ok: true, models: [...llm.effectiveManagedCatalog().models] }
            : { ok: false, models: [], error: res.error };
    }
    try {
        const models = await llm.getProvider(await llm.resolveConfigAsync(cfg, mainMessages().chatErrors)).listModels();
        return { ok: true, models };
    }
    catch (err) {
        return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) };
    }
});
electron_1.ipcMain.handle('ai:llm-test', async (_event, preset) => {
    try {
        // resolveConfigAsync throws for the NoteFlow AI preset without a signed-in
        // session — surface that through the same {ok, error} contract as test().
        return await llm.getProvider(await llm.resolveConfigAsync(llmConfigFor(preset), mainMessages().chatErrors)).test();
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
});
// Monthly consumption of the managed NoteFlow AI plan, read from the proxy's GET /usage
// endpoint with a fresh access token. The proxy meters a USD budget but reports it in
// abstract units (limit 3,000,000 — the old token-quota scale, kept for pre-b74fad0 builds), so only
// used/limit (the share of the allowance spent) is meaningful. `autocomplete` is the part
// of that allowance inline autocomplete may spend (its own used/limit); a proxy that
// doesn't send it yet leaves the field out (unknown). Returns
// null on ANY failure (no session, offline, non-200) — the UI simply hides the
// usage bar, it never surfaces an error for this.
electron_1.ipcMain.handle('ai:llm-usage', async () => {
    try {
        const token = await account.getAccessToken();
        if (!token)
            return null;
        const res = await fetch(`${cloudConfig_1.AI_PROXY_URL}/usage`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok)
            return null;
        const body = (await res.json().catch(() => null));
        if (!body || typeof body.used !== 'number' || typeof body.limit !== 'number')
            return null;
        const autocomplete = aiAutocomplete.parseAutocompleteUsage(body.autocomplete);
        return { used: body.used, limit: body.limit, ...(autocomplete ? { autocomplete } : {}) };
    }
    catch {
        return null;
    }
});
// ── Chat (streaming over IPC events) ───────────────────────────────────────────
const CHAT_SYSTEM_BASE = "You are NoteFlow's assistant — a second brain over the user's personal notes. " +
    "Answer directly and concisely, in the same language the user writes in. " +
    'When context from the notes is provided, ground your answer in it and avoid inventing facts; ' +
    "if the notes don't contain the answer, say so plainly.\n\n" +
    'You can also ACT on the notes through the provided tools (create/edit/organize/delete notes, ' +
    'sections, groups and folders). Only act when the user clearly asks you to; otherwise just answer. ' +
    'Never invent ids — call list_notes / list_groups (or search_notes) first to discover the real ids ' +
    'you need. Ids are stable and never change, so if a tool reports a note/section as not found, the id ' +
    'is stale or mistyped: do not retry it verbatim — re-run list_notes and use the freshly returned id. ' +
    'When acting on several notes, fetch their ids right before you act on them (especially after creating, ' +
    'moving or renaming anything) and copy each id exactly. After acting, briefly tell the user what you did. ' +
    'Deletions require user confirmation, which the app handles automatically.\n\n' +
    "When the context includes the user's profile or personality notes (including any \"soft signals\" / " +
    'raw favourites), use them only as BACKGROUND to tailor your tone and suggestions. Never cite where ' +
    'a preference comes from or name-drop the user\'s favourite song/film/book in an unrelated answer ' +
    '(do not say "since you like X…"). Make recommendations directly.\n\n' +
    'NEXT-ACTION SUGGESTIONS. At the very end of your FINAL answer (never in an intermediate turn that ' +
    'still calls tools), if there are genuinely useful follow-ups, append the literal marker ' +
    '"<!--SUGGESTIONS-->" on its own line, then 1 or 2 short, actionable next things the user might want ' +
    'to ask, one per line prefixed with "- ". Phrase each as a brief imperative from the USER\'s point of ' +
    'view, in the same language as your answer. Keep each suggestion VERY short so it fits on a small button: ' +
    'aim for 2-5 words, 6 words maximum, no trailing period (e.g. "- Reorganize into sections", "- Add a ' +
    'summary"). Keep them concrete and grounded in this conversation. If nothing useful applies, omit the ' +
    'marker entirely. Never mention the marker or these suggestions in the visible part of your answer.';
const chatAborts = new Map();
function stripBase64(text) {
    return (0, drawingText_1.collapseDrawings)(text, 'marker').replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[image]');
}
function findNoteDirPath(noteId, dirs) {
    const match = dirs.find((d) => d.endsWith('-' + noteId));
    return match ? path_1.default.join(NOTES_DIR, match) : null;
}
/** Load the user's "second brain" profile note as a background block for the chat system prompt.
 *  Unlike RAG context this is injected on EVERY question (regardless of semantic relevance) so the
 *  assistant always knows the user's tone/style/criteria. Read straight from disk by its stable id
 *  (settings.aiProfile.noteId), so it does not depend on the embeddings index being enabled.
 *  Returns null when there is no profile, it is missing or it is encrypted. Never produces a
 *  `source`: the profile is invisible background, must not be cited or illuminated in the brain. */
function buildProfileBlock(dirs) {
    const profile = (readSettings().aiProfile ?? {});
    const noteId = profile.noteId;
    if (!noteId)
        return null;
    const dirPath = findNoteDirPath(noteId, dirs);
    if (!dirPath)
        return null;
    const note = noteFormat.parseNoteDir(dirPath);
    if (!note || note.encryption || note.sections.length === 0)
        return null;
    // Same defence-in-depth as pushSection: AI-hidden sections never feed the chat context.
    const visible = note.sections.filter((s) => !s.aiHidden);
    if (visible.length === 0)
        return null;
    // The profile is a short, abstract note, so include ALL visible sections (each with its name),
    // capping per-section content like the RAG blocks (1500 chars) to keep token use bounded.
    const parts = [];
    for (const section of visible) {
        const text = stripBase64(section.content).trim().slice(0, 1500);
        if (text)
            parts.push(`### ${section.name}\n${text}`);
    }
    if (parts.length === 0)
        return null;
    return { block: parts.join('\n\n'), noteId };
}
/** Append the profile background (if any) to a system prompt. */
function withProfile(system, profile) {
    if (!profile)
        return system;
    return `${system}\n\nUser profile (background — tone & preferences, do not cite):\n\n${profile.block}`;
}
/** A note read from disk by id, with its directory name (null when missing). Same dir match as
 *  the agent tools (`<slug>-<id>` or a bare id). */
function readDiskNote(noteId, dirs) {
    const dir = (dirs ?? noteFormat.listNoteDirs(NOTES_DIR)).find((d) => d.endsWith('-' + noteId) || d === noteId);
    if (!dir)
        return null;
    const note = noteFormat.parseNoteDir(path_1.default.join(NOTES_DIR, dir));
    return note ? { dir, note } : null;
}
/** Any note by id for the chat context: a note folder, or a linked note (external .md, one
 *  section). Undo never uses this — linked notes are edited in place, without chat undo. */
function readAnyNote(noteId, dirs) {
    if ((0, linkedNotesLogic_1.isLinkedNoteId)(noteId))
        return linkedToolApi().get(noteId);
    return readDiskNote(noteId, dirs)?.note ?? null;
}
/** Semantic-search (RAG) blocks for a question: hybrid search hits + a few content-edge
 *  neighbours, read from disk. `skip` leaves out sections already in the prompt. */
async function buildRagBlocks(query, profile, dirs, skip) {
    if (!query.trim() || !aiIndex.isEnabled())
        return { blocks: [], sources: [] };
    let hits = [];
    try {
        hits = await aiIndex.search(query, 6);
    }
    catch {
        hits = [];
    }
    if (hits.length === 0)
        return { blocks: [], sources: [] };
    // Expand with up to a few content-edge neighbours of the matched notes.
    const hitNoteIds = new Set(hits.map((h) => h.noteId));
    const neighbours = new Set();
    try {
        for (const e of await aiIndex.graph()) {
            if (hitNoteIds.has(e.a) && !hitNoteIds.has(e.b))
                neighbours.add(e.b);
            if (hitNoteIds.has(e.b) && !hitNoteIds.has(e.a))
                neighbours.add(e.a);
        }
    }
    catch { /* edges are best-effort */ }
    const sources = [];
    const blocks = [];
    const seen = new Set(); // noteId:sectionId
    const pushSection = (noteId, preferredSectionId) => {
        // The profile note is injected whole as background; skip it in RAG to avoid duplicate
        // content and to keep it out of the cited `sources`.
        if (profile && noteId === profile.noteId)
            return;
        const note = readAnyNote(noteId, dirs);
        if (!note || note.encryption || note.sections.length === 0)
            return;
        // Sections hidden from the AI never feed the chat context (defence in depth: hidden
        // sections are already kept out of the index, but a neighbour fallback could reach one).
        const visible = note.sections.filter((s) => !s.aiHidden);
        if (visible.length === 0)
            return;
        const section = visible.find((s) => s.id === preferredSectionId) ?? visible[0];
        const key = `${noteId}:${section.id}`;
        if (seen.has(key) || skip?.(noteId, section.id))
            return;
        seen.add(key);
        const text = stripBase64(section.content).trim().slice(0, 1500);
        if (!text)
            return;
        blocks.push(`### ${note.title || 'Untitled'} › ${section.name}\n${text}`);
        sources.push({ noteId, sectionId: section.id, title: note.title || 'Untitled' });
    };
    for (const h of hits)
        pushSection(h.noteId, h.sectionId);
    for (const id of [...neighbours].slice(0, 3))
        pushSection(id);
    return { blocks, sources };
}
/** How the explicit context of the editor sidebar / chat window works, for the system prompt. */
function chatContextGuide(allNotes) {
    const scope = allNotes
        ? aiIndex.isEnabled()
            ? 'The user also enabled "all notes": passages found by semantic search over every note are included below when relevant.'
            : 'The user enabled "all notes", but semantic search is unavailable (the local AI index is off): look other notes up with the tools (list_notes, get_note) when needed.'
        : 'Only what is listed below is shared — no search over the rest of the notes was done. If you need other notes, look them up with the tools (list_notes, search_notes, get_note).';
    return ('CONTEXT IN THIS CHAT. The user chooses which notes and sections to share with you here; the ' +
        `profile (if any) is always included as background. ${scope}\n` +
        'Every shared note/section carries its note_id / section_id: use them directly with the tools to ' +
        'edit (update_section, add_section, rename_section, update_note) — no need to list or fetch them first. ' +
        'When the user asks you to change the open note or a shared section, just do it with the tools, without ' +
        'asking for confirmation, then briefly say what you changed: the editor shows your edits live and the ' +
        'user can undo each one from the chat. update_section REPLACES the whole section: send its complete new ' +
        'content and keep everything the user did not ask to change (images appear as [image] placeholders and ' +
        'hand-made drawings as a `[drawing #n: …]` line — keep them where they are; the app restores them, and ' +
        'you cannot modify nor delete such a drawing). ' + agentTools.DRAWING_HOWTO + ' Never rewrite a section marked as truncated with ' +
        'update_section (the part you cannot see would be lost): add a section or tell the user instead.');
}
/** Build the chat context for a question. Returns the augmented system prompt + the source notes
 *  (for citation + brain illumination). The user's profile note is always injected as background.
 *  - No `context` (the brain chat): RAG over every note, as always.
 *  - With `context` (editor sidebar / chat window): the notes/sections the user shared, read from
 *    disk, plus a line about the note open in the editor; RAG ONLY when `allNotes` is on. */
async function buildChatContext(query, context) {
    const dirs = noteFormat.listNoteDirs(NOTES_DIR);
    const profile = buildProfileBlock(dirs);
    if (!context) {
        const { blocks, sources } = await buildRagBlocks(query, profile, dirs);
        if (blocks.length === 0)
            return { system: withProfile(CHAT_SYSTEM_BASE, profile), sources: [] };
        const ragSystem = `${CHAT_SYSTEM_BASE}\n\nContext from the user's notes:\n\n${blocks.join('\n\n---\n\n')}`;
        return { system: withProfile(ragSystem, profile), sources };
    }
    const read = (noteId) => readAnyNote(noteId, dirs);
    const explicit = chatContext.buildContextBlocks(context.items, read);
    const wholeNotes = new Set(explicit.included.filter((i) => !i.sectionId).map((i) => i.noteId));
    const sharedSections = new Set(explicit.included.filter((i) => i.sectionId).map((i) => `${i.noteId}:${i.sectionId}`));
    const rag = context.allNotes
        ? await buildRagBlocks(query, profile, dirs, (noteId, sectionId) => wholeNotes.has(noteId) || sharedSections.has(`${noteId}:${sectionId}`))
        : { blocks: [], sources: [] };
    let system = `${CHAT_SYSTEM_BASE}\n\n${chatContextGuide(context.allNotes)}`;
    const openLine = chatContext.describeOpenNote(context.openNote, read);
    if (openLine)
        system += `\n\n${openLine}`;
    system += explicit.blocks.length
        ? `\n\nNotes and sections the user shared with this chat:\n\n${explicit.blocks.join('\n\n---\n\n')}`
        : '\n\nThe user shared no specific notes or sections with this chat.';
    if (rag.blocks.length)
        system += `\n\nRelated passages from the user's notes (semantic search):\n\n${rag.blocks.join('\n\n---\n\n')}`;
    return { system: withProfile(system, profile), sources: rag.sources };
}
// Pending destructive-tool confirmations, keyed by toolCallId — resolved by `ai:chat-confirm`.
const chatConfirms = new Map();
function readJsonArray(file) {
    try {
        const data = JSON.parse(fs_1.default.readFileSync(file, 'utf-8'));
        return Array.isArray(data) ? data : [];
    }
    catch {
        return [];
    }
}
/** Wire the agentic tool executor to main's write primitives. Tool writes pass no senderId,
 *  so every window (including the chat's) refreshes from the broadcast. */
function buildToolContext() {
    return {
        notesDir: NOTES_DIR,
        writeNote: (payload) => applyNoteWrite(payload, undefined, { durablePush: true }),
        deleteNoteDir: (dir) => applyNoteDelete(dir),
        readGroups: () => readJsonArray(GROUPS_FILE),
        writeGroups: (groups) => applyGroupsSet(groups, undefined, { durablePush: true }),
        readFolders: () => readJsonArray(FOLDERS_FILE),
        writeFolders: (folders) => applyFoldersSet(folders, undefined, { durablePush: true }),
        search: aiIndex.isEnabled() ? (q, k) => aiIndex.search(q, k) : undefined,
        onNoteEdited: (noteId) => recordNoteEdit(noteId),
        linked: linkedToolApi(),
    };
}
const MAX_AGENT_STEPS = 12;
// ── Undo of the agent's note edits (pure logic in ai/chatUndo.ts) ───────────────
// Snapshot of the note before/after each note-modifying tool call, keyed by toolCallId. In
// memory only: an app restart drops them (and `ai:chats-load` strips the stale "Undo" flags).
const chatUndoStore = chatUndo.createUndoStore();
// ── Flush of the main window's pending editor saves ─────────────────────────────
// The editors debounce their writes (lib/pendingEdits), so before a chat turn (or an undo)
// reads a note from disk, the main window is asked to write what's pending and answer back.
// Bounded: a renderer that doesn't answer (reloading, hung) only delays the turn.
const flushEditWaiters = new Map();
function flushMainWindowEdits(timeoutMs = 1500) {
    const win = mainWindow;
    if (!win || win.isDestroyed())
        return Promise.resolve();
    const token = (0, crypto_1.randomBytes)(8).toString('hex');
    return new Promise((resolve) => {
        const done = () => { clearTimeout(timer); flushEditWaiters.delete(token); resolve(); };
        const timer = setTimeout(done, timeoutMs);
        flushEditWaiters.set(token, done);
        win.webContents.send('ai:flush-edits', token);
    });
}
electron_1.ipcMain.on('ai:flush-edits-done', (_event, token) => {
    if (typeof token === 'string')
        flushEditWaiters.get(token)?.();
});
electron_1.ipcMain.handle('ai:chat', async (event, req) => {
    const { requestId, messages } = req;
    const sender = event.sender;
    const send = (channel, payload) => { if (!sender.isDestroyed())
        sender.send(channel, payload); };
    const stored = readLlmSettings();
    const pub = llm.toPublic(stored);
    if (!pub.configured) {
        send('ai:chat-error', { requestId, error: llm.notConfiguredMessage(stored) });
        return;
    }
    const caps = pub.capabilities;
    const controller = new AbortController();
    chatAborts.set(requestId, controller);
    const myConfirmIds = new Set();
    let sentImages = false; // tracked here so the catch can tailor the error message
    try {
        // Notes are read from disk below (context + tools): land the editor's pending keystrokes first.
        await flushMainWindowEdits();
        const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
        // `context` only comes from the editor sidebar / chat window; without it → brain chat (RAG).
        const { system, sources } = await buildChatContext(lastUser, req.context === undefined ? null : chatContext.sanitizeContextRequest(req.context));
        if (sources.length > 0)
            send('ai:chat-sources', { requestId, sources });
        const provider = llm.getProvider(await llm.resolveConfigAsync(stored, mainMessages().chatErrors));
        const ctx = buildToolContext();
        // Seed the agentic conversation from the renderer's messages, resolving each user message's
        // attachment ids from the in-main cache: text/code files inline into the text, pdf/image go native.
        const convo = [];
        for (const m of messages) {
            if (m.role === 'system')
                continue;
            if (m.role === 'assistant') {
                convo.push({ role: 'assistant', content: m.content });
                continue;
            }
            let content = m.content;
            const attachments = [];
            for (const id of m.attachmentIds ?? []) {
                const f = chatFiles.get(id);
                if (!f)
                    continue;
                if (f.kind === 'text' && f.text)
                    content += `\n\n## File: ${f.name}\n${f.text}`;
                else if (f.data && ((f.kind === 'pdf' && caps.pdf) || (f.kind === 'image' && caps.images))) {
                    attachments.push({ kind: f.kind, mediaType: f.mediaType, data: f.data });
                    if (f.kind === 'image')
                        sentImages = true;
                }
            }
            convo.push(attachments.length ? { role: 'user', content, attachments } : { role: 'user', content });
        }
        for (let step = 0; step < MAX_AGENT_STEPS; step++) {
            const { text, toolCalls, reasoningDetails } = await provider.streamTurn({ system, messages: convo, tools: agentTools.TOOLS, signal: controller.signal }, (delta) => send('ai:chat-delta', { requestId, delta }));
            if (toolCalls.length === 0) {
                send('ai:chat-done', { requestId });
                return;
            }
            // The reasoning behind these tool calls goes back with them (OpenRouter recommends it, and
            // DeepSeek / Anthropic thinking reject a tool turn without it). Only when some was streamed:
            // strict OpenAI-compatible APIs must never see the extra field.
            convo.push(reasoningDetails?.length
                ? { role: 'assistant', content: text, toolCalls, reasoningDetails }
                : { role: 'assistant', content: text, toolCalls });
            const results = [];
            for (const call of toolCalls) {
                send('ai:chat-tool-call', { requestId, toolCallId: call.id, name: call.name, input: call.input, label: agentTools.describeAction(call.name, call.input, ctx) });
                if (agentTools.DESTRUCTIVE_TOOLS.has(call.name)) {
                    const target = agentTools.describeTarget(call.name, call.input, ctx);
                    send('ai:chat-confirm-request', { requestId, toolCallId: call.id, name: call.name, input: call.input, target });
                    myConfirmIds.add(call.id);
                    const approved = await new Promise((resolve) => {
                        if (controller.signal.aborted)
                            return resolve(false);
                        chatConfirms.set(call.id, resolve);
                        controller.signal.addEventListener('abort', () => resolve(false), { once: true });
                    });
                    chatConfirms.delete(call.id);
                    if (!approved) {
                        send('ai:chat-tool-result', { requestId, toolCallId: call.id, status: 'cancelled', summary: 'Cancelled' });
                        results.push({ toolCallId: call.id, content: 'The user declined this action. Do not retry it.' });
                        continue;
                    }
                }
                // Undo: snapshot the note the tool is about to modify (create_note has none yet).
                const undoable = chatUndo.UNDOABLE_TOOLS.has(call.name);
                const beforeId = undoable ? chatUndo.undoNoteId(call.name, call.input) : null;
                const before = beforeId ? readDiskNote(beforeId) : null;
                const result = await agentTools.executeTool(call.name, call.input, ctx);
                let canUndo = false;
                if (undoable && !result.isError) {
                    const noteId = chatUndo.undoNoteId(call.name, call.input, result.noteId);
                    const after = noteId ? readDiskNote(noteId) : null;
                    // No `after` (note unreadable right after the tool) → no undo: the 3-way merge needs it.
                    const dir = before?.dir ?? after?.dir;
                    if (noteId && after && dir && chatUndo.noteFingerprint(before?.note ?? null) !== chatUndo.noteFingerprint(after.note)) {
                        chatUndoStore.put({ toolCallId: call.id, noteId, dir, before: before?.note ?? null, after: after.note });
                        canUndo = true;
                    }
                }
                send('ai:chat-tool-result', {
                    requestId, toolCallId: call.id, status: result.isError ? 'error' : 'done', summary: result.summary,
                    ...(canUndo ? { undoable: true } : {}),
                });
                results.push({ toolCallId: call.id, content: result.content, isError: result.isError });
            }
            convo.push({ role: 'tool', results });
        }
        // Step budget exhausted — stop gracefully.
        send('ai:chat-done', { requestId });
    }
    catch (err) {
        if (controller.signal.aborted)
            send('ai:chat-done', { requestId, aborted: true });
        else
            send('ai:chat-error', { requestId, error: friendlyChatError(err instanceof Error ? err.message : String(err), sentImages, stored.active === 'noteflow') });
    }
    finally {
        for (const id of myConfirmIds)
            chatConfirms.delete(id);
        chatAborts.delete(requestId);
    }
});
// Undo one note edit of the chat agent: revert only what that tool call changed (3-way merge,
// later edits elsewhere in the note survive), through the regular write/delete primitives
// (broadcast to every window + push + reindex). Without `force`, refuses with 'modified' when a
// part the AI changed was changed again afterwards — the UI then asks the user and retries with
// force. Never runs (even forced) when it would re-create the note folder / a section file the
// tool changed that was deleted since ('conflict': a remote delete may still be queued for it) or
// when the note's encryption changed since ('encryption') — see chatUndo.undoBlock.
electron_1.ipcMain.handle('ai:chat-undo', async (_event, toolCallId, force) => {
    if (typeof toolCallId !== 'string')
        return { ok: false, reason: 'unavailable' };
    const snapshot = chatUndoStore.get(toolCallId);
    if (!snapshot)
        return { ok: false, reason: 'unavailable' };
    try {
        await flushMainWindowEdits();
        const current = readDiskNote(snapshot.noteId)?.note ?? null;
        // Checked before 'modified' (and not overridable by force): no confirmation can make these safe.
        const block = chatUndo.undoBlock(snapshot, current);
        if (block)
            return { ok: false, reason: block === 'gone' ? 'conflict' : 'encryption' };
        if (force !== true && chatUndo.hasUndoConflict(snapshot, current))
            return { ok: false, reason: 'modified' };
        const plan = chatUndo.planUndo(snapshot, current);
        if (plan.kind === 'delete') {
            applyNoteDelete(plan.dir);
        }
        else if (plan.kind === 'write') {
            await applyNoteWrite({ dir: plan.dir, files: plan.files, deleteFiles: plan.deleteFiles }, undefined, { durablePush: true });
            if (current)
                recordNoteEdit(snapshot.noteId);
        }
        chatUndoStore.delete(toolCallId);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, reason: 'error', error: err instanceof Error ? err.message : String(err) };
    }
});
// Turn a raw provider error into something actionable. The common BYO failure is attaching an image
// to a text-only model (e.g. DeepSeek answers HTTP 400 with `unknown variant image_url`); detect that
// and explain it instead of dumping the raw JSON. Everything else passes through unchanged.
function friendlyChatError(raw, sentImages, managed) {
    // NoteFlow AI monthly quota: the proxy answers 429 with the stable machine code
    // `monthly_quota_exceeded` in its OpenAI-shaped body — match on that (not the HTTP
    // status or the English message) and surface a clean, localized message instead of
    // the raw `HTTP 429 — {json}` string.
    if (raw.includes('monthly_quota_exceeded')) {
        return mainMessages().chatErrors.quotaExceeded;
    }
    // NoteFlow AI (managed preset only — for a BYO provider a 401/403 means a bad API key and
    // keeps its raw wording): the proxy's 401 = the session token was rejected, 403 = no active
    // 'ai' plan. See managedProxyErrorKind for how the status is read from the raw message.
    if (managed) {
        const kind = (0, managedErrors_1.managedProxyErrorKind)(raw);
        if (kind === 'signInAgain') {
            // The proxy rejected the session token: drop it so the next request mints a fresh one
            // (or, if the refresh token was revoked too, the refresh's 400 signs out cleanly).
            account.invalidateAccessToken();
            return mainMessages().chatErrors.managedSignInAgain;
        }
        if (kind === 'subscriptionInactive') {
            // Our local view of the plan may be stale (or still unknown) — re-check it so the
            // Settings/AI surfaces catch up. Fire-and-forget: refreshEntitlements never throws.
            void account.refreshEntitlements();
            return mainMessages().chatErrors.managedSubscriptionInactive;
        }
        // The model was retired server-side (ai_models.enabled = false) but our cached catalog
        // still lists it: force a catalog refresh (single-flight, one per failed message — no
        // loop) so effectiveModel falls back in memory and the NEXT message already works.
        if (raw.includes('"model_not_allowed"'))
            void refreshManagedCatalog(true);
    }
    if (sentImages) {
        const low = raw.toLowerCase();
        if (low.includes('image_url') || low.includes('unknown variant') ||
            (low.includes('400') && (low.includes('image') || low.includes('multimodal') || low.includes('vision')))) {
            return "This model can't read images. Pick a vision-capable model, or remove the image and ask in text.";
        }
    }
    return raw;
}
electron_1.ipcMain.on('ai:chat-cancel', (_event, requestId) => {
    chatAborts.get(requestId)?.abort();
});
// ── Inline AI autocomplete (ghost text in the editor) ──────────────────────────
// Only with a usable NoteFlow AI plan, whatever provider the chat uses: the request goes
// straight to the proxy's POST /autocomplete with the account's access token, and the
// SERVER picks prompt + model (electron/ai/autocomplete.ts; context in ai.md). The switch
// is settings.aiAutocomplete.enabled — LOCAL (a per-device privacy choice), off by default.
// The renderer extension (src/components/Editor/AiGhostText.ts) applies the content
// exclusions; this handler re-checks the switch and the plan before anything leaves.
// Keyed by `<webContents id>:<requestId>`: request ids are only unique per window.
const completeAborts = new Map();
/** Windows whose 'destroyed' already aborts their requests in flight. */
const completeSenders = new Set();
/** No requests before this (epoch ms; Infinity = not again this session). See autocompleteBackoffMs. */
let autocompleteBlockedUntil = 0;
/** Identity + plan the block above belongs to: a change drops a timed block. */
let autocompleteAccountKey = '';
const AUTOCOMPLETE_TIMEOUT_MS = 20000;
function readAutocompleteEnabled() {
    return readSettings().aiAutocomplete?.enabled === true;
}
function autocompleteStatus() {
    return { enabled: readAutocompleteEnabled(), available: (0, entitlementsRetry_1.isManagedAiUsable)(account.getAccountStatus()) };
}
function emitAutocompleteStatus() {
    const status = autocompleteStatus();
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:autocomplete-changed', status));
}
/** Account status changed: forget a timed block of the previous identity/plan and tell the windows. */
function handleAutocompleteAccountChange() {
    const status = account.getAccountStatus();
    const key = status.signedIn ? `${status.email ?? ''}|${status.entitlementsKnown ? String(status.entitlements.ai) : '?'}` : '';
    if (key !== autocompleteAccountKey) {
        autocompleteAccountKey = key;
        autocompleteBlockedUntil = aiAutocomplete.blockedUntilAfterAccountChange(autocompleteBlockedUntil);
    }
    emitAutocompleteStatus();
}
electron_1.ipcMain.handle('ai:autocomplete-get', () => autocompleteStatus());
electron_1.ipcMain.handle('ai:autocomplete-set', (_event, enabled) => {
    const settings = readSettings();
    settings.aiAutocomplete = { enabled: enabled === true };
    writeSettings(settings);
    if (enabled !== true)
        completeAborts.forEach((controller) => controller.abort());
    emitAutocompleteStatus();
    return autocompleteStatus();
});
electron_1.ipcMain.handle('ai:complete', async (event, req) => {
    const r = (req ?? {});
    if (typeof r.requestId !== 'string' || typeof r.before !== 'string' || !r.before.trim()) {
        return { ok: false, reason: 'error' };
    }
    const requestId = r.requestId;
    if (!readAutocompleteEnabled())
        return { ok: false, reason: 'disabled' };
    if (!(0, entitlementsRetry_1.isManagedAiUsable)(account.getAccountStatus()))
        return { ok: false, reason: 'unavailable' };
    if (Date.now() < autocompleteBlockedUntil)
        return { ok: false, reason: 'unavailable', retryAt: autocompleteBlockedUntil };
    const sender = event.sender;
    const senderId = sender.id;
    const abortKey = `${senderId}:${requestId}`;
    const controller = new AbortController();
    completeAborts.set(abortKey, controller);
    // A window that goes away takes its requests in flight with it.
    if (!completeSenders.has(senderId)) {
        completeSenders.add(senderId);
        sender.once('destroyed', () => {
            completeSenders.delete(senderId);
            for (const [key, pending] of completeAborts) {
                if (key.startsWith(`${senderId}:`))
                    pending.abort();
            }
        });
    }
    // A timeout is a failure (transient backoff), not a cancellation by the user.
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, AUTOCOMPLETE_TIMEOUT_MS);
    let token = '';
    try {
        const tokenResult = await account.getAccessTokenResult();
        if (!tokenResult.ok)
            throw new aiAutocomplete.AutocompleteRequestError(0, `no_token_${tokenResult.reason}`);
        if (controller.signal.aborted && !timedOut)
            return { ok: false, reason: 'aborted' };
        token = tokenResult.token;
        const text = await aiAutocomplete.completeText({
            baseUrl: cloudConfig_1.AI_PROXY_URL,
            token,
            before: r.before,
            after: typeof r.after === 'string' ? r.after : '',
            // What the note is about (names only; completeText validates and caps them).
            title: r.title,
            section: r.section,
            sections: r.sections,
            signal: controller.signal,
            onPartial: (partial) => {
                if (!controller.signal.aborted && !sender.isDestroyed()) {
                    sender.send('ai:complete-partial', { requestId, text: partial });
                }
            },
        });
        return { ok: true, text };
    }
    catch (err) {
        if (controller.signal.aborted && !timedOut)
            return { ok: false, reason: 'aborted' };
        const failed = err instanceof aiAutocomplete.AutocompleteRequestError;
        const status = failed ? err.status : 0;
        const code = failed ? err.code : '';
        if (status === 401 && token)
            account.invalidateAccessToken(token);
        // Our local view of the plan may be stale — re-check it (never throws), like the chat does.
        if (status === 403)
            void account.refreshEntitlements();
        autocompleteBlockedUntil = aiAutocomplete.blockedUntilAfterFailure(autocompleteBlockedUntil, status, code, Date.now());
        // A proxy without the route yet (404/405) is expected: stay silent about it.
        if (status !== 404 && status !== 405) {
            console.warn(`[Autocomplete] request failed: ${timedOut ? 'timed out' : err instanceof Error ? err.message : String(err)}`);
        }
        return Date.now() < autocompleteBlockedUntil
            ? { ok: false, reason: 'unavailable', retryAt: autocompleteBlockedUntil }
            : { ok: false, reason: 'error' };
    }
    finally {
        clearTimeout(timeout);
        completeAborts.delete(abortKey);
    }
});
electron_1.ipcMain.on('ai:complete-cancel', (event, requestId) => {
    completeAborts.get(`${event.sender.id}:${requestId}`)?.abort();
});
electron_1.ipcMain.on('ai:chat-confirm', (_event, payload) => {
    const resolve = chatConfirms.get(payload?.toolCallId);
    if (resolve) {
        chatConfirms.delete(payload.toolCallId);
        resolve(!!payload.approved);
    }
});
// ── Chat history (userData/ai-chats.json — local, not synced to GitHub) ─────────
function aiChatsPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'ai-chats.json');
}
electron_1.ipcMain.handle('ai:chats-load', () => {
    try {
        const data = JSON.parse(fs_1.default.readFileSync(aiChatsPath(), 'utf-8'));
        // "Undo" buttons only for the edits whose snapshot this app session still holds.
        return Array.isArray(data) ? chatUndo.stripStaleUndo(data, (id) => chatUndoStore.has(id)) : [];
    }
    catch {
        return [];
    }
});
electron_1.ipcMain.handle('ai:chats-save', (_event, sessions) => {
    try {
        fs_1.default.writeFileSync(aiChatsPath(), JSON.stringify(Array.isArray(sessions) ? sessions : []), 'utf-8');
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
});
// ── Activity log (userData/activity-log.json — local, not synced) ───────────────
// Ids of the notes edited each local day on THIS device, for the activity chart in
// Settings → General. Recorded only for user edits (the renderer's store write and
// the chat agent's note edits) — never for sync pulls, imports, migration or
// temp-note expiry. Logic (dedupe, pruning, parsing) is pure in activityLog.ts.
// Writes are debounced and atomic (tmp + rename): the file holds no secrets, so the
// in-place rule for settings.json does not apply here.
const ACTIVITY_LOG_WRITE_DELAY_MS = 2000;
let activityLog = null;
let activityLogDirty = false;
let activityLogTimer = null;
function activityLogPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'activity-log.json');
}
/** Lazy so nothing touches userData before the app is ready. */
function getActivityLog() {
    if (!activityLog) {
        let raw = null;
        try {
            raw = fs_1.default.readFileSync(activityLogPath(), 'utf-8');
        }
        catch {
            raw = null; // missing file — start empty
        }
        activityLog = (0, activityLog_1.parseActivityLog)(raw); // corrupt content also degrades to empty
    }
    return activityLog;
}
function flushActivityLog() {
    if (activityLogTimer) {
        clearTimeout(activityLogTimer);
        activityLogTimer = null;
    }
    if (!activityLogDirty)
        return;
    activityLogDirty = false;
    const file = activityLogPath();
    const tmp = `${file}.tmp`;
    try {
        fs_1.default.writeFileSync(tmp, (0, activityLog_1.serializeActivityLog)(getActivityLog()), 'utf-8');
        fs_1.default.renameSync(tmp, file);
    }
    catch (err) {
        // Never let bookkeeping break a note save — worst case this day's entry is lost.
        console.error('[activity] failed to persist activity-log.json:', String(err));
    }
}
/** Records that the user edited `noteId` today (no-op if already recorded today). */
function recordNoteEdit(noteId) {
    const current = getActivityLog();
    const next = (0, activityLog_1.recordActivityEdit)(current, noteId, Date.now());
    if (next === current)
        return;
    activityLog = next;
    activityLogDirty = true;
    if (!activityLogTimer)
        activityLogTimer = setTimeout(flushActivityLog, ACTIVITY_LOG_WRITE_DELAY_MS);
}
electron_1.ipcMain.on('activity:record-edit', (_event, noteId) => {
    if (typeof noteId === 'string')
        recordNoteEdit(noteId);
});
electron_1.ipcMain.handle('activity:get-log', () => ({ days: (0, activityLog_1.pruneActivityLog)(getActivityLog(), Date.now()).days }));
const profileFiles = new Map();
// Chat attachments live in their own cache so they aren't consumed by profile generation.
// Bytes stay in main (never cross to the renderer) and persist for the app session so follow-up
// questions about the same image/PDF keep working across turns.
const chatFiles = new Map();
const PROFILE_FILE_MAX_BYTES = 10 * 1024 * 1024;
const PROFILE_FILES_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};
// Plain-text & code files we can safely inline verbatim (no parsing/extraction needed). Extension
// list kept broad on purpose: anything whose bytes ARE the text. Binary/structured formats that
// need decoding (docx, xlsx, images, pdf) are NOT here. Used by both the picker filter and classify.
const TEXT_EXTS = [
    'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'log', 'csv', 'tsv', 'tex', 'bib', 'rtf',
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'pyw', 'rb', 'go', 'rs', 'java', 'kt', 'kts',
    'scala', 'swift', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'php', 'pl', 'pm', 'lua',
    'r', 'dart', 'ex', 'exs', 'erl', 'hrl', 'clj', 'cljs', 'hs', 'ml', 'mli', 'fs', 'fsx', 'vb',
    'groovy', 'gradle', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'gql',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro',
    'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties',
    'xml', 'csproj', 'gitignore', 'dockerignore', 'editorconfig', 'diff', 'patch',
];
const TEXT_EXT_SET = new Set(TEXT_EXTS);
function classifyProfileFile(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    if (ext === '.pdf')
        return { kind: 'pdf', mediaType: 'application/pdf' };
    if (PROFILE_IMAGE_TYPES[ext])
        return { kind: 'image', mediaType: PROFILE_IMAGE_TYPES[ext] };
    if (TEXT_EXT_SET.has(ext.replace(/^\./, '')))
        return { kind: 'text', mediaType: 'text/plain' };
    return null;
}
function cacheTotalBytes(cache) {
    let n = 0;
    for (const f of cache.values())
        n += f.sizeBytes;
    return n;
}
// Open a file picker scoped to what the ACTIVE provider can read natively, read the chosen files
// into the given in-main cache, and return only metadata. .txt/.md are inlined; pdf/image kept as base64.
async function pickFilesIntoCache(cache, title) {
    const caps = llm.toPublic(readLlmSettings()).capabilities;
    const exts = [...TEXT_EXTS];
    if (caps.images)
        exts.push('png', 'jpg', 'jpeg', 'gif', 'webp');
    if (caps.pdf)
        exts.push('pdf');
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title,
        filters: [{ name: 'Supported files', extensions: exts }],
        properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || result.filePaths.length === 0)
        return { ok: false, canceled: true };
    const added = [];
    const errors = [];
    let total = cacheTotalBytes(cache);
    for (const fp of result.filePaths) {
        const name = path_1.default.basename(fp);
        const cls = classifyProfileFile(fp);
        if (!cls) {
            errors.push(`${name}: unsupported type`);
            continue;
        }
        if ((cls.kind === 'pdf' && !caps.pdf) || (cls.kind === 'image' && !caps.images)) {
            errors.push(`${name}: not supported by this provider`);
            continue;
        }
        let size = 0;
        try {
            size = fs_1.default.statSync(fp).size;
        }
        catch {
            errors.push(`${name}: cannot read`);
            continue;
        }
        if (size > PROFILE_FILE_MAX_BYTES) {
            errors.push(`${name}: too large (max 10 MB)`);
            continue;
        }
        if (total + size > PROFILE_FILES_TOTAL_MAX_BYTES) {
            errors.push(`${name}: total size limit reached`);
            continue;
        }
        try {
            const buf = fs_1.default.readFileSync(fp);
            const id = (0, crypto_1.randomBytes)(6).toString('hex');
            const entry = cls.kind === 'text'
                ? { id, name, kind: 'text', mediaType: cls.mediaType, text: buf.toString('utf-8').slice(0, 20000), sizeBytes: size }
                : { id, name, kind: cls.kind, mediaType: cls.mediaType, data: buf.toString('base64'), sizeBytes: size };
            cache.set(id, entry);
            total += size;
            added.push({ id, name, kind: cls.kind, sizeBytes: size });
        }
        catch {
            errors.push(`${name}: cannot read`);
        }
    }
    return { ok: true, files: added, errors };
}
function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
}
/** Download a page and reduce it to readable text. https only; bounded time + size. */
function fetchReadableText(rawUrl) {
    const url = parseHttpsUrl(rawUrl);
    if (!url)
        return Promise.resolve({ ok: false, error: 'Only https URLs are allowed' });
    // NOTE: deliberately net.request (not net.fetch). net.fetch wraps the response in an
    // undici Response, whose constructor throws RangeError for any status outside 200-599
    // (e.g. LinkedIn's anti-bot 999). That throw happens inside the ClientRequest 'response'
    // handler, escaping any try/catch, and crashes the whole main process. net.request exposes
    // statusCode as a plain number, so a weird status is just handled as an error here.
    return new Promise((resolve) => {
        const MAX_HTML = 1500000;
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };
        const request = electron_1.net.request({ url: url.toString(), redirect: 'follow' });
        request.setHeader('user-agent', 'Mozilla/5.0 (compatible; NoteFlow profile reader)');
        const timer = setTimeout(() => {
            finish({ ok: false, error: 'request timed out' });
            try {
                request.abort();
            }
            catch { /* ignore */ }
        }, 8000);
        request.on('response', (response) => {
            const status = response.statusCode;
            if (status < 200 || status >= 300) {
                finish({ ok: false, error: `HTTP ${status}` });
                try {
                    request.abort();
                }
                catch { /* ignore */ }
                return;
            }
            const ctypeHeader = response.headers['content-type'];
            const ctype = (Array.isArray(ctypeHeader) ? ctypeHeader[0] : ctypeHeader ?? '').toLowerCase();
            if (!ctype.includes('text/html') && !ctype.includes('text/plain') && !ctype.includes('xhtml')) {
                finish({ ok: false, error: `unsupported content type${ctype ? ` (${ctype.split(';')[0]})` : ''}` });
                try {
                    request.abort();
                }
                catch { /* ignore */ }
                return;
            }
            const decoder = new TextDecoder();
            let html = '';
            response.on('data', (chunk) => {
                if (html.length >= MAX_HTML)
                    return;
                html += decoder.decode(chunk, { stream: true });
                if (html.length >= MAX_HTML) {
                    try {
                        request.abort();
                    }
                    catch { /* ignore */ }
                }
            });
            response.on('end', () => {
                const text = htmlToText(html).slice(0, 6000);
                finish(text ? { ok: true, text } : { ok: false, error: 'no readable text found' });
            });
            response.on('error', (err) => finish({ ok: false, error: err.message }));
        });
        request.on('error', (err) => finish({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        request.end();
    });
}
function validateProfileShape(obj) {
    if (typeof obj.title !== 'string' || !Array.isArray(obj.sections))
        return null;
    const sections = obj.sections
        .filter((s) => !!s && typeof s.name === 'string' && typeof s.content === 'string');
    if (sections.length === 0)
        return null;
    return { title: obj.title, sections };
}
function extractJson(text) {
    // Try a few candidate strings, most-specific first, so prose or markdown fences around
    // the JSON don't cause a parse failure (which previously meant the whole generation was lost).
    const candidates = [];
    const trimmed = text.trim();
    candidates.push(trimmed);
    // ```json ... ``` (or plain ``` ... ```) fenced block
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1])
        candidates.push(fence[1].trim());
    // First "{" to last "}" — tolerant of leading/trailing prose
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start)
        candidates.push(trimmed.slice(start, end + 1));
    for (const c of candidates) {
        try {
            const valid = validateProfileShape(JSON.parse(c));
            if (valid)
                return valid;
        }
        catch {
            // try the next candidate
        }
    }
    return null;
}
electron_1.ipcMain.handle('ai:profile-pick-files', () => pickFilesIntoCache(profileFiles, mainMessages().dialogs.addFilesToProfile));
electron_1.ipcMain.handle('ai:profile-remove-file', (_event, id) => {
    profileFiles.delete(id);
    return { ok: true };
});
// Chat attachments: same picker, but into the chat cache (kept across turns, not consumed).
electron_1.ipcMain.handle('ai:chat-pick-files', () => pickFilesIntoCache(chatFiles, mainMessages().dialogs.attachFilesToChat));
electron_1.ipcMain.handle('ai:chat-remove-file', (_event, id) => {
    chatFiles.delete(id);
    return { ok: true };
});
electron_1.ipcMain.handle('ai:profile-generate', async (_event, req) => {
    const stored = readLlmSettings();
    if (!llm.toPublic(stored).configured)
        return { ok: false, error: llm.notConfiguredMessage(stored) };
    let provider;
    try {
        provider = llm.getProvider(await llm.resolveConfigAsync(stored, mainMessages().chatErrors));
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    const locale = req.locale?.trim() || 'the language the user used';
    const parts = [];
    const fields = (req.fields ?? []).filter((f) => f.value?.trim());
    if (fields.length) {
        parts.push('# Form answers');
        // Group answers under their section header so the model can weigh them in context.
        const bySection = new Map();
        for (const f of fields) {
            const sec = f.section?.trim() || 'Other';
            if (!bySection.has(sec))
                bySection.set(sec, []);
            bySection.get(sec).push({ label: f.label, value: f.value.trim() });
        }
        for (const [sec, items] of bySection) {
            parts.push(`## ${sec}`);
            for (const it of items)
                parts.push(`- ${it.label}: ${it.value}`);
        }
    }
    // Inline text files; collect pdf/image as native attachments.
    const attachments = [];
    const attachedNames = [];
    for (const id of req.fileIds ?? []) {
        const f = profileFiles.get(id);
        if (!f)
            continue;
        if (f.kind === 'text' && f.text)
            parts.push(`## File: ${f.name}\n${f.text}`);
        else if ((f.kind === 'pdf' || f.kind === 'image') && f.data) {
            attachments.push({ kind: f.kind, mediaType: f.mediaType, data: f.data });
            attachedNames.push(f.name);
        }
    }
    if (attachedNames.length) {
        parts.push(`## Attached documents\n${attachedNames.map((n) => `- ${n}`).join('\n')}\n(Read the attached files to learn more about the user.)`);
    }
    // Scrape readable text from the provided links.
    const urls = (req.urls ?? []).map((u) => u.trim()).filter(Boolean);
    if (urls.length) {
        parts.push('## Links');
        for (const u of urls) {
            const r = await fetchReadableText(u);
            if (r.ok && r.text)
                parts.push(`### ${u}\n${r.text}`);
            else
                parts.push(`### ${u}\n(Could not read this page${r.error ? `: ${r.error}` : ''}. Still record the link in the profile.)`);
        }
    }
    if (!parts.length && !attachments.length)
        return { ok: false, error: 'Nothing to build a profile from' };
    const system = 'You are a perceptive profiler building a personal profile note for a "second brain" notes app. ' +
        'The note is later retrieved as BACKGROUND CONTEXT to tailor answers to this person, so its value ' +
        'is in capturing WHO THEY ARE, not in cataloguing trivia. The user may be anyone (not necessarily ' +
        'a developer). You are given short form answers (grouped by section), optional attached documents ' +
        '(CV/PDF/images) and text scraped from links. ' +
        `Write the profile in ${locale}.\n\n` +
        'INFER, DON\'T JUST TRANSCRIBE. Many answers are intentionally INDIRECT proxies — favourite ' +
        'music/films/books, a dream trip, and playful "this or that" picks. Read them through validated ' +
        'personality psychology (the Big Five / OCEAN: openness, conscientiousness, extraversion, ' +
        'agreeableness, emotional stability) to infer likely TRAITS, VALUES, MOTIVATIONS and working/' +
        'communication preferences. These signals are PROBABILISTIC and modest, so treat them as soft ' +
        'priors, never certainties: phrase inferences as tendencies ("tends to…", "likely values…", ' +
        '"seems energised by…"), and let multiple cues converge before you commit to a trait.\n\n' +
        'ABSTRACT AWAY THE SOURCE. The main body must describe the person in terms of traits, values and ' +
        'how they think and want to be treated — NOT by naming the specific media that produced the ' +
        'inference. Write what a favourite REPRESENTS, not its title: e.g. "drawn to introspective, ' +
        'character-driven stories and big-picture thinking" rather than "likes Interstellar". This keeps ' +
        'the assistant from awkwardly name-dropping a movie/song in unrelated conversations.\n\n' +
        'Cover BOTH professional and personal dimensions, and especially HOW they want the assistant to ' +
        'communicate with them (tone, length, level of detail) — capture this clearly so future answers ' +
        'can adapt. Stay faithful: do not invent hard specifics (names, employers, dates) that the inputs ' +
        'do not support.\n\n' +
        'STRUCTURE. Organize into a few clear sections; skip any with no information. Suggested: ' +
        '"About" (a tight summary), "How they think & what they value" (the inferred traits/values), ' +
        '"Communication style" (how the assistant should talk to them), "Work & focus", "Interests", ' +
        'and "Links" (the URLs provided). ' +
        'Then, ONLY if the user gave literal favourites (songs, films, books, etc.), add a FINAL section ' +
        'named exactly "Soft signals (raw — do not cite)" that lists them verbatim, opening with one ' +
        'line: "Raw references kept for background only — do not bring these up in unrelated ' +
        'conversations." Keep this section short and low-key.\n\n' +
        'Return ONLY a JSON object with this exact shape: ' +
        '{"title": string, "sections": [{"name": string, "content": string}]}. ' +
        'No text outside the JSON. "content" is Markdown.';
    try {
        let text = '';
        const userText = parts.join('\n\n') || 'Build my profile from the attached files.';
        // A multi-section profile in the user's language can run long; 3072 left some models
        // truncating mid-JSON, which then failed to parse and lost the whole generation.
        await provider.chat({ system, messages: [{ role: 'user', content: userText }], maxTokens: 6144, attachments }, (d) => { text += d; });
        const parsed = extractJson(text);
        if (!parsed)
            return { ok: false, error: 'Could not parse the model output' };
        for (const id of req.fileIds ?? [])
            profileFiles.delete(id); // attachments consumed
        return { ok: true, ...parsed };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
});
electron_1.ipcMain.handle('ai:profile-get-status', () => {
    const profile = (readSettings().aiProfile ?? {});
    return { completedAt: profile.completedAt ?? null, noteId: profile.noteId ?? null };
});
electron_1.ipcMain.handle('ai:profile-set-completed', (_event, noteId) => {
    const settings = readSettings();
    settings.aiProfile = { completedAt: new Date().toISOString(), ...(noteId ? { noteId } : {}) };
    writeSettings(settings);
    return { ok: true };
});
electron_1.ipcMain.on('settings:get-theme', (event) => {
    event.returnValue = readSettings().theme ?? null;
});
electron_1.ipcMain.on('settings:set-theme', (_event, themeId) => {
    const settings = readSettings();
    settings.theme = themeId;
    writeSettings(settings);
});
// Language is a local (non-synced, per-device) setting — unlike the theme, which
// now travels in ui-settings.json. Setting it persists, refreshes the tray in the
// new language, and broadcasts to every window (incl. the sender and any open
// stickies) so the UI switches live without a reload.
electron_1.ipcMain.on('settings:get-language', (event) => {
    event.returnValue = readSettings().language ?? 'system';
});
electron_1.ipcMain.on('settings:set-language', (_event, setting) => {
    const settings = readSettings();
    settings.language = setting;
    writeSettings(settings);
    applyTrayMenu();
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('language-changed', setting));
});
electron_1.ipcMain.handle('app:get-login-item', () => {
    // Store build: never on (see applyLoginItemSettings), even if settings.json
    // was inherited from a direct install that had it enabled.
    if (IS_STORE_BUILD)
        return { openAtLogin: false };
    const openAtLogin = (readSettings().openAtLogin ?? false);
    return { openAtLogin };
});
function applyLoginItemSettings(enabled) {
    // Store build: the Run key would land in the package's virtual registry and
    // Windows would never read it. The Settings panel hides the toggle there.
    if (IS_STORE_BUILD)
        return;
    if (process.platform === 'linux') {
        // On Linux, manually manage the autostart .desktop file so that the
        // --noteflow-startup arg is reliably included. app.setLoginItemSettings
        // depends on finding the system .desktop file as a template and may drop
        // the args if the file name/path doesn't match exactly.
        const autostartDir = path_1.default.join(os_1.default.homedir(), '.config', 'autostart');
        const desktopFile = path_1.default.join(autostartDir, 'noteflow.desktop');
        if (enabled) {
            fs_1.default.mkdirSync(autostartDir, { recursive: true });
            const content = [
                '[Desktop Entry]',
                'Type=Application',
                'Name=NoteFlow',
                'Comment=Fast notes for software engineers',
                `Exec=${process.execPath} --noteflow-startup`,
                'Hidden=false',
                'NoDisplay=false',
                'X-GNOME-Autostart-enabled=true',
                // Wait for the Wayland compositor and GNOME Shell to finish their
                // startup animations before NoteFlow tries to map windows.
                // 15 s covers even slower machines; sticky windows that appear
                // during the login animation are immediately hidden by the shell.
                'X-GNOME-Autostart-Delay=15',
            ].join('\n') + '\n';
            fs_1.default.writeFileSync(desktopFile, content, 'utf-8');
        }
        else {
            try {
                fs_1.default.unlinkSync(desktopFile);
            }
            catch { /* already gone */ }
        }
    }
    else {
        electron_1.app.setLoginItemSettings({
            openAtLogin: enabled,
            path: process.execPath,
            args: enabled ? ['--noteflow-startup'] : [],
        });
    }
}
electron_1.ipcMain.handle('app:set-login-item', (_event, enabled) => {
    // Store build: not available — leave the setting alone (a direct install may share it).
    if (IS_STORE_BUILD)
        return { ok: false, error: 'Not available in the Microsoft Store version' };
    const settings = readSettings();
    settings.openAtLogin = enabled;
    writeSettings(settings);
    try {
        applyLoginItemSettings(enabled);
        return { ok: true };
    }
    catch (err) {
        console.error('Failed to set login item:', err);
        return { ok: false, error: String(err) };
    }
});
// ── CLI skill exposure (agent skill dirs) ─────────────────────────────────────
// Installs the bundled noteflow-cli SKILL.md into the user-level skill dirs of
// AI coding agents so they discover how to drive NoteFlow via the CLI without
// any extra download:
//   - ~/.claude/skills/noteflow-cli          → Claude Code (only reads this path)
//   - ~/.agents/skills/noteflow-cli          → Agent Skills standard user path
//     (agentskills.io): Codex, Gemini CLI, GitHub Copilot, Cursor, OpenCode…
//   - ~/.codeium/windsurf/skills/noteflow-cli → Windsurf, only if ~/.codeium/windsurf
//     already exists (we never create ~/.codeium on machines without Windsurf)
// Controlled by the `exposeSkillToAgents` setting (default on) and re-synced on
// every launch so skill updates propagate. Each destination is handled
// independently and best-effort: a failure in one never blocks the others, and
// nothing ever throws into the startup path.
// Store build: skipped entirely (no install, no removal) — it ships no `noteflow`
// command on PATH, so the skill would point agents at a CLI that isn't there; and
// a direct install on the same machine may own the files.
function skillAgentDestDirs() {
    const home = os_1.default.homedir();
    const dirs = [
        path_1.default.join(home, '.claude', 'skills', 'noteflow-cli'),
        path_1.default.join(home, '.agents', 'skills', 'noteflow-cli'),
    ];
    const windsurfRoot = path_1.default.join(home, '.codeium', 'windsurf');
    try {
        if (fs_1.default.existsSync(windsurfRoot))
            dirs.push(path_1.default.join(windsurfRoot, 'skills', 'noteflow-cli'));
    }
    catch { /* treat as not installed */ }
    return dirs;
}
function syncSkillToAgentDirs() {
    if (IS_STORE_BUILD)
        return;
    try {
        const enabled = (readSettings().exposeSkillToAgents ?? true);
        const destDirs = skillAgentDestDirs();
        if (!enabled) {
            // Opt-out: remove our file (and the noteflow-cli folder if we left it
            // empty) in every destination. Never touch anything else.
            for (const destDir of destDirs) {
                try {
                    const destFile = path_1.default.join(destDir, 'SKILL.md');
                    if (fs_1.default.existsSync(destFile))
                        fs_1.default.unlinkSync(destFile);
                    if (fs_1.default.existsSync(destDir) && fs_1.default.readdirSync(destDir).length === 0)
                        fs_1.default.rmdirSync(destDir);
                }
                catch (err) {
                    console.error('Failed to remove NoteFlow skill from', destDir, err);
                }
            }
            return;
        }
        const srcFile = electron_1.app.isPackaged
            ? path_1.default.join(process.resourcesPath, 'cli', 'noteflow-cli', 'SKILL.md')
            : path_1.default.join(__dirname, '..', 'cli', 'noteflow-cli', 'SKILL.md');
        if (!fs_1.default.existsSync(srcFile)) {
            // Dev without a bundled skill, or an unexpected layout — not fatal.
            console.error('NoteFlow skill source not found, skipping sync:', srcFile);
            return;
        }
        const srcContent = fs_1.default.readFileSync(srcFile, 'utf-8');
        for (const destDir of destDirs) {
            try {
                const destFile = path_1.default.join(destDir, 'SKILL.md');
                // Copy only when missing or stale, so we self-heal and pick up skill
                // changes on update without rewriting on every launch.
                const current = fs_1.default.existsSync(destFile) ? fs_1.default.readFileSync(destFile, 'utf-8') : null;
                if (current !== srcContent) {
                    fs_1.default.mkdirSync(destDir, { recursive: true });
                    fs_1.default.writeFileSync(destFile, srcContent, 'utf-8');
                }
            }
            catch (err) {
                console.error('Failed to sync NoteFlow skill to', destDir, err);
            }
        }
    }
    catch (err) {
        console.error('Failed to sync NoteFlow skill:', err);
    }
}
electron_1.ipcMain.handle('app:get-skill-sync', () => ({
    enabled: (readSettings().exposeSkillToAgents ?? true),
}));
electron_1.ipcMain.handle('app:set-skill-sync', (_event, enabled) => {
    // Store build: no CLI to expose — leave the setting alone (Settings hides the toggle).
    if (IS_STORE_BUILD)
        return { ok: false, error: 'Not available in the Microsoft Store version' };
    const settings = readSettings();
    settings.exposeSkillToAgents = enabled;
    writeSettings(settings);
    try {
        syncSkillToAgentDirs();
        return { ok: true };
    }
    catch (err) {
        console.error('Failed to set skill sync:', err);
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('settings:get-startup-stickies', () => {
    return (readSettings().startupStickies ?? []);
});
electron_1.ipcMain.handle('settings:set-startup-stickies', (_event, stickies) => {
    const settings = readSettings();
    settings.startupStickies = stickies;
    writeSettings(settings);
});
// "What's new" tour: ids of the slides already shown on THIS device (local, never
// synced — each machine gets its own tour). `disabled` lets harnesses that drive a
// fresh profile (scripts/update-e2e.cjs) keep the startup popup out of the way;
// the tour can still be opened by hand from Settings → Tutorial.
electron_1.ipcMain.handle('whats-new:get-seen', () => ({
    seen: (0, whatsNewSeen_1.sanitizeSeenIds)(readSettings().whatsNewSeen),
    disabled: process.env.NOTEFLOW_DISABLE_WHATS_NEW === '1',
}));
// Union with what is stored (never removes) → returns the updated list.
electron_1.ipcMain.handle('whats-new:mark-seen', (_event, ids) => {
    const settings = readSettings();
    const next = (0, whatsNewSeen_1.mergeSeenIds)(settings.whatsNewSeen, ids);
    // Each slide shown calls this: skip the disk write when nothing changed.
    if (JSON.stringify(next) !== JSON.stringify(settings.whatsNewSeen)) {
        settings.whatsNewSeen = next;
        writeSettings(settings);
    }
    return next;
});
electron_1.ipcMain.handle('settings:get-ui-state', () => {
    return (readSettings().uiState ?? {});
});
electron_1.ipcMain.handle('settings:set-ui-state', (_event, patch) => {
    const settings = readSettings();
    settings.uiState = { ...(settings.uiState ?? {}), ...patch };
    writeSettings(settings);
});
electron_1.ipcMain.handle('groups:get', () => {
    try {
        return JSON.parse(fs_1.default.readFileSync(GROUPS_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
});
function applyGroupsSet(groups, senderId, opts) {
    const content = JSON.stringify(groups, null, 2);
    // Our own write: the notes watcher must not echo it back as `groups-updated`.
    markInternalWrite('groups.json');
    fs_1.default.writeFileSync(GROUPS_FILE, content, 'utf-8');
    // Broadcast to other windows so their groups reload immediately
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (win.webContents.id !== senderId) {
            win.webContents.send('notes-updated');
        }
    });
    // Durable push for agentic chat tools (see applyNoteWrite): land groups.json on
    // the remote NOW so a racing pull doesn't overwrite the new group with the stale
    // remote copy before the debounced push fires.
    const sync = (0, syncProvider_1.getActiveSyncProvider)();
    if (opts?.durablePush) {
        if (!sync.isConnected())
            return Promise.resolve();
        return sync
            .pushPathsNow(NOTES_DIR, ['groups.json'])
            .then(() => undefined)
            .catch((err) => { console.error('[chat] durable push failed:', String(err)); });
    }
    sync.schedulePush('groups.json', content);
}
electron_1.ipcMain.handle('groups:set', (event, groups) => {
    applyGroupsSet(groups, event.sender.id);
});
electron_1.ipcMain.handle('folders:get', () => {
    try {
        return JSON.parse(fs_1.default.readFileSync(FOLDERS_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
});
function applyFoldersSet(folders, senderId, opts) {
    const content = JSON.stringify(folders, null, 2);
    markInternalWrite('folders.json'); // see applyGroupsSet
    fs_1.default.writeFileSync(FOLDERS_FILE, content, 'utf-8');
    // Broadcast to other windows so their folders reload immediately
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (win.webContents.id !== senderId) {
            win.webContents.send('notes-updated');
        }
    });
    // Durable push for agentic chat tools — see applyGroupsSet / applyNoteWrite.
    const sync = (0, syncProvider_1.getActiveSyncProvider)();
    if (opts?.durablePush) {
        if (!sync.isConnected())
            return Promise.resolve();
        return sync
            .pushPathsNow(NOTES_DIR, ['folders.json'])
            .then(() => undefined)
            .catch((err) => { console.error('[chat] durable push failed:', String(err)); });
    }
    sync.schedulePush('folders.json', content);
}
electron_1.ipcMain.handle('folders:set', (event, folders) => {
    applyFoldersSet(folders, event.sender.id);
});
electron_1.ipcMain.handle('section-colors:get', () => {
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(SECTION_COLORS_FILE, 'utf-8'));
        return sanitizeSectionColors(raw);
    }
    catch {
        return {};
    }
});
electron_1.ipcMain.handle('section-colors:set', (event, colors) => {
    const sanitized = sanitizeSectionColors(colors);
    const content = JSON.stringify(sanitized, null, 2);
    fs_1.default.writeFileSync(SECTION_COLORS_FILE, content, 'utf-8');
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (win.webContents.id !== event.sender.id) {
            win.webContents.send('notes-updated');
        }
    });
    (0, syncProvider_1.getActiveSyncProvider)().schedulePush('section-colors.json', content);
});
// ── UI settings (ui-settings.json) ─────────────────────────────────────────────
// Synced appearance + editor settings (see electron/uiSettings.ts for the format
// and the tri-state override semantics). Same pattern as section-colors: the file
// lives at the root of the notes dir so both sync backends push/pull it.
function readUiSettingsFile() {
    try {
        return (0, uiSettings_1.sanitizeUiSettings)(JSON.parse(fs_1.default.readFileSync(UI_SETTINGS_FILE, 'utf-8')));
    }
    catch {
        return {};
    }
}
// Synchronous on purpose: themeStore.initTheme() needs it before the first paint
// (same reason settings:get-theme is a sendSync channel).
electron_1.ipcMain.on('ui-settings:get', (event) => {
    event.returnValue = readUiSettingsFile();
});
// Receives a PARTIAL patch and merges it over what is on disk, so themeStore
// (appearance) and editorSettingsStore (editor) never clobber each other's slice.
electron_1.ipcMain.handle('ui-settings:set', (event, patch) => {
    const merged = (0, uiSettings_1.mergeUiSettings)(readUiSettingsFile(), patch);
    const content = JSON.stringify(merged, null, 2);
    fs_1.default.writeFileSync(UI_SETTINGS_FILE, content, 'utf-8');
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (win.webContents.id !== event.sender.id) {
            win.webContents.send('notes-updated');
        }
    });
    (0, syncProvider_1.getActiveSyncProvider)().schedulePush('ui-settings.json', content);
});
// Linked notes (external .md, this device only) never reach note-order.json: their place in
// a context's manual order lives in the local registry and is merged back here (see
// linkedNotesLogic.splitLinkedOrder / mergeLinkedOrder).
function writeNoteOrderFile(order) {
    const content = JSON.stringify(order, null, 2);
    markInternalWrite('note-order.json'); // see applyGroupsSet
    fs_1.default.writeFileSync(NOTE_ORDER_FILE, content, 'utf-8');
    return content;
}
electron_1.ipcMain.handle('note-order:get', () => {
    let synced = {};
    try {
        synced = JSON.parse(fs_1.default.readFileSync(NOTE_ORDER_FILE, 'utf-8'));
    }
    catch { /* none */ }
    // Linked ids an earlier build wrote to the synced file: moved to the local order, file cleaned.
    const cleaned = linkedNotes.adoptLinkedIdsFromSynced(synced);
    if (cleaned) {
        try {
            (0, syncProvider_1.getActiveSyncProvider)().schedulePush('note-order.json', writeNoteOrderFile(cleaned));
        }
        catch (err) {
            console.error('[linked] failed to clean note-order.json:', String(err));
        }
        synced = cleaned;
    }
    return linkedNotes.mergeNoteOrder(synced);
});
electron_1.ipcMain.handle('note-order:set', (event, order) => {
    const content = JSON.stringify(linkedNotes.splitNoteOrder(order), null, 2);
    markInternalWrite('note-order.json'); // see applyGroupsSet
    fs_1.default.writeFileSync(NOTE_ORDER_FILE, content, 'utf-8');
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (win.webContents.id !== event.sender.id) {
            win.webContents.send('notes-updated');
        }
    });
    (0, syncProvider_1.getActiveSyncProvider)().schedulePush('note-order.json', content);
});
electron_1.ipcMain.handle('templates:get', () => {
    try {
        return JSON.parse(fs_1.default.readFileSync(TEMPLATES_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
});
electron_1.ipcMain.handle('templates:set', (event, templates) => {
    const content = JSON.stringify(templates, null, 2);
    fs_1.default.writeFileSync(TEMPLATES_FILE, content, 'utf-8');
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (win.webContents.id !== event.sender.id) {
            win.webContents.send('notes-updated');
        }
    });
    (0, syncProvider_1.getActiveSyncProvider)().schedulePush('templates.json', content);
});
// Editor snippets (toolbar "Snippets" button). Sanitized both ways: the file can
// arrive from another device through a pull. Other windows get a dedicated
// event — a path-less `notes-updated` would make them reload every note.
electron_1.ipcMain.handle('snippets:get', () => {
    try {
        return (0, snippetsFile_1.sanitizeSnippets)(JSON.parse(fs_1.default.readFileSync(SNIPPETS_FILE, 'utf-8')), new Date().toISOString());
    }
    catch {
        return [];
    }
});
electron_1.ipcMain.handle('snippets:set', (event, snippets) => {
    // A malformed payload must never replace the file with [] (and push that).
    if (!Array.isArray(snippets))
        return;
    const content = JSON.stringify((0, snippetsFile_1.sanitizeSnippets)(snippets, new Date().toISOString()), null, 2);
    fs_1.default.writeFileSync(SNIPPETS_FILE, content, 'utf-8');
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (win.webContents.id !== event.sender.id) {
            win.webContents.send('snippets-updated');
        }
    });
    (0, syncProvider_1.getActiveSyncProvider)().schedulePush('snippets.json', content);
});
// Window controls
electron_1.ipcMain.on('window:minimize', (event) => {
    electron_1.BrowserWindow.fromWebContents(event.sender)?.minimize();
});
electron_1.ipcMain.on('window:get-id', (event) => {
    event.returnValue = event.sender.id;
});
electron_1.ipcMain.on('app:get-hardware', (event) => {
    const cpus = os_1.default.cpus();
    event.returnValue = {
        logicalCores: cpus.length,
        cpuModel: cpus[0]?.model ?? '',
        cpuSpeedMHz: cpus[0]?.speed ?? 0,
        totalMemGiB: os_1.default.totalmem() / (1024 ** 3),
    };
});
// Name of the user's home folder (basename of ~), read once by the preload: the sidebar
// footer's identity line shows it.
electron_1.ipcMain.on('app:get-user-name', (event) => {
    event.returnValue = path_1.default.basename(os_1.default.homedir());
});
// Acts on the sender's window (main or a section window).
electron_1.ipcMain.on('window:maximize', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    if (!win)
        return;
    if (win.isMaximized())
        win.unmaximize();
    else
        win.maximize();
});
electron_1.ipcMain.on('window:close', (event) => {
    // Check if it's the main window or a sticky window
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (win && win !== mainWindow) {
        win.close(); // Truly close sticky windows
    }
    else {
        mainWindow?.hide(); // Just hide the main window
    }
});
electron_1.ipcMain.on('window:open-sticky', (_event, noteId, sectionId) => {
    createStickyWindow(noteId, sectionId);
});
const isWindowTargetId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 128;
electron_1.ipcMain.on('window:open-section-window', (_event, noteId, sectionId, nearCursor) => {
    if (!isWindowTargetId(noteId) || !isWindowTargetId(sectionId))
        return;
    createSectionWindow(noteId, sectionId, nearCursor === true);
});
electron_1.ipcMain.on('window:section-window-target', (event, noteId, sectionId) => {
    if (!isWindowTargetId(noteId) || !isWindowTargetId(sectionId))
        return;
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    const previous = win ? sectionWindows.get(win) : undefined;
    if (win && previous)
        sectionWindows.set(win, { noteId, sectionId });
    // Another note in this window: a transient linked note it showed was closed here.
    if (previous && previous.noteId !== noteId)
        releaseTransientNote(previous.noteId);
});
electron_1.ipcMain.on('window:set-size', (event, width, height, minW, minH) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    win.setMinimumSize(minW, minH);
    win.setSize(width, height);
});
electron_1.ipcMain.on('window:set-always-on-top', (event, flag) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    win.setAlwaysOnTop(flag);
});
electron_1.ipcMain.on('window:fold-to-corner', (event, foldedW, foldedH) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    // Expanded bounds as of now (Linux has no 'moved'/'resized': this is its save point).
    rememberStickyBoundsNow(win);
    const from = win.getBounds();
    prevBoundsMap.set(win.id, from);
    // Go back to where the user left this pill last time (same size); otherwise
    // (never moved, display gone, or the same sticky already folded there) stack it
    // in the default corner. Computed before adding `win` to foldedWindows so its
    // own expanded bounds don't count as a pill of the corner stack.
    const key = stickyKeys.get(win.id);
    const remembered = key ? rememberedStickyRect(key, 'folded') : null;
    const to = remembered && key && !stickyKeyInUse(win, key, foldedWindows)
        ? remembered
        : { ...getFoldedPosition(electron_1.screen.getDisplayNearestPoint(from), foldedW, foldedH), width: foldedW, height: foldedH };
    foldedWindows.add(win);
    foldedSettledBounds.delete(win.id);
    // A startup sticky reopens folded after a reboot.
    if (key)
        rememberStickyFolded(key, true);
    animateStickyWindow(win, from, to, 300, () => {
        // Real bounds (the OS may clamp the height): the baseline to tell a user move.
        if (!win.isDestroyed())
            foldedSettledBounds.set(win.id, win.getBounds());
    });
});
electron_1.ipcMain.on('window:unfold', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const prev = prevBoundsMap.get(win.id);
    if (!prev)
        return;
    // Where the pill is now, if the user moved it (Linux save point, see above).
    rememberStickyBoundsNow(win);
    foldedWindows.delete(win);
    foldedSettledBounds.delete(win.id);
    const key = stickyKeys.get(win.id);
    if (key)
        rememberStickyFolded(key, false);
    const from = win.getBounds();
    animateStickyWindow(win, from, prev, 280, () => {
        if (!win.isDestroyed()) {
            win.setMinimumSize(STICKY_MIN_SIZE, STICKY_MIN_SIZE);
            applyStickyShape(win);
        }
    });
    prevBoundsMap.delete(win.id);
});
// ── App lifecycle ─────────────────────────────────────────────────────────────
// Ensure single instance — second-instance event brings the existing window to front
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
// Cap V8's heap growth in the renderers: a fixed 1.3 factor instead of the default of up
// to x4, which let Blink's heap balloon while navigating (why and numbers in v8Flags.ts).
// Has to run before 'ready', and only reaches the renderers: this process initialised its
// V8 before loading this file. After the lock and only when we hold it: a process that
// loses it has already forwarded its command line to the owner ('second-instance'), whose
// relaunch keeps unknown switches (secondInstanceRelaunchArgs) — appended here, ours never
// travels in that argv.
if (gotTheLock) {
    electron_1.app.commandLine.appendSwitch('js-flags', (0, v8Flags_1.rendererJsFlags)(electron_1.app.commandLine.getSwitchValue('js-flags')));
}
// No window of the app ever shows remote content (navigationGuard.ts). The renderer opens
// links through `app:open-url`; these hooks catch what bypasses it — `target="_blank"` /
// `window.open()` of a third-party component (the drawing canvas) or a plain `<a href>` in
// rendered markup. On every webContents, so new kinds of window are covered by default.
electron_1.app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        const external = (0, navigationGuard_1.externalUrlToOpen)(url);
        if (external) {
            electron_1.shell.openExternal(external).catch((err) => {
                console.error('Failed to open external URL:', err);
            });
        }
        else {
            console.warn('[Security] Blocked window.open:', url);
        }
        return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
        // (The detached DevTools of `npm run dev` is a webContents too: its own business.)
        if (contents.getURL().startsWith('devtools://') || (0, navigationGuard_1.navigationAllowed)(contents.getURL(), url))
            return;
        event.preventDefault();
        console.warn('[Security] Blocked navigation:', url);
    });
});
electron_1.app.whenReady().then(async () => {
    // Losing the lock means another instance already owns the app: quit was
    // already requested above, so do NO startup work (migration, initial pull,
    // tray, window) before this process dies.
    if (!gotTheLock)
        return;
    // Must match electron-builder's `build.appId` so Windows groups the taskbar
    // button with the pinned shortcut and attributes notifications correctly.
    if (process.platform === 'win32')
        electron_1.app.setAppUserModelId('dev.noteflow.notes');
    // Remove default menu for all windows
    electron_1.Menu.setApplicationMenu(null);
    // One-time local format migration (v1 flat .md → v2 folder-per-note).
    // MUST run before the initial pull and before the fs watcher starts.
    const migrationResult = (0, migration_1.migrateNotesDirToV2)(NOTES_DIR);
    // First run: a local-only welcome note so the app doesn't open empty. Then
    // remember every local-only folder so deleting one later never reaches the
    // remote (localOnlyNotes.ts). Both before any sync code runs.
    await seedWelcomeNoteIfFirstRun();
    (0, localOnlyNotes_1.primeLocalOnlyDirs)(NOTES_DIR);
    // Linked notes (external text files) — before any window can ask for them: registry + content
    // cache in userData, one watcher per parent folder. Changes reach the windows as
    // `notes-updated` with the FILE path (the renderer routes it to its linked-note sync: a
    // linked note of its store with that path, or one main knows — `linked:get`)
    // and the semantic index as data notes (the callbacks run later, never during init).
    // Not awaited: the files are read in the background (fs.promises) — a network drive that
    // doesn't answer must not hold the windows back; their notes show as "checking" meanwhile.
    void linkedNotes.init({
        userDataDir: electron_1.app.getPath('userData'),
        notesDir: NOTES_DIR,
        broadcast: (filePath, senderId) => {
            electron_1.BrowserWindow.getAllWindows().forEach((win) => {
                if (!win.isDestroyed())
                    win.webContents.send('notes-updated', filePath, senderId);
            });
        },
        onIndexChange: (id) => {
            if (aiIndex.isEnabled())
                aiIndex.scheduleIndexData(linkedNotes.aiIndexKey(id), () => linkedNotes.aiNote(id));
        },
        onRemoved: (id) => aiIndex.removeFromIndex(linkedNotes.aiIndexKey(id)),
    }).catch((err) => console.error('[linked] initial check failed:', String(err)));
    electron_1.protocol.handle(LINKED_ASSET_SCHEME, handleLinkedAssetRequest);
    // "Open with NoteFlow": the files of our own command line (and any that arrived from
    // second-instance / open-file before the registry was loaded).
    linkedNotesReady = true;
    queueOpenFiles(launchFiles(process.argv, process.cwd()));
    processOpenFiles();
    // Notes dir first: loading the settings derives the origin gate, which may list it.
    githubSync.setNotesDir(NOTES_DIR);
    githubSync.loadSyncSettings();
    githubSync.onStatusChanged(() => emitSyncStatusChanged());
    // Held-back conditional push (the file changed on GitHub) → pull soon.
    githubSync.onRemoteConflict(() => scheduleGithubConflictPull());
    // Title suffix of the conflict copies the GitHub pull makes (same as Cloud's).
    githubSync.setConflictCopyLabel(() => mainMessages().sync.conflictCopy);
    // Marker lines of the conflict blocks a line merge writes: named after THIS
    // computer and the merge time (the merged text syncs everywhere).
    githubSync.setConflictMarkerLabels(() => (0, cloudSyncLogic_1.sectionConflictLabels)(mainMessages().sync.conflictMarkers, os_1.default.hostname(), new Date()));
    const connected = githubSync.getSyncStatus().connected;
    // NoteFlow Cloud: restore the cached DEK (safeStorage) and the engine
    // settings. Mutually exclusive with GitHub Sync — when enabled, Cloud owns
    // the sync loop and GitHub's is skipped (see syncProvider.ts).
    cloudKeys.initCloudKeys();
    cloudSync.initCloudSync(NOTES_DIR);
    cloudSync.onStatusChanged(() => emitCloudStatusChanged());
    cloudSync.onRemoteConflict(() => scheduleCloudStalePull());
    // Title suffix of the conflict copies the pull makes, in the live UI language.
    cloudSync.setConflictCopyLabel(() => mainMessages().sync.conflictCopy);
    // Marker lines of the conflict blocks a line merge writes into a section (see GitHub's above).
    cloudSync.setConflictMarkerLabels(() => (0, cloudSyncLogic_1.sectionConflictLabels)(mainMessages().sync.conflictMarkers, os_1.default.hostname(), new Date()));
    const cloudEnabled = cloudSync.isCloudSyncEnabled();
    // NoteFlow account: load the persisted session and refresh entitlements in
    // the background (deferred inside initAccount — never blocks boot).
    // NoteFlow AI's model catalog as cached by a previous run — before anything can read
    // the presets (windows, IPC) or a status change can trigger a refresh.
    loadManagedCatalogCache();
    account.onStatusChanged(() => handleAccountStatusChanged());
    account.initAccount();
    // Seed the sign-in/sign-out edge detector with the session as restored from
    // disk: a persisted session is NOT a sign-in transition (a pending restore
    // record still gets evaluated on the first status change — see
    // planAccountTransition).
    lastAccountSnapshot = (() => {
        const status = account.getAccountStatus();
        return { signedIn: status.signedIn, identity: accountIdentityOf(status) };
    })();
    const isStartupMode = process.argv.includes('--noteflow-startup');
    const startupStickies = (readSettings().startupStickies ?? []);
    // Initial NoteFlow Cloud pull + autosync (Realtime subscription + safety-net
    // loop). Same rationale as the GitHub block below: in startup mode block
    // briefly so stickies open fresh; otherwise pull in the background (pushes
    // are gated until it succeeds).
    if (cloudEnabled) {
        const runInitialCloudPull = () => cloudSync
            .pullNotes(NOTES_DIR)
            .then((result) => {
            broadcastPullResult(result, 'cloud');
            emitCloudStatusChanged();
            cloudSync.retrySyncJournal(NOTES_DIR).catch((err) => {
                console.error('[Startup] cloud journal retry failed:', String(err));
            });
        })
            .catch((err) => {
            console.error('[Startup] initial cloud pull failed:', String(err));
        });
        if (isStartupMode) {
            await Promise.race([
                runInitialCloudPull(),
                new Promise((resolve) => setTimeout(resolve, 10000)),
            ]);
        }
        else {
            runInitialCloudPull();
        }
        startCloudAutoSync();
    }
    // Managed-mode silent unlock, deferred so it never competes with the boot
    // path (same spirit as initAccount's entitlements refresh). If the initial
    // cloud pull above failed because the keys were still locked (no safeStorage
    // cache), retry it now that the DEK is in memory.
    setTimeout(() => {
        cloudKeys.autoUnlockManaged()
            .then((changed) => {
            if (!changed)
                return;
            emitCloudStatusChanged();
            const status = cloudSync.getCloudSyncStatus();
            if (status.enabled && status.keysState === 'unlocked' && status.initialPullStatus !== 'ok') {
                cloudSync
                    .pullNotes(NOTES_DIR)
                    .then((result) => {
                    broadcastPullResult(result, 'cloud');
                    emitCloudStatusChanged();
                })
                    .catch((err) => console.error('[Startup] cloud pull after managed unlock failed:', String(err)));
            }
        })
            .catch((err) => console.error('[Startup] managed auto-unlock failed:', String(err)));
    }, 5000);
    // Initial GitHub pull. In startup mode we block for up to 10s so sticky
    // windows open with up-to-date content — otherwise an edit on stale data
    // would overwrite newer remote changes (data loss). In normal mode we keep
    // the fast-open UX and pull in the background; schedulePush is gated until
    // the first pull succeeds, so no unsafe pushes happen in the meantime.
    // Skipped while Cloud is enabled (mutual exclusion — Cloud takes priority).
    if (connected && !cloudEnabled) {
        const runInitialPull = () => githubSync
            .pullNotes(NOTES_DIR)
            .then((result) => {
            broadcastPullResult(result, 'github');
            // Drain remote mutations journaled in previous sessions (failed or
            // interrupted pushes/deletes). Internally gated on the initial pull
            // having succeeded, so this is a no-op if the pull above failed.
            githubSync.retrySyncJournal(NOTES_DIR).catch((err) => {
                console.error('[Startup] journal retry failed:', String(err));
            });
            // One-time remote format migration (v1 flat files → folders + marker).
            // Internally guarded; no-op once the remote is already v2.
            githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).then((didMigrate) => {
                if (didMigrate) {
                    // Remote-only notes may have been imported locally — full reload
                    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
                }
            }).catch((err) => {
                console.error('[Startup] remote format migration failed:', String(err));
            });
        })
            .catch((err) => {
            console.error('[Startup] initial pull failed:', String(err));
            githubSync.setInitialPullStatus('failed');
        });
        if (isStartupMode) {
            await Promise.race([
                runInitialPull(),
                new Promise((resolve) => setTimeout(() => {
                    // A pending origin choice is not a failed pull: it stays 'pending'.
                    if (githubSync.getSyncStatus().initialPullStatus === 'pending' && !githubSync.isOriginGateBlocked()) {
                        console.warn('[Startup] initial pull timeout — proceeding with local data');
                        githubSync.setInitialPullStatus('failed');
                    }
                    resolve();
                }, 10000)),
            ]);
        }
        else {
            runInitialPull();
        }
        startAutoSync();
    }
    // Refresh login item registration on every launch so it stays current after
    // app updates (binary path or args may have changed since the user first
    // enabled the feature).
    const savedOpenAtLogin = (readSettings().openAtLogin ?? false);
    if (savedOpenAtLogin) {
        try {
            applyLoginItemSettings(true);
        }
        catch (err) {
            console.error('Failed to refresh login item on startup:', err);
        }
    }
    // Keep the CLI skill in the agent skill dirs (~/.claude/skills, ~/.agents/skills,
    // Windsurf if installed) in sync (install/update/remove) so AI agents discover
    // it. Best-effort — must never block startup.
    try {
        syncSkillToAgentDirs();
    }
    catch (err) {
        console.error('Failed to sync NoteFlow skill on startup:', err);
    }
    if (isStartupMode) {
        // Launched at system startup: always keep the main window hidden in tray
        // and open any configured startup sticky notes.
        mainWindow = createWindow(true);
        const stickyWins = [];
        for (const { noteId, sectionId } of startupStickies) {
            stickyWins.push(createStickyWindow(noteId, sectionId, { restoreFolded: true }));
        }
        // Fallback for Wayland: the compositor may not honour ready-to-show, or
        // the window may be obscured by GNOME Shell's startup animation.
        // Force-show any sticky that is still not visible 5 s after creation.
        if (stickyWins.length > 0) {
            setTimeout(() => {
                stickyWins.forEach(w => {
                    if (!w.isDestroyed() && !w.isVisible())
                        w.show();
                });
            }, 5000);
        }
    }
    else {
        mainWindow = createWindow();
    }
    // Relaunched (pinned icon clicked) while the startup path above was still running:
    // the window wasn't there to show, so bring it up — even in startup mode — once ready.
    if (showMainWindowWhenCreated) {
        showMainWindowWhenCreated = false;
        mainWindow.once('ready-to-show', () => showWindow());
    }
    createTray();
    registerGlobalShortcut();
    startAlarmEngine();
    // With sync connected this is a no-op: the initial pull above runs it on success.
    maybeCheckExpiredNotes({ kind: 'timer' });
    // Semantic index (AI). init() wires config; primeSettings defers the worker warmup so
    // model loading / reindex doesn't compete with the app's first paint.
    aiIndex.init({
        notesDir: NOTES_DIR, onProgress: emitAiProgress, onState: emitAiState, onStale: emitAiStale,
        extraNotes: () => linkedNotes.aiNotes(),
    });
    aiIndex.primeSettings(readAiSettings());
    // The format migration rewrote every note path — the AI index stores stale
    // file paths and must be rebuilt once. Deferred so it doesn't fight startup.
    if (migrationResult.migrated > 0 && aiIndex.isEnabled()) {
        setTimeout(() => {
            aiIndex.reindexAll().catch((err) => console.error('[Migration] AI reindex failed:', String(err)));
        }, 15000);
    }
    // Watch for external file changes (CLI, sync from another device, etc.)
    startNotesWatcher();
    // Context / prompt files of earlier "Run"s that were not removed in time.
    agentRunIo.sweepTmp();
    electron_1.app.on('activate', () => {
        // A dock click while quitting isn't a launch: nothing to relaunch.
        if (!isQuitting)
            revealMainWindow();
    });
    electron_1.app.on('before-quit', () => {
        isQuitting = true;
        // A rotated refresh token / sign-out that couldn't be written yet must not
        // be lost with the process (see account.ts pendingPersist/pendingClear).
        account.flushAccountPersistence();
    });
    // After system resume from sleep, reload notes several times with increasing
    // delays. A single 1500ms attempt is not enough: the renderer may take a few
    // seconds to recover (or be reloaded by the crash handler above), and the
    // filesystem may not be ready immediately on Windows.
    // The 15s and 30s signals act as extra safety nets for slow filesystem
    // recovery (e.g. hibernation) or renderer restarts that happen after the
    // earlier signals have already fired.
    electron_1.powerMonitor.on('resume', () => {
        for (const delay of [1500, 4000, 8000, 15000, 30000]) {
            setTimeout(() => {
                electron_1.BrowserWindow.getAllWindows().forEach((w) => {
                    if (!w.isDestroyed())
                        w.webContents.send('notes-updated');
                });
            }, delay);
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    // Keep alive on all platforms — tray app pattern
    // Do NOT call app.quit() so the tray keeps running
});
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
    flushActivityLog();
});
// While quitting, revealMainWindow relaunches after exit with this launch's argv (its files
// included, made absolute against its working directory).
electron_1.app.on('second-instance', (_event, argv, workingDirectory) => {
    if (!isQuitting)
        queueOpenFiles(launchFiles(argv, workingDirectory || process.cwd()));
    revealMainWindow(argv, workingDirectory || process.cwd());
});
// macOS: a file opened with NoteFlow (Finder, `open -a NoteFlow x.md`, a drop on the Dock icon)
// arrives here — also BEFORE 'ready' on a cold start, so this is registered at load. Queued
// until the linked-notes registry is loaded. While quitting, it's relaunched with the file.
electron_1.app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (!gotTheLock)
        return;
    if (isQuitting) {
        relaunchAfterQuit([process.execPath, filePath], process.cwd());
        return;
    }
    queueOpenFiles((0, openWithArgs_1.openTargets)([filePath], openTargetOptions(process.cwd())));
    revealMainWindow();
});
