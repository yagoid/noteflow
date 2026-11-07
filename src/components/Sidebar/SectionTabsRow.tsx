import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { resolveGroupColor } from '../../lib/tagColors'
import { normalize, parseSearchQuery } from '../../lib/searchUtils'
import { useT } from '../../i18n/useT'
import { SectionCell } from './SectionCell'
import { useSectionInk } from './useSectionInk'
import { prefersReducedMotion } from '../../lib/flip'
import type { TagColorMap } from '../../lib/tagColors'
import type { NoteSection } from '../../types'

// Fade the scrollable row's edges so overflowing cells taper off instead of being clipped hard.
const EDGE_MASK =
  'linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 14px), transparent 100%)'
// Room kept between the open cell and the row's edges when scrolling it into view
// (clears the faded edges and the scroll arrows).
const ACTIVE_CELL_MARGIN = 22

/**
 * Where the row sits. It bleeds out of its parent's lateral padding and re-adds it inside,
 * so it spans edge to edge: the sidebar note row is `px-2.5`, the collapsed-group peek's
 * row `px-2` and the overview note card `p-3 pl-4` (its flex `gap-2` spaces it from the
 * title). On the card it stops 3px short of the left edge, after the group-colour accent
 * line, so neither the cells scrolling past nor the left arrow cover it. 'peek' also draws
 * the smaller cells of that denser list (`.nsm-compact`).
 */
export type SectionTabsRowPlacement = 'sidebar' | 'peek' | 'card'

const PLACEMENT_CLASSES: Record<SectionTabsRowPlacement, { outer: string; inner: string }> = {
  sidebar: { outer: 'mt-[7px] -mx-2.5', inner: 'px-2.5' },
  peek: { outer: 'mt-1 -mx-2', inner: 'px-2 nsm-compact' },
  card: { outer: '-ml-[13px] -mr-3', inner: 'pl-[13px] pr-3' },
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SectionTabsRowProps {
  noteId: string
  sections: NoteSection[]
  /** Search query; its term (the `#section` filter, else the text) is highlighted in the names. */
  searchQuery: string
  /** `#section` filter: only the sections whose name matches are shown. */
  sectionFilter?: string | null
  sectionTagColors: TagColorMap
  onSectionClick: (sectionId: string, e: React.MouseEvent) => void
  onSectionContextMenu: (e: React.MouseEvent, sectionId: string) => void
  /** The section open on the active note (solid cell, kept in view). */
  activeSectionId?: string | null
  placement?: SectionTabsRowPlacement
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * A note's sections as one non-wrapping, horizontally scrollable line of section-map cells
 * (SectionCell: neutral cell + folded corner in the section colour, the open one solid),
 * at their natural width (`.nsm-scroll`), edges faded by a mask and arrows on overflow.
 * Used by the sidebar note row ("Sections in the sidebar → Scroll row"), the collapsed-group
 * peek and the overview note cards (group / all-content views).
 */
export function SectionTabsRow({
  noteId,
  sections,
  searchQuery,
  sectionFilter,
  sectionTagColors,
  onSectionClick,
  onSectionContextMenu,
  activeSectionId = null,
  placement = 'sidebar',
}: SectionTabsRowProps) {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const visibleSections = sectionFilter
    ? sections.filter(s => normalize(s.name).includes(normalize(sectionFilter)))
    : sections

  const activeSection = activeSectionId ? sections.find((s) => s.id === activeSectionId) ?? null : null
  const activeInk = useSectionInk(
    activeSection ? resolveGroupColor(activeSection.name, sectionTagColors) : null,
    !!activeSection?.aiHidden,
  )
  // Highlight the searched term: the `#section` filter, else the text query.
  const parsedQuery = parseSearchQuery(searchQuery)
  const highlight = sectionFilter || parsedQuery.sectionFilter || parsedQuery.textQuery

  // Keep the open section's cell in view — on mount (instant) and whenever the open
  // section changes (smooth unless reduced motion). Only this row's scrollLeft moves
  // (scrollIntoView would also scroll the sidebar list vertically).
  const scrolledOnceRef = useRef(false)
  const activeCellId = activeSection?.id ?? null
  useLayoutEffect(() => {
    // The mount jumps straight there; later changes (note opened, section switched) glide.
    const first = !scrolledOnceRef.current
    scrolledOnceRef.current = true
    const el = scrollRef.current
    if (!el || !activeCellId) return
    const cell = el.querySelector<HTMLElement>(`[data-flip="${CSS.escape(activeCellId)}"]`)
    if (!cell) return
    const box = el.getBoundingClientRect()
    const r = cell.getBoundingClientRect()
    const left = r.left - box.left + el.scrollLeft
    const right = left + r.width
    let target = el.scrollLeft
    if (left - ACTIVE_CELL_MARGIN < el.scrollLeft) target = left - ACTIVE_CELL_MARGIN
    else if (right + ACTIVE_CELL_MARGIN > el.scrollLeft + el.clientWidth) target = right + ACTIVE_CELL_MARGIN - el.clientWidth
    target = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth))
    if (Math.abs(target - el.scrollLeft) < 1) return
    el.scrollTo({ left: target, behavior: first || prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [activeCellId])

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
    }
  }, [visibleSections, updateScrollState])

  const scrollByAmount = (e: React.MouseEvent, amount: number) => {
    e.stopPropagation()
    scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' })
  }

  if (visibleSections.length === 0) return null

  const placementClasses = PLACEMENT_CLASSES[placement]

  return (
    <div className={`relative ${placementClasses.outer}`}>
      {/* Left scroll arrow — only when there's content scrolled off to the left */}
      {canScrollLeft && (
        <div
          role="button"
          tabIndex={-1}
          aria-label={t.sidebar.scrollSectionsLeft}
          onClick={(e) => scrollByAmount(e, -100)}
          className="absolute left-0.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center
                     w-4 h-4 rounded bg-surface-3/95 text-text-muted hover:text-text shadow-sm
                     transition-colors cursor-pointer animate-in fade-in duration-150"
        >
          <ChevronLeft size={12} strokeWidth={2.5} />
        </div>
      )}

      {/* Scrollable cells row (native scrollbar hidden via CSS, edges faded via mask) */}
      <div
        ref={scrollRef}
        className={`flex items-center overflow-x-auto section-tabs-scroll nsm-scroll font-mono ${placementClasses.inner}`}
        style={{ WebkitMaskImage: EDGE_MASK, maskImage: EDGE_MASK }}
      >
        {visibleSections.map((section) => (
          <SectionCell
            key={section.id}
            noteId={noteId}
            section={section}
            color={resolveGroupColor(section.name, sectionTagColors)}
            active={section.id === activeSection?.id}
            ink={activeInk}
            highlight={highlight}
            focusable
            onClick={(e, sectionId) => onSectionClick(sectionId, e)}
            onContextMenu={(e, sectionId) => onSectionContextMenu(e, sectionId)}
          />
        ))}
      </div>

      {/* Right scroll arrow — only when there's content scrolled off to the right */}
      {canScrollRight && (
        <div
          role="button"
          tabIndex={-1}
          aria-label={t.sidebar.scrollSectionsRight}
          onClick={(e) => scrollByAmount(e, 100)}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center
                     w-4 h-4 rounded bg-surface-3/95 text-text-muted hover:text-text shadow-sm
                     transition-colors cursor-pointer animate-in fade-in duration-150"
        >
          <ChevronRight size={12} strokeWidth={2.5} />
        </div>
      )}
    </div>
  )
}
