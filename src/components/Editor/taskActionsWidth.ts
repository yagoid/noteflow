// The width of a task's actions block (date, importance, agent chip: the
// `.task-actions` right of its text), written as `--task-actions-w` on the
// task's `.task-item-body`. While the actions sit in the flow (every layout but
// a wide Readable column, where they move into the gutter), they take that
// width from the whole body — also from the sublists below the task's own
// lines, which then ended that much further left than their parent and put
// their chips out of line with its chip. index.css lets a task's sublists reach
// under its actions column with that width (a negative right margin), so every
// level's actions end at the same right edge.
//
// One ResizeObserver for every task of the window (like observeTaskOwnHeight in
// TaskRowHover.ts): the hover-only icons change opacity, not size, so a row
// under the pointer writes nothing.

let observer: ResizeObserver | null = null

function onResize(entries: ResizeObserverEntry[]): void {
  for (const entry of entries) {
    const actions = entry.target as HTMLElement
    const body = actions.parentElement
    if (!body) continue
    const size = entry.borderBoxSize?.[0]
    const width = size ? size.inlineSize : actions.getBoundingClientRect().width
    const value = `${Math.round(width)}px`
    if (body.style.getPropertyValue('--task-actions-w') !== value) body.style.setProperty('--task-actions-w', value)
  }
}

/** Keeps `--task-actions-w` on the parent of `actions` up to date. Returns the cleanup. */
export function observeTaskActionsWidth(actions: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined') return () => undefined
  observer ??= new ResizeObserver(onResize)
  observer.observe(actions)
  return () => { observer?.unobserve(actions) }
}
