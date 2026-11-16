// Origin of the notes dir (electron/syncOrigin.ts) through electron/githubSync.ts
// against a SIMULATED GitHub with several repos (fake `https.request`, Device
// Flow included): connecting to repo B a notes dir that came from repo A must
// not upload A's notes to B without asking. Covers the pending state (survives a
// restart, blocks pull and push), "merge", "replace" (local notes archived with
// electron/notesArchive.ts — what main.ts' sync:resolve-origin does), "cancel",
// a failed archive, the same repo / renamed repo (no question) and Cloud
// enabled (GitHub never asks). Electron is mocked; no network.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'
import { archiveSyncedNotes, NotesArchiveError } from '../../electron/notesArchive'
import { identityArchiveLabel } from '../../electron/syncOrigin'

// ── Simulated GitHub (several repos of user "me") ─────────────────────────────

const blobSha = (content: string) => {
  const body = Buffer.from(content, 'utf-8')
  return createHash('sha1').update(`blob ${body.length}\0`, 'utf-8').update(body).digest('hex')
}

interface Repo { id: number; files: Map<string, string> }
const repos = new Map<string, Repo>() // lowercase name → repo
const mutations: string[] = [] // 'PUT <repo>:<path>' / 'DELETE <repo>:<path>'
const treeGets: string[] = [] // repo names whose tree was listed

function answerApi(method: string, url: string, body: Record<string, unknown> | undefined): [number, unknown] {
  if (method === 'GET' && url === '/user') return [200, { login: 'me' }]
  const m = /^\/repos\/me\/([^/]+)(\/.*)?$/.exec(url)
  if (!m) return [404, { message: 'Not Found' }]
  const name = m[1].toLowerCase()
  const rest = m[2] ?? ''
  const repo = repos.get(name)
  if (!repo) return [404, { message: 'Not Found' }]
  if (method === 'GET' && rest === '') return [200, { id: repo.id, default_branch: 'main' }]
  if (method === 'GET' && rest.startsWith('/git/trees/')) {
    treeGets.push(name)
    return [200, { truncated: false, tree: [...repo.files].map(([p, c]) => ({ path: p, type: 'blob', sha: blobSha(c) })) }]
  }
  if (!rest.startsWith('/contents/')) return [404, { message: 'Not Found' }]
  const rel = rest.slice('/contents/'.length).split('/').map(decodeURIComponent).join('/')
  const current = repo.files.get(rel)
  if (method === 'GET') {
    if (current === undefined) return [404, { message: 'Not Found' }]
    return [200, { sha: blobSha(current), size: Buffer.byteLength(current), encoding: 'base64', content: Buffer.from(current).toString('base64') }]
  }
  if (method === 'PUT') {
    mutations.push(`PUT ${name}:${rel}`)
    const content = Buffer.from(body!.content as string, 'base64').toString('utf-8')
    repo.files.set(rel, content)
    return [current === undefined ? 201 : 200, { content: { sha: blobSha(content) } }]
  }
  if (method === 'DELETE') {
    mutations.push(`DELETE ${name}:${rel}`)
    if (current === undefined) return [404, { message: 'Not Found' }]
    repo.files.delete(rel)
    return [200, { commit: {} }]
  }
  return [404, { message: 'Not Found' }]
}

function answerAuth(urlPath: string): [number, unknown] {
  if (urlPath === '/login/device/code') {
    return [200, { device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: '900', interval: '1' }]
  }
  if (urlPath === '/login/oauth/access_token') return [200, { access_token: 'tok' }]
  return [404, {}]
}

