import { describe, it, expect } from 'vitest'
import {
  buildMiniSidebarRows,
  floatingSidebarBounds,
  isSidebarFolderShown,
  isSidebarGroupShown,
  miniActiveRowIndex,
  miniRowsSignature,
  miniSidebarCapacity,
  miniSidebarWindow,
  orderFavorites,
  pickSidebarAnchor,
  FLOATING_SIDEBAR_INSET,
  FLOATING_SIDEBAR_MIN_HEIGHT,
  MINI_ROW_GAP,
  MINI_ROW_HEIGHT,
  type MiniSidebarSource,
  type MiniNoteLike,
} from '../../src/lib/miniSidebar'
import type { GroupColor } from '../../src/types'

const note = (id: string, ...sections: string[]): MiniNoteLike => ({ id, sections: sections.map((name) => ({ name })) })
const colorOf = (name: string): GroupColor => (name === 'todo' ? '--red' : '--cyan')

function source(partial: Partial<MiniSidebarSource>): MiniSidebarSource {
  return {
    favorites: [],
    items: [],
    collapsedGroupIds: new Set(),
    collapsedFolderIds: new Set(),
    hasActiveFilters: false,
    showArchived: false,
    ...partial,
  }
}

const kinds = (src: MiniSidebarSource) => buildMiniSidebarRows(src, colorOf).map((r) => r.key)

describe('orderFavorites', () => {
  it('follows the saved order, then appends favorites missing from it', () => {
    const favs = [note('a'), note('b'), note('c')]
    expect(orderFavorites(favs, ['c', 'x', 'a']).map((n) => n.id)).toEqual(['c', 'a', 'b'])
  })

  it('keeps list order without a saved order', () => {
    expect(orderFavorites([note('a'), note('b')], undefined).map((n) => n.id)).toEqual(['a', 'b'])
  })
})

describe('isSidebarGroupShown / isSidebarFolderShown', () => {
  it('hides groups emptied by filters and archived groups unless showing archived', () => {
    const empty = { group: {}, visibleCount: 0 }
    const archived = { group: { archived: true }, visibleCount: 3 }
    expect(isSidebarGroupShown(empty, { hasActiveFilters: false, showArchived: false })).toBe(true)
    expect(isSidebarGroupShown(empty, { hasActiveFilters: true, showArchived: false })).toBe(false)
    expect(isSidebarGroupShown(archived, { hasActiveFilters: false, showArchived: false })).toBe(false)
    expect(isSidebarGroupShown(archived, { hasActiveFilters: false, showArchived: true })).toBe(true)
  })

  it('hides empty folders only while filtering', () => {
    expect(isSidebarFolderShown(0, false)).toBe(true)
    expect(isSidebarFolderShown(0, true)).toBe(false)
    expect(isSidebarFolderShown(2, true)).toBe(true)
  })
})

describe('buildMiniSidebarRows', () => {
  const group = {
    kind: 'group' as const,
    group: { id: 'g1', color: '--purple' as GroupColor },
    notes: [note('n1', 'todo', 'a', 'b', 'c')],
    folders: [{ folder: { id: 'f1' }, notes: [note('n2')] }],
    visibleCount: 2,
  }

  it('mirrors the list: headers as separators, group → loose notes → folder → folder notes, then ungrouped', () => {
    const rows = buildMiniSidebarRows(
      source({ favorites: [note('n3')], items: [group, { kind: 'note', note: note('n3') }] }),
      colorOf,
    )
    expect(rows.map((r) => r.key)).toEqual([
      'sep:favorites', 'fav:n3',
      'sep:groups', 'group:g1', 'note:n1', 'folder:f1', 'note:n2',
      'sep:notes', 'note:n3',
    ])
    const n1 = rows.find((r) => r.key === 'note:n1')
    expect(n1).toMatchObject({ kind: 'note', depth: 1, guide: '--purple', colors: ['--red', '--cyan', '--cyan'] })
    expect(rows.find((r) => r.key === 'note:n2')).toMatchObject({ depth: 2, guide: '--purple' })
    expect(rows.find((r) => r.key === 'note:n3')).toMatchObject({ depth: 0, guide: null, favorite: false })
  })

  it('omits the notes header for a flat list with nothing above it', () => {
    expect(kinds(source({ items: [{ kind: 'note', note: note('a') }, { kind: 'note', note: note('b') }] })))
      .toEqual(['note:a', 'note:b'])
  })

  it('reflects collapsed groups and folders', () => {
    expect(kinds(source({ items: [group], collapsedGroupIds: new Set(['g1']) }))).toEqual(['sep:groups', 'group:g1'])
    expect(kinds(source({ items: [group], collapsedFolderIds: new Set(['f1']) })))
      .toEqual(['sep:groups', 'group:g1', 'note:n1', 'folder:f1'])
  })

  it('applies the sidebar visibility rules (filters, archived)', () => {
    const emptyFolder = { ...group, folders: [{ folder: { id: 'f2' }, notes: [] }], visibleCount: 1 }
    expect(kinds(source({ items: [emptyFolder], hasActiveFilters: true }))).toEqual(['sep:groups', 'group:g1', 'note:n1'])
    const archived = { ...group, group: { ...group.group, archived: true } }
    expect(kinds(source({ items: [archived, { kind: 'note', note: note('x') }] }))).toEqual(['note:x'])
    expect(kinds(source({ items: [archived], showArchived: true }))[1]).toBe('group:g1')
  })
})

