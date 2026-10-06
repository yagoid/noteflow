// Note editor UI: the note pane, its section tabs/menu, the formatting toolbar,
// the table controls, the slash-command menu, the in-note search bars, the
// section-link picker and the code-block language selector. Distinct from
// `settings.editor` (the Editor settings panel) — this is the editor itself.
export const editor = {
  // Empty state (no note open).
  noNoteSelected: 'No note selected',
  createHint: 'Ctrl+N to create one',

  // Section tabs + placeholders.
  dragToReorder: 'Drag to reorder section',
  addSection: 'Add section (Ctrl+T)',
  sectionFallback: 'Section',
  sectionStartWriting: '{name} — start writing...',
  noteOverview: 'Note overview — all sections at a glance',
  sectionOptions: 'Section options',
  renameSection: 'Rename section',

  // Save-as-template modal.
  saveAsTemplate: 'Save as template',
  saveAsTemplateHint: 'Save this note (title + sections) as a reusable template',
  templateName: 'Template name',
  untitledTemplate: 'Untitled template',

  // Metadata line under the title.
  deletesAt: 'Deletes {date}',

  // Floating table of contents at the right of the editor (EditorToc).
  toc: {
    label: 'Table of contents',
  },

  // Section delete undo toast.
  sectionDeleted: 'Section "{name}" deleted',
  undo: 'Undo',

  // Section colour picker.
  auto: 'Auto',

  // Encrypted (locked) note view.
  noteEncrypted: 'This note is encrypted',
  clickToUnlock: 'Click to unlock',

  // Section options dropdown.
  menu: {
    editorMode: 'Editor mode',
    rawMode: 'Raw markdown mode',
    copySectionText: 'Copy section text',
    showToAiHint: 'The AI will index and use this section again',
    hideFromAiHint: 'The AI will never index, read or reference this section',
    openAsSticky: 'Open as sticky note',
    archiveNote: 'Archive note',
    unarchiveNote: 'Unarchive note',
    makePermanent: 'Make permanent',
    makePermanentHint: 'Keep this temporary note — it will no longer be deleted automatically',
    encryptNote: 'Encrypt note',
    removeEncryption: 'Remove encryption',
  },

  // Formatting toolbar (button tooltips; shortcut hints kept literal).
  toolbar: {
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    bold: 'Bold (Ctrl+B)',
    italic: 'Italic (Ctrl+I)',
    underline: 'Underline (Ctrl+U)',
    strikethrough: 'Strikethrough',
    highlight: 'Highlight (accent color)',
    inlineCode: 'Inline code (Ctrl+E)',
    codeBlock: 'Code block (Ctrl+Shift+B)',
    bulletList: 'Bullet list',
    orderedList: 'Ordered list',
    taskList: 'Task list',
    blockquote: 'Blockquote',
    insertLink: 'Insert link',
    insertTable: 'Insert table',
    deleteTable: 'Delete table',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    set: 'Set',
  },

  // Table controls (toolbar strip + right-click menu).
  table: {
    label: 'Table',
    row: 'Row',
    col: 'Col',
    tableWord: 'Table',
    addRowAboveBlocked: "Can't add a row above the header",
    addRowAbove: 'Insert row above the current one',
    addRowBelow: 'Insert row below the current one',
    deleteRowBlocked: "The header row can't be deleted",
    deleteRow: 'Delete current row',
    addColLeft: 'Insert column to the left',
    addColRight: 'Insert column to the right',
    deleteCol: 'Delete current column',
    alignLeft: 'Align column left',
    alignCenter: 'Align column center',
    alignRight: 'Align column right',
    deleteWholeTable: 'Delete the whole table',
    // Right-click context menu labels (shorter than the toolbar tooltips).
    alignLeftMenu: 'Align left',
    alignCenterMenu: 'Align center',
    alignRightMenu: 'Align right',
    deleteTableMenu: 'Delete table',
  },

  // In-note find bar (rich + raw).
  search: {
    findInNote: 'Find in note',
    matchCase: 'Match case',
    previousMatch: 'Previous match (Shift+Enter)',
    nextMatch: 'Next match (Enter)',
    close: 'Close (Escape)',
  },

  // Slash (/) command menu.
  slash: {
    linkSection: 'Link section',
    linkSectionDescription: 'Link to another section',
    kanban: 'Kanban board',
    kanbanDescription: 'Columns and cards you can drag around',
    convertToKanban: 'Convert task list to board',
    convertToKanbanDescription: 'Turn this task list into a kanban board',
    noCommands: 'No commands',
  },

  // Section-link picker overlay.
  sectionLink: {
    placeholder: 'Link to section…',
    noSectionsFound: 'No sections found',
  },

  // Code-block language selector.
  codeBlock: {
    plainText: 'Plain text',
    copy: 'Copy',
    copied: '✓ Copied',
    searchLanguage: 'Search language…',
    noLanguages: 'No languages',
  },

  // Task list items: deadline + importance controls.
  task: {
    importanceLow: 'Low',
    importanceMedium: 'Medium',
    importanceHigh: 'High',
    setImportance: 'Set importance',
    importanceTooltip: 'Importance: {level}',
    setDeadline: 'Set deadline',
    deadlineTooltip: 'Deadline: {date}',
    date: 'Date',
    alarm: 'Alarm',
    clear: 'Clear',
    done: 'Done',
  },

  // In-note kanban board (KanbanBoardView).
  kanban: {
    label: 'Kanban',
    defaultTodo: 'To do',
    defaultDoing: 'In progress',
    defaultDone: 'Done',
    columnsCount: { one: '{count} column', other: '{count} columns' },
    cardsCount: { one: '{count} card', other: '{count} cards' },
    selectBoard: 'Select board (Backspace deletes it)',
    convertToTaskList: 'Convert to task list',
    deleteBoard: 'Delete board',
    confirmDeleteBoard: 'Click again to delete',
    addCard: 'Add card',
    cardPlaceholder: 'Card text… (Enter to save)',
    addColumn: 'Add column',
    columnPlaceholder: 'Column name…',
    untitledColumn: 'Untitled',
    columnOptions: 'Column options',
    dragColumn: 'Drag to reorder',
    rename: 'Rename',
    markDone: 'Mark as done column',
    unmarkDone: 'Unset done column',
    doneColumn: 'Done column: cards moved here get checked',
    deleteColumn: 'Delete column',
    confirmDeleteColumn: {
      one: 'Delete it and its card?',
      other: 'Delete it and its {count} cards?',
    },
    cardOptions: 'Card options',
    editCard: 'Edit text',
    deleteCard: 'Delete card',
    extraLines: {
      one: '{count} nested line, kept as is (edit it in raw mode):',
      other: '{count} nested lines, kept as is (edit them in raw mode):',
    },
  },
}
