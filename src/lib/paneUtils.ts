/**
 * Split-view layout model (pure — no store, no DOM; covered by tests/lib/paneUtils.test.ts).
 *
 * The editor area shows one or more PANES. A pane has its own id, so the same note can be
 * open in several panes at once, each on a different section. `sectionId` is the section
 * the pane is showing right now (NoteEditor keeps it up to date): it is what lets a pane
 * come back to its own section after a remount, and what "open this section alongside"
 * matches against to focus an existing pane instead of duplicating it.
 *
 * The store derives `activeNoteId` from the active pane (see notesStore `layoutState`).
 */

export interface OpenPane {
  paneId: string
  noteId: string
  sectionId?: string
}

export interface PaneLayout {
  panes: OpenPane[]
  activePaneId: string | null
}

export function getActivePane(layout: PaneLayout): OpenPane | null {
  return layout.panes.find((p) => p.paneId === layout.activePaneId) ?? null
}

/**
 * Note of the active pane. Falls back to the first pane when the active id is stale,
 * and to null for an empty layout.
 */
export function activeNoteOf(layout: PaneLayout): string | null {
  return (getActivePane(layout) ?? layout.panes[0])?.noteId ?? null
}

/** The pane of `noteId` that should react to an untargeted request: the active one, else the first. */
export function primaryPaneForNote(layout: PaneLayout, noteId: string): OpenPane | null {
  const active = getActivePane(layout)
  if (active?.noteId === noteId) return active
  return layout.panes.find((p) => p.noteId === noteId) ?? null
}

/**
 * Plain "open this note" (sidebar click, palette, navigation…): if the note is already
 * in a pane, focus that pane and keep the split; otherwise collapse to a single pane for
 * it. The single pane REUSES the active pane id so the editor stays mounted across note
 * switches (same as the pre-pane single editor).
 */
export function focusOrReplace(layout: PaneLayout, noteId: string, newPaneId: string): PaneLayout {
  const existing = primaryPaneForNote(layout, noteId)
  if (existing) {
    return existing.paneId === layout.activePaneId ? layout : { panes: layout.panes, activePaneId: existing.paneId }
  }
  return singlePane(layout, noteId, newPaneId)
}

/** Collapses the layout to ONE pane showing `noteId` (reusing the active pane id when there is one). */
export function singlePane(layout: PaneLayout, noteId: string, newPaneId: string): PaneLayout {
  const paneId = layout.activePaneId ?? newPaneId
  return { panes: [{ paneId, noteId }], activePaneId: paneId }
}

/**
 * Opens `noteId` (optionally on `sectionId`) in the split view.
 * - With a section: focuses a pane already showing exactly that note+section, otherwise
 *   appends a NEW pane — even when the note is already open in another pane. This is how
 *   two sections of the same note end up side by side.
 * - Without a section (whole note): focuses a pane that already shows the note, otherwise
 *   appends one. Opening a whole note twice would just duplicate the same view.
 */
export function openInSplit(
  layout: PaneLayout,
  noteId: string,
  sectionId: string | undefined,
  newPaneId: string,
): PaneLayout {
  const existing = sectionId
    ? layout.panes.find((p) => p.noteId === noteId && p.sectionId === sectionId) ?? null
    : primaryPaneForNote(layout, noteId)
  if (existing) {
    return existing.paneId === layout.activePaneId ? layout : { panes: layout.panes, activePaneId: existing.paneId }
  }
  const pane: OpenPane = sectionId ? { paneId: newPaneId, noteId, sectionId } : { paneId: newPaneId, noteId }
  return { panes: [...layout.panes, pane], activePaneId: newPaneId }
}

/**
 * Removes a pane. Closing the active pane focuses its right neighbour (or the new last
 * one). May return an empty layout — the caller decides the fallback note.
 */
export function closePane(layout: PaneLayout, paneId: string): PaneLayout {
  const index = layout.panes.findIndex((p) => p.paneId === paneId)
  if (index === -1) return layout
  const panes = layout.panes.filter((p) => p.paneId !== paneId)
  if (panes.length === 0) return { panes, activePaneId: null }
  if (layout.activePaneId !== paneId && panes.some((p) => p.paneId === layout.activePaneId)) {
    return { panes, activePaneId: layout.activePaneId }
  }
  return { panes, activePaneId: panes[Math.min(index, panes.length - 1)].paneId }
}

