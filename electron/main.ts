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
  powerMonitor,
  Notification,
} from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import os from 'os'
import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import * as githubSync from './githubSync'
import * as cloudSync from './cloudSync'
import * as cloudKeys from './cloudKeys'
import * as cloudRealtime from './cloudRealtime'
import { getActiveSyncProvider, getActiveSyncStatus, type SyncPullResult } from './syncProvider'
import * as account from './account'
import {
  planAccountTransition,
  parseAccountRestore,
  clearRestoreSurface,
  type AccountRestoreRecord,
  type AccountTransitionPlan,
  type RestoreSurface,
} from './accountTransition'
import { LEMONSQUEEZY_CHECKOUT_URLS, AI_PROXY_URL } from './cloudConfig'
import * as aiIndex from './ai/aiIndex'
import * as llm from './ai/llm'
import * as agentTools from './ai/llm/tools'
import * as noteFormat from './noteFormat'
import { sanitizeUiSettings, mergeUiSettings, type UiSettings } from './uiSettings'
import * as importers from './importers'
import { migrateNotesDirToV2 } from './migration'
import { shouldRunExpiryCheck, type ExpiryTrigger, type SyncBackendId } from './tempNoteExpiry'
import { resolveLang, getTrayMessages, getMessages, type LanguageSetting } from './i18n'


function getIconPath(): string {
  if (process.platform === 'win32') return path.join(__dirname, '../public/icon.ico')
  // In dev, the icon lives in public/; in production Vite copies it to dist/
  // (only dist/ and dist-electron/ are packed into the ASAR, not public/)
  const dir = (app.isPackaged || process.env.NOTEFLOW_NATIVE) ? '../dist' : '../public'
  return path.join(__dirname, `${dir}/icon.png`)
}

const isDev = process.env.NODE_ENV === 'development' || (!app.isPackaged && !process.env.NOTEFLOW_NATIVE)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// Whether the global shortcut failed to register — changes the tray tooltip. Kept
// as module state so the tooltip survives a language change (applyTrayMenu re-reads it).
let shortcutUnavailable = false
let isQuitting = false
let autoSyncTimer: ReturnType<typeof setInterval> | null = null

// Track paths recently written by the app so fs.watch can ignore them.
// Keys are notes-dir-relative with forward slashes: '<dir>' or '<dir>/<file>'.
const recentInternalWrites = new Set<string>()
function markInternalWrite(relPath: string) {
  recentInternalWrites.add(relPath)
  setTimeout(() => recentInternalWrites.delete(relPath), 1500)
}

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

// ── Alarm engine ─────────────────────────────────────────────────────────────

interface AlarmEntry {
  noteTitle: string
  taskText:  string
  alarmAt:   string  // ISO timestamp 'YYYY-MM-DDTHH:MM:00'
}

const registeredAlarms = new Map<string, AlarmEntry>()
const firedAlarms      = new Set<string>()

function alarmKey(e: AlarmEntry): string {
  return `${e.alarmAt}|${e.noteTitle}|${e.taskText}`
}

function checkAlarms(): void {
  const now = new Date()
  for (const [key, entry] of registeredAlarms) {
    if (firedAlarms.has(key)) continue
    if (now >= new Date(entry.alarmAt)) {
      firedAlarms.add(key)
      try {
        if (Notification.isSupported()) {
          new Notification({
            title: `📅 ${entry.noteTitle}`,
            body:  entry.taskText,
            silent: false,
          }).show()
        }
      } catch (err) {
        console.error('[Alarms] Notification failed:', err)
      }
    }
  }
}

let alarmTimer: ReturnType<typeof setInterval> | null = null

function checkExpiredNotes(): void {
  try {
    const now = new Date()
    for (const dir of noteFormat.listNoteDirs(NOTES_DIR)) {
      const dirPath = path.join(NOTES_DIR, dir)
      try {
        const content = fs.readFileSync(path.join(dirPath, noteFormat.NOTE_MD), 'utf-8')
        const match = content.match(/^expiresAt:\s*(.+)$/m)
        if (!match) continue
        const raw = match[1].trim().replace(/^["']|["']$/g, '')
        const expiresAt = new Date(raw)
        if (isNaN(expiresAt.getTime()) || now < expiresAt) continue
        markInternalWrite(dir)
        try {
          for (const f of fs.readdirSync(dirPath)) markInternalWrite(`${dir}/${f}`)
        } catch { /* ignore */ }
        fs.rmSync(dirPath, { recursive: true, force: true })
        BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
        getActiveSyncProvider().scheduleDeleteDir(dir)
      } catch {
        // ignore per-note errors
      }
    }
  } catch (err) {
    console.error('[TempNotes] checkExpiredNotes failed:', err)
  }
}

/**
 * Gate in front of checkExpiredNotes(). Without sync it runs on the timer
 * (startup + every 60s) as always; with a sync backend connected it runs ONLY
 * right after a clean pull of that backend, so a device holding a stale
 * temporary copy (e.g. made permanent elsewhere while this one slept) pulls
 * the newer version before it can delete the note locally and remotely.
 * Rationale and the "no pull ⇒ no expiry" trade-off: tempNoteExpiry.ts.
 */
function maybeCheckExpiredNotes(trigger: ExpiryTrigger): void {
  const sync = getActiveSyncProvider()
  // Cloud is the active provider iff it is enabled. Count it as connected even
  // while signed out / not yet restored: otherwise the timer would expire notes
  // and journal remote deletes that land once the session comes back.
  const connected = sync.id === 'cloud' || sync.isConnected()
  if (shouldRunExpiryCheck(trigger, { backend: sync.id, connected })) {
    checkExpiredNotes()
  }
}

function startAlarmEngine(): void {
  if (alarmTimer) return
  alarmTimer = setInterval(() => {
    checkAlarms()
    maybeCheckExpiredNotes({ kind: 'timer' })
  }, 60_000)
}

ipcMain.on('alarms:schedule', (_event, incoming: AlarmEntry[]) => {
  registeredAlarms.clear()
  for (const e of incoming) {
    registeredAlarms.set(alarmKey(e), e)
  }
  // Immediately fire any alarms that are already due (including missed ones)
  checkAlarms()
})

function emitSyncStatusChanged(): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('sync:status-changed')
  })
}

// Broadcasts the PUBLIC account status (never tokens) to every window.
function emitAccountStatusChanged(): void {
  const status = account.getAccountStatus()
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('account:status-changed', status)
  })
}

// Baseline for the 'ai' entitlement, established on the FIRST status observation of the
// CURRENT signed-in identity (app boot with a persisted session, or right after sign-in) and
// never used to trigger anything by itself — entitlements are re-fetched from scratch on every
// boot (account.ts persists no entitlements), so a naive false→true edge on that first read
// would force-switch the provider on every single launch for an already-subscribed user, even
// one who deliberately kept a BYO-key provider active. Only a REAL transition seen LATER for
// the SAME identity in the same run (e.g. the user subscribes, comes back and hits Refresh in
// Settings → Account) should auto-activate the managed provider.
// Keyed by identity (the signed-in email, or `null` while signed out) so that signing out and
// signing back in — as the same account or a different one — always re-establishes a fresh
// baseline instead of carrying over a stale `false` from a previous session: without this, an
// account B that already had the entitlement before this process even started would look like
// it just "transitioned" the moment it signs in after account A (which lacked it) signs out.
let aiEntitlementBaseline: boolean | null = null
let aiEntitlementIdentity: string | null = null

// Last observed account snapshot — the "previous" side of the sign-in/sign-out
// edge that planAccountTransition() reasons about. Seeded at boot from the
// persisted session (app.whenReady), so a session restored from disk is NOT
// seen as a sign-in transition.
let lastAccountSnapshot: { signedIn: boolean; identity: string | null } = { signedIn: false, identity: null }

function accountIdentityOf(status: account.AccountStatus): string | null {
  return status.signedIn ? (status.email ?? null) : null
}

// Small non-secret record of what the signing-out session had enabled, so that
// signing back in with the SAME identity puts it back (see accountTransition.ts).
function readAccountRestore(): AccountRestoreRecord | null {
  return parseAccountRestore(readSettings().accountRestore)
}

function writeAccountRestore(record: AccountRestoreRecord | null): void {
  const settings = readSettings()
  if (record) settings.accountRestore = record
  else delete settings.accountRestore
  writeSettings(settings)
}

/**
 * An explicit user action on a paid surface (Cloud enable/disable, switching the
 * LLM provider) overrules the pending restore record for that surface — the app
 * must never flip a live decision back behind the user's back when the deferred
 * entitlements finally land. See clearRestoreSurface.
 */
function dropRestoreSurface(surface: RestoreSurface): void {
  const next = clearRestoreSurface(readAccountRestore(), account.getAccountStatus().signedIn, surface)
  if (next !== undefined) writeAccountRestore(next)
}

// Applies the plan of accountTransition.ts: tear the paid subsystems down on
// sign-out (Cloud off, DEK dropped, assistant back to a BYO/local provider) and
// put them back on a matching sign-in. Every branch is a no-op unless the plan
// asked for it, so this runs on every account status change.
function applyAccountTransition(plan: AccountTransitionPlan): void {
  let cloudChanged = false

  if (plan.disableCloud) {
    // Keeps lastSync/pullCursor/journal — re-enabling resumes incrementally.
    // Releases the mutual exclusion too: GitHub Sync resumes on its next tick.
    cloudSync.disableCloudSync()
    stopCloudAutoSync()
    cloudChanged = true
  }
  if (plan.resetKeys) {
    // Not just lockCloudKeys(): the LEARNED key state (remoteKeysKnown, keysMode)
    // belongs to the session that is leaving — see cloudKeys.resetCloudKeysSession.
    cloudKeys.resetCloudKeysSession()
    cloudChanged = true
  }
  if (plan.enableCloud) {
    // No initial pull from here: the DEK is null by construction on this path
    // (the sign-out dropped it and its cache), so pulling now would only set
    // syncError = "Cloud keys are locked". runCloudSyncCycle does it in the
    // right order — managed auto-unlock → drain journal → pull.
    const res = cloudSync.enableCloudSync()
    if (res.ok) {
      startCloudAutoSync()
      runCloudSyncCycle().catch((err) => console.error('[Cloud] restore sync cycle failed:', String(err)))
    }
    cloudChanged = true
  }
  if (plan.setAiProvider) {
    const cfg = readLlmSettings()
    if (cfg.active !== plan.setAiProvider) {
      writeLlmSettings(llm.withActiveProvider(cfg, plan.setAiProvider))
    }
  }
  if (plan.restore !== undefined) writeAccountRestore(plan.restore)

  // lockCloudKeys()/enable+disable don't all emit by themselves — one broadcast
  // covers the lot (and reconciles the Realtime subscription).
  if (cloudChanged) emitCloudStatusChanged()
}

function handleAccountStatusChanged(): void {
  const status = account.getAccountStatus()
  const identity = status.signedIn ? (status.email ?? '') : null
  const aiActive = status.entitlements.ai

  if (identity !== aiEntitlementIdentity) {
    // Identity changed since the last observation (fresh sign-in, switch to a different
    // account, or signing out) — start a fresh baseline for it without triggering anything.
    aiEntitlementIdentity = identity
    aiEntitlementBaseline = identity === null ? null : aiActive
  } else if (aiEntitlementBaseline !== null && !aiEntitlementBaseline && aiActive) {
    // Same identity as before, real subscribe-while-running transition — auto-switch to the
    // managed provider unless it's already active (avoid an unnecessary settings write).
    // Written BEFORE the broadcast below so the renderer's config reload (LlmConfigView reacts
    // to onAccountStatusChanged) already sees the new active provider.
    const cfg = readLlmSettings()
    if (cfg.active !== 'noteflow') writeLlmSettings(llm.withActiveProvider(cfg, 'noteflow'))
    aiEntitlementBaseline = aiActive
  } else {
    aiEntitlementBaseline = identity === null ? null : aiActive
  }

  // Sign-out teardown / sign-in restore of the paid subsystems. Read AFTER the
  // auto-switch above so the plan sees the current provider; both paths write
  // BEFORE the broadcast below, so the renderer reloads with the final state.
  // (The two never collide: the auto-switch only fires for the SAME identity,
  // the restore only for a matching record on a fresh sign-in.)
  const previous = lastAccountSnapshot
  lastAccountSnapshot = { signedIn: status.signedIn, identity: accountIdentityOf(status) }
  const llmCfg = readLlmSettings()
  applyAccountTransition(
    planAccountTransition(
      previous,
      {
        signedIn: status.signedIn,
        identity: accountIdentityOf(status),
        entitlements: status.entitlements,
        entitlementsKnown: !!status.entitlementsFetchedAt,
      },
      {
        cloudEnabled: cloudSync.isCloudSyncEnabled(),
        aiManaged: llmCfg.active === 'noteflow',
        aiFallbackProvider: llm.byoFallbackProvider(llmCfg),
        restore: readAccountRestore(),
      }
    )
  )

  // Managed cloud keys unlock silently as soon as a session exists (fresh
  // sign-in, or account events on a restored one). No-op for e2ee / no-keys /
  // already-unlocked sessions — see cloudKeys.autoUnlockManaged.
  if (status.signedIn) {
    cloudKeys.autoUnlockManaged()
      .then((changed) => { if (changed) emitCloudStatusChanged() })
      .catch(() => { /* autoUnlockManaged never throws, but be safe */ })
  }

  // Account transitions gate the cloud Realtime subscription too (it needs a
  // session for its JWT): most notably sign-out must tear the socket down —
  // no cloud:status event fires in that path.
  syncCloudRealtimeState()

  emitAccountStatusChanged()
}

// Notes that arrive from a pull are content the semantic index has never seen. Schedule the
// incremental index for each pulled note dir (skipped while the worker is dormant, but it still
// flags the index as behind) and mark deletions/metadata as an unattributable change.
function indexPulledNotes(result: SyncPullResult): void {
  if (!aiIndex.isEnabled()) return
  for (const dirPath of result.updatedFiles) aiIndex.scheduleIndex(dirPath)
  if (result.hadDeletions || result.hadMetadataChanges) aiIndex.markStaleUnknown()
}

function broadcastPullResult(result: SyncPullResult, backend: SyncBackendId): void {
  indexPulledNotes(result)
  if (result.hadDeletions || result.hadMetadataChanges) {
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  } else {
    for (const filePath of result.updatedFiles) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('notes-updated', filePath, null)
      })
    }
  }
  emitSyncStatusChanged()
  expireNotesAfterPull(result, backend)
}

// Every pull funnels here (broadcastPullResult + the two manual pulls): with sync
// connected this is the only place temporary notes are expired — see maybeCheckExpiredNotes.
function expireNotesAfterPull(result: SyncPullResult, backend: SyncBackendId): void {
  maybeCheckExpiredNotes({
    kind: 'pull',
    backend,
    errorCount: result.errors.length,
    incomplete: result.incomplete === true,
  })
}

