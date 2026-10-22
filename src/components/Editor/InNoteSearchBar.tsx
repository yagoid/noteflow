import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react'
import type { EditorHandle } from './Editor'
import { useT } from '../../i18n/useT'

/**
 * Scroll `el` to the vertical centre of `scroller` (the browser clamps at the
 * ends) and, for any horizontal scroller in between (kanban board, code block),
 * just enough to reveal it. Done by hand instead of `scrollIntoView` so only
 * the note's own scrollers move — never `overflow: hidden` ancestors.
 */
function centerInScroller(el: HTMLElement, scroller: HTMLElement) {
  for (let node = el.parentElement; node && node !== scroller; node = node.parentElement) {
    const { overflowX } = getComputedStyle(node)
    if ((overflowX !== 'auto' && overflowX !== 'scroll') || node.scrollWidth <= node.clientWidth) continue
    const r = el.getBoundingClientRect()
    const nr = node.getBoundingClientRect()
    const margin = 24
    if (r.left < nr.left) node.scrollLeft -= nr.left - r.left + margin
    else if (r.right > nr.left + node.clientWidth) node.scrollLeft += r.right - (nr.left + node.clientWidth) + margin
  }
  const r = el.getBoundingClientRect()
  const sr = scroller.getBoundingClientRect()
  const offset = r.top - sr.top - scroller.clientTop
  scroller.scrollTop += offset - (scroller.clientHeight - r.height) / 2
}

interface InNoteSearchBarProps {
  editorRef: RefObject<EditorHandle | null>
  onClose: () => void
}

export function InNoteSearchBar({ editorRef, onClose }: InNoteSearchBarProps) {
  const t = useT()
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

  // Centre the active match in the note's scroller. Deferred a frame so a
  // kanban board (React node view) has painted its active card first.
  // ProseMirror's own tr.scrollIntoView() in searchNext/Prev doesn't help here:
  // focus stays in this input and it only scrolls to the nearest edge.
  const scrollToActiveMatch = useCallback(() => {
    requestAnimationFrame(() => {
      const handle = editorRef.current
      const el = handle?.editor?.view.dom.querySelector<HTMLElement>('.nf-search-match-active')
      const scroller = handle?.getScrollContainer()
      if (el && scroller) centerInScroller(el, scroller)
    })
  }, [editorRef])

  useEffect(() => {
    const editor = editorRef.current?.editor
    if (!editor) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      editor.commands.setSearchTerm(query, caseSensitive)
      // onTransaction in SearchHighlight has already updated storage.matchCount
      // synchronously inside dispatchTransaction, so these reads are reliable.
      setMatchCount(editor.storage.searchHighlight.matchCount)
      setActiveIndex(editor.storage.searchHighlight.activeIndex)
      if (editor.storage.searchHighlight.matchCount > 0) scrollToActiveMatch()
    }, 80)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, caseSensitive, editorRef, scrollToActiveMatch])

  // Keep counts in sync for any transaction that changes matches while the
  // search bar is open (e.g. user types in the editor, or navigates matches).
  useEffect(() => {
    const editor = editorRef.current?.editor
    if (!editor) return

    const syncCounts = () => {
      setMatchCount(editor.storage.searchHighlight.matchCount)
      setActiveIndex(editor.storage.searchHighlight.activeIndex)
    }

    editor.on('transaction', syncCounts)
    return () => {
      editor.off('transaction', syncCounts)
    }
  }, [editorRef])

  useEffect(() => {
    return () => {
      editorRef.current?.editor?.commands.clearSearch()
    }
  }, [editorRef])

  const next = () => {
    const editor = editorRef.current?.editor
    if (!editor) return
    editor.commands.searchNext()
    setMatchCount(editor.storage.searchHighlight.matchCount)
    setActiveIndex(editor.storage.searchHighlight.activeIndex)
    scrollToActiveMatch()
  }
  const prev = () => {
    const editor = editorRef.current?.editor
    if (!editor) return
    editor.commands.searchPrev()
    setMatchCount(editor.storage.searchHighlight.matchCount)
    setActiveIndex(editor.storage.searchHighlight.activeIndex)
    scrollToActiveMatch()
  }

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
        placeholder={t.editor.search.findInNote}
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
        title={t.editor.search.matchCase}
        aria-pressed={caseSensitive}
        className={`p-1 rounded hover:bg-surface-3 ${
          caseSensitive ? 'bg-surface-3 text-text' : 'text-text-muted'
        }`}
      >
        <CaseSensitive size={14} />
      </button>

      <button
        type="button"
        onClick={prev}
        disabled={matchCount === 0}
        title={t.editor.search.previousMatch}
        className="p-1 rounded text-text-muted hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronUp size={14} />
      </button>

      <button
        type="button"
        onClick={next}
        disabled={matchCount === 0}
        title={t.editor.search.nextMatch}
        className="p-1 rounded text-text-muted hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronDown size={14} />
      </button>

      <button
        type="button"
        onClick={onClose}
        title={t.editor.search.close}
        className="p-1 rounded text-text-muted hover:bg-surface-3"
      >
        <X size={14} />
      </button>
    </div>
  )
}
