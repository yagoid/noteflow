// Pure rules of the inline AI autocomplete (ghost text) on the renderer side — when a
// request may fire and how a suggestion on screen reacts to typing. The editor plugin is
// components/Editor/AiGhostText.ts; tests in tests/lib/aiAutocomplete.test.ts.

/** Typing pause before asking for a suggestion. */
export const AUTOCOMPLETE_PAUSE_MS = 400
/** Minimum (trimmed) text before the caret: with less there is nothing to continue. */
export const AUTOCOMPLETE_MIN_PREVIOUS_CHARS = 20
/** Plain text sent around the caret (main caps it again). */
export const AUTOCOMPLETE_BEFORE_CHARS = 1500
export const AUTOCOMPLETE_AFTER_CHARS = 200

export interface AutocompleteGate {
  /** The local switch (Settings → AI). */
  enabled: boolean
  /** The account has a usable NoteFlow AI plan. */
  available: boolean
  /** Main asked not to request before this (epoch ms; Infinity = not in this session). */
  blockedUntil: number
}

/** May the editor ask main for a suggestion right now? */
export function canRequestCompletion(gate: AutocompleteGate, now: number): boolean {
  return gate.enabled && gate.available && now >= gate.blockedUntil
}

/** Is there enough text before the caret to be worth a request? */
export function hasEnoughContext(before: string): boolean {
  return before.trim().length >= AUTOCOMPLETE_MIN_PREVIOUS_CHARS
}

/**
 * The user typed `typed` at the caret while `suggestion` was showing: what is left of it,
 * or null when the suggestion no longer applies (they typed something else, or all of it).
 */
export function remainingSuggestion(suggestion: string, typed: string): string | null {
  if (!typed || typed.length >= suggestion.length || !suggestion.startsWith(typed)) return null
  return suggestion.slice(typed.length)
}

/** Share of the autocomplete ceiling spent this month, 0-100 (floored; 100 only once it is used up). */
export function autocompleteUsagePercent(usage: { used: number; limit: number }): number {
  if (usage.limit <= 0) return 0
  if (usage.used >= usage.limit) return 100
  return Math.max(0, Math.floor((usage.used / usage.limit) * 100))
}
