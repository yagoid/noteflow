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

// Placeholders for the spans the mark regexes must not reach into (see
// inlineToHtml). Private-use characters; any already present in the input are
// held themselves first, so a placeholder can never be confused with user text.
const HOLD_OPEN = '\uE000'
const HOLD_CLOSE = '\uE001'
const HOLD_RE = /\uE000(\d+)\uE001/g
const HOLD_CHAR_RE = /[\uE000\uE001]/g

/**
 * Underline (`++`) and highlight (`==`) delimiters only count when they flank
 * the text, so the plain-text uses of those characters ("C++", "C++11 vs
 * C++14", "C++/C++", "a ++ b ++ c", "a == b", "x==y", "a === b") stay text:
 *   - an opener is not preceded by a letter, a digit or the marker character,
 *     and the first character after its run of markers is not whitespace;
 *   - a closer is not followed by a letter, a digit or the marker character
 *     (so it takes the LAST two of a run: `++Learn C++++` closes at the end).
 * Whitespace before a closer is tolerated: older builds wrote a mark ending in
 * a space (`++word ++`, e.g. a double-clicked word on Windows) and it still
 * loads. In HTML mode (`html`) runs of spaces are already `&nbsp;` entities.
 */
function flankedMarkRe(c: string, html: boolean): RegExp {
  const word = '\\p{L}\\p{N}'
  return new RegExp(
    `(?<![${c}${word}])${c}${c}(?=${c}*[^\\s${c}])${html ? `(?!${c}*&nbsp;)` : ''}(.+?)${c}${c}(?![${c}${word}])`,
    'gu',
  )
}
const UNDERLINE_RE = flankedMarkRe('\\+', true)
const HIGHLIGHT_RE = flankedMarkRe('=', true)
const MD_MARK_RE = { '+': flankedMarkRe('\\+', false), '=': flankedMarkRe('=', false) }

/**
 * The `++` (`char` '+') or `==` ('=') marks inlineToHtml reads in markdown text,
 * as [opener index, closer index] pairs. `md` must have its code spans, images
 * and link/relation syntax masked with characters that are neither whitespace,
 * letters/digits nor markers (inlineToHtml holds those spans aside). Used by
 * htmlToMarkdown to check that the delimiters it writes read back the same.
 */
export function flankedMarkPairs(md: string, char: '+' | '='): [number, number][] {
  return [...md.matchAll(MD_MARK_RE[char])].map((m) => [m.index, m.index + m[0].length - 2])
}

/** Convert inline markdown (bold, italic, code, links, etc.) to HTML */
export function inlineToHtml(s: string): string {
  // Code spans and the tags generated below are held behind placeholders while
  // the mark regexes run: otherwise `i++` and `j++` in two code spans of one
  // line paired up as an underline across them (misnested HTML, saved back
  // garbled), and a `*`, `__` or `++` inside a URL broke the attribute.
  const held: { html: string; md: string }[] = []
  const hold = (html: string, md: string = html) => `${HOLD_OPEN}${held.push({ html, md }) - 1}${HOLD_CLOSE}`
  // Source text of a value that may contain placeholders (attribute values).
  const source = (v: string): string => v.replace(HOLD_RE, (_, i) => source(held[Number(i)].md))
  const restore = (v: string): string => v.replace(HOLD_RE, (_, i) => restore(held[Number(i)].html))

  const out = s
    .replace(HOLD_CHAR_RE, (ch) => hold(ch))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Preserve runs of 2+ spaces: ProseMirror collapses regular spaces when
    // parsing HTML, so we use &nbsp; to keep them intact.
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
    // Code spans first: their content is literal (no links, images or marks).
    .replace(/`([^`]+)`/g, (m, code) => hold(`<code>${code}</code>`, m))
    // Attribute values (alt/src/href/ids) are already &<>-escaped by the first
    // replace; `attr` also escapes `"` so a URL or alt text can't close the
    // attribute and inject markup (this HTML is rendered with innerHTML by the
    // kanban cards and the previews). getAttribute() decodes it back on the way
    // to markdown, so the round-trip is unchanged. `source` puts back a code
    // span (backticks) that happened to sit inside a URL.
    .replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g, (m, alt, src, w) => hold(
      w ? `<img alt="${attr(source(alt))}" src="${attr(source(src))}" width="${w}">`
        : `<img alt="${attr(source(alt))}" src="${attr(source(src))}">`,
      m,
    ))
    // Section relation: `[Name](noteflow://noteId/sectionId)` → inline pill. Must
    // run BEFORE the generic link regex below (it would otherwise capture it as a
    // plain <a>). Rendered as a span the SectionRelation node parses back.
    .replace(/\[([^\]]+)\]\(noteflow:\/\/([^/)]+)\/([^)]+)\)/g, (_, name, noteId, sectionId) =>
      hold(`<span data-type="section-relation" data-note-id="${attr(source(noteId))}" data-section-id="${attr(source(sectionId))}">`, '[') +
      name +
      hold('</span>', `](noteflow://${noteId}/${sectionId})`))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) =>
      hold(`<a href="${attr(source(href))}">`, '[') + text + hold('</a>', `](${href})`))
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    // Underline: `++text++` → <u>. Markdown has no native underline syntax, so
    // NoteFlow uses `++` (mirrors the `==` highlight convention). Flanking rules
    // in flankedMarkRe; htmlToMarkdown writes it back through flankedMarkPairs.
    .replace(UNDERLINE_RE, '<u>$1</u>')
    // Highlight: `==text==` → <mark>. Non-greedy + global so multiple highlights
    // on one line round-trip. Same flanking rules as underline.
    .replace(HIGHLIGHT_RE, '<mark>$1</mark>')

  return restore(out)
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
 * (taskAnnotationsToMd). `kinds` limits which ones are taken out: a kind set
 * to false stays in the text verbatim and comes back null.
 */
export function extractDeadlineAnnotations(
  raw: string,
  kinds: { due?: boolean; alarm?: boolean; importance?: boolean } = {},
): { text: string; due: string | null; alarm: string | null; importance: TaskImportance | null } {
  let text = raw
  let due: string | null = null
  let alarm: string | null = null
  let importance: TaskImportance | null = null
  const dueMatch = kinds.due === false ? null : text.match(/📅(\d{4}-\d{2}-\d{2})/)
  if (dueMatch) { due = dueMatch[1]; text = cutAnnotation(text, dueMatch) }
  const alarmMatch = kinds.alarm === false ? null : text.match(/⏰(\d{2}:\d{2})/)
  if (alarmMatch) { alarm = alarmMatch[1]; text = cutAnnotation(text, alarmMatch) }
  const impMatch = kinds.importance === false ? null : text.match(/🔺(low|medium|high)/)
  if (impMatch) { importance = impMatch[1] as TaskImportance; text = cutAnnotation(text, impMatch) }
  return { text, due, alarm, importance }
}

/** The annotation suffix for a task line, in the order the parser expects. */
export function taskAnnotationsToMd(
  due: string | null, alarm: string | null, importance: string | null
): string {
  return `${due ? ` 📅${due}` : ''}${alarm ? ` ⏰${alarm}` : ''}${importance ? ` 🔺${importance}` : ''}`
}
