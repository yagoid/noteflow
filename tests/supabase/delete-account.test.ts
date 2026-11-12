import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  handleDeleteAccount,
  lemonCancelTargets,
  lemonSubscriptionStatus,
  isUserNotFound,
  USER_DATA_TABLES,
  LEMONSQUEEZY_API_BASE,
  type DeleteAccountEnv,
} from '../../supabase/functions/delete-account/logic'
import {
  isUnknownUserViolation,
  deletedUserEventAction,
  mapLemonEvent,
  parseVariantMap,
} from '../../supabase/functions/billing-webhook/logic'

const SUPABASE = 'https://proj.supabase.co'
const ENV: DeleteAccountEnv = {
  supabaseUrl: SUPABASE,
  anonKey: 'anon',
  serviceRoleKey: 'service',
  lemonApiKey: 'ls-key',
}
const USER_ID = '0b9d5d0e-4c55-4d5a-9a8e-6a3c0b7e1f00'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const lemonSub = (status: string) => jsonResponse(200, { data: { id: '1', attributes: { status } } })

type Call = { method: string; url: string; headers: Record<string, string> }

/**
 * Fake network: answers by URL/method and records every call. LS subscriptions
 * are a little state machine — DELETE flips them to 'cancelled' — so retries
 * can be exercised.
 */
function fakeNet(opts: {
  user?: () => Response
  rows?: () => Response
  lemon?: Record<string, string | null> // id → LS status; null = 404
  lemonGet?: (id: string) => Response | undefined
  lemonDelete?: (id: string) => Response | undefined
  tableDelete?: (table: string) => Response | undefined
  adminDelete?: () => Response
}) {
  const calls: Call[] = []
  const lemon = { ...(opts.lemon ?? {}) }
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, url, headers: (init?.headers ?? {}) as Record<string, string> })
    if (url === `${SUPABASE}/auth/v1/user`) return (opts.user ?? (() => jsonResponse(200, { id: USER_ID })))()
    if (url.startsWith(`${SUPABASE}/rest/v1/subscriptions`) && method === 'GET') {
      return (opts.rows ?? (() => jsonResponse(200, [])))()
    }
    if (url.startsWith(`${SUPABASE}/rest/v1/`) && method === 'DELETE') {
      const table = url.slice(`${SUPABASE}/rest/v1/`.length).split('?')[0]
      return opts.tableDelete?.(table) ?? new Response(null, { status: 204 })
    }
    if (url.startsWith(`${SUPABASE}/auth/v1/admin/users/`) && method === 'DELETE') {
      return (opts.adminDelete ?? (() => jsonResponse(200, {})))()
    }
    if (url.startsWith(`${LEMONSQUEEZY_API_BASE}/subscriptions/`)) {
      const id = url.slice(`${LEMONSQUEEZY_API_BASE}/subscriptions/`.length)
      if (method === 'GET') {
        const custom = opts.lemonGet?.(id)
        if (custom) return custom
        const status = lemon[id]
        return status === null || status === undefined ? jsonResponse(404, { errors: [] }) : lemonSub(status)
      }
      if (method === 'DELETE') {
        const custom = opts.lemonDelete?.(id)
        if (custom) return custom
        if (lemon[id] === null || lemon[id] === undefined) return jsonResponse(404, { errors: [] })
        lemon[id] = 'cancelled'
        return lemonSub('cancelled')
      }
    }
    throw new Error(`unexpected fetch ${method} ${url}`)
  })
  return { fetch: fn as unknown as typeof fetch, calls, lemon }
}

const post = (authorization: string | null = 'Bearer user-jwt') => ({ method: 'POST', authorization })
const deletes = (calls: Call[]) => calls.filter((c) => c.method === 'DELETE' && c.url.startsWith(SUPABASE))
const lemonDeletes = (calls: Call[]) =>
  calls.filter((c) => c.method === 'DELETE' && c.url.startsWith(LEMONSQUEEZY_API_BASE))

