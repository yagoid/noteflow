// Pure entitlement derivation from the `subscriptions` rows the client can read
// via RLS. Lives in electron/ (not src/lib/) because only the main process needs
// it — tsconfig.electron.json (rootDir: 'electron') cannot import renderer code,
// and the renderer only ever sees the derived {ai, cloud} booleans in the public
// account status. Covered by tests/electron/entitlements.test.ts.

/** A row of public.subscriptions as returned by PostgREST (select=product,status,renews_at,provider). */
export interface SubscriptionRow {
  product: string
  status: string
  renews_at?: string | null
  provider?: string | null
}

/** `subscriptions.provider` of rows written by the Lemon Squeezy webhook. */
export const BILLING_PROVIDER = 'lemonsqueezy'

export interface Entitlements {
  ai: boolean
  cloud: boolean
}

export const NO_ENTITLEMENTS: Entitlements = { ai: false, cloud: false }

/**
 * A product is entitled when some row carries that product (or 'bundle') with
 * status 'active'. Any other status (past_due, canceled, expired) grants nothing
 * — grace periods, if ever wanted, are a server-side decision (the webhook keeps
 * status 'active' during them), not a client one.
 */
export function computeEntitlements(rows: SubscriptionRow[] | null | undefined): Entitlements {
  let ai = false
  let cloud = false
  for (const row of rows ?? []) {
    if (!row || row.status !== 'active') continue
    if (row.product === 'ai' || row.product === 'bundle') ai = true
    if (row.product === 'cloud' || row.product === 'bundle') cloud = true
  }
  return { ai, cloud }
}

/**
 * Does the account have (or had) a subscription billed through Lemon Squeezy —
 * one the customer portal can manage (cancel, change plan, card, invoices)?
 * Any status counts: past_due needs the card updated, and a canceled/expired
 * one still has its invoices there. `provider='manual'` rows (comps granted by
 * the operator) have nothing to manage and never count.
 */
export function hasBillingSubscription(rows: SubscriptionRow[] | null | undefined): boolean {
  return (rows ?? []).some((row) => !!row && row.provider === BILLING_PROVIDER)
}
