// Pure, runtime-agnostic logic for the billing-change-plan Edge Function. Uses
// ONLY standard Web/JS APIs (fetch, AbortSignal) — no Deno.*, no Buffer — so it
// runs unchanged in the Edge Function (Deno) and under vitest on Node. The
// network is injected (`deps.fetch`), so the whole request flow is testable.
// Covered by tests/supabase/billing-change-plan.test.ts. Same philosophy as the
// other functions' logic.ts (billing-portal is the closest sibling).
//
// What it does: upgrades the caller's single NoteFlow AI or NoteFlow Cloud
// subscription to the NoteFlow Bundle by CHANGING THE PLAN of that same Lemon
// Squeezy subscription (PATCH /v1/subscriptions/:id with the bundle variant) —
// never a second subscription, so nothing is billed twice:
//
//   - Same billing interval: monthly AI/Cloud → monthly Bundle, yearly →
//     yearly (LEMONSQUEEZY_BUNDLE_UPGRADE_MAP, operator-written).
//   - Prorated, invoiced now (`invoice_immediately: true`): LS credits the
//     unused time of the current plan and charges the difference for the rest
//     of the current period right away; from the next renewal the Bundle price
//     applies. The renewal date does not move. Charging now (instead of adding
//     the difference to the next invoice, LS's default) closes the "upgrade,
//     use the Bundle, cancel before renewal" hole.
//   - Entitlements are NOT written here: LS sends subscription_updated /
//     subscription_plan_changed for the SAME subscription id with the new
//     variant_id, and billing-webhook maps it to product 'bundle' on the SAME
//     row (apply_subscription_event upserts on (provider, provider_ref)). The
//     webhook stays the only writer of public.subscriptions.
//
// Idempotent: if LS already has the subscription on a bundle variant (a retry,
// a double click, the webhook not landed yet), it answers 200 `changed: false`
// without patching again.
//
// Refused (no LS call that changes anything): already entitled to both (this
// includes two separate AI + Cloud subscriptions — merging them is a manual
// operator task, see supabase/README.md § 5.2), no upgradable LS subscription
// (e.g. a 'manual' comp), MORE than one active LS subscription of the same
// product (ambiguous), or a subscription LS does not report as plainly
// `active` (cancelled-but-still-paid, past_due, paused, on_trial…).

export type Product = 'ai' | 'cloud' | 'bundle'

export interface ChangePlanEnv {
  supabaseUrl?: string
  anonKey?: string
  serviceRoleKey?: string
  lemonApiKey?: string
  /** LEMONSQUEEZY_VARIANT_MAP — the SAME value billing-webhook uses. */
  variantMap?: string
  /** LEMONSQUEEZY_BUNDLE_UPGRADE_MAP — "<ai|cloud variant>:<bundle variant>,…". */
  bundleUpgradeMap?: string
}

export interface ChangePlanRequest {
  method: string
  /** Raw `Authorization` header (expected: `Bearer <Supabase access token>`). */
  authorization: string | null
  /** Raw request body (expected: `{"plan":"bundle"}`). */
  body: string
}

export interface ChangePlanDeps {
  fetch: typeof fetch
  /** Operator-facing diagnostics (console.error in the Edge Function). */
  log?: (message: string) => void
}

export type ChangePlanErrorCode =
  | 'method_not_allowed'
  | 'not_configured'
  | 'missing_token'
  | 'invalid_token'
  | 'auth_unreachable'
  | 'unsupported_plan'
  | 'query_failed'
  | 'already_entitled'
  | 'no_subscription'
  | 'multiple_subscriptions'
  | 'subscription_not_active'
  | 'provider_error'
  | 'provider_unreachable'

export interface ChangePlanSuccess {
  ok: true
  product: 'bundle'
  /** false = LS already had the subscription on a bundle variant (nothing patched). */
  changed: boolean
}

