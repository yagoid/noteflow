// ── In-note kanban boards: pure state transforms ─────────────────────────────
//
// Everything the board NodeView (components/Editor/KanbanBoardView.tsx) does to
// a board goes through these functions: they take a KanbanBoardData and return a
// NEW one (never mutate — the result becomes a ProseMirror node attribute, and
// attributes must be immutable for history/undo to work). No React, no DOM.
//
// "Done column" semantics (the board's `done` attribute names it):
//   - moving a card INTO the done column checks it, moving it OUT unchecks it;
//   - checking a card moves it to the end of the done column;
//   - unchecking a card that sits in the done column moves it to the end of the
//     first non-done column;
//   - with no done column the checkbox just toggles.

import {
  serializeKanbanMarkdown,
  setKanbanAttr,
  type KanbanBoardData,
  type KanbanCard,
  type KanbanColumn,
} from './kanban'
import { extractDeadlineAnnotations, taskAnnotationsToMd, type TaskImportance } from './markdownInline'

/** Name of the TipTap node holding a board (components/Editor/KanbanBoard.ts). */
export const KANBAN_NODE_NAME = 'kanbanBoard'

export interface CardRef {
  col: number
  idx: number
}

const IMPORTANCES: readonly string[] = ['low', 'medium', 'high']

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * Coerce whatever sits in the node attribute (normally a KanbanBoardData, but it
 * may come from JSON content or an older/garbled state) into a well-formed board.
 */
export function normalizeBoard(raw: unknown): KanbanBoardData {
  let value = raw
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { value = null }
  }
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const columns: KanbanColumn[] = (Array.isArray(obj.columns) ? obj.columns : []).map((c) => {
    const col = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    const cards: KanbanCard[] = (Array.isArray(col.cards) ? col.cards : []).map((k) => {
      const card = (k && typeof k === 'object' ? k : {}) as Record<string, unknown>
      const importance = strOrNull(card.importance)
      return {
        md: str(card.md),
        checked: card.checked === true,
        due: strOrNull(card.due),
        alarm: strOrNull(card.alarm),
        importance: importance && IMPORTANCES.includes(importance) ? (importance as TaskImportance) : null,
        extra: str(card.extra),
      }
    })
    return { name: str(col.name), cards }
  })
  return { attrs: str(obj.attrs), done: typeof obj.done === 'string' ? obj.done : null, columns }
}

export function emptyCard(md = ''): KanbanCard {
  return { md, checked: false, due: null, alarm: null, importance: null, extra: '' }
}

/** A fresh board with the given column names; `doneIndex` names the done column. */
export function createBoard(names: string[], doneIndex: number | null): KanbanBoardData {
  const done = doneIndex !== null && names[doneIndex] !== undefined ? names[doneIndex] : null
  return withDone({ attrs: '', done: null, columns: names.map((name) => ({ name, cards: [] })) }, done)
}

export function isDoneColumn(board: KanbanBoardData, col: number): boolean {
  const column = board.columns[col]
  return !!column && board.done !== null && column.name === board.done
}

/** Index of the (first) done column, -1 when the board has none. */
export function doneColumnIndex(board: KanbanBoardData): number {
  if (board.done === null) return -1
  return board.columns.findIndex((c) => c.name === board.done)
}

/**
 * `name` made unique among the board's column names (ignoring column
 * `exceptIdx`, the one being renamed) by appending " 2", " 3"… Column names
 * identify the done column, so duplicates would make two columns "done".
 */
