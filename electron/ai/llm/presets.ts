// Catalog of LLM provider presets. Two underlying implementations cover everything:
//   - 'anthropic'  → official SDK (Claude)
//   - 'openai'     → OpenAI-compatible /chat/completions + /models (OpenAI, DeepSeek, MiniMax,
//                    OpenRouter, Ollama, and any custom server)
// Each preset stores its OWN baseUrl / model / key (see LlmConfigStored.byPreset), so switching
// providers never mixes credentials. Base URLs are editable so users can point at regional
// endpoints (e.g. MiniMax China) or self-hosted gateways.

import { AI_PROXY_URL } from '../../cloudConfig'

export type LlmImpl = 'anthropic' | 'openai'

/**
 * BACKUP catalog of the managed NoteFlow AI plan (OpenRouter model ids). The live
 * catalog is served by the proxy (GET /models, from the Supabase table
 * public.ai_models) and cached in settings.json — see ./managedCatalog.ts. These
 * constants are only used until a valid catalog has been downloaded once (fresh
 * install, never signed in, or a proxy too old to send the metadata), so they
 * must stay a sensible default: they mirror the seed of migration 0012 and the
 * proxy's FALLBACK_MODEL_CATALOG (tests/supabase/ai-catalog-mirror.test.ts).
 * Adding a model does NOT happen here — it is a row in the table.
 * All are tool-calling capable (the chat is agentic); the two DeepSeek models and
 * Xiaomi MiMo are text-only, the rest accept images (see NOTEFLOW_AI_MODEL_META).
 * The first entry is the de-facto default model for the preset (suggestedModels[0])
 * — today a text-only one, so a fresh managed setup starts WITHOUT image support
 * until the user picks another model (providerCapabilities gates the attach UI).
 */
export const NOTEFLOW_AI_MODELS = [
  // Standard models (×1 quota).
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
  'xiaomi/mimo-v2.5-pro',
  'openai/gpt-5.6-luna',
  'anthropic/claude-haiku-4.5',
  // Mid-tier (×2 quota).
  'x-ai/grok-4.5',
  // Advanced models (×6 quota).
  'moonshotai/kimi-k3',
]

/** Metadata of one model of the managed plan's catalog. */
export interface ManagedModelMeta {
  /** What a real token costs against the monthly quota (×1 = baseline). */
  quotaMultiplier: number
  /** Native vision support. */
  images: boolean
}

/**
 * Per-model metadata of the BACKUP catalog above (same role: only used until the
 * proxy's catalog has been cached — see ./managedCatalog.ts):
 *   - quotaMultiplier: what a real token costs against the monthly quota.
 *   - images: native vision support (the two DeepSeek models and Xiaomi MiMo
 *     are text-only — three of the five ×1 models).
 * The effective catalog (cached or this one) reaches the renderer through the
 * preset's `modelMeta` field so the model picker can flag quota cost, and is used
 * by providerCapabilities (llm/index.ts) to gate image attachments per model.
 */
export const NOTEFLOW_AI_MODEL_META: Record<string, ManagedModelMeta> = {
  'deepseek/deepseek-v4-pro': { quotaMultiplier: 1, images: false },
  'deepseek/deepseek-v4-flash': { quotaMultiplier: 1, images: false },
  'xiaomi/mimo-v2.5-pro': { quotaMultiplier: 1, images: false },
  'openai/gpt-5.6-luna': { quotaMultiplier: 1, images: true },
  'anthropic/claude-haiku-4.5': { quotaMultiplier: 1, images: true },
  'x-ai/grok-4.5': { quotaMultiplier: 2, images: true },
  'moonshotai/kimi-k3': { quotaMultiplier: 6, images: true },
}

