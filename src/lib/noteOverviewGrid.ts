// Pure layout + summary logic of the note overview (NoteOverview/NoteOverview.tsx): every
// section of a note as a cell of one reticulated block, like the editor's section map
// (lib/sectionMap.ts) but with the content preview inside. Covered by
// tests/lib/noteOverviewGrid.test.ts.

import { htmlFromMarkdown, type MarkdownHtmlOptions } from './markdownHtml'
import { escapeHtml } from './markdownInline'
import { mapDrawingBlocks, sceneSummary } from './drawing/drawingCollapse'

/** Narrowest column the grid allows (px): as many columns as fit, at least one. */
export const NOTE_GRID_MIN_COLUMN = 220
/** Joint between cells (px). Matches `.note-grid` / `.note-grid-row { gap }` in index.css. */
export const NOTE_GRID_GAP = 4
/** Columns the section open in the editor spans, when there are more than two columns. */
export const NOTE_GRID_OPEN_SPAN = 2
/**
 * Columns a section with a long content spans (more than two columns only): a rectangle
 * between the square base card and the open one. Always below NOTE_GRID_OPEN_SPAN.
 */
export const NOTE_GRID_WIDE_SPAN = 1.5
/** A card is wide from this many preview lines of content (a square card shows ~8). */
export const WIDE_CARD_MIN_LINES = 12
/** Characters a line of the preview holds in a square card, roughly (11px text, ~200px). */
export const PREVIEW_LINE_CHARS = 36
/** The footer shows task progress instead of the word count from this many tasks. */
export const TASK_STATS_MIN = 3
/** Markdown rendered into a card preview at most (chars): only ~8 lines are visible. */
export const PREVIEW_MAX_CHARS = 4000

/** Columns that fit in `width` px with `minColumn` px each and `gap` px joints (≥ 1). */
export function gridColumnCount(
  width: number,
  minColumn = NOTE_GRID_MIN_COLUMN,
  gap = NOTE_GRID_GAP,
): number {
  if (!(width > 0)) return 1
  return Math.max(1, Math.floor((width + gap) / (minColumn + gap)))
}

export type NoteGridCell =
  | { kind: 'section'; id: string; units: number }
  | { kind: 'add'; units: number }

export interface NoteGridRow {
  cells: NoteGridCell[]
  /** Holds only the "New section" cell (the last row was full): a 40px strip. */
  slim: boolean
}

const NO_WIDE: ReadonlySet<string> = new Set()

/**
 * Splits the sections (in tab order) into justified rows of `columns` units. With more than
 * two columns the cards aren't all the same: the section open in the editor (`openId`) takes
 * NOTE_GRID_OPEN_SPAN units and the ones in `wideIds` (long content, see sectionCardIsWide)
 * NOTE_GRID_WIDE_SPAN; every other card — and all of them with one or two columns — takes one.
 *
 * Wide is a preference, so a row never wastes room on it: a wide section that only fits as a
 * square goes in as a square, and the wide cards of a row shrink back to squares when that
 * lets the open section in. Otherwise a section that doesn't fit closes the row early (its
 * cells stretch: the browser shares the width by units, `flex: units 1 0px`). A row holding
 * a wide card is therefore never more than half a unit short, which keeps every wide card
 * narrower than the open one whatever the stretch.
 *
 * The hole left at the end of the last row becomes the "New section" cell when it is at
 * least one unit; otherwise (or with no sections) that cell goes on a slim row of its own
 * spanning every column.
 */
