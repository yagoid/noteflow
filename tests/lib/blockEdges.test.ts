// @vitest-environment happy-dom
//
// A caret beside a table, code block or board that starts or ends a section
// (src/lib/blockEdges.ts + components/Editor/BlockEdges.ts), on the editor's REAL
// schema: which selections leave the block with which arrow, the paragraph made there,
// and that moving around never changes the saved markdown.

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import { EditorState, NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { BlockEdges } from '../../src/components/Editor/BlockEdges'
import { caretBesideBlock, edgeBlockPos, edgeBlockToLeave, needsEdgeParagraph } from '../../src/lib/blockEdges'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { load } from '../helpers/editorPipeline'

const TABLE = ['| a | b |', '| --- | --- |', '| c | d |'].join('\n')
const CODE = ['```', 'let x = 1', '```'].join('\n')
const BOARD = ['<!-- kanban -->', '- Todo', '  - [ ] one', '<!-- /kanban -->'].join('\n')

const stateOf = (md: string) => EditorState.create({ doc: load(md) })
const types = (doc: import('@tiptap/pm/model').Node) => { const out: string[] = []; doc.forEach((n) => { out.push(n.type.name) }); return out }
/** Caret right before / after the first occurrence of `text`. */
const caretAt = (state: EditorState, text: string, after = false) => {
  let at = -1
  state.doc.descendants((node, pos) => {
    if (at >= 0) return false
    if (node.isText && node.text!.includes(text)) at = pos + node.text!.indexOf(text) + (after ? text.length : 0)
    return true
  })
  if (at < 0) throw new Error(`no "${text}"`)
  return TextSelection.create(state.doc, at)
}

describe('blocks that need a paragraph beside them', () => {
  it('tables, code blocks and atoms do; text blocks, lists and quotes do not', () => {
    const kinds = (md: string) => types(load(md)).map((name, i) => [name, needsEdgeParagraph(load(md).child(i))])
    expect(kinds(`${TABLE}\n\n${CODE}\n\n${BOARD}\n\n---`)).toEqual([
      ['table', true], ['codeBlock', true], ['kanbanBoard', true], ['horizontalRule', true],
    ])
    expect(kinds('# H\n\npara\n\n- item\n\n> quote')).toEqual([
      ['heading', false], ['paragraph', false], ['bulletList', false], ['blockquote', false],
    ])
  })

  it('only at the edge of the document', () => {
    const doc = load(`${TABLE}\n\nmiddle\n\n${CODE}`)
    expect(edgeBlockPos(doc, 'before')).toBe(0)
    expect(edgeBlockPos(doc, 'after')).toBe(doc.content.size - doc.lastChild!.nodeSize)
    const text = load(`intro\n\n${TABLE}\n\noutro`)
    expect(edgeBlockPos(text, 'before')).toBeNull()
    expect(edgeBlockPos(text, 'after')).toBeNull()
  })
})

describe('which caret leaves the edge block', () => {
  it('a table that starts the section: ← only from the very start of its first cell, ↑ from any cell of the first row', () => {
    const state = stateOf(`${TABLE}\n\noutro`)
    expect(edgeBlockToLeave(caretAt(state, 'a'), 'before', 'horiz')).toBe(0)
    expect(edgeBlockToLeave(caretAt(state, 'a', true), 'before', 'horiz')).toBeNull()
    expect(edgeBlockToLeave(caretAt(state, 'b'), 'before', 'horiz')).toBeNull()
    expect(edgeBlockToLeave(caretAt(state, 'a', true), 'before', 'vert')).toBe(0)
    expect(edgeBlockToLeave(caretAt(state, 'b'), 'before', 'vert')).toBe(0)
    expect(edgeBlockToLeave(caretAt(state, 'c'), 'before', 'vert')).toBeNull()
    // Nothing below it to make: a paragraph follows.
    expect(edgeBlockToLeave(caretAt(state, 'd', true), 'after', 'horiz')).toBeNull()
  })

  it('a table that ends the section: → only from the very end of its last cell, ↓ from any cell of the last row', () => {
    const state = stateOf(`intro\n\n${TABLE}`)
    const pos = state.doc.content.size - state.doc.lastChild!.nodeSize
    expect(edgeBlockToLeave(caretAt(state, 'd', true), 'after', 'horiz')).toBe(pos)
    expect(edgeBlockToLeave(caretAt(state, 'd'), 'after', 'horiz')).toBeNull()
    expect(edgeBlockToLeave(caretAt(state, 'c'), 'after', 'vert')).toBe(pos)
    expect(edgeBlockToLeave(caretAt(state, 'b'), 'after', 'vert')).toBeNull()
  })

  it('a code block at either edge', () => {
    const state = stateOf(CODE)
    expect(edgeBlockToLeave(caretAt(state, 'let'), 'before', 'horiz')).toBe(0)
    expect(edgeBlockToLeave(caretAt(state, 'x'), 'before', 'horiz')).toBeNull()
    expect(edgeBlockToLeave(caretAt(state, '1', true), 'after', 'horiz')).toBe(0)
    expect(edgeBlockToLeave(caretAt(state, 'x'), 'after', 'vert')).toBe(0)
  })

  it('a board selected as a node; never a range or a block that is not at the edge', () => {
    const state = stateOf(`intro\n\n${BOARD}`)
    const pos = state.doc.content.size - state.doc.lastChild!.nodeSize
    expect(edgeBlockToLeave(NodeSelection.create(state.doc, pos), 'after', 'vert')).toBe(pos)
    expect(edgeBlockToLeave(NodeSelection.create(state.doc, pos), 'before', 'vert')).toBeNull()
    const table = stateOf(TABLE)
    const range = TextSelection.create(table.doc, caretAt(table, 'a').from, caretAt(table, 'a', true).from)
    expect(edgeBlockToLeave(range, 'before', 'horiz')).toBeNull()
    expect(edgeBlockToLeave(Selection.atStart(stateOf(`intro\n\n${TABLE}`).doc), 'before', 'horiz')).toBeNull()
  })
})

describe('caretBesideBlock', () => {
  it('makes an empty paragraph above / below and puts the caret in it', () => {
    const state = stateOf(TABLE)
    const above = caretBesideBlock(state.tr, 0, 'before')
    expect(types(above.doc)).toEqual(['paragraph', 'table'])
    expect(above.selection.$from.parent.type.name).toBe('paragraph')
    expect(above.selection.from).toBe(1)
    const below = caretBesideBlock(state.tr, 0, 'after')
    expect(types(below.doc)).toEqual(['table', 'paragraph'])
    expect(below.selection.$from.parent.type.name).toBe('paragraph')
    expect(below.selection.$from.before(1)).toBe(state.doc.firstChild!.nodeSize)
  })

  it('reuses a paragraph already there', () => {
    const state = stateOf(`intro\n\n${TABLE}\n\noutro`)
    const pos = state.doc.firstChild!.nodeSize
    expect(types(caretBesideBlock(state.tr, pos, 'before').doc)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(types(caretBesideBlock(state.tr, pos, 'after').doc)).toEqual(['paragraph', 'table', 'paragraph'])
  })
})

// The keys, as the editor runs them (BlockEdges' keymap ahead of the table plugin and
// the code block's own arrows).
let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })
function open(markdown: string, editable = true): Editor {
  editor?.destroy()
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [...schemaExtensions(), History, BlockEdges],
    content: htmlFromMarkdown(markdown),
    editable,
  })
  return editor
}
const md = (e: Editor) => htmlToMarkdown(e.getHTML())
const press = (e: Editor, key: string) =>
  !!e.view.someProp('handleKeyDown', (f) => f(e.view, new KeyboardEvent('keydown', { key })))
