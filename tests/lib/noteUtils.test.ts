import { describe, it, expect } from 'vitest'
import {
  parseNoteFolder,
  serializeNoteFolder,
  buildNoteWritePayload,
  extractTitle,
  extractTags,
  createEmptyNote,
  noteDirname,
  sectionFilename,
  pathBasename,
  NOTE_MD,
} from '../../src/lib/noteUtils'
import { encryptSections, decryptSections } from '../../src/lib/cryptoUtils'
import type { Note } from '../../src/types'
import { useLanguageStore } from '../../src/stores/languageStore'
import { getMessages } from '../../src/i18n'

// splitFrontmatter is private to noteUtils; its behaviour (frontmatter parsing,
// BOM stripping, no-frontmatter handling) is characterized through the public
// parseNoteFolder, which calls it internally on note.md.
describe('frontmatter parsing (via parseNoteFolder)', () => {
  it('reads metadata from a normal frontmatter block', () => {
    const noteMd = '---\nid: abc\ntitle: Hi\nsections: []\n---\n'
    const parsed = parseNoteFolder(noteMd, {}, '/notes/abc')
    expect(parsed.id).toBe('abc')
    expect(parsed.title).toBe('Hi')
  })

  it('strips a leading UTF-8 BOM before parsing frontmatter', () => {
    const noteMd = '﻿---\nid: abc\ntitle: Bom\nsections: []\n---\n'
    const parsed = parseNoteFolder(noteMd, {}, '/notes/abc')
    expect(parsed.id).toBe('abc')
    expect(parsed.title).toBe('Bom')
  })

  it('tolerates a note.md with no frontmatter (synthesizes defaults)', () => {
    const parsed = parseNoteFolder('no frontmatter here', {}, '/notes/x')
    // No id in frontmatter → a fresh id is generated; sections default to one.
    expect(typeof parsed.id).toBe('string')
    expect(parsed.id.length).toBeGreaterThan(0)
    expect(parsed.sections).toHaveLength(1)
  })

  it('handles a frontmatter-only note.md ending in \\n--- (no trailing newline)', () => {
    const noteMd = '---\nid: abc\ntitle: Tail\nsections: []\n---'
    const parsed = parseNoteFolder(noteMd, {}, '/notes/abc')
    expect(parsed.id).toBe('abc')
    expect(parsed.title).toBe('Tail')
  })
})

function sampleNote(): Note {
  return {
    id: 'note1234',
    title: 'My Note',
    tags: ['work'],
    created: '2024-01-01T00:00:00.000Z',
    updated: '2024-01-02T00:00:00.000Z',
    archived: false,
    favorited: false,
    sections: [
      { id: 'aaa', name: 'Note', content: 'hello world' },
      { id: 'bbb', name: 'Tasks', content: 'do things', isRawMode: true },
    ],
    raw: '',
    filePath: '/notes/my-note-note1234',
  }
}

