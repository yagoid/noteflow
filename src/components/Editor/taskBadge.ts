// Shared helpers for the task deadline/importance chips and their pickers —
// used by task list items (DeadlineTaskItemView) and kanban cards
// (KanbanBoardView). Kept apart from TaskPickers.tsx so that file only exports
// components (react-refresh/only-export-components).
import type { TaskImportance } from '../../lib/markdownInline'

export type Importance = TaskImportance

export const IMPORTANCE_VALUES: Importance[] = ['low', 'medium', 'high']

// A date as yyyy-mm-dd in LOCAL time (not UTC) to match the date input's value format.
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Today's date as yyyy-mm-dd in LOCAL time.
export function todayISO(): string {
  return localISO(new Date())
}

/** The deadline shortcuts of the task menu (TaskMenuPopover), in display order. */
export type QuickDue = 'today' | 'tomorrow' | 'nextWeek'
export const QUICK_DUE_VALUES: QuickDue[] = ['today', 'tomorrow', 'nextWeek']

/**
 * The local date a shortcut stands for, counted from `from` (default: now).
 * "Next week" is the next Monday — a week ahead when `from` is a Monday, and
 * tomorrow when it's a Sunday.
 */
export function quickDueDate(kind: QuickDue, from: Date = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  if (kind === 'tomorrow') d.setDate(d.getDate() + 1)
  else if (kind === 'nextWeek') d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return d
}

/**
 * Whether the value of a date input is a deadline worth writing. Typing the
 * year in a native date input reports every partial year (0002, 0020, 0202…)
 * as a full date; the task menu applies changes live, so those would land in
 * the note. Only complete years from 1900 on count.
 */
export function isCommittableDue(value: string): boolean {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(value)
  return !!m && Number(m[1]) >= 1900
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

/** Estimated sizes of the kanban card pickers, used to flip them above the trigger. */
export const DEADLINE_POPOVER_SIZE = { height: 148, width: 230 }
export const IMPORTANCE_POPOVER_SIZE = { height: 132, width: 170 }

/**
 * Where to open a `position: fixed` picker for `trigger`: below it, or above
 * when there's no room, kept inside the viewport horizontally. The UI zoom is
 * native, so the rect and window.inner* share the popover's CSS px space.
 */
export function popoverPosition(
  trigger: HTMLElement,
  size: { height: number; width: number },
): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const top = spaceBelow > size.height ? rect.bottom + 4 : rect.top - size.height - 4
  const left = Math.min(rect.left, window.innerWidth - size.width)
  return { top, left }
}

/** Gap between the task menu and its trigger, and its minimum margin to the window edges. */
const MENU_GAP = 6
const MENU_MARGIN = 8

/**
 * Where to place the task menu (TaskMenuPopover, `position: fixed`) of a
 * trigger, given its measured size: right edges aligned (the trigger sits at
 * the end of the task line, often in the right gutter), below the trigger, or
 * above when it doesn't fit below and there's more room up there. Always kept
 * inside the viewport with a small margin.
 */
export function taskMenuPosition(
  trigger: { top: number; bottom: number; right: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const below = trigger.bottom + MENU_GAP
  const above = trigger.top - MENU_GAP - size.height
  const fitsBelow = below + size.height <= viewport.height - MENU_MARGIN
  const top = fitsBelow || trigger.top < viewport.height - trigger.bottom ? below : above
  const clamp = (v: number, max: number) => Math.max(MENU_MARGIN, Math.min(v, max))
  return {
    top: clamp(top, viewport.height - MENU_MARGIN - size.height),
    left: clamp(trigger.right - size.width, viewport.width - MENU_MARGIN - size.width),
  }
}
