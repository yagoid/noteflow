// Pure helpers for the floating sidebar and its mini-view (Sidebar/SidebarShell.tsx,
// Sidebar/MiniSidebar.tsx). No DOM / store imports so they can be unit-tested
// (tests/lib/miniSidebar.test.ts).
import type { GroupColor } from '../types'

// ── Sidebar list model (shared with Sidebar.tsx so both render the same rows) ──

/** Minimal note shape the mini-view needs (a `Note` satisfies it). */
export interface MiniNoteLike {
  id: string
  sections: readonly { name: string }[]
}

/** Structural mirror of `SidebarItem` (Sidebar/useSidebarGroups.ts). */
export type MiniSourceItem<N extends MiniNoteLike = MiniNoteLike> =
  | {
      kind: 'group'
      group: { id: string; color: GroupColor; archived?: boolean }
      notes: readonly N[]
      folders: readonly { folder: { id: string }; notes: readonly N[] }[]
      visibleCount: number
    }
  | { kind: 'note'; note: N }

/**
 * Favorites in the user's manual order (`noteOrder.favorites`): ordered ids
 * first, then any favorite missing from the order (newly starred), in list order.
 */
export function orderFavorites<N extends { id: string }>(favorites: readonly N[], order: readonly string[] | undefined): N[] {
  if (!order) return [...favorites]
  const byId = new Map(favorites.map((n) => [n.id, n]))
  const listed = new Set(order)
  const ordered: N[] = []
  for (const id of order) {
    const note = byId.get(id)
    if (note) ordered.push(note)
  }
  for (const note of favorites) if (!listed.has(note.id)) ordered.push(note)
  return ordered
}

/** Whether the sidebar renders a group: hidden when filters leave it empty, or archived while archived items are hidden. */
export function isSidebarGroupShown(
  item: { group: { archived?: boolean }; visibleCount: number },
  opts: { hasActiveFilters: boolean; showArchived: boolean },
): boolean {
  if (opts.hasActiveFilters && item.visibleCount === 0) return false
  if (item.group.archived && !opts.showArchived) return false
  return true
}

/** Whether the sidebar renders a folder: hidden when filters leave it empty. */
export function isSidebarFolderShown(noteCount: number, hasActiveFilters: boolean): boolean {
  return !(hasActiveFilters && noteCount === 0)
}

// ── Mini-view rows ────────────────────────────────────────────────────────────

/** Max section colours drawn inside a note's mini rectangle. */
export const MINI_MAX_SECTION_COLORS = 3

export type MiniSidebarRow =
  /** A list header ("favorites" / "groups" / "notes") — drawn as a hairline. */
  | { kind: 'separator'; key: string }
  | { kind: 'group'; key: string; color: GroupColor; archived: boolean; collapsed: boolean }
  | { kind: 'folder'; key: string; color: GroupColor; collapsed: boolean; guide: GroupColor }
  | {
      kind: 'note'
      key: string
      noteId: string
      /** 0 = top level, 1 = group root, 2 = inside a folder. */
      depth: 0 | 1 | 2
      /** Colours of the first sections (at most MINI_MAX_SECTION_COLORS). */
      colors: GroupColor[]
      /** Colour of the guide line of the group the note sits in (null outside groups). */
      guide: GroupColor | null
      favorite: boolean
    }

export interface MiniSidebarSource<N extends MiniNoteLike = MiniNoteLike> {
  /** Favorites, already filtered and ordered (see orderFavorites). */
  favorites: readonly N[]
  items: readonly MiniSourceItem<N>[]
  collapsedGroupIds: ReadonlySet<string>
  collapsedFolderIds: ReadonlySet<string>
  hasActiveFilters: boolean
  showArchived: boolean
}

/**
 * Flattens the sidebar list into one mini-view row per real list row, in the
 * same order and with the same visibility rules as Sidebar.tsx: list headers
 * become separators, collapsed groups/folders hide their notes, groups/folders
 * the sidebar hides (filters, archived) are skipped. Inline inputs and the
 * "new note" placeholder of empty groups aren't content and aren't drawn.
 */
