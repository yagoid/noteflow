import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { Bot, Check, Copy } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural } from '../../i18n/format'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import {
  agentQueueCounts,
  agentQueueTotal,
  agentTasksOfDoc,
  queuedAgentIds,
  type AgentDocTask,
  type AgentQueueCounts,
} from '../../lib/agentSend'
import { AGENT_LIVE_STATES } from '../../lib/agentTasks'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { taskMenuPosition } from './taskBadge'
import { agentDisplayStateNow, copyAgentPrompt } from './useAgentTask'
import './agentTasks.css'

// The queue bar: right of the note title, the agent tasks of the section this
// editor shows that are waiting for an agent or with one — "3 queued · 1
// running · 1 needs you" — and "Copy prompt" for the queued ones. Nothing at
// all while the section has none.
//
// Mounted by Editor.tsx (it owns the document) through a portal into the slot
// NoteEditor leaves in the title row; only with the feature on. Narrow rows
// (a container query on the row, agentTasks.css) fold it into a pill — the
// robot and the total — that opens the same counts and actions in a popover.

/** How long the recount waits after a change of the document: typing never walks it per keystroke. */
const RECOUNT_MS = 120
const FEEDBACK_MS = 1600

type CountKey = keyof AgentQueueCounts
const COUNT_ORDER: readonly CountKey[] = ['waiting', 'running', 'queued', 'noSignal']
const COUNT_TONE: Record<CountKey, string> = { queued: 'queued', running: 'running', waiting: 'waiting', noSignal: 'no-signal' }

function sameTasks(a: readonly AgentDocTask[], b: readonly AgentDocTask[]): boolean {
  return a.length === b.length && a.every((t, i) => t.id === b[i].id && t.state === b[i].state && t.checked === b[i].checked)
}

/** The marked tasks of the editor's document, recounted a moment after it changes (and only when something of them did). */
function useAgentDocTasks(editor: Editor): AgentDocTask[] {
  const [tasks, setTasks] = useState<AgentDocTask[]>(() => agentTasksOfDoc(editor.state.doc))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const recount = () => {
      timer = null
      if (editor.isDestroyed) return
      const next = agentTasksOfDoc(editor.state.doc)
      setTasks((prev) => (sameTasks(prev, next) ? prev : next))
    }
    // 'transaction', not 'update': content that arrives from outside (a sync, the
    // CLI changing a state) replaces the document without emitting an update.
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged && !timer) timer = setTimeout(recount, RECOUNT_MS)
    }
    editor.on('transaction', onTransaction)
    recount()
    return () => {
      editor.off('transaction', onTransaction)
      if (timer) clearTimeout(timer)
    }
  }, [editor])
  return tasks
}

export function AgentQueueBar({ editor }: { editor: Editor }) {
  const t = useT()
  const s = t.editor.agentTask
  const tasks = useAgentDocTasks(editor)
  // 'No signal' depends on the reports and on the store's clock — only while
  // some task is running / waiting: otherwise the bar never follows the store.
  const live = tasks.some((task) => AGENT_LIVE_STATES.includes(task.state))
  useAgentTasksStore((st) => (live ? st.byId : null))
  useAgentTasksStore((st) => (live ? st.now : 0))
  useAgentTasksStore((st) => (live ? st.pendingLoads : 0))
  useAgentTasksStore((st) => (live ? st.settings.staleMinutes : 0))
  const counts = agentQueueCounts(tasks, agentDisplayStateNow)
  const total = agentQueueTotal(counts)

  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null)
  const [open, setOpen] = useState(false)
  const pillRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!feedback) return
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [feedback])

  // The popover of the pill: placed under it, closed by Escape, a press outside
  // or the window changing size (the row may have room for the whole bar again).
  useLayoutEffect(() => {
    const el = popRef.current
    const pill = pillRef.current
    if (!open || !el || !pill) return
    const close = () => setOpen(false)
    const place = () => {
      // Folded away (the row got room for the whole bar): nothing to hang from.
      if (getComputedStyle(pill).display === 'none') {
        close()
        return
      }
      const { top, left } = taskMenuPosition(
        pill.getBoundingClientRect(),
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      )
      el.style.top = `${top}px`
      el.style.left = `${left}px`
    }
    place()
    el.focus({ preventScroll: true })
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (el.contains(target) || pill.contains(target)) return
      close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
      pill.focus()
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (total === 0) return null

  async function copyPrompt() {
    // Read from the document NOW: the recount may be a moment behind.
    const ids = queuedAgentIds(agentTasksOfDoc(editor.state.doc))
    setFeedback((await copyAgentPrompt(editor, ids)) ? 'copied' : 'failed')
  }

  const shown = COUNT_ORDER.filter((key) => counts[key] > 0)
  const countList = (
    <ul className="agent-queue-counts">
      {shown.map((key) => (
        <li key={key} className={`agent-queue-count agent-queue-count--${COUNT_TONE[key]}`}>
          <span className="agent-queue-dot" aria-hidden />
          {plural(s.queueBar[key], counts[key])}
        </li>
      ))}
    </ul>
  )
  // The actions on the queue, the same in the bar and in the pill's popover.
  // Phase 4: "Run" goes here, after "Copy prompt" (same button, `--primary`).
  const actions = counts.queued > 0 && (
    <div className="agent-queue-actions">
      <button
        type="button"
        className={`agent-queue-btn${feedback === 'copied' ? ' is-done' : ''}`}
        title={s.queueBar.copyPromptHint}
        onClick={() => { void copyPrompt() }}
      >
        {feedback === 'copied' ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
        <span aria-live="polite">{feedback === 'copied' ? s.promptCopied : feedback === 'failed' ? s.copyFailed : s.copyPrompt}</span>
      </button>
    </div>
  )

  function onPopKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // Its keys are its own (Escape is taken first, on window capture).
    e.stopPropagation()
  }

  return (
    <div className="agent-queue" role="group" aria-label={s.queueBar.label}>
      <div className="agent-queue-full">
        {countList}
        {actions}
      </div>
      <button
        ref={pillRef}
        type="button"
        className={`agent-queue-pill${counts.waiting > 0 ? ' needs-you' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={plural(s.queueBar.pill, total)}
        title={shown.map((key) => plural(s.queueBar[key], counts[key])).join(' · ')}
        onClick={() => setOpen((v) => !v)}
      >
        <Bot size={13} aria-hidden />
        <span className="agent-queue-pill-count">{total}</span>
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          className="agent-queue-pop"
          role="dialog"
          aria-label={s.queueBar.label}
          tabIndex={-1}
          onKeyDown={onPopKeyDown}
          {...OWN_KEYS_PROPS}
        >
          {countList}
          {actions}
        </div>,
        document.body,
      )}
    </div>
  )
}
