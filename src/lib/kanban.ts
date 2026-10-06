// ── In-note kanban boards ────────────────────────────────────────────────────
//
// A board is plain markdown inside a section, delimited by HTML comment markers
// (which other markdown viewers hide or show as-is):
//
//   <!-- kanban done="Done" -->
//   - Todo
//     - [ ] Design the NodeView 📅2026-10-12 🔺high
//       - a sub-bullet (kept verbatim as the card's `extra`)
//   - Done
//     - [x] Pick the format
//   <!-- /kanban -->
//
// Columns are column-0 `- name` items; cards are 2-space-indented tasks with the
// usual 📅/⏰/🔺 annotations; anything indented deeper belongs to the card above
// it and is preserved verbatim. Blank lines inside are tolerated (not emitted).
// Anything else between the markers makes it NOT a board: parseKanbanMarkdown
// returns null and markdownHtml renders the region as ordinary markdown, so a
// malformed board is never rewritten. Pure (no React/DOM globals): used by
// markdownHtml.ts for md↔html and by the editor/preview UI.

import {
  escapeHtml,
  extractDeadlineAnnotations,
  inlineToHtml,
  taskAnnotationsToMd,
  type TaskImportance,
} from './markdownInline'

export interface KanbanCard {
  /** Card text as single-line inline markdown, WITHOUT the task annotations. */
  md: string
  checked: boolean
  /** `YYYY-MM-DD` (📅) */
  due: string | null
  /** `HH:MM` (⏰) */
  alarm: string | null
  /** 🔺 */
  importance: TaskImportance | null
  /** Raw lines nested under the card (sub-bullets, notes), verbatim including
   *  their indentation, joined with '\n'. '' = none. */
  extra: string
}

export interface KanbanColumn {
  /** Plain text (no inline markdown rendering). */
  name: string
  cards: KanbanCard[]
}

export interface KanbanBoardData {
  /** Raw attribute string of the opening marker, e.g. `done="Done" foo="1"`.
   *  Unknown attributes are preserved verbatim on round-trip. */
  attrs: string
  /** Name of the column that means "completed" (the `done` attribute).
   *  Authoritative on write: serializeKanbanMarkdown syncs it into `attrs`. */
  done: string | null
  columns: KanbanColumn[]
}

/** Opening marker (column 0); group 1 = raw attributes. */
export const KANBAN_OPEN_RE = /^<!--[ \t]*kanban(?:[ \t]+(.*?))?[ \t]*-->[ \t]*$/
/** Closing marker (column 0). */
export const KANBAN_CLOSE_RE = /^<!--[ \t]*\/kanban[ \t]*-->[ \t]*$/

// Column: column-0 `- name` (the name may be empty: a bare `-`).
const COLUMN_RE = /^-(?:[ \t]+(.*?))?[ \t]*$/
// Card: a task indented exactly 2 spaces.
const CARD_RE = /^ {2}- \[([ x])\](?:[ \t]+(.*?))?[ \t]*$/
// Card child: indented deeper than a card (3+ spaces, or a tab in the indent).
const EXTRA_RE = /^(?: {3,}| {0,2}\t)/

// ── Marker attributes ────────────────────────────────────────────────────────
// `key="value"` pairs; values encode & " < > as entities so any column name
// (quotes included) fits in a one-line `-->`-safe marker.

function encodeAttrValue(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\s*\n\s*/g, ' ')
}

function decodeAttrValue(v: string): string {
  return v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function attrRe(key: string): RegExp {
  return new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}="([^"]*)"`)
}

/** Read `key="…"` from a marker attribute string (null if absent). */
export function getKanbanAttr(attrs: string, key: string): string | null {
  const m = attrs.match(attrRe(key))
  return m ? decodeAttrValue(m[2]) : null
}

/**
 * Set (or remove, with `null`) `key="…"` in a marker attribute string. Leaves
 * the string untouched when the value doesn't change, edits the pair in place
 * otherwise, and appends it when absent — other attributes stay verbatim.
 */
export function setKanbanAttr(attrs: string, key: string, value: string | null): string {
  const m = attrs.match(attrRe(key))
  if (!m || m.index === undefined) {
    if (value === null) return attrs
    return `${attrs ? `${attrs} ` : ''}${key}="${encodeAttrValue(value)}"`
  }
  if (value !== null && decodeAttrValue(m[2]) === value) return attrs
  const before = attrs.slice(0, m.index)
  const after = attrs.slice(m.index + m[0].length)
  if (value === null) return `${before.trimEnd()}${after}`.trim()
  return `${before}${m[1]}${key}="${encodeAttrValue(value)}"${after}`
}

// ── Markdown ↔ data ──────────────────────────────────────────────────────────

/**
 * Parse a whole board block (opening marker … closing marker; surrounding blank
 * lines ignored). Returns null when the content doesn't fit the board structure
 * — callers must then leave the text alone.
 */
