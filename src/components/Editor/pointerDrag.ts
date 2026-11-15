// Shared bits of the editor's own pointer-event drag & drop (kanban cards and
// columns in KanbanBoardView.tsx, task items in taskDrag.ts). HTML5 DnD is not
// used: ProseMirror intercepts the drop and the native ghost looks bad.
//
// Coordinates: the UI text size is a native page zoom, so pointer client
// coords, getBoundingClientRect() and the ghost's / indicators' CSS px all
// share one space — see "UI text size" in patterns.md.

/** Pointer travel (px) before a press becomes a drag. */
export const DRAG_THRESHOLD = 4
/** Distance (px) from a scroller's edge where dragging auto-scrolls it. */
export const EDGE_SCROLL_ZONE = 48
/** Auto-scroll step (px per frame). */
export const EDGE_SCROLL_SPEED = 14

/** Nearest ancestor that scrolls vertically (the editor's scroller). */
export function verticalScroller(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/** One auto-scroll step of `scroller` when `y` is near its top/bottom edge. */
export function edgeScrollVertical(scroller: HTMLElement | null, y: number) {
  if (!scroller) return
  const r = scroller.getBoundingClientRect()
  if (y < r.top + EDGE_SCROLL_ZONE) scroller.scrollTop -= EDGE_SCROLL_SPEED
  else if (y > r.bottom - EDGE_SCROLL_ZONE) scroller.scrollTop += EDGE_SCROLL_SPEED
}

/** The click that follows a drop's pointerup must not reach what's under it (open a card, toggle a checkbox). */
export function swallowNextClick() {
  const swallow = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault() }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}
