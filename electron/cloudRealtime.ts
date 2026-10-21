// NoteFlow Cloud Realtime subscription (phase 4.2, stage 3) — main-process only.
//
// Replaces the interim autosync polling with a push signal: a raw WebSocket to
// Supabase Realtime (Phoenix protocol, vsn=1.0.0) subscribed to postgres_changes
// on public.files filtered to the signed-in user (migration 0006 adds the table
// to the supabase_realtime publication). NO new dependencies — Electron 35 ships
// Node 22, whose global WebSocket (undici) is enough; same REST/WS-pure
// philosophy as account.ts / cloudKeys.ts (no @supabase/supabase-js).
//
// The event payload is CIPHERTEXT rows and is deliberately NEVER parsed or
// applied here: all decryption/conflict logic lives in cloudSync.pullNotes().
// This module only tells main.ts "something changed remotely" (onRemoteChange),
// which debounces and runs the normal sync cycle (pull → drain journal) — also
// fired on every successful (re)join as a catch-up for the time the socket was
// down. Key material never enters this module.
//
// Pure protocol logic (frames, classification, backoff) lives in
// cloudRealtimeLogic.ts, tested in tests/electron/cloudRealtime.test.ts.

import * as account from './account'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isCloudConfigured } from './cloudConfig'
import {
  buildRealtimeUrl,
  buildJoinFrame,
  buildHeartbeatFrame,
  buildAccessTokenFrame,
  classifyFrame,
  isFreshJoin,
  nextBackoffMs,
  type PhoenixFrame,
} from './cloudRealtimeLogic'

// ── Constants ─────────────────────────────────────────────────────────────────

// Under Phoenix's default 60 s channel timeout; a missed ack is detected on the
// next tick (~25 s), so a dead connection is noticed in ≤ ~50 s.
const HEARTBEAT_INTERVAL_MS = 25_000

// GoTrue JWTs expire in ~1 h — refresh the channel's token well before that.
// (Reconnects always fetch a fresh token anyway.)
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000

// ── Module state ──────────────────────────────────────────────────────────────

let started = false
let onRemoteChangeCb: (() => void) | null = null
let ws: WebSocket | null = null
// Bumped on every start/stop/reconnect — lets async continuations detect they
// belong to a torn-down session and bail out silently.
let generation = 0
let joined = false
let refCounter = 0
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null
let awaitingHeartbeatAck = false

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Starts (idempotently) the Realtime subscription. `onRemoteChange` fires once
 * per incoming postgres_changes event and once per successful channel
 * (re)join (catch-up) — the caller debounces and pulls.
 * Reconnection (exponential backoff with jitter, capped at 60 s) is handled
 * internally and silently: offline periods produce no error cascades, just one
 * sober log per state transition.
 */
export function startCloudRealtime(onRemoteChange: () => void): void {
  onRemoteChangeCb = onRemoteChange
  if (started) return
  started = true
  reconnectAttempt = 0
  void connect(++generation)
}

/** Closes the socket and clears every timer. Idempotent. */
export function stopCloudRealtime(): void {
  if (!started) return
  started = false
  generation++
  onRemoteChangeCb = null
  clearReconnectTimer()
  teardownConnection()
}

/** True while the channel join has been acked (exposed via CloudSyncStatus). */
export function isCloudRealtimeConnected(): boolean {
  return joined
}

// ── Connection lifecycle ──────────────────────────────────────────────────────

