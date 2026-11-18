// @vitest-environment happy-dom
// Per-section `updated` (note-format.md "`updated` por sección"): every section write
// of a regular note funnels through the store's applyNoteUpdate, which stamps ONLY the
// sections whose content or name really changed. `window.noteflow` is a recording fake.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setWindowRole, useNotesStore } from '../../src/stores/notesStore'
import { NOTE_MD, noteDirname, parseNoteFolder } from '../../src/lib/noteUtils'
import type { Note, NoteWritePayload } from '../../src/types'

const NOTES_DIR = '/home/me/noteflow-notes'
const T0 = '2026-11-01T10:00:00.000Z'
const T_A = '2026-11-02T10:00:00.000Z'

function makeNote(): Note {
  const title = 'Plan'
  return {
    id: 'n1', title, tags: [], created: T0, updated: T0, archived: false, favorited: false,
    sections: [
      { id: 'a', name: 'Alpha', content: 'one', created: T0, updated: T_A },
      { id: 'b', name: 'Beta', content: 'two' }, // predates the field: no stamp
    ],
    raw: '', filePath: `${NOTES_DIR}/${noteDirname('n1', title)}`,
  }
}

let writes: NoteWritePayload[]

function installBridge() {
  const known: Record<string, (...args: unknown[]) => unknown> = {
    writeNote: async (payload) => { writes.push(payload as NoteWritePayload); return { ok: true } },
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

const state = () => useNotesStore.getState()
const section = (id: string) => state().notes[0].sections.find((s) => s.id === id)!

beforeEach(() => {
  writes = []
  installBridge()
  setWindowRole('main')
  useNotesStore.setState({ notes: [makeNote()], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

afterEach(() => {
  useNotesStore.setState({ notes: [], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

describe('notesStore — per-section updated', () => {
  it('a content edit stamps that section only, and the stamp reaches note.md', async () => {
    const before = Date.now()
    await state().updateSection('n1', 'b', { content: 'two!' })
    const stamp = section('b').updated!
    expect(Date.parse(stamp)).toBeGreaterThanOrEqual(before)
    expect(section('a').updated).toBe(T_A)
    const written = parseNoteFolder(writes[0].files[NOTE_MD], { 'a.md': 'one', 'b.md': 'two!' }, '/x')
    expect(written.sections.map((s) => s.updated)).toEqual([T_A, stamp])
  })

  it('a rename stamps it too', async () => {
    await state().updateSection('n1', 'a', { name: 'Alpha 2' })
    expect(section('a').updated).not.toBe(T_A)
  })

  it('text mode, AI visibility and reordering do not', async () => {
    await state().updateSection('n1', 'a', { isRawMode: true })
    await state().updateSection('n1', 'a', { aiHidden: true })
    await state().mutateSections('n1', (list) => [...list].reverse())
    expect(section('a').updated).toBe(T_A)
    expect(section('b')).not.toHaveProperty('updated')
  })

  it('re-saving the same content does not (the editor can emit the same markdown on mount)', async () => {
    await state().updateNote('n1', { sections: state().notes[0].sections.map((s) => ({ ...s })) })
    expect(section('a').updated).toBe(T_A)
    expect(section('b')).not.toHaveProperty('updated')
  })

  it('a new section is stamped with its own created; a duplicate does not inherit the original stamp', async () => {
    const created = '2026-11-03T10:00:00.000Z'
    await state().mutateSections('n1', (list) => [...list, { id: 'c', name: 'New', content: '', created }])
    expect(section('c').updated).toBe(created)
    const copy = await state().duplicateSection('n1', 'a', 'Alpha (copy)')
    expect(copy!.updated).toBe(copy!.created)
    expect(copy!.updated).not.toBe(T_A)
  })
})
