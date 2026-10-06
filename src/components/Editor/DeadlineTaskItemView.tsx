import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { Calendar, Flag } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import {
  DEADLINE_POPOVER_SIZE,
  IMPORTANCE_POPOVER_SIZE,
  badgeColorClass,
  formatBadgeDate,
  popoverPosition,
  type Importance,
} from './taskBadge'
import { DeadlinePopover, ImportancePopover } from './TaskPickers'

interface OpenPicker {
  kind: 'deadline' | 'importance'
  trigger: HTMLElement
  pos: { top: number; left: number }
  /** Bumped on every open so a re-open re-seeds the picker's drafts. */
  id: number
}

export function DeadlineTaskItemView({ node, updateAttributes }: NodeViewProps) {
  const t = useT()
  const { checked, due, alarm, importance } = node.attrs as {
    checked: boolean
    due: string | null
    alarm: string | null
    importance: Importance | null
  }

  const importanceLabels: Record<Importance, string> = {
    low: t.editor.task.importanceLow,
    medium: t.editor.task.importanceMedium,
    high: t.editor.task.importanceHigh,
  }

  // The open picker (deadline or importance) and the trigger it hangs from.
  // Pickers live in TaskPickers.tsx (shared with kanban cards).
  const [picker, setPicker] = useState<OpenPicker | null>(null)
  const [isSticky, setIsSticky] = useState(false)
  const wrapperRef = useRef<HTMLElement>(null)
  const pickerSeq = useRef(0)

  // Detect if we're inside a sticky-editor
  useEffect(() => {
    const el = wrapperRef.current
    if (el) setIsSticky(!!el.closest('.sticky-editor'))
  }, [])

  function openPicker(kind: OpenPicker['kind'], trigger: HTMLElement) {
    const size = kind === 'deadline' ? DEADLINE_POPOVER_SIZE : IMPORTANCE_POPOVER_SIZE
    setPicker({ kind, trigger, pos: popoverPosition(trigger, size), id: ++pickerSeq.current })
  }
  const closePicker = () => setPicker(null)

  return (
    <NodeViewWrapper
      as="li"
      ref={wrapperRef}
      data-type="taskItem"
      data-checked={String(checked)}
    >
      <label className="task-checkbox-label" contentEditable={false}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => updateAttributes({ checked: !checked })}
        />
      </label>

      <div className="task-item-body group">
        <NodeViewContent as="div" className="task-content" />

        <div className="task-actions" contentEditable={false}>
          <button
            contentEditable={false}
            className={`task-importance-trigger${importance ? ' has-importance' : ''}`}
            onClick={(e) => openPicker('importance', e.currentTarget)}
            title={importance ? tf(t.editor.task.importanceTooltip, { level: importanceLabels[importance] }) : t.editor.task.setImportance}
            type="button"
          >
            {importance ? (
              <span className={`task-importance-dot task-importance-dot--${importance}`} />
            ) : (
              <Flag size={14} className="task-importance-icon" />
            )}
          </button>

          <button
            contentEditable={false}
            className={`task-deadline-trigger${due ? ' has-due' : ''}`}
            onClick={(e) => openPicker('deadline', e.currentTarget)}
            title={due ? `${tf(t.editor.task.deadlineTooltip, { date: due })}${alarm ? ' ⏰' + alarm : ''}` : t.editor.task.setDeadline}
            type="button"
          >
            {due ? (
              <span className={`task-badge ${badgeColorClass(due)}`}>
                📅 {formatBadgeDate(due)}
                {alarm && !isSticky && <> ⏰{alarm}</>}
              </span>
            ) : (
              <Calendar size={14} className="task-deadline-icon" />
            )}
          </button>
        </div>
      </div>

      {picker?.kind === 'deadline' && (
        <DeadlinePopover
          // Re-seed the drafts each time it's (re)opened from the trigger.
          key={picker.id}
          pos={picker.pos}
          trigger={picker.trigger}
          due={due}
          alarm={alarm}
          onCommit={(nextDue, nextAlarm) => { updateAttributes({ due: nextDue, alarm: nextAlarm }); closePicker() }}
          onClear={() => { updateAttributes({ due: null, alarm: null }); closePicker() }}
          onClose={closePicker}
        />
      )}

      {picker?.kind === 'importance' && (
        <ImportancePopover
          pos={picker.pos}
          trigger={picker.trigger}
          importance={importance}
          onSelect={(value) => { updateAttributes({ importance: value }); closePicker() }}
          onClose={closePicker}
        />
      )}
    </NodeViewWrapper>
  )
}
