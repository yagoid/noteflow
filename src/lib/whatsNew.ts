// Pure logic of the "What's new" tour (src/components/WhatsNew/). No React, no IPC,
// no DOM — unit-tested in tests/lib/whatsNew.test.ts.
//
// The slide list itself lives in src/components/WhatsNew/whatsNewSlides.ts; its
// array order is the presentation order. Main persists what each device has seen
// in settings.json → `whatsNewSeen` and sanitizes with the same rules
// (electron/whatsNewSeen.ts — keep the id pattern and the cap in sync).

export interface TourSlideRef {
  id: string
  /** App version that introduced the slide ('2.2.0'). */
  since: string
}

/** 'discover' = nothing seen yet (fresh install / first run with the tour). 'new' = only what the update added. */
export type TourMode = 'discover' | 'new'

export interface TourPlan {
  slideIds: string[]
  mode: TourMode
}

const SLIDE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
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

/** Union of two seen lists (both sanitized), existing order first. */
export function mergeSeenIds(prev: unknown, add: unknown): string[] {
  return sanitizeSeenIds([...sanitizeSeenIds(prev), ...sanitizeSeenIds(add)])
}

/** Slides not seen yet, in presentation (array) order. */
export function pendingSlideIds(slides: readonly TourSlideRef[], seen: readonly string[]): string[] {
  const seenSet = new Set(seen)
  return slides.filter((s) => !seenSet.has(s.id)).map((s) => s.id)
}

/**
 * What the startup popup should present, or null when there is nothing new.
 * Never seen anything → every slide ('discover'); otherwise only the unseen ones
 * ('new' — e.g. the slides a release added). Ids stored for slides that no longer
 * exist still count as "seen something": that user is not new to NoteFlow.
 */
export function planStartupTour(slides: readonly TourSlideRef[], seenRaw: unknown): TourPlan | null {
  const seen = sanitizeSeenIds(seenRaw)
  const pending = pendingSlideIds(slides, seen)
  if (pending.length === 0) return null
  return { slideIds: pending, mode: seen.length === 0 ? 'discover' : 'new' }
}

/** The full tour (Settings → Tutorial / command palette), optionally starting at one slide. */
export function planFullTour(slides: readonly TourSlideRef[], startId?: string): { slideIds: string[]; index: number } {
  const slideIds = slides.map((s) => s.id)
  const index = startId ? slideIds.indexOf(startId) : 0
  return { slideIds, index: Math.max(0, index) }
}

/** Index after moving `delta` slides, clamped to the deck (no wrap-around). */
export function stepIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, index + delta))
}

export interface SlideMedia {
  video: string | null
  poster: string | null
}

/**
 * Picks the clip and poster of a slide from the bundled files, keyed by file name
 * (`sections.es.webm`, `sections.webm`, `sections.png`…). Per kind: the file for
 * the UI language first (`<id>.<lang>.<ext>`), then the language-neutral one
 * (`<id>.<ext>`), else null (the component draws the animated fallback).
 */
export function resolveSlideMedia(id: string, lang: string, files: Readonly<Record<string, string>>): SlideMedia {
  const pick = (ext: string) => files[`${id}.${lang}.${ext}`] ?? files[`${id}.${ext}`] ?? null
  return { video: pick('webm'), poster: pick('png') }
}

/** File name of a module path ('../../assets/whats-new/ai.es.webm' → 'ai.es.webm'). */
export function mediaFileName(modulePath: string): string {
  const parts = modulePath.split(/[\\/]/)
  return parts[parts.length - 1]
}
