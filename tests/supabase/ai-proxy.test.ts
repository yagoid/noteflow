import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ALLOWED_MODELS,
  DEFAULT_MONTHLY_BUDGET_USD,
  FALLBACK_MODEL_CATALOG,
  FALLBACK_MODEL_ALIASES,
  LEGACY_USAGE_UNITS,
  MAX_ALIAS_HOPS,
  catalogFromRows,
  aliasEdgesFromRows,
  resolveModelAliases,
  resolveRequestedModel,
  parseAllowedModelsOverride,
  applyAllowedModelsOverride,
  catalogModelIds,
  type CatalogModel,
  type ModelCatalog,
  parseMonthlyBudgetUsd,
  legacyUsageUnits,
  computeCostUsd,
  costIndexes,
  isModelAllowed,
  hasAiEntitlement,
  computeQuota,
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
  estimateInputTokens,
  estimateReservationUsd,
  isDeclaredBodyTooLarge,
  readBodyWithLimit,
  parseReserveResult,
  extractGenerationId,
  parseGenerationStats,
  mapUpstreamError,
} from '../../supabase/functions/ai-proxy/logic'

const model = (id: string, extra: Partial<CatalogModel> = {}): CatalogModel => ({
  id,
  images: true,
  priceInUsd: 1,
  priceOutUsd: 2,
  reasoningEffort: null,
  recommended: false,
  ...extra,
})

// A catalog that only exists in the table (not in the backup constants) — what
// "a new model inserted in ai_models" looks like to the proxy.
const TABLE_CATALOG: ModelCatalog = [
  model('cheap/base', { images: false, priceInUsd: 0.1, priceOutUsd: 0.4, recommended: true }),
  model('new/model-x', { priceInUsd: 3, priceOutUsd: 15, reasoningEffort: 'medium' }),
  model('mid/model-y', { images: false, priceInUsd: 0.3, priceOutUsd: 1 }),
]

/** Within floating-point noise (USD amounts are fractional). */
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-12)

