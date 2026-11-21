// The words of a task's deadline that need the app's language (TaskDueBadge
// and the tooltips of the triggers around it). The date arithmetic itself is
// in taskBadge.ts (pure, tested).
import type { Messages } from '../../i18n'
import { tf } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import { dueDate } from './taskBadge'

/** The whole date of a deadline, with its alarm: "Friday, November 21, 2026 · alarm at 18:00". */
export function dueTooltip(t: Messages, due: string, alarm: string | null | undefined): string {
  const full = formatDate(dueDate(due), t.editor.task.dueFullFormat)
  return alarm ? `${full} · ${tf(t.editor.task.alarmTooltip, { time: alarm })}` : full
}
