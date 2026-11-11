import { describe, it, expect, vi } from 'vitest'
import {
  handleBillingPortal,
  pickPortalSubscription,
  validatePortalUrl,
  extractCustomerPortalUrl,
  isLemonSubscriptionId,
  LEMONSQUEEZY_API_BASE,
  type BillingPortalEnv,
} from '../../supabase/functions/billing-portal/logic'

const SUPABASE = 'https://proj.supabase.co'
const ENV: BillingPortalEnv = {
  supabaseUrl: SUPABASE,
  anonKey: 'anon',
  serviceRoleKey: 'service',
  lemonApiKey: 'ls-key',
}
const USER_ID = '0b9d5d0e-4c55-4d5a-9a8e-6a3c0b7e1f00'
const PORTAL = 'https://noteflow-app.lemonsqueezy.com/billing?expires=1&signature=abc'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Fake network: answers by URL prefix and records every call. */
function fakeFetch(routes: {
  user?: () => Response
  rows?: () => Response
  lemon?: () => Response
}) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    if (url === `${SUPABASE}/auth/v1/user`) return (routes.user ?? (() => jsonResponse(200, { id: USER_ID })))()
    if (url.startsWith(`${SUPABASE}/rest/v1/subscriptions`)) {
      return (routes.rows ?? (() => jsonResponse(200, [{ status: 'active', provider_ref: '12345' }])))()
    }
    if (url.startsWith(LEMONSQUEEZY_API_BASE)) {
      return (routes.lemon ?? (() => jsonResponse(200, { data: { attributes: { urls: { customer_portal: PORTAL } } } })))()
    }
    throw new Error(`unexpected fetch ${url}`)
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const post = (authorization: string | null = 'Bearer user-jwt') => ({ method: 'POST', authorization })

describe('handleBillingPortal — request flow', () => {
  it('returns a fresh portal URL for the caller', async () => {
    const net = fakeFetch({})
    const res = await handleBillingPortal(post(), ENV, { fetch: net.fetch })
    expect(res).toEqual({ status: 200, body: { url: PORTAL } })
    // The subscriptions query is scoped to the caller AND to Lemon Squeezy rows.
    const rowsCall = net.calls.find((c) => c.url.includes('/rest/v1/subscriptions'))!
    expect(rowsCall.url).toContain(`user_id=eq.${USER_ID}`)
    expect(rowsCall.url).toContain('provider=eq.lemonsqueezy')
    expect(rowsCall.headers.Authorization).toBe('Bearer service')
    // LS is asked with the operator key, for the picked subscription.
    const lemonCall = net.calls.find((c) => c.url.startsWith(LEMONSQUEEZY_API_BASE))!
    expect(lemonCall.url).toBe(`${LEMONSQUEEZY_API_BASE}/subscriptions/12345`)
    expect(lemonCall.headers.Authorization).toBe('Bearer ls-key')
  })

  it('rejects anything but POST', async () => {
    const net = fakeFetch({})
    const res = await handleBillingPortal({ method: 'GET', authorization: 'Bearer x' }, ENV, { fetch: net.fetch })
    expect(res.status).toBe(405)
    expect(net.calls).toHaveLength(0)
  })

  it('500 not_configured when a secret is missing (no network call)', async () => {
    const net = fakeFetch({})
    const res = await handleBillingPortal(post(), { ...ENV, lemonApiKey: undefined }, { fetch: net.fetch, log: () => {} })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'not_configured' }) })
    expect(net.calls).toHaveLength(0)
  })

  it('401 missing_token without an Authorization header', async () => {
    const net = fakeFetch({})
    for (const auth of [null, '', 'Bearer ', 'Bearer    ']) {
      const res = await handleBillingPortal(post(auth), ENV, { fetch: net.fetch })
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.objectContaining({ code: 'missing_token' }) })
    }
    expect(net.calls).toHaveLength(0)
  })

  it('401 invalid_token when GoTrue rejects the session (never queries subscriptions)', async () => {
    const net = fakeFetch({ user: () => jsonResponse(401, { msg: 'bad jwt' }) })
    const res = await handleBillingPortal(post(), ENV, { fetch: net.fetch })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'invalid_token' }) })
    expect(net.calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false)
  })

  it('401 invalid_token when GoTrue answers without a user id', async () => {
    const net = fakeFetch({ user: () => jsonResponse(200, {}) })
    const res = await handleBillingPortal(post(), ENV, { fetch: net.fetch })
    expect(res.status).toBe(401)
  })

  it('404 no_subscription when the account has no Lemon Squeezy rows', async () => {
    const net = fakeFetch({ rows: () => jsonResponse(200, []) })
    const res = await handleBillingPortal(post(), ENV, { fetch: net.fetch })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'no_subscription' }) })
    expect(net.calls.some((c) => c.url.startsWith(LEMONSQUEEZY_API_BASE))).toBe(false)
  })

  it('500 query_failed when PostgREST fails', async () => {
    const net = fakeFetch({ rows: () => jsonResponse(500, { message: 'boom' }) })
    const res = await handleBillingPortal(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'query_failed' }) })
  })

  it('502 provider_error when Lemon Squeezy answers non-2xx', async () => {
    const log = vi.fn()
    const net = fakeFetch({ lemon: () => jsonResponse(404, { errors: [{ detail: 'not found' }] }) })
    const res = await handleBillingPortal(post(), ENV, { fetch: net.fetch, log })
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'provider_error' }) })
    expect(log).toHaveBeenCalled()
  })

  it('502 provider_unreachable when the Lemon Squeezy request throws', async () => {
    const net = fakeFetch({ lemon: () => { throw new Error('ECONNRESET') } })
    const res = await handleBillingPortal(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'provider_unreachable' }) })
  })

  it('502 invalid_portal_url when LS returns no URL or a foreign one', async () => {
    for (const portal of [undefined, '', 'http://noteflow-app.lemonsqueezy.com/billing', 'https://evil.example/billing']) {
      const net = fakeFetch({
        lemon: () => jsonResponse(200, { data: { attributes: { urls: { customer_portal: portal } } } }),
      })
      const res = await handleBillingPortal(post(), ENV, { fetch: net.fetch, log: () => {} })
      expect(res.status).toBe(502)
      expect(res.body).toEqual({ error: expect.objectContaining({ code: 'invalid_portal_url' }) })
    }
  })
})

