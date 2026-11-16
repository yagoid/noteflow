// @vitest-environment happy-dom
//
// Table commands (src/components/Editor/tableOps.ts) on the editor's REAL
// schema and markdown pipeline (helpers/editorPipeline.ts). Every mutating
// command must: dispatch exactly one transaction (one undo step back to the
// original document), keep the table valid (doc.check, header row = only
// tableHeader cells, body rows = only tableCell cells), save to the expected
// markdown, round-trip losslessly, and leave a valid selection.

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { history, undo, undoDepth } from '@tiptap/pm/history'
import { EditorState, NodeSelection, Selection, TextSelection, type Command, type Transaction } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import {
  MIN_TABLE_COLUMNS, alignColumn, canRunTableCommand, cellText, clearColumn, clearRow, clearSelectedCells,
  deleteColumn, deleteRow, deleteSelectedColumns, deleteSelectedRows, deleteTable, duplicateColumn, duplicateRow,
  findTablePos, focusCell, getCellSelectionRect, getSelectedCellsData, getSelectionCell, getTableData,
  getTableInfo, insertColumnAt, insertRowAt, moveColumn, moveRow, runTableCommand, selectColumn, selectRow,
  sortRowsByColumn, tableActionCommand,
  duplicateSelectedRow, insertColumnRight, insertRowBelow, moveSelectedColumn, moveSelectedRow, selectionInTable,
} from '../../src/components/Editor/tableOps'
import { load, save, schema } from '../helpers/editorPipeline'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A pipe table the way NoteFlow writes it. */
function table(rows: string[][], seps?: string[]): string {
  const line = (r: string[]) => '| ' + r.map((c) => c || ' ').join(' | ') + ' |'
  const sep = '| ' + (seps ?? rows[0].map(() => '---')).join(' | ') + ' |'
  return [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n')
}

const T22 = table([['A', 'B'], ['1', '2']])
const T44 = table(
  [['N', 'Name', 'Score', 'Note'], ['1', 'b', '10', 'x'], ['2', 'a', '9,5', ''], ['3', 'c', '', 'y']],
  ['---', ':---:', '---:', ':---'],
)
const HEADER_ONLY = table([['A', 'B']], ['---', '---:'])

// ── Harness ──────────────────────────────────────────────────────────────────

/** Text position of the first text node starting with `text` (+ offset). */
function textPos(doc: PMNode, text: string, offset = 0): number {
  let pos = -1
  doc.descendants((n, at) => {
    if (pos < 0 && n.isText && n.text!.startsWith(text)) pos = at + offset
    return pos < 0
  })
  if (pos < 0) throw new Error(`no text ${text}`)
  return pos
}

function stateOf(doc: PMNode | string, cursorAt?: string): EditorState {
  const d = typeof doc === 'string' ? load(doc) : doc
  d.check()
  const state = EditorState.create({ doc: d, plugins: [history()] })
  if (cursorAt === undefined) return state
  return state.apply(state.tr.setSelection(TextSelection.create(d, textPos(d, cursorAt))))
}

/** Position of the cell (row, col) of the table at `tablePos`. */
function cellPos(state: EditorState, row: number, col: number, tablePos = 0): number {
  const t = state.doc.nodeAt(tablePos)!
  return tablePos + 1 + TableMap.get(t).positionAt(row, col, t)
}

function withCells(state: EditorState, a: [number, number], b: [number, number], tablePos = 0): EditorState {
  return state.apply(state.tr.setSelection(
    CellSelection.create(state.doc, cellPos(state, ...a, tablePos), cellPos(state, ...b, tablePos)),
  ))
}

function checkTables(doc: PMNode): void {
  doc.check()
  doc.descendants((n) => {
    if (n.type.name !== 'table') return true
    n.forEach((row, _, r) => row.forEach((cell) => {
      expect(cell.type.name).toBe(r === 0 ? 'tableHeader' : 'tableCell')
    }))
    return true
  })
}

function checkSelection(state: EditorState): void {
  const sel = state.selection
  expect(sel.from).toBeGreaterThanOrEqual(0)
  expect(sel.to).toBeLessThanOrEqual(state.doc.content.size)
  if (sel instanceof TextSelection) {
    expect(sel.$anchor.parent.inlineContent).toBe(true)
    expect(sel.$head.parent.inlineContent).toBe(true)
  }
  // Survives a JSON round trip (what the history / bookmarks rely on).
  expect(Selection.fromJSON(state.doc, sel.toJSON()).eq(sel)).toBe(true)
}

/**
 * Run `cmd`: it must answer true without dispatch too, dispatch exactly one
 * transaction, keep the invariants, and undo in one step.
 */
function apply(state: EditorState, cmd: Command, { lossless = true } = {}): EditorState {
  expect(cmd(state), 'can run (no dispatch)').toBe(true)
  const trs: Transaction[] = []
  expect(cmd(state, (tr) => trs.push(tr))).toBe(true)
  expect(trs).toHaveLength(1)
  const next = state.apply(trs[0])
  checkTables(next.doc)
  checkSelection(next)
  if (lossless) {
    const md = save(next.doc)
    expect(load(md).toJSON(), md).toEqual(next.doc.toJSON())
    expect(save(load(md))).toBe(md)
  }
  expect(undoDepth(next)).toBe(1)
  let undone: EditorState | null = null
  expect(undo(next, (tr) => { undone = next.apply(tr) })).toBe(true)
  expect(undone!.doc.eq(state.doc)).toBe(true)
  return next
}

/** The same document and selection with an empty history (to chain `apply`s:
 *  history groups adjacent transactions into one undo step). */
function fresh(state: EditorState): EditorState {
  return EditorState.create({ doc: state.doc, selection: state.selection, plugins: [history()] })
}

/** Apply a selection-only command. */
function run(state: EditorState, cmd: Command): EditorState {
  let next = state
  expect(cmd(state, (tr) => { next = state.apply(tr) })).toBe(true)
  return next
}

/** The command refuses: false without dispatch and with it, nothing dispatched. */
function expectRejected(state: EditorState, cmd: Command): void {
  expect(cmd(state)).toBe(false)
  let dispatched = false
  expect(cmd(state, () => { dispatched = true })).toBe(false)
  expect(dispatched).toBe(false)
}

/** True without a transaction (nothing to do). */
function expectNoOp(state: EditorState, cmd: Command): void {
  expect(cmd(state)).toBe(true)
  let dispatched = false
  expect(cmd(state, () => { dispatched = true })).toBe(true)
  expect(dispatched).toBe(false)
}

/** Cell attrs of the table at 0, row-major. */
const aligns = (state: EditorState) => {
  const out: (string | null)[][] = []
  state.doc.nodeAt(0)!.forEach((row) => {
    const r: (string | null)[] = []
    row.forEach((c) => r.push(c.attrs.textAlign))
    out.push(r)
  })
  return out
}

/** Text of the cell the selection's head is in. */
const headCellText = (state: EditorState) => {
  const $h = state.selection.$head
  for (let d = $h.depth; d > 0; d--) {
    const role = ($h.node(d).type.spec as { tableRole?: string }).tableRole
    if (role === 'cell' || role === 'header_cell') return cellText($h.node(d))
  }
  return null
}

const jCell = (type: 'tableHeader' | 'tableCell', ...paras: string[]) => ({
  type,
  content: paras.map((t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] })),
})
const jRow = (...cells: object[]) => ({ type: 'tableRow', content: cells })
const docOf = (...content: object[]) => schema.nodeFromJSON({ type: 'doc', content })

