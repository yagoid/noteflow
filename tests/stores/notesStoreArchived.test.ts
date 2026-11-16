// @vitest-environment happy-dom
// The notes store when main moves notes to the local archive ("use only the
// notes from …", `notes-archived`): they leave the window's memory WITHOUT any
// delete or write reaching main, their pending saves are dropped, the reload
// that follows an emptied notes dir doesn't bring them back, and a pull that
// returns the same note adds it again. `window.noteflow` is a recording fake.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { bindArchivedNotes, setWindowRole, useNotesStore } from '../../src/stores/notesStore'
import { NOTE_MD, buildNoteWritePayload, noteDirname } from '../../src/lib/noteUtils'
import { createDebouncedSave, flushPendingEdits, hasPendingEdits } from '../../src/lib/pendingEdits'
import { linkedNoteFromWire } from '../../src/lib/linkedNotes'
import type { LinkedNoteWire, Note, NoteDirRecord, NotesArchivedEvent } from '../../src/types'

const NOTES_DIR = '/home/me/noteflow-notes'
const T0 = '2026-11-01T10:00:00.000Z'

function makeNote(id: string, extra: Partial<Note> = {}): Note {
  const title = `Note ${id}`
  return {
    id, title, tags: [], created: T0, updated: T0, archived: false, favorited: false,
    sections: [{ id: `${id}s1`, name: 'Main', content: `body of ${id}` }],
    raw: '', filePath: `${NOTES_DIR}/${noteDirname(id, title)}`,
    ...extra,
  }
}

/** The note as fs:read-all-notes returns it. */
function record(note: Note): NoteDirRecord {
  const { dir, files } = buildNoteWritePayload(null, note)
  return {
    dir,
    path: note.filePath,
    noteMd: files[NOTE_MD],
    sections: Object.entries(files).filter(([f]) => f !== NOTE_MD).map(([file, content]) => ({ file, content })),
  }
}

const synced = Array.from({ length: 14 }, (_, i) => makeNote(`n${i + 1}`, { favorited: i < 2 }))
const welcome = makeNote('w1', { localOnly: true })
// A linked note (an external file, outside the notes dir) as main's registry describes it.
const linkedWire: LinkedNoteWire = {
  id: 'lnk:abc', path: '/docs/readme.md', title: 'readme', favorited: true, archived: false,
  isRawMode: false, aiHidden: false, created: T0, updated: T0, sectionName: 'readme.md',
  status: 'ok', body: 'linked body', hash: 'h1',
}
const linked = linkedNoteFromWire(linkedWire)

const archivedEvent = (notes: Note[]): NotesArchivedEvent => ({
  noteIds: notes.map((n) => n.id),
  dirs: notes.map((n) => noteDirname(n.id, n.title)),
})

/** Every call the store makes to main, by name. */
let calls: string[]
/** What the notes dir holds (fs:read-all-notes, fs:read-note-dir). */
let disk: Note[]
/** Set by a test to answer fs:read-all-notes itself (a read still in flight). */
let readAllNotes: (() => Promise<NoteDirRecord[]>) | null
let archivedListener: ((event: NotesArchivedEvent) => void) | null

// Calls that would change the disk or a remote: none may happen here.
const MUTATING = ['writeNote', 'deleteNote', 'linkedWrite', 'linkedUpdateMeta', 'linkedUnlink']

function installBridge() {
  const known: Record<string, (...args: unknown[]) => unknown> = {
    getNotesDir: async () => NOTES_DIR,
    readAllNotes: () => (readAllNotes ? readAllNotes() : Promise.resolve(disk.map(record))),
    readNoteDir: async (dir) => {
      const note = disk.find((n) => noteDirname(n.id, n.title) === dir)
      return note ? record(note) : null
    },
    getUiState: async () => ({}),
    linkedList: async () => [linkedWire],
    linkedGet: async (idOrPath) => (idOrPath === linkedWire.id || idOrPath === linkedWire.path ? linkedWire : null),
    scheduleAlarms: () => undefined,
    setUiState: async () => undefined,
    onNotesArchived: (cb) => {
      archivedListener = cb as (event: NotesArchivedEvent) => void
      return () => { archivedListener = null }
    },
  }
  const bridge = new Proxy({}, {
    get: (_target, name: string) => (...args: unknown[]) => {
      calls.push(name)
      if (known[name]) return known[name](...args)
      throw new Error(`unexpected window.noteflow.${name}()`)
    },
  })
  ;(window as unknown as { noteflow: unknown }).noteflow = bridge
}

