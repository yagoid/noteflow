// Agent tasks — the decisions of the interface (src/lib/agentTaskUi.ts): what
// the chip does on click, which actions the report menu offers per state, the
// facts it lists, and what the discard-by-age may really remove.
import { describe, it, expect } from 'vitest'
import {
  agentBoxGlyph,
  agentCanSend,
  agentChipAction,
  agentDismissNeedsConfirm,
  agentFacts,
  agentFactsEmpty,
  agentFootLayout,
  agentIsLive,
  agentLineStates,
  agentMaintenanceDue,
  agentPercent,
  agentPrimaryAction,
  agentReportActions,
  agentStateTone,
  agentThread,
  confirmedAgentDiscards,
  formatAgentDuration,
  hasLiveAgentBlocks,
  noteHasAgentMarkers,
  resolveAgentDisplayState,
  withoutAgentMarkers,
} from '../../src/lib/agentTaskUi'
import { AGENT_TASK_STATES } from '../../src/lib/agentTasks'

const ROBOT = '\u{1F916}'
const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const MIN = 60_000
const ALL_STATES = [...AGENT_TASK_STATES, 'no-signal', 'paused-by-app']

describe('agentStateTone', () => {
  it('is the state itself when known, no-signal for the derived one, unknown otherwise', () => {
    for (const state of AGENT_TASK_STATES) expect(agentStateTone(state)).toBe(state)
    expect(agentStateTone('no-signal')).toBe('no-signal')
    expect(agentStateTone('paused-by-app')).toBe('unknown')
    expect(agentStateTone('')).toBe('unknown')
  })
})

describe('agentChipAction', () => {
  it('no marker hands the task over; queued takes it back; anything else opens the report', () => {
    expect(agentChipAction(null, null)).toBe('queue')
    expect(agentChipAction(undefined, undefined)).toBe('queue')
    expect(agentChipAction('aaaa1', null)).toBe('queue') // half a marker is no marker
    expect(agentChipAction('aaaa1', 'queued')).toBe('unqueue')
    for (const state of ['running', 'waiting', 'review', 'done', 'failed', 'interrupted', 'paused-by-app']) {
      expect(agentChipAction('aaaa1', state)).toBe('report')
    }
  })
})

describe('agentReportActions', () => {
  const editable = { checked: false, editable: true }

  it('offers "back to the queue" only where the agent is through or lost', () => {
    const ticked = { checked: true, editable: true }
    const requeue = ALL_STATES.filter((s) => agentReportActions(s, ticked).includes('requeue'))
    expect(requeue.sort()).toEqual(['failed', 'interrupted', 'no-signal', 'review'])
  })

  it('a done task whose box was unticked by hand is open again: it can go back to the queue', () => {
    expect(agentReportActions('done', { checked: false, editable: true })).toEqual(['markDone', 'requeue', 'copyPrompt', 'run', 'dismiss', 'copyId'])
    // Ticked, its box opens the report instead of toggling: the report unticks it.
    expect(agentReportActions('done', { checked: true, editable: true })).toEqual(['reopen', 'dismiss', 'copyId'])
    // Unticking does not make any other state requeue-able.
    for (const state of ['running', 'waiting', 'queued', 'paused-by-app']) {
      expect(agentReportActions(state, { checked: false, editable: true })).not.toContain('requeue')
    }
  })

  it('offers "mark as done" until the task is done and ticked', () => {
    for (const state of ALL_STATES) {
      if (state !== 'done') expect(agentReportActions(state, { checked: true, editable: true })).toContain('markDone')
    }
    expect(agentReportActions('done', { checked: false, editable: true })).toContain('markDone')
    expect(agentReportActions('done', { checked: true, editable: true })).not.toContain('markDone')
  })

  it('always offers discard and copy id, in that order, last', () => {
    for (const state of ALL_STATES) {
      expect(agentReportActions(state, editable).slice(-2)).toEqual(['dismiss', 'copyId'])
    }
    expect(agentReportActions('review', editable)).toEqual(['markDone', 'requeue', 'copyPrompt', 'run', 'dismiss', 'copyId'])
    expect(agentReportActions('running', editable)).toEqual(['markDone', 'dismiss', 'copyId'])
  })

  it('offers "copy prompt" exactly where the task can be sent to an agent', () => {
    const offered = ALL_STATES.filter((s) => agentReportActions(s, editable).includes('copyPrompt'))
    expect(offered.sort()).toEqual(['done', 'failed', 'interrupted', 'no-signal', 'queued', 'review'])
    // Never for a task whose box is checked, whatever its state.
    for (const state of ALL_STATES) {
      expect(agentReportActions(state, { checked: true, editable: true })).not.toContain('copyPrompt')
    }
  })

  it('a read-only note only gets what changes nothing', () => {
    for (const state of ALL_STATES) {
      expect(agentReportActions(state, { checked: false, editable: false })).toEqual(['copyId'])
    }
  })

  it('stresses the action the state is waiting for', () => {
    const primary = (state: string) => agentPrimaryAction(state, agentReportActions(state, editable))
    expect(primary('review')).toBe('markDone')
    expect(primary('failed')).toBe('requeue')
    expect(primary('interrupted')).toBe('requeue')
    expect(primary('no-signal')).toBe('requeue')
    expect(primary('running')).toBeNull()
    expect(primary('waiting')).toBeNull()
    expect(primary('done')).toBeNull()
    expect(agentPrimaryAction('review', ['copyId'])).toBeNull() // read-only: nothing to stress
  })
})

