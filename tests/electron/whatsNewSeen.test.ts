import { describe, it, expect } from 'vitest'
import { MAX_SEEN_IDS, mergeSeenIds, sanitizeSeenIds } from '../../electron/whatsNewSeen'

// settings.json → whatsNewSeen is hand-editable and shared with older builds: main
// must turn whatever it finds into a clean list before using or extending it.

describe('whatsNewSeen (main)', () => {
  it('a missing or corrupted value reads as nothing seen', () => {
    expect(sanitizeSeenIds(undefined)).toEqual([])
    expect(sanitizeSeenIds('sections')).toEqual([])
    expect(sanitizeSeenIds({ 0: 'sections' })).toEqual([])
  })

  it('mark-seen is a union: never removes, never duplicates', () => {
    const stored = ['sections', 'kanban']
    expect(mergeSeenIds(stored, ['kanban', 'brain'])).toEqual(['sections', 'kanban', 'brain'])
    expect(mergeSeenIds(stored, [])).toEqual(stored)
  })

  it('ignores junk sent over IPC', () => {
    expect(mergeSeenIds(['ai'], [42, null, '../x', 'sync'])).toEqual(['ai', 'sync'])
    expect(mergeSeenIds(['ai'], 'sync')).toEqual(['ai'])
  })

  it('cleans a stored list that was edited by hand', () => {
    expect(mergeSeenIds([' ai', 'ai', 'AI', 7], ['more'])).toEqual(['ai', 'more'])
  })

  it('stays bounded', () => {
    const full = Array.from({ length: MAX_SEEN_IDS }, (_, i) => `s${i}`)
    expect(mergeSeenIds(full, ['extra'])).toHaveLength(MAX_SEEN_IDS)
  })
})
