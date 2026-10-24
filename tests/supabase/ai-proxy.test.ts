import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ALLOWED_MODELS,
  DEFAULT_MONTHLY_TOKENS,
  FALLBACK_MODEL_CATALOG,
  catalogFromRows,
  parseAllowedModelsOverride,
  applyAllowedModelsOverride,
  catalogModelIds,
  type ModelCatalog,
  parseMonthlyTokens,
  isModelAllowed,
  hasAiEntitlement,
  computeQuota,
  quotaMultiplierFor,
  computeQuotaTokens,
  openAiErrorBody,
  modelsListBody,
  buildUpstreamBody,
  extractUsageFromJson,
  createSseUsageScanner,
  MAX_OUTPUT_TOKENS,
  MAX_BODY_BYTES,
  IMAGE_PART_TOKENS,
  DEFAULT_MAX_INFLIGHT,
  RESERVATION_STALE_MINUTES,
  UPSTREAM_ALLOWED_FIELDS,
  clampMaxTokens,
  parseMaxInflight,
  estimateReservationTokens,
  isDeclaredBodyTooLarge,
  readBodyWithLimit,
  parseReserveResult,
  extractGenerationId,
  parseGenerationStats,
  mapUpstreamError,
} from '../../supabase/functions/ai-proxy/logic'

// A catalog that only exists in the table (not in the backup constants) — what
// "a new model inserted in ai_models" looks like to the proxy.
const TABLE_CATALOG: ModelCatalog = [
  { id: 'deepseek/deepseek-v4-pro', quotaMultiplier: 1, images: false },
  { id: 'new/model-x', quotaMultiplier: 3, images: true },
  { id: 'cheap/model-y', quotaMultiplier: 0.5, images: false },
]

describe('catalogFromRows (public.ai_models → catalog)', () => {
  const row = (id: unknown, extra: Record<string, unknown> = {}) => ({
    id,
    quota_multiplier: 1,
    images: true,
    enabled: true,
    sort_order: 0,
    ...extra,
  })

  it('keeps only enabled rows, ordered by sort_order', () => {
    expect(
      catalogFromRows([
        row('c/third', { sort_order: 30 }),
        row('a/first', { sort_order: 10, quota_multiplier: 2, images: false }),
        row('off/disabled', { sort_order: 0, enabled: false }),
        row('b/second', { sort_order: 20 }),
      ])
    ).toEqual([
      { id: 'a/first', quotaMultiplier: 2, images: false },
      { id: 'b/second', quotaMultiplier: 1, images: true },
      { id: 'c/third', quotaMultiplier: 1, images: true },
    ])
  })

  it('breaks sort_order ties by id (deterministic order)', () => {
    expect(catalogModelIds(catalogFromRows([row('z/z'), row('a/a'), row('m/m')])!)).toEqual(['a/a', 'm/m', 'z/z'])
  })

  it('accepts a numeric multiplier serialized as a string, and fractional tiers', () => {
    expect(catalogFromRows([row('a/a', { quota_multiplier: '1.5' })])).toEqual([
      { id: 'a/a', quotaMultiplier: 1.5, images: true },
    ])
  })

  it('skips malformed rows without dropping the good ones', () => {
    expect(
      catalogFromRows([
        row(''),
        row('   '),
        row(42),
        row('bad/mult-0', { quota_multiplier: 0 }),
        row('bad/mult-neg', { quota_multiplier: -2 }),
        row('bad/mult-nan', { quota_multiplier: 'abc' }),
        row('bad/mult-missing', { quota_multiplier: undefined }),
        row('bad/images', { images: 'yes' }),
        row('bad/enabled-string', { enabled: 'true' }),
        null,
        'nope',
        [],
        row(' ok/model ', { sort_order: 5 }),
      ])
    ).toEqual([{ id: 'ok/model', quotaMultiplier: 1, images: true }])
  })

  it('keeps the first occurrence of a repeated id', () => {
    expect(catalogFromRows([row('a/a', { quota_multiplier: 2 }), row('a/a', { quota_multiplier: 9 })])).toEqual([
      { id: 'a/a', quotaMultiplier: 2, images: true },
    ])
  })

  it('a missing sort_order sorts as 0', () => {
    expect(
      catalogModelIds(catalogFromRows([row('b/b', { sort_order: 1 }), row('a/a', { sort_order: undefined })])!)
    ).toEqual(['a/a', 'b/b'])
  })

  it('returns null when nothing usable is left — the caller serves the backup catalog', () => {
    expect(catalogFromRows([])).toBeNull()
    expect(catalogFromRows([row('a/a', { enabled: false })])).toBeNull()
    expect(catalogFromRows([row('')])).toBeNull()
    expect(catalogFromRows(null)).toBeNull()
    expect(catalogFromRows({ data: [row('a/a')] })).toBeNull()
  })
})

