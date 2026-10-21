/**
 * noteFormat.ts — main-process knowledge of the on-disk note format v2
 * (folder-per-note). Shared by main.ts (fs IPC, expiration, migration),
 * githubSync.ts (push/pull walking) and ai/aiWorker.ts (indexing).
 *
 * Mirrors src/lib/noteUtils.ts (the renderer copy) — electron/ does not import
 * from src/. Keep both in sync when the format changes.
 *
 * Layout:
 *   <notesDir>/<slug>-<id>/note.md       frontmatter-only anchor
 *   <notesDir>/<slug>-<id>/<secId>.md    section bodies (plain markdown)
 *   <notesDir>/.noteflow-format          format version marker ("2")
 */
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import yaml from 'js-yaml'

export const NOTE_MD = 'note.md'
export const NOTE_FORMAT_VERSION = 2
export const FORMAT_MARKER_FILE = '.noteflow-format'

export interface DiskSection {
  id: string
  name: string
  content: string
  isRawMode?: boolean
  aiHidden?: boolean  // when true, the AI never sees this section (index, chat, tools)
  created?: string    // ISO — optional per-section creation time (never backfilled)
}

export interface DiskNote {
  id: string
  title: string
  tags: string[]
  created: string
  updated: string
  archived?: boolean
  favorited?: boolean
  group?: string
  folder?: string
  expiresAt?: string
  encryption?: Record<string, unknown>  // passed through opaquely
  sections: DiskSection[]
}

export interface NoteDirRecord {
  dir: string
  path: string
  noteMd: string
  sections: { file: string; content: string }[]
}

// ── Directory walking ─────────────────────────────────────────────────────────

/** Names of subdirectories of notesDir that contain a note.md. */
export function listNoteDirs(notesDir: string): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(notesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs: string[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    try {
      if (fs.existsSync(path.join(notesDir, e.name, NOTE_MD))) dirs.push(e.name)
    } catch { /* skip unreadable dir */ }
  }
  return dirs
}

/** Reads a note directory into the IPC record shape. Null if not a note dir. */
export function readNoteDirRecord(notesDir: string, dir: string): NoteDirRecord | null {
  const dirPath = path.join(notesDir, dir)
  let noteMd: string
  try {
    noteMd = fs.readFileSync(path.join(dirPath, NOTE_MD), 'utf-8')
  } catch {
    return null
  }
  const sections: { file: string; content: string }[] = []
  try {
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith('.md') || f === NOTE_MD) continue
      try {
        sections.push({ file: f, content: fs.readFileSync(path.join(dirPath, f), 'utf-8') })
      } catch { /* skip unreadable section file */ }
    }
  } catch {
    return null
  }
  return { dir, path: dirPath, noteMd, sections }
}

// ── Frontmatter helpers ───────────────────────────────────────────────────────

export function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  // Strip UTF-8 BOM (external editors like Notepad may add it)
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: '', body: normalized }
  }
  const end = normalized.indexOf('\n---\n', 4)
  if (end === -1) {
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

function loadFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const { frontmatter, body } = splitFrontmatter(raw)
  let data: Record<string, unknown> = {}
  if (frontmatter) {
    try { data = (yaml.load(frontmatter) as Record<string, unknown>) ?? {} } catch { /* malformed */ }
  }
  return { data, body }
}

function newId(chars: number): string {
  return randomBytes(Math.ceil(chars / 2)).toString('hex').slice(0, chars)
}

// js-yaml parses unquoted ISO timestamps as Date objects — normalize back to
// the ISO string (Date.toString() would corrupt the sync conflict timestamps).
function isoString(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string' && v) return v
  return null
}

function parseDiskMeta(data: Record<string, unknown>): Omit<DiskNote, 'sections'> {
  const note: Omit<DiskNote, 'sections'> = {
    id:      typeof data.id === 'string' && data.id ? data.id : newId(8),
    title:   String(data.title ?? 'Untitled'),
    tags:    Array.isArray(data.tags) ? (data.tags as string[]) : [],
    created: isoString(data.created) ?? new Date().toISOString(),
    updated: isoString(data.updated) ?? new Date().toISOString(),
  }
  if (data.archived)  note.archived  = true
  if (data.favorited ?? data.pinned) note.favorited = true
  if (typeof data.group  === 'string' && data.group)  note.group  = data.group
  if (typeof data.folder === 'string' && data.folder) note.folder = data.folder
  const expiresAt = isoString(data.expiresAt)
  if (expiresAt) note.expiresAt = expiresAt
  if (data.encryption && typeof data.encryption === 'object') {
    note.encryption = data.encryption as Record<string, unknown>
  }
  return note
}

// ── Parse: v2 folder ─────────────────────────────────────────────────────────

