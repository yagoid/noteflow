import { describe, it, expect } from 'vitest'
import {
  verifyWebhookSignature,
  parseVariantMap,
  mapLemonEvent,
  isUuid,
  type Product,
} from '../../supabase/functions/billing-webhook/logic'

// Node >= 20 ships crypto.subtle globally, so the Web Crypto code under test
// runs unpolyfilled — same primitives the Deno Edge Function uses.

/** Computes the hex HMAC-SHA256 Lemon Squeezy would put in X-Signature. */
async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('verifyWebhookSignature', () => {
  const body = '{"meta":{"event_name":"subscription_created"}}'
  const secret = 'test-signing-secret'

  it('accepts a valid signature', async () => {
    const signature = await sign(body, secret)
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(true)
  })

  it('accepts an uppercase hex signature', async () => {
    const signature = (await sign(body, secret)).toUpperCase()
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(true)
  })

  it('rejects a signature over a different body', async () => {
    const signature = await sign(body + ' ', secret)
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(false)
  })

  it('rejects a signature made with another secret', async () => {
    const signature = await sign(body, 'wrong-secret')
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(false)
  })

  it('rejects empty or non-hex signatures without throwing', async () => {
    await expect(verifyWebhookSignature(body, '', secret)).resolves.toBe(false)
    await expect(verifyWebhookSignature(body, 'not-hex!!', secret)).resolves.toBe(false)
    await expect(verifyWebhookSignature(body, 'abc', secret)).resolves.toBe(false) // odd length
  })

  it('rejects everything when the secret is empty', async () => {
    const signature = await sign(body, secret)
    await expect(verifyWebhookSignature(body, signature, '')).resolves.toBe(false)
  })
})

describe('parseVariantMap', () => {
  it('parses a full valid map', () => {
    const map = parseVariantMap('890123:ai,890124:cloud,890125:bundle')
    expect(map.get('890123')).toBe('ai')
    expect(map.get('890124')).toBe('cloud')
    expect(map.get('890125')).toBe('bundle')
    expect(map.size).toBe(3)
  })

  it('tolerates whitespace and empty segments', () => {
    const map = parseVariantMap(' 890123 : ai , 890124:cloud ,')
    expect(map.get('890123')).toBe('ai')
    expect(map.get('890124')).toBe('cloud')
    expect(map.size).toBe(2)
  })

  it('returns an empty map for an empty string', () => {
    expect(parseVariantMap('').size).toBe(0)
  })

  it('throws on an unknown product', () => {
    expect(() => parseVariantMap('890123:premium')).toThrow(/unknown product/i)
  })

  it('throws on corrupted entries', () => {
    expect(() => parseVariantMap('890123')).toThrow(/invalid variant map entry/i)
    expect(() => parseVariantMap('890123:')).toThrow(/invalid variant map entry/i)
    expect(() => parseVariantMap(':ai')).toThrow(/invalid variant map entry/i)
    expect(() => parseVariantMap('abc:ai')).toThrow(/invalid variant id/i)
  })
})

const USER_ID = '3f2b9c1e-8a4d-4f6b-9c2a-1d5e7f9a0b3c'

describe('isUuid', () => {
  it('accepts canonical UUIDs in any case', () => {
    expect(isUuid(USER_ID)).toBe(true)
    expect(isUuid(USER_ID.toUpperCase())).toBe(true)
  })

  it('rejects anything else', () => {
    for (const v of ['', 'user-uuid-1', `${USER_ID} `, `{${USER_ID}}`, USER_ID.replace(/-/g, ''), `${USER_ID}0`, 42, null, undefined, {}]) {
      expect(isUuid(v)).toBe(false)
    }
  })
})

