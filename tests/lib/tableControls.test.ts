// @vitest-environment happy-dom
//
// The table controls' pure logic (src/lib/tableControls.ts): geometry of the
// handles / "+" bars / hover zone, drop targets of a dragged handle, menu
// placement, and the menus — whose enabled state comes from the real commands
// (tableOps.tableActionCommand) on the editor's real schema.

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import { undo, undoDepth } from '@tiptap/pm/history'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'
import {
  HOVER_GUTTER, MENU_MARGIN, NEAR_BOTTOM, NEAR_RIGHT, PLUS_GAP, PLUS_SIZE, cellMenu, clipSpan, columnDropTarget,
  columnHandleSpan, columnMenu, columnName, focusableItems, gapPosition, hotLines, hoverZone, menuMaxHeight, nearEdges,
  placeMenu, plusBars, rowDropTarget, rowHandleSpan, rowMenu, rowName, stepFocus, visibleBody,
  type Span, type TableAction, type TableGeometry, type TableMenuEntry, type TableMenuItem,
} from '../../src/lib/tableControls'
import {
  getCellSelectionRect, getTableData, insertRowAt, runTableCommand, tableActionCommand,
} from '../../src/components/Editor/tableOps'
import { runControlCommand } from '../../src/components/Editor/tableMenus'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown } from '../../src/lib/markdownHtml'
import { load } from '../helpers/editorPipeline'

// ── Geometry fixtures ────────────────────────────────────────────────────────

/** Spans of `sizes` laid end to end from `start`. */
function spans(start: number, sizes: number[]): Span[] {
  const out: Span[] = []
  let at = start
  for (const s of sizes) { out.push({ start: at, end: at + s }); at += s }
  return out
}

/** 3 columns of 100px from x=100, 3 rows of 30px from y=200; `view` = the table's scroll box. */
function geo(view?: Partial<TableGeometry['view']>): TableGeometry {
  const body = { left: 100, top: 200, right: 400, bottom: 290 }
  return { body, view: { ...body, ...view }, cols: spans(100, [100, 100, 100]), rows: spans(200, [30, 30, 30]) }
}

