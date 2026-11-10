// @vitest-environment happy-dom
//
// lib/editorHistory.ts on REAL TipTap editors (the schema Editor.tsx registers +
// History): the history of a destroyed editor is restored on a new instance of the
// same section (its own schema), the way Editor.tsx does it on remount.
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import { redoDepth, undoDepth } from '@tiptap/pm/history'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { restoreEditorHistory, snapshotEditorHistory } from '../../src/lib/editorHistory'

const editor = (md: string) => new Editor({ extensions: [...schemaExtensions(), History], content: htmlFromMarkdown(md) })
const markdown = (ed: Editor) => htmlToMarkdown(ed.getHTML())

/** Markdown after each undo down to the bottom, then each redo back up. */
function walk(ed: Editor): string[] {
  const out: string[] = []
  while (ed.can().undo()) { ed.commands.undo(); out.push(markdown(ed)) }
  while (ed.can().redo()) { ed.commands.redo(); out.push(markdown(ed)) }
  return out
}

describe('undo history across editor instances', () => {
  it('restores undo and redo on a remounted editor', () => {
    const old = editor('# Title\n\n- [ ] task\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nfirst line')
    old.commands.setTextSelection(old.state.doc.content.size - 1)
    old.commands.insertContent(' and more')
    old.chain().selectAll().toggleBold().run()
    old.commands.setTextSelection(1)
    old.commands.insertContent('Big ')
    old.commands.undo()
    const md = markdown(old)
    const snapshot = snapshotEditorHistory(old.state, md)!
    const expected = walk(old)
    old.destroy()

    const fresh = editor(md)
    const restored = restoreEditorHistory(snapshot, fresh.state, md)
    expect(restored).not.toBeNull()
    fresh.view.updateState(restored!)
    expect(markdown(fresh)).toBe(md)
    expect(undoDepth(fresh.state)).toBeGreaterThan(0)
    expect(redoDepth(fresh.state)).toBe(1)
    expect(walk(fresh)).toEqual(expected)
    fresh.destroy()
  })

  it('is not restored over content changed while the editor was gone', () => {
    const old = editor('note')
    old.commands.setTextSelection(old.state.doc.content.size - 1)
    old.commands.insertContent(' typed')
    const snapshot = snapshotEditorHistory(old.state, markdown(old))!
    old.destroy()
    const fresh = editor('note typed\n\nadded by sync')
    expect(restoreEditorHistory(snapshot, fresh.state, 'note typed\n\nadded by sync')).toBeNull()
    fresh.destroy()
  })
})
