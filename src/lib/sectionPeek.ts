// Geometry of a sidebar note row's section peek (Sidebar/NoteSectionMap.tsx +
// Sidebar/sectionPeekEngine.ts): where the floating map goes beside the list, and the
// "menu-aim" triangle that lets the pointer cross other rows on its way to it.

export interface Point { x: number; y: number }

/** Gap (px) between the list's right edge and the peek. */
export const SECTION_PEEK_GAP = 6
/** The peek's width beside the list (wider than the line: more cells fit per row). */
export const SECTION_PEEK_WIDTH = 312
/** Narrowest the peek may get beside the list; below that it opens over the line. */
export const SECTION_PEEK_MIN_WIDTH = 200
/** Minimum distance (px) kept from the viewport edges. */
export const SECTION_PEEK_MARGIN = 8
/** The peek's top sits this far above the row's top (its cells line up with the title). */
const ROW_TOP_OFFSET = 2
/** The aim triangle reaches this far above and below the peek's left edge. */
export const AIM_TRIANGLE_PAD = 8

/**
 * The peek's horizontal span beside the list: just right of the list's right edge (+ gap),
 * as wide as SECTION_PEEK_WIDTH or what is left of the window. Null when not even the
 * minimum fits, or when the room beside is narrower than the peek over the row's line
 * would be (`overWidth`: a wide sidebar in a narrow window — beside, the cells would
 * wrap into more rows than over the line): the caller opens it over the line instead.
 * Decided once, on open.
 */
export function sectionPeekSideSpan(
  surfaceRight: number,
  viewportWidth: number,
  overWidth = 0,
): { left: number; width: number } | null {
  const left = surfaceRight + SECTION_PEEK_GAP
  const width = Math.min(SECTION_PEEK_WIDTH, viewportWidth - SECTION_PEEK_MARGIN - left)
  if (width < Math.max(SECTION_PEEK_MIN_WIDTH, Math.min(SECTION_PEEK_WIDTH, overWidth))) return null
  return { left: Math.round(left), width: Math.floor(width) }
}

/** The peek's top beside the list: level with the row, pushed up when it would overflow the bottom. */
export function sectionPeekSideTop(rowTop: number, height: number, viewportHeight: number): number {
  let top = rowTop - ROW_TOP_OFFSET
  if (top + height > viewportHeight - SECTION_PEEK_MARGIN) top = viewportHeight - SECTION_PEEK_MARGIN - height
  return Math.round(Math.max(SECTION_PEEK_MARGIN, top))
}

/**
 * Whether a scroll on `scroller` moves any of `rows` (the pending / open peek's rows;
 * missing ones skipped): the page itself ('document') moves them all, an element only the
 * rows inside it.
 */
export function scrollMovesRows<T>(
  scroller: 'document' | { contains: (node: T) => boolean },
  rows: readonly (T | null | undefined)[],
): boolean {
  const present = rows.filter((r): r is T => r != null)
  if (present.length === 0) return false
  return scroller === 'document' || present.some((r) => scroller.contains(r))
}

/**
 * The aim triangle: from the pointer's last position inside the open row to the peek's
 * left edge, a little taller than the peek. While the pointer stays inside it, it is
 * heading for the peek and the rows it crosses don't take over.
 */
export function aimTriangle(apex: Point, panel: { left: number; top: number; bottom: number }): [Point, Point, Point] {
  return [
    apex,
    { x: panel.left, y: panel.top - AIM_TRIANGLE_PAD },
    { x: panel.left, y: panel.bottom + AIM_TRIANGLE_PAD },
  ]
}

/** Whether `p` lies inside (or on an edge of) the triangle `abc`, in either winding. */
export function pointInTriangle(p: Point, [a, b, c]: [Point, Point, Point]): boolean {
  const side = (p1: Point, p2: Point, p3: Point) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
  const d1 = side(p, a, b)
  const d2 = side(p, b, c)
  const d3 = side(p, c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}
