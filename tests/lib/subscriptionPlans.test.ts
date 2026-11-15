import { describe, it, expect } from 'vitest'
import {
  activePlan,
  bundleSavings,
  bundleUpgradeDifference,
  formatPrice,
  hasKnownEntitlement,
  isBundleUpgradeOffered,
  isPlanOffered,
  isPlanUnknown,
  productOffer,
  yearlySavingsPercent,
  type PlanAccountView,
} from '../../src/lib/subscriptionPlans'

function account(patch: Partial<PlanAccountView> = {}): PlanAccountView {
  return { signedIn: true, entitlements: { ai: false, cloud: false }, entitlementsKnown: true, ...patch }
}

describe('isPlanUnknown', () => {
  it('is true only for a signed-in session whose plan was never fetched', () => {
    expect(isPlanUnknown(account({ entitlementsKnown: false }))).toBe(true)
    expect(isPlanUnknown(account())).toBe(false)
    expect(isPlanUnknown(account({ signedIn: false, entitlementsKnown: false }))).toBe(false)
  })
})

describe('isPlanOffered — never offer a plan on an unknown', () => {
  it('signed out: every card is offered (it routes to sign-in)', () => {
    const out = account({ signedIn: false, entitlementsKnown: false })
    expect(isPlanOffered(out, 'ai')).toBe(true)
    expect(isPlanOffered(out, 'cloud')).toBe(true)
    expect(isPlanOffered(out, 'bundle')).toBe(true)
  })

  it('signed in + unknown: nothing is offered (double-billing risk)', () => {
    const unknown = account({ entitlementsKnown: false })
    expect(isPlanOffered(unknown, 'ai')).toBe(false)
    expect(isPlanOffered(unknown, 'cloud')).toBe(false)
    expect(isPlanOffered(unknown, 'bundle')).toBe(false)
  })

  it('signed in + known: only the missing plans, the Bundle only when both are missing', () => {
    expect(isPlanOffered(account(), 'bundle')).toBe(true)
    expect(isPlanOffered(account(), 'ai')).toBe(true)
    expect(isPlanOffered(account(), 'cloud')).toBe(true)
    // A single plan that can't be switched to the Bundle (comp, ambiguous rows…):
    // the other product is still sold on its own; a Bundle checkout never is.
    const aiOnly = account({ entitlements: { ai: true, cloud: false } })
    expect(isPlanOffered(aiOnly, 'ai')).toBe(false)
    expect(isPlanOffered(aiOnly, 'cloud')).toBe(true)
    expect(isPlanOffered(aiOnly, 'bundle')).toBe(false)
  })

  it('a single upgradable plan: the other product is never sold on its own (the Bundle upgrade is the only offer)', () => {
    const cloudOnly = account({ entitlements: { ai: false, cloud: true }, bundleUpgradeAvailable: true })
    expect(isPlanOffered(cloudOnly, 'ai')).toBe(false)
    expect(isPlanOffered(cloudOnly, 'cloud')).toBe(false)
    expect(isPlanOffered(cloudOnly, 'bundle')).toBe(false)
    expect(isBundleUpgradeOffered(cloudOnly)).toBe(true)
    const aiOnly = account({ entitlements: { ai: true, cloud: false }, bundleUpgradeAvailable: true })
    expect(isPlanOffered(aiOnly, 'cloud')).toBe(false)
    expect(isBundleUpgradeOffered(aiOnly)).toBe(true)
  })

  it('owning both: nothing is offered', () => {
    const both = account({ entitlements: { ai: true, cloud: true } })
    for (const product of ['ai', 'cloud', 'bundle'] as const) expect(isPlanOffered(both, product)).toBe(false)
  })
})

describe('productOffer — one answer per product for every paid surface', () => {
  it('unknown plan: no offer at all', () => {
    const unknown = account({ entitlementsKnown: false, entitlements: { ai: false, cloud: true }, bundleUpgradeAvailable: true })
    expect(productOffer(unknown, 'ai')).toBe('unknown')
    expect(productOffer(unknown, 'cloud')).toBe('unknown')
  })

  it('signed out or free: a checkout', () => {
    expect(productOffer(account({ signedIn: false, entitlementsKnown: false }), 'ai')).toBe('checkout')
    expect(productOffer(account(), 'cloud')).toBe('checkout')
  })

  it('a single upgradable plan: owned for it, upgrade for the other', () => {
    const cloudOnly = account({ entitlements: { ai: false, cloud: true }, bundleUpgradeAvailable: true })
    expect(productOffer(cloudOnly, 'cloud')).toBe('owned')
    expect(productOffer(cloudOnly, 'ai')).toBe('upgrade')
  })

  it('a single plan that cannot be changed: the other one as its own checkout', () => {
    const comp = account({ entitlements: { ai: true, cloud: false }, bundleUpgradeAvailable: false })
    expect(productOffer(comp, 'ai')).toBe('owned')
    expect(productOffer(comp, 'cloud')).toBe('checkout')
  })

  it('never answers upgrade and checkout for the same account and product', () => {
    for (const ai of [false, true]) {
      for (const cloud of [false, true]) {
        for (const bundleUpgradeAvailable of [false, true]) {
          const view = account({ entitlements: { ai, cloud }, bundleUpgradeAvailable })
          for (const product of ['ai', 'cloud'] as const) {
            const offer = productOffer(view, product)
            if (offer === 'upgrade') expect(isPlanOffered(view, product)).toBe(false)
            if (offer === 'checkout') expect(isBundleUpgradeOffered(view)).toBe(false)
          }
        }
      }
    }
  })
})

