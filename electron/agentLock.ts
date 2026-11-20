// Agent tasks — the lock between processes and the atomic write, on the app's
// side. The CLI (`noteflow task …`, the heartbeat of `noteflow run`) and this
// app write the same files of a note folder (agent.md above all); every one of
// them takes the SAME lock around read → modify → write, and replaces the file
// in one step. The contract is the CLI's (cli/noteflow.js, "the lock between
// processes"), kept identical here:
//
//   file     <CLI settings dir>/agent-locks/<encodeURIComponent(note folder)>.lock
//            The CLI's settings dir, NOT this app's userData: `%APPDATA%\noteflow`
//            on Windows, `$XDG_CONFIG_HOME/noteflow` or `~/.config/noteflow`
//            elsewhere (macOS too) — also under `npm run dev`, whose userData is
//            another folder. Outside the notes dir: nothing syncs or watches it.
//   taken    by creating it exclusively ('wx'); one JSON line { pid, host, at, token }
//   stale    `at` older than 60 s (the file's mtime while the JSON is not there
//            yet), or — same host — no process with that pid. Removed only if its
//            content is still the one that was judged, then tried again.
//   busy     retried every 25 ms. The CLI waits up to 10 s; the app a short
//            while (AGENT_LOCK_APP_WAIT_MS) and WITHOUT blocking the main
//            process: the wait is asynchronous, only the critical section is not.
//   released by deleting the file, only while it still holds our token.
//
// Everything is injected (AgentLockEnv), so the rules are tested with a fake
// disk and, against the CLI's own functions, with the real one
// (tests/electron/agentLock.test.ts). Docs: .agents/context/patterns.md § CLI
// "Lock entre procesos + escritura atómica".

import path from 'path'
import { cliSettingsPath } from './cliConnectLogic'

export const AGENT_LOCK_STALE_MS = 60_000
export const AGENT_LOCK_RETRY_MS = 25
/** How long the app waits for a busy lock before giving up (a recoverable error). */
export const AGENT_LOCK_APP_WAIT_MS = 2000

/** The disk a lock needs. Errors carry Node's `code` (EEXIST is the one that matters). */
export interface AgentLockIo {
  mkdirp(dir: string): void
  /** Creates `file` holding `text`; throws (code EEXIST) when it already exists. */
  createExclusive(file: string, text: string): void
  readText(file: string): string
  mtimeMs(file: string): number
  unlink(file: string): void
}

export interface AgentLockEnv {
  io: AgentLockIo
  /** `<CLI settings dir>/agent-locks` (agentLockDirFor). */
  lockDir: string
  pid: number
  host: string
  now(): number
  newToken(): string
  /** Is there a process with this pid on this machine? (EPERM counts as alive.) */
  pidAlive(pid: number): boolean
}

export interface AgentLockHandle {
  file: string
  token: string
}

export type AgentLockAttempt =
  | { status: 'taken'; lock: AgentLockHandle }
  /** Somebody holds it. `clearedStale`: its holder was gone and the file was removed — try again now. */
  | { status: 'busy'; clearedStale: boolean }
  /** The lock folder cannot be created: nobody holds anything, waiting will not help. */
  | { status: 'unavailable'; error: string }

/** Where the CLI keeps its locks on this machine — the same folder for the app, whatever its userData. */
export function agentLockDirFor(platform: NodeJS.Platform, env: Record<string, string | undefined>, home: string): string {
  const p = platform === 'win32' ? path.win32 : path.posix
  return p.join(p.dirname(cliSettingsPath(platform, env, home)), 'agent-locks')
}

/** The lock file of a note folder (`dirname` = the folder's name). */
export function agentLockPath(lockDir: string, dirname: string): string {
  return path.join(lockDir, `${encodeURIComponent(dirname)}.lock`)
}

/** The text of a lock whose holder is gone, else null (also for a lock that is no longer there). */
function staleLockText(env: AgentLockEnv, file: string): string | null {
  let raw: string
  let mtimeMs: number
  try {
    raw = env.io.readText(file)
    mtimeMs = env.io.mtimeMs(file)
  } catch {
    return null
  }
  let info: { pid?: unknown; host?: unknown; at?: unknown } | null = null
  try {
    const parsed: unknown = JSON.parse(raw)
    info = parsed && typeof parsed === 'object' ? parsed as { pid?: unknown; host?: unknown; at?: unknown } : null
  } catch {
    info = null // just created, not written yet: judged by its age
  }
  const at = info && typeof info.at === 'string' ? Date.parse(info.at) : NaN
  if (env.now() - (Number.isFinite(at) ? at : mtimeMs) > AGENT_LOCK_STALE_MS) return raw
  if (info && info.host === env.host && Number.isInteger(info.pid) && !env.pidAlive(info.pid as number)) return raw
  return null
}

