// English copy for the /terms legal page. The body text is the canonical legal
// text — edit deliberately (and keep terms.es.ts in sync). Rendered by
// LegalPage.astro via set:html.
import type { LegalContent } from './legal';

export const termsEn: LegalContent = {
  meta: {
    title: 'Terms of Service — NoteFlow',
    description:
      'The terms governing the optional NoteFlow online services: the NoteFlow Account and the paid NoteFlow AI and NoteFlow Cloud plans. The app itself is free and open-source software, governed by its own license (GPL-3.0-or-later).',
  },

  hero: {
    kicker: 'NoteFlow · Legal',
    h1: 'Terms of<br />Service',
    tagline: 'Last updated: October 19, 2026',
  },

  summary: {
    title: 'Summary',
    html: 'The NoteFlow app is free and open-source software — the software itself is governed by its license (GNU General Public License v3.0 or later), not by these terms. These terms govern the <strong>optional online services</strong>: the NoteFlow Account and the paid NoteFlow AI and NoteFlow Cloud plans. Plans are sold through Lemon Squeezy, renew automatically and can be cancelled at any time. One thing deserves emphasis: <strong>NoteFlow Cloud always encrypts your notes, and offers an optional private mode with end-to-end encryption — if you turn it on and lose both your passphrase and your recovery code, nobody (including us) can recover your notes.</strong>',
  },

  toc: [
    { id: 'scope', label: 'What these terms cover' },
    { id: 'account', label: 'Your account' },
    { id: 'billing', label: 'Billing & cancellation' },
    { id: 'ai', label: 'NoteFlow AI' },
    { id: 'cloud', label: 'NoteFlow Cloud' },
    { id: 'content', label: 'Your content' },
    { id: 'free', label: 'Free & third-party' },
    { id: 'availability', label: 'Availability' },
    { id: 'liability', label: 'Liability' },
    { id: 'termination', label: 'Termination' },
    { id: 'law', label: 'Governing law' },
    { id: 'changes', label: 'Changes' },
    { id: 'contact', label: 'Contact' },
  ],

  sections: [
    {
      id: 'scope',
      title: '1. What these terms cover',
      blocks: [
        {
          t: 'p',
          html: 'These terms are an agreement between you and NoteFlow, operated by an independent developer based in Spain (“we”), and they apply to the <strong>NoteFlow online services</strong>: the NoteFlow Account, NoteFlow AI and NoteFlow Cloud.',
        },
        {
          t: 'p',
          html: 'They do <strong>not</strong> cover:',
        },
        {
          t: 'ul',
          items: [
            '<strong>The desktop app’s code</strong>, which is free and open-source software licensed separately under the <a href="https://github.com/yagoid/noteflow/blob/main/LICENSE" target="_blank" rel="noopener">GNU General Public License v3.0 or later</a> (GPL-3.0-or-later).',
            '<strong>Free third-party integrations</strong> (GitHub Sync, AI with your own API key or local models), which are agreements between you and those third parties (see section 7).',
          ],
        },
        {
          t: 'p',
          html: 'By creating an account or using the services, you accept these terms.',
        },
      ],
    },
    {
      id: 'account',
      title: '2. Your account',
      blocks: [
        {
          t: 'ul',
          items: [
            'You must be at least <strong>14 years old</strong> to create an account.',
            'You must provide a valid email address that you control — it is how you sign in and how we can reach you.',
            'You are responsible for keeping access to your email and your device secure, and — if you enable NoteFlow Cloud’s private (end-to-end encrypted) mode — for safeguarding your passphrase and recovery code.',
            'We may suspend or terminate accounts that breach these terms, abuse the services, or create security risks.',
          ],
        },
      ],
    },
    {
      id: 'billing',
      title: '3. Subscriptions, billing and cancellation',
      blocks: [
        {
          t: 'ul',
          items: [
            'Paid plans are sold by <strong>Lemon Squeezy as Merchant of Record</strong>: Lemon Squeezy is the seller of the subscription, and its <a href="https://www.lemonsqueezy.com/terms" target="_blank" rel="noopener">terms</a> and refund policy apply to the purchase, alongside your statutory rights (including EU consumer withdrawal rights).',
            'Prices include VAT where applicable. The price and billing period (monthly or annual) are shown at checkout; Lemon Squeezy, as Merchant of Record, collects and remits the VAT.',
            'Subscriptions <strong>renew automatically</strong> until cancelled. You can cancel at any time from the customer portal; your plan then remains active until the end of the period already paid, and is not renewed.',
            'If a payment fails, features of the affected plan may be suspended until payment is resolved.',
          ],
        },
      ],
    },
    {
      id: 'ai',
      title: '4. NoteFlow AI',
      blocks: [
        {
          t: 'ul',
          items: [
            'The plan includes a <strong>monthly usage quota measured in tokens</strong> (currently 3 million tokens per month). Unused quota does not roll over. We may adjust the quota or the list of available models over time; material reductions will be announced in advance.',
            'Requests are routed to third-party AI models. <strong>AI output is generated by those models and may be inaccurate, incomplete or inappropriate — verify it before relying on it.</strong> You are responsible for how you use the output.',
            'Fair and acceptable use: you may not use the service for illegal content or activities, to harm others, to attempt to circumvent quotas, model restrictions or authentication, or to access the proxy outside the app. The acceptable-use policies of the upstream model providers also apply.',
            'You keep any rights you have in your prompts and, to the extent permitted by the upstream providers, in the output.',
          ],
        },
      ],
    },
    {
      id: 'cloud',
      title: '5. NoteFlow Cloud',
      blocks: [
        {
          t: 'ul',
          items: [
            'NoteFlow Cloud always <strong>encrypts your notes</strong>, in transit and at rest, and offers two modes. In the <strong>default (managed) mode</strong> we hold the encryption key so that sync works with nothing for you to remember; this means we are technically able to access your note content, which we do only where strictly necessary to operate the service. In the optional <strong>private (end-to-end encrypted) mode</strong>, the key is protected by a passphrase only you know and we only ever hold ciphertext we cannot read.',
            '<strong>In private mode, you are solely responsible for your passphrase and recovery code.</strong> We cannot reset them. Losing both means your cloud data is permanently unrecoverable. The app warns you about this when you turn on private mode; please take it seriously.',
            'If your subscription ends, uploading changes stops, but you <strong>keep the ability to download and delete your cloud data</strong>.',
            'We may delete the cloud data of accounts whose subscription has lapsed after a long period of inactivity, with at least 6 months since the subscription ended and prior notice by email.',
            'The service includes fair-use storage limits appropriate for personal notes; we may introduce specific limits with notice if needed to keep the service sustainable.',
            'Sync is a convenience, not a backup guarantee — keep local copies of anything critical (your notes are always on your own disk as Markdown files).',
          ],
        },
      ],
    },
    {
      id: 'content',
      title: '6. Your content',
      blocks: [
        {
          t: 'p',
          html: 'Your notes are yours. We claim no ownership of, and no license over, your content beyond the strictly technical operations needed to provide the services (storing and transmitting encrypted data, and — for AI requests — forwarding the excerpts you send to the model). You are responsible for your content being lawful.',
        },
      ],
    },
    {
      id: 'free',
      title: '7. Free features and third-party services',
      blocks: [
        {
          t: 'p',
          html: 'GitHub Sync, AI providers used with your own key, and local models are integrations with services that have their own terms and privacy policies, which you accept directly with those providers. These integrations are provided as-is, and we are not a party to your relationship with those services.',
        },
      ],
    },
    {
      id: 'availability',
      title: '8. Availability and changes to the services',
      blocks: [
        {
          t: 'p',
          html: 'NoteFlow is built and operated by an independent developer. The services are provided <strong>without an uptime guarantee or SLA</strong>. We may modify features over time. If we ever discontinue a paid service, we will give at least <strong>30 days’ notice</strong> and any remaining prepaid period will be refunded pro-rata through the payment provider.',
        },
      ],
    },
    {
      id: 'liability',
      title: '9. Disclaimers and limitation of liability',
      blocks: [
        {
          t: 'p',
          html: 'The services are provided “as is” and “as available”. To the maximum extent permitted by law, our total liability arising from the services is limited to the amounts you paid for them in the 12 months preceding the claim. Nothing in these terms limits liability that cannot legally be limited (such as liability for willful misconduct or gross negligence) or affects the mandatory statutory rights you have as a consumer.',
        },
      ],
    },
    {
      id: 'termination',
      title: '10. Termination',
      blocks: [
        {
          t: 'p',
          html: 'You can stop using the services and cancel your subscription at any time. You may also request deletion of your account and its server data by contacting us. We may terminate or suspend the services for accounts in breach of these terms, with prior notice where practicable. After account closure, the data-access rules of section 5 apply to any remaining cloud data.',
        },
      ],
    },
    {
      id: 'law',
      title: '11. Governing law',
      blocks: [
        {
          t: 'p',
          html: 'These terms are governed by Spanish law. If you are a consumer in the European Union, you also benefit from the mandatory consumer-protection rules of your country of residence, and you may bring disputes before the courts of your own domicile.',
        },
      ],
    },
    {
      id: 'changes',
      title: '12. Changes to these terms',
      blocks: [
        {
          t: 'p',
          html: 'We may update these terms as the services evolve. For material changes we will give at least 30 days’ notice in the app or by email; continuing to use the services after the changes take effect means you accept them. If you do not agree, cancel your subscription before the new terms apply.',
        },
      ],
    },
    {
      id: 'contact',
      title: '13. Contact',
      blocks: [{ t: 'p', html: '<strong>yago.igle@gmail.com</strong>' }],
    },
  ],
};
