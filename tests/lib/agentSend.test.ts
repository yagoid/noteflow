// @vitest-environment happy-dom
//
// Sending agent tasks from the editor's document (src/lib/agentSend.ts): what
// the queue bar counts, and what a text selection hands to an agent — which
// tasks, and what of the rest goes along as context.

import { describe, expect, it } from 'vitest'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import {
  agentTasksOfDoc,
  openAgentTaskCount,
  openAgentTasksOfDoc,
  queueAgentTaskItems,
  queueOpenAgentTasks,
  queuedAgentIds,
  resolveAgentSelection,
  type AgentDisplayOf,
} from '../../src/lib/agentSend'
import { agentStateCounts } from '../../src/lib/agentTaskList'
import { load, save } from '../helpers/editorPipeline'

const ROBOT = '\u{1F916}'
const TICKS = '```'

/** No block is stale: every state shows as written. */
const asWritten: AgentDisplayOf = (_id, state) => state
/** Every running / waiting task lost its agent. */
const lost: AgentDisplayOf = (_id, state) => (state === 'running' || state === 'waiting' ? 'no-signal' : state)

/** Position of the first occurrence of `text` in the document's text (its first character). */
function at(doc: PMNode, text: string, occurrence = 0): number {
  let found = -1
  let seen = 0
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText || !node.text) return
    let i = node.text.indexOf(text)
    while (i >= 0) {
      if (seen++ === occurrence) { found = pos + i; return }
      i = node.text.indexOf(text, i + 1)
    }
  })
  if (found < 0) throw new Error(`"${text}" is not in the document`)
  return found
}

/** The selection from the start of `a` to the end of `b`. */
function select(doc: PMNode, a: string, b: string = a, displayOf: AgentDisplayOf = asWritten) {
  return resolveAgentSelection(doc, at(doc, a), at(doc, b) + b.length, displayOf)
}

/** The text of the task at `pos`. */
const textOf = (doc: PMNode, pos: number) => doc.nodeAt(pos)?.firstChild?.textContent

describe('agentTasksOfDoc / agentStateCounts / queuedAgentIds', () => {
  const doc = load([
    `- [ ] One ${ROBOT}aaaa1:running`,
    `  - [ ] Child ${ROBOT}bbbb2:queued`,
    '- [ ] Plain',
    `- [x] Ticked but queued ${ROBOT}cccc3:queued`,
    `- [ ] Asked ${ROBOT}dddd4:waiting`,
    `- [ ] Failed ${ROBOT}eeee5:failed`,
    '',
    '<!-- kanban -->',
    '- Todo',
    `  - [ ] Card ${ROBOT}ffff6:queued`,
    '  - [ ] Plain card',
    '- Done',
    `  - [x] Shipped ${ROBOT}gggg7:done`,
    '<!-- /kanban -->',
    '',
    `A paragraph that mentions ${ROBOT}hhhh8:queued is not a task.`,
  ].join('\n'))

  it('lists the marked task items and kanban cards, in document order', () => {
    expect(agentTasksOfDoc(doc).map((t) => `${t.kind}:${t.id}:${t.state}:${t.checked}`)).toEqual([
      'item:aaaa1:running:false', 'item:bbbb2:queued:false', 'item:cccc3:queued:true', 'item:dddd4:waiting:false',
      'item:eeee5:failed:false', 'card:ffff6:queued:false', 'card:gggg7:done:true',
    ])
    expect(agentTasksOfDoc(load('- [ ] nothing\n\ntext'))).toEqual([])
  })

  it('counts every state the list shows — never a queued task whose box is checked', () => {
    const counts = agentStateCounts(agentTasksOfDoc(doc), asWritten)
    expect(counts).toEqual({ waiting: 1, running: 1, 'no-signal': 0, queued: 2, review: 0, failed: 1, interrupted: 0, done: 1 })
  })

  it('a running / waiting task that went silent counts as "no signal"', () => {
    expect(agentStateCounts(agentTasksOfDoc(doc), lost)).toMatchObject({ queued: 2, running: 0, waiting: 0, 'no-signal': 2 })
  })

  it('what an agent left behind counts too; a done task unticked by hand (open again) and a settled failed one do not', () => {
    const counts = agentStateCounts(agentTasksOfDoc(load([
      `- [x] Done ${ROBOT}aaaa1:done`,
      `- [ ] Reopened ${ROBOT}bbbb2:done`,
      `- [ ] To check ${ROBOT}cccc3:review`,
      `- [x] Accepted ${ROBOT}dddd4:review`,
      `- [x] Failed, settled ${ROBOT}eeee5:failed`,
      `- [ ] Cut short ${ROBOT}ffff6:interrupted`,
    ].join('\n'))), asWritten)
    expect(counts).toEqual({ waiting: 0, running: 0, 'no-signal': 0, queued: 0, review: 1, failed: 0, interrupted: 1, done: 2 })
  })

  it('no task with a marker → all zeros', () => {
    const counts = agentStateCounts(agentTasksOfDoc(load('- [ ] Plain\n- [x] Ticked')), asWritten)
    expect(Object.values(counts).every((n) => n === 0)).toBe(true)
  })

  it('"copy prompt" of the bar takes the queued, unchecked tasks in document order (cards too)', () => {
    expect(queuedAgentIds(agentTasksOfDoc(doc))).toEqual(['bbbb2', 'ffff6'])
  })
})

