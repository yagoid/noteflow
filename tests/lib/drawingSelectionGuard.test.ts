// @vitest-environment happy-dom
//
// A selected drawing block is never replaced by what is typed or pasted, and there is
// always a way to put the caret next to one at the edge of a section. On the editor's
// real schema and extensions (the drawing node's plugin and keymap, TipTap's input rules
// and the undo history included), driving ProseMirror's own DOM event handlers — and
// checking what the editor EMITS to be saved (its `update` events), not only its state.

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { DRAWING_NODE_NAME } from '../../src/components/Editor/DrawingBlock'
import { leaveSelectedDrawing } from '../../src/components/Editor/drawingCommands'
import { insertSnippet } from '../../src/components/Editor/snippetCommands'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'

const F = '```'
const DRAWING = ['<!-- drawing -->', `${F}mermaid`, 'flowchart TD', '  A --> B', F, '<!-- /drawing -->'].join('\n')
const DRAWING_2 = ['<!-- drawing -->', `${F}mermaid`, 'flowchart LR', '  C --> D', F, '<!-- /drawing -->'].join('\n')

let editor: Editor | null = null
// What the app would save: Editor.tsx's onUpdate serializes the editor on every `update`.
let updates = 0
let emitted: string | null = null
afterEach(() => { editor?.destroy(); editor = null })

const md = (e: Editor) => htmlToMarkdown(e.getHTML())
function open(markdown: string): Editor {
  editor?.destroy()
  updates = 0
  emitted = null
  const e = new Editor({ element: document.createElement('div'), extensions: [...schemaExtensions(), History], content: htmlFromMarkdown(markdown) })
  e.on('update', () => { updates++; emitted = md(e) })
  editor = e
  return e
}
/** The last markdown emitted for saving is what the editor holds (nothing changed unannounced). */
const expectSavedIsShown = (e: Editor, opened: string, note = '') => expect(emitted ?? opened, note).toBe(md(e))

const types = (e: Editor) => { const out: string[] = []; e.state.doc.forEach((n) => { out.push(n.type.name) }); return out }
const drawingPos = (e: Editor, nth = 0) => { const all: number[] = []; e.state.doc.forEach((n, offset) => { if (n.type.name === DRAWING_NODE_NAME) all.push(offset) }); return all[nth] ?? -1 }
const selectDrawing = (e: Editor, nth = 0) => e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, drawingPos(e, nth))))
/** What the browser does when ProseMirror leaves a key to it: the text-input chain (input rules first), else a plain insert. */
const browserTypes = (e: Editor, text: string) => {
  const { from, to } = e.state.selection
  const handled = e.view.someProp('handleTextInput', (f) => f(e.view, from, to, text))
  if (!handled) e.view.dispatch(e.state.tr.insertText(text, from, to))
}
/**
 * One key, as it really arrives: a `keypress` DOM event on the editor, handled by
 * ProseMirror's own listener (which decides whether it acts, calls handleKeyPress, and
 * with a node selection writes the character itself). When it leaves the event alone —
 * a caret in a text block — the browser types the character.
 */
const typeKey = (e: Editor, ch: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keypress', { key: ch, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'charCode', { value: ch.charCodeAt(0) })
  e.view.dom.dispatchEvent(event)
  // Ctrl without Alt is a shortcut, not text: neither ProseMirror nor the browser types.
  if (!event.defaultPrevented && !(init.ctrlKey && !init.altKey)) browserTypes(e, ch)
}
const typeText = (e: Editor, text: string) => { for (const ch of text) typeKey(e, ch) }

const domEvent = (e: Editor, type: string, event: Event) =>
  e.view.someProp('handleDOMEvents', (handlers) => { (handlers as Record<string, ((v: unknown, ev: Event) => unknown) | undefined>)[type]?.(e.view, event); return undefined })
const clipboard = (data: Record<string, string>, extraTypes: string[] = []) =>
  Object.assign(new Event('paste'), { clipboardData: { types: [...Object.keys(data), ...extraTypes], files: [], getData: (t: string) => data[t] ?? '' } })
