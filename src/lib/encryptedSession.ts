import type { Note, NoteSection } from '../types'

/**
 * In-session unlock of encrypted notes (pure helpers, covered by tests/lib/encryptedSession.test.ts).
 *
 * An unlocked encrypted note lives in the store with its DECRYPTED sections plus a
 * password in `sessionPasswords`. Re-parsing it from disk (full reload / sync pull →
 * loadNotes, or another window's write → syncNote) yields `sections: []` — the content
 * is inside `encryption`. Left like that, the note would look unlocked (password still
 * there) but be empty, and the next section write would re-encrypt only what that edit
 * produced, wiping every other section. So reloaded notes are decrypted again with the
 * session password, and any section write on an encrypted note without decrypted
 * sections is refused.
 */

export type DecryptFn = (encryption: NonNullable<Note['encryption']>, password: string) => Promise<NoteSection[]>

/**
 * Re-applies the session unlock to freshly parsed notes. Notes that are not encrypted or
 * have no session password pass through untouched. When decryption fails (password
 * changed elsewhere, corrupt blob) the note stays locked and its id is reported in
 * `failed` so the caller drops the password — locked, never "unlocked but empty".
 */
export async function redecryptWithSession(
  notes: Note[],
  passwords: Record<string, string>,
  decrypt: DecryptFn,
): Promise<{ notes: Note[]; failed: string[] }> {
  const failed: string[] = []
  const result = await Promise.all(notes.map(async (note) => {
    const password = passwords[note.id]
    if (!note.encryption || !password) return note
    try {
      return { ...note, sections: await decrypt(note.encryption, password) }
    } catch {
      failed.push(note.id)
      return note
    }
  }))
  return { notes: result, failed }
}

/**
 * True when writing `nextSections` to `note` would destroy content: an encrypted note
 * whose sections aren't decrypted in memory (or a write that would leave it with none).
 * The whole encrypted blob is rebuilt from `nextSections` on each write.
 */
export function isUnsafeEncryptedSectionsWrite(note: Note, nextSections: NoteSection[]): boolean {
  return !!note.encryption && (note.sections.length === 0 || nextSections.length === 0)
}
