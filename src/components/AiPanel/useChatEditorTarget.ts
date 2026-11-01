import { useEffect } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useAiChatStore } from '../../stores/aiChatStore'
import { sameEditorTarget } from '../../lib/chatContext'
import type { ChatEditorTarget } from '../../types'

/** The note/section shown by the main window's active pane, as the chat's context bar needs it. */
function readEditorTarget(): ChatEditorTarget | null {
  const s = useNotesStore.getState()
  const pane = s.openPanes.find((p) => p.paneId === s.activePaneId)
  const noteId = pane?.noteId ?? s.activeNoteId
  const note = noteId ? s.notes.find((n) => n.id === noteId) : undefined
  if (!note) return null
  const active = s.getActiveSectionTarget()
  const section = active && active.noteId === note.id ? note.sections.find((x) => x.id === active.sectionId) : undefined
  return {
    noteId: note.id,
    noteTitle: note.title,
    ...(section ? { sectionId: section.id, sectionName: section.name } : {}),
    encrypted: !!note.encryption,
    sectionAiHidden: !!section?.aiHidden,
  }
}

/**
 * Main window: keeps aiChatStore.editorTarget in step with the active pane and reports every
 * change to main, which relays it to the detached chat window (if any).
 */
export function useSyncChatEditorTarget(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let last: ChatEditorTarget | null | undefined
    const update = () => {
      const next = readEditorTarget()
      if (last !== undefined && sameEditorTarget(last, next)) return
      last = next
      useAiChatStore.getState().setEditorTarget(next)
      window.noteflow.aiChatWindowSetEditorTarget(next)
    }
    update()
    return useNotesStore.subscribe(update)
  }, [enabled])
}
