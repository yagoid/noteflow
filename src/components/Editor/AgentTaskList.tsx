import { useId, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import {
  agentListStep,
  agentListTasksOfDoc,
  agentTaskListDetail,
  agentTaskListGroups,
  type AgentListGroupKey,
  type AgentListRow,
  type AgentListTask,
} from '../../lib/agentTaskList'
import { agentStateTone, formatAgentDuration } from '../../lib/agentTaskUi'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { AgentStateGlyph } from './AgentGlyphs'
import { agentDisplayStateNow, agentStateLabel } from './useAgentTask'
import './agentTasks.css'

// The list the queue bar's counts open (AgentQueueBar.tsx, its popover): every
// agent task of the section, grouped — needs you, running, no signal, queued,
// then to review / failed / interrupted, and last done (lib/agentTaskList.ts). A row is the
// state's glyph and the task's first line, under it what there is to READ (what
// the agent is doing, its question, how long it has been silent, why it
// failed) and on its right what there is to SEE: how much is done while it
// runs (or how long it has been at it), the place in the queue, how long ago
// it was finished. A press on a
// row goes to the task in the note and opens its report (agentTaskReveal.ts).
// The arrows move between the rows; Enter opens one.

/** The states whose rows step back: nothing is happening to them right now. */
const QUIET: readonly AgentListGroupKey[] = ['queued', 'interrupted', 'done']

function AgentTaskListRow({ row, onPick }: { row: AgentListRow; onPick: (task: AgentListTask) => void }) {
  const t = useT()
  const s = t.editor.agentTask
  const meta = useAgentTasksStore((st) => st.byId[row.task.id]?.meta)
  const now = useAgentTasksStore((st) => st.now)
  const detail = agentTaskListDetail(row.display, meta, now)
  const tone = agentStateTone(row.display)
  const text = row.task.text || s.untitled

  let sub: ReactNode = null
  if (row.display === 'running' && detail.doing) sub = <span className="agent-tasklist-sub">{detail.doing}</span>
  else if (row.display === 'waiting') sub = <span className="agent-tasklist-sub agent-tasklist-ask">{detail.question ?? s.thread.question}</span>
  else if (row.display === 'no-signal' && detail.silentMs !== null) {
    sub = <span className="agent-tasklist-sub">{tf(s.queueBar.silentFor, { time: formatAgentDuration(detail.silentMs) })}</span>
  } else if (row.display === 'failed' && detail.failReason) sub = <span className="agent-tasklist-sub">{detail.failReason}</span>

  let side: ReactNode = null
  if (row.display === 'running' && detail.percent !== null) {
    const label = tf(s.progressLabel, { percent: detail.percent })
    side = (
      <span className="agent-tasklist-meter" title={label}>
        <span className="agent-tasklist-meter-track" aria-hidden>
          <span className="agent-tasklist-meter-fill" style={{ width: `${detail.percent}%` }} />
        </span>
        <span className="agent-tasklist-meter-value" aria-hidden>{tf(s.progressValue, { percent: detail.percent })}</span>
        <span className="agent-sr">{label}</span>
      </span>
    )
  } else if (row.display === 'running' && detail.elapsedMs !== null) {
    const time = formatAgentDuration(detail.elapsedMs)
    side = <span className="agent-tasklist-side" title={tf(s.elapsed, { time })}>{time}</span>
  } else if (row.queuePosition !== null) {
    const label = tf(s.queueBar.queuePosition, { position: row.queuePosition })
    side = (
      <span className="agent-tasklist-side" title={label}>
        <span aria-hidden>{tf(s.queueBar.queuePositionValue, { position: row.queuePosition })}</span>
        <span className="agent-sr">{label}</span>
      </span>
    )
  } else if (row.display === 'done' && detail.finishedMs !== null) {
    const time = formatAgentDuration(detail.finishedMs)
    side = <span className="agent-tasklist-side" title={tf(s.queueBar.finishedAgo, { time })}>{time}</span>
  }

  return (
    <li>
      <button
        type="button"
        className={`agent-tasklist-row agent-tone--${tone}${QUIET.includes(row.display) ? ' is-quiet' : ''}`}
        title={text}
        onClick={() => onPick(row.task)}
      >
        <AgentStateGlyph tone={tone} size={14} className="agent-tasklist-glyph" />
        <span className="agent-tasklist-main">
          <span className="agent-tasklist-text">{text}</span>
          {sub}
        </span>
        {side}
      </button>
    </li>
  )
}

export function AgentTaskList({ editor, onPick }: { editor: Editor; onPick: (task: AgentListTask) => void }) {
  const t = useT()
  const idBase = useId()
  // The display states (no signal) follow the reports and the clock.
  useAgentTasksStore((st) => st.byId)
  useAgentTasksStore((st) => st.now)
  useAgentTasksStore((st) => st.pendingLoads)
  useAgentTasksStore((st) => st.settings.staleMinutes)
  // Read from the document at each render: the bar re-renders on every recount.
  const groups = agentTaskListGroups(agentListTasksOfDoc(editor.state.doc), agentDisplayStateNow)

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.agent-tasklist-row'))
    const next = agentListStep(rows.indexOf(document.activeElement as HTMLButtonElement), rows.length, e.key)
    if (next === null) return
    e.preventDefault()
    rows[next].focus()
    rows[next].scrollIntoView?.({ block: 'nearest' })
  }

  return (
    <div className="agent-tasklist-scroll" onKeyDown={onKeyDown}>
      {groups.map((group) => {
        const headId = `${idBase}-${group.key}`
        return (
          <div key={group.key} className={`agent-tasklist-group agent-tone--${agentStateTone(group.key)}`} role="group" aria-labelledby={headId}>
            <div className="agent-tasklist-head" id={headId}>
              <span>{agentStateLabel(t, agentStateTone(group.key))}</span>
              <span className="agent-tasklist-count">{group.rows.length}</span>
            </div>
            <ul className="agent-tasklist-rows">
              {group.rows.map((row, i) => <AgentTaskListRow key={`${row.task.id}-${i}`} row={row} onPick={onPick} />)}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
