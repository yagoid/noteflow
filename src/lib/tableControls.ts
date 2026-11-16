// ── Table controls: geometry, drop targets and menus (pure) ──────────────────
//
// The note editor's table controls (components/Editor/TableControls.tsx: the
// handles on the column / row edges, the "+" bars, dragging a handle to
// reorder; TableMenu.tsx: the handle, right-click and toolbar menus) measure
// the DOM and run commands; everything they decide lives here, testable
// without a DOM (tests/lib/tableControls.test.ts).
//
// Coordinates: any one space (client px in the app — the UI zoom is native,
// so pointer coords and getBoundingClientRect() share it). A table is
// measured on its cells, not on the <table>: the <table> is the horizontal
// scroll box (display: block, index.css § Tables) and its <tbody> the box of
// the rows, so `body` is the <tbody>'s rect and `view` the <table>'s (the part
// of the rows that is visible horizontally).

import type { Messages } from '../i18n'
import { plural, tf } from '../i18n/format'
import { isNumericColumn, type SortDirection, type TableAlign } from './tableData'

// ── Geometry ─────────────────────────────────────────────────────────────────

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** A 1-D extent: a column's x range or a row's y range. */
export interface Span {
  start: number
  end: number
}

/** A rectangle of cells, `bottom` / `right` exclusive (like prosemirror-tables' Rect). */
export interface CellRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface TableGeometry {
  /** The rows' box (the <tbody>). */
  body: Box
  /** The table's scroll box (the <table>): what of `body` shows horizontally. */
  view: Box
  /** x extent of each column (the cells of row 0). */
  cols: Span[]
  /** y extent of each row (header first). */
  rows: Span[]
}

/** Column handles: inset from the column's sides (px). Row handles: from the row's top / bottom. */
export const COLUMN_HANDLE_INSET = 10
export const ROW_HANDLE_INSET = 6
/** A handle clipped shorter than this (a column almost scrolled out of view) isn't drawn. */
export const MIN_HANDLE_LENGTH = 6
/** "+" bars: gap from the table's edge and thickness (px). */
export const PLUS_GAP = 5
export const PLUS_SIZE = 18
/** The "+" bars show when the pointer is this close to the right / bottom edge (px, from inside). */
export const NEAR_RIGHT = 56
export const NEAR_BOTTOM = 28
/** Room around the rows that still counts as hovering the table: its handles and "+" bars (px). */
export const HOVER_GUTTER = { left: 16, top: 16, right: PLUS_GAP + PLUS_SIZE + 6, bottom: PLUS_GAP + PLUS_SIZE + 6 }

export const boxOf = (r: { left: number; top: number; right: number; bottom: number }): Box =>
  ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })

export const contains = (b: Box, x: number, y: number) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom

/** The visible part of the rows: `body` cut to the scroll box horizontally. */
export function visibleBody(g: TableGeometry): Box {
  return {
    left: Math.max(g.body.left, g.view.left),
    right: Math.min(g.body.right, g.view.right),
    top: g.body.top,
    bottom: g.body.bottom,
  }
}

/** Where the pointer still hovers the table: its visible rows plus the gutters of its handles and "+" bars. */
export function hoverZone(g: TableGeometry): Box {
  const v = visibleBody(g)
  return {
    left: v.left - HOVER_GUTTER.left,
    top: v.top - HOVER_GUTTER.top,
    right: v.right + HOVER_GUTTER.right,
    bottom: v.bottom + HOVER_GUTTER.bottom,
  }
}

/**
 * The column and row under the pointer, each on its own axis: over a column
 * handle (above the rows) only the column, over a row handle only the row.
 * A column scrolled out of the table's view isn't hot.
 */
export function hotLines(g: TableGeometry, x: number, y: number): { row: number | null; col: number | null } {
  const v = visibleBody(g)
  const col = x >= v.left && x <= v.right ? g.cols.findIndex((s) => x >= s.start && x < s.end) : -1
  const row = g.rows.findIndex((s) => y >= s.start && y < s.end)
  return { row: row < 0 ? null : row, col: col < 0 ? null : col }
}

