// Shared reader/writer for the userData settings.json. Every module that owns a
// section of it (main, account, githubSync, cloudSync, cloudKeys, cliConnect)
// keeps its own read-modify-write helper; the read and the final write go
// through here.
//
// Three rules, because on Windows this same file is ALSO the CLI's
// settings.json (cli/noteflow.js applies 1 and 2 in readSettings/writeSettings)
// and both processes write it read-modify-write:
//
//  1. ATOMIC WRITES. The JSON goes to a temp file in the same dir, created
//     owner-only (0600), and is renamed over the target — a reader in another
//     process sees the old file or the new one, never a truncated one. Windows
//     may refuse the rename for a moment (EPERM/EBUSY/EACCES while another
//     process or an antivirus holds the file): retried briefly, then written in
//     place as before (still better than losing the change). The temp file is
//     removed on any failure.
//
//  2. NEVER WRITE A FAKE `{}`. A missing file is `{}` (first run). A file that
//     EXISTS but can't be read or parsed is retried a few times (a writer from
//     before (1) may have it half-written for a moment); if it is still
//     unreadable, readSettingsFile still answers `{}` so plain readers keep
//     working with defaults — but that object is MARKED, and writeSettingsFile
//     refuses to save it (or anything spread from it: `{ ...settings, key }`
//     copies the marker). Saving it would wipe every other key of the file —
//     that is how agentTasks, ai, aiLlm, language… used to vanish.
//
//  3. RECOVERY OF A CORRUPT FILE (the app; the CLI just refuses and exits 1).
//     Unreadable content that stayed the SAME through every retry (same bytes,
//     mtime and size — not a write in progress) is corrupt for good: it is
//     renamed aside to `settings.json.corrupt-<timestamp>` (same dir, owner-only)
//     and the file is then missing → `{}`, so the app starts clean and can save
//     again instead of refusing every write forever. If what the rename moved
//     turns out not to be that content (another process wrote a good file in
//     the window), it is linked back (never over a newer file) and the read
//     answers the marked `{}`. A symlinked settings.json is never moved. Content that changed
//     between attempts is transient: marked `{}`, writes refused, read again
//     next time. An unreadable verdict that is kept (a read error, a backup
//     that failed, recovery off) is cached by mtime + size, so the same broken
//     file does not pay the retries on every read (the sync IPCs of the theme
//     and the language block the renderer while main reads).
//
// POSIX: the file holds the GitHub PAT, the account refresh token and the
// cached DEK (safeStorage-encrypted, but base64-only when the OS keyring is
// unavailable), so it stays owner-only (0600). Windows is unaffected (the file
// inherits the profile's ACLs).

import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'

/** Marks the `{}` handed out for a settings.json that exists but can't be read. */
const UNREADABLE = Symbol.for('noteflow.settingsUnreadable')

/** Attempts and pause of a read that fails on an EXISTING file (≈ 100 ms worst case). */
export const SETTINGS_READ_ATTEMPTS = 5
export const SETTINGS_READ_RETRY_MS = 25
/** Attempts and pause of a rename refused by Windows. */
export const RENAME_ATTEMPTS = 6
const RENAME_RETRY_MS = 20

export class SettingsUnreadableError extends Error {
  constructor(filePath: string) {
    super(`${filePath} exists but can't be read or parsed; not overwriting it`)
    this.name = 'SettingsUnreadableError'
  }
}

function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export type SettingsReadOutcome =
  | { kind: 'ok'; data: Record<string, unknown> }
  | { kind: 'missing' }
  | { kind: 'unreadable' }

/**
 * Pure: what one read attempt means. `raw` is the file's text, or the read
 * error. Missing (ENOENT) is a normal empty file; any other read error, bad
 * JSON or a non-object (array, null, number…) is "unreadable".
 */
export function classifySettingsRead(raw: string | NodeJS.ErrnoException): SettingsReadOutcome {
  if (typeof raw !== 'string') return raw?.code === 'ENOENT' ? { kind: 'missing' } : { kind: 'unreadable' }
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { kind: 'ok', data: parsed as Record<string, unknown> }
      : { kind: 'unreadable' }
  } catch {
    return { kind: 'unreadable' }
  }
}

export interface FileStamp {
  mtimeMs: number
  size: number
}

export interface ReadAttempt {
  outcome: SettingsReadOutcome
  /** null when the file could not be stat'ed. */
  stamp: FileStamp | null
  /** The text read; null when the read itself failed. */
  raw: string | null
}

