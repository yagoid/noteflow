// Agent tasks — the two actions on a whole group of the queue bar's list
// (components/Editor/AgentTaskList.tsx): "Mark all as done" under "To review"
// and "Clear done" under "Done". Each is ONE transaction on the editor's
// document (one Ctrl+Z takes it all back), planned from the same rows the list
// shows (agentListTasksOfDoc + agentListGroupOf) and applied to a transaction.
// Pure ProseMirror: no editor, no store — the caller dispatches and then
// reconciles / discards the reports (agent.md). Covered by
// tests/lib/agentTaskBulk.test.ts.
// Docs: .agents/context/patterns.md "Tareas con agentes: enviar" (barra de cola → lista).

import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { TASK_ITEM_NODE } from './agentTaskNodes'
import { agentListGroupOf, agentListTasksOfDoc, type AgentListGroupKey, type AgentListTask } from './agentTaskList'
import type { AgentDisplayOf } from './agentSend'
import { deleteCard, normalizeBoard, toggleCard, updateCard, type CardRef } from './kanbanOps'
import type { KanbanBoardData } from './kanban'
import { toggleTaskIn, type AgentCheckRule } from './listItemMove'

/** A task item the action touches: where it is in the planned document, and its id (to find it again). */
export interface AgentBulkItem {
  pos: number
  id: string
}

/** The cards of one kanban board the action touches. */
export interface AgentBulkBoard {
  /** Position of the board node in the planned document. */
  pos: number
  cards: { ref: CardRef; id: string }[]
}

export interface AgentBulkPlan {
  items: AgentBulkItem[]
  boards: AgentBulkBoard[]
  /** How many rows of the group the action takes (the number its button says). */
  count: number
}

export interface AgentClearPlan extends AgentBulkPlan {
  /**
   * Rows of "Done" that stay: a done task with something still open under it
   * (an unticked subtask, an agent task not done, a kanban board) is not
   * deleted — the open work under it would go with it.
   */
  kept: number
  /** Every agent id on a line that goes (the done rows and any marked task under them): their reports are discarded. */
  ids: string[]
}

function rowsOf(doc: PMNode, group: AgentListGroupKey, displayOf: AgentDisplayOf): AgentListTask[] {
  return agentListTasksOfDoc(doc).filter((task) => agentListGroupOf(task, displayOf) === group)
}

function boardsOf(cards: readonly AgentListTask[]): AgentBulkBoard[] {
  const byPos = new Map<number, AgentBulkBoard>()
  for (const task of cards) {
    if (task.col === undefined || task.idx === undefined) continue
    const board = byPos.get(task.pos) ?? { pos: task.pos, cards: [] }
    board.cards.push({ ref: { col: task.col, idx: task.idx }, id: task.id })
    byPos.set(task.pos, board)
  }
  return [...byPos.values()]
}

/**
 * Whether everything under a done task is finished too, so the line can go
 * with its subtree: every task item in it ticked and, if it has an agent
 * marker, one the list would show as done (or not at all: a ticked queued /
 * failed / interrupted task); no kanban board (its cards are not looked into).
 * Text and bullet items under it are its detail: they go with it.
 */
function finishedUnder(item: PMNode, displayOf: AgentDisplayOf): boolean {
  let finished = true
  item.descendants((node) => {
    if (!finished || node.isTextblock) return false
    if (node.attrs.board !== undefined) {
      finished = false
      return false
    }
    if (node.type.name !== TASK_ITEM_NODE) return true
    const { agentId, agentState, checked } = node.attrs
    if (checked !== true) finished = false
    else if (typeof agentId === 'string' && agentId && typeof agentState === 'string' && agentState) {
      const group = agentListGroupOf({ id: agentId, state: agentState, checked: true }, displayOf)
      if (group !== null && group !== 'done') finished = false
    }
    return finished
  })
  return finished
}

function agentIdsUnder(node: PMNode, ids: Set<string>): void {
  const take = (n: PMNode) => {
    if (n.type.name === TASK_ITEM_NODE && typeof n.attrs.agentId === 'string' && n.attrs.agentId) ids.add(n.attrs.agentId)
  }
  take(node)
  node.descendants((n) => {
    if (n.isTextblock) return false
    take(n)
    return true
  })
}

/**
 * "Clear done": the rows of "Done" (agentListGroupOf: done ticked, a review the
 * user ticked) whose lines are deleted — each task item with its subtree, only
 * when everything under it is finished (finishedUnder; else it stays, `kept`),
 * and the outermost only (a done subtask of a done task goes with it, and
 * counts); the kanban cards of "Done" are removed from their board.
 */
export function agentDoneClearPlan(doc: PMNode, displayOf: AgentDisplayOf): AgentClearPlan {
  const rows = rowsOf(doc, 'done', displayOf)
  const ids = new Set<string>()
  const items: AgentBulkItem[] = []
  let count = 0
  let kept = 0
  let coveredTo = -1
  for (const task of rows) {
    if (task.kind !== 'item') continue
    // Under a done task that goes (rows come in document order): it goes with it.
    if (task.pos < coveredTo) {
      count++
      continue
    }
    const node = doc.nodeAt(task.pos)
    if (!node || !finishedUnder(node, displayOf)) {
      kept++
      continue
    }
    items.push({ pos: task.pos, id: task.id })
    agentIdsUnder(node, ids)
    coveredTo = task.pos + node.nodeSize
    count++
  }
  const cards = rows.filter((task) => task.kind === 'card')
  for (const card of cards) ids.add(card.id)
  return { items, boards: boardsOf(cards), count: count + cards.length, kept, ids: [...ids] }
}

