import { create } from 'zustand'
import {
  DEFAULT_AGENT_TASK_SETTINGS,
  agentIdsIn,
  type AgentBlock,
  type AgentTaskSettings,
} from '../lib/agentTasks'
import { agentMaintenanceDue, confirmedAgentDiscards, hasLiveAgentBlocks, withoutAgentMarkers } from '../lib/agentTaskUi'
import { hasPendingEdits } from '../lib/pendingEdits'
import { settleNoteWrites, useNotesStore } from './notesStore'

// Agent tasks, live: the `agentTasks` settings of this machine and the blocks of
// agent.md of every note an editor of this window is showing ("watched"). The
// state of a task lives on its LINE (the taskItem's attributes); this store adds
// what only the block knows — the last signal (for the derived 'no signal'),
// the progress, the question, the report.
//
//   - A note is watched while an editor shows it AND it carries some 🤖 marker
//     or the feature is on (Editor → useAgentTasksWatch). Its blocks are read
//     then and again on every `agent-tasks:changed` of its folder.
//   - `now` is the clock the chips derive 'no signal' from. It only ticks (once
//     a minute) while some watched block is running / waiting.
//   - "Run" (launch an agent from the app): whether this build can open a
//     terminal with the CLI (`runTerminal` / `runNode`: asked when it loads and again when the feature or the launch mode changes) and the project folder
//     of each note that asked for it (`folders`, local to this machine).
//   - Maintenance (orphans + discard by age) runs after a read, with the feature
//     on only, never twice at once, never while the note has an edit waiting on
//     its debounce, and at most once a minute per note unless it was just
//     opened: the refresh our own write causes cannot start another round.
//
// Docs: .agents/context/patterns.md "Tareas con agentes: interfaz".

const TICK_MS = 60_000
/** A write of main that found the note's lock busy (an agent's CLI was writing) is tried once more, this much later. */
const BUSY_RETRY_MS = 1500
/** Minimum gap between two maintenance rounds of one note (a round started by opening the note ignores it). */
export const AGENT_MAINTENANCE_INTERVAL_MS = 60_000

interface Watch {
  /** What the IPC takes: the note folder's absolute path. */
  dirPath: string
  noteId: string
  count: number
  /** Bumped per read: a late answer never overwrites a newer one. */
  seq: number
  maintaining: boolean
  maintainedAt: number | undefined
}

/** The project folder of a note for "Run": its path (null without one) and whether it is still there. */
export interface AgentRunFolder {
  folder: string | null
  exists: boolean
}

/** Runs a write of main again, once, when it answered `busy` (the note's lock was taken): nothing was written the first time. */
async function retryWhenBusy<T extends { ok: boolean; busy?: boolean }>(write: () => Promise<T>): Promise<T> {
  const first = await write()
  if (first.ok || !first.busy) return first
  await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS))
  return write()
}

/** Watched notes, by folder NAME (main and the store may spell the same path with different separators). */
const watches = new Map<string, Watch>()
let loadPromise: Promise<void> | null = null
let ticker: ReturnType<typeof setInterval> | null = null
/** Test hook of the "Run" info (set by the store): forgets what was asked. */
let resetRunInfo: () => void = () => undefined

/** The folder name of a note folder path: what identifies a note's agent.md in this store. */
export function agentDirKey(dirPath: string): string {
  return dirPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? dirPath
}

interface AgentTasksState {
  settings: AgentTaskSettings
  settingsLoaded: boolean
  /** Folder name → the blocks of that note's agent.md (watched notes only). */
  byDir: Record<string, AgentBlock[]>
  /** Task id → its block, over every watched note (an id is unique across the notes dir). */
  byId: Record<string, AgentBlock>
  /** Reads in flight for notes not read yet: a task without a block is not "lost" until they land. */
  pendingLoads: number
  /** The clock 'no signal' is derived from (epoch ms). */
  now: number
  /** "Run" in a terminal is possible in this build (false in the Microsoft Store one); null until main answers. */
  runTerminal: boolean | null
  /** There is something to run the CLI with in that terminal (false on Windows without Node.js 18+); null until main answers. */
  runNode: boolean | null
  /** Note id → its project folder, for the notes that asked (loadFolder). */
  folders: Record<string, AgentRunFolder>

