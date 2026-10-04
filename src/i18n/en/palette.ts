// Command palette. Command labels/descriptions translate; the fuzzy search also
// matches a set of English `keywords` (kept in code, not here) so typing an
// English term still finds a command while the UI runs in another language.
// Shortcut hints like "Ctrl+N" and the notes-folder path stay literal (in code).
export const palette = {
  commands: {
    newNote: { label: 'New note', description: 'Create a blank note · Ctrl+N' },
    newTempNote: { label: 'New temporary note', description: 'Auto-deletes in 24h · Ctrl+Shift+N' },
    createGroup: { label: 'Create group', description: 'Organize notes into a new group' },
    openBrain: { label: 'Open Brain', description: 'Explore your notes as a 3D graph' },
    aiChat: { label: 'Chat with AI', description: 'Ask your notes anything' },
    aiAsk: { label: 'Ask AI a question…', description: 'Type a question and send it straight to the chat' },
    aiRelated: { label: 'Find related notes', description: 'AI-suggested connections for a note' },
    aiProfile: { label: 'AI profile', description: 'Review or set up your second brain' },
    aiSettings: { label: 'AI provider settings', description: 'Configure the chat model & API key' },
    export: { label: 'Export notes', description: 'Save notes to a file' },
    import: { label: 'Import notes', description: 'Load notes from a file' },
    sync: { label: 'Sync notes', description: 'Pull latest from GitHub' },
    githubSync: { label: 'GitHub Sync', description: 'Open sync configuration' },
    checkUpdate: { label: 'Check for updates', description: 'Check for a new NoteFlow version' },
    startup: { label: 'Startup settings', description: 'Autostart and stickies on launch' },
    openFolder: { label: 'Open notes folder' },
    shortcuts: { label: 'Keyboard shortcuts', description: 'Open shortcut reference' },
    openSectionWindow: { label: 'Open section in new window', description: 'Edit the active section in its own window' },
  },

  // Input placeholders + the "Commands ›" breadcrumb shown in sub-modes.
  searchPlaceholder: 'Search notes or run command...',
  groupNamePlaceholder: 'Group name...',
  askPlaceholder: 'Ask your notes anything…',
  commandsBreadcrumb: 'Commands ›',

  // Create-group / ask-AI empty states. The `<kbd>Enter</kbd>` chip is a styled
  // element, so the sentence is split around it (order is shared by EN/ES).
  press: 'Press',
  createSuffix: 'to create',
  typeGroupName: 'Type a name for the new group',
  escToGoBack: 'Esc to go back',
  askSuffix: 'to ask the AI about your notes',
  typeQuestion: 'Type a question for the AI',
  opensBrainChat: 'Opens the Brain chat · Esc to go back',

  // First-run cheat sheet.
  quickShortcuts: 'Quick shortcuts',
  hide: 'hide',
  scPalette: 'palette',
  scNote: 'note',
  scSearch: 'search',
  scRawEditor: 'raw/editor',

  // Results.
  results: { one: '{count} result', other: '{count} results' },
  noResults: 'No results for "{query}"',
  commandsHeader: 'Commands',
  notesHeader: 'Notes',

  // Footer key hints.
  footer: {
    navigate: 'navigate',
    select: 'select',
    close: 'close',
    toggle: 'toggle',
    ask: 'ask',
    create: 'create',
    back: 'back',
  },
}
