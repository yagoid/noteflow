// @vitest-environment happy-dom
//
// Inserting a new table (src/lib/tableInsert.ts) — the toolbar's size picker and
// the `/table` slash command — on the editor's REAL schema and markdown
// pipeline: the table always has a header row (rows count it), lands at the
// caret or right after the list / table holding it (never nested in one), and
// saves to markdown that reloads to the same document.

import { describe, expect, it } from 'vitest'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import {
  DEFAULT_TABLE_SIZE,
  TABLE_MIN_COLS,
  TABLE_PICKER_MAX,
  canInsertTableHere,
  clampTableSize,
  insertTableTr,
  moveTableSize,
  tableInsertPos,
  type TableSize,
} from '../../src/lib/tableInsert'
import { load, save } from '../helpers/editorPipeline'

/** Position right after the first occurrence of `text` in the document. */
function posAfter(doc: PMNode, text: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.isText && node.text?.includes(text)) {
      found = pos + node.text.indexOf(text) + text.length
      return false
    }
    return true
  })
  if (found < 0) throw new Error(`no text "${text}"`)
  return found
}

/** A state of `md` with the caret right after `text` (or at the start of the doc). */
function stateAt(md: string, text?: string): EditorState {
  const doc = load(md)
  const pos = text === undefined ? 1 : posAfter(doc, text)
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
}

/** Inserts a table of `size` and returns the saved markdown (checking it reloads identically). */
function inserted(state: EditorState, size: TableSize = DEFAULT_TABLE_SIZE): { md: string; tr: ReturnType<typeof insertTableTr> } {
  const tr = insertTableTr(state, size)
  const md = save(tr.doc)
  expect(load(md).toJSON()).toEqual(tr.doc.toJSON())
  return { md, tr }
}

const countTables = (doc: PMNode) => {
  let n = 0
  doc.descendants((node) => { if (node.type.name === 'table') n++ })
  return n
}

describe('moveTableSize', () => {
  it('moves columns with ←/→ and rows with ↑/↓', () => {
    expect(moveTableSize({ rows: 3, cols: 3 }, 'ArrowRight')).toEqual({ rows: 3, cols: 4 })
    expect(moveTableSize({ rows: 3, cols: 3 }, 'ArrowLeft')).toEqual({ rows: 3, cols: 2 })
    expect(moveTableSize({ rows: 3, cols: 3 }, 'ArrowDown')).toEqual({ rows: 4, cols: 3 })
    expect(moveTableSize({ rows: 3, cols: 3 }, 'ArrowUp')).toEqual({ rows: 2, cols: 3 })
  })

  it('clamps rows and columns to 1…max', () => {
    expect(TABLE_MIN_COLS).toBe(1)
    expect(moveTableSize({ rows: 1, cols: 2 }, 'ArrowUp')).toEqual({ rows: 1, cols: 2 })
    expect(moveTableSize({ rows: 1, cols: 2 }, 'ArrowLeft')).toEqual({ rows: 1, cols: 1 })
    expect(moveTableSize({ rows: 1, cols: 1 }, 'ArrowLeft')).toEqual({ rows: 1, cols: 1 })
    expect(clampTableSize({ rows: 0, cols: 0 })).toEqual({ rows: 1, cols: 1 })
    expect(clampTableSize({ rows: 2, cols: 1 })).toEqual({ rows: 2, cols: 1 })
    expect(clampTableSize({ rows: 9, cols: 12 })).toEqual({ rows: TABLE_PICKER_MAX, cols: TABLE_PICKER_MAX })
    const max = { rows: TABLE_PICKER_MAX, cols: TABLE_PICKER_MAX }
    expect(moveTableSize(max, 'ArrowDown')).toEqual(max)
    expect(moveTableSize(max, 'ArrowRight')).toEqual(max)
    expect(moveTableSize({ rows: 4, cols: 4 }, 'ArrowRight', 4)).toEqual({ rows: 4, cols: 4 })
  })

  it('ignores any other key', () => {
    expect(moveTableSize({ rows: 3, cols: 3 }, 'Enter')).toBeNull()
    expect(moveTableSize({ rows: 3, cols: 3 }, 'a')).toBeNull()
  })
})

describe('tableInsertPos', () => {
  it('inserts at the caret in a paragraph, heading or quote', () => {
    expect(tableInsertPos(stateAt('Some text', 'Some').selection)).toBeNull()
    expect(tableInsertPos(stateAt('## Title', 'Ti').selection)).toBeNull()
    expect(tableInsertPos(stateAt('> quoted', 'quo').selection)).toBeNull()
    expect(canInsertTableHere(stateAt('Some text', 'Some').selection)).toBe(true)
  })

  it('goes after the outermost list holding the caret', () => {
    for (const md of ['- one\n- two', '1. one\n2. two', '- [ ] one\n- [ ] two', '- top\n  - [ ] nested']) {
      const state = stateAt(md, md.includes('nested') ? 'nest' : 'one')
      expect(tableInsertPos(state.selection)).toBe(state.doc.child(0).nodeSize)
      expect(canInsertTableHere(state.selection)).toBe(false)
    }
  })

  it('goes after the table holding the caret, never inside it', () => {
    const state = stateAt('| A | B |\n| --- | --- |\n| a | b |\n\nAfter', 'a')
    expect(tableInsertPos(state.selection)).toBe(state.doc.child(0).nodeSize)
    expect(canInsertTableHere(state.selection)).toBe(false)
  })

  it('goes after a selected block node (a kanban board) instead of replacing it', () => {
    const doc = load('<!-- kanban -->\n- To do\n  - [ ] card\n<!-- /kanban -->\n\nText')
    expect(doc.child(0).type.name).toBe('kanbanBoard')
    const sel = NodeSelection.create(doc, 0)
    expect(tableInsertPos(sel)).toBe(doc.child(0).nodeSize)
  })
})

