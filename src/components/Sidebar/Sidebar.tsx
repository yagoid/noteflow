import { Fragment, memo, useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { Archive, ArchiveRestore, Search, PanelLeftClose, Trash2, Lock, FolderPlus, Folder, FolderOpen, X, Plus, Timer, LayoutGrid } from 'lucide-react'
import { isToday, isYesterday } from 'date-fns'
import { ConfirmModal } from '../ConfirmModal'
import { ContextMenu } from '../ContextMenu'
import { CustomColorSwatch } from '../CustomColorSwatch'
import { NoteContextMenu, type NoteContextMenuRequest } from '../NoteContextMenu'
import { colorChannels, TAG_COLOR_VARS } from '../../lib/tagColors'
import { escapeRegExp, parseSearchQuery, noteMatchesQuery } from '../../lib/searchUtils'
import { NoteGroupHeader } from './NoteGroupHeader'
import { NoteFolderHeader } from './NoteFolderHeader'
import { useSidebarGroups, type SidebarFolder } from './useSidebarGroups'
import { SectionTabsRow } from './SectionTabsRow'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import type { Messages } from '../../i18n'
import type { GroupColor, Note } from '../../types'
import type { TagColorMap } from '../../lib/tagColors'

interface SidebarProps {
  onCollapse: () => void
}

function formatNoteDate(iso: string, t: Messages): string {
  const d = new Date(iso)
  if (isToday(d)) return formatDate(d, 'HH:mm')
  if (isYesterday(d)) return t.sidebar.yesterday
  return formatDate(d, 'MMM d')
}

function formatExpiry(iso: string, t: Messages): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return t.sidebar.expiringSoon
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return tf(t.sidebar.expiresInMinutes, { m: Math.ceil(diffMs / (1000 * 60)) })
  if (diffH < 24) return tf(t.sidebar.expiresInHours, { h: diffH })
  return tf(t.sidebar.expiresInDays, { d: Math.floor(diffH / 24) })
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
        <mark key={`${part}-${index}`} className="bg-text/15 text-text rounded px-[1px]">
          {part}
        </mark>
      )
      : <span key={`${part}-${index}`}>{part}</span>
  ))
}

const GROUP_COLORS: GroupColor[] = [...TAG_COLOR_VARS]

// Stable row callbacks shared by every NoteRow. The Sidebar keeps a ref to the live
// implementations and exposes this fixed-identity object so the memoized rows never
// re-render just because the parent re-rendered (e.g. on every editor keystroke).
interface RowHandlers {
  reorderDragOver: (e: React.DragEvent<HTMLLIElement>, note: Note, contextKey: string) => void
  reorderDragLeave: (noteId: string) => void
  drop: (e: React.DragEvent<HTMLLIElement>, note: Note, contextKey: string, inFavorites: boolean) => void
  dragStart: (e: React.DragEvent<HTMLButtonElement>, noteId: string, contextKey: string) => void
  dragEnd: () => void
  click: (e: React.MouseEvent, note: Note) => void
  contextMenu: (e: React.MouseEvent, note: Note) => void
  sectionClick: (e: React.MouseEvent, note: Note, sectionId: string) => void
  sectionContextMenu: (e: React.MouseEvent, note: Note, sectionId: string) => void
}

interface NoteRowProps {
  note: Note
  groupColor: GroupColor | null
  indent?: number
  inFavorites?: boolean
  wrapperClassName?: string
  contextKey: string
  isActive: boolean
  isSearchTarget: boolean
  isDropBefore: boolean
  isDropAfter: boolean
  searchQuery: string
  sectionFilter: string | null
  sectionTagColors: TagColorMap
  handlers: RowHandlers
}

// A single note row in the sidebar. Memoized so that with a large vault only the rows
// whose note object (or flags) actually changed re-render — editing one note no longer
// reconciles all the others. All dynamic-per-render behavior arrives via the stable
// `handlers` object; everything else is a primitive/stable prop.
const NoteRow = memo(function NoteRow({
  note,
  groupColor,
  indent,
  inFavorites,
  wrapperClassName,
  contextKey,
  isActive,
  isSearchTarget,
  isDropBefore,
  isDropAfter,
  searchQuery,
  sectionFilter,
  sectionTagColors,
  handlers,
}: NoteRowProps) {
  const t = useT()
  return (
    <li
      style={{ position: 'relative' }}
      className={wrapperClassName}
      onDragOver={(e) => handlers.reorderDragOver(e, note, contextKey)}
      onDragLeave={() => handlers.reorderDragLeave(note.id)}
      onDrop={(e) => handlers.drop(e, note, contextKey, !!inFavorites)}
    >
      {isDropBefore && (
        <div style={{ position: 'absolute', top: 0, left: 4, right: 4, height: 2, borderRadius: 2, background: 'rgb(var(--text) / 0.45)', zIndex: 5, pointerEvents: 'none' }} />
      )}
      {isDropAfter && (
        <div style={{ position: 'absolute', bottom: 0, left: 4, right: 4, height: 2, borderRadius: 2, background: 'rgb(var(--text) / 0.45)', zIndex: 5, pointerEvents: 'none' }} />
      )}
      <button
        data-note-id={note.id}
        draggable
        onDragStart={(e) => handlers.dragStart(e, note.id, contextKey)}
        onDragEnd={handlers.dragEnd}
        onClick={(e) => handlers.click(e, note)}
        onContextMenu={(e) => handlers.contextMenu(e, note)}
        className={`relative block w-full text-left px-2.5 py-1.5 rounded-md transition-colors
          ${!isActive ? 'hover:bg-surface-3' : ''}
          ${isSearchTarget ? 'ring-1 ring-inset ring-text/25' : ''}`}
        style={{
          ...(indent != null ? { paddingLeft: indent } : {}),
          ...(isActive
            ? { background: groupColor ? `rgb(${colorChannels(groupColor)} / 0.14)` : 'rgb(var(--text) / 0.1)' }
            : {}),
          ...(isSearchTarget && !isActive ? { background: 'rgb(var(--text) / 0.06)' } : {}),
        }}
        title={t.sidebar.openSideBySide}
      >
        <div className="flex items-center gap-1 min-w-0">
          {note.encryption && <Lock size={9} className="text-amber-400 flex-shrink-0" />}
          {note.expiresAt && <span title={formatExpiry(note.expiresAt, t)} className="flex-shrink-0 flex items-center"><Timer size={9} className="text-text-muted/60" /></span>}
          <span className={`text-[13px] font-mono font-medium truncate flex-1
            ${isActive ? 'text-text' : 'text-text/80'}`}>
            {renderHighlightedText(note.title || t.common.untitled, searchQuery)}
          </span>
          <span className="text-xs font-mono text-text-muted/50 flex-shrink-0 ml-1">
            {formatNoteDate(note.updated, t)}
          </span>
        </div>
        <SectionTabsRow
          noteId={note.id}
          sections={note.sections}
          searchQuery={searchQuery}
          sectionFilter={sectionFilter}
          sectionTagColors={sectionTagColors}
          onSectionClick={(sectionId, e) => handlers.sectionClick(e, note, sectionId)}
          onSectionContextMenu={(e, sectionId) => handlers.sectionContextMenu(e, note, sectionId)}
          renderHighlightedText={renderHighlightedText}
        />
      </button>
    </li>
  )
})

