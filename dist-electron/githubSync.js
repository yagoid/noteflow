"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GITHUB_AUTO_SYNC_INTERVAL_MS = void 0;
exports.hasPendingRemoteMutations = hasPendingRemoteMutations;
exports.loadSyncSettings = loadSyncSettings;
exports.getSyncStatus = getSyncStatus;
exports.markNeedsFullReconcile = markNeedsFullReconcile;
exports.setInitialPullStatus = setInitialPullStatus;
exports.onStatusChanged = onStatusChanged;
exports.initiateDeviceFlow = initiateDeviceFlow;
exports.cancelDeviceFlow = cancelDeviceFlow;
exports.disconnectGitHub = disconnectGitHub;
exports.pullNotes = pullNotes;
exports.pushAllNotes = pushAllNotes;
exports.mirrorToGitHub = mirrorToGitHub;
exports.pushPathsNow = pushPathsNow;
exports.schedulePush = schedulePush;
exports.scheduleDelete = scheduleDelete;
exports.scheduleDeleteDir = scheduleDeleteDir;
exports.retrySyncJournal = retrySyncJournal;
exports.migrateRemoteToV2IfNeeded = migrateRemoteToV2IfNeeded;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const noteFormat_1 = require("./noteFormat");
const syncState_1 = require("./syncState");
const mirrorPlan_1 = require("./mirrorPlan");
// ── Constants ─────────────────────────────────────────────────────────────────
const README_CONTENT = `# Your notes are synced with GitHub

Your NoteFlow notes are automatically backed up to a **private GitHub repository** — only you can access them.

## Your privacy is protected

This repository is **private**. As long as it stays that way, nobody else can see or access your notes.

## How sync works

- Every time you create, edit, or delete a note in NoteFlow, changes are pushed here automatically.
- When you open NoteFlow, it pulls any remote changes so your notes stay in sync across devices.
- You can also trigger a manual sync from the GitHub panel in the app.

---

You are reading this note inside NoteFlow. It lives in your GitHub repository as \`README.md\` and will stay in sync like any other note.
`;
// Root-level JSON files that sync alongside the note folders.
// folders.json / note-order.json were historically pushed but never pulled —
// fixed here as part of the v2 format work.
const METADATA_FILENAMES = ['groups.json', 'folders.json', 'section-colors.json', 'note-order.json', 'templates.json', 'ui-settings.json'];
/**
 * Cadence of the GitHub auto-sync loop (the timer itself lives in main.ts).
 * Exported so the titlebar status card can show the real interval
 * (see getActiveSyncStatus in syncProvider.ts).
 */
exports.GITHUB_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
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
/**
 * Is NoteFlow Cloud the active sync provider? Read FLAT from settings.json —
 * importing cloudSync.ts here would be a cycle (it imports this module).
 *
 * Deliberately NOT using readSettings(): that one swallows every failure into
 * `{}`, which for this guard means "Cloud is off" → the pull would delete local
 * notes because settings.json happened to be unreadable. This one is
 * **fail-closed**: an unreadable/corrupt file answers "assume Cloud is on" (no
 * deletions). A missing `cloudSync` section — the normal GitHub-only user — is
 * NOT a failure and answers false, so the deletion rule keeps working for them.
 */
