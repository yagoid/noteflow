import { describe, it, expect, vi, afterEach } from 'vitest'

// electron/ai/llm pulls in account.ts → electron (app/safeStorage). Nothing here touches
// it; the stub just lets the module load (same as llmProviderFallback.test.ts).
vi.mock('electron', () => ({
  app: { getPath: () => '.' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
}))

const {
  sanitizeManagedCatalog,
  parseStoredManagedCatalog,
  toStoredManagedCatalog,
  sameManagedCatalog,
  setCachedManagedCatalog,
  getCachedManagedCatalog,
  effectiveManagedCatalog,
  withManagedCatalog,
  FALLBACK_MANAGED_CATALOG,
} = await import('../../electron/ai/llm/managedCatalog')
const { acceptsModel, resolveConfig, toPublic, listPresets, providerCapabilities } = await import('../../electron/ai/llm')
const { NOTEFLOW_AI_MODELS, NOTEFLOW_AI_MODEL_META, PRESET_BY_ID } = await import('../../electron/ai/llm/presets')
type LlmConfigStored = import('../../electron/ai/llm').LlmConfigStored
type ManagedCatalog = import('../../electron/ai/llm/managedCatalog').ManagedCatalog

/** GET /models body as the proxy sends it (modelsListBody). */
const proxyBody = (entries: unknown[]) => ({ object: 'list', data: entries })
const entry = (id: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  object: 'model',
  quota_multiplier: 1,
  images: true,
  ...extra,
})

/** A catalog with a model that only exists server-side (inserted in ai_models). */
const SERVER_CATALOG: ManagedCatalog = {
  models: ['anthropic/claude-haiku-4.5', 'new/vision-model', 'new/text-model'],
  meta: {
    'anthropic/claude-haiku-4.5': { quotaMultiplier: 1, images: true },
    'new/vision-model': { quotaMultiplier: 4, images: true },
    'new/text-model': { quotaMultiplier: 1, images: false },
  },
}

afterEach(() => setCachedManagedCatalog(null))

describe('sanitizeManagedCatalog (GET /models body)', () => {
  it('parses the proxy body into an ordered catalog with metadata', () => {
    expect(
      sanitizeManagedCatalog(
        proxyBody([
          entry('b/second', { quota_multiplier: 2, images: false }),
          entry(' a/first ', { quota_multiplier: 1.5 }),
        ])
      )
    ).toEqual({
      models: ['b/second', 'a/first'],
      meta: { 'b/second': { quotaMultiplier: 2, images: false }, 'a/first': { quotaMultiplier: 1.5, images: true } },
    })
  })

  it('keeps the first occurrence of a repeated id', () => {
    expect(sanitizeManagedCatalog(proxyBody([entry('a/a', { quota_multiplier: 2 }), entry('a/a', { quota_multiplier: 9 })]))).toEqual({
      models: ['a/a'],
      meta: { 'a/a': { quotaMultiplier: 2, images: true } },
    })
  })

  it('rejects the WHOLE body when any entry is malformed (keeps the current catalog instead)', () => {
    const bad = [
      entry(''),
      entry('   '),
      entry(7),
      entry('__proto__'),
      entry('m', { quota_multiplier: 0 }),
      entry('m', { quota_multiplier: -1 }),
      entry('m', { quota_multiplier: Number.NaN }),
      entry('m', { quota_multiplier: '2' }),
      entry('m', { images: 'true' }),
      entry('m', { images: undefined }),
    ]
    for (const b of bad) expect(sanitizeManagedCatalog(proxyBody([entry('ok/model'), b]))).toBeNull()
    expect(sanitizeManagedCatalog(proxyBody([entry('ok/model'), null]))).toBeNull()
  })

  it('ignores an older proxy that only lists ids (no metadata)', () => {
    expect(sanitizeManagedCatalog({ object: 'list', data: [{ id: 'a/a', object: 'model' }] })).toBeNull()
  })

  it('ignores empty / non-list / garbage bodies', () => {
    expect(sanitizeManagedCatalog(proxyBody([]))).toBeNull()
    expect(sanitizeManagedCatalog({})).toBeNull()
    expect(sanitizeManagedCatalog(null)).toBeNull()
    expect(sanitizeManagedCatalog('nope')).toBeNull()
    expect(sanitizeManagedCatalog([entry('a/a')])).toBeNull()
    expect(sanitizeManagedCatalog({ data: 'a/a' })).toBeNull()
  })

  it('ignores an absurdly large catalog', () => {
    const many = Array.from({ length: 201 }, (_, i) => entry(`m/${i}`))
    expect(sanitizeManagedCatalog(proxyBody(many))).toBeNull()
  })
})

