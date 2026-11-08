import { useMemo } from 'react'
import { Plus, Code } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf, plural } from '../../i18n/format'
import { htmlFromMarkdown } from '../../lib/markdownHtml'
import { PREVIEW_MAX_CHARS, clipPreviewMarkdown, sectionCardStats } from '../../lib/noteOverviewGrid'

interface SectionCardContentProps {
  content: string
  raw: boolean
  aiHidden: boolean
}

// Body + foot of a section card (.note-grid-body / .note-grid-foot in index.css): the
// section's real content at reading size, fading out at the bottom, and its stats with the
// "Text" / "Hidden from AI" badges. Shared by the note overview cells (SectionCell) and the
// floating hover card (SectionPreview/SectionHoverCard). The caller sets the CSS vars the
// classes read (--prose-font-family, --ng-accent-ink) on an ancestor.
export function SectionCardContent({ content, raw, aiHidden }: SectionCardContentProps) {
  const t = useT()
  const hasContent = content.trim().length > 0
  // The same HTML the editor renders, at reading size; only the start of a long section,
  // and only when its content changes.
  const html = useMemo(
    () => (hasContent && !raw ? htmlFromMarkdown(clipPreviewMarkdown(content)) : ''),
    [content, hasContent, raw],
  )
  const stats = useMemo(() => sectionCardStats(content), [content])
  const statLabel = stats.kind === 'empty'
    ? t.overview.emptyStat
    : stats.kind === 'tasks'
      ? tf(t.overview.tasksProgress, { done: stats.done, total: stats.total })
      : plural(t.overview.wordsPlural, stats.count)

  return (
    <>
      <div className="note-grid-body note-preview" aria-hidden>
        {!hasContent ? (
          <div className="note-grid-empty">
            <Plus size={11} strokeWidth={2.2} />
            {t.overview.emptySectionHint}
          </div>
        ) : raw ? (
          <pre className="note-grid-raw">{content.slice(0, PREVIEW_MAX_CHARS)}</pre>
        ) : (
          <div className="prose-editor">
            <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>

      <div className="note-grid-foot">
        <span className="truncate min-w-0">{statLabel}</span>
        <span className="flex-1" />
        {raw && (
          <span className="note-grid-badge">
            <Code size={11} />
            {t.overview.rawBadge}
          </span>
        )}
        {aiHidden && <span className="note-grid-badge">{t.common.hiddenFromAI}</span>}
      </div>
    </>
  )
}
