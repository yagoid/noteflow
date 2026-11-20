// The lock between processes and the atomic write, on the app's side
// (electron/agentLock.ts): the rules against a fake disk and a fake clock, and
// — against the REAL disk, in a throwaway settings dir — that the app and the
// CLI (cli/noteflow.js) keep each other out with the very same lock file.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AGENT_LOCK_RETRY_MS,
  AGENT_LOCK_STALE_MS,
  ATOMIC_RENAME_ATTEMPTS,
  agentLockDirFor,
  agentLockPath,
  atomicTempPath,
  releaseAgentLock,
  tryAgentLock,
  withAgentLock,
  writeFileAtomic,
  type AgentLockEnv,
  type AtomicWriteIo,
} from '../../electron/agentLock'
import { assertInsideTmp } from '../helpers/tmpGuard'

const T0 = Date.parse('2026-11-20T12:00:00.000Z')

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

/** An in-memory disk + clock: `sleep` moves the clock, nothing really waits. */
function fakeEnv(over: Partial<AgentLockEnv> = {}) {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  const clock = { now: T0 }
  const alive = new Set<number>([100])
  let tokens = 0
  const env: AgentLockEnv = {
    io: {
      mkdirp: () => undefined,
      createExclusive(file, text) {
        if (files.has(file)) throw errno('EEXIST')
        files.set(file, { text, mtimeMs: clock.now })
      },
      readText(file) {
        const f = files.get(file)
        if (!f) throw errno('ENOENT')
        return f.text
      },
      mtimeMs(file) {
        const f = files.get(file)
        if (!f) throw errno('ENOENT')
        return f.mtimeMs
      },
      unlink(file) {
        if (!files.delete(file)) throw errno('ENOENT')
      },
    },
    lockDir: path.join('cfg', 'agent-locks'),
    pid: 100,
    host: 'this-host',
    now: () => clock.now,
    newToken: () => `token-${++tokens}`,
    pidAlive: (pid) => alive.has(pid),
    ...over,
  }
  const sleeps: number[] = []
  const sleep = async (ms: number) => {
    sleeps.push(ms)
    clock.now += ms
  }
  const file = (dir: string) => agentLockPath(env.lockDir, dir)
  const hold = (dir: string, info: Record<string, unknown>) =>
    files.set(file(dir), { text: JSON.stringify({ host: 'this-host', token: 'theirs', ...info }), mtimeMs: clock.now })
  return { env, files, clock, alive, sleep, sleeps, file, hold }
}

describe('where the lock lives', () => {
  it("is the CLI's settings dir, not the app's userData — on every platform", () => {
    expect(agentLockDirFor('win32', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'C:\\Users\\me'))
      .toBe('C:\\Users\\me\\AppData\\Roaming\\noteflow\\agent-locks')
    expect(agentLockDirFor('win32', {}, 'C:\\Users\\me')).toBe('C:\\Users\\me\\AppData\\Roaming\\noteflow\\agent-locks')
    expect(agentLockDirFor('linux', { XDG_CONFIG_HOME: '/cfg' }, '/home/me')).toBe('/cfg/noteflow/agent-locks')
    expect(agentLockDirFor('linux', {}, '/home/me')).toBe('/home/me/.config/noteflow/agent-locks')
    // macOS too: ~/.config, never ~/Library/Application Support.
    expect(agentLockDirFor('darwin', {}, '/Users/me')).toBe('/Users/me/.config/noteflow/agent-locks')
  })

  it('one file per note folder, its name URL-encoded', () => {
    expect(path.basename(agentLockPath('locks', 'plan-abc12345'))).toBe('plan-abc12345.lock')
    expect(path.basename(agentLockPath('locks', 'año nuevo-x1'))).toBe('a%C3%B1o%20nuevo-x1.lock')
  })
})

