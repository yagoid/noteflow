import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useNotesStore, saveUiState } from '../../stores/notesStore'
import { useTemplatesStore } from '../../stores/templatesStore'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { Editor } from './Editor'
import type { EditorHandle } from './Editor'
import { InNoteSearchBar } from './InNoteSearchBar'
import { RawNoteSearchBar } from './RawNoteSearchBar'
import type { GroupColor, NoteSection } from '../../types'
import { nanoid } from 'nanoid'
import {
  Star, Trash2, Copy, Eye, Edit3, EyeOff,
  Plus, X, Check, ExternalLink, Lock, RotateCcw, MoreHorizontal, Archive, LayoutGrid, LayoutTemplate, Timer, TimerOff,
  CopyPlus, Share,
} from 'lucide-react'
import { formatDate } from '../../i18n/formatDate'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { ConfirmModal } from '../ConfirmModal'
import { CustomColorSwatch } from '../CustomColorSwatch'
import { EncryptionModal } from '../EncryptionModal'
import { colorChannels, getTagColor, normalizeTagColorKey, resolveGroupColor, TAG_COLOR_VARS } from '../../lib/tagColors'
import { useSectionHoverPreview } from '../SectionPreview/hoverPreviewContext'
import { getRootZoom } from '../../stores/themeStore'
import { moveSectionInList, restoreSectionInList } from '../../lib/sectionUtils'
import { ownsKeys } from '../../lib/keyScope'
import { SectionNameField } from './SectionNameField'

// ---------------------------------------------------------------------------
// Confirm modal state type
// ---------------------------------------------------------------------------
interface ModalState {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  onConfirm: () => void
}

// Undo of a section delete re-inserts THE section where it was into the current list
// (restoreSectionInList) instead of restoring a snapshot of the whole list, which would
// revert edits made meanwhile by another pane/window of the same note.
interface SectionUndoState {
  noteId: string
  section: NoteSection
  index: number
  previousActiveSectionId: string | null
}

interface NoteEditorProps {
  noteId?: string
  /**
   * Split-view pane this editor renders (see paneUtils). Several panes may show the same
   * note; the pane id is what tells them apart — which one is active, which one a
   * section request targets, and which section each one is on.
   */
  paneId?: string
  /** Rendered in a section window (no main-window shell): hides actions that need it. */
  standalone?: boolean
}

// ---------------------------------------------------------------------------
// Tabs strip auto-scroll
// ---------------------------------------------------------------------------
// Gap left when aligning the active tab against either edge of the strip.
const TAB_SCROLL_PAD = 12
// The right fade gradient (w-6) covers the end of the strip, so it is discounted
// from the usable width to keep the active tab out from under it.
const TAB_FADE_WIDTH = 24
// Edge band that triggers auto-scrolling while a tab is being dragged.
const TAB_DRAG_EDGE = 40
// Px per frame of the drag auto-scroll (~600 px/s at 60 fps).
const TAB_DRAG_SPEED = 10
// Watchdog for the drag auto-scroll loop: the DnD processing model re-fires
// dragover every ~350 ms while a drag is alive, so going this long without one
// means the drag is over even if we never saw its dragend (it fires on the
// source node, which may have unmounted mid-drag). A stray stop is harmless —
// the next dragover restarts the loop.
const TAB_DRAG_STALE_MS = 800

/**
 * Brings the tab of `sectionId` into view by scrolling ONLY the tabs strip.
 * `scrollIntoView()` is deliberately avoided: it would also scroll the ancestors
 * and shift the app layout. Returns false when nothing could be done yet —
 * either the container has no layout (first paint after switching note) or the
 * tab isn't in the DOM.
 */
