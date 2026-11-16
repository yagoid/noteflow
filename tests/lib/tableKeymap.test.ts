// @vitest-environment happy-dom
//
// Table keyboard shortcuts (src/components/Editor/TableKeymap.ts) on a real
// TipTap editor wired like the note editor (helpers/tableEditor.ts): each chord
// through ProseMirror's keydown dispatch, the markdown it leaves (and its
// round trip), where the cursor ends up, one undo step per chord, and that the
// keys are untouched outside tables.

import { afterEach, describe, expect, it } from 'vitest'
import { undoDepth } from '@tiptap/pm/history'
import { Selection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { TableKeymap } from '../../src/components/Editor/TableKeymap'
import {
  caretIn, caretInCell, checkTables, destroyEditor, expectRoundTrip, headCell, makeEditor, markdown, press,
  selectCells,
} from '../helpers/tableEditor'

afterEach(destroyEditor)

const T = [
  '| A | B | C |',
  '| --- | :---: | --- |',
  '| a1 | b1 | c1 |',
  '| a2 | b2 | c2 |',
].join('\n')

const rowsOf = (md: string) => md.split('\n')

/** Run `chord`, expect it handled, valid tables, a round-tripping save, and ONE undo back to `before`. */
function chord(ed: ReturnType<typeof makeEditor>, keys: string): string {
  const before = markdown(ed)
  const depth = undoDepth(ed.state)
  expect(press(ed, keys), keys).toBe(true)
  checkTables(ed.state.doc)
  expectRoundTrip(ed)
  const after = markdown(ed)
  if (after !== before) {
    expect(undoDepth(ed.state)).toBe(depth + 1)
    const sel = ed.state.selection
    ed.commands.undo()
    expect(markdown(ed)).toBe(before)
    ed.commands.redo()
    expect(markdown(ed)).toBe(after)
    ed.view.dispatch(ed.state.tr.setSelection(Selection.fromJSON(ed.state.doc, sel.toJSON())))
  }
  return after
}

/** The chord is consumed (handled) but changes nothing. */
function noop(ed: ReturnType<typeof makeEditor>, keys: string): void {
  const before = ed.state.doc
  expect(press(ed, keys), keys).toBe(true)
  expect(ed.state.doc.eq(before)).toBe(true)
}

describe('moving rows: Alt+↑ / Alt+↓', () => {
  it('moves the cursor\'s body row; the cursor goes with it', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    const md = chord(ed, 'Alt-ArrowDown')
    expect(rowsOf(md).slice(2)).toEqual(['| a2 | b2 | c2 |', '| a1 | b1 | c1 |'])
    expect(headCell(ed)).toEqual([2, 1])
    expect(ed.state.selection.$head.parent.textContent).toBe('b1')
    chord(ed, 'Alt-ArrowUp')
    expect(markdown(ed)).toBe(T)
  })

  it('at the top of the body, in the header and at the bottom: consumed, nothing moves', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'a1')
    noop(ed, 'Alt-ArrowUp')
    caretIn(ed, 'B')
    noop(ed, 'Alt-ArrowUp')
    noop(ed, 'Alt-ArrowDown')
    caretIn(ed, 'c2')
    noop(ed, 'Alt-ArrowDown')
  })

  it('a whole selected row moves and stays selected', () => {
    const ed = makeEditor(T)
    selectCells(ed, [1, 0], [1, 2])
    chord(ed, 'Alt-ArrowDown')
    const sel = ed.state.selection
    expect(sel).toBeInstanceOf(CellSelection)
    expect((sel as CellSelection).isRowSelection()).toBe(true)
    expect(headCell(ed)).toEqual([2, 2])
  })

  it('a selection over several rows: consumed, nothing moves', () => {
    const ed = makeEditor(T)
    selectCells(ed, [1, 0], [2, 0])
    noop(ed, 'Alt-ArrowDown')
    noop(ed, 'Alt-ArrowUp')
  })

  it('in a list inside a cell, Alt+↑/↓ is the list\'s, never the table\'s (also at the list\'s ends)', () => {
    const html = '<table><tr><th><p>H</p></th></tr>'
      + '<tr><td><ul><li><p>x</p></li><li><p>y</p></li></ul></td></tr>'
      + '<tr><td><p>z</p></td></tr></table>'
    const ed = makeEditor('', { html })
    caretIn(ed, 'x')
    expect(press(ed, 'Alt-ArrowDown')).toBe(true)
    const items: string[] = []
    ed.state.doc.descendants((n) => { if (n.type.name === 'listItem') items.push(n.textContent); return true })
    expect(items).toEqual(['y', 'x'])
    // x is now the last item: the list can't move it, and the row doesn't move either.
    const before = ed.state.doc
    expect(press(ed, 'Alt-ArrowDown')).toBe(false)
    expect(ed.state.doc.eq(before)).toBe(true)
    caretIn(ed, 'y')
    expect(press(ed, 'Alt-ArrowUp')).toBe(false)
    expect(ed.state.doc.eq(before)).toBe(true)
  })
})

