// QA B3 end to end through electron/githubSync.ts against a SIMULATED GitHub
// (in-memory repo behind a fake `https.request`, Contents + Git Trees API
// semantics incl. the sha concurrency token): another device updates a note on
// GitHub, this device edits it WITHOUT pulling, and its push used to overwrite
// the remote edit everywhere. Now the push is held back (op stale, a pull is
// requested), and the pull MERGES the folder file by file (line merge of the
// sections both sides changed — diff3 with the base blob fetched by sha —,
// both versions between ⚠️ markers where the same lines changed; a conflict
// copy only where it can't merge). Electron is mocked (userData → a temp dir); no network.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'
import { mergeSectionText } from '../../electron/cloudSyncLogic'

// ── Simulated GitHub ──────────────────────────────────────────────────────────

const blobSha = (content: string) => {
  const body = Buffer.from(content, 'utf-8')
  return createHash('sha1').update(`blob ${body.length}\0`, 'utf-8').update(body).digest('hex')
}

const remote = new Map<string, string>() // path → content
const puts: string[] = [] // paths successfully PUT (order)
const blobs = new Map<string, string>() // every blob the repo ever held: sha → content (git objects are immutable)
const blobGets: string[] = []
const fake = { failDeletes: false }

function answer(method: string, url: string, body: Record<string, unknown> | undefined): [number, unknown] {
  const base = '/repos/me/notes'
  for (const c of remote.values()) blobs.set(blobSha(c), c)
  if (method === 'GET' && url === base) return [200, { default_branch: 'main' }]
  if (method === 'GET' && url.startsWith(`${base}/git/blobs/`)) {
    const sha = url.slice(`${base}/git/blobs/`.length)
    blobGets.push(sha)
    const c = blobs.get(sha)
    return c === undefined ? [404, { message: 'Not Found' }] : [200, { sha, encoding: 'base64', content: Buffer.from(c).toString('base64') }]
  }
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
    if (fake.failDeletes) return [500, { message: 'Server Error' }]
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
  blobs.clear()
  blobGets.length = 0
  fake.failDeletes = false
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
  it('debounced push held back (stale, pull requested) → the pull merges: both versions in the note between markers, no copy', async () => {
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

    // The pull resolves: the same line changed on both sides → both versions
    // in the note between markers (diff3 against the base blob, fetched by sha).
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    const merged = mergeSectionText(
      noteFiles(T1, 'milk')['s1.md'],
      noteFiles(T3, 'milk, bread (this device)')['s1.md'],
      noteFiles(T2, 'milk, eggs (other device)')['s1.md'],
    )
    expect(merged.conflicts).toBe(1)
    expect(readLocal(`${DIR}/s1.md`)).toBe(merged.content)
    expect(readLocal(`${DIR}/s1.md`)).toContain('> ⚠️ Sync conflict — version already synced:')
    expect(blobGets).toContain(blobSha(noteFiles(T1, 'milk')['s1.md']))
    expect(fs.readdirSync(notesDir)).toEqual([DIR]) // no conflict copy
    expect(gh.getSyncStatus().conflictCopies).toBeUndefined()
    expect(gh.getSyncStatus().conflictMerges).toMatchObject({ count: 1, titles: ['Groceries'] })
    // The merged files are journaled for upload (on top of the remote shas).
    const after = syncState().ops
    expect(Object.keys(after).filter((k) => k.startsWith(`${DIR}/`)).sort()).toEqual([`${DIR}/note.md`, `${DIR}/s1.md`])
    expect(Object.values(after).every((o) => !(o as { stale?: boolean }).stale)).toBe(true)

    // They go up through the normal (conditional) path: accepted (base = remote sha).
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(merged.content)
    expect(remote.get(`${DIR}/note.md`)).toBe(readLocal(`${DIR}/note.md`))
    expect(syncState().ops).toEqual({})

    gh.dismissConflictCopies()
    expect(gh.getSyncStatus().conflictMerges).toBeUndefined()
  })

  it('the trivial case: a line appended here + a remote change elsewhere → ONE merged note, no markers, no copy', async () => {
    await syncedStart()
    // Base 'milk\nflour'; the other device edits the first line, this one appends.
    const v1 = noteFiles(T1, 'milk\nflour')
    for (const [f, c] of Object.entries(v1)) remote.set(`${DIR}/${f}`, c)
    writeLocal(v1)
    await gh.pullNotes(notesDir)
    for (const [f, c] of Object.entries(noteFiles(T2, 'MILK\nflour'))) remote.set(`${DIR}/${f}`, c)
    localEdit('milk\nflour\nbread')
    vi.advanceTimersByTime(5000)
    await flush()
    expect(puts).toEqual([]) // held back
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe(noteFiles(T3, 'MILK\nflour\nbread')['s1.md'])
    expect(fs.readdirSync(notesDir)).toEqual([DIR])
    expect(gh.getSyncStatus().conflictMerges).toBeUndefined()
    expect(gh.getSyncStatus().conflictCopies).toBeUndefined()
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T3, 'MILK\nflour\nbread')['s1.md'])
    expect(syncState().ops).toEqual({})
  })

  it('the 2026-11-06 case: the local file already holds the remote change (written by another client) + one more line', async () => {
    await syncedStart()
    for (const [f, c] of Object.entries(noteFiles(T2, 'milk\neggs'))) remote.set(`${DIR}/${f}`, c)
    // Something else wrote the remote section here; this device's base stays at 'milk'.
    localEdit('milk\neggs\nbread')
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe(noteFiles(T3, 'milk\neggs\nbread')['s1.md'])
    expect(fs.readdirSync(notesDir)).toEqual([DIR])
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(noteFiles(T3, 'milk\neggs\nbread')['s1.md'])
  })

  it('base blob unavailable → two-way union (nothing lost, no copy)', async () => {
    await syncedStart()
    remoteEdit('remote')
    localEdit('local')
    blobs.clear()
    const realGet = blobs.get.bind(blobs)
    blobs.get = () => undefined
    const res = await gh.pullNotes(notesDir)
    blobs.get = realGet
    expect(res.errors).toEqual([])
    const s1 = readLocal(`${DIR}/s1.md`)
    expect(s1).toContain('local')
    expect(s1).toContain('remote')
    expect(fs.readdirSync(notesDir)).toEqual([DIR])
  })

  for (const variant of ['journaled delete (failed)', 'unjournaled (the CLI deleted it, app closed)'] as const) {
    it(`a section deleted here (${variant}), unchanged on GitHub, while another section conflicts: stays deleted, then the drain deletes it`, async () => {
      const two = (u: string, a: string, b: string | null) =>
        serializeNoteFolder(
          {
            id: 'abc12345', title: 'G', tags: [], created: T1, updated: u,
            sections: [{ id: 's1', name: 'A', content: a }, ...(b === null ? [] : [{ id: 's2', name: 'B', content: b }])],
          },
          { preserveUpdated: true },
        ).files
      for (const [f, c] of Object.entries(two(T1, 'a', 'b'))) remote.set(`${DIR}/${f}`, c)
      remote.set('.noteflow-format', '2\n')
      writeLocal(two(T1, 'a', 'b'))
      await gh.pullNotes(notesDir)
      const s2Sha = blobSha(remote.get(`${DIR}/s2.md`)!)
      // The other device edits s1 (and bumps note.md); s2 stays at its base on GitHub.
      for (const f of ['note.md', 's1.md']) remote.set(`${DIR}/${f}`, two(T2, 'a remote', 'b')[f])
      // Here: s2 removed and s1 edited.
      const loc = two(T3, 'a local', null)
      fs.rmSync(path.join(notesDir, DIR, 's2.md'))
      writeLocal(loc)
      if (variant === 'journaled delete (failed)') {
        fake.failDeletes = true
        await gh.scheduleDelete(`${DIR}/s2.md`)
        fake.failDeletes = false
        expect(syncState().ops[`${DIR}/s2.md`]).toMatchObject({ op: 'delete' })
        for (const [f, c] of Object.entries(loc)) gh.schedulePush(`${DIR}/${f}`, c)
      }
      const res = await gh.pullNotes(notesDir)
      expect(res.errors).toEqual([])
      // s2 does not come back; a delete op stands (conditional on the remote sha, now the base).
      expect(fs.existsSync(path.join(notesDir, DIR, 's2.md'))).toBe(false)
      const ops = syncState().ops
      expect(ops[`${DIR}/s2.md`]).toMatchObject({ op: 'delete' })
      expect(ops[`${DIR}/s2.md`].stale).toBeUndefined()
      expect(syncState().shas[`${DIR}/s2.md`]).toBe(s2Sha)
      expect(readLocal(`${DIR}/s1.md`)).toContain('a local')
      expect(readLocal(`${DIR}/s1.md`)).toContain('a remote')
      expect(readLocal(`${DIR}/note.md`)).not.toContain('s2.md')
      // A pull BEFORE the drain does not resurrect it.
      const again = await gh.pullNotes(notesDir)
      expect(again.errors).toEqual([])
      expect(fs.existsSync(path.join(notesDir, DIR, 's2.md'))).toBe(false)
      // The merged files go up; the uploaded anchor no longer lists s2.
      vi.advanceTimersByTime(5000)
      await flush()
      expect(remote.get(`${DIR}/note.md`)).toBe(readLocal(`${DIR}/note.md`))
      expect(remote.get(`${DIR}/note.md`)).not.toContain('s2.md')
      // The drain deletes s2 on GitHub (the remote is still at the base sha).
      await gh.retrySyncJournal(notesDir)
      await flush()
      expect(remote.has(`${DIR}/s2.md`)).toBe(false)
      expect(syncState().ops).toEqual({})
      expect(fs.readdirSync(notesDir)).toEqual([DIR])
    })
  }

  it('an encrypted note can not be merged: the historical copy path (remote wins, local kept as a copy)', async () => {
    const enc = (u: string, ct: string) => {
      const note: DiskNote = { id: 'abc12345', title: 'Groceries', tags: [], created: T1, updated: u, sections: [], encryption: { v: 1, ct } } as DiskNote
      return serializeNoteFolder(note, { preserveUpdated: true }).files
    }
    for (const [f, c] of Object.entries(enc(T1, 'c0'))) remote.set(`${DIR}/${f}`, c)
    remote.set('.noteflow-format', '2\n')
    writeLocal(enc(T1, 'c0'))
    await gh.pullNotes(notesDir)
    for (const [f, c] of Object.entries(enc(T2, 'c-remote'))) remote.set(`${DIR}/${f}`, c)
    const loc = enc(T3, 'c-local')
    writeLocal(loc)
    for (const [f, c] of Object.entries(loc)) gh.schedulePush(`${DIR}/${f}`, c)
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(readLocal(`${DIR}/note.md`)).toBe(enc(T2, 'c-remote')['note.md'])
    expect(fs.readdirSync(notesDir).filter((d) => d !== DIR)).toHaveLength(1)
    expect(gh.getSyncStatus().conflictCopies).toMatchObject({ count: 1 })
  })

  it('a section deleted on GitHub and edited here: the deletion applies and the edit goes to a copy of only that section', async () => {
    const two = (u: string, a: string, b: string | null) =>
      serializeNoteFolder(
        {
          id: 'abc12345', title: 'G', tags: [], created: T1, updated: u,
          sections: [{ id: 's1', name: 'A', content: a }, ...(b === null ? [] : [{ id: 's2', name: 'B', content: b }])],
        },
        { preserveUpdated: true },
      ).files
    for (const [f, c] of Object.entries(two(T1, 'a', 'b'))) remote.set(`${DIR}/${f}`, c)
    remote.set('.noteflow-format', '2\n')
    writeLocal(two(T1, 'a', 'b'))
    await gh.pullNotes(notesDir)
    remote.delete(`${DIR}/s2.md`)
    remote.set(`${DIR}/note.md`, two(T2, 'a', null)['note.md'])
    const loc = two(T3, 'a', 'b edited here')
    writeLocal(loc)
    for (const [f, c] of Object.entries(loc)) gh.schedulePush(`${DIR}/${f}`, c)
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(fs.existsSync(path.join(notesDir, DIR, 's2.md'))).toBe(false)
    const copies = fs.readdirSync(notesDir).filter((d) => d !== DIR)
    expect(copies).toHaveLength(1)
    expect(fs.readdirSync(path.join(notesDir, copies[0])).sort()).toEqual(['note.md', 's2.md'])
    expect(readLocal(`${copies[0]}/s2.md`)).toBe(loc['s2.md'])
  })

  it('a pull between the remote edit and the push ("local strictly newer") resolves it too — no overwrite afterwards', async () => {
    await syncedStart()
    remoteEdit('remote')
    localEdit('local') // timers armed, not fired
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    const merged = readLocal(`${DIR}/s1.md`)
    expect(merged).toContain('local')
    expect(merged).toContain('remote')
    expect(fs.readdirSync(notesDir)).toEqual([DIR]) // no conflict copy
    vi.advanceTimersByTime(5000) // the original timers were cancelled; the merge re-armed them with the merged content
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(merged) // never the plain local version over the remote edit
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

  it('a half-failed merge is retried by the next pull and keeps every edit (incl. one made in between)', async () => {
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
    // The apply fails halfway (s1.md locked).
    const s1 = path.join(notesDir, DIR, 's1.md')
    fs.chmodSync(s1, 0o444)
    const r1 = await gh.pullNotes(notesDir)
    fs.chmodSync(s1, 0o666)
    expect(r1.errors).toHaveLength(1)
    // The user now edits s2.
    const loc2 = two(T4, 'a-local', 'b-NEW-EDIT')
    writeLocal(loc2)
    for (const [f, c] of Object.entries(loc2)) if (f !== 's1.md') gh.schedulePush(`${DIR}/${f}`, c)
    const r2 = await gh.pullNotes(notesDir)
    expect(r2.errors).toEqual([])
    // Every edit is in the note: s2 (only changed here) and s1 (both versions).
    expect(readLocal(`${DIR}/s2.md`)).toBe(loc2['s2.md'])
    expect(readLocal(`${DIR}/s1.md`)).toContain('a-local')
    expect(readLocal(`${DIR}/s1.md`)).toContain('a-remote')
    expect(fs.readdirSync(notesDir)).toEqual([DIR])
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
