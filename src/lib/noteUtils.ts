/**
 * noteUtils.ts — pure-JS note parsing/serialization (no gray-matter / no Buffer)
 *
 * File format:
 *   ---
 *   id: ...
 *   title: "..."
 *   tags: [...]
 *   created: ISO
 *   updated: ISO
 *   sections:
 *     - id: abc
 *       name: Note
 *       content: |
 *         ...
 *     - id: def
 *       name: Task
 *       content: |
 *         ...
 *   ---
 *   <first section content as readable markdown body>
 */

import yaml from 'js-yaml'
import { nanoid } from 'nanoid'
import type { Note, NoteEncryption, NoteMeta, NoteSection } from '../types'

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export function parseNote(raw: string, filePath: string): Note {
  const { frontmatter, body } = splitFrontmatter(raw)

  let data: Record<string, unknown> = {}
  if (frontmatter) {
    try {
      data = (yaml.load(frontmatter) as Record<string, unknown>) ?? {}
    } catch {
      // malformed YAML — fall through with empty data
    }
  }

  // Parse encryption block if present
  let encryption: NoteEncryption | undefined
  if (data.encryption && typeof data.encryption === 'object') {
    const enc = data.encryption as Record<string, unknown>
    if (enc.alg === 'aes-256-gcm+pbkdf2') {
      encryption = {
        alg:        'aes-256-gcm+pbkdf2',
        salt:       String(enc.salt       ?? ''),
        iv:         String(enc.iv         ?? ''),
        ciphertext: String(enc.ciphertext ?? ''),
      }
      if (enc.iterations) encryption.iterations = Number(enc.iterations)
      if (enc.hashAlg === 'SHA-512') encryption.hashAlg = 'SHA-512'
    }
  }

  const meta: NoteMeta = {
    id:       String(data.id    ?? nanoid(8)),
    title:    String(data.title ?? extractTitle(body) ?? 'Untitled'),
    tags:     Array.isArray(data.tags) ? (data.tags as string[]) : [],
    created:  String(data.created ?? new Date().toISOString()),
    updated:  String(data.updated ?? new Date().toISOString()),
    archived: Boolean(data.archived ?? false),
    pinned:   Boolean(data.pinned   ?? false),
    ...(typeof data.group === 'string' && data.group ? { group: data.group } : {}),
    ...(encryption ? { encryption } : {}),
  }

  // Encrypted notes have no readable sections — skip parsing
  if (encryption) {
    return { ...meta, sections: [], raw, filePath }
  }

  let sections: NoteSection[]

  // New format: sections array in frontmatter
  if (Array.isArray(data.sections) && data.sections.length > 0) {
    sections = (data.sections as Array<Record<string, unknown>>).map((s) => ({
      id:      String(s.id      ?? nanoid(6)),
      name:    String(s.name    ?? 'Section'),
      content: String(s.content ?? ''),
      isRawMode: Boolean(s.isRawMode ?? false),
    }))
  }
  // Legacy format: old fixed section_note / section_task / section_question keys
  else if (
    typeof data.section_note     === 'string' ||
    typeof data.section_task     === 'string' ||
    typeof data.section_question === 'string'
  ) {
    sections = defaultSections()
    sections[0].content = String(data.section_note     ?? body)
    sections[1].content = String(data.section_task     ?? '')
    sections[2].content = String(data.section_question ?? '')
  }
  // Oldest legacy: plain body with no sections at all
  else {
    sections = defaultSections()
    sections[0].content = body
  }

  return { ...meta, sections, raw, filePath }
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

export function serializeNote(note: Pick<Note, keyof NoteMeta | 'sections'>): string {
  // Encrypted path: omit sections, write encryption block, empty body
  if (note.encryption) {
    const fm: Record<string, unknown> = {
      id:         note.id,
      title:      note.title,
      tags:       note.tags,
      created:    note.created,
      updated:    new Date().toISOString(),
      encryption: note.encryption,
    }
    if (note.archived) fm.archived = true
    if (note.pinned)   fm.pinned   = true
    if (note.group)    fm.group    = note.group
    const yamlStr = yaml.dump(fm, { lineWidth: -1, quotingType: '"' })
    return `---\n${yamlStr}---\n`
  }

  const fm: Record<string, unknown> = {
    id:      note.id,
    title:   note.title,
    tags:    note.tags,
    created: note.created,
    updated: new Date().toISOString(),
    sections: note.sections.map((s) => ({
      id:      s.id,
      name:    s.name,
      content: s.content,
      ...(s.isRawMode && { isRawMode: true }),
    })),
  }

  if (note.archived) fm.archived = true
  if (note.pinned)   fm.pinned   = true
  if (note.group)    fm.group    = note.group

  const yamlStr = yaml.dump(fm, { lineWidth: -1, quotingType: '"' })
  // Markdown body = first section content (readable in external editors)
  const body = note.sections[0]?.content ?? ''
  return `---\n${yamlStr}---\n${body}`
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export function defaultSections(): NoteSection[] {
  return [
    { id: nanoid(6), name: 'Note', content: '', isRawMode: true },
  ]
}

export function defaultNoteTitle(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

export function isDefaultNoteTitle(title: string): boolean {
  return !title.trim() || title.trim() === 'Untitled' || /^\d{2}-\d{2}-\d{4}$/.test(title.trim())
}

export function createEmptyNote(): Omit<Note, 'filePath' | 'raw'> {
  const id  = nanoid(8)
  const now = new Date().toISOString()
  return {
    id,
    title:    defaultNoteTitle(),
    tags:     [],
    created:  now,
    updated:  now,
    archived: false,
    pinned:   false,
    sections: defaultSections(),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: '', body: normalized }
  }
  const end = normalized.indexOf('\n---\n', 4)
  if (end === -1) {
    return { frontmatter: '', body: normalized }
  }
  return {
    frontmatter: normalized.slice(4, end),
    body:        normalized.slice(end + 5),
  }
}

export function extractTitle(content: string): string {
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(.+)/)
    if (match) return match[1].trim()
    const plain = line.trim()
    if (plain.length > 0) return plain.slice(0, 60)
  }
  return ''
}

export function extractTags(content: string): string[] {
  const matches = content.match(/#([a-zA-Z][a-zA-Z0-9_-]*)/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))]
}

export function noteFilename(id: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return `${slug ? `${slug}-` : ''}${id}.md`
}
