import { describe, it, expect } from 'vitest'
import {
  normalize,
  escapeRegExp,
  buildSearchRegex,
  parseSearchQuery,
  noteMatchesQuery,
  sectionSearchMatch,
} from '../../src/lib/searchUtils'

// Minimal note fixture shaped like NoteForSearch (the structural type the
// search helpers accept). noteMatchesQuery only touches title/tags/sections.
function note(overrides?: {
  title?: string
  tags?: string[]
  sections?: { name: string; content: string }[]
}) {
  return {
    title: overrides?.title ?? 'My Project',
    tags: overrides?.tags ?? ['work', 'idea'],
    sections: overrides?.sections ?? [
      { name: 'Note', content: 'Some café notes here' },
      { name: 'Tasks', content: 'buy milk' },
    ],
  }
}

describe('normalize', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalize('CAFÉ')).toBe('cafe')
    expect(normalize('Año Nuevo')).toBe('ano nuevo')
    expect(normalize('ÜÑÏçödë')).toBe('unicode')
  })
})

describe('escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c+?')).toBe('a\\.b\\*c\\+\\?')
    expect(escapeRegExp('(x)[y]{z}')).toBe('\\(x\\)\\[y\\]\\{z\\}')
  })

  it('leaves plain text untouched', () => {
    expect(escapeRegExp('hello world')).toBe('hello world')
  })
})

describe('buildSearchRegex', () => {
  it('returns null for empty / whitespace-only queries', () => {
    expect(buildSearchRegex('')).toBeNull()
    expect(buildSearchRegex('   ')).toBeNull()
  })

  it('is case-insensitive by default', () => {
    const re = buildSearchRegex('Hello')
    expect(re).not.toBeNull()
    expect(re!.flags).toBe('gi')
    expect('say HELLO'.match(re!)).not.toBeNull()
  })

  it('honours caseSensitive: true', () => {
    const re = buildSearchRegex('Hello', { caseSensitive: true })
    expect(re!.flags).toBe('g')
    expect('say hello'.match(re!)).toBeNull()
    expect('say Hello'.match(re!)).not.toBeNull()
  })

  it('escapes metacharacters so the literal is matched', () => {
    const re = buildSearchRegex('a.b')
    expect('axb'.match(re!)).toBeNull()
    expect('a.b'.match(re!)).not.toBeNull()
  })
})

describe('parseSearchQuery', () => {
  it('returns no section filter for plain text', () => {
    expect(parseSearchQuery('hello world')).toEqual({
      sectionFilter: null,
      textQuery: 'hello world',
    })
  })

  it('extracts a #section filter and the remaining text', () => {
    expect(parseSearchQuery('#tasks buy milk')).toEqual({
      sectionFilter: 'tasks',
      textQuery: 'buy milk',
    })
  })

  it('strips the filter token wherever it appears', () => {
    expect(parseSearchQuery('buy milk #tasks')).toEqual({
      sectionFilter: 'tasks',
      textQuery: 'buy milk',
    })
  })
})

describe('noteMatchesQuery', () => {
  it('matches everything when the text query is empty', () => {
    expect(noteMatchesQuery(note(), { sectionFilter: null, textQuery: '' })).toBe(true)
  })

  it('matches on title (diacritic/case insensitive)', () => {
    expect(noteMatchesQuery(note(), { sectionFilter: null, textQuery: 'project' })).toBe(true)
  })

  it('matches on section content with normalization', () => {
    expect(noteMatchesQuery(note(), { sectionFilter: null, textQuery: 'cafe' })).toBe(true)
  })

  it('matches on tags', () => {
    expect(noteMatchesQuery(note(), { sectionFilter: null, textQuery: 'idea' })).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(noteMatchesQuery(note(), { sectionFilter: null, textQuery: 'zzz' })).toBe(false)
  })

  it('restricts text matches to the filtered section', () => {
    const n = note()
    // "milk" lives in the Tasks section
    expect(noteMatchesQuery(n, { sectionFilter: 'tasks', textQuery: 'milk' })).toBe(true)
    // "cafe" lives in the Note section, so a #tasks filter should exclude it
    expect(noteMatchesQuery(note(), { sectionFilter: 'tasks', textQuery: 'cafe' })).toBe(false)
  })

  it('returns false when the section filter matches no section', () => {
    expect(noteMatchesQuery(note(), { sectionFilter: 'nope', textQuery: '' })).toBe(false)
  })

  it('a section filter with empty text matches any note that has the section', () => {
    expect(noteMatchesQuery(note(), { sectionFilter: 'tasks', textQuery: '' })).toBe(true)
  })
})

describe('sectionSearchMatch', () => {
  const sections = [
    { name: 'Note', content: 'Some café notes here' },
    { name: 'Tasks', content: 'buy milk' },
    { name: 'Tasks done', content: 'paint the fence' },
  ]

  it('is null without a query', () => {
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: null, textQuery: '' })).toBeNull()
  })

  it('text query: shows every section, matches by name or body (accent-insensitive)', () => {
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: null, textQuery: 'cafe' }))
      .toEqual({ shown: [0, 1, 2], matched: [0] })
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: null, textQuery: 'TASKS' }))
      .toEqual({ shown: [0, 1, 2], matched: [1, 2] })
  })

  it('text query that only hits the title or tags: null (the row keeps its line)', () => {
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: null, textQuery: 'project' })).toBeNull()
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: null, textQuery: 'idea' })).toBeNull()
  })

  it('#section filter: shows only the sections whose name matches', () => {
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: 'task', textQuery: '' }))
      .toEqual({ shown: [1, 2], matched: [1, 2] })
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: 'nope', textQuery: '' })).toBeNull()
  })

  it('#section filter + text: those holding the text match; all of them if none does', () => {
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: 'task', textQuery: 'fence' }))
      .toEqual({ shown: [1, 2], matched: [2] })
    expect(sectionSearchMatch(note({ sections }), { sectionFilter: 'task', textQuery: 'project' }))
      .toEqual({ shown: [1, 2], matched: [1, 2] })
  })
})