export function planNoteGrid(
  sectionIds: readonly string[],
  openId: string | null,
  columns: number,
  wideIds: ReadonlySet<string> = NO_WIDE,
): NoteGridRow[] {
  const n = Math.max(1, Math.floor(columns))
  const spans = n > 2
  const rows: NoteGridRow[] = []
  let cells: NoteGridCell[] = []
  let used = 0
  const closeRow = () => {
    rows.push({ cells, slim: false })
    cells = []
    used = 0
  }
  for (const id of sectionIds) {
    const isOpen = id === openId
    let units = !spans ? 1 : isOpen ? NOTE_GRID_OPEN_SPAN : wideIds.has(id) ? NOTE_GRID_WIDE_SPAN : 1
    if (used + units > n && cells.length > 0) {
      const perWide = NOTE_GRID_WIDE_SPAN - 1
      const shrinks = Math.ceil((used + units - n) / perWide)
      const wide = cells.filter((c) => c.kind === 'section' && c.units === NOTE_GRID_WIDE_SPAN)
      if (isOpen && wide.length >= shrinks) {
        // The row's last wide cards go back to squares to let the open section in.
        const shrunk = new Set(wide.slice(-shrinks))
        cells = cells.map((c) => (shrunk.has(c) ? { ...c, units: 1 } : c))
        used -= shrinks * perWide
      } else if (!isOpen && units > 1 && used + 1 <= n) {
        units = 1
      } else {
        closeRow()
      }
    }
    cells.push({ kind: 'section', id, units })
    used += units
  }
  if (cells.length > 0 && n - used >= 1) {
    cells.push({ kind: 'add', units: n - used })
    rows.push({ cells, slim: false })
  } else {
    if (cells.length > 0) rows.push({ cells, slim: false })
    rows.push({ cells: [{ kind: 'add', units: n }], slim: true })
  }
  return rows
}

/**
 * Whether a section gets a wide card (NOTE_GRID_WIDE_SPAN): its content runs to
 * WIDE_CARD_MIN_LINES or more lines of a square card's preview (blank lines don't count, a
 * long line counts as the lines it wraps to). A threshold well above what a square card
 * shows, so the size follows the amount of content and rarely flips while typing (no hysteresis:
 * crossing the threshold does flip it).
 * Only the part the preview renders is measured (PREVIEW_MAX_CHARS).
 */
export function sectionCardIsWide(markdown: string): boolean {
  let lines = 0
  for (const line of markdown.slice(0, PREVIEW_MAX_CHARS).split('\n')) {
    const length = line.trim().length
    if (length === 0) continue
    lines += Math.ceil(length / PREVIEW_LINE_CHARS)
    if (lines >= WIDE_CARD_MIN_LINES) return true
  }
  return false
}

export type GridDirection = 'left' | 'right' | 'up' | 'down'

/**
 * Section that keyboard focus moves to from `id`. Left/right walk the tab order (across
 * rows); up/down go to the section of the row above/below that sits under the centre of
 * this one (each row is shared by units, so positions are fractions of its width); on the
 * "New section" cell they take the row's last section. Null at the edges.
 */
export function gridNeighbor(rows: readonly NoteGridRow[], id: string, dir: GridDirection): string | null {
  const order: string[] = []
  let rowIndex = -1
  let center = 0
  rows.forEach((row, r) => {
    const total = row.cells.reduce((sum, c) => sum + c.units, 0)
    let start = 0
    for (const cell of row.cells) {
      if (cell.kind === 'section') {
        order.push(cell.id)
        if (cell.id === id) {
          rowIndex = r
          center = (start + cell.units / 2) / total
        }
      }
      start += cell.units
    }
  })
  if (rowIndex === -1) return null
  if (dir === 'left' || dir === 'right') {
    const i = order.indexOf(id) + (dir === 'left' ? -1 : 1)
    return order[i] ?? null
  }
  const target = rows[rowIndex + (dir === 'up' ? -1 : 1)]
  if (!target) return null
  const total = target.cells.reduce((sum, c) => sum + c.units, 0)
  let start = 0
  let lastSection: string | null = null
  for (const cell of target.cells) {
    const end = start + cell.units
    if (cell.kind === 'section') {
      lastSection = cell.id
      if (center * total < end) return cell.id
    } else if (center * total < end) {
      return lastSection
    }
    start = end
  }
  return lastSection
}

