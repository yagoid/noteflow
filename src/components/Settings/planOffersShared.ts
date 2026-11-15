import type { AccountStatus } from '../../types'
import { SUBSCRIPTION_PRICES, formatPrice, productOffer, type SubscriptionProduct } from '../../lib/subscriptionPlans'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { useLanguageStore } from '../../stores/languageStore'

// Non-component helpers of the plan surfaces (PlanOffers.tsx, AccountPanel, SyncPanel,
// LlmConfigView), kept out of PlanOffers.tsx so that file only exports components
// (React Fast Refresh).

export const PLAN_NAMES: Record<SubscriptionProduct, string> = {
  ai: 'NoteFlow AI',
  cloud: 'NoteFlow Cloud',
  bundle: 'NoteFlow Bundle',
}

// Primary (accent) button of the plan surfaces.
export const PRIMARY_BUTTON =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-accent/15 hover:bg-accent/25 text-accent border border-solid border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** Formats a EUR amount for the UI language (en → "€3.99", es → "3,99 €"). */
export function usePrice(): (amount: number) => string {
  const lang = useLanguageStore((s) => s.lang)
  return (amount) => formatPrice(amount, lang)
}

// Does this build ship a checkout URL for the product? (Set in main; without one
// the plan can only say "coming soon".)
export function isCheckoutConfigured(account: AccountStatus, product: SubscriptionProduct): boolean {
  if (product === 'ai') return account.aiCheckoutConfigured
  if (product === 'cloud') return account.cloudCheckoutConfigured
  return account.bundleCheckoutConfigured
}

/**
 * Label of the small tag on a paid option sitting next to free ones (Sync chooser,
 * AI source cards): the price for a new subscription, "In your plan" when owned,
 * "Add to your plan" when it would be a Bundle upgrade (no price in front of a
 * paying user), and nothing while the plan is unknown or the build can't sell it.
 */
export function useOfferTag(account: AccountStatus | null, product: 'ai' | 'cloud'): string | null {
  const t = useT()
  const price = usePrice()
  if (!account || !account.configured) return null
  switch (productOffer(account, product)) {
    case 'owned': return t.settings.plans.inYourPlan
    case 'upgrade': return t.settings.plans.addToYourPlan
    case 'checkout': return tf(t.settings.plans.perMonth, { price: price(SUBSCRIPTION_PRICES[product].monthly) })
    default: return null
  }
}
