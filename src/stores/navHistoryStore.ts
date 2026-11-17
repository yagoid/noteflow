import { create } from 'zustand'
import { useNotesStore } from './notesStore'
import { useGroupsStore } from './groupsStore'
import { buildPlaceContext, placeExists } from '../lib/contentView'
import { getActivePane } from '../lib/paneUtils'
import {
  type NavCheck,
  type NavHistory,
  type NavLocation,
  emptyNavHistory,
  equalLocation,
  locationNoteId,
  pushLocation,
  stepHistory,
} from '../lib/navHistory'

// Back / forward navigation of the main window (mouse side buttons, Alt+←/→, ⌘[ / ⌘]).
// It doesn't instrument the buttons that navigate: it watches the notes store — the single
// place that says what the main area shows — and records every change of location
// (lib/navHistory.ts has the rules). See "Historial de navegación" in .agents/context/patterns.md.

type NotesSnapshot = ReturnType<typeof useNotesStore.getState>

interface NavHistoryState {
  history: NavHistory
  back: () => void
  forward: () => void
}

/** True while a back / forward step is applied: the changes it makes are not new entries. */
let navigating = false

/**
 * What the main area shows. With a split, the active pane's note (the history follows the
 * focused pane). Null while there is nothing to show (no notes yet).
 */
export function currentLocation(s: NotesSnapshot): NavLocation | null {
  if (s.contentPlace) return { kind: 'content', place: s.contentPlace }
  if (s.brainViewOpen) return { kind: 'brain' }
  if (s.noteViewId) return { kind: 'overview', noteId: s.noteViewId }
  const pane = getActivePane({ panes: s.openPanes, activePaneId: s.activePaneId })
  const noteId = pane?.noteId ?? s.activeNoteId
  if (!noteId) return null
  const sectionId = (pane?.noteId === noteId ? pane.sectionId : undefined) ?? s.activeSectionByNote[noteId]
  return sectionId ? { kind: 'note', noteId, sectionId } : { kind: 'note', noteId }
}

/**
 * Whether a step may land on `loc`: a note that no longer exists (deleted, pruned, archived
 * away) or a group / folder that was removed is purged; a locked encrypted note is passed
 * over but kept (it may be unlocked later).
 */
function checkLocation(loc: NavLocation, notes: NotesSnapshot): NavCheck {
  const noteId = locationNoteId(loc)
  if (noteId) {
    const note = notes.notes.find((n) => n.id === noteId)
    if (!note) return 'purge'
    return note.encryption && !notes.sessionPasswords[noteId] ? 'skip' : 'ok'
  }
  if (loc.kind === 'content') {
    const { groups, folders } = useGroupsStore.getState()
    return placeExists(loc.place, buildPlaceContext(groups, folders)) ? 'ok' : 'purge'
  }
  return 'ok'
}

function showLocation(loc: NavLocation): void {
  const notes = useNotesStore.getState()
  switch (loc.kind) {
    case 'note': notes.openNoteInActivePane(loc.noteId, loc.sectionId); break
    case 'overview': notes.setNoteView(loc.noteId); break
    case 'content': notes.setContentView(loc.place); break
    case 'brain': notes.setBrainView(true); break
  }
}

export const useNavHistoryStore = create<NavHistoryState>((set, get) => {
  const step = (direction: -1 | 1) => {
    const notes = useNotesStore.getState()
    const { history, location } = stepHistory(get().history, direction, (loc) => checkLocation(loc, notes))
    set({ history })
    if (!location) return
    navigating = true
    try {
      showLocation(location)
    } finally {
      navigating = false
    }
  }
  return {
    history: emptyNavHistory(),
    back: () => step(-1),
    forward: () => step(1),
  }
})

/**
 * Starts recording the main window's locations (call once, from the main window only).
 * Returns the unsubscribe.
 */
export function startNavHistory(): () => void {
  const record = (s: NotesSnapshot) => {
    if (navigating) return
    const loc = currentLocation(s)
    if (!loc) return
    const { history } = useNavHistoryStore.getState()
    const current = history.entries[history.index]
    // Runs on every store change (each save too): bail out cheaply when nothing moved.
    if (current && equalLocation(current, loc)) return
    // A note the store doesn't hold (yet / anymore) is a transient state, not a place.
    const noteId = locationNoteId(loc)
    if (noteId && !s.notes.some((n) => n.id === noteId)) return
    useNavHistoryStore.setState({ history: pushLocation(history, loc) })
  }
  record(useNotesStore.getState())
  return useNotesStore.subscribe(record)
}
