import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  dialog,
} from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import os from 'os'
import * as githubSync from './githubSync'

function getIconPath(): string {
  const iconExt = process.platform === 'win32' ? 'ico' : 'png'
  return path.join(__dirname, `../public/icon.${iconExt}`)
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const OLD_NOTES_DIR = path.join(os.homedir(), 'scratch-notes')
const NOTES_DIR = path.join(os.homedir(), 'noteflow-notes')

// Migrate old notes folder to new name if it exists AND the new one doesn't
if (fs.existsSync(OLD_NOTES_DIR) && !fs.existsSync(NOTES_DIR)) {
  fs.renameSync(OLD_NOTES_DIR, NOTES_DIR)
}

// Ensure notes directory exists
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    // Pull remote notes in background after window is visible
    if (githubSync.getSyncStatus().connected) {
      githubSync.pullNotes(NOTES_DIR).then(({ pulled }) => {
        if (pulled > 0) {
          win.webContents.send('notes-updated')
        }
      })
    }
  })

  // Hide instead of close — keeps the process alive for fast re-open
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  return win
}

function createStickyWindow(noteId: string, sectionId: string): BrowserWindow {
  const win = new BrowserWindow({
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
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Hash routing pattern for the sticky page
  const hash = `#sticky?noteId=${encodeURIComponent(noteId)}&sectionId=${encodeURIComponent(sectionId)}`

  if (isDev) {
    win.loadURL(`http://localhost:5173/${hash}`)
  } else {
    // In production, file:// URLs need the hash at the end
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash })
  }

  win.once('ready-to-show', () => {
    win.show()
  })

  return win
}

function createTray() {
  // Create a minimal 16x16 tray icon programmatically
  const iconPath = path.join(__dirname, '../public/tray-icon.png')
  let icon: Electron.NativeImage

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    // Fallback: empty icon
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('NoteFlow — quick notes')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open NoteFlow',
      click: () => toggleWindow(),
    },
    {
      label: 'New Note',
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => {
        showWindow()
        mainWindow?.webContents.send('new-note')
      },
    },
    { type: 'separator' },
    {
      label: 'Open notes folder',
      click: () => shell.openPath(NOTES_DIR),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow?.webContents.session.flushStorageData()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => toggleWindow())
}

function showWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function toggleWindow() {
  if (!mainWindow) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else {
    showWindow()
  }
}

function registerGlobalShortcut() {
  // Ctrl+Shift+Space — toggle window from anywhere
  const ret = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    toggleWindow()
  })
  if (!ret) {
    console.error('Failed to register global shortcut Ctrl+Shift+Space')
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('fs:list-notes', () => {
  try {
    const files = fs.readdirSync(NOTES_DIR)
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const fullPath = path.join(NOTES_DIR, f)
        const stat = fs.statSync(fullPath)
        return {
          filename: f,
          path: fullPath,
          mtime: stat.mtime.toISOString(),
          ctime: stat.ctime.toISOString(),
        }
      })
      .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
  } catch {
    return []
  }
})

