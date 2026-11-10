import { useLayoutEffect, useRef, useState } from 'react'

// Context menu that measures its own size after rendering and shifts itself back
// into the viewport when it would overflow — the menu's height varies (encryption
// state, section colors, group submenus…), so a fixed height estimate can't reliably
// keep the bottom options visible.
// `placement="above"` opens it upwards: `y` is then its BOTTOM edge (e.g. a button's top
// for a menu anchored at the bottom of the window). Positioning only knows `x`/`y` and the
// measured size: don't move the menu with a CSS transform in `className` (the overflow
// clamp would not see it).
export function ContextMenu({ x, y, className, children, placement = 'below' }: {
  x: number
  y: number
  className: string
  children: React.ReactNode
  placement?: 'below' | 'above'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const margin = 8
    const { width, height } = el.getBoundingClientRect()
    let left = x
    let top = placement === 'above' ? y - height : y
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - height - margin)
    }
    if (placement === 'above' && top < margin) top = margin
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin)
    }
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }))
  })

  return (
    <div
      ref={ref}
      className={className}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