export function buildMiniSidebarRows<N extends MiniNoteLike>(
  source: MiniSidebarSource<N>,
  sectionColor: (sectionName: string) => GroupColor,
): MiniSidebarRow[] {
  const rows: MiniSidebarRow[] = []
  const noteRow = (note: N, depth: 0 | 1 | 2, guide: GroupColor | null, favorite: boolean): MiniSidebarRow => ({
    kind: 'note',
    key: favorite ? `fav:${note.id}` : `note:${note.id}`,
    noteId: note.id,
    depth,
    colors: note.sections.slice(0, MINI_MAX_SECTION_COLORS).map((s) => sectionColor(s.name)),
    guide,
    favorite,
  })

  if (source.favorites.length > 0) {
    rows.push({ kind: 'separator', key: 'sep:favorites' })
    for (const note of source.favorites) rows.push(noteRow(note, 0, null, true))
  }

  const filterOpts = { hasActiveFilters: source.hasActiveFilters, showArchived: source.showArchived }
  let groupsHeaderDone = false
  let renderedGroup = false
  let notesHeaderDone = false
  for (const item of source.items) {
    if (item.kind === 'group') {
      if (!isSidebarGroupShown(item, filterOpts)) continue
      const { group } = item
      if (!groupsHeaderDone) {
        rows.push({ kind: 'separator', key: 'sep:groups' })
        groupsHeaderDone = true
      }
      renderedGroup = true
      const collapsed = source.collapsedGroupIds.has(group.id)
      rows.push({ kind: 'group', key: `group:${group.id}`, color: group.color, archived: !!group.archived, collapsed })
      if (collapsed) continue
      for (const note of item.notes) rows.push(noteRow(note, 1, group.color, false))
      for (const { folder, notes } of item.folders) {
        if (!isSidebarFolderShown(notes.length, source.hasActiveFilters)) continue
        const folderCollapsed = source.collapsedFolderIds.has(folder.id)
        rows.push({ kind: 'folder', key: `folder:${folder.id}`, color: group.color, collapsed: folderCollapsed, guide: group.color })
        if (folderCollapsed) continue
        for (const note of notes) rows.push(noteRow(note, 2, group.color, false))
      }
      continue
    }
    // Ungrouped notes: the "notes" header only shows when something sits above it.
    if (!notesHeaderDone) {
      notesHeaderDone = true
      if (source.favorites.length > 0 || renderedGroup) rows.push({ kind: 'separator', key: 'sep:notes' })
    }
    rows.push(noteRow(item.note, 0, null, false))
  }
  return rows
}

/** Cheap identity of the rows (skip re-rendering the mini-view when an edit didn't change them). */
export function miniRowsSignature(rows: readonly MiniSidebarRow[]): string {
  return rows
    .map((r) => {
      switch (r.kind) {
        case 'separator': return r.key
        case 'group': return `${r.key}:${r.color}:${r.archived ? 1 : 0}:${r.collapsed ? 1 : 0}`
        case 'folder': return `${r.key}:${r.color}:${r.collapsed ? 1 : 0}`
        case 'note': return `${r.key}:${r.depth}:${r.guide ?? ''}:${r.colors.join(',')}`
      }
    })
    .join('|')
}

/**
 * Row the mini-view centres on: the active note at its real place in the list
 * (group/folder/ungrouped), else its favorites copy. -1 when it isn't listed.
 */
export function miniActiveRowIndex(rows: readonly MiniSidebarRow[], activeNoteId: string | null): number {
  if (!activeNoteId) return -1
  let favoriteIndex = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.kind !== 'note' || row.noteId !== activeNoteId) continue
    if (!row.favorite) return i
    if (favoriteIndex < 0) favoriteIndex = i
  }
  return favoriteIndex
}

// ── Mini-view geometry ────────────────────────────────────────────────────────

