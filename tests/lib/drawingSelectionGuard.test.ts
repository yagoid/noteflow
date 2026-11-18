// @vitest-environment happy-dom
//
// A selected drawing block is never replaced by what is typed or pasted, and there is
// always a way to put the caret next to one at the edge of a section. On the editor's
// real schema and extensions (the drawing node's plugin and keymap included).

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { DRAWING_NODE_NAME } from '../../src/components/Editor/DrawingBlock'
import { leaveSelectedDrawing } from '../../src/components/Editor/drawingCommands'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'

const F = '```'
const DRAWING = ['<!-- drawing -->', `${F}mermaid`, 'flowchart TD', '  A --> B', F, '<!-- /drawing -->'].join('\n')

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function open(md: string): Editor {
  editor = new Editor({ element: document.createElement('div'), extensions: [...schemaExtensions(), History], content: htmlFromMarkdown(md) })
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
/** The `keypress` of a key that types `ch` (with its charCode, which ProseMirror goes by). */
const keypress = (ch: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keypress', { key: ch, ...init })
  Object.defineProperty(event, 'charCode', { value: ch.charCodeAt(0) })
  return event
}
/**
 * Typing as the browser delivers it, one key at a time: the `keypress` of a printable key
 * (ProseMirror runs handleKeyPress), then the character itself through the text-input
 * chain — where TipTap's input rules come FIRST. The editor is the real one, rules loaded.
 */
const typeText = (e: Editor, text: string) => {
  for (const ch of text) {
    e.view.someProp('handleKeyPress', (f) => f(e.view, keypress(ch)))
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

  // Before a list: an empty paragraph left there would change the markdown.
  const BEFORE_LIST = `${DRAWING}\n\n- item`
  const caretIntoList = (e: Editor) => e.commands.setTextSelection(e.state.doc.content.size - 2)

  it('a paste with nothing to paste does not touch the document', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    domEvent(e, 'paste', pasteEvent([]))
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
    expect(e.state.selection instanceof NodeSelection).toBe(true)
  })

  it('a paste or a composition that ends up writing nothing: the paragraph goes when the caret leaves it, and undo has nothing to undo', () => {
    for (const [type, event] of [['paste', pasteEvent(['text/plain'])], ['compositionstart', new Event('compositionstart')]] as const) {
      const e = open(BEFORE_LIST)
      selectDrawing(e)
      domEvent(e, type, event)
      // The caret waits there (whatever comes later — an async insert — finds it)…
      expect(types(e), type).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
      expect(e.can().undo(), type).toBe(false)
      // …and nothing came: leaving it takes it out again, with no phantom undo step.
      caretIntoList(e)
      expect(types(e), type).toEqual([DRAWING_NODE_NAME, 'bulletList'])
      expect(md(e), type).toBe(BEFORE_LIST)
      expect(e.can().undo(), type).toBe(false)
      editor?.destroy()
    }
  })

  it('selecting the drawing again also removes the unused paragraph', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    domEvent(e, 'paste', pasteEvent(['text/plain']))
    selectDrawing(e)
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
    expect(e.state.selection instanceof NodeSelection).toBe(true)
  })

  it('a paragraph that was written into stays, and typing + undo leaves no orphan', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    typeText(e, 'hi')
    caretIntoList(e)
    expect(md(e)).toBe(`${DRAWING}\n\nhi\n\n- item`)

    const u = open(BEFORE_LIST)
    selectDrawing(u)
    typeText(u, 'x')
    u.commands.undo()
    caretIntoList(u)
    expect(md(u)).toBe(BEFORE_LIST)
  })

  it('a key press that types nothing (Alt+letter, a control character) makes no paragraph', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    e.view.someProp('handleKeyPress', (f) => f(e.view, keypress('f', { altKey: true })))
    e.view.someProp('handleKeyPress', (f) => f(e.view, keypress('\r')))
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
    // AltGr (Ctrl+Alt) does type: @ # [ on many layouts.
    e.view.someProp('handleKeyPress', (f) => f(e.view, keypress('@', { altKey: true, ctrlKey: true })))
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
  })

  // The regression: an image pasted (or dropped) with a drawing selected is READ
  // asynchronously and inserted later at whatever is selected then. Nothing may have
  // restored the node selection meanwhile, and the insert itself steps off a drawing.
  it('pasted files with a later, asynchronous insert: the image lands below, the drawing stays', async () => {
    const IMG = 'data:image/png;base64,iVBORw0KGgo='
    const insertImageLater = async (e: Editor) => {
      await later() // the FileReader
      await later()
      leaveSelectedDrawing(e) // what Editor.tsx → insertImageFiles does before setImage
      e.chain().setImage({ src: IMG, alt: 'shot' }).run()
    }
    // Files only (a screenshot): the guard leaves the selection alone; the insert moves off.
    const files = open(`Intro\n\n${DRAWING}`)
    selectDrawing(files)
    domEvent(files, 'paste', pasteEvent(['Files']))
    expect(files.state.selection instanceof NodeSelection).toBe(true)
    await insertImageLater(files)
    expect(types(files)).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
    expect(md(files)).toBe(`Intro\n\n${DRAWING}\n\n![shot](${IMG})`)
    editor?.destroy()

    // Files + text types (some apps): the guard's paragraph is still there when the image arrives.
    const both = open(`Intro\n\n${DRAWING}`)
    selectDrawing(both)
    domEvent(both, 'paste', pasteEvent(['text/html', 'Files']))
    await insertImageLater(both)
    expect(md(both)).toBe(`Intro\n\n${DRAWING}\n\n![shot](${IMG})`)
    editor?.destroy()

    // A drop never went through the guard at all: same protection at the insert.
    const dropped = open(`${DRAWING}\n\n- item`)
    selectDrawing(dropped)
    await insertImageLater(dropped)
    expect(types(dropped)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
    expect(md(dropped)).toContain(DRAWING)
  })

  it('does nothing in a read-only editor', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    e.setEditable(false)
    selectDrawing(e)
    domEvent(e, 'paste', pasteEvent(['text/plain']))
    e.view.someProp('handleKeyPress', (f) => f(e.view, keypress('x')))
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
