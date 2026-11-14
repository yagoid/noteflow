/**
 * localOnlyNotes.ts — notes that never leave this device.
 *
 * A note whose anchor (`note.md`) carries `localOnly: true` in its frontmatter
 * is skipped by EVERY sync path of both backends (GitHub Sync and NoteFlow
 * Cloud): no push, no journal entry, no remote delete, no catch-up upload, no
 * mirror, and the GitHub pull's deletion rule never removes it (it is absent
 * from the remote by design). Today only the first-run welcome note
 * (welcomeNote.ts) is created with the flag; the user cannot set it. It stays
 * local-only for as long as the anchor keeps the key (editing the note keeps
 * it: the three format mirrors round-trip `localOnly`).
 *
 * The flag lives in the note itself, so it survives restarts and is honoured by
 * the CLI too (its own mirror of `isLocalOnlyAnchor` in cli/noteflow.js).
 *
 * Deletions: once a note folder is removed from disk its anchor can no longer
 * be read, so every positive answer is remembered in memory (`knownLocalOnly`)
 * and answers for a folder that is gone. main.ts primes the set at startup
 * (`primeLocalOnlyDirs`), so deleting the welcome note in a later session does
 * not reach the remote either.
 */
import fs from 'fs'
import path from 'path'
import { NOTE_MD, listNoteDirs, splitFrontmatter } from './noteFormat'

/** Frontmatter key of the flag (top level of note.md). */
export const LOCAL_ONLY_KEY = 'localOnly'

// Only an UNQUOTED YAML boolean true (true/True/TRUE — what js-yaml reads as
// `true`): the parsers keep the flag only when it is the boolean, so a quoted
// "true" (a string) must not exclude the note from sync either.
const LOCAL_ONLY_LINE = /^localOnly:[ \t]*(?:true|True|TRUE)[ \t]*(?:#.*)?$/m

/**
 * Pure: whether a note.md declares `localOnly: true`. Only the TOP-LEVEL key of
 * the frontmatter counts (section entries are indented; a `localOnly:` line in
 * a body never matches because only the frontmatter is inspected).
 */
export function isLocalOnlyNoteMd(noteMd: string): boolean {
  const { frontmatter } = splitFrontmatter(noteMd)
  if (!frontmatter) return false
  return LOCAL_ONLY_LINE.test(frontmatter)
}

/**
 * Pure: the note folder a notes-dir-relative sync path belongs to
 * ('<dir>/<file>' → '<dir>'), or null for a root file (metadata JSONs, the
 * format marker) — those always sync.
 */
export function noteDirOfSyncPath(relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, '/')
  const slash = normalized.indexOf('/')
  if (slash <= 0) return null
  return normalized.slice(0, slash)
}

// Folders seen with the flag. Answers for a folder whose anchor is gone
// (deleted note) — see the module comment.
const knownLocalOnly = new Set<string>()

/**
 * Whether the note folder `dir` is local-only. Reads its anchor when it exists
 * (and refreshes the memory either way); falls back to the memory when it can't
 * be read (folder just deleted).
 */
export function isLocalOnlyDir(notesDir: string, dir: string): boolean {
  let noteMd: string
  try {
    noteMd = fs.readFileSync(path.join(notesDir, dir, NOTE_MD), 'utf-8')
  } catch {
    return knownLocalOnly.has(dir)
  }
  const localOnly = isLocalOnlyNoteMd(noteMd)
  if (localOnly) knownLocalOnly.add(dir)
  else knownLocalOnly.delete(dir)
  return localOnly
}

/**
 * Whether a notes-dir-relative FILE path ('<dir>/<file>') is under a local-only
 * note. Root files are never local-only. For a whole folder use isLocalOnlyDir.
 */
export function isLocalOnlySyncPath(notesDir: string | null | undefined, relPath: string): boolean {
  if (!notesDir) return false
  const dir = noteDirOfSyncPath(relPath)
  if (!dir) return false
  return isLocalOnlyDir(notesDir, dir)
}

/** listNoteDirs minus the local-only notes: the folders sync may upload or reconcile. */
export function listSyncedNoteDirs(notesDir: string): string[] {
  return listNoteDirs(notesDir).filter((dir) => !isLocalOnlyDir(notesDir, dir))
}

/** Startup hook (main.ts): remembers every local-only folder on disk. */
export function primeLocalOnlyDirs(notesDir: string): void {
  for (const dir of listNoteDirs(notesDir)) isLocalOnlyDir(notesDir, dir)
}

/** Test hook: forgets the in-memory set. */
export function resetLocalOnlyMemory(): void {
  knownLocalOnly.clear()
}