function revealSectionTab(
  container: HTMLDivElement,
  sectionId: string,
  behavior: ScrollBehavior,
): boolean {
  const viewWidth = container.clientWidth
  if (viewWidth === 0) return false
  const tab = container.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`)
  if (!tab) return false

  // offsetLeft (not getBoundingClientRect) so we stay in the same coordinate
  // space as scrollLeft: the UI zoom scales rects but not the scroll offset.
  // The strip isn't positioned, so the tabs' offsetParent is its `relative`
  // wrapper — hence the subtraction (0 if the strip ever becomes positioned).
  const originLeft = tab.offsetParent === container ? 0 : container.offsetLeft
  const tabLeft = tab.offsetLeft - originLeft
  const tabRight = tabLeft + tab.offsetWidth
  const usableWidth = Math.max(viewWidth - TAB_FADE_WIDTH, 0)
  const viewLeft = container.scrollLeft

  let target: number
  if (tabLeft < viewLeft) target = tabLeft - TAB_SCROLL_PAD
  else if (tabRight > viewLeft + usableWidth) target = tabRight + TAB_SCROLL_PAD - usableWidth
  else return true // fully visible already: don't scroll (avoids spurious jumps)

  const left = Math.max(0, Math.min(target, container.scrollWidth - viewWidth))
  if (Math.abs(left - viewLeft) > 1) container.scrollTo({ left, behavior })
  return true
}

// ---------------------------------------------------------------------------
// NoteEditor
// ---------------------------------------------------------------------------
export function NoteEditor({ noteId, paneId, standalone = false }: NoteEditorProps) {
  const globalActiveNoteId = useNotesStore((s) => s.activeNoteId)
  const activePaneId = useNotesStore((s) => s.activePaneId)
  const resolvedNoteId = noteId ?? globalActiveNoteId
  // By pane when we have one: two panes of the same note must not both be "active".
  const isPaneActive = paneId
    ? activePaneId === paneId
    : Boolean(resolvedNoteId && globalActiveNoteId === resolvedNoteId)
  const note = useNotesStore((s) => {
    const targetId = noteId ?? s.activeNoteId
    return s.notes.find((n) => n.id === targetId) ?? null
  })
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setNoteView = useNotesStore((s) => s.setNoteView)
  const updateNote = useNotesStore((s) => s.updateNote)
  const updateSection = useNotesStore((s) => s.updateSection)
  const mutateSections = useNotesStore((s) => s.mutateSections)
  const focusPane = useNotesStore((s) => s.focusPane)
  const duplicateSection = useNotesStore((s) => s.duplicateSection)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const archiveNote = useNotesStore((s) => s.archiveNote)
  const makeNotePermanent = useNotesStore((s) => s.makeNotePermanent)
  const unlockNote = useNotesStore((s) => s.unlockNote)
  const encryptNote = useNotesStore((s) => s.encryptNote)
  const removeNoteEncryption = useNotesStore((s) => s.removeNoteEncryption)
  const sessionPasswords = useNotesStore((s) => s.sessionPasswords)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const setSectionTagColor = useSectionTagColorsStore((s) => s.setSectionTagColor)
  const clearSectionTagColor = useSectionTagColorsStore((s) => s.clearSectionTagColor)
  const { previewProps } = useSectionHoverPreview()
  const t = useT()

  // Active section by id (not index — stable across reorders)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  // Editor font size (from shared store)
  const { fontSize, changeFontSize, resetFontSize, fontFamily, readableWidth, showToc } = useEditorSettingsStore()

  // Raw (markdown source) mode buffer
  const [rawContent, setRawContent] = useState('')

  // Local title draft — decoupled from store to prevent cursor jump
  const [titleDraft, setTitleDraft] = useState(note?.title ?? '')
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True while the draft holds keystrokes not yet written. Only a dirty draft may be
  // written on blur or shield itself from store updates: a title edited in ANOTHER pane
  // or window must replace this draft even if our input still has focus.
  const titleDirtyRef = useRef(false)

  // Raw mode debounce ref (for sorting: save to store while typing)
  const rawDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Per-section undo/redo stacks for raw mode
  const undoStackMap = useRef<Map<string, string[]>>(new Map())
  const redoStackMap = useRef<Map<string, string[]>>(new Map())
  const lastUndoPushRef = useRef<Map<string, number>>(new Map())

  // Tab rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  // Confirm modal
  const [modal, setModal] = useState<ModalState | null>(null)

  // Unlock modal for encrypted notes
  const [showUnlockModal, setShowUnlockModal] = useState(false)

  // Drag and drop state
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null)
  const [sectionColorPickerId, setSectionColorPickerId] = useState<string | null>(null)
  const [sectionUndo, setSectionUndo] = useState<SectionUndoState | null>(null)
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false)
  const [encryptModalMode, setEncryptModalMode] = useState<'encrypt' | 'remove' | null>(null)
  // null = modal closed; a string = the draft name being edited before saving the template
  const [templateNameDraft, setTemplateNameDraft] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  const pendingSectionRef = useRef<string | null>(null)
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const [tabsOverflow, setTabsOverflow] = useState(false)
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<EditorHandle | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const sectionUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Must be declared before the early return below — calling hooks conditionally
  // (after an early return) violates React's Rules of Hooks and crashes the app
  // when the note temporarily disappears during a sync reload.
  const lastColorPickerSectionRef = useRef<NoteSection | null>(null)
  // Name just committed from the strip's name field (see stripSectionName).
  const stripRenameRef = useRef<{ sectionId: string; from: string; name: string } | null>(null)

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeSection: NoteSection | undefined = note?.sections.find(
    (s) => s.id === activeSectionId,
  ) ?? note?.sections[0]

  const rawMode = activeSection?.isRawMode ?? false

  // ── Reset when the active note changes ─────────────────────────────────────
  useEffect(() => {
    if (!note) return
    const store = useNotesStore.getState()
    const has = (id: string | null | undefined): id is string => !!id && note.sections.some((s) => s.id === id)
    const pending = pendingSectionRef.current
    const initialSection = store.pendingInitialSectionId
    // The section this pane was on (or was opened on: "open section alongside", a
    // section window) — what keeps two panes of the same note on their own sections.
    const paneSection = paneId ? store.openPanes.find((p) => p.paneId === paneId)?.sectionId : undefined
    // Section the user was last on for this note — restores it when the editor
    // remounts (e.g. after closing the brain / overview views).
    const remembered = store.activeSectionByNote[note.id]
    const targetId =
      has(pending) ? pending
        : has(initialSection) ? initialSection
        : has(paneSection) ? paneSection
        : has(remembered) ? remembered
        : note.sections[0]?.id ?? null
    pendingSectionRef.current = null
    // One-shot: consumed by the editor that uses it (or by the active one). With several
    // panes mounting at once, a pane of another note must not swallow it.
    if (initialSection && (has(initialSection) || isPaneActive)) useNotesStore.setState({ pendingInitialSectionId: null })
    setActiveSectionId(targetId)
    setRawContent(note.sections.find((s) => s.id === targetId)?.content ?? '')
    setTitleDraft(note.title)
    titleDirtyRef.current = false
    setRenamingId(null)
    setSectionColorPickerId(null)
    if (targetId && isPaneActive) saveUiState({ activeSectionId: targetId })
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (sectionUndoTimerRef.current) {
        clearTimeout(sectionUndoTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const close = () => { setSectionColorPickerId(null); setSectionMenuOpen(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  // ── Handle section request from sidebar ────────────────────────────────────
  // `paneId` in the detail targets one pane. Without it, a single pane reacts: the active
  // pane of that note, else its first pane, else (note not open) the active pane, which is
  // the one setActiveNote is about to reuse for it. Otherwise two panes of the same note
  // would both jump to the requested section.
  useEffect(() => {
    const handler = (e: Event) => {
      const { noteId: targetNoteId, sectionId, paneId: targetPaneId } =
        (e as CustomEvent<{ noteId: string; sectionId: string; paneId?: string }>).detail
      if (paneId) {
        if (targetPaneId) {
          if (targetPaneId !== paneId) return
        } else {
          const { openPanes, activePaneId: currentActive } = useNotesStore.getState()
          const owners = openPanes.filter((p) => p.noteId === targetNoteId)
          const handlerPane = owners.length > 0
            ? (owners.find((p) => p.paneId === currentActive) ?? owners[0]).paneId
            : currentActive
          if (handlerPane !== paneId) return
        }
      }
      if (noteRef.current?.id === targetNoteId) {
        // Same note: switch section directly
        const section = noteRef.current.sections.find((s) => s.id === sectionId)
        if (section) {
          setRawContent(section.content)
          setActiveSectionId(sectionId)
        }
      } else {
        // Different note: pre-set activeSectionId so the first render with the new note
        // already shows the correct section (avoids flash on sections[0])
        pendingSectionRef.current = sectionId
        setActiveSectionId(sectionId)
      }
    }
    window.addEventListener('noteflow:request-section', handler)
    return () => window.removeEventListener('noteflow:request-section', handler)
  }, [noteId, paneId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-focus title field when new note is created ───────────────────────
  useEffect(() => {
    const newlyCreatedNoteId = useNotesStore.getState().newlyCreatedNoteId
    const currentNoteId = note?.id

    if (currentNoteId === newlyCreatedNoteId) {
      setTimeout(() => {
        const store = useNotesStore.getState()
        const { newlyCreatedNoteId: updatedNewlyCreatedNoteId } = store

        if (updatedNewlyCreatedNoteId && updatedNewlyCreatedNoteId === currentNoteId) {
          try {
            if (titleRef.current && document.activeElement !== titleRef.current) {
              titleRef.current.focus()
              titleRef.current.select()
              store.setNewlyCreatedNoteId(null)
            }
          } catch (error) {
            console.error('Failed to focus title element:', error)
          }
        }
      }, 0)
    }
  }, [note?.id])

  // ── Sync raw buffer with store updates (external changes) ──────────────────
  // Skip if the textarea is focused — same guard as TipTap uses — to avoid
  // resetting the cursor position while the user is actively typing.
  useEffect(() => {
    if (rawTextareaRef.current === document.activeElement) return
    if (activeSection && activeSection.content !== rawContent) {
      setRawContent(activeSection.content)
    }
  }, [activeSection?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync title draft with external store updates ──────────────────────────
  // The per-note init effect only runs on note.id change, so a title updated in the
  // store for the SAME note (e.g. AI profile generation) wouldn't refresh the draft,
  // and a later blur could write the stale draft back over it. Mirror the raw-buffer
  // guard: only re-sync when the title input isn't focused.
  // Only a DIRTY focused draft is protected: an idle focused input (e.g. left focused in
  // a window while the title is edited in another pane or window) must follow the store,
  // or its later blur would write the stale title back.
  useEffect(() => {
    if (titleRef.current === document.activeElement && titleDirtyRef.current) return
    if (note && note.title !== titleDraft) setTitleDraft(note.title)
  }, [note?.title]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref to note so handlers always see the latest value
  const noteRef = useRef(note)
  useEffect(() => { noteRef.current = note })

  // Keep a ref to rawContent so event handlers always see the latest value
  const rawContentRef = useRef(rawContent)
  useEffect(() => { rawContentRef.current = rawContent }, [rawContent])

  // Focus rename input when it appears. We also depend on the section actually
  // being present in the rendered list: for a brand-new section, updateNote is
  // async (it awaits the disk write before the store updates), so the tab — and
  // thus the input — mounts a render later than when renamingId is set. Reacting
  // to its presence ensures we focus once the input is really in the DOM.
  const renamingSectionPresent = renamingId != null && note?.sections.some((s) => s.id === renamingId)
  useEffect(() => {
    if (renamingId && renamingSectionPresent) {
      setTimeout(() => {
        renameRef.current?.focus()
        renameRef.current?.select()
      }, 0)
    }
  }, [renamingId, renamingSectionPresent])

  // Stable ref for activeSectionId (for use inside event handlers)
  const activeSectionIdRef = useRef(activeSectionId)
  useEffect(() => { activeSectionIdRef.current = activeSectionId }, [activeSectionId])

  // Remember the active section per note so it survives editor remounts (brain /
  // overview views unmount the editor; this restores the section on the way back).
  // Also recorded on the pane, so each pane of a split keeps ITS section, and persisted
  // as the main window's active section when this is the active pane.
  // `activeSectionPresent` is a dep on purpose: a section created/restored from here (add,
  // duplicate, undo delete) becomes active BEFORE its queued write lands in the store, so
  // the first run skips it — it must run again once the section exists, or the pane would
  // keep pointing at the previous section.
  const activeSectionPresent = !!activeSectionId && (note?.sections.some((s) => s.id === activeSectionId) ?? false)
  useEffect(() => {
    // Also skips the transitional commit of a note switch (section of the previous note).
    if (!note || !activeSectionId || !activeSectionPresent) return
    const store = useNotesStore.getState()
    store.rememberActiveSection(note.id, activeSectionId)
    if (paneId) store.setPaneSection(paneId, activeSectionId)
    if (isPaneActive) saveUiState({ activeSectionId })
  }, [note?.id, activeSectionId, paneId, activeSectionPresent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Becoming the active pane (click into it, focus from the store…) persists the section
  // it's on — the note is persisted by the store action that activated it.
  useEffect(() => {
    if (!isPaneActive) return
    const current = activeSectionIdRef.current
    if (current && noteRef.current?.sections.some((s) => s.id === current)) saveUiState({ activeSectionId: current })
  }, [isPaneActive])

  // Auto-show unlock modal when switching to a locked encrypted note
  useEffect(() => {
    if (isPaneActive && note?.encryption && !sessionPasswords[note.id]) {
      setShowUnlockModal(true)
    }
  }, [note?.id, isPaneActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-focus editor on new note ──────────────────────────────────────────
  useEffect(() => {
    if (note && note.sections.length === 1 && note.sections[0].content === '') {
      requestAnimationFrame(() => {
        rawTextareaRef.current?.focus()
      })
    }
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Undo/Redo logic ────────────────────────────────────────────────────────
  const pushToUndoStack = useCallback((sectionId: string, prevContent: string) => {
    const now = Date.now()
    const lastTime = lastUndoPushRef.current.get(sectionId) ?? 0
    if (now - lastTime > 500) {
      const stack = undoStackMap.current.get(sectionId) ?? []
      undoStackMap.current.set(sectionId, [...stack, prevContent].slice(-100))
      lastUndoPushRef.current.set(sectionId, now)
      redoStackMap.current.delete(sectionId)
    }
  }, [])

  const openDeleteNoteModal = useCallback(() => {
    if (!note) return
    setModal({
      title: t.common.deleteNote,
      message: tf(t.common.deleteNoteMessage, { title: note.title || t.common.untitled }),
      confirmLabel: t.common.delete,
      danger: true,
      onConfirm: () => { setModal(null); deleteNote(note.id) },
    })
  }, [note, deleteNote, t])

  const handleRawImageInsert = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0 || !activeSection) return
    let insertText = ''
    for (const file of imageFiles) {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      insertText += `![${file.name}](${src})\n`
    }
    const textarea = rawTextareaRef.current
    const pos = textarea?.selectionStart ?? rawContent.length
    const newValue = rawContent.substring(0, pos) + insertText + rawContent.substring(pos)
    setRawContent(newValue)
    if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
    rawDebounceRef.current = setTimeout(() => {
      if (activeSection && noteRef.current) {
        updateSection(noteRef.current.id, activeSection.id, { content: newValue })
      }
    }, 600)
  }, [rawContent, activeSection, updateSection]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect tab overflow to reposition + button ───────────────────────────
  useEffect(() => {
    const el = tabsScrollRef.current
    if (!el) return
    const check = () => setTabsOverflow(el.scrollWidth > el.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [note?.sections])

  // ── Keep the active tab visible in the tabs strip ─────────────────────────
  // Centralized on purpose: the active section changes from many places (tab
  // click, Ctrl+Tab, sidebar, add/delete/undo of a section, restoring the
  // remembered section on note switch), and repeating the scroll in every
  // handler would drift out of sync in no time.
  const activeTabId = activeSection?.id ?? null
  // Membership signature (ids sorted) rather than the rendered order: it still
  // catches add/delete/undo, but it does NOT fire on reorder — after a drop we
  // must not yank the strip back to the active tab, hiding the tab just moved
  // (during the drag itself, the edge auto-scroll below keeps things in view).
  // Either way it ignores plain typing, which rebuilds the sections array.
  const sectionMembershipKey = note?.sections.map((s) => s.id).sort().join('|') ?? ''
  // Around a note switch there is a transitional commit where the stored
  // activeSectionId still belongs to the other note (the reset effect that fixes
  // it is passive, so it runs after this one) and activeSection silently falls
  // back to sections[0]. Revealing that tab would jump to the start of the strip
  // and only then glide to the remembered section — exactly the glitch that the
  // 'auto' behavior is meant to avoid — so those renders are skipped entirely,
  // without consuming the "first reveal for this note" flag.
  const activeTabSettled = note?.sections.some((s) => s.id === activeSectionId) ?? false
  const scrolledNoteIdRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    const container = tabsScrollRef.current
    if (!container || !activeTabId || !activeTabSettled) return
    const noteId = note?.id ?? null
    const firstForNote = scrolledNoteIdRef.current !== noteId
    // Opening/switching note jumps instantly; moving within the same note glides.
    const behavior: ScrollBehavior = firstForNote ? 'auto' : 'smooth'
    scrolledNoteIdRef.current = noteId
    // Layout is already available inside a layout effect, but on the first paint
    // of a note the tabs may not be measured yet → retry on the next frame.
    if (revealSectionTab(container, activeTabId, behavior)) return
    const raf = requestAnimationFrame(() => {
      const el = tabsScrollRef.current
      if (el) revealSectionTab(el, activeTabId, behavior)
    })
    return () => cancelAnimationFrame(raf)
  }, [activeTabId, activeTabSettled, note?.id, sectionMembershipKey])

  // ── The active section vanished (deleted from another pane/window, sync, CLI) ──
  // Fall back to the first section explicitly instead of only rendering sections[0]:
  // otherwise the raw buffer (rawContent) would still hold the deleted section's text
  // and the next keystroke would write it into the fallback section.
  // Only reacts to a membership change of the SAME note: on a note switch the reset
  // effect owns activeSectionId, and a pending cross-note request pre-sets an id that
  // legitimately isn't in this note yet.
  const membershipNoteRef = useRef<string | null>(null)
  useEffect(() => {
    const sameNote = membershipNoteRef.current === (note?.id ?? null)
    membershipNoteRef.current = note?.id ?? null
    if (!sameNote || !note || !activeSectionId || pendingSectionRef.current) return
    if (note.sections.some((s) => s.id === activeSectionId)) return
    const fallback = note.sections[0]
    if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
    setActiveSectionId(fallback?.id ?? null)
    setRawContent(fallback?.content ?? '')
    setRenamingId(null)
  }, [note?.id, sectionMembershipKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edge auto-scroll while dragging a tab ─────────────────────────────────
  // Without it a tab can't be reordered onto an off-screen one: the native drag
  // doesn't scroll the container by itself.
  const dragScrollRef = useRef<{ raf: number | null; dir: -1 | 0 | 1; lastOverAt: number }>(
    { raf: null, dir: 0, lastOverAt: 0 },
  )
  // Strip geometry, measured once per drag — see measureTabsDragBounds.
  const tabsDragBoundsRef = useRef<{ left: number; width: number } | null>(null)

  const stopDragScroll = useCallback(() => {
    const state = dragScrollRef.current
    if (state.raf !== null) cancelAnimationFrame(state.raf)
    state.raf = null
    state.dir = 0
    tabsDragBoundsRef.current = null
  }, [])

  const setDragScroll = useCallback((dir: -1 | 0 | 1) => {
    const state = dragScrollRef.current
    if (dir === 0) {
      // Only stop the loop: the bounds must survive until the drag really ends.
      if (state.raf !== null) cancelAnimationFrame(state.raf)
      state.raf = null
      state.dir = 0
      return
    }
    state.dir = dir
    if (state.raf !== null) return // loop already alive: just steer it
    const step = () => {
      const container = tabsScrollRef.current
      const current = dragScrollRef.current
      const stale = Date.now() - current.lastOverAt > TAB_DRAG_STALE_MS
      if (!container || current.dir === 0 || stale) { current.raf = null; return }
      container.scrollLeft += current.dir * TAB_DRAG_SPEED
      current.raf = requestAnimationFrame(step)
    }
    state.raf = requestAnimationFrame(step)
  }, [])

  // Measured on dragstart and reused for every dragover: the strip can't resize
  // mid-drag, and getBoundingClientRect + getRootZoom (getComputedStyle) on each
  // event would force a layout recalc per mouse move.
  const measureTabsDragBounds = useCallback(() => {
    const container = tabsScrollRef.current
    if (!container) return null
    const rect = container.getBoundingClientRect()
    // clientX lives in the zoomed (local) space while rects are in device space:
    // divide by the root zoom before comparing them (see patterns.md).
    const zoom = getRootZoom()
    const bounds = { left: rect.left / zoom, width: rect.width / zoom }
    tabsDragBoundsRef.current = bounds
    return bounds
  }, [])

  // Safety net + unmount cleanup: no rAF loop may outlive the drag. The strip's
  // own onDrop/onDragEnd cover the normal path; these catch drags that end on
  // another target, and the watchdog above covers the last hole (a tab that
  // unmounts mid-drag fires its dragend on a detached node that reaches nobody).
  useEffect(() => {
    window.addEventListener('dragend', stopDragScroll, true)
    window.addEventListener('drop', stopDragScroll, true)
    return () => {
      window.removeEventListener('dragend', stopDragScroll, true)
      window.removeEventListener('drop', stopDragScroll, true)
      stopDragScroll()
    }
  }, [stopDragScroll])

  // ── Delete key on the note (only when editor is NOT focused) ──────────────
  useEffect(() => {
    if (!isPaneActive) return
    if (!note) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (e.key === 'Delete' && !isEditing) {
        e.preventDefault()
        openDeleteNoteModal()
      }

    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [note, openDeleteNoteModal, isPaneActive])

  // ── Ctrl+Tab / Ctrl+Shift+Tab — cycle sections (capture phase to beat TipTap) ──
  useEffect(() => {
    if (!isPaneActive) return
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key !== 'Tab') return
      if (ownsKeys(e.target)) return
      const n = noteRef.current
      if (!n || n.sections.length <= 1) return
      e.preventDefault()
      e.stopPropagation()
      const sections = n.sections
      const currentIdx = sections.findIndex((s) => s.id === activeSectionIdRef.current)
      const base = currentIdx === -1 ? 0 : currentIdx
      const nextIdx = e.shiftKey
        ? (base - 1 + sections.length) % sections.length
        : (base + 1) % sections.length
      const nextSection = sections[nextIdx]
      setRawContent(nextSection.content ?? '')
      setActiveSectionId(nextSection.id)
      saveUiState({ activeSectionId: nextSection.id })
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isPaneActive])

  // ── Ctrl+T / Ctrl+W via custom events ────────────────────────────────────
  useEffect(() => {
    if (!isPaneActive) return
    const handleAddTab = () => {
      if (!noteRef.current) return
      const newSection: NoteSection = { id: nanoid(6), name: 'New', content: '' }
      void mutateSections(noteRef.current.id, (sections) => [...sections, newSection])
      setRawContent('')
      setActiveSectionId(newSection.id)
      setRenamingId(newSection.id)
      setRenameValue('New')
    }
    const handleCloseTab = () => {
      const n = noteRef.current
      if (!n || n.sections.length <= 1) return
      const sectionId = activeSectionIdRef.current
      if (!sectionId) return
      const section = n.sections.find((s) => s.id === sectionId)
      if (!section) return
      setModal({
        title: t.common.deleteSection,
        message: tf(t.common.deleteSectionMessage, { name: section.name }),
        confirmLabel: t.common.delete,
        danger: true,
        onConfirm: () => { setModal(null); deleteSectionWithUndo(sectionId) },
      })
    }
    const handleToggleRaw = () => {
      const n = noteRef.current
      const sectionId = activeSectionIdRef.current
      if (!n || !sectionId) return
      const section = n.sections.find((s) => s.id === sectionId)
      if (!section) return
      if (!section.isRawMode) {
        setRawContent(section.content)
        void updateSection(n.id, sectionId, { isRawMode: true })
      } else {
        if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
        void updateSection(n.id, sectionId, { content: rawContentRef.current, isRawMode: false })
      }
    }
    const handleOpenStickySection = () => {
      if (!isPaneActive) return
      const n = noteRef.current
      const sectionId = activeSectionIdRef.current ?? n?.sections[0]?.id
      if (n && sectionId) window.noteflow.openSticky(n.id, sectionId)
    }
    const handleOpenStickyAll = () => {
      if (!isPaneActive) return
      const n = noteRef.current
      if (!n) return
      n.sections.forEach((s) => window.noteflow.openSticky(n.id, s.id))
    }
    const handleInNoteSearch = () => {
      if (!isPaneActive) return
      const n = noteRef.current
      const sectionId = activeSectionIdRef.current
      const section = n?.sections.find((s) => s.id === sectionId)
      if (!n || !section) return
      setSearchOpen(true)
    }
    window.addEventListener('noteflow:add-tab', handleAddTab)
    window.addEventListener('noteflow:close-tab', handleCloseTab)
    window.addEventListener('noteflow:toggle-raw', handleToggleRaw)
    window.addEventListener('noteflow:open-sticky-section', handleOpenStickySection)
    window.addEventListener('noteflow:open-sticky-all', handleOpenStickyAll)
    window.addEventListener('noteflow:in-note-search', handleInNoteSearch)
    return () => {
      window.removeEventListener('noteflow:add-tab', handleAddTab)
      window.removeEventListener('noteflow:close-tab', handleCloseTab)
      window.removeEventListener('noteflow:toggle-raw', handleToggleRaw)
      window.removeEventListener('noteflow:open-sticky-section', handleOpenStickySection)
      window.removeEventListener('noteflow:open-sticky-all', handleOpenStickyAll)
      window.removeEventListener('noteflow:in-note-search', handleInNoteSearch)
    }
  }, [updateSection, mutateSections, isPaneActive, t])

  // Close the in-note search bar when the active section or note changes.
  // The Editor is recreated (key-based) so matches and decorations are gone.
  useEffect(() => {
    setSearchOpen(false)
  }, [activeSectionId, note?.id, rawMode])

  // Clicking into an inactive pane makes it the active one.
  const activateThisPane = () => {
    if (paneId) focusPane(paneId)
    else if (resolvedNoteId) setActiveNote(resolvedNoteId)
  }

  // ── Early exit ─────────────────────────────────────────────────────────────
  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
        <div className="text-4xl opacity-20 font-mono">_</div>
        <p className="text-sm font-mono">{t.editor.noNoteSelected}</p>
        <p className="text-xs opacity-50 font-mono">{t.editor.createHint}</p>
      </div>
    )
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTitleDraft(val)
    titleDirtyRef.current = true
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    titleDebounceRef.current = setTimeout(() => {
      titleDirtyRef.current = false
      updateNote(note.id, { title: val })
    }, 300)
  }

  const handleTitleBlur = () => {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    // A clean draft has nothing of ours to save — writing it could revert a title
    // changed meanwhile in another pane/window.
    if (!titleDirtyRef.current) return
    titleDirtyRef.current = false
    updateNote(note.id, { title: titleDraft })
  }

  // Each Editor instance is keyed by section, so `activeSection` here is the section
  // this content belongs to. updateSection merges onto the LATEST sections: a write from
  // this pane never carries a stale copy of a section another pane/window is editing.
  const handleSectionContentChange = (content: string) => {
    if (!activeSection) return
    if (activeSection.content === content) return
    void updateSection(note.id, activeSection.id, { content })
  }

  const handleCopyAllText = () => {
    const text = activeSection?.content ?? ''
    navigator.clipboard.writeText(text)
  }

  // Save the current note (title + sections) as a reusable template, then close the modal.
  const saveAsTemplate = async () => {
    const name = (templateNameDraft ?? '').trim()
    if (!name) return
    await useTemplatesStore.getState().createTemplate({
      name,
      title: note.title,
      sections: note.sections.map((s) => ({ ...s })),
    })
    setTemplateNameDraft(null)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedSectionId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Set a transparent ghost image or just let the browser handle it
    measureTabsDragBounds() // for the edge auto-scroll, measured once per drag
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (draggedSectionId === id) return
    setDragOverSectionId(id)
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedSectionId || draggedSectionId === targetId) {
      setDraggedSectionId(null)
      setDragOverSectionId(null)
      return
    }

    const draggedId = draggedSectionId
    void mutateSections(note.id, (sections) => moveSectionInList(sections, draggedId, targetId))

    setDraggedSectionId(null)
    setDragOverSectionId(null)
  }

  const handleDragEnd = () => {
    setDraggedSectionId(null)
    setDragOverSectionId(null)
  }

  // The strip's dragover (tab events bubble up to it) decides whether the
  // pointer sits in one of the edge bands and starts/steers/stops the loop.
  const handleTabsDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggedSectionId) return
    const bounds = tabsDragBoundsRef.current ?? measureTabsDragBounds()
    if (!bounds) return
    dragScrollRef.current.lastOverAt = Date.now() // feeds the loop watchdog
    const x = e.clientX - bounds.left
    setDragScroll(x < TAB_DRAG_EDGE ? -1 : x > bounds.width - TAB_DRAG_EDGE ? 1 : 0)
  }

  // dragleave also bubbles when moving from one tab to another: only stop when
  // the pointer really leaves the strip.
  const handleTabsDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    stopDragScroll()
  }

  const handleRawToggle = () => {
    if (!activeSection) return
    const newRawMode = !rawMode

    if (newRawMode) {
      setRawContent(activeSection.content)
      void updateSection(note.id, activeSection.id, { isRawMode: true })
    } else {
      if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
      void updateSection(note.id, activeSection.id, { content: rawContent, isRawMode: false })
    }
  }

  const handleToggleAiHidden = () => {
    if (!activeSection) return
    void updateSection(note.id, activeSection.id, { aiHidden: !activeSection.aiHidden })
  }

  const handleSwitchSection = (sectionId: string) => {
    if (sectionId === activeSectionId) return

    if (!isPaneActive) activateThisPane()

    setSectionColorPickerId(null)

    if (rawMode && activeSection) {
      if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
      void updateSection(note.id, activeSection.id, { content: rawContent })
    }

    const newContent = note.sections.find((s) => s.id === sectionId)?.content ?? ''
    setRawContent(newContent)
    setActiveSectionId(sectionId)
    if (isPaneActive) saveUiState({ activeSectionId: sectionId })
  }

  const handleAddSection = () => {
    const newSection: NoteSection = { id: nanoid(6), name: 'New', content: '' }
    void mutateSections(note.id, (sections) => [...sections, newSection])
    setRawContent('')
    setActiveSectionId(newSection.id)
    setRenamingId(newSection.id)
    setRenameValue('New')
  }

  // Copies a section next to the original and lands on the copy. A pending raw-mode
  // edit of the active section is flushed first: its debounced save would otherwise
  // race the duplicate write (and the copy could miss the latest keystrokes). `baseName`: the
  // strip passes the name just typed in it, whose write may still be queued ahead of this one.
  const handleDuplicateSection = async (sectionId: string, baseName?: string) => {
    const currentNote = noteRef.current
    const source = currentNote?.sections.find((s) => s.id === sectionId)
    if (!currentNote || !source) return
    if (rawMode && activeSection) {
      if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
      await updateSection(currentNote.id, activeSection.id, { content: rawContentRef.current })
    }
    const copy = await duplicateSection(currentNote.id, sectionId, tf(t.common.sectionCopyName, { name: baseName ?? source.name }))
    if (!copy) return
    setRawContent(copy.content)
    setActiveSectionId(copy.id)
    if (isPaneActive) saveUiState({ activeSectionId: copy.id })
  }

  const deleteSectionWithUndo = (sectionId: string) => {
    const currentNote = noteRef.current
    if (!currentNote || currentNote.sections.length <= 1) return

    const removeIndex = currentNote.sections.findIndex((s) => s.id === sectionId)
    if (removeIndex === -1) return

    const nextSections = currentNote.sections.filter((s) => s.id !== sectionId)
    const removedSection = currentNote.sections[removeIndex]
    const previousActiveSectionId = activeSectionIdRef.current

    const fallbackSection = previousActiveSectionId === sectionId
      ? nextSections[Math.min(removeIndex, nextSections.length - 1)] ?? nextSections[0]
      : nextSections.find((s) => s.id === previousActiveSectionId) ?? nextSections[0]

    // Filter the LATEST list (never write back our snapshot) and keep at least one section.
    void mutateSections(currentNote.id, (sections) => {
      if (sections.length <= 1 || !sections.some((s) => s.id === sectionId)) return null
      return sections.filter((s) => s.id !== sectionId)
    })

    if (previousActiveSectionId === sectionId) {
      const nextActiveId = fallbackSection?.id ?? null
      setActiveSectionId(nextActiveId)
      setRawContent(fallbackSection?.content ?? '')
      if (nextActiveId && isPaneActive) saveUiState({ activeSectionId: nextActiveId })
    }

    if (sectionUndoTimerRef.current) {
      clearTimeout(sectionUndoTimerRef.current)
    }

    setSectionUndo({
      noteId: currentNote.id,
      section: { ...removedSection },
      index: removeIndex,
      previousActiveSectionId,
    })

    sectionUndoTimerRef.current = setTimeout(() => {
      sectionUndoTimerRef.current = null
      setSectionUndo(null)
    }, 6000)
  }

  const undoSectionDelete = () => {
    if (!sectionUndo) return
    const currentNote = noteRef.current
    if (!currentNote || currentNote.id !== sectionUndo.noteId) {
      setSectionUndo(null)
      return
    }

    if (sectionUndoTimerRef.current) {
      clearTimeout(sectionUndoTimerRef.current)
      sectionUndoTimerRef.current = null
    }

    const { section, index, previousActiveSectionId } = sectionUndo
    void mutateSections(currentNote.id, (sections) => restoreSectionInList(sections, section, index))

    // The restored section is the deleted one; any other previously active section is
    // still in the current list (or, if it vanished meanwhile, fall back to the restored one).
    const restoreActiveId =
      previousActiveSectionId === section.id || currentNote.sections.some((s) => s.id === previousActiveSectionId)
        ? previousActiveSectionId
        : section.id
    const restoreContent = restoreActiveId === section.id
      ? section.content
      : currentNote.sections.find((s) => s.id === restoreActiveId)?.content ?? ''

    setActiveSectionId(restoreActiveId)
    setRawContent(restoreContent)
    if (restoreActiveId && isPaneActive) saveUiState({ activeSectionId: restoreActiveId })
    setSectionUndo(null)
  }

  const handleDeleteSection = (sectionId: string, displayName?: string) => {
    const section = note?.sections.find((s) => s.id === sectionId)
    if (!section) return
    setModal({
      title: t.common.deleteSection,
      message: tf(t.common.deleteSectionMessage, { name: displayName ?? section.name }),
      confirmLabel: t.common.delete,
      danger: true,
      onConfirm: () => { setModal(null); deleteSectionWithUndo(sectionId) },
    })
  }

  const handleStartRename = (section: NoteSection) => {
    setRenamingId(section.id)
    setRenameValue(section.name)
  }

  const handleCommitRename = () => {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    if (trimmed) void updateSection(note.id, renamingId, { name: trimmed })
    setRenamingId(null)
    // The editor isn't remounted on commit (its key is unchanged), so move focus
    // into it explicitly for a smooth "+ → name it → start writing" flow.
    requestAnimationFrame(() => editorRef.current?.editor?.commands.focus())
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCommitRename() }
    if (e.key === 'Escape') { setRenamingId(null) }
  }

  const handleSetSectionColor = async (sectionName: string, color: GroupColor) => {
    await setSectionTagColor(sectionName, color)
    setSectionColorPickerId(null)
  }

  const handleClearSectionColor = async (sectionName: string) => {
    await clearSectionTagColor(sectionName)
    setSectionColorPickerId(null)
  }

  // The strip's name field commits on blur — i.e. on the mousedown of a swatch, before its
  // click — and the store only shows the new name after the disk write. Colours are keyed by
  // section name, so they go to the name just committed rather than the stale one.
  // Only while the store still shows the name it replaced: once the write lands, or if a rename
  // from elsewhere (sync, another pane) or a failed write moved it on, the store wins.
  const stripSectionName = (section: NoteSection) => {
    const pending = stripRenameRef.current
    return pending && pending.sectionId === section.id && section.name === pending.from
      ? pending.name
      : section.name
  }

  // Resolves with the name the section has once the write settles (see SectionNameField).
  const handleStripRename = async (sectionId: string, name: string) => {
    const noteId = note.id
    const sectionNameNow = () =>
      useNotesStore.getState().notes.find((n) => n.id === noteId)?.sections.find((s) => s.id === sectionId)?.name
    if (note.encryption && !sessionPasswords[noteId]) return sectionNameNow()
    const from = sectionNameNow()
    if (from !== undefined) stripRenameRef.current = { sectionId, from, name }
    try {
      await updateSection(noteId, sectionId, { name })
    } catch (err) {
      console.error('[editor] Section rename failed:', err)
    }
    return sectionNameNow()
  }

  const closeStripToEditor = () => {
    setSectionColorPickerId(null)
    requestAnimationFrame(() => {
      const editor = editorRef.current?.editor
      if (editor) editor.commands.focus()
      else rawTextareaRef.current?.focus()
    })
  }

  const colorPickerSection = sectionColorPickerId
    ? note.sections.find((s) => s.id === sectionColorPickerId) ?? null
    : null

  if (colorPickerSection) lastColorPickerSectionRef.current = colorPickerSection
  const visibleColorPickerSection = colorPickerSection ?? lastColorPickerSectionRef.current

  const colorPickerOverride = visibleColorPickerSection
    ? sectionTagColors[normalizeTagColorKey(visibleColorPickerSection.name)]
    : undefined

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDisplay = e.target.value

    // Restore base64 data URIs from original rawContent (matched in order)
    const origSrcs: string[] = []
    rawContent.replace(/!\[[^\]]*\]\((data:[^)]+)\)/g, (_, src) => { origSrcs.push(src); return '' })
    let idx = 0
    const newContent = newDisplay.replace(/(!\[[^\]]*\])\(\[image\]\)/g, (_, prefix) => {
      const src = origSrcs[idx++]
      return src ? `${prefix}(${src})` : `${prefix}([image])`
    })

    if (activeSection) pushToUndoStack(activeSection.id, rawContent)
    setRawContent(newContent)
    if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
    rawDebounceRef.current = setTimeout(() => {
      if (activeSection && noteRef.current) {
        void updateSection(noteRef.current.id, activeSection.id, { content: newContent })
      }
    }, 600)
  }

  const displayContent = rawContent.replace(
    /!\[([^\]]*)\]\(data:[^)]+\)/g,
    (_, alt) => `![${alt}]([image])`
  )

  const handleRawKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const sectionId = activeSection?.id
    if (!sectionId) return

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      const stack = undoStackMap.current.get(sectionId) ?? []
      if (stack.length > 0) {
        const prev = stack[stack.length - 1]
        undoStackMap.current.set(sectionId, stack.slice(0, -1))
        const redoStack = redoStackMap.current.get(sectionId) ?? []
        redoStackMap.current.set(sectionId, [...redoStack, rawContent])
        setRawContent(prev)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault()
      const redoStack = redoStackMap.current.get(sectionId) ?? []
      if (redoStack.length > 0) {
        const next = redoStack[redoStack.length - 1]
        redoStackMap.current.set(sectionId, redoStack.slice(0, -1))
        const undoStack = undoStackMap.current.get(sectionId) ?? []
        undoStackMap.current.set(sectionId, [...undoStack, rawContent])
        setRawContent(next)
      }
      return
    }
  }


  const handleRawBlur = () => {
    if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
    if (activeSection && activeSection.content !== rawContent) {
      void updateSection(note.id, activeSection.id, { content: rawContent })
    }
  }

  // ── Encrypted note — locked view ───────────────────────────────────────────
  // Also when a session password exists but the sections aren't decrypted in memory
  // (defence: never show an "unlocked but empty" encrypted note whose edits would wipe
  // it — the store refuses those writes anyway). Unlocking again decrypts it.
  if (note.encryption && (!sessionPasswords[note.id] || note.sections.length === 0)) {
    return (
      <>
        <div
          className="flex flex-col h-full"
          onMouseDownCapture={() => {
            if (!isPaneActive) activateThisPane()
          }}
        >
          <div className="px-4 pt-3 pb-2 border-b border-border flex-shrink-0">
            <span className="text-xl font-bold font-mono text-text">
              {note.title || t.common.untitled}
            </span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
            <Lock size={28} className="opacity-20" />
            <p className="text-sm font-mono">{t.editor.noteEncrypted}</p>
            <button
              onClick={() => setShowUnlockModal(true)}
              className="text-xs font-mono text-text hover:underline opacity-70 hover:opacity-100 transition-opacity"
            >
              {t.editor.clickToUnlock}
            </button>
          </div>
        </div>
        {showUnlockModal && (
          <EncryptionModal
            mode="unlock"
            noteTitle={note.title}
            onConfirm={async (password) => {
              await unlockNote(note.id, password)
              setShowUnlockModal(false)
            }}
            onCancel={() => setShowUnlockModal(false)}
          />
        )}
      </>
    )
  }

  return (
    <>
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

      {encryptModalMode && (
        <EncryptionModal
          mode={encryptModalMode}
          noteTitle={note.title}
          onConfirm={async (password, options) => {
            if (encryptModalMode === 'encrypt') {
              await encryptNote(note.id, password, options)
            } else {
              await removeNoteEncryption(note.id, password)
            }
            setEncryptModalMode(null)
          }}
          onCancel={() => setEncryptModalMode(null)}
        />
      )}

      {templateNameDraft !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setTemplateNameDraft(null)}
        >
          <div
            className="w-80 bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-border">
              <LayoutTemplate size={15} className="text-text flex-shrink-0" />
              <span className="text-sm font-mono font-semibold text-text">{t.editor.saveAsTemplate}</span>
            </div>
            <div className="px-4 py-3">
              <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{t.editor.templateName}</label>
              <input
                autoFocus
                value={templateNameDraft}
                onChange={(e) => setTemplateNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') { e.preventDefault(); void saveAsTemplate() }
                  if (e.key === 'Escape') { e.preventDefault(); setTemplateNameDraft(null) }
                }}
                placeholder={t.editor.untitledTemplate}
                className="mt-1.5 w-full bg-surface-2 border border-border rounded px-2.5 py-1.5
                           text-xs font-mono text-text focus:outline-none focus:border-text/30"
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-4 pb-4">
              <button
                onClick={() => setTemplateNameDraft(null)}
                className="px-3 py-1.5 rounded text-xs font-mono text-text-muted
                           border border-border hover:border-text/25 hover:text-text transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => void saveAsTemplate()}
                disabled={!templateNameDraft.trim()}
                className="px-3 py-1.5 rounded text-xs font-mono bg-surface-2 text-text border border-text/20
                           hover:bg-surface-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="flex flex-col h-full"
        onMouseDownCapture={() => {
          if (!isPaneActive) activateThisPane()
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          const isAccel = e.ctrlKey || e.metaKey
          const key = e.key.toLowerCase()

          if (isAccel && e.shiftKey && key === 'e') {
            e.preventDefault()
            handleRawToggle()
            return
          }
          if (isAccel && (e.key === '=' || e.key === '+')) { e.preventDefault(); changeFontSize(1) }
          if (isAccel && e.key === '-') { e.preventDefault(); changeFontSize(-1) }
          if (isAccel && e.key === '0') { e.preventDefault(); resetFontSize() }
        }}
      >
        <div
          className="flex items-stretch px-3 pt-2.5 flex-shrink-0 gap-1.5 h-[42px]"
          style={{ background: 'color-mix(in srgb, rgb(var(--bg-0)) 50%, rgb(var(--bg-1)) 50%)' }}
        >
          <div className="relative flex-1 min-w-0 h-full flex items-stretch">
            <div
              ref={tabsScrollRef}
              className="flex items-stretch gap-1 overflow-x-auto tabs-scroll pr-4 h-full"
              onDragOver={handleTabsDragOver}
              onDragLeave={handleTabsDragLeave}
              onDrop={stopDragScroll}
              onDragEnd={stopDragScroll}
            >
            {note.sections.map((section) => {
              const isActive = section.id === (activeSection?.id)
              const isRenaming = renamingId === section.id
              const colorStyle = getTagColor(section.name, sectionTagColors)
              return (
                <div
                  key={section.id}
                  data-section-id={section.id}
                  draggable
                  title={t.editor.dragToReorder}
                  onDragStart={(e) => handleDragStart(e, section.id)}
                  onDragOver={(e) => handleDragOver(e, section.id)}
                  onDrop={(e) => handleDrop(e, section.id)}
                  onDragEnd={handleDragEnd}
                  onDragLeave={() => setDragOverSectionId(null)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    stripRenameRef.current = null
                    setSectionColorPickerId((prev) => (prev === section.id ? null : section.id))
                  }}
                  className={`relative group flex items-center justify-center min-w-[88px] flex-shrink-0 h-full transition-colors duration-150 cursor-grab active:cursor-grabbing
                    ${draggedSectionId === section.id ? 'opacity-30' : 'opacity-100'}
                  `}
                  style={isActive
                    ? {
                        borderTop: `1.5px solid ${colorStyle.color}`,
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                        background: 'rgb(var(--bg-editor))',
                        zIndex: 2,
                        marginBottom: '-1px',
                      }
                    : !isActive && dragOverSectionId === section.id && draggedSectionId !== section.id
                    ? {
                        borderLeft: '2px solid rgb(var(--accent))',
                        background: 'rgb(var(--accent) / 0.1)',
                        borderTopLeftRadius: 4,
                        borderBottomLeftRadius: 4,
                      }
                    : undefined
                  }
                >
                  {isRenaming ? (
                    // Inline rename input
                    <div className="flex items-center gap-0.5 px-1.5 py-1">
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        onBlur={handleCommitRename}
                        className="w-20 bg-surface-0 border border-yellow-400/40 rounded px-1
                                   text-xs font-mono text-text outline-none tab-active-caret"
                      />
                      <button
                        onMouseDown={(e) => { e.preventDefault(); handleCommitRename() }}
                        className="tab-active-text p-0.5 rounded"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    // Normal tab
                    <button
                      {...(isActive || !note ? {} : previewProps(note.id, section.id, { placement: 'cursor-below' }))}
                      onClick={() => handleSwitchSection(section.id)}
                      onDoubleClick={() => handleStartRename(section)}
                      className={`px-3 py-1 text-xs font-mono transition-colors whitespace-nowrap inline-flex items-center gap-1
                        ${isActive ? 'font-semibold' : 'text-text-muted hover:text-text'}`}
                      style={isActive ? { color: colorStyle.color } : undefined}
                    >
                      {section.aiHidden && (
                        <EyeOff size={11} className="opacity-60 flex-shrink-0" aria-label={t.common.hiddenFromAI} />
                      )}
                      {section.name}
                    </button>
                  )}

                </div>
              )
            })}

              {/* + button inside scroll area when no overflow */}
              {!tabsOverflow && (
                <button
                  onClick={handleAddSection}
                  title={t.editor.addSection}
                  className="self-center ml-1 flex items-center justify-center w-6 h-6 rounded flex-shrink-0
                             text-text-muted/60 hover:text-text-muted hover:bg-surface-3
                             border border-transparent hover:border-border transition-colors"
                >
                  <Plus size={13} />
                </button>
              )}
            </div>
            {/* Fade gradient — only when overflowing */}
            {tabsOverflow && (
              <div
                className="pointer-events-none absolute inset-y-0 right-0 w-6"
                style={{ background: 'linear-gradient(to left, rgb(var(--bg-editor)), transparent)' }}
              />
            )}
          </div>

          {/* + button pinned outside when tabs overflow */}
          {tabsOverflow && (
            <button
              onClick={handleAddSection}
              title={t.editor.addSection}
              className="self-center flex items-center justify-center w-6 h-6 rounded flex-shrink-0
                         text-text-muted/60 hover:text-text-muted hover:bg-surface-3
                         border border-transparent hover:border-border transition-colors"
            >
              <Plus size={13} />
            </button>
          )}

          <div className="self-center w-px h-4 bg-border flex-shrink-0 mx-1.5" />

          <div className="flex items-center gap-1 flex-shrink-0">
            {!standalone && (
              <button
                onClick={() => setNoteView(note.id)}
                title={t.editor.noteOverview}
                className="p-1.5 rounded text-xs text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
              >
                <LayoutGrid size={13} />
              </button>
            )}
            <button
              onClick={() => updateNote(note.id, { favorited: !note.favorited })}
              title={note.favorited ? t.common.removeFromFavorites : t.common.addToFavorites}
              className={`p-1.5 rounded text-xs transition-colors
                ${note.favorited ? 'text-accent-3 bg-accent-3/10' : 'text-text-muted hover:text-text hover:bg-surface-3'}`}
            >
              <Star size={13} />
            </button>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setSectionMenuOpen((prev) => !prev) }}
                title={t.editor.sectionOptions}
                className={`p-1.5 rounded text-xs transition-colors
                  ${sectionMenuOpen
                    ? 'text-text bg-surface-3 border border-text/20'
                    : 'text-text-muted hover:text-text hover:bg-surface-3 border border-transparent'
                  }`}
              >
                <MoreHorizontal size={13} />
              </button>
              {sectionMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 bg-surface-1 border border-border rounded shadow-lg z-50 py-1 min-w-[180px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { handleRawToggle(); setSectionMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                  >
                    {rawMode ? <Edit3 size={13} /> : <Eye size={13} />}
                    {rawMode ? t.editor.menu.editorMode : t.editor.menu.rawMode}
                  </button>
                  <button
                    onClick={() => { handleCopyAllText(); setSectionMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                  >
                    <Copy size={13} />
                    {t.editor.menu.copySectionText}
                  </button>
                  {!(note.encryption && !sessionPasswords[note.id]) && (
                    <button
                      onClick={() => {
                        setSectionMenuOpen(false)
                        setTemplateNameDraft(note.title || 'Untitled template')
                      }}
                      title={t.editor.saveAsTemplateHint}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                    >
                      <LayoutTemplate size={13} />
                      {t.editor.saveAsTemplate}
                    </button>
                  )}
                  {!standalone && !(note.encryption && !sessionPasswords[note.id]) && (
                    <button
                      onClick={() => {
                        setSectionMenuOpen(false)
                        window.dispatchEvent(new CustomEvent('noteflow:open-export', { detail: { noteId: note.id } }))
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                    >
                      <Share size={13} />
                      {t.common.exportNote}
                    </button>
                  )}
                  <button
                    onClick={() => { handleToggleAiHidden(); setSectionMenuOpen(false) }}
                    title={activeSection?.aiHidden
                      ? t.editor.menu.showToAiHint
                      : t.editor.menu.hideFromAiHint}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                  >
                    {activeSection?.aiHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                    {activeSection?.aiHidden ? t.common.showToAI : t.common.hideFromAI}
                  </button>
                  <button
                    onClick={() => {
                      if (window.noteflow?.openSticky && activeSection?.id) {
                        window.noteflow.openSticky(note.id, activeSection.id)
                      }
                      setSectionMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                  >
                    <ExternalLink size={13} />
                    {t.editor.menu.openAsSticky}
                  </button>
                  {note.expiresAt && (
                    <button
                      onClick={() => { setSectionMenuOpen(false); void makeNotePermanent(note.id) }}
                      title={t.editor.menu.makePermanentHint}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                    >
                      <TimerOff size={13} />
                      {t.editor.menu.makePermanent}
                    </button>
                  )}
                  <button
                    onClick={() => { setSectionMenuOpen(false); void archiveNote(note.id) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                  >
                    <Archive size={13} />
                    {note.archived ? t.editor.menu.unarchiveNote : t.editor.menu.archiveNote}
                  </button>
                  {!note.encryption && (
                    <button
                      onClick={() => { setSectionMenuOpen(false); setEncryptModalMode('encrypt') }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                    >
                      <Lock size={13} />
                      {t.editor.menu.encryptNote}
                    </button>
                  )}
                  {note.encryption && sessionPasswords[note.id] && (
                    <button
                      onClick={() => { setSectionMenuOpen(false); setEncryptModalMode('remove') }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
                    >
                      <Lock size={13} />
                      {t.editor.menu.removeEncryption}
                    </button>
                  )}
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => { setSectionMenuOpen(false); openDeleteNoteModal() }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-normal text-red/75 hover:text-red hover:bg-red/10 transition-colors text-left"
                  >
                    <Trash2 size={13} />
                    {t.common.deleteNote}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>


        {sectionUndo && sectionUndo.noteId === note.id && (
          <div className="mx-3 mt-2 px-3 py-2 rounded border border-amber-300/35 bg-amber-300/10 flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-text-muted min-w-0 truncate">
              {tf(t.editor.sectionDeleted, { name: sectionUndo.section.name })}
            </span>
            <button
              onClick={undoSectionDelete}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border border-amber-300/45 text-amber-200 hover:bg-amber-300/15 transition-colors"
            >
              <RotateCcw size={10} />
              {t.editor.undo}
            </button>
          </div>
        )}

        <div
          className="overflow-hidden transition-all duration-200 ease-in-out border-border/60 bg-surface-1/40"
          style={{
            maxHeight: colorPickerSection ? '60px' : '0px',
            opacity: colorPickerSection ? 1 : 0,
            borderBottomWidth: colorPickerSection ? '1px' : '0px',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {visibleColorPickerSection && (
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <SectionNameField
                key={`${note.id}:${visibleColorPickerSection.id}`}
                name={visibleColorPickerSection.name}
                open={!!colorPickerSection}
                readOnly={!!note.encryption && !sessionPasswords[note.id]}
                label={t.editor.renameSection}
                onCommit={(name) => handleStripRename(visibleColorPickerSection.id, name)}
                onClose={closeStripToEditor}
              />
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {TAG_COLOR_VARS.map((color) => (
                  <button
                    key={`tab-color-${visibleColorPickerSection.id}-${color}`}
                    title={color.replace('--', '')}
                    onClick={() => { void handleSetSectionColor(stripSectionName(visibleColorPickerSection), color) }}
                    className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${colorPickerOverride === color ? 'ring-1 ring-white/60 ring-offset-1 ring-offset-surface-2' : ''}`}
                    style={{ background: `rgb(${colorChannels(color)})` }}
                  />
                ))}
                <CustomColorSwatch
                  value={colorPickerOverride ?? resolveGroupColor(visibleColorPickerSection.name)}
                  onPick={(c) => { void setSectionTagColor(stripSectionName(visibleColorPickerSection), c) }}
                />
                <button
                  onClick={() => { void handleClearSectionColor(stripSectionName(visibleColorPickerSection)) }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                    colorPickerOverride
                      ? 'text-text-muted border-border hover:text-text hover:border-text/30'
                      : 'text-text border-text/25 bg-surface-2'
                  }`}
                >
                  {t.editor.auto}
                </button>
                <div className="w-px h-4 bg-border/70 mx-0.5" />
                {!(note.encryption && !sessionPasswords[note.id]) && (
                  <button
                    onClick={() => { void handleDuplicateSection(visibleColorPickerSection.id, stripSectionName(visibleColorPickerSection)); setSectionColorPickerId(null) }}
                    title={t.common.duplicateSection}
                    className="p-0.5 rounded text-text-muted/80 hover:text-text transition-colors"
                  >
                    <CopyPlus size={13} />
                  </button>
                )}
                {note.sections.length > 1 && (
                  <button
                    onClick={() => { handleDeleteSection(visibleColorPickerSection.id, stripSectionName(visibleColorPickerSection)); setSectionColorPickerId(null) }}
                    title={t.common.deleteSection}
                    className="p-0.5 rounded text-text-muted/80 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <button
                  onClick={() => setSectionColorPickerId(null)}
                  className="p-0.5 rounded text-text-muted/70 hover:text-text transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <input
            ref={titleRef}
            type="text"
            value={titleDraft}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            placeholder={t.common.untitled}
            className="w-full bg-transparent text-xl font-bold font-mono text-text
                       placeholder-text-muted/30 border-none outline-none caret-text"
          />
        </div>


        <div className="px-4 pb-2 flex-shrink-0 flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted/50">
            {formatDate(new Date(note.updated), 'MMM d, yyyy · HH:mm')}
          </span>
          {note.expiresAt && (
            <span className="text-xs font-mono text-accent/70 flex items-center gap-1">
              <span className="text-text-muted/40">·</span>
              <Timer size={11} strokeWidth={2.5} />
              {tf(t.editor.deletesAt, { date: formatDate(new Date(note.expiresAt), 'MMM d, yyyy · HH:mm') })}
            </span>
          )}
        </div>

        <div
          className={`flex-1 overflow-hidden mr-1 relative${readableWidth ? ' editor-readable' : ''}`}
          style={readableWidth ? { fontSize: `${fontSize}px` } : undefined}
        >
          {rawMode ? (
            <>
              <textarea
                ref={rawTextareaRef}
                value={displayContent}
                onChange={handleRawChange}
                onBlur={handleRawBlur}
                onKeyDown={handleRawKeyDown}
                onPaste={(e) => {
                  const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
                  if (imageItems.length === 0) return
                  e.preventDefault()
                  handleRawImageInsert(imageItems.map(i => i.getAsFile()).filter(Boolean) as File[])
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const files = Array.from(e.dataTransfer.files)
                  if (!files.some(f => f.type.startsWith('image/'))) return
                  e.preventDefault()
                  handleRawImageInsert(files)
                }}
                placeholder={tf(t.editor.sectionStartWriting, { name: activeSection?.name ?? t.editor.sectionFallback })}
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily: fontFamily === 'inter' ? "'Inter', sans-serif" : "'JetBrains Mono', 'Fira Code', monospace",
                }}
                className={`h-full p-4 bg-transparent text-text placeholder-text-muted/30 border-none outline-none resize-none caret-text leading-relaxed w-full ${readableWidth ? 'raw-readable' : ''}`}
                spellCheck={false}
              />
              {searchOpen && (
                <RawNoteSearchBar
                  textareaRef={rawTextareaRef}
                  content={displayContent}
                  onClose={() => setSearchOpen(false)}
                />
              )}
            </>
          ) : (
            <>
              <Editor
                ref={editorRef}
                key={`${note.id}-${activeSection?.id ?? 'none'}`}
                content={activeSection?.content ?? ''}
                onChange={handleSectionContentChange}
                placeholder={tf(t.editor.sectionStartWriting, { name: activeSection?.name ?? t.editor.sectionFallback })}
                fontSize={fontSize}
                autoFocus={renamingId === null}
                currentSectionId={activeSection?.id ?? null}
                showToc={showToc}
              />
              {searchOpen && (
                <InNoteSearchBar
                  editorRef={editorRef}
                  onClose={() => setSearchOpen(false)}
                />
              )}
            </>
          )}
        </div>

      </div>
    </>
  )
}
