// LLM provider factory + config resolution. main.ts owns persistence (settings.aiLlm);
// this module turns a stored config into a runnable provider and a renderer-safe public view.
// Each preset keeps its own baseUrl/model/key, so switching providers never mixes credentials.
import type { LlmConfigStored, LlmConfigPublic, ResolvedLlmConfig, LlmProvider, ProviderCapabilities } from './types'
import { presetOf, PRESETS as ALL_PRESETS, type LlmPreset } from './presets'
import { decryptSecret } from './secret'
import { AnthropicProvider } from './anthropic'
import { OpenAiCompatibleProvider } from './openaiCompatible'
// No import cycle: account.ts only pulls ./secret and leaf modules (cloudConfig, entitlements*,
// settingsFile), never this module.
import { getAccessToken, getAccountStatus } from '../../account'
import { isManagedAiUsable } from '../../entitlementsRetry'

export type {
  LlmConfigStored, LlmConfigPublic, ResolvedLlmConfig, LlmProvider, ChatMessage,
  ToolSchema, ToolCall, ToolResult, AgentMessage, AgentTurnResult, Attachment, ProviderCapabilities,
} from './types'
export { PRESETS } from './presets'
export type { LlmPreset } from './presets'
export { encryptSecret, decryptSecret } from './secret'

export const DEFAULT_LLM_CONFIG: LlmConfigStored = { active: 'anthropic', byPreset: {} }

/**
 * Switches the active preset, remembering the BYO provider being left behind
 * whenever the managed `noteflow` plan takes over. That memory (lastByoProvider)
 * is what a sign-out reverts to — the managed plan stops working without a
 * session, and silently dropping the user on the generic default would lose the
 * provider they had configured.
 */
export function withActiveProvider(cfg: LlmConfigStored, next: string): LlmConfigStored {
  const out: LlmConfigStored = { ...cfg, active: next }
  if (next === 'noteflow' && cfg.active !== 'noteflow') out.lastByoProvider = cfg.active
  return out
}

/** Provider to fall back to when `noteflow` stops being usable: the last BYO one
 *  the user had active (if it is still a known preset), else the default. */
export function byoFallbackProvider(cfg: LlmConfigStored): string {
  const last = cfg.lastByoProvider
  if (last && last !== 'noteflow' && ALL_PRESETS.some((p) => p.id === last)) return last
  return DEFAULT_LLM_CONFIG.active
}

function effectiveModel(cfg: LlmConfigStored): string {
  const preset = presetOf(cfg.active)
  const ps = cfg.byPreset[preset.id] ?? {}
  const stored = ps.model?.trim() || ''
  // Presets with `modelMeta` (today only the managed `noteflow` plan) serve a CURATED
  // catalog that rotates: the proxy rejects anything outside it, so a model the user
  // picked months ago can silently become invalid and break every request. Fall back to
  // the first suggested model in that case. Everywhere else the model is free-form (the
  // user may type any id their provider serves), so the stored value is honoured as-is.
  if (preset.modelMeta && stored && !preset.suggestedModels.includes(stored)) {
    return preset.suggestedModels[0] || stored
  }
  return stored || preset.suggestedModels[0] || ''
}
/**
 * Whether `model` may be PERSISTED for `presetId`. Presets with a curated catalog
 * (`modelMeta` — today only the managed plan) accept nothing outside it: storing another
 * id would leave settings.json holding a model the proxy rejects while effectiveModel
 * resolves the requests to a different one — stored and used must never diverge. BYO
 * presets accept anything (the user knows what their provider serves).
 * Compares the TRIMMED id, exactly like effectiveModel does, so both guards agree on
 * what belongs to the catalog (a padded id must not be accepted here and rewritten there).
 */
export function acceptsModel(presetId: string, model: string): boolean {
  const preset = presetOf(presetId)
  return !preset.modelMeta || preset.suggestedModels.includes(model.trim())
}

/**
 * Whether a custom base URL may be stored/used for `presetId`. Presets with
 * `editableBaseUrl: false` are pinned to their built-in endpoint — above all the
 * managed `noteflow` one, whose credential is the user's Supabase access token:
 * honouring a stored URL there would hand that token to an arbitrary host.
 */
export function acceptsBaseUrl(presetId: string): boolean {
  return presetOf(presetId).editableBaseUrl
}

/** The endpoint requests actually go to. A non-editable preset ALWAYS resolves to its own
 *  baseUrl, whatever settings.json says (it may have been written by an older build or by hand). */
