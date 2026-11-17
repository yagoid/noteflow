// Inline AI autocomplete, server side: the pure logic of POST /autocomplete in
// supabase/functions/ai-proxy/logic.ts, plus textual pins on migration 0018
// (the SQL cannot be executed here — the pins fix the parts of it the Edge
// Function and the deployed proxy depend on).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  AUTOCOMPLETE_CURSOR_MARK,
  AUTOCOMPLETE_FALLBACK_PRICE,
  AUTOCOMPLETE_MAX_AFTER_CHARS,
  AUTOCOMPLETE_MAX_BEFORE_CHARS,
  AUTOCOMPLETE_MAX_BODY_BYTES,
  AUTOCOMPLETE_MAX_TOKENS,
  AUTOCOMPLETE_SYSTEM_PROMPT,
  AUTOCOMPLETE_TEMPERATURE,
  DEFAULT_AUTOCOMPLETE_MODEL,
  DEFAULT_AUTOCOMPLETE_SHARE,
  FALLBACK_MODEL_CATALOG,
  LEGACY_USAGE_UNITS,
  REASONING_EFFORTS,
  autocompleteCharge,
  autocompletePricing,
  autocompleteUsageUnits,
  buildAutocompleteBody,
  decideAutocompleteQuota,
  estimateInputTokens,
  legacyUsageUnits,
  modelPricesFromCatalog,
  modelPricesFromRows,
  parseAutocompleteBudget,
  parseAutocompleteModel,
  parseAutocompleteRequest,
  parseAutocompleteShare,
  trimAutocompleteContext,
} from '../../supabase/functions/ai-proxy/logic'

/** Within floating-point noise (USD amounts are fractional). */
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-12)

describe('parseAutocompleteModel / parseAutocompleteShare (env)', () => {
  it('defaults to Haiku, and trims a configured id', () => {
    expect(DEFAULT_AUTOCOMPLETE_MODEL).toBe('anthropic/claude-haiku-5.5')
    expect(parseAutocompleteModel(undefined)).toBe(DEFAULT_AUTOCOMPLETE_MODEL)
    expect(parseAutocompleteModel(null)).toBe(DEFAULT_AUTOCOMPLETE_MODEL)
    expect(parseAutocompleteModel('   ')).toBe(DEFAULT_AUTOCOMPLETE_MODEL)
    expect(parseAutocompleteModel(' openai/gpt-5.6-luna ')).toBe('openai/gpt-5.6-luna')
  })

  it('share defaults to 30 % and only accepts a number in (0, 1]', () => {
    expect(DEFAULT_AUTOCOMPLETE_SHARE).toBe(0.3)
    expect(parseAutocompleteShare(undefined)).toBe(0.3)
    expect(parseAutocompleteShare(null)).toBe(0.3)
    expect(parseAutocompleteShare('')).toBe(0.3)
    expect(parseAutocompleteShare('  ')).toBe(0.3)
    expect(parseAutocompleteShare('0.5')).toBe(0.5)
    expect(parseAutocompleteShare('1')).toBe(1)
    expect(parseAutocompleteShare('0.01')).toBe(0.01)
  })

  it('an invalid share falls back to the default (never off, never above 100 %)', () => {
    for (const bad of ['0', '-0.2', '1.01', '30', 'abc', 'NaN', 'Infinity', '30%']) {
      expect(parseAutocompleteShare(bad)).toBe(0.3)
    }
  })
})