describe('serializeNoteFolder ↔ parseNoteFolder round-trip', () => {
  it('serializes a note and parses it back to equivalent sections', () => {
    const note = sampleNote()
    const { files, sectionFiles } = serializeNoteFolder(note)

    expect(files[NOTE_MD]).toContain('id: note1234')
    expect(files[NOTE_MD]).toContain('formatVersion: 2')
    expect(sectionFiles).toEqual(['aaa.md', 'bbb.md'])
    expect(files['aaa.md']).toBe('hello world')
    expect(files['bbb.md']).toBe('do things')

    const sectionFileMap: Record<string, string> = {
      'aaa.md': files['aaa.md'],
      'bbb.md': files['bbb.md'],
    }
    const parsed = parseNoteFolder(files[NOTE_MD], sectionFileMap, note.filePath)

    expect(parsed.id).toBe('note1234')
    expect(parsed.title).toBe('My Note')
    expect(parsed.tags).toEqual(['work'])
    expect(parsed.created).toBe('2024-01-01T00:00:00.000Z')
    expect(parsed.sections.map((s) => ({ id: s.id, name: s.name, content: s.content }))).toEqual([
      { id: 'aaa', name: 'Note', content: 'hello world' },
      { id: 'bbb', name: 'Tasks', content: 'do things' },
    ])
    expect(parsed.sections[1].isRawMode).toBe(true)
  })

  it('synthesizes a section index when frontmatter has none (tolerant fallback)', () => {
    const noteMd = '---\nid: x\ntitle: T\n---\n'
    const parsed = parseNoteFolder(noteMd, { 'sec1.md': 'body one' }, '/notes/x')
    expect(parsed.sections).toHaveLength(1)
    expect(parsed.sections[0].content).toBe('body one')
  })

  it('agent.md (the reserved agent-task file) is never a section — not even in the tolerant fallback', () => {
    const noteMd = '---\nid: x\ntitle: T\n---\n'
    const agent = '<!-- task:k3f9a -->\ntitle: Fix X\n---\n<!-- /task:k3f9a -->\n'
    const parsed = parseNoteFolder(noteMd, { 'agent.md': agent, 'sec1.md': 'body one' }, '/notes/x')
    expect(parsed.sections.map((s) => s.id)).toEqual(['sec1'])
    // Alone in the folder: the note gets its default section, not the reports.
    const only = parseNoteFolder(noteMd, { 'agent.md': agent }, '/notes/x')
    expect(only.sections).toHaveLength(1)
    expect(only.sections[0].content).toBe('')
    // With an index, a file the index does not list was never read as a section.
    const indexed = '---\nid: x\ntitle: T\nsections:\n  - id: s1\n    name: Note\n    file: s1.md\n---\n'
    expect(parseNoteFolder(indexed, { 'agent.md': agent, 's1.md': 'one' }, '/notes/x').sections.map((s) => s.id)).toEqual(['s1'])
  })

  it('returns default sections for an empty folder', () => {
    const noteMd = '---\nid: x\ntitle: T\n---\n'
    const parsed = parseNoteFolder(noteMd, {}, '/notes/x')
    expect(parsed.sections).toHaveLength(1)
    expect(parsed.sections[0].name).toBe('Note')
  })
})

describe('per-section created (optional, never backfilled)', () => {
  const noteWith = (sections: Note['sections']): Note => ({ ...sampleNote(), sections })

  it('writes `created` in the section index only when present and reads it back', () => {
    const note = noteWith([
      { id: 'aaa', name: 'Note', content: 'old', isRawMode: true },
      { id: 'bbb', name: 'New', content: 'fresh', created: '2026-05-06T07:08:09.000Z' },
    ])
    const { files } = serializeNoteFolder(note)
    const noteMd = files[NOTE_MD]
    expect(noteMd.match(/created:/g)).toHaveLength(2) // note-level + the one section that has it
    expect(noteMd).toContain('    created: "2026-05-06T07:08:09.000Z"')

    const parsed = parseNoteFolder(noteMd, { 'aaa.md': 'old', 'bbb.md': 'fresh' }, note.filePath)
    expect(parsed.sections[0]).not.toHaveProperty('created')
    expect(parsed.sections[1].created).toBe('2026-05-06T07:08:09.000Z')

    // Stable across a second round-trip (ignoring the bumped `updated`)
    const again = serializeNoteFolder(parsed).files[NOTE_MD]
    expect(again.replace(/updated: .*\n/, '')).toBe(noteMd.replace(/updated: .*\n/, ''))
  })

  it('normalizes an unquoted (YAML Date) section created back to an ISO string', () => {
    const noteMd = [
      '---',
      'id: x',
      'title: T',
      'sections:',
      '  - id: s1',
      '    name: Note',
      '    file: s1.md',
      '    created: 2024-03-04T05:06:07.000Z',
      '---',
      '',
    ].join('\n')
    const parsed = parseNoteFolder(noteMd, { 's1.md': '' }, '/notes/x')
    expect(parsed.sections[0].created).toBe('2024-03-04T05:06:07.000Z')
  })

  it('does not invent a created for fallback/default sections when parsing', () => {
    const noteMd = '---\nid: x\ntitle: T\n---\n'
    expect(parseNoteFolder(noteMd, {}, '/notes/x').sections[0]).not.toHaveProperty('created')
    expect(parseNoteFolder(noteMd, { 's.md': 'b' }, '/notes/x').sections[0]).not.toHaveProperty('created')
  })

  it('createEmptyNote stamps its initial section with the note created time', () => {
    const note = createEmptyNote()
    expect(note.sections[0].created).toBe(note.created)
    expect(note.sections[0].updated).toBe(note.created)
  })

  it('createEmptyNote names its section in the UI language of the moment; parsing keeps "Note"', () => {
    const prev = useLanguageStore.getState()
    try {
      expect(createEmptyNote().sections[0].name).toBe('Note')
      useLanguageStore.setState({ lang: 'es', dict: getMessages('es') })
      expect(createEmptyNote().sections[0].name).toBe('Nota')
      // A body-only (legacy) note read while the UI is in Spanish is not renamed.
      expect(parseNoteFolder('---\nid: x\ntitle: T\n---\n', {}, '/notes/x').sections[0].name).toBe('Note')
    } finally {
      useLanguageStore.setState({ lang: prev.lang, dict: prev.dict })
    }
  })
})