export function uniqueColumnName(board: KanbanBoardData, name: string, exceptIdx = -1): string {
  const taken = new Set(board.columns.filter((_, i) => i !== exceptIdx).map((c) => c.name))
  if (!taken.has(name)) return name
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

// `done` is mirrored in the raw marker attributes (`attrs`), which is what the
// HTML carries back to markdown (kanbanDataFromElement reads `done` from
// data-attrs): keep both in step on every change.
function withDone(board: KanbanBoardData, done: string | null): KanbanBoardData {
  return { ...board, done, attrs: setKanbanAttr(board.attrs, 'done', done) }
}

function withColumns(board: KanbanBoardData, columns: KanbanColumn[], done = board.done): KanbanBoardData {
  return { ...withDone(board, done), columns }
}

function replaceColumn(board: KanbanBoardData, col: number, column: KanbanColumn): KanbanBoardData {
  return withColumns(board, board.columns.map((c, i) => (i === col ? column : c)))
}

// ── Columns ──────────────────────────────────────────────────────────────────

export function addColumn(board: KanbanBoardData, name: string): KanbanBoardData {
  const clean = uniqueColumnName(board, oneLine(name))
  return withColumns(board, [...board.columns, { name: clean, cards: [] }])
}

/** Rename a column; an empty name is ignored. Keeps `done` pointing at it. */
export function renameColumn(board: KanbanBoardData, col: number, name: string): KanbanBoardData {
  const column = board.columns[col]
  const clean = oneLine(name)
  if (!column || !clean || clean === column.name) return board
  const unique = uniqueColumnName(board, clean, col)
  const done = isDoneColumn(board, col) ? unique : board.done
  return withColumns(board, board.columns.map((c, i) => (i === col ? { ...c, name: unique } : c)), done)
}

/** Delete a column and its cards. Deleting the done column clears `done`. */
export function deleteColumn(board: KanbanBoardData, col: number): KanbanBoardData {
  if (!board.columns[col]) return board
  const columns = board.columns.filter((_, i) => i !== col)
  const done = board.done !== null && columns.some((c) => c.name === board.done) ? board.done : null
  return withColumns(board, columns, done)
}

/**
 * Move column `from` so it lands before the column currently at slot `to`
 * (0…columns.length, i.e. slots counted on the board as it is now).
 */
export function moveColumn(board: KanbanBoardData, from: number, to: number): KanbanBoardData {
  const n = board.columns.length
  if (from < 0 || from >= n) return board
  const target = Math.max(0, Math.min(n, to))
  const finalIdx = target > from ? target - 1 : target
  if (finalIdx === from) return board
  const columns = [...board.columns]
  const [moved] = columns.splice(from, 1)
  columns.splice(finalIdx, 0, moved)
  return withColumns(board, columns)
}

/** Make `col` the done column (null = the board has no done column). */
export function setDoneColumn(board: KanbanBoardData, col: number | null): KanbanBoardData {
  const done = col === null ? null : board.columns[col]?.name ?? null
  return done === board.done ? board : withDone(board, done)
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** Insert a card at `index` (default: end). A card added to the done column is checked. */
export function addCard(board: KanbanBoardData, col: number, card: KanbanCard, index?: number): KanbanBoardData {
  const column = board.columns[col]
  if (!column) return board
  const cards = [...column.cards]
  const at = index === undefined ? cards.length : Math.max(0, Math.min(cards.length, index))
  cards.splice(at, 0, isDoneColumn(board, col) ? { ...card, checked: true } : card)
  return replaceColumn(board, col, { ...column, cards })
}

export function updateCard(board: KanbanBoardData, ref: CardRef, patch: Partial<KanbanCard>): KanbanBoardData {
  const column = board.columns[ref.col]
  const card = column?.cards[ref.idx]
  if (!column || !card) return board
  return replaceColumn(board, ref.col, {
    ...column,
    cards: column.cards.map((c, i) => (i === ref.idx ? { ...c, ...patch } : c)),
  })
}

export function deleteCard(board: KanbanBoardData, ref: CardRef): KanbanBoardData {
  const column = board.columns[ref.col]
  if (!column?.cards[ref.idx]) return board
  return replaceColumn(board, ref.col, { ...column, cards: column.cards.filter((_, i) => i !== ref.idx) })
}

/**
 * Move a card so it lands before the card currently at slot `to.idx` of column
 * `to.col` (slots counted on the board as it is now, 0…cards.length). Crossing
 * into the done column checks the card; leaving it unchecks it.
 */
export function moveCard(board: KanbanBoardData, from: CardRef, to: CardRef): KanbanBoardData {
  const source = board.columns[from.col]
  const card = source?.cards[from.idx]
  const target = board.columns[to.col]
  if (!source || !card || !target) return board

  let slot = Math.max(0, Math.min(target.cards.length, to.idx))
  if (from.col === to.col) {
    if (slot > from.idx) slot--
    if (slot === from.idx) return board
    const cards = [...source.cards]
    cards.splice(from.idx, 1)
    cards.splice(slot, 0, card)
    return replaceColumn(board, from.col, { ...source, cards })
  }

  let moved = card
  if (isDoneColumn(board, to.col)) moved = { ...card, checked: true }
  else if (isDoneColumn(board, from.col)) moved = { ...card, checked: false }

  return withColumns(board, board.columns.map((c, i) => {
    if (i === from.col) return { ...c, cards: c.cards.filter((_, j) => j !== from.idx) }
    if (i === to.col) {
      const cards = [...c.cards]
      cards.splice(slot, 0, moved)
      return { ...c, cards }
    }
    return c
  }))
}

/** The checkbox, with the done-column semantics described at the top. */
export function toggleCard(board: KanbanBoardData, ref: CardRef): KanbanBoardData {
  const card = board.columns[ref.col]?.cards[ref.idx]
  if (!card) return board
  const done = doneColumnIndex(board)

  if (!card.checked) {
    if (done >= 0 && !isDoneColumn(board, ref.col)) {
      return moveCard(board, ref, { col: done, idx: board.columns[done].cards.length })
    }
    return updateCard(board, ref, { checked: true })
  }

  if (isDoneColumn(board, ref.col)) {
    const open = board.columns.findIndex((_, i) => !isDoneColumn(board, i))
    if (open >= 0) return moveCard(board, ref, { col: open, idx: board.columns[open].cards.length })
  }
  return updateCard(board, ref, { checked: false })
}

/**
 * Apply the text typed in a card editor: kept to one line, and any 📅/⏰/🔺
 * annotations typed into it are pulled out into the card's fields (they must
 * never live inside `md`). Annotations not typed keep their current value.
 */
export function applyCardText(card: KanbanCard, text: string): KanbanCard {
  const { text: md, due, alarm, importance } = extractDeadlineAnnotations(oneLine(text))
  return {
    ...card,
    md,
    due: due ?? card.due,
    alarm: alarm ?? card.alarm,
    importance: importance ?? card.importance,
  }
}

/** The text shown in a card editor (the md; annotations are edited as chips). */
export function cardEditText(card: KanbanCard): string {
  return card.md
}

export function countCards(board: KanbanBoardData): number {
  return board.columns.reduce((n, c) => n + c.cards.length, 0)
}

/** Number of non-blank `extra` lines (sub-bullets/notes kept under a card). */
export function extraLineCount(card: KanbanCard): number {
  return card.extra ? card.extra.split('\n').filter((l) => l.trim()).length : 0
}

// ── Conversions to/from a task list ──────────────────────────────────────────

/**
 * Build a board from a task list's markdown (as htmlToMarkdown writes it): each
 * top-level `- [ ]`/`- [x]` item becomes a card of the FIRST column, keeping its
 * check state and annotations; everything nested under it (sub-tasks, bullets)
 * is kept verbatim as the card's `extra`, indented under the card. Continuation
 * lines of a multi-line item (soft breaks) are joined into its text. Items
 * with nothing at all (no text, annotations or children) are dropped.
 */
export function taskListMarkdownToBoard(md: string, names: string[], doneIndex: number | null): KanbanBoardData {
  const board = createBoard(names.length > 0 ? names : [''], doneIndex)
  const cards: KanbanCard[] = []
  let card: KanbanCard | null = null
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue
    const top = line.match(/^- \[([ xX])\](?:[ \t]+(.*))?$/)
    if (top) {
      const { text, due, alarm, importance } = extractDeadlineAnnotations((top[2] ?? '').trim())
      card = { md: text, checked: top[1] !== ' ', due, alarm, importance, extra: '' }
      cards.push(card)
      continue
    }
    if (!card) continue
    if (/^[ \t]/.test(line)) {
      // Nested under the item: one level deeper than a card (2 → 4 spaces).
      const nested = `  ${line}`
      card.extra = card.extra ? `${card.extra}\n${nested}` : nested
    } else {
      // A continuation line of the item's text (soft break).
      card.md = oneLine(`${card.md} ${line}`)
    }
  }
  // An item left empty (e.g. the one where "/" was typed to convert) is no card.
  const kept = cards.filter((c) => c.md || c.due || c.alarm || c.importance || c.extra)
  board.columns[0] = { ...board.columns[0], cards: kept }
  return board
}

/**
 * Flatten a board into task-list markdown: every card (column by column) as a
 * top-level task with its check state, annotations and `extra` lines, which are
 * dedented by one card level so nested items stay nested under their task.
 * Returns '' for a board without cards.
 */
export function boardToTaskListMarkdown(board: KanbanBoardData): string {
  const out: string[] = []
  for (const column of board.columns) {
    for (const card of column.cards) {
      const body = `${oneLine(card.md)}${taskAnnotationsToMd(card.due, card.alarm, card.importance)}`.trim()
      out.push(`- [${card.checked ? 'x' : ' '}]${body ? ` ${body}` : ''}`)
      for (const line of card.extra.split('\n')) {
        if (!line.trim()) continue
        const dedented = line.startsWith('  ') ? line.slice(2) : line
        // Keep it indented at least one level so it stays under the task.
        out.push(/^[ \t]/.test(dedented) ? dedented : `  ${dedented}`)
      }
    }
  }
  return out.join('\n')
}

/** Plain-text form of a board (clipboard text, getText): its markdown. */
export function boardToText(board: KanbanBoardData): string {
  return serializeKanbanMarkdown(board)
}
