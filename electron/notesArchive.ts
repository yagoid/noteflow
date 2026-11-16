// Local archive of the synced notes — "use only the remote's notes" when the
// notes dir switches to another sync identity (syncOrigin.ts). NEVER deletes:
// the notes that would sync are MOVED out of the notes dir into
// `<archiveRoot>/<label>-<ISO with ':' → '-'>/`, so the pull that follows brings
// only the new remote's notes and nothing of the previous origin is uploaded.
// Backend-agnostic (GitHub today, NoteFlow Cloud later): the caller injects the
// archive root (main.ts: userData/notes-archive) and the label ('github-…',
// 'cloud-…'). No Electron imports; tested in tests/electron/notesArchive.test.ts.
//
// Layout of one archive:
//   <archiveDir>/manifest.json         origin, date, what was moved (for a future "restore")
//   <archiveDir>/notes/<noteDir>/…      the note folders, as they were
//   <archiveDir>/notes/<metadata>.json  the root metadata files, as they were
//
// What moves and what stays:
// - Note folders that sync (listSyncedNoteDirs). Local-only notes (localOnly:
//   true) stay; linked notes live outside the notes dir and are never seen.
// - Root metadata describing that set: groups, folders, note order, section
//   colours, templates, snippets — moved whole. groups/folders/note-order/
//   section-colors may ALSO describe notes that stay (a local-only note's group,
//   its place in the order, its sections' colours; a linked note's group or
//   folder): for those the original is archived complete and a FILTERED copy
//   with only the entries the remaining notes use is left in its place (none
//   used → no file left).
// - ui-settings.json is this device's appearance: COPIED into the archive and
//   left in place.
//
// Anti-loss: never a half state. Each item is renamed; across volumes (EXDEV) it
// is copied, verified byte for byte and only then removed from the source. Any
// failure undoes everything already done, in reverse order, and throws
// NotesArchiveError. If the undo itself fails nothing more is deleted: the
// error lists what stayed in the archive (where it is safe).

import fs from 'fs'
import path from 'path'
import { NOTE_MD, parseNoteDir } from './noteFormat'
import { listSyncedNoteDirs } from './localOnlyNotes'
import { sanitizeLabel } from './syncOrigin'

/** Root metadata files archived (moved) with the notes. */
export const ARCHIVED_METADATA_FILES = [
  'groups.json',
  'folders.json',
  'section-colors.json',
  'note-order.json',
  'templates.json',
  'snippets.json',
] as const

/** Root files copied into the archive but left in place (device appearance). */
export const COPIED_METADATA_FILES = ['ui-settings.json'] as const

export const ARCHIVE_MANIFEST = 'manifest.json'
const ARCHIVE_NOTES_SUBDIR = 'notes'

export interface ArchiveManifest {
  version: 1
  createdAt: string
  label: string
  /** Opaque description of the origin the notes came from (e.g. the GitHub identity). */
  origin?: unknown
  /** Absolute path of the notes dir they were moved from. */
  notesDir: string
  /** Note folders moved (names, relative to the notes dir). */
  movedDirs: string[]
  /** Root files moved (names). */
  movedFiles: string[]
  /** Of movedFiles: a filtered copy was left in the notes dir for the notes that stayed. */
  filteredFiles: string[]
  /** Root files copied (left in place). */
  copiedFiles: string[]
}

export interface ArchiveResult {
  archiveDir: string
  movedDirs: string[]
  /** Note ids of the moved folders (read from their note.md; missing when unreadable). */
  movedNoteIds: string[]
  movedFiles: string[]
  filteredFiles: string[]
  copiedFiles: string[]
}

/** References that must survive the filtering of the metadata (besides the notes that stay). */
export interface KeepRefs {
  groupIds?: Iterable<string>
  folderIds?: Iterable<string>
  noteIds?: Iterable<string>
}

/** File-system primitives (injectable for tests: EXDEV, EBUSY…). */
export interface ArchiveFsOps {
  rename(from: string, to: string): void
  /** Recursive copy of a file or folder; overwrites existing files at `to`. */
  copy(from: string, to: string): void
  /** Recursive removal of a file or folder. */
  remove(target: string): void
  writeFile(file: string, content: string): void
}

const defaultOps: ArchiveFsOps = {
  rename: (from, to) => fs.renameSync(from, to),
  copy: (from, to) => fs.cpSync(from, to, { recursive: true, force: true, errorOnExist: false }),
  remove: (target) => fs.rmSync(target, { recursive: true }),
  writeFile: (file, content) => fs.writeFileSync(file, content, 'utf-8'),
}

export class NotesArchiveError extends Error {
  constructor(
    message: string,
    /** True when every step was undone (the notes dir is exactly as before). */
    readonly rolledBack: boolean,
    /** When the undo failed: what stayed where ("<original> → <archive copy>"). */
    readonly stranded: string[],
    readonly archiveDir?: string,
  ) {
    super(message)
    this.name = 'NotesArchiveError'
  }
}

