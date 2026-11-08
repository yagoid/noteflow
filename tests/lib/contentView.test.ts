import { describe, it, expect } from 'vitest'
import {
  COLUMN_LIMITS, DEFAULT_COLUMN_WIDTHS, alreadyInPlace, buildPlaceContext, clampPreviewWidth, clampRailWidth,
  dateBlock, folderPlace, groupByDateBlock, groupPlace, noteInPlace,
  noteLocation, noteShown, parseColumnWidths, parsePlace, previewFloor, placeExists, placeGroupId, placeMovePatch, reconcileSelection,
  routeMode, selectionRange, sortByUpdatedDesc, stepNote, stepSection, timeLabelKind,
  DEFAULT_CONTENT_SORT, buildNoteList, noteListOrder, parseContentSort, type ContentPlace,
} from '../../src/lib/contentView'
import { buildSidebarItems, compareSidebarNotes } from '../../src/lib/sidebarGroups'
import type { NoteFolder, NoteGroup } from '../../src/types'

const groups: NoteGroup[] = [
  { id: 'work', name: 'Work', color: '--accent', order: 0 },
  { id: 'old', name: 'Old', color: '--cyan', order: 1, archived: true },
]
const folders: NoteFolder[] = [
  { id: 'clients', name: 'Clients', groupId: 'work', order: 0 },
  { id: 'attic', name: 'Attic', groupId: 'old', order: 0 },
]
const ctx = buildPlaceContext(groups, folders)

type N = { group?: string; folder?: string; favorited?: boolean; archived?: boolean }
const note = (n: N) => ({ favorited: false, archived: false, ...n })

