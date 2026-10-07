import { ChevronRight, ChevronDown } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { colorChannels } from '../../lib/tagColors'
import type { NoteGroup } from '../../types'

interface NoteGroupHeaderProps {
  group: NoteGroup
  noteCount: number
  collapsed: boolean
  onToggle: () => void
  onOpenGroupView: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function NoteGroupHeader({ group, noteCount, collapsed, onToggle, onOpenGroupView, onContextMenu }: NoteGroupHeaderProps) {
  const t = useT()
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors hover:bg-surface-3
        ${collapsed ? '' : 'bg-surface-3/60'}`}
      onClick={onToggle}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: `rgb(${colorChannels(group.color)})` }}
      />
      <span
        onClick={(e) => { e.stopPropagation(); onOpenGroupView() }}
        title={t.common.openGroupView}
        className={`min-w-0 text-[11px] font-mono hover:text-text uppercase tracking-wider truncate transition-colors cursor-pointer
          ${collapsed ? 'text-text-muted font-normal' : 'text-text/75 font-medium'}`}
      >
        {group.name}
      </span>
      <div className="flex-1 min-w-0" />
      <span className={`text-[10px] font-mono font-semibold flex-shrink-0 transition-colors
        ${collapsed ? 'text-text-muted/60' : 'text-text-muted/90'}`}>
        {noteCount}
      </span>
      <span className={`flex-shrink-0 transition-colors ${collapsed ? 'text-text-muted/60' : 'text-text-muted/90'}`}>
        {collapsed
          ? <ChevronRight size={12} strokeWidth={2.5} />
          : <ChevronDown size={12} strokeWidth={3} />
        }
      </span>
    </div>
  )
}
