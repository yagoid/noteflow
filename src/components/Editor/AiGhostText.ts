import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

// SPIKE (throwaway prototype, not a shipped feature): AI autocomplete as ghost text.
//
// Off unless localStorage['nf.spike.autocomplete'] holds a NoteFlow AI model id
// ('deepseek/deepseek-v4.1-flash-1017' or 'anthropic/claude-haiku-5.5') when the
// editor mounts: without the flag the plugin isn't even registered. After a typing
// pause it asks main (`ai:complete`) for one sentence and shows it dimmed at the
// caret — a widget decoration, never part of the document. Tab inserts it (one
// undo step), Esc or any other edit / caret move drops it; typing the characters it
// starts with keeps the rest. Counters live in window.__nfSpikeStats.

export const AI_AUTOCOMPLETE_FLAG = 'nf.spike.autocomplete'

const PAUSE_MS = 600
const MIN_PREVIOUS_CHARS = 20
const BEFORE_CHARS = 1500
const AFTER_CHARS = 200

interface GhostState {
  text: string
  pos: number
}
type GhostMeta = { type: 'set'; text: string; pos: number } | { type: 'clear' }

interface SpikeStats {
  startedAt: number
  requests: number
  shown: number
  accepted: number
  dismissed: number
  cancelledInFlight: number
  empty: number
  errors: number
  acceptedChars: number
  totalMs: number
  /** Requests per hour since the first one of this session. */
  requestsPerHour: () => number
}

const ghostKey = new PluginKey<GhostState | null>('aiGhostText')

function flagModel(): string | null {
  try {
    return localStorage.getItem(AI_AUTOCOMPLETE_FLAG)?.trim() || null
  } catch {
    return null
  }
}

function stats(): SpikeStats {
  const w = window as unknown as { __nfSpikeStats?: SpikeStats }
  if (!w.__nfSpikeStats) {
    const s: SpikeStats = {
      startedAt: 0, requests: 0, shown: 0, accepted: 0, dismissed: 0, cancelledInFlight: 0,
      empty: 0, errors: 0, acceptedChars: 0, totalMs: 0,
      requestsPerHour: () => (s.startedAt ? s.requests / Math.max((Date.now() - s.startedAt) / 3_600_000, 1 / 60) : 0),
    }
    w.__nfSpikeStats = s
  }
  return w.__nfSpikeStats
}

function log(message: string) {
  const s = stats()
  // Deliberate: the spike's whole point is to read these numbers in DevTools.
  console.info(`[spike:autocomplete] ${message} · session: ${s.requests} req, ${s.shown} shown, ${s.accepted} accepted, ${s.dismissed} dismissed, ${s.cancelledInFlight} cancelled`)
}

/** Caret position worth completing at: empty selection at the end of a non-empty
 *  paragraph (plain or inside a list item), outside code blocks and tables. */
function completionPos(state: EditorState): number | null {
  const { selection } = state
  if (!selection.empty) return null
  const $pos = selection.$from
  const parent = $pos.parent
  if (parent.type.name !== 'paragraph' || parent.content.size === 0) return null
  if ($pos.parentOffset !== parent.content.size) return null
  for (let depth = $pos.depth - 1; depth > 0; depth--) {
    const name = $pos.node(depth).type.name
    if (name === 'table' || name === 'codeBlock') return null
  }
  return $pos.pos
}

export interface AiGhostTextOptions {
  /** False for content the AI must never see (encrypted note, section hidden from the AI). Read live. */
  isAllowed: () => boolean
}