/** Height (px) of every mini-view row. */
export const MINI_ROW_HEIGHT = 7
/** Gap (px) between mini-view rows. */
export const MINI_ROW_GAP = 4
/** Distance (px) from one row's top to the next. */
export const MINI_ROW_PITCH = MINI_ROW_HEIGHT + MINI_ROW_GAP
/** Left edge (px) of the mini-view items inside the strip. */
export const MINI_ITEM_LEFT = 6
/** Width (px) of a top-level note rectangle (deeper rows shrink by their indent). */
export const MINI_ITEM_WIDTH = 14
/** Indent (px) per depth level. */
export const MINI_INDENT = 3
/** Width (px) of the hover strip at the left edge of the content area that opens the panel. */
export const MINI_STRIP_WIDTH = 24
/**
 * Left padding (px) the editor keeps while the mini-view is shown, so no text
 * runs under it. Exposed to CSS as `--mini-sidebar-reserve` (index.css `.sidebar-floating`).
 */
export const MINI_SIDEBAR_RESERVE = 34

/** Rows that fit in `height` px. */
export function miniSidebarCapacity(height: number): number {
  if (!(height > 0)) return 0
  return Math.max(0, Math.floor((height + MINI_ROW_GAP) / MINI_ROW_PITCH))
}

/**
 * Slice [start, end) of the rows the mini-view draws. Everything when it fits;
 * otherwise a window of `capacity` rows centred on `focusIndex` (the active
 * note) and clamped to the list ends — like a minimap. Without a focus the
 * window starts at the top.
 */
export function miniSidebarWindow(total: number, capacity: number, focusIndex: number): { start: number; end: number } {
  if (capacity <= 0 || total <= 0) return { start: 0, end: 0 }
  if (total <= capacity) return { start: 0, end: total }
  if (focusIndex < 0) return { start: 0, end: capacity }
  const start = Math.min(Math.max(0, focusIndex - Math.floor(capacity / 2)), total - capacity)
  return { start, end: start + capacity }
}

// ── Floating panel placement ──────────────────────────────────────────────────

export interface RectLike {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * The content anchor the floating sidebar lines up with: the leftmost visible
 * one (in a split, the first pane on screen), the topmost on a tie. Anchors
 * with no area or entirely outside the container (scrolled-away panes) are
 * ignored. -1 when none qualifies.
 */
export function pickSidebarAnchor(anchors: readonly RectLike[], container: RectLike): number {
  let best = -1
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    if (a.right - a.left <= 0 || a.bottom - a.top <= 0) continue
    if (a.right <= container.left + 1 || a.left >= container.right - 1) continue
    if (a.bottom <= container.top || a.top >= container.bottom) continue
    const b = best >= 0 ? anchors[best] : null
    if (!b || a.left < b.left - 0.5 || (Math.abs(a.left - b.left) <= 0.5 && a.top < b.top)) best = i
  }
  return best
}

/** Inset (px) between the content edges and the floating panel / mini-view (like the TOC's top-3/bottom-3). */
export const FLOATING_SIDEBAR_INSET = 12
/** Minimum height (px) of the floating panel: a too-short content area grows it downwards first, then upwards. */
export const FLOATING_SIDEBAR_MIN_HEIGHT = 240

/**
 * Vertical placement of the floating panel inside `container` (both offsets
 * relative to the container: `top` from its top edge, `bottom` from its bottom
 * edge). It spans the anchor's box — where the text of the leftmost pane starts
 * and ends — inset a little; without an anchor, the whole container.
 */
export function floatingSidebarBounds(
  container: { top: number; bottom: number },
  anchor: { top: number; bottom: number } | null,
): { top: number; bottom: number } {
  const height = container.bottom - container.top
  const inset = FLOATING_SIDEBAR_INSET
  let top = anchor ? anchor.top - container.top + inset : inset
  let bottom = anchor ? container.bottom - anchor.bottom + inset : inset
  top = Math.max(inset, Math.min(top, height - inset))
  bottom = Math.max(inset, Math.min(bottom, height - inset))
  const minHeight = Math.min(FLOATING_SIDEBAR_MIN_HEIGHT, Math.max(0, height - 2 * inset))
  if (height - top - bottom < minHeight) {
    bottom = Math.max(inset, height - top - minHeight)
    if (height - top - bottom < minHeight) top = Math.max(inset, height - bottom - minHeight)
  }
  return { top: Math.round(top), bottom: Math.round(bottom) }
}
