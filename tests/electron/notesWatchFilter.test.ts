import { describe, it, expect } from 'vitest'
import {
  changedExpectedFiles,
  GROUPS_METADATA_FILES,
  isGroupsMetadataFile,
  OWN_WRITE_TTL_MS,
  OwnNoteWrites,
  sameNoteFileText,
  settleNoteDirEvents,
} from '../../electron/notesWatchFilter'

describe('isGroupsMetadataFile', () => {
  it('matches the three files loadGroups reads', () => {
    expect(GROUPS_METADATA_FILES).toEqual(['groups.json', 'folders.json', 'note-order.json'])
    for (const f of GROUPS_METADATA_FILES) expect(isGroupsMetadataFile(f)).toBe(true)
  })

  it('ignores other root metadata files', () => {
    for (const f of ['section-colors.json', 'templates.json', 'snippets.json', 'ui-settings.json', 'README.md']) {
      expect(isGroupsMetadataFile(f)).toBe(false)
    }
  })

  it('ignores temp files of atomic writes and nested paths', () => {
    expect(isGroupsMetadataFile('groups.json.tmp')).toBe(false)
    expect(isGroupsMetadataFile('.groups.json.123.tmp')).toBe(false)
    expect(isGroupsMetadataFile('some-note/groups.json')).toBe(false)
    expect(isGroupsMetadataFile('Groups.json')).toBe(false)
    expect(isGroupsMetadataFile('')).toBe(false)
  })
})

