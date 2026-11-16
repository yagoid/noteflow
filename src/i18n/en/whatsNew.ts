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
      body: 'Every note holds tabbed sections: one project, many pages. Click + in the tab bar (or {newSection}) to add one, name it and start writing; {nextSection} jumps between them.',
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
      body: 'Need a scratchpad? The timer button in the sidebar ({tempNote}) opens a temporary note: jot it down and it deletes itself after 24 h. Change when from its date, or make it permanent. And {showApp} brings NoteFlow up from anywhere.',
    },
    windows: {
      title: 'Sticky notes and floating windows',
      body: 'Pin a section on top of everything with {sticky}, or pop it out into its own window to work side by side.',
    },
    brain: {
      title: 'Meet the Brain',
      body: 'Every note is a node and every link a connection, computed on your device. In its AI panel, pick a provider (your API key, a local model or NoteFlow AI) and ask: the notes it uses light up.',
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
      body: 'Under each note in the sidebar, a thin line maps its sections: rest the mouse on it to unfold them, click one to jump straight there. Prefer the always-visible row? Switch it from the ⋯ menu at the bottom of the sidebar → Sections.',
    },
    snippets: {
      title: 'Snippets, one click away',
      body: "The stamp button in the toolbar drops your default snippet at the cursor, today's date included. Its arrow lists the rest and lets you build your own.",
    },
    'linked-files': {
      title: 'Edit any text file in place',
      body: "Link a Markdown or text file (a project's README, a .txt, a config) by right-clicking the big + or dropping it on the window, or open it from your system (\"Open with\" → NoteFlow). You edit the original: changes land in its project and Git history, and edits made elsewhere show up here. Linked files stay local.",
    },
    'checked-tasks': {
      title: 'Done tasks drop to the bottom',
      body: 'Settings → Editor gathers how you write: font size, typeface, reading width and the table of contents. Turn on "Move checked items to the bottom" and ticking a task slides it to the end of its list; untick it and it comes back above the done ones.',
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

  // What each chip of `extras` unfolds when clicked: what it does and where to find
  // it, in one or two short sentences. Same `{split}` placeholder as above.
  extrasInfo: {
    encrypted: "Open a note's ⋯ menu → Encrypt note and choose a password. Right-click it in the sidebar to unlock it or lock it again.",
    templates: "Turn any note into a template from its ⋯ menu → Save as template. Start new notes from it in Settings → Templates.",
    themes: 'Pick one of 14 light and dark themes in Settings → Appearance, and fine-tune the accent colour, font and editor colours there.',
    alarms: "Hover a task and click its calendar icon to set a deadline and an alarm time. You'll get a system notification right on time.",
    split: '{split} a note in the sidebar (or right-click it → Open alongside) to open it next to the current one.',
    cli: 'The noteflow command that ships with the app reads and writes your notes from any terminal. AI agents such as Claude Code or Codex get its skill too (Settings → General → Expose CLI skill to AI agents).',
    import: 'Go to Settings → Data → Import notes and choose Notion or Google Keep: it shows you how to export your notes from there.',
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