describe('handleDeleteAccount — happy paths', () => {
  it('deletes every user table, then the auth user, for an account without billing', async () => {
    const net = fakeNet({})
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch })
    expect(res).toEqual({ status: 200, body: { ok: true } })

    const dels = deletes(net.calls)
    expect(dels.map((c) => c.url)).toEqual([
      ...USER_DATA_TABLES.map((t) => `${SUPABASE}/rest/v1/${t}?user_id=eq.${USER_ID}`),
      `${SUPABASE}/auth/v1/admin/users/${USER_ID}`,
    ])
    // All with the service role — never the user's token.
    for (const c of dels) expect(c.headers.Authorization).toBe('Bearer service')
    expect(net.calls.some((c) => c.url.startsWith(LEMONSQUEEZY_API_BASE))).toBe(false)
  })

  it('cancels an active Lemon Squeezy subscription BEFORE deleting anything', async () => {
    const net = fakeNet({
      rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '123' }]),
      lemon: { '123': 'active' },
    })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.status).toBe(200)
    expect(net.lemon['123']).toBe('cancelled')

    const cancelIdx = net.calls.findIndex((c) => c.method === 'DELETE' && c.url.startsWith(LEMONSQUEEZY_API_BASE))
    const firstDataDelete = net.calls.findIndex((c) => c.method === 'DELETE' && c.url.startsWith(SUPABASE))
    expect(cancelIdx).toBeGreaterThan(-1)
    expect(cancelIdx).toBeLessThan(firstDataDelete)
    const cancel = net.calls[cancelIdx]
    expect(cancel.url).toBe(`${LEMONSQUEEZY_API_BASE}/subscriptions/123`)
    expect(cancel.headers.Authorization).toBe('Bearer ls-key')
    // The subscriptions query is scoped to the caller, with the service role.
    const rowsCall = net.calls.find((c) => c.url.includes('/rest/v1/subscriptions') && c.method === 'GET')!
    expect(rowsCall.url).toContain(`user_id=eq.${USER_ID}`)
    expect(rowsCall.headers.Authorization).toBe('Bearer service')
  })

  it('does not cancel again what LS already reports cancelled or expired', async () => {
    const net = fakeNet({
      rows: () =>
        jsonResponse(200, [
          { status: 'active', provider: 'lemonsqueezy', provider_ref: '1' },
          { status: 'expired', provider: 'lemonsqueezy', provider_ref: '2' },
        ]),
      lemon: { '1': 'cancelled', '2': 'expired' },
    })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch })
    expect(res.status).toBe(200)
    expect(lemonDeletes(net.calls)).toHaveLength(0)
  })

  it('cancels a refunded row that is expired here but still billing in LS', async () => {
    const net = fakeNet({
      rows: () => jsonResponse(200, [{ status: 'expired', provider: 'lemonsqueezy', provider_ref: '9' }]),
      lemon: { '9': 'active' },
    })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.status).toBe(200)
    expect(net.lemon['9']).toBe('cancelled')
  })

  it('cancels every billing status LS can still charge (trial, paused, past due, unpaid)', async () => {
    const lemon = { '1': 'on_trial', '2': 'paused', '3': 'past_due', '4': 'unpaid' }
    const net = fakeNet({
      rows: () =>
        jsonResponse(
          200,
          Object.keys(lemon).map((id) => ({ status: 'past_due', provider: 'lemonsqueezy', provider_ref: id }))
        ),
      lemon,
    })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.status).toBe(200)
    expect(lemonDeletes(net.calls)).toHaveLength(4)
  })

  it('ignores manual (operator comp) rows — nothing to cancel', async () => {
    const net = fakeNet({
      rows: () => jsonResponse(200, [{ status: 'active', provider: 'manual', provider_ref: null }]),
    })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch })
    expect(res.status).toBe(200)
    expect(net.calls.some((c) => c.url.startsWith(LEMONSQUEEZY_API_BASE))).toBe(false)
  })

  it('treats an auth user that is already gone (admin 404) as success', async () => {
    const net = fakeNet({ adminDelete: () => jsonResponse(404, { code: 'user_not_found' }) })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch })
    expect(res).toEqual({ status: 200, body: { ok: true } })
  })

  it('a retry whose token user no longer exists answers 200 without touching anything', async () => {
    const net = fakeNet({
      user: () => jsonResponse(403, { code: 'user_not_found', message: 'User from sub claim in JWT does not exist' }),
    })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res).toEqual({ status: 200, body: { ok: true } })
    expect(net.calls).toHaveLength(1)
  })

  it('is safe to retry after a failure halfway through', async () => {
    let failFiles = true
    const net = fakeNet({
      rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '7' }]),
      lemon: { '7': 'active' },
      tableDelete: (t) => (t === 'files' && failFiles ? jsonResponse(500, {}) : undefined),
    })
    const first = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(first.status).toBe(500)
    expect(first.body).toEqual(expect.objectContaining({ error: 'delete_failed' }))
    expect(net.lemon['7']).toBe('cancelled')

    failFiles = false
    net.calls.length = 0
    const second = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(second.status).toBe(200)
    // The retry sees the subscription cancelled and does not cancel it twice.
    expect(lemonDeletes(net.calls)).toHaveLength(0)
  })
})