describe('resolveAgentSelection', () => {
  it('a selection inside one task hands that whole task over, with no context', () => {
    const doc = load('- [ ] Fix the login redirect\n- [ ] Other')
    const sel = select(doc, 'login')
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Fix the login redirect'])
    expect(sel.tasks[0]).toMatchObject({ id: null, state: null })
    expect(sel.skipped).toBe(0)
    expect(sel.context).toBe('')
  })

  it('a selection that ends right where the next task starts does not touch it', () => {
    const doc = load('- [ ] First\n- [ ] Second')
    const sel = resolveAgentSelection(doc, at(doc, 'First'), at(doc, 'Second'), asWritten)
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['First'])
  })

  it('several tasks with text in between: the tasks in order, the text as context', () => {
    const doc = load([
      'Intro paragraph.',
      '',
      '- [ ] First task',
      '- [ ] Second task',
      '',
      'Some notes in the middle.',
      '',
      `${TICKS}ts`,
      'const a = `x`',
      TICKS,
      '',
      '- [ ] Third task',
      '',
      'Outro paragraph.',
    ].join('\n'))
    const sel = select(doc, 'First task', 'Third')
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['First task', 'Second task', 'Third task'])
    expect(sel.context).toBe(['Some notes in the middle.', '', `${TICKS}ts`, 'const a = `x`', TICKS].join('\n'))
    // Neither the tasks nor what was not selected is in the context.
    expect(sel.context).not.toContain('task')
    expect(sel.context).not.toContain('Intro')
    expect(sel.context).not.toContain('Outro')
  })

  it('the context is cut to the selection, mid-paragraph', () => {
    const doc = load('Read the spec first, then:\n\n- [ ] Build it')
    const sel = select(doc, 'spec first', 'Build')
    expect(sel.tasks).toHaveLength(1)
    expect(sel.context).toBe('spec first, then:')
  })

  it('a task with indented lines: they belong to it — not context, not tasks of their own', () => {
    const doc = load([
      '- [ ] Parent',
      '  - [ ] Sub one',
      '  - [ ] Sub two',
      '  - a detail',
      '- [ ] Sibling',
    ].join('\n'))
    const sel = select(doc, 'Parent', 'Sibling')
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Parent', 'Sibling'])
    expect(sel.context).toBe('')
  })

  it('nested tasks: only the child selected → the child is the task', () => {
    const doc = load('- [ ] Parent\n  - [ ] Sub one\n  - [ ] Sub two')
    const sel = select(doc, 'Sub one', 'Sub two')
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Sub one', 'Sub two'])
    expect(sel.context).toBe('')
  })

  it('a task under a plain bullet is found; the bullet text goes as context', () => {
    const doc = load('- Area\n  - [ ] Inside')
    const sel = select(doc, 'Area', 'Inside')
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Inside'])
    expect(sel.context).toBe('- Area')
  })

  it('a checked task is left out — the others still go', () => {
    const doc = load(`- [x] Already done\n- [ ] Still open\n- [x] Closed by an agent ${ROBOT}aaaa1:done`)
    const sel = select(doc, 'Already', 'Closed')
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Still open'])
    expect(sel.skipped).toBe(2)
    expect(sel.context).toBe('') // a left-out task is still a task: not context
  })

  it('a task in progress is not taken from its agent; one that lost it is', () => {
    const md = `- [ ] Working ${ROBOT}aaaa1:running\n- [ ] Asking ${ROBOT}bbbb2:waiting\n- [ ] Free`
    const doc = load(md)
    const busy = select(doc, 'Working', 'Free')
    expect(busy.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Free'])
    expect(busy.skipped).toBe(2)
    const stale = select(doc, 'Working', 'Free', lost)
    expect(stale.tasks.map((t) => [t.id, t.state])).toEqual([['aaaa1', 'running'], ['bbbb2', 'waiting'], [null, null]])
    expect(stale.skipped).toBe(0)
  })

  it('queued, failed, interrupted, to-review and reopened tasks go; a state this version does not know stays', () => {
    const doc = load([
      `- [ ] A ${ROBOT}aaaa1:queued`,
      `- [ ] B ${ROBOT}bbbb2:failed`,
      `- [ ] C ${ROBOT}cccc3:interrupted`,
      `- [ ] D ${ROBOT}dddd4:review`,
      `- [ ] E ${ROBOT}eeee5:done`,
      `- [ ] F ${ROBOT}ffff6:paused-by-app`,
    ].join('\n'))
    const sel = select(doc, 'A', 'F')
    expect(sel.tasks.map((t) => t.id)).toEqual(['aaaa1', 'bbbb2', 'cccc3', 'dddd4', 'eeee5'])
    expect(sel.skipped).toBe(1)
  })

  it('every touched task left out → no tasks, and the whole selection is the text', () => {
    const doc = load(`A note about it.\n\n- [x] Shipped ${ROBOT}aaaa1:done\n- [ ] Working ${ROBOT}bbbb2:running`)
    const sel = select(doc, 'A note', 'Working')
    expect(sel.tasks).toEqual([])
    expect(sel.skipped).toBe(2)
    // As text, without the agent markers.
    expect(sel.context).toBe('A note about it.\n\n- [x] Shipped\n- [ ] Working')
  })

  it('only a paragraph: no task, the selected text', () => {
    const doc = load('Just **some** prose here.\n\n- [ ] A task further down')
    const sel = select(doc, 'some', 'prose')
    expect(sel).toEqual({ tasks: [], skipped: 0, context: '**some** prose' })
  })

  it('a code block: no task, the code as a code block with its language', () => {
    const doc = load(`${TICKS}js\nconst a = 1\nconst b = 2\n${TICKS}\n\n- [ ] Task`)
    const sel = select(doc, 'const a', 'b = 2')
    expect(sel.tasks).toEqual([])
    expect(sel.context).toBe(`${TICKS}js\nconst a = 1\nconst b = 2\n${TICKS}`)
  })

  it('text under a task whose own line is not selected is sent as it is, without the task around it', () => {
    const doc = load('- [ ] Parent\n  - a detail\n  - another detail')
    const sel = select(doc, 'a detail', 'another')
    expect(sel.tasks).toEqual([])
    expect(sel.context).toBe('- a detail\n- another')
  })

  it('an empty task is never touched', () => {
    const doc = load('Before\n\n- [ ] \n- [ ] Real\n\nAfter')
    const sel = select(doc, 'Before', 'After')
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Real'])
    expect(sel.context).toContain('Before')
    expect(sel.context).toContain('After')
  })

  it('a kanban board inside the selection goes as context: its cards are not queued from here', () => {
    const doc = load([
      'Top',
      '',
      '<!-- kanban -->',
      '- Todo',
      `  - [ ] Card ${ROBOT}ffff6:queued`,
      '<!-- /kanban -->',
      '',
      '- [ ] Listed',
    ].join('\n'))
    const sel = select(doc, 'Top', 'Listed')
    expect(sel.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Listed'])
    expect(sel.context).toContain('Card')
    expect(sel.context).not.toContain(ROBOT)
  })

  it('a selection that cuts a table in half: no error, the selected cells as a (partial) table, the task after it found', () => {
    const doc = load('Intro text\n\n| Name | Role |\n| --- | --- |\n| Ana | Dev |\n| Luis | Ops |\n\n- [ ] Task after')
    // From a paragraph into the middle of the table.
    const into = select(doc, 'Intro', 'Ana')
    expect(into.tasks).toEqual([])
    expect(into.context).toBe('Intro text\n\n| Name | Role |\n| --- | --- |\n| Ana |')
    // From the middle of the header row out to the task below.
    const out = select(doc, 'Role', 'Task')
    expect(out.tasks.map((t) => textOf(doc, t.pos))).toEqual(['Task after'])
    expect(out.context).toBe('| Role |\n| --- |\n| Ana | Dev |\n| Luis | Ops |')
    // Inside the table only, from one body row into the next.
    const inside = select(doc, 'Dev', 'Luis')
    expect(inside.tasks).toEqual([])
    expect(inside.context).toContain('Dev')
    expect(inside.context).toContain('Luis')
    expect(inside.context).not.toContain('Ops')
    expect(inside.context).not.toContain('Name')
  })

  it('an empty selection is nothing', () => {
    const doc = load('- [ ] Task')
    expect(resolveAgentSelection(doc, 3, 3, asWritten)).toEqual({ tasks: [], skipped: 0, context: '' })
  })
})

