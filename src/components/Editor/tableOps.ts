// ── Table operations (document commands, no UI) ──────────────────────────────
//
// ProseMirror-style commands — `(state, dispatch?) => boolean` — for the note
// editor's tables, testable without a view. Without `dispatch` a command only
// answers whether it can run (to enable / disable a menu entry); with it, it
// dispatches ONE transaction (one Ctrl+Z). runTableCommand / canRunTableCommand
// adapt them to a TipTap Editor.
//
// Which table: commands that take indices act on `target.tablePos` (the
// position right before the table node, for handles drawn on a given table)
// or, by default, on the innermost table around the selection (like
// setColumnAlign in tableUtils.ts). Commands named "Selected" always act on the
// selection: a CellSelection, or the cell holding the cursor.
//
// Invariants (markdown pipe tables, src/lib/markdownHtml.ts): row 0 is the
// header (tableHeader cells), fixed and mandatory; every other row holds
// tableCell cells; alignment is per column (the header cell's textAlign is
// what gets saved; every cell carries it). Structural commands rebuild the
// table's rows and normalize cell types to that invariant. Tables with merged
// cells (only possible from pasted HTML) are rejected by every command.
// Decisions are documented in .agents/context/patterns.md ("Operaciones de
// tabla").

import type { Editor } from '@tiptap/core'
import { Fragment, type Node as PMNode, type NodeType, type ResolvedPos } from '@tiptap/pm/model'
import {
  NodeSelection, Selection, TextSelection,
  type Command, type EditorState, type Transaction,
} from '@tiptap/pm/state'
import { CellSelection, TableMap, tableNodeTypes, type Rect } from '@tiptap/pm/tables'
import { sortOrder, type SortDirection, type TableAlign } from '../../lib/tableData'

/**
 * Fewest columns a table may be left with by deleteSelectedColumns: the limit
 * only keeps the table from ending up with no columns. A one-column pipe table
 * (`| a |` / `| --- |`) is read back as a table by the markdown loader
 * (isTableStart in lib/markdownHtml.ts), so it survives saving and reopening
 * the note.
 */
export const MIN_TABLE_COLUMNS = 1

export interface TableTarget {
  /** Position right before the table node. Default: the innermost table around the selection. */
  tablePos?: number
}

export interface TableTextData {
  /** Cell texts, row-major (a cell's blocks and hard breaks joined with '\n'). */
  rows: string[][]
  /** Alignment of each of those columns (read from the header cell). */
  aligns: TableAlign[]
}

interface TableInfo {
  node: PMNode
  /** Position before the table node. */
  pos: number
  /** Position of the table's content (pos + 1): TableMap offsets are relative to it. */
  start: number
  map: TableMap
}

type Cell = [row: number, col: number]
/** Where the cell at (row, col) of the old table is in the new one (null = gone). */
type CellMapper = (row: number, col: number) => Cell | null

const roleOf = (n: PMNode) => (n.type.spec as { tableRole?: string }).tableRole
const inRange = (i: number, min: number, max: number) => Number.isInteger(i) && i >= min && i < max
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

// ── Locating the table ───────────────────────────────────────────────────────

/** The table at `pos` if it's a plain grid (no merged cells, no holes). */
function plainTable(node: PMNode, pos: number): TableInfo | null {
  if (roleOf(node) !== 'table') return null
  const map = TableMap.get(node)
  if (map.problems || map.width === 0 || map.height === 0) return null
  if (new Set(map.map).size !== map.map.length) return null
  return { node, pos, start: pos + 1, map }
}

function tableAroundSelection(state: EditorState): TableInfo | null {
  const sel = state.selection
  if (sel instanceof CellSelection) return plainTable(sel.$anchorCell.node(-1), sel.$anchorCell.before(-1))
  if (sel instanceof NodeSelection && roleOf(sel.node) === 'table') return plainTable(sel.node, sel.from)
  const { $from } = sel
  for (let d = $from.depth; d > 0; d--) {
    if (roleOf($from.node(d)) === 'table') return plainTable($from.node(d), $from.before(d))
  }
  return null
}

