// Pure layout + summary logic of the note overview (NoteOverview/NoteOverview.tsx): every
// section of a note as a cell of one reticulated block, like the editor's section map
// (lib/sectionMap.ts) but with the content preview inside. Covered by
// tests/lib/noteOverviewGrid.test.ts.

/** Narrowest column the grid allows (px): as many columns as fit, at least one. */
export const NOTE_GRID_MIN_COLUMN = 220
/** Joint between cells (px). Matches `.note-grid` / `.note-grid-row { gap }` in index.css. */
export const NOTE_GRID_GAP = 4
/** Columns the section open in the editor spans, when there are more than two columns. */
export const NOTE_GRID_OPEN_SPAN = 2
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

/**
 * Splits the sections (in tab order) into justified rows of `columns` units. The section
 * open in the editor (`openId`) takes NOTE_GRID_OPEN_SPAN units when there are more than
 * two columns, one otherwise. A section that doesn't fit closes the row early (its cells
 * stretch: the browser shares the width by units, `flex: units 1 0px`). The hole left at
 * the end of the last row becomes the "New section" cell; when the last row is full (or
 * there are no sections) it goes on a slim row of its own spanning every column.
 */
export function planNoteGrid(
  sectionIds: readonly string[],
  openId: string | null,
  columns: number,
): NoteGridRow[] {
  const n = Math.max(1, Math.floor(columns))
  const openSpan = n > 2 ? NOTE_GRID_OPEN_SPAN : 1
  const rows: NoteGridRow[] = []
  let cells: NoteGridCell[] = []
  let used = 0
  for (const id of sectionIds) {
    const units = id === openId ? openSpan : 1
    if (used + units > n && cells.length > 0) {
      rows.push({ cells, slim: false })
      cells = []
      used = 0
    }
    cells.push({ kind: 'section', id, units })
    used += units
  }
  if (cells.length > 0 && used < n) {
    cells.push({ kind: 'add', units: n - used })
    rows.push({ cells, slim: false })
  } else {
    if (cells.length > 0) rows.push({ cells, slim: false })
    rows.push({ cells: [{ kind: 'add', units: n }], slim: true })
  }
  return rows
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

/**
 * What the footer of a section card says: "Empty" for a blank section; the task progress
 * when it has TASK_STATS_MIN or more tasks (`- [ ]` / `- [x]` outside code blocks, kanban
 * cards included); otherwise its word count (words of code blocks count, markdown syntax,
 * HTML comments — e.g. kanban markers — and link targets don't).
 */
export function sectionCardStats(markdown: string): SectionCardStats {
  if (!markdown.trim()) return { kind: 'empty' }
  const lines = markdown
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
  if (total >= TASK_STATS_MIN) return { kind: 'tasks', done, total }
  return { kind: 'words', count: words }
}

/**
 * The start of a long section, cut for its card preview so a huge section doesn't build a
 * huge DOM per card: up to `maxChars`, preferably at a block boundary (blank line) or else
 * a line break, closing a code fence the cut left open (or the rest of the preview would
 * render as code-fence text). Short markdown is returned as is.
 */
export function clipPreviewMarkdown(markdown: string, maxChars = PREVIEW_MAX_CHARS): string {
  if (markdown.length <= maxChars) return markdown
  const head = markdown.slice(0, maxChars)
  const minCut = Math.floor(maxChars / 2)
  const block = head.lastIndexOf('\n\n')
  const line = head.lastIndexOf('\n')
  const cut = block >= minCut ? block : line >= minCut ? line : maxChars
  const clipped = head.slice(0, cut).replace(/\s+$/, '')
  let inFence = false
  for (const l of clipped.split('\n')) {
    if (inFence ? FENCE_CLOSE_RE.test(l) : FENCE_OPEN_RE.test(l)) inFence = !inFence
  }
  return inFence ? `${clipped}\n\`\`\`` : clipped
}
