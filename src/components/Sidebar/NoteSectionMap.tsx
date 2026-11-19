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
import { SECTION_PEEK_MARGIN, sectionPeekSideSpan, sectionPeekSideTop } from '../../lib/sectionPeek'
import { cancelFlip, captureFlip, playFlip, prefersReducedMotion, type FlipSnapshot } from '../../lib/flip'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { PREVIEW_PANEL_ATTR, useSectionHoverPreview } from '../SectionPreview/hoverPreviewContext'
import { GROUP_PEEK_PORTAL_ATTR, SIDEBAR_PORTAL_ATTR, SIDEBAR_SURFACE_ATTR } from './sidebarAnchor'
import { SectionCell } from './SectionCell'
import { FlipScope, captureRowTops, playRowShift, type RowTops } from './NoteSectionFlip'
import { registerSectionPeek, sectionPeekClosed, type SectionPeekTarget } from './sectionPeekEngine'
import { useSectionInk } from './useSectionInk'
import type { TagColorMap } from '../../lib/tagColors'
import type { Note } from '../../types'

// Over-the-line fallback (no room beside the list): the peek's padding lines its cells
// up with the line's ends.
const PEEK_PAD = 4
// Beside the list the cells glide out of the segments a bit slower (a longer way).
const PEEK_FLIP_SIDE = 420
const PEEK_FLIP_OVER = 380
const ORIGIN = new DOMRect(0, 0, 0, 0)
const ROW_SELECTOR = '[data-note-row]'
/** Where the peek sits: beside the list (the usual), or over the line (no room right of it). */
type PeekPlacement = 'side' | 'over'

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
   * (`.nsm-compact`), and the floating map opens right of that peek, stacks over it and
   * is marked as its own (GROUP_PEEK_PORTAL_ATTR), so pressing on it doesn't close it.
   */
  inGroupPeek?: boolean
}

