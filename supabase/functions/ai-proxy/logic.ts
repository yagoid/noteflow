// Pure, runtime-agnostic logic for the NoteFlow AI proxy (managed LLM plan).
// Deliberately uses ONLY standard Web/JS APIs — no Deno.* — so it runs
// unchanged in the Edge Function (Deno) and under vitest on Node. Covered by
// tests/supabase/ai-proxy.test.ts. Same philosophy as billing-webhook/logic.ts.

// ── Model catalog ─────────────────────────────────────────────────────────────
// The catalog of the managed plan (which models it serves, their list price,
// their reasoning effort, which accept images, which one is recommended, and
// which retired ids map to a successor) lives in the public.ai_models table
// (migrations 0012 + 0013) — adding a model is inserting a row: no redeploy, no
// app release. index.ts reads it with a short in-memory cache (catalogFromRows
// turns the enabled rows into a ModelCatalog, aliasEdgesFromRows collects the
// `replaced_by` edges) and falls back to FALLBACK_MODEL_CATALOG /
// FALLBACK_MODEL_ALIASES when the table is unreachable or has no usable row.
// The catalog drives everything model-related: the allowlist of
// POST /chat/completions (plus the alias rewrite), the prices the reservation
// is estimated with, the reasoning effort injected upstream, and GET /models,
// whose body (modelsListBody) is what the desktop client caches as ITS catalog.

/** Reasoning effort levels the proxy may inject (the ai_models CHECK constraint). */
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

/** One model of the managed plan's catalog. */
export interface CatalogModel {
  /** OpenRouter model id. */
  id: string
  /** Native vision support (the client gates image attachments on it). */
  images: boolean
  /**
   * OpenRouter LIST price in USD per 1M input / output tokens. Only used to
   * ESTIMATE a request (the reservation) and as the fallback cost when the
   * upstream reports tokens but no `usage.cost`; the real charge is
   * OpenRouter's `usage.cost` (which already includes reasoning tokens, cache
   * discounts and peak-hour surcharges).
   */
  priceInUsd: number
  priceOutUsd: number
  /**
   * Reasoning effort the proxy INJECTS upstream (`reasoning: { effort }`) —
   * server-controlled only, the client's own `reasoning` is always dropped.
   * Null = send nothing (the model's default).
   */
  reasoningEffort: ReasoningEffort | null
  /** Highlighted in the client's picker; the reference model of cost_index. */
  recommended: boolean
}

/** Ordered catalog — the first entry is the client's default model. */
export type ModelCatalog = readonly CatalogModel[]

/** Retired model id → successor id (`replaced_by` edges, or resolved aliases). */
export type ModelAliases = Readonly<Record<string, string>>

/**
 * BACKUP catalog, used only when public.ai_models cannot be read or has no
 * enabled usable row. Mirrors the seed of migration 0013 (same ids, order,
 * prices, efforts, vision and recommended flags) and the client's own fallback
 * (NOTEFLOW_AI_MODELS + NOTEFLOW_AI_MODEL_META in electron/ai/llm/presets.ts)
 * — tests/supabase/ai-catalog-mirror.test.ts pins the three together. It is a
 * safety net, NOT where the catalog is managed: new models go into the table.
 * All curated models MUST support tool calling (the NoteFlow chat is agentic).
 * Prices: OpenRouter list prices (USD / 1M tokens) on 2026-10-24.
 */
export const FALLBACK_MODEL_CATALOG: ModelCatalog = [
  // Recommended default. Weekday peak hours bill ×2 — usage.cost reflects it.
  { id: 'deepseek/deepseek-v4.1-flash-1017', images: true, priceInUsd: 0.15, priceOutUsd: 0.6, reasoningEffort: null, recommended: true },
  { id: 'openai/gpt-5.6-luna', images: true, priceInUsd: 0.2, priceOutUsd: 1.2, reasoningEffort: null, recommended: false },
  { id: 'anthropic/claude-haiku-5.5', images: true, priceInUsd: 0.1, priceOutUsd: 0.5, reasoningEffort: null, recommended: false },
  { id: 'xiaomi/mimo-v2.6-pro', images: true, priceInUsd: 0.435, priceOutUsd: 0.87, reasoningEffort: null, recommended: false },
  // The smartest — and by far the priciest — model: spends the allowance fastest.
  { id: 'openai/gpt-5.6-sol', images: true, priceInUsd: 4, priceOutUsd: 20, reasoningEffort: 'low', recommended: false },
]

/**
 * BACKUP alias edges (retired id → successor), mirroring the `replaced_by`
 * updates of migration 0013. They keep internal/QA builds of main from before
 * the DB catalog (b74fad0) working — they ship a hardcoded catalog
 * (deepseek-v4-pro as their default) and know nothing about the table — and
 * cover cached client catalogs: requests for retired ids are rewritten to the
 * successor instead of failing with 400 model_not_allowed. (No public release
 * ever shipped the managed plan before the DB catalog.)
 */
