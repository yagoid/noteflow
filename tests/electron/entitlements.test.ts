import { describe, it, expect } from 'vitest'
import { canUpgradeToBundle, computeEntitlements, hasBillingSubscription, type SubscriptionRow } from '../../electron/entitlements'

function row(product: string, status: string): SubscriptionRow {
  return { product, status, renews_at: null }
}

describe('computeEntitlements', () => {
  it('grants nothing for no rows', () => {
    expect(computeEntitlements([])).toEqual({ ai: false, cloud: false })
    expect(computeEntitlements(null)).toEqual({ ai: false, cloud: false })
    expect(computeEntitlements(undefined)).toEqual({ ai: false, cloud: false })
  })

  it('grants a single active product without the other', () => {
    expect(computeEntitlements([row('ai', 'active')])).toEqual({ ai: true, cloud: false })
    expect(computeEntitlements([row('cloud', 'active')])).toEqual({ ai: false, cloud: true })
  })

  it('an active bundle covers both products', () => {
    expect(computeEntitlements([row('bundle', 'active')])).toEqual({ ai: true, cloud: true })
  })

  it('non-active statuses grant nothing', () => {
    expect(computeEntitlements([row('ai', 'past_due')])).toEqual({ ai: false, cloud: false })
    expect(computeEntitlements([row('cloud', 'canceled')])).toEqual({ ai: false, cloud: false })
    expect(computeEntitlements([row('bundle', 'expired')])).toEqual({ ai: false, cloud: false })
  })

  it('an expired row does not mask an active one for the same product', () => {
    expect(computeEntitlements([row('ai', 'expired'), row('ai', 'active')])).toEqual({
      ai: true,
      cloud: false,
    })
  })

  it('combines independent product rows', () => {
    expect(computeEntitlements([row('ai', 'active'), row('cloud', 'active')])).toEqual({
      ai: true,
      cloud: true,
    })
  })

  it('ignores unknown products and malformed rows', () => {
    expect(
      computeEntitlements([
        row('something-else', 'active'),
        null as unknown as SubscriptionRow,
        row('ai', 'active'),
      ])
    ).toEqual({ ai: true, cloud: false })
  })
})

describe('hasBillingSubscription — gates "Manage subscription"', () => {
  const billed = (status: string, provider: string | null | undefined): SubscriptionRow => ({
    product: 'ai',
    status,
    renews_at: null,
    provider,
  })

  it('true for a Lemon Squeezy row in any status', () => {
    for (const status of ['active', 'past_due', 'canceled', 'expired']) {
      expect(hasBillingSubscription([billed(status, 'lemonsqueezy')]), status).toBe(true)
    }
  })

  it('false for comps (provider manual), unknown providers and no rows', () => {
    expect(hasBillingSubscription([billed('active', 'manual')])).toBe(false)
    expect(hasBillingSubscription([billed('active', null), billed('active', undefined)])).toBe(false)
    expect(hasBillingSubscription([])).toBe(false)
    expect(hasBillingSubscription(null)).toBe(false)
    expect(hasBillingSubscription([null as unknown as SubscriptionRow])).toBe(false)
  })

  it('a comp next to a Lemon Squeezy row still counts the latter', () => {
    expect(hasBillingSubscription([billed('active', 'manual'), billed('expired', 'lemonsqueezy')])).toBe(true)
  })
})

describe('canUpgradeToBundle — Bundle offered as a plan change', () => {
  const sub = (product: string, status = 'active', provider: string | null = 'lemonsqueezy'): SubscriptionRow => ({
    product,
    status,
    renews_at: null,
    provider,
  })

  it('true for exactly one active Lemon Squeezy AI or Cloud subscription', () => {
    expect(canUpgradeToBundle([sub('ai')])).toBe(true)
    expect(canUpgradeToBundle([sub('cloud')])).toBe(true)
    // Old, lapsed rows next to it do not matter.
    expect(canUpgradeToBundle([sub('cloud'), sub('ai', 'expired'), sub('bundle', 'expired')])).toBe(true)
  })

  it('false with nothing entitled, or both already (bundle, or two separate subscriptions)', () => {
    expect(canUpgradeToBundle([])).toBe(false)
    expect(canUpgradeToBundle(null)).toBe(false)
    expect(canUpgradeToBundle([sub('ai', 'past_due')])).toBe(false)
    expect(canUpgradeToBundle([sub('bundle')])).toBe(false)
    expect(canUpgradeToBundle([sub('ai'), sub('cloud')])).toBe(false)
    // A comp for the other product also means "both".
    expect(canUpgradeToBundle([sub('ai'), sub('cloud', 'active', 'manual')])).toBe(false)
  })

  it('false when the single entitlement is a comp (nothing to change in Lemon Squeezy)', () => {
    expect(canUpgradeToBundle([sub('ai', 'active', 'manual')])).toBe(false)
  })

  it('false with two active Lemon Squeezy subscriptions of the same product (ambiguous)', () => {
    expect(canUpgradeToBundle([sub('ai'), sub('ai')])).toBe(false)
  })
})
