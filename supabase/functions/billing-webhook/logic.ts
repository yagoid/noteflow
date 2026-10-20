// Pure, runtime-agnostic logic for the Lemon Squeezy billing webhook.
// Deliberately uses ONLY standard Web APIs (crypto.subtle, TextEncoder) — no
// Deno.* — so it runs unchanged in the Edge Function (Deno) and under vitest
// on Node (>=20 ships crypto.subtle globally). Covered by
// tests/supabase/billing-webhook.test.ts.

export type Product = 'ai' | 'cloud' | 'bundle'

/**
 * Statuses we write to public.subscriptions. Note we never emit 'canceled':
 * a Lemon Squeezy `cancelled` subscription stays paid until its ends_at, so we
 * keep status 'active' (grace periods are resolved server-side — see the
 * comment in electron/entitlements.ts) and rely on the later
 * subscription_expired event to flip it to 'expired'.
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'expired'

export interface SubscriptionEventRow {
  /** null when the checkout did not carry custom_data.user_id (update-only path). */
  userId: string | null
  product: Product
  status: SubscriptionStatus
  /** ISO timestamp the entitlement runs until (LS ends_at, else renews_at). */
  renewsAt: string | null
  /** Lemon Squeezy subscription id — our idempotency key (provider_ref). */
  providerRef: string
  /** ISO timestamp of the event (LS attributes.updated_at) — out-of-order guard. */
  eventAt: string
}

export type MapResult =
  /** warning: something the caller should log (e.g. a malformed custom_data.user_id). */
  | { kind: 'apply'; row: SubscriptionEventRow; warning?: string }
  /**
   * Full refund of a subscription payment: expire the subscription for good
   * (RPC expire_subscription_ref, migration 0010). providerRef = the LS
   * subscription id the refunded invoice belongs to.
   */
  | { kind: 'expire'; providerRef: string }
  | { kind: 'ignore'; reason: string }

export interface MapOptions {
  /**
   * Process Lemon Squeezy TEST-mode events (meta.test_mode === true). Off by
   * default and NEVER on in production: test and live webhooks share the
   * signing secret, so this flag (together with the live-only variant map) is
   * what keeps a checkout paid with LS's test card from granting a real
   * entitlement. Env LEMONSQUEEZY_ALLOW_TEST_MODE=true, for a test project.
   */
  allowTestMode?: boolean
}

const VALID_PRODUCTS: ReadonlySet<string> = new Set(['ai', 'cloud', 'bundle'])

/** Lemon Squeezy subscription status → our subscriptions.status. */
const STATUS_MAP: Readonly<Record<string, SubscriptionStatus>> = {
  on_trial: 'active',
  active: 'active',
  // Still paid until ends_at; LS emits subscription_expired when it lapses.
  cancelled: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  paused: 'past_due',
  expired: 'expired',
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase()
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) return null
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Verifies the `X-Signature` header Lemon Squeezy sends with every webhook:
 * hex-encoded HMAC-SHA256 of the RAW request body with the signing secret.
 * Delegates the comparison to crypto.subtle.verify, which is constant-time.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHex: string,
  secret: string
): Promise<boolean> {
  if (!secret || !signatureHex) return false
  const signature = hexToBytes(signatureHex)
  if (!signature) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return crypto.subtle.verify('HMAC', key, signature as BufferSource, encoder.encode(rawBody))
}

/**
 * Parses the LEMONSQUEEZY_VARIANT_MAP env value, e.g.
 * "890123:ai,890124:cloud,890125:bundle" → Map variantId → product.
 * THROWS on any malformed entry or unknown product: this is operator-written
 * config, and failing loudly (webhook answers 500, LS retries) beats silently
 * dropping a mistyped variant and never granting paid entitlements.
 */
export function parseVariantMap(raw: string): Map<string, Product> {
  const map = new Map<string, Product>()
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue // tolerate trailing/double commas
    const sep = trimmed.indexOf(':')
    if (sep <= 0 || sep === trimmed.length - 1) {
      throw new Error(`Invalid variant map entry: "${trimmed}" (expected "<variantId>:<product>")`)
    }
    const variantId = trimmed.slice(0, sep).trim()
    const product = trimmed.slice(sep + 1).trim()
    if (!/^\d+$/.test(variantId)) {
      throw new Error(`Invalid variant id in variant map entry: "${trimmed}"`)
    }
    if (!VALID_PRODUCTS.has(product)) {
      throw new Error(`Unknown product "${product}" in variant map entry: "${trimmed}"`)
    }
    map.set(variantId, product as Product)
  }
  return map
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Canonical 8-4-4-4-12 hex UUID (any case) — what Supabase auth.users ids look like. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Maps a refunded subscription invoice (event subscription_payment_refunded,
 * data.type 'subscription-invoices'). Only a FULL refund (invoice status
 * 'refunded') expires the subscription: LS does not cancel the subscription
 * itself on refund, so without this the refunded buyer would keep the
 * entitlement. A partial refund (status 'partial_refund') is a goodwill gesture
 * on an otherwise paid period → ignored with a reason the caller logs; the
 * operator decides by hand.
 */