describe('moving columns: Alt+← / Alt+→', () => {
  it('moves the cursor\'s column with its header and alignment', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    const md = chord(ed, 'Alt-ArrowRight')
    expect(rowsOf(md)).toEqual([
      '| A | C | B |',
      '| --- | --- | :---: |',
      '| a1 | c1 | b1 |',
      '| a2 | c2 | b2 |',
    ])
    expect(headCell(ed)).toEqual([1, 2])
    chord(ed, 'Alt-ArrowLeft')
    expect(markdown(ed)).toBe(T)
  })

  it('works from the header too', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'A')
    chord(ed, 'Alt-ArrowRight')
    expect(rowsOf(markdown(ed))[0]).toBe('| B | A | C |')
  })

  it('at the first / last column and with several columns selected: consumed, nothing moves', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'a1')
    noop(ed, 'Alt-ArrowLeft')
    caretIn(ed, 'c1')
    noop(ed, 'Alt-ArrowRight')
    selectCells(ed, [0, 0], [2, 1])
    noop(ed, 'Alt-ArrowRight')
  })
})

describe('inserting: Mod+Enter (row below) / Mod+Shift+Enter (column right)', () => {
  it('Mod+Enter inserts a body row below; the cursor goes to it, same column', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    const md = chord(ed, 'Mod-Enter')
    expect(rowsOf(md).slice(2)).toEqual(['| a1 | b1 | c1 |', '|   |   |   |', '| a2 | b2 | c2 |'])
    expect(headCell(ed)).toEqual([2, 1])
    // The new cells take their column's alignment.
    expect(ed.state.selection.$head.node(-1).attrs.textAlign).toBe('center')
  })

  it('in the header, the new row goes right below it', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'C')
    chord(ed, 'Mod-Enter')
    expect(rowsOf(markdown(ed))[2]).toBe('|   |   |   |')
    expect(headCell(ed)).toEqual([1, 2])
  })

  it('with several rows selected, after the last one', () => {
    const ed = makeEditor(T + '\n| a3 | b3 | c3 |')
    selectCells(ed, [2, 0], [1, 1])
    chord(ed, 'Mod-Enter')
    expect(rowsOf(markdown(ed)).slice(2)).toEqual([
      '| a1 | b1 | c1 |', '| a2 | b2 | c2 |', '|   |   |   |', '| a3 | b3 | c3 |',
    ])
    expect(headCell(ed)).toEqual([3, 1])
  })

  it('Mod+Shift+Enter inserts a column to the right; the cursor goes to it, same row', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b2')
    const md = chord(ed, 'Mod-Shift-Enter')
    expect(rowsOf(md)).toEqual([
      '| A | B |   | C |',
      '| --- | :---: | --- | --- |',
      '| a1 | b1 |   | c1 |',
      '| a2 | b2 |   | c2 |',
    ])
    expect(headCell(ed)).toEqual([2, 2])
  })

  it('with a column range selected, right of its last column', () => {
    const ed = makeEditor(T)
    selectCells(ed, [0, 0], [2, 1])
    chord(ed, 'Mod-Shift-Enter')
    expect(rowsOf(markdown(ed))[0]).toBe('| A | B |   | C |')
    expect(headCell(ed)).toEqual([2, 2])
  })

  it('outside a table Mod+Enter is still a hard break, and splits a heading', () => {
    const ed = makeEditor('one two\n\n# AbCd\n\n' + T)
    caretIn(ed, 'one')
    expect(press(ed, 'Mod-Enter')).toBe(true)
    expect(ed.state.doc.firstChild!.child(1).type.name).toBe('hardBreak')
    caretIn(ed, 'Ab')
    expect(press(ed, 'Mod-Enter')).toBe(true)
    expect(markdown(ed)).toContain('# Ab\n\n# Cd')
    expect(markdown(ed)).toContain(T)
  })

  it('the table keymap wins over LineBreak by priority, not by registration order', () => {
    const ed = makeEditor(T, { first: [TableKeymap.extend({ name: 'tableKeymapFirst' })] })
    caretIn(ed, 'a2')
    expect(press(ed, 'Mod-Enter')).toBe(true)
    expect(rowsOf(markdown(ed))).toHaveLength(5)
    expect(markdown(ed)).not.toContain('<br>')
  })

  it('one undo takes back the chord only, not the typing just before it', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    ed.view.dispatch(ed.state.tr.insertText('x'))
    press(ed, 'Mod-Enter')
    ed.view.dispatch(ed.state.tr.insertText('new'))
    ed.commands.undo()
    expect(rowsOf(markdown(ed))[3]).toBe('|   |   |   |')
    ed.commands.undo()
    expect(rowsOf(markdown(ed)).slice(2)).toEqual(['| a1 | b1x | c1 |', '| a2 | b2 | c2 |'])
  })
})

