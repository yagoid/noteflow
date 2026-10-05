import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import {
  activeDashIndex,
  pickActiveHeading,
  pickIndicatorDashes,
  tocDashGap,
  TOC_MAX_DASHES,
  TOC_PANEL_WIDTH,
  TOC_RIGHT_OFFSET,
  type TocItem,
} from '../../lib/tocUtils'
import { readTocItems } from './useEditorToc'
import { useT } from '../../i18n/useT'

/** Gap (px) left above a heading after jumping to it from the TOC. */
const JUMP_MARGIN = 16
/** A heading counts as "current" once its top is within this many px of the viewport top. */
const ACTIVE_THRESHOLD = JUMP_MARGIN + 48
/** Hover delays (ms): a short open delay so brushing past the edge (e.g. on the
 *  way to the scrollbar) doesn't pop the panel; a close delay so moving between
 *  the indicator and the panel doesn't flicker. */
const OPEN_DELAY = 90
const CLOSE_DELAY = 160

/** Dash length (px) per indent step in the collapsed indicator. */
const DASH_WIDTHS = [16, 11, 7] as const
/** Entry font size (px) per heading level in the expanded panel. */
const LEVEL_FONT_SIZE: Record<TocItem['level'], number> = { 1: 14, 2: 13, 3: 12 }

interface EditorTocProps {
  editor: TiptapEditor
  items: TocItem[]
  /** The editor's scroll container (the TOC floats over its right edge, outside the scroll). */
  scrollRef: RefObject<HTMLDivElement | null>
}

/**
 * Table of contents of the open section (H1–H3), Notion-style. At rest only a
 * column of short dashes shows at the right edge of the editor (one per
 * heading, length by level, the current one stronger); hovering or focusing it
 * expands a panel with the titles that OVERLAYS the text. Clicking an entry
 * smooth-scrolls the editor to that heading. The editor only reserves room for
 * the dashes (`.editor-has-toc` in index.css).
 */