function effectiveBaseUrl(cfg: LlmConfigStored): string {
  const preset = presetOf(cfg.active)
  if (!preset.editableBaseUrl) return preset.baseUrl
  const ps = cfg.byPreset[preset.id] ?? {}
  return ps.baseUrl?.trim() || preset.baseUrl
}

/** Decrypt the active preset's key and fill defaults — in-memory only, never persisted.
 *  NOTE: for the managed `noteflow` preset this leaves apiKey empty — use
 *  resolveConfigAsync wherever a provider is about to make real requests. */
export function resolveConfig(cfg: LlmConfigStored): ResolvedLlmConfig {
  const preset = presetOf(cfg.active)
  const ps = cfg.byPreset[preset.id] ?? {}
  return {
    impl: preset.impl,
    model: effectiveModel(cfg),
    baseUrl: effectiveBaseUrl(cfg),
    apiKey: ps.encryptedApiKey ? decryptSecret(ps.encryptedApiKey) : '',
  }
}

/**
 * Like resolveConfig, but for the managed `noteflow` preset the credential is a
 * FRESH Supabase access token of the NoteFlow account session (GoTrue tokens
 * expire in ~1h, so it must be minted per request — never stored like an API
 * key). Throws a user-facing error when there is no signed-in session.
 */
export async function resolveConfigAsync(cfg: LlmConfigStored): Promise<ResolvedLlmConfig> {
  const resolved = resolveConfig(cfg)
  if (presetOf(cfg.active).id !== 'noteflow') return resolved
  const token = await getAccessToken()
  if (!token) {
    throw new Error('NoteFlow AI needs your NoteFlow account. Sign in from Settings → Account and try again.')
  }
  return { ...resolved, apiKey: token }
}

/** Native attachment support per preset (the app never extracts text itself). */
export function providerCapabilities(preset: LlmPreset, activeModel?: string): ProviderCapabilities {
  // PDF is only reliable on Anthropic (native document blocks). Images (vision) are model-dependent,
  // so each preset declares a default via `images`: text-only providers (DeepSeek, MiniMax, Moonshot's
  // suggested models) set it to false; vision-capable/flexible ones default to true.
  // The managed `noteflow` preset mixes vision and text-only models in one catalog, so its vision
  // flag is PER MODEL (preset.modelMeta): the active model decides. Unknown/empty model → default true.
  let images = preset.images ?? true
  if (preset.modelMeta && activeModel) {
    images = preset.modelMeta[activeModel]?.images ?? images
  }
  return { images, pdf: preset.impl === 'anthropic' }
}

/** Renderer-safe projection of the ACTIVE preset: no key, plus a `configured` flag the UI gates on. */
export function toPublic(cfg: LlmConfigStored): LlmConfigPublic {
  const preset = presetOf(cfg.active)
  const ps = cfg.byPreset[preset.id] ?? {}
  const model = effectiveModel(cfg)
  const hasKey = !!ps.encryptedApiKey
  let configured = (!preset.needsKey || hasKey) && !!model
  if (preset.id === 'noteflow') {
    // The managed plan needs a signed-in account AND an active 'ai' (or
    // 'bundle') subscription — otherwise the proxy answers 401/403. Entitlements
    // that were never fetched (offline boot, keychain locked…) are UNKNOWN, not
    // false: let the request through and let the proxy judge (403 if not entitled).
    configured = configured && isManagedAiUsable(getAccountStatus())
  }
  return {
    active: preset.id,
    model,
    baseUrl: effectiveBaseUrl(cfg),
    hasKey,
    configured,
    capabilities: providerCapabilities(preset, model),
  }
}

/** User-facing reason why toPublic().configured is false — tailored for the managed preset. */
export function notConfiguredMessage(cfg: LlmConfigStored): string {
  if (presetOf(cfg.active).id === 'noteflow') {
    const status = getAccountStatus()
    if (!status.signedIn) return 'NoteFlow AI needs your NoteFlow account — sign in from Settings → Account.'
    // Unknown entitlements never land here (isManagedAiUsable lets them through).
    if (!isManagedAiUsable(status)) return 'NoteFlow AI requires an active subscription — manage your plan in Settings → Account.'
  }
  return 'No LLM provider configured'
}

export function getProvider(resolved: ResolvedLlmConfig): LlmProvider {
  if (resolved.impl === 'anthropic') return new AnthropicProvider(resolved)
  return new OpenAiCompatibleProvider(resolved)
}
