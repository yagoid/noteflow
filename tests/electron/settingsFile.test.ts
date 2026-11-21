// settings.json (electron/settingsFile.ts) is shared on Windows by the app and
// the CLI, both read-modify-write. Two rules keep one from wiping the other's
// keys: writes are atomic (temp + rename, never a truncated file to read) and a
// file that exists but can't be read hands out a `{}` that can't be saved back.
// The CLI applies the same rules (driven here through `noteflow logout`). The
// app also recovers a file corrupt at rest (moved aside, fresh start).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  classifySettingsRead,
  isUnreadableSettings,
  readSettingsFile,
  readSettingsOutcome,
  RENAME_ATTEMPTS,
  resetSettingsReadCacheForTests,
  SETTINGS_READ_ATTEMPTS,
  SettingsUnreadableError,
  writeFileAtomicSync,
  writeSettingsFile,
} from '../../electron/settingsFile'
import { assertInsideTmp } from '../helpers/tmpGuard'

const require = createRequire(import.meta.url)
const CLI = require.resolve('../../cli/noteflow.js')
const isWindows = process.platform === 'win32'

let tmp: string
const file = () => assertInsideTmp(path.join(tmp, 'settings.json'), tmp)
const leftovers = () => fs.readdirSync(tmp).filter((n) => n.endsWith('.tmp'))

const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
const setPlatform = (value: NodeJS.Platform) => Object.defineProperty(process, 'platform', { ...realPlatform, value })

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-settings-'))
  resetSettingsReadCacheForTests()
})
afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(process, 'platform', realPlatform)
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('classifySettingsRead', () => {
  it('a missing file is an empty one; any other read error is unreadable', () => {
    expect(classifySettingsRead(Object.assign(new Error('x'), { code: 'ENOENT' }))).toEqual({ kind: 'missing' })
    expect(classifySettingsRead(Object.assign(new Error('x'), { code: 'EBUSY' }))).toEqual({ kind: 'unreadable' })
    expect(classifySettingsRead(Object.assign(new Error('x'), { code: 'EACCES' }))).toEqual({ kind: 'unreadable' })
  })

  it('only a JSON object is settings — truncated, empty, arrays and scalars are unreadable', () => {
    expect(classifySettingsRead('{"a":1}')).toEqual({ kind: 'ok', data: { a: 1 } })
    for (const raw of ['', '{"a":', '[]', 'null', '42', '"x"']) {
      expect(classifySettingsRead(raw), raw).toEqual({ kind: 'unreadable' })
    }
  })
})

describe('readSettingsFile / writeSettingsFile', () => {
  it('missing file: a plain {} that can be saved', () => {
    const settings = readSettingsFile(file())
    expect(settings).toEqual({})
    expect(isUnreadableSettings(settings)).toBe(false)
    writeSettingsFile(file(), { ...settings, language: 'es' })
    expect(JSON.parse(fs.readFileSync(file(), 'utf-8'))).toEqual({ language: 'es' })
  })

  it('an unreadable file is never saved over — neither the {} nor anything spread from it', () => {
    const halfWritten = '{"agentTasks":{"enabled":true},"language":'
    fs.writeFileSync(file(), halfWritten, 'utf-8')
    const settings = readSettingsFile(file(), { recoverCorrupt: false })
    expect(Object.keys(settings)).toEqual([]) // readers get defaults
    expect(isUnreadableSettings(settings)).toBe(true)
    expect(() => writeSettingsFile(file(), { ...settings, theme: 'dark' })).toThrow(SettingsUnreadableError)
    settings.theme = 'dark'
    expect(() => writeSettingsFile(file(), settings)).toThrow(SettingsUnreadableError)
    expect(fs.readFileSync(file(), 'utf-8')).toBe(halfWritten)
    expect(JSON.stringify({ ...settings })).toBe('{"theme":"dark"}') // the marker never reaches a file
  })

  it('retries an unreadable read the given number of times', () => {
    fs.writeFileSync(file(), 'nope', 'utf-8')
    const started = Date.now()
    expect(readSettingsOutcome(file(), 3, 10)).toEqual({ kind: 'unreadable' })
    expect(Date.now() - started).toBeGreaterThanOrEqual(15)
    fs.writeFileSync(file(), '{"a":1}', 'utf-8')
    expect(readSettingsOutcome(file(), 3, 10)).toEqual({ kind: 'ok', data: { a: 1 } })
  })

  it('a read-modify-write keeps every other key', () => {
    fs.writeFileSync(file(), JSON.stringify({ agentTasks: { enabled: true }, ai: { x: 1 }, language: 'es' }), 'utf-8')
    writeSettingsFile(file(), { ...readSettingsFile(file()), theme: 'dark' })
    expect(JSON.parse(fs.readFileSync(file(), 'utf-8'))).toEqual({ agentTasks: { enabled: true }, ai: { x: 1 }, language: 'es', theme: 'dark' })
  })
})

