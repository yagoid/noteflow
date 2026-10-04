import { describe, it, expect } from 'vitest'
import {
  parseNoteFolder,
  serializeNoteFolder,
  buildNoteWritePayload,
  extractTitle,
  extractTags,
  noteDirname,
  sectionFilename,
  pathBasename,
  NOTE_MD,
} from '../../src/lib/noteUtils'
import type { Note } from '../../src/types'

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

  it('returns default sections for an empty folder', () => {
    const noteMd = '---\nid: x\ntitle: T\n---\n'
    const parsed = parseNoteFolder(noteMd, {}, '/notes/x')
    expect(parsed.sections).toHaveLength(1)
    expect(parsed.sections[0].name).toBe('Note')
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
