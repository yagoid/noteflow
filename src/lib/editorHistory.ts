import { closeHistory, history, redo, redoDepth, undo, undoDepth } from '@tiptap/pm/history'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorState, Selection } from '@tiptap/pm/state'
import type { Command, PluginKey, Transaction } from '@tiptap/pm/state'
import { Step } from '@tiptap/pm/transform'

/**
 * Carries a TipTap editor's undo/redo history over to a NEW editor instance of the
 * same section (the rich editor is keyed by section, so a section/note switch or
 * leaving the view destroys it with its history — see lib/undoHistoryCache.ts).
 *
 * The history can't travel as the old EditorState: every TipTap instance builds its
 * own Schema, ProseMirror compares node/mark types by identity, and the old schema
 * keeps the destroyed editor alive. So it's snapshotted as schema-free JSON — the
 * document before the oldest undo level plus each undo level's (and redo level's)
 * steps — and replayed on the new instance's schema. Only restored onto the very
 * document it ends at (an update made meanwhile — sync, CLI, agent, another
 * window — must not be silently reverted by Ctrl+Z, and that saved), and the replay
 * is checked to land on it exactly; anything off and the history is dropped.
 */

// prosemirror-history's (module-level) plugin key: shared by every editor's history plugin.
const HISTORY_KEY = history().spec.key as PluginKey

interface HistoryGroup {
  /** Selection before the change (what undoing it restores). Selection JSON. */
  selection: unknown
  /** Step JSON, applied in order. */
  steps: unknown[]
}

export interface EditorHistorySnapshot {
  /** The editor's markdown when snapshotted. */
  markdown: string
  /** Document the history ends at (the editor's), as JSON. */
  doc: unknown
  /** Document before the oldest undo level, as JSON. */
  base: unknown
  /** Undo levels, oldest first: replayed on `base` they rebuild `doc`. */
  done: HistoryGroup[]
  /** Redo levels, next redo first: replayed on `doc`. */
  undone: HistoryGroup[]
}

function commandTransaction(state: EditorState, command: Command): Transaction | null {
  const out: Transaction[] = []
  command(state, (tr) => { out.push(tr) })
  return out[0] ?? null
}

function selectionFromJSON(doc: ProseMirrorNode, json: unknown): Selection {
  try {
    return Selection.fromJSON(doc, json)
  } catch {
    return Selection.atStart(doc)
  }
}

/** Snapshot of `state`'s history (null if there's nothing to undo or redo). */
export function snapshotEditorHistory(state: EditorState, markdown: string): EditorHistorySnapshot | null {
  const plugin = HISTORY_KEY.get(state)
  const undoLevels = undoDepth(state)
  const redoLevels = redoDepth(state)
  if (!plugin || (undoLevels === 0 && redoLevels === 0)) return null
  // Only the history plugin: undoing/redoing below runs no other plugin's state.
  const start = state.reconfigure({ plugins: [plugin] })

  const done: HistoryGroup[] = []
  let s = start
  for (let i = 0; i < undoLevels; i++) {
    const tr = commandTransaction(s, undo)
    if (!tr) break
    // The undo takes the doc back one level; its steps inverted (last first) redo it.
    const steps: unknown[] = []
    for (let k = tr.steps.length - 1; k >= 0; k--) steps.push(tr.steps[k].invert(tr.docs[k]).toJSON())
    s = s.apply(tr)
    done.unshift({ selection: s.selection.toJSON(), steps })
  }
  const base = s.doc.toJSON()

  const undone: HistoryGroup[] = []
  s = start
  for (let i = 0; i < redoLevels; i++) {
    const tr = commandTransaction(s, redo)
    if (!tr) break
    undone.push({ selection: s.selection.toJSON(), steps: tr.steps.map((step) => step.toJSON()) })
    s = s.apply(tr)
  }

  return { markdown, doc: state.doc.toJSON(), base, done, undone }
}

/**
 * `target` (a fresh editor's state, parsed from `content`) with the snapshot's
 * history, or null if it doesn't apply. It applies when `content` is the markdown
 * the snapshot was taken at, or the document is the same: then the restored
 * document is the snapshot's (same serialization, so nothing to save). The
 * selection is `target`'s when the documents are equal, else the start.
 */
export function restoreEditorHistory(
  snapshot: EditorHistorySnapshot,
  target: EditorState,
  content: string,
): EditorState | null {
  const plugin = HISTORY_KEY.get(target)
  if (!plugin) return null
  try {
    const { schema } = target
    const expected = ProseMirrorNode.fromJSON(schema, snapshot.doc)
    const sameDoc = expected.eq(target.doc)
    if (!sameDoc && snapshot.markdown !== content) return null

    let s = EditorState.create({ doc: ProseMirrorNode.fromJSON(schema, snapshot.base), plugins: [plugin] })
    const replay = (group: HistoryGroup) => {
      // Selection first (no steps: the history ignores it), recorded as the level's "before".
      s = s.apply(s.tr.setSelection(selectionFromJSON(s.doc, group.selection)))
      const tr = closeHistory(s.tr)
      for (const step of group.steps) tr.step(Step.fromJSON(schema, step))
      s = s.apply(tr)
    }
    snapshot.done.forEach(replay)
    snapshot.undone.forEach(replay)
    for (let i = 0; i < snapshot.undone.length; i++) {
      const tr = commandTransaction(s, undo)
      if (!tr) return null
      s = s.apply(tr)
    }
    if (!s.doc.eq(expected)) return null

    const selection = sameDoc ? selectionFromJSON(s.doc, target.selection.toJSON()) : Selection.atStart(s.doc)
    // Closed: the next edit opens its own undo level.
    s = s.apply(closeHistory(s.tr.setSelection(selection)))
    // The rest of the editor's plugins start fresh on the restored document.
    return s.reconfigure({ plugins: target.plugins })
  } catch {
    return null
  }
}