/** ONE attempt at the lock of a note folder. Never waits, never throws. */
export function tryAgentLock(env: AgentLockEnv, dirname: string): AgentLockAttempt {
  const file = agentLockPath(env.lockDir, dirname)
  try {
    env.io.mkdirp(env.lockDir)
  } catch (err) {
    return { status: 'unavailable', error: err instanceof Error ? err.message : String(err) }
  }
  const token = env.newToken()
  try {
    env.io.createExclusive(file, JSON.stringify({ pid: env.pid, host: env.host, at: new Date(env.now()).toISOString(), token }))
    return { status: 'taken', lock: { file, token } }
  } catch (err) {
    // Anything but "it exists" (EPERM on Windows while its holder deletes it…): busy, nothing to judge.
    if ((err as NodeJS.ErrnoException | null)?.code !== 'EEXIST') return { status: 'busy', clearedStale: false }
  }
  const stale = staleLockText(env, file)
  if (stale === null) return { status: 'busy', clearedStale: false }
  // Removed only if it is still that very lock: another process may have taken it over meanwhile.
  let cleared = false
  try {
    if (env.io.readText(file) === stale) {
      env.io.unlink(file)
      cleared = true
    }
  } catch {
    // gone already, or not ours to remove
  }
  return { status: 'busy', clearedStale: cleared }
}

/** Lets go of a lock — only while the file still holds our token (taken over as stale: not ours to delete). */
export function releaseAgentLock(env: AgentLockEnv, lock: AgentLockHandle): void {
  try {
    const info: unknown = JSON.parse(env.io.readText(lock.file))
    if (info && typeof info === 'object' && (info as { token?: unknown }).token === lock.token) env.io.unlink(lock.file)
  } catch {
    // gone, or somebody else's by now
  }
}

export type AgentLockResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'busy' | 'unavailable'; detail?: string }

/**
 * Runs `work` holding the lock of note folder `dirname`. `work` is SYNCHRONOUS
 * (read → change → write, nothing awaited under the lock); the wait for a busy
 * lock is not: it yields to the event loop between attempts (`sleep`), for at
 * most `waitMs`. A lock that stays busy — or a lock folder that cannot be
 * created — is an answer, not an exception: nothing ran, the caller may retry.
 * Whatever `work` throws is rethrown after the lock is released.
 */
export async function withAgentLock<T>(
  env: AgentLockEnv,
  dirname: string,
  work: () => T,
  opts: { sleep: (ms: number) => Promise<void>; waitMs?: number },
): Promise<AgentLockResult<T>> {
  const deadline = env.now() + (opts.waitMs ?? AGENT_LOCK_APP_WAIT_MS)
  for (;;) {
    const attempt = tryAgentLock(env, dirname)
    if (attempt.status === 'taken') {
      try {
        return { ok: true, value: work() }
      } finally {
        releaseAgentLock(env, attempt.lock)
      }
    }
    if (attempt.status === 'unavailable') return { ok: false, reason: 'unavailable', detail: attempt.error }
    if (env.now() >= deadline) return { ok: false, reason: 'busy' }
    // A stale lock just removed: take it now, without the pause.
    if (!attempt.clearedStale) await opts.sleep(AGENT_LOCK_RETRY_MS)
  }
}

// Atomic write ─ same shape as the CLI's writeFileAtomic.

export interface AtomicWriteIo {
  writeText(file: string, text: string): void
  rename(from: string, to: string): void
  unlink(file: string): void
  /** A short SYNCHRONOUS pause between two attempts at the rename. */
  pause(ms: number): void
}

/** Attempts at the rename while a reader holds the file open (Windows): ~8 × 15 ms, then the error. */
export const ATOMIC_RENAME_ATTEMPTS = 8
export const ATOMIC_RENAME_PAUSE_MS = 15
const RENAME_RETRY_CODES = ['EPERM', 'EBUSY', 'EACCES']

/** The temp file of an atomic write of `file`: a dot-name ending in .tmp, in the same folder — never a '*.md'. */
export function atomicTempPath(file: string, pid: number, rand: string): string {
  return path.join(path.dirname(file), `.${path.basename(file)}.${pid}.${rand}.tmp`)
}

/**
 * Replaces `file` with `text` in one step: written next to it and renamed over
 * it, so a reader (the CLI, a sync) sees the old file or the new one, never an
 * empty or half-written one. No enumerator of a note folder's '*.md' takes the
 * temp file for a section. On Windows the rename is retried — briefly: this
 * runs in the main process — while a reader holds the file open; then it
 * throws, with the temp file removed.
 */
export function writeFileAtomic(io: AtomicWriteIo, file: string, text: string, pid: number, rand: string): void {
  const tmp = atomicTempPath(file, pid, rand)
  io.writeText(tmp, text)
  for (let attempt = 1; ; attempt++) {
    try {
      io.rename(tmp, file)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | null)?.code ?? ''
      if (attempt >= ATOMIC_RENAME_ATTEMPTS || !RENAME_RETRY_CODES.includes(code)) {
        try {
          io.unlink(tmp)
        } catch {
          // nothing to clean
        }
        throw err
      }
      io.pause(ATOMIC_RENAME_PAUSE_MS)
    }
  }
}