describe('places', () => {
  it('parses every kind of place', () => {
    expect(parsePlace('all')).toEqual({ kind: 'all' })
    expect(parsePlace('fav')).toEqual({ kind: 'fav' })
    expect(parsePlace('none')).toEqual({ kind: 'none' })
    expect(parsePlace(groupPlace('work'))).toEqual({ kind: 'group', id: 'work' })
    expect(parsePlace(folderPlace('a:b'))).toEqual({ kind: 'folder', id: 'a:b' })
  })

  it('resolves stale group / folder ids like the sidebar does', () => {
    expect(noteLocation({ group: 'gone' }, ctx)).toEqual({ groupId: null, folderId: null })
    expect(noteLocation({ group: 'work', folder: 'gone' }, ctx)).toEqual({ groupId: 'work', folderId: null })
    // A folder of another group doesn't count.
    expect(noteLocation({ group: 'work', folder: 'attic' }, ctx)).toEqual({ groupId: 'work', folderId: null })
    expect(noteLocation({ group: 'work', folder: 'clients' }, ctx)).toEqual({ groupId: 'work', folderId: 'clients' })
  })

  it('filters notes by place', () => {
    const loose = note({ group: 'work' })
    const inFolder = note({ group: 'work', folder: 'clients', favorited: true })
    const ungrouped = note({})
    const stale = note({ group: 'gone' })
    expect(noteInPlace(loose, 'all', ctx)).toBe(true)
    expect(noteInPlace(inFolder, 'fav', ctx)).toBe(true)
    expect(noteInPlace(loose, 'fav', ctx)).toBe(false)
    expect(noteInPlace(ungrouped, 'none', ctx)).toBe(true)
    expect(noteInPlace(stale, 'none', ctx)).toBe(true)
    expect(noteInPlace(loose, groupPlace('work'), ctx)).toBe(true)
    expect(noteInPlace(inFolder, groupPlace('work'), ctx)).toBe(true)
    expect(noteInPlace(loose, folderPlace('clients'), ctx)).toBe(false)
    expect(noteInPlace(inFolder, folderPlace('clients'), ctx)).toBe(true)
  })

  it('hides archived notes and archived groups unless asked, but not the archived group the view stands on', () => {
    expect(noteShown(note({ archived: true }), 'all', ctx, false)).toBe(false)
    expect(noteShown(note({ archived: true }), 'all', ctx, true)).toBe(true)
    const inArchivedGroup = note({ group: 'old', folder: 'attic' })
    expect(noteShown(inArchivedGroup, 'all', ctx, false)).toBe(false)
    expect(noteShown(inArchivedGroup, groupPlace('old'), ctx, false)).toBe(true)
    expect(noteShown(inArchivedGroup, folderPlace('attic'), ctx, false)).toBe(true)
    expect(noteShown(inArchivedGroup, 'all', ctx, true)).toBe(true)
  })

  it('knows the group of a place and whether it still exists', () => {
    expect(placeGroupId(groupPlace('work'), ctx)).toBe('work')
    expect(placeGroupId(folderPlace('clients'), ctx)).toBe('work')
    expect(placeGroupId('all', ctx)).toBeNull()
    expect(placeExists(groupPlace('work'), ctx)).toBe(true)
    expect(placeExists(groupPlace('gone'), ctx)).toBe(false)
    expect(placeExists(folderPlace('gone'), ctx)).toBe(false)
    expect(placeExists('fav', ctx)).toBe(true)
  })

  it('builds the move patch of a drop target', () => {
    expect(placeMovePatch('none', ctx)).toEqual({ group: undefined, folder: undefined })
    expect(placeMovePatch(groupPlace('work'), ctx)).toEqual({ group: 'work', folder: undefined })
    expect(placeMovePatch(folderPlace('clients'), ctx)).toEqual({ group: 'work', folder: 'clients' })
    expect(placeMovePatch('all', ctx)).toBeNull()
    expect(placeMovePatch('fav', ctx)).toBeNull()
    expect(placeMovePatch(groupPlace('gone'), ctx)).toBeNull()
  })

  it('detects a move that changes nothing', () => {
    expect(alreadyInPlace({ group: 'work' }, { group: 'work', folder: undefined }, ctx)).toBe(true)
    expect(alreadyInPlace({ group: 'work', folder: 'gone' }, { group: 'work', folder: undefined }, ctx)).toBe(true)
    expect(alreadyInPlace({ group: 'work', folder: 'clients' }, { group: 'work', folder: undefined }, ctx)).toBe(false)
    expect(alreadyInPlace({ group: 'gone' }, { group: undefined, folder: undefined }, ctx)).toBe(true)
  })

  it('drops from the route what the place already says', () => {
    expect(routeMode('all')).toBe('full')
    expect(routeMode('fav')).toBe('full')
    expect(routeMode('none')).toBe('full')
    expect(routeMode(groupPlace('work'))).toBe('folder')
    expect(routeMode(folderPlace('clients'))).toBe('none')
  })
})

