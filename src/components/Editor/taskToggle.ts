// Checking / unchecking a task from its checkbox (DeadlineTaskItemView). With
// Settings → Editor → "Move checked items to the bottom" on, the task also
// moves (with its subtasks) in the same transaction — lib/listItemMove.ts
// toggleTask → one Ctrl+Z — and the list animates it (FLIP, visual only):
// right after the change every moved sibling is put back where it was with a
// transform, holds there HOLD_MS so the check is seen, then slides to its new
// place. Rects are measured before the dispatch and re-read from the editor's
// DOM after it, by child index (ProseMirror may recreate the moved NodeView or
// reuse a sibling's for it), so a remount doesn't break the animation.
// prefers-reduced-motion: no animation.

import type { Editor } from '@tiptap/core'
import { movedOrder, toggleTask } from '../../lib/listItemMove'

const HOLD_MS = 400
const SLIDE_MS = 280

/** The previous animation still running (a fast second click restarts from where things are). */
let running: { els: HTMLElement[]; timers: ReturnType<typeof setTimeout>[] } | null = null

function stopRunning() {
  if (!running) return
  running.timers.forEach(clearTimeout)
  for (const el of running.els) {
    el.style.transition = ''
    el.style.transform = ''
    el.style.zIndex = ''
  }
  running = null
}

/** The <li> of each child of the list at `listPos`, in order (null where it isn't rendered). */
function childItems(editor: Editor, listPos: number): (HTMLElement | null)[] {
  const list = editor.state.doc.nodeAt(listPos)
  if (!list) return []
  const out: (HTMLElement | null)[] = []
  let pos = listPos + 1
  list.forEach((child) => {
    const dom = editor.view.nodeDOM(pos)
    const li = dom instanceof HTMLElement ? (dom.tagName === 'LI' ? dom : dom.firstElementChild) : null
    out.push(li instanceof HTMLElement ? li : null)
    pos += child.nodeSize
  })
  return out
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Sets the task at `pos` to `checked`, moving it when `sort` is on (see top). */
export function setTaskChecked(editor: Editor, pos: number, checked: boolean, sort: boolean) {
  const result = toggleTask(editor.state, pos, checked, sort)
  if (!result) return
  const { tr, listPos, from, to } = result
  if (from === to || reducedMotion()) {
    editor.view.dispatch(tr)
    return
  }
  // FIRST: where each sibling is on screen now (mid-animation included).
  const before = childItems(editor, listPos).map((el) => el?.getBoundingClientRect().top ?? null)
  stopRunning()
  editor.view.dispatch(tr)
  // LAST + INVERT: back to the old place, by index (newIndex → oldIndex).
  const order = movedOrder(before.length, from, to)
  const els: HTMLElement[] = []
  childItems(editor, listPos).forEach((el, i) => {
    const old = before[order[i]]
    if (!el || old == null) return
    const dy = old - el.getBoundingClientRect().top
    if (Math.abs(dy) < 0.5) return
    el.style.transition = 'none'
    el.style.transform = `translateY(${dy}px)`
    // The moved task slides over its neighbours, not under them.
    if (i === to) el.style.zIndex = '1'
    els.push(el)
  })
  if (els.length === 0) return
  // PLAY: hold so the check is seen, then slide home.
  const slide = setTimeout(() => {
    for (const el of els) {
      el.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)`
      el.style.transform = ''
    }
  }, HOLD_MS)
  const cleanup = setTimeout(() => {
    for (const el of els) {
      el.style.transition = ''
      el.style.zIndex = ''
    }
    running = null
  }, HOLD_MS + SLIDE_MS + 50)
  running = { els, timers: [slide, cleanup] }
}
