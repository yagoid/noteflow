// The sync's line merge and agent tasks (mergeSectionText + pickAgentTaskLine,
// electron/cloudSyncLogic.ts + electron/agentTasks.ts, mirrored in
// cli/noteflow.js). The bug it fixes (2026-11-21): an agent ran `noteflow task
// start` → `report` → `finish` while the desktop app, open on the same notes
// dir, synced on its own; the pull after `finish` found the task's line changed
// on both sides and kept BOTH versions between ⚠️ markers:
//     - [x] <text> 🤖9qi5t:done        (this machine)
//     - [ ] <text> 🤖9qi5t:running     (already synced)
// — a task id on two lines, which no `noteflow task` command accepts. Two
// versions of the SAME task line now settle by themselves: the state further
// along wins, whole line. Every case runs on the app's code and on the CLI's.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { mergeSectionText, DEFAULT_SECTION_CONFLICT_LABELS as L } from '../../electron/cloudSyncLogic'
import * as main from '../../electron/agentTasks'
import * as renderer from '../../src/lib/agentTasks'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

const ROBOT = '\u{1F916}'
const DUE = '\u{1F4C5}'
const ID = '9qi5t'
const task = (state: string, checked = false, text = 'Fix the sync', id = ID) => `- [${checked ? 'x' : ' '}] ${text} ${ROBOT}${id}:${state}`
const section = (...lines: string[]) => ['- [ ] before', ...lines, '- [ ] after'].join('\n')
const block = (local: string[], remote: string[]) => [`> ${L.local}`, '', ...local, '', `> ${L.remote}`, '', ...remote, '', `> ${L.end}`]

type Merge = (base: string | null, local: string, remote: string) => { content: string; conflicts: number }
type Pick = (local: string, remote: string, base?: readonly string[]) => string | null

const MERGES: Array<[string, Merge]> = [
  ['app', (b, l, r) => mergeSectionText(b, l, r)],
  ['CLI', (b, l, r) => cli.mergeSectionText(b, l, r)],
]
const PICKS: Array<[string, Pick]> = [
  ['electron', main.pickAgentTaskLine],
  ['renderer', renderer.pickAgentTaskLine],
  ['CLI', cli.pickAgentTaskLine],
]

for (const [name, pick] of PICKS) {
  describe(`pickAgentTaskLine (${name})`, () => {
    it('the same task in two states: the state further along wins, with its own box', () => {
      // queued < running = waiting < interrupted < review < done = failed
      const order = [['queued'], ['running', 'waiting'], ['interrupted'], ['review'], ['done', 'failed']]
      for (let lo = 0; lo < order.length; lo++) for (let hi = lo + 1; hi < order.length; hi++) {
        for (const low of order[lo]) for (const high of order[hi]) {
          expect(pick(task(low), task(high, true))).toBe(task(high, true))
          expect(pick(task(high, true), task(low))).toBe(task(high, true))
        }
      }
    })

    it('a tie keeps the local line: same rank, or the same state with another box', () => {
      expect(pick(task('running'), task('waiting'))).toBe(task('running'))
      expect(pick(task('waiting'), task('running'))).toBe(task('waiting'))
      expect(pick(task('done', true), task('failed'))).toBe(task('done', true))
      expect(pick(task('failed'), task('done', true))).toBe(task('failed'))
      expect(pick(task('review', true), task('review'))).toBe(task('review', true))
      expect(pick(task('done', true), task('done', true))).toBe(task('done', true))
    })

    it('indentation, the bullet, annotations and a marker in the middle of the line are part of the task', () => {
      expect(pick(`  * [X] T ${ROBOT}${ID}:done ${DUE}2026-12-01`, `  * [ ] T ${ROBOT}${ID}:running ${DUE}2026-12-01`))
        .toBe(`  * [X] T ${ROBOT}${ID}:done ${DUE}2026-12-01`)
      expect(pick(`  * [ ] T ${ROBOT}${ID}:running`, `- [ ] T ${ROBOT}${ID}:done`)).toBeNull() // another bullet / indent
      expect(pick(`- [ ] T ${ROBOT}${ID}:running`, `- [ ] T ${DUE}2026-12-01 ${ROBOT}${ID}:done`)).toBeNull() // another text
    })

    it('not the same task → null (the merge keeps both, as before)', () => {
      expect(pick(task('done', true), task('running', false, 'Fix the sync!'))).toBeNull() // text
      expect(pick(task('done', true), task('running', false, 'Fix the sync', 'aaaaa'))).toBeNull() // id
      expect(pick(task('done', true), '- [ ] Fix the sync')).toBeNull() // no marker on one side
      expect(pick('- [x] Fix the sync', task('running'))).toBeNull()
      expect(pick('- [x] Fix the sync', '- [ ] Fix the sync')).toBeNull() // no agent task at all
      expect(pick(`- Fix the sync ${ROBOT}${ID}:done`, `- Fix the sync ${ROBOT}${ID}:running`)).toBeNull() // not a checklist line
      expect(pick('x', 'y')).toBeNull()
    })

    it('the base decides first: the side that still holds the base line did not touch the task — the other wins', () => {
      // A restart (`task start` of an interrupted / failed / review task) goes DOWN in rank, on purpose.
      for (const old of ['interrupted', 'failed', 'review', 'done']) {
        const before = task(old, old === 'done')
        expect(pick(task('running'), before, ['x', before])).toBe(task('running'))
        expect(pick(before, task('running'), [before, 'x'])).toBe(task('running'))
      }
      // …also towards a state this version does not know: nothing is judged, one side simply changed.
      expect(pick(task('paused-by-app'), task('done', true), [task('done', true)])).toBe(task('paused-by-app'))
      // Both changed it since the base (or the base says nothing of it): the rank.
      expect(pick(task('running'), task('done', true), [task('queued')])).toBe(task('done', true))
      expect(pick(task('running'), task('done', true), [])).toBe(task('done', true))
      expect(pick(task('running'), task('done', true), [task('running'), task('done', true)])).toBe(task('done', true))
    })

    it('a state this version does not know is never judged — unless both sides carry it', () => {
      expect(pick(task('done', true), task('paused-by-app'))).toBeNull()
      expect(pick(task('paused-by-app'), task('queued'))).toBeNull()
      expect(pick(task('constructor'), task('queued'))).toBeNull()
      expect(pick(task('paused-by-app', true), task('paused-by-app'))).toBe(task('paused-by-app', true))
    })
  })
}

