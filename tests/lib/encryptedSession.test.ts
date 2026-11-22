import { describe, it, expect } from 'vitest'
import { isUnsafeEncryptedSectionsWrite, rebaseNotePatch, rebaseSections, redecryptWithSession, relockNotes, sameEncryptionBlob, type DecryptFn } from '../../src/lib/encryptedSession'
import type { Note, NoteSection } from '../../src/types'

const encryption = { v: 1 } as unknown as NonNullable<Note['encryption']>

const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  title: id,
  tags: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  archived: false,
  favorited: false,
  sections: [],
  filePath: `/notes/${id}`,
  raw: '',
  ...extra,
})

const decrypted: NoteSection[] = [{ id: 's1', name: 'Main', content: 'secret' }]
const decrypt: DecryptFn = async (_enc, password) => {
  if (password !== 'good') throw new Error('bad password')
  return decrypted
}

describe('redecryptWithSession', () => {
  it('decrypts reloaded encrypted notes that are unlocked in this session', async () => {
    const { notes, failed } = await redecryptWithSession([note('a', { encryption })], { a: 'good' }, decrypt)
    expect(notes[0].sections).toEqual(decrypted)
    expect(failed).toEqual([])
  })

  it('leaves plain notes and locked encrypted notes untouched', async () => {
    const plain = note('p', { sections: [{ id: 'x', name: 'X', content: 'plain' }] })
    const locked = note('l', { encryption })
    const { notes, failed } = await redecryptWithSession([plain, locked], { p: 'good' }, decrypt)
    expect(notes[0]).toBe(plain)
    expect(notes[1]).toBe(locked)
    expect(failed).toEqual([])
  })

  it('reports notes that no longer decrypt so the caller relocks them', async () => {
    const { notes, failed } = await redecryptWithSession([note('a', { encryption })], { a: 'stale' }, decrypt)
    expect(notes[0].sections).toEqual([])
    expect(failed).toEqual(['a'])
  })
})

describe('isUnsafeEncryptedSectionsWrite', () => {
  const sections: NoteSection[] = [{ id: 's1', name: 'Main', content: 'x' }]

  it('refuses writing an encrypted note whose sections are not decrypted', () => {
    expect(isUnsafeEncryptedSectionsWrite(note('a', { encryption }), sections)).toBe(true)
  })

  it('refuses leaving an encrypted note without sections', () => {
    expect(isUnsafeEncryptedSectionsWrite(note('a', { encryption, sections }), [])).toBe(true)
  })

  it('allows normal writes of decrypted encrypted notes and any plain note', () => {
    expect(isUnsafeEncryptedSectionsWrite(note('a', { encryption, sections }), sections)).toBe(false)
    expect(isUnsafeEncryptedSectionsWrite(note('p'), [])).toBe(false)
  })
})

describe('relockNotes', () => {
  const sections: NoteSection[] = [{ id: 's1', name: 'Main', content: 'secret' }]

  it('drops the decrypted sections of the encrypted notes listed, and only those', () => {
    const failed = note('a', { encryption, sections })
    const stillUnlocked = note('b', { encryption, sections })
    const plain = note('c', { sections })
    const result = relockNotes([failed, stillUnlocked, plain], ['a', 'c'])
    expect(result[0]).toEqual({ ...failed, sections: [] })
    expect(result[1]).toBe(stillUnlocked)
    expect(result[2]).toBe(plain) // not encrypted (anymore): nothing to lock
  })

  it('returns the same list when nothing failed', () => {
    const list = [note('a', { encryption, sections })]
    expect(relockNotes(list, [])).toBe(list)
  })
})

describe('rebasing an encrypted edit on the note.md now on disk', () => {
  const sec = (id: string, content: string, extra: Partial<NoteSection> = {}): NoteSection => ({ id, name: id.toUpperCase(), content, ...extra })
  const base = [sec('a', 'one'), sec('b', 'two'), sec('c', 'three')]

  it('a section only one side changed takes that side', () => {
    const ours = [sec('a', 'one!'), base[1], base[2]]
    const theirs = [base[0], sec('b', 'two!'), base[2]]
    expect(rebaseSections(base, ours, theirs).map((s) => s.content)).toEqual(['one!', 'two!', 'three'])
  })

  it('a section both changed: each field from the side that changed it, the content merged by lines', () => {
    const b = [sec('a', 'l1\nl2\nl3')]
    const ours = [sec('a', 'l1\nl2\nl3\nl4', { updated: 'T-ours' })]
    const theirs = [sec('a', 'L1\nl2\nl3', { name: 'Renamed', aiHidden: true, updated: 'T-theirs' })]
    expect(rebaseSections(b, ours, theirs)).toEqual([
      { id: 'a', name: 'Renamed', content: 'L1\nl2\nl3\nl4', aiHidden: true, updated: 'T-ours' },
    ])
  })

  it('deletions: kept when the other side edited the section, dropped otherwise', () => {
    // Here: b deleted, c edited. There: b edited, c deleted, a deleted (untouched here).
    const ours = [base[0], sec('c', 'three!')]
    const theirs = [sec('b', 'two!')]
    expect(rebaseSections(base, ours, theirs).map((s) => `${s.id}:${s.content}`)).toEqual(['b:two!', 'c:three!'])
  })

  it('sections added on either side are kept; theirs after their predecessor there', () => {
    const ours = [...base, sec('x', 'mine')]
    const theirs = [base[0], sec('y', 'theirs'), base[1], base[2]]
    expect(rebaseSections(base, ours, theirs).map((s) => s.id)).toEqual(['a', 'y', 'b', 'c', 'x'])
    expect(rebaseSections(base, base, [sec('z', 'first'), ...base]).map((s) => s.id)).toEqual(['z', 'a', 'b', 'c'])
  })

  it('the patch keeps only what the edit changed, so the disk values win elsewhere', () => {
    const b = note('n', { title: 'Old', favorited: false, group: 'g1', sections: base })
    const fresh = note('n', { title: 'Remote', favorited: true, group: 'g2', sections: base })
    // The editor resends the whole note's fields unchanged plus one section edit.
    const patch = { title: 'Old', favorited: false, sections: [sec('a', 'one!'), base[1], base[2]] }
    expect(rebaseNotePatch(b, patch, fresh)).toEqual({ sections: [sec('a', 'one!'), base[1], base[2]] })
    // A real change stays, also clearing a field (ungrouping).
    expect(rebaseNotePatch(b, { title: 'Mine', group: undefined }, fresh)).toEqual({ title: 'Mine', group: undefined })
  })

  it('sameEncryptionBlob compares the payload, not the parameters object', () => {
    const e = { alg: 'aes-256-gcm+pbkdf2', salt: 's', iv: 'i', ciphertext: 'c' } as const
    expect(sameEncryptionBlob(e, { ...e })).toBe(true)
    expect(sameEncryptionBlob(e, { ...e, ciphertext: 'd' })).toBe(false)
    expect(sameEncryptionBlob(e, undefined)).toBe(false)
  })
})
