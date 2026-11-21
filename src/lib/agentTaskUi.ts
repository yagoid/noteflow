// Agent tasks — the decisions of the interface, as pure functions: what a
// click on a task's chip does, which actions the report menu offers in each
// state, the facts it lists and which reports the discard-by-age may remove.
// The marker / agent.md format itself is lib/agentTasks.ts. Covered by
// tests/lib/agentTaskUi.test.ts.
// Docs: .agents/context/patterns.md "Tareas con agentes: interfaz".

import {
  AGENT_FINISHED_STATES,
  AGENT_LIVE_STATES,
  AGENT_NO_SIGNAL,
  AGENT_TASK_STATES,
  agentDisplayState,
  agentIdsIn,
  agentTaskLines,
  setAgentMarkerInContent,
  type AgentBlock,
} from './agentTasks'

/** The states the interface has a name, a colour and an icon for. Anything else is 'unknown'. */
export type AgentTone = (typeof AGENT_TASK_STATES)[number] | 'no-signal' | 'unknown'

/** The look of a state to SHOW (agentDisplayState): itself when known, else 'unknown' (a newer client's). */
export function agentStateTone(displayState: string): AgentTone {
  if (displayState === AGENT_NO_SIGNAL) return 'no-signal'
  return (AGENT_TASK_STATES as readonly string[]).includes(displayState) ? (displayState as AgentTone) : 'unknown'
}

/**
 * What a click on a task's agent chip does:
 *   - no marker → 'queue' (hand the task to the agents, no menu in between);
 *   - queued → 'unqueue' (take it back);
 *   - anything else — an agent has touched it — → 'report' (the big menu).
 */
export type AgentChipAction = 'queue' | 'unqueue' | 'report'

export function agentChipAction(agentId: string | null | undefined, agentState: string | null | undefined): AgentChipAction {
  if (!agentId || !agentState) return 'queue'
  return agentState === 'queued' ? 'unqueue' : 'report'
}

/** States a task can go "back to the queue" from: the agent is through with it, or lost. */
const REQUEUE_STATES: readonly string[] = ['failed', 'interrupted', AGENT_NO_SIGNAL, 'review']
/** States whose report can be discarded without asking: no agent is working on the task. */
const SETTLED_STATES: readonly string[] = [...AGENT_FINISHED_STATES, 'review', 'interrupted', 'queued']

export type AgentReportAction = 'markDone' | 'requeue' | 'copyPrompt' | 'run' | 'openSession' | 'reopen' | 'dismiss' | 'copyId'

/**
 * The two states drawn IN the task's own checkbox instead of a chip next to
 * it — the ones that read without words: 'running' with the box unticked (its
 * border runs) and 'done' with the box ticked (the tick with a spark). A click
 * on such a box opens the report and never toggles it. Any other mix (done
 * but unticked, running but ticked, every other state) keeps the plain box
 * and the text chip. `tone`: agentStateTone of the state SHOWN.
 */
export type AgentBoxGlyph = 'running' | 'done'

export function agentBoxGlyph(tone: AgentTone | null | undefined, checked: boolean): AgentBoxGlyph | null {
  if (tone === 'running' && !checked) return 'running'
  if (tone === 'done' && checked) return 'done'
  return null
}

/** States a task can be SENT to an agent from, besides having no marker at all. */
const SENDABLE_STATES: readonly string[] = ['queued', ...REQUEUE_STATES]

/**
 * Can this task be handed to an agent now — its id put in a copied prompt (the
 * queue bar, the button over a selection, the report menu)? ONE rule for the
 * three places:
 *   - never a task whose box is checked (the CLI does not start it);
 *   - yes without a marker, or queued, failed, interrupted, to review or with
 *     no signal — and `done` with the box unticked by hand (it is open again);
 *   - never running / waiting with a recent signal (a task in progress is not
 *     taken from its agent) nor in a state this version does not know.
 * `displayState`: the state to SHOW (null = no marker). Sending a task that is
 * not `queued` puts it back in the queue first.
 */
export function agentCanSend(displayState: string | null | undefined, checked: boolean): boolean {
  if (checked) return false
  if (!displayState) return true
  return SENDABLE_STATES.includes(displayState) || displayState === 'done'
}

/**
 * The state to SHOW for a marker whose line says `state`, given what this
 * window knows of its block: itself, or 'no-signal' for a running / waiting
 * task whose block has been silent for too long — or that has no block here
 * once the reports are loaded (`settled`; before that, as written: no flicker
 * while a note opens). The rule behind useAgentDisplayState.
 */
