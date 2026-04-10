import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Calendar } from 'lucide-react'

function badgeColorClass(due: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (due < today) return 'task-badge--overdue'
  if (due === today) return 'task-badge--today'
  return 'task-badge--future'
}

function formatBadgeDate(due: string): string {
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function DeadlineTaskItemView({ node, updateAttributes }: NodeViewProps) {
  const { checked, due, alarm } = node.attrs as {
    checked: boolean
    due: string | null
    alarm: string | null
  }

  const [popoverOpen, setPopoverOpen] = useState(false)
  const [draftDue, setDraftDue] = useState<string>(due ?? '')
  const [draftAlarm, setDraftAlarm] = useState<string>(alarm ?? '')
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Sync drafts when attrs change externally
  useEffect(() => {
    setDraftDue(due ?? '')
    setDraftAlarm(alarm ?? '')
  }, [due, alarm])

  // Close popover on click-outside
  useEffect(() => {
    if (!popoverOpen) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverOpen])

  // Close popover on Escape
  useEffect(() => {
    if (!popoverOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [popoverOpen])

  function openPopover() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popH = 148
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow > popH ? rect.bottom + 4 : rect.top - popH - 4
    // Keep popover inside horizontal viewport
    const left = Math.min(rect.left, window.innerWidth - 230)
    setPopoverPos({ top, left })
    setDraftDue(due ?? '')
    setDraftAlarm(alarm ?? '')
    setPopoverOpen(true)
  }

  function commit() {
    updateAttributes({
      due: draftDue || null,
      alarm: draftDue && draftAlarm ? draftAlarm : null,
    })
    setPopoverOpen(false)
  }

  function clear() {
    updateAttributes({ due: null, alarm: null })
    setDraftDue('')
    setDraftAlarm('')
    setPopoverOpen(false)
  }

  return (
    <NodeViewWrapper
      as="li"
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

        <button
          ref={triggerRef}
          contentEditable={false}
          className={`task-deadline-trigger${due ? ' has-due' : ''}`}
          onClick={openPopover}
          title={due ? `Deadline: ${due}${alarm ? ' ⏰' + alarm : ''}` : 'Set deadline'}
          type="button"
        >
          {due ? (
            <span className={`task-badge ${badgeColorClass(due)}`}>
              📅 {formatBadgeDate(due)}
              {alarm && <> ⏰{alarm}</>}
            </span>
          ) : (
            <Calendar size={14} className="task-deadline-icon" />
          )}
        </button>
      </div>

      {popoverOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="task-deadline-popover"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            contentEditable={false}
          >
            <div className="task-deadline-popover-row">
              <label>Date</label>
              <input
                type="date"
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="task-deadline-popover-row">
              <label>Alarm</label>
              <input
                type="time"
                value={draftAlarm}
                disabled={!draftDue}
                onChange={(e) => setDraftAlarm(e.target.value)}
              />
            </div>
            <div className="task-deadline-popover-actions">
              <button type="button" onClick={clear} className="task-deadline-btn-clear">
                Clear
              </button>
              <button type="button" onClick={commit} className="task-deadline-btn-done">
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  )
}
