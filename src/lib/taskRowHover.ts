// The row of a checklist task under the pointer (components/Editor/TaskRowHover.ts):
// the pure choice, given the measured boxes of the tasks around a Y.
// Covered by tests/lib/taskRowHover.test.ts.
// Docs: .agents/context/patterns.md "Editor: menú de tarea" (franja de la fila).

/** A task's `<li>` measured in client coordinates. */
export interface TaskRowBox {
  /** Top of the `<li>`. */
  top: number
  /** Bottom of the `<li>`, its subtasks included. */
  bottom: number
  /** Where the task's OWN lines end: the top of its first nested list, `bottom` without one. */
  ownBottom: number
}

/**
 * Which task's row is at `y`:
 *   - the index of the task whose own lines (from the top of its `<li>` to its
 *     first nested list) hold `y` — the innermost one, the last in document
 *     order, should two ever overlap;
 *   - 'between' when `y` is inside some task but on none of their own rows
 *     (the few pixels of margin and padding below a sublist): the caller keeps
 *     the row it had, so passing over them does not blink the buttons;
 *   - 'none' outside every task.
 * `rows` may hold only the tasks around `y`: the others never count.
 */
export type TaskRowHit = number | 'between' | 'none'

export function taskRowAt(rows: readonly TaskRowBox[], y: number): TaskRowHit {
  let inside = false
  let hit = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (y < row.top || y >= row.bottom) continue
    inside = true
    if (y < row.ownBottom) hit = i
  }
  if (hit >= 0) return hit
  return inside ? 'between' : 'none'
}
