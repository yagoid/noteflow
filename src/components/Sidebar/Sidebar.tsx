import { useMemo, useRef, useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { Archive, Search, Pin, PanelLeftClose, Trash2, PinOff, Lock, Unlock, Copy, Columns2, ExternalLink, FolderPlus, FolderMinus, ChevronLeft, ChevronRight, CalendarDays, X, Plus } from 'lucide-react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, isYesterday, startOfMonth, startOfWeek } from 'date-fns'
import { ConfirmModal } from '../ConfirmModal'
import { EncryptionModal } from '../EncryptionModal'
import { getTagColor, normalizeTagColorKey, TAG_COLOR_VARS } from '../../lib/tagColors'
import { NoteGroupHeader } from './NoteGroupHeader'
import { useSidebarGroups } from './useSidebarGroups'
import type { GroupColor } from '../../types'

interface SidebarProps {
  onCollapse: () => void
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

/** Normalize a string: lowercase + strip diacritical marks (accents) */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderHighlightedText(text: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return text
  const matcher = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig')
  const parts = text.split(matcher)
  if (parts.length <= 1) return text

  return parts.map((part, index) => (
    index % 2 === 1
      ? (
        <mark key={`${part}-${index}`} className="bg-accent/25 text-accent rounded px-[1px]">
          {part}
        </mark>
      )
      : <span key={`${part}-${index}`}>{part}</span>
  ))
}

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

const GROUP_COLORS: GroupColor[] = [...TAG_COLOR_VARS]

export function Sidebar({ onCollapse }: SidebarProps) {
  const rawNotes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const searchQuery = useNotesStore((s) => s.searchQuery)
  const filterDate = useNotesStore((s) => s.filterDate)
  const filterTag = useNotesStore((s) => s.filterTag)
  const showArchived = useNotesStore((s) => s.showArchived)

  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  const archiveNote = useNotesStore((s) => s.archiveNote)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const encryptNote = useNotesStore((s) => s.encryptNote)
  const unlockNote = useNotesStore((s) => s.unlockNote)
  const lockNote = useNotesStore((s) => s.lockNote)
  const removeNoteEncryption = useNotesStore((s) => s.removeNoteEncryption)
  const sessionPasswords = useNotesStore((s) => s.sessionPasswords)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setFilterDate = useNotesStore((s) => s.setFilterDate)
  const setShowArchived = useNotesStore((s) => s.setShowArchived)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const openNoteInSplit = useNotesStore((s) => s.openNoteInSplit)
  const createNote = useNotesStore((s) => s.createNote)
  const duplicateNote = useNotesStore((s) => s.duplicateNote)

  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const setSectionTagColor = useSectionTagColorsStore((s) => s.setSectionTagColor)
  const clearSectionTagColor = useSectionTagColorsStore((s) => s.clearSectionTagColor)

  const groups = useGroupsStore((s) => s.groups)
  const collapsedGroupIds = useGroupsStore((s) => s.collapsedGroupIds)
  const createGroup = useGroupsStore((s) => s.createGroup)
  const renameGroup = useGroupsStore((s) => s.renameGroup)
  const deleteGroup = useGroupsStore((s) => s.deleteGroup)
  const toggleGroupCollapsed = useGroupsStore((s) => s.toggleGroupCollapsed)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Note context menu ──────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    noteId: string
    sectionId: string | null
  } | null>(null)

  // ── Group context menu ─────────────────────────────────────────────────────
  const [groupContextMenu, setGroupContextMenu] = useState<{
    x: number
    y: number
    groupId: string
  } | null>(null)

  // ── Group picker / create inline ───────────────────────────────────────────
  const [groupPickerNoteId, setGroupPickerNoteId] = useState<string | null>(null)
  const [groupNameInput, setGroupNameInput] = useState<{ noteId: string; value: string } | null>(null)

  // ── Group rename inline ────────────────────────────────────────────────────
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')

  // ── New group inline input ─────────────────────────────────────────────────
  const [newGroupInput, setNewGroupInput] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // ── Confirm modal ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger: boolean
    onConfirm: () => void
  } | null>(null)

  // ── Encryption modal ───────────────────────────────────────────────────────
  const [encModal, setEncModal] = useState<{
    mode: 'encrypt' | 'unlock' | 'remove'
    noteId: string
  } | null>(null)

  // noteId to delete after a successful unlock (for delete-encrypted-note flow)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [calendarExpanded, setCalendarExpanded] = useState(false)
  const [keyboardResultIndex, setKeyboardResultIndex] = useState(-1)

  // ── Close menus on click elsewhere ────────────────────────────────────────
  useEffect(() => {
    const close = () => {
      setContextMenu(null)
      setGroupContextMenu(null)
      setGroupPickerNoteId(null)
      setGroupNameInput(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    const handler = () => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('noteflow:focus-search', handler)
    return () => window.removeEventListener('noteflow:focus-search', handler)
  }, [])

  const baseNotes = useMemo(() => {
    return rawNotes
      .filter((n) => showArchived || !n.archived)
      .filter((n) => !filterTag || n.tags.includes(filterTag))
      .filter((n) => {
        if (!searchQuery.trim()) return true
        const q = normalize(searchQuery)
        return (
          normalize(n.title).includes(q) ||
          n.sections.some((s) => normalize(s.content).includes(q) || normalize(s.name).includes(q)) ||
          n.tags.some((t) => normalize(t).includes(q))
        )
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.updated).getTime() - new Date(a.updated).getTime()
      })
  }, [rawNotes, showArchived, filterTag, searchQuery])

  const notes = useMemo(() => {
    if (selectedDayKey) {
      return baseNotes.filter((note) => {
        const createdDay = toDayKeyFromIso(note.created)
        const updatedDay = toDayKeyFromIso(note.updated)
        return createdDay === selectedDayKey || updatedDay === selectedDayKey
      })
    }

    return baseNotes.filter((n) => {
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
  }, [baseNotes, filterDate, selectedDayKey])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  }, [calendarMonth])

  const dayMarkers = useMemo(() => {
    const markers = new Map<string, { created: number; updated: number }>()
    for (const note of baseNotes) {
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
  }, [baseNotes])

  const items = useSidebarGroups(notes, groups)
  const visibleNoteIds = useMemo(() => {
    const ids: string[] = []
    for (const item of items) {
      if (item.kind === 'group') {
        ids.push(...item.notes.map((note) => note.id))
      } else {
        ids.push(item.note.id)
      }
    }
    return ids
  }, [items])
  const hasSearchFilter = searchQuery.trim().length > 0
  const hasDateFilter = filterDate !== 'all'
  const hasTagFilter = Boolean(filterTag)
  const hasDayFilter = Boolean(selectedDayKey)
  const hasArchivedFilter = showArchived
  const hasActiveFilters = hasSearchFilter || hasDateFilter || hasTagFilter || hasDayFilter || hasArchivedFilter
  const scopedTotal = rawNotes.filter((n) => showArchived || !n.archived).length
  const activeSearchNoteId =
    hasSearchFilter && keyboardResultIndex >= 0 && keyboardResultIndex < visibleNoteIds.length
      ? visibleNoteIds[keyboardResultIndex]
      : null

  useEffect(() => {
    if (!hasSearchFilter || visibleNoteIds.length === 0) {
      setKeyboardResultIndex(-1)
      return
    }
    setKeyboardResultIndex((prev) => {
      if (prev >= 0 && prev < visibleNoteIds.length) return prev
      return 0
    })
  }, [hasSearchFilter, visibleNoteIds])

  useEffect(() => {
    if (!activeSearchNoteId) return
    const target = document.querySelector<HTMLElement>(`[data-note-id="${activeSearchNoteId}"]`)
    target?.scrollIntoView({ block: 'nearest' })
  }, [activeSearchNoteId])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getNoteGroupDirect(noteId: string) {
    const note = rawNotes.find(n => n.id === noteId)
    return note?.group ? groups.find(g => g.id === note.group) ?? null : null
  }

  function closeAllMenus() {
    setContextMenu(null)
    setGroupContextMenu(null)
    setGroupPickerNoteId(null)
    setGroupNameInput(null)
  }

  async function createNoteInGroup(groupId: string) {
    const note = await createNote()
    await updateNote(note.id, { group: groupId })
    closeAllMenus()
  }


  function moveSearchSelection(direction: 1 | -1) {
    if (visibleNoteIds.length === 0) return
    setKeyboardResultIndex((prev) => {
      if (prev < 0) return direction === 1 ? 0 : visibleNoteIds.length - 1
      const next = prev + direction
      if (next < 0) return visibleNoteIds.length - 1
      if (next >= visibleNoteIds.length) return 0
      return next
    })
  }

  function openSelectedSearchResult() {
    const targetId = activeSearchNoteId ?? visibleNoteIds[0]
    if (!targetId) return
    setOpenNoteIds([targetId])
    setActiveNote(targetId)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    if (visibleNoteIds.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveSearchSelection(1)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveSearchSelection(-1)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      openSelectedSearchResult()
    }
  }

  function handleNoteDragStart(e: React.DragEvent<HTMLButtonElement>, noteId: string) {
    e.dataTransfer.setData('application/x-noteflow-note-id', noteId)
    e.dataTransfer.setData('text/plain', noteId)
    e.dataTransfer.effectAllowed = 'copyMove'
    window.dispatchEvent(new CustomEvent('noteflow:note-drag', {
      detail: { active: true, noteId },
    }))
  }

  function handleNoteDragEnd() {
    window.dispatchEvent(new CustomEvent('noteflow:note-drag', {
      detail: { active: false },
    }))
  }

  function renderNoteButton(note: (typeof rawNotes)[0], group?: { id: string; color: string } | null) {
    const isActive = activeNoteId === note.id
    const isSearchTarget = activeSearchNoteId === note.id
    return (
      <li key={note.id}>
        <button
          data-note-id={note.id}
          draggable
          onDragStart={(e) => handleNoteDragStart(e, note.id)}
          onDragEnd={handleNoteDragEnd}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              openNoteInSplit(note.id)
              return
            }
            setOpenNoteIds([note.id])
            setActiveNote(note.id)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setContextMenu({
              x: e.clientX,
              y: Math.min(e.clientY, window.innerHeight - 260),
              noteId: note.id,
              sectionId: null,
            })
          }}
          className={`relative w-full text-left px-4 py-2 transition-colors h-[64px] flex flex-col justify-center
            ${isActive && !group ? 'bg-accent/10' : ''}
            ${!isActive ? 'hover:bg-surface-2' : ''}
            ${isSearchTarget ? 'ring-1 ring-inset ring-accent/50' : ''}`}
          style={{
            borderRight: group
              ? `1px solid rgb(var(${group.color}) / 0.6)`
              : '2px solid transparent',
            ...(isActive && group ? { background: `rgb(var(${group.color}) / 0.1)` } : {}),
            ...(isSearchTarget && !isActive ? { background: 'rgb(var(--accent) / 0.08)' } : {}),
          }}
          title="Ctrl/Cmd + click to open side by side"
        >
          {isActive && (
            <div
              className="absolute left-1 top-2.5 bottom-2.5 w-[1px] rounded-full"
              style={{ background: group ? `rgb(var(${group.color}))` : 'rgb(var(--accent))' }}
            />
          )}
          <div className="flex items-center gap-1 min-w-0">
            {note.pinned && <Pin size={9} className="text-yellow-400 flex-shrink-0" />}
            {note.encryption && <Lock size={9} className="text-amber-400 flex-shrink-0" />}
            <span className={`text-[13px] font-mono font-medium truncate flex-1
              ${activeNoteId === note.id ? 'text-text' : 'text-text/80'}`}>
              {renderHighlightedText(note.title || 'Untitled', searchQuery)}
            </span>
            <span className="text-xs font-mono text-text-muted/50 flex-shrink-0 ml-1">
              {formatNoteDate(note.updated)}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
            {note.sections.map((section) => (
              <span
                key={section.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  window.dispatchEvent(new CustomEvent('noteflow:request-section', {
                    detail: { noteId: note.id, sectionId: section.id }
                  }))
                  if (e.ctrlKey || e.metaKey) {
                    openNoteInSplit(note.id)
                    return
                  }
                  setOpenNoteIds([note.id])
                  setActiveNote(note.id)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({
                    x: e.clientX,
                    y: Math.min(e.clientY, window.innerHeight - 260),
                    noteId: note.id,
                    sectionId: section.id,
                  })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click()
                }}
                className="text-[10px] font-mono px-1 rounded flex-shrink-0 leading-[1.6] hover:opacity-70 transition-opacity cursor-pointer"
                style={getTagColor(section.name, sectionTagColors)}
              >
                {renderHighlightedText(section.name, searchQuery)}
              </span>
            ))}
          </div>
        </button>
      </li>
    )
  }

  return (
    <div className="flex flex-col h-full border-r border-border bg-surface-1">
      {modal && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
      {encModal && (() => {
        const encNote = rawNotes.find(n => n.id === encModal.noteId)
        if (!encNote) return null
        return (
          <EncryptionModal
            mode={encModal.mode}
            noteTitle={encNote.title}
            onConfirm={async (password, options) => {
              if (encModal.mode === 'encrypt') {
                await encryptNote(encModal.noteId, password, options)
              } else if (encModal.mode === 'unlock') {
                await unlockNote(encModal.noteId, password)
                if (pendingDeleteId === encModal.noteId) {
                  const target = rawNotes.find(n => n.id === pendingDeleteId)
                  setPendingDeleteId(null)
                  setEncModal(null)
                  if (target) {
                    setModal({
                      title: 'Delete note',
                      message: `"${target.title || 'Untitled'}" will be permanently deleted.`,
                      confirmLabel: 'Delete',
                      danger: true,
                      onConfirm: () => { setModal(null); deleteNote(target.id) },
                    })
                  }
                  return
                }
              } else {
                await removeNoteEncryption(encModal.noteId, password)
              }
              setEncModal(null)
            }}
            onCancel={() => { setPendingDeleteId(null); setEncModal(null) }}
          />
        )
      })()}

      {/* ── Search + collapse ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search... (Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pl-7 pr-7 py-1.5 bg-surface-2 border border-border rounded text-xs
                       font-mono text-text placeholder-text-muted/40 outline-none
                       focus:border-accent/50 transition-colors caret-accent"
          />
          {hasSearchFilter && (
            <button
              onClick={() => setSearchQuery('')}
              title="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <button
          onClick={onCollapse}
          title="Collapse sidebar (Ctrl+')"
          className="flex-shrink-0 p-1.5 rounded text-text-muted/50 hover:text-text-muted
                     hover:bg-surface-2 transition-colors"
        >
          <PanelLeftClose size={13} />
        </button>
      </div>

      {/* ── Date filter ────────────────────────────────────────────────────── */}
      <div className="border-t border-b border-border">
        <div className="flex gap-1 px-3 py-2">
          {(['all', 'today', 'week', 'month'] as const).map((opt) => {
            const labels = { all: 'All', today: 'Today', week: 'Week', month: 'Month' }
            const active = !selectedDayKey && filterDate === opt
            return (
              <button
                key={opt}
                onClick={() => {
                  setFilterDate(opt)
                  setSelectedDayKey(null)
                }}
                className="flex-1 py-0.5 rounded text-xs font-mono transition-colors"
                style={active
                  ? { color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.22)', border: '1px solid rgb(var(--accent) / 0.5)' }
                  : { color: 'rgb(var(--text-muted))', background: 'transparent', border: '1px solid rgb(var(--border))' }
                }
              >
                {labels[opt]}
              </button>
            )
          })}
        </div>

        <div className="px-3 pb-2 flex items-center gap-1">
          <button
            onClick={() => setCalendarExpanded((prev) => !prev)}
            className="flex-1 flex items-center justify-center py-0.5 rounded text-xs font-mono transition-colors"
            style={calendarExpanded || selectedDayKey
              ? { color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.22)', border: '1px solid rgb(var(--accent) / 0.5)' }
              : { color: 'rgb(var(--text-muted))', background: 'transparent', border: '1px solid rgb(var(--border))' }
            }
            title={calendarExpanded ? 'Hide calendar' : 'Show calendar'}
          >
            <CalendarDays size={14} />
          </button>
          {selectedDayKey && (
            <button
              onClick={() => setSelectedDayKey(null)}
              className="p-0.5 rounded transition-colors"
              style={{ color: 'rgb(var(--accent))' }}
              title="Clear day filter"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {selectedDayKey && !calendarExpanded && (
          <div className="px-3 pb-2">
            <span className="text-[10px] font-mono text-accent">
              {format(dayKeyToDate(selectedDayKey), 'EEEE, MMM d')}
            </span>
          </div>
        )}

        <div
          className="overflow-hidden transition-all duration-200 ease-in-out"
          style={{ maxHeight: calendarExpanded ? '400px' : '0px', opacity: calendarExpanded ? 1 : 0 }}
        >
          <div className="px-3 pb-2">
            <div className="rounded border border-border bg-surface-2/30 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <button
                  onClick={() => setCalendarMonth((prev) => startOfMonth(addMonths(prev, -1)))}
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  title="Previous month"
                >
                  <ChevronLeft size={12} />
                </button>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  <CalendarDays size={10} />
                  <span>{format(calendarMonth, 'MMMM yyyy')}</span>
                </div>
                <button
                  onClick={() => setCalendarMonth((prev) => startOfMonth(addMonths(prev, 1)))}
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  title="Next month"
                >
                  <ChevronRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
                  <div key={label} className="text-[9px] font-mono text-text-muted/60 text-center">
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
                        ? `${format(day, 'PPP')} · created ${marker?.created ?? 0}, updated ${marker?.updated ?? 0}`
                        : format(day, 'PPP')
                      }
                      className="h-7 rounded text-[10px] font-mono transition-colors flex flex-col items-center justify-center"
                      style={isSelected
                        ? {
                            background: 'rgb(var(--accent) / 0.22)',
                            border: '1px solid rgb(var(--accent) / 0.5)',
                            color: 'rgb(var(--accent))',
                          }
                        : {
                            background: inMonth ? 'transparent' : 'rgb(var(--surface-1) / 0.45)',
                            border: today ? '1px solid rgb(var(--accent) / 0.35)' : '1px solid rgb(var(--border) / 0.4)',
                            color: inMonth ? 'rgb(var(--text-muted))' : 'rgb(var(--text-muted) / 0.45)',
                          }
                      }
                    >
                      <span>{format(day, 'd')}</span>
                      <span className="h-[3px] flex items-center gap-[2px] mt-[1px]">
                        {marker && marker.created > 0 && (
                          <span className="w-[4px] h-[4px] rounded-full bg-emerald-400" />
                        )}
                        {marker && marker.updated > 0 && (
                          <span className="w-[4px] h-[4px] rounded-full bg-accent" />
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

      {/* ── New note / new group buttons ────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-border space-y-1.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => createNote()}
            title="New note (Ctrl+N)"
            className="flex-1 py-1.5 rounded text-xs font-mono transition-all
                       bg-accent/10 text-accent border border-accent/20
                       hover:bg-accent/20 hover:border-accent/40"
          >
            + New note
          </button>
          <button
            onClick={() => { setNewGroupInput(true); setNewGroupName('') }}
            title="New group"
            className="flex-shrink-0 p-1.5 rounded text-text-muted/50 border border-border
                       hover:text-text-muted hover:bg-surface-2 hover:border-border transition-colors"
          >
            <FolderPlus size={13} />
          </button>
        </div>
        {newGroupInput && (
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newGroupName.trim()) {
                await createGroup(newGroupName.trim(), '--accent')
                setNewGroupInput(false)
                setNewGroupName('')
              }
              if (e.key === 'Escape') {
                setNewGroupInput(false)
                setNewGroupName('')
              }
            }}
            onBlur={() => { setNewGroupInput(false); setNewGroupName('') }}
            placeholder="Group name…"
            className="w-full px-2 py-1 text-xs font-mono bg-surface-1 border border-accent/50 rounded outline-none text-text placeholder-text-muted/40 caret-accent"
          />
        )}
      </div>

      {/* ── Notes list ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto notes-list-scroll">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted gap-2">
            <span className="text-2xl opacity-20">∅</span>
            <span className="text-xs font-mono">{rawNotes.length > 0 ? 'No notes match current filters' : 'No notes'}</span>
          </div>
        ) : (
          <ul className="pt-2 pb-1">
            {items.map((item) => {
              if (item.kind === 'group') {
                const { group, notes: groupNotes } = item
                const collapsed = collapsedGroupIds.has(group.id)
                if (hasActiveFilters && groupNotes.length === 0) return null
                return (
                  <li key={`group-${group.id}`}>
                    {/* Group header / rename input */}
                    {editingGroupId === group.id ? (
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: `rgb(var(${group.color}))` }}
                        />
                        <input
                          autoFocus
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onBlur={() => {
                            if (editingGroupName.trim()) renameGroup(group.id, editingGroupName.trim())
                            setEditingGroupId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingGroupName.trim()) renameGroup(group.id, editingGroupName.trim())
                              setEditingGroupId(null)
                            }
                            if (e.key === 'Escape') setEditingGroupId(null)
                          }}
                          className="flex-1 text-[11px] font-mono bg-surface-1 border border-accent/50 rounded px-1 outline-none text-text"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : (
                      <NoteGroupHeader
                        group={group}
                        noteCount={item.visibleCount}
                        collapsed={collapsed}
                        onToggle={() => toggleGroupCollapsed(group.id)}
                        onContextMenu={(e) => {
                          setGroupContextMenu({ x: e.clientX, y: Math.min(e.clientY, window.innerHeight - 120), groupId: group.id })
                        }}
                      />
                    )}

                    {/* Animated container with vertical line */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateRows: collapsed ? '0fr' : '1fr',
                        transition: 'grid-template-rows 180ms ease',
                      }}
                    >
                      <div style={{ overflow: 'hidden' }}>
                        <ul>
                          {groupNotes.map((note) => renderNoteButton(note, group))}
                          {groupNotes.length === 0 && (
                            <li>
                              <button
                                onClick={() => createNoteInGroup(group.id)}
                                className="w-full text-left px-4 py-2 text-xs font-mono text-text-muted hover:text-accent flex items-center gap-1.5 transition-colors"
                              >
                                <Plus size={10} />
                                New note
                              </button>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                    <div className="border-b border-border/40" />
                  </li>
                )
              }

              // kind === 'note' (ungrouped)
              return renderNoteButton(item.note, null)
            })}
          </ul>
        )}
      </div>

      {/* ── Note Context Menu ────────────────────────────────────────────────── */}
      {contextMenu && (() => {
        const note = rawNotes.find(n => n.id === contextMenu.noteId)
        if (!note) return null
        const currentGroup = getNoteGroupDirect(note.id)
        const currentSection = contextMenu.sectionId
          ? note.sections.find((section) => section.id === contextMenu.sectionId) ?? null
          : null
        const currentSectionColor = currentSection
          ? sectionTagColors[normalizeTagColorKey(currentSection.name)]
          : undefined
        return (
          <div
            className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-48 overflow-hidden animate-in fade-in zoom-in duration-100"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { updateNote(note.id, { pinned: !note.pinned }); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
            >
              {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              {note.pinned ? 'Unpin note' : 'Pin note'}
            </button>
            <button
              onClick={() => { archiveNote(note.id); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
            >
              <Archive size={12} />
              {note.archived ? 'Unarchive' : 'Archive'}
            </button>
            {!note.encryption && (
              <button
                onClick={() => { closeAllMenus(); setEncModal({ mode: 'encrypt', noteId: note.id }) }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
              >
                <Lock size={12} />
                Encrypt note
              </button>
            )}
            {note.encryption && !sessionPasswords[note.id] && (
              <button
                onClick={() => { closeAllMenus(); setEncModal({ mode: 'unlock', noteId: note.id }) }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
              >
                <Unlock size={12} />
                Unlock note
              </button>
            )}
            {note.encryption && !!sessionPasswords[note.id] && (
              <button
                onClick={() => { lockNote(note.id); closeAllMenus() }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
              >
                <Lock size={12} />
                Lock note
              </button>
            )}
            {note.encryption && (
              <button
                onClick={() => { closeAllMenus(); setEncModal({ mode: 'remove', noteId: note.id }) }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
              >
                <Unlock size={12} />
                Remove encryption
              </button>
            )}
            <button
              onClick={() => {
                openNoteInSplit(note.id)
                closeAllMenus()
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
            >
              <Columns2 size={12} />
              Open alongside
            </button>
            <button
              onClick={() => { duplicateNote(note.id); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
            >
              <Copy size={12} />
              Duplicate note
            </button>

            {currentSection && (
              <>
                <div className="h-px bg-border my-1" />
                <div className="px-3 pt-1 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  Section color
                </div>
                <div className="px-3 py-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {GROUP_COLORS.map((color) => (
                      <button
                        key={`section-color-${color}`}
                        title={color.replace('--', '')}
                        onClick={(e) => {
                          e.stopPropagation()
                          void setSectionTagColor(currentSection.name, color)
                          closeAllMenus()
                        }}
                        className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${currentSectionColor === color ? 'ring-1 ring-white/50 ring-offset-1 ring-offset-surface-2' : ''}`}
                        style={{ background: `rgb(var(${color}))` }}
                      />
                    ))}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void clearSectionTagColor(currentSection.name)
                        closeAllMenus()
                      }}
                      className={`px-1.5 h-4 rounded text-[9px] font-mono border transition-colors ${
                        currentSectionColor
                          ? 'text-text-muted border-border hover:text-text hover:border-accent/40'
                          : 'text-accent border-accent/50 bg-accent/10'
                      }`}
                    >
                      Auto
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Group section ── */}
            <div className="h-px bg-border my-1" />
            {currentGroup ? (
              <button
                onClick={() => { updateNote(note.id, { group: undefined }); closeAllMenus() }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
              >
                <FolderMinus size={12} />
                Remove from group
              </button>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (groups.length === 0) {
                      setGroupNameInput({ noteId: note.id, value: '' })
                    } else {
                      setGroupPickerNoteId(groupPickerNoteId === note.id ? null : note.id)
                      setGroupNameInput(null)
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
                >
                  <FolderPlus size={12} />
                  Add to group
                  {groups.length > 0 && <ChevronRight size={10} className="ml-auto" />}
                </button>

                {/* Group picker — inline expansion */}
                {groupPickerNoteId === note.id && (
                  <>
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateNote(note.id, { group: g.id })
                          closeAllMenus()
                        }}
                        className="w-full text-left pl-6 pr-3 py-1 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: `rgb(var(${g.color}))` }}
                        />
                        {g.name}
                      </button>
                    ))}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setGroupPickerNoteId(null)
                        setGroupNameInput({ noteId: note.id, value: '' })
                      }}
                      className="w-full text-left pl-6 pr-3 py-1 text-xs font-mono text-text-muted hover:bg-accent/10 hover:text-accent transition-colors"
                    >
                      + New group…
                    </button>
                  </>
                )}

                {/* Inline group name input */}
                {groupNameInput?.noteId === note.id && (
                  <input
                    autoFocus
                    value={groupNameInput.value}
                    onChange={(e) => setGroupNameInput({ ...groupNameInput, value: e.target.value })}
                    onKeyDown={async (e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter' && groupNameInput.value.trim()) {
                        const g = await createGroup(groupNameInput.value.trim(), '--accent')
                        updateNote(note.id, { group: g.id })
                        closeAllMenus()
                      }
                      if (e.key === 'Escape') setGroupNameInput(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mx-3 my-1 px-2 py-1 text-xs font-mono bg-surface-1 border border-accent/50 rounded outline-none text-text w-[calc(100%-1.5rem)] block"
                    placeholder="Group name…"
                  />
                )}
              </>
            )}

            {(!note.encryption || !!sessionPasswords[note.id]) && (
              <>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={() => {
                    const targetSectionId = contextMenu.sectionId ?? note.sections[0]?.id
                    if (targetSectionId) window.noteflow.openSticky(note.id, targetSectionId)
                    closeAllMenus()
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
                >
                  <ExternalLink size={12} />
                  Open as Sticky Note
                </button>
              </>
            )}
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => {
                closeAllMenus()
                if (note.encryption && !sessionPasswords[note.id]) {
                  setPendingDeleteId(note.id)
                  setEncModal({ mode: 'unlock', noteId: note.id })
                  return
                }
                setModal({
                  title: 'Delete note',
                  message: `"${note.title || 'Untitled'}" will be permanently deleted.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: () => { setModal(null); deleteNote(note.id) },
                })
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-red-400 hover:bg-red-400/10 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={12} />
              Delete note
            </button>
          </div>
        )
      })()}

      {/* ── Group Context Menu ───────────────────────────────────────────────── */}
      {groupContextMenu && (() => {
        const group = groups.find(g => g.id === groupContextMenu.groupId)
        if (!group) return null
        return (
          <div
            className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-44 overflow-hidden animate-in fade-in zoom-in duration-100"
            style={{ left: groupContextMenu.x, top: groupContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); createNoteInGroup(group.id) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
            >
              <Plus size={12} />
              New note
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingGroupId(group.id)
                setEditingGroupName(group.name)
                setGroupContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
            >
              Rename group
            </button>

            {/* Color picker */}
            <div className="px-3 py-2">
              <div className="flex gap-1">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    title={color.replace('--', '')}
                    onClick={(e) => {
                      e.stopPropagation()
                      const updated = groups.map(g => g.id === group.id ? { ...g, color } : g)
                      window.noteflow.setGroups(updated)
                      useGroupsStore.setState({ groups: updated })
                      setGroupContextMenu(null)
                    }}
                    className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${group.color === color ? 'ring-1 ring-white/50 ring-offset-1 ring-offset-surface-2' : ''}`}
                    style={{ background: `rgb(var(${color}))` }}
                  />
                ))}
              </div>
            </div>

            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setGroupContextMenu(null)
                setModal({
                  title: 'Delete group',
                  message: `"${group.name}" will be deleted. Notes inside will become ungrouped.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: async () => {
                    setModal(null)
                    // Clear group field from all notes in this group
                    const affectedNotes = rawNotes.filter(n => n.group === group.id)
                    for (const n of affectedNotes) {
                      await updateNote(n.id, { group: undefined })
                    }
                    deleteGroup(group.id)
                  },
                })
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-red-400 hover:bg-red-400/10 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={12} />
              Delete group
            </button>
          </div>
        )
      })()}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-t border-border flex items-center justify-between">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-1 text-xs font-mono transition-colors
            ${showArchived ? 'text-accent' : 'text-text-muted hover:text-text'}`}
        >
          <Archive size={10} />
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
        <span className="text-xs font-mono text-text-muted/40">
          {notes.length}{hasActiveFilters ? ` / ${scopedTotal}` : ''} notes
        </span>
      </div>
    </div>
  )
}
