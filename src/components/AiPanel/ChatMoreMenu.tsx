import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useT } from '../../i18n/useT'

export interface ChatMenuItem {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Tooltip (e.g. why the item is disabled). */
  title?: string
}

/** The ⋯ menu of the editor chat sidebar and of the detached chat window. */
export function ChatMoreMenu({ items }: { items: ChatMenuItem[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t.aiPanel.sidebar.moreOptions}
        aria-label={t.aiPanel.sidebar.moreOptions}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${open ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 min-w-[200px] rounded-lg border border-border bg-surface-1 shadow-2xl py-1">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              onClick={() => { setOpen(false); item.onClick() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
            >
              <span className="shrink-0 flex items-center">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
