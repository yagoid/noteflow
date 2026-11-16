// ── Copy / cut / paste of the note editor, tables first ─────────────────────
//
// - Copy / cut of a CellSelection: the plain text is TSV (the HTML stays
//   ProseMirror's own table, so pasting it back into NoteFlow inserts cells).
//   Cut empties the cells (ProseMirror's deleteSelection on a CellSelection).
// - handleEditorPaste: the editor's handlePaste (Editor.tsx editorProps; view
//   props run before the prosemirror-tables plugin). Its order: code → native;
//   NoteFlow HTML → native (cells in a table); spreadsheet TSV → table cells;
//   markdown source → rendered; anything else → native, cells in a table.
// - TableClipboard (extension): drops <caption> from pasted HTML, normalizes
//   the tables of every pasted slice and, after any paste, the tables it
//   touched — so a pasted table always saves as a markdown pipe table: header
//   in row 0, no merged cells, rectangular, no nested tables, one alignment and
//   one width per column (the header cell's; widths only from NoteFlow's HTML).
// Decisions: .agents/context/patterns.md ("Editor: teclado y portapapeles de tablas").

import { Extension } from '@tiptap/core'
import { DOMParser as PMDOMParser, Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import {
  CellSelection, TableMap, isInTable, selectionCell, tableNodeTypes,
  __clipCells, __insertCells, __pastedCells, type __Area, type Rect,
} from '@tiptap/pm/tables'
import { Transform } from '@tiptap/pm/transform'
import type { EditorView } from '@tiptap/pm/view'
import { htmlFromMarkdown, looksLikeMarkdown } from '../../lib/markdownHtml'
import { cellsToTsv, parseDelimited, type TableAlign } from '../../lib/tableData'
import { isProseMirrorHtml, shouldPasteAsTsv } from '../../lib/tablePaste'
import { colwidthOf, widthOfColwidth } from '../../lib/tableWidth'
import { cellText, getSelectedCellsData } from './tableOps'

const roleOf = (n: PMNode) => (n.type.spec as { tableRole?: string }).tableRole
const isTable = (n: PMNode) => roleOf(n) === 'table'

// ── Copy ─────────────────────────────────────────────────────────────────────

/**
 * The plain text of a CellSelection: its cells as TSV (cellsToTsv), or a
 * single cell's text as-is (no quoting). Null for any other selection.
 */
export function cellSelectionText(state: EditorState): string | null {
  const sel = state.selection
  if (!(sel instanceof CellSelection)) return null
  let rows = getSelectedCellsData(state)?.rows
  if (!rows) {
    // A table with merged cells (tableOps rejects those): each cell's text once, at its top-left.
    const table = sel.$anchorCell.node(-1)
    const start = sel.$anchorCell.start(-1)
    const map = TableMap.get(table)
    const rect = map.rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start)
    const seen = new Set<number>()
    rows = []
    for (let r = rect.top; r < rect.bottom; r++) {
      const row: string[] = []
      for (let c = rect.left; c < rect.right; c++) {
        const pos = map.map[r * map.width + c]
        row.push(seen.has(pos) ? '' : cellText(table.nodeAt(pos)!))
        seen.add(pos)
      }
      rows.push(row)
    }
  }
  return rows.length === 1 && rows[0].length === 1 ? rows[0][0] : cellsToTsv(rows)
}

// ── Building cells ───────────────────────────────────────────────────────────

/** A paragraph holding `text` literally ('\n' → hard break; no markdown read). */
function textParagraph(schema: Schema, text: string): PMNode {
  const inline: PMNode[] = []
  text.split('\n').forEach((line, i) => {
    if (i > 0) inline.push(schema.nodes.hardBreak.create())
    if (line) inline.push(schema.text(line))
  })
  return schema.nodes.paragraph.create(null, inline)
}

/** A new table of `rows` (row 0 = header), cell text taken literally. */
export function tableFromRows(schema: Schema, rows: readonly (readonly string[])[]): PMNode {
  const types = tableNodeTypes(schema)
  return types.table.create(null, rows.map((row, r) =>
    types.row.create(null, row.map((text) =>
      (r === 0 ? types.header_cell : types.cell).create(null, textParagraph(schema, text))))))
}

/** `rows` as pasted cells (all body cells: they're data; the table decides which row is the header). */
function areaFromRows(schema: Schema, rows: readonly (readonly string[])[]): __Area {
  const types = tableNodeTypes(schema)
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    rows: rows.map((row) => Fragment.from(row.map((text) => types.cell.create(null, textParagraph(schema, text))))),
  }
}