describe('per-section updated (optional, never backfilled)', () => {
  const noteWith = (sections: Note['sections']): Note => ({ ...sampleNote(), sections })
  const EDITED = '2026-05-07T08:09:10.000Z'

  it('writes `updated` in the section index only when present and reads it back', () => {
    const note = noteWith([
      { id: 'aaa', name: 'Note', content: 'old', isRawMode: true },
      { id: 'bbb', name: 'New', content: 'fresh', created: '2026-05-06T07:08:09.000Z', updated: EDITED },
    ])
    const noteMd = serializeNoteFolder(note).files[NOTE_MD]
    expect(noteMd.match(/^updated:/gm)).toHaveLength(1) // the note's own
    expect(noteMd.match(/^ {4}updated:/gm)).toHaveLength(1) // the one section that has it
    expect(noteMd).toContain(`    updated: "${EDITED}"`)

    const parsed = parseNoteFolder(noteMd, { 'aaa.md': 'old', 'bbb.md': 'fresh' }, note.filePath)
    expect(parsed.sections[0]).not.toHaveProperty('updated')
    expect(parsed.sections[1].updated).toBe(EDITED)
    expect(parsed.updated).not.toBe(EDITED) // the note-level timestamp stays its own

    const again = serializeNoteFolder(parsed).files[NOTE_MD]
    expect(again.replace(/^updated: .*\n/m, '')).toBe(noteMd.replace(/^updated: .*\n/m, ''))
  })

  it('normalizes an unquoted (YAML Date) section updated; an unparseable one is kept as is (the UI falls back)', () => {
    const noteMd = [
      '---', 'id: x', 'title: T', 'sections:',
      '  - id: s1', '    name: A', '    file: s1.md', '    updated: 2024-03-04T05:06:07.000Z',
      '  - id: s2', '    name: B', '    file: s2.md', '    updated: not a date',
      '---', '',
    ].join('\n')
    const parsed = parseNoteFolder(noteMd, { 's1.md': '', 's2.md': '' }, '/notes/x')
    expect(parsed.sections[0].updated).toBe('2024-03-04T05:06:07.000Z')
    expect(parsed.sections[1].updated).toBe('not a date') // sectionEditedDate → note.updated
  })

  it('travels inside the encrypted payload (the JSON of the sections array)', async () => {
    const sections: Note['sections'] = [{ id: 'a', name: 'A', content: 'x', updated: EDITED }]
    const encryption = await encryptSections(sections, 'pw', { iterations: 100_000 })
    expect((await decryptSections(encryption, 'pw'))[0].updated).toBe(EDITED)
  })
})