describe('price helpers', () => {
  // Intl inserts a no-break space between the amount and the € sign in Spanish.
  const normalize = (s: string) => s.replace(/\s/g, ' ')

  it('formats EUR per UI language', () => {
    expect(formatPrice(3.99, 'en')).toBe('€3.99')
    expect(normalize(formatPrice(3.99, 'es'))).toBe('3,99 €')
    expect(normalize(formatPrice(4, 'es'))).toBe('4,00 €')
  })

  it('computes the yearly saving, floored', () => {
    expect(yearlySavingsPercent('cloud')).toBe(16)
    expect(yearlySavingsPercent('bundle')).toBe(16)
    expect(yearlySavingsPercent('ai')).toBe(30)
  })

  it('computes what the Bundle saves and what an upgrade adds, in whole cents', () => {
    expect(bundleSavings('monthly')).toBe(1.99)
    expect(bundleSavings('yearly')).toBe(9.99)
    expect(bundleUpgradeDifference('cloud', 'monthly')).toBe(4)
    expect(bundleUpgradeDifference('cloud', 'yearly')).toBe(40)
    expect(bundleUpgradeDifference('ai', 'monthly')).toBe(2)
    expect(bundleUpgradeDifference('ai', 'yearly')).toBe(30)
  })
})

describe('isBundleUpgradeOffered — Bundle as a plan change, never a second checkout', () => {
  it('offered with exactly one entitlement that main can upgrade', () => {
    expect(isBundleUpgradeOffered(account({ entitlements: { ai: true, cloud: false }, bundleUpgradeAvailable: true }))).toBe(true)
    expect(isBundleUpgradeOffered(account({ entitlements: { ai: false, cloud: true }, bundleUpgradeAvailable: true }))).toBe(true)
  })

  it('not offered without the flag (comp, older main), with none or both, signed out or unknown', () => {
    expect(isBundleUpgradeOffered(account({ entitlements: { ai: true, cloud: false } }))).toBe(false)
    expect(isBundleUpgradeOffered(account({ bundleUpgradeAvailable: true }))).toBe(false)
    expect(isBundleUpgradeOffered(account({ entitlements: { ai: true, cloud: true }, bundleUpgradeAvailable: true }))).toBe(false)
    expect(isBundleUpgradeOffered(account({ signedIn: false, entitlements: { ai: true, cloud: false }, bundleUpgradeAvailable: true }))).toBe(false)
    expect(isBundleUpgradeOffered(account({ entitlementsKnown: false, entitlements: { ai: true, cloud: false }, bundleUpgradeAvailable: true }))).toBe(false)
  })

  it('never overlaps with the Bundle checkout card', () => {
    for (const ai of [false, true]) {
      for (const cloud of [false, true]) {
        const view = account({ entitlements: { ai, cloud }, bundleUpgradeAvailable: true })
        expect(isBundleUpgradeOffered(view) && isPlanOffered(view, 'bundle')).toBe(false)
      }
    }
  })
})

describe('hasKnownEntitlement', () => {
  it('requires a session, a known plan and the flag', () => {
    expect(hasKnownEntitlement(account({ entitlements: { ai: false, cloud: true } }), 'cloud')).toBe(true)
    expect(hasKnownEntitlement(account({ entitlements: { ai: false, cloud: true } }), 'ai')).toBe(false)
    expect(hasKnownEntitlement(account({ entitlementsKnown: false, entitlements: { ai: true, cloud: true } }), 'cloud')).toBe(false)
    expect(hasKnownEntitlement(account({ signedIn: false, entitlements: { ai: true, cloud: true } }), 'ai')).toBe(false)
  })
})

describe('activePlan', () => {
  it('names the bundle when both entitlements are on, else the single one', () => {
    expect(activePlan(account({ entitlements: { ai: true, cloud: true } }))).toBe('bundle')
    expect(activePlan(account({ entitlements: { ai: false, cloud: true } }))).toBe('cloud')
    expect(activePlan(account({ entitlements: { ai: true, cloud: false } }))).toBe('ai')
  })

  it('is null without a plan, without a session or while the plan is unknown', () => {
    expect(activePlan(account())).toBeNull()
    expect(activePlan(account({ signedIn: false, entitlements: { ai: true, cloud: true } }))).toBeNull()
    expect(activePlan(account({ entitlementsKnown: false, entitlements: { ai: true, cloud: true } }))).toBeNull()
  })
})
