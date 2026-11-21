import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect, useId } from 'react'
import { CalendarClock, GripVertical } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { Importance } from './taskBadge'
import { TaskDueBadge } from './TaskDueBadge'
import { dueTooltip } from './taskDue'
import { TaskMenuPopover } from './TaskPickers'
import { startTaskDrag } from './taskDrag'
import { setTaskChecked } from './taskToggle'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { altKey } from '../../lib/platform'
import type { AgentChipAction } from '../../lib/agentTaskUi'
import { AgentTaskBox, AgentTaskTrigger } from './AgentTaskChip'
import { AgentReportPopover } from './AgentReportPopover'
import { copyAgentPrompt, dismissAgentReport, newAgentTaskIdFor, prepareAgentRun, reconcileAgentReport, runAgentTasks, useAgentSendAllowed } from './useAgentTask'
import { withTasksQueued, type AgentRunOutcome } from '../../lib/agentRun'
import { TaskHint } from './TaskHint'
import { useTaskHint } from './useTaskHint'
import { observeTaskOwnHeight } from './TaskRowHover'

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
  // The feature is on and the note is one an agent can read (not encrypted).
  const agentEnabled = useAgentSendAllowed(editor)
  const [reportTrigger, setReportTrigger] = useState<HTMLElement | null>(null)

  // The empty trigger's hint card (TaskHint), gone while the menu is open.
  const hint = useTaskHint(!!menuTrigger)
  const hintTextId = useId()

  // The block right of the text, centred on the task's own lines (TaskRowHover.ts
  // writes their height on it: --task-own-h).
  const actionsRef = useRef<HTMLDivElement>(null)

  // Detect if we're inside a sticky-editor
  useEffect(() => {
    const el = wrapperRef.current
    if (el) setIsSticky(!!el.closest('.sticky-editor'))
  }, [])

  useEffect(() => {
    const actions = actionsRef.current
    const content = wrapperRef.current?.querySelector<HTMLElement>(':scope > .task-item-body > .task-content')
    if (!actions || !content) return
    return observeTaskOwnHeight(content, actions)
  }, [])

  // Closed from the keyboard (Escape/Enter/"Done"): the focus goes back to the
  // text, where it was before opening. A click outside leaves it where it lands.
  function closeMenu(fromKeyboard: boolean) {
    setMenuTrigger(null)
    if (fromKeyboard && editor.isEditable) editor.view.focus()
  }

  // With values, the native tooltip says them; empty, the hint card explains the button.
  const hasMeta = !!(due || importance)
  const triggerTitle = [
    importance && tf(t.editor.task.importanceTooltip, { level: importanceLabels[importance] }),
    due && tf(t.editor.task.deadlineTooltip, { date: dueTooltip(t, due, alarm) }),
  ].filter(Boolean).join(' · ') || t.editor.task.hintTitle
  const hintAnchor = hasMeta ? null : hint.anchor

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

  /** "Reopen" (a done task whose box opens the report): unticks the box; the state stays done. */
  function reopenAgentTask() {
    const pos = getPos()
    if (typeof pos !== 'number') return
    setTaskChecked(editor, pos, false, useEditorSettingsStore.getState().moveCheckedToBottom)
  }

  /** "Back to the queue": queued and unticked, one transaction. */
  function requeueAgentTask() {
    updateAttributes({ agentState: 'queued', checked: false })
    if (agentId) reconcileAgentReport(editor, agentId)
  }

  /** "Copy prompt" of the report menu: the task goes back to the queue if it was not there, then its prompt is copied. */
  function copyAgentTaskPrompt(): Promise<boolean> {
    if (!agentId) return Promise.resolve(false)
    if (agentState !== 'queued') requeueAgentTask()
    return copyAgentPrompt(editor, [agentId])
  }

  /**
   * "Run" of the report menu: first everything that can stop it (prepareAgentRun — a run that
   * cannot start leaves the task as it is), then back to the queue if needed, then the agent.
   */
  async function runAgentTask(): Promise<AgentRunOutcome> {
    if (!agentId) return { kind: 'error', code: 'invalid_request' }
    const moved = agentState !== 'queued'
    const blocked = await prepareAgentRun(editor)
    if (blocked) return blocked
    if (moved) requeueAgentTask()
    return withTasksQueued(await runAgentTasks(editor, [agentId]), moved)
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
      // Its menu or report is open: its buttons and line stay (index.css), like the
      // pointer's row (data-row-hover, TaskRowHover.ts).
      data-task-open={menuTrigger || reportTrigger ? '' : undefined}
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

      {/* The checkbox. With an agent marker, running / done is drawn in the box
          itself, which then opens the report instead (AgentTaskBox). */}
      {agentId && agentState && !plain ? (
        <AgentTaskBox
          agentId={agentId}
          agentState={agentState}
          checked={checked}
          open={!!reportTrigger}
          className="task-checkbox-label"
          onOpenReport={setReportTrigger}
        >
          <label className="task-checkbox-label" contentEditable={false}>
            <input type="checkbox" checked={checked} onChange={toggleChecked} />
          </label>
        </AgentTaskBox>
      ) : (
        <label className="task-checkbox-label" contentEditable={false}>
          <input
            type="checkbox"
            checked={checked}
            onChange={toggleChecked}
          />
        </label>
      )}

      <div className="task-item-body group">
        <NodeViewContent as="div" className="task-content" />

        {!plain && <div className="task-actions" contentEditable={false} ref={actionsRef}>
          {/* One trigger for importance + deadline: the chips of the values set
              (always visible), or an icon shown on the task's row (TaskRowHover.ts)
              when there are none, explained by a hint card (TaskHint). */}
          <button
            contentEditable={false}
            className={`task-meta-trigger${hasMeta ? ' has-value' : ''}${menuTrigger ? ' is-open' : ''}`}
            {...(hasMeta ? {} : hint.triggerProps)}
            onMouseDown={() => { openOnPress.current = !!menuTrigger }}
            onClick={(e) => {
              if (openOnPress.current) {
                openOnPress.current = false
                return
              }
              setMenuTrigger(e.currentTarget)
            }}
            title={hasMeta ? triggerTitle : undefined}
            aria-label={triggerTitle}
            aria-describedby={hintAnchor ? hintTextId : undefined}
            aria-haspopup="dialog"
            aria-expanded={!!menuTrigger}
            type="button"
          >
            {importance && (
              <span className={`task-importance-dot task-importance-dot--${importance}`} />
            )}
            {due && <TaskDueBadge due={due} alarm={alarm} showAlarm={!isSticky} />}
            {!hasMeta && <CalendarClock size={17} className="task-meta-icon" />}
          </button>
          {hintAnchor && (
            <TaskHint anchor={hintAnchor} title={t.editor.task.hintTitle} text={t.editor.task.hintText} textId={hintTextId} />
          )}
          {/* Agent task: same pattern — the state chip (always visible), or a
              hover-only icon that hands the task to the agents (feature on). */}
          {/* Not even mounted for a task without a marker while the feature is off. */}
          {(agentId || (agentEnabled && editor.isEditable && !checked)) && (
            <AgentTaskTrigger
              agentId={agentId}
              agentState={agentState}
              checked={checked}
              canQueue={agentEnabled && editor.isEditable && !checked}
              editable={editor.isEditable}
              open={!!reportTrigger}
              className="task-meta-trigger"
              iconSize={17}
              iconClassName="task-meta-icon"
              hint
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
          onReopen={reopenAgentTask}
          onDismiss={dismissAgentTask}
          onCopyPrompt={agentEnabled ? copyAgentTaskPrompt : undefined}
          onRun={agentEnabled ? runAgentTask : undefined}
          onClose={closeReport}
        />
      )}
    </NodeViewWrapper>
  )
}
