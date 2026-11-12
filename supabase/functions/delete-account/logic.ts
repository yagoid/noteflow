// Pure, runtime-agnostic logic for the delete-account Edge Function. Uses ONLY
// standard Web/JS APIs (fetch, URL, AbortSignal) — no Deno.*, no Buffer — so it
// runs unchanged in the Edge Function (Deno) and under vitest on Node. The
// network is injected (`deps.fetch`), so the whole request flow is testable.
// Covered by tests/supabase/delete-account.test.ts. Same philosophy as the
// other functions' logic.ts (billing-portal is the closest sibling).
//
// What it does: deletes the caller's NoteFlow account for good (in-app
// "Delete account" — required by Google Play for apps that create accounts).
// In this order, so that a failure never leaves the user paying for an account
// that no longer exists:
//
//   1. Resolve the caller from their Supabase access token (/auth/v1/user).
//   2. Cancel every Lemon Squeezy subscription of theirs that LS still bills
//      (operator API key). If ANY can't be confirmed cancelled → 502
//      `billing_cancel_failed` and NOTHING has been deleted.
//   3. Delete their server data, table by table (service role, explicit
//      user_id filter): USER_DATA_TABLES below.
//   4. Delete the auth user (GoTrue admin API, service role). Every user table
//      also has `on delete cascade` to auth.users, so this is a second net.
//
// A subscription LS does not know (404) also fails with billing_cancel_failed
// (wrong-mode API key or leftover test row — never delete on a guess).
// Safe on retry: a cancelled LS subscription is skipped, the deletes are
// no-ops once the rows are gone, and an auth user that is already gone (404 on
// the admin delete, or `user_not_found` when resolving the token) is reported
// as success.
//
// NOT deleted (by design): public.feedback rows — `on delete set null`, they
// stay as anonymous reports (migration 0015); the Lemon Squeezy customer and
// order history (Merchant of Record — tax/accounting records live there); and
// the notes on the user's own devices (never stored by us).

export interface DeleteAccountEnv {
  supabaseUrl?: string
  anonKey?: string
  serviceRoleKey?: string
  lemonApiKey?: string
}

export interface DeleteAccountRequest {
  method: string
  /** Raw `Authorization` header (expected: `Bearer <Supabase access token>`). */
  authorization: string | null
}

export interface DeleteAccountDeps {
  fetch: typeof fetch
  /** Operator-facing diagnostics (console.error in the Edge Function). */
  log?: (message: string) => void
}

export type DeleteAccountErrorCode =
  | 'method_not_allowed'
  | 'not_configured'
  | 'missing_token'
  | 'invalid_token'
  | 'auth_unreachable'
  | 'query_failed'
  | 'billing_cancel_failed'
  | 'delete_failed'

export interface DeleteAccountResponse {
  status: number
  body: { ok: true } | { error: DeleteAccountErrorCode; message: string }
}

export const LEMONSQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1'
const LEMONSQUEEZY_TIMEOUT_MS = 10_000

/**
 * Every public table holding the user's rows, in deletion order. Each one
 * references auth.users(id) ON DELETE CASCADE (pinned against the migrations
 * by tests/supabase/delete-account.test.ts — a new user table must be added
 * here, or the test fails). `subscriptions` goes last so a failure halfway
 * still leaves the billing link visible to the operator.
 */
export const USER_DATA_TABLES = ['files', 'user_keys', 'usage_events', 'subscriptions'] as const

/**
 * Lemon Squeezy statuses after which LS will never charge again — nothing to
 * cancel. Anything else (on_trial, active, paused, past_due, unpaid, or a
 * status LS adds later) is cancelled.
 */
const LEMON_FINAL_STATUSES = new Set(['cancelled', 'expired'])

/** Our subscriptions.status values for which the entitlement is still live. */
const LIVE_ROW_STATUSES = new Set(['active', 'past_due'])

/** Lemon Squeezy subscription ids are numeric; anything else never reaches the API path. */
export function isLemonSubscriptionId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,20}$/.test(value)
}

export interface AccountSubscriptionRow {
  status?: unknown
  provider?: unknown
  provider_ref?: unknown
}

/**
 * The Lemon Squeezy subscriptions to check, from the caller's subscription
 * rows: every `provider='lemonsqueezy'` row, whatever OUR status says (a fully
 * refunded row is 'expired' here while LS keeps billing until someone cancels
 * it — see supabase/README.md § 5), deduplicated by id. Rows of other
 * providers (the operator's `manual` comps) have nothing to cancel.
 * `invalid` counts live LS rows whose id is unusable: they can't be checked,
 * so the deletion must not go ahead.
 */