describe('a settings.json that stays unreadable', () => {
  const backups = () => fs.readdirSync(tmp).filter((n) => n.startsWith('settings.json.corrupt-'))
  /** Calls of readFileSync on settings.json (the retries are what a cached verdict saves). */
  const countReads = () => {
    const real = fs.readFileSync
    const spy = vi.spyOn(fs, 'readFileSync')
    let n = 0
    spy.mockImplementation(((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(p) === file()) n++
      return (real as (...a: unknown[]) => unknown)(p, ...rest)
    }) as never)
    return () => n
  }

  it('corrupt at rest: moved aside to settings.json.corrupt-<timestamp>, then fresh and saveable', () => {
    const corrupt = '{"agentTasks":{"enabled":true},"lang'
    fs.writeFileSync(file(), corrupt, 'utf-8')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const settings = readSettingsFile(file())
    expect(settings).toEqual({})
    expect(isUnreadableSettings(settings)).toBe(false)
    expect(fs.existsSync(file())).toBe(false)
    expect(backups()).toHaveLength(1)
    expect(backups()[0]).toMatch(/^settings\.json\.corrupt-\d{4}-\d\d-\d\dT[\d-]+Z$/)
    expect(fs.readFileSync(path.join(tmp, backups()[0]), 'utf-8')).toBe(corrupt) // nothing lost
    writeSettingsFile(file(), { ...settings, theme: 'dark' })
    expect(JSON.parse(fs.readFileSync(file(), 'utf-8'))).toEqual({ theme: 'dark' })
    expect(vi.mocked(console.error).mock.calls.some((c) => String(c[0]).includes(backups()[0]))).toBe(true)
  })

  /** renameSync of settings.json → backup that, like a writer racing it, finds `good` there instead. */
  const raceRename = (good: string, alsoRecreate = false) => {
    const real = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      real(from, to)
      if (String(from) === file()) {
        fs.writeFileSync(to, good, 'utf-8') // what was moved is the writer's good file
        if (alsoRecreate) fs.writeFileSync(file(), '{"newer":true}', 'utf-8') // and yet another one appeared
      }
    }) as never)
  }

  it('a good file written in the rename window is put back, and that read answers the marked {}', () => {
    fs.writeFileSync(file(), '{"broken":', 'utf-8')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    raceRename('{"agentTasks":{"enabled":true}}')
    const settings = readSettingsFile(file())
    expect(isUnreadableSettings(settings)).toBe(true) // can't feed a near-empty write
    expect(backups()).toEqual([])
    vi.mocked(fs.renameSync).mockRestore()
    expect(readSettingsFile(file())).toEqual({ agentTasks: { enabled: true } }) // not cached: the restored file
  })

  it('a restore never overwrites a newer settings.json: the moved file stays as the backup', () => {
    fs.writeFileSync(file(), '{"broken":', 'utf-8')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    raceRename('{"agentTasks":{"enabled":true}}', true)
    expect(isUnreadableSettings(readSettingsFile(file()))).toBe(true)
    expect(backups()).toHaveLength(1)
    expect(fs.readFileSync(path.join(tmp, backups()[0]), 'utf-8')).toBe('{"agentTasks":{"enabled":true}}')
    expect(JSON.parse(fs.readFileSync(file(), 'utf-8'))).toEqual({ newer: true })
  })

  it.skipIf(isWindows)('a symlinked settings.json is never moved aside', () => {
    const real = path.join(tmp, 'real.json')
    fs.writeFileSync(real, '{"broken":')
    fs.symlinkSync(real, file())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(isUnreadableSettings(readSettingsFile(file()))).toBe(true)
    expect(backups()).toEqual([])
    expect(fs.lstatSync(file()).isSymbolicLink()).toBe(true)
  })

  it('an empty file at rest is corrupt too', () => {
    fs.writeFileSync(file(), '', 'utf-8')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(isUnreadableSettings(readSettingsFile(file()))).toBe(false)
    expect(backups()).toHaveLength(1)
  })

  it('content that changes between attempts is a write in progress: no backup, marked, read again next time', () => {
    fs.writeFileSync(file(), '{"a":', 'utf-8')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const real = fs.readFileSync
    let n = 0
    vi.spyOn(fs, 'readFileSync').mockImplementation(((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(p) === file()) return `{"half":${n++}`
      return (real as (...a: unknown[]) => unknown)(p, ...rest)
    }) as never)
    expect(isUnreadableSettings(readSettingsFile(file()))).toBe(true)
    expect(n).toBe(SETTINGS_READ_ATTEMPTS)
    expect(backups()).toEqual([])
    expect(fs.existsSync(file())).toBe(true)
    readSettingsFile(file()) // not cached: retried in full
    expect(n).toBe(SETTINGS_READ_ATTEMPTS * 2)
  })

  it('a kept verdict is cached by mtime + size: no retries until the file changes', () => {
    fs.writeFileSync(file(), 'nope', 'utf-8')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reads = countReads()
    expect(isUnreadableSettings(readSettingsFile(file(), { recoverCorrupt: false }))).toBe(true)
    expect(reads()).toBe(SETTINGS_READ_ATTEMPTS)
    expect(isUnreadableSettings(readSettingsFile(file(), { recoverCorrupt: false }))).toBe(true)
    expect(reads()).toBe(SETTINGS_READ_ATTEMPTS) // the cached verdict: not even one read
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1) // nor a log line per read
    fs.writeFileSync(file(), '{"fixed":true}', 'utf-8') // another size: the verdict is gone
    expect(readSettingsFile(file(), { recoverCorrupt: false })).toEqual({ fixed: true })
  })
})

