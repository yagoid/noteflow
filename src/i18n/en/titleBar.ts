// Top window bar (TitleBar) + the crash fallback bar (ErrorBoundary): window
// controls, brain toggle, update button, and the sync button + its hover status
// card (SyncStatusButton — routed to whichever backend is live: GitHub Sync or
// NoteFlow Cloud).
export const titleBar = {
  // Window controls (shared with the error fallback).
  settings: 'Settings',
  minimize: 'Minimize',
  maximize: 'Maximize',
  close: 'Close (hides to tray)',
  closeShort: 'Close',

  // Brain toggle.
  openBrain: 'Open brain view',
  closeBrain: 'Close brain view',

  // Update button.
  installing: 'Installing… NoteFlow will restart',
  downloading: 'Downloading... {progress}',
  updateAvailable: 'Update available: v{version}',

  // Sync button: aria-label summary + the hover status card (SyncStatusCard).
  // The button routes to whichever provider is active (GitHub or NoteFlow Cloud).
  sync: {
    ariaLabel: '{backend} sync — {status}',
    backendGithub: 'GitHub',
    backendCloud: 'NoteFlow Cloud',
    // Status pill.
    statusSynced: 'Synced',
    statusUploading: 'Uploading',
    statusSyncing: 'Syncing',
    statusError: 'Error',
    statusLocked: 'Locked',
    statusBlocked: 'Blocked',
    statusPending: 'Pending',
    // Data rows.
    lastSync: 'Last sync',
    never: 'Never',
    justNow: 'just now',
    minutesAgo: '{count} min ago',
    hoursAgo: '{count} h ago',
    daysAgo: { one: '{count} day ago', other: '{count} days ago' },
    pendingUploads: 'Pending uploads',
    pendingNone: 'None',
    pendingFiles: { one: '{count} file', other: '{count} files' },
    encryption: 'Encryption',
    encryptionStandard: 'Standard',
    encryptionPrivate: 'Private (E2EE)',
    realtime: 'Real-time',
    realtimeConnected: 'Connected',
    realtimeDisconnected: 'Disconnected',
    autoSync: 'Auto-sync',
    autoSyncEvery: 'every {minutes} min',
    // Blocked first pull (shown above the error message, if any).
    blockedNotice: 'Changes won’t upload until a sync succeeds.',
    // Footer.
    clickToSync: 'Click to sync now',
    clickToRetry: 'Click to retry',
    unlockHint: 'Unlock in Settings → Sync',
    openSettings: 'Settings',
  },

  // Crash fallback (ErrorBoundary).
  errorTitle: 'Something went wrong',
  errorBody: 'An unexpected error broke this view. Your notes are safe on disk. Try reloading the window.',
  reload: 'Reload',
}