for (const [name, merge] of MERGES) {
  describe(`mergeSectionText — the same agent task changed on both sides (${name})`, () => {
    const local = section(task('done', true))
    const remote = section(task('running'))

    it('the real case: done here, running already synced → done, one line, no conflict', () => {
      // …with the base still at `queued` (the diff3 path),
      expect(merge(section(task('queued')), local, remote)).toEqual({ content: local, conflicts: 0 })
      // …with no base content (the two-way union),
      expect(merge(null, local, remote)).toEqual({ content: local, conflicts: 0 })
      // …and with the base at `running` (only this side changed: plain diff3).
      expect(merge(remote, local, remote)).toEqual({ content: local, conflicts: 0 })
      // The line appears once, and no marker of a conflict is written.
      for (const base of [section(task('queued')), null, remote]) {
        const { content } = merge(base, local, remote)
        expect(content.split('\n').filter((l) => l.includes(`${ROBOT}${ID}:`))).toEqual([task('done', true)])
        expect(content).not.toContain('⚠️')
      }
    })

    it('the other way round: running here, done already synced → the synced line wins', () => {
      expect(merge(section(task('queued')), remote, local)).toEqual({ content: local, conflicts: 0 })
      expect(merge(null, remote, local)).toEqual({ content: local, conflicts: 0 })
    })

    it('base = running but the line right above changed too (the app wrote it on the same disk): still clean', () => {
      // diff3 has no stable line between the two changes: one chunk, refined by
      // the two-way union — which used to see two versions of the task line.
      const base = ['- [ ] before', task('running'), '- [ ] after'].join('\n')
      const theirs = ['- [x] before', task('running'), '- [ ] after'].join('\n')
      const mine = ['- [x] before', task('done', true), '- [ ] after'].join('\n')
      expect(merge(base, mine, theirs)).toEqual({ content: mine, conflicts: 0 })
    })

    it('a restart is not undone: base and one side interrupted / failed / review, the other side running', () => {
      // The line above changed on both sides too, so diff3 has ONE chunk for the
      // two lines and the task line reaches the hunk rule — where the rank alone
      // would have put the old state back.
      for (const [old, checked] of [['interrupted', false], ['failed', false], ['review', false], ['done', true]] as const) {
        const lines = (first: string, t: string) => [first, t, '- [ ] after'].join('\n')
        const base = lines('- [ ] before', task(old, checked))
        const restarted = lines('- [x] before', task('running'))
        const untouched = lines('- [x] before', task(old, checked))
        // restarted here, the other device only checked the line above
        expect(merge(base, restarted, untouched)).toEqual({ content: restarted, conflicts: 0 })
        // …and the other way round
        expect(merge(base, untouched, restarted)).toEqual({ content: restarted, conflicts: 0 })
      }
    })

    it('without the base text nothing says who changed the line: the rank decides (known limit for a restart)', () => {
      const restarted = section(task('running'))
      const old = section(task('interrupted'))
      expect(merge(null, restarted, old)).toEqual({ content: old, conflicts: 0 })
      expect(merge(null, old, restarted)).toEqual({ content: old, conflicts: 0 })
    })

    it('a tie of rank keeps the line of the merging device', () => {
      expect(merge(section(task('queued')), section(task('waiting')), section(task('running')))).toEqual({ content: section(task('waiting')), conflicts: 0 })
      expect(merge(null, section(task('failed')), section(task('done', true)))).toEqual({ content: section(task('failed')), conflicts: 0 })
    })

    it('several task lines in one hunk: each pair settles on its own', () => {
      const a = (s: string, c = false) => task(s, c, 'Task A', 'aaaaa')
      const b = (s: string, c = false) => task(s, c, 'Task B', 'bbbbb')
      const base = section(a('queued'), b('queued'))
      const mine = section(a('done', true), b('running'))
      const theirs = section(a('running'), b('failed'))
      const merged = section(a('done', true), b('failed'))
      expect(merge(base, mine, theirs)).toEqual({ content: merged, conflicts: 0 })
      expect(merge(null, mine, theirs)).toEqual({ content: merged, conflicts: 0 })
    })

    it('both sides ADDED the task line (the base has none of it): kept once, not twice', () => {
      const base = section()
      expect(merge(base, local, remote)).toEqual({ content: local, conflicts: 0 })
    })

    it('CRLF sections and a final newline behave the same', () => {
      const crlf = (s: string) => `${s.replace(/\n/g, '\r\n')}\r\n`
      expect(merge(crlf(section(task('queued'))), crlf(local), crlf(remote))).toEqual({ content: crlf(local), conflicts: 0 })
      expect(merge(null, crlf(local), crlf(remote))).toEqual({ content: crlf(local), conflicts: 0 })
    })

    it('anything else is still a conflict, both versions kept', () => {
      const conflict = (mine: string[], theirs: string[]) =>
        ['- [ ] before', '', ...block(mine, theirs), '', '- [ ] after'].join('\n')
      const cases: Array<[string[], string[]]> = [
        [[task('done', true, 'Fix the sync, and the docs')], [task('running')]], // the text changed too
        [[task('done', true)], [task('running', false, 'Fix the sync', 'aaaaa')]], // another id
        [[task('done', true)], ['- [ ] Fix the sync']], // one side lost its marker
        [[task('done', true), '  - a detail'], [task('running')]], // not the same number of lines
        [[task('done', true)], [task('paused-by-app')]], // a state of a newer client
        [['- [x] plain task'], ['- [ ] plain task!']], // no agent task at all
      ]
      for (const [mine, theirs] of cases) {
        for (const base of [section(task('queued')), null]) {
          expect(merge(base, section(...mine), section(...theirs))).toEqual({ content: conflict(mine, theirs), conflicts: 1 })
        }
      }
      // A hunk where one pair is the same task and the other is not: all of it stays.
      const mixed = merge(null, section(task('done', true), 'mine'), section(task('running'), 'theirs'))
      expect(mixed).toEqual({ content: conflict([task('done', true), 'mine'], [task('running'), 'theirs']), conflicts: 1 })
    })
  })
}

describe('mergeSectionText — app ≡ CLI on sections with agent tasks', () => {
  it('same result over a grid of bases × local × remote', () => {
    const states = ['queued', 'running', 'waiting', 'interrupted', 'review', 'done', 'failed', 'paused-by-app']
    const texts = [
      section(),
      section('- [ ] Fix the sync'),
      ...states.map((s) => section(task(s, s === 'done'))),
      section(task('done', true), '  - a detail'),
      section(task('running', false, 'Fix the sync', 'aaaaa')),
      ['- [x] before', task('running'), '- [ ] after'].join('\n'),
      `${section(task('review')).replace(/\n/g, '\r\n')}\r\n`,
    ]
    let compared = 0
    for (const base of [null, ...texts]) for (const local of texts) for (const remote of texts) {
      expect(cli.mergeSectionText(base, local, remote)).toEqual(mergeSectionText(base, local, remote))
      compared++
    }
    expect(compared).toBe((texts.length + 1) * texts.length * texts.length)
  })
})