/** `slice` fitted into one cell (prosemirror-tables' fitSlice). */
function fitCell(schema: Schema, slice: Slice): PMNode {
  const cell = tableNodeTypes(schema).cell.createAndFill()!
  return new Transform(cell).replace(0, cell.content.size, slice).doc
}

// ── Normalizing tables ───────────────────────────────────────────────────────

/** Tables inside `content` turned into text: one paragraph per row, its cells' text joined with ' · '. */
function flattenTables(content: Fragment, schema: Schema): Fragment {
  let changed = false
  const out: PMNode[] = []
  content.forEach((node) => {
    if (isTable(node)) {
      changed = true
      node.forEach((row) => {
        const texts: string[] = []
        row.forEach((cell) => { const t = cellText(cell).trim(); if (t) texts.push(t) })
        if (texts.length) out.push(textParagraph(schema, texts.join(' · ')))
      })
      return
    }
    const inner = node.isLeaf ? node.content : flattenTables(node.content, schema)
    if (inner !== node.content) changed = true
    out.push(inner === node.content ? node : node.copy(inner))
  })
  if (!changed) return content
  return out.length ? Fragment.fromArray(out) : Fragment.from(schema.nodes.paragraph.create())
}

/** What each column of a table keeps when cells are pasted into it: its header cell's alignment and width. */
export interface ColumnFormat {
  aligns: TableAlign[]
  widths: (number | null)[]
}

/** Alignment and width of each column of `table`: its header cell's. */
function columnFormat(table: PMNode): ColumnFormat {
  const map = TableMap.get(table)
  const headers = Array.from({ length: map.width }, (_, c) => table.nodeAt(map.map[c]))
  return {
    aligns: headers.map((cell) => (cell?.attrs.textAlign as TableAlign | undefined) ?? null),
    widths: headers.map((cell, c) => headerWidth(cell, c - map.colCount(map.map[c]))),
  }
}

/**
 * Width (dashes) of the column `offset` columns into a header cell: entry
 * `offset` of its `colwidth` (one per column it spans). Only NoteFlow widths
 * exist in the document — the schema reads them from `data-nf-colw` only
 * (editorExtensions.ts), never the px `colwidth` of other editors — so this
 * keeps a table copied from NoteFlow as it was.
 */
function headerWidth(cell: PMNode | null | undefined, offset: number): number | null {
  const colwidth = cell?.attrs.colwidth as unknown
  return Array.isArray(colwidth) ? widthOfColwidth([colwidth[offset]]) : null
}

/**
 * `table` as a markdown pipe table can hold it, or null if it already is one:
 * merged cells expanded (the content stays in the top-left cell, the rest
 * filled with empty cells), ragged rows padded, rows without cells dropped,
 * row 0 = header cells and every other row body cells, tables nested in a
 * cell flattened to text, and each cell aligned and sized like its column —
 * `format` when given (a table pasted into keeps its own alignments and widths;
 * columns it grew take their new header's), else the header cell's.
 */
export function normalizedTable(table: PMNode, format?: ColumnFormat): PMNode | null {
  const schema = table.type.schema
  const types = tableNodeTypes(schema)
  const origin: (PMNode | undefined)[][] = []
  const cover: (PMNode | undefined)[][] = []
  const height = table.childCount
  table.forEach((row, _, r) => {
    origin[r] ??= []
    cover[r] ??= []
    let c = 0
    row.forEach((cell) => {
      while (cover[r][c]) c++
      const colspan = Math.max(1, Number(cell.attrs.colspan) || 1)
      const rowspan = Math.max(1, Number(cell.attrs.rowspan) || 1)
      origin[r][c] = cell
      for (let dr = 0; dr < rowspan && r + dr < height; dr++) {
        cover[r + dr] ??= []
        for (let dc = 0; dc < colspan; dc++) cover[r + dr][c + dc] = cell
      }
      c += colspan
    })
  })
  const kept = cover.map((cells, r) => (cells.some(Boolean) ? r : -1)).filter((r) => r >= 0)
  const width = Math.max(0, ...kept.map((r) => cover[r].length))
  if (!kept.length || width === 0) return null
  const head = cover[kept[0]]
  const align = (c: number): TableAlign =>
    format && c < format.aligns.length ? format.aligns[c] : ((head[c]?.attrs.textAlign as TableAlign | undefined) ?? null)
  // A header cell spanning columns: its colwidth has one entry per column it covers.
  const colwidth = (c: number): number[] | null => colwidthOf(format && c < format.widths.length
    ? format.widths[c]
    : headerWidth(head[c], c - head.indexOf(head[c])))

  const rows = kept.map((r, i) => {
    const type = i === 0 ? types.header_cell : types.cell
    return types.row.create(null, Array.from({ length: width }, (_, c) => {
      const cell = origin[r][c]
      const attrs = { ...(cell?.attrs ?? {}), colspan: 1, rowspan: 1, colwidth: colwidth(c), textAlign: align(c) }
      if (!cell) return type.createAndFill(attrs)!
      return type.create(attrs, flattenTables(cell.content, schema), cell.marks)
    }))
  })
  const next = table.type.create(table.attrs, rows, table.marks)
  return next.eq(table) ? null : next
}

