// Where the "send to an agent" pill goes for a text selection
// (components/Editor/AgentSelectionButton.tsx, `position: fixed`). Pure
// geometry — covered by tests/lib/agentSelectionPlacement.test.ts.

export interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

/** Gap between the pill and the selected text, and its margin to the edges of the visible area. */
const GAP = 8
const MARGIN = 6

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, Math.max(min, max)))
}

/**
 * The pill's top-left corner, or null when the selection is out of sight.
 * `start` / `end`: the caret boxes at both ends of the selection; `area`: the
 * part of the window the note is visible in (its scroll box, cut to the
 * window). The pill never covers the selected text when there is room:
 *   1. above the selection's first line, from where the selection starts;
 *   2. else below its last line, ending where the selection ends;
 *   3. else (the selection fills the visible area — a "select all") in the
 *      top right corner of the area: it has to be somewhere.
 */
export function agentSelectionPillPosition(
  start: Box,
  end: Box,
  size: { width: number; height: number },
  area: Box,
): { top: number; left: number } | null {
  // Nothing of the selection is visible: scrolled away above or below.
  if (end.bottom <= area.top || start.top >= area.bottom) return null
  const minLeft = area.left + MARGIN
  const maxLeft = area.right - MARGIN - size.width

  const above = start.top - GAP - size.height
  if (above >= area.top + MARGIN && start.top <= area.bottom) {
    return { top: above, left: clamp(start.left, minLeft, maxLeft) }
  }
  const below = end.bottom + GAP
  if (below + size.height <= area.bottom - MARGIN && end.bottom >= area.top) {
    return { top: below, left: clamp(end.right - size.width, minLeft, maxLeft) }
  }
  return { top: area.top + MARGIN, left: Math.max(minLeft, maxLeft) }
}
