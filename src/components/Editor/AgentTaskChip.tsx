import { useId, useRef, type ReactNode } from 'react'
import { Bot } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { agentBoxGlyph, agentCheckEffect, agentChipAction, agentStateTone, type AgentChipAction } from '../../lib/agentTaskUi'
import { agentStateLabel, useAgentDisplayState, useAgentHandName, useAgentRunVisible } from './useAgentTask'
import { AgentStateGlyph, AgentTaskBoxGlyph } from './AgentGlyphs'
import { TaskHint } from './TaskHint'
import { useTaskHint } from './useTaskHint'
import './agentTasks.css'

// The agent state of a task (a task list item or a kanban card) — ONE control
// per task, in one of two places:
//   - IN its checkbox (AgentTaskBox) when the state reads without words:
//     running with the box unticked (its border runs), done with the box
//     ticked (tick + spark) — lib/agentTaskUi.ts → agentBoxGlyph. A click on
//     that box opens the report and never toggles it; no chip then.
//   - Right of the text (AgentTaskTrigger), with the deadline trigger:
//       - no marker: a hover-only robot, and only with the feature on
//         (`canQueue`; the callers do not even mount it then: no store
//         subscription per task); a click hands the task to the agents. In a
//         task list (`hint`) it explains itself with a hint card (TaskHint)
//         instead of the native tooltip;
//       - queued: the text chip; a click takes the task back;
//       - any other state: the text chip; a click opens the report menu
//         (AgentReportPopover).
// A task that carries a marker shows its state whatever the feature's switch
// says (it arrived by sync): only the "hand over" icon depends on it.

/** The text chip of a state: its orbit glyph and its name, in the state's colour. */
export function AgentBadge({ state }: { state: string }) {
  const t = useT()
  const tone = agentStateTone(state)
  return (
    <span className={`agent-chip agent-tone--${tone}`}>
      <AgentStateGlyph tone={tone} size={11} />
      {/* A state this version has no name for (a newer client's) shows as written. */}
      <span className="agent-chip-label">{tone === 'unknown' ? state : agentStateLabel(t, tone)}</span>
    </span>
  )
}

/** The name of the state shown for a marker ('' without one). */
function useStateName(display: string | null): string {
  const t = useT()
  if (!display) return ''
  const tone = agentStateTone(display)
  return tone === 'unknown' ? display : agentStateLabel(t, tone)
}

/**
 * A press on a control whose report is open already closed it (the menu's own
 * dismiss): the click that follows must not reopen it.
 */
function usePressGuard(open: boolean) {
  const openOnPress = useRef(false)
  return {
    onMouseDown: () => { openOnPress.current = open },
    /** False when this click belongs to the press that closed the report. */
    consume: () => {
      if (!openOnPress.current) return true
      openOnPress.current = false
      return false
    },
  }
}

interface AgentTaskTriggerProps {
  agentId: string | null | undefined
  agentState: string | null | undefined
  /** The task's box is ticked: a running / done state may be drawn in the box instead (AgentTaskBox), and then this renders nothing. */
  checked?: boolean
  /** The feature is on and the task can be edited: the hover-only "hand to an agent" icon may show. */
  canQueue: boolean
  /** The task can be edited: a queued task can be taken back. (The report opens either way.) */
  editable: boolean
  /** The report menu of this task is open. */
  open: boolean
  /** Classes of the button: the list item's trigger or the kanban card's. */
  className: string
  /** Size of the hover-only icon. */
  iconSize?: number
  iconClassName?: string
  /** The hover-only icon explains itself with a hint card (TaskHint) instead of the native tooltip: a task list item's. */
  hint?: boolean
  /** The note is encrypted: it keeps no reports, so the line's state shows as it is (useAgentDisplayState). */
  encrypted?: boolean
  onAction: (action: AgentChipAction, trigger: HTMLElement) => void
}

