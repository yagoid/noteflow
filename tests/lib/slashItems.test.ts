import { describe, it, expect } from 'vitest'
import { filterSlashItems, snippetSlashEntries, SNIPPET_SLASH_KEYWORDS } from '../../src/lib/slashItems'
import type { Snippet } from '../../src/types'

// Saturday 7 November 2026, 09:05:03 local time (months are 0-based in Date).
const MORNING = new Date(2026, 10, 7, 9, 5, 3)

const LABELS = { untitled: 'Untitled snippet', fallbackDescription: 'Snippet' }

const snip = (id: string, name: string, content: string): Snippet => ({
  id, name, content, createdAt: '2026-01-01T00:00:00.000Z',
})

describe('filterSlashItems', () => {
  const items = [
    { title: 'Link section' },
    { title: 'Kanban board', keywords: ['kanban', 'board'] },
    { title: 'Daily log', keywords: SNIPPET_SLASH_KEYWORDS },
  ]

  it('keeps every item, in order, for an empty or blank query', () => {
    expect(filterSlashItems(items, '')).toEqual(items)
    expect(filterSlashItems(items, '   ')).toEqual(items)
  })

  it('matches a case-insensitive substring of the title', () => {
    expect(filterSlashItems(items, 'SECT').map((i) => i.title)).toEqual(['Link section'])
    expect(filterSlashItems(items, 'log').map((i) => i.title)).toEqual(['Daily log'])
  })

  it('matches keywords by prefix only', () => {
    expect(filterSlashItems(items, 'boa').map((i) => i.title)).toEqual(['Kanban board'])
    expect(filterSlashItems(items, 'oard').map((i) => i.title)).toEqual(['Kanban board']) // via the title
    expect(filterSlashItems([{ title: 'X', keywords: ['board'] }], 'oard')).toEqual([])
  })

  it('lists the snippets with /snippet, /snippets, /fragmento and /fragmentos', () => {
    for (const q of ['snippet', 'snippets', 'fragmento', 'fragmentos', 'Snip']) {
      expect(filterSlashItems(items, q).map((i) => i.title)).toEqual(['Daily log'])
    }
  })
})

describe('snippetSlashEntries', () => {
  it('keeps the configured order and keys entries by snippet id', () => {
    const entries = snippetSlashEntries(
      [snip('b', 'Second', 'two'), snip('a', 'First', 'one')], LABELS, MORNING, 'en',
    )
    expect(entries.map((e) => [e.id, e.title])).toEqual([['snippet:b', 'Second'], ['snippet:a', 'First']])
  })

  it('gives distinct ids to snippets that share a name', () => {
    const entries = snippetSlashEntries([snip('a', 'Same', 'x'), snip('b', 'Same', 'y')], LABELS, MORNING, 'en')
    expect(new Set(entries.map((e) => e.id)).size).toBe(2)
  })

  it('falls back to the untitled label for a blank name and trims the rest', () => {
    const entries = snippetSlashEntries([snip('a', '   ', 'x'), snip('b', '  Log  ', 'y')], LABELS, MORNING, 'en')
    expect(entries.map((e) => e.title)).toEqual(['Untitled snippet', 'Log'])
  })

  it('previews the expanded first non-empty line', () => {
    const [entry] = snippetSlashEntries(
      [snip('a', 'Journal', '\n## {date:dddd, D MMMM}\n\n- ')], LABELS, MORNING, 'es',
    )
    expect(entry.description).toBe('## sábado, 7 noviembre')
  })

  it('leaves out snippets with nothing to insert', () => {
    const entries = snippetSlashEntries([snip('a', 'Empty', ''), snip('b', 'Blank', ' \n\t'), snip('c', 'Ok', 'x')], LABELS, MORNING, 'en')
    expect(entries.map((e) => e.title)).toEqual(['Ok'])
  })

  it('carries the generic keywords and the snippet itself', () => {
    const s = snip('a', 'Sig', '— {time}')
    const [entry] = snippetSlashEntries([s], LABELS, MORNING, 'en')
    expect(entry.keywords).toEqual(SNIPPET_SLASH_KEYWORDS)
    expect(entry.snippet).toBe(s)
    expect(entry.description).toBe('— 09:05')
  })
})