// ── Card footer ────────────────────────────────────────────────────────────────────────

export type SectionCardStats =
  | { kind: 'empty' }
  | { kind: 'tasks'; done: number; total: number }
  | { kind: 'words'; count: number }

// Same rules as markdownHtml.ts: a task is `- [ ]` / `- [x]` followed by a space or the
// end of the line; a fence opens on a column-0 ``` and closes on a bare ``` line.
const TASK_RE = /^\s*- \[([ x])\](?:[ \t]|$)/
const FENCE_OPEN_RE = /^```/
const FENCE_CLOSE_RE = /^```[ \t]*$/
const HAS_WORD_RE = /[\p{L}\p{N}]/u

/** Plain words of a markdown line: markers, link targets and task annotations dropped. */
function lineWords(line: string): number {
  const text = line
    .replace(/^\s*(?:>\s*)+/, '')                         // blockquote markers
    .replace(/^\s*#{1,6}\s+/, '')                         // heading marker
    .replace(/^\s*(?:[-*+]|\d+\.)[ \t]+(?:\[[ x]\][ \t]*)?/, '') // list / task marker
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')             // image → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')              // link → its text
    .replace(/📅\d{4}-\d{2}-\d{2}|⏰\d{2}:\d{2}|🔺(?:low|medium|high)/gu, ' ') // task annotations
    .replace(/\|/g, ' ')                                  // table cells
  return text.split(/\s+/).filter((token) => HAS_WORD_RE.test(token)).length
}

export interface MarkdownTextStats {
  /** Plain words (see sectionCardStats for what counts). */
  words: number
  /** Checked tasks (`- [x]`). */
  done: number
  /** All tasks (`- [ ]` / `- [x]`). */
  total: number
}

/**
 * Words and task counts of a markdown text, in one pass: tasks are `- [ ]` / `- [x]`
 * outside code blocks (kanban cards included); words of code blocks count (a Mermaid
 * drawing is one), a scene drawing counts the words of its labels, markdown
 * syntax, HTML comments — e.g. kanban markers — and link targets don't. Shared by the
 * section card footer and the Activity totals in Settings → General (lib/activitySummary.ts).
 */
export function markdownTextStats(markdown: string): MarkdownTextStats {
  // A drawing counts the words it says (its labels), on a line that can't pass for a task.
  const lines = mapDrawingBlocks(markdown, (block) => (block.kind === 'excalidraw' ? [`| ${sceneSummary(block)}`] : null))
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  let total = 0
  let done = 0
  let words = 0
  let inFence = false
  for (const line of lines) {
    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) { inFence = false; continue }
      words += lineWords(line)
      continue
    }
    if (FENCE_OPEN_RE.test(line)) { inFence = true; continue }
    const task = line.match(TASK_RE)
    if (task) {
      total += 1
      if (task[1] === 'x') done += 1
    }
    words += lineWords(line)
  }
  return { words, done, total }
}

/**
 * What the footer of a section card says: "Empty" for a blank section; the task progress
 * when it has TASK_STATS_MIN or more tasks; otherwise its word count (counting rules in
 * markdownTextStats).
 */
export function sectionCardStats(markdown: string): SectionCardStats {
  if (!markdown.trim()) return { kind: 'empty' }
  const { words, done, total } = markdownTextStats(markdown)
  if (total >= TASK_STATS_MIN) return { kind: 'tasks', done, total }
  return { kind: 'words', count: words }
}

// ── Preview clipping ───────────────────────────────────────────────────────────────────

/**
 * Budget (chars) a pasted image takes in a clipped preview, whatever the length of its data
 * URI: about the lines its picture fills. Without it a single base64 image ate the whole
 * budget and the cut fell inside its source, which then rendered as raw text.
 */
export const PREVIEW_IMAGE_CHARS = 400

