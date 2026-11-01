// "What's new" tour — which slides this device has already shown.
//
// Pure helpers, no Electron imports (same pattern as tempNoteExpiry.ts) so they can
// be unit-tested. main.ts persists the result in settings.json → `whatsNewSeen`
// (LOCAL to the device, never synced). The renderer has its own copy of the same
// rules in src/lib/whatsNew.ts (rootDir keeps electron/ and src/ apart): keep the
// id pattern and the cap in sync.

// Slide ids are short kebab-case slugs ('sections', 'links-palette', …).
const SLIDE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

// Hard cap so a corrupted or hostile file can't grow without bound. Far above any
// realistic number of slides (a handful per release).
export const MAX_SEEN_IDS = 500

/** Keeps only valid slide ids, trimmed, without duplicates, in first-seen order. */
export function sanitizeSeenIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!SLIDE_ID_RE.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_SEEN_IDS) break
  }
  return out
}

/** Union of what was stored and the ids just shown (both sanitized). */
export function mergeSeenIds(prev: unknown, add: unknown): string[] {
  return sanitizeSeenIds([...sanitizeSeenIds(prev), ...sanitizeSeenIds(add)])
}
