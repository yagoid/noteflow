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
/** The text-input chain alone (input rules first, as TipTap orders it), else a plain insert. */
const inputText = (e: Editor, text: string) => {
  const { from, to } = e.state.selection
  const handled = e.view.someProp('handleTextInput', (f) => f(e.view, from, to, text))
  if (!handled) e.view.dispatch(e.state.tr.insertText(text, from, to))
}
/**
 * Typing as the browser delivers it, one key at a time: the `keypress` of a printable key
 * (ProseMirror runs handleKeyPress), then the character itself through the text-input
 * chain — where TipTap's input rules come FIRST. The editor is the real one, rules loaded.
 */
const typeText = (e: Editor, text: string) => {
  for (const ch of text) {
    e.view.someProp('handleKeyPress', (f) => f(e.view, new KeyboardEvent('keypress', { key: ch })))
    inputText(e, ch)
  }
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

  const domEvent = (e: Editor, type: string, event: Event) =>
    e.view.someProp('handleDOMEvents', (handlers) => { (handlers as Record<string, ((v: unknown, ev: Event) => unknown) | undefined>)[type]?.(e.view, event); return undefined })
  const pasteEvent = (types: string[]) => Object.assign(new Event('paste'), { clipboardData: { types, files: [], getData: () => '' } })
  const later = () => new Promise((resolve) => setTimeout(resolve, 5))

  it('a paste or an IME composition starting on a selected drawing lands below it too', () => {
    for (const [type, event] of [['paste', pasteEvent(['text/plain'])], ['compositionstart', new Event('compositionstart')]] as const) {
      const e = open(`Intro\n\n${DRAWING}`)
      selectDrawing(e)
      domEvent(e, type, event)
      expect(e.state.selection instanceof TextSelection, type).toBe(true)
      e.view.dispatch(e.state.tr.insertText('pasted'))
      expect(md(e), type).toBe(`Intro\n\n${DRAWING}\n\npasted`)
      editor?.destroy()
    }
  })

  it('a paste with nothing in it, or a composition that writes nothing, leaves no paragraph behind', async () => {
    // Before a list: an empty paragraph left there would change the markdown.
    const doc = `${DRAWING}\n\n- item`
    const empty = open(doc)
    selectDrawing(empty)
    domEvent(empty, 'paste', pasteEvent([]))
    expect(types(empty)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
    editor?.destroy()

    const nothing = open(doc)
    selectDrawing(nothing)
    domEvent(nothing, 'paste', pasteEvent(['text/plain']))
    expect(types(nothing)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
    await later() // …but nothing was inserted
    expect(types(nothing)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
    expect(nothing.state.selection instanceof NodeSelection).toBe(true)
    expect(md(nothing)).toBe(doc)
    editor?.destroy()

    const cancelled = open(doc)
    selectDrawing(cancelled)
    domEvent(cancelled, 'compositionstart', new Event('compositionstart'))
    domEvent(cancelled, 'compositionend', new Event('compositionend'))
    await later()
    expect(md(cancelled)).toBe(doc)
    expect(types(cancelled)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
  })

  it('does nothing in a read-only editor', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    e.setEditable(false)
    selectDrawing(e)
    domEvent(e, 'paste', pasteEvent(['text/plain']))
    e.view.someProp('handleKeyPress', (f) => f(e.view, new KeyboardEvent('keypress', { key: 'x' })))
    expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME])
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

// TipTap's input-rules plugin handles text input before any other plugin, and with a node
// selection it takes the text of the blocks ABOVE as "the text before the caret": a key
// that completes a rule replaced that range — and the selected drawing with it. The guard
// moves the caret into its own paragraph on the keypress, before the rules look.
describe('typing a key that completes an input rule, with a drawing selected', () => {
  it('the input rules are really loaded in this editor', () => {
    const e = open('see *note')
    e.commands.focus('end')
    typeText(e, '*')
    expect(md(e)).toBe('see *note*')
    expect(e.getHTML()).toContain('<em>note</em>')
  })

  const CASES: [name: string, above: string, key: string][] = [
    ['italic with *', 'see *note', '*'],
    ['inline code', 'use the `cfg', '`'],
    ['strike', 'x ~~gone~', '~'],
    ['italic with _', 'see _note', '_'],
    ['bold', 'a **bold*', '*'],
    ['highlight', 'a ==mark=', '='],
  ]
  for (const [name, above, key] of CASES) {
    it(`${name}: the drawing stays, the paragraph above is untouched, the key lands below`, () => {
      const e = open(`${above}\n\n${DRAWING}`)
      const aboveBefore = e.state.doc.child(0).toJSON()
      selectDrawing(e)
      typeText(e, key)
      expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
      expect(e.state.doc.child(0).toJSON()).toEqual(aboveBefore)
      expect(e.state.doc.child(2).textContent).toBe(key)
      expect(md(e)).toContain(DRAWING)
    })
  }

  it('an unclosed mark two paragraphs above + its closing key: nothing above changes', () => {
    const e = open(`start *open\n\nmiddle\n\n${DRAWING}`)
    const before = [e.state.doc.child(0).toJSON(), e.state.doc.child(1).toJSON()]
    selectDrawing(e)
    typeText(e, '*')
    expect(types(e)).toEqual(['paragraph', 'paragraph', DRAWING_NODE_NAME, 'paragraph'])
    expect([e.state.doc.child(0).toJSON(), e.state.doc.child(1).toJSON()]).toEqual(before)
  })

  it('a paragraph "#" above + space: the document does not collapse into a heading', () => {
    const e = open(`#\n\n${DRAWING}`)
    selectDrawing(e)
    typeText(e, ' ')
    expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
    expect(e.state.doc.child(0).textContent).toBe('#')
  })

  it('block rules still work in the new paragraph: "- " below a drawing starts a list there', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    selectDrawing(e)
    typeText(e, '- item')
    expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME, 'bulletList'])
    expect(md(e)).toBe(`Intro\n\n${DRAWING}\n\n- item`)
  })

  it('with a paragraph of text right below, the key gets a paragraph of its own (no rule reads that text)', () => {
    const e = open(`${DRAWING}\n\nnote* tail`)
    selectDrawing(e)
    typeText(e, '*')
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'paragraph'])
    expect(md(e)).toBe(`${DRAWING}\n\n*\n\nnote* tail`)
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
