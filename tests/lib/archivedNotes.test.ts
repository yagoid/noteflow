// Notes main moved to the local archive ("use only the notes from …") leave the
// window's store: which notes go, and where the editor lands (src/lib/archivedNotes.ts).
import { describe, it, expect } from 'vitest'
import { archivedNoteIds, withoutArchivedNotes } from '../../src/lib/archivedNotes'
import type { PaneLayout } from '../../src/lib/paneUtils'

interface TestNote {
  id: string
  filePath: string
  archived?: boolean
  localOnly?: boolean
  linked?: { path: string }
}

const NOTES_DIR = 'C:\\Users\\me\\noteflow-notes'
const note = (id: string, dir: string, extra: Partial<TestNote> = {}): TestNote => ({ id, filePath: `${NOTES_DIR}\\${dir}`, ...extra })

// 14 synced notes — the case of the bug: every one archived, the dir left empty.
const synced = Array.from({ length: 14 }, (_, i) => note(`n${i + 1}`, `note-${i + 1}-n${i + 1}`))
const welcome = note('w1', 'welcome-w1', { localOnly: true })
const linked: TestNote = { id: 'lnk:abc', filePath: 'D:\\docs\\readme.md', linked: { path: 'D:\\docs\\readme.md' } }

const event = (notes: TestNote[]) => ({
  noteIds: notes.map((n) => n.id),
  dirs: notes.map((n) => n.filePath.split('\\').pop()!),
})

const layout = (panes: Array<[string, string]>, active: string | null): PaneLayout => ({
  panes: panes.map(([paneId, noteId]) => ({ paneId, noteId })),
  activePaneId: active,
})

const main = { fallbackToAnotherNote: true, newPaneId: 'new' }
const secondary = { fallbackToAnotherNote: false, newPaneId: 'new' }

describe('archivedNoteIds', () => {
  it('matches the store notes by id', () => {
    expect([...archivedNoteIds([...synced, welcome], { noteIds: ['n2', 'n9', 'unknown'], dirs: [] })]).toEqual(['n2', 'n9'])
  })

  it('matches by folder name when main could not read the id (case-insensitive, / or \\, trailing separator)', () => {
    const notes = [
      note('a', 'Groceries-a'),
      { id: 'b', filePath: '/home/me/.local/share/noteflow-notes/todo-b/' },
      note('c', 'other-c'),
    ]
    expect([...archivedNoteIds(notes, { noteIds: [], dirs: ['groceries-A', 'todo-b'] })]).toEqual(['a', 'b'])
  })

  it('never takes a linked note, even if the event names its id or its file', () => {
    expect(archivedNoteIds([linked, synced[0]], { noteIds: ['lnk:abc'], dirs: ['readme.md'] }).size).toBe(0)
  })

  it('an empty event, or one about notes this window does not have, matches nothing', () => {
    expect(archivedNoteIds(synced, { noteIds: [], dirs: [] }).size).toBe(0)
    expect(archivedNoteIds(synced, { noteIds: ['zzz'], dirs: ['zzz-zzz'] }).size).toBe(0)
  })
})

