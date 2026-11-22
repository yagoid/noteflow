// @vitest-environment happy-dom
//
// Moving list items (src/lib/listItemMove.ts) on the editor's REAL schema and
// markdown pipeline: drag & drop of tasks, Alt+↑/↓, "move checked items to the
// bottom" and its slash command. Every move must keep the subtree, be one
// transaction (one undo step), and save to markdown that reloads to the same
// document.

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { ListItemMove } from '../../src/components/Editor/ListItemMove'
import { htmlFromMarkdown } from '../../src/lib/markdownHtml'
import {
  checkItemMove,
  moveItemBy,
  moveListItem,
  movedOrder,
  sortCheckedToBottom,
  sortedIndexOnToggle,
  toggleTask,
  type ListSlot,
} from '../../src/lib/listItemMove'
import { load, save } from '../helpers/editorPipeline'

function stateOf(md: string): EditorState {
  return EditorState.create({ doc: load(md) })
}

/** Position of the list item whose own text starts with `text`. */
function itemPos(doc: PMNode, text: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found >= 0) return false
    if ((node.type.name === 'taskItem' || node.type.name === 'listItem') && node.firstChild?.textContent.startsWith(text)) {
      found = pos
      return false
    }
    return true
  })
  if (found < 0) throw new Error(`no item "${text}"`)
  return found
}

/** The list holding the item `text`, and the item's index in it. */
function slotOf(doc: PMNode, text: string): ListSlot {
  const $pos = doc.resolve(itemPos(doc, text))
  return { listPos: $pos.before(), index: $pos.index() }
}

/** Moves item `text` to `slot` and returns the saved markdown (checking it reloads identically). */
function moved(md: string, text: string, slot: (doc: PMNode) => ListSlot): string {
  const state = stateOf(md)
  const tr = state.tr
  expect(moveListItem(tr, itemPos(state.doc, text), slot(state.doc))).not.toBeNull()
  const out = save(tr.doc)
  expect(load(out).toJSON()).toEqual(tr.doc.toJSON())
  return out
}

describe('moveListItem', () => {
  const md = '- [ ] a\n- [ ] b\n  - [ ] b1\n  - [x] b2\n- [x] c'

  it('moves a task with its subtasks among its siblings', () => {
    expect(moved(md, 'b', (doc) => ({ ...slotOf(doc, 'a'), index: 0 })))
      .toBe('- [ ] b\n  - [ ] b1\n  - [x] b2\n- [ ] a\n- [x] c')
    expect(moved(md, 'a', (doc) => ({ ...slotOf(doc, 'a'), index: 3 })))
      .toBe('- [ ] b\n  - [ ] b1\n  - [x] b2\n- [x] c\n- [ ] a')
  })

  it('moves a task into a sub-list and a subtask out of it', () => {
    expect(moved(md, 'c', (doc) => ({ ...slotOf(doc, 'b1'), index: 1 })))
      .toBe('- [ ] a\n- [ ] b\n  - [ ] b1\n  - [x] c\n  - [x] b2')
    expect(moved(md, 'b2', (doc) => ({ ...slotOf(doc, 'a'), index: 0 })))
      .toBe('- [x] b2\n- [ ] a\n- [ ] b\n  - [ ] b1\n- [x] c')
  })

  it('removes a sub-list left without items', () => {
    const out = moved('- [ ] a\n  - [ ] a1\n- [ ] b', 'a1', (doc) => ({ ...slotOf(doc, 'b'), index: 2 }))
    expect(out).toBe('- [ ] a\n- [ ] b\n- [ ] a1')
  })

  it('moves a task between two task lists, removing the emptied one', () => {
    const src = '- [ ] a\n- [ ] b\n\ntext\n\n- [ ] z'
    expect(moved(src, 'z', (doc) => ({ ...slotOf(doc, 'a'), index: 1 })))
      .toBe('- [ ] a\n- [ ] z\n- [ ] b\n\ntext')
  })

  it('keeps alarms, deadlines and importance on the moved task', () => {
    const src = '- [ ] a 📅 2026-12-01 ⏰ 09:00 🔺high\n- [ ] b'
    expect(moved(src, 'a', (doc) => ({ ...slotOf(doc, 'a'), index: 2 })))
      .toBe('- [ ] b\n- [ ] a 📅 2026-12-01 ⏰ 09:00 🔺high')
  })

  it('refuses its own subtree, other list kinds, and treats its own place as a no-op', () => {
    const doc = load('- [ ] a\n  - [ ] a1\n- [ ] b\n\n- x')
    const a = itemPos(doc, 'a')
    expect(checkItemMove(doc, a, { ...slotOf(doc, 'a1'), index: 1 })).toBe('invalid')
    expect(checkItemMove(doc, a, { ...slotOf(doc, 'x'), index: 0 })).toBe('invalid')
    expect(checkItemMove(doc, a, { ...slotOf(doc, 'a'), index: 0 })).toBe('noop')
    expect(checkItemMove(doc, a, { ...slotOf(doc, 'a'), index: 1 })).toBe('noop')
    expect(checkItemMove(doc, a, { ...slotOf(doc, 'a'), index: 2 })).toBe('ok')
    const tr = EditorState.create({ doc }).tr
    expect(moveListItem(tr, a, { ...slotOf(doc, 'a'), index: 0 })).toBeNull()
    expect(tr.docChanged).toBe(false)
  })

  it('keeps a caret inside the moved item in it', () => {
    let state = stateOf('- [ ] alpha\n- [ ] beta')
    const beta = itemPos(state.doc, 'beta')
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, beta + 4)))
    const tr = state.tr
    const at = moveListItem(tr, beta, { ...slotOf(state.doc, 'alpha'), index: 0 })!
    expect(tr.selection.from).toBe(at + 4)
    expect(tr.doc.resolve(tr.selection.from).parent.textContent).toBe('beta')
  })
})