describe('trimAutocompleteContext', () => {
  it('leaves a short context untouched', () => {
    expect(trimAutocompleteContext('Hello wor', 'ld.')).toEqual({ before: 'Hello wor', after: 'ld.' })
    expect(trimAutocompleteContext('x', '')).toEqual({ before: 'x', after: '' })
  })

  it('keeps the LAST chars of before and the FIRST chars of after', () => {
    const before = 'A'.repeat(500) + 'B'.repeat(AUTOCOMPLETE_MAX_BEFORE_CHARS)
    const after = 'C'.repeat(AUTOCOMPLETE_MAX_AFTER_CHARS) + 'D'.repeat(500)
    const trimmed = trimAutocompleteContext(before, after)
    expect(trimmed.before).toBe('B'.repeat(AUTOCOMPLETE_MAX_BEFORE_CHARS))
    expect(trimmed.after).toBe('C'.repeat(AUTOCOMPLETE_MAX_AFTER_CHARS))
  })

  it('pins the limits (they bound the input cost of a suggestion)', () => {
    expect(AUTOCOMPLETE_MAX_BEFORE_CHARS).toBe(2000)
    expect(AUTOCOMPLETE_MAX_AFTER_CHARS).toBe(300)
    expect(AUTOCOMPLETE_MAX_BODY_BYTES).toBe(32 * 1024)
    expect(AUTOCOMPLETE_MAX_TOKENS).toBe(48)
  })

  it('never leaves half a surrogate pair at a cut', () => {
    // The cut of `before` lands between the two halves of the emoji.
    const before = 'x😀' + 'a'.repeat(AUTOCOMPLETE_MAX_BEFORE_CHARS - 1)
    const b = trimAutocompleteContext(before, '').before
    expect(b).toBe('a'.repeat(AUTOCOMPLETE_MAX_BEFORE_CHARS - 1))
    // Same for `after`.
    const after = 'a'.repeat(AUTOCOMPLETE_MAX_AFTER_CHARS - 1) + '😀x'
    const a = trimAutocompleteContext('x', after).after
    expect(a).toBe('a'.repeat(AUTOCOMPLETE_MAX_AFTER_CHARS - 1))
    // A whole pair right at the edge is kept.
    const fits = '😀' + 'a'.repeat(AUTOCOMPLETE_MAX_BEFORE_CHARS - 2)
    expect(trimAutocompleteContext('zz' + fits, '').before).toBe(fits)
  })
})

describe('parseAutocompleteRequest (body of POST /autocomplete)', () => {
  const parse = (body: unknown) => parseAutocompleteRequest(JSON.stringify(body))

  it('accepts { before } and { before, after }', () => {
    expect(parse({ before: 'Buy mil' })).toEqual({ ok: true, before: 'Buy mil', after: '' })
    expect(parse({ before: 'Buy ', after: ' and eggs' })).toEqual({ ok: true, before: 'Buy ', after: ' and eggs' })
    expect(parse({ before: 'Buy ', after: null })).toEqual({ ok: true, before: 'Buy ', after: '' })
  })

  it('keeps the whitespace of before (a trailing space/newline is meaningful)', () => {
    expect(parse({ before: '- one\n- ' })).toEqual({ ok: true, before: '- one\n- ', after: '' })
  })

  it('returns the context already trimmed', () => {
    const res = parse({ before: 'a'.repeat(5000), after: 'b'.repeat(5000) })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.before).toHaveLength(AUTOCOMPLETE_MAX_BEFORE_CHARS)
    expect(res.after).toHaveLength(AUTOCOMPLETE_MAX_AFTER_CHARS)
  })

  it('rejects a missing / non-string / blank before', () => {
    expect(parse({})).toEqual({ ok: false })
    expect(parse({ after: 'x' })).toEqual({ ok: false })
    expect(parse({ before: 42 })).toEqual({ ok: false })
    expect(parse({ before: null })).toEqual({ ok: false })
    expect(parse({ before: ['a'] })).toEqual({ ok: false })
    expect(parse({ before: '' })).toEqual({ ok: false })
    expect(parse({ before: '  \n\t ' })).toEqual({ ok: false })
  })

  it('rejects a non-string after', () => {
    expect(parse({ before: 'x', after: 3 })).toEqual({ ok: false })
    expect(parse({ before: 'x', after: {} })).toEqual({ ok: false })
  })

  it('rejects anything that is not a JSON object', () => {
    expect(parseAutocompleteRequest('')).toEqual({ ok: false })
    expect(parseAutocompleteRequest('{not json')).toEqual({ ok: false })
    expect(parse('before')).toEqual({ ok: false })
    expect(parse(['x'])).toEqual({ ok: false })
    expect(parse(null)).toEqual({ ok: false })
  })

  it('ignores every other field: the client chooses nothing', () => {
    const res = parse({ before: 'x', model: 'openai/gpt-5.6-sol', max_tokens: 9999, reasoning: { effort: 'high' } })
    expect(res).toEqual({ ok: true, before: 'x', after: '' })
  })
})

