import { describe, it, expect } from 'vitest'
import {
  KEY_BYTES,
  KDF_SALT_BYTES,
  DEFAULT_KDF_ITERATIONS,
  RECOVERY_CODE_GROUPS,
  RECOVERY_CODE_GROUP_LEN,
  toB64Url,
  fromB64Url,
  generateDek,
  generateNoteKey,
  generateKdfSalt,
  deriveKek,
  generateRecoveryCode,
  normalizeRecoveryCode,
  looksLikeRecoveryCode,
  deriveRecoveryKek,
  wrapKey,
  unwrapKey,
  encryptContent,
  decryptContent,
  derivePathKeyHmac,
} from '../../electron/cloudCrypto'

// Fewer PBKDF2 rounds where the test only needs a KEK, to keep the suite fast.
const FAST_ITERATIONS = 1_000

const B64URL_RE = /^[A-Za-z0-9_-]+$/

describe('base64url encoding', () => {
  it('round-trips arbitrary bytes without padding chars', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const encoded = toB64Url(bytes)
    expect(encoded).toMatch(B64URL_RE)
    expect(fromB64Url(encoded)).toEqual(bytes)
  })
})

describe('key generation', () => {
  it('generates 256-bit DEKs and note keys, distinct per call', () => {
    const dek = generateDek()
    expect(dek).toHaveLength(KEY_BYTES)
    expect(generateNoteKey()).toHaveLength(KEY_BYTES)
    expect(generateDek()).not.toEqual(dek)
  })

  it('generates KDF salts of the documented size', () => {
    const salt = generateKdfSalt()
    expect(salt).toHaveLength(KDF_SALT_BYTES)
    expect(generateKdfSalt()).not.toEqual(salt)
  })
})

describe('DEK <-> passphrase (PBKDF2 KEK)', () => {
  it('wraps new cloud keys with 600k PBKDF2 iterations (OWASP 2023 floor)', () => {
    expect(DEFAULT_KDF_ITERATIONS).toBe(600_000)
  })

  it('unwraps a DEK wrapped under the legacy 310k work factor when given the stored value', async () => {
    // Rows wrapped before the bump keep pass_iterations = 310000; unlock derives
    // with the STORED value, never with the current default.
    const dek = generateDek()
    const salt = generateKdfSalt()
    const legacyKek = await deriveKek('legacy passphrase', salt, 310_000)
    const wrapped = await wrapKey(dek, legacyKek)
    expect(await unwrapKey(wrapped, await deriveKek('legacy passphrase', salt, 310_000))).toEqual(dek)
    const currentKek = await deriveKek('legacy passphrase', salt, DEFAULT_KDF_ITERATIONS)
    await expect(unwrapKey(wrapped, currentKek)).rejects.toThrow()
  })

  it('round-trips the DEK through wrap/unwrap with default iterations', async () => {
    const dek = generateDek()
    const salt = generateKdfSalt()
    const kek = await deriveKek('correct horse battery staple', salt, DEFAULT_KDF_ITERATIONS)
    const wrapped = await wrapKey(dek, kek)
    expect(wrapped).toMatch(B64URL_RE)
    expect(await unwrapKey(wrapped, kek)).toEqual(dek)
  })

  it('a wrong passphrase fails to unwrap', async () => {
    const dek = generateDek()
    const salt = generateKdfSalt()
    const kek = await deriveKek('right passphrase', salt, FAST_ITERATIONS)
    const wrapped = await wrapKey(dek, kek)
    const wrongKek = await deriveKek('wrong passphrase', salt, FAST_ITERATIONS)
    await expect(unwrapKey(wrapped, wrongKek)).rejects.toThrow()
  })

  it('derivation is deterministic for the same inputs and differs per salt', async () => {
    const salt = generateKdfSalt()
    const a = await deriveKek('pass', salt, FAST_ITERATIONS)
    const b = await deriveKek('pass', salt, FAST_ITERATIONS)
    expect(a).toEqual(b)
    const c = await deriveKek('pass', generateKdfSalt(), FAST_ITERATIONS)
    expect(c).not.toEqual(a)
  })

  it('wrapping uses a fresh IV per call (same key, different blobs, both open)', async () => {
    const dek = generateDek()
    const kek = await deriveKek('pass', generateKdfSalt(), FAST_ITERATIONS)
    const w1 = await wrapKey(dek, kek)
    const w2 = await wrapKey(dek, kek)
    expect(w1).not.toEqual(w2)
    expect(await unwrapKey(w1, kek)).toEqual(dek)
    expect(await unwrapKey(w2, kek)).toEqual(dek)
  })

  it('rejects tampered blobs (GCM auth)', async () => {
    const dek = generateDek()
    const kek = await deriveKek('pass', generateKdfSalt(), FAST_ITERATIONS)
    const wrapped = await wrapKey(dek, kek)
    const bytes = fromB64Url(wrapped)
    bytes[bytes.length - 1] ^= 0xff
    await expect(unwrapKey(toB64Url(bytes), kek)).rejects.toThrow()
  })
})

