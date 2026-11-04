// Group overview + note overview + shared note/section cards.
export const overview = {
  // ── Group overview ──────────────────────────────────────────────────────────
  doubleClickRename: 'Double-click to rename',
  groupColor: 'Group color',
  archivedBadge: 'Archived',
  cardWidth: 'Card width',
  newNoteInGroup: 'New note in this group',
  groupEmpty: 'This group is empty',
  noFolder: 'No folder',
  archived: 'Archived',
  emptyDropHint: 'Empty — drop a note here',
  empty: 'Empty',

  // Select-all in the group view: header button (Ctrl/Cmd+A) + per-band checkbox.
  selectAllNotesTooltip: 'Select every note in this group (Ctrl/Cmd+A)',
  deselectAllNotesTooltip: 'Clear the selection (Ctrl/Cmd+A)',
  selectBandTooltip: 'Select all notes in "{name}"',
  deselectBandTooltip: 'Deselect all notes in "{name}"',

  // Group-overview delete confirmations.
  deleteNotes: 'Delete notes',
  deleteNotesMessage: '{count} notes will be permanently deleted.',

  // Selection action bar (group overview).
  selectedCount: '{count} selected',
  favorite: 'Favorite',
  unfavorite: 'Unfavorite',
  moveToFolderTooltip: 'Move to folder in this group',
  noGroup: 'No group',
  deleteSelected: 'Delete selected',
  clearSelection: 'Clear selection (Esc)',

  // ── Note overview ───────────────────────────────────────────────────────────
  // Header: "N sections · edited <date>", the active grid button that closes the view,
  // and the ⋯ note menu.
  editedAt: 'edited {date}',
  closeOverview: 'Close note overview (Esc)',
  noteOptions: 'Note options',
  noteOptionsTooltip: 'Note options (rename, delete…)',
  // The "New section" cell that closes the grid (adds a section and opens it to write).
  newSection: 'New section',
  addSectionTooltip: 'Add section and edit it',
  noteEncrypted: 'This note is encrypted',
  unlockToPreview: 'Unlock it in the editor to preview its sections',
  noSections: 'This note has no sections',
  sectionsPlural: {
    one: '{count} section',
    other: '{count} sections',
  },

  // Select-all toggle (header) — mirrors the Ctrl/Cmd+A shortcut.
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  selectAllTooltip: 'Select every section (Ctrl/Cmd+A)',
  deselectAllTooltip: 'Clear the selection (Ctrl/Cmd+A)',

  // AI visibility tooltips for a multi-section selection.
  aiShowTooltip: 'The AI will index and use these sections again',
  aiHideTooltip: 'The AI will never index, read or reference these sections',
  cantDeleteAllSections: "Can't delete every section — delete the note instead",

  // Markdown mode (rendered) ↔ text mode (shown as-is) for a multi-section selection.
  modeEditor: 'Markdown mode',
  modeRaw: 'Text mode',
  modeEditorTooltip: 'Render these sections as markdown',
  modeRawTooltip: 'Show these sections as plain text, without rendering',

  // Note-overview delete-sections confirmation.
  deleteSections: 'Delete sections',
  deleteSectionsMessage: {
    one: '{count} section will be permanently deleted.',
    other: '{count} sections will be permanently deleted.',
  },

  // Section card (a cell of the grid). `{label}` = openSection / backToSection.
  sectionsListLabel: 'Note sections',
  openSection: 'Open "{name}"',
  backToSection: 'Back to "{name}" in the editor',
  cardTooltip: '{label} · drag to reorder',
  selectSection: 'Select section',
  // Tag on the header of the section the editor has open (shown uppercase).
  openTag: 'Open',
  emptySectionHint: 'Empty section · click to write',
  // Card footer: task progress (3+ tasks), else the word count; "Text" = text mode.
  tasksProgress: '{done}/{total} tasks',
  wordsPlural: {
    one: '{count} word',
    other: '{count} words',
  },
  emptyStat: 'Empty',
  rawBadge: 'Text',
  selectionActions: 'Selection actions',

  // Section preview card (shared with the hover popover).
  rawSection: 'Text section',
  richSection: 'Markdown section',
  emptySection: 'Empty section',
}