/** Whether the pointer is close enough to the right / bottom edge to show that "+" bar. */
export function nearEdges(g: TableGeometry, x: number, y: number): { right: boolean; bottom: boolean } {
  const v = visibleBody(g)
  return {
    right: x > v.right - NEAR_RIGHT && y >= v.top - 4 && y <= v.bottom + 4,
    bottom: y > v.bottom - NEAR_BOTTOM && x >= v.left - 4 && x <= v.right + 4,
  }
}

/** `[start, end]` cut to `[min, max]`; null when what's left is shorter than `minLength`. */
export function clipSpan(start: number, end: number, min: number, max: number, minLength = MIN_HANDLE_LENGTH): Span | null {
  const s = Math.max(start, min)
  const e = Math.min(end, max)
  return e - s >= minLength ? { start: s, end: e } : null
}

/** The x extent of column `i`'s handle, inset and cut to the table's view; null if (nearly) out of view. */
export function columnHandleSpan(g: TableGeometry, i: number): Span | null {
  const c = g.cols[i]
  if (!c) return null
  return clipSpan(c.start + COLUMN_HANDLE_INSET, c.end - COLUMN_HANDLE_INSET, g.view.left, g.view.right)
}

/** The y extent of row `i`'s handle, inset. */
export function rowHandleSpan(g: TableGeometry, i: number): Span | null {
  const r = g.rows[i]
  if (!r) return null
  return clipSpan(r.start + ROW_HANDLE_INSET, r.end - ROW_HANDLE_INSET, -Infinity, Infinity, 1)
}

/**
 * Where the "+" bars go. Column bar: right of the visible rows, as tall as the
 * rows. When there's no room for it before `clip.right` (the scroller's
 * visible right edge — a wide table that fills the editor and scrolls), it
 * slides left just enough to fit, over the table's last visible pixels: it
 * stays visible and clickable, and still appends a column at the END of the
 * table. Row bar: below the rows, as wide as their visible part (not clamped:
 * the editor scrolls vertically, and its bottom padding always leaves room).
 */
export function plusBars(g: TableGeometry, clip: Box): { column: Box; row: Box } {
  const v = visibleBody(g)
  const colLeft = Math.max(v.left, Math.min(v.right + PLUS_GAP, clip.right - PLUS_SIZE - 2))
  return {
    column: { left: colLeft, right: colLeft + PLUS_SIZE, top: v.top, bottom: v.bottom },
    row: { left: v.left, right: v.right, top: v.bottom + PLUS_GAP, bottom: v.bottom + PLUS_GAP + PLUS_SIZE },
  }
}

// ── Dragging a handle ────────────────────────────────────────────────────────

/**
 * Where a dragged line would go. `gap` = the boundary the drop line is drawn on
 * (0 = before the first line … n = after the last); `to` = the final index for
 * moveRow / moveColumn. Both null when nothing would change (the line's own
 * gaps) or when `blocked` (a row over the header: nothing goes above it).
 */
export interface DropTarget {
  gap: number | null
  to: number | null
  blocked: boolean
}

/** Coordinate of boundary `gap` between `spans` (0 = start of the first, k = end of the k-th). */
export function gapPosition(spans: readonly Span[], gap: number): number {
  return gap === 0 ? spans[0].start : spans[gap - 1].end
}

function nearestGap(spans: readonly Span[], at: number, first: number): number {
  let best = first
  let dist = Infinity
  for (let k = first; k <= spans.length; k++) {
    const d = Math.abs(at - gapPosition(spans, k))
    if (d < dist) { dist = d; best = k }
  }
  return best
}

function target(gap: number, from: number): DropTarget {
  if (gap === from || gap === from + 1) return { gap: null, to: null, blocked: false }
  return { gap, to: gap > from ? gap - 1 : gap, blocked: false }
}

/** Dropping column `from` with the pointer at `x`: the nearest boundary between columns. */
export function columnDropTarget(cols: readonly Span[], from: number, x: number): DropTarget {
  if (!cols.length) return { gap: null, to: null, blocked: false }
  return target(nearestGap(cols, x, 0), from)
}

/**
 * Dropping body row `from` with the pointer at `y`: the nearest boundary below
 * the header (gap ≥ 1). Over the header row it's blocked: no target at all.
 */
export function rowDropTarget(rows: readonly Span[], from: number, y: number): DropTarget {
  if (rows.length < 2) return { gap: null, to: null, blocked: false }
  if (y < rows[0].end) return { gap: null, to: null, blocked: true }
  return target(nearestGap(rows, y, 1), from)
}