const state = () => useNotesStore.getState()
const ids = () => state().notes.map((n) => n.id)
/** Lets the store's fire-and-forget work (the per-note re-syncs after a reload) finish. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  calls = []
  disk = []
  readAllNotes = null
  archivedListener = null
  installBridge()
  setWindowRole('main')
  useNotesStore.setState({
    notes: [...synced, welcome, linked],
    openPanes: [{ paneId: 'p1', noteId: 'n3' }],
    activePaneId: 'p1',
    activeNoteId: 'n3',
    sessionPasswords: { n3: 'secret' },
  })
})

afterEach(() => {
  flushPendingEdits()
  vi.useRealTimers()
  setWindowRole('main')
  useNotesStore.setState({ notes: [], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

describe('notesStore.removeArchivedNotes', () => {
  it('takes the archived notes out of memory — sidebar, favorites, open pane — and nothing reaches main but the alarms', () => {
    state().removeArchivedNotes(archivedEvent(synced))
    expect(ids()).toEqual(['w1', 'lnk:abc']) // local-only and linked notes stay
    expect(state().notes.filter((n) => n.favorited).map((n) => n.id)).toEqual(['lnk:abc'])
    expect(state().openPanes).toEqual([{ paneId: 'p1', noteId: 'w1' }])
    expect(state().activeNoteId).toBe('w1')
    expect(state().sessionPasswords).toEqual({})
    expect(calls).toEqual(['scheduleAlarms'])
    expect(calls.filter((c) => MUTATING.includes(c))).toEqual([])
  })

  it('with nothing else in the store the editor is left empty', () => {
    useNotesStore.setState({ notes: [...synced] })
    state().removeArchivedNotes(archivedEvent(synced))
    expect(ids()).toEqual([])
    expect(state().openPanes).toEqual([])
    expect(state().activeNoteId).toBeNull()
  })

  it('drops their pending debounced saves: nothing is written later, not even on a flush', async () => {
    const body = createDebouncedSave()
    const kept = createDebouncedSave()
    const ran: string[] = []
    body.schedule('n3', 400, () => { ran.push('n3'); void state().updateNote('n3', { title: 'typed late' }) })
    kept.schedule('w1', 400, () => { ran.push('w1') })
    state().removeArchivedNotes(archivedEvent(synced))
    expect(hasPendingEdits('n3')).toBe(false)
    expect(hasPendingEdits('w1')).toBe(true)
    body.flush() // the editor unmounting
    vi.advanceTimersByTime(1000)
    expect(ran).toEqual(['w1'])
    // A save that was not registered (or already queued) finds no note: a no-op.
    await state().updateNote('n3', { title: 'typed late' })
    await state().updateSection('n3', 'n3s1', { content: 'x' })
    await state().archiveNote('n3')
    expect(calls.filter((c) => MUTATING.includes(c))).toEqual([])
  })

  it('the reload after an emptied notes dir no longer keeps them (and the guard still protects every other case)', async () => {
    // Without the event, an empty read while the store has notes is ignored (transient empty readdir).
    disk = []
    await state().loadNotes()
    expect(ids()).toHaveLength(16)

    state().removeArchivedNotes(archivedEvent(synced))
    disk = [welcome]
    await state().loadNotes()
    expect(ids()).toEqual(['w1', 'lnk:abc'])

    // Every note of the dir archived, nothing left on disk (the case of the bug): the
    // empty reload goes through — only the linked note, which is not in the dir, is left.
    useNotesStore.setState({ notes: [...synced, linked], openPanes: [{ paneId: 'p1', noteId: 'n1' }], activePaneId: 'p1', activeNoteId: 'n1' })
    state().removeArchivedNotes(archivedEvent(synced))
    disk = []
    await state().loadNotes()
    expect(ids()).toEqual(['lnk:abc'])
    expect(state().activeNoteId).toBe('lnk:abc')
    expect(calls.filter((c) => MUTATING.includes(c))).toEqual([])
  })

  it('a reload already in flight with the old listing does not bring them back', async () => {
    // The reload read the notes dir BEFORE the archive moved the notes out; its answer
    // reaches the store after `notes-archived` did.
    let answer!: (records: NoteDirRecord[]) => void
    readAllNotes = () => new Promise((resolve) => { answer = resolve })
    const loading = state().loadNotes()
    const listedBeforeArchive = [...synced, welcome].map(record)

    disk = [welcome] // what the archive leaves in the notes dir
    state().removeArchivedNotes(archivedEvent(synced))
    expect(ids()).toEqual(['w1', 'lnk:abc'])

    answer(listedBeforeArchive)
    await loading
    expect(ids()).toEqual(['w1', 'lnk:abc'])

    // Each note dropped meanwhile is re-read on its own: its folder is gone, it stays out.
    await settle()
    expect(calls.filter((c) => c === 'readNoteDir')).toHaveLength(synced.length)
    expect(ids()).toEqual(['w1', 'lnk:abc'])
    expect(state().openPanes).toEqual([{ paneId: 'p1', noteId: 'w1' }])
    expect(state().activeNoteId).toBe('w1')
    expect(calls.filter((c) => MUTATING.includes(c))).toEqual([])
  })

  it('a pull that brings the same note back adds it again', async () => {
    state().removeArchivedNotes(archivedEvent(synced))
    disk = [welcome, synced[2]]
    await state().loadNotes()
    expect(ids()).toEqual(['w1', 'n3', 'lnk:abc'])
    expect(state().notes.find((n) => n.id === 'n3')?.sections[0].content).toBe('body of n3')
    // …and it can be archived again by a later switch.
    state().removeArchivedNotes(archivedEvent([synced[2]]))
    expect(ids()).toEqual(['w1', 'lnk:abc'])
  })

  it('a secondary window drops them too, never jumps to another note and schedules no alarms', () => {
    setWindowRole('section')
    useNotesStore.setState({ openPanes: [{ paneId: 'section', noteId: 'n3' }], activePaneId: 'section', activeNoteId: 'n3' })
    state().removeArchivedNotes(archivedEvent(synced))
    expect(ids()).toEqual(['w1', 'lnk:abc'])
    expect(state().openPanes).toEqual([])
    expect(state().activeNoteId).toBeNull()
    expect(calls).toEqual([])
  })

  it('an event about notes this window does not hold changes nothing', () => {
    const before = state().notes
    state().removeArchivedNotes({ noteIds: ['zzz'], dirs: ['other-zzz'] })
    expect(state().notes).toBe(before)
    expect(calls).toEqual([])
  })

  it('bindArchivedNotes wires main\'s broadcast to the store and unbinds', () => {
    const unbind = bindArchivedNotes()
    archivedListener!(archivedEvent(synced))
    expect(ids()).toEqual(['w1', 'lnk:abc'])
    unbind()
    expect(archivedListener).toBeNull()
  })
})
