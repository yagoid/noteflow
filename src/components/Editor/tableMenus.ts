// The table controls' menus on a live editor: reads the table and asks the
// commands what can run, then lets src/lib/tableControls.ts build the entries.

import type { Editor } from '@tiptap/core'
import type { Command } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import type { Messages } from '../../i18n'
import {
  cellMenu, columnMenu, rowMenu, type Box, type MenuPlacement, type TableAction, type TableMenuEntry,
} from '../../lib/tableControls'
import { canRunTableCommand, getCellSelectionRect, getTableData, tableActionCommand } from './tableOps'
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

/** The entries of `spec`'s menu on the table at `tablePos`; empty when there's no such table any more. */
export function tableMenuEntries(editor: Editor, tablePos: number, spec: TableMenuSpec, t: Messages): TableMenuEntry[] {
  const target = { tablePos }
  const can = (action: TableAction) => canRunTableCommand(editor, tableActionCommand(action, target))
  const data = getTableData(editor.state, target)
  const m = t.editor.table
  if (spec.kind === 'cell') {
    if (!editor.state.doc.nodeAt(tablePos)) return []
    return cellMenu(data, spec, getCellSelectionRect(editor.state, target), can, m)
  }
  if (!data) return []
  return spec.kind === 'column' ? columnMenu(data, spec.index, can, m) : rowMenu(spec.index, can, m)
}

/**
 * Run a command of the table controls as an undo step of its OWN, then refocus
 * the editor. prosemirror-history merges adjacent transactions less than
 * newGroupDelay (500 ms) apart, and a table rebuild is always adjacent to the
 * last edit in it: without this, a double click on "+" (two rows) or typing in
 * a cell and then clicking an action would come back with one Ctrl+Z. The
 * action's transaction carries closeHistory (a new group, apart from what came
 * before) and an empty closeHistory transaction follows it (the history plugin
 * applies that meta before its "no steps" early return), so what comes next
 * starts a new group too. Only the controls' path: runTableCommand (keyboard
 * shortcuts) keeps the default grouping. False if it can't run or the editor is
 * read-only.
 */
export function runControlCommand(editor: Editor, command: Command): boolean {
  if (!editor.isEditable) return false
  const { view } = editor
  let dispatched = false
  const ok = command(view.state, (tr) => {
    dispatched = true
    view.dispatch(closeHistory(tr))
  })
  if (dispatched) view.dispatch(closeHistory(view.state.tr))
  if (ok) view.focus()
  return ok
}

/** Run a menu action on `table` (its own undo step: runControlCommand). False if the table is gone or the action can't run. */
export function runTableAction(editor: Editor, table: HTMLTableElement, action: TableAction): boolean {
  const tablePos = tablePosOfDom(editor.view, table)
  if (tablePos === null) return false
  return runControlCommand(editor, tableActionCommand(action, { tablePos }))
}