describe('buildAutocompleteBody (the whole upstream request is server-built)', () => {
  const body = buildAutocompleteBody('Buy mil', ' and eggs', DEFAULT_AUTOCOMPLETE_MODEL)

  it('has exactly the server-fixed fields', () => {
    expect(body).toEqual({
      model: 'anthropic/claude-haiku-5.5',
      messages: [
        { role: 'system', content: AUTOCOMPLETE_SYSTEM_PROMPT },
        { role: 'user', content: 'Buy mil<CURSOR/> and eggs' },
      ],
      stream: true,
      max_tokens: 48,
      temperature: 0.2,
      reasoning: { effort: 'none' },
      usage: { include: true },
    })
    expect(AUTOCOMPLETE_TEMPERATURE).toBe(0.2)
  })

  it('turns reasoning off with an effort the repo already knows', () => {
    expect(REASONING_EFFORTS).toContain('none')
    expect(body.reasoning).toEqual({ effort: 'none' })
  })

  it('marks the cursor between before and after, and the prompt names the same mark', () => {
    expect(AUTOCOMPLETE_CURSOR_MARK).toBe('<CURSOR/>')
    expect(AUTOCOMPLETE_SYSTEM_PROMPT).toContain(AUTOCOMPLETE_CURSOR_MARK)
    const only = buildAutocompleteBody('abc', '', 'x/y') as { model: string; messages: Array<{ content: string }> }
    expect(only.model).toBe('x/y')
    expect(only.messages[1].content).toBe('abc<CURSOR/>')
  })

  it('pins the prompt (the one validated in the spike: short, same language, no thinking)', () => {
    expect(AUTOCOMPLETE_SYSTEM_PROMPT).toBe(
      "You are an inline autocomplete engine inside a note-taking app. Continue the user's text from the exact position marked <CURSOR/>. Reply with ONLY the continuation, and keep it SHORT: the next 3 to 10 words, just enough to finish the current clause or list item, in the same language and tone as the text. Answer immediately, without thinking it through. Never repeat text that is already written, never explain, never use quotes or markdown fences. If the text before the cursor ends in the middle of a word, finish that word; otherwise start with a space when one is needed. Do not run into the text after the cursor."
    )
  })

  it('a worst-case request stays a tiny fraction of the budget', () => {
    const worst = buildAutocompleteBody(
      'ñ'.repeat(AUTOCOMPLETE_MAX_BEFORE_CHARS),
      'ñ'.repeat(AUTOCOMPLETE_MAX_AFTER_CHARS),
      DEFAULT_AUTOCOMPLETE_MODEL
    )
    const { costUsd } = autocompleteCharge(null, worst, AUTOCOMPLETE_FALLBACK_PRICE)
    // What the "no reservation" design rests on: ≤ ~$0.0002 per suggestion.
    expect(costUsd).toBeLessThan(0.0002)
  })
})

