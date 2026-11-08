import { Fragment, memo, useCallback, useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { Archive, Search, PanelLeftClose, PanelLeftOpen, Lock, FolderPlus, X, Plus, Timer, LayoutGrid, Star } from 'lucide-react'
import { ContextMenu } from '../ContextMenu'
import { NoteContextMenu, type NoteContextMenuRequest } from '../NoteContextMenu'
import { GroupContextMenu, type GroupContextMenuRequest } from '../GroupContextMenu'
import { FolderContextMenu, type FolderContextMenuRequest } from '../FolderContextMenu'
import { colorChannels, NEW_GROUP_COLOR, resolveGroupColor } from '../../lib/tagColors'
import { ALL_PLACE, groupPlace } from '../../lib/contentView'
import {
  buildMiniSidebarRows,
  isSidebarFolderShown,
  isSidebarGroupShown,
  orderFavorites,
  type MiniSidebarRow,
} from '../../lib/miniSidebar'
import { modKey } from '../../lib/platform'
import { parseSearchQuery, noteMatchesQuery } from '../../lib/searchUtils'
import { NoteGroupHeader } from './NoteGroupHeader'
import { NoteFolderHeader, FolderGlyph, FolderIcon } from './NoteFolderHeader'
import { GroupGuides } from './GroupGuides'
import { DROP_SPRING_OPEN_MS, dropChangesPlace, staggerStep } from '../../lib/sidebarGuides'
import { useSidebarGroups, type SidebarFolder } from './useSidebarGroups'
import { SectionTabsRow } from './SectionTabsRow'
import { NoteSectionMap } from './NoteSectionMap'
import { RowShiftFlip } from './NoteSectionFlip'
import { resolveOpenSectionId } from '../../lib/sectionLine'
import { useOpenNoteSection } from './useOpenNoteSection'
import { useThemeStore, type SidebarSectionsStyle } from '../../stores/themeStore'
import { GroupPeek, type GroupPeekController } from './GroupPeek'
import { formatExpiry, formatNoteDate, renderHighlightedText } from './rowText'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { GroupColor, Note } from '../../types'
import type { TagColorMap } from '../../lib/tagColors'

interface SidebarProps {
  /** Docked in the layout (true) or floating over the content (false). */
  pinned: boolean
  /** The pin switch next to the search box (docked â‡„ floating; with `hideOnly`, it hides the sidebar). */
  onTogglePinned: () => void
  /** Brain view: the button only hides the sidebar â€” a plain "collapse" button, not a pressed switch. */
  hideOnly?: boolean
  /** Receives the mini-view rows (lib/miniSidebar.ts) â€” passed by SidebarShell only while floating. */
  onMiniRows?: (rows: MiniSidebarRow[]) => void
}

// Stable row callbacks shared by every NoteRow. The Sidebar keeps a ref to the live
// implementations and exposes this fixed-identity object so the memoized rows never
// re-render just because the parent re-rendered (e.g. on every editor keystroke).
interface RowHandlers {
  reorderDragOver: (e: React.DragEvent<HTMLLIElement>, note: Note, contextKey: string) => void
  reorderDragLeave: (noteId: string) => void
  drop: (e: React.DragEvent<HTMLLIElement>, note: Note, contextKey: string, inFavorites: boolean) => void
  dragStart: (e: React.DragEvent<HTMLButtonElement>, noteId: string, contextKey: string) => void
  dragEnd: () => void
  // Also fired by Enter in the collapsed-group peek (GroupPeek) â€” only the modifiers are read.
  click: (e: React.MouseEvent | React.KeyboardEvent, note: Note) => void
  contextMenu: (e: React.MouseEvent, note: Note) => void
  sectionClick: (e: React.MouseEvent, note: Note, sectionId: string) => void
  sectionContextMenu: (e: React.MouseEvent, note: Note, sectionId: string) => void
}

interface NoteRowProps {
  note: Note
  /** Favorites only: colour and name of the note's group (small tab before the title). */
  groupColor: GroupColor | null
  groupName?: string
  indent?: number
  /** Position in its group/folder body (capped): unfold stagger delay. */
  staggerIndex?: number
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
  /** Section open on the note when it's the active one (null on every other row). */
  openSectionId: string | null
  /** Appearance setting: folded section map (default) or the horizontal-scroll row. */
  sectionsStyle: SidebarSectionsStyle
  handlers: RowHandlers
}

// A single note row in the sidebar. Memoized so that with a large vault only the rows
// whose note object (or flags) actually changed re-render â€” editing one note no longer
// reconciles all the others. All dynamic-per-render behavior arrives via the stable
// `handlers` object; everything else is a primitive/stable prop.
const NoteRow = memo(function NoteRow({
  note,
  groupColor,
  groupName,
  indent,
  staggerIndex,
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
  openSectionId,
  sectionsStyle,
  handlers,
}: NoteRowProps) {
  const t = useT()
  return (
    <li
      data-note-row
      style={{ position: 'relative', ...(staggerIndex != null ? { '--i': staggerIndex } : {}) } as React.CSSProperties}
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
          // Neutral: the group colour is carried by the guide cursor and the section map.
          ...(isActive ? { background: 'rgb(var(--text) / 0.07)' } : {}),
          ...(isSearchTarget && !isActive ? { background: 'rgb(var(--text) / 0.06)' } : {}),
        }}
        title={t.sidebar.openSideBySide}
      >
        <div className="flex items-center gap-1 min-w-0">
          {inFavorites && groupColor && (
            <i
              className="sbg-tab is-small mr-0.5"
              title={groupName}
              style={{ '--g': colorChannels(groupColor) } as React.CSSProperties}
            />
          )}
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
        {sectionsStyle === 'row' ? (
          <SectionTabsRow
            noteId={note.id}
            sections={note.sections}
            searchQuery={searchQuery}
            sectionFilter={sectionFilter}
            sectionTagColors={sectionTagColors}
            activeSectionId={openSectionId}
            onSectionClick={(sectionId, e) => handlers.sectionClick(e, note, sectionId)}
            onSectionContextMenu={(e, sectionId) => handlers.sectionContextMenu(e, note, sectionId)}
          />
        ) : (
          <NoteSectionMap
            note={note}
            isActive={isActive}
            openSectionId={openSectionId}
            searchQuery={searchQuery}
            sectionTagColors={sectionTagColors}
            handlers={handlers}
          />
        )}
      </button>
    </li>
  )
})