describe('pickPortalSubscription', () => {
  it('prefers the best status, then the latest renewal, then the newest row', () => {
    expect(
      pickPortalSubscription([
        { status: 'expired', provider_ref: '1', renews_at: '2027-01-01T00:00:00Z' },
        { status: 'active', provider_ref: '2', renews_at: '2026-12-01T00:00:00Z' },
        { status: 'past_due', provider_ref: '3', renews_at: '2027-06-01T00:00:00Z' },
      ])
    ).toBe('2')
    expect(
      pickPortalSubscription([
        { status: 'active', provider_ref: '10', renews_at: '2026-12-01T00:00:00Z' },
        { status: 'active', provider_ref: '11', renews_at: '2027-12-01T00:00:00Z' },
      ])
    ).toBe('11')
    expect(
      pickPortalSubscription([
        { status: 'expired', provider_ref: '20', renews_at: null, created_at: '2026-01-01T00:00:00Z' },
        { status: 'expired', provider_ref: '21', renews_at: null, created_at: '2026-05-01T00:00:00Z' },
      ])
    ).toBe('21')
  })

  it('a past-due subscription still beats an expired one', () => {
    expect(
      pickPortalSubscription([
        { status: 'expired', provider_ref: '1' },
        { status: 'past_due', provider_ref: '2' },
      ])
    ).toBe('2')
  })

  it('skips rows without a numeric Lemon Squeezy id', () => {
    expect(
      pickPortalSubscription([
        { status: 'active', provider_ref: '../orders/1' },
        { status: 'active', provider_ref: null },
        { status: 'expired', provider_ref: '77' },
      ])
    ).toBe('77')
    expect(pickPortalSubscription([{ status: 'active', provider_ref: 'abc' }])).toBeNull()
  })

  it('null for no rows or a malformed answer', () => {
    expect(pickPortalSubscription([])).toBeNull()
    expect(pickPortalSubscription(null)).toBeNull()
    expect(pickPortalSubscription({ status: 'active' })).toBeNull()
  })
})

describe('validatePortalUrl / extractCustomerPortalUrl', () => {
  it('accepts https URLs on lemonsqueezy.com and its subdomains', () => {
    expect(validatePortalUrl(PORTAL)).toBe(PORTAL)
    expect(validatePortalUrl('https://lemonsqueezy.com/billing')).toBe('https://lemonsqueezy.com/billing')
  })

  it('rejects other schemes, hosts, look-alikes, credentials and ports', () => {
    for (const bad of [
      'http://noteflow-app.lemonsqueezy.com/billing',
      'javascript:alert(1)',
      'https://lemonsqueezy.com.evil.example/billing',
      'https://evillemonsqueezy.com/billing',
      'https://user:pw@noteflow-app.lemonsqueezy.com/billing',
      'https://noteflow-app.lemonsqueezy.com:8443/billing',
      'not a url',
      '',
      42,
      null,
    ]) {
      expect(validatePortalUrl(bad), String(bad)).toBeNull()
    }
  })

  it('reads data.attributes.urls.customer_portal', () => {
    expect(extractCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: PORTAL } } } })).toBe(PORTAL)
    expect(extractCustomerPortalUrl({ data: { attributes: {} } })).toBeNull()
    expect(extractCustomerPortalUrl(null)).toBeNull()
  })

  it('isLemonSubscriptionId accepts digits only', () => {
    expect(isLemonSubscriptionId('123')).toBe(true)
    expect(isLemonSubscriptionId('12a')).toBe(false)
    expect(isLemonSubscriptionId(123)).toBe(false)
  })
})
