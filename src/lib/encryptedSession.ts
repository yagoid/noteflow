import type { Note, NoteSection } from '../types'
import { merge3 } from './externalContentSync'

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

/**
 * Locks again (drops the decrypted sections of) the encrypted notes in `ids` — those
 * whose session password was just dropped. loadNotes needs it for the in-memory copies
 * it keeps (notes written during the load, see lib/reloadGuard): they still hold the
 * plaintext the dropped password had unlocked.
 */
export function relockNotes(notes: Note[], ids: readonly string[]): Note[] {
  if (ids.length === 0) return notes
  const relock = new Set(ids)
  return notes.map((n) => (n.encryption && relock.has(n.id) && n.sections.length > 0 ? { ...n, sections: [] } : n))
}

// ── Writing an encrypted note whose note.md changed under the edit ──────────────
//
// A save of an unlocked encrypted note is slow (PBKDF2 to encrypt) and so is the reload
// that follows a sync pull (PBKDF2 to decrypt): for up to a second the store still holds
// the copy from before the pull. A save built from it rewrote the whole note.md — the
// metadata outside the ciphertext (title, group, folder, favorite…) AND the remote
// ciphertext — and the sync then uploaded it as a plain edit on top of the pulled version:
// the remote change was gone, with no conflict copy. So encrypted saves are conditional
// (main refuses them when note.md is no longer the one the copy came from) and, when
// refused, the edit is rebased on the disk version with the helpers below.
//
// Plain notes reuse the same rebase (notesStore.writePlainUpdate): their saves are
// conditional too, per file, so a CLI / agent write that landed just before a debounced
// save is merged into it instead of being overwritten.

/** Same encrypted payload (the content didn't change, whatever the metadata did). */
export function sameEncryptionBlob(a: Note['encryption'], b: Note['encryption']): boolean {
  if (!a || !b) return !a && !b
  return a.ciphertext === b.ciphertext && a.iv === b.iv && a.salt === b.salt
}

const sameValue = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

function sameSection(a: NoteSection, b: NoteSection): boolean {
  return a.name === b.name && a.content === b.content && !!a.isRawMode === !!b.isRawMode
    && !!a.aiHidden === !!b.aiHidden && a.created === b.created && a.updated === b.updated
}

/** A section changed on both sides: each field from the side that changed it, the content merged by lines. */
function mergeBothChanged(base: NoteSection, ours: NoteSection, theirs: NoteSection): NoteSection {
  const pick = <K extends keyof NoteSection>(key: K): NoteSection[K] =>
    (sameValue(ours[key], base[key]) ? theirs[key] : ours[key])
  const merged: NoteSection = {
    id: ours.id,
    name: pick('name'),
    // Overlapping changes keep both versions (ours first), like an editor merging a pull.
    content: merge3(base.content, ours.content, theirs.content).text,
  }
  if (pick('isRawMode')) merged.isRawMode = true
  if (pick('aiHidden')) merged.aiHidden = true
  const created = pick('created')
  if (created) merged.created = created
  const updated = pick('updated')
  if (updated) merged.updated = updated
  return merged
}

/**
 * Three-way merge of a note's section list: `ours` (the edit) was made from `base`, the
 * disk now holds `theirs`. A section only one side changed takes that side; one both
 * changed is merged (content by lines). Never drops an edit: a section deleted on one
 * side and changed on the other is kept. The order is ours, with the sections only
 * `theirs` has placed after the section that precedes them there.
 */
export function rebaseSections(base: NoteSection[], ours: NoteSection[], theirs: NoteSection[]): NoteSection[] {
  const baseById = new Map(base.map((s) => [s.id, s]))
  const theirsById = new Map(theirs.map((s) => [s.id, s]))
  const out: NoteSection[] = []
  for (const o of ours) {
    const b = baseById.get(o.id)
    const t = theirsById.get(o.id)
    if (!b) { out.push(o); continue }                 // new here
    const oursChanged = !sameSection(o, b)
    if (!t) { if (oursChanged) out.push(o); continue } // deleted there: kept only if edited here
    if (!oursChanged) out.push(t)
    else if (sameSection(t, b)) out.push(o)
    else out.push(mergeBothChanged(b, o, t))
  }
  const oursIds = new Set(ours.map((s) => s.id))
  theirs.forEach((t, i) => {
    if (oursIds.has(t.id)) return
    const b = baseById.get(t.id)
    if (b && sameSection(t, b)) return // deleted here, untouched there
    // New there (or deleted here but edited there): after its predecessor in `theirs`.
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((s) => s.id === theirs[j].id)
      if (k >= 0) { at = k + 1; break }
    }
    out.splice(at, 0, t)
  })
  return out
}

/**
 * The patch of an edit made from `base`, to apply on `fresh` (the disk version): the
 * fields the edit didn't really change are left out — so `fresh` keeps the values a pull
 * brought — and its sections are rebased with rebaseSections.
 */
export function rebaseNotePatch<P extends Partial<Pick<Note, 'title' | 'sections' | 'tags' | 'favorited' | 'group' | 'folder'>>>(
  base: Note,
  patch: P,
  fresh: Note,
): P {
  const out: Partial<Note> = {}
  for (const key of Object.keys(patch) as (keyof P & keyof Note)[]) {
    if (key === 'sections') continue
    if (!sameValue(patch[key], base[key])) out[key] = patch[key] as never
  }
  if (patch.sections !== undefined) out.sections = rebaseSections(base.sections, patch.sections, fresh.sections)
  return out as P
}
