import { describe, it, expect } from 'vitest'
import {
  OUTBOX_LIMIT,
  createContentSync,
  decideExternalContent,
  lastHandedOff,
  mapOffsetThroughChange,
  merge3,
  needsSave,
  recordSave,
  resolveExternalContent,
} from '../../src/lib/externalContentSync'

describe('decideExternalContent', () => {
  const base = { current: 'shown', outbox: [] as string[], pending: false }

  it('recognises an echo of our own saves (exact, newlines normalized), the oldest match first', () => {
    expect(decideExternalContent({ ...base, incoming: 'a', outbox: ['a', 'ab'] })).toEqual({ kind: 'echo', index: 0 })
    // Re-read from disk by a full reload: BOM stripped, CRLF → LF — still our echo.
    expect(decideExternalContent({ ...base, incoming: 'a\nb', outbox: ['﻿a\r\nb'] })).toEqual({ kind: 'echo', index: 0 })
    // Whitespace is content: an indented version is not our echo.
    expect(decideExternalContent({ ...base, incoming: '  a', outbox: ['a'] }).kind).toBe('merge')
    expect(decideExternalContent({ ...base, incoming: 'ab', outbox: ['a', 'ab'] })).toEqual({ kind: 'echo', index: 1 })
    expect(decideExternalContent({ ...base, incoming: 'a', outbox: ['a', 'b', 'a'] })).toEqual({ kind: 'echo', index: 0 })
  })
  it('echo wins over a pending edit: an older save coming back is never applied', () => {
    expect(decideExternalContent({ ...base, current: 'abc', incoming: 'a', outbox: ['a'], pending: true }).kind).toBe('echo')
  })
  it('is same when the editor already shows it (string or equivalent document)', () => {
    expect(decideExternalContent({ ...base, incoming: 'shown' }).kind).toBe('same')
    expect(decideExternalContent({ ...base, incoming: ' shown\n' }).kind).toBe('apply')
    expect(decideExternalContent({ ...base, incoming: 'other', isEquivalent: () => true }).kind).toBe('same')
  })
  it('applies genuine external content when nothing local is in flight — even if focused', () => {
    expect(decideExternalContent({ ...base, incoming: 'remote' }).kind).toBe('apply')
    expect(decideExternalContent({ ...base, incoming: 'remote', isEquivalent: () => false }).kind).toBe('apply')
  })
  it('merges when a local edit is pending or a save is still in flight', () => {
    expect(decideExternalContent({ ...base, incoming: 'remote', pending: true }).kind).toBe('merge')
    expect(decideExternalContent({ ...base, incoming: 'remote', outbox: ['mine'] }).kind).toBe('merge')
  })
})

describe('recordSave / needsSave / lastHandedOff', () => {
  it('skips contents the store already holds when nothing is in flight (no echo will come back)', () => {
    const sync = createContentSync('x')
    expect(needsSave(sync, 'x', 'x')).toBe(false)
    expect(needsSave(sync, 'x\r\n', 'x\n')).toBe(false)
    recordSave(sync, 'x', 'x')
    expect(sync.outbox).toEqual([])
    expect(needsSave(sync, 'y', 'x')).toBe(true)
    recordSave(sync, 'y', 'x')
    expect(sync.outbox).toEqual(['y'])
  })
  it('a whitespace-only edit is a change (section files are written verbatim)', () => {
    const sync = createContentSync('foo')
    expect(needsSave(sync, '    foo', 'foo')).toBe(true) // indent the first line
    expect(needsSave(sync, '\nfoo', 'foo')).toBe(true) // leading blank line
    expect(needsSave(sync, 'foo\n', 'foo')).toBe(true) // trailing newline
    recordSave(sync, '    foo', 'foo')
    expect(sync.outbox).toEqual(['    foo'])
    expect(resolveExternalContent(sync, { incoming: '    foo', current: '    foo', pending: false })).toEqual({ kind: 'echo' })
  })
  it('compares with the last content handed off, not the store, while saves are in flight', () => {
    // Sticky repro: "a" written, "ab" in flight (store still "a"), then Backspace → "a".
    const sync = createContentSync('a')
    recordSave(sync, 'ab', 'a')
    expect(lastHandedOff(sync, 'a')).toBe('ab')
    expect(needsSave(sync, 'a', 'a')).toBe(true) // must be written: "ab" will land first
    recordSave(sync, 'a', 'a')
    expect(sync.outbox).toEqual(['ab', 'a'])
    expect(needsSave(sync, 'a', 'a')).toBe(false) // the same again: nothing new
    // Both echoes are recognised; the editor ends on "a" like the store.
    expect(resolveExternalContent(sync, { incoming: 'ab', current: 'a', pending: false })).toEqual({ kind: 'echo' })
    expect(resolveExternalContent(sync, { incoming: 'a', current: 'a', pending: false })).toEqual({ kind: 'echo' })
    expect(sync.outbox).toEqual([])
  })
  it('recognises every late echo of a long burst of saves (no eviction → no duplicating merge)', () => {
    const sync = createContentSync('')
    const saves = Array.from({ length: 15 }, (_, i) => 'x'.repeat(i + 1))
    for (const saved of saves) recordSave(sync, saved, '')
    for (const echo of saves) {
      expect(resolveExternalContent(sync, { incoming: echo, current: saves.at(-1)!, pending: false }).kind).toBe('echo')
    }
    expect(sync.outbox).toEqual([])
  })
  it('only forgets entries beyond a bound far above what debounced saves can queue', () => {
    expect(OUTBOX_LIMIT).toBeGreaterThanOrEqual(100)
    const sync = createContentSync('')
    for (let i = 0; i < OUTBOX_LIMIT + 5; i++) recordSave(sync, `v${i}`, '')
    expect(sync.outbox).toHaveLength(OUTBOX_LIMIT)
    expect(sync.outbox[0]).toBe('v5')
  })
})

