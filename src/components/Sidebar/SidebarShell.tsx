import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import {
  floatingSidebarBounds,
  miniRowsSignature,
  pickSidebarAnchor,
  MINI_STRIP_WIDTH,
  type MiniSidebarRow,
} from '../../lib/miniSidebar'
import { focusContentAnchor, onSidebarAnchorChange, SIDEBAR_ANCHOR_ATTR } from './sidebarAnchor'
import { MiniSidebar } from './MiniSidebar'
import { useT } from '../../i18n/useT'

/** Hover delays (ms): opening waits a bit longer than the TOC's so brushing the
 *  left edge (e.g. while selecting text next to it) doesn't pop the panel; the
 *  close delay bridges moving between the strip and the panel. */
const OPEN_DELAY = 120
const CLOSE_DELAY = 200
/** Gap (px) between the window's left edge and the floating panel. */
const PANEL_LEFT = 8
/** Docked width animation (ms) — same as before the floating mode existed. */
const DOCK_TRANSITION_MS = 220

const ANCHOR_SELECTOR = `[${SIDEBAR_ANCHOR_ATTR}]`

interface Bounds {
  top: number
  bottom: number
  height: number
}

interface SidebarShellProps {
  /** The app row holding sidebar + main: the panel is positioned and measured inside it. */
  containerRef: RefObject<HTMLElement | null>
  /** Floating mode: the sidebar overlays the content and opens from the mini-view. */
  floating: boolean
  /** Docked mode only: whether the sidebar takes its width in the layout. */
  visible: boolean
  width: number
  /** Animate mode/visibility changes (off while resizing by hand, and at startup until the saved mode is applied). */
  animate: boolean
  /** Renders the Sidebar; `onMiniRows` feeds the mini-view (pass it only while floating). */
  children: (onMiniRows: (rows: MiniSidebarRow[]) => void) => ReactNode
}

/** Focus that should keep the floating panel open: text entry, or keyboard navigation. */
function isKeyboardFocus(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable) return true
  return el.matches(':focus-visible')
}

/**
 * Hosts the (single) Sidebar instance in either mode without remounting it:
 *  - docked: an in-flow spacer reserves the width and the sidebar sits over it
 *    at full height (the width animates on show/hide, as in the brain view);
 *  - floating: the same sidebar becomes an overlay panel spanning the content
 *    area of the leftmost pane (measured from its content anchor), opened by
 *    hovering the mini-view strip at the content's left edge. It stays open
 *    while hovered, while it holds text/keyboard focus, while a menu or modal
 *    launched from it is open, and during a drag started in it.
 */