function getTable(state: EditorState, target?: TableTarget): TableInfo | null {
  const pos = target?.tablePos
  if (pos === undefined) return tableAroundSelection(state)
  if (!Number.isInteger(pos) || pos < 0 || pos >= state.doc.content.size) return null
  const node = state.doc.nodeAt(pos)
  return node ? plainTable(node, pos) : null
}

/** Position of the cell of table `info` that holds `$pos`, if any. */
function cellPosIn(info: TableInfo, $pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.before(d) === info.pos) return $pos.depth >= d + 2 ? $pos.before(d + 2) : null
  }
  return null
}

/** The table and cell rectangle the selection covers: a CellSelection, or the cursor's cell. */
function selectionRect(state: EditorState): { info: TableInfo; rect: Rect } | null {
  const sel = state.selection
  if (sel instanceof CellSelection) {
    const info = tableAroundSelection(state)
    if (!info) return null
    return { info, rect: info.map.rectBetween(sel.$anchorCell.pos - info.start, sel.$headCell.pos - info.start) }
  }
  const info = tableAroundSelection(state)
  if (!info) return null
  const from = cellPosIn(info, sel.$from)
  if (from === null || from !== cellPosIn(info, sel.$to)) return null
  return { info, rect: info.map.findCell(from - info.start) }
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** A cell's text: its blocks (and hard breaks) joined with '\n'. */
export function cellText(cell: PMNode): string {
  return cell.textBetween(0, cell.content.size, '\n', (leaf) => (leaf.type.name === 'hardBreak' ? '\n' : ''))
}

function cellGrid(info: TableInfo): PMNode[][] {
  const rows: PMNode[][] = []
  info.node.forEach((row) => {
    const cells: PMNode[] = []
    row.forEach((cell) => cells.push(cell))
    rows.push(cells)
  })
  return rows
}

const alignOf = (cell: PMNode) => (cell.attrs.textAlign as TableAlign | undefined) ?? null

function textData(info: TableInfo, rect: Rect): TableTextData {
  const grid = cellGrid(info)
  const cols = range(rect.right - rect.left).map((i) => rect.left + i)
  return {
    rows: grid.slice(rect.top, rect.bottom).map((row) => cols.map((c) => cellText(row[c]))),
    aligns: cols.map((c) => alignOf(grid[0][c])),
  }
}

/** Position and size of the target table (or the one around the selection). */
export function getTableInfo(state: EditorState, target?: TableTarget): { pos: number; rows: number; columns: number } | null {
  const info = getTable(state, target)
  return info && { pos: info.pos, rows: info.map.height, columns: info.map.width }
}

/** Every cell's text of the target table, header row included. */
export function getTableData(state: EditorState, target?: TableTarget): TableTextData | null {
  const info = getTable(state, target)
  return info && textData(info, { left: 0, top: 0, right: info.map.width, bottom: info.map.height })
}

/** The text of the cells the selection covers (a CellSelection's rectangle, or the cursor's cell). */
export function getSelectedCellsData(state: EditorState): TableTextData | null {
  const s = selectionRect(state)
  return s && textData(s.info, s.rect)
}

// ── Rebuilding ───────────────────────────────────────────────────────────────

/** `cell` as the type its row requires: header cells in row 0, body cells elsewhere. */
function asCell(cell: PMNode, header: boolean, types: Record<string, NodeType>): PMNode {
  const type = header ? types.header_cell : types.cell
  return cell.type === type ? cell : type.create(cell.attrs, cell.content, cell.marks)
}

function emptyCell(type: NodeType, attrs: Record<string, unknown>, marks?: PMNode['marks']): PMNode {
  return type.createAndFill(attrs, null, marks)!
}

/** A transaction replacing the table's rows with `grid` (cell types normalized). */
function replaceGrid(state: EditorState, info: TableInfo, grid: PMNode[][]): Transaction {
  const types = tableNodeTypes(state.schema)
  const rows = grid.map((cells, r) => types.row.create(null, cells.map((c) => asCell(c, r === 0, types))))
  return state.tr.replaceWith(info.start, info.start + info.node.content.size, Fragment.fromArray(rows))
}

/**
 * Put the selection back where it was, following the cells through `mapCell`.
 * A CellSelection becomes the rectangle around its mapped cells unless that
 * would take in unselected cells (then a cursor in the head cell; if any
 * selected cell is gone, the fallback below); a selection inside one cell
 * keeps its offsets if the cell's content didn't change, or goes to the start
 * of the cell. When the selected cells are gone, the cursor goes to the start of
 * `fallback` (clamped to the new table). Selections outside the table (or only
 * partly in it) are left to the transaction's own mapping.
 */
function restoreSelection(tr: Transaction, state: EditorState, info: TableInfo, mapCell: CellMapper, fallback: Cell): void {
  const table = tr.doc.nodeAt(info.pos)!
  const map = TableMap.get(table)
  const posAt = ([r, c]: Cell) => info.start + map.positionAt(r, c, table)
  const toFallback = () => {
    const r = Math.min(Math.max(fallback[0], 0), map.height - 1)
    const c = Math.min(Math.max(fallback[1], 0), map.width - 1)
    tr.setSelection(Selection.near(tr.doc.resolve(posAt([r, c]) + 1)))
  }
  const locate = (cellPos: number): Cell => {
    const rect = info.map.findCell(cellPos - info.start)
    return [rect.top, rect.left]
  }

  const sel = state.selection
  if (sel instanceof CellSelection) {
    if (sel.$anchorCell.before(-1) !== info.pos) return
    // Every selected cell moves on its own (a sort scatters a column's cells):
    // select the rectangle around where they all went, keeping the anchor on
    // the same side of the head — a whole row / column stays whole, and a row
    // inserted / duplicated inside the selection joins it. If that rectangle
    // would take in a cell that wasn't selected (two selected rows a sort or
    // a move pulled apart), it isn't widened: the cursor goes to the start of
    // the head cell instead, so a following delete can't hit other rows.
    const [ar, ac] = locate(sel.$anchorCell.pos)
    const [hr, hc] = locate(sel.$headCell.pos)
    const top0 = Math.min(ar, hr), bottom0 = Math.max(ar, hr)
    const left0 = Math.min(ac, hc), right0 = Math.max(ac, hc)
    const moved: Cell[] = []
    const others = new Set<string>()
    for (let r = 0; r < info.map.height; r++) {
      for (let c = 0; c < info.map.width; c++) {
        const to = mapCell(r, c)
        const selected = r >= top0 && r <= bottom0 && c >= left0 && c <= right0
        if (selected && !to) return toFallback()
        if (selected) moved.push(to!)
        else if (to) others.add(to.join())
      }
    }
    const top = Math.min(...moved.map(([r]) => r)), bottom = Math.max(...moved.map(([r]) => r))
    const left = Math.min(...moved.map(([, c]) => c)), right = Math.max(...moved.map(([, c]) => c))
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (others.has(`${r},${c}`)) {
          tr.setSelection(Selection.near(tr.doc.resolve(posAt(mapCell(hr, hc)!) + 1)))
          return
        }
      }
    }
    const anchor: Cell = [ar <= hr ? top : bottom, ac <= hc ? left : right]
    const head: Cell = [ar <= hr ? bottom : top, ac <= hc ? right : left]
    tr.setSelection(CellSelection.create(tr.doc, posAt(anchor), posAt(head)))
    return
  }

  const anchorCell = cellPosIn(info, sel.$anchor)
  const headCell = cellPosIn(info, sel.$head)
  if (anchorCell === null || anchorCell !== headCell) return
  const to = mapCell(...locate(anchorCell))
  if (!to) return toFallback()
  const newPos = posAt(to)
  if (!tr.doc.nodeAt(newPos)!.content.eq(state.doc.nodeAt(anchorCell)!.content)) {
    tr.setSelection(Selection.near(tr.doc.resolve(newPos + 1)))
    return
  }
  const shift = newPos - anchorCell
  if (sel instanceof TextSelection) tr.setSelection(TextSelection.create(tr.doc, sel.anchor + shift, sel.head + shift))
  else if (sel instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, sel.from + shift))
  else tr.setSelection(Selection.near(tr.doc.resolve(sel.from + shift)))
}

