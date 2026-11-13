// Files over 1 MB through GitHub Sync (electron/githubSync.ts). The Contents
// API (default media type) answers a file between 1 MB and 100 MB with HTTP
// 200, `content: ""`, `encoding: "none"` and the REAL sha/size; decoding that
// as base64 gave '' — an image-heavy section was written EMPTY while its real
// sha was cached as the base, and the next push uploaded the empty version to
// every device. The fix: getRemoteFile falls back to the Git Blobs API
// (verified against the sha) and is fail-closed; a one-time pass repairs the
// devices the old code already emptied. End to end against a SIMULATED GitHub
// (in-memory repo behind a fake `https.request`; the "1 MB" threshold is
// configurable and small here). Electron is mocked; no network.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'
import { gitBlobSha as blobSha } from '../../electron/mirrorPlan'
import {
  EMPTY_BLOB_SHA,
  decodeContentsApiFile,
  decodeGitBlob,
  githubRequestTimeoutMs,
} from '../../electron/githubContents'
import {
  emptySyncState,
  parseSyncState,
  serializeSyncState,
  planEmptyFileRepair,
  shouldHoldBackEmptyUpload,
} from '../../electron/syncState'

// ── Simulated GitHub ──────────────────────────────────────────────────────────

const remote = new Map<string, string>() // path → content
const puts: string[] = []
const blobs = new Map<string, string>() // every blob the repo ever held
const timeouts: Array<{ method: string; ms: number }> = []
const fake = {
  largeThreshold: Infinity, // bytes: above it the Contents API does not inline the content
  failBlobs: false, // git/blobs answers 500
  corruptBlobs: false, // git/blobs answers bytes that do not hash to the sha
  onBlobGet: null as null | ((sha: string) => void), // runs while a blob download is "in flight"
}

function answer(method: string, url: string, body: Record<string, unknown> | undefined): [number, unknown] {
  const base = '/repos/me/notes'
  for (const c of remote.values()) blobs.set(blobSha(c), c)
  if (method === 'GET' && url === base) return [200, { default_branch: 'main' }]
  if (method === 'GET' && url.startsWith(`${base}/git/blobs/`)) {
    const sha = url.slice(`${base}/git/blobs/`.length)
    fake.onBlobGet?.(sha)
    if (fake.failBlobs) return [500, { message: 'Server Error' }]
    const c = blobs.get(sha)
    if (c === undefined) return [404, { message: 'Not Found' }]
    const served = fake.corruptBlobs ? c.slice(0, -1) : c
    return [200, { sha, size: Buffer.byteLength(c), encoding: 'base64', content: Buffer.from(served).toString('base64') }]
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
    const size = Buffer.byteLength(current)
    if (size > fake.largeThreshold) return [200, { sha: blobSha(current), size, encoding: 'none', content: '' }]
    return [200, { sha: blobSha(current), size, encoding: 'base64', content: Buffer.from(current).toString('base64') }]
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
    if (body?.sha !== blobSha(current)) return [409, { message: 'sha mismatch' }]
    remote.delete(rel)
    return [200, { commit: {} }]
  }
  return [404, { message: 'Not Found' }]
}