function isCloudSyncEnabledFailClosed() {
    let raw;
    try {
        raw = fs_1.default.readFileSync(getSettingsPath(), 'utf-8');
    }
    catch {
        // Missing file: GitHub can't be connected either (the token lives there), so
        // pullNotes returns early — answering true here costs nothing.
        return true;
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed.cloudSync?.enabled === true;
    }
    catch {
        return true; // corrupt JSON — can't prove Cloud is off, so don't delete
    }
}
// ── Token encryption ──────────────────────────────────────────────────────────
// Prefix to distinguish safeStorage-encrypted tokens from plain base64 fallback.
// Without this, if safeStorage availability changes between encryption and
// decryption (common on Linux where keyring availability can vary), the wrong
// method would be used, causing "Ciphertext does not appear to be encrypted".
const SAFE_STORAGE_PREFIX = 'safe:';
function encryptToken(token) {
    if (electron_1.safeStorage.isEncryptionAvailable()) {
        return SAFE_STORAGE_PREFIX + electron_1.safeStorage.encryptString(token).toString('base64');
    }
    // Fallback: base64 only (less secure, but avoids blocking the feature)
    return Buffer.from(token).toString('base64');
}
function decryptToken(encrypted) {
    if (encrypted.startsWith(SAFE_STORAGE_PREFIX)) {
        return electron_1.safeStorage.decryptString(Buffer.from(encrypted.slice(SAFE_STORAGE_PREFIX.length), 'base64'));
    }
    // Legacy token (no prefix): could be safeStorage-encrypted or plain base64.
    // Try safeStorage first; if it fails, fall back to plain base64.
    if (electron_1.safeStorage.isEncryptionAvailable()) {
        try {
            return electron_1.safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
        }
        catch {
            // Not a safeStorage ciphertext — treat as plain base64 fallback
        }
    }
    return Buffer.from(encrypted, 'base64').toString('utf-8');
}
const GITHUB_CLIENT_ID = 'Ov23liut9QOJ2pJFF0KR';
// ── GitHub REST API (raw https, no external deps) ─────────────────────────────
async function githubRequest(token, method, endpoint, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = https_1.default.request({
            hostname: 'api.github.com',
            path: endpoint,
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'NoteFlow-App',
                ...(payload
                    ? {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                    }
                    : {}),
            },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => {
                if (res.statusCode === 204)
                    return resolve(null);
                try {
                    const json = JSON.parse(raw);
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(json.message ?? `HTTP ${res.statusCode}`));
                    }
                    else {
                        resolve(json);
                    }
                }
                catch {
                    reject(new Error(`HTTP ${res.statusCode}: unparseable response`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('GitHub API request timed out'));
        });
        if (payload)
            req.write(payload);
        req.end();
    });
}
// Auth requests go to github.com (not api.github.com) with form-encoded body
async function githubAuthPost(path, params) {
    return new Promise((resolve, reject) => {
        const payload = new URLSearchParams(params).toString();
        const req = https_1.default.request({
            hostname: 'github.com',
            path,
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload),
                'User-Agent': 'NoteFlow-App',
            },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                }
                catch {
                    reject(new Error(`Auth request failed: ${raw}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Auth request timed out')); });
        req.write(payload);
        req.end();
    });
}
// ── GitHub API operations ─────────────────────────────────────────────────────
async function validateToken(token) {
    const user = (await githubRequest(token, 'GET', '/user'));
    return user.login;
}
async function ensureRepo(token, owner, repo) {
    try {
        await githubRequest(token, 'GET', `/repos/${owner}/${repo}`);
    }
    catch {
        await githubRequest(token, 'POST', '/user/repos', {
            name: repo,
            private: true,
            description: 'NoteFlow notes — auto-synced',
            auto_init: true,
        });
        // Brief pause for GitHub to initialize the repo
        await new Promise((r) => setTimeout(r, 1500));
        // Replace default README with informative content
        await upsertRemoteFile(token, owner, repo, 'README.md', README_CONTENT);
    }
}
// Remote paths are notes-dir-relative with forward slashes ('<dir>/<file>.md'
// for note files, bare filenames for root metadata). The Contents API accepts
// slash paths verbatim — but each SEGMENT must be URL-encoded individually
// (encoding the whole path would escape the separators).
function encodeRemotePath(relPath) {
    return relPath.split('/').map(encodeURIComponent).join('/');
}
// Cached per connection; reset on disconnect
let cachedDefaultBranch = null;
async function getDefaultBranch(token, owner, repo) {
    if (cachedDefaultBranch)
        return cachedDefaultBranch;
    const info = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}`));
    cachedDefaultBranch = info.default_branch || 'main';
    return cachedDefaultBranch;
}
/**
 * Recursive listing of every blob in the repo via the Git Trees API — the
 * Contents API only lists one directory level, the tree call returns the whole
 * folder-per-note layout in a single request.
 *
 * Do NOT catch here — let network/API errors propagate to the caller (pullNotes).
 * Returning [] on error would make the deletion logic treat all local notes as
 * "remotely deleted" and wipe them from disk when there is no internet connection.
 */
async function listRemoteTree(token, owner, repo) {
    return (await fetchRemoteTree(token, owner, repo)).blobs;
}
/** listRemoteTree plus whether GitHub truncated the listing (pullNotes needs to know). */
async function fetchRemoteTree(token, owner, repo) {
    const branch = await getDefaultBranch(token, owner, repo);
    const res = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`));
    const truncated = res?.truncated === true;
    if (truncated)
        console.warn('[GitHubSync] tree listing truncated — repo unusually large');
    const blobs = (res?.tree ?? [])
        .filter((t) => t.type === 'blob')
        .map(({ path: p, sha }) => ({ path: p, sha }));
    return { blobs, truncated };
}
/** Groups tree blobs into note directories: dir → set of .md filenames inside it. */
function groupRemoteNoteDirs(blobs) {
    const dirs = new Map();
    for (const b of blobs) {
        const i = b.path.indexOf('/');
        if (i <= 0)
            continue;
        const rest = b.path.slice(i + 1);
        if (rest.includes('/') || !rest.endsWith('.md'))
            continue; // deeper nesting / non-md: not ours
        const dir = b.path.slice(0, i);
        let set = dirs.get(dir);
        if (!set) {
            set = new Set();
            dirs.set(dir, set);
        }
        set.add(rest);
    }
    // Only dirs anchored by a note.md are notes
    for (const [dir, files] of dirs) {
        if (!files.has(noteFormat_1.NOTE_MD))
            dirs.delete(dir);
    }
    return dirs;
}
function rootFlatNoteBlobs(blobs) {
    return blobs.filter((b) => !b.path.includes('/') && b.path.endsWith('.md') && b.path !== 'README.md');
}
async function getRemoteFile(token, owner, repo, relPath) {
    try {
        const file = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`));
        const content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf-8');
        return { content, sha: file.sha };
    }
    catch {
        return null;
    }
}
// Serialized entry points — every push/delete goes through one of these two, so
// wrapping them here serializes the whole module's remote writes (see enqueueMutation).
function upsertRemoteFile(token, owner, repo, relPath, content) {
    return enqueueMutation(() => upsertRemoteFileNow(token, owner, repo, relPath, content));
}
function removeRemoteFile(token, owner, repo, relPath) {
    return enqueueMutation(() => removeRemoteFileNow(token, owner, repo, relPath));
}
function isConflictError(msg) {
    return msg.includes('is at') || msg.includes('conflict') || msg.includes('422') || msg.includes('409');
}
function isNotFoundError(msg) {
    return msg.includes('Not Found') || msg.includes('404');
}
async function upsertRemoteFileNow(token, owner, repo, relPath, content, _retrying = false) {
    let sha;
    try {
        const existing = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`));
        // Anything that isn't a plain file (a directory answers with an array) has no
        // usable sha — fall through and let the PUT decide, never skip on ambiguity.
        if (typeof existing.sha === 'string')
            sha = existing.sha;
    }
    catch {
        // File doesn't exist yet — will be created
    }
    // ⚠️ A PUT only happens when the content actually differs. The Contents API's
    // `sha` IS the git blob sha, so the GET we already need for the concurrency
    // token also answers "would this change anything?" for free. GitHub accepts an
    // identical PUT and commits it anyway (a commit whose tree equals its parent's):
    // saving one note re-queues its whole dir, so a note with 8 sections produced 8
    // empty commits — ~24% of the user's repo history. Callers that count this as
    // `pushed` and clear the journal stay correct: the remote already holds exactly
    // this content, so the intent IS satisfied.
    if (sha !== undefined && sha === (0, mirrorPlan_1.gitBlobSha)(content))
        return;
    // note.md carries the title; section files fall back to '<dir>/<file>' label
    const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
    const label = titleMatch ? titleMatch[1].trim() : relPath.replace(/\.md$/, '');
    try {
        await githubRequest(token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`, {
            message: sha ? `update: ${label}` : `add: ${label}`,
            content: Buffer.from(content).toString('base64'),
            ...(sha ? { sha } : {}),
        });
    }
    catch (err) {
        // SHA conflict: another push updated the file between our GET and PUT.
        // Re-fetch the current SHA and retry once.
        const msg = err instanceof Error ? err.message : String(err);
        if (!_retrying && isConflictError(msg)) {
            await upsertRemoteFileNow(token, owner, repo, relPath, content, true);
            return;
        }
        throw err;
    }
}
async function removeRemoteFileNow(token, owner, repo, relPath, _retrying = false) {
    let sha;
    try {
        const existing = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`));
        sha = existing.sha;
    }
    catch (err) {
        // GET failed: a real 404 means it's already gone (success); anything else is a
        // transient error we must surface so the delete isn't silently dropped.
        const msg = err instanceof Error ? err.message : String(err);
        if (isNotFoundError(msg))
            return;
        throw err;
    }
    try {
        await githubRequest(token, 'DELETE', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`, { message: `delete: ${relPath}`, sha });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // SHA moved under us (another commit landed first) — re-fetch and retry once.
        if (!_retrying && isConflictError(msg)) {
            await removeRemoteFileNow(token, owner, repo, relPath, true);
            return;
        }
        if (isNotFoundError(msg))
            return; // already deleted — fine
        throw err;
    }
}
// ── Module state ──────────────────────────────────────────────────────────────
let syncSettings = null;
let syncError;
let initialPullStatus = 'pending';
// Fired every time initialPullStatus changes so main.ts can broadcast to renderers.
let statusListener = null;
// Pending push timers per filename (debounce)
const pushTimers = new Map();
// ── Durable sync state (journal + reconciled-SHA cache) ───────────────────────
// Persisted in userData/sync-state.json — LOCAL device state, deliberately kept
// out of the notes dir so it never syncs. The journal records every pending
// remote mutation so a failed push/delete survives restarts and gets retried
// (retrySyncJournal); the SHA cache lets pullNotes skip unchanged dirs/files
// without a per-file GET. All transition logic is pure in syncState.ts.
let syncState = null;
function getSyncStatePath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'sync-state.json');
}
function getState() {
    if (!syncState) {
        let raw = null;
        try {
            raw = fs_1.default.readFileSync(getSyncStatePath(), 'utf-8');
        }
        catch {
            raw = null; // missing file — start empty
        }
        syncState = (0, syncState_1.parseSyncState)(raw); // corrupt content also degrades to empty
    }
    return syncState;
}
function persistState() {
    try {
        fs_1.default.writeFileSync(getSyncStatePath(), (0, syncState_1.serializeSyncState)(getState()), 'utf-8');
    }
    catch (err) {
        // Never let state persistence block sync itself.
        console.error('[GitHubSync] failed to persist sync-state.json:', String(err));
    }
}
// ── Remote-mutation serialization ──────────────────────────────────────────────
// The GitHub Contents API commits one change at a time per branch: every PUT/DELETE
// moves the branch HEAD, so a concurrent write holding a now-stale file SHA gets a
// 409/422 conflict. Firing many writes at once (e.g. a batch delete, or saving a
// multi-section note) used to race and silently drop some — the next pull then
// "restored" the lost remote change locally. We funnel ALL remote mutations through
// this single promise chain so they run strictly one-at-a-time. `pendingMutations`
// also lets the auto-sync pull stand down while writes are still draining, closing
// the window where a pull could re-add a note whose remote delete hasn't landed yet.
let mutationChain = Promise.resolve();
let pendingMutations = 0;
function enqueueMutation(task) {
    pendingMutations++;
    const run = mutationChain.then(task, task);
    // Keep the chain alive regardless of individual task outcomes.
    mutationChain = run.then(() => { pendingMutations--; }, () => { pendingMutations--; });
    return run;
}
/** True while remote writes/deletes are queued or in flight (auto-sync defers). */
function hasPendingRemoteMutations() {
    return pendingMutations > 0;
}
let deviceFlow = null;
// ── Public API ────────────────────────────────────────────────────────────────
function loadSyncSettings() {
    const settings = readSettings();
    syncSettings = settings.githubSync ?? { enabled: false };
    return syncSettings;
}
function getSyncStatus() {
    const s = syncSettings ?? loadSyncSettings();
    return {
        enabled: s.enabled,
        connected: !!(s.encryptedToken && s.owner && s.repo),
        owner: s.owner,
        repo: s.repo,
        lastSync: s.lastSync,
        error: syncError,
        initialPullStatus,
    };
}
/**
 * Marks GitHub Sync as needing a full reconcile on its next pull. Called when
 * NoteFlow Cloud takes over (`enableCloudSync`): from that moment GitHub is
 * paused and its `lastSync` stays frozen while notes keep being created/pulled
 * by Cloud, so `lastSync` no longer means "the remote knew everything on disk"
 * and the pull's local-deletion rule would wipe live notes. The next successful
 * pull skips that rule, re-uploads every note dir and clears the flag.
 *
 * Writes BOTH the in-memory cache and settings.json in one go: every push does
 * `settings.githubSync = syncSettings`, so a plain read/write from outside this
 * module would be clobbered by the next push.
 * No-op when there is no connected repo (nothing to reconcile).
 */