describe('tryAgentLock / releaseAgentLock', () => {
  it('takes a free lock: one JSON line { pid, host, at, token }', () => {
    const { env, files, file } = fakeEnv()
    const got = tryAgentLock(env, 'note-1')
    expect(got).toEqual({ status: 'taken', lock: { file: file('note-1'), token: 'token-1' } })
    expect(JSON.parse(files.get(file('note-1'))!.text)).toEqual({ pid: 100, host: 'this-host', at: new Date(T0).toISOString(), token: 'token-1' })
  })

  it('a live holder keeps it: busy, and the file is not touched', () => {
    const { env, files, file, hold, alive } = fakeEnv()
    alive.add(7)
    hold('note-1', { pid: 7, at: new Date(T0 - 1000).toISOString() })
    const before = files.get(file('note-1'))!.text
    expect(tryAgentLock(env, 'note-1')).toEqual({ status: 'busy', clearedStale: false })
    expect(files.get(file('note-1'))!.text).toBe(before)
  })

  it('stale by age (60 s), whoever holds it — and by a dead pid on this host only', () => {
    const a = fakeEnv()
    a.alive.add(7)
    a.hold('n', { pid: 7, at: new Date(T0 - AGENT_LOCK_STALE_MS - 1).toISOString() })
    expect(tryAgentLock(a.env, 'n')).toEqual({ status: 'busy', clearedStale: true })
    expect(a.files.has(a.file('n'))).toBe(false)

    const b = fakeEnv()
    b.hold('n', { pid: 999, at: new Date(T0).toISOString() }) // nobody has pid 999 here
    expect(tryAgentLock(b.env, 'n')).toEqual({ status: 'busy', clearedStale: true })

    const c = fakeEnv()
    c.hold('n', { pid: 999, host: 'another-machine', at: new Date(T0).toISOString() }) // cannot know: not stale
    expect(tryAgentLock(c.env, 'n')).toEqual({ status: 'busy', clearedStale: false })
    expect(c.files.has(c.file('n'))).toBe(true)
  })

  it('a lock whose JSON is not written yet is judged by the age of the file', () => {
    const { env, files, file, clock } = fakeEnv()
    files.set(file('n'), { text: '', mtimeMs: T0 })
    expect(tryAgentLock(env, 'n')).toEqual({ status: 'busy', clearedStale: false })
    clock.now = T0 + AGENT_LOCK_STALE_MS + 1
    expect(tryAgentLock(env, 'n')).toEqual({ status: 'busy', clearedStale: true })
  })

  it('a stale lock is only removed if it is still the one that was judged', () => {
    const { env, files, file, hold } = fakeEnv()
    hold('n', { pid: 999, at: new Date(T0).toISOString() })
    // Somebody takes it over between the judgement and the removal.
    const readText = env.io.readText
    let reads = 0
    env.io.readText = (f) => {
      const text = readText(f)
      if (++reads === 1) files.set(f, { text: JSON.stringify({ pid: 100, host: 'this-host', at: new Date(T0).toISOString(), token: 'new-holder' }), mtimeMs: T0 })
      return text
    }
    expect(tryAgentLock(env, 'n')).toEqual({ status: 'busy', clearedStale: false })
    expect(JSON.parse(files.get(file('n'))!.text).token).toBe('new-holder')
  })

  it('a lock folder that cannot be created is "unavailable", not "busy"', () => {
    const { env } = fakeEnv()
    env.io.mkdirp = () => { throw errno('EACCES') }
    expect(tryAgentLock(env, 'n')).toMatchObject({ status: 'unavailable' })
  })

  it('an error that is not "it exists" (Windows, while the holder deletes it) is busy', () => {
    const { env } = fakeEnv()
    env.io.createExclusive = () => { throw errno('EPERM') }
    expect(tryAgentLock(env, 'n')).toEqual({ status: 'busy', clearedStale: false })
  })

  it('release deletes the file only while it holds our token', () => {
    const { env, files, file } = fakeEnv()
    const got = tryAgentLock(env, 'n')
    if (got.status !== 'taken') throw new Error('not taken')
    // Taken over as stale by somebody else meanwhile.
    files.set(file('n'), { text: JSON.stringify({ pid: 5, host: 'x', at: '', token: 'theirs' }), mtimeMs: T0 })
    releaseAgentLock(env, got.lock)
    expect(files.has(file('n'))).toBe(true)
    files.set(file('n'), { text: JSON.stringify({ pid: 100, host: 'this-host', at: '', token: got.lock.token }), mtimeMs: T0 })
    releaseAgentLock(env, got.lock)
    expect(files.has(file('n'))).toBe(false)
    releaseAgentLock(env, got.lock) // already gone: nothing happens
  })
})

