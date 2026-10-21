// Disk side of the conflict copies, shared by both sync backends (cloudSync.ts
// and githubSync.ts). The DECISION (planConflictCopy) and the copy's content
// (buildConflictCopy, conflictCopyTitle, anchorTitle) are pure in
// cloudSyncLogic.ts; this module only reads the local folder, writes the copy
// as a new note folder and keeps the session notice. No Electron imports.

import fs from 'fs'
import path from 'path'
import { NOTE_MD, newNoteId } from './noteFormat'
import { anchorTitle, buildConflictCopy, conflictCopyTitle } from './cloudSyncLogic'

/**
 * Session notice of the conflict copies made by a backend's pulls: local edits
 * that lost against a remote version this device never saw were kept as new
 * notes. `titles` are the copies' titles (latest CONFLICT_COPY_TITLES_MAX);
 * `at` = time of the latest copy. In memory only, until dismissed.
 */
export interface ConflictCopiesNotice {
  count: number
  titles: string[]
  at: string
}

export const CONFLICT_COPY_TITLES_MAX = 10

/** The notice after one more copy titled `title` at `at` (accumulates until dismissed). */
export function appendConflictCopyNotice(
  prev: ConflictCopiesNotice | undefined,
  title: string,
  at: string,
): ConflictCopiesNotice {
  return {
    count: (prev?.count ?? 0) + 1,
    titles: [...(prev?.titles ?? []), title].slice(-CONFLICT_COPY_TITLES_MAX),
    at,
  }
}

/** A conflict copy written to disk: its folder name, absolute path, title and files. */
export interface WrittenConflictCopy {
  dir: string
  dirPath: string
  title: string
  files: Record<string, string>
}

/**
 * Writes the conflict copy of the LOCAL note folder '<dir>' — the WHOLE folder
 * (every section), so it opens as the complete local version of the note — as
 * a new note folder with a fresh id and the title '<title> (<label> <date>)'
 * (buildConflictCopy). `label` is the localized "conflict copy". The copy's
 * folder is created non-recursively (never writes into a folder that appeared
 * meanwhile); a half-written copy is removed again and the error THROWN, so
 * the caller must then leave the original folder untouched.
 */
export function writeConflictCopy(notesDir: string, dir: string, label: string, now: Date): WrittenConflictCopy {
  const localDirPath = path.join(notesDir, dir)
  const localFiles: Record<string, string> = {}
  for (const f of fs.readdirSync(localDirPath)) {
    if (f.endsWith('.md')) localFiles[f] = fs.readFileSync(path.join(localDirPath, f), 'utf-8')
  }
  const title = conflictCopyTitle(anchorTitle(localFiles[NOTE_MD] ?? ''), label, now)
  let copy = buildConflictCopy(localFiles, { newId: newNoteId(), title, nowIso: now.toISOString() })
  while (fs.existsSync(path.join(notesDir, copy.dir))) {
    copy = buildConflictCopy(localFiles, { newId: newNoteId(), title, nowIso: now.toISOString() })
  }
  const copyPath = path.join(notesDir, copy.dir)
  let created = false
  try {
    fs.mkdirSync(copyPath) // not recursive: never writes into a folder that appeared meanwhile
    created = true
    for (const [name, content] of Object.entries(copy.files)) {
      fs.writeFileSync(path.join(copyPath, name), content, 'utf-8')
    }
  } catch (err) {
    // A half-written copy would show up as a broken note: remove it (only if
    // this call created it). The original folder is left untouched.
    if (created) {
      try {
        fs.rmSync(copyPath, { recursive: true, force: true })
      } catch { /* best effort */ }
    }
    throw err
  }
  return { dir: copy.dir, dirPath: copyPath, title, files: copy.files }
}
