import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNotesStore } from './stores/notesStore'
import { useGroupsStore } from './stores/groupsStore'
import { useSectionTagColorsStore } from './stores/sectionTagColorsStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { NoteEditor } from './components/Editor/NoteEditor'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { GripVertical, PanelLeftOpen, X } from 'lucide-react'
import { StickyApp } from './components/StickyApp'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 256
const PANE_MIN_WIDTH = 360
const PANE_MAX_WIDTH = 1200
const PANE_DEFAULT_WIDTH = 520

export function App() {
  const [isSticky] = useState(() => window.location.hash.startsWith('#sticky'))

  const { loadNotes, isLoading, createNote, setCommandPaletteOpen } = useNotesStore()
  const notes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const openNoteIds = useNotesStore((s) => s.openNoteIds)
  const closeOpenNote = useNotesStore((s) => s.closeOpenNote)
  const openNoteInSplit = useNotesStore((s) => s.openNoteInSplit)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const loadGroups = useGroupsStore((s) => s.loadGroups)
  const loadSectionTagColors = useSectionTagColorsStore((s) => s.loadSectionTagColors)

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [sidebarVisible, setSidebarVisible] = useState(true)
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

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadNotes()
    loadGroups()
    loadSectionTagColors()
  }, [loadNotes, loadGroups, loadSectionTagColors])

  // ── Global keyboard shortcuts (capture phase — works even inside editors) ─
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isAccel = e.ctrlKey || e.metaKey
      if (!isAccel || e.altKey) return
      const key = e.key.toLowerCase()

      // Ctrl+N — new note (always, even when editing)
      if (!e.shiftKey && (key === 'n' || e.code === 'KeyN')) {
        e.preventDefault(); createNote(); return
      }
      // Ctrl+P — toggle command palette
      if (!e.shiftKey && (key === 'p' || e.code === 'KeyP')) {
        e.preventDefault(); setCommandPaletteOpen(!useNotesStore.getState().commandPaletteOpen); return
      }
      // Ctrl+' — toggle sidebar (Spanish keyboards often have ' on the key next to 0)
      if (!e.shiftKey && (e.key === "'" || e.key === '´' || e.code === 'Quote' || e.code === 'Minus')) {
        e.preventDefault(); setSidebarVisible((v) => !v); return
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
  }, [createNote, setCommandPaletteOpen, setSidebarVisible])

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
        loadSectionTagColors()
      }
    })

    return () => {
      unbindNew()
      unbindUpdate()
    }
  }, [createNote, loadNotes, loadGroups, loadSectionTagColors])

  // ── Resize drag handlers ──────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartW.current = sidebarWidth
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
      if (detail?.active) {
        setDraggingNoteId(detail.noteId ?? null)
      } else {
        setDraggingNoteId(null)
        setEditorDropActive(false)
        setStickyDropActive(false)
      }
    }

    window.addEventListener('noteflow:note-drag', handler)
    return () => window.removeEventListener('noteflow:note-drag', handler)
  }, [])

  const visibleOpenNoteIds = useMemo(() => {
    const existingIds = new Set(notes.map((note) => note.id))
    const validOpen = openNoteIds.filter((id) => existingIds.has(id))
    if (validOpen.length > 0) return validOpen
    if (activeNoteId && existingIds.has(activeNoteId)) return [activeNoteId]
    return []
  }, [notes, openNoteIds, activeNoteId])

  useEffect(() => {
    setPaneWidths((prev) => {
      let changed = false
      const next: Record<string, number> = { ...prev }

      for (const id of visibleOpenNoteIds) {
        if (typeof next[id] !== 'number') {
          next[id] = PANE_DEFAULT_WIDTH
          changed = true
        }
      }

      for (const id of Object.keys(next)) {
        if (!visibleOpenNoteIds.includes(id)) {
          delete next[id]
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [visibleOpenNoteIds])

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
  }, [refreshPaneOverflowState, visibleOpenNoteIds, paneWidths, sidebarVisible, sidebarWidth, isLoading])

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
    const startWidth = paneWidths[paneId] ?? PANE_DEFAULT_WIDTH
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
    return visibleOpenNoteIds.includes(paneId) ? paneId : null
  }, [visibleOpenNoteIds, draggingPaneId])

  const getPaneDropIndexFromPointer = useCallback((clientX: number) => {
    const container = paneContainerRef.current
    if (!container) return visibleOpenNoteIds.length

    const paneElements = Array.from(container.querySelectorAll<HTMLElement>('[data-pane-id]'))
    for (let i = 0; i < paneElements.length; i += 1) {
      const rect = paneElements[i].getBoundingClientRect()
      const midpoint = rect.left + rect.width / 2
      if (clientX < midpoint) return i
    }

    return paneElements.length
  }, [visibleOpenNoteIds.length])

  const reorderOpenPanes = useCallback((draggedId: string, targetIndex: number) => {
    const current = [...visibleOpenNoteIds]
    const fromIndex = current.indexOf(draggedId)
    if (fromIndex === -1) return

    const clampedTarget = Math.max(0, Math.min(targetIndex, current.length))
    if (clampedTarget === fromIndex || clampedTarget === fromIndex + 1) return

    current.splice(fromIndex, 1)
    const adjustedTarget = clampedTarget > fromIndex ? clampedTarget - 1 : clampedTarget
    current.splice(adjustedTarget, 0, draggedId)
    setOpenNoteIds(current)
  }, [visibleOpenNoteIds, setOpenNoteIds])

  const handlePaneDragStart = useCallback((e: React.DragEvent<HTMLElement>, noteId: string) => {
    e.dataTransfer.setData('application/x-noteflow-pane-id', noteId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingPaneId(noteId)
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
    reorderOpenPanes(draggedId, targetIndex)
    setDraggingPaneId(null)
    setPaneDropIndex(null)
  }, [extractDraggedPaneId, paneDropIndex, getPaneDropIndexFromPointer, reorderOpenPanes])

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
    return <StickyApp />
  }

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-text overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        {sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex-shrink-0 overflow-hidden">
              <Sidebar onCollapse={() => setSidebarVisible(false)} />
            </div>

            {/* Drag handle */}
            <div
              onMouseDown={handleDragStart}
              className="w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/40 active:bg-accent/60
                         transition-colors group relative z-10"
              title="Drag to resize"
            />
          </>
        )}

        {/* ── Collapse / expand toggle ──────────────────────────────── */}
        {!sidebarVisible && (
          <button
            onClick={() => setSidebarVisible(true)}
            title="Show sidebar (Ctrl+')"
            className="flex-shrink-0 flex items-center justify-center w-7 h-full
                       text-text-muted/40 hover:text-text-muted hover:bg-surface-2
                       border-r border-border transition-colors"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}

        {/* ── Main editor ──────────────────────────────────────────── */}
        <main
          className={`flex-1 overflow-hidden relative ${editorDropActive ? 'ring-1 ring-inset ring-accent/40' : ''}`}
          style={{ background: 'rgb(var(--bg-editor))' }}
          onDragOver={handleEditorDragOver}
          onDragLeave={handleEditorDragLeave}
          onDrop={handleEditorDrop}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <div className="text-xs font-mono text-text-muted">Loading notes...</div>
            </div>
          ) : (
            visibleOpenNoteIds.length <= 1 ? (
              <NoteEditor noteId={visibleOpenNoteIds[0]} />
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
                    {visibleOpenNoteIds.map((noteId, index) => {
                      const paneNote = notes.find((n) => n.id === noteId)
                      const paneTitle = paneNote?.title?.trim() || 'Untitled'
                      const paneWidth = paneWidths[noteId] ?? PANE_DEFAULT_WIDTH
                      return (
                        <section
                          key={noteId}
                          data-pane-id={noteId}
                          style={{ width: `${paneWidth}px`, minWidth: `${PANE_MIN_WIDTH}px` }}
                          className={`relative h-full flex-shrink-0 flex flex-col border-r border-border/70 last:border-r-0 ${
                            noteId === activeNoteId ? 'ring-1 ring-inset ring-accent/30' : ''
                          } ${
                            draggingPaneId === noteId ? 'opacity-70' : ''
                          }`}
                        >
                          {draggingPaneId && paneDropIndex === index && (
                            <div className="absolute inset-y-1 -left-[3px] w-[6px] rounded bg-accent/25 border border-accent/60 pointer-events-none" />
                          )}
                          <div className="h-9 px-2 border-b border-border/70 bg-surface-1/70 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-text-muted truncate" title={paneTitle}>
                              {paneTitle}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                draggable
                                onDragStart={(e) => handlePaneDragStart(e, noteId)}
                                onDragEnd={handlePaneDragEnd}
                                onClick={(e) => e.preventDefault()}
                                className="px-2 py-1 rounded border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 hover:border-accent/70 cursor-grab active:cursor-grabbing transition-colors inline-flex items-center gap-1"
                                title="Reorder columns"
                              >
                                <GripVertical size={13} />
                                <span className="text-[10px] font-mono hidden xl:inline">Drag</span>
                              </button>
                              <button
                                onClick={() => closeOpenNote(noteId)}
                                className="px-2 py-1 rounded border border-red-400/40 bg-red-400/15 text-red-300 hover:bg-red-400/25 hover:border-red-400/70 transition-colors"
                                title="Close pane"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                          <div className="flex-1 min-h-0">
                            <NoteEditor noteId={noteId} />
                          </div>

                          <div
                            onMouseDown={(e) => beginPaneResize(e, noteId)}
                            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-accent/25 active:bg-accent/45 transition-colors z-20"
                            title="Resize column"
                          />
                        </section>
                      )
                    })}

                    {draggingPaneId && paneDropIndex === visibleOpenNoteIds.length && (
                      <div className="absolute inset-y-1 right-0 w-[6px] rounded bg-accent/25 border border-accent/60 pointer-events-none" />
                    )}
                  </div>
                </div>

                {hasPaneOverflow && (
                  <div className="h-6 border-t border-border/70 bg-surface-1/70 flex items-center justify-center px-3">
                    <span className="text-[10px] font-mono text-text-muted/60">
                      Scroll horizontally for more panes · drag handle to reorder
                    </span>
                  </div>
                )}
              </div>
            )
          )}

          {draggingNoteId && (
            <>
              <div
                className={`absolute inset-5 z-20 pointer-events-none rounded-lg border-2 border-dashed transition-colors ${
                  editorDropActive
                    ? 'border-accent/70 bg-accent/10'
                    : 'border-border/80 bg-surface-1/20'
                }`}
              />

              <div className="absolute top-3 left-3 z-30 pointer-events-none px-2 py-1 rounded border border-accent/30 bg-surface-1/90 text-[10px] font-mono text-text-muted">
                Drop in editor to open side by side
              </div>

              <div
                className={`absolute bottom-4 right-4 z-40 pointer-events-auto px-3 py-2 rounded border text-xs font-mono transition-colors ${
                  stickyDropActive
                    ? 'border-accent/60 bg-accent/15 text-accent'
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
                Soltar para abrir en ventana aparte
              </div>
            </>
          )}
        </main>
      </div>

      <CommandPalette />
    </div>
  )
}

export default App