// The watcher used to ignore a note folder for 1.5 s after every save of ours: a CLI
// write landing in that window (≈2 s after the last keystroke, with the editor's
// debounce) was taken for our echo and lost. Echoes are now told by content.
describe('settleNoteDirEvents — our own saves vs external writes', () => {
  const DIR = 'recetas-n1'
  const bytes = (s: string) => Buffer.from(s, 'utf8')
  const T = 1_000_000

  /** `disk`: rel → content (missing = no file). */
  function settle(own: OwnNoteWrites, rels: string[], disk: Record<string, string>, now = T + 200) {
    return settleNoteDirEvents(own, DIR, rels, (rel) => (rel in disk ? bytes(disk[rel]) : null), now)
  }

  function saved(files: Record<string, string | null>, at = T): OwnNoteWrites {
    const own = new OwnNoteWrites()
    for (const [f, content] of Object.entries(files)) own.record(DIR, f, content, at)
    return own
  }

  it('the events of our own save (note.md + a section, the folder itself, repeated) are its echo', () => {
    const own = saved({ 'note.md': 'meta', 'a.md': 'one\ntwo' })
    const r = settle(own, [DIR, `${DIR}/note.md`, `${DIR}/a.md`, `${DIR}/a.md`], { [`${DIR}/note.md`]: 'meta', [`${DIR}/a.md`]: 'one\ntwo' })
    expect(r).toEqual({ external: false, externalFiles: [] })
  })

  it('a CLI write a few ms after our save is external (no time window hides it)', () => {
    const own = saved({ 'note.md': 'meta', 'a.md': 'one' })
    const r = settle(own, [`${DIR}/note.md`, `${DIR}/a.md`], { [`${DIR}/note.md`]: 'meta cli', [`${DIR}/a.md`]: 'one\n- cli X' }, T + 5)
    expect(r).toEqual({ external: true, externalFiles: [`${DIR}/note.md`, `${DIR}/a.md`] })
  })

  it('a file of the folder we did not write (a section the CLI created) is external', () => {
    const own = saved({ 'note.md': 'meta' })
    const r = settle(own, [`${DIR}/note.md`, `${DIR}/b.md`], { [`${DIR}/note.md`]: 'meta', [`${DIR}/b.md`]: 'new' })
    expect(r).toEqual({ external: true, externalFiles: [`${DIR}/b.md`] })
  })

  it('a section file we deleted is our echo while it stays deleted; recreated by someone else, it is external', () => {
    const own = saved({ 'note.md': 'meta', 'gone.md': null })
    expect(settle(own, [`${DIR}/gone.md`], { [`${DIR}/note.md`]: 'meta' }).external).toBe(false)
    expect(settle(own, [`${DIR}/gone.md`], { [`${DIR}/gone.md`]: 'back' })).toEqual({ external: true, externalFiles: [`${DIR}/gone.md`] })
  })

  it('a file found different is forgotten: our old bytes coming back later (a pull restoring them) are external too', () => {
    const own = saved({ 'a.md': 'mine' })
    expect(settle(own, [`${DIR}/a.md`], { [`${DIR}/a.md`]: 'theirs' }).external).toBe(true)
    expect(settle(own, [`${DIR}/a.md`], { [`${DIR}/a.md`]: 'mine' }).external).toBe(true)
  })

  it('a newer save of ours replaces the older one: only its bytes are its echo', () => {
    const own = saved({ 'a.md': 'v1' })
    own.record(DIR, 'a.md', 'v2', T + 100)
    expect(settle(own, [`${DIR}/a.md`], { [`${DIR}/a.md`]: 'v2' }).external).toBe(false)
    expect(settle(own, [`${DIR}/a.md`], { [`${DIR}/a.md`]: 'v1' }).external).toBe(true)
  })

  it('an event of the folder itself: ours while we wrote it and note.md is there; external for an unknown folder or a deleted note.md', () => {
    const own = saved({ 'note.md': 'meta' })
    expect(settle(own, [DIR], { [`${DIR}/note.md`]: 'meta' }).external).toBe(false)
    expect(settle(own, [DIR], {})).toEqual({ external: true, externalFiles: [] })
    expect(settle(new OwnNoteWrites(), [DIR], { [`${DIR}/note.md`]: 'meta' })).toEqual({ external: true, externalFiles: [] })
  })

  it('a folder never written by us: every file event is external (as before)', () => {
    const r = settle(new OwnNoteWrites(), [`${DIR}/note.md`], { [`${DIR}/note.md`]: 'meta' })
    expect(r).toEqual({ external: true, externalFiles: [`${DIR}/note.md`] })
  })

  it('bytes, not decoded text: non-ASCII content written by us matches its disk bytes', () => {
    const text = 'acción ✓ 🤖abc:done\r\n'
    const own = saved({ 'a.md': text })
    expect(settle(own, [`${DIR}/a.md`], { [`${DIR}/a.md`]: text }).external).toBe(false)
    expect(settle(own, [`${DIR}/a.md`], { [`${DIR}/a.md`]: text.replace('\r\n', '\n') }).external).toBe(true)
  })

  it('memory is bounded: entries expire after the TTL (then an event is judged external, as with no record)', () => {
    const own = saved({ 'a.md': 'x' })
    expect(settle(own, [`${DIR}/a.md`], { [`${DIR}/a.md`]: 'x' }, T + OWN_WRITE_TTL_MS + 1).external).toBe(true)
    own.record('other', 'b.md', 'y', T + OWN_WRITE_TTL_MS + 1) // a later write prunes the expired ones
    expect(own.size).toBe(1)
  })

  it('wroteDirWithin: the live catch-up still waits while a save of the folder settles', () => {
    const own = saved({ 'a.md': 'x' })
    expect(own.wroteDirWithin(DIR, 1500, T + 1000)).toBe(true)
    expect(own.wroteDirWithin(DIR, 1500, T + 2000)).toBe(false)
    expect(own.wroteDirWithin('other', 1500, T)).toBe(false)
  })
})

describe('changedExpectedFiles — conditional note writes', () => {
  it('nothing changed → empty', () => {
    const disk: Record<string, string> = { 'note.md': 'meta', 'a.md': 'one' }
    expect(changedExpectedFiles({ 'note.md': 'meta', 'a.md': 'one' }, (f) => disk[f] ?? null)).toEqual([])
  })

  it('a file rewritten by the CLI → listed', () => {
    const disk: Record<string, string> = { 'note.md': 'meta2', 'a.md': 'one\n- cli X' }
    expect(changedExpectedFiles({ 'note.md': 'meta', 'a.md': 'one' }, (f) => disk[f] ?? null)).toEqual(['note.md', 'a.md'])
  })

  it('a new file ("") must not exist with content; a missing file reads as empty', () => {
    expect(changedExpectedFiles({ 'b.md': '' }, () => null)).toEqual([])
    expect(changedExpectedFiles({ 'b.md': '' }, () => 'created elsewhere')).toEqual(['b.md'])
    expect(changedExpectedFiles({ 'note.md': 'meta' }, () => null)).toEqual(['note.md'])
  })

  it('compares like the renderer reads: BOM and CRLF do not count', () => {
    expect(sameNoteFileText('﻿a\r\nb', 'a\nb')).toBe(true)
    expect(sameNoteFileText('a\nb ', 'a\nb')).toBe(false)
  })
})
