import { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { CellSelection } from '@tiptap/pm/tables'
import { getCellSelectionRect } from './tableOps'
import { cellIndexOf, tablePosOfDom } from './tableDom'
import type { TableMenuState } from './tableMenus'
import { TableMenu } from './TableMenu'

/** The table cell (and its table) an event happened in, if it's one of this editor's. */
function cellAt(editor: Editor, target: EventTarget | null) {
  const el = target instanceof Element ? target.closest('td, th') : null
  if (!(el instanceof HTMLTableCellElement)) return null
  const table = el.closest('table')
  if (!table || !editor.view.dom.contains(table)) return null
  const index = cellIndexOf(el)
  return index && { table, ...index }
}

/** Whether the selection is a CellSelection of `table` that covers cell (row, col). */
function inCellSelection(editor: Editor, table: HTMLTableElement, row: number, col: number): boolean {
  if (!(editor.state.selection instanceof CellSelection)) return false
  const tablePos = tablePosOfDom(editor.view, table)
  const rect = tablePos === null ? null : getCellSelectionRect(editor.state, { tablePos })
  return !!rect && row >= rect.top && row < rect.bottom && col >= rect.left && col < rect.right
}

/**
 * Right-click on a table cell: the cell's menu (TableMenu: its row, its column,
 * "Clear N cells" for a selection of 2+ cells, Delete table). Right-clicking
 * inside the current cell selection keeps it (its right mousedown is stopped
 * before the browser / ProseMirror move the caret); anywhere else the caret
 * goes to the clicked spot first, so "the cell" is the one under the pointer.
 */
export function TableContextMenu({ editor }: { editor: Editor }) {
  const [menu, setMenu] = useState<TableMenuState | null>(null)
  const close = useCallback(() => setMenu(null), [])

  useEffect(() => {
    const dom = editor.view.dom
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2 || !editor.isEditable) return
      const cell = cellAt(editor, e.target)
      if (cell && inCellSelection(editor, cell.table, cell.row, cell.col)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onContextMenu = (e: MouseEvent) => {
      if (!editor.isEditable) return
      const cell = cellAt(editor, e.target)
      if (!cell) return
      e.preventDefault()
      if (!inCellSelection(editor, cell.table, cell.row, cell.col)) {
        const at = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
        if (at) editor.commands.setTextSelection(at.pos)
      }
      setMenu({
        key: `cell:${e.clientX},${e.clientY}`,
        table: cell.table,
        spec: { kind: 'cell', row: cell.row, col: cell.col },
        anchor: { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY },
        placement: 'point',
      })
    }
    dom.addEventListener('mousedown', onMouseDown, true)
    dom.addEventListener('contextmenu', onContextMenu)
    return () => {
      dom.removeEventListener('mousedown', onMouseDown, true)
      dom.removeEventListener('contextmenu', onContextMenu)
    }
  }, [editor])

  return menu && <TableMenu key={menu.key} editor={editor} menu={menu} onClose={close} />
}
