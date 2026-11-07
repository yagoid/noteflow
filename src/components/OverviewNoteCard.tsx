import { Check } from 'lucide-react'
import { SectionTabsRow } from './Sidebar/SectionTabsRow'
import { type NoteContextMenuRequest } from './NoteContextMenu'
import { useT } from '../i18n/useT'
import { formatDate } from '../i18n/formatDate'
import { colorChannels } from '../lib/tagColors'
import type { SectionTagColorMap } from '../stores/sectionTagColorsStore'
import type { Note, GroupColor } from '../types'

// Shared with the group overview (which uses it directly). Co-located with the card it
// belongs to; the fast-refresh rule only matters in dev and a date formatter is stateless.
// eslint-disable-next-line react-refresh/only-export-components
export function formatCardDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatDate(d, 'dd/MM/yyyy · HH:mm')
}

// ── Note card (shared by the group / all-content overviews) ─────────────────────
export interface NoteCardProps {
  note: Note
  color: GroupColor
  sectionTagColors: SectionTagColorMap
  onOpen: (id: string) => void
  onOpenSection: (noteId: string, sectionId: string) => void
  onContextMenu: (request: NoteContextMenuRequest) => void
  // Multi-select
  selected?: boolean
  selectionActive?: boolean
  onToggleSelect?: (id: string) => void
  // Reorder wiring (omitted for read-only bands like Archived)
  dropIndicator?: 'before' | 'after' | null
  onReorderDragStart?: () => void
  onReorderDragEnd?: () => void
  onReorderDragOver?: (e: React.DragEvent) => void
  onReorderDrop?: (e: React.DragEvent) => void
}

export function OverviewNoteCard({
  note,
  color,
  sectionTagColors,
  onOpen,
  onOpenSection,
  onContextMenu,
  selected,
  selectionActive,
  onToggleSelect,
  dropIndicator,
  onReorderDragStart,
  onReorderDragEnd,
  onReorderDragOver,
  onReorderDrop,
}: NoteCardProps) {
  const t = useT()
  const reorderable = Boolean(onReorderDrop)
  const selectable = Boolean(onToggleSelect)
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-noteflow-note-id', note.id)
        e.dataTransfer.setData('text/plain', note.id)
        e.dataTransfer.effectAllowed = 'move'
        onReorderDragStart?.()
      }}
      onDragEnd={onReorderDragEnd}
      onDragOver={onReorderDragOver}
      onDrop={onReorderDrop}
      // While a selection is active, a plain click toggles the tick; Ctrl/Cmd-click
      // always toggles (and starts a selection). Otherwise a click opens the note.
      onClick={(e) => {
        if (selectable && (selectionActive || e.ctrlKey || e.metaKey)) {
          e.stopPropagation()
          onToggleSelect!(note.id)
          return
        }
        onOpen(note.id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id, sectionId: null })
      }}
      className={`group relative text-left rounded-md border bg-surface-1 hover:bg-surface-2 transition-colors overflow-hidden p-3 pl-4 flex flex-col gap-2 min-h-[78px] ${reorderable ? 'cursor-grab active:cursor-grabbing' : ''} ${selected ? 'border-text/40 bg-text/[0.06] ring-1 ring-text/20' : 'border-border hover:border-text/25'}`}
      title={note.title || t.common.untitled}
    >
      {/* In-band reorder drop indicator (vertical bar on the relevant edge).
          Kept inside the card bounds because the card clips overflow. */}
      {dropIndicator && (
        <span
          className={`absolute top-0 bottom-0 w-[3px] z-10 ${dropIndicator === 'before' ? 'left-0' : 'right-0'}`}
          style={{ background: `rgb(${colorChannels(color)})`, boxShadow: `0 0 6px rgb(${colorChannels(color)} / 0.8)` }}
        />
      )}
      {/* Group-color accent line */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: `rgb(${colorChannels(color)} / 0.55)` }}
      />

      {/* Selection tick — visible on hover, or always once selected/in selection mode */}
      {selectable && (
        <span
          role="checkbox"
          aria-checked={selected}
          onClick={(e) => { e.stopPropagation(); onToggleSelect!(note.id) }}
          className={`absolute top-2 right-2 z-10 flex items-center justify-center w-[18px] h-[18px] rounded border transition-all cursor-pointer ${
            selected
              ? 'opacity-100 bg-text border-text text-bg-editor'
              : `border-text/40 bg-surface-1/80 text-transparent hover:border-text/70 ${selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
          }`}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}

      <span className={`text-[13px] font-mono font-medium text-text/90 truncate ${selectable ? 'pr-6' : ''}`}>
        {note.title || t.common.untitled}
      </span>

      {/* No open section to mark: the overview replaces the editor. */}
      <SectionTabsRow
        placement="card"
        noteId={note.id}
        sections={note.sections}
        searchQuery=""
        sectionFilter={null}
        sectionTagColors={sectionTagColors}
        onSectionClick={(sectionId, e) => {
          e.stopPropagation()
          if (selectionActive) { onToggleSelect?.(note.id); return }
          onOpenSection(note.id, sectionId)
        }}
        onSectionContextMenu={(e, sectionId) => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id, sectionId })
        }}
      />

      <span className="text-[10px] font-mono text-text-muted/50 mt-auto">
        {formatCardDate(note.updated)}
      </span>
    </button>
  )
}
