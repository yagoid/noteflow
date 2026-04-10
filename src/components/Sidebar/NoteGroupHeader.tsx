import { ChevronRight, ChevronDown } from 'lucide-react'
import type { NoteGroup } from '../../types'

interface NoteGroupHeaderProps {
  group: NoteGroup
  noteCount: number
  collapsed: boolean
  onToggle: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function NoteGroupHeader({ group, noteCount, collapsed, onToggle, onContextMenu }: NoteGroupHeaderProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none transition-colors hover:bg-surface-2"
      style={!collapsed ? {
        background: `rgb(var(${group.color}) / 0.07)`,
        borderBottom: `1px solid rgb(var(${group.color}) / 0.2)`,
      } : undefined}
      onClick={onToggle}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: `rgb(var(${group.color}))` }}
      />
      <span className="flex-1 text-[11px] font-mono text-text-muted uppercase tracking-wider truncate">
        {group.name}
      </span>
      <span className="text-[10px] font-mono text-text-muted/50 flex-shrink-0">
        {noteCount}
      </span>
      <span className="text-text-muted/50 flex-shrink-0">
        {collapsed
          ? <ChevronRight size={11} />
          : <ChevronDown size={11} />
        }
      </span>
    </div>
  )
}