// ── Labels and paths ──────────────────────────────────────────────────────────

/** '2026-11-16T10:20:30.000Z' → '2026-11-16T10-20-30.000Z' (folder-name safe on every OS). */
export function archiveTimestamp(now: Date): string {
  return now.toISOString().replace(/:/g, '-')
}

/** Folder name of an archive: '<sanitized label>-<timestamp>'. */
export function archiveFolderName(label: string, now: Date): string {
  return `${sanitizeLabel(label)}-${archiveTimestamp(now)}`
}

// ── Metadata filtering (pure) ─────────────────────────────────────────────────

/** What the notes that stay in the notes dir still use. */
export interface KeptRefs {
  noteIds: Set<string>
  groupIds: Set<string>
  folderIds: Set<string>
  /** Normalized (trim + lowercase) section names — the section-colors.json keys. */
  sectionNames: Set<string>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * The part of a root metadata file the notes that stay still use, serialized
 * like main.ts writes it (2-space JSON) — or null when nothing is used or the
 * file can't be understood (then it is archived whole, nothing left behind).
 * Only groups/folders/note-order/section-colors can be filtered; the rest → null.
 */
export function filterMetadataForKept(file: string, content: string, kept: KeptRefs): string | null {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return null
  }
  switch (file) {
    case 'groups.json':
    case 'folders.json': {
      if (!Array.isArray(data)) return null
      const ids = file === 'groups.json' ? kept.groupIds : kept.folderIds
      const left = data.filter((item) => isRecord(item) && typeof item.id === 'string' && ids.has(item.id))
      return left.length > 0 ? JSON.stringify(left, null, 2) : null
    }
    case 'note-order.json': {
      if (!isRecord(data)) return null
      const left: Record<string, string[]> = {}
      for (const [key, list] of Object.entries(data)) {
        if (!Array.isArray(list)) continue
        const ids = list.filter((id): id is string => typeof id === 'string' && kept.noteIds.has(id))
        if (ids.length > 0) left[key] = ids
      }
      return Object.keys(left).length > 0 ? JSON.stringify(left, null, 2) : null
    }
    case 'section-colors.json': {
      if (!isRecord(data)) return null
      const left: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(data)) {
        if (kept.sectionNames.has(key.trim().toLowerCase())) left[key] = value
      }
      return Object.keys(left).length > 0 ? JSON.stringify(left, null, 2) : null
    }
    default:
      return null
  }
}

/**
 * References of the notes that stay (`keptDirs`, parsed from disk) plus the
 * caller's extra refs (linked notes). A kept folder keeps its group too, read
 * from folders.json (`foldersJson`, may be null).
 */
export function collectKeptRefs(
  notesDir: string,
  keptDirs: readonly string[],
  extra: KeepRefs | undefined,
  foldersJson: string | null,
): KeptRefs {
  const kept: KeptRefs = { noteIds: new Set(), groupIds: new Set(), folderIds: new Set(), sectionNames: new Set() }
  for (const dir of keptDirs) {
    const note = parseNoteDir(path.join(notesDir, dir))
    if (!note) continue
    kept.noteIds.add(note.id)
    if (note.group) kept.groupIds.add(note.group)
    if (note.folder) kept.folderIds.add(note.folder)
    for (const s of note.sections) kept.sectionNames.add(s.name.trim().toLowerCase())
  }
  for (const id of extra?.groupIds ?? []) if (id) kept.groupIds.add(id)
  for (const id of extra?.folderIds ?? []) if (id) kept.folderIds.add(id)
  for (const id of extra?.noteIds ?? []) if (id) kept.noteIds.add(id)
  if (foldersJson !== null) {
    try {
      const folders = JSON.parse(foldersJson) as unknown
      if (Array.isArray(folders)) {
        for (const f of folders) {
          if (isRecord(f) && typeof f.id === 'string' && kept.folderIds.has(f.id) && typeof f.groupId === 'string') {
            kept.groupIds.add(f.groupId)
          }
        }
      }
    } catch { /* unparseable: archived whole */ }
  }
  return kept
}

// ── Moving with verification ──────────────────────────────────────────────────

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException)?.code
}

/** Relative paths + bytes of every file under `root` (a file root → ['']). */
function readTree(root: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const walk = (abs: string, rel: string) => {
    const st = fs.statSync(abs)
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(abs)) walk(path.join(abs, name), rel ? `${rel}/${name}` : name)
    } else {
      out.set(rel, fs.readFileSync(abs))
    }
  }
  walk(root, '')
  return out
}

