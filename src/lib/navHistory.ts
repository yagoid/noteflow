// Back / forward navigation history of the main window (pure — no store, no DOM; covered by
// tests/lib/navHistory.test.ts). The store wiring lives in stores/navHistoryStore.ts. See
// "Historial de navegación (Atrás / Adelante)" in .agents/context/patterns.md.
//
// The history is a list of LOCATIONS (what the main area shows) plus the index of the current
// one, like a browser's: navigating somewhere new drops the forward part and appends; back /
// forward only move the index. A section change inside the same note doesn't add an entry, it
// rewrites the current one (Back then lands on the note in the section where it was left).
import type { ContentPlace } from './contentView'

export type NavLocation =
  /** A note in the editor (the active pane's note, on its section). */
  | { kind: 'note'; noteId: string; sectionId?: string }
  /** The single-note overview. */
  | { kind: 'overview'; noteId: string }
  /** The content view on a place (everything, favorites, a group, a folder…). */
  | { kind: 'content'; place: ContentPlace }
  /** The brain view. */
  | { kind: 'brain' }

export interface NavHistory {
  entries: NavLocation[]
  /** Current entry; -1 only when there is no current one (empty history). */
  index: number
}

export const NAV_HISTORY_LIMIT = 50

export const emptyNavHistory = (): NavHistory => ({ entries: [], index: -1 })

/** Same place for the history: a note counts as one place whatever section it shows. */
export function sameLocation(a: NavLocation, b: NavLocation): boolean {
  switch (a.kind) {
    case 'note': return b.kind === 'note' && a.noteId === b.noteId
    case 'overview': return b.kind === 'overview' && a.noteId === b.noteId
    case 'content': return b.kind === 'content' && a.place === b.place
    case 'brain': return b.kind === 'brain'
  }
}

/** Same place AND same section. */
export function equalLocation(a: NavLocation, b: NavLocation): boolean {
  if (!sameLocation(a, b)) return false
  return a.kind !== 'note' || b.kind !== 'note' || a.sectionId === b.sectionId
}

/** The note a location depends on, if any (purged when the note is gone). */
export function locationNoteId(loc: NavLocation): string | null {
  return loc.kind === 'note' || loc.kind === 'overview' ? loc.noteId : null
}

/**
 * Records that the app now shows `loc`. The same place as the current entry rewrites it (a
 * section change; the forward part stays, as with a browser's replaceState); anything else
 * drops the forward entries and appends, keeping at most `limit` entries (the oldest go).
 * Returns the same object when nothing changes.
 */
export function pushLocation(history: NavHistory, loc: NavLocation, limit = NAV_HISTORY_LIMIT): NavHistory {
  const current = history.entries[history.index]
  if (current && sameLocation(current, loc)) {
    if (equalLocation(current, loc)) return history
    const entries = history.entries.slice()
    entries[history.index] = loc
    return { entries, index: history.index }
  }
  const entries = [...history.entries.slice(0, history.index + 1), loc]
  const overflow = Math.max(0, entries.length - Math.max(1, limit))
  return { entries: overflow ? entries.slice(overflow) : entries, index: entries.length - 1 - overflow }
}

/**
 * Drops the entries `keep` rejects (a deleted note, a removed group…) and merges the
 * consecutive entries that became the same place (A, deleted, A → A; the later one wins, so
 * its section is kept). The index follows its entry; when that one is dropped it moves to the
 * closest surviving entry before it (or -1 if none survives before it).
 */
export function purgeLocations(history: NavHistory, keep: (loc: NavLocation) => boolean): NavHistory {
  const entries: NavLocation[] = []
  let index = -1
  let changed = false
  history.entries.forEach((loc, i) => {
    if (!keep(loc)) {
      changed = true
      return
    }
    const last = entries[entries.length - 1]
    if (last && sameLocation(last, loc)) {
      changed = true
      entries[entries.length - 1] = loc
    } else {
      entries.push(loc)
    }
    if (i <= history.index) index = entries.length - 1
  })
  return changed ? { entries, index } : history
}

/**
 * What a back / forward step may land on: `ok`, `skip` (passed over but kept, e.g. a locked
 * encrypted note) or `purge` (gone for good, e.g. a deleted note).
 */
export type NavCheck = 'ok' | 'skip' | 'purge'

export interface NavStep {
  /** The history after the step (purged; index on the target when there is one). */
  history: NavHistory
  /** Where to go, or null when there is nothing in that direction. */
  location: NavLocation | null
}

/**
 * One step back (`-1`) or forward (`1`): purges what `check` reports as gone, then moves to
 * the nearest entry in that direction that is `ok`, passing over the `skip` ones.
 */
export function stepHistory(history: NavHistory, direction: -1 | 1, check: (loc: NavLocation) => NavCheck): NavStep {
  const purged = purgeLocations(history, (loc) => check(loc) !== 'purge')
  for (let i = purged.index + direction; i >= 0 && i < purged.entries.length; i += direction) {
    const loc = purged.entries[i]
    if (check(loc) === 'ok') return { history: { entries: purged.entries, index: i }, location: loc }
  }
  return { history: purged, location: null }
}