describe('FALLBACK_MODEL_CATALOG / DEFAULT_ALLOWED_MODELS', () => {
  it('DEFAULT_ALLOWED_MODELS is the backup catalog ids, in order', () => {
    expect([...DEFAULT_ALLOWED_MODELS]).toEqual(FALLBACK_MODEL_CATALOG.map((m) => m.id))
  })

  it('every backup entry is well-formed (what catalogFromRows would accept)', () => {
    for (const m of FALLBACK_MODEL_CATALOG) {
      expect(m.id.trim()).toBe(m.id)
      expect(m.id).not.toBe('')
      expect(Number.isFinite(m.quotaMultiplier) && m.quotaMultiplier > 0).toBe(true)
      expect(typeof m.images).toBe('boolean')
    }
  })
})

describe('AI_ALLOWED_MODELS emergency override', () => {
  it('parses a comma-separated override with whitespace tolerance', () => {
    expect(parseAllowedModelsOverride(' openai/gpt-5.6-luna , x-ai/grok-4.5 ,')).toEqual([
      'openai/gpt-5.6-luna',
      'x-ai/grok-4.5',
    ])
  })

  it('missing / empty / whitespace-only env = no override', () => {
    expect(parseAllowedModelsOverride(undefined)).toBeNull()
    expect(parseAllowedModelsOverride(null)).toBeNull()
    expect(parseAllowedModelsOverride('')).toBeNull()
    expect(parseAllowedModelsOverride('  ,  ,')).toBeNull()
    expect(applyAllowedModelsOverride(TABLE_CATALOG, undefined)).toEqual({ catalog: TABLE_CATALOG, overrideIgnored: false })
  })

  it('only RESTRICTS the catalog, keeping catalog order and metadata', () => {
    const { catalog, overrideIgnored } = applyAllowedModelsOverride(TABLE_CATALOG, 'cheap/model-y,new/model-x')
    expect(overrideIgnored).toBe(false)
    expect(catalog).toEqual([TABLE_CATALOG[1], TABLE_CATALOG[2]])
  })

  it('cannot ADD a model the catalog does not have (it would have no multiplier)', () => {
    const { catalog } = applyAllowedModelsOverride(TABLE_CATALOG, 'new/model-x,someone/pricey-model')
    expect(catalogModelIds(catalog)).toEqual(['new/model-x'])
  })

  it('is ignored (and flagged) when it matches no catalog model — never an empty allowlist', () => {
    expect(applyAllowedModelsOverride(TABLE_CATALOG, 'typo/model')).toEqual({
      catalog: TABLE_CATALOG,
      overrideIgnored: true,
    })
  })
})

describe('parseMonthlyTokens', () => {
  it('parses a positive integer', () => {
    expect(parseMonthlyTokens('5000000')).toBe(5_000_000)
  })

  it('falls back to the default on missing/garbage/non-positive values', () => {
    expect(parseMonthlyTokens(undefined)).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens(null)).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('')).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('lots')).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('0')).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('-5')).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('1.5')).toBe(DEFAULT_MONTHLY_TOKENS)
  })
})

describe('isModelAllowed', () => {
  const allowed = ['openai/gpt-5.6-luna', 'x-ai/grok-4.5']

  it('accepts exact matches only', () => {
    expect(isModelAllowed('openai/gpt-5.6-luna', allowed)).toBe(true)
    expect(isModelAllowed('openai/gpt-5.6', allowed)).toBe(false)
    expect(isModelAllowed('OPENAI/GPT-5.6-LUNA-PRO', allowed)).toBe(false)
  })

  it('rejects non-string models without throwing', () => {
    expect(isModelAllowed(undefined, allowed)).toBe(false)
    expect(isModelAllowed(42, allowed)).toBe(false)
    expect(isModelAllowed({ model: 'openai/gpt-5.6-luna' }, allowed)).toBe(false)
  })
})

describe('hasAiEntitlement', () => {
  it("grants with an active 'ai' or 'bundle' row", () => {
    expect(hasAiEntitlement([{ product: 'ai', status: 'active' }])).toBe(true)
    expect(hasAiEntitlement([{ product: 'bundle', status: 'active' }])).toBe(true)
    expect(
      hasAiEntitlement([
        { product: 'cloud', status: 'active' },
        { product: 'ai', status: 'active' },
      ])
    ).toBe(true)
  })

  it("denies 'cloud'-only, inactive statuses and empty sets", () => {
    expect(hasAiEntitlement([])).toBe(false)
    expect(hasAiEntitlement([{ product: 'cloud', status: 'active' }])).toBe(false)
    expect(hasAiEntitlement([{ product: 'ai', status: 'past_due' }])).toBe(false)
    expect(hasAiEntitlement([{ product: 'ai', status: 'expired' }])).toBe(false)
  })

  it('never throws on malformed input', () => {
    expect(hasAiEntitlement(null)).toBe(false)
    expect(hasAiEntitlement(undefined)).toBe(false)
    expect(hasAiEntitlement('rows')).toBe(false)
    expect(hasAiEntitlement([null, 'x', 42, {}])).toBe(false)
  })
})

