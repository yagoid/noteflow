// Sidebar shell: search, note list, group/folder headers and their context menus.
export const sidebar = {
  // Relative note date (formatNoteDate).
  yesterday: 'Yesterday',
  // Temporary-note expiry countdown ({m}/{h}/{d} interpolated).
  expiringSoon: 'expiring soon',
  expiresInMinutes: 'expires in {m}m',
  expiresInHours: 'expires in {h}h',
  expiresInDays: 'expires in {d}d',

  // Note row.
  openSideBySide: 'Ctrl/Cmd + click to open side by side',

  // Search box.
  searchPlaceholder: 'Search... or #section',
  clearSearch: 'Clear search',
  collapseSidebar: "Collapse sidebar (Ctrl+')",

  // New-note / new-group toolbar.
  newNoteTooltip: 'New note (Ctrl+N) · Right-click for temporary note',
  newTempNoteTooltip: 'New temporary note (24h)',
  newGroup: 'New group',
  tempNote24h: 'Temporary note (24h)',

  // All-content entry.
  viewAllContent: 'View all content',

  // Empty / section-header labels.
  noNotesMatch: 'No notes match current filters',
  noNotes: 'No notes',
  favoritesHeader: 'favorites',
  groupsHeader: 'groups',
  notesHeader: 'notes',

  // Group context menu.
  viewGroup: 'View group',
  archiveGroup: 'Archive group',
  deleteGroup: 'Delete group',
  deleteGroupMessage: '"{name}" will be deleted. Notes inside will become ungrouped.',

  // Footer.
  hideArchived: 'Hide archived',
  showArchived: 'Show archived',
  notesCount: '{count} notes',
  notesCountFiltered: '{count} / {total} notes',

  // Section tabs row (scroll arrows).
  scrollSectionsLeft: 'Scroll sections left',
  scrollSectionsRight: 'Scroll sections right',
}
