// Dictionary mapping of the sync display state and of a sync's age, shared by
// the titlebar status card (SyncStatusButton.tsx) and Settings → Sync
// (Settings/SyncOverview.tsx) so both name a state the same way.
// Non-component module (React Fast Refresh: component files only export components).

import type { Messages } from '../i18n'
import { plural, tf } from '../i18n/format'
import { relativeAge, type SyncDisplayState } from '../lib/syncStatus'

type SyncMessages = Messages['titleBar']['sync']

export function syncStateLabel(state: SyncDisplayState, s: SyncMessages): string {
  switch (state) {
    case 'syncing': return s.statusSyncing
    case 'choice': return s.statusChoice
    case 'uploading': return s.statusUploading
    case 'locked': return s.statusLocked
    case 'blocked': return s.statusBlocked
    case 'error': return s.statusError
    case 'pending': return s.statusPending
    case 'unsynced': return s.statusUnsynced
    case 'synced': return s.statusSynced
  }
}

/** "just now" / "3 min ago" / "2 h ago" / "4 days ago". */
export function formatSyncAge(iso: string, now: number, s: SyncMessages): string {
  const age = relativeAge(iso, now)
  switch (age.unit) {
    case 'now': return s.justNow
    case 'minutes': return tf(s.minutesAgo, { count: age.count })
    case 'hours': return tf(s.hoursAgo, { count: age.count })
    case 'days': return plural(s.daysAgo, age.count)
  }
}