/** Throws unless `copy` holds exactly the files of `original`, byte for byte. */
function verifySameTree(original: string, copy: string): void {
  const a = readTree(original)
  const b = readTree(copy)
  if (a.size !== b.size) throw new Error(`copy of ${original} is incomplete`)
  for (const [rel, bytes] of a) {
    const other = b.get(rel)
    if (!other || !other.equals(bytes)) throw new Error(`copy of ${original} differs at "${rel || path.basename(original)}"`)
  }
}

/**
 * Moves a file or folder. Same volume: one rename. Across volumes (EXDEV):
 * copy → verify → remove the source; a failed copy leaves the source intact (the
 * partial copy is dropped), a failed removal restores the source from the
 * verified copy before throwing. Throws when it couldn't move; if even the
 * restore failed, the thrown error carries `stranded` (data kept in `to`).
 */
function moveItem(from: string, to: string, ops: ArchiveFsOps): void {
  try {
    ops.rename(from, to)
    return
  } catch (err) {
    if (errCode(err) !== 'EXDEV') throw err
  }
  try {
    ops.copy(from, to)
    verifySameTree(from, to)
  } catch (err) {
    try { ops.remove(to) } catch { /* partial copy of an intact source */ }
    throw err
  }
  try {
    ops.remove(from)
  } catch (err) {
    // The source may be half removed: put it back from the verified copy.
    try {
      ops.copy(to, from)
      verifySameTree(to, from)
      try { ops.remove(to) } catch { /* duplicate left in the archive — harmless */ }
    } catch {
      const stranded = new Error(`could not finish moving ${from}; a complete copy is in ${to}`) as Error & { stranded?: string }
      stranded.stranded = `${from} → ${to}`
      throw stranded
    }
    throw err
  }
}

type Step =
  | { kind: 'move'; from: string; to: string; label: string }
  | { kind: 'copy'; to: string }
  | { kind: 'write'; file: string }

/** Undoes `steps` in reverse. Returns what could not be put back ("<original> → <archive>"). */
function rollback(steps: Step[], ops: ArchiveFsOps): string[] {
  const stranded: string[] = []
  for (const step of [...steps].reverse()) {
    try {
      if (step.kind === 'move') {
        // A filtered remainder may sit at `from`: a file rename replaces it
        // atomically (and the EXDEV path copies over it).
        moveItem(step.to, step.from, ops)
      } else if (step.kind === 'copy') {
        ops.remove(step.to) // a duplicate of a file that never moved
      }
      // 'write' (filtered remainder): replaced by the move-back of its original.
    } catch (err) {
      if (step.kind === 'move') {
        stranded.push((err as { stranded?: string }).stranded ?? `${step.from} → ${step.to}`)
      }
    }
  }
  return stranded
}

// ── Archive ───────────────────────────────────────────────────────────────────

export interface ArchiveOptions {
  notesDir: string
  /** Where archives live (main.ts: userData/notes-archive). Created if missing. */
  archiveRoot: string
  /** Origin label, e.g. 'github-owner-repo' (sanitized again here). */
  label: string
  /** Stored as is in the manifest. */
  origin?: unknown
  /** Extra references to keep in the filtered metadata (linked notes' groups/folders). */
  keep?: KeepRefs
  now?: Date
  /** Test hook. */
  fsOps?: Partial<ArchiveFsOps>
}

function readNoteId(notesDir: string, dir: string): string | undefined {
  try {
    const md = fs.readFileSync(path.join(notesDir, dir, NOTE_MD), 'utf-8')
    const m = md.match(/^id:[ \t]*['"]?([^'"\r\n]+?)['"]?[ \t]*$/m)
    return m ? m[1] : undefined
  } catch {
    return undefined
  }
}

/**
 * Moves every synced note folder and the metadata describing them out of the
 * notes dir into a new archive folder (see the module comment). Synchronous on
 * purpose: nothing else in the main process can write the notes dir while it
 * runs. Throws NotesArchiveError — after undoing everything — on any failure,
 * including a notes dir that can't be listed (nothing is moved then).
 */
