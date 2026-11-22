// @vitest-environment happy-dom
// A save of a plain note built from a store copy that predates a write of ANOTHER process
// to the same files (QA: "el CLI escribe en la sección que estoy tecleando y su cambio se
// pierde"): `noteflow add … --section X`, or an agent's `task finish`, landing between the
// keystroke and the debounced save — before the watcher has told the window. The save used
// to rewrite the section file (and note.md) blind. Now it is conditional on every file it
// writes or deletes still holding the text the store copy has; when main refuses it, the
// edit is rebased on the disk version (lib/encryptedSession rebaseNotePatch) and written
// again. `window.noteflow` is a fake with one note folder on "disk"; main's check is the
// real one (electron/notesWatchFilter changedExpectedFiles).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NOTE_WRITE_TRIES, noteWriteBackoffMs, setWindowRole, useNotesStore } from '../../src/stores/notesStore'
import { createContentSync, recordSave, resolveExternalContent } from '../../src/lib/externalContentSync'
import { NOTE_MD, noteDirname, parseNoteFolder, serializeNoteFolder } from '../../src/lib/noteUtils'
import { encryptSections } from '../../src/lib/cryptoUtils'
import { changedExpectedFiles } from '../../electron/notesWatchFilter'
import type { Note, NoteSection, NoteWritePayload } from '../../src/types'

const NOTES_DIR = '/home/me/noteflow-notes'
const T0 = '2026-11-01T10:00:00.000Z'
const DIR = noteDirname('n1', 'Inbox')
const FILE_PATH = `${NOTES_DIR}/${DIR}`

/** The note folder on "disk": file name → content. */
let disk: Record<string, string>
let writes: NoteWritePayload[]
/** Runs right before main's check of each conditional write (the CLI landing right then). */
let beforeConditionalWrite: (() => void) | null
/** How many of the next readNoteDir calls fail (a read caught mid atomic rename). */
let failingReads: number

