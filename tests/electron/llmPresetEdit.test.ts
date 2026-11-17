import { describe, it, expect, vi } from 'vitest'

// electron/ai/llm pulls in account.ts → electron (app/safeStorage). The stub lets the module
// load; encryptSecret round-trips through it.
vi.mock('electron', () => ({
  app: { getPath: () => '.' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
}))

const { isKnownPreset, asActivePreset, toPublicFor, toPublic, withPresetFields, resolveConfig } = await import(
  '../../electron/ai/llm'
)
const { NOTEFLOW_AI_MODELS } = await import('../../electron/ai/llm/presets')
type LlmConfigStored = import('../../electron/ai/llm').LlmConfigStored

// Settings → AI edits a source before activating it: ai:llm-* take an optional `preset`
// and work on THAT preset's own state, never on `active`.

const cfg: LlmConfigStored = {
  active: 'noteflow',
  byPreset: { ollama: { model: 'llama3', baseUrl: 'http://box:11434/v1' } },
  lastByoProvider: 'ollama',
}

describe('isKnownPreset', () => {
  it('accepts the ids of the catalog', () => {
    expect(isKnownPreset('openai')).toBe(true)
    expect(isKnownPreset('noteflow')).toBe(true)
  })

  it('rejects unknown ids and non-strings (never mapped to the Anthropic fallback)', () => {
    expect(isKnownPreset('gone-provider')).toBe(false)
    expect(isKnownPreset(undefined)).toBe(false)
    expect(isKnownPreset(42)).toBe(false)
  })
})

describe('withPresetFields', () => {
  it('edits only the given preset and never touches active nor the BYO memory', () => {
    const next = withPresetFields(cfg, 'openai', { model: 'gpt-4o', apiKey: 'sk-test' })
    expect(next.active).toBe('noteflow')
    expect(next.lastByoProvider).toBe('ollama')
    expect(next.byPreset.ollama).toEqual(cfg.byPreset.ollama)
    expect(next.byPreset.openai?.model).toBe('gpt-4o')
    expect(resolveConfig(asActivePreset(next, 'openai')).apiKey).toBe('sk-test')
    // The input is not mutated.
    expect(cfg.byPreset.openai).toBeUndefined()
  })

  it('applies the guards of THAT preset: no free model nor base URL on the managed one', () => {
    const base: LlmConfigStored = { active: 'openai', byPreset: {} }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(withPresetFields(base, 'noteflow', { model: 'not-in-catalog', baseUrl: 'https://evil.example' }).byPreset.noteflow).toEqual({})
    warn.mockRestore()
    expect(withPresetFields(base, 'noteflow', { model: NOTEFLOW_AI_MODELS[0] }).byPreset.noteflow?.model).toBe(NOTEFLOW_AI_MODELS[0])
  })

  it('clears a key', () => {
    const withKey = withPresetFields(cfg, 'deepseek', { apiKey: 'sk-1' })
    expect(withKey.byPreset.deepseek?.encryptedApiKey).toBeTruthy()
    expect(withPresetFields(withKey, 'deepseek', { clearKey: true }).byPreset.deepseek?.encryptedApiKey).toBeUndefined()
  })
})

describe('toPublicFor', () => {
  it('is toPublic for the active preset', () => {
    expect(toPublicFor(cfg, 'noteflow')).toEqual(toPublic(cfg))
  })

  it("shows a non-active preset's own config, without the active-only lastByoProvider", () => {
    const view = toPublicFor(cfg, 'ollama')
    expect(view.active).toBe('ollama')
    expect(view.model).toBe('llama3')
    expect(view.baseUrl).toBe('http://box:11434/v1')
    expect(view.configured).toBe(true)
    expect(view.lastByoProvider).toBeUndefined()
  })

  it('reports a BYO preset without its key as not configured', () => {
    const view = toPublicFor(cfg, 'anthropic')
    expect(view.hasKey).toBe(false)
    expect(view.configured).toBe(false)
  })
})
