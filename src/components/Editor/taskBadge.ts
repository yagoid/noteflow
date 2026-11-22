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
 * "Next week" is the next Monday — a week ahead when `from` is a Monday. On a
 * Sunday the next Monday is tomorrow, the same day as "Tomorrow": it is the
 * Monday after that one (8 days ahead), so the two shortcuts never coincide.
 */
export function quickDueDate(kind: QuickDue, from: Date = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  if (kind === 'tomorrow') d.setDate(d.getDate() + 1)
  else if (kind === 'nextWeek') {
    const toMonday = (8 - d.getDay()) % 7 || 7
    d.setDate(d.getDate() + (toMonday === 1 ? 8 : toMonday))
  }
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

/** A `YYYY-MM-DD` deadline as a local Date (midnight). */
export function dueDate(due: string): Date {
  const [y, m, d] = due.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** How urgent a deadline is, against today's LOCAL date (`todayISO()`). */
export type DueUrgency = 'overdue' | 'today' | 'future'

export function dueUrgency(due: string, today: string = todayISO()): DueUrgency {
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  return 'future'
}

/**
 * Which words a deadline is shown with (TaskDueBadge): 'today', 'tomorrow',
 * the weekday while it is less than a week ahead ("Fri 21"), else the date
 * ("Nov 21") — also for an overdue one.
 */
export type DueLabelKind = 'today' | 'tomorrow' | 'weekday' | 'date'

export function dueLabelKind(due: string, today: string = todayISO()): DueLabelKind {
  const days = Math.round((dueDate(due).getTime() - dueDate(today).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days > 1 && days < 7) return 'weekday'
  return 'date'
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

/** Which side of its trigger the task menu opened on. */
export type TaskMenuSide = 'below' | 'above'

export interface TaskMenuPlacement {
  top: number
  left: number
  side: TaskMenuSide
}

// The menu's size as laid out: never larger than the viewport minus the margins
// (its CSS max-width/max-height, where it scrolls).
function cappedSize(menu: { width: number; height: number }, viewport: { width: number; height: number }) {
  return {
    width: Math.min(menu.width, viewport.width - 2 * MENU_MARGIN),
    height: Math.min(menu.height, viewport.height - 2 * MENU_MARGIN),
  }
}

function clampInto(v: number, max: number): number {
  return Math.max(MENU_MARGIN, Math.min(v, max))
}

/**
 * Where to open the task menu (TaskMenuPopover, `position: fixed`) of a
 * trigger, given its measured size: right edges aligned (the trigger sits at
 * the end of the task line, often in the right gutter), below the trigger, or
 * above when it doesn't fit below and there's more room up there. Always kept
 * inside the viewport with a small margin: a menu larger than the viewport
 * (a 200x200 sticky) is capped like its CSS max-width/max-height (100vw/100vh
 * minus twice the margin, where it scrolls) and pinned to the top-left margin.
 * Only decided when the menu opens (and on window resize): while it's open,
 * followTaskMenu keeps it where it is.
 */
export function taskMenuPosition(
  trigger: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): TaskMenuPlacement {
  const size = cappedSize(menu, viewport)
  const below = trigger.bottom + MENU_GAP
  const above = trigger.top - MENU_GAP - size.height
  const fitsBelow = below + size.height <= viewport.height - MENU_MARGIN
  const side: TaskMenuSide = fitsBelow || trigger.top < viewport.height - trigger.bottom ? 'below' : 'above'
  return {
    top: clampInto(side === 'below' ? below : above, viewport.height - MENU_MARGIN - size.height),
    left: clampInto(trigger.right - size.width, viewport.width - MENU_MARGIN - size.width),
    side,
  }
}

/**
 * Where the open task menu goes after a re-render or a scroll, given where it
 * opened (taskMenuPosition). Picking a value turns the trigger's icon into
 * chips and changes its width (and the menu's height may change too, e.g.
 * "Clear all" appears): re-aligning it would make it jump. So it keeps its
 * `left`, and vertically only follows the trigger (scroll): below, its top
 * stays under the trigger's bottom; above, its BOTTOM edge stays over the
 * trigger's top, so growing taller doesn't push it against the trigger. Only
 * clamped when it would leave the window.
 */
export function followTaskMenu(
  placed: { left: number; side: TaskMenuSide },
  trigger: { top: number; bottom: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const size = cappedSize(menu, viewport)
  const top = placed.side === 'below' ? trigger.bottom + MENU_GAP : trigger.top - MENU_GAP - size.height
  return {
    top: clampInto(top, viewport.height - MENU_MARGIN - size.height),
    left: clampInto(placed.left, viewport.width - MENU_MARGIN - size.width),
  }
}
