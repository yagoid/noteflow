import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { nanoid } from 'nanoid'
import {
  X, Star, FileText, Lock, Plus, EyeOff, Eye, Trash2, Check, Pencil, Edit3, Code,
  CheckSquare, Square, LayoutGrid, MoreHorizontal,
} from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { useThemeStore } from '../../stores/themeStore'
import { useEditorSettingsStore, proseFontStack } from '../../stores/editorSettingsStore'
import { NoteContextMenu, type NoteContextMenuRequest } from '../NoteContextMenu'
import { ConfirmModal } from '../ConfirmModal'
import { SectionCardContent } from './SectionCardContent'
import { useT } from '../../i18n/useT'
import { tf, plural } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import { sidebarAnchorRef } from '../Sidebar/sidebarAnchor'
import { colorChannels, resolveGroupColor } from '../../lib/tagColors'
import { firstValidDate } from '../../lib/dateUtils'
import { moveSectionInList, moveSectionToEnd } from '../../lib/sectionUtils'
import { primaryPaneForNote } from '../../lib/paneUtils'
import { reorderDropSide } from '../../lib/sectionMap'
import { resolveSectionInk } from '../../lib/sectionInk'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import {
  gridColumnCount, gridNeighbor, planNoteGrid, sectionCardIsWide, type GridDirection,
} from '../../lib/noteOverviewGrid'
import type { NoteSection } from '../../types'

// A plain click on a section NAME waits this long before opening the section, so a
// double click there can rename it instead (see handleNameClick). Elsewhere on the card a
// click opens at once.
const NAME_CLICK_DELAY = 250

const ARROW_DIRECTIONS: Record<string, GridDirection> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
}

type DropTarget =
  | {
      kind: 'section'
      sectionId: string
      /** Joint the dragged card lands on (reorderDropSide / moveSectionInList). */
      side: 'before' | 'after'
      /** That joint is the block's edge (clipped): the bar goes inside the card. */
      inside: boolean
    }
  /** Over the "New section" cell: the card goes to the end of the list. */
  | { kind: 'end' }

/**
 * Whether a modal dialog (ConfirmModal, EncryptionModal… — `aria-modal`) is open, e.g. the
 * delete confirm or the unlock prompt that the ⋯ / right-click menu opens on its own.
 */
const hasOpenModal = () => document.querySelector('[aria-modal="true"]') !== null

interface NoteOverviewProps {
  noteId: string
  onClose: () => void
}

/**
 * Every section of a note as a cell of one reticulated block (the editor's section map
 * with the content preview inside). See "Vista de nota (note overview)" in
 * .claude/context/patterns.md.
 */
