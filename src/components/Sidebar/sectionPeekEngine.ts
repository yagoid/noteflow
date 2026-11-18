// Hover engine of the sidebar's section peek (the map that floats beside the list when the
// pointer rests on a closed note's row — NoteSectionMap.tsx). One peek at most is open
// app-wide, and choosing which one needs every row at once (switching rows, the aim
// triangle), so the timing lives here, module-level, instead of in each row: each
// eligible row registers a target, and a single pointermove listener drives them all.
// Rows never re-render on hover: a target's open/close only touches that row's state.

import { aimTriangle, pointInTriangle, scrollMovesRows, type Point } from '../../lib/sectionPeek'

/** One row whose map can peek (closed note, 2+ sections, no search). */
export interface SectionPeekTarget {
  /** The row (`[data-note-row]`): resting anywhere on it opens the peek. */
  row: HTMLElement
  /** Shows the peek (or keeps the one fading out). */
  open: () => void
  /** Hides it: faded, or at once. Doesn't call back into the engine. */
  close: (immediate: boolean) => void
  /** The peek's element while it is up. */
  panel: () => HTMLElement | null
  /** The peek sits beside the list (the aim triangle applies), not over the line. */
  beside: () => boolean
}

// Rest on a row before its peek opens (sweeping the list never opens one).
const OPEN_DELAY = 300
// With a peek up (or closed just now), another row takes over this fast.
const SWITCH_DELAY = 50
// How long after a close the fast switch still applies.
const WARM_WINDOW = 450
// Resting this long inside the aim triangle: the row under the pointer wins after all.
const AIM_REST = 280
// Grace before closing once the pointer leaves the row and the peek (crosses the gap).
const LEAVE_GRACE = 160
// On another row that can't peek (the open note, one section…): close sooner.
const LEAVE_ON_ROW = 60
// The pointer left the window.
const LEAVE_WINDOW = 120

const ROW_SELECTOR = '[data-note-row]'

const targets = new Map<HTMLElement, SectionPeekTarget>()
let openTarget: SectionPeekTarget | null = null
let pendTimer: number | null = null
let pendTarget: SectionPeekTarget | null = null
let pendKind: 'normal' | 'aim' | null = null
let closeTimer: number | null = null
let warmUntil = 0
/** Last pointer position inside the open row: the aim triangle's apex. */
let apex: Point | null = null
let lastPoint: Point | null = null

function cancelPending(): void {
  if (pendTimer !== null) window.clearTimeout(pendTimer)
  pendTimer = null
  pendTarget = null
  pendKind = null
}

function cancelClose(): void {
  if (closeTimer !== null) window.clearTimeout(closeTimer)
  closeTimer = null
}

/** After `ms`, opens `target`'s peek (null: closes the open one). Replaces what was pending. */
function schedule(target: SectionPeekTarget | null, ms: number, kind: 'normal' | 'aim'): void {
  cancelPending()
  pendTarget = target
  pendKind = kind
  pendTimer = window.setTimeout(() => {
    pendTimer = null
    pendTarget = null
    pendKind = null
    if (target) openPeek(target)
    else closePeek()
  }, ms)
}

function scheduleClose(ms: number): void {
  if (closeTimer !== null || !openTarget) return
  closeTimer = window.setTimeout(() => {
    closeTimer = null
    closePeek()
  }, ms)
}

function openPeek(target: SectionPeekTarget): void {
  if (targets.get(target.row) !== target || !target.row.isConnected) return
  cancelClose()
  if (openTarget && openTarget !== target) openTarget.close(true)
  setOpen(target)
  apex = lastPoint
  target.open()
}

/** Closes the open peek (faded) and warms up the fast switch. */
function closePeek(): void {
  cancelPending()
  cancelClose()
  const target = openTarget
  if (!target) return
  setOpen(null)
  warmUntil = Date.now() + WARM_WINDOW
  target.close(false)
}

function setOpen(target: SectionPeekTarget | null): void {
  if (!target) apex = null
  openTarget = target
}

function inAimTriangle(p: Point): boolean {
  const target = openTarget
  if (!target || !apex || !target.beside()) return false
  const panel = target.panel()
  if (!panel) return false
  return pointInTriangle(p, aimTriangle(apex, panel.getBoundingClientRect()))
}