export function lemonCancelTargets(rows: unknown): { targets: string[]; invalid: number } {
  const refs = new Set<string>()
  let invalid = 0
  if (!Array.isArray(rows)) return { targets: [], invalid }
  for (const raw of rows as AccountSubscriptionRow[]) {
    if (!raw || typeof raw !== 'object' || raw.provider !== 'lemonsqueezy') continue
    if (!isLemonSubscriptionId(raw.provider_ref)) {
      if (typeof raw.status === 'string' && LIVE_ROW_STATUSES.has(raw.status)) invalid++
      continue
    }
    refs.add(raw.provider_ref)
  }
  return { targets: [...refs], invalid }
}

/** `data.attributes.status` of a LS subscription document, or '' when absent. */
export function lemonSubscriptionStatus(json: unknown): string {
  const status = (json as { data?: { attributes?: { status?: unknown } } } | null)?.data?.attributes?.status
  return typeof status === 'string' ? status : ''
}

/** True when GoTrue says the token's user no longer exists (already deleted). */
export function isUserNotFound(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false
  const body = json as { code?: unknown; error_code?: unknown }
  return body.code === 'user_not_found' || body.error_code === 'user_not_found'
}

function fail(status: number, error: DeleteAccountErrorCode, message: string): DeleteAccountResponse {
  return { status, body: { error, message } }
}

const OK: DeleteAccountResponse = { status: 200, body: { ok: true } }

type CancelOutcome = 'cancelled' | 'already_final' | 'not_found'

/**
 * Makes sure LS will not bill subscription `ref` again: reads it and, unless it
 * is already cancelled/expired, cancels it (`DELETE /v1/subscriptions/:id`,
 * which LS turns into status `cancelled` — no further charges; the paid
 * period simply runs out). Throws on anything that doesn't prove that.
 */
async function ensureLemonCancelled(
  ref: string,
  lemonApiKey: string,
  deps: DeleteAccountDeps
): Promise<CancelOutcome> {
  const url = `${LEMONSQUEEZY_API_BASE}/subscriptions/${ref}`
  const headers = { Accept: 'application/vnd.api+json', Authorization: `Bearer ${lemonApiKey}` }

  const getRes = await deps.fetch(url, { headers, signal: AbortSignal.timeout(LEMONSQUEEZY_TIMEOUT_MS) })
  if (getRes.status === 404) return 'not_found'
  if (!getRes.ok) throw new Error(`GET answered ${getRes.status}`)
  const current = lemonSubscriptionStatus(await getRes.json().catch(() => null))
  if (!current) throw new Error('GET returned no subscription status')
  if (LEMON_FINAL_STATUSES.has(current)) return 'already_final'

  const delRes = await deps.fetch(url, {
    method: 'DELETE',
    headers,
    signal: AbortSignal.timeout(LEMONSQUEEZY_TIMEOUT_MS),
  })
  if (!delRes.ok) throw new Error(`DELETE answered ${delRes.status} (status was ${current})`)
  const after = lemonSubscriptionStatus(await delRes.json().catch(() => null))
  if (after && !LEMON_FINAL_STATUSES.has(after)) {
    throw new Error(`DELETE left the subscription in status ${after}`)
  }
  return 'cancelled'
}

/**
 * The whole request. Never throws. See the header for the order of the steps
 * and why.
 */
