import { describe, it, expect } from 'vitest'
import { isUnsafeEncryptedSectionsWrite, redecryptWithSession, type DecryptFn } from '../../src/lib/encryptedSession'
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