export const AiGhostText = Extension.create<AiGhostTextOptions>({
  name: 'aiGhostText',

  // Above every keymap (tables 150, brackets 200, lists): Tab must reach us first,
  // but only while a suggestion is on screen — otherwise it falls through untouched.
  priority: 1000,

  addOptions() {
    return { isAllowed: () => false }
  },

  addProseMirrorPlugins() {
    if (!flagModel()) return []
    const isAllowed = this.options.isAllowed

    let timer: ReturnType<typeof setTimeout> | null = null
    let inFlight: { id: string } | null = null
    let seq = 0
    // Set by the Tab handler so the view doesn't count an accepted suggestion as dismissed.
    let justAccepted = false
    let shownMs = 0

    const cancelPending = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (inFlight) {
        window.noteflow.aiCompleteCancel(inFlight.id)
        inFlight = null
        stats().cancelledInFlight++
        log('request cancelled (kept typing / moved)')
      }
    }

    const request = (view: EditorView) => {
      timer = null
      const model = flagModel()
      if (!model || !isAllowed() || view.isDestroyed || !view.editable || !view.hasFocus() || view.composing) return
      const state = view.state
      if (ghostKey.getState(state)) return
      const pos = completionPos(state)
      if (pos === null) return
      const before = state.doc.textBetween(0, pos, '\n', '\n').slice(-BEFORE_CHARS)
      if (before.trim().length < MIN_PREVIOUS_CHARS) return
      const after = state.doc.textBetween(pos, state.doc.content.size, '\n', '\n').slice(0, AFTER_CHARS)

      const id = `ac-${Date.now()}-${++seq}`
      const doc = state.doc
      const s = stats()
      if (!s.startedAt) s.startedAt = Date.now()
      s.requests++
      inFlight = { id }
      const startedAt = performance.now()
      void window.noteflow.aiComplete({ requestId: id, before, after, model }).then((res) => {
        if (inFlight?.id !== id) return // superseded: already counted as cancelled
        inFlight = null
        const ms = Math.round(performance.now() - startedAt)
        if ('error' in res) {
          s.errors++
          log(`error after ${ms} ms: ${res.error}`)
          return
        }
        s.totalMs += ms
        if (!res.text) {
          s.empty++
          log(`empty suggestion in ${ms} ms (ttft ${res.ttftMs ?? '-'} ms)`)
          return
        }
        // The note changed or the caret moved while waiting: the suggestion no longer fits.
        if (view.isDestroyed || view.state.doc !== doc || completionPos(view.state) !== pos) return
        shownMs = ms
        s.shown++
        log(`suggestion shown in ${ms} ms (ttft ${res.ttftMs ?? '-'} ms, ${res.text.length} chars, ${model})`)
        view.dispatch(view.state.tr.setMeta(ghostKey, { type: 'set', text: res.text, pos } satisfies GhostMeta).setMeta('addToHistory', false))
      }).catch((err: unknown) => {
        if (inFlight?.id === id) inFlight = null
        s.errors++
        log(`error: ${err instanceof Error ? err.message : String(err)}`)
      })
    }

    return [
      new Plugin<GhostState | null>({
        key: ghostKey,
        state: {
          init: () => null,
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(ghostKey) as GhostMeta | undefined
            if (meta) return meta.type === 'set' ? { text: meta.text, pos: meta.pos } : null
            if (!value) return null
            if (!tr.docChanged && !tr.selectionSet) return value
            // Typing exactly what the suggestion starts with keeps the rest of it.
            const sel = newState.selection
            if (tr.docChanged && sel.empty && sel.from > value.pos && tr.mapping.map(value.pos, -1) === value.pos
              && tr.doc.content.size - tr.before.content.size === sel.from - value.pos
              && sel.$from.sameParent(tr.doc.resolve(value.pos))) {
              const typed = tr.doc.textBetween(value.pos, sel.from, '\n', '\n')
              if (typed.length < value.text.length && value.text.startsWith(typed) && completionPos(newState) === sel.from) {
                return { text: value.text.slice(typed.length), pos: sel.from }
              }
            }
            if (!tr.docChanged && sel.empty && sel.from === value.pos) return value
            return null
          },
        },
        props: {
          decorations(state) {
            const ghost = ghostKey.getState(state)
            if (!ghost) return null
            return DecorationSet.create(state.doc, [
              Decoration.widget(ghost.pos, () => {
                const span = document.createElement('span')
                span.className = 'nf-ai-ghost'
                span.textContent = ghost.text
                span.style.color = 'rgb(var(--text-muted))'
                span.style.opacity = '0.75'
                span.style.pointerEvents = 'none'
                return span
              }, { side: 1, key: `ghost:${ghost.text}`, ignoreSelection: true }),
            ])
          },
          handleKeyDown(view, event) {
            const ghost = ghostKey.getState(view.state)
            if (!ghost || view.composing) return false
            if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
              justAccepted = true
              const s = stats()
              s.accepted++
              s.acceptedChars += ghost.text.length
              log(`ACCEPTED (${ghost.text.length} chars, arrived in ${shownMs} ms)`)
              // One transaction = one undo step.
              view.dispatch(view.state.tr.insertText(ghost.text, ghost.pos).setMeta(ghostKey, { type: 'clear' } satisfies GhostMeta).scrollIntoView())
              return true
            }
            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(ghostKey, { type: 'clear' } satisfies GhostMeta).setMeta('addToHistory', false))
              return true
            }
            return false
          },
        },
        view() {
          return {
            update(view, prevState) {
              const prevGhost = ghostKey.getState(prevState)
              const ghost = ghostKey.getState(view.state)
              if (prevGhost && !ghost) {
                if (justAccepted) justAccepted = false
                else { stats().dismissed++; log('dismissed') }
              }
              const docChanged = view.state.doc !== prevState.doc
              const moved = !view.state.selection.eq(prevState.selection)
              if (!docChanged && !moved) return
              cancelPending()
              // Only typing arms a request (not clicking around), and never over a live suggestion.
              if (docChanged && !ghost) timer = setTimeout(() => request(view), PAUSE_MS)
            },
            destroy() {
              cancelPending()
            },
          }
        },
      }),
    ]
  },
})