describe('catalogFromRows (public.ai_models → catalog)', () => {
  const row = (id: unknown, extra: Record<string, unknown> = {}) => ({
    id,
    images: true,
    enabled: true,
    sort_order: 0,
    price_in_usd: 1,
    price_out_usd: 2,
    reasoning_effort: null,
    recommended: false,
    replaced_by: null,
    ...extra,
  })

  it('keeps only enabled rows, ordered by sort_order, with prices / effort / recommended', () => {
    expect(
      catalogFromRows([
        row('c/third', { sort_order: 30 }),
        row('a/first', { sort_order: 10, images: false, price_in_usd: 0.15, price_out_usd: 0.6, recommended: true }),
        row('off/disabled', { sort_order: 0, enabled: false, replaced_by: 'a/first' }),
        row('b/second', { sort_order: 20, reasoning_effort: 'low' }),
      ])
    ).toEqual([
      model('a/first', { images: false, priceInUsd: 0.15, priceOutUsd: 0.6, recommended: true }),
      model('b/second', { reasoningEffort: 'low' }),
      model('c/third'),
    ])
  })

  it('breaks sort_order ties by id (deterministic order)', () => {
    expect(catalogModelIds(catalogFromRows([row('z/z'), row('a/a'), row('m/m')])!)).toEqual(['a/a', 'm/m', 'z/z'])
  })

  it('accepts prices serialized as strings, and a zero price (free model)', () => {
    expect(catalogFromRows([row('a/a', { price_in_usd: '0.435', price_out_usd: 0 })])).toEqual([
      model('a/a', { priceInUsd: 0.435, priceOutUsd: 0 }),
    ])
  })

  it('a missing recommended / reasoning_effort reads as false / null', () => {
    expect(catalogFromRows([row('a/a', { recommended: undefined, reasoning_effort: undefined })])).toEqual([model('a/a')])
    expect(catalogFromRows([row('a/a', { recommended: 'yes' })])).toEqual([model('a/a')])
  })

  it('skips malformed rows without dropping the good ones (an enabled row without a price is never served)', () => {
    expect(
      catalogFromRows([
        row(''),
        row('   '),
        row(42),
        row('bad/no-price-in', { price_in_usd: null }),
        row('bad/no-price-out', { price_out_usd: undefined }),
        row('bad/neg-price', { price_in_usd: -1 }),
        row('bad/nan-price', { price_out_usd: 'abc' }),
        row('bad/images', { images: 'yes' }),
        row('bad/effort', { reasoning_effort: 'extreme' }),
        row('bad/enabled-string', { enabled: 'true' }),
        null,
        'nope',
        [],
        row(' ok/model ', { sort_order: 5 }),
      ])
    ).toEqual([model('ok/model')])
  })

  it('keeps the first occurrence of a repeated id', () => {
    expect(catalogFromRows([row('a/a', { price_in_usd: 2 }), row('a/a', { price_in_usd: 9 })])).toEqual([
      model('a/a', { priceInUsd: 2 }),
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

  it('a pre-0013 row (quota_multiplier, no prices) is not usable', () => {
    expect(catalogFromRows([{ id: 'a/a', quota_multiplier: 1, images: true, enabled: true, sort_order: 0 }])).toBeNull()
  })
})

describe('model aliases (retired id → successor)', () => {
  it('aliasEdgesFromRows reads replaced_by from any row, enabled or not', () => {
    expect(
      aliasEdgesFromRows([
        { id: 'old/a', enabled: false, replaced_by: 'new/a' },
        { id: 'old/b', enabled: true, replaced_by: ' new/b ' },
        { id: 'live/c', enabled: true, replaced_by: null },
        { id: 'self/d', replaced_by: 'self/d' },
        { id: '__proto__', replaced_by: 'x' },
        { id: '', replaced_by: 'x' },
        { id: 'old/a', replaced_by: 'other' }, // repeated id: first edge wins
        null,
        'nope',
      ])
    ).toEqual({ 'old/a': 'new/a', 'old/b': 'new/b' })
    expect(aliasEdgesFromRows(null)).toEqual({})
  })

  it('resolves each retired id to a SERVED successor, following short chains', () => {
    const edges = { 'v1/a': 'v2/a', 'v2/a': 'cheap/base', 'gone/x': 'new/model-x' }
    expect(resolveModelAliases(edges, TABLE_CATALOG)).toEqual({ 'v1/a': 'cheap/base', 'v2/a': 'cheap/base', 'gone/x': 'new/model-x' })
  })

  it('drops cycles, chains that never reach a served model and over-long chains', () => {
    expect(resolveModelAliases({ 'a/a': 'b/b', 'b/b': 'a/a' }, TABLE_CATALOG)).toEqual({})
    expect(resolveModelAliases({ 'a/a': 'also/retired' }, TABLE_CATALOG)).toEqual({})
    const long: Record<string, string> = {}
    for (let i = 0; i < MAX_ALIAS_HOPS; i++) long[`m/${i}`] = `m/${i + 1}`
    long[`m/${MAX_ALIAS_HOPS}`] = 'cheap/base'
    expect(resolveModelAliases(long, TABLE_CATALOG)['m/0']).toBeUndefined()
    expect(resolveModelAliases(long, TABLE_CATALOG)[`m/${MAX_ALIAS_HOPS}`]).toBe('cheap/base')
  })

  it('a served id is never aliased away, and a successor restricted by AI_ALLOWED_MODELS yields no alias', () => {
    expect(resolveModelAliases({ 'cheap/base': 'new/model-x' }, TABLE_CATALOG)).toEqual({})
    const { catalog } = applyAllowedModelsOverride(TABLE_CATALOG, 'cheap/base')
    expect(resolveModelAliases({ 'old/x': 'new/model-x' }, catalog)).toEqual({})
  })

  it('resolveRequestedModel: served id as-is, alias → successor, anything else → null', () => {
    const aliases = { 'old/x': 'new/model-x' }
    expect(resolveRequestedModel('mid/model-y', TABLE_CATALOG, aliases)?.id).toBe('mid/model-y')
    expect(resolveRequestedModel('old/x', TABLE_CATALOG, aliases)).toEqual(TABLE_CATALOG[1])
    expect(resolveRequestedModel('unknown/model', TABLE_CATALOG, aliases)).toBeNull()
    expect(resolveRequestedModel(undefined, TABLE_CATALOG, aliases)).toBeNull()
    expect(resolveRequestedModel(42, TABLE_CATALOG, aliases)).toBeNull()
    expect(resolveRequestedModel('__proto__', TABLE_CATALOG, aliases)).toBeNull()
  })

  it('the backup aliases map every model of the old hardcoded catalog (pre-b74fad0 internal builds) to a served successor', () => {
    const resolved = resolveModelAliases(FALLBACK_MODEL_ALIASES, FALLBACK_MODEL_CATALOG)
    expect(resolved).toEqual(FALLBACK_MODEL_ALIASES)
    // The old default model keeps working — rewritten to the recommended one.
    expect(resolveRequestedModel('deepseek/deepseek-v4-pro', FALLBACK_MODEL_CATALOG, resolved)?.id).toBe(
      'deepseek/deepseek-v4.1-flash-1017'
    )
    expect(resolveRequestedModel('x-ai/grok-4.5', FALLBACK_MODEL_CATALOG, resolved)?.id).toBe('openai/gpt-5.6-sol')
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
      expect(Number.isFinite(m.priceInUsd) && m.priceInUsd >= 0).toBe(true)
      expect(Number.isFinite(m.priceOutUsd) && m.priceOutUsd >= 0).toBe(true)
      expect(typeof m.images).toBe('boolean')
    }
  })

  it('the first model is the recommended one (the client default)', () => {
    expect(FALLBACK_MODEL_CATALOG[0].recommended).toBe(true)
    expect(FALLBACK_MODEL_CATALOG.filter((m) => m.recommended)).toHaveLength(1)
  })
})

describe('AI_ALLOWED_MODELS emergency override', () => {
  it('parses a comma-separated override with whitespace tolerance', () => {
    expect(parseAllowedModelsOverride(' openai/gpt-5.6-luna , openai/gpt-5.6-sol ,')).toEqual([
      'openai/gpt-5.6-luna',
      'openai/gpt-5.6-sol',
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
    const { catalog, overrideIgnored } = applyAllowedModelsOverride(TABLE_CATALOG, 'mid/model-y,new/model-x')
    expect(overrideIgnored).toBe(false)
    expect(catalog).toEqual([TABLE_CATALOG[1], TABLE_CATALOG[2]])
  })

  it('cannot ADD a model the catalog does not have (it would have no price)', () => {
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

describe('parseMonthlyBudgetUsd', () => {
  it('parses a positive amount, decimals included', () => {
    expect(parseMonthlyBudgetUsd('5')).toBe(5)
    expect(parseMonthlyBudgetUsd('2.5')).toBe(2.5)
    expect(parseMonthlyBudgetUsd(' 3 ')).toBe(3)
  })

  it('falls back to the default ($2) on missing/garbage/non-positive values', () => {
    expect(DEFAULT_MONTHLY_BUDGET_USD).toBe(2)
    for (const raw of [undefined, null, '', '   ', 'lots', '0', '-5', 'Infinity', 'NaN', '$2']) {
      expect(parseMonthlyBudgetUsd(raw)).toBe(DEFAULT_MONTHLY_BUDGET_USD)
    }
  })
})

describe('legacyUsageUnits (GET /usage + X-NoteFlow-Tokens-* contract)', () => {
  it('keeps the 3M "token" scale pre-b74fad0 builds render, with used = share of the USD budget', () => {
    expect(LEGACY_USAGE_UNITS).toBe(3_000_000)
    expect(legacyUsageUnits(0, 2)).toEqual({ used: 0, limit: 3_000_000 })
    expect(legacyUsageUnits(1, 2)).toEqual({ used: 1_500_000, limit: 3_000_000 })
    expect(legacyUsageUnits(0.5, 2)).toEqual({ used: 750_000, limit: 3_000_000 })
    expect(legacyUsageUnits(2, 2)).toEqual({ used: 3_000_000, limit: 3_000_000 })
  })

  it('returns integers, may exceed the limit (reservation overshoot) and never exposes USD', () => {
    const units = legacyUsageUnits(0.123456789, 2)
    expect(Number.isInteger(units.used)).toBe(true)
    expect(units.used).toBe(Math.round((0.123456789 / 2) * 3_000_000))
    expect(legacyUsageUnits(2.2, 2).used).toBe(3_300_000)
  })

  it('treats negative/NaN spend as 0 and survives a broken budget', () => {
    expect(legacyUsageUnits(-1, 2).used).toBe(0)
    expect(legacyUsageUnits(NaN, 2).used).toBe(0)
    expect(legacyUsageUnits(1, 0)).toEqual({ used: 0, limit: 3_000_000 })
  })
})

describe('isModelAllowed', () => {
  const allowed = ['openai/gpt-5.6-luna', 'openai/gpt-5.6-sol']

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
  it('reports the remaining budget below the limit', () => {
    expect(computeQuota(0.5, 2)).toEqual({ exceeded: false, remaining: 1.5 })
    expect(computeQuota(0, 100)).toEqual({ exceeded: false, remaining: 100 })
  })

  it('flags exceeded at and beyond the limit, clamping remaining at 0', () => {
    expect(computeQuota(2, 2)).toEqual({ exceeded: true, remaining: 0 })
    expect(computeQuota(2.4, 2)).toEqual({ exceeded: true, remaining: 0 })
  })

  it('treats negative/NaN usage as zero', () => {
    expect(computeQuota(-5, 100)).toEqual({ exceeded: false, remaining: 100 })
    expect(computeQuota(NaN, 100)).toEqual({ exceeded: false, remaining: 100 })
  })

  it('no tolerance: rejects a request whose estimate does not fit in what is left', () => {
    // 3% of a $2 budget left ($0.06): a cheap request fits, a pricey one does not.
    expect(computeQuota(1.94, 2, 0.005).exceeded).toBe(false)
    expect(computeQuota(1.94, 2, 0.16).exceeded).toBe(true)
    // Exactly filling the budget is allowed; one cent over is not.
    expect(computeQuota(1.5, 2, 0.5).exceeded).toBe(false)
    expect(computeQuota(1.5, 2, 0.51).exceeded).toBe(true)
    // A broken estimate counts as 0 (the used >= limit rule still applies).
    expect(computeQuota(1, 2, NaN).exceeded).toBe(false)
    expect(computeQuota(2, 2, -1).exceeded).toBe(true)
  })

  it('a typical sol request reserves ~8% of the default budget (blocked below that), deepseek a fraction of 1%', () => {
    const body = buildUpstreamBody({ model: 'x', messages: [{ role: 'user', content: 'x'.repeat(80_000) }], max_tokens: 4096 })
    const sol = estimateReservationUsd(body, 'openai/gpt-5.6-sol')
    const deepseek = estimateReservationUsd(body, 'deepseek/deepseek-v4.1-flash-1017')
    expect(sol / DEFAULT_MONTHLY_BUDGET_USD).toBeGreaterThan(0.05)
    expect(sol / DEFAULT_MONTHLY_BUDGET_USD).toBeLessThan(0.12)
    expect(deepseek / DEFAULT_MONTHLY_BUDGET_USD).toBeLessThan(0.01)
  })
})

describe('computeCostUsd (what a settled request charges against the quota)', () => {
  it("uses OpenRouter's reported cost when present (reasoning and caching included)", () => {
    expect(computeCostUsd({ tokensIn: 1_000_000, tokensOut: 1_000_000, cost: 0.0042 }, 'new/model-x', TABLE_CATALOG)).toBe(0.0042)
    expect(computeCostUsd({ tokensIn: 500, tokensOut: 50, cost: 0 }, 'new/model-x', TABLE_CATALOG)).toBe(0)
  })

  it('falls back to real tokens × the list prices of the catalog when the cost is missing', () => {
    // new/model-x: $3 in / $15 out per 1M.
    close(computeCostUsd({ tokensIn: 10_000, tokensOut: 1_000, cost: null }, 'new/model-x', TABLE_CATALOG), 0.03 + 0.015)
    // Backup catalog by default: deepseek flash $0.15 / $0.60.
    close(computeCostUsd({ tokensIn: 1_000_000, tokensOut: 1_000_000, cost: null }, 'deepseek/deepseek-v4.1-flash-1017'), 0.75)
  })

  it('treats malformed token sides as 0, and prices an unknown model at the priciest catalog rates', () => {
    close(computeCostUsd({ tokensIn: NaN, tokensOut: 1_000_000, cost: null }, 'mid/model-y', TABLE_CATALOG), 1)
    close(computeCostUsd({ tokensIn: -5, tokensOut: 0, cost: null }, 'mid/model-y', TABLE_CATALOG), 0)
    close(computeCostUsd({ tokensIn: 1_000_000, tokensOut: 1_000_000, cost: null }, 'who/knows', TABLE_CATALOG), 3 + 15)
  })
})

describe('openAiErrorBody / modelsListBody', () => {
  it('shapes an OpenAI-compatible error', () => {
    expect(openAiErrorBody('nope', 'permission_error', 'subscription_required')).toEqual({
      error: { message: 'nope', type: 'permission_error', code: 'subscription_required' },
    })
  })

  it('shapes the OpenAI models list, in order, with images / recommended / cost_index — never prices', () => {
    expect(modelsListBody(TABLE_CATALOG)).toEqual({
      object: 'list',
      data: [
        { id: 'cheap/base', object: 'model', images: false, recommended: true, cost_index: 1 },
        // (0.9×3 + 0.1×15) / (0.9×0.1 + 0.1×0.4) = 4.2 / 0.13 ≈ 32.3
        { id: 'new/model-x', object: 'model', images: true, recommended: false, cost_index: 32 },
        // (0.27 + 0.1) / 0.13 ≈ 2.85 → 3
        { id: 'mid/model-y', object: 'model', images: false, recommended: false, cost_index: 3 },
      ],
    })
    for (const entry of modelsListBody(FALLBACK_MODEL_CATALOG).data) {
      expect(entry).not.toHaveProperty('priceInUsd')
      expect(entry).not.toHaveProperty('price_in_usd')
    }
  })

  it('cost_index of the backup catalog: deepseek 1, luna 2, haiku 1, mimo 2, sol 29', () => {
    expect(costIndexes(FALLBACK_MODEL_CATALOG)).toEqual({
      'deepseek/deepseek-v4.1-flash-1017': 1,
      'openai/gpt-5.6-luna': 2,
      'anthropic/claude-haiku-5.5': 1,
      'xiaomi/mimo-v2.6-pro': 2,
      'openai/gpt-5.6-sol': 29,
    })
  })

  it('cost_index: the first model is the reference without a recommended one; minimum 1; free reference → all 1', () => {
    const noRec = TABLE_CATALOG.map((m) => ({ ...m, recommended: false }))
    expect(costIndexes([noRec[2], noRec[0]])).toEqual({ 'mid/model-y': 1, 'cheap/base': 1 })
    expect(costIndexes([model('free/a', { priceInUsd: 0, priceOutUsd: 0 }), model('paid/b')])).toEqual({
      'free/a': 1,
      'paid/b': 1,
    })
    expect(costIndexes([])).toEqual({})
  })

  it('serves the override-restricted catalog when AI_ALLOWED_MODELS is set', () => {
    const { catalog } = applyAllowedModelsOverride(TABLE_CATALOG, 'new/model-x')
    expect(modelsListBody(catalog).data.map((m) => m.id)).toEqual(['new/model-x'])
  })
})

describe('buildUpstreamBody — resolved model (alias rewrite + server-side reasoning)', () => {
  const client = () => ({
    model: 'deepseek/deepseek-v4-pro',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
    max_tokens: 4096,
    reasoning: { effort: 'high', max_tokens: 50_000 },
  })

  it('rewrites the model to the resolved catalog id (a retired alias → its successor)', () => {
    const successor = FALLBACK_MODEL_CATALOG[0]
    const body = buildUpstreamBody(client(), successor)
    expect(body.model).toBe('deepseek/deepseek-v4.1-flash-1017')
    // No effort configured → no reasoning at all (the client's is dropped).
    expect(body).not.toHaveProperty('reasoning')
  })

  it("injects the catalog's reasoning effort, never the client's", () => {
    const sol = FALLBACK_MODEL_CATALOG.find((m) => m.id === 'openai/gpt-5.6-sol')!
    expect(buildUpstreamBody({ ...client(), model: sol.id }, sol).reasoning).toEqual({ effort: 'low' })
    expect(buildUpstreamBody(client(), model('x/y', { reasoningEffort: 'none' })).reasoning).toEqual({ effort: 'none' })
  })

  it('keeps reasoning_details on assistant messages verbatim (the agentic loop re-sends them)', () => {
    const details = [{ type: 'reasoning.text', text: 'Let me look', signature: 'sig==', format: 'anthropic-claude-v1', index: 0 }]
    const messages = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_notes', arguments: '{}' } }],
        reasoning_details: details,
      },
      { role: 'tool', tool_call_id: 'c1', content: '[]' },
    ]
    const body = buildUpstreamBody({ ...client(), messages }, FALLBACK_MODEL_CATALOG[0])
    expect(body.messages).toEqual(messages)
  })
})

describe('estimateReservationUsd', () => {
  const utf8 = (s: string) => new TextEncoder().encode(s).length

  it('estimateInputTokens is ceil(serialized bytes / 4) for a text body', () => {
    const body = buildUpstreamBody({ model: 'm', messages: [{ role: 'user', content: 'hello world' }], max_tokens: 4096 })
    expect(estimateInputTokens(body)).toBe(Math.ceil(utf8(JSON.stringify(body)) / 4))
  })

  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    const ascii = buildUpstreamBody({ model: 'm', messages: [{ role: 'user', content: 'aaaa' }], max_tokens: 1 })
    const accented = buildUpstreamBody({ model: 'm', messages: [{ role: 'user', content: 'ññññ' }], max_tokens: 1 })
    expect(estimateInputTokens(accented)).toBeGreaterThan(estimateInputTokens(ascii))
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
    const small = estimateInputTokens(withImage('data:image/png;base64,AAAA'))
    const huge = estimateInputTokens(withImage(`data:image/png;base64,${hugeBase64}`))
    // Payload size is irrelevant for images…
    expect(huge).toBe(small)
    // …which are charged at the flat rate (2 images) on top of the text.
    const textOnly = buildUpstreamBody({
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'describe' }, { type: 'image_url' }, { type: 'image_url' }] }],
      max_tokens: 1000,
    })
    expect(small).toBe(Math.ceil(utf8(JSON.stringify(textOnly)) / 4) + 2 * IMAGE_PART_TOKENS)
    expect(huge).toBeLessThan(10_000)
  })

  it('is (input × price_in + clamped max_tokens × price_out) / 1e6 at the model list prices', () => {
    const body = buildUpstreamBody({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 4096 })
    const input = estimateInputTokens(body)
    close(estimateReservationUsd(body, 'new/model-x', TABLE_CATALOG), (input * 3 + 4096 * 15) / 1e6)
    close(estimateReservationUsd(body, 'cheap/base', TABLE_CATALOG), (input * 0.1 + 4096 * 0.4) / 1e6)
    // The backup catalog by default (gpt-5.6-sol: $4 / $20).
    close(estimateReservationUsd(body, 'openai/gpt-5.6-sol'), (input * 4 + 4096 * 20) / 1e6)
  })

  it('uses the clamped output cap when max_tokens is missing or absurd', () => {
    const body = { model: 'm', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10_000_000 }
    const input = estimateInputTokens(body)
    close(estimateReservationUsd(body, 'mid/model-y', TABLE_CATALOG), (input * 0.3 + MAX_OUTPUT_TOKENS * 1) / 1e6)
  })

  it('a worst-case request stays bounded (8 MiB body on the priciest backup model)', () => {
    const body = { model: 'm', messages: [{ role: 'user', content: 'x'.repeat(MAX_BODY_BYTES) }], max_tokens: MAX_OUTPUT_TOKENS }
    // ~2.1M input tokens × $4 + 8192 × $20 ≈ $8.55 — the reservation, not the real bill.
    expect(estimateReservationUsd(body, 'openai/gpt-5.6-sol')).toBeLessThan(9)
  })

  it('never throws on odd message shapes', () => {
    const body = { model: 'm', messages: [null, 'x', { role: 'user', content: [null, 3] }], max_tokens: 5 }
    expect(estimateReservationUsd(body, 'mid/model-y', TABLE_CATALOG)).toBeGreaterThan(0)
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
