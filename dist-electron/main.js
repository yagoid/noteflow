"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
let mainWindow = null;
let tray = null;
const OLD_NOTES_DIR = path_1.default.join(os_1.default.homedir(), 'scratch-notes');
const NOTES_DIR = path_1.default.join(os_1.default.homedir(), 'noteflow-notes');
// Migrate old notes folder to new name if it exists AND the new one doesn't
if (fs_1.default.existsSync(OLD_NOTES_DIR) && !fs_1.default.existsSync(NOTES_DIR)) {
    fs_1.default.renameSync(OLD_NOTES_DIR, NOTES_DIR);
}
// Ensure notes directory exists
if (!fs_1.default.existsSync(NOTES_DIR)) {
    fs_1.default.mkdirSync(NOTES_DIR, { recursive: true });
}
function createWindow() {
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
        icon: path_1.default.join(__dirname, '../public/icon.ico'),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    win.once('ready-to-show', () => {
        win.show();
    });
    // Hide instead of close — keeps the process alive for fast re-open
    win.on('close', (e) => {
        e.preventDefault();
        win.hide();
    });
    return win;
}
function createStickyWindow(noteId, sectionId) {
    const win = new electron_1.BrowserWindow({
        width: 300,
        height: 300,
        minWidth: 200,
        minHeight: 200,
        frame: false,
        transparent: false,
        backgroundColor: '#1a1b26',
        titleBarStyle: 'hidden',
        show: false,
        alwaysOnTop: true,
        icon: path_1.default.join(__dirname, '../public/icon.ico'),
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
    win.once('ready-to-show', () => {
        win.show();
    });
    return win;
}
function createTray() {
    // Create a minimal 16x16 tray icon programmatically
    const iconPath = path_1.default.join(__dirname, '../public/tray-icon.png');
    let icon;
    if (fs_1.default.existsSync(iconPath)) {
        icon = electron_1.nativeImage.createFromPath(iconPath);
    }
    else {
        // Fallback: empty icon
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
            click: () => electron_1.shell.openPath(NOTES_DIR),
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                electron_1.app.exit(0);
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
        return fs_1.default.readFileSync(filePath, 'utf-8');
    }
    catch {
        return null;
    }
});
electron_1.ipcMain.handle('fs:write-note', (event, filePath, content) => {
    try {
        fs_1.default.writeFileSync(filePath, content, 'utf-8');
        // Broadcast to all windows
        electron_1.BrowserWindow.getAllWindows().forEach((win) => {
            // Send the filePath and the sender's webContents ID
            win.webContents.send('notes-updated', filePath, event.sender.id);
        });
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('fs:delete-note', (_event, filePath) => {
    try {
        fs_1.default.unlinkSync(filePath);
        electron_1.BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send('notes-updated');
        });
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('fs:rename-note', (_event, oldPath, newPath) => {
    try {
        fs_1.default.renameSync(oldPath, newPath);
        electron_1.BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send('notes-updated');
        });
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
electron_1.ipcMain.handle('fs:notes-dir', () => NOTES_DIR);
electron_1.ipcMain.handle('app:open-notes-folder', () => electron_1.shell.openPath(NOTES_DIR));
electron_1.ipcMain.handle('app:choose-notes-dir', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Choose notes folder',
    });
    return result.canceled ? null : result.filePaths[0];
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
// ── App lifecycle ─────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    // Remove default menu for all windows
    electron_1.Menu.setApplicationMenu(null);
    mainWindow = createWindow();
    createTray();
    registerGlobalShortcut();
    electron_1.app.on('activate', () => {
        showWindow();
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
