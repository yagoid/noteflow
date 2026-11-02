import { describe, it, expect } from 'vitest'
import {
  SECTION_MAP_MAX_ROWS,
  contrastRatio,
  countRows,
  mixRgb,
  parseRgbTriple,
  pickReadableInk,
  planSectionMap,
  relativeLuminance,
  visibleSectionIndices,
  type Rgb,
} from '../../src/lib/sectionMap'

describe('countRows', () => {
  it('packs items greedily with the gap, like flex-wrap', () => {
    // 100 + 4 + 100 = 204 fits in 210; the third one wraps.
    expect(countRows([100, 100, 100], 210, 4)).toBe(2)
    expect(countRows([100, 100, 100], 400, 4)).toBe(1)
  })

  it('is 0 for no items and gives an oversized item a row of its own', () => {
    expect(countRows([], 300, 4)).toBe(0)
    expect(countRows([500, 50], 300, 4)).toBe(2)
  })

  it('errs on "does not fit" at the exact edge (sub-pixel slack)', () => {
    // 100 + 4 + 96 = 200 exactly: treated as not fitting, never a hidden extra row.
    expect(countRows([100, 96], 200, 4)).toBe(2)
    expect(countRows([100, 95], 200, 4)).toBe(1)
  })
})

describe('visibleSectionIndices', () => {
  it('shows the first N when the pinned sections are among them', () => {
    expect(visibleSectionIndices(6, [1], 3)).toEqual([0, 1, 2])
  })

  it('promotes a hidden active section to the last visible slot', () => {
    expect(visibleSectionIndices(6, [4], 3)).toEqual([0, 1, 4])
  })

  it('keeps several pins, replacing the last unpinned slots', () => {
    // Active #1 is visible; the renamed #5 takes the slot of #2.
    expect(visibleSectionIndices(6, [1, 5], 3)).toEqual([0, 1, 5])
    // Both hidden: they take the last two slots, in data order.
    expect(visibleSectionIndices(6, [5, 3], 3)).toEqual([0, 3, 5])
    // A pin in the last slot is not dropped to make room for another.
    expect(visibleSectionIndices(6, [2, 4], 3)).toEqual([0, 2, 4])
  })

  it('raises the count to the pins and ignores invalid ones', () => {
    expect(visibleSectionIndices(6, [4, 5], 1)).toEqual([4, 5])
    expect(visibleSectionIndices(3, [-1], 10)).toEqual([0, 1, 2])
    expect(visibleSectionIndices(3, [7], 2)).toEqual([0, 1])
    expect(visibleSectionIndices(0, [0], 3)).toEqual([])
  })
})

describe('planSectionMap', () => {
  const base = { addWidth: 32, moreWidth: 70, gap: 4 }

  it('shows everything when tabs + "+" fit in the row cap', () => {
    const plan = planSectionMap({ ...base, tabWidths: [100, 100, 100], pinned: [0], containerWidth: 400 })
    expect(plan).toEqual({ visibleCount: 3, overflowing: false })
  })

  it('shows everything while the container has no width yet', () => {
    const plan = planSectionMap({ ...base, tabWidths: Array(40).fill(100), pinned: [0], containerWidth: 0 })
    expect(plan).toEqual({ visibleCount: 40, overflowing: false })
  })

  it('folds the rest into "+N more" past the cap, keeping "+N more" and "+" inside it', () => {
    // 2 tabs of 100 per 210px row; 3 rows. Folded: the 3rd row must hold "+N more" (70)
    // and "+" (32) → 100 + 4 + 70 = 174, + 4 + 32 = 210 > 209.5 → one tab less there.
    const plan = planSectionMap({ ...base, tabWidths: Array(10).fill(100), pinned: [0], containerWidth: 210 })
    expect(plan.overflowing).toBe(true)
    expect(plan.visibleCount).toBe(4)
    const widths = [...Array(plan.visibleCount).fill(100), base.moreWidth, base.addWidth]
    expect(countRows(widths, 210, base.gap)).toBeLessThanOrEqual(SECTION_MAP_MAX_ROWS)
  })

  it('measures with the active tab in its slot when it is promoted', () => {
    // Narrow tabs except a wide active one at the end: the plan must budget its width.
    const tabWidths = [...Array(12).fill(60), 300]
    const plan = planSectionMap({ ...base, tabWidths, pinned: [12], containerWidth: 320 })
    expect(plan.overflowing).toBe(true)
    const shown = visibleSectionIndices(tabWidths.length, [12], plan.visibleCount)
    expect(shown[shown.length - 1]).toBe(12)
    const widths = [...shown.map((i) => tabWidths[i]), base.moreWidth, base.addWidth]
    expect(countRows(widths, 320, base.gap)).toBeLessThanOrEqual(SECTION_MAP_MAX_ROWS)
  })

  it('always keeps at least the pinned sections', () => {
    const tabWidths = [400, 400, 400, 400, 400]
    expect(planSectionMap({ ...base, tabWidths, pinned: [2], containerWidth: 100 }))
      .toEqual({ visibleCount: 1, overflowing: true })
    expect(planSectionMap({ ...base, tabWidths, pinned: [2, 4], containerWidth: 100 }))
      .toEqual({ visibleCount: 2, overflowing: true })
    expect(planSectionMap({ ...base, tabWidths, pinned: [], containerWidth: 100 }))
      .toEqual({ visibleCount: 1, overflowing: true })
  })

  it('honours a custom row cap', () => {
    const plan = planSectionMap({ ...base, tabWidths: [100, 100, 100], pinned: [0], containerWidth: 210, maxRows: 1 })
    expect(plan.overflowing).toBe(true)
    expect(plan.visibleCount).toBe(1)
  })
})

describe('colour helpers', () => {
  const black: Rgb = [0, 0, 0]
  const white: Rgb = [255, 255, 255]

  it('parses theme channel triples', () => {
    expect(parseRgbTriple(' 245 166 35 ')).toEqual([245, 166, 35])
    expect(parseRgbTriple('1, 2, 3')).toEqual([1, 2, 3])
    expect(parseRgbTriple('')).toBeNull()
    expect(parseRgbTriple('red')).toBeNull()
    expect(parseRgbTriple('1 2')).toBeNull()
  })

  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance(black)).toBe(0)
    expect(relativeLuminance(white)).toBeCloseTo(1, 5)
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5)
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5)
  })

  it('mixes like color-mix', () => {
    expect(mixRgb([200, 100, 0], [0, 100, 200], 0.5)).toEqual([100, 100, 100])
    expect(mixRgb([10, 20, 30], [0, 0, 0], 1)).toEqual([10, 20, 30])
  })

  it('picks dark ink on a bright section colour of a dark theme', () => {
    const bg0: Rgb = [12, 12, 17] // NoteFlow Dark --bg-0
    const text: Rgb = [236, 234, 224] // --text
    expect(pickReadableInk([245, 166, 35], [bg0, text])).toBe(0)
  })

  it('picks the dark --text on a mid amber of a light theme', () => {
    const bg0: Rgb = [231, 223, 204] // NoteFlow Light --bg-0 (parchment)
    const text: Rgb = [42, 38, 32] // --text
    expect(pickReadableInk([184, 117, 20], [bg0, text])).toBe(1)
  })

  it('keeps the first ink on a tie', () => {
    expect(pickReadableInk([128, 128, 128], [white, white])).toBe(0)
  })
})
