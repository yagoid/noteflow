// ── Inline markdown helpers ──────────────────────────────────────────────────
//
// Leaf module shared by markdownHtml.ts (block-level md↔html) and kanban.ts
// (in-note kanban boards). Lives apart so both can use it without an import
// cycle between them.

import { AGENT_MARKER_RE, agentMarkerText } from './agentTasks'

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
 * as [opener index, closer index] pairs. `md` must have its code spans, escapes,
 * images, link/relation syntax and emphasis delimiters masked with characters
 * that are neither whitespace, letters/digits nor markers (inlineToHtml holds
 * those aside or has turned them into tags by then): readInline().masked.
 */
export function flankedMarkPairs(md: string, char: '+' | '='): [number, number][] {
  return [...md.matchAll(MD_MARK_RE[char])].map((m) => [m.index, m.index + m[0].length - 2])
}

/**
 * The characters a backslash escapes (`\*` is a literal `*`): only the ones with
 * an inline meaning here — code, emphasis, strike, links/images, underline,
 * highlight. A backslash before anything else is text, so Windows paths
 * (`C:\Users\me`, `\\server\share`) read as written. Before one of them, a run of
 * backslashes pairs up (`\\` = one `\`) and an odd one left over escapes it:
 * `\\*` is a `\` and then a `*` that still counts as syntax. htmlToMarkdown
 * writes an escape only where the text would otherwise read back as syntax
 * (writeLine in markdownHtml.ts), and doubles a literal `\` only before these.
 */
export const INLINE_ESCAPABLE = '`*_~[]!+='

/** A code span or a backslash escape of a line of inline markdown (inlineLiteralSpans). */
export interface InlineLiteralSpan {
  start: number
  /** Exclusive. */
  end: number
  code: boolean
  /** What it stands for: the code (without its backticks), or the escaped text. */
  text: string
}

/**
 * The code spans and backslash escapes of a line, left to right: the first thing
 * inlineToHtml reads, and literal for every rule after it. A code span runs from
 * a backtick to the next one with at least one character between (its content
 * is literal, escapes included: `` `C:\` `` is code); an escape is a run of
 * backslashes before an INLINE_ESCAPABLE character (an escaped backtick never
 * opens a code span).
 */
export function inlineLiteralSpans(s: string): InlineLiteralSpan[] {
  const spans: InlineLiteralSpan[] = []
  for (let i = 0; i < s.length;) {
    if (s[i] === '\\') {
      let j = i + 1
      while (s[j] === '\\') j++
      const next = s[j]
      if (next !== undefined && INLINE_ESCAPABLE.includes(next)) {
        const odd = (j - i) % 2 === 1
        const end = odd ? j + 1 : j
        spans.push({ start: i, end, code: false, text: '\\'.repeat((j - i) >> 1) + (odd ? next : '') })
        i = end
      } else {
        i = j
      }
      continue
    }
    if (s[i] === '`') {
      const close = s.indexOf('`', i + 1)
      if (close > i + 1) {
        spans.push({ start: i, end: close + 1, code: true, text: s.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }
    i++
  }
  return spans
}

// The link-like syntax and the emphasis delimiters, in the order inlineToHtml
// applies them (readInline replays the same regexes).
const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g
const RELATION_RE = /\[([^\]]+)\]\(noteflow:\/\/([^/)]+)\/([^)]+)\)/g
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g
const EMPHASIS: { re: RegExp; delim: number; open: string; close: string }[] = [
  { re: /\*\*\*(.+?)\*\*\*/g, delim: 3, open: '<strong><em>', close: '</em></strong>' },
  { re: /\*\*(.+?)\*\*/g, delim: 2, open: '<strong>', close: '</strong>' },
  { re: /\*(.+?)\*/g, delim: 1, open: '<em>', close: '</em>' },
  { re: /__(.+?)__/g, delim: 2, open: '<strong>', close: '</strong>' },
  { re: /~~(.+?)~~/g, delim: 2, open: '<s>', close: '</s>' },
]

/** How inlineToHtml reads one line of markdown, by position (readInline). */
export interface InlineReading {
  /** Code spans and escapes (inlineLiteralSpans). */
  literal: InlineLiteralSpan[]
  /** Where each image, section relation and link starts. */
  links: number[]
  /** Every `*`, `_` and `~` read as an emphasis delimiter. */
  emphasis: number[]
  /** The line as the `++`/`==` regexes see it, all of the above masked (for flankedMarkPairs). */
  masked: string
}

const MASK = '\uE000'

/**
 * Replays inlineToHtml's reading of one line (no line breaks) on positions
 * instead of HTML: what htmlToMarkdown uses to check that every `*`, `` ` ``,
 * `[`… it writes as text stays text. Masking keeps every position: what the
 * parser holds aside or turns into tags becomes MASK (never syntax, never a
 * letter or whitespace), so later rules see the same characters it does.
 */