describe('date blocks', () => {
  // Saturday 7 Nov 2026, 19:00 local time.
  const now = new Date(2026, 10, 7, 19, 0).getTime()
  const at = (d: number, h = 12, m = 0) => new Date(2026, 10, d, h, m).getTime()

  it('splits today, yesterday, this week, the last 30 days and earlier', () => {
    expect(dateBlock(at(7, 0, 0), now)).toBe('today')
    expect(dateBlock(at(7, 18), now)).toBe('today')
    expect(dateBlock(at(6, 23, 59), now)).toBe('yesterday')
    expect(dateBlock(at(6, 0, 0), now)).toBe('yesterday')
    expect(dateBlock(at(5, 23), now)).toBe('week')
    expect(dateBlock(at(1, 0, 0), now)).toBe('week')
    expect(dateBlock(at(0, 23), now)).toBe('month') // 31 Oct
    expect(dateBlock(new Date(2026, 9, 9, 12).getTime(), now)).toBe('month')
    expect(dateBlock(new Date(2026, 9, 1).getTime(), now)).toBe('older')
  })

  it('counts a future edit time as today', () => {
    expect(dateBlock(now + 3_600_000, now)).toBe('today')
  })

  it('labels rows with the time, the weekday or the date', () => {
    expect(timeLabelKind('today')).toBe('time')
    expect(timeLabelKind('yesterday')).toBe('time')
    expect(timeLabelKind('week')).toBe('weekday')
    expect(timeLabelKind('month')).toBe('date')
    expect(timeLabelKind('older')).toBe('date')
  })

  it('groups a sorted list into non-empty blocks in display order', () => {
    const items = [at(7, 18), at(7, 9), at(3), new Date(2025, 0, 1).getTime()]
    const blocks = groupByDateBlock(items, (t) => t, now)
    expect(blocks.map((b) => b.block)).toEqual(['today', 'week', 'older'])
    expect(blocks[0].items).toEqual([at(7, 18), at(7, 9)])
  })

  it('sorts by last edit, newest first, keeping ties stable and bad dates last', () => {
    const list = [
      { id: 'a', updated: '2026-11-01T10:00:00Z' },
      { id: 'bad', updated: 'nope' },
      { id: 'b', updated: '2026-11-05T10:00:00Z' },
      { id: 'c', updated: '2026-11-01T10:00:00Z' },
    ]
    expect(sortByUpdatedDesc(list).map((n) => n.id)).toEqual(['b', 'a', 'c', 'bad'])
  })
})

describe('selection', () => {
  const list = [
    { id: 'n1', sectionIds: ['a', 'b'] },
    { id: 'n2', sectionIds: ['c'] },
    { id: 'locked', sectionIds: [] },
  ]

  it('defaults to the first note on its first section', () => {
    expect(reconcileSelection(list, null)).toEqual({ noteId: 'n1', sectionId: 'a' })
    expect(reconcileSelection([], null)).toBeNull()
  })

  it('keeps the selected note (and section) while it is still listed', () => {
    const current = { noteId: 'n1', sectionId: 'b' }
    expect(reconcileSelection(list, current)).toBe(current)
    expect(reconcileSelection(list, { noteId: 'n1', sectionId: 'gone' })).toEqual({ noteId: 'n1', sectionId: 'a' })
    expect(reconcileSelection(list, { noteId: 'locked', sectionId: null })).toEqual({ noteId: 'locked', sectionId: null })
  })

  it('falls back to the first note when the selected one left the list', () => {
    expect(reconcileSelection(list.slice(1), { noteId: 'n1', sectionId: 'b' })).toEqual({ noteId: 'n2', sectionId: 'c' })
    expect(reconcileSelection([], { noteId: 'n1', sectionId: 'b' })).toBeNull()
  })

  it('steps notes and sections, clamped at both ends', () => {
    const ids = ['n1', 'n2', 'n3']
    expect(stepNote(ids, 'n1', 1)).toBe('n2')
    expect(stepNote(ids, 'n3', 1)).toBe('n3')
    expect(stepNote(ids, 'n1', -1)).toBe('n1')
    expect(stepNote(ids, null, 1)).toBe('n1')
    expect(stepNote([], 'n1', 1)).toBeNull()
    expect(stepSection(['a', 'b'], 'a', 1)).toBe('b')
    expect(stepSection(['a', 'b'], 'b', 1)).toBe('b')
    expect(stepSection(['a', 'b'], null, -1)).toBe('a')
    expect(stepSection([], 'a', 1)).toBeNull()
  })

  it('selects the visible range between the anchor and the clicked note', () => {
    const ids = ['n1', 'n2', 'n3', 'n4']
    expect(selectionRange(ids, 'n2', 'n4')).toEqual(['n2', 'n3', 'n4'])
    expect(selectionRange(ids, 'n4', 'n2')).toEqual(['n2', 'n3', 'n4'])
    expect(selectionRange(ids, 'hidden', 'n3')).toEqual(['n3'])
    expect(selectionRange(ids, null, 'n1')).toEqual(['n1'])
    expect(selectionRange(ids, 'n1', 'missing')).toEqual([])
  })
})