describe('agentBoxGlyph (the states drawn in the task’s own box)', () => {
  it('running while unticked, done while ticked — nothing else', () => {
    expect(agentBoxGlyph('running', false)).toBe('running')
    expect(agentBoxGlyph('done', true)).toBe('done')
    expect(agentBoxGlyph('running', true)).toBeNull() // odd: the plain box and the text chip
    expect(agentBoxGlyph('done', false)).toBeNull() // reopened by hand
    for (const tone of ['queued', 'waiting', 'review', 'failed', 'interrupted', 'no-signal', 'unknown'] as const) {
      expect(agentBoxGlyph(tone, false)).toBeNull()
      expect(agentBoxGlyph(tone, true)).toBeNull()
    }
    expect(agentBoxGlyph(null, false)).toBeNull()
  })

  it('only a ticked done task offers "reopen"', () => {
    const offered = ALL_STATES.flatMap((s) => [false, true].map((checked) => [s, checked] as const))
      .filter(([s, checked]) => agentReportActions(s, { checked, editable: true }).includes('reopen'))
    expect(offered).toEqual([['done', true]])
  })
})

describe('agentFootLayout (the report’s foot)', () => {
  const layout = (state: string, checked = false, drop: string[] = []) =>
    agentFootLayout(state, agentReportActions(state, { checked, editable: true }).filter((a) => !drop.includes(a)))

  it('copy id and discard are the quiet icons on the left', () => {
    expect(layout('review').quiet).toEqual(['copyId', 'dismiss'])
  })

  it('the action the state waits for is the main button; the next one that matters is the secondary; the rest fold into icons', () => {
    expect(layout('review')).toMatchObject({ main: 'markDone', secondary: 'requeue', icons: ['copyPrompt', 'run'] })
    expect(layout('failed')).toMatchObject({ main: 'requeue', secondary: 'run', icons: ['markDone', 'copyPrompt'] })
    expect(layout('failed', false, ['run'])).toMatchObject({ main: 'requeue', secondary: 'copyPrompt', icons: ['markDone'] })
  })

  it('with nothing to wait for, "Run" is the main button when offered', () => {
    expect(layout('done')).toMatchObject({ main: 'run', secondary: 'requeue', icons: ['markDone', 'copyPrompt'] })
    expect(layout('running')).toMatchObject({ main: null, secondary: 'markDone', icons: [] })
    expect(layout('done', true)).toMatchObject({ main: null, secondary: 'reopen', icons: [] })
  })

  it('read-only: only the id', () => {
    expect(agentFootLayout('review', ['copyId'])).toEqual({ quiet: ['copyId'], main: null, secondary: null, icons: [] })
  })
})

