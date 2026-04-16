import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react'
import type { EditorHandle } from './Editor'

interface InNoteSearchBarProps {
  editorRef: RefObject<EditorHandle | null>
  onClose: () => void
}

export function InNoteSearchBar({ editorRef, onClose }: InNoteSearchBarProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const editor = editorRef.current?.editor
    if (!editor) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      editor.commands.setSearchTerm(query, caseSensitive)
    }, 80)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, caseSensitive, editorRef])

  useEffect(() => {
    const editor = editorRef.current?.editor
    if (!editor) return

    const update = () => {
      setMatchCount(editor.storage.searchHighlight.getMatchCount())
      setActiveIndex(editor.storage.searchHighlight.getActiveIndex())
    }
    update()
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editorRef])

  useEffect(() => {
    return () => {
      editorRef.current?.editor?.commands.clearSearch()
    }
  }, [editorRef])

  const next = () => editorRef.current?.editor?.commands.searchNext()
  const prev = () => editorRef.current?.editor?.commands.searchPrev()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prev()
      else next()
      return
    }
  }

  const hasQuery = query.trim().length > 0
  const noMatches = hasQuery && matchCount === 0

  return (
    <div
      className="absolute top-2 right-4 z-20 flex items-center gap-1 bg-surface-2 border border-border rounded-md shadow-lg pl-2 pr-1 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in note"
        className="w-44 bg-transparent text-sm text-text placeholder:text-text-muted outline-none"
      />

      <span
        className={`text-xs tabular-nums px-1 min-w-[44px] text-center ${
          noMatches ? 'text-red' : 'text-text-muted'
        }`}
      >
        {hasQuery ? `${matchCount === 0 ? 0 : activeIndex + 1}/${matchCount}` : '\u00A0'}
      </span>

      <button
        type="button"
        onClick={() => setCaseSensitive((v) => !v)}
        title="Match case"
        aria-pressed={caseSensitive}
        className={`p-1 rounded hover:bg-surface-3 ${
          caseSensitive ? 'bg-accent/20 text-accent' : 'text-text-muted'
        }`}
      >
        <CaseSensitive size={14} />
      </button>

      <button
        type="button"
        onClick={prev}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
        className="p-1 rounded text-text-muted hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronUp size={14} />
      </button>

      <button
        type="button"
        onClick={next}
        disabled={matchCount === 0}
        title="Next match (Enter)"
        className="p-1 rounded text-text-muted hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronDown size={14} />
      </button>

      <button
        type="button"
        onClick={onClose}
        title="Close (Escape)"
        className="p-1 rounded text-text-muted hover:bg-surface-3"
      >
        <X size={14} />
      </button>
    </div>
  )
}
