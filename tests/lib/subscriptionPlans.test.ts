import { describe, it, expect } from 'vitest'
import {
  activePlan,
  hasKnownEntitlement,
  isBundleUpgradeOffered,
  isPlanOffered,
  isPlanUnknown,
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
    const aiOnly = account({ entitlements: { ai: true, cloud: false } })
    expect(isPlanOffered(aiOnly, 'ai')).toBe(false)
    expect(isPlanOffered(aiOnly, 'cloud')).toBe(true)
    expect(isPlanOffered(aiOnly, 'bundle')).toBe(false)
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
