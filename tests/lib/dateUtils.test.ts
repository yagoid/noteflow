import { describe, it, expect } from 'vitest'
import { firstValidDate, hoursFromNow, sectionEditedDate, TEMP_NOTE_EXPIRY_HOURS } from '../../src/lib/dateUtils'

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

describe('sectionEditedDate', () => {
  const note = { updated: '2026-05-02T00:00:00.000Z' }

  it("prefers the section's own updated", () => {
    expect(sectionEditedDate({ updated: '2026-04-01T09:00:00.000Z' }, note)?.toISOString()).toBe('2026-04-01T09:00:00.000Z')
  })

  it("falls back to the note's updated when the section has none, an unparseable one, or there is no section", () => {
    expect(sectionEditedDate({}, note)?.toISOString()).toBe(note.updated)
    expect(sectionEditedDate({ updated: 'garbage' }, note)?.toISOString()).toBe(note.updated)
    expect(sectionEditedDate(null, note)?.toISOString()).toBe(note.updated)
  })

  it('is null when nothing parses', () => {
    expect(sectionEditedDate({ updated: 'x' }, { updated: 'y' })).toBeNull()
  })
})

describe('hoursFromNow', () => {
  const now = Date.parse('2026-05-01T10:00:00.000Z')

  it('returns the ISO timestamp `hours` after now', () => {
    expect(hoursFromNow(1, now)).toBe('2026-05-01T11:00:00.000Z')
    expect(hoursFromNow(24, now)).toBe('2026-05-02T10:00:00.000Z')
    expect(hoursFromNow(48, now)).toBe('2026-05-03T10:00:00.000Z')
  })

  it('produces a value main\'s expiry check can parse for every offered delay', () => {
    for (const hours of TEMP_NOTE_EXPIRY_HOURS) {
      const iso = hoursFromNow(hours, now)
      expect(new Date(iso).getTime() - now).toBe(hours * 60 * 60 * 1000)
    }
  })
})
