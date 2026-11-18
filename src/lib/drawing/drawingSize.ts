// Size of a drawing card in the note: the `width` / `height` attributes of the block's
// opening marker (px), their limits, and the geometry of dragging a side handle. Pure.
//
// Width follows the images' rule (Editor/ResizableImage.tsx + "Image breakout" in
// index.css): without a width the card is as wide as the reading column; with one it sits
// left-aligned while it fits the column and, past it, grows centred on the column — each
// side half, into the gutters — up to the editor's content width. The CSS does the
// layout (`.drawing-card.is-sized`); this mirrors it so the handle stays under the cursor.
import { getKanbanAttr, setKanbanAttr } from '../kanban'

export const DRAWING_MIN_WIDTH = 160
export const DRAWING_MAX_WIDTH = 4000
export const DRAWING_MIN_HEIGHT = 80
export const DRAWING_MAX_HEIGHT = 1600
/** Height cap of a drawing with no stored size. */
export const DRAWING_DEFAULT_MAX_HEIGHT = 360

// A size as someone may have typed it in the marker: any case, quoted or not
// (`width=900`, `WIDTH="900"`). Groups: 1 = leading space, 2 / 3 / 4 = the value.
const looseAttr = (key: string) => new RegExp(`(^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"']+))`, 'gi')

function storedPx(attrs: string, key: string, min: number, max: number): number | null {
  const loose = looseAttr(key).exec(attrs)
  const raw = getKanbanAttr(attrs, key) ?? (loose ? loose[2] ?? loose[3] ?? loose[4] ?? null : null)
  if (raw === null || !/^\d+(?:\.\d+)?$/.test(raw.trim())) return null
  const n = Math.round(Number(raw))
  return n >= min ? Math.min(n, max) : null
}

/** The stored width in px (null = the reading column). Below the minimum or not a number: none. */
export const storedDrawingWidth = (attrs: string) => storedPx(attrs, 'width', DRAWING_MIN_WIDTH, DRAWING_MAX_WIDTH)
/** The stored height in px (null = the drawing's own, capped). */
export const storedDrawingHeight = (attrs: string) => storedPx(attrs, 'height', DRAWING_MIN_HEIGHT, DRAWING_MAX_HEIGHT)

/** The marker attributes with a size set (null removes it); every other attribute untouched. */
export function withDrawingSize(attrs: string, key: 'width' | 'height', px: number | null): string {
  // Any hand-written spelling of the same attribute goes first (all but the canonical
  // `key="…"`, edited in place): the marker never ends up with two of them.
  let canonical = false
  const cleaned = attrs.replace(looseAttr(key), (match: string, lead: string) => {
    if (!canonical && match.slice(lead.length).startsWith(`${key}="`)) { canonical = true; return match }
    return ''
  }).trim()
  return setKanbanAttr(cleaned, key, px === null ? null : String(Math.round(px)))
}

export interface WidthDrag {
  /** Which handle is being dragged. */
  side: 'left' | 'right'
  /** Pointer movement since the drag started (px, positive = right). */
  dx: number
  /** The card when the drag started. */
  start: { left: number; right: number }
  /** The reading column (the node's own box). */
  column: { left: number; width: number }
  /** Widest the card may get here (the editor's content width; the column in Full width). */
  max: number
}

/**
 * The width a drag asks for. Past the column the card is centred on it, so the dragged
 * edge moves with the cursor and the other mirrors it (width = twice the distance from the
 * column's centre); within the column the card is left-aligned: the right handle moves
 * its right edge, the left handle trades width one for one.
 */
export function drawingWidthFromDrag({ side, dx, start, column, max }: WidthDrag): number {
  const centre = column.left + column.width / 2
  const edge = side === 'right' ? start.right + dx : start.left + dx
  const centred = 2 * (side === 'right' ? edge - centre : centre - edge)
  let next: number
  if (centred > column.width) next = centred
  else if (side === 'right') next = edge - Math.max(start.left, column.left)
  else next = start.right - start.left - dx
  // Coming back in from a breakout, the left-aligned width can't exceed the column.
  if (centred <= column.width) next = Math.min(next, column.width)
  return Math.round(Math.max(DRAWING_MIN_WIDTH, Math.min(next, max, DRAWING_MAX_WIDTH)))
}