describe('duplicating: Mod+D', () => {
  it('copies the cursor\'s row below it; the cursor goes to the copy, same place', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b')
    const md = chord(ed, 'Mod-d')
    expect(rowsOf(md).slice(2)).toEqual(['| a1 | b1 | c1 |', '| a1 | b1 | c1 |', '| a2 | b2 | c2 |'])
    expect(headCell(ed)).toEqual([2, 1])
    expect(ed.state.selection.$head.parentOffset).toBe(1)
  })

  it('a selected row: the copy is selected', () => {
    const ed = makeEditor(T)
    selectCells(ed, [2, 0], [2, 2])
    chord(ed, 'Mod-d')
    const sel = ed.state.selection as CellSelection
    expect(sel).toBeInstanceOf(CellSelection)
    expect(sel.isRowSelection()).toBe(true)
    expect(headCell(ed)).toEqual([3, 2])
  })

  it('the header is never duplicated: consumed, nothing changes', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'A')
    noop(ed, 'Mod-d')
  })
})

describe('deleting: Mod+Shift+Backspace (rows) / Alt+Shift+Backspace (columns)', () => {
  it('Mod+Shift+Backspace deletes the cursor\'s row', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    const md = chord(ed, 'Mod-Shift-Backspace')
    expect(rowsOf(md).slice(2)).toEqual(['| a2 | b2 | c2 |'])
    expect(headCell(ed)).toEqual([1, 1])
  })

  it('only the header: consumed, nothing deleted', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'B')
    noop(ed, 'Mod-Shift-Backspace')
  })

  it('Alt+Shift+Backspace deletes the cursor\'s column; the last column stays', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    expect(rowsOf(chord(ed, 'Alt-Shift-Backspace'))[0]).toBe('| A | C |')
    chord(ed, 'Alt-Shift-Backspace')
    expect(rowsOf(markdown(ed))[0]).toBe('| A |')
    noop(ed, 'Alt-Shift-Backspace')
  })
})

describe('Backspace / Delete on selected cells', () => {
  for (const key of ['Backspace', 'Delete', 'Mod-Backspace', 'Mod-Delete']) {
    it(`${key} empties a selected column without deleting the table, even if it's every cell`, () => {
      const ed = makeEditor('| A |\n| --- |\n| x |\n| y |')
      selectCells(ed, [0, 0], [2, 0])
      const md = chord(ed, key)
      expect(md).toBe('|   |\n| --- |\n|   |\n|   |')
      expect(ed.state.selection).toBeInstanceOf(CellSelection)
    })
  }

  it('the whole table selected: emptied, kept', () => {
    const ed = makeEditor(T)
    selectCells(ed, [0, 0], [2, 2])
    chord(ed, 'Backspace')
    expect(rowsOf(markdown(ed))).toEqual(['|   |   |   |', '| --- | :---: | --- |', '|   |   |   |', '|   |   |   |'])
  })

  it('Backspace / Delete with a caret in a cell are left to the browser (character deletion)', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    const before = ed.state.doc
    expect(press(ed, 'Backspace')).toBe(false)
    expect(press(ed, 'Delete')).toBe(false)
    expect(ed.state.doc.eq(before)).toBe(true)
  })
})