/** A paste: the guard's DOM handler, then what the editor's paste does (insert at the selection). */
const paste = (e: Editor, text: string) => {
  domEvent(e, 'paste', clipboard(text ? { 'text/plain': text } : {}))
  if (text) e.view.dispatch(e.state.tr.replaceSelectionWith(e.schema.text(text), true).setMeta('paste', true).setMeta('uiEvent', 'paste'))
}
const later = () => new Promise((resolve) => setTimeout(resolve, 5))

// A real key press (the keymap dispatches the handler's whole transaction; TipTap's
// keyboardShortcut command only replays its steps, without the selection).
const press = (e: Editor, key: string, ctrl = false) =>
  !!e.view.someProp('handleKeyDown', (f) => f(e.view, new KeyboardEvent('keydown', { key, ctrlKey: ctrl })))

// Before a list: a paragraph between the drawing and the list is visible in the markdown.
const BEFORE_LIST = `${DRAWING}\n\n- item`
const caretIntoList = (e: Editor) => e.commands.setTextSelection(e.state.doc.content.size - 2)

describe('typing with a drawing selected', () => {
  it('goes to a new paragraph below; the drawing stays (it used to be replaced)', () => {
    const doc = `Intro\n\n${DRAWING}`
    const e = open(doc)
    selectDrawing(e)
    typeText(e, 'Linea final.')
    expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
    expect(md(e)).toBe(`Intro\n\n${DRAWING}\n\nLinea final.`)
    expect(e.state.selection instanceof TextSelection).toBe(true)
    expectSavedIsShown(e, doc)
  })

  it('uses the empty paragraph already below, and never types into the next block', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    typeText(e, 'x')
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
    expect(md(e)).toBe(`${DRAWING}\n\nx\n\n- item`)

    const e2 = open(`${DRAWING}\n\nNext paragraph`)
    selectDrawing(e2)
    typeText(e2, 'y')
    expect(md(e2)).toBe(`${DRAWING}\n\ny\n\nNext paragraph`)
  })

  it('a drawing that is the whole document', () => {
    const e = open(DRAWING)
    selectDrawing(e)
    typeText(e, 'a')
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph'])
    expect(md(e)).toBe(`${DRAWING}\n\na`)
    expectSavedIsShown(e, DRAWING)
  })

  it('two drawings in a row: the text goes between them, or after the last', () => {
    const doc = `${DRAWING}\n\n${DRAWING_2}`
    const e = open(doc)
    selectDrawing(e, 0)
    typeText(e, 'mid')
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph', DRAWING_NODE_NAME])
    expect(md(e)).toBe(`${DRAWING}\n\nmid\n\n${DRAWING_2}`)
    expectSavedIsShown(e, doc)

    const e2 = open(doc)
    selectDrawing(e2, 1)
    typeText(e2, 'end')
    expect(md(e2)).toBe(`${DRAWING}\n\n${DRAWING_2}\n\nend`)
    expectSavedIsShown(e2, doc)
  })

  it('one Ctrl+Z takes back the text and the paragraph together; nothing is left that undo cannot reach', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    typeText(e, 'hi')
    caretIntoList(e)
    expect(md(e)).toBe(`${DRAWING}\n\nhi\n\n- item`)
    e.commands.undo()
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
    expect(md(e)).toBe(BEFORE_LIST)
    expect(e.can().undo()).toBe(false)
    expectSavedIsShown(e, BEFORE_LIST)
    // …and redo brings both back.
    e.commands.redo()
    expect(md(e)).toBe(`${DRAWING}\n\nhi\n\n- item`)
    expectSavedIsShown(e, BEFORE_LIST)
  })

  it('does not merge into the edit made just before (the paragraph starts an undo step of its own)', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    e.commands.setTextSelection(6)
    typeText(e, '!')
    selectDrawing(e)
    typeText(e, 'x')
    e.commands.undo()
    expect(md(e)).toBe(`Intro!\n\n${DRAWING}`)
  })

  it('an empty paragraph of the user below is used as it is, and stays when nothing is written', () => {
    const e = open(`${DRAWING}\n\nNext`)
    const at = drawingPos(e) + e.state.doc.nodeAt(drawingPos(e))!.nodeSize
    e.view.dispatch(e.state.tr.insert(at, e.schema.nodes.paragraph.create()))
    const shape = [DRAWING_NODE_NAME, 'paragraph', 'paragraph']
    expect(types(e)).toEqual(shape)
    const before = updates
    selectDrawing(e)
    paste(e, '') // nothing to paste
    domEvent(e, 'compositionstart', new Event('compositionstart')) // …and a composition that is cancelled
    expect(types(e)).toEqual(shape)
    expect(e.state.selection.from).toBe(at + 1)
    e.commands.setTextSelection(e.state.doc.content.size - 1)
    selectDrawing(e)
    expect(types(e)).toEqual(shape)
    expect(updates).toBe(before) // the document was never changed
  })

  it('does nothing in a read-only editor', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    e.setEditable(false)
    updates = 0 // (setEditable emits an `update` of its own)
    selectDrawing(e)
    domEvent(e, 'paste', clipboard({ 'text/plain': 'x' }))
    domEvent(e, 'compositionstart', new Event('compositionstart'))
    e.view.someProp('handleKeyPress', (f) => f(e.view, Object.defineProperty(new KeyboardEvent('keypress', { key: 'x' }), 'charCode', { value: 120 })))
    expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME])
    expect(updates).toBe(0)
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

