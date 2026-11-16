// ── Table data helpers (framework-free) ──────────────────────────────────────
//
// Pure functions over text matrices (`string[][]`, row-major, row 0 = header
// when it matters) for the editor's table operations: sorting order, the
// summary of a cell selection, copying cells as markdown / TSV and reading
// pasted TSV / CSV back. Nothing here knows about ProseMirror: the commands in
// src/components/Editor/tableOps.ts extract the matrix (cell text = the cell's
// blocks joined with '\n') and apply the result. Behaviour decisions are
// documented in .agents/context/patterns.md ("Operaciones de tabla").

import { containsMarkdownTable } from './markdownHtml'

export type TableAlign = 'left' | 'center' | 'right' | null
export type SortDirection = 'asc' | 'desc'

// ── Numbers ──────────────────────────────────────────────────────────────────

// Optional sign (ASCII or U+2212 minus), digits, at most one decimal separator
// ('.' or ',') followed by digits. No thousands separators, exponents, spaces,
// currency or percent signs: anything else is text.
const NUMBER_RE = /^([+\-−]?)(\d*)(?:([.,])(\d+))?$/
// "1,234" / "-12,500": an English reader sees a thousands separator, a Spanish
// one a decimal comma. Too ambiguous to guess, so it isn't a number.
const AMBIGUOUS_COMMA_RE = /^[+\-−]?[1-9]\d{0,2},\d{3}$/

/**
 * The number a cell holds, or null if it isn't a plain number. Accepts an
 * optional sign and one decimal separator, '.' or ',' ("3.5", "3,5", "-.5").
 * A dot is always decimal; a comma too, except the "1,234" shape (1-3 digits
 * not starting with 0, a comma, exactly three digits), which reads as a
 * thousands separator in English and is rejected rather than misread.
 */
export function parseCellNumber(text: string): number | null {
  const s = text.trim()
  const m = NUMBER_RE.exec(s)
  if (!m) return null
  const [, sign, int, sep, frac] = m
  if (!int && !frac) return null
  if (sep === ',' && AMBIGUOUS_COMMA_RE.test(s)) return null
  const negative = sign === '-' || sign === '−'
  const value = Number(`${negative ? '-' : ''}${int || '0'}${frac ? `.${frac}` : ''}`)
  return Number.isFinite(value) ? value : null
}

function decimalsOf(text: string): number {
  const m = NUMBER_RE.exec(text.trim())
  return m?.[4]?.length ?? 0
}

const isEmpty = (text: string) => text.trim() === ''

/** True if the column has at least one non-empty cell and every non-empty cell is a number. */
export function isNumericColumn(values: readonly string[]): boolean {
  let any = false
  for (const v of values) {
    if (isEmpty(v)) continue
    if (parseCellNumber(v) === null) return false
    any = true
  }
  return any
}

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * The order to sort `values` by: the indices of `values` in their new order.
 * Numeric comparison when the column is numeric (isNumericColumn), otherwise a
 * locale-aware collator (numeric: "item 2" < "item 10"; sensitivity 'accent':
 * case-insensitive, accent-aware). Empty cells always go last, also when
 * descending. Stable in both directions: ties keep their original order
 * (descending is not the reverse of ascending).
 */
export function sortOrder(
  values: readonly string[],
  direction: SortDirection,
  locale?: string | string[],
): number[] {
  const numeric = isNumericColumn(values)
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'accent' })
  const keys = values.map((v) => (numeric ? parseCellNumber(v) : v.trim()))
  const sign = direction === 'desc' ? -1 : 1
  return values
    .map((_, i) => i)
    .sort((a, b) => {
      const ea = isEmpty(values[a]), eb = isEmpty(values[b])
      if (ea || eb) return ea === eb ? a - b : ea ? 1 : -1
      const ka = keys[a], kb = keys[b]
      const cmp = numeric
        ? Math.sign((ka as number) - (kb as number))
        : collator.compare(ka as string, kb as string)
      return cmp !== 0 ? sign * cmp : a - b
    })
}

// ── Selection summary ────────────────────────────────────────────────────────

export interface CellSummary {
  /** Cells in the selection. */
  count: number
  /** Non-empty cells. */
  filled: number
  /** Cells holding a number (parseCellNumber). */
  numeric: number
  /** Sum of the numeric cells, rounded to the most decimals any of them has
   *  (0.1 + 0.2 → 0.3); null when there are none. */
  sum: number | null
  /** Mean of the numeric cells (unrounded); null when there are none. */
  average: number | null
  /** Smallest / largest numeric cell; null when there are none. */
  min: number | null
  max: number | null
  /** Most decimals any numeric cell is written with (`3,50` → 2): how to show sum / min / max. */
  decimals: number
}