describe('Tab / Shift+Tab / Enter stay TipTap\'s', () => {
  it('Tab goes to the next cell, Shift+Tab to the previous one', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'a1')
    expect(press(ed, 'Tab')).toBe(true)
    expect(headCell(ed)).toEqual([1, 1])
    expect(press(ed, 'Tab')).toBe(true)
    expect(press(ed, 'Tab')).toBe(true)
    expect(headCell(ed)).toEqual([2, 0])
    expect(press(ed, 'Shift-Tab')).toBe(true)
    expect(headCell(ed)).toEqual([1, 2])
    expect(markdown(ed)).toBe(T)
  })

  it('Tab in the last cell adds a body row and goes to it', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'c2')
    expect(press(ed, 'Tab')).toBe(true)
    checkTables(ed.state.doc)
    expect(rowsOf(markdown(ed))).toHaveLength(5)
    expect(rowsOf(markdown(ed))[4]).toBe('|   |   |   |')
    expect(headCell(ed)).toEqual([3, 0])
    expectRoundTrip(ed)
  })

  it('Tab in the last cell of a header-only table adds a body row', () => {
    const ed = makeEditor('| A | B |\n| --- | --- |')
    caretIn(ed, 'B')
    expect(press(ed, 'Tab')).toBe(true)
    checkTables(ed.state.doc)
    expect(markdown(ed)).toBe('| A | B |\n| --- | --- |\n|   |   |')
    expectRoundTrip(ed)
  })

  it('Enter stays in the cell (a new line in it)', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    expect(press(ed, 'Enter')).toBe(true)
    expect(headCell(ed)).toEqual([1, 1])
    // A second paragraph in the same cell; no cell / row added.
    expect(ed.state.selection.$head.node(-1).childCount).toBe(2)
    expect(rowsOf(markdown(ed))).toHaveLength(4)
  })
})

describe('outside tables and read-only', () => {
  it('Alt+↑/↓ outside a table still moves list items', () => {
    const ed = makeEditor('- one\n- two\n\n' + T)
    caretIn(ed, 'one')
    expect(press(ed, 'Alt-ArrowDown')).toBe(true)
    expect(markdown(ed).startsWith('- two\n- one')).toBe(true)
  })

  it('the other chords pass through outside tables', () => {
    const ed = makeEditor('plain\n\n' + T)
    caretIn(ed, 'plain')
    const before = ed.state.doc
    for (const keys of ['Alt-ArrowLeft', 'Alt-ArrowRight', 'Mod-Shift-Enter', 'Mod-d', 'Mod-Shift-Backspace', 'Alt-Shift-Backspace']) {
      press(ed, keys)
      expect(ed.state.doc.eq(before), keys).toBe(true)
    }
  })

  it('a read-only editor ignores the chords', () => {
    const ed = makeEditor(T, { editable: false })
    caretIn(ed, 'b1')
    const before = ed.state.doc
    // ProseMirror never runs key handlers in a read-only view; ours refuse on their own too.
    for (const keys of ['Alt-ArrowDown', 'Alt-ArrowRight', 'Mod-Shift-Enter', 'Mod-d', 'Mod-Shift-Backspace', 'Alt-Shift-Backspace']) {
      expect(press(ed, keys), keys).toBe(false)
    }
    // Real key events on the read-only view: nothing reaches the document.
    selectCells(ed, [1, 0], [1, 2])
    for (const key of ['Backspace', 'Delete']) {
      ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    }
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }))
    expect(ed.state.doc.eq(before)).toBe(true)
  })
})

describe('caret helpers sanity', () => {
  it('caretInCell lands in the cell', () => {
    const ed = makeEditor(T)
    caretInCell(ed, 2, 1)
    expect(headCell(ed)).toEqual([2, 1])
  })
})
