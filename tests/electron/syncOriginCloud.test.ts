// Origin of the notes dir (electron/syncOrigin.ts) through electron/cloudSync.ts
// against a SIMULATED NoteFlow Cloud (an in-memory PostgREST per account, fed
// through the mocked cloudKeys.supabaseRest) with two accounts, A and B, each
// with its own DEK. Signing in with B on a device whose notes came from A must
// not upload A's notes to B without asking — also when Cloud switches itself
// on (auto-activation on sign-in / subscribe). Covers the pending state
// (survives a restart, blocks every engine entry point), "merge", "replace"
// (local notes archived with electron/notesArchive.ts — what main.ts'
// sync:resolve-origin does), "cancel" (Cloud off), the same account (no
// question), the seed from cloudSync.userId (installs from before the gate),
// both crossings with GitHub (stale origins) and fail-closed writes.
// Electron, the account session and the DEK are mocked; no real network.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'
import { archiveSyncedNotes } from '../../electron/notesArchive'
import { defaultNotesDir, identityArchiveLabel, normalizeNotesDir } from '../../electron/syncOrigin'

// The notes dir of every test is the DEFAULT one (an origin record only counts
// for its own dir — syncOrigin.ts `notesDir`): the home dir points at the temp dir.
const savedHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
function pointHomeAt(dir: string) {
  process.env.HOME = dir
  process.env.USERPROFILE = dir
}
function restoreHome() {
  for (const [k, v] of Object.entries(savedHome)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}
import { generateDek, generateNoteKey, unwrapKey, decryptContent } from '../../electron/cloudCrypto'
import { buildFileUpsertRow } from '../../electron/cloudSyncLogic'
import { clearRestoreSurface, planAccountTransition } from '../../electron/accountTransition'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const env = vi.hoisted(() => ({
  userData: '',
  userId: null as string | null,
  email: undefined as string | undefined,
  dek: null as Uint8Array | null,
  failSettingsWrites: false,
  rest: null as null | ((endpoint: string, opts?: { method?: string; body?: unknown }) => Promise<{ status: number; json: unknown }>),
}))

vi.mock('electron', () => ({
  app: { getPath: () => env.userData, getVersion: () => '0.0.0', isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
  net: { isOnline: () => true, fetch: () => Promise.reject(new Error('offline in tests')) },
  powerMonitor: { on: () => {} },
}))

vi.mock('../../electron/account', () => ({
  getAccountStatus: () => ({
    signedIn: !!env.userId,
    email: env.userId ? env.email : undefined,
    entitlementsKnown: !!env.userId,
    entitlements: { ai: false, cloud: !!env.userId },
  }),
  getUserId: () => env.userId,
  areEntitlementsFromCache: () => false,
  refreshEntitlements: async () => {},
  getAccessTokenResult: async () => ({ ok: true, token: 't' }),
}))

vi.mock('../../electron/cloudKeys', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../electron/cloudKeys')>()
  return {
    ...real,
    getDek: () => env.dek,
    supabaseRest: (endpoint: string, opts?: { method?: string; body?: unknown }) => env.rest!(endpoint, opts),
  }
})

// settings.json writes fail on demand (EPERM, disk full, a lock held by the CLI…).
vi.mock('../../electron/settingsFile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/settingsFile')>()
  return {
    writeSettingsFile: (file: string, data: Record<string, unknown>) => {
      if (env.failSettingsWrites) throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
      return actual.writeSettingsFile(file, data)
    },
  }
})

// ── Simulated NoteFlow Cloud (one `files` table per account) ──────────────────

interface Row {
  path_key: string
  path_ct: string
  content_ct: string
  key_ct: string
  updated_at: string
  deleted: boolean
  seq: number
}
const tables = new Map<string, Map<string, Row>>()
let seqCounter = 0
let offline = false
/** Every request reaching the server (an origin choice pending must leave this empty). */
const requests: Array<{ user: string | null; method: string; endpoint: string }> = []
/** Every write: upserts, tombstones, physical deletes. */
const mutations: Array<{ user: string; kind: 'upsert' | 'tombstone' | 'delete'; pathKey: string }> = []

