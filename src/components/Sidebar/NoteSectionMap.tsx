import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp } from 'lucide-react'
import { colorChannels, resolveGroupColor } from '../../lib/tagColors'
import { parseSearchQuery, sectionSearchMatch } from '../../lib/searchUtils'
import { sectionLineWeights } from '../../lib/sectionLine'
import { planSectionMap, visibleSectionIndices, type SectionMapPlan } from '../../lib/sectionMap'
import { cancelFlip, captureFlip, playFlip, prefersReducedMotion, type FlipSnapshot } from '../../lib/flip'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { GROUP_PEEK_PORTAL_ATTR, SIDEBAR_PORTAL_ATTR } from './sidebarAnchor'
import { SectionCell } from './SectionCell'
import { FlipScope, captureRowTops, playRowShift, type RowTops } from './NoteSectionFlip'
import { useSectionInk } from './useSectionInk'
import type { TagColorMap } from '../../lib/tagColors'
import type { Note } from '../../types'

// The pointer must rest this long on the folded line for the peek to unfold (sweeping
// the list with the mouse crosses the line faster and never opens it).
const PEEK_DELAY = 140
// The peek's padding: its cells line up with the line's ends.
const PEEK_PAD = 4
// Keep the peek this far from the viewport's bottom edge (it flips above if it can't).
const VIEWPORT_MARGIN = 8
const ORIGIN = new DOMRect(0, 0, 0, 0)
// Rows of the open map before the rest fold into "+N" (the editor's map caps at 3).
const OPEN_MAP_MAX_ROWS = 2
// Joint between cells (`.nsm-map` gap in index.css).
const MAP_GAP = 3
// "+N" / fold back: the cells that stay glide to their new place.
const TOGGLE_DURATION = 300

/** The row callbacks this map uses (the sidebar's stable RowHandlers). */
export interface NoteSectionHandlers {
  sectionClick: (e: MouseEvent, note: Note, sectionId: string) => void
  sectionContextMenu: (e: MouseEvent, note: Note, sectionId: string) => void
}

interface NoteSectionMapProps {
  note: Note
  /** The note shown as open (editor or note overview): its map is unfolded. */
  isActive: boolean
  /** Section open on the active note (lib/sectionLine.ts → resolveOpenSectionId). */
  openSectionId: string | null
  searchQuery: string
  sectionTagColors: TagColorMap
  handlers: NoteSectionHandlers
  /**
   * A row of the collapsed-group peek (GroupPeek.tsx): compact cells and line
   * (`.nsm-compact`), and the floating map stacks over that peek and is marked as its
   * own (GROUP_PEEK_PORTAL_ATTR), so pressing on it doesn't close the peek.
   */
  inGroupPeek?: boolean
}

/**
 * Sections of a sidebar note row ("folded map"; also the collapsed-group peek's rows). Closed note: a 3px line with one
 * segment per section, as wide as the section is long. Resting the pointer on it floats
 * the same map with names over the list (the peek). Open note: the line unfolds into a
 * block of cells like the editor's section map, the open section solid, capped at two
 * rows with a "+N" cell (OpenSectionMap). A search shows
 * the matching notes' map inline. See "Sidebar: item de nota" in .agents/context/patterns.md.
 */
