// Supabase Edge Function: NoteFlow AI proxy (managed LLM plan).
// Zero external dependencies (fetch + Web Streams only — same philosophy as
// billing-webhook). All testable logic lives in ./logic.ts; this file is just
// the Deno glue: env, HTTP routing, Supabase REST calls and stream plumbing.
//
// OpenAI-compatible surface (the client's `noteflow` preset points its
// baseUrl at .../functions/v1/ai-proxy and reuses OpenAiCompatibleProvider),
// plus one NoteFlow-specific endpoint:
//   POST <fn>/chat/completions   → auth + entitlement + body cap + validation
//                                  + reservation (quota + concurrency) →
//                                  OpenRouter → settle
//   GET  <fn>/models             → auth + entitlement → curated model list
//   GET  <fn>/usage              → auth only → { used, limit } monthly quota
//                                  (no entitlement gate: showing consumption is
//                                  harmless and useful after expiration)
//
// Auth: `Authorization: Bearer <Supabase access token>` — the user JWT the
// desktop app mints from its account session. Deploy WITH JWT verification
// (the default; no --no-verify-jwt): the gateway pre-validates the JWT, and we
// still resolve it to a user id via /auth/v1/user below.
//
// Metering = reserve → forward → settle (migration 0009). BEFORE forwarding,
// the RPC reserve_ai_usage inserts a `pending` usage_events row charged with an
// ESTIMATE of the request's weighted cost (estimateReservationTokens: input
// ≈ body bytes/4 with images at a flat rate + the clamped max_tokens), under a
// per-user advisory lock that also enforces the monthly quota and a cap on
// simultaneous in-flight requests — so parallel requests can no longer all
// pass a stale check. The forwarded body carries `usage: {include: true}`, so
// the final SSE chunk (or the JSON response) includes the real token usage
// and its cost; the response stream is tee'd, scanned for that block, and the
// reservation is SETTLED (PATCH) to the real numbers when it ends. If no usage
// ever arrives (runtime killed the isolate at its wall clock, upstream cut…)
// the reservation STANDS: the estimate stays charged — that is the point. An
// upstream that fails before generating (fetch throws / non-OK status) did not
// bill, so the reservation is RELEASED (settled to 0). The row carries the REAL
// tokens + cost (operator accounting) and the WEIGHTED quota_tokens (per-model
// multiplier — what the monthly quota counts; see MODEL_QUOTA_MULTIPLIERS).
//
// Env (set via `supabase secrets set`, except the SUPABASE_* ones which the
// platform injects automatically):
//   OPENROUTER_API_KEY   upstream key (the only one; secret)
//   AI_MONTHLY_TOKENS    optional per-user monthly budget in weighted quota
//                        tokens (default 3,000,000)
//   AI_ALLOWED_MODELS    optional comma-separated model allowlist override
//   AI_MAX_INFLIGHT      optional cap on simultaneous requests per user
//                        (default 3)
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  injected

import {
  parseAllowedModels,
  parseMonthlyTokens,
  parseMaxInflight,
  isModelAllowed,
  hasAiEntitlement,
  openAiErrorBody,
  modelsListBody,
  buildUpstreamBody,
  estimateReservationTokens,
  isDeclaredBodyTooLarge,
  readBodyWithLimit,
  parseReserveResult,
  extractUsageFromJson,
  extractGenerationId,
  parseGenerationStats,
  createSseUsageScanner,
  computeQuotaTokens,
  mapUpstreamError,
  MAX_BODY_BYTES,
  RESERVATION_STALE_MINUTES,
  type TokenUsage,
  type ReserveResult,
} from './logic.ts'

// Minimal surface of the globals we use (this file is deployed to Deno; it is
// excluded from the repo's tsc builds, which know nothing about Deno).
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
// Supabase Edge Runtime background-task hook: keeps the isolate alive until
// the promise settles (the settle happens AFTER the response stream ends).
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_GENERATION_URL = 'https://openrouter.ai/api/v1/generation'
// A generation takes a moment to become queryable on /generation (404 until
// then): first attempt after 1.5 s, one retry 3 s later.
const GENERATION_LOOKUP_DELAYS_MS = [1_500, 3_000]

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function serviceHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Settles a reservation row to its final numbers (pending=false). `usage` null
 * = RELEASE (the upstream never billed): 0 tokens / 0 quota. We release by
 * settling to zero rather than deleting so the failed attempt stays auditable
 * (per-user/model upstream failure counts) through the same single code path.
 * Best-effort: a failure here must never break an already-served response —
 * the row just keeps its (pending) estimate, i.e. errs against the user, and
 * the error is logged for the operator.
 */
