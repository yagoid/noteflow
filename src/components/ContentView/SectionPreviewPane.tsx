import { useMemo } from 'react'
import type { CSSProperties, Ref } from 'react'
import { ExternalLink, Lock, X } from 'lucide-react'
import { FolderIcon } from '../Sidebar/NoteFolderHeader'
import { formatNoteDate } from '../Sidebar/rowText'
import { htmlFromMarkdown } from '../../lib/markdownHtml'
import { clipPreviewMarkdown, sectionCardStats } from '../../lib/noteOverviewGrid'
import { colorChannels, resolveGroupColor, type TagColorMap } from '../../lib/tagColors'
import { useEditorSettingsStore, proseFontStack } from '../../stores/editorSettingsStore'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import type { Note } from '../../types'

// The preview renders a whole section, not a card's start: only one is on screen, but a huge
// one still shouldn't build a huge DOM.
const PREVIEW_PANE_MAX_CHARS = 40_000

interface SectionPreviewPaneProps {
  /** Measured by the view's column handle. */
  paneRef: Ref<HTMLElement>
  open: boolean
  note: Note | null
  sectionId: string | null
  groupName: string | null
  groupChannels: string | null
  folderName: string | null
  /** The folder's icon key (`NoteFolder.icon`; undefined: default glyph). */
  folderIcon: string | undefined
  sectionTagColors: TagColorMap
  onClose: () => void
  onOpenInEditor: () => void
}

/**
 * Column 3 of the content view: route, name, size and the real content of the selected
 * section, read-only (htmlFromMarkdown inside `.prose-editor`, like the note overview), with
 * "Open in the editor". The X closes it and the list takes the width (animated in CSS). Its
 * width is hand-set with the handle on its left edge (ContentView) and capped in CSS.
 */
export function SectionPreviewPane({
  paneRef, open, note, sectionId, groupName, groupChannels, folderName, folderIcon, sectionTagColors, onClose, onOpenInEditor,
}: SectionPreviewPaneProps) {
  const t = useT()
  const proseFont = proseFontStack(useEditorSettingsStore((s) => s.fontFamily))
  const index = note && sectionId ? note.sections.findIndex((s) => s.id === sectionId) : -1
  const section = index === -1 || !note ? null : note.sections[index]
  const locked = Boolean(note?.encryption && note.sections.length === 0)
  const raw = !!section?.isRawMode
  const content = section?.content ?? ''
  const hasContent = content.trim().length > 0

  // Only this section's markdown is rendered, and only when it changes.
  const html = useMemo(
    () => (hasContent && !raw ? htmlFromMarkdown(clipPreviewMarkdown(content, PREVIEW_PANE_MAX_CHARS)) : ''),
    [content, hasContent, raw],
  )
  const stats = useMemo(() => sectionCardStats(content), [content])
  const statLabel = stats.kind === 'empty'
    ? t.overview.emptyStat
    : stats.kind === 'tasks'
      ? tf(t.overview.tasksProgress, { done: stats.done, total: stats.total })
      : plural(t.overview.wordsPlural, stats.count)
  const sectionChannels = section ? colorChannels(resolveGroupColor(section.name, sectionTagColors)) : null

  return (
    <aside ref={paneRef} className={`cv-pv${open ? '' : ' is-closed'}`} aria-label={t.contentView.previewLabel} aria-hidden={!open}>
      <div className="cv-pv-in">
        <button
          type="button"
          className="cv-pv-x"
          onClick={onClose}
          title={t.contentView.closePreview}
          aria-label={t.contentView.closePreview}
          tabIndex={open ? 0 : -1}
        >
          <X size={14} />
        </button>
        {note && (
          // Keyed by note + section: switching replays the entry fade.
          <div key={`${note.id}:${sectionId ?? ''}`} className="cv-pv-card">
            <div className="cv-pv-crumb">
              <i className="sbg-tab is-small" style={{ '--g': groupChannels ?? 'var(--text-muted)' } as CSSProperties} aria-hidden />
              <span>{groupName ?? t.contentView.ungrouped}</span>
              {folderName && <><span className="cv-sl">/</span><FolderIcon icon={folderIcon} /><span>{folderName}</span></>}
              <span className="cv-sl">/</span>
              <span className="cv-pv-note">{note.title || t.common.untitled}</span>
            </div>

            {locked ? (
              <div className="cv-pv-locked">
                <Lock size={22} aria-hidden />
                <p>{t.overview.noteEncrypted}</p>
                <p className="cv-pv-sub">{t.overview.unlockToPreview}</p>
              </div>
            ) : section ? (
              <>
                <h3 className="cv-pv-title">
                  <i style={{ '--c': sectionChannels } as CSSProperties} aria-hidden />
                  <span>{section.name}</span>
                </h3>
                <div className="cv-pv-meta">
                  {tf(t.contentView.sectionPosition, { index: index + 1, total: note.sections.length })}
                  {' · '}{statLabel}
                  {' · '}{tf(t.contentView.editedAt, { date: formatNoteDate(note.updated, t) })}
                </div>
                <div className="cv-pv-body note-preview" style={{ '--prose-font-family': proseFont } as CSSProperties}>
                  {!hasContent ? (
                    <p className="cv-pv-sub">{t.overview.emptySection}</p>
                  ) : raw ? (
                    <pre className="cv-pv-raw">{content.slice(0, PREVIEW_PANE_MAX_CHARS)}</pre>
                  ) : (
                    <div className="prose-editor">
                      <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="cv-pv-sub">{t.overview.noSections}</p>
            )}

            <div className="cv-pv-acts">
              <button type="button" className="cv-btn" onClick={onOpenInEditor} tabIndex={open ? 0 : -1}>
                <ExternalLink size={13} aria-hidden />
                {t.contentView.openInEditor}
                <span className="cv-kbd">Enter</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
