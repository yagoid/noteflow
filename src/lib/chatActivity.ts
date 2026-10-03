/**
 * Which in-progress cue the AI chat shows at the bottom of the conversation.
 *
 * Invariant: while a turn is streaming there is ALWAYS some visible feedback until it ends
 * (done / error / cancel), so the cue disappearing reliably means "the reply is finished":
 * - a running tool shows its own activity row, and a pending confirmation shows its card —
 *   those ARE the feedback, so no extra cue ('none');
 * - text flowing right now → a subtle 'streaming' cue under the bubble;
 * - the model working without emitting text (initial think, the gap after a tool result, the
 *   seconds spent generating tool-call arguments after a preamble, a mid-reply stall) → 'thinking'.
 */
export type ChatActivityCue = 'none' | 'thinking' | 'streaming'

/** No delta for this long while streaming (and no tool/confirm in play) → fall back to "Thinking…". */
export const STREAM_IDLE_MS = 1300

export interface ChatActivityInput {
  streaming: boolean
  lastRole: 'user' | 'assistant' | undefined // role of the last message (the assistant turn while streaming)
  awaitingModelText: boolean                 // store flag: working, no text yet for this step
  toolRunning: boolean                       // some action on the last turn is still 'running'
  pendingConfirm: boolean                    // a destructive-action confirmation card is shown
  lastDeltaAt: number | null                 // ms timestamp of the last text delta this turn (null = none yet)
  stalled: boolean                           // STREAM_IDLE_MS elapsed since `lastDeltaAt` with no new delta
}

export function chatActivityCue(i: ChatActivityInput): ChatActivityCue {
  if (!i.streaming || i.lastRole !== 'assistant') return 'none'
  if (i.pendingConfirm || i.toolRunning) return 'none'
  if (i.awaitingModelText || i.lastDeltaAt === null || i.stalled) return 'thinking'
  return 'streaming'
}

/** Milliseconds until a stream that last emitted at `lastDeltaAt` counts as stalled (never negative). */
export function msUntilStalled(lastDeltaAt: number, now: number): number {
  return Math.max(0, lastDeltaAt + STREAM_IDLE_MS - now)
}