function startAutoSync(): void {
  if (autoSyncTimer) return
  autoSyncTimer = setInterval(async () => {
    // Mutual exclusion: while NoteFlow Cloud is enabled it owns the sync loop
    // (see syncProvider.ts) — the GitHub timer stands down without being torn
    // down, so disabling Cloud resumes GitHub on the next tick.
    if (cloudSync.isCloudSyncEnabled()) return
    if (!githubSync.getSyncStatus().connected) return
    // Drain the journal of failed remote mutations BEFORE pulling: a pending
    // upsert/delete that never landed would otherwise make the pull delete the
    // note locally or resurrect it (retrySyncJournal awaits each op, so the
    // mutation queue is drained when it returns).
    try {
      await githubSync.retrySyncJournal(NOTES_DIR)
    } catch (err) {
      console.error('[AutoSync] journal retry failed:', String(err))
    }
    // Stand down while local writes/deletes are still draining to the remote: pulling
    // now could re-add a note whose remote delete hasn't landed yet (the next tick,
    // 5 min later, runs with the queue drained). Manual pulls are unaffected.
    if (githubSync.hasPendingRemoteMutations()) {
      console.log('[AutoSync] skipping pull — remote mutations pending')
      return
    }
    try {
      const result = await githubSync.pullNotes(NOTES_DIR)
      broadcastPullResult(result, 'github')
    } catch (err) {
      console.error('[AutoSync] pull failed:', String(err))
      emitSyncStatusChanged()
    }
  }, AUTO_SYNC_INTERVAL_MS)
}

function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
}

// ── NoteFlow Cloud autosync (Realtime signal + safety-net timer — stage 3) ────

let cloudAutoSyncTimer: ReturnType<typeof setInterval> | null = null

// Broadcasts the PUBLIC cloud status (never key material) to every window.
// Every cloud state transition funnels through here, which makes it the one
// choke point to also reconcile the Realtime subscription with the new state
// (enable/disable, setup, unlock/lock, managed auto-unlock — all emit).
function emitCloudStatusChanged(): void {
  syncCloudRealtimeState()
  const status = cloudSync.getCloudSyncStatus()
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('cloud:status-changed', status)
  })
}

// Single-flight guard: Realtime signals and the safety-net timer both funnel
// into runCloudSyncCycle — a cycle requested while one is running marks it
// dirty and re-runs ONCE at the end (coalesces bursts, never overlaps pulls).
let cloudSyncCycleRunning = false
let cloudSyncCycleDirty = false

/**
 * One cloud sync cycle: managed auto-unlock if needed → drain the journal →
 * stand down if writes are in flight → incremental pull → broadcast. Same
 * ordering rationale as the GitHub autosync tick above.
 */
async function runCloudSyncCycle(): Promise<void> {
  if (cloudSyncCycleRunning) {
    cloudSyncCycleDirty = true
    return
  }
  cloudSyncCycleRunning = true
  try {
    do {
      cloudSyncCycleDirty = false
      await runCloudSyncCycleOnce()
    } while (cloudSyncCycleDirty)
  } finally {
    cloudSyncCycleRunning = false
  }
}

async function runCloudSyncCycleOnce(): Promise<void> {
  if (!cloudSync.isCloudSyncEnabled()) return
  // Locked keys: managed sessions re-unlock silently (e.g. the boot attempt
  // ran offline); e2ee stays locked until the user types the passphrase.
  // Pending ops stay journaled and drain after unlock either way.
  if (cloudSync.getCloudSyncStatus().keysState !== 'unlocked') {
    const changed = await cloudKeys.autoUnlockManaged().catch(() => false)
    if (changed) emitCloudStatusChanged()
    if (cloudSync.getCloudSyncStatus().keysState !== 'unlocked') return
  }
  // Same ordering as the GitHub tick: drain the journal first, then stand
  // down if writes are still in flight, then pull.
  try {
    await cloudSync.retrySyncJournal(NOTES_DIR)
  } catch (err) {
    console.error('[CloudAutoSync] journal retry failed:', String(err))
  }
  if (cloudSync.hasPendingRemoteMutations()) {
    console.log('[CloudAutoSync] skipping pull — remote mutations pending')
    return
  }
  try {
    const result = await cloudSync.pullNotes(NOTES_DIR)
    broadcastPullResult(result, 'cloud')
  } catch (err) {
    console.error('[CloudAutoSync] pull failed:', String(err))
  }
  emitCloudStatusChanged()
}

// A push from another device lands as a BURST of Realtime events (one per row
// of the note folder) — debounce them into a single sync cycle.
const CLOUD_REALTIME_DEBOUNCE_MS = 1500
let cloudRealtimeDebounce: ReturnType<typeof setTimeout> | null = null

function onCloudRemoteChange(): void {
  if (cloudRealtimeDebounce) clearTimeout(cloudRealtimeDebounce)
  cloudRealtimeDebounce = setTimeout(() => {
    cloudRealtimeDebounce = null
    runCloudSyncCycle().catch((err) =>
      console.error('[CloudRealtime] sync cycle failed:', String(err))
    )
  }, CLOUD_REALTIME_DEBOUNCE_MS)
}

// Reconciles the Realtime subscription with the current state: it runs only
// while Cloud sync is enabled, there is a session AND the keys are unlocked
// (events are useless while a pull can't decrypt anyway). Both start and stop
// are idempotent, so calling this on every status transition is safe.
function syncCloudRealtimeState(): void {
  const status = cloudSync.getCloudSyncStatus()
  if (status.enabled && status.signedIn && status.keysState === 'unlocked') {
    cloudRealtime.startCloudRealtime(onCloudRemoteChange)
  } else {
    cloudRealtime.stopCloudRealtime()
    if (cloudRealtimeDebounce) {
      clearTimeout(cloudRealtimeDebounce)
      cloudRealtimeDebounce = null
    }
  }
}

// Orchestrator: starts BOTH halves of the cloud autosync — the Realtime
// subscription (instant signal) and the periodic safety-net loop (covers a
// down WebSocket and drains the journal while offline).
function startCloudAutoSync(): void {
  syncCloudRealtimeState()
  if (cloudAutoSyncTimer) return
  cloudAutoSyncTimer = setInterval(() => {
    runCloudSyncCycle().catch((err) =>
      console.error('[CloudAutoSync] sync cycle failed:', String(err))
    )
  }, cloudSync.CLOUD_AUTO_SYNC_INTERVAL_MS)
}

function stopCloudAutoSync(): void {
  cloudRealtime.stopCloudRealtime()
  if (cloudRealtimeDebounce) {
    clearTimeout(cloudRealtimeDebounce)
    cloudRealtimeDebounce = null
  }
  if (cloudAutoSyncTimer) {
    clearInterval(cloudAutoSyncTimer)
    cloudAutoSyncTimer = null
  }
}

const OLD_NOTES_DIR = path.join(os.homedir(), 'scratch-notes')

// On Linux, follow XDG Base Directory Specification using ~/.local/share as base.
// We intentionally avoid process.env.XDG_DATA_HOME because snap/flatpak runtimes
// override it to their sandboxed paths, which would make notes inaccessible outside
// the dev environment.
// NOTEFLOW_NOTES_DIR overrides the location (testing / scripting; mirrors the CLI).
const NOTES_DIR = process.env.NOTEFLOW_NOTES_DIR || (process.platform === 'linux'
  ? path.join(os.homedir(), '.local', 'share', 'noteflow-notes')
  : path.join(os.homedir(), 'noteflow-notes'))

// Migrate old ~/scratch-notes → new NOTES_DIR
if (fs.existsSync(OLD_NOTES_DIR) && !fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(path.dirname(NOTES_DIR), { recursive: true })
  fs.renameSync(OLD_NOTES_DIR, NOTES_DIR)
}

// On Linux: migrate legacy ~/noteflow-notes → ~/.local/share/noteflow-notes
if (process.platform === 'linux') {
  const legacyLinuxDir = path.join(os.homedir(), 'noteflow-notes')
  if (fs.existsSync(legacyLinuxDir) && !fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(path.dirname(NOTES_DIR), { recursive: true })
    fs.renameSync(legacyLinuxDir, NOTES_DIR)
  }
}

// Ensure notes directory exists
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true })
}

const GROUPS_FILE = path.join(NOTES_DIR, 'groups.json')
const FOLDERS_FILE = path.join(NOTES_DIR, 'folders.json')
const SECTION_COLORS_FILE = path.join(NOTES_DIR, 'section-colors.json')
const NOTE_ORDER_FILE = path.join(NOTES_DIR, 'note-order.json')
const TEMPLATES_FILE = path.join(NOTES_DIR, 'templates.json')
const UI_SETTINGS_FILE = path.join(NOTES_DIR, 'ui-settings.json')
const SECTION_COLOR_VALUES = new Set([
  '--accent',
  '--accent-2',
  '--red',
  '--cyan',
  '--purple',
  '--text',
  '--orange',
  '--pink',
])

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:'])
const ALLOWED_UPDATE_HOSTS = new Set(['github.com'])
const ALLOWED_UPDATE_REDIRECT_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])

function normalizeSectionColorKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Mirror of normalizeGroupColor() in src/lib/tagColors.ts (main can't import from src/):
 * a theme var stays as-is, a free colour is normalized to lowercase '#rrggbb'
 * ('#rgb' shorthand expanded); anything else is dropped.
 */
function normalizeSectionColorValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (SECTION_COLOR_VALUES.has(v)) return v
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  return null
}

function sanitizeSectionColors(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const color = normalizeSectionColorValue(value)
    if (!color) continue
    const normalizedKey = normalizeSectionColorKey(key)
    if (!normalizedKey) continue
    next[normalizedKey] = color
  }
  return next
}

// Root-level entries of the notes dir that can never be a note directory
const RESERVED_ROOT_NAMES = new Set([
  'groups.json',
  'folders.json',
  'section-colors.json',
  'note-order.json',
  'templates.json',
  'ui-settings.json',
  'README.md',
  noteFormat.FORMAT_MARKER_FILE,
])

/** Validates a note directory name (accepts an absolute dir path; uses its basename). */
function ensureSafeDirname(dirOrPath: string): string {
  if (typeof dirOrPath !== 'string') throw new Error('Invalid note directory')
  const dir = path.basename(dirOrPath.replace(/[\\/]+$/, '')).trim()
  if (!dir || dir === '.' || dir === '..') throw new Error('Invalid note directory')
  if (dir.includes('/') || dir.includes('\\')) throw new Error('Invalid note directory')
  if (dir.startsWith('.') || RESERVED_ROOT_NAMES.has(dir)) throw new Error('Invalid note directory')
  if (dir.length > 160) throw new Error('Note directory name is too long')
  return dir
}

/** Validates a file name inside a note directory (note.md or a section .md). */
function ensureSafeNoteFile(file: string): string {
  if (typeof file !== 'string') throw new Error('Invalid note file name')
  const name = file.trim()
  if (!name || name === '.' || name === '..') throw new Error('Invalid note file name')
  if (name.includes('/') || name.includes('\\') || path.basename(name) !== name) throw new Error('Invalid note file name')
  if (!name.toLowerCase().endsWith('.md')) throw new Error('Only markdown note files are allowed')
  if (name.length > 160) throw new Error('Note file name is too long')
  return name
}

function parseHttpsUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl)
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null
    return parsed
  } catch {
    return null
  }
}

function isAllowedInitialUpdateUrl(url: URL): boolean {
  if (!ALLOWED_UPDATE_HOSTS.has(url.hostname)) return false
  const pathname = url.pathname.toLowerCase()
  if (!pathname.includes('/yagoid/noteflow/releases/')) return false
  return pathname.endsWith('.exe') || pathname.endsWith('.deb') || pathname.endsWith('.AppImage') || pathname.endsWith('.pkg.tar.zst') || pathname.endsWith('.dmg')
}

function isAllowedRedirectUpdateUrl(url: URL): boolean {
  return ALLOWED_UPDATE_REDIRECT_HOSTS.has(url.hostname)
}

function createWindow(hidden = false): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
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
      // Prevent Chromium from throttling/killing the renderer while hidden in the
      // tray. Without this, the renderer can crash after suspend or prolonged idle,
      // leaving a blank window that requires a full process restart to recover.
      backgroundThrottling: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Reset any persisted zoom level — Chromium stores zoom preferences in the
  // user data directory; old versions set zoomFactor: scaleFactor which got
  // persisted, causing the app to appear zoomed even after that code was removed.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1)
  })

  win.once('ready-to-show', () => {
    if (hidden) return  // startup mode: stay hidden in tray
    win.show()
  })

  // Hide instead of close — keeps the process alive for fast re-open
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  // Auto-recover when the renderer process crashes or is killed by the OS
  // (common after system suspend/resume or prolonged idle under memory pressure).
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    console.error('[Renderer] Process gone:', details.reason, details.exitCode)
    if (isDev) {
      win.loadURL('http://localhost:5173')
    } else {
      win.loadFile(path.join(__dirname, '../dist/index.html'))
    }
    // After the reload, send notes-updated once the renderer is ready.
    // The powerMonitor.resume signals may have already been sent to the old
    // (now dead) renderer, so the new one needs its own trigger.
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!win.isDestroyed()) win.webContents.send('notes-updated')
      }, 2000)
    })
  })

  win.on('unresponsive', () => {
    console.warn('[Renderer] Unresponsive — reloading')
    win.webContents.reload()
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!win.isDestroyed()) win.webContents.send('notes-updated')
      }, 2000)
    })
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

function getFoldedPosition(display: Electron.Display, foldedW: number, _foldedH: number): { x: number; y: number } {
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

function getStickyInitialPosition(winWidth: number, _winHeight: number): { x: number; y: number } {
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
  // On Windows, `transparent: true` stops compositing correctly after some Win11
  // updates (24H2/25H2), leaving the sticky window near-invisible. The rounded
  // corners come from setShape() (DWM region clip) there, so transparency is
  // redundant: use an opaque neutral background instead. On Linux/macOS setShape()
  // is a no-op and CSS rounding still needs transparency.
  const isWin = process.platform === 'win32'
  const win = new BrowserWindow({
    width: 300,
    height: 300,
    minWidth: 200,
    minHeight: 200,
    frame: false,
    transparent: !isWin,
    backgroundColor: isWin ? '#1e1e1e' : '#00000000',
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

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1)
  })

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
  const dir = (app.isPackaged || process.env.NOTEFLOW_NATIVE) ? '../dist' : '../public'
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, `${dir}/icon.ico`)
    : path.join(__dirname, `${dir}/tray-icon.png`)

  let icon: Electron.NativeImage = nativeImage.createFromPath(iconPath)

  // Resize to 16×16 so Windows renders it correctly in the system tray
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 })
  } else {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  applyTrayMenu()
  tray.on('click', () => toggleWindow())
}

/** Resolves the active UI language from the persisted setting (lazy OS locale). */
function currentTrayLang() {
  const setting = readSettings().language as LanguageSetting | undefined
  return resolveLang(setting, () => app.getLocale())
}

/**
 * Full main-process message tree in the active language, resolved at call-time so
 * notifications and native dialogs follow the current `language` setting live.
 */
function mainMessages() {
  return getMessages(currentTrayLang())
}