// ── Selecting ────────────────────────────────────────────────────────────────

describe('selectRow / selectColumn', () => {
  it('select a whole row or column as a CellSelection', () => {
    const s = stateOf(T44, 'b')
    const rowTrs: Transaction[] = []
    expect(selectRow(2)(s, (tr) => rowTrs.push(tr))).toBe(true)
    const row = s.apply(rowTrs[0]).selection as CellSelection
    expect(row).toBeInstanceOf(CellSelection)
    expect(row.isRowSelection()).toBe(true)
    expect(getSelectedCellsData(s.apply(rowTrs[0]))?.rows).toEqual([['2', 'a', '9,5', '']])

    const colTrs: Transaction[] = []
    expect(selectColumn(2)(s, (tr) => colTrs.push(tr))).toBe(true)
    const colState = s.apply(colTrs[0])
    expect((colState.selection as CellSelection).isColSelection()).toBe(true)
    expect(getSelectedCellsData(colState)).toEqual({ rows: [['Score'], ['10'], ['9,5'], ['']], aligns: ['right'] })
  })

  it('the header row can be selected; out of range or outside a table → false', () => {
    const s = stateOf(T22, 'A')
    expect(selectRow(0)(s)).toBe(true)
    for (const cmd of [selectRow(2), selectRow(-1), selectRow(0.5), selectColumn(2), selectColumn(-1)]) expectRejected(s, cmd)
    const outside = stateOf(`text\n\n${T22}`, 'text')
    expectRejected(outside, selectRow(0))
    expect(selectRow(0, { tablePos: outside.doc.child(0).nodeSize })(outside)).toBe(true)
  })

  it('tablePos targets a given table regardless of the selection; a non-table position → false', () => {
    const s = stateOf(`${T22}\n\nmid\n\n${T44}`, 'A')
    const second = s.doc.child(0).nodeSize + s.doc.child(1).nodeSize
    const trs: Transaction[] = []
    expect(selectColumn(3, { tablePos: second })(s, (tr) => trs.push(tr))).toBe(true)
    expect(getSelectedCellsData(s.apply(trs[0]))?.rows).toEqual([['Note'], ['x'], [''], ['y']])
    expectRejected(s, selectColumn(3)) // the table around the cursor has 2 columns
    expectRejected(s, selectRow(0, { tablePos: s.doc.child(0).nodeSize }))
    expectRejected(s, selectRow(0, { tablePos: 9999 }))
    expectRejected(s, selectRow(0, { tablePos: -1 }))
  })
})

// ── Reading ──────────────────────────────────────────────────────────────────

describe('getTableData / getTableInfo / getSelectedCellsData', () => {
  it('reads the whole table with column aligns', () => {
    const s = stateOf(T44, 'b')
    expect(getTableInfo(s)).toEqual({ pos: 0, rows: 4, columns: 4 })
    expect(getTableData(s)).toEqual({
      rows: [['N', 'Name', 'Score', 'Note'], ['1', 'b', '10', 'x'], ['2', 'a', '9,5', ''], ['3', 'c', '', 'y']],
      aligns: [null, 'center', 'right', 'left'],
    })
  })

  it('cursor → its cell; CellSelection → its rectangle; outside → null', () => {
    const s = stateOf(T44, '9,5')
    expect(getSelectedCellsData(s)).toEqual({ rows: [['9,5']], aligns: ['right'] })
    expect(getSelectedCellsData(withCells(s, [3, 2], [1, 1]))?.rows).toEqual([['b', '10'], ['a', '9,5'], ['c', '']])
    expect(getSelectedCellsData(stateOf('x'))).toBeNull()
  })

  it('cell text joins blocks and hard breaks with \\n', () => {
    const s = stateOf(table([['A', 'B'], ['x<br>y', 'z']]))
    expect(getTableData(s)?.rows[1]).toEqual(['x\ny', 'z'])
    const multi = stateOf(docOf({ type: 'table', content: [
      jRow(jCell('tableHeader', 'A'), jCell('tableHeader', 'B')),
      jRow(jCell('tableCell', 'p1', 'p2'), jCell('tableCell', '')),
    ] }))
    expect(getTableData(multi)?.rows[1]).toEqual(['p1\np2', ''])
  })
})

// ── Moving ───────────────────────────────────────────────────────────────────

