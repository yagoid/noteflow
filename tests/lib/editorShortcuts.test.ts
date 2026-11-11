// @vitest-environment happy-dom
//
// Keyboard shortcuts of the note editor, on a REAL TipTap editor built from the
// schema Editor.tsx registers (editorExtensions.ts). Keys go through ProseMirror's
// own keydown dispatch (handleKeyDown), the path a real key press takes.
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'

let current: Editor | null = null
afterEach(() => {
  current?.destroy()
  current = null
})

function editor(md: string): Editor {
  current = new Editor({ extensions: schemaExtensions(), content: htmlFromMarkdown(md) })
  return current
}

const markdown = (ed: Editor) => htmlToMarkdown(ed.getHTML()).trim()

/** Caret at the end of the first text that contains `text`. */
function caretIn(ed: Editor, text: string): void {
  let pos = -1
  ed.state.doc.descendants((node, at) => {
    if (pos < 0 && node.isText && node.text?.includes(text)) pos = at + node.text.indexOf(text) + text.length
  })
  expect(pos, `"${text}" not found`).toBeGreaterThan(0)
  ed.commands.setTextSelection(pos)
}

/** Ctrl+Shift+B as the browser reports it: key 'B' (shifted), keyCode 66. ProseMirror
 *  reads Mod as Ctrl off macOS, Meta on it — both flags cover either platform. */
function ctrlShiftB(ed: Editor): boolean {
  const mac = /Mac|iP(hone|[oa]d)/.test(navigator.platform)
  const event = new KeyboardEvent('keydown', {
    key: 'B', shiftKey: true, ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true,
  })
  Object.defineProperty(event, 'keyCode', { value: 66 })
  const { view } = ed
  return view.someProp('handleKeyDown', (f) => f(view, event)) ?? false
}

describe('Ctrl/Cmd+Shift+B', () => {
  it('turns a paragraph into a code block, without a blockquote around it', () => {
    const ed = editor('plain line')
    caretIn(ed, 'plain line')
    expect(ctrlShiftB(ed)).toBe(true)
    expect(ed.state.doc.firstChild?.type.name).toBe('codeBlock')
    expect(markdown(ed)).toBe('```\nplain line\n```')
  })

  it('toggles the code block back off', () => {
    const ed = editor('plain line')
    caretIn(ed, 'plain line')
    ctrlShiftB(ed)
    ctrlShiftB(ed)
    expect(markdown(ed)).toBe('plain line')
  })

  it('inside a quote, makes a code block within the quote (no second quote)', () => {
    const ed = editor('> quoted')
    caretIn(ed, 'quoted')
    expect(ctrlShiftB(ed)).toBe(true)
    expect(markdown(ed)).toBe('> ```\n> quoted\n> ```')
    ctrlShiftB(ed)
    expect(markdown(ed)).toBe('> quoted')
  })

  it('in a list item, lifts the line out of the list into a code block (like the toolbar)', () => {
    const ed = editor('- one\n- two')
    caretIn(ed, 'two')
    expect(ctrlShiftB(ed)).toBe(true)
    expect(markdown(ed)).toBe('- one\n\n```\ntwo\n```')
  })
})

describe('blockquote input paths', () => {
  it('the toolbar command still wraps the line in a quote', () => {
    const ed = editor('plain line')
    caretIn(ed, 'plain line')
    expect(ed.commands.toggleBlockquote()).toBe(true)
    expect(markdown(ed)).toBe('> plain line')
  })

  it('the `> ` input rule still makes a quote', () => {
    const ed = editor('')
    ed.commands.insertContent('>')
    const { view } = ed
    const { from, to } = view.state.selection
    expect(view.someProp('handleTextInput', (f) => f(view, from, to, ' '))).toBe(true)
    expect(ed.state.doc.firstChild?.type.name).toBe('blockquote')
  })
})