// The modifiers ProseMirror itself goes by (editHandlers.keypress): it ignores a keypress
// with Ctrl and no Alt, and writes every other one that carries a character — Alt
// included: Option+key on macOS, AltGr (Ctrl+Alt) elsewhere, are how [ ] { } # @ | ~ are
// typed. The guard uses the same condition, so whatever is written lands below.
describe('modifier keys with a drawing selected', () => {
  const ABOVE = 'see *note'
  const MODIFIERS: [name: string, init: KeyboardEventInit][] = [
    ['no modifier', {}],
    ['Alt (Option on macOS)', { altKey: true }],
    ['AltGr (Ctrl+Alt)', { altKey: true, ctrlKey: true }],
    ['Shift', { shiftKey: true }],
  ]
  for (const [name, init] of MODIFIERS) {
    it(`${name}: a key completing an input rule of the text above never takes the drawing`, () => {
      const doc = `${ABOVE}\n\n${DRAWING}`
      const e = open(doc)
      const above = e.state.doc.child(0).toJSON()
      selectDrawing(e)
      typeKey(e, '*', init)
      expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
      expect(e.state.doc.child(0).toJSON()).toEqual(above)
      expect(md(e)).toBe(`${ABOVE}\n\n${DRAWING}\n\n*`)
      expectSavedIsShown(e, doc)
    })
  }

  it('Ctrl+key and a line break are not text: nothing is made, nothing is emitted', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    typeKey(e, 'b', { ctrlKey: true })
    e.view.someProp('handleKeyPress', (f) => f(e.view, Object.defineProperty(new KeyboardEvent('keypress', { key: 'Enter' }), 'charCode', { value: 13 })))
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
    expect(e.state.selection instanceof NodeSelection).toBe(true)
    expect(updates).toBe(0)
  })
})

