// The managed NoteFlow AI catalog lives in the Supabase table public.ai_models and
// reaches the client through the proxy's GET /models (cached by the app). Three
// BACKUP copies of it remain, for when that chain is not available:
//   - seed:   the INSERT of supabase/migrations/0012_ai_models.sql (what a fresh
//             database starts with);
//   - proxy:  FALLBACK_MODEL_CATALOG (ai-proxy/logic.ts) — table unreadable/empty;
//   - client: NOTEFLOW_AI_MODELS + NOTEFLOW_AI_MODEL_META (electron/ai/llm/presets.ts)
//             — no catalog downloaded yet.
// They can't import each other (Deno / Electron / SQL), so this file pins them
// together: if the backups disagree, a fallback would advertise a price or a
// vision flag the server does not apply. (The LIVE catalog — new rows in the
// table — is deliberately not mirrored anywhere: that is the point of the table.)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NOTEFLOW_AI_MODELS, NOTEFLOW_AI_MODEL_META } from '../../electron/ai/llm/presets'
import { FALLBACK_MODEL_CATALOG, quotaMultiplierFor } from '../../supabase/functions/ai-proxy/logic'

/** Parses the seed INSERT of migration 0012 into catalog entries, in sort_order. */
function seedCatalog(): Array<{ id: string; quotaMultiplier: number; images: boolean; enabled: boolean; sortOrder: number }> {
  const sql = readFileSync(join(__dirname, '../../supabase/migrations/0012_ai_models.sql'), 'utf-8')
  const insert = sql.slice(sql.indexOf('insert into public.ai_models'))
  const rows = [...insert.matchAll(/\(\s*'([^']+)'\s*,\s*([\d.]+)\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*(-?\d+)\s*\)/g)]
  return rows
    .map((m) => ({
      id: m[1],
      quotaMultiplier: Number(m[2]),
      images: m[3] === 'true',
      enabled: m[4] === 'true',
      sortOrder: Number(m[5]),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
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

  it('multipliers and vision flags match between client and proxy', () => {
    for (const m of FALLBACK_MODEL_CATALOG) {
      expect(NOTEFLOW_AI_MODEL_META[m.id]).toEqual({ quotaMultiplier: m.quotaMultiplier, images: m.images })
      // What the picker advertises is what the backup catalog really charges.
      expect(quotaMultiplierFor(m.id)).toBe(NOTEFLOW_AI_MODEL_META[m.id].quotaMultiplier)
    }
  })

  it('the migration seed is the same catalog: ids, order, multipliers, vision — all enabled', () => {
    const seed = seedCatalog()
    expect(seed.length).toBeGreaterThan(0)
    expect(seed.every((r) => r.enabled)).toBe(true)
    expect(new Set(seed.map((r) => r.sortOrder)).size).toBe(seed.length) // no ties to break by id
    expect(seed.map(({ id, quotaMultiplier, images }) => ({ id, quotaMultiplier, images }))).toEqual([
      ...FALLBACK_MODEL_CATALOG,
    ])
  })

  it('every multiplier is a positive finite number', () => {
    for (const meta of Object.values(NOTEFLOW_AI_MODEL_META)) {
      expect(Number.isFinite(meta.quotaMultiplier)).toBe(true)
      expect(meta.quotaMultiplier).toBeGreaterThan(0)
    }
  })
})