describe('"Open in Claude" (the agent’s Claude Desktop session, on this machine)', () => {
  const actions = (state: string, checked = false, editable = true, session = true) => agentReportActions(state, { checked, editable, session })
  const layout = (state: string, checked = false, session = true) => agentFootLayout(state, actions(state, checked, true, session))

  it('is offered in every state but queued — only when the caller has a session here', () => {
    const offered = ALL_STATES.filter((s) => actions(s).includes('openSession'))
    expect(offered.sort()).toEqual(ALL_STATES.filter((s) => s !== 'queued').sort())
    expect(actions('done', true)).toContain('openSession') // done and ticked: to read the conversation again
    for (const state of ALL_STATES) {
      expect(agentReportActions(state, { checked: false, editable: true })).not.toContain('openSession')
      expect(actions(state, false, true, false)).not.toContain('openSession')
    }
    // Before discard and copy id, which stay last.
    expect(actions('review')).toEqual(['markDone', 'requeue', 'copyPrompt', 'run', 'openSession', 'dismiss', 'copyId'])
  })

  it('read-only too: it changes nothing in the note', () => {
    expect(actions('waiting', false, false)).toEqual(['openSession', 'copyId'])
    expect(actions('queued', false, false)).toEqual(['copyId'])
    expect(agentFootLayout('waiting', actions('waiting', false, false))).toEqual({ quiet: ['copyId'], main: 'openSession', secondary: null, icons: [] })
  })

  it('is the main button while an agent has the task: running, waiting (its question is answered there), no signal', () => {
    expect(layout('running')).toMatchObject({ main: 'openSession', secondary: 'markDone', icons: [] })
    expect(layout('waiting')).toMatchObject({ main: 'openSession', secondary: 'markDone', icons: [] })
    expect(layout('no-signal')).toMatchObject({ main: 'openSession', secondary: 'requeue', icons: ['markDone', 'copyPrompt', 'run'] })
    expect(agentPrimaryAction('running', actions('running'))).toBe('openSession')
    // Without a session here: as before.
    expect(layout('no-signal', false, false)).toMatchObject({ main: 'requeue', secondary: 'run' })
    expect(layout('running', false, false)).toMatchObject({ main: null, secondary: 'markDone' })
  })

  it('is the secondary button once the agent is through: what to read before deciding', () => {
    expect(layout('review')).toMatchObject({ main: 'markDone', secondary: 'openSession', icons: ['requeue', 'copyPrompt', 'run'] })
    expect(layout('failed')).toMatchObject({ main: 'requeue', secondary: 'openSession', icons: ['markDone', 'copyPrompt', 'run'] })
    expect(layout('interrupted')).toMatchObject({ main: 'requeue', secondary: 'openSession' })
    expect(layout('done')).toMatchObject({ main: 'run', secondary: 'openSession', icons: ['markDone', 'requeue', 'copyPrompt'] })
    expect(layout('done', true)).toMatchObject({ main: null, secondary: 'openSession', icons: ['reopen'] })
  })
})

describe('agentThread (the report’s timeline)', () => {
  const started = '2026-11-20T10:00:00.000Z'
  const finished = '2026-11-20T11:30:00.000Z'
  const thread = (meta: Record<string, string>, state: string) => agentThread(meta, state, agentFacts(meta, state, NOW))
  const kinds = (t: ReturnType<typeof thread>) => t.events.map((e) => `${e.kind}${e.now ? '*' : ''}`)

  it('running: started, then what it is doing now', () => {
    const t = thread({ startedAt: started, progress: ' Writing the tests ', gitBranch: 'fix/x' }, 'running')
    expect(kinds(t)).toEqual(['started', 'progress*'])
    expect(t.events[0].at).toBe(Date.parse(started))
    expect(t.events[1]).toMatchObject({ at: null, text: 'Writing the tests' }) // no hour is made up
    expect(t.leftover.branch).toBeNull() // shown with the start
  })

  it('running with nothing to say yet: the start is now', () => {
    expect(kinds(thread({ startedAt: started }, 'running'))).toEqual(['started*'])
  })

  it('waiting: the question is now, even when it did not reach the report', () => {
    expect(kinds(thread({ startedAt: started, question: 'Which branch?' }, 'waiting'))).toEqual(['started', 'question*'])
    expect(thread({}, 'waiting').events).toEqual([{ kind: 'question', at: null, text: null, now: true }])
  })

  it('failed: why, at the time it finished', () => {
    const t = thread({ startedAt: started, finishedAt: finished, failReason: 'Tests red' }, 'failed')
    expect(kinds(t)).toEqual(['started', 'failed*'])
    expect(t.events[1]).toMatchObject({ at: Date.parse(finished), text: 'Tests red' })
  })

  it('done / review: finished carries the commits and files; without a start the branch goes to the strip', () => {
    const t = thread({ finishedAt: finished, gitBranch: 'fix/x', gitCommits: '2', gitFilesChanged: '5' }, 'review')
    expect(kinds(t)).toEqual(['finished*'])
    expect(t.leftover).toEqual({ branch: 'fix/x', commits: null, filesChanged: null })
  })

  it('a done task without a finish time: the start is not "now", and the counts go to the strip', () => {
    const t = thread({ startedAt: started, gitCommits: '1' }, 'done')
    expect(kinds(t)).toEqual(['started'])
    expect(t.leftover.commits).toBe(1)
  })

  it('no signal and interrupted say so; progress is only news while the agent is live', () => {
    expect(kinds(thread({ startedAt: started, progress: 'old' }, 'no-signal'))).toEqual(['started', 'noSignal*'])
    expect(kinds(thread({ progress: 'old' }, 'interrupted'))).toEqual(['interrupted*'])
    expect(thread({}, 'paused-by-app').events).toEqual([])
  })
})