describe('pasting and composing with a drawing selected', () => {
  it('a paste with nothing in it touches nothing', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    paste(e, '')
    domEvent(e, 'paste', clipboard({ 'text/plain': '', 'text/html': '' }))
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'bulletList'])
    expect(e.state.selection instanceof NodeSelection).toBe(true)
    expect(updates).toBe(0)
    expect(e.can().undo()).toBe(false)
  })

  it('pasted text lands below; what is saved is what is shown; one undo takes it all back', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    paste(e, 'pasted')
    expect(md(e)).toBe(`${DRAWING}\n\npasted\n\n- item`)
    expectSavedIsShown(e, BEFORE_LIST)
    caretIntoList(e)
    e.commands.undo()
    expect(md(e)).toBe(BEFORE_LIST)
    expect(e.can().undo()).toBe(false)
    expectSavedIsShown(e, BEFORE_LIST)
  })

  it('HTML alone is content too', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    selectDrawing(e)
    domEvent(e, 'paste', clipboard({ 'text/html': '<b>x</b>' }))
    expect(e.state.selection instanceof TextSelection).toBe(true)
    expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
  })

  it('an IME composition starts below; cancelled, its paragraph is an ordinary edit: saved as shown, undoable', () => {
    const e = open(BEFORE_LIST)
    selectDrawing(e)
    domEvent(e, 'compositionstart', new Event('compositionstart'))
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
    expect(updates).toBe(1)
    expectSavedIsShown(e, BEFORE_LIST)
    // The composition writes nothing and the caret moves on: nothing changes behind the user's back.
    caretIntoList(e)
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
    expect(updates).toBe(1)
    expectSavedIsShown(e, BEFORE_LIST)
    e.commands.undo()
    expect(md(e)).toBe(BEFORE_LIST)
    expectSavedIsShown(e, BEFORE_LIST)
  })

  it('a composition that does write', () => {
    const e = open(`Intro\n\n${DRAWING}`)
    selectDrawing(e)
    domEvent(e, 'compositionstart', new Event('compositionstart'))
    e.view.dispatch(e.state.tr.insertText('日本'))
    expect(md(e)).toBe(`Intro\n\n${DRAWING}\n\n日本`)
  })

  // An image pasted (or dropped) with a drawing selected is READ asynchronously and
  // inserted later at whatever is selected then: the insert itself steps off a drawing.
  it('pasted files with a later, asynchronous insert: the image lands below, the drawing stays', async () => {
    const IMG = 'data:image/png;base64,iVBORw0KGgo='
    const insertImageLater = async (e: Editor) => {
      await later() // the FileReader
      await later()
      leaveSelectedDrawing(e) // what Editor.tsx → insertImageFiles does before setImage
      e.chain().setImage({ src: IMG, alt: 'shot' }).run()
    }
    // Files only (a screenshot): the guard leaves the selection alone; the insert moves off.
    const doc = `Intro\n\n${DRAWING}`
    const files = open(doc)
    selectDrawing(files)
    domEvent(files, 'paste', clipboard({}, ['Files']))
    expect(files.state.selection instanceof NodeSelection).toBe(true)
    expect(updates).toBe(0)
    await insertImageLater(files)
    expect(types(files)).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
    expect(md(files)).toBe(`Intro\n\n${DRAWING}\n\n![shot](${IMG})`)
    expectSavedIsShown(files, doc)

    // Files + HTML (an image copied from a browser): the guard's paragraph takes the image.
    const both = open(doc)
    selectDrawing(both)
    domEvent(both, 'paste', clipboard({ 'text/html': '<img src="x">' }, ['Files']))
    await insertImageLater(both)
    expect(md(both)).toBe(`Intro\n\n${DRAWING}\n\n![shot](${IMG})`)
    expectSavedIsShown(both, doc)

    // A drop never went through the guard at all: same protection at the insert.
    const dropped = open(BEFORE_LIST)
    selectDrawing(dropped)
    await insertImageLater(dropped)
    expect(types(dropped)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
    expect(md(dropped)).toContain(DRAWING)
    expectSavedIsShown(dropped, BEFORE_LIST)
  })
})

