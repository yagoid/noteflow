// Unified content view (components/ContentView/): places rail, notes timeline and section preview.
export const contentView = {
  // ── Places (rail + header) ──────────────────────────────────────────────────
  placesLabel: 'Places',
  all: 'All',
  favorites: 'Favorites',
  ungrouped: 'Ungrouped',
  // "+ Folder" under each group's folders and "+ Group" after the groups.
  addFolder: 'Folder',
  addFolderTooltip: 'New folder in {name}',
  addGroup: 'Group',
  addGroupTooltip: 'New group',
  archivedGroup: 'Archived group',

  // ── Header ──────────────────────────────────────────────────────────────────
  // "N notes · M folders · last edited <date>".
  lastEdited: 'last edited {date}',
  searchPlaceholder: 'Search note or section',
  searchLabel: 'Search in this view',
  // "+ Note": creates the note in the place's group / folder.
  newNote: 'Note',
  newNoteIn: 'New note in {name}',
  moreActions: 'More actions',
  showArchived: 'Show archived',

  // ── Timeline ────────────────────────────────────────────────────────────────
  listLabel: 'Notes: ↑ ↓ note, ← → section, Enter opens in the editor',
  blockToday: 'Today',
  blockYesterday: 'Yesterday',
  blockWeek: 'This week',
  blockMonth: 'Last 30 days',
  blockOlder: 'Earlier',
  // Route of a note listed in its own group, outside any folder.
  inGroup: 'In the group',
  encrypted: 'Encrypted',
  archivedNote: 'Archived',
  selectNote: 'Select note',
  noMatches: 'Nothing matches the search',
  emptyPlace: 'No notes here yet',

  // ── Preview ─────────────────────────────────────────────────────────────────
  previewLabel: 'Section preview',
  closePreview: 'Close the preview (Esc)',
  // "Section 2 of 5 · 340 words · edited 14:05".
  sectionPosition: 'Section {index} of {total}',
  editedAt: 'edited {date}',
  openInEditor: 'Open in the editor',

  // Handles between the columns (places | notes | preview).
  resizeColumn: 'Drag to resize · double-click to reset',

  // ── Keyboard hints (footer) ─────────────────────────────────────────────────
  hintNote: 'note',
  hintSection: 'section',
  hintOpen: 'open in the editor',
  hintClose: 'close',
  hintDrag: 'Drag a note onto a place to move it',
}