export const FALLBACK_MODEL_ALIASES: ModelAliases = {
  'deepseek/deepseek-v4-pro': 'deepseek/deepseek-v4.1-flash-1017',
  'deepseek/deepseek-v4-flash': 'deepseek/deepseek-v4.1-flash-1017',
  'xiaomi/mimo-v2.5-pro': 'xiaomi/mimo-v2.6-pro',
  'anthropic/claude-haiku-4.5': 'anthropic/claude-haiku-5.5',
  'x-ai/grok-4.5': 'openai/gpt-5.6-sol',
  'moonshotai/kimi-k3': 'openai/gpt-5.6-sol',
}

/** Ids of the backup catalog, in order. */
export const DEFAULT_ALLOWED_MODELS: readonly string[] = FALLBACK_MODEL_CATALOG.map((m) => m.id)

/** Non-negative finite number from a JSON number or a numeric string (PostgREST
 *  serializes `numeric` as a JSON number, but a string must not break us). */
function nonNegativeNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value)
}

/**
 * public.ai_models rows → catalog: only rows with `enabled = true`, ordered by
 * sort_order (then id, for a deterministic order on ties). Defensive: a row
 * with a missing/blank id, a missing / negative / non-numeric price (an
 * enabled model without a price cannot be estimated — SQL allows the null, the
 * proxy does not serve it), a non-boolean `images` or an unknown
 * `reasoning_effort` is SKIPPED (one bad row must not take the whole catalog
 * down), and a repeated id keeps its first occurrence. `recommended` is true
 * only when the column is exactly `true`. Null when nothing usable is left
 * (not an array, empty table, everything disabled) — the caller then serves
 * FALLBACK_MODEL_CATALOG.
 */
export function catalogFromRows(rows: unknown): ModelCatalog | null {
  if (!Array.isArray(rows)) return null
  const picked: Array<CatalogModel & { sortOrder: number }> = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    if (r.enabled !== true) continue
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    const priceInUsd = nonNegativeNumber(r.price_in_usd)
    const priceOutUsd = nonNegativeNumber(r.price_out_usd)
    const effort = r.reasoning_effort ?? null
    if (!id || seen.has(id) || priceInUsd === null || priceOutUsd === null) continue
    if (typeof r.images !== 'boolean' || (effort !== null && !isReasoningEffort(effort))) continue
    seen.add(id)
    const sortOrder = typeof r.sort_order === 'number' && Number.isFinite(r.sort_order) ? r.sort_order : 0
    picked.push({
      id,
      images: r.images,
      priceInUsd,
      priceOutUsd,
      reasoningEffort: effort,
      recommended: r.recommended === true,
      sortOrder,
    })
  }
  if (picked.length === 0) return null
  picked.sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return picked.map(({ sortOrder: _sortOrder, ...model }) => model)
}

/**
 * public.ai_models rows → raw alias edges (`id` → `replaced_by`), from ANY row
 * (enabled or not) with a non-blank `replaced_by` different from its own id.
 * Malformed rows are skipped; a repeated id keeps its first edge. The edges
 * are resolved against the served catalog by resolveModelAliases.
 */
export function aliasEdgesFromRows(rows: unknown): Record<string, string> {
  const edges: Record<string, string> = {}
  if (!Array.isArray(rows)) return edges
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    const to = typeof r.replaced_by === 'string' ? r.replaced_by.trim() : ''
    // '__proto__' would hit the prototype setter of the plain object.
    if (!id || !to || id === to || id === '__proto__' || Object.prototype.hasOwnProperty.call(edges, id)) continue
    edges[id] = to
  }
  return edges
}

/** Longest replaced_by chain followed (A → B → C …) before giving up. */
export const MAX_ALIAS_HOPS = 4

/**
 * Resolves raw alias edges to models the proxy actually SERVES: each retired
 * id follows its `replaced_by` chain (at most MAX_ALIAS_HOPS hops, cycles
 * detected) until it lands on an id of `catalog`. An id that is itself served
 * needs no alias and is skipped; a chain that never reaches a served model
 * (successor disabled too, restricted by AI_ALLOWED_MODELS, a cycle, too long)
 * yields no alias — that id then gets the usual 400 model_not_allowed.
 */
export function resolveModelAliases(edges: ModelAliases, catalog: ModelCatalog): Record<string, string> {
  const served = new Set(catalog.map((m) => m.id))
  const out: Record<string, string> = {}
  for (const from of Object.keys(edges)) {
    if (served.has(from)) continue
    const visited = new Set<string>([from])
    let current = from
    for (let hop = 0; hop < MAX_ALIAS_HOPS; hop++) {
      const next = Object.prototype.hasOwnProperty.call(edges, current) ? edges[current] : undefined
      if (!next || visited.has(next)) break
      if (served.has(next)) {
        out[from] = next
        break
      }
      visited.add(next)
      current = next
    }
  }
  return out
}

/**
 * The model a chat request will really run: the requested id when the catalog
 * serves it, else its resolved alias (a retired id with a served successor),
 * else null (→ 400 model_not_allowed). The result is used for EVERYTHING
 * downstream: the upstream body, the reservation and the usage row.
 */