describe('DEK <-> recovery code', () => {
  it('generates codes with the expected format and no ambiguous chars', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRecoveryCode()
      const groups = code.split('-')
      expect(groups).toHaveLength(RECOVERY_CODE_GROUPS)
      for (const g of groups) {
        expect(g).toHaveLength(RECOVERY_CODE_GROUP_LEN)
        expect(g).toMatch(/^[A-HJ-NP-Z2-9]+$/)
      }
      // 0, 1, O, I are excluded from the alphabet
      expect(code).not.toMatch(/[01OI]/)
    }
  })

  it('carries at least 128 bits of entropy (150 = 30 chars x 5 bits)', () => {
    const chars = RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LEN
    expect(chars * 5).toBeGreaterThanOrEqual(128)
    // and consecutive codes are distinct
    expect(generateRecoveryCode()).not.toEqual(generateRecoveryCode())
  })

  it('round-trips the DEK, tolerating user-typed formatting', async () => {
    const dek = generateDek()
    const salt = generateKdfSalt()
    const code = generateRecoveryCode()
    const kek = await deriveRecoveryKek(code, salt, FAST_ITERATIONS)
    const wrapped = await wrapKey(dek, kek)

    // lowercase + spaces instead of dashes derives the same KEK
    const typed = code.toLowerCase().replace(/-/g, ' ')
    const kek2 = await deriveRecoveryKek(typed, salt, FAST_ITERATIONS)
    expect(await unwrapKey(wrapped, kek2)).toEqual(dek)
  })

  it('a wrong recovery code fails to unwrap', async () => {
    const dek = generateDek()
    const salt = generateKdfSalt()
    const kek = await deriveRecoveryKek(generateRecoveryCode(), salt, FAST_ITERATIONS)
    const wrapped = await wrapKey(dek, kek)
    const wrongKek = await deriveRecoveryKek(generateRecoveryCode(), salt, FAST_ITERATIONS)
    await expect(unwrapKey(wrapped, wrongKek)).rejects.toThrow()
  })

  it('normalizeRecoveryCode strips separators and uppercases', () => {
    expect(normalizeRecoveryCode('ab2de-fg3hj')).toBe('AB2DEFG3HJ')
    expect(normalizeRecoveryCode(' AB2DE  FG3HJ ')).toBe('AB2DEFG3HJ')
  })

  it('looksLikeRecoveryCode requires exactly 30 normalized chars', () => {
    expect(looksLikeRecoveryCode(generateRecoveryCode())).toBe(true)
    expect(looksLikeRecoveryCode(generateRecoveryCode().toLowerCase().replace(/-/g, ' '))).toBe(true)
    expect(looksLikeRecoveryCode('my ordinary passphrase')).toBe(false)
    expect(looksLikeRecoveryCode('AB2DE-FG3HJ')).toBe(false) // too short
    expect(looksLikeRecoveryCode(generateRecoveryCode() + 'X')).toBe(false) // too long
  })
})

describe('note key <-> DEK', () => {
  it('round-trips a note key wrapped by the DEK', async () => {
    const dek = generateDek()
    const noteKey = generateNoteKey()
    const wrapped = await wrapKey(noteKey, dek)
    expect(await unwrapKey(wrapped, dek)).toEqual(noteKey)
  })

  it('a different DEK cannot unwrap the note key', async () => {
    const noteKey = generateNoteKey()
    const wrapped = await wrapKey(noteKey, generateDek())
    await expect(unwrapKey(wrapped, generateDek())).rejects.toThrow()
  })

  it('rejects wrapping/unwrapping keys of the wrong size', async () => {
    const dek = generateDek()
    await expect(wrapKey(new Uint8Array(16), dek)).rejects.toThrow()
    // a sealed blob of non-key content is not a valid wrapped key
    const sealedText = await encryptContent(dek, 'not a key')
    await expect(unwrapKey(sealedText, dek)).rejects.toThrow()
  })
})

describe('content <-> note key', () => {
  it('round-trips UTF-8 content (frontmatter + markdown + emoji)', async () => {
    const noteKey = generateNoteKey()
    const plaintext = '---\ntitle: Nota número 1 🚀\n---\n\n# Sección\n\ncontenido añadido\n'
    const sealed = await encryptContent(noteKey, plaintext)
    expect(sealed).toMatch(B64URL_RE)
    expect(await decryptContent(noteKey, sealed)).toBe(plaintext)
  })

  it('encrypts the same plaintext to different ciphertexts (fresh IV)', async () => {
    const noteKey = generateNoteKey()
    const s1 = await encryptContent(noteKey, 'same')
    const s2 = await encryptContent(noteKey, 'same')
    expect(s1).not.toEqual(s2)
  })

  it('a wrong note key fails to decrypt', async () => {
    const sealed = await encryptContent(generateNoteKey(), 'secret')
    await expect(decryptContent(generateNoteKey(), sealed)).rejects.toThrow()
  })
})

describe('derivePathKeyHmac', () => {
  it('is deterministic for the same DEK + relPath', async () => {
    const dek = generateDek()
    const a = await derivePathKeyHmac(dek, 'mi-nota-abc123/note.md')
    const b = await derivePathKeyHmac(dek, 'mi-nota-abc123/note.md')
    expect(a).toBe(b)
    expect(a).toMatch(B64URL_RE)
  })

  it('differs between relPaths and between DEKs', async () => {
    const dek = generateDek()
    const a = await derivePathKeyHmac(dek, 'nota-a/note.md')
    const b = await derivePathKeyHmac(dek, 'nota-b/note.md')
    expect(a).not.toBe(b)
    const c = await derivePathKeyHmac(generateDek(), 'nota-a/note.md')
    expect(c).not.toBe(a)
  })

  it('does not equal a raw HMAC leak of the path (opaque, fixed length)', async () => {
    const key = await derivePathKeyHmac(generateDek(), 'carpeta/sección con título largo.md')
    // HMAC-SHA256 -> 32 bytes -> 43 base64url chars
    expect(key).toHaveLength(43)
    expect(key).not.toContain('carpeta')
  })
})