export function resolveAgentDisplayState(
  state: string,
  known: { hasBlock: boolean; lastSignal: string | null | undefined; settled: boolean; staleMinutes: number; nowMs: number },
): string {
  if (!AGENT_LIVE_STATES.includes(state)) return state
  if (!known.hasBlock) return known.settled ? AGENT_NO_SIGNAL : state
  return agentDisplayState(state, known.lastSignal ?? undefined, known.staleMinutes, known.nowMs)
}

/**
 * The actions of the report menu for a task in `displayState`, in the order
 * they are shown. A read-only editor only offers what changes nothing.
 * `markDone` goes away once the task is done AND its box checked; `requeue`
 * is for the states in REQUEUE_STATES — and for a done task whose box the user
 * unticked by hand: it is open again, and the queue is where it goes back to.
 * `copyPrompt` and `run` (launch the agent on it) wherever the task can be
 * sent (agentCanSend); the menu only shows the ones its caller can do.
 * `reopen` (untick the box) only for a done task whose box is ticked: that box
 * opens the report instead of toggling (agentBoxGlyph), so the menu is where
 * it is unticked.
 * `openSession` (open the agent's conversation in Claude Desktop) when the
 * caller says the block has a session on this machine (`session`:
 * agentDesktopSessionHere) — in every state but `queued` (no agent has it), and
 * also read-only: it changes nothing in the note.
 */
export function agentReportActions(displayState: string, opts: { checked: boolean; editable: boolean; session?: boolean }): AgentReportAction[] {
  const session = opts.session === true && displayState !== 'queued'
  if (!opts.editable) return session ? ['openSession', 'copyId'] : ['copyId']
  const actions: AgentReportAction[] = []
  if (!(displayState === 'done' && opts.checked)) actions.push('markDone')
  if (REQUEUE_STATES.includes(displayState) || (displayState === 'done' && !opts.checked)) actions.push('requeue')
  if (agentCanSend(displayState, opts.checked)) actions.push('copyPrompt', 'run')
  if (session) actions.push('openSession')
  if (displayState === 'done' && opts.checked) actions.push('reopen')
  actions.push('dismiss', 'copyId')
  return actions
}

/** The actions of the report's foot that move, send or open the task (the right side). */
const FOOT_MAIN_ACTIONS: readonly AgentReportAction[] = ['markDone', 'requeue', 'copyPrompt', 'run', 'openSession', 'reopen']
/**
 * Which one becomes the secondary button when the main one is taken: the first
 * offered. The agent's conversation comes first: when a task has one here, it
 * is what to read before marking it done or sending it again.
 */
const FOOT_SECONDARY_ORDER: readonly AgentReportAction[] = ['openSession', 'requeue', 'run', 'copyPrompt', 'reopen', 'markDone']

/**
 * How the report's foot lays out `actions` (agentReportActions, already
 * filtered by what the caller can do):
 *   - `quiet`: copy id and discard, icons on the left;
 *   - `main`: the solid button — the action the state waits for
 *     (agentPrimaryAction), else "Run" when offered, else none;
 *   - `secondary`: the next one that matters (open the agent's session, back
 *     to the queue, run, copy prompt, reopen, mark as done — the first
 *     offered), a quiet button;
 *   - `icons`: the rest of the right side, folded into their icons.
 */
export function agentFootLayout(displayState: string, actions: readonly AgentReportAction[]): {
  quiet: AgentReportAction[]
  main: AgentReportAction | null
  secondary: AgentReportAction | null
  icons: AgentReportAction[]
} {
  const main = agentPrimaryAction(displayState, actions) ?? (actions.includes('run') ? 'run' : null)
  const secondary = FOOT_SECONDARY_ORDER.find((a) => a !== main && actions.includes(a)) ?? null
  return {
    quiet: (['copyId', 'dismiss'] as const).filter((a) => actions.includes(a)),
    main,
    secondary,
    icons: FOOT_MAIN_ACTIONS.filter((a) => a !== main && a !== secondary && actions.includes(a)),
  }
}

/**
 * What each state waits for, in order of preference (the first one offered).
 * While an agent has the task — at work, asking, or silent — that is its
 * conversation, when it can be opened here: a question is answered there, and a
 * silent agent is often stuck on something only that window shows.
 */
const PRIMARY_BY_STATE: Readonly<Record<string, readonly AgentReportAction[]>> = {
  running: ['openSession'],
  waiting: ['openSession'],
  [AGENT_NO_SIGNAL]: ['openSession', 'requeue'],
  review: ['markDone'],
  failed: ['requeue'],
  interrupted: ['requeue'],
}