export function resolveRequestedModel(model: unknown, catalog: ModelCatalog, aliases: ModelAliases): CatalogModel | null {
  if (typeof model !== 'string') return null
  const direct = catalog.find((m) => m.id === model)
  if (direct) return direct
  const successor = Object.prototype.hasOwnProperty.call(aliases, model) ? aliases[model] : undefined
  return successor ? (catalog.find((m) => m.id === successor) ?? null) : null
}

/**
 * Parses the AI_ALLOWED_MODELS env value ("a/b,c/d" → list). Null when the env
 * is missing/empty/whitespace-only, i.e. "no override".
 */
export function parseAllowedModelsOverride(raw: string | undefined | null): string[] | null {
  const models = (raw ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return models.length > 0 ? models : null
}

export interface ServedCatalog {
  /** What the proxy serves: allowlist, prices / efforts and GET /models. */
  catalog: ModelCatalog
  /** The override was set but matched no catalog model, so it was ignored. */
  overrideIgnored: boolean
}

/**
 * Applies the AI_ALLOWED_MODELS emergency override to the catalog. The override
 * can only RESTRICT: the served catalog is the catalog's models whose id is in
 * the override, in CATALOG order and with CATALOG metadata. Ids absent from the
 * catalog are ignored — an env var cannot add a model, because it would have no
 * price to estimate its reservation with nor vision flag. If the
 * override matches NO catalog model (typo, or ids that only exist in a table the
 * proxy could not read) it is ignored altogether (overrideIgnored — the caller
 * logs it): serving nothing would take the whole plan down. With the table in
 * place the normal way to retire a model is `enabled = false`; the env remains
 * as a lever that needs no database access.
 */
export function applyAllowedModelsOverride(catalog: ModelCatalog, raw: string | undefined | null): ServedCatalog {
  const override = parseAllowedModelsOverride(raw)
  if (!override) return { catalog, overrideIgnored: false }
  const wanted = new Set(override)
  const served = catalog.filter((m) => wanted.has(m.id))
  return served.length > 0 ? { catalog: served, overrideIgnored: false } : { catalog, overrideIgnored: true }
}

/** Ids of a catalog, in order — the allowlist of POST /chat/completions. */
export function catalogModelIds(catalog: ModelCatalog): string[] {
  return catalog.map((m) => m.id)
}

// ── Monthly quota = real cost in USD (migration 0013) ─────────────────────────
// The monthly quota is a budget of REAL upstream cost per user: every request
// is charged what OpenRouter billed for it (`usage.cost`, which already
// includes reasoning tokens and cache discounts), so a pricey model simply
// spends the budget faster — no per-model multiplier to keep in sync with
// prices. The budget never reaches the client in USD: GET /usage and the
// X-NoteFlow-Tokens-* headers report it in LEGACY_USAGE_UNITS (see
// legacyUsageUnits).

/** Default monthly budget per user, in USD of real upstream cost. */
export const DEFAULT_MONTHLY_BUDGET_USD = 2

/**
 * Parses the AI_MONTHLY_BUDGET_USD env value. Anything that is not a positive
 * finite number (decimals allowed: "2.5") falls back to
 * DEFAULT_MONTHLY_BUDGET_USD — an operator typo must not turn the quota off or
 * into NaN-land.
 */
export function parseMonthlyBudgetUsd(raw: string | undefined | null): number {
  if (raw === null || raw === undefined || raw.trim() === '') return DEFAULT_MONTHLY_BUDGET_USD
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_BUDGET_USD
}

/**
 * Scale of the usage numbers the proxy reports. Internal/QA builds of main
 * from before the DB catalog (b74fad0) show GET /usage as "X / 3M tokens", so
 * the proxy keeps that shape — {used, limit} numbers with limit = 3,000,000 —
 * but `used` is the SHARE of the USD budget spent, scaled to those units: the
 * percentage (and the progress bar) stays exact, and the proxy API never
 * reports USD. (Users CAN read their own usage_events rows, cost_usd /
 * quota_usd included, through the 0003 RLS policy — the USD are not secret,
 * the app just never shows them.)
 */
export const LEGACY_USAGE_UNITS = 3_000_000

/** {used, limit} in LEGACY_USAGE_UNITS for a USD spend against a USD budget. */
export function legacyUsageUnits(usedUsd: number, limitUsd: number): { used: number; limit: number } {
  const used = Number.isFinite(usedUsd) && usedUsd > 0 ? usedUsd : 0
  if (!(Number.isFinite(limitUsd) && limitUsd > 0)) return { used: 0, limit: LEGACY_USAGE_UNITS }
  return { used: Math.round((used / limitUsd) * LEGACY_USAGE_UNITS), limit: LEGACY_USAGE_UNITS }
}

/**
 * Catalog entry used to PRICE a request. Requests only get here for served
 * models (resolveRequestedModel), so the lookup always hits; the defensive
 * fallback for an unknown id is the priciest model of the catalog, never a
 * free ride.
 */
function pricingFor(model: string, catalog: ModelCatalog): Pick<CatalogModel, 'priceInUsd' | 'priceOutUsd'> {
  const found = catalog.find((m) => m.id === model)
  if (found) return found
  let priceInUsd = 0
  let priceOutUsd = 0
  for (const m of catalog) {
    priceInUsd = Math.max(priceInUsd, m.priceInUsd)
    priceOutUsd = Math.max(priceOutUsd, m.priceOutUsd)
  }
  return { priceInUsd, priceOutUsd }
}

/**
 * USD a settled request is charged against the quota: OpenRouter's reported
 * cost (`usage.cost` / generation total_cost) when present — it is the real
 * bill, reasoning and caching included — else the real token counts at the
 * catalog's list prices. Defensive: malformed token sides count as 0.
 */
export function computeCostUsd(usage: TokenUsage, model: string, catalog: ModelCatalog = FALLBACK_MODEL_CATALOG): number {
  if (usage.cost !== null && Number.isFinite(usage.cost) && usage.cost >= 0) return usage.cost
  const tokensIn = Number.isFinite(usage.tokensIn) && usage.tokensIn > 0 ? usage.tokensIn : 0
  const tokensOut = Number.isFinite(usage.tokensOut) && usage.tokensOut > 0 ? usage.tokensOut : 0
  const { priceInUsd, priceOutUsd } = pricingFor(model, catalog)
  return (tokensIn * priceInUsd + tokensOut * priceOutUsd) / 1_000_000
}

/** Positive integer from an env string, else the fallback (shared by the env parsers). */
function parsePositiveInt(raw: string | undefined | null, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback
  return n
}

// ── Bounded cost: clamps, reservation and concurrency ─────────────────────────
// The quota used to be checked (`used >= limit`) and metered only AFTER the
// stream ended, so (a) hundreds of parallel requests with a huge max_tokens all
// passed the check before any of them was metered, and (b) a request that
// outlived the Edge wall clock was killed before its final `usage` chunk and
// was never metered at all. Now every request first RESERVES an estimate of its
// cost (RPC reserve_ai_cost, migration 0013 — the USD successor of 0009's
// reserve_ai_usage, same per-user advisory lock, so parallel requests serialize
// on the check), the reservation is settled to the real cost when it arrives,
// and a reservation that never settles keeps its estimate charged. Everything
// below bounds that estimate.

/**
 * Hard cap on output tokens per request. Forced on EVERY upstream request
 * (buildUpstreamBody): without an explicit max_tokens OpenRouter lets the model
 * run to its own maximum (hundreds of thousands of tokens on the curated
 * models), which would make both the bill and the reservation unbounded. The
 * client sends 4096 by default (6144 for the profile generator), well inside.
 */
export const MAX_OUTPUT_TOKENS = 8192

/**
 * Clamps the client's max_tokens to an integer in [1, MAX_OUTPUT_TOKENS].
 * Missing / non-numeric / non-finite / < 1 values are INVALID and become the
 * cap itself — never "unset", which would hand the limit back to OpenRouter.
 */
export function clampMaxTokens(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return MAX_OUTPUT_TOKENS
  const n = Math.floor(raw)
  if (n < 1) return MAX_OUTPUT_TOKENS
  return Math.min(n, MAX_OUTPUT_TOKENS)
}

/**
 * Max request body the proxy accepts (bytes, enforced while streaming the body
 * in — Content-Length can lie or be absent). 8 MiB, deliberately above the
 * ~4 MB first floated: images travel as base64 data URLs (+33%), the desktop
 * client accepts image attachments up to 10 MB each and RE-SENDS the images of
 * the whole conversation on every turn, so 4 MB would already reject a single
 * typical phone photo (3-5 MB JPEG → 4-7 MB of base64). The cap protects the
 * isolate's memory and bounds abuse; it is NOT the cost control (the
 * reservation is — and images are reserved at a flat rate, see
 * IMAGE_PART_TOKENS, so a big body does not inflate the reservation).
 */
export const MAX_BODY_BYTES = 8 * 1024 * 1024

/**
 * Flat input-token estimate per `image_url` part. Providers bill images by
 * resolution, not by payload size, and downscale big ones: ~1,600 tokens is
 * Anthropic's ceiling (images are resized to ≤1.15 MP ≈ 1,568 tokens) and
 * above OpenAI's high-detail cost for a 1024×1024 image (765). Counting the
 * base64 length instead would reserve ~500k tokens for a 2 MB screenshot and,
 * if usage never arrived, overcharge the user by that much.
 */
export const IMAGE_PART_TOKENS = 1_600

/** Default cap on simultaneous in-flight (pending) requests per user. */
export const DEFAULT_MAX_INFLIGHT = 3

/**
 * Parses the optional AI_MAX_INFLIGHT env: anything that is not a positive
 * integer falls back to DEFAULT_MAX_INFLIGHT.
 */
export function parseMaxInflight(raw: string | undefined | null): number {
  return parsePositiveInt(raw, DEFAULT_MAX_INFLIGHT)
}

/**
 * Minutes after which a still-pending reservation stops counting as
 * "in flight" for the concurrency cap (its estimate stays charged against the
 * quota forever — "the reservation stands"). Must be longer than the Edge wall
 * clock (150 s free / 400 s paid plans) so a live request is never treated as
 * stale; short enough that a few killed isolates do not lock the user out for
 * long. Passed to reserve_ai_cost as p_stale_minutes.
 */
export const RESERVATION_STALE_MINUTES = 10

/**
 * Estimated INPUT tokens of a request (pass the body produced by
 * buildUpstreamBody): UTF-8 bytes of the serialized body / 4 (the usual
 * ~4 bytes/token rule of thumb; tool schemas and the system prompt are part
 * of the body and are billed as input too), except that every `image_url`
 * part of messages[].content counts IMAGE_PART_TOKENS instead of its base64
 * length.
 */
export function estimateInputTokens(upstreamBody: Record<string, unknown>): number {
  let images = 0
  const messages = Array.isArray(upstreamBody.messages)
    ? upstreamBody.messages.map((msg: unknown) => {
        if (msg === null || typeof msg !== 'object') return msg
        const content = (msg as Record<string, unknown>).content
        if (!Array.isArray(content)) return msg
        return {
          ...(msg as Record<string, unknown>),
          content: content.map((part: unknown) => {
            if (part !== null && typeof part === 'object' && (part as Record<string, unknown>).type === 'image_url') {
              images++
              return { type: 'image_url' }
            }
            return part
          }),
        }
      })
    : upstreamBody.messages
  const bytes = new TextEncoder().encode(JSON.stringify({ ...upstreamBody, messages })).length
  return Math.ceil(bytes / 4) + images * IMAGE_PART_TOKENS
}

/**
 * USD to RESERVE before forwarding a request (pass the body produced by
 * buildUpstreamBody, so max_tokens is already clamped):
 *   (estimateInputTokens × price_in + clamped max_tokens × price_out) / 1e6
 * with the list prices of `model` in `catalog` (the one being served — the
 * backup catalog when omitted). The output side is the worst case the request
 * can bill (reasoning tokens count as output and are bounded by max_tokens
 * too). Deliberately an upper-ish bound: it is what the user is charged if
 * the real cost never arrives. It can still fall SHORT of the real bill when
 * a provider surcharges above the list price (DeepSeek's weekday peak hours,
 * long-context tiers) or bytes/4 underestimates the input — the settlement
 * then charges the real cost.
 */
export function estimateReservationUsd(
  upstreamBody: Record<string, unknown>,
  model: string,
  catalog: ModelCatalog = FALLBACK_MODEL_CATALOG
): number {
  const { priceInUsd, priceOutUsd } = pricingFor(model, catalog)
  const input = estimateInputTokens(upstreamBody)
  const output = clampMaxTokens(upstreamBody.max_tokens)
  return (input * priceInUsd + output * priceOutUsd) / 1_000_000
}

/** True when a Content-Length header already announces a body above the cap. */
export function isDeclaredBodyTooLarge(contentLength: string | null | undefined, maxBytes: number): boolean {
  if (contentLength === null || contentLength === undefined || contentLength.trim() === '') return false
  const n = Number(contentLength)
  return Number.isFinite(n) && n > maxBytes
}

export type CappedBodyResult = { ok: true; text: string } | { ok: false; reason: 'too_large' }

/**
 * Reads a request body stream with a running byte counter and gives up (and
 * cancels the stream) as soon as it exceeds maxBytes — the guard that does not
 * trust Content-Length. A null body reads as ''. Read errors propagate (the
 * caller answers 400).
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<CappedBodyResult> {
  if (!body) return { ok: true, text: '' }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return { ok: false, reason: 'too_large' }
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(all) }
}

export type ReserveResult =
  | { ok: true; used: number; id: number }
  | { ok: false; reason: 'quota' | 'concurrency'; used: number }

/**
 * Validates the jsonb returned by the reserve_ai_cost RPC
 * ({ok, reason, used, id}; `used` = USD spent this month, pending reservations
 * included — same shape as 0009's reserve_ai_usage). Null when malformed — the
 * caller treats that as an RPC failure (500), never as a granted reservation.
 */
export function parseReserveResult(payload: unknown): ReserveResult | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  const used = typeof p.used === 'number' && Number.isFinite(p.used) && p.used >= 0 ? p.used : 0
  if (p.ok === true) {
    return typeof p.id === 'number' && Number.isInteger(p.id) ? { ok: true, used, id: p.id } : null
  }
  if (p.ok === false && (p.reason === 'quota' || p.reason === 'concurrency')) {
    return { ok: false, reason: p.reason, used }
  }
  return null
}

