// Agentic tools — the catalog the chat model can call, plus a provider-neutral executor.
// Runs in the MAIN process. The executor is decoupled from main.ts via an injected ToolContext
// so it can be unit-tested and never reaches into Electron globals directly.
import { randomBytes } from 'node:crypto'
import * as noteFormat from '../../noteFormat'
import type { DiskNote, DiskSection } from '../../noteFormat'
import type { ToolSchema } from './types'
import { collapseDrawings, restoreCollapsedDrawings, stripDrawings } from '../../drawingText'

/**
 * How the model writes a drawing (tool descriptions + the chat's system prompt). Only the
 * Mermaid variant: a scene is made by hand in the app's canvas, and the model never sees its JSON.
 */
export const DRAWING_HOWTO =
  'To add a diagram or drawing to a note, write a drawing block in the section markdown: a line ' +
  '`<!-- drawing -->`, then a ```mermaid code fence with the Mermaid source, then a line `<!-- /drawing -->` ' +
  '— each on its own line, starting at column 0 (never indented, never inside a list or a quote), with a ' +
  'blank line before and after the block. The app draws it; flowchart, sequenceDiagram, classDiagram, ' +
  'erDiagram and stateDiagram stay editable as shapes, other Mermaid types are shown as a picture. You may ' +
  'rewrite a Mermaid drawing block freely. A drawing the user edited by hand is shown to you as a ' +
  '`[drawing #n: …]` line instead: you cannot change nor delete it — keep that line where the drawing should ' +
  'stay (if you leave it out, the app keeps the drawing at the end of the section).'

// ── ID helper (mirrors src/lib/noteUtils.ts so ids match the renderer). The dir name of a new
// note comes from noteFormat.noteDirname — the one slug rule shared with the renderer and the CLI.
const ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
function makeId(size = 8): string {
  const bytes = randomBytes(size)
  let id = ''
  for (let i = 0; i < size; i++) id += ID_ALPHABET[bytes[i] & 63]
  return id
}

