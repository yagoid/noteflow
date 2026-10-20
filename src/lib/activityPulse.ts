// Pure logic behind the decorative "activity pulse" (mirror chart) in
// Settings → General (src/components/Settings/ActivityPulse.tsx): per-day
// counts, the adaptive window and the sampled points.
//
// Two series per LOCAL day:
//  - edited (above the baseline): DISTINCT notes edited that day = the ids the
//    per-device activity log recorded for the day (userData/activity-log.json,
//    see electron/activityLog.ts) ∪ the ids of the notes whose `updated` falls on
//    it. Either way a note does NOT count on its own creation day (otherwise
//    every freshly created note would also count as edited) — for log ids that
//    is checked against the note's `created` when it is still in the store; ids
//    of notes that no longer exist still count (that activity did happen).
//    The log only exists from the moment this device started recording, and only
//    for this device; `updated` adds each note's LAST edit from any device.
//  - sectionsCreated (below): each section counts on the day of its `created`,
//    falling back to the note's `created` for older sections without one. A note
//    with no readable sections (e.g. encrypted and still locked, which the store
//    holds with `sections: []`) counts once by its `created`. This comes from the
//    notes data, so it is NOT per device.
//
// Window: from the first day with any activity up to today, clamped to
// [ACTIVITY_MIN_DAYS, ACTIVITY_MAX_DAYS]. Up to ACTIVITY_DAILY_MAX_DAYS it is
// drawn with one point per day, beyond that one point every 2 days. Each point
// is the rolling sum of the ACTIVITY_ROLLING_DAYS days ending on it (with full
// lead-in days before the window, so the first points are complete too).
//
// Only ids and timestamps are read — never titles or content — so archived,
// encrypted and temporary notes all count.

export const ACTIVITY_MAX_DAYS = 112 // 16 weeks
export const ACTIVITY_MIN_DAYS = 28 // 4 weeks
/** Windows up to this many days get one point per day; longer ones one every 2 days. */
export const ACTIVITY_DAILY_MAX_DAYS = 56
/** Each point sums the activity of the last ROLLING_DAYS days (overlapping). */
export const ACTIVITY_ROLLING_DAYS = 7

// Minimal shape needed from a note (structural subset of Note)
export interface ActivityNoteInput {
  id: string
  created: string
  updated: string
  sections?: { created?: string }[]
}

/** Per-device log: local day key (YYYY-MM-DD) → ids of the notes edited that day. */
export type ActivityLogDays = Readonly<Record<string, readonly string[]>>

export interface DayActivity {
  /** Ids of the distinct notes edited this day (see the header). */
  editedIds: string[]
  /** Sections created this day (see the header for the fallbacks). */
  sectionsCreated: number
}

const DAY_MS = 86_400_000

/** Local calendar day of `d` as YYYY-MM-DD (same format as the activity log keys). */
export function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight of `now`'s day minus `daysAgo` days (Date constructor: DST-safe). */
function dayStart(now: Date, daysAgo: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo)
}

/** Whole local days between `d`'s day and `now`'s day (0 = today, < 0 = future). */
function daysAgoOf(d: Date, now: Date): number {
  const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // Round (not floor) so a DST hour offset cannot shift the day
  return Math.round((dayStart(now, 0).getTime() - localMidnight.getTime()) / DAY_MS)
}

/** Days ago of an ISO timestamp, or null if missing/invalid. */
function isoDaysAgo(iso: string | undefined, now: Date): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : daysAgoOf(d, now)
}

/** Days ago of a YYYY-MM-DD log key, or null if malformed. */
function keyDaysAgo(key: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : daysAgoOf(d, now)
}

/** Days ago of each section's creation (with the fallbacks described in the header). */
function sectionDaysAgo(note: ActivityNoteInput, createdAgo: number | null, now: Date): (number | null)[] {
  const sections = note.sections ?? []
  if (sections.length === 0) return [createdAgo]
  return sections.map((s) => isoDaysAgo(s.created, now) ?? createdAgo)
}

/**
 * Per-day activity over the `days` local days ending today, oldest first
 * (index 0 = `days - 1` days ago, last index = today). See the header for the
 * counting and merge rules.
 */
