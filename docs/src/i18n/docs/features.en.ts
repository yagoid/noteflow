// English copy for the /features docs page (source of truth for the shape:
// `FeaturesContent = typeof featuresEn`, see features.es.ts). Strings with inline
// HTML are rendered with `set:html` in FeaturesPage.astro. Every behaviour and
// shortcut documented here comes from the product itself (source of truth for
// shortcuts: src/components/Settings/ShortcutsPanel.tsx; themes: src/lib/themes.ts).

export const featuresEn = {
  meta: {
    title: 'NoteFlow features — sticky notes, templates, encryption & more',
    description:
      'The details that make NoteFlow feel different: groups, folders and sections, note templates, always-on-top sticky notes that fold into pills, section-to-section links, snippets with live dates, AES-256 encrypted notes, per-section AI privacy, 14 themes and a full keyboard map.',
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
    { id: 'snippets', label: 'Snippets' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'views', label: 'Views' },
    { id: 'temp', label: 'Temporary notes' },
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
      switchHint: 'Switch section',
      foldAria: 'Fold the sticky note into a pill',
      closeAria: 'Close (decorative in this demo)',
    },
    bullets: [
      '<kbd>Ctrl</kbd>+<kbd>S</kbd> opens the <strong>current section</strong> as a sticky; <kbd>Ctrl</kbd>+<kbd>G</kbd> opens <strong>every section</strong> of the note at once. There\'s also a <code>⧉</code> button in the editor toolbar.',
      'Stickies start at <strong>300 × 300 px</strong> and are freely resizable (minimum 200 × 200).',
      'Each sticky is a full editor: <strong>markdown mode (rendered) or text mode (shown as-is)</strong>, same as the main window.',
      'Edits sync with the main window <strong>in real time</strong> — it\'s the same section, not a copy.',
      'Open <strong>as many as you want</strong>; folded stickies stack as pills in the corner of your screen.',
      '<strong>Switch sections</strong> without opening another window: when the note has two or more, the section name in the title bar opens a dropdown with all of them (color dot + name, ✓ on the current one). It works from the keyboard too — <kbd>↓</kbd> to open, arrows to move, <kbd>Enter</kbd> to pick, <kbd>Esc</kbd> to close.',
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
      rawLabel: 'the same link in text mode',
      raw: '[Launch checklist](noteflow://k3v9pQ/aB3dE9)',
    },
    bullets: [
      '<strong>Click</strong> a pill to jump to the target section — in the same note or any other. <strong>Hover</strong> shows the same floating preview used across the app.',
      'The pill shows the target\'s name <strong>live</strong>: rename the section and every pill pointing at it updates. Delete the target and the pill switches to a <strong>broken</strong> state (dimmed, struck through, no navigation).',
      'The search excludes encrypted, archived and temporary notes; the <kbd>/</kbd> command exists in markdown mode only.',
      'The same <kbd>/</kbd> menu inserts a <strong>kanban board</strong> (<kbd>/kanban</kbd>): columns and cards you drag around, with the task chips (📅 deadline, ⏰ alarm, 🔺 importance), right inside the note — and saved as plain markdown, like everything else. It also lists your own <a href="#snippets">snippets</a>.',
    ],
    rawP:
      'Under the hood a pill is nothing exotic — it\'s a plain markdown link, <code>[Name](noteflow://noteId/sectionId)</code>, stored inside the section\'s text. That\'s exactly what you see in text mode, and it\'s why links <strong>survive sync, export and import</strong> unchanged.',
    brainP:
      'These links also appear as <strong>edges in the brain view</strong>, connecting the two sections — and since they\'re your own explicit structure, they work even with the AI and embeddings <strong>completely disabled</strong>.',
  },

  snippets: {
    title: 'Snippets, with the date filled in',
    intro: [
      'The text you keep typing by hand — a journal heading, a meeting skeleton, a divider with the time, your signature — can become a <strong>snippet</strong>: reusable markdown that drops in at the cursor with one click, stamped with the date and time of the moment you insert it.',
    ],
    mock: {
      sourceLabel: 'snippet',
      source: '## {date:dddd, D MMMM YYYY} · {time}',
      outputLabel: 'inserted',
      output: 'Sunday, 8 November 2026 · 09:30',
    },
    bullets: [
      'A <strong>split button</strong> in the editor toolbar (the stamp icon, right after the kanban one): the main click inserts your <strong>default</strong> snippet; the chevron lists all of them with a one-line preview — already showing today\'s date — and ends with <em>Configure snippets…</em>.',
      'They\'re in the <kbd>/</kbd> menu too, after the built-in commands under a <em>Snippets</em> heading: type part of a name to filter, or <kbd>/snippet</kbd> to list them all — even with the toolbar button hidden.',
      'Snippets go in as <strong>markdown</strong>: headings, lists and checkboxes render, and a one-line snippet without block syntax flows inline with your text.',
      'Variables: <code>{date}</code>, <code>{time}</code>, <code>{datetime}</code>, or your own format like <code>{date:dddd, D MMMM}</code> with moment-style tokens. The snippet editor builds them for you — preset formats or a custom one, with the result live — and reminds you that <code>MM</code> is the month and <code>mm</code> the minutes. Day and month names follow the app\'s language.',
      'Start from the <strong>suggestions</strong> — today\'s date, date and time, journal entry, meeting, divider with time, signature — and edit them freely; a star marks the default.',
      'Like the rest of the toolbar and the <kbd>/</kbd> menu, snippets live in markdown mode only.',
    ],
    syncP:
      'Snippets are stored in <code>snippets.json</code> inside your notes directory, so they sync like your templates — through GitHub or NoteFlow Cloud.',
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
          { combos: [['Ctrl', "'"]], desc: 'Pin / unpin the sidebar' },
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
          { combos: [['Ctrl', 'M']], desc: 'Toggle text / markdown mode' },
          { combos: [['Ctrl', '+'], ['Ctrl', '−'], ['Ctrl', '0']], desc: 'Font size: bigger / smaller / reset' },
        ],
      },
    ],
  },

  views: {
    title: 'Three ways to see everything',
    intro: [
      'Beyond the editor, NoteFlow has three <strong>full-area views</strong> that replace the editing surface (the sidebar stays as context). They\'re mutually exclusive — opening one closes the others, and selecting any note drops you back into the editor.',
      'Want the full width? <strong>Unpin the sidebar</strong> (the button next to its search box, or <kbd>Ctrl</kbd>+<kbd>\'</kbd>): it folds into a faint, text-free <strong>mini-map</strong> at the left edge of the text — one tiny mark per note, group and folder, tinted with their colors. Bring the mouse to it and the whole sidebar slides in over the content, full height; it closes when you leave, and stays open while you type in it or drag a note out of it. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> opens it straight into the search, and <kbd>Esc</kbd> sends you back to the editor.',
    ],
    cards: [
      {
        tag: '01 / note overview',
        name: 'One note, all its sections',
        desc: 'The section map with the content inside: every section of a note as a cell of one grid, in the section map\'s order, with its real content at reading size — the one open in the editor spans two columns, marked <em>OPEN</em>. Drag to reorder, double-click a name to rename, add one from the “New section” cell, or multi-select for batch <em>Hide from AI</em> / <em>Text mode</em> / <em>Delete</em>. Opened from the grid button (⊞) next to the favorite star, or by right-clicking a section → “Note overview”.',
      },
      {
        tag: '02 / content view',
        name: 'Everything, or one group, by date',
        desc: 'Three columns: places (all, favorites, each group with its folders, ungrouped), the place\'s notes in date blocks (Today, Yesterday, This week…) with every section visible as a cell, and a read-only preview of the chosen section. Search it, drag notes onto a place to re-file them, add folders and groups inline, multi-select for batch favorite / archive / move / delete, and show archived notes from its ⋯ menu. Opened from the grid button (⊞) next to the sidebar search bar, or by clicking a group\'s name.',
      },
      {
        tag: '03 / brain view',
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
      'Create one with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>, the <strong>clock button</strong> stacked under the new-group button (right of the big <strong>+</strong> new-note button), or a right-click on the <strong>+</strong> button → <em>Temporary note (24h)</em>.',
      'The expiry is an <code>expiresAt</code> timestamp in the note\'s frontmatter — visible, portable, editable.',
      'The main process checks <strong>every minute</strong> and deletes expired notes automatically — from the remote sync repo too, so they don\'t resurrect on another machine.',
      'They\'re marked with a <strong>⏱ clock icon</strong> in the sidebar, and the editor header shows exactly when: <em>“Deletes &lt;date · time&gt;”</em>. A small chevron next to it lets you push the deletion to 1–48 hours from now, or <strong>make the note permanent</strong>.',
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
      'Encryption is the heavy tool; sometimes you just want the model to skip something — a salary note, a private journal section, plain noise. <strong>Hide from AI</strong> is a per-section toggle: flip it in the editor\'s <code>⋯</code> menu, or right-click any section in the sidebar, the content view or the note view.',
    ],
    bullets: [
      'A hidden section is dropped from the <strong>semantic index</strong> (and deleted from it if it was already indexed), never enters <strong>chat context</strong> or <strong>Related notes</strong>, disappears from the <strong>brain graph</strong>, and is omitted from the <strong>agent\'s tools</strong> — the model never even sees its id.',
      'Hidden sections wear an <strong>EyeOff</strong> icon on their cell in the section map and the sidebar, and on their note-view card; <em>Show to AI</em> reverts the toggle and re-indexes the section.',
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
