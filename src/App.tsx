import { useEffect, useRef, useState, useCallback, useMemo, startTransition } from 'react'
import { useNotesStore, setWindowRole, type OpenPane } from './stores/notesStore'
import { useGroupsStore } from './stores/groupsStore'
import { useTemplatesStore } from './stores/templatesStore'
import { useSectionTagColorsStore } from './stores/sectionTagColorsStore'
import { useThemeStore } from './stores/themeStore'
import { useEditorSettingsStore } from './stores/editorSettingsStore'
import { useAiStore } from './stores/aiStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { NoteEditor } from './components/Editor/NoteEditor'
import { GroupOverview } from './components/GroupOverview/GroupOverview'
import { NoteOverview } from './components/NoteOverview/NoteOverview'
import { BrainView } from './components/Brain/BrainView'
import { AllContentOverview } from './components/AllContentOverview/AllContentOverview'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { GripVertical, PanelLeftOpen, X } from 'lucide-react'
import { StickyApp } from './components/StickyApp'
import { SectionWindowApp } from './components/SectionWindowApp'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HoverPreviewProvider } from './components/SectionPreview/HoverPreviewProvider'
import { modKey } from './lib/platform'
import { ownsKeys } from './lib/keyScope'
import { useT } from './i18n/useT'
import { tf } from './i18n/format'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 300
const PANE_MIN_WIDTH = 360
const PANE_MAX_WIDTH = 1200
const PANE_DEFAULT_WIDTH = 520

type WindowRoute = 'main' | 'sticky' | 'section'

// The same bundle backs every window; the hash picks which app it renders. The store
// learns its role here, before any child effect runs (loadNotes etc. depend on it).
function detectWindowRoute(): WindowRoute {
  const hash = window.location.hash
  const route: WindowRoute = hash.startsWith('#section-window') ? 'section' : hash.startsWith('#sticky') ? 'sticky' : 'main'
  setWindowRole(route)
  return route
}

export function App() {
  const [route] = useState(detectWindowRoute)
  if (route === 'section') {
    return (
      <ErrorBoundary>
        <HoverPreviewProvider>
          <SectionWindowApp />
        </HoverPreviewProvider>
      </ErrorBoundary>
    )
  }
  return <MainApp isSticky={route === 'sticky'} />
}

