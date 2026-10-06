// Pure helpers behind the titlebar sync button and its hover status card
// (TitleBar.tsx + SyncStatusButton.tsx). No React, no i18n — the components map
// the results to icons and dictionary strings. Tested in tests/lib/syncStatus.test.ts.

import type { ActiveSyncStatus } from '../types'

/**
 * What the sync indicator shows, in priority order: a manual sync in progress,
 * then an upload in flight, then the states that block syncing (Cloud keys
 * locked, failed first pull), then a plain error, then "first pull not done
 * yet", else synced.
 */
export type SyncDisplayState =
  | 'syncing'
  | 'uploading'
  | 'locked'
  | 'blocked'
  | 'error'
  | 'pending'
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
  return 'synced'
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
