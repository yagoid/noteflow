import { describe, it, expect } from 'vitest'
import { getSyncDisplayState, relativeAge } from '../../src/lib/syncStatus'
import type { ActiveSyncStatus } from '../../src/types'

const github = (over: Partial<ActiveSyncStatus> = {}): ActiveSyncStatus => ({
  backend: 'github',
  active: true,
  initialPullStatus: 'ok',
  pendingUploads: 0,
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
