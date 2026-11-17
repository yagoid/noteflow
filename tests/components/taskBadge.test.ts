import { describe, it, expect } from 'vitest'
import {
  isCommittableDue,
  localISO,
  quickDueDate,
  taskMenuPosition,
} from '../../src/components/Editor/taskBadge'

// Local dates (month is 0-based): 2026-11-16 is a Monday.
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h)
const quick = (kind: Parameters<typeof quickDueDate>[0], from: Date) => localISO(quickDueDate(kind, from))

describe('quickDueDate', () => {
  it('today and tomorrow count from the local day, whatever the hour', () => {
    expect(quick('today', at(2026, 11, 17, 23))).toBe('2026-11-17')
    expect(quick('tomorrow', at(2026, 11, 17, 23))).toBe('2026-11-18')
  })

  it('tomorrow crosses month and year ends', () => {
    expect(quick('tomorrow', at(2026, 11, 30))).toBe('2026-12-01')
    expect(quick('tomorrow', at(2026, 12, 31))).toBe('2027-01-01')
  })

  it('next week is the next Monday', () => {
    expect(quick('nextWeek', at(2026, 11, 17))).toBe('2026-11-23') // Tuesday
    expect(quick('nextWeek', at(2026, 11, 21))).toBe('2026-11-23') // Saturday
  })

  it('next week from a Monday is a week ahead, from a Sunday it is tomorrow', () => {
    expect(quick('nextWeek', at(2026, 11, 16))).toBe('2026-11-23')
    expect(quick('nextWeek', at(2026, 11, 22))).toBe('2026-11-23')
  })
})

describe('isCommittableDue', () => {
  it('accepts complete dates', () => {
    expect(isCommittableDue('2026-11-17')).toBe(true)
    expect(isCommittableDue('1900-01-01')).toBe(true)
  })

  it('rejects the partial years a date input reports while typing, and empty values', () => {
    expect(isCommittableDue('0002-11-17')).toBe(false)
    expect(isCommittableDue('0202-11-17')).toBe(false)
    expect(isCommittableDue('')).toBe(false)
    expect(isCommittableDue('2026-11')).toBe(false)
  })
})

describe('taskMenuPosition', () => {
  const viewport = { width: 1000, height: 800 }
  const size = { width: 272, height: 300 }

  it('opens below the trigger, right edges aligned', () => {
    expect(taskMenuPosition({ top: 100, bottom: 120, right: 900 }, size, viewport)).toEqual({ top: 126, left: 628 })
  })

  it('flips above when it does not fit below and there is more room above', () => {
    expect(taskMenuPosition({ top: 600, bottom: 620, right: 900 }, size, viewport)).toEqual({ top: 294, left: 628 })
  })

  it('stays below, clamped into the window, when there is more room below', () => {
    const pos = taskMenuPosition({ top: 200, bottom: 220, right: 900 }, { width: 272, height: 700 }, viewport)
    expect(pos.top).toBe(92) // 800 - 8 - 700
  })

  it('in a window smaller than the menu (a 200x200 sticky) it is capped and pinned to the margin', () => {
    const sticky = { width: 200, height: 200 }
    // Measured already capped by the CSS max-width/max-height (184x184)…
    expect(taskMenuPosition({ top: 40, bottom: 60, right: 190 }, { width: 184, height: 184 }, sticky)).toEqual({ top: 8, left: 8 })
    // …or not: same result.
    expect(taskMenuPosition({ top: 150, bottom: 170, right: 190 }, { width: 272, height: 300 }, sticky)).toEqual({ top: 8, left: 8 })
  })

  it('never leaves the window horizontally', () => {
    expect(taskMenuPosition({ top: 100, bottom: 120, right: 100 }, size, viewport).left).toBe(8)
    expect(taskMenuPosition({ top: 100, bottom: 120, right: 1200 }, size, viewport).left).toBe(720)
  })
})
