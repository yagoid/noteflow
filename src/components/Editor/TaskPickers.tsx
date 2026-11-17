import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { AlarmClock, Ban, Calendar, CalendarRange, Sun, Sunrise, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { useLanguageStore } from '../../stores/languageStore'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import {
  IMPORTANCE_VALUES,
  QUICK_DUE_VALUES,
  isCommittableDue,
  localISO,
  quickDueDate,
  taskMenuPosition,
  todayISO,
  type Importance,
  type QuickDue,
} from './taskBadge'

// The task pickers. TaskMenuPopover is the single menu of a task list item
// (DeadlineTaskItemView): importance + deadline (📅 date, ⏰ alarm) in one
// place, applied live. DeadlinePopover / ImportancePopover are the two separate
// pickers of kanban cards (KanbanBoardView), positioned at `pos` (compute it with
// popoverPosition from taskBadge.ts). All are portalled to <body> and
// `position: fixed`; they close on click outside (except on their trigger,
// which toggles them itself) and on Escape.

type DismissReason = 'outside' | 'escape'

function useDismiss(
  popoverRef: React.RefObject<HTMLDivElement | null>,
  trigger: HTMLElement | null,
  onClose: (reason: DismissReason) => void,
) {
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target) || trigger?.contains(target)) return
      onClose('outside')
    }
    // Capture phase on window: the note editor stops keydown propagation (React
    // bubbling reaches it even from this portal), so a bubbling listener on
    // document would never see the Escape typed in the picker's inputs.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose('escape')
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [popoverRef, trigger, onClose])
}

interface DeadlinePopoverProps {
  pos: { top: number; left: number }
  trigger: HTMLElement | null
  due: string | null
  alarm: string | null
  /** "Done": the date (null = none) and the alarm (only kept with a date). */
  onCommit: (due: string | null, alarm: string | null) => void
  onClear: () => void
  onClose: () => void
}

export function DeadlinePopover({ pos, trigger, due, alarm, onCommit, onClear, onClose }: DeadlinePopoverProps) {
  const t = useT()
  // Prefill today when there's no existing deadline so the user only has to
  // confirm. This only seeds the draft; nothing is written until "Done".
  const [draftDue, setDraftDue] = useState<string>(due ?? todayISO())
  const [draftAlarm, setDraftAlarm] = useState<string>(alarm ?? '')
  const popoverRef = useRef<HTMLDivElement>(null)
  useDismiss(popoverRef, trigger, onClose)

  return createPortal(
    <div
      ref={popoverRef}
      className="task-deadline-popover"
      style={{ top: pos.top, left: pos.left }}
      contentEditable={false}
    >
      <div className="task-deadline-popover-row">
        <label>{t.editor.task.date}</label>
        <input
          type="date"
          value={draftDue}
          onChange={(e) => setDraftDue(e.target.value)}
          autoFocus
        />
      </div>
      <div className="task-deadline-popover-row">
        <label>{t.editor.task.alarm}</label>
        <input
          type="time"
          value={draftAlarm}
          disabled={!draftDue}
          onChange={(e) => setDraftAlarm(e.target.value)}
        />
      </div>
      <div className="task-deadline-popover-actions">
        <button type="button" onClick={onClear} className="task-deadline-btn-clear">
          {t.editor.task.clear}
        </button>
        <button
          type="button"
          onClick={() => onCommit(draftDue || null, draftDue && draftAlarm ? draftAlarm : null)}
          className="task-deadline-btn-done"
        >
          {t.editor.task.done}
        </button>
      </div>
    </div>,
    document.body,
  )
}

interface ImportancePopoverProps {
  pos: { top: number; left: number }
  trigger: HTMLElement | null
  importance: Importance | null
  onSelect: (value: Importance | null) => void
  onClose: () => void
}

export function ImportancePopover({ pos, trigger, importance, onSelect, onClose }: ImportancePopoverProps) {
  const t = useT()
  const popoverRef = useRef<HTMLDivElement>(null)
  useDismiss(popoverRef, trigger, onClose)
  const labels: Record<Importance, string> = {
    low: t.editor.task.importanceLow,
    medium: t.editor.task.importanceMedium,
    high: t.editor.task.importanceHigh,
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="task-importance-popover"
      style={{ top: pos.top, left: pos.left }}
      contentEditable={false}
    >
      {IMPORTANCE_VALUES.map((level) => (
        <button
          key={level}
          type="button"
          className={`task-importance-option${importance === level ? ' is-active' : ''}`}
          onClick={() => onSelect(level)}
        >
          <span className={`task-importance-dot task-importance-dot--${level}`} />
          {labels[level]}
        </button>
      ))}
      <button type="button" className="task-importance-clear" onClick={() => onSelect(null)}>
        {t.editor.task.clear}
      </button>
    </div>,
    document.body,
  )
}

