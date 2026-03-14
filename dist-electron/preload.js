"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    // Identification
    windowId: () => electron_1.ipcRenderer.sendSync('window:get-id'),
    // File system
    listNotes: () => electron_1.ipcRenderer.invoke('fs:list-notes'),
    readNote: (filePath) => electron_1.ipcRenderer.invoke('fs:read-note', filePath),
    writeNote: (filePath, content) => electron_1.ipcRenderer.invoke('fs:write-note', filePath, content),
    deleteNote: (filePath) => electron_1.ipcRenderer.invoke('fs:delete-note', filePath),
    renameNote: (oldPath, newPath) => electron_1.ipcRenderer.invoke('fs:rename-note', oldPath, newPath),
    getNotesDir: () => electron_1.ipcRenderer.invoke('fs:notes-dir'),
    openNotesFolder: () => electron_1.ipcRenderer.invoke('app:open-notes-folder'),
    chooseNotesDir: () => electron_1.ipcRenderer.invoke('app:choose-notes-dir'),
    // Window controls
    openSticky: (noteId, sectionId) => electron_1.ipcRenderer.send('window:open-sticky', noteId, sectionId),
    minimize: () => electron_1.ipcRenderer.send('window:minimize'),
    maximize: () => electron_1.ipcRenderer.send('window:maximize'),
    close: () => electron_1.ipcRenderer.send('window:close'),
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
