import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n/useT'
import { IMPORTANCE_VALUES, todayISO, type Importance } from './taskBadge'

// The deadline (📅 date + ⏰ alarm) and importance (🔺) pickers shared by task
// list items (DeadlineTaskItemView) and kanban cards (KanbanBoardView). Both are
// portalled to <body> and `position: fixed` at `pos` (compute it with
// popoverPosition from taskBadge.ts); they close on click outside (except on
// their trigger, which toggles them itself) and on Escape.

function useDismiss(
  popoverRef: React.RefObject<HTMLDivElement | null>,
  trigger: HTMLElement | null,
  onClose: () => void,
) {
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target) || trigger?.contains(target)) return
      onClose()
    }
    // Capture phase on window: the note editor stops keydown propagation (React
    // bubbling reaches it even from this portal), so a bubbling listener on
    // document would never see the Escape typed in the picker's inputs.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
