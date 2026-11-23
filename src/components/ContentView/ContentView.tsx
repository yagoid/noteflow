import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Check, LayoutGrid, MoreHorizontal, Plus, Search, Star, X } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { NoteContextMenu, type NoteContextMenuRequest } from '../NoteContextMenu'
import { GroupContextMenu, type GroupContextMenuRequest } from '../GroupContextMenu'
import { FolderContextMenu, type FolderContextMenuRequest } from '../FolderContextMenu'
import { ConfirmModal } from '../ConfirmModal'
import { SelectionBar } from '../SelectionBar'
import { openNoteWindowOnDragOut } from '../openNoteWindowOnDragOut'
import { sidebarAnchorRef } from '../Sidebar/sidebarAnchor'
import { formatNoteDate } from '../Sidebar/rowText'
import { PlacesRail, type RailEdit, type RailGroup } from './PlacesRail'
import { NoteTimeline, type TimeKind, type TimelineDropMark, type TimelineEntry, type TimelineHandlers } from './NoteTimeline'
import { SectionPreviewPane } from './SectionPreviewPane'
import {
  ALL_PLACE, COLUMN_LIMITS, CONTENT_SORTS, DEFAULT_COLUMN_WIDTHS, DEFAULT_CONTENT_SORT, alreadyInPlace, buildNoteList,
  buildPlaceContext, clampPreviewWidth, clampRailWidth, contextNoteIds, folderPlace, groupPlace, noteInPlace, noteListOrder,
  noteLocation, noteOrderContext, noteShown, noteTime, parseColumnWidths, parseContentSort, parsePlace, placeExists, placeGroupId,
  placeMovePatch, reconcileSelection, selectionRange, sortByUpdatedDesc, stepNote, stepSection, timeLabelKind,
  type ColumnWidths, type ContentPlace, type ContentSelection, type ContentSort, type NoteListSection,
} from '../../lib/contentView'
import { parseSearchQuery, noteMatchesQuery } from '../../lib/searchUtils'
import { moveIdNextTo, type DropPosition } from '../../lib/sidebarGroups'
import { colorChannels, NEW_GROUP_COLOR } from '../../lib/tagColors'
import { ownsKeys } from '../../lib/keyScope'
import { hasOpenOverlay } from '../../lib/overlays'
import { prefersReducedMotion } from '../../lib/flip'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import type { Note } from '../../types'

interface ContentViewProps {
  place: ContentPlace
  onClose: () => void
}

const NOTE_DRAG_TYPE = 'application/x-noteflow-note-id'
// Hand-set widths of the places rail and the preview (lib/contentView.ts parseColumnWidths).
const COLUMN_WIDTHS_KEY = 'noteflow:content-view-widths'
// Order of column 2: by date / in order (lib/contentView.ts parseContentSort). Read on every
// mount, so the last one chosen comes back when the view reopens and after a restart.
const SORT_KEY = 'noteflow:content-view-sort'
const EMPTY_IDS: ReadonlySet<string> = new Set()
// How long the anchor gap holds a clicked row under the pointer: the double-click window
// (500 ms is the Windows default), so a second click still lands on the same row.
const ANCHOR_GAP_HOLD_MS = 500
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

function readColumnWidths(): ColumnWidths {
  try {
    return parseColumnWidths(localStorage.getItem(COLUMN_WIDTHS_KEY))
  } catch {
    return DEFAULT_COLUMN_WIDTHS
  }
}

function storeColumnWidths(widths: ColumnWidths): void {
  try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths)) } catch { /* storage unavailable */ }
}

function readSort(): ContentSort {
  try {
    return parseContentSort(localStorage.getItem(SORT_KEY))
  } catch {
    return DEFAULT_CONTENT_SORT
  }
}

function storeSort(sort: ContentSort): void {
  try { localStorage.setItem(SORT_KEY, sort) } catch { /* storage unavailable */ }
}

/**
 * The unified content view (replaces the editor area): places rail, the place's notes (by
 * date or in the sidebar's order; the selected one unfolds its sections), and the selected
 * section's preview. Opened with a place from the sidebar ("All content", a group's name),
 * the brain and the group menu.
 * See "Vista de contenido unificada" in .agents/context/patterns.md.
 */
