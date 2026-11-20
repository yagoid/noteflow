import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { Bot, Check, Copy, Folder, FolderOpen, Play, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import { abbreviatePathMiddle } from '../../lib/agentRun'
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
import {
  agentDisplayStateNow,
  agentNoteId,
  agentRunFeedback,
  agentRunHint,
  copyAgentPrompt,
  prepareAgentRun,
  runAgentTasks,
  useAgentRunVisible,
} from './useAgentTask'
import './agentTasks.css'

// The queue bar: right of the note title, the agent tasks of the section this
// editor shows that are waiting for an agent or with one — "3 queued · 1
// running · 1 needs you" — with "Copy prompt" and "Run" for the queued ones.
// Nothing at all while the section has none.
//
// Mounted by Editor.tsx (it owns the document) through a portal into the slot
// NoteEditor leaves in the title row; only with the feature on. Narrow rows
// (a container query on the row, agentTasks.css) fold it into a pill — the
// robot and the total — that opens the same counts and actions in a popover.
//
// "Run" works in the note's PROJECT FOLDER (local to this computer). It shows
// in that popover — and, in the wide bar, behind a small folder button that
// opens the same row on its own — where it can be changed or removed.

/** How long the recount waits after a change of the document: typing never walks it per keystroke. */
const RECOUNT_MS = 120
const FEEDBACK_MS = 1600
/** A run's feedback stays longer: an error has to be read. */
const RUN_FEEDBACK_MS = 5000

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

/** The project folder of the editor's note, for "Run": where it is, and how to change or remove it. */
function AgentFolderRow({ noteId }: { noteId: string }) {
  const t = useT()
  const s = t.editor.agentTask.run
  const state = useAgentTasksStore((st) => st.folders[noteId])
  const pickFolder = useAgentTasksStore((st) => st.pickFolder)
  const clearFolder = useAgentTasksStore((st) => st.clearFolder)
  const folder = state?.folder ?? null
  const missing = !!folder && state?.exists === false
  const report = (err: unknown) => console.error('Failed to change the project folder:', err)
  return (
    <div className="agent-folder" title={s.folderHint}>
      <span className="agent-folder-label">{s.folder}</span>
      <div className="agent-folder-row">
        <FolderOpen size={12} className="agent-folder-icon" aria-hidden />
        {folder ? (
          <span className={`agent-folder-path${missing ? ' is-missing' : ''}`} title={missing ? `${s.folderMissing}: ${folder}` : folder}>
            {abbreviatePathMiddle(folder)}
          </span>
        ) : (
          <span className="agent-folder-path is-empty">{s.noFolder}</span>
        )}
        <button type="button" className="agent-folder-btn" onClick={() => { void pickFolder(noteId).catch(report) }}>
          {folder ? s.changeFolder : s.chooseFolder}
        </button>
        {folder && (
          <button
            type="button"
            className="agent-folder-btn agent-folder-btn--icon"
            title={s.removeFolder}
            aria-label={s.removeFolder}
            onClick={() => { void clearFolder(noteId).catch(report) }}
          >
            <X size={12} aria-hidden />
          </button>
        )}
      </div>
      {missing && <span className="agent-folder-warning" role="status">{s.folderMissing}</span>}
    </div>
  )
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

  const runVisible = useAgentRunVisible()
  const noteId = agentNoteId(editor)
  const folderState = useAgentTasksStore((st) => (noteId ? st.folders[noteId] : undefined))
  const loadFolder = useAgentTasksStore((st) => st.loadFolder)
  const showFolder = runVisible && !!noteId

  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null)
  const [running, setRunning] = useState(false)
  const [runFeedback, setRunFeedback] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  // What the popover hangs from: the pill (counts, actions and the folder) or the folder button (the folder alone).
  const [open, setOpen] = useState<'pill' | 'folder' | null>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const folderRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!feedback) return
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [feedback])

  useEffect(() => {
    if (!runFeedback) return
    const id = setTimeout(() => setRunFeedback(null), RUN_FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [runFeedback])

  // The note's folder, read when the bar appears and again whenever its popover opens
  // (another window may have changed it).
  const barShown = total > 0
  useEffect(() => {
    if (!showFolder || !noteId || !(barShown || open)) return
    void loadFolder(noteId).catch((err) => console.error('Failed to read the project folder:', err))
  }, [showFolder, noteId, barShown, open, loadFolder])

  // The popover: placed under what opened it, closed by Escape, a press outside
  // or the window changing size (the row may have room for the whole bar again).
  useLayoutEffect(() => {
    const el = popRef.current
    const anchor = open === 'pill' ? pillRef.current : open === 'folder' ? folderRef.current : null
    if (!open || !el || !anchor) return
    const close = () => setOpen(null)
    const place = () => {
      // Folded away (the row changed between the bar and the pill): nothing to hang from.
      const hidden = (node: Element | null) => !!node && getComputedStyle(node).display === 'none'
      if (hidden(anchor) || hidden(anchor.parentElement)) {
        close()
        return
      }
      const { top, left } = taskMenuPosition(
        anchor.getBoundingClientRect(),
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
      if (el.contains(target) || anchor.contains(target)) return
      close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
      anchor.focus()
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

  /** "Run": the queued tasks of the section, in the note's folder (asked for the first time). The note is not touched. */
  async function run() {
    if (running) return
    setRunning(true)
    setRunFeedback(null)
    try {
      const blocked = await prepareAgentRun(editor)
      if (blocked) {
        setRunFeedback(agentRunFeedback(t, blocked))
        return
      }
      const ids = queuedAgentIds(agentTasksOfDoc(editor.state.doc))
      setRunFeedback(agentRunFeedback(t, ids.length > 0 ? await runAgentTasks(editor, ids) : { kind: 'error', code: 'no_queued_tasks' }))
    } finally {
      setRunning(false)
    }
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
  const ranOk = runFeedback?.tone === 'ok'
  // The actions on the queue, the same in the bar and in the pill's popover:
  // "Copy prompt" (secondary) and "Run" (the main one).
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
      {runVisible && (
        <button
          type="button"
          className={`agent-queue-btn agent-queue-btn--run${ranOk ? ' is-done' : ''}`}
          title={agentRunHint(t)}
          disabled={running}
          onClick={() => { void run() }}
        >
          {ranOk ? <Check size={12} aria-hidden /> : <Play size={12} aria-hidden />}
          <span aria-live="polite">{ranOk ? runFeedback.text : running ? s.run.starting : s.run.label}</span>
        </button>
      )}
    </div>
  )
  // What went wrong with a run (or a prompt that had to be copied): said next to the actions.
  const runNote = runFeedback?.tone === 'warn' && (
    <span className="agent-run-note" role="status" title={runFeedback.text}>{runFeedback.text}</span>
  )
  const folderPath = folderState?.folder ?? null

  function onPopKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // Its keys are its own (Escape is taken first, on window capture).
    e.stopPropagation()
  }

  return (
    <div className="agent-queue" role="group" aria-label={s.queueBar.label}>
      <div className="agent-queue-full">
        {countList}
        {runNote}
        {actions}
        {showFolder && (
          <button
            ref={folderRef}
            type="button"
            className={`agent-queue-folder-btn${open === 'folder' ? ' is-open' : ''}${folderPath && folderState?.exists === false ? ' is-missing' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={open === 'folder'}
            aria-label={folderPath ? tf(s.run.folderButton, { path: folderPath }) : s.run.folderButtonEmpty}
            title={folderPath ? tf(s.run.folderButton, { path: folderPath }) : s.run.folderButtonEmpty}
            onClick={() => setOpen((v) => (v === 'folder' ? null : 'folder'))}
          >
            <Folder size={13} aria-hidden />
          </button>
        )}
      </div>
      <button
        ref={pillRef}
        type="button"
        className={`agent-queue-pill${counts.waiting > 0 ? ' needs-you' : ''}${open === 'pill' ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open === 'pill'}
        aria-label={plural(s.queueBar.pill, total)}
        title={shown.map((key) => plural(s.queueBar[key], counts[key])).join(' · ')}
        onClick={() => setOpen((v) => (v === 'pill' ? null : 'pill'))}
      >
        <Bot size={13} aria-hidden />
        <span className="agent-queue-pill-count">{total}</span>
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          className="agent-queue-pop"
          role="dialog"
          aria-label={open === 'pill' ? s.queueBar.label : s.run.folder}
          tabIndex={-1}
          onKeyDown={onPopKeyDown}
          {...OWN_KEYS_PROPS}
        >
          {open === 'pill' && countList}
          {open === 'pill' && actions}
          {open === 'pill' && runNote}
          {showFolder && noteId && <AgentFolderRow noteId={noteId} />}
        </div>,
        document.body,
      )}
    </div>
  )
}
