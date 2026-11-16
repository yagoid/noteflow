// The table controls' menus on a live editor: reads the table and asks the
// commands what can run, then lets src/lib/tableControls.ts build the entries.

import type { Editor } from '@tiptap/core'
import type { Command } from '@tiptap/pm/state'
import type { Messages } from '../../i18n'
import { isMac } from '../../lib/platform'
import {
  cellMenu, columnMenu, menuShortcutHints, rowMenu, type Box, type MenuPlacement, type TableAction, type TableMenuEntry,
} from '../../lib/tableControls'
import { canRunTableCommand, dispatchOwnUndoStep, getCellSelectionRect, getTableData, tableActionCommand } from './tableOps'
import { tablePosOfDom } from './tableDom'

/** Which menu: a column's or a row's handle, or a cell's (right-click, toolbar). */
export type TableMenuSpec =
  | { kind: 'column'; index: number }
  | { kind: 'row'; index: number }
  | { kind: 'cell'; row: number; col: number }

/** An open table menu (TableMenu.tsx). */
export interface TableMenuState {
  /** Identifies what opened it: its opener closes it when clicked again. */
  key: string
  /** The table it acts on (its position is resolved again for every action). */
  table: HTMLTableElement
  spec: TableMenuSpec
  anchor: Box
  placement: MenuPlacement
  /** The element that opened it: pressing it isn't a click outside (the opener toggles the menu). */
  owner?: HTMLElement | null
}

/** The table chords as the menus show them (same source as the keymap and Settings → Shortcuts). */
const HINTS = menuShortcutHints(isMac)

/** The entries of `spec`'s menu on the table at `tablePos`; empty when there's no such table any more. */
export function tableMenuEntries(editor: Editor, tablePos: number, spec: TableMenuSpec, t: Messages): TableMenuEntry[] {
  const target = { tablePos }
  const can = (action: TableAction) => canRunTableCommand(editor, tableActionCommand(action, target))
  const data = getTableData(editor.state, target)
  const m = t.editor.table
  if (spec.kind === 'cell') {
    if (!editor.state.doc.nodeAt(tablePos)) return []
    return cellMenu(data, spec, getCellSelectionRect(editor.state, target), can, m, HINTS)
  }
  if (!data) return []
  return spec.kind === 'column' ? columnMenu(data, spec.index, can, m, HINTS) : rowMenu(spec.index, can, m, HINTS)
}

/**
 * Run a command of the table controls as an undo step of its OWN
 * (tableOps.dispatchOwnUndoStep, like the table chords: a double click on "+"
 * is two steps, typing then an action is two), then refocus the editor. False
 * if it can't run or the editor is read-only.
 */
export function runControlCommand(editor: Editor, command: Command): boolean {
  if (!editor.isEditable) return false
  const { view } = editor
  const ok = command(view.state, (tr) => dispatchOwnUndoStep(view, tr))
  if (ok) view.focus()
  return ok
}

/** Run a menu action on `table` (its own undo step: runControlCommand). False if the table is gone or the action can't run. */
export function runTableAction(editor: Editor, table: HTMLTableElement, action: TableAction): boolean {
  const tablePos = tablePosOfDom(editor.view, table)
  if (tablePos === null) return false
  return runControlCommand(editor, tableActionCommand(action, { tablePos }))
}
