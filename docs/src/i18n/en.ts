// English copy for the marketing landing (default locale). This object is the
// source of truth for the content shape: `Content = typeof en`. Every field the
// page renders lives here; `es.ts` must satisfy the same type (no missing keys).
// Strings that carry inline HTML (<strong>, <em>, <code>, <span>, <br>) are kept
// as raw strings and rendered with `set:html` in Home.astro.
import type { NoteBlock } from './types';

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
    notes: 'Notes',
    themes: 'Themes',
    profile: 'Profile',
    download: 'Download',
    toggleTheme: 'Toggle theme',
  },

  // Language switcher: describes the link shown ON this (English) page.
  langSwitch: { label: 'ES', aria: 'Ver en español' },

  hero: {
    kicker: 'NoteFlow · The Brain',
    title: `Notes with<br />a <em style="font-style:italic;font-weight:500;">brain.</em>`,
    tagline: 'Our niche is people with taste.',
    download: 'Download free',
    cta: 'Explore the brain ↓',
    scroll: 'Scroll',
  },

  notesSection: {
    kicker: 'What is NoteFlow',
    h2: 'Quick notes. Zero friction.',
    p: `A dark-first desktop notebook for technical people. It lives in your system tray, writes plain Markdown to your own disk, and stays out of the way until you need it. The brain is optional — the speed isn't.`,
    modeRaw: 'Raw markdown section',
    modeRich: 'Rich text section',
    listAria: 'NoteFlow features',
    // Contextual CTA under the notes widget → the /cli docs page.
    cliCta: 'CLI reference →',
    // Keyed by feature id (structural fields id/tok/time/mode live in Home.astro).
    notes: {
      brain: {
        title: 'A brain that mirrors you',
        date: 'Jun 24, 2026 · 22:10',
        tags: ['Brain'],
        body: [
          { t: 'p', html: 'NoteFlow turns your notes into a living <strong>3D neural graph</strong>. The more order you give them, the more legible your brain becomes — clusters form, neurons connect, structure emerges.' },
          { t: 'ul', items: ['Tidy groups → clean clusters', 'Linked notes → stronger connections', 'Each section is its own neuron'] },
          { t: 'p', html: 'Organize on the left, watch it take shape in the <code>Brain</code> view.' },
        ] as NoteBlock[],
      },
      headless: {
        title: 'Drive it headless',
        date: 'Jun 21, 2026 · 20:48',
        tags: ['CLI'],
        body: [
          { t: 'p', html: 'No screen? No problem. Run NoteFlow on a <strong>Raspberry Pi</strong>, a VPS or a home server through its companion CLI.' },
          { t: 'code', lines: ['$ ssh pi@home', '$ nf new "Backup plan" --group infra', '✓ created · synced'] },
          { t: 'p', html: 'Full control over your notes and groups from any terminal — perfect for scripts and pipelines.' },
        ] as NoteBlock[],
      },
      import: {
        title: 'Bring your notes along',
        date: 'Jun 17, 2026 · 18:33',
        tags: ['Import'],
        body: [
          { t: 'p', html: 'Switching is painless. Import what you already wrote elsewhere — NoteFlow speaks the formats you already use.' },
          { t: 'check', items: [
            { done: true, text: 'Notion exports' },
            { done: true, text: 'Obsidian vaults' },
            { done: true, text: 'Google Keep' },
            { done: false, text: '…and plain Markdown from anywhere' },
          ] },
        ] as NoteBlock[],
      },
      ai: {
        title: 'AI that knows you',
        date: 'Jun 14, 2026 · 16:05',
        tags: ['Agent'],
        body: [
          { t: 'p', html: 'The agent reads your <strong>profile</strong> and the full context of your notes before it answers — so its replies land closer to what you actually mean than any generic chat ever could.' },
          { t: 'ul', items: ['Knows who you are and how you work', 'Sees every note as context', 'Answers in your language, on your terms'] },
        ] as NoteBlock[],
      },
      sticky: {
        title: 'Pin it to your desktop',
        date: 'Jun 10, 2026 · 13:27',
        tags: ['Sticky'],
        body: [
          { t: 'p', html: 'Pop any note out as a <strong>sticky note</strong> that floats over your desktop — always in view while you work.' },
          { t: 'check', items: [
            { done: true, text: 'Stays on top, outside the main window' },
            { done: true, text: 'Edits sync straight back to the note' },
          ] },
        ] as NoteBlock[],
      },
      private: {
        title: 'Private by design',
        date: 'Jun 06, 2026 · 08:52',
        tags: ['Privacy'],
        body: [
          { t: 'p', html: 'Your notes, your rules. Sync runs through a repo <strong>you</strong> own, and you can plug in <strong>local AI models</strong> so nothing ever leaves your machine.' },
          { t: 'check', items: [
            { done: true, text: 'Sync to a GitHub repo you control' },
            { done: true, text: 'Run local LLMs — fully offline AI' },
            { done: true, text: 'Your keys, your data, your disk' },
          ] },
        ] as NoteBlock[],
      },
    },
  },

  showcase: {
    kicker: 'Dark-first · 12 themes',
    h2: `The magic is in <em style="font-style:italic;">the small details.</em>`,
    p: 'Twelve hand-tuned themes — Carbon, Tokyo Night, Dracula, Parchment and more. Flip the switch and the whole app follows.',
    toggleTheme: 'Toggle theme',
    themesLabel: 'Themes',
    themesCaption: 'Carbon · Tokyo Night · Midnight · Dracula · Synthwave · Parchment …',
    videoAria: 'NoteFlow desktop app demo',
    // Contextual CTA → the /features docs page.
    featuresCta: 'Every detail →',
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