export function EditorToc({ editor, items, scrollRef }: EditorTocProps) {
  const t = useT()
  const panelId = useId()
  const [active, setActive] = useState(-1)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const open = hovered || focusWithin
  const listRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True while a TOC-triggered smooth scroll is running: the highlight stays on
  // the clicked entry instead of flickering through every heading it passes.
  const jumpingRef = useRef(false)

  const dashes = useMemo(() => pickIndicatorDashes(items, TOC_MAX_DASHES), [items])
  const activeDash = activeDashIndex(dashes, active)

  const setHoverSoon = useCallback((next: boolean) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null
      setHovered(next)
    }, next ? OPEN_DELAY : CLOSE_DELAY)
  }, [])

  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
  }, [])

  // Track the heading the reader is in from the editor's scroll position.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    let frame = 0
    const measure = () => {
      frame = 0
      if (jumpingRef.current || editor.isDestroyed) return
      const viewportTop = scroller.getBoundingClientRect().top
      const tops = items.map(item => {
        const dom = editor.view.nodeDOM(item.pos)
        return dom instanceof HTMLElement
          ? dom.getBoundingClientRect().top - viewportTop
          : Number.POSITIVE_INFINITY
      })
      setActive(pickActiveHeading(tops, {
        threshold: ACTIVE_THRESHOLD,
        atBottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2,
        viewportHeight: scroller.clientHeight,
      }))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const onScrollEnd = () => {
      jumpingRef.current = false
      schedule()
    }
    schedule()
    scroller.addEventListener('scroll', schedule, { passive: true })
    scroller.addEventListener('scrollend', onScrollEnd)
    return () => {
      scroller.removeEventListener('scroll', schedule)
      scroller.removeEventListener('scrollend', onScrollEnd)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [editor, items, scrollRef])

  // Keep the active entry visible inside the panel's own scroll (it keeps its
  // layout while collapsed, so it is already in place when it opens). Done by
  // hand: scrollIntoView would also scroll the overflow-hidden editor ancestors.
  useEffect(() => {
    const list = listRef.current
    if (!list || active < 0) return
    const el = list.querySelector<HTMLElement>(`[data-toc-index="${active}"]`)
    if (!el) return
    if (el.offsetTop < list.scrollTop) {
      list.scrollTop = el.offsetTop - 4
    } else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4
    }
  }, [active])

  const jumpTo = useCallback((index: number) => {
    const scroller = scrollRef.current
    if (!scroller || editor.isDestroyed) return
    let item: TocItem | undefined = items[index]
    // Entries refresh on a debounce, so right after an edit a position can be
    // stale: re-read the headings when it no longer points at one.
    if (!item || editor.state.doc.nodeAt(item.pos)?.type.name !== 'heading') {
      item = readTocItems(editor.state.doc)[index]
    }
    if (!item) return
    const dom = editor.view.nodeDOM(item.pos)
    if (!(dom instanceof HTMLElement)) return
    const target = Math.max(
      0,
      Math.min(
        scroller.scrollHeight - scroller.clientHeight,
        dom.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - JUMP_MARGIN,
      ),
    )
    setActive(index)
    // No movement → no `scrollend` would ever clear the flag.
    if (Math.abs(target - scroller.scrollTop) < 1) return
    jumpingRef.current = true
    scroller.scrollTo({ top: target, behavior: 'smooth' })
  }, [editor, items, scrollRef])

  if (items.length === 0) return null

  return (
    <nav
      aria-label={t.editor.toc.label}
      className="absolute top-3 bottom-3 z-10 pointer-events-none"
      style={{ right: TOC_RIGHT_OFFSET }}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        // Hand focus back to the editor; the blur collapses the panel.
        editor.commands.focus()
      }}
    >
      {/* Collapsed indicator: one dash per heading, always visible. */}
      <button
        type="button"
        aria-label={t.editor.toc.label}
        aria-expanded={open}
        aria-controls={panelId}
        // Mouse users open it by hovering; don't let a click park focus here
        // (focus-within would keep the panel open after the mouse leaves).
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setHoverSoon(true)}
        onMouseLeave={() => setHoverSoon(false)}
        className="pointer-events-auto flex flex-col items-end py-1 pl-2 rounded-sm outline-none
                   opacity-70 hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150
                   focus-visible:ring-1 focus-visible:ring-border"
        style={{ gap: tocDashGap(dashes.length) }}
      >
        {dashes.map(index => (
          <span
            key={index}
            className={`block h-[2px] rounded-full transition-colors ${
              index === activeDash ? 'bg-text' : 'bg-text-muted/50'
            }`}
            style={{ width: DASH_WIDTHS[Math.min(items[index].depth, DASH_WIDTHS.length - 1)] }}
          />
        ))}
      </button>

      {/* Expanded panel: overlays the text, anchored to the indicator's top-right corner. */}
      <div
        ref={listRef}
        id={panelId}
        onMouseEnter={() => setHoverSoon(true)}
        onMouseLeave={() => setHoverSoon(false)}
        className={`absolute top-0 right-0 max-h-full overflow-y-auto overflow-x-hidden p-1.5
                    bg-surface-1 border border-border rounded-lg shadow-lg
                    transition-[opacity,transform,visibility] duration-150 ease-out ${
          open
            ? 'opacity-100 translate-x-0 visible pointer-events-auto'
            : 'opacity-0 translate-x-1 invisible pointer-events-none'
        }`}
        style={{ width: TOC_PANEL_WIDTH }}
      >
        {items.map((item, i) => (
          <button
            key={`${item.pos}-${i}`}
            type="button"
            data-toc-index={i}
            title={item.text}
            aria-current={i === active ? 'location' : undefined}
            // Keep the caret/focus in the editor: the TOC only scrolls.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => jumpTo(i)}
            className={`block w-full text-left truncate rounded-md py-1 pr-2 leading-snug outline-none
                        transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 ${
              i === active
                ? 'font-bold text-text'
                : `text-text-muted hover:text-text ${item.level === 1 ? 'font-medium' : ''}`
            }`}
            style={{ paddingLeft: 8 + item.depth * 14, fontSize: LEVEL_FONT_SIZE[item.level] }}
          >
            {item.text}
          </button>
        ))}
      </div>
    </nav>
  )
}
