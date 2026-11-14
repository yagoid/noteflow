import { describe, it, expect, vi } from 'vitest'
import {
  handleChangePlan,
  parseVariantMap,
  parseBundleUpgradeMap,
  pickUpgradeSubscription,
  readLemonSubscription,
  buildPlanChangeBody,
  LEMONSQUEEZY_API_BASE,
  type ChangePlanEnv,
} from '../../supabase/functions/billing-change-plan/logic'
import { parseVariantMap as webhookParseVariantMap } from '../../supabase/functions/billing-webhook/logic'

// Live variant IDs (monetization.md § "Billing en live mode"):
// ai 2268405 monthly / 2268404 yearly · cloud 2268416 / 2268417 · bundle 2268409 / 2268410
const VARIANT_MAP = '2268405:ai,2268404:ai,2268416:cloud,2268417:cloud,2268409:bundle,2268410:bundle'
const UPGRADE_MAP = '2268405:2268409,2268404:2268410,2268416:2268409,2268417:2268410'

const SUPABASE = 'https://proj.supabase.co'
const ENV: ChangePlanEnv = {
  supabaseUrl: SUPABASE,
  anonKey: 'anon',
  serviceRoleKey: 'service',
  lemonApiKey: 'ls-key',
  variantMap: VARIANT_MAP,
  bundleUpgradeMap: UPGRADE_MAP,
}
const USER_ID = '0b9d5d0e-4c55-4d5a-9a8e-6a3c0b7e1f00'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const lsSubscription = (variantId: number | string, status = 'active', cancelled = false) => ({
  data: { type: 'subscriptions', id: '12345', attributes: { variant_id: variantId, status, cancelled } },
})

const AI_MONTHLY_ROW = { product: 'ai', status: 'active', provider: 'lemonsqueezy', provider_ref: '12345' }

/** Fake network: answers by URL (+ method for LS) and records every call. */
function fakeFetch(routes: {
  user?: () => Response
  rows?: () => Response
  lemonGet?: () => Response
  lemonPatch?: (body: unknown) => Response
}) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: unknown }> = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ url, method, headers: (init?.headers ?? {}) as Record<string, string>, body })
    if (url === `${SUPABASE}/auth/v1/user`) return (routes.user ?? (() => jsonResponse(200, { id: USER_ID })))()
    if (url.startsWith(`${SUPABASE}/rest/v1/subscriptions`)) {
      return (routes.rows ?? (() => jsonResponse(200, [AI_MONTHLY_ROW])))()
    }
    if (url.startsWith(LEMONSQUEEZY_API_BASE) && method === 'GET') {
      return (routes.lemonGet ?? (() => jsonResponse(200, lsSubscription(2268405))))()
    }
    if (url.startsWith(LEMONSQUEEZY_API_BASE) && method === 'PATCH') {
      return (routes.lemonPatch ?? ((b) => jsonResponse(200, lsSubscription((b as { data: { attributes: { variant_id: number } } }).data.attributes.variant_id))))(body)
    }
    throw new Error(`unexpected fetch ${method} ${url}`)
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const post = (body = '{"plan":"bundle"}', authorization: string | null = 'Bearer user-jwt') => ({
  method: 'POST',
  authorization,
  body,
})
const patches = (calls: Array<{ method: string }>) => calls.filter((c) => c.method === 'PATCH')

describe('handleChangePlan — happy path', () => {
  it('moves a monthly AI subscription to the MONTHLY bundle variant, prorated and invoiced now', async () => {
    const net = fakeFetch({})
    const res = await handleChangePlan(post(), ENV, { fetch: net.fetch })
    expect(res).toEqual({ status: 200, body: { ok: true, product: 'bundle', changed: true } })

    const rowsCall = net.calls.find((c) => c.url.includes('/rest/v1/subscriptions'))!
    expect(rowsCall.url).toContain(`user_id=eq.${USER_ID}`)
    expect(rowsCall.headers.Authorization).toBe('Bearer service')

    const [patch] = patches(net.calls)
    expect(patch.url).toBe(`${LEMONSQUEEZY_API_BASE}/subscriptions/12345`)
    expect(patch.headers.Authorization).toBe('Bearer ls-key')
    expect(patch.headers['Content-Type']).toBe('application/vnd.api+json')
    expect(patch.body).toEqual({
      data: { type: 'subscriptions', id: '12345', attributes: { variant_id: 2268409, invoice_immediately: true } },
    })
  })

  it('keeps the billing interval: yearly Cloud → yearly Bundle', async () => {
    const net = fakeFetch({
      rows: () => jsonResponse(200, [{ ...AI_MONTHLY_ROW, product: 'cloud' }]),
      lemonGet: () => jsonResponse(200, lsSubscription('2268417')),
    })
    const res = await handleChangePlan(post(), ENV, { fetch: net.fetch })
    expect(res.status).toBe(200)
    expect(patches(net.calls)[0].body).toMatchObject({ data: { attributes: { variant_id: 2268410 } } })
  })

  it('idempotent: LS already on a bundle variant → 200 changed:false, no second PATCH', async () => {
    const net = fakeFetch({ lemonGet: () => jsonResponse(200, lsSubscription(2268409)) })
    const res = await handleChangePlan(post(), ENV, { fetch: net.fetch })
    expect(res).toEqual({ status: 200, body: { ok: true, product: 'bundle', changed: false } })
    expect(patches(net.calls)).toHaveLength(0)
  })
})