describe('handleDeleteAccount — billing failures delete NOTHING', () => {
  const cases: Array<[string, Parameters<typeof fakeNet>[0]]> = [
    [
      'LS cancel answers non-2xx',
      {
        rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '1' }]),
        lemon: { '1': 'active' },
        lemonDelete: () => jsonResponse(422, { errors: [] }),
      },
    ],
    [
      'LS read answers non-2xx',
      {
        rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '1' }]),
        lemonGet: () => jsonResponse(500, {}),
      },
    ],
    [
      'LS is unreachable',
      {
        rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '1' }]),
        lemonGet: () => {
          throw new Error('ECONNRESET')
        },
      },
    ],
    [
      'LS returns no status',
      {
        rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '1' }]),
        lemonGet: () => jsonResponse(200, { data: {} }),
      },
    ],
    [
      'the cancel leaves the subscription billing',
      {
        rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '1' }]),
        lemon: { '1': 'active' },
        lemonDelete: () => lemonSub('active'),
      },
    ],
    [
      'a LIVE row LS does not know (404 — wrong-mode key?)',
      {
        rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '1' }]),
        lemon: { '1': null },
      },
    ],
    [
      'an EXPIRED row LS does not know (404 — a refunded sub may still bill under another key)',
      {
        rows: () => jsonResponse(200, [{ status: 'expired', provider: 'lemonsqueezy', provider_ref: '55' }]),
        lemon: { '55': null },
      },
    ],
    [
      'a live LS row without a usable id',
      { rows: () => jsonResponse(200, [{ status: 'active', provider: 'lemonsqueezy', provider_ref: '../x' }]) },
    ],
    [
      'the second of two subscriptions fails',
      {
        rows: () =>
          jsonResponse(200, [
            { status: 'active', provider: 'lemonsqueezy', provider_ref: '1' },
            { status: 'active', provider: 'lemonsqueezy', provider_ref: '2' },
          ]),
        lemon: { '1': 'active', '2': 'active' },
        lemonDelete: (id) => (id === '2' ? jsonResponse(500, {}) : undefined),
      },
    ],
  ]

  for (const [name, opts] of cases) {
    it(`502 billing_cancel_failed when ${name}`, async () => {
      const log = vi.fn()
      const net = fakeNet(opts)
      const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log })
      expect(res.status).toBe(502)
      expect(res.body).toEqual(expect.objectContaining({ error: 'billing_cancel_failed' }))
      expect(deletes(net.calls)).toHaveLength(0)
      expect(log).toHaveBeenCalled()
    })
  }
})

