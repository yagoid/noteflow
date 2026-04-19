import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react'
import { buildSearchRegex } from '../../lib/searchUtils'

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
  return html
}

/** Copy the layout-relevant computed styles from the textarea onto the mirror
 *  so both elements have exactly the same text flow and line breaks. */
function syncMirrorStyles(mirror: HTMLDivElement, textarea: HTMLTextAreaElement) {
  const cs = window.getComputedStyle(textarea)
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
    paddingRight: cs.paddingRight,
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
  useEffect(() => {
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
  useEffect(() => {
    const textarea = textareaRef.current
    const mirror = mirrorRef.current
    if (!textarea || !mirror) return

    syncMirrorStyles(mirror, textarea)
    const prevScrollTop = textarea.scrollTop
    mirror.innerHTML = buildHighlightHtml(content, matches, activeIndex)
    // Restore scroll after innerHTML update (setting innerHTML resets scrollTop)
    mirror.scrollTop = prevScrollTop
  }, [content, matches, activeIndex, textareaRef])

  // ── Compute matches (debounced) ────────────────────────────────────────────
  const scrollToMatch = (match: Match, text: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const linesBefore = (text.slice(0, match.from).match(/\n/g) ?? []).length
    const cs = window.getComputedStyle(textarea)
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.625
    const paddingTop = parseFloat(cs.paddingTop) || 0
    const targetScrollTop = paddingTop + linesBefore * lineHeight - textarea.clientHeight / 2 + lineHeight
    textarea.scrollTop = Math.max(0, targetScrollTop)
    // Store the selection so it becomes visible when the textarea is later focused
    textarea.setSelectionRange(match.from, match.to)
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const newMatches = findAllMatches(content, query, caseSensitive)
      setMatches(newMatches)
      setActiveIndex(0)
      if (newMatches.length > 0) scrollToMatch(newMatches[0], content)
    }, 80)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, caseSensitive, content]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (index: number) => {
    if (matches.length === 0) return
    setActiveIndex(index)
    scrollToMatch(matches[index], content)
  }

  const next = () => navigate((activeIndex + 1) % matches.length)
  const prev = () => navigate((activeIndex - 1 + matches.length) % matches.length)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prev() : next(); return }
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