describe('withoutArchivedNotes', () => {
  it('every note archived and nothing else in the store: no notes, no panes, no active note', () => {
    const state = { notes: synced, layout: layout([['p1', 'n3']], 'p1'), sessionPasswords: {} }
    const out = withoutArchivedNotes(state, event(synced), main)!
    expect(out.notes).toEqual([])
    expect(out.layout).toEqual({ panes: [], activePaneId: null })
    expect(out.removed.size).toBe(14)
  })

  it('local-only and linked notes stay (same objects, same order); the editor moves to the first one', () => {
    const notes = [synced[0], welcome, synced[1], linked]
    const state = { notes, layout: layout([['p1', 'n1']], 'p1'), sessionPasswords: {} }
    const out = withoutArchivedNotes(state, event(synced), main)!
    expect(out.notes).toHaveLength(2)
    expect(out.notes[0]).toBe(welcome)
    expect(out.notes[1]).toBe(linked)
    // The pane that showed the archived note is reused for the fallback.
    expect(out.layout).toEqual({ panes: [{ paneId: 'p1', noteId: 'w1' }], activePaneId: 'p1' })
  })

  it('the fallback prefers a note that is not in the app archive; with only archived ones, the first', () => {
    const old = note('o1', 'old-o1', { archived: true, localOnly: true })
    const state = (notes: TestNote[]) => ({ notes, layout: layout([['p1', 'n1']], 'p1'), sessionPasswords: {} })
    expect(withoutArchivedNotes(state([synced[0], old, welcome]), event(synced), main)!.layout.panes).toEqual([{ paneId: 'p1', noteId: 'w1' }])
    expect(withoutArchivedNotes(state([synced[0], old]), event(synced), main)!.layout.panes).toEqual([{ paneId: 'p1', noteId: 'o1' }])
  })

  it('without an active pane the fallback pane takes the new pane id', () => {
    const state = { notes: [synced[0], welcome], layout: layout([['p1', 'n1']], null), sessionPasswords: {} }
    expect(withoutArchivedNotes(state, event(synced), main)!.layout).toEqual({ panes: [{ paneId: 'new', noteId: 'w1' }], activePaneId: 'new' })
  })

  it('split view: only the panes of archived notes close; a surviving active pane stays active', () => {
    const state = {
      notes: [...synced, welcome, linked],
      layout: layout([['p1', 'n1'], ['p2', 'w1'], ['p3', 'n2'], ['p4', 'lnk:abc']], 'p2'),
      sessionPasswords: {},
    }
    const out = withoutArchivedNotes(state, event(synced), main)!
    expect(out.layout).toEqual(layout([['p2', 'w1'], ['p4', 'lnk:abc']], 'p2'))
  })

  it('split view: when the active pane showed an archived note, the next surviving pane becomes active', () => {
    const state = {
      notes: [...synced, welcome, linked],
      layout: layout([['p1', 'w1'], ['p2', 'n1'], ['p3', 'n2'], ['p4', 'lnk:abc']], 'p2'),
      sessionPasswords: {},
    }
    expect(withoutArchivedNotes(state, event(synced), main)!.layout).toEqual(layout([['p1', 'w1'], ['p4', 'lnk:abc']], 'p4'))
    // …and the last survivor when none follows it.
    const last = { ...state, layout: layout([['p1', 'w1'], ['p2', 'n1']], 'p2') }
    expect(withoutArchivedNotes(last, event(synced), main)!.layout).toEqual(layout([['p1', 'w1']], 'p1'))
  })

  it('a layout that shows none of the archived notes is returned as is', () => {
    const state = { notes: [...synced, welcome], layout: layout([['p1', 'w1']], 'p1'), sessionPasswords: {} }
    expect(withoutArchivedNotes(state, event(synced), main)!.layout).toBe(state.layout)
  })

  it('a secondary window never jumps to another note: its pane just empties', () => {
    const state = { notes: [synced[0], welcome], layout: layout([['section', 'n1']], 'section'), sessionPasswords: {} }
    const out = withoutArchivedNotes(state, event(synced), secondary)!
    expect(out.notes).toEqual([welcome])
    expect(out.layout).toEqual({ panes: [], activePaneId: null })
  })

  it('drops the session unlock of the archived notes only', () => {
    const state = {
      notes: [synced[0], synced[1], welcome],
      layout: layout([], null),
      sessionPasswords: { n1: 'pw1', w1: 'pw-welcome', n2: 'pw2' },
    }
    expect(withoutArchivedNotes(state, event(synced), main)!.sessionPasswords).toEqual({ w1: 'pw-welcome' })
  })

  it('only part of the notes archived (an undo that failed half way): the rest stay', () => {
    const state = { notes: [...synced, welcome], layout: layout([['p1', 'n5']], 'p1'), sessionPasswords: {} }
    const out = withoutArchivedNotes(state, event([synced[0], synced[4]]), main)!
    expect(out.notes.map((n) => n.id)).toEqual([...synced.filter((n) => n.id !== 'n1' && n.id !== 'n5').map((n) => n.id), 'w1'])
    expect(out.layout.panes).toEqual([{ paneId: 'p1', noteId: 'n2' }])
    expect([...out.removed].sort()).toEqual(['n1', 'n5'])
  })

  it('nothing of the event in the store → null (no state change), the input untouched', () => {
    const state = { notes: [welcome, linked], layout: layout([['p1', 'w1']], 'p1'), sessionPasswords: { w1: 'pw' } }
    const snapshot = structuredClone(state)
    expect(withoutArchivedNotes(state, event(synced), main)).toBeNull()
    expect(withoutArchivedNotes(state, { noteIds: [], dirs: [] }, main)).toBeNull()
    expect(state).toEqual(snapshot)
  })

  it('does not mutate its input; a note with the same id loaded later is a new note for the store', () => {
    const notes = [...synced, welcome]
    const state = { notes, layout: layout([['p1', 'n1']], 'p1'), sessionPasswords: { n1: 'pw' } }
    const snapshot = structuredClone(state)
    const out = withoutArchivedNotes(state, event(synced), main)!
    expect(state).toEqual(snapshot)
    // The removal keeps no trace of the ids: the pull bringing n1 back just adds it.
    const afterPull = [note('n1', 'note-1-n1'), ...out.notes]
    expect(withoutArchivedNotes({ ...out, notes: afterPull }, { noteIds: [], dirs: [] }, main)).toBeNull()
    expect(afterPull.map((n) => n.id)).toEqual(['n1', 'w1'])
  })
})