describe('mapLemonEvent', () => {
  const variantMap = new Map<string, Product>([
    ['890123', 'ai'],
    ['890124', 'cloud'],
    ['890125', 'bundle'],
  ])

  interface PayloadOverrides {
    dataType?: string
    status?: string
    variantId?: number | string
    renewsAt?: string | null
    endsAt?: string | null
    userId?: unknown
    withCustomData?: boolean
    testMode?: boolean
  }

  function payload(over: PayloadOverrides = {}) {
    return {
      meta: {
        event_name: 'subscription_created',
        ...(over.testMode === undefined ? {} : { test_mode: over.testMode }),
        ...(over.withCustomData === false
          ? {}
          : { custom_data: { user_id: 'userId' in over ? over.userId : USER_ID } }),
      },
      data: {
        type: over.dataType ?? 'subscriptions',
        id: '424242',
        attributes: {
          status: over.status ?? 'active',
          variant_id: over.variantId ?? 890123,
          renews_at: over.renewsAt === undefined ? '2026-08-06T10:00:00Z' : over.renewsAt,
          ends_at: over.endsAt === undefined ? null : over.endsAt,
          updated_at: '2026-07-06T10:00:00Z',
        },
      },
    }
  }

  it('maps subscription_created (active) to an apply row', () => {
    expect(mapLemonEvent(payload(), variantMap)).toEqual({
      kind: 'apply',
      row: {
        userId: USER_ID,
        product: 'ai',
        status: 'active',
        renewsAt: '2026-08-06T10:00:00Z',
        providerRef: '424242',
        eventAt: '2026-07-06T10:00:00Z',
      },
    })
  })

  it('keeps cancelled subscriptions active until ends_at', () => {
    const result = mapLemonEvent(
      payload({ status: 'cancelled', endsAt: '2026-08-01T00:00:00Z' }),
      variantMap
    )
    expect(result.kind).toBe('apply')
    if (result.kind !== 'apply') return
    expect(result.row.status).toBe('active')
    expect(result.row.renewsAt).toBe('2026-08-01T00:00:00Z') // ends_at wins over renews_at
  })

  it('maps expired to expired', () => {
    const result = mapLemonEvent(payload({ status: 'expired' }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { status: 'expired' } })
  })

  it('maps past_due, unpaid and paused to past_due', () => {
    for (const status of ['past_due', 'unpaid', 'paused']) {
      const result = mapLemonEvent(payload({ status }), variantMap)
      expect(result).toMatchObject({ kind: 'apply', row: { status: 'past_due' } })
    }
  })

  it('maps on_trial to active', () => {
    const result = mapLemonEvent(payload({ status: 'on_trial' }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { status: 'active' } })
  })

  it('ignores unknown subscription statuses', () => {
    const result = mapLemonEvent(payload({ status: 'something_new' }), variantMap)
    expect(result).toMatchObject({ kind: 'ignore' })
  })

  it('accepts variant_id as a string too', () => {
    const result = mapLemonEvent(payload({ variantId: '890124' }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { product: 'cloud' } })
  })

  it('ignores unknown variants with a telling reason', () => {
    const result = mapLemonEvent(payload({ variantId: 111111 }), variantMap)
    expect(result).toEqual({ kind: 'ignore', reason: 'unknown variant: 111111' })
  })

  it('ignores non-subscription objects (invoices, orders)', () => {
    expect(mapLemonEvent(payload({ dataType: 'subscription-invoices' }), variantMap)).toMatchObject(
      { kind: 'ignore' }
    )
    expect(mapLemonEvent(payload({ dataType: 'orders' }), variantMap)).toMatchObject({
      kind: 'ignore',
    })
  })

  it('yields userId null when custom_data is absent (purchase outside the app)', () => {
    const result = mapLemonEvent(payload({ withCustomData: false }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { userId: null } })
  })

  it('never throws on malformed payloads — returns ignore', () => {
    const malformed: unknown[] = [
      null,
      undefined,
      'a string',
      42,
      [],
      {},
      { data: null },
      { data: 'subscriptions' },
      { data: { type: 'subscriptions' } },
      { data: { type: 'subscriptions', id: '1', attributes: {} } },
      { data: { type: 'subscriptions', attributes: { variant_id: 890123, status: 'active' } } },
    ]
    for (const p of malformed) {
      expect(mapLemonEvent(p, variantMap).kind).toBe('ignore')
    }
  })

  it('falls back to renews_at null when neither ends_at nor renews_at exist', () => {
    const result = mapLemonEvent(payload({ renewsAt: null, endsAt: null }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { renewsAt: null } })
  })

  describe('test mode', () => {
    it('ignores LS test-mode events by default', () => {
      expect(mapLemonEvent(payload({ testMode: true }), variantMap)).toEqual({
        kind: 'ignore',
        reason: 'test mode event',
      })
      expect(mapLemonEvent(payload({ testMode: true }), variantMap, { allowTestMode: false })).toEqual({
        kind: 'ignore',
        reason: 'test mode event',
      })
    })

    it('processes them only when explicitly allowed', () => {
      expect(mapLemonEvent(payload({ testMode: true }), variantMap, { allowTestMode: true })).toMatchObject({
        kind: 'apply',
        row: { userId: USER_ID },
      })
    })

    it('live events (test_mode false or absent) are unaffected', () => {
      expect(mapLemonEvent(payload({ testMode: false }), variantMap).kind).toBe('apply')
      expect(mapLemonEvent(payload(), variantMap).kind).toBe('apply')
      // Only a literal `true` counts as test mode.
      expect(mapLemonEvent(payload({ testMode: 'true' as unknown as boolean }), variantMap).kind).toBe('apply')
    })
  })

  describe('custom_data.user_id validation', () => {
    it('keeps a valid UUID (any case) without a warning', () => {
      const upper = USER_ID.toUpperCase()
      const result = mapLemonEvent(payload({ userId: upper }), variantMap)
      expect(result).toMatchObject({ kind: 'apply', row: { userId: upper } })
      expect(result).not.toHaveProperty('warning')
    })

    it('treats a non-UUID as absent (update-only path) and warns', () => {
      for (const bad of ['user-uuid-1', "'; drop table subscriptions; --", 12345, { id: USER_ID }]) {
        const result = mapLemonEvent(payload({ userId: bad }), variantMap)
        expect(result.kind).toBe('apply')
        if (result.kind !== 'apply') continue
        expect(result.row.userId).toBeNull()
        expect(result.warning).toMatch(/not a UUID/)
      }
    })

    it('does not warn when user_id is simply absent or empty', () => {
      for (const userId of ['', '   ', null]) {
        const result = mapLemonEvent(payload({ userId }), variantMap)
        expect(result).toMatchObject({ kind: 'apply', row: { userId: null } })
        expect(result).not.toHaveProperty('warning')
      }
    })
  })

  describe('subscription_payment_refunded', () => {
    function refund(attributes: Record<string, unknown>, over: { dataType?: string; testMode?: boolean } = {}) {
      return {
        meta: {
          event_name: 'subscription_payment_refunded',
          ...(over.testMode === undefined ? {} : { test_mode: over.testMode }),
        },
        data: { type: over.dataType ?? 'subscription-invoices', id: '9001', attributes },
      }
    }

    it('expires the subscription on a FULL refund', () => {
      expect(mapLemonEvent(refund({ subscription_id: 424242, status: 'refunded' }), variantMap)).toEqual({
        kind: 'expire',
        providerRef: '424242',
      })
      expect(mapLemonEvent(refund({ subscription_id: '424242', status: 'refunded' }), variantMap)).toEqual({
        kind: 'expire',
        providerRef: '424242',
      })
    })

    it('ignores a partial refund with a telling reason (operator decides)', () => {
      const result = mapLemonEvent(refund({ subscription_id: 424242, status: 'partial_refund' }), variantMap)
      expect(result.kind).toBe('ignore')
      if (result.kind === 'ignore') expect(result.reason).toMatch(/partial refund of subscription 424242/)
    })

    it('ignores refunds without a subscription_id', () => {
      for (const attributes of [{ status: 'refunded' }, { status: 'refunded', subscription_id: '' }, { status: 'refunded', subscription_id: null }]) {
        expect(mapLemonEvent(refund(attributes), variantMap)).toEqual({
          kind: 'ignore',
          reason: 'malformed refund payload: missing subscription_id',
        })
      }
    })

    it('ignores other invoice statuses and malformed shapes', () => {
      expect(mapLemonEvent(refund({ subscription_id: 1, status: 'paid' }), variantMap).kind).toBe('ignore')
      expect(mapLemonEvent(refund({ subscription_id: 1 }), variantMap).kind).toBe('ignore')
      expect(mapLemonEvent(refund({ subscription_id: 1, status: 'refunded' }, { dataType: 'orders' }), variantMap).kind).toBe('ignore')
      expect(
        mapLemonEvent({ meta: { event_name: 'subscription_payment_refunded' }, data: { type: 'subscription-invoices' } }, variantMap)
          .kind
      ).toBe('ignore')
    })

    it('test-mode refunds are ignored too', () => {
      expect(mapLemonEvent(refund({ subscription_id: 1, status: 'refunded' }, { testMode: true }), variantMap)).toEqual({
        kind: 'ignore',
        reason: 'test mode event',
      })
    })

    it('other subscription_payment_* invoice events stay informational', () => {
      const success = { ...refund({ subscription_id: 1, status: 'paid' }), meta: { event_name: 'subscription_payment_success' } }
      expect(mapLemonEvent(success, variantMap)).toEqual({
        kind: 'ignore',
        reason: 'unsupported data.type: subscription-invoices',
      })
    })
  })
})
