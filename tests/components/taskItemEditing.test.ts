// @vitest-environment happy-dom
//
// Editing task items in the note editor (src/components/Editor/DeadlineTaskItem.ts):
// Enter keeps a task's metadata with its text, and `[ ] ` typed at the start of
// a bullet / numbered item turns it into a task live (listItemTaskInputRule.ts).

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'

const ROBOT = '\u{1F916}'
let ed: Editor | null = null
afterEach(() => { ed?.destroy(); ed = null })

function mount(md: string): Editor {
  ed = new Editor({ extensions: schemaExtensions(), content: htmlFromMarkdown(md) })
  return ed
}
const saved = (e: Editor) => htmlToMarkdown(e.getHTML())

/** Caret inside the first text node equal to `text`, `offset` characters in. */
function caretIn(e: Editor, text: string, offset: number) {
  let pos = -1
  e.state.doc.descendants((n, at) => { if (pos < 0 && n.isText && n.text === text) pos = at + offset })
  if (pos < 0) throw new Error(`no text ${text}`)
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos)))
}

/** A real Enter keydown through the view (the `keyboardShortcut` command captures
 *  the transactions instead of applying them, which a two-step handler can't take). */
function enter(e: Editor) {
  e.view.someProp('handleKeyDown', (f) => f(e.view, new KeyboardEvent('keydown', { key: 'Enter' })))
}

/** What the view does for typed text: the input rules first, the plain insert otherwise. */
function type(e: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = e.state.selection
    const handled = e.view.someProp('handleTextInput', (f) => f(e.view, from, to, ch))
    if (!handled) e.view.dispatch(e.state.tr.insertText(ch, from, to))
  }
}

describe('Enter in a task (slw81)', () => {
  const TASK = `- [x] Write 📅2026-12-02 ⏰09:30 🔺high ${ROBOT}aaaa1:done`

  it('at the very start: the empty item above is blank, everything stays with the text', () => {
    const e = mount(`${TASK}\n- [ ] Next`)
    caretIn(e, 'Write', 0)
    enter(e)
    expect(saved(e).split('\n')).toEqual(['- [ ] ', TASK, '- [ ] Next'])
  })

  it('in the middle and at the end: the first item keeps everything, the new one starts blank', () => {
    let e = mount(TASK)
    caretIn(e, 'Write', 2)
    enter(e)
    expect(saved(e).split('\n')).toEqual([TASK.replace('Write', 'Wr'), '- [ ] ite'])
    e.destroy()

    e = mount(TASK)
    caretIn(e, 'Write', 5)
    enter(e)
    expect(saved(e).split('\n')).toEqual([TASK, '- [ ]']) // the trailing space of the last line is trimmed on save
  })

  it('at the start of an unchecked task with only a deadline', () => {
    const e = mount('- [ ] Call 📅2026-12-02')
    caretIn(e, 'Call', 0)
    enter(e)
    expect(saved(e).split('\n')).toEqual(['- [ ] ', '- [ ] Call 📅2026-12-02'])
  })
})

describe('`[ ] ` typed at the start of a list item (6jww8)', () => {
  it('a bullet becomes a task live, the same thing a reload gives', () => {
    const e = mount('- one\n- two\n- three')
    caretIn(e, 'two', 0)
    type(e, '[ ] ')
    expect(e.state.doc.child(1).type.name).toBe('taskList')
    expect(saved(e)).toBe('- one\n\n- [ ] two\n\n- three')
    // The caret stays at the start of the task's text.
    type(e, 'X')
    expect(e.state.doc.child(1).textContent).toBe('Xtwo')
  })

  it('`[x] ` gives a checked task; one joins the task list next to it', () => {
    const e = mount('- [ ] done already\n- more')
    caretIn(e, 'more', 0)
    type(e, '[x] ')
    expect(e.state.doc.childCount).toBe(1)
    expect(saved(e)).toBe('- [ ] done already\n- [x] more')
  })

  it('an empty bullet (what "- " gives) becomes an empty task', () => {
    const e = mount('text')
    caretIn(e, 'text', 4)
    enter(e)
    type(e, '- [ ] ')
    expect(e.state.doc.child(1).type.name).toBe('taskList')
    type(e, 'buy')
    expect(saved(e)).toBe('text\n\n- [ ] buy')
  })

  it('not in the middle of the text', () => {
    const e = mount('- one two')
    caretIn(e, 'one two', 4)
    type(e, '[ ] ')
    expect(e.state.doc.child(0).type.name).toBe('bulletList')
  })
})
