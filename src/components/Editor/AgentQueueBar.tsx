import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { Check, ChevronDown, Copy, FolderOpen, Play, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import { AGENT_MODEL_SUGGESTIONS, abbreviatePathMiddle, agentModelInput, agentModelPreset } from '../../lib/agentRun'
import {
  agentQueueCounts,
  agentQueueTotal,
  agentTasksOfDoc,
  queuedAgentIds,
  type AgentDocTask,
  type AgentQueueCounts,
} from '../../lib/agentSend'
import { AGENT_LIVE_STATES, type AgentBatchMode, type AgentModelPreset } from '../../lib/agentTasks'
import type { AgentTone } from '../../lib/agentTaskUi'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { taskMenuPosition } from './taskBadge'
import { AgentStateGlyph } from './AgentGlyphs'
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
// editor shows that are waiting for an agent or with one — one glyph and a
// number per state (running, needs you, queued, no signal; the names are the
// tooltips) — then "Copy prompt" as an icon and the split "▶ Run | ▾" for the
// queued ones. Nothing at all while the section has none.
//
// Mounted by Editor.tsx (it owns the document) through a portal into the slot
// NoteEditor leaves in the title row; only with the feature on. Narrow rows
// (a container query on the row, agentTasks.css) fold it into a pill — a
// glyph, the total and a dot when one needs you — that opens the same counts
// and actions in a popover.
//
// "Run" works in the note's PROJECT FOLDER (local to this computer). It shows
// in the menu of the ▾ half of the Run button (with "Copy prompt") and in the
// pill's popover, where it can be changed or removed. With 2+ queued tasks the
// same popover also says how the agent does them — one after another or in
// parallel with subagents — and changes it (the setting of Settings → AI). Run
// in a terminal with Claude Code, Codex or Gemini CLI adds the model the agent
// starts with (the same setting).

/** How long the recount waits after a change of the document: typing never walks it per keystroke. */
const RECOUNT_MS = 120
const FEEDBACK_MS = 1600
/** A run's feedback stays longer: an error has to be read. */
const RUN_FEEDBACK_MS = 5000

type CountKey = keyof AgentQueueCounts
const COUNT_ORDER: readonly CountKey[] = ['running', 'waiting', 'queued', 'noSignal']
const COUNT_TONE: Record<CountKey, AgentTone> = { queued: 'queued', running: 'running', waiting: 'waiting', noSignal: 'no-signal' }

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

const BATCH_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

/**
 * With 2+ queued tasks: how the agent does them — one after another in its
 * session, or one subagent per task at the same time. It is the setting of
 * Settings → AI → Agent tasks → Several tasks (agentTasks.batchMode), changed
 * from here too: it decides the prompt that is copied and what Run sends.
 * Two radios; the arrows move between them.
 */
function AgentBatchRow() {
  const t = useT()
  const s = t.editor.agentTask.run
  const mode = useAgentTasksStore((st) => st.settings.batchMode)
  const setSettings = useAgentTasksStore((st) => st.setSettings)
  const options = [
    { value: 'sequential', label: s.batchSequential, hint: s.batchSequentialHint },
    { value: 'parallel', label: s.batchParallel, hint: s.batchParallelHint },
  ] as const
  const choose = (value: AgentBatchMode) => {
    if (value === mode) return
    void setSettings({ batchMode: value }).catch((err) => console.error('Failed to change how several tasks are run:', err))
  }
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!BATCH_KEYS.has(e.key)) return
    e.preventDefault()
    const next: AgentBatchMode = mode === 'parallel' ? 'sequential' : 'parallel'
    choose(next)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus()
  }
  return (
    <div className="agent-batch">
      <span className="agent-batch-label" title={s.batchHint}>{s.batch}</span>
      <div className="agent-batch-switch" role="radiogroup" aria-label={s.batch} onKeyDown={onKeyDown}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={mode === o.value}
            tabIndex={mode === o.value ? 0 : -1}
            data-mode={o.value}
            className={`agent-batch-option${mode === o.value ? ' is-on' : ''}`}
            title={o.hint}
            onClick={() => choose(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Run in a terminal with an agent that takes a model: which one it starts with.
 * It is the setting of Settings → AI → Agent tasks → Model (agentTasks.models,
 * this agent's), changed from here too. A field — any name the agent knows —
 * written on blur / Enter; under it, the agent's documented names (and
 * "Default", which empties it) as one-click choices. A name `--model` would
 * refuse stays in the field with a warning and is never written.
 */
function AgentModelRow({ agent }: { agent: AgentModelPreset }) {
  const t = useT()
  const s = t.editor.agentTask.run
  const stored = useAgentTasksStore((st) => st.settings.models[agent] ?? '')
  const setSettings = useAgentTasksStore((st) => st.setSettings)
  const [draft, setDraft] = useState<string | null>(null)
  const inputId = useId()
  const value = draft ?? stored
  const invalid = agentModelInput(value) === null
  const save = (next: string) => {
    setDraft(null)
    if (next === stored) return
    void setSettings({ models: { [agent]: next } }).catch((err) => console.error('Failed to change the agent model:', err))
  }
  const commit = () => {
    if (draft === null) return
    const next = agentModelInput(draft)
    if (next !== null) save(next)
  }
  const name = s.agents[agent]
  const suggestions = AGENT_MODEL_SUGGESTIONS[agent]
  return (
    <div className="agent-model">
      <label className="agent-model-label" htmlFor={inputId} title={tf(s.modelHint, { agent: name })}>
        {s.model}
        <span className="agent-model-agent"> · {name}</span>
      </label>
      <input
        id={inputId}
        type="text"
        className="agent-model-input"
        spellCheck={false}
        autoComplete="off"
        maxLength={100}
        aria-invalid={invalid}
        placeholder={s.modelPlaceholder}
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {invalid && <span className="agent-model-warning" role="status">{s.modelInvalid}</span>}
      {suggestions.length > 0 && (
        <div className="agent-model-picks" role="group" aria-label={s.model}>
          {['', ...suggestions].map((option) => {
            const on = !invalid && agentModelInput(value) === option
            return (
              <button
                key={option || 'default'}
                type="button"
                className={`agent-model-pick${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => save(option)}
              >
                {option || s.modelDefault}
              </button>
            )
          })}
        </div>
      )}
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
  const loadFolder = useAgentTasksStore((st) => st.loadFolder)
  const folderState = useAgentTasksStore((st) => (noteId ? st.folders[noteId] : undefined))
  // The saved folder is gone: the ▾ that holds it says so.
  const folderMissing = !!folderState?.folder && folderState.exists === false
  const showFolder = runVisible && !!noteId
  // Run in a terminal with an agent that takes a model: the ▾ (and the pill) say which one and change it.
  const modelAgent = useAgentTasksStore((st) => agentModelPreset(st.settings))

  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null)
  const [running, setRunning] = useState(false)
  const [runFeedback, setRunFeedback] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  // What the popover hangs from: the pill (counts, actions and the folder) or the ▾ of Run (the folder and Copy prompt).
  const [open, setOpen] = useState<'pill' | 'more' | null>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
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
    const anchor = open === 'pill' ? pillRef.current : open === 'more' ? moreRef.current : null
    if (!open || !el || !anchor) return
    const close = () => setOpen(null)
    const place = () => {
      // Folded away (the row changed between the bar and the pill): nothing to hang from.
      const hidden = (node: Element | null) => !!node && getComputedStyle(node).display === 'none'
      if (hidden(anchor) || hidden(anchor.closest('.agent-queue-full'))) {
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

  // The ▾ of Run only exists while something is queued: its menu goes with it (adjusted while rendering,
  // so it never floats without its anchor nor comes back by itself).
  if (open === 'more' && !(counts.queued > 0 && showFolder)) setOpen(null)

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
  /** `named`: the state's words next to the glyph (the pill's popover); the bar has them as tooltips. */
  const countList = (named: boolean) => (
    <ul className={`agent-queue-counts${named ? ' is-named' : ''}`}>
      {shown.map((key) => (
        <li key={key} className={`agent-queue-count agent-tone--${COUNT_TONE[key]}`} title={plural(s.queueBar[key], counts[key])}>
          <AgentStateGlyph tone={COUNT_TONE[key]} size={14} />
          {named ? (
            <span>{plural(s.queueBar[key], counts[key])}</span>
          ) : (
            <>
              <span aria-hidden>{counts[key]}</span>
              <span className="agent-sr">{plural(s.queueBar[key], counts[key])}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
  const ranOk = runFeedback?.tone === 'ok'
  const copyLabel = feedback === 'copied' ? s.promptCopied : feedback === 'failed' ? s.copyFailed : s.copyPrompt
  /** "Copy prompt": its icon (the name is the tooltip) while "Run" is the main action; with its words when it is alone, or saying how it went. */
  const copyButton = (named: boolean) => (
    <button
      type="button"
      className={`agent-queue-btn agent-queue-copy${named || feedback ? '' : ' is-icon'}${feedback === 'copied' ? ' is-done' : ''}${feedback === 'failed' ? ' is-warn' : ''}`}
      title={s.queueBar.copyPromptHint}
      onClick={() => { void copyPrompt() }}
    >
      {feedback === 'copied' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite">{copyLabel}</span>
    </button>
  )
  const runButton = (
    <button
      type="button"
      className={`agent-queue-btn agent-queue-btn--run${ranOk ? ' is-done' : ''}`}
      title={agentRunHint(t)}
      disabled={running}
      onClick={() => { void run() }}
    >
      {ranOk ? <Check size={13} aria-hidden /> : <Play size={12} className="agent-queue-play" aria-hidden />}
      <span aria-live="polite">{ranOk ? runFeedback.text : running ? s.run.starting : s.run.label}</span>
    </button>
  )
  // What went wrong with a run (or a prompt that had to be copied): said next to the actions.
  const runNote = runFeedback?.tone === 'warn' && (
    <span className="agent-run-note" role="status" title={runFeedback.text}>{runFeedback.text}</span>
  )
  const queued = counts.queued > 0
  // How several tasks are done only matters when there are several to send.
  const several = counts.queued > 1
  // The pill: the glyph of the liveliest state, the total, and a dot when one needs you.
  const pillTone = COUNT_TONE[shown.find((key) => key !== 'waiting') ?? 'waiting']

  function onPopKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // Its keys are its own (Escape is taken first, on window capture).
    e.stopPropagation()
  }

  return (
    <div className="agent-queue" role="group" aria-label={s.queueBar.label}>
      <div className="agent-queue-full">
        {countList(false)}
        {runNote}
        {queued && (
          <>
            <span className="agent-queue-sep" aria-hidden />
            <div className="agent-queue-actions">
              {copyButton(!runVisible)}
              {runVisible && (
                <span className="agent-run-split">
                  {runButton}
                  {showFolder && (
                    <button
                      ref={moreRef}
                      type="button"
                      className={`agent-queue-more${open === 'more' ? ' is-open' : ''}${folderMissing ? ' is-missing' : ''}`}
                      aria-haspopup="dialog"
                      aria-expanded={open === 'more'}
                      aria-label={folderMissing ? `${s.run.more}. ${s.run.folderMissing}` : s.run.more}
                      title={folderMissing ? `${s.run.more}. ${s.run.folderMissing}` : s.run.more}
                      onClick={() => setOpen((v) => (v === 'more' ? null : 'more'))}
                    >
                      <ChevronDown size={13} aria-hidden />
                    </button>
                  )}
                </span>
              )}
            </div>
          </>
        )}
      </div>
      <button
        ref={pillRef}
        type="button"
        className={`agent-queue-pill${open === 'pill' ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open === 'pill'}
        aria-label={plural(s.queueBar.pill, total)}
        title={shown.map((key) => plural(s.queueBar[key], counts[key])).join(' · ')}
        onClick={() => setOpen((v) => (v === 'pill' ? null : 'pill'))}
      >
        <AgentStateGlyph tone={pillTone} size={14} />
        <span className="agent-queue-pill-count">{total}</span>
        {counts.waiting > 0 && <span className="agent-queue-pill-ask" aria-hidden />}
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          className="agent-queue-pop"
          role="dialog"
          aria-label={open === 'pill' ? s.queueBar.label : s.run.more}
          tabIndex={-1}
          onKeyDown={onPopKeyDown}
          {...OWN_KEYS_PROPS}
        >
          {open === 'pill' && countList(true)}
          {open === 'pill' && queued && (
            <div className="agent-queue-actions">
              {copyButton(true)}
              {runVisible && runButton}
            </div>
          )}
          {open === 'pill' && runNote}
          {several && <AgentBatchRow />}
          {queued && runVisible && modelAgent && <AgentModelRow key={modelAgent} agent={modelAgent} />}
          {showFolder && noteId && <AgentFolderRow noteId={noteId} />}
          {open === 'more' && queued && <div className="agent-queue-actions">{copyButton(true)}</div>}
        </div>,
        document.body,
      )}
    </div>
  )
}
