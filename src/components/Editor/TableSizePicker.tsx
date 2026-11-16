import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Table as TableIcon } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { DEFAULT_TABLE_SIZE, TABLE_PICKER_MAX, clampTableSize, moveTableSize, type TableSize } from '../../lib/tableInsert'
import { insertNewTable } from './tableCommands'

const CELLS = Array.from({ length: TABLE_PICKER_MAX }, (_, i) => i)
// Popover width: 8 cells of 14px + 7 gaps of 3px + 2 × 8px padding (p-2) + 2px border.
const PANEL_WIDTH = 8 * 14 + 7 * 3 + 16 + 2

// Same input rules as SnippetsButton: act on mousedown (+ preventDefault, the
// editor keeps its selection) and on a click with detail === 0 (Enter/Space on
// the focused button); a mouse click's later onClick has detail ≥ 1 and is ignored.
const fromKeyboard = (e: React.MouseEvent) => e.detail === 0

// The toolbar's table button: opens a rows × columns grid; hovering highlights a
// size, a click inserts it. Keyboard: arrows move the highlight, Enter inserts,
// Escape closes (focus back in the editor). Rows include the header row — every
// new table has one (lib/tableInsert.ts).
export function TableSizePicker({ editor }: { editor: Editor }) {
  const t = useT()
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null)
  const [size, setSize] = useState<TableSize>(DEFAULT_TABLE_SIZE)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setPanelPos(null), [])

  const insert = useCallback((s: TableSize) => {
    close()
    insertNewTable(editor, s)
  }, [close, editor])

  const toggle = () => {
    if (panelPos) { close(); return }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8))
    setSize(DEFAULT_TABLE_SIZE)
    setPanelPos({ top: rect.bottom + 4, left })
  }

  // Click outside closes (the button toggles it itself). Keys in the capture
  // phase: the editor keeps the focus after a mouse open (and the note editor
  // stops keydown propagation), so arrows / Enter must not reach it.
  useEffect(() => {
    if (!panelPos) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
        editor.commands.focus()
        return
      }
      // Leave modified keys (Ctrl/Shift+arrow, Ctrl+Enter…) to the editor.
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        insert(size)
        return
      }
      if (e.key === 'Tab') { close(); return }
      const next = moveTableSize(size, e.key)
      if (next) {
        e.preventDefault()
        e.stopPropagation()
        setSize(next)
      }
    }
    const onResize = () => close()
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onResize)
    }
  }, [panelPos, size, close, insert, editor])

  const description = tf(t.editor.tablePicker.sizeDescription, {
    rows: plural(t.editor.tablePicker.rowsPlural, size.rows),
    cols: plural(t.editor.tablePicker.colsPlural, size.cols),
  })

  return (
    <>
      <button
        ref={buttonRef}
        onMouseDown={(e) => { e.preventDefault(); toggle() }}
        onClick={(e) => { if (fromKeyboard(e)) toggle() }}
        title={t.editor.toolbar.insertTable}
        aria-label={t.editor.toolbar.insertTable}
        aria-expanded={panelPos !== null}
        className={`p-1.5 rounded text-xs transition-colors font-mono
          ${panelPos ? 'bg-surface-3 text-text' : 'text-text-muted hover:text-text hover:bg-surface-3'}`}
      >
        <TableIcon size={14} />
      </button>

      {panelPos && createPortal(
        <div
          ref={panelRef}
          role="group"
          aria-label={t.editor.toolbar.insertTable}
          style={{ top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH }}
          className="fixed z-50 bg-surface-2 border border-border rounded-lg shadow-xl p-2 animate-in fade-in zoom-in duration-100"
        >
          <div className="flex flex-col gap-[3px]" aria-hidden>
            {CELLS.map((r) => (
              <div key={r} className="flex gap-[3px]">
                {CELLS.map((c) => {
                  const on = r < size.rows && c < size.cols
                  const cell = clampTableSize({ rows: r + 1, cols: c + 1 })
                  return (
                    <div
                      key={c}
                      onMouseEnter={() => setSize(cell)}
                      onMouseDown={(e) => { e.preventDefault(); insert(cell) }}
                      className={`w-[14px] h-[14px] rounded-[2px] border cursor-pointer transition-colors
                        ${on ? 'bg-accent/30 border-accent/70' : 'bg-surface-3/60 border-border'}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div className="mt-2 text-center font-mono">
            <div className="text-xs text-text" title={description}>
              {tf(t.editor.tablePicker.size, { rows: size.rows, cols: size.cols })}
            </div>
            <div className="text-[10px] leading-tight text-text-muted/70">{t.editor.tablePicker.hint}</div>
          </div>
          <span className="sr-only" aria-live="polite">{description}</span>
        </div>,
        document.body,
      )}
    </>
  )
}
