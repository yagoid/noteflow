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