describe('computeQuota', () => {
  it('reports remaining tokens below the limit', () => {
    expect(computeQuota(1_000, 3_000_000)).toEqual({ exceeded: false, remaining: 2_999_000 })
    expect(computeQuota(0, 100)).toEqual({ exceeded: false, remaining: 100 })
  })

  it('flags exceeded at and beyond the limit, clamping remaining at 0', () => {
    expect(computeQuota(100, 100)).toEqual({ exceeded: true, remaining: 0 })
    expect(computeQuota(150, 100)).toEqual({ exceeded: true, remaining: 0 })
  })

  it('treats negative/NaN usage as zero', () => {
    expect(computeQuota(-5, 100)).toEqual({ exceeded: false, remaining: 100 })
    expect(computeQuota(NaN, 100)).toEqual({ exceeded: false, remaining: 100 })
  })
})

describe('quotaMultiplierFor', () => {
  it('reads the multiplier from the catalog in use', () => {
    expect(quotaMultiplierFor('new/model-x', TABLE_CATALOG)).toBe(3)
    expect(quotaMultiplierFor('cheap/model-y', TABLE_CATALOG)).toBe(0.5)
    // A model only in the backup catalog is unknown to this one → ×1 baseline.
    expect(quotaMultiplierFor('moonshotai/kimi-k3', TABLE_CATALOG)).toBe(1)
  })

  it('falls back to ×1 for a malformed catalog entry', () => {
    expect(quotaMultiplierFor('a/a', [{ id: 'a/a', quotaMultiplier: Number.NaN, images: true }])).toBe(1)
    expect(quotaMultiplierFor('a/a', [{ id: 'a/a', quotaMultiplier: -3, images: true }])).toBe(1)
  })

  it('returns the backup value for advanced (×6) models', () => {
    expect(quotaMultiplierFor('moonshotai/kimi-k3')).toBe(6)
  })

  it('returns the backup value for mid-tier (×2) models', () => {
    expect(quotaMultiplierFor('x-ai/grok-4.5')).toBe(2)
  })

  it('returns 1 for standard curated models', () => {
    expect(quotaMultiplierFor('openai/gpt-5.6-luna')).toBe(1)
    expect(quotaMultiplierFor('deepseek/deepseek-v4-flash')).toBe(1)
    expect(quotaMultiplierFor('xiaomi/mimo-v2.5-pro')).toBe(1)
  })

  it('returns 1 for unknown models', () => {
    expect(quotaMultiplierFor('someone/some-model')).toBe(1)
    expect(quotaMultiplierFor('')).toBe(1)
  })
})

describe('computeQuotaTokens', () => {
  it('sums in+out unweighted for standard models', () => {
    expect(computeQuotaTokens({ tokensIn: 120, tokensOut: 45 }, 'openai/gpt-5.6-luna')).toBe(165)
  })

  it('applies the ×2 multiplier for mid-tier models', () => {
    expect(computeQuotaTokens({ tokensIn: 100, tokensOut: 50 }, 'x-ai/grok-4.5')).toBe(300)
  })

  it('applies the ×6 multiplier for advanced models', () => {
    expect(computeQuotaTokens({ tokensIn: 100, tokensOut: 50 }, 'moonshotai/kimi-k3')).toBe(900)
  })

  it('always yields an integer (round contract; current multipliers are integral)', () => {
    expect(Number.isInteger(computeQuotaTokens({ tokensIn: 7, tokensOut: 3 }, 'moonshotai/kimi-k3'))).toBe(true)
    expect(Number.isInteger(computeQuotaTokens({ tokensIn: 1, tokensOut: 2 }, 'anthropic/claude-haiku-4.5'))).toBe(true)
  })

  it('uses the multiplier of the catalog it is given (the served one)', () => {
    expect(computeQuotaTokens({ tokensIn: 100, tokensOut: 50 }, 'new/model-x', TABLE_CATALOG)).toBe(450)
    expect(computeQuotaTokens({ tokensIn: 100, tokensOut: 50 }, 'cheap/model-y', TABLE_CATALOG)).toBe(75)
  })

  it('treats zero and malformed usage sides as 0', () => {
    expect(computeQuotaTokens({ tokensIn: 0, tokensOut: 0 }, 'moonshotai/kimi-k3')).toBe(0)
    expect(computeQuotaTokens({ tokensIn: NaN, tokensOut: 10 }, 'moonshotai/kimi-k3')).toBe(60)
    expect(computeQuotaTokens({ tokensIn: NaN, tokensOut: 10 }, 'x-ai/grok-4.5')).toBe(20)
    expect(computeQuotaTokens({ tokensIn: -5, tokensOut: 10 }, 'openai/gpt-5.6-luna')).toBe(10)
  })
})

