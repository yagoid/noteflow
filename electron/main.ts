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
  net,
  screen,
} from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import os from 'os'
import { spawn } from 'child_process'
import * as githubSync from './githubSync'

function getIconPath(): string {
  const iconExt = process.platform === 'win32' ? 'ico' : 'png'
  return path.join(__dirname, `../public/icon.${iconExt}`)
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let autoSyncTimer: ReturnType<typeof setInterval> | null = null

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ── Push state tracking ───────────────────────────────────────────────────────
// Tracks filenames whose debounced push is still pending or in-flight.
// When the set transitions from empty→non-empty or non-empty→empty we notify
// all renderer windows so the sync button can show an uploading indicator.
const pendingPushFiles = new Set<string>()

function notifyPushState(): void {
  const state: 'pushing' | 'idle' = pendingPushFiles.size > 0 ? 'pushing' : 'idle'
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('sync:push-state', state))
}

function startAutoSync(): void {
  if (autoSyncTimer) return
  autoSyncTimer = setInterval(async () => {
    if (!githubSync.getSyncStatus().connected) return
    try {
      const result = await githubSync.pullNotes(NOTES_DIR)
      if (result.hadDeletions) {
        // A note was removed remotely — need a full reload to update the sidebar
        BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
      } else {
        // Broadcast only the files that actually changed — avoids full reload
        for (const filePath of result.updatedFiles) {
          BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send('notes-updated', filePath, null)
          })
        }
      }
    } catch (err) {
      console.error('[AutoSync] pull failed:', String(err))
    }
  }, AUTO_SYNC_INTERVAL_MS)
}

function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
}

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

function createWindow(hidden = false): BrowserWindow {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor
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
      zoomFactor: scaleFactor,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    if (hidden) return  // startup mode: stay hidden in tray
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

/**
 * Builds a pixel-accurate rounded-rectangle region using 1px horizontal strips.
 * Passed to win.setShape() so Windows DWM knows the true window shape —
 * CSS border-radius alone is ignored by the DWM when the window loses focus.
 */
function roundedRectRegion(w: number, h: number, r: number): { x: number; y: number; width: number; height: number }[] {
  const R = Math.min(r, Math.floor(w / 2), Math.floor(h / 2))
  const rects: { x: number; y: number; width: number; height: number }[] = []
  for (let y = 0; y < R; y++) {
    const d = R - y - 0.5
    const xOff = Math.max(0, R - Math.round(Math.sqrt(Math.max(0, R * R - d * d))))
    rects.push({ x: xOff, y, width: w - 2 * xOff, height: 1 })
    rects.push({ x: xOff, y: h - 1 - y, width: w - 2 * xOff, height: 1 })
  }
  if (h > 2 * R) {
    rects.push({ x: 0, y: R, width: w, height: h - 2 * R })
  }
  return rects
}

function applyStickyShape(win: BrowserWindow, w?: number, h?: number) {
  // win.setShape() is Windows-only (DWM); no-op on Linux/macOS
  if (process.platform !== 'win32') return
  const [ww, hh] = w !== undefined ? [w, h!] : win.getSize()
  // Use half-height for pills (folded state ≤40px), otherwise 8px (rounded-lg)
  const r = hh <= 40 ? Math.floor(hh / 2) : 8
  win.setShape(roundedRectRegion(ww, hh, r))
}

// Stores the pre-fold bounds per window so unfold can restore them exactly
const prevBoundsMap = new Map<number, { x: number; y: number; width: number; height: number }>()

// Tracks all open sticky windows to cascade their initial positions
const stickyWindows = new Set<BrowserWindow>()

// Tracks currently folded sticky windows to stack their pills vertically
const foldedWindows = new Set<BrowserWindow>()

function getFoldedPosition(display: Electron.Display, foldedW: number, foldedH: number): { x: number; y: number } {
  const { x, y, width } = display.workArea
  const targetX = x + width - foldedW - 8
  const GAP = 4
  // Find the bottom edge of the lowest folded pill already in the corner
  let nextY = y + 40
  for (const w of foldedWindows) {
    if (w.isDestroyed()) continue
    const [wx, wy] = w.getPosition()
    const [, wh] = w.getSize()
    if (Math.abs(wx - targetX) < 20) {
      nextY = Math.max(nextY, wy + wh + GAP)
    }
  }
  return { x: targetX, y: nextY }
}

function getStickyInitialPosition(winWidth: number, winHeight: number): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { x: wa_x, y: wa_y, width: wa_w } = display.workArea
  const BASE_X = wa_x + Math.round((wa_w - winWidth) / 2)
  const BASE_Y = wa_y + 60
  const STEP = 30
  for (let i = 0; i < 20; i++) {
    const cx = BASE_X + i * STEP
    const cy = BASE_Y + i * STEP
    const overlaps = [...stickyWindows].some(w => {
      if (w.isDestroyed()) return false
      const [wx, wy] = w.getPosition()
      return Math.abs(wx - cx) < STEP && Math.abs(wy - cy) < STEP
    })
    if (!overlaps) return { x: cx, y: cy }
  }
  return { x: BASE_X, y: BASE_Y }
}