/** Count / sum / average of a block of cells (any shape; rows may be ragged). */
export function summarizeCells(rows: readonly (readonly string[])[]): CellSummary {
  let count = 0, filled = 0, numeric = 0, sum = 0, decimals = 0
  let min = Infinity, max = -Infinity
  for (const row of rows) {
    for (const cell of row) {
      count++
      if (isEmpty(cell)) continue
      filled++
      const n = parseCellNumber(cell)
      if (n === null) continue
      numeric++
      sum += n
      min = Math.min(min, n)
      max = Math.max(max, n)
      decimals = Math.max(decimals, decimalsOf(cell))
    }
  }
  if (numeric === 0) return { count, filled, numeric, sum: null, average: null, min: null, max: null, decimals: 0 }
  const rounded = Number(sum.toFixed(Math.min(decimals, 20)))
  const noNegZero = (n: number) => (Object.is(n, -0) ? 0 : n)
  return { count, filled, numeric, sum: noNegZero(rounded), average: sum / numeric, min: noNegZero(min), max: noNegZero(max), decimals }
}

const numberFormats = new Map<string, Intl.NumberFormat>()

/**
 * `n` written for the UI language (`es` → es-ES, otherwise en-US: decimal
 * comma and point, each locale's own grouping), with `minDecimals` …
 * `maxDecimals` decimals. The table summary pill: sum / min / max with the
 * inputs' decimals (`CellSummary.decimals`, so 2,50 + 1 shows 3,50), the
 * average with up to 2.
 */
export function formatCellNumber(n: number, lang: string, maxDecimals: number, minDecimals = maxDecimals): string {
  const locale = lang === 'es' ? 'es-ES' : 'en-US'
  const max = Math.min(Math.max(maxDecimals, 0), 20)
  const min = Math.min(Math.max(minDecimals, 0), max)
  const key = `${locale}:${min}:${max}`
  let fmt = numberFormats.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max })
    numberFormats.set(key, fmt)
  }
  const text = fmt.format(n)
  // -0 (an average or a rounding that ends at zero) shows as 0.
  return /^-0([.,]0*)?$/.test(text) ? text.slice(1) : text
}

// ── Copy: markdown / TSV ─────────────────────────────────────────────────────

const widthOf = (rows: readonly (readonly string[])[]) =>
  rows.reduce((w, r) => Math.max(w, r.length), 0)

function mdCell(text: string): string {
  const s = text.replace(/\r\n?/g, '\n').trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return s || ' '
}

function alignToSep(align: TableAlign | undefined): string {
  if (align === 'center') return ':---:'
  if (align === 'right') return '---:'
  if (align === 'left') return ':---'
  return '---'
}

/**
 * A GFM pipe table of `rows`, written the way NoteFlow saves tables
 * (tableElToMd): row 0 is the header, `aligns[i]` the alignment of column i
 * (missing = none), `|` escaped as `\|`, line breaks as `<br>`, empty cells as
 * one space. Ragged rows are padded. Cell text is written as-is, so markdown
 * in it (`**x**`) is markdown again when pasted. '' for no cells. A
 * single-column table (`| a |` / `| --- |`) is read back as a table too
 * (isTableStart in lib/markdownHtml.ts).
 */
