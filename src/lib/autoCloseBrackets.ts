import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Command, EditorState, Transaction } from '@tiptap/pm/state'

// IDE-style bracket auto-closing for the TipTap editor (wrapped as an extension
// in components/Editor/AutoCloseBrackets.ts). Kept here, free of DOM/view code,
// so the whole behaviour runs against a bare EditorState in the vitest node env.
//
// Only `()` for now. Rules:
// - `(` with an empty selection → `(|)`, unless the next character is a letter
//   or digit (typing in front of a word must not leave a stray `)`).
// - `(` with a text selection inside one textblock → `(selection)`, selection kept.
// - `)` right before an auto-inserted `)` steps over it instead of doubling it.
// - Backspace inside an empty auto-inserted pair `(|)` deletes both characters.
// "Auto-inserted" is tracked in plugin state, so `)`s the user typed (or that
// came from a paste/undo) are never skipped or eaten. An input rule that
// consumes the typed `)` (image `![alt](src)`) also drops the auto-inserted one.

export const OPEN_BRACKET = '('
export const CLOSE_BRACKET = ')'

/** Whether typing `(` before `nextChar` (the character right of the caret, ''
 *  at the end of the block) should insert the closing `)` too. */
export function shouldAutoClose(nextChar: string): boolean {
  return !/^[\p{L}\p{N}]/u.test(nextChar)
}

/** A pair this plugin inserted: positions (in the current doc) of its `(` and
 *  `)`. It stays "live" while the caret sits inside it (between the two, same
 *  textblock) and both brackets are still there. */
export interface AutoClosePair {
  open: number
  close: number
}

export type AutoCloseState = AutoClosePair[]

interface AutoCloseMeta {
  /** Pair just inserted by the plugin. */
  add?: AutoClosePair
}

export const autoCloseKey = new PluginKey<AutoCloseState>('autoCloseBrackets')

/** Character right after `pos` within its textblock ('' at the block end; inline
 *  leaf nodes such as images read as U+FFFC). */
function charAfter(state: EditorState, pos: number): string {
  const end = state.doc.resolve(pos).end()
  return pos < end ? state.doc.textBetween(pos, pos + 1, '', String.fromCharCode(0xfffc)) : ''
}

/** The live pair whose `)` sits at `pos`, if any. */
function trackedPairAt(state: EditorState, pos: number): AutoClosePair | undefined {
  return (autoCloseKey.getState(state) ?? []).find((p) => p.close === pos)
}

/** Whether the pair is still live in `state`. Deleted brackets are caught by
 *  re-reading the characters at the mapped positions: `mapResult().deletedAfter`
 *  can't tell, since it also flags a pure insertion at that position (typing
 *  right after the `(`). */
function isLive(state: EditorState, { open, close }: AutoClosePair): boolean {
  const sel = state.selection
  if (close >= state.doc.content.size) return false
  const $close = state.doc.resolve(close)
  return (
    sel.empty &&
    sel.head > open &&
    sel.head <= close &&
    state.doc.resolve(open).start() === $close.start() &&
    charAfter(state, open) === OPEN_BRACKET &&
    charAfter(state, close) === CLOSE_BRACKET
  )
}

function applyState(tr: Transaction, value: AutoCloseState, state: EditorState): AutoCloseState {
  // assoc 1: text inserted right before a bracket pushes it to the right.
  let pairs: AutoClosePair[] = tr.docChanged
    ? value.map(({ open, close }) => ({ open: tr.mapping.map(open, 1), close: tr.mapping.map(close, 1) }))
    : value
  const meta = tr.getMeta(autoCloseKey) as AutoCloseMeta | undefined
  if (meta?.add) pairs = [...pairs, meta.add]
  if (pairs.length === 0) return value.length === 0 ? value : []
  return pairs.filter((pair) => isLive(state, pair))
}

/**
 * Transaction for text typed over [from, to], or null to let the editor insert
 * it normally. Called from `handleTextInput`; [from, to] must match the current
 * selection (DOM-diff input can report a narrower range — then we stay out).
 */
export function autoCloseTextInput(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction | null {
  const sel = state.selection
  if (!(sel instanceof TextSelection) || sel.from !== from || sel.to !== to) return null
  if (!sel.$from.parent.inlineContent) return null

  if (text === OPEN_BRACKET) {
    if (sel.empty) {
      if (!shouldAutoClose(charAfter(state, from))) return null
      const tr = state.tr.insertText(OPEN_BRACKET + CLOSE_BRACKET, from)
      tr.setSelection(TextSelection.create(tr.doc, from + 1))
      tr.setMeta(autoCloseKey, { add: { open: from, close: from + 1 } } satisfies AutoCloseMeta)
      return tr.scrollIntoView()
    }
    // Wrap a selection that stays inside one textblock; a cross-block one is
    // replaced by `(` as usual.
    if (!sel.$from.sameParent(sel.$to)) return null
    const tr = state.tr.insertText(CLOSE_BRACKET, to).insertText(OPEN_BRACKET, from)
    tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1))
    return tr.scrollIntoView()
  }

  if (text === CLOSE_BRACKET && sel.empty && trackedPairAt(state, from)) {
    return state.tr.setSelection(TextSelection.create(state.doc, from + 1)).scrollIntoView()
  }

  return null
}

/** Backspace inside an empty auto-inserted pair `(|)`: delete both brackets. */
export const deleteAutoClosedPair: Command = (state, dispatch) => {
  const sel = state.selection
  if (!(sel instanceof TextSelection) || !sel.empty) return false
  const pos = sel.from
  // Empty pair: its `(` is right before the caret, its `)` right after.
  if (trackedPairAt(state, pos)?.open !== pos - 1) return false
  dispatch?.(state.tr.delete(pos - 1, pos + 1).scrollIntoView())
  return true
}

/**
 * TipTap's input-rules plugin always handles text input before ours, so a `)`
 * typed right before an auto-inserted `)` can be consumed by a rule ending in
 * `)` (the image rule `![alt](src)`) and never reach our step-over: the rule
 * fires but leaves our `)` dangling after its result. Returns the transaction
 * that removes it, or null. TipTap tags its rule transactions with a meta keyed
 * by the input-rules plugin (spec flag `isInputRules`) carrying the typed `text`.
 */
export function dropClosedByInputRule(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  const oldSel = oldState.selection
  if (!oldSel.empty || !trackedPairAt(oldState, oldSel.head)) return null
  const inputRules = newState.plugins.find((p) => (p.spec as { isInputRules?: boolean }).isInputRules)
  if (!inputRules) return null
  const closedByRule = transactions.some(
    (tr) => (tr.getMeta(inputRules) as { text?: string } | undefined)?.text === CLOSE_BRACKET,
  )
  if (!closedByRule) return null
  const pos = transactions.reduce((p, tr) => tr.mapping.map(p, 1), oldSel.head)
  if (pos >= newState.doc.content.size || charAfter(newState, pos) !== CLOSE_BRACKET) return null
  return newState.tr.delete(pos, pos + 1)
}

export function createAutoCloseBracketsPlugin(): Plugin<AutoCloseState> {
  return new Plugin<AutoCloseState>({
    key: autoCloseKey,
    state: {
      init: () => [],
      apply: (tr, value, _old, state) => applyState(tr, value, state),
    },
    appendTransaction: dropClosedByInputRule,
    props: {
      handleTextInput(view, from, to, text) {
        // IME composition owns its text: never rewrite it mid-composition.
        if (view.composing) return false
        const tr = autoCloseTextInput(view.state, from, to, text)
        if (!tr) return false
        view.dispatch(tr)
        return true
      },
    },
  })
}
