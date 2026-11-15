// Drag & drop of task items by their ⋮⋮ handle (DeadlineTaskItemView). Same
// mechanics and look as the kanban board's drag (KanbanBoardView.tsx, shared
// bits in pointerDrag.ts): pointer events, 4 px threshold, a ghost portalled to
// <body> moved with `transform`, the source dimmed, a neon drop line, an rAF
// loop that hit-tests and auto-scrolls the editor, Esc cancels, the click after
// the drop is swallowed.
//
// It isn't React state: the drop targets are every task of the document, not
// one NodeView, so the controller lives here (one drag at a time) and reads
// the editor's DOM directly. A task moves with its subtasks, only into a task
// list (any level: before/after any task, or as the first subtask of a task
// that already has subtasks), never into its own subtree; the move is one
// transaction (lib/listItemMove.ts → one Ctrl+Z). If the document changes
// mid-drag (external sync), the drop is cancelled: its positions are stale.

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { checkItemMove, moveListItem, type ListSlot } from '../../lib/listItemMove'
import { DRAG_THRESHOLD, edgeScrollVertical, swallowNextClick, verticalScroller } from './pointerDrag'

/** A task of the document with its place and DOM (gathered when a drag starts). */
interface TaskEntry {
  pos: number
  listPos: number
  index: number
  listCount: number
  /** The task whose sub-list holds this one, if any. */
  parent: TaskEntry | null
  /** Position of this task's first sub-list when it's a task list. */
  subTaskListPos: number | null
  li: HTMLElement
  /** This task's first sub-list element (its own row ends where it starts). */
  subListEl: HTMLElement | null
}

interface Hit {
  slot: ListSlot
  lineTop: number
  lineLeft: number
  lineWidth: number
}

/** Beyond this vertical distance (px) from every task row there's no drop target. */
const MAX_DROP_DISTANCE = 48

/** The <li> a task's NodeView renders (its `dom` is a display:contents wrapper). */
function taskLi(dom: Node | null): HTMLElement | null {
  if (!(dom instanceof HTMLElement)) return null
  if (dom.tagName === 'LI') return dom
  const li = dom.firstElementChild
  return li instanceof HTMLElement && li.tagName === 'LI' ? li : null
}

function collectTasks(editor: Editor): TaskEntry[] {
  const { doc } = editor.state
  const { view } = editor
  const byPos = new Map<number, TaskEntry>()
  const out: TaskEntry[] = []
  doc.descendants((node: PMNode, pos: number) => {
    if (node.type.name !== 'taskItem') return true
    const li = taskLi(view.nodeDOM(pos))
    if (!li) return true
    const $pos = doc.resolve(pos)
    const d = $pos.depth
    const parentPos = d >= 2 && $pos.node(d - 1).type.name === 'taskItem' ? $pos.before(d - 1) : null
    let subTaskListPos: number | null = null
    let subListEl: HTMLElement | null = null
    let offset = pos + 1
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child.type.name !== 'paragraph') {
        if (child.type.name === 'taskList') subTaskListPos = offset
        const el = view.nodeDOM(offset)
        subListEl = el instanceof HTMLElement ? el : null
        break
      }
      offset += child.nodeSize
    }
    const entry: TaskEntry = {
      pos,
      listPos: $pos.before(d),
      index: $pos.index(d),
      listCount: $pos.parent.childCount,
      parent: parentPos === null ? null : byPos.get(parentPos) ?? null,
      subTaskListPos,
      li,
      subListEl,
    }
    byPos.set(pos, entry)
    out.push(entry)
    return true
  })
  return out
}

let cancelActive: (() => void) | null = null

/**
 * Pointerdown on a task's drag handle: arms a drag of the task at `getPos()`
 * that starts once the pointer travels DRAG_THRESHOLD px.
 */
