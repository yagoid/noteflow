import { useMemo } from 'react'
import type { Note, NoteGroup, NoteFolder } from '../../types'
import { buildSidebarItems, type SidebarItem } from '../../lib/sidebarGroups'

export type { SidebarFolder, SidebarItem } from '../../lib/sidebarGroups'

/** The sidebar's items for `notes` (memoized `buildSidebarItems`, lib/sidebarGroups.ts). */
export function useSidebarGroups(
  notes: Note[],
  groups: NoteGroup[],
  folders: NoteFolder[] = [],
  noteOrder: Record<string, string[]> = {},
): SidebarItem[] {
  return useMemo(() => buildSidebarItems(notes, groups, folders, noteOrder), [notes, groups, folders, noteOrder])
}
