import { describe, it, expect } from 'vitest'
import { duplicateSectionInList } from '../../src/lib/sectionUtils'
import type { NoteSection } from '../../src/types'

const base = (): NoteSection[] => [
  { id: 'a', name: 'Alpha', content: 'one' },
  { id: 'b', name: 'Beta', content: '# two', isRawMode: true, aiHidden: true },
  { id: 'c', name: 'Gamma', content: 'three' },
]

describe('duplicateSectionInList', () => {
  it('inserts the copy right after the original', () => {
    const result = duplicateSectionInList(base(), 'a', { id: 'new', name: 'Alpha (copy)' })
    expect(result?.sections.map((s) => s.id)).toEqual(['a', 'new', 'b', 'c'])
  })

  it('appends when duplicating the last section', () => {
    const result = duplicateSectionInList(base(), 'c', { id: 'new', name: 'Gamma (copy)' })
    expect(result?.sections.map((s) => s.id)).toEqual(['a', 'b', 'c', 'new'])
  })

  it('keeps content, isRawMode and aiHidden; takes the new id and name', () => {
    const result = duplicateSectionInList(base(), 'b', { id: 'new', name: 'Beta (copy)' })
    expect(result?.section).toEqual({
      id: 'new', name: 'Beta (copy)', content: '# two', isRawMode: true, aiHidden: true,
    })
    expect(result?.sections[2]).toBe(result?.section)
  })

  it('does not mutate the input', () => {
    const sections = base()
    const snapshot = JSON.parse(JSON.stringify(sections))
    const result = duplicateSectionInList(sections, 'b', { id: 'new', name: 'Beta (copy)' })
    expect(sections).toEqual(snapshot)
    expect(result?.sections).not.toBe(sections)
    expect(result?.sections[1]).toBe(sections[1])
  })

  it('returns null for an unknown section', () => {
    expect(duplicateSectionInList(base(), 'zzz', { id: 'new', name: 'x' })).toBeNull()
  })
})
