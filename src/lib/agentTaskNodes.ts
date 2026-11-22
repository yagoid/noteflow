// The agent-task marker (🤖<id>:<state>) inside the editor document: a task
// item carries it as two attributes (`agentId`, `agentState` — see
// DeadlineTaskItem), never as text. A task id is unique: these helpers keep an
// edit from leaving the same id on two items of one document. Pure
// (ProseMirror model only); covered by tests/lib/agentTaskNodes.test.ts.

import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { normalizeBoard } from './kanbanOps'

export const TASK_ITEM_NODE = 'taskItem'

export interface AgentTaskNode {
  pos: number
  node: PMNode
  id: string
  state: string
}

/** Every task item of `doc` that carries an agent marker, in document order. */
export function agentTaskNodes(doc: PMNode): AgentTaskNode[] {
  const found: AgentTaskNode[] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) return false // tasks never live inside a text block
    if (node.type.name === TASK_ITEM_NODE && typeof node.attrs.agentId === 'string' && node.attrs.agentId) {
      found.push({ pos, node, id: node.attrs.agentId, state: String(node.attrs.agentState ?? '') })
    }
    return true
  })
  return found
}

/**
 * Positions of the task items whose marker must go because another item of
 * `doc` holds the same id. Of each group of items sharing an id ONE keeps it:
 * the one that was already in the document (`isOriginal(pos)`), else the
 * first. [] when no id is repeated.
 */
export function duplicateAgentMarkerPositions(doc: PMNode, isOriginal: (pos: number) => boolean = () => false): number[] {
  const byId = new Map<string, number[]>()
  for (const t of agentTaskNodes(doc)) {
    const list = byId.get(t.id)
    if (list) list.push(t.pos)
    else byId.set(t.id, [t.pos])
  }
  const drop: number[] = []
  for (const positions of byId.values()) {
    if (positions.length < 2) continue
    const keep = positions.find(isOriginal) ?? positions[0]
    for (const pos of positions) if (pos !== keep) drop.push(pos)
  }
  return drop.sort((a, b) => a - b)
}

/** Clears the agent marker of the task items at `positions` (attributes only: no position shifts). */
export function clearAgentMarkers(tr: Transaction, positions: readonly number[]): Transaction {
  for (const pos of positions) {
    const node = tr.doc.nodeAt(pos)
    if (!node || node.type.name !== TASK_ITEM_NODE) continue
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, agentId: null, agentState: null })
  }
  return tr
}

/**
 * After a paste or a copy-drop: the transaction that removes the marker from
 * the items it DUPLICATED (the pasted ones — the items that were already in
 * `oldDoc` keep theirs; a cut-and-paste leaves no duplicate and nothing
 * changes), or null. `mapPos` maps a position of `oldDoc` to `tr.doc`
 * (null = that position was deleted).
 */
export function dedupeAgentMarkers(
  tr: Transaction,
  oldDoc: PMNode,
  mapPos: (pos: number) => number | null,
): Transaction | null {
  const current = agentTaskNodes(tr.doc)
  if (current.length < 2) return null
  const originals = new Set<number>()
  for (const t of agentTaskNodes(oldDoc)) {
    const mapped = mapPos(t.pos)
    if (mapped !== null) originals.add(mapped)
  }
  const drop = duplicateAgentMarkerPositions(tr.doc, (pos) => originals.has(pos))
  return drop.length > 0 ? clearAgentMarkers(tr, drop) : null
}

/**
 * Every agent-task id `doc` holds: its task items' and its kanban cards' (a
 * board keeps its cards in an attribute, not in nodes). What a new id must not
 * repeat, read from the editor itself — its last edits may not be saved yet.
 */
export function agentIdsInDoc(doc: PMNode): Set<string> {
  const ids = new Set<string>()
  doc.descendants((node) => {
    if (node.isTextblock) return false
    if (node.type.name === TASK_ITEM_NODE) {
      if (typeof node.attrs.agentId === 'string' && node.attrs.agentId) ids.add(node.attrs.agentId)
    } else if (node.attrs.board !== undefined) {
      for (const column of normalizeBoard(node.attrs.board).columns) {
        for (const card of column.cards) if (card.agentId) ids.add(card.agentId)
      }
      return false
    }
    return true
  })
  return ids
}

/**
 * id → the states of the agent tasks (task items, kanban cards) among the
 * nodes of `doc` that overlap from…to, ancestors included (a whole doc without
 * a range). An id on several items — a sync merge can leave that — gets all of
 * them, sorted: a change of state on ANY of them is a change (which one counts
 * is main's rule, agentLineStates). Moving them around is not.
 */
function collectAgentStates(doc: PMNode, from?: number, to?: number): Map<string, string> {
  const states = new Map<string, string[]>()
  const add = (id: string, state: unknown) => {
    const list = states.get(id)
    if (list) list.push(String(state ?? ''))
    else states.set(id, [String(state ?? '')])
  }
  const visit = (node: PMNode): boolean => {
    if (node.isTextblock) return false
    if (node.type.name === TASK_ITEM_NODE) {
      const id = node.attrs.agentId
      if (typeof id === 'string' && id) add(id, node.attrs.agentState)
    } else if (node.attrs.board !== undefined) {
      for (const column of normalizeBoard(node.attrs.board).columns) {
        for (const card of column.cards) if (card.agentId) add(card.agentId, card.agentState)
      }
      return false
    }
    return true
  }
  if (from === undefined || to === undefined) doc.descendants(visit)
  else doc.nodesBetween(from, to, visit)
  return new Map([...states].map(([id, list]) => [id, list.sort().join(' ')]))
}

/** What an edit did to the agent markers of a document (agentMarkerChanges). */
export interface AgentMarkerChanges {
  /** Ids on both sides whose state changed. */
  changed: string[]
  /** Ids the edit brought into the document (a queued task, an undo that returned a marker). */
  appeared: string[]
  /** Ids the edit took out of it. */
  gone: string[]
}

/**
 * The agent markers an edit changed, `before` → `after` (task items and kanban
 * cards), or null when it touched none. Cheap on the edits that do not touch
 * one (typing): only the nodes around the changed range are read — what lies
 * outside it is the same on both sides; the whole documents only when an id
 * seems to come or go (it may sit elsewhere too).
 */
export function agentMarkerChanges(before: PMNode, after: PMNode): AgentMarkerChanges | null {
  if (before === after) return null
  const start = before.content.findDiffStart(after.content)
  if (start == null) return null
  const end = before.content.findDiffEnd(after.content)
  let endA = end?.a ?? before.content.size
  let endB = end?.b ?? after.content.size
  // findDiffEnd can run past `start` when the change repeats nearby content.
  const overlap = start - Math.min(endA, endB)
  if (overlap > 0) { endA += overlap; endB += overlap }
  let old = collectAgentStates(before, start, endA)
  let now = collectAgentStates(after, start, endB)
  if (old.size === 0 && now.size === 0) return null
  const comesOrGoes = [...old.keys()].some((id) => !now.has(id)) || [...now.keys()].some((id) => !old.has(id))
  if (comesOrGoes) {
    old = collectAgentStates(before)
    now = collectAgentStates(after)
  }
  const changes: AgentMarkerChanges = { changed: [], appeared: [], gone: [] }
  for (const [id, state] of now) {
    const was = old.get(id)
    if (was === undefined) changes.appeared.push(id)
    else if (was !== state) changes.changed.push(id)
  }
  for (const id of old.keys()) if (!now.has(id)) changes.gone.push(id)
  return changes.changed.length + changes.appeared.length + changes.gone.length > 0 ? changes : null
}
