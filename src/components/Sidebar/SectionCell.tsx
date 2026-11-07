import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { EyeOff } from 'lucide-react'
import { colorChannels } from '../../lib/tagColors'
import { useSectionHoverPreview } from '../SectionPreview/hoverPreviewContext'
import { useT } from '../../i18n/useT'
import { renderHighlightedText } from './rowText'
import type { GroupColor, NoteSection } from '../../types'

export interface SectionCellProps {
  noteId: string
  section: NoteSection
  /** The section's resolved colour (resolveGroupColor). */
  color: GroupColor
  /** The section open in the editor: solid colour, `ink` text, no hover preview. */
  active?: boolean
  ink?: string
  /** Search state: a matching cell is tinted, a non-matching one dimmed. */
  match?: 'match' | 'dim' | null
  /** Term highlighted in the name. */
  highlight: string
  /** Reachable with Tab (map of the open note / search results); the hover peek isn't. */
  focusable: boolean
  onClick: (e: MouseEvent, sectionId: string) => void
  onContextMenu: (e: MouseEvent, sectionId: string) => void
  /**
   * Copy for a hidden measure layer (NoteSectionMap's row cap): same box and width, but
   * inert — no `data-flip` (the FLIP must not see it), focus, preview, handlers or text.
   */
  measure?: boolean
}

/**
 * One section of a note, drawn like the editor's section map tab (neutral cell + folded
 * corner in the section colour; solid when open). Shared by the sidebar row's folded map
 * (NoteSectionMap: open map, hover peek, search map), the horizontal-scroll row
 * (SectionTabsRow: sidebar "Scroll row", collapsed-group peek) and the content view's
 * note rows (ContentView/NoteTimeline).
 * Styles: `.nsm-cell*` in index.css.
 */
export function SectionCell({
  noteId, section, color, active = false, ink, match = null, highlight, focusable, onClick, onContextMenu,
  measure = false,
}: SectionCellProps) {
  const t = useT()
  const { previewProps } = useSectionHoverPreview()
  const channels = colorChannels(color)
  const className = [
    'nsm-cell',
    active && 'is-active',
    section.aiHidden && 'is-ai-hidden',
    match === 'match' && 'is-match',
    match === 'dim' && 'is-dim',
  ].filter(Boolean).join(' ')
  const style = {
    '--c': channels,
    '--sm-color': `rgb(${channels})`,
    ...(active && ink ? { '--nsm-ink': ink } : {}),
  } as CSSProperties

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Space would scroll the list; neither key must reach the row's own button.
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.click()
  }

  if (measure) {
    return (
      <span className={className} style={style}>
        {section.aiHidden && <EyeOff size={9} className="flex-shrink-0" />}
        <span className="nsm-label">
          <span className="nsm-label-sizer">{section.name}</span>
        </span>
      </span>
    )
  }

  return (
    <span
      role="button"
      tabIndex={focusable ? 0 : -1}
      data-flip={section.id}
      className={className}
      style={style}
      // The open section is already in the editor: no preview, just its name (the empty
      // title also hides the row's own "Ctrl/Cmd + click" tooltip).
      {...(active ? { title: '' } : previewProps(noteId, section.id, { placement: 'cursor-below' }))}
      aria-current={active ? 'true' : undefined}
      onClick={(e) => onClick(e, section.id)}
      onContextMenu={(e) => onContextMenu(e, section.id)}
      onKeyDown={onKeyDown}
    >
      {section.aiHidden && (
        <EyeOff size={9} className="opacity-70 flex-shrink-0" aria-label={t.common.hiddenFromAI} />
      )}
      <span className="nsm-label">
        <span className="nsm-label-sizer" aria-hidden>{section.name}</span>
        <span className="nsm-label-text">{renderHighlightedText(section.name, highlight)}</span>
      </span>
      <span className="section-map-corner" aria-hidden />
    </span>
  )
}