function markNeedsFullReconcile() {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.encryptedToken || !s.owner || !s.repo)
        return;
    if (s.needsFullReconcile)
        return;
    syncSettings = { ...s, needsFullReconcile: true };
    const settings = readSettings();
    settings.githubSync = syncSettings;
    writeSettings(settings);
}
function setInitialPullStatus(status) {
    if (initialPullStatus === status)
        return;
    initialPullStatus = status;
    statusListener?.();
}
function onStatusChanged(cb) {
    statusListener = cb;
}
// Starts Device Flow. Returns the user_code to display + verification URL to open.
// onComplete is called when auth succeeds or fails (from background polling).
async function initiateDeviceFlow(repo, notesDir, onComplete) {
    // Cancel any existing flow
    cancelDeviceFlow();
    try {
        const data = await githubAuthPost('/login/device/code', {
            client_id: GITHUB_CLIENT_ID,
            scope: 'repo',
        });
        if (data.error) {
            return { ok: false, error: data.error_description ?? data.error };
        }
        deviceFlow = {
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri: data.verification_uri,
            expiresAt: Date.now() + parseInt(data.expires_in) * 1000,
            interval: parseInt(data.interval) || 5,
            pendingRepo: repo,
        };
        // Start polling in background
        schedulePoll(notesDir, onComplete);
        return {
            ok: true,
            userCode: data.user_code,
            verificationUri: data.verification_uri,
        };
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { ok: false, error };
    }
}
function schedulePoll(notesDir, onComplete) {
    if (!deviceFlow)
        return;
    const intervalMs = deviceFlow.interval * 1000;
    deviceFlow.pollTimer = setTimeout(async () => {
        if (!deviceFlow)
            return;
        if (Date.now() > deviceFlow.expiresAt) {
            deviceFlow = null;
            onComplete({ ok: false, error: 'Authorization code expired. Please try again.' });
            return;
        }
        try {
            const data = await githubAuthPost('/login/oauth/access_token', {
                client_id: GITHUB_CLIENT_ID,
                device_code: deviceFlow.deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            });
            if (data.access_token) {
                // Auth complete — finalize connection
                const token = data.access_token;
                const repo = deviceFlow.pendingRepo;
                deviceFlow = null;
                try {
                    const owner = await validateToken(token);
                    await ensureRepo(token, owner, repo);
                    syncSettings = {
                        enabled: true,
                        encryptedToken: encryptToken(token),
                        owner,
                        repo,
                    };
                    syncError = undefined;
                    const settings = readSettings();
                    settings.githubSync = syncSettings;
                    writeSettings(settings);
                    await pullNotes(notesDir);
                    onComplete({ ok: true, owner, repo });
                    // Push local notes in the background; must not block the "connected"
                    // signal to the UI (pushAllNotes does one network request per file).
                    pushAllNotes(notesDir).catch((err) => {
                        console.error('[GitHubSync] initial pushAll failed:', String(err));
                    });
                }
                catch (err) {
                    const error = err instanceof Error ? err.message : String(err);
                    syncError = error;
                    onComplete({ ok: false, error });
                }
            }
            else if (data.error === 'authorization_pending') {
                // Still waiting — keep polling
                schedulePoll(notesDir, onComplete);
            }
            else if (data.error === 'slow_down') {
                // Increase interval as requested
                deviceFlow.interval += 5;
                schedulePoll(notesDir, onComplete);
            }
            else {
                // access_denied or other terminal error
                const error = data.error_description ?? data.error ?? 'Authorization failed';
                deviceFlow = null;
                onComplete({ ok: false, error });
            }
        }
        catch (err) {
            // Network error — retry
            schedulePoll(notesDir, onComplete);
        }
    }, intervalMs);
}
function cancelDeviceFlow() {
    if (deviceFlow?.pollTimer)
        clearTimeout(deviceFlow.pollTimer);
    deviceFlow = null;
}
function disconnectGitHub() {
    // Cancel any pending pushes
    pushTimers.forEach((t) => clearTimeout(t));
    pushTimers.clear();
    syncSettings = { enabled: false };
    syncError = undefined;
    cachedDefaultBranch = null;
    // Drop the journal + SHA cache — they describe the repo we just disconnected from.
    syncState = (0, syncState_1.emptySyncState)();
    persistState();
    setInitialPullStatus('pending');
    const settings = readSettings();
    delete settings.githubSync;
    writeSettings(settings);
}
async function pullNotes(notesDir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
        return { pulled: 0, deleted: 0, errors: [], updatedFiles: [], hadDeletions: false, hadMetadataChanges: false };
    }
    let token;
    try {
        token = decryptToken(s.encryptedToken);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const userFacingError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`;
        syncError = userFacingError;
        if (initialPullStatus === 'pending')
            setInitialPullStatus('failed');
        return {
            pulled: 0,
            deleted: 0,
            errors: [userFacingError],
            updatedFiles: [],
            hadDeletions: false,
            hadMetadataChanges: false,
        };
    }
    let pulled = 0;
    let deleted = 0;
    const errors = [];
    const updatedFiles = [];
    let hadMetadataChanges = false;
    // Set when this pass silently skipped something it should have reconciled (see
    // SyncPullResult.incomplete). Deliberately NOT an `errors` entry: those are shown
    // verbatim in Settings → Sync, and a transient GET failure isn't user-actionable.
    let incomplete = false;
    const previousLastSync = s.lastSync;
    // Read the one-shot reconcile flag BEFORE the pull touches the settings: this
    // pull must not trust `lastSync` (GitHub was paused while Cloud was on).
    const needsFullReconcile = s.needsFullReconcile === true;
    const state = getState();
    let stateChanged = false;
    try {
        const { blobs, truncated } = await fetchRemoteTree(token, s.owner, s.repo);
        // A truncated listing may be missing note folders entirely.
        if (truncated)
            incomplete = true;
        const treeShaByPath = new Map(blobs.map((b) => [b.path, b.sha]));
        const remoteNoteDirs = groupRemoteNoteDirs(blobs);
        const remoteHasMarker = blobs.some((b) => b.path === noteFormat_1.FORMAT_MARKER_FILE);
        const remoteHasFlatNotes = rootFlatNoteBlobs(blobs).length > 0;
        // Transition guard: while the remote is still (partly) on format v1 — flat
        // .md files present and no v2 marker — the pull is ADDITIVE ONLY. The
        // deletion rule below would otherwise wipe freshly-migrated local folders
        // that the remote simply doesn't have yet.
        const remoteIsV2 = remoteHasMarker && !remoteHasFlatNotes;
        // Pull each remote note directory. The note dir is the unit of conflict
        // resolution: note.md's `updated:` decides, and a newer remote wins
        // WHOLESALE (all its section files mirrored, stale local sections removed).
        for (const [dir, remoteFilesInDir] of remoteNoteDirs) {
            try {
                // Journal guard: a pending remote deleteDir means this dir was deleted
                // locally but the remote delete hasn't landed — pulling it would
                // resurrect the note.
                if ((0, syncState_1.shouldPullSkipDir)(state, dir))
                    continue;
                const anchorRel = `${dir}/${noteFormat_1.NOTE_MD}`;
                // SHA cache: if the anchor blob is exactly the one we already
                // reconciled, nothing changed remotely — skip the dir without any GET.
                const anchorTreeSha = treeShaByPath.get(anchorRel);
                if (anchorTreeSha && (0, syncState_1.getCachedSha)(state, anchorRel) === anchorTreeSha)
                    continue;
                const remoteAnchor = await getRemoteFile(token, s.owner, s.repo, anchorRel);
                if (!remoteAnchor) {
                    // The anchor IS in the tree, so null means the GET failed (getRemoteFile
                    // swallows network/403/5xx) — this folder was not reconciled.
                    incomplete = true;
                    continue;
                }
                const localDirPath = path_1.default.join(notesDir, dir);
                const localAnchorPath = path_1.default.join(localDirPath, noteFormat_1.NOTE_MD);
                if (fs_1.default.existsSync(localAnchorPath)) {
                    const localUpdatedTs = parseUpdatedTimestamp(extractUpdatedTimestamp(fs_1.default.readFileSync(localAnchorPath, 'utf-8')));
                    const remoteUpdatedTs = parseUpdatedTimestamp(extractUpdatedTimestamp(remoteAnchor.content));
                    // Skip the whole dir if local is newer or equal — decision made, so
                    // remember this remote blob as reconciled (skip it without a GET
                    // until it changes remotely again).
                    if (localUpdatedTs !== null && remoteUpdatedTs !== null && remoteUpdatedTs <= localUpdatedTs) {
                        if (anchorTreeSha && (0, syncState_1.setCachedSha)(state, anchorRel, anchorTreeSha))
                            stateChanged = true;
                        continue;
                    }
                }
                fs_1.default.mkdirSync(localDirPath, { recursive: true });
                fs_1.default.writeFileSync(localAnchorPath, remoteAnchor.content, 'utf-8');
                for (const f of remoteFilesInDir) {
                    if (f === noteFormat_1.NOTE_MD)
                        continue;
                    // Journal guard: don't resurrect a section whose remote delete is pending.
                    if ((0, syncState_1.shouldPullSkipFile)(state, `${dir}/${f}`))
                        continue;
                    const remoteSection = await getRemoteFile(token, s.owner, s.repo, `${dir}/${f}`);
                    if (remoteSection)
                        fs_1.default.writeFileSync(path_1.default.join(localDirPath, f), remoteSection.content, 'utf-8');
                }
                // Sections removed remotely → remove their local files
                try {
                    for (const lf of fs_1.default.readdirSync(localDirPath)) {
                        if (!lf.endsWith('.md') || lf === noteFormat_1.NOTE_MD)
                            continue;
                        if (!remoteFilesInDir.has(lf)) {
                            try {
                                fs_1.default.unlinkSync(path_1.default.join(localDirPath, lf));
                            }
                            catch { /* ignore */ }
                        }
                    }
                }
                catch { /* ignore */ }
                if (anchorTreeSha && (0, syncState_1.setCachedSha)(state, anchorRel, anchorTreeSha))
                    stateChanged = true;
                updatedFiles.push(localDirPath);
                pulled++;
            }
            catch (err) {
                errors.push(`${dir}: ${String(err)}`);
            }
        }
        // Delete local note dirs that no longer exist on remote.
        // Safety rule: only delete if the local note.md's `updated` timestamp is
        // older than the last sync — meaning it was known to the remote at some
        // point and was since deleted. Dirs newer than lastSync were created
        // locally after the last sync and haven't been pushed yet — keep them.
        // The rule is skipped entirely while the remote is pre-v2, a full reconcile
        // is pending, NoteFlow Cloud is the active provider, or the tree listing came
        // back truncated (a dir missing from it may still exist remotely) — see
        // shouldRunDeletionRule in syncState.ts.
        // `cloudEnabled` is read fail-closed and as late as possible, so Cloud being
        // switched on mid-pull still disarms the rule.
        const cloudEnabled = isCloudSyncEnabledFailClosed();
        const lastSyncTime = s.lastSync ? new Date(s.lastSync).getTime() : null;
        const runDeletionRule = (0, syncState_1.shouldRunDeletionRule)(lastSyncTime, needsFullReconcile, cloudEnabled, remoteIsV2, truncated);
        if (runDeletionRule && lastSyncTime !== null) { // null already excluded above; repeated for narrowing
            for (const dir of (0, noteFormat_1.listNoteDirs)(notesDir)) {
                if (remoteNoteDirs.has(dir))
                    continue;
                // Journal guard: a pending upsert under this dir means its push never
                // landed — the remote absence doesn't mean "deleted remotely", and
                // removing the dir locally would lose the unpushed edit.
                if ((0, syncState_1.shouldDeletionRuleSkipDir)(state, dir))
                    continue;
                const localDirPath = path_1.default.join(notesDir, dir);
                try {
                    const localContent = fs_1.default.readFileSync(path_1.default.join(localDirPath, noteFormat_1.NOTE_MD), 'utf-8');
                    const localUpdatedTime = parseUpdatedTimestamp(extractUpdatedTimestamp(localContent));
                    if (localUpdatedTime === null)
                        continue; // can't determine age — skip to be safe
                    if (localUpdatedTime > lastSyncTime)
                        continue; // created locally after last sync, not yet pushed
                    fs_1.default.rmSync(localDirPath, { recursive: true, force: true });
                    deleted++;
                }
                catch { /* ignore */ }
            }
        }
        // Pull optional metadata JSON files used by non-note features.
        for (const metadataFilename of METADATA_FILENAMES) {
            try {
                // The tree already tells us whether the file exists and its blob SHA —
                // only GET when it differs from the last reconciled one.
                const metadataTreeSha = treeShaByPath.get(metadataFilename);
                if (!metadataTreeSha)
                    continue; // not on remote
                if ((0, syncState_1.getCachedSha)(state, metadataFilename) === metadataTreeSha)
                    continue;
                const remoteMetadata = await getRemoteFile(token, s.owner, s.repo, metadataFilename);
                if (!remoteMetadata)
                    continue;
                const metadataPath = path_1.default.join(notesDir, metadataFilename);
                const localContent = fs_1.default.existsSync(metadataPath)
                    ? fs_1.default.readFileSync(metadataPath, 'utf-8')
                    : null;
                if (localContent !== remoteMetadata.content) {
                    fs_1.default.writeFileSync(metadataPath, remoteMetadata.content, 'utf-8');
                    hadMetadataChanges = true;
                }
                if ((0, syncState_1.setCachedSha)(state, metadataFilename, metadataTreeSha))
                    stateChanged = true;
            }
            catch {
                // Optional metadata file is missing or unreadable remotely.
            }
        }
        // Keep the SHA cache bounded: drop entries for blobs gone from the tree.
        if ((0, syncState_1.pruneShas)(state, new Set(blobs.map((b) => b.path))))
            stateChanged = true;
        // Rebase on the CURRENT in-memory settings, not on the snapshot taken before
        // the network round-trips: anything written meanwhile (remoteFormatMigratedAt,
        // markNeedsFullReconcile) must not be clobbered — same pattern as
        // persistMigratedAt. The one-shot reconcile flag is consumed on the success
        // path ONLY (a failed pull must keep it, the deletion rule is still unsafe),
        // and only if THIS pull honored it: set mid-pull ⇒ it survives to the next.
        const latest = syncSettings ?? s;
        syncSettings = {
            ...latest,
            lastSync: new Date().toISOString(),
            needsFullReconcile: needsFullReconcile ? false : latest.needsFullReconcile === true,
        };
        const settings = readSettings();
        settings.githubSync = syncSettings;
        writeSettings(settings);
        syncError = undefined;
        const wasNotOk = initialPullStatus !== 'ok';
        if (wasNotOk)
            setInitialPullStatus('ok');
        // Upload catch-up, in a single call whichever conditions apply:
        // - full reconcile (first pull after Cloud took over): re-queues EVERY note
        //   dir (previousLastSync undefined) to put the stale repo back up to date.
        // - Cloud still enabled: GitHub gets no pushes while paused, so each pull
        //   uploads what landed via Cloud since the previous lastSync — that keeps
        //   lastSync trustworthy again for when Cloud is switched off.
        // - gate opening (pending/failed → ok): the historical case.
        // The tree fetched above is handed over so the catch-up can drop the files
        // the remote already holds byte-for-byte, without a single extra request.
        if (wasNotOk || needsFullReconcile || cloudEnabled) {
            const flushed = flushPendingLocalChanges(notesDir, needsFullReconcile ? undefined : previousLastSync, treeShaByPath);
            if (flushed)
                stateChanged = true;
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        syncError = msg;
        errors.push(msg);
        if (initialPullStatus === 'pending')
            setInitialPullStatus('failed');
    }
    if (stateChanged)
        persistState();
    return {
        pulled,
        deleted,
        errors,
        updatedFiles,
        hadDeletions: deleted > 0,
        hadMetadataChanges,
        ...(incomplete ? { incomplete: true } : {}),
    };
}
/**
 * Every notes-dir-relative file that participates in sync: one entry per '.md'
 * inside each note folder plus the root metadata JSONs that exist on disk.
 * Throws if the notes dir can't be walked — callers decide what that means.
 */
function listLocalSyncPaths(notesDir) {
    const relPaths = [];
    for (const dir of (0, noteFormat_1.listNoteDirs)(notesDir)) {
        for (const f of fs_1.default.readdirSync(path_1.default.join(notesDir, dir))) {
            if (f.endsWith('.md'))
                relPaths.push(`${dir}/${f}`);
        }
    }
    for (const filename of METADATA_FILENAMES) {
        if (fs_1.default.existsSync(path_1.default.join(notesDir, filename)))
            relPaths.push(filename);
    }
    return relPaths;
}
async function pushAllNotes(notesDir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return { pushed: 0, errors: [] };
    // Cancel any debounced pushes queued by flushPendingLocalChanges — pushAllNotes
    // does the same work synchronously, so leaving timers active would double-push
    // and produce duplicate commits.
    pushTimers.forEach((t) => clearTimeout(t));
    pushTimers.clear();
    let token;
    try {
        token = decryptToken(s.encryptedToken);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const userFacingError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`;
        syncError = userFacingError;
        return { pushed: 0, errors: [userFacingError] };
    }
    let pushed = 0;
    const errors = [];
    let relPaths;
    try {
        relPaths = listLocalSyncPaths(notesDir);
    }
    catch {
        return { pushed: 0, errors: [] };
    }
    let stateChanged = false;
    for (const relPath of relPaths) {
        try {
            const content = fs_1.default.readFileSync(path_1.default.join(notesDir, relPath), 'utf-8');
            await upsertRemoteFile(token, s.owner, s.repo, relPath, content);
            pushed++;
            if ((0, syncState_1.journalComplete)(getState(), relPath, 'upsert'))
                stateChanged = true;
        }
        catch (err) {
            errors.push(relPath);
            // Journal the failed upsert so retrySyncJournal picks it up later.
            // IfAbsent: must not clobber a newer delete/deleteDir intent recorded for
            // this key while the push was in flight (see journalRecordIfAbsent).
            (0, syncState_1.journalRecordIfAbsent)(getState(), relPath, 'upsert', new Date().toISOString());
            (0, syncState_1.journalFail)(getState(), relPath, 'upsert');
            stateChanged = true;
            console.error(`[GitHubSync] pushAll failed for ${relPath}:`, String(err));
        }
    }
    if (stateChanged)
        persistState();
    return { pushed, errors };
}
let mirrorInFlight = false;
/** Paths tracked by the pull's reconciled-SHA cache: note.md anchors + root metadata. */
function isShaCachedPath(relPath) {
    return relPath.endsWith(`/${noteFormat_1.NOTE_MD}`) || METADATA_FILENAMES.includes(relPath);
}
/**
 * Makes the remote repo an EXACT copy of the notes dir: uploads every file that
 * is missing or differs, DELETES every remote path that no longer exists locally
 * (strict allowlist in mirrorPlan.ts — README, the format marker and any dotfile
 * are never touched; inside a folder, only REAL remote note folders anchored by
 * note.md) and re-asserts the v2 format marker. The deletion phase is skipped
 * WHOLESALE if any local file could not be read: an incomplete local snapshot
 * makes "missing locally" mean nothing.
 *
 * Exists because GitHub becomes a write-only mirror while NoteFlow Cloud owns
 * the sync loop: it never receives deletions, and notes arriving from another
 * device with an old `updated` are not picked up by the pull's flush, so the repo
 * silently rots. The action is only offered with Cloud enabled — the gate lives
 * in main.ts (`sync:mirror-to-github`), since importing cloudSync.ts here would
 * be a cycle.
 *
 * Every remote write/delete goes through upsertRemoteFile/removeRemoteFile (the
 * serialized mutation queue) and is journaled with the same keys as the regular
 * push/delete paths — a gone note folder as ONE 'deleteDir' on '<dir>', which is
 * the key the pull's guard honors (per-file 'delete' entries would NOT stop the
 * pull from rewriting the note.md anchor).
 * ⚠️ That journal does NOT mean automatic retry here: the mirror only runs with
 * Cloud enabled, and in that state nothing drains the GitHub journal (the
 * auto-sync tick returns early and retrySyncJournal is gated on
 * initialPullStatus === 'ok'). It is crash-safety + a guard for the manual pull;
 * the real recovery is running the mirror again, and `syncError` / the returned
 * `errors` are the only signal. If Cloud is later switched off, a journaled
 * 'deleteDir' is retried via deleteRemoteDirNow, which sweeps EVERY blob under
 * the folder — exactly like deleting a note normally does.
 * On a fully clean run `lastSync` is bumped and `needsFullReconcile` is
 * consumed: after an exact mirror the repo really does know everything on disk,
 * which is what those two flags mean. Any error leaves both untouched.
 *
 * Deliberately NOT gated on `initialPullStatus === 'ok'` like the push paths:
 * that gate exists so a stale local file can't overwrite a newer remote one, and
 * overwriting the remote with the local state is precisely what the user asked
 * for here (Cloud is the source of truth, GitHub is the mirror). It also could
 * never run otherwise — while Cloud is on, the GitHub auto-sync tick is skipped,
 * so the initial pull may never have happened.
 */
