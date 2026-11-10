import { describe, it, expect } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorState, Plugin, TextSelection } from '@tiptap/pm/state'
import type { Command, Transaction } from '@tiptap/pm/state'
import { closeHistory, history, redo, redoDepth, undo, undoDepth } from '@tiptap/pm/history'
import { restoreEditorHistory, snapshotEditorHistory } from '../../src/lib/editorHistory'

// Every TipTap instance builds its own Schema from the same extensions: two schemas
// with the same spec but distinct node types (identity) model the old and new editor.
const spec = {
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } } },
    text: { group: 'inline' },
  },
  marks: { strong: {} },
}
const oldSchema = new Schema(spec)
const newSchema = new Schema(spec)

const docOf = (schema: Schema, ...paragraphs: string[]) =>
  schema.node('doc', null, paragraphs.map((p) => schema.node('paragraph', null, p ? schema.text(p) : undefined)))

/** A fresh editor state (empty history) plus some unrelated plugin, like TipTap's. */
const freshState = (doc: ProseMirrorNode) =>
  EditorState.create({ doc, plugins: [history(), new Plugin({ state: { init: () => 0, apply: (_tr, n: number) => n + 1 } })] })

/** One undo level: `edit` applied as its own (closed) history event. */
function edit(state: EditorState, make: (s: EditorState) => Transaction): EditorState {
  return state.apply(closeHistory(make(state)))
}

function run(state: EditorState, command: Command): EditorState {
  let next = state
  command(state, (tr) => { next = state.apply(tr) })
  return next
}

/** Old editor: "hello" → typed " world" → bolded "hello" → new paragraph → undo (one redo level). */
function editedOldState(): EditorState {
  let s = freshState(docOf(oldSchema, 'hello'))
  s = edit(s, (st) => st.tr.insertText(' world', 6))
  s = edit(s, (st) => st.tr.addMark(1, 6, oldSchema.marks.strong.create()))
  s = edit(s, (st) => st.tr.insert(st.doc.content.size, oldSchema.node('paragraph', null, oldSchema.text('second'))))
  s = run(s, undo)
  return s
}

/** The texts reached by undoing all the way down, then redoing all the way up. */
function walk(state: EditorState): string[] {
  const texts: string[] = []
  let s = state
  while (undoDepth(s) > 0) { s = run(s, undo); texts.push(s.doc.textBetween(0, s.doc.content.size, '|')) }
  while (redoDepth(s) > 0) { s = run(s, redo); texts.push(s.doc.textBetween(0, s.doc.content.size, '|')) }
  return texts
}

describe('snapshotEditorHistory', () => {
  it('is null without anything to undo or redo', () => {
    expect(snapshotEditorHistory(freshState(docOf(oldSchema, 'x')), 'x')).toBeNull()
  })

  it('captures undo and redo levels', () => {
    const snapshot = snapshotEditorHistory(editedOldState(), 'md')!
    expect(snapshot.done).toHaveLength(2)
    expect(snapshot.undone).toHaveLength(1)
    expect(snapshot.markdown).toBe('md')
  })
})

describe('restoreEditorHistory', () => {
  it('rebuilds the same undo/redo on a new editor (another schema)', () => {
    const old = editedOldState()
    const snapshot = snapshotEditorHistory(old, 'md')!
    const target = freshState(newSchema.nodeFromJSON(old.doc.toJSON()))
    const restored = restoreEditorHistory(snapshot, target, 'md')!
    expect(restored).not.toBeNull()
    expect(restored.schema).toBe(newSchema)
    expect(restored.doc.eq(target.doc)).toBe(true)
    expect(undoDepth(restored)).toBe(2)
    expect(redoDepth(restored)).toBe(1)
    expect(walk(restored)).toEqual(walk(old))
    // The undone document is made of the NEW schema's nodes.
    const undone = run(restored, undo)
    expect(undone.doc.type).toBe(newSchema.topNodeType)
    expect(undone.doc.firstChild!.type).toBe(newSchema.nodes.paragraph)
  })

  it('keeps the other plugins of the new editor, freshly initialised', () => {
    const old = editedOldState()
    const target = freshState(newSchema.nodeFromJSON(old.doc.toJSON()))
    const restored = restoreEditorHistory(snapshotEditorHistory(old, 'md')!, target, 'md')!
    expect(restored.plugins).toEqual(target.plugins)
  })

  it('keeps the new editor selection when the document is the same', () => {
    const old = editedOldState()
    const fresh = freshState(newSchema.nodeFromJSON(old.doc.toJSON()))
    const target = fresh.apply(fresh.tr.setSelection(TextSelection.create(fresh.doc, 3)))
    const restored = restoreEditorHistory(snapshotEditorHistory(old, 'md')!, target, 'md')!
    expect(restored.selection.eq(target.selection)).toBe(true)
  })

  it('is dropped when the content changed meanwhile', () => {
    const old = editedOldState()
    const snapshot = snapshotEditorHistory(old, 'md')!
    const target = freshState(docOf(newSchema, 'changed elsewhere'))
    expect(restoreEditorHistory(snapshot, target, 'changed elsewhere')).toBeNull()
  })

  it('applies on the same markdown even if it parses to a different document', () => {
    const old = editedOldState()
    const snapshot = snapshotEditorHistory(old, 'md')!
    // Same serialization, different tree (e.g. a trailing empty paragraph that
    // doesn't survive the round trip): the restored document is the snapshot's.
    const target = freshState(docOf(newSchema, 'hello world', ''))
    const restored = restoreEditorHistory(snapshot, target, 'md')!
    expect(restored).not.toBeNull()
    expect(restored.doc.eq(newSchema.nodeFromJSON(old.doc.toJSON()))).toBe(true)
    expect(walk(restored)).toEqual(walk(old))
  })

  it('survives history that went through an external, non-undoable change', () => {
    let old = editedOldState()
    // Like replaceDocKeepingSelection: an update that isn't added to the history.
    old = old.apply(old.tr.insertText('>> ', 1).setMeta('addToHistory', false))
    old = edit(old, (st) => st.tr.insertText('!', st.doc.firstChild!.nodeSize - 1))
    const snapshot = snapshotEditorHistory(old, 'md')!
    const restored = restoreEditorHistory(snapshot, freshState(newSchema.nodeFromJSON(old.doc.toJSON())), 'md')!
    expect(restored).not.toBeNull()
    expect(walk(restored)).toEqual(walk(old))
  })

  it('is null for an editor without the history plugin', () => {
    const old = editedOldState()
    const target = EditorState.create({ doc: newSchema.nodeFromJSON(old.doc.toJSON()) })
    expect(restoreEditorHistory(snapshotEditorHistory(old, 'md')!, target, 'md')).toBeNull()
  })
})