describe('openAiErrorBody / modelsListBody', () => {
  it('shapes an OpenAI-compatible error', () => {
    expect(openAiErrorBody('nope', 'permission_error', 'subscription_required')).toEqual({
      error: { message: 'nope', type: 'permission_error', code: 'subscription_required' },
    })
  })

  it('shapes the OpenAI models list, with the catalog metadata per entry, in order', () => {
    expect(modelsListBody(TABLE_CATALOG)).toEqual({
      object: 'list',
      data: [
        { id: 'deepseek/deepseek-v4-pro', object: 'model', quota_multiplier: 1, images: false },
        { id: 'new/model-x', object: 'model', quota_multiplier: 3, images: true },
        { id: 'cheap/model-y', object: 'model', quota_multiplier: 0.5, images: false },
      ],
    })
  })

  it('serves the override-restricted catalog when AI_ALLOWED_MODELS is set', () => {
    const { catalog } = applyAllowedModelsOverride(TABLE_CATALOG, 'new/model-x')
    expect(modelsListBody(catalog).data.map((m) => m.id)).toEqual(['new/model-x'])
  })
})

describe('buildUpstreamBody', () => {
  /** Exactly what electron/ai/llm/openaiCompatible.ts streamTurn sends (image part included). */
  const realClientBody = () => ({
    model: 'openai/gpt-5.6-luna',
    messages: [
      { role: 'system', content: 'You are NoteFlow.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this picture?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
        ],
      },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_notes', arguments: '{"q":"x"}' } }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'no results' },
    ],
    stream: true,
    max_tokens: 4096,
    tools: [{ type: 'function', function: { name: 'search_notes', description: 'Search', parameters: {} } }],
    tool_choice: 'auto',
  })

  it('passes the real client body through intact, adding only usage.include', () => {
    const body = realClientBody()
    expect(buildUpstreamBody(body)).toEqual({ ...realClientBody(), usage: { include: true } })
    // Original object untouched.
    expect('usage' in body).toBe(false)
  })

  it('drops every field outside the allowlist (routing, extra-cost and unknown knobs)', () => {
    const dropped = {
      // Fallback routing: would execute non-allowlisted (expensive) models.
      models: ['anthropic/claude-opus-4', 'openai/o3'],
      route: 'fallback',
      // Provider routing preferences / saved presets.
      provider: { order: ['OpenAI'], allow_fallbacks: true },
      preset: 'my-expensive-preset',
      // Paid add-ons billed to the operator's key.
      plugins: [{ id: 'web' }],
      web_search_options: { search_context_size: 'high' },
      // More billed tokens / completions.
      reasoning: { effort: 'high' },
      n: 8,
      // Knobs the proxy owns.
      transforms: ['middle-out'],
      stream_options: { include_usage: false },
      // Anything unknown.
      some_future_extension: true,
    }
    const upstream = buildUpstreamBody({ ...realClientBody(), ...dropped })
    for (const field of Object.keys(dropped)) expect(upstream).not.toHaveProperty(field)
    expect(upstream).toEqual({ ...realClientBody(), usage: { include: true } })
  })

  it('keeps the harmless standard OpenAI knobs of the allowlist', () => {
    const extras = {
      temperature: 0.7,
      top_p: 0.9,
      stop: ['\n\n'],
      seed: 42,
      response_format: { type: 'json_object' },
      parallel_tool_calls: false,
    }
    expect(buildUpstreamBody({ ...realClientBody(), ...extras })).toEqual({
      ...realClientBody(),
      ...extras,
      usage: { include: true },
    })
    for (const field of Object.keys(extras)) expect(UPSTREAM_ALLOWED_FIELDS).toContain(field)
  })

  it('always forces usage.include, even over a client-provided usage field', () => {
    expect(buildUpstreamBody({ ...realClientBody(), usage: { include: false } }).usage).toEqual({ include: true })
  })

  it('always sets a clamped max_tokens', () => {
    const { max_tokens: _omit, ...withoutMax } = realClientBody()
    expect(buildUpstreamBody(withoutMax).max_tokens).toBe(MAX_OUTPUT_TOKENS)
    expect(buildUpstreamBody({ ...realClientBody(), max_tokens: 1_000_000 }).max_tokens).toBe(MAX_OUTPUT_TOKENS)
    expect(buildUpstreamBody({ ...realClientBody(), max_tokens: 'lots' }).max_tokens).toBe(MAX_OUTPUT_TOKENS)
    expect(buildUpstreamBody({ ...realClientBody(), max_tokens: 6144 }).max_tokens).toBe(6144)
  })
})

describe('clampMaxTokens', () => {
  it('keeps valid values inside [1, MAX_OUTPUT_TOKENS]', () => {
    expect(clampMaxTokens(1)).toBe(1)
    expect(clampMaxTokens(4096)).toBe(4096)
    expect(clampMaxTokens(MAX_OUTPUT_TOKENS)).toBe(MAX_OUTPUT_TOKENS)
  })

  it('clamps values above the cap and floors fractions', () => {
    expect(clampMaxTokens(MAX_OUTPUT_TOKENS + 1)).toBe(MAX_OUTPUT_TOKENS)
    expect(clampMaxTokens(1e9)).toBe(MAX_OUTPUT_TOKENS)
    expect(clampMaxTokens(100.9)).toBe(100)
  })

  it('turns missing/invalid values into the cap (never "unset")', () => {
    for (const raw of [undefined, null, '4096', NaN, Infinity, -Infinity, 0, -5, 0.5, {}, []]) {
      expect(clampMaxTokens(raw)).toBe(MAX_OUTPUT_TOKENS)
    }
  })

  it('the cap is 8192', () => {
    expect(MAX_OUTPUT_TOKENS).toBe(8192)
  })
})

