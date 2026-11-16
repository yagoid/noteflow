import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebouncedSave, discardPendingEdits, flushPendingEdits, hasPendingEdits } from '../../src/lib/pendingEdits'

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

  it('discardPendingEdits(noteId) drops the saves of that note without running them — not the others', () => {
    const title = createDebouncedSave()
    const body = createDebouncedSave()
    const other = createDebouncedSave()
    const saves: string[] = []
    title.schedule('n1', 300, () => saves.push('n1 title'), 'n1/title')
    body.schedule('n1', 400, () => saves.push('n1 body'), 'n1/s1')
    other.schedule('n2', 400, () => saves.push('n2'))
    discardPendingEdits('n1')
    expect(saves).toEqual([])
    expect(hasPendingEdits('n1')).toBe(false)
    expect(title.isPending()).toBe(false)
    expect(body.isPending()).toBe(false)
    expect(hasPendingEdits('n2')).toBe(true)
    // Neither the timer nor a later flush (an editor unmounting) runs a dropped save.
    title.flush()
    flushPendingEdits('n1')
    vi.advanceTimersByTime(1000)
    expect(saves).toEqual(['n2'])
    // The slot is usable again (the same note back after a pull).
    body.schedule('n1', 400, () => saves.push('n1 again'))
    vi.advanceTimersByTime(400)
    expect(saves).toEqual(['n2', 'n1 again'])
  })

  it('tells the save whether its timer elapsed or it was flushed', () => {
    const slot = createDebouncedSave()
    const runs: string[] = []
    slot.schedule('n1', 400, (run) => runs.push(run))
    vi.advanceTimersByTime(400)
    slot.schedule('n1', 400, (run) => runs.push(run))
    slot.flush()
    slot.schedule('n1', 400, (run) => runs.push(run))
    flushPendingEdits('n1') // window closing / pruning
    slot.schedule('a', 400, (run) => runs.push(run), 'a/s1')
    slot.schedule('a', 400, () => {}, 'a/s2') // another target runs the pending one now
    expect(runs).toEqual(['timer', 'flush', 'flush', 'flush'])
  })

  it('isPending reflects an armed debounce (false again once it ran, was flushed or cancelled)', () => {
    const slot = createDebouncedSave()
    let seenWhileRunning: boolean | null = null
    expect(slot.isPending()).toBe(false)
    slot.schedule('n1', 400, () => { seenWhileRunning = slot.isPending() })
    expect(slot.isPending()).toBe(true)
    vi.advanceTimersByTime(400)
    expect(slot.isPending()).toBe(false)
    expect(seenWhileRunning).toBe(false)
    slot.schedule('n1', 400, () => {})
    slot.flush()
    expect(slot.isPending()).toBe(false)
    slot.schedule('n1', 400, () => {})
    slot.cancel()
    expect(slot.isPending()).toBe(false)
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
