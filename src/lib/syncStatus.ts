// Pure helpers behind the titlebar sync button and its hover status card
// (TitleBar.tsx + SyncStatusButton.tsx). No React, no i18n — the components map
// the results to icons and dictionary strings. Tested in tests/lib/syncStatus.test.ts.

import type { ActiveSyncStatus, SyncHistoryEntry } from '../types'

/**
 * What the sync indicator shows, in priority order: a manual sync in progress,
 * then an upload in flight, then the states that block syncing (Cloud keys
 * locked, failed first pull), then a plain error, then "first pull not done
 * yet", then local changes the backend does not have yet (its journal — e.g.
 * pushes that failed offline; a later successful pull clears `error` but not
 * these), else synced.
 */
export type SyncDisplayState =
  | 'syncing'
  | 'uploading'
  | 'locked'
  | 'blocked'
  | 'error'
  | 'pending'
  | 'unsynced'
  | 'synced'

export function getSyncDisplayState(
  status: ActiveSyncStatus,
  syncing: boolean,
  pushing: boolean,
): SyncDisplayState {
  if (syncing) return 'syncing'
  if (pushing) return 'uploading'
  // Cloud keys not in memory (locked / no-keys): a manual pull can't run until
  // the user unlocks in Settings.
  if (status.backend === 'cloud' && status.cloud?.keysState !== 'unlocked') return 'locked'
  if (status.initialPullStatus === 'failed') return 'blocked'
  if (status.error) return 'error'
  if (status.initialPullStatus === 'pending') return 'pending'
  if (status.pendingChanges > 0) return 'unsynced'
  return 'synced'
}

/**
 * The card's "Pending uploads" count: the backend's journal of local changes
 * not on the remote yet. It already includes the files in flight (journaled
 * when their push is armed); `pendingUploads` (main's in-flight set) is only a
 * floor in case a push is in flight without a journal entry.
 */
export function pendingChangeCount(status: ActiveSyncStatus): number {
  return Math.max(status.pendingChanges, status.pendingUploads)
}

/** Coarse age of a timestamp, for "just now" / "3 min ago" / "2 h ago" / "4 days ago". */
export type RelativeAge =
  | { unit: 'now' }
  | { unit: 'minutes' | 'hours' | 'days'; count: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Buckets the age of `iso` relative to `now` (ms). Under a minute — or in the
 * future (clock skew between devices) — counts as "now". Invalid input also
 * falls back to "now" rather than printing NaN.
 */
export function relativeAge(iso: string, now: number): RelativeAge {
  const diff = now - new Date(iso).getTime()
  if (!Number.isFinite(diff) || diff < MINUTE) return { unit: 'now' }
  if (diff < HOUR) return { unit: 'minutes', count: Math.floor(diff / MINUTE) }
  if (diff < DAY) return { unit: 'hours', count: Math.floor(diff / HOUR) }
  return { unit: 'days', count: Math.floor(diff / DAY) }
}

/** Bars the activity chart can hold — same as the ring size in electron/syncHistory.ts. */
export const SYNC_CHART_MAX_BARS = 24

export interface SyncChartBar {
  entry: SyncHistoryEntry
  /** Bar height in px, in [minHeight, maxHeight]. */
  height: number
}

/**
 * The activity chart's bars, oldest first (newest on the right), capped to the
 * last `maxBars` entries. Heights are relative to the busiest entry shown; an
 * entry that moved 0 files (a no-op pull, a failure) still gets `minHeight` so
 * every sync leaves a visible "heartbeat".
 */
export function syncChartBars(
  history: readonly SyncHistoryEntry[] | undefined,
  maxHeight: number,
  minHeight: number,
  maxBars = SYNC_CHART_MAX_BARS,
): SyncChartBar[] {
  const recent = (history ?? []).slice(-maxBars)
  const peak = recent.reduce((m, e) => Math.max(m, e.files), 0)
  return recent.map((entry) => ({
    entry,
    height:
      peak > 0 && entry.files > 0
        ? Math.max(minHeight, Math.round((entry.files / peak) * maxHeight))
        : minHeight,
  }))
}
