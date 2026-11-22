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
 * window); `after`: the empty stretch right of the selection's last line —
 * from where the text on that line ends to where something else starts (a
 * task's date or agent chip, the edge of the area) — or null when that line
 * is full or unknown. The pill covers neither the selected text nor the lines
 * around it when there is room:
 *   1. right of the selection's last line, in its empty stretch, centred on
 *      the line (selecting whole lines or tasks — the usual — leaves room);
 *   2. else above the selection's first line, from where the selection starts
 *      (over the line above: the only way left not to cover the selection);
 *   3. else below its last line, ending where the selection ends;
 *   4. else (the selection fills the visible area — a "select all") in the
 *      top right corner of the area: it has to be somewhere.
 */
export function agentSelectionPillPosition(
  start: Box,
  end: Box,
  size: { width: number; height: number },
  area: Box,
  after: { left: number; right: number } | null = null,
): { top: number; left: number } | null {
  // Nothing of the selection is visible: scrolled away above or below.
  if (end.bottom <= area.top || start.top >= area.bottom) return null
  const minLeft = area.left + MARGIN
  const maxLeft = area.right - MARGIN - size.width

  if (after) {
    const left = Math.max(after.left, end.right) + GAP
    const right = Math.min(after.right - GAP, area.right - MARGIN)
    const top = (end.top + end.bottom) / 2 - size.height / 2
    if (left >= minLeft && left + size.width <= right && top >= area.top + MARGIN && top + size.height <= area.bottom - MARGIN) {
      return { top, left }
    }
  }

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
