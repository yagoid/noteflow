/**
 * aiIndex.ts — runs in the main process. Owns the AI utilityProcess lifecycle and
 * exposes a small async API consumed by the IPC handlers and the fs:write-note hook.
 *
 * The heavy work (embeddings, SQLite) lives in aiWorker.ts; this module only forks it,
 * mediates a request/response message protocol, debounces incremental indexing (mirrors
 * githubSync.schedulePush), and respawns the worker if it crashes (the index persists).
 */
import { utilityProcess, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { IndexStaleness, type StaleInfo } from './indexStaleness'
import {
  DEFAULT_AI_MODEL,
  type IndexState, type IndexProgress, type RelatedNote, type SemanticHit, type GraphEdge,
  type WorkerResponse, type DataNote,
} from './protocol'

export type { StaleInfo } from './indexStaleness'

export interface AiSettings {
  enabled: boolean
  modelId: string
  lastIndexedModelId?: string | null
  chunking: 'section'
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  modelId: DEFAULT_AI_MODEL,
  lastIndexedModelId: null,
  chunking: 'section',
}

let child: Electron.UtilityProcess | null = null
let ready = false
let manualStop = false
let starting: Promise<void> | null = null

let settings: AiSettings = { ...DEFAULT_AI_SETTINGS }
let notesDir = ''
// Notes that don't live in the notes dir (linked .md files, electron/linkedNotes.ts), handed
// to the worker as data on a full reindex.
let extraNotes: () => DataNote[] = () => []
let eventSink: {
  progress?: (p: IndexProgress) => void
  state?: (s: IndexState) => void
  stale?: (s: StaleInfo) => void
} = {}

let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
const indexTimers = new Map<string, ReturnType<typeof setTimeout>>()

const INDEX_DEBOUNCE_MS = 2500

// After this long with no AI traffic at all, kill the whole worker process — not just unload the
// model. onnxruntime-node does not reliably return its native arena memory to the OS on dispose(),
// so the model-unload inside the worker only drops it to ~70 MB resident; the only sure way to
// reclaim everything is to let the process exit. The index lives on disk, so the next search/graph/
// related lazily respawns it via ensureStarted() with nothing lost.
const WORKER_IDLE_STOP_MS = 90_000
let idleStopTimer: ReturnType<typeof setTimeout> | null = null

function cancelWorkerIdleStop(): void {
  if (idleStopTimer) { clearTimeout(idleStopTimer); idleStopTimer = null }
}

// (Re)arm the idle-stop timer. Called on every request so any AI activity resets the countdown.
// Only tears the worker down when it's actually idle (no in-flight requests, not mid-start).
function bumpWorkerActivity(): void {
  cancelWorkerIdleStop()
  idleStopTimer = setTimeout(() => {
    idleStopTimer = null
    if (!child || !ready) return // worker already gone → nothing to do; next request re-arms
    if (starting || pending.size > 0) { bumpWorkerActivity(); return } // still busy → re-check later
    void stop().catch((err) => console.error('[aiIndex] idle stop failed:', String(err)))
  }, WORKER_IDLE_STOP_MS)
}

// ── Pending index state ("the index is out of date") ────────────────────────
// The renderer's stale marker must reflect what the index actually holds, so main owns the truth:
// a note dir enters the pending set the moment it is written and only leaves when the worker says
// it indexed it. Deriving it from the worker's 'idle' state does not work — that also fires on
// worker boot, model unload and errors, none of which mean "indexed".
//
// Persisted because the gap is durable: scheduleIndex drops the work when the worker is dormant
// (see below), so those edits stay unindexed until the next explicit reindex — across restarts too.
// The rules themselves live in indexStaleness.ts (pure, unit-tested).

let pendingState: IndexStaleness | null = null
let lastStaleSent: StaleInfo | null = null

function pendingPath(): string {
  return path.join(app.getPath('userData'), 'ai-index', 'pending.json')
}

/** Lazy so nothing touches userData before the app is ready. */
function pendingNotes(): IndexStaleness {
  if (pendingState) return pendingState
  try {
    pendingState = IndexStaleness.fromJSON(JSON.parse(fs.readFileSync(pendingPath(), 'utf-8')))
  } catch {
    pendingState = new IndexStaleness() // missing or unreadable → nothing pending
  }
  return pendingState
}

/** Persist, then notify — but only when the value the renderer sees actually changed. */
function pendingChanged(): void {
  try {
    const file = pendingPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(pendingNotes().toJSON()), 'utf-8')
  } catch (err) {
    // Never let bookkeeping break a note save — worst case the marker resets on the next boot.
    console.error('[aiIndex] failed to persist pending index state:', String(err))
  }
  const next = getStale()
  if (lastStaleSent && lastStaleSent.stale === next.stale && lastStaleSent.count === next.count) return
  lastStaleSent = next
  eventSink.stale?.(next)
}

