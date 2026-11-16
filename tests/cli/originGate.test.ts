// The CLI's notes dir origin gate (cli/noteflow.js: evaluateGithubOrigin /
// evaluateCloudOrigin and every sync path that checks them). Connecting
// another GitHub repo — or signing in to another NoteFlow Cloud account — while
// synced notes from the previous one are on disk must NOT pull or push
// anything until the user chooses (`noteflow origin merge`, `--merge`, or
// logout to cancel).
//
// In process, against an in-memory GitHub (several repos) behind an
// `https.request` mock and an in-memory Cloud behind a `fetch` mock. Notes and
// settings live in throwaway dirs (NOTEFLOW_NOTES_DIR + APPDATA /
// XDG_CONFIG_HOME): no request ever leaves the process.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gitBlobSha } from '../../electron/mirrorPlan'
import { assertInsideTmp } from '../helpers/tmpGuard'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')
const https = require('node:https') as { request: (...a: unknown[]) => unknown }
const nodeFs = require('node:fs') as typeof fs
const nodeOs = require('node:os') as typeof os

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const LOGIN = 'me'
const TOKEN = Buffer.from('ghp_test').toString('base64')
const DIR = 'groceries-abc12345'
const NOTE_MD = `---\nid: abc12345\ntitle: Groceries\ncreated: "2026-10-01T00:00:00.000Z"\nupdated: "2026-10-02T00:00:00.000Z"\nsections:\n  - id: s1\n    name: List\n---\n`
const NOTE_MD_TWO = NOTE_MD.replace('    name: List\n', '    name: List\n  - id: s2\n    name: Todo\n')

/** GitHub: repos of one account (Contents with sha check, recursive tree, blobs, /user). */
class FakeGithub {
  repos = new Map<string, { id: number; files: Map<string, string> }>()
  calls: string[] = []

  addRepo(name: string, id: number, files: Record<string, string> = {}) {
    this.repos.set(name, { id, files: new Map(Object.entries(files)) })
  }

  mutations() { return this.calls.filter((c) => !c.startsWith('GET')) }

  handle(method: string, endpoint: string, body: Json): { status: number; json: unknown } {
    const u = new URL(endpoint, 'https://api.github.com')
    const p = decodeURIComponent(u.pathname)
    this.calls.push(`${method} ${p}`)
    if (p === '/user') return { status: 200, json: { login: LOGIN } }
    if (p === '/user/repos' && method === 'POST') {
      this.addRepo(body.name, 900 + this.repos.size)
      return { status: 201, json: { id: this.repos.get(body.name)!.id, name: body.name } }
    }
    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(p)
    if (!m || m[1] !== LOGIN) return { status: 404, json: { message: 'Not Found' } }
    const repo = this.repos.get(m[2])
    if (!repo) return { status: 404, json: { message: 'Not Found' } }
    const rest = m[3] || ''
    if (rest === '' && method === 'GET') return { status: 200, json: { id: repo.id, default_branch: 'main' } }
    if (rest === '/git/trees/main') {
      return { status: 200, json: { tree: [...repo.files].map(([path, c]) => ({ path, type: 'blob', sha: gitBlobSha(c) })) } }
    }
    if (rest.startsWith('/git/blobs/')) {
      const sha = rest.slice('/git/blobs/'.length)
      const content = [...repo.files.values()].find((c) => gitBlobSha(c) === sha)
      if (content === undefined) return { status: 404, json: { message: 'Not Found' } }
      return { status: 200, json: { encoding: 'base64', content: Buffer.from(content).toString('base64') } }
    }
    if (rest.startsWith('/contents/')) {
      const rel = rest.slice('/contents/'.length)
      const cur = repo.files.get(rel)
      const curSha = cur === undefined ? undefined : gitBlobSha(cur)
      if (method === 'GET') {
        if (cur === undefined) return { status: 404, json: { message: 'Not Found' } }
        return { status: 200, json: { sha: curSha, size: Buffer.byteLength(cur), encoding: 'base64', content: Buffer.from(cur).toString('base64') } }
      }
      if (method === 'PUT') {
        if (body?.sha !== curSha) return { status: 409, json: { message: 'sha mismatch' } }
        repo.files.set(rel, Buffer.from(String(body.content), 'base64').toString('utf-8'))
        return { status: 200, json: { content: { sha: gitBlobSha(repo.files.get(rel)!) } } }
      }
      if (method === 'DELETE') {
        if (cur === undefined || body?.sha !== curSha) return { status: 409, json: { message: 'sha mismatch' } }
        repo.files.delete(rel)
        return { status: 200, json: {} }
      }
    }
    return { status: 404, json: { message: `unexpected ${method} ${p}` } }
  }
}

