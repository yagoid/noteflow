// GitHub auto-sync decisions (electron/githubAutoPull.ts): the focus-driven
// cadence, when the cheap head check may skip the tree fetch, and when a pull
// may confirm the head it read.
import { describe, it, expect } from 'vitest'
import {
  GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS,
  GITHUB_AUTO_SYNC_IDLE_INTERVAL_MS,
  GITHUB_FOCUS_TICK_MIN_GAP_MS,
  GITHUB_FULL_PULL_MAX_AGE_MS,
  type SeenRemoteHead,
  focusRescheduleDelayMs,
  githubAutoSyncDelayMs,
  headChanged,
  headToConfirm,
  planAutoPull,
  remoteHeadKey,
  shouldRunFocusTick,
} from '../../electron/githubAutoPull'

const KEY = remoteHeadKey('Owner', 'Notes', 'main')
const NOW = 1_000_000_000
const seen = (over: Partial<SeenRemoteHead> = {}): SeenRemoteHead => ({
  key: KEY,
  sha: 'abc',
  etag: 'W/"e1"',
  pulledAt: NOW - 30_000,
  ...over,
})

describe('githubAutoSyncDelayMs', () => {
  it('ticks every 15 s focused and every 5 min otherwise', () => {
    expect(githubAutoSyncDelayMs(true)).toBe(15_000)
    expect(githubAutoSyncDelayMs(false)).toBe(5 * 60_000)
    expect(GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS).toBeLessThan(GITHUB_AUTO_SYNC_IDLE_INTERVAL_MS)
  })
})

describe('remoteHeadKey', () => {
  it('ignores the case of owner/repo but not of the branch', () => {
    expect(remoteHeadKey('owner', 'notes', 'main')).toBe(KEY)
    expect(remoteHeadKey('owner', 'notes', 'Main')).not.toBe(KEY)
    expect(remoteHeadKey('owner', 'other', 'main')).not.toBe(KEY)
  })
})

describe('planAutoPull', () => {
  it('pulls in full without a confirmed head (first tick after start, failed pull, reset)', () => {
    expect(planAutoPull({ seen: null, key: KEY, now: NOW, mustReconcile: false })).toEqual({ kind: 'full' })
  })

  it('pulls in full when the head was confirmed for another repo or branch', () => {
    const other = seen({ key: remoteHeadKey('owner', 'notes', 'dev') })
    expect(planAutoPull({ seen: other, key: KEY, now: NOW, mustReconcile: false })).toEqual({ kind: 'full' })
  })

  it('pulls in full when the pull has its own work pending', () => {
    expect(planAutoPull({ seen: seen(), key: KEY, now: NOW, mustReconcile: true })).toEqual({ kind: 'full' })
  })

  it('checks with the stored ETag while the last complete pull is recent', () => {
    expect(planAutoPull({ seen: seen(), key: KEY, now: NOW, mustReconcile: false })).toEqual({
      kind: 'check',
      etag: 'W/"e1"',
    })
    expect(planAutoPull({ seen: seen({ etag: undefined }), key: KEY, now: NOW, mustReconcile: false })).toEqual({
      kind: 'check',
    })
  })

  it('redoes a full pull once the last one is older than the old cadence', () => {
    const old = seen({ pulledAt: NOW - GITHUB_FULL_PULL_MAX_AGE_MS })
    expect(planAutoPull({ seen: old, key: KEY, now: NOW, mustReconcile: false })).toEqual({ kind: 'full' })
    const almost = seen({ pulledAt: NOW - GITHUB_FULL_PULL_MAX_AGE_MS + 1 })
    expect(planAutoPull({ seen: almost, key: KEY, now: NOW, mustReconcile: false }).kind).toBe('check')
  })

  it('pulls in full when the clock went back', () => {
    expect(planAutoPull({ seen: seen({ pulledAt: NOW + 1 }), key: KEY, now: NOW, mustReconcile: false })).toEqual({
      kind: 'full',
    })
  })
})

