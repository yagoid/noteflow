import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  clearForcedRestore,
  expireForcedRestore,
  markForcedRestore,
  pendingForcedRestore,
} from '../../src/lib/sectionRestore'

afterEach(() => {
  vi.useRealTimers()
})

describe('forced restore marks', () => {
  it('an editor of the section applies a matching mark once', () => {
    const token = markForcedRestore('n1', 's1', 'old text')
    const mark = pendingForcedRestore('n1', 's1', 'old text', null)
    expect(mark).toMatchObject({ noteId: 'n1', sectionId: 's1', content: 'old text', token })
    // Applied → the same editor doesn't apply it again; another editor (no token yet) does.
    expect(pendingForcedRestore('n1', 's1', 'old text', token)).toBeNull()
    expect(pendingForcedRestore('n1', 's1', 'old text', token - 1)).not.toBeNull()
    clearForcedRestore(token)
  })

  it('only for that section and that content (line endings aside)', () => {
    const token = markForcedRestore('n1', 's1', 'a\nb')
    expect(pendingForcedRestore('n1', 's2', 'a\nb', null)).toBeNull()
    expect(pendingForcedRestore('n2', 's1', 'a\nb', null)).toBeNull()
    expect(pendingForcedRestore('n1', 's1', 'something else', null)).toBeNull()
    expect(pendingForcedRestore('n1', 's1', 'a\r\nb', null)).not.toBeNull()
    expect(pendingForcedRestore('n1', null, 'a\nb', null)).toBeNull()
    clearForcedRestore(token)
  })

  it('a new mark of the section replaces the older one', () => {
    const first = markForcedRestore('n1', 's1', 'v1')
    const second = markForcedRestore('n1', 's1', 'v2')
    expect(second).not.toBe(first)
    expect(pendingForcedRestore('n1', 's1', 'v1', null)).toBeNull()
    expect(pendingForcedRestore('n1', 's1', 'v2', null)?.token).toBe(second)
    clearForcedRestore(first) // stale token: no effect on the current mark
    expect(pendingForcedRestore('n1', 's1', 'v2', null)).not.toBeNull()
    clearForcedRestore(second)
    expect(pendingForcedRestore('n1', 's1', 'v2', null)).toBeNull()
  })

  it('expires after its TTL', () => {
    vi.useFakeTimers()
    const token = markForcedRestore('n1', 's1', 'x')
    expireForcedRestore(token, 1000)
    vi.advanceTimersByTime(999)
    expect(pendingForcedRestore('n1', 's1', 'x', null)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(pendingForcedRestore('n1', 's1', 'x', null)).toBeNull()
  })
})
