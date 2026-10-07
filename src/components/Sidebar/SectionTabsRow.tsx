import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, EyeOff } from 'lucide-react'
import { getTagColor } from '../../lib/tagColors'
import { normalize } from '../../lib/searchUtils'
import { useSectionHoverPreview } from '../SectionPreview/hoverPreviewContext'
import { useT } from '../../i18n/useT'
import type { TagColorMap } from '../../lib/tagColors'
import type { NoteSection } from '../../types'

// Fade the scrollable row's edges so overflowing tags taper off instead of being clipped hard.
const EDGE_MASK =
  'linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 14px), transparent 100%)'

// ── Types ────────────────────────────────────────────────────────────────────

interface SectionTabsRowProps {
  noteId: string
  sections: NoteSection[]
  searchQuery: string
  sectionFilter?: string | null
  sectionTagColors: TagColorMap
  onSectionClick: (sectionId: string, e: React.MouseEvent) => void
  onSectionContextMenu: (e: React.MouseEvent, sectionId: string) => void
  renderHighlightedText: (text: string, query: string) => React.ReactNode
  /** Fade each tag (no background) until that tag itself is hovered. Sidebar only. */
  dimmed?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SectionTabsRow({
  noteId,
  sections,
  searchQuery,
  sectionFilter,
  sectionTagColors,
  onSectionClick,
  onSectionContextMenu,
  renderHighlightedText,
  dimmed = false,
}: SectionTabsRowProps) {
  const t = useT()
  const { previewProps } = useSectionHoverPreview()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const visibleSections = sectionFilter
    ? sections.filter(s => normalize(s.name).includes(normalize(sectionFilter)))
    : sections

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

  // Bleed out of the note's lateral padding (-mx-2.5 → re-add px-2.5) so the row spans
  // edge to edge; a single non-wrapping scrollable line fits more tags, edges faded by
  // the mask. Arrows appear on overflow to reach tags hidden past the edges.
  return (
    <div className="relative mt-1 -mx-2.5">
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

      {/* Scrollable sections row (native scrollbar hidden via CSS, edges faded via mask) */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-2.5 overflow-x-auto section-tabs-scroll"
        style={{ WebkitMaskImage: EDGE_MASK, maskImage: EDGE_MASK }}
      >
        {visibleSections.map((section) => {
          const { background, ...tagColor } = getTagColor(section.name, sectionTagColors)
          return (
            <span
              key={section.id}
              role="button"
              tabIndex={0}
              {...previewProps(noteId, section.id, { placement: 'cursor-below' })}
              onClick={(e) => onSectionClick(section.id, e)}
              onContextMenu={(e) => onSectionContextMenu(e, section.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click()
              }}
              className={`text-[11px] font-mono px-1 rounded flex-shrink-0 leading-[1.55]
                         transition-[opacity,background-color] duration-150 cursor-pointer inline-flex items-center gap-0.5
                         ${dimmed
                           ? 'opacity-80 hover:opacity-100 hover:[background-color:var(--chip-bg)]'
                           : 'hover:opacity-70 [background-color:var(--chip-bg)]'}`}
              // Background goes through a CSS var so a dimmed tag can drop it until it's hovered.
              style={{ ...tagColor, '--chip-bg': background } as React.CSSProperties}
            >
              {section.aiHidden && (
                <EyeOff size={9} className="opacity-70 flex-shrink-0" aria-label={t.common.hiddenFromAI} />
              )}
              {renderHighlightedText(section.name, searchQuery)}
            </span>
          )
        })}
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