describe('writeFileAtomicSync', () => {
  const failRename = (code: string) => {
    let calls = 0
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      calls++
      throw Object.assign(new Error(`${code}: rename refused`), { code })
    })
    return () => calls
  }

  for (const code of ['EPERM', 'EBUSY']) {
    it(`Windows: a rename refused with ${code} is retried, then the content is written in place`, () => {
      setPlatform('win32')
      writeFileAtomicSync(file(), 'old')
      const calls = failRename(code)
      writeFileAtomicSync(file(), 'new')
      expect(calls()).toBe(RENAME_ATTEMPTS)
      expect(fs.readFileSync(file(), 'utf-8')).toBe('new')
      expect(leftovers()).toEqual([])
    })
  }

  it('Windows: any other rename error throws and removes the temp', () => {
    setPlatform('win32')
    writeFileAtomicSync(file(), 'old')
    const calls = failRename('EXDEV')
    expect(() => writeFileAtomicSync(file(), 'new')).toThrow(/EXDEV/)
    expect(calls()).toBe(1)
    expect(fs.readFileSync(file(), 'utf-8')).toBe('old')
    expect(leftovers()).toEqual([])
  })

  it('POSIX: even EPERM throws at once (no in-place fallback) and removes the temp', () => {
    setPlatform('linux')
    writeFileAtomicSync(file(), 'old')
    const calls = failRename('EPERM')
    expect(() => writeFileAtomicSync(file(), 'new')).toThrow(/EPERM/)
    expect(calls()).toBe(1)
    expect(fs.readFileSync(file(), 'utf-8')).toBe('old')
    expect(leftovers()).toEqual([])
  })

  it('replaces the content whole and leaves no temp file behind', () => {
    writeFileAtomicSync(file(), 'one')
    writeFileAtomicSync(file(), 'two')
    expect(fs.readFileSync(file(), 'utf-8')).toBe('two')
    expect(leftovers()).toEqual([])
  })

  it('a failed write removes its temp file and leaves the other files alone', () => {
    writeFileAtomicSync(file(), 'kept')
    const dirTarget = path.join(tmp, 'a-dir')
    fs.mkdirSync(dirTarget)
    fs.writeFileSync(path.join(dirTarget, 'inside'), 'x')
    expect(() => writeFileAtomicSync(dirTarget, 'x')).toThrow()
    expect(leftovers()).toEqual([])
    expect(fs.readFileSync(file(), 'utf-8')).toBe('kept')
  })

  it.skipIf(isWindows)('the new file is owner-only (0600), also over a legacy 0644 one', () => {
    fs.writeFileSync(file(), '{}')
    fs.chmodSync(file(), 0o644)
    writeSettingsFile(file(), { a: 1 })
    expect(fs.statSync(file()).mode & 0o777).toBe(0o600)
  })

  it.skipIf(isWindows)('writes through a symlink, keeping the link', () => {
    const real = path.join(tmp, 'real.json')
    fs.writeFileSync(real, '{}')
    fs.symlinkSync(real, file())
    writeSettingsFile(file(), { a: 1 })
    expect(fs.lstatSync(file()).isSymbolicLink()).toBe(true)
    expect(JSON.parse(fs.readFileSync(real, 'utf-8'))).toEqual({ a: 1 })
  })
})

describe('CLI settings.json (same rules)', () => {
  const settingsDir = () => path.join(tmp, 'config', 'noteflow')
  const cliSettings = () => assertInsideTmp(path.join(settingsDir(), 'settings.json'), tmp)
  const run = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      APPDATA: path.join(tmp, 'config'),
      XDG_CONFIG_HOME: path.join(tmp, 'config'),
      NOTEFLOW_NOTES_DIR: path.join(tmp, 'notes'),
      NOTEFLOW_NO_APP_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  it('refuses to write over an unreadable settings.json (exit 1, file untouched)', () => {
    const halfWritten = '{"agentTasks":{"enabled":true},'
    fs.mkdirSync(settingsDir(), { recursive: true })
    fs.writeFileSync(cliSettings(), halfWritten, 'utf-8')
    const r = run(['logout'])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/can't be read or parsed/)
    expect(fs.readFileSync(cliSettings(), 'utf-8')).toBe(halfWritten)
  })

  it('writes atomically, keeping the other keys and leaving no temp file', () => {
    fs.mkdirSync(settingsDir(), { recursive: true })
    fs.writeFileSync(cliSettings(), JSON.stringify({ agentTasks: { enabled: true }, githubSync: { enabled: false } }), 'utf-8')
    const r = run(['logout'])
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(fs.readFileSync(cliSettings(), 'utf-8'))).toEqual({ agentTasks: { enabled: true } })
    expect(fs.readdirSync(settingsDir()).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })
})
