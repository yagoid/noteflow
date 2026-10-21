// QA B3 end to end through electron/githubSync.ts against a SIMULATED GitHub
// (in-memory repo behind a fake `https.request`, Contents + Git Trees API
// semantics incl. the sha concurrency token): another device updates a note on
// GitHub, this device edits it WITHOUT pulling, and its push used to overwrite
// the remote edit everywhere. Now the push is held back (op stale, a pull is
// requested), and the pull applies the remote version and keeps the local one
// as a conflict copy. Electron is mocked (userData → a temp dir); no network.
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
const puts: string[] = [] // paths successfully PUT (order)

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
    return [200, { sha: blobSha(current), content: Buffer.from(current).toString('base64') }]
  }
  if (method === 'PUT') {
    const sha = body?.sha as string | undefined
    if (current !== undefined && sha === undefined) return [422, { message: 'Invalid request. "sha" wasn\'t supplied.' }]
    if (current !== undefined && sha !== blobSha(current)) return [409, { message: `${rel} is at ${blobSha(current)} but expected ${sha}` }]
    const content = Buffer.from(body!.content as string, 'base64').toString('utf-8')
    remote.set(rel, content)
    puts.push(rel)
    return [current === undefined ? 201 : 200, { content: { sha: blobSha(content) } }]
  }
  if (method === 'DELETE') {
    if (current === undefined) return [404, { message: 'Not Found' }]
    if (body?.sha !== blobSha(current)) return [409, { message: `${rel} is at ${blobSha(current)} but expected ${String(body?.sha)}` }]
    remote.delete(rel)
    return [200, { commit: {} }]
  }
  return [404, { message: 'Not Found' }]
}

function fakeRequest(opts: { method: string; path: string }, cb: (res: EventEmitter & { statusCode: number }) => void) {
  const req = new EventEmitter() as EventEmitter & {
    setTimeout: () => void
    write: (s: string) => void
    end: () => void
    destroy: () => void
  }
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

const DIR = 'groceries-abc12345'
const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'
const T3 = '2026-10-03T10:00:00.000Z'
const T4 = '2026-10-04T10:00:00.000Z'

function noteFiles(updated: string, s1: string): Record<string, string> {
  const note: DiskNote = {
    id: 'abc12345',
    title: 'Groceries',
    tags: [],
    created: T1,
    updated,
    sections: [{ id: 's1', name: 'Main', content: s1 }],
  }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}

function noteFilesTitled(updated: string, s1: string, title: string): Record<string, string> {
  const note: DiskNote = { id: 'abc12345', title, tags: [], created: T1, updated, sections: [{ id: 's1', name: 'Main', content: s1 }] }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}

let tmp: string
let notesDir: string
let gh: typeof import('../../electron/githubSync')

const flush = async () => {
  for (let i = 0; i < 300; i++) await new Promise((r) => setImmediate(r))
}

function writeLocal(files: Record<string, string>, dir = DIR) {
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(notesDir, dir, f), c, 'utf-8')
}
const readLocal = (rel: string) => fs.readFileSync(path.join(notesDir, rel), 'utf-8')
const syncState = () => JSON.parse(fs.readFileSync(path.join(env.userData, 'sync-state.json'), 'utf-8'))

function writeSettings(extra: Record<string, unknown> = {}) {
  fs.writeFileSync(
    path.join(env.userData, 'settings.json'),
    JSON.stringify({
      githubSync: {
        enabled: true,
        encryptedToken: Buffer.from('tok').toString('base64'),
        owner: 'me',
        repo: 'notes',
        lastSync: '2026-10-01T12:00:00.000Z', // after T1: the first pull's catch-up has nothing to re-push
      },
      ...extra,
    }),
  )
}