/**
 * Sections of a sidebar note row ("folded map"; also the collapsed-group peek's rows).
 * Closed note: a 3px line with one segment per section, as wide as the section is long.
 * Resting the pointer anywhere on the row (2+ sections) floats the same map with names
 * right of the list (the peek; timing in sectionPeekEngine.ts). Open note: the line
 * unfolds into a block of cells like the editor's section map, the open section solid,
 * capped at two rows with a "+N" cell (OpenSectionMap). A search shows the matching
 * notes' map inline. See "Sidebar: item de nota" in .agents/context/patterns.md.
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

  // ── Peek (rest on the row) ───────────────────────────────────────────────────
  // Local state of this row only: hovering never re-renders the list. When (and which
  // row) opens is sectionPeekEngine.ts's call; this row only shows or hides its peek.
  const rootRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const spineRef = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef<Animation | null>(null)
  const targetRef = useRef<SectionPeekTarget | null>(null)
  // Decided once, on open (openPeek): the placement, mirrored in a ref for the engine (aim
  // triangle) and the DOM marks, and, beside the list, its horizontal span.
  const [peek, setPeek] = useState<PeekPlacement | null>(null)
  const placementRef = useRef<PeekPlacement>('side')
  const sideSpanRef = useRef<{ left: number; width: number } | null>(null)
  // Only a closed note with 2+ sections peeks (with one, the line says it all).
  const eligible = mode === 'line' && sections.length > 1
  // If the note opens (or a search unfolds it) the peek is dropped in that same render,
  // so the FLIP still measures its cells.
  const [prevEligible, setPrevEligible] = useState(eligible)
  if (prevEligible !== eligible) {
    setPrevEligible(eligible)
    if (peek) setPeek(null)
  }
  const peekVisible = peek !== null && eligible
  const { dismissNote } = useSectionHoverPreview()
  const noteId = note.id

  // While the peek is up the row keeps its hover look ([data-peeking]: background, thick
  // line) — the pointer is on the portaled peek, outside the row's DOM, so :hover alone
  // would drop it. Over the line (fallback) the line also hides (.is-covered). Set on the
  // DOM (no re-render of the list); both go as soon as the peek starts closing.
  const markPeeking = useCallback((on: boolean) => {
    rootRef.current?.closest<HTMLElement>(ROW_SELECTOR)?.toggleAttribute('data-peeking', on)
    lineRef.current?.classList.toggle('is-covered', on && placementRef.current === 'over')
  }, [])

  // A peek cell under the pointer lights its segment on the row's line; the rest dim.
  const lightSection = useCallback((sectionId: string | null) => {
    const spine = spineRef.current
    if (!spine) return
    spine.classList.toggle('has-lit', sectionId !== null)
    spine.querySelectorAll<HTMLElement>('.nsm-seg').forEach((seg) => {
      seg.classList.toggle('is-lit', seg.dataset.flip === sectionId)
    })
  }, [])

  const closePeek = useCallback((immediate: boolean) => {
    markPeeking(false)
    lightSection(null)
    const el = peekRef.current
    // Closed under a resting pointer (a key, a scroll…): the hovered cell gets no
    // mouseleave, so its pending or open preview would stay behind.
    if (el?.matches(':hover')) dismissNote(noteId)
    if (!el || immediate || prefersReducedMotion()) {
      closingRef.current?.cancel()
      closingRef.current = null
      setPeek(null)
      return
    }
    if (closingRef.current) return
    el.classList.add('is-closing')
    const shift = placementRef.current === 'side' ? 'translateX(-3px)' : 'translateY(-3px)'
    const anim = el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: shift }],
      { duration: 130, easing: 'ease-in', fill: 'forwards' },
    )
    closingRef.current = anim
    anim.finished.then(() => {
      if (closingRef.current !== anim) return
      closingRef.current = null
      setPeek(null)
    }, () => { /* cancelled: re-opened or closed at once */ })
  }, [markPeeking, lightSection, dismissNote, noteId])

  const openPeek = useCallback(() => {
    const closing = closingRef.current
    if (closing) {
      // Back on the row while it was fading out: keep the same peek.
      closingRef.current = null
      closing.cancel()
      peekRef.current?.classList.remove('is-closing')
      markPeeking(true)
      return
    }
    const row = rootRef.current?.closest<HTMLElement>(ROW_SELECTOR)
    if (!row) return
    const span = sectionPeekSideSpan(surfaceRight(row), window.innerWidth)
    sideSpanRef.current = span
    placementRef.current = span ? 'side' : 'over'
    setPeek(placementRef.current)
  }, [markPeeking])

  // The engine holds one target per row for as long as the row can peek; it reaches the
  // latest open/close through this ref.
  const actionsRef = useRef({ open: openPeek, close: closePeek })
  useLayoutEffect(() => { actionsRef.current = { open: openPeek, close: closePeek } })
  useEffect(() => {
    if (!eligible) return
    const row = rootRef.current?.closest<HTMLElement>(ROW_SELECTOR)
    if (!row) return
    const target: SectionPeekTarget = {
      row,
      open: () => actionsRef.current.open(),
      close: (immediate) => actionsRef.current.close(immediate),
      panel: () => peekRef.current,
      beside: () => placementRef.current === 'side',
    }
    targetRef.current = target
    const unregister = registerSectionPeek(target)
    return () => {
      unregister()
      if (targetRef.current === target) targetRef.current = null
    }
  }, [eligible])

  // Place the peek (fixed, portaled: group/folder bodies clip overflow and the floating
  // panel may be transformed) and unfold its cells out of the line's segments. Beside the
  // list: right of its surface (the sidebar, or the collapsed-group peek; span decided on
  // open), level with the row, pushed up when it doesn't fit below. Fallback: over the
  // line, as a lid.
  useLayoutEffect(() => {
    if (!peekVisible) return
    const panel = peekRef.current
    const line = lineRef.current
    const row = rootRef.current?.closest<HTMLElement>(ROW_SELECTOR)
    if (!panel || !line || !row) return
    const vh = window.innerHeight
    const span = sideSpanRef.current
    const side = peek === 'side' && span !== null
    if (side) {
      panel.style.left = `${span.left}px`
      panel.style.width = `${span.width}px`
      panel.style.top = `${sectionPeekSideTop(row.getBoundingClientRect().top, panel.offsetHeight, vh)}px`
    } else {
      const z = line.getBoundingClientRect()
      panel.style.left = `${z.left - PEEK_PAD}px`
      panel.style.width = `${z.width + PEEK_PAD * 2}px`
      let top = z.top - PEEK_PAD - 2
      const h = panel.offsetHeight
      if (top + h > vh - SECTION_PEEK_MARGIN) top = Math.max(SECTION_PEEK_MARGIN, z.bottom + PEEK_PAD + 2 - h)
      panel.style.top = `${top}px`
    }
    markPeeking(true)
    if (!prefersReducedMotion()) {
      // Cells first (measured at rest), then the panel's own entrance on top.
      playFlip(panel, captureFlip(line, ORIGIN), ORIGIN, side ? PEEK_FLIP_SIDE : PEEK_FLIP_OVER)
      panel.animate(
        [{ opacity: 0, transform: side ? 'translateX(-4px)' : 'none' }, { opacity: 1, transform: 'none' }],
        { duration: side ? 150 : 160, easing: 'ease-out' },
      )
    }
    return () => {
      markPeeking(false)
      lightSection(null)
    }
  }, [peekVisible, peek, markPeeking, lightSection])

  const handlePeekPointerOver = (e: ReactPointerEvent) => {
    const cell = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-flip]') : null
    // Between cells (joints, padding) the last one stays lit: no flicker while sweeping.
    if (cell?.dataset.flip) lightSection(cell.dataset.flip)
  }

  if (mode === 'none') return null

  // ── Rendering ────────────────────────────────────────────────────────────────
  const onCellClick = (e: MouseEvent, sectionId: string) => handlers.sectionClick(e, note, sectionId)
  const onCellContextMenu = (e: MouseEvent, sectionId: string) => handlers.sectionContextMenu(e, note, sectionId)
  // A peek cell opens the note on that section; the peek goes away in the same commit as
  // the note's map appears. Over the line, the map unfolds from these very cells; beside
  // the list, from the line, as a plain open (FlipScope).
  const onPeekCellClick = (e: MouseEvent, sectionId: string) => {
    closingRef.current = null
    setPeek(null)
    if (targetRef.current) sectionPeekClosed(targetRef.current)
    handlers.sectionClick(e, note, sectionId)
  }
  // Beside the list, a peek cell previews its section right of the peek (under the
  // cursor it would cover the peek itself).
  const peekPreview = peek === 'side' ? 'panel-right' : 'cursor-below'

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
      previewPlacement={where === 'peek' ? peekPreview : 'cursor-below'}
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
    >
      <div ref={spineRef} className="nsm-spine" style={{ '--nsm-n': sections.length } as CSSProperties}>
        {/* A segment opens its section, like a peek cell (it also drops a peek that is up). */}
        {sections.map((s, i) => (
          <span
            key={s.id}
            data-flip={s.id}
            className={`nsm-seg${s.aiHidden ? ' is-ai-hidden' : ''}`}
            style={{ '--w': weights[i], '--c': colorChannels(colors[i]) } as CSSProperties}
            onClick={(e) => onPeekCellClick(e, s.id)}
            onContextMenu={(e) => onCellContextMenu(e, s.id)}
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
          className={`nsm-peek font-mono${peek === 'side' ? ' is-side' : ''}${inGroupPeek ? ' nsm-compact is-over-group-peek' : ''}`}
          {...{
            [SIDEBAR_PORTAL_ATTR]: '',
            ...(inGroupPeek ? { [GROUP_PEEK_PORTAL_ATTR]: '' } : {}),
            ...(peek === 'side' ? { [PREVIEW_PANEL_ATTR]: '' } : {}),
          }}
          onPointerOver={handlePeekPointerOver}
          onPointerLeave={() => lightSection(null)}
        >
          {renderMap(all, 'peek')}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Right edge of the surface a row's list lives in (the sidebar, the collapsed-group peek). */
function surfaceRight(row: HTMLElement): number {
  return (row.closest(`[${SIDEBAR_SURFACE_ATTR}]`) ?? row).getBoundingClientRect().right
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
