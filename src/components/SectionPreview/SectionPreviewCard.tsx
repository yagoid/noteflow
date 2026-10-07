import { useMemo } from 'react'
import { Eye, Edit3, Plus } from 'lucide-react'
import { htmlFromMarkdown } from '../../lib/markdownHtml'
import { getTagColor } from '../../lib/tagColors'
import { useT } from '../../i18n/useT'
import { formatDate } from '../../i18n/formatDate'
import type { SectionTagColorMap } from '../../stores/sectionTagColorsStore'
import type { Note, NoteSection } from '../../types'

// Fixed card width (px) — a section card is a small mock of the open editor.
export const CARD_WIDTH = 240
// Height of the clamped content area (≈ a handful of lines once zoomed).
const PREVIEW_HEIGHT = 132
// `zoom` shrinks the rendered body (Chromium-only, fine in Electron) so the few
// visible lines read like the open note, just tiny.
const PREVIEW_ZOOM = 0.47

interface SectionPreviewCardProps {
  note: Note
  section: NoteSection
  sectionTagColors: SectionTagColorMap
  // `compact` keeps the section header smaller (used by the hover popover and the
  // Brain preview); the height/zoom of the body preview are overridable for the
  // same reason.
  compact?: boolean
  previewHeight?: number
  previewZoom?: number
}

// A small mock of the editor when that section is open. Pure presentation — the
// caller decides how to wrap it (a clickable button in the Note overview, a
// floating popover when hovering a navigation trigger).
export function SectionPreviewCard({
  note,
  section,
  sectionTagColors,
  compact = false,
  previewHeight = PREVIEW_HEIGHT,
  previewZoom = PREVIEW_ZOOM,
}: SectionPreviewCardProps) {
  const t = useT()
  const colorStyle = getTagColor(section.name, sectionTagColors)
  const iconSize = compact ? 10 : 11
  const hasContent = section.content.trim().length > 0
  // Render the section body to the same HTML the editor produces, so the preview
  // matches the open note exactly. Memoised — markdown→HTML isn't free per card.
  const html = useMemo(
    () => (hasContent ? htmlFromMarkdown(section.content) : ''),
    [section.content, hasContent],
  )

  return (
    <>
      {/* Section label (the card's identity — which tab this represents) */}
      <div className={`flex items-center gap-1.5 px-2.5 ${compact ? 'py-1.5' : 'py-2'} border-b border-border/60 bg-surface-2/50 group-hover:bg-surface-2/80 transition-colors`}>
        <span className={`${compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} rounded-full flex-shrink-0`} style={{ background: colorStyle.color }} />
        <span className="text-[13px] font-mono font-semibold truncate" style={{ color: colorStyle.color }}>
          {section.name}
        </span>
        <span
          className="ml-auto flex items-center text-text-muted/50 flex-shrink-0"
          title={section.isRawMode ? t.overview.rawSection : t.overview.richSection}
        >
          {section.isRawMode ? <Edit3 size={iconSize} /> : <Eye size={iconSize} />}
        </span>
      </div>

      {/* Editor mock — title + date, a representational toolbar, then a few lines */}
      <div className="flex flex-col" style={{ background: 'rgb(var(--bg-editor))' }}>
        <div className="px-3 pt-1.5">
          <div className={`${compact ? 'text-[10px]' : 'text-[9.5px]'} font-mono font-bold text-text truncate`}>
            {note.title || t.common.untitled}
          </div>
          <div className="text-[7.5px] font-mono text-text-muted/50 mt-px">
            {formatDate(new Date(note.created), 'MMM d, yyyy · HH:mm')}
          </div>
        </div>

        {/* Toolbar — purely representational: a dark bar with a few faint marks */}
        <div className="px-3 mt-1.5">
          <div
            className="h-3 rounded-sm flex items-center gap-1 px-1.5"
            style={{ background: 'rgb(var(--bg-0) / 0.65)' }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="w-2 h-1.5 rounded-[1px] bg-text/10" />
            ))}
          </div>
        </div>

        {/* A few lines of the section, as if the note were open — just tiny */}
        <div
          className="note-preview relative overflow-hidden px-3 pt-1"
          style={{ height: previewHeight }}
        >
          {hasContent ? (
            <div
              className="prose-editor pointer-events-none select-none"
              style={{ zoom: previewZoom }}
            >
              <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 pt-1 text-text-muted/35">
              <Plus size={11} />
              <span className="text-[10px] font-mono">{t.overview.emptySection}</span>
            </div>
          )}

          {/* Bottom fade — suggests there's more below the fold */}
          {hasContent && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
              style={{ background: 'linear-gradient(to top, rgb(var(--bg-editor)), transparent)' }}
            />
          )}
        </div>
      </div>
    </>
  )
}
