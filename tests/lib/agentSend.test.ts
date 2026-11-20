// @vitest-environment happy-dom
//
// Sending agent tasks from the editor's document (src/lib/agentSend.ts): what
// the queue bar counts, and what a text selection hands to an agent — which
// tasks, and what of the rest goes along as context.

import { describe, expect, it } from 'vitest'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import {
  agentQueueCounts,
  agentQueueTotal,
  agentTasksOfDoc,
  queueAgentTaskItems,
  queuedAgentIds,
  resolveAgentSelection,
  type AgentDisplayOf,
} from '../../src/lib/agentSend'
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

describe('agentTasksOfDoc / agentQueueCounts / queuedAgentIds', () => {
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

  it('counts what is queued or with an agent — never a queued task whose box is checked, nor a finished one', () => {
    const counts = agentQueueCounts(agentTasksOfDoc(doc), asWritten)
    expect(counts).toEqual({ queued: 2, running: 1, waiting: 1, noSignal: 0 })
    expect(agentQueueTotal(counts)).toBe(4)
  })

  it('a running / waiting task that went silent counts as "no signal"', () => {
    expect(agentQueueCounts(agentTasksOfDoc(doc), lost)).toEqual({ queued: 2, running: 0, waiting: 0, noSignal: 2 })
  })

  it('nothing active → all zeros', () => {
    const counts = agentQueueCounts(agentTasksOfDoc(load(`- [x] Done ${ROBOT}aaaa1:done\n- [ ] Failed ${ROBOT}bbbb2:failed`)), asWritten)
    expect(agentQueueTotal(counts)).toBe(0)
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
