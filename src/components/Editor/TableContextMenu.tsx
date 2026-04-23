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
} from 'lucide-react'

interface Props {
  editor: Editor
}

interface MenuPos {
  x: number
  y: number
}

export function TableContextMenu({ editor }: Props) {
  const [pos, setPos] = useState<MenuPos | null>(null)

  useEffect(() => {
    const dom = editor.view.dom
    const handleContextMenu = (e: MouseEvent) => {
      if (!editor.isEditable) return
      const target = e.target as HTMLElement | null
      if (!target || !target.closest('table')) return
      e.preventDefault()
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
  const MENU_H = 260
  const left = Math.min(pos.x, window.innerWidth - MENU_W - 4)
  const top  = Math.min(pos.y, window.innerHeight - MENU_H - 4)

  return (
    <div
      className="fixed z-50 bg-surface-2 border border-border rounded shadow-lg py-1 text-xs font-mono"
      style={{ left, top, minWidth: MENU_W }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuItem onClick={run(() => editor.chain().focus().addRowBefore().run())}>
        <Plus size={11} /> Row <ArrowUp size={11} />
      </MenuItem>
      <MenuItem onClick={run(() => editor.chain().focus().addRowAfter().run())}>
        <Plus size={11} /> Row <ArrowDown size={11} />
      </MenuItem>
      <MenuItem onClick={run(() => editor.chain().focus().deleteRow().run())}>
        <Minus size={11} /> Row
      </MenuItem>
      <div className="my-1 border-t border-border" />
      <MenuItem onClick={run(() => editor.chain().focus().addColumnBefore().run())}>
        <Plus size={11} /> Col <ArrowLeft size={11} />
      </MenuItem>
      <MenuItem onClick={run(() => editor.chain().focus().addColumnAfter().run())}>
        <Plus size={11} /> Col <ArrowRight size={11} />
      </MenuItem>
      <MenuItem onClick={run(() => editor.chain().focus().deleteColumn().run())}>
        <Minus size={11} /> Col
      </MenuItem>
      <div className="my-1 border-t border-border" />
      <MenuItem onClick={run(() => editor.chain().focus().deleteTable().run())}>
        <Trash2 size={11} /> Delete table
      </MenuItem>
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
    >
      {children}
    </button>
  )
}
