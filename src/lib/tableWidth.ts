// ── Table column widths (pure) ───────────────────────────────────────────────
//
// A column's width lives in the markdown itself: the number of dashes of its
// cell in the separator row (`| ------------ | --- |`; the `:` of the alignment
// don't count). 1 dash = COLUMN_WIDTH_EM em of the table's font size; `---` is
// automatic (the column fits its content). The format rules (canonical spacing,
// "not aligned with the header", the +1 dash of the writer) are in
// lib/markdownHtml.ts; the full description in .agents/context/note-format.md
// ("Tablas: ancho de columna").
//
// In the editor the width is the cells' `colwidth` attribute (prosemirror-tables'
// `[n]` array) with NoteFlow's meaning: n = dashes, not px. Every cell of a
// column carries its header cell's. In HTML it's `data-nf-colw="n"` plus the CSS
// variable `--nf-colw: n` (index.css § Tables sizes the cells from it).

/**
 * Fewest dashes of a column with a width: 10 = 5em, exactly the narrowest an
 * automatic column gets (index.css § Tables: td min-width 5em), so no column
 * set by hand is narrower than an automatic one. 4-9 read as automatic.
 */
export const COLUMN_WIDTH_MIN = 10
/** Most dashes (40em ≈ 80 characters): more read as this. */
export const COLUMN_WIDTH_MAX = 80
/** Dashes of an automatic column's separator cell (`---`). */
export const AUTO_COLUMN_DASHES = 3
/** em (of the table's font size) per dash. */
export const COLUMN_WIDTH_EM = 0.5

/** HTML attribute / CSS variable holding a column width (dashes) on every cell of the column. */
export const COLUMN_WIDTH_ATTR = 'data-nf-colw'
export const COLUMN_WIDTH_VAR = '--nf-colw'
/** Same, for the live preview while a column is being resized (TableColumnResize.ts): its own
 *  names, so removing the preview never strips the cell's real width from the DOM. */
export const COLUMN_WIDTH_LIVE_ATTR = 'data-nf-colw-live'
export const COLUMN_WIDTH_LIVE_VAR = '--nf-colw-live'

/**
 * The width a separator cell of `dashes` dashes stands for: null (automatic)
 * below COLUMN_WIDTH_MIN — `---`, and 4-9 too —, else up to COLUMN_WIDTH_MAX.
 */
export function widthFromDashes(dashes: number): number | null {
  if (!Number.isFinite(dashes) || dashes < COLUMN_WIDTH_MIN) return null
  return Math.min(COLUMN_WIDTH_MAX, Math.floor(dashes))
}

/** A width to set (a drag, a command): rounded to whole dashes and clamped to MIN…MAX; null if not a number. */
export function clampColumnWidth(width: number): number | null {
  if (!Number.isFinite(width)) return null
  return Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, Math.round(width)))
}

/** The width (dashes) held by a cell's `colwidth` attribute, or null (automatic, or not a NoteFlow width). */
export function widthOfColwidth(colwidth: unknown): number | null {
  if (!Array.isArray(colwidth) || colwidth.length !== 1) return null
  const n = colwidth[0]
  return typeof n === 'number' && Number.isInteger(n) && n >= COLUMN_WIDTH_MIN && n <= COLUMN_WIDTH_MAX ? n : null
}

/** The `colwidth` attribute for a width (`[n]`), or null for automatic. */
export const colwidthOf = (width: number | null): number[] | null => (width === null ? null : [width])

/** The width in a `data-nf-colw` attribute value (read like the separator's dashes), or null. */
export function widthFromAttr(value: string | null | undefined): number | null {
  if (!value || !/^\s*\d+\s*$/.test(value)) return null
  return widthFromDashes(Number(value))
}

/** Pixels of one dash at a table font size (px). */
export const dashPx = (fontSize: number) => fontSize * COLUMN_WIDTH_EM

/**
 * The width (dashes) closest to `px` at `fontSize`, snapped to a whole dash and
 * clamped to MIN…MAX (what a resize drag sets, and the starting width of an
 * automatic column measured on screen).
 */
export function widthFromPx(px: number, fontSize: number): number {
  return clampColumnWidth(px / dashPx(fontSize)) ?? COLUMN_WIDTH_MIN
}

/** The rendered width (px, border-box) of a `width`-dash column at `fontSize`. */
export const pxFromWidth = (width: number, fontSize: number) => width * dashPx(fontSize)

/**
 * The narrowest width (dashes) a resize drag may set on a column whose header's
 * longest word needs `headerPx` (its min-content: the word plus the cell's
 * padding and borders, px) at `fontSize`: a header cell never breaks inside a
 * word (index.css § Tables), so a narrower width would show wider than it's
 * saved. Rounded up to whole dashes, within MIN…MAX.
 */
export function minWidthForHeader(headerPx: number, fontSize: number): number {
  const dashes = Number.isFinite(headerPx) && headerPx > 0 ? Math.ceil(headerPx / dashPx(fontSize) - 1e-6) : 0
  return Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, dashes))
}