describe('decideAutocompleteQuota (30 % ceiling inside the monthly budget)', () => {
  it('ok while both the budget and the ceiling have room', () => {
    expect(decideAutocompleteQuota(0, 0, 2, 0.3)).toBe('ok')
    expect(decideAutocompleteQuota(1.2, 0.59, 2, 0.3)).toBe('ok')
    // The chat alone may have spent far more than 30 %: it is a ceiling for
    // autocomplete, not a reserve.
    expect(decideAutocompleteQuota(1.99, 0, 2, 0.3)).toBe('ok')
  })

  it("autocomplete_quota once autocomplete's own spend reaches limit × share", () => {
    expect(decideAutocompleteQuota(0.6, 0.6, 2, 0.3)).toBe('autocomplete_quota')
    expect(decideAutocompleteQuota(1.5, 0.75, 2, 0.3)).toBe('autocomplete_quota')
    expect(decideAutocompleteQuota(0.6, 0.6, 2, 0.5)).toBe('ok')
    expect(decideAutocompleteQuota(1, 1, 2, 0.5)).toBe('autocomplete_quota')
  })

  it('quota when the whole budget is spent — it wins over the ceiling', () => {
    expect(decideAutocompleteQuota(2, 0, 2, 0.3)).toBe('quota')
    expect(decideAutocompleteQuota(2.4, 0.1, 2, 0.3)).toBe('quota')
    expect(decideAutocompleteQuota(2, 0.6, 2, 0.3)).toBe('quota')
  })

  it('with share = 1 only the total budget limits autocomplete', () => {
    expect(decideAutocompleteQuota(1.9, 1.9, 2, 1)).toBe('ok')
    expect(decideAutocompleteQuota(2, 2, 2, 1)).toBe('quota')
  })

  it('malformed amounts count as 0 and a malformed share as the default', () => {
    expect(decideAutocompleteQuota(NaN, -1, 2, 0.3)).toBe('ok')
    expect(decideAutocompleteQuota(0.7, 0.7, 2, NaN)).toBe('autocomplete_quota')
    expect(decideAutocompleteQuota(0.5, 0.5, 2, 0)).toBe('ok')
    expect(decideAutocompleteQuota(0.7, 0.7, 2, 5)).toBe('autocomplete_quota')
  })
})

describe('parseAutocompleteBudget (get_autocomplete_budget result)', () => {
  it('reads both amounts (numbers or numeric strings)', () => {
    expect(parseAutocompleteBudget({ used: 1.25, autocomplete_used: 0.4 })).toEqual({ used: 1.25, autocompleteUsed: 0.4 })
    expect(parseAutocompleteBudget({ used: 0, autocomplete_used: 0 })).toEqual({ used: 0, autocompleteUsed: 0 })
    expect(parseAutocompleteBudget({ used: '1.5', autocomplete_used: '0.1' })).toEqual({ used: 1.5, autocompleteUsed: 0.1 })
  })

  it('is null when malformed — never "no spend"', () => {
    expect(parseAutocompleteBudget(null)).toBeNull()
    expect(parseAutocompleteBudget(1.5)).toBeNull()
    expect(parseAutocompleteBudget([])).toBeNull()
    expect(parseAutocompleteBudget({})).toBeNull()
    expect(parseAutocompleteBudget({ used: 1 })).toBeNull()
    expect(parseAutocompleteBudget({ used: 1, autocomplete_used: null })).toBeNull()
    expect(parseAutocompleteBudget({ used: -1, autocomplete_used: 0 })).toBeNull()
    expect(parseAutocompleteBudget({ used: 'abc', autocomplete_used: 0 })).toBeNull()
  })
})

describe('autocompleteUsageUnits (GET /usage → autocomplete: {used, limit})', () => {
  it('limit is the share of the legacy 3,000,000', () => {
    expect(autocompleteUsageUnits(0, 2, 0.3)).toEqual({ used: 0, limit: 900_000 })
    expect(autocompleteUsageUnits(0, 2, 1).limit).toBe(LEGACY_USAGE_UNITS)
    expect(autocompleteUsageUnits(0, 2, 0.25).limit).toBe(750_000)
  })

  it('used is scaled exactly like the top-level used', () => {
    expect(autocompleteUsageUnits(0.3, 2, 0.3)).toEqual({ used: 450_000, limit: 900_000 })
    expect(autocompleteUsageUnits(0.3, 2, 0.3).used).toBe(legacyUsageUnits(0.3, 2).used)
    // Ceiling reached: used === limit, so used / limit is the fraction spent.
    expect(autocompleteUsageUnits(0.6, 2, 0.3)).toEqual({ used: 900_000, limit: 900_000 })
    expect(autocompleteUsageUnits(1.5, 5, 0.3)).toEqual({ used: 900_000, limit: 900_000 })
  })

  it('degrades safely', () => {
    expect(autocompleteUsageUnits(NaN, 2, 0.3).used).toBe(0)
    expect(autocompleteUsageUnits(-1, 2, 0.3).used).toBe(0)
    expect(autocompleteUsageUnits(1, 0, 0.3)).toEqual({ used: 0, limit: 900_000 })
    expect(autocompleteUsageUnits(0, 2, NaN).limit).toBe(900_000)
  })
})

