// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { createElement, act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useNotesStore } from '../../src/stores/notesStore'
import { useGroupsStore } from '../../src/stores/groupsStore'
import { useBrainGraph, type BrainGraphModel } from '../../src/components/Brain/useBrainGraph'
import type { Note } from '../../src/types'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function note(id: string, sections: number, placement: Partial<Pick<Note, 'group' | 'folder' | 'favorited'>> = {}): Note {
  return {
    id, title: `Note ${id}`, tags: [],
    created: '2024-01-01T00:00:00.000Z', updated: '2024-01-01T00:00:00.000Z',
    archived: false, favorited: false,
    sections: Array.from({ length: sections }, (_, i) => ({ id: `${id}-s${i}`, name: `Section ${i}`, content: '' })),
    raw: '', filePath: `/notes/${id}`,
    ...placement,
  }
}

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
})

/** The model the hook builds for the given vault. */
function modelFor(notes: Note[]): BrainGraphModel {
  useNotesStore.setState({ notes })
  useGroupsStore.setState({
    groups: [
      { id: 'work', name: 'Work', color: '--accent', order: 0 },
      { id: 'ai', name: '  ia generated ', color: '--text', order: 1 }, // matched ignoring case and spaces
    ],
    folders: [{ id: 'specs', name: 'Specs', groupId: 'work', order: 0 }],
    noteOrder: {},
  })
  let model: BrainGraphModel | null = null
  root = createRoot(document.createElement('div'))
  act(() => root!.render(createElement(Probe, { report: (m) => { model = m } })))
  return model!
}

/** Renders nothing: hands the hook's model to the test. */
function Probe({ report }: { report: (model: BrainGraphModel) => void }) {
  const model = useBrainGraph()
  useEffect(() => { report(model) }, [model, report])
  return null
}

describe('useBrainGraph', () => {
  const model = () => modelFor([
    note('loose', 2),
    note('plan', 1, { group: 'work' }),
    note('spec', 2, { group: 'work', folder: 'specs' }),
    note('profile', 1, { group: 'ai' }),
  ])
  const byId = (m: BrainGraphModel) => new Map(m.nodes.map((n) => [n.id, n]))

  it('marks the AI profile group as centered, and no other', () => {
    const nodes = byId(model())
    expect(nodes.get('g:ai')!.centered).toBe(true)
    expect(nodes.get('g:work')!.centered).toBeUndefined()
    expect([...nodes.values()].filter((n) => n.centered).map((n) => n.id)).toEqual(['g:ai'])
  })

  it('tags everything under a group with that group, down to the sections', () => {
    const nodes = byId(model())
    const groupOf = (id: string) => nodes.get(id)!.groupId
    expect(groupOf('f:specs')).toBe('g:work')
    expect(groupOf('n:plan')).toBe('g:work')
    expect(groupOf('n:spec')).toBe('g:work')
    expect(groupOf('s:spec-s0')).toBe('g:work')
    expect(groupOf('s:spec-s1')).toBe('g:work')
    expect(groupOf('n:profile')).toBe('g:ai')
  })

  it('leaves groups and ungrouped notes without a group', () => {
    const nodes = byId(model())
    for (const id of ['g:work', 'g:ai', 'n:loose', 's:loose-s0', 's:loose-s1']) expect(nodes.get(id)!.groupId, id).toBeUndefined()
  })

  it('keeps the structure it always built', () => {
    const m = model()
    expect(m.nodes.map((n) => n.id).sort()).toEqual([
      'f:specs', 'g:ai', 'g:work', 'n:loose', 'n:plan', 'n:profile', 'n:spec',
      's:loose-s0', 's:loose-s1', 's:spec-s0', 's:spec-s1',
    ])
    expect(m.structureEdges.map((e) => `${e.source}>${e.target}`).sort()).toEqual([
      'f:specs>n:spec', 'g:ai>n:profile', 'g:work>f:specs', 'g:work>n:plan',
      'n:loose>s:loose-s0', 'n:loose>s:loose-s1', 'n:spec>s:spec-s0', 'n:spec>s:spec-s1',
    ])
  })
})