export function NoteSectionMap({
  note, isActive, openSectionId, searchQuery, sectionTagColors, handlers, inGroupPeek = false,
}: NoteSectionMapProps) {
  const t = useT()
  const sections = note.sections

  // ── Search ───────────────────────────────────────────────────────────────────
  const parsed = useMemo(() => parseSearchQuery(searchQuery), [searchQuery])
  // Cheap: reads the note's cached search index (searchUtils), rebuilt once per version.
  const match = useMemo(
    () => (sections.length > 0 ? sectionSearchMatch(note, parsed) : null),
    [note, sections.length, parsed],
  )
  const matched = useMemo(() => new Set(match?.matched ?? []), [match])
  const highlight = parsed.sectionFilter ?? parsed.textQuery

  type Mode = 'none' | 'line' | 'open' | 'search'
  const mode: Mode = sections.length === 0 ? 'none' : isActive ? 'open' : match ? 'search' : 'line'

  // ── Colours / sizes ──────────────────────────────────────────────────────────
  const colors = useMemo(
    () => sections.map((s) => resolveGroupColor(s.name, sectionTagColors)),
    [sections, sectionTagColors],
  )
  const weights = useMemo(() => sectionLineWeights(sections.map((s) => s.content.length)), [sections])
  const openIndex = isActive && openSectionId ? sections.findIndex((s) => s.id === openSectionId) : -1
  const ink = useSectionInk(openIndex === -1 ? null : colors[openIndex], !!sections[openIndex]?.aiHidden)

  // ── Peek (hover the line) ────────────────────────────────────────────────────
  // Local state of this row only: hovering never re-renders the list.
  const rootRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const closingRef = useRef<Animation | null>(null)
  const [peekOpen, setPeekOpen] = useState(false)
  // The peek only exists over the line: if the note opens (or a search unfolds it) the
  // peek is dropped in that same render, so the FLIP still measures its cells.
  const [prevMode, setPrevMode] = useState(mode)
  if (prevMode !== mode) {
    setPrevMode(mode)
    if (peekOpen) setPeekOpen(false)
  }
  const peekVisible = peekOpen && mode === 'line'

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // While the peek is up: the line hides (.is-peeking) and the row keeps its hover
  // background ([data-peeking]) — the pointer is on the portaled peek, outside the row's
  // DOM, so :hover alone would drop it. Set on the DOM (no re-render of the list); both go
  // as soon as the peek starts closing and come back if it reopens.
  const markPeeking = useCallback((on: boolean) => {
    lineRef.current?.classList.toggle('is-peeking', on)
    rootRef.current?.closest<HTMLElement>('[data-note-row]')?.toggleAttribute('data-peeking', on)
  }, [])

  const closePeek = useCallback((immediate: boolean) => {
    clearTimer()
    markPeeking(false)
    const el = peekRef.current
    if (!el || immediate || prefersReducedMotion()) {
      closingRef.current?.cancel()
      closingRef.current = null
      setPeekOpen(false)
      return
    }
    if (closingRef.current) return
    el.classList.add('is-closing')
    const anim = el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-3px)' }],
      { duration: 130, easing: 'ease-in', fill: 'forwards' },
    )
    closingRef.current = anim
    anim.finished.then(() => {
      if (closingRef.current !== anim) return
      closingRef.current = null
      setPeekOpen(false)
    }, () => { /* cancelled: re-opened or closed at once */ })
  }, [clearTimer, markPeeking])

  const openPeek = useCallback(() => {
    const closing = closingRef.current
    if (closing) {
      // Back on the line while it was fading out: keep the same peek.
      closingRef.current = null
      closing.cancel()
      peekRef.current?.classList.remove('is-closing')
      markPeeking(true)
      return
    }
    setPeekOpen(true)
  }, [markPeeking])

  const handleLineEnter = (e: ReactPointerEvent) => {
    if (e.buttons !== 0 || e.pointerType === 'touch') return
    if (peekOpen && !closingRef.current) return
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      openPeek()
    }, PEEK_DELAY)
  }
  // Leaving the line before the delay cancels it; once open, the peek closes when the
  // pointer leaves the row and the peek (listeners below).
  const handleLineLeave = () => clearTimer()

  useEffect(() => clearTimer, [clearTimer])

  // Place the peek over the line (fixed, portaled: group/folder bodies clip overflow and
  // the floating panel may be transformed) and unfold its cells out of the segments.
  useLayoutEffect(() => {
    if (!peekVisible) return
    const peek = peekRef.current
    const line = lineRef.current
    if (!peek || !line) return
    const row = rootRef.current?.closest<HTMLElement>('[data-note-row]') ?? null
    line.classList.add('is-peeking')
    row?.setAttribute('data-peeking', '')
    const unmark = () => {
      line.classList.remove('is-peeking')
      row?.removeAttribute('data-peeking')
    }
    const z = line.getBoundingClientRect()
    peek.style.left = `${z.left - PEEK_PAD}px`
    peek.style.width = `${z.width + PEEK_PAD * 2}px`
    let top = z.top - PEEK_PAD - 2
    const h = peek.offsetHeight
    if (top + h > window.innerHeight - VIEWPORT_MARGIN) top = Math.max(VIEWPORT_MARGIN, z.bottom + PEEK_PAD + 2 - h)
    peek.style.top = `${top}px`
    if (!prefersReducedMotion()) {
      peek.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })
      playFlip(peek, captureFlip(line, ORIGIN), ORIGIN, 380)
    }
    return unmark
  }, [peekVisible])

  useEffect(() => {
    if (!peekVisible) return
    const row = rootRef.current?.closest<HTMLElement>('[data-note-row]')
    const peek = peekRef.current
    if (!row || !peek) return
    const inside = (n: EventTarget | null) => n instanceof Node && (row.contains(n) || peek.contains(n))
    const onLeave = (e: PointerEvent) => { if (!inside(e.relatedTarget)) closePeek(false) }
    const onScroll = () => closePeek(true)
    const onDismiss = () => closePeek(true)
    // Typing (editor, search box…) means the user isn't browsing the list. Modifiers
    // alone don't count: Ctrl/Cmd+click on a cell opens that section alongside.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift' || e.key === 'Alt') return
      closePeek(false)
    }
    row.addEventListener('pointerleave', onLeave)
    peek.addEventListener('pointerleave', onLeave)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onDismiss)
    window.addEventListener('resize', onDismiss)
    window.addEventListener('dragstart', onDismiss, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      row.removeEventListener('pointerleave', onLeave)
      peek.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onDismiss)
      window.removeEventListener('resize', onDismiss)
      window.removeEventListener('dragstart', onDismiss, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [peekVisible, closePeek])

  if (mode === 'none') return null

  // ── Rendering ────────────────────────────────────────────────────────────────
  const onCellClick = (e: MouseEvent, sectionId: string) => handlers.sectionClick(e, note, sectionId)
  const onCellContextMenu = (e: MouseEvent, sectionId: string) => handlers.sectionContextMenu(e, note, sectionId)
  // A peek cell opens the note on that section; the peek goes away in the same commit as
  // the note's map appears, which unfolds from these very cells (FlipScope).
  const onPeekCellClick = (e: MouseEvent, sectionId: string) => {
    clearTimer()
    closingRef.current = null
    setPeekOpen(false)
    handlers.sectionClick(e, note, sectionId)
  }

  // 'measure': inert copy for the open map's row cap (OpenSectionMap's hidden layer).
  const renderCell = (i: number, where: 'row' | 'peek' | 'measure') => (
    <SectionCell
      key={sections[i].id}
      noteId={note.id}
      section={sections[i]}
      color={colors[i]}
      active={i === openIndex}
      ink={ink}
      match={match && where === 'row' ? (matched.has(i) ? 'match' : 'dim') : null}
      highlight={where === 'row' ? highlight : ''}
      focusable={where === 'row'}
      onClick={where === 'peek' ? onPeekCellClick : onCellClick}
      onContextMenu={onCellContextMenu}
      measure={where === 'measure'}
    />
  )
  const mapClass = (where: 'row' | 'peek') => `nsm-map${match && where === 'row' ? ' is-search' : ''}`
  const renderMap = (indices: number[], where: 'row' | 'peek') => (
    <div className={mapClass(where)}>{indices.map((i) => renderCell(i, where))}</div>
  )

  const all = sections.map((_, i) => i)
  const body = mode === 'line' ? (
    <div
      ref={lineRef}
      className="nsm-line"
      role="img"
      aria-label={tf(t.sidebar.sectionsSummary, { names: sections.map((s) => s.name).join(', ') })}
      onPointerEnter={handleLineEnter}
      onPointerLeave={handleLineLeave}
    >
      <div className="nsm-spine" style={{ '--nsm-n': sections.length } as CSSProperties}>
        {sections.map((s, i) => (
          <span
            key={s.id}
            data-flip={s.id}
            className={`nsm-seg${s.aiHidden ? ' is-ai-hidden' : ''}`}
            style={{ '--w': weights[i], '--c': colorChannels(colors[i]) } as CSSProperties}
          />
        ))}
      </div>
    </div>
  ) : mode === 'open' && !match ? (
    // Row cap only without a search: a matching section must never hide behind "+N"
    // (with one, the active note shows all its cells, as in 'search' mode).
    <OpenSectionMap
      sections={sections}
      openIndex={openIndex}
      className={mapClass('row')}
      renderCell={(i) => renderCell(i, 'row')}
      renderMeasureCell={(i) => renderCell(i, 'measure')}
    />
  ) : renderMap(mode === 'search' && match ? match.shown : all, 'row')

  return (
    <>
      <FlipScope flipKey={mode} rootRef={rootRef} peekRef={peekRef}>
        <div ref={rootRef} className={`nsm font-mono${inGroupPeek ? ' nsm-compact' : ''}`}>{body}</div>
      </FlipScope>
      {peekVisible && createPortal(
        <div
          ref={peekRef}
          className={`nsm-peek font-mono${inGroupPeek ? ' nsm-compact is-over-group-peek' : ''}`}
          {...{ [SIDEBAR_PORTAL_ATTR]: '', ...(inGroupPeek ? { [GROUP_PEEK_PORTAL_ATTR]: '' } : {}) }}
        >
          {renderMap(all, 'peek')}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Nearest scrolling ancestor: the list (sidebar or group peek) whose rows a map moves. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

interface OpenSectionMapProps {
  sections: Note['sections']
  /** The open section (-1: none): always visible, never folded away. */
  openIndex: number
  className: string
  renderCell: (index: number) => ReactNode
  /** Same cell, inert, at its natural width (SectionCell `measure`). */
  renderMeasureCell: (index: number) => ReactNode
}

/**
 * The open note's map, capped at two rows like the editor's map (three there): what
 * doesn't fit folds into a "+N" cell that unfolds the rest, and a fold-back cell appears
 * once unfolded. Same plan as the editor (lib/sectionMap.ts), from a hidden layer with
 * every cell at its natural width; there is no "+" (add) tab here. Mounted only in the
 * active row and only without a search, so closed rows never measure, and `expanded`
 * resets when the note stops being the open one (or a search starts). Its first plan lands in a second, synchronous commit; FlipScope
 * plays after it (NoteSectionFlip.tsx), so the folded sections just aren't animated.
 */
function OpenSectionMap({ sections, openIndex, className, renderCell, renderMeasureCell }: OpenSectionMapProps) {
  const t = useT()
  const mapRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [plan, setPlan] = useState<SectionMapPlan | null>(null)
  const total = sections.length

  // The measure layer never depends on the plan and the map's width comes from the row,
  // so measuring can't loop.
  const measure = useCallback(() => {
    const map = mapRef.current
    const row = measureRef.current
    if (!map || !row) return
    const widths = Array.from(row.children, (el) => el.getBoundingClientRect().width)
    const count = widths.length - 1
    if (count < 0) return
    const next = planSectionMap({
      tabWidths: widths.slice(0, count),
      pinned: [openIndex],
      moreWidth: widths[count],
      containerWidth: map.getBoundingClientRect().width,
      gap: MAP_GAP,
      maxRows: OPEN_MAP_MAX_ROWS,
    })
    setPlan((prev) =>
      prev && prev.visibleCount === next.visibleCount && prev.overflowing === next.overflowing ? prev : next)
  }, [openIndex])

  const measureRefFn = useRef(measure)
  useLayoutEffect(() => { measureRefFn.current = measure })

  // Re-measure when a cell's width can change (typing in a section leaves this alone).
  const layoutKey = sections.map((s) => `${s.id}\u0000${s.name}\u0000${s.aiHidden ? 1 : 0}`).join('\u0001')
  const moreLabel = tf(t.sidebar.moreSections, { count: total })
  useLayoutEffect(() => { measure() }, [measure, layoutKey, moreLabel])

  // Width of the sidebar, and late font loads (they resize the measure layer).
  useEffect(() => {
    const map = mapRef.current
    const row = measureRef.current
    if (!map || !row) return
    const ro = new ResizeObserver(() => measureRefFn.current())
    ro.observe(map)
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  // "+N" / fold back: the cells that stay glide (FLIP), the ones that appear fade in, and
  // the rows below slide (as RowShiftFlip does when the open note changes). From the
  // keyboard, focus goes to the pill that replaces the pressed one.
  const toggleFlipRef = useRef<{ cells: FlipSnapshot; rows: RowTops | null } | null>(null)
  const focusPillRef = useRef(false)
  const toggle = (next: boolean, fromKeyboard: boolean) => {
    const map = mapRef.current
    if (map && !prefersReducedMotion()) {
      const list = scrollParent(map)
      toggleFlipRef.current = {
        cells: captureFlip(map, map.getBoundingClientRect()),
        rows: list ? captureRowTops(list) : null,
      }
    } else {
      toggleFlipRef.current = null
    }
    focusPillRef.current = fromKeyboard
    setExpanded(next)
  }
  useLayoutEffect(() => {
    const snap = toggleFlipRef.current
    const map = mapRef.current
    toggleFlipRef.current = null
    if (focusPillRef.current) {
      focusPillRef.current = false
      map?.querySelector<HTMLElement>('.nsm-pill')?.focus()
    }
    if (!snap || !map) return
    cancelFlip(map)
    playFlip(map, snap.cells, map.getBoundingClientRect(), TOGGLE_DURATION)
    map.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      if (!snap.cells.has(el.dataset.flip ?? '')) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
    })
    if (snap.rows) playRowShift(snap.rows, TOGGLE_DURATION)
  }, [expanded])

  // They live inside the row's <button>: their click and keys must not reach it (that
  // would open the note).
  const pillProps = (next: boolean, label: string) => ({
    role: 'button',
    tabIndex: 0,
    title: label,
    'aria-label': label,
    onClick: (e: MouseEvent) => {
      e.stopPropagation()
      toggle(next, false)
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      e.stopPropagation()
      toggle(next, true)
    },
  })

  const overflowing = plan?.overflowing ?? false
  const folded = overflowing && !expanded
  const shown = folded
    ? visibleSectionIndices(total, [openIndex], plan?.visibleCount ?? total)
    : sections.map((_, i) => i)
  const hiddenCount = total - shown.length

  return (
    <>
      <div ref={mapRef} className={className}>
        {shown.map(renderCell)}
        {folded && hiddenCount > 0 && (
          <span className="nsm-cell nsm-pill" {...pillProps(true, plural(t.sidebar.showAllSections, hiddenCount))}>
            {tf(t.sidebar.moreSections, { count: hiddenCount })}
          </span>
        )}
        {overflowing && expanded && (
          <span className="nsm-cell nsm-pill" {...pillProps(false, t.sidebar.showLessSections)}>
            <ChevronUp size={11} aria-hidden />
          </span>
        )}
      </div>
      <div className="nsm-measure" aria-hidden>
        <div ref={measureRef}>
          {sections.map((_, i) => renderMeasureCell(i))}
          <span className="nsm-cell nsm-pill">{moreLabel}</span>
        </div>
      </div>
    </>
  )
}