describe('stored catalog (settings.aiManagedCatalog)', () => {
  it('round-trips through the settings.json shape', () => {
    const stored = toStoredManagedCatalog(SERVER_CATALOG, new Date('2026-10-24T10:00:00.000Z'))
    expect(stored.updatedAt).toBe('2026-10-24T10:00:00.000Z')
    expect(stored.models[1]).toEqual({ id: 'new/vision-model', quotaMultiplier: 4, images: true })
    expect(parseStoredManagedCatalog(JSON.parse(JSON.stringify(stored)))).toEqual(SERVER_CATALOG)
  })

  it('a missing or corrupt stored value is ignored', () => {
    expect(parseStoredManagedCatalog(undefined)).toBeNull()
    expect(parseStoredManagedCatalog({ models: [] })).toBeNull()
    expect(parseStoredManagedCatalog({ models: [{ id: 'a/a', quotaMultiplier: 'x', images: true }] })).toBeNull()
    expect(parseStoredManagedCatalog([])).toBeNull()
  })
})

describe('sameManagedCatalog', () => {
  it('compares models, order and metadata', () => {
    expect(sameManagedCatalog(SERVER_CATALOG, JSON.parse(JSON.stringify(SERVER_CATALOG)))).toBe(true)
    const reordered: ManagedCatalog = { ...SERVER_CATALOG, models: [...SERVER_CATALOG.models].reverse() }
    expect(sameManagedCatalog(SERVER_CATALOG, reordered)).toBe(false)
    const repriced: ManagedCatalog = {
      ...SERVER_CATALOG,
      meta: { ...SERVER_CATALOG.meta, 'new/text-model': { quotaMultiplier: 2, images: false } },
    }
    expect(sameManagedCatalog(SERVER_CATALOG, repriced)).toBe(false)
    expect(sameManagedCatalog(SERVER_CATALOG, null)).toBe(false)
    expect(sameManagedCatalog(null, null)).toBe(true)
  })
})

describe('effective catalog', () => {
  it('is the backup constants while nothing is cached', () => {
    expect(getCachedManagedCatalog()).toBeNull()
    expect(effectiveManagedCatalog()).toBe(FALLBACK_MANAGED_CATALOG)
    expect(FALLBACK_MANAGED_CATALOG).toEqual({ models: NOTEFLOW_AI_MODELS, meta: NOTEFLOW_AI_MODEL_META })
  })

  it('is the cached one once set', () => {
    setCachedManagedCatalog(SERVER_CATALOG)
    expect(effectiveManagedCatalog()).toBe(SERVER_CATALOG)
  })

  it('withManagedCatalog swaps it into the managed preset only, as copies', () => {
    setCachedManagedCatalog(SERVER_CATALOG)
    const managed = withManagedCatalog(PRESET_BY_ID['noteflow'])
    expect(managed.suggestedModels).toEqual(SERVER_CATALOG.models)
    expect(managed.modelMeta).toEqual(SERVER_CATALOG.meta)
    managed.suggestedModels.push('mutated')
    managed.modelMeta!['new/text-model'].quotaMultiplier = 99
    expect(SERVER_CATALOG.models).not.toContain('mutated')
    expect(SERVER_CATALOG.meta['new/text-model'].quotaMultiplier).toBe(1)
    // The static preset (the backup) is never modified.
    expect(PRESET_BY_ID['noteflow'].suggestedModels).toEqual(NOTEFLOW_AI_MODELS)
    // BYO presets come back untouched.
    expect(withManagedCatalog(PRESET_BY_ID['openai'])).toBe(PRESET_BY_ID['openai'])
  })

  it('listPresets carries the effective catalog to the renderer', () => {
    const before = listPresets().find((p) => p.id === 'noteflow')!
    expect(before.suggestedModels).toEqual(NOTEFLOW_AI_MODELS)
    setCachedManagedCatalog(SERVER_CATALOG)
    const after = listPresets().find((p) => p.id === 'noteflow')!
    expect(after.suggestedModels).toEqual(SERVER_CATALOG.models)
    expect(after.modelMeta?.['new/vision-model']).toEqual({ quotaMultiplier: 4, images: true })
  })
})