function tableOf(user: string): Map<string, Row> {
  let t = tables.get(user)
  if (!t) { t = new Map(); tables.set(user, t) }
  return t
}

function inList(filter: string | null): Set<string> {
  if (!filter?.startsWith('in.(')) return new Set()
  return new Set(filter.slice(4, -1).split(',').map((k) => k.replace(/^"|"$/g, '')))
}

async function rest(endpoint: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: unknown }> {
  const method = opts.method ?? 'GET'
  const user = env.userId
  requests.push({ user, method, endpoint })
  if (offline) throw new Error('fetch failed')
  if (!user) return { status: 401, json: null }
  const table = tableOf(user)
  const [route, query = ''] = endpoint.split('?')
  const params = new URLSearchParams(query)
  const body = (opts.body ?? {}) as Record<string, unknown>
  if (route === '/rest/v1/rpc/cloud_upsert_file_v2' && method === 'POST') {
    const row: Row = {
      path_key: body.p_path_key as string,
      path_ct: body.p_path_ct as string,
      content_ct: body.p_content_ct as string,
      key_ct: body.p_key_ct as string,
      updated_at: body.p_updated_at as string,
      deleted: false,
      seq: ++seqCounter,
    }
    table.set(row.path_key, row)
    mutations.push({ user, kind: 'upsert', pathKey: row.path_key })
    return { status: 200, json: row.seq }
  }
  if (route === '/rest/v1/files' && method === 'POST') {
    const { user_id: _owner, ...rest } = body
    const row = { ...(rest as Omit<Row, 'seq'>), seq: ++seqCounter }
    table.set(row.path_key, row)
    mutations.push({ user, kind: 'upsert', pathKey: row.path_key })
    return { status: 201, json: null }
  }
  if (route === '/rest/v1/files' && method === 'PATCH') {
    for (const key of inList(params.get('path_key'))) {
      const row = table.get(key)
      if (row) table.set(key, { ...row, deleted: true, content_ct: '', seq: ++seqCounter })
      mutations.push({ user, kind: 'tombstone', pathKey: key })
    }
    return { status: 204, json: null }
  }
  if (route === '/rest/v1/files' && method === 'DELETE') {
    for (const key of inList(params.get('path_key'))) {
      table.delete(key)
      mutations.push({ user, kind: 'delete', pathKey: key })
    }
    return { status: 204, json: null }
  }
  if (route === '/rest/v1/files' && method === 'GET') {
    let list = [...table.values()]
    const pk = params.get('path_key')
    if (pk?.startsWith('eq.')) list = list.filter((r) => r.path_key === pk.slice(3))
    else if (pk?.startsWith('in.')) {
      const keys = inList(pk)
      list = list.filter((r) => keys.has(r.path_key))
    }
    const seq = params.get('seq')
    if (seq?.startsWith('gt.')) list = list.filter((r) => r.seq > Number(seq.slice(3)))
    if (params.get('deleted') === 'eq.false') list = list.filter((r) => !r.deleted)
    list.sort((a, b) => a.seq - b.seq)
    const limit = params.get('limit')
    if (limit) list = list.slice(0, Number(limit))
    return { status: 200, json: list.map((r) => ({ ...r })) }
  }
  return { status: 404, json: null }
}

/** Uploads a note folder to an account's table as "another device" would. */
async function seedServer(user: string, dek: Uint8Array, dir: string, files: Record<string, string>) {
  const noteKey = generateNoteKey()
  for (const [name, content] of Object.entries(files)) {
    const row = await buildFileUpsertRow(dek, noteKey, `${dir}/${name}`, content, OLD)
    tableOf(user).set(row.path_key, { ...row, seq: ++seqCounter })
  }
}