function defaultNoteTitle(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Hashtags in `content` — mirror of extractTags in src/lib/noteUtils.ts (tags are derived data). */
export function extractTags(content: string): string[] {
  const matches = stripDrawings(content).match(/#([a-zA-Z][a-zA-Z0-9_-]*)/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))]
}

/** A pasted image as the editor stores it: `![alt](data:…)`. Group 1 = the data URI. */
const MD_IMAGE_DATA_URI_RE = /!\[[^\]\n]*\]\((data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)/gi
const DATA_URI_RE = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi

/** What the model reads of a section: scene drawings as `[drawing #n: …]` markers
 *  (drawingText.ts), pasted images as `[image]`. */
function stripBase64(text: string): string {
  return collapseDrawings(text, 'marker').replace(DATA_URI_RE, '[image]')
}

/**
 * The model only ever sees images as `[image]` (stripBase64), so a section it rewrites with
 * update_section comes back with `![alt]([image])` where the original had the data URI. Put the
 * original images back, matched BY POSITION (n-th placeholder ← n-th image of the original): if
 * the model reorders or drops images, the wrong one may land in a slot. Placeholders beyond the
 * original's image count are removed (they would only be broken images).
 *
 * Scene drawings come back BY NUMBER: the model saw each one as a `[drawing #n: …]` line,
 * and that marker — wherever the model put it — becomes the original block again
 * (restoreCollapsedDrawings). Unlike an image, a scene the model left out is NOT removed:
 * it can't recreate one, so it is kept at the end of the section. Mermaid source drawings
 * are text the model reads and may rewrite freely.
 */
export function restoreStrippedImages(original: string, next: string): string {
  // The images the model saw as `![alt]([image])`: the markdown images of the text with
  // its scenes collapsed. A data URI anywhere else is not one of them — a picture stored
  // inside a scene comes back with its drawing, and the `dataURL` of an INVALID drawing
  // block (shown as text) must not take the slot of the next image.
  const uris = Array.from(collapseDrawings(original, 'marker').matchAll(MD_IMAGE_DATA_URI_RE), (m) => m[1])
  let i = 0
  const withImages = next.replace(/!\[([^\]]*)\]\(\[image\]\)/g, (_m, alt: string) => (i < uris.length ? `![${alt}](${uris[i++]})` : ''))
  return restoreCollapsedDrawings(original, withImages)
}

const DEFAULT_GROUP_COLOR = '#64748b'

const THEME_COLOR_VARS = new Set([
  '--accent', '--accent-2', '--red', '--cyan', '--purple', '--text', '--orange', '--pink',
])

/**
 * A group colour is either a theme var or a free '#rrggbb' (mirror of normalizeGroupColor()
 * in src/lib/tagColors.ts). Anything else the model invents falls back to the default.
 */
function normalizeGroupColor(value: string): string {
  const v = value.trim()
  if (THEME_COLOR_VARS.has(v)) return v
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  return DEFAULT_GROUP_COLOR
}

// ── External-state shapes (groups.json / folders.json) ──────────────────────────
interface GroupRec { id: string; name: string; color: string; order: number; archived?: boolean }
interface FolderRec { id: string; name: string; groupId: string; order: number }

/** Everything the executor needs from main, injected so this module stays pure/testable. */
export interface ToolContext {
  notesDir: string
  /** Apply a multi-file note write (handles broadcast + GitHub push + semantic index).
   *  May return a promise that resolves once the durable remote push has landed. */
  writeNote(payload: { dir: string; files: Record<string, string>; deleteFiles?: string[] }): void | Promise<void>
  /** Delete an entire note directory. */
  deleteNoteDir(dir: string): void
  readGroups(): GroupRec[]
  writeGroups(groups: GroupRec[]): void | Promise<void>
  readFolders(): FolderRec[]
  writeFolders(folders: FolderRec[]): void | Promise<void>
  /** Semantic search; present only when the local index is enabled. */
  search?: (query: string, k: number) => Promise<Array<{ noteId: string; sectionId: string; snippet: string }>>
  /** Called after an edit of an EXISTING note lands (not on create/delete) — main records
   *  it in the per-device activity log, since the agent edits on the user's request. */
  onNoteEdited?: (noteId: string) => void
  /** Linked notes (external text files, electron/linkedNotes.ts): readable like any note; the
   *  agent may edit their single section's content (it lands in the file) and their local
   *  metadata, but never add/delete/rename sections, and "deleting" one only unlinks it. */
  linked?: LinkedToolApi
}

/** What the tools can do with linked notes — main wires it to electron/linkedNotes.ts. */
export interface LinkedToolApi {
  /** Every linked note as a DiskNote (one section: the file body). */
  list(): DiskNote[]
  get(id: string): DiskNote | null
  /** Replaces the file body (refused when the file changed outside, is missing or read-only). */
  writeBody(id: string, content: string): Promise<{ ok: true } | { ok: false; error: string }>
  updateMeta(id: string, patch: { title?: string; group?: string; folder?: string; favorited?: boolean; archived?: boolean }): void
  /** Removes the note from NoteFlow; the file is never touched. */
  unlink(id: string): void
}

export interface ToolRunResult {
  /** Short human label for the chat activity UI, e.g. `Created note "Roadmap"`. */
  summary: string
  /** Text fed back to the model as the tool result. */
  content: string
  isError?: boolean
  /** create_note: id of the note it created (for the chat's undo). */
  noteId?: string
}

// Tools that mutate irreversibly — gated behind an in-chat confirmation.
export const DESTRUCTIVE_TOOLS = new Set(['delete_note', 'delete_section', 'delete_group', 'delete_folder'])

// ── Catalog ─────────────────────────────────────────────────────────────────────
const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'object', properties, required, additionalProperties: false })
const str = (description: string) => ({ type: 'string', description })
const bool = (description: string) => ({ type: 'boolean', description })