async function settleReservation(
  supabaseUrl: string,
  serviceRoleKey: string,
  reservationId: number,
  model: string,
  usage: TokenUsage | null,
  generationId: string | null
): Promise<void> {
  const final = usage ?? { tokensIn: 0, tokensOut: 0, cost: null }
  try {
    // pending=eq.true: a reservation can only be settled once, by construction
    // (a second PATCH matches no row and is a harmless no-op).
    const res = await fetch(`${supabaseUrl}/rest/v1/usage_events?id=eq.${reservationId}&pending=eq.true`, {
      method: 'PATCH',
      headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({
        tokens_in: Math.max(0, Math.round(final.tokensIn)),
        tokens_out: Math.max(0, Math.round(final.tokensOut)),
        // Weighted tokens the monthly quota counts (per-model multiplier).
        quota_tokens: computeQuotaTokens(final, model),
        cost_usd: final.cost,
        generation_id: generationId,
        pending: false,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`ai-proxy: settle of reservation ${reservationId} failed (${res.status}): ${detail}`)
    }
  } catch (err) {
    console.error(`ai-proxy: settle of reservation ${reservationId} failed:`, err)
  }
}

/**
 * Best-effort fallback when a response ended WITHOUT a usage block but we know
 * its generation id: ask OpenRouter's /generation endpoint what it billed.
 * Only helps when the isolate is still alive (upstream cut mid-stream, usage
 * chunk lost…); when the runtime kills the isolate at its wall clock nothing
 * here runs — that case is what the reservation covers.
 */
async function lookupGeneration(generationId: string, openrouterKey: string): Promise<TokenUsage | null> {
  for (const delayMs of GENERATION_LOOKUP_DELAYS_MS) {
    await sleep(delayMs)
    try {
      const res = await fetch(`${OPENROUTER_GENERATION_URL}?id=${encodeURIComponent(generationId)}`, {
        headers: { Authorization: `Bearer ${openrouterKey}` },
      })
      if (res.ok) {
        const usage = parseGenerationStats(await res.json().catch(() => null))
        if (usage) return usage
      } else if (res.status !== 404) {
        console.error(`ai-proxy: generation lookup ${generationId} failed (${res.status})`)
      }
    } catch (err) {
      console.error(`ai-proxy: generation lookup ${generationId} failed:`, err)
    }
  }
  return null
}

/**
 * Final metering of a forwarded request: settle with the inline usage, else
 * with the /generation lookup, else leave the reservation standing (pending,
 * estimate charged) and log it.
 */
async function finishMetering(
  supabaseUrl: string,
  serviceRoleKey: string,
  openrouterKey: string,
  reservationId: number,
  model: string,
  usage: TokenUsage | null,
  generationId: string | null
): Promise<void> {
  let final = usage
  if (!final && generationId) final = await lookupGeneration(generationId, openrouterKey)
  if (final) {
    await settleReservation(supabaseUrl, serviceRoleKey, reservationId, model, final, generationId)
    return
  }
  console.error(
    `ai-proxy: no usage for reservation ${reservationId} (generation ${generationId ?? 'unknown'}); ` +
      'the reservation stands (estimate stays charged)'
  )
}

/**
 * Weighted quota tokens the user consumed this month (RPC get_month_usage,
 * which sums usage_events.quota_tokens — pending reservations included — since
 * migration 0007). Null on failure.
 */
async function fetchMonthUsage(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<number | null> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_month_usage`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({ p_user_id: userId }),
  })
  if (!res.ok) {
    console.error(`ai-proxy: get_month_usage failed (${res.status})`)
    return null
  }
  return Number(await res.json().catch(() => 0)) || 0
}

/**
 * RPC reserve_ai_usage (migration 0009): atomically checks quota + concurrency
 * under a per-user advisory lock and inserts the pending reservation row.
 * Null on any failure (transport, non-OK, malformed answer).
 */
async function reserveUsage(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  model: string,
  quotaTokens: number,
  limit: number,
  maxInflight: number
): Promise<ReserveResult | null> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_ai_usage`, {
      method: 'POST',
      headers: serviceHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_user_id: userId,
        p_model: model,
        p_quota_tokens: quotaTokens,
        p_limit: limit,
        p_max_inflight: maxInflight,
        p_stale_minutes: RESERVATION_STALE_MINUTES,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`ai-proxy: reserve_ai_usage failed (${res.status}): ${detail}`)
      return null
    }
    const result = parseReserveResult(await res.json().catch(() => null))
    if (!result) console.error('ai-proxy: reserve_ai_usage returned a malformed result')
    return result
  } catch (err) {
    console.error('ai-proxy: reserve_ai_usage failed:', err)
    return null
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pathname = new URL(req.url).pathname
  const isModels = req.method === 'GET' && pathname.endsWith('/models')
  const isChat = req.method === 'POST' && pathname.endsWith('/chat/completions')
  const isUsage = req.method === 'GET' && pathname.endsWith('/usage')
  if (!isModels && !isChat && !isUsage) {
    return json(404, openAiErrorBody('Not found.', 'invalid_request_error', 'not_found'))
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('ai-proxy: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY missing')
    return json(500, openAiErrorBody('NoteFlow AI is not configured.', 'server_error', 'not_configured'))
  }

  // ── Auth: resolve the caller's Supabase access token to a user id ──────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json(
      401,
      openAiErrorBody('Missing NoteFlow session. Sign in from Settings → Account.', 'authentication_error', 'missing_token')
    )
  }
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  if (!userRes.ok) {
    return json(
      401,
      openAiErrorBody('Invalid or expired NoteFlow session. Sign in again from Settings → Account.', 'authentication_error', 'invalid_token')
    )
  }
  const user = (await userRes.json().catch(() => null)) as { id?: string } | null
  const userId = user?.id
  if (!userId) {
    return json(401, openAiErrorBody('Could not resolve the NoteFlow session.', 'authentication_error', 'invalid_token'))
  }

  // ── GET /usage: monthly consumption, auth only. Deliberately NOT gated on
  //    the entitlement — showing usage is harmless and stays useful after the
  //    subscription lapses (e.g. the Settings card explaining what happened). ──
  if (isUsage) {
    const used = await fetchMonthUsage(supabaseUrl, serviceRoleKey, userId)
    if (used === null) {
      return json(500, openAiErrorBody('Could not read your usage. Try again.', 'server_error', 'usage_check_failed'))
    }
    return json(200, { used, limit: parseMonthlyTokens(Deno.env.get('AI_MONTHLY_TOKENS')) })
  }

  // ── Entitlement: 'ai' or 'bundle' active (service role query, RLS bypassed,
  //    hence the explicit user_id filter) ──────────────────────────────────────
  const subsRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=product,status`,
    { headers: serviceHeaders(serviceRoleKey) }
  )
  if (!subsRes.ok) {
    console.error(`ai-proxy: subscriptions query failed (${subsRes.status})`)
    return json(500, openAiErrorBody('Could not check your subscription. Try again.', 'server_error', 'subscription_check_failed'))
  }
  if (!hasAiEntitlement(await subsRes.json().catch(() => null))) {
    return json(
      403,
      openAiErrorBody(
        'NoteFlow AI requires an active subscription. Manage your plan in Settings → Account.',
        'permission_error',
        'subscription_required'
      )
    )
  }

  const allowedModels = parseAllowedModels(Deno.env.get('AI_ALLOWED_MODELS'))
  if (isModels) return json(200, modelsListBody(allowedModels))

  // ── Read the body with a hard size cap. Content-Length is checked first
  //    (cheap early reject) but not trusted: the stream itself is counted. ────
  const tooLarge = () =>
    json(
      413,
      openAiErrorBody(
        `Request too large for NoteFlow AI (max ${Math.round(MAX_BODY_BYTES / (1024 * 1024))} MB). Remove some attachments or start a new chat.`,
        'invalid_request_error',
        'request_too_large'
      )
    )
  if (isDeclaredBodyTooLarge(req.headers.get('Content-Length'), MAX_BODY_BYTES)) return tooLarge()
  let rawBody: string
  try {
    const read = await readBodyWithLimit(req.body, MAX_BODY_BYTES)
    if (!read.ok) return tooLarge()
    rawBody = read.text
  } catch {
    return json(400, openAiErrorBody('Could not read the request body.', 'invalid_request_error', 'invalid_body'))
  }

  // ── Validate the request body and model ─────────────────────────────────────
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return json(400, openAiErrorBody('Invalid JSON body.', 'invalid_request_error', 'invalid_body'))
  }
  if (!isModelAllowed(body.model, allowedModels)) {
    return json(
      400,
      openAiErrorBody(
        `Model "${String(body.model)}" is not available on NoteFlow AI. Available models: ${allowedModels.join(', ')}.`,
        'invalid_request_error',
        'model_not_allowed'
      )
    )
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json(400, openAiErrorBody('`messages` must be a non-empty array.', 'invalid_request_error', 'invalid_body'))
  }
  const model = String(body.model)

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!openrouterKey) {
    console.error('ai-proxy: OPENROUTER_API_KEY is not set')
    return json(500, openAiErrorBody('NoteFlow AI is not configured.', 'server_error', 'not_configured'))
  }

  // ── Reserve: quota + concurrency check and pending row, atomically ─────────
  const upstreamBody = buildUpstreamBody(body)
  const limit = parseMonthlyTokens(Deno.env.get('AI_MONTHLY_TOKENS'))
  const reservation = await reserveUsage(
    supabaseUrl,
    serviceRoleKey,
    userId,
    model,
    estimateReservationTokens(upstreamBody, model),
    limit,
    parseMaxInflight(Deno.env.get('AI_MAX_INFLIGHT'))
  )
  if (!reservation) {
    return json(500, openAiErrorBody('Could not check your usage quota. Try again.', 'server_error', 'quota_check_failed'))
  }
  const quotaHeaders = {
    'X-NoteFlow-Tokens-Used': String(reservation.used),
    'X-NoteFlow-Tokens-Limit': String(limit),
  }
  if (!reservation.ok) {
    if (reservation.reason === 'quota') {
      return json(
        429,
        openAiErrorBody(
          'Your NoteFlow AI monthly quota is exceeded. It resets on the 1st of next month.',
          'quota_error',
          'monthly_quota_exceeded'
        ),
        quotaHeaders
      )
    }
    return json(
      429,
      openAiErrorBody(
        'Too many NoteFlow AI requests in progress. Wait for the current answers to finish and try again.',
        'rate_limit_error',
        'too_many_concurrent_requests'
      ),
      quotaHeaders
    )
  }
  const reservationId = reservation.id

  // ── Forward to OpenRouter (allowlisted body, clamped max_tokens, usage on) ─
  let upstream: Response
  try {
    upstream = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        // Courtesy attribution headers (OpenRouter leaderboards/analytics).
        'HTTP-Referer': 'https://yagoid.github.io/noteflow',
        'X-Title': 'NoteFlow',
      },
      body: JSON.stringify(upstreamBody),
    })
  } catch (err) {
    // Never reached OpenRouter (or no answer) → nothing billed → release.
    console.error('ai-proxy: upstream fetch failed:', err)
    await settleReservation(supabaseUrl, serviceRoleKey, reservationId, model, null, null)
    const mapped = mapUpstreamError(502, '')
    return json(mapped.status, mapped.body, quotaHeaders)
  }

  if (!upstream.ok) {
    // OpenRouter rejected the request before generating → it did not bill →
    // release. The raw detail is logged, never relayed (see mapUpstreamError).
    const detail = await upstream.text().catch(() => '')
    const mapped = mapUpstreamError(upstream.status, detail)
    if (mapped.outOfCredit) console.error(`ai-proxy: OPENROUTER OUT OF CREDIT (402): ${detail}`)
    else console.error(`ai-proxy: upstream error (${upstream.status}): ${detail}`)
    await settleReservation(supabaseUrl, serviceRoleKey, reservationId, model, null, null)
    return json(mapped.status, mapped.body, quotaHeaders)
  }

  // ── Non-streaming: read, settle, return ─────────────────────────────────────
  if (!body.stream) {
    const payload: unknown = await upstream.json().catch(() => null)
    if (payload === null) {
      // Status was OK, so OpenRouter most likely billed: the reservation stands.
      console.error(`ai-proxy: invalid upstream JSON; reservation ${reservationId} stands`)
      return json(502, openAiErrorBody('Invalid upstream response.', 'server_error', 'upstream_error'), quotaHeaders)
    }
    await finishMetering(
      supabaseUrl,
      serviceRoleKey,
      openrouterKey,
      reservationId,
      model,
      extractUsageFromJson(payload),
      extractGenerationId(payload)
    )
    return json(200, payload, quotaHeaders)
  }

  // ── Streaming: passthrough one branch of the tee, meter the other ───────────
  if (!upstream.body) {
    // OK status but no stream: treat as "nothing generated" → release.
    await settleReservation(supabaseUrl, serviceRoleKey, reservationId, model, null, null)
    return json(502, openAiErrorBody('Upstream returned no stream.', 'server_error', 'upstream_error'), quotaHeaders)
  }
  const [clientBranch, meterBranch] = upstream.body.tee()

  const metering = (async () => {
    const scanner = createSseUsageScanner()
    const reader = meterBranch.getReader()
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        scanner.push(decoder.decode(value, { stream: true }))
      }
    } catch (err) {
      // Upstream cut — settle with whatever we saw so far (or the lookup).
      // A client abort does NOT land here: cancelling one tee branch leaves
      // the other (and the upstream) running, so the usage chunk still comes.
      console.error('ai-proxy: metering stream error:', err)
    }
    const { usage, generationId } = scanner.end()
    await finishMetering(supabaseUrl, serviceRoleKey, openrouterKey, reservationId, model, usage, generationId)
  })()
  // Keep the isolate alive until the settle lands (best-effort otherwise).
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(metering)
  else metering.catch(() => {})

  return new Response(clientBranch, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...quotaHeaders,
    },
  })
})