describe('moveRow', () => {
  it('moves a body row to its final index, both ways; the cursor follows its cell', () => {
    const s = stateOf(T44, 'b', )
    const down = apply(s, moveRow(1, 3))
    expect(save(down.doc)).toBe(table(
      [['N', 'Name', 'Score', 'Note'], ['2', 'a', '9,5', ''], ['3', 'c', '', 'y'], ['1', 'b', '10', 'x']],
      ['---', ':---:', '---:', ':---'],
    ))
    expect(headCellText(down)).toBe('b')
    expect(down.selection.head).toBe(textPos(down.doc, 'b'))

    const up = apply(stateOf(T44, 'c'), moveRow(3, 1))
    expect(getTableData(up)?.rows.map((r) => r[0])).toEqual(['N', '3', '1', '2'])
    expect(headCellText(up)).toBe('c')
  })

  it('keeps the cursor offset inside its cell', () => {
    const s = stateOf(table([['A', 'B'], ['hello', 'x'], ['y', 'z']]))
    const at = s.apply(s.tr.setSelection(TextSelection.create(s.doc, textPos(s.doc, 'hello', 1), textPos(s.doc, 'hello', 4))))
    const moved = apply(at, moveRow(1, 2))
    expect(moved.doc.textBetween(moved.selection.from, moved.selection.to)).toBe('ell')
  })

  it('a CellSelection follows its cells', () => {
    const s = withCells(stateOf(T44), [1, 1], [2, 2])
    const moved = apply(s, moveRow(3, 1))
    expect(getSelectedCellsData(moved)?.rows).toEqual([['b', '10'], ['a', '9,5']])
  })

  it('a whole selected row follows the moved row and stays whole', () => {
    const moved = apply(run(stateOf(T44), selectRow(1)), moveRow(1, 3))
    expect((moved.selection as CellSelection).isRowSelection()).toBe(true)
    expect(getSelectedCellsData(moved)?.rows).toEqual([['1', 'b', '10', 'x']])
  })

  it('a partial selection the move pulls apart never grows over other rows', () => {
    const SIX = table([['K', 'V'], ['a', '1'], ['z', '2'], ['b', '3'], ['c', '4'], ['d', '5'], ['e', '6']])
    const moved = apply(withCells(stateOf(SIX), [1, 0], [2, 0]), moveRow(1, 6))
    expect(moved.selection).toBeInstanceOf(TextSelection)
    expect(headCellText(moved)).toBe('z')
    const del = apply(fresh(moved), deleteSelectedRows)
    expect(getTableData(del)?.rows.map((r) => r[0])).toEqual(['K', 'b', 'c', 'd', 'e', 'a'])
  })

  it('rejects the header, out-of-range indices and from === to', () => {
    const s = stateOf(T44, 'b')
    for (const cmd of [moveRow(0, 2), moveRow(2, 0), moveRow(1, 4), moveRow(4, 1), moveRow(-1, 2), moveRow(2, 2), moveRow(1.5, 2)]) {
      expectRejected(s, cmd)
    }
    expectRejected(stateOf(HEADER_ONLY, 'A'), moveRow(1, 1))
  })

  it('a selection outside the table is mapped, not moved', () => {
    const s = stateOf(`before\n\n${T44}\n\nafter`, 'after')
    const moved = apply(s, moveRow(1, 2, { tablePos: s.doc.child(0).nodeSize }))
    expect(moved.selection.head).toBe(textPos(moved.doc, 'after'))
  })

  it('a CellSelection in another table is mapped, not moved', () => {
    const s0 = stateOf(`${T22}\n\nmid\n\n${T44}`)
    const second = s0.doc.child(0).nodeSize + s0.doc.child(1).nodeSize
    const s = withCells(s0, [0, 0], [1, 1])
    const moved = apply(s, moveRow(1, 3, { tablePos: second }))
    expect(moved.selection).toBeInstanceOf(CellSelection)
    expect(getSelectedCellsData(moved)?.rows).toEqual([['A', 'B'], ['1', '2']])
    expect(getTableData(moved, { tablePos: second })?.rows.map((r) => r[0])).toEqual(['N', '2', '3', '1'])
  })
})

describe('moveColumn', () => {
  it('moves a column with its header and its alignment', () => {
    const s = stateOf(T44, 'x')
    const moved = apply(s, moveColumn(2, 0))
    expect(save(moved.doc)).toBe(table(
      [['Score', 'N', 'Name', 'Note'], ['10', '1', 'b', 'x'], ['9,5', '2', 'a', ''], ['', '3', 'c', 'y']],
      ['---:', '---', ':---:', ':---'],
    ))
    expect(aligns(moved).every((r) => r.join() === 'right,,center,left')).toBe(true)
    expect(headCellText(moved)).toBe('x')

    const right = apply(s, moveColumn(0, 3))
    expect(getTableData(right)?.rows[0]).toEqual(['Name', 'Score', 'Note', 'N'])
    expect(getTableData(right)?.aligns).toEqual(['center', 'right', 'left', null])
  })

  it('a whole selected row stays whole when its first column moves to the end', () => {
    const moved = apply(run(stateOf(T44), selectRow(2)), moveColumn(0, 3))
    expect((moved.selection as CellSelection).isRowSelection()).toBe(true)
    expect(getSelectedCellsData(moved)?.rows).toEqual([['a', '9,5', '', '2']])
  })

  it('a whole selected column follows the moved column', () => {
    const moved = apply(run(stateOf(T44), selectColumn(1)), moveColumn(1, 3))
    expect((moved.selection as CellSelection).isColSelection()).toBe(true)
    expect(getSelectedCellsData(moved)).toEqual({ rows: [['Name'], ['b'], ['a'], ['c']], aligns: ['center'] })
  })

  it('works on a header-only table and on 2×2', () => {
    expect(save(apply(stateOf(HEADER_ONLY, 'A'), moveColumn(0, 1)).doc)).toBe(table([['B', 'A']], ['---:', '---']))
    expect(save(apply(stateOf(T22, '1'), moveColumn(1, 0)).doc)).toBe(table([['B', 'A'], ['2', '1']]))
  })

  it('rejects out-of-range indices and from === to', () => {
    const s = stateOf(T22, 'A')
    for (const cmd of [moveColumn(0, 2), moveColumn(2, 0), moveColumn(-1, 0), moveColumn(1, 1)]) expectRejected(s, cmd)
  })
})

// ── Duplicating / inserting ──────────────────────────────────────────────────

describe('duplicateRow / duplicateColumn', () => {
  it('duplicates a body row below it; the cursor stays on the original', () => {
    const s = stateOf(T44, 'a')
    const dup = apply(s, duplicateRow(2))
    expect(getTableData(dup)?.rows.map((r) => r.join(','))).toEqual(['N,Name,Score,Note', '1,b,10,x', '2,a,9,5,', '2,a,9,5,', '3,c,,y'])
    expect(aligns(dup)[3]).toEqual(aligns(s)[2])
    expect(dup.selection.head).toBe(textPos(dup.doc, 'a'))
  })

  it('duplicating the header makes a body row with the same content and attributes', () => {
    const s = stateOf(T44, 'N')
    const dup = apply(s, duplicateRow(0))
    expect(save(dup.doc).split('\n').slice(0, 3)).toEqual(['| N | Name | Score | Note |', '| --- | :---: | ---: | :--- |', '| N | Name | Score | Note |'])
    const copy = dup.doc.nodeAt(0)!.child(1)
    expect(copy.child(1).type.name).toBe('tableCell')
    expect(copy.child(1).attrs).toEqual(s.doc.nodeAt(0)!.child(0).child(1).attrs)
    expect(apply(stateOf(HEADER_ONLY), duplicateRow(0)).doc.nodeAt(0)!.childCount).toBe(2)
  })

  it('duplicates a column to its right with its alignment', () => {
    const dup = apply(stateOf(T44, 'b'), duplicateColumn(1))
    expect(save(dup.doc)).toBe(table(
      [['N', 'Name', 'Name', 'Score', 'Note'], ['1', 'b', 'b', '10', 'x'], ['2', 'a', 'a', '9,5', ''], ['3', 'c', 'c', '', 'y']],
      ['---', ':---:', ':---:', '---:', ':---'],
    ))
    expect(dup.selection.head).toBe(textPos(dup.doc, 'b'))
  })

  it('a row or column duplicated inside a CellSelection joins it', () => {
    const rows = apply(withCells(stateOf(T44), [1, 1], [2, 1]), duplicateRow(1))
    expect(getSelectedCellsData(rows)?.rows).toEqual([['b'], ['b'], ['a']])
    const cols = apply(withCells(stateOf(T44), [1, 1], [1, 2]), duplicateColumn(1))
    expect(getSelectedCellsData(cols)?.rows).toEqual([['b', 'b', '10']])
  })

  it('rejects out-of-range indices', () => {
    const s = stateOf(T22, 'A')
    for (const cmd of [duplicateRow(2), duplicateRow(-1), duplicateColumn(2), duplicateColumn(-1)]) expectRejected(s, cmd)
  })
})