export const TOOLS: ToolSchema[] = [
  {
    name: 'list_notes',
    description: "List the user's notes (id, title, tags, group/folder, section names). Use this to find note ids before editing or deleting. Encrypted notes appear but their content is not readable.",
    inputSchema: obj({
      query: str('Optional case-insensitive substring to match against title or tags.'),
      group_id: str('Optional group id to filter by.'),
      include_archived: bool('Include archived notes (default false).'),
    }),
  },
  {
    name: 'get_note',
    description: 'Read one note in full, including each section id, name and content. Use before editing a section.',
    inputSchema: obj({ note_id: str('The note id.') }, ['note_id']),
  },
  {
    name: 'list_groups',
    description: 'List all groups and folders (with ids) so you can place or move notes correctly.',
    inputSchema: obj({}),
  },
  {
    name: 'search_notes',
    description: 'Semantic search over the notes. Returns the most relevant notes/sections for a natural-language query. Only works when the local AI index is enabled.',
    inputSchema: obj({ query: str('Natural-language search query.'), k: { type: 'number', description: 'Max results (default 6).' } }, ['query']),
  },
  {
    name: 'create_note',
    description: 'Create a new note. Optionally place it in a group/folder and pre-fill sections.',
    inputSchema: obj({
      title: str('Note title. Defaults to today\'s date if omitted.'),
      group_id: str('Optional group id to place the note in.'),
      folder_id: str('Optional folder id (its group must be the same as group_id).'),
      sections: {
        type: 'array',
        description: 'Sections to create. If omitted, a single empty "Note" section is created.',
        items: obj({ name: str('Section name.'), content: str('Markdown content.'), raw: bool('Text mode: the section shows its content as plain text, exactly as written, without rendering markdown. Default false = markdown mode (content is rendered). Only set true if the user explicitly wants plain/unrendered text.') }, ['name']),
      },
    }),
  },
  {
    name: 'update_note',
    description: 'Update a note\'s metadata: title, favorite/archive flags, or move it to a group/folder. Pass an empty string for group_id/folder_id to remove that placement.',
    inputSchema: obj({
      note_id: str('The note id.'),
      title: str('New title.'),
      group_id: str('Group id, or "" to ungroup.'),
      folder_id: str('Folder id, or "" to remove from folder.'),
      favorited: bool('Pin/unpin the note.'),
      archived: bool('Archive/unarchive the note.'),
    }, ['note_id']),
  },
  {
    name: 'add_section',
    description: 'Append a new section to an existing note. ' + DRAWING_HOWTO,
    inputSchema: obj({ note_id: str('The note id.'), name: str('Section name.'), content: str('Markdown content.'), raw: bool('Text mode: the section shows its content as plain text, exactly as written, without rendering markdown. Default false = markdown mode (content is rendered). Only set true if the user explicitly wants plain/unrendered text.') }, ['note_id', 'name']),
  },
  {
    name: 'update_section',
    description: "Replace a section's content. Read the note first to get the section id. Keep every `[image]` and `[drawing #n: …]` line you were shown exactly where it should stay: the app puts the picture / drawing back from it (you cannot change nor delete a drawing shown that way: one whose line you leave out is kept at the end of the section).",
    inputSchema: obj({ note_id: str('The note id.'), section_id: str('The section id.'), content: str('New Markdown content.') }, ['note_id', 'section_id', 'content']),
  },
  {
    name: 'rename_section',
    description: 'Rename a section.',
    inputSchema: obj({ note_id: str('The note id.'), section_id: str('The section id.'), name: str('New section name.') }, ['note_id', 'section_id', 'name']),
  },
  {
    name: 'create_group',
    description: 'Create a new group.',
    inputSchema: obj({ name: str('Group name.'), color: str('Optional hex color, e.g. #3b82f6.') }, ['name']),
  },
  {
    name: 'create_folder',
    description: 'Create a folder inside a group.',
    inputSchema: obj({ group_id: str('The parent group id.'), name: str('Folder name.') }, ['group_id', 'name']),
  },
  {
    name: 'rename_group',
    description: 'Rename a group.',
    inputSchema: obj({ group_id: str('The group id.'), name: str('New name.') }, ['group_id', 'name']),
  },
  {
    name: 'rename_folder',
    description: 'Rename a folder.',
    inputSchema: obj({ folder_id: str('The folder id.'), name: str('New name.') }, ['folder_id', 'name']),
  },
  {
    name: 'delete_note',
    description: 'Permanently delete a note and all its sections.',
    inputSchema: obj({ note_id: str('The note id.') }, ['note_id']),
  },
  {
    name: 'delete_section',
    description: 'Delete one section from a note.',
    inputSchema: obj({ note_id: str('The note id.'), section_id: str('The section id.') }, ['note_id', 'section_id']),
  },
  {
    name: 'delete_group',
    description: 'Delete a group and its folders. Notes in the group are kept but ungrouped.',
    inputSchema: obj({ group_id: str('The group id.') }, ['group_id']),
  },
  {
    name: 'delete_folder',
    description: 'Delete a folder. Notes in it keep their group but lose the folder.',
    inputSchema: obj({ folder_id: str('The folder id.') }, ['folder_id']),
  },
]

// ── Executor ─────────────────────────────────────────────────────────────────────
type Args = Record<string, unknown>
const asStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const asBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)

/** Find the on-disk directory name for a note id (dir name is frozen at creation). */
function findNoteDir(ctx: ToolContext, noteId: string): string | null {
  return noteFormat.listNoteDirs(ctx.notesDir).find((d) => d.endsWith('-' + noteId) || d === noteId) ?? null
}

