// Landing a file's pending Cloud upload before a version-history snapshot
// (electron/cloudVersions.ts → snapshotSectionVersion):
//   - the decisions, pure (cloudSyncLogic.planSnapshotFlush) — every outcome,
//     the in-flight wait and its timeout;
//   - the wiring through electron/cloudSync.ts with the REAL engine: a first
//     pull against a simulated server opens the push gate, then clean /
//     uploaded (through the CONDITIONAL upload RPC, never a forced upsert) /
//     stale / forbidden / failed (network, pending delete) / in-flight timeout.
// Electron, the account session and the DEK are mocked; no real network.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'
import { planSnapshotFlush, type SnapshotFlushDeps } from '../../electron/cloudSyncLogic'
import { generateDek } from '../../electron/cloudCrypto'

const env = vi.hoisted(() => ({
  userData: '',
  dek: null as Uint8Array | null,
  rest: null as null | ((endpoint: string, opts?: { method?: string; body?: unknown }) => Promise<{ status: number; json: unknown }>),
}))

vi.mock('electron', () => ({
  app: { getPath: () => env.userData, getVersion: () => '0.0.0', isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
  net: { isOnline: () => true, fetch: () => Promise.reject(new Error('offline in tests')) },
  powerMonitor: { on: () => {} },
}))

vi.mock('../../electron/account', () => ({
  getAccountStatus: () => ({ signedIn: true, entitlementsKnown: true, entitlements: { ai: false, cloud: true } }),
  getUserId: () => 'user-1',
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

// ── Pure decisions ────────────────────────────────────────────────────────────

describe('planSnapshotFlush', () => {
  const base = (o: Partial<SnapshotFlushDeps> = {}): SnapshotFlushDeps => ({
    enabled: true,
    localOnly: false,
    gateOpen: () => true,
    inFlight: () => false,
    timerArmed: () => false,
    journalOp: () => undefined,
    push: vi.fn(async () => ({ pushed: 1, errors: [] })),
    entitlementBlocked: () => false,
    sleep: async () => {},
    ...o,
  })

  it('guards: disabled, local-only, gated — nothing pushed', async () => {
    for (const deps of [base({ enabled: false }), base({ localOnly: true }), base({ gateOpen: () => false })]) {
      await planSnapshotFlush(deps)
      expect(deps.push).not.toHaveBeenCalled()
    }
    expect(await planSnapshotFlush(base({ enabled: false }))).toBe('disabled')
    expect(await planSnapshotFlush(base({ localOnly: true }))).toBe('disabled')
    expect(await planSnapshotFlush(base({ gateOpen: () => false }))).toBe('gated')
  })

  it('nothing pending → clean; a pending delete → failed', async () => {
    const clean = base()
    expect(await planSnapshotFlush(clean)).toBe('clean')
    expect(clean.push).not.toHaveBeenCalled()
    expect(await planSnapshotFlush(base({ journalOp: () => ({ op: 'delete' }) }))).toBe('failed')
  })

  it('armed timer or journal upsert → pushed: uploaded / stale / forbidden / failed', async () => {
    expect(await planSnapshotFlush(base({ timerArmed: () => true }))).toBe('uploaded')
    expect(await planSnapshotFlush(base({ journalOp: () => ({ op: 'upsert' }) }))).toBe('uploaded')
    let op: { op: string; stale?: true } = { op: 'upsert' }
    expect(await planSnapshotFlush(base({
      journalOp: () => op,
      push: async () => { op = { op: 'upsert', stale: true }; return { pushed: 0, errors: [] } },
    }))).toBe('stale')
    expect(await planSnapshotFlush(base({ timerArmed: () => true, push: async () => ({ pushed: 0, errors: ['x'] }) }))).toBe('failed')
    expect(await planSnapshotFlush(base({
      timerArmed: () => true, push: async () => ({ pushed: 0, errors: ['x'] }), entitlementBlocked: () => true,
    }))).toBe('forbidden')
    // Pushed nothing and not stale (account switched mid-way): not capturable.
    expect(await planSnapshotFlush(base({ timerArmed: () => true, push: async () => ({ pushed: 0, errors: [] }) }))).toBe('failed')
  })

  it('a stale upsert with no new edit is not re-sent', async () => {
    const deps = base({ journalOp: () => ({ op: 'upsert', stale: true }) })
    expect(await planSnapshotFlush(deps)).toBe('stale')
    expect(deps.push).not.toHaveBeenCalled()
    // A new edit re-armed the timer: it goes up.
    expect(await planSnapshotFlush(base({ timerArmed: () => true, journalOp: () => ({ op: 'upsert', stale: true }) }))).toBe('uploaded')
  })

  it('waits for an in-flight upload, then decides; gives up after the wait', async () => {
    let polls = 0
    expect(await planSnapshotFlush(base({ inFlight: () => polls++ < 3 }))).toBe('clean')
    expect(polls).toBe(4)
    let t = 0
    const stuck = base({ inFlight: () => true, now: () => t, sleep: async (ms) => { t += ms }, inFlightWaitMs: 200, pollMs: 50 })
    expect(await planSnapshotFlush(stuck)).toBe('failed')
    expect(stuck.push).not.toHaveBeenCalled()
  })
})

// ── Through the real engine ───────────────────────────────────────────────────

const T = '2026-11-14T10:00:00.000Z'
const NORMAL = 'plan-bbbb2222'
const WELCOME = 'welcome-to-noteflow-aaaa1111'
const REL = `${NORMAL}/s1.md`

function files(id: string, localOnly: boolean): Record<string, string> {
  const note: DiskNote = {
    id, title: id, tags: [], created: T, updated: T,
    ...(localOnly ? { localOnly: true } : {}),
    sections: [{ id: 's1', name: 'Main', content: `body of ${id}` }],
  }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}

let tmp: string
let notesDir: string
let cloud: typeof import('../../electron/cloudSync')
let calls: Array<{ endpoint: string; method?: string }>
/** Answer of the conditional upload RPC (cloud_upsert_file_v2). */
let uploadAnswer: () => Promise<{ status: number; json: unknown }>

function writeLocal(dir: string, f: Record<string, string>) {
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [name, c] of Object.entries(f)) fs.writeFileSync(path.join(notesDir, dir, name), c, 'utf-8')
}

const journal = (): Record<string, { op: string; stale?: boolean }> => {
  try {
    return JSON.parse(fs.readFileSync(path.join(env.userData, 'cloud-sync-state.json'), 'utf-8')).ops ?? {}
  } catch {
    return {}
  }
}

async function boot(enabled: boolean) {
  fs.writeFileSync(path.join(env.userData, 'settings.json'), JSON.stringify({ cloudSync: { enabled } }))
  vi.resetModules()
  cloud = await import('../../electron/cloudSync')
  const lo = await import('../../electron/localOnlyNotes')
  cloud.initCloudSync(notesDir)
  lo.primeLocalOnlyDirs(notesDir)
}

/** Boots with Cloud on and runs a first pull against an empty server (opens the push gate), journal empty. */
async function bootWithOpenGate() {
  await boot(true)
  await cloud.pullNotes(notesDir)
  expect(cloud.getCloudSyncStatus().initialPullStatus).toBe('ok')
  // The first pull's catch-up queued this device's files: land them, so the journal starts empty.
  await cloud.pushPathsNow(notesDir, [REL, `${NORMAL}/note.md`])
  expect(journal()).toEqual({})
  calls.length = 0
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-snapshot-flush-'))
  env.userData = path.join(tmp, 'userData')
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(env.userData, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  writeLocal(NORMAL, files('bbbb2222', false))
  writeLocal(WELCOME, files('aaaa1111', true))
  env.dek = generateDek()
  calls = []
  uploadAnswer = async () => ({ status: 200, json: { seq: 7 } })
  env.rest = async (endpoint, opts) => {
    calls.push({ endpoint, method: opts?.method })
    if (endpoint.startsWith('/rest/v1/rpc/cloud_upsert_file_v2')) return uploadAnswer()
    return { status: 200, json: [] }
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('flushPathForSnapshot (real engine)', () => {
  it('Cloud sync off → disabled; a local-only note → disabled; first pull pending → gated', async () => {
    await boot(false)
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('disabled')
    await boot(true)
    expect(await cloud.flushPathForSnapshot(notesDir, `${WELCOME}/s1.md`)).toBe('disabled')
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('gated')
    cloud.schedulePush(REL, 'edited offline')
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('gated')
    expect(calls.filter((c) => c.endpoint.includes('upsert'))).toEqual([])
  })

  it('nothing pending → clean, no request', async () => {
    await bootWithOpenGate()
    expect(journal()[REL]).toBeUndefined()
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('clean')
    expect(calls).toEqual([])
  })

  it('an armed push lands now through the conditional upload RPC → uploaded, journal cleared', async () => {
    await bootWithOpenGate()
    fs.writeFileSync(path.join(notesDir, REL), 'new text', 'utf-8')
    cloud.schedulePush(REL, 'new text')
    expect(journal()[REL]?.op).toBe('upsert')
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('uploaded')
    const writes = calls.filter((c) => c.method === 'POST').map((c) => c.endpoint)
    expect(writes).toEqual(['/rest/v1/rpc/cloud_upsert_file_v2']) // never the plain (forced) upsert on /files
    expect(journal()[REL]).toBeUndefined()
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('clean')
  })

  it('the server holds a newer version → stale (kept journaled, flagged)', async () => {
    await bootWithOpenGate()
    uploadAnswer = async () => ({ status: 200, json: null })
    cloud.schedulePush(REL, 'new text')
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('stale')
    expect(journal()[REL]).toMatchObject({ op: 'upsert', stale: true })
    calls.length = 0
    // Not re-sent while nothing new was edited.
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('stale')
    expect(calls).toEqual([])
  })

  it('no subscription (403) → forbidden', async () => {
    await bootWithOpenGate()
    uploadAnswer = async () => ({ status: 403, json: { code: '42501' } })
    cloud.schedulePush(REL, 'new text')
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('forbidden')
  })

  it('network failure → failed, still journaled', async () => {
    await bootWithOpenGate()
    uploadAnswer = async () => { throw new TypeError('fetch failed') }
    cloud.schedulePush(REL, 'new text')
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('failed')
    expect(journal()[REL]?.op).toBe('upsert')
  }, 10_000)

  it('a pending delete of the file → failed', async () => {
    await bootWithOpenGate()
    env.rest = async (endpoint, opts) => {
      calls.push({ endpoint, method: opts?.method })
      return { status: 500, json: null }
    }
    await cloud.scheduleDelete(REL)
    expect(journal()[REL]?.op).toBe('delete')
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('failed')
  }, 10_000)

  it('an upload in flight that never settles → failed after the (short) wait', async () => {
    await bootWithOpenGate()
    let release: () => void = () => {}
    uploadAnswer = () => new Promise((resolve) => { release = () => resolve({ status: 200, json: { seq: 9 } }) })
    const inFlight = cloud.pushPathsNow(notesDir, [REL])
    await new Promise((r) => setTimeout(r, 20)) // the upload reaches the RPC
    expect(await cloud.flushPathForSnapshot(notesDir, REL, { inFlightWaitMs: 60, pollMs: 10 })).toBe('failed')
    release()
    await inFlight
    // Once it settles, the next flush sees it landed.
    expect(await cloud.flushPathForSnapshot(notesDir, REL)).toBe('clean')
  })
})
