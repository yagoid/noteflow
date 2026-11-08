// Pure logic of the editor's "/" command menu (SlashCommands.ts): how the typed
// query filters the items and how the user's snippets become menu entries. No
// TipTap, no React, no stores — covered by tests/lib/slashItems.test.ts.

import type { Snippet } from '../types'
import { snippetPreviewLine, type SnippetLocale } from './snippets'

export interface SlashMatchable {
  title: string
  /** Extra (untranslated, lowercase) words that also match the typed query. */
  keywords?: string[]
}

/**
 * Untranslated words that list every snippet in any UI language. Plural on
 * purpose: keywords match by prefix, so `/snippet` and `/snippets` (or
 * `/fragmento` and `/fragmentos`) all find them.
 */
export const SNIPPET_SLASH_KEYWORDS = ['snippets', 'fragmentos']

/**
 * Items matching the typed `/query`: case-insensitive substring of the title, or
 * a keyword starting with it. An empty query keeps every item. Order is kept.
 */
export function filterSlashItems<T extends SlashMatchable>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((i) => i.title.toLowerCase().includes(q) || i.keywords?.some((k) => k.startsWith(q)))
}

export interface SnippetSlashLabels {
  /** Title of a snippet without a name. */
  untitled: string
  /** Description when the snippet has no previewable line. */
  fallbackDescription: string
}

export interface SnippetSlashEntry extends SlashMatchable {
  /** Stable key: snippet names can repeat, or equal a built-in command's title. */
  id: string
  snippet: Snippet
  title: string
  description: string
  keywords: string[]
}

/**
 * Menu entries for the user's snippets, in their configured order. Snippets with
 * nothing to insert (blank content) are left out. The name is user content and
 * shown as typed (trimmed); the description previews the expanded first line at
 * `now` — the insertion itself expands again at that moment.
 */
export function snippetSlashEntries(
  snippets: Snippet[],
  labels: SnippetSlashLabels,
  now: Date,
  locale: SnippetLocale,
): SnippetSlashEntry[] {
  return snippets
    .filter((s) => s.content.trim().length > 0)
    .map((s) => ({
      id: `snippet:${s.id}`,
      snippet: s,
      title: s.name.trim() || labels.untitled,
      description: snippetPreviewLine(s.content, now, locale) || labels.fallbackDescription,
      keywords: SNIPPET_SLASH_KEYWORDS,
    }))
}
