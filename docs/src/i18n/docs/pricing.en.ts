// English copy for the /pricing docs page (source of truth for the shape:
// `PricingContent = typeof pricingEn`, see pricing.es.ts). Strings with inline HTML
// are rendered with `set:html` in PricingPage.astro; %AI_PROVIDERS_URL% /
// %AI_PRIVACY_URL% placeholders are filled with locale-aware links there.
// All facts (plans, curated models, quota, Cloud status) come from
// .claude/context/monetization.md — including the price figures in `plans`
// and the ai/cloud bullets: keep them in sync with monetization.md (§ visión)
// and the Lemon Squeezy variants. The checkout still shows the final price.

export const pricingEn = {
  meta: {
    title: 'NoteFlow pricing — free forever, plus optional managed plans',
    description:
      'NoteFlow is free and everything essential stays free. Two optional subscriptions exist for convenience only — NoteFlow AI (managed LLM) and NoteFlow Cloud (encrypted managed sync), both available now — and both capabilities can be had for free by self-managing.',
  },

  hero: {
    kicker: 'NoteFlow · Pricing',
    h1: 'Free.<br />Forever.',
    tagline:
      'Everything essential is free and stays free. The paid plans buy convenience, not capability — anything they do, you can self-manage at no cost.',
  },

  toc: [
    { id: 'free', label: 'Free forever' },
    { id: 'plans', label: 'Plans & pricing' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'compare', label: 'Managed vs DIY' },
    { id: 'privacy', label: 'Privacy' },
  ],

  free: {
    title: 'Everything essential is free',
    intro: [
      'NoteFlow is local-first: your notes are plain <code>.md</code> files on your machine, and the whole product works without an account, a server or a subscription. This is the full app — not a trial tier.',
    ],
    cards: [
      {
        title: 'Editor & organization',
        html: 'The markdown editor, groups → folders → notes → sections, templates, sticky notes, views and shortcuts — all of it.',
      },
      {
        title: 'The Brain',
        html: 'The semantic index, note graph and related sections run <strong>100% locally</strong> — embeddings are computed on your machine, no cloud involved.',
      },
      {
        title: 'AI chat & agent',
        html: 'Bring your own model: run <strong>Ollama</strong> locally (no key, fully offline) or use your own API key from any of the <a href="%AI_PROVIDERS_URL%">9 supported providers</a>.',
      },
      {
        title: 'Encryption',
        html: 'Per-note AES-256-GCM encryption with your passphrase. No backdoor, no plan required.',
      },
      {
        title: 'GitHub Sync',
        html: 'Sync between devices through your own private GitHub repo. Free, self-managed, yours.',
      },
      {
        title: 'CLI',
        html: 'The companion CLI reads and edits the same notes from your terminal — and from your coding agents.',
      },
    ],
    keep: {
      title: 'Plans add, they never replace',
      html: 'The two subscriptions below are <strong>managed alternatives</strong> for people who don’t want to run anything themselves. The free routes — a local model, your own key, GitHub Sync — stay first-class and keep working exactly as they do today.',
    },
  },

  plans: {
    title: 'Plans & pricing',
    intro: [
      'The plans buy convenience, not capability — and you subscribe <strong>from inside the app</strong>: Settings → Account, monthly or annual. The checkout opens in your browser and payment is processed by <strong>Lemon Squeezy</strong>, our merchant of record.',
    ],
    perMonth: '/month',
    perYear: '/year',
    cards: [
      {
        name: 'NoteFlow AI',
        subtitle: 'The managed model',
        monthly: '€5.99',
        yearly: '€49.99',
        badge: '',
      },
      {
        name: 'NoteFlow Cloud',
        subtitle: 'Encrypted managed sync',
        monthly: '€3.99',
        yearly: '€39.99',
        badge: '',
      },
      {
        name: 'NoteFlow Bundle',
        subtitle: 'NoteFlow AI + NoteFlow Cloud together',
        monthly: '€7.99',
        yearly: '€79.99',
        badge: 'Best value',
      },
    ],
    note: 'Prices include VAT. The final price is always shown at checkout. Annual billing costs less than 12 months at the monthly price.',
  },

  ai: {
    badge: 'Available now',
    title: 'NoteFlow AI — the managed model',
    intro: [
      'The AI chat needs a language model. The free routes: run one locally with Ollama, or paste your own API key. <strong>NoteFlow AI</strong> is the third route, for people who don’t want to deal with either — a model managed by NoteFlow that just works the moment you subscribe.',
    ],
    bullets: [
      'No Ollama to install, no third-party account, no API key to buy, store or rotate.',
      'A <strong>monthly AI allowance</strong> is included, measured by the real compute cost of each request — so how far it goes depends on the model you pick and on how long your conversations get.',
      'Monthly or annual subscription — <strong>€5.99/month or €49.99/year</strong>, VAT included. Subscribe from inside the app: <strong>Settings → Account → Subscribe</strong> — checkout opens in your browser, handled by Lemon Squeezy, our merchant of record.',
      'Once the payment goes through, NoteFlow AI activates itself as your provider — nothing to configure.',
    ],
    modelsTitle: 'Everyday models',
    models: [
      'deepseek/deepseek-v4.1-flash-1017',
      'openai/gpt-5.6-luna',
      'anthropic/claude-haiku-5.5',
      'xiaomi/mimo-v2.6-pro',
    ],
    modelsAdvancedTitle: 'Advanced model — spends the allowance much faster',
    modelsAdvanced: [
      'openai/gpt-5.6-sol',
    ],
    modelsNote:
      'All curated models support tool-calling (the agent) and vision (image attachments); <strong>deepseek-v4.1-flash</strong> is the recommended default. Because the allowance follows the real cost of each request, pricier models use it up sooner: the everyday models cost about the same per message as the default, or up to roughly twice as much, while the advanced model — the most capable one — spends it <strong>around 30× faster</strong>. Keep it for the hardest questions.',
    alt: {
      title: 'The free way to the same capability',
      html: 'Run a local model with <strong>Ollama</strong> — nothing ever leaves your machine — or bring your own API key from any supported provider. Same chat, same agent, same features; you just manage the model yourself.',
    },
  },

  cloud: {
    badge: 'Available now',
    title: 'NoteFlow Cloud — encrypted note sync',
    intro: [
      '<strong>NoteFlow Cloud</strong> is managed sync: hands-off, automatic sync between devices, with none of the push/pull friction of a git-based flow.',
      'Your notes are <strong>encrypted in transit and at rest</strong>, and you choose the trust model: <strong>managed</strong> mode (the default — nothing to remember, sign in and it just syncs) or <strong>private end-to-end encryption</strong> (opt-in, unlocked with a passphrase plus recovery code, where not even the operator can read your notes).',
    ],
    bullets: [
      'Automatic sync across devices — no manual pushes, no waiting on a git flow.',
      'Two encryption modes: managed by default (zero secrets to keep), or opt into strict E2EE where the keys never leave your devices.',
      'Monthly or annual subscription — <strong>€3.99/month or €39.99/year</strong>, VAT included, subscribed from inside the app (Settings → Account).',
      'For people who don’t want to create and manage a GitHub repo just to sync notes.',
    ],
    alt: {
      title: 'GitHub Sync stays free',
      html: 'The existing <strong>GitHub Sync</strong> against your own private repo keeps working and stays free — Cloud is a smoother alternative on top of it, not a replacement.',
    },
  },

  compare: {
    title: 'Managed vs self-managed',
    intro: [
      'Same capabilities, two ways to get them. Pick per capability — they mix freely, and switching is never locked.',
    ],
    cols: {
      capability: 'Capability',
      managed: 'Managed (subscription)',
      self: 'Self-managed (free)',
    },
    rows: [
      {
        capability: 'AI model',
        managed: '<strong>NoteFlow AI</strong> — curated models, zero setup, monthly AI allowance included',
        self: '<strong>Ollama</strong> locally (no key, offline) or your own API key from any of the 9 supported providers',
      },
      {
        capability: 'Setup & upkeep',
        managed: 'None — subscribe in-app and it activates itself',
        self: 'Install Ollama, or create a provider account and manage a key',
      },
      {
        capability: 'Note sync',
        managed: '<strong>NoteFlow Cloud</strong> — automatic, encrypted sync (managed by default, or opt-in E2EE)',
        self: '<strong>GitHub Sync</strong> with your own private repo',
      },
      {
        capability: 'Everything else',
        managed: 'Free for everyone — editor, the Brain, encryption, stickies, CLI',
        self: 'Same — no plan involved',
      },
    ],
  },

  privacy: {
    title: 'Privacy with the managed AI',
    intro: [
      'Subscribing to NoteFlow AI does not change the local-first architecture — the boundaries documented in <a href="%AI_PRIVACY_URL%">How the AI works → privacy</a> hold exactly the same.',
    ],
    items: [
      {
        title: 'The index never leaves',
        html: 'The semantic index — embeddings, graph, search — is built and stored <strong>100% on your machine</strong>. Subscribing changes nothing about it.',
      },
      {
        title: 'Same data as with your own key',
        html: 'What travels to the NoteFlow proxy is exactly what would travel to any provider you use with your own key: your question plus the retrieved note fragments.',
      },
      {
        title: 'Hidden stays hidden',
        html: 'Sections marked <em>Hide from AI</em> and encrypted notes are excluded from the index, so they are never sent — to NoteFlow AI or to any other provider.',
      },
      {
        title: 'Independent subsystems',
        html: 'NoteFlow AI does not route through the notes cloud: the managed AI and NoteFlow Cloud are separate subsystems. Using one never implies the other.',
      },
    ],
  },
};

export type PricingContent = typeof pricingEn;
