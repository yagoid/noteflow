import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, CircleCheck, ClipboardCopy, Hash, MessageSquareShare, Play, RotateCcw, Trash2, Undo2, X } from 'lucide-react'
import { isSameDay } from 'date-fns'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import { htmlFromMarkdown } from '../../lib/markdownHtml'
import { AGENT_DESKTOP_SESSION_RE, AGENT_NO_SIGNAL, agentDesktopSessionHere } from '../../lib/agentTasks'
import type { AgentRunOutcome } from '../../lib/agentRun'
import {
  agentDismissNeedsConfirm,
  agentFacts,
  agentFootLayout,
  agentIsLive,
  agentReportActions,
  agentStateTone,
  agentThread,
  formatAgentDuration,
  type AgentReportAction,
  type AgentThreadEvent,
} from '../../lib/agentTaskUi'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { proseFontStack, useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { followTaskMenu, taskMenuPosition, type TaskMenuPlacement } from './taskBadge'
import { AgentStateGlyph } from './AgentGlyphs'
import { agentRunFeedback, agentRunHint, agentStateLabel, useAgentDisplayState, useAgentRunVisible } from './useAgentTask'
import './agentTasks.css'

// The report of an agent task, a small card ("Ficha"): the state (its glyph,
// its name, who / where / how long), the task, a timeline of what the block
// records (started, what the agent is doing, its question, why it failed,
// finished…), the report the agent wrote — folded, "Read the full report"
// unfolds it — a one-line strip with the facts no event carries, and the
// actions the state allows (lib/agentTaskUi.ts: agentReportActions laid out by
// agentFootLayout) — among them "Open in Claude", for an agent that works (or
// worked) in Claude Desktop on this computer: main opens its conversation.
// Opened from the task's chip (AgentTaskTrigger) or from its box
// (AgentTaskBox) for every state but "queued".
//
// Same mechanics as the task menu (TaskPickers.tsx → TaskMenuPopover):
// portalled to <body>, `position: fixed`, placed from its measured size with
// taskMenuPosition and kept there with followTaskMenu; closes on Escape, a
// click outside or a press on its own chip; Tab stays inside; its keys never
// reach the editor. Opened from a task's BOX (left of the text) its LEFT edge
// lines up with the box (`data-agent-anchor="start"` on the trigger) instead
// of its right edge with the chip.

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
  /** Unticks a done task (whose box opens this report instead of toggling). Without it the menu does not offer "Reopen". */
  onReopen?: () => void
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
  markDone: <CircleCheck size={14} aria-hidden />,
  requeue: <RotateCcw size={14} aria-hidden />,
  copyPrompt: <ClipboardCopy size={14} aria-hidden />,
  run: <Play size={13} aria-hidden />,
  openSession: <MessageSquareShare size={14} aria-hidden />,
  reopen: <Undo2 size={14} aria-hidden />,
  dismiss: <Trash2 size={14} aria-hidden />,
  copyId: <Hash size={14} aria-hidden />,
}

