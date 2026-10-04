// When may main run checkExpiredNotes() (the temporary-note auto-delete)?
//
// Pure decision, no Electron imports (same pattern as syncState.ts) so it can be
// unit-tested. main.ts feeds it the trigger and the live state of the active
// sync backend (getActiveSyncProvider()).
//
// Why this exists: checkExpiredNotes() reads note.md from LOCAL disk and, for an
// expired note, deletes the folder AND schedules an unconditional remote delete
// (scheduleDeleteDir never compares `updated`). A device holding a STALE copy —
// e.g. a laptop that was asleep while the note was made permanent on another
// device — would wipe the now-permanent note everywhere if it ran the check
// before pulling. So with a sync backend connected, the check runs ONLY right
// after a COMPLETE pull of that backend: no `errors` and no `incomplete` flag
// (GitHub sets it when the tree listing came back truncated or a note.md listed
// in the tree couldn't be fetched — failures the pull otherwise swallows). Such a
// pull reconciled every remote note folder, and per-folder last-writer-wins means
// the local copy is then at least as new as the remote one, so an `expiresAt`
// still on disk is one the remote agrees with. That also covers startup, resume
// from sleep and long-running devices with no extra state: nothing runs until
// the next complete pull.
// Known gap (Cloud, preexisting, see sync.md): a row that fails to decrypt makes
// THAT pull report an error, but the cursor may still move past it, so later
// pulls are "complete" without ever applying it.
//
// Consequence (intended): while pulls keep failing or coming back incomplete
// (offline, locked Cloud keys, a persistent per-folder error) temporary notes
// simply don't expire. There is deliberately no fallback that deletes anyway.

export type SyncBackendId = 'github' | 'cloud'

export type ExpiryTrigger =
  /** App startup or the 60s alarm-engine tick. */
  | { kind: 'timer' }
  /**
   * A pull of `backend` just finished (after writing what it pulled).
   * `errorCount` = result.errors.length; `incomplete` = result.incomplete.
   */
  | { kind: 'pull'; backend: SyncBackendId; errorCount: number; incomplete: boolean }

export interface ActiveSyncState {
  /** getActiveSyncProvider().id */
  backend: SyncBackendId
  /**
   * Whether a sync backend owns the notes dir. main.ts passes true whenever Cloud
   * is the active backend (= Cloud enabled), even if not signed in yet, so the
   * timer can't expire (and journal a remote delete for) a note during that window.
   */
  connected: boolean
}

export function shouldRunExpiryCheck(trigger: ExpiryTrigger, active: ActiveSyncState): boolean {
  // No sync: nothing newer can exist elsewhere — the timer owns the check
  // (today's behaviour: startup + every 60s).
  if (!active.connected) return trigger.kind === 'timer'
  // Sync connected: never on the timer, only after a pull...
  if (trigger.kind !== 'pull') return false
  // ...of the ACTIVE backend (a manual GitHub pull while Cloud is the active
  // backend proves nothing about what Cloud holds)...
  if (trigger.backend !== active.backend) return false
  // ...that completed without any error and without skipping anything. Both
  // pullNotes report failures in `errors` instead of throwing, and a per-folder
  // failure could be precisely the stale note's folder.
  return trigger.errorCount === 0 && !trigger.incomplete
}
