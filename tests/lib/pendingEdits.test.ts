import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebouncedSave, flushPendingEdits, hasPendingEdits } from '../../src/lib/pendingEdits'

describe('pendingEdits', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    flushPendingEdits()
    vi.useRealTimers()
  })

  it('debounces: only the last scheduled save runs, once, after the delay', () => {
    const slot = createDebouncedSave()
    const saves: string[] = []
    slot.schedule('n1', 400, () => saves.push('a'))
    slot.schedule('n1', 400, () => saves.push('ab'))
    expect(hasPendingEdits('n1')).toBe(true)
    vi.advanceTimersByTime(399)
    expect(saves).toEqual([])
    vi.advanceTimersByTime(1)
    expect(saves).toEqual(['ab'])
    expect(hasPendingEdits('n1')).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(saves).toEqual(['ab'])
  })

  it('flushPendingEdits(noteId) runs that note\'s saves now, and only once', () => {
    const a = createDebouncedSave()
    const b = createDebouncedSave()
    const saves: string[] = []
    a.schedule('n1', 400, () => saves.push('n1'))
    b.schedule('n2', 600, () => saves.push('n2'))
    flushPendingEdits('n1')
    expect(saves).toEqual(['n1'])
    expect(hasPendingEdits('n1')).toBe(false)
    expect(hasPendingEdits('n2')).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(saves).toEqual(['n1', 'n2'])
  })

  it('flushPendingEdits() with no note flushes every pending save', () => {
    const a = createDebouncedSave()
    const b = createDebouncedSave()
    const saves: string[] = []
    a.schedule('n1', 400, () => saves.push('n1'))
    b.schedule('n2', 600, () => saves.push('n2'))
    flushPendingEdits()
    expect(saves.sort()).toEqual(['n1', 'n2'])
  })

  it('cancel drops the save; flush on an idle slot is a no-op', () => {
    const slot = createDebouncedSave()
    const saves: string[] = []
    slot.schedule('n1', 400, () => saves.push('x'))
    slot.cancel()
    expect(hasPendingEdits('n1')).toBe(false)
    slot.flush()
    vi.advanceTimersByTime(1000)
    expect(saves).toEqual([])
  })

  it('runs (does not drop) a pending save for another target when rescheduled', () => {
    const slot = createDebouncedSave()
    const saves: string[] = []
    slot.schedule('old-note', 600, () => saves.push('old'), 'old-note/s1')
    slot.schedule('old-note', 600, () => saves.push('old other section'), 'old-note/s2')
    expect(saves).toEqual(['old'])
    slot.schedule('new-note', 600, () => saves.push('new'))
    expect(saves).toEqual(['old', 'old other section'])
    expect(hasPendingEdits('old-note')).toBe(false)
    expect(hasPendingEdits('new-note')).toBe(true)
    vi.advanceTimersByTime(600)
    expect(saves).toEqual(['old', 'old other section', 'new'])
  })
})