describe('headChanged', () => {
  it('a 304 to the stored ETag means unchanged', () => {
    expect(headChanged(seen(), { status: 304 })).toBe(false)
  })

  it('a 304 without a stored ETag is not trusted', () => {
    expect(headChanged(seen({ etag: undefined }), { status: 304 })).toBe(true)
  })

  it('a 200 compares the commit', () => {
    expect(headChanged(seen(), { status: 200, sha: 'abc', etag: 'W/"e2"' })).toBe(false)
    expect(headChanged(seen(), { status: 200, sha: 'def' })).toBe(true)
    expect(headChanged(seen(), { status: 200 })).toBe(true)
  })

  it('an error pulls (the pull reports it)', () => {
    expect(headChanged(seen(), { status: 'error' })).toBe(true)
  })
})

describe('headToConfirm', () => {
  const clean = { errors: [] as string[] }

  it('confirms the head read before a complete pull', () => {
    expect(headToConfirm({ status: 200, sha: 'abc', etag: 'W/"e1"' }, clean)).toEqual({ sha: 'abc', etag: 'W/"e1"' })
    expect(headToConfirm({ status: 200, sha: 'abc' }, clean)).toEqual({ sha: 'abc' })
  })

  it('never confirms after a pull with errors or incomplete', () => {
    const head = { status: 200 as const, sha: 'abc' }
    expect(headToConfirm(head, { errors: ['offline'] })).toBeNull()
    expect(headToConfirm(head, { errors: [], incomplete: true })).toBeNull()
  })

  it('never confirms without a commit read', () => {
    expect(headToConfirm({ status: 'error' }, clean)).toBeNull()
    expect(headToConfirm({ status: 304 }, clean)).toBeNull()
    expect(headToConfirm({ status: 200 }, clean)).toBeNull()
  })
})

describe('shouldRunFocusTick', () => {
  it('runs on the first focus', () => {
    expect(shouldRunFocusTick(NOW, null, false)).toBe(true)
  })

  it('not while a tick runs', () => {
    expect(shouldRunFocusTick(NOW, null, true)).toBe(false)
    expect(shouldRunFocusTick(NOW, NOW - 60_000, true)).toBe(false)
  })

  it('not within the minimum gap of the last tick (alt-tab)', () => {
    expect(shouldRunFocusTick(NOW, NOW - GITHUB_FOCUS_TICK_MIN_GAP_MS + 1, false)).toBe(false)
    expect(shouldRunFocusTick(NOW, NOW - GITHUB_FOCUS_TICK_MIN_GAP_MS, false)).toBe(true)
  })

  it('runs if the clock went back', () => {
    expect(shouldRunFocusTick(NOW, NOW + 10_000, false)).toBe(true)
  })
})

describe('focusRescheduleDelayMs', () => {
  it('brings an unfocused 5-min timer forward to the end of the minimum gap', () => {
    const last = NOW - 2_000
    const dueAt = last + GITHUB_AUTO_SYNC_IDLE_INTERVAL_MS
    expect(focusRescheduleDelayMs(NOW, last, dueAt)).toBe(GITHUB_FOCUS_TICK_MIN_GAP_MS - 2_000)
  })

  it('keeps a timer that is already due sooner', () => {
    const last = NOW - 2_000
    expect(focusRescheduleDelayMs(NOW, last, NOW + 1_000)).toBeNull()
    expect(focusRescheduleDelayMs(NOW, last, NOW + GITHUB_FOCUS_TICK_MIN_GAP_MS - 2_000)).toBeNull()
  })

  it('arms one when none is armed', () => {
    expect(focusRescheduleDelayMs(NOW, NOW - 1_000, null)).toBe(GITHUB_FOCUS_TICK_MIN_GAP_MS - 1_000)
    expect(focusRescheduleDelayMs(NOW, null, null)).toBe(0)
  })

  it('never waits longer than the focused cadence, and not at all if the clock went back', () => {
    expect(focusRescheduleDelayMs(NOW, NOW - 1_000, null)).toBeLessThanOrEqual(GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS)
    expect(focusRescheduleDelayMs(NOW, NOW + 10_000, null)).toBe(0)
  })
})
