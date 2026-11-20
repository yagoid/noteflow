import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { CalendarClock, GripVertical } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { badgeColorClass, formatBadgeDate, type Importance } from './taskBadge'
import { TaskMenuPopover } from './TaskPickers'
import { startTaskDrag } from './taskDrag'
import { setTaskChecked } from './taskToggle'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { altKey } from '../../lib/platform'
import type { AgentChipAction } from '../../lib/agentTaskUi'
import { AgentTaskTrigger } from './AgentTaskChip'
import { AgentReportPopover } from './AgentReportPopover'
import { dismissAgentReport, newAgentTaskIdFor, reconcileAgentReport, useAgentTasksEnabled } from './useAgentTask'

export function DeadlineTaskItemView({ node, editor, getPos, updateAttributes, extension }: NodeViewProps) {
  const t = useT()
  // Plain Markdown (a linked note): a regular checkbox item, no 📅⏰🔺 pickers.
  const plain = !!(extension.options as { plain?: boolean }).plain
  const { checked, due, alarm, importance, agentId, agentState } = node.attrs as {
    checked: boolean
    due: string | null
    alarm: string | null
    importance: Importance | null
    agentId: string | null
    agentState: string | null
  }

  const importanceLabels: Record<Importance, string> = {
    low: t.editor.task.importanceLow,
    medium: t.editor.task.importanceMedium,
    high: t.editor.task.importanceHigh,
  }

  // The trigger the task menu (importance + deadline, TaskPickers.tsx) hangs
  // from while it's open — the single button right of the text.
  const [menuTrigger, setMenuTrigger] = useState<HTMLElement | null>(null)
  const [isSticky, setIsSticky] = useState(false)
  const wrapperRef = useRef<HTMLElement>(null)
  // Whether the menu was open when the trigger was pressed: that press already
  // closed it (through the menu's own close, which writes its field drafts), so
  // the click that follows must not reopen it.
  const openOnPress = useRef(false)

  // Agent tasks (AgentTaskChip.tsx): the chip next to the deadline trigger and
  // the report menu it opens.
  const agentEnabled = useAgentTasksEnabled()
  const [reportTrigger, setReportTrigger] = useState<HTMLElement | null>(null)

  // Detect if we're inside a sticky-editor
  useEffect(() => {
    const el = wrapperRef.current
    if (el) setIsSticky(!!el.closest('.sticky-editor'))
  }, [])

  // Closed from the keyboard (Escape/Enter/"Done"): the focus goes back to the
  // text, where it was before opening. A click outside leaves it where it lands.
  function closeMenu(fromKeyboard: boolean) {
    setMenuTrigger(null)
    if (fromKeyboard && editor.isEditable) editor.view.focus()
  }

  const triggerTitle = [
    importance && tf(t.editor.task.importanceTooltip, { level: importanceLabels[importance] }),
    due && `${tf(t.editor.task.deadlineTooltip, { date: due })}${alarm ? ' ⏰' + alarm : ''}`,
  ].filter(Boolean).join(' · ') || t.editor.task.menu

  // Checkbox: with "Move checked items to the bottom" (Settings → Editor) the
  // task also moves, in the same transaction, and slides there (taskToggle.ts).
  // The setting is read at click time: no re-render of every task when it changes.
  function toggleChecked() {
    const pos = getPos()
    if (typeof pos !== 'number') return
    // Ticking a task an agent left "to review" is the review: it becomes done —
    // in the SAME transaction as the box (one undo takes back both).
    const reviewed = !checked && !!agentId && agentState === 'review'
    setTaskChecked(editor, pos, !checked, useEditorSettingsStore.getState().moveCheckedToBottom, reviewed ? { agentState: 'done' } : undefined)
    if (reviewed && agentId) reconcileAgentReport(editor, agentId)
  }

  /** Takes the task away from the agents: the marker leaves the line first, then its report goes. */
  function dismissAgentTask() {
    const id = agentId
    updateAttributes({ agentId: null, agentState: null })
    if (id) dismissAgentReport(editor, id)
  }

  function onAgentAction(action: AgentChipAction, trigger: HTMLElement) {
    if (action === 'report') {
      setReportTrigger(trigger)
      return
    }
    if (!editor.isEditable) return
    if (action === 'unqueue') {
      dismissAgentTask()
      return
    }
    // Hand the task over: a fresh id (made here, see newAgentTaskIdFor) and the marker.
    updateAttributes({ agentId: newAgentTaskIdFor(editor), agentState: 'queued' })
  }

  /** "Mark as done": the state and the box in ONE transaction (one undo takes back both). */
  function markAgentTaskDone() {
    const pos = getPos()
    if (typeof pos !== 'number') return
    if (checked) updateAttributes({ agentState: 'done' })
    else setTaskChecked(editor, pos, true, useEditorSettingsStore.getState().moveCheckedToBottom, { agentState: 'done' })
    if (agentId) reconcileAgentReport(editor, agentId)
  }

  /** "Back to the queue": queued and unticked, one transaction. */
  function requeueAgentTask() {
    updateAttributes({ agentState: 'queued', checked: false })
    if (agentId) reconcileAgentReport(editor, agentId)
  }

  function closeReport(fromKeyboard: boolean) {
    setReportTrigger(null)
    if (fromKeyboard && editor.isEditable) editor.view.focus()
  }

  return (
    <NodeViewWrapper
      as="li"
      ref={wrapperRef}
      data-type="taskItem"
      data-checked={String(checked)}
    >
      {/* Drag handle: out of the flow, in the gutter left of the checkbox (index.css),
          so it never pushes the text. A <button> so ProseMirror's NodeView stopEvent
          leaves the press alone; mousedown is prevented to keep the editor's focus
          and selection. Not in read-only editors. */}
      {editor.isEditable && (
        <button
          type="button"
          className="task-drag-handle"
          contentEditable={false}
          tabIndex={-1}
          title={tf(t.editor.task.dragHandle, { keys: `${altKey}+↑/↓` })}
          aria-label={tf(t.editor.task.dragHandle, { keys: `${altKey}+↑/↓` })}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => startTaskDrag(editor, getPos, e.nativeEvent, wrapperRef.current)}
        >
          <GripVertical size={12} />
        </button>
      )}

      <label className="task-checkbox-label" contentEditable={false}>
        <input
          type="checkbox"
          checked={checked}
          onChange={toggleChecked}
        />
      </label>

      <div className="task-item-body group">
        <NodeViewContent as="div" className="task-content" />

        {!plain && <div className="task-actions" contentEditable={false}>
          {/* One trigger for importance + deadline: the chips of the values set
              (always visible), or a hover-only icon when there are none. */}
          <button
            contentEditable={false}
            className={`task-meta-trigger${due || importance ? ' has-value' : ''}${menuTrigger ? ' is-open' : ''}`}
            onMouseDown={() => { openOnPress.current = !!menuTrigger }}
            onClick={(e) => {
              if (openOnPress.current) {
                openOnPress.current = false
                return
              }
              setMenuTrigger(e.currentTarget)
            }}
            title={triggerTitle}
            aria-label={triggerTitle}
            aria-haspopup="dialog"
            aria-expanded={!!menuTrigger}
            type="button"
          >
            {importance && (
              <span className={`task-importance-dot task-importance-dot--${importance}`} />
            )}
            {due && (
              <span className={`task-badge ${badgeColorClass(due)}`}>
                📅 {formatBadgeDate(due)}
                {alarm && !isSticky && <> ⏰{alarm}</>}
              </span>
            )}
            {!due && !importance && <CalendarClock size={14} className="task-meta-icon" />}
          </button>
          {/* Agent task: same pattern — the state chip (always visible), or a
              hover-only icon that hands the task to the agents (feature on). */}
          {/* Not even mounted for a task without a marker while the feature is off. */}
          {(agentId || (agentEnabled && editor.isEditable && !checked)) && (
            <AgentTaskTrigger
              agentId={agentId}
              agentState={agentState}
              canQueue={agentEnabled && editor.isEditable && !checked}
              editable={editor.isEditable}
              open={!!reportTrigger}
              className="task-meta-trigger"
              iconClassName="task-meta-icon"
              onAction={onAgentAction}
            />
          )}
        </div>}
      </div>

      {menuTrigger && (
        <TaskMenuPopover
          trigger={menuTrigger}
          due={due}
          alarm={alarm}
          importance={importance}
          onChange={(patch) => updateAttributes(patch)}
          onClose={closeMenu}
        />
      )}

      {reportTrigger && agentId && agentState && (
        <AgentReportPopover
          trigger={reportTrigger}
          agentId={agentId}
          agentState={agentState}
          title={node.firstChild?.textContent ?? ''}
          checked={checked}
          editable={editor.isEditable}
          onMarkDone={markAgentTaskDone}
          onRequeue={requeueAgentTask}
          onDismiss={dismissAgentTask}
          onClose={closeReport}
        />
      )}
    </NodeViewWrapper>
  )
}