describe('insertRowAt / insertColumnAt', () => {
  it('inserts an empty body row whose cells take the header alignment', () => {
    const s = stateOf(T44, 'b')
    const ins = apply(s, insertRowAt(1))
    expect(getTableData(ins)?.rows[1]).toEqual(['', '', '', ''])
    expect(aligns(ins)[1]).toEqual([null, 'center', 'right', 'left'])
    expect(headCellText(ins)).toBe('b')
    const end = apply(s, insertRowAt(4))
    expect(save(end.doc).split('\n').at(-1)).toBe('|   |   |   |   |')
    expect(apply(stateOf(HEADER_ONLY, 'A'), insertRowAt(1)).doc.nodeAt(0)!.childCount).toBe(2)
  })

  it('a row or column inserted inside a CellSelection joins it; outside, it does not', () => {
    const s = withCells(stateOf(T44), [1, 1], [2, 2])
    expect(getSelectedCellsData(apply(s, insertRowAt(2)))?.rows).toEqual([['b', '10'], ['', ''], ['a', '9,5']])
    expect(getSelectedCellsData(apply(s, insertColumnAt(2)))?.rows).toEqual([['b', '', '10'], ['a', '', '9,5']])
    expect(getSelectedCellsData(apply(s, insertRowAt(1)))?.rows).toEqual([['b', '10'], ['a', '9,5']])
  })

  it('nothing goes above the header; out of range → false', () => {
    const s = stateOf(T22, 'A')
    for (const cmd of [insertRowAt(0), insertRowAt(3), insertRowAt(-1)]) expectRejected(s, cmd)
  })

  it('inserts an empty column (header cell on top) with no alignment, anywhere', () => {
    const s = stateOf(T44, 'b')
    const first = apply(s, insertColumnAt(0))
    expect(save(first.doc).split('\n').slice(0, 2)).toEqual(['|   | N | Name | Score | Note |', '| --- | --- | :---: | ---: | :--- |'])
    expect(aligns(first).map((r) => r[0])).toEqual([null, null, null, null])
    expect(headCellText(first)).toBe('b')
    const last = apply(s, insertColumnAt(4))
    expect(getTableData(last)?.rows[1]).toEqual(['1', 'b', '10', 'x', ''])
    expectRejected(s, insertColumnAt(5))
    expectRejected(s, insertColumnAt(-1))
  })
})

// ── Sorting ──────────────────────────────────────────────────────────────────

describe('sortRowsByColumn', () => {
  const SORT = table([['Item', 'Qty'], ['b', '10'], ['a', ''], ['C', '-2,5'], ['A', '3']], ['---', '---:'])
  const col = (s: EditorState, c: number) => getTableData(s)!.rows.map((r) => r[c])

  it('numeric column: by value, empty cells last also descending; header stays', () => {
    const s = stateOf(SORT, 'b')
    const asc = apply(s, sortRowsByColumn(1, 'asc'))
    expect(col(asc, 1)).toEqual(['Qty', '-2,5', '3', '10', ''])
    expect(headCellText(asc)).toBe('b')
    expect(col(apply(s, sortRowsByColumn(1, 'desc')), 1)).toEqual(['Qty', '10', '3', '-2,5', ''])
  })

  it('text column: collator, case-insensitive, stable in both directions', () => {
    const s = stateOf(SORT)
    const asc = apply(s, sortRowsByColumn(0, 'asc', { locale: 'en' }))
    expect(getTableData(asc)!.rows.slice(1).map((r) => r.join(':'))).toEqual(['a:', 'A:3', 'b:10', 'C:-2,5'])
    const desc = apply(s, sortRowsByColumn(0, 'desc', { locale: 'en' }))
    expect(getTableData(desc)!.rows.slice(1).map((r) => r.join(':'))).toEqual(['C:-2,5', 'b:10', 'a:', 'A:3'])
  })

  it('keeps per-cell attributes and multi-block cells with their row', () => {
    const doc = docOf({ type: 'table', content: [
      jRow(jCell('tableHeader', 'K'), jCell('tableHeader', 'V')),
      jRow(jCell('tableCell', 'z'), jCell('tableCell', 'p1', 'p2')),
      jRow(jCell('tableCell', 'y'), jCell('tableCell', 'q')),
    ] })
    // Several paragraphs in a cell save as one with breaks (a documented
    // ambiguity), so this one is checked on the document, not the round trip.
    const sorted = apply(stateOf(doc), sortRowsByColumn(0, 'asc'), { lossless: false })
    const row2 = sorted.doc.nodeAt(0)!.child(2)
    expect(row2.child(1).childCount).toBe(2)
    expect(save(sorted.doc)).toBe(table([['K', 'V'], ['y', 'q'], ['z', 'p1<br>p2']]))
    // Sorting by a column with multi-block text compares its joined text.
    expect(col(apply(stateOf(doc), sortRowsByColumn(1, 'desc'), { lossless: false }), 1)).toEqual(['V', 'q', 'p1\np2'])
  })

  it('a whole selected column stays whole after sorting by it', () => {
    const s = run(stateOf(table([['K', 'V'], ['c', '1'], ['a', '2'], ['b', '3']])), selectColumn(0))
    const sorted = apply(s, sortRowsByColumn(0, 'asc'))
    expect((sorted.selection as CellSelection).isColSelection()).toBe(true)
    expect(getSelectedCellsData(sorted)?.rows).toEqual([['K'], ['a'], ['b'], ['c']])
  })

  it('a partial selection the sort pulls apart never grows over other rows', () => {
    const SIX = table([['K'], ['a'], ['z'], ['b'], ['c'], ['d'], ['e']].map((r) => [...r, r[0].toUpperCase()]))
    const s = withCells(stateOf(SIX), [1, 0], [2, 0])
    const sorted = apply(s, sortRowsByColumn(0, 'asc'))
    // a stays in row 1, z goes to row 6: the rectangle would take in b…e.
    expect(sorted.selection).toBeInstanceOf(TextSelection)
    expect(headCellText(sorted)).toBe('z')
    expect(sorted.selection.head).toBe(cellPos(sorted, 6, 0) + 2)
    const del = apply(fresh(sorted), deleteSelectedRows)
    expect(getTableData(del)?.rows.map((r) => r[0])).toEqual(['K', 'a', 'b', 'c', 'd', 'e'])
  })

  it('a partial selection whose cells stay together keeps its shape', () => {
    const s = withCells(stateOf(table([['K', 'V'], ['c', '1'], ['d', '2'], ['a', '3']])), [1, 0], [2, 1])
    const sorted = apply(s, sortRowsByColumn(0, 'asc'))
    expect(getSelectedCellsData(sorted)?.rows).toEqual([['c', '1'], ['d', '2']])
  })

  it('already in order → true without a transaction; < 2 body rows or bad column → false', () => {
    expectNoOp(stateOf(table([['A', 'B'], ['1', 'x'], ['2', 'y']])), sortRowsByColumn(0, 'asc'))
    expectRejected(stateOf(T22), sortRowsByColumn(0, 'asc'))
    expectRejected(stateOf(HEADER_ONLY), sortRowsByColumn(0, 'asc'))
    expectRejected(stateOf(SORT), sortRowsByColumn(2, 'asc'))
    expectRejected(stateOf(SORT), sortRowsByColumn(-1, 'desc'))
  })
})

