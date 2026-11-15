// Moving list items — each with its whole subtree (sub-lists) — inside the
// editor document: drag & drop of tasks (components/Editor/taskDrag.ts),
// Alt+↑/↓ (components/Editor/ListItemMove.ts), "move checked items to the
// bottom" when a task is (un)checked (DeadlineTaskItemView) and its slash
// command. Pure ProseMirror: a doc/state in, a transaction out, so every move is
// one step group → one Ctrl+Z. Tested on the editor's real schema in
// tests/lib/listItemMove.test.ts (incl. the markdown round trip after a move).
//
// Rules: an item only lands in a list of its own kind (a task in a task list,
// never in a bullet/numbered one: those are never siblings, see
// `LIST_ITEM_CONTENT` in editorExtensions.ts), never inside its own subtree, and
// a list left without items goes with the item it lost.

import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

/** Item node type each list node type holds. */
const ITEM_OF_LIST: Record<string, string> = {
  taskList: 'taskItem',
  bulletList: 'listItem',
  orderedList: 'listItem',
}

export function isListNode(node: PMNode): boolean {
  return node.type.name in ITEM_OF_LIST
}

export function isListItemNode(node: PMNode): boolean {
  return node.type.name === 'taskItem' || node.type.name === 'listItem'
}

/** A gap between the children of a list: right before child `index` (`childCount` = at the end). */
export interface ListSlot {
  /** Position of the list node (right before it). */
  listPos: number
  index: number
}

/** Document position of a slot, or null if it isn't a gap of a list. */
export function slotPos(doc: PMNode, slot: ListSlot): number | null {
  const list = doc.nodeAt(slot.listPos)
  if (!list || !isListNode(list) || slot.index < 0 || slot.index > list.childCount) return null
  let pos = slot.listPos + 1
  for (let i = 0; i < slot.index; i++) pos += list.child(i).nodeSize
  return pos
}

export type MoveCheck = 'ok' | 'noop' | 'invalid'

/**
 * Whether the item at `itemPos` can move to `slot`: 'noop' = it's already
 * there (the gap right before or after it), 'invalid' = not a list item, a list
 * of another kind, its own subtree, or a source list that can't be removed.
 */
export function checkItemMove(doc: PMNode, itemPos: number, slot: ListSlot): MoveCheck {
  const item = doc.nodeAt(itemPos)
  if (!item || !isListItemNode(item)) return 'invalid'
  const target = slotPos(doc, slot)
  const list = doc.nodeAt(slot.listPos)
  if (target === null || !list || ITEM_OF_LIST[list.type.name] !== item.type.name) return 'invalid'
  const end = itemPos + item.nodeSize
  if (target === itemPos || target === end) return 'noop'
  if (target > itemPos && target < end) return 'invalid'
  const $item = doc.resolve(itemPos)
  const source = $item.parent
  if (!isListNode(source)) return 'invalid'
  // Its last item gone, the source list goes too: whatever holds it must be
  // able to lose it (a quote or table cell holding only that list can't).
  if (source.childCount === 1) {
    const container = doc.resolve($item.before()).parent
    if (container.childCount === 1 && !container.type.contentMatch.validEnd) return 'invalid'
  }
  return 'ok'
}

/**
 * Moves the item at `itemPos` (positions of `tr.doc`) with its subtree to
 * `slot`, optionally as `replacement` (the same item with other attrs, e.g.
 * just checked). A selection inside the item travels with it. Returns the
 * item's new position, or null (nothing done) when the move isn't 'ok'.
 */
export function moveListItem(tr: Transaction, itemPos: number, slot: ListSlot, replacement?: PMNode): number | null {
  const doc = tr.doc
  if (checkItemMove(doc, itemPos, slot) !== 'ok') return null
  const item = doc.nodeAt(itemPos)!
  const target = slotPos(doc, slot)!
  const $item = doc.resolve(itemPos)
  const source = $item.parent
  let from = itemPos
  let to = itemPos + item.nodeSize
  if (source.childCount === 1) {
    from = $item.before()
    to = from + source.nodeSize
  }
  const sel = tr.selection
  const selInside = sel.from >= itemPos && sel.to <= itemPos + item.nodeSize
  const start = tr.steps.length
  tr.delete(from, to)
  const at = tr.mapping.slice(start).map(target)
  tr.insert(at, replacement ?? item)
  if (selInside) {
    const shift = (pos: number) => at + (pos - itemPos)
    try {
      if (sel instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, shift(sel.from)))
      else tr.setSelection(TextSelection.create(tr.doc, shift(sel.anchor), shift(sel.head)))
    } catch {
      // Keep the mapped selection.
    }
  }
  return at
}

/** newIndex → oldIndex of a list's children after moving child `from` to (final) index `to`. */
export function movedOrder(count: number, from: number, to: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i)
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved)
  return order
}

