// English copy for the /privacy legal page. The body text is the canonical legal
// text — edit deliberately (and keep privacy.es.ts in sync). Rendered by
// LegalPage.astro via set:html; %MOBILE_PRIVACY_URL% is filled there with the
// base-aware link to public/mobile-privacy-policy.html (which stays live — the
// Play Store links to it). The controller paragraph of §1 names the owner and links to
// the legal notice (%LEGAL_NOTICE_URL%) only once legal-notice.owner.ts is filled in.
import type { LegalContent } from './legal';
import { OWNER, legalNoticeReady, ownerNameHtml } from './legal-notice.owner';

const controllerHtml = legalNoticeReady
  ? `The controller of your personal data is <strong>${ownerNameHtml}</strong>, the owner of NoteFlow, whose full identification details are listed in the <a href="%LEGAL_NOTICE_URL%">Legal Notice</a>.`
  : `The controller of your personal data is the independent developer who operates NoteFlow, contactable at <strong>${OWNER.email}</strong>.`;

export const privacyEn: LegalContent = {
  meta: {
    title: 'Privacy Policy — NoteFlow',
    description:
      'How NoteFlow handles data: the desktop app is local-first with no telemetry, and the optional services (NoteFlow Account, NoteFlow AI, NoteFlow Cloud) process only the minimum described here — with encrypted cloud sync and optional end-to-end encryption.',
  },

  hero: {
    kicker: 'NoteFlow · Legal',
    h1: 'Privacy<br />Policy',
    tagline: 'Last updated: October 19, 2026',
  },

  summary: {
    title: 'Summary',
    html: 'NoteFlow is local-first. Your notes are plain Markdown files stored on your own device, and the desktop app contains no telemetry, analytics or ads. No account is required to use it. If you choose to create a NoteFlow Account and subscribe to the optional managed services, we process the minimum data described below — and NoteFlow Cloud always encrypts your notes, with an optional end-to-end encrypted mode in which we cannot read them even when they are stored on our servers.',
  },

  toc: [
    { id: 'controller', label: 'Who we are' },
    { id: 'local-first', label: 'Local-first by default' },
    { id: 'optional', label: 'Optional integrations' },
    { id: 'account', label: 'NoteFlow Account' },
    { id: 'payments', label: 'Payments' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'website', label: 'Website' },
    { id: 'processors', label: 'Service providers' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'retention', label: 'Retention' },
    { id: 'rights', label: 'Your rights' },
    { id: 'children', label: 'Children' },
    { id: 'changes', label: 'Changes' },
    { id: 'contact', label: 'Contact' },
  ],

  sections: [
    {
      id: 'controller',
      title: '1. Who we are',
      blocks: [
        {
          t: 'p',
          html: 'NoteFlow is a desktop note-taking application, a public website and a set of optional online services (NoteFlow Account, NoteFlow AI and NoteFlow Cloud) developed and operated by an independent developer based in Spain (“NoteFlow”, “we”).',
        },
        { t: 'p', html: controllerHtml },
        {
          t: 'p',
          html: 'For anything related to this policy or your data, contact: <strong>yago.igle@gmail.com</strong>.',
        },
        {
          t: 'p',
          html: 'The NoteFlow mobile app has its own, separate privacy policy: <a href="%MOBILE_PRIVACY_URL%">NoteFlow Mobile privacy policy</a>.',
        },
      ],
    },
    {
      id: 'local-first',
      title: '2. The app by default: your data stays on your device',
      blocks: [
        {
          t: 'p',
          html: 'Out of the box, the desktop app collects <strong>no personal data at all</strong>:',
        },
        {
          t: 'ul',
          items: [
            'Notes, groups, settings, templates and the AI semantic index are stored <strong>locally on your device</strong> as files and a local database.',
            'There is <strong>no telemetry, no analytics, no crash reporting and no advertising</strong> in the app.',
            'Note-level encryption happens entirely on your device; encrypted notes can only be opened with your password.',
            'Nothing is transmitted anywhere unless you explicitly enable one of the optional features described below.',
          ],
        },
      ],
    },
    {
      id: 'optional',
      title: '3. Optional integrations you control',
      blocks: [
        {
          t: 'p',
          html: 'These features are opt-in, and each one talks to a third party <strong>directly from your device</strong> — NoteFlow has no server in the middle:',
        },
        {
          t: 'ul',
          items: [
            '<strong>GitHub Sync (free).</strong> Your notes are pushed to and pulled from a private GitHub repository that you own. Your GitHub token is stored encrypted on your device and is only sent to GitHub’s API. GitHub’s <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">privacy statement</a> applies to the data in your repository.',
            '<strong>AI with your own key or local models (free).</strong> If you configure an AI provider with your own API key, your chat messages plus the relevant excerpts of your notes (retrieved locally) are sent directly from your device to that provider, under that provider’s privacy policy. With a local provider (Ollama), nothing leaves your machine.',
            'In all AI features: sections you mark as <strong>“Hide from AI”</strong> and <strong>encrypted notes</strong> are excluded from the semantic index and are therefore never included in anything sent to any AI provider. The semantic index itself (embeddings) is computed and stored locally.',
          ],
        },
      ],
    },
    {
      id: 'account',
      title: '4. NoteFlow Account',
      blocks: [
        {
          t: 'p',
          html: 'Creating an account is optional and only needed for the paid services. When you create one, we process:',
        },
        {
          t: 'ul',
          items: [
            'Your <strong>email address</strong> and a technical user ID (authentication via one-time email codes; no password is stored).',
            '<strong>Authentication tokens.</strong> The session token on your device is stored encrypted. Standard security logs of our backend (timestamps, IP addresses) are kept by our infrastructure provider.',
            'Your <strong>subscription status</strong>: which plan you have, its state and renewal date, plus an opaque reference from the payment provider. We use this to enable your plan’s features.',
          ],
        },
        {
          t: 'p',
          html: 'Purposes and legal bases (GDPR): providing the service you signed up for (performance of a contract, art. 6(1)(b)) and keeping the service secure and preventing abuse (legitimate interest, art. 6(1)(f)).',
        },
        {
          t: 'p',
          html: 'This data is stored with <strong>Supabase</strong>, our backend provider (see section 9).',
        },
      ],
    },
    {
      id: 'payments',
      title: '5. Payments',
      blocks: [
        {
          t: 'p',
          html: 'Paid plans are sold through <strong>Lemon Squeezy</strong>, acting as <strong>Merchant of Record</strong>: Lemon Squeezy is the legal seller, and it handles checkout, payment processing, invoicing, taxes/VAT and refunds. <strong>We never receive your card or payment details.</strong> From Lemon Squeezy we only receive events describing your subscription status (product, state, renewal date), linked to your account.',
        },
        {
          t: 'p',
          html: 'Lemon Squeezy’s <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener">privacy policy</a> applies to the checkout and payment process.',
        },
      ],
    },
    {
      id: 'ai',
      title: '6. NoteFlow AI (managed AI plan)',
      blocks: [
        {
          t: 'p',
          html: 'When you use the managed AI plan, each request works like this:',
        },
        {
          t: 'ul',
          items: [
            'Your chat message, plus the relevant excerpts of your notes retrieved <strong>locally on your device</strong>, are sent over TLS to our AI proxy, which forwards them to <strong>OpenRouter</strong>, which routes them to the AI model provider you selected. This is <strong>exactly the same data</strong> that would travel if you used that provider with your own API key.',
            '<strong>We do not log or store the content of your prompts or the model’s responses on our servers.</strong> The only thing we record per request is metering data: your user ID, the model used, token counts and a timestamp — needed to enforce the monthly usage quota.',
            'OpenRouter and the underlying model provider process the request under their own privacy policies (<a href="https://openrouter.ai/privacy" target="_blank" rel="noopener">OpenRouter privacy policy</a>). Our OpenRouter configuration does not opt in to prompt logging or training programs.',
            'As always, “Hide from AI” sections and encrypted notes never leave your device.',
            'NoteFlow AI is <strong>independent from NoteFlow Cloud</strong>: using the AI plan does not upload or store your notes on our servers.',
          ],
        },
      ],
    },
    {
      id: 'cloud',
      title: '7. NoteFlow Cloud (encrypted sync)',
      blocks: [
        {
          t: 'p',
          html: 'Your notes are <strong>encrypted on your device</strong> (AES-256-GCM) before they are uploaded. You choose how much trust to place in us, through one of two modes:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Managed mode (the default).</strong> The key that protects your notes is stored on the server wrapped by a key we hold. This lets sync work automatically with nothing for you to remember, but it means we are <strong>technically able to decrypt your note content</strong>. We access it only where strictly necessary to operate the service, never to read your notes for any other purpose.',
            '<strong>Private mode (optional, end-to-end encrypted).</strong> If you enable it, the key is protected by a <strong>passphrase only you know</strong>, and the server only ever stores <em>wrapped</em> keys it cannot open. In this mode <strong>we cannot read your notes</strong>, and for the same reason <strong>we cannot reset your passphrase</strong>: if you lose both your passphrase and your recovery code, your cloud data is permanently unrecoverable — by anyone.',
            'In both modes, the server stores your note contents, file paths and folder structure only as <strong>ciphertext</strong>, alongside opaque path identifiers and modification timestamps.',
            'The sync metadata we can see is limited to technical data: row timestamps, approximate sizes, and request logs (IP, timestamps) at our infrastructure provider.',
          ],
        },
        {
          t: 'p',
          html: 'Cloud data is stored with <strong>Supabase</strong> (see section 9).',
        },
      ],
    },
    {
      id: 'website',
      title: '8. Website',
      blocks: [
        {
          t: 'p',
          html: 'The website (this site) is hosted on <strong>GitHub Pages</strong>, so GitHub receives standard server logs (IP address, user agent) when you visit. The site currently uses:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Google Analytics</strong>, to measure aggregate visits (sets cookies).',
            '<strong>Google Fonts</strong> served from Google’s servers (your IP is sent to Google when fonts load).',
          ],
        },
        {
          t: 'p',
          html: 'Downloads of the app are served from GitHub Releases.',
        },
      ],
    },
    {
      id: 'processors',
      title: '9. Service providers (processors and recipients)',
      blocks: [
        {
          t: 'table',
          head: ['Provider', 'Role', 'What it processes'],
          rows: [
            [
              'Supabase',
              'Backend infrastructure (authentication, database, functions)',
              'Account email, subscription status, AI metering, encrypted cloud data, service logs',
            ],
            [
              'Lemon Squeezy',
              'Merchant of Record (independent controller for the sale)',
              'Payment and billing data at checkout',
            ],
            [
              'OpenRouter',
              'AI request routing (managed AI plan only)',
              'Prompt content in transit, model usage',
            ],
            [
              'AI model providers (via OpenRouter)',
              'Model inference (managed AI plan only)',
              'Prompt content in transit',
            ],
            [
              'GitHub',
              'Website hosting, app downloads; optional GitHub Sync (your own repository)',
              'Web server logs; your synced notes if you enable GitHub Sync',
            ],
            [
              'Google',
              'Website analytics and fonts (website only, not the app)',
              'Cookies, IP, usage of the website',
            ],
          ],
        },
        {
          t: 'p',
          html: 'We do not sell personal data, and we do not share it with anyone beyond the providers listed above.',
        },
      ],
    },
    {
      id: 'transfers',
      title: '10. International transfers',
      blocks: [
        {
          t: 'p',
          html: 'Some of the providers above process data in the United States or other countries outside the EEA. Where that happens, transfers rely on the European Commission’s Standard Contractual Clauses and/or the EU-U.S. Data Privacy Framework, as applicable to each provider.',
        },
      ],
    },
    {
      id: 'retention',
      title: '11. Data retention',
      blocks: [
        {
          t: 'ul',
          items: [
            '<strong>Account data</strong> is kept while your account exists.',
            '<strong>AI metering records</strong> are kept while your account exists, for quota enforcement and abuse prevention.',
            '<strong>Cloud data (ciphertext)</strong> is kept until you delete it or delete your account. If your subscription lapses, you can still download and delete your cloud data.',
            'To <strong>delete your account and all associated server data</strong>, contact us at the address above and we will remove it without undue delay. (Self-serve account deletion in the app is planned.)',
          ],
        },
        {
          t: 'p',
          html: 'Everything stored locally on your device is yours to keep or delete at any time — notes are plain Markdown files.',
        },
      ],
    },
    {
      id: 'rights',
      title: '12. Your rights',
      blocks: [
        {
          t: 'p',
          html: 'Under the GDPR you can ask us for access to, rectification or erasure of your personal data, restriction of or objection to its processing, and portability. Portability of your notes is built-in: they are plain Markdown files on your own disk, and cloud data can be downloaded from the app at any time.',
        },
        {
          t: 'p',
          html: 'To exercise any right, email <strong>yago.igle@gmail.com</strong>. You also have the right to lodge a complaint with your supervisory authority — in Spain, the Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener">aepd.es</a>).',
        },
      ],
    },
    {
      id: 'children',
      title: '13. Children',
      blocks: [
        {
          t: 'p',
          html: 'NoteFlow’s online services are not directed at children under 14, and we do not knowingly process their data. If you believe a child has created an account, contact us and we will delete it.',
        },
      ],
    },
    {
      id: 'changes',
      title: '14. Changes to this policy',
      blocks: [
        {
          t: 'p',
          html: 'If this policy changes, we will update the date at the top and, for material changes affecting account holders, give notice in the app or by email.',
        },
      ],
    },
    {
      id: 'contact',
      title: '15. Contact',
      blocks: [{ t: 'p', html: '<strong>yago.igle@gmail.com</strong>' }],
    },
  ],
};
