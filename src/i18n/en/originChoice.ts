// OriginChoiceDialog: the notes on this device came from another remote than
// the one just connected (a GitHub repo, or a NoteFlow Cloud account).
// Nothing syncs until the user picks one of the three options. {previous} and
// {next} are the remotes' labels ('owner/repo' for GitHub, the account email
// for NoteFlow Cloud — or one of the generic texts below when unknown).
export const originChoice = {
  title: 'Your notes came from somewhere else',
  intro: 'Nothing has been synced yet. Choose what to do with the notes on this device.',
  // "Stale" origin: the other sync's "Use only the notes from …" replaced the
  // notes on this device since this remote last synced here.
  introStale: 'The notes on this device now come from {previous}, not from {next}. Nothing has been synced yet. Choose what to do with them.',
  previousLabel: 'Notes on this device came from',
  nextLabel: 'Now connected to',
  backendGithub: 'GitHub repository',
  backendCloud: 'NoteFlow Cloud account',
  // Labels used when the remote's name is not known.
  unknownAccount: 'another NoteFlow account',
  unknownSync: 'another sync',
  unknownNextAccount: 'your NoteFlow account',
  // The three options — none is preselected.
  merge: 'Merge both',
  mergeDesc: 'Upload the notes on this device to {next} and download its notes. Both sets end up together.',
  replace: 'Use only the notes from {next}',
  replaceDesc: 'The notes on this device are moved to a copy on this computer — nothing is deleted or uploaded. Then the notes from {next} are downloaded. Open the copies from Settings → Sync.',
  cancel: 'Cancel',
  cancelDesc: 'Disconnect {next}. Your notes stay exactly as they are.',
  cancelDescCloud: 'Turn off NoteFlow Cloud on this device. You stay signed in and your notes stay exactly as they are.',
  // Appended to "Use only the notes from …" (NoteFlow Cloud) while GitHub Sync is connected.
  replaceDisconnectsGithub: 'GitHub Sync will be disconnected on this device (the repository itself is not touched).',
  continue: 'Continue',
  working: 'Working…',
  // Closes the dialog without choosing (nothing syncs meanwhile; reopen from the sync button).
  later: 'Decide later',
  archiveFailed: 'The notes on this device could not be moved to the copy, so nothing was downloaded and your notes are untouched. Close any program using the notes folder and try again.',
  failed: 'Your choice could not be applied. Please try again.',
}