// ── Pointer ─────────────────────────────────────────────────────────────────
function onPointerMove(e: PointerEvent): void {
  if (e.pointerType === 'touch') return
  lastPoint = { x: e.clientX, y: e.clientY }
  const el = e.target
  if (!(el instanceof Element)) return
  // A held button (selecting text, dragging): nothing opens.
  if (e.buttons !== 0) {
    cancelPending()
    return
  }
  const open = openTarget
  if (open?.panel()?.contains(el)) {
    cancelClose()
    if (pendKind === 'aim') cancelPending()
    return
  }
  const row = el.closest<HTMLElement>(ROW_SELECTOR)
  if (open && row === open.row) {
    apex = lastPoint
    cancelClose()
    cancelPending()
    return
  }
  const target = row ? targets.get(row) ?? null : null
  if (open && inAimTriangle(lastPoint)) {
    // Heading for the peek: what the pointer crosses only counts if it stops there.
    cancelClose()
    schedule(target, AIM_REST, 'aim')
    return
  }
  if (target) {
    cancelClose()
    if (pendTarget === target && pendKind === 'normal') return
    const fast = !!open || Date.now() < warmUntil
    schedule(target, fast ? SWITCH_DELAY : OPEN_DELAY, 'normal')
    return
  }
  cancelPending()
  if (open) scheduleClose(row ? LEAVE_ON_ROW : LEAVE_GRACE)
}

function onWindowLeave(): void {
  cancelPending()
  scheduleClose(LEAVE_WINDOW)
}

// Typing (editor, search box…) means the user isn't browsing the list: the peek closes
// and a pending one doesn't open (the next pointer move re-arms it). Modifiers alone
// don't count: Ctrl/Cmd+click on a cell opens that section alongside.
function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift' || e.key === 'Alt') return
  closePeek()
}

// ── Dismissals ──────────────────────────────────────────────────────────────
// Window blur/resize, a drag: the open peek goes at once, and a pending one is dropped too.
function dismissNow(): void {
  cancelPending()
  cancelClose()
  const target = openTarget
  if (!target) return
  setOpen(null)
  target.close(true)
}

// A scroll that moves the pending or the open row (its list, the page) dismisses the
// same way: a wheel scroll moves the list under a still pointer (no pointermove), so the
// row armed is no longer the one under it. Any other scroll (the AI chat following its
// stream, the editor…) is none of the peek's business.
function onScroll(e: Event): void {
  const t = e.target
  const scroller = t === document || t === document.documentElement ? 'document' : t instanceof Element ? t : null
  if (!scroller || !scrollMovesRows(scroller, [pendTarget?.row, openTarget?.row])) return
  dismissNow()
}

// ── Registry ────────────────────────────────────────────────────────────────
/**
 * Makes a row's map able to peek. Returns the unregister (the row stopped being eligible
 * or unmounted): its pending open is dropped and, if its peek was up, the engine forgets
 * it (the row drops its own peek in the same render).
 */
export function registerSectionPeek(target: SectionPeekTarget): () => void {
  if (targets.size === 0) {
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
    document.documentElement.addEventListener('pointerleave', onWindowLeave)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', dismissNow)
    window.addEventListener('resize', dismissNow)
    window.addEventListener('dragstart', dismissNow, true)
  }
  targets.set(target.row, target)
  return () => {
    if (targets.get(target.row) === target) targets.delete(target.row)
    sectionPeekClosed(target)
    if (targets.size > 0) return
    window.removeEventListener('pointermove', onPointerMove, { capture: true })
    document.documentElement.removeEventListener('pointerleave', onWindowLeave)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('blur', dismissNow)
    window.removeEventListener('resize', dismissNow)
    window.removeEventListener('dragstart', dismissNow, true)
    cancelPending()
    cancelClose()
  }
}

/** The row closed its peek on its own (a cell was clicked): forget it, keep nothing pending. */
export function sectionPeekClosed(target: SectionPeekTarget): void {
  if (pendTarget === target) cancelPending()
  if (openTarget !== target) return
  cancelPending()
  cancelClose()
  setOpen(null)
}