async function mirrorToGitHub(notesDir) {
    const idle = { pushed: 0, deleted: 0, skipped: 0, errors: [], warnings: [] };
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return { ok: false, ...idle, error: 'not-connected' };
    // Reentrancy guard: a double click must not run two passes (they would fight
    // over the same paths in the mutation queue).
    if (mirrorInFlight)
        return { ok: false, ...idle, error: 'in-progress' };
    let token;
    try {
        token = decryptToken(s.encryptedToken);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const userFacingError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`;
        syncError = userFacingError;
        statusListener?.();
        return { ok: false, ...idle, errors: [userFacingError], error: 'token' };
    }
    const owner = s.owner;
    const repo = s.repo;
    // Taken BEFORE reading disk: on a clean run this becomes `lastSync`, so a note
    // written WHILE the mirror ran keeps `updated > lastSync` and is never exposed
    // to the pull's deletion rule (it just wasn't part of this snapshot).
    const startedAt = new Date().toISOString();
    const observedNeedsFullReconcile = s.needsFullReconcile === true;
    // Same reason as pushAllNotes: this uploads the current on-disk content
    // synchronously, so leaving debounced timers armed would double-push.
    pushTimers.forEach((t) => clearTimeout(t));
    pushTimers.clear();
    mirrorInFlight = true;
    let pushed = 0;
    let deleted = 0;
    let skipped = 0;
    const errors = [];
    const warnings = [];
    const state = getState();
    let stateChanged = false;
    try {
        // Prove the notes dir is readable BEFORE trusting an empty local set.
        // listNoteDirs swallows a failed readdir and returns [] (deliberately
        // tolerant — other callers rely on that), which here would be
        // indistinguishable from "the user deleted every note": the plan would
        // delete every note folder from the repo AND the run would look clean
        // (lastSync bumped, needsFullReconcile consumed). Throwing sends it to the
        // outer catch instead. An EMPTY but readable dir still works — mirroring an
        // empty local state does empty the repo's notes, which is the point of the
        // action and what the confirmation dialog warns about.
        fs_1.default.readdirSync(notesDir);
        const localFiles = [];
        // An unreadable local file makes the local snapshot INCOMPLETE, and every
        // deletion decision is "the remote has it, we don't". Uploading anyway is
        // harmless, but deleting would remove live data: an unreadable note.md
        // (EACCES, antivirus lock, file in use) would look exactly like a deleted
        // note and take its whole folder off the remote.
        let localReadFailed = false;
        for (const relPath of listLocalSyncPaths(notesDir)) {
            try {
                localFiles.push({
                    path: relPath,
                    sha: (0, mirrorPlan_1.gitBlobSha)(fs_1.default.readFileSync(path_1.default.join(notesDir, relPath), 'utf-8')),
                });
            }
            catch (err) {
                // Unreadable local file: report it and keep going, but the run is no
                // longer clean (lastSync stays put — the repo isn't an exact copy).
                errors.push(`${relPath}: ${String(err)}`);
                localReadFailed = true;
            }
        }
        const blobs = await listRemoteTree(token, owner, repo);
        const plan = (0, mirrorPlan_1.planMirror)(localFiles, blobs, METADATA_FILENAMES);
        skipped = plan.unchanged.length;
        const localShaByPath = new Map(localFiles.map((f) => [f.path, f.sha]));
        // Paths the remote will hold once this run finishes — used to prune the SHA cache.
        const remainingRemote = new Set(blobs.map((b) => b.path));
        // Identical anchors/metadata are reconciled by definition: caching their SHA
        // lets the next pull skip them without a GET, and (for the metadata JSONs)
        // is what stops a stale repo from overwriting local groups/folders/order.
        for (const relPath of plan.unchanged) {
            // Clear any journaled 'upsert' for this path: a debounced push may have
            // armed (and journaled) a timer we cancelled above, and the remote already
            // holds exactly this content, so the intent IS satisfied. Leaving it would
            // strand the entry forever — shouldDeletionRuleSkipDir would then disarm
            // the pull's local-deletion rule for that note dir indefinitely.
            if ((0, syncState_1.journalComplete)(state, relPath, 'upsert'))
                stateChanged = true;
            if (!isShaCachedPath(relPath))
                continue;
            if ((0, syncState_1.setCachedSha)(state, relPath, localShaByPath.get(relPath)))
                stateChanged = true;
        }
        for (const relPath of plan.toUpload) {
            try {
                const content = fs_1.default.readFileSync(path_1.default.join(notesDir, relPath), 'utf-8');
                await upsertRemoteFile(token, owner, repo, relPath, content);
                pushed++;
                remainingRemote.add(relPath);
                if ((0, syncState_1.journalComplete)(state, relPath, 'upsert'))
                    stateChanged = true;
                if (isShaCachedPath(relPath) && (0, syncState_1.setCachedSha)(state, relPath, (0, mirrorPlan_1.gitBlobSha)(content)))
                    stateChanged = true;
            }
            catch (err) {
                errors.push(`${relPath}: ${String(err)}`);
                // Journal the failed upsert so retrySyncJournal picks it up later.
                // IfAbsent: must not clobber a newer delete/deleteDir intent recorded for
                // this key while the push was in flight (see journalRecordIfAbsent).
                (0, syncState_1.journalRecordIfAbsent)(state, relPath, 'upsert', new Date().toISOString());
                (0, syncState_1.journalFail)(state, relPath, 'upsert');
                stateChanged = true;
                console.error(`[GitHubSync] mirror upload failed for ${relPath}:`, String(err));
            }
        }
        // Deletions only run on a COMPLETE local snapshot — see localReadFailed.
        if (localReadFailed) {
            // A CODE, not a sentence: this one is our own user-facing text, so the
            // renderer translates it (the raw strings in `errors` are GitHub's).
            warnings.push('deletions-skipped-unreadable');
            console.warn('[GitHubSync] mirror: skipping deletions, local snapshot incomplete');
        }
        else {
            for (const entry of plan.toDelete) {
                // Journal BEFORE attempting it: a lost remote delete makes the file
                // reappear on the next pull, so it must survive a crash/outage. A whole
                // note folder is ONE 'deleteDir' op keyed by '<dir>' (see MirrorDeletion):
                // that is the only key the pull's guard honors for the note.md anchor.
                // Note journalRecord('deleteDir') drops any file-level op under '<dir>/',
                // which is why the per-file entries of a gone folder are never recorded.
                // persistState() right here (like scheduleDelete/scheduleDeleteDir): the
                // finally-block flush is too late — a crash mid-folder would leave the
                // repo half-deleted with NO journal entry, and the next manual pull would
                // resurrect the note from the note.md still sitting on the remote.
                if ((0, syncState_1.journalRecord)(state, entry.key, entry.op, new Date().toISOString()))
                    persistState();
                let failed = false;
                for (const relPath of entry.paths) {
                    try {
                        await removeRemoteFile(token, owner, repo, relPath);
                        deleted++;
                        remainingRemote.delete(relPath);
                    }
                    catch (err) {
                        // One blob failing must not abort the rest of the folder, but the
                        // entry stays journaled so the whole delete is retried as a unit.
                        failed = true;
                        errors.push(`${relPath}: ${String(err)}`);
                        syncError = `Failed to delete ${relPath} on GitHub: ${String(err)}`;
                        console.error('[GitHubSync] mirror delete failed:', String(err));
                    }
                }
                if (failed) {
                    (0, syncState_1.journalFail)(state, entry.key, entry.op);
                    stateChanged = true;
                }
                else if ((0, syncState_1.journalComplete)(state, entry.key, entry.op)) {
                    stateChanged = true;
                }
            }
        }
        // A mirror asserts "the remote is v2" — make sure the marker says so.
        if (!remainingRemote.has(noteFormat_1.FORMAT_MARKER_FILE)) {
            try {
                await upsertRemoteFile(token, owner, repo, noteFormat_1.FORMAT_MARKER_FILE, `${noteFormat_1.NOTE_FORMAT_VERSION}\n`);
                remainingRemote.add(noteFormat_1.FORMAT_MARKER_FILE);
            }
            catch (err) {
                errors.push(`${noteFormat_1.FORMAT_MARKER_FILE}: ${String(err)}`);
            }
        }
        if ((0, syncState_1.pruneShas)(state, remainingRemote))
            stateChanged = true;
        if (errors.length === 0) {
            // Rebase on the CURRENT settings, never on the `s` snapshot taken before
            // the network round-trips (same pattern as persistMigratedAt): anything
            // written meanwhile — remoteFormatMigratedAt, markNeedsFullReconcile —
            // must survive. The one-shot flag is only consumed if THIS run observed it.
            const latest = syncSettings ?? s;
            syncSettings = {
                ...latest,
                lastSync: startedAt,
                needsFullReconcile: observedNeedsFullReconcile ? false : latest.needsFullReconcile === true,
            };
            const settings = readSettings();
            settings.githubSync = syncSettings;
            writeSettings(settings);
            syncError = undefined;
        }
    }
    catch (err) {
        // Tree listing / notes-dir walk failed — nothing was reconciled.
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        syncError = msg;
        console.error('[GitHubSync] mirror failed:', msg);
    }
    finally {
        mirrorInFlight = false;
        if (stateChanged)
            persistState();
        statusListener?.();
    }
    return { ok: errors.length === 0, pushed, deleted, skipped, errors, warnings };
}
/**
 * Pushes a specific set of notes-dir-relative files NOW (awaited, no debounce),
 * reading their current content from disk. Used by bulk imports: the per-file
 * `schedulePush` path bumps `lastSync` to "now" on each completion, so while a
 * large batch drains, a racing auto-sync pull sees the not-yet-pushed notes as
 * `updated <= lastSync` and DELETES them. Landing them on the remote up front
 * makes them immune to that deletion (the pull keeps any dir present remotely).
 * Does NOT bump `lastSync` (the freshly-imported notes are newer than it, and
 * leaving it untouched avoids exposing OTHER pending local notes to deletion).
 * No-op while the push gate is closed — `flushPendingLocalChanges` will push
 * them after the first successful pull.
 */
async function pushPathsNow(notesDir, relPaths) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return { pushed: 0, errors: [] };
    if (initialPullStatus !== 'ok')
        return { pushed: 0, errors: [] };
    let token;
    try {
        token = decryptToken(s.encryptedToken);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        syncError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`;
        return { pushed: 0, errors: [syncError] };
    }
    let pushed = 0;
    const errors = [];
    let stateChanged = false;
    for (const relPath of relPaths) {
        // Supersede any debounced timer for this path — we're pushing it now.
        const existing = pushTimers.get(relPath);
        if (existing) {
            clearTimeout(existing);
            pushTimers.delete(relPath);
        }
        try {
            const content = fs_1.default.readFileSync(path_1.default.join(notesDir, relPath), 'utf-8');
            await upsertRemoteFile(token, s.owner, s.repo, relPath, content);
            pushed++;
            if ((0, syncState_1.journalComplete)(getState(), relPath, 'upsert'))
                stateChanged = true;
        }
        catch (err) {
            errors.push(relPath);
            // Journal the failed upsert so retrySyncJournal picks it up later.
            // IfAbsent: must not clobber a newer delete/deleteDir intent recorded for
            // this key while the push was in flight (see journalRecordIfAbsent).
            (0, syncState_1.journalRecordIfAbsent)(getState(), relPath, 'upsert', new Date().toISOString());
            (0, syncState_1.journalFail)(getState(), relPath, 'upsert');
            stateChanged = true;
            console.error(`[GitHubSync] pushPathsNow failed for ${relPath}:`, String(err));
        }
    }
    if (stateChanged)
        persistState();
    if (pushed > 0)
        syncError = undefined;
    return { pushed, errors };
}
/**
 * Debounced single-file push. `relPath` is the notes-dir-relative remote path
 * ('<dir>/<file>.md' for note files, '<name>.json' for root metadata) and is
 * also the debounce key — two files of the same note debounce independently.
 */
