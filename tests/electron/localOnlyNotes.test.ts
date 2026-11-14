// Local-only notes (`localOnly: true` in note.md — the first-run welcome note):
// the detection helpers of electron/localOnlyNotes.ts and the round-trip of the
// flag through the three format mirrors (main, renderer, CLI). Losing the flag
// on any save would silently start syncing the note.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'node:module'
import {
  isLocalOnlyNoteMd,
  noteDirOfSyncPath,
  isLocalOnlyDir,
  isLocalOnlySyncPath,
  listSyncedNoteDirs,
  primeLocalOnlyDirs,
  resetLocalOnlyMemory,
} from '../../electron/localOnlyNotes'
import { serializeNoteFolder as serializeDisk, parseNoteDir, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import { parseNoteFolder, serializeNoteFolder as serializeRenderer, buildNoteWritePayload } from '../../src/lib/noteUtils'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js') as {
  splitFrontmatter: (raw: string) => { frontmatter: string; body: string }
  parseNoteYaml: (yaml: string) => Record<string, unknown> & { sections: unknown[] }
  serializeNoteMd: (note: Record<string, unknown>, opts?: { preserveUpdated?: boolean }) => string
  isLocalOnlyNoteMd: (noteMd: string) => boolean
}

const T = '2026-11-14T10:00:00.000Z'

function diskNote(extra: Partial<DiskNote> = {}): DiskNote {
  return {
    id: 'abc12345',
    title: 'Welcome',
    tags: [],
    created: T,
    updated: T,
    sections: [{ id: 'sec001', name: 'Welcome', content: 'hi', created: T }],
    ...extra,
  }
}

