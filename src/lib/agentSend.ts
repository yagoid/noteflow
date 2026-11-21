// Agent tasks — SENDING them from the editor's document: what the queue bar
// counts and what its "queue all" would queue, which tasks a text selection
// hands over and what of it goes along as context. Pure (the ProseMirror document in, plain data out); the prompt text
// itself is lib/agentPrompt.ts. Covered by tests/lib/agentSend.test.ts.
// Docs: .agents/context/patterns.md "Tareas con agentes: enviar".

import { getHTMLFromFragment } from '@tiptap/core'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { TASK_ITEM_NODE } from './agentTaskNodes'
import { stripAgentMarkers } from './agentTasks'
import { agentCanSend } from './agentTaskUi'
import { normalizeBoard, updateCard, type CardRef } from './kanbanOps'
import { htmlToMarkdown } from './markdownHtml'

/** The state to SHOW for a marker (useAgentTask.ts → agentDisplayStateNow): 'no-signal' is derived, never written. */
export type AgentDisplayOf = (id: string, state: string) => string

// ── The tasks of a section ───────────────────────────────────────────────────

export interface AgentDocTask {
  /** A task list item, or a card of a kanban board. */
  kind: 'item' | 'card'
  id: string
  /** The state on the task's line. */
  state: string
  checked: boolean
}

/**
 * Every task of `doc` that carries an agent marker — task items and kanban
 * cards (a board keeps its cards in an attribute) — in document order. Text
 * blocks are not entered: the walk costs the number of BLOCKS, not of
 * characters.
 */
export function agentTasksOfDoc(doc: PMNode): AgentDocTask[] {
  const tasks: AgentDocTask[] = []
  doc.descendants((node) => {
    if (node.isTextblock) return false
    if (node.type.name === TASK_ITEM_NODE) {
      const { agentId, agentState, checked } = node.attrs
      if (typeof agentId === 'string' && agentId && typeof agentState === 'string' && agentState) {
        tasks.push({ kind: 'item', id: agentId, state: agentState, checked: checked === true })
      }
    } else if (node.attrs.board !== undefined) {
      for (const column of normalizeBoard(node.attrs.board).columns) {
        for (const card of column.cards) {
          if (card.agentId && card.agentState) tasks.push({ kind: 'card', id: card.agentId, state: card.agentState, checked: card.checked })
        }
      }
      return false
    }
    return true
  })
  return tasks
}

/** The active agent tasks of a section, by what the user has to know about them. */
export interface AgentQueueCounts {
  queued: number
  running: number
  /** The agent asked something: it needs the user. */
  waiting: number
  /** Running / waiting, but silent for too long. */
  noSignal: number
}

export const NO_AGENT_QUEUE: AgentQueueCounts = { queued: 0, running: 0, waiting: 0, noSignal: 0 }

/**
 * How many tasks are waiting for an agent or with one. A queued task whose box
 * is checked does not count: no agent will start it.
 */
export function agentQueueCounts(tasks: readonly AgentDocTask[], displayOf: AgentDisplayOf): AgentQueueCounts {
  const counts = { ...NO_AGENT_QUEUE }
  for (const task of tasks) {
    if (task.state === 'queued') {
      if (!task.checked) counts.queued++
      continue
    }
    if (task.state !== 'running' && task.state !== 'waiting') continue
    const shown = displayOf(task.id, task.state)
    if (shown === 'running') counts.running++
    else if (shown === 'waiting') counts.waiting++
    else counts.noSignal++
  }
  return counts
}

export function agentQueueTotal(counts: AgentQueueCounts): number {
  return counts.queued + counts.running + counts.waiting + counts.noSignal
}

/** The ids "Copy prompt" of the queue bar hands over: the queued, unchecked tasks, in document order. */
export function queuedAgentIds(tasks: readonly AgentDocTask[]): string[] {
  return [...new Set(tasks.filter((t) => t.state === 'queued' && !t.checked).map((t) => t.id))]
}

/** A task item has text of its own (its first line): an empty task is never handed to an agent. */
function hasOwnText(item: PMNode): boolean {
  const text = item.firstChild
  return !!text && text.isTextblock && text.content.size > 0 && !!text.textContent.trim()
}

// ── "Queue all": the open tasks of a section ─────────────────────────────────

/** A task "queue all" would put in the queue: a task item, or the cards of one kanban board. */
export type AgentOpenTask =
  | { kind: 'item'; pos: number }
  | { kind: 'board'; pos: number; cards: CardRef[] }