describe('parseMaxInflight / reservation constants', () => {
  it('parses a positive integer and falls back to the default otherwise', () => {
    expect(parseMaxInflight('5')).toBe(5)
    for (const raw of [undefined, null, '', 'many', '0', '-1', '2.5']) {
      expect(parseMaxInflight(raw)).toBe(DEFAULT_MAX_INFLIGHT)
    }
    expect(DEFAULT_MAX_INFLIGHT).toBe(3)
  })

  it('the stale window outlives the longest Edge wall clock (400 s)', () => {
    expect(RESERVATION_STALE_MINUTES * 60).toBeGreaterThan(400)
  })
})

describe('estimateReservationTokens', () => {
  const utf8 = (s: string) => new TextEncoder().encode(s).length

  it('is ceil(serialized bytes / 4) + clamped max_tokens for a text body', () => {
    const body = buildUpstreamBody({
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: 'hello world' }],
      stream: true,
      max_tokens: 4096,
    })
    const expected = Math.ceil(utf8(JSON.stringify(body)) / 4) + 4096
    expect(estimateReservationTokens(body, 'openai/gpt-5.6-luna')).toBe(expected)
  })

  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    const ascii = buildUpstreamBody({ model: 'm', messages: [{ role: 'user', content: 'aaaa' }], max_tokens: 1 })
    const accented = buildUpstreamBody({ model: 'm', messages: [{ role: 'user', content: 'ññññ' }], max_tokens: 1 })
    expect(estimateReservationTokens(accented, 'm')).toBeGreaterThan(estimateReservationTokens(ascii, 'm'))
  })

  it('charges a flat IMAGE_PART_TOKENS per image instead of its base64 length', () => {
    const hugeBase64 = 'A'.repeat(2 * 1024 * 1024) // a 2 MB screenshot
    const withImage = (url: string) =>
      buildUpstreamBody({
        model: 'openai/gpt-5.6-luna',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'describe' },
              { type: 'image_url', image_url: { url } },
              { type: 'image_url', image_url: { url } },
            ],
          },
        ],
        max_tokens: 1000,
      })
    const small = estimateReservationTokens(withImage('data:image/png;base64,AAAA'), 'openai/gpt-5.6-luna')
    const huge = estimateReservationTokens(withImage(`data:image/png;base64,${hugeBase64}`), 'openai/gpt-5.6-luna')
    // Payload size is irrelevant for images…
    expect(huge).toBe(small)
    // …which are charged at the flat rate (2 images) on top of the text + output.
    const textOnly = buildUpstreamBody({
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'describe' }, { type: 'image_url' }, { type: 'image_url' }] }],
      max_tokens: 1000,
    })
    expect(small).toBe(Math.ceil(utf8(JSON.stringify(textOnly)) / 4) + 2 * IMAGE_PART_TOKENS + 1000)
    expect(huge).toBeLessThan(10_000)
  })

  it('applies the model quota multiplier, rounded', () => {
    const body = buildUpstreamBody({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 })
    const base = estimateReservationTokens(body, 'openai/gpt-5.6-luna')
    expect(estimateReservationTokens(body, 'x-ai/grok-4.5')).toBe(base * 2)
    expect(estimateReservationTokens(body, 'moonshotai/kimi-k3')).toBe(base * 6)
    expect(Number.isInteger(estimateReservationTokens(body, 'moonshotai/kimi-k3'))).toBe(true)
  })

  it('takes the multiplier from the served catalog (a model that only exists in the table)', () => {
    const body = buildUpstreamBody({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 })
    const base = estimateReservationTokens(body, 'deepseek/deepseek-v4-pro', TABLE_CATALOG)
    expect(estimateReservationTokens(body, 'new/model-x', TABLE_CATALOG)).toBe(base * 3)
    expect(estimateReservationTokens(body, 'cheap/model-y', TABLE_CATALOG)).toBe(Math.round(base * 0.5))
    // The same model is ×1 against the backup catalog, which does not know it.
    expect(estimateReservationTokens(body, 'new/model-x')).toBe(base)
  })

  it('uses the clamped output cap when max_tokens is missing or absurd', () => {
    const body = { model: 'm', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10_000_000 }
    const input = Math.ceil(utf8(JSON.stringify(body)) / 4)
    expect(estimateReservationTokens(body, 'm')).toBe(input + MAX_OUTPUT_TOKENS)
  })

  it('never throws on odd message shapes', () => {
    const body = { model: 'm', messages: [null, 'x', { role: 'user', content: [null, 3] }], max_tokens: 5 }
    expect(estimateReservationTokens(body, 'm')).toBeGreaterThan(5)
  })
})

