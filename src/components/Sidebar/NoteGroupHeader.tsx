import { ChevronRight } from 'lucide-react'
import { useT } from '../../i18n/useT'
import type { NoteGroup } from '../../types'

interface NoteGroupHeaderProps {
  group: NoteGroup
  noteCount: number
  collapsed: boolean
  /** Title of the open note when it belongs to this group (shown beside the name while collapsed). */
  openNoteTitle?: string | null
  onToggle: () => void
  onOpenGroupView: () => void
  onContextMenu: (e: React.MouseEvent) => void
  /** Pointer entered / moves over the header (drives the collapsed-group peek). Stable. */
  onPeekHover?: (groupId: string, el: HTMLElement) => void
  /** Pointer left the header. Stable. */
  onPeekLeave?: () => void
}

/**
 * Group header of the sidebar ("index with guides"): folded-corner tab, name, the open
 * note's title while collapsed, count and a chevron that only shows on hover/focus. The
 * group colour comes from `--g` on the group's `li`; the sticky box, guide connector and
 * drop underline belong to the `.sbg-gh` wrapper in Sidebar. Styles: `.sbg-*` in index.css.
 */
export function NoteGroupHeader({ group, noteCount, collapsed, openNoteTitle, onToggle, onOpenGroupView, onContextMenu, onPeekHover, onPeekLeave }: NoteGroupHeaderProps) {
  const t = useT()
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      className="sbg-ghb select-none"
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onToggle()
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
      onMouseEnter={onPeekHover && ((e) => onPeekHover(group.id, e.currentTarget))}
      onMouseMove={onPeekHover && ((e) => onPeekHover(group.id, e.currentTarget))}
      onMouseLeave={onPeekLeave}
    >
      <span className="sbg-tab" aria-hidden />
      <span
        onClick={(e) => { e.stopPropagation(); onOpenGroupView() }}
        title={t.common.openGroupView}
        className="sbg-gname font-mono"
      >
        {group.name}
      </span>
      <span className="sbg-gact font-mono">{openNoteTitle ?? ''}</span>
      <span className="sbg-sp" />
      <span className="sbg-count font-mono">{noteCount}</span>
      <span className="sbg-chev" aria-hidden>
        <ChevronRight size={12} strokeWidth={2.6} />
      </span>
    </div>
  )
}
