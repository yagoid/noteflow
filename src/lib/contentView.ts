// Pure logic of the unified content view (components/ContentView/): the "place" the view
// shows (everything, favorites, ungrouped, a group or a folder), which notes belong to it,
// the date blocks of the timeline, the list's order (by date / as in the sidebar), the route
// each row prints, the default selection and the shift-click range. Covered by
// tests/lib/contentView.test.ts. See "Vista de contenido unificada" in .agents/context/patterns.md.
import type { Note, NoteFolder, NoteGroup } from '../types'
import { orderFavorites } from './miniSidebar'
import { buildSidebarItems, compareSidebarNotes } from './sidebarGroups'

// ── Places ────────────────────────────────────────────────────────────────────────────

/** What the content view shows: `all` | `fav` | `none` (ungrouped) | `g:<groupId>` | `f:<folderId>`. */
export type ContentPlace = 'all' | 'fav' | 'none' | `g:${string}` | `f:${string}`

export type ParsedPlace =
  | { kind: 'all' }
  | { kind: 'fav' }
  | { kind: 'none' }
  | { kind: 'group'; id: string }
  | { kind: 'folder'; id: string }

export const ALL_PLACE: ContentPlace = 'all'
export const FAVORITES_PLACE: ContentPlace = 'fav'
export const UNGROUPED_PLACE: ContentPlace = 'none'

export function groupPlace(groupId: string): ContentPlace {
  return `g:${groupId}`
}

export function folderPlace(folderId: string): ContentPlace {
  return `f:${folderId}`
}

export function parsePlace(place: ContentPlace): ParsedPlace {
  if (place === 'all' || place === 'fav' || place === 'none') return { kind: place }
  const id = place.slice(2)
  return place.startsWith('g:') ? { kind: 'group', id } : { kind: 'folder', id }
}

/**
 * Groups and folders as the view resolves a note's location. Same guard as the sidebar
 * (`buildSidebarItems` in lib/sidebarGroups.ts): a note's group only counts if it exists, and its folder only if it
 * exists inside that group — stale ids fall back to "ungrouped" / "in the group".
 */
export interface PlaceContext {
  groupsById: ReadonlyMap<string, NoteGroup>
  foldersById: ReadonlyMap<string, NoteFolder>
}

export function buildPlaceContext(groups: readonly NoteGroup[], folders: readonly NoteFolder[]): PlaceContext {
  return {
    groupsById: new Map(groups.map((g) => [g.id, g])),
    foldersById: new Map(folders.map((f) => [f.id, f])),
  }
}

/** The note's effective location (null = ungrouped / no folder). */
export function noteLocation(
  note: Pick<Note, 'group' | 'folder'>,
  ctx: PlaceContext,
): { groupId: string | null; folderId: string | null } {
  const groupId = note.group && ctx.groupsById.has(note.group) ? note.group : null
  if (!groupId) return { groupId: null, folderId: null }
  const folder = note.folder ? ctx.foldersById.get(note.folder) : undefined
  return { groupId, folderId: folder && folder.groupId === groupId ? folder.id : null }
}

/** The group a place belongs to (a group, or a folder's group), if any. */
export function placeGroupId(place: ContentPlace, ctx: PlaceContext): string | null {
  const p = parsePlace(place)
  if (p.kind === 'group') return p.id
  if (p.kind === 'folder') return ctx.foldersById.get(p.id)?.groupId ?? null
  return null
}

/** False once the place's group or folder no longer exists (deleted locally or by a sync). */
export function placeExists(place: ContentPlace, ctx: PlaceContext): boolean {
  const p = parsePlace(place)
  if (p.kind === 'group') return ctx.groupsById.has(p.id)
  if (p.kind === 'folder') {
    const folder = ctx.foldersById.get(p.id)
    return !!folder && ctx.groupsById.has(folder.groupId)
  }
  return true
}

/**
 * Whether a note is listed at all, before the place filter. Without "Show archived", archived
 * notes and the notes of archived groups are left out (as in the sidebar) — except the notes of
 * the archived group the view is standing on, so opening an archived group still shows it.
 */
export function noteShown(
  note: Pick<Note, 'archived' | 'group' | 'folder'>,
  place: ContentPlace,
  ctx: PlaceContext,
  showArchived: boolean,
): boolean {
  if (showArchived) return true
  if (note.archived) return false
  const { groupId } = noteLocation(note, ctx)
  if (groupId && ctx.groupsById.get(groupId)?.archived) return placeGroupId(place, ctx) === groupId
  return true
}