  /** First call loads the settings and subscribes to main's events; later calls are no-ops. */
  ensureLoaded: () => Promise<void>
  setSettings: (patch: Partial<AgentTaskSettings>) => Promise<void>
  /** Starts watching a note's agent.md (ref-counted). Returns the function that stops it. */
  watch: (dirPath: string, noteId: string) => () => void
  /** Re-reads a watched note's blocks; `opened`: the note was just opened (maintenance runs regardless of its interval). */
  refresh: (dirPath: string, opened?: boolean) => Promise<void>
  /**
   * Removes the report of task `id` — AFTER the note's writes have landed, and
   * only if no line of the note carries the id any more: the caller removes the
   * marker first (an undo in between keeps the report).
   */
  dismissTask: (noteId: string, id: string) => Promise<void>
  /**
   * The app changed the state on the line of task `id`: once that edit is
   * written, main makes the task's block mirror its line (state, and
   * `finishedAt` when it becomes done) — so the discard by age sees a task
   * closed from the app as finished.
   */
  reconcileTask: (noteId: string, id: string) => Promise<void>
  /** Reads the project folder of a note from main (again each time: another window may have changed it). */
  loadFolder: (noteId: string) => Promise<void>
  /** Records the folder main just confirmed for a note (the preflight of a run). */
  setFolder: (noteId: string, folder: string) => void
  /** Asks for another folder (the native dialog). */
  pickFolder: (noteId: string) => Promise<void>
  clearFolder: (noteId: string) => Promise<void>
}

function indexById(byDir: Record<string, AgentBlock[]>): Record<string, AgentBlock> {
  const byId: Record<string, AgentBlock> = {}
  for (const blocks of Object.values(byDir)) for (const b of blocks) byId[b.id] ??= b
  return byId
}