/** The action to stress in the menu's footer: the one the state is waiting for, if any. */
export function agentPrimaryAction(displayState: string, actions: readonly AgentReportAction[]): AgentReportAction | null {
  const wanted = Object.prototype.hasOwnProperty.call(PRIMARY_BY_STATE, displayState) ? PRIMARY_BY_STATE[displayState] : []
  return wanted.find((a) => actions.includes(a)) ?? null
}

/** Discarding asks first while an agent may still be on the task (running, waiting, no signal, a state we don't know). */
export function agentDismissNeedsConfirm(displayState: string): boolean {
  return !SETTLED_STATES.includes(displayState)
}

/** Is the agent (supposedly) at work? Only then a `progress` line is news. */
export function agentIsLive(displayState: string): boolean {
  return AGENT_LIVE_STATES.includes(displayState)
}

/**
 * How much of the task its agent estimates is done (`task report --percent`):
 * the block's optional `percent`, an integer 0…100. Tolerant of what a hand or
 * another version may leave — '40', '40%', ' 40 % ' — and null for anything
 * else (a decimal, a sign, out of range, missing). The same rule as the CLI's
 * (parseAgentPercent). The report shows it only while the agent is live.
 */
export function agentPercent(meta: Readonly<Record<string, string>> | null | undefined): number | null {
  const m = /^\s*(\d{1,3})\s*%?\s*$/.exec(meta?.percent ?? '')
  if (!m) return null
  const n = Number(m[1])
  return n <= 100 ? n : null
}

// The facts of a report ─ what its header says, ready to show.

export interface AgentFacts {
  machine: string | null
  agent: string | null
  /** The model `noteflow run --model` launched the agent with (the block's optional `model`). */
  model: string | null
  /** Epoch ms, null when the header has no valid date. */
  startedAt: number | null
  finishedAt: number | null
  /** finished − started; while the agent is live, now − started. Null without a start. */
  durationMs: number | null
  branch: string | null
  commits: number | null
  filesChanged: number | null
}

function metaDate(value: string | undefined): number | null {
  const at = Date.parse(value || '')
  return Number.isFinite(at) ? at : null
}

function metaCount(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null
}

export function agentFacts(meta: Readonly<Record<string, string>>, displayState: string, nowMs: number): AgentFacts {
  const startedAt = metaDate(meta.startedAt)
  const finishedAt = metaDate(meta.finishedAt)
  const end = finishedAt ?? (agentIsLive(displayState) ? nowMs : null)
  return {
    machine: meta.machine?.trim() || null,
    agent: meta.agent?.trim() || null,
    model: meta.model?.trim() || null,
    startedAt,
    finishedAt,
    durationMs: startedAt !== null && end !== null && end >= startedAt ? end - startedAt : null,
    branch: meta.gitBranch?.trim() || null,
    commits: metaCount(meta.gitCommits),
    filesChanged: metaCount(meta.gitFilesChanged),
  }
}

/**
 * One event of the report's timeline. Only what the block says — no event or
 * hour is made up: `at` is null when the block has no time for it (a progress
 * line, a question: the block keeps the text, not when it came).
 */
export interface AgentThreadEvent {
  kind: 'started' | 'progress' | 'question' | 'failed' | 'finished' | 'interrupted' | 'noSignal'
  /** Epoch ms, or null: no time to show. */
  at: number | null
  /** progress / question / fail reason, as the agent wrote it. */
  text: string | null
  /** Where the task is now: its dot takes the state's colour. At most one. */
  now: boolean
}

export interface AgentThread {
  events: AgentThreadEvent[]
  /** The facts no event carries, for the one-line strip under the timeline. */
  leftover: { branch: string | null; commits: number | null; filesChanged: number | null }
}

/**
 * The report's timeline for a task in `displayState`: started (with its
 * branch), what the agent is doing (while it is live), its question
 * (waiting), why it failed, finished (with commits and files), interrupted,
 * no signal. There is no "queued at" event: the block has no time for that
 * (`createdAt` is when the CLI first wrote the block, often at the start).
 */
