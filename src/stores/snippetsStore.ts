import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Snippet } from '../types'
import { applyPendingEdits, moveSnippet, setDefaultSnippet, type PendingSnippetEdits } from '../lib/snippets'

// Editor snippets (toolbar "Snippets" button and the "/" menu) — persisted to
// snippets.json in the notes dir (IPC snippets:get/set, synced). Loaded lazily
// by the first rich editor created in the window (SlashCommands' onCreate: main,
// section and sticky windows) or the toolbar button, whichever comes first; that
// first call also subscribes this window to changes: `snippets-updated` (another window saved) and a path-less
// `notes-updated` (a pull may have brought a new snippets.json). Edits autosave:
// structural changes write at once, typing in the modal is debounced. A reload
// that lands while typed edits are unwritten takes the disk list and re-applies
// those edits on top (applyPendingEdits) — never the other way round, which
// would push this window's stale list over the other window's / remote changes.

interface SnippetsState {
  snippets: Snippet[]
  loaded: boolean

  /** First call loads + subscribes to external changes; later calls are no-ops. */
  ensureLoaded: () => Promise<void>
  loadSnippets: () => Promise<void>
  addSnippet: (data: { name: string; content: string }) => Snippet
  /** Name/content edits from the modal: persisted after a short debounce. */
  updateSnippet: (id: string, patch: { name?: string; content?: string }) => void
  deleteSnippet: (id: string) => void
  setDefault: (id: string) => void
  move: (id: string, delta: -1 | 1) => void
  /** Writes a pending debounced edit now (the modal calls it on close). */
  flush: () => Promise<void>
}

const TYPING_DEBOUNCE_MS = 400

let persistTimer: ReturnType<typeof setTimeout> | null = null
// Typed name/content edits not yet confirmed on disk, by snippet id. Each edit
// stores a NEW patch object, so a write only clears the patches it carried.
const pendingEdits: PendingSnippetEdits = new Map()
// A disk read that overlaps one of our own writes may predate it (and miss an
// add/delete/reorder just saved): it is discarded and redone once writes settle.
let writeSeq = 0
let writesInFlight = 0
let reloadAfterWrites = false
let subscribed = false
let loadPromise: Promise<void> | null = null

export const useSnippetsStore = create<SnippetsState>((set, get) => {
  const writeNow = async () => {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    // Kept until the write lands: a reload read meanwhile may predate it.
    const carried = new Map(pendingEdits)
    writeSeq++
    writesInFlight++
    try {
      await window.noteflow.setSnippets(get().snippets)
      for (const [id, patch] of carried) {
        if (pendingEdits.get(id) === patch) pendingEdits.delete(id)
      }
    } finally {
      writesInFlight--
      if (writesInFlight === 0 && reloadAfterWrites) {
        reloadAfterWrites = false
        void get().loadSnippets()
      }
    }
  }

  const persist = (debounced: boolean) => {
    if (persistTimer) clearTimeout(persistTimer)
    if (!debounced) { persistTimer = null; void writeNow(); return }
    persistTimer = setTimeout(() => { void writeNow() }, TYPING_DEBOUNCE_MS)
  }

  const commit = (snippets: Snippet[], debounced = false) => {
    set({ snippets })
    persist(debounced)
  }

  return {
    snippets: [],
    loaded: false,

    ensureLoaded: () => {
      if (!subscribed && window.noteflow) {
        subscribed = true
        const reload = () => { void get().loadSnippets() }
        window.noteflow.onSnippetsUpdated?.(reload)
        window.noteflow.onNotesUpdated?.((filePath) => { if (!filePath) reload() })
      }
      if (!loadPromise) loadPromise = get().loadSnippets()
      return loadPromise
    },

    loadSnippets: async () => {
      const seq = writeSeq
      const disk = await window.noteflow.getSnippets()
      if (writesInFlight > 0 || seq !== writeSeq) {
        if (writesInFlight > 0) reloadAfterWrites = true
        else void get().loadSnippets()
        return
      }
      // Unwritten typed edits win only for their own fields; the pending
      // debounced write (if any) then saves the merged list.
      set({ snippets: applyPendingEdits(disk, pendingEdits), loaded: true })
    },

    addSnippet: ({ name, content }) => {
      const snippet: Snippet = { id: nanoid(8), name, content, createdAt: new Date().toISOString() }
      commit([...get().snippets, snippet])
      return snippet
    },

    updateSnippet: (id, patch) => {
      pendingEdits.set(id, { ...pendingEdits.get(id), ...patch })
      commit(get().snippets.map((s) => (s.id === id ? { ...s, ...patch } : s)), true)
    },

    deleteSnippet: (id) => {
      commit(get().snippets.filter((s) => s.id !== id))
    },

    setDefault: (id) => {
      commit(setDefaultSnippet(get().snippets, id))
    },

    move: (id, delta) => {
      commit(moveSnippet(get().snippets, id, delta))
    },

    flush: async () => {
      if (persistTimer) await writeNow()
    },
  }
})