describe('agentCanSend (one rule for the queue bar, the selection and the report menu)', () => {
  it('a task without a marker can be sent, unless its box is checked', () => {
    expect(agentCanSend(null, false)).toBe(true)
    expect(agentCanSend(undefined, false)).toBe(true)
    expect(agentCanSend(null, true)).toBe(false)
  })

  it('by state: queued, failed, interrupted, to review, no signal and a reopened done — never in progress nor unknown', () => {
    expect(ALL_STATES.filter((s) => agentCanSend(s, false)).sort()).toEqual(['done', 'failed', 'interrupted', 'no-signal', 'queued', 'review'])
    expect(ALL_STATES.filter((s) => agentCanSend(s, true))).toEqual([])
  })
})

describe('resolveAgentDisplayState', () => {
  const known = { hasBlock: true, lastSignal: new Date(NOW - MIN).toISOString(), settled: true, staleMinutes: 90, nowMs: NOW }

  it('a state that is not running / waiting shows as written, whatever the block says', () => {
    for (const state of ['queued', 'review', 'done', 'failed', 'interrupted', 'paused-by-app']) {
      expect(resolveAgentDisplayState(state, { ...known, hasBlock: false, lastSignal: null })).toBe(state)
    }
  })

  it('running / waiting with a recent signal stay; silent for too long they show as no signal', () => {
    expect(resolveAgentDisplayState('running', known)).toBe('running')
    expect(resolveAgentDisplayState('waiting', known)).toBe('waiting')
    const stale = { ...known, lastSignal: new Date(NOW - 91 * MIN).toISOString() }
    expect(resolveAgentDisplayState('running', stale)).toBe('no-signal')
    expect(resolveAgentDisplayState('waiting', { ...known, lastSignal: null })).toBe('no-signal')
  })

  it('without a block: as written until the reports have loaded, no signal after', () => {
    expect(resolveAgentDisplayState('running', { ...known, hasBlock: false, settled: false })).toBe('running')
    expect(resolveAgentDisplayState('running', { ...known, hasBlock: false, settled: true })).toBe('no-signal')
  })
})

describe('agentDismissNeedsConfirm', () => {
  it('asks while an agent may still be on the task, or the state is not one we know', () => {
    const asks = ALL_STATES.filter(agentDismissNeedsConfirm)
    expect(asks.sort()).toEqual(['no-signal', 'paused-by-app', 'running', 'waiting'])
  })

  it('agentIsLive is running / waiting only (no signal is not "at work")', () => {
    expect(ALL_STATES.filter(agentIsLive).sort()).toEqual(['running', 'waiting'])
  })
})