function fakeRequest(opts: { method: string; path: string }, cb: (res: EventEmitter & { statusCode: number }) => void) {
  const req = new EventEmitter() as EventEmitter & {
    setTimeout: (ms: number) => void
    write: (s: string) => void
    end: () => void
    destroy: () => void
  }
  let payload = ''
  req.setTimeout = (ms: number) => { timeouts.push({ method: opts.method, ms }) }
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

const DIR = 'photos-abc12345'
const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'
// "Image-heavy" section: over the (test) threshold of 64 bytes.
const BIG = `![img](data:image/png;base64,${'iVBORw0KGgo'.repeat(40)})\nholiday photos ✓`
const THRESHOLD = 64

function noteFiles(updated: string, s1: string, s2 = 'small'): Record<string, string> {
  const note: DiskNote = {
    id: 'abc12345',
    title: 'Photos',
    tags: [],
    created: T1,
    updated,
    sections: [
      { id: 's1', name: 'Pics', content: s1 },
      { id: 's2', name: 'Notes', content: s2 },
    ],
  }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}

let tmp: string
let notesDir: string
let gh: typeof import('../../electron/githubSync')

const flush = async () => {
  for (let i = 0; i < 300; i++) await new Promise((r) => setImmediate(r))
}
const local = (rel: string) => path.join(notesDir, rel)
const readLocal = (rel: string) => fs.readFileSync(local(rel), 'utf-8')
const statePath = () => path.join(env.userData, 'sync-state.json')
const syncState = () => JSON.parse(fs.readFileSync(statePath(), 'utf-8'))
const settings = () => JSON.parse(fs.readFileSync(path.join(env.userData, 'settings.json'), 'utf-8'))

function setRemote(files: Record<string, string>, dir = DIR) {
  for (const [f, c] of Object.entries(files)) remote.set(`${dir}/${f}`, c)
}
function writeLocal(files: Record<string, string>, dir = DIR) {
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(notesDir, dir, f), c, 'utf-8')
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-gh-large-'))
  env.userData = path.join(tmp, 'userData')
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(env.userData, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  remote.clear()
  puts.length = 0
  blobs.clear()
  timeouts.length = 0
  fake.largeThreshold = THRESHOLD
  fake.failBlobs = false
  fake.corruptBlobs = false
  fake.onBlobGet = null
  fs.writeFileSync(
    path.join(env.userData, 'settings.json'),
    JSON.stringify({
      githubSync: {
        enabled: true,
        encryptedToken: Buffer.from('tok').toString('base64'),
        owner: 'me',
        repo: 'notes',
        lastSync: '2026-10-01T12:00:00.000Z',
      },
    }),
  )
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.resetModules()
  gh = await import('../../electron/githubSync')
  gh.setNotesDir(notesDir)
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(tmp, { recursive: true, force: true })
})

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('decoding the GitHub answers', () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64')

  it('Contents API: inline base64 → the text; not inline / truncated → null; an empty file → ""', () => {
    expect(decodeContentsApiFile({ encoding: 'base64', content: b64('héllo'), size: Buffer.byteLength('héllo') })).toBe('héllo')
    // GitHub wraps the base64 every 60 chars.
    const wrapped = b64(BIG).replace(/(.{60})/g, '$1\n')
    expect(decodeContentsApiFile({ encoding: 'base64', content: wrapped, size: Buffer.byteLength(BIG) })).toBe(BIG)
    // Over 1 MB: empty content, encoding "none", the REAL size.
    expect(decodeContentsApiFile({ encoding: 'none', content: '', size: 2_000_000 })).toBeNull()
    expect(decodeContentsApiFile({ encoding: 'base64', content: '', size: 2_000_000 })).toBeNull()
    expect(decodeContentsApiFile({ encoding: 'base64', content: b64('partial'), size: 999 })).toBeNull()
    expect(decodeContentsApiFile({ encoding: 'base64', size: 3 })).toBeNull()
    expect(decodeContentsApiFile({ encoding: 'base64', content: '', size: 0 })).toBe('')
    expect(decodeContentsApiFile({ encoding: 'base64', content: b64('no size') })).toBe('no size')
  })

  it('Git Blobs API: only bytes that hash to the sha', () => {
    expect(decodeGitBlob({ encoding: 'base64', content: b64(BIG) }, blobSha(BIG))).toBe(BIG)
    expect(decodeGitBlob({ encoding: 'base64', content: b64(BIG.slice(0, -1)) }, blobSha(BIG))).toBeNull()
    expect(decodeGitBlob({ encoding: 'utf-8', content: BIG }, blobSha(BIG))).toBeNull()
    expect(decodeGitBlob(null, blobSha(BIG))).toBeNull()
    expect(decodeGitBlob({ encoding: 'base64', content: '' }, EMPTY_BLOB_SHA)).toBe('')
  })

  it('EMPTY_BLOB_SHA is the git sha of an empty file', () => {
    expect(EMPTY_BLOB_SHA).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('request timeout: 15 s + 1 s per 32 KB sent, capped at 10 min', () => {
    expect(githubRequestTimeoutMs(0)).toBe(15_000)
    expect(githubRequestTimeoutMs(-5)).toBe(15_000)
    expect(githubRequestTimeoutMs(Number.NaN)).toBe(15_000)
    expect(githubRequestTimeoutMs(1)).toBe(16_000)
    expect(githubRequestTimeoutMs(32_768)).toBe(16_000)
    expect(githubRequestTimeoutMs(32_769)).toBe(17_000)
    expect(githubRequestTimeoutMs(5 * 1024 * 1024)).toBe(15_000 + 160_000)
    expect(githubRequestTimeoutMs(500 * 1024 * 1024)).toBe(600_000)
  })
})

describe('one-time repair planner (syncState)', () => {
  const A = `${DIR}/s1.md`
  const real = blobSha(BIG)
  const size = (sizes: Record<string, number | null>) => (rel: string) => sizes[rel] ?? null

  it('a 0-byte local file whose base is a non-empty blob is re-downloaded (whatever the journal says)', () => {
    const state = emptySyncState()
    state.shas[A] = real
    state.ops[A] = { op: 'upsert', queuedAt: T1, attempts: 0 }
    expect(planEmptyFileRepair(state, [{ path: A, sha: real }], size({ [A]: 0 }))).toEqual([{ path: A, sha: real }])
    // The remote moved since: the remote version is the one restored.
    const moved = blobSha(`${BIG}!`)
    expect(planEmptyFileRepair(state, [{ path: A, sha: moved }], size({ [A]: 0 }))).toEqual([{ path: A, sha: moved }])
  })

  it('not a candidate: non-empty local, missing local, unknown or empty base, empty remote, pending delete, done', () => {
    const state = emptySyncState()
    state.shas[A] = real
    expect(planEmptyFileRepair(state, [{ path: A, sha: real }], size({ [A]: 12 }))).toEqual([])
    expect(planEmptyFileRepair(state, [{ path: A, sha: real }], size({}))).toEqual([])
    expect(planEmptyFileRepair(state, [{ path: A, sha: EMPTY_BLOB_SHA }], size({ [A]: 0 }))).toEqual([])
    state.shas[A] = EMPTY_BLOB_SHA // legitimately emptied and reconciled
    expect(planEmptyFileRepair(state, [{ path: A, sha: real }], size({ [A]: 0 }))).toEqual([])
    delete state.shas[A]
    expect(planEmptyFileRepair(state, [{ path: A, sha: real }], size({ [A]: 0 }))).toEqual([])
    state.shas[A] = real
    state.ops[A] = { op: 'delete', queuedAt: T1, attempts: 0 }
    expect(planEmptyFileRepair(state, [{ path: A, sha: real }], size({ [A]: 0 }))).toEqual([])
    state.ops = { [DIR]: { op: 'deleteDir', queuedAt: T1, attempts: 0 } }
    expect(planEmptyFileRepair(state, [{ path: A, sha: real }], size({ [A]: 0 }))).toEqual([])
    state.ops = {}
    state.emptyFileRepairDone = true
    expect(planEmptyFileRepair(state, [{ path: A, sha: real }], size({ [A]: 0 }))).toEqual([])
  })

  it('push safety net: empty content over a non-empty remote that is still the base, only until the repair ran', () => {
    const state = emptySyncState()
    expect(shouldHoldBackEmptyUpload(state, real, real, '')).toBe(true)
    expect(shouldHoldBackEmptyUpload(state, real, real, 'x')).toBe(false)
    expect(shouldHoldBackEmptyUpload(state, real, null, '')).toBe(false) // creation
    expect(shouldHoldBackEmptyUpload(state, EMPTY_BLOB_SHA, EMPTY_BLOB_SHA, '')).toBe(false)
    expect(shouldHoldBackEmptyUpload(state, undefined, real, '')).toBe(false) // unknown base: historical
    state.emptyFileRepairDone = true
    expect(shouldHoldBackEmptyUpload(state, real, real, '')).toBe(false)
  })

  it('the flag round-trips through sync-state.json (and is absent until set)', () => {
    const state = emptySyncState()
    expect(JSON.parse(serializeSyncState(state))).not.toHaveProperty('emptyFileRepairDone')
    state.emptyFileRepairDone = true
    expect(parseSyncState(serializeSyncState(state)).emptyFileRepairDone).toBe(true)
    expect(parseSyncState('{"emptyFileRepairDone":"yes"}').emptyFileRepairDone).toBeUndefined()
  })
})

// ── End to end ────────────────────────────────────────────────────────────────

describe('pull of files over the Contents API limit', () => {
  it('a new remote note with a big section → the real content, sha cached as the base', async () => {
    setRemote(noteFiles(T1, BIG))
    remote.set('.noteflow-format', '2\n')
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(res.incomplete).toBeUndefined()
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
    expect(syncState().shas[`${DIR}/s1.md`]).toBe(blobSha(BIG))
    expect(syncState().emptyFileRepairDone).toBe(true) // nothing to repair on a fresh device
  })

  it('same-version section refresh of a big section → the real content', async () => {
    setRemote(noteFiles(T1, 'old'))
    remote.set('.noteflow-format', '2\n')
    await gh.pullNotes(notesDir)
    // Another device uploaded the big section but not (yet) a new anchor.
    remote.set(`${DIR}/s1.md`, BIG)
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
    expect(syncState().shas[`${DIR}/s1.md`]).toBe(blobSha(BIG))
  })

  it('a genuinely empty remote file is still pulled as empty', async () => {
    setRemote(noteFiles(T1, BIG, ''))
    remote.set('.noteflow-format', '2\n')
    const res = await gh.pullNotes(notesDir)
    expect(res.incomplete).toBeUndefined()
    expect(readLocal(`${DIR}/s2.md`)).toBe('')
    expect(syncState().shas[`${DIR}/s2.md`]).toBe(EMPTY_BLOB_SHA)
  })

  for (const failure of ['blob API error (500)', 'blob hash mismatch'] as const) {
    it(`${failure} → nothing written for the folder, incomplete, nothing cached; the next pull applies it`, async () => {
      setRemote(noteFiles(T1, BIG))
      remote.set('.noteflow-format', '2\n')
      if (failure === 'blob API error (500)') fake.failBlobs = true
      else fake.corruptBlobs = true
      const res = await gh.pullNotes(notesDir)
      expect(res.errors).toEqual([])
      expect(res.incomplete).toBe(true)
      expect(fs.existsSync(local(DIR))).toBe(false)
      expect(syncState().shas[`${DIR}/note.md`]).toBeUndefined()
      expect(syncState().shas[`${DIR}/s1.md`]).toBeUndefined()

      fake.failBlobs = false
      fake.corruptBlobs = false
      const again = await gh.pullNotes(notesDir)
      expect(again.incomplete).toBeUndefined()
      expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
      expect(readLocal(`${DIR}/s2.md`)).toBe('small')
    })
  }

  it('remote newer over an existing local folder + blob failure → the local folder is left exactly as it was', async () => {
    setRemote(noteFiles(T1, 'old pics'))
    remote.set('.noteflow-format', '2\n')
    await gh.pullNotes(notesDir)
    setRemote(noteFiles(T2, BIG, 'new notes'))
    fake.failBlobs = true
    const res = await gh.pullNotes(notesDir)
    expect(res.incomplete).toBe(true)
    expect(readLocal(`${DIR}/note.md`)).toBe(noteFiles(T1, 'old pics')['note.md'])
    expect(readLocal(`${DIR}/s1.md`)).toBe('old pics')
    expect(readLocal(`${DIR}/s2.md`)).toBe('small')
  })

  it('a local save landing while the big sections download → the folder is not written (decided again next pull)', async () => {
    // Local folder with no known base (e.g. first connect): the historical
    // `updated:` rule writes the newer remote folder wholesale.
    writeLocal(noteFiles(T1, 'old pics'))
    setRemote(noteFiles(T2, BIG, 'new notes'))
    remote.set('.noteflow-format', '2\n')
    const T3 = '2026-10-03T10:00:00.000Z'
    const saved = noteFiles(T3, 'edited here')
    fake.onBlobGet = (sha) => {
      if (sha !== blobSha(BIG)) return // the anchor (over the test threshold too) is read before the decision
      fake.onBlobGet = null
      writeLocal(saved) // the user saves during the download
    }
    const res = await gh.pullNotes(notesDir)
    expect(res.incomplete).toBe(true)
    expect(readLocal(`${DIR}/note.md`)).toBe(saved['note.md'])
    expect(readLocal(`${DIR}/s1.md`)).toBe('edited here')
    expect(syncState().shas[`${DIR}/note.md`]).toBeUndefined()
    expect(syncState().shas[`${DIR}/s1.md`]).toBeUndefined()
  })

  it('a big upload gets a timeout scaled with its size', async () => {
    setRemote(noteFiles(T1, 'x'))
    remote.set('.noteflow-format', '2\n')
    await gh.pullNotes(notesDir)
    const huge = 'y'.repeat(300_000)
    writeLocal({ 's1.md': huge })
    gh.schedulePush(`${DIR}/s1.md`, huge)
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe(huge)
    const put = timeouts.find((t) => t.method === 'PUT')!
    expect(put.ms).toBeGreaterThan(15_000)
    expect(timeouts.filter((t) => t.method === 'GET').every((t) => t.ms === 15_000)).toBe(true)
  })
})

describe('devices already emptied by the old pull', () => {
  /**
   * The state the old code left: local section 0 bytes, its REAL sha cached as
   * the base, and (maybe) the empty content journaled for upload. The rest of
   * the folder reconciled.
   */
  function poisoned(withPendingUpsert: boolean) {
    const files = noteFiles(T1, BIG)
    setRemote(files)
    remote.set('.noteflow-format', '2\n')
    writeLocal({ ...files, 's1.md': '' })
    const state = emptySyncState()
    for (const [f, c] of Object.entries(files)) state.shas[`${DIR}/${f}`] = blobSha(c)
    state.shas['.noteflow-format'] = blobSha('2\n')
    if (withPendingUpsert) state.ops[`${DIR}/s1.md`] = { op: 'upsert', queuedAt: T1, attempts: 1 }
    fs.writeFileSync(statePath(), serializeSyncState(state))
  }

  it('the first pull re-downloads the 0-byte file, drops its pending empty upload, sets the flag', async () => {
    poisoned(true)
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
    expect(res.updatedFiles).toContain(path.join(notesDir, DIR))
    const st = syncState()
    expect(st.ops).toEqual({})
    expect(st.shas[`${DIR}/s1.md`]).toBe(blobSha(BIG))
    expect(st.emptyFileRepairDone).toBe(true)
    // The drain has nothing left to upload: GitHub keeps the content.
    await gh.retrySyncJournal(notesDir)
    await flush()
    expect(puts).toEqual([])
    expect(remote.get(`${DIR}/s1.md`)).toBe(BIG)
  })

  it('repair failing → flag not set, the empty upload is held back (not sent), the next pull repairs', async () => {
    poisoned(true)
    fake.failBlobs = true
    const res = await gh.pullNotes(notesDir)
    expect(res.errors).toEqual([])
    expect(res.incomplete).toBe(true)
    expect(gh.getSyncStatus().initialPullStatus).toBe('ok')
    expect(readLocal(`${DIR}/s1.md`)).toBe('')
    expect(syncState().emptyFileRepairDone).toBeUndefined()

    // The journal drain would send the empty content (base == remote → 'put'): held back instead.
    const onConflict = vi.fn()
    gh.onRemoteConflict(onConflict)
    await gh.retrySyncJournal(notesDir)
    await flush()
    expect(puts).toEqual([])
    expect(remote.get(`${DIR}/s1.md`)).toBe(BIG)
    expect(syncState().ops[`${DIR}/s1.md`]).toMatchObject({ op: 'upsert', stale: true })
    expect(onConflict).toHaveBeenCalled()

    // A fresh save of the emptied file (debounced push) is held back too.
    gh.schedulePush(`${DIR}/s1.md`, '')
    vi.advanceTimersByTime(5000)
    await flush()
    expect(puts).toEqual([])

    fake.failBlobs = false
    const again = await gh.pullNotes(notesDir)
    expect(again.errors).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
    expect(syncState().ops).toEqual({})
    expect(syncState().emptyFileRepairDone).toBe(true)
    expect(remote.get(`${DIR}/s1.md`)).toBe(BIG)
  })

  it('after the repair, emptying a section is a normal edit again', async () => {
    poisoned(false)
    await gh.pullNotes(notesDir)
    expect(syncState().emptyFileRepairDone).toBe(true)
    writeLocal({ 's1.md': '' })
    gh.schedulePush(`${DIR}/s1.md`, '')
    vi.advanceTimersByTime(5000)
    await flush()
    expect(remote.get(`${DIR}/s1.md`)).toBe('')
  })
})

describe('remote v1 → v2 migration with a flat note over the limit', () => {
  const FLAT = 'big-flat.md'
  const flatNote = `---\nid: flat0001\ntitle: Big flat\ntags: []\ncreated: ${T1}\nupdated: ${T1}\n---\n${BIG}`

  it('a flat note that can not be read is NOT deleted, and the migration is not recorded; the retry completes it', async () => {
    remote.set(FLAT, flatNote)
    await gh.pullNotes(notesDir)
    expect(gh.getSyncStatus().initialPullStatus).toBe('ok')

    fake.failBlobs = true
    await gh.migrateRemoteToV2IfNeeded(notesDir)
    await flush()
    expect(remote.get(FLAT)).toBe(flatNote) // still on GitHub
    expect(remote.has('.noteflow-format')).toBe(false)
    expect(settings().githubSync.remoteFormatMigratedAt).toBeUndefined()

    fake.failBlobs = false
    await gh.migrateRemoteToV2IfNeeded(notesDir)
    await flush()
    expect(remote.has(FLAT)).toBe(false)
    expect(remote.get('.noteflow-format')).toBe('2\n')
    expect(settings().githubSync.remoteFormatMigratedAt).toBeDefined()
    const anchor = readLocal('big-flat/note.md')
    const secFile = /file: (\S+\.md)/.exec(anchor)![1]
    expect(readLocal(`big-flat/${secFile}`)).toBe(BIG)
  })
})
