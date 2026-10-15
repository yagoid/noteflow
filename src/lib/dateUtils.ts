/**
 * Returns the first candidate that parses to a valid Date, or `null` if none does.
 *
 * Meant for dates read from disk (frontmatter can be hand-edited into garbage):
 * `formatDate()` throws a RangeError on an Invalid Date, so resolve the value here
 * first and skip rendering when nothing is usable. Typical use is a fallback chain,
 * e.g. `firstValidDate(section.created, note.created)`.
 */
export function firstValidDate(...candidates: unknown[]): Date | null {
  for (const value of candidates) {
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) continue
    if (typeof value === 'string' && value.trim() === '') continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

/** Lifetime of a freshly created temporary note (createTempNote). */
export const TEMP_NOTE_DEFAULT_HOURS = 24

/**
 * Deletion delays offered by the "Deletes …" mini menu of a temporary note (relative
 * to the moment the user picks one). Main deletes on its expiry check: every 60s
 * without sync, right after the next complete pull with sync (see patterns.md).
 */
export const TEMP_NOTE_EXPIRY_HOURS = [1, 8, 12, 24, 48] as const

/** ISO timestamp `hours` after `now` — the `expiresAt` value of a temporary note. */
export function hoursFromNow(hours: number, now: number = Date.now()): string {
  return new Date(now + hours * 60 * 60 * 1000).toISOString()
}