/**
 * The tasks "queue all" of the queue bar would put in the queue, in document
 * order: the OPEN ones — no agent marker, box unchecked, some text of their
 * own. A task that already has a marker (queued, failed, to review, done…) is
 * left as it is: re-queuing it is a decision taken one by one.
 *
 * Only the OUTERMOST, as with a selection (resolveAgentSelection): an open
 * task carries the tasks nested under it (its indented lines are the details
 * `noteflow task start` hands to the agent), and so does an unchecked task
 * that already has a marker (they go, or went, with it). Under a CHECKED task
 * (done) — or an empty one — an open subtask counts on its own.
 *
 * Kanban cards count too: the open cards (no marker, unchecked, with text) of
 * each board, grouped by board. Like agentTasksOfDoc the walk is by blocks:
 * only the first line of an unmarked, unchecked task is read.
 */
export function openAgentTasksOfDoc(doc: PMNode): AgentOpenTask[] {
  const open: AgentOpenTask[] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) return false
    if (node.type.name === TASK_ITEM_NODE) {
      if (node.attrs.checked === true) return true
      const { agentId } = node.attrs
      if (typeof agentId === 'string' && agentId) return false
      if (!hasOwnText(node)) return true
      open.push({ kind: 'item', pos })
      return false
    }
    if (node.attrs.board !== undefined) {
      const cards: CardRef[] = []
      normalizeBoard(node.attrs.board).columns.forEach((column, col) => {
        column.cards.forEach((card, idx) => {
          if (!card.agentId && !card.checked && card.md.trim()) cards.push({ col, idx })
        })
      })
      if (cards.length > 0) open.push({ kind: 'board', pos, cards })
      return false
    }
    return true
  })
  return open
}

/** How many tasks openAgentTasksOfDoc found (a board counts its cards). */
export function openAgentTaskCount(open: readonly AgentOpenTask[]): number {
  let count = 0
  for (const task of open) count += task.kind === 'item' ? 1 : task.cards.length
  return count
}

/**
 * "Queue all": puts the `open` tasks (of openAgentTasksOfDoc on `tr.doc`) in
 * the queue, on `tr` — each a fresh id (`newId(taken)`: the ids already handed
 * out for this same edit, so no two are equal) and `queued`. Attributes only:
 * no position shifts, ONE transaction for all (one undo takes them back).
 * A task or card that is no longer open is left alone. Returns the new ids, in
 * document order.
 */
export function queueOpenAgentTasks(
  tr: Transaction,
  open: readonly AgentOpenTask[],
  newId: (taken: readonly string[]) => string,
): string[] {
  const given: string[] = []
  const mint = () => {
    const id = newId(given)
    given.push(id)
    return id
  }
  const ids: string[] = []
  for (const task of open) {
    const node = tr.doc.nodeAt(task.pos)
    if (!node) continue
    if (task.kind === 'item') {
      if (node.type.name !== TASK_ITEM_NODE || node.attrs.agentId || node.attrs.checked === true) continue
      ids.push(...queueAgentTaskItems(tr, [{ pos: task.pos, id: null, state: null }], mint))
      continue
    }
    if (node.attrs.board === undefined) continue
    const before = normalizeBoard(node.attrs.board)
    let board = before
    for (const ref of task.cards) {
      const card = board.columns[ref.col]?.cards[ref.idx]
      if (!card || card.agentId || card.checked) continue
      const id = mint()
      board = updateCard(board, ref, { agentId: id, agentState: 'queued' })
      ids.push(id)
    }
    if (board !== before) tr.setNodeMarkup(task.pos, undefined, { ...node.attrs, board })
  }
  return ids
}

// ── A text selection → { tasks, context } ────────────────────────────────────

export interface AgentSelectionTask {
  /** Position of the task item in the document. */
  pos: number
  /** Its id, null when it has no marker yet. */
  id: string | null
  /** The state on its line, null without a marker. */
  state: string | null
}

export interface AgentSelection {
  /** The tasks to hand over, in document order. */
  tasks: AgentSelectionTask[]
  /** Tasks the selection touches that are NOT handed over: done, or an agent is on them. */
  skipped: number
  /**
   * Markdown of the selected text that goes along: with tasks, what belongs to
   * none of them; without, the whole selection.
   */
  context: string
}

const LIST_ITEM_NODES: readonly string[] = ['listItem', TASK_ITEM_NODE]
/** Blocks that say nothing to an agent as text: a drawing is a scene in JSON (components/Editor/DrawingBlock.ts). */
const CONTEXT_SKIPPED_NODES: readonly string[] = ['drawingBlock']
// An embedded image is megabytes of base64: the prompt keeps that there was one.
const DATA_URI_RE = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi

/**
 * What of `node` (at `pos`: the position right before it; -1 for the document)
 * lies inside [from, to) and outside the `removed` task items, as nodes:
 * the same structure with everything else cut away, wrappers left empty
 * dropped. A list item whose own text is not part of it gives its remaining
 * blocks WITHOUT the item around them (a code block under a task is sent as a
 * code block, not as a task with no text), and the list is split around them.
 */