export function SidebarShell({ containerRef, floating, visible, width, animate, children }: SidebarShellProps) {
  const t = useT()
  const hostRef = useRef<HTMLElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressRef = useRef(false)
  const suppressCleanupRef = useRef<(() => void) | null>(null)
  const lastDragPointRef = useRef<{ x: number; y: number } | null>(null)
  // Last pointer position seen over the strip/panel (Escape only suppresses the
  // strip's hover when the pointer is on it).
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)

  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithinState] = useState(false)
  // Mirror for the MutationObserver below (it runs outside React's render).
  const focusWithinRef = useRef(false)
  const setFocusWithin = useCallback((next: boolean) => {
    focusWithinRef.current = next
    setFocusWithinState(next)
  }, [])
  const [overlay, setOverlay] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [mini, setMini] = useState<{ rows: MiniSidebarRow[]; sig: string }>({ rows: [], sig: '' })

  // Switching modes starts the floating panel closed (hover/drag state from the
  // other mode means nothing here).
  const [prevFloating, setPrevFloating] = useState(floating)
  if (prevFloating !== floating) {
    setPrevFloating(floating)
    setHovered(false)
    setDragging(false)
  }

  const open = floating && (hovered || focusWithin || overlay || dragging)

  const onMiniRows = useCallback((rows: MiniSidebarRow[]) => {
    setMini((prev) => {
      const sig = miniRowsSignature(rows)
      return sig === prev.sig ? prev : { rows, sig }
    })
  }, [])

  // The Sidebar only re-renders when App passes new props (a new render
  // function), not on every hover/focus/bounds change of the shell.
  const content = useMemo(() => children(onMiniRows), [children, onMiniRows])

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }, [])

  const setHoverSoon = useCallback((next: boolean) => {
    clearHoverTimer()
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null
      setHovered(next)
    }, next ? OPEN_DELAY : CLOSE_DELAY)
  }, [clearHoverTimer])

  useEffect(() => () => {
    clearHoverTimer()
    suppressCleanupRef.current?.()
  }, [clearHoverTimer])

  // Entering floating mode with focus parked on a sidebar button (the pin switch
  // that was just clicked): drop it, or the closed panel would keep a focused,
  // invisible control. Text/keyboard focus stays — and keeps the panel open.
  useEffect(() => {
    if (!floating) return
    const active = document.activeElement
    if (active instanceof HTMLElement && hostRef.current?.contains(active) && !isKeyboardFocus(active)) active.blur()
  }, [floating])

  // ── Placement: line up with the content anchor of the leftmost pane ────────
  useEffect(() => {
    if (!floating) return
    const container = containerRef.current
    const host = hostRef.current
    if (!container || !host) return
    let frame = 0
    let observed: HTMLElement | null = null
    const measure = () => {
      frame = 0
      const containerRect = container.getBoundingClientRect()
      const anchors = Array.from(container.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR)).filter((el) => !host.contains(el))
      const rects = anchors.map((el) => el.getBoundingClientRect())
      const index = pickSidebarAnchor(rects, containerRect)
      const anchor = index >= 0 ? anchors[index] : null
      if (anchor !== observed) {
        if (observed) ro.unobserve(observed)
        if (anchor) ro.observe(anchor)
        observed = anchor
      }
      const next = floatingSidebarBounds(containerRect, index >= 0 ? rects[index] : null)
      const height = Math.max(0, Math.round(containerRect.height) - next.top - next.bottom)
      setBounds((prev) => (
        prev && prev.top === next.top && prev.bottom === next.bottom && prev.height === height
          ? prev
          : { ...next, height }
      ))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    // The anchor's own size covers the toolbar wrapping/unwrapping, banners above
    // the text, the pane-overflow hint, the docked width animation…
    const ro = new ResizeObserver(schedule)
    ro.observe(container)
    // …mount/unmount covers view switches, raw mode and note/section changes…
    const offAnchors = onSidebarAnchorChange(schedule)
    // …and horizontal scrolling of the split changes which pane is leftmost.
    // Scrolls inside an anchor (the text itself) or the sidebar don't matter.
    const onScroll = (e: Event) => {
      const target = e.target
      if (target instanceof Element && (target.closest(ANCHOR_SELECTOR) || host.contains(target))) return
      schedule()
    }
    container.addEventListener('scroll', onScroll, { capture: true, passive: true })
    schedule()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      ro.disconnect()
      offAnchors()
      container.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [floating, containerRef])

  // ── Keep open while a menu / modal launched from the sidebar is up ─────────
  // They are `position: fixed` elements rendered inside the sidebar (context
  // menus, ConfirmModal, EncryptionModal…). Only element insertions/removals
  // that are (or contain) one trigger a re-check, so row re-renders stay cheap.
  // The same observer drops the focus hold when the focused input is removed
  // (rename / new group-folder committed with Enter): Chromium fires no blur
  // for a removed element, focus just falls back to <body>.
  useEffect(() => {
    if (!floating) return
    const host = hostRef.current
    if (!host) return
    const check = () => setOverlay(host.querySelector('.fixed') != null)
    const touchesOverlay = (node: Node) =>
      node instanceof Element && (node.classList.contains('fixed') || node.querySelector('.fixed') != null)
    const mo = new MutationObserver((records) => {
      if (focusWithinRef.current && !host.contains(document.activeElement) && records.some((r) => r.removedNodes.length > 0)) {
        setFocusWithin(false)
      }
      for (const record of records) {
        for (const node of record.addedNodes) if (touchesOverlay(node)) { check(); return }
        for (const node of record.removedNodes) if (touchesOverlay(node)) { check(); return }
      }
    })
    mo.observe(host, { childList: true, subtree: true })
    // Also drops a focus hold left over from the docked mode (focus moved on meanwhile).
    const frame = requestAnimationFrame(() => {
      check()
      if (focusWithinRef.current && !host.contains(document.activeElement)) setFocusWithin(false)
    })
    return () => {
      cancelAnimationFrame(frame)
      mo.disconnect()
    }
  }, [floating, setFocusWithin])

  // ── Drag started in the sidebar: stay open until it ends ───────────────────
  // dragend may never reach the host (the dragged row can be re-parented by the
  // drop, e.g. moved to another group), so a drop anywhere or the first mouse
  // move after the drag (no mouse events fire during one) also ends it.
  const endDrag = useCallback((point: { x: number; y: number } | null) => {
    setDragging(false)
    const host = hostRef.current
    const p = point ?? lastDragPointRef.current
    lastDragPointRef.current = null
    if (!host || !p) { setHovered(false); return }
    const r = host.getBoundingClientRect()
    setHovered(p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const onDragOver = (e: DragEvent) => { lastDragPointRef.current = { x: e.clientX, y: e.clientY } }
    const onDrop = (e: DragEvent) => {
      const point = { x: e.clientX, y: e.clientY }
      // After the drop handlers of the target ran.
      setTimeout(() => endDrag(point), 0)
    }
    const onMove = (e: MouseEvent) => endDrag({ x: e.clientX, y: e.clientY })
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('drop', onDrop, true)
    window.addEventListener('mousemove', onMove, true)
    return () => {
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('mousemove', onMove, true)
    }
  }, [dragging, endDrag])

  // ── Hover ───────────────────────────────────────────────────────────────────
  const trackPointer = (e: React.MouseEvent) => { lastPointerRef.current = { x: e.clientX, y: e.clientY } }

  const handleRegionLeave = () => {
    lastPointerRef.current = null
    if (hovered) setHoverSoon(false)
    else clearHoverTimer()
  }

  const handleStripEnter = (e: React.MouseEvent) => {
    trackPointer(e)
    // A held button = selecting text that slid to the edge: don't pop the panel.
    if (e.buttons !== 0 || suppressRef.current) return
    if (hovered) clearHoverTimer()
    else setHoverSoon(true)
  }

  const handleStripMove = (e: React.MouseEvent) => {
    trackPointer(e)
    // Entered with a button held (or right after Escape) and kept moving: arm it now.
    if (hovered || hoverTimerRef.current || e.buttons !== 0 || suppressRef.current) return
    setHoverSoon(true)
  }

  // Escape closed the panel with the pointer on the strip: don't reopen until the
  // pointer has left it once.
  const suppressHoverUntilLeave = () => {
    suppressCleanupRef.current?.()
    suppressRef.current = true
    const onMove = (e: MouseEvent) => {
      const r = stripRef.current?.getBoundingClientRect()
      if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return
      release()
    }
    const release = () => {
      suppressRef.current = false
      window.removeEventListener('mousemove', onMove)
      suppressCleanupRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    suppressCleanupRef.current = release
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!floating || e.key !== 'Escape' || overlay) return
    // Escape in an inline rename / new group-folder input only cancels that input.
    const target = e.target as HTMLElement
    if (target instanceof HTMLInputElement && !target.hasAttribute('data-sidebar-search')) return
    e.preventDefault()
    // Handled here: the overviews' window-level Escape (close the view) must not fire too.
    e.stopPropagation()
    clearHoverTimer()
    setHovered(false)
    const p = lastPointerRef.current
    const strip = stripRef.current?.getBoundingClientRect()
    if (p && strip && p.x >= strip.left && p.x <= strip.right && p.y >= strip.top && p.y <= strip.bottom) suppressHoverUntilLeave()
    const container = containerRef.current
    if (container) focusContentAnchor(container, useNotesStore.getState().activePaneId)
    // No text to return to (overview, empty editor): at least leave the panel.
    if (hostRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }

  const dockedWidth = visible ? width : 0
  const dockTransition = animate ? `width ${DOCK_TRANSITION_MS}ms ease` : 'none'

  const hostStyle: React.CSSProperties = floating
    ? {
        position: 'absolute',
        left: PANEL_LEFT,
        top: bounds?.top ?? 12,
        bottom: bounds?.bottom ?? 12,
        width,
        maxWidth: `calc(100% - ${PANEL_LEFT * 2}px)`,
        zIndex: 40,
        overflow: 'hidden',
        opacity: open ? 1 : 0,
        // `none` (not translateX(0)) once open: a transformed ancestor would
        // become the containing block of the sidebar's fixed menus and modals.
        transform: open ? 'none' : 'translateX(-8px)',
        pointerEvents: open ? 'auto' : 'none',
        transition: animate ? 'opacity 150ms ease-out, transform 150ms ease-out' : 'none',
      }
    : {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: dockedWidth,
        overflow: 'hidden',
        transition: dockTransition,
      }

  return (
    <>
      {/* Docked: reserves the sidebar's width in the row (0 while floating). */}
      <div
        aria-hidden="true"
        style={{ width: floating ? 0 : dockedWidth, flexShrink: 0, transition: dockTransition }}
      />

      <aside
        ref={hostRef}
        aria-label={t.sidebar.panelLabel}
        className={floating ? 'rounded-lg border border-border shadow-lg bg-surface-1' : ''}
        style={hostStyle}
        onMouseEnter={() => {
          if (!floating) return
          clearHoverTimer()
          if (!hovered) setHovered(true)
        }}
        onMouseMove={floating ? trackPointer : undefined}
        onMouseLeave={() => { if (floating) handleRegionLeave() }}
        onFocus={(e) => setFocusWithin(isKeyboardFocus(e.target))}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
        }}
        onKeyDown={handleKeyDown}
        onDragStart={() => {
          if (!floating) return
          lastDragPointRef.current = null
          setDragging(true)
        }}
        onDragEnd={(e) => {
          if (!floating || !dragging) return
          // Some platforms report 0,0 here: fall back to the last dragover point.
          endDrag(e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : null)
        }}
      >
        <div style={floating ? { width: '100%', height: '100%' } : { width, minWidth: width, height: '100%' }}>
          {content}
        </div>
      </aside>

      {/* Floating: the mini-view strip — hover (or click) opens the panel. */}
      {floating && bounds && (
        <div
          ref={stripRef}
          aria-hidden="true"
          className={`absolute left-0 z-30 overflow-hidden transition-opacity duration-150 ${
            open ? 'opacity-0' : 'opacity-40 hover:opacity-90'
          }`}
          style={{ top: bounds.top, height: bounds.height, width: MINI_STRIP_WIDTH, pointerEvents: dragging ? 'none' : undefined }}
          onMouseEnter={handleStripEnter}
          onMouseMove={handleStripMove}
          onMouseLeave={handleRegionLeave}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            clearHoverTimer()
            setHovered(true)
          }}
        >
          <MiniSidebar rows={mini.rows} height={bounds.height} />
        </div>
      )}
    </>
  )
}
