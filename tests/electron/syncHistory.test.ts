import { describe, it, expect } from 'vitest'
import {
  addToDayTotal,
  appendSyncHistory,
  createSyncHistory,
  filesOnDay,
  localDayKey,
  SYNC_HISTORY_BUCKET_MS,
  SYNC_HISTORY_MAX,
  type SyncHistoryEntry,
} from '../../electron/syncHistory'

// A bucket-aligned origin so "same minute" is easy to reason about.
const T0 = Date.parse('2026-10-15T10:00:00.000Z')
const MIN = SYNC_HISTORY_BUCKET_MS

describe('appendSyncHistory', () => {
  it('appends a first entry with the ISO time', () => {
    expect(appendSyncHistory([], 3, true, T0)).toEqual([
      { at: new Date(T0).toISOString(), files: 3, ok: true },
    ])
  })

  it('folds operations of the same bucket into one entry (files summed, ok ANDed, at = latest)', () => {
    let h: SyncHistoryEntry[] = []
    h = appendSyncHistory(h, 1, true, T0 + 1_000)
    h = appendSyncHistory(h, 1, true, T0 + 6_000)
    h = appendSyncHistory(h, 0, false, T0 + 20_000)
    h = appendSyncHistory(h, 2, true, T0 + 59_999)
    expect(h).toEqual([{ at: new Date(T0 + 59_999).toISOString(), files: 4, ok: false }])
  })

  it('starts a new entry in the next bucket — the window is fixed, not sliding', () => {
    let h: SyncHistoryEntry[] = []
    // One op every 20 s for 3 minutes: a sliding window would merge them all.
    for (let t = 0; t < 3 * MIN; t += 20_000) h = appendSyncHistory(h, 1, true, T0 + t)
    expect(h.map((e) => e.files)).toEqual([3, 3, 3])
  })

  it('keeps only the newest `max` entries', () => {
    let h: SyncHistoryEntry[] = []
    for (let i = 0; i < SYNC_HISTORY_MAX + 5; i++) h = appendSyncHistory(h, i, true, T0 + i * MIN)
    expect(h).toHaveLength(SYNC_HISTORY_MAX)
    expect(h[0].files).toBe(5)
    expect(h[h.length - 1].files).toBe(SYNC_HISTORY_MAX + 4)
  })

  it('clamps negative / NaN / fractional counts', () => {
    expect(appendSyncHistory([], -2, true, T0)[0].files).toBe(0)
    expect(appendSyncHistory([], Number.NaN, true, T0)[0].files).toBe(0)
    expect(appendSyncHistory([], 2.7, true, T0)[0].files).toBe(2)
  })

  it('does not mutate the input', () => {
    const h: SyncHistoryEntry[] = [{ at: new Date(T0).toISOString(), files: 1, ok: true }]
    const copy = structuredClone(h)
    appendSyncHistory(h, 5, false, T0 + 1_000)
    appendSyncHistory(h, 5, false, T0 + 2 * MIN)
    expect(h).toEqual(copy)
  })
})

describe('createSyncHistory', () => {
  it('starts empty and records with the injected clock', () => {
    let now = T0
    const rec = createSyncHistory(() => now)
    expect(rec.list()).toEqual([])
    rec.record(2, true)
    now += 2 * MIN
    rec.record(0, false)
    expect(rec.list()).toEqual([
      { at: new Date(T0).toISOString(), files: 2, ok: true },
      { at: new Date(T0 + 2 * MIN).toISOString(), files: 0, ok: false },
    ])
  })

  it('list() returns a copy callers cannot mutate', () => {
    const rec = createSyncHistory(() => T0)
    rec.record(1, true)
    rec.list()[0].files = 99
    expect(rec.list()[0].files).toBe(1)
  })
})

// Day-total tests use LOCAL-time dates: "today" is the user's calendar day.
describe('day running total', () => {
  const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()

  it('keys by local date', () => {
    expect(localDayKey(local(15, 0, 1))).toBe('2026-10-15')
    expect(localDayKey(local(15, 23, 59))).toBe('2026-10-15')
    expect(localDayKey(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05')
  })

  it('accumulates within a day and restarts at the local rollover', () => {
    let t = addToDayTotal(null, 3, local(15, 9))
    t = addToDayTotal(t, 4, local(15, 23, 59))
    expect(t).toEqual({ day: '2026-10-15', files: 7 })
    t = addToDayTotal(t, 2, local(16, 0, 1))
    expect(t).toEqual({ day: '2026-10-16', files: 2 })
  })

  it('clamps bad counts and reads 0 for a stale day', () => {
    const t = addToDayTotal(null, -5, local(15, 9))
    expect(t.files).toBe(0)
    expect(filesOnDay({ day: '2026-10-15', files: 9 }, local(15, 20))).toBe(9)
    expect(filesOnDay({ day: '2026-10-15', files: 9 }, local(16, 8))).toBe(0)
    expect(filesOnDay(null, local(15, 20))).toBe(0)
  })

  it('the recorder counts the whole day, beyond what the 24-entry ring holds', () => {
    let now = local(15, 6)
    const rec = createSyncHistory(() => now)
    // 5-min heartbeat for 4 h with a 1-file push every tick: 48 entries > ring.
    for (let i = 0; i < 48; i++) {
      rec.record(1, true)
      now += 5 * MIN
    }
    expect(rec.list()).toHaveLength(SYNC_HISTORY_MAX)
    expect(rec.list().reduce((n, e) => n + e.files, 0)).toBe(SYNC_HISTORY_MAX)
    expect(rec.filesToday()).toBe(48)
  })

  it('the recorder reports 0 after midnight until something syncs', () => {
    let now = local(15, 23, 50)
    const rec = createSyncHistory(() => now)
    rec.record(5, true)
    expect(rec.filesToday()).toBe(5)
    now = local(16, 0, 5)
    expect(rec.filesToday()).toBe(0)
    rec.record(2, false)
    expect(rec.filesToday()).toBe(2)
  })
})
