import { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  id: string
  label?: string
  indicator?: React.ReactNode
  action?: () => void
  disabled?: boolean
  /** Custom content rendered in place of the standard button row */
  node?: React.ReactNode
}

export interface MenuItemGroup {
  label?: string
  items: MenuItem[]
}

interface TitleBarMenuProps {
  trigger: React.ReactNode
  groups: MenuItemGroup[]
}

export function TitleBarMenu({ trigger, groups }: TitleBarMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
      >
        {trigger}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-0.5 min-w-[180px] bg-surface-1 border border-border rounded shadow-2xl z-50">
          {groups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'border-t border-border' : ''}>
              {group.label && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-mono text-text-muted/80 uppercase tracking-widest">
                  {group.label}
                </div>
              )}
              {group.items.map((item) =>
                item.node ? (
                  <div key={item.id} className="px-3 py-1.5 text-xs font-mono text-text">
                    {item.node}
                  </div>
                ) : (
                  <button
                    key={item.id}
                    onClick={() => { item.action?.(); setOpen(false) }}
                    disabled={item.disabled}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
                  >
                    {item.indicator !== undefined && (
                      <span className="w-[10px] flex-shrink-0 flex items-center justify-center">
                        {item.indicator}
                      </span>
                    )}
                    {item.label}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