function MainApp({ isSticky }: { isSticky: boolean }) {
  const t = useT()

  const { loadNotes, isLoading, createNote, createTempNote, setCommandPaletteOpen } = useNotesStore()
  const notes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const openPanes = useNotesStore((s) => s.openPanes)
  const activePaneId = useNotesStore((s) => s.activePaneId)
  const groupViewId = useNotesStore((s) => s.groupViewId)
  const noteViewId = useNotesStore((s) => s.noteViewId)
  const brainViewOpen = useNotesStore((s) => s.brainViewOpen)
  const setBrainView = useNotesStore((s) => s.setBrainView)
  const allViewOpen = useNotesStore((s) => s.allViewOpen)
  const setAllView = useNotesStore((s) => s.setAllView)
  const closeFullView = useNotesStore((s) => s.closeFullView)
  const closePane = useNotesStore((s) => s.closePane)
  const openNoteInSplit = useNotesStore((s) => s.openNoteInSplit)
  const reorderPane = useNotesStore((s) => s.reorderPane)
  const loadGroups = useGroupsStore((s) => s.loadGroups)
  const loadTemplates = useTemplatesStore((s) => s.loadTemplates)
  const loadSectionTagColors = useSectionTagColorsStore((s) => s.loadSectionTagColors)

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  // Notes sidebar inside the brain view — collapsed by default, toggled independently
  // from the editor sidebar so it doesn't change the editor's layout. It always starts
  // hidden when entering the brain view (reset by the effect below).
  const [brainSidebarVisible, setBrainSidebarVisible] = useState(false)
  const [isSidebarDragging, setIsSidebarDragging] = useState(false)
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null)
  const [editorDropActive, setEditorDropActive] = useState(false)
  const [stickyDropActive, setStickyDropActive] = useState(false)
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null)
  const [paneDropIndex, setPaneDropIndex] = useState<number | null>(null)
  const [paneWidths, setPaneWidths] = useState<Record<string, number>>({})
  const [hasPaneOverflow, setHasPaneOverflow] = useState(false)
  const isDragging = useRef(false)
  const paneResizeRef = useRef<{ paneId: string; startX: number; startWidth: number } | null>(null)
  const paneScrollRef = useRef<HTMLDivElement | null>(null)
  const paneContainerRef = useRef<HTMLDivElement | null>(null)
  const dragStartX = useRef(0)
  const dragStartW = useRef(SIDEBAR_DEFAULT)

  // Entering the brain view always starts with the notes sidebar hidden.
  useEffect(() => {
    if (brainViewOpen) setBrainSidebarVisible(false)
  }, [brainViewOpen])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadNotes()
    loadGroups()
    loadTemplates()
    loadSectionTagColors()
  }, [loadNotes, loadGroups, loadTemplates, loadSectionTagColors])

  // ── AI / semantic index: load settings + subscribe to index progress/state ──
  useEffect(() => {
    if (isSticky) return
    useAiStore.getState().loadAiSettings()
    const cleanup = useAiStore.getState().initListeners()
    return cleanup
  }, [isSticky])

  // ── Global keyboard shortcuts (capture phase — works even inside editors) ─
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isAccel = e.ctrlKey || e.metaKey
      if (!isAccel || e.altKey) return
      if (ownsKeys(e.target)) return
      const key = e.key.toLowerCase()

      // Ctrl+N — new note (always, even when editing)
      if (!e.shiftKey && (key === 'n' || e.code === 'KeyN')) {
        e.preventDefault(); createNote(); return
      }
      // Ctrl+Shift+N — new temporary note (auto-deletes in 24h)
      if (e.shiftKey && (key === 'n' || e.code === 'KeyN')) {
        e.preventDefault(); createTempNote(); return
      }
      // Ctrl+P — toggle command palette
      if (!e.shiftKey && (key === 'p' || e.code === 'KeyP')) {
        e.preventDefault(); setCommandPaletteOpen(!useNotesStore.getState().commandPaletteOpen); return
      }
      // Ctrl+' — toggle sidebar (Spanish keyboards often have ' on the key next to 0)
      if (!e.shiftKey && (e.key === "'" || e.key === '´' || e.code === 'Quote' || e.code === 'Minus')) {
        e.preventDefault()
        if (useNotesStore.getState().brainViewOpen) setBrainSidebarVisible((v) => !v)
        else setSidebarVisible((v) => !v)
        return
      }
      // Ctrl+T — new tab in active note
      if (!e.shiftKey && (key === 't' || e.code === 'KeyT')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:add-tab'))
        return
      }
      // Ctrl+W — close active tab
      if (!e.shiftKey && (key === 'w' || e.code === 'KeyW')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:close-tab'))
        return
      }
      // Ctrl+M — toggle markdown / rich-text mode
      if (!e.shiftKey && (key === 'm' || e.code === 'KeyM')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:toggle-raw'))
        return
      }
      // Ctrl+Shift+F — global search (all notes)
      if (e.shiftKey && (key === 'f' || e.code === 'KeyF')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:focus-search'))
        return
      }
      // Ctrl+F — search within the active note
      if (!e.shiftKey && (key === 'f' || e.code === 'KeyF')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:in-note-search'))
        return
      }
      // Ctrl+S — open current section as sticky note
      if (!e.shiftKey && (key === 's' || e.code === 'KeyS')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:open-sticky-section'))
        return
      }
      // Ctrl+G — open all sections of current note as sticky notes
      if (!e.shiftKey && (key === 'g' || e.code === 'KeyG')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:open-sticky-all'))
        return
      }
    }
    // Use capture phase so shortcuts work even inside editors that stopPropagation
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [createNote, createTempNote, setCommandPaletteOpen, setSidebarVisible])

  // ── Global shortcuts (via IPC) ─────────────────────────────────────────────
  useEffect(() => {
    if (!window.noteflow?.onNewNote) return
    const unbindNew = window.noteflow.onNewNote(() => createNote())

    // Sync with other windows
    const currentWindowId = typeof window.noteflow?.windowId === 'function' ? window.noteflow.windowId() : null
    const unbindUpdate = window.noteflow.onNotesUpdated((filePath, senderId) => {
      // Ignore updates sent by this same window to avoid race conditions and focus loss
      if (currentWindowId !== null && senderId === currentWindowId) return

      // Reload granularly if we have a path, otherwise reload everything
      if (filePath) {
        useNotesStore.getState().syncNote(filePath)
      } else {
        loadNotes()
        loadGroups()
        loadTemplates()
        loadSectionTagColors()
        // Synced appearance/editor settings (ui-settings.json) — re-apply after
        // a pull or when another window changes them. Read-only, so no loop.
        useThemeStore.getState().reloadUiSettings()
        useEditorSettingsStore.getState().reloadUiSettings()
      }
    })

    return () => {
      unbindNew()
      unbindUpdate()
    }
  }, [createNote, loadNotes, loadGroups, loadTemplates, loadSectionTagColors])

  // ── Resize drag handlers ──────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartW.current = sidebarWidth
    setIsSidebarDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [sidebarWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientX - dragStartX.current
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartW.current + delta))
      setSidebarWidth(next)
    }
    const onUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      setIsSidebarDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ active?: boolean; noteId?: string }>).detail
      startTransition(() => {
        if (detail?.active) {
          setDraggingNoteId(detail.noteId ?? null)
        } else {
          setDraggingNoteId(null)
          setEditorDropActive(false)
          setStickyDropActive(false)
        }
      })
    }

    window.addEventListener('noteflow:note-drag', handler)
    return () => window.removeEventListener('noteflow:note-drag', handler)
  }, [])

  // Panes are keyed by paneId (not note id): the same note may be open in several
  // panes, each on its own section — see lib/paneUtils.ts.
  const visiblePanes = useMemo<OpenPane[]>(() => {
    const existingIds = new Set(notes.map((note) => note.id))
    const validOpen = openPanes.filter((p) => existingIds.has(p.noteId))
    if (validOpen.length > 0) return validOpen
    if (activeNoteId && existingIds.has(activeNoteId)) return [{ paneId: activePaneId ?? 'main', noteId: activeNoteId }]
    return []
  }, [notes, openPanes, activeNoteId, activePaneId])
  const visiblePaneIds = useMemo(() => visiblePanes.map((p) => p.paneId), [visiblePanes])

  // Panes default to auto-fill (flex) and only get a stored width once the user
  // resizes one by hand. So we never seed defaults here — we only prune entries
  // for panes that are no longer visible.
  useEffect(() => {
    setPaneWidths((prev) => {
      let changed = false
      const next: Record<string, number> = { ...prev }

      for (const id of Object.keys(next)) {
        if (!visiblePaneIds.includes(id)) {
          delete next[id]
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [visiblePaneIds])

  const refreshPaneOverflowState = useCallback(() => {
    const mainScroller = paneScrollRef.current
    if (!mainScroller) return

    const scrollWidth = mainScroller.scrollWidth
    const clientWidth = mainScroller.clientWidth
    setHasPaneOverflow(scrollWidth > clientWidth + 1)
  }, [])

  useEffect(() => {
    const raf = window.requestAnimationFrame(refreshPaneOverflowState)
    return () => window.cancelAnimationFrame(raf)
  }, [refreshPaneOverflowState, visiblePaneIds, paneWidths, sidebarVisible, sidebarWidth, isLoading])

  useEffect(() => {
    const onResize = () => refreshPaneOverflowState()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [refreshPaneOverflowState])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const resizing = paneResizeRef.current
      if (!resizing) return
      const delta = e.clientX - resizing.startX
      const nextWidth = Math.min(PANE_MAX_WIDTH, Math.max(PANE_MIN_WIDTH, resizing.startWidth + delta))
      setPaneWidths((prev) => {
        if (prev[resizing.paneId] === nextWidth) return prev
        return { ...prev, [resizing.paneId]: nextWidth }
      })
    }

    const onUp = () => {
      if (!paneResizeRef.current) return
      paneResizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.requestAnimationFrame(refreshPaneOverflowState)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [refreshPaneOverflowState])

  const beginPaneResize = useCallback((e: React.MouseEvent<HTMLElement>, paneId: string) => {
    e.preventDefault()
    e.stopPropagation()
    // Auto panes have no stored width, so we seed the drag from the real rendered
    // width of the <section> — otherwise the pane would jump to PANE_DEFAULT_WIDTH
    // the moment the drag pins it. Fall back to the stored/default width if the
    // element can't be measured for some reason.
    const paneEl = document.querySelector(`[data-pane-id="${CSS.escape(paneId)}"]`)
    const measured = paneEl?.getBoundingClientRect().width
    const startWidth = typeof measured === 'number' && measured > 0
      ? Math.min(PANE_MAX_WIDTH, Math.max(PANE_MIN_WIDTH, measured))
      : paneWidths[paneId] ?? PANE_DEFAULT_WIDTH
    paneResizeRef.current = { paneId, startX: e.clientX, startWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [paneWidths])

  const extractDraggedNoteId = useCallback((e: React.DragEvent) => {
    const noteId = e.dataTransfer.getData('application/x-noteflow-note-id') || e.dataTransfer.getData('text/plain') || draggingNoteId
    if (!noteId) return null
    return notes.some((n) => n.id === noteId) ? noteId : null
  }, [notes, draggingNoteId])

  const clearDropUi = useCallback(() => {
    setDraggingNoteId(null)
    setEditorDropActive(false)
    setStickyDropActive(false)
  }, [])

  const extractDraggedPaneId = useCallback((e: React.DragEvent) => {
    const paneId = e.dataTransfer.getData('application/x-noteflow-pane-id') || draggingPaneId
    if (!paneId) return null
    return visiblePaneIds.includes(paneId) ? paneId : null
  }, [visiblePaneIds, draggingPaneId])

  const getPaneDropIndexFromPointer = useCallback((clientX: number) => {
    const container = paneContainerRef.current
    if (!container) return visiblePaneIds.length

    const paneElements = Array.from(container.querySelectorAll<HTMLElement>('[data-pane-id]'))
    for (let i = 0; i < paneElements.length; i += 1) {
      const rect = paneElements[i].getBoundingClientRect()
      const midpoint = rect.left + rect.width / 2
      if (clientX < midpoint) return i
    }

    return paneElements.length
  }, [visiblePaneIds.length])

  const handlePaneDragStart = useCallback((e: React.DragEvent<HTMLElement>, paneId: string) => {
    e.dataTransfer.setData('application/x-noteflow-pane-id', paneId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingPaneId(paneId)
    setPaneDropIndex(null)
  }, [])

  const handlePaneDragEnd = useCallback(() => {
    setDraggingPaneId(null)
    setPaneDropIndex(null)
  }, [])

  const handlePaneContainerDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const draggedId = extractDraggedPaneId(e)
    if (!draggedId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const nextIndex = getPaneDropIndexFromPointer(e.clientX)
    if (paneDropIndex !== nextIndex) setPaneDropIndex(nextIndex)
  }, [extractDraggedPaneId, getPaneDropIndexFromPointer, paneDropIndex])

  const handlePaneContainerDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const draggedId = extractDraggedPaneId(e)
    if (!draggedId) return
    e.preventDefault()
    e.stopPropagation()
    const targetIndex = paneDropIndex ?? getPaneDropIndexFromPointer(e.clientX)
    reorderPane(draggedId, targetIndex)
    setDraggingPaneId(null)
    setPaneDropIndex(null)
  }, [extractDraggedPaneId, paneDropIndex, getPaneDropIndexFromPointer, reorderPane])

  const handlePaneContainerDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setPaneDropIndex(null)
  }, [])

  const handleEditorDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    const noteId = extractDraggedNoteId(e)
    if (!noteId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!editorDropActive) setEditorDropActive(true)
  }, [extractDraggedNoteId, editorDropActive])

  const handleEditorDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setEditorDropActive(false)
  }, [])

  const handleEditorDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    const noteId = extractDraggedNoteId(e)
    if (!noteId) return
    e.preventDefault()
    openNoteInSplit(noteId)
    clearDropUi()
  }, [extractDraggedNoteId, openNoteInSplit, clearDropUi])

  const handleStickyDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const noteId = extractDraggedNoteId(e)
    if (!noteId) return
    e.preventDefault()
    e.stopPropagation()
    const note = notes.find((n) => n.id === noteId)
    const firstSectionId = note?.sections[0]?.id
    if (firstSectionId) {
      window.noteflow.openSticky(noteId, firstSectionId)
    }
    clearDropUi()
  }, [extractDraggedNoteId, notes, clearDropUi])

  if (isSticky) {
    return (
      <ErrorBoundary>
        <HoverPreviewProvider>
          <StickyApp />
        </HoverPreviewProvider>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <HoverPreviewProvider>
    <div className="flex flex-col h-screen bg-surface-0 text-text overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <div
          style={{
            width: (brainViewOpen ? brainSidebarVisible : sidebarVisible) ? sidebarWidth : 0,
            minWidth: 0,
            flexShrink: 0,
            overflow: 'hidden',
            transition: isSidebarDragging ? 'none' : 'width 220ms ease',
          }}
        >
          <div style={{ width: sidebarWidth, minWidth: sidebarWidth, height: '100%' }}>
            <Sidebar onCollapse={() => (brainViewOpen ? setBrainSidebarVisible(false) : setSidebarVisible(false))} />
          </div>
        </div>

        {/* Drag handle */}
        {(brainViewOpen ? brainSidebarVisible : sidebarVisible) && (
          <div
            onMouseDown={handleDragStart}
            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-text/30 active:bg-text/50
                       transition-colors group relative z-10"
            title={t.shell.dragToResize}
          />
        )}

        {/* ── Collapse / expand toggle ──────────────────────────────── */}
        {!(brainViewOpen ? brainSidebarVisible : sidebarVisible) && (
          <button
            onClick={() => (brainViewOpen ? setBrainSidebarVisible(true) : setSidebarVisible(true))}
            title={brainViewOpen ? t.shell.showNotes : tf(t.shell.showSidebar, { key: modKey })}
            className={`flex-shrink-0 flex items-center justify-center h-full
                       text-text-muted/40 hover:text-text-muted hover:bg-surface-2
                       border-r border-border transition-colors ${brainViewOpen ? 'w-6' : 'w-7'}`}
          >
            <PanelLeftOpen size={14} />
          </button>
        )}

        {/* ── Main editor ──────────────────────────────────────────── */}
        <main
          className={`flex-1 overflow-hidden relative pr-1 ${editorDropActive ? 'ring-1 ring-inset ring-text/30' : ''}`}
          style={{ background: 'rgb(var(--bg-editor))' }}
          onDragOver={handleEditorDragOver}
          onDragLeave={handleEditorDragLeave}
          onDrop={handleEditorDrop}
        >
          {allViewOpen ? (
            <AllContentOverview onClose={() => setAllView(false)} />
          ) : brainViewOpen ? (
            <BrainView onClose={() => setBrainView(false)} />
          ) : groupViewId ? (
            // Keyed by group (like NoteOverview below): switching groups remounts the view so
            // its local state — multi-selection above all — never leaks into the new group.
            <GroupOverview key={groupViewId} groupId={groupViewId} onClose={() => closeFullView()} />
          ) : noteViewId ? (
            <NoteOverview key={noteViewId} noteId={noteViewId} onClose={() => closeFullView()} />
          ) : isLoading && notes.length === 0 ? (
            // Only show the full-screen spinner on the very first load (nothing to
            // show yet). A background reload triggered by sync keeps the previous
            // notes in memory until it finishes, so we must NOT unmount the editor
            // here — doing so remounts a fresh TipTap instance and resets scroll +
            // focus to the top, which is the "the note resets when it syncs" bug.
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-5 h-5 border-2 border-text/20 border-t-text rounded-full animate-spin" />
              <div className="text-xs font-mono text-text-muted">{t.shell.loadingNotes}</div>
            </div>
          ) : (
            visiblePanes.length <= 1 ? (
              <NoteEditor noteId={visiblePanes[0]?.noteId} paneId={visiblePanes[0]?.paneId} />
            ) : (
              <div className="h-full min-h-0 flex flex-col">
                <div
                  ref={paneScrollRef}
                  className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
                >
                  <div
                    ref={paneContainerRef}
                    onDragOver={handlePaneContainerDragOver}
                    onDrop={handlePaneContainerDrop}
                    onDragLeave={handlePaneContainerDragLeave}
                    className="h-full min-w-full flex relative"
                  >
                    {visiblePanes.map((pane, index) => {
                      const { paneId, noteId } = pane
                      const paneNote = notes.find((n) => n.id === noteId)
                      const noteTitle = paneNote?.title?.trim() || t.common.untitled
                      // Same note in several panes → "Note · Section" tells them apart.
                      const sharesNote = visiblePanes.some((p) => p.paneId !== paneId && p.noteId === noteId)
                      const paneSectionName = sharesNote
                        ? paneNote?.sections.find((s) => s.id === pane.sectionId)?.name
                        : undefined
                      const paneTitle = paneSectionName ? `${noteTitle} · ${paneSectionName}` : noteTitle
                      // A pane is "pinned" once the user has resized it by hand
                      // (it then has a stored width). Otherwise it stays "auto" and
                      // shares the available width via flexbox, recomputed natively
                      // on every render / window resize.
                      const pinnedWidth = paneWidths[paneId]
                      const paneStyle: React.CSSProperties = typeof pinnedWidth === 'number'
                        ? { width: `${pinnedWidth}px`, minWidth: `${PANE_MIN_WIDTH}px`, flexGrow: 0, flexShrink: 0 }
                        : { flex: '1 1 0', minWidth: `${PANE_MIN_WIDTH}px` }
                      return (
                        <section
                          key={paneId}
                          data-pane-id={paneId}
                          style={paneStyle}
                          className={`relative h-full flex flex-col border-r border-border/70 last:border-r-0 ${
                            paneId === activePaneId ? 'ring-1 ring-inset ring-text/20' : ''
                          } ${
                            draggingPaneId === paneId ? 'opacity-70' : ''
                          }`}
                        >
                          {draggingPaneId && paneDropIndex === index && (
                            <div className="absolute inset-y-1 -left-[3px] w-[6px] rounded bg-text/15 border border-text/40 pointer-events-none" />
                          )}
                          <div className="h-9 px-2 border-b border-border/70 bg-surface-1/70 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-text-muted truncate" title={paneTitle}>
                              {paneTitle}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                draggable
                                onDragStart={(e) => handlePaneDragStart(e, paneId)}
                                onDragEnd={handlePaneDragEnd}
                                onClick={(e) => e.preventDefault()}
                                className="px-2 py-1 rounded border border-text/20 bg-surface-2 text-text hover:bg-surface-3 hover:border-text/30 cursor-grab active:cursor-grabbing transition-colors inline-flex items-center gap-1"
                                title={t.shell.reorderColumns}
                              >
                                <GripVertical size={13} />
                                <span className="text-[10px] font-mono hidden xl:inline">{t.shell.drag}</span>
                              </button>
                              <button
                                onClick={() => closePane(paneId)}
                                className="px-2 py-1 rounded border border-red-400/40 bg-red-400/15 text-red-300 hover:bg-red-400/25 hover:border-red-400/70 transition-colors"
                                title={t.shell.closePane}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                          <div className="flex-1 min-h-0">
                            <NoteEditor noteId={noteId} paneId={paneId} />
                          </div>

                          <div
                            onMouseDown={(e) => beginPaneResize(e, paneId)}
                            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-text/20 active:bg-text/35 transition-colors z-20"
                            title={t.shell.resizeColumn}
                          />
                        </section>
                      )
                    })}

                    {draggingPaneId && paneDropIndex === visiblePanes.length && (
                      <div className="absolute inset-y-1 right-0 w-[6px] rounded bg-text/15 border border-text/40 pointer-events-none" />
                    )}
                  </div>
                </div>

                {hasPaneOverflow && (
                  <div className="h-6 border-t border-border/70 bg-surface-1/70 flex items-center justify-center px-3">
                    <span className="text-[10px] font-mono text-text-muted/60">
                      {t.shell.paneOverflowHint}
                    </span>
                  </div>
                )}
              </div>
            )
          )}

          {draggingNoteId && !groupViewId && !noteViewId && !brainViewOpen && (
            <>
              <div
                className={`absolute inset-5 z-20 pointer-events-none rounded-lg border-2 border-dashed transition-colors ${
                  editorDropActive
                    ? 'border-text/40 bg-text/8'
                    : 'border-border/80 bg-surface-1/20'
                }`}
              />

              <div className="absolute top-3 left-3 z-30 pointer-events-none px-2 py-1 rounded border border-text/20 bg-surface-1/90 text-[10px] font-mono text-text-muted">
                {t.shell.dropInEditor}
              </div>

              <div
                className={`absolute bottom-4 right-4 z-40 pointer-events-auto px-3 py-2 rounded border text-xs font-mono transition-colors ${
                  stickyDropActive
                    ? 'border-text/30 bg-surface-2 text-text'
                    : 'border-border bg-surface-1/95 text-text-muted'
                }`}
                onDragOver={(e) => {
                  const noteId = extractDraggedNoteId(e)
                  if (!noteId) return
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'copy'
                  if (!stickyDropActive) setStickyDropActive(true)
                }}
                onDragLeave={(e) => {
                  const next = e.relatedTarget as Node | null
                  if (next && e.currentTarget.contains(next)) return
                  setStickyDropActive(false)
                }}
                onDrop={handleStickyDrop}
              >
                {t.shell.dragToSeparateWindow}
              </div>
            </>
          )}
        </main>
      </div>

      <CommandPalette />
    </div>
    </HoverPreviewProvider>
    </ErrorBoundary>
  )
}

export default App
