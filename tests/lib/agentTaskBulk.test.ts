// @vitest-environment happy-dom
//
// The two group actions of the queue bar's list (src/lib/agentTaskBulk.ts) on
// the editor's REAL schema and markdown pipeline: "Clear done" (deletes the
// lines of the done tasks — only those, keeping one with open work under it —
// and the cards of the done group) and "Mark all as done" (what the report's
// "Mark as done" does, for every task to review), each in ONE transaction.

import { describe, expect, it } from 'vitest'
import { EditorState } from '@tiptap/pm/state'
import { history, undo } from '@tiptap/pm/history'
import {
  agentDoneClearPlan,
  agentReviewDonePlan,
  applyAgentClear,
  applyAgentMarkDone,
} from '../../src/lib/agentTaskBulk'
import { agentTaskListGroups, agentListTasksOfDoc } from '../../src/lib/agentTaskList'
import { agentCheckByLine } from '../../src/lib/agentTaskUi'
import type { AgentDisplayOf } from '../../src/lib/agentSend'
import { load, save } from '../helpers/editorPipeline'

const ROBOT = '\u{1F916}'
const asWritten: AgentDisplayOf = (_id, state) => state

function lines(md: string): string[] {
  return md.split(/\r?\n/).filter((l) => l.trim() !== '')
}

function clear(md: string) {
  const doc = load(md)
  const plan = agentDoneClearPlan(doc, asWritten)
  const tr = EditorState.create({ doc }).tr
  applyAgentClear(tr, plan)
  const out = save(tr.doc)
  // What is saved loads back to the same document.
  expect(load(out).toJSON()).toEqual(tr.doc.toJSON())
  return { plan, out, tr }
}

function markDone(md: string, sort = false) {
  const doc = load(md)
  const plan = agentReviewDonePlan(doc, asWritten)
  const tr = EditorState.create({ doc }).tr
  const result = applyAgentMarkDone(tr, plan, sort, agentCheckByLine)
  return { plan, result, out: save(tr.doc), tr }
}

describe('agentDoneClearPlan / applyAgentClear', () => {
  const md = [
    `- [ ] Running ${ROBOT}aaaa1:running`,
    `- [x] Finished ${ROBOT}bbbb2:done`,
    `- [ ] To review ${ROBOT}cccc3:review`,
    `- [x] Accepted review ${ROBOT}dddd4:review`,
    `- [ ] Reopened ${ROBOT}eeee5:done`,
    `- [x] Settled failure ${ROBOT}ffff6:failed`,
    '- [x] Plain ticked',
    `- [ ] Queued ${ROBOT}gggg7:queued`,
  ].join('\n')

  it('deletes exactly the rows of "Done" — done ticked and accepted reviews — and nothing else', () => {
    const { plan, out } = clear(md)
    expect(plan.count).toBe(2)
    expect(plan.kept).toBe(0)
    expect(plan.ids.sort()).toEqual(['bbbb2', 'dddd4'])
    expect(lines(out)).toEqual([
      `- [ ] Running ${ROBOT}aaaa1:running`,
      `- [ ] To review ${ROBOT}cccc3:review`,
      `- [ ] Reopened ${ROBOT}eeee5:done`,
      `- [x] Settled failure ${ROBOT}ffff6:failed`,
      '- [x] Plain ticked',
      `- [ ] Queued ${ROBOT}gggg7:queued`,
    ])
  })

  it('counts the same rows the list shows under "Done"', () => {
    const doc = load(md)
    const done = agentTaskListGroups(agentListTasksOfDoc(doc), asWritten).find((g) => g.key === 'done')
    expect(agentDoneClearPlan(doc, asWritten).count).toBe(done?.rows.length)
  })

  it('a done task goes with its finished subtree; its done subtask counts and its marked subtasks lose their report', () => {
    const { plan, out } = clear([
      `- [x] Parent ${ROBOT}pppp1:done`,
      `  - [x] Done child ${ROBOT}pppp2:done`,
      `  - [x] Ticked queued child ${ROBOT}pppp3:queued`,
      '  - [x] Plain ticked child',
      '  - a note under it',
      '- [ ] Stays',
    ].join('\n'))
    expect(plan.count).toBe(2)
    expect(plan.items).toHaveLength(1)
    expect(plan.ids.sort()).toEqual(['pppp1', 'pppp2', 'pppp3'])
    expect(lines(out)).toEqual(['- [ ] Stays'])
  })

  it('a done task with open work under it stays (kept); a finished done subtask of it still goes', () => {
    const { plan, out } = clear([
      `- [x] Parent ${ROBOT}qqqq1:done`,
      '  - [ ] Open child',
      `  - [x] Done child ${ROBOT}qqqq2:done`,
      `- [x] Other parent ${ROBOT}qqqq3:done`,
      `  - [x] Running child ${ROBOT}qqqq4:running`,
    ].join('\n'))
    expect(plan.kept).toBe(2)
    expect(plan.count).toBe(1)
    expect(plan.ids).toEqual(['qqqq2'])
    expect(lines(out)).toEqual([
      `- [x] Parent ${ROBOT}qqqq1:done`,
      '  - [ ] Open child',
      `- [x] Other parent ${ROBOT}qqqq3:done`,
      `  - [x] Running child ${ROBOT}qqqq4:running`,
    ])
  })

  it('a list left without items goes too; a section of only done tasks is left empty but valid', () => {
    const { out, tr } = clear([
      'Intro',
      '',
      `- [x] One ${ROBOT}rrrr1:done`,
      `- [x] Two ${ROBOT}rrrr2:done`,
      '',
      'Outro',
    ].join('\n'))
    expect(lines(out)).toEqual(['Intro', 'Outro'])
    expect(() => tr.doc.check()).not.toThrow()

    const only = clear(`- [x] Only ${ROBOT}ssss1:done`)
    expect(only.out.trim()).toBe('')
    expect(() => only.tr.doc.check()).not.toThrow()
  })

  it('removes the done cards of a kanban board, not the others', () => {
    const { plan, out } = clear([
      '<!-- kanban done="Done" -->',
      '- Todo',
      `  - [ ] Review card ${ROBOT}kkkk1:review`,
      '- Done',
      `  - [x] Done card ${ROBOT}kkkk2:done`,
      '  - [x] Plain done card',
      `  - [x] Accepted card ${ROBOT}kkkk3:review`,
      '<!-- /kanban -->',
    ].join('\n'))
    expect(plan.count).toBe(2)
    expect(plan.ids.sort()).toEqual(['kkkk2', 'kkkk3'])
    expect(out).toContain('Review card')
    expect(out).toContain('Plain done card')
    expect(out).not.toContain('kkkk2')
    expect(out).not.toContain('kkkk3')
  })

  it('is one transaction: one undo brings every line back', () => {
    const doc = load([`- [x] A ${ROBOT}uuuu1:done`, '- [ ] keep', `- [x] B ${ROBOT}uuuu2:done`].join('\n'))
    let state = EditorState.create({ doc, plugins: [history()] })
    const tr = state.tr
    applyAgentClear(tr, agentDoneClearPlan(doc, asWritten))
    state = state.apply(tr)
    expect(lines(save(state.doc))).toEqual(['- [ ] keep'])
    undo(state, (t) => { state = state.apply(t) })
    expect(state.doc.toJSON()).toEqual(doc.toJSON())
  })
})