function fakeRequest(opts: { hostname: string; method: string; path: string }, cb: (res: EventEmitter & { statusCode: number }) => void) {
  const req = new EventEmitter() as EventEmitter & { setTimeout: () => void; write: (s: string) => void; end: () => void; destroy: () => void }
  let payload = ''
  req.setTimeout = () => {}
  req.destroy = () => {}
  req.write = (s: string) => { payload += s }
  req.end = () => {
    if (env.offline) {
      setImmediate(() => req.emit('error', Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })))
      return
    }
    setImmediate(() => {
      const [status, json] = opts.hostname === 'github.com'
        ? answerAuth(opts.path)
        : answerApi(opts.method, opts.path, payload && opts.hostname !== 'github.com' ? JSON.parse(payload) : undefined)
      const res = new EventEmitter() as EventEmitter & { statusCode: number }
      res.statusCode = status
      cb(res)
      res.emit('data', JSON.stringify(json))
      res.emit('end')
    })
  }
  return req
}

vi.mock('https', () => ({ default: { request: fakeRequest }, request: fakeRequest }))

const env = { userData: '', failSettingsWrites: false, failSettingsWritesLeft: 0, offline: false }
// settings.json writes fail on demand (EPERM, disk full, a lock held by the CLI…).
vi.mock('../../electron/settingsFile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/settingsFile')>()
  return {
    writeSettingsFile: (file: string, data: Record<string, unknown>) => {
      if (env.failSettingsWrites) throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
      if (env.failSettingsWritesLeft > 0) {
        env.failSettingsWritesLeft--
        throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
      }
      return actual.writeSettingsFile(file, data)
    },
  }
})
vi.mock('electron', () => ({
  app: { getPath: () => env.userData },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
}))

// ── Fixture ───────────────────────────────────────────────────────────────────

const OLD = '2026-10-01T10:00:00.000Z'

function files(id: string, opts: { localOnly?: boolean } = {}): Record<string, string> {
  const note: DiskNote = {
    id,
    title: id,
    tags: [],
    created: OLD,
    updated: OLD,
    ...(opts.localOnly ? { localOnly: true } : {}),
    sections: [{ id: 's1', name: 'Main', content: `body of ${id}` }],
  }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}

let tmp: string
let notesDir: string
let gh: typeof import('../../electron/githubSync')

const flush = async () => {
  for (let i = 0; i < 300; i++) await new Promise((r) => setImmediate(r))
}
const settingsPath = () => path.join(env.userData, 'settings.json')
const readSettings = () => JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
const writeSettings = (data: unknown) => fs.writeFileSync(settingsPath(), JSON.stringify(data))

function writeLocal(dir: string, f: Record<string, string>) {
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [name, c] of Object.entries(f)) fs.writeFileSync(path.join(notesDir, dir, name), c, 'utf-8')
}
function addRepo(name: string, id: number, notes: Record<string, Record<string, string>> = {}) {
  const repo: Repo = { id, files: new Map([['.noteflow-format', '2\n']]) }
  for (const [dir, f] of Object.entries(notes)) for (const [n, c] of Object.entries(f)) repo.files.set(`${dir}/${n}`, c)
  repos.set(name.toLowerCase(), repo)
  return repo
}
const localDirs = () => fs.readdirSync(notesDir).filter((n) => fs.existsSync(path.join(notesDir, n, 'note.md'))).sort()
const remoteDirs = (repo: string) =>
  [...new Set([...repos.get(repo)!.files.keys()].filter((p) => p.includes('/')).map((p) => p.split('/')[0]))].sort()

/** Device Flow for `repo` → its onComplete result (the background pushAll keeps running). */
async function connect(repo: string) {
  let resolve!: (r: import('../../electron/githubSync').DeviceFlowResult) => void
  const done = new Promise<import('../../electron/githubSync').DeviceFlowResult>((r) => { resolve = r })
  const start = await gh.initiateDeviceFlow(repo, notesDir, resolve)
  expect(start.ok).toBe(true)
  vi.advanceTimersByTime(1000) // the first poll answers with the token
  return done
}

/** Settles background pushes (pushAll after connect, the catch-up's debounced pushes). */
async function settle() {
  await flush()
  vi.advanceTimersByTime(6000)
  await flush()
}

