import { describe, it, expect } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { EditorState, Plugin, TextSelection } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import {
  autoCloseTextInput,
  createAutoCloseBracketsPlugin,
  deleteAutoClosedPair,
  shouldAutoClose,
} from '../../src/lib/autoCloseBrackets'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    code_block: { group: 'block', content: 'text*', code: true },
    text: {},
  },
})

// Text positions: paragraph i's content starts at its offset + 1. `caret` (and
// `head`) are offsets inside the first paragraph.
function stateFor(text: string, caret: number, head = caret): EditorState {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, text ? schema.text(text) : undefined)])
  const state = EditorState.create({ doc, plugins: [createAutoCloseBracketsPlugin()] })
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, caret + 1, head + 1)))
}

const text = (s: EditorState) => s.doc.textContent
const caret = (s: EditorState) => s.selection.from - 1

/** Types `ch` the way the editor would: our transaction, or a plain insert. */
function type(state: EditorState, ch: string): EditorState {
  const { from, to } = state.selection
  const tr: Transaction = autoCloseTextInput(state, from, to, ch) ?? state.tr.insertText(ch, from, to)
  return state.apply(tr)
}

function backspace(state: EditorState): EditorState {
  let next = state
  const handled = deleteAutoClosedPair(state, (tr) => { next = state.apply(tr) })
  if (handled) return next
  const { from } = state.selection
  return state.apply(state.tr.delete(from - 1, from))
}

describe('shouldAutoClose', () => {
  it('closes at the end of the block or before punctuation/space', () => {
    expect(shouldAutoClose('')).toBe(true)
    expect(shouldAutoClose(' ')).toBe(true)
    expect(shouldAutoClose(')')).toBe(true)
    expect(shouldAutoClose('.')).toBe(true)
  })

  it('does not close before a letter or digit (any script)', () => {
    expect(shouldAutoClose('a')).toBe(false)
    expect(shouldAutoClose('Ñ')).toBe(false)
    expect(shouldAutoClose('7')).toBe(false)
    expect(shouldAutoClose('é')).toBe(false)
  })
})

describe('auto-closing ( )', () => {
  it('inserts the pair with the caret inside, in one transaction', () => {
    const s = type(stateFor('foo ', 4), '(')
    expect(text(s)).toBe('foo ()')
    expect(caret(s)).toBe(5)
  })

  it('does not close in front of a word', () => {
    const s = type(stateFor('word', 0), '(')
    expect(text(s)).toBe('(word')
  })

  it('wraps a selection and keeps it selected', () => {
    const s = type(stateFor('a word here', 2, 6), '(')
    expect(text(s)).toBe('a (word) here')
    expect(s.selection.from - 1).toBe(3)
    expect(s.selection.to - 1).toBe(7)
  })

  it('steps over the auto-inserted ) instead of doubling it', () => {
    let s = type(stateFor('', 0), '(')
    s = type(s, 'x')
    s = type(s, ')')
    expect(text(s)).toBe('(x)')
    expect(caret(s)).toBe(3)
  })

  it('handles nested pairs', () => {
    let s = type(stateFor('', 0), '(')
    s = type(s, '(')
    s = type(s, ')')
    s = type(s, ')')
    expect(text(s)).toBe('(())')
    expect(caret(s)).toBe(4)
  })

  it('does not skip a ) the user typed', () => {
    // Plain `a)` (no auto-insert): typing `)` before the existing one doubles it.
    const s = type(stateFor('a)', 1), ')')
    expect(text(s)).toBe('a))')
  })

  it('forgets the pair once the caret leaves it', () => {
    let s = type(stateFor('', 0), '(')
    // Caret moves past the `)` and back in: no longer auto-closed.
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 3)))
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 2)))
    s = type(s, ')')
    expect(text(s)).toBe('())')
  })

  it('forgets the pair once the caret leaves it to the left', () => {
    let s = type(stateFor('ab', 2), '(')
    // `ab(|)` → caret before the `(` → back inside: no longer auto-closed.
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 3)))
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 4)))
    s = type(s, ')')
    expect(text(s)).toBe('ab())')
  })

  it('does not skip the ) once its ( was deleted', () => {
    let s = type(stateFor('ab', 2), '(')
    // `ab(|)` → caret before `(` → Delete removes it → `ab|)`.
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 3)))
    s = s.apply(s.tr.delete(3, 4))
    expect(text(s)).toBe('ab)')
    expect(caret(s)).toBe(2)
    s = type(s, ')')
    expect(text(s)).toBe('ab))')
  })

  it('drops the pair when its ( is deleted with the caret still inside', () => {
    let s = type(stateFor('', 0), '(')
    s = type(s, 'x')
    // Delete the `(` without moving the caret (e.g. a programmatic edit).
    s = s.apply(s.tr.delete(1, 2))
    expect(text(s)).toBe('x)')
    s = type(s, ')')
    expect(text(s)).toBe('x))')
  })

  it('backspace in an empty auto-inserted pair deletes both', () => {
    let s = type(stateFor('ab', 2), '(')
    s = backspace(s)
    expect(text(s)).toBe('ab')
    expect(caret(s)).toBe(2)
  })

  it('backspace after typing inside the pair, back to empty, still deletes both', () => {
    let s = type(stateFor('', 0), '(')
    s = type(s, 'x')
    s = backspace(s)
    expect(text(s)).toBe('()')
    s = backspace(s)
    expect(text(s)).toBe('')
  })

  it('backspace in a () the user typed deletes only the (', () => {
    const s = backspace(stateFor('()', 1))
    expect(text(s)).toBe(')')
  })

  it('drops the auto-inserted ) when an input rule consumes the typed )', () => {
    // Stand-in for TipTap's input-rules plugin: same spec flag and meta shape.
    const inputRules = new Plugin({ isInputRules: true })
    const doc = schema.node('doc', null, [schema.node('paragraph')])
    let s = EditorState.create({ doc, plugins: [inputRules, createAutoCloseBracketsPlugin()] })
    for (const ch of '![a](') s = type(s, ch)
    s = type(s, 'x')
    expect(text(s)).toBe('![a](x)')
    // The "image rule" replaces `![a](x` + typed `)` with `IMG`, leaving our `)`.
    const from = s.selection.from
    const rule = s.tr.insertText('IMG', 1, from).setMeta(inputRules, { from, to: from, text: ')' })
    s = s.applyTransaction(rule).state
    expect(text(s)).toBe('IMG')
  })

  it('keeps the ) when an input rule fires on another character', () => {
    const inputRules = new Plugin({ isInputRules: true })
    const doc = schema.node('doc', null, [schema.node('paragraph')])
    let s = EditorState.create({ doc, plugins: [inputRules, createAutoCloseBracketsPlugin()] })
    s = type(s, '(')
    const rule = s.tr.insertText('*', 2).setMeta(inputRules, { text: '*' })
    s = s.applyTransaction(rule).state
    expect(text(s)).toBe('(*)')
  })

  it('works inside code blocks', () => {
    const doc = schema.node('doc', null, [schema.node('code_block', null, schema.text('f'))])
    let s = EditorState.create({ doc, plugins: [createAutoCloseBracketsPlugin()] })
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 2)))
    s = type(s, '(')
    expect(text(s)).toBe('f()')
    s = type(s, ')')
    expect(text(s)).toBe('f()')
  })
})
