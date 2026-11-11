// Pure, runtime-agnostic logic for the billing-portal Edge Function. Uses ONLY
// standard Web/JS APIs (fetch, URL) — no Deno.*, no Buffer — so it runs
// unchanged in the Edge Function (Deno) and under vitest on Node. The network
// is injected (`deps.fetch`), so the whole request flow is testable. Covered by
// tests/supabase/billing-portal.test.ts. Same philosophy as the other
// functions' logic.ts.
//
// What it does: returns a FRESH Lemon Squeezy customer-portal URL for the
// caller's subscription. LS's per-subscription `urls.customer_portal` is a
// pre-signed link that expires after 24 h, so it can't be stored from the
// webhook — it is asked to the LS API on demand, with the operator's API key
// (LEMONSQUEEZY_API_KEY), which must never reach the client.

export interface BillingPortalEnv {
  supabaseUrl?: string
  anonKey?: string
  serviceRoleKey?: string
  lemonApiKey?: string
}

export interface BillingPortalRequest {
  method: string
  /** Raw `Authorization` header (expected: `Bearer <Supabase access token>`). */
  authorization: string | null
}

export interface BillingPortalDeps {
  fetch: typeof fetch
  /** Operator-facing diagnostics (console.error in the Edge Function). */
  log?: (message: string) => void
}

export interface BillingPortalResponse {
  status: number
  body: { url: string } | { error: { message: string; code: string } }
}

/** A row of public.subscriptions as selected by this function. */
export interface PortalSubscriptionRow {
  status?: unknown
  provider_ref?: unknown
  renews_at?: unknown
  created_at?: unknown
}

export const LEMONSQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1'
const LEMONSQUEEZY_TIMEOUT_MS = 10_000

/** Error body shape shared with the desktop client (same as cloud-keys / ai-proxy). */
export function portalErrorBody(message: string, code: string): { error: { message: string; code: string } } {
  return { error: { message, code } }
}

// Most relevant first: the subscription the user is paying for now beats one
// with a failed payment, which beats anything already over.
const STATUS_RANK: Record<string, number> = { active: 0, past_due: 1, canceled: 2, expired: 3 }

/** Lemon Squeezy subscription ids are numeric; anything else never reaches the API path. */
export function isLemonSubscriptionId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,20}$/.test(value)
}

function timeOf(value: unknown): number {
  if (typeof value !== 'string') return -Infinity
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? -Infinity : ms
}

/**
 * Picks the subscription whose portal to open, among the caller's
 * `provider='lemonsqueezy'` rows: best status (active > past_due > canceled >
 * expired > unknown), then the latest renews_at, then the newest row. Rows
 * without a valid LS id are skipped. Returns the LS subscription id, or null.
 */
export function pickPortalSubscription(rows: unknown): string | null {
  if (!Array.isArray(rows)) return null
  let best: { ref: string; rank: number; renews: number; created: number } | null = null
  for (const raw of rows as PortalSubscriptionRow[]) {
    if (!raw || typeof raw !== 'object' || !isLemonSubscriptionId(raw.provider_ref)) continue
    const candidate = {
      ref: raw.provider_ref,
      rank: typeof raw.status === 'string' && raw.status in STATUS_RANK ? STATUS_RANK[raw.status] : 99,
      renews: timeOf(raw.renews_at),
      created: timeOf(raw.created_at),
    }
    if (
      !best ||
      candidate.rank < best.rank ||
      (candidate.rank === best.rank && candidate.renews > best.renews) ||
      (candidate.rank === best.rank && candidate.renews === best.renews && candidate.created > best.created)
    ) {
      best = candidate
    }
  }
  return best ? best.ref : null
}

/**
 * Only an https URL on lemonsqueezy.com (or a subdomain — the store's portal
 * lives on `<store>.lemonsqueezy.com`), without credentials or a custom port,
 * is ever handed to the client. Returns the normalized href, or null.
 */
export function validatePortalUrl(raw: unknown): string | null {
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
  return url.href
}