/** Note folders alive in an account's table (decrypted with its DEK). */
async function serverDirs(user: string, dek: Uint8Array): Promise<string[]> {
  const dirs = new Set<string>()
  for (const row of tableOf(user).values()) {
    if (row.deleted) continue
    const rel = await decryptContent(await unwrapKey(row.key_ct, dek), row.path_ct)
    if (rel.includes('/')) dirs.add(rel.split('/')[0])
  }
  return [...dirs].sort()
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const OLD = '2026-10-01T10:00:00.000Z'
const A = { id: 'aaaaaaaa-1111-4000-8000-000000000001', email: 'a@example.com', dek: generateDek() }
const B = { id: 'bbbbbbbb-2222-4000-8000-000000000002', email: 'b@example.com', dek: generateDek() }

function files(id: string, opts: { localOnly?: boolean; body?: string } = {}): Record<string, string> {
  const note: DiskNote = {
    id,
    title: id,
    tags: [],
    created: OLD,
    updated: OLD,
    ...(opts.localOnly ? { localOnly: true } : {}),
    sections: [{ id: 's1', name: 'Main', content: opts.body ?? `body of ${id}` }],
  }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}

let tmp: string
let notesDir: string
/** notesDir as the origin records store it. */
let ND: string
let cloud: typeof import('../../electron/cloudSync')
let gh: typeof import('../../electron/githubSync')

const settingsPath = () => path.join(env.userData, 'settings.json')
const readSettings = () => JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
const writeSettings = (data: unknown) => fs.writeFileSync(settingsPath(), JSON.stringify(data))
const journalKeys = (): string[] => {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(path.join(env.userData, 'cloud-sync-state.json'), 'utf-8')).ops ?? {}).sort()
  } catch {
    return []
  }
}
function writeLocal(dir: string, f: Record<string, string>) {
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [name, c] of Object.entries(f)) fs.writeFileSync(path.join(notesDir, dir, name), c, 'utf-8')
}
const localDirs = () => fs.readdirSync(notesDir).filter((n) => fs.existsSync(path.join(notesDir, n, 'note.md'))).sort()
const githubConnection = { enabled: true, encryptedToken: Buffer.from('tok').toString('base64'), owner: 'me', repo: 'notes-x', repoId: 101 }

/** Restart: every module is loaded again; the gate is derived from settings + disk. */
async function boot() {
  vi.resetModules()
  cloud = await import('../../electron/cloudSync')
  gh = await import('../../electron/githubSync')
  const lo = await import('../../electron/localOnlyNotes')
  lo.primeLocalOnlyDirs(notesDir)
  gh.setNotesDir(notesDir)
  cloud.initCloudSync(notesDir)
}

/** What main.ts' handleAccountStatusChanged does on every account change. */
function signIn(user: typeof A) {
  env.userId = user.id
  env.email = user.email
  env.dek = user.dek
  cloud.bindCloudSyncToAccount(user.id)
}

/** What main.ts' sign-out transition does (Cloud off, keys dropped). */
function signOut() {
  cloud.disableCloudSync()
  env.userId = null
  env.email = undefined
  env.dek = null
  cloud.bindCloudSyncToAccount(null)
}

/** Lands the debounced uploads (5 s) and whatever they started. */
async function settle() {
  for (let round = 0; round < 3; round++) {
    await vi.advanceTimersByTimeAsync(6000)
    for (let i = 0; i < 2000; i++) {
      await new Promise((r) => setImmediate(r))
      if (!cloud.hasPendingRemoteMutations() && i > 20) break
    }
  }
}

/** Awaits an operation whose network retries wait on (fake) timers. */
async function drive<T>(promise: Promise<T>): Promise<T> {
  let done = false
  const out = promise.finally(() => { done = true })
  for (let i = 0; i < 5000 && !done; i++) {
    await new Promise((r) => setImmediate(r))
    if (i % 10 === 9) await vi.advanceTimersByTimeAsync(1000)
  }
  return out
}

