import { contextBridge, ipcRenderer } from 'electron'

export type NoteFileMeta = {
  filename: string
  path: string
  mtime: string
  ctime: string
}

export type NoteFileContent = {
  path: string
  content: string | null
}

export type FsResult = { ok: boolean; error?: string }

const api = {
  // Identification
  windowId: (): number => ipcRenderer.sendSync('window:get-id'),
  
  // File system
  listNotes: (): Promise<NoteFileMeta[]> => ipcRenderer.invoke('fs:list-notes'),
  readNote: (filePath: string): Promise<string | null> => ipcRenderer.invoke('fs:read-note', filePath),
  readAllNotes: (): Promise<NoteFileContent[]> => ipcRenderer.invoke('fs:read-all-notes'),
  writeNote: (filePath: string, content: string): Promise<FsResult> =>
    ipcRenderer.invoke('fs:write-note', filePath, content),
  deleteNote: (filePath: string): Promise<FsResult> => ipcRenderer.invoke('fs:delete-note', filePath),
  renameNote: (oldPath: string, newPath: string): Promise<FsResult> =>
    ipcRenderer.invoke('fs:rename-note', oldPath, newPath),
  getNotesDir: (): Promise<string> => ipcRenderer.invoke('fs:notes-dir'),
  openNotesFolder: (): Promise<void> => ipcRenderer.invoke('app:open-notes-folder'),
  chooseNotesDir: (): Promise<string | null> => ipcRenderer.invoke('app:choose-notes-dir'),

  // Settings
  getTheme: (): string | null => ipcRenderer.sendSync('settings:get-theme'),
  setTheme: (id: string)      => ipcRenderer.send('settings:set-theme', id),
  getLoginItem: (): Promise<{ openAtLogin: boolean }> => ipcRenderer.invoke('app:get-login-item'),
  setLoginItem: (enabled: boolean): Promise<void> => ipcRenderer.invoke('app:set-login-item', enabled),
  getStartupStickies: (): Promise<Array<{ noteId: string; sectionId: string }>> => ipcRenderer.invoke('settings:get-startup-stickies'),
  setStartupStickies: (stickies: Array<{ noteId: string; sectionId: string }>): Promise<void> => ipcRenderer.invoke('settings:set-startup-stickies', stickies),
  getUiState: (): Promise<{ activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[] }> =>
    ipcRenderer.invoke('settings:get-ui-state'),
  setUiState: (patch: { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[] }): Promise<void> =>
    ipcRenderer.invoke('settings:set-ui-state', patch),
  getGroups: (): Promise<unknown[]> => ipcRenderer.invoke('groups:get'),
  setGroups: (groups: unknown[]): Promise<void> => ipcRenderer.invoke('groups:set', groups),
  getSectionTagColors: (): Promise<Record<string, string>> => ipcRenderer.invoke('section-colors:get'),
  setSectionTagColors: (colors: Record<string, string>): Promise<void> => ipcRenderer.invoke('section-colors:set', colors),

  // Window controls
  openSticky: (noteId: string, sectionId: string) => ipcRenderer.send('window:open-sticky', noteId, sectionId),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  setSize: (w: number, h: number, minW: number, minH: number) =>
    ipcRenderer.send('window:set-size', w, h, minW, minH),
  foldToCorner: (w: number, h: number) =>
    ipcRenderer.send('window:fold-to-corner', w, h),
  unfold: () => ipcRenderer.send('window:unfold'),

  // Updates
  checkUpdate: (): Promise<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string }> =>
    ipcRenderer.invoke('app:check-update'),
  openUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('app:open-url', url),
  downloadAndInstall: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('app:download-and-install', url),
  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('update:download-progress', (_event, percent) => callback(percent))
  },

  // Export / Import
  exportNotes: (entries: Array<{ filename: string; content: string }>, format: string, hint?: string): Promise<{ ok: boolean; filePath?: string; error?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('notes:export', entries, format, hint),
  parseImportFile: (): Promise<{ ok: boolean; file?: { version: number; exported: string; app: string; notes: Array<{ filename: string; content: string }> }; error?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('notes:parse-import-file'),
  writeImportedNotes: (entries: Array<{ filename: string; content: string }>): Promise<{ written: string[]; errors: string[] }> =>
    ipcRenderer.invoke('notes:write-imported', entries),

  // GitHub Sync
  getSyncStatus: (): Promise<{
    enabled: boolean
    connected: boolean
    owner?: string
    repo?: string
    lastSync?: string
    error?: string
  }> => ipcRenderer.invoke('sync:get-status'),
  initiateGitHubAuth: (
    repo: string
  ): Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }> =>
    ipcRenderer.invoke('sync:initiate', repo),
  cancelGitHubAuth: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('sync:cancel-auth'),
  disconnectGitHub: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('sync:disconnect'),
  pullNotes: (): Promise<{
    pulled: number
    deleted: number
    errors: string[]
    updatedFiles: string[]
    hadDeletions: boolean
    hadMetadataChanges: boolean
  }> => ipcRenderer.invoke('sync:pull'),
  onSyncAuthComplete: (
    cb: (result: { ok: boolean; owner?: string; repo?: string; error?: string }) => void
  ) => {
    const wrapper = (_event: any, result: { ok: boolean; owner?: string; repo?: string; error?: string }) => cb(result)
    ipcRenderer.on('sync-auth-complete', wrapper)
    return () => ipcRenderer.removeListener('sync-auth-complete', wrapper)
  },
  onSyncPushState: (cb: (state: 'pushing' | 'idle') => void) => {
    const wrapper = (_event: any, state: 'pushing' | 'idle') => cb(state)
    ipcRenderer.on('sync:push-state', wrapper)
    return () => ipcRenderer.removeListener('sync:push-state', wrapper)
  },

  // Alarms
  scheduleAlarms: (alarms: Array<{ noteTitle: string; taskText: string; alarmAt: string }>) =>
    ipcRenderer.send('alarms:schedule', alarms),

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
