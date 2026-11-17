// @vitest-environment happy-dom
// Back / forward of the main window wired to the real notes store: what the store's
// navigation actions record, what a step shows, and that a step doesn't record itself.
// `window.noteflow` is a no-op fake (only setUiState is reached).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setWindowRole, useNotesStore } from '../../src/stores/notesStore'
import { startNavHistory, useNavHistoryStore } from '../../src/stores/navHistoryStore'
import { emptyNavHistory, type NavLocation } from '../../src/lib/navHistory'
import type { Note } from '../../src/types'

const T0 = '2026-11-01T10:00:00.000Z'

function makeNote(id: string, sectionIds: string[], extra: Partial<Note> = {}): Note {
  return {
    id, title: `Title ${id}`, tags: [], created: T0, updated: T0, archived: false, favorited: false,
    sections: sectionIds.map((sid) => ({ id: sid, name: sid, content: `body ${sid}` })),
    raw: '', filePath: `/notes/${id}`,
    ...extra,
  }
}

const A = makeNote('A', ['a1', 'a2'])
const B = makeNote('B', ['b1', 'b2'])
const C = makeNote('C', ['c1'])
// Encrypted and locked: no session password.
const L = makeNote('L', [], { encryption: { v: 1 } as unknown as Note['encryption'] })

const store = () => useNotesStore.getState()
const nav = () => useNavHistoryStore.getState()
const entries = () => nav().history.entries
const location = (): NavLocation | null => nav().history.entries[nav().history.index] ?? null

let stop: () => void

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  ;(window as unknown as { noteflow: unknown }).noteflow = new Proxy({}, {
    get: () => async () => undefined,
  })
  setWindowRole('main')
  useNotesStore.setState({
    notes: [A, B, C, L],
    openPanes: [{ paneId: 'p1', noteId: 'A', sectionId: 'a1' }],
    activePaneId: 'p1',
    activeNoteId: 'A',
    contentPlace: null, noteViewId: null, brainViewOpen: false, contentReturnPlace: null,
    sessionPasswords: {},
    activeSectionByNote: {},
    pendingInitialSectionId: null,
  })
  useNavHistoryStore.setState({ history: emptyNavHistory() })
  stop = startNavHistory()
})

afterEach(() => {
  stop()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  useNotesStore.setState({ notes: [], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

describe('navigation history wired to the notes store', () => {
  it('records the starting note, note switches and the full-area views', () => {
    store().setActiveNote('B')
    store().setNoteView('B')
    store().setContentView('all')
    store().setBrainView(true)
    expect(entries()).toEqual([
      { kind: 'note', noteId: 'A', sectionId: 'a1' },
      { kind: 'note', noteId: 'B' },
      { kind: 'overview', noteId: 'B' },
      { kind: 'content', place: 'all' },
      { kind: 'brain' },
    ])
  })

  it('a section change in the same note updates the current entry, not a new one', () => {
    store().setPaneSection('p1', 'a2')
    expect(entries()).toEqual([{ kind: 'note', noteId: 'A', sectionId: 'a2' }])
  })

  it('back returns to the previous note on the section where it was left; forward undoes it', () => {
    store().setPaneSection('p1', 'a2')
    store().setActiveNote('B')
    store().setPaneSection('p1', 'b2')

    nav().back()
    expect(store().activeNoteId).toBe('A')
    expect(store().pendingInitialSectionId).toBe('a2')
    expect(location()).toEqual({ kind: 'note', noteId: 'A', sectionId: 'a2' })
    // The step didn't record itself.
    expect(entries()).toHaveLength(2)

    nav().forward()
    expect(store().activeNoteId).toBe('B')
    expect(location()).toEqual({ kind: 'note', noteId: 'B', sectionId: 'b2' })
    expect(entries()).toHaveLength(2)
  })

  it('back from the content view returns to the note overview, then to the note', () => {
    store().setNoteView('A')
    store().setContentView('all')
    nav().back()
    expect(store().noteViewId).toBe('A')
    expect(store().contentPlace).toBeNull()
    nav().back()
    expect(store().noteViewId).toBeNull()
    expect(store().activeNoteId).toBe('A')
    nav().forward()
    nav().forward()
    expect(store().contentPlace).toBe('all')
  })

  it('navigating somewhere new after a back drops the forward entries', () => {
    store().setActiveNote('B')
    store().setActiveNote('C')
    nav().back()
    store().setBrainView(true)
    expect(entries().map((e) => e.kind === 'note' ? e.noteId : e.kind)).toEqual(['A', 'B', 'brain'])
  })

  it('with a split, back changes the note of the active pane and keeps the other panes', () => {
    useNotesStore.setState({
      openPanes: [{ paneId: 'p1', noteId: 'A', sectionId: 'a1' }, { paneId: 'p2', noteId: 'B', sectionId: 'b1' }],
      activePaneId: 'p2',
      activeNoteId: 'B',
    })
    // Same pane, another note: p2 switches to C (setActiveNote would collapse the split).
    store().openNoteInActivePane('C')
    expect(store().openPanes.map((p) => p.noteId)).toEqual(['A', 'C'])
    nav().back()
    expect(store().openPanes.map((p) => `${p.paneId}:${p.noteId}`)).toEqual(['p1:A', 'p2:B'])
    expect(store().activePaneId).toBe('p2')
    // A note already shown in another pane is focused there, not duplicated.
    nav().back()
    expect(store().activePaneId).toBe('p1')
    expect(store().openPanes.map((p) => p.noteId)).toEqual(['A', 'B'])
  })

  it('passes over a locked encrypted note and purges a deleted one', () => {
    store().setActiveNote('L')
    store().setActiveNote('C')
    store().setActiveNote('B')
    // C is deleted.
    useNotesStore.setState({ notes: [A, B, L] })
    nav().back()
    expect(store().activeNoteId).toBe('A')
    expect(entries().map((e) => (e.kind === 'note' ? e.noteId : e.kind))).toEqual(['A', 'L', 'B'])
    // Unlocked later, it is reachable again.
    useNotesStore.setState({ sessionPasswords: { L: 'pw' } })
    nav().forward()
    expect(store().activeNoteId).toBe('L')
  })

  it('does nothing at the ends of the history', () => {
    nav().back()
    expect(store().activeNoteId).toBe('A')
    expect(entries()).toHaveLength(1)
    nav().forward()
    expect(store().activeNoteId).toBe('A')
  })
})
