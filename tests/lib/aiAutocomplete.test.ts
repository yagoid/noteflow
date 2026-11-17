import { describe, it, expect } from 'vitest'
import {
  AUTOCOMPLETE_MIN_PREVIOUS_CHARS, AUTOCOMPLETE_PAUSE_MS,
  autocompleteUsagePercent, canRequestCompletion, hasEnoughContext, remainingSuggestion,
} from '../../src/lib/aiAutocomplete'

describe('canRequestCompletion', () => {
  const now = 1_000_000
  const open = { enabled: true, available: true, blockedUntil: 0 }

  it('needs the switch on and a usable plan', () => {
    expect(canRequestCompletion(open, now)).toBe(true)
    expect(canRequestCompletion({ ...open, enabled: false }, now)).toBe(false)
    expect(canRequestCompletion({ ...open, available: false }, now)).toBe(false)
  })

  it('respects the block main asked for', () => {
    expect(canRequestCompletion({ ...open, blockedUntil: now + 1 }, now)).toBe(false)
    expect(canRequestCompletion({ ...open, blockedUntil: now }, now)).toBe(true)
    expect(canRequestCompletion({ ...open, blockedUntil: Infinity }, now)).toBe(false)
  })

  it('pauses ~400 ms before asking', () => {
    expect(AUTOCOMPLETE_PAUSE_MS).toBe(400)
  })
})

describe('hasEnoughContext', () => {
  it(`needs ${AUTOCOMPLETE_MIN_PREVIOUS_CHARS} characters, not counting outer whitespace`, () => {
    expect(hasEnoughContext('a'.repeat(AUTOCOMPLETE_MIN_PREVIOUS_CHARS))).toBe(true)
    expect(hasEnoughContext('a'.repeat(AUTOCOMPLETE_MIN_PREVIOUS_CHARS - 1))).toBe(false)
    expect(hasEnoughContext(`   ${'a'.repeat(AUTOCOMPLETE_MIN_PREVIOUS_CHARS - 1)}\n\n`)).toBe(false)
    expect(hasEnoughContext('')).toBe(false)
  })
})

describe('remainingSuggestion', () => {
  it('typing what the suggestion starts with keeps the rest', () => {
    expect(remainingSuggestion(' al dentista', ' ')).toBe('al dentista')
    expect(remainingSuggestion(' al dentista', ' al d')).toBe('entista')
  })

  it('anything else, or typing all of it, drops it', () => {
    expect(remainingSuggestion(' al dentista', 'x')).toBeNull()
    expect(remainingSuggestion(' al dentista', ' Al')).toBeNull()
    expect(remainingSuggestion(' al dentista', ' al dentista')).toBeNull()
    expect(remainingSuggestion(' al dentista', ' al dentista y')).toBeNull()
    expect(remainingSuggestion(' al dentista', '')).toBeNull()
  })
})

describe('autocompleteUsagePercent', () => {
  it('floors, and reaches 100 only when used up', () => {
    expect(autocompleteUsagePercent({ used: 0, limit: 900 })).toBe(0)
    expect(autocompleteUsagePercent({ used: 450, limit: 900 })).toBe(50)
    expect(autocompleteUsagePercent({ used: 899, limit: 900 })).toBe(99)
    expect(autocompleteUsagePercent({ used: 900, limit: 900 })).toBe(100)
    expect(autocompleteUsagePercent({ used: 1200, limit: 900 })).toBe(100)
    expect(autocompleteUsagePercent({ used: 5, limit: 0 })).toBe(0)
  })
})