// Anything else that inserts at the selection from outside ProseMirror's input steps off
// a selected drawing first (the rule: leaveSelectedDrawing / stepOffSelectedDrawing).
describe('toolbar inserts with a drawing selected', () => {
  it('a snippet goes below the drawing', () => {
    for (const snippet of ['Regards, me', '## Title\n\n- one\n- two']) {
      const doc = `Intro\n\n${DRAWING}`
      const e = open(doc)
      selectDrawing(e)
      insertSnippet(e, snippet)
      expect(md(e), snippet).toBe(`Intro\n\n${DRAWING}\n\n${snippet}`)
      expectSavedIsShown(e, doc, snippet)
      e.commands.undo()
      expect(md(e), snippet).toBe(doc)
    }
  })

  it('a section link goes below the drawing', () => {
    const doc = `${DRAWING}\n\n- item`
    const e = open(doc)
    selectDrawing(e)
    e.commands.insertSectionRelation({ noteId: 'n1', sectionId: 's1', sectionName: 'Target' })
    expect(types(e)).toEqual([DRAWING_NODE_NAME, 'paragraph', 'bulletList'])
    expect(md(e)).toContain(DRAWING)
    expect(md(e)).toContain('[Target](noteflow://n1/s1)')
    expectSavedIsShown(e, doc)
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
    const doc = `Intro\n\n${DRAWING}`
    const e = open(doc)
    selectDrawing(e)
    typeText(e, '- item')
    expect(types(e)).toEqual(['paragraph', DRAWING_NODE_NAME, 'bulletList'])
    expect(md(e)).toBe(`Intro\n\n${DRAWING}\n\n- item`)
    expectSavedIsShown(e, doc)
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
  // The paragraph an arrow makes is an ordinary edit and stays; an empty paragraph at the
  // start or the end of a section is not written, so moving around changes nothing saved.
  it('arrow down / right on a drawing that ends the document makes a paragraph below; the markdown is the same', () => {
    for (const key of ['ArrowDown', 'ArrowRight']) {
      const doc = `Intro\n\n${DRAWING}`
      const e = open(doc)
      selectDrawing(e)
      expect(press(e, key), key).toBe(true)
      expect(types(e), key).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
      expect(e.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(e.state.selection.from).toBeGreaterThan(drawingPos(e))
      expect(md(e), key).toBe(doc)
      expect(updates, key).toBe(1)
      expect(emitted, key).toBe(doc)
      // Moving on leaves it there, with nothing else emitted.
      e.commands.setTextSelection(2)
      expect(types(e), key).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
      expect(updates, key).toBe(1)
    }
  })

  it('arrow up / left on a drawing that starts the document makes a paragraph above; the markdown is the same', () => {
    for (const key of ['ArrowUp', 'ArrowLeft']) {
      const doc = `${DRAWING}\n\nOutro`
      const e = open(doc)
      selectDrawing(e)
      expect(press(e, key), key).toBe(true)
      expect(types(e), key).toEqual(['paragraph', DRAWING_NODE_NAME, 'paragraph'])
      expect(e.state.selection.from).toBeLessThan(drawingPos(e))
      expect(md(e), key).toBe(doc)
      expect(emitted, key).toBe(doc)
    }
  })

  it('Ctrl+End / Ctrl+Home go past a drawing that ends / starts the document; only typing changes the markdown', () => {
    const doc = `Intro\n\n${DRAWING}`
    const e = open(doc)
    e.commands.setTextSelection(2)
    expect(press(e, 'End', true)).toBe(true)
    expect(md(e)).toBe(doc)
    expectSavedIsShown(e, doc)
    typeText(e, 'Linea final.')
    expect(md(e)).toBe(`Intro\n\n${DRAWING}\n\nLinea final.`)
    expectSavedIsShown(e, doc)

    const doc2 = `${DRAWING}\n\nOutro`
    const e2 = open(doc2)
    expect(press(e2, 'Home', true)).toBe(true)
    expect(md(e2)).toBe(doc2)
    expectSavedIsShown(e2, doc2)
    typeText(e2, 'Antes')
    expect(md(e2)).toBe(`Antes\n\n${DRAWING}\n\nOutro`)

    // No drawing at that edge: the editor's own Ctrl+End.
    const e3 = open(doc2)
    expect(press(e3, 'End', true)).toBe(false)
  })

  it('in the middle of a document the arrows are left to the editor', () => {
    const e = open(`Intro\n\n${DRAWING}\n\nOutro`)
    selectDrawing(e)
    const before = types(e)
    press(e, 'ArrowDown')
    press(e, 'ArrowUp')
    expect(types(e)).toEqual(before)
    expect(updates).toBe(0)
  })
})