/** One sync cycle as main.ts' runCloudSyncCycle runs it (pull, then drain). */
async function cycle() {
  const pull = await cloud.pullNotes(notesDir)
  await cloud.retrySyncJournal(notesDir)
  await settle()
  return pull
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-origin-cloud-'))
  env.userData = path.join(tmp, 'userData')
  pointHomeAt(tmp)
  notesDir = defaultNotesDir()
  ND = normalizeNotesDir(notesDir)
  fs.mkdirSync(env.userData, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  env.userId = null
  env.email = undefined
  env.dek = null
  env.failSettingsWrites = false
  env.rest = rest
  tables.clear()
  seqCounter = 0
  offline = false
  requests.length = 0
  mutations.length = 0
  writeSettings({})
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(async () => {
  if (cloud) await settle()
  vi.useRealTimers()
  vi.restoreAllMocks()
  restoreHome()
  fs.rmSync(tmp, { recursive: true, force: true })
})

/**
 * This device synced with account A ("mine" + A's "a-note"; the local-only
 * welcome note never goes up), left an offline edit pending in A's journal,
 * then signed out. Account B holds "b-note".
 */
async function syncedWithAThenSignedOut() {
  writeLocal('mine-1111', files('1111'))
  writeLocal('welcome-9999', files('9999', { localOnly: true }))
  fs.writeFileSync(path.join(notesDir, 'groups.json'), JSON.stringify([{ id: 'ga', name: 'From A' }], null, 2))
  await seedServer(A.id, A.dek, 'a-note-2222', files('2222'))
  await seedServer(B.id, B.dek, 'b-note-3333', files('3333'))
  await boot()
  signIn(A)
  expect(cloud.enableCloudSync().ok).toBe(true)
  const pull = await cycle()
  expect(pull.errors).toEqual([])
  expect(readSettings().syncOrigin.cloud).toEqual({ userId: A.id, email: A.email, notesDir: ND }) // first connection: adopted silently
  expect(await serverDirs(A.id, A.dek)).toEqual(['a-note-2222', 'mine-1111'])
  expect(localDirs()).toEqual(['a-note-2222', 'mine-1111', 'welcome-9999'])
  // An offline edit: journaled for A, never uploaded.
  offline = true
  writeLocal('mine-1111', files('1111', { body: 'edited offline' }))
  expect((await drive(cloud.pushPathsNow(notesDir, ['mine-1111/s1.md']))).errors).toEqual(['mine-1111/s1.md'])
  offline = false
  expect(journalKeys()).toEqual(['mine-1111/s1.md'])
  signOut()
  requests.length = 0
  mutations.length = 0
}

/** B signs in and Cloud switches itself on (applyAccountTransition → enableCloudSync). */
async function signInBWithAutoActivation() {
  signIn(B)
  expect(journalKeys()).toEqual([]) // A's pending ops never belong to B
  expect(cloud.enableCloudSync().ok).toBe(true)
}

describe('NoteFlow Cloud asks before mixing notes from another account', () => {
  it('A → B with auto-activation: nothing moves before the choice — every entry point is blocked', async () => {
    await syncedWithAThenSignedOut()
    await signInBWithAutoActivation()
    expect(cloud.getCloudOriginChoice()).toEqual({
      previous: { userId: A.id, email: A.email },
      next: { userId: B.id, email: B.email },
    })
    const status = cloud.getCloudSyncStatus()
    expect(status.originChoice?.next.email).toBe(B.email)
    expect(status.initialPullStatus).toBe('pending')
    expect(cloud.isCloudOriginGateBlocked()).toBe(true)

    // runCloudSyncCycle: pull (+ its catch-up) and drain.
    expect(await cycle()).toEqual({
      pulled: 0, deleted: 0, errors: [], updatedFiles: [], hadDeletions: false, hadMetadataChanges: false, incomplete: true,
    })
    // Every other way a local change could reach the server.
    const content = fs.readFileSync(path.join(notesDir, 'mine-1111', 'note.md'), 'utf-8')
    const done = vi.fn()
    cloud.schedulePush('mine-1111/note.md', content, undefined, done)
    expect(done).toHaveBeenCalledWith('sync-gated:origin-choice')
    expect(await cloud.pushPathsNow(notesDir, ['mine-1111/note.md', 'groups.json'])).toEqual({ pushed: 0, errors: [] })
    expect(await cloud.flushPathForSnapshot(notesDir, 'mine-1111/s1.md')).toBe('gated')
    await cloud.scheduleDelete('mine-1111/s1.md')
    await cloud.scheduleDeleteDir('a-note-2222')
    await settle()
    expect(requests).toEqual([])
    expect(journalKeys()).toEqual([]) // not even journaled
    expect(cloud.getCloudSyncStatus().initialPullStatus).toBe('pending')
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: A.id, email: A.email, notesDir: ND })
    expect(localDirs()).toEqual(['a-note-2222', 'mine-1111', 'welcome-9999'])
  })

  it('A → B "replace": nothing of A reaches B, A\'s notes are in the archive, the local-only note stays', async () => {
    await syncedWithAThenSignedOut()
    await signInBWithAutoActivation()
    // What main.ts' sync:resolve-origin does for 'replace'.
    const previous = cloud.getStoredCloudOriginIdentity()!
    expect(previous).toEqual({ kind: 'cloud', userId: A.id, email: A.email, notesDir: ND })
    const archive = archiveSyncedNotes({
      notesDir,
      archiveRoot: path.join(env.userData, 'notes-archive'),
      label: identityArchiveLabel(previous),
      origin: previous,
    })
    expect(cloud.resolveCloudOriginChoice('replace')).toEqual({ ok: true })
    expect(cloud.getCloudOriginChoice()).toBeNull()
    const pull = await cycle()
    expect(pull.errors).toEqual([])

    expect(mutations.filter((m) => m.user === B.id)).toEqual([]) // zero upserts / tombstones into B
    expect(await serverDirs(B.id, B.dek)).toEqual(['b-note-3333'])
    expect(localDirs()).toEqual(['b-note-3333', 'welcome-9999'])
    expect(path.basename(archive.archiveDir)).toMatch(/^cloud-aaaaaaaa-/)
    expect(fs.readdirSync(path.join(archive.archiveDir, 'notes')).sort()).toEqual(['a-note-2222', 'groups.json', 'mine-1111'])
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: B.id, email: B.email, notesDir: ND })
    expect(readSettings().cloudSync.userId).toBe(B.id)
    expect(cloud.getCloudSyncStatus().initialPullStatus).toBe('ok')
  })

  it('A → B "merge": as before — B gets the local notes and the device gets B\'s', async () => {
    await syncedWithAThenSignedOut()
    await signInBWithAutoActivation()
    expect(cloud.resolveCloudOriginChoice('merge')).toEqual({ ok: true })
    const pull = await cycle()
    expect(pull.errors).toEqual([])
    expect(await serverDirs(B.id, B.dek)).toEqual(['a-note-2222', 'b-note-3333', 'mine-1111'])
    expect(localDirs()).toEqual(['a-note-2222', 'b-note-3333', 'mine-1111', 'welcome-9999'])
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: B.id, email: B.email, notesDir: ND })
    // Nothing of A moved: its pending offline edit was dropped with its journal.
    expect(mutations.filter((m) => m.user === A.id)).toEqual([])
  })

  it('the same account signing in again does not ask, and its pending journal still drains', async () => {
    await syncedWithAThenSignedOut()
    signIn(A)
    expect(journalKeys()).toEqual(['mine-1111/s1.md']) // same owner: kept
    expect(cloud.enableCloudSync().ok).toBe(true)
    expect(cloud.getCloudOriginChoice()).toBeNull()
    expect((await cycle()).errors).toEqual([])
    expect(journalKeys()).toEqual([])
    expect(mutations.some((m) => m.user === A.id && m.kind === 'upsert')).toBe(true)
  })

  it('the pending choice survives a restart and keeps blocking', async () => {
    await syncedWithAThenSignedOut()
    await signInBWithAutoActivation()
    await boot() // restart with B's session restored
    expect(cloud.getCloudOriginChoice()?.previous.userId).toBe(A.id)
    expect(cloud.isCloudOriginGateBlocked()).toBe(true)
    expect((await cycle()).incomplete).toBe(true)
    expect(requests).toEqual([])
  })

  it('"cancel" (Cloud off) leaves notes and origin intact, and a restart neither asks nor uploads', async () => {
    await syncedWithAThenSignedOut()
    await signInBWithAutoActivation()
    cloud.disableCloudSync() // what sync:resolve-origin does for 'cancel' (+ stopCloudAutoSync, dropRestoreSurface)
    expect(cloud.getCloudOriginChoice()).toBeNull()
    expect(cloud.isCloudOriginGateBlocked()).toBe(false)
    await boot()
    expect(cloud.isCloudSyncEnabled()).toBe(false)
    expect(cloud.getCloudOriginChoice()).toBeNull()
    await cycle()
    expect(requests).toEqual([])
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: A.id, email: A.email, notesDir: ND })
    expect(localDirs()).toEqual(['a-note-2222', 'mine-1111', 'welcome-9999'])
    // Turning Cloud on by hand asks again.
    expect(cloud.enableCloudSync().ok).toBe(true)
    expect(cloud.getCloudOriginChoice()?.previous.userId).toBe(A.id)

    // main.ts' half (accountTransition.ts): the cancel drops the Cloud half of a
    // pending restore record, so entitlements landing later can't switch Cloud
    // back on — and a session restored at boot is not a sign-in.
    const record = { identity: B.email, cloudEnabled: true, aiManaged: true }
    const narrowed = clearRestoreSurface(record, true, 'cloud')
    expect(narrowed).toEqual({ identity: B.email, cloudEnabled: false, aiManaged: true })
    const stable = { signedIn: true, identity: B.email }
    const plan = planAccountTransition(
      stable,
      { ...stable, entitlements: { ai: false, cloud: true }, entitlementsKnown: true },
      { cloudEnabled: false, aiManaged: false, aiFallbackProvider: 'anthropic', restore: narrowed ?? null },
    )
    expect(plan.enableCloud).toBe(false)
  })

  it('seeds the origin from cloudSync.userId: A signed out before this feature, B signs in → asks', async () => {
    // State an earlier build left: A's sync state (owner, watermark, a pending op), no syncOrigin.
    writeLocal('mine-1111', files('1111'))
    writeSettings({ cloudSync: { enabled: false, userId: A.id, lastSync: '2026-11-01T00:00:00.000Z', pullSeq: 9, basesBootstrapped: true } })
    fs.writeFileSync(
      path.join(env.userData, 'cloud-sync-state.json'),
      JSON.stringify({ version: 1, ops: { 'mine-1111/note.md': { op: 'upsert', queuedAt: '2026-11-01T00:00:00.000Z', attempts: 0 } } }),
    )
    await seedServer(B.id, B.dek, 'b-note-3333', files('3333'))
    await boot()
    await signInBWithAutoActivation()
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: A.id, notesDir: ND }) // recorded before the reset
    expect(readSettings().cloudSync.userId).toBe(B.id)
    expect(readSettings().cloudSync.pullSeq).toBeUndefined()
    expect(cloud.getCloudOriginChoice()).toEqual({ previous: { userId: A.id }, next: { userId: B.id, email: B.email } })
    await cycle()
    expect(requests).toEqual([])
  })

  it('a seed that cannot be written keeps the previous owner and blocks everything until it can', async () => {
    writeLocal('mine-1111', files('1111'))
    writeSettings({ cloudSync: { enabled: true, userId: A.id, pullSeq: 9, lastSync: '2026-11-01T00:00:00.000Z' } })
    env.failSettingsWrites = true
    env.userId = B.id
    env.email = B.email
    env.dek = B.dek
    await boot()
    cloud.bindCloudSyncToAccount(B.id)
    expect(cloud.isCloudOriginGateBlocked()).toBe(true)
    expect(cloud.getCloudOriginChoice()).toBeNull() // nothing to ask yet: just blocked
    expect(readSettings().cloudSync.userId).toBe(A.id) // not reset onto B
    expect((await cycle()).incomplete).toBe(true)
    expect(await cloud.pushPathsNow(notesDir, ['mine-1111/note.md'])).toEqual({ pushed: 0, errors: [] })
    expect(requests).toEqual([])
    // Writable again: the next entry point records A, resets onto B and asks.
    env.failSettingsWrites = false
    expect((await cloud.pullNotes(notesDir)).incomplete).toBe(true)
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: A.id, notesDir: ND })
    expect(readSettings().cloudSync.userId).toBe(B.id)
    expect(cloud.getCloudOriginChoice()?.previous.userId).toBe(A.id)
    expect(requests).toEqual([])
  })

  it('another account with no synced notes on disk: no question, the origin moves and the old state is reset', async () => {
    await syncedWithAThenSignedOut()
    for (const d of ['mine-1111', 'a-note-2222']) fs.rmSync(path.join(notesDir, d), { recursive: true })
    await signInBWithAutoActivation()
    expect(cloud.getCloudOriginChoice()).toBeNull()
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: B.id, email: B.email, notesDir: ND })
    expect((await cycle()).errors).toEqual([])
    expect(localDirs()).toEqual(['b-note-3333', 'welcome-9999'])
    expect(mutations.filter((m) => m.user === B.id && m.kind !== 'upsert')).toEqual([])
  })
})