/** Flag one note dir as waiting for the index to catch up. No-op while AI is off. */
export function markStale(dirPath: string): void {
  if (!settings.enabled) return
  if (pendingNotes().markDir(path.basename(dirPath), Date.now())) pendingChanged()
}

/** Flag a change we cannot pin to a note dir (e.g. notes deleted by a sync pull). */
export function markStaleUnknown(): void {
  if (!settings.enabled) return
  if (pendingNotes().markUnknown(Date.now())) pendingChanged()
}

export function getStale(): StaleInfo {
  if (!settings.enabled) return { stale: false, count: 0 }
  return pendingNotes().info()
}

function clearPending(dirPath: string, since: number): void {
  if (pendingNotes().clearDir(path.basename(dirPath), since)) pendingChanged()
}

function clearPendingBefore(since: number): void {
  if (pendingNotes().clearBefore(since)) pendingChanged()
}

function clearAllPending(): void {
  if (pendingNotes().clearAll()) pendingChanged()
}

// ── Public API ──────────────────────────────────────────────────────────────

export function init(opts: {
  notesDir: string
  onProgress?: (p: IndexProgress) => void
  onState?: (s: IndexState) => void
  onStale?: (s: StaleInfo) => void
  extraNotes?: () => DataNote[]
}): void {
  notesDir = opts.notesDir
  eventSink = { progress: opts.onProgress, state: opts.onState, stale: opts.onStale }
  if (opts.extraNotes) extraNotes = opts.extraNotes
}

export function isEnabled(): boolean {
  return settings.enabled
}

/**
 * Set the persisted settings at boot. Nothing is started here: the lightweight worker (SQLite
 * only, ~70 MB) spins up lazily the first time the brain view asks for graph/related, and the
 * heavy model loads only on an explicit reindex / reactivate. So a fresh boot costs 0 MB of AI.
 */
export function primeSettings(next: AiSettings): void {
  settings = next
}

export function getSettings(): AiSettings {
  return settings
}

/** Load the heavy model (lazy, in the worker) and reindex if the stored vectors are stale/missing.
 *  This is the "reactivate" path — the only thing besides the Reindex button that wakes the model. */
async function activateModel(): Promise<void> {
  await ensureStarted() // light SQLite worker
  const res = (await request('load-model', {})) as { needsReindex?: boolean }
  if (res?.needsReindex) { await reindexAll(); return }
  // The stored vectors are reusable, so nothing was rebuilt — but notes edited while AI was off
  // never reached the index (scheduleIndex is a no-op then) and we have no record of which ones.
  markStaleUnknown()
}

/** Apply a new settings snapshot: start/stop/restart the worker as needed. */
export async function applySettings(next: AiSettings): Promise<void> {
  const prev = settings
  settings = next

  if (!next.enabled) {
    // Disable → fully stop the worker (drops both SQLite and the model). Pending work goes with it:
    // warning about a stale index makes no sense while AI is off, and re-enabling reindexes anyway.
    await stop()
    clearAllPending()
    return
  }

  const modelChanged = prev.modelId !== next.modelId
  if (modelChanged && child) {
    // Model swap → restart so the worker picks up the new model on its next lazy load.
    await stop()
  }
  await ensureStarted() // light worker (SQLite only); the model stays unloaded until needed
  // Turning AI on, or switching models, is an explicit activation → load the model + reindex.
  if (!prev.enabled || modelChanged) await activateModel()
}

