// Pure logic behind the Activity section of Settings → General
// (src/components/Settings/ActivitySummary.tsx): the totals cards and the
// "notes you keep coming back to" strips.
//
// Totals: every note in the store counts (archived included). Sections, words
// and tasks come from the READABLE sections only — an encrypted note still
// locked is held with `sections: []`, so it counts as a note and adds nothing
// else. Words and tasks use the section card rules (markdownTextStats).
//
// Focus: a note is TOUCHED on a local day when its id is in the per-device
// activity log for that day (userData/activity-log.json, see
// electron/activityLog.ts) ∪ the day of its `updated` ∪ the day of its
// `created`. The log only exists from the moment this device started recording,
// and only for this device; `updated` adds each note's LAST edit from any device.
// Only notes still in the store take part (a deleted note has no title to show).
// The window is FOCUS_DAYS local days, today included; future timestamps (clock
// skew) and malformed dates are ignored.

import { markdownTextStats, type MarkdownTextStats } from './noteOverviewGrid'

/** Days shown in each strip (4 weeks, today included). */
export const FOCUS_DAYS = 28
/** Notes shown in the focus block. */
export const FOCUS_ROWS = 4

/** Per-device log: local day key (YYYY-MM-DD) → ids of the notes edited that day. */
export type ActivityLogDays = Readonly<Record<string, readonly string[]>>

const DAY_MS = 86_400_000

/** Local calendar day of `d` as YYYY-MM-DD (same format as the activity log keys). */
export function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight of `now`'s day minus `daysAgo` days (Date constructor: DST-safe). */
export function dayStart(now: Date, daysAgo: number): Date {
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

// ── Totals ──────────────────────────────────────────────────────────────────────

// Minimal shapes needed from a note (structural subsets of Note)
export interface TotalsNoteInput {
  created: string
  sections: readonly { content: string }[]
}

export interface ActivityTotals {
  notes: number
  sections: number
  words: number
  tasksDone: number
  tasksTotal: number
  /** `created` of the oldest note (ISO), or null without notes / valid dates. */
  oldestCreated: string | null
}

// Sections are replaced (not mutated) on edit, so their stats are cached per
// object: recomputing after a single edit only re-reads the edited section.
const sectionStatsCache = new WeakMap<object, MarkdownTextStats>()

function sectionStats(section: { content: string }): MarkdownTextStats {
  let stats = sectionStatsCache.get(section)
  if (!stats) {
    stats = markdownTextStats(section.content)
    sectionStatsCache.set(section, stats)
  }
  return stats
}

/** The four totals cards plus the oldest note's creation date. See the header. */
export function activityTotals(notes: readonly TotalsNoteInput[]): ActivityTotals {
  const totals: ActivityTotals = { notes: notes.length, sections: 0, words: 0, tasksDone: 0, tasksTotal: 0, oldestCreated: null }
  let oldestMs = Infinity
  for (const note of notes) {
    const ms = new Date(note.created).getTime()
    if (ms < oldestMs) {
      oldestMs = ms
      totals.oldestCreated = note.created
    }
    totals.sections += note.sections.length
    for (const section of note.sections) {
      const s = sectionStats(section)
      totals.words += s.words
      totals.tasksDone += s.done
      totals.tasksTotal += s.total
    }
  }
  return totals
}

/**
 * Compact count for the cards: as is below 1000, then `1.2 k` (one decimal below
 * 10 000, none above), and `M` from a million. Decimal separator per `locale`.
 */
export function compactCount(n: number, locale?: string): string {
  if (n < 1000) return String(n)
  const [value, unit] = n < 1_000_000 ? [n / 1000, 'k'] : [n / 1_000_000, 'M']
  const digits = value < 10 ? 1 : 0
  // Floor (not round) so 999 950 never shows as "1000 k"
  const shown = Math.floor(value * 10 ** digits) / 10 ** digits
  return `${shown.toLocaleString(locale, { maximumFractionDigits: digits })} ${unit}`
}

// ── Focus ───────────────────────────────────────────────────────────────────────

export interface FocusNoteInput {
  id: string
  title: string
  created: string
  updated: string
}

export interface FocusRow {
  id: string
  title: string
  /** One flag per day of the window, oldest first; the last one is today. */
  touched: boolean[]
  /** Days touched within the window. */
  count: number
}

export interface ActivityFocus {
  /** Up to FOCUS_ROWS notes with the most days touched (ties: touched most recently first). */
  rows: FocusRow[]
  /** Distinct notes touched within the window. */
  distinct: number
}

/**
 * Days ago (0 = today) each store note was touched within the last `days` days.
 * See the header for the merge rules. Notes never touched in the window are absent.
 */
export function touchedDays(
  notes: readonly FocusNoteInput[],
  log: ActivityLogDays,
  now: Date = new Date(),
  days: number = FOCUS_DAYS,
): Map<string, Set<number>> {
  const byId = new Map<string, Set<number>>()
  const inStore = new Set(notes.map((n) => n.id))
  const touch = (id: string, ago: number | null) => {
    if (ago === null || ago < 0 || ago >= days) return
    let set = byId.get(id)
    if (!set) byId.set(id, (set = new Set()))
    set.add(ago)
  }
  for (const note of notes) {
    touch(note.id, isoDaysAgo(note.created, now))
    touch(note.id, isoDaysAgo(note.updated, now))
  }
  for (const [key, ids] of Object.entries(log)) {
    const ago = keyDaysAgo(key, now)
    for (const id of ids) if (inStore.has(id)) touch(id, ago)
  }
  return byId
}

/** The focus block: the top notes by days touched and the distinct-notes total. */
export function buildActivityFocus(
  notes: readonly FocusNoteInput[],
  log: ActivityLogDays,
  now: Date = new Date(),
  { days = FOCUS_DAYS, rows = FOCUS_ROWS }: { days?: number; rows?: number } = {},
): ActivityFocus {
  const touched = touchedDays(notes, log, now, days)
  const ranked = notes
    .filter((n) => touched.has(n.id))
    .map((n) => {
      const agos = touched.get(n.id)!
      return { note: n, agos, last: Math.min(...agos) }
    })
    .sort(
      (a, b) =>
        b.agos.size - a.agos.size ||
        a.last - b.last ||
        // Same day: the later `updated` first; then a stable order
        (b.note.updated > a.note.updated ? 1 : b.note.updated < a.note.updated ? -1 : 0) ||
        (a.note.id < b.note.id ? -1 : a.note.id > b.note.id ? 1 : 0),
    )
  return {
    rows: ranked.slice(0, rows).map(({ note, agos }) => ({
      id: note.id,
      title: note.title,
      touched: Array.from({ length: days }, (_, i) => agos.has(days - 1 - i)),
      count: agos.size,
    })),
    distinct: ranked.length,
  }
}
