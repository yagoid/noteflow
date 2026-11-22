// @vitest-environment happy-dom
//
// The agent-task marker inside the editor document (src/lib/agentTaskNodes.ts):
// a task id must never end on two task items because of a paste — the pasted
// copy loses the marker, the item that was already there keeps it.

import { describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import { Slice } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import {
  agentIdsInDoc,
  agentMarkerChanges,
  agentTaskNodes,
  clearAgentMarkers,
  dedupeAgentMarkers,
  duplicateAgentMarkerPositions,
} from '../../src/lib/agentTaskNodes'
import { load, save } from '../helpers/editorPipeline'
import { setAgentNoteId } from '../../src/components/Editor/useAgentTask'
import { resetAgentTasksStoreForTests, useAgentTasksStore } from '../../src/stores/agentTasksStore'

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

describe('agentIdsInDoc', () => {
  it('gathers the ids of the task items and of the kanban cards (a board keeps them in an attribute)', () => {
    const doc = load([
      `- [ ] One ${ROBOT}aaaa1:running`,
      `  - [ ] Child ${ROBOT}bbbb2:queued`,
      '',
      '<!-- kanban -->',
      '- Todo',
      `  - [ ] Card ${ROBOT}cccc3:queued`,
      '  - [ ] Plain card',
      '- Done',
      `  - [x] Shipped ${ROBOT}dddd4:done`,
      '<!-- /kanban -->',
      '',
      `A paragraph that mentions ${ROBOT}eeee5:done is not a task.`,
    ].join('\n'))
    expect([...agentIdsInDoc(doc)].sort()).toEqual(['aaaa1', 'bbbb2', 'cccc3', 'dddd4'])
    expect(agentIdsInDoc(load('- [ ] nothing\n\ntext')).size).toBe(0)
  })
})

describe('agentMarkerChanges (what an edit did to the markers)', () => {
  /** The position of the task item whose text starts with `text`. */
  function taskAt(doc: ReturnType<typeof load>, text: string): number {
    let found = -1
    doc.descendants((node, pos) => {
      if (found < 0 && node.type.name === 'taskItem' && node.firstChild?.textContent.startsWith(text)) found = pos
      return found < 0
    })
    return found
  }
  function setAttrs(doc: ReturnType<typeof load>, text: string, attrs: Record<string, unknown>) {
    const state = EditorState.create({ doc })
    const pos = taskAt(doc, text)
    return state.tr.setNodeMarkup(pos, undefined, { ...doc.nodeAt(pos)!.attrs, ...attrs }).doc
  }

  it('typing, even inside a marked task, changes none', () => {
    const doc = load(MD)
    const state = EditorState.create({ doc })
    const typed = state.tr.insertText('!', taskAt(doc, 'One') + 5).doc
    expect(agentMarkerChanges(doc, typed)).toBeNull()
    expect(agentMarkerChanges(doc, doc)).toBeNull()
  })

  it('a state that changes, a marker that comes and one that goes', () => {
    const doc = load(MD)
    expect(agentMarkerChanges(doc, setAttrs(doc, 'Child', { agentState: 'failed' }))).toEqual({ changed: ['bbbb2'], appeared: [], gone: [] })
    expect(agentMarkerChanges(doc, setAttrs(doc, 'Plain', { agentId: 'zzzz9', agentState: 'queued' }))).toEqual({ changed: [], appeared: ['zzzz9'], gone: [] })
    expect(agentMarkerChanges(doc, setAttrs(doc, 'One', { agentId: null, agentState: null }))).toEqual({ changed: [], appeared: [], gone: ['aaaa1'] })
    // A whole marked task deleted: its id goes (the subtask's too).
    const state = EditorState.create({ doc })
    const one = taskAt(doc, 'One')
    expect(agentMarkerChanges(doc, state.tr.delete(one, one + doc.nodeAt(one)!.nodeSize).doc)?.gone.sort()).toEqual(['aaaa1', 'bbbb2'])
  })

  it('an id on two items (a sync merge can leave that): a change on ANY of them is followed; moving them is not', () => {
    const doc = load([`- [ ] First ${ROBOT}dupe1:running`, '- [ ] Between', `- [ ] Second ${ROBOT}dupe1:running`].join('\n'))
    expect(agentMarkerChanges(doc, setAttrs(doc, 'Second', { agentState: 'done' }))).toEqual({ changed: ['dupe1'], appeared: [], gone: [] })
    expect(agentMarkerChanges(doc, setAttrs(doc, 'First', { agentState: 'done' }))).toEqual({ changed: ['dupe1'], appeared: [], gone: [] })
    // One of the two loses its marker: the id stays in the document, its states changed.
    expect(agentMarkerChanges(doc, setAttrs(doc, 'First', { agentId: null, agentState: null }))).toEqual({ changed: ['dupe1'], appeared: [], gone: [] })
  })

  it('a kanban card whose state changes (a board keeps its cards in an attribute)', () => {
    const doc = load(['<!-- kanban -->', '- Todo', `  - [ ] Card ${ROBOT}cccc3:review`, '<!-- /kanban -->'].join('\n'))
    let boardPos = -1
    doc.descendants((node, pos) => { if (node.attrs.board !== undefined) boardPos = pos; return boardPos < 0 })
    const board = doc.nodeAt(boardPos)!.attrs.board as { columns: { cards: Record<string, unknown>[] }[] }
    const next = { ...board, columns: board.columns.map((c) => ({ ...c, cards: c.cards.map((card) => ({ ...card, checked: true, agentState: 'done' })) })) }
    const after = EditorState.create({ doc }).tr.setNodeMarkup(boardPos, undefined, { ...doc.nodeAt(boardPos)!.attrs, board: next }).doc
    expect(agentMarkerChanges(doc, after)).toEqual({ changed: ['cccc3'], appeared: [], gone: [] })
  })
})

describe('the block follows the line (DeadlineTaskItem → agentTasksStore.followLines)', () => {
  function mount(md: string) {
    resetAgentTasksStoreForTests()
    const followLines = vi.fn()
    useAgentTasksStore.setState({ followLines })
    const ed = new Editor({ extensions: [...schemaExtensions(), History], content: htmlFromMarkdown(md) })
    setAgentNoteId(ed, 'n1')
    return { ed, followLines }
  }
  const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))
  function setState(ed: Editor, text: string, attrs: Record<string, unknown>) {
    let pos = -1
    ed.state.doc.descendants((node, at) => {
      if (pos < 0 && node.type.name === 'taskItem' && node.firstChild?.textContent.startsWith(text)) pos = at
      return pos < 0
    })
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...ed.state.doc.nodeAt(pos)!.attrs, ...attrs }))
  }

  it('an action and its Ctrl+Z / Ctrl+Y each reach the store, after the dispatch', async () => {
    const { ed, followLines } = mount(`- [ ] Task ${ROBOT}aaaa1:failed`)
    setState(ed, 'Task', { agentState: 'queued' }) // "Back to the queue"
    expect(followLines).not.toHaveBeenCalled() // not inside the dispatch: the save is scheduled first
    await flush()
    expect(followLines).toHaveBeenLastCalledWith('n1', { changed: ['aaaa1'], appeared: [], gone: [] })
    expect(ed.commands.undo()).toBe(true)
    await flush()
    expect(followLines).toHaveBeenCalledTimes(2) // the line is failed again: the block must follow
    expect(save(ed.state.doc)).toBe(`- [ ] Task ${ROBOT}aaaa1:failed`)
    expect(ed.commands.redo()).toBe(true)
    await flush()
    expect(followLines).toHaveBeenCalledTimes(3)
    ed.destroy()
  })

  it('Discard + Ctrl+Z: the marker that comes back is reported as such', async () => {
    const { ed, followLines } = mount(`- [ ] Task ${ROBOT}aaaa1:running`)
    setState(ed, 'Task', { agentId: null, agentState: null })
    await flush()
    expect(followLines).toHaveBeenLastCalledWith('n1', { changed: [], appeared: [], gone: ['aaaa1'] })
    ed.commands.undo()
    await flush()
    expect(followLines).toHaveBeenLastCalledWith('n1', { changed: [], appeared: ['aaaa1'], gone: [] })
    ed.destroy()
  })

  it('content from disk (preventUpdate), typing and an editor of no note are not followed', async () => {
    const { ed, followLines } = mount(`- [ ] Task ${ROBOT}aaaa1:queued`)
    let pos = -1
    ed.state.doc.descendants((node, at) => { if (pos < 0 && node.type.name === 'taskItem') pos = at; return pos < 0 })
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...ed.state.doc.nodeAt(pos)!.attrs, agentState: 'running' }).setMeta('preventUpdate', true))
    ed.view.dispatch(ed.state.tr.insertText('x', pos + 6)) // "Task" → "Taskx"
    setAgentNoteId(ed, null)
    setState(ed, 'Task', { agentState: 'done' })
    await flush()
    expect(followLines).not.toHaveBeenCalled()
    ed.destroy()
    resetAgentTasksStoreForTests()
  })
})