function installBridge() {
  const known: Record<string, (...args: unknown[]) => unknown> = {
    writeNote: async (raw) => {
      const payload = raw as NoteWritePayload
      writes.push(payload)
      if (payload.expectFiles !== undefined) {
        beforeConditionalWrite?.()
        // Main's check (applyNoteWrite).
        if (changedExpectedFiles(payload.expectFiles, (f) => disk[f] ?? null).length > 0) {
          return { ok: false, error: 'note-changed', changed: true, ...(disk[NOTE_MD] === undefined ? { gone: true } : {}) }
        }
      }
      disk = { ...disk, ...payload.files }
      for (const f of payload.deleteFiles) delete disk[f]
      return { ok: true }
    },
    readNoteDir: async (dir) => (failingReads-- > 0 || disk[NOTE_MD] === undefined ? null : dir === DIR
      ? { dir: DIR, path: FILE_PATH, noteMd: disk[NOTE_MD], sections: Object.entries(disk).filter(([f]) => f !== NOTE_MD).map(([file, content]) => ({ file, content })) }
      : null),
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

const BASE_SECTIONS: NoteSection[] = [
  { id: 'a', name: 'Today', content: 'one\ntwo\nthree' },
  { id: 'b', name: 'Later', content: 'rice' },
]

function noteWith(sections: NoteSection[], meta: Partial<Note> = {}): Omit<Note, 'raw' | 'filePath'> & { filePath: string } {
  return { id: 'n1', title: 'Inbox', tags: [], created: T0, updated: T0, archived: false, favorited: false, sections, filePath: FILE_PATH, ...meta }
}

/** Disk files of `sections` (what the CLI's writeNoteFolder leaves: note.md + every section file). */
function folderFiles(sections: NoteSection[], meta: Partial<Note> = {}): Record<string, string> {
  return serializeNoteFolder(noteWith(sections, meta)).files
}

function onDisk(): Note {
  return parseNoteFolder(disk[NOTE_MD], disk, FILE_PATH)
}

/** What `noteflow add` does: re-reads the folder, changes a section, writes it all back (with a stamp of its own). */
function cliEdit(fn: (sections: NoteSection[]) => NoteSection[], meta: Partial<Note> = {}) {
  const n = onDisk()
  disk = folderFiles(fn(n.sections).map((s) => ({ ...s, updated: '2026-11-22T18:00:00.000Z' })), { title: n.title, ...meta })
}

const state = () => useNotesStore.getState()
const contents = (n: Note) => Object.fromEntries(n.sections.map((s) => [s.id, s.content]))

/** Note open in the store as loaded from disk; `cli` then changes the disk (the store isn't told yet). */
function setup(cli?: () => void, sections = BASE_SECTIONS) {
  disk = folderFiles(sections)
  useNotesStore.setState({ notes: [onDisk()] })
  cli?.()
}

beforeEach(() => {
  writes = []
  beforeConditionalWrite = null
  failingReads = 0
  installBridge()
  setWindowRole('main')
  useNotesStore.setState({ notes: [], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

afterEach(() => {
  useNotesStore.setState({ notes: [], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

describe('notesStore — plain-note save over a CLI write the store has not loaded', () => {
  it('nothing changed on disk: one conditional write, expecting what the store copy read', async () => {
    setup()
    const before = disk
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\nfour' })
    expect(writes).toHaveLength(1)
    expect(writes[0].expectFiles).toEqual({ [NOTE_MD]: before[NOTE_MD], 'a.md': 'one\ntwo\nthree' })
    expect(writes[0].expectNoteMd).toBeUndefined()
    expect(contents(onDisk())).toEqual({ a: 'one\ntwo\nthree\nfour', b: 'rice' })
  })

  it('the CLI added a line to the section being typed in: both kept, once', async () => {
    setup(() => cliEdit((ss) => ss.map((s) => (s.id === 'a' ? { ...s, content: `${s.content}\n- cli X` } : s))))
    await state().updateSection('n1', 'a', { content: 'one\ntwo!\nthree' })

    expect(writes).toHaveLength(2) // refused, then the rebase
    expect(contents(onDisk()).a).toBe('one\ntwo!\nthree\n- cli X')
    expect(contents(state().notes[0]).a).toBe('one\ntwo!\nthree\n- cli X')
  })

  it('the CLI wrote another section: its change stays on disk and reaches the store', async () => {
    setup(() => cliEdit((ss) => ss.map((s) => (s.id === 'b' ? { ...s, content: 'rice\n- [x] done 🤖t1:done' } : s))))
    await state().updateSection('n1', 'a', { content: 'mine' })
    expect(contents(onDisk())).toEqual({ a: 'mine', b: 'rice\n- [x] done 🤖t1:done' })
    expect(contents(state().notes[0])).toEqual({ a: 'mine', b: 'rice\n- [x] done 🤖t1:done' })
  })

  it('a section the CLI created stays listed in note.md (our note.md is not written over it)', async () => {
    setup(() => cliEdit((ss) => [...ss, { id: 'c', name: 'Agent', content: 'report' }]))
    await state().updateSection('n1', 'a', { content: 'mine' })
    const written = onDisk()
    expect(written.sections.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(contents(written)).toEqual({ a: 'mine', b: 'rice', c: 'report' })
  })

  it('the store already loaded the CLI write (the editor merged it): written at once, the line not repeated', async () => {
    setup(() => cliEdit((ss) => ss.map((s) => (s.id === 'a' ? { ...s, content: `${s.content}\n- cli X` } : s))))
    await state().syncNote(FILE_PATH)
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\n- cli X\ntyped' })
    expect(writes).toHaveLength(1)
    expect(contents(onDisk()).a).toBe('one\ntwo\nthree\n- cli X\ntyped')
  })

  it('the refused save already carried the CLI line: not repeated', async () => {
    setup(() => cliEdit((ss) => ss.map((s) => (s.id === 'a' ? { ...s, content: `${s.content}\n- cli X` } : s))))
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\n- cli X\ntyped' })
    expect(contents(onDisk()).a).toBe('one\ntwo\nthree\n- cli X\ntyped')
  })

  it('end to end with the editor, CLI write before the debounced save (both appended at the end): no line repeated', async () => {
    const S0 = 'l1\nl2'
    const S1 = 'l1\nl2\n\ntyped'
    setup(() => cliEdit((ss) => ss.map((s) => ({ ...s, content: `${s.content}\n- cli X` }))), [{ id: 'a', name: 'Today', content: S0 }])
    const editor = createContentSync(S0)
    recordSave(editor, S1, S0)
    await state().updateSection('n1', 'a', { content: S1 })

    const stored = contents(state().notes[0]).a
    expect(stored).toBe('l1\nl2\n\ntyped\n- cli X')
    expect(resolveExternalContent(editor, { incoming: stored, current: S1, pending: false }))
      .toEqual({ kind: 'merge', merged: stored, conflict: false })
  })

  it('the CLI line typed identically here too: merged as one line', async () => {
    setup(() => cliEdit((ss) => ss.map((s) => (s.id === 'a' ? { ...s, content: `${s.content}\n- cli X` } : s))))
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\n- cli X' })
    expect(contents(onDisk()).a).toBe('one\ntwo\nthree\n- cli X')
  })

  it('a metadata-only edit (favorite) keeps the CLI content', async () => {
    setup(() => cliEdit((ss) => ss.map((s) => (s.id === 'b' ? { ...s, content: 'beans' } : s))))
    await state().updateNote('n1', { favorited: true })
    const written = onDisk()
    expect(written.favorited).toBe(true)
    expect(contents(written).b).toBe('beans')
  })

  it('disk rewritten before every conditional write: gives up after the last try and writes unconditionally, rebased', async () => {
    setup()
    let runs = 0
    beforeConditionalWrite = () => {
      runs++
      cliEdit((ss) => ss.map((s) => (s.id === 'b' ? { ...s, content: `cli ${runs}` } : s)), { title: `Remote ${runs}` })
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const t0 = Date.now()
    await state().updateSection('n1', 'a', { content: 'mine' })

    expect(NOTE_WRITE_TRIES).toBeGreaterThanOrEqual(5)
    expect(writes).toHaveLength(NOTE_WRITE_TRIES + 1)
    expect(writes.slice(0, -1).every((w) => w.expectFiles !== undefined)).toBe(true)
    expect(writes.at(-1)!.expectFiles).toBeUndefined()
    // A growing pause between the conditional tries.
    let backoff = 0
    for (let i = 1; i < NOTE_WRITE_TRIES; i++) backoff += noteWriteBackoffMs(i)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(backoff - 10)
    expect(noteWriteBackoffMs(2)).toBeGreaterThan(noteWriteBackoffMs(1))
    // Rebased on the last version it read; the fallback says so.
    expect(contents(onDisk())).toEqual({ a: 'mine', b: `cli ${NOTE_WRITE_TRIES}` })
    expect(onDisk().title).toBe(`Remote ${NOTE_WRITE_TRIES}`)
    expect(warn.mock.calls.some(([msg]) => String(msg).includes('writing the last rebase unconditionally'))).toBe(true)
    warn.mockRestore()
  })

  it('the re-read fails for an instant (atomic rename of the CLI): counted as a try, re-read later, never written blind', async () => {
    setup(() => cliEdit((ss) => ss.map((s) => (s.id === 'a' ? { ...s, content: `${s.content}\n- cli X` } : s))))
    failingReads = 2
    await state().updateSection('n1', 'a', { content: 'one\ntwo!\nthree' })

    expect(writes.every((w) => w.expectFiles !== undefined)).toBe(true)
    expect(writes).toHaveLength(4) // refused, refused (read failed), refused (read failed) → rebased, written
    expect(contents(onDisk()).a).toBe('one\ntwo!\nthree\n- cli X')
  })

  it('the note folder deleted meanwhile (main says gone): the edit recreates it, at once', async () => {
    setup(() => { disk = {} })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await state().updateSection('n1', 'a', { content: 'mine' })
    warn.mockRestore()

    expect(writes).toHaveLength(2)
    expect(writes[1].expectFiles).toBeUndefined()
    expect(contents(onDisk()).a).toBe('mine')
  })

  it('encrypted on disk meanwhile: no plaintext written over it, the store re-syncs', async () => {
    setup()
    const encryption = await encryptSections(BASE_SECTIONS, 'pw', { iterations: 100_000 })
    disk = { [NOTE_MD]: serializeNoteFolder({ ...noteWith([]), encryption }).files[NOTE_MD] }
    const encryptedMd = disk[NOTE_MD]
    await state().updateSection('n1', 'a', { content: 'mine' })

    expect(writes).toHaveLength(1)
    expect(disk).toEqual({ [NOTE_MD]: encryptedMd })
    await vi.waitFor(() => expect(state().notes[0].encryption).toBeDefined())
  })

  it('CRLF / BOM on disk (an external editor) is not a change: written at once', async () => {
    setup()
    disk = { ...disk, 'a.md': '﻿one\r\ntwo\r\nthree' }
    await state().updateSection('n1', 'a', { content: 'one\ntwo\nthree\nfour' })
    expect(writes).toHaveLength(1)
  })

  it('a section deleted here that the CLI already removed: the delete goes through', async () => {
    setup(() => cliEdit((ss) => ss.filter((s) => s.id !== 'b')))
    await state().mutateSections('n1', (ss) => ss.filter((s) => s.id !== 'b'))
    expect(onDisk().sections.map((s) => s.id)).toEqual(['a'])
    expect(disk['b.md']).toBeUndefined()
  })

  it('end to end with the editor (the 700 ms CLI race): the rebased save comes back with the CLI line and the keys typed since, none repeated', async () => {
    const S0 = 'l1\nab\nl3'
    const S1 = 'l1\nabc\nl3'
    const S2 = 'l1\nabcd\nl3'
    setup(() => cliEdit((ss) => ss.map((s) => ({ ...s, content: `${s.content}\n- cli X` }))), [{ id: 'a', name: 'Today', content: S0 }])
    // The editor hands S1 to the store (refused, then rebased); the user keeps typing: S2 pending.
    const editor = createContentSync(S0)
    recordSave(editor, S1, S0)
    await state().updateSection('n1', 'a', { content: S1 })

    const stored = contents(state().notes[0]).a
    expect(stored).toBe('l1\nabc\nl3\n- cli X')
    expect(resolveExternalContent(editor, { incoming: stored, current: S2, pending: true }))
      .toEqual({ kind: 'merge', merged: 'l1\nabcd\nl3\n- cli X', conflict: false })
    expect(editor.outbox).toEqual([])
  })
})