/** NoteFlow Cloud: an EMPTY managed-keys account (enough to pull and upload). */
class FakeCloud {
  calls: string[] = []
  seq = 0
  constructor(private dek: Uint8Array) {}
  mutations() { return this.calls.filter((c) => !c.startsWith('GET') && !c.includes('/auth/v1/token') && !c.includes('/unlock')) }
  handle(url: string, init: { method?: string; body?: string } = {}): { status: number; json: unknown } {
    const u = new URL(url)
    const method = init.method || 'GET'
    this.calls.push(`${method} ${u.pathname}`)
    if (u.pathname === '/auth/v1/token') return { status: 200, json: { access_token: 'at', refresh_token: 'rt2' } }
    if (u.pathname === '/rest/v1/user_keys') return { status: 200, json: [{ mode: 'managed' }] }
    if (u.pathname === '/functions/v1/cloud-keys/unlock') return { status: 200, json: { dek: Buffer.from(this.dek).toString('base64url') } }
    if (u.pathname === '/rest/v1/files' && method === 'GET') return { status: 200, json: [] }
    if (u.pathname === '/rest/v1/rpc/cloud_upsert_file_v2') return { status: 200, json: ++this.seq }
    return { status: 404, json: { message: `unexpected ${method} ${u.pathname}` } }
  }
}

let tmp: string
let notesDir: string
let homeDir: string
let configDir: string
let cli: Cli
let gh: FakeGithub
let cloud: FakeCloud
let logs: string[]
const savedEnv = { ...process.env }
const savedFetch = globalThis.fetch

const settingsPath = () => path.join(configDir, 'noteflow', 'settings.json')
const readSettings = (): Json => JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
const writeSettings = (s: Json) => fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
const ghStatePath = () => path.join(configDir, 'noteflow', 'cli-github-state.json')
const cloudStatePath = () => path.join(configDir, 'noteflow', 'cli-cloud-state.json')
const said = (text: string) => logs.some((l) => l.includes(text))
/** What an adoption writes besides the identity: this notes dir. */
const HERE = () => ({ notesDir: path.resolve(notesDir) })
/** The CLI's default notes dir under the throwaway home (see beforeEach). */
const defaultNotesDir = () => (process.platform === 'linux'
  ? path.join(homeDir, '.local', 'share', 'noteflow-notes')
  : path.join(homeDir, 'noteflow-notes'))

function addLocalNote() {
  fs.mkdirSync(path.join(notesDir, DIR), { recursive: true })
  fs.writeFileSync(path.join(notesDir, DIR, 'note.md'), NOTE_MD)
  fs.writeFileSync(path.join(notesDir, DIR, 's1.md'), 'milk')
}

function githubSettings(repo: string, extra: Json = {}): Json {
  return { enabled: true, owner: LOGIN, repo, encryptedToken: TOKEN, ...extra }
}

function load() {
  delete require.cache[CLI_PATH]
  cli = require(CLI_PATH)
  cloud = new FakeCloud(cli.generateDek())
}

