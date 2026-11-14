// Pure model of the sidebar list: its base note order and how it splits the notes into
// groups (loose notes + folders) and the ungrouped tail, with the user's manual order
// (`noteOrder` of groupsStore) applied per context. Shared by the sidebar
// (Sidebar/useSidebarGroups.ts), the brain view and the content view's "As in the sidebar"
// order (lib/contentView.ts buildNoteList). Covered by tests/lib/contentView.test.ts.
import type { Note, NoteFolder, NoteGroup } from '../types'

/** What the grouping reads of a note (a `Note` satisfies it). */
export type SidebarNoteLike = Pick<Note, 'id' | 'group' | 'folder'>

export interface SidebarFolder<N extends SidebarNoteLike = Note> {
  folder: NoteFolder
  notes: N[]
}

export type SidebarItem<N extends SidebarNoteLike = Note> =
  | {
      kind: 'group'
      group: NoteGroup
      notes: N[]                  // loose notes at the group root (no folder)
      folders: SidebarFolder<N>[] // subfolders with their notes
      visibleCount: number        // loose + all folder notes
    }
  | { kind: 'note'; note: N }     // ungrouped

/** The sidebar's base order, before the manual one: newest created first. */
export function compareSidebarNotes(a: Pick<Note, 'created'>, b: Pick<Note, 'created'>): number {
  return new Date(b.created).getTime() - new Date(a.created).getTime()
}

/** Where a dragged item lands relative to the one under the pointer. */
export type DropPosition = 'before' | 'after'

/**
 * Manual reorder by drag & drop (folders of a group, notes of a context): `ids` with
 * `draggedId` moved right before / after `targetId`. Null when the target isn't listed, is
 * the dragged item itself, or the order wouldn't change.
 */
export function moveIdNextTo(
  ids: readonly string[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): string[] | null {
  if (draggedId === targetId) return null
  const next = ids.filter((id) => id !== draggedId)
  let index = next.indexOf(targetId)
  if (index === -1) return null
  if (position === 'after') index += 1
  next.splice(index, 0, draggedId)
  if (next.length === ids.length && next.every((id, i) => id === ids[i])) return null
  return next
}

/** The `noteOrder` key (manual order context) of a note's effective location. */
export function noteOrderKey(groupId: string | null, folderId: string | null): string {
  if (folderId) return `folder:${folderId}`
  if (groupId) return `group:${groupId}`
  return 'ungrouped'
}

function applyOrder<N extends SidebarNoteLike>(notes: N[], orderedIds: string[] | undefined): N[] {
  if (!orderedIds || orderedIds.length === 0) return notes
  const idSet = new Set(orderedIds)
  const ordered = orderedIds.map((id) => notes.find((n) => n.id === id)).filter((n): n is N => n != null)
  const unordered = notes.filter((n) => !idSet.has(n.id))
  return [...ordered, ...unordered]
}

/**
 * The sidebar's items for `notes` (already filtered and in the base order): every group by
 * `order` (archived ones last) with its loose notes and its folders (by `order`), then the
 * ungrouped notes. Each context follows its `noteOrder` key (`group:<id>`, `folder:<id>`,
 * `ungrouped`); notes missing from it keep the base order after the ordered ones. Stale ids
 * on a note fall back like `noteLocation`: unknown group → ungrouped, folder of another group → root.
 */
export function buildSidebarItems<N extends SidebarNoteLike>(
  notes: readonly N[],
  groups: readonly NoteGroup[],
  folders: readonly NoteFolder[] = [],
  noteOrder: Record<string, string[]> = {},
): SidebarItem<N>[] {
  const items: SidebarItem<N>[] = []

  if (groups.length === 0) {
    const ordered = applyOrder([...notes], noteOrder['ungrouped'])
    for (const note of ordered) {
      items.push({ kind: 'note', note })
    }
    return items
  }

  // Build sets/maps of valid refs — guards against stale ids on notes
  const validGroupIds = new Set(groups.map((g) => g.id))
  const folderById = new Map(folders.map((f) => [f.id, f]))

  // Map groupId → loose notes; folderId → notes
  const looseByGroup = new Map<string, N[]>()
  const notesByFolder = new Map<string, N[]>()
  const ungrouped: N[] = []

  for (const note of notes) {
    if (!note.group || !validGroupIds.has(note.group)) {
      ungrouped.push(note)
      continue
    }
    // Note belongs to a valid group. Does it sit in a valid folder of that group?
    const folder = note.folder ? folderById.get(note.folder) : undefined
    if (folder && folder.groupId === note.group) {
      const arr = notesByFolder.get(folder.id) ?? []
      arr.push(note)
      notesByFolder.set(folder.id, arr)
    } else {
      const arr = looseByGroup.get(note.group) ?? []
      arr.push(note)
      looseByGroup.set(note.group, arr)
    }
  }

  // Emit groups sorted by order; archived groups sink to the bottom
  const sortedGroups = [...groups].sort(
    (a, b) => (Number(!!a.archived) - Number(!!b.archived)) || (a.order - b.order),
  )
  for (const group of sortedGroups) {
    const looseNotes = applyOrder(looseByGroup.get(group.id) ?? [], noteOrder[`group:${group.id}`])
    const groupFolders = folders
      .filter((f) => f.groupId === group.id)
      .sort((a, b) => a.order - b.order)
      .map((folder) => ({
        folder,
        notes: applyOrder(notesByFolder.get(folder.id) ?? [], noteOrder[`folder:${folder.id}`]),
      }))

    const folderNoteCount = groupFolders.reduce((sum, f) => sum + f.notes.length, 0)
    items.push({
      kind: 'group',
      group,
      notes: looseNotes,
      folders: groupFolders,
      visibleCount: looseNotes.length + folderNoteCount,
    })
  }

  // Ungrouped notes at the bottom
  const orderedUngrouped = applyOrder(ungrouped, noteOrder['ungrouped'])
  for (const note of orderedUngrouped) {
    items.push({ kind: 'note', note })
  }

  return items
}
