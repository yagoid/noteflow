import { useMemo } from 'react'
import type { Note, NoteGroup } from '../../types'

export type SidebarItem =
  | { kind: 'group'; group: NoteGroup; notes: Note[]; visibleCount: number }
  | { kind: 'note'; note: Note }  // ungrouped

export function useSidebarGroups(
  notes: Note[],
  groups: NoteGroup[],
): SidebarItem[] {
  return useMemo(() => {
    const items: SidebarItem[] = []

    if (groups.length === 0) {
      for (const note of notes) {
        items.push({ kind: 'note', note })
      }
      return items
    }

    // Build set of valid group IDs — guards against stale group refs in note.group
    const validGroupIds = new Set(groups.map((g) => g.id))

    // Map groupId → notes that pass filters and belong to that group
    const notesByGroup = new Map<string, Note[]>()
    const ungrouped: Note[] = []

    for (const note of notes) {
      if (note.group && validGroupIds.has(note.group)) {
        const arr = notesByGroup.get(note.group) ?? []
        arr.push(note)
        notesByGroup.set(note.group, arr)
      } else {
        ungrouped.push(note)
      }
    }

    // Emit groups sorted by order
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order)
    for (const group of sortedGroups) {
      const groupNotes = notesByGroup.get(group.id) ?? []
      items.push({ kind: 'group', group, notes: groupNotes, visibleCount: groupNotes.length })
    }

    // Ungrouped notes at the bottom
    for (const note of ungrouped) {
      items.push({ kind: 'note', note })
    }

    return items
  }, [notes, groups])
}
