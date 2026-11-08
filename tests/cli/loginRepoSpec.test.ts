// `noteflow login [repo]` takes a repo NAME of the signed-in account, and also
// tolerates `owner/repo` when owner is that same account. It used to pass
// "owner/repo" straight to ensureRepo, which created a repo with the wrong name
// under the user's account and pointed the sync at it. And ensureRepo used to
// create the repo on ANY failed GET (network, 401, 5xx) — now only on a 404.
//
// Pure helpers are tested directly; completeGithubLogin / ensureRepo run
// in-process against an `https.request` mock (no request leaves the process);
// the early validation runs the real CLI against throwaway settings/notes dirs
// and never reaches the network (it fails before asking for a device code).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')
const https = require('node:https') as { request: (...a: unknown[]) => unknown }

type Target = { repo?: string; owner?: string; error?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any

let tmp: string
let configDir: string
let cli: Cli
const savedEnv = { ...process.env }
const settingsPath = () => path.join(configDir, 'noteflow', 'settings.json')

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-loginrepo-'))
  configDir = path.join(tmp, 'config')
  process.env.APPDATA = configDir
  process.env.XDG_CONFIG_HOME = configDir
  process.env.NOTEFLOW_NOTES_DIR = path.join(tmp, 'notes')
  process.env.NOTEFLOW_NO_APP_CHECK = '1'
  delete require.cache[CLI_PATH]
  cli = require(CLI_PATH)
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...savedEnv }
  process.exitCode = undefined // exit() inside the CLI sets it; never leak it into the runner
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('parseRepoSpec', () => {
  const parse = (s?: string) => cli.parseRepoSpec(s) as Target

  it('defaults to noteflow-notes', () => {
    expect(parse(undefined)).toEqual({ repo: 'noteflow-notes' })
    expect(parse('')).toEqual({ repo: 'noteflow-notes' })
  })

  it('accepts a repo name or owner/repo', () => {
    expect(parse('my-notes')).toEqual({ repo: 'my-notes' })
    expect(parse('My.Notes_2')).toEqual({ repo: 'My.Notes_2' })
    expect(parse('ana/noteflow-notes')).toEqual({ owner: 'ana', repo: 'noteflow-notes' })
  })

  it('rejects anything that is not a valid GitHub name, or more than one /', () => {
    for (const bad of ['a/b/c', 'my notes', '/notes', 'ana/', 'ana//notes', 'notes?', '..', 'ana/.', 'ñotas']) {
      expect(parse(bad).error, bad).toContain('is not a valid GitHub repo')
    }
  })
})

describe('loginOwnerError', () => {
  it('passes without owner or with the same account (any case)', () => {
    expect(cli.loginOwnerError({ repo: 'notes' }, 'ana')).toBeNull()
    expect(cli.loginOwnerError({ owner: 'ana', repo: 'notes' }, 'ana')).toBeNull()
    expect(cli.loginOwnerError({ owner: 'ANA', repo: 'notes' }, 'Ana')).toBeNull()
  })

  it('fails with another owner, saying nothing was created or saved', () => {
    const msg = cli.loginOwnerError({ owner: 'yago-test', repo: 'mis-notas' }, 'ana') as string
    expect(msg).toContain('"yago-test/mis-notas" is not a repo of the account you signed in with (ana)')
    expect(msg).toContain('Nothing was created or saved')
    expect(msg).toContain("noteflow login mis-notas")
  })
})

describe('resolveFinishRepo with owners', () => {
  const finish = (repo: string, arg?: string, owner?: string) => cli.resolveFinishRepo(repo, arg, owner) as Target

  it('keeps the pending owner and repo', () => {
    expect(finish('notes', undefined, 'ana')).toEqual({ repo: 'notes', owner: 'ana' })
    expect(finish('notes', 'notes', 'ana')).toEqual({ repo: 'notes', owner: 'ana' })
    expect(finish('notes', 'ANA/Notes', 'ana')).toEqual({ repo: 'notes', owner: 'ana' })
  })

  it('carries an owner given only at --finish, so it is still checked', () => {
    expect(finish('notes', 'bob/notes')).toEqual({ repo: 'notes', owner: 'bob' })
  })

  it('rejects another repo, another owner or a malformed one', () => {
    expect(finish('notes', 'bob/notes', 'ana').error).toContain('The pending login is for "ana/notes"')
    expect(finish('notes', 'other').error).toContain('The pending login is for "notes"')
    expect(finish('notes', 'a/b/c').error).toContain('is not a valid GitHub repo')
  })

  it('reads the owner of a pending grant', () => {
    const pending = { deviceCode: 'dc', interval: 5, expiresAt: '2099-01-01T00:00:00.000Z', repo: 'notes', owner: 'ana' }
    expect(cli.checkPendingGithubLogin(pending, Date.now()).pending).toMatchObject({ repo: 'notes', owner: 'ana' })
  })
})

// ── In-process: completeGithubLogin / ensureRepo against a mocked GitHub ──────

type Reply = { status: number; json: unknown } | 'network-error'
let calls: string[]

