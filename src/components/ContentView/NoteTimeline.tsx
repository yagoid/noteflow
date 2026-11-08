import { memo, useMemo } from 'react'
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, Ref } from 'react'
import { Archive, Check, Lock } from 'lucide-react'
import { SectionCell } from '../Sidebar/SectionCell'
import { FolderIcon } from '../Sidebar/NoteFolderHeader'
import { useSectionInk } from '../Sidebar/useSectionInk'
import { renderHighlightedText } from '../Sidebar/rowText'
import { colorChannels, resolveGroupColor, type TagColorMap } from '../../lib/tagColors'
import { sectionLineWeights } from '../../lib/sectionLine'
import { sectionSearchMatch, type ParsedQuery } from '../../lib/searchUtils'
import type { DateBlock, DateBlockGroup } from '../../lib/contentView'
import { useT } from '../../i18n/useT'
import { formatDate } from '../../i18n/formatDate'
import type { Messages } from '../../i18n'
import type { Note } from '../../types'

/** A listed note with what its row prints, precomputed by the view (primitives only). */
export interface TimelineEntry {
  note: Note
  /** Edit time and how its block prints it (formatted in the row, so it follows the UI language). */
  time: number
  timeKind: 'time' | 'weekday' | 'date'
  groupName: string | null
  /** `colorChannels` of the note's group (null: ungrouped). */
  groupChannels: string | null
  folderName: string | null
  /** The folder's icon key (`NoteFolder.icon`; undefined: default glyph). */
  folderIcon: string | undefined
}

/** Stable callbacks shared by every row (the view forwards them to its live handlers). */
export interface TimelineHandlers {
  rowClick: (e: MouseEvent, noteId: string) => void
  cellClick: (e: MouseEvent, noteId: string, sectionId: string) => void
  toggleCheck: (e: MouseEvent, noteId: string) => void
  open: (noteId: string) => void
  contextMenu: (e: MouseEvent, noteId: string, sectionId: string | null) => void
  dragStart: (e: DragEvent, noteId: string) => void
  dragEnd: () => void
}

interface NoteTimelineProps {
  listRef: Ref<HTMLDivElement>
  blocks: DateBlockGroup<TimelineEntry>[]
  route: 'full' | 'folder' | 'none'
  selectedNoteId: string | null
  selectedSectionId: string | null
  checkedIds: ReadonlySet<string>
  draggingIds: ReadonlySet<string>
  parsed: ParsedQuery
  highlight: string
  sectionTagColors: TagColorMap
  handlers: TimelineHandlers
  emptyLabel: string | null
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
}

// Today / yesterday: the time; this week: the weekday; earlier: the date.
const TIME_FORMATS = { time: 'HH:mm', weekday: 'EEE', date: 'd MMM' } as const

const blockLabel = (block: DateBlock, t: Messages): string => ({
  today: t.contentView.blockToday,
  yesterday: t.contentView.blockYesterday,
  week: t.contentView.blockWeek,
  month: t.contentView.blockMonth,
  older: t.contentView.blockOlder,
})[block]

/**
 * Column 2 of the content view: the place's notes, newest first, in date blocks with a
 * sticky header. Each row shows the time, the title, the route (minus what the place says),
 * the decorative section line and, underneath, every section as a cell. Styles: `.cv-*`.
 */
export function NoteTimeline({
  listRef, blocks, route, selectedNoteId, selectedSectionId, checkedIds, draggingIds, parsed, highlight,
  sectionTagColors, handlers, emptyLabel, onKeyDown,
}: NoteTimelineProps) {
  const t = useT()
  const selectionActive = checkedIds.size > 0
  return (
    <div
      ref={listRef}
      className={`cv-list cv-col${selectionActive ? ' is-selecting' : ''}`}
      tabIndex={0}
      role="listbox"
      aria-label={t.contentView.listLabel}
      aria-multiselectable="true"
      onKeyDown={onKeyDown}
    >
      {emptyLabel ? (
        <p className="cv-empty">{emptyLabel}</p>
      ) : (
        blocks.map(({ block, items }) => (
          <section key={block} className="cv-block" role="group" aria-label={blockLabel(block, t)}>
            <h3 className="cv-bh" aria-hidden>
              {blockLabel(block, t)}
              <span>{items.length}</span>
            </h3>
            {items.map((entry) => {
              const selected = entry.note.id === selectedNoteId
              return (
                <TimelineRow
                  key={entry.note.id}
                  note={entry.note}
                  time={entry.time}
                  timeKind={entry.timeKind}
                  groupName={entry.groupName}
                  groupChannels={entry.groupChannels}
                  folderName={entry.folderName}
                  folderIcon={entry.folderIcon}
                  route={route}
                  selected={selected}
                  activeSectionId={selected ? selectedSectionId : null}
                  checked={checkedIds.has(entry.note.id)}
                  dragging={draggingIds.has(entry.note.id)}
                  parsed={parsed}
                  highlight={highlight}
                  sectionTagColors={sectionTagColors}
                  handlers={handlers}
                />
              )
            })}
          </section>
        ))
      )}
    </div>
  )
}