export function readInline(md: string): InlineReading {
  const literal = inlineLiteralSpans(md)
  const chars = md.split('')
  const mask = (from: number, to: number) => { for (let k = from; k < to; k++) chars[k] = MASK }
  for (const sp of literal) mask(sp.start, sp.end)

  const links: number[] = []
  let s = chars.join('')
  for (const m of s.matchAll(IMAGE_RE)) { links.push(m.index); mask(m.index, m.index + m[0].length) }
  // Relations and links: their `[` and `](…)` are held; the text between stays visible.
  for (const re of [RELATION_RE, LINK_RE]) {
    s = chars.join('')
    for (const m of s.matchAll(re)) {
      links.push(m.index)
      mask(m.index, m.index + 1)
      mask(m.index + 1 + m[1].length, m.index + m[0].length)
    }
  }

  const emphasis: number[] = []
  s = chars.join('')
  for (const { re, delim } of EMPHASIS) {
    s = s.replace(re, (m: string, inner: string, at: number) => {
      for (let k = 0; k < delim; k++) emphasis.push(at + k, at + m.length - delim + k)
      return MASK.repeat(delim) + inner + MASK.repeat(delim)
    })
  }
  return { literal, links, emphasis, masked: s }
}

export interface InlineHtmlOptions {
  /**
   * Plain Markdown (linked notes, lib/linkedNotes.ts): NoteFlow's own inline syntax —
   * `++underline++`, `==highlight==` and section-relation links — stays text (a
   * relation link is a regular link).
   */
  plain?: boolean
  /** Read-only renderers only: maps an image src to its display URL. */
  imageSrc?: (src: string) => string
}

/** Convert inline markdown (bold, italic, code, links, etc.) to HTML */
export function inlineToHtml(s: string, opts?: InlineHtmlOptions): string {
  const plain = !!opts?.plain
  const mapSrc = opts?.imageSrc
  // Code spans and the tags generated below are held behind placeholders while
  // the mark regexes run: otherwise `i++` and `j++` in two code spans of one
  // line paired up as an underline across them (misnested HTML, saved back
  // garbled), and a `*`, `__` or `++` inside a URL broke the attribute.
  const held: { html: string; md: string }[] = []
  const hold = (html: string, md: string = html) => `${HOLD_OPEN}${held.push({ html, md }) - 1}${HOLD_CLOSE}`
  // Source text of a value that may contain placeholders (attribute values).
  const source = (v: string): string => v.replace(HOLD_RE, (_, i) => source(held[Number(i)].md))
  const restore = (v: string): string => v.replace(HOLD_RE, (_, i) => restore(held[Number(i)].html))

  // Code spans and backslash escapes first: what they hold is literal (no links,
  // images or marks). An escape keeps its source for attribute values: a URL
  // is written back exactly as it was (`C:\_x.png`).
  const holdLiterals = (v: string): string => {
    let res = ''
    let at = 0
    for (const sp of inlineLiteralSpans(v)) {
      res += v.slice(at, sp.start) + hold(sp.code ? `<code>${sp.text}</code>` : sp.text, v.slice(sp.start, sp.end))
      at = sp.end
    }
    return res + v.slice(at)
  }

  const out = holdLiterals(s
    .replace(HOLD_CHAR_RE, (ch) => hold(ch))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Preserve runs of 2+ spaces: ProseMirror collapses regular spaces when
    // parsing HTML, so we use &nbsp; to keep them intact.
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length)))
    // Attribute values (alt/src/href/ids) are already &<>-escaped by the first
    // replace; `attr` also escapes `"` so a URL or alt text can't close the
    // attribute and inject markup (this HTML is rendered with innerHTML by the
    // kanban cards and the previews). getAttribute() decodes it back on the way
    // to markdown, so the round-trip is unchanged. `source` puts back a code
    // span (backticks) that happened to sit inside a URL.
    .replace(IMAGE_RE, (m, alt, src, w) => {
      // `src` is &<>-escaped here; the mapper gets (and returns) the decoded value.
      const shown = mapSrc ? escapeHtml(mapSrc(source(src).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))) : source(src)
      return hold(
        w ? `<img alt="${attr(source(alt))}" src="${attr(shown)}" width="${w}">`
          : `<img alt="${attr(source(alt))}" src="${attr(shown)}">`,
        m,
      )
    })
    // Section relation: `[Name](noteflow://noteId/sectionId)` → inline pill. Must
    // run BEFORE the generic link regex below (it would otherwise capture it as a
    // plain <a>). Rendered as a span the SectionRelation node parses back.
    .replace(RELATION_RE, (m, name, noteId, sectionId) => plain ? m :
      hold(`<span data-type="section-relation" data-note-id="${attr(source(noteId))}" data-section-id="${attr(source(sectionId))}">`, '[') +
      name +
      hold('</span>', `](noteflow://${noteId}/${sectionId})`))
    .replace(LINK_RE, (_, text, href) =>
      hold(`<a href="${attr(source(href))}">`, '[') + text + hold('</a>', `](${href})`))
  // Bold-italic, bold, italic, `__bold__`, strike — in this order.
  const emphasized = EMPHASIS.reduce((acc, { re, open, close }) => acc.replace(re, `${open}$1${close}`), out)

  // Underline: `++text++` → <u>. Markdown has no native underline syntax, so
  // NoteFlow uses `++` (mirrors the `==` highlight convention). Flanking rules
  // in flankedMarkRe; htmlToMarkdown writes it back through flankedMarkPairs.
  // Highlight: `==text==` → <mark>. Non-greedy + global so multiple highlights
  // on one line round-trip. Same flanking rules as underline.
  // Neither in plain Markdown (linked notes): they stay text.
  const marked = plain ? emphasized : emphasized.replace(UNDERLINE_RE, '<u>$1</u>').replace(HIGHLIGHT_RE, '<mark>$1</mark>')

  return restore(marked)
}

