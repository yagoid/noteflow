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
  // Accessible name of a note row's folded section line ({names} = comma-separated).
  sectionsSummary: 'Sections: {names}',
  // Open note's section map, capped at two rows: the cell that unfolds the rest ({count} =
  // hidden sections; short, the sidebar is narrow), its tooltip, and the one that folds back.
  moreSections: '+{count}',
  showAllSections: { one: 'Show {count} more section', other: 'Show {count} more sections' },
  showLessSections: 'Fold the sections back to two rows',

  // Search box.
  searchPlaceholder: 'Search... or #section',
  clearSearch: 'Clear search',

  // Pin switch next to the search box: pinned = docked in the layout; off =
  // floating panel that opens from the mini-view at the content's left edge.
  pinSidebarLabel: 'Pin sidebar',
  collapseSidebar: "Collapse sidebar ({key}+')",
  pinSidebar: "Pin sidebar ({key}+')",
  // Landmark label of the sidebar (docked or floating panel).
  panelLabel: 'Sidebar',

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
  // Slot at the end of a group/folder while a note is dragged over it. {name} = group or folder.
  dropIn: 'Drop in {name}',

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

  // Collapsed-group peek (hover a collapsed group's header). {group} = group name.
  peekLabel: '{group} notes',
  peekSearchPlaceholder: 'Search in {group}…',
  peekNoMatches: 'No matches',
}
