// English copy for the /features docs page (source of truth for the shape:
// `FeaturesContent = typeof featuresEn`, see features.es.ts). Strings with inline
// HTML are rendered with `set:html` in FeaturesPage.astro. Every behaviour and
// shortcut documented here comes from the product itself (source of truth for
// shortcuts: src/components/Settings/ShortcutsPanel.tsx; themes: src/lib/themes.ts).

export const featuresEn = {
  meta: {
    title: 'NoteFlow features — sticky notes, templates, encryption & more',
    description:
      'The details that make NoteFlow feel different: groups, folders and sections, note templates, always-on-top sticky notes that fold into pills, section-to-section links, AES-256 encrypted notes, per-section AI privacy, 14 themes and a full keyboard map.',
  },

  hero: {
    kicker: 'NoteFlow · Features',
    h1: 'Every<br />detail.',
    tagline:
      'The small decisions that make a notes app feel effortless — organization, stickies, links, privacy and themes, all documented.',
  },

  toc: [
    { id: 'organize', label: 'Organize' },
    { id: 'templates', label: 'Templates' },
    { id: 'sticky', label: 'Sticky notes' },
    { id: 'links', label: 'Section links' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'views', label: 'Views' },
    { id: 'temp', label: 'Temporary notes' },
    { id: 'encryption', label: 'Encryption' },
    { id: 'ai-hidden', label: 'Hide from AI' },
    { id: 'personalize', label: 'Personalize' },
  ],

  organize: {
    title: 'Groups, folders, notes — and sections',
    intro: [
      'NoteFlow keeps the hierarchy deliberately shallow: <strong>groups</strong> hold <strong>folders</strong>, folders hold <strong>notes</strong> — one level of nesting, no infinite trees to get lost in. Each group has its own <strong>color</strong>, and that color tints everything inside it: the dots next to its notes, its folders, its region in the brain view. Notes without a group simply live at the bottom of the sidebar.',
    ],
    tree: {
      aria: 'The NoteFlow hierarchy: colour-coded groups containing folders, notes and their section tags',
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
    sectionsH3: 'Sections: tabs inside a note',
    sectionsP: [
      'The fourth level lives <em>inside</em> the note: every note can hold multiple independent <strong>sections</strong>, shown as tabs across the top of the editor. Create one with <kbd>Ctrl</kbd>+<kbd>T</kbd> (or the <code>+</code> button), <strong>rename</strong> with a double-click on the tab, <strong>reorder</strong> by dragging the tabs, and cycle through them with <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd>.',
    ],
    whyP:
      'Sections are what keep the hierarchy shallow without turning notes into junk drawers: <strong>one note = one topic, sections = its facets</strong>. A project note carries its own <em>Notes</em>, <em>Tasks</em> and <em>Questions</em> instead of spawning three sibling notes. And the granularity pays off everywhere else — sections show up as clickable tags on every note card, the <a href="%AI_URL%">semantic index embeds each section separately</a>, and <a href="#links">links</a> point at sections, not whole notes.',
  },

  templates: {
    title: 'Note templates',
    intro: [
      'Any note whose structure you keep re-creating — a weekly review, a meeting note, a bug report — can become a <strong>template</strong>: its title plus its set of sections, ready to stamp out again.',
    ],
    steps: [
      {
        title: 'Save one',
        desc: 'Open the <code>⋯</code> menu in the editor toolbar → <strong>Save as template</strong>. It captures the current note\'s title and sections; a small modal asks for the template\'s name.',
      },
      {
        title: 'Use and manage them',
        desc: '<strong>Settings → Templates</strong> lists everything you saved. <strong>New note</strong> creates a fresh note from the template (with brand-new section ids) and jumps straight into it; templates can also be <strong>renamed</strong> (double-click or the ✎ button) and <strong>deleted</strong> (with confirmation).',
      },
    ],
    syncP:
      'Templates live in <code>templates.json</code> inside your notes directory — so with GitHub sync on, they follow you to every machine, like the rest of your metadata.',
  },

  sticky: {
    title: 'Sticky notes that float above everything',
    intro: [
      'Any section can pop out of the main window as a <strong>sticky note</strong>: a small frameless window that stays <strong>always on top</strong> of whatever you\'re doing — the checklist next to your terminal, the reference next to your browser. Try the one below: tick the boxes, then press the <strong>─</strong> button to fold it.',
    ],
    mock: {
      winTitle: 'Release checklist',
      items: [
        { done: true, text: 'Tag v2.0.0' },
        { done: true, text: 'Update changelog' },
        { done: false, text: 'Smoke-test installers' },
        { done: false, text: 'Publish release notes' },
      ],
      caption: 'Ctrl+S · always on top · fold to pill',
      foldAria: 'Fold the sticky note into a pill',
      closeAria: 'Close (decorative in this demo)',
    },
    bullets: [
      '<kbd>Ctrl</kbd>+<kbd>S</kbd> opens the <strong>current section</strong> as a sticky; <kbd>Ctrl</kbd>+<kbd>G</kbd> opens <strong>every section</strong> of the note at once. There\'s also a <code>⧉</code> button in the editor toolbar.',
      'Stickies start at <strong>300 × 300 px</strong> and are freely resizable (minimum 200 × 200).',
      'Each sticky is a full editor: <strong>WYSIWYG or raw markdown</strong>, same as the main window.',
      'Edits sync with the main window <strong>in real time</strong> — it\'s the same section, not a copy.',
      'Open <strong>as many as you want</strong>; folded stickies stack as pills in the corner of your screen.',
    ],
    startupH3: 'Stickies at startup',
    startupP:
      'In <strong>Settings → Startup</strong>, “Open as sticky at startup” lets you pick sections that appear as stickies the moment you log in — your day starts with the checklist already floating there. It requires “Launch on system startup” to be enabled, and encrypted notes are excluded from the picker.',
  },

  links: {
    title: 'Link sections to sections',
    intro: [
      'While writing in the rich editor, type <kbd>/</kbd> and pick <strong>Link section</strong>: a search box lists every section of every note (filter by section name or note title). Choose one and a <strong>pill</strong> — a small chip with a link icon and the section\'s name — drops into your text right where you were typing.',
    ],
    mock: {
      before: 'Ship the beta — the open items are in ',
      pill: 'Launch checklist',
      after: ' before Friday.',
      brokenLabel: 'If the target section is deleted, the pill turns broken:',
      brokenPill: 'Old roadmap',
      rawLabel: 'the same link in raw markdown',
      raw: '[Launch checklist](noteflow://k3v9pQ/aB3dE9)',
    },
    bullets: [
      '<strong>Click</strong> a pill to jump to the target section — in the same note or any other. <strong>Hover</strong> shows the same floating preview used across the app.',
      'The pill shows the target\'s name <strong>live</strong>: rename the section and every pill pointing at it updates. Delete the target and the pill switches to a <strong>broken</strong> state (dimmed, struck through, no navigation).',
      'The search excludes encrypted, archived and temporary notes; the <kbd>/</kbd> command exists in rich mode only.',
      'The same <kbd>/</kbd> menu inserts a <strong>kanban board</strong> (<kbd>/kanban</kbd>): columns and cards you drag around, with the task chips (📅 deadline, ⏰ alarm, 🔺 importance), right inside the note — and saved as plain markdown, like everything else.',
    ],
    rawP:
      'Under the hood a pill is nothing exotic — it\'s a plain markdown link, <code>[Name](noteflow://noteId/sectionId)</code>, stored inside the section\'s text. That\'s exactly what you see in raw mode, and it\'s why links <strong>survive sync, export and import</strong> unchanged.',
    brainP:
      'These links also appear as <strong>edges in the brain view</strong>, connecting the two sections — and since they\'re your own explicit structure, they work even with the AI and embeddings <strong>completely disabled</strong>.',
  },

  shortcuts: {
    title: 'The full keyboard map',
    intro: [
      'Everything below is also listed inside the app under <strong>Settings → Keyboard shortcuts</strong>.',
    ],
    macNote:
      'On macOS, <kbd>Ctrl</kbd> means <strong>⌘ Cmd</strong> — except section navigation (<kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd>), which uses the literal <strong>⌃ Control</strong> because ⌘Tab is the system app switcher.',
    colShortcut: 'Shortcut',
    colAction: 'Action',
    groups: [
      {
        label: 'App',
        rows: [
          { combos: [['Ctrl', 'Shift', 'Space']], desc: 'Show / hide NoteFlow (system-wide, works from any app)' },
          { combos: [['Ctrl', 'N']], desc: 'New note' },
          { combos: [['Ctrl', 'Shift', 'N']], desc: 'New temporary note (self-deletes in 24 h)' },
          { combos: [['Ctrl', 'P']], desc: 'Command palette' },
          { combos: [['Ctrl', 'Shift', 'F']], desc: 'Search across all notes (sidebar)' },
          { combos: [['Ctrl', "'"]], desc: 'Toggle the sidebar' },
          { combos: [['Ctrl', 'Click']], desc: 'Open a note alongside the current one (split view)' },
        ],
      },
      {
        label: 'Sections',
        rows: [
          { combos: [['Ctrl', 'T']], desc: 'New section' },
          { combos: [['Ctrl', 'W']], desc: 'Delete the current section' },
          { combos: [['Ctrl', 'Tab']], desc: 'Next section' },
          { combos: [['Ctrl', 'Shift', 'Tab']], desc: 'Previous section' },
          { combos: [['Delete']], desc: 'Delete the selected note (when not editing text)' },
        ],
      },
      {
        label: 'Sticky notes',
        rows: [
          { combos: [['Ctrl', 'S']], desc: 'Open the current section as a sticky' },
          { combos: [['Ctrl', 'G']], desc: 'Open every section of the note as stickies' },
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
          { combos: [['Ctrl', 'M']], desc: 'Toggle raw markdown / rich text' },
          { combos: [['Ctrl', '+'], ['Ctrl', '−'], ['Ctrl', '0']], desc: 'Font size: bigger / smaller / reset' },
        ],
      },
    ],
  },

  views: {
    title: 'Four ways to see everything',
    intro: [
      'Beyond the editor, NoteFlow has four <strong>full-area views</strong> that replace the editing surface (the sidebar stays as context). They\'re mutually exclusive — opening one closes the others, and selecting any note drops you back into the editor.',
    ],
    cards: [
      {
        tag: '01 / note overview',
        name: 'One note, all its sections',
        desc: 'Every section of a note as a miniature editor card — jump straight to one, rename the note inline, add sections, or multi-select cards for batch <em>Hide from AI</em> / <em>Delete</em>. Opened from the grid button (⊞) next to the favorite star, or right-click → “Note overview”.',
      },
      {
        tag: '02 / group overview',
        name: 'One group, folder by folder',
        desc: 'A band per folder (plus “No folder” and “Archived”), each a responsive grid of note cards. Drag cards between bands to re-file them, multi-select for batch favorite / archive / move / delete, and widen the cards with a slider to reveal more sections. Opened by clicking a group\'s name.',
      },
      {
        tag: '03 / all content',
        name: 'The whole vault, indexed',
        desc: 'Favorites, groups (as accordion tiles that expand inline) and loose notes on one screen — with its own search box and a date filter (Today / Week / Month, plus a calendar with per-day activity markers).',
      },
      {
        tag: '04 / brain view',
        name: 'The graph',
        desc: 'The window splits into two resizable halves: the AI panel (chat, related notes, profile) on the left, the neural graph — structure edges plus semantic content edges — on the right.',
      },
    ],
  },

  temp: {
    title: 'Notes that clean up after themselves',
    intro: [
      'Some notes deserve to die: a phone number for today, a one-off shopping list, a paste buffer. <strong>Temporary notes</strong> live for 24 hours and then remove themselves — no graveyard of stale one-liners.',
    ],
    bullets: [
      'Create one with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>, the <strong>clock button</strong> next to “New note”, or a right-click on “New note” → <em>Temporary note (24h)</em>.',
      'The expiry is an <code>expiresAt</code> timestamp in the note\'s frontmatter — visible, portable, editable.',
      'The main process checks <strong>every minute</strong> and deletes expired notes automatically — from the remote sync repo too, so they don\'t resurrect on another machine.',
      'They\'re marked with a <strong>⏱ clock icon</strong> in the sidebar, and the editor header shows exactly when: <em>“Deletes &lt;date · time&gt;”</em>.',
    ],
  },

  encryption: {
    title: 'Encrypted notes',
    intro: [
      'Notes with real secrets can be locked with a password of their own, straight from the note\'s right-click menu: <strong>Encrypt note</strong> asks for a password; <strong>Unlock</strong> opens it for the current session only; <strong>Lock</strong> shuts it again; <strong>Remove encryption</strong> turns it back into a plain note. A locked note shows no content anywhere in the app.',
    ],
    bullets: [
      '<strong>AES-256-GCM</strong>, with the key derived via <strong>PBKDF2 — 310,000 iterations of SHA-256</strong>.',
      'No master key, no recovery backdoor: <strong>lose the password, lose the note</strong>. That\'s the point.',
      'The <a href="%CLI_URL%">CLI</a> ignores encrypted notes entirely.',
      'Encrypted notes never enter the <a href="%AI_URL%">AI index</a> or the brain graph — their plaintext stays out of every derived artifact.',
    ],
  },

  aiHidden: {
    title: 'Sections the AI never sees',
    intro: [
      'Encryption is the heavy tool; sometimes you just want the model to skip something — a salary note, a private journal section, plain noise. <strong>Hide from AI</strong> is a per-section toggle: flip it in the editor\'s <code>⋯</code> menu, or right-click any section tag in the sidebar and the overviews.',
    ],
    bullets: [
      'A hidden section is dropped from the <strong>semantic index</strong> (and deleted from it if it was already indexed), never enters <strong>chat context</strong> or <strong>Related notes</strong>, disappears from the <strong>brain graph</strong>, and is omitted from the <strong>agent\'s tools</strong> — the model never even sees its id.',
      'Hidden sections wear an <strong>EyeOff</strong> icon on their editor tab, sidebar tags and overview cards; <em>Show to AI</em> reverts the toggle and re-indexes the section.',
      'The rest of the app treats hidden sections completely normally — this is an AI boundary, not an app one.',
    ],
    moreP:
      'The boundary is enforced in the main process, across every AI surface at once — the full picture is in <a href="%AI_URL%">How the AI works → privacy</a>.',
  },

  personalize: {
    title: 'Make it yours',
    intro: [
      'NoteFlow ships <strong>14 hand-tuned themes</strong> — 11 dark, 3 light — each pairing its palette with its own UI font. The default is <strong>NoteFlow Dark</strong>, the same warm near-black + amber you\'re looking at on this site.',
    ],
    darkLabel: 'Dark · 11',
    lightLabel: 'Light · 3',
    moreP:
      'Beyond the theme, <strong>Settings → Appearance</strong> exposes the knobs individually: the app-wide <strong>font</strong>, the <strong>accent color</strong>, the <strong>editor colors</strong> (headings, italics, inline code and the accent bar of code blocks and quotes) and the overall <strong>UI scale</strong>. The editor has its own font and size settings, independent from the chrome.',
    widthP:
      'And for long-form writing, <strong>Settings → Editor → Content width</strong> switches the editor between <strong>Full</strong> (content uses the whole editor area) and <strong>Readable</strong> — a centered ~72-character column, iA-Writer style, where only tables and images break out to full width. Sections with headings also get a <strong>table of contents</strong>: a column of tiny dashes at the right edge of the editor that unfolds into the list of H1–H3 headings when you hover it — click one to glide to it (toggle it in <strong>Settings → Editor → Table of contents</strong>).',
  },
};

export type FeaturesContent = typeof featuresEn;
