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
