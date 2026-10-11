/**
 * noteUtils.ts — pure-JS note parsing/serialization (no gray-matter / no Buffer)
 *
 * On-disk format v2 — one DIRECTORY per note:
 *
 *   <slug>-<id>/
 *     note.md        frontmatter-only anchor: metadata + section index
 *     <sectionId>.md pure markdown body of each section (no frontmatter)
 *
 * note.md:
 *   ---
 *   id: ...
 *   title: "..."
 *   tags: [...]
 *   created: ISO
 *   updated: ISO            ← canonical conflict timestamp for the whole note
 *   formatVersion: 2
 *   sections:
 *     - id: abc
 *       name: Note
 *       file: abc.md        ← body lives in the sibling file
 *     - id: def
 *       name: Task
 *       file: def.md
 *       isRawMode: true
 *       created: ISO        ← optional per-section creation time (absent on old sections)
 *   ---
 *
 * Encrypted notes keep the `encryption` block in note.md and have NO plaintext
 * section files (the ciphertext contains the whole sections array as JSON).
 */

import yaml from 'js-yaml'
import { nanoid } from 'nanoid'
import type { Note, NoteEncryption, NoteMeta, NoteSection, NoteWritePayload } from '../types'

export const NOTE_MD = 'note.md'
export const NOTE_FORMAT_VERSION = 2

// ---------------------------------------------------------------------------
// Parse (folder model)
// ---------------------------------------------------------------------------

/**
 * Builds a hydrated in-memory Note from a note directory's contents.
 * `noteMd` is the raw content of note.md; `sectionFiles` maps section
 * filename → file content; `dirPath` is the absolute path of the note dir.
 */
export function parseNoteFolder(
  noteMd: string,
  sectionFiles: Record<string, string>,
  dirPath: string
): Note {
  const { frontmatter } = splitFrontmatter(noteMd)

  let data: Record<string, unknown> = {}
  if (frontmatter) {
    try {
      data = (yaml.load(frontmatter) as Record<string, unknown>) ?? {}
    } catch {
      // malformed YAML — fall through with empty data
    }
  }

  const encryption = parseEncryptionBlock(data)
  const meta = parseMetaFields(data, encryption, '')

  // Encrypted notes have no readable sections — skip parsing
  if (encryption) {
    return { ...meta, sections: [], raw: noteMd, filePath: dirPath }
  }

  let sections: NoteSection[]

  if (Array.isArray(data.sections) && data.sections.length > 0) {
    sections = (data.sections as Array<Record<string, unknown>>).map((s) => {
      const id = String(s.id ?? nanoid(6))
      const file = String(s.file ?? sectionFilename(id))
      // Optional per-section creation time. Never backfilled: sections that
      // predate the field stay without it (the UI falls back to note.created).
      const created = isoString(s.created)
      return {
        id,
        name: String(s.name ?? 'Section'),
        content: normalizeNewlines(sectionFiles[file] ?? ''),
        isRawMode: Boolean(s.isRawMode ?? false),
        ...(s.aiHidden ? { aiHidden: true } : {}),
        ...(created ? { created } : {}),
      }
    })
  } else {
    // Tolerant fallback (mid-migration / hand-made folder): synthesize the
    // section index from whatever section files exist on disk.
    const files = Object.keys(sectionFiles).sort()
    if (files.length > 0) {
      sections = files.map((file, i) => ({
        id: file.replace(/\.md$/i, '') || nanoid(6),
        name: i === 0 ? 'Note' : file.replace(/\.md$/i, ''),
        content: normalizeNewlines(sectionFiles[file]),
        isRawMode: true,
      }))
    } else {
      sections = defaultSections()
    }
  }

  return { ...meta, sections, raw: noteMd, filePath: dirPath }
}

// ---------------------------------------------------------------------------
// Serialize (folder model)
// ---------------------------------------------------------------------------

/**
 * Serializes a note to its on-disk folder representation.
 * Returns `files` (relative filename → content; always includes note.md) and
 * `sectionFiles` (the section filenames that SHOULD exist after the write —
 * used by callers to diff deletions).
 */
