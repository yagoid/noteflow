import { describe, it, expect } from 'vitest'
import { sanitizeSnippets } from '../../electron/snippetsFile'
import { mergeMetadataById } from '../../electron/cloudSyncLogic'

const NOW = '2026-11-07T10:00:00.000Z'

describe('sanitizeSnippets', () => {
  it('returns [] for anything that is not an array', () => {
    expect(sanitizeSnippets(null, NOW)).toEqual([])
    expect(sanitizeSnippets({ items: [] }, NOW)).toEqual([])
    expect(sanitizeSnippets('[]', NOW)).toEqual([])
  })

  it('keeps valid items in order', () => {
    const raw = [
      { id: 'a', name: 'A', content: '{date}', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', name: 'B', content: 'x', createdAt: '2026-01-02T00:00:00.000Z', isDefault: true },
    ]
    expect(sanitizeSnippets(raw, NOW)).toEqual(raw)
  })

  it('drops non-objects, missing/empty ids and duplicated ids (first wins)', () => {
    const out = sanitizeSnippets(
      [null, 3, [], { name: 'no id' }, { id: '  ' }, { id: 'a', name: 'first' }, { id: 'a', name: 'dup' }],
      NOW,
    )
    expect(out.map((s) => [s.id, s.name])).toEqual([['a', 'first']])
  })

  it('coerces name/content to strings and fills createdAt', () => {
    expect(sanitizeSnippets([{ id: 'a', name: 5, content: null }], NOW)).toEqual([
      { id: 'a', name: '', content: '', createdAt: NOW },
    ])
  })

  it('keeps isDefault only on the first flagged item, and only when true', () => {
    const out = sanitizeSnippets(
      [
        { id: 'a', isDefault: 'yes' },
        { id: 'b', isDefault: true },
        { id: 'c', isDefault: true },
      ],
      NOW,
    )
    expect(out.map((s) => s.isDefault ?? false)).toEqual([false, true, false])
    expect('isDefault' in out[0]).toBe(false)
  })

  it('preserves unknown keys (newer clients)', () => {
    const out = sanitizeSnippets([{ id: 'a', name: 'A', content: '', createdAt: NOW, icon: 'star' }], NOW)
    expect(out[0].icon).toBe('star')
  })

  it('a cloud merge by id of two devices with a default each sanitizes to one default', () => {
    const local = JSON.stringify([{ id: 'a', name: 'A', content: '', createdAt: NOW, isDefault: true }])
    const remote = JSON.stringify([{ id: 'b', name: 'B', content: '', createdAt: NOW, isDefault: true }])
    const merged = JSON.parse(mergeMetadataById(local, remote, 'remote') as string)
    const out = sanitizeSnippets(merged, NOW)
    expect(out.map((s) => s.id)).toEqual(['b', 'a'])
    expect(out.filter((s) => s.isDefault).map((s) => s.id)).toEqual(['b'])
  })
})