describe('handleDeleteAccount — request / auth / server errors', () => {
  it('rejects anything but POST', async () => {
    const net = fakeNet({})
    const res = await handleDeleteAccount({ method: 'GET', authorization: 'Bearer x' }, ENV, { fetch: net.fetch })
    expect(res.status).toBe(405)
    expect(net.calls).toHaveLength(0)
  })

  it('500 not_configured when a secret is missing (no network call)', async () => {
    for (const key of ['supabaseUrl', 'anonKey', 'serviceRoleKey', 'lemonApiKey'] as const) {
      const net = fakeNet({})
      const res = await handleDeleteAccount(post(), { ...ENV, [key]: undefined }, { fetch: net.fetch, log: () => {} })
      expect(res.status).toBe(500)
      expect(res.body).toEqual(expect.objectContaining({ error: 'not_configured' }))
      expect(net.calls).toHaveLength(0)
    }
  })

  it('401 missing_token without an Authorization header', async () => {
    const net = fakeNet({})
    for (const auth of [null, '', 'Bearer ', 'Bearer    ']) {
      const res = await handleDeleteAccount(post(auth), ENV, { fetch: net.fetch })
      expect(res.status).toBe(401)
      expect(res.body).toEqual(expect.objectContaining({ error: 'missing_token' }))
    }
    expect(net.calls).toHaveLength(0)
  })

  it('401 invalid_token when GoTrue rejects the session (nothing else is called)', async () => {
    const net = fakeNet({ user: () => jsonResponse(401, { code: 'bad_jwt' }) })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch })
    expect(res.status).toBe(401)
    expect(res.body).toEqual(expect.objectContaining({ error: 'invalid_token' }))
    expect(net.calls).toHaveLength(1)
  })

  it('401 invalid_token when GoTrue answers without a user id', async () => {
    const net = fakeNet({ user: () => jsonResponse(200, {}) })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch })
    expect(res.status).toBe(401)
    expect(net.calls).toHaveLength(1)
  })

  it('500 auth_unreachable (not 502) when GoTrue is down or throws', async () => {
    for (const user of [() => jsonResponse(503, {}), () => { throw new Error('ETIMEDOUT') }]) {
      const net = fakeNet({ user })
      const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
      expect(res.status).toBe(500)
      expect(res.body).toEqual(expect.objectContaining({ error: 'auth_unreachable' }))
      expect(net.calls).toHaveLength(1)
    }
  })

  it('500 query_failed when the subscriptions query fails (nothing deleted)', async () => {
    for (const rows of [() => jsonResponse(500, {}), () => jsonResponse(200, { not: 'an array' })]) {
      const net = fakeNet({ rows })
      const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
      expect(res.status).toBe(500)
      expect(res.body).toEqual(expect.objectContaining({ error: 'query_failed' }))
      expect(deletes(net.calls)).toHaveLength(0)
    }
  })

  it('500 delete_failed when a table delete fails — stops before the auth user', async () => {
    const net = fakeNet({ tableDelete: (t) => (t === 'usage_events' ? jsonResponse(500, {}) : undefined) })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.status).toBe(500)
    expect(res.body).toEqual(expect.objectContaining({ error: 'delete_failed' }))
    expect(net.calls.some((c) => c.url.includes('/auth/v1/admin/'))).toBe(false)
  })

  it('500 delete_failed when the admin delete fails', async () => {
    const net = fakeNet({ adminDelete: () => jsonResponse(500, {}) })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.status).toBe(500)
    expect(res.body).toEqual(expect.objectContaining({ error: 'delete_failed' }))
  })

  it('every error body carries a code and a message', async () => {
    const net = fakeNet({ user: () => jsonResponse(401, {}) })
    const res = await handleDeleteAccount(post(), ENV, { fetch: net.fetch })
    expect(res.body).toEqual({ error: 'invalid_token', message: expect.any(String) })
  })
})

