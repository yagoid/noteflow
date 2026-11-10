import { describe, it, expect } from 'vitest'
import {
  createUndoHistoryCache,
  isRawHistoryOf,
  isUndoHistoryKeepable,
  pruneUndoHistory,
  recordRawEdit,
  redoRaw,
  undoRaw,
  RAW_UNDO_DEPTH,
  RAW_UNDO_GROUP_MS,
  type RawUndoHistory,
} from '../../src/lib/undoHistoryCache'

const note = (id: string, sectionIds: string[], encrypted = false) => ({
  id,
  sections: sectionIds.map((sid) => ({ id: sid, name: sid, content: '', created: '' })),
  encryption: encrypted ? ({} as never) : undefined,
})

describe('createUndoHistoryCache', () => {
  it('keeps one entry per note/section', () => {
    const cache = createUndoHistoryCache<string>()
    cache.set('n1', 's1', 'a')
    cache.set('n1', 's2', 'b')
    cache.set('n2', 's1', 'c')
    expect(cache.get('n1', 's1')).toBe('a')
    expect(cache.get('n1', 's2')).toBe('b')
    expect(cache.get('n2', 's1')).toBe('c')
    cache.set('n1', 's1', 'a2')
    expect(cache.get('n1', 's1')).toBe('a2')
    expect(cache.size).toBe(3)
  })

  it('take removes the entry', () => {
    const cache = createUndoHistoryCache<string>()
    cache.set('n', 's', 'x')
    expect(cache.take('n', 's')).toBe('x')
    expect(cache.take('n', 's')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('evicts the least recently used entry past the limit', () => {
    const cache = createUndoHistoryCache<number>(3)
    cache.set('n', 'a', 1)
    cache.set('n', 'b', 2)
    cache.set('n', 'c', 3)
    cache.get('n', 'a') // a is now the most recent
    cache.set('n', 'd', 4)
    expect(cache.get('n', 'b')).toBeUndefined()
    expect(cache.get('n', 'a')).toBe(1)
    expect(cache.get('n', 'c')).toBe(3)
    expect(cache.get('n', 'd')).toBe(4)
    expect(cache.size).toBe(3)
  })

  it('re-setting an entry refreshes its recency', () => {
    const cache = createUndoHistoryCache<number>(2)
    cache.set('n', 'a', 1)
    cache.set('n', 'b', 2)
    cache.set('n', 'a', 10)
    cache.set('n', 'c', 3)
    expect(cache.get('n', 'b')).toBeUndefined()
    expect(cache.get('n', 'a')).toBe(10)
  })
})

describe('isUndoHistoryKeepable / pruneUndoHistory', () => {
  it('keeps sections of existing, readable notes', () => {
    expect(isUndoHistoryKeepable(note('n', ['s']), {}, 's')).toBe(true)
    expect(isUndoHistoryKeepable(note('n', ['s'], true), { n: 'pw' }, 's')).toBe(true)
  })

  it('rejects deleted notes and sections, and locked encrypted notes', () => {
    expect(isUndoHistoryKeepable(undefined, {}, 's')).toBe(false)
    expect(isUndoHistoryKeepable(note('n', ['other']), {}, 's')).toBe(false)
    // Locked (or just encrypted): no session password — even if sections linger.
    expect(isUndoHistoryKeepable(note('n', ['s'], true), {}, 's')).toBe(false)
  })

  it('prunes deleted notes, deleted sections and locked notes', () => {
    const cache = createUndoHistoryCache<string>()
    cache.set('kept', 's1', 'a')
    cache.set('kept', 'gone', 'b')
    cache.set('deleted', 's1', 'c')
    cache.set('locked', 's1', 'd')
    cache.set('unlocked', 's1', 'e')
    pruneUndoHistory(cache, [
      note('kept', ['s1']),
      note('locked', [], true), // lockNote / encryptNote empty the sections
      note('unlocked', ['s1'], true),
    ], { unlocked: 'pw' })
    expect(cache.get('kept', 's1')).toBe('a')
    expect(cache.get('unlocked', 's1')).toBe('e')
    expect(cache.get('kept', 'gone')).toBeUndefined()
    expect(cache.get('deleted', 's1')).toBeUndefined()
    expect(cache.get('locked', 's1')).toBeUndefined()
    expect(cache.size).toBe(2)
  })
})

describe('text-mode undo history', () => {
  const type = (h: RawUndoHistory | undefined, prev: string, next: string, at: number) => recordRawEdit(h, prev, next, at)

  it('groups edits closer than the group delay into one undo level', () => {
    let h = type(undefined, '', 'a', 1000)
    h = type(h, 'a', 'ab', 1000 + RAW_UNDO_GROUP_MS)
    h = type(h, 'ab', 'abc', 2000 + RAW_UNDO_GROUP_MS)
    expect(h.undo).toEqual(['', 'ab'])
    expect(h.content).toBe('abc')
  })

  it('undoes and redoes, the next edit opening a new level and dropping redo', () => {
    let h = type(undefined, '', 'a', 1000)
    h = type(h, 'a', 'ab', 5000)
    const u1 = undoRaw(h, 'ab')!
    expect(u1.content).toBe('a')
    const u2 = undoRaw(u1.history, 'a')!
    expect(u2.content).toBe('')
    expect(undoRaw(u2.history, '')).toBeNull()
    const r1 = redoRaw(u2.history, '')!
    expect(r1.content).toBe('a')
    // Typing right after an undo/redo is its own level, and kills the redo stack.
    h = type(r1.history, 'a', 'ax', 5001)
    expect(h.redo).toEqual([])
    expect(undoRaw(h, 'ax')!.content).toBe('a')
    expect(redoRaw(h, 'ax')).toBeNull()
  })

  it("doesn't apply to a buffer it doesn't end at (changed meanwhile)", () => {
    const h = type(type(undefined, '', 'a', 1000), 'a', 'ab', 5000)
    expect(undoRaw(h, 'external')).toBeNull()
    expect(redoRaw(undoRaw(h, 'ab')!.history, 'external')).toBeNull()
    // An edit on another buffer starts a fresh history.
    const fresh = type(h, 'external', 'external!', 9000)
    expect(fresh.undo).toEqual(['external'])
  })

  it("belongs only to the buffer it ends at (two panes on one section share it)", () => {
    // Pane 1 typed 'ab'; pane 2 still shows '' and gets 'ab' as an external update.
    const h = type(type(undefined, '', 'a', 1000), 'a', 'ab', 5000)
    expect(isRawHistoryOf(h, 'ab')).toBe(true) // pane 1's own buffer: an update there drops it
    expect(isRawHistoryOf(h, '')).toBe(false) // pane 2's stale buffer: keep it for pane 1
    expect(isRawHistoryOf(undefined, '')).toBe(false)
    // Pane 1 can still undo; once pane 2 shows 'ab' too, it shares the same history.
    expect(undoRaw(h, 'ab')!.content).toBe('a')
  })

  it('caps the undo depth', () => {
    let h: RawUndoHistory | undefined
    let text = ''
    for (let i = 0; i < RAW_UNDO_DEPTH + 10; i++) {
      h = type(h, text, text + i, i * 10_000)
      text += i
    }
    expect(h!.undo.length).toBe(RAW_UNDO_DEPTH)
  })
})
