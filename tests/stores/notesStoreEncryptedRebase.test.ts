// @vitest-environment happy-dom
// A save of an unlocked encrypted note built from a store copy that predates a sync pull
// (QA: "Nota cifrada con GitHub: un cambio remoto de sus etiquetas se perdió"). The save
// (PBKDF2) and the reload after the pull (PBKDF2 again) are slow: the store can still
// hold the old copy when the next keystroke is saved. That save used to rewrite the whole
// note.md — the metadata outside the ciphertext and the pulled ciphertext — and the sync
// uploaded it on top of the pulled version. Now the write is conditional on note.md and,
// when the disk moved, the edit is rebased on it (lib/encryptedSession rebaseNotePatch).
// `window.noteflow` is a fake with one note folder on "disk"; main's check is mirrored.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ENCRYPTED_WRITE_TRIES, setWindowRole, useNotesStore } from '../../src/stores/notesStore'
import { createContentSync, recordSave, resolveExternalContent } from '../../src/lib/externalContentSync'
import { NOTE_MD, noteDirname, parseNoteFolder, serializeNoteFolder } from '../../src/lib/noteUtils'
import { decryptSections, encryptSections } from '../../src/lib/cryptoUtils'
import type { Note, NoteSection, NoteWritePayload } from '../../src/types'

const NOTES_DIR = '/home/me/noteflow-notes'
const PASSWORD = 'correct horse'
const T0 = '2026-11-01T10:00:00.000Z'
const FAST = { iterations: 100_000 }

const DIR = noteDirname('n1', 'Recetas')
const FILE_PATH = `${NOTES_DIR}/${DIR}`

/** Disk state of the note folder: note.md, plus plain section files when not encrypted. */
let disk: { noteMd: string; sections: { file: string; content: string }[] }
let writes: NoteWritePayload[]
/** Runs before main's check of each conditional write (a pull landing right then). */
let beforeConditionalWrite: (() => void) | null

function installBridge() {
  const known: Record<string, (...args: unknown[]) => unknown> = {
    writeNote: async (raw) => {
      const payload = raw as NoteWritePayload
      writes.push(payload)
      if (payload.expectNoteMd !== undefined) beforeConditionalWrite?.()
      // Mirror of main's applyNoteWrite check.
      if (payload.expectNoteMd !== undefined && payload.expectNoteMd !== disk.noteMd) {
        return { ok: false, error: 'note-changed', changed: true }
      }
      disk = { noteMd: payload.files[NOTE_MD], sections: Object.entries(payload.files).filter(([f]) => f !== NOTE_MD).map(([file, content]) => ({ file, content })) }
      return { ok: true }
    },
    readNoteDir: async (dir) => (dir === DIR ? { dir: DIR, path: FILE_PATH, ...disk } : null),
    recordActivityEdit: () => undefined,
    scheduleAlarms: () => undefined,
  }
  ;(window as unknown as { noteflow: unknown }).noteflow = new Proxy({}, {
    get: (_target, name: string) => (...args: unknown[]) => {
      if (known[name]) return known[name](...args)
      throw new Error(`unexpected window.noteflow.${name}()`)
    },
  })
}

type Meta = Partial<Pick<Note, 'title' | 'tags' | 'favorited' | 'group' | 'folder'>>

/** note.md of the encrypted note with `sections` inside and `meta` outside the ciphertext. */
async function encryptedNoteMd(sections: NoteSection[], meta: Meta = {}, password = PASSWORD): Promise<string> {
  const encryption = await encryptSections(sections, password, FAST)
  return serializeNoteFolder({
    id: 'n1', title: 'Recetas', tags: [], created: T0, updated: T0, archived: false, favorited: false,
    ...meta, encryption, sections: [],
  }).files[NOTE_MD]
}

/** The store copy: note.md parsed and unlocked in this session, like after unlockNote. */
async function unlockedFrom(noteMd: string): Promise<Note> {
  const parsed = parseNoteFolder(noteMd, {}, FILE_PATH)
  return { ...parsed, sections: await decryptSections(parsed.encryption!, PASSWORD) }
}

async function onDisk(): Promise<Note> {
  return unlockedFrom(disk.noteMd)
}

const BASE_SECTIONS: NoteSection[] = [
  { id: 'a', name: 'Pasta', content: 'one\ntwo\nthree' },
  { id: 'b', name: 'Arroz', content: 'rice' },
]

