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
  // Section map: past three rows the rest fold into a "+N more" tab.
  moreSections: { one: '+{count} more', other: '+{count} more' },
  showAllSections: 'Show all sections',
  showLessSections: 'Show less',
  showLessSectionsHint: 'Fold the sections back to three rows',

  // Save-as-template modal.
  saveAsTemplate: 'Save as template',
  saveAsTemplateHint: 'Save this note (title + sections) as a reusable template',
  templateName: 'Template name',
  untitledTemplate: 'Untitled template',

  // Metadata line under the title.
  deletesAt: 'Deletes {date}',

  // Mini menu next to "Deletes …" on a temporary note (TempNoteExpiryMenu).
  expiry: {
    options: 'Change when this note is deleted',
    deleteIn: 'Delete in',
    hoursShort: '{count}h',
    deleteInHours: { one: 'Delete in {count} hour from now', other: 'Delete in {count} hours from now' },
    makePermanent: 'Make permanent',
    makePermanentHint: 'Keep this temporary note — it will no longer be deleted automatically',
  },

  // Floating table of contents at the right of the editor (EditorToc).
  toc: {
    label: 'Table of contents',
  },

  // Section delete undo toast.
  sectionDeleted: 'Section "{name}" deleted',
  undo: 'Undo',

  // Encrypted (locked) note view.
  noteEncrypted: 'This note is encrypted',
  clickToUnlock: 'Click to unlock',

  // Section options dropdown.
  menu: {
    // Section modes: markdown = rendered (isRawMode false); text = shown as-is (isRawMode true).
    editorMode: 'Markdown mode',
    rawMode: 'Text mode',
    copySectionText: 'Copy section text',
    showToAiHint: 'The AI will index and use this section again',
    hideFromAiHint: 'The AI will never index, read or reference this section',
    openAsSticky: 'Open as sticky note',
    archiveNote: 'Archive note',
    unarchiveNote: 'Unarchive note',
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
    tableOptions: 'Table options',
    insertKanban: 'Insert kanban board',
    insertDrawing: 'Insert drawing',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    set: 'Set',
  },

  // Table controls (src/components/Editor/TableControls.tsx and TableMenu.tsx):
  // the handles on a table's column / row edges and their menus, the "+" bars,
  // the right-click menu and the toolbar's table menu.
  table: {
    // Menu titles. {name} = the column's header text.
    columnTitle: 'Column · {name}',
    columnN: 'Column {n}',
    rowN: 'Row {n}',
    header: 'Header',
    // Group titles of the right-click / toolbar menu.
    rowGroup: 'Row',
    columnGroup: 'Column',
    // Column menu.
    insertLeft: 'Insert left',
    insertRight: 'Insert right',
    duplicateColumn: 'Duplicate column',
    moveLeft: 'Move left',
    moveRight: 'Move right',
    alignColumn: 'Align column',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    // The column fits its content again (drops the width set by dragging its edge).
    resetWidth: 'Reset width',
    sortAsc: 'Sort A → Z',
    sortDesc: 'Sort Z → A',
    sortNumAsc: 'Sort 1 → 9',
    sortNumDesc: 'Sort 9 → 1',
    clearColumn: 'Clear column',
    deleteColumn: 'Delete column',
    // Row menu.
    insertAbove: 'Insert above',
    insertBelow: 'Insert below',
    duplicateRow: 'Duplicate row',
    moveUp: 'Move up',
    moveDown: 'Move down',
    clearRow: 'Clear row',
    clearHeader: 'Clear header',
    deleteRow: 'Delete row',
    // Right-click / toolbar menu (on one cell).
    insertRowAbove: 'Insert row above',
    insertRowBelow: 'Insert row below',
    insertColumnLeft: 'Insert column left',
    insertColumnRight: 'Insert column right',
    clearCells: { one: 'Clear {count} cell', other: 'Clear {count} cells' },
    deleteTable: 'Delete table',
    // Why an entry is disabled (its tooltip).
    headerFixed: 'The header is fixed',
    onlyHeaderAbove: 'Only the header is above, and it is fixed',
    needsOneColumn: 'A table needs at least one column',
    sortNeedsRows: 'Sorting needs at least two rows below the header',
    widthAlreadyAuto: 'This column already fits its content',
    // Note at the bottom of the header row's menu.
    headerNote: "The header is fixed: in Markdown it's always the first row, so it can't be moved or deleted.",
    // "+" bars on the right / bottom edge.
    addColumn: 'Add column',
    addRow: 'Add row',
    // Handles (aria-label / tooltip). {n} = 1-based column, body row number.
    columnHandle: 'Column {n}: click for options, drag to move',
    rowHandle: 'Row {n}: click for options, drag to move',
    headerHandle: 'Header (fixed): click for options',
    // Resize strip on a column's right edge: tooltip, and aria-label ({n} = 1-based column).
    resizeHint: 'Drag to resize · double-click to fit content',
    resizeColumn: 'Column {n} width: drag to resize, double-click to fit content',
    // Summary pill under the table while 2+ cells are selected (the header row is never summed).
    statsLabel: 'Selection summary',
    statSum: 'Sum',
    statAverage: 'Average',
    statMin: 'Min',
    statMax: 'Max',
    statNumbers: { one: '{count} number', other: '{count} numbers' },
    statCells: { one: '{count} cell', other: '{count} cells' },
    statWithText: '{count} with text',
  },

  // Size picker of the toolbar's table button. Rows always include the header
  // row (a markdown table needs one): 3 × 4 = the header + 2 rows, 4 columns.
  tablePicker: {
    // Visible size of the highlighted grid: rows × columns.
    size: '{rows} × {cols}',
    rowsPlural: {
      one: '{count} row',
      other: '{count} rows',
    },
    colsPlural: {
      one: '{count} column',
      other: '{count} columns',
    },
    // Screen-reader text of the highlighted size; {rows}/{cols} are the phrases above.
    sizeDescription: '{rows} × {cols}, header row included',
    // Muted line under the size.
    hint: 'Rows × columns, header included',
  },

  // In-note find bar (markdown + text mode).
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
    drawing: 'Drawing',
    drawingDescription: 'A canvas to sketch shapes, arrows and text',
    sortChecked: 'Move checked to bottom',
    sortCheckedDescription: 'Put the checked tasks of this list at the end',
    table: 'Table',
    tableDescription: 'A 3 × 3 table with a header row',
    noCommands: 'No commands',
    // Heading over the user's snippets in the menu.
    snippetsHeading: 'Snippets',
    // Description of a snippet entry with no previewable text.
    snippet: 'Snippet',
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
    // Tooltip of the ⋮⋮ handle left of a task's checkbox ({keys} = Alt+↑/↓).
    dragHandle: 'Drag to move ({keys})',
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
      one: '{count} nested line, kept as is (edit it in text mode):',
      other: '{count} nested lines, kept as is (edit them in text mode):',
    },
  },

  // Snippets: the toolbar's split button (insert the default / pick one) and the
  // "Snippets" modal that configures them (SnippetsModal). Date/time variables
  // ({date:FORMAT}…) are syntax, not copy — never translated.
  snippets: {
    title: 'Snippets',
    insertDefault: 'Insert snippet: {name}',
    chooseSnippet: 'Choose a snippet',
    setUp: 'Snippets — set up reusable text to insert',
    configure: 'Configure snippets…',
    menuEmpty: 'No snippets yet',
    defaultBadge: 'default',
    close: 'Close (Escape)',
    autosaved: 'Changes save automatically',
    yourSnippets: 'Your snippets',
    newSnippet: 'New snippet',
    untitled: 'Untitled snippet',
    moveUp: 'Move up',
    moveDown: 'Move down',
    makeDefault: 'Make default (main toolbar click)',
    isDefault: 'Default snippet (main toolbar click)',
    deleteSnippet: 'Delete snippet',
    confirmDelete: 'Delete?',
    confirmDeleteYes: 'Delete',
    confirmDeleteNo: 'Cancel',
    emptyTitle: 'No snippets yet',
    emptyDesc: 'Create one or start from a suggestion. The toolbar button inserts your default snippet at the cursor.',
    name: 'Name',
    content: 'Content',
    contentPlaceholder: 'Markdown text. Use {date} or {time:HH:mm} for the current date and time.',
    dateTime: 'Insert date / time',
    presets: 'Presets',
    customFormat: 'Custom format',
    customPlaceholder: 'e.g. dddd DD-MM-YY',
    result: 'Result',
    insertVariable: 'Insert into snippet',
    tokens: 'Tokens',
    monthHint: 'Month is MM (uppercase) — lowercase mm is minutes.',
    variablesHint: '{date}, {time} and {datetime} expand when the snippet is inserted; add :FORMAT to pick the format, e.g. {date:YYYY-MM-DD}. Text in [brackets] is kept as is.',
    tokenLegend: {
      year: 'year (2026 / 26)',
      monthName: 'month name (full / short)',
      month: 'month number (05 / 5)',
      day: 'day of the month (07 / 7)',
      weekday: 'weekday name (full / short)',
      hours24: 'hours 00–23',
      hours12: 'hours 01–12',
      minutes: 'minutes',
      seconds: 'seconds',
      ampm: 'AM / PM',
      literal: 'literal text',
    },
    preview: 'Preview',
    previewEmpty: 'Nothing to preview yet',
    selectHint: 'Select a snippet to edit it',
    suggestions: 'Suggestions',
    suggestionsHint: 'Add one as an editable snippet.',
    addSuggestion: 'Add',
    suggestionNames: {
      today: "Today's date",
      dateTime: 'Date and time',
      journal: 'Journal entry',
      meeting: 'Meeting',
      timeDivider: 'Divider with time',
      signature: 'Signature',
    },
    // Localized text inside the suggested snippets' content.
    suggestionText: {
      meetingTitle: 'Meeting',
      attendees: 'Attendees',
      notes: 'Notes',
      actions: 'Action items',
      signature: 'Your name',
    },
  },
}
