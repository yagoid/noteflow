// Pure logic for the NoteFlow Cloud Realtime subscription (phase 4.2, stage 3):
// Phoenix-protocol frame building/classification and the reconnection backoff.
// Lives in electron/ but imports nothing from Electron — cloudRealtime.ts owns
// the WebSocket and all IO — following the same pure-module pattern as
// cloudSyncLogic.ts / syncState.ts. Covered by tests/electron/cloudRealtime.test.ts.
//
// Protocol recap (Supabase Realtime speaks Phoenix, vsn=1.0.0 = plain JSON
// object frames {topic, event, payload, ref}):
//   - join a channel topic with a phx_join carrying the postgres_changes
//     config (server-side filter user_id=eq.<uid>) + the caller's JWT;
//   - a successful join answers with phx_reply {status:'ok'} ON THE TOPIC
//     (the response carries the assigned postgres_changes subscription ids);
//   - heartbeats go to the reserved 'phoenix' topic and are acked with a
//     phx_reply there;
//   - row changes arrive as 'postgres_changes' events on the topic. Their
//     payload is CIPHERTEXT rows — the client never applies it, it only uses
//     the event as a "something changed" signal to trigger a normal pull;
//   - the JWT expires (~1 h): pushing an 'access_token' event on the topic
//     refreshes the channel's authorization without rejoining.

// ── Frames ────────────────────────────────────────────────────────────────────

/** Channel topic for the files subscription (client-chosen, 'realtime:' prefix required). */
export const REALTIME_TOPIC = 'realtime:cloud-files'

/** Reserved Phoenix topic for heartbeats. */
export const PHOENIX_TOPIC = 'phoenix'

export interface PhoenixFrame {
  topic: string
  event: string
  payload: unknown
  ref: string
}

/** wss URL of the Realtime endpoint for a Supabase project URL. */
export function buildRealtimeUrl(supabaseUrl: string, anonKey: string): string {
  const wsBase = supabaseUrl.replace(/^http/, 'ws')
  return `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=1.0.0`
}

/**
 * phx_join for the files channel: subscribes to every postgres_changes event
 * on public.files filtered BY THE SERVER to the user's own rows. The filter is
 * defense in depth on top of RLS — either way only ciphertext ever travels.
 */
export function buildJoinFrame(userId: string, accessToken: string, ref: number): PhoenixFrame {
  return {
    topic: REALTIME_TOPIC,
    event: 'phx_join',
    payload: {
      config: {
        broadcast: { self: false },
        presence: { key: '' },
        postgres_changes: [
          { event: '*', schema: 'public', table: 'files', filter: `user_id=eq.${userId}` },
        ],
      },
      access_token: accessToken,
    },
    ref: String(ref),
  }
}

export function buildHeartbeatFrame(ref: number): PhoenixFrame {
  return { topic: PHOENIX_TOPIC, event: 'heartbeat', payload: {}, ref: String(ref) }
}

/** Refreshes the channel's JWT in place (GoTrue tokens expire in ~1 h). */
export function buildAccessTokenFrame(accessToken: string, ref: number): PhoenixFrame {
  return {
    topic: REALTIME_TOPIC,
    event: 'access_token',
    payload: { access_token: accessToken },
    ref: String(ref),
  }
}

// ── Incoming frame classification ─────────────────────────────────────────────

/**
 * 'change'        — a postgres_changes event on our topic (trigger a sync cycle).
 * 'heartbeat-ok'  — the server acked a heartbeat (connection is alive).
 * 'join-ok'       — phx_reply {status:'ok'} on our topic. NOTE: replies to any
 *                   later push on the topic (e.g. access_token) also land here —
 *                   deliberate: they all mean "the channel is healthy".
 * 'join-error'    — phx_reply {status:'error'} on our topic (bad/expired token,
 *                   channel rejected) → reconnect with a fresh token.
 * 'close'         — phx_close / phx_error on our topic (server closed or crashed
 *                   the channel) → reconnect.
 * 'other'         — anything else (presence, system notices, unknown frames).
 */
export type FrameKind = 'change' | 'heartbeat-ok' | 'join-ok' | 'join-error' | 'close' | 'other'

export function classifyFrame(raw: string): FrameKind {
  let frame: Partial<PhoenixFrame>
  try {
    frame = JSON.parse(raw) as Partial<PhoenixFrame>
  } catch {
    return 'other'
  }
  if (!frame || typeof frame !== 'object') return 'other'
  const { topic, event, payload } = frame

  if (topic === PHOENIX_TOPIC) {
    return event === 'phx_reply' && replyStatus(payload) === 'ok' ? 'heartbeat-ok' : 'other'
  }
  if (topic !== REALTIME_TOPIC) return 'other'

  if (event === 'postgres_changes') return 'change'
  if (event === 'phx_reply') return replyStatus(payload) === 'ok' ? 'join-ok' : 'join-error'
  if (event === 'phx_close' || event === 'phx_error') return 'close'
  return 'other'
}

/**
 * True when a frame completes a channel (re)join: the first 'join-ok' since the
 * socket (re)connected (`alreadyJoined` is reset on every teardown). Later
 * 'join-ok' replies — e.g. to an access_token push — don't count. Every fresh
 * join must trigger a catch-up sync: changes made while the socket was down
 * produced no event this client will ever receive.
 */
export function isFreshJoin(kind: FrameKind, alreadyJoined: boolean): boolean {
  return kind === 'join-ok' && !alreadyJoined
}

function replyStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const status = (payload as Record<string, unknown>).status
  return typeof status === 'string' ? status : null
}

// ── Reconnection backoff ──────────────────────────────────────────────────────

const BACKOFF_BASE_MS = 1000
const BACKOFF_CAP_MS = 60_000

/**
 * Exponential backoff with jitter: 1 s → 2 → 4 → … capped at 60 s, then
 * scaled into [50%, 100%] of that value so a fleet of clients doesn't
 * reconnect in lockstep after an outage. `jitter01` is injectable for tests
 * (Math.random() in production).
 */
export function nextBackoffMs(attempt: number, jitter01: number = Math.random()): number {
  const exp = Math.min(Math.max(attempt, 0), 30) // 2^30 guard against overflow
  const capped = Math.min(BACKOFF_BASE_MS * 2 ** exp, BACKOFF_CAP_MS)
  return Math.round(capped / 2 + (capped / 2) * Math.min(Math.max(jitter01, 0), 1))
}