// ── Clearing ─────────────────────────────────────────────────────────────────

describe('clearRow / clearColumn / clearSelectedCells', () => {
  it('clears a row, keeping the cells\' alignment; the cursor goes to the start of its cell', () => {
    const s = stateOf(T44, '10')
    const cleared = apply(s, clearRow(1))
    expect(getTableData(cleared)?.rows[1]).toEqual(['', '', '', ''])
    expect(aligns(cleared)).toEqual(aligns(s))
    expect(cleared.selection.empty).toBe(true)
    expect(cellPos(cleared, 1, 2) + 2).toBe(cleared.selection.head)
  })

  it('clears the header row (it stays a header); a column keeps its header cell', () => {
    const s = stateOf(T44, 'b')
    expect(save(apply(s, clearRow(0)).doc).split('\n')[0]).toBe('|   |   |   |   |')
    const col = apply(s, clearColumn(1))
    expect(getTableData(col)?.rows.map((r) => r[1])).toEqual(['Name', '', '', ''])
    expect(getTableData(col)?.aligns[1]).toBe('center')
  })

  it('a header-only table has no column cells to clear → false; an already empty column → no-op', () => {
    expectRejected(stateOf(HEADER_ONLY), clearColumn(0, { tablePos: 0 }))
    expectNoOp(stateOf(table([['A', 'B'], ['', '2']]), 'A'), clearColumn(0))
  })

  it('clears a CellSelection and keeps it; or the cursor\'s cell', () => {
    const s = withCells(stateOf(T44), [1, 1], [2, 3])
    const cleared = apply(s, clearSelectedCells)
    expect(cleared.selection).toBeInstanceOf(CellSelection)
    expect(getSelectedCellsData(cleared)?.rows).toEqual([['', '', ''], ['', '', '']])
    expect(getTableData(cleared)?.rows[3]).toEqual(['3', 'c', '', 'y'])
    expect(getTableData(apply(stateOf(T22, '2'), clearSelectedCells))?.rows).toEqual([['A', 'B'], ['1', '']])
  })

  it('multi-block cells become one empty paragraph', () => {
    const doc = docOf({ type: 'table', content: [
      jRow(jCell('tableHeader', 'A'), jCell('tableHeader', 'B')),
      jRow(jCell('tableCell', 'p1', 'p2'), jCell('tableCell', 'x')),
    ] })
    const cleared = apply(stateOf(doc), clearRow(1))
    expect(cleared.doc.nodeAt(0)!.child(1).child(0).childCount).toBe(1)
    expect(save(cleared.doc)).toBe(table([['A', 'B'], ['', '']]))
  })

  it('nothing to clear → true without a transaction; bad index or no cell → false', () => {
    expectNoOp(stateOf(table([['A', 'B'], ['', '']]), 'A'), clearRow(1))
    expectRejected(stateOf(T22, 'A'), clearRow(2))
    expectRejected(stateOf(T22, 'A'), clearColumn(2))
    expectRejected(stateOf(`x\n\n${T22}`, 'x'), clearSelectedCells)
    const tableNode = stateOf(T22)
    expectRejected(tableNode.apply(tableNode.tr.setSelection(NodeSelection.create(tableNode.doc, 0))), clearSelectedCells)
  })
})

// ── Deleting ─────────────────────────────────────────────────────────────────

describe('deleteSelectedRows', () => {
  it('deletes the cursor\'s row; the cursor lands on the row taking its place, same column', () => {
    const s = stateOf(T44, '9,5')
    const del = apply(s, deleteSelectedRows)
    expect(getTableData(del)?.rows.map((r) => r[0])).toEqual(['N', '1', '3'])
    expect(del.selection.head).toBe(cellPos(del, 2, 2) + 2)
  })

  it('the last row → the cursor goes to the new last row', () => {
    const del = apply(stateOf(T44, 'y'), deleteSelectedRows)
    expect(getTableData(del)?.rows.map((r) => r[0])).toEqual(['N', '1', '2'])
    expect(del.selection.head).toBe(cellPos(del, 2, 3) + 2)
  })

  it('a selection with the header deletes only its body rows; only the header → false', () => {
    const s = withCells(stateOf(T44), [0, 1], [2, 1])
    const del = apply(s, deleteSelectedRows)
    expect(getTableData(del)?.rows).toEqual([['N', 'Name', 'Score', 'Note'], ['3', 'c', '', 'y']])
    expectRejected(stateOf(T44, 'Name'), deleteSelectedRows)
    expectRejected(withCells(stateOf(T44), [0, 0], [0, 3]), deleteSelectedRows)
  })

  it('deleting every body row leaves a valid header-only table', () => {
    const del = apply(withCells(stateOf(T44), [1, 0], [3, 3]), deleteSelectedRows)
    expect(save(del.doc)).toBe(table([['N', 'Name', 'Score', 'Note']], ['---', ':---:', '---:', ':---']))
    expect(del.selection.head).toBe(cellPos(del, 0, 0) + 2)
  })

  it('outside a table → false', () => {
    expectRejected(stateOf(`x\n\n${T22}`, 'x'), deleteSelectedRows)
  })
})