describe('queueAgentTaskItems', () => {
  it('queues every task in ONE transaction: fresh ids for the unmarked, the others back to queued', () => {
    const doc = load(`- [ ] New one\n- [ ] Failed ${ROBOT}bbbb2:failed\n- [ ] Another new\n- [ ] Queued ${ROBOT}dddd4:queued`)
    const state = EditorState.create({ doc })
    const sel = select(doc, 'New one', 'Queued')
    const made = ['zzzz1', 'zzzz2']
    const seen: string[][] = []
    const tr = state.tr
    const ids = queueAgentTaskItems(tr, sel.tasks, (taken) => {
      seen.push([...taken])
      return made[taken.length]
    })
    expect(ids).toEqual(['zzzz1', 'bbbb2', 'zzzz2', 'dddd4'])
    // The second fresh id is asked for knowing the first.
    expect(seen).toEqual([[], ['zzzz1']])
    expect(save(tr.doc)).toBe([
      `- [ ] New one ${ROBOT}zzzz1:queued`,
      `- [ ] Failed ${ROBOT}bbbb2:queued`,
      `- [ ] Another new ${ROBOT}zzzz2:queued`,
      `- [ ] Queued ${ROBOT}dddd4:queued`,
    ].join('\n'))
    // Three items changed (the queued one was left alone), one undo step.
    expect(tr.steps).toHaveLength(3)
  })

  it('keeps the other attributes of the task', () => {
    const doc = load('- [ ] Dated 📅2026-12-01 🔺high')
    const tr = EditorState.create({ doc }).tr
    queueAgentTaskItems(tr, select(doc, 'Dated').tasks, () => 'zzzz1')
    expect(save(tr.doc)).toBe(`- [ ] Dated 📅2026-12-01 🔺high ${ROBOT}zzzz1:queued`)
  })
})

