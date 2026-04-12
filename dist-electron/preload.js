"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    // Identification
    windowId: () => electron_1.ipcRenderer.sendSync('window:get-id'),
    // File system
    listNotes: () => electron_1.ipcRenderer.invoke('fs:list-notes'),
    readNote: (filePath) => electron_1.ipcRenderer.invoke('fs:read-note', filePath),
    readAllNotes: () => electron_1.ipcRenderer.invoke('fs:read-all-notes'),
    writeNote: (filePath, content) => electron_1.ipcRenderer.invoke('fs:write-note', filePath, content),
    deleteNote: (filePath) => electron_1.ipcRenderer.invoke('fs:delete-note', filePath),
    renameNote: (oldPath, newPath) => electron_1.ipcRenderer.invoke('fs:rename-note', oldPath, newPath),
    getNotesDir: () => electron_1.ipcRenderer.invoke('fs:notes-dir'),
    openNotesFolder: () => electron_1.ipcRenderer.invoke('app:open-notes-folder'),
    chooseNotesDir: () => electron_1.ipcRenderer.invoke('app:choose-notes-dir'),
    // Settings
    getTheme: () => electron_1.ipcRenderer.sendSync('settings:get-theme'),
    setTheme: (id) => electron_1.ipcRenderer.send('settings:set-theme', id),
    getLoginItem: () => electron_1.ipcRenderer.invoke('app:get-login-item'),
    setLoginItem: (enabled) => electron_1.ipcRenderer.invoke('app:set-login-item', enabled),
    getStartupStickies: () => electron_1.ipcRenderer.invoke('settings:get-startup-stickies'),
    setStartupStickies: (stickies) => electron_1.ipcRenderer.invoke('settings:set-startup-stickies', stickies),
    getUiState: () => electron_1.ipcRenderer.invoke('settings:get-ui-state'),
    setUiState: (patch) => electron_1.ipcRenderer.invoke('settings:set-ui-state', patch),
    getGroups: () => electron_1.ipcRenderer.invoke('groups:get'),
    setGroups: (groups) => electron_1.ipcRenderer.invoke('groups:set', groups),
    getSectionTagColors: () => electron_1.ipcRenderer.invoke('section-colors:get'),
    setSectionTagColors: (colors) => electron_1.ipcRenderer.invoke('section-colors:set', colors),
    // Window controls
    openSticky: (noteId, sectionId) => electron_1.ipcRenderer.send('window:open-sticky', noteId, sectionId),
    minimize: () => electron_1.ipcRenderer.send('window:minimize'),
    maximize: () => electron_1.ipcRenderer.send('window:maximize'),
    close: () => electron_1.ipcRenderer.send('window:close'),
    setSize: (w, h, minW, minH) => electron_1.ipcRenderer.send('window:set-size', w, h, minW, minH),
    foldToCorner: (w, h) => electron_1.ipcRenderer.send('window:fold-to-corner', w, h),
    unfold: () => electron_1.ipcRenderer.send('window:unfold'),
    // Updates
    checkUpdate: () => electron_1.ipcRenderer.invoke('app:check-update'),
    openUrl: (url) => electron_1.ipcRenderer.invoke('app:open-url', url),
    downloadAndInstall: (url) => electron_1.ipcRenderer.invoke('app:download-and-install', url),
    onUpdateProgress: (callback) => {
        electron_1.ipcRenderer.on('update:download-progress', (_event, percent) => callback(percent));
    },
    // Export / Import
    exportNotes: (entries, format, hint) => electron_1.ipcRenderer.invoke('notes:export', entries, format, hint),
    parseImportFile: () => electron_1.ipcRenderer.invoke('notes:parse-import-file'),
    writeImportedNotes: (entries) => electron_1.ipcRenderer.invoke('notes:write-imported', entries),
    // GitHub Sync
    getSyncStatus: () => electron_1.ipcRenderer.invoke('sync:get-status'),
    initiateGitHubAuth: (repo) => electron_1.ipcRenderer.invoke('sync:initiate', repo),
    cancelGitHubAuth: () => electron_1.ipcRenderer.invoke('sync:cancel-auth'),
    disconnectGitHub: () => electron_1.ipcRenderer.invoke('sync:disconnect'),
    pullNotes: () => electron_1.ipcRenderer.invoke('sync:pull'),
    onSyncAuthComplete: (cb) => {
        const wrapper = (_event, result) => cb(result);
        electron_1.ipcRenderer.on('sync-auth-complete', wrapper);
        return () => electron_1.ipcRenderer.removeListener('sync-auth-complete', wrapper);
    },
    onSyncPushState: (cb) => {
        const wrapper = (_event, state) => cb(state);
        electron_1.ipcRenderer.on('sync:push-state', wrapper);
        return () => electron_1.ipcRenderer.removeListener('sync:push-state', wrapper);
    },
    // Alarms
    scheduleAlarms: (alarms) => electron_1.ipcRenderer.send('alarms:schedule', alarms),
    // Events from main → renderer
    onNewNote: (cb) => {
        electron_1.ipcRenderer.on('new-note', cb);
        return () => electron_1.ipcRenderer.removeListener('new-note', cb);
    },
    onNotesUpdated: (cb) => {
        const wrapper = (_event, path, senderId) => cb(path, senderId);
        electron_1.ipcRenderer.on('notes-updated', wrapper);
        return () => electron_1.ipcRenderer.removeListener('notes-updated', wrapper);
    },
};
electron_1.contextBridge.exposeInMainWorld('noteflow', api);
