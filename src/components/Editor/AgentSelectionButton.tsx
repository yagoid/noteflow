import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { AllSelection, TextSelection } from '@tiptap/pm/state'
import { Check, CircleAlert, Play } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { withTasksQueued } from '../../lib/agentRun'
import { queueAgentTaskItems, resolveAgentSelection, type AgentSelection } from '../../lib/agentSend'
import { agentSelectionPillPosition } from '../../lib/agentSelectionPlacement'
import {
  agentDisplayStateNow,
  agentRunAgentName,
  agentRunFeedback,
  agentRunHint,
  copyAgentPrompt,
  newAgentTaskIdFor,
  prepareAgentRun,
  reconcileAgentReport,
  runAgentTasks,
  useAgentRunVisible,
} from './useAgentTask'
import { AgentHandOverGlyph } from './AgentGlyphs'
import './agentTasks.css'

// "Send to an agent" over a text selection: a small round drop next to the
// selected text — one glyph (the dashed tick with a spark) — that opens to the
// right on hover or focus with two actions: "Copy prompt" and "▶ Send to
// <agent>" (Run: launch the agent of the settings on it). Both send the same thing: the tasks the selection touches
// are queued (one transaction) and named in the prompt; the rest of the
// selected text goes along as context (lib/agentSend.ts →
// resolveAgentSelection). Without tasks it is a text-only prompt and the note
// is not touched. "Run" asks for the note's project folder first when it has
// none: cancelling that dialog leaves everything as it was.
//
// Mounted by Editor.tsx only with the feature on, in an editable, non-plain
// editor. It must never get in the way of writing:
//   - only for a non-empty TEXT selection (or "select all") with some text in
//     it, while the editor has the focus — not for selected table cells nor a
//     selected block (a drawing, a board, an image);
//   - never while the mouse button is down (a drag is still choosing), and a
//     moment after the selection settles (extending it with Shift+arrows does
//     not make it flicker);
//   - gone as soon as the selection changes or collapses (typing does both);
//   - its press never takes the focus nor the selection from the editor;
//   - placed off the selected text — right of its last line when that line
//     leaves room, else above it — and inside the visible part of the note
//     (lib/agentSelectionPlacement.ts), following the scroll.

/** After the mouse button is released / after a selection made with the keyboard settles. */
const SHOW_AFTER_MOUSE_MS = 80
const SHOW_AFTER_KEYS_MS = 280
const FEEDBACK_MS = 1900
/** A run that did not start: its reason stays longer, then the buttons come back. */
const RUN_ERROR_MS = 5000

interface Feedback {
  text: string
  tone: 'ok' | 'warn'
  /** A run is on its way: no icon of "done", and it does not time out. */
  pending?: boolean
  /** A run that failed: afterwards the pill offers its actions again ("Copy prompt" still works). */
  retry?: boolean
}

/** The selection the pill is for, or null when this is not a moment for it. */
function sendableSelection(editor: Editor): { from: number; to: number } | null {
  if (editor.isDestroyed || !editor.isEditable || !editor.view.hasFocus() || editor.view.composing) return null
  const sel = editor.state.selection
  if (sel.empty || !(sel instanceof TextSelection || sel instanceof AllSelection)) return null
  // Something to send: not just the gap between two blocks, nor blank space.
  if (!editor.state.doc.textBetween(sel.from, sel.to, ' ').trim()) return null
  return { from: sel.from, to: sel.to }
}

/**
 * The empty stretch right of the selection's last line, for the pill
 * (agentSelectionPillPosition): from where the text of that line ends to the
 * right edge of its paragraph — which already leaves out a task's date and
 * agent chip (beside the text, or in the gutter in Readable) and the next
 * table cell. Null when the paragraph goes on to another line (this one runs
 * to the edge) or the selection does not end inside a paragraph.
 */
/**
 * Where the selection really ends, for placing the pill: one that ends at the
 * very start of a paragraph (dragged down to the next line's start) selects
 * nothing of it — its last line is the one before.
 */
function lastSelectedPos(editor: Editor, from: number, to: number): number {
  const $to = editor.state.doc.resolve(to)
  if ($to.parentOffset !== 0 || !$to.parent.isTextblock || to <= from + 1) return to
  const back = TextSelection.near(editor.state.doc.resolve(to - 1), -1).from
  return back > from && back < to ? back : to
}

