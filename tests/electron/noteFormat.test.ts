import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  splitFrontmatter,
  parseLegacyNoteRaw,
  serializeNoteFolder,
  parseNoteDir,
  extractUpdatedTimestamp,
  NOTE_MD,
  type DiskNote,
} from '../../electron/noteFormat'

// noteFormat.ts imports only fs/path/crypto/js-yaml (no electron), so it is
// safely importable under Vitest's node environment.

describe('splitFrontmatter (main-process mirror)', () => {
  it('splits frontmatter and body', () => {
    const { frontmatter, body } = splitFrontmatter('---\nid: a\n---\nhi')
    expect(frontmatter).toBe('id: a')
    expect(body).toBe('hi')
  })

  it('strips a UTF-8 BOM', () => {
    const { frontmatter } = splitFrontmatter('﻿---\nid: a\n---\nhi')
    expect(frontmatter).toBe('id: a')
  })

  it('treats no-frontmatter content as all body', () => {
    const { frontmatter, body } = splitFrontmatter('plain')
    expect(frontmatter).toBe('')
    expect(body).toBe('plain')
  })
})

describe('parseLegacyNoteRaw (v1 → DiskNote)', () => {
  it('parses a v1 sections array', () => {
    const raw = [
      '---',
      'id: leg1',
      'title: Legacy',
      'sections:',
      '  - id: s1',
      '    name: Note',
      '    content: hello',
      '---',
      '',
    ].join('\n')
    const note = parseLegacyNoteRaw(raw)
    expect(note.id).toBe('leg1')
    expect(note.title).toBe('Legacy')
    expect(note.sections).toEqual([{ id: 's1', name: 'Note', content: 'hello' }])
  })

  it('parses the oldest fixed section_* keys', () => {
    const raw = [
      '---',
      'id: leg2',
      'title: Old',
      'section_note: a note',
      'section_task: a task',
      'section_question: a question',
      '---',
      '',
    ].join('\n')
    const note = parseLegacyNoteRaw(raw)
    expect(note.sections.map((s) => s.name)).toEqual(['Note', 'Task', 'Question'])
    expect(note.sections[0].content).toBe('a note')
  })

  it('falls back to a single Note section with the plain body', () => {
    const raw = '---\nid: leg3\ntitle: Plain\n---\njust the body'
    const note = parseLegacyNoteRaw(raw)
    expect(note.sections).toHaveLength(1)
    expect(note.sections[0].name).toBe('Note')
    expect(note.sections[0].content).toBe('just the body')
  })
})

describe('serializeNoteFolder (main-process mirror)', () => {
  const note: DiskNote = {
    id: 'd1',
    title: 'Disk Note',
    tags: ['x'],
    created: '2024-01-01T00:00:00.000Z',
    updated: '2024-01-02T00:00:00.000Z',
    sections: [
      { id: 'aaa', name: 'Note', content: 'body a' },
      { id: 'bbb', name: 'Tasks', content: 'body b', isRawMode: true },
    ],
  }

  it('writes note.md plus one file per section', () => {
    const { files, sectionFiles } = serializeNoteFolder(note)
    expect(files[NOTE_MD]).toContain('id: d1')
    expect(files[NOTE_MD]).toContain('formatVersion: 2')
    expect(sectionFiles).toEqual(['aaa.md', 'bbb.md'])
    expect(files['aaa.md']).toBe('body a')
    expect(files['bbb.md']).toBe('body b')
  })

  it('preserveUpdated keeps the original updated timestamp', () => {
    const { files } = serializeNoteFolder(note, { preserveUpdated: true })
    expect(files[NOTE_MD]).toContain('updated: "2024-01-02T00:00:00.000Z"')
  })

  it('bumps updated by default', () => {
    const { files } = serializeNoteFolder(note)
    expect(files[NOTE_MD]).not.toContain('2024-01-02T00:00:00.000Z')
  })

  it('encrypted notes serialize only note.md with no section files', () => {
    const encNote: DiskNote = {
      ...note,
      sections: [],
      encryption: { alg: 'aes-256-gcm+pbkdf2', salt: 's', iv: 'i', ciphertext: 'c' },
    }
    const { files, sectionFiles } = serializeNoteFolder(encNote)
    expect(Object.keys(files)).toEqual([NOTE_MD])
    expect(sectionFiles).toEqual([])
    expect(files[NOTE_MD]).toContain('encryption:')
  })
})

describe('extractUpdatedTimestamp', () => {
  it('reads a quoted updated timestamp', () => {
    const ts = extractUpdatedTimestamp('updated: "2024-01-02T00:00:00.000Z"\n')
    expect(ts).toBe(Date.parse('2024-01-02T00:00:00.000Z'))
  })

  it('reads an unquoted updated timestamp', () => {
    const ts = extractUpdatedTimestamp('id: x\nupdated: 2024-01-02T00:00:00.000Z\ntitle: t\n')
    expect(ts).toBe(Date.parse('2024-01-02T00:00:00.000Z'))
  })

  it('returns null when there is no updated field', () => {
    expect(extractUpdatedTimestamp('id: x\ntitle: t\n')).toBeNull()
  })
})

describe('serializeNoteFolder → parseNoteDir round-trip (real temp dir)', () => {
  const tmpDirs: string[] = []
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) {
      try {
        fs.rmSync(d, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
  })

  it('writes a note folder and parses it back', () => {
    const note: DiskNote = {
      id: 'rt1',
      title: 'Round Trip',
      tags: ['t'],
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-02T00:00:00.000Z',
      sections: [{ id: 'sec', name: 'Note', content: 'roundtrip body' }],
    }
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-noteformat-'))
    tmpDirs.push(dirPath)

    const { files } = serializeNoteFolder(note, { preserveUpdated: true })
    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dirPath, file), content, 'utf-8')
    }

    const parsed = parseNoteDir(dirPath)
    expect(parsed).not.toBeNull()
    expect(parsed!.id).toBe('rt1')
    expect(parsed!.title).toBe('Round Trip')
    expect(parsed!.sections).toEqual([{ id: 'sec', name: 'Note', content: 'roundtrip body' }])
  })

  it('preserves an optional per-section created (and omits it when absent)', () => {
    const note: DiskNote = {
      id: 'rt2',
      title: 'Created',
      tags: [],
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-02T00:00:00.000Z',
      sections: [
        { id: 'old', name: 'Note', content: 'a' },
        { id: 'new', name: 'Later', content: 'b', created: '2024-06-07T08:09:10.000Z' },
      ],
    }
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-noteformat-'))
    tmpDirs.push(dirPath)

    const { files } = serializeNoteFolder(note, { preserveUpdated: true })
    expect(files['note.md'].match(/created:/g)).toHaveLength(2)
    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dirPath, file), content, 'utf-8')
    }

    const parsed = parseNoteDir(dirPath)
    expect(parsed!.sections).toEqual(note.sections)
    expect(parsed!.sections[0]).not.toHaveProperty('created')
  })

  it('returns null for a directory without note.md', () => {
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-noteformat-'))
    tmpDirs.push(dirPath)
    expect(parseNoteDir(dirPath)).toBeNull()
  })
})