// Pasted images keep their data inline (`![alt](data:…)`, the editor's Image node). While
// clipping, each source is held behind a placeholder of PREVIEW_IMAGE_CHARS chars:
// HOLD + index + PADs + HOLD, private-use characters U+E010/U+E011 (not the U+E000/U+E001
// inlineToHtml holds with), no `)` nor line break. Any U+E010/U+E011 already in the user's
// text is held first the same way (a placeholder without pad), so it can never be read as one.
const IMAGE_HOLD = '\uE010'
const IMAGE_PAD = '\uE011'
const HOLD_CHAR_RE = /[\uE010\uE011]/g
const DATA_IMAGE_RE = /(!\[[^\]\n]*\]\()(data:[^)\n]+)\)/g
const HELD_RE = /\uE010(\d+)\uE011*\uE010/g
// An image whose `)` the cut left out (the placeholder whole or halved): dropped.
const CUT_IMAGE_RE = /!\[[^\]\n]*\]\(\uE010[^)\n]*$/

/** Puts the held values (images' sources, the user's own hold characters) back in `text`. */
function restoreHeld(text: string, held: readonly string[], escape: (s: string) => string = (s) => s): string {
  const source = (v: string): string => v.replace(HELD_RE, (m, i: string) => {
    const value = held[Number(i)]
    return value === undefined ? m : source(value)
  })
  return text.replace(HELD_RE, (m, i: string) => {
    const value = held[Number(i)]
    return value === undefined ? m : escape(source(value))
  })
}

// A drawing block is held the same way while clipping — one line standing for the whole
// block (marker, fence, scene) and counting PREVIEW_DRAWING_CHARS — so the cut never falls
// inside one: half a drawing is an invalid block, which would render as a long JSON code
// block. Its own pair of private-use characters (U+E012/U+E013); a text that already holds
// one of them is clipped the old way.
export const PREVIEW_DRAWING_CHARS = 400
const DRAWING_HOLD = String.fromCharCode(0xe012)
const DRAWING_PAD = String.fromCharCode(0xe013)
const DRAWING_HELD_RE = new RegExp(`^${DRAWING_HOLD}(\\d+)${DRAWING_PAD}*${DRAWING_HOLD}$`, 'gm')
const DRAWING_CUT_RE = new RegExp(`\\n?${DRAWING_HOLD}[^\\n]*$`)

function holdDrawings(markdown: string): { text: string; drawings: string[] } {
  const drawings: string[] = []
  if (markdown.includes(DRAWING_HOLD) || markdown.includes(DRAWING_PAD)) return { text: markdown, drawings }
  const text = mapDrawingBlocks(markdown, (_block, _n, lines) => {
    const token = `${DRAWING_HOLD}${drawings.push(lines.join('\n')) - 1}`
    return [`${token}${DRAWING_PAD.repeat(Math.max(0, PREVIEW_DRAWING_CHARS - token.length - 1))}${DRAWING_HOLD}`]
  })
  return { text, drawings }
}

/** Puts the held drawings back; one the cut left without its end is dropped. */
function restoreDrawings(text: string, drawings: readonly string[]): string {
  if (drawings.length === 0) return text
  return text
    .replace(DRAWING_HELD_RE, (m, i: string) => drawings[Number(i)] ?? m)
    .replace(DRAWING_CUT_RE, '')
}

/** `clipPreviewMarkdown` with the values still held (`held[i]` ↔ placeholder i). */
function clipHoldingImages(source: string, maxChars: number): { text: string; held: string[] } {
  const { text: markdown, drawings } = holdDrawings(source)
  const clipped = clipHoldingImagesOnly(markdown, maxChars)
  return { text: restoreDrawings(clipped.text, drawings), held: clipped.held }
}

