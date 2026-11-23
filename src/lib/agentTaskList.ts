// Agent tasks — the LIST the queue bar's counts open (AgentQueueBar.tsx →
// AgentTaskList), and those counts (agentStateCounts): every task of the
// section an agent has, will have or just left, grouped by what the user has
// to know — the one that needs them first — with what each row says on its
// right (how much is done, the place in the queue…). Pure (the ProseMirror document and the blocks' metadata in, plain
// data out). Covered by tests/lib/agentTaskList.test.ts.
// Docs: .agents/context/patterns.md "Tareas con agentes: enviar" (barra de cola → lista).

import type { Node as PMNode } from '@tiptap/pm/model'
import { TASK_ITEM_NODE } from './agentTaskNodes'
import { AGENT_NO_SIGNAL } from './agentTasks'
import { agentPercent } from './agentTaskUi'
import type { AgentDisplayOf } from './agentSend'
import { normalizeBoard } from './kanbanOps'

/** A task of the section with an agent marker, as the list shows it — and where it is, to go to it. */
export interface AgentListTask {
  /** A task list item (at `pos`), or a card of the kanban board at `pos` (column `col`, card `idx`). */
  kind: 'item' | 'card'
  id: string
  /** The state on the task's line. */
  state: string
  checked: boolean
  /** Its first line as plain text (a card's inline markdown without its marks). */
  text: string
  pos: number
  col?: number
  idx?: number
}

/**
 * A task's first line as one line of plain text: a line break inside it
 * (Shift+Enter, a hardBreak — `textContent` drops it) reads as a space, so a
 * two-line task doesn't come out glued ("firstsecond"). The list's rows and the
 * report's title (DeadlineTaskItemView) use it.
 */
export function taskLineText(line: PMNode | null | undefined): string {
  if (!line || !line.isTextblock) return ''
  return line.textBetween(0, line.content.size, ' ', (leaf) => (leaf.type.name === 'hardBreak' ? ' ' : ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** A card's text is one line of inline markdown: the list shows it without its marks. */
export function plainInlineMarkdown(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url), ![alt](src)
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target: string, label?: string) => label || target) // [[wiki]]
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?![\w*])/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Every task of `doc` that carries an agent marker — task items and kanban
 * cards — in document order, with its first line and where it is. The same
 * walk as agentTasksOfDoc (agentSend.ts): by blocks, a task's first line is the
 * only text read.
 */
export function agentListTasksOfDoc(doc: PMNode): AgentListTask[] {
  const tasks: AgentListTask[] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) return false
    if (node.type.name === TASK_ITEM_NODE) {
      const { agentId, agentState, checked } = node.attrs
      if (typeof agentId === 'string' && agentId && typeof agentState === 'string' && agentState) {
        const text = taskLineText(node.firstChild)
        tasks.push({ kind: 'item', id: agentId, state: agentState, checked: checked === true, text, pos })
      }
    } else if (node.attrs.board !== undefined) {
      normalizeBoard(node.attrs.board).columns.forEach((column, col) => {
        column.cards.forEach((card, idx) => {
          if (!card.agentId || !card.agentState) return
          tasks.push({
            kind: 'card', id: card.agentId, state: card.agentState, checked: card.checked,
            text: plainInlineMarkdown(card.md), pos, col, idx,
          })
        })
      })
      return false
    }
    return true
  })
  return tasks
}

/**
 * The groups of the list, in this order: what needs the user (an agent asked
 * something), what an agent is doing, what went silent, what waits in the
 * queue — the four the bar counts — then what an agent left behind for the
 * user to look at: to review, failed, interrupted — and last what is done
 * (box ticked: finished by the agent, or a review the user accepted).
 */
export const AGENT_LIST_GROUPS = ['waiting', 'running', AGENT_NO_SIGNAL, 'queued', 'review', 'failed', 'interrupted', 'done'] as const
export type AgentListGroupKey = (typeof AGENT_LIST_GROUPS)[number]

export interface AgentListRow {
  task: AgentListTask
  /** The state to show (agentDisplayStateNow): 'no-signal' for a silent running / waiting task. */
  display: AgentListGroupKey
  /** A queued task: its place in the order Run / Copy prompt hand them over (1 = first). */
  queuePosition: number | null
}

export interface AgentListGroup {
  key: AgentListGroupKey
  rows: AgentListRow[]
}

/** States that, with the box ticked, are done with: a queued task no agent will start, a failed / interrupted one the user settled. */
const SKIPPED_WHEN_CHECKED: readonly string[] = ['queued', 'failed', 'interrupted']

/**
 * The group a task with an agent marker goes in — the list's and the bar's
 * counts' one rule (agentTaskListGroups, agentStateCounts) — or null when it
 * is not shown: a queued / failed / interrupted task with its box ticked, a
 * done task unticked by hand (open again) or a state this version does not
 * know. A running / waiting task shows as its display state; a review the
 * user ticked (accepted) is done.
 */