describe('autocomplete pricing (list price of the autocomplete model)', () => {
  it('reads the price of ANY priced row, enabled or not', () => {
    const prices = modelPricesFromRows([
      { id: 'a/enabled', enabled: true, price_in_usd: 0.1, price_out_usd: 0.5 },
      { id: 'b/disabled', enabled: false, price_in_usd: 1, price_out_usd: '4' },
      { id: 'c/unpriced', enabled: true, price_in_usd: null, price_out_usd: 2 },
      { id: 'a/enabled', enabled: true, price_in_usd: 9, price_out_usd: 9 },
      { id: '', price_in_usd: 1, price_out_usd: 1 },
      { id: '__proto__', price_in_usd: 1, price_out_usd: 1 },
      { id: 'd/negative', price_in_usd: -1, price_out_usd: 1 },
      null,
      'row',
    ])
    expect(prices).toEqual({
      'a/enabled': { priceInUsd: 0.1, priceOutUsd: 0.5 },
      'b/disabled': { priceInUsd: 1, priceOutUsd: 4 },
    })
    expect(modelPricesFromRows(null)).toEqual({})
    expect(modelPricesFromRows({})).toEqual({})
  })

  it('the backup catalog prices the default model', () => {
    const prices = modelPricesFromCatalog(FALLBACK_MODEL_CATALOG)
    expect(Object.keys(prices)).toEqual(FALLBACK_MODEL_CATALOG.map((m) => m.id))
    expect(autocompletePricing(DEFAULT_AUTOCOMPLETE_MODEL, prices)).toEqual({ priceInUsd: 0.1, priceOutUsd: 0.5 })
  })

  it('the last-resort price is the list price of the default model', () => {
    const haiku = FALLBACK_MODEL_CATALOG.find((m) => m.id === DEFAULT_AUTOCOMPLETE_MODEL)!
    expect(AUTOCOMPLETE_FALLBACK_PRICE).toEqual({ priceInUsd: haiku.priceInUsd, priceOutUsd: haiku.priceOutUsd })
  })

  it('a model with no row gets the last-resort price', () => {
    expect(autocompletePricing('unknown/model', {})).toBe(AUTOCOMPLETE_FALLBACK_PRICE)
    expect(autocompletePricing('toString', {})).toBe(AUTOCOMPLETE_FALLBACK_PRICE)
    const row = { priceInUsd: 3, priceOutUsd: 15 }
    expect(autocompletePricing('x/y', { 'x/y': row })).toBe(row)
  })
})

