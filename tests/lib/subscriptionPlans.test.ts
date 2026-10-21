import { describe, it, expect } from 'vitest'
import {
  hasKnownEntitlement,
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

describe('hasKnownEntitlement', () => {
  it('requires a session, a known plan and the flag', () => {
    expect(hasKnownEntitlement(account({ entitlements: { ai: false, cloud: true } }), 'cloud')).toBe(true)
    expect(hasKnownEntitlement(account({ entitlements: { ai: false, cloud: true } }), 'ai')).toBe(false)
    expect(hasKnownEntitlement(account({ entitlementsKnown: false, entitlements: { ai: true, cloud: true } }), 'cloud')).toBe(false)
    expect(hasKnownEntitlement(account({ signedIn: false, entitlements: { ai: true, cloud: true } }), 'ai')).toBe(false)
  })
})
