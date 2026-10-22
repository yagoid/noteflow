import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react'
import { buildSearchRegex } from '../../lib/searchUtils'
import { useT } from '../../i18n/useT'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Match {
  from: number
  to: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function findAllMatches(text: string, query: string, caseSensitive: boolean): Match[] {
  const regex = buildSearchRegex(query, { caseSensitive })
  if (!regex) return []
  const matches: Match[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m[0].length === 0) { regex.lastIndex++; continue }
    matches.push({ from: m.index, to: m.index + m[0].length })
  }
  return matches
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Build the mirror div's inner HTML: same text as the textarea but with
 *  <mark> elements at match positions. All text is `color:transparent` so
 *  only the mark backgrounds are visible through the textarea. */
function buildHighlightHtml(text: string, matches: Match[], activeIndex: number): string {
  if (matches.length === 0) return ''
  let html = ''
  let lastIndex = 0
  for (let i = 0; i < matches.length; i++) {
    const { from, to } = matches[i]
    if (from > lastIndex) {
      html += escapeHtml(text.slice(lastIndex, from))
    }
    const cls = i === activeIndex
      ? 'nf-search-match nf-search-match-active'
      : 'nf-search-match'
    // Explicit color:transparent so UA mark styles don't bleed through
    html += `<mark class="${cls}" style="color:transparent">${escapeHtml(text.slice(from, to))}</mark>`
    lastIndex = to
  }
  html += escapeHtml(text.slice(lastIndex))
  // A textarea gives a trailing newline its own (empty) line; a pre-wrap div
  // doesn't. The zero-width space materialises that line so both scroll ranges
  // match (and it adds no height otherwise).
  return html + '\u200b'
}

/** Copy the layout-relevant computed styles from the textarea onto the mirror
 *  so both elements have exactly the same text flow and line breaks. */
function syncMirrorStyles(mirror: HTMLDivElement, textarea: HTMLTextAreaElement) {
  const cs = window.getComputedStyle(textarea)
  // The textarea's vertical scrollbar eats into its content box, but the
  // overflow:hidden mirror has none: pad the mirror by the scrollbar width so
  // both wrap lines at the same column.
  const borderX = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0)
  const scrollbarWidth = Math.max(0, textarea.offsetWidth - textarea.clientWidth - borderX)
  Object.assign(mirror.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    // Transparent text — only mark backgrounds are visible
    color: 'transparent',
    // Text layout must match the textarea exactly
    whiteSpace: 'pre-wrap',
    wordBreak: cs.wordBreak,
    overflowWrap: cs.overflowWrap,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    paddingTop: cs.paddingTop,
    paddingRight: `${(parseFloat(cs.paddingRight) || 0) + scrollbarWidth}px`,
    paddingBottom: cs.paddingBottom,
    paddingLeft: cs.paddingLeft,
    // Transparent border to preserve the same inner width as the textarea
    borderTop: `${cs.borderTopWidth} solid transparent`,
    borderRight: `${cs.borderRightWidth} solid transparent`,
    borderBottom: `${cs.borderBottomWidth} solid transparent`,
    borderLeft: `${cs.borderLeftWidth} solid transparent`,
    boxSizing: cs.boxSizing,
  })
}

// ── Component ──────────────────────────────────────────────────────────────────

interface RawNoteSearchBarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  content: string
  onClose: () => void
}

export function RawNoteSearchBar({ textareaRef, content, onClose }: RawNoteSearchBarProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mirrorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // ── Create / destroy the mirror div ────────────────────────────────────────
  // Layout effect, declared before the update effect below, so the mirror exists
  // (and gets styled) in the same commit the bar mounts.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    const container = textarea?.parentElement
    if (!textarea || !container) return

    const mirror = document.createElement('div')
    mirror.setAttribute('aria-hidden', 'true')
    // Insert mirror before the textarea so it renders below it in stacking order.
    // The textarea has bg-transparent (set in NoteEditor), so the mirror's mark
    // backgrounds show through.
    container.insertBefore(mirror, textarea)
    mirrorRef.current = mirror

    // Keep mirror scroll in sync with the textarea
    const syncScroll = () => { mirror.scrollTop = textarea.scrollTop }
    textarea.addEventListener('scroll', syncScroll)

    return () => {
      mirror.remove()
      mirrorRef.current = null
      textarea.removeEventListener('scroll', syncScroll)
    }
  }, [textareaRef])

  // ── Update mirror HTML and styles on every relevant change ─────────────────
  // A scroll request (query change or next/prev) is served here, right after
  // the mirror holds the new active <mark>, so the match position is MEASURED
  // from the real layout (soft-wrapped lines included) instead of estimated.
  const [scrollRequest, setScrollRequest] = useState(0)
  const servedScrollRef = useRef(0)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    const mirror = mirrorRef.current
    if (!textarea || !mirror) return

    syncMirrorStyles(mirror, textarea)
    mirror.innerHTML = buildHighlightHtml(content, matches, activeIndex)
    if (scrollRequest !== servedScrollRef.current) {
      servedScrollRef.current = scrollRequest
      // The mirror is position:absolute, so it is the mark's offsetParent and
      // offsetTop is in the same content coordinates as textarea.scrollTop.
      const mark = mirror.querySelector<HTMLElement>('.nf-search-match-active')
      if (mark) {
        textarea.scrollTop = mark.offsetTop + mark.offsetHeight / 2 - textarea.clientHeight / 2
      }
    }
    // Setting innerHTML resets the mirror's scroll; re-align it with the textarea.
    mirror.scrollTop = textarea.scrollTop
  }, [content, matches, activeIndex, scrollRequest, textareaRef])

  // Select the match (shown when the textarea is later focused) and centre it.
  const revealMatch = (match: Match) => {
    textareaRef.current?.setSelectionRange(match.from, match.to)
    setScrollRequest((n) => n + 1)
  }

  // ── Compute matches (debounced) ────────────────────────────────────────────
  // Only a new query / case toggle jumps to the first match: re-matching after
  // an edit in the textarea must not yank the view away from the caret.
  const lastSearchRef = useRef<{ query: string; caseSensitive: boolean } | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const newMatches = findAllMatches(content, query, caseSensitive)
      const last = lastSearchRef.current
      const searchChanged = !last || last.query !== query || last.caseSensitive !== caseSensitive
      lastSearchRef.current = { query, caseSensitive }
      setMatches(newMatches)
      setActiveIndex(0)
      if (searchChanged && newMatches.length > 0) revealMatch(newMatches[0])
    }, 80)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, caseSensitive, content]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (index: number) => {
    if (matches.length === 0) return
    setActiveIndex(index)
    revealMatch(matches[index])
  }

  const next = () => navigate((activeIndex + 1) % matches.length)
  const prev = () => navigate((activeIndex - 1 + matches.length) % matches.length)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) prev(); else next(); return }
  }

  const matchCount = matches.length
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