/** Rebuild the table as `grid`, restore the selection and dispatch. */
function commit(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  info: TableInfo,
  grid: PMNode[][],
  mapCell: CellMapper,
  fallback: Cell,
): void {
  const tr = replaceGrid(state, info, grid)
  restoreSelection(tr, state, info, mapCell, fallback)
  dispatch(tr.scrollIntoView())
}

/** `order[newIndex] = oldIndex` → its inverse, `oldIndex → newIndex`. */
function inverse(order: number[]): number[] {
  const inv: number[] = []
  order.forEach((old, i) => { inv[old] = i })
  return inv
}

function moveOrder(n: number, from: number, to: number): number[] {
  const order = range(n)
  order.splice(to, 0, ...order.splice(from, 1))
  return order
}

// ── Selecting ────────────────────────────────────────────────────────────────

function selectRect(info: TableInfo, a: Cell, b: Cell): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const posAt = ([r, c]: Cell) => info.start + info.map.positionAt(r, c, info.node)
      dispatch(state.tr.setSelection(CellSelection.create(state.doc, posAt(a), posAt(b))).scrollIntoView())
    }
    return true
  }
}

/** Select row `index` (0 = header) entirely, as a CellSelection. */
export function selectRow(index: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info || !inRange(index, 0, info.map.height)) return false
    return selectRect(info, [index, 0], [index, info.map.width - 1])(state, dispatch)
  }
}

