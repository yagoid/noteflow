import { useNotesStore } from '../../stores/notesStore'
import { primaryPaneForNote } from '../../lib/paneUtils'

/**
 * Inputs of `resolveOpenSectionId` (lib/sectionLine.ts) for the note the sidebar shows as
 * open (`noteViewId ?? activeNoteId`, the highlighted row): the section of the pane showing
 * it (`''` = a pane without one, `null` = no pane) and the one remembered for it. Two
 * primitive selectors, so typing doesn't re-render the lists that read them (the sidebar
 * rows and the collapsed-group peek).
 */
export function useOpenNoteSection(): { paneSectionId: string | null; rememberedSectionId: string | null } {
  const paneSectionId = useNotesStore((s) => {
    const id = s.noteViewId ?? s.activeNoteId
    if (!id) return null
    const pane = primaryPaneForNote({ panes: s.openPanes, activePaneId: s.activePaneId }, id)
    return pane ? pane.sectionId ?? '' : null
  })
  const rememberedSectionId = useNotesStore((s) => {
    const id = s.noteViewId ?? s.activeNoteId
    return id ? s.activeSectionByNote[id] ?? null : null
  })
  return { paneSectionId, rememberedSectionId }
}
