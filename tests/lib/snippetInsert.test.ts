// @vitest-environment happy-dom
//
// Inserting an expanded snippet into the editor (snippetCommands.ts) on the
// editor's REAL schema and markdown pipeline (helpers/editorPipeline.ts):
// one-liners join the text at the caret, block snippets render as markdown.
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { load, save, schema } from '../helpers/editorPipeline'
import { snippetSlice } from '../../src/components/Editor/snippetCommands'
import { expandSnippet, suggestionContent, type SuggestionId, type SuggestionLabels } from '../../src/lib/snippets'

/** Inserts `snippet` into the doc of `md` at text offset `at` of its first paragraph. */
function insertAt(md: string, at: number, snippet: string): string {
  const doc = load(md)
  let state = EditorState.create({ doc, schema })
  // Position 1 = start of the first textblock's content.
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + at)))
  state = state.apply(state.tr.replaceSelection(snippetSlice(schema, snippet)))
  return save(state.doc)
}

describe('snippetSlice', () => {
  it('inserts a one-line snippet inline, keeping the paragraph', () => {
    expect(insertAt('Hello world', 6, '07-11-2026 ')).toBe('Hello 07-11-2026 world')
  })

  it('keeps inline marks of a one-line snippet', () => {
    expect(insertAt('Done at', 7, ' **09:05**')).toBe('Done at **09:05**')
  })

  it('renders block markdown (heading, task list) as blocks', () => {
    const out = insertAt('', 0, '## Meeting\n\n- [ ] Follow up')
    expect(out).toContain('## Meeting')
    expect(out).toContain('- [ ] Follow up')
  })

  it('leaves the caret on an empty paragraph after a snippet ending in a blank line', () => {
    const doc = load('')
    let state = EditorState.create({ doc, schema })
    state = state.apply(state.tr.replaceSelection(snippetSlice(schema, '## Saturday\n\n')))
    const { $from } = state.selection
    expect($from.parent.type.name).toBe('paragraph')
    expect($from.parent.content.size).toBe(0)
    expect(state.doc.firstChild?.type.name).toBe('heading')
  })
})

describe('suggested snippets through the editor', () => {
  const labels: SuggestionLabels = {
    names: { today: '', dateTime: '', journal: '', meeting: '', timeDivider: '', signature: '' },
    meeting: { title: 'Meeting', attendees: 'Attendees', notes: 'Notes', actions: 'Action items' },
    signature: 'Your name',
  }
  const at = new Date(2026, 10, 7, 9, 5)
  const expanded = (id: SuggestionId) => expandSnippet(suggestionContent(id, labels, 'en'), at, 'en')

  it('meeting renders headings, an empty bullet and an empty task', () => {
    expect(insertAt('', 0, expanded('meeting'))).toBe(
      '## Meeting — 07-11-2026\n\n**Attendees:**\n\n### Notes\n\n- \n\n### Action items\n\n- [ ]',
    )
  })

  it('divider with time renders a rule and bold time', () => {
    expect(insertAt('', 0, expanded('timeDivider'))).toBe('---\n\n**09:05**')
  })
})
