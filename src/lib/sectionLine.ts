// Pure helpers of the sidebar note row's section map (Sidebar/NoteSectionMap.tsx): the
// widths of the folded line's segments and the section the open note shows. Covered by
// tests/lib/sectionLine.test.ts. See "Sidebar: item de nota" in .agents/context/patterns.md.

/**
 * Smallest share of the line a section gets, so an empty section beside a long one still
 * reads as a segment (the CSS also enforces a 4px minimum width).
 */
export const SECTION_LINE_MIN_SHARE = 0.03

/**
 * Relative widths (summing to 1) of the folded line's segments, one per section:
 * proportional to each section's size (e.g. its content length, already in memory), with
 * a floor of SECTION_LINE_MIN_SHARE (never above an equal split). With no size at all
 * (every section empty, or no content in memory) the segments share the line equally.
 */
export function sectionLineWeights(sizes: readonly number[]): number[] {
  const n = sizes.length
  if (n === 0) return []
  const clean = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 0))
  const total = clean.reduce((a, b) => a + b, 0)
  if (total <= 0) return clean.map(() => 1 / n)
  const floor = Math.min(SECTION_LINE_MIN_SHARE, 1 / n)
  const floored = clean.map((s) => Math.max(s / total, floor))
  const sum = floored.reduce((a, b) => a + b, 0)
  return floored.map((w) => w / sum)
}

/**
 * The section the sidebar marks as open on the active note, in the order NoteEditor
 * resolves it: the section of the pane showing the note, else the one remembered for
 * the note, else the first. `paneSectionId` is null when no pane shows the note (e.g.
 * its note overview is open while no pane holds the note — with a pane on it, that
 * pane's section wins as usual): then only the remembered section counts, or none.
 */
export function resolveOpenSectionId(
  sectionIds: readonly string[],
  paneSectionId: string | null,
  rememberedSectionId: string | null,
): string | null {
  const has = (id: string | null | undefined): id is string => !!id && sectionIds.includes(id)
  if (paneSectionId === null) return has(rememberedSectionId) ? rememberedSectionId : null
  if (has(paneSectionId)) return paneSectionId
  if (has(rememberedSectionId)) return rememberedSectionId
  return sectionIds[0] ?? null
}
