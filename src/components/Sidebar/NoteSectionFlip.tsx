import { Component, PureComponent, type ReactNode, type RefObject } from 'react'
import { FLIP_EASE, cancelFlip, captureFlip, playFlip, prefersReducedMotion, type FlipSnapshot } from '../../lib/flip'

// Class components on purpose: getSnapshotBeforeUpdate is the one React hook that runs
// AFTER render but BEFORE the DOM changes, for the whole commit at once. That is exactly
// the "First" of a FLIP whose two ends live in different rows (the note that closes and
// the one that opens change in the same commit), with no shared registry and no cost
// when nothing changes (the key comparison bails out first).

/** Line ⇄ open map, peek → open map, and the rows shifting around them. */
const OPEN_DURATION = 460

/**
 * Runs `play` (the "Last" + "Play" of a FLIP) once the commit's synchronous follow-up
 * renders are done, still before the frame is painted. The open map's row cap
 * (NoteSectionMap) measures in a layout effect and folds the overflow in a second,
 * synchronous commit: measuring the "Last" boxes in componentDidUpdate would see the
 * unfolded map and the cells would land in the wrong place.
 */
function afterSyncRenders(play: () => void): void {
  queueMicrotask(play)
}

interface FlipScopeProps {
  /** What the map shows ('line', 'open', 'search', 'none'): a change to or from 'open' plays the FLIP. */
  flipKey: string
  /** The map's root: origin of the boxes (it stays in place across modes). */
  rootRef: RefObject<HTMLElement | null>
  /** The hover peek while it is open: when present, the FLIP starts from its cells. */
  peekRef: RefObject<HTMLElement | null>
  children: ReactNode
}

interface FlipScopeSnapshot {
  boxes: FlipSnapshot
  /** Came from the line (not from the peek or another map): the labels enter late. */
  fromLine: boolean
}

/**
 * Wraps a note row's section map (NoteSectionMap): when its mode changes, every
 * `[data-flip]` element (segments and cells, keyed by section id) glides from where it
 * was to where it is. Labels of a map that unfolds from the line fade in after the cells.
 */
export class FlipScope extends Component<FlipScopeProps> {
  getSnapshotBeforeUpdate(prev: FlipScopeProps): FlipScopeSnapshot | null {
    if (prev.flipKey === this.props.flipKey || prefersReducedMotion()) return null
    // Only opening/closing the note animates. A search flips many rows at once between
    // line and inline map: measuring them all on every keystroke isn't worth it.
    if (prev.flipKey !== 'open' && this.props.flipKey !== 'open') return null
    const root = this.props.rootRef.current
    if (!root) return null
    const peek = this.props.peekRef.current
    const fromPeek = !!peek && peek.isConnected && !peek.classList.contains('is-closing')
    const boxes = captureFlip(fromPeek ? peek : root, root.getBoundingClientRect())
    return boxes.size > 0 ? { boxes, fromLine: !fromPeek && prev.flipKey === 'line' } : null
  }

  componentDidUpdate(_prev: FlipScopeProps, _state: unknown, snap: FlipScopeSnapshot | null): void {
    if (!snap) return
    afterSyncRenders(() => {
      const root = this.props.rootRef.current
      if (!root?.isConnected) return
      cancelFlip(root)
      playFlip(root, snap.boxes, root.getBoundingClientRect(), OPEN_DURATION)
      if (snap.fromLine && this.props.flipKey !== 'line') {
        root.querySelectorAll<HTMLElement>('.nsm-label-text').forEach((el) => {
          el.animate(
            [{ opacity: 0, transform: 'translateY(2px)' }, { opacity: 1, transform: 'none' }],
            { duration: 300, delay: 200, easing: 'ease-out', fill: 'backwards' },
          )
        })
      }
    })
  }

  render() {
    return this.props.children
  }
}

const ROW_SHIFT_ID = 'nf-row-shift'
/** Rows measured at most per change (only the ones on screen are, anyway). */
const MAX_SHIFT_ROWS = 200

/** Screen top of each note row, before a change that moves them. */
export type RowTops = Map<HTMLElement, number>

/**
 * Tops of the `[data-note-row]` rows under `root` that are laid out and on screen
 * (inside `root`'s box). Cheap before mutating: the layout is clean. Null when none.
 */
export function captureRowTops(root: HTMLElement): RowTops | null {
  const bounds = root.getBoundingClientRect()
  const tops: RowTops = new Map()
  for (const el of root.querySelectorAll<HTMLElement>('[data-note-row]')) {
    const r = el.getBoundingClientRect()
    if (r.height === 0 || r.bottom < bounds.top || r.top > bounds.bottom) continue
    tops.set(el, r.top)
    if (tops.size >= MAX_SHIFT_ROWS) break
  }
  return tops.size > 0 ? tops : null
}

/** Slides each captured row from its old top to where it is now. */
export function playRowShift(tops: RowTops, duration = OPEN_DURATION): void {
  for (const [el, top] of tops) {
    if (!el.isConnected) continue
    for (const a of el.getAnimations()) if (a.id === ROW_SHIFT_ID) a.cancel()
    const dy = top - el.getBoundingClientRect().top
    if (Math.abs(dy) < 0.5) continue
    el.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
      { duration, easing: FLIP_EASE, id: ROW_SHIFT_ID },
    )
  }
}

interface RowShiftFlipProps {
  /** The note shown as open in the sidebar (noteViewId ?? activeNoteId). */
  activeKey: string | null
  /** Sidebar root: rows are its `[data-note-row]` elements on screen. */
  rootRef: RefObject<HTMLElement | null>
}

/**
 * Renders nothing. When the open note changes, its row grows (map) and the previous
 * one shrinks (line) in the same commit: this slides the rows on screen from their old
 * position to the new one instead of letting them jump.
 */
export class RowShiftFlip extends PureComponent<RowShiftFlipProps> {
  getSnapshotBeforeUpdate(prev: RowShiftFlipProps): RowTops | null {
    if (prev.activeKey === this.props.activeKey || prefersReducedMotion()) return null
    const root = this.props.rootRef.current
    return root ? captureRowTops(root) : null
  }

  componentDidUpdate(_prev: RowShiftFlipProps, _state: unknown, tops: RowTops | null): void {
    if (!tops) return
    afterSyncRenders(() => playRowShift(tops))
  }

  render() {
    return null
  }
}
