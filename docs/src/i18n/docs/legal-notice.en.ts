// English copy for the /legal-notice page (Spanish LSSI-CE art. 10 "aviso legal"). The
// body text is the canonical legal text — edit deliberately (and keep legal-notice.es.ts
// in sync). The owner's identification data lives ONCE in legal-notice.owner.ts. Rendered
// by LegalPage.astro: %PRIVACY_URL% / %TERMS_URL% are filled there with base-aware links;
// table cells are plain text (escaped), so the owner data needs no HTML escaping.
import type { LegalContent } from './legal';
import { OWNER } from './legal-notice.owner';

const LICENSE_URL = 'https://github.com/yagoid/noteflow/blob/main/LICENSE';

export const legalNoticeEn: LegalContent = {
  meta: {
    title: 'Legal Notice — NoteFlow',
    description:
      'Legal notice of the NoteFlow website: identification of the owner (art. 10 of the Spanish LSSI-CE), purpose of the site, intellectual property, liability and applicable law.',
  },

  hero: {
    kicker: 'NoteFlow · Legal',
    h1: 'Legal<br />Notice',
    tagline: 'Last updated: October 19, 2026',
  },

  summary: {
    title: 'Summary',
    html: 'This website is owned and run by an <strong>independent developer — a self-employed individual based in Spain</strong>, whose identification details are listed in section 1. It informs about NoteFlow, a free and open-source desktop notes app, and its optional NoteFlow AI and NoteFlow Cloud subscriptions. How we handle data is explained in the <a href="%PRIVACY_URL%">Privacy Policy</a>, and the paid services are governed by the <a href="%TERMS_URL%">Terms of Service</a>.',
  },

  toc: [
    { id: 'owner', label: 'Website owner' },
    { id: 'purpose', label: 'Purpose' },
    { id: 'ip', label: 'Intellectual property' },
    { id: 'liability', label: 'Liability & links' },
    { id: 'law', label: 'Applicable law' },
    { id: 'related', label: 'Related policies' },
  ],

  sections: [
    {
      id: 'owner',
      title: '1. Website owner',
      blocks: [
        {
          t: 'p',
          html: 'In compliance with Article 10 of Spanish Law 34/2002 of 11 July on Information Society Services and Electronic Commerce (LSSI-CE), the owner of this website is:',
        },
        {
          t: 'table',
          head: ['Item', 'Details'],
          rows: [
            ['Owner', OWNER.name],
            ['Status', 'Natural person — self-employed independent developer (Spain)'],
            ['Tax ID (NIF)', OWNER.nif],
            ['Address', OWNER.address],
            ['Contact email', OWNER.email],
            ['Website', OWNER.website],
          ],
        },
        {
          t: 'p',
          html: 'As an individual acting as a self-employed professional, the owner is not registered in the Mercantile Registry or in any other public registry for the purposes of Article 10.1.b) of the LSSI-CE, so no registry details apply.',
        },
      ],
    },
    {
      id: 'purpose',
      title: '2. Purpose of the website',
      blocks: [
        {
          t: 'p',
          html: 'This website provides information about <strong>NoteFlow</strong>, a free and open-source desktop notes app, and its documentation, as well as about the <strong>optional NoteFlow AI and NoteFlow Cloud subscriptions</strong>. The app is downloaded from GitHub Releases.',
        },
        {
          t: 'p',
          html: 'Subscriptions are purchased from within the app. Purchases are processed by <strong>Lemon Squeezy as Merchant of Record</strong>: Lemon Squeezy is the seller of the subscription and handles payment, invoicing and taxes. The services themselves are governed by the <a href="%TERMS_URL%">Terms of Service</a>.',
        },
      ],
    },
    {
      id: 'ip',
      title: '3. Intellectual and industrial property',
      blocks: [
        {
          t: 'ul',
          items: [
            `The NoteFlow source code — including the source of this website, which lives in the same repository — is published under the <a href="${LICENSE_URL}" target="_blank" rel="noopener">GNU General Public License v3.0 or later</a> (GPL-3.0-or-later). You may use, study, modify and redistribute it under the terms of that license.`,
            'The <strong>NoteFlow name and logo</strong> identify the project and belong to the owner. The software license covers the code; it does not grant rights to use the NoteFlow name or logo in a way that suggests that a modified version or a third-party product is the official NoteFlow, or that it is endorsed by the owner.',
            'Other trademarks and names mentioned on this website (GitHub, Lemon Squeezy, the AI model providers, etc.) belong to their respective owners and are used only to identify their products.',
          ],
        },
      ],
    },
    {
      id: 'liability',
      title: '4. Liability and external links',
      blocks: [
        {
          t: 'p',
          html: 'The information on this website is provided for informational purposes. The owner makes reasonable efforts to keep it accurate and up to date, but cannot guarantee that it is free of errors or always current, nor that the website will be available without interruptions. To the extent permitted by law, the owner is not liable for damages arising from the use of the information on this website. The app itself is provided under its license, and the paid services under the <a href="%TERMS_URL%">Terms of Service</a>.',
        },
        {
          t: 'p',
          html: 'This website contains links to third-party sites (such as GitHub, Lemon Squeezy or AI model providers). The owner does not control those sites and is not responsible for their content, availability or privacy practices. In accordance with Article 17 of the LSSI-CE, if the owner becomes effectively aware that a linked site contains unlawful content, the link will be removed promptly.',
        },
      ],
    },
    {
      id: 'law',
      title: '5. Applicable law',
      blocks: [
        {
          t: 'p',
          html: 'This legal notice and the use of this website are governed by Spanish law. If you are a consumer in the European Union, this does not deprive you of the protection of the mandatory consumer-protection rules of your country of residence, and you may bring disputes before the courts of your own domicile.',
        },
      ],
    },
    {
      id: 'related',
      title: '6. Related policies',
      blocks: [
        {
          t: 'ul',
          items: [
            '<a href="%PRIVACY_URL%">Privacy Policy</a> — how the app, the optional services and this website handle personal data.',
            '<a href="%TERMS_URL%">Terms of Service</a> — the NoteFlow Account and the paid NoteFlow AI and NoteFlow Cloud plans.',
            'Cookies — this website uses Google Analytics cookies only if you accept them in the consent banner (details in the <a href="%PRIVACY_URL%#website">Privacy Policy</a>). You can change your choice at any time: <a href="%PRIVACY_URL%#website" data-cookie-settings>cookie settings</a>.',
          ],
        },
      ],
    },
  ],
};
