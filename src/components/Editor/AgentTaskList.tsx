import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { CircleCheck, ListX } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { agentDoneClearPlan, agentReviewDonePlan, applyAgentClear, applyAgentMarkDone } from '../../lib/agentTaskBulk'
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
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { AgentStateGlyph } from './AgentGlyphs'
import { agentCheckRuleOf, agentDisplayStateNow, agentStateLabel, dismissAgentReport, reconcileAgentReport } from './useAgentTask'
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
//
// Two groups end with an action on all their rows (lib/agentTaskBulk.ts), each
// ONE transaction (one Ctrl+Z takes it back), only in an editable editor:
// "To review" -> "Mark all N as done" (what each report's "Mark as done" does),
// "Done" -> "Clear N done" (deletes those lines from the note, and their
// reports), asked first in place: the line turns into the question.

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
  const s = t.editor.agentTask.queueBar
  const idBase = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // "Clear done" asks first: its line turns into the question (the focus on Cancel).
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => { if (confirmClear) cancelRef.current?.focus() }, [confirmClear])
  // The display states (no signal) follow the reports and the clock.
  useAgentTasksStore((st) => st.byId)
  useAgentTasksStore((st) => st.now)
  useAgentTasksStore((st) => st.pendingLoads)
  useAgentTasksStore((st) => st.settings.staleMinutes)
  // Read from the document at each render: the bar re-renders on every recount.
  const doc = editor.state.doc
  const groups = agentTaskListGroups(agentListTasksOfDoc(doc), agentDisplayStateNow)
  const editable = editor.isEditable
  const hasGroup = (key: AgentListGroupKey) => groups.some((g) => g.key === key)
  const reviewPlan = editable && hasGroup('review') ? agentReviewDonePlan(doc, agentDisplayStateNow) : null
  const clearPlan = editable && hasGroup('done') ? agentDoneClearPlan(doc, agentDisplayStateNow) : null
  // Nothing of "Done" can go any more: no question left to answer.
  if (confirmClear && !(clearPlan && clearPlan.count > 0)) setConfirmClear(false)

  /** After a group action: the focus stays in the list (the arrows go on from there), or goes to the note when nothing is left. */
  function settleFocus() {
    const left = agentTaskListGroups(agentListTasksOfDoc(editor.state.doc), agentDisplayStateNow).length > 0
    if (left) scrollRef.current?.focus({ preventScroll: true })
    else editor.view.focus()
  }

  /** "Mark all as done": every task to review, as its report's "Mark as done" — state and box, all in ONE transaction. */
  function markAllDone() {
    if (!editor.isEditable) return
    const plan = agentReviewDonePlan(editor.state.doc, agentDisplayStateNow)
    if (plan.count === 0) return
    const tr = editor.state.tr
    const { done, unqueued } = applyAgentMarkDone(tr, plan, useEditorSettingsStore.getState().moveCheckedToBottom, agentCheckRuleOf(editor))
    if (!tr.docChanged) return
    editor.view.dispatch(tr)
    for (const id of done) reconcileAgentReport(editor, id)
    for (const id of unqueued) dismissAgentReport(editor, id)
    settleFocus()
  }

  /** "Clear done", confirmed: the lines go in ONE transaction, then their reports (once the note is written without them). */
  function clearDone() {
    setConfirmClear(false)
    if (!editor.isEditable) return
    const plan = agentDoneClearPlan(editor.state.doc, agentDisplayStateNow)
    if (plan.count === 0) return
    const tr = editor.state.tr
    applyAgentClear(tr, plan)
    if (!tr.docChanged) return
    editor.view.dispatch(tr)
    for (const id of plan.ids) dismissAgentReport(editor, id)
    settleFocus()
  }

  function cancelClear() {
    setConfirmClear(false)
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLButtonElement>('.agent-tasklist-action--clear')?.focus())
  }

  /** The action that ends a group, if it has one. */
  function groupFoot(key: AgentListGroupKey): ReactNode {
    if (key === 'review' && reviewPlan && reviewPlan.count > 0) {
      return (
        <div className="agent-tasklist-foot">
          <button type="button" className="agent-tasklist-action agent-tasklist-action--done" title={s.markAllDoneHint} onClick={markAllDone}>
            <CircleCheck size={13} aria-hidden />
            <span>{plural(s.markAllDone, reviewPlan.count)}</span>
          </button>
        </div>
      )
    }
    if (key !== 'done' || !clearPlan || clearPlan.count === 0) return null
    const kept = clearPlan.kept > 0 ? plural(s.clearDoneKept, clearPlan.kept) : null
    if (confirmClear) {
      return (
        <div className="agent-tasklist-foot agent-tasklist-confirm">
          <p className="agent-tasklist-confirm-text" role="alert">
            {plural(s.clearDoneConfirm, clearPlan.count)}
            {kept && <span className="agent-tasklist-confirm-kept">{kept}</span>}
          </p>
          <div className="agent-tasklist-confirm-actions">
            <button ref={cancelRef} type="button" className="agent-tasklist-answer" onClick={cancelClear}>
              {t.common.cancel}
            </button>
            <button type="button" className="agent-tasklist-answer agent-tasklist-answer--danger" onClick={clearDone}>
              {plural(s.clearDoneYes, clearPlan.count)}
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="agent-tasklist-foot">
        <button
          type="button"
          className="agent-tasklist-action agent-tasklist-action--clear"
          title={kept ? `${s.clearDoneHint} ${kept}` : s.clearDoneHint}
          onClick={() => setConfirmClear(true)}
        >
          <ListX size={13} aria-hidden />
          <span>{plural(s.clearDone, clearPlan.count)}</span>
        </button>
      </div>
    )
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.agent-tasklist-row'))
    const next = agentListStep(rows.indexOf(document.activeElement as HTMLButtonElement), rows.length, e.key)
    if (next === null) return
    e.preventDefault()
    rows[next].focus()
    rows[next].scrollIntoView?.({ block: 'nearest' })
  }

  return (
    <div ref={scrollRef} className="agent-tasklist-scroll" tabIndex={-1} onKeyDown={onKeyDown}>
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
            {groupFoot(group.key)}
          </div>
        )
      })}
    </div>
  )
}
