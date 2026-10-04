import { describe, it, expect } from 'vitest'
import {
  type PaneLayout,
  activeNoteOf,
  closePane,
  focusOrReplace,
  openInSplit,
  panesForNoteIds,
  primaryPaneForNote,
  removeNotesFromLayout,
  reorderPane,
  setPaneSection,
  singlePane,
} from '../../src/lib/paneUtils'

const split = (): PaneLayout => ({
  panes: [
    { paneId: 'p1', noteId: 'A', sectionId: 'a1' },
    { paneId: 'p2', noteId: 'B' },
    { paneId: 'p3', noteId: 'A', sectionId: 'a2' },
  ],
  activePaneId: 'p2',
})

const ids = (l: PaneLayout) => l.panes.map((p) => `${p.paneId}:${p.noteId}${p.sectionId ? `/${p.sectionId}` : ''}`)

describe('openInSplit', () => {
  it('opens a section of a note that is already open in a NEW pane', () => {
    const l = openInSplit(split(), 'A', 'a3', 'new')
    expect(ids(l)).toEqual(['p1:A/a1', 'p2:B', 'p3:A/a2', 'new:A/a3'])
    expect(l.activePaneId).toBe('new')
    expect(activeNoteOf(l)).toBe('A')
  })

  it('focuses the pane already showing exactly that note + section', () => {
    const l = openInSplit(split(), 'A', 'a2', 'new')
    expect(l.panes).toHaveLength(3)
    expect(l.activePaneId).toBe('p3')
  })

  it('a whole note already open is focused, not duplicated', () => {
    const l = openInSplit(split(), 'B', undefined, 'new')
    expect(l.panes).toHaveLength(3)
    expect(l.activePaneId).toBe('p2')
    const a = openInSplit(split(), 'A', undefined, 'new')
    expect(a.activePaneId).toBe('p1')
  })

  it('a note not open yet gets appended', () => {
    const l = openInSplit(split(), 'C', undefined, 'new')
    expect(ids(l).at(-1)).toBe('new:C')
    expect(l.activePaneId).toBe('new')
  })
})

describe('focusOrReplace / singlePane', () => {
  it('focuses an existing pane of the note and keeps the split', () => {
    const l = focusOrReplace(split(), 'A', 'new')
    expect(l.panes).toHaveLength(3)
    expect(l.activePaneId).toBe('p1')
  })

  it('prefers the active pane when it already shows the note', () => {
    const l = focusOrReplace({ ...split(), activePaneId: 'p3' }, 'A', 'new')
    expect(l.activePaneId).toBe('p3')
  })

  it('collapses to one pane that REUSES the active pane id (editor stays mounted)', () => {
    const l = focusOrReplace(split(), 'C', 'new')
    expect(ids(l)).toEqual(['p2:C'])
    expect(l.activePaneId).toBe('p2')
    expect(singlePane({ panes: [], activePaneId: null }, 'C', 'new').activePaneId).toBe('new')
  })
})

describe('closePane', () => {
  it('closing the active pane focuses its right neighbour (or the new last)', () => {
    expect(closePane(split(), 'p2').activePaneId).toBe('p3')
    expect(closePane({ ...split(), activePaneId: 'p3' }, 'p3').activePaneId).toBe('p2')
  })

  it('closing another pane keeps the active one; closing the last leaves it empty', () => {
    expect(closePane(split(), 'p1').activePaneId).toBe('p2')
    const only = { panes: [{ paneId: 'p1', noteId: 'A' }], activePaneId: 'p1' }
    expect(closePane(only, 'p1')).toEqual({ panes: [], activePaneId: null })
  })
})

describe('reorderPane', () => {
  it('moves a pane before the target index (original indices)', () => {
    expect(reorderPane(split().panes, 'p1', 3).map((p) => p.paneId)).toEqual(['p2', 'p3', 'p1'])
    expect(reorderPane(split().panes, 'p3', 0).map((p) => p.paneId)).toEqual(['p3', 'p1', 'p2'])
  })

  it('returns the same array for no-op moves', () => {
    const panes = split().panes
    expect(reorderPane(panes, 'p2', 1)).toBe(panes)
    expect(reorderPane(panes, 'p2', 2)).toBe(panes)
    expect(reorderPane(panes, 'zz', 0)).toBe(panes)
  })
})

describe('setPaneSection', () => {
  it('records the section of one pane only', () => {
    const l = setPaneSection(split(), 'p1', 'a9')
    expect(ids(l)).toEqual(['p1:A/a9', 'p2:B', 'p3:A/a2'])
  })

  it('returns the same layout when unchanged or unknown', () => {
    const base = split()
    expect(setPaneSection(base, 'p1', 'a1')).toBe(base)
    expect(setPaneSection(base, 'zz', 'a1')).toBe(base)
  })
})

describe('primaryPaneForNote', () => {
  it('is the active pane of that note, else its first pane', () => {
    expect(primaryPaneForNote(split(), 'A')?.paneId).toBe('p1')
    expect(primaryPaneForNote({ ...split(), activePaneId: 'p3' }, 'A')?.paneId).toBe('p3')
    expect(primaryPaneForNote(split(), 'Z')).toBeNull()
  })
})

describe('removeNotesFromLayout', () => {
  it('drops every pane of a removed note and keeps the active pane when possible', () => {
    const l = removeNotesFromLayout(split(), new Set(['A']), 'F', 'new')
    expect(ids(l)).toEqual(['p2:B'])
    expect(l.activePaneId).toBe('p2')
  })

  it('moves focus to the next surviving pane when the active one goes', () => {
    const l = removeNotesFromLayout(split(), new Set(['B']), 'F', 'new')
    expect(ids(l)).toEqual(['p1:A/a1', 'p3:A/a2'])
    expect(l.activePaneId).toBe('p3')
  })

  it('falls back to a single pane (reusing the active id) or to empty without fallback', () => {
    const l = removeNotesFromLayout(split(), new Set(['A', 'B']), 'F', 'new')
    expect(ids(l)).toEqual(['p2:F'])
    expect(removeNotesFromLayout(split(), new Set(['A', 'B']), null, 'new')).toEqual({ panes: [], activePaneId: null })
  })

  it('is a no-op when no open note was removed', () => {
    const base = split()
    expect(removeNotesFromLayout(base, new Set(['Z']), 'F', 'new')).toBe(base)
  })
})

describe('panesForNoteIds', () => {
  let n = 0
  const makeId = () => `gen${++n}`

  it('[id] of an open note keeps ITS pane (active first) and drops the rest', () => {
    const l = panesForNoteIds({ ...split(), activePaneId: 'p3' }, ['A'], makeId)
    expect(ids(l)).toEqual(['p3:A/a2'])
    expect(l.activePaneId).toBe('p3')
  })

  it('[id] of a note not open takes over the active pane id', () => {
    const l = panesForNoteIds(split(), ['C'], makeId)
    expect(ids(l)).toEqual(['p2:C'])
    expect(l.activePaneId).toBe('p2')
  })

  it('several ids reuse panes by note and create the missing ones', () => {
    n = 0
    const l = panesForNoteIds(split(), ['B', 'A', 'C'], makeId)
    expect(ids(l)).toEqual(['p2:B', 'p1:A/a1', 'gen1:C'])
    expect(l.activePaneId).toBe('p2')
  })
})
