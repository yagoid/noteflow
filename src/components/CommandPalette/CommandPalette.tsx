import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import type { Note } from '../../types'
import { Search, Plus, FolderOpen, Keyboard, X } from 'lucide-react'
import { format } from 'date-fns'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim()
  if (!trimmed) return <>{text}</>

  const matcher = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig')
  const parts = text.split(matcher)
  if (parts.length <= 1) return <>{text}</>

  return (
    <>
      {parts.map((part, index) => (
        index % 2 === 1
          ? (
            <mark key={`${part}-${index}`} className="bg-accent/25 text-accent rounded px-[1px]">
              {part}
            </mark>
          )
          : <span key={`${part}-${index}`}>{part}</span>
      ))}
    </>
  )
}

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  category: 'create' | 'navigate' | 'action'
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    notes,
    setActiveNote,
    createNote,
  } = useNotesStore()

  const [query, setQuery] = useState('')
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (commandPaletteOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      const seenCheatSheet = window.localStorage.getItem('noteflow:palette-cheatsheet-seen') === '1'
      setShowCheatSheet(!seenCheatSheet)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIdx(0)
  }, [query])

  if (!commandPaletteOpen) return null

  const staticCommands: Command[] = [
    {
      id: 'new-note',
      label: 'New Note',
      description: 'Create a blank note · Ctrl+N',
      icon: <Plus size={12} className="text-blue-400" />,
      action: () => { createNote(); setCommandPaletteOpen(false) },
      category: 'create',
    },
    {
      id: 'open-folder',
      label: 'Open notes folder',
      description: '~/noteflow-notes',
      icon: <FolderOpen size={12} className="text-text-muted" />,
      action: () => { window.noteflow.openNotesFolder(); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      description: 'Open shortcut cheat sheet',
      icon: <Keyboard size={12} className="text-amber-300" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('noteflow:open-shortcuts'))
        setCommandPaletteOpen(false)
      },
      category: 'action',
    },
  ]

  const q = query.toLowerCase().trim()

  const matchedNotes: Command[] = q
    ? notes
        .filter(
          (n) =>
            !n.archived &&
            (n.title.toLowerCase().includes(q) ||
              n.sections.some((s) => s.content.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) ||
              n.tags.some((t) => t.includes(q)))
        )
        .slice(0, 8)
        .map((n: Note) => ({
          id: `note-${n.id}`,
          label: n.title || 'Untitled',
          description: format(new Date(n.updated), 'MMM d · HH:mm'),
          icon: <Search size={12} className="text-text-muted" />,
          action: () => { setActiveNote(n.id); setCommandPaletteOpen(false) },
          category: 'navigate' as const,
        }))
    : []

  const matchedCommands = q
    ? staticCommands.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.description?.toLowerCase().includes(q) ?? false)
      )
    : staticCommands

  const allItems = [...matchedCommands, ...matchedNotes]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => (allItems.length === 0 ? 0 : (i + 1) % allItems.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => (allItems.length === 0 ? 0 : (i <= 0 ? allItems.length - 1 : i - 1)))
    } else if (e.key === 'Enter' && allItems[selectedIdx]) {
      allItems[selectedIdx].action()
    }
  }

  const dismissCheatSheet = () => {
    setShowCheatSheet(false)
    window.localStorage.setItem('noteflow:palette-cheatsheet-seen', '1')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={14} className="text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes or run command... (Ctrl+P)"
            className="flex-1 bg-transparent text-sm font-mono text-text placeholder-text-muted/50
                       outline-none caret-accent"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="text-text-muted hover:text-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {showCheatSheet && !q && (
            <div className="mx-3 mt-2 mb-2 rounded border border-accent/30 bg-accent/8 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Quick shortcuts</span>
                <button
                  onClick={dismissCheatSheet}
                  className="text-[10px] font-mono text-text-muted/70 hover:text-text transition-colors"
                >
                  hide
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-mono text-text-muted/80">
                <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">Ctrl+P</kbd> palette</span>
                <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">Ctrl+N</kbd> note</span>
                <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">Ctrl+F</kbd> search</span>
                <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">Ctrl+Shift+E</kbd> raw/editor</span>
              </div>
            </div>
          )}

          <div className="px-4 py-1 text-[10px] font-mono text-text-muted/60 uppercase tracking-wider">
            {allItems.length} result{allItems.length === 1 ? '' : 's'}
          </div>

          {allItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs font-mono text-text-muted">
              No results for "{query}"
            </div>
          ) : (
            <>
              {matchedCommands.length > 0 && (
                <>
                  <div className="px-3 py-1.5">
                    <span className="text-xs font-mono text-text-muted/50 uppercase tracking-wider">Commands</span>
                  </div>
                  {matchedCommands.map((cmd, i) => (
                    <CommandItem
                      key={cmd.id}
                      cmd={cmd}
                      query={query}
                      isSelected={selectedIdx === i}
                      onHover={() => setSelectedIdx(i)}
                    />
                  ))}
                </>
              )}
              {matchedNotes.length > 0 && (
                <>
                  <div className="px-3 py-1.5 mt-1">
                    <span className="text-xs font-mono text-text-muted/50 uppercase tracking-wider">Notes</span>
                  </div>
                  {matchedNotes.map((cmd, i) => (
                    <CommandItem
                      key={cmd.id}
                      cmd={cmd}
                      query={query}
                      isSelected={selectedIdx === matchedCommands.length + i}
                      onHover={() => setSelectedIdx(matchedCommands.length + i)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex gap-3">
          {[['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close'], ['Ctrl+P', 'toggle']].map(([key, label]) => (
            <span key={key} className="flex items-center gap-1 text-xs font-mono text-text-muted/50">
              <kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded text-xs">{key}</kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function CommandItem({
  cmd,
  query,
  isSelected,
  onHover,
}: {
  cmd: Command
  query: string
  isSelected: boolean
  onHover: () => void
}) {
  return (
    <button
      onClick={cmd.action}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors
        ${isSelected ? 'bg-accent/10' : 'hover:bg-surface-2'}`}
    >
      <span className="flex-shrink-0">{cmd.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-mono text-text truncate block"><HighlightText text={cmd.label} query={query} /></span>
        {cmd.description && (
          <span className="text-xs font-mono text-text-muted/50 truncate block"><HighlightText text={cmd.description} query={query} /></span>
        )}
      </div>
    </button>
  )
}
