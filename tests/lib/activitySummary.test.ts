import { describe, it, expect } from 'vitest'
import {
  FOCUS_DAYS,
  FOCUS_ROWS,
  activityTotals,
  buildActivityFocus,
  compactCount,
  dayStart,
  localDayKey,
  touchedDays,
  type FocusNoteInput,
} from '../../src/lib/activitySummary'

// Fixed "now" for deterministic days (local time)
const NOW = new Date(2026, 6, 14, 15, 30) // 2026-07-14 15:30 local

function iso(daysAgo: number, hour = 10): string {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, hour).toISOString()
}
function key(daysAgo: number): string {
  return localDayKey(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo))
}

const OLD = 200 // created long before the window
const note = (id: string, created = OLD, updated = OLD, title = id.toUpperCase()): FocusNoteInput => ({
  id,
  title,
  created: iso(created),
  updated: iso(updated),
})
const days = (map: Map<string, Set<number>>, id: string) => [...(map.get(id) ?? [])].sort((a, b) => a - b)

describe('localDayKey / dayStart', () => {
  it('formats the local calendar day as YYYY-MM-DD', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('steps back whole local days across month boundaries', () => {
    expect(localDayKey(dayStart(new Date(2026, 2, 2, 1), 3))).toBe('2026-02-27')
  })
})

describe('touchedDays', () => {
  it('merges the log with the days of `updated` and `created`', () => {
    const map = touchedDays([note('a', 10, 2)], { [key(5)]: ['a'], [key(2)]: ['a'] }, NOW)
    expect(days(map, 'a')).toEqual([2, 5, 10])
  })

  it('counts the creation day (a note created and edited the same day is one day)', () => {
    const map = touchedDays([note('a', 3, 3)], {}, NOW)
    expect(days(map, 'a')).toEqual([3])
  })

  it(`keeps only the last ${FOCUS_DAYS} days, today included`, () => {
    const map = touchedDays(
      [note('a', FOCUS_DAYS, 0), note('b', OLD, FOCUS_DAYS - 1)],
      { [key(FOCUS_DAYS)]: ['b'], [key(40)]: ['a'] },
      NOW,
    )
    expect(days(map, 'a')).toEqual([0])
    expect(days(map, 'b')).toEqual([FOCUS_DAYS - 1])
  })

  it('ignores ids that are not in the store, future days and malformed keys', () => {
    const tomorrow = localDayKey(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1))
    const map = touchedDays(
      [note('a', OLD, -1)],
      { [key(1)]: ['gone'], [tomorrow]: ['a'], 'not-a-day': ['a'] },
      NOW,
    )
    expect(map.has('gone')).toBe(false)
    expect(map.has('a')).toBe(false)
  })

  it('omits notes never touched in the window', () => {
    expect(touchedDays([note('a')], {}, NOW).size).toBe(0)
  })
})

describe('buildActivityFocus', () => {
  it('ranks by days touched, then by the most recent touch', () => {
    const notes = [note('few', OLD, 0), note('many', OLD, 20), note('tieOld', OLD, 6), note('tieNew', OLD, 4)]
    const log = { [key(3)]: ['many', 'tieOld', 'tieNew'], [key(10)]: ['many'] }
    const focus = buildActivityFocus(notes, log, NOW)
    // many: 3 days · tieNew / tieOld: 2 days, both last touched 3 days ago (the later `updated` wins) · few: 1
    expect(focus.rows.map((r) => r.id)).toEqual(['many', 'tieNew', 'tieOld', 'few'])
    expect(focus.rows.map((r) => r.count)).toEqual([3, 2, 2, 1])
  })

  it('prefers the note touched most recently on equal counts', () => {
    const focus = buildActivityFocus([note('older', OLD, 9), note('newer', OLD, 1)], {}, NOW)
    expect(focus.rows.map((r) => r.id)).toEqual(['newer', 'older'])
  })

  it('lays the strip out oldest first, today last', () => {
    const focus = buildActivityFocus([note('a', FOCUS_DAYS - 1, 0)], {}, NOW)
    const strip = focus.rows[0].touched
    expect(strip).toHaveLength(FOCUS_DAYS)
    expect(strip[0]).toBe(true)
    expect(strip[FOCUS_DAYS - 1]).toBe(true)
    expect(strip.filter(Boolean)).toHaveLength(2)
  })

  it(`shows up to ${FOCUS_ROWS} rows and counts every distinct note touched`, () => {
    const notes = Array.from({ length: 7 }, (_, i) => note(`n${i}`, OLD, i))
    const focus = buildActivityFocus(notes, {}, NOW)
    expect(focus.rows).toHaveLength(FOCUS_ROWS)
    expect(focus.distinct).toBe(7)
    expect(focus.rows[0]).toMatchObject({ id: 'n0', title: 'N0' })
  })

  it('is empty when nothing was touched in the window', () => {
    expect(buildActivityFocus([note('a')], {}, NOW)).toEqual({ rows: [], distinct: 0 })
  })
})

describe('activityTotals', () => {
  it('sums notes, readable sections, words and tasks', () => {
    const totals = activityTotals([
      { created: iso(30), sections: [{ content: '- [x] Buy milk\n- [ ] Call Ana' }, { content: 'Three plain words' }] },
      { created: iso(400), sections: [{ content: '- [x] done' }] },
      // Encrypted and locked: a note, but no sections
      { created: iso(5), sections: [] },
    ])
    expect(totals).toEqual({
      notes: 3,
      sections: 3,
      words: 4 + 3 + 1,
      tasksDone: 2,
      tasksTotal: 3,
      oldestCreated: iso(400),
    })
  })

  it('has no oldest date without notes or with invalid dates', () => {
    expect(activityTotals([]).oldestCreated).toBeNull()
    expect(activityTotals([{ created: 'nope', sections: [] }]).oldestCreated).toBeNull()
  })

  it('reflects a replaced section (stats cached per section object)', () => {
    const section = { content: 'one two' }
    expect(activityTotals([{ created: iso(1), sections: [section] }]).words).toBe(2)
    expect(activityTotals([{ created: iso(1), sections: [{ content: 'one two three' }] }]).words).toBe(3)
  })
})

describe('compactCount', () => {
  it('keeps small numbers as they are', () => {
    expect(compactCount(0, 'en')).toBe('0')
    expect(compactCount(999, 'en')).toBe('999')
  })

  it('abbreviates thousands and millions', () => {
    expect(compactCount(1000, 'en')).toBe('1 k')
    expect(compactCount(1250, 'en')).toBe('1.2 k')
    expect(compactCount(1250, 'es')).toBe('1,2 k')
    expect(compactCount(85_400, 'en')).toBe('85 k')
    expect(compactCount(999_999, 'en')).toBe('999 k')
    expect(compactCount(2_500_000, 'en')).toBe('2.5 M')
  })
})