/**
 * Normalize the table at `pos` of `tr.doc` (normalizedTable) in `tr`. When
 * only cell types / attributes change, cell by cell (positions and the
 * selection stay); otherwise the table is replaced and a selection inside it
 * goes back to the same cells (a CellSelection) or the start of the head's cell.
 */
function normalizeTableAt(tr: Transaction, pos: number, format?: ColumnFormat): void {
  const table = tr.doc.nodeAt(pos)
  if (!table || !isTable(table)) return
  const next = normalizedTable(table, format)
  if (!next) return
  const sameShape = next.childCount === table.childCount && next.content.content.every((row, r) =>
    row.childCount === table.child(r).childCount
    && row.content.content.every((cell, c) => cell.content.eq(table.child(r).child(c).content)))
  if (sameShape) {
    table.forEach((row, rowOffset, r) => row.forEach((cell, cellOffset, c) => {
      const want = next.child(r).child(c)
      if (want.type !== cell.type || !want.sameMarkup(cell)) {
        tr.setNodeMarkup(pos + 1 + rowOffset + 1 + cellOffset, want.type, want.attrs, want.marks)
      }
    }))
    return
  }
  // Where the selection was, as cells of the old table (to put it back after the rebuild).
  const map = TableMap.get(table)
  const cellOf = (at: number): { cell: [number, number]; start: number } | null => {
    const $at = tr.doc.resolve(at)
    for (let d = $at.depth; d > 0; d--) {
      if ($at.before(d) === pos && $at.depth >= d + 2) {
        const start = $at.before(d + 2)
        const rect = map.findCell(start - pos - 1)
        return { cell: [rect.top, rect.left], start }
      }
    }
    return null
  }
  const sel = tr.selection
  const anchor = sel instanceof CellSelection ? cellOf(sel.$anchorCell.pos + 1) : cellOf(sel.anchor)
  const head = sel instanceof CellSelection ? cellOf(sel.$headCell.pos + 1) : cellOf(sel.head)
  const oldHeadCell = head && tr.doc.nodeAt(head.start)
  tr.replaceWith(pos, pos + table.nodeSize, next)
  if (!anchor || !head) return
  const newMap = TableMap.get(next)
  const posAt = ([r, c]: [number, number]) =>
    pos + 1 + newMap.positionAt(Math.min(r, newMap.height - 1), Math.min(c, newMap.width - 1), next)
  if (sel instanceof CellSelection) {
    tr.setSelection(CellSelection.create(tr.doc, posAt(anchor.cell), posAt(head.cell)))
    return
  }
  // A caret / text selection inside one cell whose content didn't change keeps its offsets.
  const newHead = posAt(head.cell)
  if (anchor.start === head.start && sel instanceof TextSelection && oldHeadCell?.content.eq(tr.doc.nodeAt(newHead)!.content)) {
    tr.setSelection(TextSelection.create(tr.doc, newHead + sel.anchor - head.start, newHead + sel.head - head.start))
    return
  }
  tr.setSelection(Selection.near(tr.doc.resolve(newHead + 1)))
}

/** `slice` with its complete (closed) tables normalized; tables cut open at its edges are left alone. */
export function normalizePastedSlice(slice: Slice): Slice {
  const walk = (content: Fragment, openStart: number, openEnd: number): Fragment => {
    let changed = false
    const out: PMNode[] = []
    content.forEach((node, _, i) => {
      const openLeft = i === 0 ? openStart : 0
      const openRight = i === content.childCount - 1 ? openEnd : 0
      let next = node
      if (isTable(node)) {
        if (!openLeft && !openRight) next = normalizedTable(node) ?? node
      } else if (!node.isLeaf) {
        const inner = walk(node.content, Math.max(0, openLeft - 1), Math.max(0, openRight - 1))
        if (inner !== node.content) next = node.copy(inner)
      }
      if (next !== node) changed = true
      out.push(next)
    })
    return changed ? Fragment.fromArray(out) : content
  }
  const content = walk(slice.content, slice.openStart, slice.openEnd)
  return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd)
}

