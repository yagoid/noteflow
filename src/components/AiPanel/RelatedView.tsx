import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useAiStore } from '../../stores/aiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionHoverPreview } from '../SectionPreview/hoverPreviewContext'
import { useT } from '../../i18n/useT'
import { PANEL_LABEL } from './ui'

// "Related notes" for any note/section, picked right here. Reuses the existing AI index
// (aiStore.fetchRelated). Lives as a tab in the AI panel; mirrors the old brain bottom strip.
export function RelatedView({ onOpenNote }: { onOpenNote: (noteId: string, sectionId: string) => void }) {
  const t = useT()
  const { previewProps } = useSectionHoverPreview()
  const enabled = useAiStore((s) => s.enabled)
  const indexState = useAiStore((s) => s.indexState)
  const fetchRelated = useAiStore((s) => s.fetchRelated)
  const relatedByKey = useAiStore((s) => s.relatedByKey)

  const notes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)

  const selectableNotes = useMemo(
    () => notes.filter((n) => !n.archived && !n.encryption && !n.expiresAt),
    [notes],
  )
  const [sourceNoteId, setSourceNoteId] = useState<string | null>(null)
  const [sourceSectionId, setSourceSectionId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')

  const sourceNote = selectableNotes.find((n) => n.id === sourceNoteId) ?? null
  const sourceSection = sourceNote?.sections.find((s) => s.id === sourceSectionId) ?? sourceNote?.sections[0] ?? null
  const relKey = sourceNote && sourceSection ? `${sourceNote.id}::${sourceSection.id}` : null
  const relatedResult = relKey ? relatedByKey[relKey] : undefined
  const relatedLoading = relKey != null && relatedResult === undefined
  const relatedItems = relatedResult ?? []

  const filteredNotes = useMemo(() => {
    const q = pickerFilter.trim().toLowerCase()
    if (!q) return selectableNotes
    return selectableNotes.filter((n) => (n.title || t.common.untitled).toLowerCase().includes(q))
  }, [selectableNotes, pickerFilter, t])

  useEffect(() => {
    if (!enabled) return
    if (sourceNoteId && selectableNotes.some((n) => n.id === sourceNoteId)) return
    const seed = (activeNoteId ? selectableNotes.find((n) => n.id === activeNoteId) : undefined) ?? selectableNotes[0] ?? null
    setSourceNoteId(seed?.id ?? null)
    setSourceSectionId(seed?.sections[0]?.id ?? null)
  }, [enabled, selectableNotes, activeNoteId, sourceNoteId])

  useEffect(() => {
    if (!enabled || !sourceNote?.id || !sourceSection?.id) return
    fetchRelated(sourceNote.id, sourceSection.id)
  }, [enabled, sourceNote?.id, sourceSection?.id, fetchRelated]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickNote = (id: string) => {
    const n = selectableNotes.find((s) => s.id === id)
    setSourceNoteId(id)
    setSourceSectionId(n?.sections[0]?.id ?? null)
    setPickerOpen(false)
    setPickerFilter('')
  }

  if (!enabled) {
    return (
      <div className="flex items-center justify-center h-full px-6 text-center">
        <p className="text-[12px] font-mono text-text-muted/70 leading-relaxed">
          {t.aiPanel.related.enablePrompt}
        </p>
      </div>
    )
  }

  const indexing = indexState !== 'idle'

  return (
    <div className="flex flex-col h-full min-h-0 p-3 text-[13px] font-mono">
      {/* What this section is */}
      <p className="mb-2.5 text-[11px] leading-relaxed text-text-muted/70">
        {t.aiPanel.related.intro}
      </p>

      {/* Source selector */}
      <div className="relative flex items-center gap-1.5 mb-2">
        <span className={`${PANEL_LABEL} flex-shrink-0`}>{t.aiPanel.related.from}</span>
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="flex items-center gap-1 min-w-0 px-2 py-1 rounded-lg border-solid border border-border bg-surface-1/60 hover:border-text/25 transition-colors"
        >
          <span className="truncate text-[12px] text-text/80 max-w-[180px]">{sourceNote?.title || t.aiPanel.related.selectNote}</span>
          <ChevronDown size={11} className="text-text/40 flex-shrink-0" />
        </button>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
            <div className="absolute top-full left-0 mt-1 w-60 rounded-lg border border-border bg-surface-1 shadow-2xl overflow-hidden z-30">
              <div className="p-1.5 border-b border-border">
                <input
                  autoFocus
                  value={pickerFilter}
                  onChange={(e) => setPickerFilter(e.target.value)}
                  placeholder={t.aiPanel.related.searchNotes}
                  className="w-full bg-surface-0 border border-border rounded px-2 py-1 text-[12px] text-text placeholder-text-muted/40 outline-none focus:border-text/30"
                />
              </div>
              <ul className="max-h-56 overflow-y-auto py-1">
                {filteredNotes.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => pickNote(n.id)}
                      className={`w-full text-left px-2.5 py-1 text-[12px] truncate hover:bg-text/5 transition-colors ${
                        n.id === sourceNoteId ? 'text-text' : 'text-text/70'
                      }`}
                    >
                      {n.title || t.common.untitled}
                    </button>
                  </li>
                ))}
                {filteredNotes.length === 0 && <li className="px-2.5 py-2 text-[12px] text-text-muted/60">{t.aiPanel.related.noNotes}</li>}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Section chips */}
      {sourceNote && sourceNote.sections.length > 0 && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          {sourceNote.sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setSourceSectionId(sec.id)}
              className={`px-2 py-0.5 rounded-md text-[11px] border-solid border transition-colors ${
                sec.id === sourceSection?.id ? 'border-accent/50 bg-accent/15 text-text' : 'border-border text-text-muted hover:text-text hover:border-text/30'
              }`}
            >
              {sec.name}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {relatedItems.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {relatedItems.map((r) => {
              const sameNote = r.noteId === sourceNote?.id
              return (
                <li key={`${r.noteId}:${r.sectionId}`}>
                  <button
                    {...previewProps(r.noteId, r.sectionId)}
                    onClick={() => onOpenNote(r.noteId, r.sectionId)}
                    className="w-full text-left px-2 py-1 rounded hover:bg-text/5 transition-colors group flex items-center gap-2"
                  >
                    <span className="truncate text-text/80 group-hover:text-text flex-1 min-w-0">{r.sectionName || t.aiPanel.related.untitledSection}</span>
                    <span className="flex-shrink-0 text-[10px] px-1 py-px rounded bg-text/[0.08] text-text/50 max-w-[120px] truncate">
                      {sameNote ? t.aiPanel.related.thisNote : r.title || t.common.untitled}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : relatedLoading || indexing ? (
          <p className="flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-text-muted/60">
            <Loader2 size={11} className="animate-spin" />
            {indexing ? t.aiPanel.related.indexing : t.aiPanel.related.finding}
          </p>
        ) : (
          <p className="px-2 py-1.5 text-[12px] text-text-muted/60">{t.aiPanel.related.none}</p>
        )}
      </div>
    </div>
  )
}
