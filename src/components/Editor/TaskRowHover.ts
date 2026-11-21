import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { taskRowAt, type TaskRowBox } from '../../lib/taskRowHover'

// The row of a checklist task, for its buttons right of the text (the date and
// the robot, DeadlineTaskItemView). Two pieces, both outside React — the notes
// can hold hundreds of tasks:
//
//   - TaskRowHover (an extension, Editor.tsx): ONE mousemove / mouseleave pair
//     per editor, on its whole width (the gutters of Readable and the drag
//     handle's column included). In a frame it finds the task whose own lines
//     are at the pointer's Y (lib/taskRowHover.ts) and marks its <li> with
//     `data-row-hover`; index.css shows that task's buttons and its line.
//     Only one task at a time, the innermost: a subtask's row is its own, not
//     its parent's. An attribute and not a class: React writes the <li>'s
//     className on its own renders. ProseMirror ignores it (the <li> is the
//     node view's, outside its content DOM).
//   - observeTaskOwnHeight: one ResizeObserver for every task of the window,
//     on each task's content; it writes the height of the task's own lines
//     (without its sublists) as `--task-own-h` on its `.task-actions`, which
//     centres the buttons and draws the line over them. On the actions, not on
//     the <li>: a custom property inherits, and a subtask lives inside its
//     parent's <li>.

/** The attribute on the `<li>` of the task whose row is under the pointer. */
export const TASK_ROW_HOVER_ATTR = 'data-row-hover'

const TASK_ITEM_SELECTOR = 'li[data-type="taskItem"]'

/** The content of a task's `<li>` (its paragraphs, then its sublists). */
function taskContentOf(li: Element): HTMLElement | null {
  return li.querySelector<HTMLElement>(':scope > .task-item-body > .task-content')
}

/** The first list nested in a task's content: where its own lines end. */
function firstSublist(content: Element): Element | null {
  // TipTap puts ProseMirror's content DOM inside NodeViewContent's element.
  const box = content.querySelector(':scope > [data-node-view-content-react]') ?? content
  for (const child of Array.from(box.children)) {
    if (child.tagName === 'UL' || child.tagName === 'OL') return child
  }
  return null
}

/** Height of a task's own lines (its paragraphs, without the lists nested under them). */
function ownHeight(content: Element): number {
  const box = content.getBoundingClientRect()
  const list = firstSublist(content)
  return (list ? list.getBoundingClientRect().top : box.bottom) - box.top
}

/** The task whose own row is at `y` among the tasks of `root`; 'between' keeps the current one. */
function taskRowIn(root: HTMLElement, y: number): HTMLElement | null | 'between' {
  const items = root.querySelectorAll<HTMLElement>(TASK_ITEM_SELECTOR)
  // Outside tables, document order is top to bottom: once a task starts below y,
  // nothing further on can hold it. Cells of one table row sit side by side, so
  // with a task in a table every task is looked at.
  const ordered = !root.querySelector('table li[data-type="taskItem"]')
  const rows: TaskRowBox[] = []
  const found: HTMLElement[] = []
  for (const li of Array.from(items)) {
    const rect = li.getBoundingClientRect()
    if (rect.top > y) {
      if (ordered) break
      continue
    }
    if (y >= rect.bottom) continue
    const content = taskContentOf(li)
    const list = content ? firstSublist(content) : null
    rows.push({ top: rect.top, bottom: rect.bottom, ownBottom: list ? list.getBoundingClientRect().top : rect.bottom })
    found.push(li)
  }
  const hit = taskRowAt(rows, y)
  if (hit === 'between') return 'between'
  return hit === 'none' ? null : found[hit]
}

/** Follows the pointer over one editor and marks the task row under it. */
class TaskRowHoverView {
  private readonly view: EditorView
  private y: number | null = null
  private frame = 0
  private row: HTMLElement | null = null

  constructor(view: EditorView) {
    this.view = view
    view.dom.addEventListener('mousemove', this.onMove, { passive: true })
    view.dom.addEventListener('mouseleave', this.onLeave)
    // The text moves under a still pointer when the editor scrolls.
    view.dom.ownerDocument.addEventListener('scroll', this.onScroll, { capture: true, passive: true })
  }

  /** The document (typing, a sync) may move the rows under a still pointer. */
  update() {
    if (this.y !== null) this.schedule()
  }

  destroy() {
    this.view.dom.removeEventListener('mousemove', this.onMove)
    this.view.dom.removeEventListener('mouseleave', this.onLeave)
    this.view.dom.ownerDocument.removeEventListener('scroll', this.onScroll, { capture: true })
    if (this.frame) cancelAnimationFrame(this.frame)
    this.setRow(null)
  }

  private readonly onMove = (e: MouseEvent) => {
    this.y = e.clientY
    this.schedule()
  }

  private readonly onLeave = () => {
    this.y = null
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.setRow(null)
  }

  private readonly onScroll = () => {
    if (this.y !== null) this.schedule()
  }

  /** At most one lookup per frame, however many events arrive. */
  private schedule() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (this.y === null) return
      const row = taskRowIn(this.view.dom, this.y)
      if (row !== 'between') this.setRow(row)
    })
  }

  private setRow(li: HTMLElement | null) {
    if (li === this.row) return
    this.row?.removeAttribute(TASK_ROW_HOVER_ATTR)
    li?.setAttribute(TASK_ROW_HOVER_ATTR, '')
    this.row = li
  }
}

export const TaskRowHover = Extension.create({
  name: 'taskRowHover',

  addProseMirrorPlugins() {
    return [new Plugin({ key: new PluginKey('taskRowHover'), view: (view) => new TaskRowHoverView(view) })]
  },
})

// ── Own height ───────────────────────────────────────────────────────────────

/** Task content → its `.task-actions`, for the shared observer. */
const ownHeightTargets = new Map<Element, HTMLElement>()
let ownHeightObserver: ResizeObserver | null = null

function onContentResize(entries: ResizeObserverEntry[]) {
  // Every read first, then every write: no layout forced between two tasks.
  const writes: [HTMLElement, string][] = []
  for (const entry of entries) {
    const actions = ownHeightTargets.get(entry.target)
    if (!actions) continue
    const height = ownHeight(entry.target)
    // Not laid out (a hidden pane): keep what it had.
    if (height <= 0) continue
    const value = `${Math.round(height * 100) / 100}px`
    if (actions.style.getPropertyValue('--task-own-h') !== value) writes.push([actions, value])
  }
  for (const [actions, value] of writes) actions.style.setProperty('--task-own-h', value)
}

/**
 * Keeps `--task-own-h` on a task's `.task-actions` equal to the height of its
 * own lines (its content without the lists nested in it). The content's size
 * changes whenever either part does, so one observed element per task is
 * enough. Until the first measurement the CSS falls back to one line.
 * Returns the cleanup.
 */
export function observeTaskOwnHeight(content: HTMLElement, actions: HTMLElement): () => void {
  ownHeightObserver ??= new ResizeObserver(onContentResize)
  ownHeightTargets.set(content, actions)
  ownHeightObserver.observe(content)
  return () => {
    ownHeightObserver?.unobserve(content)
    ownHeightTargets.delete(content)
  }
}