export interface ChangePlanResponse {
  status: number
  body: ChangePlanSuccess | { error: { message: string; code: ChangePlanErrorCode } }
}

export const LEMONSQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1'
const LEMONSQUEEZY_TIMEOUT_MS = 15_000
const BILLING_PROVIDER = 'lemonsqueezy'
const VALID_PRODUCTS: ReadonlySet<string> = new Set(['ai', 'cloud', 'bundle'])

/** Error body shape shared with the desktop client (same as billing-portal / cloud-keys). */
export function changePlanErrorBody(
  message: string,
  code: ChangePlanErrorCode
): { error: { message: string; code: ChangePlanErrorCode } } {
  return { error: { message, code } }
}

function fail(status: number, message: string, code: ChangePlanErrorCode): ChangePlanResponse {
  return { status, body: changePlanErrorBody(message, code) }
}

/** Lemon Squeezy subscription ids are numeric; anything else never reaches the API path. */
export function isLemonSubscriptionId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,20}$/.test(value)
}

/**
 * Parses LEMONSQUEEZY_VARIANT_MAP ("890123:ai,890124:cloud,890125:bundle").
 * MIRROR of parseVariantMap in billing-webhook/logic.ts (each function is
 * deployed self-contained); tests/supabase/billing-change-plan.test.ts pins
 * that both parse the same input to the same map. Throws on malformed config.
 */
export function parseVariantMap(raw: string): Map<string, Product> {
  const map = new Map<string, Product>()
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const sep = trimmed.indexOf(':')
    if (sep <= 0 || sep === trimmed.length - 1) {
      throw new Error(`Invalid variant map entry: "${trimmed}" (expected "<variantId>:<product>")`)
    }
    const variantId = trimmed.slice(0, sep).trim()
    const product = trimmed.slice(sep + 1).trim()
    if (!/^\d+$/.test(variantId)) throw new Error(`Invalid variant id in variant map entry: "${trimmed}"`)
    if (!VALID_PRODUCTS.has(product)) throw new Error(`Unknown product "${product}" in variant map entry: "${trimmed}"`)
    map.set(variantId, product as Product)
  }
  return map
}

/**
 * Parses LEMONSQUEEZY_BUNDLE_UPGRADE_MAP ("<from>:<to>,…": each AI / Cloud
 * variant → the Bundle variant with the SAME billing interval) and checks it
 * against the variant map, so a typo can never move a customer to a variant
 * the webhook would not recognise as 'bundle' (charged without the
 * entitlement). Throws on malformed or inconsistent config.
 */
export function parseBundleUpgradeMap(raw: string, variantMap: Map<string, Product>): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const match = /^(\d+)\s*:\s*(\d+)$/.exec(trimmed)
    if (!match) throw new Error(`Invalid bundle upgrade map entry: "${trimmed}" (expected "<fromVariant>:<bundleVariant>")`)
    const [, from, to] = match
    const fromProduct = variantMap.get(from)
    if (fromProduct !== 'ai' && fromProduct !== 'cloud') {
      throw new Error(`Bundle upgrade map: variant ${from} is not an ai/cloud variant of LEMONSQUEEZY_VARIANT_MAP`)
    }
    if (variantMap.get(to) !== 'bundle') {
      throw new Error(`Bundle upgrade map: variant ${to} is not a bundle variant of LEMONSQUEEZY_VARIANT_MAP`)
    }
    map.set(from, to)
  }
  return map
}

/** A row of public.subscriptions as selected by this function. */
export interface ChangePlanSubscriptionRow {
  product?: unknown
  status?: unknown
  provider?: unknown
  provider_ref?: unknown
}

export type UpgradePick =
  | { kind: 'ok'; subscriptionId: string; product: 'ai' | 'cloud' }
  | { kind: 'already_entitled' }
  | { kind: 'no_subscription' }
  | { kind: 'multiple_subscriptions' }