describe('buildNoteWritePayload', () => {
  it('writes note.md and every section file on first write (prev = null)', () => {
    const note = sampleNote()
    const payload = buildNoteWritePayload(null, note)
    expect(payload.dir).toBe('my-note-note1234')
    expect(Object.keys(payload.files).sort()).toEqual(['aaa.md', 'bbb.md', NOTE_MD].sort())
    expect(payload.deleteFiles).toEqual([])
  })

  it('skips unchanged section files and deletes removed sections', () => {
    const prev = sampleNote()
    const next: Note = {
      ...prev,
      // keep 'aaa' unchanged, change 'bbb', drop nothing, add 'ccc'
      sections: [
        { id: 'aaa', name: 'Note', content: 'hello world' },
        { id: 'bbb', name: 'Tasks', content: 'CHANGED' },
        { id: 'ccc', name: 'Extra', content: 'new section' },
      ],
    }
    const payload = buildNoteWritePayload(prev, next)
    // note.md always written; aaa unchanged → skipped; bbb changed; ccc new
    expect(payload.files['aaa.md']).toBeUndefined()
    expect(payload.files['bbb.md']).toBe('CHANGED')
    expect(payload.files['ccc.md']).toBe('new section')
    expect(payload.files[NOTE_MD]).toBeDefined()
    expect(payload.deleteFiles).toEqual([])
  })

  it('deletes the section file of a removed section', () => {
    const prev = sampleNote()
    const next: Note = { ...prev, sections: [prev.sections[0]] } // drop 'bbb'
    const payload = buildNoteWritePayload(prev, next)
    expect(payload.deleteFiles).toEqual(['bbb.md'])
  })

  it('encrypt transition: writes only note.md and deletes the plaintext section files', () => {
    const prev = sampleNote()
    const next: Note = {
      ...prev,
      sections: [],
      encryption: {
        alg: 'aes-256-gcm+pbkdf2',
        salt: 's',
        iv: 'i',
        ciphertext: 'c',
      },
    }
    const payload = buildNoteWritePayload(prev, next)
    expect(Object.keys(payload.files)).toEqual([NOTE_MD])
    expect(payload.files[NOTE_MD]).toContain('encryption:')
    expect(payload.deleteFiles.sort()).toEqual(['aaa.md', 'bbb.md'])
  })

  it('decrypt transition: recreates plaintext section files from an encrypted prev', () => {
    const prev: Pick<Note, 'sections' | 'encryption'> = {
      sections: [],
      encryption: { alg: 'aes-256-gcm+pbkdf2', salt: 's', iv: 'i', ciphertext: 'c' },
    }
    const next = sampleNote() // plaintext
    const payload = buildNoteWritePayload(prev, next)
    expect(payload.files['aaa.md']).toBe('hello world')
    expect(payload.files['bbb.md']).toBe('do things')
    expect(payload.deleteFiles).toEqual([])
  })

  // makeNotePermanent (notesStore) destructures expiresAt out of the note and writes it
  // back. main's checkExpiredNotes() deletes any folder whose note.md matches
  // /^expiresAt:/m, so the line must really disappear — and nothing else may be touched.
  it('make-permanent transition: drops the expiresAt line and rewrites only note.md', () => {
    const prev: Note = { ...sampleNote(), expiresAt: '2024-01-03T00:00:00.000Z' }
    expect(serializeNoteFolder(prev).files[NOTE_MD]).toMatch(/^expiresAt:/m)

    const { expiresAt: _expiresAt, ...next } = prev
    const payload = buildNoteWritePayload(prev, next)
    expect(payload.files[NOTE_MD]).not.toMatch(/^expiresAt:/m)
    expect(Object.keys(payload.files)).toEqual([NOTE_MD])
    expect(payload.deleteFiles).toEqual([])
    expect(parseNoteFolder(payload.files[NOTE_MD], {}, prev.filePath).expiresAt).toBeUndefined()
  })

  it('make-permanent transition on a locked encrypted note keeps the ciphertext', () => {
    const encryption = { alg: 'aes-256-gcm+pbkdf2' as const, salt: 's', iv: 'i', ciphertext: 'c' }
    const prev: Note = {
      ...sampleNote(),
      sections: [], // locked: no plaintext in memory
      encryption,
      expiresAt: '2024-01-03T00:00:00.000Z',
    }
    expect(serializeNoteFolder(prev).files[NOTE_MD]).toMatch(/^expiresAt:/m)

    const { expiresAt: _expiresAt, ...next } = prev
    const payload = buildNoteWritePayload(prev, next)
    expect(Object.keys(payload.files)).toEqual([NOTE_MD])
    expect(payload.files[NOTE_MD]).not.toMatch(/^expiresAt:/m)
    expect(payload.files[NOTE_MD]).toContain('ciphertext: c')
    expect(payload.deleteFiles).toEqual([])
  })

  // setNoteExpiry (notesStore) spreads the note with a new expiresAt + updated. The
  // rewritten note.md must carry the NEW date on the line main's checkExpiredNotes()
  // matches on, touch nothing else, and keep a locked note's ciphertext.
  it('reschedule transition: rewrites the expiresAt line and only note.md', () => {
    const prev: Note = { ...sampleNote(), expiresAt: '2024-01-03T00:00:00.000Z' }
    const next: Note = { ...prev, expiresAt: '2024-01-02T01:00:00.000Z', updated: '2024-01-02T00:00:00.000Z' }
    const payload = buildNoteWritePayload(prev, next)
    expect(Object.keys(payload.files)).toEqual([NOTE_MD])
    expect(payload.deleteFiles).toEqual([])
    const line = payload.files[NOTE_MD].match(/^expiresAt:\s*(.+)$/m)
    expect(line).not.toBeNull()
    expect(new Date(line![1].trim().replace(/^["']|["']$/g, '')).toISOString()).toBe('2024-01-02T01:00:00.000Z')
    expect(parseNoteFolder(payload.files[NOTE_MD], {}, prev.filePath).expiresAt).toBe('2024-01-02T01:00:00.000Z')
  })

  it('reschedule transition on a locked encrypted note keeps the ciphertext', () => {
    const encryption = { alg: 'aes-256-gcm+pbkdf2' as const, salt: 's', iv: 'i', ciphertext: 'c' }
    const prev: Note = { ...sampleNote(), sections: [], encryption, expiresAt: '2024-01-03T00:00:00.000Z' }
    const next: Note = { ...prev, expiresAt: '2024-01-04T00:00:00.000Z' }
    const payload = buildNoteWritePayload(prev, next)
    expect(Object.keys(payload.files)).toEqual([NOTE_MD])
    expect(payload.files[NOTE_MD]).toContain('ciphertext: c')
    expect(parseNoteFolder(payload.files[NOTE_MD], {}, prev.filePath).expiresAt).toBe('2024-01-04T00:00:00.000Z')
  })
})

describe('extractTitle', () => {
  it('uses the first markdown heading', () => {
    expect(extractTitle('# Hello\nbody')).toBe('Hello')
    expect(extractTitle('### Deep\nbody')).toBe('Deep')
  })

  it('falls back to the first non-empty line (truncated to 60 chars)', () => {
    expect(extractTitle('\n\n  plain first line  ')).toBe('plain first line')
    expect(extractTitle('x'.repeat(80))).toHaveLength(60)
  })

  it('returns empty string for empty content', () => {
    expect(extractTitle('')).toBe('')
    expect(extractTitle('\n\n')).toBe('')
  })
})

describe('extractTags', () => {
  it('extracts unique lowercased hashtags', () => {
    expect(extractTags('todo #Work and #work and #idea')).toEqual(['work', 'idea'])
  })

  it('ignores hashes not starting with a letter', () => {
    expect(extractTags('#123 #-x')).toEqual([])
  })

  it('returns [] when there are no tags', () => {
    expect(extractTags('plain text')).toEqual([])
  })
})

describe('noteDirname / sectionFilename / pathBasename', () => {
  it('builds a slug-id directory name', () => {
    expect(noteDirname('abc123', 'My Great Note!')).toBe('my-great-note-abc123')
  })

  it('transliterates accents instead of dropping the letter', () => {
    expect(noteDirname('abc123', 'Reunión 12 nov')).toBe('reunion-12-nov-abc123')
    expect(noteDirname('abc123', 'Cumpleaños')).toBe('cumpleanos-abc123')
    expect(noteDirname('abc123', 'Ñandú & café')).toBe('nandu-cafe-abc123')
  })

  it('omits the slug when the title yields nothing usable', () => {
    expect(noteDirname('abc123', '!!!')).toBe('abc123')
  })

  it('truncates a long slug to 40 chars before the id', () => {
    const dir = noteDirname('id', 'a'.repeat(100))
    expect(dir).toBe('a'.repeat(40) + '-id')
  })

  it('sectionFilename appends .md', () => {
    expect(sectionFilename('xyz')).toBe('xyz.md')
  })

  it('pathBasename returns the last path segment for both separators', () => {
    expect(pathBasename('/notes/my-note-abc')).toBe('my-note-abc')
    expect(pathBasename('C:\\notes\\my-note-abc')).toBe('my-note-abc')
    expect(pathBasename('/notes/dir/')).toBe('dir')
  })
})

describe('isoString normalization (via parseNoteFolder)', () => {
  // js-yaml parses unquoted ISO timestamps as Date; the parser must normalize
  // them back to ISO strings, not Date.toString().
  it('keeps created/updated as ISO strings', () => {
    const noteMd = [
      '---',
      'id: x',
      'title: T',
      'created: 2024-03-04T05:06:07.000Z',
      'updated: 2024-03-04T05:06:08.000Z',
      'sections: []',
      '---',
      '',
    ].join('\n')
    const parsed = parseNoteFolder(noteMd, {}, '/notes/x')
    expect(parsed.created).toBe('2024-03-04T05:06:07.000Z')
    expect(parsed.updated).toBe('2024-03-04T05:06:08.000Z')
  })
})