export const useAgentTasksStore = create<AgentTasksState>((set, get) => {
  /** The minute timer runs only while some watched block's 'no signal' depends on the clock. */
  const syncTicker = () => {
    const needed = Object.values(get().byDir).some(hasLiveAgentBlocks)
    if (needed && !ticker) {
      ticker = setInterval(() => set({ now: Date.now() }), TICK_MS)
    } else if (!needed && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  const setBlocks = (key: string, blocks: AgentBlock[] | null) => {
    const byDir = { ...get().byDir }
    if (blocks === null) delete byDir[key]
    else byDir[key] = blocks
    set({ byDir, byId: indexById(byDir), now: Date.now() })
    syncTicker()
  }

  /**
   * Orphans + discard by age of one watched note. Order of the discard, so no
   * step can race the editor: the markers leave the lines through the store's
   * queued write (the open editor takes it as any external change), and only
   * then, for the ids really gone, the blocks are removed.
   */
  const maintain = async (key: string, watch: Watch, blocks: AgentBlock[], discardable: string[], opened: boolean) => {
    if (!get().settings.enabled || blocks.length === 0) return
    const due = agentMaintenanceDue({
      running: watch.maintaining,
      pendingEdits: hasPendingEdits(watch.noteId),
      lastRunAt: watch.maintainedAt,
      nowMs: Date.now(),
      minIntervalMs: AGENT_MAINTENANCE_INTERVAL_MS,
      force: opened,
    })
    if (!due) return
    const noteNow = () => useNotesStore.getState().notes.find((n) => n.id === watch.noteId)
    const note = noteNow()
    if (!note || note.encryption || note.linked) return
    watch.maintaining = true
    try {
      const res = await window.noteflow.agentTasksMaintain(watch.dirPath, [...agentIdsIn(note.sections)])
      if (watches.get(key) !== watch) return
      if (res.ok && res.changed) setBlocks(key, res.blocks)

      const ids = confirmedAgentDiscards(discardable, noteNow()?.sections)
      if (ids.length === 0 || hasPendingEdits(watch.noteId)) return
      await useNotesStore.getState().mutateSections(watch.noteId, (sections) => {
        const next = withoutAgentMarkers(sections, ids)
        return next === sections ? null : next
      })
      const still = agentIdsIn(noteNow()?.sections)
      for (const id of ids) {
        if (!still.has(id)) await window.noteflow.agentTasksDismiss(watch.dirPath, id)
      }
    } catch (err) {
      console.error('Agent tasks maintenance failed:', err)
    } finally {
      watch.maintaining = false
      watch.maintainedAt = Date.now()
    }
  }

  // "Run": what main says about this build and this computer ('agent-run:info'). Main only looks
  // for Node.js (Windows) with the feature on and the terminal mode chosen, so the answer is asked
  // again when either changes — the latest answer wins.
  let infoSeq = 0
  let infoKey: string | null = null
  const refreshRunInfo = () => {
    const seq = ++infoSeq
    void Promise.resolve()
      .then(() => window.noteflow.agentRunInfo())
      .then((info) => { if (seq === infoSeq) set({ runTerminal: info.terminal, runNode: info.node !== false }) })
      .catch(() => { if (seq === infoSeq) set({ runTerminal: false, runNode: null }) })
  }
  resetRunInfo = () => { infoSeq++; infoKey = null }
  /** Stores the settings; when what main's answer depends on changed, asks main again. */
  const applySettings = (settings: AgentTaskSettings) => {
    const key = `${settings.enabled}|${settings.launch === 'terminal'}`
    const changed = infoKey !== null && infoKey !== key
    infoKey = key
    set({ settings, settingsLoaded: true })
    if (changed) refreshRunInfo()
  }

  const read = async (key: string, opened: boolean) => {
    const watch = watches.get(key)
    if (!watch) return
    const seq = ++watch.seq
    const first = get().byDir[key] === undefined
    if (first) set((s) => ({ pendingLoads: s.pendingLoads + 1 }))
    try {
      const res = await window.noteflow.agentTasksRead(watch.dirPath)
      if (watches.get(key) !== watch || watch.seq !== seq) return
      setBlocks(key, res.blocks)
      void maintain(key, watch, res.blocks, res.discardable, opened)
    } catch (err) {
      console.error('Failed to read agent tasks:', err)
    } finally {
      if (first) set((s) => ({ pendingLoads: Math.max(0, s.pendingLoads - 1) }))
    }
  }

  return {
    settings: DEFAULT_AGENT_TASK_SETTINGS,
    settingsLoaded: false,
    byDir: {},
    byId: {},
    pendingLoads: 0,
    now: Date.now(),
    runTerminal: null,
    runNode: null,
    folders: {},

    ensureLoaded: () => {
      if (loadPromise) return loadPromise
      window.noteflow.onAgentTasksChanged((dirPath) => { void read(agentDirKey(dirPath), false) })
      window.noteflow.onAgentTasksSettingsChanged(applySettings)
      refreshRunInfo()
      loadPromise = window.noteflow.agentTasksGetSettings()
        .then(applySettings)
        .catch((err) => {
          console.error('Failed to load the agent tasks settings:', err)
          set({ settingsLoaded: true })
        })
      return loadPromise
    },

    setSettings: async (patch) => {
      applySettings(await window.noteflow.agentTasksSetSettings(patch))
    },

    watch: (dirPath, noteId) => {
      const key = agentDirKey(dirPath)
      const existing = watches.get(key)
      const watch: Watch = existing ?? { dirPath, noteId, count: 0, seq: 0, maintaining: false, maintainedAt: undefined }
      watch.count++
      if (!existing) {
        watches.set(key, watch)
        void read(key, true)
      }
      let stopped = false
      return () => {
        if (stopped) return
        stopped = true
        if (--watch.count > 0 || watches.get(key) !== watch) return
        watches.delete(key)
        setBlocks(key, null)
      }
    },

    refresh: (dirPath, opened = false) => read(agentDirKey(dirPath), opened),

    dismissTask: async (noteId, id) => {
      await settleNoteWrites(noteId)
      const note = useNotesStore.getState().notes.find((n) => n.id === noteId)
      if (!note || note.linked || agentIdsIn(note.sections).has(id)) return
      await retryWhenBusy(() => window.noteflow.agentTasksDismiss(note.filePath, id))
    },

    reconcileTask: async (noteId, id) => {
      await settleNoteWrites(noteId)
      const note = useNotesStore.getState().notes.find((n) => n.id === noteId)
      if (!note || note.linked || note.encryption || !agentIdsIn(note.sections).has(id)) return
      await retryWhenBusy(() => window.noteflow.agentTasksReconcile(note.filePath, id))
    },

    loadFolder: async (noteId) => {
      const state = await window.noteflow.agentRunGetFolder(noteId)
      set((s) => ({ folders: { ...s.folders, [noteId]: state } }))
    },

    setFolder: (noteId, folder) => set((s) => ({ folders: { ...s.folders, [noteId]: { folder, exists: true } } })),

    pickFolder: async (noteId) => {
      const res = await window.noteflow.agentRunPickFolder(noteId)
      if ('folder' in res) set((s) => ({ folders: { ...s.folders, [noteId]: { folder: res.folder, exists: true } } }))
    },

    clearFolder: async (noteId) => {
      await window.noteflow.agentRunClearFolder(noteId)
      set((s) => ({ folders: { ...s.folders, [noteId]: { folder: null, exists: false } } }))
    },
  }
})

/** Test hook: forgets every watch, the timer and the one-time load (the module state is shared across tests). */
export function resetAgentTasksStoreForTests(): void {
  resetRunInfo()
  watches.clear()
  loadPromise = null
  if (ticker) clearInterval(ticker)
  ticker = null
  useAgentTasksStore.setState({
    settings: DEFAULT_AGENT_TASK_SETTINGS, settingsLoaded: false, byDir: {}, byId: {}, pendingLoads: 0, now: Date.now(),
    runTerminal: null, runNode: null, folders: {},
  })
}
