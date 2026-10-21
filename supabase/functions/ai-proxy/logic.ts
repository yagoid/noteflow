// Pure, runtime-agnostic logic for the NoteFlow AI proxy (managed LLM plan).
// Deliberately uses ONLY standard Web/JS APIs — no Deno.* — so it runs
// unchanged in the Edge Function (Deno) and under vitest on Node. Covered by
// tests/supabase/ai-proxy.test.ts. Same philosophy as billing-webhook/logic.ts.

/**
 * Curated OpenRouter model ids the managed plan serves by default (overridable
 * with the AI_ALLOWED_MODELS env). All of them MUST support tool calling — the
 * NoteFlow chat is agentic. NOT all of them support vision: the two DeepSeek
 * models and Xiaomi MiMo are text-only (every other curated model accepts image
 * input).
 *
 * KEEP IN SYNC with NOTEFLOW_AI_MODELS in electron/ai/llm/presets.ts (the
 * `noteflow` preset shows this same list as suggested models in the client,
 * and NOTEFLOW_AI_MODEL_META mirrors the multipliers/vision flags below).
 */
export const DEFAULT_ALLOWED_MODELS: readonly string[] = [
  // Standard models (×1 quota).
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
  'xiaomi/mimo-v2.5-pro',
  'openai/gpt-5.6-luna',
  'anthropic/claude-haiku-4.5',
  // Mid-tier (×2 quota — see MODEL_QUOTA_MULTIPLIERS).
  'x-ai/grok-4.5',
  // Advanced models (×6 quota — see MODEL_QUOTA_MULTIPLIERS).
  'moonshotai/kimi-k3',
]

/** Default monthly QUOTA token budget (weighted input + output) per user. */
export const DEFAULT_MONTHLY_TOKENS = 3_000_000

/**
 * Per-model quota multipliers: what a real token costs against the monthly
 * quota. Only models more expensive than the ×1 baseline are listed — anything
 * not in the map (every standard model, and unknown ids) is ×1. There are two
 * paid tiers today, mid-tier ×2 and advanced ×6, but nothing here assumes a
 * fixed set of values: quotaMultiplierFor accepts any positive finite number,
 * so adding a tier is just a new entry. Real tokens (tokens_in/tokens_out) are
 * still recorded unweighted for the operator's cost accounting; the weighted
 * value goes to the usage_events.quota_tokens column (migration 0007).
 *
 * KEEP IN SYNC with NOTEFLOW_AI_MODEL_META in electron/ai/llm/presets.ts.
 */
export const MODEL_QUOTA_MULTIPLIERS: Readonly<Record<string, number>> = {
  'x-ai/grok-4.5': 2,
  'moonshotai/kimi-k3': 6,
}

/** Quota multiplier for a model — unknown/unlisted models cost the ×1 baseline. */
export function quotaMultiplierFor(model: string): number {
  const mult = MODEL_QUOTA_MULTIPLIERS[model]
  return typeof mult === 'number' && Number.isFinite(mult) && mult > 0 ? mult : 1
}

/**
 * Weighted quota tokens a usage event costs: round((in + out) * multiplier).
 * Defensive: a malformed usage side counts as 0 rather than poisoning the sum.
 */
export function computeQuotaTokens(usage: Pick<TokenUsage, 'tokensIn' | 'tokensOut'>, model: string): number {
  const tokensIn = Number.isFinite(usage.tokensIn) && usage.tokensIn > 0 ? usage.tokensIn : 0
  const tokensOut = Number.isFinite(usage.tokensOut) && usage.tokensOut > 0 ? usage.tokensOut : 0
  return Math.round((tokensIn + tokensOut) * quotaMultiplierFor(model))
}

/**
 * Parses the AI_ALLOWED_MODELS env value ("a/b,c/d" → list). Empty/missing/
 * whitespace-only input falls back to the curated default list.
 */