/** Debounced incremental index of a single note directory (called from fs:write-note). */
export function scheduleIndex(dirPath: string): void {
  if (!settings.enabled) return
  // Mark before the debounce: from this instant the index is behind, whether or not the run below
  // ever happens.
  markStale(dirPath)
  const key = path.basename(dirPath)
  const existing = indexTimers.get(key)
  if (existing) clearTimeout(existing)
  indexTimers.set(key, setTimeout(async () => {
    indexTimers.delete(key)
    // Only index if the model is already up this session — never wake the worker/model from a save.
    // While dormant the edit is skipped; the next explicit reindex catches it up (it stays pending).
    if (!child || !ready) return
    const startedAt = Date.now()
    try {
      await request('index-note', { dirPath })
      clearPending(dirPath, startedAt) // only now is this note really in the index
    } catch (err) {
      console.error('[aiIndex] index-note failed:', String(err))
    }
  }, INDEX_DEBOUNCE_MS))
}

/**
 * scheduleIndex for a note handed over as data (a linked .md — not a notes-dir folder). Same
 * debounce, staleness and dormancy rules; the note is read at run time (`read`), null = gone.
 */
export function scheduleIndexData(key: string, read: () => DataNote | null): void {
  if (!settings.enabled) return
  markStale(key)
  const timerKey = `data:${key}`
  const existing = indexTimers.get(timerKey)
  if (existing) clearTimeout(existing)
  indexTimers.set(timerKey, setTimeout(async () => {
    indexTimers.delete(timerKey)
    if (!child || !ready) return
    const startedAt = Date.now()
    try {
      const data = read()
      if (data) await request('index-note-data', data)
      else await request('remove-note', { dirPath: key })
      clearPending(key, startedAt)
    } catch (err) {
      console.error('[aiIndex] index-note-data failed:', String(err))
    }
  }, INDEX_DEBOUNCE_MS))
}

export function removeFromIndex(dirPath: string): void {
  if (!settings.enabled) return
  if (!child || !ready) { markStaleUnknown(); return } // index keeps serving a note that no longer exists
  const startedAt = Date.now()
  request('remove-note', { dirPath })
    .then(() => clearPending(dirPath, startedAt))
    .catch((err) => {
      console.error('[aiIndex] remove-note failed:', String(err))
      markStaleUnknown()
    })
}

export async function reindexAll(): Promise<{ ok: boolean; indexed: number }> {
  await ensureStarted()
  const startedAt = Date.now()
  let extra: DataNote[] = []
  try { extra = extraNotes() } catch (err) { console.error('[aiIndex] extra notes unavailable:', String(err)) }
  const res = await (request('reindex-all', { notesDir, extra }) as Promise<{ ok: boolean; indexed: number }>)
  // Everything written before the rebuild started is now in the index; notes touched during it stay.
  clearPendingBefore(startedAt)
  return res
}

export async function search(query: string, k = 10): Promise<SemanticHit[]> {
  if (!settings.enabled) return []
  try {
    await ensureStarted()
    return await (request('search', { query, k }) as Promise<SemanticHit[]>)
  } catch (err) {
    // Worker stopped/restarting (e.g. user toggled off mid-request) → no results, not an error.
    console.warn('[aiIndex] search aborted:', String(err))
    return []
  }
}

export async function related(noteId: string, sectionId: string, k = 6): Promise<RelatedNote[]> {
  if (!settings.enabled) return []
  try {
    await ensureStarted()
    return await (request('related', { noteId, sectionId, k }) as Promise<RelatedNote[]>)
  } catch (err) {
    console.warn('[aiIndex] related aborted:', String(err))
    return []
  }
}