export function AgentReportPopover({
  trigger, agentId, agentState, title, checked, editable, onMarkDone, onRequeue, onReopen, onDismiss, onCopyPrompt, onRun, onClose,
}: AgentReportPopoverProps) {
  const t = useT()
  const s = t.editor.agentTask
  const popoverRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const block = useAgentTasksStore((st) => st.byId[agentId])
  const loading = useAgentTasksStore((st) => st.pendingLoads > 0)
  const now = useAgentTasksStore((st) => st.now)
  const host = useAgentTasksStore((st) => st.host)
  const fontFamily = useEditorSettingsStore((st) => st.fontFamily)
  const display = useAgentDisplayState(agentId, agentState) ?? agentState
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [promptFeedback, setPromptFeedback] = useState<'copied' | 'failed' | null>(null)
  const runVisible = useAgentRunVisible()
  const [running, setRunning] = useState(false)
  const [runFeedback, setRunFeedback] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  // "Open in Claude": in flight, just opened (the button says so), or why it did not open (the note line).
  const [opening, setOpening] = useState(false)
  const [sessionOpened, setSessionOpened] = useState(false)
  const [sessionNote, setSessionNote] = useState<string | null>(null)
  // The agent's report: folded under the timeline until "Read the full report".
  const [unfolded, setUnfolded] = useState(false)
  const [clipped, setClipped] = useState(false)
  const footRef = useRef<HTMLElement>(null)
  // The foot's actions that did not fit on one line: the secondary folds into its icon too.
  // Remembered per set of actions (another state, or the feature switched, measures again).
  const [foldedFor, setFoldedFor] = useState<string | null>(null)

  const meta = block?.meta
  // The agent works in Claude Desktop (any machine) — and, when it is this one, its conversation can be opened.
  const desktop = AGENT_DESKTOP_SESSION_RE.test(meta?.desktopSession?.trim() ?? '')
  const sessionHere = agentDesktopSessionHere(meta, host) !== null
  const tone = agentStateTone(display)
  const live = agentIsLive(display)
  const facts = useMemo(() => agentFacts(meta ?? {}, display, now), [meta, display, now])
  const thread = useMemo(() => agentThread(meta ?? {}, display, facts), [meta, display, facts])
  const body = block?.body ?? ''
  const html = useMemo(() => (body ? htmlFromMarkdown(body, { columnWidths: false }) : ''), [body])

  const actions = agentReportActions(display, { checked, editable, session: sessionHere })
    .filter((a) => (a !== 'copyPrompt' || !!onCopyPrompt) && (a !== 'run' || (!!onRun && runVisible)) && (a !== 'reopen' || !!onReopen))
  const layout = agentFootLayout(display, actions)
  const footKey = `${display}|${actions.join(',')}`
  const folded = foldedFor === footKey
  const foot = folded && layout.secondary ? { ...layout, secondary: null, icons: [layout.secondary, ...layout.icons] } : layout

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
      const box = trigger.getBoundingClientRect()
      // Hung from a task's box (left of the text): left edges aligned, not right ones.
      const rect = trigger.dataset.agentAnchor === 'start' ? { top: box.top, bottom: box.bottom, right: box.left + el.offsetWidth } : box
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

  // A foot that wraps (long names, another language): the secondary action folds into its icon.
  useLayoutEffect(() => {
    const el = footRef.current
    if (!el || confirming || folded || !layout.secondary) return
    const buttons = Array.from(el.querySelectorAll('button'))
    if (buttons.some((b) => b.offsetTop !== buttons[0].offsetTop)) setFoldedFor(footKey)
  }, [confirming, folded, layout.secondary, footKey])

  // Is the folded report taller than its preview? Only then it offers to unfold.
  useLayoutEffect(() => {
    const el = bodyRef.current
    setClipped(!!el && !unfolded && el.scrollHeight > el.clientHeight + 1)
  }, [html, unfolded])

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

  useEffect(() => {
    if (!sessionOpened) return
    const id = setTimeout(() => setSessionOpened(false), 1600)
    return () => clearTimeout(id)
  }, [sessionOpened])

  useEffect(() => {
    if (!sessionNote) return
    const id = setTimeout(() => setSessionNote(null), 5000)
    return () => clearTimeout(id)
  }, [sessionNote])

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
    if (action === 'openSession') {
      // The menu stays open: the button says "opened", or the note line why not.
      if (opening) return
      setOpening(true)
      setSessionNote(null)
      setRunFeedback(null)
      void useAgentTasksStore.getState().openSession(agentId)
        .then(
          (res) => (res.ok ? setSessionOpened(true) : setSessionNote(res.code === 'open_failed' ? s.session.openFailed : s.session.noSession)),
          () => setSessionNote(s.session.openFailed),
        )
        .finally(() => setOpening(false))
      return
    }
    if (action === 'run') {
      // The menu stays open: it says what happened (and the task now shows as queued).
      if (running || !onRun) return
      setRunning(true)
      setRunFeedback(null)
      setSessionNote(null)
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
    } else if (action === 'reopen') {
      onReopen?.()
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
    openSession: sessionOpened ? s.session.opened : s.session.label,
    reopen: s.reopen,
    dismiss: s.dismiss,
    copyId: copied ? s.copied : s.copyId,
  }
  /** What the button says besides its name, as its tooltip. */
  const hint = (action: AgentReportAction): string | null =>
    action === 'dismiss' ? s.dismissHint
      // Copying a task that is not queued also puts it back in the queue: say so.
      : action === 'copyPrompt' && display !== 'queued' ? s.copyPromptRequeueHint
        : action === 'run' ? (display !== 'queued' ? `${s.run.requeueHint}. ${agentRunHint(t)}` : agentRunHint(t))
          : action === 'openSession' ? s.session.hint
            : action === 'reopen' ? s.reopenHint
              : null
  const done = (action: AgentReportAction) =>
    (action === 'copyId' && copied) || (action === 'copyPrompt' && promptFeedback === 'copied') || (action === 'run' && runFeedback?.tone === 'ok')
    || (action === 'openSession' && sessionOpened)
  /** `icon`: folded into its icon — the name stays for screen readers and in the tooltip. */
  const button = (action: AgentReportAction, variant: 'icon' | 'secondary' | 'primary' | 'confirm' | 'quiet') => {
    const icon = variant === 'icon' || variant === 'quiet'
    const extra = hint(action)
    return (
      <button
        key={action}
        type="button"
        className={`agent-report-btn agent-report-btn--${variant}${action === 'dismiss' ? ' agent-report-btn--danger' : ''}${done(action) ? ' is-done' : ''}`}
        title={icon ? (extra ? `${labels[action]}. ${extra}` : labels[action]) : extra ?? undefined}
        disabled={(action === 'run' && running) || (action === 'openSession' && opening)}
        onClick={() => run(action)}
      >
        {done(action) ? <Check size={14} aria-hidden /> : ACTION_ICONS[action]}
        <span aria-live={action === 'copyId' || action === 'copyPrompt' || action === 'run' || action === 'openSession' ? 'polite' : undefined}>{labels[action]}</span>
      </button>
    )
  }

  // ── Head: who, where, how long.
  const stateName = tone === 'unknown' ? display : agentStateLabel(t, tone)
  const duration = facts.durationMs !== null ? formatAgentDuration(facts.durationMs) : null
  const who = [
    // The model with its agent: "claude (opus)".
    facts.agent && facts.model ? `${facts.agent} (${facts.model})` : facts.agent ?? facts.model,
    facts.machine,
    duration && (facts.finishedAt === null && live ? tf(s.elapsed, { time: duration }) : duration),
  ].filter(Boolean).join(' · ')

  // ── Timeline.
  const when = (at: number) => formatDate(at, isSameDay(at, now) ? s.timeFormat : s.dayFormat)
  const lastSignal = Date.parse(meta?.lastSignal || '')
  const eventText = (e: AgentThreadEvent): ReactNode => {
    switch (e.kind) {
      case 'started':
        return (
          <>
            {s.thread.started}
            {facts.branch && <> · <span className="agent-report-mono">{facts.branch}</span></>}
          </>
        )
      case 'progress':
        return <span className="agent-report-progress">{e.text}</span>
      case 'question':
        return (
          <>
            <span className="agent-report-ask">{e.text ?? s.thread.question}</span>
            <span className="agent-report-hint">{desktop ? s.thread.replyHintDesktop : s.thread.replyHint}</span>
          </>
        )
      case 'failed':
        return <span className="agent-report-bad">{e.text ?? s.states.failed}</span>
      case 'finished':
        return [
          s.thread.finished,
          facts.commits !== null ? plural(s.commits, facts.commits) : null,
          facts.filesChanged !== null ? plural(s.files, facts.filesChanged) : null,
        ].filter(Boolean).join(' · ')
      case 'interrupted':
        return s.states.interrupted
      case 'noSignal':
        return Number.isFinite(lastSignal) && now >= lastSignal
          ? tf(desktop ? s.noSignalHintDesktop : s.noSignalHint, { when: formatAgentDuration(now - lastSignal) })
          : desktop ? s.noSignalUnknownDesktop : s.noSignalUnknown
    }
  }

  const strip = [
    thread.leftover.branch,
    thread.leftover.commits !== null ? plural(s.commits, thread.leftover.commits) : null,
    thread.leftover.filesChanged !== null ? plural(s.files, thread.leftover.filesChanged) : null,
  ].filter((v): v is string => !!v)

  const emptyText = !block ? (loading ? '' : s.emptyMissing) : live || display === AGENT_NO_SIGNAL ? s.emptyWorking : s.emptyFinished

  return createPortal(
    <div
      ref={popoverRef}
      className={`agent-report agent-tone--${tone}`}
      role="dialog"
      aria-label={s.report}
      aria-describedby={titleId}
      tabIndex={-1}
      contentEditable={false}
      onKeyDown={onKeyDown}
      {...OWN_KEYS_PROPS}
    >
      <header className="agent-report-head">
        <AgentStateGlyph tone={tone} size={20} />
        <div className="agent-report-who">
          <span className="agent-report-state">{stateName}</span>
          {who && <span className="agent-report-sub" title={who}>{who}</span>}
        </div>
        <button type="button" className="agent-report-close" title={t.common.close} aria-label={t.common.close} onClick={() => onClose(true)}>
          <X size={14} />
        </button>
      </header>
      <h2 className="agent-report-title" id={titleId}>{title.trim() || meta?.title || s.untitled}</h2>

      <div className="agent-report-scroll">
        {thread.events.length > 0 && (
          <ol className="agent-report-thread">
            {thread.events.map((e) => (
              <li key={e.kind} className={`agent-report-ev agent-report-ev--${e.kind}${e.now ? ' is-now' : ''}`}>
                {e.at !== null
                  ? <time dateTime={new Date(e.at).toISOString()} title={formatDate(e.at, s.dateFormat)}>{when(e.at)}</time>
                  : <span className="agent-report-ev-time" />}
                <p>{eventText(e)}</p>
              </li>
            ))}
          </ol>
        )}

        {html ? (
          <div className={`agent-report-fold${unfolded ? ' is-open' : ''}${clipped ? ' is-clipped' : ''}`}>
            <div
              ref={bodyRef}
              className="agent-report-body chat-md prose-editor"
              style={{ '--prose-font-family': proseFontStack(fontFamily) } as CSSProperties}
              onClick={onBodyClick}
            >
              <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
            {(clipped || unfolded) && (
              <button type="button" className="agent-report-more" aria-expanded={unfolded} onClick={() => setUnfolded((v) => !v)}>
                {unfolded ? s.readLess : s.readFull}
              </button>
            )}
          </div>
        ) : emptyText ? (
          <p className="agent-report-empty">{emptyText}</p>
        ) : null}

        {strip.length > 0 && (
          <p className="agent-report-strip">
            {strip.map((item) => <span key={item}>{item}</span>)}
          </p>
        )}
      </div>

      <footer ref={footRef} className="agent-report-foot">
        {confirming ? (
          <>
            <p className="agent-report-confirm" role="alert">{s.confirmDismiss}</p>
            <button ref={cancelRef} type="button" className="agent-report-btn agent-report-btn--secondary" onClick={() => setConfirming(false)}>
              <span>{t.common.cancel}</span>
            </button>
            {button('dismiss', 'confirm')}
          </>
        ) : (
          <>
            {foot.quiet.map((a) => button(a, 'quiet'))}
            <span className="agent-report-spacer" />
            {/* A run that did not start (or a prompt that had to be copied), a conversation that did not open: its own line, above the actions. */}
            {sessionNote ? <p className="agent-report-run-note" role="status">{sessionNote}</p>
              : runFeedback?.tone === 'warn' && <p className="agent-report-run-note" role="status">{runFeedback.text}</p>}
            {foot.icons.map((a) => button(a, 'icon'))}
            {foot.secondary && button(foot.secondary, 'secondary')}
            {foot.main && button(foot.main, 'primary')}
          </>
        )}
      </footer>
    </div>,
    document.body,
  )
}