/** Select column `index` entirely (header included), as a CellSelection. */
export function selectColumn(index: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info || !inRange(index, 0, info.map.width)) return false
    return selectRect(info, [0, index], [info.map.height - 1, index])(state, dispatch)
  }
}

// ── Moving ───────────────────────────────────────────────────────────────────

/**
 * Move body row `from` so it ends up at index `to` (both ≥ 1: the header is
 * fixed and nothing goes above it). False when out of range or from === to.
 * The selection follows its cells.
 */
export function moveRow(from: number, to: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info) return false
    const h = info.map.height
    if (!inRange(from, 1, h) || !inRange(to, 1, h) || from === to) return false
    if (dispatch) {
      const grid = cellGrid(info)
      const order = moveOrder(h, from, to)
      const inv = inverse(order)
      commit(state, dispatch, info, order.map((r) => grid[r]), (r, c) => [inv[r], c], [to, 0])
    }
    return true
  }
}

/**
 * Move column `from` so it ends up at index `to`, header cell included: its
 * alignment travels with it. False when out of range or from === to. The
 * selection follows its cells.
 */
export function moveColumn(from: number, to: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info) return false
    const w = info.map.width
    if (!inRange(from, 0, w) || !inRange(to, 0, w) || from === to) return false
    if (dispatch) {
      const order = moveOrder(w, from, to)
      const inv = inverse(order)
      const grid = cellGrid(info).map((row) => order.map((c) => row[c]))
      commit(state, dispatch, info, grid, (r, c) => [r, inv[c]], [0, to])
    }
    return true
  }
}

// ── Duplicating / inserting ──────────────────────────────────────────────────

/**
 * Insert a copy of row `index` right below it (content and attributes). A copy
 * of the header is a body row. The selection stays on the original cells.
 */