/**
 * Moves `paneId` so it lands before the pane currently at `targetIndex` (`panes.length`
 * = to the end). Indices are in the ORIGINAL array, as computed from the pointer while
 * dragging. Returns the same array when the move is a no-op.
 */
export function reorderPane(panes: OpenPane[], paneId: string, targetIndex: number): OpenPane[] {
  const fromIndex = panes.findIndex((p) => p.paneId === paneId)
  if (fromIndex === -1) return panes
  const clamped = Math.max(0, Math.min(targetIndex, panes.length))
  if (clamped === fromIndex || clamped === fromIndex + 1) return panes
  const next = [...panes]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(clamped > fromIndex ? clamped - 1 : clamped, 0, moved)
  return next
}

/** Records the section a pane is showing. Returns the same layout when nothing changes. */
export function setPaneSection(layout: PaneLayout, paneId: string, sectionId: string): PaneLayout {
  const pane = layout.panes.find((p) => p.paneId === paneId)
  if (!pane || pane.sectionId === sectionId) return layout
  return {
    panes: layout.panes.map((p) => (p.paneId === paneId ? { ...p, sectionId } : p)),
    activePaneId: layout.activePaneId,
  }
}

/**
 * Drops every pane whose note is in `removed` (deleted, pruned, vanished from disk).
 * The active pane survives if it can, else a neighbour takes over. When no pane is left
 * and `fallbackNoteId` is given, a single pane for it is created (reusing the old active
 * pane id so the editor isn't remounted).
 */
export function removeNotesFromLayout(
  layout: PaneLayout,
  removed: Set<string>,
  fallbackNoteId: string | null,
  newPaneId: string,
): PaneLayout {
  const panes = layout.panes.filter((p) => !removed.has(p.noteId))
  if (panes.length === 0) {
    if (!fallbackNoteId) return { panes: [], activePaneId: null }
    const paneId = layout.activePaneId ?? newPaneId
    return { panes: [{ paneId, noteId: fallbackNoteId }], activePaneId: paneId }
  }
  if (panes.length === layout.panes.length) return layout
  if (panes.some((p) => p.paneId === layout.activePaneId)) return { panes, activePaneId: layout.activePaneId }
  const oldIndex = Math.max(0, layout.panes.findIndex((p) => p.paneId === layout.activePaneId))
  // First surviving pane at or after the old position, else the last survivor.
  const after = layout.panes.slice(oldIndex).find((p) => !removed.has(p.noteId))
  return { panes, activePaneId: (after ?? panes[panes.length - 1]).paneId }
}

/**
 * Legacy "set the open notes" (one pane per id, in order). Existing panes are reused by
 * note — the active one first — so their editors aren't remounted and keep their section.
 * The first id without an existing pane takes over the active pane id (single-editor
 * continuity); the rest get ids from `makeId`. Unknown/duplicate ids must be filtered
 * by the caller.
 */
export function panesForNoteIds(
  layout: PaneLayout,
  noteIds: string[],
  makeId: () => string,
): PaneLayout {
  const used = new Set<string>()
  const takePane = (noteId: string): OpenPane | null => {
    const active = getActivePane(layout)
    if (active && active.noteId === noteId && !used.has(active.paneId)) return active
    return layout.panes.find((p) => p.noteId === noteId && !used.has(p.paneId)) ?? null
  }
  const panes: OpenPane[] = []
  const pending: number[] = []
  noteIds.forEach((noteId, i) => {
    const reused = takePane(noteId)
    if (reused) {
      used.add(reused.paneId)
      panes[i] = reused
    } else {
      pending.push(i)
    }
  })
  for (const i of pending) {
    const canReuseActive = layout.activePaneId !== null && !used.has(layout.activePaneId)
    const paneId = canReuseActive ? layout.activePaneId! : makeId()
    used.add(paneId)
    panes[i] = { paneId, noteId: noteIds[i] }
  }
  const activePaneId = panes.some((p) => p.paneId === layout.activePaneId)
    ? layout.activePaneId
    : panes[0]?.paneId ?? null
  return { panes, activePaneId }
}