async function connect(gen: number): Promise<void> {
  if (!started || gen !== generation || !isCloudConfigured()) return

  // Fresh credentials on EVERY (re)connect — Supabase JWTs expire in ~1 h.
  const userId = account.getUserId()
  let token: string | null = null
  try {
    token = await account.getAccessToken()
  } catch {
    token = null
  }
  if (gen !== generation) return
  if (!userId || !token) {
    // No usable session right now (signed out mid-flight, or offline refresh) —
    // retry later; main.ts stops us for real on sign-out.
    scheduleReconnect()
    return
  }

  let socket: WebSocket
  try {
    socket = new WebSocket(buildRealtimeUrl(SUPABASE_URL, SUPABASE_ANON_KEY))
  } catch {
    scheduleReconnect()
    return
  }
  ws = socket

  socket.onopen = () => {
    if (gen !== generation || socket !== ws) return
    sendFrame(buildJoinFrame(userId, token, ++refCounter))
    startHeartbeat()
    startTokenRefresh()
  }
  socket.onmessage = (ev) => {
    if (gen !== generation || socket !== ws) return
    handleFrame(typeof ev.data === 'string' ? ev.data : String(ev.data))
  }
  socket.onclose = () => {
    if (gen !== generation || socket !== ws) return
    handleConnectionLost('socket closed')
  }
  socket.onerror = () => {
    // onclose always follows an error — nothing to do here (and logging every
    // failed attempt while offline would be exactly the cascade we avoid).
  }
}

function handleFrame(raw: string): void {
  const kind = classifyFrame(raw)
  switch (kind) {
    case 'change':
      onRemoteChangeCb?.()
      break
    case 'heartbeat-ok':
      awaitingHeartbeatAck = false
      break
    case 'join-ok':
      if (isFreshJoin(kind, joined)) {
        joined = true
        reconnectAttempt = 0 // stable connection — reset the backoff
        console.log('[CloudRealtime] channel joined')
        // Catch-up: whatever changed while the socket was down (or before the
        // first join) emitted no event we will ever see — ask main for a cycle
        // now instead of waiting for the safety-net tick.
        onRemoteChangeCb?.()
      }
      break
    case 'join-error':
      // Bad/expired token or rejected channel — rejoin with fresh credentials.
      handleConnectionLost('channel rejected')
      break
    case 'close':
      handleConnectionLost('channel closed by server')
      break
    case 'other':
      break
  }
}

function handleConnectionLost(reason: string): void {
  if (joined) console.log(`[CloudRealtime] disconnected (${reason}) — will reconnect`)
  teardownConnection()
  scheduleReconnect()
}

function teardownConnection(): void {
  joined = false
  awaitingHeartbeatAck = false
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer)
    tokenRefreshTimer = null
  }
  const socket = ws
  ws = null
  if (socket) {
    // Detach before closing so the stale socket can't re-enter our handlers.
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = () => { /* swallow late errors from the dying socket */ }
    try {
      socket.close()
    } catch {
      // already closed/failed — fine
    }
  }
}

function scheduleReconnect(): void {
  if (!started || reconnectTimer) return
  const delay = nextBackoffMs(reconnectAttempt++)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect(++generation)
  }, delay)
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

// ── Keepalive ─────────────────────────────────────────────────────────────────

function startHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  awaitingHeartbeatAck = false
  heartbeatTimer = setInterval(() => {
    if (awaitingHeartbeatAck) {
      // The previous heartbeat was never acked — the connection is dead even
      // if the TCP socket looks open (e.g. network switch, laptop resume).
      handleConnectionLost('heartbeat timeout')
      return
    }
    awaitingHeartbeatAck = true
    sendFrame(buildHeartbeatFrame(++refCounter))
  }, HEARTBEAT_INTERVAL_MS)
}

function startTokenRefresh(): void {
  if (tokenRefreshTimer) clearInterval(tokenRefreshTimer)
  tokenRefreshTimer = setInterval(async () => {
    const gen = generation
    let token: string | null = null
    try {
      token = await account.getAccessToken()
    } catch {
      token = null
    }
    if (gen !== generation || !token) return // torn down meanwhile, or offline
    sendFrame(buildAccessTokenFrame(token, ++refCounter))
  }, TOKEN_REFRESH_INTERVAL_MS)
}

function sendFrame(frame: PhoenixFrame): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  try {
    ws.send(JSON.stringify(frame))
  } catch (err) {
    console.error('[CloudRealtime] send failed:', String(err))
  }
}