// ── Menu placement ───────────────────────────────────────────────────────────

/**
 * - `below`: under the anchor, left-aligned (a column handle, the toolbar
 *   button); above it when it doesn't fit below.
 * - `right`: right of the anchor, top-aligned (a row handle); left of it when
 *   it doesn't fit.
 * - `point`: at the pointer (`anchor` = a zero-size box), down-right of it;
 *   up / left of it when it doesn't fit.
 */
export type MenuPlacement = 'below' | 'right' | 'point'

export const MENU_MARGIN = 8

/** Tallest a menu may be in a `viewportHeight` window (index.css `.nf-table-menu`: calc(100vh - 16px)). */
export const menuMaxHeight = (viewportHeight: number) => Math.max(0, viewportHeight - 2 * MENU_MARGIN)

/**
 * Top-left corner of a `size` menu next to `anchor`, always inside the
 * `viewport` (MENU_MARGIN from its edges). A menu taller than the viewport is
 * placed at its capped height — `menuMaxHeight`, the CSS max-height of
 * `.nf-table-menu` (it scrolls inside) — so its end is never cut off.
 */
export function placeMenu(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: MenuPlacement,
): { left: number; top: number } {
  const w = size.width
  const h = Math.min(size.height, menuMaxHeight(viewport.height))
  const maxX = viewport.width - MENU_MARGIN - w
  const maxY = viewport.height - MENU_MARGIN - h
  let x: number
  let y: number
  if (placement === 'below') {
    x = anchor.left
    y = anchor.bottom + 6
    if (y > maxY) y = anchor.top - 6 - h
  } else if (placement === 'right') {
    x = anchor.right + 6
    y = anchor.top - 4
    if (x > maxX) x = anchor.left - 6 - w
  } else {
    x = anchor.left + 2
    y = anchor.top + 2
    if (x > maxX) x = anchor.left - 2 - w
    if (y > maxY) y = anchor.top - 2 - h
  }
  return {
    left: Math.max(MENU_MARGIN, Math.min(x, maxX)),
    top: Math.max(MENU_MARGIN, Math.min(y, maxY)),
  }
}

// ── Menus ────────────────────────────────────────────────────────────────────

/** What a menu entry does, on the table the menu belongs to (mapped to a command by tableOps.tableActionCommand). */
export type TableAction =
  | { type: 'insertRow'; index: number }
  | { type: 'insertColumn'; index: number }
  | { type: 'duplicateRow'; index: number }
  | { type: 'duplicateColumn'; index: number }
  | { type: 'moveRow'; from: number; to: number }
  | { type: 'moveColumn'; from: number; to: number }
  | { type: 'sort'; column: number; direction: SortDirection }
  | { type: 'align'; column: number; align: TableAlign }
  | { type: 'clearRow'; index: number }
  | { type: 'clearColumn'; index: number }
  | { type: 'clearSelection' }
  | { type: 'deleteRow'; index: number }
  | { type: 'deleteColumn'; index: number }
  | { type: 'deleteTable' }

export type TableMenuIcon =
  | 'insertLeft' | 'insertRight' | 'insertAbove' | 'insertBelow' | 'duplicate'
  | 'moveLeft' | 'moveRight' | 'moveUp' | 'moveDown'
  | 'sortAsc' | 'sortDesc' | 'sortNumAsc' | 'sortNumDesc'
  | 'clear' | 'delete' | 'deleteTable'

export interface TableMenuItem {
  type: 'item'
  /** Stable key (React) — also what tests look entries up by. */
  id: string
  icon: TableMenuIcon
  label: string
  action: TableAction
  disabled: boolean
  /** Tooltip of a disabled entry: why it can't run. */
  reason?: string
  danger?: boolean
  /** Keyboard shortcut hint (none yet: the table shortcuts come later). */
  kbd?: string
}

export type TableMenuEntry =
  | { type: 'heading'; label: string }
  | { type: 'separator' }
  | { type: 'note'; text: string }
  | { type: 'align'; column: number; current: TableAlign }
  | TableMenuItem

/** Whether an action can run now (canRunTableCommand of its command, in the app). */
export type CanRun = (action: TableAction) => boolean

/** What the menus read of the table: its cell texts, header row first, and alignments. */
export interface TableMenuData {
  rows: readonly (readonly string[])[]
  aligns: readonly TableAlign[]
}