function clipHoldingImagesOnly(markdown: string, maxChars: number): { text: string; held: string[] } {
  const held: string[] = []
  const hold = (value: string, pad = 0) => {
    const token = `${IMAGE_HOLD}${held.push(value) - 1}`
    return `${token}${IMAGE_PAD.repeat(Math.max(0, pad - token.length - 1))}${IMAGE_HOLD}`
  }
  const text = markdown
    .replace(HOLD_CHAR_RE, (ch) => hold(ch))
    .replace(DATA_IMAGE_RE, (_, open: string, src: string) => `${open}${hold(src, PREVIEW_IMAGE_CHARS)})`)
  if (text.length <= maxChars) return { text, held }
  const head = text.slice(0, maxChars)
  const minCut = Math.floor(maxChars / 2)
  const block = head.lastIndexOf('\n\n')
  const line = head.lastIndexOf('\n')
  const cut = block >= minCut ? block : line >= minCut ? line : maxChars
  let clipped = head.slice(0, cut).replace(/\s+$/, '').replace(CUT_IMAGE_RE, '')
  // A hard cut can still halve a held character's placeholder: its opener is then unpaired.
  if ((clipped.split(IMAGE_HOLD).length - 1) % 2 === 1) clipped = clipped.slice(0, clipped.lastIndexOf(IMAGE_HOLD))
  clipped = clipped.replace(/\s+$/, '')
  let inFence = false
  for (const l of clipped.split('\n')) {
    if (inFence ? FENCE_CLOSE_RE.test(l) : FENCE_OPEN_RE.test(l)) inFence = !inFence
  }
  return { text: inFence ? `${clipped}\n\`\`\`` : clipped, held }
}

/**
 * The start of a long section, cut for its card preview so a huge section doesn't build a
 * huge DOM per card: up to `maxChars`, preferably at a block boundary (blank line) or else
 * a line break, closing a code fence the cut left open (or the rest of the preview would
 * render as code-fence text). A pasted image counts PREVIEW_IMAGE_CHARS, not its data URI's
 * length, and the cut never splits one (an image left without its `)` is dropped); a
 * drawing block counts PREVIEW_DRAWING_CHARS and is kept whole or left out. Short
 * markdown is returned as is. The cards render through sectionPreviewHtml (same clipping).
 */
export function clipPreviewMarkdown(markdown: string, maxChars = PREVIEW_MAX_CHARS): string {
  // (A scene is long: with its drawings held, a text over the limit may well fit.)
  if (markdown.length <= maxChars) return markdown
  const { text, held } = clipHoldingImages(markdown, maxChars)
  return restoreHeld(text, held)
}

/**
 * The preview HTML of a section (`htmlFromMarkdown` of `clipPreviewMarkdown`), rendered with
 * the image sources still held so the markdown pass doesn't run its regexes over megabytes
 * of base64 on every hover; the sources go back into the HTML (attribute-escaped) at the end.
 */
export function sectionPreviewHtml(markdown: string, maxChars = PREVIEW_MAX_CHARS, opts?: MarkdownHtmlOptions): string {
  const { text, held } = clipHoldingImages(markdown, maxChars)
  // A held data-URI source isn't a path to map (linked notes map relative image paths).
  const mapSrc = opts?.imageSrc
  const html = htmlFromMarkdown(text, mapSrc ? { ...opts, imageSrc: (src) => (/[]/.test(src) ? src : mapSrc(src)) } : opts)
  if (held.length === 0) return html
  return restoreHeld(html, held, (s) => escapeHtml(s).replace(/"/g, '&quot;'))
}

/**
 * Text of a section in text mode (`isRawMode`) for a preview: as in its textarea
 * (NoteEditor), pasted image data shows as `[image]`; only `maxChars` of it.
 */
export function rawPreviewText(markdown: string, maxChars = PREVIEW_MAX_CHARS): string {
  return markdown
    .replace(DATA_IMAGE_RE, (_, open: string) => `${open}[image])`)
    .slice(0, maxChars)
}