describe('autocompleteCharge (what a suggestion adds to the daily row)', () => {
  const upstream = buildAutocompleteBody('Buy mil', '', DEFAULT_AUTOCOMPLETE_MODEL)
  const price = { priceInUsd: 0.1, priceOutUsd: 0.5 }

  it("charges OpenRouter's usage.cost when present", () => {
    expect(autocompleteCharge({ tokensIn: 660, tokensOut: 24, cost: 0.00008 }, upstream, price)).toEqual({
      tokensIn: 660,
      tokensOut: 24,
      costUsd: 0.00008,
    })
    expect(autocompleteCharge({ tokensIn: 660, tokensOut: 0, cost: 0 }, upstream, price).costUsd).toBe(0)
  })

  it('falls back to real tokens × list price without a cost', () => {
    const charge = autocompleteCharge({ tokensIn: 660, tokensOut: 30, cost: null }, upstream, price)
    expect(charge.tokensIn).toBe(660)
    expect(charge.tokensOut).toBe(30)
    close(charge.costUsd, (660 * 0.1 + 30 * 0.5) / 1_000_000)
  })

  it('estimates when no usage arrived: input ≈ bytes / 4, output = the whole cap', () => {
    const charge = autocompleteCharge(null, upstream, price)
    expect(charge.tokensIn).toBe(estimateInputTokens(upstream))
    expect(charge.tokensIn).toBeGreaterThan(100)
    expect(charge.tokensOut).toBe(AUTOCOMPLETE_MAX_TOKENS)
    close(charge.costUsd, (charge.tokensIn * 0.1 + AUTOCOMPLETE_MAX_TOKENS * 0.5) / 1_000_000)
  })

  it('token counts are non-negative integers, a bad cost is ignored', () => {
    const charge = autocompleteCharge({ tokensIn: 10.6, tokensOut: -5, cost: -1 }, upstream, price)
    expect(charge.tokensIn).toBe(11)
    expect(charge.tokensOut).toBe(0)
    close(charge.costUsd, (11 * 0.1) / 1_000_000)
    expect(autocompleteCharge({ tokensIn: NaN, tokensOut: NaN, cost: NaN }, upstream, price)).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    })
  })
})

