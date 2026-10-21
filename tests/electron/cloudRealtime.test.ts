import { describe, it, expect } from 'vitest'
import {
  REALTIME_TOPIC,
  PHOENIX_TOPIC,
  buildRealtimeUrl,
  buildJoinFrame,
  buildHeartbeatFrame,
  buildAccessTokenFrame,
  classifyFrame,
  isFreshJoin,
  nextBackoffMs,
} from '../../electron/cloudRealtimeLogic'

const UID = '2b0c9a4e-1111-2222-3333-444455556666'
const JWT = 'eyJ.fake.jwt'

// ── URL ───────────────────────────────────────────────────────────────────────

describe('buildRealtimeUrl', () => {
  it('derives the wss endpoint from the project URL with apikey + vsn', () => {
    expect(buildRealtimeUrl('https://xyz.supabase.co', 'anon-key')).toBe(
      'wss://xyz.supabase.co/realtime/v1/websocket?apikey=anon-key&vsn=1.0.0'
    )
  })

  it('URL-encodes the anon key', () => {
    const url = buildRealtimeUrl('https://xyz.supabase.co', 'k+y/=')
    expect(url).toContain(`apikey=${encodeURIComponent('k+y/=')}`)
  })
})

// ── Outgoing frames ───────────────────────────────────────────────────────────

describe('buildJoinFrame', () => {
  it('builds a phx_join with the user-filtered postgres_changes config and the JWT', () => {
    const frame = buildJoinFrame(UID, JWT, 1)
    expect(frame.topic).toBe(REALTIME_TOPIC)
    expect(frame.event).toBe('phx_join')
    expect(frame.ref).toBe('1')
    const payload = frame.payload as {
      config: { postgres_changes: Array<Record<string, string>> }
      access_token: string
    }
    expect(payload.access_token).toBe(JWT)
    expect(payload.config.postgres_changes).toEqual([
      { event: '*', schema: 'public', table: 'files', filter: `user_id=eq.${UID}` },
    ])
  })

  it('is JSON-serializable as a flat object frame (vsn=1.0.0)', () => {
    const wire = JSON.parse(JSON.stringify(buildJoinFrame(UID, JWT, 7)))
    expect(Object.keys(wire).sort()).toEqual(['event', 'payload', 'ref', 'topic'])
  })
})

describe('buildHeartbeatFrame / buildAccessTokenFrame', () => {
  it('heartbeats go to the reserved phoenix topic', () => {
    expect(buildHeartbeatFrame(3)).toEqual({
      topic: PHOENIX_TOPIC,
      event: 'heartbeat',
      payload: {},
      ref: '3',
    })
  })

  it('access_token refreshes the channel topic with the fresh JWT', () => {
    const frame = buildAccessTokenFrame('fresh.jwt', 9)
    expect(frame.topic).toBe(REALTIME_TOPIC)
    expect(frame.event).toBe('access_token')
    expect(frame.payload).toEqual({ access_token: 'fresh.jwt' })
    expect(frame.ref).toBe('9')
  })
})

// ── Incoming frame classification ─────────────────────────────────────────────

const frame = (topic: string, event: string, payload: unknown = {}, ref: string | null = null) =>
  JSON.stringify({ topic, event, payload, ref })

describe('classifyFrame', () => {
  it('classifies postgres_changes on our topic as change (payload never inspected)', () => {
    const raw = frame(REALTIME_TOPIC, 'postgres_changes', {
      ids: [1],
      data: { type: 'UPDATE', record: { content_ct: 'ciphertext…' } },
    })
    expect(classifyFrame(raw)).toBe('change')
  })

  it('classifies a successful join reply — phx_reply status ok carrying the assigned ids', () => {
    const raw = frame(
      REALTIME_TOPIC,
      'phx_reply',
      { status: 'ok', response: { postgres_changes: [{ id: 123 }] } },
      '1'
    )
    expect(classifyFrame(raw)).toBe('join-ok')
  })

  it('classifies a rejected join / channel error reply', () => {
    const raw = frame(REALTIME_TOPIC, 'phx_reply', { status: 'error', response: {} }, '1')
    expect(classifyFrame(raw)).toBe('join-error')
  })

  it('classifies heartbeat acks on the phoenix topic', () => {
    expect(classifyFrame(frame(PHOENIX_TOPIC, 'phx_reply', { status: 'ok', response: {} }, '2'))).toBe(
      'heartbeat-ok'
    )
    // A failed heartbeat reply is NOT an ack — the missing ack triggers reconnect.
    expect(classifyFrame(frame(PHOENIX_TOPIC, 'phx_reply', { status: 'error' }, '2'))).toBe('other')
  })

  it('classifies server-side channel termination', () => {
    expect(classifyFrame(frame(REALTIME_TOPIC, 'phx_close'))).toBe('close')
    expect(classifyFrame(frame(REALTIME_TOPIC, 'phx_error'))).toBe('close')
  })

  it('ignores system/presence/foreign-topic frames and garbage', () => {
    expect(classifyFrame(frame(REALTIME_TOPIC, 'system', { message: 'Subscribed to PostgreSQL' }))).toBe('other')
    expect(classifyFrame(frame(REALTIME_TOPIC, 'presence_state'))).toBe('other')
    expect(classifyFrame(frame('realtime:other-channel', 'postgres_changes'))).toBe('other')
    expect(classifyFrame('not json at all')).toBe('other')
    expect(classifyFrame('null')).toBe('other')
    expect(classifyFrame('42')).toBe('other')
  })
})

// ── Fresh join (catch-up trigger) ─────────────────────────────────────────────

describe('isFreshJoin', () => {
  const joinOk = JSON.stringify({ topic: REALTIME_TOPIC, event: 'phx_reply', payload: { status: 'ok' }, ref: '1' })

  it('is true for the first join-ok of a connection (first join and every rejoin)', () => {
    expect(isFreshJoin(classifyFrame(joinOk), false)).toBe(true)
  })

  it('is false for later join-ok replies on a joined channel (e.g. access_token acks)', () => {
    expect(isFreshJoin(classifyFrame(joinOk), true)).toBe(false)
  })

  it('is false for every other frame kind', () => {
    for (const kind of ['change', 'heartbeat-ok', 'join-error', 'close', 'other'] as const) {
      expect(isFreshJoin(kind, false)).toBe(false)
    }
  })
})

// ── Backoff ───────────────────────────────────────────────────────────────────

describe('nextBackoffMs', () => {
  it('doubles per attempt at full jitter (jitter01 = 1 → 100% of the step)', () => {
    expect(nextBackoffMs(0, 1)).toBe(1000)
    expect(nextBackoffMs(1, 1)).toBe(2000)
    expect(nextBackoffMs(2, 1)).toBe(4000)
    expect(nextBackoffMs(5, 1)).toBe(32000)
  })

  it('caps at 60 s', () => {
    expect(nextBackoffMs(6, 1)).toBe(60000)
    expect(nextBackoffMs(50, 1)).toBe(60000) // also guards 2^attempt overflow
  })

  it('jitters within [50%, 100%] of the step', () => {
    expect(nextBackoffMs(2, 0)).toBe(2000) // 50% of 4000
    expect(nextBackoffMs(2, 0.5)).toBe(3000)
    expect(nextBackoffMs(2, 1)).toBe(4000)
  })

  it('clamps out-of-range inputs instead of misbehaving', () => {
    expect(nextBackoffMs(-3, 1)).toBe(1000) // negative attempt → first step
    expect(nextBackoffMs(0, 2)).toBe(1000) // jitter clamped to [0, 1]
    expect(nextBackoffMs(0, -1)).toBe(500)
  })
})