describe('column widths', () => {
  it('reads stored widths, clamped, and falls back to the default', () => {
    expect(parseColumnWidths(null)).toEqual(DEFAULT_COLUMN_WIDTHS)
    expect(parseColumnWidths('not json')).toEqual(DEFAULT_COLUMN_WIDTHS)
    expect(parseColumnWidths('42')).toEqual(DEFAULT_COLUMN_WIDTHS)
    expect(parseColumnWidths('{"rail":300,"preview":400}')).toEqual({ rail: 300, preview: 400 })
    expect(parseColumnWidths('{"rail":20,"preview":9000}')).toEqual({ rail: COLUMN_LIMITS.railMin, preview: COLUMN_LIMITS.previewMax })
    expect(parseColumnWidths('{"rail":"wide","preview":null}')).toEqual({ rail: COLUMN_LIMITS.railDefault, preview: null })
  })

  it('keeps the rail within its limits and leaves the list its minimum', () => {
    const wide = { viewWidth: 1600, railExtra: 0, previewOpen: true }
    expect(clampRailWidth(250.4, wide)).toBe(250)
    expect(clampRailWidth(100, wide)).toBe(COLUMN_LIMITS.railMin)
    expect(clampRailWidth(900, wide)).toBe(COLUMN_LIMITS.railMax)
    // 900 - 320 (list) - 280 (preview at its minimum) = 300.
    expect(clampRailWidth(360, { viewWidth: 900, railExtra: 0, previewOpen: true })).toBe(300)
    // The mini-view reserve counts against the room; a closed preview frees its share.
    expect(clampRailWidth(360, { viewWidth: 900, railExtra: 30, previewOpen: true })).toBe(270)
    expect(clampRailWidth(360, { viewWidth: 900, railExtra: 0, previewOpen: false })).toBe(360)
    // No room at all: the minimum still holds.
    expect(clampRailWidth(300, { viewWidth: 500, railExtra: 0, previewOpen: true })).toBe(COLUMN_LIMITS.railMin)
    // The case that used to jump: an 800px view with the preview open paints the rail at 200.
    expect(clampRailWidth(260, { viewWidth: 800, railExtra: 0, previewOpen: true })).toBe(200)
    expect(clampRailWidth(201, { viewWidth: 800, railExtra: 0, previewOpen: true })).toBe(200)
  })

  it('caps the preview at its maximum, 70% of the view and the list minimum', () => {
    expect(clampPreviewWidth(400, { viewWidth: 1600, railWidth: 260 })).toBe(400)
    expect(clampPreviewWidth(100, { viewWidth: 1600, railWidth: 260 })).toBe(COLUMN_LIMITS.previewMin)
    // Full screen: 1600 - 260 (rail) - 320 (list) = 1020.
    expect(clampPreviewWidth(900, { viewWidth: 1600, railWidth: 260 })).toBe(900)
    expect(clampPreviewWidth(2000, { viewWidth: 1600, railWidth: 260 })).toBe(1020)
    // Very wide view: the absolute maximum.
    expect(clampPreviewWidth(3000, { viewWidth: 3200, railWidth: 260 })).toBe(COLUMN_LIMITS.previewMax)
    // 70% of 1000 = 700; the list minimum next to a 180 rail leaves 500.
    expect(clampPreviewWidth(800, { viewWidth: 1000, railWidth: 180 })).toBe(500)
    // 70% wins when it is tighter than the list minimum: 70% of 1700 = 1190 < 1700 - 180 - 320 = 1200.
    expect(clampPreviewWidth(1300, { viewWidth: 1700, railWidth: 180 })).toBe(1190)
    // 1000 - 360 (rail) - 320 (list) = 320.
    expect(clampPreviewWidth(540, { viewWidth: 1000, railWidth: 360 })).toBe(320)
    expect(clampPreviewWidth(540, { viewWidth: 700, railWidth: 260 })).toBe(COLUMN_LIMITS.previewMin)
    // Under 560px half the view wins over the minimum (as CSS paints it).
    expect(clampPreviewWidth(300, { viewWidth: 400, railWidth: 180 })).toBe(200)
    expect(previewFloor(400)).toBe(200)
    expect(previewFloor(1200)).toBe(COLUMN_LIMITS.previewMin)
  })
})