/** The card of agent task `id` on `board`: at `ref` if it is still there, else wherever it is now. */
function cardRefOf(board: KanbanBoardData, ref: CardRef, id: string): CardRef | null {
  if (board.columns[ref.col]?.cards[ref.idx]?.agentId === id) return ref
  for (let col = 0; col < board.columns.length; col++) {
    const idx = board.columns[col].cards.findIndex((c) => c.agentId === id)
    if (idx >= 0) return { col, idx }
  }
  return null
}

/**
 * Applies "Clear done" to `tr` (a transaction on the planned document, nothing
 * else in it yet). From the end of the document back, so no position moves
 * before it is used: each item is deleted with its subtree (deleteRange: a
 * list left without items goes too), each board loses its cards. A task that
 * is no longer where the plan saw it is left alone.
 */
export function applyAgentClear(tr: Transaction, plan: AgentClearPlan): void {
  const ops = [
    ...plan.items.map((item) => ({ pos: item.pos, item, board: null as AgentBulkBoard | null })),
    ...plan.boards.map((board) => ({ pos: board.pos, item: null as AgentBulkItem | null, board })),
  ].sort((a, b) => b.pos - a.pos)
  for (const op of ops) {
    const node = tr.doc.nodeAt(op.pos)
    if (!node) continue
    if (op.item) {
      if (node.type.name !== TASK_ITEM_NODE || node.attrs.agentId !== op.item.id) continue
      tr.deleteRange(op.pos, op.pos + node.nodeSize)
      continue
    }
    if (!op.board || node.attrs.board === undefined) continue
    const before = normalizeBoard(node.attrs.board)
    let board = before
    // The last card first: removing one never shifts the next to remove.
    const cards = [...op.board.cards].sort((a, b) => b.ref.col - a.ref.col || b.ref.idx - a.ref.idx)
    for (const card of cards) {
      const ref = cardRefOf(board, card.ref, card.id)
      if (ref) board = deleteCard(board, ref)
    }
    if (board !== before) tr.setNodeMarkup(op.pos, undefined, { ...node.attrs, board })
  }
}

/** "Mark all as done": the rows of "To review" (review, box unticked), task items and kanban cards. */
export function agentReviewDonePlan(doc: PMNode, displayOf: AgentDisplayOf): AgentBulkPlan {
  const rows = rowsOf(doc, 'review', displayOf)
  const items = rows.filter((task) => task.kind === 'item').map((task) => ({ pos: task.pos, id: task.id }))
  return { items, boards: boardsOf(rows.filter((task) => task.kind === 'card')), count: rows.length }
}

export interface AgentMarkDoneResult {
  /** The ids the action set to done (the rows, and any subtask a check closed): their reports are reconciled. */
  done: string[]
  /** Queued subtasks a check took out of the queue: their reports are discarded. */
  unqueued: string[]
}

/**
 * Applies "Mark all as done" to `tr` — for each row, exactly what the report's
 * "Mark as done" does: the state `done` and the box ticked, with the rule of a
 * ticked box for its subtasks (`agentCheck`) and, with `sort` ("move checked
 * items to the bottom"), the move — a task item through toggleTaskIn, a card
 * through toggleCard (to the done column). In document order, each found again
 * through the steps already in `tr` (by id if it moved); one already ticked by
 * then (a subtask its parent's check closed) is skipped.
 */
export function applyAgentMarkDone(tr: Transaction, plan: AgentBulkPlan, sort: boolean, agentCheck: AgentCheckRule): AgentMarkDoneResult {
  const done = new Set<string>()
  const unqueued = new Set<string>()
  const ops = [
    ...plan.items.map((item) => ({ pos: item.pos, item, board: null as AgentBulkBoard | null })),
    ...plan.boards.map((board) => ({ pos: board.pos, item: null as AgentBulkItem | null, board })),
  ].sort((a, b) => a.pos - b.pos)
  for (const op of ops) {
    const pos = tr.mapping.map(op.pos)
    if (op.item) {
      const at = itemPosOf(tr.doc, pos, op.item.id)
      if (at === null) continue
      const node = tr.doc.nodeAt(at)!
      if (node.attrs.checked === true) continue
      const result = toggleTaskIn(tr, at, true, sort, { agentState: 'done' }, agentCheck)
      if (!result) continue
      done.add(op.item.id)
      for (const id of result.closed) done.add(id)
      for (const id of result.unqueued) unqueued.add(id)
      continue
    }
    const node = tr.doc.nodeAt(pos)
    if (!op.board || !node || node.attrs.board === undefined) continue
    const before = normalizeBoard(node.attrs.board)
    let board = before
    // Ticking moves a card (to the done column): each is found again by its id.
    for (const card of op.board.cards) {
      const ref = cardRefOf(board, card.ref, card.id)
      const current = ref ? board.columns[ref.col].cards[ref.idx] : null
      if (!ref || !current || current.checked) continue
      board = toggleCard(updateCard(board, ref, { agentState: 'done' }), ref)
      done.add(card.id)
    }
    if (board !== before) tr.setNodeMarkup(pos, undefined, { ...node.attrs, board })
  }
  return { done: [...done], unqueued: [...unqueued] }
}

/** The task item of agent task `id`: at `pos` if it is there, else the first in the document with that id. */
function itemPosOf(doc: PMNode, pos: number, id: string): number | null {
  const at = doc.nodeAt(pos)
  if (at?.type.name === TASK_ITEM_NODE && at.attrs.agentId === id) return pos
  let found: number | null = null
  doc.descendants((node, p) => {
    if (found !== null || node.isTextblock) return false
    if (node.type.name === TASK_ITEM_NODE && node.attrs.agentId === id) {
      found = p
      return false
    }
    return true
  })
  return found
}
