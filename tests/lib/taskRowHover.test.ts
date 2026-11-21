// The task row under the pointer (src/lib/taskRowHover.ts): which task's
// buttons show for a Y, given the boxes of the tasks around it.
import { describe, it, expect } from 'vitest'
import { taskRowAt, type TaskRowBox } from '../../src/lib/taskRowHover'

/** A task without subtasks: its whole <li> is its row. */
const leaf = (top: number, bottom: number): TaskRowBox => ({ top, bottom, ownBottom: bottom })

describe('taskRowAt', () => {
  // Parent (two lines, 0-40) with a sublist (40-80: subtasks 40-60 and 60-80),
  // then 6px of margin and padding before the parent's <li> ends at 86.
  const parent: TaskRowBox = { top: 0, bottom: 86, ownBottom: 40 }
  const sub1 = leaf(40, 60)
  const sub2 = leaf(60, 80)

  it("the parent's own lines are its row", () => {
    expect(taskRowAt([parent], 0)).toBe(0)
    expect(taskRowAt([parent], 39.5)).toBe(0)
  })

  it("over a subtask, the subtask's row and not its parent's", () => {
    expect(taskRowAt([parent, sub1], 40)).toBe(1)
    expect(taskRowAt([parent, sub1], 59)).toBe(1)
    expect(taskRowAt([parent, sub2], 70)).toBe(1)
  })

  it('below the sublist, still inside the parent: between rows (the caller keeps its row)', () => {
    expect(taskRowAt([parent], 82)).toBe('between')
  })

  it('outside every task: none', () => {
    expect(taskRowAt([], 10)).toBe('none')
    expect(taskRowAt([leaf(0, 20)], 20)).toBe('none')
    expect(taskRowAt([leaf(0, 20)], -1)).toBe('none')
  })

  it('rows are half-open: the boundary between two tasks belongs to the lower one', () => {
    const rows = [leaf(0, 20), leaf(20, 40)]
    expect(taskRowAt(rows, 19.9)).toBe(0)
    expect(taskRowAt(rows, 20)).toBe(1)
  })

  it('a three-level nest: the innermost row', () => {
    const top: TaskRowBox = { top: 0, bottom: 100, ownBottom: 20 }
    const mid: TaskRowBox = { top: 20, bottom: 90, ownBottom: 40 }
    const deep = leaf(40, 60)
    expect(taskRowAt([top, mid, deep], 10)).toBe(0)
    expect(taskRowAt([top, mid, deep], 30)).toBe(1)
    expect(taskRowAt([top, mid, deep], 50)).toBe(2)
    expect(taskRowAt([top, mid, deep], 95)).toBe('between')
  })
})
