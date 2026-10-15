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
    // Same, plus what a click does (the card no longer shows it).
    ariaLabelWithHint: '{backend} sync — {status}. {hint}',
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
    files: { one: '{count} file', other: '{count} files' },
    // Activity chart (this session's syncs, newest on the right).
    chartLabel: 'Sync activity',
    barTitle: '{time} · {files}',
    barTitleFailed: '{time} · {files} · failed',
    noActivity: 'No activity yet',
    lastSyncs: { one: 'last sync', other: 'last {count} syncs' },
    filesToday: { one: '{count} file today', other: '{count} files today' },
    // Blocked first pull (shown above the error message, if any).
    blockedNotice: 'Changes won’t upload until a sync succeeds.',
    // Footer icons (tooltips).
    encryptionTooltip: 'Encryption: {mode}',
    encryptionStandard: 'Standard',
    encryptionPrivate: 'Private (E2EE)',
    realtimeTooltip: 'Real-time: {state}',
    realtimeConnected: 'Connected',
    realtimeDisconnected: 'Disconnected',
    autoSyncEvery: 'Auto-sync every {minutes} min',
    openSettings: 'Sync settings',
    // What a click on the titlebar button does (in its aria-label).
    clickToSync: 'Click to sync now',
    clickToRetry: 'Click to retry',
    unlockHint: 'Unlock in Settings → Sync',
  },

  // Crash fallback (ErrorBoundary).
  errorTitle: 'Something went wrong',
  errorBody: 'An unexpected error broke this view. Your notes are safe on disk. Try reloading the window.',
  reload: 'Reload',
}
