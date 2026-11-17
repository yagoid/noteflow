import { describe, it, expect } from 'vitest'
import {
  followTaskMenu,
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
    expect(taskMenuPosition({ top: 100, bottom: 120, right: 900 }, size, viewport)).toEqual({ top: 126, left: 628, side: 'below' })
  })

  it('flips above when it does not fit below and there is more room above', () => {
    expect(taskMenuPosition({ top: 600, bottom: 620, right: 900 }, size, viewport)).toEqual({ top: 294, left: 628, side: 'above' })
  })

  it('stays below, clamped into the window, when there is more room below', () => {
    const pos = taskMenuPosition({ top: 200, bottom: 220, right: 900 }, { width: 272, height: 700 }, viewport)
    expect(pos.top).toBe(92) // 800 - 8 - 700
  })

  it('in a window smaller than the menu (a 200x200 sticky) it is capped and pinned to the margin', () => {
    const sticky = { width: 200, height: 200 }
    // Measured already capped by the CSS max-width/max-height (184x184)…
    expect(taskMenuPosition({ top: 40, bottom: 60, right: 190 }, { width: 184, height: 184 }, sticky)).toMatchObject({ top: 8, left: 8 })
    // …or not: same result.
    expect(taskMenuPosition({ top: 150, bottom: 170, right: 190 }, { width: 272, height: 300 }, sticky)).toMatchObject({ top: 8, left: 8 })
  })

  it('never leaves the window horizontally', () => {
    expect(taskMenuPosition({ top: 100, bottom: 120, right: 100 }, size, viewport).left).toBe(8)
    expect(taskMenuPosition({ top: 100, bottom: 120, right: 1200 }, size, viewport).left).toBe(720)
  })
})

describe('followTaskMenu', () => {
  const viewport = { width: 1000, height: 800 }
  const size = { width: 272, height: 300 }

  it('keeps its left when the trigger grows to the right (icon to chips)', () => {
    const placed = taskMenuPosition({ top: 100, bottom: 120, right: 900 }, size, viewport)
    // The wider trigger's right edge moved to 960: a fresh placement would move
    // the menu to left 688; following it keeps 628.
    expect(taskMenuPosition({ top: 100, bottom: 120, right: 960 }, size, viewport).left).toBe(688)
    expect(followTaskMenu(placed, { top: 100, bottom: 120 }, size, viewport)).toEqual({ top: 126, left: 628 })
  })

  it('below the trigger, its top follows the trigger on scroll', () => {
    const placed = taskMenuPosition({ top: 100, bottom: 120, right: 900 }, size, viewport)
    expect(followTaskMenu(placed, { top: 60, bottom: 80 }, size, viewport)).toEqual({ top: 86, left: 628 })
  })

  it('above the trigger, its bottom edge stays put when it grows taller', () => {
    const placed = taskMenuPosition({ top: 600, bottom: 620, right: 900 }, size, viewport)
    expect(placed.side).toBe('above')
    const taller = followTaskMenu(placed, { top: 600, bottom: 620 }, { width: 272, height: 340 }, viewport)
    expect(taller.top + 340).toBe(placed.top + 300) // bottom = trigger.top - gap = 594
    expect(taller.left).toBe(placed.left)
  })

  it('above the trigger, it follows the trigger on scroll', () => {
    const placed = taskMenuPosition({ top: 600, bottom: 620, right: 900 }, size, viewport)
    expect(followTaskMenu(placed, { top: 550, bottom: 570 }, size, viewport).top).toBe(placed.top - 50)
  })

  it('is clamped into the window only when it would leave it', () => {
    const below = taskMenuPosition({ top: 100, bottom: 120, right: 900 }, size, viewport)
    // Scrolled so far the trigger is near the bottom: kept inside.
    expect(followTaskMenu(below, { top: 700, bottom: 720 }, size, viewport).top).toBe(492) // 800 - 8 - 300
    const above = taskMenuPosition({ top: 600, bottom: 620, right: 900 }, size, viewport)
    expect(followTaskMenu(above, { top: 100, bottom: 120 }, size, viewport).top).toBe(8)
    // A narrower window pulls the kept left back in.
    expect(followTaskMenu(below, { top: 100, bottom: 120 }, size, { width: 800, height: 800 }).left).toBe(520)
  })

  it('in a 200x200 sticky it stays pinned to the margin', () => {
    const sticky = { width: 200, height: 200 }
    const placed = taskMenuPosition({ top: 40, bottom: 60, right: 190 }, { width: 184, height: 184 }, sticky)
    expect(followTaskMenu(placed, { top: 40, bottom: 60 }, { width: 184, height: 184 }, sticky)).toEqual({ top: 8, left: 8 })
  })
})