describe('deleteSelectedColumns', () => {
  it('deletes the cursor\'s column; the cursor lands on the column taking its place', () => {
    const del = apply(stateOf(T44, 'b'), deleteSelectedColumns)
    expect(save(del.doc)).toBe(table(
      [['N', 'Score', 'Note'], ['1', '10', 'x'], ['2', '9,5', ''], ['3', '', 'y']],
      ['---', '---:', ':---'],
    ))
    expect(del.selection.head).toBe(cellPos(del, 1, 1) + 2)
  })

  it('deletes the CellSelection\'s columns, header included', () => {
    const del = apply(withCells(stateOf(T44), [2, 3], [0, 2]), deleteSelectedColumns)
    expect(getTableData(del)?.rows[0]).toEqual(['N', 'Name'])
    expect(del.selection.head).toBe(cellPos(del, 0, 1) + 2)
  })

  it('goes down to one column, which still saves and reloads as a table', () => {
    expect(MIN_TABLE_COLUMNS).toBe(1)
    // `apply` checks the markdown round trip of the resulting document.
    const del = apply(stateOf(T22, 'A'), deleteSelectedColumns)
    expect(save(del.doc)).toBe(table([['B'], ['2']]))
    expect(getTableData(stateOf(save(del.doc)), { tablePos: 0 })?.rows).toEqual([['B'], ['2']])
    expect(del.selection.head).toBe(cellPos(del, 0, 0) + 2)
    const three = apply(withCells(stateOf(T44), [0, 0], [0, 2]), deleteSelectedColumns)
    expect(save(three.doc)).toBe(table([['Note'], ['x'], [''], ['y']], [':---']))
  })

  it('never deletes every column', () => {
    expectRejected(withCells(stateOf(T22), [0, 0], [0, 1]), deleteSelectedColumns)
    expectRejected(withCells(stateOf(T44), [1, 0], [2, 3]), deleteSelectedColumns)
    expectRejected(stateOf(table([['H'], ['a']]), 'a'), deleteSelectedColumns)
  })
})

describe('deleteRow / deleteColumn (by index)', () => {
  it('deletes a body row; a selection elsewhere follows its cells', () => {
    const s = stateOf(T44, 'y')
    const del = apply(s, deleteRow(1, { tablePos: 0 }))
    expect(getTableData(del)?.rows.map((r) => r[0])).toEqual(['N', '2', '3'])
    expect(headCellText(del)).toBe('y')
  })

  it('a selection in the deleted row → cursor at the start of the row taking its place', () => {
    const s = run(stateOf(T44), selectRow(2))
    const del = apply(s, deleteRow(2))
    expect(getTableData(del)?.rows.map((r) => r[0])).toEqual(['N', '1', '3'])
    expect(del.selection.empty).toBe(true)
    expect(del.selection.head).toBe(cellPos(del, 2, 0) + 2)
    // The last row: the cursor goes to the new last row.
    const last = apply(run(stateOf(T44), selectRow(3)), deleteRow(3))
    expect(last.selection.head).toBe(cellPos(last, 2, 0) + 2)
  })

  it('the header row can\'t be deleted; out of range → false; every body row may go', () => {
    expectRejected(stateOf(T44, 'b'), deleteRow(0))
    expectRejected(stateOf(T44, 'b'), deleteRow(4))
    const one = apply(stateOf(T22, 'A'), deleteRow(1))
    expect(save(one.doc)).toBe(table([['A', 'B']]))
  })

  it('deletes a column, alignment and all; a selection in it → the header cell taking its place', () => {
    const s = run(stateOf(T44), selectColumn(1))
    const del = apply(s, deleteColumn(1))
    expect(save(del.doc)).toBe(table(
      [['N', 'Score', 'Note'], ['1', '10', 'x'], ['2', '9,5', ''], ['3', '', 'y']],
      ['---', '---:', ':---'],
    ))
    expect(del.selection.head).toBe(cellPos(del, 0, 1) + 2)
    const lastCol = apply(stateOf(T44, 'x'), deleteColumn(3))
    expect(getTableData(lastCol)?.rows[0]).toEqual(['N', 'Name', 'Score'])
    expect(lastCol.selection.head).toBe(cellPos(lastCol, 0, 2) + 2)
  })

  it('never deletes the only column; out of range → false', () => {
    expectRejected(stateOf(table([['H'], ['a']]), 'a'), deleteColumn(0))
    expectRejected(stateOf(T22, 'A'), deleteColumn(2))
    expect(save(apply(stateOf(T22, 'A'), deleteColumn(0)).doc)).toBe(table([['B'], ['2']]))
  })
})

describe('deleteTable', () => {
  it('deletes the table in one step; the cursor goes next to where it was', () => {
    const s = stateOf(`before\n\n${T22}\n\nafter`, '1')
    const del = apply(s, deleteTable())
    expect(save(del.doc)).toBe('before\n\nafter')
    expect(del.selection.$head.parent.textContent).toBe('after')
  })

  it('by position, and a table that was the only block leaves an empty paragraph', () => {
    const del = apply(stateOf(T22), deleteTable({ tablePos: 0 }))
    expect(del.doc.childCount).toBe(1)
    expect(del.doc.firstChild!.type.name).toBe('paragraph')
  })

  it('also a table with merged cells; outside a table or not at a table → false', () => {
    const doc = docOf({ type: 'table', content: [
      jRow({ ...jCell('tableHeader', 'wide'), attrs: { colspan: 2 } }),
      jRow(jCell('tableCell', '1'), jCell('tableCell', '2')),
    ] })
    const s = stateOf(doc, '1')
    expect(deleteTable()(s)).toBe(true)
    const trs: Transaction[] = []
    deleteTable()(s, (tr) => trs.push(tr))
    expect(trs).toHaveLength(1)
    expect(s.apply(trs[0]).doc.firstChild!.type.name).toBe('paragraph')
    expectRejected(stateOf(`x\n\n${T22}`, 'x'), deleteTable())
    expectRejected(stateOf(`x\n\n${T22}`, 'x'), deleteTable({ tablePos: 0 }))
  })
})

describe('alignColumn', () => {
  it('aligns every cell of the column; saved as the separator, one undo step', () => {
    const s = stateOf(T44, 'b')
    const aligned = apply(s, alignColumn(0, 'center', { tablePos: 0 }))
    expect(aligns(aligned).map((r) => r[0])).toEqual(['center', 'center', 'center', 'center'])
    expect(save(aligned.doc).split('\n')[1]).toBe('| :---: | :---: | ---: | :--- |')
    expect(headCellText(aligned)).toBe('b')
    const cleared = apply(s, alignColumn(1, null))
    expect(save(cleared.doc).split('\n')[1]).toBe('| --- | --- | ---: | :--- |')
  })

  it('keeps a CellSelection; already aligned → no-op; out of range → false', () => {
    const s = run(stateOf(T44), selectColumn(2))
    const aligned = apply(s, alignColumn(2, 'left'))
    expect(aligned.selection).toBeInstanceOf(CellSelection)
    expect(getCellSelectionRect(aligned)).toEqual({ top: 0, bottom: 4, left: 2, right: 3 })
    expectNoOp(s, alignColumn(2, 'right'))
    expectRejected(s, alignColumn(4, 'left'))
  })
})

