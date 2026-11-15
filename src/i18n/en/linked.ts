// Linked notes: a note backed by an external Markdown file, edited in place.
export const linked = {
  // Entry points (new-note menu, command palette)
  linkMarkdownFile: 'Link Markdown file…',
  linkMarkdownFileDescription: 'Edit an existing .md in place, without importing it',
  linkedNoteBadge: 'Linked to a Markdown file',

  // First link: what it means
  firstLinkTitle: 'Link Markdown files',
  firstLinkMessage:
    'NoteFlow will edit these files where they are: your changes are saved straight into each file (and show up in its project and Git history), and changes made outside NoteFlow appear in the note.\n\nLinked notes are local only: they are NOT synced with NoteFlow Cloud or GitHub, nor exported.',
  firstLinkConfirm: 'Link',

  // Link errors
  linkErrorsTitle: 'Some files could not be linked',
  linkErrorLine: '{file}: {reason}',
  linkError: {
    notMarkdown: 'not a .md / .markdown file',
    notFound: 'file not found',
    notAFile: 'not a file',
    insideNotesDir: 'it is inside the NoteFlow notes folder',
    alreadyLinked: 'another note is already linked to it',
    notLinked: 'the note is no longer linked',
  },
  ok: 'OK',

  // Header of a linked note
  linkedFile: 'Linked file',
  copyPath: 'Click to copy the path',
  pathCopied: 'Path copied',
  localOnly: 'Local only — not synced with NoteFlow Cloud or GitHub',
  localOnlyShort: 'Local only',
  showInFolder: 'Show in folder',
  relocate: 'Locate file…',
  unlink: 'Unlink',

  // Status
  status: {
    ok: 'Up to date',
    missing: 'File not found',
    readonly: 'Read-only file',
    error: 'Cannot read the file',
    conflict: 'Changed outside NoteFlow',
    checking: 'Checking the file…',
  },
  unsaved: 'Unsaved changes',
  discard: 'Discard my changes',
  discardHint: 'Drop the changes that are not in the file and show its content again',
  discardConfirmTitle: 'Discard your changes?',
  discardConfirmMessage: 'The changes to "{file}" that are not in the file will be lost. The note shows the content of the file again (or its last known content if the file is missing).',
  discardConfirm: 'Discard',
  unsavedHint: 'These changes are not in the file yet: they are kept in NoteFlow and written as soon as the file can be written (if it changed meanwhile, you choose what to keep).',
  missingHint: 'The file was moved or deleted. Showing its last known content (read-only). Locate it to keep editing.',
  readonlyHint: 'The file is read-only: editing is disabled until it can be written.',
  errorHint: {
    tooLarge: 'The file is too large to edit in NoteFlow (over 2 MB). It is shown read-only.',
    invalidUtf8: 'The file is not valid UTF-8 text. It is shown read-only, with its last readable content.',
    unreadable: 'NoteFlow cannot read the file (permissions?). It is shown read-only.',
    writeFailed: 'NoteFlow could not write the file. Your changes are kept here; it will try again when you come back to the window.',
  },

  // Conflict
  conflictHint: 'The file changed outside NoteFlow while this note had unsaved edits. Nothing is written to the file until you choose.',
  reload: 'Reload',
  reloadHint: 'Discard my edits and take the version on disk',
  keepMine: 'Keep my version',
  keepMineHint: 'Overwrite the file with my version',
  compare: 'Compare…',
  keepMineConfirmTitle: 'Overwrite the file?',
  keepMineConfirmMessage: 'The changes made to "{file}" outside NoteFlow will be replaced by your version.',
  keepMineConfirm: 'Overwrite',

  // Compare modal
  compareTitle: 'Compare versions — {file}',
  compareDiff: 'Differences',
  compareMerge: 'Edit merged result',
  onDisk: 'On disk',
  mine: 'Mine',
  noDifferences: 'Both versions are identical.',
  useDisk: 'Use disk version',
  useMine: 'Use my version',
  saveMerged: 'Save merged',
  cancel: 'Cancel',

  // Unlink / delete
  unlinkTitle: 'Unlink note',
  unlinkMessage: 'Remove "{title}" from NoteFlow? The file "{file}" is NOT deleted or changed — you can link it again at any time.',
  unlinkConfirm: 'Unlink',
  unlinkNotes: 'This removes {count} linked note(s) from NoteFlow; their Markdown files are not deleted.',

  // Drop
  dropToLink: 'Drop to link the Markdown file',

  // Compact (sticky)
  readOnlyCompact: 'read-only',
}