ipcMain.handle('fs:read-note', (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('fs:write-note', (event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    // Broadcast to all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      // Send the filePath and the sender's webContents ID
      win.webContents.send('notes-updated', filePath, event.sender.id)
    })
    githubSync.schedulePush(filePath, content)
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('fs:delete-note', (_event, filePath: string) => {
  try {
    fs.unlinkSync(filePath)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('notes-updated')
    })
    githubSync.scheduleDelete(filePath)
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('fs:rename-note', (_event, oldPath: string, newPath: string) => {
  try {
    fs.renameSync(oldPath, newPath)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('notes-updated')
    })
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('fs:read-all-notes', () => {
  try {
    const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith('.md'))
    return files.map((f) => {
      const fullPath = path.join(NOTES_DIR, f)
      try {
        return { path: fullPath, content: fs.readFileSync(fullPath, 'utf-8') }
      } catch {
        return { path: fullPath, content: null }
      }
    })
  } catch {
    return []
  }
})

ipcMain.handle('fs:notes-dir', () => NOTES_DIR)

ipcMain.handle('app:open-notes-folder', () => shell.openPath(NOTES_DIR))

ipcMain.handle('app:check-update', () => {
  // if (!app.isPackaged) return { hasUpdate: false }
  return new Promise((resolve) => {
    const req = https.get(
      'https://api.github.com/repos/yagoid/noteflow/releases/latest',
      { headers: { 'User-Agent': 'NoteFlow-App' } },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const latest = json.tag_name?.replace(/^v/, '')
            const current = app.getVersion()
            const hasUpdate = latest && latest !== current
            const downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-Setup-${latest}.exe`
            resolve({ hasUpdate, latestVersion: latest, downloadUrl })
          } catch {
            resolve({ hasUpdate: false })
          }
        })
      }
    )
    req.on('error', () => resolve({ hasUpdate: false }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ hasUpdate: false }) })
  })
})

ipcMain.handle('app:open-url', (_event, url: string) => {
  shell.openExternal(url)
})

ipcMain.handle('app:choose-notes-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Choose notes folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('notes:export', async (_event, entries: Array<{ filename: string; content: string }>) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export notes',
      defaultPath: path.join(
        os.homedir(),
        `noteflow-export-${new Date().toISOString().slice(0, 10)}.noteflow`
      ),
      filters: [
        { name: 'NoteFlow Export', extensions: ['noteflow'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true, error: 'Canceled' }
    }
    const exportFile = {
      version: 1,
      exported: new Date().toISOString(),
      app: 'noteflow',
      notes: entries,
    }
    fs.writeFileSync(result.filePath, JSON.stringify(exportFile, null, 2), 'utf-8')
    return { ok: true, filePath: result.filePath }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('notes:parse-import-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import notes',
      filters: [
        { name: 'NoteFlow Export', extensions: ['noteflow'] },
        { name: 'JSON', extensions: ['json'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true, error: 'Canceled' }
    }
    const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.version !== 1 || parsed.app !== 'noteflow' || !Array.isArray(parsed.notes)) {
      return { ok: false, error: 'Invalid .noteflow file format' }
    }
    return { ok: true, file: parsed }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('notes:write-imported', async (_event, entries: Array<{ filename: string; content: string }>) => {
  const written: string[] = []
  const errors: string[] = []
  for (const entry of entries) {
    try {
      const dest = path.join(NOTES_DIR, entry.filename)
      fs.writeFileSync(dest, entry.content, 'utf-8')
      written.push(entry.filename)
    } catch (err) {
      errors.push(`${entry.filename}: ${String(err)}`)
    }
  }
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('notes-updated')
  })
  return { written, errors }
})

// ── GitHub Sync ───────────────────────────────────────────────────────────────

ipcMain.handle('sync:get-status', () => {
  return githubSync.getSyncStatus()
})

ipcMain.handle('sync:initiate', async (_event, repo: string) => {
  return githubSync.initiateDeviceFlow(repo, NOTES_DIR, (result) => {
    BrowserWindow.getAllWindows().forEach((win) =>
      win.webContents.send('sync-auth-complete', result)
    )
    if (result.ok) {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
    }
  })
})

ipcMain.handle('sync:cancel-auth', () => {
  githubSync.cancelDeviceFlow()
  return { ok: true }
})

ipcMain.handle('sync:disconnect', () => {
  githubSync.disconnectGitHub()
  return { ok: true }
})

ipcMain.handle('sync:pull', async () => {
  const result = await githubSync.pullNotes(NOTES_DIR)
  if (result.pulled > 0) {
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  }
  return result
})

// ── Settings (userData/settings.json) ────────────────────────────────────────

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify(data), 'utf-8')
}

ipcMain.on('settings:get-theme', (event) => {
  event.returnValue = readSettings().theme ?? null
})

ipcMain.on('settings:set-theme', (_event, themeId: string) => {
  const settings = readSettings()
  settings.theme = themeId
  writeSettings(settings)
})

// Window controls
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window:get-id', (event) => {
  event.returnValue = event.sender.id
})
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', (event) => {
  // Check if it's the main window or a sticky window
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && win !== mainWindow) {
    win.close() // Truly close sticky windows
  } else {
    mainWindow?.hide() // Just hide the main window
  }
})

ipcMain.on('window:open-sticky', (_event, noteId: string, sectionId: string) => {
  createStickyWindow(noteId, sectionId)
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Remove default menu for all windows
  Menu.setApplicationMenu(null)

  githubSync.loadSyncSettings()

  mainWindow = createWindow()
  createTray()
  registerGlobalShortcut()

  app.on('activate', () => {
    showWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })
})

app.on('window-all-closed', () => {
  // Keep alive on all platforms — tray app pattern
  // Do NOT call app.quit() so the tray keeps running
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('second-instance', () => {
  showWindow()
})