/**
 * (Re)builds the tray context menu + tooltip in the current language. Called on
 * tray creation and whenever the language changes, so the menu switches live.
 */
function applyTrayMenu() {
  if (!tray) return
  const t = getTrayMessages(currentTrayLang())
  tray.setToolTip(shortcutUnavailable ? t.tooltipShortcutUnavailable : t.tooltip)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: t.open,
      click: () => toggleWindow(),
    },
    {
      label: t.newNote,
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => {
        showWindow()
        mainWindow?.webContents.send('new-note')
      },
    },
    { type: 'separator' },
    {
      label: t.openNotesFolder,
      click: () => shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err)),
    },
    { type: 'separator' },
    {
      label: t.quit,
      click: () => {
        mainWindow?.webContents.session.flushStorageData()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}

/**
 * Brings the main window up and gives it focus.
 *
 * On Windows show()+focus() is not enough when the call comes from the
 * 'second-instance' event: clicking the pinned taskbar icon spawns a second
 * process, that process loses the single-instance lock and quits, but while it
 * lives IT is the foreground process — so Windows blocks SetForegroundWindow
 * for us and the window comes up BEHIND the others (the reported "first click
 * does nothing, you have to click twice" bug). The always-on-top bounce is the
 * usual workaround: flip it on, restore the previous value and move to top,
 * which pulls the window to the front without leaving it pinned.
 */
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  if (process.platform === 'win32') {
    const wasAlwaysOnTop = mainWindow.isAlwaysOnTop()
    mainWindow.setAlwaysOnTop(true)
    mainWindow.setAlwaysOnTop(wasAlwaysOnTop)
    mainWindow.moveTop()
  }
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

/**
 * Watches the notes dir for external changes (CLI, sync from another device).
 * Events are normalized to '<dir>' or '<dir>/<file>' (forward slashes) and
 * debounced per note dir; the broadcast always carries the note DIRECTORY path
 * so the renderer re-reads the whole note. Root-level files (metadata json,
 * README, format marker, leftover flat .md) are ignored.
 *
 * Windows/macOS use native recursive watching. Node has no recursive fs.watch
 * on Linux, so there we watch the root (dir add/remove) plus one watcher per
 * note dir (file changes), refreshing the watcher set on root events.
 */
function startNotesWatcher(): void {
  const pendingWatchDebounce = new Map<string, ReturnType<typeof setTimeout>>()

  const broadcastAll = () =>
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  const broadcastDir = (dir: string) => {
    const dirPath = path.join(NOTES_DIR, dir)
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', dirPath, null))
  }

  const handleEvent = (rel: string | null) => {
    if (rel === null) {
      // Filename unavailable (inotify edge case) — full reload covers all cases
      const existing = pendingWatchDebounce.get('__all__')
      if (existing) clearTimeout(existing)
      pendingWatchDebounce.set('__all__', setTimeout(() => {
        pendingWatchDebounce.delete('__all__')
        broadcastAll()
      }, 150))
      return
    }

    const parts = rel.split('/')
    const dir = parts[0]
    // Root-level files (json/README/marker/flat .md) — note dirs never contain a dot
    if (parts.length === 1 && dir.includes('.')) return
    if (parts.length === 2 && !parts[1].endsWith('.md')) return
    if (parts.length > 2) return
    if (recentInternalWrites.has(rel) || recentInternalWrites.has(dir)) return

    // Debounce per note dir: a single save touches note.md + section files,
    // and fs.watch can fire multiple times per write (Windows). 150 ms lets
    // the multi-file write settle into ONE broadcast.
    const existing = pendingWatchDebounce.get(dir)
    if (existing) clearTimeout(existing)
    pendingWatchDebounce.set(dir, setTimeout(() => {
      pendingWatchDebounce.delete(dir)
      let isNoteDir = false
      try {
        isNoteDir = fs.existsSync(path.join(NOTES_DIR, dir, noteFormat.NOTE_MD))
      } catch { /* treat as gone */ }
      if (isNoteDir) broadcastDir(dir)
      else broadcastAll() // dir deleted/renamed (or not a note dir) — full reload covers it
    }, 150))
  }

  if (process.platform === 'linux') {
    const dirWatchers = new Map<string, fs.FSWatcher>()
    const watchDir = (dir: string) => {
      if (dirWatchers.has(dir)) return
      try {
        const w = fs.watch(path.join(NOTES_DIR, dir), { persistent: false }, (_t, filename) => {
          handleEvent(filename ? `${dir}/${filename}` : dir)
        })
        w.on('error', () => {
          dirWatchers.delete(dir)
          try { w.close() } catch { /* ignore */ }
        })
        dirWatchers.set(dir, w)
      } catch { /* dir vanished between scan and watch */ }
    }
    const refreshDirWatchers = () => {
      const current = new Set(noteFormat.listNoteDirs(NOTES_DIR))
      for (const dir of current) watchDir(dir)
      for (const [dir, w] of dirWatchers) {
        if (!current.has(dir)) {
          try { w.close() } catch { /* ignore */ }
          dirWatchers.delete(dir)
        }
      }
    }
    refreshDirWatchers()
    fs.watch(NOTES_DIR, { persistent: false }, (_t, filename) => {
      // A root event usually means a note dir appeared/disappeared
      setTimeout(refreshDirWatchers, 200)
      handleEvent(filename ? filename.replace(/\\/g, '/') : null)
    })
  } else {
    fs.watch(NOTES_DIR, { recursive: true, persistent: false }, (_t, filename) => {
      handleEvent(filename ? filename.replace(/\\/g, '/') : null)
    })
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
    // (common on Linux when an input method or another app captures it).
    // Recorded in module state so a later language change keeps this variant.
    shortcutUnavailable = true
    tray?.setToolTip(getTrayMessages(currentTrayLang()).tooltipShortcutUnavailable)
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('fs:read-note-dir', (_event, dir: string) => {
  try {
    const safeDir = ensureSafeDirname(dir)
    return noteFormat.readNoteDirRecord(NOTES_DIR, safeDir)
  } catch {
    return null
  }
})

interface NoteWritePayload {
  dir: string
  files: Record<string, string>
  deleteFiles?: string[]
}

// Core note write — shared by the IPC handler and the agentic chat tools.
// `senderId` (the originating window) is excluded from the broadcast filter; pass undefined
// (e.g. for tool-driven writes) so every window — including the chat's — refreshes.
// `durablePush` lands the files on the remote NOW (awaited) instead of via the per-file
// debounced path — see the comment at the push step for why the chat tools need it.
function applyNoteWrite(payload: NoteWritePayload, senderId?: number, opts?: { durablePush?: boolean }): void | Promise<void> {
  const dir = ensureSafeDirname(payload.dir)
  const dirPath = path.join(NOTES_DIR, dir)

  // Validate everything before touching disk
  const writes = Object.entries(payload.files ?? {}).map(([f, content]) => {
    if (typeof content !== 'string') throw new Error('Invalid note file content')
    return [ensureSafeNoteFile(f), content] as const
  })
  const deletes = (payload.deleteFiles ?? []).map((f) => ensureSafeNoteFile(f))
  if (writes.length === 0) throw new Error('Empty note write')

  fs.mkdirSync(dirPath, { recursive: true })
  markInternalWrite(dir)
  for (const [f] of writes) markInternalWrite(`${dir}/${f}`)
  for (const f of deletes) markInternalWrite(`${dir}/${f}`)

  // note.md first so a crash mid-write always leaves a consistent anchor
  writes.sort(([a], [b]) => (a === noteFormat.NOTE_MD ? -1 : b === noteFormat.NOTE_MD ? 1 : 0))
  for (const [f, content] of writes) {
    fs.writeFileSync(path.join(dirPath, f), content, 'utf-8')
  }
  for (const f of deletes) {
    try { fs.unlinkSync(path.join(dirPath, f)) } catch { /* already gone */ }
  }

  // Single broadcast per note write — the renderer re-reads the whole dir
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('notes-updated', dirPath, senderId)
  })

  const sync = getActiveSyncProvider()
  const connected = sync.isConnected()
  for (const f of deletes) sync.scheduleDelete(`${dir}/${f}`)

  // Keep the semantic index up to date (debounced; no-op when AI is disabled).
  if (aiIndex.isEnabled()) aiIndex.scheduleIndex(dirPath)

  // Durable push (agentic chat tools): land the written files on the remote NOW
  // instead of via the per-file debounced path. The debounced path bumps
  // `lastSync` on each completion, so a freshly AI-created note that hasn't been
  // pushed yet would be seen as `updated <= lastSync` by a racing auto-sync pull
  // and DELETED from disk — the same failure the bulk-import path guards against
  // with pushPathsNow. (No-op while the push gate is closed; flushPendingLocalChanges
  // re-pushes after the first successful pull.)
  if (opts?.durablePush) {
    if (!connected) return Promise.resolve()
    const relPaths = writes.map(([f]) => `${dir}/${f}`)
    relPaths.forEach((p) => pendingPushFiles.add(p))
    notifyPushState()
    return sync
      .pushPathsNow(NOTES_DIR, relPaths)
      .then(() => undefined)
      .catch((err) => { console.error('[chat] durable push failed:', String(err)) })
      .finally(() => {
        relPaths.forEach((p) => pendingPushFiles.delete(p))
        notifyPushState()
      })
  }

  for (const [f, content] of writes) {
    const relPath = `${dir}/${f}`
    if (connected) {
      sync.schedulePush(relPath, content,
        () => { pendingPushFiles.add(relPath); notifyPushState() },
        () => { pendingPushFiles.delete(relPath); notifyPushState() }
      )
    } else {
      sync.schedulePush(relPath, content)
    }
  }
}

// Core note deletion — shared by the IPC handler and the agentic chat tools.
function applyNoteDelete(dirOrPath: string): void {
  const dir = ensureSafeDirname(dirOrPath)
  const dirPath = path.join(NOTES_DIR, dir)
  markInternalWrite(dir)
  try {
    for (const f of fs.readdirSync(dirPath)) markInternalWrite(`${dir}/${f}`)
  } catch { /* ignore */ }
  fs.rmSync(dirPath, { recursive: true, force: true })
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('notes-updated')
  })
  getActiveSyncProvider().scheduleDeleteDir(dir)
  aiIndex.removeFromIndex(dirPath)
}