export function duplicateRow(index: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info || !inRange(index, 0, info.map.height)) return false
    if (dispatch) {
      const grid = cellGrid(info)
      grid.splice(index + 1, 0, grid[index])
      commit(state, dispatch, info, grid, (r, c) => [r > index ? r + 1 : r, c], [index, 0])
    }
    return true
  }
}

/**
 * Insert a copy of column `index` right after it (content and attributes, so
 * the same alignment). The selection stays on the original cells.
 */
export function duplicateColumn(index: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info || !inRange(index, 0, info.map.width)) return false
    if (dispatch) {
      const grid = cellGrid(info).map((row) => [...row.slice(0, index + 1), row[index], ...row.slice(index + 1)])
      commit(state, dispatch, info, grid, (r, c) => [r, c > index ? c + 1 : c], [0, index])
    }
    return true
  }
}

/**
 * Insert an empty body row at `index` (1 … rows: nothing goes above the
 * header; `rows` appends). Each new cell takes its column's alignment from the
 * header cell. The selection stays on its cells.
 */
export function insertRowAt(index: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info || !inRange(index, 1, info.map.height + 1)) return false
    if (dispatch) {
      const types = tableNodeTypes(state.schema)
      const grid = cellGrid(info)
      grid.splice(index, 0, grid[0].map((header) => emptyCell(types.cell, { textAlign: alignOf(header) })))
      commit(state, dispatch, info, grid, (r, c) => [r >= index ? r + 1 : r, c], [index, 0])
    }
    return true
  }
}

/**
 * Insert an empty column at `index` (0 … columns; `columns` appends): a header
 * cell in row 0, body cells below, no alignment (a new column has none until
 * the user sets it). The selection stays on its cells.
 */
export function insertColumnAt(index: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info || !inRange(index, 0, info.map.width + 1)) return false
    if (dispatch) {
      const types = tableNodeTypes(state.schema)
      const grid = cellGrid(info).map((row, r) => {
        const next = [...row]
        next.splice(index, 0, emptyCell(r === 0 ? types.header_cell : types.cell, { textAlign: null }))
        return next
      })
      commit(state, dispatch, info, grid, (r, c) => [r, c >= index ? c + 1 : c], [0, index])
    }
    return true
  }
}

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sort the body rows by column `col` (the header stays put), with sortOrder
 * (src/lib/tableData.ts): numeric when every non-empty cell of the column is a
 * number, else locale-aware text (`options.locale`, default the runtime's);
 * empty cells last; stable both ways. Possible with 2+ body rows. Already in
 * order → true without a transaction. The selection follows its cells.
 */
export function sortRowsByColumn(
  col: number,
  direction: SortDirection,
  options: TableTarget & { locale?: string | string[] } = {},
): Command {
  return (state, dispatch) => {
    const info = getTable(state, options)
    if (!info || !inRange(col, 0, info.map.width) || info.map.height < 3) return false
    if (dispatch) {
      const grid = cellGrid(info)
      const body = grid.slice(1)
      const sorted = sortOrder(body.map((row) => cellText(row[col])), direction, options.locale)
      if (sorted.every((old, i) => old === i)) return true
      const order = [0, ...sorted.map((i) => i + 1)]
      const inv = inverse(order)
      commit(state, dispatch, info, order.map((r) => grid[r]), (r, c) => [inv[r], c], [0, col])
    }
    return true
  }
}

// ── Clearing ─────────────────────────────────────────────────────────────────

/** Empty the cells of `rect` (one empty paragraph each, attributes kept). */
function clearRect(info: TableInfo, rect: Rect): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const inRect = (r: number, c: number) => r >= rect.top && r < rect.bottom && c >= rect.left && c < rect.right
      let changed = false
      const grid = cellGrid(info).map((row, r) => row.map((cell, c) => {
        if (!inRect(r, c)) return cell
        const empty = emptyCell(cell.type, cell.attrs, cell.marks)
        if (empty.content.eq(cell.content)) return cell
        changed = true
        return empty
      }))
      if (changed) commit(state, dispatch, info, grid, (r, c) => [r, c], [rect.top, rect.left])
    }
    return true
  }
}

