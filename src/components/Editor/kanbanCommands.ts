// Editor-side actions around kanban boards: insert a new board, turn a task list
// into a board and back. The board node itself is KanbanBoard.ts; the pure
// conversions live in lib/kanbanOps.ts.
import { getHTMLFromFragment, type Editor } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { KanbanBoardData } from '../../lib/kanban'
import {
  KANBAN_NODE_NAME,
  boardToTaskListMarkdown,
  createBoard,
  taskListMarkdownToBoard,
} from '../../lib/kanbanOps'
import { htmlFromMarkdown, htmlToMarkdown } from '../../lib/markdownHtml'
import type { Messages } from '../../i18n'

/** Default column names of a new board (i18n); the last one is the done column. */
export type KanbanDefaultColumns = [todo: string, doing: string, done: string]

/** The default column names in the current UI language. */
export function kanbanDefaultColumns(t: Messages): KanbanDefaultColumns {
  return [t.editor.kanban.defaultTodo, t.editor.kanban.defaultDoing, t.editor.kanban.defaultDone]
}

export function defaultBoard(names: KanbanDefaultColumns): KanbanBoardData {
  return createBoard(names, 2)
}

/**
 * Replace the doc range [from, to) with `board`, adding an empty paragraph
 * after it when it would end the document (an atom block there would leave no
 * place to put the caret), then put the caret right after the board.
 */
function placeBoard(editor: Editor, from: number, to: number, board: KanbanBoardData) {
  const atEnd = to >= editor.state.doc.content.size
  const content: Record<string, unknown>[] = [{ type: KANBAN_NODE_NAME, attrs: { board } }]
  if (atEnd) content.push({ type: 'paragraph' })
  editor.chain().focus().insertContentAt({ from, to }, content).command(({ tr }) => {
    const boardNode = tr.doc.nodeAt(from)
    if (boardNode?.type.name !== KANBAN_NODE_NAME) return true
    const after = from + boardNode.nodeSize
    const next = tr.doc.nodeAt(after)
    if (next?.isTextblock) tr.setSelection(TextSelection.create(tr.doc, after + 1))
    return true
  }).run()
}

/**
 * Insert a fresh board at the top level: it replaces the current top-level block
 * when that is an empty paragraph, otherwise it goes right after it (boards
 * only live at the top level — a "/kanban" typed inside a list lands after the
 * whole list).
 */
export function insertDefaultBoard(editor: Editor, names: KanbanDefaultColumns) {
  const { $from } = editor.state.selection
  const board = defaultBoard(names)
  if ($from.depth === 0) {
    placeBoard(editor, $from.pos, $from.pos, board)
    return
  }
  const block = $from.node(1)
  const start = $from.before(1)
  const end = start + block.nodeSize
  if (block.type.name === 'paragraph' && block.content.size === 0) placeBoard(editor, start, end, board)
  else placeBoard(editor, end, end, board)
}

/** The top-level task list holding the selection, if any. */
export function topLevelTaskList(editor: Editor): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = editor.state.selection
  if ($from.depth < 1) return null
  const node = $from.node(1)
  if (node.type.name !== 'taskList') return null
  return { node, pos: $from.before(1) }
}

/** Turn the top-level task list around the selection into a board (cards in the first column). */
export function convertTaskListToBoard(editor: Editor, names: KanbanDefaultColumns): boolean {
  const list = topLevelTaskList(editor)
  if (!list) return false
  const md = htmlToMarkdown(getHTMLFromFragment(Fragment.from(list.node), editor.schema))
  placeBoard(editor, list.pos, list.pos + list.node.nodeSize, taskListMarkdownToBoard(md, names, 2))
  return true
}

/** Replace the board at `pos` by a task list with all its cards (or an empty paragraph). */
export function convertBoardToTaskList(editor: Editor, pos: number, board: KanbanBoardData) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== KANBAN_NODE_NAME) return
  const md = boardToTaskListMarkdown(board)
  editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, htmlFromMarkdown(md)).run()
}
