// "What's new" tour (src/components/WhatsNew/) + Settings → Tutorial. English is the
// source of truth; es/whatsNew.ts mirrors it key-for-key.
//
// Slide bodies name shortcuts through `{placeholders}` that match the `keys` ids of
// each slide in whatsNewSlides.ts: the component fills them with the platform's
// labels (Ctrl on Windows/Linux, ⌘ / ⌃ on macOS), so never write a literal "Ctrl+…".
export const whatsNew = {
  // Modal header: first run vs. after an update.
  titleDiscover: 'Discover NoteFlow',
  titleNew: 'New in NoteFlow v{version}',
  titleNewNoVersion: 'New in NoteFlow',
  dialogLabel: "What's new in NoteFlow",
  // "3 / 9"
  counter: '{current} / {total}',
  back: 'Back',
  next: 'Next',
  skip: 'Skip',
  startWriting: 'Start writing',
  close: 'Close the tour',
  progressLabel: 'Tour slides',
  goToSlide: 'Go to slide {n}: {title}',
  keysLabel: 'Shortcuts',
  keyboardHint: '← → to move · Esc to close',

  slides: {
    sections: {
      title: 'Notes that grow sideways',
      body: 'Every note holds tabbed sections: one project, many pages. {newSection} adds one, {nextSection} jumps between them.',
    },
    kanban: {
      title: 'A kanban board, right in your note',
      body: "Type /kanban and drag cards between columns. Underneath it's plain markdown, so it syncs everywhere.",
    },
    'links-palette': {
      title: 'Link anything, jump anywhere',
      body: 'Type / → Link section to connect ideas across notes. {palette} opens the command palette to reach any note or action.',
    },
    'quick-capture': {
      title: 'Capture in a second',
      body: '{showApp} brings NoteFlow up from anywhere. Need a scratchpad? {tempNote} creates a temporary note that deletes itself after 24 h.',
    },
    windows: {
      title: 'Sticky notes and floating windows',
      body: 'Pin a section on top of everything with {sticky}, or pop it out into its own window to work side by side.',
    },
    brain: {
      title: 'Meet the Brain',
      body: 'Every note is a node; every link and related idea, a connection. Explore your knowledge as a living graph, computed on your device.',
    },
    ai: {
      title: 'AI that knows your notes',
      body: 'Chat with your notes, let the agent organize them and grow your second brain. Bring your own API key or use NoteFlow AI.',
    },
    agents: {
      title: 'Your AI agents take notes too',
      body: 'Claude Code, Codex or any script can read and write your notes through the noteflow CLI. Just ask in plain words: the changes show up live in the app.',
    },
    sync: {
      title: 'Your notes, on every device',
      body: 'Sync privately to your own GitHub repo, or turn on NoteFlow Cloud with optional end-to-end encryption.',
    },
    'section-map': {
      title: 'Every section at a glance',
      body: 'Under each note in the sidebar, a thin line maps its sections: rest the mouse on it to unfold them, click one to jump straight there. Prefer the always-visible row? Switch it in Settings → Appearance → Sections in the sidebar.',
    },
    'floating-sidebar': {
      title: 'A sidebar that gets out of the way',
      body: '{toggle} folds the sidebar into a slim minimap: bring the mouse to the left edge and it slides back in. Rest it on a collapsed group to peek at its notes without opening it.',
    },
    snippets: {
      title: 'Snippets, one click away',
      body: "The stamp button in the toolbar drops your default snippet at the cursor, today's date included. Its arrow lists the rest and lets you build your own.",
    },
    more: {
      title: 'And much more',
      body: 'Small things that make a big difference. You will run into them as you go.',
    },
  },

  // Chips of the "And much more" slide. `{split}` = the Ctrl/⌘+Click label.
  extras: {
    encrypted: 'Encrypted notes',
    templates: 'Templates',
    themes: 'Themes & accents',
    alarms: 'Tasks with alarms',
    split: 'Split view ({split})',
    cli: 'CLI for your terminal & agents',
    import: 'Import from Notion & Keep',
  },

  // Settings → Tutorial.
  settings: {
    playTour: 'Play full tour',
    playTourHint: 'A quick, visual walk through what NoteFlow can do.',
    slidesTitle: 'Slides',
    newBadge: 'New',
    openSlide: 'Open "{title}"',
    sinceVersion: 'v{version}',
  },
}