export function agentThread(meta: Readonly<Record<string, string>>, displayState: string, facts: AgentFacts): AgentThread {
  const events: AgentThreadEvent[] = []
  const text = (v: string | undefined) => v?.trim() || null
  if (facts.startedAt !== null) events.push({ kind: 'started', at: facts.startedAt, text: null, now: false })
  if (agentIsLive(displayState) && text(meta.progress)) events.push({ kind: 'progress', at: null, text: text(meta.progress), now: false })
  if (displayState === 'waiting') events.push({ kind: 'question', at: null, text: text(meta.question), now: false })
  if (displayState === 'failed') events.push({ kind: 'failed', at: facts.finishedAt, text: text(meta.failReason), now: false })
  if ((displayState === 'done' || displayState === 'review') && facts.finishedAt !== null) {
    events.push({ kind: 'finished', at: facts.finishedAt, text: null, now: false })
  }
  if (displayState === 'interrupted') events.push({ kind: 'interrupted', at: facts.finishedAt, text: null, now: false })
  if (displayState === AGENT_NO_SIGNAL) events.push({ kind: 'noSignal', at: null, text: null, now: false })
  const last = events[events.length - 1]
  // The start is "now" only while the agent runs with nothing newer to say.
  if (last && (last.kind !== 'started' || displayState === 'running')) last.now = true
  const started = events.some((e) => e.kind === 'started')
  const finished = events.some((e) => e.kind === 'finished')
  return {
    events,
    leftover: {
      branch: started ? null : facts.branch,
      commits: finished ? null : facts.commits,
      filesChanged: finished ? null : facts.filesChanged,
    },
  }
}

/** Is there anything in `facts` worth a grid? */
export function agentFactsEmpty(facts: AgentFacts): boolean {
  return Object.values(facts).every((v) => v === null)
}

/** A duration in the two largest units that matter: '<1m', '12m', '2h 05m', '3d 4h'. Language-neutral. */
export function formatAgentDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

// Maintenance ─ the note's side of the discard by age.

/**
 * id → the state on the task's LINE, over every section of a note. An id on
 * several lines (a sync merge can leave that) keeps a state that is NOT
 * finished if any line has one: the careful reading for a discard.
 */
export function agentLineStates(sections: ReadonlyArray<{ content?: string | null }> | null | undefined): Map<string, string> {
  const states = new Map<string, string>()
  for (const s of sections || []) {
    const content = s.content || ''
    if (!content.includes('🤖')) continue
    for (const task of agentTaskLines(content)) {
      if (!task.marker) continue
      const known = states.get(task.marker.id)
      if (known === undefined || AGENT_FINISHED_STATES.includes(known)) states.set(task.marker.id, task.marker.state)
    }
  }
  return states
}

/**
 * Of the ids main reports as discardable by age (`agent-tasks:read`, judged by
 * the BLOCK's state), the ones this window may really discard: the task's line
 * is in the note and says done / failed too. A task reopened on its line is
 * kept; an id that is on no task line is left to the orphan rule (a week's
 * grace: the line may be in content this window does not hold).
 */
export function confirmedAgentDiscards(
  discardable: readonly string[],
  sections: ReadonlyArray<{ content?: string | null }> | null | undefined,
): string[] {
  if (discardable.length === 0) return []
  const lineStates = agentLineStates(sections)
  return discardable.filter((id) => AGENT_FINISHED_STATES.includes(lineStates.get(id) ?? ''))
}

/**
 * `sections` with the markers of `ids` removed from their task lines — the
 * same array when no line carried any of them (nothing to write).
 */
export function withoutAgentMarkers<T extends { content: string }>(sections: T[], ids: readonly string[]): T[] {
  let changed = false
  const next = sections.map((s) => {
    if (!s.content.includes('🤖')) return s
    let content = s.content
    for (const id of ids) content = setAgentMarkerInContent(content, id, null)
    if (content === s.content) return s
    changed = true
    return { ...s, content }
  })
  return changed ? next : sections
}

/** Does any section of the note mention an agent task? (The cheap test that decides whether a note's reports are loaded at all.) */
export function noteHasAgentMarkers(sections: ReadonlyArray<{ content?: string | null }> | null | undefined): boolean {
  for (const s of sections || []) {
    if ((s.content || '').includes('🤖') && agentIdsIn([s]).size > 0) return true
  }
  return false
}

/** Do these blocks hold a task whose 'no signal' depends on the clock? (Only then the minute timer runs.) */
export function hasLiveAgentBlocks(blocks: readonly AgentBlock[]): boolean {
  return blocks.some((b) => AGENT_LIVE_STATES.includes(b.meta.state ?? ''))
}

/**
 * Should the maintenance of a note (orphans + discard by age) run now? Not
 * while one is running, not while the note has an edit waiting on its debounce
 * (its content is not what the store holds), and — unless `force`d, when the
 * note is opened — not more often than `minIntervalMs`: a refresh caused by
 * our own write (agent-tasks:changed) must not start another round.
 */
export function agentMaintenanceDue(s: {
  running: boolean
  pendingEdits: boolean
  lastRunAt: number | undefined
  nowMs: number
  minIntervalMs: number
  force: boolean
}): boolean {
  if (s.running || s.pendingEdits) return false
  if (s.force || s.lastRunAt === undefined) return true
  return s.nowMs - s.lastRunAt >= s.minIntervalMs
}