/** Whether the note belongs to the place (the archived filter is `noteShown`). */
export function noteInPlace(
  note: Pick<Note, 'favorited' | 'group' | 'folder'>,
  place: ContentPlace,
  ctx: PlaceContext,
): boolean {
  const p = parsePlace(place)
  if (p.kind === 'all') return true
  if (p.kind === 'fav') return !!note.favorited
  const loc = noteLocation(note, ctx)
  if (p.kind === 'none') return loc.groupId === null
  if (p.kind === 'group') return loc.groupId === p.id
  return loc.folderId === p.id
}

/** `updated` as a timestamp (0 when unparsable, so such notes sink to the end). */
export function noteTime(note: Pick<Note, 'updated'>): number {
  const t = new Date(note.updated).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Most recently edited first (stable for equal times). */
export function sortByUpdatedDesc<T extends Pick<Note, 'updated'>>(notes: readonly T[]): T[] {
  return notes
    .map((note, i) => ({ note, i, t: noteTime(note) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.note)
}

/**
 * The patch that moves a note to a place (drop on the places rail), or null when the place
 * isn't a location (everything, favorites) or no longer exists.
 */
export function placeMovePatch(
  place: ContentPlace,
  ctx: PlaceContext,
): { group: string | undefined; folder: string | undefined } | null {
  const p = parsePlace(place)
  if (p.kind === 'none') return { group: undefined, folder: undefined }
  if (p.kind === 'group') return ctx.groupsById.has(p.id) ? { group: p.id, folder: undefined } : null
  if (p.kind === 'folder') {
    const folder = ctx.foldersById.get(p.id)
    return folder && ctx.groupsById.has(folder.groupId) ? { group: folder.groupId, folder: folder.id } : null
  }
  return null
}

/** True when the note already sits exactly where the patch would put it. */
export function alreadyInPlace(
  note: Pick<Note, 'group' | 'folder'>,
  patch: { group: string | undefined; folder: string | undefined },
  ctx: PlaceContext,
): boolean {
  const loc = noteLocation(note, ctx)
  return (loc.groupId ?? undefined) === patch.group && (loc.folderId ?? undefined) === patch.folder
}

// ── Date blocks ───────────────────────────────────────────────────────────────────────

export type DateBlock = 'today' | 'yesterday' | 'week' | 'month' | 'older'

/** Display order of the timeline's blocks. */
export const DATE_BLOCKS: readonly DateBlock[] = ['today', 'yesterday', 'week', 'month', 'older']

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDayMs(now: number, daysBack: number): number {
  // Calendar arithmetic (not `- n * DAY_MS`) so a DST change doesn't shift the boundary.
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysBack)
  return d.getTime()
}

/**
 * Block of the timeline for an edit time: today, yesterday, this week (the rest of the last 7
 * calendar days: from midnight 6 days ago), the last 30 days, or earlier. A time in the future (clock skew between
 * devices) counts as today.
 */
export function dateBlock(time: number, now: number): DateBlock {
  if (time >= startOfDayMs(now, 0)) return 'today'
  if (time >= startOfDayMs(now, 1)) return 'yesterday'
  if (time >= startOfDayMs(now, 6)) return 'week'
  if (time >= now - 30 * DAY_MS) return 'month'
  return 'older'
}

/** What the row's time column prints for a block: the time, the weekday or the date. */
export function timeLabelKind(block: DateBlock): 'time' | 'weekday' | 'date' {
  if (block === 'today' || block === 'yesterday') return 'time'
  return block === 'week' ? 'weekday' : 'date'
}

export interface DateBlockGroup<T> {
  block: DateBlock
  items: T[]
}

/** Splits an already sorted (newest first) list into its non-empty blocks, in DATE_BLOCKS order. */
export function groupByDateBlock<T>(
  items: readonly T[],
  timeOf: (item: T) => number,
  now: number,
): DateBlockGroup<T>[] {
  const byBlock = new Map<DateBlock, T[]>()
  for (const item of items) {
    const block = dateBlock(timeOf(item), now)
    const list = byBlock.get(block)
    if (list) list.push(item)
    else byBlock.set(block, [item])
  }
  return DATE_BLOCKS.filter((b) => byBlock.has(b)).map((block) => ({ block, items: byBlock.get(block)! }))
}

// ── List order ────────────────────────────────────────────────────────────────────────

/** How column 2 orders the notes: by edit date in blocks, or as the sidebar lists them. */
export type ContentSort = 'date' | 'sidebar'

export const CONTENT_SORTS: readonly ContentSort[] = ['date', 'sidebar']
export const DEFAULT_CONTENT_SORT: ContentSort = 'date'

/** Stored order (localStorage); anything else falls back to the default. */
export function parseContentSort(raw: string | null): ContentSort {
  return raw === 'sidebar' ? 'sidebar' : DEFAULT_CONTENT_SORT
}

/** The sticky header of a list section. */
export type NoteListHeading =
  | { kind: 'date'; block: DateBlock }
  | { kind: 'group'; group: NoteGroup }
  | { kind: 'folder'; folder: NoteFolder }
  | { kind: 'ungrouped' }

/** How much of a note's location its row prints (see `routeMode`). */
export type RouteMode = 'full' | 'folder' | 'none'

/** A folder nested under a group heading (sidebar order, everything). */
export interface NoteListFolder<T> {
  folder: NoteFolder
  items: T[]
}

export interface NoteListSection<T> {
  /** Stable React key. */
  key: string
  /** Null: no header (the place already says it). */
  heading: NoteListHeading | null
  /** Notes right under the heading (a group's loose notes). */
  items: T[]
  /** Sub-sections with their own, smaller header — only a group under "everything". */
  folders: NoteListFolder<T>[]
  /** Notes in the section, sub-sections included. */
  count: number
  /** What the rows of `items` print as their route (sub-section rows: nothing). */
  route: RouteMode
}

/** What `buildNoteList` reads of a note (a `Note` satisfies it). */
export type ListableNote = Pick<Note, 'id' | 'group' | 'folder' | 'created' | 'updated'>

export interface NoteListOptions {
  sort: ContentSort
  place: ContentPlace
  groups: readonly NoteGroup[]
  folders: readonly NoteFolder[]
  /** groupsStore `noteOrder`: the sidebar's manual order per context. */
  noteOrder: Record<string, string[]>
  /** For the date blocks. */
  now: number
}

const section = <T>(
  key: string,
  heading: NoteListHeading | null,
  items: T[],
  route: RouteMode,
  folders: NoteListFolder<T>[] = [],
): NoteListSection<T> => ({
  key, heading, items, folders, route,
  count: items.length + folders.reduce((sum, f) => sum + f.items.length, 0),
})

/**
 * Column 2's sections for the listed notes (place, archived and search filters already
 * applied; any order). By date: newest edited first in date blocks. As in the sidebar: the
 * sidebar's own order and grouping (`buildSidebarItems` over its base order, manual
 * `noteOrder` included) for the place — a group: its loose notes (no header) then one
 * section per folder; a folder / ungrouped: their notes; favorites: the sidebar's favorites
 * order; everything: one section per group (loose notes + its folders as sub-sections), then
 * "Ungrouped" (headed only below some group). Folders and groups without listed notes are left out.
 */
export function buildNoteList<N extends ListableNote>(
  notes: readonly N[],
  opts: NoteListOptions,
): NoteListSection<N>[] {
  const placeRoute = routeMode(opts.place)
  if (opts.sort === 'date') {
    return groupByDateBlock(sortByUpdatedDesc(notes), noteTime, opts.now)
      .map(({ block, items }) => section(`date:${block}`, { kind: 'date', block }, items, placeRoute))
  }

  const base = [...notes].sort(compareSidebarNotes)
  const p = parsePlace(opts.place)
  if (p.kind === 'fav') {
    const items = orderFavorites(base, opts.noteOrder['favorites'])
    return items.length > 0 ? [section('fav', null, items, placeRoute)] : []
  }

  const items = buildSidebarItems(base, opts.groups, opts.folders, opts.noteOrder)
  const ungrouped = items.flatMap((it) => (it.kind === 'note' ? [it.note] : []))
  const groupItems = items.flatMap((it) => (it.kind === 'group' ? [it] : []))
  const nonEmptyFolders = (it: (typeof groupItems)[number]) =>
    it.folders.filter((f) => f.notes.length > 0).map((f) => ({ folder: f.folder, items: f.notes }))

  if (p.kind === 'none') return ungrouped.length > 0 ? [section('none', null, ungrouped, placeRoute)] : []
  if (p.kind === 'folder') {
    const notesOf = groupItems.flatMap((it) => it.folders).find((f) => f.folder.id === p.id)?.notes ?? []
    return notesOf.length > 0 ? [section(`folder:${p.id}`, null, notesOf, placeRoute)] : []
  }
  if (p.kind === 'group') {
    const item = groupItems.find((it) => it.group.id === p.id)
    if (!item) return []
    const out: NoteListSection<N>[] = []
    if (item.notes.length > 0) out.push(section(`loose:${p.id}`, null, item.notes, placeRoute))
    for (const f of nonEmptyFolders(item)) {
      out.push(section(`folder:${f.folder.id}`, { kind: 'folder', folder: f.folder }, f.items, 'none'))
    }
    return out
  }

  // Everything.
  const out: NoteListSection<N>[] = []
  for (const item of groupItems) {
    const subs = nonEmptyFolders(item)
    if (item.notes.length === 0 && subs.length === 0) continue
    out.push(section(`group:${item.group.id}`, { kind: 'group', group: item.group }, item.notes, 'none', subs))
  }
  if (ungrouped.length > 0) {
    out.push(section('ungrouped', out.length > 0 ? { kind: 'ungrouped' } : null, ungrouped, 'none'))
  }
  return out
}

/** The notes of the sections in visual order (arrow keys, shift-click range, default selection). */
export function noteListOrder<T>(sections: readonly NoteListSection<T>[]): T[] {
  const out: T[] = []
  for (const s of sections) {
    out.push(...s.items)
    for (const f of s.folders) out.push(...f.items)
  }
  return out
}

// ── Row route ─────────────────────────────────────────────────────────────────────────

/**
 * How much of a note's location its row prints — what the place already says is dropped:
 * everything / favorites / ungrouped → group tab + "Group / Folder"; a group → its folder (or
 * "in the group"); a folder → nothing.
 */
export function routeMode(place: ContentPlace): RouteMode {
  const kind = parsePlace(place).kind
  if (kind === 'group') return 'folder'
  if (kind === 'folder') return 'none'
  return 'full'
}

// ── Selection ─────────────────────────────────────────────────────────────────────────

export interface ContentSelection {
  noteId: string
  /** Null for a note without sections (e.g. encrypted and locked). */
  sectionId: string | null
}

export interface SelectableNote {
  id: string
  sectionIds: readonly string[]
}

/**
 * The single selection after the list changed (place, search, notes): the current note is
 * kept if it's still listed — on the same section if it still exists, else its first —;
 * otherwise the first note of the list on its first section. Null for an empty list.
 */
export function reconcileSelection(
  list: readonly SelectableNote[],
  current: ContentSelection | null,
): ContentSelection | null {
  const kept = current ? list.find((n) => n.id === current.noteId) : undefined
  if (kept && current) {
    const sectionId = current.sectionId && kept.sectionIds.includes(current.sectionId)
      ? current.sectionId
      : kept.sectionIds[0] ?? null
    return sectionId === current.sectionId ? current : { noteId: kept.id, sectionId }
  }
  const first = list[0]
  return first ? { noteId: first.id, sectionId: first.sectionIds[0] ?? null } : null
}

/** Arrow keys: the note `delta` rows away in the list (clamped), or the first one if none is selected. */
export function stepNote(ids: readonly string[], currentId: string | null, delta: number): string | null {
  if (ids.length === 0) return null
  const i = currentId ? ids.indexOf(currentId) : -1
  if (i === -1) return ids[0]
  return ids[Math.max(0, Math.min(ids.length - 1, i + delta))]
}

/** ←/→: the section `delta` cells away in the note (clamped), or the first one if none is selected. */
export function stepSection(sectionIds: readonly string[], currentId: string | null, delta: number): string | null {
  if (sectionIds.length === 0) return null
  const i = currentId ? sectionIds.indexOf(currentId) : -1
  if (i === -1) return sectionIds[0]
  return sectionIds[Math.max(0, Math.min(sectionIds.length - 1, i + delta))]
}

/**
 * Shift-click: the notes between the anchor and the clicked one (both included), in the
 * visible order. Without a visible anchor, just the clicked note.
 */
export function selectionRange(ids: readonly string[], anchorId: string | null, targetId: string): string[] {
  const to = ids.indexOf(targetId)
  if (to === -1) return []
  const from = anchorId ? ids.indexOf(anchorId) : -1
  if (from === -1) return [targetId]
  const [a, b] = from <= to ? [from, to] : [to, from]
  return ids.slice(a, b + 1)
}

// ── Column widths ─────────────────────────────────────────────────────────────────────

/**
 * Hand-resizable columns: the places rail and the preview (the notes list takes the rest).
 * The preview's default (`preview: null`) is the responsive CSS width. CSS paints both with
 * the same caps as the clamps below (index.css `.cv-body` / `.cv-pv`), so what a drag starts
 * from is what's on screen: the list keeps `listMin`; short of room the preview gives way
 * first (to its floor), then the rail (to `railMin`); below that, the list. Half the view
 * wins over `previewMin` (a view under 560px paints the preview at half). On a wide view the
 * preview can grow to `previewMaxShare` of it (and `previewMax`), always leaving the list its minimum.
 */
export const COLUMN_LIMITS = {
  railDefault: 260,
  railMin: 180,
  railMax: 360,
  previewMin: 280,
  previewMax: 1200,
  /** The preview never takes more than this share of the view. */
  previewMaxShare: 0.7,
  /** Under 2 × `previewMin`, the preview's floor is this share of the view instead. */
  previewFloorShare: 0.5,
  /** Width the notes list keeps when a column grows. */
  listMin: 320,
  /** The rail's own left padding (index.css `.cv-rail`): beyond it, the floating sidebar's reserve. */
  railPadding: 14,
} as const

export interface ColumnWidths {
  rail: number
  /** Null = the responsive default. */
  preview: number | null
}

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { rail: COLUMN_LIMITS.railDefault, preview: null }

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), Math.max(lo, hi))

