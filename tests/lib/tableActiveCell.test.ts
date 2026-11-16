// @vitest-environment happy-dom
//
// The table cell holding the caret (src/lib/tableActiveCell.ts) and its editor
// decoration (components/Editor/ActiveTableCell.ts), on the editor's REAL schema:
// only a selection inside one cell marks it; across cells, outside tables and
// CellSelections (already .selectedCell) mark nothing; nothing reaches the markdown.

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { activeCellRange } from '../../src/lib/tableActiveCell'
import { ACTIVE_CELL_CLASS, ActiveTableCell } from '../../src/components/Editor/ActiveTableCell'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { load } from '../helpers/editorPipeline'

const MD = 'Intro\n\n| Name | Price |\n| --- | --- |\n| Tea | 3 |\n| Cake | 5 |\n\nOutro'

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

const textSel = (doc: PMNode, from: string, to = from) =>
  TextSelection.create(doc, posAfter(doc, from), posAfter(doc, to))

describe('activeCellRange', () => {
  const doc = load(MD)

  it('finds the body or header cell holding the caret', () => {
    const body = activeCellRange(textSel(doc, 'Tea'))
    expect(body).not.toBeNull()
    expect(doc.nodeAt(body!.from)?.type.name).toBe('tableCell')
    expect(doc.nodeAt(body!.from)?.textContent).toBe('Tea')
    expect(body!.to).toBe(body!.from + doc.nodeAt(body!.from)!.nodeSize)

    const head = activeCellRange(textSel(doc, 'Pri'))
    expect(doc.nodeAt(head!.from)?.type.name).toBe('tableHeader')
    expect(doc.nodeAt(head!.from)?.textContent).toBe('Price')
  })

  it('keeps a text range inside one cell', () => {
    const sel = TextSelection.create(doc, posAfter(doc, 'C'), posAfter(doc, 'Cake'))
    expect(doc.nodeAt(activeCellRange(sel)!.from)?.textContent).toBe('Cake')
  })

  it('marks nothing outside a table, across cells or for a CellSelection', () => {
    expect(activeCellRange(textSel(doc, 'Intro'))).toBeNull()
    expect(activeCellRange(textSel(doc, 'Tea', 'Cake'))).toBeNull()
    expect(activeCellRange(textSel(doc, 'Intro', 'Tea'))).toBeNull()
    // Text sits in the cell's paragraph: the cell is one level up.
    const cellPos = (text: string) => { const $p = doc.resolve(posAfter(doc, text)); return $p.before($p.depth - 1) }
    const cells = CellSelection.create(doc, cellPos('Tea'), cellPos('5'))
    expect(activeCellRange(cells)).toBeNull()
    expect(activeCellRange(EditorState.create({ doc }).selection)).toBeNull()
  })
})

describe('ActiveTableCell decoration', () => {
  it('classes the caret cell only, and never changes the saved markdown', () => {
    const editor = new Editor({ extensions: [...schemaExtensions(), ActiveTableCell], content: htmlFromMarkdown(MD) })
    const marked = () => Array.from(editor.view.dom.querySelectorAll(`.${ACTIVE_CELL_CLASS}`)).map((el) => el.textContent)

    editor.commands.setTextSelection(posAfter(editor.state.doc, 'Intro'))
    expect(marked()).toEqual([])

    editor.commands.setTextSelection(posAfter(editor.state.doc, 'Cake'))
    expect(marked()).toEqual(['Cake'])

    editor.commands.setTextSelection(posAfter(editor.state.doc, 'Nam'))
    expect(marked()).toEqual(['Name'])

    expect(htmlToMarkdown(editor.getHTML())).not.toContain(ACTIVE_CELL_CLASS)
    expect(editor.getHTML()).not.toContain(ACTIVE_CELL_CLASS)
    editor.destroy()
  })
})