/** A linked note (external text file) id — mirror of LINKED_ID_PREFIX in electron/linkedNotesLogic.ts. */
const isLinkedId = (id: string) => id.startsWith('lnk:')

/** A note by id: a folder of the notes dir, or a linked note (`linked: true`, `dir` = ''). */
function loadNote(ctx: ToolContext, noteId: string): { dir: string; note: DiskNote; linked?: true } | null {
  if (isLinkedId(noteId)) {
    const note = ctx.linked?.get(noteId) ?? null
    return note ? { dir: '', note, linked: true } : null
  }
  const dir = findNoteDir(ctx, noteId)
  if (!dir) return null
  const note = noteFormat.parseNoteDir(`${ctx.notesDir}/${dir}`)
  return note ? { dir, note } : null
}

/** A linked note whose file isn't Markdown (its single section is named after the file). */
function isPlainTextLinked(note: DiskNote): boolean {
  return !/\.(md|markdown)$/i.test(note.sections[0]?.name ?? '')
}

/** Every note: the notes-dir folders, then the linked notes (`dir` = '' for those). */
function allNotes(ctx: ToolContext): Array<{ dir: string; note: DiskNote; linked?: true }> {
  const out: Array<{ dir: string; note: DiskNote; linked?: true }> = []
  for (const dir of noteFormat.listNoteDirs(ctx.notesDir)) {
    const note = noteFormat.parseNoteDir(`${ctx.notesDir}/${dir}`)
    if (note) out.push({ dir, note })
  }
  for (const note of ctx.linked?.list() ?? []) out.push({ dir: '', note, linked: true })
  return out
}

const LINKED_STRUCTURE_ERROR =
  'This is a linked note (an external file): it has exactly one section (the file) — sections cannot be added, deleted or renamed. Edit its content with update_section instead.'

/**
 * `section` with `edit` applied; its `updated` becomes now only when the content or the name
 * really changes (an identical rewrite keeps the stamp — same rule as the renderer's
 * stampSectionEdits, see note-format.md "`updated` por sección").
 */
export function withSectionEdit(section: DiskSection, edit: { name?: string; content?: string }): DiskSection {
  const next = { ...section, ...edit }
  return next.name !== section.name || next.content !== section.content
    ? { ...next, updated: new Date().toISOString() }
    : next
}

/** Re-serialize a (mutated) note and write it, deleting any section files that no longer exist. */
async function writeNoteRecord(ctx: ToolContext, dir: string, before: DiskNote, after: DiskNote): Promise<void> {
  const beforeFiles = new Set(before.sections.map((s) => `${s.id}.md`))
  const { files, sectionFiles } = noteFormat.serializeNoteFolder(after)
  for (const f of sectionFiles) beforeFiles.delete(f)
  await ctx.writeNote({ dir, files, deleteFiles: [...beforeFiles] })
  ctx.onNoteEdited?.(after.id)
}

function ok(summary: string, content?: string): ToolRunResult {
  return { summary, content: content ?? summary }
}
function fail(message: string): ToolRunResult {
  return { summary: message, content: message, isError: true }
}

/** Compact id↔title listing of the current notes, embedded in "not found" errors so the model can
 *  self-correct in the same step instead of reusing a stale/mistyped id. */
function listNotesBrief(ctx: ToolContext, cap = 40): string {
  const rows: string[] = []
  for (const { note } of allNotes(ctx)) {
    rows.push(`- ${note.title || 'Untitled'} [id=${note.id}]`)
    if (rows.length >= cap) break
  }
  return rows.join('\n')
}

/** Self-correcting error for a missing note id. Note ids are stable on disk; a miss means the id is
 *  stale or garbled, so we hand back the live id↔title list rather than a dead end. */
function noteNotFound(ctx: ToolContext, id: string): ToolRunResult {
  const listing = listNotesBrief(ctx)
  return fail(
    `No note with id "${id}". Note ids are stable and never change, so this id is stale or mistyped — ` +
    `do not retry it verbatim. ` +
    (listing ? `Use the correct id from the current notes below:\n${listing}` : 'There are currently no notes.'),
  )
}

/** Self-correcting error for a missing section id — lists the note's real section ids. */
function sectionNotFound(note: DiskNote, sid: string): ToolRunResult {
  const secs = note.sections.map((s) => `${s.name} [section_id=${s.id}]`).join(', ')
  return fail(`No section "${sid}" in note "${note.title || 'Untitled'}". Its sections are: ${secs || '(none)'}.`)
}