export function startTaskDrag(editor: Editor, getPos: () => number | undefined, e: PointerEvent, li: HTMLElement | null) {
  if (!editor.isEditable || e.button !== 0 || !li) return
  cancelActive?.()
  const startX = e.clientX
  const startY = e.clientY
  let pointer = { x: startX, y: startY }
  let dragging = false
  let itemPos = -1
  let itemEnd = -1
  let startDoc: PMNode | null = null
  let targets: TaskEntry[] = []
  let hit: Hit | null = null
  let ghost: HTMLElement | null = null
  let ghostOffset = { dx: 0, dy: 0 }
  let line: HTMLElement | null = null
  let scroller: HTMLElement | null = null
  let frame: number | null = null

  const positionGhost = () => {
    if (ghost) ghost.style.transform = `translate(${pointer.x - ghostOffset.dx}px, ${pointer.y - ghostOffset.dy}px)`
  }

  const hitTest = (x: number, y: number): Hit | null => {
    let best: TaskEntry | null = null
    let bestRow = { top: 0, bottom: 0, left: 0, width: 0 }
    let bestDy = Infinity
    let bestDx = Infinity
    for (const t of targets) {
      const r = t.li.getBoundingClientRect()
      if (r.height === 0) continue
      const bottom = t.subListEl ? t.subListEl.getBoundingClientRect().top : r.bottom
      const dy = y < r.top ? r.top - y : y > bottom ? y - bottom : 0
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      if (dy < bestDy || (dy === bestDy && dx < bestDx)) {
        best = t
        bestDy = dy
        bestDx = dx
        bestRow = { top: r.top, bottom, left: r.left, width: r.width }
      }
    }
    if (!best || bestDy > MAX_DROP_DISTANCE) return null
    let result: Hit
    if (y < (bestRow.top + bestRow.bottom) / 2) {
      // Upper half of a task's own row: right before it.
      result = { slot: { listPos: best.listPos, index: best.index }, lineTop: bestRow.top, lineLeft: bestRow.left, lineWidth: bestRow.width }
    } else if (best.subTaskListPos !== null && best.subListEl) {
      // Lower half of a task with subtasks: its first subtask.
      const r = best.subListEl.getBoundingClientRect()
      result = { slot: { listPos: best.subTaskListPos, index: 0 }, lineTop: bestRow.bottom, lineLeft: r.left, lineWidth: r.width }
    } else {
      // Lower half: right after it — or, after the last task of a sub-list with
      // the pointer left of it (over the parent's checkbox), after the parent.
      let at = best
      while (at.parent && at.index === at.listCount - 1 && x < at.li.getBoundingClientRect().left) at = at.parent
      const r = at.li.getBoundingClientRect()
      const lineTop = best.li.getBoundingClientRect().bottom
      result = { slot: { listPos: at.listPos, index: at.index + 1 }, lineTop, lineLeft: r.left, lineWidth: r.width }
    }
    return startDoc && checkItemMove(startDoc, itemPos, result.slot) === 'ok' ? result : null
  }

  const updateTarget = () => {
    hit = hitTest(pointer.x, pointer.y)
    if (!line) return
    if (!hit) {
      line.style.display = 'none'
      return
    }
    line.style.display = ''
    line.style.top = `${hit.lineTop}px`
    line.style.left = `${hit.lineLeft}px`
    line.style.width = `${hit.lineWidth}px`
  }

  const loop = () => {
    if (!dragging) { frame = null; return }
    edgeScrollVertical(scroller, pointer.y)
    updateTarget()
    frame = requestAnimationFrame(loop)
  }

  const begin = (): boolean => {
    const pos = getPos()
    const node = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null
    if (typeof pos !== 'number' || node?.type.name !== 'taskItem') return false
    dragging = true
    itemPos = pos
    itemEnd = pos + node.nodeSize
    startDoc = editor.state.doc
    targets = collectTasks(editor).filter((t) => t.pos < itemPos || t.pos >= itemEnd)

    // Ghost: a copy of the task (subtasks included) in a card, like a kanban card.
    const r = li.getBoundingClientRect()
    const style = getComputedStyle(li)
    ghost = document.createElement('div')
    ghost.className = 'kanban-ghost task-ghost prose-editor'
    ghost.style.width = `${r.width}px`
    ghost.style.setProperty('--prose-font-size', style.getPropertyValue('--prose-font-size') || style.fontSize)
    ghost.style.setProperty('--prose-font-family', style.getPropertyValue('--prose-font-family') || style.fontFamily)
    const pm = document.createElement('div')
    pm.className = 'ProseMirror'
    const ul = document.createElement('ul')
    ul.dataset.type = 'taskList'
    const clone = li.cloneNode(true) as HTMLElement
    // `checked` is a property (React sets it), not an attribute cloneNode copies.
    const srcBoxes = li.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    clone.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box, i) => {
      box.checked = srcBoxes[i]?.checked ?? false
    })
    ul.appendChild(clone)
    pm.appendChild(ul)
    ghost.appendChild(pm)
    document.body.appendChild(ghost)
    // The card's padding (CSS) narrows and shifts the copy: widen the card by
    // it (same line wraps) and keep the copy's text where the task was.
    const ur = ul.getBoundingClientRect()
    const cr = clone.getBoundingClientRect()
    ghost.style.width = `${r.width + ur.width - cr.width}px`
    ghostOffset = { dx: startX - r.left + (cr.left - ur.left), dy: startY - r.top + (cr.top - ur.top) }
    positionGhost()

    line = document.createElement('div')
    line.className = 'kanban-drop-line task-drop-line'
    line.style.display = 'none'
    document.body.appendChild(line)

    li.dataset.dragSource = ''
    document.body.classList.add('task-dragging')
    scroller = verticalScroller(editor.view.dom as HTMLElement)
    frame = requestAnimationFrame(loop)
    return true
  }

  const end = (commit: boolean) => {
    cancelActive = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey, true)
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    if (!dragging) return
    dragging = false
    ghost?.remove()
    line?.remove()
    delete li.dataset.dragSource
    document.body.classList.remove('task-dragging')
    swallowNextClick()
    if (!commit || !hit || editor.isDestroyed || editor.state.doc !== startDoc) return
    const tr = editor.state.tr
    if (moveListItem(tr, itemPos, hit.slot) !== null) editor.view.dispatch(tr)
  }

  const onMove = (ev: PointerEvent) => {
    pointer = { x: ev.clientX, y: ev.clientY }
    if (!dragging) {
      if (Math.hypot(pointer.x - startX, pointer.y - startY) < DRAG_THRESHOLD) return
      if (!begin()) { end(false); return }
    }
    positionGhost()
  }
  const onUp = () => end(true)
  const onCancel = () => end(false)
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !dragging) return
    ev.preventDefault()
    ev.stopPropagation()
    end(false)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey, true)
  cancelActive = () => end(false)
}
