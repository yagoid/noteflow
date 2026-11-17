import { useNotesStore } from '../stores/notesStore'
import { isDragEndOutsideWindow, noteOpenSectionId, type DragEndPoint } from '../lib/noteDragOut'

/**
 * dragend of ONE note dragged from a list (sidebar, content view): if nobody took the drop
 * (`dropEffect === 'none'`) and it was released outside this window, the note opens in its
 * own window — the same one as "Open in new window", placed near the pointer. A drop another
 * app accepted, or one inside the window, does nothing. Not for encrypted notes (their unlock
 * is per window, like the context menu). Returns whether it opened one.
 */
export function openNoteWindowOnDragOut(
  e: DragEndPoint & { dataTransfer: DataTransfer | null },
  noteId: string,
): boolean {
  if (!e.dataTransfer || e.dataTransfer.dropEffect !== 'none') return false
  if (!isDragEndOutsideWindow(e, window)) return false
  const { notes, activeSectionByNote } = useNotesStore.getState()
  const note = notes.find((n) => n.id === noteId)
  if (!note || note.encryption) return false
  const sectionId = noteOpenSectionId(note, activeSectionByNote[note.id])
  if (!sectionId) return false
  window.noteflow.openSectionWindow(note.id, sectionId, { nearCursor: true })
  return true
}