describe('move checked items to the bottom', () => {
  it('sortedIndexOnToggle: checked → end; unchecked → above the first checked sibling, or stays', () => {
    const list = (md: string) => load(md).firstChild!
    const l = list('- [ ] a\n- [ ] b\n- [x] c\n- [x] d')
    expect(sortedIndexOnToggle(l, 0, true)).toBe(3)
    expect(sortedIndexOnToggle(l, 3, false)).toBe(2)
    expect(sortedIndexOnToggle(l, 2, false)).toBe(2)
    expect(sortedIndexOnToggle(list('- [ ] a\n- [x] b'), 1, false)).toBe(1)
    expect(sortedIndexOnToggle(list('- [x] a\n- [ ] b'), 0, false)).toBe(0)
    expect(sortedIndexOnToggle(list('- [ ] a\n- [ ] b'), 1, false)).toBe(1)
  })

  it('checking moves the task (with subtasks) to the end of its list, in one transaction', () => {
    const state = stateOf('- [ ] a\n  - [ ] a1\n- [ ] b\n- [x] c')
    const result = toggleTask(state, itemPos(state.doc, 'a'), true, true)!
    expect(result.from).toBe(0)
    expect(result.to).toBe(2)
    expect(save(result.tr.doc)).toBe('- [ ] b\n- [x] c\n- [x] a\n  - [x] a1')
  })

  it('a subtask moves inside its own sub-list', () => {
    const state = stateOf('- [ ] a\n  - [ ] a1\n  - [ ] a2\n- [ ] b')
    const result = toggleTask(state, itemPos(state.doc, 'a1'), true, true)!
    expect(save(result.tr.doc)).toBe('- [ ] a\n  - [ ] a2\n  - [x] a1\n- [ ] b')
  })

  it('unchecking brings it back above the first checked sibling', () => {
    const state = stateOf('- [ ] a\n- [x] b\n- [x] c')
    const result = toggleTask(state, itemPos(state.doc, 'c'), false, true)!
    expect(result).toMatchObject({ from: 2, to: 1 })
    expect(save(result.tr.doc)).toBe('- [ ] a\n- [ ] c\n- [x] b')
  })

  it('with the setting off it only toggles', () => {
    const state = stateOf('- [ ] a\n- [ ] b')
    const result = toggleTask(state, itemPos(state.doc, 'a'), true, false)!
    expect(result).toMatchObject({ from: 0, to: 0 })
    expect(save(result.tr.doc)).toBe('- [x] a\n- [ ] b')
  })

  it('one undo reverts check + move', () => {
    const ed = new Editor({ extensions: [...schemaExtensions(), History], content: htmlFromMarkdown('- [ ] a\n- [ ] b') })
    const before = ed.state.doc
    ed.view.dispatch(toggleTask(ed.state, itemPos(ed.state.doc, 'a'), true, true)!.tr)
    expect(save(ed.state.doc)).toBe('- [ ] b\n- [x] a')
    expect(ed.commands.undo()).toBe(true)
    expect(ed.state.doc.eq(before)).toBe(true)
    ed.destroy()
  })

  it('extra attributes go in the same transaction: one undo takes back the box AND the agent state', () => {
    const ROBOT = '\u{1F916}'
    for (const sort of [false, true]) {
      const ed = new Editor({
        extensions: [...schemaExtensions(), History],
        content: htmlFromMarkdown(`- [ ] a ${ROBOT}aaaa1:review\n- [ ] b`),
      })
      const before = ed.state.doc
      ed.view.dispatch(toggleTask(ed.state, itemPos(ed.state.doc, 'a'), true, sort, { agentState: 'done' })!.tr)
      expect(save(ed.state.doc)).toBe(sort ? `- [ ] b\n- [x] a ${ROBOT}aaaa1:done` : `- [x] a ${ROBOT}aaaa1:done\n- [ ] b`)
      expect(ed.commands.undo()).toBe(true)
      expect(ed.state.doc.eq(before)).toBe(true) // unticked and back to "review", in one step
      expect(ed.commands.undo()).toBe(false)
      ed.destroy()
    }
  })

  it('checking a parent checks its whole subtree; unchecking leaves the subtasks alone', () => {
    for (const sort of [false, true]) {
      const state = stateOf('- [ ] a\n  - [ ] a1\n    - [ ] a11\n  - [x] a2\n  - b\n    - [ ] b1\n- [ ] c')
      const checked = toggleTask(state, itemPos(state.doc, 'a'), true, sort)!
      const subtree = '- [x] a\n  - [x] a1\n    - [x] a11\n  - [x] a2\n  - b\n    - [x] b1'
      expect(save(checked.tr.doc)).toBe(sort ? `- [ ] c\n${subtree}` : `${subtree}\n- [ ] c`)
      const after = state.apply(checked.tr)
      const unchecked = toggleTask(after, itemPos(after.doc, 'a'), false, false)!
      expect(save(unchecked.tr.doc)).toContain('- [ ] a\n  - [x] a1\n    - [x] a11')
    }
  })

  it('checking a parent applies the agent rule to its subtasks, in one undo step', () => {
    const ROBOT = '\u{1F916}'
    const md = [
      '- [ ] a',
      `  - [ ] a1 ${ROBOT}aaaa1:review`,
      `  - [ ] a2 ${ROBOT}aaaa2:queued`,
      `  - [ ] a3 ${ROBOT}aaaa3:failed`,
      `  - [ ] a4 ${ROBOT}aaaa4:interrupted`,
      `  - [ ] a5 ${ROBOT}aaaa5:running`,
      '    - [ ] a5 detail',
      `  - [ ] a6 ${ROBOT}aaaa6:waiting`,
      `  - [ ] a7 ${ROBOT}aaaa7:done`,
    ].join('\n')
    const ed = new Editor({ extensions: [...schemaExtensions(), History], content: htmlFromMarkdown(md) })
    const before = ed.state.doc
    const result = toggleTask(ed.state, itemPos(ed.state.doc, 'a'), true, false)!
    expect(result.closed).toEqual(['aaaa1', 'aaaa3', 'aaaa4'])
    expect(result.unqueued).toEqual(['aaaa2'])
    ed.view.dispatch(result.tr)
    expect(save(ed.state.doc)).toBe([
      '- [x] a',
      `  - [x] a1 ${ROBOT}aaaa1:done`,
      '  - [x] a2', // out of the queue: no marker
      `  - [x] a3 ${ROBOT}aaaa3:done`,
      `  - [x] a4 ${ROBOT}aaaa4:done`,
      `  - [ ] a5 ${ROBOT}aaaa5:running`, // an agent is on it: left as it is, with its detail
      '    - [ ] a5 detail',
      `  - [ ] a6 ${ROBOT}aaaa6:waiting`,
      `  - [x] a7 ${ROBOT}aaaa7:done`,
    ].join('\n'))
    expect(ed.commands.undo()).toBe(true)
    expect(ed.state.doc.eq(before)).toBe(true)
    ed.destroy()
  })

  it('the caller may judge the subtasks by the state SHOWN (a silent running task has no signal)', () => {
    const ROBOT = '\u{1F916}'
    const state = stateOf(`- [ ] a\n  - [ ] a1 ${ROBOT}aaaa1:running\n  - [ ] a2 ${ROBOT}aaaa2:running`)
    const result = toggleTask(state, itemPos(state.doc, 'a'), true, false, undefined, (id) => (id === 'aaaa1' ? 'done' : 'blocked'))!
    expect(result.closed).toEqual(['aaaa1'])
    expect(save(result.tr.doc)).toBe(`- [x] a\n  - [x] a1 ${ROBOT}aaaa1:done\n  - [ ] a2 ${ROBOT}aaaa2:running`)
  })

  it('movedOrder maps new indexes to old ones', () => {
    expect(movedOrder(4, 0, 3)).toEqual([1, 2, 3, 0])
    expect(movedOrder(4, 3, 1)).toEqual([0, 3, 1, 2])
    expect(movedOrder(3, 1, 1)).toEqual([0, 1, 2])
  })

  it('slash command: checked tasks go to the bottom, keeping their order', () => {
    let state = stateOf('- [x] a\n- [ ] b\n  - [x] b1\n  - [ ] b2\n- [x] c\n- [ ] d')
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, itemPos(state.doc, 'd') + 2)))
    const tr = sortCheckedToBottom(state)!
    expect(save(tr.doc)).toBe('- [ ] b\n  - [x] b1\n  - [ ] b2\n- [ ] d\n- [x] a\n- [x] c')
    expect(tr.doc.resolve(tr.selection.from).parent.textContent).toBe('d')
    // Already sorted: nothing to do.
    expect(sortCheckedToBottom(state.apply(tr))).toBeNull()
  })
})