describe('geometry', () => {
  it('the visible rows are the body cut to the scroll box horizontally', () => {
    expect(visibleBody(geo())).toEqual({ left: 100, top: 200, right: 400, bottom: 290 })
    // Scrolled: the scroll box shows x 100…250 of a body that now starts at 40.
    const scrolled = { ...geo({ left: 100, right: 250 }), body: { left: 40, top: 200, right: 340, bottom: 290 } }
    expect(visibleBody(scrolled)).toEqual({ left: 100, top: 200, right: 250, bottom: 290 })
  })

  it('the hover zone takes in the handles\' and "+" bars\' gutters', () => {
    expect(hoverZone(geo())).toEqual({
      left: 100 - HOVER_GUTTER.left, top: 200 - HOVER_GUTTER.top,
      right: 400 + HOVER_GUTTER.right, bottom: 290 + HOVER_GUTTER.bottom,
    })
    expect(HOVER_GUTTER.right).toBeGreaterThan(PLUS_GAP + PLUS_SIZE)
    expect(HOVER_GUTTER.bottom).toBeGreaterThan(PLUS_GAP + PLUS_SIZE)
  })

  it('hot lines: each axis on its own (over a column handle only the column)', () => {
    expect(hotLines(geo(), 250, 245)).toEqual({ row: 1, col: 1 })
    expect(hotLines(geo(), 250, 195)).toEqual({ row: null, col: 1 })
    expect(hotLines(geo(), 95, 265)).toEqual({ row: 2, col: null })
    // A column scrolled out of the scroll box isn't hot.
    expect(hotLines(geo({ right: 250 }), 320, 210)).toEqual({ row: 0, col: null })
  })

  it('near the right / bottom edge, with the 56 / 28 px thresholds', () => {
    expect(nearEdges(geo(), 400 - NEAR_RIGHT + 1, 250)).toEqual({ right: true, bottom: false })
    expect(nearEdges(geo(), 400 - NEAR_RIGHT, 250).right).toBe(false)
    expect(nearEdges(geo(), 410, 250).right).toBe(true)
    expect(nearEdges(geo(), 410, 300).right).toBe(false)
    expect(nearEdges(geo(), 200, 290 - NEAR_BOTTOM + 1)).toEqual({ right: false, bottom: true })
    expect(nearEdges(geo(), 200, 290 - NEAR_BOTTOM).bottom).toBe(false)
    // The corner: both bars (a few px past the rows still count for the right one).
    expect(nearEdges(geo(), 390, 292)).toEqual({ right: true, bottom: true })
    // The visible right edge counts, not the scrolled-away one.
    expect(nearEdges(geo({ right: 250 }), 240, 250).right).toBe(true)
  })

  it('handles: inset from the line\'s ends, cut to the scroll box, dropped when too short', () => {
    expect(columnHandleSpan(geo(), 0)).toEqual({ start: 110, end: 190 })
    expect(rowHandleSpan(geo(), 2)).toEqual({ start: 266, end: 284 })
    expect(columnHandleSpan(geo({ right: 250 }), 1)).toEqual({ start: 210, end: 250 })
    expect(columnHandleSpan(geo({ right: 213 }), 1)).toBeNull()
    expect(columnHandleSpan(geo({ right: 250 }), 2)).toBeNull()
    expect(columnHandleSpan(geo(), 3)).toBeNull()
    expect(clipSpan(0, 10, 2, 20)).toEqual({ start: 2, end: 10 })
    expect(clipSpan(0, 10, 7, 20)).toBeNull()
  })

  it('"+" bars: outside the right / bottom edge; with no room on the right, slid in to stay visible', () => {
    const clip = { left: 0, top: 0, right: 800, bottom: 600 }
    expect(plusBars(geo(), clip)).toEqual({
      column: { left: 405, right: 405 + PLUS_SIZE, top: 200, bottom: 290 },
      row: { left: 100, right: 400, top: 295, bottom: 295 + PLUS_SIZE },
    })
    // A wide table filling the editor: its scroll box ends 4px before the scroller's edge.
    const wide = geo({ right: 396 })
    const bars = plusBars(wide, { ...clip, right: 400 })
    expect(bars.column.right).toBeLessThanOrEqual(400 - 2)
    expect(bars.column.left).toBe(400 - 2 - PLUS_SIZE)
    expect(bars.row).toEqual({ left: 100, right: 396, top: 295, bottom: 295 + PLUS_SIZE })
  })
})

// ── Drop targets ─────────────────────────────────────────────────────────────

describe('drop targets', () => {
  const cols = spans(0, [100, 100, 100, 100])
  const rows = spans(0, [30, 30, 30, 30])

  it('gap positions', () => {
    expect([0, 1, 2, 3, 4].map((g) => gapPosition(cols, g))).toEqual([0, 100, 200, 300, 400])
  })

  it('a column goes to the nearest gap; its own gaps are a no-op', () => {
    expect(columnDropTarget(cols, 1, 10)).toEqual({ gap: 0, to: 0, blocked: false })
    expect(columnDropTarget(cols, 1, 290)).toEqual({ gap: 3, to: 2, blocked: false })
    expect(columnDropTarget(cols, 1, 999)).toEqual({ gap: 4, to: 3, blocked: false })
    expect(columnDropTarget(cols, 3, 0)).toEqual({ gap: 0, to: 0, blocked: false })
    expect(columnDropTarget(cols, 1, 110)).toEqual({ gap: null, to: null, blocked: false })
    expect(columnDropTarget(cols, 1, 190)).toEqual({ gap: null, to: null, blocked: false })
    expect(columnDropTarget([], 0, 5)).toEqual({ gap: null, to: null, blocked: false })
  })

  it('a row never goes above the header: over it, blocked', () => {
    expect(rowDropTarget(rows, 3, 25)).toEqual({ gap: null, to: null, blocked: true })
    expect(rowDropTarget(rows, 3, 31)).toEqual({ gap: 1, to: 1, blocked: false })
    expect(rowDropTarget(rows, 1, 118)).toEqual({ gap: 4, to: 3, blocked: false })
    expect(rowDropTarget(rows, 2, 61)).toEqual({ gap: null, to: null, blocked: false })
    expect(rowDropTarget(rows, 2, 89)).toEqual({ gap: null, to: null, blocked: false })
    expect(rowDropTarget(rows.slice(0, 1), 0, 50)).toEqual({ gap: null, to: null, blocked: false })
  })
})