export function Sidebar({ onCollapse }: SidebarProps) {
  const t = useT()
  const rawNotes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const noteViewId = useNotesStore((s) => s.noteViewId)
  const searchQuery = useNotesStore((s) => s.searchQuery)
  const filterTag = useNotesStore((s) => s.filterTag)
  const showArchived = useNotesStore((s) => s.showArchived)

  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setGroupView = useNotesStore((s) => s.setGroupView)
  const setNoteView = useNotesStore((s) => s.setNoteView)
  const setAllView = useNotesStore((s) => s.setAllView)
  const updateNote = useNotesStore((s) => s.updateNote)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setShowArchived = useNotesStore((s) => s.setShowArchived)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const openNoteInSplit = useNotesStore((s) => s.openNoteInSplit)
  const createNote = useNotesStore((s) => s.createNote)
  const createTempNote = useNotesStore((s) => s.createTempNote)

  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)

  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const collapsedGroupIds = useGroupsStore((s) => s.collapsedGroupIds)
  const collapsedFolderIds = useGroupsStore((s) => s.collapsedFolderIds)
  const createGroup = useGroupsStore((s) => s.createGroup)
  const renameGroup = useGroupsStore((s) => s.renameGroup)
  const setGroupColor = useGroupsStore((s) => s.setGroupColor)
  const toggleGroupArchived = useGroupsStore((s) => s.toggleGroupArchived)
  const deleteGroup = useGroupsStore((s) => s.deleteGroup)
  const reorderGroups = useGroupsStore((s) => s.reorderGroups)
  const toggleGroupCollapsed = useGroupsStore((s) => s.toggleGroupCollapsed)
  const createFolder = useGroupsStore((s) => s.createFolder)
  const renameFolder = useGroupsStore((s) => s.renameFolder)
  const deleteFolder = useGroupsStore((s) => s.deleteFolder)
  const toggleFolderCollapsed = useGroupsStore((s) => s.toggleFolderCollapsed)
  const noteOrder = useGroupsStore((s) => s.noteOrder)
  const setContextNoteOrder = useGroupsStore((s) => s.setContextNoteOrder)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Note context menu ──────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<NoteContextMenuRequest | null>(null)

  // ── Group context menu ─────────────────────────────────────────────────────
  const [groupContextMenu, setGroupContextMenu] = useState<{
    x: number
    y: number
    groupId: string
  } | null>(null)

  // ── Folder context menu ────────────────────────────────────────────────────
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number
    y: number
    folderId: string
  } | null>(null)

  // ── Folder rename inline ───────────────────────────────────────────────────
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')

  // ── New folder inline input (per group; optional note to assign on create) ──
  const [newFolderInput, setNewFolderInput] = useState<{ groupId: string; noteId?: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')

  // ── Group rename inline ────────────────────────────────────────────────────
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')

  // ── New group inline input ─────────────────────────────────────────────────
  const [newGroupInput, setNewGroupInput] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // ── Group drag-to-reorder ──────────────────────────────────────────────────
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [groupDropTarget, setGroupDropTarget] = useState<{ groupId: string; position: 'before' | 'after' } | null>(null)

  // ── Confirm modal ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger: boolean
    onConfirm: () => void
  } | null>(null)

  const [keyboardResultIndex, setKeyboardResultIndex] = useState(-1)
  const [newNoteCtx, setNewNoteCtx] = useState<{ x: number; y: number } | null>(null)

  // ── Note reorder via drag & drop ───────────────────────────────────────────
  const [noteDropTarget, setNoteDropTarget] = useState<{
    noteId: string
    position: 'before' | 'after'
    contextKey: string
  } | null>(null)
  // ── Note move-to-group/folder via drag & drop ──────────────────────────────
  const [noteMoveTarget, setNoteMoveTarget] = useState<{ groupId: string; folderId?: string } | null>(null)
  const draggingNoteContextRef = useRef<string | null>(null)
  const draggingNoteIdRef = useRef<string | null>(null)

  // Live row callbacks (reassigned every render) behind a stable façade, so NoteRow's
  // memoization isn't defeated by new closure identities on each parent render.
  const rowApiRef = useRef<RowHandlers>({} as RowHandlers)
  const rowHandlers = useMemo<RowHandlers>(() => ({
    reorderDragOver: (e, note, ck) => rowApiRef.current.reorderDragOver(e, note, ck),
    reorderDragLeave: (id) => rowApiRef.current.reorderDragLeave(id),
    drop: (e, note, ck, fav) => rowApiRef.current.drop(e, note, ck, fav),
    dragStart: (e, id, ck) => rowApiRef.current.dragStart(e, id, ck),
    dragEnd: () => rowApiRef.current.dragEnd(),
    click: (e, note) => rowApiRef.current.click(e, note),
    contextMenu: (e, note) => rowApiRef.current.contextMenu(e, note),
    sectionClick: (e, note, sid) => rowApiRef.current.sectionClick(e, note, sid),
    sectionContextMenu: (e, note, sid) => rowApiRef.current.sectionContextMenu(e, note, sid),
  }), [])

  // ── Close menus on click elsewhere ────────────────────────────────────────
  useEffect(() => {
    const close = () => {
      setContextMenu(null)
      setGroupContextMenu(null)
      setFolderContextMenu(null)
      setNewNoteCtx(null)
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

  const { sectionFilter, textQuery: sectionTextQuery } = useMemo(
    () => parseSearchQuery(searchQuery),
    [searchQuery]
  )

  // Ids of archived groups — used to hide their notes (and headers) unless "Show archived"
  const archivedGroupIds = useMemo(
    () => new Set(groups.filter((g) => g.archived).map((g) => g.id)),
    [groups],
  )

  const notes = useMemo(() => {
    return rawNotes
      .filter((n) => showArchived || (!n.archived && !(n.group && archivedGroupIds.has(n.group))))
      .filter((n) => !filterTag || n.tags.includes(filterTag))
      .filter((n) => {
        if (!searchQuery.trim()) return true
        return noteMatchesQuery(n, { sectionFilter, textQuery: sectionTextQuery })
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
  }, [rawNotes, showArchived, filterTag, searchQuery, sectionFilter, sectionTextQuery, archivedGroupIds])

  const items = useSidebarGroups(notes, groups, folders, noteOrder)
  const visibleNoteIds = useMemo(() => {
    const ids: string[] = []
    for (const item of items) {
      if (item.kind === 'group') {
        ids.push(...item.notes.map((note) => note.id))
        for (const f of item.folders) ids.push(...f.notes.map((note) => note.id))
      } else {
        ids.push(item.note.id)
      }
    }
    return ids
  }, [items])
  const hasSearchFilter = searchQuery.trim().length > 0
  const hasTagFilter = Boolean(filterTag)
  const hasArchivedFilter = showArchived
  const hasActiveFilters = hasSearchFilter || hasTagFilter || hasArchivedFilter
  const scopedTotal = rawNotes.filter((n) => showArchived || !n.archived).length

  // Section headers ("groups" / "notes") mirror the favorites label. Compute the
  // first group that will actually render and the first ungrouped note, so each
  // header is emitted exactly once, right before its block.
  const hasFavorites = notes.some((n) => n.favorited)
  const firstRenderableGroupId = (() => {
    for (const it of items) {
      if (it.kind !== 'group') continue
      if (hasActiveFilters && it.visibleCount === 0) continue
      if (it.group.archived && !showArchived) continue
      return it.group.id
    }
    return null
  })()
  const firstUngroupedNoteId = (() => {
    for (const it of items) {
      if (it.kind === 'note') return it.note.id
    }
    return null
  })()
  // Only label the ungrouped remainder ("notes") when something sits above it —
  // a flat list with no favorites and no groups needs no header.
  const showNotesHeader = firstUngroupedNoteId != null && (hasFavorites || firstRenderableGroupId != null)
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
  function closeAllMenus() {
    setContextMenu(null)
    setGroupContextMenu(null)
    setFolderContextMenu(null)
  }

  async function createNoteInGroup(groupId: string) {
    await createNote({ group: groupId })
    closeAllMenus()
  }

  async function createNoteInFolder(groupId: string, folderId: string) {
    await createNote({ group: groupId, folder: folderId })
    closeAllMenus()
  }

  // Open the inline "new folder" input inside a group, expanding it if collapsed.
  function startNewFolder(groupId: string, noteId?: string) {
    if (collapsedGroupIds.has(groupId)) toggleGroupCollapsed(groupId)
    setNewFolderInput({ groupId, noteId })
    setNewFolderName('')
    closeAllMenus()
  }

  async function commitNewFolder() {
    if (!newFolderInput || !newFolderName.trim()) {
      setNewFolderInput(null)
      setNewFolderName('')
      return
    }
    const folder = await createFolder(newFolderInput.groupId, newFolderName.trim())
    if (newFolderInput.noteId) {
      await updateNote(newFolderInput.noteId, { group: newFolderInput.groupId, folder: folder.id })
    }
    setNewFolderInput(null)
    setNewFolderName('')
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

  function getNoteContextKey(note: (typeof rawNotes)[0], inFavorites?: boolean): string {
    if (inFavorites) return 'favorites'
    if (note.folder) return `folder:${note.folder}`
    if (note.group) return `group:${note.group}`
    return 'ungrouped'
  }

  function handleNoteDragStart(e: React.DragEvent<HTMLButtonElement>, noteId: string, contextKey: string) {
    e.dataTransfer.setData('application/x-noteflow-note-id', noteId)
    e.dataTransfer.setData('text/plain', noteId)
    e.dataTransfer.effectAllowed = 'copyMove'
    draggingNoteContextRef.current = contextKey
    draggingNoteIdRef.current = noteId
    window.dispatchEvent(new CustomEvent('noteflow:note-drag', {
      detail: { active: true, noteId },
    }))
  }

  function handleNoteDragEnd() {
    draggingNoteContextRef.current = null
    draggingNoteIdRef.current = null
    setNoteDropTarget(null)
    setNoteMoveTarget(null)
    window.dispatchEvent(new CustomEvent('noteflow:note-drag', {
      detail: { active: false },
    }))
  }

  // ── Note move to a different group/folder via drag & drop ──────────────────
  // Dropping a note onto a group (header or body) or a folder reassigns it.
  // Same-context drags are owned by the reorder handlers above (which stop
  // propagation), so these only fire when the note actually changes container.
  function moveTargetContextKey(groupId: string, folderId?: string): string {
    return folderId ? `folder:${folderId}` : `group:${groupId}`
  }

  function handleNoteMoveDragOver(e: React.DragEvent, groupId: string, folderId?: string) {
    if (!draggingNoteIdRef.current) return
    if (draggingNoteContextRef.current === moveTargetContextKey(groupId, folderId)) return
    e.preventDefault()
    if (folderId) e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setNoteMoveTarget((prev) =>
      prev?.groupId === groupId && prev.folderId === folderId ? prev : { groupId, folderId }
    )
  }

  function handleNoteMoveDragLeave(e: React.DragEvent, groupId: string, folderId?: string) {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setNoteMoveTarget((prev) =>
      prev?.groupId === groupId && prev.folderId === folderId ? null : prev
    )
  }

  function handleNoteMoveDrop(e: React.DragEvent, groupId: string, folderId?: string) {
    if (!draggingNoteIdRef.current) return
    if (draggingNoteContextRef.current === moveTargetContextKey(groupId, folderId)) {
      setNoteMoveTarget(null)
      return
    }
    e.preventDefault()
    if (folderId) e.stopPropagation()
    const noteId =
      e.dataTransfer.getData('application/x-noteflow-note-id') ||
      e.dataTransfer.getData('text/plain')
    setNoteMoveTarget(null)
    if (!noteId) return
    void updateNote(noteId, { group: groupId, folder: folderId })
  }

  function handleNoteReorderDragOver(e: React.DragEvent<HTMLLIElement>, note: (typeof rawNotes)[0], contextKey: string) {
    if (!draggingNoteContextRef.current) return
    if (draggingNoteContextRef.current !== contextKey) return
    if (draggingNoteIdRef.current === note.id) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setNoteDropTarget((prev) =>
      prev?.noteId === note.id && prev.position === position ? prev : { noteId: note.id, position, contextKey }
    )
  }

  function handleNoteReorderDrop(e: React.DragEvent<HTMLLIElement>, targetNote: (typeof rawNotes)[0], contextKey: string) {
    // Cross-context drops are handled by the group/folder move zones (which this
    // would otherwise bubble into); only reorder within the same context here.
    if (draggingNoteContextRef.current && draggingNoteContextRef.current !== contextKey) {
      setNoteDropTarget(null)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const draggedId = e.dataTransfer.getData('application/x-noteflow-note-id')
    if (!draggedId || draggedId === targetNote.id) { setNoteDropTarget(null); return }
    const position = noteDropTarget?.noteId === targetNote.id ? noteDropTarget.position : 'after'
    setNoteDropTarget(null)

    // Compute the ordered list for this context from the currently visible notes
    const contextNotes = items.flatMap((item) => {
      if (contextKey === 'ungrouped' && item.kind === 'note') return [item.note]
      if (contextKey.startsWith('favorites')) return []
      if (item.kind === 'group') {
        if (contextKey === `group:${item.group.id}`) return item.notes
        const folder = item.folders.find((f) => contextKey === `folder:${f.folder.id}`)
        if (folder) return folder.notes
      }
      return []
    })

    const currentIds = contextNotes.map((n) => n.id)
    const without = currentIds.filter((id) => id !== draggedId)
    let targetIndex = without.indexOf(targetNote.id)
    if (targetIndex === -1) { setNoteDropTarget(null); return }
    if (position === 'after') targetIndex += 1
    without.splice(targetIndex, 0, draggedId)
    void setContextNoteOrder(contextKey, without)
  }

  function handleFavoritesReorderDrop(e: React.DragEvent<HTMLLIElement>, targetNote: (typeof rawNotes)[0]) {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('application/x-noteflow-note-id')
    if (!draggedId || draggedId === targetNote.id) { setNoteDropTarget(null); return }
    const position = noteDropTarget?.noteId === targetNote.id ? noteDropTarget.position : 'after'
    setNoteDropTarget(null)

    const favoriteNotes = notes.filter((n) => n.favorited)
    const currentIds = (noteOrder['favorites'] ?? favoriteNotes.map((n) => n.id))
      .filter((id) => favoriteNotes.some((n) => n.id === id))
    const without = currentIds.filter((id) => id !== draggedId)
    let targetIndex = without.indexOf(targetNote.id)
    if (targetIndex === -1) { setNoteDropTarget(null); return }
    if (position === 'after') targetIndex += 1
    without.splice(targetIndex, 0, draggedId)
    void setContextNoteOrder('favorites', without)
  }

  // ── Group reorder via drag & drop ──────────────────────────────────────────
  function handleGroupDragStart(e: React.DragEvent, groupId: string) {
    e.dataTransfer.setData('application/x-noteflow-group-id', groupId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingGroupId(groupId)
  }

  function handleGroupDragOver(e: React.DragEvent, groupId: string) {
    if (!draggingGroupId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (groupId === draggingGroupId) {
      setGroupDropTarget(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setGroupDropTarget((prev) =>
      prev?.groupId === groupId && prev.position === position ? prev : { groupId, position }
    )
  }

  function handleGroupDragEnd() {
    setDraggingGroupId(null)
    setGroupDropTarget(null)
  }

  function handleGroupDrop(e: React.DragEvent, targetId: string) {
    if (!draggingGroupId) return
    e.preventDefault()
    const dragged = draggingGroupId
    const position = groupDropTarget?.groupId === targetId ? groupDropTarget.position : 'before'
    handleGroupDragEnd()
    if (dragged === targetId) return

    const ordered = [...groups].sort((a, b) => a.order - b.order).map((g) => g.id)
    const without = ordered.filter((id) => id !== dragged)
    let targetIndex = without.indexOf(targetId)
    if (targetIndex === -1) return
    if (position === 'after') targetIndex += 1
    without.splice(targetIndex, 0, dragged)
    void reorderGroups(without)
  }

  function renderNoteButton(note: Note, group?: { id: string; color: GroupColor } | null, indent?: number, inFavorites?: boolean, wrapperClassName?: string) {
    // When the note overview is open the editor is hidden, so the highlighted
    // note must follow that view; otherwise fall back to the active editor note.
    const isActive = noteViewId != null ? noteViewId === note.id : activeNoteId === note.id
    const isSearchTarget = activeSearchNoteId === note.id
    const contextKey = getNoteContextKey(note, inFavorites)
    const isDropBefore = noteDropTarget?.noteId === note.id && noteDropTarget.position === 'before'
    const isDropAfter = noteDropTarget?.noteId === note.id && noteDropTarget.position === 'after'
    return (
      <NoteRow
        key={inFavorites ? `fav-${note.id}` : note.id}
        note={note}
        groupColor={group?.color ?? null}
        indent={indent}
        inFavorites={inFavorites}
        wrapperClassName={wrapperClassName}
        contextKey={contextKey}
        isActive={isActive}
        isSearchTarget={isSearchTarget}
        isDropBefore={isDropBefore}
        isDropAfter={isDropAfter}
        searchQuery={searchQuery}
        sectionFilter={sectionFilter}
        sectionTagColors={sectionTagColors}
        handlers={rowHandlers}
      />
    )
  }

  function renderFolder(group: { id: string; color: GroupColor }, sf: SidebarFolder) {
    const { folder, notes: folderNotes } = sf
    const collapsed = collapsedFolderIds.has(folder.id)
    if (hasActiveFilters && folderNotes.length === 0) return null
    const isMoveTarget = noteMoveTarget?.folderId === folder.id
    return (
      <div
        key={`folder-${folder.id}`}
        className="rounded-md"
        onDragOver={(e) => handleNoteMoveDragOver(e, group.id, folder.id)}
        onDragLeave={(e) => handleNoteMoveDragLeave(e, group.id, folder.id)}
        onDrop={(e) => handleNoteMoveDrop(e, group.id, folder.id)}
        style={
          isMoveTarget
            ? { boxShadow: `inset 0 0 0 1.5px rgb(${colorChannels(group.color)} / 0.7)`, background: `rgb(${colorChannels(group.color)} / 0.07)` }
            : undefined
        }
      >
        {editingFolderId === folder.id ? (
          <div className="flex items-center gap-1.5 pl-2.5 pr-2 py-1">
            <FolderOpen size={12} className="flex-shrink-0" fill={`rgb(${colorChannels(group.color)} / 0.22)`} style={{ color: `rgb(${colorChannels(group.color)})` }} />
            <input
              autoFocus
              value={editingFolderName}
              onChange={(e) => setEditingFolderName(e.target.value)}
              onBlur={() => {
                if (editingFolderName.trim()) renameFolder(folder.id, editingFolderName.trim())
                setEditingFolderId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (editingFolderName.trim()) renameFolder(folder.id, editingFolderName.trim())
                  setEditingFolderId(null)
                }
                if (e.key === 'Escape') setEditingFolderId(null)
              }}
              className="flex-1 text-[11.5px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <NoteFolderHeader
            folder={folder}
            groupColor={group.color}
            noteCount={folderNotes.length}
            collapsed={collapsed}
            onToggle={() => toggleFolderCollapsed(folder.id)}
            onContextMenu={(e) => {
              setFolderContextMenu({ x: e.clientX, y: e.clientY, folderId: folder.id })
            }}
          />
        )}

        {/* Animated collapsible body with a colored guide line */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: collapsed ? '0fr' : '1fr',
            transition: 'grid-template-rows 180ms ease',
          }}
        >
          <div style={{ overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: '14px', top: '3px', bottom: '5px',
              width: '1px',
              background: `rgb(${colorChannels(group.color)} / 0.22)`,
              pointerEvents: 'none',
              zIndex: 1,
            }} />
            <ul className="flex flex-col gap-0.5 mt-0.5">
              {folderNotes.map((note) => renderNoteButton(note, group, 26))}
              {folderNotes.length === 0 && (
                <li>
                  <button
                    onClick={() => createNoteInFolder(group.id, folder.id)}
                    className="w-full text-left pl-[26px] pr-2.5 py-2 text-xs font-mono text-text-muted hover:text-text flex items-center gap-1.5 transition-colors"
                  >
                    <Plus size={10} />
                    {t.common.newNote}
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  // Refresh the live row-behavior closures after every render (synchronously, before any
  // user interaction). NoteRow only ever sees the stable `rowHandlers` façade above, which
  // forwards to whatever lives here now — keeping each row's props stable so memoization
  // holds while these closures still read current state (items, noteOrder, …).
  useLayoutEffect(() => {
    rowApiRef.current = {
      reorderDragOver: (e, note, contextKey) => handleNoteReorderDragOver(e, note, contextKey),
      reorderDragLeave: (noteId) => setNoteDropTarget((prev) => (prev?.noteId === noteId ? null : prev)),
      drop: (e, note, contextKey, inFavorites) =>
        inFavorites ? handleFavoritesReorderDrop(e, note) : handleNoteReorderDrop(e, note, contextKey),
      dragStart: (e, noteId, contextKey) => handleNoteDragStart(e, noteId, contextKey),
      dragEnd: () => handleNoteDragEnd(),
      contextMenu: (e, note) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id, sectionId: null })
      },
      sectionContextMenu: (e, note, sectionId) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id, sectionId })
      },
      click: (e, note) => {
        if (e.ctrlKey || e.metaKey) {
          openNoteInSplit(note.id)
          return
        }
        // Clicking the note itself opens the note overview (every section with a content
        // preview). With a single section there's nothing to choose, so go straight to it.
        // Clicking a section tag (sectionClick) always jumps to that section regardless.
        if (note.sections.length > 1) {
          setNoteView(note.id)
          return
        }
        setOpenNoteIds([note.id])
        setActiveNote(note.id)
      },
      sectionClick: (e, note, sectionId) => {
        e.stopPropagation()
        // Ctrl/Cmd+click opens THIS section in a pane of its own, even when the note is
        // already open in another pane (two sections of one note side by side); a pane
        // already on exactly this section is just focused. No request-section event here:
        // it would make the existing pane of the note jump to the section too.
        if (e.ctrlKey || e.metaKey) {
          openNoteInSplit(note.id, sectionId)
          return
        }
        // The synchronous request-section event serves the case where the target editor is
        // already mounted and stays mounted (e.g. clicking another section of the single
        // open note): it jumps there immediately. When the click remounts the editor the
        // event is lost (it reaches the editor that's about to unmount), so we also stash
        // the target section below.
        window.dispatchEvent(new CustomEvent('noteflow:request-section', {
          detail: { noteId: note.id, sectionId },
        }))
        // A normal click collapses the layout to this single note. The editor remounts when
        // the group / note overview or brain view is open (editor unmounted), OR when a split
        // with more than one open pane is collapsed to one — in both cases the synchronous
        // event above never reaches the freshly mounted editor. Stash the target section (the
        // editor reads it on mount, prioritised over the last-visited one) and re-emit once
        // it's listening (next macrotask) — same as GroupOverview / BrainView.
        const { groupViewId, noteViewId: nv, brainViewOpen, openPanes } = useNotesStore.getState()
        const editorUnmounted = groupViewId !== null || nv !== null || brainViewOpen
        const willRemount = editorUnmounted || openPanes.length > 1
        if (willRemount) {
          useNotesStore.setState({ pendingInitialSectionId: sectionId })
        }
        setOpenNoteIds([note.id])
        setActiveNote(note.id)
        if (willRemount) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('noteflow:request-section', {
              detail: { noteId: note.id, sectionId },
            }))
          }, 0)
        }
      },
    }
  })

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
      <NoteContextMenu request={contextMenu} onClose={() => setContextMenu(null)} />

      {/* ── Search + collapse ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            type="text"
            placeholder={t.sidebar.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pl-7 pr-7 py-1.5 bg-surface-2 border border-border rounded text-xs
                       font-mono text-text placeholder-text-muted/40 outline-none
                       focus:border-text/30 transition-colors caret-text"
          />
          {hasSearchFilter && (
            <button
              onClick={() => setSearchQuery('')}
              title={t.sidebar.clearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <button
          onClick={onCollapse}
          title={t.sidebar.collapseSidebar}
          className="flex-shrink-0 p-1.5 rounded text-text-muted/50 hover:text-text-muted
                     hover:bg-surface-2 transition-colors"
        >
          <PanelLeftClose size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── New note / new group buttons ────────────────────────────────────── */}
      <div className="px-3 pt-0.5 pb-2 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => createNote()}
            onContextMenu={(e) => { e.preventDefault(); setNewNoteCtx({ x: e.clientX, y: e.clientY }) }}
            title={t.sidebar.newNoteTooltip}
            className="flex-1 py-1.5 rounded text-xs font-mono transition-all
                       bg-text/[0.12] text-text border border-text/20
                       hover:bg-text/[0.18] hover:border-text/30"
          >
            {t.sidebar.newNoteButton}
          </button>
          <button
            onClick={() => createTempNote()}
            title={t.sidebar.newTempNoteTooltip}
            className="flex-shrink-0 p-1.5 rounded text-text-muted/50 border border-border
                       hover:text-text-muted hover:bg-surface-2 hover:border-border transition-colors"
          >
            <Timer size={14} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => { setNewGroupInput(true); setNewGroupName('') }}
            title={t.sidebar.newGroup}
            className="flex-shrink-0 p-1.5 rounded text-text-muted/50 border border-border
                       hover:text-text-muted hover:bg-surface-2 hover:border-border transition-colors"
          >
            <FolderPlus size={14} strokeWidth={2.5} />
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
            placeholder={t.common.groupNamePlaceholder}
            className="w-full px-2 py-1 text-xs font-mono bg-surface-1 border border-text/25 rounded outline-none text-text placeholder-text-muted/40 caret-text"
          />
        )}
      </div>

      {/* ── All content view ───────────────────────────────────────────────── */}
      <div className="px-3 pt-1.5 pb-0.5">
        <button
          onClick={() => setAllView(true)}
          title={t.sidebar.viewAllContent}
          className="w-full flex items-center justify-start gap-1.5 px-2 py-0.5 rounded text-xs font-mono
                     transition-colors hover:bg-surface-2"
          style={{ color: 'rgb(var(--text-muted))' }}
        >
          <LayoutGrid size={13} />
          {t.common.allContent}
        </button>
      </div>

      {/* ── Notes list ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto notes-list-scroll">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted gap-2">
            <span className="text-2xl opacity-20">∅</span>
            <span className="text-xs font-mono">{rawNotes.length > 0 ? t.sidebar.noNotesMatch : t.sidebar.noNotes}</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2.5 pt-2 pb-8">
            {/* ── Favorites section ───────────────────────────────────────── */}
            {(() => {
              const allFavorites = notes.filter((n) => n.favorited)
              if (allFavorites.length === 0) return null
              const favOrder = noteOrder['favorites']
              const favoriteNotes = favOrder
                ? [...favOrder.map((id) => allFavorites.find((n) => n.id === id)).filter((n): n is typeof allFavorites[0] => n != null),
                   ...allFavorites.filter((n) => !favOrder.includes(n.id))]
                : allFavorites
              return (
                <>
                  <li className="px-1 pt-0.5 pb-0.5">
                    <span className="text-[10px] font-mono text-text-muted/50 uppercase tracking-widest">{t.sidebar.favoritesHeader}</span>
                  </li>
                  {favoriteNotes.map((note) => {
                    const noteGroup = note.group ? groups.find((g) => g.id === note.group) ?? null : null
                    return renderNoteButton(note, noteGroup, undefined, true)
                  })}
                </>
              )
            })()}
            {items.map((item) => {
              if (item.kind === 'group') {
                const { group, notes: groupNotes, folders: groupFolders } = item
                const collapsed = collapsedGroupIds.has(group.id)
                if (hasActiveFilters && item.visibleCount === 0) return null
                // Archived groups are hidden unless "Show archived" is on (then shown dimmed)
                if (group.archived && !showArchived) return null
                const isFirstGroup = group.id === firstRenderableGroupId
                return (
                  <Fragment key={`group-${group.id}`}>
                    {isFirstGroup && (
                      <li className="px-1 pt-0.5 pb-0.5 first:mt-0 mt-5">
                        <span className="text-[10px] font-mono text-text-muted/50 uppercase tracking-widest">{t.sidebar.groupsHeader}</span>
                      </li>
                    )}
                  <li
                    className={`${isFirstGroup ? '' : 'first:mt-0 mt-1.5'} ${group.archived ? 'opacity-50' : ''} rounded-md`}
                    onDragOver={(e) => handleNoteMoveDragOver(e, group.id)}
                    onDragLeave={(e) => handleNoteMoveDragLeave(e, group.id)}
                    onDrop={(e) => handleNoteMoveDrop(e, group.id)}
                    style={
                      noteMoveTarget?.groupId === group.id && !noteMoveTarget.folderId
                        ? { boxShadow: `inset 0 0 0 1.5px rgb(${colorChannels(group.color)} / 0.7)`, background: `rgb(${colorChannels(group.color)} / 0.07)` }
                        : undefined
                    }
                  >
                    {/* Group header / rename input — draggable to reorder groups */}
                    <div
                      style={{ position: 'relative', opacity: draggingGroupId === group.id ? 0.4 : 1 }}
                      draggable={editingGroupId !== group.id}
                      onDragStart={(e) => handleGroupDragStart(e, group.id)}
                      onDragOver={(e) => handleGroupDragOver(e, group.id)}
                      onDrop={(e) => handleGroupDrop(e, group.id)}
                      onDragEnd={handleGroupDragEnd}
                    >
                      {/* Drop insertion indicator */}
                      {groupDropTarget?.groupId === group.id && (
                        <div style={{
                          position: 'absolute',
                          left: 0, right: 0,
                          [groupDropTarget.position === 'before' ? 'top' : 'bottom']: -5,
                          height: '2px',
                          borderRadius: '2px',
                          background: 'rgb(var(--text) / 0.5)',
                          zIndex: 5,
                          pointerEvents: 'none',
                        }} />
                      )}
                      {editingGroupId === group.id ? (
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: `rgb(${colorChannels(group.color)})` }}
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
                            className="flex-1 text-[11px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      ) : (
                        <NoteGroupHeader
                          group={group}
                          noteCount={item.visibleCount}
                          collapsed={collapsed}
                          onToggle={() => toggleGroupCollapsed(group.id)}
                          onOpenGroupView={() => setGroupView(group.id)}
                          onContextMenu={(e) => {
                            setGroupContextMenu({ x: e.clientX, y: e.clientY, groupId: group.id })
                          }}
                        />
                      )}
                    </div>

                    {/* Animated container */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateRows: collapsed ? '0fr' : '1fr',
                        transition: 'grid-template-rows 180ms ease',
                      }}
                    >
                      {/* overflow:hidden reveals the notes top→bottom as the grid expands */}
                      <div style={{ overflow: 'hidden', position: 'relative' }}>
                        {/* Group guide line — sits one level left of the folder guides */}
                        <div style={{
                          position: 'absolute',
                          left: '1px', top: '3px', bottom: '5px',
                          width: '1px',
                          background: `rgb(${colorChannels(group.color)} / 0.5)`,
                          pointerEvents: 'none',
                          zIndex: 1,
                        }} />
                        {/* Inline "new folder" input */}
                        {newFolderInput?.groupId === group.id && (
                          <div className="flex items-center gap-1.5 pl-2.5 pr-2 py-1">
                            <Folder size={12} className="flex-shrink-0" fill={`rgb(${colorChannels(group.color)} / 0.16)`} style={{ color: `rgb(${colorChannels(group.color)})` }} />
                            <input
                              autoFocus
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void commitNewFolder()
                                if (e.key === 'Escape') { setNewFolderInput(null); setNewFolderName('') }
                              }}
                              onBlur={() => void commitNewFolder()}
                              placeholder={t.common.folderNamePlaceholder}
                              className="flex-1 text-[11.5px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text placeholder-text-muted/40"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}
                        <ul className="flex flex-col gap-0.5 mt-0.5">
                          {groupNotes.map((note) => renderNoteButton(note, group))}
                          {groupNotes.length === 0 && groupFolders.length === 0 && !newFolderInput && (
                            <li>
                              <button
                                onClick={() => createNoteInGroup(group.id)}
                                className="w-full text-left px-2.5 py-2 text-xs font-mono text-text-muted hover:text-text flex items-center gap-1.5 transition-colors"
                              >
                                <Plus size={10} />
                                {t.common.newNote}
                              </button>
                            </li>
                          )}
                        </ul>
                        {/* Subfolders */}
                        {groupFolders.length > 0 && (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {groupFolders.map((sf) => renderFolder(group, sf))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                  </Fragment>
                )
              }

              // kind === 'note' (ungrouped)
              if (showNotesHeader && item.note.id === firstUngroupedNoteId) {
                return (
                  <Fragment key={`note-${item.note.id}`}>
                    <li className="px-1 pt-0.5 pb-0.5 first:mt-0 mt-5">
                      <span className="text-[10px] font-mono text-text-muted/50 uppercase tracking-widest">{t.sidebar.notesHeader}</span>
                    </li>
                    {renderNoteButton(item.note, null)}
                  </Fragment>
                )
              }
              return renderNoteButton(item.note, null)
            })}
          </ul>
        )}
      </div>

      {/* ── New note context menu ───────────────────────────────────────────── */}
      {newNoteCtx && (
        <ContextMenu
          x={newNoteCtx.x}
          y={newNoteCtx.y}
          className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-52 animate-in fade-in zoom-in duration-100"
        >
          <button
            onClick={() => { createTempNote(); setNewNoteCtx(null) }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            <Timer size={12} />
            {t.sidebar.tempNote24h}
          </button>
        </ContextMenu>
      )}

      {/* ── Group Context Menu ───────────────────────────────────────────────── */}
      {groupContextMenu && (() => {
        const group = groups.find(g => g.id === groupContextMenu.groupId)
        if (!group) return null
        return (
          <ContextMenu
            x={groupContextMenu.x}
            y={groupContextMenu.y}
            className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-44 overflow-hidden animate-in fade-in zoom-in duration-100"
          >
            <button
              onClick={(e) => { e.stopPropagation(); setGroupView(group.id); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <LayoutGrid size={12} />
              {t.sidebar.viewGroup}
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => { e.stopPropagation(); createNoteInGroup(group.id) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Plus size={12} />
              {t.common.newNote}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); startNewFolder(group.id) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <FolderPlus size={12} />
              {t.common.newFolder}
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingGroupId(group.id)
                setEditingGroupName(group.name)
                setGroupContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              {t.common.renameGroup}
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
                      void setGroupColor(group.id, color)
                      setGroupContextMenu(null)
                    }}
                    className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${group.color === color ? 'ring-1 ring-white/50 ring-offset-1 ring-offset-surface-2' : ''}`}
                    style={{ background: `rgb(${colorChannels(color)})` }}
                  />
                ))}
                <CustomColorSwatch
                  value={group.color}
                  onPick={(c) => { void setGroupColor(group.id, c) }}
                />
              </div>
            </div>

            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleGroupArchived(group.id)
                setGroupContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              {group.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
              {group.archived ? t.common.unarchiveGroup : t.sidebar.archiveGroup}
            </button>

            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setGroupContextMenu(null)
                setModal({
                  title: t.sidebar.deleteGroup,
                  message: tf(t.sidebar.deleteGroupMessage, { name: group.name }),
                  confirmLabel: t.common.delete,
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
              {t.sidebar.deleteGroup}
            </button>
          </ContextMenu>
        )
      })()}

      {/* ── Folder Context Menu ──────────────────────────────────────────────── */}
      {folderContextMenu && (() => {
        const folder = folders.find(f => f.id === folderContextMenu.folderId)
        if (!folder) return null
        return (
          <ContextMenu
            x={folderContextMenu.x}
            y={folderContextMenu.y}
            className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-44 overflow-hidden animate-in fade-in zoom-in duration-100"
          >
            <button
              onClick={(e) => { e.stopPropagation(); createNoteInFolder(folder.groupId, folder.id) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Plus size={12} />
              {t.common.newNote}
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingFolderId(folder.id)
                setEditingFolderName(folder.name)
                setFolderContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              {t.common.renameFolder}
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFolderContextMenu(null)
                setModal({
                  title: t.common.deleteFolder,
                  message: tf(t.common.deleteFolderMessage, { name: folder.name }),
                  confirmLabel: t.common.delete,
                  danger: true,
                  onConfirm: () => { setModal(null); deleteFolder(folder.id) },
                })
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-red-400 hover:bg-red-400/10 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={12} />
              {t.common.deleteFolder}
            </button>
          </ContextMenu>
        )
      })()}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-t border-border flex items-center justify-between">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-1 text-xs font-mono transition-colors
            ${showArchived ? 'text-text' : 'text-text-muted hover:text-text'}`}
        >
          <Archive size={10} />
          {showArchived ? t.sidebar.hideArchived : t.sidebar.showArchived}
        </button>
        <span className="text-xs font-mono text-text-muted/40">
          {hasActiveFilters
            ? tf(t.sidebar.notesCountFiltered, { count: notes.length, total: scopedTotal })
            : tf(t.sidebar.notesCount, { count: notes.length })}
        </span>
      </div>
    </div>
  )
}