describe('Alt+↑ / Alt+↓', () => {
  function editor(md: string): Editor {
    return new Editor({ extensions: [...schemaExtensions(), ListItemMove], content: htmlFromMarkdown(md) })
  }
  // What the view does on a keydown (TipTap's keyboardShortcut command would
  // replay only the steps, dropping the selection the keymap sets).
  function press(ed: Editor, key: 'ArrowUp' | 'ArrowDown'): boolean {
    const event = new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true })
    return !!ed.view.someProp('handleKeyDown', (f) => f(ed.view, event))
  }
  function caretIn(ed: Editor, text: string) {
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, itemPos(ed.state.doc, text) + 3)))
  }

  it('swaps a task (with subtasks) with its siblings and keeps the caret in it', () => {
    const ed = editor('- [ ] a\n- [ ] b\n  - [ ] b1\n- [ ] c')
    caretIn(ed, 'b')
    expect(press(ed, 'ArrowUp')).toBe(true)
    expect(save(ed.state.doc)).toBe('- [ ] b\n  - [ ] b1\n- [ ] a\n- [ ] c')
    expect(ed.state.selection.$from.parent.textContent).toBe('b')
    press(ed, 'ArrowDown')
    press(ed, 'ArrowDown')
    expect(save(ed.state.doc)).toBe('- [ ] a\n- [ ] c\n- [ ] b\n  - [ ] b1')
    ed.destroy()
  })

  it('moves the innermost item, bullets too, and stops at the ends', () => {
    const ed = editor('- a\n  - a1\n  - a2\n- b')
    caretIn(ed, 'a2')
    press(ed, 'ArrowUp')
    expect(save(ed.state.doc)).toBe('- a\n  - a2\n  - a1\n- b')
    expect(moveItemBy(ed.state, -1)).toBeNull()
    ed.destroy()
  })

  it('does nothing outside a list', () => {
    const state = stateOf('text')
    expect(moveItemBy(state, 1)).toBeNull()
  })
})
