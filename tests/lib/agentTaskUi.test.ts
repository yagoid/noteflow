// Agent tasks — the decisions of the interface (src/lib/agentTaskUi.ts): what
// the chip does on click, which actions the report menu offers per state, the
// facts it lists, and what the discard-by-age may really remove.
import { describe, it, expect } from 'vitest'
import {
  agentChipAction,
  agentDismissNeedsConfirm,
  agentFacts,
  agentFactsEmpty,
  agentIsLive,
  agentLineStates,
  agentMaintenanceDue,
  agentPrimaryAction,
  agentReportActions,
  agentStateTone,
  confirmedAgentDiscards,
  formatAgentDuration,
  hasLiveAgentBlocks,
  noteHasAgentMarkers,
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
    expect(agentReportActions('done', { checked: false, editable: true })).toEqual(['markDone', 'requeue', 'dismiss', 'copyId'])
    expect(agentReportActions('done', { checked: true, editable: true })).toEqual(['dismiss', 'copyId'])
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
    expect(agentReportActions('review', editable)).toEqual(['markDone', 'requeue', 'dismiss', 'copyId'])
    expect(agentReportActions('running', editable)).toEqual(['markDone', 'dismiss', 'copyId'])
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
      machine: 'laptop', agent: 'claude-code',
      startedAt: Date.parse(meta.startedAt), finishedAt: Date.parse(meta.finishedAt),
      durationMs: 90 * MIN, branch: 'feat/x', commits: 3, filesChanged: 12,
    })
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