function schedulePush(relPath, content, onStart, onComplete) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
        onComplete?.();
        return;
    }
    // Gate: defer pushes until the initial pull has succeeded — otherwise a stale
    // local file could overwrite a newer remote version (data loss). The on-disk
    // write already happened in the caller, so no data is lost by deferring.
    // Pending changes are flushed automatically when pullNotes transitions to 'ok'.
    if (initialPullStatus !== 'ok') {
        console.warn(`[GitHubSync] Push deferred for ${relPath}: initialPullStatus=${initialPullStatus}`);
        onComplete?.(`sync-gated:${initialPullStatus}`);
        return;
    }
    schedulePushUnguarded(relPath, content, onStart, onComplete);
}
function schedulePushUnguarded(relPath, content, onStart, onComplete) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
        onComplete?.();
        return;
    }
    // Debounce: reset timer if already queued for this file.
    // Previous callbacks are intentionally discarded — the new call supersedes them.
    const existing = pushTimers.get(relPath);
    if (existing)
        clearTimeout(existing);
    // Journal the pending upsert at timer-arming time (not when it fires) so it
    // survives the app closing during the debounce window. Cleared on success;
    // kept on failure so retrySyncJournal re-pushes the on-disk content later.
    if ((0, syncState_1.journalRecord)(getState(), relPath, 'upsert', new Date().toISOString()))
        persistState();
    const timer = setTimeout(async () => {
        pushTimers.delete(relPath);
        onStart?.(); // timer fired → HTTP request is about to start
        try {
            const token = decryptToken(s.encryptedToken);
            await upsertRemoteFile(token, s.owner, s.repo, relPath, content);
            if ((0, syncState_1.journalComplete)(getState(), relPath, 'upsert'))
                persistState();
            // Rebase on the CURRENT settings, never on the `s` captured when the timer
            // was armed: this closure can outlive it by minutes (5s debounce + the
            // serialized mutation queue), and spreading the stale snapshot would drop
            // whatever was written meanwhile — e.g. needsFullReconcile, silently
            // re-arming the deletion rule. Same pattern as persistMigratedAt.
            const latest = syncSettings ?? s;
            syncSettings = { ...latest, lastSync: new Date().toISOString() };
            const settings = readSettings();
            settings.githubSync = syncSettings;
            writeSettings(settings);
            syncError = undefined;
            onComplete?.();
        }
        catch (err) {
            // Re-record before failing: the entry may have been completed by a racing
            // retrySyncJournal while this push was in flight — journalFail alone would
            // be a no-op then and the failed push would be silently lost (same pattern
            // as the pushPathsNow/pushAllNotes catch blocks). IfAbsent: must not
            // clobber a newer delete/deleteDir intent recorded for this key while the
            // push was in flight — e.g. scheduleDelete of this very section — or a
            // correlated delete failure would leave an 'upsert' entry for a locally
            // deleted file, which the retry then DISCARDS: remote delete lost.
            (0, syncState_1.journalRecordIfAbsent)(getState(), relPath, 'upsert', new Date().toISOString());
            (0, syncState_1.journalFail)(getState(), relPath, 'upsert');
            persistState();
            syncError = err instanceof Error ? err.message : String(err);
            console.error('[GitHubSync] push failed:', syncError);
            onComplete?.(syncError);
        }
    }, 5000); // 5s debounce — avoids spamming API while typing
    pushTimers.set(relPath, timer);
}
// Called when pullNotes transitions from pending/failed → ok (and on every pull
// while Cloud owns the writes, or when a full reconcile is pending). Scans the
// note directories and re-queues pushes for every file of any note whose note.md
// is newer than the previous lastSync (i.e. edits the push gate never saw).
// Survives restarts: detection is purely on-disk.
//
// The note.md timestamp can't tell WHICH section changed, so the dir-level gate
// selects the whole folder; `remoteShaByPath` (the tree the pull ALREADY fetched)
// then drops file by file whatever the remote holds byte-for-byte. Without it a
// title edit on a note with 8 sections queued 9 pushes, 8 of them no-ops.
// Returns true when the journal changed — the caller persists the state.
function flushPendingLocalChanges(notesDir, previousLastSync, remoteShaByPath) {
    const lastSyncMs = previousLastSync ? Date.parse(previousLastSync) : null;
    const state = getState();
    let stateChanged = false;
    for (const dir of (0, noteFormat_1.listNoteDirs)(notesDir)) {
        const dirPath = path_1.default.join(notesDir, dir);
        try {
            const anchor = fs_1.default.readFileSync(path_1.default.join(dirPath, noteFormat_1.NOTE_MD), 'utf-8');
            const updatedMs = parseUpdatedTimestamp(extractUpdatedTimestamp(anchor));
            if (updatedMs === null)
                continue;
            if (lastSyncMs !== null && updatedMs <= lastSyncMs)
                continue;
            for (const f of fs_1.default.readdirSync(dirPath)) {
                if (!f.endsWith('.md'))
                    continue;
                const relPath = `${dir}/${f}`;
                try {
                    const content = fs_1.default.readFileSync(path_1.default.join(dirPath, f), 'utf-8');
                    if ((0, mirrorPlan_1.remoteHasContent)(remoteShaByPath, relPath, content)) {
                        // Same reasoning as the mirror's `unchanged` pass: the remote already
                        // has this content, so a journaled 'upsert' (a debounce timer armed
                        // before the app closed, or a push that failed) is satisfied. Leaving
                        // it stranded would disarm the pull's local-deletion rule for this dir
                        // forever (shouldDeletionRuleSkipDir).
                        if ((0, syncState_1.journalComplete)(state, relPath, 'upsert'))
                            stateChanged = true;
                        continue;
                    }
                    schedulePushUnguarded(relPath, content);
                }
                catch { /* unreadable file — skip */ }
            }
        }
        catch {
            // Unreadable dir — skip.
        }
    }
    return stateChanged;
}
/** Removes a single remote file ('<dir>/<file>.md') — used for dropped sections. */
async function scheduleDelete(relPath) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return;
    // Cancel any pending push for this file before deleting
    const existing = pushTimers.get(relPath);
    if (existing) {
        clearTimeout(existing);
        pushTimers.delete(relPath);
    }
    // Journal the delete before attempting it — a lost remote delete makes the
    // section resurrect on the next pull. Also supersedes any journaled upsert
    // for this path.
    if ((0, syncState_1.journalRecord)(getState(), relPath, 'delete', new Date().toISOString()))
        persistState();
    try {
        const token = decryptToken(s.encryptedToken);
        await removeRemoteFile(token, s.owner, s.repo, relPath);
        if ((0, syncState_1.journalComplete)(getState(), relPath, 'delete'))
            persistState();
    }
    catch (err) {
        (0, syncState_1.journalFail)(getState(), relPath, 'delete');
        persistState();
        syncError = `Failed to delete ${relPath} on GitHub: ${String(err)}`;
        console.error('[GitHubSync] delete failed:', String(err));
    }
}
/**
 * Deletes every remote blob under '<dir>/'. One blob failure must not abort the
 * rest (a half-deleted dir would be re-pulled on the next sync), but the call
 * THROWS if any blob failed so callers journal it for retry.
 */