// Remove a matched annotation, closing the gap around it to a single space so
// one written mid-text ("Fix 📅2026-01-01 #ui") doesn't leave a double space
// behind once the serializer moves it to the end of the line.
function cutAnnotation(text: string, m: RegExpMatchArray): string {
  const i = m.index ?? 0
  return `${text.slice(0, i).replace(/[ \t]+$/, '')} ${text.slice(i + m[0].length).replace(/^[ \t]+/, '')}`.trim()
}

export interface TaskAnnotations {
  text: string
  due: string | null
  alarm: string | null
  importance: TaskImportance | null
  /** Agent-task marker (`🤖<id>:<state>`): both set, or both null. */
  agentId: string | null
  agentState: string | null
}

/**
 * Pull the task annotations (📅YYYY-MM-DD, ⏰HH:MM, 🔺low|medium|high and the
 * agent-task marker 🤖<id>:<state>) out of a task's text. Serializers write
 * them back in this same order, after the text (taskAnnotationsToMd). `kinds`
 * limits which ones are taken out: a kind set to false stays in the text
 * verbatim and comes back null.
 *
 * The agent marker is read anywhere in the text and always written last. A
 * task has ONE: the first is the task's, any other on the same line is dropped
 * (what the CLI's withAgentMarker does when it rewrites the line) — left in
 * the text, the next save would write it before the first and swap them.
 */
export function extractDeadlineAnnotations(
  raw: string,
  kinds: { due?: boolean; alarm?: boolean; importance?: boolean; agent?: boolean } = {},
): TaskAnnotations {
  let text = raw
  let due: string | null = null
  let alarm: string | null = null
  let importance: TaskImportance | null = null
  let agentId: string | null = null
  let agentState: string | null = null
  const dueMatch = kinds.due === false ? null : text.match(/📅(\d{4}-\d{2}-\d{2})/)
  if (dueMatch) { due = dueMatch[1]; text = cutAnnotation(text, dueMatch) }
  const alarmMatch = kinds.alarm === false ? null : text.match(/⏰(\d{2}:\d{2})/)
  if (alarmMatch) { alarm = alarmMatch[1]; text = cutAnnotation(text, alarmMatch) }
  const impMatch = kinds.importance === false ? null : text.match(/🔺(low|medium|high)/)
  if (impMatch) { importance = impMatch[1] as TaskImportance; text = cutAnnotation(text, impMatch) }
  if (kinds.agent !== false && text.includes('🤖')) {
    for (let m = text.match(AGENT_MARKER_RE); m; m = text.match(AGENT_MARKER_RE)) {
      if (agentId === null) { agentId = m[2]; agentState = m[3] }
      text = cutAnnotation(text, m)
    }
  }
  return { text, due, alarm, importance, agentId, agentState }
}

/** The agent-task marker of a task (` 🤖<id>:<state>`, leading space included), or '' without a writable one. */
export function agentMarkerToMd(agentId: string | null | undefined, agentState: string | null | undefined): string {
  const marker = agentMarkerText(agentId, agentState)
  return marker ? ` ${marker}` : ''
}

/** The annotation suffix for a task line, in the order the parser expects (the agent marker always last). */
export function taskAnnotationsToMd(
  due: string | null, alarm: string | null, importance: string | null,
  agentId?: string | null, agentState?: string | null,
): string {
  return `${due ? ` 📅${due}` : ''}${alarm ? ` ⏰${alarm}` : ''}${importance ? ` 🔺${importance}` : ''}${agentMarkerToMd(agentId, agentState)}`
}
