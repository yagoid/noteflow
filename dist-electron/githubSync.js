"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSyncSettings = loadSyncSettings;
exports.getSyncStatus = getSyncStatus;
exports.initiateDeviceFlow = initiateDeviceFlow;
exports.cancelDeviceFlow = cancelDeviceFlow;
exports.disconnectGitHub = disconnectGitHub;
exports.pullNotes = pullNotes;
exports.pushAllNotes = pushAllNotes;
exports.schedulePush = schedulePush;
exports.scheduleDelete = scheduleDelete;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
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
const GROUPS_FILENAME = 'groups.json';
const SECTION_COLORS_FILENAME = 'section-colors.json';
const METADATA_FILENAMES = [GROUPS_FILENAME, SECTION_COLORS_FILENAME];
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
async function listRemoteNotes(token, owner, repo) {
    try {
        const files = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/`));
        return Array.isArray(files) ? files.filter((f) => f.type === 'file' && f.name.endsWith('.md')) : [];
    }
    catch {
        return [];
    }
}
async function getRemoteFile(token, owner, repo, filename) {
    try {
        const file = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`));
        const content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf-8');
        return { content, sha: file.sha };
    }
    catch {
        return null;
    }
}
async function upsertRemoteFile(token, owner, repo, filename, content, _retrying = false) {
    let sha;
    try {
        const existing = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`));
        sha = existing.sha;
    }
    catch {
        // File doesn't exist yet — will be created
    }
    const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
    const label = titleMatch ? titleMatch[1].trim() : filename.replace(/\.md$/, '');
    try {
        await githubRequest(token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`, {
            message: sha ? `update: ${label}` : `add: ${label}`,
            content: Buffer.from(content).toString('base64'),
            ...(sha ? { sha } : {}),
        });
    }
    catch (err) {
        // SHA conflict: another push updated the file between our GET and PUT.
        // Re-fetch the current SHA and retry once.
        const msg = err instanceof Error ? err.message : String(err);
        if (!_retrying && (msg.includes('is at') || msg.includes('conflict') || msg.includes('422') || msg.includes('409'))) {
            await upsertRemoteFile(token, owner, repo, filename, content, true);
            return;
        }
        throw err;
    }
}
async function removeRemoteFile(token, owner, repo, filename) {
    try {
        const existing = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`));
        await githubRequest(token, 'DELETE', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`, { message: `delete: ${filename}`, sha: existing.sha });
    }
    catch {
        // File doesn't exist remotely — nothing to do
    }
}
// ── Module state ──────────────────────────────────────────────────────────────
let syncSettings = null;
let syncError;
// Pending push timers per filename (debounce)
const pushTimers = new Map();
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
    };
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
                    await pushAllNotes(notesDir);
                    onComplete({ ok: true, owner, repo });
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
    try {
        const remoteFiles = await listRemoteNotes(token, s.owner, s.repo);
        for (const file of remoteFiles) {
            try {
                const remote = await getRemoteFile(token, s.owner, s.repo, file.name);
                if (!remote)
                    continue;
                const localPath = path_1.default.join(notesDir, file.name);
                if (fs_1.default.existsSync(localPath)) {
                    const localContent = fs_1.default.readFileSync(localPath, 'utf-8');
                    const localUpdated = extractUpdatedTimestamp(localContent);
                    const remoteUpdated = extractUpdatedTimestamp(remote.content);
                    const localUpdatedTs = parseUpdatedTimestamp(localUpdated);
                    const remoteUpdatedTs = parseUpdatedTimestamp(remoteUpdated);
                    // Skip if local is newer or equal
                    if (localUpdatedTs !== null && remoteUpdatedTs !== null && remoteUpdatedTs <= localUpdatedTs)
                        continue;
                }
                fs_1.default.writeFileSync(localPath, remote.content, 'utf-8');
                updatedFiles.push(localPath);
                pulled++;
            }
            catch (err) {
                errors.push(`${file.name}: ${String(err)}`);
            }
        }
        // Delete local notes that no longer exist on remote.
        // Safety rule: only delete if the local file's `updated` timestamp is older
        // than the last sync — meaning it was known to the remote at some point and
        // was since deleted. Files newer than lastSync were created locally after the
        // last sync and haven't been pushed yet, so we must not touch them.
        const lastSyncTime = s.lastSync ? new Date(s.lastSync).getTime() : null;
        if (lastSyncTime !== null) {
            const remoteFilenames = new Set(remoteFiles.map((f) => f.name));
            let localFilenames = [];
            try {
                localFilenames = fs_1.default.readdirSync(notesDir).filter((f) => f.endsWith('.md'));
            }
            catch { /* ignore */ }
            for (const localFilename of localFilenames) {
                if (remoteFilenames.has(localFilename))
                    continue;
                const localPath = path_1.default.join(notesDir, localFilename);
                try {
                    const localContent = fs_1.default.readFileSync(localPath, 'utf-8');
                    const localUpdated = extractUpdatedTimestamp(localContent);
                    const localUpdatedTime = parseUpdatedTimestamp(localUpdated);
                    if (localUpdatedTime === null)
                        continue; // can't determine age — skip to be safe
                    if (localUpdatedTime > lastSyncTime)
                        continue; // created locally after last sync, not yet pushed
                    fs_1.default.unlinkSync(localPath);
                    deleted++;
                }
                catch { /* ignore */ }
            }
        }
        // Pull optional metadata JSON files used by non-note features.
        for (const metadataFilename of METADATA_FILENAMES) {
            try {
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
            }
            catch {
                // Optional metadata file is missing or unreadable remotely.
            }
        }
        syncSettings = { ...s, lastSync: new Date().toISOString() };
        const settings = readSettings();
        settings.githubSync = syncSettings;
        writeSettings(settings);
        syncError = undefined;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        syncError = msg;
        errors.push(msg);
    }
    return {
        pulled,
        deleted,
        errors,
        updatedFiles,
        hadDeletions: deleted > 0,
        hadMetadataChanges,
    };
}
async function pushAllNotes(notesDir) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return { pushed: 0, errors: [] };
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
    let filesToPush;
    try {
        const noteFiles = fs_1.default.readdirSync(notesDir).filter((f) => f.endsWith('.md'));
        const metadataFiles = METADATA_FILENAMES.filter((filename) => fs_1.default.existsSync(path_1.default.join(notesDir, filename)));
        filesToPush = [...noteFiles, ...metadataFiles];
    }
    catch {
        return { pushed: 0, errors: [] };
    }
    for (const filename of filesToPush) {
        try {
            const content = fs_1.default.readFileSync(path_1.default.join(notesDir, filename), 'utf-8');
            await upsertRemoteFile(token, s.owner, s.repo, filename, content);
            pushed++;
        }
        catch (err) {
            errors.push(filename);
            console.error(`[GitHubSync] pushAll failed for ${filename}:`, String(err));
        }
    }
    return { pushed, errors };
}
function schedulePush(filePath, content, onStart, onComplete) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
        onComplete?.();
        return;
    }
    const filename = path_1.default.basename(filePath);
    // Debounce: reset timer if already queued for this file.
    // Previous callbacks are intentionally discarded — the new call supersedes them.
    const existing = pushTimers.get(filename);
    if (existing)
        clearTimeout(existing);
    const timer = setTimeout(async () => {
        pushTimers.delete(filename);
        onStart?.(); // timer fired → HTTP request is about to start
        try {
            const token = decryptToken(s.encryptedToken);
            await upsertRemoteFile(token, s.owner, s.repo, filename, content);
            syncSettings = { ...s, lastSync: new Date().toISOString() };
            const settings = readSettings();
            settings.githubSync = syncSettings;
            writeSettings(settings);
            syncError = undefined;
            onComplete?.();
        }
        catch (err) {
            syncError = err instanceof Error ? err.message : String(err);
            console.error('[GitHubSync] push failed:', syncError);
            onComplete?.(syncError);
        }
    }, 5000); // 5s debounce — avoids spamming API while typing
    pushTimers.set(filename, timer);
}
async function scheduleDelete(filePath) {
    const s = syncSettings ?? loadSyncSettings();
    if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo)
        return;
    const filename = path_1.default.basename(filePath);
    // Cancel any pending push for this file before deleting
    const existing = pushTimers.get(filename);
    if (existing) {
        clearTimeout(existing);
        pushTimers.delete(filename);
    }
    try {
        const token = decryptToken(s.encryptedToken);
        await removeRemoteFile(token, s.owner, s.repo, filename);
    }
    catch (err) {
        console.error('[GitHubSync] delete failed:', String(err));
    }
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