/** Empty every cell of row `index` (the header too; it stays a header). Nothing to clear → true, no transaction. */
export function clearRow(index: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info || !inRange(index, 0, info.map.height)) return false
    return clearRect(info, { left: 0, right: info.map.width, top: index, bottom: index + 1 })(state, dispatch)
  }
}

/** Empty every cell of column `index` (header included). Nothing to clear → true, no transaction. */
export function clearColumn(index: number, target?: TableTarget): Command {
  return (state, dispatch) => {
    const info = getTable(state, target)
    if (!info || !inRange(index, 0, info.map.width)) return false
    return clearRect(info, { left: index, right: index + 1, top: 0, bottom: info.map.height })(state, dispatch)
  }
}

/**
 * Empty the selected cells (a CellSelection) or the cursor's cell (a text
 * selection inside one cell). A CellSelection is kept; a cursor goes to the
 * start of its emptied cell.
 */
export const clearSelectedCells: Command = (state, dispatch) => {
  const s = selectionRect(state)
  return !!s && clearRect(s.info, s.rect)(state, dispatch)
}

// ── Deleting ─────────────────────────────────────────────────────────────────

/**
 * Delete the rows the selection covers (CellSelection or cursor's cell). The
 * header can't go: with a mix only the body rows are deleted; with only the
 * header selected it's false. Deleting every body row is fine (a header-only
 * table is valid markdown). The cursor lands at the start of the cell that
 * takes the first deleted row's place (or the last row's), same column.
 */
export const deleteSelectedRows: Command = (state, dispatch) => {
  const s = selectionRect(state)
  if (!s) return false
  const { info, rect } = s
  const top = Math.max(rect.top, 1)
  const count = rect.bottom - top
  if (count <= 0) return false
  if (dispatch) {
    const grid = cellGrid(info)
    grid.splice(top, count)
    const mapCell: CellMapper = (r, c) => (r < top ? [r, c] : r >= rect.bottom ? [r - count, c] : null)
    commit(state, dispatch, info, grid, mapCell, [Math.min(top, grid.length - 1), rect.left])
  }
  return true
}

/**
 * Delete the columns the selection covers (CellSelection or cursor's cell).
 * False if that would leave fewer than MIN_TABLE_COLUMNS columns, i.e. if it
 * would delete every column: a table can go down to one column, not to none.
 * The cursor lands at the start of the cell that takes the first deleted
 * column's place (or the last column's), same row.
 */
export const deleteSelectedColumns: Command = (state, dispatch) => {
  const s = selectionRect(state)
  if (!s) return false
  const { info, rect } = s
  const count = rect.right - rect.left
  if (info.map.width - count < MIN_TABLE_COLUMNS) return false
  if (dispatch) {
    const grid = cellGrid(info).map((row) => row.filter((_, c) => c < rect.left || c >= rect.right))
    const mapCell: CellMapper = (r, c) => (c < rect.left ? [r, c] : c >= rect.right ? [r, c - count] : null)
    const width = info.map.width - count
    commit(state, dispatch, info, grid, mapCell, [rect.top, Math.min(rect.left, width - 1)])
  }
  return true
}

// ── TipTap adapters ──────────────────────────────────────────────────────────

/** Run a table command on a TipTap editor (one transaction) and refocus it. False if it can't run or the editor is read-only. */
export function runTableCommand(editor: Editor, command: Command): boolean {
  if (!editor.isEditable) return false
  const ok = command(editor.state, (tr) => editor.view.dispatch(tr))
  if (ok) editor.view.focus()
  return ok
}

/** Whether a table command can run on the editor now (for enabling menu entries). */
export function canRunTableCommand(editor: Editor, command: Command): boolean {
  return editor.isEditable && command(editor.state)
}