/** Note-to-note content edges for the brain graph (Phase 2). [] if AI is off or empty. */
export async function graph(): Promise<GraphEdge[]> {
  if (!settings.enabled) return []
  try {
    await ensureStarted()
    return await (request('graph', {}) as Promise<GraphEdge[]>)
  } catch (err) {
    // Worker stopped/restarting (e.g. user toggled off mid-request) → no edges, not an error.
    console.warn('[aiIndex] graph aborted:', String(err))
    return []
  }
}

// ── Worker lifecycle ────────────────────────────────────────────────────────

function ensureStarted(): Promise<void> {
  if (child && ready) return Promise.resolve()
  if (starting) return starting
  starting = start().finally(() => { starting = null })
  return starting
}

async function start(): Promise<void> {
  if (child) return
  manualStop = false
  const dbPath = path.join(app.getPath('userData'), 'ai-index', 'index.db')
  const cacheDir = path.join(app.getPath('userData'), 'ai-models')
  // aiIndex.js is compiled to dist-electron/ai/, so the worker is a sibling here.
  const workerPath = path.join(__dirname, 'aiWorker.js')

  const proc = utilityProcess.fork(workerPath, [], {
    serviceName: 'noteflow-ai',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stdout?.on('data', (d: Buffer) => console.log('[aiWorker]', d.toString().trimEnd()))
  proc.stderr?.on('data', (d: Buffer) => console.error('[aiWorker:err]', d.toString().trimEnd()))
  child = proc

  await new Promise<void>((resolve, reject) => {
    let settled = false
    proc.on('message', (msg: WorkerResponse) => onMessage(msg))
    proc.on('exit', (code) => {
      if (!settled) { settled = true; reject(new Error(`AI worker exited before init (code ${code})`)) }
      onExit(code)
    })

    // Send init once spawned. Electron queues the message until the child port is up.
    // init is light (opens the DB, no model) → resolves fast. We never reindex here: the model
    // is only loaded on an explicit reindex/reactivate, so a fresh start costs ~70 MB, not ~600.
    proc.once('spawn', () => {
      request('init', { modelId: settings.modelId, cacheDir, dbPath })
        .then(() => {
          ready = true
          settled = true
          resolve()
        })
        .catch((err) => {
          if (!settled) { settled = true; reject(err) }
        })
    })
  })
}

async function stop(): Promise<void> {
  manualStop = true
  cancelWorkerIdleStop()
  for (const t of indexTimers.values()) clearTimeout(t)
  indexTimers.clear()
  for (const { reject } of pending.values()) reject(new Error('AI worker stopped'))
  pending.clear()
  const proc = child
  child = null
  ready = false
  if (proc) proc.kill()
}

function onExit(code: number | undefined): void {
  child = null
  ready = false
  cancelWorkerIdleStop()
  for (const { reject } of pending.values()) reject(new Error('AI worker exited'))
  pending.clear()
  if (!manualStop && settings.enabled) {
    // Unexpected crash → respawn after a short delay. The on-disk index survives.
    console.warn(`[aiIndex] worker exited (code ${code}); respawning…`)
    setTimeout(() => { ensureStarted().catch((err) => console.error('[aiIndex] respawn failed:', String(err))) }, 1000)
  }
}

function onMessage(msg: WorkerResponse): void {
  switch (msg.type) {
    case 'result': {
      const p = pending.get(msg.id)
      if (p) { pending.delete(msg.id); p.resolve(msg.payload) }
      break
    }
    case 'error': {
      const p = pending.get(msg.id)
      if (p) { pending.delete(msg.id); p.reject(new Error(msg.error)) }
      break
    }
    case 'progress':
      eventSink.progress?.(msg.payload)
      break
    case 'state':
      eventSink.state?.(msg.payload)
      break
  }
}

function request(type: string, payload: unknown): Promise<unknown> {
  if (!child) return Promise.reject(new Error('AI worker not running'))
  bumpWorkerActivity() // any traffic resets the idle-stop countdown
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    child!.postMessage({ type, id, payload })
  })
}