describe('resolveExternalContent', () => {
  it('echo drops that entry and every older one, and rebases', () => {
    const sync = createContentSync('s0')
    sync.outbox.push('s1', 's2', 's3')
    expect(resolveExternalContent(sync, { incoming: 's2', current: 's3+', pending: true })).toEqual({ kind: 'echo' })
    expect(sync.outbox).toEqual(['s3'])
    expect(sync.base).toBe('s2')
  })
  it('apply rebases on the external content and leaves the outbox empty', () => {
    const sync = createContentSync('s0')
    expect(resolveExternalContent(sync, { incoming: 'r', current: 's0', pending: false })).toEqual({ kind: 'apply' })
    expect(sync.base).toBe('r')
    expect(sync.outbox).toEqual([])
  })
  it('merges a pending local edit with the external content against the old base', () => {
    const sync = createContentSync('one\ntwo\nthree')
    const result = resolveExternalContent(sync, {
      incoming: 'one\ntwo\nthree\nfour',
      current: 'ONE\ntwo\nthree',
      pending: true,
    })
    expect(result).toEqual({ kind: 'merge', merged: 'ONE\ntwo\nthree\nfour', conflict: false })
    expect(sync.base).toBe('one\ntwo\nthree\nfour')
  })
  it('merge keeps the outbox: a late echo of an in-flight save is still ignored', () => {
    const sync = createContentSync('a\nb')
    recordSave(sync, 'A\nb', 'a\nb')
    const merged = resolveExternalContent(sync, { incoming: 'a\nB', current: 'A\nb', pending: false })
    expect(merged).toEqual({ kind: 'merge', merged: 'A\nB', conflict: false })
    expect(sync.outbox).toEqual(['A\nb'])
    expect(resolveExternalContent(sync, { incoming: 'A\nb', current: 'A\nB', pending: true })).toEqual({ kind: 'echo' })
  })
  it('normalizes base and incoming (not the editor text) before merging', () => {
    const sync = createContentSync('* a\n* b')
    const result = resolveExternalContent(sync, {
      incoming: '* a\n* b\n* c',
      current: '- a\n- B',
      pending: true,
      normalize: (md) => md.replace(/^\* /gm, '- '),
    })
    expect(result).toEqual({ kind: 'merge', merged: '- a\n- B\n- c', conflict: false })
  })
  it('the B1 race: a remote edit arriving while typing survives the next save', () => {
    // Device B's edit lands while A has a pending keystroke: it is merged, not skipped.
    const sync = createContentSync('hello')
    const result = resolveExternalContent(sync, { incoming: 'hello\nfrom B', current: 'hello!', pending: true })
    expect(result).toEqual({ kind: 'merge', merged: 'hello!\nfrom B', conflict: false })
  })
})

