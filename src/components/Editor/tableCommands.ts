import type { Editor } from '@tiptap/core'
import { insertTableTr, type TableSize } from '../../lib/tableInsert'

/**
 * Insert a new table with a header row (`rows` counts it) and put the caret in
 * its first header cell. Inside a list or another table it lands right after
 * the outermost one (lib/tableInsert.ts tableInsertPos). One transaction = one undo step.
 */
export function insertNewTable(editor: Editor, size: TableSize): void {
  editor.view.dispatch(insertTableTr(editor.state, size))
  editor.commands.focus()
}
