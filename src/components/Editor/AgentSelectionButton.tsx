import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { AllSelection, TextSelection } from '@tiptap/pm/state'
import { Bot, Check, CircleAlert, Copy } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural } from '../../i18n/format'
import { queueAgentTaskItems, resolveAgentSelection, type AgentSelection } from '../../lib/agentSend'
import { agentSelectionPillPosition } from '../../lib/agentSelectionPlacement'
import { agentDisplayStateNow, copyAgentPrompt, newAgentTaskIdFor, reconcileAgentReport } from './useAgentTask'
import './agentTasks.css'

// "Send to an agent" over a text selection: a small pill next to the selected
// text with one action today — "Copy prompt" (phase 4 adds "Run" beside it).
// The tasks the selection touches are queued (one transaction) and named in
// the prompt; the rest of the selected text goes along as context
// (lib/agentSend.ts → resolveAgentSelection). Without tasks it is a text-only
// prompt and the note is not touched.
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
//   - placed off the selected text and inside the visible part of the note
//     (lib/agentSelectionPlacement.ts), following the scroll.

/** After the mouse button is released / after a selection made with the keyboard settles. */
const SHOW_AFTER_MOUSE_MS = 80
const SHOW_AFTER_KEYS_MS = 280
const FEEDBACK_MS = 1900

interface Feedback {
  text: string
  tone: 'ok' | 'warn'
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

export function AgentSelectionButton({ editor }: { editor: Editor }) {
  const t = useT()
  const s = t.editor.agentTask
  const [range, setRange] = useState<{ from: number; to: number } | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const pillRef = useRef<HTMLDivElement>(null)
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
    const onBlur = () => hide()
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
    if (!feedback) return
    const id = setTimeout(() => {
      holding.current = false
      setFeedback(null)
      setRange(null)
    }, FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [feedback])

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
        pos = agentSelectionPillPosition(
          editor.view.coordsAtPos(Math.min(range.from, size), 1),
          editor.view.coordsAtPos(Math.min(range.to, size), -1),
          { width: el.offsetWidth, height: el.offsetHeight },
          area,
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

  async function copyPrompt() {
    const sel = sendableSelection(editor)
    if (!sel) return
    holding.current = true
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
          {feedback.tone === 'ok' ? <Check size={12} aria-hidden /> : <CircleAlert size={12} aria-hidden />}
          {feedback.text}
        </span>
      ) : (
        <>
          <span className="agent-select-eyebrow" title={s.selection.label}>
            <Bot size={12} aria-hidden />
            {s.selection.eyebrow}
          </span>
          {/* Phase 4: "Run" goes here, after "Copy prompt" — one more button of the same kind. */}
          <button type="button" className="agent-select-btn" title={s.selection.copyPromptHint} onClick={() => { void copyPrompt() }}>
            <Copy size={12} aria-hidden />
            {s.copyPrompt}
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