describe('body size cap', () => {
  const streamOf = (chunks: Uint8Array[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c)
        controller.close()
      },
    })

  it('isDeclaredBodyTooLarge only trusts a numeric Content-Length above the cap', () => {
    expect(isDeclaredBodyTooLarge(String(MAX_BODY_BYTES + 1), MAX_BODY_BYTES)).toBe(true)
    expect(isDeclaredBodyTooLarge(String(MAX_BODY_BYTES), MAX_BODY_BYTES)).toBe(false)
    expect(isDeclaredBodyTooLarge(null, MAX_BODY_BYTES)).toBe(false)
    expect(isDeclaredBodyTooLarge('', MAX_BODY_BYTES)).toBe(false)
    expect(isDeclaredBodyTooLarge('garbage', MAX_BODY_BYTES)).toBe(false)
  })

  it('readBodyWithLimit returns the decoded text when under the cap', async () => {
    const enc = new TextEncoder()
    const result = await readBodyWithLimit(streamOf([enc.encode('{"a":'), enc.encode('"ñ"}')]), 100)
    expect(result).toEqual({ ok: true, text: '{"a":"ñ"}' })
  })

  it('readBodyWithLimit counts the stream itself (a lying/absent Content-Length does not help)', async () => {
    const result = await readBodyWithLimit(streamOf([new Uint8Array(60), new Uint8Array(60)]), 100)
    expect(result).toEqual({ ok: false, reason: 'too_large' })
  })

  it('readBodyWithLimit accepts exactly the cap and reads a null body as empty', async () => {
    expect(await readBodyWithLimit(streamOf([new Uint8Array(100).fill(97)]), 100)).toEqual({
      ok: true,
      text: 'a'.repeat(100),
    })
    expect(await readBodyWithLimit(null, 100)).toEqual({ ok: true, text: '' })
  })

  it('the cap fits several base64 images (8 MiB)', () => {
    expect(MAX_BODY_BYTES).toBe(8 * 1024 * 1024)
  })
})

describe('parseReserveResult', () => {
  it('accepts the RPC shapes', () => {
    expect(parseReserveResult({ ok: true, reason: null, used: 1200, id: 77 })).toEqual({ ok: true, used: 1200, id: 77 })
    expect(parseReserveResult({ ok: false, reason: 'quota', used: 3_000_000, id: null })).toEqual({
      ok: false,
      reason: 'quota',
      used: 3_000_000,
    })
    expect(parseReserveResult({ ok: false, reason: 'concurrency', used: 5, id: null })).toEqual({
      ok: false,
      reason: 'concurrency',
      used: 5,
    })
  })

  it('rejects malformed answers (never a phantom granted reservation)', () => {
    for (const p of [null, 'x', [], {}, { ok: true }, { ok: true, id: 'abc' }, { ok: true, id: 1.5 }, { ok: false, reason: 'other' }]) {
      expect(parseReserveResult(p)).toBeNull()
    }
  })

  it('defaults a missing/negative used to 0', () => {
    expect(parseReserveResult({ ok: true, id: 1 })).toEqual({ ok: true, used: 0, id: 1 })
    expect(parseReserveResult({ ok: true, id: 1, used: -3 })).toEqual({ ok: true, used: 0, id: 1 })
  })
})

describe('extractUsageFromJson', () => {
  it('reads prompt/completion tokens', () => {
    expect(
      extractUsageFromJson({ id: 'x', usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 } })
    ).toEqual({ tokensIn: 120, tokensOut: 45, cost: null })
  })

  it('reads the OpenRouter cost when finite and non-negative', () => {
    expect(extractUsageFromJson({ usage: { prompt_tokens: 1, completion_tokens: 2, cost: 0.00123 } })).toEqual({
      tokensIn: 1,
      tokensOut: 2,
      cost: 0.00123,
    })
    expect(extractUsageFromJson({ usage: { prompt_tokens: 1, completion_tokens: 2, cost: 0 } })?.cost).toBe(0)
    expect(extractUsageFromJson({ usage: { prompt_tokens: 1, completion_tokens: 2, cost: -1 } })?.cost).toBeNull()
    expect(extractUsageFromJson({ usage: { prompt_tokens: 1, completion_tokens: 2, cost: '0.1' } })?.cost).toBeNull()
  })

  it('defaults a missing side to 0 when the other is present', () => {
    expect(extractUsageFromJson({ usage: { prompt_tokens: 10 } })).toEqual({ tokensIn: 10, tokensOut: 0, cost: null })
    expect(extractUsageFromJson({ usage: { completion_tokens: 7 } })).toEqual({ tokensIn: 0, tokensOut: 7, cost: null })
  })

  it('returns null when there is no usable usage block', () => {
    expect(extractUsageFromJson(null)).toBeNull()
    expect(extractUsageFromJson('x')).toBeNull()
    expect(extractUsageFromJson({})).toBeNull()
    expect(extractUsageFromJson({ usage: null })).toBeNull()
    expect(extractUsageFromJson({ usage: {} })).toBeNull()
    expect(extractUsageFromJson({ usage: { prompt_tokens: 'many' } })).toBeNull()
  })
})