describe('migration 0018 (ai_autocomplete_daily + budget functions)', () => {
  const dir = join(__dirname, '../../supabase/migrations')
  /** A migration without `--` comments, every whitespace run collapsed to one space. */
  const code = (file: string) =>
    readFileSync(join(dir, file), 'utf-8')
      .split(/\r?\n/) // CRLF checkouts (Windows, core.autocrlf) must strip comments too
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
      .replace(/\s+/g, ' ')
  const SQL = readFileSync(join(dir, '0018_ai_autocomplete.sql'), 'utf-8')
  const CODE = code('0018_ai_autocomplete.sql')
  const CODE_0013 = code('0013_ai_cost_quota.sql')

  /** `create or replace function public.<name>(…) … $$ … $$;` of a migration. */
  const fn = (source: string, name: string) => {
    const m = source.match(new RegExp(`create or replace function public\\.${name}\\(.*?\\$\\$(.*?)\\$\\$;`))
    expect(m, name).not.toBeNull()
    return { whole: m![0], head: m![0].slice(0, m![0].indexOf('$$')), body: m![1] }
  }

  const AUTOCOMPLETE_MONTH_SUM =
    "select sum(cost_usd) from public.ai_autocomplete_daily where user_id = p_user_id and day >= date_trunc('month', now() at time zone 'utc')::date"
  const CHAT_MONTH_SUM =
    "select sum(coalesce(quota_usd, cost_usd, 0)) from public.usage_events where user_id = p_user_id and at >= date_trunc('month', now())"

  it('creates ONE aggregated row per user and day (closing with "\\n);" for the delete-account mirror test)', () => {
    const m = SQL.match(/create table public\.ai_autocomplete_daily\s*\(([\s\S]*?)\n\);/)
    expect(m).not.toBeNull()
    const body = m![1].replace(/--.*$/gm, '').replace(/\s+/g, ' ')
    for (const col of [
      'user_id uuid not null references auth.users(id) on delete cascade',
      'day date not null',
      'requests integer not null default 0',
      'tokens_in bigint not null default 0',
      'tokens_out bigint not null default 0',
      'cost_usd numeric not null default 0',
      'primary key (user_id, day)',
    ]) {
      expect(body).toContain(col)
    }
  })

  it('RLS: the user reads their own rows, nobody but the service role writes', () => {
    expect(CODE).toContain('alter table public.ai_autocomplete_daily enable row level security;')
    const policies = [...CODE.matchAll(/create policy "[^"]+" on public\.ai_autocomplete_daily (.*?);/g)].map((m) => m[1])
    expect(policies).toEqual(['for select using (auth.uid() = user_id)'])
  })

  it('every function is security definer and executable only by the service role', () => {
    const signatures = [
      'record_autocomplete_cost(uuid, bigint, bigint, numeric)',
      'get_month_cost(uuid)',
      'reserve_ai_cost(uuid, text, numeric, numeric, int, int)',
      'get_autocomplete_budget(uuid)',
    ]
    for (const sig of signatures) {
      expect(CODE).toContain(`revoke execute on function public.${sig} from public, anon, authenticated;`)
      expect(CODE).toContain(`grant execute on function public.${sig} to service_role;`)
      const { head } = fn(CODE, sig.slice(0, sig.indexOf('(')))
      expect(head).toContain('security definer')
      expect(head).toContain('set search_path = public')
    }
    expect([...CODE.matchAll(/create or replace function/g)]).toHaveLength(signatures.length)
  })

  it('record_autocomplete_cost upserts the UTC day row, adding to its counters', () => {
    const { body } = fn(CODE, 'record_autocomplete_cost')
    expect(body).toContain("(now() at time zone 'utc')::date")
    expect(body).toContain('on conflict (user_id, day) do update set')
    expect(body).toContain('requests = d.requests + 1')
    expect(body).toContain('tokens_in = d.tokens_in + excluded.tokens_in')
    expect(body).toContain('tokens_out = d.tokens_out + excluded.tokens_out')
    expect(body).toContain('cost_usd = d.cost_usd + excluded.cost_usd')
    // Negative / null amounts can never lower the spend.
    expect(body).toContain('greatest(coalesce(p_cost_usd, 0), 0)')
  })

  it('get_month_cost keeps the 0013 signature and now adds the autocomplete spend', () => {
    const now = fn(CODE, 'get_month_cost')
    const before = fn(CODE_0013, 'get_month_cost')
    // Same head (args, return type, volatility, security): the DEPLOYED proxy
    // keeps calling it between the migration and the redeploy.
    expect(now.head).toBe(before.head)
    expect(now.body).toContain(CHAT_MONTH_SUM)
    expect(now.body).toContain(AUTOCOMPLETE_MONTH_SUM)
  })

  it('reserve_ai_cost is the 0013 function with only `used` changed', () => {
    const now = fn(CODE, 'reserve_ai_cost')
    const before = fn(CODE_0013, 'reserve_ai_cost')
    expect(now.head).toBe(before.head)
    expect(now.body).toContain(CHAT_MONTH_SUM)
    expect(now.body).toContain(AUTOCOMPLETE_MONTH_SUM)
    // Everything from the quota check on is byte-for-byte the 0013 body: same
    // lock key, same rejection rules, same result shape, same pending row.
    const tail = (body: string) => {
      const at = body.indexOf('if v_used >= p_limit_usd')
      expect(at).toBeGreaterThan(0)
      return body.slice(at)
    }
    expect(tail(now.body)).toBe(tail(before.body))
    expect(tail(now.body)).toContain('insert into public.usage_events')
    const lock = "perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text, 0));"
    expect(now.body).toContain(lock)
    expect(before.body).toContain(lock)
  })

  it('get_autocomplete_budget only reads: total (get_month_cost) + autocomplete alone', () => {
    const { head, body } = fn(CODE, 'get_autocomplete_budget')
    expect(head).toContain('returns jsonb')
    expect(head).toContain('stable')
    expect(body).toContain("'used', public.get_month_cost(p_user_id)")
    expect(body).toContain(`'autocomplete_used', coalesce(( ${AUTOCOMPLETE_MONTH_SUM} ), 0)`)
    // No reservation: no lock, no row written.
    expect(body).not.toContain('pg_advisory')
    expect(body).not.toMatch(/\b(insert|update|delete)\b/)
  })

  it('autocomplete never writes usage_events (no pending row, no AI_MAX_INFLIGHT slot)', () => {
    const inserts = [...CODE.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]).sort()
    // The only usage_events insert is the chat reservation inside reserve_ai_cost.
    expect(inserts).toEqual(['ai_autocomplete_daily', 'usage_events'])
    expect(fn(CODE, 'record_autocomplete_cost').body).not.toContain('usage_events')
  })
})
