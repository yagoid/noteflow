// Pure helpers for the notes-dir watcher (startNotesWatcher in main.ts) and the
// conditional note writes (applyNoteWrite). Covered by tests/electron/notesWatchFilter.test.ts.

import { createHash } from 'node:crypto'

/**
 * Root-level metadata files that groupsStore.loadGroups() reads. An external
 * write to any of them (the CLI creating/renaming/deleting a group or folder)
 * must reach the renderer, or its next group action would rewrite the whole
 * list from memory and undo it.
 */
export const GROUPS_METADATA_FILES = ['groups.json', 'folders.json', 'note-order.json'] as const

/**
 * Is this watcher path (relative to the notes dir, forward slashes) one of the
 * groups metadata files? Only exact root-level names match: a temp file of an
 * atomic tmp+rename write is ignored, and the final rename reports the real name.
 */
export function isGroupsMetadataFile(rel: string): boolean {
  return (GROUPS_METADATA_FILES as readonly string[]).includes(rel)
}

// ── Echoes of the app's own note writes (applyNoteWrite) ─────────────────────
//
// The watcher used to ignore EVERY event of a note folder for 1.5 s after the app
// wrote it (a time window). With the editor saving ~400 ms after each keystroke,
// a folder being typed in was blind for ~2 s after the last key: a CLI write landing
// then (`noteflow add`, an agent's `task finish`) was taken for our own echo, never
// reached the editor, and the next keystroke overwrote it. Now main remembers WHAT
// it wrote to each file (a hash) and, when the folder's events settle, compares the
// disk with it: the same bytes are our echo; anything else is an external change.

const NOTE_MD_FILE = 'note.md'

/** Hash of a file's bytes: a string is hashed as the UTF-8 that writeFileSync puts on disk. */
export function contentHash(content: string | Uint8Array): string {
  return createHash('sha1').update(content).digest('hex')
}

/** How long a recorded write is remembered (only bounds memory: a matching disk is our echo whenever it is seen). */
export const OWN_WRITE_TTL_MS = 60_000

interface OwnWrite {
  /** Hash of what we wrote, null = we deleted the file. */
  hash: string | null
  at: number
}

/**
 * What the app last wrote to each note file ('<dir>/<file>', forward slashes),
 * to tell the watcher's events of its own writes from external ones by content.
 */
export class OwnNoteWrites {
  private readonly files = new Map<string, OwnWrite>()
  private readonly dirs = new Map<string, number>() // note dir → time of our last write to it
  private lastPrune = 0

  constructor(private readonly ttlMs = OWN_WRITE_TTL_MS) {}

  /** We are writing `content` to `<dir>/<file>` (null: deleting it). Call it right before the disk changes. */
  record(dir: string, file: string, content: string | null, now: number): void {
    this.prune(now)
    this.files.set(`${dir}/${file}`, { hash: content === null ? null : contentHash(content), at: now })
    this.dirs.set(dir, now)
  }

  /** Did we write the folder `dir` in the last `withinMs`? */
  wroteDirWithin(dir: string, withinMs: number, now: number): boolean {
    const at = this.dirs.get(dir)
    return at !== undefined && now - at <= withinMs
  }

  /** Do we remember a write to `dir` (any of its files)? */
  knowsDir(dir: string, now: number): boolean {
    return this.wroteDirWithin(dir, this.ttlMs, now)
  }

  /**
   * Is the disk content of `rel` (null = missing) our own last write to it? An
   * unknown or expired file is not. A file found different is forgotten: the
   * disk is no longer ours, so a later event bringing back our old bytes (a pull
   * restoring them) is external too.
   */
  isEcho(rel: string, disk: Uint8Array | null, now: number): boolean {
    const own = this.files.get(rel)
    if (!own || now - own.at > this.ttlMs) return false
    if (own.hash === (disk === null ? null : contentHash(disk))) return true
    this.files.delete(rel)
    return false
  }

  /** Entries recorded (tests). */
  get size(): number {
    return this.files.size
  }

  private prune(now: number): void {
    if (now - this.lastPrune < this.ttlMs / 6) return
    this.lastPrune = now
    for (const [rel, own] of this.files) if (now - own.at > this.ttlMs) this.files.delete(rel)
    for (const [dir, at] of this.dirs) if (now - at > this.ttlMs) this.dirs.delete(dir)
  }
}

/**
 * The settled events of one note folder (`rels`: '<dir>' and/or '<dir>/<file>.md'
 * paths, gathered by the watcher's per-folder debounce), judged against our own
 * writes once the writes settled. `read` gives a file's bytes now (null = missing).
 * - each file whose disk content is not our last write to it is external
 *   (`externalFiles`, which feed the live catch-up);
 * - an event of the folder itself is external unless we wrote that folder and its
 *   note.md is still there (a deleted or new-from-elsewhere folder is not ours).
 * `external`: the folder must be reloaded by the windows.
 */
export function settleNoteDirEvents(
  own: OwnNoteWrites,
  dir: string,
  rels: Iterable<string>,
  read: (rel: string) => Uint8Array | null,
  now: number,
): { external: boolean; externalFiles: string[] } {
  const externalFiles: string[] = []
  let dirExternal = false
  for (const rel of rels) {
    if (rel === dir) {
      if (!dirExternal) dirExternal = !own.knowsDir(dir, now) || read(`${dir}/${NOTE_MD_FILE}`) === null
    } else if (!own.isEcho(rel, read(rel), now)) {
      externalFiles.push(rel)
    }
  }
  return { external: dirExternal || externalFiles.length > 0, externalFiles }
}

// ── Conditional note writes (applyNoteWrite's `expectFiles`) ─────────────────

/** Text compare of a note file as the renderer reads it: BOM and CRLF don't count, a missing file reads as empty. */
export function sameNoteFileText(disk: string | null, expected: string): boolean {
  const norm = (s: string) => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  return disk === expected || norm(disk ?? '') === norm(expected)
}

/**
 * The files of `expect` (file → the content the renderer's copy believes is on
 * disk) whose disk text (`read`, null = missing) is another one. Empty = the
 * conditional write may go ahead.
 */
export function changedExpectedFiles(expect: Record<string, string>, read: (file: string) => string | null): string[] {
  return Object.entries(expect).filter(([file, text]) => !sameNoteFileText(read(file), text)).map(([file]) => file)
}