export function isModelAllowed(model: unknown, allowed: string[]): boolean {
  return typeof model === 'string' && allowed.includes(model)
}

/**
 * True when the user's subscription rows grant the managed AI plan: some row
 * with product 'ai' or 'bundle' and status 'active'. Same rule as
 * computeEntitlements in electron/entitlements.ts — keep both in sync.
 * Defensive: malformed rows never throw, they just grant nothing.
 */
export function hasAiEntitlement(rows: unknown): boolean {
  if (!Array.isArray(rows)) return false
  return rows.some(
    (row) =>
      row !== null &&
      typeof row === 'object' &&
      (row as Record<string, unknown>).status === 'active' &&
      ((row as Record<string, unknown>).product === 'ai' ||
        (row as Record<string, unknown>).product === 'bundle')
  )
}

export interface QuotaState {
  exceeded: boolean
  /** Budget still available this month (never negative). */
  remaining: number
}

/**
 * used = budget already consumed this month (USD, from get_month_cost; pending
 * reservations included); estimate = what the new request would reserve
 * (estimateReservationUsd; 0 = "is anything left at all?"). Same rule that
 * reserve_ai_cost (migration 0013) applies server-side, with NO tolerance:
 * exceeded when `used >= limit` OR `used + estimate > limit` — a request is
 * only admitted when its whole estimate fits in what is left, so the budget
 * can only be overshot by an estimate that falls short of the real bill.
 */