describe('withAgentLock', () => {
  it('runs the work under the lock and lets go — also when the work throws', async () => {
    const { env, files, file, sleep } = fakeEnv()
    let held = false
    const res = await withAgentLock(env, 'n', () => { held = files.has(file('n')); return 42 }, { sleep })
    expect(res).toEqual({ ok: true, value: 42 })
    expect(held).toBe(true)
    expect(files.has(file('n'))).toBe(false)
    await expect(withAgentLock(env, 'n', () => { throw new Error('boom') }, { sleep })).rejects.toThrow('boom')
    expect(files.has(file('n'))).toBe(false)
  })

  it('a busy lock: retried every 25 ms, never past the wait — then a recoverable answer and the work did not run', async () => {
    const { env, hold, alive, sleep, sleeps, files, file } = fakeEnv()
    alive.add(7)
    hold('n', { pid: 7, at: new Date(T0 + 10 * 60_000).toISOString() }) // never stale within the wait
    let ran = false
    const res = await withAgentLock(env, 'n', () => { ran = true }, { sleep, waitMs: 200 })
    expect(res).toEqual({ ok: false, reason: 'busy' })
    expect(ran).toBe(false)
    expect(sleeps.every((ms) => ms === AGENT_LOCK_RETRY_MS)).toBe(true)
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(200)
    expect(JSON.parse(files.get(file('n'))!.text).token).toBe('theirs') // not ours to remove
  })

  it('gets the lock as soon as its holder lets go', async () => {
    const { env, hold, alive, files, file, sleeps } = fakeEnv()
    alive.add(7)
    hold('n', { pid: 7, at: new Date(T0).toISOString() })
    let waits = 0
    const sleep = async (ms: number) => {
      sleeps.push(ms)
      if (++waits === 3) files.delete(file('n'))
    }
    expect(await withAgentLock(env, 'n', () => 'done', { sleep })).toEqual({ ok: true, value: 'done' })
    expect(waits).toBe(3)
  })

  it('a stale lock is taken over at once, without a pause', async () => {
    const { env, hold, sleep, sleeps } = fakeEnv()
    hold('n', { pid: 999, at: new Date(T0).toISOString() })
    expect(await withAgentLock(env, 'n', () => 'mine', { sleep })).toEqual({ ok: true, value: 'mine' })
    expect(sleeps).toEqual([])
  })

  it('a lock folder that cannot be created: answered at once, nothing ran', async () => {
    const { env, sleep, sleeps } = fakeEnv()
    env.io.mkdirp = () => { throw errno('EACCES') }
    expect(await withAgentLock(env, 'n', () => 1, { sleep })).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(sleeps).toEqual([])
  })
})

describe('writeFileAtomic', () => {
  function fakeIo(renameErrors: string[] = []) {
    const log: string[] = []
    const io: AtomicWriteIo = {
      writeText: (file, text) => { log.push(`write ${path.basename(file)} ${text}`) },
      rename: (from, to) => {
        const code = renameErrors.shift()
        if (code) throw errno(code)
        log.push(`rename ${path.basename(from)} -> ${path.basename(to)}`)
      },
      unlink: (file) => { log.push(`unlink ${path.basename(file)}`) },
      pause: (ms) => { log.push(`pause ${ms}`) },
    }
    return { io, log }
  }

  it('writes a temp file next to the target — a dot-name that is no .md — and renames it over', () => {
    const { io, log } = fakeIo()
    const target = path.join('notes', 'plan-x1', 'agent.md')
    writeFileAtomic(io, target, 'TEXT', 4321, 'ab12cd34')
    expect(log).toEqual(['write .agent.md.4321.ab12cd34.tmp TEXT', 'rename .agent.md.4321.ab12cd34.tmp -> agent.md'])
    expect(path.dirname(atomicTempPath(target, 1, 'x'))).toBe(path.dirname(target))
    expect(atomicTempPath(target, 1, 'x').endsWith('.md')).toBe(false)
  })

  it('a reader holding the file (Windows): the rename is retried a few times, briefly', () => {
    const { io, log } = fakeIo(['EPERM', 'EBUSY'])
    writeFileAtomic(io, 'agent.md', 'T', 1, 'r')
    expect(log.filter((l) => l.startsWith('pause'))).toHaveLength(2)
    expect(log[log.length - 1]).toBe('rename .agent.md.1.r.tmp -> agent.md')
  })

  it('gives up with the error, the temp file removed — after the attempts, or at once for another error', () => {
    const stuck = fakeIo(Array(ATOMIC_RENAME_ATTEMPTS).fill('EBUSY'))
    expect(() => writeFileAtomic(stuck.io, 'agent.md', 'T', 1, 'r')).toThrow('EBUSY')
    expect(stuck.log.filter((l) => l.startsWith('pause'))).toHaveLength(ATOMIC_RENAME_ATTEMPTS - 1)
    expect(stuck.log[stuck.log.length - 1]).toBe('unlink .agent.md.1.r.tmp')
    const other = fakeIo(['ENOSPC'])
    expect(() => writeFileAtomic(other.io, 'agent.md', 'T', 1, 'r')).toThrow('ENOSPC')
    expect(other.log).toEqual(['write .agent.md.1.r.tmp T', 'unlink .agent.md.1.r.tmp'])
  })
})

// ── Against the CLI, on the real disk ────────────────────────────────────────