describe('extractGenerationId / parseGenerationStats', () => {
  it('reads the top-level id', () => {
    expect(extractGenerationId({ id: 'gen-123', choices: [] })).toBe('gen-123')
    expect(extractGenerationId({ id: '' })).toBeNull()
    expect(extractGenerationId({ id: 5 })).toBeNull()
    expect(extractGenerationId(null)).toBeNull()
    expect(extractGenerationId([])).toBeNull()
  })

  it('prefers native token counts and reads total_cost', () => {
    expect(
      parseGenerationStats({
        data: {
          id: 'gen-1',
          tokens_prompt: 100,
          tokens_completion: 50,
          native_tokens_prompt: 120,
          native_tokens_completion: 55,
          total_cost: 0.0042,
        },
      })
    ).toEqual({ tokensIn: 120, tokensOut: 55, cost: 0.0042 })
  })

  it('falls back to the normalized counts and a null cost', () => {
    expect(parseGenerationStats({ data: { tokens_prompt: 100, tokens_completion: 50 } })).toEqual({
      tokensIn: 100,
      tokensOut: 50,
      cost: null,
    })
    expect(parseGenerationStats({ data: { native_tokens_completion: 9, total_cost: -1 } })).toEqual({
      tokensIn: 0,
      tokensOut: 9,
      cost: null,
    })
  })

  it('returns null without usable counts', () => {
    for (const p of [null, 'x', {}, { data: null }, { data: [] }, { data: { total_cost: 1 } }, { data: { tokens_prompt: 'x' } }]) {
      expect(parseGenerationStats(p)).toBeNull()
    }
  })
})