/** Stored widths (localStorage JSON); anything missing or invalid falls back to the default. */
export function parseColumnWidths(raw: string | null): ColumnWidths {
  if (!raw) return DEFAULT_COLUMN_WIDTHS
  let data: unknown
  try { data = JSON.parse(raw) } catch { return DEFAULT_COLUMN_WIDTHS }
  if (!data || typeof data !== 'object') return DEFAULT_COLUMN_WIDTHS
  const { rail, preview } = data as Record<string, unknown>
  const L = COLUMN_LIMITS
  return {
    rail: typeof rail === 'number' && Number.isFinite(rail) ? Math.round(clamp(rail, L.railMin, L.railMax)) : L.railDefault,
    preview: typeof preview === 'number' && Number.isFinite(preview)
      ? Math.round(clamp(preview, L.previewMin, L.previewMax))
      : null,
  }
}

/** The preview's smallest width while shown: `previewMin`, or half the view if that's less. */
export function previewFloor(viewWidth: number): number {
  return Math.min(COLUMN_LIMITS.previewMin, viewWidth * COLUMN_LIMITS.previewFloorShare)
}

/**
 * The rail's width (without `railExtra`, what it measures beyond its setting: the floating
 * sidebar's mini-view reserve), as CSS paints it and while dragging: the list keeps its
 * minimum next to the preview at its floor; short of that, the rail's own minimum holds.
 */
export function clampRailWidth(
  width: number,
  opts: { viewWidth: number; railExtra: number; previewOpen: boolean },
): number {
  const L = COLUMN_LIMITS
  const room = opts.viewWidth - L.listMin - (opts.previewOpen ? previewFloor(opts.viewWidth) : 0) - opts.railExtra
  return Math.round(clamp(width, L.railMin, Math.min(L.railMax, room)))
}

/**
 * The preview's width while dragging (`railWidth` = the rail as painted, reserve included):
 * its limits, `previewMaxShare` of the view, and the list's minimum next to the rail — never under its floor.
 */
export function clampPreviewWidth(width: number, opts: { viewWidth: number; railWidth: number }): number {
  const L = COLUMN_LIMITS
  const floor = previewFloor(opts.viewWidth)
  const room = Math.min(L.previewMax, opts.viewWidth * L.previewMaxShare, opts.viewWidth - opts.railWidth - L.listMin)
  return Math.round(clamp(width, floor, room))
}
