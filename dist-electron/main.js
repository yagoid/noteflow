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
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const githubSync = __importStar(require("./githubSync"));
function getIconPath() {
    if (process.platform === 'win32')
        return path_1.default.join(__dirname, '../public/icon.ico');
    // In dev, the icon lives in public/; in production Vite copies it to dist/
    // (only dist/ and dist-electron/ are packed into the ASAR, not public/)
    const dir = electron_1.app.isPackaged ? '../dist' : '../public';
    return path_1.default.join(__dirname, `${dir}/icon.png`);
}
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
let mainWindow = null;
let tray = null;
let isQuitting = false;
let autoSyncTimer = null;
// Track files recently written by the app so fs.watch can ignore them
const recentInternalWrites = new Set();
function markInternalWrite(filename) {
    recentInternalWrites.add(filename);
    setTimeout(() => recentInternalWrites.delete(filename), 1500);
}
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// ── Push state tracking ───────────────────────────────────────────────────────
// Tracks filenames whose debounced push is still pending or in-flight.
// When the set transitions from empty→non-empty or non-empty→empty we notify
// all renderer windows so the sync button can show an uploading indicator.
const pendingPushFiles = new Set();
function notifyPushState() {
    const state = pendingPushFiles.size > 0 ? 'pushing' : 'idle';
    electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('sync:push-state', state));
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
function startAlarmEngine() {
    if (alarmTimer)
        return;
    alarmTimer = setInterval(checkAlarms, 60000);
}
electron_1.ipcMain.on('alarms:schedule', (_event, incoming) => {
    registeredAlarms.clear();
    for (const e of incoming) {
        registeredAlarms.set(alarmKey(e), e);
    }
    // Immediately fire any alarms that are already due (including missed ones)
    checkAlarms();
});
function startAutoSync() {
    if (autoSyncTimer)
        return;
    autoSyncTimer = setInterval(async () => {
        if (!githubSync.getSyncStatus().connected)
            return;
        try {
            const result = await githubSync.pullNotes(NOTES_DIR);
            if (result.hadDeletions || result.hadMetadataChanges) {
                // Metadata and deletions require a full reload so all stores stay in sync.
                electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
            }
            else {
                // Broadcast only the files that actually changed — avoids full reload
                for (const filePath of result.updatedFiles) {
                    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
                        win.webContents.send('notes-updated', filePath, null);
                    });
                }
            }
        }
        catch (err) {
            console.error('[AutoSync] pull failed:', String(err));
        }
    }, AUTO_SYNC_INTERVAL_MS);
}
function stopAutoSync() {
    if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
        autoSyncTimer = null;
    }
}
const OLD_NOTES_DIR = path_1.default.join(os_1.default.homedir(), 'scratch-notes');
// On Linux, follow XDG Base Directory Specification using ~/.local/share as base.
// We intentionally avoid process.env.XDG_DATA_HOME because snap/flatpak runtimes
// override it to their sandboxed paths, which would make notes inaccessible outside
// the dev environment.
const NOTES_DIR = process.platform === 'linux'
    ? path_1.default.join(os_1.default.homedir(), '.local', 'share', 'noteflow-notes')
    : path_1.default.join(os_1.default.homedir(), 'noteflow-notes');
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
// Ensure notes directory exists
if (!fs_1.default.existsSync(NOTES_DIR)) {
    fs_1.default.mkdirSync(NOTES_DIR, { recursive: true });
}
const GROUPS_FILE = path_1.default.join(NOTES_DIR, 'groups.json');
const SECTION_COLORS_FILE = path_1.default.join(NOTES_DIR, 'section-colors.json');
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
function sanitizeSectionColors(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return {};
    const next = {};
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value !== 'string' || !SECTION_COLOR_VALUES.has(value))
            continue;
        const normalizedKey = normalizeSectionColorKey(key);
        if (!normalizedKey)
            continue;
        next[normalizedKey] = value;
    }
    return next;
}
function ensureSafeNoteFilename(filePath) {
    if (typeof filePath !== 'string')
        throw new Error('Invalid note file path');
    const filename = path_1.default.basename(filePath).trim();
    if (!filename || filename === '.' || filename === '..')
        throw new Error('Invalid note filename');
    if (filename.includes('/') || filename.includes('\\'))
        throw new Error('Invalid note filename');
    if (!filename.toLowerCase().endsWith('.md'))
        throw new Error('Only markdown note files are allowed');
    return filename;
}
function toSafeNotePath(filePath) {
    const filename = ensureSafeNoteFilename(filePath);
    return path_1.default.join(NOTES_DIR, filename);
}
function ensureSafeImportFilename(filename) {
    if (typeof filename !== 'string')
        throw new Error('Invalid import filename');
    const trimmed = filename.trim();
    if (!trimmed)
        throw new Error('Import filename is empty');
    if (trimmed.length > 160)
        throw new Error('Import filename is too long');
    if (path_1.default.isAbsolute(trimmed))
        throw new Error('Absolute import paths are not allowed');
    if (trimmed.includes('/') || trimmed.includes('\\'))
        throw new Error('Nested import paths are not allowed');
    if (trimmed === '.' || trimmed === '..')
        throw new Error('Invalid import filename');
    if (!trimmed.toLowerCase().endsWith('.md'))
        throw new Error('Only markdown notes can be imported');
    return trimmed;
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
    const pathname = url.pathname.toLowerCase();
    if (!pathname.includes('/yagoid/noteflow/releases/'))
        return false;
    return pathname.endsWith('.exe') || pathname.endsWith('.deb');
}
function isAllowedRedirectUpdateUrl(url) {
    if (!ALLOWED_UPDATE_REDIRECT_HOSTS.has(url.hostname))
        return false;
    const pathname = url.pathname.toLowerCase();
    return pathname.endsWith('.exe') || pathname.endsWith('.deb');
}
function createWindow(hidden = false) {
    const win = new electron_1.BrowserWindow({
        width: 1100,
        height: 720,
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
    // Reset any persisted zoom level — Chromium stores zoom preferences in the
    // user data directory; old versions set zoomFactor: scaleFactor which got
    // persisted, causing the app to appear zoomed even after that code was removed.
    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(1);
    });
    win.once('ready-to-show', () => {
        if (hidden)
            return; // startup mode: stay hidden in tray
        win.show();
        // Pull remote notes in background after window is visible
        if (githubSync.getSyncStatus().connected) {
            githubSync.pullNotes(NOTES_DIR).then(({ pulled, hadDeletions, hadMetadataChanges }) => {
                if (pulled > 0 || hadDeletions || hadMetadataChanges) {
                    win.webContents.send('notes-updated');
                }
            });
        }
    });
    // Hide instead of close — keeps the process alive for fast re-open
    win.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            win.hide();
        }
    });
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
function applyStickyShape(win, w, h) {
    // win.setShape() is Windows-only (DWM); no-op on Linux/macOS
    if (process.platform !== 'win32')
        return;
    const [ww, hh] = w !== undefined ? [w, h] : win.getSize();
    // Use half-height for pills (folded state ≤40px), otherwise 8px (rounded-lg)
    const r = hh <= 40 ? Math.floor(hh / 2) : 8;
    win.setShape(roundedRectRegion(ww, hh, r));
}
// Stores the pre-fold bounds per window so unfold can restore them exactly
const prevBoundsMap = new Map();
// Tracks all open sticky windows to cascade their initial positions
const stickyWindows = new Set();
// Tracks currently folded sticky windows to stack their pills vertically
const foldedWindows = new Set();
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
    const startTime = Date.now();
    const fromR = from.height <= 40 ? Math.floor(from.height / 2) : 8;
    const toR = to.height <= 40 ? Math.floor(to.height / 2) : 8;
    const tick = setInterval(() => {
        if (win.isDestroyed()) {
            clearInterval(tick);
            return;
        }
        const t = Math.min((Date.now() - startTime) / duration, 1);
        const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const x = Math.round(from.x + (to.x - from.x) * e);
        const y = Math.round(from.y + (to.y - from.y) * e);
        const w = Math.round(from.width + (to.width - from.width) * e);
        const h = Math.round(from.height + (to.height - from.height) * e);
        const r = Math.round(fromR + (toR - fromR) * e);
        win.setMinimumSize(1, 1);
        win.setSize(w, h);
        win.setPosition(x, y);
        if (process.platform === 'win32')
            win.setShape(roundedRectRegion(w, h, r));
        if (t >= 1) {
            clearInterval(tick);
            onComplete?.();
        }
    }, 16);
}
function createStickyWindow(noteId, sectionId) {
    const win = new electron_1.BrowserWindow({
        width: 300,
        height: 300,
        minWidth: 200,
        minHeight: 200,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
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
    // Hash routing pattern for the sticky page
    const hash = `#sticky?noteId=${encodeURIComponent(noteId)}&sectionId=${encodeURIComponent(sectionId)}`;
    if (isDev) {
        win.loadURL(`http://localhost:5173/${hash}`);
    }
    else {
        // In production, file:// URLs need the hash at the end
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'), { hash });
    }
    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(1);
    });
    // Apply the OS-level window shape so Windows DWM respects the rounded corners
    // even when the window loses focus (CSS border-radius is ignored by DWM).
    win.on('resize', () => applyStickyShape(win));
    win.on('closed', () => {
        prevBoundsMap.delete(win.id);
        stickyWindows.delete(win);
        foldedWindows.delete(win);
    });
    win.once('ready-to-show', () => {
        const { x, y } = getStickyInitialPosition(300, 300);
        win.setPosition(x, y);
        stickyWindows.add(win);
        applyStickyShape(win);
        win.show();
    });
    return win;
}
function createTray() {
    const dir = electron_1.app.isPackaged ? '../dist' : '../public';
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
    tray.setToolTip('NoteFlow — quick notes');
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: 'Open NoteFlow',
            click: () => toggleWindow(),
        },
        {
            label: 'New Note',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => {
                showWindow();
                mainWindow?.webContents.send('new-note');
            },
        },
        { type: 'separator' },
        {
            label: 'Open notes folder',
            click: () => electron_1.shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err)),
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                mainWindow?.webContents.session.flushStorageData();
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => toggleWindow());
}
function showWindow() {
    if (!mainWindow)
        return;
    if (mainWindow.isMinimized())
        mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
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
function registerGlobalShortcut() {
    // Ctrl+Shift+Space — toggle window from anywhere
    const ret = electron_1.globalShortcut.register('CommandOrControl+Shift+Space', () => {
        toggleWindow();
    });
    if (!ret) {
        console.error('Failed to register global shortcut Ctrl+Shift+Space');
        // Update tray tooltip so the user knows the shortcut is unavailable
        // (common on Linux when an input method or another app captures it)
        tray?.setToolTip('NoteFlow — shortcut unavailable (Ctrl+Shift+Space)');
    }
}
// ── IPC Handlers ─────────────────────────────────────────────────────────────
electron_1.ipcMain.handle('fs:list-notes', () => {
    try {
        const files = fs_1.default.readdirSync(NOTES_DIR);
        return files
            .filter((f) => f.endsWith('.md'))
            .map((f) => {
            const fullPath = path_1.default.join(NOTES_DIR, f);
            const stat = fs_1.default.statSync(fullPath);
            return {
                filename: f,
                path: fullPath,
                mtime: stat.mtime.toISOString(),
                ctime: stat.ctime.toISOString(),
            };
        })
            .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    }
    catch {
        return [];
    }
});
electron_1.ipcMain.handle('fs:read-note', (_event, filePath) => {
    try {
        const safePath = toSafeNotePath(filePath);
        return fs_1.default.readFileSync(safePath, 'utf-8');
    }
    catch {
        return null;
    }
});
electron_1.ipcMain.handle('fs:write-note', (event, filePath, content) => {
    try {
        const safePath = toSafeNotePath(filePath);
        fs_1.default.writeFileSync(safePath, content, 'utf-8');
        markInternalWrite(path_1.default.basename(safePath));
        // Broadcast to all windows
        electron_1.BrowserWindow.getAllWindows().forEach((win) => {
            // Send the filePath and the sender's webContents ID
            win.webContents.send('notes-updated', safePath, event.sender.id);
        });
        if (githubSync.getSyncStatus().connected) {
            const filename = path_1.default.basename(safePath);
            githubSync.schedulePush(safePath, content, () => { pendingPushFiles.add(filename); notifyPushState(); }, () => { pendingPushFiles.delete(filename); notifyPushState(); });
        }
        else {
            githubSync.schedulePush(safePath, content);
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('fs:delete-note', (_event, filePath) => {
    try {
        const safePath = toSafeNotePath(filePath);
        markInternalWrite(path_1.default.basename(safePath));
        fs_1.default.unlinkSync(safePath);
        electron_1.BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send('notes-updated');
        });
        githubSync.scheduleDelete(safePath);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('fs:rename-note', (_event, oldPath, newPath) => {
    try {
        const safeOldPath = toSafeNotePath(oldPath);
        const safeNewPath = toSafeNotePath(newPath);
        markInternalWrite(path_1.default.basename(safeOldPath));
        markInternalWrite(path_1.default.basename(safeNewPath));
        fs_1.default.renameSync(safeOldPath, safeNewPath);
        electron_1.BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send('notes-updated');
        });
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
    // Retry up to 3 times so we don't mistake a transient empty result for no notes.
    let files = [];
    for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0)
            await new Promise((r) => setTimeout(r, 800));
        files = fs_1.default.readdirSync(NOTES_DIR).filter((f) => f.endsWith('.md'));
        if (files.length > 0)
            break;
    }
    return files.map((f) => {
        const fullPath = path_1.default.join(NOTES_DIR, f);
        try {
            return { path: fullPath, content: fs_1.default.readFileSync(fullPath, 'utf-8') };
        }
        catch {
            return { path: fullPath, content: null };
        }
    });
});
electron_1.ipcMain.handle('fs:notes-dir', () => NOTES_DIR);
electron_1.ipcMain.handle('app:open-notes-folder', () => electron_1.shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err)));
electron_1.ipcMain.handle('app:check-update', () => {
    // if (!app.isPackaged) return { hasUpdate: false }
    return new Promise((resolve) => {
        const req = https_1.default.get('https://api.github.com/repos/yagoid/noteflow/releases/latest', { headers: { 'User-Agent': 'NoteFlow-App' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const latest = json.tag_name?.replace(/^v/, '');
                    const current = electron_1.app.getVersion();
                    const hasUpdate = latest && latest !== current;
                    let downloadUrl;
                    if (process.platform === 'linux') {
                        downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/noteflow_${latest}_amd64.deb`;
                    }
                    else {
                        downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-${latest}-Setup.exe`;
                    }
                    resolve({ hasUpdate, latestVersion: latest, downloadUrl });
                }
                catch {
                    resolve({ hasUpdate: false });
                }
            });
        });
        req.on('error', () => resolve({ hasUpdate: false }));
        req.setTimeout(8000, () => { req.destroy(); resolve({ hasUpdate: false }); });
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
electron_1.ipcMain.handle('app:download-and-install', async (_event, url) => {
    try {
        const initialUrl = parseHttpsUrl(url);
        if (!initialUrl || !isAllowedInitialUpdateUrl(initialUrl)) {
            throw new Error('Blocked update URL');
        }
        const response = await electron_1.net.fetch(initialUrl.toString());
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const finalUrl = parseHttpsUrl(response.url);
        if (!finalUrl || !isAllowedRedirectUpdateUrl(finalUrl)) {
            throw new Error('Blocked redirected update URL');
        }
        const tmpDir = electron_1.app.getPath('temp');
        const fileName = path_1.default.basename(finalUrl.pathname) || path_1.default.basename(initialUrl.pathname) || 'NoteFlow-update.exe';
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
        if (process.platform === 'linux') {
            await new Promise((resolve) => {
                const proc = (0, child_process_1.spawn)('pkexec', ['dpkg', '-i', dest], { stdio: 'ignore' });
                proc.on('error', () => {
                    // pkexec not available, fall back to xdg-open
                    electron_1.shell.openPath(dest);
                    resolve();
                });
                proc.on('close', (code) => {
                    if (code === 0) {
                        electron_1.app.relaunch();
                        electron_1.app.quit();
                    }
                    resolve();
                });
            });
        }
        else {
            await electron_1.shell.openPath(dest);
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
        title: 'Choose notes folder',
    });
    return result.canceled ? null : result.filePaths[0];
});
electron_1.ipcMain.handle('notes:export', async (_event, entries, format, hint) => {
    try {
        const safeHint = hint
            ? hint.replace(/[^a-z0-9 ._-]/gi, '').trim().replace(/\s+/g, '-') || 'note'
            : null;
        if (format === 'txt' || format === 'md') {
            if (entries.length === 1) {
                const defaultName = safeHint ? `${safeHint}.${format}` : entries[0].filename;
                const result = await electron_1.dialog.showSaveDialog(mainWindow, {
                    title: 'Export note',
                    defaultPath: path_1.default.join(os_1.default.homedir(), defaultName),
                    filters: [{ name: format === 'txt' ? 'Plain Text' : 'Markdown', extensions: [format] }],
                });
                if (result.canceled || !result.filePath)
                    return { ok: false, canceled: true };
                fs_1.default.writeFileSync(result.filePath, entries[0].content, 'utf-8');
                return { ok: true, filePath: result.filePath };
            }
            else {
                const result = await electron_1.dialog.showOpenDialog(mainWindow, {
                    title: 'Choose destination folder',
                    properties: ['openDirectory'],
                });
                if (result.canceled || result.filePaths.length === 0)
                    return { ok: false, canceled: true };
                const dir = result.filePaths[0];
                for (const entry of entries) {
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
            title: 'Export notes',
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
            version: 1,
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
            title: 'Import notes',
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
            const safeTitle = title.replace(/"/g, '\\"');
            const indentedContent = textContent.split('\n').map((l) => `      ${l}`).join('\n');
            const noteContent = [
                '---',
                `id: ${id}`,
                `title: "${safeTitle}"`,
                'tags: []',
                `created: ${now}`,
                `updated: ${now}`,
                'sections:',
                `  - id: ${secId}`,
                '    name: Note',
                '    content: |',
                indentedContent,
                '---',
                textContent,
            ].join('\n');
            const slug = title.replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'note';
            const filename = `${id}-${slug}.md`;
            return {
                ok: true,
                file: {
                    version: 1,
                    exported: now,
                    app: 'noteflow',
                    notes: [{ filename, content: noteContent }],
                },
            };
        }
        const raw = fs_1.default.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1 || parsed.app !== 'noteflow' || !Array.isArray(parsed.notes)) {
            return { ok: false, error: 'Invalid .noteflow file format' };
        }
        return { ok: true, file: parsed };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('notes:write-imported', async (_event, entries) => {
    const written = [];
    const errors = [];
    for (const entry of entries) {
        try {
            const safeFilename = ensureSafeImportFilename(entry.filename);
            if (typeof entry.content !== 'string') {
                throw new Error('Import content must be a string');
            }
            const dest = path_1.default.join(NOTES_DIR, safeFilename);
            fs_1.default.writeFileSync(dest, entry.content, 'utf-8');
            markInternalWrite(safeFilename);
            written.push(safeFilename);
        }
        catch (err) {
            errors.push(`${entry.filename}: ${String(err)}`);
        }
    }
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('notes-updated');
    });
    return { written, errors };
});
// ── GitHub Sync ───────────────────────────────────────────────────────────────
electron_1.ipcMain.handle('sync:get-status', () => {
    return githubSync.getSyncStatus();
});
electron_1.ipcMain.handle('sync:initiate', async (_event, repo) => {
    return githubSync.initiateDeviceFlow(repo, NOTES_DIR, (result) => {
        electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('sync-auth-complete', result));
        if (result.ok) {
            electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
            startAutoSync();
        }
    });
});
electron_1.ipcMain.handle('sync:cancel-auth', () => {
    githubSync.cancelDeviceFlow();
    return { ok: true };
});
electron_1.ipcMain.handle('sync:disconnect', () => {
    stopAutoSync();
    githubSync.disconnectGitHub();
    return { ok: true };
});
electron_1.ipcMain.handle('sync:pull', async () => {
    const result = await githubSync.pullNotes(NOTES_DIR);
    if (result.hadDeletions || result.hadMetadataChanges || result.pulled === 0) {
        // Full reload: covers deletions AND the case where the file was already on disk
        // (written by auto-sync) but the UI missed the event — manual sync should always
        // bring the store in sync with disk.
        electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'));
    }
    else {
        for (const filePath of result.updatedFiles) {
            electron_1.BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', filePath, null));
        }
    }
    return result;
});
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
    fs_1.default.writeFileSync(path_1.default.join(electron_1.app.getPath('userData'), 'settings.json'), JSON.stringify(data), 'utf-8');
}
electron_1.ipcMain.on('settings:get-theme', (event) => {
    event.returnValue = readSettings().theme ?? null;
});
electron_1.ipcMain.on('settings:set-theme', (_event, themeId) => {
    const settings = readSettings();
    settings.theme = themeId;
    writeSettings(settings);
});
electron_1.ipcMain.handle('app:get-login-item', () => {
    const openAtLogin = (readSettings().openAtLogin ?? false);
    return { openAtLogin };
});
function applyLoginItemSettings(enabled) {
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
electron_1.ipcMain.handle('settings:get-startup-stickies', () => {
    return (readSettings().startupStickies ?? []);
});
electron_1.ipcMain.handle('settings:set-startup-stickies', (_event, stickies) => {
    const settings = readSettings();
    settings.startupStickies = stickies;
    writeSettings(settings);
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
electron_1.ipcMain.handle('groups:set', (event, groups) => {
    const content = JSON.stringify(groups, null, 2);
    fs_1.default.writeFileSync(GROUPS_FILE, content, 'utf-8');
    // Broadcast to other windows so their groups reload immediately
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (win.webContents.id !== event.sender.id) {
            win.webContents.send('notes-updated');
        }
    });
    githubSync.schedulePush(GROUPS_FILE, content);
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
    githubSync.schedulePush(SECTION_COLORS_FILE, content);
});
// Window controls
electron_1.ipcMain.on('window:minimize', (event) => {
    electron_1.BrowserWindow.fromWebContents(event.sender)?.minimize();
});
electron_1.ipcMain.on('window:get-id', (event) => {
    event.returnValue = event.sender.id;
});
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow?.maximize();
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
electron_1.ipcMain.on('window:set-size', (event, width, height, minW, minH) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    win.setMinimumSize(minW, minH);
    win.setSize(width, height);
});
electron_1.ipcMain.on('window:fold-to-corner', (event, foldedW, foldedH) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const from = win.getBounds();
    prevBoundsMap.set(win.id, from);
    foldedWindows.add(win);
    const display = electron_1.screen.getDisplayNearestPoint(from);
    const { x: toX, y: toY } = getFoldedPosition(display, foldedW, foldedH);
    const to = { x: toX, y: toY, width: foldedW, height: foldedH };
    animateStickyWindow(win, from, to, 300);
});
electron_1.ipcMain.on('window:unfold', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const prev = prevBoundsMap.get(win.id);
    if (!prev)
        return;
    foldedWindows.delete(win);
    const from = win.getBounds();
    animateStickyWindow(win, from, prev, 280, () => {
        if (!win.isDestroyed()) {
            win.setMinimumSize(200, 200);
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
electron_1.app.whenReady().then(() => {
    // Remove default menu for all windows
    electron_1.Menu.setApplicationMenu(null);
    githubSync.loadSyncSettings();
    if (githubSync.getSyncStatus().connected)
        startAutoSync();
    const isStartupMode = process.argv.includes('--noteflow-startup');
    const startupStickies = (readSettings().startupStickies ?? []);
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
    if (isStartupMode) {
        // Launched at system startup: always keep the main window hidden in tray
        // and open any configured startup sticky notes.
        mainWindow = createWindow(true);
        const stickyWins = [];
        for (const { noteId, sectionId } of startupStickies) {
            stickyWins.push(createStickyWindow(noteId, sectionId));
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
    createTray();
    registerGlobalShortcut();
    startAlarmEngine();
    // Watch for external file changes (CLI, sync from another device, etc.)
    // Debounce per-file: fs.watch can fire multiple times for a single write (Windows),
    // and may fire before the OS has flushed the file — a 150 ms delay lets the write settle.
    // If filename is null (Linux inotify edge case), fall back to a full reload.
    const pendingWatchDebounce = new Map();
    fs_1.default.watch(NOTES_DIR, { persistent: false }, (_eventType, filename) => {
        if (filename && !filename.endsWith('.md'))
            return;
        if (filename && recentInternalWrites.has(filename))
            return;
        const key = filename ?? '__all__';
        const existing = pendingWatchDebounce.get(key);
        if (existing)
            clearTimeout(existing);
        pendingWatchDebounce.set(key, setTimeout(() => {
            pendingWatchDebounce.delete(key);
            if (!filename) {
                // Filename unavailable — full reload covers all cases
                electron_1.BrowserWindow.getAllWindows().forEach(win => {
                    win.webContents.send('notes-updated');
                });
                return;
            }
            const filePath = path_1.default.join(NOTES_DIR, filename);
            electron_1.BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('notes-updated', filePath, null);
            });
        }, 150));
    });
    electron_1.app.on('activate', () => {
        showWindow();
    });
    electron_1.app.on('before-quit', () => {
        isQuitting = true;
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
});
electron_1.app.on('second-instance', () => {
    showWindow();
});
