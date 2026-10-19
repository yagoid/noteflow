// Shared shell copy for the docs pages (/cli, /ai, /features, /pricing) — English is the
// source of truth for the shape: `DocsCommon = typeof commonEn` (see common.es.ts).
export const commonEn = {
  // Vertical neuron rail (docs variant).
  rail: {
    home: 'home',
    cli: 'CLI',
    ai: 'AI',
    features: 'Features',
    pricing: 'Pricing',
    toggleTheme: 'Toggle theme',
  },
  // Language switcher: describes the link shown ON this (English) page.
  langSwitch: { label: 'ES', aria: 'Ver en español' },
  // TOC aside label.
  onThisPage: 'On this page',
  // Slim docs footer.
  footer: {
    brand: 'NoteFlow',
    home: 'Home',
    cli: 'CLI',
    ai: 'AI internals',
    features: 'Features',
    pricing: 'Pricing',
    privacy: 'Privacy',
    terms: 'Terms',
    legalNotice: 'Legal notice',
    cookies: 'Cookies',
    source: 'GitHub',
    copyright: '© 2026 · Technical notes app',
  },
  copy: { idle: 'copy', done: 'copied', aria: 'Copy to clipboard' },
};

export type DocsCommon = typeof commonEn;
