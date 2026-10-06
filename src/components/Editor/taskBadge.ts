// Shared helpers for the task deadline/importance chips and their pickers —
// used by task list items (DeadlineTaskItemView) and kanban cards
// (KanbanBoardView). Kept apart from TaskPickers.tsx so that file only exports
// components (react-refresh/only-export-components).
import { getRootZoom } from '../../stores/themeStore'
import type { TaskImportance } from '../../lib/markdownInline'

export type Importance = TaskImportance

export const IMPORTANCE_VALUES: Importance[] = ['low', 'medium', 'high']

// Today's date as yyyy-mm-dd in LOCAL time (not UTC) to match the date input's value format.
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function badgeColorClass(due: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (due < today) return 'task-badge--overdue'
  if (due === today) return 'task-badge--today'
  return 'task-badge--future'
}

export function formatBadgeDate(due: string): string {
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Estimated sizes of the pickers, used to flip them above the trigger. */
export const DEADLINE_POPOVER_SIZE = { height: 148, width: 230 }
export const IMPORTANCE_POPOVER_SIZE = { height: 132, width: 170 }

/**
 * Where to open a `position: fixed` picker for `trigger`: below it, or above
 * when there's no room, kept inside the viewport horizontally. The popover is
 * fixed (zoomed/local space) while the rect is device space, so the rect is
 * divided by the root zoom (see "UI text size" in patterns.md).
 */
export function popoverPosition(
  trigger: HTMLElement,
  size: { height: number; width: number },
): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect()
  const z = getRootZoom()
  const rectTop = rect.top / z
  const rectBottom = rect.bottom / z
  const rectLeft = rect.left / z
  const spaceBelow = window.innerHeight - rectBottom
  const top = spaceBelow > size.height ? rectBottom + 4 : rectTop - size.height - 4
  const left = Math.min(rectLeft, window.innerWidth - size.width)
  return { top, left }
}
