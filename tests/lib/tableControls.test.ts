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
  HANDLE_GROWN, HANDLE_GROWN_OFFSET, HOVER_GUTTER, MENU_MARGIN, MIN_PLUS_SIZE, NEAR_BOTTOM, NEAR_RIGHT, PLUS_GAP, PLUS_SIZE, cellMenu, clipSpan, columnDropTarget,
  columnHandleSpan, columnMenu, columnName, focusableItems, gapPosition, handleAnchor, hotLines, menuKeyAction, menuShortcutHints, hoverZone, menuMaxHeight, nearEdges,
  placeMenu, plusBars, rowDropTarget, rowHandleSpan, rowMenu, rowName, stepFocus, visibleBody,
  type Span, type TableAction, type TableGeometry, type TableMenuEntry, type TableMenuItem,
} from '../../src/lib/tableControls'
import {
  getCellSelectionRect, getTableData, insertRowAt, runTableCommand, tableActionCommand,
} from '../../src/components/Editor/tableOps'
import { runControlCommand } from '../../src/components/Editor/tableMenus'
import {
  deleteSelectedColumns, deleteSelectedRows, duplicateSelectedRow, insertColumnRight, insertRowBelow,
  moveSelectedColumn, moveSelectedRow, selectColumn, selectRow,
} from '../../src/components/Editor/tableOps'
import { shortcutText, tableShortcuts } from '../../src/lib/tableShortcuts'
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
function geo(view?: Partial<TableGeometry['view']>, roomBottom = 290 + 24): TableGeometry {
  const body = { left: 100, top: 200, right: 400, bottom: 290 }
  return { body, view: { ...body, ...view }, cols: spans(100, [100, 100, 100]), rows: spans(200, [30, 30, 30]), roomBottom }
}

