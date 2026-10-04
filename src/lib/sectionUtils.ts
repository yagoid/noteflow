import type { NoteSection } from '../types'

/**
 * Returns a new sections array with a copy of `sectionId` inserted right after
 * the original. The copy keeps every per-section field (content, isRawMode,
 * aiHidden…) and only takes the given `id` and `name`. Returns null when the
 * section doesn't exist. Pure: neither the input array nor its sections are mutated.
 */
export function duplicateSectionInList(
  sections: NoteSection[],
  sectionId: string,
  copy: { id: string; name: string },
): { sections: NoteSection[]; section: NoteSection } | null {
  const index = sections.findIndex((s) => s.id === sectionId)
  if (index === -1) return null
  const section: NoteSection = { ...sections[index], id: copy.id, name: copy.name }
  return {
    sections: [...sections.slice(0, index + 1), section, ...sections.slice(index + 1)],
    section,
  }
}

/**
 * Applies `patch` to ONE section of the list. Returns null when the section no longer
 * exists (deleted meanwhile — the caller must NOT resurrect it) or when the patch
 * changes nothing. Used by the store's per-section writes, which always merge onto the
 * LATEST sections so two editors of the same note (split panes, section windows) never
 * overwrite each other's sections with a stale snapshot.
 */
export function patchSectionInList(
  sections: NoteSection[],
  sectionId: string,
  patch: Partial<Omit<NoteSection, 'id'>>,
): NoteSection[] | null {
  const index = sections.findIndex((s) => s.id === sectionId)
  if (index === -1) return null
  const current = sections[index]
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => current[k] !== patch[k])
  if (!changed) return null
  const next = [...sections]
  next[index] = { ...current, ...patch }
  return next
}

/**
 * Tab drag-and-drop: moves `draggedId` to the position `targetId` occupies. Null when
 * either id is missing or they're the same.
 */
export function moveSectionInList(
  sections: NoteSection[],
  draggedId: string,
  targetId: string,
): NoteSection[] | null {
  if (draggedId === targetId) return null
  const from = sections.findIndex((s) => s.id === draggedId)
  const to = sections.findIndex((s) => s.id === targetId)
  if (from === -1 || to === -1) return null
  const next = [...sections]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Undo of a section delete: re-inserts `section` at `index` (clamped) into the CURRENT
 * list, so edits made to other sections in the meantime survive. Null if it's back already.
 */
export function restoreSectionInList(
  sections: NoteSection[],
  section: NoteSection,
  index: number,
): NoteSection[] | null {
  if (sections.some((s) => s.id === section.id)) return null
  const at = Math.max(0, Math.min(index, sections.length))
  return [...sections.slice(0, at), { ...section }, ...sections.slice(at)]
}