describe('openAgentTasksOfDoc / queueOpenAgentTasks ("queue all" of the queue bar)', () => {
  /** What each found task is: an item's text, or a board's card texts. */
  const describeOpen = (doc: PMNode) => openAgentTasksOfDoc(doc).map((t) => (t.kind === 'item'
    ? textOf(doc, t.pos)
    : `board:${t.cards.map((ref) => `${ref.col}.${ref.idx}`).join(',')}`))

  it('only open tasks: no marker, unchecked, with text — a task with any state is left as it is', () => {
    const doc = load([
      '- [ ] Open one',
      `- [ ] Queued ${ROBOT}aaaa1:queued`,
      `- [ ] Failed ${ROBOT}bbbb2:failed`,
      `- [ ] Review ${ROBOT}cccc3:review`,
      `- [ ] Reopened ${ROBOT}dddd4:done`,
      '- [x] Done by hand',
      '- [ ] ',
      '- [ ] Open two',
    ].join('\n'))
    expect(describeOpen(doc)).toEqual(['Open one', 'Open two'])
    expect(openAgentTaskCount(openAgentTasksOfDoc(doc))).toBe(2)
  })

  it('only the outermost: subtasks go with an open parent, and with a parent that already has a marker', () => {
    const doc = load([
      '- [ ] Parent',
      '  - [ ] Sub of an open parent',
      `- [ ] Queued parent ${ROBOT}aaaa1:queued`,
      '  - [ ] Sub of a queued parent',
      `- [ ] Failed parent ${ROBOT}bbbb2:failed`,
      '  - [ ] Sub of a failed parent',
    ].join('\n'))
    expect(describeOpen(doc)).toEqual(['Parent'])
  })

  it('under a checked (done) or empty task, an open subtask counts on its own', () => {
    const doc = load([
      '- [x] Done parent',
      '  - [ ] Left over',
      '  - [x] Closed too',
      `- [x] Done by an agent ${ROBOT}aaaa1:done`,
      '  - [ ] Left over by it',
      '- [ ] ',
      '  - [ ] Under an empty one',
      '- Area',
      '  - [ ] Under a bullet',
    ].join('\n'))
    expect(describeOpen(doc)).toEqual(['Left over', 'Left over by it', 'Under an empty one', 'Under a bullet'])
  })

  it('kanban cards: the open ones of each board (no marker, unchecked, with text)', () => {
    const doc = load([
      '<!-- kanban -->',
      '- Todo',
      '  - [ ] Card open',
      `  - [ ] Card queued ${ROBOT}ffff6:queued`,
      '- Done',
      '  - [x] Card done',
      '  - [ ] Card open too',
      '<!-- /kanban -->',
      '',
      '<!-- kanban -->',
      '- Only',
      '  - [x] Nothing open',
      '<!-- /kanban -->',
    ].join('\n'))
    expect(describeOpen(doc)).toEqual(['board:0.0,1.1'])
    expect(openAgentTaskCount(openAgentTasksOfDoc(doc))).toBe(2)
  })

  it('nothing open → nothing', () => {
    expect(openAgentTasksOfDoc(load(`- [ ] Queued ${ROBOT}aaaa1:queued\n- [x] Done\n\ntext`))).toEqual([])
  })

  it('queues them all in ONE transaction, each with a different fresh id, items and cards alike', () => {
    const doc = load([
      `- [ ] Queued ${ROBOT}aaaa1:queued`,
      '- [ ] First',
      '  - [ ] Its sub',
      '',
      '<!-- kanban -->',
      '- Todo',
      '  - [ ] Card A',
      '  - [ ] Card B',
      '<!-- /kanban -->',
      '',
      '- [ ] Last 📅2026-12-01',
    ].join('\n'))
    const tr = EditorState.create({ doc }).tr
    const seen: string[][] = []
    const ids = queueOpenAgentTasks(tr, openAgentTasksOfDoc(doc), (taken) => {
      seen.push([...taken])
      return `zzzz${taken.length + 1}`
    })
    expect(ids).toEqual(['zzzz1', 'zzzz2', 'zzzz3', 'zzzz4'])
    // Every fresh id is asked for knowing the ones before it.
    expect(seen).toEqual([[], ['zzzz1'], ['zzzz1', 'zzzz2'], ['zzzz1', 'zzzz2', 'zzzz3']])
    expect(save(tr.doc)).toBe([
      `- [ ] Queued ${ROBOT}aaaa1:queued`,
      `- [ ] First ${ROBOT}zzzz1:queued`,
      '  - [ ] Its sub',
      '',
      '<!-- kanban -->',
      '- Todo',
      `  - [ ] Card A ${ROBOT}zzzz2:queued`,
      `  - [ ] Card B ${ROBOT}zzzz3:queued`,
      '<!-- /kanban -->',
      '',
      `- [ ] Last 📅2026-12-01 ${ROBOT}zzzz4:queued`,
    ].join('\n'))
    // Two items and one board: three steps, one transaction (one undo).
    expect(tr.steps).toHaveLength(3)
    // Nothing left to queue afterwards.
    expect(openAgentTasksOfDoc(tr.doc)).toEqual([])
  })
})