const state = () => useNotesStore.getState()
const contents = (n: Note) => Object.fromEntries(n.sections.map((s) => [s.id, s.content]))

/** Local note open and unlocked; then `pulled` replaces note.md on disk (the store isn't told yet). */
async function setup(pulled?: (base: string) => Promise<string>, sections = BASE_SECTIONS) {
  const baseMd = await encryptedNoteMd(sections)
  disk = { noteMd: baseMd, sections: [] }
  useNotesStore.setState({ notes: [await unlockedFrom(baseMd)], sessionPasswords: { n1: PASSWORD } })
  if (pulled) disk = { noteMd: await pulled(baseMd), sections: [] }
  return baseMd
}

beforeEach(() => {
  writes = []
  beforeConditionalWrite = null
  installBridge()
  setWindowRole('main')
  useNotesStore.setState({ notes: [], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

afterEach(() => {
  useNotesStore.setState({ notes: [], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

describe('notesStore — encrypted save over a pulled note.md', () => {
  it('nothing changed on disk: one conditional write against the copy it was built from', async () => {
    const baseMd = await setup()
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\nfour' })
    expect(writes).toHaveLength(1)
    expect(writes[0].expectNoteMd).toBe(baseMd)
    expect(contents(await onDisk()).a).toBe('one\ntwo\nthree\nfour')
  })

  it('metadata changed remotely outside the ciphertext survive the save (title, group, folder, favorite)', async () => {
    await setup(async (baseMd) => {
      // Same ciphertext, other metadata: what a pull of the other device's note.md leaves.
      const remote = parseNoteFolder(baseMd, {}, FILE_PATH)
      return serializeNoteFolder({ ...remote, title: 'Recetas de casa', group: 'g1', folder: 'f1', favorited: true }).files[NOTE_MD]
    })
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\nfour' })

    const written = await onDisk()
    expect(written).toMatchObject({ title: 'Recetas de casa', group: 'g1', folder: 'f1', favorited: true })
    expect(contents(written).a).toBe('one\ntwo\nthree\nfour')
    expect(state().notes[0]).toMatchObject({ title: 'Recetas de casa', group: 'g1', favorited: true })
    expect(contents(state().notes[0]).a).toBe('one\ntwo\nthree\nfour')
  })

  it('tags stay derived from the content (a #tag written in the text is kept; a bare tags: edit is not — same as plain notes)', async () => {
    await setup(async () => encryptedNoteMd(
      [BASE_SECTIONS[0], { ...BASE_SECTIONS[1], content: 'rice #cena' }],
      { tags: ['cena', 'manual'] },
    ))
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree #pasta' })
    expect((await onDisk()).tags.sort()).toEqual(['cena', 'pasta'])
  })

  it('a section edited remotely and another edited here: both kept', async () => {
    await setup(async () => encryptedNoteMd(
      [BASE_SECTIONS[0], { ...BASE_SECTIONS[1], content: 'rice and beans' }],
      { title: 'Recetas!' },
    ))
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\nfour' })

    const written = await onDisk()
    expect(contents(written)).toEqual({ a: 'one\ntwo\nthree\nfour', b: 'rice and beans' })
    expect(written.title).toBe('Recetas!')
  })

  it('the same section edited on both sides: merged by lines, nothing dropped', async () => {
    await setup(async () => encryptedNoteMd([{ ...BASE_SECTIONS[0], content: 'ONE\ntwo\nthree' }, BASE_SECTIONS[1]]))
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\nfour' })
    expect(contents(await onDisk()).a).toBe('ONE\ntwo\nthree\nfour')
  })

  it('a section added remotely stays, after the one that precedes it there', async () => {
    await setup(async () => encryptedNoteMd([BASE_SECTIONS[0], { id: 'c', name: 'Sopa', content: 'soup' }, BASE_SECTIONS[1]]))
    await state().updateSection('n1', 'b', { content: 'rice!' })
    const written = await onDisk()
    expect(written.sections.map((s) => s.id)).toEqual(['a', 'c', 'b'])
    expect(contents(written)).toEqual({ a: 'one\ntwo\nthree', c: 'soup', b: 'rice!' })
  })

  it('a metadata-only edit (favorite) keeps the pulled ciphertext', async () => {
    await setup(async () => encryptedNoteMd([{ ...BASE_SECTIONS[0], content: 'remote text' }, BASE_SECTIONS[1]], { title: 'Otra' }))
    await state().updateNote('n1', { favorited: true })
    const written = await onDisk()
    expect(written).toMatchObject({ favorited: true, title: 'Otra' })
    expect(contents(written).a).toBe('remote text')
  })

  it('the note is no longer encrypted on disk: nothing is re-encrypted over it, the store takes the disk version', async () => {
    await setup()
    disk = {
      noteMd: serializeNoteFolder({
        id: 'n1', title: 'Recetas', tags: [], created: T0, updated: T0, archived: false, favorited: false,
        sections: BASE_SECTIONS,
      }).files[NOTE_MD],
      sections: [{ file: 'a.md', content: 'one\ntwo\nthree' }, { file: 'b.md', content: 'rice' }],
    }
    const plainMd = disk.noteMd
    await state().updateSection('n1', 'a', { content: 'edited' })
    expect(disk.noteMd).toBe(plainMd)
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(state().notes[0].encryption).toBeUndefined()
  })

  it('note.md rewritten before every conditional write: gives up after the last try and writes unconditionally, still encrypted', async () => {
    const baseMd = await setup()
    let pulls = 0
    beforeConditionalWrite = () => {
      pulls++
      const remote = parseNoteFolder(baseMd, {}, FILE_PATH)
      disk = { noteMd: serializeNoteFolder({ ...remote, title: `Remote ${pulls}` }).files[NOTE_MD], sections: [] }
    }
    await state().updateSection('n1', 'a', { content: 'mine' })

    expect(writes).toHaveLength(ENCRYPTED_WRITE_TRIES)
    expect(writes.slice(0, -1).every((w) => w.expectNoteMd !== undefined)).toBe(true)
    expect(writes.at(-1)!.expectNoteMd).toBeUndefined()
    const written = await onDisk()
    expect(written.encryption).toBeDefined()
    expect(written.title).toBe(`Remote ${ENCRYPTED_WRITE_TRIES - 1}`) // rebased on the last version it read
    expect(contents(written).a).toBe('mine')
  })

  it('re-encrypted with another password on another device: the edit is not written over it, the note locks', async () => {
    await setup(async () => encryptedNoteMd([{ ...BASE_SECTIONS[0], content: 'their secret' }], {}, 'new password'))
    const theirMd = disk.noteMd
    await state().updateSection('n1', 'a', { content: 'mine' })

    expect(writes).toHaveLength(1) // only the refused conditional one: no loop, no unconditional write
    expect(disk.noteMd).toBe(theirMd)
    await vi.waitFor(() => expect(state().sessionPasswords.n1).toBeUndefined())
    await vi.waitFor(() => expect(state().notes[0].sections).toEqual([]))
  })

  it('a plain (not encrypted) note is never written conditionally', async () => {
    const plain: Note = {
      id: 'p1', title: 'Plain', tags: [], created: T0, updated: T0, archived: false, favorited: false,
      sections: [{ id: 's', name: 'Note', content: 'x' }], raw: '---\nid: p1\n---\n', filePath: `${NOTES_DIR}/${noteDirname('p1', 'Plain')}`,
    }
    useNotesStore.setState({ notes: [plain] })
    await state().updateSection('p1', 's', { content: 'y' })
    await state().updateNote('p1', { favorited: true })
    expect(writes).toHaveLength(2)
    expect(writes.every((w) => !('expectNoteMd' in w))).toBe(true)
  })

  it('end to end with the editor: the rebased save comes back merged with the lines typed since, without repeating any', async () => {
    const S0 = 'l1\nab\nl3\nl4\nl5'
    const S1 = 'l1\nabc\nl3\nl4\nl5'
    const S2 = 'l1\nabcd\nl3\nl4\nl5'
    await setup(async () => encryptedNoteMd([{ id: 'a', name: 'Pasta', content: 'l1\nab\nl3\nl4\nREMOTE' }]), [{ id: 'a', name: 'Pasta', content: S0 }])
    // The editor hands S1 to the store (refused, then rebased); the user keeps typing: S2 pending.
    const editor = createContentSync(S0)
    recordSave(editor, S1, S0)
    await state().updateSection('n1', 'a', { content: S1 })

    const stored = contents(state().notes[0]).a
    expect(stored).toBe('l1\nabc\nl3\nl4\nREMOTE')
    expect(resolveExternalContent(editor, { incoming: stored, current: S2, pending: true }))
      .toEqual({ kind: 'merge', merged: 'l1\nabcd\nl3\nl4\nREMOTE', conflict: false })
    expect(editor.outbox).toEqual([])
  })
})
