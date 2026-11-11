import { describe, it, expect } from 'vitest'
import { getSyncDisplayState, pendingChangeCount, relativeAge, syncChartBars } from '../../src/lib/syncStatus'
import type { ActiveSyncStatus, SyncHistoryEntry } from '../../src/types'

const github = (over: Partial<ActiveSyncStatus> = {}): ActiveSyncStatus => ({
  backend: 'github',
  active: true,
  initialPullStatus: 'ok',
  pendingUploads: 0,
  pendingChanges: 0,
  github: { owner: 'me', repo: 'notes' },
  ...over,
})

const cloud = (
  keysState: 'unlocked' | 'locked' | 'no-keys',
  over: Partial<ActiveSyncStatus> = {},
): ActiveSyncStatus => ({
  backend: 'cloud',
  active: true,
  initialPullStatus: 'ok',
  pendingUploads: 0,
  pendingChanges: 0,
  cloud: { keysState, keysMode: 'managed', realtimeConnected: true },
  ...over,
})

describe('getSyncDisplayState', () => {
  it('is synced when nothing is going on', () => {
    expect(getSyncDisplayState(github(), false, false)).toBe('synced')
    expect(getSyncDisplayState(cloud('unlocked'), false, false)).toBe('synced')
  })

  it('a manual sync wins over everything, then an upload', () => {
    const broken = cloud('locked', { initialPullStatus: 'failed', error: 'boom' })
    expect(getSyncDisplayState(broken, true, true)).toBe('syncing')
    expect(getSyncDisplayState(broken, false, true)).toBe('uploading')
  })

  it('locked Cloud keys (locked or no-keys) outrank a failed first pull', () => {
    expect(getSyncDisplayState(cloud('locked', { initialPullStatus: 'failed' }), false, false)).toBe('locked')
    expect(getSyncDisplayState(cloud('no-keys'), false, false)).toBe('locked')
  })

  it('locked only applies to the Cloud backend', () => {
    expect(getSyncDisplayState(github({ cloud: undefined }), false, false)).toBe('synced')
  })

  it('a failed first pull outranks a plain error', () => {
    expect(getSyncDisplayState(github({ initialPullStatus: 'failed', error: 'x' }), false, false)).toBe('blocked')
  })

  it('an error outranks a pending first pull', () => {
    expect(getSyncDisplayState(github({ initialPullStatus: 'pending', error: 'x' }), false, false)).toBe('error')
    expect(getSyncDisplayState(github({ initialPullStatus: 'pending' }), false, false)).toBe('pending')
  })

  it('journaled local changes are never shown as synced (pull OK, error cleared)', () => {
    // The QA repro: two pushes failed offline, a later pull succeeded and
    // cleared the error — the journal still holds them.
    expect(getSyncDisplayState(cloud('unlocked', { pendingChanges: 2 }), false, false)).toBe('unsynced')
    expect(getSyncDisplayState(github({ pendingChanges: 1 }), false, false)).toBe('unsynced')
  })

  it('unsynced ranks below syncing, uploading, locked, blocked, error and a pending first pull', () => {
    const unsynced = { pendingChanges: 3 }
    expect(getSyncDisplayState(cloud('unlocked', unsynced), true, false)).toBe('syncing')
    expect(getSyncDisplayState(cloud('unlocked', unsynced), false, true)).toBe('uploading')
    expect(getSyncDisplayState(cloud('locked', unsynced), false, false)).toBe('locked')
    expect(getSyncDisplayState(github({ ...unsynced, initialPullStatus: 'failed' }), false, false)).toBe('blocked')
    expect(getSyncDisplayState(github({ ...unsynced, error: 'fetch failed' }), false, false)).toBe('error')
    expect(getSyncDisplayState(github({ ...unsynced, initialPullStatus: 'pending' }), false, false)).toBe('pending')
  })
})

describe('pendingChangeCount', () => {
  it('is the journal count, which already includes the files in flight', () => {
    expect(pendingChangeCount(cloud('unlocked', { pendingChanges: 2, pendingUploads: 1 }))).toBe(2)
    expect(pendingChangeCount(github())).toBe(0)
  })

  it('never drops below the uploads in flight', () => {
    expect(pendingChangeCount(github({ pendingChanges: 0, pendingUploads: 3 }))).toBe(3)
  })
})

describe('relativeAge', () => {
  const now = Date.parse('2026-10-06T12:00:00.000Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('under a minute is "now"', () => {
    expect(relativeAge(ago(0), now)).toEqual({ unit: 'now' })
    expect(relativeAge(ago(59_999), now)).toEqual({ unit: 'now' })
  })

  it('future timestamps (clock skew) and invalid input are "now"', () => {
    expect(relativeAge(ago(-5 * 60_000), now)).toEqual({ unit: 'now' })
    expect(relativeAge('not a date', now)).toEqual({ unit: 'now' })
  })

  it('buckets minutes, hours and days (floored)', () => {
    expect(relativeAge(ago(60_000), now)).toEqual({ unit: 'minutes', count: 1 })
    expect(relativeAge(ago(59 * 60_000 + 59_000), now)).toEqual({ unit: 'minutes', count: 59 })
    expect(relativeAge(ago(60 * 60_000), now)).toEqual({ unit: 'hours', count: 1 })
    expect(relativeAge(ago(23 * 3_600_000 + 59 * 60_000), now)).toEqual({ unit: 'hours', count: 23 })
    expect(relativeAge(ago(24 * 3_600_000), now)).toEqual({ unit: 'days', count: 1 })
    expect(relativeAge(ago(10 * 24 * 3_600_000), now)).toEqual({ unit: 'days', count: 10 })
  })
})

describe('syncChartBars', () => {
  const entry = (files: number, ok = true, minute = 0): SyncHistoryEntry => ({
    at: new Date(Date.UTC(2026, 9, 15, 10, minute)).toISOString(),
    files,
    ok,
  })

  it('is empty without history', () => {
    expect(syncChartBars(undefined, 36, 3)).toEqual([])
    expect(syncChartBars([], 36, 3)).toEqual([])
  })

  it('scales heights relative to the busiest entry', () => {
    const bars = syncChartBars([entry(2, true, 0), entry(8, true, 1), entry(4, false, 2)], 36, 3)
    expect(bars.map((b) => b.height)).toEqual([9, 36, 18])
    expect(bars[2].entry.ok).toBe(false)
  })

  it('gives zero-file entries (and an all-zero history) the minimum stub', () => {
    expect(syncChartBars([entry(0), entry(10, true, 1)], 36, 3).map((b) => b.height)).toEqual([3, 36])
    expect(syncChartBars([entry(0), entry(0, false, 1)], 36, 3).map((b) => b.height)).toEqual([3, 3])
  })

  it('never draws a non-zero entry below the stub', () => {
    expect(syncChartBars([entry(1), entry(1000, true, 1)], 36, 3)[0].height).toBe(3)
  })

  it('keeps only the newest maxBars entries, oldest first', () => {
    const history = Array.from({ length: 30 }, (_, i) => entry(i + 1, true, i))
    const bars = syncChartBars(history, 36, 3, 24)
    expect(bars).toHaveLength(24)
    expect(bars[0].entry.files).toBe(7)
    expect(bars[23].entry.files).toBe(30)
  })
})
