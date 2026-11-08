// Generic, reused-everywhere labels. Grows as panels and dialogs are migrated.
// Only put strings here that are genuinely shared verbatim across several areas;
// area-specific copy lives in its own namespace.
export const common = {
  save: 'Save',
  cancel: 'Cancel',
  confirm: 'Confirm',
  close: 'Close',
  delete: 'Delete',
  loading: 'Loading...',
  untitled: 'Untitled',

  // Shared navigation / view names.
  allContent: 'All content',
  openGroupView: 'Open in the content view',

  // Note actions shared by the context menu and the overviews.
  newNote: 'New note',
  newFolder: 'New folder',
  renameFolder: 'Rename folder',
  deleteFolder: 'Delete folder',
  // Folder context menu → icon picker (keys = FOLDER_ICONS in lib/folderIcons.ts).
  changeFolderIcon: 'Change icon',
  defaultFolderIcon: 'Default',
  folderIcons: {
    briefcase: 'Work',
    user: 'Personal',
    house: 'Home',
    lightbulb: 'Ideas',
    star: 'Star',
    heart: 'Heart',
    book: 'Book',
    'graduation-cap': 'Study',
    'file-text': 'Documents',
    pen: 'Writing',
    code: 'Code',
    terminal: 'Terminal',
    flask: 'Science',
    calendar: 'Calendar',
    target: 'Goals',
    'list-todo': 'Tasks',
    inbox: 'Inbox',
    archive: 'Archive',
    tag: 'Tag',
    image: 'Images',
    users: 'People',
    wallet: 'Finance',
    cart: 'Shopping',
    plane: 'Travel',
    globe: 'World',
    rocket: 'Projects',
    music: 'Music',
  },
  renameGroup: 'Rename group',
  unarchiveGroup: 'Unarchive group',
  deleteNote: 'Delete note',
  deleteSection: 'Delete section',
  duplicateSection: 'Duplicate section',
  // Name of the copy created by "Duplicate section".
  sectionCopyName: '{name} (copy)',
  // Date label of the editor's date line under the note title.
  // `createdAt` is the SECTION's creation date (falls back to the note's).
  createdAt: 'Created {date}',
  exportNote: 'Export note…',
  addToFavorites: 'Add to favorites',
  removeFromFavorites: 'Remove from favorites',
  archive: 'Archive',
  unarchive: 'Unarchive',
  showToAI: 'Show to AI',
  hideFromAI: 'Hide from AI',
  hiddenFromAI: 'Hidden from AI',
  moveToGroup: 'Move to group',
  moveToFolder: 'Move to folder',
  groupRoot: 'Group root',
  noFoldersYet: 'No folders yet',

  // Free colour swatch shown next to the 8 theme presets (groups and section colours).
  customColor: 'Custom color',

  // Inline inputs / add actions.
  groupNamePlaceholder: 'Group name…',
  folderNamePlaceholder: 'Folder name…',
  newFolderInline: '+ New folder…',
  newGroupInline: '+ New group…',

  // Confirm-dialog messages shared across areas ({title}/{name} interpolated).
  deleteNoteMessage: '"{title}" will be permanently deleted.',
  deleteSectionMessage: '"{name}" will be permanently deleted.',
  deleteFolderMessage: '"{name}" will be deleted. Notes inside will move to the group root.',

  // Count suffixes (plural) reused by the overviews.
  notesPlural: {
    one: '{count} note',
    other: '{count} notes',
  },
  foldersPlural: {
    one: '{count} folder',
    other: '{count} folders',
  },
}
