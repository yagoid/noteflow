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
 * Does the text before the caret end a sentence? A period, an ellipsis ("…" or "..."), "?"
 * or "!" — optionally followed by closing quotes / brackets and by spaces — is the end of a
 * thought: guessing a whole new sentence there is mostly noise (and costs a request), so no
 * suggestion is asked for. A digit before the period counts too ("en el paso 3."); a
 * decimal being typed ("3.5") does not end in the period, so it is not affected. ":" and ","
 * are left out on purpose: what follows them continues the same sentence.
 */
export function endsSentence(before: string): boolean {
  return /[.!?…]["'”’»)\]]*\s*$/u.test(before)
}

/** What the note is about, sent with each request next to the text around the caret. */
export interface AutocompleteNoteContext {
  title: string
  /** Name of the section being written ('' = none / not to be sent). */
  section: string
  /** Names of the OTHER sections of the note. */
  sections: string[]
}

/**
 * The note context of a request: the note's title, the name of the active section and the
 * names of the others, in note order. PRIVACY: a section hidden from the AI (`aiHidden`)
 * never gives its name — neither in `sections` nor as `section` (autocomplete doesn't run
 * there anyway). Blank names, repeated ones and the active section's own name are left out
 * of `sections`. The caller decides WHETHER autocomplete may run at all (encrypted and
 * linked notes never get here).
 */
export function autocompleteNoteContext(
  title: string,
  sections: ReadonlyArray<{ id: string; name: string; aiHidden?: boolean }>,
  activeSectionId: string | null | undefined,
): AutocompleteNoteContext {
  const active = sections.find((s) => s.id === activeSectionId)
  const section = active && !active.aiHidden ? active.name.trim() : ''
  const seen = new Set<string>(section ? [section] : [])
  const others: string[] = []
  for (const s of sections) {
    if (s.id === activeSectionId || s.aiHidden) continue
    const name = s.name.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    others.push(name)
  }
  return { title: title.trim(), section, sections: others }
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