export function computeQuota(used: number, limit: number, estimate = 0): QuotaState {
  const safeUsed = Number.isFinite(used) && used > 0 ? used : 0
  const safeEstimate = Number.isFinite(estimate) && estimate > 0 ? estimate : 0
  return {
    exceeded: safeUsed >= limit || safeUsed + safeEstimate > limit,
    remaining: Math.max(0, limit - safeUsed),
  }
}

/** OpenAI-compatible error body, so any OpenAI client surfaces it nicely. */
export function openAiErrorBody(
  message: string,
  type: string,
  code: string
): { error: { message: string; type: string; code: string } } {
  return { error: { message, type, code } }
}

/** One entry of GET /models: the OpenAI model object plus NoteFlow's metadata. */
export interface ModelsListEntry {
  id: string
  object: 'model'
  /** Native vision support — the client gates image attachments on it. */
  images: boolean
  /** Highlighted in the client's picker. */
  recommended: boolean
  /**
   * How many times faster than the reference model (the recommended one) a
   * typical message spends the monthly allowance — an integer ≥ 1 (see
   * costIndexFor). The client shows "(≈N× quota)" from 2 up. Prices never
   * leave the server.
   */
  cost_index: number
}

/**
 * Cost of a "typical" agentic message at list prices, per 1M tokens: the
 * chat re-sends the whole conversation + tool schemas every step and writes a
 * comparatively short answer, so the mix is ~90% input / 10% output.
 */