export function NoteOverview({ noteId, onClose }: NoteOverviewProps) {
  const t = useT()
  const note = useNotesStore((s) => s.notes.find((n) => n.id === noteId) ?? null)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const updateNote = useNotesStore((s) => s.updateNote)
  // Section writes merge onto the LATEST sections (an open editor pane or window may be
  // editing this note) — see patterns.md "Sync entre ventanas".
  const mutateSections = useNotesStore((s) => s.mutateSections)
  const updateSection = useNotesStore((s) => s.updateSection)
  // Where the editor stands on this note: the section of its pane (the active pane when
  // it shows this note; '' if not recorded yet). Null when no pane has the note open.
  const paneSectionId = useNotesStore((s) => {
    const pane = primaryPaneForNote({ panes: s.openPanes, activePaneId: s.activePaneId }, noteId)
    return pane ? pane.sectionId ?? '' : null
  })
  const rememberedSectionId = useNotesStore((s) => s.activeSectionByNote[noteId] ?? '')
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  // Only to recompute the inks when the theme (or its accent) changes.
  const themeId = useThemeStore((s) => s.activeThemeId)
  const accentOverride = useThemeStore((s) => s.accentOverride)
  // The previews (rich and raw) use the editor's font, as the open section would.
  const proseFont = proseFontStack(useEditorSettingsStore((s) => s.fontFamily))

  // One menu slot: a section's right-click menu, or the note menu of the ⋯ button.
  const [contextMenu, setContextMenu] = useState<NoteContextMenuRequest | null>(null)

  // ── Multi-select (by section id, never index) ────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  // The card last toggled — shift-click selects the range from it to the clicked one.
  const anchorIdRef = useRef<string | null>(null)

  const [confirm, setConfirm] = useState<'delete-sections' | null>(null)

  // ── Inline title edit (debounced, like NoteEditor) ───────────────────────────
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(note?.title ?? '')
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Inline section rename ────────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Guards the commit: Enter commits, then the input's blur would commit again.
  const renameOpenRef = useRef(false)
  const nameClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Any other interaction in the view (selecting, a menu, Ctrl+A, a drag…) cancels a
  // pending open from a click on a section name.
  const clearNameClickTimer = useCallback(() => {
    if (nameClickTimerRef.current) clearTimeout(nameClickTimerRef.current)
    nameClickTimerRef.current = null
  }, [])

  // ── Drag & drop reorder (same model as the editor's section map) ─────────────
  const dragIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)

  const locked = Boolean(note?.encryption && note.sections.length === 0)

  // Note vanished (deleted locally or via sync) → close the overview
  useEffect(() => {
    if (!note) onClose()
  }, [note, onClose])

  // Note: `App.tsx` keys this view by noteId, so switching notes remounts the
  // component — selection/title/anchor state resets for free, no effect needed.

  useEffect(() => () => {
    if (nameClickTimerRef.current) clearTimeout(nameClickTimerRef.current)
  }, [])

  // ── Columns: as many 220px columns as fit (measured before paint, no flash) ──
  const widthRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(4)
  const hasNote = note !== null
  useLayoutEffect(() => {
    const el = widthRef.current
    if (!el) return
    const update = () => setColumns(gridColumnCount(el.clientWidth))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasNote])

  const sections = note?.sections
  const sectionIdsKey = sections?.map((s) => s.id).join('\u0000') ?? ''
  // The section the editor has open on this note (the pane's, else the remembered one,
  // else the first — the order NoteEditor resolves it in), if a pane shows the note.
  const openId = paneSectionId === null || !sections
    ? null
    : [paneSectionId, rememberedSectionId, sections[0]?.id]
        .find((id) => id && sections.some((s) => s.id === id)) ?? null
  // Sections with a long content get a wider card (a key, so the plan only changes when a
  // section crosses the threshold, not on every edit).
  const wideIdsKey = useMemo(
    () => sections?.filter((s) => sectionCardIsWide(s.content)).map((s) => s.id).join('\u0000') ?? '',
    [sections],
  )
  const plan = useMemo(
    () => planNoteGrid(
      sectionIdsKey ? sectionIdsKey.split('\u0000') : [],
      openId,
      columns,
      new Set(wideIdsKey ? wideIdsKey.split('\u0000') : []),
    ),
    [sectionIdsKey, openId, columns, wideIdsKey],
  )

  // ── Inks: on the open section's solid header, and on the accent (checkboxes) ──
  const openedSection = openId && sections ? sections.find((s) => s.id === openId) ?? null : null
  const openColor = openedSection ? resolveGroupColor(openedSection.name, sectionTagColors) : null
  const openAiHidden = !!openedSection?.aiHidden
  const openInk = useMemo(
    () => (openColor ? resolveSectionInk(openColor, openAiHidden) : undefined),
    // themeId/accentOverride: the vars it reads change with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openColor, openAiHidden, themeId, accentOverride],
  )
  const accentInk = useMemo(
    () => resolveSectionInk('--accent', false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeId, accentOverride],
  )

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    anchorIdRef.current = null
  }, [])

  // Select-all toggle (header button + Ctrl/Cmd+A): if every section is already
  // selected → clear the selection; otherwise select them all.
  const toggleSelectAll = useCallback(() => {
    if (!note || locked || note.sections.length === 0) return
    clearNameClickTimer()
    if (note.sections.every((s) => selectedIds.has(s.id))) clearSelection()
    else setSelectedIds(new Set(note.sections.map((s) => s.id)))
  }, [note, locked, selectedIds, clearSelection, clearNameClickTimer])

  // Whether this keydown started with a menu or a modal open, recorded in the CAPTURE phase:
  // it runs before every bubble-phase window listener, so the answer doesn't depend on
  // whether the modal's own Escape listener (which closes it) runs before or after ours.
  const contextMenuRef = useRef(contextMenu)
  useLayoutEffect(() => { contextMenuRef.current = contextMenu })
  const overlayAtKeyDownRef = useRef(false)
  useEffect(() => {
    const snapshot = () => {
      overlayAtKeyDownRef.current = contextMenuRef.current !== null || hasOpenModal()
    }
    window.addEventListener('keydown', snapshot, true)
    return () => window.removeEventListener('keydown', snapshot, true)
  }, [])

  // Keyboard: Escape clears an active selection first, then closes; Ctrl/Cmd+A selects
  // every section. Both no-op while an inline edit (title, section name) owns the keys, and
  // while a menu or a modal (the delete confirm, the ⋯ menu's confirm/unlock…) is open —
  // those close themselves on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingTitle || renamingId || confirm || overlayAtKeyDownRef.current) return
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
  }, [onClose, selectedIds, editingTitle, renamingId, confirm, clearSelection, toggleSelectAll])

  // Safety net: a drag that ends on another target, or whose source card unmounted
  // mid-drag. `drop` in the bubble phase: in capture it would run before the block's own
  // onDrop and clear the drag it is about to commit (same as the section map).
  const endDrag = useCallback(() => {
    dragIdRef.current = null
    setDraggingId(null)
    setDrop(null)
  }, [])
  useEffect(() => {
    const onEnd = () => { if (dragIdRef.current) endDrag() }
    window.addEventListener('dragend', onEnd, true)
    window.addEventListener('drop', onEnd)
    return () => {
      window.removeEventListener('dragend', onEnd, true)
      window.removeEventListener('drop', onEnd)
    }
  }, [endDrag])

  // ── Handlers (read through a ref so the memoised cells get stable callbacks) ──
  const gridRef = useRef<HTMLDivElement>(null)
  const planRef = useRef(plan)
  useLayoutEffect(() => { planRef.current = plan })
  // Derived against the live sections (ids of deleted sections never count).
  const selectionActive = !!sections && sections.some((s) => selectedIds.has(s.id))
  const selectionActiveRef = useRef(selectionActive)
  useLayoutEffect(() => { selectionActiveRef.current = selectionActive })

  // Navigate straight to a clicked section. Stash it in pendingInitialSectionId so the editor
  // (which mounts fresh once the overview closes) opens on the right section with no flash, and
  // re-assert it via the request-section event once the editor is listening — same dance the
  // content view and brain view use.
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
    const newSection: NoteSection = { id: nanoid(6), name: 'New', content: '', created: new Date().toISOString() }
    await mutateSections(note.id, (list) => [...list, newSection])
    openSection(newSection.id)
  }

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

  const focusCard = (sectionId: string) => {
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-open-id="${CSS.escape(sectionId)}"]`)
      ?.focus()
  }

  const startRename = (sectionId: string) => {
    const section = note?.sections.find((s) => s.id === sectionId)
    if (!section || locked) return
    clearNameClickTimer()
    renameOpenRef.current = true
    setRenamingId(sectionId)
    setRenameValue(section.name)
  }

  const finishRename = (commit: boolean) => {
    if (!renameOpenRef.current || !renamingId || !note) return
    renameOpenRef.current = false
    const id = renamingId
    const trimmed = renameValue.trim()
    const section = note.sections.find((s) => s.id === id)
    if (commit && trimmed && section && trimmed !== section.name) {
      void updateSection(note.id, id, { name: trimmed })
    }
    setRenamingId(null)
    // Back on the card (keyboard users keep their place; a blur elsewhere keeps its focus).
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) focusCard(id)
    })
  }

  const handlers = {
    // Shift-click extends a range; Ctrl/Cmd-click toggles; a plain click while a
    // selection is active toggles too. Otherwise a click (or Enter) opens the section.
    cardClick: (e: React.MouseEvent, sectionId: string) => {
      if (e.shiftKey) { e.preventDefault(); selectRangeTo(sectionId); return }
      if (selectionActiveRef.current || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        clearNameClickTimer()
        toggleSelected(sectionId)
        return
      }
      openSection(sectionId)
    },
    // The name opens like the rest of the card, but a plain click waits NAME_CLICK_DELAY:
    // the second click of a double click (detail 2) cancels it and renames instead. A
    // double click slower than the delay just opens the section (never a destructive miss).
    nameClick: (e: React.MouseEvent, sectionId: string) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey || selectionActiveRef.current) {
        handlers.cardClick(e, sectionId)
        return
      }
      clearNameClickTimer()
      if (e.detail >= 2) {
        if (e.detail === 2) startRename(sectionId)
        return
      }
      nameClickTimerRef.current = setTimeout(() => {
        nameClickTimerRef.current = null
        // Something else started meanwhile (a selection, a rename): don't leave the view.
        if (selectionActiveRef.current || renameOpenRef.current) return
        openSection(sectionId)
      }, NAME_CLICK_DELAY)
    },
    toggle: (e: React.MouseEvent, sectionId: string) => {
      clearNameClickTimer()
      if (e.shiftKey) selectRangeTo(sectionId)
      else toggleSelected(sectionId)
    },
    contextMenu: (e: React.MouseEvent, sectionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      clearNameClickTimer()
      setContextMenu({ x: e.clientX, y: e.clientY, noteId, sectionId })
    },
    // Arrows move the focus between cells (left/right in tab order, up/down by row);
    // F2 renames. Enter/Space are the button's own click.
    keyDown: (e: React.KeyboardEvent, sectionId: string) => {
      const dir = ARROW_DIRECTIONS[e.key]
      if (dir && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        const next = gridNeighbor(planRef.current, sectionId, dir)
        if (next) focusCard(next)
        return
      }
      if (e.key === 'F2') { e.preventDefault(); startRename(sectionId) }
    },
    // The id lives in a ref for the handlers; the visual "hole" is set a frame later so
    // the browser's drag image is captured from the card as it looks.
    dragStart: (e: React.DragEvent, sectionId: string) => {
      clearNameClickTimer()
      dragIdRef.current = sectionId
      e.dataTransfer.effectAllowed = 'move'
      requestAnimationFrame(() => {
        if (dragIdRef.current === sectionId) setDraggingId(sectionId)
      })
    },
    dragEnd: () => endDrag(),
    renameChange: (value: string) => setRenameValue(value),
    renameCommit: () => finishRename(true),
    renameCancel: () => finishRename(false),
  }
  const handlersRef = useRef(handlers)
  useLayoutEffect(() => { handlersRef.current = handlers })
  // Stable facade for the memoised cells.
  const actions = useMemo<CellActions>(() => ({
    cardClick: (e, id) => handlersRef.current.cardClick(e, id),
    nameClick: (e, id) => handlersRef.current.nameClick(e, id),
    toggle: (e, id) => handlersRef.current.toggle(e, id),
    contextMenu: (e, id) => handlersRef.current.contextMenu(e, id),
    keyDown: (e, id) => handlersRef.current.keyDown(e, id),
    dragStart: (e, id) => handlersRef.current.dragStart(e, id),
    dragEnd: () => handlersRef.current.dragEnd(),
    renameChange: (v) => handlersRef.current.renameChange(v),
    renameCommit: () => handlersRef.current.renameCommit(),
    renameCancel: () => handlersRef.current.renameCancel(),
  }), [])

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
  // Drives the select-all toggle in the header, and blocks the delete action: wiping out
  // every section would leave the note empty (delete the note instead).
  const selectingAll = sectionCount > 0 && selectedCount === sectionCount
  // Mirror the context menu: AI visibility is unavailable on encrypted notes.
  const aiActionAvailable = !note.encryption && selectedCount > 0
  const allHidden = selectedCount > 0 && selectedSections.every((s) => s.aiHidden)
  const allRaw = selectedCount > 0 && selectedSections.every((s) => s.isRawMode)
  const noteMenuOpen = contextMenu?.sectionId === null
  const updatedDate = firstValidDate(note.updated)
  const sectionsById = new Map(note.sections.map((s) => [s.id, s]))

  const deleteSelectedSections = () => {
    setConfirm(null)
    const ids = new Set(selectedIds)
    // Never leave the note without sections (delete the note instead).
    void mutateSections(note.id, (list) => {
      const kept = list.filter((s) => !ids.has(s.id))
      return kept.length > 0 && kept.length < list.length ? kept : null
    })
    clearSelection()
  }

  const toggleSelectedAiHidden = () => {
    // If every selected section is already hidden → reveal all; otherwise hide all.
    const hide = !allHidden
    const ids = new Set(selectedIds)
    void mutateSections(note.id, (list) =>
      list.map((s) => (ids.has(s.id) ? { ...s, aiHidden: hide } : s)),
    )
  }

  const toggleSelectedRawMode = () => {
    // If every selected section is already raw → back to the editor; otherwise raw for all.
    // Only the flag moves here: the content stays exactly as it is.
    const raw = !allRaw
    const ids = new Set(selectedIds)
    void mutateSections(note.id, (list) =>
      list.map((s) => (ids.has(s.id) ? { ...s, isRawMode: raw } : s)),
    )
  }

  // ── Drop targets: the joint of the hovered card (the map's 4px accent bar) ──
  const handleSlotDragOver = (e: React.DragEvent, sectionId: string, edge: { first: boolean; last: boolean }) => {
    const draggedId = dragIdRef.current
    if (!draggedId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedId === sectionId) { setDrop(null); return }
    const side = reorderDropSide(note.sections, draggedId, sectionId)
    if (!side) return
    const inside = side === 'before' ? edge.first : edge.last
    setDrop((prev) =>
      prev?.kind === 'section' && prev.sectionId === sectionId && prev.side === side && prev.inside === inside
        ? prev
        : { kind: 'section', sectionId, side, inside })
  }

  // Over "New section": the card goes last (nothing to do if it already is).
  const handleAddDragOver = (e: React.DragEvent) => {
    const draggedId = dragIdRef.current
    if (!draggedId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (note.sections[note.sections.length - 1]?.id === draggedId) { setDrop(null); return }
    setDrop((prev) => (prev?.kind === 'end' ? prev : { kind: 'end' }))
  }

  // The joints and "New section" sit between cards: still a valid drop zone (the last
  // target is kept), so the cursor doesn't flicker to "no drop" crossing a gap.
  const handleBlockDragOver = (e: React.DragEvent) => {
    if (!dragIdRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleBlockDrop = (e: React.DragEvent) => {
    const draggedId = dragIdRef.current
    if (!draggedId) return
    e.preventDefault()
    if (drop?.kind === 'end') {
      void mutateSections(note.id, (list) => moveSectionToEnd(list, draggedId))
    } else if (drop && drop.sectionId !== draggedId) {
      const targetId = drop.sectionId
      void mutateSections(note.id, (list) => moveSectionInList(list, draggedId, targetId))
    }
    endDrag()
  }

  // dragleave bubbles from card to card: only clear when the pointer leaves the block.
  const handleBlockDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setDrop(null)
  }

  const toggleNoteMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Not on to window: the open menu's outside-click listener would close it.
    e.stopPropagation()
    clearNameClickTimer()
    if (noteMenuOpen) { setContextMenu(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    // w-48 (192px) menu, right-aligned under the button; ContextMenu keeps it on screen.
    setContextMenu({ x: rect.right - 192, y: rect.bottom + 4, noteId: note.id, sectionId: null })
  }

  // Where the bar of an "end" drop is drawn: the joint before "New section" — or, when that
  // cell is a strip of its own (the last row was full), after the last card (inside it, as
  // the block's edge clips the joint).
  const lastRow = plan[plan.length - 1]
  const addStartsRow = lastRow?.cells[0]?.kind === 'add'
  const lastSectionId = note.sections[note.sections.length - 1]?.id ?? null
  const endDrop = drop?.kind === 'end'

  const rootStyle = {
    background: 'rgb(var(--bg-editor))',
    '--ng-accent-ink': accentInk,
  } as CSSProperties

  return (
    <div className="h-full w-full flex flex-col font-mono" style={rootStyle}>
      {/* ── Header: same plane as the content (no band, no border), outside the scroll area ── */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-[14px] pt-3 pb-2.5">
        <div className="flex-1 min-w-0 flex items-baseline gap-3 h-7 pl-0.5">
          {note.encryption && <Lock size={13} className="text-amber-400 flex-shrink-0 self-center" />}
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
              aria-label={t.noteMenu.renameNote}
              className="self-center text-[15px] font-bold text-text bg-surface-1 border border-text/25 rounded px-1.5 py-0.5 outline-none focus:border-text/40 min-w-0 flex-shrink"
            />
          ) : (
            <button
              onClick={startTitleEdit}
              disabled={locked}
              title={locked ? undefined : t.noteMenu.renameNote}
              className={`group/title self-center flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1 transition-colors ${
                locked ? 'cursor-default' : 'hover:bg-text/5'
              }`}
            >
              <h1 className="text-[15px] leading-7 font-bold text-text truncate">
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
          <span className="text-xs text-text-muted whitespace-nowrap truncate min-w-0">
            {plural(t.overview.sectionsPlural, sectionCount)}
            {updatedDate && <>{' · '}{tf(t.overview.editedAt, { date: formatDate(updatedDate, 'd MMM yyyy · HH:mm') })}</>}
          </span>
        </div>

        {!locked && sectionCount > 0 && (
          <button
            onClick={toggleSelectAll}
            className="note-grid-ghost px-2.5 flex-shrink-0"
            title={selectingAll ? t.overview.deselectAllTooltip : t.overview.selectAllTooltip}
          >
            {selectingAll ? <CheckSquare size={13} /> : <Square size={13} />}
            {selectingAll ? t.overview.deselectAll : t.overview.selectAll}
          </button>
        )}
        <div className="flex items-center gap-0.5 h-7 flex-shrink-0">
          <span className="w-px h-4 bg-border mr-1.5" aria-hidden />
          <button
            onClick={onClose}
            aria-pressed="true"
            aria-label={t.overview.closeOverview}
            title={t.overview.closeOverview}
            className="note-grid-ghost"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            onClick={() => updateNote(note.id, { favorited: !note.favorited })}
            aria-label={note.favorited ? t.common.removeFromFavorites : t.common.addToFavorites}
            title={note.favorited ? t.common.removeFromFavorites : t.common.addToFavorites}
            className={`note-grid-ghost${note.favorited ? ' is-favorite' : ''}`}
          >
            <Star size={13} fill={note.favorited ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={toggleNoteMenu}
            aria-label={t.overview.noteOptions}
            aria-haspopup="menu"
            aria-expanded={noteMenuOpen}
            title={t.overview.noteOptionsTooltip}
            className="note-grid-ghost"
          >
            <MoreHorizontal size={13} />
          </button>
        </div>
      </div>

      {/* ── Scroll area (only this scrolls — the scrollbar starts below the header) ──
          Also the floating sidebar's content anchor (it lines up below the header). */}
      <div className="flex-1 min-h-0 overflow-y-auto relative" data-sidebar-anchor ref={sidebarAnchorRef}>
      <div className="px-[14px] pt-1 pb-6">
        <div ref={widthRef}>
        {locked ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <Lock size={28} className="text-text-muted/40" />
            <p className="text-sm text-text-muted">{t.overview.noteEncrypted}</p>
            <p className="text-xs text-text-muted/60">{t.overview.unlockToPreview}</p>
          </div>
        ) : (
          <>
            {sectionCount === 0 && (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <FileText size={28} className="text-text-muted/40" />
                <p className="text-sm text-text-muted">{t.overview.noSections}</p>
              </div>
            )}
            <div
              ref={gridRef}
              role="list"
              aria-label={t.overview.sectionsListLabel}
              className={`note-grid${selectionActive ? ' is-selecting' : ''}`}
              style={{ '--prose-font-family': proseFont } as CSSProperties}
              onDragOver={handleBlockDragOver}
              onDrop={handleBlockDrop}
              onDragLeave={handleBlockDragLeave}
            >
              {plan.map((row, r) => (
                <div key={r} role="none" className={`note-grid-row${row.slim ? ' is-slim' : ''}`}>
                  {row.cells.map((cell, j) => {
                    const flex = `${cell.units} 1 0px`
                    if (cell.kind === 'add') {
                      return (
                        <div
                          key="add"
                          role="listitem"
                          className="note-grid-slot"
                          style={{ flex }}
                          onDragOver={handleAddDragOver}
                        >
                          <button
                            className="note-grid-add"
                            onClick={() => void addSection()}
                            title={t.overview.addSectionTooltip}
                          >
                            <Plus size={13} strokeWidth={2.2} />
                            {t.overview.newSection}
                          </button>
                          {endDrop && !addStartsRow && (
                            <span className="section-map-drop" data-side="before" aria-hidden />
                          )}
                        </div>
                      )
                    }
                    const section = sectionsById.get(cell.id)
                    if (!section) return null
                    const isOpen = section.id === openId
                    const edge = { first: j === 0, last: j === row.cells.length - 1 }
                    const dropHere = drop?.kind === 'section'
                      ? (drop.sectionId === section.id && draggingId !== section.id ? drop : null)
                      : endDrop && addStartsRow && section.id === lastSectionId
                        ? { side: 'after' as const, inside: true }
                        : null
                    return (
                      <div
                        key={section.id}
                        role="listitem"
                        className="note-grid-slot"
                        style={{ flex }}
                        onDragOver={(e) => handleSlotDragOver(e, section.id, edge)}
                      >
                        <SectionCell
                          section={section}
                          color={`rgb(${colorChannels(resolveGroupColor(section.name, sectionTagColors))})`}
                          ink={isOpen ? openInk : undefined}
                          isOpen={isOpen}
                          selected={selectedIds.has(section.id)}
                          dragging={draggingId === section.id}
                          renaming={renamingId === section.id}
                          renameValue={renamingId === section.id ? renameValue : ''}
                          actions={actions}
                        />
                        {dropHere && (
                          <span
                            className="section-map-drop"
                            data-side={dropHere.side}
                            data-inside={dropHere.inside ? '' : undefined}
                            aria-hidden
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </>
        )}
        </div>
      </div>

      {/* ── Floating selection bar — sticks to the bottom while scrolling ── */}
      {selectionActive && (
        <div className="sticky bottom-0 z-20 pointer-events-none flex justify-center px-6 pb-[18px]">
          <div className="note-grid-sbar-wrap pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <div className="note-grid-sbar" role="toolbar" aria-label={t.overview.selectionActions}>
              <span className="note-grid-sbar-btn is-count">
                {tf(t.overview.selectedCount, { count: selectedCount })}
              </span>

              {aiActionAvailable && (
                <button
                  onClick={toggleSelectedAiHidden}
                  title={allHidden ? t.overview.aiShowTooltip : t.overview.aiHideTooltip}
                  className="note-grid-sbar-btn"
                >
                  {allHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                  {allHidden ? t.common.showToAI : t.common.hideFromAI}
                </button>
              )}

              <button
                onClick={toggleSelectedRawMode}
                title={allRaw ? t.overview.modeEditorTooltip : t.overview.modeRawTooltip}
                className="note-grid-sbar-btn"
              >
                {allRaw ? <Edit3 size={13} /> : <Code size={13} />}
                {allRaw ? t.overview.modeEditor : t.overview.modeRaw}
              </button>

              <button
                onClick={() => setConfirm('delete-sections')}
                disabled={selectingAll}
                title={selectingAll ? t.overview.cantDeleteAllSections : t.overview.deleteSelected}
                className="note-grid-sbar-btn is-danger"
              >
                <Trash2 size={13} />
                {t.common.delete}
              </button>

              <button
                onClick={clearSelection}
                aria-label={t.overview.clearSelection}
                title={t.overview.clearSelection}
                className="note-grid-sbar-btn is-icon"
              >
                <X size={13} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Section right-click menu, and the note menu of the ⋯ button (Delete note lives
          there, with its own confirm — and the unlock first on a locked note). */}
      <NoteContextMenu
        request={contextMenu}
        onClose={() => setContextMenu(null)}
        onRenameNote={startTitleEdit}
      />

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
    </div>
  )
}

// ── Section cell — memoised: typing in one section re-renders only its card ────────
interface CellActions {
  cardClick: (e: React.MouseEvent, sectionId: string) => void
  nameClick: (e: React.MouseEvent, sectionId: string) => void
  toggle: (e: React.MouseEvent, sectionId: string) => void
  contextMenu: (e: React.MouseEvent, sectionId: string) => void
  keyDown: (e: React.KeyboardEvent, sectionId: string) => void
  dragStart: (e: React.DragEvent, sectionId: string) => void
  dragEnd: () => void
  renameChange: (value: string) => void
  renameCommit: () => void
  renameCancel: () => void
}

interface SectionCellProps {
  section: NoteSection
  /** The section colour as a CSS colour (`rgb(...)`). */
  color: string
  /** Readable ink on the solid header (open section only). */
  ink?: string
  /** The section the editor has open: solid header, two columns, "OPEN" tag. */
  isOpen: boolean
  selected: boolean
  dragging: boolean
  renaming: boolean
  renameValue: string
  actions: CellActions
}

const SectionCell = memo(function SectionCell({
  section, color, ink, isOpen, selected, dragging, renaming, renameValue, actions,
}: SectionCellProps) {
  const t = useT()
  const label = tf(isOpen ? t.overview.backToSection : t.overview.openSection, { name: section.name })

  const className = [
    'note-grid-cell',
    isOpen && 'is-open',
    section.aiHidden && 'is-ai-hidden',
    selected && 'is-selected',
    dragging && 'is-dragging',
  ].filter(Boolean).join(' ')
  const style = { '--sm-color': color, ...(ink ? { '--sm-ink': ink } : {}) } as CSSProperties

  return (
    <div
      className={className}
      style={style}
      draggable={!renaming}
      onDragStart={(e) => actions.dragStart(e, section.id)}
      onDragEnd={actions.dragEnd}
      onContextMenu={(e) => {
        // Not over the inline rename input: its name isn't saved yet (and colours are
        // keyed by section name).
        if (renaming) return
        actions.contextMenu(e, section.id)
      }}
    >
      <div className="note-grid-head">
        {section.aiHidden && (
          <EyeOff size={12} className="flex-shrink-0 opacity-75" role="img" aria-label={t.common.hiddenFromAI} />
        )}
        {renaming ? (
          <input
            autoFocus
            {...OWN_KEYS_PROPS}
            value={renameValue}
            aria-label={t.noteMenu.renameSection}
            onChange={(e) => actions.renameChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={actions.renameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); actions.renameCommit() }
              if (e.key === 'Escape') {
                // Not on to window: the view's Escape would clear the selection / close.
                e.preventDefault()
                e.stopPropagation()
                actions.renameCancel()
              }
            }}
            className="note-grid-rename"
          />
        ) : (
          <span
            className="note-grid-name"
            title={t.overview.doubleClickRename}
            onClick={(e) => actions.nameClick(e, section.id)}
          >
            {section.name}
          </span>
        )}
        {isOpen && !renaming && <span className="note-grid-tag">{t.overview.openTag}</span>}
      </div>

      {/* Body + foot (memoised by content inside), shared with the hover card. */}
      <SectionCardContent content={section.content} raw={!!section.isRawMode} aiHidden={!!section.aiHidden} />

      <button
        className="note-grid-open"
        data-open-id={section.id}
        aria-label={label}
        title={tf(t.overview.cardTooltip, { label })}
        onClick={(e) => actions.cardClick(e, section.id)}
        onKeyDown={(e) => actions.keyDown(e, section.id)}
      />
      {!isOpen && <span className="section-map-corner" aria-hidden />}
      <button
        className="note-grid-tick"
        role="checkbox"
        aria-checked={selected}
        aria-label={t.overview.selectSection}
        title={t.overview.selectSection}
        onClick={(e) => actions.toggle(e, section.id)}
      >
        <Check size={11} strokeWidth={3.4} />
      </button>
    </div>
  )
})