function sliceHasTable(slice: Slice): boolean {
  let found = false
  slice.content.descendants((node) => {
    if (isTable(node)) found = true
    return !found
  })
  return found
}

// ── Pasting ──────────────────────────────────────────────────────────────────

/** Dispatch a paste. Flagged `paste` (what the paste normalizer looks for) but not as a
 *  `uiEvent`: TipTap's paste rules must not turn literal cell text (`**x**`, URLs) into marks. */
function dispatchPaste(view: EditorView, tr: Transaction): void {
  view.dispatch(tr.setMeta('paste', true).scrollIntoView())
}

/**
 * Insert `cells` into the table around the selection, prosemirror-tables
 * style: from the cursor's cell (the table grows as needed), or into a
 * CellSelection (the cells are clipped / repeated to fill it). The result is
 * normalized in the same transaction, keeping the table's column alignments
 * and widths (pasted cells take their destination column's).
 */
function insertCellsAtSelection(view: EditorView, cells: __Area): void {
  const { state } = view
  const sel = state.selection
  let start: number
  let rect: Rect
  if (sel instanceof CellSelection) {
    start = sel.$anchorCell.start(-1)
    const map = TableMap.get(sel.$anchorCell.node(-1))
    rect = map.rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start)
    cells = __clipCells(cells, rect.right - rect.left, rect.bottom - rect.top)
  } else {
    const $cell = selectionCell(state)
    start = $cell.start(-1)
    rect = TableMap.get($cell.node(-1)).findCell($cell.pos - start)
  }
  const format = columnFormat(state.doc.nodeAt(start - 1)!)
  __insertCells(state, (tr) => {
    normalizeTableAt(tr, start - 1, format)
    dispatchPaste(view, tr)
  }, start, rect, cells)
}

/** A block with nothing in it but line breaks / whitespace (`<p></p>`, `<p><br></p>`, a stray `<br>`). */
function isBlankBlock(node: PMNode): boolean {
  return node.isTextblock && node.content.content.every((child) =>
    child.type.name === 'hardBreak' || (child.isText && !child.text!.trim()))
}

/**
 * `slice` as just its table when everything around that one (closed) table is
 * blank blocks — the `<br>` Google Docs puts after a copied table, empty
 * paragraphs around it — so it pastes as cells. Otherwise `slice` unchanged.
 */
export function loneTableSlice(slice: Slice): Slice {
  const kids = slice.content.content
  if (kids.length < 2) return slice
  const tables = kids.filter(isTable)
  if (tables.length !== 1) return slice
  const at = kids.indexOf(tables[0])
  if ((at === 0 && slice.openStart > 0) || (at === kids.length - 1 && slice.openEnd > 0)) return slice
  if (!kids.every((node) => node === tables[0] || isBlankBlock(node))) return slice
  return new Slice(Fragment.from(tables[0]), 0, 0)
}

/**
 * Paste `slice` into the table around the selection, if there is one and the
 * slice needs it: table cells / rows (or anything, into a CellSelection) go
 * into the cells — a lone table with blank blocks around it too
 * (loneTableSlice); other content holding a table (real text around it) goes
 * into the cell, before what the cell held, with its tables flattened to text
 * (a table can't live in a cell; nothing is dropped). False (native paste) for
 * anything else, and outside tables.
 */
function pasteSliceInTable(view: EditorView, pasted: Slice): boolean {
  const { state } = view
  if (!isInTable(state)) return false
  const slice = loneTableSlice(pasted)
  const cells = __pastedCells(slice)
  if (cells) {
    insertCellsAtSelection(view, cells)
    return true
  }
  const flat = sliceHasTable(slice) ? new Slice(flattenTables(slice.content, state.schema), slice.openStart, slice.openEnd) : slice
  if (state.selection instanceof CellSelection) {
    insertCellsAtSelection(view, { width: 1, height: 1, rows: [Fragment.from(fitCell(state.schema, flat))] })
    return true
  }
  if (flat === slice) return false
  const tr = state.tr.replaceSelection(flat)
  // Right after the pasted content, in its cell (ProseMirror would look forward, into the next cell).
  tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(state.selection.to)), -1))
  dispatchPaste(view, tr)
  return true
}

/** Paste spreadsheet rows: a new table (row 0 = header), or into the table around the selection. */
function pasteRows(view: EditorView, rows: string[][]): void {
  const { state } = view
  if (isInTable(state)) insertCellsAtSelection(view, areaFromRows(state.schema, rows))
  else dispatchPaste(view, state.tr.replaceSelectionWith(tableFromRows(state.schema, rows), false))
}