function stampOf(filePath: string): FileStamp | null {
  try {
    const st = fs.statSync(filePath)
    return { mtimeMs: st.mtimeMs, size: st.size }
  } catch {
    return null
  }
}

const sameStamp = (a: FileStamp | null, b: FileStamp | null): boolean =>
  a !== null && b !== null && a.mtimeMs === b.mtimeMs && a.size === b.size

function attemptRead(filePath: string): ReadAttempt {
  const stamp = stampOf(filePath)
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    return { outcome: classifySettingsRead(err as NodeJS.ErrnoException), stamp, raw: null }
  }
  return { outcome: classifySettingsRead(raw), stamp, raw }
}

/**
 * Pure: unreadable attempts that all saw the very same content — the same
 * bytes, mtime and size each time. That is a corrupt file at rest, not a write
 * in progress (nor a read error: those prove nothing about the content).
 */
export function isStableUnreadable(attempts: readonly ReadAttempt[]): boolean {
  if (attempts.length === 0) return false
  const [first] = attempts
  return attempts.every((a) =>
    a.outcome.kind === 'unreadable' && a.raw !== null && a.raw === first.raw && sameStamp(a.stamp, first.stamp))
}

/** The read with its retries: every attempt made, the last one deciding. */
function readWithRetries(filePath: string, attempts: number, retryMs: number): ReadAttempt[] {
  const seen = [attemptRead(filePath)]
  while (seen.length < attempts && seen[seen.length - 1].outcome.kind === 'unreadable') {
    pause(retryMs)
    seen.push(attemptRead(filePath))
  }
  return seen
}

/** The read with its retries: 'unreadable' only when it failed every attempt. */
export function readSettingsOutcome(
  filePath: string,
  attempts = SETTINGS_READ_ATTEMPTS,
  retryMs = SETTINGS_READ_RETRY_MS,
): SettingsReadOutcome {
  const seen = readWithRetries(filePath, attempts, retryMs)
  return seen[seen.length - 1].outcome
}

/** Was this object (or the one it was spread from) handed out for an unreadable settings.json? */
export function isUnreadableSettings(data: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(data, UNREADABLE)
}

/** Enumerable so `{ ...settings }` / Object.assign carry it; JSON.stringify ignores symbols. */
const markedEmpty = (): Record<string, unknown> => ({ [UNREADABLE]: true }) as Record<string, unknown>

/** The unreadable verdicts kept, by path: the stamp of the file each was given for. */
const unreadableVerdicts = new Map<string, FileStamp>()

/** Test hook: forgets the cached unreadable verdicts. */
export function resetSettingsReadCacheForTests(): void {
  unreadableVerdicts.clear()
}

/** `settings.json.corrupt-2026-11-21T10-00-00-000Z` (`:` is not valid in a Windows name). */
export function corruptBackupPath(filePath: string, now: Date): string {
  return `${filePath}.corrupt-${now.toISOString().replace(/[:.]/g, '-')}`
}

type BackupResult =
  | { kind: 'moved'; backup: string }
  /** Not moved: a symlink, changed meanwhile, or the rename failed. */
  | { kind: 'kept' }
  /** Another process wrote a good file in the window: what was moved went back (or stayed as backup). */
  | { kind: 'raced' }

/** Moves a corrupt settings.json aside (only the exact content judged corrupt). */
function backUpCorrupt(filePath: string, judged: FileStamp | null, judgedRaw: string): BackupResult {
  // A symlink is left alone: moving the link would not move the file it points to.
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) return { kind: 'kept' }
  } catch {
    return { kind: 'kept' }
  }
  // A writer may have replaced it since the last attempt: that is not the file judged corrupt.
  if (!sameStamp(stampOf(filePath), judged)) return { kind: 'kept' }
  const backup = corruptBackupPath(filePath, new Date())
  try {
    fs.renameSync(filePath, backup)
  } catch (err) {
    console.error(`[Settings] could not move the corrupt ${filePath} aside:`, String(err))
    return { kind: 'kept' }
  }
  // Still a window between the check and the rename: if what was moved is not
  // the content judged corrupt, another process had just written it — put it
  // back. linkSync never overwrites: if a newer settings.json exists, the moved
  // one stays as the backup.
  let moved: string | null = null
  try {
    moved = fs.readFileSync(backup, 'utf-8')
  } catch {
    // Unreadable now: judged as before (left as the backup).
  }
  if (moved !== null && (moved !== judgedRaw || classifySettingsRead(moved).kind === 'ok')) {
    try {
      fs.linkSync(backup, filePath)
      fs.unlinkSync(backup)
      console.error(`[Settings] ${filePath} was rewritten while being moved aside; restored it`)
    } catch (err) {
      console.error(`[Settings] ${filePath} was rewritten while being moved aside; it stays at ${backup}:`, String(err))
    }
    return { kind: 'raced' }
  }
  restrictPerms(backup) // a rename keeps the mode; a legacy 0644 one is tightened
  return { kind: 'moved', backup }
}