export function dailyActivity(
  notes: ActivityNoteInput[],
  log: ActivityLogDays,
  now: Date = new Date(),
  days: number = ACTIVITY_MAX_DAYS,
): DayActivity[] {
  const edited = Array.from({ length: days }, () => new Set<string>())
  const created = new Array<number>(days).fill(0)
  // Array index of a "days ago" value, or null outside the range
  const indexOf = (ago: number | null): number | null =>
    ago !== null && ago >= 0 && ago < days ? days - 1 - ago : null

  const createdAgoById = new Map<string, number | null>()
  for (const note of notes) {
    const createdAgo = isoDaysAgo(note.created, now)
    createdAgoById.set(note.id, createdAgo)

    // Compared on the raw day, so a note created before the range and edited
    // inside it still counts as edited
    const updatedAgo = isoDaysAgo(note.updated, now)
    const editIdx = indexOf(updatedAgo)
    if (editIdx !== null && updatedAgo !== createdAgo) edited[editIdx].add(note.id)

    for (const ago of sectionDaysAgo(note, createdAgo, now)) {
      const idx = indexOf(ago)
      if (idx !== null) created[idx]++
    }
  }

  for (const [key, ids] of Object.entries(log)) {
    const ago = keyDaysAgo(key, now)
    const idx = indexOf(ago)
    if (idx === null) continue
    for (const id of ids) {
      // Creation-day rule, only checkable while the note is still in the store
      if (createdAgoById.has(id) && createdAgoById.get(id) === ago) continue
      edited[idx].add(id)
    }
  }

  return edited.map((ids, i) => ({ editedIds: [...ids], sectionsCreated: created[i] }))
}

/**
 * How many days ago the first activity happened (an edit — from the log or a
 * note's `updated`, creation day excluded — or a section created), or null if
 * there is none. Future timestamps (clock skew) are ignored.
 */
export function firstActivityDaysAgo(notes: ActivityNoteInput[], log: ActivityLogDays, now: Date = new Date()): number | null {
  let first: number | null = null
  const consider = (ago: number | null) => {
    if (ago !== null && ago >= 0 && (first === null || ago > first)) first = ago
  }
  for (const note of notes) {
    const createdAgo = isoDaysAgo(note.created, now)
    const updatedAgo = isoDaysAgo(note.updated, now)
    if (updatedAgo !== createdAgo) consider(updatedAgo)
    for (const ago of sectionDaysAgo(note, createdAgo, now)) consider(ago)
  }
  for (const [key, ids] of Object.entries(log)) {
    if (ids.length > 0) consider(keyDaysAgo(key, now))
  }
  return first
}

export interface ActivityWindow {
  /** Days shown, today included (a multiple of `step`). */
  days: number
  /** Days per point: 1 (daily) or 2. */
  step: 1 | 2
}

/**
 * Window from the first active day to today, clamped to [ACTIVITY_MIN_DAYS,
 * ACTIVITY_MAX_DAYS] (the minimum when there is no activity at all). Rounded up
 * to a whole number of points when sampled every 2 days.
 */
export function activityWindow(firstDaysAgo: number | null): ActivityWindow {
  const span = firstDaysAgo === null ? ACTIVITY_MIN_DAYS : firstDaysAgo + 1
  const clamped = Math.min(ACTIVITY_MAX_DAYS, Math.max(ACTIVITY_MIN_DAYS, span))
  const step = clamped <= ACTIVITY_DAILY_MAX_DAYS ? 1 : 2
  return { days: Math.ceil(clamped / step) * step, step }
}

/** Left-hand X-axis label: whole weeks when the window is a multiple of 7, days otherwise. */
export function activityAxisStart(days: number): { unit: 'weeks' | 'days'; count: number } {
  return days % 7 === 0 ? { unit: 'weeks', count: days / 7 } : { unit: 'days', count: days }
}

export interface ActivityPulseData extends ActivityWindow {
  /** One rolling sum per point, oldest first; the last point is today. */
  edited: number[]
  sectionsCreated: number[]
  /** Distinct notes edited within the window. */
  totalEdited: number
  /** Sections created within the window. */
  totalCreated: number
}

/** Everything the chart draws: the adaptive window, the sampled points and the legend totals. */
export function buildActivityPulse(
  notes: ActivityNoteInput[],
  log: ActivityLogDays,
  now: Date = new Date(),
): ActivityPulseData {
  const win = activityWindow(firstActivityDaysAgo(notes, log, now))
  // Daily counts over the window plus ROLLING_DAYS - 1 lead-in days, so the first
  // points' rolling sums are complete too
  const lead = ACTIVITY_ROLLING_DAYS - 1
  const days = dailyActivity(notes, log, now, win.days + lead)
  const inWindow = days.slice(lead)

  // One point every `step` days (the last one = today), each the rolling sum of
  // the ROLLING_DAYS days ending on it: overlapping windows keep the line busy
  // instead of dropping to zero between sparse active days
  const points = win.days / win.step
  const rolling = (count: (d: DayActivity) => number) =>
    Array.from({ length: points }, (_, i) => {
      const end = lead + (i + 1) * win.step // exclusive, in `days`
      let sum = 0
      for (let d = end - ACTIVITY_ROLLING_DAYS; d < end; d++) sum += count(days[d])
      return sum
    })

  return {
    ...win,
    edited: rolling((d) => d.editedIds.length),
    sectionsCreated: rolling((d) => d.sectionsCreated),
    totalEdited: new Set(inWindow.flatMap((d) => d.editedIds)).size,
    totalCreated: inWindow.reduce((s, d) => s + d.sectionsCreated, 0),
  }
}