// Tags only genuinely rich HTML has (Word, Google Docs, a web page): its own
// paste beats a markdown re-parse of the plain text.
const RICH_HTML = /<(a|strong|em|b|i|table|img|h[1-6]|blockquote)[\s>]/i

/**
 * The note editor's handlePaste, in this order:
 * 1. In code (a code block, any ancestor with `code`): native, verbatim text.
 * 2. HTML copied from NoteFlow / ProseMirror (`data-pm-slice`): native — in a
 *    table, its cells go into the cells (prosemirror-tables' behaviour, normalized).
 * 3. A spreadsheet range (shouldPasteAsTsv: tab-separated text with no HTML,
 *    or a lone table without links / inline formatting): its text becomes a
 *    table (row 0 = header), or fills the cells from the cursor's cell. A
 *    table with links or formatting (web, Word, Docs) goes on to step 5.
 * 4. Markdown source (looksLikeMarkdown, no rich HTML): rendered as formatting.
 * 5. Anything else: native (slices normalized by TableClipboard); in a table,
 *    cells pasted into cells and other tables flattened.
 * `plain`: a linked note's plain-Markdown schema (htmlFromMarkdown option).
 */
export function handleEditorPaste(view: EditorView, event: ClipboardEvent, slice: Slice, { plain = false } = {}): boolean {
  const { $from } = view.state.selection
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.spec.code) return false
  }
  const text = event.clipboardData?.getData('text/plain') ?? ''
  const html = event.clipboardData?.getData('text/html') ?? ''
  if (isProseMirrorHtml(html)) return pasteSliceInTable(view, slice)
  if (shouldPasteAsTsv(text, html)) {
    pasteRows(view, parseDelimited(text, '\t'))
    return true
  }
  if (text.trim() && !RICH_HTML.test(html) && looksLikeMarkdown(text)) {
    event.preventDefault()
    // Markdown pasted as text didn't come from a NoteFlow note: its separators' dashes aren't widths.
    const dom = new window.DOMParser().parseFromString(htmlFromMarkdown(text, { plain, columnWidths: false }), 'text/html')
    const md = PMDOMParser.fromSchema(view.state.schema).parseSlice(dom.body)
    if (pasteSliceInTable(view, md)) return true
    view.dispatch(view.state.tr.replaceSelection(md).scrollIntoView())
    return true
  }
  return pasteSliceInTable(view, slice)
}

// ── Extension ────────────────────────────────────────────────────────────────

/** Tables of the document touched by `trs` if any of them is a paste, else none. */
function normalizePastedTables(trs: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  if (!trs.some((tr) => tr.docChanged && (tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste'))) return null
  const start = oldState.doc.content.findDiffStart(newState.doc.content)
  if (start == null) return null
  const diffEnd = oldState.doc.content.findDiffEnd(newState.doc.content)
  let end = diffEnd?.b ?? newState.doc.content.size
  // findDiffEnd can run past `start` when the change repeats nearby content.
  const overlap = start - Math.min(diffEnd?.a ?? end, end)
  if (overlap > 0) end += overlap
  if (end <= start) return null
  const tables: number[] = []
  newState.doc.nodesBetween(start, end, (node, pos) => {
    if (!isTable(node)) return true
    tables.push(pos)
    return false
  })
  if (!tables.length) return null
  const tr = newState.tr
  for (const pos of tables.reverse()) normalizeTableAt(tr, pos)
  return tr.docChanged ? tr : null
}

const tableClipboardKey = new PluginKey('tableClipboard')

/**
 * Clipboard behaviour of tables that isn't the paste handler itself (that one
 * is handleEditorPaste, an editor prop): TSV as the plain text of a copied
 * CellSelection, <caption> dropped from pasted HTML (it'd become a stray row),
 * pasted slices normalized, and the tables a paste touched normalized after it
 * (same undo step: an appended transaction).
 */
export const TableClipboard = Extension.create({
  name: 'tableClipboard',

  priority: 150,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableClipboardKey,
        props: {
          clipboardTextSerializer: (_slice, view) => cellSelectionText(view.state) ?? '',
          transformPastedHTML: (html) => (/<caption[\s>]/i.test(html) ? html.replace(/<caption[\s>][\s\S]*?<\/caption>/gi, '') : html),
          transformPasted: (slice) => normalizePastedSlice(slice),
        },
        appendTransaction: normalizePastedTables,
      }),
    ]
  },
})