export function ContentView({ place, onClose }: ContentViewProps) {
  const t = useT()
  const notes = useNotesStore((s) => s.notes)
  const setContentView = useNotesStore((s) => s.setContentView)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const createNote = useNotesStore((s) => s.createNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  const keepLinkedNote = useNotesStore((s) => s.keepLinkedNote)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const archiveNote = useNotesStore((s) => s.archiveNote)
  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const noteOrder = useGroupsStore((s) => s.noteOrder)
  const createFolder = useGroupsStore((s) => s.createFolder)
  const createGroup = useGroupsStore((s) => s.createGroup)
  const renameGroup = useGroupsStore((s) => s.renameGroup)
  const renameFolder = useGroupsStore((s) => s.renameFolder)
  const reorderFolders = useGroupsStore((s) => s.reorderFolders)
  const setContextNoteOrder = useGroupsStore((s) => s.setContextNoteOrder)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)

  const ctx = useMemo(() => buildPlaceContext(groups, folders), [groups, folders])

  // ── Local view state ─────────────────────────────────────────────────────────
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<NoteContextMenuRequest | null>(null)
  // Opens with nothing selected and the preview closed; choosing a note opens it.
  const [selection, setSelection] = useState<ContentSelection | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(EMPTY_IDS)
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [draggingIds, setDraggingIds] = useState<ReadonlySet<string>>(EMPTY_IDS)
  const [dropPlace, setDropPlace] = useState<ContentPlace | null>(null)
  // "In order": where a dragged note would be reordered to.
  const [rowDrop, setRowDrop] = useState<TimelineDropMark | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Rail: its inline input (new folder / + Group / rename) and the group / folder menus.
  const [railEdit, setRailEdit] = useState<RailEdit | null>(null)
  const [groupMenu, setGroupMenu] = useState<GroupContextMenuRequest | null>(null)
  const [folderMenu, setFolderMenu] = useState<FolderContextMenuRequest | null>(null)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(readColumnWidths)
  const [sort, setSort] = useState<ContentSort>(readSort)
  const [resizing, setResizing] = useState(false)
  // Day boundaries of the date blocks: refreshed when the date changes, not every render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => {
      const current = Date.now()
      setNow((prev) => (sameDay(prev, current) ? prev : current))
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  // ── Notes of the place ───────────────────────────────────────────────────────
  const shownNotes = useMemo(
    () => sortByUpdatedDesc(notes.filter((n) => noteShown(n, place, ctx, showArchived))),
    [notes, place, ctx, showArchived],
  )
  const placeNotes = useMemo(() => shownNotes.filter((n) => noteInPlace(n, place, ctx)), [shownNotes, place, ctx])
  const parsed = useMemo(() => parseSearchQuery(query), [query])
  const hasQuery = parsed.textQuery.length > 0 || parsed.sectionFilter !== null
  const highlight = parsed.sectionFilter ?? parsed.textQuery
  const listed = useMemo(
    () => (hasQuery ? placeNotes.filter((n) => noteMatchesQuery(n, parsed)) : placeNotes),
    [placeNotes, hasQuery, parsed],
  )
  // Column 2's sections in the chosen order; arrows, shift-click and the default selection
  // follow the same visual order (`noteListOrder`).
  const noteList = useMemo(
    () => buildNoteList(listed, { sort, place, groups, folders, noteOrder, now }),
    [listed, sort, place, groups, folders, noteOrder, now],
  )
  const ordered = useMemo(() => noteListOrder(noteList), [noteList])
  const listedIds = useMemo(() => ordered.map((n) => n.id), [ordered])
  const selectable = useMemo(
    () => ordered.map((n) => ({ id: n.id, sectionIds: n.sections.map((s) => s.id) })),
    [ordered],
  )

  // ── Selection ────────────────────────────────────────────────────────────────
  // Changing place: the selected note stays if it's still listed (else none), and the
  // multi-selection is dropped — its batch actions must only touch what's on screen.
  const [prevPlace, setPrevPlace] = useState(place)
  if (prevPlace !== place) {
    setPrevPlace(place)
    setSelection(reconcileSelection(selectable, selection))
    setCheckedIds(EMPTY_IDS)
    setAnchorId(null)
    setMenuOpen(false)
  }
  // Derived (no effect): follows the list as notes move, get deleted or a search narrows it.
  const current = reconcileSelection(selectable, selection)
  // The selected note left the list (search, deletion, sync): nothing stays selected — not
  // even if it comes back — and the preview closes with it (`previewVisible`).
  if (selection !== null && current === null) setSelection(null)
  const previewVisible = previewOpen && current !== null
  const currentNote = current ? listed.find((n) => n.id === current.noteId) ?? null : null
  // Checked notes that are listed: a narrowed search never acts on hidden notes.
  const checkedNotes = useMemo(() => listed.filter((n) => checkedIds.has(n.id)), [listed, checkedIds])
  const visibleChecked = useMemo(
    () => (checkedNotes.length === checkedIds.size ? checkedIds : new Set(checkedNotes.map((n) => n.id))),
    [checkedNotes, checkedIds],
  )
  const selectionActive = checkedNotes.length > 0

  const listRef = useRef<HTMLDivElement>(null)
  const scrollToSelectionRef = useRef(false)
  // A row clicked while another one is unfolded: where it was on screen, so it stays under
  // the pointer as the other folds up (else the second click of a double click lands elsewhere).
  const clickAnchorRef = useRef<{ noteId: string; top: number } | null>(null)
  // When the list can't scroll up that far (no scroll, or near the top), an empty gap above
  // the first block takes the difference; it closes, gliding, once the pointer leaves the row
  // or the double-click window is over (else it would linger while the pointer rests there).
  const anchorGapRef = useRef<HTMLDivElement>(null)
  const releaseGapRef = useRef<(() => void) | null>(null)
  const setAnchorGap = useCallback((px: number, glide: boolean) => {
    const gap = anchorGapRef.current
    if (!gap) return
    gap.style.transition = glide && !prefersReducedMotion() ? 'height 220ms ease' : 'none'
    gap.style.height = `${px}px`
  }, [])
  const closeAnchorGap = useCallback((glide: boolean) => {
    releaseGapRef.current?.()
    releaseGapRef.current = null
    setAnchorGap(0, glide)
  }, [setAnchorGap])
  const focusList = () => listRef.current?.focus({ preventScroll: true })

  const select = (noteId: string, sectionId: string | null, fromKeyboard = false) => {
    setSelection({ noteId, sectionId })
    setPreviewOpen(true)
    scrollToSelectionRef.current = fromKeyboard
  }

  // Keyboard moves keep the selected row — unfolded — in view (below the sticky block header);
  // a clicked row stays where it was while the previous one folds up.
  const currentNoteId = current?.noteId ?? null
  const currentSectionId = current?.sectionId ?? null
  useLayoutEffect(() => {
    const anchor = clickAnchorRef.current
    clickAnchorRef.current = null
    const row = currentNoteId
      ? listRef.current?.querySelector<HTMLElement>(`[data-cv-row="${CSS.escape(currentNoteId)}"]`)
      : null
    const list = listRef.current
    if (anchor && row && list && anchor.noteId === currentNoteId) {
      // Measured without the previous gap: it goes now, and the new one is worked out whole.
      closeAnchorGap(false)
      const target = list.scrollTop + row.getBoundingClientRect().top - anchor.top
      if (target < 0) {
        setAnchorGap(-target, false)
        list.scrollTop = 0
        const release = () => closeAnchorGap(true)
        row.addEventListener('pointerleave', release, { once: true })
        const timer = window.setTimeout(release, ANCHOR_GAP_HOLD_MS)
        releaseGapRef.current = () => {
          row.removeEventListener('pointerleave', release)
          window.clearTimeout(timer)
        }
      } else {
        list.scrollTop = target
      }
    } else if (releaseGapRef.current && scrollToSelectionRef.current) {
      // A keyboard move: the gap goes, and the row is brought into view below. (A click on
      // a cell of the clicked row keeps it: the row stays under the pointer until it leaves.)
      closeAnchorGap(false)
    }
    if (!scrollToSelectionRef.current || !row) return
    scrollToSelectionRef.current = false
    row.scrollIntoView({ block: 'nearest' })
  }, [currentNoteId, currentSectionId, previewVisible, closeAnchorGap, setAnchorGap])

  // A new place starts at the top of its list.
  useEffect(() => {
    closeAnchorGap(false)
    listRef.current?.scrollTo({ top: 0 })
  }, [place, closeAnchorGap])

  // A new order keeps the selected note in view (it moves with the order); none → the top.
  const sortScrollRef = useRef(false)
  const changeSort = (next: ContentSort) => {
    if (next === sort) return
    setSort(next)
    storeSort(next)
    sortScrollRef.current = true
  }
  useLayoutEffect(() => {
    if (!sortScrollRef.current) return
    sortScrollRef.current = false
    const row = currentNoteId
      ? listRef.current?.querySelector<HTMLElement>(`[data-cv-row="${CSS.escape(currentNoteId)}"]`)
      : null
    if (row) row.scrollIntoView({ block: 'nearest' })
    else listRef.current?.scrollTo({ top: 0 })
  }, [sort, currentNoteId])

  // The list takes the keys when the view opens.
  useEffect(() => { listRef.current?.focus({ preventScroll: true }) }, [])

  // The place's group / folder vanished (deleted here or by a sync) → everything.
  const exists = placeExists(place, ctx)
  useEffect(() => {
    if (!exists) setContentView(ALL_PLACE)
  }, [exists, setContentView])

  // ── Open in the editor ───────────────────────────────────────────────────────
  // Same dance as the other full-area views: stash the section so the editor (which mounts
  // fresh once the view closes) opens on it, and re-assert it once the editor listens (under
  // StrictMode its mount effect consumes the pending value on the first run).
  const openInEditor = (noteId: string, sectionId: string | null) => {
    const note = notes.find((n) => n.id === noteId)
    const target = sectionId ?? note?.sections[0]?.id ?? null
    if (target) useNotesStore.setState({ pendingInitialSectionId: target })
    setOpenNoteIds([noteId])
    setActiveNote(noteId)
    if (target) {
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId: target } }),
        )
      }, 0)
    }
  }

  // ── Multi-select ─────────────────────────────────────────────────────────────
  const toggleChecked = (noteId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
    setAnchorId(noteId)
  }
  const selectRange = (noteId: string) => {
    const anchor = anchorId ?? current?.noteId ?? null
    setCheckedIds(new Set(selectionRange(listedIds, anchor, noteId)))
    // No visible anchor (nothing selected yet): the clicked note becomes it, so the next
    // Shift+click marks a range instead of replacing this mark.
    if (!anchor || !listedIds.includes(anchor)) setAnchorId(noteId)
  }
  const clearChecked = useCallback(() => {
    setCheckedIds(EMPTY_IDS)
    setAnchorId(null)
  }, [])
  const toggleSelectAll = useCallback(() => {
    if (listedIds.length === 0) return
    if (listedIds.every((id) => checkedIds.has(id))) setCheckedIds(EMPTY_IDS)
    else setCheckedIds(new Set(listedIds))
  }, [listedIds, checkedIds])

  // Favorite / archive toggle: off if every checked note has the flag, else on for all.
  const batchFavorite = () => {
    const target = !checkedNotes.every((n) => n.favorited)
    checkedNotes.forEach((n) => { if (!!n.favorited !== target) void updateNote(n.id, { favorited: target }) })
    clearChecked()
  }
  const batchArchive = () => {
    const target = !checkedNotes.every((n) => n.archived)
    checkedNotes.forEach((n) => { if (!!n.archived !== target) void archiveNote(n.id) })
    clearChecked()
  }
  const moveNotes = (ids: readonly string[], patch: { group: string | undefined; folder: string | undefined }) => {
    for (const id of ids) {
      const note = notes.find((n) => n.id === id)
      if (note && !alreadyInPlace(note, patch, ctx)) void updateNote(id, patch)
    }
  }
  const batchMoveToGroup = (groupId: string | undefined) => {
    moveNotes(checkedNotes.map((n) => n.id), { group: groupId, folder: undefined })
    clearChecked()
  }
  const currentGroupId = placeGroupId(place, ctx)
  const batchMoveToFolder = (folderId: string | undefined) => {
    if (!currentGroupId) return
    moveNotes(checkedNotes.map((n) => n.id), { group: currentGroupId, folder: folderId })
    clearChecked()
  }
  const batchDelete = () => {
    const ids = checkedNotes.map((n) => n.id)
    clearChecked()
    setConfirmDelete(false)
    ids.forEach((id) => void deleteNote(id))
  }

  // ── Drag a note (or the checked ones) onto a place ───────────────────────────
  const dragIdsRef = useRef<string[] | null>(null)
  // Manual-order context (`noteOrder` key) of a single note dragged "In order": it can
  // also be dropped between the rows of that same context to reorder it (the sidebar's order).
  const dragOrderKeyRef = useRef<string | null>(null)
  const endDrag = useCallback(() => {
    dragIdsRef.current = null
    dragOrderKeyRef.current = null
    setDraggingIds(EMPTY_IDS)
    setDropPlace(null)
    setRowDrop(null)
  }, [])
  // Safety net: the source row may unmount mid-drag (moved out of the list) and never get its dragend.
  // Capture phase, so it runs before the row's own dragend: the drag-out is handled here.
  useEffect(() => {
    const onEnd = (e: globalThis.DragEvent) => {
      const ids = dragIdsRef.current
      if (!ids) return
      // One note released outside the window (no drop target took it): it opens in its own window.
      if (e.type === 'dragend' && ids.length === 1) openNoteWindowOnDragOut(e, ids[0])
      endDrag()
    }
    window.addEventListener('dragend', onEnd, true)
    window.addEventListener('drop', onEnd)
    return () => {
      window.removeEventListener('dragend', onEnd, true)
      window.removeEventListener('drop', onEnd)
    }
  }, [endDrag])

  const acceptsDrag = (e: DragEvent) => dragIdsRef.current !== null || e.dataTransfer.types.includes(NOTE_DRAG_TYPE)
  const onDragOverPlace = (e: DragEvent, target: ContentPlace) => {
    if (!acceptsDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropPlace((prev) => (prev === target ? prev : target))
  }
  const onDragLeavePlace = (e: DragEvent, target: ContentPlace) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setDropPlace((prev) => (prev === target ? null : prev))
  }
  const onDropPlace = (e: DragEvent, target: ContentPlace) => {
    e.preventDefault()
    e.stopPropagation()
    // Our own rows carry the whole checked set; a note dragged from the sidebar, its id.
    const dragged = e.dataTransfer.getData(NOTE_DRAG_TYPE) || e.dataTransfer.getData('text/plain')
    const ids = dragIdsRef.current ?? (dragged ? [dragged] : [])
    const many = ids.length > 1
    endDrag()
    const patch = placeMovePatch(target, ctx)
    if (!patch || ids.length === 0) return
    moveNotes(ids, patch)
    if (many) clearChecked()
  }

  // ── Row callbacks (stable façade over the live handlers, so memoized rows hold) ──
  const liveRef = useRef<TimelineHandlers | null>(null)
  useLayoutEffect(() => {
    liveRef.current = {
      rowClick: (e, noteId) => {
        focusList()
        if (e.shiftKey) { selectRange(noteId); return }
        if (e.ctrlKey || e.metaKey || selectionActive) { toggleChecked(noteId); return }
        // Clicking the selected note again keeps its section.
        if (noteId === current?.noteId && previewOpen) return
        const note = listed.find((n) => n.id === noteId)
        select(noteId, note?.sections[0]?.id ?? null)
        clickAnchorRef.current = { noteId, top: e.currentTarget.getBoundingClientRect().top }
      },
      cellClick: (e, noteId, sectionId) => {
        e.stopPropagation()
        focusList()
        if (e.shiftKey) { selectRange(noteId); return }
        if (e.ctrlKey || e.metaKey || selectionActive) { toggleChecked(noteId); return }
        select(noteId, sectionId)
      },
      toggleCheck: (e, noteId) => {
        e.stopPropagation()
        focusList()
        if (e.shiftKey) selectRange(noteId)
        else toggleChecked(noteId)
      },
      open: (noteId) => {
        if (selectionActive) return
        openInEditor(noteId, current?.noteId === noteId ? current.sectionId : null)
      },
      contextMenu: (e, noteId, sectionId) => {
        e.preventDefault()
        e.stopPropagation()
        setGroupMenu(null)
        setFolderMenu(null)
        setContextMenu({ x: e.clientX, y: e.clientY, noteId, sectionId })
      },
      dragStart: (e, noteId) => {
        const ids = visibleChecked.has(noteId) ? checkedNotes.map((n) => n.id) : [noteId]
        dragIdsRef.current = ids
        const dragged = ids.length === 1 && sort === 'sidebar' ? listed.find((n) => n.id === noteId) : undefined
        dragOrderKeyRef.current = dragged ? noteOrderContext(dragged, place, ctx) : null
        e.dataTransfer.setData(NOTE_DRAG_TYPE, noteId)
        e.dataTransfer.setData('text/plain', noteId)
        e.dataTransfer.effectAllowed = 'move'
        // Next frame: dimming the row now would also dim the drag image.
        requestAnimationFrame(() => { if (dragIdsRef.current === ids) setDraggingIds(new Set(ids)) })
      },
      dragEnd: () => endDrag(),
      dragOver: (e, noteId) => {
        const key = dragOrderKeyRef.current
        const draggedId = dragIdsRef.current?.[0]
        const target = key && draggedId && draggedId !== noteId ? listed.find((n) => n.id === noteId) : undefined
        // Not a reorder (by date, several notes, from the sidebar, itself, another context).
        if (!target || noteOrderContext(target, place, ctx) !== key) {
          setRowDrop((prev) => (prev === null ? prev : null))
          return
        }
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const position: DropPosition = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        setRowDrop((prev) => (prev?.noteId === noteId && prev.position === position ? prev : { noteId, position }))
      },
      dragLeave: (e, noteId) => {
        const next = e.relatedTarget as Node | null
        if (next && e.currentTarget.contains(next)) return
        setRowDrop((prev) => (prev?.noteId === noteId ? null : prev))
      },
      drop: (e, noteId) => {
        const key = dragOrderKeyRef.current
        const draggedId = dragIdsRef.current?.[0]
        const mark = rowDrop
        if (!key || !draggedId || mark?.noteId !== noteId) return
        e.preventDefault()
        endDrag()
        // The context's full order (hidden and archived notes keep their place).
        const ids = contextNoteIds(notes, key, { groups, folders, noteOrder })
        const next = moveIdNextTo(ids, draggedId, noteId, mark.position)
        // A temporary linked note (opened from the system) is kept before it takes a place.
        if (next) {
          const save = () => setContextNoteOrder(key, next)
          void (notes.find((n) => n.id === draggedId)?.linked?.transient ? keepLinkedNote(draggedId).then(save) : save())
        }
      },
    }
  })
  const handlers = useMemo<TimelineHandlers>(() => ({
    rowClick: (e, id) => liveRef.current?.rowClick(e, id),
    cellClick: (e, id, sid) => liveRef.current?.cellClick(e, id, sid),
    toggleCheck: (e, id) => liveRef.current?.toggleCheck(e, id),
    open: (id) => liveRef.current?.open(id),
    contextMenu: (e, id, sid) => liveRef.current?.contextMenu(e, id, sid),
    dragStart: (e, id) => liveRef.current?.dragStart(e, id),
    dragEnd: () => liveRef.current?.dragEnd(),
    dragOver: (e, id) => liveRef.current?.dragOver(e, id),
    dragLeave: (e, id) => liveRef.current?.dragLeave(e, id),
    drop: (e, id) => liveRef.current?.drop(e, id),
  }), [])

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  // List: ↑/↓ note, ←/→ section, Enter opens in the editor.
  const onListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || ownsKeys(e.target)) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const nextId = stepNote(listedIds, current?.noteId ?? null, e.key === 'ArrowDown' ? 1 : -1)
      if (!nextId) return
      const note = listed.find((n) => n.id === nextId)
      const sectionId = nextId === current?.noteId ? current.sectionId : note?.sections[0]?.id ?? null
      select(nextId, sectionId, true)
      return
    }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && currentNote) {
      e.preventDefault()
      const ids = currentNote.sections.map((s) => s.id)
      const from = previewVisible ? current?.sectionId ?? null : null
      select(currentNote.id, stepSection(ids, from, e.key === 'ArrowRight' ? 1 : -1), true)
      return
    }
    if (e.key === 'Enter' && current && previewVisible) {
      e.preventDefault()
      openInEditor(current.noteId, current.sectionId)
    }
  }

  // Whether this keydown started with a menu or a modal open, recorded in the CAPTURE phase
  // (before every bubble listener, so it doesn't matter whether the overlay's own Escape —
  // which closes it — runs before or after ours). Any overlay counts (lib/overlays.ts):
  // dialogs, menus, Settings, the command palette… except the view's own ⋯ menu, which the
  // Escape below closes. Same as the note overview.
  const menuOpenRef = useRef(false)
  useLayoutEffect(() => { menuOpenRef.current = contextMenu !== null || groupMenu !== null || folderMenu !== null })
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const overlayAtKeyDownRef = useRef(false)
  useEffect(() => {
    const snapshot = () => {
      overlayAtKeyDownRef.current = menuOpenRef.current || hasOpenOverlay(document, moreMenuRef.current)
    }
    window.addEventListener('keydown', snapshot, true)
    return () => window.removeEventListener('keydown', snapshot, true)
  }, [])

  // Escape: the ⋯ menu, else the multi-selection, else the preview, else the view.
  // Ctrl/Cmd+A: every listed note (not in text fields, with a menu or a modal open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmDelete || overlayAtKeyDownRef.current || ownsKeys(e.target)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (menuOpen) setMenuOpen(false)
        else if (selectionActive) clearChecked()
        else if (previewVisible) setPreviewOpen(false)
        else onClose()
        return
      }
      // The sidebar, AI panel, settings and palette stay mounted: never steal Ctrl/Cmd+A from
      // a field with its own select-all. Alt excluded (AltGr = Ctrl+Alt on ES/LatAm layouts).
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        toggleSelectAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDelete, menuOpen, selectionActive, previewVisible, onClose, clearChecked, toggleSelectAll])

  // The ⋯ menu closes on any outside click (the menu stops its own clicks).
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const closeGroupMenu = useCallback(() => setGroupMenu(null), [])
  const closeFolderMenu = useCallback(() => setFolderMenu(null), [])
  const openGroupMenu = (e: ReactMouseEvent, groupId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(null)
    setFolderMenu(null)
    setGroupMenu({ x: e.clientX, y: e.clientY, groupId })
  }
  const openFolderMenu = (e: ReactMouseEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(null)
    setGroupMenu(null)
    setFolderMenu({ x: e.clientX, y: e.clientY, folderId })
  }

  // ── Column widths (the handles between the columns) ──────────────────────────
  // While dragging, the width goes straight to the CSS variable (no re-render per move);
  // it's committed to state and localStorage on release. The preview's width transition is
  // off meanwhile (`.cv-body.is-resizing`): it's only for opening and closing.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const railRef = useRef<HTMLElement | null>(null)
  const previewRef = useRef<HTMLElement | null>(null)
  const setBodyRef = useCallback((el: HTMLDivElement | null) => {
    bodyRef.current = el
    sidebarAnchorRef(el)
  }, [])
  const columnWidthsRef = useRef(columnWidths)
  useLayoutEffect(() => { columnWidthsRef.current = columnWidths })
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  const startResize = (e: ReactMouseEvent, column: 'rail' | 'preview') => {
    const body = bodyRef.current
    const target = column === 'rail' ? railRef.current : previewRef.current
    if (e.button !== 0 || !body || !target) return
    e.preventDefault()
    const startX = e.clientX
    const viewWidth = body.clientWidth
    // Both start from the width on screen (CSS caps them as the clamps below do).
    const startWidth = target.getBoundingClientRect().width
    // The floating sidebar's mini-view reserve: the rail's left padding beyond its own.
    const rail = railRef.current
    const railExtra = rail
      ? Math.max(0, parseFloat(getComputedStyle(rail).paddingLeft) - COLUMN_LIMITS.railPadding)
      : 0
    const railWidth = rail?.getBoundingClientRect().width ?? columnWidthsRef.current.rail
    const startValue = column === 'rail' ? startWidth - railExtra : startWidth
    let value = startValue
    let moved = false

    const onMove = (ev: MouseEvent) => {
      // Released outside the window: no mouseup reached us.
      if (ev.buttons === 0) { finish(); return }
      const dx = ev.clientX - startX
      if (dx === 0 && !moved) return
      moved = true
      value = column === 'rail'
        ? clampRailWidth(startValue + dx, { viewWidth, railExtra, previewOpen: previewVisible })
        : clampPreviewWidth(startValue - dx, { viewWidth, railWidth })
      body.style.setProperty(column === 'rail' ? '--cv-rail-w' : '--cv-pv-w', `${value}px`)
    }
    const finish = () => {
      resizeCleanupRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', finish)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
      // A plain click (or the first half of a double click) keeps the width as it was.
      if (!moved) return
      const next = { ...columnWidthsRef.current, [column]: value }
      setColumnWidths(next)
      storeColumnWidths(next)
    }
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = finish
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', finish)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setResizing(true)
  }
  const resetColumnWidth = (column: 'rail' | 'preview') => {
    const next = { ...columnWidths, [column]: DEFAULT_COLUMN_WIDTHS[column] }
    setColumnWidths(next)
    storeColumnWidths(next)
  }

  // ── Rail data (counts over what's shown, search aside) ───────────────────────
  const rail = useMemo(() => {
    const groupCounts = new Map<string, number>()
    const folderCounts = new Map<string, number>()
    let favorites = 0
    let ungrouped = 0
    for (const n of shownNotes) {
      if (n.favorited) favorites += 1
      const loc = noteLocation(n, ctx)
      if (!loc.groupId) { ungrouped += 1; continue }
      groupCounts.set(loc.groupId, (groupCounts.get(loc.groupId) ?? 0) + 1)
      if (loc.folderId) folderCounts.set(loc.folderId, (folderCounts.get(loc.folderId) ?? 0) + 1)
    }
    const standingOn = placeGroupId(place, ctx)
    const railGroups: RailGroup[] = [...groups]
      // As the sidebar: by order, archived ones last — and only with "Show archived" (or
      // when the view stands on one).
      .sort((a, b) => (Number(!!a.archived) - Number(!!b.archived)) || (a.order - b.order))
      .filter((g) => !g.archived || showArchived || g.id === standingOn)
      .map((group) => ({
        group,
        count: groupCounts.get(group.id) ?? 0,
        folders: folders
          .filter((f) => f.groupId === group.id)
          .sort((a, b) => a.order - b.order)
          .map((folder) => ({ folder, count: folderCounts.get(folder.id) ?? 0 })),
      }))
    return { groups: railGroups, all: shownNotes.length, favorites, ungrouped }
  }, [shownNotes, ctx, place, groups, folders, showArchived])

  // ── Timeline entries ─────────────────────────────────────────────────────────
  // Time column: by date, as its block prints it; in order, the sidebar item's date.
  const sections = useMemo((): NoteListSection<TimelineEntry>[] => {
    const toEntry = (note: Note, timeKind: TimeKind): TimelineEntry => {
      const loc = noteLocation(note, ctx)
      const group = loc.groupId ? ctx.groupsById.get(loc.groupId) ?? null : null
      const folder = loc.folderId ? ctx.foldersById.get(loc.folderId) ?? null : null
      return {
        note,
        time: noteTime(note),
        timeKind,
        groupName: group?.name ?? null,
        groupChannels: group ? colorChannels(group.color) : null,
        folderName: folder?.name ?? null,
        folderIcon: folder?.icon,
      }
    }
    return noteList.map((s) => {
      const timeKind: TimeKind = s.heading?.kind === 'date' ? timeLabelKind(s.heading.block) : 'relative'
      return {
        ...s,
        items: s.items.map((n) => toEntry(n, timeKind)),
        folders: s.folders.map((f) => ({ folder: f.folder, items: f.items.map((n) => toEntry(n, timeKind)) })),
      }
    })
  }, [noteList, ctx])

  // ── Header ───────────────────────────────────────────────────────────────────
  const parsedPlace = parsePlace(place)
  const placeGroup = currentGroupId ? ctx.groupsById.get(currentGroupId) ?? null : null
  const placeFolder = parsedPlace.kind === 'folder' ? ctx.foldersById.get(parsedPlace.id) ?? null : null
  const title = parsedPlace.kind === 'all'
    ? t.common.allContent
    : parsedPlace.kind === 'fav'
      ? t.contentView.favorites
      : parsedPlace.kind === 'none'
        ? t.contentView.ungrouped
        : placeFolder?.name ?? placeGroup?.name ?? ''
  const headerIcon = parsedPlace.kind === 'all'
    ? <LayoutGrid size={18} strokeWidth={2} className="cv-head-ico" aria-hidden />
    : parsedPlace.kind === 'fav'
      ? <Star size={17} strokeWidth={2.2} className="cv-head-star" aria-hidden />
      : (
        <i
          className="sbg-tab cv-tab-lg"
          style={{ '--g': placeGroup ? colorChannels(placeGroup.color) : 'var(--text-muted)' } as CSSProperties}
          aria-hidden
        />
      )
  const folderCount = parsedPlace.kind === 'group' ? folders.filter((f) => f.groupId === parsedPlace.id).length : 0
  const lastEdited = placeNotes[0]
  const summary = [
    plural(t.common.notesPlural, placeNotes.length),
    folderCount > 0 ? plural(t.common.foldersPlural, folderCount) : null,
    lastEdited ? tf(t.contentView.lastEdited, { date: formatNoteDate(lastEdited.updated, t) }) : null,
  ].filter(Boolean).join(' · ')

  const movePatch = placeMovePatch(place, ctx)
  const newNoteName = parsedPlace.kind === 'group' || parsedPlace.kind === 'folder' ? title : null
  const handleNewNote = () => {
    const opts = movePatch?.group ? { group: movePatch.group, ...(movePatch.folder ? { folder: movePatch.folder } : {}) } : undefined
    void createNote(opts) // opens it in the editor (closes this view)
  }

  const handleCreateFolder = async (groupId: string, name: string) => {
    const folder = await createFolder(groupId, name)
    setContentView(folderPlace(folder.id))
  }
  const handleCreateGroup = async (name: string) => {
    const group = await createGroup(name, NEW_GROUP_COLOR)
    setContentView(groupPlace(group.id))
  }

  // ── Preview data ─────────────────────────────────────────────────────────────
  const previewLoc = currentNote ? noteLocation(currentNote, ctx) : null
  const previewGroup = previewLoc?.groupId ? ctx.groupsById.get(previewLoc.groupId) ?? null : null
  const previewFolder = previewLoc?.folderId ? ctx.foldersById.get(previewLoc.folderId) ?? null : null

  const emptyLabel = listed.length > 0 ? null : hasQuery ? t.contentView.noMatches : t.contentView.emptyPlace
  const sortLabels: Record<ContentSort, { label: string; tooltip: string }> = {
    date: { label: t.contentView.sortByDate, tooltip: t.contentView.sortByDateTooltip },
    sidebar: { label: t.contentView.sortAsSidebar, tooltip: t.contentView.sortAsSidebarTooltip },
  }

  return (
    <div
      className="cv-root font-mono"
      // Drops that miss a place must not bubble to the editor's "drop → split" handler.
      onDragOver={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}
    >
      <NoteContextMenu request={contextMenu} onClose={closeContextMenu} />
      {/* The sidebar's group / folder menus, without "View group" (this is the group view). */}
      <GroupContextMenu
        request={groupMenu}
        onClose={closeGroupMenu}
        onNewFolder={(groupId) => setRailEdit({ kind: 'add-folder', groupId })}
        onRename={(groupId) => setRailEdit({ kind: 'rename-group', id: groupId })}
      />
      <FolderContextMenu
        request={folderMenu}
        onClose={closeFolderMenu}
        onRename={(folderId) => setRailEdit({ kind: 'rename-folder', id: folderId })}
      />

      {/* ── Header ── */}
      <header className="cv-head">
        <div className="cv-head-tt">
          {headerIcon}
          {placeFolder && placeGroup && <span className="cv-head-path">{placeGroup.name} /</span>}
          <h2 className="cv-head-name">{title}</h2>
          <span className="cv-head-sum">{summary}</span>
        </div>
        <div className="cv-tools">
          <label className="cv-search">
            <Search size={13} aria-hidden />
            <input
              type="search"
              autoComplete="off"
              value={query}
              placeholder={t.contentView.searchPlaceholder}
              aria-label={t.contentView.searchLabel}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  // First Escape clears the search; the next one goes on to the view.
                  e.preventDefault()
                  e.stopPropagation()
                  setQuery('')
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  focusList()
                }
              }}
            />
          </label>
          <div className="cv-seg" role="radiogroup" aria-label={t.contentView.sortLabel}>
            {CONTENT_SORTS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={sort === option}
                className={`cv-seg-opt${sort === option ? ' is-on' : ''}`}
                title={sortLabels[option].tooltip}
                onClick={() => changeSort(option)}
              >
                {sortLabels[option].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cv-btn"
            onClick={handleNewNote}
            title={newNoteName ? tf(t.contentView.newNoteIn, { name: newNoteName }) : t.common.newNote}
          >
            <Plus size={13} strokeWidth={2.4} aria-hidden />
            {t.contentView.newNote}
          </button>
          <div className="cv-more" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="cv-btn is-square"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={t.contentView.moreActions}
              aria-label={t.contentView.moreActions}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={14} aria-hidden />
            </button>
            {menuOpen && (
              <div ref={moreMenuRef} className="cv-menu" role="menu">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={showArchived}
                  className="cv-menu-item"
                  onClick={() => { setShowArchived((v) => !v); setMenuOpen(false) }}
                >
                  <span className={`cv-menu-check${showArchived ? ' is-on' : ''}`} aria-hidden>
                    <Check size={10} strokeWidth={3.2} />
                  </span>
                  {t.contentView.showArchived}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="cv-btn is-square"
            title={t.contentView.closeView}
            aria-label={t.contentView.closeView}
            onClick={onClose}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </header>

      {/* ── Three columns (also the floating sidebar's content anchor) ── */}
      <div
        className={`cv-body${previewVisible ? ' has-preview' : ''}${resizing ? ' is-resizing' : ''}`}
        data-sidebar-anchor
        ref={setBodyRef}
        style={{
          '--cv-rail-w': `${columnWidths.rail}px`,
          ...(columnWidths.preview != null ? { '--cv-pv-w': `${columnWidths.preview}px` } : {}),
        } as CSSProperties}
      >
        <PlacesRail
          railRef={railRef}
          place={place}
          groups={rail.groups}
          allCount={rail.all}
          favoritesCount={rail.favorites}
          ungroupedCount={rail.ungrouped}
          dropPlace={dropPlace}
          onSelect={setContentView}
          onDragOverPlace={onDragOverPlace}
          onDragLeavePlace={onDragLeavePlace}
          onDropPlace={onDropPlace}
          edit={railEdit}
          onEditChange={setRailEdit}
          onCreateFolder={(groupId, name) => void handleCreateFolder(groupId, name)}
          onCreateGroup={(name) => void handleCreateGroup(name)}
          onRenameGroup={(groupId, name) => void renameGroup(groupId, name)}
          onRenameFolder={(folderId, name) => void renameFolder(folderId, name)}
          onReorderFolders={(groupId, ids) => void reorderFolders(groupId, ids)}
          onGroupContextMenu={openGroupMenu}
          onFolderContextMenu={openFolderMenu}
        />
        <ColumnHandle
          label={t.contentView.resizeColumn}
          onMouseDown={(e) => startResize(e, 'rail')}
          onDoubleClick={() => resetColumnWidth('rail')}
        />
        <div className="cv-listwrap">
          <NoteTimeline
            listRef={listRef}
            anchorGapRef={anchorGapRef}
            sections={sections}
            sort={sort}
            selectedNoteId={previewVisible ? currentNoteId : null}
            selectedSectionId={previewVisible ? currentSectionId : null}
            checkedIds={visibleChecked}
            draggingIds={draggingIds}
            dropMark={rowDrop}
            parsed={parsed}
            highlight={highlight}
            sectionTagColors={sectionTagColors}
            handlers={handlers}
            emptyLabel={emptyLabel}
            onKeyDown={onListKeyDown}
          />
          {selectionActive && (
            <div className="cv-sbar">
              <SelectionBar
                count={checkedNotes.length}
                allFavorited={checkedNotes.every((n) => n.favorited)}
                allArchived={checkedNotes.every((n) => n.archived)}
                groups={groups}
                currentGroupId={currentGroupId}
                currentGroupFolders={currentGroupId ? folders.filter((f) => f.groupId === currentGroupId).sort((a, b) => a.order - b.order) : undefined}
                onFavorite={batchFavorite}
                onArchive={batchArchive}
                onMoveToGroup={batchMoveToGroup}
                onMoveToFolder={batchMoveToFolder}
                onDelete={() => setConfirmDelete(true)}
                onClear={clearChecked}
              />
            </div>
          )}
        </div>
        {previewVisible && (
          <ColumnHandle
            label={t.contentView.resizeColumn}
            onMouseDown={(e) => startResize(e, 'preview')}
            onDoubleClick={() => resetColumnWidth('preview')}
          />
        )}
        <SectionPreviewPane
          paneRef={previewRef}
          open={previewVisible}
          note={currentNote}
          sectionId={currentSectionId}
          groupName={previewGroup?.name ?? null}
          groupChannels={previewGroup ? colorChannels(previewGroup.color) : null}
          folderName={previewFolder?.name ?? null}
          folderIcon={previewFolder?.icon}
          sectionTagColors={sectionTagColors}
          onClose={() => { setPreviewOpen(false); focusList() }}
          onOpenInEditor={() => { if (current) openInEditor(current.noteId, current.sectionId) }}
        />
      </div>

      {/* ── Keyboard hints ── */}
      <footer className="cv-hint" aria-hidden>
        <span><span className="cv-kbd">↑</span> <span className="cv-kbd">↓</span> {t.contentView.hintNote}</span>
        <span><span className="cv-kbd">←</span> <span className="cv-kbd">→</span> {t.contentView.hintSection}</span>
        <span><span className="cv-kbd">Enter</span> {t.contentView.hintOpen}</span>
        <span><span className="cv-kbd">Esc</span> {t.contentView.hintClose}</span>
        <span>{t.contentView.hintDrag}</span>
        {sort === 'sidebar' && <span>{t.contentView.hintReorder}</span>}
      </footer>

      {confirmDelete && (
        <ConfirmModal
          title={checkedNotes.length === 1 ? t.common.deleteNote : t.overview.deleteNotes}
          message={
            (checkedNotes.length === 1
              ? tf(t.common.deleteNoteMessage, { title: checkedNotes[0]?.title || t.common.untitled })
              : tf(t.overview.deleteNotesMessage, { count: checkedNotes.length }))
            // Linked notes (external .md) are only unlinked: their files stay.
            + (checkedNotes.some((n) => n.linked)
              ? `\n\n${tf(t.linked.unlinkNotes, { count: checkedNotes.filter((n) => n.linked).length })}`
              : '')
          }
          confirmLabel={t.common.delete}
          danger
          onConfirm={batchDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

interface ColumnHandleProps {
  label: string
  onMouseDown: (e: ReactMouseEvent) => void
  onDoubleClick: () => void
}

/** Vertical drag handle between two columns (the sidebar's look); double click resets the width. */
function ColumnHandle({ label, onMouseDown, onDoubleClick }: ColumnHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      className="cv-rsz w-1 flex-shrink-0 cursor-col-resize hover:bg-text/30 active:bg-text/50 transition-colors"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    />
  )
}