// ── Menu placement ───────────────────────────────────────────────────────────

describe('placeMenu', () => {
  const vp = { width: 1000, height: 800 }
  const size = { width: 240, height: 300 }
  const anchor = { left: 100, top: 100, right: 140, bottom: 115 }

  it('below an anchor; above when it doesn\'t fit; always inside the window', () => {
    expect(placeMenu(anchor, size, vp, 'below')).toEqual({ left: 100, top: 121 })
    expect(placeMenu({ ...anchor, top: 600, bottom: 615 }, size, vp, 'below')).toEqual({ left: 100, top: 294 })
    expect(placeMenu({ left: 900, top: 100, right: 940, bottom: 115 }, size, vp, 'below')).toEqual({ left: 752, top: 121 })
    expect(placeMenu({ left: 100, top: 200, right: 140, bottom: 600 }, size, { width: 1000, height: 400 }, 'below').top).toBe(8)
  })

  it('right of an anchor; left of it when it doesn\'t fit', () => {
    expect(placeMenu(anchor, size, vp, 'right')).toEqual({ left: 146, top: 96 })
    expect(placeMenu({ left: 900, top: 100, right: 915, bottom: 130 }, size, vp, 'right')).toEqual({ left: 654, top: 96 })
    expect(placeMenu({ left: 100, top: 700, right: 115, bottom: 730 }, size, vp, 'right').top).toBe(492)
  })

  it('a menu taller than the window is placed at its capped height: its end is never cut off', () => {
    // A sticky window opens at 300 × 300; the cell menu is ~460px tall.
    const small = { width: 300, height: 300 }
    expect(menuMaxHeight(300)).toBe(300 - 2 * MENU_MARGIN)
    const tall = { width: 240, height: 460 }
    for (const placement of ['below', 'right', 'point'] as const) {
      const { top } = placeMenu({ left: 20, top: 120, right: 30, bottom: 135 }, tall, small, placement)
      expect(top).toBe(MENU_MARGIN)
      expect(top + menuMaxHeight(300)).toBeLessThanOrEqual(300 - MENU_MARGIN)
    }
    // A capped menu that fits above its anchor still flips there.
    expect(placeMenu({ left: 20, top: 500, right: 60, bottom: 515 }, size, vp, 'below')).toEqual({ left: 20, top: 194 })
    expect(placeMenu({ left: 20, top: 700, right: 60, bottom: 715 }, { width: 240, height: 2000 }, vp, 'below').top).toBe(8)
  })

  it('at a point; flipped up / left near the window\'s edges', () => {
    const at = (x: number, y: number) => ({ left: x, top: y, right: x, bottom: y })
    expect(placeMenu(at(300, 300), size, vp, 'point')).toEqual({ left: 302, top: 302 })
    expect(placeMenu(at(900, 700), size, vp, 'point')).toEqual({ left: 658, top: 398 })
    expect(placeMenu(at(0, 0), size, vp, 'point')).toEqual({ left: 8, top: 8 })
  })
})

// ── Menus (enabled state from the real commands) ─────────────────────────────

