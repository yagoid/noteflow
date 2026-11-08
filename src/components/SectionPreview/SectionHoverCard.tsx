import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { EyeOff } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { getTagColor } from '../../lib/tagColors'
import { resolveSectionInk } from '../../lib/sectionInk'
import type { SectionTagColorMap } from '../../stores/sectionTagColorsStore'
import { useEditorSettingsStore, proseFontStack } from '../../stores/editorSettingsStore'
import { useThemeStore } from '../../stores/themeStore'
import { SectionCardContent } from '../NoteOverview/SectionCardContent'
import type { Note, NoteSection } from '../../types'

interface SectionHoverCardProps {
  note: Note
  section: NoteSection
  sectionTagColors: SectionTagColorMap
}

// The floating card of the section hover preview (HoverPreviewProvider): a note overview
// cell (NoteOverview's SectionCell) as a landscape card — neutral header with the section
// name in its colour and the note title on the right, the folded corner, the content at
// reading size and the stats foot. Pure presentation; it fills the box the provider
// positions and sizes. Rendered in a portal, so it sets the CSS vars the shared
// .note-grid-* classes read (they're defined on the note overview's root otherwise).
export function SectionHoverCard({ note, section, sectionTagColors }: SectionHoverCardProps) {
  const t = useT()
  const proseFont = proseFontStack(useEditorSettingsStore((s) => s.fontFamily))
  // Only to recompute the checkbox ink when the theme (or its accent) changes.
  const themeId = useThemeStore((s) => s.activeThemeId)
  const accentOverride = useThemeStore((s) => s.accentOverride)
  const accentInk = useMemo(
    () => resolveSectionInk('--accent', false),
    // themeId/accentOverride: the vars it reads change with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeId, accentOverride],
  )
  const aiHidden = !!section.aiHidden
  const style = {
    '--sm-color': getTagColor(section.name, sectionTagColors).color,
    '--prose-font-family': proseFont,
    '--ng-accent-ink': accentInk,
  } as CSSProperties

  return (
    <div className={`section-hover-card font-mono${aiHidden ? ' is-ai-hidden' : ''}`} style={style}>
      <div className="note-grid-head section-hover-head">
        {aiHidden && (
          <EyeOff size={12} className="flex-shrink-0 opacity-75" role="img" aria-label={t.common.hiddenFromAI} />
        )}
        <span className="section-hover-name">{section.name}</span>
        <span className="section-hover-note">{note.title || t.common.untitled}</span>
      </div>
      <SectionCardContent content={section.content} raw={!!section.isRawMode} aiHidden={aiHidden} />
      <span className="section-map-corner" aria-hidden />
    </div>
  )
}
