import { describe, it, expect } from 'vitest'
import { firstValidDate } from '../../src/lib/dateUtils'

describe('firstValidDate', () => {
  it('returns the first candidate when it is a valid ISO string', () => {
    const d = firstValidDate('2026-05-01T10:00:00.000Z', '2020-01-01T00:00:00.000Z')
    expect(d?.toISOString()).toBe('2026-05-01T10:00:00.000Z')
  })

  it('falls back past an invalid string (hand-edited frontmatter)', () => {
    const d = firstValidDate('not a date', '2020-01-01T00:00:00.000Z')
    expect(d?.toISOString()).toBe('2020-01-01T00:00:00.000Z')
  })

  it('falls back past undefined / null / empty strings', () => {
    const d = firstValidDate(undefined, null, '', '   ', '2020-01-01T00:00:00.000Z')
    expect(d?.toISOString()).toBe('2020-01-01T00:00:00.000Z')
  })

  it('returns null when no candidate is a valid date', () => {
    expect(firstValidDate('garbage', 'also garbage')).toBeNull()
    expect(firstValidDate()).toBeNull()
    expect(firstValidDate(undefined)).toBeNull()
  })

  it('skips non-date types such as objects and booleans', () => {
    const d = firstValidDate({}, true, '2020-01-01T00:00:00.000Z')
    expect(d?.toISOString()).toBe('2020-01-01T00:00:00.000Z')
  })

  it('accepts Date objects and timestamps, rejecting an Invalid Date', () => {
    expect(firstValidDate(new Date('nope'), 0)?.getTime()).toBe(0)
    const valid = new Date('2021-03-04T05:06:07.000Z')
    expect(firstValidDate(valid)?.getTime()).toBe(valid.getTime())
  })
})
