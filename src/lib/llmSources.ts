// Pure helpers of Settings → AI's "Assistant" section (src/components/AiPanel/LlmConfigView.tsx).
// No React, no IPC — unit-tested in tests/lib/llmSources.test.ts.
import type { LlmConfigPublic, LlmPreset } from '../types'

/**
 * The three ways of powering the assistant, offered at the same level: the managed plan, your
 * own API key (presets that need one) or a model on your computer (presets that don't — Ollama,
 * Custom).
 */
export type LlmSource = 'noteflow' | 'key' | 'local'
export type ByoSource = Exclude<LlmSource, 'noteflow'>

/** Provider preselected in each BYO source when neither the active provider nor the remembered
 *  lastByoProvider belongs to it (main's presetOf() falls back to 'anthropic' for unknown ids too). */
export const DEFAULT_BYO_PRESET: Record<ByoSource, string> = { key: 'anthropic', local: 'ollama' }

export const fitsSource = (p: LlmPreset | undefined, source: ByoSource): boolean =>
  !!p && p.id !== 'noteflow' && (source === 'key' ? p.needsKey : !p.needsKey)

export const sourceOfPreset = (id: string, presets: LlmPreset[]): LlmSource =>
  id === 'noteflow' ? 'noteflow' : presets.find((p) => p.id === id)?.needsKey === false ? 'local' : 'key'

/**
 * Source unfolded when the section opens: the one in use, or NoteFlow AI when nothing usable is
 * configured (a fresh install sits on Anthropic without a key) or when the panel was opened on the
 * managed plan's offer. `undefined` while the config has not landed yet (spinner — never a
 * fallback, or the first paint would unfold the wrong row).
 */
export function initialSource(
  cfg: LlmConfigPublic | null,
  presets: LlmPreset[],
  openOnOffer = false,
): LlmSource | undefined {
  if (!cfg) return undefined
  if (openOnOffer || cfg.active === 'noteflow' || !cfg.configured) return 'noteflow'
  return sourceOfPreset(cfg.active, presets)
}

/**
 * Provider a BYO source points at: the active one if it belongs to that source, else the provider
 * the user had before NoteFlow AI (lastByoProvider — e.g. DeepSeek with its saved key) if it does,
 * else the source's default (Anthropic for "Your API key", Ollama for "Local model").
 */
export function byoPresetFor(source: ByoSource, cfg: LlmConfigPublic | null, presets: LlmPreset[]): string {
  const find = (id: string) => presets.find((p) => p.id === id)
  if (cfg && fitsSource(find(cfg.active), source)) return cfg.active
  if (cfg?.lastByoProvider && fitsSource(find(cfg.lastByoProvider), source)) return cfg.lastByoProvider
  return DEFAULT_BYO_PRESET[source]
}

/** Share of the NoteFlow AI monthly allowance spent, as a whole percentage. The proxy reports
 *  abstract units (only used/limit is meaningful). Floored, so "100%" only shows once the
 *  allowance is really exhausted (a reservation can overshoot it slightly). */
export function usagePercent(used: number, limit: number): number {
  if (used >= limit) return 100
  return Math.max(0, Math.floor((used / limit) * 100))
}

/** Display name of a model id: drops the "provider/" prefix (x-ai/grok-4.5 → grok-4.5). The
 *  stored/sent id keeps the full form — this is cosmetic. */
export function modelDisplayName(id: string): string {
  return id.includes('/') ? id.slice(id.indexOf('/') + 1) : id
}

/**
 * Colour of the "≈N× quota" chip of a NoteFlow AI model (costIndex = how many times faster than
 * the recommended model it spends the monthly allowance). No chip below ≈2× (same threshold as
 * the chat's cost badge), yellow from ≈2×, red from ≈10×.
 */
export function quotaChipTone(costIndex: number | undefined): 'warn' | 'error' | null {
  const mult = costIndex ?? 1
  if (mult >= 10) return 'error'
  if (mult >= 2) return 'warn'
  return null
}

/**
 * Options of a preset's model picker. A curated catalog (preset.modelMeta — the managed plan) is
 * EXACTLY the catalog main has in force: main refuses to store anything else, so an option from
 * any other source would do nothing when picked. Elsewhere: the preset's suggestions, then the
 * models the provider listed, then the stored model (so a typed id stays visible), deduplicated.
 */
export function modelOptions(preset: LlmPreset, listed: string[], current: string): string[] {
  if (preset.modelMeta) return preset.suggestedModels
  const set = new Set<string>([...preset.suggestedModels, ...listed])
  if (current) set.add(current)
  return [...set]
}
