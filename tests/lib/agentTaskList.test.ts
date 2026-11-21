// @vitest-environment happy-dom
//
// The list the queue bar's counts open (src/lib/agentTaskList.ts): which tasks
// it shows, in which groups and order, what each row says on its right (the
// place in the queue, the percent) and under its text.

import { describe, expect, it } from 'vitest'
import {
  agentListStep,
  agentListTasksOfDoc,
  agentTaskListDetail,
  agentTaskListGroups,
  plainInlineMarkdown,
} from '../../src/lib/agentTaskList'
import { agentQueueCounts, agentTasksOfDoc, queuedAgentIds, type AgentDisplayOf } from '../../src/lib/agentSend'
import { load } from '../helpers/editorPipeline'

const ROBOT = '\u{1F916}'
const NOW = Date.parse('2026-11-20T12:00:00.000Z')

const asWritten: AgentDisplayOf = (_id, state) => state
const lostOne: AgentDisplayOf = (id, state) => (id === 'aaaa1' ? 'no-signal' : state)

const doc = load([
  `- [ ] Wire the **login** form ${ROBOT}aaaa1:running`,
  `  - [ ] A child ${ROBOT}bbbb2:queued`,
  '- [ ] Plain',
  `- [x] Ticked but queued ${ROBOT}cccc3:queued`,
  `- [ ] Asked something ${ROBOT}dddd4:waiting`,
  `- [ ] Broke ${ROBOT}eeee5:failed`,
  `- [x] Already done ${ROBOT}iiii9:done`,
  `- [ ] Look at it ${ROBOT}jjjj1:review`,
  `- [ ] Second running ${ROBOT}kkkk2:running`,
  '',
  '<!-- kanban -->',
  '- Todo',
  `  - [ ] Card with [a link](https://x.y) and \`code\` ${ROBOT}ffff6:queued`,
  '  - [ ] Plain card',
  '- Doing',
  `  - [ ] Other card ${ROBOT}gggg7:queued`,
  '<!-- /kanban -->',
  '',
  `- [ ] Last ${ROBOT}hhhh8:queued`,
].join('\n'))

describe('agentListTasksOfDoc', () => {
  it('lists the marked tasks with their first line as plain text and where they are', () => {
    const tasks = agentListTasksOfDoc(doc)
    expect(tasks.map((t) => `${t.kind}:${t.id}:${t.text}`)).toEqual([
      'item:aaaa1:Wire the login form', 'item:bbbb2:A child', 'item:cccc3:Ticked but queued', 'item:dddd4:Asked something',
      'item:eeee5:Broke', 'item:iiii9:Already done', 'item:jjjj1:Look at it', 'item:kkkk2:Second running',
      'card:ffff6:Card with a link and code', 'card:gggg7:Other card', 'item:hhhh8:Last',
    ])
    // The same tasks the bar counts, in the same order.
    expect(tasks.map((t) => t.id)).toEqual(agentTasksOfDoc(doc).map((t) => t.id))
    expect(doc.nodeAt(tasks[0].pos)?.type.name).toBe('taskItem')
    expect(tasks.find((t) => t.id === 'gggg7')).toMatchObject({ col: 1, idx: 0 })
    expect(doc.nodeAt(tasks.find((t) => t.id === 'gggg7')!.pos)?.attrs.board).toBeDefined()
  })
})

