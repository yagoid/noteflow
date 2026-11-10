import { useNotesStore } from '../../stores/notesStore'
import type { EditorHistorySnapshot } from '../../lib/editorHistory'
import {
  createUndoHistoryCache,
  isUndoHistoryKeepable,
  pruneUndoHistory,
  type RawUndoHistory,
} from '../../lib/undoHistoryCache'

/**
 * This window's per-section undo/redo histories (lib/undoHistoryCache.ts): the rich
 * editor's (snapshotted when its Editor unmounts, restored when it mounts again) and
 * the text-mode buffer's (live: NoteEditor edits them in place). One per renderer —
 * a section window has its own.
 */
export const richUndoHistory = createUndoHistoryCache<EditorHistorySnapshot>()
export const rawUndoHistory = createUndoHistoryCache<RawUndoHistory>()

/** Whether this section may store undo history now (see isUndoHistoryKeepable). */
export function canKeepUndoHistory(noteId: string, sectionId: string): boolean {
  const { notes, sessionPasswords } = useNotesStore.getState()
  return isUndoHistoryKeepable(notes.find((n) => n.id === noteId), sessionPasswords, sectionId)
}

// A deleted note/section, or a note locked or encrypted, loses its histories (they
// hold its plaintext). Synchronous with the store update, so before the editors it
// unmounts snapshot theirs — which is why they check canKeepUndoHistory first.
useNotesStore.subscribe((state, prev) => {
  if (state.notes === prev.notes && state.sessionPasswords === prev.sessionPasswords) return
  pruneUndoHistory(richUndoHistory, state.notes, state.sessionPasswords)
  pruneUndoHistory(rawUndoHistory, state.notes, state.sessionPasswords)
})
