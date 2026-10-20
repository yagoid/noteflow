import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_LOG_KEEP_DAYS,
  emptyActivityLog,
  parseActivityLog,
  pruneActivityLog,
  recordActivityEdit,
  serializeActivityLog,
} from '../../electron/activityLog'

// Local time, mid-day so no DST edge can move the day
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const NOW = at(2026, 10, 15)

describe('recordActivityEdit', () => {
  it("adds the id to now's local day", () => {
    const log = recordActivityEdit(emptyActivityLog(), 'abc', NOW)
    expect(log.days).toEqual({ '2026-10-15': ['abc'] })
  })

  it('keeps each day free of duplicates and returns the same log when nothing changed', () => {
    const once = recordActivityEdit(emptyActivityLog(), 'abc', NOW)
    const twice = recordActivityEdit(once, 'abc', NOW + 60_000)
    expect(twice).toBe(once)
    const other = recordActivityEdit(once, 'xyz', NOW)
    expect(other.days['2026-10-15']).toEqual(['abc', 'xyz'])
    expect(once.days['2026-10-15']).toEqual(['abc']) // input untouched
  })

  it('records the same note again on a different day', () => {
    let log = recordActivityEdit(emptyActivityLog(), 'abc', at(2026, 10, 14))
    log = recordActivityEdit(log, 'abc', NOW)
    expect(log.days).toEqual({ '2026-10-14': ['abc'], '2026-10-15': ['abc'] })
  })

  it('ignores invalid ids', () => {
    const log = emptyActivityLog()
    expect(recordActivityEdit(log, '', NOW)).toBe(log)
    expect(recordActivityEdit(log, 'x'.repeat(200), NOW)).toBe(log)
  })

  it('prunes old days on every write', () => {
    const log = { version: 1 as const, days: { '2026-01-01': ['old'], '2026-10-14': ['a'] } }
    expect(recordActivityEdit(log, 'b', NOW).days).toEqual({ '2026-10-14': ['a'], '2026-10-15': ['b'] })
    // even when the id itself was already recorded today
    const today = { version: 1 as const, days: { '2026-01-01': ['old'], '2026-10-15': ['b'] } }
    expect(recordActivityEdit(today, 'b', NOW).days).toEqual({ '2026-10-15': ['b'] })
  })
})

describe('pruneActivityLog', () => {
  it(`keeps exactly the last ${ACTIVITY_LOG_KEEP_DAYS} local days (today included)`, () => {
    const oldestKept = new Date(2026, 9, 15 - (ACTIVITY_LOG_KEEP_DAYS - 1))
    const firstDropped = new Date(2026, 9, 15 - ACTIVITY_LOG_KEEP_DAYS)
    const k = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const log = { version: 1 as const, days: { [k(oldestKept)]: ['a'], [k(firstDropped)]: ['b'] } }
    expect(Object.keys(pruneActivityLog(log, NOW).days)).toEqual([k(oldestKept)])
  })

  it('returns the same log when nothing is dropped', () => {
    const log = { version: 1 as const, days: { '2026-10-10': ['a'] } }
    expect(pruneActivityLog(log, NOW)).toBe(log)
  })
})

describe('parseActivityLog / serializeActivityLog', () => {
  it('round-trips', () => {
    const log = recordActivityEdit(recordActivityEdit(emptyActivityLog(), 'a', NOW), 'b', NOW)
    expect(parseActivityLog(serializeActivityLog(log))).toEqual(log)
  })

  it('degrades missing, corrupt or unknown-version content to an empty log', () => {
    expect(parseActivityLog(null)).toEqual(emptyActivityLog())
    expect(parseActivityLog('{nope')).toEqual(emptyActivityLog())
    expect(parseActivityLog('[]')).toEqual(emptyActivityLog())
    expect(parseActivityLog(JSON.stringify({ version: 2, days: { '2026-10-15': ['a'] } }))).toEqual(emptyActivityLog())
  })

  it('drops malformed day keys and ids, and de-duplicates', () => {
    const raw = JSON.stringify({
      version: 1,
      days: {
        '2026-10-15': ['a', 'a', 7, '', 'b'],
        'yesterday': ['c'],
        '2026-10-14': 'not-an-array',
        '2026-10-13': [],
      },
    })
    expect(parseActivityLog(raw).days).toEqual({ '2026-10-15': ['a', 'b'] })
  })
})