/** Runs a command that may exit(): → its exit code (0 when it returned normally). */
async function exitCode(p: Promise<unknown>): Promise<number> {
  try { await p; return 0 } catch (e) {
    if (e && typeof e === 'object' && 'exitCode' in e) return (e as { exitCode: number }).exitCode
    throw e
  }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-origin-gate-'))
  // The notes dir IS the default one, under a throwaway home: records without
  // `notesDir` (and every adoption) belong to it — see originPlacement.
  homeDir = path.join(tmp, 'home')
  // os.homedir() is mocked (not HOME/USERPROFILE: afterEach swaps process.env
  // for a plain object, whose writes no longer reach the real environment).
  vi.spyOn(nodeOs, 'homedir').mockReturnValue(homeDir)
  // Derived from the throwaway home explicitly (never through os.homedir()):
  // the commands under test write, archive and delete notes in it.
  notesDir = assertInsideTmp(defaultNotesDir(), tmp)
  configDir = path.join(tmp, 'config')
  fs.mkdirSync(path.join(configDir, 'noteflow'), { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  process.env.APPDATA = configDir
  process.env.XDG_CONFIG_HOME = configDir
  process.env.NOTEFLOW_NOTES_DIR = notesDir
  delete process.env.NOTEFLOW_CLOUD_PASSPHRASE
  gh = new FakeGithub()
  gh.addRepo('a', 1, { [`${DIR}/note.md`]: NOTE_MD, [`${DIR}/s1.md`]: 'milk' })
  gh.addRepo('b', 2, { 'other-zzz11111/note.md': NOTE_MD.replace('abc12345', 'zzz11111') })
  vi.spyOn(https, 'request').mockImplementation(((opts: { method: string; path: string }, cb: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>
    let payload = ''
    req.setTimeout = () => req
    req.write = (chunk: string) => { payload += chunk }
    req.end = () => {
      const isAuth = (opts as { hostname?: string }).hostname === 'github.com'
      const r = isAuth ? { status: 500, json: {} } : gh.handle(opts.method, opts.path, payload ? JSON.parse(payload) : undefined)
      const res = new EventEmitter() as EventEmitter & { statusCode: number }
      res.statusCode = r.status
      queueMicrotask(() => {
        cb(res)
        res.emit('data', JSON.stringify(r.json))
        res.emit('end')
      })
    }
    return req
  }) as never)
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    const res = cloud.handle(String(url), init)
    return { status: res.status, json: async () => res.json }
  }) as unknown as typeof fetch
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = savedFetch
  process.env = { ...savedEnv }
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

// ── GitHub ────────────────────────────────────────────────────────────────────

describe('GitHub: connected to another repo with notes from the previous one on disk', () => {
  /** Notes from repo a on disk; the CLI now connected to b (as a `login b` leaves it). */
  function switchedToB(extra: Json = {}) {
    addLocalNote()
    writeSettings({
      language: 'en',
      githubSync: githubSettings('b', { repoId: 2, lastSync: '2026-10-05T00:00:00.000Z', ...extra }),
      syncOrigin: { github: { repoId: 1, owner: LOGIN, repo: 'a' } },
    })
    fs.writeFileSync(ghStatePath(), JSON.stringify({ owner: LOGIN, repo: 'b', shas: { 'x/note.md': 'abc' } }))
    load()
  }

  it('login to the other repo saves the connection but pulls and uploads nothing, and explains', async () => {
    addLocalNote()
    writeSettings({ githubSync: githubSettings('a', { repoId: 1 }), syncOrigin: { github: { repoId: 1, owner: LOGIN, repo: 'a' } } })
    load()
    await cli.completeGithubLogin('tok', { repo: 'b' }, {})
    expect(gh.calls).toEqual(['GET /user', 'GET /repos/me/b']) // no tree listing (pull), nothing written
    const s = readSettings()
    expect(s.githubSync).toMatchObject({ owner: LOGIN, repo: 'b', repoId: 2 })
    expect(s.syncOrigin.github).toEqual({ repoId: 1, owner: LOGIN, repo: 'a' })
    expect(said('come from me/a, but this CLI is connected to me/b')).toBe(true)
    expect(said('noteflow origin merge')).toBe(true)
    expect(said('noteflow logout')).toBe(true)
    expect(said('desktop app')).toBe(true)
  })

  it('push and pull refuse (exit 1 / error) before any request', async () => {
    switchedToB()
    expect(await exitCode(cli.cmdPush())).toBe(1)
    await expect(cli.cmdPull()).rejects.toThrow('Nothing was pulled')
    expect(gh.calls).toEqual([])
    expect(said('noteflow origin merge')).toBe(true)
    expect(readSettings().syncOrigin.github.repo).toBe('a')
  })

  it('migrate refuses up front', async () => {
    switchedToB()
    expect(await exitCode(cli.cmdMigrate())).toBe(1)
    expect(gh.calls).toEqual([])
  })

  it("an edit's automatic push uploads nothing and says so (the command does not fail)", async () => {
    switchedToB()
    const res = await cli.syncPushNoteFiles(DIR, ['note.md', 's1.md'])
    expect(res).toEqual({ conflicted: false })
    expect(gh.calls).toEqual([])
    expect(said("Not synced to GitHub: the notes here belong to me/a — saved locally; run 'noteflow origin' to resolve")).toBe(true)
  })

  it('delete removes the note locally but nothing on GitHub', async () => {
    switchedToB()
    await cli.cmdDelete('Groceries', { yes: true })
    expect(fs.existsSync(path.join(notesDir, DIR))).toBe(false)
    expect(gh.calls).toEqual([])
    expect(said('Not deleted on GitHub')).toBe(true)
  })

  it('status --json reports the pending choice and how to resolve it (and adopts nothing)', () => {
    switchedToB()
    const before = fs.readFileSync(settingsPath(), 'utf-8')
    let printed = ''
    vi.mocked(process.stdout.write).mockImplementation(((s: string) => { printed += s; return true }) as never)
    cli.cmdStatus({ json: true })
    const origin = JSON.parse(printed).github.origin
    expect(origin).toMatchObject({ state: 'pending', pending: true, blocked: true, previous: 'me/a', next: 'me/b' })
    expect(origin.resolve.join('\n')).toContain('noteflow origin merge')
    expect(fs.readFileSync(settingsPath(), 'utf-8')).toBe(before)
  })

  it('`noteflow origin merge` adopts the repo strictly (reset) and pulls; then push works', async () => {
    switchedToB({ remoteFormatMigratedAt: '2026-10-01T00:00:00.000Z' })
    await cli.cmdOrigin('merge', {})
    const s = readSettings()
    expect(s.syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() })
    expect(s.githubSync.lastSync).not.toBe('2026-10-05T00:00:00.000Z') // the old one is gone (the pull may set a new one)
    expect(s.githubSync.remoteFormatMigratedAt).toBeUndefined()
    expect(s.githubSync.encryptedToken).toBe(TOKEN)
    expect(gh.calls).toContain('GET /repos/me/b/git/trees/main') // the pull ran
    expect(fs.existsSync(path.join(notesDir, 'other-zzz11111', 'note.md'))).toBe(true)
    gh.calls = []
    await cli.cmdPush()
    expect(gh.mutations().some((c) => c === `PUT /repos/me/b/contents/${DIR}/note.md`)).toBe(true)
    // Nothing pending any more: a second merge says so and exits 0.
    logs = []
    expect(await exitCode(cli.cmdOrigin('merge', {}))).toBe(0)
    expect(said('Nothing to resolve')).toBe(true)
  })

  it('`origin merge --no-pull` adopts without pulling', async () => {
    switchedToB()
    await cli.cmdOrigin('merge', { noPull: true })
    expect(readSettings().syncOrigin.github.repo).toBe('b')
    expect(fs.readFileSync(ghStatePath(), 'utf-8')).toBe('{}') // the previous remote's shas are gone
    expect(gh.calls).toEqual([])
  })

  it('`login --merge` adopts the repo and runs the first pull', async () => {
    addLocalNote()
    writeSettings({ githubSync: githubSettings('a', { repoId: 1 }), syncOrigin: { github: { repoId: 1, owner: LOGIN, repo: 'a' } } })
    load()
    await cli.completeGithubLogin('tok', { repo: 'b' }, { merge: true })
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() })
    expect(gh.calls).toContain('GET /repos/me/b/git/trees/main')
    expect(said('Merged: the notes in')).toBe(true)
  })

  it('a renamed repo with the same repoId does not ask (the origin takes the new name)', async () => {
    addLocalNote()
    writeSettings({ githubSync: githubSettings('b', { repoId: 2 }), syncOrigin: { github: { repoId: 2, owner: LOGIN, repo: 'old-name', label: 'x' } } })
    load()
    await cli.cmdPush()
    expect(gh.mutations().length).toBeGreaterThan(0)
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', label: 'x', ...HERE() })
  })

  it('the same repo (by name, case-insensitive, no repoId) does not ask', async () => {
    addLocalNote()
    writeSettings({ githubSync: githubSettings('b'), syncOrigin: { github: { owner: 'ME', repo: 'B' } } })
    load()
    await cli.cmdPush()
    expect(gh.mutations().length).toBeGreaterThan(0)
  })

  it('a stale origin with notes asks even for the same repo; without notes it is adopted with the reset', async () => {
    addLocalNote()
    writeSettings({ githubSync: githubSettings('b', { repoId: 2, lastSync: 'L' }), syncOrigin: { github: { repoId: 2, owner: LOGIN, repo: 'b', stale: true } } })
    load()
    expect(await exitCode(cli.cmdPush())).toBe(1)
    expect(said('no longer belong to me/b')).toBe(true)
    expect(gh.calls).toEqual([])
    fs.rmSync(path.join(notesDir, DIR), { recursive: true })
    await cli.cmdPush()
    const s = readSettings()
    expect(s.syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() })
    expect(s.githubSync.lastSync).not.toBe('L')
  })

  it('another repo but no synced notes on disk: adopted without asking, previous state reset', async () => {
    writeSettings({ githubSync: githubSettings('b', { repoId: 2, lastSync: 'L' }), syncOrigin: { github: { repoId: 1, owner: LOGIN, repo: 'a' } } })
    fs.writeFileSync(ghStatePath(), JSON.stringify({ owner: LOGIN, repo: 'b', shas: { 'x/note.md': 'abc' } }))
    load()
    expect(cli.evaluateGithubOrigin()).toMatchObject({ state: 'clear', reason: 'changed-empty' })
    const s = readSettings()
    expect(s.syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() })
    expect(s.githubSync.lastSync).toBeUndefined()
    expect(fs.readFileSync(ghStatePath(), 'utf-8')).toBe('{}')
  })

  it('only local-only notes on disk count as "no notes"', () => {
    fs.mkdirSync(path.join(notesDir, DIR), { recursive: true })
    fs.writeFileSync(path.join(notesDir, DIR, 'note.md'), NOTE_MD.replace('---\n', '---\nlocalOnly: true\n'))
    writeSettings({ githubSync: githubSettings('b', { repoId: 2 }), syncOrigin: { github: { repoId: 1, owner: LOGIN, repo: 'a' } } })
    load()
    expect(cli.evaluateGithubOrigin().state).toBe('clear')
  })

  it('no origin recorded (first connection / older install): adopted without asking, lastSync kept', async () => {
    addLocalNote()
    writeSettings({ githubSync: githubSettings('b', { repoId: 2, lastSync: 'L' }) })
    load()
    expect(cli.evaluateGithubOrigin()).toMatchObject({ state: 'clear', reason: 'no-origin' })
    const s = readSettings()
    expect(s.syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() })
    expect(s.githubSync.lastSync).toBe('L')
  })

  it('an unreadable settings.json blocks (fail-closed) with its own message', async () => {
    addLocalNote()
    load()
    fs.writeFileSync(settingsPath(), '{ not json')
    expect(cli.evaluateGithubOrigin().state).toBe('unreadable')
    expect(await exitCode(cli.cmdOrigin('merge', {}))).toBe(1)
    expect(said("can't be read")).toBe(true)
    expect(gh.calls).toEqual([])
  })

  it('a failed reset of cli-github-state.json leaves no new origin (and lastSync untouched)', async () => {
    switchedToB()
    fs.rmSync(ghStatePath())
    fs.mkdirSync(ghStatePath()) // writing the empty state fails (EISDIR)
    expect(await exitCode(cli.cmdOrigin('merge', {}))).toBe(1)
    const s = readSettings()
    expect(s.syncOrigin.github.repo).toBe('a')
    expect(s.githubSync.lastSync).toBe('2026-10-05T00:00:00.000Z')
    expect(cli.evaluateGithubOrigin().state).toBe('ask')
    expect(gh.calls).toEqual([])
  })

  it('a failed settings.json write leaves no new origin next to the old lastSync', async () => {
    switchedToB()
    const real = nodeFs.writeFileSync
    vi.spyOn(nodeFs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(file) === settingsPath()) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      return (real as (...a: unknown[]) => void)(file, ...rest)
    }) as never)
    expect(await exitCode(cli.cmdOrigin('merge', {}))).toBe(1)
    vi.mocked(nodeFs.writeFileSync).mockRestore()
    const s = readSettings()
    expect(s.syncOrigin.github.repo).toBe('a')
    expect(s.githubSync.lastSync).toBe('2026-10-05T00:00:00.000Z')
    expect(cli.evaluateGithubOrigin().state).toBe('ask') // still on hold
    expect(said('EPERM')).toBe(true)
  })

  it('the adoption refuses when githubSync changed since the evaluation', () => {
    switchedToB()
    const gate = cli.evaluateGithubOrigin()
    const s = readSettings()
    s.githubSync.repo = 'c'
    writeSettings(s)
    expect(cli.adoptGithubOrigin(gate.next, true)).toMatchObject({ ok: false })
    expect(readSettings().syncOrigin.github.repo).toBe('a')
  })

  it('unknown keys of settings and syncOrigin survive an adoption (and the other backend\'s record)', async () => {
    switchedToB()
    const s = readSettings()
    s.futureKey = { a: 1 }
    s.syncOrigin.future = true
    s.syncOrigin.cloud = { userId: 'u1', email: 'a@x.io' }
    s.syncOrigin.github.label = 'old repo'
    s.githubSync.futureField = 'kept'
    writeSettings(s)
    await cli.cmdOrigin('merge', { noPull: true })
    const after = readSettings()
    expect(after.futureKey).toEqual({ a: 1 })
    expect(after.syncOrigin.future).toBe(true)
    expect(after.syncOrigin.cloud).toEqual({ userId: 'u1', email: 'a@x.io' })
    expect(after.syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() }) // another repo: a fresh record
    expect(after.githubSync.futureField).toBe('kept')
  })

  it('with the desktop app on NoteFlow Cloud (GitHub = its mirror) nothing asks and syncOrigin.github is untouched', async () => {
    switchedToB()
    const s = readSettings()
    s.cloudSync = { enabled: true }
    writeSettings(s)
    await cli.cmdPush()
    expect(gh.mutations().length).toBeGreaterThan(0)
    expect(readSettings().syncOrigin.github.repo).toBe('a')
  })

  it('…but an explicit login in that state adopts the repo and clears its stale', async () => {
    addLocalNote()
    writeSettings({
      cloudSync: { enabled: true },
      githubSync: githubSettings('a', { repoId: 1 }),
      syncOrigin: { github: { repoId: 2, owner: LOGIN, repo: 'b', stale: true }, cloud: { userId: 'u1' } },
    })
    load()
    await cli.completeGithubLogin('tok', { repo: 'b' }, { noPull: true })
    const s = readSettings()
    expect(s.syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() })
    expect(s.syncOrigin.cloud).toEqual({ userId: 'u1' })
  })

  it('an empty NOTEFLOW_NOTES_DIR override with record A / connection B adopts nothing and touches nothing', async () => {
    switchedToB()
    const settingsBefore = fs.readFileSync(settingsPath(), 'utf-8')
    const stateBefore = fs.readFileSync(ghStatePath(), 'utf-8')
    const other = path.join(tmp, 'other-notes')
    fs.mkdirSync(other)
    process.env.NOTEFLOW_NOTES_DIR = other
    load()
    expect(cli.evaluateGithubOrigin()).toMatchObject({ state: 'clear', reason: 'other-dir' })
    await cli.cmdOrigin('merge', {}) // nothing pending for this dir
    expect(said('Nothing to resolve')).toBe(true)
    expect(fs.readFileSync(settingsPath(), 'utf-8')).toBe(settingsBefore)
    expect(fs.readFileSync(ghStatePath(), 'utf-8')).toBe(stateBefore)
    // Back in the real dir: still on hold.
    process.env.NOTEFLOW_NOTES_DIR = notesDir
    load()
    expect(cli.evaluateGithubOrigin().state).toBe('ask')
  })

  it('no record and a notes dir that is not the default: proceeds without writing an origin', () => {
    const other = path.join(tmp, 'other-notes')
    fs.mkdirSync(other)
    process.env.NOTEFLOW_NOTES_DIR = other
    writeSettings({ githubSync: githubSettings('b', { repoId: 2 }) })
    load()
    expect(cli.evaluateGithubOrigin()).toMatchObject({ state: 'clear', reason: 'other-dir' })
    expect(readSettings().syncOrigin).toBeUndefined()
  })

  it('a record with notesDir of another dir is foreign here; one for this dir applies', () => {
    addLocalNote()
    writeSettings({ githubSync: githubSettings('b', { repoId: 2 }), syncOrigin: { github: { repoId: 1, owner: LOGIN, repo: 'a', notesDir: path.join(tmp, 'elsewhere') } } })
    load()
    expect(cli.evaluateGithubOrigin({ write: false })).toMatchObject({ state: 'clear', reason: 'other-dir' })
    const s = readSettings()
    s.syncOrigin.github.notesDir = notesDir.toUpperCase() === notesDir ? notesDir : (process.platform === 'linux' ? notesDir : notesDir.toUpperCase())
    writeSettings(s)
    expect(cli.evaluateGithubOrigin({ write: false }).state).toBe('ask')
  })

  it('sameNotesDir: resolved, trailing separators ignored, case-insensitive on win32/darwin only', () => {
    load()
    const base = path.join(tmp, 'Notes')
    expect(cli.sameNotesDir(base, base + path.sep)).toBe(true)
    expect(cli.sameNotesDir(base, path.join(base, 'x', '..'))).toBe(true)
    expect(cli.sameNotesDir(base, base.toLowerCase(), 'win32')).toBe(true)
    expect(cli.sameNotesDir(base, base.toLowerCase(), 'darwin')).toBe(true)
    expect(cli.sameNotesDir(base, base.toLowerCase(), 'linux')).toBe(base === base.toLowerCase())
    expect(cli.sameNotesDir(base, path.join(tmp, 'Other'))).toBe(false)
    expect(cli.normalizeNotesDir(base + path.sep)).toBe(path.resolve(base))
  })

  it('section delete on hold removes the section locally but nothing on GitHub', async () => {
    switchedToB()
    fs.writeFileSync(path.join(notesDir, DIR, 'note.md'), NOTE_MD_TWO)
    fs.writeFileSync(path.join(notesDir, DIR, 's2.md'), 'call mum')
    await cli.cmdSectionDelete('Groceries', 'Todo', { yes: true })
    expect(fs.existsSync(path.join(notesDir, DIR, 's2.md'))).toBe(false)
    expect(gh.calls).toEqual([])
    expect(said('Not synced to GitHub')).toBe(true)
  })

  it('`origin merge` records the repoId first when githubSync lacks it (and the origin gets it)', async () => {
    switchedToB()
    const s = readSettings()
    delete s.githubSync.repoId
    writeSettings(s)
    await cli.cmdOrigin('merge', { noPull: true })
    expect(gh.calls).toEqual(['GET /repos/me/b'])
    const after = readSettings()
    expect(after.githubSync.repoId).toBe(2)
    expect(after.syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() })
  })

  it('…and with the id the "other" repo can turn out to be the origin, renamed: nothing to merge', async () => {
    addLocalNote()
    writeSettings({ githubSync: githubSettings('b', { lastSync: 'L' }), syncOrigin: { github: { repoId: 2, owner: LOGIN, repo: 'old-name' } } })
    load()
    expect(cli.evaluateGithubOrigin({ write: false }).state).toBe('ask') // by name: another repo
    await cli.cmdOrigin('merge', { noPull: true })
    expect(said('Nothing to resolve')).toBe(true)
    const after = readSettings()
    expect(after.syncOrigin.github).toEqual({ repoId: 2, owner: LOGIN, repo: 'b', ...HERE() }) // renamed, no reset
    expect(after.githubSync.lastSync).toBe('L')
  })

  it('`origin merge` without the repoId (GET fails) adopts by name', async () => {
    switchedToB()
    const s = readSettings()
    delete s.githubSync.repoId
    writeSettings(s)
    gh.repos.delete('b') // GET /repos/me/b → 404
    await cli.cmdOrigin('merge', { noPull: true })
    expect(readSettings().syncOrigin.github).toEqual({ owner: LOGIN, repo: 'b', ...HERE() })
  })

  it('login --no-wait keeps --merge in the pending grant (for --finish)', async () => {
    writeSettings({})
    load()
    // The device-code request is the only github.com call: answer it directly.
    vi.mocked(https.request).mockImplementation(((opts: { hostname: string }, cb: (res: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & Record<string, unknown>
      req.setTimeout = () => req
      req.write = () => {}
      req.end = () => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number }
        res.statusCode = 200
        queueMicrotask(() => {
          cb(res)
          res.emit('data', JSON.stringify({ device_code: 'dc', user_code: 'UC', verification_uri: 'https://x', interval: 5, expires_in: 900 }))
          res.emit('end')
        })
      }
      return req
    }) as never)
    vi.spyOn(require('node:child_process'), 'execSync').mockImplementation(() => Buffer.from(''))
    await cli.cmdLogin('b', { noWait: true, merge: true })
    expect(readSettings().cliGithubLogin).toMatchObject({ repo: 'b', merge: true })
  })
})