describe('merge3', () => {
  it('one side unchanged → the other side', () => {
    expect(merge3('a\nb', 'a\nb', 'a\nB')).toEqual({ text: 'a\nB', conflict: false })
    expect(merge3('a\nb', 'A\nb', 'a\nb')).toEqual({ text: 'A\nb', conflict: false })
  })
  it('both sides identical → once', () => {
    expect(merge3('a', 'a\nx', 'a\nx')).toEqual({ text: 'a\nx', conflict: false })
    expect(merge3('a\nb\nc', 'a\nX\nc\nd', 'a\nX\nc')).toEqual({ text: 'a\nX\nc\nd', conflict: false })
  })
  it('non-overlapping changes merge cleanly (adjacent lines too)', () => {
    expect(merge3('1\n2\n3\n4\n5', '1\nTWO\n3\n4\n5', '1\n2\n3\nFOUR\n5')).toEqual({ text: '1\nTWO\n3\nFOUR\n5', conflict: false })
    expect(merge3('1\n2\n3', '1\nTWO\n3', '1\n2\nTHREE')).toEqual({ text: '1\nTWO\nTHREE', conflict: false })
  })
  it('inserts at the start and at the end', () => {
    expect(merge3('a\nb', 'x\na\nb', 'a\nb\ny')).toEqual({ text: 'x\na\nb\ny', conflict: false })
  })
  it('overlapping different edits keep both, local first, and report a conflict', () => {
    expect(merge3('a\nb\nc', 'a\nLOCAL\nc', 'a\nREMOTE\nc')).toEqual({ text: 'a\nLOCAL\nREMOTE\nc', conflict: true })
    // Both inserting at the same point.
    expect(merge3('a\nb', 'a\nL\nb', 'a\nR\nb')).toEqual({ text: 'a\nL\nR\nb', conflict: true })
    // An edit vs a deletion of the same line: the edit is not lost.
    expect(merge3('a\nb\nc', 'a\nB\nc', 'a\nc')).toEqual({ text: 'a\nB\nc', conflict: true })
  })
  it('empty base', () => {
    expect(merge3('', 'local', '')).toEqual({ text: 'local', conflict: false })
    expect(merge3('', '', 'remote')).toEqual({ text: 'remote', conflict: false })
    expect(merge3('', 'local', 'remote')).toEqual({ text: 'local\nremote', conflict: true })
  })
  it('handles trailing newlines', () => {
    expect(merge3('a\nb\n', 'a\nB\n', 'a\nb\nc\n')).toEqual({ text: 'a\nB\nc\n', conflict: false })
    expect(merge3('a\nb', 'a\nb\n', 'A\nb')).toEqual({ text: 'A\nb\n', conflict: false })
  })
  it('stays correct on long notes with scattered edits', () => {
    const base = Array.from({ length: 2000 }, (_, i) => `line ${i}`)
    const local = [...base]
    local[10] = 'local 10'
    local.splice(1500, 0, 'local insert')
    const remote = [...base]
    remote[700] = 'remote 700'
    remote.splice(1999, 1)
    const expected = [...base]
    expected[10] = 'local 10'
    expected[700] = 'remote 700'
    expected.splice(1999, 1)
    expected.splice(1500, 0, 'local insert')
    expect(merge3(base.join('\n'), local.join('\n'), remote.join('\n'))).toEqual({ text: expected.join('\n'), conflict: false })
  })
})

describe('merge3 fuzz', () => {
  // Deterministic PRNG so failures reproduce.
  let seed = 42
  const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
  const word = () => 'abcd'[rand(4)] // tiny alphabet: lots of repeated lines stress the diff

  it('rebuilds each side exactly when the edits do not overlap', () => {
    for (let round = 0; round < 300; round++) {
      const base = Array.from({ length: rand(30) }, word)
      // Local edits the head of the note, remote appends past a fixed tail.
      const local = [...base]
      for (let e = rand(5); e > 0; e--) {
        const at = rand(local.length + 1)
        const op = rand(3)
        if (op === 0) local.splice(at, 0, word())
        else if (op === 1 && at < local.length) local.splice(at, 1)
        else if (at < local.length) local[at] = word() + word()
      }
      const b = [...base, 'END'].join('\n')
      const l = [...local, 'END'].join('\n')
      const r = [...base, 'END', 'TAIL'].join('\n')
      expect(merge3(b, l, r)).toEqual({ text: `${l}\nTAIL`, conflict: false })
    }
  })
})

describe('mapOffsetThroughChange', () => {
  it('keeps offsets before the change, shifts those after, clamps those inside to its start', () => {
    const before = 'hello world'
    const after = 'hello big world'
    expect(mapOffsetThroughChange(before, after, 3)).toBe(3)
    expect(mapOffsetThroughChange(before, after, 9)).toBe(13)
    expect(mapOffsetThroughChange('abcdef', 'abXYef', 3)).toBe(2)
  })
  it('clamps to the new text', () => {
    expect(mapOffsetThroughChange('abcdef', 'ab', 6)).toBe(2)
    expect(mapOffsetThroughChange('', 'abc', 0)).toBe(0)
  })
})