const caret = (e: Editor, text: string, after = false) => e.view.dispatch(e.state.tr.setSelection(caretAt(e.state, text, after)))

describe('the arrows in the editor', () => {
  it('← at the start of a table that starts the section makes a paragraph above; the markdown is the same', () => {
    const doc = `${TABLE}\n\noutro`
    const e = open(doc)
    caret(e, 'a')
    expect(press(e, 'ArrowLeft')).toBe(true)
    expect(types(e.state.doc)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(e.state.selection.from).toBe(1)
    expect(md(e)).toBe(doc)
    e.commands.insertContent('Title')
    expect(md(e)).toBe(`Title\n\n${doc}`)
  })

  it('→ at the end of a table that ends the section makes a paragraph below', () => {
    const doc = `intro\n\n${TABLE}`
    const e = open(doc)
    caret(e, 'd', true)
    expect(press(e, 'ArrowRight')).toBe(true)
    expect(types(e.state.doc)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(e.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(md(e)).toBe(doc)
  })

  it('↑ from any cell of the first row, ↓ from any cell of the last one', () => {
    const e = open(TABLE)
    caret(e, 'b', true)
    expect(press(e, 'ArrowUp')).toBe(true)
    expect(types(e.state.doc)).toEqual(['paragraph', 'table'])
    caret(e, 'c')
    expect(press(e, 'ArrowDown')).toBe(true)
    expect(types(e.state.doc)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(md(e)).toBe(TABLE)
  })

  it('↑ / ← at the start of a code block that starts the section, → at the end of one that ends it', () => {
    for (const key of ['ArrowUp', 'ArrowLeft']) {
      const e = open(CODE)
      caret(e, 'let')
      expect(press(e, key), key).toBe(true)
      expect(types(e.state.doc), key).toEqual(['paragraph', 'codeBlock'])
      expect(md(e), key).toBe(CODE)
    }
    const e = open(CODE)
    caret(e, '1', true)
    expect(press(e, 'ArrowRight')).toBe(true)
    expect(types(e.state.doc)).toEqual(['codeBlock', 'paragraph'])
  })

  it('↓ / ↑ on a board selected at the edge', () => {
    const e = open(`intro\n\n${BOARD}`)
    const pos = e.state.doc.content.size - e.state.doc.lastChild!.nodeSize
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, pos)))
    expect(press(e, 'ArrowDown')).toBe(true)
    expect(types(e.state.doc)).toEqual(['paragraph', 'kanbanBoard', 'paragraph'])

    const e2 = open(`${BOARD}\n\noutro`)
    e2.view.dispatch(e2.state.tr.setSelection(NodeSelection.create(e2.state.doc, 0)))
    expect(press(e2, 'ArrowUp')).toBe(true)
    expect(types(e2.state.doc)).toEqual(['paragraph', 'kanbanBoard', 'paragraph'])
  })

  it('leaves the arrows to the editor away from the edge, and never edits a read-only editor', () => {
    const e = open(`intro\n\n${TABLE}\n\noutro`)
    caret(e, 'a')
    // The table plugin's own ← takes the caret up to "intro": nothing is made.
    press(e, 'ArrowLeft')
    expect(types(e.state.doc)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(e.state.selection.$from.parent.textContent).toBe('intro')
    const ro = open(TABLE, false)
    caret(ro, 'a')
    expect(press(ro, 'ArrowLeft')).toBe(false)
    expect(types(ro.state.doc)).toEqual(['table'])
  })
})
