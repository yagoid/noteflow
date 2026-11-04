// Loose section-name matching of the CLI (cli/noteflow.js). It is the fallback
// of matchSectionOrNull after the exact name, and only the read-only commands
// ('read', 'path') may USE it ({ loose: true }); write commands merely SUGGEST
// its candidates. So the rules have to be tight: substring first, then a
// candidate whose words cover the query's — and the caller requires uniqueness.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

const sectionTokens = cli.sectionTokens as (name: string) => Set<string>
const fuzzySectionMatches = cli.fuzzySectionMatches as (
  sections: { name: string }[],
  query: string,
) => { name: string }[]
const looseSectionMatches = cli.looseSectionMatches as typeof fuzzySectionMatches
const editDistance = cli.editDistance as (a: string, b: string) => number
const sectionSuggestions = cli.sectionSuggestions as (sections: { name: string }[], query: string) => string[]

const sections = (...names: string[]) => names.map(name => ({ name }))
const names = (matches: { name: string }[]) => matches.map(s => s.name)

describe('sectionTokens', () => {
  it('strips diacritics, case and punctuation', () => {
    expect([...sectionTokens('Configuración/Deploy')]).toEqual(['configuracion', 'deploy'])
  })

  it('drops filler words in both languages', () => {
    expect([...sectionTokens('Variables de entorno')]).toEqual(['variables', 'entorno'])
    expect([...sectionTokens('The state of the art')]).toEqual(['state', 'art'])
  })

  it('keeps digits and non-latin scripts as tokens', () => {
    expect([...sectionTokens('Sprint 14 — Планы')]).toEqual(['sprint', '14', 'планы'])
  })

  it('returns an empty set for punctuation-only or filler-only names', () => {
    expect([...sectionTokens('— / —')]).toEqual([])
    expect([...sectionTokens('de la')]).toEqual([])
  })
})

describe('fuzzySectionMatches', () => {
  it('matches when the query words are a subset of the section words', () => {
    const found = fuzzySectionMatches(sections('Note', 'Variables Entorno'), 'Variables de entorno')
    expect(names(found)).toEqual(['Variables Entorno'])
  })

  it('ignores accents and case in both directions', () => {
    expect(names(fuzzySectionMatches(sections('Configuracion'), 'configuración'))).toEqual(['Configuracion'])
    expect(names(fuzzySectionMatches(sections('Consideración final'), 'consideracion'))).toEqual(['Consideración final'])
  })

  it('reports every candidate so the caller can refuse to guess', () => {
    const found = fuzzySectionMatches(sections('Tasks backend', 'Tasks frontend'), 'tasks')
    expect(names(found)).toEqual(['Tasks backend', 'Tasks frontend'])
  })

  it('does not match when the query adds words the section lacks', () => {
    expect(fuzzySectionMatches(sections('Variables Entorno'), 'Variables de entorno local')).toEqual([])
  })

  it('never matches on an empty/filler-only query', () => {
    expect(fuzzySectionMatches(sections('Note', 'Tasks'), '')).toEqual([])
    expect(fuzzySectionMatches(sections('Note', 'Tasks'), 'de la')).toEqual([])
  })

  it('tolerates a missing section list', () => {
    expect(fuzzySectionMatches(undefined as never, 'tasks')).toEqual([])
  })
})

describe('looseSectionMatches', () => {
  it('finds a case-insensitive substring (the "EN" ⊂ "Comentario" trap write commands must not act on)', () => {
    expect(names(looseSectionMatches(sections('Note', 'Comentario'), 'EN'))).toEqual(['Comentario'])
  })

  it('returns every substring hit so the caller can refuse to guess', () => {
    expect(names(looseSectionMatches(sections('Tasks backend', 'Tasks frontend', 'Ideas'), 'tasks')))
      .toEqual(['Tasks backend', 'Tasks frontend'])
  })

  it('falls back to word matching only when no substring matches', () => {
    expect(names(looseSectionMatches(sections('Note', 'Variables Entorno'), 'Variables de entorno')))
      .toEqual(['Variables Entorno'])
    // a substring hit exists: the word-only match ('Entorno Variables') is not added
    expect(names(looseSectionMatches(sections('Variables entorno local', 'Entorno Variables'), 'variables entorno')))
      .toEqual(['Variables entorno local'])
  })

  it('returns nothing for an empty query or a missing section list', () => {
    expect(looseSectionMatches(sections('Note'), '')).toEqual([])
    expect(looseSectionMatches(undefined as never, 'note')).toEqual([])
  })
})

describe('editDistance', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(editDistance('improvment', 'improvements')).toBe(2)
    expect(editDistance('tasks', 'task')).toBe(1)
    expect(editDistance('note', 'note')).toBe(0)
  })

  it('counts a swap of neighbours as a single edit', () => {
    expect(editDistance('urgnet', 'urgent')).toBe(1)
  })
})

// The "Did you mean" list of add/set when a section name has no exact match.
// Suggestions only: no command ever writes into one of them.
describe('sectionSuggestions', () => {
  const mobile = sections('Urgent', 'Features', 'Improvements', 'Errors')

  it('suggests a substring hit (missing plural)', () => {
    expect(sectionSuggestions(mobile, 'Improvement')).toEqual(['Improvements'])
  })

  it('suggests near-misses by spelling, ignoring case and accents', () => {
    expect(sectionSuggestions(mobile, 'Improvment')).toEqual(['Improvements'])
    expect(sectionSuggestions(mobile, 'urgnet')).toEqual(['Urgent'])
    expect(sectionSuggestions(sections('Configuración'), 'configuracion')).toEqual(['Configuración'])
  })

  it('lists loose candidates before spelling ones, without duplicates', () => {
    expect(sectionSuggestions(sections('Task', 'Tasks backend', 'Tasks'), 'Taks'))
      .toEqual(['Task', 'Tasks'])
    expect(sectionSuggestions(sections('Tests', 'Tasks backend'), 'Tasks'))
      .toEqual(['Tasks backend', 'Tests'])
  })

  it('suggests nothing when no name is close', () => {
    expect(sectionSuggestions(mobile, 'Deploy')).toEqual([])
  })

  it('does not spell-match very short queries (substring hits still count)', () => {
    expect(sectionSuggestions(sections('ES', 'Comentario'), 'EN')).toEqual(['Comentario'])
  })
})