/**
 * Which subscription to upgrade, from ALL of the caller's rows. Same rule as
 * the desktop's canUpgradeToBundle (electron/entitlements.ts), plus the
 * numeric LS id the client never sees:
 *   - already entitled to AI and Cloud (any provider)   → already_entitled
 *     (also two separate AI + Cloud subscriptions: checked FIRST)
 *   - no active LS ai/cloud row with a valid id         → no_subscription
 *     (nothing entitled, or the one entitlement is a 'manual' comp)
 *   - more than one, all of the SAME product (e.g. two
 *     active LS 'ai' rows — a double purchase)          → multiple_subscriptions
 *   - exactly one                                       → ok
 */
export function pickUpgradeSubscription(rows: unknown): UpgradePick {
  const list = Array.isArray(rows) ? (rows as ChangePlanSubscriptionRow[]) : []
  let ai = false
  let cloud = false
  const candidates: Array<{ subscriptionId: string; product: 'ai' | 'cloud' }> = []
  for (const row of list) {
    if (!row || typeof row !== 'object' || row.status !== 'active') continue
    if (row.product === 'ai' || row.product === 'bundle') ai = true
    if (row.product === 'cloud' || row.product === 'bundle') cloud = true
    if (
      row.provider === BILLING_PROVIDER &&
      (row.product === 'ai' || row.product === 'cloud') &&
      isLemonSubscriptionId(row.provider_ref)
    ) {
      candidates.push({ subscriptionId: row.provider_ref, product: row.product })
    }
  }
  if (ai && cloud) return { kind: 'already_entitled' }
  if (candidates.length === 0) return { kind: 'no_subscription' }
  if (candidates.length > 1) return { kind: 'multiple_subscriptions' }
  return { kind: 'ok', ...candidates[0] }
}

/** The bits of a LS `GET/PATCH /v1/subscriptions/:id` answer this function reads. */
export function readLemonSubscription(
  json: unknown
): { variantId: string; status: string; cancelled: boolean } | null {
  const attributes = (json as { data?: { attributes?: Record<string, unknown> } } | null)?.data?.attributes
  if (!attributes || typeof attributes !== 'object') return null
  const rawVariant = attributes.variant_id
  const variantId =
    typeof rawVariant === 'number' && Number.isInteger(rawVariant)
      ? String(rawVariant)
      : typeof rawVariant === 'string' && /^\d+$/.test(rawVariant)
        ? rawVariant
        : null
  if (!variantId) return null
  return {
    variantId,
    status: typeof attributes.status === 'string' ? attributes.status : '',
    cancelled: attributes.cancelled === true,
  }
}

/**
 * JSON:API body of the plan change. `invoice_immediately: true` = prorate and
 * charge the difference now; prorations stay ON (no `disable_prorations`,
 * which would also override invoice_immediately and bill the full new price
 * from the next renewal without crediting the unused time).
 */
export function buildPlanChangeBody(subscriptionId: string, variantId: string): unknown {
  return {
    data: {
      type: 'subscriptions',
      id: subscriptionId,
      attributes: {
        variant_id: Number(variantId),
        invoice_immediately: true,
      },
    },
  }
}

function lemonHeaders(apiKey: string, withBody: boolean): Record<string, string> {
  return {
    Accept: 'application/vnd.api+json',
    ...(withBody ? { 'Content-Type': 'application/vnd.api+json' } : {}),
    Authorization: `Bearer ${apiKey}`,
  }
}

/**
 * The whole request: authenticate the caller, find their single upgradable
 * Lemon Squeezy subscription (service role, explicit user_id filter — never
 * anyone else's row), check it with LS and move it to the bundle variant of
 * the same interval. Never throws.
 */
