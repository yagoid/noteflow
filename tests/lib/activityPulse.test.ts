import { describe, it, expect } from 'vitest'
import {
  dailyActivity,
  firstActivityDaysAgo,
  activityWindow,
  activityAxisStart,
  buildActivityPulse,
  localDayKey,
  ACTIVITY_MAX_DAYS,
  ACTIVITY_MIN_DAYS,
  ACTIVITY_DAILY_MAX_DAYS,
  ACTIVITY_ROLLING_DAYS,
  type ActivityNoteInput,
} from '../../src/lib/activityPulse'

// Fixed "now" for deterministic days (local time)
const NOW = new Date(2026, 6, 14, 15, 30) // 2026-07-14 15:30 local

function iso(daysAgo: number, hour = 10): string {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, hour).toISOString()
}
function key(daysAgo: number): string {
  return localDayKey(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo))
}

let seq = 0
const note = (n: Omit<ActivityNoteInput, 'id'> & { id?: string }): ActivityNoteInput => ({ id: `n${seq++}`, ...n })

const totals = (days: ReturnType<typeof dailyActivity>) => ({
  edited: days.reduce((s, d) => s + d.editedIds.length, 0),
  sectionsCreated: days.reduce((s, d) => s + d.sectionsCreated, 0),
})

describe('localDayKey', () => {
  it('formats the local calendar day as YYYY-MM-DD', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('dailyActivity', () => {
  const LAST = ACTIVITY_MAX_DAYS - 1 // index of today

  it('returns one entry per day of the range, all empty without notes or log', () => {
    const days = dailyActivity([], {}, NOW)
    expect(days).toHaveLength(ACTIVITY_MAX_DAYS)
    expect(totals(days)).toEqual({ edited: 0, sectionsCreated: 0 })
  })

  it('places days oldest first, today last', () => {
    const days = dailyActivity(
      [
        note({ created: iso(0), updated: iso(0) }),
        note({ created: iso(1), updated: iso(1) }),
        note({ created: iso(ACTIVITY_MAX_DAYS - 1), updated: iso(ACTIVITY_MAX_DAYS - 1) }),
      ],
      {},
      NOW,
    )
    expect(days[LAST].sectionsCreated).toBe(1)
    expect(days[LAST - 1].sectionsCreated).toBe(1)
    expect(days[0].sectionsCreated).toBe(1)
  })

  it('counts an edit on the day of `updated` when it is not the creation day', () => {
    const days = dailyActivity([note({ id: 'a', created: iso(20), updated: iso(2) })], {}, NOW)
    expect(days[LAST - 2].editedIds).toEqual(['a'])
    expect(totals(days).edited).toBe(1)
  })

  it('a note edited on its creation day is not counted as edited', () => {
    const days = dailyActivity([note({ created: iso(3, 9), updated: iso(3, 20) })], {}, NOW)
    expect(totals(days).edited).toBe(0)
  })

  it('counts a note created before the range and edited inside it as edited', () => {
    const days = dailyActivity([note({ created: iso(ACTIVITY_MAX_DAYS + 30), updated: iso(1) })], {}, NOW)
    expect(days[LAST - 1].editedIds).toHaveLength(1)
    expect(totals(days).sectionsCreated).toBe(0)
  })

  it('counts each section by its own `created`', () => {
    const days = dailyActivity(
      [note({ created: iso(30), updated: iso(30), sections: [{ created: iso(30) }, { created: iso(8) }, { created: iso(1) }] })],
      {},
      NOW,
    )
    expect(days[LAST - 1].sectionsCreated).toBe(1)
    expect(days[LAST - 8].sectionsCreated).toBe(1)
    expect(totals(days).sectionsCreated).toBe(3)
  })

  it("falls back to the note's `created` for sections without one (or with an invalid one)", () => {
    const days = dailyActivity(
      [note({ created: iso(2), updated: iso(2), sections: [{}, { created: 'not-a-date' }, { created: iso(50) }] })],
      {},
      NOW,
    )
    expect(days[LAST - 2].sectionsCreated).toBe(2)
    expect(totals(days).sectionsCreated).toBe(3)
  })

  it('counts a note without readable sections once by its `created`', () => {
    const days = dailyActivity(
      [
        note({ created: iso(4), updated: iso(4), sections: [] }), // e.g. locked encrypted note
        note({ created: iso(4), updated: iso(4) }), // no sections field at all
      ],
      {},
      NOW,
    )
    expect(days[LAST - 4].sectionsCreated).toBe(2)
  })

  it('ignores activity outside the range, future days and invalid timestamps', () => {
    const days = dailyActivity(
      [
        note({ created: iso(ACTIVITY_MAX_DAYS + 10), updated: iso(ACTIVITY_MAX_DAYS) }),
        note({ created: iso(-3), updated: iso(-2) }), // clock skew
        note({ created: 'not-a-date', updated: '' }),
      ],
      { [key(ACTIVITY_MAX_DAYS)]: ['x'], [key(-1)]: ['y'], 'garbage': ['z'] },
      NOW,
    )
    expect(totals(days)).toEqual({ edited: 0, sectionsCreated: 0 })
  })

  it('merges log ids with `updated` per day as a union of distinct notes', () => {
    const days = dailyActivity(
      [note({ id: 'a', created: iso(40), updated: iso(2) })],
      {
        [key(2)]: ['a', 'b'], // 'a' is also its `updated` day → counted once
        [key(10)]: ['a'], // an earlier edit of 'a' the note itself no longer remembers
      },
      NOW,
    )
    expect(days[LAST - 2].editedIds.sort()).toEqual(['a', 'b'])
    expect(days[LAST - 10].editedIds).toEqual(['a'])
  })

  it('applies the creation-day rule to log ids of notes still in the store', () => {
    const days = dailyActivity(
      [note({ id: 'a', created: iso(5, 9), updated: iso(5, 18) })],
      { [key(5)]: ['a'] },
      NOW,
    )
    expect(totals(days).edited).toBe(0)
  })

  it('still counts log ids of notes that no longer exist', () => {
    const days = dailyActivity([], { [key(3)]: ['gone'] }, NOW)
    expect(days[LAST - 3].editedIds).toEqual(['gone'])
  })

  it('honours a custom range length', () => {
    const days = dailyActivity([note({ created: iso(0), updated: iso(0) })], {}, NOW, 10)
    expect(days).toHaveLength(10)
    expect(days[9].sectionsCreated).toBe(1)
  })
})

describe('firstActivityDaysAgo', () => {
  it('is null without any activity', () => {
    expect(firstActivityDaysAgo([], {}, NOW)).toBeNull()
    expect(firstActivityDaysAgo([], { [key(5)]: [] }, NOW)).toBeNull()
  })

  it('takes the oldest of creations, edits and log days (ignoring the future)', () => {
    expect(firstActivityDaysAgo([note({ created: iso(9), updated: iso(9) })], {}, NOW)).toBe(9)
    expect(firstActivityDaysAgo([note({ created: iso(9), updated: iso(9) })], { [key(30)]: ['a'] }, NOW)).toBe(30)
    expect(
      firstActivityDaysAgo([note({ created: iso(9), updated: iso(2), sections: [{ created: iso(200) }] })], {}, NOW),
    ).toBe(200)
    expect(firstActivityDaysAgo([note({ created: iso(-5), updated: iso(-5) })], {}, NOW)).toBeNull()
  })
})

describe('activityWindow', () => {
  it('uses the minimum window without activity or with very recent activity', () => {
    expect(activityWindow(null)).toEqual({ days: ACTIVITY_MIN_DAYS, step: 1 })
    expect(activityWindow(0)).toEqual({ days: ACTIVITY_MIN_DAYS, step: 1 })
    expect(activityWindow(ACTIVITY_MIN_DAYS - 2)).toEqual({ days: ACTIVITY_MIN_DAYS, step: 1 })
  })

  it('starts at the first active day, one point per day up to the daily limit', () => {
    expect(activityWindow(39)).toEqual({ days: 40, step: 1 })
    expect(activityWindow(ACTIVITY_DAILY_MAX_DAYS - 1)).toEqual({ days: ACTIVITY_DAILY_MAX_DAYS, step: 1 })
  })

  it('switches to one point every 2 days beyond it, rounded to whole points', () => {
    expect(activityWindow(ACTIVITY_DAILY_MAX_DAYS)).toEqual({ days: 58, step: 2 }) // 57 → 58
    expect(activityWindow(79)).toEqual({ days: 80, step: 2 })
  })

  it('caps the window at the maximum', () => {
    expect(activityWindow(ACTIVITY_MAX_DAYS - 1)).toEqual({ days: ACTIVITY_MAX_DAYS, step: 2 })
    expect(activityWindow(500)).toEqual({ days: ACTIVITY_MAX_DAYS, step: 2 })
  })
})

describe('activityAxisStart', () => {
  it('uses weeks for whole weeks and days otherwise', () => {
    expect(activityAxisStart(28)).toEqual({ unit: 'weeks', count: 4 })
    expect(activityAxisStart(112)).toEqual({ unit: 'weeks', count: 16 })
    expect(activityAxisStart(40)).toEqual({ unit: 'days', count: 40 })
  })
})

describe('buildActivityPulse', () => {
  it('without activity: minimum window, daily points, all zero', () => {
    const p = buildActivityPulse([], {}, NOW)
    expect(p.days).toBe(ACTIVITY_MIN_DAYS)
    expect(p.step).toBe(1)
    expect(p.edited).toHaveLength(ACTIVITY_MIN_DAYS)
    expect(p.sectionsCreated).toHaveLength(ACTIVITY_MIN_DAYS)
    expect(Math.max(...p.edited, ...p.sectionsCreated)).toBe(0)
    expect(p.totalEdited).toBe(0)
    expect(p.totalCreated).toBe(0)
  })

  it('each point is the rolling 7-day sum ending on it (today = last point)', () => {
    const p = buildActivityPulse([], { [key(0)]: ['a'] }, NOW)
    const last = p.edited.length - 1
    expect(p.edited[last]).toBe(1)
    expect(p.edited.filter((v) => v === 1)).toHaveLength(1) // only today's point covers today
    const q = buildActivityPulse([], { [key(3)]: ['a'] }, NOW)
    // day 3 ago is inside the 7-day sums ending 3, 2, 1 and 0 days ago
    expect(q.edited.slice(-4)).toEqual([1, 1, 1, 1])
    expect(q.edited[q.edited.length - 5]).toBe(0)
  })

  it('starts the window on the first active day (its first point includes it)', () => {
    const p = buildActivityPulse([note({ created: iso(39), updated: iso(39) })], {}, NOW)
    expect(p.days).toBe(40)
    expect(p.sectionsCreated[0]).toBe(1)
    expect(p.totalCreated).toBe(1)
  })

  it('completes the first points with lead-in days before a capped window', () => {
    // Activity 113 days ago → window capped at 112 days; that day sits in the
    // lead-in: it feeds the first point's rolling sum but not the legend totals
    expect(ACTIVITY_ROLLING_DAYS).toBe(7)
    const p = buildActivityPulse([], { [key(ACTIVITY_MAX_DAYS + 1)]: ['old'] }, NOW)
    expect(p.days).toBe(ACTIVITY_MAX_DAYS)
    expect(p.edited[0]).toBe(1) // first point = 2 days ending 110 days ago, summing 116…110
    expect(p.totalEdited).toBe(0)
  })

  it('samples every 2 days for long windows', () => {
    const p = buildActivityPulse([note({ created: iso(100), updated: iso(100) })], {}, NOW)
    expect(p.days).toBe(102)
    expect(p.step).toBe(2)
    expect(p.edited).toHaveLength(51)
    expect(p.totalCreated).toBe(1)
  })

  it('legend totals: distinct notes edited and sections created within the window', () => {
    const p = buildActivityPulse(
      [note({ id: 'a', created: iso(60), updated: iso(1), sections: [{ created: iso(60) }, { created: iso(5) }] })],
      { [key(1)]: ['a'], [key(4)]: ['a', 'b'], [key(20)]: ['a'] },
      NOW,
    )
    expect(p.totalEdited).toBe(2) // 'a' (edited on 3 days) + 'b'
    expect(p.totalCreated).toBe(2)
  })
})