describe('crossing with GitHub Sync (stale origins)', () => {
  it('Cloud "replace" with GitHub connected marks syncOrigin.github stale; reconnecting that repo with notes asks', async () => {
    await syncedWithAThenSignedOut()
    writeSettings({ ...readSettings(), githubSync: githubConnection, syncOrigin: { ...readSettings().syncOrigin, github: { repoId: 101, owner: 'me', repo: 'notes-x', notesDir: ND } } })
    await boot()
    await signInBWithAutoActivation()
    expect(cloud.getCloudOriginChoice()?.githubConnected).toBe(true)
    archiveSyncedNotes({ notesDir, archiveRoot: path.join(env.userData, 'notes-archive'), label: 'cloud-aaaaaaaa' })
    expect(cloud.resolveCloudOriginChoice('replace')).toEqual({ ok: true })
    expect(readSettings().syncOrigin).toEqual({
      cloud: { userId: B.id, email: B.email, notesDir: ND },
      github: { repoId: 101, owner: 'me', repo: 'notes-x', stale: true, notesDir: ND },
    })
    await cycle()
    expect(localDirs()).toEqual(['b-note-3333', 'welcome-9999'])
    gh.disconnectGitHub() // main.ts disconnects GitHub after a Cloud 'replace'
    expect(readSettings().syncOrigin.github.stale).toBe(true)

    // Later: Cloud off, the same repo connected again — the notes on disk are B's.
    cloud.disableCloudSync()
    writeSettings({ ...readSettings(), githubSync: githubConnection })
    gh.loadSyncSettings()
    expect(gh.isOriginGateBlocked()).toBe(true)
    expect(gh.getOriginChoice()).toEqual({
      previous: { owner: 'me', repo: 'notes-x' },
      next: { owner: 'me', repo: 'notes-x' },
      stale: true,
      staleFrom: { email: B.email },
    })
  })

  it('a Cloud origin marked stale by GitHub\'s "replace" asks for the same account with notes; without notes it is adopted again', async () => {
    // What GitHub's 'replace' leaves: notes from the repo on disk, A's origin stale, A's old watermark.
    writeLocal('repo-note-4444', files('4444'))
    await seedServer(A.id, A.dek, 'a-note-2222', files('2222'))
    writeSettings({
      cloudSync: { enabled: false, userId: A.id, pullSeq: seqCounter, lastSync: '2026-11-01T00:00:00.000Z', basesBootstrapped: true },
      syncOrigin: { cloud: { userId: A.id, email: A.email, stale: true, notesDir: ND }, github: { repoId: 101, owner: 'me', repo: 'notes-x', notesDir: ND } },
    })
    await boot()
    signIn(A)
    expect(cloud.enableCloudSync().ok).toBe(true)
    expect(cloud.getCloudOriginChoice()).toEqual({
      previous: { userId: A.id, email: A.email },
      next: { userId: A.id, email: A.email },
      stale: true,
      staleFrom: { owner: 'me', repo: 'notes-x' },
    })
    expect((await cycle()).incomplete).toBe(true)
    expect(requests).toEqual([])

    // No synced notes left: adopted again WITH a reset — the watermark of A
    // would otherwise skip A's notes, which are no longer on disk.
    fs.rmSync(path.join(notesDir, 'repo-note-4444'), { recursive: true })
    expect(cloud.refreshCloudOriginGate()).toBe('clear')
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: A.id, email: A.email, notesDir: ND })
    expect(readSettings().cloudSync.pullSeq).toBeUndefined()
    expect((await cycle()).errors).toEqual([])
    expect(localDirs()).toEqual(['a-note-2222'])
  })
})