export function parseAllowedModels(raw: string | undefined | null): string[] {
  const models = (raw ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return models.length > 0 ? models : [...DEFAULT_ALLOWED_MODELS]
}

/**
 * Parses the AI_MONTHLY_TOKENS env value. Anything that is not a positive
 * integer falls back to DEFAULT_MONTHLY_TOKENS (operator typo must not turn
 * the quota off or into NaN-land).
 */
export function parseMonthlyTokens(raw: string | undefined | null): number {
  return parsePositiveInt(raw, DEFAULT_MONTHLY_TOKENS)
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
// cost (RPC reserve_ai_usage, migration 0009 — per-user advisory lock, so
// parallel requests serialize on the check), the reservation is settled to the
// real usage when it arrives, and a reservation that never settles keeps its
// estimate charged. Everything below bounds that estimate.

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
 * Parses the optional AI_MAX_INFLIGHT env. Same rule as parseMonthlyTokens:
 * anything that is not a positive integer falls back to DEFAULT_MAX_INFLIGHT.
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
 * long. Passed to reserve_ai_usage as p_stale_minutes.
 */
export const RESERVATION_STALE_MINUTES = 10

/**
 * Weighted quota tokens to RESERVE before forwarding a request (pass the body
 * produced by buildUpstreamBody, so max_tokens is already clamped):
 *   input  ≈ UTF-8 bytes of the serialized body / 4 (the usual ~4 bytes/token
 *            rule of thumb; tool schemas and the system prompt are part of
 *            the body and are billed as input too), except that every
 *            `image_url` part of messages[].content counts IMAGE_PART_TOKENS
 *            instead of its base64 length;
 *   output = the clamped max_tokens (the worst case the request can bill);
 * times the model's quota multiplier, rounded. Deliberately an upper-ish bound:
 * it is what the user is charged if real usage never arrives.
 */
export function estimateReservationTokens(upstreamBody: Record<string, unknown>, model: string): number {
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
  const input = Math.ceil(bytes / 4) + images * IMAGE_PART_TOKENS
  const output = clampMaxTokens(upstreamBody.max_tokens)
  return Math.round((input + output) * quotaMultiplierFor(model))
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
 * Validates the jsonb returned by the reserve_ai_usage RPC
 * ({ok, reason, used, id}). Null when malformed — the caller treats that as an
 * RPC failure (500), never as a granted reservation.
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
  /** Tokens still available this month (never negative). */
  remaining: number
}

/**
 * used = tokens already consumed this month (from get_month_usage). Same rule
 * (`used >= limit` → exceeded) that reserve_ai_usage applies server-side.
 */
export function computeQuota(used: number, limit: number): QuotaState {
  const safeUsed = Number.isFinite(used) && used > 0 ? used : 0
  return { exceeded: safeUsed >= limit, remaining: Math.max(0, limit - safeUsed) }
}

/** OpenAI-compatible error body, so any OpenAI client surfaces it nicely. */
export function openAiErrorBody(
  message: string,
  type: string,
  code: string
): { error: { message: string; type: string; code: string } } {
  return { error: { message, type, code } }
}

/** GET /models response in OpenAI list format. */
export function modelsListBody(models: string[]): {
  object: 'list'
  data: Array<{ id: string; object: 'model' }>
} {
  return { object: 'list', data: models.map((id) => ({ id, object: 'model' as const })) }
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
 *     the allowlist (and the quota is token-based, not cost-based).
 *   - provider / preset: provider routing preferences and saved presets.
 *   - plugins / web_search_options: extra-cost features (web search) billed on
 *     top of tokens to the operator's key.
 *   - reasoning: reasoning effort/budget — more (billed) completion tokens.
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
 * anything. The client object is never mutated.
 */
export function buildUpstreamBody(clientBody: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const field of UPSTREAM_ALLOWED_FIELDS) {
    if (field === 'max_tokens') body.max_tokens = clampMaxTokens(clientBody.max_tokens)
    else if (Object.prototype.hasOwnProperty.call(clientBody, field)) body[field] = clientBody[field]
  }
  body.usage = { include: true }
  return body
}

export interface TokenUsage {
  tokensIn: number
  tokensOut: number
  /**
   * What OpenRouter billed for the request (usage.cost / generation
   * total_cost, in credits ≈ USD) — stored in usage_events.cost_usd for the
   * operator's spend monitoring. Null when the upstream did not report it.
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
