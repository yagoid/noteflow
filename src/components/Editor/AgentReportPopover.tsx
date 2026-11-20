import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, CircleAlert, CircleCheck, ClipboardCopy, Copy, FileText, Loader, MessageCircleQuestion, Play, RotateCcw, Trash2, WifiOff, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import { htmlFromMarkdown } from '../../lib/markdownHtml'
import { AGENT_NO_SIGNAL } from '../../lib/agentTasks'
import type { AgentRunOutcome } from '../../lib/agentRun'
import {
  agentDismissNeedsConfirm,
  agentFacts,
  agentFactsEmpty,
  agentIsLive,
  agentPrimaryAction,
  agentReportActions,
  formatAgentDuration,
  type AgentReportAction,
} from '../../lib/agentTaskUi'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { proseFontStack, useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { followTaskMenu, taskMenuPosition, type TaskMenuPlacement } from './taskBadge'
import { AgentBadge } from './AgentTaskChip'
import { agentRunFeedback, agentRunHint, useAgentDisplayState, useAgentRunVisible } from './useAgentTask'
import './agentTasks.css'

// The report menu of an agent task: what the agent says about the task (its
// progress, its question, why it failed), the facts of the run and the report
// it wrote, plus the actions the state allows (lib/agentTaskUi.ts). Opened from
// the task's chip (AgentTaskTrigger) for every state but "queued".
//
// Same mechanics as the task menu (TaskPickers.tsx → TaskMenuPopover):
// portalled to <body>, `position: fixed`, placed from its measured size with
// taskMenuPosition and kept there with followTaskMenu; closes on Escape, a
// click outside or a press on its own chip; Tab stays inside; its keys never
// reach the editor.

interface AgentReportPopoverProps {
  trigger: HTMLElement
  agentId: string
  /** The state on the task's LINE (it rules over the block's). */
  agentState: string
  /** The task's text as the note shows it. */
  title: string
  checked: boolean
  /** The note can be edited here: without it the menu only reads. */
  editable: boolean
  onMarkDone: () => void
  onRequeue: () => void
  /** Removes the marker from the task and its report. */
  onDismiss: () => void
  /**
   * Copies the prompt that hands this ONE task to an agent — putting it back in
   * the queue first when it is not queued (the same as sending it from a text
   * selection). Resolves to whether the clipboard took it. Without it the menu
   * does not offer the action.
   */
  onCopyPrompt?: () => Promise<boolean>
  /**
   * Launches the agent of the settings on this ONE task — asking for the note's
   * project folder first when it has none, and putting the task back in the
   * queue when it is not queued. Without it the menu does not offer "Run".
   */
  onRun?: () => Promise<AgentRunOutcome>
  /** `fromKeyboard`: closed with Escape or after an action — the focus goes back to the text. */
  onClose: (fromKeyboard: boolean) => void
}

const ACTION_ICONS: Record<AgentReportAction, ReactNode> = {
  markDone: <CircleCheck size={13} />,
  requeue: <RotateCcw size={13} />,
  copyPrompt: <ClipboardCopy size={13} />,
  run: <Play size={13} />,
  dismiss: <Trash2 size={13} />,
  copyId: <Copy size={13} />,
}

export function AgentReportPopover({
  trigger, agentId, agentState, title, checked, editable, onMarkDone, onRequeue, onDismiss, onCopyPrompt, onRun, onClose,
}: AgentReportPopoverProps) {
  const t = useT()
  const s = t.editor.agentTask
  const popoverRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const block = useAgentTasksStore((st) => st.byId[agentId])
  const loading = useAgentTasksStore((st) => st.pendingLoads > 0)
  const now = useAgentTasksStore((st) => st.now)
  const fontFamily = useEditorSettingsStore((st) => st.fontFamily)
  const display = useAgentDisplayState(agentId, agentState) ?? agentState
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [promptFeedback, setPromptFeedback] = useState<'copied' | 'failed' | null>(null)
  const runVisible = useAgentRunVisible()
  const [running, setRunning] = useState(false)
  const [runFeedback, setRunFeedback] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)

  const meta = block?.meta
  const live = agentIsLive(display)
  const facts = useMemo(() => agentFacts(meta ?? {}, display, now), [meta, display, now])
  const body = block?.body ?? ''
  const html = useMemo(() => (body ? htmlFromMarkdown(body, { columnWidths: false }) : ''), [body])

  const actions = agentReportActions(display, { checked, editable })
    .filter((a) => (a !== 'copyPrompt' || !!onCopyPrompt) && (a !== 'run' || (!!onRun && runVisible)))
  const primary = agentPrimaryAction(display, actions)

  // ── Dismiss: Escape (window capture: the editor stops keydown), a press outside
  //    or on the chip itself (whose click then must not reopen it).
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return
      onCloseRef.current(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onCloseRef.current(true)
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  // ── Placement: decided when it opens (and on resize); afterwards — the report
  //    landing changes its height — it only follows its chip vertically.
  const placed = useRef<TaskMenuPlacement | null>(null)
  useLayoutEffect(() => {
    const el = popoverRef.current
    if (!el) return
    const place = (reopen: boolean) => {
      const rect = trigger.getBoundingClientRect()
      const size = { width: el.offsetWidth, height: el.offsetHeight }
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const { top, left } =
        reopen || !placed.current
          ? (placed.current = taskMenuPosition(rect, size, viewport))
          : followTaskMenu(placed.current, rect, size, viewport)
      el.style.top = `${top}px`
      el.style.left = `${left}px`
    }
    const onResize = () => place(true)
    const onScroll = (e: Event) => {
      // Its own scrolling middle is not the page moving.
      if (e.target instanceof Node && el.contains(e.target)) return
      place(false)
    }
    place(false)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  })

  // The focus moves into the menu when it opens (the dialog itself: its name is
  // read, and Tab goes to the first action), and to "Cancel" when it asks.
  useEffect(() => { popoverRef.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { if (confirming) cancelRef.current?.focus() }, [confirming])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(id)
  }, [copied])

  useEffect(() => {
    if (!promptFeedback) return
    const id = setTimeout(() => setPromptFeedback(null), 1600)
    return () => clearTimeout(id)
  }, [promptFeedback])

  useEffect(() => {
    if (!runFeedback) return
    const id = setTimeout(() => setRunFeedback(null), 5000)
    return () => clearTimeout(id)
  }, [runFeedback])

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // The menu owns its keys: none reaches the editor's handlers or the app's
    // bubbling shortcuts. Escape is handled first, on window capture.
    e.stopPropagation()
    if (e.key !== 'Tab') return
    const root = popoverRef.current
    if (!root) return
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'))
      .filter((el) => el.tabIndex >= 0)
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Links of the report open in the browser, never inside the app's window.
  function onBodyClick(e: ReactMouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest('a')
    if (!link) return
    e.preventDefault()
    const href = link.getAttribute('href')
    if (href) void window.noteflow.openUrl(href)
  }

  function run(action: AgentReportAction) {
    if (action === 'copyId') {
      void navigator.clipboard.writeText(agentId).then(() => setCopied(true), () => undefined)
      return
    }
    if (action === 'copyPrompt') {
      // The menu stays open: it says "copied" (and the task now shows as queued).
      void onCopyPrompt?.().then((ok) => setPromptFeedback(ok ? 'copied' : 'failed'), () => setPromptFeedback('failed'))
      return
    }
    if (action === 'run') {
      // The menu stays open: it says what happened (and the task now shows as queued).
      if (running || !onRun) return
      setRunning(true)
      setRunFeedback(null)
      void onRun()
        .then((outcome) => setRunFeedback(agentRunFeedback(t, outcome)), () => setRunFeedback(agentRunFeedback(t, { kind: 'error', code: 'failed' })))
        .finally(() => setRunning(false))
      return
    }
    if (action === 'dismiss') {
      if (agentDismissNeedsConfirm(display) && !confirming) {
        setConfirming(true)
        return
      }
      onDismiss()
    } else if (action === 'markDone') {
      onMarkDone()
    } else {
      onRequeue()
    }
    onClose(true)
  }

  const labels: Record<AgentReportAction, string> = {
    markDone: s.markDone,
    requeue: s.requeue,
    copyPrompt: promptFeedback === 'copied' ? s.promptCopied : promptFeedback === 'failed' ? s.copyFailed : s.copyPrompt,
    run: runFeedback?.tone === 'ok' ? runFeedback.text : running ? s.run.starting : s.run.label,
    dismiss: s.dismiss,
    copyId: copied ? s.copied : s.copyId,
  }
  const done = (action: AgentReportAction) =>
    (action === 'copyId' && copied) || (action === 'copyPrompt' && promptFeedback === 'copied') || (action === 'run' && runFeedback?.tone === 'ok')
  const button = (action: AgentReportAction, variant: string) => (
    <button
      key={action}
      type="button"
      className={`agent-report-btn${variant ? ` agent-report-btn--${variant}` : ''}`}
      title={
        action === 'dismiss' ? s.dismissHint
          // Copying a task that is not queued also puts it back in the queue: say so.
          : action === 'copyPrompt' && display !== 'queued' ? s.copyPromptRequeueHint
            : action === 'run' ? (display !== 'queued' ? `${s.run.requeueHint}. ${agentRunHint(t)}` : agentRunHint(t))
              : variant.startsWith('icon') ? labels[action] : undefined
      }
      disabled={action === 'run' && running}
      onClick={() => run(action)}
    >
      {done(action) ? <Check size={13} /> : ACTION_ICONS[action]}
      <span aria-live={action === 'copyId' || action === 'copyPrompt' || action === 'run' ? 'polite' : undefined}>{labels[action]}</span>
    </button>
  )
  const quiet = actions.filter((a) => a === 'dismiss' || a === 'copyId')
  const sending = actions.filter((a) => a === 'copyPrompt' || a === 'run')
  const canRun = actions.includes('run')
  const moving = actions.filter((a) => a === 'markDone' || a === 'requeue')
  // A full foot (five actions): the two quiet ones fold into their icons — the
  // name stays as the tooltip and for screen readers — so the row does not wrap.
  const compactQuiet = actions.length >= 5

  const date = (ms: number) => formatDate(ms, s.dateFormat)
  const factRows: Array<[string, string | null]> = [
    [s.facts.machine, facts.machine],
    [s.facts.agent, facts.agent],
    [s.facts.started, facts.startedAt !== null ? date(facts.startedAt) : null],
    [s.facts.finished, facts.finishedAt !== null ? date(facts.finishedAt) : null],
    [facts.finishedAt === null && live ? s.facts.elapsed : s.facts.duration, facts.durationMs !== null ? formatAgentDuration(facts.durationMs) : null],
    [s.facts.branch, facts.branch],
    [s.facts.commits, facts.commits !== null ? String(facts.commits) : null],
    [s.facts.files, facts.filesChanged !== null ? String(facts.filesChanged) : null],
  ]

  const lastSignal = Date.parse(meta?.lastSignal || '')
  const emptyText = !block ? (loading ? '' : s.emptyMissing) : live || display === AGENT_NO_SIGNAL ? s.emptyWorking : s.emptyFinished

  return createPortal(
    <div
      ref={popoverRef}
      className="agent-report"
      role="dialog"
      aria-label={s.report}
      aria-describedby={titleId}
      tabIndex={-1}
      contentEditable={false}
      onKeyDown={onKeyDown}
      {...OWN_KEYS_PROPS}
    >
      <header className="agent-report-head">
        <div className="agent-report-eyebrow">
          <AgentBadge state={display} />
          <span className="agent-report-kicker">{s.report}</span>
          <span className="agent-report-spacer" />
          <button type="button" className="agent-report-close" title={t.common.close} aria-label={t.common.close} onClick={() => onClose(true)}>
            <X size={14} />
          </button>
        </div>
        <h2 className="agent-report-title" id={titleId}>{title.trim() || meta?.title || s.untitled}</h2>
      </header>

      <div className="agent-report-scroll">
        {live && meta?.progress && (
          <div className="agent-report-note agent-report-note--progress">
            <span className="agent-report-note-label"><Loader size={11} aria-hidden />{s.progress}</span>
            <p className="agent-report-note-text">{meta.progress}</p>
          </div>
        )}
        {display === 'waiting' && (
          <div className="agent-report-note agent-report-note--question">
            <span className="agent-report-note-label"><MessageCircleQuestion size={11} aria-hidden />{s.question}</span>
            {meta?.question && <p className="agent-report-note-text">{meta.question}</p>}
            <p className="agent-report-note-hint">{s.questionHint}</p>
          </div>
        )}
        {display === 'failed' && meta?.failReason && (
          <div className="agent-report-note agent-report-note--failed">
            <span className="agent-report-note-label"><CircleAlert size={11} aria-hidden />{s.failReason}</span>
            <p className="agent-report-note-text">{meta.failReason}</p>
          </div>
        )}
        {display === AGENT_NO_SIGNAL && (
          <div className="agent-report-note agent-report-note--lost">
            <span className="agent-report-note-label"><WifiOff size={11} aria-hidden />{s.states.noSignal}</span>
            <p className="agent-report-note-hint">
              {Number.isFinite(lastSignal) && now >= lastSignal
                ? tf(s.noSignalHint, { when: formatAgentDuration(now - lastSignal) })
                : s.noSignalUnknown}
            </p>
          </div>
        )}

        {!agentFactsEmpty(facts) && (
          <dl className="agent-report-facts">
            {factRows.map(([label, value]) => value !== null && (
              <div key={label} className="agent-report-fact">
                <dt>{label}</dt>
                <dd title={value}>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {html ? (
          <div
            className="agent-report-body chat-md prose-editor"
            style={{ '--prose-font-family': proseFontStack(fontFamily) } as CSSProperties}
            onClick={onBodyClick}
          >
            <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : emptyText ? (
          <div className="agent-report-empty">
            <FileText size={22} className="agent-report-empty-icon" aria-hidden />
            <p>{emptyText}</p>
          </div>
        ) : null}
      </div>

      <footer className="agent-report-foot">
        {confirming ? (
          <>
            <p className="agent-report-confirm" role="alert">{s.confirmDismiss}</p>
            <button ref={cancelRef} type="button" className="agent-report-btn agent-report-btn--solid" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </button>
            {button('dismiss', 'confirm')}
          </>
        ) : (
          <>
            {quiet.map((a) => button(a, compactQuiet ? (a === 'dismiss' ? 'icon agent-report-btn--danger' : 'icon') : a === 'dismiss' ? 'danger' : ''))}
            <span className="agent-report-spacer" />
            {/* A run that did not start (or a prompt that had to be copied): its own line, above the actions. */}
            {runFeedback?.tone === 'warn' && <p className="agent-report-run-note" role="status">{runFeedback.text}</p>}
            {/* Sending the task to an agent: "Run" is the main way; next to it "Copy prompt" folds into its icon. */}
            {sending.map((a) => button(a, a === 'run' ? (primary ? 'solid' : 'primary') : canRun ? 'icon' : ''))}
            {moving.map((a) => button(a, a === primary ? 'primary' : 'solid'))}
          </>
        )}
      </footer>
    </div>,
    document.body,
  )
}