describe('fail-closed', () => {
  it('an unreadable settings.json blocks syncing without asking', async () => {
    await syncedWithAThenSignedOut()
    signIn(A)
    expect(cloud.enableCloudSync().ok).toBe(true)
    fs.writeFileSync(settingsPath(), '{ corrupt')
    expect(cloud.refreshCloudOriginGate()).toBe('unreadable')
    expect(cloud.getCloudOriginChoice()).toBeNull()
    expect((await cycle()).incomplete).toBe(true)
    expect(requests).toEqual([])
  })

  it('a cloud-sync-state.json that cannot be reset blocks the gate and keeps the old origin', async () => {
    await syncedWithAThenSignedOut()
    for (const d of ['mine-1111', 'a-note-2222']) fs.rmSync(path.join(notesDir, d), { recursive: true })
    signIn(B)
    // The journal can't be rewritten (a directory in its place: EISDIR, like an antivirus lock).
    const statePath = path.join(env.userData, 'cloud-sync-state.json')
    fs.rmSync(statePath, { force: true })
    fs.mkdirSync(statePath)
    expect(cloud.enableCloudSync().ok).toBe(true)
    expect(cloud.isCloudOriginGateBlocked()).toBe(true)
    expect(readSettings().syncOrigin.cloud.userId).toBe(A.id)
    expect((await cycle()).incomplete).toBe(true)
    expect(requests).toEqual([])
    fs.rmdirSync(statePath)
  })

  it('an adoption whose settings write fails keeps the gate closed (no-origin and changed-empty)', async () => {
    writeLocal('mine-1111', files('1111'))
    writeSettings({ cloudSync: { enabled: true } }) // Cloud on, no origin, no owner
    env.userId = A.id
    env.email = A.email
    env.dek = A.dek
    env.failSettingsWrites = true
    await boot()
    expect(cloud.isCloudOriginGateBlocked()).toBe(true)
    expect((await cycle()).incomplete).toBe(true)
    expect(requests).toEqual([])
    env.failSettingsWrites = false
    expect(cloud.refreshCloudOriginGate()).toBe('clear')
    expect(readSettings().syncOrigin.cloud).toEqual({ userId: A.id, email: A.email, notesDir: ND })
  })
})

