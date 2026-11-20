import { useRef } from 'react'
import { Bot } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { agentChipAction, agentStateTone, type AgentChipAction } from '../../lib/agentTaskUi'
import { agentStateLabel, useAgentDisplayState } from './useAgentTask'
import './agentTasks.css'

// The agent chip of a task (a task list item or a kanban card): ONE control,
// same pattern as the deadline / importance trigger next to it —
//   - no marker: a hover-only icon, and only with the feature on (`canQueue`;
//     the callers do not even mount this then: no store subscription per task);
//     a click hands the task to the agents (no menu in between);
//   - queued: the chip; a click takes the task back;
//   - any other state: the chip; a click opens the report menu
//     (AgentReportPopover).
// A task that carries a marker shows its chip whatever the feature's switch
// says (it arrived by sync): only the "hand over" icon depends on it.

/** The state chip itself: the theme's colour for the state, the robot and the state's name. */
export function AgentBadge({ state }: { state: string }) {
  const t = useT()
  const tone = agentStateTone(state)
  return (
    <span className={`task-badge agent-chip agent-chip--${tone}`}>
      <Bot size={11} className="agent-chip-icon" aria-hidden />
      {tone === 'running' && <span className="agent-chip-live" aria-hidden />}
      {/* A state this version has no name for (a newer client's) shows as written. */}
      <span className="agent-chip-label">{tone === 'unknown' ? state : agentStateLabel(t, tone)}</span>
    </span>
  )
}

interface AgentTaskTriggerProps {
  agentId: string | null | undefined
  agentState: string | null | undefined
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
  onAction: (action: AgentChipAction, trigger: HTMLElement) => void
}

export function AgentTaskTrigger({
  agentId, agentState, canQueue, editable, open, className, iconSize = 14, iconClassName, onAction,
}: AgentTaskTriggerProps) {
  const t = useT()
  const display = useAgentDisplayState(agentId, agentState)
  // Whether the report was open when the button was pressed: that press already
  // closed it (the menu's own dismiss), so the click that follows must not reopen it.
  const openOnPress = useRef(false)

  const action = agentChipAction(agentId, agentState)
  if (action === 'queue' && !canQueue) return null

  const tone = display ? agentStateTone(display) : null
  const stateName = display && tone ? (tone === 'unknown' ? display : agentStateLabel(t, tone)) : ''
  const title =
    action === 'queue' ? t.editor.agentTask.queue
      : action === 'unqueue' && editable ? t.editor.agentTask.unqueue
        : action === 'unqueue' ? stateName
          : tf(t.editor.agentTask.openReport, { state: stateName })

  return (
    <button
      type="button"
      contentEditable={false}
      className={`${className} agent-task-trigger${display ? ' has-value' : ''}${open ? ' is-open' : ''}`}
      disabled={action === 'unqueue' && !editable}
      title={title}
      aria-label={title}
      aria-haspopup={action === 'report' ? 'dialog' : undefined}
      aria-expanded={action === 'report' ? open : undefined}
      onMouseDown={() => { openOnPress.current = open }}
      onClick={(e) => {
        if (openOnPress.current) {
          openOnPress.current = false
          return
        }
        onAction(action, e.currentTarget)
      }}
    >
      {display ? <AgentBadge state={display} /> : <Bot size={iconSize} className={iconClassName} aria-hidden />}
    </button>
  )
}