describe('agentReviewDonePlan / applyAgentMarkDone', () => {
  it('sets every task to review to done and ticks it, like "Mark as done"; nothing else changes', () => {
    const { plan, result, out } = markDone([
      `- [ ] One ${ROBOT}mmmm1:review`,
      `- [ ] Running ${ROBOT}mmmm2:running`,
      `- [ ] Two ${ROBOT}mmmm3:review`,
      `- [x] Accepted ${ROBOT}mmmm4:review`,
    ].join('\n'))
    expect(plan.count).toBe(2)
    expect(result.done.sort()).toEqual(['mmmm1', 'mmmm3'])
    expect(lines(out)).toEqual([
      `- [x] One ${ROBOT}mmmm1:done`,
      `- [ ] Running ${ROBOT}mmmm2:running`,
      `- [x] Two ${ROBOT}mmmm3:done`,
      `- [x] Accepted ${ROBOT}mmmm4:review`,
    ])
  })

  it('then they are in "Done"', () => {
    const { tr } = markDone([`- [ ] One ${ROBOT}mmmm1:review`, `- [ ] Two ${ROBOT}mmmm3:review`].join('\n'))
    const groups = agentTaskListGroups(agentListTasksOfDoc(tr.doc), asWritten)
    expect(groups.map((g) => `${g.key}:${g.rows.length}`)).toEqual(['done:2'])
  })

  it('with "move checked to the bottom" they move, in their order, in the same transaction', () => {
    const { out } = markDone([
      `- [ ] One ${ROBOT}nnnn1:review`,
      '- [ ] Open',
      `- [ ] Two ${ROBOT}nnnn2:review`,
      '- [ ] Open 2',
      '- [x] Old done',
    ].join('\n'), true)
    expect(lines(out)).toEqual([
      '- [ ] Open',
      '- [ ] Open 2',
      '- [x] Old done',
      `- [x] One ${ROBOT}nnnn1:done`,
      `- [x] Two ${ROBOT}nnnn2:done`,
    ])
  })

  it('subtasks follow the rule of a ticked box: a queued one leaves the queue, a review one closed by its parent is reported once', () => {
    const { result, out } = markDone([
      `- [ ] Parent ${ROBOT}oooo1:review`,
      `  - [ ] Queued child ${ROBOT}oooo2:queued`,
      `  - [ ] Review child ${ROBOT}oooo3:review`,
    ].join('\n'), true)
    expect(result.done.sort()).toEqual(['oooo1', 'oooo3'])
    expect(result.unqueued).toEqual(['oooo2'])
    expect(lines(out)).toEqual([
      `- [x] Parent ${ROBOT}oooo1:done`,
      '  - [x] Queued child',
      `  - [x] Review child ${ROBOT}oooo3:done`,
    ])
  })

  it('kanban cards to review are set done and ticked (to the done column)', () => {
    const { result, out } = markDone([
      '<!-- kanban done="Done" -->',
      '- Todo',
      `  - [ ] Card A ${ROBOT}cccc1:review`,
      `  - [ ] Card B ${ROBOT}cccc2:review`,
      '  - [ ] Plain',
      '- Done',
      '<!-- /kanban -->',
    ].join('\n'))
    expect(result.done.sort()).toEqual(['cccc1', 'cccc2'])
    const done = out.slice(out.indexOf('- Done'))
    expect(done).toContain(`[x] Card A ${ROBOT}cccc1:done`)
    expect(done).toContain(`[x] Card B ${ROBOT}cccc2:done`)
    expect(out.slice(0, out.indexOf('- Done'))).toContain('Plain')
  })
})