describe('the origin belongs to one notes dir (NOTEFLOW_NOTES_DIR)', () => {
  it('an empty override dir signed in with B records and resolves nothing; the real dir then asks', async () => {
    await syncedWithAThenSignedOut()
    const realDir = notesDir
    const recorded = readSettings().syncOrigin
    const override = path.join(tmp, 'override-notes')
    fs.mkdirSync(override)
    notesDir = override
    await boot()
    await signInBWithAutoActivation()
    expect(cloud.getCloudOriginChoice()).toBeNull() // no question for this dir
    expect(readSettings().syncOrigin).toEqual(recorded) // nothing written
    expect((await cycle()).errors).toEqual([])
    expect(localDirs()).toEqual(['b-note-3333'])
    expect(mutations.filter((m) => m.user === B.id)).toEqual([]) // nothing of the real dir went up
    expect(readSettings().syncOrigin).toEqual(recorded)
    expect(cloud.resolveCloudOriginChoice('merge')).toEqual({ ok: false, error: 'not-pending' })

    // Back to the real dir (B still signed in, Cloud on): its notes came from A — it asks.
    notesDir = realDir
    await boot()
    expect(cloud.getCloudOriginChoice()).toEqual({ previous: { userId: A.id, email: A.email }, next: { userId: B.id, email: B.email } })
    requests.length = 0
    expect((await cycle()).incomplete).toBe(true)
    expect(requests).toEqual([])
    expect(localDirs()).toEqual(['a-note-2222', 'mine-1111', 'welcome-9999'])
  })

  it('the Cloud seed from cloudSync.userId only happens for the default dir', async () => {
    writeSettings({ cloudSync: { enabled: true, userId: A.id, pullSeq: 3 } })
    const override = path.join(tmp, 'override-notes')
    fs.mkdirSync(override)
    writeLocal('mine-1111', files('1111')) // the real dir has notes; the override is empty
    notesDir = override
    env.userId = A.id
    env.email = A.email
    env.dek = A.dek
    await boot()
    expect(cloud.refreshCloudOriginGate()).toBe('clear')
    expect(readSettings().syncOrigin).toBeUndefined()
  })
})
