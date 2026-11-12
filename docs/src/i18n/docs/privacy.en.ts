// English copy for the /privacy legal page. The body text is the canonical legal
// text — edit deliberately (and keep privacy.es.ts in sync). Rendered by
// LegalPage.astro via set:html. Since 2026-11-12 it covers BOTH the desktop app and
// the Android app (it replaces the old standalone public/mobile-privacy-policy.html,
// now a redirect here). %DELETE_ACCOUNT_URL% links the /delete-account page. The
// controller paragraph of §1 names the owner and links to the legal notice
// (%LEGAL_NOTICE_URL%) only once legal-notice.owner.ts is filled in.
// The id `feedback` is linked from the desktop app (Settings → About) and the id
// `deletion` from the /delete-account page — do not rename them.
import type { LegalContent } from './legal';
import { OWNER, legalNoticeReady, ownerNameHtml } from './legal-notice.owner';

const controllerHtml = legalNoticeReady
  ? `The controller of your personal data is <strong>${ownerNameHtml}</strong>, the owner of NoteFlow, whose full identification details are listed in the <a href="%LEGAL_NOTICE_URL%">Legal Notice</a>.`
  : `The controller of your personal data is the independent developer who operates NoteFlow, contactable at <strong>${OWNER.email}</strong>.`;