function typicalMessageCost(m: Pick<CatalogModel, 'priceInUsd' | 'priceOutUsd'>): number {
  return 0.9 * m.priceInUsd + 0.1 * m.priceOutUsd
}

/**
 * cost_index of every model of `catalog`, by id: its typical message cost
 * relative to the REFERENCE model — the first `recommended` one, else the
 * first of the catalog — rounded to an integer, minimum 1 (so models cheaper
 * than the reference read as 1, not 0). With a free reference (cost 0) every
 * index is 1: there is nothing to compare against.
 */
export function costIndexes(catalog: ModelCatalog): Record<string, number> {
  const out: Record<string, number> = {}
  const reference = catalog.find((m) => m.recommended) ?? catalog[0]
  const refCost = reference ? typicalMessageCost(reference) : 0
  for (const m of catalog) {
    out[m.id] = refCost > 0 ? Math.max(1, Math.round(typicalMessageCost(m) / refCost)) : 1
  }
  return out
}

/**
 * GET /models response: OpenAI list format (any OpenAI client still reads the
 * ids), with each entry carrying the catalog metadata the client needs
 * (vision, recommended, relative cost — never the USD prices). The desktop
 * client validates this body and caches it as the managed plan's catalog
 * (electron/ai/llm/managedCatalog.ts sanitizeManagedCatalog) — keep the field
 * names in sync with it.
 */
export function modelsListBody(catalog: ModelCatalog): { object: 'list'; data: ModelsListEntry[] } {
  const indexes = costIndexes(catalog)
  return {
    object: 'list',
    data: catalog.map((m) => ({
      id: m.id,
      object: 'model' as const,
      images: m.images,
      recommended: m.recommended,
      cost_index: indexes[m.id],
    })),
  }
}

/**
 * The ONLY top-level fields forwarded to OpenRouter (an allowlist — it used to
 * be a denylist of known-dangerous fields, which silently let every new
 * OpenRouter extension through). The real client (electron/ai/llm/
 * openaiCompatible.ts streamTurn) sends model, messages, stream, max_tokens,
 * tools and tool_choice; the rest are harmless standard OpenAI sampling/format
 * knobs. Everything else is dropped, in particular:
 *   - models + route: alternate-model fallback routing — a permitted `model`
 *     plus `models: [<expensive ids>]` can force execution of models OUTSIDE
 *     the allowlist (whose prices the reservation knows nothing about).
 *   - provider / preset: provider routing preferences and saved presets.
 *   - plugins / web_search_options: extra-cost features (web search) billed on
 *     top of tokens to the operator's key.
 *   - reasoning: the client's reasoning effort/budget is dropped — the proxy
 *     injects the catalog's own `reasoning_effort` instead (server-controlled).
 *   - n: several completions per request (n× the cost of one).
 *   - transforms, stream_options: OpenRouter/OpenAI knobs the proxy owns
 *     (usage accounting is forced below).
 * max_tokens is listed but never copied verbatim: it is always clamped.
 */