/** Parses a note directory from disk. Encrypted notes yield sections: []. */
export function parseNoteDir(dirPath: string): DiskNote | null {
  let noteMd: string
  try {
    noteMd = fs.readFileSync(path.join(dirPath, NOTE_MD), 'utf-8')
  } catch {
    return null
  }
  const { data } = loadFrontmatter(noteMd)
  const meta = parseDiskMeta(data)

  if (meta.encryption) return { ...meta, sections: [] }

  const sections: DiskSection[] = []
  if (Array.isArray(data.sections)) {
    for (const s of data.sections as Array<Record<string, unknown>>) {
      const id = String(s.id ?? newId(6))
      const file = String(s.file ?? `${id}.md`)
      let content = ''
      try {
        content = fs.readFileSync(path.join(dirPath, path.basename(file)), 'utf-8').replace(/\r\n/g, '\n')
      } catch { /* missing section file → empty */ }
      const section: DiskSection = { id, name: String(s.name ?? 'Section'), content }
      if (s.isRawMode) section.isRawMode = true
      if (s.aiHidden) section.aiHidden = true
      const created = isoString(s.created)
      if (created) section.created = created
      sections.push(section)
    }
  }
  return { ...meta, sections }
}

// ── Parse: legacy v1 single file (for migration / old imports) ───────────────

export function parseLegacyNoteRaw(raw: string): DiskNote {
  const { data, body } = loadFrontmatter(raw)
  const meta = parseDiskMeta(data)

  if (meta.encryption) return { ...meta, sections: [] }

  let sections: DiskSection[]
  if (Array.isArray(data.sections) && data.sections.length > 0) {
    sections = (data.sections as Array<Record<string, unknown>>).map((s) => {
      const section: DiskSection = {
        id:      String(s.id   ?? newId(6)),
        name:    String(s.name ?? 'Section'),
        content: String(s.content ?? ''),
      }
      if (s.isRawMode) section.isRawMode = true
      if (s.aiHidden) section.aiHidden = true
      return section
    })
  } else if (
    typeof data.section_note     === 'string' ||
    typeof data.section_task     === 'string' ||
    typeof data.section_question === 'string'
  ) {
    sections = [
      { id: newId(6), name: 'Note',     content: String(data.section_note     ?? body) },
      { id: newId(6), name: 'Task',     content: String(data.section_task     ?? '') },
      { id: newId(6), name: 'Question', content: String(data.section_question ?? '') },
    ]
  } else {
    sections = [{ id: newId(6), name: 'Note', content: body }]
  }

  return { ...meta, sections }
}

// ── Serialize: v2 folder ─────────────────────────────────────────────────────

/**
 * Serializes a DiskNote to its folder file map. `preserveUpdated` keeps the
 * note's original `updated` timestamp (migration must not bump it — content
 * didn't change and a bump would defeat sync conflict resolution).
 */
export function serializeNoteFolder(
  note: DiskNote,
  opts?: { preserveUpdated?: boolean }
): { files: Record<string, string>; sectionFiles: string[] } {
  const updated = opts?.preserveUpdated ? note.updated : new Date().toISOString()

  const fm: Record<string, unknown> = {
    id:            note.id,
    title:         note.title,
    tags:          note.tags,
    created:       note.created,
    updated,
    formatVersion: NOTE_FORMAT_VERSION,
  }

  if (note.encryption) {
    fm.encryption = note.encryption
  } else {
    fm.sections = note.sections.map((s) => ({
      id:   s.id,
      name: s.name,
      file: `${s.id}.md`,
      ...(s.isRawMode && { isRawMode: true }),
      ...(s.aiHidden && { aiHidden: true }),
      ...(s.created && { created: s.created }),
    }))
  }

  if (note.archived)   fm.archived   = true
  if (note.favorited)  fm.favorited  = true
  if (note.group)      fm.group      = note.group
  if (note.folder)     fm.folder     = note.folder
  if (note.expiresAt)  fm.expiresAt  = note.expiresAt

  const yamlStr = yaml.dump(fm, { lineWidth: -1, quotingType: '"' })
  const files: Record<string, string> = { [NOTE_MD]: `---\n${yamlStr}---\n` }
  const sectionFiles: string[] = []
  if (!note.encryption) {
    for (const s of note.sections) {
      const file = `${s.id}.md`
      files[file] = s.content
      sectionFiles.push(file)
    }
  }
  return { files, sectionFiles }
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

/** Fresh 8-char note id (same length the renderer's nanoid(8) / main's imports use). */
export function newNoteId(): string {
  return newId(8)
}

/**
 * Directory name for a note: '<slug>-<id>' (slug frozen at creation time).
 * ⚠️ Mirror of noteDirname in src/lib/noteUtils.ts and cli/noteflow.js — keep
 * the slug rule identical in all three.
 */
export function noteDirname(id: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return `${slug ? `${slug}-` : ''}${id}`
}

/** Reads the `updated:` timestamp out of a note.md (or legacy note) content. */
export function extractUpdatedTimestamp(content: string): number | null {
  const match = content.match(/^updated:\s*['"]?([^'"\n]+)['"]?\s*$/m)
  if (!match) return null
  const parsed = Date.parse(match[1].trim())
  return Number.isFinite(parsed) ? parsed : null
}

/** Whether the notes dir has the v2 format marker. */
export function hasFormatMarker(notesDir: string): boolean {
  try {
    return fs.readFileSync(path.join(notesDir, FORMAT_MARKER_FILE), 'utf-8').trim() === String(NOTE_FORMAT_VERSION)
  } catch {
    return false
  }
}

export function writeFormatMarker(notesDir: string): void {
  fs.writeFileSync(path.join(notesDir, FORMAT_MARKER_FILE), `${NOTE_FORMAT_VERSION}\n`, 'utf-8')
}
