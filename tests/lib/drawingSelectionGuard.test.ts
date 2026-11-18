// @vitest-environment happy-dom
//
// A selected drawing block is never replaced by what is typed or pasted, and there is
// always a way to put the caret next to one at the edge of a section. On the editor's
// real schema and extensions (the drawing node's plugin and keymap included).

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { DRAWING_NODE_NAME } from '../../src/components/Editor/DrawingBlock'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'

const F = '```'
const DRAWING = ['<!-- drawing -->', `${F}mermaid`, 'flowchart TD', '  A --> B', F, '<!-- /drawing -->'].join('\n')

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function open(md: string): Editor {
  editor = new Editor({ element: document.createElement('div'), extensions: schemaExtensions(), content: htmlFromMarkdown(md) })
  return editor
}
const types = (e: Editor) => { const out: string[] = []; e.state.doc.forEach((n) => { out.push(n.type.name) }); return out }
const md = (e: Editor) => htmlToMarkdown(e.getHTML())
const drawingPos = (e: Editor) => { let pos = -1; e.state.doc.forEach((n, offset) => { if (n.type.name === DRAWING_NODE_NAME && pos < 0) pos = offset }); return pos }
const selectDrawing = (e: Editor) => e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, drawingPos(e))))
const typeText = (e: Editor, text: string) => {
  const { from, to } = e.state.selection
  const handled = e.view.someProp('handleTextInput', (f) => f(e.view, from, to, text))
  if (!handled) e.view.dispatch(e.state.tr.insertText(text, from, to))
}

// A real key press (the keymap dispatches the handler's whole transaction; TipTap's
// keyboardShortcut command only replays its steps, without the selection).
const press = (e: Editor, key: string, ctrl = false) =>
  !!e.view.someProp('handleKeyDown', (f) => f(e.view, new KeyboardEvent('keydown', { key, ctrlKey: ctrl })))

describe('typing with a drawing selected', () => {
  it('goes to a new paragraph below; the drawing stays (it used to be replaced)', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    selectDrawing(e)
    typeText(e, 'L')
    typeText(e, 'inea final.')
    expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
    expect(md(e)).toBe(`Intro\n\n${DRAWING}\n\nLinea final.`)
    expect(e.state.selection instanceof TextSelection).toBe(true)
  })

  it('uses the empty paragraph already below, and never types into the next block', () => {
    const e = open(`${DRAWING}\n\n- item`)
    selectDrawing(e)
    typeText(e, 'x')
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
    expect(md(e)).toBe(`${DRAWING}\n\nx\n\n- item`)

    const e2 = open(`${DRAWING}\n\nNext paragraph`)
    selectDrawing(e2)
    typeText(e2, 'y')
    expect(md(e2)).toBe(`${DRAWING}\n\ny\n\nNext paragraph`)
  })

  it('a paste or an IME composition starting on a selected drawing lands below it too', () => {
    for (const type of ['paste', 'compositionstart']) {
      const e = open(`Intro\n\n${DRAWING}`)
      selectDrawing(e)
      e.view.someProp('handleDOMEvents', (handlers) => { handlers[type]?.(e.view, new Event(type) as never); return undefined })
      expect(e.state.selection instanceof TextSelection, type).toBe(true)
      e.view.dispatch(e.state.tr.insertText('pasted'))
      expect(md(e), type).toBe(`Intro\n\n${DRAWING}\n\npasted`)
      editor?.destroy()
    }
  })

  it('Backspace / Delete still remove a selected drawing', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    selectDrawing(e)
    e.commands.deleteSelection()
    expect(types(e)).toEqual(['paragraph'])
  })

  it('typing elsewhere is untouched', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    e.commands.setTextSelection(6)
    typeText(e, '!')
    expect(md(e)).toBe(`Intro!\n\n${DRAWING}`)
  })
})

describe('the caret next to a drawing at the edge of a section', () => {
  it('arrow down / right on a drawing that ends the document makes a paragraph below', () => {
    for (const key of ['ArrowDown', 'ArrowRight']) {
      const e = open(`Intro\n\n${DRAWING}`)
      selectDrawing(e)
      expect(press(e, key), key).toBe(true)
      expect(types(e), key).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
      expect(e.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(e.state.selection.from).toBeGreaterThan(drawingPos(e))
      // An empty trailing paragraph is not written to the file.
      expect(md(e)).toBe(`Intro\n\n${DRAWING}`)
      editor?.destroy()
    }
  })

  it('arrow up / left on a drawing that starts the document makes a paragraph above', () => {
    for (const key of ['ArrowUp', 'ArrowLeft']) {
      const e = open(`${DRAWING}\n\nOutro`)
      selectDrawing(e)
      expect(press(e, key), key).toBe(true)
      expect(types(e), key).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
      expect(e.state.selection.from).toBeLessThan(drawingPos(e))
      editor?.destroy()
    }
  })

  it('Ctrl+End / Ctrl+Home go past a drawing that ends / starts the document', () => {
    const e = open(`Intro

${DRAWING}`)
    e.commands.setTextSelection(2)
    expect(press(e, 'End', true)).toBe(true)
    typeText(e, 'Linea final.')
    expect(md(e)).toBe(`Intro

${DRAWING}

Linea final.`)

    const e2 = open(`${DRAWING}

Outro`)
    expect(press(e2, 'Home', true)).toBe(true)
    typeText(e2, 'Antes')
    expect(md(e2)).toBe(`Antes

${DRAWING}

Outro`)

    // No drawing at that edge: the editor's own Ctrl+End.
    const e3 = open(`${DRAWING}

Outro`)
    expect(press(e3, 'End', true)).toBe(false)
  })

  it('in the middle of a document the arrows are left to the editor', () => {
    const e = open(`Intro\n\n${DRAWING}\n\nOutro`)
    selectDrawing(e)
    const before = types(e)
    press(e, 'ArrowDown')
    press(e, 'ArrowUp')
    expect(types(e)).toEqual(before)
  })
})
