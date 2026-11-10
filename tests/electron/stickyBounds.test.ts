import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  MAX_STICKY_BOUNDS_ENTRIES,
  createKeyedDebounce,
  isRectVisible,
  rectChanged,
  sanitizeRect,
  sanitizeStickyBounds,
  stickyBoundsKey,
  withStickyBounds,
} from '../../electron/stickyBounds'

// settings.json → stickyBounds: where each sticky (expanded and folded pill) was last
// left on THIS PC. main restores it on open/fold only if it is still on a display.

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1080 }
const RIGHT = { x: 1920, y: 0, width: 1280, height: 1024 }

describe('stickyBounds (main)', () => {
  it('keys a sticky by the note/section it was opened with', () => {
    expect(stickyBoundsKey('n1', 's1')).toBe('n1/s1')
  })

  it('sanitizeRect rounds valid rects and rejects junk', () => {
    expect(sanitizeRect({ x: 10.4, y: -5.6, width: 220, height: 39 })).toEqual({ x: 10, y: -6, width: 220, height: 39 })
    expect(sanitizeRect(null)).toBeNull()
    expect(sanitizeRect({ x: 1, y: 1, width: 0, height: 10 })).toBeNull()
    expect(sanitizeRect({ x: 1, y: 1, width: 10 })).toBeNull()
    expect(sanitizeRect({ x: '1', y: 1, width: 10, height: 10 })).toBeNull()
    expect(sanitizeRect({ x: Infinity, y: 1, width: 10, height: 10 })).toBeNull()
  })

  it('a missing or corrupted value reads as nothing remembered', () => {
    expect(sanitizeStickyBounds(undefined)).toEqual({})
    expect(sanitizeStickyBounds([])).toEqual({})
    expect(sanitizeStickyBounds('x')).toEqual({})
  })

  it('cleans a hand-edited map, keeping only valid parts', () => {
    const raw = {
      'a/1': { expanded: { x: 0, y: 0, width: 300, height: 300 }, folded: { x: 'bad' } },
      'b/2': { folded: { x: 5, y: 5, width: 220, height: 39 } },
      'c/3': { expanded: null },
      'd/4': 42,
    }
    expect(sanitizeStickyBounds(raw)).toEqual({
      'a/1': { expanded: { x: 0, y: 0, width: 300, height: 300 } },
      'b/2': { folded: { x: 5, y: 5, width: 220, height: 39 } },
    })
  })

  it('merges the patch into the entry without losing the other kind', () => {
    const expanded = { x: 100, y: 100, width: 300, height: 400 }
    const folded = { x: 50, y: 900, width: 220, height: 39 }
    const map = withStickyBounds({}, 'n/s', { expanded })
    const next = withStickyBounds(map, 'n/s', { folded })
    expect(next['n/s']).toEqual({ expanded, folded })
    expect(map['n/s']).toEqual({ expanded }) // input not mutated
  })

  it('ignores an invalid patch rect', () => {
    const expanded = { x: 100, y: 100, width: 300, height: 400 }
    const map = withStickyBounds({}, 'n/s', { expanded })
    const next = withStickyBounds(map, 'n/s', { expanded: { x: 0, y: 0, width: -1, height: 5 } })
    expect(next['n/s']).toEqual({ expanded })
  })

  it('is an LRU bounded to the cap: the latest save survives, the oldest goes', () => {
    let map = {}
    const r = { x: 0, y: 0, width: 300, height: 300 }
    for (let i = 0; i < MAX_STICKY_BOUNDS_ENTRIES; i++) map = withStickyBounds(map, `n${i}/s`, { expanded: r })
    map = withStickyBounds(map, 'n0/s', { expanded: r }) // touch the oldest → most recent
    map = withStickyBounds(map, 'new/s', { expanded: r })
    const keys = Object.keys(map)
    expect(keys).toHaveLength(MAX_STICKY_BOUNDS_ENTRIES)
    expect(keys).toContain('n0/s')
    expect(keys).not.toContain('n1/s')
    expect(keys[keys.length - 1]).toBe('new/s')
    // and the order survives a JSON round trip (settings.json)
    expect(Object.keys(sanitizeStickyBounds(JSON.parse(JSON.stringify(map))))).toEqual(keys)
  })

  describe('isRectVisible', () => {
    it('accepts a rect on any connected display', () => {
      expect(isRectVisible({ x: 1690, y: 40, width: 220, height: 39 }, [PRIMARY])).toBe(true)
      expect(isRectVisible({ x: 2500, y: 500, width: 220, height: 39 }, [PRIMARY, RIGHT])).toBe(true)
    })

    it('rejects a rect left on a monitor that is no longer connected', () => {
      expect(isRectVisible({ x: 2500, y: 500, width: 220, height: 39 }, [PRIMARY])).toBe(false)
      expect(isRectVisible({ x: 100, y: 100, width: 300, height: 300 }, [])).toBe(false)
    })

    it('needs at least half of it on one display', () => {
      expect(isRectVisible({ x: 1800, y: 100, width: 200, height: 100 }, [PRIMARY])).toBe(true) // 120/200 in
      expect(isRectVisible({ x: 1850, y: 100, width: 200, height: 100 }, [PRIMARY])).toBe(false) // 70/200 in
    })

    it('needs its top edge (the drag handle) on that display', () => {
      expect(isRectVisible({ x: 100, y: -20, width: 300, height: 300 }, [PRIMARY])).toBe(false)
      expect(isRectVisible({ x: 100, y: 0, width: 300, height: 300 }, [PRIMARY])).toBe(true)
    })
  })

  it('rectChanged tolerates a couple of px of rounding', () => {
    const a = { x: 10, y: 10, width: 220, height: 39 }
    expect(rectChanged(a, { ...a, x: 12 })).toBe(false)
    expect(rectChanged(a, { ...a, y: 40 })).toBe(true)
    expect(rectChanged(a, { ...a, width: 300 })).toBe(true)
  })

  describe('createKeyedDebounce', () => {
    afterEach(() => { vi.useRealTimers() })

    it('a burst of events per key ends in one trailing call', () => {
      vi.useFakeTimers()
      const d = createKeyedDebounce<number>(400)
      const calls: string[] = []
      for (let i = 0; i < 20; i++) {
        d.schedule(1, () => calls.push(`a${i}`))
        vi.advanceTimersByTime(50)
      }
      d.schedule(2, () => calls.push('b'))
      expect(calls).toEqual([])
      vi.advanceTimersByTime(400)
      expect(calls).toEqual(['a19', 'b'])
    })

    it('flush runs the pending call now, once; cancel drops it', () => {
      vi.useFakeTimers()
      const d = createKeyedDebounce<number>(400)
      const calls: string[] = []
      d.schedule(1, () => calls.push('a'))
      d.flush(1)
      d.flush(1) // nothing pending any more
      d.schedule(2, () => calls.push('b'))
      d.cancel(2)
      vi.advanceTimersByTime(1000)
      expect(calls).toEqual(['a'])
    })
  })
})
