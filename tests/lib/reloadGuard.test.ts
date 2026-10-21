import { describe, it, expect } from 'vitest'
import { keepNotesChangedDuringLoad } from '../../src/lib/reloadGuard'

type N = { id: string; filePath: string; text: string }
const note = (id: string, text: string, filePath = `/notes/${id}`): N => ({ id, filePath, text })

describe('keepNotesChangedDuringLoad', () => {
  it('takes the loaded notes when nothing changed in memory during the load', () => {
    const a = note('a', 'old')
    const b = note('b', 'old')
    const loadedA = note('a', 'from disk')
    const loadedB = note('b', 'from disk')
    expect(keepNotesChangedDuringLoad([a, b], [a, b], [loadedA, loadedB])).toEqual({ notes: [loadedA, loadedB], resync: [] })
  })

  it('keeps the in-memory copy of a note written during the load, and re-syncs it', () => {
    const a = note('a', 'v1')
    const written = note('a', 'v2 (local write landed mid-load)')
    const loadedA = note('a', 'v1 (read before the write)')
    const result = keepNotesChangedDuringLoad([a], [written], [loadedA])
    expect(result.notes).toEqual([written])
    expect(result.notes[0]).toBe(written)
    expect(result.resync).toEqual(['/notes/a'])
  })

  it('a changed copy equal to the loaded one takes the loaded one, no re-sync', () => {
    const a = note('a', 'same')
    const replaced = note('a', 'same') // e.g. an overlapping reload set a new object
    const loadedA = note('a', 'same')
    const sameText = (x: N, y: N) => x.text === y.text
    expect(keepNotesChangedDuringLoad([a], [replaced], [loadedA], sameText)).toEqual({ notes: [loadedA], resync: [] })
  })

  it('a note deleted during the load stays deleted (re-synced to check the disk)', () => {
    const a = note('a', 'x')
    const b = note('b', 'y')
    const result = keepNotesChangedDuringLoad([a, b], [b], [note('a', 'x'), note('b', 'y')])
    expect(result.notes.map((n) => n.id)).toEqual(['b'])
    expect(result.resync).toEqual(['/notes/a'])
  })

  it('a note created during the load is kept (first) and re-synced', () => {
    const a = note('a', 'x')
    const created = note('new', '')
    const loadedA = note('a', 'x')
    const result = keepNotesChangedDuringLoad([a], [created, a], [loadedA])
    expect(result.notes).toEqual([created, loadedA])
    expect(result.resync).toEqual(['/notes/new'])
  })

  it('notes the load adds or drops (disk changes) behave as a plain reload', () => {
    const a = note('a', 'x')
    const gone = note('gone', 'z')
    const added = note('added', 'w')
    const loadedA = note('a', 'x')
    expect(keepNotesChangedDuringLoad([a, gone], [a, gone], [loadedA, added])).toEqual({ notes: [loadedA, added], resync: [] })
  })

  it('re-syncs a renamed note at its current path', () => {
    const a = note('a', 'x', '/notes/old-name')
    const renamed = note('a', 'x', '/notes/new-name')
    const result = keepNotesChangedDuringLoad([a], [renamed], [note('a', 'x', '/notes/old-name')])
    expect(result.notes).toEqual([renamed])
    expect(result.resync).toEqual(['/notes/new-name'])
  })
})
