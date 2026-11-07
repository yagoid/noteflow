// Pure logic of the editor snippets ("fragments" inserted from the toolbar):
// date/time variables, their moment/dayjs-style format tokens and the list
// operations the store persists to snippets.json. No React, no IPC — covered by
// tests/lib/snippets.test.ts. The main process re-sanitizes the file with its
// own module (electron/snippetsFile.ts); see .agents/context/patterns.md § "Editor: fragmentos".

import type { Snippet } from '../types'

export type SnippetLocale = 'en' | 'es'

/** Format used by `{date}` without an explicit format. */
export const DEFAULT_DATE_FORMAT = 'DD-MM-YYYY'
/** Format used by `{time}` without an explicit format. */
export const DEFAULT_TIME_FORMAT = 'HH:mm'
/** Format used by `{datetime}` without an explicit format. */
export const DEFAULT_DATETIME_FORMAT = 'DD-MM-YYYY HH:mm'

// Day/month names are static tables (not Intl.DateTimeFormat): the output must
// be identical on every OS/ICU build — Intl's short Spanish months vary
// ("sept" vs "sep", trailing dots) — and stay testable. Spanish names are
// lowercase, as Spanish writes them ("sábado, 7 de noviembre").
const NAMES: Record<SnippetLocale, { days: string[]; daysShort: string[]; months: string[]; monthsShort: string[] }> = {
  en: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  es: {
    days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    daysShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    monthsShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  },
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// Longest first: the tokenizer takes the first entry that matches at the cursor.
// `yyyy`/`yy` are lenient aliases of `YYYY`/`YY` (lowercase `y` means nothing
// else here, and people coming from date-fns type it that way).
const TOKENS: Array<[string, (d: Date, names: (typeof NAMES)[SnippetLocale]) => string]> = [
  ['YYYY', (d) => String(d.getFullYear()).padStart(4, '0')],
  ['yyyy', (d) => String(d.getFullYear()).padStart(4, '0')],
  ['YY', (d) => pad2(d.getFullYear() % 100)],
  ['yy', (d) => pad2(d.getFullYear() % 100)],
  ['MMMM', (d, n) => n.months[d.getMonth()]],
  ['MMM', (d, n) => n.monthsShort[d.getMonth()]],
  ['MM', (d) => pad2(d.getMonth() + 1)],
  ['M', (d) => String(d.getMonth() + 1)],
  ['DD', (d) => pad2(d.getDate())],
  ['D', (d) => String(d.getDate())],
  ['dddd', (d, n) => n.days[d.getDay()]],
  ['ddd', (d, n) => n.daysShort[d.getDay()]],
  ['HH', (d) => pad2(d.getHours())],
  ['H', (d) => String(d.getHours())],
  ['hh', (d) => pad2(d.getHours() % 12 || 12)],
  ['h', (d) => String(d.getHours() % 12 || 12)],
  ['mm', (d) => pad2(d.getMinutes())],
  ['m', (d) => String(d.getMinutes())],
  ['ss', (d) => pad2(d.getSeconds())],
  ['s', (d) => String(d.getSeconds())],
  ['A', (d) => (d.getHours() < 12 ? 'AM' : 'PM')],
  ['a', (d) => (d.getHours() < 12 ? 'am' : 'pm')],
]

/**
 * Formats `date` with a moment/dayjs-style `format` (YYYY YY MMMM MMM MM M DD D
 * dddd ddd HH H hh h mm m ss s A a). Text inside `[brackets]` is literal; any
 * other character is copied as-is. Note `MM` is the month and `mm` the minutes.
 * Day/month names follow `locale`.
 */
export function formatDateToken(date: Date, format: string, locale: SnippetLocale): string {
  const names = NAMES[locale] ?? NAMES.en
  let out = ''
  let i = 0
  while (i < format.length) {
    if (format[i] === '[') {
      const close = format.indexOf(']', i + 1)
      if (close !== -1) {
        out += format.slice(i + 1, close)
        i = close + 1
        continue
      }
    }
    const token = TOKENS.find(([tok]) => format.startsWith(tok, i))
    if (token) {
      out += token[1](date, names)
      i += token[0].length
    } else {
      out += format[i]
      i++
    }
  }
  return out
}

// `{date}`, `{time}`, `{datetime}`, optionally `:FORMAT` (anything but braces).
const VARIABLE_RE = /\{(date|time|datetime)(?::([^{}]*))?\}/gi

const DEFAULT_FORMATS: Record<string, string> = {
  date: DEFAULT_DATE_FORMAT,
  time: DEFAULT_TIME_FORMAT,
  datetime: DEFAULT_DATETIME_FORMAT,
}

/**
 * Expands the date/time variables of a snippet at instant `date`. All three
 * variables format the same instant — they only differ in their default format
 * (an empty `{date:}` also takes it). Unrecognized `{…}` are left untouched.
 */
export function expandSnippet(content: string, date: Date, locale: SnippetLocale): string {
  return content.replace(VARIABLE_RE, (_match, kind: string, format: string | undefined) => {
    const fmt = format && format.length > 0 ? format : DEFAULT_FORMATS[kind.toLowerCase()]
    return formatDateToken(date, fmt, locale)
  })
}

/** The variable that inserts `format` (the default date format collapses to `{date}`). */
export function dateVariable(format: string): string {
  const fmt = format.trim()
  if (!fmt || fmt === DEFAULT_DATE_FORMAT) return '{date}'
  return `{date:${fmt.replace(/[{}]/g, '')}}`
}

/** Format presets offered by the snippets modal (the long one is phrased per language). */
export function dateFormatPresets(locale: SnippetLocale): string[] {
  return [
    'DD-MM-YYYY',
    'DD/MM/YY',
    'YYYY-MM-DD',
    locale === 'es' ? 'dddd, D [de] MMMM [de] YYYY' : 'dddd, MMMM D, YYYY',
    'ddd DD-MM-YY',
    'D MMM YYYY',
    'HH:mm',
    'hh:mm A',
    'DD-MM-YYYY HH:mm',
    'YYYY-MM-DD HH:mm:ss',
  ]
}

/** One-line preview of a snippet (expanded, first non-empty line, markdown markers kept). */
export function snippetPreviewLine(content: string, date: Date, locale: SnippetLocale, max = 60): string {
  const expanded = expandSnippet(content, date, locale)
  const line = expanded.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// Block-level markdown at the start of a line: headings, lists, tasks, quotes,
// fences, rules, tables.
const BLOCK_SYNTAX_RE = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|(-{3,}|\*{3,}|_{3,})\s*$|\|)/

/**
 * Whether an expanded snippet goes INLINE at the caret (one line, no block
 * syntax) rather than as blocks. Inline marks (**bold**, `code`) don't count.
 */
export function isInlineSnippet(text: string): boolean {
  const trimmed = text.replace(/^\n+|\n+$/g, '')
  if (trimmed.includes('\n')) return false
  return !BLOCK_SYNTAX_RE.test(trimmed)
}

// ── List operations (the store persists their result) ───────────────────────

/** The snippet of the main toolbar click: the one flagged `isDefault`, else the first. */
export function getDefaultSnippet(snippets: Snippet[]): Snippet | null {
  return snippets.find((s) => s.isDefault) ?? snippets[0] ?? null
}

/** Flags `id` as the default (and only it). */
export function setDefaultSnippet(snippets: Snippet[], id: string): Snippet[] {
  return snippets.map((s) => {
    if (s.id === id) return { ...s, isDefault: true }
    if (!s.isDefault) return s
    const { isDefault: _isDefault, ...rest } = s
    return rest
  })
}

/** Moves `id` one position up (-1) or down (+1); out-of-range moves are no-ops. */
export function moveSnippet(snippets: Snippet[], id: string, delta: -1 | 1): Snippet[] {
  const from = snippets.findIndex((s) => s.id === id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= snippets.length) return snippets
  const next = [...snippets]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Name/content edits typed in the modal that are still waiting for their debounced write. */
export type PendingSnippetEdits = Map<string, { name?: string; content?: string }>

/**
 * Reload merge: the list read from disk (another window saved, or a pull
 * brought a new snippets.json) with this window's still-unwritten name/content
 * edits re-applied on top. Structural changes (add, delete, reorder, default)
 * are written immediately, so the disk list is the truth for them; an edit
 * whose snippet no longer exists on disk is dropped (deleted elsewhere wins).
 */
export function applyPendingEdits(disk: Snippet[], pending: PendingSnippetEdits): Snippet[] {
  if (pending.size === 0) return disk
  return disk.map((s) => {
    const patch = pending.get(s.id)
    return patch ? { ...s, ...patch } : s
  })
}

// ── Suggested starters ────────────────────────────────────────────────────────

export type SuggestionId = 'today' | 'dateTime' | 'journal' | 'meeting' | 'timeDivider' | 'signature'

/** Labels the suggestions need from the UI dictionary (names + the localized bits of their content). */
export interface SuggestionLabels {
  names: Record<SuggestionId, string>
  meeting: { title: string; attendees: string; notes: string; actions: string }
  signature: string
}

export const SUGGESTION_IDS: SuggestionId[] = ['today', 'dateTime', 'journal', 'meeting', 'timeDivider', 'signature']

/** Content of a suggested snippet, in the UI language (copied as-is when added). */
export function suggestionContent(id: SuggestionId, labels: SuggestionLabels, locale: SnippetLocale): string {
  const longDate = locale === 'es' ? 'dddd, D [de] MMMM [de] YYYY' : 'dddd, MMMM D, YYYY'
  switch (id) {
    case 'today':
      return '{date:DD-MM-YYYY}'
    case 'dateTime':
      return '{date:DD-MM-YYYY} {time:HH:mm}'
    case 'journal':
      return `## {date:${longDate}}\n\n`
    case 'meeting': {
      const m = labels.meeting
      return `## ${m.title} — {date:DD-MM-YYYY}\n\n**${m.attendees}:** \n\n### ${m.notes}\n\n- \n\n### ${m.actions}\n\n- [ ] `
    }
    case 'timeDivider':
      return '---\n\n**{time:HH:mm}**\n\n'
    case 'signature':
      return `— ${labels.signature}, {date:DD-MM-YYYY}`
  }
}