describe('isLocalOnlyNoteMd', () => {
  it('detects the top-level flag as written by every serializer', () => {
    expect(isLocalOnlyNoteMd(serializeDisk(diskNote({ localOnly: true })).files[NOTE_MD])).toBe(true)
    expect(isLocalOnlyNoteMd('---\nid: a\nlocalOnly: True\n---\n')).toBe(true) // YAML boolean too
    expect(isLocalOnlyNoteMd('﻿---\r\nid: a\r\nlocalOnly: true\r\n---\r\n')).toBe(true) // BOM + CRLF
  })

  it('agrees with the parsers: only the boolean counts, never a quoted string', () => {
    for (const fm of ['localOnly: true', 'localOnly: True', 'localOnly: "true"', "localOnly: 'true'", 'localOnly: yes']) {
      const md = `---\nid: abc12345\ntitle: T\n${fm}\nsections:\n  - id: sec001\n    name: N\n    file: sec001.md\n---\n`
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-localonly-q-'))
      try {
        fs.writeFileSync(path.join(dir, NOTE_MD), md, 'utf-8')
        const kept = parseNoteDir(dir)?.localOnly === true
        expect(isLocalOnlyNoteMd(md)).toBe(kept)
        expect(parseNoteFolder(md, {}, '/n').localOnly === true).toBe(kept)
        expect(cli.isLocalOnlyNoteMd(md)).toBe(kept)
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('is false without the flag, with false, indented, or outside the frontmatter', () => {
    expect(isLocalOnlyNoteMd(serializeDisk(diskNote()).files[NOTE_MD])).toBe(false)
    expect(isLocalOnlyNoteMd('---\nid: a\nlocalOnly: false\n---\n')).toBe(false)
    expect(isLocalOnlyNoteMd('---\nid: a\nsections:\n  - id: s\n    localOnly: true\n---\n')).toBe(false)
    expect(isLocalOnlyNoteMd('no frontmatter\nlocalOnly: true\n')).toBe(false)
    expect(isLocalOnlyNoteMd('---\nid: a\n---\nlocalOnly: true\n')).toBe(false)
    expect(isLocalOnlyNoteMd('')).toBe(false)
  })

  it('the CLI mirror answers the same', () => {
    const samples = [
      serializeDisk(diskNote({ localOnly: true })).files[NOTE_MD],
      serializeDisk(diskNote()).files[NOTE_MD],
      '---\nid: a\nlocalOnly: false\n---\n',
      '---\nid: a\nsections:\n  - id: s\n    localOnly: true\n---\n',
      '---\nid: a\n---\nlocalOnly: true\n',
    ]
    for (const s of samples) expect(cli.isLocalOnlyNoteMd(s)).toBe(isLocalOnlyNoteMd(s))
  })
})

describe('noteDirOfSyncPath', () => {
  it('maps note files to their folder and root files to null', () => {
    expect(noteDirOfSyncPath('welcome-abc12345/note.md')).toBe('welcome-abc12345')
    expect(noteDirOfSyncPath('welcome-abc12345/sec001.md')).toBe('welcome-abc12345')
    expect(noteDirOfSyncPath('welcome-abc12345\\sec001.md')).toBe('welcome-abc12345')
    expect(noteDirOfSyncPath('groups.json')).toBeNull()
    expect(noteDirOfSyncPath('.noteflow-format')).toBeNull()
    expect(noteDirOfSyncPath('/abs.md')).toBeNull()
  })
})

describe('local-only folders on disk', () => {
  let notesDir: string
  const write = (dir: string, note: DiskNote) => {
    fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
    for (const [f, c] of Object.entries(serializeDisk(note, { preserveUpdated: true }).files)) {
      fs.writeFileSync(path.join(notesDir, dir, f), c, 'utf-8')
    }
  }

  beforeEach(() => {
    notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-localonly-'))
    resetLocalOnlyMemory()
    write('welcome-aaaa1111', diskNote({ id: 'aaaa1111', localOnly: true }))
    write('normal-bbbb2222', diskNote({ id: 'bbbb2222', title: 'Normal' }))
  })
  afterEach(() => fs.rmSync(notesDir, { recursive: true, force: true }))

  it('isLocalOnlyDir / isLocalOnlySyncPath read the anchor', () => {
    expect(isLocalOnlyDir(notesDir, 'welcome-aaaa1111')).toBe(true)
    expect(isLocalOnlyDir(notesDir, 'normal-bbbb2222')).toBe(false)
    expect(isLocalOnlySyncPath(notesDir, 'welcome-aaaa1111/sec001.md')).toBe(true)
    expect(isLocalOnlySyncPath(notesDir, 'welcome-aaaa1111/note.md')).toBe(true)
    expect(isLocalOnlySyncPath(notesDir, 'normal-bbbb2222/note.md')).toBe(false)
    expect(isLocalOnlySyncPath(notesDir, 'groups.json')).toBe(false)
    expect(isLocalOnlySyncPath(null, 'welcome-aaaa1111/note.md')).toBe(false)
  })

  it('listSyncedNoteDirs leaves the local-only folder out', () => {
    expect(listSyncedNoteDirs(notesDir)).toEqual(['normal-bbbb2222'])
  })

  it('a deleted local-only folder is still known as local-only (primed at startup)', () => {
    primeLocalOnlyDirs(notesDir)
    fs.rmSync(path.join(notesDir, 'welcome-aaaa1111'), { recursive: true, force: true })
    expect(isLocalOnlyDir(notesDir, 'welcome-aaaa1111')).toBe(true)
    // An unknown deleted folder is not.
    fs.rmSync(path.join(notesDir, 'normal-bbbb2222'), { recursive: true, force: true })
    expect(isLocalOnlyDir(notesDir, 'normal-bbbb2222')).toBe(false)
  })

  it('a folder that loses the flag is forgotten', () => {
    primeLocalOnlyDirs(notesDir)
    write('welcome-aaaa1111', diskNote({ id: 'aaaa1111' })) // flag dropped
    expect(isLocalOnlyDir(notesDir, 'welcome-aaaa1111')).toBe(false)
    fs.rmSync(path.join(notesDir, 'welcome-aaaa1111'), { recursive: true, force: true })
    expect(isLocalOnlyDir(notesDir, 'welcome-aaaa1111')).toBe(false)
  })
})

describe('localOnly round-trips through the three format mirrors', () => {
  it('main: serialize → parseNoteDir keeps it (and it is absent on normal notes)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-localonly-rt-'))
    try {
      const { files } = serializeDisk(diskNote({ localOnly: true }), { preserveUpdated: true })
      for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), c, 'utf-8')
      expect(parseNoteDir(dir)?.localOnly).toBe(true)
      expect(serializeDisk(diskNote()).files[NOTE_MD]).not.toContain('localOnly')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('main: an encrypted local-only note keeps the flag', () => {
    const md = serializeDisk(diskNote({ localOnly: true, encryption: { alg: 'aes-256-gcm+pbkdf2', salt: 's', iv: 'i', ciphertext: 'c' } })).files[NOTE_MD]
    expect(isLocalOnlyNoteMd(md)).toBe(true)
  })

  it('renderer: parse → edit (buildNoteWritePayload) keeps it, plain and encrypted', () => {
    const noteMd = serializeDisk(diskNote({ localOnly: true })).files[NOTE_MD]
    const note = parseNoteFolder(noteMd, { 'sec001.md': 'hi' }, '/notes/welcome-abc12345')
    expect(note.localOnly).toBe(true)
    const edited = { ...note, sections: note.sections.map((s) => ({ ...s, content: 'edited' })) }
    const payload = buildNoteWritePayload(note, edited)
    expect(isLocalOnlyNoteMd(payload.files[NOTE_MD])).toBe(true)
    const encrypted = serializeRenderer({ ...note, encryption: { alg: 'aes-256-gcm+pbkdf2', salt: 's', iv: 'i', ciphertext: 'c' } })
    expect(isLocalOnlyNoteMd(encrypted.files[NOTE_MD])).toBe(true)
    // A normal note never gets it.
    const normal = parseNoteFolder(serializeDisk(diskNote()).files[NOTE_MD], { 'sec001.md': 'hi' }, '/notes/n')
    expect(normal).not.toHaveProperty('localOnly')
    expect(serializeRenderer(normal).files[NOTE_MD]).not.toContain('localOnly')
  })

  it('CLI: parse → serialize keeps it (a CLI edit never starts syncing the note)', () => {
    const appMd = serializeDisk(diskNote({ localOnly: true })).files[NOTE_MD]
    const cliNote = cli.parseNoteYaml(cli.splitFrontmatter(appMd).frontmatter)
    expect(cliNote.localOnly).toBe(true)
    const cliMd = cli.serializeNoteMd(cliNote, { preserveUpdated: true })
    expect(isLocalOnlyNoteMd(cliMd)).toBe(true)
    expect(parseNoteFolder(cliMd, { 'sec001.md': 'hi' }, '/notes/w').localOnly).toBe(true)
    // …and a normal note stays normal.
    const normal = cli.parseNoteYaml(cli.splitFrontmatter(serializeDisk(diskNote()).files[NOTE_MD]).frontmatter)
    expect(cli.serializeNoteMd(normal, { preserveUpdated: true })).not.toContain('localOnly')
  })
})
