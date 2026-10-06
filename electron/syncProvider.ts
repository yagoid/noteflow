// SyncProvider — the common surface main.ts uses to route note/metadata writes,
// deletes and pulls to the active sync backend, extracted from what main.ts
// historically consumed from githubSync.ts.
//
// GitHub Sync and NoteFlow Cloud are MUTUALLY EXCLUSIVE *as routing targets*:
// when cloudSync is enabled it takes priority and no write ROUTED THROUGH HERE
// reaches GitHub (its connection settings are untouched). That is not the same
// as "GitHub never writes": a manual GitHub pull (`sync:pull`, Settings → Sync →
// GitHub) still runs inside githubSync and its catch-up (flushPendingLocalChanges)
// pushes note files to the repo without passing through this router — by design,
// it is what keeps the paused GitHub mirror from going stale (see sync.md).
// The Settings UI enforcement of "pick one" arrives in phase 4.2 stage 4 — until
// then getActiveSyncProvider() is the single source of truth for which backend
// receives routed writes.
//
// Both adapters are THIN: they delegate 1:1 to the module singletons without
// changing behavior. Backend-specific surface (Device Flow, remote format
// migration, cloud keys/unlock) intentionally stays OUT of the interface —
// main.ts keeps calling those modules directly through their own IPC handlers.

import * as githubSync from './githubSync'
import * as cloudSync from './cloudSync'

/** Result shape shared by both backends' pullNotes (paths in updatedFiles are note DIRS). */
export interface SyncPullResult {
  pulled: number
  deleted: number
  errors: string[]
  updatedFiles: string[]
  hadDeletions: boolean
  hadMetadataChanges: boolean
  /**
   * True when the pull finished without errors but silently skipped something it
   * should have reconciled (GitHub: truncated tree listing, or a note.md present in
   * the tree whose GET failed). Not shown to the user; it keeps the temporary-note
   * expiry from running on a possibly stale copy (see tempNoteExpiry.ts).
   */
  incomplete?: boolean
}

export interface SyncProvider {
  readonly id: 'github' | 'cloud'
  /** True when this backend is set up enough to receive pushes/deletes. */
  isConnected(): boolean
  /** Debounced per-file push; relPath is notes-dir-relative and the debounce key. */
  schedulePush(
    relPath: string,
    content: string,
    onStart?: () => void,
    onComplete?: (error?: string) => void
  ): void
  /** Awaited batch push reading from disk; does NOT bump lastSync (bulk imports / agentic writes). */
  pushPathsNow(notesDir: string, relPaths: string[]): Promise<{ pushed: number; errors: string[] }>
  /** Removes a single remote file (dropped section). */
  scheduleDelete(relPath: string): Promise<void>
  /** Removes a whole remote note directory (note deletion / expiry). */
  scheduleDeleteDir(dir: string): Promise<void>
  /** Full/incremental pull into the notes dir. */
  pullNotes(notesDir: string): Promise<SyncPullResult>
  /** Drains the journal of failed/pending remote mutations. */
  retrySyncJournal(notesDir: string): Promise<void>
  /** True while remote writes are in flight (auto-sync pulls stand down). */
  hasPendingRemoteMutations(): boolean
}

export const githubProvider: SyncProvider = {
  id: 'github',
  isConnected: () => githubSync.getSyncStatus().connected,
  schedulePush: (relPath, content, onStart, onComplete) =>
    githubSync.schedulePush(relPath, content, onStart, onComplete),
  pushPathsNow: (notesDir, relPaths) => githubSync.pushPathsNow(notesDir, relPaths),
  scheduleDelete: (relPath) => githubSync.scheduleDelete(relPath),
  scheduleDeleteDir: (dir) => githubSync.scheduleDeleteDir(dir),
  pullNotes: (notesDir) => githubSync.pullNotes(notesDir),
  retrySyncJournal: (notesDir) => githubSync.retrySyncJournal(notesDir),
  hasPendingRemoteMutations: () => githubSync.hasPendingRemoteMutations(),
}

