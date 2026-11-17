/**
 * "Drag a note out of the window → it opens in a new window" (pure — no store, no DOM;
 * covered by tests/lib/noteDragOut.test.ts). The wiring lives in
 * components/openNoteWindowOnDragOut.ts.
 */

/**
 * Section a note opens on when clicked with no pane showing it (NoteEditor's order):
 * the one last active in it if it still exists, else the first. It is also the section a
 * note's own window opens on ("Open in new window", or the note dragged out).
 */
export function noteOpenSectionId(
  note: { sections: ReadonlyArray<{ id: string }> },
  rememberedSectionId: string | null | undefined,
): string | undefined {
  return rememberedSectionId && note.sections.some((s) => s.id === rememberedSectionId)
    ? rememberedSectionId
    : note.sections[0]?.id
}

/** The dragend fields read: where the pointer was released (same shape as DOM/React events). */
export interface DragEndPoint {
  clientX: number
  clientY: number
  screenX: number
  screenY: number
}

/** The window's geometry, as `window` exposes it (CSS px, same space as the event coords). */
export interface WindowGeometry {
  innerWidth: number
  innerHeight: number
  screenX: number
  screenY: number
  outerWidth: number
  outerHeight: number
}

/**
 * Whether a drag ended with the pointer outside the window. Some platforms report 0,0 for
 * every coordinate of a dragend (Linux): that point is treated as unreliable → false. Both
 * the viewport (client) and the screen tests must agree, so a platform that gets one of them
 * wrong never opens a window by mistake.
 */
export function isDragEndOutsideWindow(p: DragEndPoint, win: WindowGeometry): boolean {
  const coords = [p.clientX, p.clientY, p.screenX, p.screenY]
  if (coords.some((c) => !Number.isFinite(c))) return false
  if (coords.every((c) => c === 0)) return false
  const outsideViewport = p.clientX < 0 || p.clientY < 0 || p.clientX >= win.innerWidth || p.clientY >= win.innerHeight
  const outsideScreenRect =
    p.screenX < win.screenX || p.screenY < win.screenY ||
    p.screenX >= win.screenX + win.outerWidth || p.screenY >= win.screenY + win.outerHeight
  return outsideViewport && outsideScreenRect
}