function mapRefund(data: Record<string, unknown>): MapResult {
  if (data.type !== 'subscription-invoices') {
    return { kind: 'ignore', reason: `refund event with unexpected data.type: ${String(data.type)}` }
  }
  const attributes = data.attributes
  if (!isRecord(attributes)) {
    return { kind: 'ignore', reason: 'malformed refund payload: missing data.attributes' }
  }
  const providerRef = asNonEmptyString(attributes.subscription_id)
  if (!providerRef) {
    return { kind: 'ignore', reason: 'malformed refund payload: missing subscription_id' }
  }
  const status = typeof attributes.status === 'string' ? attributes.status : ''
  if (status === 'partial_refund') {
    return { kind: 'ignore', reason: `partial refund of subscription ${providerRef} (not expired; operator decides)` }
  }
  if (status !== 'refunded') {
    return { kind: 'ignore', reason: `refund event with invoice status ${status || '(missing)'} for subscription ${providerRef}` }
  }
  return { kind: 'expire', providerRef }
}

/**
 * Maps a (signature-verified) Lemon Squeezy webhook payload to the row we feed
 * apply_subscription_event, to a refund expiration, or to an ignore with a
 * human-readable reason. Fully defensive: malformed/unexpected shapes NEVER
 * throw — they map to ignore, the endpoint answers 200 and LS does not enter a
 * retry loop.
 */
export function mapLemonEvent(
  payload: unknown,
  variantMap: Map<string, Product>,
  opts: MapOptions = {}
): MapResult {
  if (!isRecord(payload)) return { kind: 'ignore', reason: 'malformed payload: not an object' }

  const meta = isRecord(payload.meta) ? payload.meta : undefined

  // Test-mode events share the signing secret with live ones: drop them unless
  // explicitly allowed (see MapOptions.allowTestMode).
  if (meta?.test_mode === true && !opts.allowTestMode) {
    return { kind: 'ignore', reason: 'test mode event' }
  }

  const data = payload.data
  if (!isRecord(data)) return { kind: 'ignore', reason: 'malformed payload: missing data' }

  if (meta?.event_name === 'subscription_payment_refunded') return mapRefund(data)

  // Only subscription objects mutate entitlements. The other
  // subscription_payment_* events carry data.type 'subscription-invoices' and
  // order_* events carry 'orders' — both are informational for us.
  if (data.type !== 'subscriptions') {
    return { kind: 'ignore', reason: `unsupported data.type: ${String(data.type)}` }
  }

  const attributes = data.attributes
  if (!isRecord(attributes)) {
    return { kind: 'ignore', reason: 'malformed payload: missing data.attributes' }
  }

  const providerRef = asNonEmptyString(data.id)
  if (!providerRef) return { kind: 'ignore', reason: 'malformed payload: missing data.id' }

  const variantId = asNonEmptyString(attributes.variant_id)
  if (!variantId) return { kind: 'ignore', reason: 'malformed payload: missing variant_id' }

  const product = variantMap.get(variantId)
  if (!product) return { kind: 'ignore', reason: `unknown variant: ${variantId}` }

  const lsStatus = typeof attributes.status === 'string' ? attributes.status : ''
  const status = STATUS_MAP[lsStatus]
  if (!status) return { kind: 'ignore', reason: `unknown subscription status: ${lsStatus || '(missing)'}` }

  const eventAt = asNonEmptyString(attributes.updated_at)
  if (!eventAt) return { kind: 'ignore', reason: 'malformed payload: missing updated_at' }

  // ends_at is set once the subscription is cancelled/expiring and marks the
  // real end of the paid period; otherwise renews_at is the next renewal.
  const renewsAt =
    asNonEmptyString(attributes.ends_at) ?? asNonEmptyString(attributes.renews_at)

  // The app opens the checkout with checkout[custom][user_id]=<uuid>, which LS
  // echoes back in meta.custom_data. Purchases made outside the app lack it →
  // userId null → apply_subscription_event only updates, never inserts.
  // custom_data travels through the (public) checkout URL, so anyone can put
  // anything there: a non-UUID value would make the RPC's uuid cast fail → 500
  // → LS retry loop. It is treated as absent (update-only path) + a warning.
  const customData = meta?.custom_data
  const rawUserId = isRecord(customData) ? customData.user_id : undefined
  const hasRawUserId = typeof rawUserId === 'string' ? rawUserId.trim() !== '' : rawUserId !== undefined && rawUserId !== null
  const userId = isUuid(rawUserId) ? rawUserId : null

  const result: Extract<MapResult, { kind: 'apply' }> = {
    kind: 'apply',
    row: { userId, product, status, renewsAt, providerRef, eventAt },
  }
  if (hasRawUserId && userId === null) {
    result.warning = `custom_data.user_id is not a UUID (${String(rawUserId).slice(0, 64)}); treated as absent`
  }
  return result
}