describe('helpers', () => {
  it('lemonCancelTargets: every LS row whatever our status, deduplicated; not manual rows', () => {
    expect(
      lemonCancelTargets([
        { status: 'expired', provider: 'lemonsqueezy', provider_ref: '1' },
        { status: 'active', provider: 'lemonsqueezy', provider_ref: '1' },
        { status: 'expired', provider: 'lemonsqueezy', provider_ref: '2' },
        { status: 'active', provider: 'manual', provider_ref: '3' },
      ])
    ).toEqual({ targets: ['1', '2'], invalid: 0 })
  })

  it('lemonCancelTargets: counts only LIVE rows with an unusable id as invalid', () => {
    expect(
      lemonCancelTargets([
        { status: 'active', provider: 'lemonsqueezy', provider_ref: null },
        { status: 'expired', provider: 'lemonsqueezy', provider_ref: 'abc' },
      ])
    ).toEqual({ targets: [], invalid: 1 })
    expect(lemonCancelTargets(null)).toEqual({ targets: [], invalid: 0 })
  })

  it('lemonSubscriptionStatus / isUserNotFound', () => {
    expect(lemonSubscriptionStatus({ data: { attributes: { status: 'active' } } })).toBe('active')
    expect(lemonSubscriptionStatus({ data: {} })).toBe('')
    expect(lemonSubscriptionStatus(null)).toBe('')
    expect(isUserNotFound({ code: 'user_not_found' })).toBe(true)
    expect(isUserNotFound({ error_code: 'user_not_found' })).toBe(true)
    expect(isUserNotFound({ code: 'bad_jwt' })).toBe(false)
    expect(isUserNotFound(null)).toBe(false)
  })
})

describe('USER_DATA_TABLES mirrors the migrations', () => {
  // Every table that references auth.users is either deleted explicitly by the
  // function (ON DELETE CASCADE tables) or deliberately kept anonymised (ON
  // DELETE SET NULL — feedback). A new table referencing auth.users must be
  // classified here, or this test fails.
  const dir = join(__dirname, '../../supabase/migrations')
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
    .join('\n')

  function tablesReferencingUsers(action: 'cascade' | 'set null'): string[] {
    const out: string[] = []
    for (const m of sql.matchAll(/create table public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      const body = m[2]
      if (new RegExp(`references auth\\.users\\(id\\) on delete ${action}`).test(body)) out.push(m[1])
    }
    return out.sort()
  }

  it('deletes exactly the ON DELETE CASCADE user tables', () => {
    expect([...USER_DATA_TABLES].sort()).toEqual(tablesReferencingUsers('cascade'))
  })

  it('keeps only feedback (ON DELETE SET NULL), and nothing references auth.users otherwise', () => {
    expect(tablesReferencingUsers('set null')).toEqual(['feedback'])
    const allRefs = [...sql.matchAll(/references auth\.users\(id\)( on delete (cascade|set null))?/g)]
    expect(allRefs.every((m) => m[1])).toBe(true)
  })
})

describe('billing-webhook isUnknownUserViolation (events for deleted accounts)', () => {
  it('matches a PostgREST foreign-key violation only', () => {
    expect(isUnknownUserViolation(409, JSON.stringify({ code: '23503', message: 'fk' }))).toBe(true)
    expect(isUnknownUserViolation(409, JSON.stringify({ code: '23505' }))).toBe(false)
    expect(isUnknownUserViolation(500, JSON.stringify({ code: '23503' }))).toBe(false)
    expect(isUnknownUserViolation(409, 'not json')).toBe(false)
  })
})

describe('billing-webhook deletedUserEventAction (the raw LS status decides)', () => {
  it('ignores only events after which LS never charges again', () => {
    expect(deletedUserEventAction('cancelled')).toBe('ignore')
    expect(deletedUserEventAction('expired')).toBe('ignore')
    for (const s of ['active', 'on_trial', 'past_due', 'unpaid', 'paused', '']) {
      expect(deletedUserEventAction(s), s).toBe('alert')
    }
  })

  it('mapLemonEvent carries the raw status although cancelled maps to active', () => {
    const payload = {
      meta: { event_name: 'subscription_cancelled', custom_data: { user_id: USER_ID } },
      data: {
        type: 'subscriptions',
        id: '123',
        attributes: {
          status: 'cancelled',
          variant_id: 890123,
          updated_at: '2026-11-12T00:00:00Z',
          ends_at: '2026-12-12T00:00:00Z',
        },
      },
    }
    const res = mapLemonEvent(payload, parseVariantMap('890123:ai'), { allowTestMode: false })
    expect(res.kind).toBe('apply')
    if (res.kind !== 'apply') return
    expect(res.row.status).toBe('active')
    expect(res.lemonStatus).toBe('cancelled')
    expect(deletedUserEventAction(res.lemonStatus)).toBe('ignore')
  })
})