export function serializeNoteFolder(
  note: Pick<Note, keyof NoteMeta | 'sections'>
): { files: Record<string, string>; sectionFiles: string[] } {
  // Encrypted path: only note.md, with the encryption block and no section files
  if (note.encryption) {
    const fm: Record<string, unknown> = {
      id:            note.id,
      title:         note.title,
      tags:          note.tags,
      created:       note.created,
      updated:       new Date().toISOString(),
      formatVersion: NOTE_FORMAT_VERSION,
      encryption:    note.encryption,
    }
    if (note.archived)   fm.archived   = true
    if (note.favorited)  fm.favorited  = true
    if (note.group)      fm.group      = note.group
    if (note.folder)     fm.folder     = note.folder
    if (note.expiresAt)  fm.expiresAt  = note.expiresAt
    const yamlStr = yaml.dump(fm, { lineWidth: -1, quotingType: '"' })
    return { files: { [NOTE_MD]: `---\n${yamlStr}---\n` }, sectionFiles: [] }
  }

  const fm: Record<string, unknown> = {
    id:            note.id,
    title:         note.title,
    tags:          note.tags,
    created:       note.created,
    updated:       new Date().toISOString(),
    formatVersion: NOTE_FORMAT_VERSION,
    sections: note.sections.map((s) => ({
      id:   s.id,
      name: s.name,
      file: sectionFilename(s.id),
      ...(s.isRawMode && { isRawMode: true }),
      ...(s.aiHidden && { aiHidden: true }),
      ...(s.created && { created: s.created }),
    })),
  }

  if (note.archived)   fm.archived   = true
  if (note.favorited)  fm.favorited  = true
  if (note.group)      fm.group      = note.group
  if (note.folder)     fm.folder     = note.folder
  if (note.expiresAt)  fm.expiresAt  = note.expiresAt

  const yamlStr = yaml.dump(fm, { lineWidth: -1, quotingType: '"' })
  const files: Record<string, string> = { [NOTE_MD]: `---\n${yamlStr}---\n` }
  const sectionFiles: string[] = []
  for (const s of note.sections) {
    const file = sectionFilename(s.id)
    files[file] = s.content
    sectionFiles.push(file)
  }
  return { files, sectionFiles }
}

/**
 * Computes the minimal on-disk write for a note transition prev → next:
 * note.md is always written; section files only when their content changed;
 * section files of removed sections are deleted. Handles the encrypt
 * (plaintext files removed) and decrypt (plaintext files recreated) paths.
 */
export function buildNoteWritePayload(
  prev: Pick<Note, 'sections' | 'encryption'> | null,
  next: Pick<Note, keyof NoteMeta | 'sections' | 'filePath'>
): NoteWritePayload {
  const { files, sectionFiles } = serializeNoteFolder(next)

  const deleteFiles: string[] = []
  if (prev && !prev.encryption) {
    const keep = new Set(sectionFiles)
    for (const s of prev.sections) {
      const f = sectionFilename(s.id)
      if (!keep.has(f)) deleteFiles.push(f)
    }
    // Minimal diff: skip section files whose content didn't change
    if (!next.encryption) {
      const prevContent = new Map(prev.sections.map((s) => [sectionFilename(s.id), s.content]))
      for (const f of sectionFiles) {
        if (prevContent.has(f) && prevContent.get(f) === files[f]) delete files[f]
      }
    }
  }

  return { dir: pathBasename(next.filePath), files, deleteFiles }
}

/**
 * Change-detection fingerprint for syncNote. Encrypted notes compare note.md
 * only (the ciphertext lives there; in-memory sections may be session-unlocked
 * plaintext that must NOT trigger a spurious replace). Plaintext notes also
 * cover the section bodies, which can change on disk without touching note.md
 * (external editor on a single section file).
 */
export function noteFingerprint(note: Pick<Note, 'raw' | 'sections' | 'encryption'>): string {
  if (note.encryption) return note.raw
  return note.raw + '\u0000' + note.sections.map((s) => `${s.id}${s.content}`).join('\u0000')
}

// ---------------------------------------------------------------------------
// Legacy v1 parser (single .md file, sections inline in frontmatter)
// Kept for importing old .noteflow exports; the main process has its own copy
// for the on-disk migration (electron/noteFormat.ts).
// ---------------------------------------------------------------------------

