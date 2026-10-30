// Right-click menu for a note (and optionally a specific section).
export const noteMenu = {
  unlockNote: 'Unlock note',
  lockNote: 'Lock note',
  removeEncryption: 'Remove encryption',
  openAlongside: 'Open alongside',
  // Section menu: a pane of its own for this section (works with the note already open).
  openSectionAlongside: 'Open section alongside',
  // Note and section menus: editor-only window for the note, opened on that section — or,
  // from the note menu, on the section the note would open on (see SectionWindowApp).
  openInNewWindow: 'Open in New Window',
  duplicateNote: 'Duplicate note',
  noteOverview: 'Note overview',
  // Section menu of an editor tab: renames it inline on the tab.
  renameSection: 'Rename section',

  // AI visibility tooltips for a single section.
  aiShowTooltip: 'The AI will index and use this section again',
  aiHideTooltip: 'The AI will never index, read or reference this section',

  sectionColor: 'Section color',
  autoColor: 'Auto',

  moveToFolder: 'Move to folder',
  removeFromGroup: 'Remove from group',
  addToGroup: 'Add to group',

  openAsSticky: 'Open as Sticky Note',
}
