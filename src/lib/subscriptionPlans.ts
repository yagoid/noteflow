// Subscription plan prices and visibility rules shown in the UI (Settings → Account,
// Settings → Sync → NoteFlow Cloud, Settings → AI and the brain panel).
//
// DISPLAY-ONLY prices: the authoritative figure is always the one shown at the Lemon
// Squeezy checkout — these numbers exist so the app can advertise the price before
// opening the browser. Keep them in sync with the LS product variants (and with the
// /pricing page of the website). They are plain EUR amounts; formatPrice() renders
// them for the UI language (en → "€3.99", es → "3,99 €").

import type { Lang } from '../i18n/types'

export type SubscriptionProduct = 'ai' | 'cloud' | 'bundle'
export type BillingPeriod = 'monthly' | 'yearly'

export const SUBSCRIPTION_PRICES: Record<SubscriptionProduct, Record<BillingPeriod, number>> = {
  ai: { monthly: 5.99, yearly: 49.99 },
  cloud: { monthly: 3.99, yearly: 39.99 },
  bundle: { monthly: 7.99, yearly: 79.99 },
}

// Float sums of prices (3.99 + 5.99 - 7.99) carry binary noise: keep whole cents.
const roundCents = (amount: number): number => Math.round(amount * 100) / 100

const formatters = new Map<Lang, Intl.NumberFormat>()

/** A EUR amount in the UI language's convention: en → "€3.99", es → "3,99 €". */
export function formatPrice(amount: number, lang: Lang): string {
  let fmt = formatters.get(lang)
  if (!fmt) {
    fmt = new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-IE', { style: 'currency', currency: 'EUR' })
    formatters.set(lang, fmt)
  }
  return fmt.format(amount)
}

/** Whole percentage saved by paying yearly instead of 12 monthly payments (floored: never overstated). */
export function yearlySavingsPercent(product: SubscriptionProduct): number {
  const { monthly, yearly } = SUBSCRIPTION_PRICES[product]
  return Math.floor((1 - yearly / (monthly * 12)) * 100)
}

/** What the Bundle saves per period against buying AI and Cloud as two subscriptions. */
export function bundleSavings(period: BillingPeriod): number {
  const p = SUBSCRIPTION_PRICES
  return roundCents(p.ai[period] + p.cloud[period] - p.bundle[period])
}

/** Extra per period when a single AI / Cloud subscription is switched to the Bundle. */
export function bundleUpgradeDifference(from: 'ai' | 'cloud', period: BillingPeriod): number {
  return roundCents(SUBSCRIPTION_PRICES.bundle[period] - SUBSCRIPTION_PRICES[from][period])
}

/** The bits of the public AccountStatus the plan-visibility rules look at. */
export interface PlanAccountView {
  signedIn: boolean
  entitlements: { ai: boolean; cloud: boolean }
  /** False = entitlements never fetched for this session: UNKNOWN, not "not entitled". */
  entitlementsKnown: boolean
  /**
   * Main says the single entitlement comes from exactly one Lemon Squeezy
   * subscription whose plan can be changed to the Bundle (AccountStatus field).
   */
  bundleUpgradeAvailable?: boolean
}

/**
 * Signed in but the plan was never fetched (offline boot, keychain locked…).
 * Every paid surface then shows a neutral "couldn't verify your plan — Retry"
 * state: NEITHER the Subscribe offers (double-billing risk for a paying user)
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
 * Is `product` offered as a CHECKOUT (a new subscription)? Signed out: always (the
 * offer routes to sign-in first). Signed in: only once the entitlements are KNOWN
 * and that one is missing — the Bundle needs BOTH missing: on top of a single plan
 * it would mean paying twice for the same product.
 *
 * With exactly one of AI / Cloud whose subscription can be switched to the Bundle
 * (bundleUpgradeAvailable), the other product is NOT offered on its own either: the
 * plan change is the only offer — AI + Cloud as two subscriptions cost more than the
 * Bundle. When the plan can't be changed (a comp, two rows of the same product…),
 * the other product stays offered on its own: buying a different product never
 * bills an owned one twice, whereas a Bundle checkout on top would.
 */
export function isPlanOffered(account: PlanAccountView, product: SubscriptionProduct): boolean {
  if (!account.signedIn) return true
  if (!account.entitlementsKnown) return false
  const { ai, cloud } = account.entitlements
  if (product === 'bundle') return !ai && !cloud
  const owned = product === 'ai' ? ai : cloud
  if (owned) return false
  const ownsTheOther = product === 'ai' ? cloud : ai
  return !(ownsTheOther && account.bundleUpgradeAvailable === true)
}

/**
 * Is the Bundle offered as an UPGRADE (plan change of the current
 * subscription, prorated) instead of a checkout? Signed in, entitlements KNOWN,
 * exactly one of AI / Cloud, and main confirmed that one is a single Lemon
 * Squeezy subscription it can change. Never at the same time as
 * isPlanOffered(account, 'bundle') (that one needs both missing).
 */
export function isBundleUpgradeOffered(account: PlanAccountView): boolean {
  if (!account.signedIn || !account.entitlementsKnown) return false
  const { ai, cloud } = account.entitlements
  return ai !== cloud && account.bundleUpgradeAvailable === true
}

/**
 * How AI or Cloud can be obtained by this account — the single source every paid
 * surface reads so they can never disagree:
 * - 'unknown': signed in, plan never fetched → PlanUnknownNotice, no offer at all;
 * - 'owned': already entitled → nothing to sell;
 * - 'upgrade': owns the OTHER product on a subscription that can be switched to the
 *   Bundle → the plan change is the only offer (never a second checkout);
 * - 'checkout': a new subscription (signed out, nothing owned, or a single plan that
 *   can't be changed — see isPlanOffered);
 * - 'none': nothing can be offered (defensive; not reachable with the rules above).
 */
export type ProductOffer = 'unknown' | 'owned' | 'upgrade' | 'checkout' | 'none'

export function productOffer(account: PlanAccountView, product: 'ai' | 'cloud'): ProductOffer {
  if (isPlanUnknown(account)) return 'unknown'
  if (hasKnownEntitlement(account, product)) return 'owned'
  if (isBundleUpgradeOffered(account)) return 'upgrade'
  return isPlanOffered(account, product) ? 'checkout' : 'none'
}

/**
 * The plan to NAME for a session (sidebar footer, Settings → Account): 'bundle' when both
 * entitlements are on, else the single one, else null (signed out, free / lapsed, or
 * entitlements still unknown — unknown is not shown as a plan). Entitlements don't say how
 * they were bought, so two separate AI + Cloud subscriptions also read as 'bundle'.
 */
export function activePlan(account: PlanAccountView): SubscriptionProduct | null {
  if (!account.signedIn || !account.entitlementsKnown) return null
  const { ai, cloud } = account.entitlements
  if (ai && cloud) return 'bundle'
  if (cloud) return 'cloud'
  if (ai) return 'ai'
  return null
}
