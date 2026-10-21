import { describe, it, expect } from 'vitest'
import {
  ENTITLEMENTS_RETRY_DELAYS_MS,
  entitlementsRetryDelayMs,
  isRetryableEntitlementsFailure,
  parseEntitlementsCache,
  isManagedAiUsable,
} from '../../electron/entitlementsRetry'

const mid = () => 0.5 // no jitter: factor exactly 1

describe('entitlementsRetryDelayMs — backoff schedule', () => {
  it('starts short and grows', () => {
    expect(entitlementsRetryDelayMs(0, mid)).toBe(5_000)
    expect(entitlementsRetryDelayMs(1, mid)).toBe(15_000)
    expect(entitlementsRetryDelayMs(2, mid)).toBe(30_000)
    expect(entitlementsRetryDelayMs(3, mid)).toBe(60_000)
    expect(entitlementsRetryDelayMs(4, mid)).toBe(120_000)
    expect(entitlementsRetryDelayMs(5, mid)).toBe(300_000)
  })

  it('is monotonic and caps at 10 minutes', () => {
    let prev = 0
    for (let i = 0; i < 20; i++) {
      const d = entitlementsRetryDelayMs(i, mid)
      expect(d).toBeGreaterThanOrEqual(prev)
      expect(d).toBeLessThanOrEqual(600_000)
      prev = d
    }
    expect(entitlementsRetryDelayMs(50, mid)).toBe(600_000)
    expect(ENTITLEMENTS_RETRY_DELAYS_MS[ENTITLEMENTS_RETRY_DELAYS_MS.length - 1]).toBe(600_000)
  })

  it('applies ±20% jitter from the injected random', () => {
    expect(entitlementsRetryDelayMs(0, () => 0)).toBe(4_000)
    expect(entitlementsRetryDelayMs(0, () => 1)).toBe(6_000)
    expect(entitlementsRetryDelayMs(99, () => 1)).toBe(720_000)
  })

  it('tolerates out-of-range inputs', () => {
    expect(entitlementsRetryDelayMs(-3, mid)).toBe(5_000)
    expect(entitlementsRetryDelayMs(1.7, mid)).toBe(15_000)
    expect(entitlementsRetryDelayMs(0, () => 7)).toBe(6_000) // random clamped to [0, 1]
  })
})

describe('isRetryableEntitlementsFailure', () => {
  it('retries transient causes', () => {
    expect(isRetryableEntitlementsFailure('network')).toBe(true)
    expect(isRetryableEntitlementsFailure('refreshFailed')).toBe(true)
    expect(isRetryableEntitlementsFailure('sessionLocked')).toBe(true)
  })

  it('does not retry when waiting cannot help', () => {
    expect(isRetryableEntitlementsFailure('notConfigured')).toBe(false)
    expect(isRetryableEntitlementsFailure('notSignedIn')).toBe(false)
    expect(isRetryableEntitlementsFailure(undefined)).toBe(false)
  })
})

describe('parseEntitlementsCache', () => {
  const cache = { userId: 'u1', ai: true, cloud: false, fetchedAt: '2026-10-20T10:00:00.000Z' }

  it('restores a cache that belongs to the stored session', () => {
    expect(parseEntitlementsCache(cache, 'u1')).toEqual({
      entitlements: { ai: true, cloud: false },
      fetchedAt: '2026-10-20T10:00:00.000Z',
    })
  })

  it('ignores a cache of another user', () => {
    expect(parseEntitlementsCache(cache, 'u2')).toBeNull()
  })

  it('ignores it without a session user id', () => {
    expect(parseEntitlementsCache(cache, undefined)).toBeNull()
    expect(parseEntitlementsCache(cache, null)).toBeNull()
    expect(parseEntitlementsCache(cache, '')).toBeNull()
  })

  it('rejects malformed shapes (hand-editable JSON)', () => {
    expect(parseEntitlementsCache(null, 'u1')).toBeNull()
    expect(parseEntitlementsCache('nope', 'u1')).toBeNull()
    expect(parseEntitlementsCache({ ...cache, ai: 'yes' }, 'u1')).toBeNull()
    expect(parseEntitlementsCache({ ...cache, cloud: undefined }, 'u1')).toBeNull()
    expect(parseEntitlementsCache({ ...cache, fetchedAt: 'not a date' }, 'u1')).toBeNull()
    expect(parseEntitlementsCache({ ...cache, fetchedAt: 42 }, 'u1')).toBeNull()
  })
})

describe('isManagedAiUsable — unknown is not "not entitled"', () => {
  const view = (patch: Partial<Parameters<typeof isManagedAiUsable>[0]> = {}) => ({
    signedIn: true,
    entitlements: { ai: false, cloud: false },
    entitlementsKnown: true,
    ...patch,
  })

  it('needs a session', () => {
    expect(isManagedAiUsable(view({ signedIn: false, entitlements: { ai: true, cloud: false } }))).toBe(false)
    expect(isManagedAiUsable(view({ signedIn: false, entitlementsKnown: false }))).toBe(false)
  })

  it('known entitled → usable; known not entitled → not', () => {
    expect(isManagedAiUsable(view({ entitlements: { ai: true, cloud: false } }))).toBe(true)
    expect(isManagedAiUsable(view())).toBe(false)
  })

  it('unknown → usable (the proxy judges)', () => {
    expect(isManagedAiUsable(view({ entitlementsKnown: false }))).toBe(true)
  })
})
