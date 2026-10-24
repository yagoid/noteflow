// Model catalog of the managed NoteFlow AI plan, as the desktop client sees it.
//
// The source of truth is the proxy: GET <ai-proxy>/models serves the catalog of the
// Supabase table public.ai_models (ids + quota multiplier + vision flag per model —
// modelsListBody in supabase/functions/ai-proxy/logic.ts). main downloads it in the
// background (llm.fetchManagedCatalog), validates it here and caches it in the local
// settings.json (key `aiManagedCatalog`), so it survives restarts and works offline.
//
// EFFECTIVE catalog = the cached one if there is any, else the backup constants of
// presets.ts (NOTEFLOW_AI_MODELS + NOTEFLOW_AI_MODEL_META). Everything that needs the
// catalog (effectiveModel, acceptsModel, providerCapabilities, the presets sent to the
// renderer) reads it through withManagedCatalog, so a model added server-side shows up
// in the picker — with its quota suffix — without an app release.
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
  models: Array<{ id: string; quotaMultiplier: number; images: boolean }>
  /** When this content was downloaded and stored (ISO) — informational. */
  updatedAt: string
}

/** Backup catalog (presets.ts) — used until a valid one has been cached. */
export const FALLBACK_MANAGED_CATALOG: ManagedCatalog = { models: NOTEFLOW_AI_MODELS, meta: NOTEFLOW_AI_MODEL_META }

/** Sanity cap: a catalog this big is not a curated one (corrupt or hostile body). */
const MAX_CATALOG_MODELS = 200

/**
 * Validates a list of catalog entries. ALL-OR-NOTHING on purpose: one malformed
 * entry discards the whole list, so the caller keeps the catalog it already has
 * instead of adopting a partial one (which could silently drop the user's model
 * from the picker). Per entry: `id` a non-blank string (trimmed), the multiplier a
 * finite number > 0, `images` a boolean. A repeated id keeps its first occurrence.
 * Null when not an array, empty, oversized or with any malformed entry.
 */
function parseEntries(list: unknown, multiplierKey: 'quota_multiplier' | 'quotaMultiplier'): ManagedCatalog | null {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_CATALOG_MODELS) return null
  const models: string[] = []
  const meta: Record<string, ManagedModelMeta> = {}
  for (const raw of list) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const entry = raw as Record<string, unknown>
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    const mult = entry[multiplierKey]
    // '__proto__' would hit the prototype setter of the plain `meta` object.
    if (!id || id === '__proto__') return null
    if (typeof mult !== 'number' || !Number.isFinite(mult) || mult <= 0) return null
    if (typeof entry.images !== 'boolean') return null
    if (Object.prototype.hasOwnProperty.call(meta, id)) continue
    models.push(id)
    meta[id] = { quotaMultiplier: mult, images: entry.images }
  }
  return { models, meta }
}

/**
 * Validates the body of the proxy's GET /models (OpenAI list format whose entries
 * carry `quota_multiplier` + `images`). Null when it is not a usable catalog —
 * corrupt, empty, or an older proxy that only lists ids: the caller then ignores
 * it and keeps the current catalog.
 */
export function sanitizeManagedCatalog(payload: unknown): ManagedCatalog | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  return parseEntries((payload as Record<string, unknown>).data, 'quota_multiplier')
}

/** Validates what settings.json holds under `aiManagedCatalog` (it may be stale,
 *  hand-edited or written by another build). Null when absent or unusable. */
export function parseStoredManagedCatalog(raw: unknown): ManagedCatalog | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  return parseEntries((raw as Record<string, unknown>).models, 'quotaMultiplier')
}

/** The settings.json shape of a catalog. */
export function toStoredManagedCatalog(catalog: ManagedCatalog, now: Date = new Date()): StoredManagedCatalog {
  return {
    models: catalog.models.map((id) => ({ id, ...catalog.meta[id] })),
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
    return !!ma && !!mb && ma.quotaMultiplier === mb.quotaMultiplier && ma.images === mb.images
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