export async function handleDeleteAccount(
  req: DeleteAccountRequest,
  env: DeleteAccountEnv,
  deps: DeleteAccountDeps
): Promise<DeleteAccountResponse> {
  const log = deps.log ?? (() => {})
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Method not allowed.')

  const { supabaseUrl, anonKey, serviceRoleKey, lemonApiKey } = env
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !lemonApiKey) {
    log('delete-account: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / LEMONSQUEEZY_API_KEY missing')
    return fail(500, 'not_configured', 'Account deletion is not configured.')
  }

  // ── 1. Auth: resolve the caller's Supabase access token to a user id ───────
  const token = (req.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return fail(401, 'missing_token', 'Missing NoteFlow session. Sign in again.')

  let userId: string | undefined
  try {
    const userRes = await deps.fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!userRes.ok) {
      // A retry after a deletion whose answer never reached the app: the token
      // is still well-formed, but its user is gone. That IS the outcome asked for.
      if (userRes.status < 500 && isUserNotFound(await userRes.json().catch(() => null))) {
        log('delete-account: token user no longer exists — treating as already deleted')
        return OK
      }
      if (userRes.status >= 500) {
        log(`delete-account: auth lookup answered ${userRes.status}`)
        return fail(500, 'auth_unreachable', 'Could not verify the NoteFlow session. Try again.')
      }
      return fail(401, 'invalid_token', 'Invalid or expired NoteFlow session. Sign in again.')
    }
    const user = (await userRes.json().catch(() => null)) as { id?: unknown } | null
    userId = typeof user?.id === 'string' && user.id ? user.id : undefined
  } catch (err) {
    log(`delete-account: auth lookup failed: ${String(err)}`)
    return fail(500, 'auth_unreachable', 'Could not verify the NoteFlow session. Try again.')
  }
  if (!userId) return fail(401, 'invalid_token', 'Could not resolve the NoteFlow session.')
  const userFilter = `user_id=eq.${encodeURIComponent(userId)}`
  const service = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }

  // ── 2. Cancel billing first: nothing is deleted unless this succeeds ───────
  let rows: unknown
  try {
    const rowsRes = await deps.fetch(
      `${supabaseUrl}/rest/v1/subscriptions?${userFilter}&select=status,provider,provider_ref`,
      { headers: service }
    )
    if (!rowsRes.ok) {
      log(`delete-account: subscriptions query failed (${rowsRes.status})`)
      return fail(500, 'query_failed', 'Could not load the subscription. Nothing was deleted. Try again.')
    }
    rows = await rowsRes.json().catch(() => undefined)
  } catch (err) {
    log(`delete-account: subscriptions query failed: ${String(err)}`)
    return fail(500, 'query_failed', 'Could not load the subscription. Nothing was deleted. Try again.')
  }
  if (!Array.isArray(rows)) {
    log('delete-account: subscriptions query returned a non-array body')
    return fail(500, 'query_failed', 'Could not load the subscription. Nothing was deleted. Try again.')
  }

  const billingFailed = () =>
    fail(
      502,
      'billing_cancel_failed',
      'Your subscription could not be cancelled, so nothing was deleted. Try again, or contact support.'
    )
  const { targets, invalid } = lemonCancelTargets(rows)
  if (invalid > 0) {
    log(`delete-account: user ${userId} has ${invalid} live Lemon Squeezy row(s) without a usable subscription id`)
    return billingFailed()
  }
  for (const ref of targets) {
    let outcome: CancelOutcome
    try {
      outcome = await ensureLemonCancelled(ref, lemonApiKey, deps)
    } catch (err) {
      log(`delete-account: could not cancel Lemon Squeezy subscription ${ref}: ${String(err)}`)
      return billingFailed()
    }
    if (outcome === 'not_found') {
      // LS (with THIS key) does not know the subscription: a wrong-mode key,
      // or a leftover test-mode row the operator must clean up. Even an
      // 'expired' row can still be billing in LS (a full refund expires it
      // here without cancelling it there), so refuse rather than guess.
      log(`delete-account: subscription ${ref} not found in Lemon Squeezy (test-mode row or wrong API key?)`)
      return billingFailed()
    }
    if (outcome === 'cancelled') {
      log(`delete-account: cancelled Lemon Squeezy subscription ${ref} for user ${userId}`)
    }
  }

  // ── 3. Server data, table by table (service role + explicit user filter) ───
  for (const table of USER_DATA_TABLES) {
    try {
      const res = await deps.fetch(`${supabaseUrl}/rest/v1/${table}?${userFilter}`, {
        method: 'DELETE',
        headers: { ...service, Prefer: 'return=minimal' },
      })
      if (!res.ok) {
        log(`delete-account: deleting ${table} for user ${userId} failed (${res.status})`)
        return fail(500, 'delete_failed', 'Could not delete the account data. Try again.')
      }
    } catch (err) {
      log(`delete-account: deleting ${table} for user ${userId} failed: ${String(err)}`)
      return fail(500, 'delete_failed', 'Could not delete the account data. Try again.')
    }
  }

  // ── 4. The auth user itself (GoTrue admin API) ─────────────────────────────
  try {
    const res = await deps.fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: service,
    })
    // 404: already gone (a concurrent request won the race) — same outcome.
    if (!res.ok && res.status !== 404) {
      log(`delete-account: admin delete of user ${userId} failed (${res.status})`)
      return fail(500, 'delete_failed', 'Could not delete the account. Try again.')
    }
  } catch (err) {
    log(`delete-account: admin delete of user ${userId} failed: ${String(err)}`)
    return fail(500, 'delete_failed', 'Could not delete the account. Try again.')
  }

  log(`delete-account: deleted user ${userId}`)
  return OK
}