export const UPSTREAM_ALLOWED_FIELDS: readonly string[] = [
  'model',
  'messages',
  'stream',
  'max_tokens',
  'tools',
  'tool_choice',
  'temperature',
  'top_p',
  'stop',
  'seed',
  'response_format',
  'parallel_tool_calls',
]

/**
 * Prepares the body forwarded to OpenRouter: ONLY the allowlisted fields above
 * (cost control), max_tokens ALWAYS set to clampMaxTokens(client value), plus
 * `usage: { include: true }` — an OpenRouter extension that appends the token
 * `usage` block (with the request's `cost`) to the last SSE chunk (and to
 * non-stream responses), so the proxy can meter without re-tokenizing
 * anything. With `model` (the catalog entry resolveRequestedModel picked) the
 * body's `model` becomes that id — a retired alias is rewritten to its
 * successor — and, when the entry has a reasoningEffort, `reasoning: { effort }`
 * is injected (the only way reasoning reaches the upstream). The client object
 * is never mutated. `messages` travel verbatim, so the `reasoning_details` the
 * client re-sends on assistant tool-call turns reach OpenRouter intact.
 */
export function buildUpstreamBody(
  clientBody: Record<string, unknown>,
  model?: Pick<CatalogModel, 'id' | 'reasoningEffort'>
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const field of UPSTREAM_ALLOWED_FIELDS) {
    if (field === 'max_tokens') body.max_tokens = clampMaxTokens(clientBody.max_tokens)
    else if (Object.prototype.hasOwnProperty.call(clientBody, field)) body[field] = clientBody[field]
  }
  if (model) {
    body.model = model.id
    if (model.reasoningEffort) body.reasoning = { effort: model.reasoningEffort }
  }
  body.usage = { include: true }
  return body
}

export interface TokenUsage {
  tokensIn: number
  tokensOut: number
  /**
   * What OpenRouter billed for the request (usage.cost / generation
   * total_cost, in credits ≈ USD) — stored in usage_events.cost_usd and, via
   * computeCostUsd, charged against the monthly quota (quota_usd). Null when
   * the upstream did not report it.
   */
  cost: number | null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeOrNull(value: unknown): number | null {
  const n = finiteNumber(value)
  return n !== null && n >= 0 ? n : null
}

/**
 * Extracts the usage block from a parsed OpenAI-compatible response/chunk
 * ({ usage: { prompt_tokens, completion_tokens, cost? } }). Returns null when
 * absent or malformed (no usable token count).
 */
export function extractUsageFromJson(payload: unknown): TokenUsage | null {
  if (payload === null || typeof payload !== 'object') return null
  const usage = (payload as Record<string, unknown>).usage
  if (usage === null || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  const tokensIn = finiteNumber(u.prompt_tokens)
  const tokensOut = finiteNumber(u.completion_tokens)
  if (tokensIn === null && tokensOut === null) return null
  return { tokensIn: tokensIn ?? 0, tokensOut: tokensOut ?? 0, cost: nonNegativeOrNull(u.cost) }
}

/** Top-level `id` of a response/chunk — OpenRouter's generation id ("gen-…"). */
export function extractGenerationId(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const id = (payload as Record<string, unknown>).id
  return typeof id === 'string' && id.trim() !== '' ? id : null
}

/**
 * Parses OpenRouter's `GET /api/v1/generation?id=<id>` response
 * ({ data: { native_tokens_prompt, native_tokens_completion, tokens_prompt,
 * tokens_completion, total_cost, … } }) into a TokenUsage. Native counts (the
 * provider's own tokenizer — what OpenRouter's inline usage reports too) win
 * over the normalized ones. Null when there is no usable token count.
 */
export function parseGenerationStats(payload: unknown): TokenUsage | null {
  if (payload === null || typeof payload !== 'object') return null
  const data = (payload as Record<string, unknown>).data
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const tokensIn = finiteNumber(d.native_tokens_prompt) ?? finiteNumber(d.tokens_prompt)
  const tokensOut = finiteNumber(d.native_tokens_completion) ?? finiteNumber(d.tokens_completion)
  if (tokensIn === null && tokensOut === null) return null
  return { tokensIn: tokensIn ?? 0, tokensOut: tokensOut ?? 0, cost: nonNegativeOrNull(d.total_cost) }
}

export interface SseScanResult {
  /** The LAST usage block seen (OpenRouter puts it in the final chunk). */
  usage: TokenUsage | null
  /** Generation id (top-level `id` of the chunks) — for the /generation fallback. */
  generationId: string | null
}

export interface SseUsageScanner {
  /** Feed decoded stream text (any chunking — lines may split across pushes). */
  push(text: string): void
  /** Flush the tail and return what was found. */
  end(): SseScanResult
}

/** Data lines JSON.parse'd just to find the generation id before giving up. */
const GENERATION_ID_PARSE_ATTEMPTS = 3

/**
 * Incremental scanner for the teed SSE stream. Cheap on purpose (it sees every
 * token of every answer): it only JSON.parse's
 *   - `data:` lines whose raw text contains `"usage"` (the usage chunk; a
 *     literal "usage" inside generated text is JSON-escaped as \"usage\" and
 *     does not match), and
 *   - the first few data lines until the generation id (top-level `id`, same
 *     on every chunk) is known.
 * O(line) memory — the proxy never buffers the whole response. Keepalives /
 * comments / partial frames / [DONE] are ignored.
 */
export function createSseUsageScanner(): SseUsageScanner {
  let buf = ''
  let usage: TokenUsage | null = null
  let generationId: string | null = null
  let idAttempts = 0

  const scanLine = (line: string): void => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    const hasUsage = data.includes('"usage"')
    const wantId = generationId === null && idAttempts < GENERATION_ID_PARSE_ATTEMPTS
    if (!hasUsage && !wantId) return
    if (wantId) idAttempts++
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return // comment/keepalive/partial frame — ignore
    }
    if (generationId === null) generationId = extractGenerationId(parsed)
    if (hasUsage) {
      const found = extractUsageFromJson(parsed)
      if (found) usage = found
    }
  }