function mockGithub(handler: (method: string, p: string) => Reply) {
  calls = []
  vi.spyOn(https, 'request').mockImplementation(((opts: { method: string; path: string }, cb: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>
    req.setTimeout = () => req
    req.write = () => {}
    req.end = () => {
      calls.push(`${opts.method} ${opts.path}`)
      const r = handler(opts.method, opts.path)
      queueMicrotask(() => {
        if (r === 'network-error') { req.emit('error', new Error('getaddrinfo ENOTFOUND api.github.com')); return }
        const res = new EventEmitter() as EventEmitter & { statusCode: number }
        res.statusCode = r.status
        cb(res)
        res.emit('data', JSON.stringify(r.json))
        res.emit('end')
      })
    }
    return req
  }) as never)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('completeGithubLogin with owner/repo', () => {
  it('another owner: exits 1 after GET /user — no ensureRepo, nothing saved', async () => {
    mockGithub((m, p) => (p === '/user' ? { status: 200, json: { login: 'ana' } } : { status: 500, json: { message: 'unexpected' } }))
    await expect(cli.completeGithubLogin('tok', { owner: 'yago-test', repo: 'mis-notas' }, { noPull: true }))
      .rejects.toMatchObject({ exitCode: 1 })
    expect(calls).toEqual(['GET /user'])
    expect(fs.existsSync(settingsPath())).toBe(false)
  })

  it('another owner: an existing connection is left untouched', async () => {
    const prev = { githubSync: { enabled: true, owner: 'ana', repo: 'old', encryptedToken: 'b2xk' } }
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(prev))
    mockGithub(() => ({ status: 200, json: { login: 'ana' } }))
    await expect(cli.completeGithubLogin('tok', { owner: 'bob', repo: 'notes' }, { noPull: true }))
      .rejects.toMatchObject({ exitCode: 1 })
    expect(JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))).toEqual(prev)
  })

  it('same owner (case-insensitive): connects with just the repo name', async () => {
    mockGithub((m, p) => {
      if (p === '/user') return { status: 200, json: { login: 'ana' } }
      if (m === 'GET' && p === '/repos/ana/notes') return { status: 200, json: { default_branch: 'main' } }
      return { status: 500, json: { message: `unexpected ${m} ${p}` } }
    })
    await cli.completeGithubLogin('tok', { owner: 'ANA', repo: 'notes' }, { noPull: true })
    expect(calls).toEqual(['GET /user', 'GET /repos/ana/notes'])
    const sync = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')).githubSync
    expect(sync).toMatchObject({ enabled: true, owner: 'ana', repo: 'notes' })
  })
})

describe('ensureRepo', () => {
  it('creates the repo only when GitHub answers 404', async () => {
    mockGithub((m) => (m === 'GET' ? { status: 404, json: { message: 'Not Found' } } : { status: 201, json: { name: 'notes' } }))
    await cli.ensureRepo('tok', 'ana', 'notes')
    expect(calls).toEqual(['GET /repos/ana/notes', 'POST /user/repos'])
  }, 10_000)

  for (const [label, reply] of [
    ['a 5xx', { status: 502, json: { message: 'Bad Gateway' } }],
    ['a 401', { status: 401, json: { message: 'Bad credentials' } }],
    ['a network error', 'network-error'],
  ] as [string, Reply][]) {
    it(`propagates ${label} without creating anything`, async () => {
      mockGithub(() => reply)
      await expect(cli.ensureRepo('tok', 'ana', 'notes')).rejects.toThrow('Could not check the repo ana/notes')
      expect(calls).toEqual(['GET /repos/ana/notes'])
    })
  }
})

// ── CLI runs: the format is validated before any request ──────────────────────

function run(args: string[]) {
  const r = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf-8',
    env: { ...savedEnv, APPDATA: configDir, XDG_CONFIG_HOME: configDir, NOTEFLOW_NOTES_DIR: path.join(tmp, 'notes'), NOTEFLOW_NO_APP_CHECK: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

describe('login argument validation (no network)', () => {
  it('a malformed repo fails before the device code — also with --no-wait', () => {
    for (const args of [['login', 'a/b/c', '--no-wait'], ['login', 'my notes', '--no-wait', '--json'], ['login', 'ana/']]) {
      const r = run(args)
      expect(r.status, args.join(' ')).toBe(1)
      expect(r.stderr).toContain('is not a valid GitHub repo')
      expect(r.stdout).not.toContain('Authenticating with GitHub')
    }
    expect(fs.existsSync(settingsPath())).toBe(false)
  })

  it('--finish with a malformed repo fails before looking at the pending login', () => {
    const r = run(['login', 'a/b/c', '--finish'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('is not a valid GitHub repo')
  })

  it('--finish with another owner than the pending one fails and keeps it', () => {
    const pending = { deviceCode: 'dc', interval: 5, expiresAt: '2099-01-01T00:00:00.000Z', repo: 'notes', owner: 'ana' }
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify({ cliGithubLogin: pending }))
    const r = run(['login', 'bob/notes', '--finish'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('The pending login is for "ana/notes"')
    expect(JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')).cliGithubLogin).toEqual(pending)
  })

  it('documents owner/repo in the help', () => {
    expect(run(['help', 'login']).stdout).toContain("pass owner/repo so a wrong account can't create a copy")
  })
})
