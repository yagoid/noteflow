import { describe, it, expect } from 'vitest'
import { encryptSections, decryptSections } from '../../src/lib/cryptoUtils'
import type { NoteSection } from '../../src/types'

const sections: NoteSection[] = [
  { id: 'a', name: 'Note', content: 'top secret' },
  { id: 'b', name: 'Tasks', content: 'plan the heist', isRawMode: true, created: '2026-01-02T03:04:05.000Z' },
]

describe('encryptSections / decryptSections', () => {
  it('round-trips sections through encrypt → decrypt', async () => {
    const enc = await encryptSections(sections, 'hunter2')
    expect(enc.alg).toBe('aes-256-gcm+pbkdf2')
    expect(enc.salt).toBeTruthy()
    expect(enc.iv).toBeTruthy()
    expect(enc.ciphertext).toBeTruthy()

    const decrypted = await decryptSections(enc, 'hunter2')
    expect(decrypted).toEqual(sections)
  })

  it('throws when the password is wrong (auth tag mismatch)', async () => {
    const enc = await encryptSections(sections, 'correct-password')
    await expect(decryptSections(enc, 'wrong-password')).rejects.toThrow()
  })

  it('persists non-default options and round-trips with them', async () => {
    const enc = await encryptSections(sections, 'pw', {
      iterations: 150_000,
      hashAlg: 'SHA-512',
    })
    expect(enc.iterations).toBe(150_000)
    expect(enc.hashAlg).toBe('SHA-512')
    const decrypted = await decryptSections(enc, 'pw')
    expect(decrypted).toEqual(sections)
  })

  it('omits default option fields from the stored block', async () => {
    const enc = await encryptSections(sections, 'pw')
    expect(enc.iterations).toBeUndefined()
    expect(enc.hashAlg).toBeUndefined()
  })
})