describe('miniRowsSignature', () => {
  it('changes with structure or colours, not with identity', () => {
    const a = buildMiniSidebarRows(source({ items: [{ kind: 'note', note: note('a', 'todo') }] }), colorOf)
    const same = buildMiniSidebarRows(source({ items: [{ kind: 'note', note: note('a', 'todo') }] }), colorOf)
    const recoloured = buildMiniSidebarRows(source({ items: [{ kind: 'note', note: note('a', 'other') }] }), colorOf)
    expect(miniRowsSignature(a)).toBe(miniRowsSignature(same))
    expect(miniRowsSignature(a)).not.toBe(miniRowsSignature(recoloured))
  })
})

describe('miniActiveRowIndex', () => {
  const rows = buildMiniSidebarRows(
    source({ favorites: [note('a')], items: [{ kind: 'note', note: note('b') }, { kind: 'note', note: note('a') }] }),
    colorOf,
  )

  it('prefers the note at its real place over its favorites copy', () => {
    expect(rows[miniActiveRowIndex(rows, 'a')].key).toBe('note:a')
  })

  it('falls back to the favorites copy, and -1 when not listed', () => {
    const favOnly = buildMiniSidebarRows(source({ favorites: [note('a')] }), colorOf)
    expect(favOnly[miniActiveRowIndex(favOnly, 'a')].key).toBe('fav:a')
    expect(miniActiveRowIndex(rows, 'zzz')).toBe(-1)
    expect(miniActiveRowIndex(rows, null)).toBe(-1)
  })
})

describe('miniSidebarCapacity / miniSidebarWindow', () => {
  it('fits rows of fixed pitch (the last one needs no trailing gap)', () => {
    expect(miniSidebarCapacity(MINI_ROW_HEIGHT)).toBe(1)
    expect(miniSidebarCapacity(MINI_ROW_HEIGHT * 3 + MINI_ROW_GAP * 2)).toBe(3)
    expect(miniSidebarCapacity(0)).toBe(0)
  })

  it('shows everything when it fits', () => {
    expect(miniSidebarWindow(5, 10, 3)).toEqual({ start: 0, end: 5 })
  })

  it('centres the window on the focus row, clamped to the ends', () => {
    expect(miniSidebarWindow(100, 10, 50)).toEqual({ start: 45, end: 55 })
    expect(miniSidebarWindow(100, 10, 2)).toEqual({ start: 0, end: 10 })
    expect(miniSidebarWindow(100, 10, 98)).toEqual({ start: 90, end: 100 })
  })

  it('starts at the top without a focus row', () => {
    expect(miniSidebarWindow(100, 10, -1)).toEqual({ start: 0, end: 10 })
    expect(miniSidebarWindow(100, 0, 5)).toEqual({ start: 0, end: 0 })
  })
})

describe('pickSidebarAnchor', () => {
  const container = { top: 0, bottom: 800, left: 0, right: 1000 }
  const rect = (left: number, top: number, width = 400, height = 600) => ({ left, top, right: left + width, bottom: top + height })

  it('picks the leftmost visible anchor, topmost on a tie', () => {
    expect(pickSidebarAnchor([rect(500, 100), rect(0, 120), rect(0, 90)], container)).toBe(2)
  })

  it('ignores empty anchors and panes scrolled out of view', () => {
    expect(pickSidebarAnchor([rect(-400, 100), rect(0, 100, 0, 0), rect(400, 100)], container)).toBe(2)
    expect(pickSidebarAnchor([], container)).toBe(-1)
  })
})

describe('floatingSidebarBounds', () => {
  const container = { top: 40, bottom: 840 }

  it('spans the anchor box, inset', () => {
    expect(floatingSidebarBounds(container, { top: 160, bottom: 840 }))
      .toEqual({ top: 120 + FLOATING_SIDEBAR_INSET, bottom: FLOATING_SIDEBAR_INSET })
  })

  it('falls back to the whole container without an anchor', () => {
    expect(floatingSidebarBounds(container, null)).toEqual({ top: FLOATING_SIDEBAR_INSET, bottom: FLOATING_SIDEBAR_INSET })
  })

  it('keeps a minimum height, growing down first and then up', () => {
    const b = floatingSidebarBounds(container, { top: 700, bottom: 760 })
    expect(800 - b.top - b.bottom).toBe(FLOATING_SIDEBAR_MIN_HEIGHT)
    expect(b.bottom).toBe(FLOATING_SIDEBAR_INSET)
  })

  it('never exceeds a tiny container', () => {
    const b = floatingSidebarBounds({ top: 0, bottom: 100 }, { top: 50, bottom: 60 })
    expect(b.top).toBeGreaterThanOrEqual(FLOATING_SIDEBAR_INSET)
    expect(100 - b.top - b.bottom).toBe(100 - 2 * FLOATING_SIDEBAR_INSET)
  })
})
