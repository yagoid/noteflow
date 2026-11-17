import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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
  /** Writes a change to the task (importance, shortcuts and clearing at once;
   *  the date/alarm fields on blur, Enter or closing). */
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
 * medium/high), deadline (shortcuts + date) and its alarm, plus clearing.
 * Importance, the shortcuts and clearing are written at once (the chips next to
 * the task update live); the native date/time fields keep a draft that is
 * written on blur, Enter and when the menu closes ("Done", Escape, a click
 * outside). Placed with taskMenuPosition from its measured size, re-placed on
 * scroll/resize.
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

  const doneRef = useRef<HTMLButtonElement>(null)

  // The native date/time inputs keep a draft, written only on blur, Enter or
  // close: Chromium reports every segment typed (partial years like 0002; an
  // alarm going 18:00 -> 14:00 -> 14:03 -> 14:30), and each write saves the note
  // and reschedules alarms, so an intermediate time already past would fire a
  // false "overdue" alarm. The drafts follow the task when it changes.
  const [draftDue, setDraftDue] = useState(due ?? '')
  const [draftAlarm, setDraftAlarm] = useState(alarm ?? '')
  const [synced, setSynced] = useState({ due, alarm })
  if (synced.due !== due || synced.alarm !== alarm) {
    setSynced({ due, alarm })
    setDraftDue(due ?? '')
    setDraftAlarm(alarm ?? '')
  }
  // What the task holds, updated at once on commit so a blur right after a
  // close (or the reverse) never writes the same value twice.
  const written = useRef({ due, alarm })
  useLayoutEffect(() => {
    written.current = { due, alarm }
  }, [due, alarm])
  const closed = useRef(false)

  /** Writes the valid field drafts that differ from the task. */
  function commitDrafts() {
    const patch: Partial<TaskMenuValues> = {}
    let nextDue = written.current.due
    if (isCommittableDue(draftDue) && draftDue !== nextDue) {
      patch.due = draftDue
      nextDue = draftDue
    }
    if (nextDue && draftAlarm && draftAlarm !== written.current.alarm) patch.alarm = draftAlarm
    if (patch.due === undefined && patch.alarm === undefined) return
    written.current = { ...written.current, ...patch }
    onChange(patch)
  }

  /** Every close goes through here: the field drafts are written first. */
  function close(fromKeyboard: boolean) {
    if (closed.current) return
    closed.current = true
    commitDrafts()
    onClose(fromKeyboard)
  }
  // useDismiss gets a stable callback (no re-subscribing on every render) that
  // reaches the latest close, and so the latest drafts.
  const closeRef = useRef(close)
  useLayoutEffect(() => {
    closeRef.current = close
  })
  const dismiss = useCallback((reason: DismissReason) => closeRef.current(reason === 'escape'), [])
  useDismiss(popoverRef, trigger, dismiss)

  // A clear button disappears once used: keep the focus in the menu (on "Done")
  // so Tab stays trapped and keys like Delete don't reach the app.
  function clearAndKeepFocus(patch: Partial<TaskMenuValues>) {
    const { due: nextDue = written.current.due, alarm: nextAlarm = written.current.alarm } = patch
    written.current = { due: nextDue, alarm: nextAlarm }
    onChange(patch)
    doneRef.current?.focus()
  }

  // On blur, write the field if valid, else show the task's value again.
  function onFieldBlur() {
    if (closed.current) return
    commitDrafts()
    if (!isCommittableDue(draftDue)) setDraftDue(written.current.due ?? '')
    if (!draftAlarm) setDraftAlarm(written.current.alarm ?? '')
  }
  // The alarm needs a date: the task's, or a valid one being typed.
  const alarmEnabled = !!due || isCommittableDue(draftDue)

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
    // Enter in a field: write it and close.
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      close(true)
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


  return createPortal(
    <div
      ref={popoverRef}
      className="task-menu"
      role="dialog"
      aria-label={t.editor.task.menu}
      // Focusable root: a click on the menu's background keeps the focus inside.
      tabIndex={-1}
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
                title={level ? importanceLabels[level] : t.editor.task.importanceNone}
                aria-label={level ? importanceLabels[level] : t.editor.task.importanceNone}
                onClick={() => onChange({ importance: level })}
              >
                {level ? (
                  <>
                    <span className={`task-importance-dot task-importance-dot--${level}`} />
                    <span className="task-menu-seg-text">{importanceLabels[level]}</span>
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
            <button
              type="button"
              className="task-menu-head-action"
              onClick={() => clearAndKeepFocus({ due: null, alarm: null })}
            >
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
              onChange={(e) => setDraftDue(e.target.value)}
              // An incomplete/emptied date isn't written ("Clear" removes the deadline).
              onBlur={onFieldBlur}
            />
          </div>
          <div className={`task-menu-field${alarmEnabled ? '' : ' is-disabled'}`}>
            <button
              type="button"
              tabIndex={-1}
              className="task-menu-field-icon"
              aria-label={t.editor.task.alarm}
              disabled={!alarmEnabled}
              onClick={() => openPicker(timeRef.current)}
            >
              <AlarmClock size={13} />
            </button>
            <input
              ref={timeRef}
              type="time"
              aria-label={t.editor.task.alarm}
              value={draftAlarm}
              disabled={!alarmEnabled}
              onChange={(e) => setDraftAlarm(e.target.value)}
              onBlur={onFieldBlur}
            />
            {alarm && due && (
              <button
                type="button"
                className="task-menu-field-clear"
                title={t.editor.task.removeAlarm}
                aria-label={t.editor.task.removeAlarm}
                onClick={() => clearAndKeepFocus({ alarm: null })}
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
            onClick={() => clearAndKeepFocus({ due: null, alarm: null, importance: null })}
          >
            {t.editor.task.clearAll}
          </button>
        ) : (
          <span />
        )}
        <button ref={doneRef} type="button" className="task-menu-done" onClick={() => close(true)}>
          {t.editor.task.done}
        </button>
      </div>
    </div>,
    document.body,
  )
}