describe('insertTableTr', () => {
  it('replaces an empty paragraph with a table whose rows count the header', () => {
    const { md, tr } = inserted(stateAt(''), { rows: 3, cols: 4 })
    const lines = md.split('\n')
    // header + separator + 2 body rows
    expect(lines.filter((l) => l.startsWith('|'))).toHaveLength(4)
    expect(lines[1]).toBe('| --- | --- | --- | --- |')
    // Caret in the first header cell.
    expect(tr.selection.$from.parent.type.name).toBe('paragraph')
    expect(tr.selection.$from.node(-1).type.name).toBe('tableHeader')
    expect(countTables(tr.doc)).toBe(1)
  })

  it('makes a one-row table a lone header row that reloads as a table', () => {
    const { md } = inserted(stateAt(''), { rows: 1, cols: 2 })
    expect(md).toBe('|   |   |\n| --- | --- |')
  })

  it('makes one-column tables that reload as tables', () => {
    expect(inserted(stateAt(''), { rows: 1, cols: 1 }).md).toBe('|   |\n| --- |')
    expect(inserted(stateAt(''), { rows: 3, cols: 1 }).md).toBe('|   |\n| --- |\n|   |\n|   |')
  })

  it('replaces an empty paragraph next to another table, leaving no blank line behind', () => {
    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const types = (doc: PMNode) => doc.content.content.map((n) => n.type.name)
    /** A state of `md` with the caret in its first empty paragraph. */
    const inEmpty = (md: string) => {
      const doc = load(md)
      let pos = -1
      doc.forEach((n, off) => { if (pos < 0 && n.type.name === 'paragraph' && n.content.size === 0) pos = off + 1 })
      expect(pos).toBeGreaterThan(0)
      return EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
    }
    // Table after the empty line, before it, and on both sides.
    for (const [md, expected] of [
      [`Hi\n\n\n\n${table}`, ['paragraph', 'table', 'table']],
      [`${table}\n\n\n\nEnd`, ['table', 'table', 'paragraph']],
      [`${table}\n\n\n\n${table}`, ['table', 'table', 'table']],
    ] as const) {
      const { md: saved, tr } = inserted(inEmpty(md), { rows: 2, cols: 2 })
      expect(types(tr.doc)).toEqual(expected)
      expect(saved).not.toContain('\n\n\n')
      expect(tr.selection.$from.node(-1).type.name).toBe('tableHeader')
    }
  })

  it('splits the paragraph at the caret', () => {
    const { md } = inserted(stateAt('beforeafter', 'before'), { rows: 2, cols: 2 })
    expect(md.startsWith('before\n\n|')).toBe(true)
    expect(md.endsWith('\n\nafter')).toBe(true)
  })

  it('lands after the whole list, which stays intact', () => {
    const state = stateAt('- one\n  - two\n- three\n\nEnd', 'two')
    const { md, tr } = inserted(state, { rows: 2, cols: 2 })
    expect(md.startsWith('- one\n  - two\n- three\n\n|')).toBe(true)
    expect(md.endsWith('\n\nEnd')).toBe(true)
    expect(tr.selection.$from.node(-1).type.name).toBe('tableHeader')
  })

  it('lands after the current table, not nested in a cell', () => {
    const state = stateAt('| A | B |\n| --- | --- |\n| a | b |', 'b')
    const { md, tr } = inserted(state, { rows: 2, cols: 3 })
    expect(countTables(tr.doc)).toBe(2)
    expect(tr.doc.child(0).type.name).toBe('table')
    expect(tr.doc.child(1).type.name).toBe('table')
    expect(md.startsWith('| A | B |\n| --- | --- |\n| a | b |\n\n|')).toBe(true)
  })

  it('keeps a table typed in a quote inside the quote (markdown writes it back)', () => {
    const { md, tr } = inserted(stateAt('> quoted', 'quoted'), { rows: 2, cols: 2 })
    expect(tr.doc.child(0).type.name).toBe('blockquote')
    expect(md.split('\n').every((l) => l.startsWith('>'))).toBe(true)
  })

  it('in a list inside a quote, lands after the list but still in the quote', () => {
    const { tr } = inserted(stateAt('> - item', 'item'), { rows: 2, cols: 2 })
    const quote = tr.doc.child(0)
    expect(quote.type.name).toBe('blockquote')
    expect(quote.child(0).type.name).toBe('bulletList')
    expect(quote.child(1).type.name).toBe('table')
  })

  it('does not replace a selected kanban board', () => {
    const doc = load('<!-- kanban -->\n- To do\n  - [ ] card\n<!-- /kanban -->\n\nText')
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 0) })
    const { tr } = inserted(state, { rows: 2, cols: 2 })
    expect(tr.doc.child(0).type.name).toBe('kanbanBoard')
    expect(tr.doc.child(1).type.name).toBe('table')
  })
})
