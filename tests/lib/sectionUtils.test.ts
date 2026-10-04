import { describe, it, expect } from 'vitest'
import { duplicateSectionInList, moveSectionInList, patchSectionInList, restoreSectionInList } from '../../src/lib/sectionUtils'
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

describe('patchSectionInList', () => {
  it('patches only the target section and keeps the others by reference', () => {
    const sections = base()
    const next = patchSectionInList(sections, 'b', { content: 'edited' })
    expect(next?.map((s) => s.content)).toEqual(['one', 'edited', 'three'])
    expect(next?.[0]).toBe(sections[0])
    expect(next?.[1]).toMatchObject({ id: 'b', name: 'Beta', isRawMode: true, aiHidden: true })
    expect(sections[1].content).toBe('# two')
  })

  it('merges onto the latest list: two editors of different sections both survive', () => {
    // Pane A edits "a", pane B edits "c"; each write is applied to the result of the
    // previous one (what the store's per-note queue guarantees).
    const afterA = patchSectionInList(base(), 'a', { content: 'A edit' })!
    const afterB = patchSectionInList(afterA, 'c', { content: 'B edit' })!
    expect(afterB.map((s) => s.content)).toEqual(['A edit', '# two', 'B edit'])
  })

  it('returns null for a deleted section (never resurrects it) or a no-op patch', () => {
    expect(patchSectionInList(base(), 'zzz', { content: 'x' })).toBeNull()
    expect(patchSectionInList(base(), 'a', { content: 'one' })).toBeNull()
  })
})

describe('moveSectionInList', () => {
  it('moves the dragged section to the target position', () => {
    expect(moveSectionInList(base(), 'a', 'c')?.map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(moveSectionInList(base(), 'c', 'a')?.map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('returns null when an id is missing or both are the same', () => {
    expect(moveSectionInList(base(), 'a', 'a')).toBeNull()
    expect(moveSectionInList(base(), 'x', 'a')).toBeNull()
    expect(moveSectionInList(base(), 'a', 'x')).toBeNull()
  })
})

describe('restoreSectionInList', () => {
  it('re-inserts the deleted section at its index into the CURRENT list', () => {
    const removed = base()[1]
    // Meanwhile another editor changed section "c".
    const current = [{ id: 'a', name: 'Alpha', content: 'one' }, { id: 'c', name: 'Gamma', content: 'changed' }]
    const next = restoreSectionInList(current, removed, 1)
    expect(next?.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(next?.[2].content).toBe('changed')
  })

  it('clamps the index and is a no-op when the section is already back', () => {
    const removed = base()[1]
    expect(restoreSectionInList([], removed, 5)?.map((s) => s.id)).toEqual(['b'])
    expect(restoreSectionInList(base(), removed, 1)).toBeNull()
  })
})
