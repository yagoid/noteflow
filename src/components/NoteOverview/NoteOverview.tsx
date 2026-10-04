import { useCallback, useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import {
  X, Star, FileText, Lock, Plus, EyeOff, Eye, Trash2, Check, Pencil, Edit3,
  CheckSquare, Square,
} from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionTagColorsStore, type SectionTagColorMap } from '../../stores/sectionTagColorsStore'
import { SectionPreviewCard, CARD_WIDTH } from '../SectionPreview/SectionPreviewCard'
import { NoteContextMenu, type NoteContextMenuRequest } from '../NoteContextMenu'
import { ConfirmModal } from '../ConfirmModal'
import { useT } from '../../i18n/useT'
import { tf, plural } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import type { Note, NoteSection } from '../../types'

interface NoteOverviewProps {
  noteId: string
  onClose: () => void
}

export function NoteOverview({ noteId, onClose }: NoteOverviewProps) {
  const t = useT()
  const note = useNotesStore((s) => s.notes.find((n) => n.id === noteId) ?? null)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const updateNote = useNotesStore((s) => s.updateNote)
  // Section writes merge onto the LATEST sections (an open editor pane or window may be
  // editing this note) — see patterns.md "Sync entre ventanas".
  const mutateSections = useNotesStore((s) => s.mutateSections)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)

  // Same right-click menu as a section tag in the sidebar (self-contained component)
  const [contextMenu, setContextMenu] = useState<NoteContextMenuRequest | null>(null)

  // ── Multi-select (by section id, never index) ────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  // The card last toggled — shift-click selects the range from it to the clicked one.
  const anchorIdRef = useRef<string | null>(null)

  // ── Confirm modals (one slot — only one confirm is ever open at a time) ───────
  const [confirm, setConfirm] = useState<'delete-sections' | 'delete-note' | null>(null)

  // ── Inline title edit (debounced, like NoteEditor) ───────────────────────────
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(note?.title ?? '')
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const locked = Boolean(note?.encryption && note.sections.length === 0)

  // Note vanished (deleted locally or via sync) → close the overview
  useEffect(() => {
    if (!note) onClose()
  }, [note, onClose])

  // Note: `App.tsx` keys this view by noteId, so switching notes remounts the
  // component — selection/title/anchor state resets for free, no effect needed.

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    anchorIdRef.current = null
  }, [])

  // Select-all toggle (header button + Ctrl/Cmd+A): if every section is already
  // selected → clear the selection; otherwise select them all.
  const toggleSelectAll = useCallback(() => {
    if (!note || locked || note.sections.length === 0) return
    if (note.sections.every((s) => selectedIds.has(s.id))) clearSelection()
    else setSelectedIds(new Set(note.sections.map((s) => s.id)))
  }, [note, locked, selectedIds, clearSelection])

  // Keyboard: Escape clears an active selection first, then closes; Ctrl/Cmd+A selects
  // every section. Both no-op while the title input is focused (it keeps its own Escape
  // revert and its native select-all).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingTitle) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (selectedIds.size > 0) clearSelection()
        else onClose()
        return
      }
      // This view only replaces the <main> pane — the sidebar, the AI panel, the settings
      // modal and the command palette stay mounted, so never steal Ctrl/Cmd+A from a field
      // that has its own select-all. Alt is excluded too (AltGr = Ctrl+Alt on ES/LatAm layouts).
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (isEditing) return
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        toggleSelectAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, selectedIds, editingTitle, clearSelection, toggleSelectAll])

  // Navigate straight to a clicked section. Stash it in pendingInitialSectionId so the editor
  // (which mounts fresh once the overview closes) opens on the right section with no flash, and
  // re-assert it via the request-section event once the editor is listening — same dance the
  // group overview and brain view use.
  const openSection = (sectionId: string) => {
    useNotesStore.setState({ pendingInitialSectionId: sectionId })
    setOpenNoteIds([noteId])
    setActiveNote(noteId)
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }),
      )
    }, 0)
  }

  // Add a fresh section and jump straight into the editor on it, so the user
  // writes there rather than landing back on an empty card in the overview.
  const addSection = async () => {
    if (!note || locked) return
    const newSection: NoteSection = { id: nanoid(6), name: 'New', content: '' }
    await mutateSections(note.id, (sections) => [...sections, newSection])
    openSection(newSection.id)
  }

  // ── Selection helpers ─────────────────────────────────────────────────────────
  const toggleSelected = (sectionId: string) => {
    anchorIdRef.current = sectionId
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  // Shift-click: select the inclusive range (in note.sections order) from the anchor to here.
  const selectRangeTo = (sectionId: string) => {
    if (!note) return
    const ids = note.sections.map((s) => s.id)
    const anchor = anchorIdRef.current
    const from = anchor ? ids.indexOf(anchor) : -1
    const to = ids.indexOf(sectionId)
    if (to < 0) return
    if (from < 0) {
      toggleSelected(sectionId)
      return
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (let i = lo; i <= hi; i++) next.add(ids[i])
      return next
    })
  }

  // ── Inline title edit ─────────────────────────────────────────────────────────
  const startTitleEdit = () => {
    if (!note || locked) return
    setTitleDraft(note.title ?? '')
    setEditingTitle(true)
  }

  const commitTitle = () => {
    if (!note) return
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    setEditingTitle(false)
    if ((note.title ?? '') !== titleDraft) void updateNote(note.id, { title: titleDraft })
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!note) return
    const val = e.target.value
    setTitleDraft(val)
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    titleDebounceRef.current = setTimeout(() => {
      void updateNote(note.id, { title: val })
    }, 300)
  }

  if (!note) return null

  const sectionCount = note.sections.length
  // Derive the selection against the live sections so ids of deleted sections never
  // inflate the count or the action bar (avoids filtering the Set in an effect).
  const selectedSections = note.sections.filter((s) => selectedIds.has(s.id))
  const selectedCount = selectedSections.length
  const selectionActive = selectedCount > 0
  // Drives the select-all toggle in the header, and blocks the delete action: wiping out
  // every section would leave the note empty (delete the note instead).
  const selectingAll = sectionCount > 0 && selectedCount === sectionCount
  // Mirror the context menu: AI visibility is unavailable on encrypted notes.
  const aiActionAvailable = !note.encryption && selectedCount > 0
  const allHidden = selectedCount > 0 && selectedSections.every((s) => s.aiHidden)
  const allRaw = selectedCount > 0 && selectedSections.every((s) => s.isRawMode)

  const deleteSelectedSections = () => {
    setConfirm(null)
    const ids = new Set(selectedIds)
    // Never leave the note without sections (delete the note instead).
    void mutateSections(note.id, (sections) => {
      const kept = sections.filter((s) => !ids.has(s.id))
      return kept.length > 0 && kept.length < sections.length ? kept : null
    })
    clearSelection()
  }

  const toggleSelectedAiHidden = () => {
    // If every selected section is already hidden → reveal all; otherwise hide all.
    const hide = !allHidden
    const ids = new Set(selectedIds)
    void mutateSections(note.id, (sections) =>
      sections.map((s) => (ids.has(s.id) ? { ...s, aiHidden: hide } : s)),
    )
  }

  const toggleSelectedRawMode = () => {
    // If every selected section is already raw → back to the editor; otherwise raw for all.
    // Only the flag moves here: the content stays exactly as it is.
    const raw = !allRaw
    const ids = new Set(selectedIds)
    void mutateSections(note.id, (sections) =>
      sections.map((s) => (ids.has(s.id) ? { ...s, isRawMode: raw } : s)),
    )
  }

  const deleteThisNote = () => {
    setConfirm(null)
    void deleteNote(note.id)
  }

  return (
    <div
      className="h-full w-full flex flex-col"
      style={{ background: 'rgb(var(--bg-editor))' }}
    >
      {/* ── Header (fixed — outside the scroll area so the scrollbar starts below it) ── */}
      <div
        className="flex-shrink-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-border"
        style={{ background: 'rgb(var(--bg-1) / 0.85)' }}
      >
        {note.encryption && <Lock size={13} className="text-amber-400 flex-shrink-0" />}

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={handleTitleChange}
            onBlur={commitTitle}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
                setTitleDraft(note.title ?? '')
                setEditingTitle(false)
                void updateNote(note.id, { title: note.title ?? '' })
              }
            }}
            placeholder={t.common.untitled}
            className="text-sm font-mono font-semibold text-text bg-surface-1 border border-text/25 rounded px-1.5 py-0.5 outline-none focus:border-text/40 min-w-0 flex-shrink"
          />
        ) : (
          <button
            onClick={startTitleEdit}
            disabled={locked}
            title={locked ? undefined : t.overview.renameNote}
            className={`group/title flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1 transition-colors ${
              locked ? 'cursor-default' : 'hover:bg-surface-3'
            }`}
          >
            <h1 className="text-sm font-mono font-semibold text-text truncate">
              {note.title || t.common.untitled}
            </h1>
            {!locked && (
              <Pencil
                size={11}
                className="text-text-muted/50 opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
              />
            )}
          </button>
        )}

        <button
          onClick={() => updateNote(note.id, { favorited: !note.favorited })}
          title={note.favorited ? t.common.removeFromFavorites : t.common.addToFavorites}
          className={`p-1 rounded flex-shrink-0 transition-colors
            ${note.favorited ? 'text-accent-3 bg-accent-3/10' : 'text-text-muted hover:text-text hover:bg-surface-3'}`}
        >
          <Star size={13} fill={note.favorited ? 'currentColor' : 'none'} />
        </button>
        <span className="text-[11px] font-mono text-text-muted/60 flex-shrink-0">
          {plural(t.overview.sectionsPlural, sectionCount)}
          {' · '}
          {formatDate(new Date(note.updated), 'dd/MM/yyyy · HH:mm')}
        </span>

        <div className="flex-1" />

        {!locked && sectionCount > 0 && (
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-surface-2 text-[11px] font-mono text-text-muted hover:text-text hover:border-text/25 transition-colors"
            title={selectingAll ? t.overview.deselectAllTooltip : t.overview.selectAllTooltip}
          >
            {selectingAll ? <CheckSquare size={12} /> : <Square size={12} />}
            {selectingAll ? t.overview.deselectAll : t.overview.selectAll}
          </button>
        )}
        {!locked && (
          <button
            onClick={() => void addSection()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-surface-2 text-[11px] font-mono text-text-muted hover:text-text hover:border-text/25 transition-colors"
            title={t.overview.addSectionTooltip}
          >
            <Plus size={12} /> {t.overview.addSection}
          </button>
        )}
        <button
          onClick={() => setConfirm('delete-note')}
          className="flex items-center justify-center w-7 h-7 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
          title={t.common.deleteNote}
        >
          <Trash2 size={13} />
        </button>
        <button
          onClick={onClose}
          className="ml-1 flex items-center justify-center w-7 h-7 rounded border border-border bg-surface-2 text-text-muted hover:text-text hover:border-text/25 transition-colors"
          title={t.common.closeEsc}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Scroll area (only this scrolls — the scrollbar starts below the header) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
      <div className="px-6 py-5">
        {locked ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <Lock size={28} className="text-text-muted/40" />
            <p className="text-sm font-mono text-text-muted">{t.overview.noteEncrypted}</p>
            <p className="text-xs font-mono text-text-muted/60">{t.overview.unlockToPreview}</p>
          </div>
        ) : sectionCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <FileText size={28} className="text-text-muted/40" />
            <p className="text-sm font-mono text-text-muted">{t.overview.noSections}</p>
          </div>
        ) : (
          <div
            className="grid gap-4 justify-start"
            style={{ gridTemplateColumns: `repeat(auto-fill, ${CARD_WIDTH}px)` }}
          >
            {note.sections.map((section) => (
              <SectionCard
                key={section.id}
                note={note}
                section={section}
                sectionTagColors={sectionTagColors}
                selected={selectedIds.has(section.id)}
                selectionActive={selectionActive}
                onOpen={openSection}
                onToggleSelect={toggleSelected}
                onSelectRange={selectRangeTo}
                onContextMenu={setContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Floating selection bar — sticks to the bottom while scrolling ── */}
      {selectionActive && (
        <div className="sticky bottom-0 z-20 pointer-events-none flex justify-center px-6 pb-5">
          <div
            className="pointer-events-auto relative flex items-center gap-1 rounded-lg border border-border bg-surface-2/95 backdrop-blur px-2 py-1.5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="px-2 text-[11px] font-mono text-text whitespace-nowrap">
              {tf(t.overview.selectedCount, { count: selectedCount })}
            </span>
            <div className="w-px h-5 bg-border" />

            {aiActionAvailable && (
              <button
                onClick={toggleSelectedAiHidden}
                title={allHidden ? t.overview.aiShowTooltip : t.overview.aiHideTooltip}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono text-text-muted hover:text-text hover:bg-text/10 transition-colors"
              >
                {allHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                {allHidden ? t.common.showToAI : t.common.hideFromAI}
              </button>
            )}

            <button
              onClick={toggleSelectedRawMode}
              title={allRaw ? t.overview.modeEditorTooltip : t.overview.modeRawTooltip}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono text-text-muted hover:text-text hover:bg-text/10 transition-colors"
            >
              {allRaw ? <Edit3 size={13} /> : <Eye size={13} />}
              {allRaw ? t.overview.modeEditor : t.overview.modeRaw}
            </button>

            <button
              onClick={() => setConfirm('delete-sections')}
              disabled={selectingAll}
              title={selectingAll ? t.overview.cantDeleteAllSections : undefined}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono text-red/75 hover:text-red hover:bg-red/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-red/75"
            >
              <Trash2 size={13} />
              {t.common.delete}
            </button>

            <div className="w-px h-5 bg-border" />
            <button
              onClick={clearSelection}
              title={t.overview.clearSelection}
              className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-text/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      </div>

      <NoteContextMenu request={contextMenu} onClose={() => setContextMenu(null)} />

      {confirm === 'delete-sections' && (
        <ConfirmModal
          title={t.overview.deleteSections}
          message={plural(t.overview.deleteSectionsMessage, selectedCount)}
          confirmLabel={t.common.delete}
          danger
          onConfirm={deleteSelectedSections}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'delete-note' && (
        <ConfirmModal
          title={t.common.deleteNote}
          message={tf(t.common.deleteNoteMessage, { title: note.title || t.common.untitled })}
          confirmLabel={t.common.delete}
          danger
          onConfirm={deleteThisNote}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

// ── Section card — a clickable wrapper around the shared preview mock ───────────
interface SectionCardProps {
  note: Note
  section: NoteSection
  sectionTagColors: SectionTagColorMap
  selected: boolean
  selectionActive: boolean
  onOpen: (sectionId: string) => void
  onToggleSelect: (sectionId: string) => void
  onSelectRange: (sectionId: string) => void
  onContextMenu: (request: NoteContextMenuRequest) => void
}

function SectionCard({
  note,
  section,
  sectionTagColors,
  selected,
  selectionActive,
  onOpen,
  onToggleSelect,
  onSelectRange,
  onContextMenu,
}: SectionCardProps) {
  const t = useT()
  return (
    <button
      // Shift-click extends a range; Ctrl/Cmd-click toggles; a plain click while a
      // selection is active toggles too. Otherwise a click opens the section.
      onClick={(e) => {
        if (e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          onSelectRange(section.id)
          return
        }
        if (selectionActive || e.ctrlKey || e.metaKey) {
          e.preventDefault()
          e.stopPropagation()
          onToggleSelect(section.id)
          return
        }
        onOpen(section.id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id, sectionId: section.id })
      }}
      title={tf(t.overview.openSection, { name: section.name })}
      className={`group relative text-left rounded-lg border border-solid bg-surface-1 shadow-md
                 hover:shadow-lg hover:-translate-y-0.5
                 transition-all duration-150 overflow-hidden flex flex-col ${
                   selected
                     ? 'border-accent ring-1 ring-accent'
                     : 'border-text/20 hover:border-text/45'
                 }`}
      style={{ width: CARD_WIDTH }}
    >
      {/* Selection tick — top-right, on hover or always while a selection is active */}
      <span
        role="checkbox"
        aria-checked={selected}
        aria-label={t.overview.selectSection}
        title={t.overview.selectSection}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(section.id) }}
        className={`absolute top-2 right-2 z-20 flex items-center justify-center w-[18px] h-[18px] rounded border transition-all cursor-pointer ${
          selected
            ? 'opacity-100 bg-accent border-accent text-white'
            : `border-text/40 bg-surface-1/80 text-transparent hover:border-text/70 ${
                selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`
        }`}
      >
        <Check size={12} strokeWidth={3} />
      </span>

      {section.aiHidden && (
        <span
          title={t.common.hiddenFromAI}
          className="absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded
                     bg-surface-3/90 text-text-muted text-[9px] font-mono"
        >
          <EyeOff size={10} /> {t.overview.aiBadge}
        </span>
      )}
      <SectionPreviewCard note={note} section={section} sectionTagColors={sectionTagColors} />
    </button>
  )
}
