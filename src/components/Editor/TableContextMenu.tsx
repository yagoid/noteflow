import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Plus,
  Minus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react'
import { setColumnAlign } from './tableUtils'
import { useT } from '../../i18n/useT'

interface Props {
  editor: Editor
}

interface MenuPos {
  x: number
  y: number
}

export function TableContextMenu({ editor }: Props) {
  const t = useT()
  const [pos, setPos] = useState<MenuPos | null>(null)

  useEffect(() => {
    const dom = editor.view.dom
    const handleContextMenu = (e: MouseEvent) => {
      if (!editor.isEditable) return
      const target = e.target as HTMLElement | null
      if (!target || !target.closest('table')) return
      e.preventDefault()
      // Move the cursor to the right-clicked cell so menu actions (add/delete
      // row/col, alignment) act on the cell under the pointer, not wherever the
      // caret happened to be.
      const at = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (at) editor.commands.setTextSelection(at.pos)
      setPos({ x: e.clientX, y: e.clientY })
    }
    dom.addEventListener('contextmenu', handleContextMenu)
    return () => dom.removeEventListener('contextmenu', handleContextMenu)
  }, [editor])

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [pos])

  if (!pos) return null

  const run = (fn: () => void) => () => {
    fn()
    setPos(null)
  }

  // Clamp to viewport so the menu doesn't overflow the window edges.
  const MENU_W = 180
  const MENU_H = 360
  const left = Math.min(pos.x, window.innerWidth - MENU_W - 4)
  const top  = Math.min(pos.y, window.innerHeight - MENU_H - 4)

  // The header row must stay at row 0 (markdown tables require a header), so
  // block actions that would remove it or push a body row above it.
  const inHeader = editor.isActive('tableHeader')

  return (
    <div
      className="fixed z-50 bg-surface-2 border border-border rounded-lg shadow-lg py-1 text-xs font-mono"
      style={{ left, top, minWidth: MENU_W }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuItem disabled={inHeader} onClick={run(() => editor.chain().focus().addRowBefore().run())}>
        <Plus size={11} /> {t.editor.table.row} <ArrowUp size={11} />
      </MenuItem>
      <MenuItem onClick={run(() => editor.chain().focus().addRowAfter().run())}>
        <Plus size={11} /> {t.editor.table.row} <ArrowDown size={11} />
      </MenuItem>
      <MenuItem disabled={inHeader} onClick={run(() => editor.chain().focus().deleteRow().run())}>
        <Minus size={11} /> {t.editor.table.row}
      </MenuItem>
      <div className="my-1 border-t border-border" />
      <MenuItem onClick={run(() => editor.chain().focus().addColumnBefore().run())}>
        <Plus size={11} /> {t.editor.table.col} <ArrowLeft size={11} />
      </MenuItem>
      <MenuItem onClick={run(() => editor.chain().focus().addColumnAfter().run())}>
        <Plus size={11} /> {t.editor.table.col} <ArrowRight size={11} />
      </MenuItem>
      <MenuItem onClick={run(() => editor.chain().focus().deleteColumn().run())}>
        <Minus size={11} /> {t.editor.table.col}
      </MenuItem>
      <div className="my-1 border-t border-border" />
      <MenuItem onClick={run(() => setColumnAlign(editor, 'left'))}>
        <AlignLeft size={11} /> {t.editor.table.alignLeftMenu}
      </MenuItem>
      <MenuItem onClick={run(() => setColumnAlign(editor, 'center'))}>
        <AlignCenter size={11} /> {t.editor.table.alignCenterMenu}
      </MenuItem>
      <MenuItem onClick={run(() => setColumnAlign(editor, 'right'))}>
        <AlignRight size={11} /> {t.editor.table.alignRightMenu}
      </MenuItem>
      <div className="my-1 border-t border-border" />
      <MenuItem onClick={run(() => editor.chain().focus().deleteTable().run())}>
        <Trash2 size={11} /> {t.editor.table.deleteTableMenu}
      </MenuItem>
    </div>
  )
}

function MenuItem({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 w-full px-3 py-1.5 text-left transition-colors
        ${disabled
          ? 'text-text-muted/30 cursor-not-allowed'
          : 'text-text-muted hover:text-text hover:bg-surface-3'
        }`}
    >
      {children}
    </button>
  )
}