async function freshModule() {
  vi.resetModules()
  gh = await import('../../electron/githubSync')
  gh.setNotesDir(notesDir)
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-origin-gh-'))
  env.userData = path.join(tmp, 'userData')
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(env.userData, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  env.failSettingsWrites = false
  env.failSettingsWritesLeft = 0
  env.offline = false
  repos.clear()
  mutations.length = 0
  treeGets.length = 0
  writeSettings({})
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await freshModule()
})

afterEach(async () => {
  // Let this test's background work (pushAll after a connect, debounced pushes)
  // finish now: `env.userData` is shared, and a module left running would write
  // its journal into the next test's userData.
  await settle()
  await settle()
  vi.useRealTimers()
  fs.rmSync(tmp, { recursive: true, force: true })
})

/**
 * This device: a synced note "mine" + the local-only welcome note, connected to
 * repo A (which holds "a-note") — the first connection adopts A as the origin —
 * then disconnected. Repo B holds "b-note".
 */
async function connectedToAThenDisconnected() {
  writeLocal('mine-1111', files('1111'))
  writeLocal('welcome-9999', files('9999', { localOnly: true }))
  fs.writeFileSync(path.join(notesDir, 'groups.json'), JSON.stringify([{ id: 'ga', name: 'From A' }], null, 2))
  addRepo('notes-a', 101, { 'a-note-2222': files('2222') })
  addRepo('notes-b', 202, { 'b-note-3333': files('3333') })
  const res = await connect('notes-a')
  expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-a' })
  await settle()
  expect(readSettings().syncOrigin).toEqual({ github: { repoId: 101, owner: 'me', repo: 'notes-a' } })
  expect(remoteDirs('notes-a')).toEqual(['a-note-2222', 'mine-1111'])
  expect(localDirs()).toEqual(['a-note-2222', 'mine-1111', 'welcome-9999'])
  gh.disconnectGitHub()
  expect(readSettings().syncOrigin.github.repo).toBe('notes-a') // disconnect keeps the origin
  mutations.length = 0
  treeGets.length = 0
}