describe('agentFacts', () => {
  const meta = {
    machine: ' laptop ', agent: 'claude-code', startedAt: '2026-11-20T10:00:00.000Z', finishedAt: '2026-11-20T11:30:00.000Z',
    gitBranch: 'feat/x', gitCommits: '3', gitFilesChanged: '12',
  }

  it('reads the header of a finished run', () => {
    expect(agentFacts(meta, 'done', NOW)).toEqual({
      machine: 'laptop', agent: 'claude-code', model: null,
      startedAt: Date.parse(meta.startedAt), finishedAt: Date.parse(meta.finishedAt),
      durationMs: 90 * MIN, branch: 'feat/x', commits: 3, filesChanged: 12,
    })
  })

  it('the model the run launched the agent with, when the block says it', () => {
    expect(agentFacts({ ...meta, model: ' opus ' }, 'done', NOW).model).toBe('opus')
    expect(agentFacts({ ...meta, model: '' }, 'done', NOW).model).toBeNull()
  })

  it('counts up to now while the agent is live, and not at all once contact is lost', () => {
    const running = { startedAt: '2026-11-20T11:00:00.000Z' }
    expect(agentFacts(running, 'running', NOW).durationMs).toBe(60 * MIN)
    expect(agentFacts(running, 'waiting', NOW).durationMs).toBe(60 * MIN)
    expect(agentFacts(running, 'no-signal', NOW).durationMs).toBeNull()
    expect(agentFacts(running, 'interrupted', NOW).durationMs).toBeNull()
  })

  it('leaves out what is missing or malformed', () => {
    const facts = agentFacts({ startedAt: 'yesterday', gitCommits: 'three', gitFilesChanged: '', machine: '  ' }, 'done', NOW)
    expect(agentFactsEmpty(facts)).toBe(true)
    expect(agentFactsEmpty(agentFacts({}, 'queued', NOW))).toBe(true)
    expect(agentFactsEmpty(agentFacts({ gitCommits: '0' }, 'done', NOW))).toBe(false) // zero commits is a fact
    // A finish before the start (clocks of two machines): no negative duration.
    expect(agentFacts({ startedAt: meta.finishedAt, finishedAt: meta.startedAt }, 'done', NOW).durationMs).toBeNull()
  })
})

describe('agentPercent (the agent’s estimate, `task report --percent`)', () => {
  it('an integer 0…100, with or without % and spaces', () => {
    expect(agentPercent({ percent: '40' })).toBe(40)
    expect(agentPercent({ percent: '40%' })).toBe(40)
    expect(agentPercent({ percent: ' 40 % ' })).toBe(40)
    expect(agentPercent({ percent: '0' })).toBe(0)
    expect(agentPercent({ percent: '100' })).toBe(100)
    expect(agentPercent({ percent: '007' })).toBe(7)
  })

  it('anything else is no bar: missing, out of range, decimal, sign, junk', () => {
    expect(agentPercent({})).toBeNull()
    expect(agentPercent(undefined)).toBeNull()
    expect(agentPercent(null)).toBeNull()
    for (const bad of ['', ' ', '101', '1000', '-5', '+5', '40.5', '4,5', 'forty', '40%%', '% 40', '40 percent']) {
      expect(agentPercent({ percent: bad }), bad).toBeNull()
    }
  })

  it('the same rule as the CLI', async () => {
    const { createRequire } = await import('node:module')
    const cli = createRequire(import.meta.url)('../../cli/noteflow.js') as { parseAgentPercent: (v: unknown) => number | null }
    for (const v of ['40', '40%', ' 40 % ', '0', '100', '007', '', '101', '-5', '40.5', 'forty', '40%%']) {
      expect(agentPercent({ percent: v }), v).toBe(cli.parseAgentPercent(v))
    }
  })
})

describe('formatAgentDuration', () => {
  it('uses the two largest units that matter', () => {
    expect(formatAgentDuration(0)).toBe('<1m')
    expect(formatAgentDuration(59_999)).toBe('<1m')
    expect(formatAgentDuration(MIN)).toBe('1m')
    expect(formatAgentDuration(59 * MIN)).toBe('59m')
    expect(formatAgentDuration(60 * MIN)).toBe('1h 00m')
    expect(formatAgentDuration(125 * MIN)).toBe('2h 05m')
    expect(formatAgentDuration(24 * 60 * MIN)).toBe('1d 0h')
    expect(formatAgentDuration((3 * 24 + 4) * 60 * MIN + 59 * MIN)).toBe('3d 4h')
    expect(formatAgentDuration(-5)).toBe('<1m')
  })
})

