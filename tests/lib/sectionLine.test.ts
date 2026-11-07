import { describe, it, expect } from 'vitest'
import { SECTION_LINE_MIN_SHARE, resolveOpenSectionId, sectionLineWeights } from '../../src/lib/sectionLine'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('sectionLineWeights', () => {
  it('is empty without sections', () => {
    expect(sectionLineWeights([])).toEqual([])
  })

  it('is proportional to the sizes and sums to 1', () => {
    const w = sectionLineWeights([100, 300])
    expect(w[0]).toBeCloseTo(0.25)
    expect(w[1]).toBeCloseTo(0.75)
    expect(sum(w)).toBeCloseTo(1)
  })

  it('splits equally when there is no size at all (empty or locked content)', () => {
    expect(sectionLineWeights([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3])
  })

  it('gives an empty section beside a long one a minimum share', () => {
    const w = sectionLineWeights([0, 10_000])
    expect(w[0]).toBeGreaterThan(0)
    expect(w[0]).toBeCloseTo(SECTION_LINE_MIN_SHARE / (1 + SECTION_LINE_MIN_SHARE))
    expect(sum(w)).toBeCloseTo(1)
  })

  it('never floors above an equal split with many sections', () => {
    const w = sectionLineWeights(Array.from({ length: 100 }, (_, i) => (i === 0 ? 1000 : 0)))
    expect(sum(w)).toBeCloseTo(1)
    expect(w[0]).toBeGreaterThan(w[1])
    expect(w[1]).toBeGreaterThan(0)
  })

  it('treats negative or non-finite sizes as zero', () => {
    expect(sectionLineWeights([-5, Number.NaN])).toEqual([0.5, 0.5])
  })
})

describe('resolveOpenSectionId', () => {
  const ids = ['a', 'b', 'c']

  it('prefers the pane section, then the remembered one, then the first', () => {
    expect(resolveOpenSectionId(ids, 'b', 'c')).toBe('b')
    expect(resolveOpenSectionId(ids, 'gone', 'c')).toBe('c')
    expect(resolveOpenSectionId(ids, '', null)).toBe('a')
  })

  it('without a pane on the note only trusts the remembered section', () => {
    expect(resolveOpenSectionId(ids, null, 'c')).toBe('c')
    expect(resolveOpenSectionId(ids, null, 'gone')).toBeNull()
    expect(resolveOpenSectionId(ids, null, null)).toBeNull()
  })

  it('is null for a note without sections', () => {
    expect(resolveOpenSectionId([], '', null)).toBeNull()
  })
})