export function Sidebar({ pinned, onTogglePinned, hideOnly = false, onMiniRows }: SidebarProps) {
  const t = useT()
  const rawNotes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const noteViewId = useNotesStore((s) => s.noteViewId)
  const searchQuery = useNotesStore((s) => s.searchQuery)
  const filterTag = useNotesStore((s) => s.filterTag)
  const showArchived = useNotesStore((s) => s.showArchived)

  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setContentView = useNotesStore((s) => s.setContentView)
  const updateNote = useNotesStore((s) => s.updateNote)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setShowArchived = useNotesStore((s) => s.setShowArchived)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const openNoteInSplit = useNotesStore((s) => s.openNoteInSplit)
  const createNote = useNotesStore((s) => s.createNote)
  const createTempNote = useNotesStore((s) => s.createTempNote)

  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const sectionsStyle = useThemeStore((s) => s.sidebarSectionsStyle)
  // Section the editor stands on for the note shown as open (= the highlighted row):
  // primitives, so typing doesn't re-render the rows. Resolved per row in renderNoteButton.
  const { paneSectionId: openRowPaneSectionId, rememberedSectionId: openRowRememberedSectionId } = useOpenNoteSection()

  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const collapsedGroupIds = useGroupsStore((s) => s.collapsedGroupIds)
  const collapsedFolderIds = useGroupsStore((s) => s.collapsedFolderIds)
  const createGroup = useGroupsStore((s) => s.createGroup)
  const renameGroup = useGroupsStore((s) => s.renameGroup)
  const reorderGroups = useGroupsStore((s) => s.reorderGroups)
  const toggleGroupCollapsed = useGroupsStore((s) => s.toggleGroupCollapsed)
  const createFolder = useGroupsStore((s) => s.createFolder)
  const renameFolder = useGroupsStore((s) => s.renameFolder)
  const toggleFolderCollapsed = useGroupsStore((s) => s.toggleFolderCollapsed)
  const noteOrder = useGroupsStore((s) => s.noteOrder)
  const setContextNoteOrder = useGroupsStore((s) => s.setContextNoteOrder)

  const searchRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // â”€â”€ Collapsed-group peek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Its open/close state lives in GroupPeek; headers only get these stable handlers.
  const peekRef = useRef<GroupPeekController>(null)
  const peekHover = useCallback((groupId: string, el: HTMLElement) => peekRef.current?.headerHover(groupId, el), [])
  const peekLeave = useCallback(() => peekRef.current?.headerLeave(), [])

  // â”€â”€ Note context menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [contextMenu, setContextMenu] = useState<NoteContextMenuRequest | null>(null)

  // â”€â”€ Group context menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [groupContextMenu, setGroupContextMenu] = useState<GroupContextMenuRequest | null>(null)
  const closeGroupMenu = useCallback(() => setGroupContextMenu(null), [])

  // â”€â”€ Folder context menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuRequest | null>(null)
  const closeFolderMenu = useCallback(() => setFolderContextMenu(null), [])

  // â”€â”€ Folder rename inline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')

  // â”€â”€ New folder inline input (per group; optional note to assign on create) â”€â”€
  const [newFolderInput, setNewFolderInput] = useState<{ groupId: string; noteId?: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')

  // â”€â”€ Group rename inline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')

  // â”€â”€ New group inline input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [newGroupInput, setNewGroupInput] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // â”€â”€ Group drag-to-reorder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [groupDropTarget, setGroupDropTarget] = useState<{ groupId: string; position: 'before' | 'after' } | null>(null)

  const [keyboardResultIndex, setKeyboardResultIndex] = useState(-1)
  const [newNoteCtx, setNewNoteCtx] = useState<{ x: number; y: number } | null>(null)

  // â”€â”€ Note reorder via drag & drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [noteDropTarget, setNoteDropTarget] = useState<{
    noteId: string
    position: 'before' | 'after'
    contextKey: string
  } | null>(null)
  // â”€â”€ Note move-to-group/folder via drag & drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // noteId = the dragged note (to tell whether the target already holds it: "Drop in …" slot).
  const [noteMoveTarget, setNoteMoveTarget] = useState<{ groupId: string; folderId?: string; noteId: string } | null>(null)
  const draggingNoteContextRef = useRef<string | null>(null)
  const draggingNoteIdRef = useRef<string | null>(null)

  // Live row callbacks (reassigned every render) behind a stable faÃ§ade, so NoteRow's
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

  // â”€â”€ Close menus on click elsewhere â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Dragging a note over a collapsed group/folder opens it after a short hold (persisted,
  // as if the user had opened it). Leaving the target first cancels it.
  const moveTargetGroupId = noteMoveTarget?.groupId ?? null
  const moveTargetFolderId = noteMoveTarget?.folderId ?? null
  useEffect(() => {
    if (!moveTargetGroupId) return
    const timer = window.setTimeout(() => {
      const s = useGroupsStore.getState()
      if (s.collapsedGroupIds.has(moveTargetGroupId)) s.toggleGroupCollapsed(moveTargetGroupId)
      if (moveTargetFolderId && s.collapsedFolderIds.has(moveTargetFolderId)) s.toggleFolderCollapsed(moveTargetFolderId)
    }, DROP_SPRING_OPEN_MS)
    return () => window.clearTimeout(timer)
  }, [moveTargetGroupId, moveTargetFolderId])

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

  // Ids of archived groups â€” used to hide their notes (and headers) unless "Show archived"
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
  const favoriteNotes = useMemo(
    () => orderFavorites(notes.filter((n) => n.favorited), noteOrder['favorites']),
    [notes, noteOrder],
  )
  const hasFavorites = favoriteNotes.length > 0
  const firstRenderableGroupId = (() => {
    for (const it of items) {
      if (it.kind !== 'group') continue
      if (!isSidebarGroupShown(it, { hasActiveFilters, showArchived })) continue
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
  // The peek stays shut while something else owns the sidebar: a drag, a menu, or an
  // inline rename / new group-folder input (it would steal its focus). The menus' delete
  // confirmations (Group/FolderContextMenu) cover the screen, so no header can be hovered.
  const peekBlocked =
    draggingGroupId != null || contextMenu != null || groupContextMenu != null ||
    folderContextMenu != null || newNoteCtx != null ||
    editingGroupId != null || editingFolderId != null || newFolderInput != null || newGroupInput
  // Only label the ungrouped remainder ("notes") when something sits above it â€”
  // a flat list with no favorites and no groups needs no header.
  const showNotesHeader = firstUngroupedNoteId != null && (hasFavorites || firstRenderableGroupId != null)
  const activeSearchNoteId =
    hasSearchFilter && keyboardResultIndex >= 0 && keyboardResultIndex < visibleNoteIds.length
      ? visibleNoteIds[keyboardResultIndex]
      : null
  // The note shown as open (= the highlighted row): a collapsed group shows its title and a
  // collapsed folder tints its icon when they hold it.
  const openNoteId = noteViewId ?? activeNoteId
  const openNote = openNoteId ? rawNotes.find((n) => n.id === openNoteId) : undefined

  // Mini-view of this list while the sidebar floats (SidebarShell draws it).
  // Same rows, order and visibility rules as the list rendered below.
  const miniRows = useMemo(() => {
    if (!onMiniRows) return null
    return buildMiniSidebarRows(
      { favorites: favoriteNotes, items, collapsedGroupIds, collapsedFolderIds, hasActiveFilters, showArchived },
      (name) => resolveGroupColor(name, sectionTagColors),
    )
  }, [onMiniRows, favoriteNotes, items, collapsedGroupIds, collapsedFolderIds, hasActiveFilters, showArchived, sectionTagColors])
  useEffect(() => {
    if (miniRows) onMiniRows?.(miniRows)
  }, [miniRows, onMiniRows])

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

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Note move to a different group/folder via drag & drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // Copied as a primitive: a raw ref value flowing into state makes the React Compiler
    // bail out of this component (and the stable rowHandlers memo with it).
    const noteId = String(draggingNoteIdRef.current)
    setNoteMoveTarget((prev) =>
      prev?.groupId === groupId && prev.folderId === folderId ? prev : { groupId, folderId, noteId }
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

  // â”€â”€ Group reorder via drag & drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  function renderNoteButton(note: Note, group?: { id: string; color: GroupColor; name?: string } | null, indent?: number, inFavorites?: boolean, wrapperClassName?: string, staggerIndex?: number) {
    // When the note overview is open the editor is hidden, so the highlighted
    // note must follow that view; otherwise fall back to the active editor note.
    const isActive = noteViewId != null ? noteViewId === note.id : activeNoteId === note.id
    const isSearchTarget = activeSearchNoteId === note.id
    const contextKey = getNoteContextKey(note, inFavorites)
    const isDropBefore = noteDropTarget?.noteId === note.id && noteDropTarget.position === 'before'
    const isDropAfter = noteDropTarget?.noteId === note.id && noteDropTarget.position === 'after'
    const openSectionId = isActive
      ? resolveOpenSectionId(note.sections.map((sec) => sec.id), openRowPaneSectionId, openRowRememberedSectionId)
      : null
    return (
      <NoteRow
        key={inFavorites ? `fav-${note.id}` : note.id}
        note={note}
        groupColor={inFavorites ? group?.color ?? null : null}
        groupName={inFavorites ? group?.name : undefined}
        indent={indent}
        staggerIndex={staggerIndex}
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
        openSectionId={openSectionId}
        sectionsStyle={sectionsStyle}
        handlers={rowHandlers}
      />
    )
  }

  // "Drop in …" slot at the end of the list a dragged note would land in (only when the
  // note isn't there already). Rendered by the group/folder that is the move target.
  function renderDropSlot(name: string) {
    const dragged = noteMoveTarget ? rawNotes.find((n) => n.id === noteMoveTarget.noteId) : undefined
    if (!noteMoveTarget || !dropChangesPlace(dragged, noteMoveTarget.groupId, noteMoveTarget.folderId)) return null
    return (
      <li className="sbg-slot font-mono" aria-hidden>
        <span>{tf(t.sidebar.dropIn, { name })}</span>
      </li>
    )
  }

  function renderFolder(group: { id: string; color: GroupColor }, sf: SidebarFolder, staggerIndex: number) {
    const { folder, notes: folderNotes } = sf
    const collapsed = collapsedFolderIds.has(folder.id)
    if (!isSidebarFolderShown(folderNotes.length, hasActiveFilters)) return null
    const isMoveTarget = noteMoveTarget?.folderId === folder.id
    const hasOpenNote = openNote?.group === group.id && openNote.folder === folder.id
    return (
      <div
        key={`folder-${folder.id}`}
        data-sbg-folder={folder.id}
        className={`sbg-f${collapsed ? ' is-collapsed' : ''}${hasOpenNote ? ' has-open' : ''}${isMoveTarget ? ' is-drop' : ''}`}
        // --fi: the header's stagger step; its notes enter after it when the group unfolds.
        style={{ '--fi': staggerIndex } as React.CSSProperties}
        onDragOver={(e) => handleNoteMoveDragOver(e, group.id, folder.id)}
        onDragLeave={(e) => handleNoteMoveDragLeave(e, group.id, folder.id)}
        onDrop={(e) => handleNoteMoveDrop(e, group.id, folder.id)}
      >
        {editingFolderId === folder.id ? (
          <div className="flex items-center gap-1.5 ml-[17px] px-1.5 py-1">
            <FolderIcon icon={folder.icon} />
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
              className="flex-1 min-w-0 text-[12px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <NoteFolderHeader
            folder={folder}
            noteCount={folderNotes.length}
            collapsed={collapsed}
            staggerIndex={staggerIndex}
            onToggle={() => toggleFolderCollapsed(folder.id)}
            onContextMenu={(e) => {
              setFolderContextMenu({ x: e.clientX, y: e.clientY, folderId: folder.id })
            }}
          />
        )}

        {/* Collapsible body; its guide (.sbg-fin::before) runs under the folder icon */}
        <div className="sbg-body">
          <div className="sbg-clip">
            <div className="sbg-fin">
              <ul className="sbg-flist">
                {/* Titles at x=43 (= folder name): 35px wrapper + 8px row padding */}
                {folderNotes.map((note, j) => renderNoteButton(note, group, 8, false, 'pl-[35px]', staggerStep(j)))}
                {folderNotes.length === 0 && (
                  <li>
                    <button
                      onClick={() => createNoteInFolder(group.id, folder.id)}
                      className="w-full text-left pl-[43px] pr-2.5 py-2 text-xs font-mono text-text-muted hover:text-text flex items-center gap-1.5 transition-colors"
                    >
                      <Plus size={10} />
                      {t.common.newNote}
                    </button>
                  </li>
                )}
                {isMoveTarget && renderDropSlot(folder.name)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Refresh the live row-behavior closures after every render (synchronously, before any
  // user interaction). NoteRow only ever sees the stable `rowHandlers` faÃ§ade above, which
  // forwards to whatever lives here now â€” keeping each row's props stable so memoization
  // holds while these closures still read current state (items, noteOrder, â€¦).
  useLayoutEffect(() => {
    // Normal (non-split) open of `note` at `sectionId`, shared by the row click (first
    // section) and the section-tag click. The synchronous request-section event serves the
    // case where the target editor is already mounted and stays mounted (e.g. clicking
    // another section of the single open note): it jumps there immediately. When the click
    // remounts the editor the event is lost (it reaches the editor that's about to
    // unmount), so we also stash the target section below.
    const openAtSection = (note: Note, sectionId: string) => {
      window.dispatchEvent(new CustomEvent('noteflow:request-section', {
        detail: { noteId: note.id, sectionId },
      }))
      // A normal click collapses the layout to this single note. The editor remounts when
      // the content view, note overview or brain view is open (editor unmounted), OR when a split
      // with more than one open pane is collapsed to one — in both cases the synchronous
      // event above never reaches the freshly mounted editor. Stash the target section (the
      // editor reads it on mount, prioritised over the last-visited one) and re-emit once
      // it's listening (next macrotask) — same as the content view / BrainView.
      const { contentPlace, noteViewId: nv, brainViewOpen, openPanes } = useNotesStore.getState()
      const editorUnmounted = contentPlace !== null || nv !== null || brainViewOpen
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
    }

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
        // Clicking the note itself opens it in the editor at its FIRST section, whatever the
        // section count (the note overview stays reachable from the editor's overview button
        // and the section context menu). A locked encrypted note has no sections yet
        // (`sections: []`): just open it so the editor shows the unlock prompt.
        const firstSectionId = note.sections[0]?.id
        if (firstSectionId) {
          openAtSection(note, firstSectionId)
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
        openAtSection(note, sectionId)
      },
    }
  })

  return (
    // Both modes: only the notes list scrolls; search, buttons and footer stay put.
    // Floating has no right border (the floating panel draws its own).
    <div ref={rootRef} className={`flex flex-col h-full bg-surface-1${pinned ? ' border-r border-border' : ''}`}>
      <NoteContextMenu request={contextMenu} onClose={() => setContextMenu(null)} />
      <GroupPeek
        controllerRef={peekRef}
        items={items}
        collapsedGroupIds={collapsedGroupIds}
        blocked={peekBlocked}
        activeNoteId={noteViewId ?? activeNoteId}
        sectionTagColors={sectionTagColors}
        handlers={rowHandlers}
        sidebarRef={rootRef}
      />
      {/* Opening a note unfolds its row and folds the previous one: slide the rows between. */}
      <RowShiftFlip activeKey={noteViewId ?? activeNoteId} rootRef={rootRef} />
      {/* Groups' guide cursor and folding marker: imperative, never re-renders the list. */}
      <GroupGuides
        activeKey={noteViewId ?? activeNoteId}
        rootRef={rootRef}
        collapsedGroupIds={collapsedGroupIds}
        collapsedFolderIds={collapsedFolderIds}
      />

      {/* â”€â”€ Search + all content + collapse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            data-sidebar-search
            type="text"
            placeholder={t.sidebar.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pl-7 pr-7 py-1.5 bg-text/[0.06] rounded-lg text-xs
                       font-mono text-text placeholder-text-muted/40 outline-none
                       focus:bg-text/[0.09] transition-colors caret-text"
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
          onClick={() => setContentView(ALL_PLACE)}
          title={t.sidebar.viewAllContent}
          aria-label={t.sidebar.viewAllContent}
          className="flex-shrink-0 p-1.5 rounded text-text-muted/50 hover:text-text-muted
                     hover:bg-surface-2 transition-colors"
        >
          <LayoutGrid size={14} strokeWidth={2.5} />
        </button>
        {/* Pin switch: pressed = docked in the layout; off = floating panel that
            opens from the mini-view at the content's left edge. In the brain view
            it's a plain "collapse" button (hideOnly). */}
        <button
          onClick={onTogglePinned}
          aria-pressed={hideOnly ? undefined : pinned}
          aria-label={hideOnly ? tf(t.sidebar.collapseSidebar, { key: modKey }) : t.sidebar.pinSidebarLabel}
          title={tf(pinned ? t.sidebar.collapseSidebar : t.sidebar.pinSidebar, { key: modKey })}
          className={`flex-shrink-0 p-1.5 rounded transition-colors ${
            pinned && !hideOnly
              ? 'text-text-muted bg-text/[0.07] hover:bg-text/[0.12]'
              : 'text-text-muted/50 hover:text-text-muted hover:bg-surface-2'
          }`}
        >
          {pinned ? <PanelLeftClose size={14} strokeWidth={2.5} /> : <PanelLeftOpen size={14} strokeWidth={2.5} />}
        </button>
      </div>

      {/* â”€â”€ New note / new group buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="px-3 pt-0.5 pb-2 space-y-1.5">
        {/* Big "+" button stretches to the height of the stacked group / temp-note column. */}
        <div className="flex items-stretch gap-1.5">
          <button
            onClick={() => createNote()}
            onContextMenu={(e) => { e.preventDefault(); setNewNoteCtx({ x: e.clientX, y: e.clientY }) }}
            title={t.sidebar.newNoteTooltip}
            aria-label={t.sidebar.newNoteTooltip}
            className="flex-1 flex items-center justify-center rounded-lg text-text transition-all
                       bg-text/[0.06] border border-text/20
                       hover:bg-text/[0.10] hover:border-text/30"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
          <div className="flex-shrink-0 flex flex-col gap-1.5">
            <button
              onClick={() => { setNewGroupInput(true); setNewGroupName('') }}
              title={t.sidebar.newGroup}
              aria-label={t.sidebar.newGroup}
              className="flex justify-center px-[25px] py-[7px] rounded-md text-text-muted/50 bg-text/[0.03]
                         hover:text-text-muted hover:bg-text/[0.06] transition-colors"
            >
              <FolderPlus size={14} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => createTempNote()}
              title={t.sidebar.newTempNoteTooltip}
              aria-label={t.sidebar.newTempNoteTooltip}
              className="flex justify-center px-[25px] py-[7px] rounded-md text-text-muted/50 bg-text/[0.03]
                         hover:text-text-muted hover:bg-text/[0.06] transition-colors"
            >
              <Timer size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        {newGroupInput && (
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newGroupName.trim()) {
                await createGroup(newGroupName.trim(), NEW_GROUP_COLOR)
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

      {/* â”€â”€ Notes list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 overflow-y-auto notes-list-scroll">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted gap-2">
            <span className="text-2xl opacity-20">âˆ…</span>
            <span className="text-xs font-mono">{rawNotes.length > 0 ? t.sidebar.noNotesMatch : t.sidebar.noNotes}</span>
          </div>
        ) : (
          <ul className={`sbg-list flex flex-col gap-0.5 px-2.5 pt-2 pb-8${noteMoveTarget ? ' is-drop-spot' : ''}`}>
            {/* â”€â”€ Favorites section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {(() => {
              if (favoriteNotes.length === 0) return null
              return (
                <>
                  <li className="flex items-center gap-1.5 px-1 pt-0.5 pb-0.5">
                    <Star size={10} strokeWidth={2.4} className="flex-shrink-0" style={{ color: 'rgb(var(--accent) / 0.8)' }} aria-hidden />
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
                // Hidden when filters leave it empty; archived groups are hidden unless
                // "Show archived" is on (then shown dimmed)
                if (!isSidebarGroupShown(item, { hasActiveFilters, showArchived })) return null
                const isFirstGroup = group.id === firstRenderableGroupId
                const isMoveGroup = noteMoveTarget?.groupId === group.id
                const isMoveRoot = isMoveGroup && !noteMoveTarget?.folderId
                const hasOpenNote = openNote?.group === group.id
                return (
                  <Fragment key={`group-${group.id}`}>
                    {isFirstGroup && (
                      <li className="px-1 pt-0.5 pb-0.5 first:mt-0 mt-5">
                        <span className="text-[10px] font-mono text-text-muted/50 uppercase tracking-widest">{t.sidebar.groupsHeader}</span>
                      </li>
                    )}
                  {/* "Index with guides" (`.sbg-*` in index.css): --g = group colour for the tab,
                      guides, cursor and drop marks. */}
                  <li
                    data-sbg-group={group.id}
                    className={`sbg-g${collapsed ? ' is-collapsed' : ''}${hasOpenNote ? ' has-open' : ''}${isMoveGroup ? ' is-drop-group' : ''}${isMoveRoot ? ' is-drop' : ''}${isFirstGroup ? '' : ' first:mt-0 mt-1'}${group.archived ? ' opacity-50' : ''}`}
                    style={{ '--g': colorChannels(group.color) } as React.CSSProperties}
                    onDragOver={(e) => handleNoteMoveDragOver(e, group.id)}
                    onDragLeave={(e) => handleNoteMoveDragLeave(e, group.id)}
                    onDrop={(e) => handleNoteMoveDrop(e, group.id)}
                  >
                    {/* Sticky group header / rename input — draggable to reorder groups */}
                    <div
                      className="sbg-gh"
                      style={draggingGroupId === group.id ? { opacity: 0.4 } : undefined}
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
                        <div className="flex items-center gap-2 h-full pl-1 pr-1.5">
                          <span className="sbg-tab" aria-hidden />
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
                            className="flex-1 min-w-0 text-[12.5px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      ) : (
                        <NoteGroupHeader
                          group={group}
                          noteCount={item.visibleCount}
                          collapsed={collapsed}
                          openNoteTitle={hasOpenNote ? (openNote.title || t.common.untitled) : null}
                          onToggle={() => toggleGroupCollapsed(group.id)}
                          onOpenGroupView={() => setContentView(groupPlace(group.id))}
                          onContextMenu={(e) => {
                            setGroupContextMenu({ x: e.clientX, y: e.clientY, groupId: group.id })
                          }}
                          onPeekHover={peekHover}
                          onPeekLeave={peekLeave}
                        />
                      )}
                    </div>

                    {/* Collapsible body (overflow handled in CSS: hidden only collapsed or
                        folding, so the folder headers inside can stick). The group guide is
                        .sbg-in::before; the cursor <i> is placed by GroupGuides. */}
                    <div className="sbg-body">
                      <div className="sbg-clip">
                        <div className="sbg-in">
                          <i className="sbg-cur is-off" aria-hidden />
                          {/* Inline "new folder" input */}
                          {newFolderInput?.groupId === group.id && (
                            <div className="flex items-center gap-1.5 ml-[17px] px-1.5 py-1">
                              <FolderGlyph />
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
                                className="flex-1 min-w-0 text-[12px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text placeholder-text-muted/40"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                          <ul className="sbg-loose">
                            {/* Titles at x=25 (= group name): 17px wrapper + 8px row padding */}
                            {groupNotes.map((note, i) => renderNoteButton(note, group, 8, false, 'pl-[17px]', staggerStep(i)))}
                            {groupNotes.length === 0 && groupFolders.length === 0 && !newFolderInput && (
                              <li>
                                <button
                                  onClick={() => createNoteInGroup(group.id)}
                                  className="w-full text-left pl-[25px] pr-2.5 py-2 text-xs font-mono text-text-muted hover:text-text flex items-center gap-1.5 transition-colors"
                                >
                                  <Plus size={10} />
                                  {t.common.newNote}
                                </button>
                              </li>
                            )}
                            {isMoveRoot && renderDropSlot(group.name)}
                          </ul>
                          {/* Subfolders (their headers count in the unfold stagger after the loose notes) */}
                          {groupFolders.map((sf, k) => renderFolder(group, sf, staggerStep(groupNotes.length + k)))}
                        </div>
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

      {/* â”€â”€ New note context menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {newNoteCtx && (
        <ContextMenu
          x={newNoteCtx.x}
          y={newNoteCtx.y}
          className="fixed z-50 bg-surface-2 border border-border rounded-lg shadow-xl py-1 w-52 animate-in fade-in zoom-in duration-100"
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

      {/* Group / folder context menus (shared with the content view's places rail) */}
      <GroupContextMenu
        request={groupContextMenu}
        onClose={closeGroupMenu}
        onOpenGroupView={(groupId) => setContentView(groupPlace(groupId))}
        onNewFolder={(groupId) => startNewFolder(groupId)}
        onRename={(groupId) => {
          const group = groups.find((g) => g.id === groupId)
          if (!group) return
          setEditingGroupId(group.id)
          setEditingGroupName(group.name)
        }}
      />
      <FolderContextMenu
        request={folderContextMenu}
        onClose={closeFolderMenu}
        onRename={(folderId) => {
          const folder = folders.find((f) => f.id === folderId)
          if (!folder) return
          setEditingFolderId(folder.id)
          setEditingFolderName(folder.name)
        }}
      />

      {/* â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mx-8 h-px shrink-0 bg-border" />
      <div className="px-3 py-2 flex items-center justify-between">
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
