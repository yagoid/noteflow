import type { NoteSection } from '../types'

/**
 * Returns a new sections array with a copy of `sectionId` inserted right after
 * the original. The copy keeps every per-section field (content, isRawMode,
 * aiHidden…) and only takes the given `id`, `name` and `created` (the copy is a
 * new section, so its `updated` is that same `created`) — and `content` when given
 * (restoring an old version as a new section, see components/VersionHistory).
 * Returns null when the section doesn't exist. Pure: neither the input array nor
 * its sections are mutated.
 */
export function duplicateSectionInList(
  sections: NoteSection[],
  sectionId: string,
  copy: { id: string; name: string; created: string; content?: string },
): { sections: NoteSection[]; section: NoteSection } | null {
  const index = sections.findIndex((s) => s.id === sectionId)
  if (index === -1) return null
  const section: NoteSection = { ...sections[index], id: copy.id, name: copy.name, created: copy.created, updated: copy.created }
  if (copy.content !== undefined) section.content = copy.content
  return {
    sections: [...sections.slice(0, index + 1), section, ...sections.slice(index + 1)],
    section,
  }
}

/**
 * Per-section `updated` of a sections write (`before` = the note's current sections,
 * `next` = what is about to be written; `now` = ISO). A section whose `content` or
 * `name` differs from its `before` version gets `updated: now`; anything else
 * (isRawMode, aiHidden, order, an identical re-save — e.g. the editor emitting the
 * same markdown on mount) keeps its stamp, carried over from `before` if `next`
 * dropped it. A section new to the list without a stamp takes its `created` (it
 * was last changed when it was born); without either (an undeleted old section)
 * it stays unstamped and the UI falls back to note.updated. Returns `next` itself
 * when nothing needs stamping. Pure.
 */
export function stampSectionEdits(before: NoteSection[], next: NoteSection[], now: string): NoteSection[] {
  const prevById = new Map(before.map((s) => [s.id, s]))
  let changed = false
  const out = next.map((s) => {
    const prev = prevById.get(s.id)
    let updated = s.updated
    if (!prev) updated = s.updated ?? s.created
    else if (prev.content !== s.content || prev.name !== s.name) updated = now
    else updated = s.updated ?? prev.updated
    if (updated === s.updated) return s
    changed = true
    return { ...s, updated }
  })
  return changed ? out : next
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
 * Drop on the note overview's "New section" cell: moves `draggedId` to the end of the list.
 * Null when it's missing or already last.
 */
export function moveSectionToEnd(sections: NoteSection[], draggedId: string): NoteSection[] | null {
  const from = sections.findIndex((s) => s.id === draggedId)
  if (from === -1 || from === sections.length - 1) return null
  const next = [...sections]
  const [moved] = next.splice(from, 1)
  next.push(moved)
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
