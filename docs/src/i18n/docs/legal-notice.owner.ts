// Identification data of the website owner for the /legal-notice page (art. 10 LSSI-CE).
// SINGLE source for both locales: legal-notice.en.ts and legal-notice.es.ts read it.
//
// ▶ Fill in `name`, `nif` and `address` below. While any of them is empty or still contains
//   "[[" or "]]" anywhere (a placeholder or a leftover of one), the page is NOT generated
//   and its footer links are hidden (the build only warns): the Pages workflow deploys
//   docs/ on every push to main, so failing the build would block the whole website
//   instead of just this page.
export const OWNER = {
  name: '[[NOMBRE COMPLETO]]',
  nif: '[[NIF]]',
  address: '[[DIRECCIÓN POSTAL COMPLETA]]',
  email: 'yago.igle@gmail.com',
  website: 'https://yagoid.github.io/noteflow',
};

const pending = (['name', 'nif', 'address'] as const).filter((k) => {
  const v = OWNER[k].trim();
  return !v || /\[\[|\]\]/.test(v);
});

/** True once the owner data is filled in — gates the page and its footer links. */
export const legalNoticeReady = pending.length === 0;

if (!legalNoticeReady) {
  console.warn(
    `[legal-notice] Owner data missing or still a placeholder (${pending.join(', ')}) in ` +
      'docs/src/i18n/docs/legal-notice.owner.ts — /legal-notice is not generated and its footer links are hidden.',
  );
}

/** OWNER.name escaped for the set:html prose of the legal dicts (privacy §1). */
export const ownerNameHtml = OWNER.name
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** getStaticPaths for the gated route files (src/pages/{,es/}legal-notice/[...path].astro):
 *  one page at the folder root when the data is ready, none otherwise. */
export function legalNoticePaths() {
  return legalNoticeReady ? [{ params: { path: undefined } }] : [];
}