// Flattened entry: the view rebuilds its entries whenever the list changes, so the row
// compares the note and primitives, never the entry object.
interface TimelineRowProps extends TimelineEntry {
  route: 'full' | 'folder' | 'none'
  /** The selected note (with the preview open): highlighted, its section solid. */
  selected: boolean
  activeSectionId: string | null
  checked: boolean
  dragging: boolean
  parsed: ParsedQuery
  highlight: string
  sectionTagColors: TagColorMap
  handlers: TimelineHandlers
}

// Memoized: with hundreds of notes, a selection change only re-renders the rows it touches.
const TimelineRow = memo(function TimelineRow({
  note, time, timeKind, groupName, groupChannels, folderName, folderIcon, route, selected, activeSectionId, checked, dragging,
  parsed, highlight, sectionTagColors, handlers,
}: TimelineRowProps) {
  const t = useT()
  const sections = note.sections
  const colors = useMemo(
    () => sections.map((s) => resolveGroupColor(s.name, sectionTagColors)),
    [sections, sectionTagColors],
  )
  const weights = useMemo(() => sectionLineWeights(sections.map((s) => s.content.length)), [sections])
  // Search: matching cells tinted, the rest dimmed (cheap: the note's cached search index).
  const match = useMemo(
    () => (sections.length > 0 ? sectionSearchMatch(note, parsed) : null),
    [note, sections.length, parsed],
  )
  const matched = useMemo(() => new Set(match?.matched ?? []), [match])
  const activeIndex = activeSectionId ? sections.findIndex((s) => s.id === activeSectionId) : -1
  const ink = useSectionInk(activeIndex === -1 ? null : colors[activeIndex], !!sections[activeIndex]?.aiHidden)

  const className = [
    'cv-row',
    selected && 'is-sel',
    checked && 'is-checked',
    dragging && 'is-dragging',
    note.archived && 'is-archived',
  ].filter(Boolean).join(' ')

  let routeNode = null
  if (route === 'full') {
    routeNode = (
      <span className="cv-route">
        <i
          className="sbg-tab is-small"
          style={{ '--g': groupChannels ?? 'var(--text-muted)' } as CSSProperties}
          aria-hidden
        />
        <span>{groupName ?? t.contentView.ungrouped}</span>
        {folderName && <><span className="cv-sl">/</span><span>{folderName}</span></>}
      </span>
    )
  } else if (route === 'folder') {
    routeNode = (
      <span className="cv-route">
        {folderName ? <><FolderIcon icon={folderIcon} /><span>{folderName}</span></> : <span>{t.contentView.inGroup}</span>}
      </span>
    )
  }

  return (
    <div
      data-cv-row={note.id}
      role="option"
      aria-selected={selected || checked}
      className={className}
      style={{ '--g': groupChannels ?? 'var(--text-muted)' } as CSSProperties}
      draggable
      onDragStart={(e) => handlers.dragStart(e, note.id)}
      onDragEnd={handlers.dragEnd}
      onClick={(e) => handlers.rowClick(e, note.id)}
      onDoubleClick={() => handlers.open(note.id)}
      onContextMenu={(e) => handlers.contextMenu(e, note.id, null)}
    >
      <span className="cv-time">
        <span className="cv-time-label">{formatDate(time, TIME_FORMATS[timeKind])}</span>
        <span
          role="checkbox"
          aria-checked={checked}
          aria-label={t.contentView.selectNote}
          title={t.contentView.selectNote}
          className="cv-tick"
          onClick={(e) => handlers.toggleCheck(e, note.id)}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Check size={11} strokeWidth={3.2} />
        </span>
      </span>
      <div className="cv-main">
        <span className="cv-title">
          {note.encryption && <Lock size={10} className="cv-lock text-amber-400" aria-label={t.contentView.encrypted} />}
          {note.archived && <Archive size={11} className="cv-arch" aria-label={t.contentView.archivedNote} />}
          <span className="cv-title-text">{renderHighlightedText(note.title || t.common.untitled, highlight)}</span>
        </span>
        {routeNode}
      </div>
      {sections.length > 0 ? (
        <div className="cv-line" aria-hidden>
          <div className="nsm-spine" style={{ '--nsm-n': sections.length } as CSSProperties}>
            {sections.map((s, i) => (
              <span
                key={s.id}
                className={`nsm-seg${s.aiHidden ? ' is-ai-hidden' : ''}`}
                style={{ '--w': weights[i], '--c': colorChannels(colors[i]) } as CSSProperties}
              />
            ))}
          </div>
        </div>
      ) : <span aria-hidden />}
      {sections.length > 0 && (
        <div className="nsm-map cv-map">
          {sections.map((s, i) => (
            <SectionCell
              key={s.id}
              noteId={note.id}
              section={s}
              color={colors[i]}
              active={i === activeIndex}
              ink={ink}
              match={match ? (matched.has(i) ? 'match' : 'dim') : null}
              highlight={highlight}
              focusable={false}
              onClick={(e, sectionId) => handlers.cellClick(e, note.id, sectionId)}
              onContextMenu={(e, sectionId) => handlers.contextMenu(e, note.id, sectionId)}
            />
          ))}
        </div>
      )}
    </div>
  )
})