function keepRange(node: PMNode, pos: number, from: number, to: number, removed: ReadonlySet<number>): PMNode[] {
  if (node.isLeaf) return CONTEXT_SKIPPED_NODES.includes(node.type.name) ? [] : [node]
  const start = pos + 1
  if (node.isTextblock) {
    const cut = node.cut(Math.max(0, from - start), Math.min(node.content.size, to - start))
    return cut.content.size > 0 ? [cut] : []
  }
  const isList = !!node.firstChild && LIST_ITEM_NODES.includes(node.firstChild.type.name)
  const isItem = LIST_ITEM_NODES.includes(node.type.name)
  let headKept = false
  const out: PMNode[] = []
  let run: PMNode[] = []
  const flush = () => {
    if (run.length > 0) out.push(node.copy(Fragment.from(run)))
    run = []
  }
  node.forEach((child, offset, index) => {
    const childPos = start + offset
    if (childPos + child.nodeSize <= from || childPos >= to || removed.has(childPos)) return
    const kept = keepRange(child, childPos, from, to, removed)
    if (index === 0 && kept.length > 0) headKept = true
    for (const k of kept) {
      // A list only holds items: anything else an item handed up goes between two pieces of the list.
      if (isList && !LIST_ITEM_NODES.includes(k.type.name)) {
        flush()
        out.push(k)
      } else {
        run.push(k)
      }
    }
  })
  if (isItem && !headKept) return [...out, ...run]
  flush()
  return out
}

function contextMarkdown(kept: PMNode | undefined): string {
  if (!kept || kept.content.size === 0) return ''
  const md = htmlToMarkdown(getHTMLFromFragment(kept.content, kept.type.schema))
  return stripAgentMarkers(md).replace(DATA_URI_RE, 'data:…').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * What a text selection [from, to) hands to an agent.
 *
 * A task is TOUCHED when part of its own text (the item's first line, not what
 * is indented under it) is selected. Of the touched tasks only the OUTERMOST
 * count: a task nested under a touched one goes with it — its indented lines
 * are the task's details, which `noteflow task start` hands to the agent.
 * A touched task is handed over when agentCanSend says so; the others are
 * `skipped`. An empty task (no text) is never touched.
 *
 * The context is the rest of the selection: what is in no touched task (nor
 * under one), serialized with the editor's own markdown serializer, without 🤖
 * markers, drawings or embedded image data. With no task to hand over, it is
 * the WHOLE selection (the touched-but-skipped tasks included: it is then just
 * text to send).
 */
export function resolveAgentSelection(doc: PMNode, from: number, to: number, displayOf: AgentDisplayOf): AgentSelection {
  const tasks: AgentSelectionTask[] = []
  const touched = new Set<number>()
  let skipped = 0
  if (to > from) {
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) return false
      if (node.type.name !== TASK_ITEM_NODE) return true
      if (!hasOwnText(node)) return true
      const text = node.firstChild as PMNode
      const textStart = pos + 2
      if (from >= textStart + text.content.size || to <= textStart) return true
      touched.add(pos)
      const { agentId, agentState, checked } = node.attrs
      const marked = typeof agentId === 'string' && !!agentId && typeof agentState === 'string' && !!agentState
      if (agentCanSend(marked ? displayOf(agentId, agentState) : null, checked === true)) {
        tasks.push({ pos, id: marked ? agentId : null, state: marked ? agentState : null })
      } else {
        skipped++
      }
      return false
    })
  }
  // The document itself comes back as the one wrapper around what is kept.
  const kept = to > from ? keepRange(doc, -1, from, to, tasks.length > 0 ? touched : new Set())[0] : undefined
  return { tasks, skipped, context: contextMarkdown(kept) }
}

/**
 * Puts `tasks` (of resolveAgentSelection) in the queue, on `tr`: a task
 * without a marker gets a fresh id (`newId(taken)`: the ids already handed out
 * for this same edit) and every one ends `queued`. Attributes only — no
 * position shifts, ONE transaction for all. Returns their ids, in order.
 */
export function queueAgentTaskItems(
  tr: Transaction,
  tasks: readonly AgentSelectionTask[],
  newId: (taken: readonly string[]) => string,
): string[] {
  const ids: string[] = []
  const fresh: string[] = []
  for (const task of tasks) {
    const node = tr.doc.nodeAt(task.pos)
    if (!node || node.type.name !== TASK_ITEM_NODE) continue
    let id = task.id
    if (!id) {
      id = newId(fresh)
      fresh.push(id)
    }
    if (node.attrs.agentId !== id || node.attrs.agentState !== 'queued') {
      tr.setNodeMarkup(task.pos, undefined, { ...node.attrs, agentId: id, agentState: 'queued' })
    }
    ids.push(id)
  }
  return ids
}
