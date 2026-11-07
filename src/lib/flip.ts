// FLIP helpers (First, Last, Invert, Play) on the Web Animations API, used by the sidebar
// note row's section map (Sidebar/NoteSectionMap.tsx, Sidebar/NoteSectionFlip.tsx).
// Elements opt in with a `data-flip="<key>"` attribute; a snapshot records their boxes
// relative to an origin element, and playing it animates every element with the same key
// from its old box to its new one (translate + scale, transform-origin top-left).

/** Same curve as the editor's section map transitions (index.css). */
export const FLIP_EASE = 'cubic-bezier(.22, .9, .24, 1)'
/** Animation id, so a new FLIP can cancel the one still running on an element. */
const FLIP_ID = 'nf-flip'

export interface FlipBox { x: number; y: number; w: number; h: number }
export type FlipSnapshot = Map<string, FlipBox>

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Boxes of the `[data-flip]` elements under `source`, relative to `origin`'s top-left. */
export function captureFlip(source: ParentNode, origin: DOMRect): FlipSnapshot {
  const snap: FlipSnapshot = new Map()
  source.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
    const key = el.dataset.flip
    if (!key || snap.has(key)) return
    const r = el.getBoundingClientRect()
    snap.set(key, { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height })
  })
  return snap
}

/** Cancels the FLIP animations still running on the `[data-flip]` elements under `root`. */
export function cancelFlip(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
    for (const a of el.getAnimations()) if (a.id === FLIP_ID) a.cancel()
  })
}

/**
 * Animates each `[data-flip]` element under `root` from its box in `before` (same key)
 * to where it is now; `origin` is the same reference element's CURRENT box. Elements
 * without a previous box, or that barely moved, are left alone.
 */
export function playFlip(root: ParentNode, before: FlipSnapshot, origin: DOMRect, duration: number): void {
  root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
    const o = before.get(el.dataset.flip ?? '')
    if (!o) return
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const dx = o.x - (r.left - origin.left)
    const dy = o.y - (r.top - origin.top)
    const sx = o.w / r.width
    const sy = o.h / r.height
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return
    el.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration, easing: FLIP_EASE, id: FLIP_ID },
    )
  })
}
