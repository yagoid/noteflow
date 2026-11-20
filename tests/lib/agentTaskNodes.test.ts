// @vitest-environment happy-dom
//
// The agent-task marker inside the editor document (src/lib/agentTaskNodes.ts):
// a task id must never end on two task items because of a paste — the pasted
// copy loses the marker, the item that was already there keeps it.

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { Slice } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import {
  agentTaskNodes,
  clearAgentMarkers,
  dedupeAgentMarkers,
  duplicateAgentMarkerPositions,
} from '../../src/lib/agentTaskNodes'
import { load, save } from '../helpers/editorPipeline'

const ROBOT = '\u{1F916}'
const MD = [
  `- [ ] One ${ROBOT}aaaa1:running`,
  `  - [ ] Child ${ROBOT}bbbb2:queued`,
  '- [ ] Plain',
  '',
  `> - [x] Quoted ${ROBOT}cccc3:done`,
].join('\n')

describe('agentTaskNodes', () => {
  it('lists every marked task item, nested and quoted ones included, in document order', () => {
    expect(agentTaskNodes(load(MD)).map((t) => [t.id, t.state, t.node.firstChild?.textContent])).toEqual([
      ['aaaa1', 'running', 'One'], ['bbbb2', 'queued', 'Child'], ['cccc3', 'done', 'Quoted'],
    ])
    expect(agentTaskNodes(load('- [ ] nothing\n\ntext'))).toEqual([])
  })
})

describe('duplicateAgentMarkerPositions', () => {
  const DUP = `- [ ] A ${ROBOT}aaaa1:running\n- [ ] B ${ROBOT}aaaa1:done\n- [ ] C ${ROBOT}aaaa1:queued\n- [ ] D ${ROBOT}bbbb2:queued`

  it('no repeated id → nothing to drop', () => {
    expect(duplicateAgentMarkerPositions(load(MD))).toEqual([])
  })

  it('of the items sharing an id the first keeps it by default', () => {
    const doc = load(DUP)
    const all = agentTaskNodes(doc).filter((t) => t.id === 'aaaa1').map((t) => t.pos)
    expect(duplicateAgentMarkerPositions(doc)).toEqual(all.slice(1))
  })

  it('…or the one that was already in the document', () => {
    const doc = load(DUP)
    const all = agentTaskNodes(doc).filter((t) => t.id === 'aaaa1').map((t) => t.pos)
    expect(duplicateAgentMarkerPositions(doc, (pos) => pos === all[2])).toEqual([all[0], all[1]])
  })

  it('clearAgentMarkers removes only the marker: the task, its text and its other attributes stay', () => {
    const state = EditorState.create({ doc: load(`- [ ] A 📅2026-12-01 ${ROBOT}aaaa1:running\n- [ ] B ${ROBOT}aaaa1:done`) })
    const tr = clearAgentMarkers(state.tr, duplicateAgentMarkerPositions(state.doc))
    expect(save(tr.doc)).toBe(`- [ ] A 📅2026-12-01 ${ROBOT}aaaa1:running\n- [ ] B`)
  })
})

describe('dedupeAgentMarkers (after a paste)', () => {
  it('nothing duplicated → null (a cut-and-paste, a paste of unmarked tasks)', () => {
    const state = EditorState.create({ doc: load(MD) })
    expect(dedupeAgentMarkers(state.tr, state.doc, (pos) => pos)).toBeNull()
  })

  it('the copy inserted ABOVE the original loses the marker; the original keeps it', () => {
    const before = load(`- [ ] A ${ROBOT}aaaa1:running\n- [ ] B`)
    const state = EditorState.create({ doc: before })
    // Paste a copy of the first item at the top of the list.
    const item = before.child(0).child(0)
    const tr = state.tr.insert(1, item.copy(item.content))
    const fix = dedupeAgentMarkers(tr, before, (pos) => tr.mapping.mapResult(pos, 1).deleted ? null : tr.mapping.map(pos, 1))
    expect(fix).not.toBeNull()
    const items = agentTaskNodes(fix!.doc)
    expect(items).toHaveLength(1)
    expect(fix!.doc.child(0).child(0).attrs.agentId).toBeNull() // the pasted copy
    expect(fix!.doc.child(0).child(1).attrs.agentId).toBe('aaaa1') // the original
  })
})

describe('the editor plugin (DeadlineTaskItem)', () => {
  function editor(md: string): Editor {
    return new Editor({ extensions: schemaExtensions(), content: htmlFromMarkdown(md) })
  }
  const saved = (ed: Editor) => htmlToMarkdown(ed.getHTML())
  /** What the view dispatches for a paste: the task items of `md` inserted at `index` of the first list. */
  function pasteItems(ed: Editor, md: string, index: number) {
    const list = ed.state.doc.child(0)
    let pos = 1
    for (let i = 0; i < index; i++) pos += list.child(i).nodeSize
    // Rebuilt on the editor's own schema instance (nodes of another instance don't fit).
    const items = ed.schema.nodeFromJSON(load(md).child(0).toJSON()).content
    ed.view.dispatch(ed.state.tr.replace(pos, pos, new Slice(items, 0, 0)).setMeta('paste', true).setMeta('uiEvent', 'paste'))
  }
  function caretAtEndOf(ed: Editor, text: string) {
    let pos = -1
    ed.state.doc.descendants((n, at) => { if (pos < 0 && n.isText && n.text === text) pos = at + text.length })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)))
  }

  it('pasting a copy of a marked task: the copy has no marker, the original keeps it — below or above it', () => {
    for (const index of [2, 0]) {
      const ed = editor(`- [ ] A 📅2026-12-01 ${ROBOT}aaaa1:running\n- [ ] B`)
      pasteItems(ed, `- [ ] A 📅2026-12-01 ${ROBOT}aaaa1:running`, index)
      const lines = saved(ed).split('\n')
      expect(lines).toHaveLength(3)
      const original = index === 0 ? 1 : 0
      expect(lines[original]).toBe(`- [ ] A 📅2026-12-01 ${ROBOT}aaaa1:running`)
      expect(lines[index]).toBe('- [ ] A 📅2026-12-01') // the copy: everything but the marker
      ed.destroy()
    }
  })

  it('a paste that brings a NEW id keeps it', () => {
    const ed = editor('- [ ] B')
    pasteItems(ed, `- [ ] From elsewhere ${ROBOT}zzzz9:review`, 1)
    expect(saved(ed)).toBe(`- [ ] B\n- [ ] From elsewhere ${ROBOT}zzzz9:review`)
    ed.destroy()
  })

  it('cut and paste (a move) keeps the marker', () => {
    const ed = editor(`- [ ] A ${ROBOT}aaaa1:running\n- [ ] B`)
    const list = ed.state.doc.child(0)
    ed.view.dispatch(ed.state.tr.delete(1, 1 + list.child(0).nodeSize).setMeta('uiEvent', 'cut'))
    pasteItems(ed, `- [ ] A ${ROBOT}aaaa1:running`, 1)
    expect(saved(ed)).toBe(`- [ ] B\n- [ ] A ${ROBOT}aaaa1:running`)
    ed.destroy()
  })

  it('a change that is not a paste never touches repeated ids (content from a sync merge)', () => {
    const md = `- [ ] A ${ROBOT}aaaa1:running\n- [ ] A ${ROBOT}aaaa1:done`
    const ed = editor(md)
    caretAtEndOf(ed, 'A')
    ed.commands.insertContent('!')
    expect(saved(ed)).toBe(`- [ ] A! ${ROBOT}aaaa1:running\n- [ ] A ${ROBOT}aaaa1:done`)
    ed.destroy()
  })
})