/** `data.attributes.urls.customer_portal` of a LS `GET /v1/subscriptions/:id` answer, validated. */
export function extractCustomerPortalUrl(json: unknown): string | null {
  const data = (json as { data?: { attributes?: { urls?: { customer_portal?: unknown } } } } | null)?.data
  return validatePortalUrl(data?.attributes?.urls?.customer_portal)
}

function fail(status: number, message: string, code: string): BillingPortalResponse {
  return { status, body: portalErrorBody(message, code) }
}

/**
 * The whole request: authenticate the caller, find their Lemon Squeezy
 * subscription (service role, explicit user_id filter — never anyone else's
 * row), ask LS for a fresh portal URL and validate it. Never throws.
 */
export async function handleBillingPortal(
  req: BillingPortalRequest,
  env: BillingPortalEnv,
  deps: BillingPortalDeps
): Promise<BillingPortalResponse> {
  const log = deps.log ?? (() => {})
  if (req.method !== 'POST') return fail(405, 'Method not allowed.', 'method_not_allowed')

  const { supabaseUrl, anonKey, serviceRoleKey, lemonApiKey } = env
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !lemonApiKey) {
    log('billing-portal: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / LEMONSQUEEZY_API_KEY missing')
    return fail(500, 'The billing portal is not configured.', 'not_configured')
  }

  // ── Auth: resolve the caller's Supabase access token to a user id ──────────
  const token = (req.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return fail(401, 'Missing NoteFlow session. Sign in from Settings → Subscription.', 'missing_token')

  let userId: string | undefined
  try {
    const userRes = await deps.fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!userRes.ok) {
      return fail(401, 'Invalid or expired NoteFlow session. Sign in again.', 'invalid_token')
    }
    const user = (await userRes.json().catch(() => null)) as { id?: unknown } | null
    userId = typeof user?.id === 'string' && user.id ? user.id : undefined
  } catch (err) {
    log(`billing-portal: auth lookup failed: ${String(err)}`)
    return fail(502, 'Could not verify the NoteFlow session. Try again.', 'auth_unreachable')
  }
  if (!userId) return fail(401, 'Could not resolve the NoteFlow session.', 'invalid_token')

  // ── The caller's Lemon Squeezy rows (service role + explicit user filter) ──
  let rows: unknown
  try {
    const rowsRes = await deps.fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}` +
        '&provider=eq.lemonsqueezy&select=status,provider_ref,renews_at,created_at',
      {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      }
    )
    if (!rowsRes.ok) {
      log(`billing-portal: subscriptions query failed (${rowsRes.status})`)
      return fail(500, 'Could not load the subscription. Try again.', 'query_failed')
    }
    rows = await rowsRes.json().catch(() => null)
  } catch (err) {
    log(`billing-portal: subscriptions query failed: ${String(err)}`)
    return fail(500, 'Could not load the subscription. Try again.', 'query_failed')
  }

  const subscriptionId = pickPortalSubscription(rows)
  if (!subscriptionId) {
    return fail(404, 'No Lemon Squeezy subscription is linked to this account.', 'no_subscription')
  }

  // ── Fresh, pre-signed portal URL from the LS API ───────────────────────────
  let lemonJson: unknown
  try {
    const lemonRes = await deps.fetch(`${LEMONSQUEEZY_API_BASE}/subscriptions/${subscriptionId}`, {
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${lemonApiKey}`,
      },
      signal: AbortSignal.timeout(LEMONSQUEEZY_TIMEOUT_MS),
    })
    if (!lemonRes.ok) {
      log(`billing-portal: Lemon Squeezy answered ${lemonRes.status} for subscription ${subscriptionId}`)
      return fail(502, 'The billing provider did not return a portal link.', 'provider_error')
    }
    lemonJson = await lemonRes.json().catch(() => null)
  } catch (err) {
    log(`billing-portal: Lemon Squeezy request failed: ${String(err)}`)
    return fail(502, 'Could not reach the billing provider. Try again.', 'provider_unreachable')
  }

  const url = extractCustomerPortalUrl(lemonJson)
  if (!url) {
    log(`billing-portal: missing or unexpected customer_portal URL for subscription ${subscriptionId}`)
    return fail(502, 'The billing provider did not return a valid portal link.', 'invalid_portal_url')
  }
  return { status: 200, body: { url } }
}