function emptyAfterSelection(editor: Editor, to: number, end: { top: number }): { left: number; right: number } | null {
  const $to = editor.state.doc.resolve(to)
  if (!$to.parent.isTextblock || $to.depth === 0) return null
  const lineEnd = editor.view.coordsAtPos($to.end(), -1)
  if (Math.abs(lineEnd.top - end.top) > 2) return null
  const block = editor.view.nodeDOM($to.before())
  if (!(block instanceof HTMLElement)) return null
  return { left: lineEnd.right, right: block.getBoundingClientRect().right }
}

export function AgentSelectionButton({ editor }: { editor: Editor }) {
  const t = useT()
  const s = t.editor.agentTask
  const [range, setRange] = useState<{ from: number; to: number } | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const runVisible = useAgentRunVisible()
  const pillRef = useRef<HTMLDivElement>(null)
  // The folded actions: the pill is placed for its OPEN width, so opening never takes it off the note.
  const moreRef = useRef<HTMLSpanElement>(null)
  // While the feedback of a copy shows, the edit that queued the tasks must not hide it.
  const holding = useRef(false)

  useEffect(() => {
    let pressed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const cancel = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const hide = () => {
      cancel()
      holding.current = false
      setFeedback(null)
      setRange(null)
    }
    const showSoon = (ms: number) => {
      cancel()
      timer = setTimeout(() => {
        timer = null
        if (!pressed) setRange(sendableSelection(editor))
      }, ms)
    }
    const onSelection = () => {
      hide()
      if (!pressed) showSoon(SHOW_AFTER_KEYS_MS)
    }
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      // An edit under the pill (typing replaces the selection; an external change may move it).
      if (transaction.docChanged && !holding.current) onSelection()
    }
    // Not while it is sending or saying what happened: the folder dialog and the
    // terminal that opens both take the focus away.
    const onBlur = () => { if (!holding.current) hide() }
    const onMouseDown = () => {
      pressed = true
      hide()
    }
    const onMouseUp = () => {
      if (!pressed) return
      pressed = false
      showSoon(SHOW_AFTER_MOUSE_MS)
    }
    const dom = editor.view.dom
    editor.on('selectionUpdate', onSelection)
    editor.on('transaction', onTransaction)
    editor.on('blur', onBlur)
    dom.addEventListener('mousedown', onMouseDown)
    // On the document: a drag may end outside the editor.
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      cancel()
      editor.off('selectionUpdate', onSelection)
      editor.off('transaction', onTransaction)
      editor.off('blur', onBlur)
      dom.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [editor])

  useEffect(() => {
    if (!feedback || feedback.pending) return
    const id = setTimeout(() => {
      holding.current = false
      setFeedback(null)
      setRange(feedback.retry ? sendableSelection(editor) : null)
    }, feedback.retry ? RUN_ERROR_MS : FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [feedback, editor])

  // Placement: from the pill's measured size, again on every render (the
  // feedback changes its width), scroll and resize.
  useLayoutEffect(() => {
    const el = pillRef.current
    if (!range || !el) return
    const place = () => {
      if (editor.isDestroyed) return
      const size = editor.state.doc.content.size
      const scroller = editor.view.dom.closest('.editor-scroll')?.getBoundingClientRect()
      const area = {
        top: Math.max(0, scroller?.top ?? 0),
        bottom: Math.min(window.innerHeight, scroller?.bottom ?? window.innerHeight),
        left: Math.max(0, scroller?.left ?? 0),
        right: Math.min(window.innerWidth, scroller?.right ?? window.innerWidth),
      }
      let pos: { top: number; left: number } | null = null
      try {
        const to = lastSelectedPos(editor, range.from, Math.min(range.to, size))
        const end = editor.view.coordsAtPos(to, -1)
        pos = agentSelectionPillPosition(
          editor.view.coordsAtPos(Math.min(range.from, size), 1),
          end,
          { width: el.offsetWidth + (moreRef.current && !moreRef.current.offsetWidth ? moreRef.current.scrollWidth : 0), height: el.offsetHeight },
          area,
          emptyAfterSelection(editor, to, end),
        )
      } catch {
        pos = null // a position the view cannot map right now
      }
      el.style.visibility = pos ? 'visible' : 'hidden'
      if (pos) {
        el.style.top = `${Math.round(pos.top)}px`
        el.style.left = `${Math.round(pos.left)}px`
      }
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  })

  if (!range) return null

  /** "Copy prompt" and "Run": the same selection, queued the same way; only where the prompt goes differs. */
  async function send(mode: 'copy' | 'run') {
    const sel = sendableSelection(editor)
    if (!sel || holding.current) return
    holding.current = true
    if (mode === 'run') {
      // Everything that can stop the run FIRST (the folder, the approval of a custom command, the
      // agent installed): a run that cannot start — or a dialog closed — leaves the note untouched.
      const doc = editor.state.doc
      setFeedback({ text: s.run.starting, tone: 'ok', pending: true })
      const blocked = await prepareAgentRun(editor)
      const said = blocked ? agentRunFeedback(t, blocked) : null
      if (said) {
        setFeedback({ ...said, retry: true })
        return
      }
      if (blocked || editor.isDestroyed || editor.state.doc !== doc) {
        // Cancelled — or the note changed under the dialog: the selection is no longer what was pressed.
        holding.current = false
        setFeedback(null)
        if (!blocked && !editor.isDestroyed) setRange(null)
        return
      }
    }
    let found: AgentSelection
    let ids: string[] = []
    try {
      // Reading the selection can fail on a shape the serializer does not expect:
      // then nothing is queued (the transaction below is only dispatched whole).
      found = resolveAgentSelection(editor.state.doc, sel.from, sel.to, agentDisplayStateNow)
      if (found.tasks.length > 0) {
        // Every task of the selection in ONE transaction (one undo takes them all back).
        const tr = editor.state.tr
        ids = queueAgentTaskItems(tr, found.tasks, (taken) => newAgentTaskIdFor(editor, taken))
        if (tr.docChanged) editor.view.dispatch(tr)
      }
    } catch (err) {
      console.error('Failed to read the selection for an agent prompt:', err)
      setFeedback({ text: s.copyFailed, tone: 'warn' })
      return
    }
    // A task that was failed / interrupted / to review / lost: its report follows its line.
    for (const task of found.tasks) if (task.id && task.state !== 'queued') reconcileAgentReport(editor, task.id)
    if (mode === 'run') {
      // A launch that still fails now has already queued the tasks: the message says they stay queued.
      const said = agentRunFeedback(t, withTasksQueued(await runAgentTasks(editor, ids, found.context), ids.length > 0))
      if (!said) {
        holding.current = false
        setFeedback(null)
        return
      }
      const failed = said.tone === 'warn'
      setFeedback(
        // Every task of the selection was left out: say what was sent instead.
        !failed && ids.length === 0 && found.skipped > 0 ? { text: s.run.sentTextOnly, tone: 'warn' } : { ...said, retry: failed },
      )
      return
    }
    const copied = await copyAgentPrompt(editor, ids, found.context)
    setFeedback(
      !copied ? { text: s.copyFailed, tone: 'warn' }
        : ids.length > 0 ? { text: plural(s.selection.copiedTasks, ids.length), tone: 'ok' }
          : found.skipped > 0 ? { text: s.selection.copiedTextOnly, tone: 'warn' }
            : { text: s.promptCopied, tone: 'ok' },
    )
  }

  return createPortal(
    <div
      ref={pillRef}
      className={`agent-select${feedback ? ` agent-select--${feedback.tone}` : ''}`}
      role="toolbar"
      aria-label={s.selection.label}
      // A press here is not a click in the note: the editor keeps its focus and its selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      {feedback ? (
        <span className="agent-select-feedback" role="status">
          {feedback.pending ? <Play size={12} aria-hidden /> : feedback.tone === 'ok' ? <Check size={12} aria-hidden /> : <CircleAlert size={12} aria-hidden />}
          {feedback.text}
        </span>
      ) : (
        <>
          <span className="agent-select-drop" title={s.selection.label}>
            <AgentHandOverGlyph size={16} />
          </span>
          <span ref={moreRef} className="agent-select-more">
            <button type="button" className="agent-select-btn" title={s.selection.copyPromptHint} onClick={() => { void send('copy') }}>
              {s.copyPrompt}
            </button>
            {runVisible && (
              <button type="button" className="agent-select-btn agent-select-btn--run" title={agentRunHint(t)} onClick={() => { void send('run') }}>
                <Play size={10} className="agent-select-play" aria-hidden />
                {tf(s.selection.sendTo, { agent: agentRunAgentName(t) })}
              </button>
            )}
          </span>
        </>
      )}
    </div>,
    document.body,
  )
}