describe('agentTaskListGroups', () => {
  it('needs you first, then running, no signal, queued — then review, failed — never done nor a ticked queued task', () => {
    const groups = agentTaskListGroups(agentListTasksOfDoc(doc), asWritten)
    expect(groups.map((g) => `${g.key}:${g.rows.map((r) => r.task.id).join(',')}`)).toEqual([
      'waiting:dddd4', 'running:aaaa1,kkkk2', 'queued:bbbb2,ffff6,gggg7,hhhh8', 'review:jjjj1', 'failed:eeee5',
    ])
  })

  it('the queued rows carry their place in the order Copy prompt / Run hands them over', () => {
    const tasks = agentListTasksOfDoc(doc)
    const queued = agentTaskListGroups(tasks, asWritten).find((g) => g.key === 'queued')!
    expect(queued.rows.map((r) => r.queuePosition)).toEqual([1, 2, 3, 4])
    expect(queued.rows.map((r) => r.task.id)).toEqual(queuedAgentIds(agentTasksOfDoc(doc)))
    // Only queued rows have one.
    expect(agentTaskListGroups(tasks, asWritten).filter((g) => g.key !== 'queued').every((g) => g.rows.every((r) => r.queuePosition === null))).toBe(true)
  })

  it('a silent running task moves to "no signal" — the groups agree with the bar\'s counts', () => {
    const tasks = agentListTasksOfDoc(doc)
    const groups = agentTaskListGroups(tasks, lostOne)
    expect(groups.map((g) => g.key)).toEqual(['waiting', 'running', 'no-signal', 'queued', 'review', 'failed'])
    expect(groups.find((g) => g.key === 'no-signal')!.rows[0]).toMatchObject({ display: 'no-signal', task: { id: 'aaaa1' } })
    const counts = agentQueueCounts(agentTasksOfDoc(doc), lostOne)
    const size = (key: string) => groups.find((g) => g.key === key)?.rows.length ?? 0
    expect({ queued: size('queued'), running: size('running'), waiting: size('waiting'), noSignal: size('no-signal') }).toEqual(counts)
  })

  it('an id twice (a sync merge) keeps its first place in the queue', () => {
    const twice = load(`- [ ] A ${ROBOT}aaaa1:queued\n- [ ] B ${ROBOT}bbbb2:queued\n- [ ] A again ${ROBOT}aaaa1:queued`)
    const rows = agentTaskListGroups(agentListTasksOfDoc(twice), asWritten)[0].rows
    expect(rows.map((r) => r.queuePosition)).toEqual([1, 2, 1])
  })

  it('nothing marked: no groups', () => {
    expect(agentTaskListGroups(agentListTasksOfDoc(load('- [ ] nothing')), asWritten)).toEqual([])
  })
})

describe('agentTaskListDetail', () => {
  const started = new Date(NOW - 12 * 60_000).toISOString()
  it('running: the percent, what it is doing and how long it has been at it', () => {
    expect(agentTaskListDetail('running', { percent: '40 %', progress: ' Writing\n tests ', startedAt: started }, NOW))
      .toMatchObject({ percent: 40, doing: 'Writing tests', elapsedMs: 12 * 60_000 })
    expect(agentTaskListDetail('running', { percent: '140' }, NOW)).toMatchObject({ percent: null, doing: null, elapsedMs: null })
  })
  it('waiting: its question; no signal: how long since it was heard of; failed: why', () => {
    expect(agentTaskListDetail('waiting', { question: 'Which DB?', percent: '50' }, NOW)).toMatchObject({ question: 'Which DB?', percent: null })
    expect(agentTaskListDetail('no-signal', { lastSignal: new Date(NOW - 3 * 3600_000).toISOString() }, NOW).silentMs).toBe(3 * 3600_000)
    expect(agentTaskListDetail('failed', { failReason: 'No tests' }, NOW).failReason).toBe('No tests')
  })
  it('no block: nothing', () => {
    expect(agentTaskListDetail('running', undefined, NOW)).toEqual({
      percent: null, doing: null, elapsedMs: null, question: null, silentMs: null, failReason: null,
    })
  })
})

describe('plainInlineMarkdown', () => {
  it('drops the marks, keeps the words', () => {
    expect(plainInlineMarkdown('**Bold** and _it_ and ~~gone~~ and `x` and [t](u) and [[Note|alias]]')).toBe('Bold and it and gone and x and t and alias')
    expect(plainInlineMarkdown('snake_case_name stays')).toBe('snake_case_name stays')
  })
})

describe('agentListStep', () => {
  it('arrows wrap around, Home / End jump, other keys do nothing', () => {
    expect(agentListStep(-1, 3, 'ArrowDown')).toBe(0)
    expect(agentListStep(2, 3, 'ArrowDown')).toBe(0)
    expect(agentListStep(0, 3, 'ArrowUp')).toBe(2)
    expect(agentListStep(1, 3, 'Home')).toBe(0)
    expect(agentListStep(1, 3, 'End')).toBe(2)
    expect(agentListStep(1, 3, 'Enter')).toBeNull()
    expect(agentListStep(0, 0, 'ArrowDown')).toBeNull()
  })
})