export interface LlmPreset {
  id: string
  label: string
  impl: LlmImpl
  baseUrl: string          // default; editable in the UI unless editableBaseUrl is false
  needsKey: boolean
  editableBaseUrl: boolean
  suggestedModels: string[]
  // Whether this provider's typical models accept native image input (vision). Image support is
  // really MODEL-dependent, so this is a per-preset default for the attach UI: it's `false` for
  // providers whose suggested models are text-only (e.g. DeepSeek rejects `image_url`), and defaults
  // to `true` for vision-capable or model-flexible providers (OpenAI/OpenRouter/Ollama/Custom).
  // PDF stays anthropic-only (handled in providerCapabilities). For the managed `noteflow`
  // preset the vision capability is refined PER MODEL via modelMeta below.
  images?: boolean
  // Per-model metadata (quota multiplier + vision), only set on the `noteflow` preset. The
  // renderer uses it to flag "N× quota" models in the picker; providerCapabilities uses it
  // to gate image attachments by the ACTIVE model. Its presence also marks the preset as
  // having a CURATED catalog (see effectiveModel in llm/index.ts). For `noteflow`, the
  // static value below is the backup catalog: llm/index.ts swaps in the catalog cached from
  // the proxy (withManagedCatalog) before using the preset or sending it to the renderer.
  modelMeta?: Record<string, ManagedModelMeta>
}

export const PRESETS: LlmPreset[] = [
  // NoteFlow AI: the managed plan (subscription). The "key" is a fresh Supabase access token of
  // the signed-in NoteFlow account, resolved per request in resolveConfigAsync (llm/index.ts).
  { id: 'noteflow',   label: 'NoteFlow AI',                  impl: 'openai',    baseUrl: AI_PROXY_URL,                     needsKey: false, editableBaseUrl: false, suggestedModels: NOTEFLOW_AI_MODELS, modelMeta: NOTEFLOW_AI_MODEL_META },
  { id: 'anthropic',  label: 'Anthropic (Claude)',          impl: 'anthropic', baseUrl: '',                              needsKey: true,  editableBaseUrl: false, suggestedModels: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
  { id: 'openai',     label: 'OpenAI',                       impl: 'openai',    baseUrl: 'https://api.openai.com/v1',      needsKey: true,  editableBaseUrl: true,  suggestedModels: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'deepseek',   label: 'DeepSeek',                     impl: 'openai',    baseUrl: 'https://api.deepseek.com/v1',    needsKey: true,  editableBaseUrl: true,  suggestedModels: ['deepseek-chat', 'deepseek-reasoner'], images: false },
  { id: 'minimax',    label: 'MiniMax',                      impl: 'openai',    baseUrl: 'https://api.minimax.io/v1',      needsKey: true,  editableBaseUrl: true,  suggestedModels: ['MiniMax-Text-01'], images: false },
  { id: 'moonshot',   label: 'Moonshot (Kimi)',              impl: 'openai',    baseUrl: 'https://api.moonshot.ai/v1',     needsKey: true,  editableBaseUrl: true,  suggestedModels: ['kimi-k2-0711-preview', 'moonshot-v1-8k'], images: false },
  { id: 'openrouter', label: 'OpenRouter',                   impl: 'openai',    baseUrl: 'https://openrouter.ai/api/v1',   needsKey: true,  editableBaseUrl: true,  suggestedModels: [] },
  { id: 'opencode',   label: 'OpenCode Zen',                 impl: 'openai',    baseUrl: 'https://opencode.ai/zen/go/v1',  needsKey: true,  editableBaseUrl: true,  suggestedModels: [] },
  { id: 'ollama',     label: 'Ollama (local)',               impl: 'openai',    baseUrl: 'http://localhost:11434/v1',      needsKey: false, editableBaseUrl: true,  suggestedModels: [] },
  { id: 'custom',     label: 'Custom (OpenAI-compatible)',   impl: 'openai',    baseUrl: '',                               needsKey: false, editableBaseUrl: true,  suggestedModels: [] },
]

export const PRESET_BY_ID: Record<string, LlmPreset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]))

export function presetOf(id: string): LlmPreset {
  // Unknown/corrupted ids fall back to Anthropic (the historical default and
  // DEFAULT_LLM_CONFIG.active) — deliberately NOT PRESETS[0], which is now the
  // managed NoteFlow AI preset and must never hijack existing users' configs.
  return PRESET_BY_ID[id] ?? PRESET_BY_ID['anthropic']
}