function animateStickyWindow(
  win: BrowserWindow,
  from: { x: number; y: number; width: number; height: number },
  to:   { x: number; y: number; width: number; height: number },
  duration: number,
  onComplete?: () => void
) {
  const startTime = Date.now()
  const fromR = from.height <= 40 ? Math.floor(from.height / 2) : 8
  const toR   = to.height   <= 40 ? Math.floor(to.height   / 2) : 8
  const tick = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(tick); return }
    const t = Math.min((Date.now() - startTime) / duration, 1)
    const e = 1 - Math.pow(1 - t, 3)  // ease-out cubic
    const x = Math.round(from.x + (to.x - from.x) * e)
    const y = Math.round(from.y + (to.y - from.y) * e)
    const w = Math.round(from.width  + (to.width  - from.width)  * e)
    const h = Math.round(from.height + (to.height - from.height) * e)
    const r = Math.round(fromR + (toR - fromR) * e)
    win.setMinimumSize(1, 1)
    win.setSize(w, h)
    win.setPosition(x, y)
    if (process.platform === 'win32') win.setShape(roundedRectRegion(w, h, r))
    if (t >= 1) { clearInterval(tick); onComplete?.() }
  }, 16)
}

function createStickyWindow(noteId: string, sectionId: string): BrowserWindow {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor
  const win = new BrowserWindow({
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: scaleFactor,
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

  // Apply the OS-level window shape so Windows DWM respects the rounded corners
  // even when the window loses focus (CSS border-radius is ignored by DWM).
  win.on('resize', () => applyStickyShape(win))
  win.on('closed', () => {
    prevBoundsMap.delete(win.id)
    stickyWindows.delete(win)
    foldedWindows.delete(win)
  })

  win.once('ready-to-show', () => {
    const { x, y } = getStickyInitialPosition(300, 300)
    win.setPosition(x, y)
    stickyWindows.add(win)
    applyStickyShape(win)
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
      click: () => shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err)),
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
    // Update tray tooltip so the user knows the shortcut is unavailable
    // (common on Linux when an input method or another app captures it)
    tray?.setToolTip('NoteFlow — shortcut unavailable (Ctrl+Shift+Space)')
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
    if (githubSync.getSyncStatus().connected) {
      const filename = path.basename(filePath)
      githubSync.schedulePush(filePath, content,
        () => { pendingPushFiles.add(filename); notifyPushState() },
        () => { pendingPushFiles.delete(filename); notifyPushState() }
      )
    } else {
      githubSync.schedulePush(filePath, content)
    }
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

ipcMain.handle('app:open-notes-folder', () =>
  shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err))
)

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
            let downloadUrl: string
            if (process.platform === 'linux') {
              downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/noteflow_${latest}_amd64.deb`
            } else {
              downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-${latest}-Setup.exe`
            }
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

ipcMain.handle('app:download-and-install', async (_event, url: string) => {
  const tmpDir = app.getPath('temp')
  const fileName = url.split('/').pop() || 'NoteFlow-update.exe'
  const dest = path.join(tmpDir, fileName)

  try {
    const response = await net.fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const total = parseInt(response.headers.get('content-length') || '0')
    let downloaded = 0
    const writer = fs.createWriteStream(dest)
    const reader = response.body!.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      writer.write(Buffer.from(value))
      downloaded += value.length
      const percent = total ? Math.round((downloaded / total) * 100) : -1
      BrowserWindow.getAllWindows().forEach(w =>
        w.webContents.send('update:download-progress', percent)
      )
    }

    await new Promise<void>((resolve, reject) => {
      writer.end()
      writer.on('finish', resolve)
      writer.on('error', reject)
    })

    if (process.platform === 'linux') {
      await new Promise<void>((resolve) => {
        const proc = spawn('pkexec', ['dpkg', '-i', dest], { detached: true, stdio: 'ignore' })
        proc.on('error', () => {
          // pkexec not available, fall back to xdg-open
          shell.openPath(dest)
          resolve()
        })
        proc.on('spawn', () => { proc.unref(); resolve() })
      })
    } else {
      await shell.openPath(dest)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
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
      startAutoSync()
    }
  })
})

