import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getTagColor } from '../../lib/tagColors'
import type { TagColorMap } from '../../lib/tagColors'
import type { NoteSection } from '../../types'

// ── Types ────────────────────────────────────────────────────────────────────

interface SectionTabsRowProps {
  sections: NoteSection[]
  searchQuery: string
  sectionTagColors: TagColorMap
  onSectionClick: (sectionId: string, e: React.MouseEvent) => void
  onSectionContextMenu: (e: React.MouseEvent, sectionId: string) => void
  renderHighlightedText: (text: string, query: string) => React.ReactNode
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SectionTabsRow({
  sections,
  searchQuery,
  sectionTagColors,
  onSectionClick,
  onSectionContextMenu,
  renderHighlightedText,
}: SectionTabsRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

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
  }, [sections, updateScrollState])

  const scrollLeft = (e: React.MouseEvent) => {
    e.stopPropagation()
    scrollRef.current?.scrollBy({ left: -100, behavior: 'smooth' })
  }

  const scrollRight = (e: React.MouseEvent) => {
    e.stopPropagation()
    scrollRef.current?.scrollBy({ left: 100, behavior: 'smooth' })
  }

  return (
    <div className="relative mt-0.5">
      {/* Left scroll arrow */}
      {canScrollLeft && (
        <div
          role="button"
          onClick={scrollLeft}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); scrollLeft(e as unknown as React.MouseEvent) } }}
          className="absolute left-0 inset-y-0 z-10 flex items-center justify-center w-5
                     bg-gradient-to-r from-surface-1 to-transparent
                     text-text-muted/50 hover:text-text-muted transition-colors cursor-pointer
                     animate-in fade-in duration-150"
          tabIndex={-1}
          aria-label="Scroll sections left"
        >
          <ChevronLeft size={9} strokeWidth={2.5} />
        </div>
      )}

      {/* Scrollable sections row (native scrollbar hidden via CSS) */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto section-tabs-scroll"
        style={{
          paddingLeft: canScrollLeft ? 16 : 0,
          paddingRight: canScrollRight ? 16 : 0,
          transition: 'padding 120ms ease',
        }}
      >
        {sections.map((section) => (
          <span
            key={section.id}
            role="button"
            tabIndex={0}
            onClick={(e) => onSectionClick(section.id, e)}
            onContextMenu={(e) => onSectionContextMenu(e, section.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click()
            }}
            className="text-[10px] font-mono px-1 rounded flex-shrink-0 leading-[1.6]
                       hover:opacity-70 transition-opacity cursor-pointer"
            style={getTagColor(section.name, sectionTagColors)}
          >
            {renderHighlightedText(section.name, searchQuery)}
          </span>
        ))}
      </div>

      {/* Right scroll arrow */}
      {canScrollRight && (
        <div
          role="button"
          onClick={scrollRight}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); scrollRight(e as unknown as React.MouseEvent) } }}
          className="absolute right-0 inset-y-0 z-10 flex items-center justify-center w-5
                     bg-gradient-to-l from-surface-1 to-transparent
                     text-text-muted/50 hover:text-text-muted transition-colors cursor-pointer
                     animate-in fade-in duration-150"
          tabIndex={-1}
          aria-label="Scroll sections right"
        >
          <ChevronRight size={9} strokeWidth={2.5} />
        </div>
      )}
    </div>
  )
}