export interface ReadSettingsOptions {
  /** Move a corrupt file (stable unreadable content) aside and start fresh. Default true (the app). */
  recoverCorrupt?: boolean
}

/**
 * settings.json parsed. Missing → `{}`. Exists but unreadable after the
 * retries → corrupt for good and moved aside (a plain `{}`, saveable), or — a
 * write in progress, a read error, recovery off or failed — a MARKED `{}`:
 * fine to read defaults from, refused by writeSettingsFile (see the header).
 */
export function readSettingsFile(filePath: string, options: ReadSettingsOptions = {}): Record<string, unknown> {
  const cached = unreadableVerdicts.get(filePath)
  if (cached) {
    if (sameStamp(stampOf(filePath), cached)) return markedEmpty()
    unreadableVerdicts.delete(filePath)
  }
  const seen = readWithRetries(filePath, SETTINGS_READ_ATTEMPTS, SETTINGS_READ_RETRY_MS)
  const last = seen[seen.length - 1]
  if (last.outcome.kind === 'ok') return last.outcome.data
  if (last.outcome.kind === 'missing') return {}
  const stable = isStableUnreadable(seen)
  if (stable && options.recoverCorrupt !== false) {
    const result = backUpCorrupt(filePath, last.stamp, last.raw as string) // stable → raw read every time
    if (result.kind === 'moved') {
      console.error(`[Settings] ${filePath} was corrupt — moved to ${result.backup}; starting with fresh settings`)
      return {}
    }
    // Lost a race with a writer: this read must not feed a write; not cached, the next one reads the file.
    if (result.kind === 'raced') return markedEmpty()
  }
  // Content that changed between attempts (a write in progress) is read again
  // next time; any other verdict holds until the file changes.
  if (stable || last.raw === null) {
    const stamp = stampOf(filePath)
    if (stamp) unreadableVerdicts.set(filePath, stamp)
  }
  console.error(`[Settings] ${filePath} can't be read or parsed — using defaults, nothing will be saved over it`)
  return markedEmpty()
}

function restrictPerms(filePath: string): void {
  if (process.platform === 'win32') return
  try {
    if (fs.statSync(filePath).mode & 0o077) fs.chmodSync(filePath, 0o600)
  } catch {
    // Missing file (first write), a filesystem without POSIX modes, or a file
    // owned by someone else — never fail the write over it.
  }
}

const isTransientRenameError = (err: unknown): boolean =>
  ['EPERM', 'EBUSY', 'EACCES'].includes((err as NodeJS.ErrnoException)?.code ?? '')

/**
 * Writes `content` to `filePath` atomically (temp file in the same dir +
 * rename), the temp created owner-only (0600). A symlinked target is written
 * through (its real path is replaced, the link kept). Windows: a rename refused
 * for a moment is retried, then the content is written in place.
 */
export function writeFileAtomicSync(filePath: string, content: string): void {
  let target = filePath
  try {
    target = fs.realpathSync(filePath)
  } catch {
    // Missing (first write): write to the path as given.
  }
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf-8', mode: 0o600, flag: 'wx' })
    restrictPerms(tmp) // a umask can't widen 0600, but a filesystem default might
    for (let attempt = 1; ; attempt++) {
      try {
        fs.renameSync(tmp, target)
        return
      } catch (err) {
        if (process.platform !== 'win32' || !isTransientRenameError(err)) throw err
        if (attempt >= RENAME_ATTEMPTS) break
        pause(RENAME_RETRY_MS)
      }
    }
    // Windows kept the target locked: in place, as before atomic writes.
    restrictPerms(target)
    fs.writeFileSync(target, content, { encoding: 'utf-8', mode: 0o600 })
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // Already renamed away (the normal case), or never created.
    }
  }
}

/**
 * Saves settings.json (owner-only, atomic). Throws SettingsUnreadableError —
 * writing nothing — when `data` comes from a settings.json that couldn't be
 * read (see the header): saving it would wipe the file's other keys.
 */
export function writeSettingsFile(filePath: string, data: Record<string, unknown>): void {
  if (isUnreadableSettings(data)) throw new SettingsUnreadableError(filePath)
  writeFileAtomicSync(filePath, JSON.stringify(data))
}
