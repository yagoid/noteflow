// Local-only notes (the first-run welcome note) through electron/githubSync.ts
// against a SIMULATED GitHub (in-memory repo behind a fake `https.request`):
// never pushed (debounced, batch, catch-up, full push), never journaled, never
// deleted remotely, and never removed locally by the pull's deletion rule
// although the repo doesn't have them. Electron is mocked; no network.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'

// ── Simulated GitHub ──────────────────────────────────────────────────────────

const blobSha = (content: string) => {
  const body = Buffer.from(content, 'utf-8')
  return createHash('sha1').update(`blob ${body.length}\0`, 'utf-8').update(body).digest('hex')
}

const remote = new Map<string, string>() // path → content
const requests: string[] = [] // 'METHOD path' of every mutation (PUT / DELETE)

function answer(method: string, url: string, body: Record<string, unknown> | undefined): [number, unknown] {
  const base = '/repos/me/notes'
  if (method === 'GET' && url === base) return [200, { default_branch: 'main' }]
  if (method === 'GET' && url.startsWith(`${base}/git/trees/`)) {
    return [200, { truncated: false, tree: [...remote].map(([p, c]) => ({ path: p, type: 'blob', sha: blobSha(c) })) }]
  }
  const prefix = `${base}/contents/`
  if (!url.startsWith(prefix)) return [404, { message: 'Not Found' }]
  const rel = url.slice(prefix.length).split('/').map(decodeURIComponent).join('/')
  const current = remote.get(rel)
  if (method === 'GET') {
    if (current === undefined) return [404, { message: 'Not Found' }]
    return [200, { sha: blobSha(current), size: Buffer.byteLength(current), encoding: 'base64', content: Buffer.from(current).toString('base64') }]
  }
  if (method === 'PUT') {
    requests.push(`PUT ${rel}`)
    const content = Buffer.from(body!.content as string, 'base64').toString('utf-8')
    remote.set(rel, content)
    return [current === undefined ? 201 : 200, { content: { sha: blobSha(content) } }]
  }
  if (method === 'DELETE') {
    requests.push(`DELETE ${rel}`)
    if (current === undefined) return [404, { message: 'Not Found' }]
    remote.delete(rel)
    return [200, { commit: {} }]
  }
  return [404, { message: 'Not Found' }]
}