export async function handleChangePlan(
  req: ChangePlanRequest,
  env: ChangePlanEnv,
  deps: ChangePlanDeps
): Promise<ChangePlanResponse> {
  const log = deps.log ?? (() => {})
  if (req.method !== 'POST') return fail(405, 'Method not allowed.', 'method_not_allowed')

  const { supabaseUrl, anonKey, serviceRoleKey, lemonApiKey } = env
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !lemonApiKey || !env.variantMap || !env.bundleUpgradeMap) {
    log(
      'billing-change-plan: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / LEMONSQUEEZY_API_KEY / ' +
        'LEMONSQUEEZY_VARIANT_MAP / LEMONSQUEEZY_BUNDLE_UPGRADE_MAP missing'
    )
    return fail(500, 'Plan changes are not configured.', 'not_configured')
  }
  let variantMap: Map<string, Product>
  let upgradeMap: Map<string, string>
  try {
    variantMap = parseVariantMap(env.variantMap)
    upgradeMap = parseBundleUpgradeMap(env.bundleUpgradeMap, variantMap)
  } catch (err) {
    log(`billing-change-plan: invalid variant config: ${String(err)}`)
    return fail(500, 'Plan changes are not configured.', 'not_configured')
  }

  const token = (req.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return fail(401, 'Missing NoteFlow session. Sign in from Settings → Subscription.', 'missing_token')

  // Only the Bundle is a supported target today.
  let plan: unknown
  try {
    plan = (JSON.parse(req.body || 'null') as { plan?: unknown } | null)?.plan
  } catch {
    plan = undefined
  }
  if (plan !== 'bundle') return fail(400, 'Only an upgrade to the Bundle is supported.', 'unsupported_plan')

  // ── Auth: resolve the caller's Supabase access token to a user id ──────────
  let userId: string | undefined
  try {
    const userRes = await deps.fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!userRes.ok) return fail(401, 'Invalid or expired NoteFlow session. Sign in again.', 'invalid_token')
    const user = (await userRes.json().catch(() => null)) as { id?: unknown } | null
    userId = typeof user?.id === 'string' && user.id ? user.id : undefined
  } catch (err) {
    log(`billing-change-plan: auth lookup failed: ${String(err)}`)
    return fail(502, 'Could not verify the NoteFlow session. Try again.', 'auth_unreachable')
  }
  if (!userId) return fail(401, 'Could not resolve the NoteFlow session.', 'invalid_token')

  // ── ALL of the caller's rows (service role + explicit user filter): a
  //    'manual' comp also counts towards "already entitled". ──────────────────
  let rows: unknown
  try {
    const rowsRes = await deps.fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}` +
        '&select=product,status,provider,provider_ref',
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    )
    if (!rowsRes.ok) {
      log(`billing-change-plan: subscriptions query failed (${rowsRes.status})`)
      return fail(500, 'Could not load the subscription. Try again.', 'query_failed')
    }
    rows = await rowsRes.json().catch(() => null)
  } catch (err) {
    log(`billing-change-plan: subscriptions query failed: ${String(err)}`)
    return fail(500, 'Could not load the subscription. Try again.', 'query_failed')
  }

  const pick = pickUpgradeSubscription(rows)
  if (pick.kind === 'already_entitled') {
    return fail(409, 'This account already has NoteFlow AI and NoteFlow Cloud.', 'already_entitled')
  }
  if (pick.kind === 'no_subscription') {
    return fail(404, 'No upgradable Lemon Squeezy subscription is linked to this account.', 'no_subscription')
  }
  if (pick.kind === 'multiple_subscriptions') {
    log(`billing-change-plan: user ${userId} has several active AI/Cloud subscriptions — not upgraded automatically`)
    return fail(409, 'This account has more than one subscription; contact support to merge them.', 'multiple_subscriptions')
  }
  const { subscriptionId } = pick

  // ── The subscription as Lemon Squeezy sees it NOW (the row may lag behind) ─
  let current: ReturnType<typeof readLemonSubscription>
  try {
    const lemonRes = await deps.fetch(`${LEMONSQUEEZY_API_BASE}/subscriptions/${subscriptionId}`, {
      headers: lemonHeaders(lemonApiKey, false),
      signal: AbortSignal.timeout(LEMONSQUEEZY_TIMEOUT_MS),
    })
    if (!lemonRes.ok) {
      log(`billing-change-plan: Lemon Squeezy answered ${lemonRes.status} for subscription ${subscriptionId}`)
      return fail(502, 'The billing provider could not load the subscription.', 'provider_error')
    }
    current = readLemonSubscription(await lemonRes.json().catch(() => null))
  } catch (err) {
    log(`billing-change-plan: Lemon Squeezy request failed: ${String(err)}`)
    return fail(502, 'Could not reach the billing provider. Try again.', 'provider_unreachable')
  }
  if (!current) {
    log(`billing-change-plan: unexpected Lemon Squeezy answer for subscription ${subscriptionId}`)
    return fail(502, 'The billing provider returned an unexpected answer.', 'provider_error')
  }

  // Already on the Bundle (retry / double click / webhook still in flight):
  // never patch twice.
  if (variantMap.get(current.variantId) === 'bundle') {
    return { status: 200, body: { ok: true, product: 'bundle', changed: false } }
  }

  // Only a plainly active, not-cancelled subscription is changed. A cancelled
  // one is still paid until ends_at (our row says 'active'), but changing its
  // plan would silently resume billing — the customer resumes it first.
  if (current.status !== 'active' || current.cancelled) {
    return fail(
      409,
      `The subscription is ${current.cancelled ? 'cancelled' : current.status || 'not active'}; resume it or fix the payment first.`,
      'subscription_not_active'
    )
  }

  const target = upgradeMap.get(current.variantId)
  if (!target) {
    log(
      `billing-change-plan: no bundle variant configured for variant ${current.variantId} ` +
        `(subscription ${subscriptionId}) — check LEMONSQUEEZY_BUNDLE_UPGRADE_MAP`
    )
    return fail(500, 'Plan changes are not configured for this plan.', 'not_configured')
  }

  // ── The plan change itself ─────────────────────────────────────────────────
  let changedTo: ReturnType<typeof readLemonSubscription>
  try {
    const patchRes = await deps.fetch(`${LEMONSQUEEZY_API_BASE}/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: lemonHeaders(lemonApiKey, true),
      body: JSON.stringify(buildPlanChangeBody(subscriptionId, target)),
      signal: AbortSignal.timeout(LEMONSQUEEZY_TIMEOUT_MS),
    })
    if (!patchRes.ok) {
      const detail = await patchRes.text().catch(() => '')
      log(
        `billing-change-plan: Lemon Squeezy refused the plan change of subscription ${subscriptionId} ` +
          `(${patchRes.status}): ${detail.slice(0, 500)}`
      )
      return fail(502, 'The billing provider refused the plan change.', 'provider_error')
    }
    changedTo = readLemonSubscription(await patchRes.json().catch(() => null))
  } catch (err) {
    // Unknown outcome (e.g. a timeout after LS applied it): a retry is safe —
    // the GET above then sees the bundle variant and answers changed:false.
    log(`billing-change-plan: plan change request failed for subscription ${subscriptionId}: ${String(err)}`)
    return fail(502, 'Could not reach the billing provider. Try again.', 'provider_unreachable')
  }
  // A 2xx whose body can't be read (changedTo === null) still counts as
  // success: LS accepted the PATCH, and the entitlement is only ever granted by
  // the webhook event LS sends for the change — nothing is assumed here. If it
  // did not actually apply, a retry goes through the idempotent GET above
  // (bundle variant → changed:false; old variant → patched again).
  if (changedTo && changedTo.variantId !== target) {
    log(
      `billing-change-plan: Lemon Squeezy accepted the change of subscription ${subscriptionId} but reports ` +
        `variant ${changedTo.variantId} (expected ${target})`
    )
    return fail(502, 'The billing provider did not apply the plan change.', 'provider_error')
  }
  return { status: 200, body: { ok: true, product: 'bundle', changed: true } }
}
