// The table cell holding the caret, for the editor's active-cell marker
// (components/Editor/ActiveTableCell.ts paints it; index.css § Tables styles it).
// The DOM has no trace of where a plain text cursor is — prosemirror-tables only
// marks the cells of a CellSelection (`.selectedCell`) — so the cell is found
// from the selection and decorated. Pure ProseMirror; covered on the editor's
// real schema by tests/lib/tableActiveCell.test.ts.

import type { Selection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'

/** Document range of a table cell node (`from` = the position before it). */
export interface CellRange {
  from: number
  to: number
}

/**
 * The cell (header or body) that holds the whole selection, or null: outside a
 * table, across cells, or a CellSelection (whose cells already carry
 * `.selectedCell`). With nested cells the innermost one wins.
 */
export function activeCellRange(selection: Selection): CellRange | null {
  if (selection instanceof CellSelection) return null
  const { $from, $to } = selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    const role = node.type.spec.tableRole
    if (role !== 'cell' && role !== 'header_cell') continue
    const from = $from.before(d)
    if ($to.depth < d || $to.before(d) !== from) return null
    return { from, to: from + node.nodeSize }
  }
  return null
}
