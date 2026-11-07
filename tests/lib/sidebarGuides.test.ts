import { describe, it, expect } from 'vitest'
import {
  CURSOR_LEFT_FOLDER,
  CURSOR_LEFT_GROUP,
  STAGGER_CAP,
  dropChangesPlace,
  guideCursorBox,
  offsetTopWithin,
  staggerStep,
  toggledIds,
  type OffsetNode,
} from '../../src/lib/sidebarGuides'

describe('guideCursorBox', () => {
  it('insets the cursor 7 px at each end of the row, on the group guide', () => {
    expect(guideCursorBox(40, 30, false)).toEqual({ top: 47, height: 16, left: CURSOR_LEFT_GROUP })
  })

  it('moves to the folder guide for a note inside a folder', () => {
    expect(guideCursorBox(0, 50, true).left).toBe(CURSOR_LEFT_FOLDER)
  })

  it('never collapses below a visible minimum', () => {
    expect(guideCursorBox(0, 10, false).height).toBe(4)
  })
})

describe('offsetTopWithin', () => {
  const body: OffsetNode = { offsetTop: 500, offsetParent: null }
  const folder: OffsetNode = { offsetTop: 60, offsetParent: body }
  const row: OffsetNode = { offsetTop: 24, offsetParent: folder }

  it('adds the offsets up to the ancestor (excluded)', () => {
    expect(offsetTopWithin(row, body)).toBe(84)
    expect(offsetTopWithin(folder, body)).toBe(60)
  })

  it('is 0 for the ancestor itself', () => {
    expect(offsetTopWithin(body, body)).toBe(0)
  })

  it('is null when the ancestor is not on the chain', () => {
    const other: OffsetNode = { offsetTop: 0, offsetParent: null }
    expect(offsetTopWithin(row, other)).toBeNull()
    expect(offsetTopWithin(null, body)).toBeNull()
  })
})

describe('toggledIds', () => {
  it('lists what was added and what was removed', () => {
    expect(toggledIds(new Set(['a', 'b']), new Set(['b', 'c'])).sort()).toEqual(['a', 'c'])
  })

  it('is empty for the same set', () => {
    const s = new Set(['a'])
    expect(toggledIds(s, s)).toEqual([])
    expect(toggledIds(s, new Set(['a']))).toEqual([])
  })
})

describe('staggerStep', () => {
  it('keeps small indices and caps the rest', () => {
    expect(staggerStep(0)).toBe(0)
    expect(staggerStep(3)).toBe(3)
    expect(staggerStep(99)).toBe(STAGGER_CAP)
    expect(staggerStep(-2)).toBe(0)
  })
})

describe('dropChangesPlace', () => {
  it('is false when the note already sits at the group root', () => {
    expect(dropChangesPlace({ group: 'g' }, 'g', undefined)).toBe(false)
  })

  it('is false when the note already sits in that folder', () => {
    expect(dropChangesPlace({ group: 'g', folder: 'f' }, 'g', 'f')).toBe(false)
  })

  it('is true across groups, into a folder, or out of one', () => {
    expect(dropChangesPlace({ group: 'a' }, 'g', undefined)).toBe(true)
    expect(dropChangesPlace({ group: 'g' }, 'g', 'f')).toBe(true)
    expect(dropChangesPlace({ group: 'g', folder: 'f' }, 'g', undefined)).toBe(true)
    expect(dropChangesPlace({}, 'g', undefined)).toBe(true)
  })

  it('shows the slot when the dragged note is unknown', () => {
    expect(dropChangesPlace(null, 'g', undefined)).toBe(true)
  })
})
