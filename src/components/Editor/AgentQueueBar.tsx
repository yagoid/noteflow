import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { Check, ChevronDown, ChevronRight, Copy, FolderOpen, ListPlus, Play, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import {
  AGENT_MODEL_CHOICES,
  abbreviatePathMiddle,
  agentEffortPatch,
  agentEffortPreset,
  agentModelInput,
  agentModelPreset,
  agentRunChoice,
  agentRunChoicePatch,
  agentRunChoicesAvailable,
  agentRunTemplateMissing,
  type AgentModelChoice,
} from '../../lib/agentRun'
import {
  agentQueueCounts,
  agentQueueTotal,
  agentTasksOfDoc,
  openAgentTaskCount,
  openAgentTasksOfDoc,
  queueOpenAgentTasks,
  queuedAgentIds,
  type AgentDocTask,
  type AgentQueueCounts,
} from '../../lib/agentSend'
import {
  AGENT_EFFORT_LEVELS,
  AGENT_LIVE_STATES,
  type AgentBatchMode,
  type AgentEffort,
  type AgentEffortPreset,
  type AgentModelPreset,
} from '../../lib/agentTasks'
import type { AgentTone } from '../../lib/agentTaskUi'
import type { AgentListTask } from '../../lib/agentTaskList'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { followTaskMenu, taskMenuPosition, type TaskMenuSide } from './taskBadge'
import { useAgentModelDraft } from './useAgentModelDraft'
import { AgentStateGlyph } from './AgentGlyphs'
import { AgentTaskList } from './AgentTaskList'
import { revealAgentTask } from './agentTaskReveal'
import {
  agentDisplayStateNow,
  agentNoteId,
  agentRunFeedback,
  agentRunHint,
  copyAgentPrompt,
  newAgentTaskIdFor,
  prepareAgentRun,
  runAgentTasks,
  useAgentRunVisible,
} from './useAgentTask'
import './agentTasks.css'

// The queue bar: right of the note title, the agent tasks of the section this
// editor shows that are waiting for an agent or with one — one glyph and a
// number per state (running, needs you, queued, no signal; the names are the
// tooltips) — then "Copy prompt" as an icon and the split "▶ Run | ▾" for the
// queued ones. Nothing at all while the section has none. Once something is
// queued, "queue all" (an icon before "Copy prompt") puts the other open tasks
// of the section in the queue at once (lib/agentSend.ts → openAgentTasksOfDoc).
//
// Mounted by Editor.tsx (it owns the document) through a portal into the slot
// NoteEditor leaves in the title row; only with the feature on. Narrow rows
// (a container query on the row, agentTasks.css) fold it into a pill — a
// glyph, the total and a dot when one needs you — that opens the same counts
// and actions in a popover.
//
// The counts are one button: it opens the LIST of the section's agent tasks
// (AgentTaskList.tsx) in the same popover — grouped by state, needs you first,
// with each running task's percent and each queued one's place — whose rows go
// to the task and open its report. In the pill's popover the counts (with
// their words) are that button too, and the list replaces its content.
//
// The menu of the ▾ half of the Run button (and the pill's popover) holds what
// Run uses, each row the same setting as in Settings → AI, changed from here
// too. First WHAT Run opens — an agent in a terminal or a desktop app ("Run
// with"; only the choices that keep Run offered on this computer). With 2+
// queued tasks, how the agent does them — one after another or in parallel
// with subagents. Run in a terminal with Claude Code, Codex or Gemini CLI adds
// the model the agent starts with, and Claude Code its effort. Then the note's
// PROJECT FOLDER (local to this computer), where Run works — changed or
// removed there — and, in the ▾, "Copy prompt".

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

interface AgentDocScan {
  /** The marked tasks. */
  tasks: AgentDocTask[]
  /** How many open tasks "queue all" would add — only counted while something is queued (the button needs it). */
  open: number
}

function scanDoc(editor: Editor): AgentDocScan {
  const doc = editor.state.doc
  const tasks = agentTasksOfDoc(doc)
  const queued = tasks.some((t) => t.state === 'queued' && !t.checked)
  return { tasks, open: queued ? openAgentTaskCount(openAgentTasksOfDoc(doc)) : 0 }
}

/**
 * The marked tasks of the editor's document — and how many open ones "queue
 * all" would add — recounted a moment after it changes (and only when
 * something of them did).
 */
function useAgentDocTasks(editor: Editor): AgentDocScan {
  const [scan, setScan] = useState<AgentDocScan>(() => scanDoc(editor))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const recount = () => {
      timer = null
      if (editor.isDestroyed) return
      const next = scanDoc(editor)
      setScan((prev) => (prev.open === next.open && sameTasks(prev.tasks, next.tasks) ? prev : next))
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
  return scan
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

/**
 * First of the settings rows: what "Run" opens. It is the setting of Settings
 * → AI → Agent tasks → Run with (launch + agent), changed from here too — a
 * native select with its two groups and its names. It only offers what keeps
 * Run offered on this computer (agentRunChoicesAvailable: no terminal in the
 * Microsoft Store build or on Windows without Node.js), so a change does not
 * hide the ▾ it was made from — except on Windows without Node.js while Run is
 * set to an app: main only checks Node.js with a terminal chosen, so the
 * terminal group shows and choosing it hides Run (the ▾ closes). The model and effort rows follow it by
 * themselves. A custom command or link is only written in Settings: with none
 * yet, a line under it says so (Run would fail).
 */
function AgentRunWithRow() {
  const t = useT()
  const s = t.editor.agentTask.run
  const a = t.settings.ai
  const launch = useAgentTasksStore((st) => st.settings.launch)
  const agent = useAgentTasksStore((st) => st.settings.agent)
  const missing = useAgentTasksStore((st) => agentRunTemplateMissing(st.settings))
  const terminal = useAgentTasksStore((st) => st.runTerminal)
  const node = useAgentTasksStore((st) => st.runNode)
  const setSettings = useAgentTasksStore((st) => st.setSettings)
  const selectId = useId()
  const current = agentRunChoice({ launch, agent })
  const choices = agentRunChoicesAvailable(current, terminal, node)
  const choose = (value: string) => {
    const patch = agentRunChoicePatch(value)
    if (!patch || value === current) return
    void setSettings(patch).catch((err) => console.error('Failed to change what Run opens:', err))
  }
  return (
    <div className="agent-runwith">
      <label className="agent-runwith-label" htmlFor={selectId} title={s.runWithHint}>{s.runWith}</label>
      <select
        id={selectId}
        className="agent-runwith-select"
        title={s.runWithHint}
        value={current}
        onChange={(e) => choose(e.target.value)}
      >
        {choices.terminal.length > 0 && (
          <optgroup label={a.agentRunGroupTerminal}>
            {choices.terminal.map((c) => <option key={c} value={c}>{a.agentRunChoices[c]}</option>)}
          </optgroup>
        )}
        <optgroup label={a.agentRunGroupApp}>
          {choices.app.map((c) => <option key={c} value={c}>{a.agentRunChoices[c]}</option>)}
        </optgroup>
      </select>
      {missing && (
        <span className="agent-runwith-warning" role="status">{missing === 'url' ? s.runWithNoUrl : s.runWithNoCommand}</span>
      )}
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
 * written on blur / Enter — and when the menu closes with it typed (a press on
 * Run, Escape: useAgentModelDraft); under it, the agent's documented models
 * (AGENT_MODEL_CHOICES) as one-click words, in two lines: "Default" (which
 * empties it) and the aliases that follow the newest model, then the fixed
 * versions. The stored model marks its word; any other text marks none. A
 * name `--model` would refuse stays in the field with a warning and is never
 * written.
 */
function AgentModelRow({ agent }: { agent: AgentModelPreset }) {
  const t = useT()
  const s = t.editor.agentTask.run
  const { value, invalid, setDraft, commit, save } = useAgentModelDraft(agent)
  const inputId = useId()
  const name = s.agents[agent]
  const choices = AGENT_MODEL_CHOICES[agent]
  const chosen = invalid ? null : agentModelInput(value)
  const pick = (id: string, label: ReactNode, hint: string | undefined, aria?: string) => {
    const on = chosen === id
    return (
      <button
        key={id || 'default'}
        type="button"
        className={`agent-model-pick${on ? ' is-on' : ''}`}
        aria-pressed={on}
        aria-label={aria}
        title={hint}
        onClick={() => save(id)}
      >
        {label}
      </button>
    )
  }
  const choice = (c: AgentModelChoice) => c.latest
    ? pick(
      c.id,
      <>{c.name}<span className="agent-model-pick-tag">{s.modelLatestTag}</span></>,
      tf(s.modelLatestHint, { name: c.name, agent: name }),
      tf(s.modelLatest, { name: c.name }),
    )
    : pick(c.id, c.name, `${c.id} · ${s.modelFixedHint}`)
  const fixed = choices.filter((c) => !c.latest)
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
      {choices.length > 0 && (
        <div className="agent-model-picks">
          <div className="agent-model-pick-line" role="group" aria-label={s.model}>
            {pick('', s.modelDefault, undefined)}
            {choices.filter((c) => c.latest).map(choice)}
          </div>
          {fixed.length > 0 && (
            <div className="agent-model-pick-line" role="group" aria-label={s.modelFixed}>
              {fixed.map(choice)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** "Default" and the levels, lowest first: the radios of the effort row. */
const EFFORT_OPTIONS: readonly (AgentEffort | null)[] = [null, ...AGENT_EFFORT_LEVELS]

/**
 * Run in a terminal with Claude Code: how hard it thinks (its `--effort`). It
 * is the setting of Settings → AI → Agent tasks → Effort (agentTasks.efforts),
 * changed from here too — written on the click, nothing to type. The levels
 * are ordinal, so they read as a scale: "Default", then five bars that rise,
 * filled up to the chosen one; the level's name is said on the line above
 * (and, while the pointer or the focus is on a bar, the one it would choose).
 * Six radios; the arrows move between them.
 */
function AgentEffortRow({ agent }: { agent: AgentEffortPreset }) {
  const t = useT()
  const s = t.editor.agentTask.run
  const stored = useAgentTasksStore((st) => st.settings.efforts[agent] ?? null)
  const setSettings = useAgentTasksStore((st) => st.setSettings)
  // The option under the pointer / the focus: the line above names it.
  const [preview, setPreview] = useState<AgentEffort | null | undefined>(undefined)
  const shown = preview === undefined ? stored : preview
  const rank = (level: AgentEffort | null) => (level === null ? 0 : AGENT_EFFORT_LEVELS.indexOf(level) + 1)
  const optionLabel = (level: AgentEffort | null) => (level === null ? s.effortDefault : s.effortLevels[level])
  const choose = (level: AgentEffort | null) => {
    if (level === stored) return
    void setSettings(agentEffortPatch(agent, level)).catch((err) => console.error('Failed to change the agent effort:', err))
  }
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!BATCH_KEYS.has(e.key)) return
    e.preventDefault()
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
    const at = Math.min(EFFORT_OPTIONS.length - 1, Math.max(0, EFFORT_OPTIONS.indexOf(stored) + step))
    const next = EFFORT_OPTIONS[at]
    choose(next)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-effort="${next ?? 'default'}"]`)?.focus()
  }
  return (
    <div className="agent-effort">
      <div className="agent-effort-head" title={tf(s.effortHint, { agent: s.agents[agent] })}>
        <span className="agent-model-label">
          {s.effort}
          <span className="agent-model-agent"> · {s.agents[agent]}</span>
        </span>
        <span className={`agent-effort-value${shown === null ? ' is-default' : ''}`} aria-hidden>{optionLabel(shown)}</span>
      </div>
      <div
        className="agent-effort-scale"
        role="radiogroup"
        aria-label={s.effort}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setPreview(undefined)}
      >
        {EFFORT_OPTIONS.map((level) => {
          const on = level === stored
          const filled = level !== null && stored !== null && rank(level) <= rank(stored)
          const previewed = level !== null && preview !== undefined && preview !== null && rank(level) <= rank(preview)
          return (
            <button
              key={level ?? 'default'}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={optionLabel(level)}
              tabIndex={on ? 0 : -1}
              data-effort={level ?? 'default'}
              className={level === null
                ? `agent-model-pick agent-effort-default${on ? ' is-on' : ''}`
                : `agent-effort-step${filled ? ' is-filled' : ''}${previewed ? ' is-preview' : ''}`}
              title={level === null ? undefined : optionLabel(level)}
              onClick={() => choose(level)}
              onMouseEnter={() => setPreview(level)}
              onFocus={() => setPreview(level)}
              onBlur={() => setPreview(undefined)}
            >
              {level === null ? s.effortDefault : <span className="agent-effort-bar" style={{ height: `${4 + rank(level) * 3}px` }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AgentQueueBar({ editor }: { editor: Editor }) {
  const t = useT()
  const s = t.editor.agentTask
  const { tasks, open: openCount } = useAgentDocTasks(editor)
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
  // …and, with Claude Code, its effort.
  const effortAgent = useAgentTasksStore((st) => agentEffortPreset(st.settings))

  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null)
  const [running, setRunning] = useState(false)
  const [runFeedback, setRunFeedback] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  // What the popover hangs from and holds: the pill (counts, actions and Run's settings), the ▾ of Run (Run's
  // settings and Copy prompt), or the list of the tasks — from the bar's counts ('list') or the pill's ('pill-list').
  const [open, setOpen] = useState<'pill' | 'more' | 'list' | 'pill-list' | null>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const countsRef = useRef<HTMLButtonElement>(null)
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
    const anchor = open === 'pill' || open === 'pill-list' ? pillRef.current
      : open === 'more' ? moreRef.current
        : open === 'list' ? countsRef.current
          : null
    if (!open || !el || !anchor) return
    const close = () => setOpen(null)
    // The side it opened on: kept while it changes size (rows come and go as "Run with" changes).
    let side: TaskMenuSide | null = null
    const place = () => {
      // Folded away (the row changed between the bar and the pill): nothing to hang from.
      const hidden = (node: Element | null) => !!node && getComputedStyle(node).display === 'none'
      if (hidden(anchor) || hidden(anchor.closest('.agent-queue-full'))) {
        close()
        return
      }
      const rect = anchor.getBoundingClientRect()
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const placed = taskMenuPosition(rect, size, viewport)
      // Re-placed after a change of size: still right-aligned to its anchor, on the same side.
      const { top, left } = side ? followTaskMenu({ left: placed.left, side }, rect, size, viewport) : placed
      side ??= placed.side
      el.style.top = `${top}px`
      el.style.left = `${left}px`
    }
    place()
    const resized = new ResizeObserver(place)
    resized.observe(el)
    // The list: straight to its first row (the arrows go on from there).
    const first = open === 'list' || open === 'pill-list' ? el.querySelector<HTMLElement>('.agent-tasklist-row') : null
    ;(first ?? el).focus({ preventScroll: true })
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
      resized.disconnect()
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  // The ▾ of Run only exists while something is queued: its menu goes with it (adjusted while rendering,
  // so it never floats without its anchor nor comes back by itself).
  if (open === 'more' && !(counts.queued > 0 && showFolder)) setOpen(null)

  // Nothing left to count (the last one finished): the bar goes, and its popover with it — never left
  // open behind a bar that is not there (its listeners would outlive it).
  if (open && total === 0) setOpen(null)
  if (total === 0) return null

  async function copyPrompt() {
    // Read from the document NOW: the recount may be a moment behind.
    const ids = queuedAgentIds(agentTasksOfDoc(editor.state.doc))
    setFeedback((await copyAgentPrompt(editor, ids)) ? 'copied' : 'failed')
  }

  /**
   * "Queue all": every open task of the section (openAgentTasksOfDoc — no
   * marker, unchecked, with text; the outermost; kanban cards too) into the
   * queue, in ONE transaction (one undo takes them all back). The counts of the
   * bar follow by themselves (the recount after a change of the document).
   */
  function queueAll(button: HTMLButtonElement) {
    if (!editor.isEditable) return
    // Read from the document NOW: the recount may be a moment behind.
    const found = openAgentTasksOfDoc(editor.state.doc)
    if (found.length === 0) return
    const tr = editor.state.tr
    queueOpenAgentTasks(tr, found, (taken) => newAgentTaskIdFor(editor, taken))
    if (!tr.docChanged) return
    // The button goes once nothing is left to queue: the focus moves on to "Copy prompt", next to it.
    const hadFocus = document.activeElement === button
    const copy = (button.closest('.agent-queue-pop') ?? button.parentElement)?.querySelector<HTMLButtonElement>('.agent-queue-copy')
    editor.view.dispatch(tr)
    if (hadFocus) copy?.focus()
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
  const listOpen = open === 'list' || open === 'pill-list'
  /**
   * The counts, one button that opens the list of the tasks. `named`: the state's words next to the
   * glyph (the pill's popover, where the list then replaces its content); the bar has them as tooltips.
   */
  const countList = (named: boolean) => (
    <button
      ref={named ? undefined : countsRef}
      type="button"
      className={`agent-queue-counts${named ? ' is-named' : ''}${!named && open === 'list' ? ' is-open' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={named ? false : open === 'list'}
      onClick={() => setOpen((v) => (named ? 'pill-list' : v === 'list' ? null : 'list'))}
    >
      {shown.map((key) => (
        <span key={key} className={`agent-queue-count agent-tone--${COUNT_TONE[key]}`} title={plural(s.queueBar[key], counts[key])}>
          <AgentStateGlyph tone={COUNT_TONE[key]} size={14} />
          {named ? (
            <span>{plural(s.queueBar[key], counts[key])}</span>
          ) : (
            <>
              <span aria-hidden>{counts[key]}</span>
              <span className="agent-sr">{plural(s.queueBar[key], counts[key])}</span>
            </>
          )}
        </span>
      ))}
      <span className="agent-sr">{s.queueBar.showList}</span>
      {named && <ChevronRight size={13} className="agent-queue-counts-go" aria-hidden />}
    </button>
  )
  /** A row of the list: the list closes, the editor goes to the task and opens its report. */
  const pickTask = (task: AgentListTask) => {
    const anchor = open === 'pill-list' ? pillRef.current : countsRef.current
    setOpen(null)
    // Nowhere for the focus to go (a read-only editor, a task gone): back to what opened the list.
    if (!revealAgentTask(editor, task)) anchor?.focus()
  }
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
  // "Queue all": only once something is queued (the bar's actions exist) and while some open task is left.
  const canQueueAll = openCount > 0 && editor.isEditable
  /** `named`: with its words (the pill's popover); in the bar, an icon with the words as its tooltip. */
  const queueAllButton = (named: boolean) => (
    <button
      type="button"
      className={`agent-queue-btn agent-queue-all${named ? '' : ' is-icon'}`}
      title={plural(s.queueBar.queueAll, openCount)}
      aria-label={named ? undefined : plural(s.queueBar.queueAll, openCount)}
      onClick={(e) => queueAll(e.currentTarget)}
    >
      <ListPlus size={14} aria-hidden />
      {named && <span>{plural(s.queueBar.queueAllShort, openCount)}</span>}
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
              {canQueueAll && queueAllButton(false)}
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
        className={`agent-queue-pill${open === 'pill' || open === 'pill-list' ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open === 'pill' || open === 'pill-list'}
        aria-label={plural(s.queueBar.pill, total)}
        title={shown.map((key) => plural(s.queueBar[key], counts[key])).join(' · ')}
        onClick={() => setOpen((v) => (v === 'pill' || v === 'pill-list' ? null : 'pill'))}
      >
        <AgentStateGlyph tone={pillTone} size={14} />
        <span className="agent-queue-pill-count">{total}</span>
        {counts.waiting > 0 && <span className="agent-queue-pill-ask" aria-hidden />}
      </button>
      {listOpen && createPortal(
        <div
          ref={popRef}
          className="agent-tasklist"
          role="dialog"
          aria-label={s.queueBar.label}
          tabIndex={-1}
          onKeyDown={onPopKeyDown}
          {...OWN_KEYS_PROPS}
        >
          <AgentTaskList editor={editor} onPick={pickTask} />
        </div>,
        document.body,
      )}
      {open && !listOpen && createPortal(
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
          {open === 'pill' && queued && canQueueAll && (
            <div className="agent-queue-actions agent-queue-all-row">{queueAllButton(true)}</div>
          )}
          {open === 'pill' && queued && (
            <div className="agent-queue-actions">
              {copyButton(true)}
              {runVisible && runButton}
            </div>
          )}
          {open === 'pill' && runNote}
          {queued && runVisible && <AgentRunWithRow />}
          {several && <AgentBatchRow />}
          {queued && runVisible && modelAgent && <AgentModelRow key={`model-${modelAgent}`} agent={modelAgent} />}
          {queued && runVisible && effortAgent && <AgentEffortRow key={`effort-${effortAgent}`} agent={effortAgent} />}
          {showFolder && noteId && <AgentFolderRow noteId={noteId} />}
          {open === 'more' && queued && <div className="agent-queue-actions">{copyButton(true)}</div>}
        </div>,
        document.body,
      )}
    </div>
  )
}
