import { useMemo, useRef, useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import type { Note } from '../../types'
import { Archive, Search, Tag, Pin, PanelLeftClose, Trash2, PinOff } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { ConfirmModal } from '../ConfirmModal'
import { tagStyle, getTagColor } from '../../lib/tagColors'

interface SidebarProps {
  onCollapse: () => void
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

function noteExcerpt(note: Note): string {
  const content = note.sections[0]?.content ?? ''
  return content
    .replace(/^#{1,3}\s+.+$/m, '')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/[#*_`~]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 80)
}

function hasAnyContent(note: Note): boolean {
  return note.sections.some((s) => s.content.trim().length > 0)
}

/** Normalize a string: lowercase + strip diacritical marks (accents) */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

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
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setFilterDate = useNotesStore((s) => s.setFilterDate)
  const setFilterTag = useNotesStore((s) => s.setFilterTag)
  const setShowArchived = useNotesStore((s) => s.setShowArchived)
  const createNote = useNotesStore((s) => s.createNote)

  const searchRef = useRef<HTMLInputElement>(null)

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    noteId: string
  } | null>(null)

  // Confirm modal state
  const [modal, setModal] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger: boolean
    onConfirm: () => void
  } | null>(null)

  // ── Close context menu on click elsewhere ──────────────────────────────────
  useEffect(() => {
    const close = () => setContextMenu(null)
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

  // Stable derived values — only recomputed when the underlying primitives change
  const notes = useMemo(() => {
    return rawNotes
      .filter((n) => showArchived || !n.archived)
      .filter((n) => {
        if (filterDate === 'all') return true
        const updated = new Date(n.updated)
        const now = new Date()
        if (filterDate === 'today') return isToday(updated)
        if (filterDate === 'week') {
          const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
          return updated >= weekAgo
        }
        if (filterDate === 'month') {
          const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1)
          return updated >= monthAgo
        }
        return true
      })
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
  }, [rawNotes, showArchived, filterDate, filterTag, searchQuery])

  const allTags = useMemo(() => {
    const all = rawNotes.flatMap((n) => n.tags)
    return [...new Set(all)].sort()
  }, [rawNotes])

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
      {/* ── Search + collapse ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search... (Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 bg-surface-2 border border-border rounded text-xs
                       font-mono text-text placeholder-text-muted/50 outline-none
                       focus:border-accent/50 transition-colors caret-accent"
          />
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

      {/* ── Date filter ────────────────────────────────────────────── */}
      <div className="flex gap-1 px-3 py-2 border-b border-border">
        {(['all', 'today', 'week', 'month'] as const).map((opt) => {
          const labels = { all: 'All', today: 'Today', week: 'Week', month: 'Month' }
          const active = filterDate === opt
          return (
            <button
              key={opt}
              onClick={() => setFilterDate(opt)}
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

      {/* ── Tags ───────────────────────────────────────────────────── */}
      {allTags.length > 0 && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1 mb-1.5">
            <Tag size={10} className="text-text-muted" />
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Tags</span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-[72px] overflow-y-auto">
            {allTags.slice(0, 12).map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className="text-xs font-mono px-1.5 py-0.5 rounded transition-colors"
                style={tagStyle(tag, filterTag === tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── New note button ─────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={() => createNote()}
          title="New note (Ctrl+N)"
          className="w-full py-1.5 rounded text-xs font-mono transition-all
                     bg-accent/10 text-accent border border-accent/20 
                     hover:bg-accent/20 hover:border-accent/40"
        >
          + New note
        </button>
      </div>

      {/* ── Notes list ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted gap-2">
            <span className="text-2xl opacity-20">∅</span>
            <span className="text-xs font-mono">No notes</span>
          </div>
        ) : (
          <ul className="pt-2 pb-1">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  onClick={() => setActiveNote(note.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({
                      x: e.clientX,
                      y: Math.min(e.clientY, window.innerHeight - 150),
                      noteId: note.id
                    })
                  }}
                  className={`relative w-full text-left px-4 py-2 transition-colors h-[60px] flex flex-col justify-center
                    ${activeNoteId === note.id
                      ? 'bg-accent/10 border-r-2 border-accent'
                      : 'hover:bg-surface-2 border-r-2 border-transparent'
                    }`}
                >
                  {activeNoteId === note.id && (
                    <div className="absolute left-1 top-2.5 bottom-2.5 w-[1px] bg-accent rounded-full" />
                  )}
                  <div className="flex items-center gap-1 min-w-0">
                    {note.pinned && <Pin size={9} className="text-yellow-400 flex-shrink-0" />}
                    <span className={`text-xs font-mono font-medium truncate flex-1
                      ${activeNoteId === note.id ? 'text-text' : 'text-text/80'}`}>
                      {note.title || 'Untitled'}
                    </span>
                    <span className="text-xs font-mono text-text-muted/50 flex-shrink-0 ml-1">
                      {formatNoteDate(note.updated)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
                    {note.sections.map((section) => (
                      <span
                        key={section.id}
                        className="text-[9px] font-mono px-1 rounded flex-shrink-0 leading-[1.6]"
                        style={getTagColor(section.name)}
                      >
                        {section.name}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Context Menu ─────────────────────────────────────────────────── */}
      {contextMenu && (() => {
        const note = rawNotes.find(n => n.id === contextMenu.noteId)
        if (!note) return null
        return (
          <div
            className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-44 overflow-hidden animate-in fade-in zoom-in duration-100"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                updateNote(note.id, { pinned: !note.pinned })
                setContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
            >
              {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              {note.pinned ? 'Unpin note' : 'Pin note'}
            </button>
            <button
              onClick={() => {
                archiveNote(note.id)
                setContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-accent/10 hover:text-accent flex items-center gap-2 transition-colors"
            >
              <Archive size={12} />
              {note.archived ? 'Unarchive' : 'Archive'}
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => {
                setContextMenu(null)
                setModal({
                  title: 'Delete note',
                  message: `"${note.title || 'Untitled'}" will be permanently deleted.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: () => {
                    setModal(null)
                    deleteNote(note.id)
                  },
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

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-t border-border flex items-center justify-between">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-1 text-xs font-mono transition-colors
            ${showArchived ? 'text-accent' : 'text-text-muted hover:text-text'}`}
        >
          <Archive size={10} />
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
        <span className="text-xs font-mono text-text-muted/40">{notes.length} notes</span>
      </div>
    </div>
  )
}
