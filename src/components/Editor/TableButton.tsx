import { useCallback, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Table as TableIcon } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { findTablePos, getSelectionCell } from './tableOps'
import { tableDomAt } from './tableDom'
import type { TableMenuState } from './tableMenus'
import { TableMenu } from './TableMenu'
import { TableSizePicker } from './TableSizePicker'

// Same input rules as SnippetsButton: act on mousedown (+ preventDefault, the
// editor keeps its selection) and on a click with detail === 0 (Enter/Space on
// the focused button); a mouse click's later onClick has detail ≥ 1 and is ignored.
const fromKeyboard = (e: React.MouseEvent) => e.detail === 0

/**
 * The toolbar's table button. With the selection inside a table it opens that
 * table's menu on the active cell (TableMenu: the right-click menu, Delete
 * table included) under the button; elsewhere, the size picker that inserts
 * one (TableSizePicker). Pressing it again closes whichever is open.
 */
export function TableButton({ editor }: { editor: Editor }) {
  const t = useT()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<{ picker: DOMRect } | TableMenuState | null>(null)
  const close = useCallback(() => setOpen(null), [])

  // Read at render: the toolbar re-renders on every editor transaction.
  const inTable = findTablePos(editor.state) !== null
  const label = inTable ? t.editor.toolbar.tableOptions : t.editor.toolbar.insertTable

  const toggle = () => {
    if (open) { close(); return }
    const button = buttonRef.current
    if (!button) return
    const tablePos = findTablePos(editor.state)
    const table = tablePos === null ? null : tableDomAt(editor.view, tablePos)
    if (!table || tablePos === null) { setOpen({ picker: button.getBoundingClientRect() }); return }
    // The active cell: the cursor's, or a cell selection's head. A table the
    // commands can't edit (merged cells) still gets the menu: Delete table.
    const cell = getSelectionCell(editor.state) ?? { row: 0, col: 0 }
    setOpen({
      key: 'toolbar',
      table,
      spec: { kind: 'cell', row: cell.row, col: cell.col },
      anchor: button.getBoundingClientRect(),
      placement: 'below',
      owner: button,
    })
  }

  return (
    <>
      <button
        ref={buttonRef}
        onMouseDown={(e) => { e.preventDefault(); toggle() }}
        onClick={(e) => { if (fromKeyboard(e)) toggle() }}
        title={label}
        aria-label={label}
        aria-haspopup={inTable ? 'menu' : undefined}
        aria-expanded={open !== null}
        className={`p-1.5 rounded text-xs transition-colors font-mono
          ${open || inTable ? 'bg-surface-3 text-text' : 'text-text-muted hover:text-text hover:bg-surface-3'}`}
      >
        <TableIcon size={14} />
      </button>
      {open && 'picker' in open && <TableSizePicker editor={editor} anchor={open.picker} buttonRef={buttonRef} onClose={close} />}
      {open && 'key' in open && <TableMenu key={open.key} editor={editor} menu={open} onClose={close} />}
    </>
  )
}