describe('list order', () => {
  const now = new Date(2026, 10, 7, 19, 0).getTime()
  const sGroups: NoteGroup[] = [
    { id: 'b', name: 'B', color: '--cyan', order: 1 },
    { id: 'a', name: 'A', color: '--accent', order: 0 },
    { id: 'z', name: 'Z', color: '--red', order: 2, archived: true },
  ]
  const sFolders: NoteFolder[] = [
    { id: 'f2', name: 'F2', groupId: 'a', order: 1 },
    { id: 'f1', name: 'F1', groupId: 'a', order: 0 },
    { id: 'empty', name: 'Empty', groupId: 'a', order: 2 },
  ]
  // `created` decides the sidebar's base order (newest first); `updated`, the date blocks.
  type L = { id: string; group?: string; folder?: string; favorited?: boolean; created: string; updated: string }
  const mk = (id: string, day: number, extra: Partial<L> = {}): L => {
    const iso = new Date(2026, 10, day, 12).toISOString()
    return { id, created: iso, updated: iso, ...extra }
  }
  const notes: L[] = [
    mk('a-loose-old', 1, { group: 'a' }),
    mk('a-loose-new', 5, { group: 'a' }),
    mk('f1-x', 2, { group: 'a', folder: 'f1' }),
    mk('f2-x', 3, { group: 'a', folder: 'f2', favorited: true }),
    mk('b-x', 4, { group: 'b', favorited: true }),
    mk('z-x', 4, { group: 'z' }),
    mk('loose-1', 6),
    mk('loose-2', 7, { group: 'gone' }), // stale group → ungrouped
  ]
  const opts = (place: ContentPlace, noteOrder: Record<string, string[]> = {}) =>
    ({ sort: 'sidebar' as const, place, groups: sGroups, folders: sFolders, noteOrder, now })
  const ids = <T extends { id: string }>(list: readonly T[]) => list.map((n) => n.id)

  it('reads the stored order, defaulting to by date', () => {
    expect(parseContentSort('sidebar')).toBe('sidebar')
    expect(parseContentSort('date')).toBe('date')
    expect(parseContentSort(null)).toBe(DEFAULT_CONTENT_SORT)
    expect(parseContentSort('bogus')).toBe('date')
  })

  it('by date: newest edited first in date blocks, with the place route', () => {
    const list = buildNoteList(notes, { ...opts(groupPlace('a')), sort: 'date' })
    expect(list.map((s) => s.heading)).toEqual([
      { kind: 'date', block: 'today' },
      { kind: 'date', block: 'yesterday' },
      { kind: 'date', block: 'week' },
    ])
    expect(list.every((s) => s.route === 'folder' && s.folders.length === 0)).toBe(true)
    expect(ids(noteListOrder(list))).toEqual(['loose-2', 'loose-1', 'a-loose-new', 'b-x', 'z-x', 'f2-x', 'f1-x', 'a-loose-old'])
  })

  it('a group: its loose notes without a header, then each non-empty folder in sidebar order', () => {
    const inA = notes.filter((n) => n.group === 'a')
    const list = buildNoteList(inA, opts(groupPlace('a')))
    expect(list.map((s) => s.key)).toEqual(['loose:a', 'folder:f1', 'folder:f2'])
    expect(list[0].heading).toBeNull()
    expect(list[0].route).toBe('folder')
    expect(list[1].heading).toEqual({ kind: 'folder', folder: sFolders[1] })
    expect(list[1].route).toBe('none')
    expect(ids(noteListOrder(list))).toEqual(['a-loose-new', 'a-loose-old', 'f1-x', 'f2-x'])
  })

  it('follows the manual sidebar order (noteOrder), unordered notes after', () => {
    const inA = notes.filter((n) => n.group === 'a' && !n.folder)
    const list = buildNoteList(inA, opts(groupPlace('a'), { 'group:a': ['a-loose-old'] }))
    expect(ids(noteListOrder(list))).toEqual(['a-loose-old', 'a-loose-new'])
  })

  it('a folder: its notes without headers', () => {
    const list = buildNoteList(notes.filter((n) => n.folder === 'f1'), opts(folderPlace('f1')))
    expect(list).toHaveLength(1)
    expect(list[0].heading).toBeNull()
    expect(list[0].route).toBe('none')
    expect(ids(list[0].items)).toEqual(['f1-x'])
  })

  it('favorites and ungrouped: the sidebar order of those sections', () => {
    const favs = notes.filter((n) => n.favorited)
    expect(ids(noteListOrder(buildNoteList(favs, opts('fav'))))).toEqual(['b-x', 'f2-x'])
    expect(ids(noteListOrder(buildNoteList(favs, opts('fav', { favorites: ['f2-x'] }))))).toEqual(['f2-x', 'b-x'])
    const loose = notes.filter((n) => n.id.startsWith('loose'))
    const list = buildNoteList(loose, opts('none', { ungrouped: ['loose-1'] }))
    expect(list[0].heading).toBeNull()
    expect(list[0].route).toBe('full')
    expect(ids(noteListOrder(list))).toEqual(['loose-1', 'loose-2'])
  })

  it('everything: a header per group (folders as sub-sections, archived last), then Ungrouped', () => {
    const list = buildNoteList(notes, opts('all'))
    expect(list.map((s) => s.key)).toEqual(['group:a', 'group:b', 'group:z', 'ungrouped'])
    const a = list[0]
    expect(a.heading).toEqual({ kind: 'group', group: sGroups[1] })
    expect(a.route).toBe('none')
    expect(ids(a.items)).toEqual(['a-loose-new', 'a-loose-old'])
    // The empty folder is left out.
    expect(a.folders.map((f) => f.folder.id)).toEqual(['f1', 'f2'])
    expect(a.count).toBe(4)
    expect(list[3].heading).toEqual({ kind: 'ungrouped' })
    expect(ids(noteListOrder(list))).toEqual([
      'a-loose-new', 'a-loose-old', 'f1-x', 'f2-x', 'b-x', 'z-x', 'loose-2', 'loose-1',
    ])
  })

  it('everything: groups and folders without listed notes (search, archived) drop their header', () => {
    const list = buildNoteList(notes.filter((n) => n.id === 'f2-x' || n.id === 'loose-1'), opts('all'))
    expect(list.map((s) => s.key)).toEqual(['group:a', 'ungrouped'])
    expect(list[0].items).toEqual([])
    expect(list[0].folders.map((f) => f.folder.id)).toEqual(['f2'])
    // Only ungrouped notes left: no "Ungrouped" header over a lone section.
    const only = buildNoteList(notes.filter((n) => n.id === 'loose-1'), opts('all'))
    expect(only).toHaveLength(1)
    expect(only[0].heading).toBeNull()
    expect(buildNoteList([], opts('all'))).toEqual([])
  })

  it('the sidebar grouping keeps its base order and guards stale ids', () => {
    const items = buildSidebarItems([...notes].sort(compareSidebarNotes), sGroups, sFolders)
    expect(items.map((it) => (it.kind === 'group' ? `g:${it.group.id}` : it.note.id))).toEqual([
      'g:a', 'g:b', 'g:z', 'loose-2', 'loose-1',
    ])
  })
})