describe('handleChangePlan — refusals (never PATCH)', () => {
  it('405 for anything but POST, 400 for another target plan', async () => {
    const net = fakeFetch({})
    expect((await handleChangePlan({ method: 'GET', authorization: 'Bearer x', body: '' }, ENV, { fetch: net.fetch })).status).toBe(405)
    for (const body of ['', '{}', '{"plan":"ai"}', 'not json']) {
      const res = await handleChangePlan(post(body), ENV, { fetch: net.fetch })
      expect(res.status, body).toBe(400)
      expect(res.body).toEqual({ error: expect.objectContaining({ code: 'unsupported_plan' }) })
    }
    expect(net.calls).toHaveLength(0)
  })

  it('500 not_configured when a secret is missing or the maps are inconsistent', async () => {
    const net = fakeFetch({})
    const log = vi.fn()
    for (const env of [
      { ...ENV, lemonApiKey: undefined },
      { ...ENV, bundleUpgradeMap: undefined },
      { ...ENV, variantMap: undefined },
      { ...ENV, bundleUpgradeMap: '2268405:2268416' }, // target is a cloud variant
      { ...ENV, bundleUpgradeMap: '2268409:2268410' }, // source is a bundle variant
      { ...ENV, bundleUpgradeMap: '2268405-2268409' },
    ]) {
      const res = await handleChangePlan(post(), env, { fetch: net.fetch, log })
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: expect.objectContaining({ code: 'not_configured' }) })
    }
    expect(net.calls).toHaveLength(0)
    expect(log).toHaveBeenCalled()
  })

  it('401 without a token, or when GoTrue rejects it', async () => {
    const net = fakeFetch({ user: () => jsonResponse(401, {}) })
    expect((await handleChangePlan(post(undefined, null), ENV, { fetch: net.fetch })).status).toBe(401)
    const res = await handleChangePlan(post(), ENV, { fetch: net.fetch })
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'invalid_token' }) })
    expect(net.calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false)
  })

  it('409 already_entitled / 404 no_subscription / 409 multiple_subscriptions from the rows', async () => {
    const cases: Array<[unknown[], number, string]> = [
      [[{ ...AI_MONTHLY_ROW, product: 'bundle' }], 409, 'already_entitled'],
      [[AI_MONTHLY_ROW, { ...AI_MONTHLY_ROW, product: 'cloud', provider_ref: '777' }], 409, 'already_entitled'],
      [[AI_MONTHLY_ROW, { product: 'cloud', status: 'active', provider: 'manual', provider_ref: 'comp' }], 409, 'already_entitled'],
      [[], 404, 'no_subscription'],
      [[{ product: 'ai', status: 'active', provider: 'manual', provider_ref: 'comp' }], 404, 'no_subscription'],
      [[{ ...AI_MONTHLY_ROW, status: 'past_due' }], 404, 'no_subscription'],
      [[AI_MONTHLY_ROW, { ...AI_MONTHLY_ROW, provider_ref: '999' }], 409, 'multiple_subscriptions'],
    ]
    for (const [rows, status, code] of cases) {
      const net = fakeFetch({ rows: () => jsonResponse(200, rows) })
      const res = await handleChangePlan(post(), ENV, { fetch: net.fetch, log: () => {} })
      expect(res.status, code).toBe(status)
      expect(res.body).toEqual({ error: expect.objectContaining({ code }) })
      expect(net.calls.some((c) => c.url.startsWith(LEMONSQUEEZY_API_BASE))).toBe(false)
    }
  })

  it('409 subscription_not_active when LS reports it cancelled, past due, paused or on trial', async () => {
    for (const [status, cancelled] of [
      ['cancelled', true],
      ['active', true],
      ['past_due', false],
      ['paused', false],
      ['on_trial', false],
    ] as const) {
      const net = fakeFetch({ lemonGet: () => jsonResponse(200, lsSubscription(2268405, status, cancelled)) })
      const res = await handleChangePlan(post(), ENV, { fetch: net.fetch })
      expect(res.status, status).toBe(409)
      expect(res.body).toEqual({ error: expect.objectContaining({ code: 'subscription_not_active' }) })
      expect(patches(net.calls)).toHaveLength(0)
    }
  })

  it('500 not_configured when the current LS variant has no bundle mapping (e.g. a test-mode variant)', async () => {
    const log = vi.fn()
    const net = fakeFetch({ lemonGet: () => jsonResponse(200, lsSubscription(1892927)) })
    const res = await handleChangePlan(post(), ENV, { fetch: net.fetch, log })
    expect(res.status).toBe(500)
    expect(patches(net.calls)).toHaveLength(0)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('LEMONSQUEEZY_BUNDLE_UPGRADE_MAP'))
  })

  it('502 when LS cannot load the subscription, or the request throws', async () => {
    let net = fakeFetch({ lemonGet: () => jsonResponse(404, { errors: [] }) })
    let res = await handleChangePlan(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'provider_error' }) })
    net = fakeFetch({ lemonGet: () => { throw new Error('ECONNRESET') } })
    res = await handleChangePlan(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'provider_unreachable' }) })
    expect(patches(net.calls)).toHaveLength(0)
  })
})