export function parseKanbanMarkdown(block: string): KanbanBoardData | null {
  const lines = block.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && !lines[0].trim()) lines.shift()
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()
  if (lines.length < 2) return null
  const open = lines[0].match(KANBAN_OPEN_RE)
  if (!open || !KANBAN_CLOSE_RE.test(lines[lines.length - 1])) return null

  const attrs = (open[1] ?? '').trim()
  const columns: KanbanColumn[] = []
  let card: KanbanCard | null = null

  for (const line of lines.slice(1, -1)) {
    if (!line.trim()) continue

    if (EXTRA_RE.test(line)) {
      if (!card) return null
      card.extra = card.extra ? `${card.extra}\n${line}` : line
      continue
    }

    const cardMatch = line.match(CARD_RE)
    if (cardMatch) {
      const column = columns[columns.length - 1]
      if (!column) return null
      const { text, due, alarm, importance } = extractDeadlineAnnotations((cardMatch[2] ?? '').trim())
      card = { md: text, checked: cardMatch[1] === 'x', due, alarm, importance, extra: '' }
      column.cards.push(card)
      continue
    }

    const columnMatch = line.match(COLUMN_RE)
    if (columnMatch) {
      columns.push({ name: columnMatch[1] ?? '', cards: [] })
      card = null
      continue
    }

    // Anything else (other markers, paragraphs, ordered lists, odd indentation…).
    return null
  }

  return { attrs, done: getKanbanAttr(attrs, 'done'), columns }
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

/**
 * Serialize a board to markdown, from the opening to the closing marker (no
 * trailing newline). Always re-parses with parseKanbanMarkdown: names/text are
 * kept to one line, and `extra` lines that aren't indented deeper than a card
 * are indented so they stay under it.
 */
export function serializeKanbanMarkdown(data: KanbanBoardData): string {
  const attrs = setKanbanAttr(oneLine(data.attrs), 'done', data.done)
  const out = [attrs ? `<!-- kanban ${attrs} -->` : '<!-- kanban -->']
  for (const column of data.columns) {
    const name = oneLine(column.name)
    out.push(name ? `- ${name}` : '-')
    for (const card of column.cards) {
      const body = `${oneLine(card.md)}${taskAnnotationsToMd(card.due, card.alarm, card.importance)}`.trim()
      out.push(`  - [${card.checked ? 'x' : ' '}]${body ? ` ${body}` : ''}`)
      for (const line of card.extra.split('\n')) {
        if (line.trim()) out.push(EXTRA_RE.test(line) ? line : `    ${line}`)
      }
    }
  }
  out.push('<!-- /kanban -->')
  return out.join('\n')
}

// ── Data ↔ HTML ──────────────────────────────────────────────────────────────

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;')
}

/**
 * Structured HTML for a board, rendered by htmlFromMarkdown (previews and the
 * editor). The data-* attributes are the source of truth for the way back
 * (kanbanDataFromElement): `data-md` per card and `data-name` per column, not
 * the rendered inner HTML.
 *
 *   <div data-type="kanban" data-attrs="…">
 *     <div data-kanban-column data-name="…" [data-done="true"]>
 *       <div data-kanban-column-title>…</div>
 *       <ul data-type="taskList">
 *         <li data-type="taskItem" data-checked data-due data-alarm data-importance data-md data-extra>
 *           <label><input type="checkbox"></label><p>…</p>
 *         </li>…
 *       </ul>
 *     </div>…
 *   </div>
 */
export function kanbanDataToHtml(data: KanbanBoardData): string {
  const columns = data.columns.map((column) => {
    const cards = column.cards.map((card) => {
      const due = card.due ? ` data-due="${escapeAttr(card.due)}"` : ''
      const alarm = card.alarm ? ` data-alarm="${escapeAttr(card.alarm)}"` : ''
      const imp = card.importance ? ` data-importance="${escapeAttr(card.importance)}"` : ''
      const extra = card.extra ? ` data-extra="${escapeAttr(card.extra)}"` : ''
      return `<li data-type="taskItem" data-checked="${card.checked}"${due}${alarm}${imp}` +
        ` data-md="${escapeAttr(card.md)}"${extra}>` +
        `<label><input type="checkbox"${card.checked ? ' checked' : ''}></label>` +
        `<p>${inlineToHtml(card.md)}</p></li>`
    }).join('')
    const done = data.done !== null && column.name === data.done ? ' data-done="true"' : ''
    return `<div data-kanban-column data-name="${escapeAttr(column.name)}"${done}>` +
      `<div data-kanban-column-title>${escapeHtml(column.name)}</div>` +
      `<ul data-type="taskList">${cards}</ul></div>`
  }).join('')
  // `done` is authoritative (as in serializeKanbanMarkdown): mirror it into the
  // attributes, which is where kanbanDataFromElement reads it back from.
  const attrs = setKanbanAttr(data.attrs, 'done', data.done)
  return `<div data-type="kanban" data-attrs="${escapeAttr(attrs)}">${columns}</div>`
}

const IMPORTANCES: readonly string[] = ['low', 'medium', 'high']

/** Read a board back from the HTML produced by kanbanDataToHtml. */
export function kanbanDataFromElement(el: Element): KanbanBoardData {
  const attrs = el.getAttribute('data-attrs') ?? ''
  const columns: KanbanColumn[] = []
  for (const columnEl of Array.from(el.children)) {
    if (!columnEl.hasAttribute('data-kanban-column')) continue
    const cards: KanbanCard[] = []
    for (const listEl of Array.from(columnEl.children)) {
      if (listEl.tagName.toLowerCase() !== 'ul') continue
      for (const li of Array.from(listEl.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue
        const importance = li.getAttribute('data-importance')
        cards.push({
          md: li.getAttribute('data-md') ?? (li.textContent ?? '').trim(),
          checked: li.getAttribute('data-checked') === 'true',
          due: li.getAttribute('data-due') || null,
          alarm: li.getAttribute('data-alarm') || null,
          importance: importance && IMPORTANCES.includes(importance) ? importance as TaskImportance : null,
          extra: li.getAttribute('data-extra') ?? '',
        })
      }
    }
    columns.push({ name: columnEl.getAttribute('data-name') ?? '', cards })
  }
  return { attrs, done: getKanbanAttr(attrs, 'done'), columns }
}
