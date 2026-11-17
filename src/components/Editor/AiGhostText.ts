import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { isHistoryTransaction } from '@tiptap/pm/history'
import { SuggestionPluginKey } from '@tiptap/suggestion'
import { dispatchOwnUndoStep } from './tableOps'
import { useAiAutocompleteStore } from '../../stores/aiAutocompleteStore'
import {
  AUTOCOMPLETE_AFTER_CHARS, AUTOCOMPLETE_BEFORE_CHARS, AUTOCOMPLETE_PAUSE_MS,
  canRequestCompletion, hasEnoughContext, remainingSuggestion,
} from '../../lib/aiAutocomplete'

// Inline AI autocomplete as ghost text (NoteFlow AI plan only; off by default — the switch
// is in Settings → AI, a local setting read live from aiAutocompleteStore).
//
// After a typing pause it asks main (`ai:complete`) to continue the text at the caret and
// shows the answer dimmed there as it streams in — a widget decoration, never part of the
// document. Tab inserts it (as its own undo step), Esc or any other edit / caret
// move drops it; typing the characters it starts with keeps the rest. One request in flight
// per editor: any edit or caret move cancels it.
//
// Never asked for: code blocks, tables, a non-empty selection, a caret that isn't at the end
// of a paragraph, too little text, an open "/" menu, an IME composition, a read-only or
// unfocused editor — nor content the AI must not see (`isAllowed`: encrypted notes, sections
// hidden from the AI, linked notes). Main re-checks the switch and the plan.

interface Ghost {
  text: string
  pos: number
}
interface GhostState {
  ghost: Ghost | null
  /** Bumped by every transaction that looks like the user typing: what arms a request. */
  typed: number
}
type GhostMeta = { type: 'set'; text: string; pos: number } | { type: 'clear' }

const ghostKey = new PluginKey<GhostState>('aiGhostText')

let requestSeq = 0