describe('agentLineStates / confirmedAgentDiscards', () => {
  const sections = [
    { content: `- [x] Old ${ROBOT}done1:done\n- [ ] Reopened ${ROBOT}reop1:queued\n\`\`\`\n- [x] code ${ROBOT}code1:done\n\`\`\`\n` },
    { content: `- [ ] Failed ${ROBOT}fail1:failed\r\n- plain bullet ${ROBOT}bull1:done\r\n` },
    { content: 'no tasks here' },
    { content: null },
  ]

  it('reads the state of each task line (CRLF tolerant; code and non-task lines are not tasks)', () => {
    expect([...agentLineStates(sections)].sort()).toEqual([['done1', 'done'], ['fail1', 'failed'], ['reop1', 'queued']])
    expect(agentLineStates(null).size).toBe(0)
  })

  it('an id on two lines keeps the state that is not finished', () => {
    const twice = [{ content: `- [x] A ${ROBOT}dupe1:done` }, { content: `- [ ] A again ${ROBOT}dupe1:running` }]
    expect(agentLineStates(twice).get('dupe1')).toBe('running')
    expect(agentLineStates([...twice].reverse()).get('dupe1')).toBe('running')
  })

  it('only discards the reports whose task line is in the note and still says done / failed', () => {
    const reported = ['done1', 'fail1', 'reop1', 'code1', 'bull1', 'gone1']
    // reop1: reopened on its line. code1 / bull1 / gone1: on no task line — left to the orphan rule.
    expect(confirmedAgentDiscards(reported, sections)).toEqual(['done1', 'fail1'])
    expect(confirmedAgentDiscards([], sections)).toEqual([])
    expect(confirmedAgentDiscards(reported, [])).toEqual([])
  })
})

describe('withoutAgentMarkers', () => {
  it('removes the markers of the given ids and nothing else, keeping line endings', () => {
    const sections = [
      { id: 'a', content: `- [x] Old 📅2026-12-01 ${ROBOT}done1:done\r\n- [ ] Keep ${ROBOT}keep1:running\r\n` },
      { id: 'b', content: 'untouched' },
    ]
    const next = withoutAgentMarkers(sections, ['done1', 'nope1'])
    expect(next[0].content).toBe(`- [x] Old 📅2026-12-01\r\n- [ ] Keep ${ROBOT}keep1:running\r\n`)
    expect(next[0].id).toBe('a')
    expect(next[1]).toBe(sections[1]) // same object: not rewritten
  })

  it('returns the same array when no line carried any of the ids (nothing to write)', () => {
    const sections = [{ content: `- [ ] Keep ${ROBOT}keep1:running` }, { content: 'text' }]
    expect(withoutAgentMarkers(sections, ['done1'])).toBe(sections)
    expect(withoutAgentMarkers(sections, [])).toBe(sections)
  })
})

describe('noteHasAgentMarkers / hasLiveAgentBlocks', () => {
  it('is true for any mention of a task id, even outside a task line', () => {
    expect(noteHasAgentMarkers([{ content: 'text' }, { content: `- [ ] A ${ROBOT}aaaa1:queued` }])).toBe(true)
    expect(noteHasAgentMarkers([{ content: `> quoted ${ROBOT}aaaa1:done` }])).toBe(true)
    expect(noteHasAgentMarkers([{ content: `a robot ${ROBOT} and nothing else` }])).toBe(false)
    expect(noteHasAgentMarkers([{ content: null }])).toBe(false)
    expect(noteHasAgentMarkers(undefined)).toBe(false)
  })

  it('the clock only matters with a running / waiting block', () => {
    const block = (state: string) => ({ id: 'aaaa1', meta: { state }, body: '' })
    expect(hasLiveAgentBlocks([block('done'), block('queued')])).toBe(false)
    expect(hasLiveAgentBlocks([block('done'), block('waiting')])).toBe(true)
    expect(hasLiveAgentBlocks([{ id: 'aaaa1', meta: {}, body: '' }])).toBe(false)
    expect(hasLiveAgentBlocks([])).toBe(false)
  })
})

describe('agentMaintenanceDue', () => {
  const base = { running: false, pendingEdits: false, lastRunAt: undefined, nowMs: NOW, minIntervalMs: MIN, force: false }

  it('runs the first time, and again only after the interval', () => {
    expect(agentMaintenanceDue(base)).toBe(true)
    expect(agentMaintenanceDue({ ...base, lastRunAt: NOW - 1000 })).toBe(false)
    expect(agentMaintenanceDue({ ...base, lastRunAt: NOW - MIN })).toBe(true)
  })

  it('opening the note skips the interval', () => {
    expect(agentMaintenanceDue({ ...base, lastRunAt: NOW - 1000, force: true })).toBe(true)
  })

  it('never while a round is running or the note has an edit waiting to be saved — not even forced', () => {
    expect(agentMaintenanceDue({ ...base, running: true, force: true })).toBe(false)
    expect(agentMaintenanceDue({ ...base, pendingEdits: true, force: true })).toBe(false)
  })
})