describe('handleChangePlan — LS failures on the change itself', () => {
  it('502 provider_error when LS refuses the PATCH (logged with its answer)', async () => {
    const log = vi.fn()
    const net = fakeFetch({ lemonPatch: () => jsonResponse(422, { errors: [{ detail: 'nope' }] }) })
    const res = await handleChangePlan(post(), ENV, { fetch: net.fetch, log })
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'provider_error' }) })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('nope'))
  })

  it('502 provider_unreachable when the PATCH throws (a retry is safe: the GET then sees the bundle)', async () => {
    const net = fakeFetch({ lemonPatch: () => { throw new Error('timeout') } })
    const res = await handleChangePlan(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'provider_unreachable' }) })
  })

  it('502 when LS answers 200 but reports another variant', async () => {
    const net = fakeFetch({ lemonPatch: () => jsonResponse(200, lsSubscription(2268405)) })
    const res = await handleChangePlan(post(), ENV, { fetch: net.fetch, log: () => {} })
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'provider_error' }) })
  })
})

describe('config parsing', () => {
  it('parseVariantMap mirrors billing-webhook (same input → same map, same failures)', () => {
    expect([...parseVariantMap(VARIANT_MAP)]).toEqual([...webhookParseVariantMap(VARIANT_MAP)])
    expect([...parseVariantMap(' 1:ai, ,2:bundle,')]).toEqual([...webhookParseVariantMap(' 1:ai, ,2:bundle,')])
    for (const bad of ['1:pro', 'x:ai', '1:', ':ai', '1']) {
      expect(() => parseVariantMap(bad), bad).toThrow()
      expect(() => webhookParseVariantMap(bad), bad).toThrow()
    }
  })

  it('parseBundleUpgradeMap only maps ai/cloud variants to bundle variants', () => {
    const variants = parseVariantMap(VARIANT_MAP)
    expect(parseBundleUpgradeMap(UPGRADE_MAP, variants)).toEqual(
      new Map([
        ['2268405', '2268409'],
        ['2268404', '2268410'],
        ['2268416', '2268409'],
        ['2268417', '2268410'],
      ])
    )
    expect(() => parseBundleUpgradeMap('999:2268409', variants)).toThrow() // unknown source
    expect(() => parseBundleUpgradeMap('2268405:999', variants)).toThrow() // unknown target
  })
})

describe('pure helpers', () => {
  it('pickUpgradeSubscription skips rows without a numeric LS id', () => {
    expect(pickUpgradeSubscription([{ ...AI_MONTHLY_ROW, provider_ref: '../orders/1' }])).toEqual({ kind: 'no_subscription' })
    expect(pickUpgradeSubscription([AI_MONTHLY_ROW, { ...AI_MONTHLY_ROW, status: 'expired', provider_ref: '1' }])).toEqual({
      kind: 'ok',
      subscriptionId: '12345',
      product: 'ai',
    })
    expect(pickUpgradeSubscription(null)).toEqual({ kind: 'no_subscription' })
  })

  it('readLemonSubscription reads numeric or string variant ids and rejects the rest', () => {
    expect(readLemonSubscription(lsSubscription(5))).toEqual({ variantId: '5', status: 'active', cancelled: false })
    expect(readLemonSubscription(lsSubscription('6', 'cancelled', true))).toEqual({ variantId: '6', status: 'cancelled', cancelled: true })
    expect(readLemonSubscription(lsSubscription('6a'))).toBeNull()
    expect(readLemonSubscription({ data: {} })).toBeNull()
    expect(readLemonSubscription(null)).toBeNull()
  })

  it('buildPlanChangeBody never disables prorations', () => {
    const body = buildPlanChangeBody('1', '2') as { data: { attributes: Record<string, unknown> } }
    expect(body.data.attributes).toEqual({ variant_id: 2, invoice_immediately: true })
    expect('disable_prorations' in body.data.attributes).toBe(false)
  })
})
