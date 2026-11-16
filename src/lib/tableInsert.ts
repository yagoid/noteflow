// Inserting a new table in the note editor: the toolbar's size picker
// (components/Editor/TableSizePicker.tsx) and the `/table` slash command
// (components/Editor/SlashCommands.ts). Pure ProseMirror — a state in, a
// transaction out — plus the picker's keyboard moves. Covered on the editor's
// real schema by tests/lib/tableInsert.test.ts.
//
// Every new table has a header row: a markdown pipe table can't be written
// without one (lib/markdownHtml.ts tableElToMd), so `rows` always COUNTS the
// header row — 3 rows = the header + 2 body rows.

import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type EditorState, type Selection, type Transaction } from '@tiptap/pm/state'
import { createTable } from '@tiptap/extension-table'

/** Size of a new table. `rows` includes the header row. */
export interface TableSize {
  rows: number
  cols: number
}

/** Side of the size picker's square grid. */
export const TABLE_PICKER_MAX = 8

/**
 * Fewest columns of a new table. A one-column pipe table (`| --- |` separator)
 * isn't read back as a table by lib/markdownHtml.ts (its separator pattern needs
 * two cells), so it would come back as plain text after a save.
 */
export const TABLE_MIN_COLS = 2

/** What `/table` inserts, and where the picker's highlight starts. */
export const DEFAULT_TABLE_SIZE: TableSize = { rows: 3, cols: 3 }

/** A size the picker can insert: rows 1…max (the header alone is a valid table), columns TABLE_MIN_COLS…max. */
export function clampTableSize(size: TableSize, max = TABLE_PICKER_MAX): TableSize {
  return {
    rows: Math.min(max, Math.max(1, size.rows)),
    cols: Math.min(max, Math.max(TABLE_MIN_COLS, size.cols)),
  }
}

/**
 * The picker's highlighted size after an arrow key: ←/→ change the columns,
 * ↑/↓ the rows, clamped (clampTableSize). null for any other key.
 */
export function moveTableSize(size: TableSize, key: string, max = TABLE_PICKER_MAX): TableSize | null {
  switch (key) {
    case 'ArrowRight': return clampTableSize({ rows: size.rows, cols: size.cols + 1 }, max)
    case 'ArrowLeft': return clampTableSize({ rows: size.rows, cols: size.cols - 1 }, max)
    case 'ArrowDown': return clampTableSize({ rows: size.rows + 1, cols: size.cols }, max)
    case 'ArrowUp': return clampTableSize({ rows: size.rows - 1, cols: size.cols }, max)
    default: return null
  }
}

// Containers a new table can't go into at the caret: a list item only holds
// paragraphs and sub-lists (LIST_ITEM_CONTENT in editorExtensions.ts — ProseMirror
// would split the list around the table), and a table cell (`block+` in TipTap's
// schema) would nest a table that a pipe table can't write back.
const NO_TABLE_INSIDE = new Set(['table', 'bulletList', 'orderedList', 'taskList'])

/** Depth of the outermost list or table holding `$pos`, or 0 if none. */
function outermostNoTableDepth($pos: ResolvedPos): number {
  for (let depth = 1; depth <= $pos.depth; depth++) {
    if (NO_TABLE_INSIDE.has($pos.node(depth).type.name)) return depth
  }
  return 0
}

/**
 * Where a new table goes for `selection`: null = at the selection itself
 * (TipTap's insertTable: it replaces an empty paragraph or splits the text
 * block); otherwise the position right after the outermost list or table
 * holding the selection (still inside a quote if that list/table is in one), or
 * right after a selected block node (a kanban board) instead of replacing it.
 */
export function tableInsertPos(selection: Selection): number | null {
  const { $from } = selection
  const depth = outermostNoTableDepth($from)
  if (depth > 0) return $from.after(depth)
  if (selection instanceof NodeSelection && selection.node.isBlock) return selection.to
  return null
}

/** Whether a table can be inserted right at the selection (the `/table` command is only offered there). */
export function canInsertTableHere(selection: Selection): boolean {
  return tableInsertPos(selection) === null
}

/**
 * Transaction inserting a table of `size` (with its header row) for the current
 * selection — see tableInsertPos — with the caret in its first header cell.
 */
export function insertTableTr(state: EditorState, size: TableSize): Transaction {
  const table: PMNode = createTable(state.schema, size.rows, size.cols, true)
  const tr = state.tr
  const pos = tableInsertPos(state.selection)
  if (pos === null) {
    // Same steps as TipTap's insertTable command.
    const offset = tr.selection.from + 1
    tr.replaceSelectionWith(table).setSelection(TextSelection.near(tr.doc.resolve(offset)))
  } else {
    tr.insert(pos, table).setSelection(TextSelection.near(tr.doc.resolve(pos + 1)))
  }
  return tr.scrollIntoView()
}
