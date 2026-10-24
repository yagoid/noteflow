// Model catalog of the managed NoteFlow AI plan, as the desktop client sees it.
//
// The source of truth is the proxy: GET <ai-proxy>/models serves the catalog of the
// Supabase table public.ai_models (ids + relative cost + vision + recommended flag per
// model — modelsListBody in supabase/functions/ai-proxy/logic.ts). main downloads it in
// the background (llm.fetchManagedCatalog), validates it here and caches it in the local
// settings.json (key `aiManagedCatalog`), so it survives restarts and works offline.
//
// EFFECTIVE catalog = the cached one if there is any, else the backup constants of
// presets.ts (NOTEFLOW_AI_MODELS + NOTEFLOW_AI_MODEL_META). Everything that needs the
// catalog (effectiveModel, acceptsModel, providerCapabilities, the presets sent to the
// renderer) reads it through withManagedCatalog, so a model added server-side shows up
// in the picker — with its cost suffix — without an app release.
//
// Invariants:
//   - refreshing the catalog NEVER touches the user's stored model (settings.aiLlm);
//   - a failed download or an unusable body never replaces the good cache.
// Pure module (no electron / fs): the state is a module-level variable that main seeds
// from settings.json at boot and updates after each successful download.
import { NOTEFLOW_AI_MODELS, NOTEFLOW_AI_MODEL_META, type LlmPreset, type ManagedModelMeta } from './presets'

/** Id of the preset whose models come from this catalog. */
export const MANAGED_PRESET_ID = 'noteflow'

/** Ordered catalog: `models[0]` is the preset's default model. */
export interface ManagedCatalog {
  models: string[]
  meta: Record<string, ManagedModelMeta>
}

/** What settings.json keeps under `aiManagedCatalog`. */
export interface StoredManagedCatalog {
  models: Array<{ id: string; costIndex: number; images: boolean; recommended: boolean }>
  /** When this content was downloaded and stored (ISO) — informational. */
  updatedAt: string
}

/** Backup catalog (presets.ts) — used until a valid one has been cached. */
export const FALLBACK_MANAGED_CATALOG: ManagedCatalog = { models: NOTEFLOW_AI_MODELS, meta: NOTEFLOW_AI_MODEL_META }

/** Sanity cap: a catalog this big is not a curated one (corrupt or hostile body). */
const MAX_CATALOG_MODELS = 200

/**
 * Field names of one entry, per source. The proxy speaks snake_case (`cost_index`);
 * settings.json keeps camelCase (`costIndex`). `legacyCostKey` is the proxy's
 * pre-0013 field (`quota_multiplier`), accepted ONLY from the network: a proxy not yet
 * redeployed still serves the catalog it actually allows, and adopting it (with the
 * old multiplier as the cost hint) beats falling back to constants it would reject.
 * A settings.json written by an older build is NOT accepted (stored catalogs have no
 * legacy key): it is ignored, the backup constants apply, and the next refresh
 * replaces it.
 */
interface EntryKeys {
  costKey: 'cost_index' | 'costIndex'
  legacyCostKey?: 'quota_multiplier'
}

/**
 * Validates a list of catalog entries. ALL-OR-NOTHING on purpose: one malformed
 * entry discards the whole list, so the caller keeps the catalog it already has
 * instead of adopting a partial one (which could silently drop the user's model
 * from the picker). Per entry: `id` a non-blank string (trimmed), the cost index a
 * finite number > 0, `images` a boolean, `recommended` a boolean when present
 * (absent = false). A repeated id keeps its first occurrence.
 * Null when not an array, empty, oversized or with any malformed entry.
 */
function parseEntries(list: unknown, keys: EntryKeys): ManagedCatalog | null {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_CATALOG_MODELS) return null
  const models: string[] = []
  const meta: Record<string, ManagedModelMeta> = {}
  for (const raw of list) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const entry = raw as Record<string, unknown>
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    const cost = entry[keys.costKey] !== undefined || !keys.legacyCostKey ? entry[keys.costKey] : entry[keys.legacyCostKey]
    // '__proto__' would hit the prototype setter of the plain `meta` object.
    if (!id || id === '__proto__') return null
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) return null
    if (typeof entry.images !== 'boolean') return null
    if (entry.recommended !== undefined && typeof entry.recommended !== 'boolean') return null
    if (Object.prototype.hasOwnProperty.call(meta, id)) continue
    models.push(id)
    meta[id] = { costIndex: cost, images: entry.images, recommended: entry.recommended === true }
  }
  return { models, meta }
}

/**
 * Validates the body of the proxy's GET /models (OpenAI list format whose entries
 * carry `cost_index` + `images` + `recommended` — or, from a pre-0013 proxy,
 * `quota_multiplier` + `images`). Null when it is not a usable catalog — corrupt,
 * empty, or an even older proxy that only lists ids: the caller then ignores it and
 * keeps the current catalog.
 */
export function sanitizeManagedCatalog(payload: unknown): ManagedCatalog | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  return parseEntries((payload as Record<string, unknown>).data, { costKey: 'cost_index', legacyCostKey: 'quota_multiplier' })
}

/** Validates what settings.json holds under `aiManagedCatalog` (it may be stale,
 *  hand-edited or written by another build — the pre-0013 `quotaMultiplier` shape
 *  included). Null when absent or unusable. */
export function parseStoredManagedCatalog(raw: unknown): ManagedCatalog | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  return parseEntries((raw as Record<string, unknown>).models, { costKey: 'costIndex' })
}

/** The settings.json shape of a catalog. */
export function toStoredManagedCatalog(catalog: ManagedCatalog, now: Date = new Date()): StoredManagedCatalog {
  return {
    models: catalog.models.map((id) => {
      const m = catalog.meta[id]
      return { id, costIndex: m.costIndex, images: m.images, recommended: m.recommended === true }
    }),
    updatedAt: now.toISOString(),
  }
}

/** Same models, same order, same metadata. */
export function sameManagedCatalog(a: ManagedCatalog | null, b: ManagedCatalog | null): boolean {
  if (!a || !b) return a === b
  if (a.models.length !== b.models.length) return false
  return a.models.every((id, i) => {
    if (b.models[i] !== id) return false
    const ma = a.meta[id]
    const mb = b.meta[id]
    return (
      !!ma &&
      !!mb &&
      ma.costIndex === mb.costIndex &&
      ma.images === mb.images &&
      (ma.recommended === true) === (mb.recommended === true)
    )
  })
}

let cached: ManagedCatalog | null = null

/** Replaces the cached catalog (null = forget it → the backup one applies). */
export function setCachedManagedCatalog(catalog: ManagedCatalog | null): void {
  cached = catalog
}

/** The cached catalog, or null when none has been downloaded/loaded. */
export function getCachedManagedCatalog(): ManagedCatalog | null {
  return cached
}

/** The catalog in force: the cached one, else the backup constants. */
export function effectiveManagedCatalog(): ManagedCatalog {
  return cached ?? FALLBACK_MANAGED_CATALOG
}

/**
 * The preset with the effective catalog swapped in (suggestedModels + modelMeta),
 * for the managed preset only — every other preset is returned untouched. Copies,
 * so a caller mutating the result cannot corrupt the cache or the constants.
 */
export function withManagedCatalog(preset: LlmPreset): LlmPreset {
  if (preset.id !== MANAGED_PRESET_ID) return preset
  const catalog = effectiveManagedCatalog()
  const modelMeta: Record<string, ManagedModelMeta> = {}
  for (const id of catalog.models) modelMeta[id] = { ...catalog.meta[id] }
  return { ...preset, suggestedModels: [...catalog.models], modelMeta }
}