  return {
    push(text: string): void {
      buf += text
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        scanLine(buf.slice(0, nl).trim())
        buf = buf.slice(nl + 1)
      }
    },
    end(): SseScanResult {
      const tail = buf.trim()
      buf = ''
      if (tail) scanLine(tail)
      return { usage, generationId }
    },
  }
}

// ── Upstream error mapping ────────────────────────────────────────────────────

const GENERIC_UPSTREAM_MESSAGE = "NoteFlow AI's model provider returned an error. Try again later."

/** Context-window overflow, as phrased by the various providers behind OpenRouter. */
const CONTEXT_LENGTH_RE =
  /context_length|context length|context window|maximum context|prompt is too long|too many tokens|reduce the length/

/** Size/resolution wording that, next to "image", means "your image is too big". */
const IMAGE_SIZE_RE =
  /too large|too big|exceed|max(imum)? (file )?size|size limit|\d+(\.\d+)? ?mb\b|bytes|dimension|resolution|pixels/

/**
 * "This model does not take images at all". Deliberately NOT a bare `image`
 * match: a vision model complaining about one image (size, format…) must not
 * be reported as "this model does not accept image input".
 */
const IMAGE_UNSUPPORTED_RE =
  /image_url|unknown variant|vision|multimodal|image (input|content|modality)|support[a-z]* (for )?images?\b|images? (are|is) not (supported|allowed)/

export interface MappedUpstreamError {
  status: number
  body: { error: { message: string; type: string; code: string } }
  /** Upstream 402: the OPERATOR's OpenRouter account is out of credit — log loudly. */
  outOfCredit: boolean
}

function badRequest(message: string, code: string): MappedUpstreamError {
  return { status: 400, body: openAiErrorBody(message, 'invalid_request_error', code), outOfCredit: false }
}

/**
 * Maps a non-OK OpenRouter response to what the proxy returns. Upstream bodies
 * are NEVER relayed verbatim (they can carry provider names, account/credit
 * details or internal ids); the caller logs the raw detail server-side and the
 * client only sees one of these OpenAI-shaped errors (4xx only — checked in
 * this order):
 *   - context-length errors → 400 `context_length_exceeded` (first: such a
 *     message may also mention images/tokens/limits);
 *   - "image" + size wording (e.g. "image exceeds 5 MB maximum") → 400
 *     `image_too_large`;
 *   - the model does not take images (image_url / "unknown variant" —
 *     DeepSeek's serde error for an image part — / vision / multimodal / "does
 *     not support image input"…) → 400 `image_input_unsupported`.
 *   Both image messages keep the literal `image_url` and the status 400 on
 *   purpose: electron/main.ts friendlyChatError matches on them (when the user
 *   sent images) to show its localized "this model can't read images" hint.
 *   - anything else (5xx, 429, other 4xx) → 502 `upstream_error`, generic.
 * 402 (operator out of OpenRouter credit) is the generic 502 too — it is not
 * the user's fault and they cannot fix it — but flagged so the caller logs a
 * distinct, greppable line.
 */
export function mapUpstreamError(status: number, bodyText: string): MappedUpstreamError {
  const generic: MappedUpstreamError = {
    status: 502,
    body: openAiErrorBody(GENERIC_UPSTREAM_MESSAGE, 'server_error', 'upstream_error'),
    outOfCredit: status === 402,
  }
  if (status === 402 || status < 400 || status >= 500) return generic
  const low = bodyText.toLowerCase()
  if (CONTEXT_LENGTH_RE.test(low)) {
    return badRequest(
      "The conversation is too long for this model's context window. Start a new chat or remove attachments.",
      'context_length_exceeded'
    )
  }
  if (low.includes('image') && IMAGE_SIZE_RE.test(low)) {
    return badRequest('An attached image is too large for this model (image_url).', 'image_too_large')
  }
  if (IMAGE_UNSUPPORTED_RE.test(low)) {
    return badRequest('This model does not accept image input (image_url).', 'image_input_unsupported')
  }
  return generic
}