describe('focusCell / findTablePos / getCellSelectionRect / getSelectionCell', () => {
  it('focusCell puts the cursor at the start of a cell (selection only)', () => {
    const s = stateOf(T44, 'b')
    const next = run(s, focusCell(3, 1, { tablePos: 0 }))
    expect(next.selection.head).toBe(cellPos(next, 3, 1) + 2)
    expect(next.doc.eq(s.doc)).toBe(true)
    expectRejected(s, focusCell(4, 0))
  })

  it('reads where the selection is', () => {
    const s = stateOf(`x\n\n${T44}`, 'b')
    const tablePos = findTablePos(s)!
    expect(s.doc.nodeAt(tablePos)!.type.name).toBe('table')
    expect(getSelectionCell(s)).toEqual({ tablePos, row: 1, col: 1 })
    expect(getCellSelectionRect(s)).toBeNull()
    const cells = withCells(s, [3, 2], [1, 1], tablePos)
    expect(getCellSelectionRect(cells, { tablePos })).toEqual({ top: 1, bottom: 4, left: 1, right: 3 })
    expect(getSelectionCell(cells)).toEqual({ tablePos, row: 1, col: 1 })
    expect(getCellSelectionRect(cells, { tablePos: 0 })).toBeNull()
    expect(findTablePos(stateOf(`x\n\n${T44}`, 'x'))).toBeNull()
    expect(getSelectionCell(stateOf(`x\n\n${T44}`, 'x'))).toBeNull()
  })
})

describe('tableActionCommand', () => {
  it('maps every menu action to its command on the target table', () => {
    const s = stateOf(`x\n\n${T44}`, 'x')
    const tablePos = findTablePos(stateOf(`x\n\n${T44}`, 'b'))!
    const target = { tablePos }
    const md = (action: Parameters<typeof tableActionCommand>[0]) =>
      save(apply(s, tableActionCommand(action, target)).doc).split('\n').slice(2)
    expect(md({ type: 'insertRow', index: 4 })).toHaveLength(6)
    expect(md({ type: 'insertColumn', index: 0 })[0]).toBe('|   | N | Name | Score | Note |')
    expect(md({ type: 'duplicateRow', index: 3 }).at(-1)).toBe('| 3 | c |   | y |')
    expect(md({ type: 'duplicateColumn', index: 0 })[0]).toBe('| N | N | Name | Score | Note |')
    expect(md({ type: 'moveRow', from: 3, to: 1 })[2]).toBe('| 3 | c |   | y |')
    expect(md({ type: 'moveColumn', from: 0, to: 3 })[0]).toBe('| Name | Score | Note | N |')
    expect(md({ type: 'sort', column: 1, direction: 'asc' })[2]).toBe('| 2 | a | 9,5 |   |')
    expect(md({ type: 'align', column: 0, align: 'right' })[1]).toBe('| ---: | :---: | ---: | :--- |')
    expect(md({ type: 'clearRow', index: 1 })[2]).toBe('|   |   |   |   |')
    expect(md({ type: 'clearColumn', index: 0 }).map((l) => l.split('|')[1].trim())).toEqual(['N', '---', '', '', ''])
    expect(md({ type: 'deleteRow', index: 1 })).toHaveLength(4)
    expect(md({ type: 'deleteColumn', index: 3 })[0]).toBe('| N | Name | Score |')
    expect(save(apply(s, tableActionCommand({ type: 'deleteTable' }, target)).doc)).toBe('x')
    expect(tableActionCommand({ type: 'clearSelection' }, target)(s)).toBe(false)
    expect(tableActionCommand({ type: 'clearSelection' })(withCells(s, [1, 0], [2, 1], tablePos))).toBe(true)
  })
})

// ── Unusual tables ───────────────────────────────────────────────────────────

describe('one-column, header-less and merged tables', () => {
  const oneCol = docOf({ type: 'table', content: [
    jRow(jCell('tableHeader', 'H')), jRow(jCell('tableCell', 'b')), jRow(jCell('tableCell', 'a')),
  ] })

  it('a one-column table sorts and grows, and its only column can\'t be deleted', () => {
    // `| H |` / `| --- |` loads back as a table: `apply` checks the round trip.
    const sorted = apply(stateOf(oneCol), sortRowsByColumn(0, 'asc'))
    expect(save(sorted.doc)).toBe(table([['H'], ['a'], ['b']]))
    expect(getTableData(sorted)?.rows).toEqual([['H'], ['a'], ['b']])
    const wider = apply(stateOf(oneCol), insertColumnAt(1))
    expect(getTableData(wider)?.rows).toEqual([['H', ''], ['b', ''], ['a', '']])
    expectRejected(stateOf(oneCol, 'b'), deleteSelectedColumns)
  })

  it('a table whose first row isn\'t a header gets one when rebuilt', () => {
    const doc = docOf({ type: 'table', content: [
      jRow(jCell('tableCell', 'x'), jCell('tableCell', 'y')),
      jRow(jCell('tableCell', '1'), jCell('tableCell', '2')),
      jRow(jCell('tableCell', '3'), jCell('tableCell', '4')),
    ] })
    const moved = apply(stateOf(doc), moveRow(1, 2))
    expect(save(moved.doc)).toBe(table([['x', 'y'], ['3', '4'], ['1', '2']]))
  })

  it('merged cells (pasted HTML) → every command refuses', () => {
    const doc = docOf({ type: 'table', content: [
      jRow({ ...jCell('tableHeader', 'wide'), attrs: { colspan: 2 } }),
      jRow(jCell('tableCell', '1'), jCell('tableCell', '2')),
      jRow(jCell('tableCell', '3'), jCell('tableCell', '4')),
    ] })
    const s = stateOf(doc, '1')
    for (const cmd of [
      selectRow(1), moveRow(1, 2), moveColumn(0, 1), duplicateRow(1), insertRowAt(1), insertColumnAt(0),
      sortRowsByColumn(0, 'desc'), clearRow(1), clearSelectedCells, deleteSelectedRows, deleteSelectedColumns,
      deleteRow(1), deleteColumn(0), alignColumn(0, 'left'), clearColumn(0), focusCell(1, 0),
      moveSelectedRow(1), moveSelectedColumn(1), insertRowBelow, insertColumnRight, duplicateSelectedRow,
    ]) expectRejected(s, cmd)
    expect(getTableData(s)).toBeNull()
  })
})

// ── Relative to the selection (keyboard shortcuts) ───────────────────────────