export const cloudProvider: SyncProvider = {
  id: 'cloud',
  // "Connected" = enabled + a signed-in account. The key session may still be
  // locked — pushes gate themselves internally and stay journaled until unlock.
  isConnected: () => {
    const s = cloudSync.getCloudSyncStatus()
    return s.enabled && s.configured && s.signedIn
  },
  schedulePush: (relPath, content, onStart, onComplete) =>
    cloudSync.schedulePush(relPath, content, onStart, onComplete),
  pushPathsNow: (notesDir, relPaths) => cloudSync.pushPathsNow(notesDir, relPaths),
  scheduleDelete: (relPath) => cloudSync.scheduleDelete(relPath),
  scheduleDeleteDir: (dir) => cloudSync.scheduleDeleteDir(dir),
  pullNotes: (notesDir) => cloudSync.pullNotes(notesDir),
  retrySyncJournal: (notesDir) => cloudSync.retrySyncJournal(notesDir),
  hasPendingRemoteMutations: () => cloudSync.hasPendingRemoteMutations(),
}

/** The live backend: Cloud when enabled (priority), GitHub otherwise. */
export function getActiveSyncProvider(): SyncProvider {
  return cloudSync.isCloudSyncEnabled() ? cloudProvider : githubProvider
}

/**
 * Renderer-safe, backend-tagged snapshot for the titlebar sync button and its
 * hover status card: which backend is live and its status, normalized so the UI
 * routes to ONE indicator. Mirrors getActiveSyncProvider() — Cloud (when
 * enabled) wins over GitHub, and 'none' means no backend is set up (button
 * hidden). Never carries key material.
 */
export interface ActiveSyncStatus {
  backend: 'github' | 'cloud' | 'none'
  /** True when a backend is live enough to show/allow a manual sync. */
  active: boolean
  lastSync?: string
  error?: string
  initialPullStatus: 'pending' | 'ok' | 'failed'
  /**
   * Files whose push is in flight right now (main.ts `pendingPushFiles` — the
   * same set behind `sync:push-state`). Edits still inside the 5 s push
   * debounce are not counted yet.
   */
  pendingUploads: number
  /** Cadence of the backend's periodic auto-sync loop (absent when 'none'). */
  autoSyncIntervalMs?: number
  /** Present only when backend === 'github'. */
  github?: { owner?: string; repo?: string }
  /** Present only when backend === 'cloud'. */
  cloud?: {
    keysState: cloudSync.CloudSyncStatus['keysState']
    keysMode: cloudSync.CloudSyncStatus['keysMode']
    realtimeConnected: boolean
  }
}

/** `pendingUploads` is owned by main.ts (pendingPushFiles), so the caller passes it in. */
export function getActiveSyncStatus(pendingUploads: number): ActiveSyncStatus {
  if (cloudSync.isCloudSyncEnabled()) {
    const c = cloudSync.getCloudSyncStatus()
    return {
      backend: 'cloud',
      active: true,
      lastSync: c.lastSync,
      error: c.error,
      initialPullStatus: c.initialPullStatus,
      pendingUploads,
      autoSyncIntervalMs: cloudSync.CLOUD_AUTO_SYNC_INTERVAL_MS,
      cloud: { keysState: c.keysState, keysMode: c.keysMode, realtimeConnected: c.realtimeConnected },
    }
  }
  const g = githubSync.getSyncStatus()
  if (g.connected) {
    return {
      backend: 'github',
      active: true,
      lastSync: g.lastSync,
      error: g.error,
      initialPullStatus: g.initialPullStatus,
      pendingUploads,
      autoSyncIntervalMs: githubSync.GITHUB_AUTO_SYNC_INTERVAL_MS,
      github: { owner: g.owner, repo: g.repo },
    }
  }
  return { backend: 'none', active: false, initialPullStatus: 'pending', pendingUploads }
}