ipcMain.handle('sync:cancel-auth', () => {
  githubSync.cancelDeviceFlow()
  return { ok: true }
})

ipcMain.handle('sync:disconnect', () => {
  stopAutoSync()
  githubSync.disconnectGitHub()
  return { ok: true }
})

ipcMain.handle('sync:pull', async () => {
  const result = await githubSync.pullNotes(NOTES_DIR)
  if (result.hadDeletions || result.pulled === 0) {
    // Full reload: covers deletions AND the case where the file was already on disk
    // (written by auto-sync) but the UI missed the event — manual sync should always
    // bring the store in sync with disk.
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  } else {
    for (const filePath of result.updatedFiles) {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', filePath, null))
    }
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

ipcMain.handle('app:get-login-item', () => {
  const openAtLogin = (readSettings().openAtLogin ?? false) as boolean
  return { openAtLogin }
})

ipcMain.handle('app:set-login-item', (_event, enabled: boolean) => {
  const settings = readSettings()
  settings.openAtLogin = enabled
  writeSettings(settings)
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: enabled ? ['--noteflow-startup'] : [],
    })
    return { ok: true }
  } catch (err) {
    console.error('Failed to set login item:', err)
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('settings:get-startup-stickies', () => {
  return (readSettings().startupStickies ?? [])
})

ipcMain.handle('settings:set-startup-stickies', (_event, stickies: Array<{ noteId: string; sectionId: string }>) => {
  const settings = readSettings()
  settings.startupStickies = stickies
  writeSettings(settings)
})

ipcMain.handle('groups:get', () => {
  const groupsPath = path.join(NOTES_DIR, 'groups.json')
  try {
    return JSON.parse(fs.readFileSync(groupsPath, 'utf-8'))
  } catch { return [] }
})

ipcMain.handle('groups:set', (_event, groups: unknown[]) => {
  const groupsPath = path.join(NOTES_DIR, 'groups.json')
  const content = JSON.stringify(groups, null, 2)
  fs.writeFileSync(groupsPath, content, 'utf-8')
  githubSync.schedulePush(groupsPath, content)
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

ipcMain.on('window:set-size', (event, width: number, height: number, minW: number, minH: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  win.setMinimumSize(minW, minH)
  win.setSize(width, height)
})

ipcMain.on('window:fold-to-corner', (event, foldedW: number, foldedH: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const from = win.getBounds()
  prevBoundsMap.set(win.id, from)
  foldedWindows.add(win)
  const display = screen.getDisplayNearestPoint(from)
  const { x: toX, y: toY } = getFoldedPosition(display, foldedW, foldedH)
  const to = { x: toX, y: toY, width: foldedW, height: foldedH }
  animateStickyWindow(win, from, to, 300)
})

ipcMain.on('window:unfold', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const prev = prevBoundsMap.get(win.id)
  if (!prev) return
  foldedWindows.delete(win)
  const from = win.getBounds()
  animateStickyWindow(win, from, prev, 280, () => {
    if (!win.isDestroyed()) {
      win.setMinimumSize(200, 200)
      applyStickyShape(win)
    }
  })
  prevBoundsMap.delete(win.id)
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

// Ensure single instance — second-instance event brings the existing window to front
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.whenReady().then(() => {
  // Remove default menu for all windows
  Menu.setApplicationMenu(null)

  githubSync.loadSyncSettings()
  if (githubSync.getSyncStatus().connected) startAutoSync()

  const isStartupMode = process.argv.includes('--noteflow-startup')
  const startupStickies = (readSettings().startupStickies ?? []) as Array<{ noteId: string; sectionId: string }>

  if (isStartupMode && startupStickies.length > 0) {
    // Launched at system startup with sticky notes configured:
    // keep main window hidden in tray and open the selected sticky notes
    mainWindow = createWindow(true)
    for (const { noteId, sectionId } of startupStickies) {
      createStickyWindow(noteId, sectionId)
    }
  } else {
    mainWindow = createWindow()
  }

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
