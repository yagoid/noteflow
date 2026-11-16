// OriginChoiceDialog: the notes on this device came from another remote than
// the one just connected (GitHub repo today, NoteFlow Cloud account later).
// Nothing syncs until the user picks one of the three options. {previous} and
// {next} are the remotes' labels ('owner/repo' for GitHub).
export const originChoice = {
  title: 'Your notes came from somewhere else',
  intro: 'Nothing has been synced yet. Choose what to do with the notes on this device.',
  previousLabel: 'Notes on this device came from',
  nextLabel: 'Now connected to',
  backendGithub: 'GitHub repository',
  backendCloud: 'NoteFlow Cloud account',
  // The three options — none is preselected.
  merge: 'Merge both',
  mergeDesc: 'Upload the notes on this device to {next} and download its notes. Both sets end up together.',
  replace: 'Use only the notes from {next}',
  replaceDesc: 'The notes on this device are moved to a copy on this computer — nothing is deleted or uploaded. Then the notes from {next} are downloaded. Open the copies from Settings → Sync.',
  cancel: 'Cancel',
  cancelDesc: 'Disconnect {next}. Your notes stay exactly as they are.',
  continue: 'Continue',
  working: 'Working…',
  // Closes the dialog without choosing (nothing syncs meanwhile; reopen from the sync button).
  later: 'Decide later',
  archiveFailed: 'The notes on this device could not be moved to the copy, so nothing was downloaded and your notes are untouched. Close any program using the notes folder and try again.',
  failed: 'Your choice could not be applied. Please try again.',
}