async function deleteRemoteDirNow(token, owner, repo, dir) {
    const blobs = await listRemoteTree(token, owner, repo);
    const targets = blobs.filter((b) => b.path.startsWith(`${dir}/`));
    let failures = 0;
    let lastError = '';
    for (const b of targets) {
        try {
            await removeRemoteFile(token, owner, repo, b.path);
        }
        catch (err) {
            failures++;
            lastError = String(err);
            console.error(`[GitHubSync] delete dir blob failed for ${b.path}:`, String(err));
        }
    }
    if (failures > 0)
        throw new Error(`${failures} file(s) could not be deleted (${lastError})`);
}
/** Removes a whole remote note directory (every blob under '<dir>/'). */
async function scheduleDeleteDir(dir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return;
    // Cancel any pending pushes for files inside this dir
    for (const key of [...pushTimers.keys()]) {
        if (key.startsWith(`${dir}/`)) {
            clearTimeout(pushTimers.get(key));
            pushTimers.delete(key);
        }
    }
    // Journal the dir delete before attempting it (also drops any file-level ops
    // under the dir — they are superseded). A lost remote delete makes the note
    // resurrect on the next pull, so failures keep the entry for retry.
    if ((0, syncState_1.journalRecord)(getState(), dir, 'deleteDir', new Date().toISOString()))
        persistState();
    try {
        const token = decryptToken(s.encryptedToken);
        await deleteRemoteDirNow(token, s.owner, s.repo, dir);
        if ((0, syncState_1.journalComplete)(getState(), dir, 'deleteDir'))
            persistState();
    }
    catch (err) {
        (0, syncState_1.journalFail)(getState(), dir, 'deleteDir');
        persistState();
        syncError = `Failed to delete note folder "${dir}" on GitHub: ${String(err)}`;
        console.error('[GitHubSync] delete dir failed:', String(err));
    }
}
// ── Journal retry (durability for failed remote mutations) ───────────────────
let retryInFlight = false;
/**
 * Drains the persistent journal of pending remote mutations, executing each op:
 * upserts re-read the CURRENT on-disk content (an upsert whose local file is
 * gone is discarded — its removal is covered by its own delete/deleteDir
 * entry); deletes/deleteDirs re-run the remote removal. Successful ops leave
 * the journal; failed ones stay (attempts++) for the next round — there is no
 * attempt cap that would silently drop a delete (a lost remote delete = a note
 * that resurrects). Called from main.ts on every auto-sync tick BEFORE
 * pullNotes, and once after the initial pull succeeds.
 *
 * Retried upserts do NOT bump `lastSync` — same rationale as pushPathsNow:
 * bumping it would expose OTHER still-pending local notes to the pull's
 * deletion rule.
 *
 * Gated on initialPullStatus === 'ok' like regular pushes: retrying before the
 * first successful pull could overwrite a newer remote version.
 */
