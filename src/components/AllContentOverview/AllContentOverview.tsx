import { Fragment, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { X, Folder, FolderOpen, Star, LayoutGrid, ChevronRight, ChevronLeft, CalendarDays, Maximize2 } from 'lucide-react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { useSidebarGroups } from '../Sidebar/useSidebarGroups'
import { NoteContextMenu, type NoteContextMenuRequest } from '../NoteContextMenu'
import { OverviewNoteCard } from '../OverviewNoteCard'
import { parseSearchQuery, noteMatchesQuery } from '../../lib/searchUtils'
import { colorChannels } from '../../lib/tagColors'
import { useT } from '../../i18n/useT'
import { tf, plural } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import { sidebarAnchorRef } from '../Sidebar/sidebarAnchor'
import type { GroupColor, Note, NoteGroup } from '../../types'

interface AllContentOverviewProps {
  onClose: () => void
}

// Neutral color for ungrouped notes (no group accent). Cast: it's only used as a CSS var name.
const NEUTRAL_COLOR = '--text-muted' as GroupColor

// Responsive card grid — matches the group overview's look.
const GRID_STYLE: React.CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
}

// ── Day-key helpers (mirror the sidebar's former date filter) ────────────────
function toDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toDayKeyFromIso(iso: string): string | null {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return toDayKey(parsed)
}

function dayKeyToDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function AllContentOverview({ onClose }: AllContentOverviewProps) {
  const t = useT()
  const notes = useNotesStore((s) => s.notes)
  const filterDate = useNotesStore((s) => s.filterDate)
  const setFilterDate = useNotesStore((s) => s.setFilterDate)
  const openGroupFromAll = useNotesStore((s) => s.openGroupFromAll)
  const openNoteFromAll = useNotesStore((s) => s.openNoteFromAll)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)

  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const noteOrder = useGroupsStore((s) => s.noteOrder)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)

  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<NoteContextMenuRequest | null>(null)

  // ── Date filter state (moved here from the sidebar) ──────────────────────────
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [calendarExpanded, setCalendarExpanded] = useState(false)

  // Accordion state — local to this view, collapsed by default (not persisted). Groups start
  // collapsed (the Set holds the expanded ids); folders inside an open group start expanded (the
  // Set holds the collapsed ids).
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set())
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set())

  const toggleGroup = (id: string) =>
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleFolder = (id: string) =>
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Escape closes the view (back to the editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Non-archived notes — the base set the date filter, calendar markers and the
  // favorites/groups/loose derivations all build on.
  const dateBaseNotes = useMemo(() => notes.filter((n) => !n.archived), [notes])

  // Apply the date filter (same logic the sidebar used): a selected calendar day matches
  // notes created or updated that day; otherwise the All/Today/Week/Month range over `updated`.
  const dateFilteredNotes = useMemo(() => {
    if (selectedDayKey) {
      return dateBaseNotes.filter((note) => {
        const createdDay = toDayKeyFromIso(note.created)
        const updatedDay = toDayKeyFromIso(note.updated)
        return createdDay === selectedDayKey || updatedDay === selectedDayKey
      })
    }

    return dateBaseNotes.filter((n) => {
      if (filterDate === 'all') return true
      const updated = new Date(n.updated)
      const now = new Date()
      if (filterDate === 'today') return isToday(updated)
      if (filterDate === 'week') {
        const weekAgo = new Date(now)
        weekAgo.setDate(now.getDate() - 7)
        return updated >= weekAgo
      }
      if (filterDate === 'month') {
        const monthAgo = new Date(now)
        monthAgo.setMonth(now.getMonth() - 1)
        return updated >= monthAgo
      }
      return true
    })
  }, [dateBaseNotes, filterDate, selectedDayKey])

  // Favorited first, then most-recently updated (same as the sidebar).
  const visibleNotes = useMemo(
    () =>
      [...dateFilteredNotes].sort((a, b) => {
        if (a.favorited !== b.favorited) return a.favorited ? -1 : 1
        return new Date(b.updated).getTime() - new Date(a.updated).getTime()
      }),
    [dateFilteredNotes],
  )

  // Calendar grid days for the visible month.
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  }, [calendarMonth])

  // Per-day created/updated counts (computed over all non-archived notes, like the sidebar).
  const dayMarkers = useMemo(() => {
    const markers = new Map<string, { created: number; updated: number }>()
    for (const note of dateBaseNotes) {
      const createdKey = toDayKeyFromIso(note.created)
      if (createdKey) {
        const current = markers.get(createdKey) ?? { created: 0, updated: 0 }
        current.created += 1
        markers.set(createdKey, current)
      }

      const updatedKey = toDayKeyFromIso(note.updated)
      if (updatedKey) {
        const current = markers.get(updatedKey) ?? { created: 0, updated: 0 }
        current.updated += 1
        markers.set(updatedKey, current)
      }
    }
    return markers
  }, [dateBaseNotes])

  const items = useSidebarGroups(visibleNotes, groups, folders, noteOrder)

  // Map of valid group id → group for note color lookup.
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  const colorForNote = (note: Note): GroupColor => {
    const g = note.group ? groupById.get(note.group) : undefined
    return g ? g.color : NEUTRAL_COLOR
  }

  const parsed = useMemo(() => parseSearchQuery(searchQuery), [searchQuery])
  const hasQuery = parsed.textQuery.length > 0 || parsed.sectionFilter !== null
  const hasDateFilter = Boolean(selectedDayKey) || filterDate !== 'all'

  // Favorites band — favorited notes, filtered by the query.
  const favorites = useMemo(
    () => visibleNotes.filter((n) => n.favorited).filter((n) => noteMatchesQuery(n, parsed)),
    [visibleNotes, parsed],
  )

  // Group tiles — non-archived groups, keeping the nested structure (loose notes + folders) so the
  // accordion can render each group's content inline. A group shows if its name matches OR it
  // contains a visible note that matches the query.
  const groupTiles = useMemo(() => {
    const tiles = items
      .filter((i): i is Extract<typeof items[number], { kind: 'group' }> => i.kind === 'group')
      .filter((i) => !i.group.archived)
      .map((i) => ({
        group: i.group,
        count: i.visibleCount,
        looseNotes: i.notes,
        folders: i.folders,
        allNotes: [...i.notes, ...i.folders.flatMap((f) => f.notes)],
      }))

    if (!hasQuery) return tiles
    const q = parsed.textQuery.toLowerCase()
    return tiles.filter((t) => {
      const nameMatches = q.length > 0 && t.group.name.toLowerCase().includes(q)
      return nameMatches || t.allNotes.some((n) => noteMatchesQuery(n, parsed))
    })
  }, [items, hasQuery, parsed])

  // Loose (ungrouped) notes, filtered by the query.
  const looseNotes = useMemo(() => {
    const loose = items
      .filter((i): i is Extract<typeof items[number], { kind: 'note' }> => i.kind === 'note')
      .map((i) => i.note)
    if (!hasQuery) return loose
    return loose.filter((n) => noteMatchesQuery(n, parsed))
  }, [items, hasQuery, parsed])

  const openNote = (id: string) => openNoteFromAll(id)

  // Navigate straight to a clicked section (same pattern as the group overview): stash the
  // section so the editor lands on it once it mounts, then re-assert via the event next tick.
  const openSection = (noteId: string, sectionId: string) => {
    useNotesStore.setState({ pendingInitialSectionId: sectionId })
    setOpenNoteIds([noteId])
    setActiveNote(noteId)
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }),
      )
    }, 0)
  }

  const isEmpty = favorites.length === 0 && groupTiles.length === 0 && looseNotes.length === 0

  return (
    <div className="h-full w-full flex flex-col" style={{ background: 'rgb(var(--bg-editor))' }}>
      <NoteContextMenu request={contextMenu} onClose={() => setContextMenu(null)} />

      {/* ── Header (fixed — outside the scroll area) ── */}
      <div
        className="flex-shrink-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-border"
        style={{ background: 'rgb(var(--bg-1) / 0.85)' }}
      >
        <LayoutGrid size={16} className="text-text-muted flex-shrink-0" />
        <h1 className="text-sm font-mono uppercase tracking-wider text-text truncate">{t.common.allContent}</h1>

        <div className="flex-1" />

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.allContent.searchPlaceholder}
          className="w-56 max-w-[40vw] text-xs font-mono bg-surface-1 border border-border rounded px-2.5 py-1.5 outline-none text-text placeholder:text-text-muted/60 focus:border-text/25 transition-colors"
        />
        <button
          onClick={onClose}
          className="ml-1 flex items-center justify-center w-7 h-7 rounded border border-border bg-surface-2 text-text-muted hover:text-text hover:border-text/25 transition-colors"
          title={t.common.closeEsc}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Date filter toolbar (fixed — moved here from the sidebar) ── */}
      <div
        className="flex-shrink-0 z-10 px-6 py-2.5 border-b border-border"
        style={{ background: 'rgb(var(--bg-1) / 0.6)' }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* All / Today / Week / Month segmented buttons */}
          <div className="flex gap-1">
            {(['all', 'today', 'week', 'month'] as const).map((opt) => {
              const labels = { all: t.allContent.dateAll, today: t.allContent.dateToday, week: t.allContent.dateWeek, month: t.allContent.dateMonth }
              const active = !selectedDayKey && filterDate === opt
              return (
                <button
                  key={opt}
                  onClick={() => {
                    setFilterDate(opt)
                    setSelectedDayKey(null)
                  }}
                  className="px-3 py-0.5 rounded text-xs font-mono transition-colors"
                  style={active
                    ? { color: 'rgb(var(--text))', background: 'rgb(var(--text) / 0.12)', border: '1px solid rgb(var(--text) / 0.25)' }
                    : { color: 'rgb(var(--text-muted))', background: 'transparent', border: '1px solid rgb(var(--border))' }
                  }
                >
                  {labels[opt]}
                </button>
              )
            })}
          </div>

          {/* Calendar toggle */}
          <button
            onClick={() => setCalendarExpanded((prev) => !prev)}
            className="flex items-center justify-center px-2 py-0.5 rounded text-xs font-mono transition-colors"
            style={calendarExpanded || selectedDayKey
              ? { color: 'rgb(var(--text))', background: 'rgb(var(--text) / 0.12)', border: '1px solid rgb(var(--text) / 0.25)' }
              : { color: 'rgb(var(--text-muted))', background: 'transparent', border: '1px solid rgb(var(--border))' }
            }
            title={calendarExpanded ? t.allContent.hideCalendar : t.allContent.showCalendar}
          >
            <CalendarDays size={14} />
          </button>

          {/* Selected-day label + clear */}
          {selectedDayKey && (
            <div className="flex items-center gap-1">
              {!calendarExpanded && (
                <span className="text-[11px] font-mono text-text">
                  {formatDate(dayKeyToDate(selectedDayKey), 'EEEE, MMM d')}
                </span>
              )}
              <button
                onClick={() => setSelectedDayKey(null)}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'rgb(var(--text))' }}
                title={t.allContent.clearDayFilter}
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Calendar dropdown */}
        <div
          className="overflow-hidden transition-all duration-200 ease-in-out"
          style={{ maxHeight: calendarExpanded ? '400px' : '0px', opacity: calendarExpanded ? 1 : 0 }}
        >
          <div className="pt-2.5 max-w-[320px]">
            <div className="rounded border border-border bg-surface-2/30 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <button
                  onClick={() => setCalendarMonth((prev) => startOfMonth(addMonths(prev, -1)))}
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  title={t.allContent.prevMonth}
                >
                  <ChevronLeft size={12} />
                </button>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  <CalendarDays size={10} />
                  <span>{formatDate(calendarMonth, 'MMMM yyyy')}</span>
                </div>
                <button
                  onClick={() => setCalendarMonth((prev) => startOfMonth(addMonths(prev, 1)))}
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  title={t.allContent.nextMonth}
                >
                  <ChevronRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {t.allContent.weekdays.map((label, i) => (
                  <div key={i} className="text-[9px] font-mono text-text-muted/60 text-center">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const dayKey = toDayKey(day)
                  const marker = dayMarkers.get(dayKey)
                  const isSelected = selectedDayKey === dayKey
                  const inMonth = isSameMonth(day, calendarMonth)
                  const today = isToday(day)
                  const hasActivity = Boolean(marker && (marker.created > 0 || marker.updated > 0))

                  return (
                    <button
                      key={dayKey}
                      onClick={() => {
                        setSelectedDayKey((prev) => (prev === dayKey ? null : dayKey))
                        setCalendarExpanded(false)
                      }}
                      title={hasActivity
                        ? tf(t.allContent.dayActivityTooltip, {
                            date: formatDate(day, 'PPP'),
                            created: marker?.created ?? 0,
                            updated: marker?.updated ?? 0,
                          })
                        : formatDate(day, 'PPP')
                      }
                      className="h-7 rounded text-[10px] font-mono transition-colors flex flex-col items-center justify-center"
                      style={isSelected
                        ? {
                            background: 'rgb(var(--text) / 0.12)',
                            border: '1px solid rgb(var(--text) / 0.25)',
                            color: 'rgb(var(--text))',
                          }
                        : {
                            background: inMonth ? 'transparent' : 'rgb(var(--surface-1) / 0.45)',
                            border: today ? '1px solid rgb(var(--text) / 0.2)' : '1px solid rgb(var(--border) / 0.4)',
                            color: inMonth ? 'rgb(var(--text-muted))' : 'rgb(var(--text-muted) / 0.45)',
                          }
                      }
                    >
                      <span>{formatDate(day, 'd')}</span>
                      <span className="h-[3px] flex items-center gap-[2px] mt-[1px]">
                        {marker && marker.created > 0 && (
                          <span className="w-[4px] h-[4px] rounded-full bg-emerald-400" />
                        )}
                        {marker && marker.updated > 0 && (
                          <span className="w-[4px] h-[4px] rounded-full bg-text/50" />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scroll area (also the floating sidebar's content anchor) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto" data-sidebar-anchor ref={sidebarAnchorRef}>
        <div className="px-6 py-5 space-y-6">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <LayoutGrid size={28} className="text-text-muted/40" />
              <p className="text-sm font-mono text-text-muted">
                {hasQuery || hasDateFilter ? t.allContent.noMatchingContent : t.allContent.nothingHereYet}
              </p>
            </div>
          ) : (
            <>
              {/* Favorites */}
              {favorites.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-3 uppercase tracking-wider text-[11px] text-text-muted">
                    <Star size={12} className="flex-shrink-0" />
                    <span>{t.allContent.favorites}</span>
                    <span className="text-text-muted/50">{favorites.length}</span>
                  </div>
                  <div className="grid gap-4" style={GRID_STYLE}>
                    {favorites.map((note) => (
                      <OverviewNoteCard
                        key={note.id}
                        note={note}
                        color={colorForNote(note)}
                        sectionTagColors={sectionTagColors}
                        onOpen={openNote}
                        onOpenSection={openSection}
                        onContextMenu={setContextMenu}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Groups */}
              {groupTiles.length > 0 && (
                <section>
                  <div className="mb-3 uppercase tracking-wider text-[11px] text-text-muted">
                    {t.allContent.groups} <span className="text-text-muted/50">{groupTiles.length}</span>
                  </div>
                  <div className="grid gap-4" style={GRID_STYLE}>
                    {groupTiles.map(({ group, count, looseNotes: groupLoose, folders: groupFolders }) => {
                      // With an active query, reveal results: every visible group/folder counts as
                      // expanded and the shown notes are filtered to the matches.
                      const expanded = hasQuery || expandedGroupIds.has(group.id)

                      const looseShown = hasQuery
                        ? groupLoose.filter((n) => noteMatchesQuery(n, parsed))
                        : groupLoose

                      const foldersShown = groupFolders
                        .map((f) => ({
                          folder: f.folder,
                          notes: hasQuery ? f.notes.filter((n) => noteMatchesQuery(n, parsed)) : f.notes,
                        }))
                        // Drop folders left empty by the query.
                        .filter((f) => !hasQuery || f.notes.length > 0)

                      const hasContent = looseShown.length > 0 || foldersShown.length > 0

                      return (
                        <Fragment key={group.id}>
                          <GroupTile
                            group={group}
                            count={count}
                            expanded={expanded}
                            onToggle={() => toggleGroup(group.id)}
                            onOpen={() => openGroupFromAll(group.id)}
                          />

                          <AccordionPanel open={expanded && hasContent} style={{ gridColumn: '1 / -1' }}>
                            <div className="border-l border-border pl-4 ml-1 space-y-4 pb-1">
                              {/* Loose notes at the group root */}
                              {looseShown.length > 0 && (
                                <div className="grid gap-4" style={GRID_STYLE}>
                                  {looseShown.map((note) => (
                                    <OverviewNoteCard
                                      key={note.id}
                                      note={note}
                                      color={group.color}
                                      sectionTagColors={sectionTagColors}
                                      onOpen={openNote}
                                      onOpenSection={openSection}
                                      onContextMenu={setContextMenu}
                                    />
                                  ))}
                                </div>
                              )}

                              {/* Subfolders with their notes */}
                              {foldersShown.map(({ folder, notes: folderNotes }) => {
                                const folderOpen = hasQuery || !collapsedFolderIds.has(folder.id)
                                return (
                                  <div key={folder.id} className="space-y-3">
                                    <button
                                      onClick={() => !hasQuery && toggleFolder(folder.id)}
                                      disabled={hasQuery}
                                      className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-text-muted hover:text-text transition-colors disabled:cursor-default disabled:hover:text-text-muted"
                                      title={folder.name}
                                      aria-expanded={folderOpen}
                                    >
                                      <ChevronRight
                                        size={12}
                                        className={`flex-shrink-0 transition-transform ${folderOpen ? 'rotate-90' : ''}`}
                                      />
                                      {folderOpen ? (
                                        <FolderOpen
                                          size={13}
                                          className="flex-shrink-0"
                                          style={{ color: `rgb(${colorChannels(group.color)})` }}
                                        />
                                      ) : (
                                        <Folder
                                          size={13}
                                          className="flex-shrink-0"
                                          style={{ color: `rgb(${colorChannels(group.color)})` }}
                                        />
                                      )}
                                      <span className="truncate">{folder.name}</span>
                                      <span className="text-text-muted/50">{folderNotes.length}</span>
                                    </button>

                                    <AccordionPanel open={folderOpen && folderNotes.length > 0}>
                                      <div className="grid gap-4" style={GRID_STYLE}>
                                        {folderNotes.map((note) => (
                                          <OverviewNoteCard
                                            key={note.id}
                                            note={note}
                                            color={group.color}
                                            sectionTagColors={sectionTagColors}
                                            onOpen={openNote}
                                            onOpenSection={openSection}
                                            onContextMenu={setContextMenu}
                                          />
                                        ))}
                                      </div>
                                    </AccordionPanel>
                                  </div>
                                )
                              })}
                            </div>
                          </AccordionPanel>
                        </Fragment>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Loose notes */}
              {looseNotes.length > 0 && (
                <section>
                  <div className="mb-3 uppercase tracking-wider text-[11px] text-text-muted">
                    {t.allContent.notes} <span className="text-text-muted/50">{looseNotes.length}</span>
                  </div>
                  <div className="grid gap-4" style={GRID_STYLE}>
                    {looseNotes.map((note) => (
                      <OverviewNoteCard
                        key={note.id}
                        note={note}
                        color={colorForNote(note)}
                        sectionTagColors={sectionTagColors}
                        onOpen={openNote}
                        onOpenSection={openSection}
                        onContextMenu={setContextMenu}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Accordion panel ──────────────────────────────────────────────────────────────────────────
// Animates inline content open/closed with the grid-rows 0fr↔1fr technique (same as the sidebar).
// Children are mounted only while open (or while a close animation is still running), so collapsed
// content doesn't pay the cost of rendering every note preview. Used for both group panels (which
// pass `style={{ gridColumn: '1 / -1' }}` so they drop below their tile row in the tiles grid) and
// folder panels inside a group (no extra style — they live in a normal flow column).
function AccordionPanel({
  open,
  children,
  style,
}: {
  open: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  // `mounted` keeps the costly children in the tree: true while open, and kept true through the
  // close animation (dropped on transition end). `shown` drives the grid-rows value and starts at
  // 0fr even when opening so the first frame can animate up to 1fr.
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  // All state flips happen asynchronously (rAF / transition-end), never synchronously in the effect
  // body — mount at 0fr, then flip to 1fr next frame for the open transition; flip to 0fr next
  // frame to run the close transition.
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (open) setMounted(true)
      setShown(open)
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  // Mount the costly children only while open or during the closing animation.
  if (!mounted && !open) return null

  return (
    <div
      style={{
        ...style,
        display: 'grid',
        gridTemplateRows: shown ? '1fr' : '0fr',
        opacity: shown ? 1 : 0,
      }}
      className="overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-in-out"
      onTransitionEnd={(e) => {
        // Drop the children once the close animation finishes (ignore bubbled child transitions).
        if (e.target === e.currentTarget && !open) setMounted(false)
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

// ── Group tile (compact: color bar + name + note count; expands inline as an accordion) ──────────
interface GroupTileProps {
  group: NoteGroup
  count: number
  expanded: boolean
  onToggle: () => void
  onOpen: () => void
}

function GroupTile({ group, count, expanded, onToggle, onOpen }: GroupTileProps) {
  const t = useT()
  return (
    // Container (not a button) so the "open group view" action can be a nested button — HTML
    // forbids buttons inside buttons.
    <div
      className="group relative rounded-md border border-border bg-surface-1 hover:bg-surface-2 hover:border-text/25 transition-colors overflow-hidden min-h-[78px]"
    >
      {/* Group-color accent line */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px] z-10"
        style={{ background: `rgb(${colorChannels(group.color)})` }}
      />

      {/* Primary action — expand / collapse inline */}
      <button
        onClick={onToggle}
        className="flex items-start gap-2.5 w-full text-left p-3 pl-4 min-h-[78px]"
        title={group.name}
        aria-expanded={expanded}
      >
        <Folder
          size={18}
          className="flex-shrink-0"
          fill={`rgb(${colorChannels(group.color)} / 0.18)`}
          style={{ color: `rgb(${colorChannels(group.color)})` }}
        />
        <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-text/90 truncate">
          {group.name}
        </span>
        <span className="flex-shrink-0 text-[11px] font-mono text-text-muted/60">
          {plural(t.common.notesPlural, count)}
        </span>
        <ChevronRight
          size={15}
          className={`flex-shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Secondary action — open the full group view (visible on hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
        className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center w-6 h-6 rounded border border-border bg-surface-2 text-text-muted hover:text-text hover:border-text/25 opacity-0 group-hover:opacity-100 transition-opacity"
        title={t.common.openGroupView}
      >
        <Maximize2 size={12} />
      </button>
    </div>
  )
}