/** Human-readable description of what a destructive tool call will affect, resolved from the live
 *  store — for the in-chat confirmation prompt, so the user sees the actual target (a title) rather
 *  than an opaque id and can catch a wrong-target deletion before approving it. */
export function describeTarget(name: string, rawInput: unknown, ctx: ToolContext): string {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Args
  switch (name) {
    case 'delete_note': {
      const found = loadNote(ctx, asStr(input.note_id))
      if (found?.linked) return `linked note "${found.note.title || 'Untitled'}" (it is only unlinked from NoteFlow — the file is not deleted)`
      return found
        ? `note "${found.note.title || 'Untitled'}"`
        : `an unknown note (id ${asStr(input.note_id)} not found — it may already be gone)`
    }
    case 'delete_section': {
      const found = loadNote(ctx, asStr(input.note_id))
      const sec = found?.note.sections.find((s) => s.id === asStr(input.section_id))
      return found && sec
        ? `section "${sec.name}" in note "${found.note.title || 'Untitled'}"`
        : 'a section that no longer exists'
    }
    case 'delete_group': {
      const g = ctx.readGroups().find((x) => x.id === asStr(input.group_id))
      return g ? `group "${g.name}" (its notes are kept, just ungrouped)` : 'a group that no longer exists'
    }
    case 'delete_folder': {
      const f = ctx.readFolders().find((x) => x.id === asStr(input.folder_id))
      return f ? `folder "${f.name}" (its notes keep their group)` : 'a folder that no longer exists'
    }
    default:
      return name
  }
}

/** Present-tense, human label for a tool call WHILE it runs — surfaced in the chat's live activity
 *  row so the user sees not just "an agent ran" but WHAT it's doing and on which note/group. Resolves
 *  ids→titles from the live store; falls back to a generic verb when the target can't be named. */