export function archiveSyncedNotes(opts: ArchiveOptions): ArchiveResult {
  const ops: ArchiveFsOps = { ...defaultOps, ...opts.fsOps }
  const now = opts.now ?? new Date()
  const label = sanitizeLabel(opts.label)
  const notesDir = opts.notesDir

  let entries: string[]
  try {
    entries = fs.readdirSync(notesDir) // listNoteDirs would swallow a failure into "no notes"
  } catch (err) {
    throw new NotesArchiveError(`cannot read the notes folder: ${String(err)}`, true, [])
  }
  const synced = listSyncedNoteDirs(notesDir)
  const syncedSet = new Set(synced)
  const keptDirs = entries.filter((name) => !syncedSet.has(name) && fs.existsSync(path.join(notesDir, name, NOTE_MD)))
  const movedNoteIds = synced.map((dir) => readNoteId(notesDir, dir)).filter((id): id is string => !!id)

  const readRoot = (file: string): string | null => {
    try {
      return fs.readFileSync(path.join(notesDir, file), 'utf-8')
    } catch {
      return null
    }
  }
  const kept = collectKeptRefs(notesDir, keptDirs, opts.keep, readRoot('folders.json'))

  // Unique archive folder (two switches in the same millisecond, or a clock step back).
  let archiveDir = path.join(opts.archiveRoot, archiveFolderName(label, now))
  for (let n = 2; fs.existsSync(archiveDir); n++) {
    archiveDir = path.join(opts.archiveRoot, `${archiveFolderName(label, now)}-${n}`)
  }
  const archivedNotes = path.join(archiveDir, ARCHIVE_NOTES_SUBDIR)
  try {
    fs.mkdirSync(archivedNotes, { recursive: true })
  } catch (err) {
    throw new NotesArchiveError(`cannot create the archive folder: ${String(err)}`, true, [])
  }

  const steps: Step[] = []
  const movedDirs: string[] = []
  const movedFiles: string[] = []
  const filteredFiles: string[] = []
  const copiedFiles: string[] = []
  try {
    for (const dir of synced) {
      const from = path.join(notesDir, dir)
      const to = path.join(archivedNotes, dir)
      moveItem(from, to, ops)
      steps.push({ kind: 'move', from, to, label: dir })
      movedDirs.push(dir)
    }
    for (const file of ARCHIVED_METADATA_FILES) {
      const from = path.join(notesDir, file)
      const content = readRoot(file)
      if (content === null && !fs.existsSync(from)) continue
      const to = path.join(archivedNotes, file)
      moveItem(from, to, ops)
      steps.push({ kind: 'move', from, to, label: file })
      movedFiles.push(file)
      const remainder = content === null ? null : filterMetadataForKept(file, content, kept)
      if (remainder !== null) {
        ops.writeFile(from, remainder)
        steps.push({ kind: 'write', file: from })
        filteredFiles.push(file)
      }
    }
    for (const file of COPIED_METADATA_FILES) {
      const from = path.join(notesDir, file)
      if (!fs.existsSync(from)) continue
      const to = path.join(archivedNotes, file)
      ops.copy(from, to)
      steps.push({ kind: 'copy', to })
      verifySameTree(from, to)
      copiedFiles.push(file)
    }
    const manifest: ArchiveManifest = {
      version: 1,
      createdAt: now.toISOString(),
      label,
      ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
      notesDir,
      movedDirs,
      movedFiles,
      filteredFiles,
      copiedFiles,
    }
    ops.writeFile(path.join(archiveDir, ARCHIVE_MANIFEST), JSON.stringify(manifest, null, 2))
  } catch (err) {
    const immediate = (err as { stranded?: string }).stranded
    const stranded = [...(immediate ? [immediate] : []), ...rollback(steps, ops)]
    if (stranded.length === 0) {
      // Everything is back: drop the (now empty) archive folder — non-recursive,
      // so anything unexpected left in it stays.
      try { fs.rmSync(path.join(archiveDir, ARCHIVE_MANIFEST), { force: true }) } catch { /* ignore */ }
      try { fs.rmdirSync(archivedNotes) } catch { /* not empty: keep */ }
      try { fs.rmdirSync(archiveDir) } catch { /* not empty: keep */ }
    }
    throw new NotesArchiveError(
      `could not archive the local notes: ${err instanceof Error ? err.message : String(err)}`,
      stranded.length === 0,
      stranded,
      stranded.length === 0 ? undefined : archiveDir,
    )
  }

  return { archiveDir, movedDirs, movedNoteIds, movedFiles, filteredFiles, copiedFiles }
}

// ── Listing ───────────────────────────────────────────────────────────────────

export interface ArchiveInfo {
  name: string
  dir: string
  createdAt?: string
  label?: string
}

/** Archives under `archiveRoot` (folders with a manifest), newest first. Missing root → []. */
export function listArchives(archiveRoot: string): ArchiveInfo[] {
  let names: string[]
  try {
    names = fs.readdirSync(archiveRoot)
  } catch {
    return []
  }
  const out: ArchiveInfo[] = []
  for (const name of names) {
    const dir = path.join(archiveRoot, name)
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, ARCHIVE_MANIFEST), 'utf-8')) as Partial<ArchiveManifest>
      out.push({
        name,
        dir,
        ...(typeof manifest.createdAt === 'string' ? { createdAt: manifest.createdAt } : {}),
        ...(typeof manifest.label === 'string' ? { label: manifest.label } : {}),
      })
    } catch { /* not an archive (or still being written) */ }
  }
  return out.sort((a, b) => (b.createdAt ?? b.name).localeCompare(a.createdAt ?? a.name))
}

export function hasArchives(archiveRoot: string): boolean {
  return listArchives(archiveRoot).length > 0
}
