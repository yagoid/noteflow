import { Extension } from '@tiptap/core'
import type { Command, EditorState, Transaction } from '@tiptap/pm/state'
import { CellSelection, deleteCellSelection } from '@tiptap/pm/tables'
import { SuggestionPluginKey } from '@tiptap/suggestion'
import { isMac } from '../../lib/platform'
import { tableShortcuts, type TableShortcutAction } from '../../lib/tableShortcuts'
import {
  clearSelectedCells, deleteSelectedColumns, deleteSelectedRows, dispatchOwnUndoStep, duplicateSelectedRow,
  insertColumnRight, insertRowBelow, moveSelectedColumn, moveSelectedRow, selectionInTable,
} from './tableOps'

/** Whether the cursor is in a list (task, bullet, numbered) inside a table cell. */
function inListInCell(state: EditorState): boolean {
  const { $head } = state.selection
  for (let d = $head.depth; d > 0; d--) {
    const node = $head.node(d)
    const role = (node.type.spec as { tableRole?: string }).tableRole
    if (role === 'cell' || role === 'header_cell') return false
    if (node.type.spec.group?.split(' ').includes('list')) return true
  }
  return false
}

const COMMANDS: Record<TableShortcutAction, Command> = {
  moveRowUp: moveSelectedRow(-1),
  moveRowDown: moveSelectedRow(1),
  moveColumnLeft: moveSelectedColumn(-1),
  moveColumnRight: moveSelectedColumn(1),
  insertRowBelow,
  insertColumnRight,
  duplicateRow: duplicateSelectedRow,
  deleteRows: deleteSelectedRows,
  deleteColumns: deleteSelectedColumns,
}

/**
 * Keyboard shortcuts of the note editor's tables (chords in
 * lib/tableShortcuts.ts, commands in tableOps.ts — one transaction, one
 * Ctrl+Z each, never merged with the typing around it). They only act in an
 * editable editor with the selection in a table; elsewhere the keys pass
 * through untouched (Mod+Enter stays a hard break, Alt+↑/↓ moves list items). Inside a table a chord is the table's: at
 * an edge (first row up, header duplicated…) it's consumed without doing
 * anything — except Alt+↑/↓ in a list inside a cell, which always belongs to
 * the list (ListItemMove). While the "/" menu is open its own keys win.
 *
 * Backspace / Delete (also with Mod) on a CellSelection empty the selected
 * cells, never delete the table — even if every cell is selected (TipTap's
 * Table would delete it); deleting a table stays in the toolbar / menu. Tab /
 * Shift+Tab are TipTap Table's (next / previous cell; a row is added after the
 * last cell) and Enter is a new line in the cell: not bound here.
 *
 * Priority above the default 100 so these run before TipTap Table's
 * Backspace, LineBreak's Mod-Enter and ListItemMove's Alt+↑/↓.
 */
export const TableKeymap = Extension.create({
  name: 'tableKeymap',

  priority: 150,

  addKeyboardShortcuts() {
    const shortcuts = tableShortcuts(isMac)
    const active = (): EditorState | null => {
      const { editor } = this
      if (!editor.isEditable || editor.view.composing) return null
      const { state } = editor
      if (SuggestionPluginKey.getState(state)?.active) return null
      return selectionInTable(state) ? state : null
    }
    // Each chord is an undo step of its own: closed before (not merged with the
    // typing just before it) and after (nor with the typing that follows).
    const dispatch = (tr: Transaction) => dispatchOwnUndoStep(this.editor.view, tr.scrollIntoView())
    const chord = (action: TableShortcutAction) => () => {
      const state = active()
      if (!state) return false
      if ((action === 'moveRowUp' || action === 'moveRowDown') && inListInCell(state)) return false
      COMMANDS[action](state, dispatch)
      return true
    }
    const clearCells = () => {
      const state = active()
      if (!state || !(state.selection instanceof CellSelection)) return false
      // Tables with merged cells (pasted HTML) aren't tableOps' — empty them the prosemirror-tables way.
      if (!clearSelectedCells(state, dispatch)) deleteCellSelection(state, dispatch)
      return true
    }
    const bindings: Record<string, () => boolean> = {
      Backspace: clearCells,
      'Mod-Backspace': clearCells,
      Delete: clearCells,
      'Mod-Delete': clearCells,
    }
    for (const action of Object.keys(shortcuts) as TableShortcutAction[]) {
      bindings[shortcuts[action].pm] = chord(action)
    }
    return bindings
  },
})