type TableMessages = Messages['editor']['table']

const sep = (): TableMenuEntry => ({ type: 'separator' })

function item(
  can: CanRun,
  id: string,
  icon: TableMenuIcon,
  label: string,
  action: TableAction,
  opts: { reason?: string; danger?: boolean } = {},
): TableMenuItem {
  const disabled = !can(action)
  return {
    type: 'item', id, icon, label, action, disabled,
    ...(disabled && opts.reason ? { reason: opts.reason } : {}),
    ...(opts.danger ? { danger: true } : {}),
  }
}

const bodyColumn = (data: TableMenuData, col: number) => data.rows.slice(1).map((r) => r[col] ?? '')
const bodyRows = (data: TableMenuData) => Math.max(0, data.rows.length - 1)
const columnCount = (data: TableMenuData) => data.rows[0]?.length ?? 0

/** Label of column `col` (its header text, or "Column N"), and of row `row` (the ghost of a drag: its first non-empty cell, or "Row N"). */
export function columnName(data: TableMenuData, col: number, m: TableMessages): string {
  return data.rows[0]?.[col]?.trim() || tf(m.columnN, { n: col + 1 })
}
export function rowName(data: TableMenuData, row: number, m: TableMessages): string {
  if (row === 0) return m.header
  return data.rows[row]?.find((v) => v.trim())?.trim() || tf(m.rowN, { n: row })
}

function sortItems(data: TableMenuData, col: number, can: CanRun, m: TableMessages, long: boolean): TableMenuItem[] {
  const numeric = isNumericColumn(bodyColumn(data, col))
  const reason = bodyRows(data) < 2 ? m.sortNeedsRows : undefined
  const asc = long ? (numeric ? m.sortByNumAsc : m.sortByAsc) : (numeric ? m.sortNumAsc : m.sortAsc)
  const desc = long ? (numeric ? m.sortByNumDesc : m.sortByDesc) : (numeric ? m.sortNumDesc : m.sortDesc)
  return [
    item(can, 'sortAsc', numeric ? 'sortNumAsc' : 'sortAsc', asc, { type: 'sort', column: col, direction: 'asc' }, { reason }),
    item(can, 'sortDesc', numeric ? 'sortNumDesc' : 'sortDesc', desc, { type: 'sort', column: col, direction: 'desc' }, { reason }),
  ]
}

const deleteColumnItem = (data: TableMenuData, col: number, can: CanRun, m: TableMessages) =>
  item(can, 'deleteColumn', 'delete', m.deleteColumn, { type: 'deleteColumn', index: col }, {
    danger: true,
    reason: columnCount(data) <= 1 ? m.needsOneColumn : undefined,
  })

/** The menu of column `col`'s handle. */
export function columnMenu(data: TableMenuData, col: number, can: CanRun, m: TableMessages): TableMenuEntry[] {
  return [
    { type: 'heading', label: data.rows[0]?.[col]?.trim() ? tf(m.columnTitle, { name: data.rows[0][col].trim() }) : tf(m.columnN, { n: col + 1 }) },
    item(can, 'insertLeft', 'insertLeft', m.insertLeft, { type: 'insertColumn', index: col }),
    item(can, 'insertRight', 'insertRight', m.insertRight, { type: 'insertColumn', index: col + 1 }),
    item(can, 'duplicateColumn', 'duplicate', m.duplicateColumn, { type: 'duplicateColumn', index: col }),
    sep(),
    item(can, 'moveLeft', 'moveLeft', m.moveLeft, { type: 'moveColumn', from: col, to: col - 1 }),
    item(can, 'moveRight', 'moveRight', m.moveRight, { type: 'moveColumn', from: col, to: col + 1 }),
    sep(),
    { type: 'align', column: col, current: data.aligns[col] ?? null },
    ...sortItems(data, col, can, m, false),
    sep(),
    item(can, 'clearColumn', 'clear', m.clearColumn, { type: 'clearColumn', index: col }),
    deleteColumnItem(data, col, can, m),
  ]
}

