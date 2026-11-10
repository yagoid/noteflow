// English copy for the marketing landing (default locale). This object is the
// source of truth for the content shape: `Content = typeof en`. Every field the
// page renders lives here; `es.ts` must satisfy the same type (no missing keys).
// Strings that carry inline HTML (<strong>, <em>, <code>, <span>, <br>) are kept
// as raw strings and rendered with `set:html` in Home.astro.

export const en = {
  // Document <title> + meta description (passed to Base.astro).
  meta: {
    title: 'NoteFlow — Notes with a brain',
    description:
      'A dark-first desktop notebook for technical people. Plain markdown on your disk, a 3D neural graph of your notes, agentic AI chat, a headless CLI, and sync your way — a private GitHub repo or managed cloud. Free and open-source, for Windows & Linux.',
  },
  jsonLdDescription:
    'A local-first second brain for technical people: markdown notes, a 3D neural graph, agentic AI chat, a headless CLI, and sync your way — a private GitHub repo or managed cloud.',

  // Vertical neuron rail (left navigation).
  rail: {
    home: 'home',
    brain: 'The Brain',
    what: 'What is it',
    profile: 'Profile',
    download: 'Download',
    toggleTheme: 'Toggle theme',
  },

  // Language switcher: describes the link shown ON this (English) page.
  langSwitch: { label: 'ES', aria: 'Ver en español' },

  hero: {
    kicker: 'NoteFlow · The Brain',
    title: `Notes with<br />a <em style="font-style:italic;font-weight:500;">brain.</em>`,
    tagline: 'Streamline the experience',
    download: 'Download free',
    cta: 'Explore the brain ↓',
    scroll: 'Scroll',
  },

  // "What is NoteFlow": intro copy + the clip mosaic (a big stage playing one clip, the rest
  // pinned around it as selectable thumbnails). Structural data of each clip (files, order,
  // layout) lives in Home.astro; only the copy is here. `clips` is keyed by clip id.
  intro: {
    kicker: 'What is NoteFlow',
    h2: 'Quick notes. Zero friction.',
    p: `A dark-first desktop notebook for technical people. It lives in your system tray, writes plain Markdown to your own disk and stays out of the way until you need it. The brain is optional — the speed isn't.`,
    mosaicAria: 'NoteFlow in short clips',
    // Theme switch under the mosaic: every clip swaps to its dark/light take.
    toggleTheme: 'Switch theme — every clip follows',
    // Global pause/play for the stage and its auto-rotation (WCAG 2.2.2).
    pauseClips: 'Pause clips',
    playClips: 'Play clips',
    // Contextual CTAs under the mosaic → /cli and /features.
    cliCta: 'CLI reference →',
    featuresCta: 'Every detail →',
    // caption = mono chip on the thumbnail and the stage · label = aria-label describing what
    // the clip shows (thumbnail button + stage video).
    clips: {
      demo: { caption: 'Tour · the whole app', label: 'A tour of the NoteFlow desktop app' },
      agents: { caption: 'AI agent · CLI', label: 'Your AI agent writes to your notes: from a terminal it runs noteflow sections and noteflow add, and the task appears live in NoteFlow' },
      'sections-tab': { caption: 'Ctrl+Tab · sections', label: "Ctrl+Tab cycling through a note's sections" },
      'temp-note': { caption: 'Ctrl+Shift+N · temp note', label: 'Ctrl+Shift+N opens a temporary note that cleans itself up after 24 hours' },
      kanban: { caption: '/kanban · drag a card', label: 'A kanban board inside a note, with a card dragged to another column' },
      'slash-snippets': { caption: '/ menu · snippets', label: "The / menu inserting a snippet with today's date" },
      sticky: { caption: 'Sticky · sections', label: 'A floating sticky note switching section from its title' },
      'section-preview': { caption: 'Hover · section preview', label: "Hovering a note's section map shows a preview of that section" },
      themes: { caption: '14 themes', label: 'Switching through several NoteFlow themes' },
    },
  },

  brain: {
    kicker: 'The Brain · Local AI',
    h2: `Every note becomes <em style="font-style:italic;">a neuron.</em>`,
    p: `A semantic index turns your notes into a living graph. Structure you built is wired in solid lines; relationships the AI found light up as synapses through the core. Ask a question and the notes it used <span style="color:var(--ink-strong);">glow</span>.`,
    chatHeader: 'Chat — grounded in your notes',
    chatHint: 'Ask a question below.<br />Watch the brain light up the notes it reads from.',
    tryAsking: 'Try asking',
    hoverHint: 'drag · scroll to zoom · hover a note',
    contentOn: 'Content layer · on',
    contentOff: 'Content layer · off',
    cards: [
      { tag: '01 / GRAPH', title: 'Two layers of connections', p: 'Solid lines are the hierarchy you built. Faint synapses are what the AI noticed — even across different groups.' },
      { tag: '02 / CHAT', title: 'Chat with your notes', p: 'RAG answers stream with clickable citations — and the agent can create, move and organize notes for you.' },
      { tag: '03 / PRIVATE', title: '100% local & yours', p: 'The semantic index never leaves your machine. Bring your own model key — Anthropic, OpenAI, Ollama, anything.' },
    ],
    // Contextual CTA → the /ai docs page (the technical deep dive).
    aiCta: 'How the AI works →',
  },

  profile: {
    kicker: 'Profile · The second brain',
    h2: `An AI that <em style="font-style:italic;">actually knows you.</em>`,
    p: `No essay about yourself. NoteFlow asks the easy stuff — a few favorites, some this-or-that — and infers who you are from what those choices <span style="color:var(--ink-strong);">tend to mean</span>. Then it writes your profile as an editable note.`,
    signal: {
      heading: 'Low-friction signal',
      // Each row: label + the two options. The active option is marked in Home.astro.
      weekends: { label: 'Weekends', a: 'Planned', b: 'Improvised' },
      recharge: { label: 'Recharge', a: 'With people', b: 'Solo' },
      deadlines: { label: 'Deadlines', a: 'Early', b: 'Last minute' },
      albums: { label: 'Albums', value: '3 added' },
      dreamTrip: { label: 'Dream trip', value: 'Patagonia, slow' },
    },
    generate: 'Generate profile',
    card: {
      badge: 'Profile',
      title: 'Who you are',
      date: '06/2026',
      howYouWork: { label: 'How you work', text: 'You think in systems and reach for depth over breadth. A planned runway beats improvisation; you ship early, then refine.' },
      howToTalk: { label: 'How to talk to you', text: 'Direct and concise. Skip the warm-up — lead with the answer, then the reasoning.' },
      inferred: 'inferred from 6 answers · 2 documents · editable like any note',
    },
    disclaimer: `Described in abstract traits — never by the exact titles you gave. Favorites stay in a low-relevance section the AI is told <span style="color:var(--ink-dim);">not</span> to bring up unprompted. The model reads your documents directly; NoteFlow never stores them on a server.`,
  },

  download: {
    kicker: 'Free · Open · Private',
    h2: `Give your notes <em style="font-style:italic;">a brain.</em>`,
    windows: 'Download for Windows',
    linux: 'Download for Linux',
    // Version label under the buttons, followed by the tag (e.g. "v2.0.0"). Hidden until the
    // client script reads the tag from the GitHub API — no version is known at build time.
    versionLabel: 'Latest release',
    disclaimer: `Your notes stay on your machine as plain <span style="font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--ink-dim);">.md</span> files. Sync is your own private GitHub repo. Bring your own model key. No servers, no telemetry.`,
    // Footnote to the Windows button: unsigned installers trip SmartScreen on first run.
    // Kept to one line — what the warning is, what it is *not*, and the clicks to get past it.
    winNote: `Windows may warn about the installer: it isn't code-signed yet, not unsafe — the source is open on GitHub. Click <strong style="font-weight:500;color:var(--detail);">More info → Run anyway</strong>.`,
    footer: {
      brand: 'NoteFlow',
      tagline: 'Fast notes, with a brain.',
      // Column headings of the grouped footer.
      groups: {
        docs: 'Docs',
        project: 'Project',
        legal: 'Legal',
      },
      // Links to the long-form docs pages (/cli, /ai, /features, /pricing).
      cliDocs: 'CLI docs',
      aiDocs: 'How the AI works',
      featuresDocs: 'Features',
      pricingDocs: 'Pricing',
      source: 'Source',
      // Legal pages (/privacy, /terms, /legal-notice).
      privacy: 'Privacy',
      terms: 'Terms',
      legalNotice: 'Legal notice',
      // Reopens the cookie consent banner (data-cookie-settings, handled in Base.astro).
      cookies: 'Cookies',
      copyright: '© 2026 · Technical notes app',
    },
  },

  // Chat demo presets. Read by the client script via a JSON <script> tag.
  // `cites` are note ids (structural — never translated); q/a/citeLabels are copy.
  chatPresets: [
    {
      q: 'How do RAG and agents connect in my notes?',
      a: 'Your “RAG architectures” note links tightly to “Agentic loops” — retrieval feeds the agent’s context, and both point back to your “LLM evaluation” work. The thread even reaches your “Blog: second brain” draft.',
      cites: ['rag', 'agents', 'eval', 'blog-brain'],
      citeLabels: ['RAG architectures', 'Agentic loops', 'LLM evaluation'],
    },
    {
      q: 'Summarize what I know about the frontend.',
      a: 'Two notes carry it: “React patterns” (hooks, performance, state) and “CSS architecture”. They’re strongly related — your performance notes lean on the same structure ideas as your CSS layering.',
      cites: ['react-patterns', 'css-arch'],
      citeLabels: ['React patterns', 'CSS architecture'],
    },
    {
      q: 'Organize my AI notes into a group.',
      a: 'Done. I gathered your four loose AI notes — “RAG architectures”, “Agentic loops”, “Embeddings” and “LLM evaluation” — into a new “Research” group, and linked the two that kept referencing each other. Your brain just grew a cluster.',
      cites: ['rag', 'agents', 'embeddings', 'eval'],
      citeLabels: ['RAG architectures', 'Agentic loops', 'Embeddings', 'LLM evaluation'],
    },
  ],
};

export type Content = typeof en;