export function parseLegacyNote(raw: string, filePath: string): Note {
  const { frontmatter, body } = splitFrontmatter(raw)

  let data: Record<string, unknown> = {}
  if (frontmatter) {
    try {
      data = (yaml.load(frontmatter) as Record<string, unknown>) ?? {}
    } catch {
      // malformed YAML — fall through with empty data
    }
  }

  const encryption = parseEncryptionBlock(data)
  const meta = parseMetaFields(data, encryption, body)

  if (encryption) {
    return { ...meta, sections: [], raw, filePath }
  }

  let sections: NoteSection[]

  // v1 format: sections array with inline content in frontmatter
  if (Array.isArray(data.sections) && data.sections.length > 0) {
    sections = (data.sections as Array<Record<string, unknown>>).map((s) => ({
      id:      String(s.id      ?? nanoid(6)),
      name:    String(s.name    ?? 'Section'),
      content: String(s.content ?? ''),
      isRawMode: Boolean(s.isRawMode ?? false),
      ...(s.aiHidden ? { aiHidden: true } : {}),
    }))
  }
  // Legacy format: old fixed section_note / section_task / section_question keys
  else if (
    typeof data.section_note     === 'string' ||
    typeof data.section_task     === 'string' ||
    typeof data.section_question === 'string'
  ) {
    sections = [
      { id: nanoid(6), name: 'Note',     content: String(data.section_note     ?? body) },
      { id: nanoid(6), name: 'Task',     content: String(data.section_task     ?? '') },
      { id: nanoid(6), name: 'Question', content: String(data.section_question ?? '') },
    ]
  }
  // Oldest legacy: plain body with no sections at all
  else {
    sections = defaultSections()
    sections[0].content = body
  }

  return { ...meta, sections, raw, filePath }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Initial sections of a brand-new note. Pass `created` (normally the note's own
 * `created`) to stamp them; parse fallbacks call it without, so existing notes
 * are never given an invented creation time.
 */
export function defaultSections(created?: string): NoteSection[] {
  return [
    { id: nanoid(6), name: 'Note', content: '', ...(created ? { created } : {}) },
  ]
}

export function defaultNoteTitle(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function isDefaultNoteTitle(title: string): boolean {
  return !title.trim() || title.trim() === 'Untitled' || /^\d{2}[/-]\d{2}[/-]\d{4}$/.test(title.trim())
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
    favorited: false,
    sections: defaultSections(now),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEncryptionBlock(data: Record<string, unknown>): NoteEncryption | undefined {
  if (!data.encryption || typeof data.encryption !== 'object') return undefined
  const enc = data.encryption as Record<string, unknown>
  if (enc.alg !== 'aes-256-gcm+pbkdf2') return undefined
  const encryption: NoteEncryption = {
    alg:        'aes-256-gcm+pbkdf2',
    salt:       String(enc.salt       ?? ''),
    iv:         String(enc.iv         ?? ''),
    ciphertext: String(enc.ciphertext ?? ''),
  }
  if (enc.iterations) encryption.iterations = Number(enc.iterations)
  if (enc.hashAlg === 'SHA-512') encryption.hashAlg = 'SHA-512'
  return encryption
}

// js-yaml parses unquoted ISO timestamps as Date objects — normalize back to
// the ISO string (Date.toString() would corrupt the sync conflict timestamps).
function isoString(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string' && v) return v
  return null
}

function parseMetaFields(
  data: Record<string, unknown>,
  encryption: NoteEncryption | undefined,
  fallbackTitleSource: string
): NoteMeta {
  const expiresAt = isoString(data.expiresAt)
  return {
    id:       String(data.id    ?? nanoid(8)),
    title:    String(data.title ?? extractTitle(fallbackTitleSource) ?? 'Untitled'),
    tags:     Array.isArray(data.tags) ? (data.tags as string[]) : [],
    created:  isoString(data.created) ?? new Date().toISOString(),
    updated:  isoString(data.updated) ?? new Date().toISOString(),
    archived:   Boolean(data.archived   ?? false),
    favorited:  Boolean(data.favorited ?? data.pinned ?? false),
    ...(typeof data.group === 'string' && data.group ? { group: data.group } : {}),
    ...(typeof data.folder === 'string' && data.folder ? { folder: data.folder } : {}),
    ...(encryption ? { encryption } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  }
}

function normalizeNewlines(s: string): string {
  // Strip UTF-8 BOM (external editors like Notepad may add it)
  return s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const normalized = normalizeNewlines(raw)
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: '', body: normalized }
  }
  const end = normalized.indexOf('\n---\n', 4)
  if (end === -1) {
    // Frontmatter-only file may end with `\n---` and no trailing newline
    if (normalized.endsWith('\n---')) {
      return { frontmatter: normalized.slice(4, -4), body: '' }
    }
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

/** Directory name for a note: '<slug>-<id>' (slug frozen at creation time). */
export function noteDirname(id: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return `${slug ? `${slug}-` : ''}${id}`
}

/** Filename of a section's body inside the note directory. */
export function sectionFilename(sectionId: string): string {
  return `${sectionId}.md`
}

/** Renderer-safe basename (no Node `path` available in the renderer). */
export function pathBasename(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p
}