export const privacyEn: LegalContent = {
  meta: {
    title: 'Privacy Policy — NoteFlow',
    description:
      'How NoteFlow handles data in its desktop and Android apps: local-first with no telemetry, and the optional services (NoteFlow Account, NoteFlow AI, NoteFlow Cloud) process only the minimum described here — with encrypted cloud sync, optional end-to-end encryption and in-app account deletion.',
  },

  hero: {
    kicker: 'NoteFlow · Legal',
    h1: 'Privacy<br />Policy',
    tagline: 'Last updated: November 12, 2026',
  },

  summary: {
    title: 'Summary',
    html: 'NoteFlow is local-first. Your notes are plain Markdown files stored on your own device, and neither the desktop app nor the Android app contains telemetry, analytics or ads. No account is required to use them. If you choose to create a NoteFlow Account and use the optional managed services, we process the minimum data described below — and NoteFlow Cloud always encrypts your notes, with an optional end-to-end encrypted mode in which we cannot read them even when they are stored on our servers. You can delete your account at any time, from the Android app or by email.',
  },

  toc: [
    { id: 'controller', label: 'Who we are' },
    { id: 'local-first', label: 'Local-first by default' },
    { id: 'android', label: 'The Android app' },
    { id: 'optional', label: 'Optional integrations' },
    { id: 'account', label: 'NoteFlow Account' },
    { id: 'payments', label: 'Payments' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'feedback', label: 'Feedback and AI reports' },
    { id: 'website', label: 'Website' },
    { id: 'processors', label: 'Service providers' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'retention', label: 'Retention' },
    { id: 'deletion', label: 'Deleting your account' },
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
          html: 'NoteFlow is a note-taking application for desktop (Windows, macOS and Linux) and Android, a public website and a set of optional online services (NoteFlow Account, NoteFlow AI and NoteFlow Cloud) developed and operated by an independent developer based in Spain (“NoteFlow”, “we”).',
        },
        { t: 'p', html: controllerHtml },
        {
          t: 'p',
          html: 'For anything related to this policy or your data, contact: <strong>yago.igle@gmail.com</strong>.',
        },
        {
          t: 'p',
          html: 'This policy covers <strong>both the desktop app and the NoteFlow Android app</strong> (it replaces the earlier, separate privacy policy of the mobile app). Where the two apps behave differently, the difference is stated.',
        },
      ],
    },
    {
      id: 'local-first',
      title: '2. The apps by default: your data stays on your device',
      blocks: [
        {
          t: 'p',
          html: 'Out of the box, neither app collects <strong>any personal data at all</strong>:',
        },
        {
          t: 'ul',
          items: [
            'Notes, groups, settings, templates, the AI chat history and the AI search index are stored <strong>locally on your device</strong> as files and a local database.',
            'There is <strong>no telemetry, no analytics, no crash reporting and no advertising</strong> in either app.',
            'Note-level encryption happens entirely on your device; encrypted notes can only be opened with your password.',
            'Nothing is transmitted anywhere unless you explicitly enable one of the optional features described below, or choose to send us feedback or report an AI answer from the app (section 9).',
          ],
        },
      ],
    },
    {
      id: 'android',
      title: '3. The Android app: device features and permissions',
      blocks: [
        {
          t: 'p',
          html: 'The Android app uses these device features. Each one works <strong>on your device</strong>, and none of them sends data to us:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Local storage.</strong> Your notes are Markdown files in the app’s private storage, with a local search database and your settings next to them. Sign-in tokens, API keys and sync credentials are kept in Android’s encrypted storage. The AI chat history stays on the device and is never synced.',
            '<strong>Camera and photos.</strong> Only when you choose to insert an image into a note: you either take a photo with the camera or pick one with Android’s photo picker. The image is resized and saved <strong>inside that note</strong>. It is not uploaded anywhere — unless you sync the note (GitHub Sync or NoteFlow Cloud), in which case it travels as part of the note. The camera permission is requested only the first time you take a photo.',
            '<strong>Notifications (task reminders).</strong> When you set a reminder on a task, the app schedules a <strong>local</strong> notification with Android. There is no push server and no notification token: reminders never pass through us. The notification shows the note title and the task text, so it may be visible on your lock screen depending on your Android settings. Encrypted notes never schedule reminders. The notification permission is requested when you first set a reminder.',
            '<strong>Home-screen widgets.</strong> If you add a NoteFlow widget, it shows the note or list you choose — titles and section content — on your home screen, where anyone who can see your screen can read it. Widgets are drawn on the device from your local notes. Encrypted notes only show their title and a lock.',
            '<strong>Import, export and sharing.</strong> Files you import come from Android’s file picker, and anything you share goes, through Android’s share sheet, only to the app you pick.',
            '<strong>Android backup.</strong> The app allows Android’s system backup. If backup is turned on for your device, Android may include the app’s local data (such as your notes and settings) in your device backup, under Google’s terms; the encrypted storage holding your tokens and keys is excluded.',
          ],
        },
        {
          t: 'table',
          head: ['Android permission', 'Why it is used'],
          rows: [
            ['Camera', 'Taking a photo to insert into a note (only when you choose to).'],
            ['Notifications', 'Showing the task reminders you set.'],
            ['Run at startup', 'Re-scheduling your reminders after the device restarts.'],
            ['Internet', 'Only for the optional features: NoteFlow Account, NoteFlow AI, NoteFlow Cloud, GitHub Sync, AI providers you configure, and sending feedback or AI reports.'],
            ['Storage (Android 12 and below)', 'Importing and exporting note files you choose.'],
            ['Vibration', 'Haptic feedback on some interactions.'],
          ],
        },
        {
          t: 'p',
          html: 'You can revoke any permission at any time in Android’s settings; the related feature simply stops working. The app is distributed through <strong>Google Play</strong>, which processes data about your installation under Google’s own <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">privacy policy</a>.',
        },
      ],
    },
    {
      id: 'optional',
      title: '4. Optional integrations you control',
      blocks: [
        {
          t: 'p',
          html: 'These features are opt-in, and each one talks to a third party <strong>directly from your device</strong> — NoteFlow has no server in the middle:',
        },
        {
          t: 'ul',
          items: [
            '<strong>GitHub Sync (free).</strong> Your notes are pushed to and pulled from a private GitHub repository that you own. Your GitHub token is stored encrypted on your device and is only sent to GitHub’s API. GitHub’s <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">privacy statement</a> applies to the data in your repository.',
            '<strong>AI with your own key or local models (free).</strong> If you configure an AI provider with your own API key, your chat messages plus the relevant content of your notes (retrieved locally, or read by the assistant’s tools when it needs to open a note) are sent directly from your device to that provider, under that provider’s privacy policy. With a local provider (such as Ollama), nothing leaves your machine.',
            'In all AI features: sections you mark as <strong>“Hide from AI”</strong> and <strong>encrypted notes</strong> are excluded from the AI search index and from the assistant’s tools, and are therefore never included in anything sent to any AI provider. The search index itself is computed and stored locally (semantic embeddings on desktop, a full-text index on Android).',
          ],
        },
      ],
    },
    {
      id: 'account',
      title: '5. NoteFlow Account',
      blocks: [
        {
          t: 'p',
          html: 'Creating an account is optional and only needed for the managed services. You can sign in to the same account from the desktop app and the Android app. When you create one, we process:',
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
          html: 'This data is stored with <strong>Supabase</strong>, our backend provider (see section 11). You can delete your account at any time (see section 14).',
        },
      ],
    },
    {
      id: 'payments',
      title: '6. Payments',
      blocks: [
        {
          t: 'p',
          html: 'Paid plans are sold through <strong>Lemon Squeezy</strong>, acting as <strong>Merchant of Record</strong>: Lemon Squeezy is the legal seller, and it handles checkout, payment processing, invoicing, taxes/VAT and refunds. <strong>We never receive your card or payment details.</strong> From Lemon Squeezy we only receive events describing your subscription status (product, state, renewal date), linked to your account. The Android app does not process any payments.',
        },
        {
          t: 'p',
          html: 'Lemon Squeezy’s <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener">privacy policy</a> applies to the checkout and payment process.',
        },
      ],
    },
    {
      id: 'ai',
      title: '7. NoteFlow AI (managed AI plan)',
      blocks: [
        {
          t: 'p',
          html: 'When you use the managed AI plan, from either app, each request works like this:',
        },
        {
          t: 'ul',
          items: [
            'Your chat message, plus the relevant content of your notes retrieved <strong>locally on your device</strong>, are sent over TLS to our AI proxy, which forwards them to <strong>OpenRouter</strong>, which routes them to the AI model provider you selected. This is <strong>exactly the same data</strong> that would travel if you used that provider with your own API key.',
            '<strong>We do not log or store the content of your prompts or the model’s responses on our servers.</strong> The only thing we record per request is metering data: your user ID, the model used, token counts, the request’s cost as reported by OpenRouter, OpenRouter’s generation ID and a timestamp — needed to enforce the monthly usage allowance, which is measured by that cost. (An answer you choose to report reaches us only as described in section 9.)',
            'OpenRouter and the underlying model provider process the request under their own privacy policies (<a href="https://openrouter.ai/privacy" target="_blank" rel="noopener">OpenRouter privacy policy</a>). Our OpenRouter configuration does not opt in to prompt logging or training programs.',
            'As always, “Hide from AI” sections and encrypted notes never leave your device.',
            'NoteFlow AI is <strong>independent from NoteFlow Cloud</strong>: using the AI plan does not upload or store your notes on our servers.',
          ],
        },
      ],
    },
    {
      id: 'cloud',
      title: '8. NoteFlow Cloud (encrypted sync)',
      blocks: [
        {
          t: 'p',
          html: 'NoteFlow Cloud syncs your notes between your desktop and Android devices. Your notes are <strong>encrypted on your device</strong> (AES-256-GCM) before they are uploaded. You choose how much trust to place in us, through one of two modes:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Managed mode (the default).</strong> The key that protects your notes is stored on the server wrapped by a key we hold. This lets sync work automatically with nothing for you to remember, but it means we are <strong>technically able to decrypt your note content</strong>. We access it only where strictly necessary to operate the service, never to read your notes for any other purpose.',
            '<strong>Private mode (optional, end-to-end encrypted).</strong> If you enable it, the key is protected by a <strong>passphrase only you know</strong>, and the server only ever stores <em>wrapped</em> keys it cannot open. In this mode <strong>we cannot read your notes</strong>, and for the same reason <strong>we cannot reset your passphrase</strong>: if you lose both your passphrase and your recovery code, your cloud data is permanently unrecoverable — by anyone.',
            'In both modes, the server stores your note contents (including any images inside them), file paths and folder structure only as <strong>ciphertext</strong>, alongside opaque path identifiers and modification timestamps.',
            'The sync metadata we can see is limited to technical data: row timestamps, approximate sizes, and request logs (IP, timestamps) at our infrastructure provider.',
          ],
        },
        {
          t: 'p',
          html: 'Cloud data is stored with <strong>Supabase</strong> (see section 11).',
        },
      ],
    },
    {
      id: 'feedback',
      title: '9. Feedback and AI-answer reports from the apps',
      blocks: [
        {
          t: 'p',
          html: '<strong>Feedback (desktop app).</strong> The desktop app has a <strong>Send feedback</strong> form (Settings → About) for reporting bugs or making suggestions. It is entirely optional, works <strong>with or without an account</strong>, and nothing is sent until you press <strong>Send</strong>. Each submission stores:',
        },
        {
          t: 'ul',
          items: [
            'The <strong>type</strong> you pick (bug, suggestion or other) and the <strong>message</strong> you write.',
            'An <strong>email address</strong>, only if you type one so we can reply.',
            'Only if you tick <strong>“Include app and system version”</strong> (unticked by default): the app version, operating system and CPU architecture, OS version and interface language.',
            'If you are signed in to a NoteFlow Account, your <strong>user ID</strong>, linking the submission to your account. If you are not signed in, it is sent without any account link.',
            'It <strong>never includes your notes</strong> or any other content from your device. As with any request, our infrastructure provider keeps standard service logs (IP address, timestamps).',
          ],
        },
        {
          t: 'p',
          html: '<strong>Reporting an AI answer (Android app).</strong> In the Android app’s AI assistant you can report any answer you find offensive, harmful or wrong. Nothing is sent until you confirm the report. Each report stores:',
        },
        {
          t: 'ul',
          items: [
            'The <strong>text of the reported answer</strong> (shortened if very long), the <strong>reason</strong> you optionally write, and which AI provider and model produced it.',
            'The <strong>app version</strong> and the platform (Android).',
            'If you are signed in to a NoteFlow Account, your <strong>user ID</strong>; otherwise it is sent without any account link.',
            'It <strong>never includes your notes, the rest of the conversation or a contact address</strong>. Note, however, that an AI answer can quote content from your notes: review the answer before you report it.',
          ],
        },
        {
          t: 'p',
          html: 'Purposes and legal bases (GDPR): reading and answering your feedback and reviewing reported AI answers — your consent, given by choosing to send them and what to include (art. 6(1)(a)) — and using them to fix bugs, improve NoteFlow and keep its AI features safe (legitimate interest, art. 6(1)(f)). Feedback and reports are stored with <strong>Supabase</strong> (see section 11) and only we can access them.',
        },
      ],
    },
    {
      id: 'website',
      title: '10. Website',
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
          html: 'Downloads of the desktop app are served from GitHub Releases.',
        },
      ],
    },
    {
      id: 'processors',
      title: '11. Service providers (processors and recipients)',
      blocks: [
        {
          t: 'table',
          head: ['Provider', 'Role', 'What it processes'],
          rows: [
            [
              'Supabase',
              'Backend infrastructure (authentication, database, functions)',
              'Account email, subscription status, AI metering, encrypted cloud data, feedback and AI-answer reports sent from the apps, service logs',
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
              'Website hosting, desktop app downloads; optional GitHub Sync (your own repository)',
              'Web server logs; your synced notes if you enable GitHub Sync',
            ],
            [
              'Google',
              'Website analytics and fonts; Google Play distribution of the Android app (independent controller); Android backup if you enable it',
              'Website: cookies, IP, usage. Android: installation data under Google’s terms; your device backup',
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
      title: '12. International transfers',
      blocks: [
        {
          t: 'p',
          html: 'Some of the providers above process data in the United States or other countries outside the EEA. Where that happens, transfers rely on the European Commission’s Standard Contractual Clauses and/or the EU-U.S. Data Privacy Framework, as applicable to each provider.',
        },
      ],
    },
    {
      id: 'retention',
      title: '13. Data retention',
      blocks: [
        {
          t: 'ul',
          items: [
            '<strong>Account data</strong> is kept while your account exists.',
            '<strong>AI metering records</strong> are kept while your account exists, for quota enforcement and abuse prevention.',
            '<strong>Cloud data (ciphertext)</strong> is kept until you delete it or delete your account. If your subscription lapses, you can still download and delete your cloud data.',
            '<strong>Feedback and AI-answer reports</strong> are kept until they have been handled and while they remain useful to improve NoteFlow, and are deleted on request at any time. If you delete your account, they are unlinked from it; ask us if you also want them deleted.',
            '<strong>Security and service logs</strong> kept by our infrastructure provider (sign-in events, IP addresses, timestamps) are deleted automatically after a limited period, at most 90 days.',
          ],
        },
        {
          t: 'p',
          html: 'Everything stored locally on your device is yours to keep or delete at any time — notes are plain Markdown files. Uninstalling the Android app deletes its local data from the device.',
        },
      ],
    },
    {
      id: 'deletion',
      title: '14. Deleting your account',
      blocks: [
        {
          t: 'p',
          html: 'You can delete your NoteFlow Account and its server data at any time, in either of these ways (step-by-step instructions on the <a href="%DELETE_ACCOUNT_URL%">account deletion page</a>):',
        },
        {
          t: 'ul',
          items: [
            '<strong>In the Android app:</strong> Settings → Subscription → <strong>Delete account</strong> (you need to be signed in). Deletion happens immediately.',
            '<strong>By email:</strong> write to <strong>yago.igle@gmail.com</strong> from the address of your account. We will confirm the request comes from you and complete it within 30 days.',
          ],
        },
        {
          t: 'p',
          html: 'Deleting your account:',
        },
        {
          t: 'ul',
          items: [
            '<strong>Cancels any active subscription</strong>, so you are not charged again. If a subscription cannot be cancelled at that moment, nothing is deleted and the app asks you to try again.',
            '<strong>Permanently deletes</strong> your account (email address and user ID), your NoteFlow Cloud data and keys, your AI metering records and your subscription records from our servers. This cannot be undone.',
            '<strong>Does not delete the notes on your devices</strong>: they are local files that we never had, and they stay where they are (as does any GitHub repository you sync with).',
            'Keeps your feedback and AI-answer reports, <strong>unlinked from your account</strong>; ask us if you want them deleted too.',
            'Lemon Squeezy, as Merchant of Record, keeps its own records of past transactions for as long as the law requires, under its privacy policy. Security and service logs expire as described in section 13.',
          ],
        },
      ],
    },
    {
      id: 'rights',
      title: '15. Your rights',
      blocks: [
        {
          t: 'p',
          html: 'Under the GDPR you can ask us for access to, rectification or erasure of your personal data, restriction of or objection to its processing, and portability. Portability of your notes is built-in: they are plain Markdown files on your own device, and cloud data can be downloaded from the app at any time.',
        },
        {
          t: 'p',
          html: 'To exercise any right, email <strong>yago.igle@gmail.com</strong>. You also have the right to lodge a complaint with your supervisory authority — in Spain, the Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener">aepd.es</a>).',
        },
      ],
    },
    {
      id: 'children',
      title: '16. Children',
      blocks: [
        {
          t: 'p',
          html: 'NoteFlow’s online services are not directed at children under 14, and we do not knowingly process their data. If you believe a child has created an account, contact us and we will delete it.',
        },
      ],
    },
    {
      id: 'changes',
      title: '17. Changes to this policy',
      blocks: [
        {
          t: 'p',
          html: 'If this policy changes, we will update the date at the top and, for material changes affecting account holders, give notice in the app or by email.',
        },
      ],
    },
    {
      id: 'contact',
      title: '18. Contact',
      blocks: [{ t: 'p', html: '<strong>yago.igle@gmail.com</strong>' }],
    },
  ],
};
