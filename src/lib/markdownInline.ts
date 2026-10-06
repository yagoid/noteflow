// ── Inline markdown helpers ──────────────────────────────────────────────────
//
// Leaf module shared by markdownHtml.ts (block-level md↔html) and kanban.ts
// (in-note kanban boards). Lives apart so both can use it without an import
// cycle between them.

export type TaskImportance = 'low' | 'medium' | 'high'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// For values already &<>-escaped by inlineToHtml: only `"` is left to escape.
const attr = (v: string) => v.replace(/"/g, '&quot;')

/** Convert inline markdown (bold, italic, code, links, etc.) to HTML */
export function inlineToHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Preserve runs of 2+ spaces: ProseMirror collapses regular spaces when
    // parsing HTML, so we use &nbsp; to keep them intact.
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
    // Attribute values (alt/src/href/ids) are already &<>-escaped by the first
    // replace; `attr` also escapes `"` so a URL or alt text can't close the
    // attribute and inject markup (this HTML is rendered with innerHTML by the
    // kanban cards and the previews). getAttribute() decodes it back on the way
    // to markdown, so the round-trip is unchanged.
    .replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g, (_, alt, src, w) =>
      w ? `<img alt="${attr(alt)}" src="${attr(src)}" width="${w}">` : `<img alt="${attr(alt)}" src="${attr(src)}">`)
    // Section relation: `[Name](noteflow://noteId/sectionId)` → inline pill. Must
    // run BEFORE the generic link regex below (it would otherwise capture it as a
    // plain <a>). Rendered as a span the SectionRelation node parses back.
    .replace(/\[([^\]]+)\]\(noteflow:\/\/([^/)]+)\/([^)]+)\)/g, (_, name, noteId, sectionId) =>
      `<span data-type="section-relation" data-note-id="${attr(noteId)}" data-section-id="${attr(sectionId)}">${name}</span>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => `<a href="${attr(href)}">${text}</a>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    // Underline: `++text++` → <u>. Markdown has no native underline syntax, so
    // NoteFlow uses `++` (mirrors the `==` highlight convention). Non-greedy +
    // global; `++` doesn't collide with **/*/__/~~/== markers.
    .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
    // Highlight: `==text==` → <mark>. Non-greedy + global so multiple highlights
    // on one line round-trip. `==` doesn't collide with **/*/__/~~ markers.
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
}

// Remove a matched annotation, closing the gap around it to a single space so
// one written mid-text ("Fix 📅2026-01-01 #ui") doesn't leave a double space
// behind once the serializer moves it to the end of the line.
function cutAnnotation(text: string, m: RegExpMatchArray): string {
  const i = m.index ?? 0
  return `${text.slice(0, i).replace(/[ \t]+$/, '')} ${text.slice(i + m[0].length).replace(/^[ \t]+/, '')}`.trim()
}

/**
 * Pull the task annotations (📅YYYY-MM-DD, ⏰HH:MM, 🔺low|medium|high) out of a
 * task's text. Serializers write them back in this same order, after the text
 * (taskAnnotationsToMd).
 */
export function extractDeadlineAnnotations(
  raw: string
): { text: string; due: string | null; alarm: string | null; importance: TaskImportance | null } {
  let text = raw
  let due: string | null = null
  let alarm: string | null = null
  let importance: TaskImportance | null = null
  const dueMatch = text.match(/📅(\d{4}-\d{2}-\d{2})/)
  if (dueMatch) { due = dueMatch[1]; text = cutAnnotation(text, dueMatch) }
  const alarmMatch = text.match(/⏰(\d{2}:\d{2})/)
  if (alarmMatch) { alarm = alarmMatch[1]; text = cutAnnotation(text, alarmMatch) }
  const impMatch = text.match(/🔺(low|medium|high)/)
  if (impMatch) { importance = impMatch[1] as TaskImportance; text = cutAnnotation(text, impMatch) }
  return { text, due, alarm, importance }
}

/** The annotation suffix for a task line, in the order the parser expects. */
export function taskAnnotationsToMd(
  due: string | null, alarm: string | null, importance: string | null
): string {
  return `${due ? ` 📅${due}` : ''}${alarm ? ` ⏰${alarm}` : ''}${importance ? ` 🔺${importance}` : ''}`
}