export function agentListGroupOf(task: Pick<AgentListTask, 'id' | 'state' | 'checked'>, displayOf: AgentDisplayOf): AgentListGroupKey | null {
  if (task.checked && SKIPPED_WHEN_CHECKED.includes(task.state)) return null
  let display: string = task.state
  if (task.state === 'running' || task.state === 'waiting') display = displayOf(task.id, task.state)
  else if (task.state === 'review' && task.checked) display = 'done'
  else if (task.state === 'done' && !task.checked) return null
  return (AGENT_LIST_GROUPS as readonly string[]).includes(display) ? (display as AgentListGroupKey) : null
}

/** How many tasks each group of the list holds: the counts of the queue bar, one per state (0 for an empty group). */
export type AgentStateCounts = Record<AgentListGroupKey, number>

/**
 * The counts the queue bar shows — every state the list shows, so the bar
 * says what its list holds (agentListGroupOf). An id seen twice (a sync merge
 * can leave that) counts once per line, as the list lists it.
 */
export function agentStateCounts(tasks: readonly Pick<AgentListTask, 'id' | 'state' | 'checked'>[], displayOf: AgentDisplayOf): AgentStateCounts {
  const counts = Object.fromEntries(AGENT_LIST_GROUPS.map((key) => [key, 0])) as AgentStateCounts
  for (const task of tasks) {
    const key = agentListGroupOf(task, displayOf)
    if (key) counts[key]++
  }
  return counts
}

/**
 * The list's groups, without the empty ones (agentListGroupOf; the bar's
 * counts, agentStateCounts, follow the same rule): a queued task with its box
 * ticked is left out, a running / waiting one shows as its display state. "Done" holds the done tasks with
 * their box ticked and the reviews the user ticked (accepted); a done task
 * unticked by hand is open again and is not listed. The queue positions follow the
 * order queuedAgentIds hands the tasks over in (document order; an id seen
 * twice — a sync merge can leave that — keeps its first place).
 */
export function agentTaskListGroups(tasks: readonly AgentListTask[], displayOf: AgentDisplayOf): AgentListGroup[] {
  const byKey = new Map<AgentListGroupKey, AgentListRow[]>()
  const queueOrder = new Map<string, number>()
  for (const task of tasks) {
    const key = agentListGroupOf(task, displayOf)
    if (!key) continue
    let queuePosition: number | null = null
    if (key === 'queued') {
      if (!queueOrder.has(task.id)) queueOrder.set(task.id, queueOrder.size + 1)
      queuePosition = queueOrder.get(task.id)!
    }
    const rows = byKey.get(key) ?? []
    rows.push({ task, display: key, queuePosition })
    byKey.set(key, rows)
  }
  return AGENT_LIST_GROUPS.filter((key) => byKey.has(key)).map((key) => ({ key, rows: byKey.get(key)! }))
}

/** What a row says besides its text, from its block (null without one / without the fact). */
export interface AgentListDetail {
  /** Running: the agent's own estimate of how much is done (agentPercent). */
  percent: number | null
  /** Running: what the agent says it is doing (`task report`). */
  doing: string | null
  /** Running: how long since it started. */
  elapsedMs: number | null
  /** Waiting: its question (null: the block has none — the row says it asks anyway). */
  question: string | null
  /** No signal: how long since the agent was last heard of. */
  silentMs: number | null
  /** Failed: why. */
  failReason: string | null
  /** Done: how long since the agent finished. */
  finishedMs: number | null
}

const NO_DETAIL: AgentListDetail = { percent: null, doing: null, elapsedMs: null, question: null, silentMs: null, failReason: null, finishedMs: null }

function since(value: string | undefined, nowMs: number): number | null {
  const at = Date.parse(value || '')
  return Number.isFinite(at) && nowMs >= at ? nowMs - at : null
}

export function agentTaskListDetail(
  display: AgentListGroupKey,
  meta: Readonly<Record<string, string>> | null | undefined,
  nowMs: number,
): AgentListDetail {
  if (!meta) return NO_DETAIL
  const text = (v: string | undefined) => v?.replace(/\s+/g, ' ').trim() || null
  switch (display) {
    case 'running':
      return { ...NO_DETAIL, percent: agentPercent(meta), doing: text(meta.progress), elapsedMs: since(meta.startedAt, nowMs) }
    case 'waiting':
      return { ...NO_DETAIL, question: text(meta.question) }
    case AGENT_NO_SIGNAL:
      return { ...NO_DETAIL, silentMs: since(meta.lastSignal, nowMs) }
    case 'failed':
      return { ...NO_DETAIL, failReason: text(meta.failReason) }
    case 'done':
      return { ...NO_DETAIL, finishedMs: since(meta.finishedAt, nowMs) }
    default:
      return NO_DETAIL
  }
}

/** Index of the row the arrow keys move to: `step` ±1 (wraps around), or the first / last (Home / End). */
export function agentListStep(current: number, count: number, key: string): number | null {
  if (count === 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % count
  if (key === 'ArrowUp') return current < 0 ? count - 1 : (current - 1 + count) % count
  return null
}