export function describeAction(name: string, rawInput: unknown, ctx: ToolContext): string {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Args
  const noteTitle = (id: string) => loadNote(ctx, id)?.note.title?.trim() || 'note'
  const groupName = (id: string) => ctx.readGroups().find((g) => g.id === id)?.name?.trim() || 'group'
  const folderName = (id: string) => ctx.readFolders().find((f) => f.id === id)?.name?.trim() || 'folder'
  switch (name) {
    case 'list_notes': return 'Listing notes…'
    case 'get_note': return `Reading "${noteTitle(asStr(input.note_id))}"…`
    case 'list_groups': return 'Listing groups…'
    case 'search_notes': { const q = asStr(input.query).trim(); return q ? `Searching for "${q}"…` : 'Searching notes…' }
    case 'create_note': { const t = asStr(input.title).trim(); return t ? `Creating note "${t}"…` : 'Creating note…' }
    case 'update_note': return `Updating "${noteTitle(asStr(input.note_id))}"…`
    case 'add_section': { const n = asStr(input.name).trim(); return n ? `Adding section "${n}"…` : 'Adding section…' }
    case 'update_section': return `Editing section of "${noteTitle(asStr(input.note_id))}"…`
    case 'rename_section': return `Renaming section of "${noteTitle(asStr(input.note_id))}"…`
    case 'create_group': { const n = asStr(input.name).trim(); return n ? `Creating group "${n}"…` : 'Creating group…' }
    case 'create_folder': { const n = asStr(input.name).trim(); return n ? `Creating folder "${n}"…` : 'Creating folder…' }
    case 'rename_group': return `Renaming group "${groupName(asStr(input.group_id))}"…`
    case 'rename_folder': return `Renaming folder "${folderName(asStr(input.folder_id))}"…`
    case 'delete_note': return `Deleting "${noteTitle(asStr(input.note_id))}"…`
    case 'delete_section': return `Deleting section of "${noteTitle(asStr(input.note_id))}"…`
    case 'delete_group': return `Deleting group "${groupName(asStr(input.group_id))}"…`
    case 'delete_folder': return `Deleting folder "${folderName(asStr(input.folder_id))}"…`
    default: return name
  }
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolRunResult> {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Args
  try {
    switch (name) {
      case 'list_notes': {
        const q = asStr(input.query).toLowerCase().trim()
        const groupFilter = asStr(input.group_id).trim()
        const includeArchived = asBool(input.include_archived) ?? false
        const rows: string[] = []
        for (const { note, linked } of allNotes(ctx)) {
          if (note.archived && !includeArchived) continue
          if (groupFilter && note.group !== groupFilter) continue
          if (q && !note.title.toLowerCase().includes(q) && !note.tags.some((t) => t.includes(q))) continue
          const secs = note.encryption ? '(encrypted)' : note.sections.filter((s) => !s.aiHidden).map((s) => `${s.name}#${s.id}`).join(', ')
          const place = [note.group ? `group=${note.group}` : '', note.folder ? `folder=${note.folder}` : ''].filter(Boolean).join(' ')
          rows.push(`- ${note.title || 'Untitled'} [id=${note.id}]${linked ? ` (linked ${isPlainTextLinked(note) ? 'plain-text' : 'Markdown'} file, single section)` : ''}${place ? ` ${place}` : ''} :: ${secs}`)
          if (rows.length >= 60) break
        }
        return ok(`Listed ${rows.length} notes`, rows.length ? rows.join('\n') : 'No notes found.')
      }

      case 'get_note': {
        const found = loadNote(ctx, asStr(input.note_id))
        if (!found) return noteNotFound(ctx, asStr(input.note_id))
        const { note, linked } = found
        if (note.encryption) return ok(`Read "${note.title}"`, `Note "${note.title}" is encrypted; its content is not readable.`)
        if (linked && note.sections.every((s) => s.aiHidden)) return ok(`Read "${note.title}"`, `Note "${note.title}" is hidden from the AI.`)
        const body = note.sections
          .filter((s) => !s.aiHidden) // sections hidden from the AI are never exposed to the model
          .map((s) => {
            const text = stripBase64(s.content)
            // Say so when cut: update_section replaces the whole section, so rewriting from a
            // silently truncated read would drop the tail.
            const body = text.length > 6000 ? `${text.slice(0, 6000)}\n[…truncated — do not rewrite this whole section with update_section]` : text
            return `## ${s.name} [section_id=${s.id}]\n${body}`
          })
          .join('\n\n')
        const linkedNote = !linked
          ? ''
          : isPlainTextLinked(note)
            ? `\n(Linked note: an external plain-text file (${note.sections[0]?.name ?? ''}), NOT Markdown, with a single section. Edit it with update_section, keeping the file's exact format (no Markdown); sections cannot be added, deleted or renamed.)`
            : '\n(Linked note: an external Markdown file with a single section. Edit it with update_section; sections cannot be added, deleted or renamed.)'
        return ok(`Read "${note.title}"`, `# ${note.title} [id=${note.id}]${linkedNote}\n${body}`)
      }

      case 'list_groups': {
        const groups = ctx.readGroups()
        const folders = ctx.readFolders()
        const lines = groups.map((g) => {
          const subs = folders.filter((f) => f.groupId === g.id).map((f) => `${f.name}#${f.id}`).join(', ')
          return `- ${g.name} [id=${g.id}]${g.archived ? ' (archived)' : ''}${subs ? ` folders: ${subs}` : ''}`
        })
        return ok(`Listed ${groups.length} groups`, lines.length ? lines.join('\n') : 'No groups yet.')
      }

      case 'search_notes': {
        if (!ctx.search) return ok('Search unavailable', 'Semantic search is unavailable (the local AI index is off).')
        const k = typeof input.k === 'number' ? input.k : 6
        const hits = await ctx.search(asStr(input.query), k)
        if (!hits.length) return ok('No matches', 'No relevant notes found.')
        const lines = hits.map((h) => {
          const found = loadNote(ctx, h.noteId)
          const title = found?.note.title || 'Untitled'
          return `- ${title} [id=${h.noteId}] :: ${stripBase64(h.snippet).slice(0, 200)}`
        })
        return ok(`Found ${hits.length} matches`, lines.join('\n'))
      }

      case 'create_note': {
        const title = asStr(input.title).trim() || defaultNoteTitle()
        const groupId = asStr(input.group_id).trim()
        let folderId = asStr(input.folder_id).trim()
        if (folderId && !ctx.readFolders().some((f) => f.id === folderId)) folderId = ''
        const rawSections = Array.isArray(input.sections) ? (input.sections as Args[]) : []
        const now = new Date().toISOString()
        const sections: DiskSection[] = rawSections.length
          ? rawSections.map((s) => ({ id: makeId(6), name: asStr(s.name).trim() || 'Note', content: asStr(s.content), isRawMode: asBool(s.raw) ?? false, created: now, updated: now }))
          : [{ id: makeId(6), name: 'Note', content: '', isRawMode: false, created: now, updated: now }]
        const id = makeId(8)
        const note: DiskNote = {
          id, title, tags: extractTags(sections.map((s) => s.content).join('\n')),
          created: now, updated: now,
          ...(groupId ? { group: groupId } : {}), ...(folderId ? { folder: folderId } : {}),
          sections,
        }
        const dir = noteFormat.noteDirname(id, title)
        const { files } = noteFormat.serializeNoteFolder(note)
        await ctx.writeNote({ dir, files })
        return { ...ok(`Created note "${title}"`, `Created note "${title}" with id ${id} and ${sections.length} section(s).`), noteId: id }
      }

      case 'update_note': {
        const found = loadNote(ctx, asStr(input.note_id))
        if (!found) return noteNotFound(ctx, asStr(input.note_id))
        const { dir, note } = found
        const after: DiskNote = { ...note, sections: [...note.sections] }
        if (typeof input.title === 'string' && input.title.trim()) after.title = input.title.trim()
        const fav = asBool(input.favorited); if (fav !== undefined) after.favorited = fav
        const arc = asBool(input.archived); if (arc !== undefined) after.archived = arc
        if (typeof input.group_id === 'string') after.group = input.group_id.trim() || undefined
        if (typeof input.folder_id === 'string') after.folder = input.folder_id.trim() || undefined
        if (!after.group) after.folder = undefined // a folder requires a group
        if (found.linked) {
          // Local metadata only: the title is an alias, the file is never renamed.
          ctx.linked?.updateMeta(note.id, {
            title: after.title, group: after.group ?? '', folder: after.folder ?? '',
            favorited: !!after.favorited, archived: !!after.archived,
          })
          ctx.onNoteEdited?.(note.id)
          return ok(`Updated "${after.title}"`)
        }
        await writeNoteRecord(ctx, dir, note, after)
        return ok(`Updated "${after.title}"`)
      }

      case 'add_section': {
        const found = loadNote(ctx, asStr(input.note_id))
        if (!found) return noteNotFound(ctx, asStr(input.note_id))
        if (found.linked) return fail(LINKED_STRUCTURE_ERROR)
        if (found.note.encryption) return fail('Cannot edit an encrypted note.')
        const sid = makeId(6)
        const now = new Date().toISOString()
        const after: DiskNote = {
          ...found.note,
          sections: [...found.note.sections, { id: sid, name: asStr(input.name).trim() || 'Section', content: asStr(input.content), isRawMode: asBool(input.raw) ?? false, created: now, updated: now }],
        }
        await writeNoteRecord(ctx, found.dir, found.note, after)
        return ok(`Added section "${asStr(input.name)}"`, `Added section "${asStr(input.name)}" (id ${sid}).`)
      }

      case 'update_section':
      case 'rename_section': {
        const found = loadNote(ctx, asStr(input.note_id))
        if (!found) return noteNotFound(ctx, asStr(input.note_id))
        if (found.note.encryption) return fail('Cannot edit an encrypted note.')
        const sid = asStr(input.section_id)
        if (!found.note.sections.some((s) => s.id === sid)) return sectionNotFound(found.note, sid)
        if (found.linked) {
          if (name === 'rename_section') return fail(LINKED_STRUCTURE_ERROR)
          const section = found.note.sections.find((s) => s.id === sid)!
          if (section.aiHidden) return fail('This note is hidden from the AI; it cannot be edited by the assistant.')
          const res = await ctx.linked!.writeBody(found.note.id, restoreStrippedImages(section.content, asStr(input.content)))
          if (!res.ok) return fail(`Could not write the linked file: ${res.error}. Nothing was changed.`)
          ctx.onNoteEdited?.(found.note.id)
          return ok('Updated section')
        }
        const after: DiskNote = {
          ...found.note,
          sections: found.note.sections.map((s) => s.id !== sid ? s
            : withSectionEdit(s, name === 'rename_section'
              ? { name: asStr(input.name).trim() || s.name }
              : { content: restoreStrippedImages(s.content, asStr(input.content)) })),
        }
        await writeNoteRecord(ctx, found.dir, found.note, after)
        return ok(name === 'rename_section' ? `Renamed section` : `Updated section`)
      }

      case 'create_group': {
        const groups = ctx.readGroups()
        const id = makeId(8)
        groups.push({ id, name: asStr(input.name).trim() || 'Group', color: normalizeGroupColor(asStr(input.color)), order: groups.length })
        await ctx.writeGroups(groups)
        return ok(`Created group "${asStr(input.name)}"`, `Created group "${asStr(input.name)}" with id ${id}.`)
      }

      case 'create_folder': {
        const groupId = asStr(input.group_id)
        if (!ctx.readGroups().some((g) => g.id === groupId)) return fail(`No group with id ${groupId}`)
        const folders = ctx.readFolders()
        const id = makeId(8)
        folders.push({ id, name: asStr(input.name).trim() || 'Folder', groupId, order: folders.filter((f) => f.groupId === groupId).length })
        await ctx.writeFolders(folders)
        return ok(`Created folder "${asStr(input.name)}"`, `Created folder "${asStr(input.name)}" with id ${id}.`)
      }

      case 'rename_group': {
        const id = asStr(input.group_id)
        const groups = ctx.readGroups()
        if (!groups.some((g) => g.id === id)) return fail(`No group with id ${id}`)
        await ctx.writeGroups(groups.map((g) => g.id === id ? { ...g, name: asStr(input.name).trim() || g.name } : g))
        return ok(`Renamed group`)
      }

      case 'rename_folder': {
        const id = asStr(input.folder_id)
        const folders = ctx.readFolders()
        if (!folders.some((f) => f.id === id)) return fail(`No folder with id ${id}`)
        await ctx.writeFolders(folders.map((f) => f.id === id ? { ...f, name: asStr(input.name).trim() || f.name } : f))
        return ok(`Renamed folder`)
      }

      case 'delete_note': {
        if (isLinkedId(asStr(input.note_id))) {
          // A linked note is only unlinked: its file is never deleted.
          const found = loadNote(ctx, asStr(input.note_id))
          if (!found) return noteNotFound(ctx, asStr(input.note_id))
          ctx.linked?.unlink(found.note.id)
          return ok(`Unlinked "${found.note.title}"`, `Unlinked the linked note "${found.note.title}" from NoteFlow. Its file was NOT deleted.`)
        }
        const dir = findNoteDir(ctx, asStr(input.note_id))
        if (!dir) return noteNotFound(ctx, asStr(input.note_id))
        // Resolve the title before deleting so the summary names what was removed (catches wrong-target deletes).
        const title = noteFormat.parseNoteDir(`${ctx.notesDir}/${dir}`)?.title || asStr(input.note_id)
        ctx.deleteNoteDir(dir)
        return ok(`Deleted note "${title}"`)
      }

      case 'delete_section': {
        const found = loadNote(ctx, asStr(input.note_id))
        if (!found) return noteNotFound(ctx, asStr(input.note_id))
        if (found.linked) return fail(LINKED_STRUCTURE_ERROR)
        if (found.note.encryption) return fail('Cannot edit an encrypted note.')
        const sid = asStr(input.section_id)
        if (!found.note.sections.some((s) => s.id === sid)) return sectionNotFound(found.note, sid)
        const after: DiskNote = { ...found.note, sections: found.note.sections.filter((s) => s.id !== sid) }
        await writeNoteRecord(ctx, found.dir, found.note, after)
        return ok(`Deleted section`)
      }

      case 'delete_group': {
        const id = asStr(input.group_id)
        const groups = ctx.readGroups()
        if (!groups.some((g) => g.id === id)) return fail(`No group with id ${id}`)
        // ungroup every note that lived in this group (keep the note, drop group+folder)
        for (const { dir, note, linked } of allNotes(ctx)) {
          if (note.group !== id) continue
          if (linked) ctx.linked?.updateMeta(note.id, { group: '', folder: '' })
          else await writeNoteRecord(ctx, dir, note, { ...note, group: undefined, folder: undefined })
        }
        await ctx.writeGroups(groups.filter((g) => g.id !== id))
        await ctx.writeFolders(ctx.readFolders().filter((f) => f.groupId !== id))
        return ok(`Deleted group`)
      }

      case 'delete_folder': {
        const id = asStr(input.folder_id)
        const folders = ctx.readFolders()
        if (!folders.some((f) => f.id === id)) return fail(`No folder with id ${id}`)
        for (const { dir, note, linked } of allNotes(ctx)) {
          if (note.folder !== id) continue
          if (linked) ctx.linked?.updateMeta(note.id, { folder: '' })
          else await writeNoteRecord(ctx, dir, note, { ...note, folder: undefined })
        }
        await ctx.writeFolders(folders.filter((f) => f.id !== id))
        return ok(`Deleted folder`)
      }

      default:
        return fail(`Unknown tool: ${name}`)
    }
  } catch (err) {
    return fail(`Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