describe('GitHub Sync asks before mixing notes from another repo', () => {
  it('A → B: connects without pulling or pushing anything and reports the pending choice', async () => {
    await connectedToAThenDisconnected()
    const res = await connect('notes-b')
    expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-b', pendingOriginChoice: true })
    await settle()
    expect(mutations).toEqual([])
    expect(treeGets).toEqual([])
    expect(localDirs()).toEqual(['a-note-2222', 'mine-1111', 'welcome-9999'])
    const status = gh.getSyncStatus()
    expect(status.connected).toBe(true)
    expect(status.initialPullStatus).toBe('pending')
    expect(status.originChoice).toEqual({ previous: { owner: 'me', repo: 'notes-a' }, next: { owner: 'me', repo: 'notes-b' } })
    expect(readSettings().syncOrigin.github.repo).toBe('notes-a')
  })

  it('A → B "replace": nothing of A reaches B, A\'s notes are in the archive, the local-only note stays', async () => {
    await connectedToAThenDisconnected()
    await connect('notes-b')
    // What main.ts' sync:resolve-origin does for 'replace'.
    const previous = gh.getStoredOriginIdentity()!
    const archive = archiveSyncedNotes({
      notesDir,
      archiveRoot: path.join(env.userData, 'notes-archive'),
      label: identityArchiveLabel(previous),
      origin: previous,
    })
    const res = await gh.resolveOriginChoice('replace', notesDir)
    expect(res.ok).toBe(true)
    await settle()

    expect(mutations.filter((m) => m.includes('mine-1111') || m.includes('a-note-2222') || m.includes('groups.json'))).toEqual([])
    expect(remoteDirs('notes-b')).toEqual(['b-note-3333'])
    expect(localDirs()).toEqual(['b-note-3333', 'welcome-9999'])
    expect(path.basename(archive.archiveDir)).toMatch(/^github-me-notes-a-/)
    expect(fs.readdirSync(path.join(archive.archiveDir, 'notes')).sort()).toEqual(['a-note-2222', 'groups.json', 'mine-1111'])
    expect(readSettings().syncOrigin).toEqual({ github: { repoId: 202, owner: 'me', repo: 'notes-b' } })
    expect(gh.getSyncStatus().originChoice).toBeUndefined()
    expect(gh.getSyncStatus().initialPullStatus).toBe('ok')
  })

  it('A → B "merge": behaves like today\'s connect — B gets the local notes and the device gets B\'s', async () => {
    await connectedToAThenDisconnected()
    await connect('notes-b')
    const res = await gh.resolveOriginChoice('merge', notesDir)
    expect(res.ok).toBe(true)
    await settle()
    expect(remoteDirs('notes-b')).toEqual(['a-note-2222', 'b-note-3333', 'mine-1111'])
    expect(localDirs()).toEqual(['a-note-2222', 'b-note-3333', 'mine-1111', 'welcome-9999'])
    expect(mutations.some((m) => m.includes('welcome-9999'))).toBe(false)
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 202, owner: 'me', repo: 'notes-b' })
  })

  it('"cancel" (disconnect) leaves notes and origin untouched', async () => {
    await connectedToAThenDisconnected()
    await connect('notes-b')
    gh.disconnectGitHub() // what sync:resolve-origin does for 'cancel'
    await settle()
    expect(mutations).toEqual([])
    expect(localDirs()).toEqual(['a-note-2222', 'mine-1111', 'welcome-9999'])
    expect(readSettings().githubSync).toBeUndefined()
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 101, owner: 'me', repo: 'notes-a' })
    expect(gh.getSyncStatus().originChoice).toBeUndefined()
  })

  it('a failed archive leaves the dir intact, pulls nothing and keeps the choice pending', async () => {
    await connectedToAThenDisconnected()
    await connect('notes-b')
    let n = 0
    expect(() => archiveSyncedNotes({
      notesDir,
      archiveRoot: path.join(env.userData, 'notes-archive'),
      label: 'github-me-notes-a',
      fsOps: {
        rename: (from, to) => {
          if (to.includes('notes-archive') && ++n === 2) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
          fs.renameSync(from, to)
        },
      },
    })).toThrow(NotesArchiveError)
    // main.ts returns 'archive-failed' and never calls resolveOriginChoice.
    expect(localDirs()).toEqual(['a-note-2222', 'mine-1111', 'welcome-9999'])
    expect(gh.getOriginChoice()).not.toBeNull()
    const pull = await gh.pullNotes(notesDir)
    expect(pull.incomplete).toBe(true)
    expect(treeGets).toEqual([])
    expect(mutations).toEqual([])
  })

  it('the pending state survives a restart and blocks pull, push, deletes, drain and full push', async () => {
    await connectedToAThenDisconnected()
    await connect('notes-b')
    await freshModule() // restart: state is derived again from settings + disk
    gh.loadSyncSettings()
    expect(gh.getSyncStatus().originChoice?.next.repo).toBe('notes-b')
    expect(gh.isOriginGateBlocked()).toBe(true)

    expect((await gh.pullNotes(notesDir)).incomplete).toBe(true)
    const done = vi.fn()
    const content = fs.readFileSync(path.join(notesDir, 'mine-1111', 'note.md'), 'utf-8')
    gh.schedulePush('mine-1111/note.md', content, undefined, done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(await gh.pushPathsNow(notesDir, ['mine-1111/note.md'])).toEqual({ pushed: 0, errors: [] })
    expect(await gh.pushAllNotes(notesDir)).toEqual({ pushed: 0, errors: [] })
    await gh.scheduleDelete('mine-1111/s1.md')
    await gh.scheduleDeleteDir('a-note-2222')
    await gh.retrySyncJournal(notesDir)
    expect(await gh.migrateRemoteToV2IfNeeded(notesDir)).toBe(false)
    await settle()
    expect(mutations).toEqual([])
    expect(treeGets).toEqual([])
    const journal = JSON.parse(fs.readFileSync(path.join(env.userData, 'sync-state.json'), 'utf-8')).ops ?? {}
    expect(Object.keys(journal)).toEqual([])
  })

  it('a connection switched behind the app (the CLI) is caught at load', async () => {
    await connectedToAThenDisconnected()
    const s = readSettings()
    writeSettings({ ...s, githubSync: { enabled: true, encryptedToken: Buffer.from('tok').toString('base64'), owner: 'me', repo: 'notes-b', lastSync: '2026-11-01T00:00:00.000Z' } })
    await freshModule()
    gh.loadSyncSettings()
    expect(gh.getOriginChoice()).toEqual({ previous: { owner: 'me', repo: 'notes-a' }, next: { owner: 'me', repo: 'notes-b' } })
    await gh.pullNotes(notesDir)
    expect(treeGets).toEqual([])
    // Merging later must not run the deletion rule with the CLI's lastSync for B.
    const res = await gh.resolveOriginChoice('merge', notesDir)
    expect(res.ok).toBe(true)
    await settle()
    expect(localDirs()).toEqual(['a-note-2222', 'b-note-3333', 'mine-1111', 'welcome-9999'])
  })

  it('reconnecting to the same repo does not ask', async () => {
    await connectedToAThenDisconnected()
    const res = await connect('notes-a')
    expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-a' })
    expect(gh.getSyncStatus().originChoice).toBeUndefined()
  })

  it('a renamed repo (same repoId) does not ask, and the origin follows the new name', async () => {
    await connectedToAThenDisconnected()
    const a = repos.get('notes-a')!
    repos.delete('notes-a')
    repos.set('notes-renamed', a)
    const res = await connect('notes-renamed')
    expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-renamed' })
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 101, owner: 'me', repo: 'notes-renamed' })
  })

  it('another repo with no synced notes on disk: no question, the origin moves and the old state is reset', async () => {
    await connectedToAThenDisconnected()
    for (const d of ['mine-1111', 'a-note-2222']) fs.rmSync(path.join(notesDir, d), { recursive: true })
    const res = await connect('notes-b')
    expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-b' })
    await settle()
    expect(readSettings().syncOrigin.github.repoId).toBe(202)
    expect(localDirs()).toEqual(['b-note-3333', 'welcome-9999'])
  })

  it('with NoteFlow Cloud enabled GitHub never asks; only the explicit connect adopts the connected repo', async () => {
    await connectedToAThenDisconnected()
    // A connection switched behind the app (the CLI) with Cloud on: a refresh
    // never asks and never rewrites syncOrigin.github.
    writeSettings({
      ...readSettings(),
      cloudSync: { enabled: true },
      githubSync: { enabled: true, encryptedToken: Buffer.from('tok').toString('base64'), owner: 'me', repo: 'notes-b', repoId: 202 },
    })
    await freshModule()
    gh.loadSyncSettings()
    expect(gh.refreshOriginGate()).toBe('clear')
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 101, owner: 'me', repo: 'notes-a' })
    gh.disconnectGitHub()
    // The user connects B from the app (Device Flow): B becomes the origin.
    const res = await connect('notes-b')
    expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-b' })
    expect(gh.getSyncStatus().originChoice).toBeUndefined()
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 202, owner: 'me', repo: 'notes-b' })
  })

  it('a stale origin (Cloud replaced the notes) asks even for the same repo, labelled with the Cloud account', async () => {
    await connectedToAThenDisconnected()
    // What Cloud's "use only the notes from …" leaves behind.
    const s = readSettings()
    writeSettings({
      ...s,
      syncOrigin: { github: { ...s.syncOrigin.github, stale: true }, cloud: { userId: 'u-b', email: 'b@x.io' } },
    })
    const res = await connect('notes-a')
    expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-a', pendingOriginChoice: true })
    await settle()
    expect(mutations).toEqual([])
    expect(treeGets).toEqual([])
    expect(gh.getOriginChoice()).toEqual({
      previous: { owner: 'me', repo: 'notes-a' },
      next: { owner: 'me', repo: 'notes-a' },
      stale: true,
      staleFrom: { email: 'b@x.io' },
    })
    // Merge adopts the same repo again (with the reset) and clears the mark.
    const merged = await gh.resolveOriginChoice('merge', notesDir)
    expect(merged.ok).toBe(true)
    await settle()
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 101, owner: 'me', repo: 'notes-a' })
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: 'u-b', email: 'b@x.io' }) // merge marks nothing
    expect(gh.getOriginChoice()).toBeNull()
  })

  it('a stale origin with no synced notes left is adopted again without asking', async () => {
    await connectedToAThenDisconnected()
    for (const d of ['mine-1111', 'a-note-2222']) fs.rmSync(path.join(notesDir, d), { recursive: true })
    const s = readSettings()
    writeSettings({ ...s, syncOrigin: { github: { ...s.syncOrigin.github, stale: true } } })
    const res = await connect('notes-a')
    expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-a' })
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 101, owner: 'me', repo: 'notes-a' })
  })

  it('"replace" marks the NoteFlow Cloud origin stale in the same write; "merge" does not', async () => {
    await connectedToAThenDisconnected()
    writeSettings({ ...readSettings(), syncOrigin: { ...readSettings().syncOrigin, cloud: { userId: 'u-a', email: 'a@x.io' } } })
    await connect('notes-b')
    archiveSyncedNotes({ notesDir, archiveRoot: path.join(env.userData, 'notes-archive'), label: 'github-me-notes-a' })
    expect((await gh.resolveOriginChoice('replace', notesDir)).ok).toBe(true)
    await settle()
    expect(readSettings().syncOrigin).toEqual({
      github: { repoId: 202, owner: 'me', repo: 'notes-b' },
      cloud: { userId: 'u-a', email: 'a@x.io', stale: true },
    })
  })

  it('the explicit connect with Cloud on clears a stale mark of the same repo', async () => {
    await connectedToAThenDisconnected()
    const s = readSettings()
    writeSettings({ ...s, cloudSync: { enabled: true }, syncOrigin: { github: { ...s.syncOrigin.github, stale: true } } })
    const res = await connect('notes-a')
    expect(res).toEqual({ ok: true, owner: 'me', repo: 'notes-a' })
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 101, owner: 'me', repo: 'notes-a' })
  })

  it('an origin that cannot be recorded keeps the gate closed (changed-empty and no-origin), with no requests', async () => {
    await connectedToAThenDisconnected()
    for (const d of ['mine-1111', 'a-note-2222']) fs.rmSync(path.join(notesDir, d), { recursive: true })
    // The CLI left the app connected to B (with B's lastSync); no synced notes on disk.
    writeSettings({
      ...readSettings(),
      githubSync: { enabled: true, encryptedToken: Buffer.from('tok').toString('base64'), owner: 'me', repo: 'notes-b', repoId: 202, lastSync: '2026-11-01T00:00:00.000Z' },
    })
    env.failSettingsWrites = true
    await freshModule()
    gh.loadSyncSettings()
    expect(gh.isOriginGateBlocked()).toBe(true)
    expect(gh.getSyncStatus().originChoice).toBeUndefined() // nothing to ask: just blocked
    expect((await gh.pullNotes(notesDir)).incomplete).toBe(true)
    expect(treeGets).toEqual([])
    expect(readSettings().syncOrigin.github.repo).toBe('notes-a')
    // Once settings.json is writable again the next evaluation adopts B and syncs.
    env.failSettingsWrites = false
    const pull = await gh.pullNotes(notesDir)
    expect(pull.errors).toEqual([])
    expect(treeGets).toEqual(['notes-b'])
    expect(readSettings().syncOrigin.github).toEqual({ repoId: 202, owner: 'me', repo: 'notes-b' })
    expect(readSettings().githubSync.lastSync).not.toBe('2026-11-01T00:00:00.000Z') // B's stale lastSync was dropped
    expect(localDirs()).toEqual(['b-note-3333', 'welcome-9999'])

    // no-origin: a live connection from before this feature, origin never recorded.
    const s = readSettings()
    delete s.syncOrigin
    writeSettings(s)
    treeGets.length = 0
    env.failSettingsWrites = true
    await freshModule()
    gh.loadSyncSettings()
    expect(gh.isOriginGateBlocked()).toBe(true)
    expect((await gh.pullNotes(notesDir)).incomplete).toBe(true)
    expect(treeGets).toEqual([])
    expect(mutations).toEqual([])
  })

  it('a merge whose first settings write fails never leaves the old lastSync next to the new origin', async () => {
    await connectedToAThenDisconnected()
    // The CLI left the app connected to B, with B's (old) lastSync: every local
    // note is "older than lastSync" and absent from B.
    const OLD_LAST_SYNC = '2026-11-01T00:00:00.000Z'
    writeSettings({
      ...readSettings(),
      githubSync: { enabled: true, encryptedToken: Buffer.from('tok').toString('base64'), owner: 'me', repo: 'notes-b', repoId: 202, lastSync: OLD_LAST_SYNC },
    })
    await freshModule()
    gh.loadSyncSettings()
    expect(gh.getOriginChoice()?.next.repo).toBe('notes-b')

    env.failSettingsWritesLeft = 1 // first write fails (EPERM), then writes work
    expect(await gh.resolveOriginChoice('merge', notesDir)).toEqual({ ok: false, error: 'settings-unwritable' })
    expect(readSettings().syncOrigin.github.repo).toBe('notes-a')
    expect(gh.getOriginChoice()).not.toBeNull()

    env.offline = true // the retry adopts B, but its pull fails
    const retry = await gh.resolveOriginChoice('merge', notesDir)
    expect(retry.ok && retry.pull.errors.length).toBeGreaterThan(0)
    expect(readSettings().syncOrigin.github.repo).toBe('notes-b')
    expect(readSettings().githubSync.lastSync).toBeUndefined()
    expect(readSettings().githubSync.encryptedToken).toBeTruthy()

    // Restart, online: same identity, and no deletion rule armed with B's old lastSync.
    env.offline = false
    await settle()
    await freshModule()
    gh.loadSyncSettings()
    const pull = await gh.pullNotes(notesDir)
    expect(pull.errors).toEqual([])
    expect(pull.deleted).toBe(0)
    expect(localDirs()).toEqual(['a-note-2222', 'b-note-3333', 'mine-1111', 'welcome-9999'])
  })

  it('a sync-state.json that cannot be reset blocks the gate and keeps the old origin', async () => {
    await connectedToAThenDisconnected()
    for (const d of ['mine-1111', 'a-note-2222']) fs.rmSync(path.join(notesDir, d), { recursive: true })
    writeSettings({
      ...readSettings(),
      githubSync: { enabled: true, encryptedToken: Buffer.from('tok').toString('base64'), owner: 'me', repo: 'notes-b', repoId: 202 },
    })
    // sync-state.json can't be written (a directory in its place: EISDIR — like an antivirus lock).
    const statePath = path.join(env.userData, 'sync-state.json')
    fs.rmSync(statePath, { force: true })
    fs.mkdirSync(statePath)
    await freshModule()
    gh.loadSyncSettings()
    expect(gh.isOriginGateBlocked()).toBe(true)
    expect(readSettings().syncOrigin.github.repo).toBe('notes-a')
    expect((await gh.pullNotes(notesDir)).incomplete).toBe(true)
    expect(treeGets).toEqual([])
    fs.rmdirSync(statePath)
  })

  it('an unreadable settings.json blocks syncing (fail-closed) without asking', async () => {
    await connectedToAThenDisconnected()
    await connect('notes-a')
    await settle()
    mutations.length = 0
    treeGets.length = 0
    fs.writeFileSync(settingsPath(), '{ corrupt')
    expect(gh.refreshOriginGate()).toBe('unreadable')
    expect((await gh.pullNotes(notesDir)).incomplete).toBe(true)
    expect(treeGets).toEqual([])
    expect(gh.getSyncStatus().originChoice).toBeUndefined()
  })
})
