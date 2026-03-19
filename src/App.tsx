import { useEffect, useRef, useState, useCallback } from 'react'
import { useNotesStore } from './stores/notesStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { NoteEditor } from './components/Editor/NoteEditor'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { PanelLeftOpen } from 'lucide-react'
import { StickyApp } from './components/StickyApp'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 256

export function App() {
  const [isSticky] = useState(() => window.location.hash.startsWith('#sticky'))

  const { loadNotes, isLoading, createNote, setCommandPaletteOpen } = useNotesStore()

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(SIDEBAR_DEFAULT)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { loadNotes() }, [loadNotes])

  // ── Global keyboard shortcuts (capture phase — works even inside editors) ─
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+P — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault(); setCommandPaletteOpen(true); return
      }
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
      }
    })

    return () => {
      unbindNew()
      unbindUpdate()
    }
  }, [createNote, loadNotes])

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
            <NoteEditor />
          )}
        </main>
      </div>

      <CommandPalette />
    </div>
  )
}

export default App
