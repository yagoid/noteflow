import type { Editor } from '@tiptap/core'
import { agentListTasksOfDoc, type AgentListTask } from '../../lib/agentTaskList'

// Going from the list of the queue bar (AgentTaskList.tsx) to a task in the editor.

/**
 * Goes to a task of the list in the editor: scrolls it into view and puts the
 * cursor at the end of its first line (a task item), then opens its report —
 * a press on its state (the box or the chip), the same as the user's — or,
 * for a queued task (whose chip would take it out of the queue), lights its
 * row up a moment. The task is found again in the document NOW: it may have
 * moved since the list was drawn: the same id at the same place first (an id
 * can be on two tasks after a sync merge), else the first with that id.
 * Returns whether the focus went somewhere (the report, the editor): when not,
 * the caller gives it back to what opened the list.
 */
export function revealAgentTask(editor: Editor, picked: AgentListTask): boolean {
  if (editor.isDestroyed) return false
  const same = agentListTasksOfDoc(editor.state.doc).filter((x) => x.id === picked.id && x.kind === picked.kind)
  const task = same.find((x) => x.pos === picked.pos && x.col === picked.col && x.idx === picked.idx) ?? same[0]
  if (!task) return false
  const dom = editor.view.nodeDOM(task.pos)
  const root = dom instanceof HTMLElement ? dom : null
  let el: HTMLElement | null = null
  if (task.kind === 'item') {
    el = root?.matches('li[data-type="taskItem"]') ? root : root?.querySelector<HTMLElement>('li[data-type="taskItem"]') ?? null
    const node = editor.state.doc.nodeAt(task.pos)
    const first = node?.firstChild
    // The end of the task's first line: inside its paragraph (taskItem → paragraph → text).
    if (first?.isTextblock) editor.commands.setTextSelection(task.pos + 1 + first.nodeSize - 1)
  } else {
    el = root?.querySelector<HTMLElement>(`[data-kanban-col="${task.col}"] [data-kanban-cards] > [data-kanban-card="${task.idx}"]`) ?? null
  }
  if (!el) return focusEditor(editor)
  const target = el
  target.scrollIntoView?.({ block: 'center' })
  // Its own state control — not one of a nested task's (they sit inside its content).
  const owner = task.kind === 'item' ? 'li[data-type="taskItem"]' : '[data-kanban-card]'
  const control = Array.from(target.querySelectorAll<HTMLElement>('.agent-box, .agent-task-trigger'))
    .find((b) => b.closest(owner) === target)
  if (task.state !== 'queued' && control) {
    control.click()
    return true
  }
  const focused = focusEditor(editor)
  target.classList.remove('agent-task-flash')
  void target.offsetWidth // restart the animation
  target.classList.add('agent-task-flash')
  setTimeout(() => target.classList.remove('agent-task-flash'), 1400)
  return focused
}

/** The cursor was put on the task: the editor takes the focus — only an editable one can. */
function focusEditor(editor: Editor): boolean {
  if (!editor.isEditable) return false
  editor.view.focus()
  return true
}