// ── NoteFlow Cloud ────────────────────────────────────────────────────────────

describe('NoteFlow Cloud: signed in to another account with notes from the previous one on disk', () => {
  const account = (userId: string, email: string) =>
    ({ email, userId, refreshToken: Buffer.from('rt').toString('base64') })
  const session = (userId: string, email: string) =>
    ({ user: { id: userId, email }, refresh_token: 'rt', access_token: 'at' })

  it('seeds the origin with the owner of the CLI state (cliCloud.userId), persists it and asks', async () => {
    addLocalNote()
    writeSettings({ cliAccount: account('u2', 'b@x.io'), cliCloud: { enabled: true, userId: 'u1', pullSeq: 5 } })
    load()
    const gate = cli.evaluateCloudOrigin()
    expect(gate).toMatchObject({ state: 'ask', seeded: true })
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: 'u1', ...HERE() })
    // Blocked: no pull, and the binding reset of the cursor never ran.
    expect(await exitCode(cli.cmdCloudPull())).toBe(1)
    expect(cloud.calls).toEqual([])
    expect(readSettings().cliCloud).toMatchObject({ userId: 'u1', pullSeq: 5 })
    expect(said('come from another NoteFlow account, but this CLI is signed in to the NoteFlow account b@x.io')).toBe(true)
    expect(said('noteflow cloud logout')).toBe(true)
  })

  it("the seed prefers the desktop app's Cloud owner (cloudSync.userId)", () => {
    addLocalNote()
    writeSettings({ cloudSync: { userId: 'app-user' }, cliAccount: account('app-user', 'a@x.io'), cliCloud: { enabled: true, userId: 'u1' } })
    load()
    expect(cli.evaluateCloudOrigin().state).toBe('clear')
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: 'app-user', email: 'a@x.io', ...HERE() })
  })

  it('no owner known at all: the account is adopted without asking', () => {
    addLocalNote()
    writeSettings({ cliAccount: account('u2', 'b@x.io'), cliCloud: { enabled: true } })
    load()
    expect(cli.evaluateCloudOrigin()).toMatchObject({ state: 'clear', reason: 'no-origin' })
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: 'u2', email: 'b@x.io', ...HERE() })
  })

  it('cloud login to another account signs in but pulls nothing (cursor of the old account intact)', async () => {
    addLocalNote()
    writeSettings({ cliAccount: account('u1', 'a@x.io'), cliCloud: { enabled: true, userId: 'u1', pullSeq: 5 }, syncOrigin: { cloud: { userId: 'u1', email: 'a@x.io' } } })
    fs.writeFileSync(cloudStatePath(), JSON.stringify({ userId: 'u1', bases: {} }))
    load()
    await cli.finishCloudLogin(session('u2', 'b@x.io'), 'b@x.io', {})
    expect(cloud.calls).toEqual(['GET /rest/v1/user_keys']) // the keys-mode notice only
    const s = readSettings()
    expect(s.cliAccount.userId).toBe('u2')
    expect(s.cliCloud).toMatchObject({ enabled: true, userId: 'u1', pullSeq: 5 })
    expect(s.syncOrigin.cloud).toEqual({ userId: 'u1', email: 'a@x.io' })
    expect(fs.existsSync(cloudStatePath())).toBe(true)
    expect(said('come from the NoteFlow account a@x.io')).toBe(true)
  })

  it('…then `origin merge` adopts the account with the reset of the old state', async () => {
    addLocalNote()
    writeSettings({ cliAccount: account('u1', 'a@x.io'), cliCloud: { enabled: true, userId: 'u1', pullSeq: 5 }, syncOrigin: { cloud: { userId: 'u1' } } })
    fs.writeFileSync(cloudStatePath(), JSON.stringify({ userId: 'u1', bases: {} }))
    load()
    await cli.finishCloudLogin(session('u2', 'b@x.io'), 'b@x.io', {})
    await cli.cmdOrigin('merge', { noPull: true })
    const s = readSettings()
    expect(s.syncOrigin.cloud).toEqual({ userId: 'u2', email: 'b@x.io', ...HERE() })
    expect(s.cliCloud).toEqual({ enabled: true, userId: 'u2' })
    expect(fs.existsSync(cloudStatePath())).toBe(false)
    expect(cli.evaluateCloudOrigin().state).toBe('clear')
  })

  it('cloud login --merge adopts and runs the first pull; then the automatic push uploads', async () => {
    addLocalNote()
    writeSettings({ cliAccount: account('u1', 'a@x.io'), cliCloud: { enabled: true, userId: 'u1', pullSeq: 5 }, syncOrigin: { cloud: { userId: 'u1' } } })
    load()
    await cli.finishCloudLogin(session('u2', 'b@x.io'), 'b@x.io', { merge: true })
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: 'u2', email: 'b@x.io', ...HERE() })
    expect(cloud.calls).toContain('GET /rest/v1/files') // the pull ran
    cloud.calls = []
    await cli.syncPushNoteFiles(DIR, ['note.md', 's1.md'])
    expect(cloud.calls).toContain('POST /rest/v1/rpc/cloud_upsert_file_v2')
  })

  it("an edit's automatic push and a delete stay local while on hold", async () => {
    addLocalNote()
    writeSettings({ cliAccount: account('u2', 'b@x.io'), cliCloud: { enabled: true, userId: 'u1' }, syncOrigin: { cloud: { userId: 'u1' } } })
    load()
    await cli.syncPushNoteFiles(DIR, ['note.md', 's1.md'])
    expect(logs.join('\n')).toContain('Not synced to NoteFlow Cloud')
    await cli.cmdDelete('Groceries', { yes: true })
    expect(said('Not deleted on NoteFlow Cloud')).toBe(true)
    expect(cloud.calls).toEqual([])
  })

  it('a stale Cloud origin without notes is adopted with the reset', () => {
    writeSettings({ cliAccount: account('u1', 'a@x.io'), cliCloud: { enabled: true, userId: 'u1', pullSeq: 9 }, syncOrigin: { cloud: { userId: 'u1', stale: true } } })
    load()
    expect(cli.evaluateCloudOrigin()).toMatchObject({ state: 'clear', reason: 'stale-empty' })
    const s = readSettings()
    expect(s.syncOrigin.cloud).toEqual({ userId: 'u1', email: 'a@x.io', ...HERE() })
    expect(s.cliCloud).toEqual({ enabled: true, userId: 'u1' })
  })

  it('cloud push and history --restore on hold exit 1 without any request', async () => {
    addLocalNote()
    writeSettings({ cliAccount: account('u2', 'b@x.io'), cliCloud: { enabled: true, userId: 'u1' }, syncOrigin: { cloud: { userId: 'u1' } } })
    load()
    expect(await exitCode(cli.cmdCloudPush())).toBe(1)
    expect(await exitCode(cli.cmdHistory('Groceries', 'List', { restore: '1' }))).toBe(1)
    expect(cloud.calls).toEqual([])
    expect(said('Sync with NoteFlow Cloud is on hold')).toBe(true)
  })

  it('with an override (not the default dir) Cloud neither seeds nor writes an origin', () => {
    const other = path.join(tmp, 'other-notes')
    fs.mkdirSync(other)
    process.env.NOTEFLOW_NOTES_DIR = other
    writeSettings({ cliAccount: account('u2', 'b@x.io'), cliCloud: { enabled: true, userId: 'u1', pullSeq: 5 } })
    const before = fs.readFileSync(settingsPath(), 'utf-8')
    load()
    expect(cli.evaluateCloudOrigin()).toMatchObject({ state: 'clear', reason: 'other-dir' })
    expect(fs.readFileSync(settingsPath(), 'utf-8')).toBe(before)
  })

  it('--merge goes with --code (or the interactive login), never with --send-code', () => {
    load()
    expect(cli.planCloudLogin('me@x.io', { sendCode: true, merge: true }).error).toContain('--merge goes with the sign-in step')
    expect(cli.planCloudLogin('me@x.io', { code: '12345678', merge: true })).toEqual({ mode: 'code', email: 'me@x.io', code: '12345678' })
    expect(cli.planCloudLogin('me@x.io', { merge: true })).toEqual({ mode: 'interactive', email: 'me@x.io' })
  })

  it('cloud status --json shows the pending choice', async () => {
    addLocalNote()
    writeSettings({ cliAccount: account('u2', 'b@x.io'), cliCloud: { enabled: true, userId: 'u1' }, syncOrigin: { cloud: { userId: 'u1' } } })
    load()
    let printed = ''
    vi.mocked(process.stdout.write).mockImplementation(((s: string) => { printed += s; return true }) as never)
    await cli.cmdCloudStatus({ json: true })
    expect(JSON.parse(printed).cloud.origin).toMatchObject({ state: 'pending', pending: true, previous: 'another NoteFlow account' })
  })

  it('`noteflow origin --json` shows both backends', () => {
    addLocalNote()
    writeSettings({
      githubSync: githubSettings('b', { repoId: 2 }), cliAccount: account('u1', 'a@x.io'),
      syncOrigin: { github: { repoId: 1, owner: LOGIN, repo: 'a' }, cloud: { userId: 'u1' } },
    })
    load()
    let printed = ''
    vi.mocked(process.stdout.write).mockImplementation(((s: string) => { printed += s; return true }) as never)
    cli.cmdOrigin(undefined, { json: true })
    const o = JSON.parse(printed)
    expect(o.localNotes).toBe(true)
    expect(o.activeBackend).toBe('github') // cliCloud not enabled
    expect(o.github).toMatchObject({ connected: { owner: LOGIN, repo: 'b', repoId: 2 }, pending: true })
    expect(o.cloud).toMatchObject({ signedIn: { userId: 'u1', email: 'a@x.io' }, pending: false })
  })
})
