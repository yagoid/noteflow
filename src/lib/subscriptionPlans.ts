// Subscription plan prices shown in the UI (Settings → Account / Cloud panel).
//
// DISPLAY-ONLY: the authoritative figure is always the one shown at the Lemon
// Squeezy checkout — these strings exist so the app can advertise the price
// before opening the browser. Keep them in sync with the LS product variants
// (and with the /pricing page of the website).

export type SubscriptionProduct = 'ai' | 'cloud' | 'bundle'

export const SUBSCRIPTION_PRICES: Record<SubscriptionProduct, { monthly: string; yearly: string }> = {
  ai: { monthly: '€5.99', yearly: '€49.99' },
  cloud: { monthly: '€3.99', yearly: '€39.99' },
  bundle: { monthly: '€7.99', yearly: '€79.99' },
}

/** The bits of the public AccountStatus the plan-visibility rules look at. */
export interface PlanAccountView {
  signedIn: boolean
  entitlements: { ai: boolean; cloud: boolean }
  /** False = entitlements never fetched for this session: UNKNOWN, not "not entitled". */
  entitlementsKnown: boolean
}

/**
 * Signed in but the plan was never fetched (offline boot, keychain locked…).
 * Every paid surface then shows a neutral "couldn't verify your plan — Retry"
 * state: NEITHER the Subscribe cards (double-billing risk for a paying user)
 * NOR the "not subscribed" / Enable-gated one.
 */
export function isPlanUnknown(account: PlanAccountView): boolean {
  return account.signedIn && !account.entitlementsKnown
}

/** Known to own the product's entitlement (unknown counts as NOT known-owned). */
export function hasKnownEntitlement(account: PlanAccountView, product: 'ai' | 'cloud'): boolean {
  return account.signedIn && account.entitlementsKnown && account.entitlements[product]
}

/**
 * Is the plan card for `product` offered? Signed out: always (the card routes
 * to sign-in). Signed in: only once the entitlements are KNOWN and that one is
 * missing — the Bundle needs BOTH missing: on top of a single plan it would
 * mean paying twice for the same product.
 */
export function isPlanOffered(account: PlanAccountView, product: SubscriptionProduct): boolean {
  if (!account.signedIn) return true
  if (!account.entitlementsKnown) return false
  const { ai, cloud } = account.entitlements
  if (product === 'bundle') return !ai && !cloud
  return product === 'ai' ? !ai : !cloud
}
