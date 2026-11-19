import { describe, it, expect } from 'vitest'
import {
  byoPresetFor, initialSource, modelDisplayName, modelOptions, quotaChipTone, usagePercent, usageResetDate,
} from '../../src/lib/llmSources'
import type { LlmConfigPublic, LlmPreset } from '../../src/types'

const preset = (id: string, needsKey: boolean, extra: Partial<LlmPreset> = {}): LlmPreset => ({
  id, label: id, impl: 'openai', baseUrl: '', needsKey, editableBaseUrl: true, suggestedModels: [], ...extra,
})
const presets: LlmPreset[] = [
  preset('noteflow', false, {
    editableBaseUrl: false,
    suggestedModels: ['a/rec', 'b/pricey'],
    modelMeta: {
      'a/rec': { costIndex: 1, images: true, recommended: true },
      'b/pricey': { costIndex: 29, images: true },
    },
  }),
  preset('anthropic', true, { impl: 'anthropic' }),
  preset('deepseek', true, { suggestedModels: ['deepseek-chat'] }),
  preset('ollama', false),
  preset('custom', false),
]
const cfg = (active: string, configured: boolean, extra: Partial<LlmConfigPublic> = {}): LlmConfigPublic => ({
  active, model: 'm', baseUrl: '', hasKey: false, configured, capabilities: { images: false, pdf: false }, ...extra,
})

describe('initialSource', () => {
  it('waits for the config', () => {
    expect(initialSource(null, presets)).toBeUndefined()
  })

  it('unfolds the source in use', () => {
    expect(initialSource(cfg('deepseek', true), presets)).toBe('key')
    expect(initialSource(cfg('ollama', true), presets)).toBe('local')
    expect(initialSource(cfg('noteflow', false), presets)).toBe('noteflow')
  })

  it('falls back to NoteFlow AI when nothing usable is configured, or on the offer', () => {
    expect(initialSource(cfg('anthropic', false), presets)).toBe('noteflow')
    expect(initialSource(cfg('ollama', true), presets, true)).toBe('noteflow')
  })
})

describe('byoPresetFor', () => {
  it('prefers the active provider when it belongs to the source', () => {
    expect(byoPresetFor('key', cfg('deepseek', true), presets)).toBe('deepseek')
    expect(byoPresetFor('local', cfg('custom', true), presets)).toBe('custom')
  })

  it('then the remembered BYO provider, then the default', () => {
    expect(byoPresetFor('key', cfg('noteflow', true, { lastByoProvider: 'deepseek' }), presets)).toBe('deepseek')
    expect(byoPresetFor('local', cfg('noteflow', true, { lastByoProvider: 'deepseek' }), presets)).toBe('ollama')
    expect(byoPresetFor('key', null, presets)).toBe('anthropic')
  })
})

describe('quotaChipTone', () => {
  it('no chip below ≈2×, yellow from ≈2×, red from ≈10×', () => {
    expect(quotaChipTone(undefined)).toBeNull()
    expect(quotaChipTone(1)).toBeNull()
    expect(quotaChipTone(2)).toBe('warn')
    expect(quotaChipTone(9)).toBe('warn')
    expect(quotaChipTone(10)).toBe('error')
    expect(quotaChipTone(29)).toBe('error')
  })
})

describe('modelOptions', () => {
  it('is exactly the catalog for a curated preset', () => {
    expect(modelOptions(presets[0], ['x/listed'], 'x/typed')).toEqual(['a/rec', 'b/pricey'])
  })

  it('merges suggestions, listed models and the stored one, deduplicated', () => {
    expect(modelOptions(presets[2], ['deepseek-chat', 'deepseek-reasoner'], 'my-model')).toEqual([
      'deepseek-chat', 'deepseek-reasoner', 'my-model',
    ])
    expect(modelOptions(presets[3], [], '')).toEqual([])
  })
})

describe('modelDisplayName / usagePercent', () => {
  it('drops the provider prefix', () => {
    expect(modelDisplayName('x-ai/grok-4.5')).toBe('grok-4.5')
    expect(modelDisplayName('gpt-4o')).toBe('gpt-4o')
  })

  it('floors the share and caps at 100 only when exhausted', () => {
    expect(usagePercent(999, 1000)).toBe(99)
    expect(usagePercent(1000, 1000)).toBe(100)
    expect(usagePercent(1200, 1000)).toBe(100)
  })
})

describe('usageResetDate', () => {
  it('is the first instant of next month in UTC (the proxy meters the UTC calendar month)', () => {
    expect(usageResetDate(new Date('2026-11-19T13:00:00Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(usageResetDate(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(usageResetDate(new Date('2026-02-01T00:00:00Z')).toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })
})
