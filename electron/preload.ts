import { contextBridge, ipcRenderer } from 'electron'

export type NoteFileMeta = {
  filename: string
  path: string
  mtime: string
  ctime: string
}

export type FsResult = { ok: boolean; error?: string }

const api = {
  // Identification
  windowId: (): number => ipcRenderer.sendSync('window:get-id'),
  
  // File system
  listNotes: (): Promise<NoteFileMeta[]> => ipcRenderer.invoke('fs:list-notes'),
  readNote: (filePath: string): Promise<string | null> => ipcRenderer.invoke('fs:read-note', filePath),
  writeNote: (filePath: string, content: string): Promise<FsResult> =>
    ipcRenderer.invoke('fs:write-note', filePath, content),
  deleteNote: (filePath: string): Promise<FsResult> => ipcRenderer.invoke('fs:delete-note', filePath),
  renameNote: (oldPath: string, newPath: string): Promise<FsResult> =>
    ipcRenderer.invoke('fs:rename-note', oldPath, newPath),
  getNotesDir: (): Promise<string> => ipcRenderer.invoke('fs:notes-dir'),
  openNotesFolder: (): Promise<void> => ipcRenderer.invoke('app:open-notes-folder'),
  chooseNotesDir: (): Promise<string | null> => ipcRenderer.invoke('app:choose-notes-dir'),

  // Window controls
  openSticky: (noteId: string, sectionId: string) => ipcRenderer.send('window:open-sticky', noteId, sectionId),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Events from main → renderer
  onNewNote: (cb: () => void) => {
    ipcRenderer.on('new-note', cb)
    return () => ipcRenderer.removeListener('new-note', cb)
  },
  onNotesUpdated: (cb: (filePath?: string, senderId?: number) => void) => {
    const wrapper = (_event: any, path?: string, senderId?: number) => cb(path, senderId)
    ipcRenderer.on('notes-updated', wrapper)
    return () => ipcRenderer.removeListener('notes-updated', wrapper)
  },
}

contextBridge.exposeInMainWorld('noteflow', api)