describe('managed preset guards follow the effective catalog', () => {
  const managed = (model?: string): LlmConfigStored => ({
    active: 'noteflow',
    byPreset: model === undefined ? {} : { noteflow: { model } },
  })

  it('a model that only exists in the cache is accepted and used', () => {
    expect(acceptsModel('noteflow', 'new/vision-model')).toBe(false) // backup catalog: unknown
    setCachedManagedCatalog(SERVER_CATALOG)
    expect(acceptsModel('noteflow', 'new/vision-model')).toBe(true)
    expect(acceptsModel('noteflow', '  new/vision-model ')).toBe(true)
    expect(resolveConfig(managed('new/vision-model')).model).toBe('new/vision-model')
  })

  it('the user keeps a model the refreshed catalog still has (no rewrite on refresh)', () => {
    const cfg = managed('anthropic/claude-haiku-4.5')
    expect(resolveConfig(cfg).model).toBe('anthropic/claude-haiku-4.5')
    setCachedManagedCatalog(SERVER_CATALOG)
    expect(resolveConfig(cfg).model).toBe('anthropic/claude-haiku-4.5')
    // The stored config object itself is never touched.
    expect(cfg.byPreset.noteflow?.model).toBe('anthropic/claude-haiku-4.5')
  })

  it('a model missing from the effective catalog keeps today\'s rule (first model, in memory only)', () => {
    setCachedManagedCatalog(SERVER_CATALOG)
    const cfg = managed('moonshotai/kimi-k3')
    expect(resolveConfig(cfg).model).toBe(SERVER_CATALOG.models[0])
    expect(cfg.byPreset.noteflow?.model).toBe('moonshotai/kimi-k3')
    // …and it becomes effective again as soon as a catalog brings it back.
    setCachedManagedCatalog(null)
    expect(resolveConfig(cfg).model).toBe('moonshotai/kimi-k3')
  })

  it('the default model is the first of the effective catalog', () => {
    expect(resolveConfig(managed()).model).toBe(NOTEFLOW_AI_MODELS[0])
    setCachedManagedCatalog(SERVER_CATALOG)
    expect(resolveConfig(managed()).model).toBe(SERVER_CATALOG.models[0])
  })

  it('vision is per model of the effective catalog', () => {
    setCachedManagedCatalog(SERVER_CATALOG)
    expect(toPublic(managed('new/vision-model')).capabilities.images).toBe(true)
    expect(toPublic(managed('new/text-model')).capabilities.images).toBe(false)
    const live = listPresets().find((p) => p.id === 'noteflow')!
    expect(providerCapabilities(live, 'new/text-model').images).toBe(false)
  })

  it('BYO presets stay free-form whatever the catalog', () => {
    setCachedManagedCatalog(SERVER_CATALOG)
    expect(acceptsModel('openai', 'anything')).toBe(true)
    expect(resolveConfig({ active: 'ollama', byPreset: { ollama: { model: 'llama3.2:3b' } } }).model).toBe('llama3.2:3b')
  })
})
