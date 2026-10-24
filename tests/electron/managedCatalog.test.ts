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
  cost_index: 1,
  images: true,
  recommended: false,
  ...extra,
})

/** A catalog with a model that only exists server-side (inserted in ai_models). */
const SERVER_CATALOG: ManagedCatalog = {
  models: ['anthropic/claude-haiku-5.5', 'new/vision-model', 'new/text-model'],
  meta: {
    'anthropic/claude-haiku-5.5': { costIndex: 1, images: true, recommended: true },
    'new/vision-model': { costIndex: 4, images: true, recommended: false },
    'new/text-model': { costIndex: 1, images: false, recommended: false },
  },
}

afterEach(() => setCachedManagedCatalog(null))

describe('sanitizeManagedCatalog (GET /models body)', () => {
  it('parses the proxy body into an ordered catalog with metadata', () => {
    expect(
      sanitizeManagedCatalog(
        proxyBody([
          entry('b/second', { cost_index: 29, images: false }),
          entry(' a/first ', { cost_index: 1, recommended: true }),
        ])
      )
    ).toEqual({
      models: ['b/second', 'a/first'],
      meta: {
        'b/second': { costIndex: 29, images: false, recommended: false },
        'a/first': { costIndex: 1, images: true, recommended: true },
      },
    })
  })

  it('a missing `recommended` reads as false', () => {
    const { recommended: _omit, ...noRec } = entry('a/a')
    expect(sanitizeManagedCatalog(proxyBody([noRec]))?.meta['a/a']).toEqual({ costIndex: 1, images: true, recommended: false })
  })

  it('still adopts a pre-0013 proxy body (quota_multiplier as the cost hint) — the models it really allows', () => {
    expect(
      sanitizeManagedCatalog(
        proxyBody([
          { id: 'deepseek/deepseek-v4-pro', object: 'model', quota_multiplier: 1, images: false },
          { id: 'moonshotai/kimi-k3', object: 'model', quota_multiplier: 6, images: true },
        ])
      )
    ).toEqual({
      models: ['deepseek/deepseek-v4-pro', 'moonshotai/kimi-k3'],
      meta: {
        'deepseek/deepseek-v4-pro': { costIndex: 1, images: false, recommended: false },
        'moonshotai/kimi-k3': { costIndex: 6, images: true, recommended: false },
      },
    })
    // cost_index wins when both are present.
    expect(sanitizeManagedCatalog(proxyBody([entry('a/a', { cost_index: 3, quota_multiplier: 9 })]))?.meta['a/a'].costIndex).toBe(3)
  })

  it('keeps the first occurrence of a repeated id', () => {
    expect(sanitizeManagedCatalog(proxyBody([entry('a/a', { cost_index: 2 }), entry('a/a', { cost_index: 9 })]))).toEqual({
      models: ['a/a'],
      meta: { 'a/a': { costIndex: 2, images: true, recommended: false } },
    })
  })

  it('rejects the WHOLE body when any entry is malformed (keeps the current catalog instead)', () => {
    const bad = [
      entry(''),
      entry('   '),
      entry(7),
      entry('__proto__'),
      entry('m', { cost_index: 0 }),
      entry('m', { cost_index: -1 }),
      entry('m', { cost_index: Number.NaN }),
      entry('m', { cost_index: '2' }),
      entry('m', { cost_index: undefined }),
      entry('m', { images: 'true' }),
      entry('m', { images: undefined }),
      entry('m', { recommended: 'yes' }),
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
    expect(stored.models[1]).toEqual({ id: 'new/vision-model', costIndex: 4, images: true, recommended: false })
    expect(parseStoredManagedCatalog(JSON.parse(JSON.stringify(stored)))).toEqual(SERVER_CATALOG)
  })

  it('a missing or corrupt stored value is ignored', () => {
    expect(parseStoredManagedCatalog(undefined)).toBeNull()
    expect(parseStoredManagedCatalog({ models: [] })).toBeNull()
    expect(parseStoredManagedCatalog({ models: [{ id: 'a/a', costIndex: 'x', images: true }] })).toBeNull()
    expect(parseStoredManagedCatalog([])).toBeNull()
  })

  it('a cache written by an older build (quotaMultiplier shape) is ignored, without throwing', () => {
    const old = {
      models: [
        { id: 'deepseek/deepseek-v4-pro', quotaMultiplier: 1, images: false },
        { id: 'moonshotai/kimi-k3', quotaMultiplier: 6, images: true },
      ],
      updatedAt: '2026-10-20T10:00:00.000Z',
    }
    expect(parseStoredManagedCatalog(old)).toBeNull()
    // → nothing cached: the backup constants apply until the next refresh replaces it.
    setCachedManagedCatalog(parseStoredManagedCatalog(old))
    expect(effectiveManagedCatalog()).toBe(FALLBACK_MANAGED_CATALOG)
  })
})

describe('sameManagedCatalog', () => {
  it('compares models, order and metadata', () => {
    expect(sameManagedCatalog(SERVER_CATALOG, JSON.parse(JSON.stringify(SERVER_CATALOG)))).toBe(true)
    const reordered: ManagedCatalog = { ...SERVER_CATALOG, models: [...SERVER_CATALOG.models].reverse() }
    expect(sameManagedCatalog(SERVER_CATALOG, reordered)).toBe(false)
    const repriced: ManagedCatalog = {
      ...SERVER_CATALOG,
      meta: { ...SERVER_CATALOG.meta, 'new/text-model': { costIndex: 2, images: false, recommended: false } },
    }
    expect(sameManagedCatalog(SERVER_CATALOG, repriced)).toBe(false)
    const rerecommended: ManagedCatalog = {
      ...SERVER_CATALOG,
      meta: { ...SERVER_CATALOG.meta, 'new/text-model': { costIndex: 1, images: false, recommended: true } },
    }
    expect(sameManagedCatalog(SERVER_CATALOG, rerecommended)).toBe(false)
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
    managed.modelMeta!['new/text-model'].costIndex = 99
    expect(SERVER_CATALOG.models).not.toContain('mutated')
    expect(SERVER_CATALOG.meta['new/text-model'].costIndex).toBe(1)
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
    expect(after.modelMeta?.['new/vision-model']).toEqual({ costIndex: 4, images: true, recommended: false })
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
    const cfg = managed('anthropic/claude-haiku-5.5')
    expect(resolveConfig(cfg).model).toBe('anthropic/claude-haiku-5.5')
    setCachedManagedCatalog(SERVER_CATALOG)
    expect(resolveConfig(cfg).model).toBe('anthropic/claude-haiku-5.5')
    // The stored config object itself is never touched.
    expect(cfg.byPreset.noteflow?.model).toBe('anthropic/claude-haiku-5.5')
  })

  it('a model missing from the effective catalog keeps today\'s rule (first model, in memory only)', () => {
    setCachedManagedCatalog(SERVER_CATALOG)
    const cfg = managed('openai/gpt-5.6-sol')
    expect(resolveConfig(cfg).model).toBe(SERVER_CATALOG.models[0])
    expect(cfg.byPreset.noteflow?.model).toBe('openai/gpt-5.6-sol')
    // …and it becomes effective again as soon as a catalog brings it back.
    setCachedManagedCatalog(null)
    expect(resolveConfig(cfg).model).toBe('openai/gpt-5.6-sol')
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
