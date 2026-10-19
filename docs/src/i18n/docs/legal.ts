// Shared shape of the legal pages (/privacy, /terms, /legal-notice). Unlike the other
// docs pages (where the EN dict defines the shape via `typeof`), every legal dict is
// annotated with this explicit interface: the pages share one renderer (LegalPage.astro),
// so the shape must be identical across pages, not just across locales.
// The `t` discriminator mirrors the NoteBlock pattern of the landing (types.ts).

export type LegalBlock =
  | { t: 'p'; html: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] };

export interface LegalSection {
  /** Anchor id — must match the corresponding `toc` entry. */
  id: string;
  /** Numbered heading, verbatim from the legal text ("1. Who we are"). */
  title: string;
  blocks: LegalBlock[];
}

export interface LegalContent {
  meta: { title: string; description: string };
  hero: { kicker: string; h1: string; tagline: string };
  /** Highlighted summary box rendered above the first section. */
  summary: { title: string; html: string };
  toc: { id: string; label: string }[];
  sections: LegalSection[];
}