export function cellsToMarkdown(
  rows: readonly (readonly string[])[],
  aligns: readonly TableAlign[] = [],
): string {
  const width = widthOf(rows)
  if (width === 0) return ''
  const line = (row: readonly string[]) =>
    '| ' + Array.from({ length: width }, (_, i) => mdCell(row[i] ?? '')).join(' | ') + ' |'
  const sep = '| ' + Array.from({ length: width }, (_, i) => alignToSep(aligns[i])).join(' | ') + ' |'
  return [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n')
}

/**
 * Tab-separated text of `rows` (what spreadsheets put on and read from the
 * clipboard). A cell containing a tab, a line break or a `"` is quoted
 * Excel-style: wrapped in `"` with inner quotes doubled; other cells go as-is.
 * Rows are joined with '\n' (no trailing newline); ragged rows are padded.
 */
export function cellsToTsv(rows: readonly (readonly string[])[]): string {
  const width = widthOf(rows)
  if (width === 0) return ''
  const cell = (text: string) =>
    /[\t\r\n"]/.test(text) ? `"${text.replace(/\r\n?/g, '\n').replace(/"/g, '""')}"` : text
  return rows
    .map((row) => Array.from({ length: width }, (_, i) => cell(row[i] ?? '')).join('\t'))
    .join('\n')
}

// ── Paste: TSV / CSV ─────────────────────────────────────────────────────────

export type Delimiter = '\t' | ',' | ';'

/** Records of `text` as written (no padding), RFC 4180 style. */
function parseRecords(text: string, delimiter: Delimiter): string[][] {
  const src = text.replace(/\r\n?/g, '\n')
  const records: string[][] = []
  let record: string[] = []
  let i = 0
  // Fields whose opening quote never closed: re-read with the quote as text.
  const literalQuoteAt = new Set<number>()

  while (i <= src.length) {
    const start = i
    let field = ''
    if (src[i] === '"' && !literalQuoteAt.has(i)) {
      let j = i + 1
      let closed = false
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') { field += '"'; j += 2; continue }
          closed = true
          j++
          break
        }
        field += src[j++]
      }
      if (!closed) {
        literalQuoteAt.add(start)
        continue
      }
      // Lenient: text after the closing quote (`"a"b`) stays in the field.
      while (j < src.length && src[j] !== delimiter && src[j] !== '\n') field += src[j++]
      i = j
    } else {
      while (i < src.length && src[i] !== delimiter && src[i] !== '\n') field += src[i++]
    }
    record.push(field)
    if (i >= src.length) {
      records.push(record)
      break
    }
    if (src[i] === '\n') {
      records.push(record)
      record = []
    }
    i++
  }
  // The blank line(s) after the last row (a trailing newline) aren't rows.
  while (records.length > 0) {
    const last = records[records.length - 1]
    if (last.length === 1 && last[0] === '') records.pop()
    else break
  }
  return records
}

/** Count of `delimiter` in the first record of `text`, read the way parseRecords reads it. */
function countInFirstRecord(text: string, delimiter: Delimiter): number {
  const first = parseRecords(text, delimiter)[0]
  return first ? first.length - 1 : 0
}

/**
 * The delimiter `text` most likely uses: a tab if the first record has one
 * outside quoted fields (with parseRecords' rules: a quote only opens a field
 * at its start, so `55"` is text), else ';' if it has more of them than
 * commas (spreadsheets in comma-decimal locales), else ','.
 */
export function detectDelimiter(text: string): Delimiter {
  if (countInFirstRecord(text, '\t') > 0) return '\t'
  return countInFirstRecord(text, ';') > countInFirstRecord(text, ',') ? ';' : ','
}

/**
 * Pasted TSV / CSV text → rows of cells, RFC 4180 style: a field starting with
 * `"` is quoted (`""` inside is a quote; delimiters and line breaks inside are
 * text), CRLF / CR / LF all end a row (and become '\n' inside quoted fields),
 * blank lines at the end are dropped. Lenient with malformed input: text after
 * a closing quote stays in the field, and an opening quote that never closes
 * is read as a literal `"`. Ragged rows are padded with '' to the widest row
 * (tables are rectangular). `delimiter` defaults to detectDelimiter(text).
 */
export function parseDelimited(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const records = parseRecords(text, delimiter)
  const width = widthOf(records)
  return records.map((r) => (r.length < width ? [...r, ...Array<string>(width - r.length).fill('')] : r))
}

// A list marker a word processor puts before a tab: "1.", "a)", "iv.", "•", "-"…
const LIST_MARKER_RE = /^(?:\d+[.)]|[a-z][.)]|[ivxlc]+[.)]|[•·▪◦‣o*\-–—])$/i

/**
 * Does pasted plain text look like a tab-separated table (a spreadsheet range)?
 * Strict, to never turn prose or code into a table: 2+ rows, 2+ columns, every
 * row with the same number of tab-separated cells, and no column entirely
 * empty (tab-indented code has an empty first column). Markdown pipe tables
 * are excluded (containsMarkdownTable handles those), and so are lists copied
 * from a word processor ("1.<tab>First", "•<tab>Apples": every first cell is a
 * list marker). Only tabs count: prose with commas or semicolons is far too
 * common, so this never says yes to CSV — reading pasted text as CSV is the
 * caller's explicit decision (parseDelimited, which then detects ',' / ';').
 */
export function looksLikeTabularText(text: string): boolean {
  if (!text.includes('\t') || containsMarkdownTable(text)) return false
  const records = parseRecords(text, '\t')
  if (records.length < 2) return false
  const width = records[0].length
  if (width < 2 || records.some((r) => r.length !== width)) return false
  for (let c = 0; c < width; c++) {
    if (records.every((r) => isEmpty(r[c]))) return false
  }
  const firstCells = records.map((r) => r[0].trim()).filter(Boolean)
  return !firstCells.every((cell) => LIST_MARKER_RE.test(cell))
}