export interface TaskMenuValues {
  due: string | null
  alarm: string | null
  importance: Importance | null
}

interface TaskMenuPopoverProps extends TaskMenuValues {
  trigger: HTMLElement
  /** Writes a change right away: the menu has no draft to confirm. */
  onChange: (patch: Partial<TaskMenuValues>) => void
  /** `fromKeyboard`: closed with Escape/Enter or "Done" — hand the focus back to the text. */
  onClose: (fromKeyboard: boolean) => void
}

/** The importance options in order, `null` = none. */
const IMPORTANCE_OPTIONS: (Importance | null)[] = [null, ...IMPORTANCE_VALUES]

const QUICK_DUE_ICONS: Record<QuickDue, ComponentType<{ size?: number; className?: string }>> = {
  today: Sun,
  tomorrow: Sunrise,
  nextWeek: CalendarRange,
}

/**
 * The single menu of a task list item: importance (a segmented row, none/low/
 * medium/high), deadline (shortcuts + date) and its alarm, plus clearing. Every
 * change is written to the task at once (so the chips next to the task update
 * live); "Done", Escape or a click outside just close it. Placed with
 * taskMenuPosition from its measured size, re-placed on scroll/resize.
 */
export function TaskMenuPopover({ trigger, due, alarm, importance, onChange, onClose }: TaskMenuPopoverProps) {
  const t = useT()
  const dateLocale = useLanguageStore((s) => s.dateLocale)
  const popoverRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)
  const importanceLabelId = useId()
  // The day the shortcuts count from, fixed while the menu is open.
  const [now] = useState(() => new Date())

  // The inputs keep their own draft: a native date input reports partial years
  // while typing, and a time input reports '' until it's complete. Only valid
  // values are written; the drafts follow the task when it changes.
  const [draftDue, setDraftDue] = useState(due ?? '')
  const [draftAlarm, setDraftAlarm] = useState(alarm ?? '')
  const [synced, setSynced] = useState({ due, alarm })
  if (synced.due !== due || synced.alarm !== alarm) {
    setSynced({ due, alarm })
    setDraftDue(due ?? '')
    setDraftAlarm(alarm ?? '')
  }

  useDismiss(popoverRef, trigger, (reason) => onClose(reason === 'escape'))

  // Measure and place it before paint, on every render (its trigger changes width
  // as the chips update) and whenever the page scrolls or the window resizes.
  useLayoutEffect(() => {
    const el = popoverRef.current
    if (!el) return
    const place = () => {
      const { top, left } = taskMenuPosition(
        trigger.getBoundingClientRect(),
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      )
      el.style.top = `${top}px`
      el.style.left = `${left}px`
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  })

  // Focus the selected importance on open (the radio group's tab stop).
  useEffect(() => {
    popoverRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus()
  }, [])

  const importanceLabels: Record<Importance, string> = {
    low: t.editor.task.importanceLow,
    medium: t.editor.task.importanceMedium,
    high: t.editor.task.importanceHigh,
  }
  const quickLabels: Record<QuickDue, string> = {
    today: t.editor.task.quickToday,
    tomorrow: t.editor.task.quickTomorrow,
    nextWeek: t.editor.task.quickNextWeek,
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // The menu owns its keys: none reaches the editor's handlers or the app's
    // bubbling shortcuts (e.g. Delete on a focused button would offer to delete
    // the note). Escape is handled first, on window capture (useDismiss).
    e.stopPropagation()
    const root = popoverRef.current
    if (!root) return
    // Keep Tab inside the menu.
    if (e.key === 'Tab') {
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
      ).filter((el) => el.tabIndex >= 0)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
      return
    }
    // Enter in a field: its value is already written, so it just closes.
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      onClose(true)
    }
  }

  // Arrow keys move (and select) within the importance radio group.
  function onImportanceKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const n = IMPORTANCE_OPTIONS.length
    const next = IMPORTANCE_OPTIONS[(IMPORTANCE_OPTIONS.indexOf(importance) + step + n) % n]
    onChange({ importance: next })
    const radios = e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')
    radios[IMPORTANCE_OPTIONS.indexOf(next)]?.focus()
  }

  function openPicker(input: HTMLInputElement | null) {
    try {
      input?.showPicker()
    } catch {
      input?.focus()
    }
  }

  const clearDue = () => onChange({ due: null, alarm: null })

  return createPortal(
    <div
      ref={popoverRef}
      className="task-menu"
      role="dialog"
      aria-label={t.editor.task.menu}
      contentEditable={false}
      onKeyDown={onKeyDown}
      {...OWN_KEYS_PROPS}
    >
      <div className="task-menu-section">
        <div className="task-menu-head">
          <span className="task-menu-label" id={importanceLabelId}>{t.editor.task.importance}</span>
        </div>
        <div
          className="task-menu-seg"
          role="radiogroup"
          aria-labelledby={importanceLabelId}
          onKeyDown={onImportanceKeyDown}
        >
          {IMPORTANCE_OPTIONS.map((level) => {
            const on = importance === level
            return (
              <button
                key={level ?? 'none'}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className={`task-menu-seg-opt task-menu-seg-opt--${level ?? 'none'}${on ? ' is-on' : ''}`}
                title={level ? undefined : t.editor.task.importanceNone}
                aria-label={level ? undefined : t.editor.task.importanceNone}
                onClick={() => onChange({ importance: level })}
              >
                {level ? (
                  <>
                    <span className={`task-importance-dot task-importance-dot--${level}`} />
                    {importanceLabels[level]}
                  </>
                ) : (
                  <Ban size={12} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="task-menu-section">
        <div className="task-menu-head">
          <span className="task-menu-label">{t.editor.task.deadline}</span>
          {due && (
            <button type="button" className="task-menu-head-action" onClick={clearDue}>
              {t.editor.task.clear}
            </button>
          )}
        </div>
        <div className="task-menu-quick">
          {QUICK_DUE_VALUES.map((kind) => {
            const date = quickDueDate(kind, now)
            const iso = localISO(date)
            const Icon = QUICK_DUE_ICONS[kind]
            return (
              <button
                key={kind}
                type="button"
                className={`task-menu-quick-row task-menu-quick-row--${kind}${due === iso ? ' is-on' : ''}`}
                aria-pressed={due === iso}
                onClick={() => onChange({ due: iso })}
              >
                <Icon size={13} className="task-menu-quick-icon" />
                <span className="task-menu-quick-label">{quickLabels[kind]}</span>
                <span className="task-menu-quick-hint">{format(date, 'EEE d', { locale: dateLocale })}</span>
              </button>
            )
          })}
        </div>
        <div className="task-menu-fields">
          <div className="task-menu-field">
            <button
              type="button"
              tabIndex={-1}
              className="task-menu-field-icon"
              aria-label={t.editor.task.date}
              onClick={() => openPicker(dateRef.current)}
            >
              <Calendar size={13} />
            </button>
            <input
              ref={dateRef}
              type="date"
              aria-label={t.editor.task.date}
              value={draftDue}
              onChange={(e) => {
                const value = e.target.value
                setDraftDue(value)
                if (isCommittableDue(value) && value !== due) onChange({ due: value })
              }}
              // An incomplete/emptied date isn't written: back to the task's value
              // ("Clear" removes the deadline).
              onBlur={() => setDraftDue(due ?? '')}
            />
          </div>
          <div className={`task-menu-field${due ? '' : ' is-disabled'}`}>
            <button
              type="button"
              tabIndex={-1}
              className="task-menu-field-icon"
              aria-label={t.editor.task.alarm}
              disabled={!due}
              onClick={() => openPicker(timeRef.current)}
            >
              <AlarmClock size={13} />
            </button>
            <input
              ref={timeRef}
              type="time"
              aria-label={t.editor.task.alarm}
              value={draftAlarm}
              disabled={!due}
              onChange={(e) => {
                const value = e.target.value
                setDraftAlarm(value)
                if (value && value !== alarm) onChange({ alarm: value })
              }}
              onBlur={() => setDraftAlarm(alarm ?? '')}
            />
            {alarm && due && (
              <button
                type="button"
                className="task-menu-field-clear"
                title={t.editor.task.removeAlarm}
                aria-label={t.editor.task.removeAlarm}
                onClick={() => onChange({ alarm: null })}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="task-menu-foot">
        {due || importance ? (
          <button
            type="button"
            className="task-menu-clear-all"
            onClick={() => onChange({ due: null, alarm: null, importance: null })}
          >
            {t.editor.task.clearAll}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="task-menu-done" onClick={() => onClose(true)}>
          {t.editor.task.done}
        </button>
      </div>
    </div>,
    document.body,
  )
}