ipcMain.handle('fs:write-note', (event, payload: NoteWritePayload) => {
  try {
    applyNoteWrite(payload, event.sender.id)
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('fs:delete-note', (_event, dirOrPath: string) => {
  try {
    applyNoteDelete(dirOrPath)
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('fs:read-all-notes', async () => {
  // Do NOT catch outer errors — let them propagate so the renderer can
  // distinguish a genuine empty directory from a transient FS failure.
  // On Windows, readdirSync can return [] without throwing when the filesystem
  // isn't ready yet (e.g. OS waking from sleep, app starting at boot).
  // Retry so we don't mistake a transient empty result for no notes.
  let dirs: string[] = []
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 800))
    dirs = noteFormat.listNoteDirs(NOTES_DIR)
    if (dirs.length > 0) break
  }
  return dirs
    .map((dir) => noteFormat.readNoteDirRecord(NOTES_DIR, dir))
    .filter((rec): rec is noteFormat.NoteDirRecord => rec !== null)
})

ipcMain.handle('fs:notes-dir', () => NOTES_DIR)

ipcMain.handle('app:open-notes-folder', () =>
  shell.openPath(NOTES_DIR).catch(err => console.error('Failed to open notes folder:', err))
)

ipcMain.handle('app:get-version', () => app.getVersion())

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
              // Match the package manager to the distro: pacman on Arch-based,
              // deb on Debian-based, AppImage as the universal fallback.
              const isArchBased = fs.existsSync('/etc/arch-release') ||
                                 fs.existsSync('/etc/cachyos-release') ||
                                 fs.existsSync('/usr/bin/pacman')
              const isDebBased = fs.existsSync('/etc/debian_version') ||
                                 fs.existsSync('/usr/bin/dpkg')
              if (isArchBased) {
                downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/noteflow-${latest}-x86_64.pkg.tar.zst`
              } else if (isDebBased) {
                downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/noteflow_${latest}_amd64.deb`
              } else {
                // Use AppImage as universal Linux format (works on all distros)
                downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-${latest}-x86_64.AppImage`
              }
            } else if (process.platform === 'darwin') {
              // macOS ships a single Apple Silicon (arm64) DMG.
              downloadUrl = `https://github.com/yagoid/noteflow/releases/latest/download/NoteFlow-${latest}-arm64.dmg`
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

ipcMain.handle('app:open-url', (_event, rawUrl: string) => {
  const parsed = parseHttpsUrl(rawUrl)
  if (!parsed) {
    console.warn('[Security] Blocked external URL:', rawUrl)
    return
  }
  shell.openExternal(parsed.toString()).catch((err) => {
    console.error('Failed to open external URL:', err)
  })
})

ipcMain.handle('app:download-and-install', async (_event, url: string) => {
  try {
    const initialUrl = parseHttpsUrl(url)
    if (!initialUrl || !isAllowedInitialUpdateUrl(initialUrl)) {
      throw new Error('Blocked update URL')
    }

    const response = await net.fetch(initialUrl.toString())
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    if (response.url) {
      const finalUrl = parseHttpsUrl(response.url)
      if (!finalUrl || !isAllowedRedirectUpdateUrl(finalUrl)) {
        throw new Error(`Blocked redirected update URL: ${response.url}`)
      }
    }

    const tmpDir = app.getPath('temp')
    const fileName = path.basename(initialUrl.pathname) || 'NoteFlow-update.exe'
    const dest = path.join(tmpDir, fileName)

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

    // Download done — signal the install phase so the UI can show "Installing…"
    // for the brief moment before the app quits/relaunches. (spawn below is
    // instantaneous on Windows, so we can't derive this from the 100% progress.)
    BrowserWindow.getAllWindows().forEach(w =>
      w.webContents.send('update:installing')
    )

    if (process.platform === 'linux') {
      // Detect package type from filename
      const isPacman = dest.endsWith('.pkg.tar.zst') || dest.endsWith('.pacman')
      const isDeb = dest.endsWith('.deb')

      if (isDeb) {
        await new Promise<void>((resolve) => {
          const proc = spawn('pkexec', ['dpkg', '-i', dest], { stdio: 'ignore' })
          proc.on('error', () => {
            // pkexec not available, fall back to xdg-open
            shell.openPath(dest)
            resolve()
          })
          proc.on('close', (code) => {
            if (code === 0) {
              app.relaunch()
              app.quit()
            }
            resolve()
          })
        })
      } else if (isPacman) {
        await new Promise<void>((resolve) => {
          const proc = spawn('pkexec', ['pacman', '-U', '--noconfirm', dest], { stdio: 'ignore' })
          proc.on('error', () => {
            // pkexec not available, fall back to xdg-open
            shell.openPath(dest)
            resolve()
          })
          proc.on('close', (code) => {
            if (code === 0) {
              app.relaunch()
              app.quit()
            }
            resolve()
          })
        })
      } else {
        // AppImage: replace the running AppImage in place and relaunch.
        // process.env.APPIMAGE holds the absolute path of the AppImage the user
        // launched (set by the AppImage runtime). No root needed: it lives in the
        // user's space.
        const appImagePath = process.env.APPIMAGE
        if (appImagePath) {
          try {
            const dir = path.dirname(appImagePath)
            const tmpTarget = path.join(dir, `.${path.basename(appImagePath)}.new`)
            // Copy into the target dir, then atomic rename. The rename leaves the
            // currently-running inode untouched (the FUSE mount keeps working) and
            // points the path at the new file — never overwrite the mounted file
            // in place, that would corrupt the running process.
            fs.copyFileSync(dest, tmpTarget)
            fs.chmodSync(tmpTarget, 0o755)
            fs.renameSync(tmpTarget, appImagePath)
            app.relaunch({ execPath: appImagePath })
            app.quit()
          } catch (err) {
            console.error('AppImage in-place update failed, opening file:', err)
            await shell.openPath(dest)
          }
        } else {
          // Not running from an AppImage (dev / unusual packaging) — just open it.
          await shell.openPath(dest)
        }
      }
    } else if (process.platform === 'darwin') {
      // macOS: the build is not notarized, so we can't use Squirrel.Mac for a
      // seamless in-place update. Open the downloaded DMG in Finder and let the
      // user drag NoteFlow to Applications, replacing the old copy. We keep the
      // app running so the user can read the instructions; they relaunch manually.
      await shell.openPath(dest)
      if (Notification.isSupported()) {
        const n = mainMessages().notifications
        new Notification({
          title: n.updateDownloadedTitle,
          body: n.updateDownloadedBody,
        }).show()
      }
    } else {
      // Windows: run the NSIS installer with --updated (NOT /S). This keeps the
      // installer's native progress window visible while skipping the "please close
      // the application" popup: electron-builder's app-running check auto-closes the
      // running instance (no MessageBox) when the --updated flag is set. --force-run
      // relaunches NoteFlow when done. We also app.quit() ourselves so the exit is
      // graceful and prompt — otherwise the installer would force-kill us after a
      // retry, since our window-close hides to tray instead of quitting. detached+unref
      // keep the installer alive after we exit. (per-user NSIS install → no UAC.)
      const installer = spawn(dest, ['--updated', '--force-run'], {
        detached: true,
        stdio: 'ignore',
      })
      installer.unref()
      setTimeout(() => app.quit(), 1000)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('app:choose-notes-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: mainMessages().dialogs.chooseNotesFolder,
  })
  return result.canceled ? null : result.filePaths[0]
})

// For 'md'/'txt' the entries are plain { filename, content } files; for
// '.noteflow'/'json' they are v2 folder bundles { dir, files } dumped as JSON.
ipcMain.handle('notes:export', async (_event, entries: Array<{ filename: string; content: string }> | Array<{ dir: string; files: Record<string, string> }>, format: string, hint?: string) => {
  try {
    const safeHint = hint
      ? hint.replace(/[^a-z0-9 ._-]/gi, '').trim().replace(/\s+/g, '-') || 'note'
      : null

    if (format === 'txt' || format === 'md') {
      const plain = entries as Array<{ filename: string; content: string }>
      if (plain.length === 1) {
        const defaultName = safeHint ? `${safeHint}.${format}` : plain[0].filename
        const result = await dialog.showSaveDialog(mainWindow!, {
          title: mainMessages().dialogs.exportNote,
          defaultPath: path.join(os.homedir(), defaultName),
          filters: [{ name: format === 'txt' ? 'Plain Text' : 'Markdown', extensions: [format] }],
        })
        if (result.canceled || !result.filePath) return { ok: false, canceled: true }
        fs.writeFileSync(result.filePath, plain[0].content, 'utf-8')
        return { ok: true, filePath: result.filePath }
      } else {
        const result = await dialog.showOpenDialog(mainWindow!, {
          title: mainMessages().dialogs.chooseDestinationFolder,
          properties: ['openDirectory'],
        })
        if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
        const dir = result.filePaths[0]
        for (const entry of plain) {
          fs.writeFileSync(path.join(dir, entry.filename), entry.content, 'utf-8')
        }
        return { ok: true, filePath: dir }
      }
    }

    // .noteflow (default)
    const dateStr = new Date().toISOString().slice(0, 10)
    const defaultNoteflowName = safeHint
      ? `${safeHint}.noteflow`
      : `noteflow-export-${dateStr}.noteflow`
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: mainMessages().dialogs.exportNotes,
      defaultPath: path.join(os.homedir(), defaultNoteflowName),
      filters: [
        { name: 'NoteFlow Export', extensions: ['noteflow'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true, error: 'Canceled' }
    }
    const exportFile = {
      version: 2,
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
      title: mainMessages().dialogs.importNotes,
      filters: [
        { name: 'All supported', extensions: ['noteflow', 'json', 'txt', 'md'] },
        { name: 'NoteFlow Export', extensions: ['noteflow', 'json'] },
        { name: 'Text / Markdown', extensions: ['txt', 'md'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true, error: 'Canceled' }
    }

    const filePath = result.filePaths[0]
    const ext = path.extname(filePath).toLowerCase().slice(1)

    if (ext === 'txt' || ext === 'md') {
      const textContent = fs.readFileSync(filePath, 'utf-8')
      const title = path.basename(filePath, path.extname(filePath))
      const id = randomBytes(4).toString('hex')
      const secId = randomBytes(3).toString('hex')
      const now = new Date().toISOString()
      const slug = title.replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'note'
      const { files } = noteFormat.serializeNoteFolder({
        id,
        title,
        tags: [],
        created: now,
        updated: now,
        sections: [{ id: secId, name: 'Note', content: textContent, isRawMode: true }],
      })
      return {
        ok: true,
        file: {
          version: 2,
          exported: now,
          app: 'noteflow',
          notes: [{ dir: `${slug}-${id}`, files }],
        },
      }
    }

    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.app !== 'noteflow' || !Array.isArray(parsed.notes)) {
      return { ok: false, error: 'Invalid .noteflow file format' }
    }
    if (parsed.version === 2) {
      return { ok: true, file: parsed }
    }
    if (parsed.version === 1) {
      // Old export: each entry is one flat .md with inline sections — convert
      // to a v2 folder bundle so the rest of the pipeline only sees v2.
      const notes: Array<{ dir: string; files: Record<string, string> }> = []
      for (const entry of parsed.notes as Array<{ filename?: string; content?: string }>) {
        if (typeof entry?.filename !== 'string' || typeof entry?.content !== 'string') continue
        const note = noteFormat.parseLegacyNoteRaw(entry.content)
        const dir = entry.filename.replace(/\.md$/i, '')
        const { files } = noteFormat.serializeNoteFolder(note, { preserveUpdated: true })
        notes.push({ dir, files })
      }
      return { ok: true, file: { version: 2, exported: String(parsed.exported ?? ''), app: 'noteflow', notes } }
    }
    return { ok: false, error: 'Unsupported .noteflow version' }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

// Import from other note apps. Main does IO only (unzip / walk dirs) and returns
// a normalized intermediate; the renderer converts HTML→md, resolves groups and
// serializes to the v2 folder format (see electron/importers/).
ipcMain.handle('notes:parse-external-import', async (_event, source: importers.ImportSource) => {
  try {
    let srcPath: string
    if (source === 'md-folder') {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: mainMessages().dialogs.chooseMarkdownFolder,
        properties: ['openDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
      srcPath = result.filePaths[0]
    } else {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: source === 'notion' ? mainMessages().dialogs.importNotion : mainMessages().dialogs.importGoogleKeep,
        filters: [{ name: 'Zip archive', extensions: ['zip'] }],
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
      srcPath = result.filePaths[0]
    }
    const parsed = importers.parseExternalSource(source, srcPath)
    return { ok: true, source: parsed.source, notes: parsed.notes }
  } catch (err: unknown) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('notes:write-imported', async (_event, entries: Array<{ dir: string; files: Record<string, string> }>) => {
  const written: string[] = []
  const errors: string[] = []
  const writtenPaths: string[] = []
  const sync = getActiveSyncProvider()
  const connected = sync.isConnected()
  for (const entry of entries) {
    try {
      const dir = ensureSafeDirname(entry.dir)
      const writes = Object.entries(entry.files ?? {}).map(([f, content]) => {
        if (typeof content !== 'string') throw new Error('Import content must be a string')
        return [ensureSafeNoteFile(f), content] as const
      })
      if (!writes.some(([f]) => f === noteFormat.NOTE_MD)) throw new Error('Imported note is missing note.md')
      const dirPath = path.join(NOTES_DIR, dir)
      fs.mkdirSync(dirPath, { recursive: true })
      markInternalWrite(dir)
      for (const [f, content] of writes) {
        markInternalWrite(`${dir}/${f}`)
        fs.writeFileSync(path.join(dirPath, f), content, 'utf-8')
        writtenPaths.push(`${dir}/${f}`)
      }
      written.push(dir)
    } catch (err) {
      errors.push(`${entry.dir}: ${String(err)}`)
    }
  }
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('notes-updated')
  })
  // Durably push the imported files NOW (awaited, batched) instead of relying on
  // per-file debounced pushes. The debounced path bumps lastSync on each
  // completion, so while a large import drains a racing auto-sync pull would see
  // the not-yet-pushed notes as stale and delete them. Landing them on the remote
  // up front prevents that.
  if (connected && writtenPaths.length > 0) {
    try {
      const res = await sync.pushPathsNow(NOTES_DIR, writtenPaths)
      if (res.errors.length > 0) errors.push(...res.errors.map((p) => `push failed: ${p}`))
    } catch (err) {
      errors.push(`push failed: ${String(err)}`)
    }
  }
  return { written, errors }
})

// ── GitHub Sync ───────────────────────────────────────────────────────────────

ipcMain.handle('sync:get-status', () => {
  return githubSync.getSyncStatus()
})

// Backend-tagged status of whichever sync provider is live (Cloud when enabled,
// else GitHub, else 'none') — drives the titlebar sync button. See syncProvider.ts.
ipcMain.handle('sync:get-active-status', () => {
  return getActiveSyncStatus()
})

ipcMain.handle('sync:initiate', async (_event, repo: string) => {
  return githubSync.initiateDeviceFlow(repo, NOTES_DIR, (result) => {
    BrowserWindow.getAllWindows().forEach((win) =>
      win.webContents.send('sync-auth-complete', result)
    )
    if (result.ok) {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
      startAutoSync()
      // Fresh connection: make sure the remote carries the v2 format marker
      // (and convert any v1 leftovers if connecting to an old notes repo).
      githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).then((didMigrate) => {
        if (didMigrate) {
          // Remote-only notes may have been imported locally — full reload
          BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
        }
      }).catch((err) => {
        console.error('[Sync] remote format migration failed:', String(err))
      })
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

// Manual GitHub pull + its broadcast (shared by sync:pull and sync:pull-active).
async function githubManualPull(): Promise<SyncPullResult> {
  const result = await githubSync.pullNotes(NOTES_DIR)
  indexPulledNotes(result)
  // Guarded no-op once the remote is already on format v2
  githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).then((didMigrate) => {
    if (didMigrate) {
      // Remote-only notes may have been imported locally — full reload
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
    }
  }).catch((err) => {
    console.error('[Sync] remote format migration failed:', String(err))
  })
  if (result.hadDeletions || result.hadMetadataChanges || result.pulled === 0) {
    // Full reload: covers deletions AND the case where the file was already on disk
    // (written by auto-sync) but the UI missed the event — manual sync should always
    // bring the store in sync with disk.
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  } else {
    for (const filePath of result.updatedFiles) {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', filePath, null))
    }
  }
  expireNotesAfterPull(result, 'github')
  return result
}

ipcMain.handle('sync:pull', async () => githubManualPull())

// Mirror local → repo: leaves the GitHub repo as an exact copy of what is on
// disk (uploads what differs, deletes what is gone). Offered ONLY while NoteFlow
// Cloud owns the sync loop — that is when GitHub is a paused write-only mirror
// and the repo rots. The Cloud gate lives here and not in githubSync.ts, which
// cannot import cloudSync.ts (that module imports it — it would be a cycle).
// Local notes are untouched, so no 'notes-updated' broadcast; the sync status
// (lastSync/error) does change, hence the usual status broadcast.
ipcMain.handle('sync:mirror-to-github', async () => {
  if (!cloudSync.isCloudSyncEnabled()) {
    return { ok: false, pushed: 0, deleted: 0, skipped: 0, errors: [], warnings: [], error: 'cloud-required' }
  }
  const result = await githubSync.mirrorToGitHub(NOTES_DIR)
  emitSyncStatusChanged()
  return result
})

// Routes the titlebar's manual pull to whichever backend is live: Cloud when
// enabled (they are mutually exclusive), GitHub otherwise. Same broadcast
// contract as sync:pull / cloud:pull so the store reloads either way.
ipcMain.handle('sync:pull-active', async () => {
  return cloudSync.isCloudSyncEnabled() ? cloudManualPull() : githubManualPull()
})

// ── NoteFlow account (Supabase Auth + entitlements) ───────────────────────────
// Session/tokens live in electron/account.ts (main-process only); the renderer
// exchanges exclusively the public status.

ipcMain.handle('account:get-status', () => {
  return account.getAccountStatus()
})

ipcMain.handle('account:request-otp', (_event, email: string) => {
  return account.requestOtp(email)
})

ipcMain.handle('account:verify-otp', (_event, email: string, code: string) => {
  return account.verifyOtp(email, code)
})

ipcMain.handle('account:sign-out', () => {
  return account.signOut()
})

ipcMain.handle('account:refresh-entitlements', () => {
  return account.refreshEntitlements()
})

// Opens the Lemon Squeezy checkout in the browser, tagged with the Supabase
// user id (checkout[custom][user_id], URL-encoded) so the billing webhook can
// attribute the purchase. Built here in main so the user id never crosses to
// the renderer.
ipcMain.handle('account:open-checkout', (_event, product: string): account.AccountOpResult => {
  const base = product === 'ai' || product === 'cloud' || product === 'bundle'
    ? LEMONSQUEEZY_CHECKOUT_URLS[product]
    : ''
  if (!base) return { ok: false, error: 'Checkout is not available yet.', errorCode: 'checkoutUnavailable' }
  const userId = account.getUserId()
  if (!userId) return { ok: false, error: 'Sign in to your NoteFlow account first.', errorCode: 'notSignedIn' }
  const sep = base.includes('?') ? '&' : '?'
  const url = parseHttpsUrl(`${base}${sep}checkout%5Bcustom%5D%5Buser_id%5D=${encodeURIComponent(userId)}`)
  if (!url) return { ok: false, error: 'Invalid checkout URL.', errorCode: 'checkoutInvalidUrl' }
  shell.openExternal(url.toString()).catch((err) => {
    console.error('Failed to open checkout URL:', err)
  })
  return { ok: true }
})

// ── NoteFlow Cloud (encrypted sync — phase 4.2) ───────────────────────────────
// Key material lives in electron/cloudKeys.ts (main-process memory only); the
// renderer exchanges exclusively the public CloudSyncStatus. These handlers
// are the complete main-side surface (UI: Settings → Sync → CloudPanel).

ipcMain.handle('cloud:get-status', () => {
  return cloudSync.getCloudSyncStatus()
})

// passphrase → generates DEK + recovery code, uploads user_keys, unlocks.
// E2EE (private) mode — opt-in. The recovery code is returned ONCE for display
// and never persisted.
ipcMain.handle('cloud:setup', async (_event, passphrase: string) => {
  const res = await cloudKeys.setupCloudKeys(passphrase)
  emitCloudStatusChanged()
  return res
})

// Managed (standard) mode — the default: the DEK is generated client-side and
// deposited in the cloud-keys Edge Function (wrapped by the operator key).
// Nothing to remember; the session ends up unlocked directly.
ipcMain.handle('cloud:setup-managed', async () => {
  const res = await cloudKeys.setupCloudKeysManaged()
  emitCloudStatusChanged()
  return res
})

// Upgrade managed → e2ee. Returns the new recovery code ONCE.
ipcMain.handle('cloud:upgrade-e2ee', async (_event, passphrase: string) => {
  const res = await cloudKeys.upgradeCloudKeysToE2ee(passphrase)
  emitCloudStatusChanged()
  return res
})

// Downgrade e2ee → managed (explicit, confirmed in the UI — never silent).
// The old passphrase and recovery code stop working after this.
ipcMain.handle('cloud:downgrade-managed', async () => {
  const res = await cloudKeys.downgradeCloudKeysToManaged()
  emitCloudStatusChanged()
  return res
})

// Silent managed unlock (no-op for e2ee/no-keys/unlocked). The Cloud panel
// polls this while it shows the "Unlocking…" state so an offline boot recovers
// as soon as the network is back.
ipcMain.handle('cloud:auto-unlock', async () => {
  const changed = await cloudKeys.autoUnlockManaged()
  if (changed) emitCloudStatusChanged()
  return { ok: true }
})

// passphrase or recovery code → unlocks the key session. Pending journaled
// pushes drain on the next autosync tick.
ipcMain.handle('cloud:unlock', async (_event, secret: string) => {
  const res = await cloudKeys.unlockCloudKeys(secret)
  emitCloudStatusChanged()
  return res
})

ipcMain.handle('cloud:lock', () => {
  cloudKeys.lockCloudKeys()
  emitCloudStatusChanged()
  return { ok: true }
})

// Enabling Cloud takes over from GitHub Sync (mutually exclusive — see
// syncProvider.ts): the GitHub autosync stands down and the cloud autosync
// (Realtime + safety-net loop) starts, kicking an initial pull (which flushes
// local changes after). Shared by the IPC below and the sign-in restore path
// (applyAccountTransition).
function enableCloudSyncWithInitialPull(): { ok: boolean; error?: string } {
  const res = cloudSync.enableCloudSync()
  if (res.ok) {
    startCloudAutoSync()
    cloudSync
      .pullNotes(NOTES_DIR)
      .then((result) => {
        broadcastPullResult(result, 'cloud')
        emitCloudStatusChanged()
      })
      .catch((err) => console.error('[Cloud] initial pull failed:', String(err)))
  }
  return res
}

ipcMain.handle('cloud:enable', () => {
  const res = enableCloudSyncWithInitialPull()
  dropRestoreSurface('cloud')
  emitCloudStatusChanged()
  return res
})

ipcMain.handle('cloud:disable', () => {
  const res = cloudSync.disableCloudSync()
  stopCloudAutoSync()
  dropRestoreSurface('cloud')
  emitCloudStatusChanged()
  return res
})

// Manual Cloud pull + its broadcast (shared by cloud:pull and sync:pull-active).
async function cloudManualPull(): Promise<SyncPullResult> {
  const result = await cloudSync.pullNotes(NOTES_DIR)
  indexPulledNotes(result)
  if (result.hadDeletions || result.hadMetadataChanges || result.pulled === 0) {
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
  } else {
    for (const filePath of result.updatedFiles) {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated', filePath, null))
    }
  }
  emitCloudStatusChanged()
  expireNotesAfterPull(result, 'cloud')
  return result
}

// Manual pull (same broadcast contract as sync:pull).
ipcMain.handle('cloud:pull', async () => cloudManualPull())

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

// ── AI / Semantic index ───────────────────────────────────────────────────────

function readAiSettings(): aiIndex.AiSettings {
  const raw = (readSettings().ai ?? {}) as Partial<aiIndex.AiSettings>
  return { ...aiIndex.DEFAULT_AI_SETTINGS, ...raw }
}

function writeAiSettings(next: aiIndex.AiSettings): void {
  const settings = readSettings()
  settings.ai = next
  writeSettings(settings)
}

function emitAiState(state: string): void {
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:index-state', state))
}

function emitAiProgress(progress: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:reindex-progress', progress))
}

function emitAiStale(info: aiIndex.StaleInfo): void {
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('ai:index-stale', info))
}

ipcMain.handle('ai:get-settings', () => readAiSettings())

ipcMain.handle('ai:set-settings', async (_event, patch: Partial<aiIndex.AiSettings>) => {
  const prev = readAiSettings()
  const next = { ...prev, ...patch }
  try {
    await aiIndex.applySettings(next)
    writeAiSettings(next) // persist only once activation/teardown actually succeeded
    return next
  } catch (err) {
    // Activation failed (e.g. model download/load error). Roll the in-memory settings back so a
    // retry re-triggers activation instead of silently no-op'ing (a persisted enabled:true would
    // make applySettings skip the load+reindex). Surface the error to the renderer.
    aiIndex.primeSettings(prev)
    throw err
  }
})

ipcMain.handle('ai:related', (_event, noteId: string, sectionId: string, k?: number) => aiIndex.related(noteId, sectionId, k))
ipcMain.handle('ai:search', (_event, query: string, k?: number) => aiIndex.search(query, k))
ipcMain.handle('ai:graph', () => aiIndex.graph())
ipcMain.handle('ai:reindex-all', () => aiIndex.reindexAll())
ipcMain.handle('ai:get-stale', () => aiIndex.getStale())

// ── LLM provider (chat / second brain) ─────────────────────────────────────────
// The provider runs here in main; the API key lives encrypted in settings.aiLlm and never
// reaches the renderer. RAG retrieval reuses the local index (aiIndex.search/graph).

function readLlmSettings(): llm.LlmConfigStored {
  const raw = (readSettings().aiLlm ?? {}) as Partial<llm.LlmConfigStored>
  return { ...llm.DEFAULT_LLM_CONFIG, ...raw }
}

function writeLlmSettings(next: llm.LlmConfigStored): void {
  const settings = readSettings()
  settings.aiLlm = next
  writeSettings(settings)
}

ipcMain.handle('ai:llm-get-config', () => llm.toPublic(readLlmSettings()))

ipcMain.handle('ai:llm-presets', () => llm.PRESETS)

ipcMain.handle('ai:llm-set-config', (_event, patch: {
  active?: string; model?: string; baseUrl?: string; apiKey?: string; clearKey?: boolean
}) => {
  let cfg = readLlmSettings()
  cfg.byPreset = { ...cfg.byPreset }
  // withActiveProvider remembers the BYO provider being left behind when the
  // managed plan takes over — a later sign-out reverts to it. Picking a provider
  // by hand is also an explicit decision that overrules a pending restore.
  if (patch.active !== undefined) {
    cfg = llm.withActiveProvider(cfg, patch.active)
    dropRestoreSurface('ai')
  }
  // All field edits apply to the ACTIVE preset, so each provider keeps its own key/model/baseUrl.
  const id = cfg.active
  const ps = { ...(cfg.byPreset[id] ?? {}) }
  // A model outside a curated catalog (managed plan) is dropped, not stored: the renderer
  // already offers those presets a read-only field, and persisting one would make the saved
  // config diverge from the model actually used (see llm.acceptsModel).
  if (patch.model !== undefined && llm.acceptsModel(id, patch.model)) ps.model = patch.model
  if (patch.baseUrl !== undefined) ps.baseUrl = patch.baseUrl
  if (patch.clearKey) ps.encryptedApiKey = undefined
  else if (typeof patch.apiKey === 'string' && patch.apiKey.length > 0) ps.encryptedApiKey = llm.encryptSecret(patch.apiKey)
  cfg.byPreset[id] = ps
  writeLlmSettings(cfg)
  return llm.toPublic(cfg)
})

ipcMain.handle('ai:llm-list-models', async () => {
  try {
    const models = await llm.getProvider(await llm.resolveConfigAsync(readLlmSettings())).listModels()
    return { ok: true, models }
  } catch (err) {
    return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('ai:llm-test', async () => {
  try {
    // resolveConfigAsync throws for the NoteFlow AI preset without a signed-in
    // session — surface that through the same {ok, error} contract as test().
    return await llm.getProvider(await llm.resolveConfigAsync(readLlmSettings())).test()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// Monthly consumption of the managed NoteFlow AI plan (weighted quota tokens),
// read from the proxy's GET /usage endpoint with a fresh access token. Returns
// null on ANY failure (no session, offline, non-200) — the UI simply hides the
// usage bar, it never surfaces an error for this.
ipcMain.handle('ai:llm-usage', async (): Promise<{ used: number; limit: number } | null> => {
  try {
    const token = await account.getAccessToken()
    if (!token) return null
    const res = await fetch(`${AI_PROXY_URL}/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as { used?: unknown; limit?: unknown } | null
    if (!body || typeof body.used !== 'number' || typeof body.limit !== 'number') return null
    return { used: body.used, limit: body.limit }
  } catch {
    return null
  }
})

// ── Chat (streaming over IPC events) ───────────────────────────────────────────

const CHAT_SYSTEM_BASE =
  "You are NoteFlow's assistant — a second brain over the user's personal notes. " +
  "Answer directly and concisely, in the same language the user writes in. " +
  'When context from the notes is provided, ground your answer in it and avoid inventing facts; ' +
  "if the notes don't contain the answer, say so plainly.\n\n" +
  'You can also ACT on the notes through the provided tools (create/edit/organize/delete notes, ' +
  'sections, groups and folders). Only act when the user clearly asks you to; otherwise just answer. ' +
  'Never invent ids — call list_notes / list_groups (or search_notes) first to discover the real ids ' +
  'you need. Ids are stable and never change, so if a tool reports a note/section as not found, the id ' +
  'is stale or mistyped: do not retry it verbatim — re-run list_notes and use the freshly returned id. ' +
  'When acting on several notes, fetch their ids right before you act on them (especially after creating, ' +
  'moving or renaming anything) and copy each id exactly. After acting, briefly tell the user what you did. ' +
  'Deletions require user confirmation, which the app handles automatically.\n\n' +
  "When the context includes the user's profile or personality notes (including any \"soft signals\" / " +
  'raw favourites), use them only as BACKGROUND to tailor your tone and suggestions. Never cite where ' +
  'a preference comes from or name-drop the user\'s favourite song/film/book in an unrelated answer ' +
  '(do not say "since you like X…"). Make recommendations directly.\n\n' +
  'NEXT-ACTION SUGGESTIONS. At the very end of your FINAL answer (never in an intermediate turn that ' +
  'still calls tools), if there are genuinely useful follow-ups, append the literal marker ' +
  '"<!--SUGGESTIONS-->" on its own line, then 1 or 2 short, actionable next things the user might want ' +
  'to ask, one per line prefixed with "- ". Phrase each as a brief imperative from the USER\'s point of ' +
  'view, in the same language as your answer. Keep each suggestion VERY short so it fits on a small button: ' +
  'aim for 2-5 words, 6 words maximum, no trailing period (e.g. "- Reorganize into sections", "- Add a ' +
  'summary"). Keep them concrete and grounded in this conversation. If nothing useful applies, omit the ' +
  'marker entirely. Never mention the marker or these suggestions in the visible part of your answer.'

const chatAborts = new Map<string, AbortController>()

function stripBase64(text: string): string {
  return text.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[image]')
}

function findNoteDirPath(noteId: string, dirs: string[]): string | null {
  const match = dirs.find((d) => d.endsWith('-' + noteId))
  return match ? path.join(NOTES_DIR, match) : null
}

interface ChatSource { noteId: string; sectionId: string; title: string }

/** Load the user's "second brain" profile note as a background block for the chat system prompt.
 *  Unlike RAG context this is injected on EVERY question (regardless of semantic relevance) so the
 *  assistant always knows the user's tone/style/criteria. Read straight from disk by its stable id
 *  (settings.aiProfile.noteId), so it does not depend on the embeddings index being enabled.
 *  Returns null when there is no profile, it is missing or it is encrypted. Never produces a
 *  `source`: the profile is invisible background, must not be cited or illuminated in the brain. */
function buildProfileBlock(dirs: string[]): { block: string; noteId: string } | null {
  const profile = (readSettings().aiProfile ?? {}) as { completedAt?: string; noteId?: string }
  const noteId = profile.noteId
  if (!noteId) return null
  const dirPath = findNoteDirPath(noteId, dirs)
  if (!dirPath) return null
  const note = noteFormat.parseNoteDir(dirPath)
  if (!note || note.encryption || note.sections.length === 0) return null
  // Same defence-in-depth as pushSection: AI-hidden sections never feed the chat context.
  const visible = note.sections.filter((s) => !s.aiHidden)
  if (visible.length === 0) return null
  // The profile is a short, abstract note, so include ALL visible sections (each with its name),
  // capping per-section content like the RAG blocks (1500 chars) to keep token use bounded.
  const parts: string[] = []
  for (const section of visible) {
    const text = stripBase64(section.content).trim().slice(0, 1500)
    if (text) parts.push(`### ${section.name}\n${text}`)
  }
  if (parts.length === 0) return null
  return { block: parts.join('\n\n'), noteId }
}

/** Append the profile background (if any) to a system prompt. */
function withProfile(system: string, profile: { block: string; noteId: string } | null): string {
  if (!profile) return system
  return `${system}\n\nUser profile (background — tone & preferences, do not cite):\n\n${profile.block}`
}

/** Build the RAG context for a question. Returns the augmented system prompt + the source notes
 *  (for citation + brain illumination). The user's profile note is always injected as background
 *  (even when Local AI is off or nothing matches); RAG context is added on top when available. */
async function buildChatContext(query: string): Promise<{ system: string; sources: ChatSource[] }> {
  const profileDirs = noteFormat.listNoteDirs(NOTES_DIR)
  const profile = buildProfileBlock(profileDirs)

  if (!query.trim() || !aiIndex.isEnabled()) return { system: withProfile(CHAT_SYSTEM_BASE, profile), sources: [] }

  let hits: Awaited<ReturnType<typeof aiIndex.search>> = []
  try { hits = await aiIndex.search(query, 6) } catch { hits = [] }
  if (hits.length === 0) return { system: withProfile(CHAT_SYSTEM_BASE, profile), sources: [] }

  // Expand with up to a few content-edge neighbours of the matched notes.
  const hitNoteIds = new Set(hits.map((h) => h.noteId))
  const neighbours = new Set<string>()
  try {
    for (const e of await aiIndex.graph()) {
      if (hitNoteIds.has(e.a) && !hitNoteIds.has(e.b)) neighbours.add(e.b)
      if (hitNoteIds.has(e.b) && !hitNoteIds.has(e.a)) neighbours.add(e.a)
    }
  } catch { /* edges are best-effort */ }

  const dirs = profileDirs
  const sources: ChatSource[] = []
  const blocks: string[] = []
  const seen = new Set<string>() // noteId:sectionId

  const pushSection = (noteId: string, preferredSectionId?: string) => {
    // The profile note is injected whole as background above; skip it in RAG to avoid duplicate
    // content and to keep it out of the cited `sources`.
    if (profile && noteId === profile.noteId) return
    const dirPath = findNoteDirPath(noteId, dirs)
    if (!dirPath) return
    const note = noteFormat.parseNoteDir(dirPath)
    if (!note || note.encryption || note.sections.length === 0) return
    // Sections hidden from the AI never feed the chat context (defence in depth: hidden
    // sections are already kept out of the index, but a neighbour fallback could reach one).
    const visible = note.sections.filter((s) => !s.aiHidden)
    if (visible.length === 0) return
    const section = visible.find((s) => s.id === preferredSectionId) ?? visible[0]
    const key = `${noteId}:${section.id}`
    if (seen.has(key)) return
    seen.add(key)
    const text = stripBase64(section.content).trim().slice(0, 1500)
    if (!text) return
    blocks.push(`### ${note.title || 'Untitled'} › ${section.name}\n${text}`)
    sources.push({ noteId, sectionId: section.id, title: note.title || 'Untitled' })
  }

  for (const h of hits) pushSection(h.noteId, h.sectionId)
  for (const id of [...neighbours].slice(0, 3)) pushSection(id)

  if (blocks.length === 0) return { system: withProfile(CHAT_SYSTEM_BASE, profile), sources: [] }
  const ragSystem = `${CHAT_SYSTEM_BASE}\n\nContext from the user's notes:\n\n${blocks.join('\n\n---\n\n')}`
  return { system: withProfile(ragSystem, profile), sources }
}

// Pending destructive-tool confirmations, keyed by toolCallId — resolved by `ai:chat-confirm`.
const chatConfirms = new Map<string, (approved: boolean) => void>()

function readJsonArray(file: string): unknown[] {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

/** Wire the agentic tool executor to main's write primitives. Tool writes pass no senderId,
 *  so every window (including the chat's) refreshes from the broadcast. */
function buildToolContext(): agentTools.ToolContext {
  return {
    notesDir: NOTES_DIR,
    writeNote: (payload) => applyNoteWrite(payload, undefined, { durablePush: true }),
    deleteNoteDir: (dir) => applyNoteDelete(dir),
    readGroups: () => readJsonArray(GROUPS_FILE) as ReturnType<agentTools.ToolContext['readGroups']>,
    writeGroups: (groups) => applyGroupsSet(groups, undefined, { durablePush: true }),
    readFolders: () => readJsonArray(FOLDERS_FILE) as ReturnType<agentTools.ToolContext['readFolders']>,
    writeFolders: (folders) => applyFoldersSet(folders, undefined, { durablePush: true }),
    search: aiIndex.isEnabled() ? (q, k) => aiIndex.search(q, k) : undefined,
  }
}

const MAX_AGENT_STEPS = 12

type ChatWireMessage = { role: 'system' | 'user' | 'assistant'; content: string; attachmentIds?: string[] }

ipcMain.handle('ai:chat', async (event, req: { requestId: string; messages: ChatWireMessage[] }) => {
  const { requestId, messages } = req
  const sender = event.sender
  const send = (channel: string, payload: unknown) => { if (!sender.isDestroyed()) sender.send(channel, payload) }

  const stored = readLlmSettings()
  const pub = llm.toPublic(stored)
  if (!pub.configured) {
    send('ai:chat-error', { requestId, error: llm.notConfiguredMessage(stored) })
    return
  }
  const caps = pub.capabilities

  const controller = new AbortController()
  chatAborts.set(requestId, controller)
  const myConfirmIds = new Set<string>()
  let sentImages = false // tracked here so the catch can tailor the error message
  try {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const { system, sources } = await buildChatContext(lastUser)
    if (sources.length > 0) send('ai:chat-sources', { requestId, sources })

    const provider = llm.getProvider(await llm.resolveConfigAsync(stored))
    const ctx = buildToolContext()

    // Seed the agentic conversation from the renderer's messages, resolving each user message's
    // attachment ids from the in-main cache: text/code files inline into the text, pdf/image go native.
    const convo: llm.AgentMessage[] = []
    for (const m of messages) {
      if (m.role === 'system') continue
      if (m.role === 'assistant') { convo.push({ role: 'assistant', content: m.content }); continue }
      let content = m.content
      const attachments: llm.Attachment[] = []
      for (const id of m.attachmentIds ?? []) {
        const f = chatFiles.get(id)
        if (!f) continue
        if (f.kind === 'text' && f.text) content += `\n\n## File: ${f.name}\n${f.text}`
        else if (f.data && ((f.kind === 'pdf' && caps.pdf) || (f.kind === 'image' && caps.images))) {
          attachments.push({ kind: f.kind, mediaType: f.mediaType, data: f.data })
          if (f.kind === 'image') sentImages = true
        }
      }
      convo.push(attachments.length ? { role: 'user', content, attachments } : { role: 'user', content })
    }

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const { text, toolCalls } = await provider.streamTurn(
        { system, messages: convo, tools: agentTools.TOOLS, signal: controller.signal },
        (delta) => send('ai:chat-delta', { requestId, delta }),
      )
      if (toolCalls.length === 0) { send('ai:chat-done', { requestId }); return }

      convo.push({ role: 'assistant', content: text, toolCalls })
      const results: llm.ToolResult[] = []
      for (const call of toolCalls) {
        send('ai:chat-tool-call', { requestId, toolCallId: call.id, name: call.name, input: call.input, label: agentTools.describeAction(call.name, call.input, ctx) })

        if (agentTools.DESTRUCTIVE_TOOLS.has(call.name)) {
          const target = agentTools.describeTarget(call.name, call.input, ctx)
          send('ai:chat-confirm-request', { requestId, toolCallId: call.id, name: call.name, input: call.input, target })
          myConfirmIds.add(call.id)
          const approved = await new Promise<boolean>((resolve) => {
            if (controller.signal.aborted) return resolve(false)
            chatConfirms.set(call.id, resolve)
            controller.signal.addEventListener('abort', () => resolve(false), { once: true })
          })
          chatConfirms.delete(call.id)
          if (!approved) {
            send('ai:chat-tool-result', { requestId, toolCallId: call.id, status: 'cancelled', summary: 'Cancelled' })
            results.push({ toolCallId: call.id, content: 'The user declined this action. Do not retry it.' })
            continue
          }
        }

        const result = await agentTools.executeTool(call.name, call.input, ctx)
        send('ai:chat-tool-result', {
          requestId, toolCallId: call.id, status: result.isError ? 'error' : 'done', summary: result.summary,
        })
        results.push({ toolCallId: call.id, content: result.content, isError: result.isError })
      }
      convo.push({ role: 'tool', results })
    }
    // Step budget exhausted — stop gracefully.
    send('ai:chat-done', { requestId })
  } catch (err) {
    if (controller.signal.aborted) send('ai:chat-done', { requestId, aborted: true })
    else send('ai:chat-error', { requestId, error: friendlyChatError(err instanceof Error ? err.message : String(err), sentImages) })
  } finally {
    for (const id of myConfirmIds) chatConfirms.delete(id)
    chatAborts.delete(requestId)
  }
})

// Turn a raw provider error into something actionable. The common BYO failure is attaching an image
// to a text-only model (e.g. DeepSeek answers HTTP 400 with `unknown variant image_url`); detect that
// and explain it instead of dumping the raw JSON. Everything else passes through unchanged.
function friendlyChatError(raw: string, sentImages: boolean): string {
  // NoteFlow AI monthly quota: the proxy answers 429 with the stable machine code
  // `monthly_quota_exceeded` in its OpenAI-shaped body — match on that (not the HTTP
  // status or the English message) and surface a clean, localized message instead of
  // the raw `HTTP 429 — {json}` string.
  if (raw.includes('monthly_quota_exceeded')) {
    return mainMessages().chatErrors.quotaExceeded
  }
  if (sentImages) {
    const low = raw.toLowerCase()
    if (
      low.includes('image_url') || low.includes('unknown variant') ||
      (low.includes('400') && (low.includes('image') || low.includes('multimodal') || low.includes('vision')))
    ) {
      return "This model can't read images. Pick a vision-capable model, or remove the image and ask in text."
    }
  }
  return raw
}

ipcMain.on('ai:chat-cancel', (_event, requestId: string) => {
  chatAborts.get(requestId)?.abort()
})

ipcMain.on('ai:chat-confirm', (_event, payload: { toolCallId: string; approved: boolean }) => {
  const resolve = chatConfirms.get(payload?.toolCallId)
  if (resolve) { chatConfirms.delete(payload.toolCallId); resolve(!!payload.approved) }
})

// ── Chat history (userData/ai-chats.json — local, not synced to GitHub) ─────────
function aiChatsPath(): string {
  return path.join(app.getPath('userData'), 'ai-chats.json')
}

ipcMain.handle('ai:chats-load', () => {
  try {
    const data = JSON.parse(fs.readFileSync(aiChatsPath(), 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
})

ipcMain.handle('ai:chats-save', (_event, sessions: unknown) => {
  try {
    fs.writeFileSync(aiChatsPath(), JSON.stringify(Array.isArray(sessions) ? sessions : []), 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── Second-brain profile ───────────────────────────────────────────────────────

// ── Second-brain profile: attachment cache + link fetch ──────────────────────
// File bytes stay in main and never cross to the renderer; the wizard only holds metadata
// (id/name/kind/size). PDFs and images are forwarded to the model NATIVELY (the app never
// extracts text itself); .txt/.md are inlined as plain text.
interface ProfileFile {
  id: string
  name: string
  kind: 'pdf' | 'image' | 'text'
  mediaType: string
  data?: string // base64 (pdf/image)
  text?: string // inlined (txt/md)
  sizeBytes: number
}
const profileFiles = new Map<string, ProfileFile>()
// Chat attachments live in their own cache so they aren't consumed by profile generation.
// Bytes stay in main (never cross to the renderer) and persist for the app session so follow-up
// questions about the same image/PDF keep working across turns.
const chatFiles = new Map<string, ProfileFile>()
const PROFILE_FILE_MAX_BYTES = 10 * 1024 * 1024
const PROFILE_FILES_TOTAL_MAX_BYTES = 20 * 1024 * 1024
const PROFILE_IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
}

// Plain-text & code files we can safely inline verbatim (no parsing/extraction needed). Extension
// list kept broad on purpose: anything whose bytes ARE the text. Binary/structured formats that
// need decoding (docx, xlsx, images, pdf) are NOT here. Used by both the picker filter and classify.
const TEXT_EXTS = [
  'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'log', 'csv', 'tsv', 'tex', 'bib', 'rtf',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'pyw', 'rb', 'go', 'rs', 'java', 'kt', 'kts',
  'scala', 'swift', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'php', 'pl', 'pm', 'lua',
  'r', 'dart', 'ex', 'exs', 'erl', 'hrl', 'clj', 'cljs', 'hs', 'ml', 'mli', 'fs', 'fsx', 'vb',
  'groovy', 'gradle', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'gql',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro',
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties',
  'xml', 'csproj', 'gitignore', 'dockerignore', 'editorconfig', 'diff', 'patch',
]
const TEXT_EXT_SET = new Set(TEXT_EXTS)

function classifyProfileFile(filePath: string): { kind: ProfileFile['kind']; mediaType: string } | null {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') return { kind: 'pdf', mediaType: 'application/pdf' }
  if (PROFILE_IMAGE_TYPES[ext]) return { kind: 'image', mediaType: PROFILE_IMAGE_TYPES[ext] }
  if (TEXT_EXT_SET.has(ext.replace(/^\./, ''))) return { kind: 'text', mediaType: 'text/plain' }
  return null
}

function cacheTotalBytes(cache: Map<string, ProfileFile>): number {
  let n = 0
  for (const f of cache.values()) n += f.sizeBytes
  return n
}

// Open a file picker scoped to what the ACTIVE provider can read natively, read the chosen files
// into the given in-main cache, and return only metadata. .txt/.md are inlined; pdf/image kept as base64.
async function pickFilesIntoCache(cache: Map<string, ProfileFile>, title: string) {
  const caps = llm.toPublic(readLlmSettings()).capabilities
  const exts = [...TEXT_EXTS]
  if (caps.images) exts.push('png', 'jpg', 'jpeg', 'gif', 'webp')
  if (caps.pdf) exts.push('pdf')
  const result = await dialog.showOpenDialog(mainWindow!, {
    title,
    filters: [{ name: 'Supported files', extensions: exts }],
    properties: ['openFile', 'multiSelections'],
  })
  if (result.canceled || result.filePaths.length === 0) return { ok: false as const, canceled: true }
  const added: Array<{ id: string; name: string; kind: ProfileFile['kind']; sizeBytes: number }> = []
  const errors: string[] = []
  let total = cacheTotalBytes(cache)
  for (const fp of result.filePaths) {
    const name = path.basename(fp)
    const cls = classifyProfileFile(fp)
    if (!cls) { errors.push(`${name}: unsupported type`); continue }
    if ((cls.kind === 'pdf' && !caps.pdf) || (cls.kind === 'image' && !caps.images)) {
      errors.push(`${name}: not supported by this provider`); continue
    }
    let size = 0
    try { size = fs.statSync(fp).size } catch { errors.push(`${name}: cannot read`); continue }
    if (size > PROFILE_FILE_MAX_BYTES) { errors.push(`${name}: too large (max 10 MB)`); continue }
    if (total + size > PROFILE_FILES_TOTAL_MAX_BYTES) { errors.push(`${name}: total size limit reached`); continue }
    try {
      const buf = fs.readFileSync(fp)
      const id = randomBytes(6).toString('hex')
      const entry: ProfileFile = cls.kind === 'text'
        ? { id, name, kind: 'text', mediaType: cls.mediaType, text: buf.toString('utf-8').slice(0, 20000), sizeBytes: size }
        : { id, name, kind: cls.kind, mediaType: cls.mediaType, data: buf.toString('base64'), sizeBytes: size }
      cache.set(id, entry)
      total += size
      added.push({ id, name, kind: cls.kind, sizeBytes: size })
    } catch { errors.push(`${name}: cannot read`) }
  }
  return { ok: true as const, files: added, errors }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

/** Download a page and reduce it to readable text. https only; bounded time + size. */
function fetchReadableText(rawUrl: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const url = parseHttpsUrl(rawUrl)
  if (!url) return Promise.resolve({ ok: false, error: 'Only https URLs are allowed' })

  // NOTE: deliberately net.request (not net.fetch). net.fetch wraps the response in an
  // undici Response, whose constructor throws RangeError for any status outside 200-599
  // (e.g. LinkedIn's anti-bot 999). That throw happens inside the ClientRequest 'response'
  // handler, escaping any try/catch, and crashes the whole main process. net.request exposes
  // statusCode as a plain number, so a weird status is just handled as an error here.
  return new Promise((resolve) => {
    const MAX_HTML = 1_500_000
    let settled = false
    const finish = (result: { ok: boolean; text?: string; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const request = net.request({ url: url.toString(), redirect: 'follow' })
    request.setHeader('user-agent', 'Mozilla/5.0 (compatible; NoteFlow profile reader)')

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'request timed out' })
      try { request.abort() } catch { /* ignore */ }
    }, 8000)

    request.on('response', (response) => {
      const status = response.statusCode
      if (status < 200 || status >= 300) {
        finish({ ok: false, error: `HTTP ${status}` })
        try { request.abort() } catch { /* ignore */ }
        return
      }
      const ctypeHeader = response.headers['content-type']
      const ctype = (Array.isArray(ctypeHeader) ? ctypeHeader[0] : ctypeHeader ?? '').toLowerCase()
      if (!ctype.includes('text/html') && !ctype.includes('text/plain') && !ctype.includes('xhtml')) {
        finish({ ok: false, error: `unsupported content type${ctype ? ` (${ctype.split(';')[0]})` : ''}` })
        try { request.abort() } catch { /* ignore */ }
        return
      }
      const decoder = new TextDecoder()
      let html = ''
      response.on('data', (chunk: Buffer) => {
        if (html.length >= MAX_HTML) return
        html += decoder.decode(chunk, { stream: true })
        if (html.length >= MAX_HTML) {
          try { request.abort() } catch { /* ignore */ }
        }
      })
      response.on('end', () => {
        const text = htmlToText(html).slice(0, 6000)
        finish(text ? { ok: true, text } : { ok: false, error: 'no readable text found' })
      })
      response.on('error', (err: Error) => finish({ ok: false, error: err.message }))
    })

    request.on('error', (err) => finish({ ok: false, error: err instanceof Error ? err.message : String(err) }))
    request.end()
  })
}

function validateProfileShape(obj: { title?: unknown; sections?: unknown }): { title: string; sections: Array<{ name: string; content: string }> } | null {
  if (typeof obj.title !== 'string' || !Array.isArray(obj.sections)) return null
  const sections = obj.sections
    .filter((s): s is { name: string; content: string } =>
      !!s && typeof (s as { name?: unknown }).name === 'string' && typeof (s as { content?: unknown }).content === 'string')
  if (sections.length === 0) return null
  return { title: obj.title, sections }
}

function extractJson(text: string): { title: string; sections: Array<{ name: string; content: string }> } | null {
  // Try a few candidate strings, most-specific first, so prose or markdown fences around
  // the JSON don't cause a parse failure (which previously meant the whole generation was lost).
  const candidates: string[] = []
  const trimmed = text.trim()
  candidates.push(trimmed)
  // ```json ... ``` (or plain ``` ... ```) fenced block
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) candidates.push(fence[1].trim())
  // First "{" to last "}" — tolerant of leading/trailing prose
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))

  for (const c of candidates) {
    try {
      const valid = validateProfileShape(JSON.parse(c) as { title?: unknown; sections?: unknown })
      if (valid) return valid
    } catch {
      // try the next candidate
    }
  }
  return null
}

ipcMain.handle('ai:profile-pick-files', () => pickFilesIntoCache(profileFiles, mainMessages().dialogs.addFilesToProfile))

ipcMain.handle('ai:profile-remove-file', (_event, id: string) => {
  profileFiles.delete(id)
  return { ok: true }
})

// Chat attachments: same picker, but into the chat cache (kept across turns, not consumed).
ipcMain.handle('ai:chat-pick-files', () => pickFilesIntoCache(chatFiles, mainMessages().dialogs.attachFilesToChat))

ipcMain.handle('ai:chat-remove-file', (_event, id: string) => {
  chatFiles.delete(id)
  return { ok: true }
})

ipcMain.handle('ai:profile-generate', async (_event, req: { fields?: Array<{ label: string; value: string; section?: string }>; fileIds?: string[]; urls?: string[]; locale?: string }) => {
  const stored = readLlmSettings()
  if (!llm.toPublic(stored).configured) return { ok: false, error: llm.notConfiguredMessage(stored) }
  let provider: llm.LlmProvider
  try {
    provider = llm.getProvider(await llm.resolveConfigAsync(stored))
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  const locale = req.locale?.trim() || 'the language the user used'

  const parts: string[] = []
  const fields = (req.fields ?? []).filter((f) => f.value?.trim())
  if (fields.length) {
    parts.push('# Form answers')
    // Group answers under their section header so the model can weigh them in context.
    const bySection = new Map<string, Array<{ label: string; value: string }>>()
    for (const f of fields) {
      const sec = f.section?.trim() || 'Other'
      if (!bySection.has(sec)) bySection.set(sec, [])
      bySection.get(sec)!.push({ label: f.label, value: f.value.trim() })
    }
    for (const [sec, items] of bySection) {
      parts.push(`## ${sec}`)
      for (const it of items) parts.push(`- ${it.label}: ${it.value}`)
    }
  }

  // Inline text files; collect pdf/image as native attachments.
  const attachments: llm.Attachment[] = []
  const attachedNames: string[] = []
  for (const id of req.fileIds ?? []) {
    const f = profileFiles.get(id)
    if (!f) continue
    if (f.kind === 'text' && f.text) parts.push(`## File: ${f.name}\n${f.text}`)
    else if ((f.kind === 'pdf' || f.kind === 'image') && f.data) {
      attachments.push({ kind: f.kind, mediaType: f.mediaType, data: f.data })
      attachedNames.push(f.name)
    }
  }
  if (attachedNames.length) {
    parts.push(`## Attached documents\n${attachedNames.map((n) => `- ${n}`).join('\n')}\n(Read the attached files to learn more about the user.)`)
  }

  // Scrape readable text from the provided links.
  const urls = (req.urls ?? []).map((u) => u.trim()).filter(Boolean)
  if (urls.length) {
    parts.push('## Links')
    for (const u of urls) {
      const r = await fetchReadableText(u)
      if (r.ok && r.text) parts.push(`### ${u}\n${r.text}`)
      else parts.push(`### ${u}\n(Could not read this page${r.error ? `: ${r.error}` : ''}. Still record the link in the profile.)`)
    }
  }

  if (!parts.length && !attachments.length) return { ok: false, error: 'Nothing to build a profile from' }

  const system =
    'You are a perceptive profiler building a personal profile note for a "second brain" notes app. ' +
    'The note is later retrieved as BACKGROUND CONTEXT to tailor answers to this person, so its value ' +
    'is in capturing WHO THEY ARE, not in cataloguing trivia. The user may be anyone (not necessarily ' +
    'a developer). You are given short form answers (grouped by section), optional attached documents ' +
    '(CV/PDF/images) and text scraped from links. ' +
    `Write the profile in ${locale}.\n\n` +

    'INFER, DON\'T JUST TRANSCRIBE. Many answers are intentionally INDIRECT proxies — favourite ' +
    'music/films/books, a dream trip, and playful "this or that" picks. Read them through validated ' +
    'personality psychology (the Big Five / OCEAN: openness, conscientiousness, extraversion, ' +
    'agreeableness, emotional stability) to infer likely TRAITS, VALUES, MOTIVATIONS and working/' +
    'communication preferences. These signals are PROBABILISTIC and modest, so treat them as soft ' +
    'priors, never certainties: phrase inferences as tendencies ("tends to…", "likely values…", ' +
    '"seems energised by…"), and let multiple cues converge before you commit to a trait.\n\n' +

    'ABSTRACT AWAY THE SOURCE. The main body must describe the person in terms of traits, values and ' +
    'how they think and want to be treated — NOT by naming the specific media that produced the ' +
    'inference. Write what a favourite REPRESENTS, not its title: e.g. "drawn to introspective, ' +
    'character-driven stories and big-picture thinking" rather than "likes Interstellar". This keeps ' +
    'the assistant from awkwardly name-dropping a movie/song in unrelated conversations.\n\n' +

    'Cover BOTH professional and personal dimensions, and especially HOW they want the assistant to ' +
    'communicate with them (tone, length, level of detail) — capture this clearly so future answers ' +
    'can adapt. Stay faithful: do not invent hard specifics (names, employers, dates) that the inputs ' +
    'do not support.\n\n' +

    'STRUCTURE. Organize into a few clear sections; skip any with no information. Suggested: ' +
    '"About" (a tight summary), "How they think & what they value" (the inferred traits/values), ' +
    '"Communication style" (how the assistant should talk to them), "Work & focus", "Interests", ' +
    'and "Links" (the URLs provided). ' +
    'Then, ONLY if the user gave literal favourites (songs, films, books, etc.), add a FINAL section ' +
    'named exactly "Soft signals (raw — do not cite)" that lists them verbatim, opening with one ' +
    'line: "Raw references kept for background only — do not bring these up in unrelated ' +
    'conversations." Keep this section short and low-key.\n\n' +

    'Return ONLY a JSON object with this exact shape: ' +
    '{"title": string, "sections": [{"name": string, "content": string}]}. ' +
    'No text outside the JSON. "content" is Markdown.'

  try {
    let text = ''
    const userText = parts.join('\n\n') || 'Build my profile from the attached files.'
    // A multi-section profile in the user's language can run long; 3072 left some models
    // truncating mid-JSON, which then failed to parse and lost the whole generation.
    await provider.chat({ system, messages: [{ role: 'user', content: userText }], maxTokens: 6144, attachments }, (d) => { text += d })
    const parsed = extractJson(text)
    if (!parsed) return { ok: false, error: 'Could not parse the model output' }
    for (const id of req.fileIds ?? []) profileFiles.delete(id) // attachments consumed
    return { ok: true, ...parsed }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('ai:profile-get-status', () => {
  const profile = (readSettings().aiProfile ?? {}) as { completedAt?: string; noteId?: string }
  return { completedAt: profile.completedAt ?? null, noteId: profile.noteId ?? null }
})

ipcMain.handle('ai:profile-set-completed', (_event, noteId?: string) => {
  const settings = readSettings()
  settings.aiProfile = { completedAt: new Date().toISOString(), ...(noteId ? { noteId } : {}) }
  writeSettings(settings)
  return { ok: true }
})

ipcMain.on('settings:get-theme', (event) => {
  event.returnValue = readSettings().theme ?? null
})

ipcMain.on('settings:set-theme', (_event, themeId: string) => {
  const settings = readSettings()
  settings.theme = themeId
  writeSettings(settings)
})

// Language is a local (non-synced, per-device) setting — unlike the theme, which
// now travels in ui-settings.json. Setting it persists, refreshes the tray in the
// new language, and broadcasts to every window (incl. the sender and any open
// stickies) so the UI switches live without a reload.
ipcMain.on('settings:get-language', (event) => {
  event.returnValue = readSettings().language ?? 'system'
})

ipcMain.on('settings:set-language', (_event, setting: LanguageSetting) => {
  const settings = readSettings()
  settings.language = setting
  writeSettings(settings)
  applyTrayMenu()
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('language-changed', setting))
})

ipcMain.handle('app:get-login-item', () => {
  const openAtLogin = (readSettings().openAtLogin ?? false) as boolean
  return { openAtLogin }
})

function applyLoginItemSettings(enabled: boolean): void {
  if (process.platform === 'linux') {
    // On Linux, manually manage the autostart .desktop file so that the
    // --noteflow-startup arg is reliably included. app.setLoginItemSettings
    // depends on finding the system .desktop file as a template and may drop
    // the args if the file name/path doesn't match exactly.
    const autostartDir = path.join(os.homedir(), '.config', 'autostart')
    const desktopFile = path.join(autostartDir, 'noteflow.desktop')
    if (enabled) {
      fs.mkdirSync(autostartDir, { recursive: true })
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
      ].join('\n') + '\n'
      fs.writeFileSync(desktopFile, content, 'utf-8')
    } else {
      try { fs.unlinkSync(desktopFile) } catch { /* already gone */ }
    }
  } else {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: enabled ? ['--noteflow-startup'] : [],
    })
  }
}

ipcMain.handle('app:set-login-item', (_event, enabled: boolean) => {
  const settings = readSettings()
  settings.openAtLogin = enabled
  writeSettings(settings)
  try {
    applyLoginItemSettings(enabled)
    return { ok: true }
  } catch (err) {
    console.error('Failed to set login item:', err)
    return { ok: false, error: String(err) }
  }
})

// ── CLI skill exposure (~/.claude/skills/noteflow-cli) ────────────────────────
// Installs the bundled noteflow-cli SKILL.md into the user's Claude skills dir so
// AI agents (e.g. Claude Code) discover how to drive NoteFlow via the CLI without
// any extra download. Controlled by the `exposeSkillToAgents` setting (default on)
// and re-synced on every launch so skill updates propagate. Best-effort: never
// throws into the startup path.
function syncSkillToClaudeDir(): void {
  try {
    const enabled = (readSettings().exposeSkillToAgents ?? true) as boolean
    const destDir = path.join(os.homedir(), '.claude', 'skills', 'noteflow-cli')
    const destFile = path.join(destDir, 'SKILL.md')

    if (!enabled) {
      // Opt-out: remove our file (and the folder if we left it empty). Never
      // touch anything else under ~/.claude.
      try {
        if (fs.existsSync(destFile)) fs.unlinkSync(destFile)
        if (fs.existsSync(destDir) && fs.readdirSync(destDir).length === 0) fs.rmdirSync(destDir)
      } catch (err) {
        console.error('Failed to remove NoteFlow skill:', err)
      }
      return
    }

    const srcFile = app.isPackaged
      ? path.join(process.resourcesPath, 'cli', 'noteflow-cli', 'SKILL.md')
      : path.join(__dirname, '..', 'cli', 'noteflow-cli', 'SKILL.md')
    if (!fs.existsSync(srcFile)) {
      // Dev without a bundled skill, or an unexpected layout — not fatal.
      console.error('NoteFlow skill source not found, skipping sync:', srcFile)
      return
    }

    const srcContent = fs.readFileSync(srcFile, 'utf-8')
    // Copy only when missing or stale, so we self-heal and pick up skill
    // changes on update without rewriting on every launch.
    const current = fs.existsSync(destFile) ? fs.readFileSync(destFile, 'utf-8') : null
    if (current !== srcContent) {
      fs.mkdirSync(destDir, { recursive: true })
      fs.writeFileSync(destFile, srcContent, 'utf-8')
    }
  } catch (err) {
    console.error('Failed to sync NoteFlow skill:', err)
  }
}

ipcMain.handle('app:get-skill-sync', () => ({
  enabled: (readSettings().exposeSkillToAgents ?? true) as boolean,
}))

ipcMain.handle('app:set-skill-sync', (_event, enabled: boolean) => {
  const settings = readSettings()
  settings.exposeSkillToAgents = enabled
  writeSettings(settings)
  try {
    syncSkillToClaudeDir()
    return { ok: true }
  } catch (err) {
    console.error('Failed to set skill sync:', err)
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

ipcMain.handle('settings:get-ui-state', () => {
  return (readSettings().uiState ?? {}) as { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }
})

ipcMain.handle('settings:set-ui-state', (_event, patch: { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }) => {
  const settings = readSettings()
  settings.uiState = { ...(settings.uiState as object ?? {}), ...patch }
  writeSettings(settings)
})

ipcMain.handle('groups:get', () => {
  try {
    return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8'))
  } catch { return [] }
})

function applyGroupsSet(groups: unknown[], senderId?: number, opts?: { durablePush?: boolean }): void | Promise<void> {
  const content = JSON.stringify(groups, null, 2)
  fs.writeFileSync(GROUPS_FILE, content, 'utf-8')
  // Broadcast to other windows so their groups reload immediately
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== senderId) {
      win.webContents.send('notes-updated')
    }
  })
  // Durable push for agentic chat tools (see applyNoteWrite): land groups.json on
  // the remote NOW so a racing pull doesn't overwrite the new group with the stale
  // remote copy before the debounced push fires.
  const sync = getActiveSyncProvider()
  if (opts?.durablePush) {
    if (!sync.isConnected()) return Promise.resolve()
    return sync
      .pushPathsNow(NOTES_DIR, ['groups.json'])
      .then(() => undefined)
      .catch((err) => { console.error('[chat] durable push failed:', String(err)) })
  }
  sync.schedulePush('groups.json', content)
}

ipcMain.handle('groups:set', (event, groups: unknown[]) => {
  applyGroupsSet(groups, event.sender.id)
})

ipcMain.handle('folders:get', () => {
  try {
    return JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf-8'))
  } catch { return [] }
})

function applyFoldersSet(folders: unknown[], senderId?: number, opts?: { durablePush?: boolean }): void | Promise<void> {
  const content = JSON.stringify(folders, null, 2)
  fs.writeFileSync(FOLDERS_FILE, content, 'utf-8')
  // Broadcast to other windows so their folders reload immediately
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== senderId) {
      win.webContents.send('notes-updated')
    }
  })
  // Durable push for agentic chat tools — see applyGroupsSet / applyNoteWrite.
  const sync = getActiveSyncProvider()
  if (opts?.durablePush) {
    if (!sync.isConnected()) return Promise.resolve()
    return sync
      .pushPathsNow(NOTES_DIR, ['folders.json'])
      .then(() => undefined)
      .catch((err) => { console.error('[chat] durable push failed:', String(err)) })
  }
  sync.schedulePush('folders.json', content)
}

ipcMain.handle('folders:set', (event, folders: unknown[]) => {
  applyFoldersSet(folders, event.sender.id)
})

ipcMain.handle('section-colors:get', () => {
  try {
    const raw = JSON.parse(fs.readFileSync(SECTION_COLORS_FILE, 'utf-8'))
    return sanitizeSectionColors(raw)
  } catch {
    return {}
  }
})

ipcMain.handle('section-colors:set', (event, colors: unknown) => {
  const sanitized = sanitizeSectionColors(colors)
  const content = JSON.stringify(sanitized, null, 2)
  fs.writeFileSync(SECTION_COLORS_FILE, content, 'utf-8')
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== event.sender.id) {
      win.webContents.send('notes-updated')
    }
  })
  getActiveSyncProvider().schedulePush('section-colors.json', content)
})

// ── UI settings (ui-settings.json) ─────────────────────────────────────────────
// Synced appearance + editor settings (see electron/uiSettings.ts for the format
// and the tri-state override semantics). Same pattern as section-colors: the file
// lives at the root of the notes dir so both sync backends push/pull it.

function readUiSettingsFile(): UiSettings {
  try {
    return sanitizeUiSettings(JSON.parse(fs.readFileSync(UI_SETTINGS_FILE, 'utf-8')))
  } catch {
    return {}
  }
}

// Synchronous on purpose: themeStore.initTheme() needs it before the first paint
// (same reason settings:get-theme is a sendSync channel).
ipcMain.on('ui-settings:get', (event) => {
  event.returnValue = readUiSettingsFile()
})

// Receives a PARTIAL patch and merges it over what is on disk, so themeStore
// (appearance) and editorSettingsStore (editor) never clobber each other's slice.
ipcMain.handle('ui-settings:set', (event, patch: unknown) => {
  const merged = mergeUiSettings(readUiSettingsFile(), patch)
  const content = JSON.stringify(merged, null, 2)
  fs.writeFileSync(UI_SETTINGS_FILE, content, 'utf-8')
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== event.sender.id) {
      win.webContents.send('notes-updated')
    }
  })
  getActiveSyncProvider().schedulePush('ui-settings.json', content)
})

ipcMain.handle('note-order:get', () => {
  try {
    return JSON.parse(fs.readFileSync(NOTE_ORDER_FILE, 'utf-8'))
  } catch { return {} }
})

ipcMain.handle('note-order:set', (event, order: unknown) => {
  const content = JSON.stringify(order, null, 2)
  fs.writeFileSync(NOTE_ORDER_FILE, content, 'utf-8')
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== event.sender.id) {
      win.webContents.send('notes-updated')
    }
  })
  getActiveSyncProvider().schedulePush('note-order.json', content)
})

ipcMain.handle('templates:get', () => {
  try {
    return JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8'))
  } catch { return [] }
})

ipcMain.handle('templates:set', (event, templates: unknown[]) => {
  const content = JSON.stringify(templates, null, 2)
  fs.writeFileSync(TEMPLATES_FILE, content, 'utf-8')
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== event.sender.id) {
      win.webContents.send('notes-updated')
    }
  })
  getActiveSyncProvider().schedulePush('templates.json', content)
})

// Window controls
ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window:get-id', (event) => {
  event.returnValue = event.sender.id
})
ipcMain.on('app:get-hardware', (event) => {
  const cpus = os.cpus()
  event.returnValue = {
    logicalCores: cpus.length,
    cpuModel: cpus[0]?.model ?? '',
    cpuSpeedMHz: cpus[0]?.speed ?? 0,
    totalMemGiB: os.totalmem() / (1024 ** 3),
  }
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

ipcMain.on('window:set-always-on-top', (event, flag: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  win.setAlwaysOnTop(flag)
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

app.whenReady().then(async () => {
  // Losing the lock means another instance already owns the app: quit was
  // already requested above, so do NO startup work (migration, initial pull,
  // tray, window) before this process dies.
  if (!gotTheLock) return

  // Must match electron-builder's `build.appId` so Windows groups the taskbar
  // button with the pinned shortcut and attributes notifications correctly.
  if (process.platform === 'win32') app.setAppUserModelId('dev.noteflow.notes')

  // Remove default menu for all windows
  Menu.setApplicationMenu(null)

  // One-time local format migration (v1 flat .md → v2 folder-per-note).
  // MUST run before the initial pull and before the fs watcher starts.
  const migrationResult = migrateNotesDirToV2(NOTES_DIR)

  githubSync.loadSyncSettings()
  githubSync.onStatusChanged(() => emitSyncStatusChanged())
  const connected = githubSync.getSyncStatus().connected

  // NoteFlow Cloud: restore the cached DEK (safeStorage) and the engine
  // settings. Mutually exclusive with GitHub Sync — when enabled, Cloud owns
  // the sync loop and GitHub's is skipped (see syncProvider.ts).
  cloudKeys.initCloudKeys()
  cloudSync.initCloudSync(NOTES_DIR)
  cloudSync.onStatusChanged(() => emitCloudStatusChanged())
  const cloudEnabled = cloudSync.isCloudSyncEnabled()

  // NoteFlow account: load the persisted session and refresh entitlements in
  // the background (deferred inside initAccount — never blocks boot).
  account.onStatusChanged(() => handleAccountStatusChanged())
  account.initAccount()
  // Seed the sign-in/sign-out edge detector with the session as restored from
  // disk: a persisted session is NOT a sign-in transition (a pending restore
  // record still gets evaluated on the first status change — see
  // planAccountTransition).
  lastAccountSnapshot = (() => {
    const status = account.getAccountStatus()
    return { signedIn: status.signedIn, identity: accountIdentityOf(status) }
  })()

  const isStartupMode = process.argv.includes('--noteflow-startup')
  const startupStickies = (readSettings().startupStickies ?? []) as Array<{ noteId: string; sectionId: string }>

  // Initial NoteFlow Cloud pull + autosync (Realtime subscription + safety-net
  // loop). Same rationale as the GitHub block below: in startup mode block
  // briefly so stickies open fresh; otherwise pull in the background (pushes
  // are gated until it succeeds).
  if (cloudEnabled) {
    const runInitialCloudPull = () =>
      cloudSync
        .pullNotes(NOTES_DIR)
        .then((result) => {
          broadcastPullResult(result, 'cloud')
          emitCloudStatusChanged()
          cloudSync.retrySyncJournal(NOTES_DIR).catch((err) => {
            console.error('[Startup] cloud journal retry failed:', String(err))
          })
        })
        .catch((err) => {
          console.error('[Startup] initial cloud pull failed:', String(err))
        })
    if (isStartupMode) {
      await Promise.race([
        runInitialCloudPull(),
        new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
      ])
    } else {
      runInitialCloudPull()
    }
    startCloudAutoSync()
  }

  // Managed-mode silent unlock, deferred so it never competes with the boot
  // path (same spirit as initAccount's entitlements refresh). If the initial
  // cloud pull above failed because the keys were still locked (no safeStorage
  // cache), retry it now that the DEK is in memory.
  setTimeout(() => {
    cloudKeys.autoUnlockManaged()
      .then((changed) => {
        if (!changed) return
        emitCloudStatusChanged()
        const status = cloudSync.getCloudSyncStatus()
        if (status.enabled && status.keysState === 'unlocked' && status.initialPullStatus !== 'ok') {
          cloudSync
            .pullNotes(NOTES_DIR)
            .then((result) => {
              broadcastPullResult(result, 'cloud')
              emitCloudStatusChanged()
            })
            .catch((err) => console.error('[Startup] cloud pull after managed unlock failed:', String(err)))
        }
      })
      .catch((err) => console.error('[Startup] managed auto-unlock failed:', String(err)))
  }, 5_000)

  // Initial GitHub pull. In startup mode we block for up to 10s so sticky
  // windows open with up-to-date content — otherwise an edit on stale data
  // would overwrite newer remote changes (data loss). In normal mode we keep
  // the fast-open UX and pull in the background; schedulePush is gated until
  // the first pull succeeds, so no unsafe pushes happen in the meantime.
  // Skipped while Cloud is enabled (mutual exclusion — Cloud takes priority).
  if (connected && !cloudEnabled) {
    const runInitialPull = () =>
      githubSync
        .pullNotes(NOTES_DIR)
        .then((result) => {
          broadcastPullResult(result, 'github')
          // Drain remote mutations journaled in previous sessions (failed or
          // interrupted pushes/deletes). Internally gated on the initial pull
          // having succeeded, so this is a no-op if the pull above failed.
          githubSync.retrySyncJournal(NOTES_DIR).catch((err) => {
            console.error('[Startup] journal retry failed:', String(err))
          })
          // One-time remote format migration (v1 flat files → folders + marker).
          // Internally guarded; no-op once the remote is already v2.
          githubSync.migrateRemoteToV2IfNeeded(NOTES_DIR).then((didMigrate) => {
            if (didMigrate) {
              // Remote-only notes may have been imported locally — full reload
              BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('notes-updated'))
            }
          }).catch((err) => {
            console.error('[Startup] remote format migration failed:', String(err))
          })
        })
        .catch((err) => {
          console.error('[Startup] initial pull failed:', String(err))
          githubSync.setInitialPullStatus('failed')
        })

    if (isStartupMode) {
      await Promise.race([
        runInitialPull(),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            if (githubSync.getSyncStatus().initialPullStatus === 'pending') {
              console.warn('[Startup] initial pull timeout — proceeding with local data')
              githubSync.setInitialPullStatus('failed')
            }
            resolve()
          }, 10_000)
        ),
      ])
    } else {
      runInitialPull()
    }
    startAutoSync()
  }

  // Refresh login item registration on every launch so it stays current after
  // app updates (binary path or args may have changed since the user first
  // enabled the feature).
  const savedOpenAtLogin = (readSettings().openAtLogin ?? false) as boolean
  if (savedOpenAtLogin) {
    try { applyLoginItemSettings(true) } catch (err) {
      console.error('Failed to refresh login item on startup:', err)
    }
  }

  // Keep the CLI skill in ~/.claude/skills in sync (install/update/remove) so AI
  // agents discover it. Best-effort — must never block startup.
  try { syncSkillToClaudeDir() } catch (err) {
    console.error('Failed to sync NoteFlow skill on startup:', err)
  }

  if (isStartupMode) {
    // Launched at system startup: always keep the main window hidden in tray
    // and open any configured startup sticky notes.
    mainWindow = createWindow(true)
    const stickyWins: BrowserWindow[] = []
    for (const { noteId, sectionId } of startupStickies) {
      stickyWins.push(createStickyWindow(noteId, sectionId))
    }
    // Fallback for Wayland: the compositor may not honour ready-to-show, or
    // the window may be obscured by GNOME Shell's startup animation.
    // Force-show any sticky that is still not visible 5 s after creation.
    if (stickyWins.length > 0) {
      setTimeout(() => {
        stickyWins.forEach(w => {
          if (!w.isDestroyed() && !w.isVisible()) w.show()
        })
      }, 5000)
    }
  } else {
    mainWindow = createWindow()
  }

  createTray()
  registerGlobalShortcut()
  startAlarmEngine()
  // With sync connected this is a no-op: the initial pull above runs it on success.
  maybeCheckExpiredNotes({ kind: 'timer' })

  // Semantic index (AI). init() wires config; primeSettings defers the worker warmup so
  // model loading / reindex doesn't compete with the app's first paint.
  aiIndex.init({ notesDir: NOTES_DIR, onProgress: emitAiProgress, onState: emitAiState, onStale: emitAiStale })
  aiIndex.primeSettings(readAiSettings())

  // The format migration rewrote every note path — the AI index stores stale
  // file paths and must be rebuilt once. Deferred so it doesn't fight startup.
  if (migrationResult.migrated > 0 && aiIndex.isEnabled()) {
    setTimeout(() => {
      aiIndex.reindexAll().catch((err) => console.error('[Migration] AI reindex failed:', String(err)))
    }, 15_000)
  }

  // Watch for external file changes (CLI, sync from another device, etc.)
  startNotesWatcher()

  app.on('activate', () => {
    showWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  // After system resume from sleep, reload notes several times with increasing
  // delays. A single 1500ms attempt is not enough: the renderer may take a few
  // seconds to recover (or be reloaded by the crash handler above), and the
  // filesystem may not be ready immediately on Windows.
  // The 15s and 30s signals act as extra safety nets for slow filesystem
  // recovery (e.g. hibernation) or renderer restarts that happen after the
  // earlier signals have already fired.
  powerMonitor.on('resume', () => {
    for (const delay of [1500, 4000, 8000, 15000, 30000]) {
      setTimeout(() => {
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) w.webContents.send('notes-updated')
        })
      }, delay)
    }
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
