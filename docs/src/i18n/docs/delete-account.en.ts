// English copy for the /delete-account page: the public "how to delete your account"
// page Google Play requires for apps that create accounts (the URL goes in the Play
// Console's Data safety form, next to the privacy policy). Same LegalContent shape and
// renderer as /privacy. The facts here mirror /privacy §14 (`deletion`) and what the
// delete-account Edge Function does (supabase/functions/delete-account) — keep the
// three in sync. The in-app path must match the Android app's labels (Settings →
// Subscription → Delete account in noteflow-mobile's src/i18n/en/settings.ts).
import type { LegalContent } from './legal';

export const deleteAccountEn: LegalContent = {
  meta: {
    title: 'Delete your account — NoteFlow',
    description:
      'How to delete your NoteFlow Account — in the NoteFlow Android app or by email — and what is deleted and what is kept: your account and NoteFlow Cloud data are erased and any subscription is cancelled; the notes on your devices stay yours.',
  },

  hero: {
    kicker: 'NoteFlow · Account',
    h1: 'Delete your<br />account',
    tagline: 'Last updated: November 12, 2026',
  },

  summary: {
    title: 'In short',
    html: 'You can delete your NoteFlow Account at any time, from the <strong>NoteFlow Android app</strong> or <strong>by email</strong>. Deleting it cancels any active subscription and permanently erases your account and your NoteFlow Cloud data from our servers. <strong>The notes on your devices are not touched.</strong> You don’t need an account to use NoteFlow — if you never signed in, there is nothing to delete.',
  },

  toc: [
    { id: 'in-app', label: 'In the Android app' },
    { id: 'email', label: 'By email' },
    { id: 'deleted', label: 'What is deleted' },
    { id: 'kept', label: 'What is kept' },
  ],

  sections: [
    {
      id: 'in-app',
      title: '1. Delete it in the Android app',
      blocks: [
        {
          t: 'ol',
          items: [
            'Open <strong>NoteFlow</strong> on your Android device.',
            'Go to <strong>Settings → Subscription</strong>. If you are not signed in, sign in with your account’s email address (we send you a one-time code).',
            'Tap <strong>Delete account</strong> and confirm.',
          ],
        },
        {
          t: 'p',
          html: 'Deletion happens <strong>immediately</strong> and you are signed out on that device. It cannot be undone. If a subscription cannot be cancelled at that moment, <strong>nothing is deleted</strong> and the app shows an error: try again a little later, or write to us.',
        },
      ],
    },
    {
      id: 'email',
      title: '2. Ask us by email',
      blocks: [
        {
          t: 'p',
          html: 'If you use the desktop app, no longer have the Android app or cannot sign in, email <strong>yago.igle@gmail.com</strong> with the subject “Delete my NoteFlow account”, <strong>from the email address of your account</strong>. We will confirm the request comes from you and delete the account as described below <strong>within 30 days</strong>, and let you know when it is done.',
        },
      ],
    },
    {
      id: 'deleted',
      title: '3. What is deleted',
      blocks: [
        {
          t: 'ul',
          items: [
            'Your <strong>account</strong>: email address and user ID.',
            'Your <strong>NoteFlow Cloud data</strong>: your encrypted notes and the encrypted keys that protect them.',
            'Your <strong>NoteFlow AI usage records</strong> (metering data) and your <strong>subscription records</strong>.',
            'Your <strong>subscription</strong> is <strong>cancelled</strong> first, so you are not charged again.',
          ],
        },
        {
          t: 'p',
          html: 'This data is deleted from our servers right away (immediately in the app; once your email request is processed).',
        },
      ],
    },
    {
      id: 'kept',
      title: '4. What is kept',
      blocks: [
        {
          t: 'ul',
          items: [
            '<strong>The notes on your devices</strong>: they are local files that we never had, so they stay on your phone and computer (as does any GitHub repository you sync with). Uninstall the app or delete the files if you want them gone.',
            '<strong>Feedback and reports of AI answers</strong> you sent from the apps are kept, <strong>no longer linked to your account</strong>. Ask us by email if you want them deleted too.',
            '<strong>Payment records</strong>: Lemon Squeezy, our Merchant of Record, keeps the records of past transactions it is legally required to keep (for example, for tax purposes), under its own privacy policy.',
            '<strong>Security and service logs</strong> of our infrastructure provider (sign-in events, IP addresses, timestamps) are deleted automatically within 90 days.',
          ],
        },
        {
          t: 'p',
          html: 'More details in our <a href="%PRIVACY_URL%#deletion">privacy policy</a>. Questions: <strong>yago.igle@gmail.com</strong>.',
        },
      ],
    },
  ],
};
