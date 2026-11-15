// Version history panel of a section (NoteFlow Cloud) — components/VersionHistory.
export const versionHistory = {
  title: 'Version history',
  close: 'Close',

  // Timeline (left column).
  timelineLabel: 'Versions of this section',
  currentVersion: 'Current version',
  currentVersionHint: 'What the section has now',
  today: 'Today',
  yesterday: 'Yesterday',
  // date-fns pattern of a day header older than yesterday ("Nov 12").
  dayFormat: 'EEE, MMM d',
  // date-fns pattern of a version's time in its row.
  timeFormat: 'HH:mm',
  reason: {
    shrink: 'Before a big cut',
    delete: 'Before it was deleted',
    manual: 'Saved before a restore',
  },

  // Right column.
  viewChanges: 'Changes',
  viewPreview: 'Preview',
  viewLabel: 'How to show this version',
  legendVersion: 'Only in this version',
  legendCurrent: 'Added since',
  identical: 'Identical to the current version',
  identicalHint: 'Restoring it would change nothing.',
  linesUnchanged: { one: '{count} unchanged line', other: '{count} unchanged lines' },
  tooManyChanges: 'Too many changes to compare line by line — showing the version as it was.',
  emptyVersion: 'This version is empty',
  emptyVersionHint: 'There is no text to restore.',
  currentHint: 'This is the section as it is now. Pick an earlier version on the left to compare or restore it.',
  loadingVersion: 'Opening this version…',
  versionExpired: 'This version has expired',
  versionExpiredHint: 'Versions are kept for 30 days. The list has been refreshed.',
  versionFailed: 'Couldn’t open this version',
  editedAt: 'Written {date}',

  // Footer.
  reassurance: '30 days of history · encrypted like your notes',
  copy: 'Copy',
  copied: 'Copied',
  restoreAsNew: 'Restore as new section',
  restore: 'Restore this version',
  savingCurrent: 'Saving the current text…',
  restoring: 'Restoring…',
  restoreFailed: 'Couldn’t restore this version. Your text wasn’t changed.',

  // Name of a version restored as a new section. {date} uses restoredNameDateFormat (date-fns).
  restoredName: '{name} (version from {date})',
  restoredNameDateFormat: 'MMM d, HH:mm',

  // After restoring (brief notice in the editor).
  restoredNotice: 'Restored the version from {date}',
  restoredAsNewNotice: 'Restored as a new section: {name}',
  noticeDateFormat: 'MMM d, HH:mm',
  dismiss: 'Dismiss',

  // The current text couldn't be kept in the history before replacing it.
  snapshotFailedTitle: 'The current text couldn’t be saved to the history',
  snapshotFailedBody:
    'If you replace it now, the text the section has at the moment won’t be in its history and can’t be recovered from here.',
  snapshotFailedRecommend: 'Restoring as a new section keeps both texts.',
  snapshotReasons: {
    syncOff: 'NoteFlow Cloud sync is off on this device, so the cloud may not have your latest text.',
    syncPending: 'Your latest changes haven’t reached NoteFlow Cloud yet.',
    noSubscription: 'NoteFlow Cloud didn’t accept it: an active Cloud subscription is required.',
    unreachable: 'NoteFlow Cloud can’t be reached right now.',
    locked: 'Your NoteFlow Cloud encryption keys are locked.',
    unavailable: 'Saving the current text isn’t available on the server yet.',
    signedOut: 'You’re signed out of your NoteFlow account.',
    unsupported: 'This note isn’t synced with NoteFlow Cloud.',
    generic: 'Something went wrong while saving it.',
  },
  replaceAnyway: 'Replace anyway',
  cancel: 'Cancel',

  // Whole-panel states.
  emptyTitle: 'No earlier versions yet',
  emptyBody: 'They’re saved on their own while you edit with NoteFlow Cloud.',
  offerTitle: 'Go back to any earlier version',
  offerBody:
    'NoteFlow Cloud keeps 30 days of history for every section — encrypted like your notes — so you can compare and restore what you had before.',
  offerAction: 'View NoteFlow Cloud',
  planUnknownTitle: 'Couldn’t verify your plan',
  planUnknownBody: 'The version history needs NoteFlow Cloud. Check your connection and try again.',
  lockedTitle: 'Your Cloud keys are locked',
  lockedBody: 'Unlock NoteFlow Cloud in Settings → Sync to read the history of your sections.',
  lockedAction: 'Open Sync settings',
  unreachableTitle: 'Can’t reach NoteFlow Cloud',
  unreachableBody: 'Check your connection and try again.',
  unavailableTitle: 'Version history isn’t available yet',
  unavailableBody: 'The server doesn’t offer it yet. It will appear here as soon as it does.',
  unsupportedTitle: 'This note has no version history',
  unsupportedBody: 'Notes that stay on this device and password-protected notes aren’t kept in NoteFlow Cloud.',
  errorTitle: 'Couldn’t load the history',
  errorBody: 'Something went wrong while reading it.',
  retry: 'Retry',
}
