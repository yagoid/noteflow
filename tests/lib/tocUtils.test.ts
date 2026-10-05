import { describe, it, expect } from 'vitest'
import {
  activeDashIndex,
  buildTocItems,
  pickActiveHeading,
  pickIndicatorDashes,
  tocDashGap,
  tocSignature,
} from '../../src/lib/tocUtils'

describe('buildTocItems', () => {
  it('keeps H1–H3 in document order with indentation by level', () => {
    const items = buildTocItems([
      { level: 1, text: 'Intro', pos: 0 },
      { level: 2, text: 'Setup', pos: 10 },
      { level: 3, text: 'Details', pos: 20 },
      { level: 2, text: 'Usage', pos: 30 },
    ])
    expect(items.map(i => [i.text, i.depth])).toEqual([
      ['Intro', 0],
      ['Setup', 1],
      ['Details', 2],
      ['Usage', 1],
    ])
    expect(items[2]).toEqual({ level: 3, text: 'Details', pos: 20, depth: 2 })
  })

  it('indents relative to the shallowest level present', () => {
    const items = buildTocItems([
      { level: 2, text: 'A', pos: 0 },
      { level: 3, text: 'B', pos: 5 },
    ])
    expect(items.map(i => i.depth)).toEqual([0, 1])
  })

  it('ignores empty headings and levels outside 1–3', () => {
    const items = buildTocItems([
      { level: 1, text: '   ', pos: 0 },
      { level: 2, text: '', pos: 2 },
      { level: 4, text: 'Deep', pos: 4 },
      { level: 3, text: 'Kept', pos: 6 },
    ])
    expect(items).toEqual([{ level: 3, text: 'Kept', pos: 6, depth: 0 }])
  })

  it('collapses inner whitespace and trims', () => {
    expect(buildTocItems([{ level: 1, text: '  Hello \n  world ', pos: 0 }])[0].text).toBe('Hello world')
  })

  it('returns [] when there are no headings', () => {
    expect(buildTocItems([])).toEqual([])
  })
})

describe('tocSignature', () => {
  it('changes only when a heading level, position or text changes', () => {
    const a = buildTocItems([{ level: 1, text: 'A', pos: 0 }])
    expect(tocSignature(a)).toBe(tocSignature(buildTocItems([{ level: 1, text: 'A', pos: 0 }])))
    expect(tocSignature(a)).not.toBe(tocSignature(buildTocItems([{ level: 2, text: 'A', pos: 0 }])))
    expect(tocSignature(a)).not.toBe(tocSignature(buildTocItems([{ level: 1, text: 'A', pos: 3 }])))
    expect(tocSignature(a)).not.toBe(tocSignature(buildTocItems([{ level: 1, text: 'B', pos: 0 }])))
  })
})

describe('pickActiveHeading', () => {
  const opts = { threshold: 60, atBottom: false, viewportHeight: 500 }

  it('is -1 while the reader is above the first heading', () => {
    expect(pickActiveHeading([100, 400, 900], opts)).toBe(-1)
  })

  it('picks the last heading that crossed the threshold', () => {
    expect(pickActiveHeading([-300, 20, 400], opts)).toBe(1)
    expect(pickActiveHeading([-300, -100, 60], opts)).toBe(2)
  })

  it('at the bottom of the scroll, picks the last visible heading', () => {
    expect(pickActiveHeading([-300, 200, 450], { ...opts, atBottom: true })).toBe(2)
    expect(pickActiveHeading([-300, 200, 650], { ...opts, atBottom: true })).toBe(1)
  })

  it('handles an empty list', () => {
    expect(pickActiveHeading([], opts)).toBe(-1)
    expect(pickActiveHeading([], { ...opts, atBottom: true })).toBe(-1)
  })
})

/** Outline built from a list of levels (pos = index). */
function outline(levels: number[]) {
  return buildTocItems(levels.map((level, i) => ({ level, text: `H${i}`, pos: i })))
}

describe('pickIndicatorDashes', () => {
  it('gives every entry a dash when they fit', () => {
    expect(pickIndicatorDashes(outline([1, 2, 3, 2]), 10)).toEqual([0, 1, 2, 3])
  })

  it('drops the deepest levels first when there are too many', () => {
    // 2 H1 + 2 H2 + 4 H3 = 8 entries, max 4 → only H1+H2 survive.
    const items = outline([1, 2, 3, 3, 1, 2, 3, 3])
    expect(pickIndicatorDashes(items, 4)).toEqual([0, 1, 4, 5])
    // max 2 → only the H1s.
    expect(pickIndicatorDashes(items, 2)).toEqual([0, 4])
  })

  it('samples the outermost level evenly when even it does not fit', () => {
    const items = outline(Array(9).fill(2))
    const dashes = pickIndicatorDashes(items, 3)
    expect(dashes).toEqual([0, 4, 8])
    expect(new Set(dashes).size).toBe(dashes.length)
  })

  it('never returns more than max dashes', () => {
    const items = outline(Array.from({ length: 200 }, (_, i) => (i % 3) + 1))
    const dashes = pickIndicatorDashes(items, 40)
    expect(dashes.length).toBeLessThanOrEqual(40)
    expect([...dashes].sort((a, b) => a - b)).toEqual(dashes)
  })
})

describe('activeDashIndex', () => {
  it('maps the active entry to its own dash or the closest one before it', () => {
    expect(activeDashIndex([0, 1, 4, 5], 4)).toBe(4)
    expect(activeDashIndex([0, 1, 4, 5], 3)).toBe(1)
    expect(activeDashIndex([0, 1, 4, 5], 7)).toBe(5)
  })

  it('is -1 when nothing is active or no dash precedes it', () => {
    expect(activeDashIndex([0, 1], -1)).toBe(-1)
    expect(activeDashIndex([2, 3], 1)).toBe(-1)
  })
})

describe('tocDashGap', () => {
  it('tightens the gap for long outlines', () => {
    expect(tocDashGap(5)).toBeGreaterThan(tocDashGap(30))
  })
})
