import { PureComponent, type RefObject } from 'react'
import {
  GUIDE_CURSOR_MS,
  SIDEBAR_FOLD_SETTLE_MS,
  guideCursorBox,
  offsetTopWithin,
  toggledIds,
} from '../../lib/sidebarGuides'

interface GroupGuidesProps {
  /** The note shown as open in the sidebar (noteViewId ?? activeNoteId). */
  activeKey: string | null
  /** Sidebar root: groups are its `.sbg-g` elements. */
  rootRef: RefObject<HTMLElement | null>
  /** Store sets (same identity until a toggle): a change marks that body as folding. */
  collapsedGroupIds: ReadonlySet<string>
  collapsedFolderIds: ReadonlySet<string>
}

const px = (n: number) => `${n}px`

/**
 * Renders nothing; mounted once in Sidebar (like RowShiftFlip). Drives the imperative
 * side of the groups' "index with guides" so none of it re-renders the list:
 *
 * - **Cursor:** each group body has an `<i class="sbg-cur">`; this places it beside the
 *   open note's row, on the group guide or on its folder's guide (hidden if that folder
 *   is collapsed or the note isn't in the group). It glides (CSS, 450 ms) only when the
 *   open note changes; on resizes (folders folding, the open map reflowing, the sidebar
 *   width) and list mutations it is re-placed at once, measured with the offsetTop chain
 *   because rows may be mid-FLIP (transformed).
 * - **Folding marker:** a group/folder whose collapsed state just changed gets
 *   `data-anim` for the fold (+ margin), which keeps its body `overflow: hidden` while
 *   the rows are revealed. Expanded and settled, the body is `overflow: visible` so the
 *   folder headers inside can stick (sticky stops at an `overflow: hidden` ancestor).
 */
export class GroupGuides extends PureComponent<GroupGuidesProps> {
  private resizeObserver: ResizeObserver | null = null
  private mutationObserver: MutationObserver | null = null
  private observed = new Set<Element>()
  private frame = 0
  private needsRescan = false
  /** Until then, re-placements keep the cursor's transition (it's still gliding). */
  private glideUntil = 0
  private foldTimers = new Map<Element, number>()

  private unmounted = false

  componentDidMount(): void {
    // StrictMode (dev) mounts, unmounts and mounts the same instance again: start clean.
    this.unmounted = false
    // A parent's ref is attached after its children's didMount: on the very first commit
    // the sidebar root may not be there yet, so retry once the commit is done (pre-paint).
    if (!this.init()) queueMicrotask(() => { if (!this.unmounted) this.init() })
  }

  private init(): boolean {
    const root = this.props.rootRef.current
    if (!root || this.mutationObserver) return !!root
    this.resizeObserver = new ResizeObserver(() => this.schedule(false))
    this.mutationObserver = new MutationObserver(() => this.schedule(true))
    this.mutationObserver.observe(root, { childList: true, subtree: true })
    this.rescan(root)
    this.placeAll(root, true)
    return true
  }

  componentDidUpdate(prev: GroupGuidesProps): void {
    const root = this.props.rootRef.current
    if (!root) return
    this.init()
    for (const id of toggledIds(prev.collapsedGroupIds, this.props.collapsedGroupIds)) {
      this.markFolding(root.querySelector(`[data-sbg-group="${CSS.escape(id)}"]`))
    }
    for (const id of toggledIds(prev.collapsedFolderIds, this.props.collapsedFolderIds)) {
      this.markFolding(root.querySelector(`[data-sbg-folder="${CSS.escape(id)}"]`))
    }
    if (prev.activeKey !== this.props.activeKey) {
      this.glideUntil = performance.now() + GUIDE_CURSOR_MS
      this.placeAll(root, false)
    } else {
      this.placeAll(root, performance.now() >= this.glideUntil)
    }
  }

  componentWillUnmount(): void {
    this.unmounted = true
    this.resizeObserver?.disconnect()
    this.mutationObserver?.disconnect()
    // Nulled so a remount (StrictMode) creates them again in init().
    this.resizeObserver = null
    this.mutationObserver = null
    this.observed.clear()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.needsRescan = false
    for (const [el, timer] of this.foldTimers) {
      window.clearTimeout(timer)
      el.removeAttribute('data-anim')
    }
    this.foldTimers.clear()
  }

  private markFolding(el: Element | null) {
    if (!el) return
    window.clearTimeout(this.foldTimers.get(el))
    el.setAttribute('data-anim', '')
    this.foldTimers.set(el, window.setTimeout(() => {
      el.removeAttribute('data-anim')
      this.foldTimers.delete(el)
    }, SIDEBAR_FOLD_SETTLE_MS))
  }

  /** Coalesces observer callbacks into one placement per frame. */
  private schedule(rescan: boolean) {
    if (rescan) this.needsRescan = true
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      const root = this.props.rootRef.current
      if (!root) return
      if (this.needsRescan) {
        this.needsRescan = false
        this.rescan(root)
      }
      this.placeAll(root, performance.now() >= this.glideUntil)
    })
  }

  /** Observes the size of every group body on screen (groups come and go with filters). */
  private rescan(root: HTMLElement) {
    const ro = this.resizeObserver
    if (!ro) return
    const now = new Set<Element>(root.querySelectorAll('.sbg-in'))
    for (const el of this.observed) if (!now.has(el)) ro.unobserve(el)
    for (const el of now) if (!this.observed.has(el)) ro.observe(el)
    this.observed = now
  }

  private placeAll(root: HTMLElement, instant: boolean) {
    for (const body of root.querySelectorAll<HTMLElement>('.sbg-in')) this.place(body, instant)
  }

  private place(body: HTMLElement, instant: boolean) {
    const cur = body.querySelector<HTMLElement>(':scope > .sbg-cur')
    if (!cur) return
    const key = this.props.activeKey
    let row: HTMLElement | null = null
    let inFolder = false
    if (key) {
      row = body.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(key)}"]`)?.closest<HTMLElement>('[data-note-row]') ?? null
      const folder = row?.closest<HTMLElement>('.sbg-f')
      if (folder && body.contains(folder)) {
        if (folder.classList.contains('is-collapsed')) row = null
        else inFolder = true
      }
    }
    const top = row ? offsetTopWithin(row, body) : null
    if (!row || top == null) {
      cur.classList.add('is-off')
      return
    }
    const box = guideCursorBox(top, row.offsetHeight, inFolder)
    const wasOff = cur.classList.contains('is-off')
    const s = cur.style
    if (!wasOff && s.top === px(box.top) && s.height === px(box.height) && s.left === px(box.left)) return
    // Appearing or re-placed by a resize: jump there (no glide) and just fade in.
    const jump = instant || wasOff
    if (jump) cur.classList.add('is-track')
    s.top = px(box.top)
    s.height = px(box.height)
    s.left = px(box.left)
    if (jump) {
      void cur.offsetWidth
      cur.classList.remove('is-track')
    }
    cur.classList.remove('is-off')
  }

  render() {
    return null
  }
}
