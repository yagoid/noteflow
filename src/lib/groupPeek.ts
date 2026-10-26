// Pure helpers for the collapsed-group peek (components/Sidebar/GroupPeek.tsx): the
// flat note list of a group, its filter, keyboard selection and placement. No DOM /
// store imports so they can be unit-tested (tests/lib/groupPeek.test.ts).
import { noteMatchesQuery, parseSearchQuery } from './searchUtils'

type SearchableNote = Parameters<typeof noteMatchesQuery>[0]

/** Structural mirror of a group `SidebarItem` (Sidebar/useSidebarGroups.ts). */
export interface GroupPeekSource<N> {
  /** Loose notes at the group root, in sidebar order. */
  notes: readonly N[]
  /** Subfolders in sidebar order, each with its notes in sidebar order. */
  folders: readonly { folder: { id: string; name: string }; notes: readonly N[] }[]
}

export interface GroupPeekEntry<N> {
  note: N
  /** The folder the note sits in (null for loose notes at the group root). */
  folder: { id: string; name: string } | null
}

/**
 * The group's notes as one flat list: loose notes first, then each folder's notes,
 * all in the order the sidebar shows them when the group is expanded.
 */
export function flattenGroupPeekEntries<N>(src: GroupPeekSource<N>): GroupPeekEntry<N>[] {
  const entries: GroupPeekEntry<N>[] = src.notes.map((note) => ({ note, folder: null }))
  for (const { folder, notes } of src.folders) {
    const ref = { id: folder.id, name: folder.name }
    for (const note of notes) entries.push({ note, folder: ref })
  }
  return entries
}

/**
 * Entries matching the peek's search box — same rules (and cached index) as the
 * sidebar search, `#section` filter included. An empty query returns the same array.
 */
export function filterGroupPeekEntries<N extends SearchableNote>(
  entries: GroupPeekEntry<N>[],
  query: string,
): GroupPeekEntry<N>[] {
  if (!query.trim()) return entries
  const parsed = parseSearchQuery(query)
  return entries.filter((e) => noteMatchesQuery(e.note, parsed))
}

/** Next keyboard selection (↑/↓), wrapping around the ends. -1 when the list is empty. */
export function moveGroupPeekSelection(index: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return -1
  if (index < 0) return delta === 1 ? 0 : length - 1
  return (index + delta + length) % length
}

/** Gap (px) between the sidebar's right edge and the peek. */
export const GROUP_PEEK_GAP = 6
/** Minimum distance (px) kept from the viewport edges. */
export const GROUP_PEEK_MARGIN = 8

/**
 * Where the peek goes: just right of the sidebar, its top level with the group
 * header; pulled back inside the viewport when it would overflow (up if it doesn't
 * fit below, left if the window is too narrow).
 */
export function groupPeekPosition(
  anchor: { top: number; sidebarRight: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  let left = anchor.sidebarRight + GROUP_PEEK_GAP
  if (left + size.width + GROUP_PEEK_MARGIN > viewport.width) left = viewport.width - size.width - GROUP_PEEK_MARGIN
  left = Math.max(GROUP_PEEK_MARGIN, left)
  let top = anchor.top
  if (top + size.height + GROUP_PEEK_MARGIN > viewport.height) top = viewport.height - size.height - GROUP_PEEK_MARGIN
  top = Math.max(GROUP_PEEK_MARGIN, top)
  return { left: Math.round(left), top: Math.round(top) }
}
