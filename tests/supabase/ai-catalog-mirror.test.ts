// The managed NoteFlow AI catalog lives in the Supabase table public.ai_models and
// reaches the client through the proxy's GET /models (cached by the app). Three
// BACKUP copies of it remain, for when that chain is not available:
//   - seed:   the INSERT + retirement UPDATE of supabase/migrations/0013_ai_cost_quota.sql
//             (what the database holds after the migration);
//   - proxy:  FALLBACK_MODEL_CATALOG + FALLBACK_MODEL_ALIASES (ai-proxy/logic.ts) —
//             table unreadable/empty;
//   - client: NOTEFLOW_AI_MODELS + NOTEFLOW_AI_MODEL_META (electron/ai/llm/presets.ts)
//             — no catalog downloaded yet.
// They can't import each other (Deno / Electron / SQL), so this file pins them
// together: if the backups disagree, a fallback would advertise a cost or a vision
// flag the server does not apply. (The LIVE catalog — new rows in the table — is
// deliberately not mirrored anywhere: that is the point of the table.)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NOTEFLOW_AI_MODELS, NOTEFLOW_AI_MODEL_META } from '../../electron/ai/llm/presets'
import {
  FALLBACK_MODEL_CATALOG,
  FALLBACK_MODEL_ALIASES,
  modelsListBody,
  resolveModelAliases,
} from '../../supabase/functions/ai-proxy/logic'

const MIGRATION = readFileSync(join(__dirname, '../../supabase/migrations/0013_ai_cost_quota.sql'), 'utf-8')

/** Parses the catalog INSERT of migration 0013 into catalog entries, in sort_order. */
function seedCatalog() {
  const start = MIGRATION.indexOf('insert into public.ai_models')
  const insert = MIGRATION.slice(start, MIGRATION.indexOf('on conflict', start))
  const rows = [
    ...insert.matchAll(
      /\(\s*'([^']+)'\s*,\s*([\d.]+)\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*(-?\d+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*(null|'[a-z]+')\s*,\s*(true|false)\s*\)/g
    ),
  ]
  return rows
    .map((m) => ({
      id: m[1],
      quotaMultiplier: Number(m[2]),
      images: m[3] === 'true',
      enabled: m[4] === 'true',
      sortOrder: Number(m[5]),
      priceInUsd: Number(m[6]),
      priceOutUsd: Number(m[7]),
      reasoningEffort: m[8] === 'null' ? null : m[8].slice(1, -1),
      recommended: m[9] === 'true',
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Parses the retirement UPDATE of migration 0013 into retired id → successor. */
function seedAliases(): Record<string, string> {
  const start = MIGRATION.indexOf('update public.ai_models')
  const update = MIGRATION.slice(start, MIGRATION.indexOf(') as v(id, successor)', start))
  return Object.fromEntries([...update.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => [m[1], m[2]]))
}

describe('managed AI catalog — backup copies (client ↔ proxy ↔ seed)', () => {
  it('client list and proxy backup are identical, order included', () => {
    // Order matters: suggestedModels[0] is the de-facto default model of the preset.
    expect(NOTEFLOW_AI_MODELS).toEqual(FALLBACK_MODEL_CATALOG.map((m) => m.id))
  })

  it('has no duplicate ids', () => {
    expect(new Set(NOTEFLOW_AI_MODELS).size).toBe(NOTEFLOW_AI_MODELS.length)
  })

  it('the client meta describes exactly the catalog — no missing, no leftovers', () => {
    expect(Object.keys(NOTEFLOW_AI_MODEL_META).sort()).toEqual([...NOTEFLOW_AI_MODELS].sort())
  })

  it('the client meta is what the proxy serves for its backup catalog (cost_index, vision, recommended)', () => {
    // What the picker advertises is what GET /models would say for the same catalog.
    for (const entry of modelsListBody(FALLBACK_MODEL_CATALOG).data) {
      expect(NOTEFLOW_AI_MODEL_META[entry.id]).toEqual({
        costIndex: entry.cost_index,
        images: entry.images,
        recommended: entry.recommended,
      })
    }
  })

  it('the migration seed is the same catalog: ids, order, prices, effort, vision, recommended — all enabled', () => {
    const seed = seedCatalog()
    expect(seed.length).toBe(FALLBACK_MODEL_CATALOG.length)
    expect(seed.every((r) => r.enabled)).toBe(true)
    // quota_multiplier is obsolete for the new proxy but the OLD function (migrate →
    // redeploy window, rollback) still weights with it: it is seeded with a realistic
    // value — the cost_index the new proxy computes, except sol rounded up to 30.
    expect(Object.fromEntries(seed.map((r) => [r.id, r.quotaMultiplier]))).toEqual({
      'deepseek/deepseek-v4.1-flash-1017': 1,
      'openai/gpt-5.6-luna': 2,
      'anthropic/claude-haiku-5.5': 1,
      'xiaomi/mimo-v2.6-pro': 2,
      'openai/gpt-5.6-sol': 30,
    })
    const indexes = Object.fromEntries(modelsListBody(FALLBACK_MODEL_CATALOG).data.map((e) => [e.id, e.cost_index]))
    for (const r of seed) expect(r.quotaMultiplier).toBeGreaterThanOrEqual(indexes[r.id])
    expect(new Set(seed.map((r) => r.sortOrder)).size).toBe(seed.length) // no ties to break by id
    expect(
      seed.map(({ id, images, priceInUsd, priceOutUsd, reasoningEffort, recommended }) => ({
        id,
        images,
        priceInUsd,
        priceOutUsd,
        reasoningEffort,
        recommended,
      }))
    ).toEqual([...FALLBACK_MODEL_CATALOG])
  })

  it('the migration retires the same models to the same successors as the proxy backup aliases', () => {
    expect(seedAliases()).toEqual({ ...FALLBACK_MODEL_ALIASES })
    // Every successor is a model the backup catalog serves (no dangling alias).
    expect(resolveModelAliases(FALLBACK_MODEL_ALIASES, FALLBACK_MODEL_CATALOG)).toEqual({ ...FALLBACK_MODEL_ALIASES })
    // …and no retired id is still in the catalog.
    for (const retired of Object.keys(FALLBACK_MODEL_ALIASES)) expect(NOTEFLOW_AI_MODELS).not.toContain(retired)
  })

  it('every cost index is a positive integer and the first model is the recommended one', () => {
    for (const meta of Object.values(NOTEFLOW_AI_MODEL_META)) {
      expect(Number.isInteger(meta.costIndex)).toBe(true)
      expect(meta.costIndex).toBeGreaterThanOrEqual(1)
    }
    expect(NOTEFLOW_AI_MODEL_META[NOTEFLOW_AI_MODELS[0]].recommended).toBe(true)
  })
})
