import { useMemo, useRef, useEffect } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import type { Note } from '../../types'
import { Archive, Search, Tag, Pin, PanelLeftClose } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'

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
  const filterSection = useNotesStore((s) => s.filterSection)
  const filterTag = useNotesStore((s) => s.filterTag)
  const showArchived = useNotesStore((s) => s.showArchived)

  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setFilterSection = useNotesStore((s) => s.setFilterSection)
  const setFilterTag = useNotesStore((s) => s.setFilterTag)
  const setShowArchived = useNotesStore((s) => s.setShowArchived)
  const createNote = useNotesStore((s) => s.createNote)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Focus search via Ctrl+F custom event ──────────────────────────────────
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
        if (filterSection === 'all') return true
        return n.sections.some(
          (s) => s.name.toLowerCase() === filterSection.toLowerCase() && s.content.trim().length > 0
        )
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
  }, [rawNotes, showArchived, filterSection, filterTag, searchQuery])

  const allTags = useMemo(() => {
    const all = rawNotes.flatMap((n) => n.tags)
    return [...new Set(all)].sort()
  }, [rawNotes])

  const allSectionNames = useMemo(() => {
    const names = new Set<string>()
    rawNotes.forEach((n) => n.sections.forEach((sec) => names.add(sec.name)))
    return Array.from(names).sort()
  }, [rawNotes])

  return (
    <div className="flex flex-col h-full border-r border-border bg-surface-1">
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

      {/* ── Section filters ────────────────────────────────────────── */}
      {allSectionNames.length > 0 && (
        <div className="flex gap-1 px-3 py-2 border-b border-border flex-wrap">
          <button
            onClick={() => setFilterSection('all')}
            className={`px-2 py-0.5 rounded text-xs font-mono transition-colors
              ${filterSection === 'all'
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'text-text-muted hover:text-text border border-transparent'
              }`}
          >
            All
          </button>
          {allSectionNames.map((name) => (
            <button
              key={name}
              onClick={() => setFilterSection(filterSection === name ? 'all' : name)}
              className={`px-2 py-0.5 rounded text-xs font-mono transition-colors
                ${filterSection === name
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'text-text-muted hover:text-text border border-transparent'
                }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* ── Tags ───────────────────────────────────────────────────── */}
      {allTags.length > 0 && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1 mb-1.5">
            <Tag size={10} className="text-text-muted" />
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Tags</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {allTags.slice(0, 12).map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={`text-xs font-mono px-1.5 py-0.5 rounded transition-colors
                  ${filterTag === tag
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'text-text-muted/70 hover:text-text-muted border border-border'
                  }`}
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
          className="w-full py-1.5 rounded text-xs font-mono
                     border border-border hover:border-accent/30 transition-colors
                     text-text-muted hover:text-text bg-surface-2 hover:bg-surface-2/80"
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
          <ul className="py-1">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  onClick={() => setActiveNote(note.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors
                    ${activeNoteId === note.id
                      ? 'bg-accent/10 border-r-2 border-accent'
                      : 'hover:bg-surface-2 border-r-2 border-transparent'
                    }`}
                >
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
                  {hasAnyContent(note) && (
                    <p className="text-xs font-mono text-text-muted/50 truncate mt-0.5 leading-tight">
                      {noteExcerpt(note)}
                    </p>
                  )}
                  {note.archived && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-mono text-text-muted/40 mt-0.5">
                      <Archive size={9} /> archived
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