describe('moveSelectedRow / moveSelectedColumn', () => {
  it('move the cursor\'s body row / column one place; the cursor follows its cell', () => {
    let s = stateOf(T44, 'b')
    s = apply(s, moveSelectedRow(1))
    expect(getTableData(s)!.rows.map((r) => r[1])).toEqual(['Name', 'a', 'b', 'c'])
    expect(headCellText(s)).toBe('b')
    s = apply(fresh(s), moveSelectedColumn(-1))
    expect(getTableData(s)!.rows[0]).toEqual(['Name', 'N', 'Score', 'Note'])
    expect(aligns(s)[0]).toEqual(['center', null, 'right', 'left'])
    expect(headCellText(s)).toBe('b')
  })

  it('a CellSelection within one row / column moves; over several → false', () => {
    const s = stateOf(T44)
    const row = withCells(s, [2, 0], [2, 3])
    const moved = apply(row, moveSelectedRow(-1))
    expect((moved.selection as CellSelection).isRowSelection()).toBe(true)
    expect(getSelectedCellsData(moved)!.rows).toEqual([['2', 'a', '9,5', '']])
    expectRejected(withCells(s, [1, 0], [2, 0]), moveSelectedRow(1))
    expectRejected(withCells(s, [1, 0], [1, 1]), moveSelectedColumn(1))
    apply(withCells(s, [0, 1], [3, 1]), moveSelectedColumn(1))
  })

  it('the header row, the first body row up, the last row down, the edge columns → false', () => {
    expectRejected(stateOf(T44, 'Name'), moveSelectedRow(1))
    expectRejected(stateOf(T44, 'Name'), moveSelectedRow(-1))
    expectRejected(stateOf(T44, 'b'), moveSelectedRow(-1))
    expectRejected(stateOf(T44, 'c'), moveSelectedRow(1))
    expectRejected(stateOf(T44, 'N'), moveSelectedColumn(-1))
    expectRejected(stateOf(T44, 'Note'), moveSelectedColumn(1))
    expectRejected(stateOf(`text\n\n${T44}`, 'text'), moveSelectedRow(1))
  })
})

describe('insertRowBelow / insertColumnRight', () => {
  it('insert below the selection\'s last row / right of its last column; cursor in the new cell', () => {
    let s = apply(stateOf(T44, 'b'), insertRowBelow)
    expect(getTableData(s)!.rows[2]).toEqual(['', '', '', ''])
    expect(aligns(s)[2]).toEqual([null, 'center', 'right', 'left'])
    expect(s.selection.$head.parent.textContent).toBe('')
    expect(getSelectedCellsData(s)!.aligns).toEqual(['center'])

    s = apply(withCells(stateOf(T44), [1, 0], [2, 2]), insertRowBelow)
    expect(getTableData(s)!.rows.map((r) => r[0])).toEqual(['N', '1', '2', '', '3'])

    s = apply(stateOf(T44, 'Score'), insertColumnRight)
    expect(getTableData(s)!.rows[0]).toEqual(['N', 'Name', 'Score', '', 'Note'])
    expect(s.selection.$head.node(-1).type.name).toBe('tableHeader')
    expect(getSelectedCellsData(s)!.rows).toEqual([['']])
  })

  it('in the header, the row goes right below it', () => {
    const s = apply(stateOf(T44, 'Name'), insertRowBelow)
    expect(getTableData(s)!.rows[1]).toEqual(['', '', '', ''])
    expect(s.selection.$head.node(-2)).toBe(s.doc.nodeAt(0)!.child(1))
  })

  it('outside a table → false', () => {
    expectRejected(stateOf(`text\n\n${T22}`, 'text'), insertRowBelow)
    expectRejected(stateOf(`text\n\n${T22}`, 'text'), insertColumnRight)
  })
})

describe('duplicateSelectedRow', () => {
  it('copies the cursor\'s row below it; the cursor goes to the copy, same offset', () => {
    const s = stateOf(T44, 'b')
    const offset = s.selection.$head.parentOffset
    const next = apply(s, duplicateSelectedRow)
    expect(getTableData(next)!.rows.slice(1, 3)).toEqual([['1', 'b', '10', 'x'], ['1', 'b', '10', 'x']])
    expect(next.selection.$head.node(-2)).toBe(next.doc.nodeAt(0)!.child(2))
    expect(next.selection.$head.parentOffset).toBe(offset)
  })

  it('a CellSelection in one row → the same cells of the copy; over several rows → the head cell of the copy', () => {
    const one = apply(withCells(stateOf(T44), [3, 1], [3, 2]), duplicateSelectedRow)
    expect(getSelectedCellsData(one)!.rows).toEqual([['c', '']])
    expect(one.selection).toBeInstanceOf(CellSelection)
    const many = apply(withCells(stateOf(T44), [1, 0], [2, 3]), duplicateSelectedRow)
    expect(getTableData(many)!.rows.map((r) => r[0])).toEqual(['N', '1', '2', '2', '3'])
    expect(many.selection).toBeInstanceOf(TextSelection)
    expect(many.selection.$head.node(-2)).toBe(many.doc.nodeAt(0)!.child(3))
  })

  it('the header is never duplicated → false', () => {
    expectRejected(stateOf(T44, 'Name'), duplicateSelectedRow)
  })
})

describe('selectionInTable', () => {
  it('a cursor or a CellSelection in a table; not outside, nor a selection leaving it', () => {
    expect(selectionInTable(stateOf(T22, 'A'))).toBe(true)
    expect(selectionInTable(withCells(stateOf(T22), [0, 0], [1, 1]))).toBe(true)
    const mixed = stateOf(`text\n\n${T22}`)
    expect(selectionInTable(stateOf(`text\n\n${T22}`, 'text'))).toBe(false)
    const across = mixed.apply(mixed.tr.setSelection(TextSelection.create(mixed.doc, 1, textPos(mixed.doc, 'A'))))
    expect(selectionInTable(across)).toBe(false)
  })
})

// ── TipTap adapter ───────────────────────────────────────────────────────────

describe('runTableCommand / canRunTableCommand', () => {
  const editorOf = (md: string, editable = true) =>
    new Editor({ extensions: schemaExtensions(), content: htmlFromMarkdown(md), editable })

  it('runs one transaction on a real editor', () => {
    const ed = editorOf(T44)
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, textPos(ed.state.doc, 'b'))))
    let transactions = 0
    ed.on('transaction', () => { transactions++ })
    expect(canRunTableCommand(ed, moveRow(1, 3))).toBe(true)
    expect(transactions).toBe(0)
    expect(runTableCommand(ed, moveRow(1, 3))).toBe(true)
    expect(transactions).toBe(1)
    expect(htmlToMarkdown(ed.getHTML()).split('\n').at(-1)).toBe('| 1 | b | 10 | x |')
    expect(headCellText(ed.state)).toBe('b')
    expect(runTableCommand(ed, moveRow(0, 1))).toBe(false)
    expect(transactions).toBe(1)
    ed.destroy()
  })

  it('a read-only editor refuses', () => {
    const ed = editorOf(T22, false)
    expect(canRunTableCommand(ed, insertRowAt(1, { tablePos: 0 }))).toBe(false)
    expect(runTableCommand(ed, insertRowAt(1, { tablePos: 0 }))).toBe(false)
    ed.destroy()
  })
})