function table(rows: string[][], seps?: string[]): string {
  const line = (r: string[]) => '| ' + r.map((c) => c || ' ').join(' | ') + ' |'
  const sep = '| ' + (seps ?? rows[0].map(() => '---')).join(' | ') + ' |'
  return [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n')
}

const T44 = table(
  [['N', 'Name', 'Score', 'Note'], ['1', 'b', '10', 'x'], ['2', 'a', '9,5', ''], ['3', 'c', '', 'y']],
  ['---', ':---:', '---:', ':---'],
)
const m = en.editor.table

function setup(md: string) {
  const doc = load(md)
  const state = EditorState.create({ doc, selection: TextSelection.atStart(doc) })
  const can = (s: EditorState) => (a: TableAction) => tableActionCommand(a, { tablePos: 0 })(s)
  return { state, can: can(state), data: getTableData(state, { tablePos: 0 })!, canOn: can }
}

const byId = (entries: TableMenuEntry[], id: string) =>
  entries.find((e): e is TableMenuItem => e.type === 'item' && e.id === id)!
const ids = (entries: TableMenuEntry[]) => entries.map((e) => (e.type === 'item' ? e.id : e.type))
const disabledIds = (entries: TableMenuEntry[]) =>
  entries.filter((e): e is TableMenuItem => e.type === 'item' && e.disabled).map((e) => e.id)

describe('column menu', () => {
  it('lists its entries in order, titled with the header text', () => {
    const { data, can } = setup(T44)
    const menu = columnMenu(data, 1, can, m)
    expect(menu[0]).toEqual({ type: 'heading', label: 'Column · Name' })
    expect(ids(menu)).toEqual([
      'heading', 'insertLeft', 'insertRight', 'duplicateColumn', 'separator', 'moveLeft', 'moveRight', 'separator',
      'align', 'sortAsc', 'sortDesc', 'separator', 'clearColumn', 'deleteColumn',
    ])
    expect(disabledIds(menu)).toEqual([])
    expect(menu.find((e) => e.type === 'align')).toEqual({ type: 'align', column: 1, current: 'center' })
    expect(byId(menu, 'sortAsc').label).toBe('Sort A → Z')
    expect(byId(menu, 'deleteColumn').danger).toBe(true)
    expect(byId(menu, 'insertRight').action).toEqual({ type: 'insertColumn', index: 2 })
    // No shortcut hints yet (the table shortcuts come later).
    expect(menu.some((e) => e.type === 'item' && e.kbd)).toBe(false)
  })

  it('a numeric column sorts 1 → 9; an empty header is "Column N"', () => {
    const { data, can } = setup(table([['', 'B'], ['3', 'x'], ['1,5', 'y']]))
    const menu = columnMenu(data, 0, can, m)
    expect(menu[0]).toEqual({ type: 'heading', label: 'Column 1' })
    expect(byId(menu, 'sortAsc')).toMatchObject({ label: 'Sort 1 → 9', icon: 'sortNumAsc' })
    expect(byId(menu, 'sortDesc')).toMatchObject({ label: 'Sort 9 → 1', icon: 'sortNumDesc' })
  })

  it('the impossible entries are disabled (not hidden), with a reason where it helps', () => {
    const { data, can } = setup(T44)
    expect(disabledIds(columnMenu(data, 0, can, m))).toEqual(['moveLeft'])
    expect(disabledIds(columnMenu(data, 3, can, m))).toEqual(['moveRight'])
    expect(byId(columnMenu(data, 3, can, m), 'moveRight').reason).toBeUndefined()

    const one = setup(table([['H'], ['a']]))
    const menu = columnMenu(one.data, 0, one.can, m)
    expect(disabledIds(menu)).toEqual(['moveLeft', 'moveRight', 'sortAsc', 'sortDesc', 'deleteColumn'])
    expect(byId(menu, 'deleteColumn').reason).toBe(m.needsOneColumn)
    expect(byId(menu, 'sortAsc').reason).toBe(m.sortNeedsRows)

    const headerOnly = setup(table([['A', 'B']]))
    expect(disabledIds(columnMenu(headerOnly.data, 0, headerOnly.can, m)))
      .toEqual(['moveLeft', 'sortAsc', 'sortDesc', 'clearColumn'])
  })
})

describe('row menu', () => {
  it('a body row: its entries, and the moves that would cross the header or the end', () => {
    const { can } = setup(T44)
    const first = rowMenu(1, can, m)
    expect(first[0]).toEqual({ type: 'heading', label: 'Row 1' })
    expect(ids(first)).toEqual([
      'heading', 'insertAbove', 'insertBelow', 'duplicateRow', 'separator', 'moveUp', 'moveDown', 'separator',
      'clearRow', 'deleteRow',
    ])
    expect(disabledIds(first)).toEqual(['moveUp'])
    expect(byId(first, 'moveUp').reason).toBe(m.onlyHeaderAbove)
    expect(byId(first, 'insertBelow').action).toEqual({ type: 'insertRow', index: 2 })
    expect(disabledIds(rowMenu(3, can, m))).toEqual(['moveDown'])
    expect(byId(rowMenu(3, can, m), 'moveDown').reason).toBeUndefined()
    expect(disabledIds(rowMenu(2, can, m))).toEqual([])
  })

  it('the header: same entries, the impossible ones disabled, "Clear header" and the note', () => {
    const { can } = setup(T44)
    const menu = rowMenu(0, can, m)
    expect(menu[0]).toEqual({ type: 'heading', label: 'Header' })
    expect(disabledIds(menu)).toEqual(['insertAbove', 'moveUp', 'moveDown', 'deleteRow'])
    for (const id of ['insertAbove', 'moveUp', 'moveDown', 'deleteRow']) expect(byId(menu, id).reason).toBe(m.headerFixed)
    expect(byId(menu, 'clearRow').label).toBe('Clear header')
    // Duplicating the header is allowed by the commands: the copy is a body row.
    expect(byId(menu, 'duplicateRow').disabled).toBe(false)
    expect(menu.at(-1)).toEqual({ type: 'note', text: m.headerNote })
  })
})

describe('cell menu (right-click / toolbar)', () => {
  it('row and column groups, align, sort, Delete table', () => {
    const { data, can } = setup(T44)
    const menu = cellMenu(data, { row: 2, col: 2 }, null, can, m)
    expect(ids(menu)).toEqual([
      'heading', 'insertRowAbove', 'insertRowBelow', 'duplicateRow', 'deleteRow',
      'heading', 'insertColumnLeft', 'insertColumnRight', 'duplicateColumn', 'deleteColumn', 'align',
      'sortAsc', 'sortDesc', 'separator', 'deleteTable',
    ])
    expect(menu.filter((e) => e.type === 'heading')).toEqual([
      { type: 'heading', label: 'Row' }, { type: 'heading', label: 'Column' },
    ])
    expect(byId(menu, 'sortAsc').label).toBe('Sort by this column 1 → 9')
    expect(byId(menu, 'deleteRow').action).toEqual({ type: 'deleteRow', index: 2 })
    expect(byId(menu, 'deleteTable')).toMatchObject({ danger: true, disabled: false, action: { type: 'deleteTable' } })
    expect(disabledIds(menu)).toEqual([])
  })

  it('on the header: what would touch the header row is disabled', () => {
    const { data, can } = setup(T44)
    const menu = cellMenu(data, { row: 0, col: 0 }, null, can, m)
    expect(disabledIds(menu)).toEqual(['insertRowAbove', 'deleteRow'])
    expect(byId(menu, 'insertRowAbove').reason).toBe(m.headerFixed)
  })

  it('"Clear N cells" only for a cell selection of 2+ cells', () => {
    const { state, data, canOn } = setup(T44)
    const t = state.doc.nodeAt(0)!
    const map = TableMap.get(t)
    const sel = (a: [number, number], b: [number, number]) => state.apply(state.tr.setSelection(CellSelection.create(
      state.doc, 1 + map.positionAt(...a, t), 1 + map.positionAt(...b, t),
    )))
    const two = sel([1, 1], [2, 2])
    const rect = getCellSelectionRect(two, { tablePos: 0 })
    const menu = cellMenu(data, { row: 1, col: 1 }, rect, canOn(two), m)
    expect(byId(menu, 'clearCells')).toMatchObject({ label: 'Clear 4 cells', action: { type: 'clearSelection' }, disabled: false })
    const single = sel([1, 1], [1, 1])
    expect(byId(cellMenu(data, { row: 1, col: 1 }, getCellSelectionRect(single, { tablePos: 0 }), canOn(single), m), 'clearCells')).toBeUndefined()
    expect(byId(cellMenu(data, { row: 1, col: 1 }, null, canOn(state), m), 'clearCells')).toBeUndefined()
  })

  it('a table the commands can\'t edit (no data) → only Delete table', () => {
    const { can } = setup(T44)
    expect(ids(cellMenu(null, { row: 0, col: 0 }, null, can, m))).toEqual(['deleteTable'])
  })

  it('labels exist in Spanish too', () => {
    const { data, can } = setup(T44)
    const menu = cellMenu(data, { row: 1, col: 1 }, null, can, es.editor.table)
    expect(byId(menu, 'insertColumnLeft').label).toBe('Insertar columna a la izquierda')
    expect(byId(menu, 'sortAsc').label).toBe('Ordenar por esta columna A → Z')
  })
})

describe('names and keyboard focus', () => {
  it('column / row names for titles and the drag ghost', () => {
    const { data } = setup(table([['', 'B'], ['', 'x'], ['', '']]))
    expect(columnName(data, 0, m)).toBe('Column 1')
    expect(columnName(data, 1, m)).toBe('B')
    expect(rowName(data, 0, m)).toBe('Header')
    expect(rowName(data, 1, m)).toBe('x')
    expect(rowName(data, 2, m)).toBe('Row 2')
  })

  it('↑/↓ walk the enabled items only, wrapping', () => {
    const { can } = setup(T44)
    const items = focusableItems(rowMenu(1, can, m))
    expect(items.map((i) => i.id)).toEqual(['insertAbove', 'insertBelow', 'duplicateRow', 'moveDown', 'clearRow', 'deleteRow'])
    expect(stepFocus(-1, 6, 1)).toBe(0)
    expect(stepFocus(-1, 6, -1)).toBe(5)
    expect(stepFocus(5, 6, 1)).toBe(0)
    expect(stepFocus(0, 6, -1)).toBe(5)
    expect(stepFocus(-1, 0, 1)).toBe(-1)
  })
})

// ── Undo steps (real history plugin) ─────────────────────────────────────────

describe('runControlCommand: every control action is its own undo step', () => {
  // All within prosemirror-history's 500 ms newGroupDelay: adjacent edits would merge.
  const editorOf = () => new Editor({ extensions: [...schemaExtensions(), History], content: htmlFromMarkdown(T44) })
  const cursorAt = (ed: Editor, text: string) => {
    let pos = -1
    ed.state.doc.descendants((n, at) => {
      if (pos < 0 && n.isText && n.text!.startsWith(text)) pos = at
      return pos < 0
    })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)))
  }
  const rows = (ed: Editor) => ed.state.doc.nodeAt(0)!.childCount
  const type = (ed: Editor, text: string) => ed.view.dispatch(ed.state.tr.insertText(text))

  it('two actions in quick succession (a double click on "+") → two undo steps', () => {
    const ed = editorOf()
    expect(runControlCommand(ed, insertRowAt(4, { tablePos: 0 }))).toBe(true)
    expect(runControlCommand(ed, insertRowAt(5, { tablePos: 0 }))).toBe(true)
    expect(rows(ed)).toBe(6)
    expect(undoDepth(ed.state)).toBe(2)
    undo(ed.state, ed.view.dispatch)
    expect(rows(ed)).toBe(5)
    ed.destroy()
  })

  it('typing, an action, typing again → three undo steps', () => {
    const ed = editorOf()
    cursorAt(ed, 'b')
    type(ed, 'x')
    runControlCommand(ed, insertRowAt(1, { tablePos: 0 }))
    type(ed, 'y')
    expect(undoDepth(ed.state)).toBe(3)
    undo(ed.state, ed.view.dispatch)
    undo(ed.state, ed.view.dispatch)
    expect(rows(ed)).toBe(4)
    expect(getTableData(ed.state, { tablePos: 0 })!.rows[1][1]).toBe('xb')
    ed.destroy()
  })

  it('runTableCommand (the shortcuts\' path) keeps the default grouping; a refused action dispatches nothing', () => {
    const ed = editorOf()
    runTableCommand(ed, insertRowAt(4, { tablePos: 0 }))
    runTableCommand(ed, insertRowAt(5, { tablePos: 0 }))
    expect(undoDepth(ed.state)).toBe(1)
    let transactions = 0
    ed.on('transaction', () => { transactions++ })
    expect(runControlCommand(ed, insertRowAt(0, { tablePos: 0 }))).toBe(false)
    expect(transactions).toBe(0)
    ed.destroy()
  })
})
