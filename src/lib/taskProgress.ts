// Progress rail of the note editor's checklists (components/Editor/TaskProgress.ts
// paints it, index.css § Checklist progress rail styles it): what each rail counts
// and whether the left margin has room for it. Pure ProseMirror + numbers; covered
// on the editor's real schema by tests/lib/taskProgress.test.ts.

import type { Node as PMNode } from '@tiptap/pm/model'

/** One checklist block: a task list that is a direct child of the document. */
export interface TaskProgressBlock {
  /** Position right before the list node (`view.nodeDOM(pos)` is its <ul>). */
  pos: number
  /** Ordinal among the document's top-level task lists (the rail widget's stable key). */
  index: number
  /** Checked tasks, nested subtasks included. */
  done: number
  /** All tasks, nested subtasks included. */
  total: number
}

/** A rail only makes sense from this many tasks on. */
export const TASK_PROGRESS_MIN_TASKS = 2

/** Gap (px) between the rail block and the list's left edge: room for the ⋮⋮ drag handle. */
export const TASK_PROGRESS_OFFSET = 24
/** Width (px) reserved for the rail block (rail + its label to the left). */
export const TASK_PROGRESS_WIDTH = 44
/** Breathing room (px) kept between the rail block and the editor's content edge. */
export const TASK_PROGRESS_MARGIN = 10
/** Smallest left gutter (px) that holds the rail: 24 + 44 + 10 = 78. */
export const TASK_PROGRESS_MIN_GUTTER = TASK_PROGRESS_OFFSET + TASK_PROGRESS_WIDTH + TASK_PROGRESS_MARGIN

/**
 * The checklist blocks of `doc` that get a rail: every top-level task list with at
 * least TASK_PROGRESS_MIN_TASKS tasks (subtasks count, wherever they're nested).
 * Lists inside quotes, tables, kanban boards or other lists are never blocks, and
 * anything between two lists (a paragraph, a heading) makes them separate blocks.
 */
export function taskProgressBlocks(doc: PMNode): TaskProgressBlock[] {
  const out: TaskProgressBlock[] = []
  let index = 0
  doc.forEach((node, offset) => {
    if (node.type.name !== 'taskList') return
    let done = 0
    let total = 0
    node.descendants((child) => {
      if (child.type.name === 'taskItem') {
        total++
        if (child.attrs.checked) done++
      }
      return true
    })
    if (total >= TASK_PROGRESS_MIN_TASKS) out.push({ pos: offset, index, done, total })
    index++
  })
  return out
}

/** Whether a left gutter of `gutterPx` (list edge → editor content edge) holds the rail. */
export function fitsTaskProgressRail(gutterPx: number): boolean {
  return gutterPx >= TASK_PROGRESS_MIN_GUTTER
}

/** Share of done tasks, 0–1. */
export function taskProgressFraction(done: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
}

/** The rail's small label: "3/8", or "✓" once every task is done. */
export function taskProgressLabel(done: number, total: number): string {
  return total > 0 && done >= total ? '✓' : `${done}/${total}`
}

/** Rounded percentage shown in the tooltip. */
export function taskProgressPercent(done: number, total: number): number {
  return Math.round(taskProgressFraction(done, total) * 100)
}

/** The rail bounces when a list goes to 100 % — not when it's mounted already complete. */
export function taskProgressShouldPop(previous: number | undefined, next: number): boolean {
  return previous !== undefined && previous < 1 && next >= 1
}

/**
 * Splits a tooltip template around its `{progress}` placeholder (the part shown in
 * bold): `'{progress} tasks done'` → `['', ' tasks done']`. Without the placeholder
 * the whole template is the text before it.
 */
export function splitProgressTemplate(template: string): [string, string] {
  const at = template.indexOf('{progress}')
  if (at < 0) return [template, '']
  return [template.slice(0, at), template.slice(at + '{progress}'.length)]
}
