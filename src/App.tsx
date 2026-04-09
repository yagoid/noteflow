import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNotesStore } from './stores/notesStore'
import { useGroupsStore } from './stores/groupsStore'
import { useSectionTagColorsStore } from './stores/sectionTagColorsStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { NoteEditor } from './components/Editor/NoteEditor'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { PanelLeftOpen, X } from 'lucide-react'
import { StickyApp } from './components/StickyApp'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 256

export function App() {
  const [isSticky] = useState(() => window.location.hash.startsWith('#sticky'))

  const { loadNotes, isLoading, createNote, setCommandPaletteOpen } = useNotesStore()
  const notes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const openNoteIds = useNotesStore((s) => s.openNoteIds)
  const closeOpenNote = useNotesStore((s) => s.closeOpenNote)
  const loadGroups = useGroupsStore((s) => s.loadGroups)
  const loadSectionTagColors = useSectionTagColorsStore((s) => s.loadSectionTagColors)

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const isDragging = useRef(false)
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
      // Ctrl+N — new note (always, even when editing)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault(); createNote(); return
      }
      // Ctrl+' — toggle sidebar (Spanish keyboards often have ' on the key next to 0)
      if ((e.ctrlKey || e.metaKey) && (e.key === "'" || e.code === 'Quote' || e.code === 'Minus')) {
        e.preventDefault(); setSidebarVisible((v) => !v); return
      }
      // Ctrl+T — new tab in active note
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:add-tab'))
        return
      }
      // Ctrl+W — close active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:close-tab'))
        return
      }
      // Ctrl+F — focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('noteflow:focus-search'))
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

  const visibleOpenNoteIds = useMemo(() => {
    const existingIds = new Set(notes.map((note) => note.id))
    const validOpen = openNoteIds.filter((id) => existingIds.has(id))
    if (validOpen.length > 0) return validOpen
    if (activeNoteId && existingIds.has(activeNoteId)) return [activeNoteId]
    return []
  }, [notes, openNoteIds, activeNoteId])

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
        <main className="flex-1 overflow-hidden" style={{ background: 'rgb(var(--bg-editor))' }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <div className="text-xs font-mono text-text-muted">Loading notes...</div>
            </div>
          ) : (
            visibleOpenNoteIds.length <= 1 ? (
              <NoteEditor noteId={visibleOpenNoteIds[0]} />
            ) : (
              <div className="h-full overflow-x-auto overflow-y-hidden">
                <div className="h-full min-w-full flex">
                  {visibleOpenNoteIds.map((noteId) => (
                    <section
                      key={noteId}
                      className={`relative h-full min-w-[420px] flex-1 border-r border-border/70 last:border-r-0 ${
                        noteId === activeNoteId ? 'ring-1 ring-inset ring-accent/30' : ''
                      }`}
                    >
                      <button
                        onClick={() => closeOpenNote(noteId)}
                        className="absolute top-2 right-2 z-20 p-1 rounded border border-border/80 bg-surface-1/90 text-text-muted/70 hover:text-text hover:border-accent/40 transition-colors"
                        title="Close pane"
                      >
                        <X size={12} />
                      </button>
                      <NoteEditor noteId={noteId} />
                    </section>
                  ))}
                </div>
              </div>
            )
          )}
        </main>
      </div>

      <CommandPalette />
    </div>
  )
}

export default App