describe('geometry', () => {
  it('the visible rows are the body cut to the scroll box horizontally', () => {
    expect(visibleBody(geo())).toEqual({ left: 100, top: 200, right: 400, bottom: 290 })
    // Scrolled: the scroll box shows x 100…250 of a body that now starts at 40.
    const scrolled = { ...geo({ left: 100, right: 250 }), body: { left: 40, top: 200, right: 340, bottom: 290 } }
    expect(visibleBody(scrolled)).toEqual({ left: 100, top: 200, right: 250, bottom: 290 })
  })

  it('the hover zone takes in the handles\' and "+" bars\' gutters', () => {
    expect(hoverZone(geo({}, 400))).toEqual({
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

  it('menus anchor on the handle\'s computed grown rect (not a live, maybe mid-transition, DOM rect)', () => {
    expect(handleAnchor(geo(), 'column', 1)).toEqual({
      left: 210, right: 290, top: 200 - HANDLE_GROWN_OFFSET, bottom: 200 - HANDLE_GROWN_OFFSET + HANDLE_GROWN,
    })
    expect(handleAnchor(geo(), 'row', 2)).toEqual({
      left: 100 - HANDLE_GROWN_OFFSET, right: 100 - HANDLE_GROWN_OFFSET + HANDLE_GROWN, top: 266, bottom: 284,
    })
    // Scrolled table: column cut to the scroll box, rows on its visible left edge.
    const scrolled = { ...geo({ left: 100, right: 250 }), body: { left: 40, top: 200, right: 340, bottom: 290 } }
    expect(handleAnchor(scrolled, 'row', 0)).toMatchObject({ left: 100 - HANDLE_GROWN_OFFSET })
    expect(handleAnchor(geo({ right: 250 }), 'column', 1)).toMatchObject({ left: 210, right: 250 })
    expect(handleAnchor(geo({ right: 250 }), 'column', 2)).toBeNull()
  })

  describe('"+" bars: only in room that is the table\'s own', () => {
    const inside = (bar: { top: number; bottom: number } | null, from: number, to: number) =>
      !!bar && bar.top > from && bar.bottom < to
    const intersects = (a: { left: number; top: number; right: number; bottom: number }, b: typeof a) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

    it('full size with the editor\'s reserved margin (24px) and its right padding (24px)', () => {
      expect(plusBars(geo(), 424)).toEqual({
        column: { left: 400 + PLUS_GAP, right: 400 + PLUS_GAP + PLUS_SIZE, top: 200, bottom: 290 },
        row: { left: 100, right: 400, top: 290 + PLUS_GAP, bottom: 290 + PLUS_GAP + PLUS_SIZE },
      })
    })

    it('the row bar never reaches the next block, whatever the room below', () => {
      // The next block's rect: it starts where the table's room ends (or above it).
      for (const room of [0, 4, 9, 10, 12, 18, 24, 40]) {
        const g = geo({}, 290 + room)
        const nextBlock = { left: 0, right: 1000, top: g.roomBottom, bottom: g.roomBottom + 20 }
        const { row } = plusBars(g, 424)
        if (room - 2 < MIN_PLUS_SIZE) { expect(row, `room ${room}`).toBeNull(); continue }
        expect(inside(row, 290, g.roomBottom), `room ${room}`).toBe(true)
        expect(intersects(row!, nextBlock), `room ${room}`).toBe(false)
        expect(row!.bottom - row!.top).toBe(Math.min(PLUS_SIZE, room - 2))
      }
    })

    it('below the table\'s own horizontal scrollbar, never over it', () => {
      // A scrolling table: its scroll box ends 6px below the rows (the scrollbar).
      const g = geo({ right: 300, bottom: 296 }, 296 + 24)
      const { row } = plusBars(g, 424)
      expect(row!.top).toBeGreaterThan(296)
      expect(row!.bottom).toBeLessThan(320)
      expect(row).toMatchObject({ left: 100, right: 300 })
    })

    it('the column bar never covers the cells: thinner in a narrow padding, gone without room', () => {
      // A wide table filling the editor: rows visible up to x=396, editor content ends there.
      const wide = geo({ right: 396 })
      for (const limit of [396, 400, 404, 406, 408, 420, 440]) {
        const { column } = plusBars(wide, limit)
        if (limit - 396 - 2 < MIN_PLUS_SIZE) { expect(column, `limit ${limit}`).toBeNull(); continue }
        expect(column!.left, `limit ${limit}`).toBeGreaterThan(396)
        expect(column!.right, `limit ${limit}`).toBeLessThan(limit)
      }
      // A sticky's 12px padding: a 10px bar.
      expect(plusBars(wide, 396 + 12).column).toMatchObject({ left: 397, right: 407 })
    })

    it('the hover zone stops at the table\'s room: the next block\'s first line isn\'t the table', () => {
      expect(hoverZone(geo({}, 290 + 24)).bottom).toBe(314)
      expect(hoverZone(geo({}, 290 + 100)).bottom).toBe(290 + HOVER_GUTTER.bottom)
      expect(hoverZone(geo({}, 290)).bottom).toBe(290)
    })
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
  it('short: insert / delete row and column, Delete table (duplicate, align and sort live in the handles)', () => {
    const { data, can } = setup(T44)
    const menu = cellMenu(data, { row: 2, col: 2 }, null, can, m)
    expect(ids(menu)).toEqual([
      'heading', 'insertRowAbove', 'insertRowBelow', 'deleteRow',
      'heading', 'insertColumnLeft', 'insertColumnRight', 'deleteColumn',
      'separator', 'deleteTable',
    ])
    expect(menu.filter((e) => e.type === 'heading')).toEqual([
      { type: 'heading', label: 'Row' }, { type: 'heading', label: 'Column' },
    ])
    expect(menu.some((e) => e.type === 'align')).toBe(false)
    expect(byId(menu, 'insertRowAbove').action).toEqual({ type: 'insertRow', index: 2 })
    expect(byId(menu, 'insertColumnRight').action).toEqual({ type: 'insertColumn', index: 3 })
    expect(byId(menu, 'deleteRow').action).toEqual({ type: 'deleteRow', index: 2 })
    expect(byId(menu, 'deleteColumn').action).toEqual({ type: 'deleteColumn', index: 2 })
    expect(byId(menu, 'deleteTable')).toMatchObject({ danger: true, disabled: false, action: { type: 'deleteTable' } })
    expect(disabledIds(menu)).toEqual([])
  })

  it('on the header: what would touch the header row is disabled', () => {
    const { data, can } = setup(T44)
    const menu = cellMenu(data, { row: 0, col: 0 }, null, can, m)
    expect(disabledIds(menu)).toEqual(['insertRowAbove', 'deleteRow'])
    expect(byId(menu, 'insertRowAbove').reason).toBe(m.headerFixed)
    expect(byId(menu, 'deleteRow').reason).toBe(m.headerFixed)
    // The only column of a table can't go.
    const one = setup(table([['H'], ['a']]))
    const single = cellMenu(one.data, { row: 1, col: 0 }, null, one.can, m)
    expect(disabledIds(single)).toEqual(['deleteColumn'])
    expect(byId(single, 'deleteColumn').reason).toBe(m.needsOneColumn)
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
    expect(byId(menu, 'deleteTable').label).toBe('Eliminar tabla')
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

// ── Shortcut hints and keys (phase 3's chords, lib/tableShortcuts.ts) ────────

describe('shortcut hints in the menus', () => {
  const kbdOf = (entries: TableMenuEntry[]) => Object.fromEntries(
    entries.filter((e): e is TableMenuItem => e.type === 'item' && !!e.kbd).map((e) => [e.id, e.kbd]),
  )

  it('come from tableShortcuts, written the platform\'s way', () => {
    for (const mac of [true, false]) {
      const hints = menuShortcutHints(mac)
      const chords = tableShortcuts(mac)
      expect(Object.keys(hints).sort()).toEqual(Object.keys(chords).sort())
      for (const [action, chord] of Object.entries(chords)) {
        expect(hints[action as keyof typeof hints]).toBe(shortcutText(chord.keys, mac))
      }
    }
    expect(menuShortcutHints(true)).toMatchObject({ insertRowBelow: '⌘↩', moveRowUp: '⌥↑', moveColumnLeft: '⌘⌥←', deleteRows: '⌘⇧⌫' })
    expect(menuShortcutHints(false)).toMatchObject({ insertRowBelow: 'Ctrl+Enter', moveRowUp: 'Alt+↑', moveColumnLeft: 'Alt+←', deleteRows: 'Ctrl+Shift+Backspace' })
  })

  it('go only on the entries a chord does: row, column and cell menus', () => {
    const { data, can } = setup(T44)
    for (const mac of [true, false]) {
      const h = menuShortcutHints(mac)
      expect(kbdOf(rowMenu(2, can, m, h))).toEqual({
        insertBelow: h.insertRowBelow, duplicateRow: h.duplicateRow, moveUp: h.moveRowUp, moveDown: h.moveRowDown, deleteRow: h.deleteRows,
      })
      // The chord never duplicates the header.
      expect(kbdOf(rowMenu(0, can, m, h))).toEqual({
        insertBelow: h.insertRowBelow, moveUp: h.moveRowUp, moveDown: h.moveRowDown, deleteRow: h.deleteRows,
      })
      expect(kbdOf(columnMenu(data, 1, can, m, h))).toEqual({
        insertRight: h.insertColumnRight, moveLeft: h.moveColumnLeft, moveRight: h.moveColumnRight, deleteColumn: h.deleteColumns,
      })
      expect(kbdOf(cellMenu(data, { row: 1, col: 1 }, null, can, m, h))).toEqual({
        insertRowBelow: h.insertRowBelow, deleteRow: h.deleteRows, insertColumnRight: h.insertColumnRight, deleteColumn: h.deleteColumns,
      })
      // A selection over two rows of one column: the chords would act on both rows → no row hints.
      expect(kbdOf(cellMenu(data, { row: 1, col: 1 }, { top: 1, bottom: 3, left: 1, right: 2 }, can, m, h))).toEqual({
        insertColumnRight: h.insertColumnRight, deleteColumn: h.deleteColumns,
      })
    }
    // Without hints (the default), none.
    expect(kbdOf(rowMenu(2, can, m))).toEqual({})
  })

  it('each hinted entry does what its chord does, with its line selected (as a handle leaves it)', () => {
    const base = setup(T44).state
    const withLine = (kind: 'row' | 'column', i: number) => {
      let next = base
      ;(kind === 'row' ? selectRow(i, { tablePos: 0 }) : selectColumn(i, { tablePos: 0 }))(base, (tr) => { next = base.apply(tr) })
      return next
    }
    const docAfter = (s: EditorState, cmd: (st: EditorState, d?: (tr: import('@tiptap/pm/state').Transaction) => void) => boolean) => {
      let doc = s.doc
      expect(cmd(s, (tr) => { doc = s.apply(tr).doc })).toBe(true)
      return doc
    }
    const viaMenu = (s: EditorState, action: TableAction) => docAfter(s, tableActionCommand(action, { tablePos: 0 }))
    const r2 = withLine('row', 2)
    expect(viaMenu(r2, { type: 'insertRow', index: 3 }).eq(docAfter(r2, insertRowBelow))).toBe(true)
    expect(viaMenu(r2, { type: 'duplicateRow', index: 2 }).eq(docAfter(r2, duplicateSelectedRow))).toBe(true)
    expect(viaMenu(r2, { type: 'moveRow', from: 2, to: 1 }).eq(docAfter(r2, moveSelectedRow(-1)))).toBe(true)
    expect(viaMenu(r2, { type: 'moveRow', from: 2, to: 3 }).eq(docAfter(r2, moveSelectedRow(1)))).toBe(true)
    expect(viaMenu(r2, { type: 'deleteRow', index: 2 }).eq(docAfter(r2, deleteSelectedRows))).toBe(true)
    const c1 = withLine('column', 1)
    expect(viaMenu(c1, { type: 'insertColumn', index: 2 }).eq(docAfter(c1, insertColumnRight))).toBe(true)
    expect(viaMenu(c1, { type: 'moveColumn', from: 1, to: 0 }).eq(docAfter(c1, moveSelectedColumn(-1)))).toBe(true)
    expect(viaMenu(c1, { type: 'moveColumn', from: 1, to: 2 }).eq(docAfter(c1, moveSelectedColumn(1)))).toBe(true)
    expect(viaMenu(c1, { type: 'deleteColumn', index: 1 }).eq(docAfter(c1, deleteSelectedColumns))).toBe(true)
  })
})

describe('menuKeyAction: only plain ↑/↓/Enter/Esc are the menu\'s', () => {
  const key = (k: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
    menuKeyAction({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods })

  it('navigation keys', () => {
    expect(key('ArrowDown')).toBe('next')
    expect(key('ArrowUp')).toBe('prev')
    expect(key('Enter')).toBe('run')
    expect(key('Escape')).toBe('close')
  })

  it('the table chords pass through untouched (Alt / Ctrl / ⌘), on both platforms', () => {
    expect(key('ArrowUp', { altKey: true })).toBe('pass')
    expect(key('ArrowDown', { altKey: true })).toBe('pass')
    expect(key('ArrowLeft', { metaKey: true, altKey: true })).toBe('pass')
    expect(key('Enter', { ctrlKey: true })).toBe('pass')
    expect(key('Enter', { metaKey: true, shiftKey: true })).toBe('pass')
    expect(key('d', { ctrlKey: true })).toBe('pass')
    expect(key('Backspace', { ctrlKey: true, shiftKey: true })).toBe('pass')
    expect(key('Backspace', { altKey: true, shiftKey: true })).toBe('pass')
    expect(key('Escape', { ctrlKey: true })).toBe('pass')
    expect(key('Shift', { shiftKey: true })).toBe('pass')
    expect(key('Alt', { altKey: true })).toBe('pass')
  })

  it('anything else closes the menu and goes on to the editor', () => {
    expect(key('a')).toBe('dismiss')
    expect(key('Tab')).toBe('dismiss')
    expect(key('ArrowDown', { shiftKey: true })).toBe('dismiss')
    expect(key('Enter', { shiftKey: true })).toBe('dismiss')
    expect(key('ArrowLeft')).toBe('dismiss')
  })
})
