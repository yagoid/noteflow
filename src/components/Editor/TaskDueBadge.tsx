import { Bell, Calendar } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { formatDate } from '../../i18n/formatDate'
import { dueDate, dueLabelKind, dueUrgency } from './taskBadge'

// The deadline of a task (a task list item, a kanban card): no pill — a
// calendar icon and a word ("today", "tomorrow", "Fri 21", "Nov 21"), and the
// alarm as a bell + its time, in grey. Colour only when the date asks for
// something: today in the warning colour, overdue in red; any other date in
// muted text with the icon in the theme's green. The whole date (and the
// alarm) is the tooltip of the button that holds it (dueTooltip, taskDue.ts):
// none here, or it would hide that button's whole tooltip.
//
// Next to an agent's TEXT chip the row would get long: the same element also
// carries the compact form — a 16 px calendar leaf (a band in the urgency's
// colour, the day, a dot when there is an alarm) — and index.css shows that
// one instead while the row holds an `.agent-chip` (`:has()`), so the switch
// follows the chip without any subscription here.

interface TaskDueBadgeProps {
  due: string
  alarm?: string | null
  /** Show the alarm's time (a sticky note hides it: no room). */
  showAlarm?: boolean
}

export function TaskDueBadge({ due, alarm, showAlarm = true }: TaskDueBadgeProps) {
  const t = useT()
  const s = t.editor.task
  const urgency = dueUrgency(due)
  const kind = dueLabelKind(due)
  const date = dueDate(due)
  const label =
    kind === 'today' ? s.dueToday
      : kind === 'tomorrow' ? s.dueTomorrow
        : formatDate(date, kind === 'weekday' ? s.dueWeekdayFormat : s.dueDateFormat)
  return (
    <span className={`task-due task-due--${urgency}`}>
      <span className="task-due-text">
        <Calendar size={12} className="task-due-icon" aria-hidden />
        <span>{label}</span>
        {alarm && showAlarm && (
          <span className="task-due-alarm">
            <Bell size={11} aria-hidden />
            {alarm}
          </span>
        )}
      </span>
      <svg className="task-due-leaf" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2.2" width="13" height="12.6" rx="2.6" />
        <path className="task-due-leaf-band" d="M1.5 4.8a2.6 2.6 0 0 1 2.6-2.6h7.8a2.6 2.6 0 0 1 2.6 2.6v1.4h-13z" />
        <text x="8" y="12.6" textAnchor="middle">{date.getDate()}</text>
        {alarm && <circle className="task-due-leaf-alarm" cx="14.3" cy="13.8" r="2.4" />}
      </svg>
    </span>
  )
}
