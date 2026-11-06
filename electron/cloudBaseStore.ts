// Content of the Cloud sync BASES of section files (see SyncState.bases), so
// the three-way pull can merge a section both sides changed line by line
// against the version this device last reconciled (diff3 —
// mergeSectionText). A base only remembers {seq, hash}; this store keeps the
// text behind the hash: one file per hash (content-addressed — the name IS
// sha-256 of the content, which is hashForBase of a section), in a directory
// next to the sync state (userData/cloud-base-content/). A missing or corrupt
// blob only means "base content unknown" → the merge falls back to the
// two-way union; nothing here can lose a note. No Electron imports (the
// caller passes the directory), so it is testable on its own.

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

const HASH_RE = /^[0-9a-f]{64}$/

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** Stores `content` under its hash (no-op when already there). Best effort: a failure only loses the diff3. */
export function writeBaseBlob(dir: string, content: string): void {
  const hash = sha256(content)
  const file = path.join(dir, hash)
  try {
    if (fs.existsSync(file)) return
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, content, 'utf-8')
    fs.renameSync(tmp, file)
  } catch (err) {
    console.warn('[CloudSync] could not store a base content blob:', String(err))
  }
}

/** The content stored under `hash`, or null (unknown hash, missing or corrupt blob). */
export function readBaseBlob(dir: string, hash: string): string | null {
  if (!HASH_RE.test(hash)) return null
  try {
    const content = fs.readFileSync(path.join(dir, hash), 'utf-8')
    return sha256(content) === hash ? content : null
  } catch {
    return null
  }
}

/** Removes every blob (and leftover temp file) whose hash is not in `keep`. Returns how many went. */
export function pruneBaseBlobs(dir: string, keep: ReadonlySet<string>): number {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return 0 // no store yet
  }
  let removed = 0
  for (const name of names) {
    if (HASH_RE.test(name) && keep.has(name)) continue
    try {
      fs.unlinkSync(path.join(dir, name))
      removed++
    } catch { /* gone meanwhile */ }
  }
  return removed
}

/** Drops the whole store (account switch: every base belonged to the previous account). */
export function clearBaseBlobs(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    console.warn('[CloudSync] could not clear the base content store:', String(err))
  }
}