/**
 * Final index (among its siblings, after the move) of child `index` of a task
 * list once it becomes `checked`, with "move checked items to the bottom" on:
 * checked → the end of its list; unchecked → right above the first checked
 * sibling (the end of the pending block), or where it is if none is checked.
 */
export function sortedIndexOnToggle(list: PMNode, index: number, checked: boolean): number {
  if (checked) return list.childCount - 1
  let k = 0
  for (let i = 0; i < list.childCount; i++) {
    if (i === index) continue
    if (list.child(i).attrs.checked) return k
    k++
  }
  return index
}

export interface TaskToggle {
  tr: Transaction
  /** The task list holding the item (same position before and after). */
  listPos: number
  /** The item's child index in that list before and after (equal = not moved). */
  from: number
  to: number
}

/**
 * Checks/unchecks the task at `itemPos` — and, with `sort`, moves it (with its
 * subtasks) in the same transaction per sortedIndexOnToggle. Null if
 * `itemPos` isn't a task item.
 */
export function toggleTask(state: EditorState, itemPos: number, checked: boolean, sort: boolean): TaskToggle | null {
  const item = state.doc.nodeAt(itemPos)
  if (!item || item.type.name !== 'taskItem') return null
  const $item = state.doc.resolve(itemPos)
  const list = $item.parent
  const listPos = $item.before()
  const from = $item.index()
  const attrs = { ...item.attrs, checked }
  const tr = state.tr
  const to = sort ? sortedIndexOnToggle(list, from, checked) : from
  if (to !== from) {
    const updated = item.type.create(attrs, item.content, item.marks)
    if (moveListItem(tr, itemPos, { listPos, index: to > from ? to + 1 : to }, updated) !== null) {
      return { tr, listPos, from, to }
    }
  }
  tr.setNodeMarkup(itemPos, undefined, attrs)
  return { tr, listPos, from, to: from }
}

/**
 * Alt+↑ / Alt+↓: swaps the innermost list item around the selection (task or
 * not) with its previous / next sibling, subtree included. Null when there's
 * no item, no sibling that way, or the selection spills out of the item.
 */
export function moveItemBy(state: EditorState, dir: -1 | 1): Transaction | null {
  const { $from, to } = state.selection
  for (let d = $from.depth; d > 1; d--) {
    const node = $from.node(d)
    if (!isListItemNode(node)) continue
    const itemPos = $from.before(d)
    if (to > itemPos + node.nodeSize) return null
    const index = $from.index(d - 1)
    const list = $from.node(d - 1)
    if (index + dir < 0 || index + dir >= list.childCount) return null
    const tr = state.tr
    const slot = { listPos: $from.before(d - 1), index: dir < 0 ? index - 1 : index + 2 }
    if (moveListItem(tr, itemPos, slot) === null) return null
    return tr.scrollIntoView()
  }
  return null
}

/** The innermost task list around the selection. */
export function taskListAround(state: EditorState): { node: PMNode; pos: number } | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'taskList') return { node, pos: $from.before(d) }
  }
  return null
}

/**
 * Slash command "Move checked to bottom": reorders the innermost task list
 * around the selection so its checked items (with their subtasks) follow the
 * unchecked ones, each group keeping its order. Only that list's own items
 * (sub-lists are left as they are). Null when there's nothing to move.
 */
export function sortCheckedToBottom(state: EditorState): Transaction | null {
  const around = taskListAround(state)
  if (!around) return null
  const { node: list, pos: listPos } = around
  const children: PMNode[] = []
  list.forEach((child) => children.push(child))
  const order = [
    ...children.map((_, i) => i).filter((i) => !children[i].attrs.checked),
    ...children.map((_, i) => i).filter((i) => children[i].attrs.checked),
  ]
  if (order.every((old, i) => old === i)) return null
  const tr = state.tr.replaceWith(listPos + 1, listPos + list.nodeSize - 1, Fragment.from(order.map((i) => children[i])))
  // Keep a caret/selection that sat inside one of the items in that item.
  const childStart = (seq: number[], idx: number) => {
    let pos = listPos + 1
    for (let i = 0; i < idx; i++) pos += children[seq[i]].nodeSize
    return pos
  }
  const sel = state.selection
  const identity = children.map((_, i) => i)
  for (let i = 0; i < children.length; i++) {
    const oldStart = childStart(identity, i)
    if (sel.from < oldStart || sel.to > oldStart + children[i].nodeSize) continue
    const shift = childStart(order, order.indexOf(i)) - oldStart
    try {
      tr.setSelection(TextSelection.create(tr.doc, sel.anchor + shift, sel.head + shift))
    } catch {
      // Keep the mapped selection.
    }
    break
  }
  return tr
}