export function AgentTaskTrigger({
  agentId, agentState, checked = false, canQueue, editable, open, className, iconSize = 14, iconClassName, hint = false, encrypted = false, onAction,
}: AgentTaskTriggerProps) {
  const t = useT()
  const display = useAgentDisplayState(agentId, agentState, encrypted)
  const stateName = useStateName(display)
  const guard = usePressGuard(open)

  const action = agentChipAction(agentId, agentState)
  // The hint card: only for the "hand over" icon of a task list item.
  const withHint = hint && action === 'queue' && canQueue
  const agentName = useAgentHandName(t, withHint)
  const hintState = useTaskHint(open)
  const hintTextId = useId()

  if (action === 'queue' && !canQueue) return null
  // Drawn in the task's own box (AgentTaskBox): no chip.
  if (display && agentBoxGlyph(agentStateTone(display), checked)) return null

  const queueTitle = agentName ? tf(t.editor.agentTask.queueTo, { agent: agentName }) : t.editor.agentTask.queue
  const title =
    action === 'queue' ? queueTitle
      : action === 'unqueue' && editable ? t.editor.agentTask.unqueue
        : action === 'unqueue' ? stateName
          : tf(t.editor.agentTask.openReport, { state: stateName })
  const hintAnchor = withHint ? hintState.anchor : null

  return (
    <>
      <button
        type="button"
        contentEditable={false}
        className={`${className} agent-task-trigger${display ? ' has-value' : ''}${open ? ' is-open' : ''}`}
        disabled={action === 'unqueue' && !editable}
        title={withHint ? undefined : title}
        aria-label={title}
        aria-describedby={hintAnchor ? hintTextId : undefined}
        aria-haspopup={action === 'report' ? 'dialog' : undefined}
        aria-expanded={action === 'report' ? open : undefined}
        {...(withHint ? hintState.triggerProps : {})}
        onMouseDown={guard.onMouseDown}
        onClick={(e) => { if (guard.consume()) onAction(action, e.currentTarget) }}
      >
        {display ? <AgentBadge state={display} /> : <Bot size={iconSize} className={iconClassName} aria-hidden />}
      </button>
      {hintAnchor && <AgentQueueHint anchor={hintAnchor} title={queueTitle} textId={hintTextId} />}
    </>
  )
}

/**
 * The hint card of the "hand over" icon: who gets the task, then how it starts — with Run, or
 * only by copying the prompt where Run is not offered (the queue bar's own rule,
 * useAgentRunVisible). Mounted only while it shows: no task follows those settings otherwise.
 */
function AgentQueueHint({ anchor, title, textId }: { anchor: HTMLElement; title: string; textId: string }) {
  const t = useT()
  const s = t.editor.agentTask
  const runVisible = useAgentRunVisible()
  const text = runVisible ? tf(s.queueHintRun, { run: s.run.label }) : s.queueHintCopy
  return <TaskHint anchor={anchor} title={title} text={text} textId={textId} />
}

interface AgentTaskBoxProps {
  agentId: string
  agentState: string
  checked: boolean
  /** The report menu of this task is open. */
  open: boolean
  /** Classes of the wrapper: the list item's `<label>` or the kanban card's. */
  className: string
  /** The plain checkbox, rendered when the state is not drawn in the box. */
  children: ReactNode
  /** Opens the report, hung from the box (its left edge: AgentReportPopover). */
  onOpenReport: (trigger: HTMLElement) => void
  /** The note is encrypted: the line's state shows as it is (useAgentDisplayState). */
  encrypted?: boolean
}

/**
 * The checkbox of a task that carries an agent marker: the plain one
 * (`children`), or — running / done, agentBoxGlyph — the box drawn with its
 * state, a button that opens the report. A task an agent is still on whose
 * state is a chip (waiting: "Needs you") keeps a plain-looking box that opens
 * the report too and never ticks (agentCheckEffect 'blocked'). Only mounted
 * for a task WITH a marker: a task without one renders its plain checkbox, no
 * store subscription.
 */
export function AgentTaskBox({ agentId, agentState, checked, open, className, children, onOpenReport, encrypted = false }: AgentTaskBoxProps) {
  const t = useT()
  const display = useAgentDisplayState(agentId, agentState, encrypted)
  const stateName = useStateName(display)
  const guard = usePressGuard(open)
  const kind = display ? agentBoxGlyph(agentStateTone(display), checked) : null
  const title = tf(t.editor.agentTask.openReport, { state: stateName })
  if (!kind && display && !checked && agentCheckEffect(display) === 'blocked') {
    return (
      <label className={className} contentEditable={false} title={title}>
        <input
          type="checkbox"
          checked={false}
          readOnly
          data-agent-anchor="start"
          aria-label={title}
          aria-haspopup="dialog"
          aria-expanded={open}
          onMouseDown={guard.onMouseDown}
          onClick={(e) => {
            // Never ticked: ticking would take the task from its agent.
            e.preventDefault()
            if (guard.consume()) onOpenReport(e.currentTarget)
          }}
        />
      </label>
    )
  }
  if (!kind) return <>{children}</>
  return (
    <label className={`${className} agent-box-label`} contentEditable={false}>
      <button
        type="button"
        className={`agent-box agent-box--${kind}${open ? ' is-open' : ''}`}
        data-agent-anchor="start"
        title={title}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={guard.onMouseDown}
        onClick={(e) => {
          // A label around a button: keep the click to the button alone.
          e.preventDefault()
          if (guard.consume()) onOpenReport(e.currentTarget)
        }}
      >
        <AgentTaskBoxGlyph kind={kind} />
      </button>
    </label>
  )
}