describe('createSseUsageScanner', () => {
  const chunk = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`

  it('captures the usage block (with cost) and generation id from the stream', () => {
    const scanner = createSseUsageScanner()
    scanner.push(': OPENROUTER PROCESSING\n\n')
    scanner.push(chunk({ id: 'gen-abc', choices: [{ delta: { content: 'Hel' } }] }))
    scanner.push(chunk({ id: 'gen-abc', choices: [{ delta: { content: 'lo' } }] }))
    scanner.push(
      chunk({ id: 'gen-abc', choices: [{ delta: {} }], usage: { prompt_tokens: 30, completion_tokens: 12, cost: 0.0001 } })
    )
    scanner.push('data: [DONE]\n\n')
    expect(scanner.end()).toEqual({ usage: { tokensIn: 30, tokensOut: 12, cost: 0.0001 }, generationId: 'gen-abc' })
  })

  it('handles data lines split across pushes', () => {
    const full = chunk({ usage: { prompt_tokens: 5, completion_tokens: 3 } })
    const scanner = createSseUsageScanner()
    scanner.push(full.slice(0, 18))
    scanner.push(full.slice(18))
    expect(scanner.end().usage).toEqual({ tokensIn: 5, tokensOut: 3, cost: null })
  })

  it('flushes a trailing line without a final newline', () => {
    const scanner = createSseUsageScanner()
    scanner.push(`data: ${JSON.stringify({ usage: { prompt_tokens: 2, completion_tokens: 1 } })}`)
    expect(scanner.end().usage).toEqual({ tokensIn: 2, tokensOut: 1, cost: null })
  })

  it('keeps the LAST usage block when several appear', () => {
    const scanner = createSseUsageScanner()
    scanner.push(chunk({ usage: { prompt_tokens: 1, completion_tokens: 1 } }))
    scanner.push(chunk({ usage: { prompt_tokens: 9, completion_tokens: 4 } }))
    expect(scanner.end().usage).toEqual({ tokensIn: 9, tokensOut: 4, cost: null })
  })

  it('ignores keepalives, comments and malformed frames', () => {
    const scanner = createSseUsageScanner()
    scanner.push(': keepalive\n\n')
    scanner.push('data: {broken json\n')
    scanner.push('event: ping\n')
    expect(scanner.end()).toEqual({ usage: null, generationId: null })
  })

  it('only JSON-parses usage lines once the generation id is known', () => {
    const realParse = JSON.parse
    let calls = 0
    JSON.parse = ((text: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
      calls++
      return realParse(text, reviver)
    }) as typeof JSON.parse
    try {
      const scanner = createSseUsageScanner()
      scanner.push(chunk({ id: 'gen-1', choices: [{ delta: { content: 'a' } }] })) // parsed (id)
      for (let i = 0; i < 50; i++) scanner.push(chunk({ id: 'gen-1', choices: [{ delta: { content: 'x' } }] }))
      // A literal "usage" in generated text is JSON-escaped and must not trigger a parse.
      scanner.push(chunk({ id: 'gen-1', choices: [{ delta: { content: 'the "usage" field' } }] }))
      scanner.push(chunk({ id: 'gen-1', usage: { prompt_tokens: 3, completion_tokens: 4 } })) // parsed (usage)
      const result = scanner.end()
      expect(calls).toBe(2)
      expect(result).toEqual({ usage: { tokensIn: 3, tokensOut: 4, cost: null }, generationId: 'gen-1' })
    } finally {
      JSON.parse = realParse
    }
  })

  it('gives up looking for the id after a few lines without one', () => {
    const scanner = createSseUsageScanner()
    for (let i = 0; i < 5; i++) scanner.push(chunk({ choices: [{ delta: { content: 'x' } }] }))
    scanner.push(chunk({ id: 'gen-late', choices: [] }))
    expect(scanner.end().generationId).toBeNull()
  })

  it('still captures the id from the usage chunk when the early lines lacked it', () => {
    const scanner = createSseUsageScanner()
    for (let i = 0; i < 5; i++) scanner.push(chunk({ choices: [{ delta: { content: 'x' } }] }))
    scanner.push(chunk({ id: 'gen-final', usage: { prompt_tokens: 1, completion_tokens: 1 } }))
    expect(scanner.end().generationId).toBe('gen-final')
  })
})

describe('mapUpstreamError', () => {
  const GENERIC = "NoteFlow AI's model provider returned an error. Try again later."

  it('maps image rejections to 400 image_input_unsupported, keeping the literal image_url', () => {
    const bodies = [
      '{"error":{"message":"unknown variant `image_url`, expected `text`"}}',
      '{"error":{"message":"This model does not support image input"}}',
      '{"error":{"message":"No endpoints found that support Vision"}}',
      '{"error":{"message":"multimodal content is not supported"}}',
    ]
    for (const body of bodies) {
      const mapped = mapUpstreamError(400, body)
      expect(mapped.status).toBe(400)
      expect(mapped.body.error.code).toBe('image_input_unsupported')
      // electron/main.ts friendlyChatError detects image errors on this literal.
      expect(mapped.body.error.message).toContain('image_url')
      expect(mapped.outOfCredit).toBe(false)
    }
    expect(mapUpstreamError(404, 'No endpoints found that support image input').body.error.code).toBe(
      'image_input_unsupported'
    )
  })

  it('maps image size errors to 400 image_too_large (checked before "unsupported"), keeping image_url', () => {
    const bodies = [
      '{"error":{"message":"messages.0.content.1.image.source.base64: image exceeds 5 MB maximum: 6291456 bytes > 5242880 bytes"}}',
      '{"error":{"message":"Image too large. Max size is 20MB."}}',
      '{"error":{"message":"image_url: image dimensions exceed the maximum of 8000 pixels"}}',
      'The image is too big for vision processing',
    ]
    for (const body of bodies) {
      const mapped = mapUpstreamError(400, body)
      expect(mapped.status).toBe(400)
      expect(mapped.body.error.code).toBe('image_too_large')
      expect(mapped.body.error.message).toContain('image_url')
      expect(mapped.body.error.message).toMatch(/too large/)
      expect(mapped.outOfCredit).toBe(false)
    }
  })

  it('a vision model rejecting one image for another reason is NOT "does not accept image input"', () => {
    // Bare "image" without unsupported/size wording → generic, never a false "no vision" message.
    for (const body of ['Could not process image', 'Invalid image data in message 3', 'image format webp-anim not recognized']) {
      expect(mapUpstreamError(400, body).body.error.code).toBe('upstream_error')
    }
  })

  it('context-length errors win even when they mention images or sizes', () => {
    expect(
      mapUpstreamError(400, 'prompt is too long: 210000 tokens > 200000 maximum (images count toward the limit)').body
        .error.code
    ).toBe('context_length_exceeded')
  })

  it('maps context-length errors to 400 context_length_exceeded with a generic message', () => {
    const bodies = [
      '{"error":{"code":"context_length_exceeded","message":"..."}}',
      "This endpoint's maximum context length is 200000 tokens",
      'prompt is too long: 250000 tokens > 200000 maximum',
    ]
    for (const body of bodies) {
      const mapped = mapUpstreamError(400, body)
      expect(mapped.status).toBe(400)
      expect(mapped.body.error.code).toBe('context_length_exceeded')
      expect(mapped.body.error.message).not.toContain('200000')
    }
  })

  it('maps everything else to a generic 502 that never echoes the upstream body', () => {
    for (const [status, body] of [
      [500, 'internal provider failure at secret-host-123'],
      [503, 'overloaded'],
      [429, 'rate limited by provider'],
      [400, 'invalid tool schema in secret-host-123'],
      [401, 'invalid api key sk-or-xxx'],
    ] as Array<[number, string]>) {
      const mapped = mapUpstreamError(status, body)
      expect(mapped).toEqual({
        status: 502,
        body: { error: { message: GENERIC, type: 'server_error', code: 'upstream_error' } },
        outOfCredit: false,
      })
    }
  })

  it('5xx bodies mentioning images are still a generic 502 (not the user’s image)', () => {
    expect(mapUpstreamError(500, 'image pipeline crashed').body.error.code).toBe('upstream_error')
  })

  it('flags 402 (operator out of OpenRouter credit) but returns the generic 502', () => {
    const mapped = mapUpstreamError(402, '{"error":{"message":"Insufficient credits"}}')
    expect(mapped.status).toBe(502)
    expect(mapped.body.error.code).toBe('upstream_error')
    expect(mapped.body.error.message).toBe(GENERIC)
    expect(mapped.outOfCredit).toBe(true)
  })
})