/** Both sides hold the note at T1 and this device has pulled it once (bases cached). */
async function syncedStart() {
  const files = noteFiles(T1, 'milk')
  for (const [f, c] of Object.entries(files)) remote.set(`${DIR}/${f}`, c)
  remote.set('.noteflow-format', '2\n')
  writeLocal(files)
  const res = await gh.pullNotes(notesDir)
  expect(res.errors).toEqual([])
  expect(gh.getSyncStatus().initialPullStatus).toBe('ok')
}

/** "Another device" uploads a newer version of the note (anchor + section). */
function remoteEdit(s1: string) {
  for (const [f, c] of Object.entries(noteFiles(T2, s1))) remote.set(`${DIR}/${f}`, c)
}

/** Local edit as main.ts applyNoteWrite does it: write to disk, then schedulePush per file. */
function localEdit(s1: string, updated = T3) {
  const files = noteFiles(updated, s1)
  writeLocal(files)
  for (const [f, c] of Object.entries(files)) gh.schedulePush(`${DIR}/${f}`, c)
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-gh-b3-'))
  env.userData = path.join(tmp, 'userData')
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(env.userData, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  remote.clear()
  puts.length = 0
  writeSettings()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.resetModules()
  gh = await import('../../electron/githubSync')
  gh.setNotesDir(notesDir)
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('B3: a push never overwrites a remote edit this device did not pull', () => {
  it('debounced push held back (stale, pull requested) → the pull keeps the remote version and a conflict copy of the local one', async () => {
    await syncedStart()
    const onConflict = vi.fn()
    gh.onRemoteConflict(onConflict)

    remoteEdit('milk, eggs (other device)')
    localEdit('milk, bread (this device)')
    vi.advanceTimersByTime(5000) // debounce fires
    await flush()

    // Nothing was overwritten on GitHub; the ops stay journaled as stale; a pull was asked for.
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T2, 'milk, eggs (other device)')['s1.md'])
    expect(puts).toEqual([])
    const ops = syncState().ops
    expect(ops[`${DIR}/note.md`]).toMatchObject({ op: 'upsert', stale: true })
    expect(ops[`${DIR}/s1.md`]).toMatchObject({ op: 'upsert', stale: true })
    expect(onConflict).toHaveBeenCalled()
    expect(gh.getSyncStatus().error).toBeUndefined() // not an error

    // The drain skips stale ops (would be held back again).
    await gh.retrySyncJournal(notesDir)
    expect(puts).toEqual([])

    // The pull resolves: remote version applied, local version kept as a new note.
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe(noteFiles(T2, 'milk, eggs (other device)')['s1.md'])
    const copyDirs = fs.readdirSync(notesDir).filter((d) => d !== DIR)
    expect(copyDirs).toHaveLength(1)
    const copyAnchor = readLocal(`${copyDirs[0]}/note.md`)
    expect(copyAnchor).toMatch(/^title: "?Groceries \(conflict copy \d{4}-\d\d-\d\d \d\d:\d\d\)"?$/m)
    expect(readLocal(`${copyDirs[0]}/s1.md`)).toBe(noteFiles(T3, 'milk, bread (this device)')['s1.md'])
    expect(res.updatedFiles).toEqual(expect.arrayContaining([path.join(notesDir, DIR), path.join(notesDir, copyDirs[0])]))
    expect(gh.getSyncStatus().conflictCopies).toMatchObject({ count: 1 })
    const after = syncState().ops
    expect(Object.keys(after).filter((k) => k.startsWith(`${DIR}/`))).toEqual([]) // settled
    expect(Object.keys(after).filter((k) => k.startsWith(`${copyDirs[0]}/`)).length).toBe(2) // copy journaled

    // The copy uploads through the normal (conditional) path: new files → created.
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${copyDirs[0]}/s1.md`)).toBe(readLocal(`${copyDirs[0]}/s1.md`))
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T2, 'milk, eggs (other device)')['s1.md'])

    gh.dismissConflictCopies()
    expect(gh.getSyncStatus().conflictCopies).toBeUndefined()
  })

  it('a pull between the remote edit and the push ("local strictly newer") resolves it too — no overwrite afterwards', async () => {
    await syncedStart()
    remoteEdit('remote')
    localEdit('local') // timers armed, not fired
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe(noteFiles(T2, 'remote')['s1.md'])
    expect(fs.readdirSync(notesDir).filter((d) => d !== DIR)).toHaveLength(1) // conflict copy
    vi.advanceTimersByTime(5000) // the original timers were cancelled by the pull
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T2, 'remote')['s1.md'])
    expect(puts.every((p) => !p.startsWith(`${DIR}/`))).toBe(true)
  })

  it('no remote change → the push lands as before, and the next push is not a conflict (base = own push)', async () => {
    await syncedStart()
    localEdit('one')
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T3, 'one')['s1.md'])
    localEdit('two', T4)
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T4, 'two')['s1.md'])
    expect(remote.get(`${DIR}/note.md`)).toBe(noteFiles(T4, 'two')['note.md'])
    expect(syncState().ops).toEqual({})
  })

  it('an own push landing while a pull runs never turns into a spurious conflict later', async () => {
    // Another note, listed BEFORE ours and changed remotely: the pull spends a
    // few round-trips on it, so this device's PUTs land after the tree listing
    // but before the pull reaches our note (whose listed blobs are then older
    // than the bases the PUTs cached).
    const OTHER = 'aaa-other-1234'
    const other = (u: string, s: string) => {
      const f = noteFiles(u, s)
      f['note.md'] = f['note.md'].replace('id: abc12345', 'id: other123')
      return f
    }
    for (const [f, c] of Object.entries(other(T1, 'x'))) remote.set(`${OTHER}/${f}`, c)
    writeLocal(other(T1, 'x'), OTHER)
    await syncedStart()
    for (const [f, c] of Object.entries(other(T2, 'y'))) remote.set(`${OTHER}/${f}`, c)
    localEdit('one')
    vi.advanceTimersByTime(5000) // the pushes start…
    const pull = gh.pullNotes(notesDir) // …while a pull lists the (older) tree
    await flush()
    expect((await pull).errors).toEqual([])
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T3, 'one')['s1.md'])
    localEdit('two', T4)
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T4, 'two')['s1.md'])
    expect(remote.get(`${DIR}/note.md`)).toBe(noteFiles(T4, 'two')['note.md'])
    expect(syncState().ops).toEqual({})
    expect(fs.readdirSync(notesDir).sort()).toEqual([OTHER, DIR].sort()) // no conflict copy
  })

  it('a remote-only change whose `updated` is NOT newer (clock skew / web-UI edit) is fast-forwarded, never cached and overwritten', async () => {
    await syncedStart()
    // The other device (clock behind) renames the note; `updated` stays T1, body unchanged.
    remote.set(`${DIR}/note.md`, noteFilesTitled(T1, 'milk', 'Groceries RENAMED')['note.md'])
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    // Applied although the timestamps say "not newer" — no copy (nothing local changed).
    expect(readLocal(`${DIR}/note.md`)).toBe(noteFilesTitled(T1, 'milk', 'Groceries RENAMED')['note.md'])
    expect(fs.readdirSync(notesDir)).toEqual([DIR])
    expect(gh.getSyncStatus().conflictCopies).toBeUndefined()
    // The next local edit (made on what the editor now shows) keeps the rename on GitHub.
    const edited = noteFilesTitled(T3, 'milk, bread', 'Groceries RENAMED')
    writeLocal(edited)
    for (const [f, c] of Object.entries(edited)) gh.schedulePush(`${DIR}/${f}`, c)
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/note.md`)).toBe(edited['note.md'])
    expect(remote.get(`${DIR}/s1.md`)).toBe(edited['s1.md'])
    expect(syncState().ops).toEqual({})
  })

  it('conflictCopied dedupe is per op: an edit made after a half-failed apply still gets its copy', async () => {
    const two = (u: string, a: string, b: string) =>
      serializeNoteFolder(
        { id: 'abc12345', title: 'G', tags: [], created: T1, updated: u, sections: [{ id: 's1', name: 'A', content: a }, { id: 's2', name: 'B', content: b }] },
        { preserveUpdated: true },
      ).files
    for (const [f, c] of Object.entries(two(T1, 'a', 'b'))) remote.set(`${DIR}/${f}`, c)
    remote.set('.noteflow-format', '2\n')
    writeLocal(two(T1, 'a', 'b'))
    await gh.pullNotes(notesDir)
    // Both sides edit s1; this device's edit is journaled (timers armed).
    for (const [f, c] of Object.entries(two(T2, 'a-remote', 'b'))) remote.set(`${DIR}/${f}`, c)
    const loc = two(T3, 'a-local', 'b')
    writeLocal(loc)
    for (const [f, c] of Object.entries(loc)) gh.schedulePush(`${DIR}/${f}`, c)
    // The apply fails halfway (s1.md locked) AFTER the copy was written.
    const s1 = path.join(notesDir, DIR, 's1.md')
    fs.chmodSync(s1, 0o444)
    const r1 = await gh.pullNotes(notesDir)
    fs.chmodSync(s1, 0o666)
    expect(r1.errors).toHaveLength(1)
    // The user now edits s2: a new edit, never copied.
    const loc2 = two(T4, 'a-local', 'b-NEW-EDIT')
    writeLocal(loc2)
    for (const [f, c] of Object.entries(loc2)) if (f !== 's1.md') gh.schedulePush(`${DIR}/${f}`, c)
    const r2 = await gh.pullNotes(notesDir)
    expect(r2.errors).toEqual([])
    // The folder now holds the remote version — the new edit lives in a conflict copy.
    expect(readLocal(`${DIR}/s2.md`)).toBe(two(T2, 'a-remote', 'b')['s2.md'])
    const copies = fs.readdirSync(notesDir).filter((d) => d !== DIR)
    const inCopies = copies.some((d) => fs.readdirSync(path.join(notesDir, d)).some((f) => readLocal(`${d}/${f}`).includes('b-NEW-EDIT')))
    expect(inCopies).toBe(true)
  })

  it('with NoteFlow Cloud enabled GitHub is a write-only mirror: uploads stay unconditional (historical)', async () => {
    await syncedStart()
    remoteEdit('remote')
    writeSettings({ cloudSync: { enabled: true } })
    writeLocal(noteFiles(T3, 'local'))
    await gh.pushPathsNow(notesDir, [`${DIR}/note.md`, `${DIR}/s1.md`])
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T3, 'local')['s1.md'])
  })

  it('section delete of a section changed on GitHub is held back (stale delete)', async () => {
    await syncedStart()
    remoteEdit('remote')
    await gh.scheduleDelete(`${DIR}/s1.md`)
    expect(remote.has(`${DIR}/s1.md`)).toBe(true)
    expect(syncState().ops[`${DIR}/s1.md`]).toMatchObject({ op: 'delete', stale: true })
  })

  it('note deletion over a remote edit deletes nothing; the next pull downloads the note again', async () => {
    await syncedStart()
    remoteEdit('remote')
    fs.rmSync(path.join(notesDir, DIR), { recursive: true, force: true })
    await gh.scheduleDeleteDir(DIR)
    expect(remote.has(`${DIR}/note.md`)).toBe(true)
    expect(remote.has(`${DIR}/s1.md`)).toBe(true)
    expect(syncState().ops[DIR]).toBeUndefined() // completed, never retried
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe(noteFiles(T2, 'remote')['s1.md'])
  })

  it('note deletion without remote changes deletes the whole folder', async () => {
    await syncedStart()
    fs.rmSync(path.join(notesDir, DIR), { recursive: true, force: true })
    await gh.scheduleDeleteDir(DIR)
    expect([...remote.keys()].filter((k) => k.startsWith(`${DIR}/`))).toEqual([])
  })
})