// One IPC listener per window, whatever the number of editors: the text so far of each
// request in flight goes to the editor that asked for it.
const partialHandlers = new Map<string, (text: string) => void>()
let partialsSubscribed = false
function onPartial(id: string, handler: (text: string) => void): void {
  if (!partialsSubscribed) {
    partialsSubscribed = true
    window.noteflow.onAiCompletePartial(({ requestId, text }) => partialHandlers.get(requestId)?.(text))
  }
  partialHandlers.set(id, handler)
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

/** A user edit — not undo/redo, a paste or drop, an external content sync
 *  (preventUpdate / addToHistory:false) nor this plugin's own transactions. Not enough on
 *  its own to arm a request: commands (a snippet, a "/" command, ticking a checkbox) pass
 *  it too, so the view also requires the edit to come from typed text (handleTextInput). */
function isTyping(tr: Transaction): boolean {
  if (!tr.docChanged || tr.getMeta(ghostKey)) return false
  if (tr.getMeta('addToHistory') === false || tr.getMeta('preventUpdate') || tr.getMeta('uiEvent')) return false
  return !isHistoryTransaction(tr)
}

/** The "/" menu (SlashCommands) is open: its keys and its text are not ours. */
function slashMenuOpen(state: EditorState): boolean {
  return (SuggestionPluginKey.getState(state) as { active?: boolean } | undefined)?.active === true
}

export interface AiGhostTextOptions {
  /** False for content the AI must never see (encrypted note, section hidden from the AI, linked note). Read live. */
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

  // Load the switch (and follow its changes) with the first editor of the window.
  onCreate() {
    void useAiAutocompleteStore.getState().ensureLoaded()
  },

  addProseMirrorPlugins() {
    const isAllowed = this.options.isAllowed

    let timer: ReturnType<typeof setTimeout> | null = null
    let inFlight: { id: string; pos: number; doc: EditorState['doc'] } | null = null
    // True from handleTextInput until the end of the task: ProseMirror applies typed text
    // synchronously right after calling it (also when an input rule or the bracket
    // auto-close takes it over), so the next doc change is the user's keystroke.
    // Commands never go through handleTextInput.
    let textInput = false

    const cancelPending = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (inFlight) {
        window.noteflow.aiCompleteCancel(inFlight.id)
        partialHandlers.delete(inFlight.id)
        inFlight = null
      }
    }

    const setGhost = (view: EditorView, meta: GhostMeta) => {
      view.dispatch(view.state.tr.setMeta(ghostKey, meta).setMeta('addToHistory', false))
    }

    /** Shows `text` for the request in flight, if the note and the caret are still where it was asked. */
    const showSuggestion = (view: EditorView, id: string, text: string) => {
      if (inFlight?.id !== id || view.isDestroyed) return
      if (view.state.doc !== inFlight.doc || completionPos(view.state) !== inFlight.pos) return
      const current = ghostKey.getState(view.state)?.ghost
      if (!text) {
        if (current) setGhost(view, { type: 'clear' })
      } else if (current?.text !== text) {
        setGhost(view, { type: 'set', text, pos: inFlight.pos })
      }
    }

    const request = (view: EditorView) => {
      timer = null
      const store = useAiAutocompleteStore.getState()
      if (!canRequestCompletion(store, Date.now()) || !isAllowed()) return
      if (view.isDestroyed || !view.editable || !view.hasFocus() || view.composing) return
      const state = view.state
      if (ghostKey.getState(state)?.ghost || slashMenuOpen(state)) return
      const pos = completionPos(state)
      if (pos === null) return
      const before = state.doc.textBetween(0, pos, '\n', '\n').slice(-AUTOCOMPLETE_BEFORE_CHARS)
      if (!hasEnoughContext(before)) return
      const after = state.doc.textBetween(pos, state.doc.content.size, '\n', '\n').slice(0, AUTOCOMPLETE_AFTER_CHARS)

      const id = `ac-${Date.now()}-${++requestSeq}`
      inFlight = { id, pos, doc: state.doc }
      // The text so far, as it streams in.
      onPartial(id, (text) => showSuggestion(view, id, text))
      void window.noteflow.aiComplete({ requestId: id, before, after }).then((res) => {
        partialHandlers.delete(id)
        if (inFlight?.id !== id) return // superseded or cancelled
        if (res.ok) {
          showSuggestion(view, id, res.text)
        } else {
          // Failures are silent. Main says how long to stop asking (quota, no plan, no route…).
          if (res.retryAt !== undefined) useAiAutocompleteStore.getState().blockUntil(res.retryAt)
          if (!view.isDestroyed && ghostKey.getState(view.state)?.ghost) setGhost(view, { type: 'clear' })
        }
        inFlight = null
      }).catch(() => {
        partialHandlers.delete(id)
        if (inFlight?.id === id) inFlight = null
      })
    }

    return [
      new Plugin<GhostState>({
        key: ghostKey,
        state: {
          init: () => ({ ghost: null, typed: 0 }),
          apply(tr, value, _oldState, newState) {
            const typed = isTyping(tr) ? value.typed + 1 : value.typed
            const next = (ghost: Ghost | null): GhostState =>
              ghost === value.ghost && typed === value.typed ? value : { ghost, typed }
            const meta = tr.getMeta(ghostKey) as GhostMeta | undefined
            if (meta) return next(meta.type === 'set' ? { text: meta.text, pos: meta.pos } : null)
            const ghost = value.ghost
            if (!ghost) return next(null)
            if (!tr.docChanged && !tr.selectionSet) return next(ghost)
            // Typing exactly what the suggestion starts with keeps the rest of it.
            const sel = newState.selection
            if (tr.docChanged && sel.empty && sel.from > ghost.pos && tr.mapping.map(ghost.pos, -1) === ghost.pos
              && tr.doc.content.size - tr.before.content.size === sel.from - ghost.pos
              && sel.$from.sameParent(tr.doc.resolve(ghost.pos))) {
              const rest = remainingSuggestion(ghost.text, tr.doc.textBetween(ghost.pos, sel.from, '\n', '\n'))
              if (rest !== null && completionPos(newState) === sel.from) return next({ text: rest, pos: sel.from })
            }
            if (!tr.docChanged && sel.empty && sel.from === ghost.pos) return next(ghost)
            return next(null)
          },
        },
        props: {
          decorations(state) {
            const ghost = ghostKey.getState(state)?.ghost
            if (!ghost) return null
            return DecorationSet.create(state.doc, [
              Decoration.widget(ghost.pos, () => {
                const span = document.createElement('span')
                span.className = 'nf-ai-ghost'
                span.textContent = ghost.text
                return span
              }, { side: 1, key: `ghost:${ghost.text}`, ignoreSelection: true }),
            ])
          },
          handleTextInput() {
            textInput = true
            void Promise.resolve().then(() => { textInput = false })
            return false
          },
          handleKeyDown(view, event) {
            const ghost = ghostKey.getState(view.state)?.ghost
            if (!ghost || view.composing) return false
            if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
              // Its own undo step (the history group is closed before and after: one Ctrl+Z
              // removes the suggestion only, not the typing around it). It carries our meta,
              // so it doesn't count as typing: no new request until the user types again.
              dispatchOwnUndoStep(view, view.state.tr.insertText(ghost.text, ghost.pos).setMeta(ghostKey, { type: 'clear' } satisfies GhostMeta).scrollIntoView())
              return true
            }
            if (event.key === 'Escape') {
              cancelPending()
              setGhost(view, { type: 'clear' })
              return true
            }
            return false
          },
        },
        view(editorView) {
          // Switched off (Settings → AI, any window) or the plan went away: drop everything now.
          const offStore = useAiAutocompleteStore.subscribe((s) => {
            if (s.enabled && s.available) return
            cancelPending()
            if (!editorView.isDestroyed && ghostKey.getState(editorView.state)?.ghost) setGhost(editorView, { type: 'clear' })
          })
          return {
            update(view, prevState) {
              const docChanged = view.state.doc !== prevState.doc
              const moved = !view.state.selection.eq(prevState.selection)
              if (!docChanged && !moved) return
              cancelPending()
              // Only typed text arms a request (not clicking around, undo, a paste, a snippet,
              // a "/" command, a ticked checkbox, an accepted suggestion or a synced edit),
              // and never over a live suggestion.
              const now = ghostKey.getState(view.state)
              const typed = textInput && now !== undefined && now.typed !== ghostKey.getState(prevState)?.typed
              if (typed && !now.ghost && isAllowed() && canRequestCompletion(useAiAutocompleteStore.getState(), Date.now())) {
                timer = setTimeout(() => request(view), AUTOCOMPLETE_PAUSE_MS)
              }
            },
            destroy() {
              cancelPending()
              offStore()
            },
          }
        },
      }),
    ]
  },
})
