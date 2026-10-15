// In-memory activity history behind the mini bar chart of the titlebar sync
// card (SyncStatusButton.tsx). Each sync backend (githubSync.ts, cloudSync.ts)
// owns one recorder; getActiveSyncStatus (syncProvider.ts) exposes the live
// backend's entries as `history` and its running day total as `filesToday`. Deliberately NOT persisted — it starts empty
// on every launch and only describes this session.
//
// Pure module: no Electron imports (same pattern as syncState.ts / mirrorPlan.ts).
// Covered by tests/electron/syncHistory.test.ts.

/** One bar of the chart: when it landed, how many files moved, whether it all went well. */
export interface SyncHistoryEntry {
  /** ISO time of the latest operation folded into this entry. */
  at: string
  /** Files transferred (uploaded + downloaded/applied locally). */
  files: number
  /** False if ANY operation folded into this entry failed. */
  ok: boolean
}

/** Ring size — also the max number of bars the card draws. */
export const SYNC_HISTORY_MAX = 24

/**
 * Operations landing in the same fixed time bucket are folded into ONE entry.
 * Single-file pushes are debounced per path (5 s) and a note save is 2+ files,
 * so without this every pause while typing would push a bar of its own and the
 * 24 slots would cover a couple of minutes. One bucket per minute keeps the
 * chart readable: a bar = "what synced in that minute".
 */
export const SYNC_HISTORY_BUCKET_MS = 60_000

/**
 * Returns a NEW history with the operation appended: folded into the last
 * entry when both fall in the same `bucketMs` window (files summed, `ok` ANDed,
 * `at` moved to `now`), otherwise pushed as a new entry and the oldest dropped
 * beyond `max`. Negative/NaN file counts are clamped to 0.
 */
export function appendSyncHistory(
  history: readonly SyncHistoryEntry[],
  files: number,
  ok: boolean,
  now: number,
  max = SYNC_HISTORY_MAX,
  bucketMs = SYNC_HISTORY_BUCKET_MS,
): SyncHistoryEntry[] {
  const count = Number.isFinite(files) && files > 0 ? Math.floor(files) : 0
  const at = new Date(now).toISOString()
  const last = history[history.length - 1]
  if (last && Math.floor(Date.parse(last.at) / bucketMs) === Math.floor(now / bucketMs)) {
    return [...history.slice(0, -1), { at, files: last.files + count, ok: last.ok && ok }]
  }
  const next = [...history, { at, files: count, ok }]
  return next.length > max ? next.slice(next.length - max) : next
}

/**
 * Running total of files moved on one LOCAL calendar day. Kept apart from the
 * ring because the ring only covers ~2 h (24 entries, and the 5-min auto-sync
 * tick records a heartbeat entry every time), so summing it would undercount.
 */
export interface SyncDayTotal {
  /** Local date as 'YYYY-MM-DD'. */
  day: string
  files: number
}

/** 'YYYY-MM-DD' of `now` in the process's local time zone. */
export function localDayKey(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Adds `files` to the day total, restarting from 0 when the local date changed. */
export function addToDayTotal(total: SyncDayTotal | null, files: number, now: number): SyncDayTotal {
  const count = Number.isFinite(files) && files > 0 ? Math.floor(files) : 0
  const day = localDayKey(now)
  return { day, files: (total && total.day === day ? total.files : 0) + count }
}

/** Files moved on `now`'s local day — 0 when the stored total belongs to an earlier day. */
export function filesOnDay(total: SyncDayTotal | null, now: number): number {
  return total && total.day === localDayKey(now) ? total.files : 0
}

export interface SyncHistoryRecorder {
  /** Records a finished operation (`files` moved, `ok` = it fully succeeded). */
  record(files: number, ok: boolean): void
  /** Snapshot copy, oldest first. */
  list(): SyncHistoryEntry[]
  /** Files moved so far today (local day), across the whole session — not just the ring. */
  filesToday(): number
}

/** A per-backend recorder; `clock` is injectable for tests. */
export function createSyncHistory(clock: () => number = Date.now): SyncHistoryRecorder {
  let entries: SyncHistoryEntry[] = []
  let dayTotal: SyncDayTotal | null = null
  return {
    record(files, ok) {
      const now = clock()
      entries = appendSyncHistory(entries, files, ok, now)
      dayTotal = addToDayTotal(dayTotal, files, now)
    },
    list() {
      return entries.map((e) => ({ ...e }))
    },
    filesToday() {
      return filesOnDay(dayTotal, clock())
    },
  }
}