async function retrySyncJournal(notesDir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return;
    if (initialPullStatus !== 'ok')
        return;
    if (retryInFlight)
        return;
    const state = getState();
    const entries = Object.entries(state.ops)
        .sort((a, b) => a[1].queuedAt.localeCompare(b[1].queuedAt));
    if (entries.length === 0)
        return;
    retryInFlight = true;
    try {
        let token;
        try {
            token = decryptToken(s.encryptedToken);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            syncError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`;
            return;
        }
        const owner = s.owner;
        const repo = s.repo;
        for (const [key, entry] of entries) {
            // A live debounce timer for this path will push fresher content shortly —
            // let it handle the upsert instead of racing it here.
            if (entry.op === 'upsert' && pushTimers.has(key))
                continue;
            const action = (0, syncState_1.resolveRetryAction)(entry.op, fs_1.default.existsSync(path_1.default.join(notesDir, key)));
            if (action === 'discard') {
                if ((0, syncState_1.journalComplete)(state, key, entry.op))
                    persistState();
                continue;
            }
            try {
                if (action === 'upsert') {
                    const content = fs_1.default.readFileSync(path_1.default.join(notesDir, key), 'utf-8');
                    await upsertRemoteFile(token, owner, repo, key, content);
                    // Race guard: if the user edited this file WHILE the retry push was in
                    // flight, schedulePushUnguarded armed a new debounce timer and its
                    // journalRecord was a same-op no-op (the entry we're retrying was kept).
                    // Completing it here would erase that NEWER intent — if the app closed
                    // during the debounce window, the fresh edit would be lost from the
                    // journal. Leave the entry alive; the pending timer will complete or
                    // fail it.
                    if (pushTimers.has(key))
                        continue;
                }
                else if (action === 'delete') {
                    await removeRemoteFile(token, owner, repo, key);
                }
                else {
                    await deleteRemoteDirNow(token, owner, repo, key);
                }
                if ((0, syncState_1.journalComplete)(state, key, entry.op))
                    persistState();
            }
            catch (err) {
                (0, syncState_1.journalFail)(state, key, entry.op);
                persistState();
                syncError = `Sync retry (${entry.op} ${key}) failed: ${String(err)}`;
                console.error(`[GitHubSync] journal retry failed for ${entry.op} ${key}:`, String(err));
            }
        }
    }
    finally {
        retryInFlight = false;
    }
}
// ── One-time remote format migration (v1 flat files → v2 folders) ────────────
let remoteMigrationInFlight = false;
/**
 * Brings the remote repo to format v2: converts any remaining root-level flat
 * note files into folders, pushes every local note folder, deletes the old
 * flat files and finally uploads the `.noteflow-format` marker. Idempotent and
 * cheap once done (guarded by `remoteFormatMigratedAt` in settings).
 *
 * Sequencing safety: callers run this AFTER a successful pull (which is
 * additive-only while the remote is v1), and the marker is pushed LAST so
 * other v2 clients keep their deletion logic disabled until the conversion
 * has fully landed. Returns true when a migration actually ran.
 */
async function migrateRemoteToV2IfNeeded(notesDir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return false;
    if (s.remoteFormatMigratedAt)
        return false;
    if (initialPullStatus !== 'ok')
        return false;
    if (remoteMigrationInFlight)
        return false;
    remoteMigrationInFlight = true;
    try {
        const token = decryptToken(s.encryptedToken);
        const blobs = await listRemoteTree(token, s.owner, s.repo);
        const hasMarker = blobs.some((b) => b.path === noteFormat_1.FORMAT_MARKER_FILE);
        const flatNotes = rootFlatNoteBlobs(blobs);
        if (hasMarker && flatNotes.length === 0) {
            // Remote already fully v2 (migrated by another device) — just record it.
            persistMigratedAt(s);
            return false;
        }
        console.log(`[GitHubSync] migrating remote to format v2 (${flatNotes.length} flat note(s))`);
        // 1) Convert remote flat notes locally first so nothing is lost: notes that
        //    only exist remotely (or are NEWER remotely — an old client pushed after
        //    our local migration) are written as local folders before deletion.
        for (const blob of flatNotes) {
            try {
                const remote = await getRemoteFile(token, s.owner, s.repo, blob.path);
                if (!remote)
                    continue;
                const dir = blob.path.replace(/\.md$/i, '');
                const localAnchorPath = path_1.default.join(notesDir, dir, noteFormat_1.NOTE_MD);
                if (fs_1.default.existsSync(localAnchorPath)) {
                    const localTs = parseUpdatedTimestamp(extractUpdatedTimestamp(fs_1.default.readFileSync(localAnchorPath, 'utf-8')));
                    const remoteTs = parseUpdatedTimestamp(extractUpdatedTimestamp(remote.content));
                    if (localTs !== null && remoteTs !== null && remoteTs <= localTs)
                        continue; // local folder is current
                }
                const note = (0, noteFormat_1.parseLegacyNoteRaw)(remote.content);
                const { files } = (0, noteFormat_1.serializeNoteFolder)(note, { preserveUpdated: true });
                fs_1.default.mkdirSync(path_1.default.join(notesDir, dir), { recursive: true });
                for (const [f, content] of Object.entries(files)) {
                    fs_1.default.writeFileSync(path_1.default.join(notesDir, dir, f), content, 'utf-8');
                }
            }
            catch (err) {
                console.error(`[GitHubSync] remote migration: failed to convert ${blob.path}:`, String(err));
            }
        }
        // 2) Push every local note folder + metadata
        await pushAllNotes(notesDir);
        // 3) Delete the old flat files from the remote
        for (const blob of flatNotes) {
            try {
                await removeRemoteFile(token, s.owner, s.repo, blob.path);
            }
            catch (err) {
                console.error(`[GitHubSync] remote migration: failed to delete ${blob.path}:`, String(err));
            }
        }
        // 4) Marker LAST — it flips other clients into full v2 behaviour
        await upsertRemoteFile(token, s.owner, s.repo, noteFormat_1.FORMAT_MARKER_FILE, `${noteFormat_1.NOTE_FORMAT_VERSION}\n`);
        persistMigratedAt(s);
        console.log('[GitHubSync] remote format migration complete');
        return true;
    }
    finally {
        remoteMigrationInFlight = false;
    }
}
function persistMigratedAt(s) {
    // Re-read the live settings — a debounced push may have bumped lastSync
    // while the migration was running.
    const latest = syncSettings ?? s;
    syncSettings = { ...latest, remoteFormatMigratedAt: new Date().toISOString() };
    const settings = readSettings();
    settings.githubSync = syncSettings;
    writeSettings(settings);
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function extractUpdatedTimestamp(content) {
    const match = content.match(/^updated:\s*['"]?([^'"\n]+)['"]?\s*$/m);
    return match ? match[1].trim() : null;
}
function parseUpdatedTimestamp(value) {
    if (!value)
        return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
