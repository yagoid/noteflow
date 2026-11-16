import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowDown01, ArrowDown10, ArrowDownAZ, ArrowDownZA,
  ArrowLeft, ArrowRight, ArrowUp, BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd,
  BetweenVerticalStart, Copy, Eraser, Lock, Table as TableIcon, Trash2, type LucideIcon,
} from 'lucide-react'
import { useT } from '../../i18n/useT'
import {
  focusableItems, placeMenu, stepFocus, type TableAction, type TableMenuIcon,
} from '../../lib/tableControls'
import type { TableAlign } from '../../lib/tableData'
import { tablePosOfDom } from './tableDom'
import { runTableAction, tableMenuEntries, type TableMenuState } from './tableMenus'

const ICONS: Record<TableMenuIcon, LucideIcon> = {
  insertLeft: BetweenVerticalStart,
  insertRight: BetweenVerticalEnd,
  insertAbove: BetweenHorizontalStart,
  insertBelow: BetweenHorizontalEnd,
  duplicate: Copy,
  moveLeft: ArrowLeft,
  moveRight: ArrowRight,
  moveUp: ArrowUp,
  moveDown: ArrowDown,
  sortAsc: ArrowDownAZ,
  sortDesc: ArrowDownZA,
  sortNumAsc: ArrowDown01,
  sortNumDesc: ArrowDown10,
  clear: Eraser,
  delete: Trash2,
  deleteTable: TableIcon,
}

const ALIGNS: { value: Exclude<TableAlign, null>; Icon: LucideIcon }[] = [
  { value: 'left', Icon: AlignLeft },
  { value: 'center', Icon: AlignCenter },
  { value: 'right', Icon: AlignRight },
]

/**
 * A table menu (a handle's, the right-click one, the toolbar's): portal
 * `fixed z-50`, placed next to its anchor inside the window
 * (lib/tableControls.ts placeMenu). Its entries are rebuilt on every editor
 * transaction (the align switch keeps it open). The focus stays in the editor
 * (mousedown + preventDefault), so the keys are read in the capture phase on
 * `window`: ↑/↓ walk the enabled entries, Enter runs one, Esc closes — none
 * reach ProseMirror. A click outside (but not on its `owner`, which toggles it
 * itself), a scroll outside it or a resize closes it. Never taller than the
 * window (it scrolls inside: a sticky can be 300px high).
 */
export function TableMenu({ editor, menu, onClose }: { editor: Editor; menu: TableMenuState; onClose: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [, setVersion] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [focus, setFocus] = useState(-1)

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    editor.on('transaction', bump)
    return () => { editor.off('transaction', bump) }
  }, [editor])

  const tablePos = tablePosOfDom(editor.view, menu.table)
  const entries = tablePos === null ? [] : tableMenuEntries(editor, tablePos, menu.spec, t)
  const items = focusableItems(entries)
  const empty = entries.length === 0

  // The table went away (deleted, undone, the note changed): nothing to show.
  useEffect(() => { if (empty) onClose() }, [empty, onClose])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const next = placeMenu(menu.anchor, { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }, menu.placement)
    setPos((p) => (p && p.left === next.left && p.top === next.top ? p : next))
  }, [menu.anchor, menu.placement, entries.length])

  const run = (action: TableAction) => {
    if (action.type !== 'align') onClose()
    runTableAction(editor, menu.table, action)
  }
  // The listeners below read these through refs: registered once per menu, not on every render.
  const runRef = useRef(run)
  const itemsRef = useRef(items)
  const focusRef = useRef(focus)
  useEffect(() => {
    runRef.current = run
    itemsRef.current = items
    focusRef.current = focus
  })
  // A height-capped menu (short window, sticky) scrolls: keep the keyboard-focused item in view.
  // That scroll happens inside the menu, so the close-on-scroll listener ignores it.
  useEffect(() => {
    if (focus >= 0) ref.current?.querySelector('.nf-table-menu-item.is-focused')?.scrollIntoView({ block: 'nearest' })
  }, [focus])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const swallow = () => { e.preventDefault(); e.stopPropagation() }
      if (e.key === 'Escape') { swallow(); onClose(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        swallow()
        setFocus((f) => stepFocus(f, itemsRef.current.length, e.key === 'ArrowDown' ? 1 : -1))
        return
      }
      if (e.key === 'Enter') {
        swallow()
        const item = itemsRef.current[focusRef.current]
        if (item) runRef.current(item.action)
        else onClose()
        return
      }
      // Any other key (typing on, Tab, a shortcut) goes to the editor: the menu steps aside.
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) onClose()
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || menu.owner?.contains(target)) return
      onClose()
    }
    const close = () => onClose()
    // A scroll inside the menu (capped to the window's height, it scrolls when taller) isn't a reason to close.
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [menu.owner, onClose])

  if (empty) return null
  const focused = items[focus]

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="nf-table-menu fixed z-50 bg-surface-2 border border-border rounded-lg shadow-xl animate-in fade-in zoom-in duration-100"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) => {
        switch (entry.type) {
          case 'heading':
            return <div key={i} className="nf-table-menu-heading">{entry.label}</div>
          case 'separator':
            return <div key={i} className="nf-table-menu-sep" role="separator" />
          case 'note':
            return (
              <div key={i} className="nf-table-menu-note">
                <Lock size={13} aria-hidden />
                <span>{entry.text}</span>
              </div>
            )
          case 'align': {
            const current = entry.current ?? 'left'
            const CurrentIcon = ALIGNS.find((a) => a.value === current)!.Icon
            const labels = { left: t.editor.table.alignLeft, center: t.editor.table.alignCenter, right: t.editor.table.alignRight }
            return (
              <div key={i} className="nf-table-menu-align" role="group" aria-label={t.editor.table.alignColumn}>
                <span className="nf-table-menu-icon"><CurrentIcon size={14} aria-hidden /></span>
                <span className="nf-table-menu-label">{t.editor.table.alignColumn}</span>
                <span className="nf-table-menu-seg">
                  {ALIGNS.map(({ value, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      title={labels[value]}
                      aria-label={labels[value]}
                      aria-pressed={current === value}
                      className={current === value ? 'is-on' : undefined}
                      // A null alignment shows as "left": pressing left then changes nothing.
                      onClick={() => { if (current !== value) run({ type: 'align', column: entry.column, align: value }) }}
                    >
                      <Icon size={14} aria-hidden />
                    </button>
                  ))}
                </span>
              </div>
            )
          }
          case 'item': {
            const Icon = ICONS[entry.icon]
            return (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                data-entry={entry.id}
                // aria-disabled, not disabled: a disabled button shows no tooltip (`title` = why).
                aria-disabled={entry.disabled || undefined}
                title={entry.reason}
                className={`nf-table-menu-item${entry.danger ? ' is-danger' : ''}${entry === focused ? ' is-focused' : ''}`}
                onMouseEnter={() => setFocus(entry.disabled ? -1 : items.indexOf(entry))}
                onClick={() => { if (!entry.disabled) run(entry.action) }}
              >
                <span className="nf-table-menu-icon"><Icon size={14} aria-hidden /></span>
                <span className="nf-table-menu-label">{entry.label}</span>
                {entry.kbd && <kbd>{entry.kbd}</kbd>}
              </button>
            )
          }
        }
      })}
    </div>,
    document.body,
  )
}