/** The menu of row `row`'s handle (row 0 = the header: same entries, the impossible ones disabled, plus a note). */
export function rowMenu(row: number, can: CanRun, m: TableMessages): TableMenuEntry[] {
  const header = row === 0
  const fixed = header ? m.headerFixed : undefined
  const entries: TableMenuEntry[] = [
    { type: 'heading', label: header ? m.header : tf(m.rowN, { n: row }) },
    item(can, 'insertAbove', 'insertAbove', m.insertAbove, { type: 'insertRow', index: row }, { reason: fixed }),
    item(can, 'insertBelow', 'insertBelow', m.insertBelow, { type: 'insertRow', index: row + 1 }),
    item(can, 'duplicateRow', 'duplicate', m.duplicateRow, { type: 'duplicateRow', index: row }, { reason: fixed }),
    sep(),
    item(can, 'moveUp', 'moveUp', m.moveUp, { type: 'moveRow', from: row, to: row - 1 }, { reason: header ? fixed : row === 1 ? m.onlyHeaderAbove : undefined }),
    item(can, 'moveDown', 'moveDown', m.moveDown, { type: 'moveRow', from: row, to: row + 1 }, { reason: fixed }),
    sep(),
    item(can, 'clearRow', 'clear', header ? m.clearHeader : m.clearRow, { type: 'clearRow', index: row }),
    item(can, 'deleteRow', 'delete', m.deleteRow, { type: 'deleteRow', index: row }, { danger: true, reason: fixed }),
  ]
  if (header) entries.push(sep(), { type: 'note', text: m.headerNote })
  return entries
}

/**
 * The menu of a cell (right-click, or the toolbar's table button on the active
 * cell): its row and column, "Clear N cells" when a CellSelection of 2+ cells
 * is `selection`, and Delete table. Without `data` (a table the commands
 * can't edit: merged cells from pasted HTML) only Delete table.
 */
export function cellMenu(
  data: TableMenuData | null,
  cell: { row: number; col: number },
  selection: CellRect | null,
  can: CanRun,
  m: TableMessages,
): TableMenuEntry[] {
  const deleteTable = item(can, 'deleteTable', 'deleteTable', m.deleteTable, { type: 'deleteTable' }, { danger: true })
  if (!data) return [deleteTable]
  const { row, col } = cell
  const fixed = row === 0 ? m.headerFixed : undefined
  const entries: TableMenuEntry[] = [
    { type: 'heading', label: m.rowGroup },
    item(can, 'insertRowAbove', 'insertAbove', m.insertRowAbove, { type: 'insertRow', index: row }, { reason: fixed }),
    item(can, 'insertRowBelow', 'insertBelow', m.insertRowBelow, { type: 'insertRow', index: row + 1 }),
    item(can, 'duplicateRow', 'duplicate', m.duplicateRow, { type: 'duplicateRow', index: row }, { reason: fixed }),
    item(can, 'deleteRow', 'delete', m.deleteRow, { type: 'deleteRow', index: row }, { danger: true, reason: fixed }),
    { type: 'heading', label: m.columnGroup },
    item(can, 'insertColumnLeft', 'insertLeft', m.insertColumnLeft, { type: 'insertColumn', index: col }),
    item(can, 'insertColumnRight', 'insertRight', m.insertColumnRight, { type: 'insertColumn', index: col + 1 }),
    item(can, 'duplicateColumn', 'duplicate', m.duplicateColumn, { type: 'duplicateColumn', index: col }),
    deleteColumnItem(data, col, can, m),
    { type: 'align', column: col, current: data.aligns[col] ?? null },
    ...sortItems(data, col, can, m, true),
  ]
  const count = selection ? (selection.bottom - selection.top) * (selection.right - selection.left) : 0
  if (count >= 2) {
    entries.push(sep(), item(can, 'clearCells', 'clear', plural(m.clearCells, count), { type: 'clearSelection' }))
  }
  entries.push(sep(), deleteTable)
  return entries
}

/** The entries the keyboard walks (↑/↓): enabled items, in order. */
export function focusableItems(entries: readonly TableMenuEntry[]): TableMenuItem[] {
  return entries.filter((e): e is TableMenuItem => e.type === 'item' && !e.disabled)
}

/** The next keyboard-focused item index after ↑ (-1) / ↓ (+1), wrapping; from none (-1), ↓ goes to the first and ↑ to the last. */
export function stepFocus(current: number, count: number, delta: 1 | -1): number {
  if (count === 0) return -1
  if (current < 0) return delta > 0 ? 0 : count - 1
  return (current + delta + count) % count
}
