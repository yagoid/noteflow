import { describe, it, expect } from 'vitest'
import {
  filterGroupPeekEntries,
  flattenGroupPeekEntries,
  groupPeekPosition,
  moveGroupPeekSelection,
  GROUP_PEEK_GAP,
  GROUP_PEEK_MARGIN,
} from '../../src/lib/groupPeek'

function note(id: string, title: string, sections: { name: string; content: string }[] = [], tags: string[] = []) {
  return { id, title, tags, sections }
}

const loose1 = note('l1', 'Roadmap', [{ name: 'Q3', content: 'ship the peek' }])
const loose2 = note('l2', 'Ideas')
const inA = note('a1', 'Meeting notes', [{ name: 'Tasks', content: 'buy milk' }])
const inB1 = note('b1', 'Budget', [], ['finance'])
const inB2 = note('b2', 'Café plan')

const source = {
  notes: [loose1, loose2],
  folders: [
    { folder: { id: 'fa', name: 'Work' }, notes: [inA] },
    { folder: { id: 'fe', name: 'Empty' }, notes: [] },
    { folder: { id: 'fb', name: 'Money' }, notes: [inB1, inB2] },
  ],
}

describe('flattenGroupPeekEntries', () => {
  it('lists loose notes first, then each folder in sidebar order', () => {
    const entries = flattenGroupPeekEntries(source)
    expect(entries.map((e) => e.note.id)).toEqual(['l1', 'l2', 'a1', 'b1', 'b2'])
  })

  it('tags folder notes with their folder and loose notes with null', () => {
    const entries = flattenGroupPeekEntries(source)
    expect(entries.map((e) => e.folder?.name ?? null)).toEqual([null, null, 'Work', 'Money', 'Money'])
    expect(entries[2].folder).toEqual({ id: 'fa', name: 'Work' })
  })

  it('handles a group with only folders, or nothing at all', () => {
    expect(flattenGroupPeekEntries({ notes: [], folders: source.folders }).map((e) => e.note.id)).toEqual(['a1', 'b1', 'b2'])
    expect(flattenGroupPeekEntries({ notes: [], folders: [] })).toEqual([])
  })
})

describe('filterGroupPeekEntries', () => {
  const entries = flattenGroupPeekEntries(source)
  const ids = (query: string) => filterGroupPeekEntries(entries, query).map((e) => e.note.id)

  it('returns the very same array for an empty / blank query', () => {
    expect(filterGroupPeekEntries(entries, '')).toBe(entries)
    expect(filterGroupPeekEntries(entries, '   ')).toBe(entries)
  })

  it('matches title, section names, section bodies and tags (accent-insensitive)', () => {
    expect(ids('road')).toEqual(['l1'])
    expect(ids('tasks')).toEqual(['a1'])
    expect(ids('milk')).toEqual(['a1'])
    expect(ids('finance')).toEqual(['b1'])
    expect(ids('cafe')).toEqual(['b2'])
  })

  it('supports the #section filter of the sidebar search', () => {
    expect(ids('#q3')).toEqual(['l1'])
    expect(ids('#tasks milk')).toEqual(['a1'])
    expect(ids('#tasks roadmap')).toEqual([])
  })

  it('keeps the flat order and returns nothing when nothing matches', () => {
    expect(ids('o')).toEqual(['l1', 'a1'])
    expect(ids('a')).toEqual(['l1', 'l2', 'a1', 'b1', 'b2'])
    expect(ids('zzz')).toEqual([])
  })
})

describe('moveGroupPeekSelection', () => {
  it('moves down and up, wrapping at both ends', () => {
    expect(moveGroupPeekSelection(0, 1, 3)).toBe(1)
    expect(moveGroupPeekSelection(2, 1, 3)).toBe(0)
    expect(moveGroupPeekSelection(0, -1, 3)).toBe(2)
    expect(moveGroupPeekSelection(1, -1, 3)).toBe(0)
  })

  it('starts from the matching end when nothing is selected, and is -1 for an empty list', () => {
    expect(moveGroupPeekSelection(-1, 1, 4)).toBe(0)
    expect(moveGroupPeekSelection(-1, -1, 4)).toBe(3)
    expect(moveGroupPeekSelection(0, 1, 0)).toBe(-1)
  })
})

describe('groupPeekPosition', () => {
  const viewport = { width: 1200, height: 800 }
  const size = { width: 248, height: 300 }

  it('sits right of the sidebar, top level with the header', () => {
    expect(groupPeekPosition({ top: 120, sidebarRight: 260 }, size, viewport))
      .toEqual({ left: 260 + GROUP_PEEK_GAP, top: 120 })
  })

  it('moves up when it does not fit below', () => {
    const pos = groupPeekPosition({ top: 700, sidebarRight: 260 }, size, viewport)
    expect(pos.top).toBe(800 - 300 - GROUP_PEEK_MARGIN)
  })

  it('never goes above the top margin (taller than the viewport)', () => {
    const pos = groupPeekPosition({ top: 50, sidebarRight: 260 }, { width: 248, height: 900 }, viewport)
    expect(pos.top).toBe(GROUP_PEEK_MARGIN)
  })

  it('is pulled back inside a narrow window', () => {
    const pos = groupPeekPosition({ top: 100, sidebarRight: 400 }, size, { width: 500, height: 800 })
    expect(pos.left).toBe(500 - 248 - GROUP_PEEK_MARGIN)
  })

  it('clamps a header scrolled above the viewport', () => {
    expect(groupPeekPosition({ top: -30, sidebarRight: 260 }, size, viewport).top).toBe(GROUP_PEEK_MARGIN)
  })
})
