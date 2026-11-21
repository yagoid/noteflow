// English copy for the /features docs page (source of truth for the shape:
// `FeaturesContent = typeof featuresEn`, see features.es.ts). Strings with inline
// HTML are rendered with `set:html` in FeaturesPage.astro. Every behaviour and
// shortcut documented here comes from the product itself (source of truth for
// shortcuts: src/components/Settings/ShortcutsPanel.tsx; themes: src/lib/themes.ts).

export const featuresEn = {
  meta: {
    title: 'NoteFlow features — sticky notes, templates, encryption & more',
    description:
      'The details that make NoteFlow feel different: groups, folders and sections, note templates, always-on-top sticky notes that fold into pills, section-to-section links, snippets with live dates, checklist tasks you hand to AI agents, AES-256 encrypted notes, per-section AI privacy, 14 themes and a full keyboard map.',
  },

  hero: {
    kicker: 'NoteFlow · Features',
    h1: 'Every<br />detail.',
    tagline: 'The small decisions that make a notes app feel effortless.',
  },

  toc: [
    { id: 'organize', label: 'Organize' },
    { id: 'templates', label: 'Templates' },
    { id: 'sticky', label: 'Sticky notes' },
    { id: 'links', label: 'Section links' },
    { id: 'snippets', label: 'Snippets' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'views', label: 'Views' },
    { id: 'temp', label: 'Temporary notes' },
    { id: 'history', label: 'Version history' },
    { id: 'agent-tasks', label: 'Agent tasks' },
    { id: 'encryption', label: 'Encryption' },
    { id: 'ai-hidden', label: 'Hide from AI' },
    { id: 'personalize', label: 'Personalize' },
  ],

  // Labels of the pause/play button on every clip (FeatureClip.astro).
  clip: { play: 'Play clip', pause: 'Pause clip' },

  organize: {
    title: 'Groups, folders, notes — and sections',
    lede: 'A shallow tree outside, a map of sections inside: <strong>one note, one topic — sections are its facets</strong>, each one <a href="%AI_URL%">indexed on its own</a>.',
    clipLabel:
      'Screen recording: resting the mouse on a note in the sidebar unfolds its folded line into the section map, hovering a section shows its preview card and a click opens it in the editor; then Settings → Appearance → Sections in the sidebar switches between folded map and scroll row.',
    clipCaption: 'hover · preview · open',
    facts: [
      { title: 'Colored groups', desc: 'Groups → folders → notes, one level deep. The group\'s color tints everything inside.' },
      { title: 'Section map', desc: '<kbd>Ctrl</kbd>+<kbd>T</kbd> adds, double-click renames, drag reorders, <kbd>Ctrl</kbd>+<kbd>Tab</kbd> cycles.' },
      { title: 'Folded sidebar', desc: 'A line per note, a stretch per section. Hover to unfold and preview.' },
      { title: 'Icons & peeks', desc: '27 folder icons (right-click → Change icon). Hover a collapsed group to search its notes.' },
    ],
    tree: {
      aria: 'The NoteFlow hierarchy: colour-coded groups containing folders and notes, each note with its sections drawn as a folded map',
      caption: 'group → folder → note → sections',
      groups: [
        {
          name: 'Work',
          folders: [
            {
              name: 'Backend',
              notes: [
                { title: 'API redesign', sections: ['Notes', 'Tasks'] },
                { title: 'Deploy plan', sections: ['Checklist'] },
              ],
            },
          ],
          notes: [{ title: 'Meeting log', sections: ['Today', 'Questions'] }],
        },
        {
          name: 'Personal',
          folders: [],
          notes: [{ title: 'Trip ideas', sections: ['Places', 'Budget'] }],
        },
      ],
      ungroupedLabel: 'No group',
      ungroupedNotes: [{ title: 'Scratchpad', sections: ['Ideas'] }],
    },
  },

  templates: {
    title: 'Note templates',
    lede: 'The note you keep re-creating — a weekly review, a meeting, a bug report — becomes a <strong>template</strong>: its title plus its sections.',
    // Two-step flow drawn as cards: a mono tag, the UI path as chips, one line.
    flowAria: 'How templates work: save one from the note menu, then create new notes from it in Settings',
    steps: [
      {
        tag: '01 · save',
        path: ['⋯', 'Save as template'],
        desc: 'Captures the open note\'s title and sections.',
      },
      {
        tag: '02 · reuse',
        path: ['Settings', 'Templates', 'New note'],
        desc: 'A fresh copy, ready to fill. Rename or delete them there too.',
      },
    ],
    syncP: 'Stored in <code>templates.json</code> in your notes directory — synced like the rest of your metadata.',
  },

  sticky: {
    title: 'Sticky notes that float above everything',
    lede: 'Any section pops out as a small frameless window that stays <strong>always on top</strong>: <kbd>Ctrl</kbd>+<kbd>S</kbd> for the current section, <kbd>Ctrl</kbd>+<kbd>G</kbd> for all of them. Try the demo one.',
    clipLabel:
      'Screen recording: Ctrl+S pops the open section out of the main window as a floating sticky note; a task typed in the sticky appears in the main window at the same time.',
    clipCaption: 'ctrl+s · same section, two windows',
    mock: {
      winTitle: 'Release checklist',
      items: [
        { done: true, text: 'Tag v2.0.0' },
        { done: true, text: 'Update changelog' },
        { done: false, text: 'Smoke-test installers' },
        { done: false, text: 'Publish release notes' },
      ],
      caption: 'tick · fold to pill',
      switchHint: 'Switch section',
      foldAria: 'Fold the sticky note into a pill',
      closeAria: 'Close (decorative in this demo)',
    },
    facts: [
      { title: 'Fold to a pill', desc: 'The ─ button folds it; open as many as you want.' },
      { title: 'Live, not a copy', desc: 'Edits show up in the main window in real time.' },
      { title: 'Switch sections', desc: 'The section name in the title bar opens a dropdown with the rest.' },
      { title: 'At startup', desc: '<strong>Settings → Startup</strong> opens chosen sections as stickies when you log in.' },
    ],
  },

  links: {
    title: 'Link sections to sections',
    lede: 'Type <kbd>/</kbd> → <strong>Link section</strong>, pick any section of any note, and a live <strong>pill</strong> lands in your text.',
    clipLabel:
      'Screen recording: typing / and choosing Link section, searching for a section and inserting it as a pill; then Ctrl+P opens the command palette and jumps to another note.',
    clipCaption: '/ link section · ctrl+p',
    mock: {
      before: 'Ship the beta — open items in ',
      pill: 'Launch checklist',
      after: '.',
      brokenLabel: 'target deleted',
      brokenPill: 'Old roadmap',
      rawLabel: 'text mode',
      raw: '[Launch checklist](noteflow://k3v9pQ/aB3dE9)',
    },
    facts: [
      { title: 'Click · hover', desc: 'Click jumps to the section; hover shows its preview.' },
      { title: 'Always live', desc: 'Rename the target and every pill follows; delete it and the pill breaks.' },
      { title: 'No AI needed', desc: 'Plain markdown links, drawn as edges in the brain view even with AI off.' },
    ],
    kanban: {
      title: 'A kanban board, inside the note',
      desc: 'The same <kbd>/</kbd> menu: <kbd>/kanban</kbd> drops a board of draggable cards — saved as plain markdown.',
      clipLabel: 'Screen recording: /kanban inserts a board into the note, a card is added and dragged to the Done column.',
      clipCaption: '/kanban',
    },
  },

  snippets: {
    title: 'Snippets, with the date filled in',
    lede: 'Reusable markdown that drops in at the cursor with one click, stamped with the date and time you insert it.',
    clipLabel:
      'Screen recording: the stamp button in the toolbar inserts the default snippet — today\'s date as a heading — at the cursor; its arrow then lists every snippet with a preview and “Configure snippets…”.',
    clipCaption: 'stamp · default · list',
    mock: {
      sourceLabel: 'snippet',
      source: '## {date:dddd, D MMMM YYYY} · {time}',
      outputLabel: 'inserted',
      output: 'Sunday, 8 November 2026 · 09:30',
    },
    facts: [
      { title: 'Split button', desc: 'The stamp inserts your default; its chevron lists the rest.' },
      { title: 'In the / menu', desc: 'Type part of a name, or <kbd>/snippet</kbd> to list them all.' },
      { title: 'Live variables', desc: '<code>{date}</code>, <code>{time}</code> or your own format, like <code>{date:dddd, D MMMM}</code>.' },
      { title: 'Synced', desc: 'Stored in <code>snippets.json</code>, through GitHub or NoteFlow Cloud.' },
    ],
  },

  shortcuts: {
    title: 'The full keyboard map',
    lede: 'Also inside the app, in <strong>Settings → Keyboard shortcuts</strong>.',
    macNote:
      'On macOS <kbd>Ctrl</kbd> is <strong>⌘</strong> — except <kbd>Ctrl</kbd>+<kbd>Tab</kbd> between sections, which stays <strong>⌃ Control</strong>, and <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> (back / forward), which is <kbd>⌘</kbd>+<kbd>[</kbd>/<kbd>]</kbd>.',
    groups: [
      {
        label: 'App',
        rows: [
          { combos: [['Ctrl', 'Shift', 'Space']], desc: 'Show / hide NoteFlow, from any app' },
          { combos: [['Ctrl', 'N']], desc: 'New note' },
          { combos: [['Ctrl', 'Shift', 'N']], desc: 'New temporary note (24 h)' },
          { combos: [['Ctrl', 'P']], desc: 'Command palette' },
          { combos: [['Ctrl', 'Shift', 'F']], desc: 'Search all notes' },
          { combos: [['Ctrl', "'"]], desc: 'Pin / unpin the sidebar' },
          { combos: [['Ctrl', 'Click']], desc: 'Open a note in split view' },
          { combos: [['Alt', '←'], ['Alt', '→']], desc: 'Back / forward between notes and views (also the mouse side buttons)' },
        ],
      },
      {
        label: 'Sections',
        rows: [
          { combos: [['Ctrl', 'T']], desc: 'New section' },
          { combos: [['Ctrl', 'W']], desc: 'Delete the current section' },
          { combos: [['Ctrl', 'Tab']], desc: 'Next section' },
          { combos: [['Ctrl', 'Shift', 'Tab']], desc: 'Previous section' },
          { combos: [['Delete']], desc: 'Delete the selected note (outside the editor)' },
        ],
      },
      {
        label: 'Sticky notes',
        rows: [
          { combos: [['Ctrl', 'S']], desc: 'Current section as a sticky' },
          { combos: [['Ctrl', 'G']], desc: 'Every section as stickies' },
        ],
      },
      {
        label: 'Editor',
        rows: [
          { combos: [['Ctrl', 'Z'], ['Ctrl', 'Y']], desc: 'Undo / redo' },
          { combos: [['Ctrl', 'B'], ['Ctrl', 'I'], ['Ctrl', 'U']], desc: 'Bold / italic / underline' },
          { combos: [['Ctrl', 'E']], desc: 'Inline code' },
          { combos: [['Ctrl', 'Shift', 'B']], desc: 'Code block' },
          { combos: [['Ctrl', 'F']], desc: 'Find in note' },
          { combos: [['Ctrl', 'M']], desc: 'Text / markdown mode' },
          { combos: [['Ctrl', '+'], ['Ctrl', '−'], ['Ctrl', '0']], desc: 'Font size: bigger / smaller / reset' },
        ],
      },
    ],
  },

  views: {
    title: 'Three ways to see everything',
    lede: 'Three <strong>full-area views</strong> take the editor\'s place while the sidebar stays as context. Pick any note to go back.',
    cards: [
      {
        tag: '01 / note overview',
        name: 'One note, all its sections',
        desc: 'Every section as a cell with its real content. Drag, rename, batch-edit.',
      },
      {
        tag: '02 / content view',
        name: 'Everything, or one group, by date',
        desc: 'Places, notes in date blocks and a read-only preview, in three columns.',
      },
      {
        tag: '03 / brain view',
        name: 'The graph',
        desc: 'The AI panel on the left, the neural graph of your notes on the right.',
      },
    ],
    brainClip: {
      label: 'Screen recording: the brain view opens with the AI panel on the left and the 3D graph of notes on the right; the graph is orbited and a note node is clicked to preview it.',
      caption: '03 · brain view',
    },
    sidebarClip: {
      label: 'Screen recording: Ctrl+\' unpins the sidebar into a thin minimap; bringing the mouse to the left edge slides the full sidebar in over the content, and resting on a collapsed group peeks at its notes.',
      caption: 'ctrl+\' · floating sidebar',
    },
    sidebarNote: '<strong>Floating sidebar:</strong> <kbd>Ctrl</kbd>+<kbd>\'</kbd> folds it into a minimap; bring the mouse to the edge and it slides in.',
  },

  temp: {
    title: 'Notes that clean up after themselves',
    lede: 'For the phone number you only need today: <strong>temporary notes</strong> delete themselves after 24 hours.',
    clipLabel:
      'Screen recording: Ctrl+Shift+N creates a temporary note with “Deletes …” in its header and a line is typed; the chevron next to it opens the “Delete in” menu (1h to 48h, or Make permanent) and moves the deletion to 8 hours from now.',
    clipCaption: 'ctrl+shift+n · deletes in 24 h',
    facts: [
      { title: 'One shortcut', desc: '<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>, or the clock button under new group.' },
      { title: 'Gone everywhere', desc: 'Deleted from the sync remote too, so they never come back.' },
      { title: 'Change your mind', desc: 'The chevron by <em>Deletes …</em> sets 1–48 h, or makes it permanent.' },
    ],
  },

  history: {
    title: 'Version history of every section',
    lede: 'Overwrote a list, emptied a section, cut the wrong paragraph? With NoteFlow Cloud each section keeps <strong>30 days of earlier versions</strong>, and you get them back without leaving the app.',
    // Three-step flow drawn as cards (same pieces as `templates`).
    flowAria: 'How version history works: open it from a section, compare a version with the current text, restore it',
    steps: [
      {
        tag: '01 · open',
        path: ['⋯', 'Version history'],
        desc: 'Also in the right-click menu of a section tab.',
      },
      {
        tag: '02 · compare',
        path: ['Changes · Preview'],
        desc: 'A timeline by day; see what changed against the current text, or the version as it was.',
      },
      {
        tag: '03 · restore',
        path: ['Restore this version'],
        desc: 'Your current text is saved to the history first, and <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes it. Or restore it as a new section.',
      },
    ],
    note: 'A <a href="%PRICING_URL%">NoteFlow Cloud</a> feature: versions are saved on the server, encrypted like your notes, whichever device you edit from. Also in the <a href="%CLI_URL%">CLI</a> with <code>noteflow history</code>.',
  },

  agentTasks: {
    title: 'Hand a task to an AI agent',
    lede: 'Any task in a checklist can go to an <strong>external AI agent</strong> — Claude Code, Codex and the like — and the note shows how it is going: its state on the task while the agent works, its report when it is done.',
    // Three-step flow drawn as cards (same pieces as `templates` / `history`).
    flowAria: 'How agent tasks work: turn them on in Settings, send the queued tasks to an agent, follow each task from its state',
    steps: [
      {
        tag: '01 · turn on',
        path: ['Settings', 'AI', 'Agent tasks'],
        desc: 'Off by default. Then a robot icon shows when you hover a task: one click queues it, another takes it back.',
      },
      {
        tag: '02 · send',
        path: ['Run'],
        desc: 'Opens your agent in the note’s project folder with the queued tasks. <strong>Copy prompt</strong>, right next to it, does the same for an agent on any machine: paste it there.',
      },
      {
        tag: '03 · follow',
        path: ['Queued', 'Running', 'Done'],
        desc: 'The state changes by itself: the task’s own box runs while the agent works and gets a spark when it is done; any other state is a small label. Click it for the report: a timeline of what the agent did, its question if it needs you, and what it wrote at the end.',
      },
    ],
    // Static mock: a checklist with each task's agent state and the bar next to the note title.
    // `bar` = the counts' tooltips (the bar shows a glyph and a number per state).
    mock: {
      aria: 'A checklist in NoteFlow where each task shows its agent state — done and running in the task’s own box, needs you and queued as a label — and a bar next to the note title counts them and offers Run and Copy prompt',
      title: 'Release 2.4',
      bar: [
        { state: 'running', count: 1, label: '1 running' },
        { state: 'waiting', count: 1, label: '1 needs you' },
        { state: 'queued', count: 1, label: '1 queued' },
      ],
      run: 'Run',
      copy: 'Copy prompt',
      tasks: [
        { text: 'Fix the login redirect', state: 'done', label: 'Done' },
        { text: 'Add tests for the importer', state: 'running', label: 'Running' },
        { text: 'Migrate the settings schema', state: 'waiting', label: 'Needs you' },
        { text: 'Update the changelog', state: 'queued', label: 'Queued' },
      ],
      caption: 'one state per task · live',
    },
    facts: [
      { title: 'A bar by the title', desc: 'Counts what is queued, running or waiting for you in the section, with Run and Copy prompt. Several tasks go one after another, or <strong>in parallel</strong> with one subagent each.' },
      { title: 'Select and send', desc: 'Select text: the tasks it touches are queued, the rest travels as context.' },
      { title: 'Run with', desc: 'A terminal — Claude Code, Codex, Gemini CLI, OpenCode or your own command — or a desktop app (Claude Desktop, Codex, your own link), where you press Enter on the prompt. In a terminal, Claude Code, Codex and Gemini CLI can start with the <strong>model</strong> you choose — for Claude Code, the newest of a family or a fixed version — and Claude Code with the <strong>effort</strong> you choose.' },
      { title: 'When finished', desc: 'The agent checks the task off, or leaves it <strong>To review</strong> for you. You choose in Settings.' },
      { title: 'No signal', desc: 'A running task that goes quiet for too long says so, instead of looking busy forever.' },
      { title: 'The report', desc: 'What the agent wrote, plus machine, duration, branch, commits and files changed. For an agent working in <strong>Claude Desktop</strong> on this computer, <strong>Open in Claude</strong> takes you to its conversation — to answer it, or to read it again.' },
    ],
    note: 'Good to know: it doesn’t work in <strong>encrypted notes</strong> (an agent couldn’t read them) or in linked files. The <strong>Microsoft Store</strong> version can’t open a terminal: there, Run works with a desktop app, and Copy prompt always does. On <strong>Windows</strong>, running an agent in a terminal needs <strong>Node.js 18 or later</strong> installed; a desktop app doesn’t. A <strong>custom command or link</strong> asks you to confirm it the first time, and again whenever it changes. The agent reports through the <a href="%CLI_URL%">noteflow CLI</a> (2.18 or later), so an agent on <strong>another machine</strong> needs it there, with sync on.',
  },

  encryption: {
    title: 'Encrypted notes',
    lede: 'Lock a note with its own password from its right-click menu. Locked, it shows no content anywhere in the app.',
    // Interactive mock: a note whose text turns into ciphertext when locked.
    mock: {
      title: 'Passwords',
      lines: ['Wi-Fi · harbor-lights-42', 'Router admin · 8Kq!e2', 'Door code · 4719'],
      lockedLabel: 'AES-256-GCM',
      lockAria: 'Lock the demo note',
      unlockAria: 'Unlock the demo note',
    },
    facts: [
      { title: 'AES-256-GCM', desc: 'Key derived with PBKDF2: 310,000 iterations of SHA-256.' },
      { title: 'No backdoor', desc: 'No master key, no recovery: lose the password, lose the note.' },
      { title: 'Out of reach', desc: 'The <a href="%CLI_URL%">CLI</a> and the <a href="%AI_URL%">AI index</a> never read them.' },
    ],
  },

  aiHidden: {
    title: 'Sections the AI never sees',
    lede: '<strong>Hide from AI</strong> is a per-section switch, in the editor\'s <code>⋯</code> menu or a section\'s right-click menu.',
    // Mock: three section cells feeding the AI; the hidden one is cut off.
    mock: {
      aria: 'Three sections of a note feed the AI index; the one hidden from the AI is cut off before it',
      sections: ['Roadmap', 'Salary', 'Ideas'],
      hiddenIndex: 1,
      target: 'index · chat · graph · tools',
    },
    facts: [
      { title: 'Out of every AI surface', desc: 'Index, chat context, Related notes, brain graph and the agent\'s tools.' },
      { title: 'Only for the AI', desc: 'An EyeOff icon marks it; the rest of the app treats it normally.' },
      { title: 'One boundary', desc: 'Enforced in the main process — see <a href="%AI_URL%">How the AI works → privacy</a>.' },
    ],
  },

  personalize: {
    title: 'Make it yours',
    lede: '<strong>14 hand-tuned themes</strong> — 11 dark, 3 light — each with its own UI font. The default, <strong>NoteFlow Dark</strong>, is the warm near-black + amber of this site.',
    clipLabel:
      'Screen recording: in Settings → Appearance, clicking the theme cards switches the whole app live — NoteFlow Dark, Midnight Blue, Arctic Day, NoteFlow Light.',
    clipCaption: 'settings → appearance · live',
    darkLabel: 'Dark · 11',
    lightLabel: 'Light · 3',
    facts: [
      { title: 'Fine-tune', desc: 'Font, accent, editor colors and UI scale in <strong>Settings → Appearance</strong>.' },
      { title: 'Readable width', desc: 'A centered ~72-character column; only tables and images break out.' },
      { title: 'Table of contents', desc: 'Dashes at the editor\'s right edge unfold into its H1–H3 headings.' },
    ],
  },
};

export type FeaturesContent = typeof featuresEn;