function fakeRequest(opts: { method: string; path: string }, cb: (res: EventEmitter & { statusCode: number }) => void) {
  const req = new EventEmitter() as EventEmitter & { setTimeout: () => void; write: (s: string) => void; end: () => void; destroy: () => void }
  let payload = ''
  req.setTimeout = () => {}
  req.destroy = () => {}
  req.write = (s: string) => { payload += s }
  req.end = () => {
    setImmediate(() => {
      const [status, json] = answer(opts.method, opts.path, payload ? JSON.parse(payload) : undefined)
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

const env = { userData: '' }
vi.mock('electron', () => ({
  app: { getPath: () => env.userData },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
}))

// ── Fixture ───────────────────────────────────────────────────────────────────

const LAST_SYNC = '2026-10-05T12:00:00.000Z'
const OLD = '2026-10-01T10:00:00.000Z' // before LAST_SYNC
const NEW = '2026-10-10T10:00:00.000Z' // after LAST_SYNC

const WELCOME = 'welcome-to-noteflow-aaaa1111'
const SYNCED = 'synced-bbbb2222'

function files(id: string, updated: string, opts: { localOnly?: boolean } = {}): Record<string, string> {
  const note: DiskNote = {
    id,
    title: id,
    tags: [],
    created: OLD,
    updated,
    ...(opts.localOnly ? { localOnly: true } : {}),
    sections: [{ id: 's1', name: 'Main', content: `body of ${id}` }],
  }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}

let tmp: string
let notesDir: string
let gh: typeof import('../../electron/githubSync')
let lo: typeof import('../../electron/localOnlyNotes')

const flush = async () => {
  for (let i = 0; i < 300; i++) await new Promise((r) => setImmediate(r))
}

function writeLocal(dir: string, f: Record<string, string>) {
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [name, c] of Object.entries(f)) fs.writeFileSync(path.join(notesDir, dir, name), c, 'utf-8')
}
function putRemote(dir: string, f: Record<string, string>) {
  for (const [name, c] of Object.entries(f)) remote.set(`${dir}/${name}`, c)
}
const journal = (): Record<string, unknown> => {
  try {
    return JSON.parse(fs.readFileSync(path.join(env.userData, 'sync-state.json'), 'utf-8')).ops ?? {}
  } catch {
    return {}
  }
}
const touchesWelcome = (entries: string[]) => entries.filter((e) => e.includes(WELCOME))

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-localonly-sync-'))
  env.userData = path.join(tmp, 'userData')
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(env.userData, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  remote.clear()
  requests.length = 0
  fs.writeFileSync(
    path.join(env.userData, 'settings.json'),
    JSON.stringify({
      githubSync: { enabled: true, encryptedToken: Buffer.from('tok').toString('base64'), owner: 'me', repo: 'notes', lastSync: LAST_SYNC },
    }),
  )
  remote.set('.noteflow-format', '2\n') // remote is v2 → the pull's deletion rule is armed
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.resetModules()
  gh = await import('../../electron/githubSync')
  lo = await import('../../electron/localOnlyNotes') // same module instance githubSync uses
  gh.setNotesDir(notesDir)
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('GitHub Sync never touches a local-only note', () => {
  it('the pull deletion rule keeps it although the repo lacks it (an ordinary note in the same spot is deleted)', async () => {
    writeLocal(WELCOME, files('aaaa1111', OLD, { localOnly: true }))
    writeLocal('gone-cccc3333', files('cccc3333', OLD)) // deleted elsewhere: absent remotely, older than lastSync
    writeLocal(SYNCED, files('bbbb2222', OLD))
    putRemote(SYNCED, files('bbbb2222', OLD))

    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(fs.existsSync(path.join(notesDir, 'gone-cccc3333'))).toBe(false) // the rule did run
    expect(fs.existsSync(path.join(notesDir, WELCOME, 'note.md'))).toBe(true)
  })

  it('the first pull catch-up uploads a new ordinary note but not the local-only one', async () => {
    writeLocal(WELCOME, files('aaaa1111', NEW, { localOnly: true }))
    writeLocal('fresh-dddd4444', files('dddd4444', NEW))

    await gh.pullNotes(notesDir)
    vi.advanceTimersByTime(6000)
    await flush()

    expect(requests).toContain('PUT fresh-dddd4444/note.md')
    expect(touchesWelcome(requests)).toEqual([])
    expect(touchesWelcome(Object.keys(journal()))).toEqual([])
  })

  it('debounced and batch pushes skip it without journaling', async () => {
    await gh.pullNotes(notesDir) // opens the push gate
    writeLocal(WELCOME, files('aaaa1111', NEW, { localOnly: true }))
    writeLocal(SYNCED, files('bbbb2222', NEW))

    const done = vi.fn()
    for (const [f, c] of Object.entries(files('aaaa1111', NEW, { localOnly: true }))) gh.schedulePush(`${WELCOME}/${f}`, c, undefined, done)
    expect(done).toHaveBeenCalledTimes(2) // settled at once: nothing in flight
    expect(touchesWelcome(Object.keys(journal()))).toEqual([])

    const res = await gh.pushPathsNow(notesDir, [`${WELCOME}/note.md`, `${WELCOME}/s1.md`, `${SYNCED}/note.md`])
    expect(res).toEqual({ pushed: 1, errors: [] })
    vi.advanceTimersByTime(6000)
    await flush()
    expect(requests).toEqual(['PUT synced-bbbb2222/note.md'])
  })

  it('a full push (pushAllNotes) leaves it out', async () => {
    writeLocal(WELCOME, files('aaaa1111', NEW, { localOnly: true }))
    writeLocal(SYNCED, files('bbbb2222', NEW))
    const res = await gh.pushAllNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(requests).toContain(`PUT ${SYNCED}/note.md`)
    expect(touchesWelcome(requests)).toEqual([])
  })

  it('deleting it (folder already gone, section dropped) never reaches the remote nor the journal', async () => {
    await gh.pullNotes(notesDir)
    writeLocal(WELCOME, files('aaaa1111', NEW, { localOnly: true }))
    lo.primeLocalOnlyDirs(notesDir) // what main.ts does at startup

    await gh.scheduleDelete(`${WELCOME}/s1.md`)
    fs.rmSync(path.join(notesDir, WELCOME), { recursive: true, force: true }) // applyNoteDelete removes it first
    await gh.scheduleDeleteDir(WELCOME)
    await flush()

    expect(requests).toEqual([])
    expect(touchesWelcome(Object.keys(journal()))).toEqual([])
  })
})