describe('interoperability with the CLI (the same lock file, both ways)', () => {
  type Cli = {
    agentLockPath: (dirname: string) => string
    withAgentTaskLock: <T>(dirnames: string[], fn: () => T, opts?: { wait?: number; optional?: boolean; busy?: T }) => T
  }
  let tmp: string
  let cli: Cli
  let env: AgentLockEnv
  const saved = { APPDATA: process.env.APPDATA, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME }
  const DIR = 'plan año-abc12345'

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-app-lock-'))
    // The CLI works out its settings dir when it loads: point it at the throwaway one first.
    process.env.APPDATA = path.join(tmp, 'config')
    process.env.XDG_CONFIG_HOME = path.join(tmp, 'config')
    const require = createRequire(import.meta.url)
    const file = require.resolve('../../cli/noteflow.js')
    delete require.cache[file]
    cli = require(file) as Cli
    const lockDir = agentLockDirFor(process.platform, process.env, os.homedir())
    assertInsideTmp(lockDir, tmp)
    env = {
      io: {
        mkdirp: (dir) => { fs.mkdirSync(dir, { recursive: true }) },
        createExclusive: (f, text) => fs.writeFileSync(f, text, { encoding: 'utf-8', flag: 'wx' }),
        readText: (f) => fs.readFileSync(f, 'utf-8'),
        mtimeMs: (f) => fs.statSync(f).mtimeMs,
        unlink: (f) => fs.unlinkSync(f),
      },
      lockDir,
      pid: process.pid,
      host: os.hostname(),
      now: () => Date.now(),
      newToken: () => randomBytes(8).toString('hex'),
      pidAlive(pid) {
        try {
          process.kill(pid, 0)
          return true
        } catch (err) {
          return (err as NodeJS.ErrnoException).code === 'EPERM'
        }
      },
    }
  })

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(assertInsideTmp(path.join(tmp, 'config'), tmp), { recursive: true, force: true })
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('both name the same file for a note folder', () => {
    expect(path.resolve(agentLockPath(env.lockDir, DIR))).toBe(path.resolve(cli.agentLockPath(DIR)))
  })

  it("the CLI holds it: the app is kept out (busy, and the CLI's lock stays); released: the app takes it", () => {
    let seen: ReturnType<typeof tryAgentLock> | null = null
    let holder: { pid: number; host: string; at: string; token: string } | null = null
    cli.withAgentTaskLock([DIR], () => {
      seen = tryAgentLock(env, DIR)
      holder = JSON.parse(fs.readFileSync(cli.agentLockPath(DIR), 'utf-8'))
    })
    expect(seen).toEqual({ status: 'busy', clearedStale: false })
    expect(holder).toMatchObject({ pid: process.pid, host: os.hostname() })
    expect(Number.isFinite(Date.parse(holder!.at))).toBe(true)
    expect(holder!.token).toMatch(/^[a-f0-9]{16}$/)
    const mine = tryAgentLock(env, DIR)
    expect(mine.status).toBe('taken')
    if (mine.status === 'taken') releaseAgentLock(env, mine.lock)
    expect(fs.existsSync(cli.agentLockPath(DIR))).toBe(false)
  })

  it('the app holds it: the CLI is kept out (its heartbeat skips, a command fails without running); released: the CLI runs', () => {
    const mine = tryAgentLock(env, DIR)
    if (mine.status !== 'taken') throw new Error('the app could not take the lock')
    let ran = false
    expect(cli.withAgentTaskLock([DIR], () => { ran = true; return 'ran' }, { wait: 120, optional: true, busy: 'busy' })).toBe('busy')
    expect(() => cli.withAgentTaskLock([DIR], () => { ran = true }, { wait: 120 }))
      .toThrow(`Another noteflow command is writing the agent tasks of "${DIR}" (held by pid ${process.pid})`)
    expect(ran).toBe(false)
    expect(JSON.parse(fs.readFileSync(mine.lock.file, 'utf-8')).token).toBe(mine.lock.token) // the CLI did not remove ours
    releaseAgentLock(env, mine.lock)
    expect(cli.withAgentTaskLock([DIR], () => 'ran', { wait: 120 })).toBe('ran')
    expect(fs.existsSync(mine.lock.file)).toBe(false)
  })

  it("a lock in the CLI's format whose holder died is taken over by the app; one in the app's format, by the CLI", async () => {
    const file = cli.agentLockPath(DIR)
    const dead = spawnSync(process.execPath, ['-e', '']).pid! // a process that has already exited
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ pid: dead, host: os.hostname(), at: new Date().toISOString(), token: 'cli-token' }))
    const res = await withAgentLock(env, DIR, () => 'app', { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), waitMs: 500 })
    expect(res).toEqual({ ok: true, value: 'app' })
    // The app's own lock, left behind by an app that "died" (a pid nobody has).
    const ghost = tryAgentLock({ ...env, pid: dead }, DIR)
    expect(ghost.status).toBe('taken')
    expect(cli.withAgentTaskLock([DIR], () => 'cli', { wait: 500 })).toBe('cli')
    expect(fs.existsSync(file)).toBe(false)
  })
})
