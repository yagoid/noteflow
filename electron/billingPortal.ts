// Pure helpers for Settings → Subscription → "Manage subscription" (Lemon
// Squeezy customer portal). No electron imports — covered by
// tests/electron/billingPortal.test.ts. The networked part lives in
// account.ts (openBillingPortal → billing-portal Edge Function) and the
// shell.openExternal in main.ts.

/** How the portal was reached: the user's pre-signed portal, or the store's generic one (sign-in by email). */
export type BillingPortalVia = 'customerPortal' | 'storePortal'

/**
 * The only URLs main will open for the billing portal: https on
 * lemonsqueezy.com or a subdomain (`<store>.lemonsqueezy.com`), no credentials,
 * no custom port. Same rule as the Edge Function's validatePortalUrl — checked
 * again here because the client must not trust a server answer to drive
 * shell.openExternal. Returns the parsed URL, or null.
 */
export function parseBillingPortalUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || !raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  if (host !== 'lemonsqueezy.com' && !host.endsWith('.lemonsqueezy.com')) return null
  return url
}

/**
 * The store's generic customer portal (`https://<store>.lemonsqueezy.com/billing`,
 * where the customer signs in by email), derived from the first configured
 * checkout URL so the store subdomain is written in one place only. '' when no
 * checkout URL is configured or none is a `<store>.lemonsqueezy.com` URL.
 */
export function deriveStorePortalUrl(checkoutUrls: readonly string[]): string {
  for (const raw of checkoutUrls) {
    const url = parseBillingPortalUrl(raw)
    if (!url) continue
    const host = url.hostname.toLowerCase()
    // The store subdomain is required: the apex has no store-specific portal.
    if (host === 'lemonsqueezy.com') continue
    return `https://${host}/billing`
  }
  return ''
}

/** The URL out of a billing-portal Edge Function answer ({url} on 200), validated; null otherwise. */
export function portalUrlFromFunctionResponse(status: number, json: unknown): URL | null {
  if (status !== 200 || !json || typeof json !== 'object') return null
  return parseBillingPortalUrl((json as { url?: unknown }).url)
}

/** Machine-readable `error.code` of a failed billing-portal answer (for logs). */
export function portalErrorCode(json: unknown): string {
  const error = (json as { error?: { code?: unknown } } | null)?.error
  return typeof error?.code === 'string' ? error.code : 'unknown'
}
