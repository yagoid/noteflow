import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { colorChannels } from '../../lib/tagColors'
import type { NoteFolder, GroupColor } from '../../types'

interface NoteFolderHeaderProps {
  folder: NoteFolder
  groupColor: GroupColor
  noteCount: number
  collapsed: boolean
  onToggle: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function NoteFolderHeader({
  folder,
  groupColor,
  noteCount,
  collapsed,
  onToggle,
  onContextMenu,
}: NoteFolderHeaderProps) {
  return (
    <div
      className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-md cursor-pointer select-none transition-colors hover:bg-surface-3
        ${collapsed ? '' : 'bg-surface-3/75'}`}
      onClick={onToggle}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
    >
      <ChevronRight
        size={11}
        className="flex-shrink-0 transition-transform duration-150"
        style={{
          transform: collapsed ? 'none' : 'rotate(90deg)',
          color: `rgb(${colorChannels(groupColor)} / 0.7)`,
        }}
      />
      {collapsed
        ? <Folder size={12} className="flex-shrink-0" fill={`rgb(${colorChannels(groupColor)} / 0.16)`} style={{ color: `rgb(${colorChannels(groupColor)})` }} />
        : <FolderOpen size={12} className="flex-shrink-0" fill={`rgb(${colorChannels(groupColor)} / 0.22)`} style={{ color: `rgb(${colorChannels(groupColor)})` }} />
      }
      <span className="flex-1 text-[11.5px] font-mono font-medium text-text/70 truncate">
        {folder.name}
      </span>
      <span className="text-[10px] font-mono text-text-muted/50 flex-shrink-0">
        {noteCount}
      </span>
    </div>
  )
}
