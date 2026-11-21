// NoteFlow Cloud: a version uploaded by THIS device must never come back from a
// pull as "another device's" and be merged against the next local save.
// Real case (2026-11-21): a conflict block between two consecutive saves of the
// same line typed on one computer ("…la IAtambién…" / "…la IA también…").
//   - pure: ownEchoHashes (which remote rows are own versions) and
//     queuedUploadBaseSeq (the base an upload sends after waiting its turn);
//   - the REAL engine (electron/cloudSync.ts) against a simulated server that
//     implements cloud_upsert_file_v2's base-seq check: an upload whose answer
//     is lost, two uploads of one file overlapping, and an upload that waited
//     while a pull merged another device's version.
// Electron, the account session and the DEK are mocked; no real network.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'
import {
  buildFileUpsertRow,
  decryptFileRow,
  hashForBase,
  ownEchoHashes,
  planThreeWayDir,
  queuedUploadBaseSeq,
  type CloudFileUpsertRow,
} from '../../electron/cloudSyncLogic'
import { generateDek, unwrapKey } from '../../electron/cloudCrypto'

type RestAnswer = { status: number; json: unknown }
type UploadBody = {
  p_path_key: string
  p_path_ct: string
  p_content_ct: string
  p_key_ct: string
  p_updated_at: string
  p_base_seq: number | null
  p_anchor_key: string | null
}

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

const DIR = 'backlog-bbbb2222'
const REL = `${DIR}/s1.md`
const ANCHOR = `${DIR}/note.md`
const T = '2026-11-21T10:00:00.000Z'
const HEAD = ['- [ ] Sidebar polish', '- [ ] Export to PDF', '- [ ] Table totals', '- [ ] Faster search', ''].join('\n')
// The line being typed: the last synced version (the base) already had its
// beginning. (With a base that lacks the line altogether the merge keeps both
// versions as two lines instead of a block — just as wrong.)
const V0 = `${HEAD}- [ ] Que la\n`
const V1 = `${HEAD}- [ ] Que la IAtambién pueda…\n` // first save
const V2 = `${HEAD}- [ ] Que la IA también pueda…\n` // the same line, fixed a moment later

// ── Pure ──────────────────────────────────────────────────────────────────────

const T_MS = Date.parse(T)

describe('ownEchoHashes', () => {
  const row = (content: string | null, relPath = REL, updatedAtMs = T_MS) => ({ relPath, seq: 9, content, updatedAtMs })
  const h = (text: string) => hashForBase(REL, text)
  const v = (text: string, updatedAtMs = T_MS) => ({ hash: h(text), updatedAtMs })
  const none = new Map<string, Array<{ hash: string; updatedAtMs: number }>>()

  it('knows every upload on the wire of a file, not only the last one', () => {
    const sent = new Map([[REL, [v(V1), v(V2)]]])
    expect(ownEchoHashes([row(V1)], { [REL]: V2 }, sent, none)).toEqual(new Map([[REL, h(V1)]]))
    expect(ownEchoHashes([row(V2)], { [REL]: V2 }, sent, none)).toEqual(new Map([[REL, h(V2)]]))
  })

  it("another device's content, a tombstone or another file are not ours", () => {
    const sent = new Map([[REL, [v(V1)]]])
    expect(ownEchoHashes([row('from the phone')], { [REL]: V2 }, sent, none).size).toBe(0)
    expect(ownEchoHashes([row(null)], { [REL]: V2 }, sent, none).size).toBe(0)
    expect(ownEchoHashes([row(V1, `${DIR}/s2.md`)], { [REL]: V2 }, sent, none).size).toBe(0)
  })

  it('the same bytes written by another device (another updated_at) are NOT ours', () => {
    const versions = new Map([[REL, [v(V1)]]])
    const phone = row(V1, REL, T_MS + 60_000)
    expect(ownEchoHashes([phone], { [REL]: V2 }, versions, none).size).toBe(0)
    expect(ownEchoHashes([phone], { [REL]: V2 }, none, versions).size).toBe(0)
  })

  it('an upload whose answer may have been lost is still ours — unless the local file is still that version', () => {
    const lost = new Map([[REL, [v(V1)]]])
    expect(ownEchoHashes([row(V1)], { [REL]: V2 }, none, lost)).toEqual(new Map([[REL, h(V1)]]))
    // Same content on both sides: left to the planner's normal rule (adopt + settle).
    expect(ownEchoHashes([row(V1)], { [REL]: V1 }, none, lost).size).toBe(0)
    // File deleted here meanwhile: the row is still the version this device sent.
    expect(ownEchoHashes([row(V1)], {}, none, lost)).toEqual(new Map([[REL, h(V1)]]))
  })

  it('fed to planThreeWayDir: two saves of one line here never become a conflict block', () => {
    const anchor = serializeNoteFolder(
      { id: 'bbbb2222', title: 'Backlog', tags: [], created: T, updated: T, sections: [{ id: 's1', name: 'Main', content: V0 }] },
      { preserveUpdated: true },
    ).files['note.md']
    const local = { [ANCHOR]: anchor, [REL]: V2 }
    const remote = [{ relPath: REL, seq: 20, content: V1, updatedAtMs: T_MS }]
    const input = {
      dir: DIR,
      local,
      remote,
      bases: { [ANCHOR]: { seq: 2, hash: hashForBase(ANCHOR, anchor) }, [REL]: { seq: 1, hash: h(V0) } },
      baseContent: () => V0,
      pendingUpserts: new Set([REL]),
      staleUpserts: new Set([REL]),
      copiedUpserts: new Set<string>(),
      pendingDeletes: new Set<string>(),
      nowIso: T,
    }
    // What the pull did before: the first save's row is "the version already synced".
    const before = planThreeWayDir(input)
    expect(before.conflictMarkerSections).toEqual(['s1.md'])
    expect(before.writes[0].content).toContain('IAtambién')
    // With the own versions known (in either list) it is the base: the fixed line stays and goes up.
    for (const [sent, lost] of [
      [new Map([[REL, [v(V1), v(V2)]]]), none],
      [none, new Map([[REL, [v(V1)]]])],
    ] as const) {
      const plan = planThreeWayDir({ ...input, inFlightHashes: ownEchoHashes(remote, local, sent, lost) })
      expect(plan.conflictMarkerSections).toEqual([])
      expect(plan.writes).toEqual([])
      expect(plan.bases[REL]).toEqual({ seq: 20, hash: h(V1) })
      expect(plan.upload).toEqual([REL])
    }
    // The same text from another device: the normal rule (a block here), never an echo.
    const phone = [{ ...remote[0], updatedAtMs: T_MS + 60_000 }]
    const other = planThreeWayDir({ ...input, remote: phone, inFlightHashes: ownEchoHashes(phone, local, none, new Map([[REL, [v(V1)]]])) })
    expect(other.conflictMarkerSections).toEqual(['s1.md'])
  })
})

describe('queuedUploadBaseSeq', () => {
  const b = (seq: number, hash: string) => ({ seq, hash })
  it('base unchanged while it waited → that seq (none → null)', () => {
    expect(queuedUploadBaseSeq(b(5, 'a'), b(5, 'a'), undefined)).toBe(5)
    expect(queuedUploadBaseSeq(undefined, undefined, 3)).toBeNull()
    expect(queuedUploadBaseSeq(b(5, 'a'), undefined, 5)).toBeNull() // forgotten (upload without a seq)
  })
  it('base moved to a version of this device (the upload ahead landed, or the pull adopted an own row) → its seq', () => {
    expect(queuedUploadBaseSeq(b(5, 'a'), b(6, 'v1'), 6)).toBe(6)
    expect(queuedUploadBaseSeq(undefined, b(1, 'v1'), 1)).toBe(1) // a new file's first upload
  })
  it("base moved to anything else (a pull reconciled another device's version) → stale, not sent", () => {
    expect(queuedUploadBaseSeq(b(5, 'a'), b(7, 'phone'), 6)).toBe('stale')
    expect(queuedUploadBaseSeq(b(5, 'a'), b(7, 'phone'), undefined)).toBe('stale')
    expect(queuedUploadBaseSeq(undefined, b(7, 'phone'), undefined)).toBe('stale')
  })
})

// ── Through the real engine ───────────────────────────────────────────────────

interface ServerRow extends CloudFileUpsertRow {
  seq: number
}

let tmp: string
let notesDir: string
let cloud: typeof import('../../electron/cloudSync')
let rows: Map<string, ServerRow>
let lastSeq: number
/** Upload RPC requests that reached the "network". */
let uploads: number
/** Answer of the conditional upload RPC; the default applies it to the simulated server. */
let onUpload: (body: UploadBody) => Promise<RestAnswer> | RestAnswer

/** cloud_upsert_file_v2 (migration 0014): written only while the row is still at the base seq. */
function applyUpsert(body: UploadBody): number | null {
  const current = rows.get(body.p_path_key)
  if (body.p_base_seq !== null && body.p_base_seq !== undefined) {
    if (current && current.seq !== body.p_base_seq) return null
  } else {
    const newest = [current, body.p_anchor_key ? rows.get(body.p_anchor_key) : undefined]
      .filter((r): r is ServerRow => !!r)
      .map((r) => Date.parse(r.updated_at))
    if (newest.some((ms) => ms > Date.parse(body.p_updated_at))) return null
  }
  lastSeq++
  rows.set(body.p_path_key, {
    path_key: body.p_path_key,
    path_ct: body.p_path_ct,
    content_ct: body.p_content_ct,
    key_ct: body.p_key_ct,
    updated_at: body.p_updated_at,
    deleted: false,
    seq: lastSeq,
  })
  return lastSeq
}

async function serverRowOf(relPath: string): Promise<ServerRow> {
  for (const row of rows.values()) {
    if ((await decryptFileRow(env.dek!, row)).relPath === relPath) return row
  }
  throw new Error(`no server row for ${relPath}`)
}

async function serverContent(relPath: string): Promise<string> {
  return (await decryptFileRow(env.dek!, await serverRowOf(relPath))).content
}

/** Another device uploads `content` over the current row of `relPath`. */
async function otherDeviceWrites(relPath: string, content: string): Promise<void> {
  const current = await serverRowOf(relPath)
  const noteKey = await unwrapKey(current.key_ct, env.dek!)
  const row = await buildFileUpsertRow(env.dek!, noteKey, relPath, content, new Date().toISOString())
  lastSeq++
  rows.set(row.path_key, { ...row, seq: lastSeq })
}

const disk = (relPath: string) => fs.readFileSync(path.join(notesDir, relPath), 'utf-8')

/** A save of the section in the app: disk + the debounced push (journaled). */
function save(content: string): void {
  fs.writeFileSync(path.join(notesDir, REL), content, 'utf-8')
  cloud.schedulePush(REL, content)
}

const journal = (): Record<string, { op: string; stale?: boolean }> => {
  try {
    return JSON.parse(fs.readFileSync(path.join(env.userData, 'cloud-sync-state.json'), 'utf-8')).ops ?? {}
  } catch {
    return {}
  }
}

/** Lets pending promises / I/O run (never a timer: works with fake timers too). */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 5000 && !cond(); i++) await tick()
  expect(cond()).toBe(true)
}

/** From here on the engine's timers (push debounce) run on a fake clock. */
function fakeClock(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

/**
 * What the app does by itself, with no new save: a sync cycle (pull, then the
 * journal drain), the debounced pushes firing, and another cycle. Needs fakeClock().
 */
async function runSyncCycles(): Promise<void> {
  await cloud.pullNotes(notesDir)
  await cloud.retrySyncJournal(notesDir)
  await vi.advanceTimersByTimeAsync(6000)
  await until(() => !cloud.hasPendingRemoteMutations())
  await cloud.pullNotes(notesDir)
  await cloud.retrySyncJournal(notesDir)
  await vi.advanceTimersByTimeAsync(6000)
  await until(() => !cloud.hasPendingRemoteMutations())
}

/** The first request commits on the server and its answer is lost; the retry is answered normally. */
function loseFirstAnswer(): void {
  let first = true
  onUpload = (body) => {
    const seq = applyUpsert(body)
    if (first) {
      first = false
      throw new TypeError('fetch failed')
    }
    return { status: 200, json: seq }
  }
}

const serverAnswers = () => {
  onUpload = (body) => ({ status: 200, json: applyUpsert(body) })
}

/** Cloud on, first pull done (push gate open), the note uploaded: every file has its base. */
async function bootSynced() {
  fs.writeFileSync(path.join(env.userData, 'settings.json'), JSON.stringify({ cloudSync: { enabled: true } }))
  vi.resetModules()
  cloud = await import('../../electron/cloudSync')
  cloud.initCloudSync(notesDir)
  await cloud.pullNotes(notesDir)
  expect(cloud.getCloudSyncStatus().initialPullStatus).toBe('ok')
  await cloud.pushPathsNow(notesDir, [REL, ANCHOR])
  expect(journal()).toEqual({})
  expect(await serverContent(REL)).toBe(V0)
  uploads = 0
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-own-echo-'))
  env.userData = path.join(tmp, 'userData')
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(env.userData, { recursive: true })
  fs.mkdirSync(path.join(notesDir, DIR), { recursive: true })
  const note: DiskNote = {
    id: 'bbbb2222', title: 'Backlog', tags: [], created: T, updated: T,
    sections: [{ id: 's1', name: 'Main', content: V0 }],
  }
  for (const [name, c] of Object.entries(serializeNoteFolder(note, { preserveUpdated: true }).files)) {
    fs.writeFileSync(path.join(notesDir, DIR, name), c, 'utf-8')
  }
  env.dek = generateDek()
  rows = new Map()
  lastSeq = 0
  uploads = 0
  onUpload = (body) => ({ status: 200, json: applyUpsert(body) })
  env.rest = async (endpoint, opts) => {
    if (endpoint.startsWith('/rest/v1/rpc/cloud_upsert_file_v2')) {
      uploads++
      return onUpload(opts?.body as UploadBody)
    }
    if (endpoint.startsWith('/rest/v1/files?') && (opts?.method ?? 'GET') === 'GET') {
      let out = [...rows.values()].sort((a, b) => a.seq - b.seq)
      const after = /[?&]seq=gt\.(\d+)/.exec(endpoint)
      if (after) out = out.filter((r) => r.seq > Number(after[1]))
      const keys = /path_key=in\.\(([^)]*)\)/.exec(endpoint)
      if (keys) {
        const wanted = new Set(keys[1].split(',').map((k) => k.replace(/"/g, '')))
        out = out.filter((r) => wanted.has(r.path_key))
      }
      const one = /path_key=eq\.([^&]+)/.exec(endpoint)
      if (one) out = out.filter((r) => r.path_key === decodeURIComponent(one[1]))
      if (endpoint.includes('deleted=eq.false')) out = out.filter((r) => !r.deleted)
      return { status: 200, json: out }
    }
    return { status: 200, json: [] }
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('own uploads through the real engine', () => {
  it('an upload whose answer is lost (the retry is rejected by its own row): the next save is not merged against it', async () => {
    await bootSynced()
    save(V1)
    // The first request reaches the server and commits; its answer never
    // arrives. The retry carries the same base seq → rejected as stale.
    loseFirstAnswer()
    await cloud.pushPathsNow(notesDir, [REL])
    expect(uploads).toBe(2)
    expect(await serverContent(REL)).toBe(V1) // the server does hold the first save
    expect(journal()[REL]).toMatchObject({ op: 'upsert', stale: true })

    fakeClock()
    save(V2) // the user fixes the line
    await cloud.pullNotes(notesDir)
    expect(disk(REL)).toBe(V2)
    expect(disk(REL)).not.toContain('⚠️')
    expect(cloud.getCloudSyncStatus().conflictMerges).toBeUndefined()

    // …and it goes up by itself on top of this device's own row.
    await runSyncCycles()
    expect(await serverContent(REL)).toBe(V2)
    expect(disk(REL)).toBe(V2)
    expect(journal()[REL]).toBeUndefined()
  }, 15_000)

  it('a lost answer with no newer save: settled as before (same content), nothing re-sent', async () => {
    await bootSynced()
    save(V1)
    loseFirstAnswer()
    await cloud.pushPathsNow(notesDir, [REL])
    expect(journal()[REL]).toMatchObject({ op: 'upsert', stale: true })
    uploads = 0
    await cloud.pullNotes(notesDir)
    expect(disk(REL)).toBe(V1)
    expect(journal()[REL]).toBeUndefined()
    expect(uploads).toBe(0)
  }, 15_000)

  it('a second save while the first upload is unanswered waits for it; a pull in between sees the first as own', async () => {
    await bootSynced()
    fakeClock()
    save(V1)
    let releaseFirst: () => void = () => {}
    onUpload = (body) => {
      const seq = applyUpsert(body) // committed on arrival
      if (uploads === 1) return new Promise((resolve) => { releaseFirst = () => resolve({ status: 200, json: seq }) })
      return { status: 200, json: seq }
    }
    const first = cloud.pushPathsNow(notesDir, [REL])
    await until(() => uploads === 1)

    save(V2)
    const second = cloud.pushPathsNow(notesDir, [REL])
    for (let i = 0; i < 50; i++) await tick()
    expect(uploads).toBe(1) // not sent next to the first one (it would be rejected by the first one's row)

    await cloud.pullNotes(notesDir) // e.g. a Realtime signal: the CLI just uploaded something of this note
    expect(disk(REL)).toBe(V2)
    expect(disk(REL)).not.toContain('⚠️')

    releaseFirst()
    await first
    expect(await second).toEqual({ pushed: 1, errors: [] })
    expect(uploads).toBe(2)
    expect(await serverContent(REL)).toBe(V2)
    expect(journal()[REL]).toBeUndefined()
    expect(cloud.getCloudSyncStatus().conflictMerges).toBeUndefined()
    await runSyncCycles()
    expect(await serverContent(REL)).toBe(V2)
    expect(journal()[REL]).toBeUndefined()
  })

  it("an upload that waited while a pull merged another device's version is not sent over the merge; the merge goes up by itself", async () => {
    await bootSynced()
    fakeClock()
    const PHONE = V0.replace('- [ ] Sidebar polish', '- [x] Sidebar polish')
    save(V1)
    let openGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => { openGate = resolve })
    onUpload = async (body) => {
      if (uploads === 1) await gate // the first request is slow to reach the server
      return { status: 200, json: applyUpsert(body) }
    }
    const first = cloud.pushPathsNow(notesDir, [REL])
    await until(() => uploads === 1)
    await otherDeviceWrites(REL, PHONE)

    save(V2)
    const second = cloud.pushPathsNow(notesDir, [REL])
    await cloud.pullNotes(notesDir)
    const merged = disk(REL)
    expect(merged).toContain('- [x] Sidebar polish')
    expect(merged).toContain('- [ ] Que la IA también pueda…')
    expect(merged).not.toContain('⚠️')

    openGate()
    expect(await first).toEqual({ pushed: 0, errors: [] }) // rejected: the phone's row is there
    expect(await second).toEqual({ pushed: 0, errors: [] })
    expect(uploads).toBe(1) // the queued one was never sent
    expect(await serverContent(REL)).toBe(PHONE)

    // The merge goes up on top of the phone's seq — no manual push.
    await runSyncCycles()
    expect(await serverContent(REL)).toBe(merged)
    expect(disk(REL)).toBe(merged)
    expect(journal()[REL]).toBeUndefined()
  })

  it('a newer save ON THE WIRE with the old base while the pull adopts the lost-answer row: it still ends on the server', async () => {
    await bootSynced()
    save(V1)
    loseFirstAnswer()
    await cloud.pushPathsNow(notesDir, [REL]) // server: V1; here: op stale, base still V0's
    expect(journal()[REL]).toMatchObject({ op: 'upsert', stale: true })

    fakeClock()
    uploads = 0
    save(V2)
    let openGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => { openGate = resolve })
    onUpload = async (body) => {
      await gate
      return { status: 200, json: applyUpsert(body) }
    }
    const second = cloud.pushPathsNow(notesDir, [REL]) // carries the base seq of V0
    await until(() => uploads === 1)
    await cloud.pullNotes(notesDir) // adopts V1's row as the base
    expect(disk(REL)).toBe(V2)

    openGate()
    expect(await second).toEqual({ pushed: 0, errors: [] }) // rejected by this device's own V1 row
    serverAnswers()
    await runSyncCycles()
    expect(await serverContent(REL)).toBe(V2)
    expect(disk(REL)).toBe(V2)
    expect(disk(REL)).not.toContain('⚠️')
    expect(journal()[REL]).toBeUndefined()
  }, 15_000)

  it('…and a save QUEUED behind it goes out on top of the adopted own row', async () => {
    await bootSynced()
    save(V1)
    loseFirstAnswer()
    await cloud.pushPathsNow(notesDir, [REL])

    fakeClock()
    uploads = 0
    const MID = V1.replace('IAtambién', 'IAtambién,')
    save(MID)
    let openGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => { openGate = resolve })
    onUpload = async (body) => {
      if (uploads === 1) await gate
      return { status: 200, json: applyUpsert(body) }
    }
    const mid = cloud.pushPathsNow(notesDir, [REL]) // on the wire, with the base seq of V0
    await until(() => uploads === 1)
    save(V2)
    const last = cloud.pushPathsNow(notesDir, [REL]) // queued behind it
    await cloud.pullNotes(notesDir) // adopts V1's row as the base
    expect(disk(REL)).toBe(V2)

    openGate()
    expect(await mid).toEqual({ pushed: 0, errors: [] })
    expect(await last).toEqual({ pushed: 1, errors: [] })
    expect(await serverContent(REL)).toBe(V2)
    await runSyncCycles()
    expect(await serverContent(REL)).toBe(V2)
    expect(disk(REL)).not.toContain('⚠️')
    expect(journal()[REL]).toBeUndefined()
  }, 15_000)

  it("A → B → A with both uploads failing offline, then another device uploads a byte-identical B: its change is not lost", async () => {
    await bootSynced()
    const B = V0.replace('- [ ] Sidebar polish', '- [x] Sidebar polish')
    onUpload = () => {
      throw new TypeError('fetch failed') // offline: nothing reaches the server
    }
    save(B)
    expect(await cloud.pushPathsNow(notesDir, [REL])).toEqual({ pushed: 0, errors: [REL] })
    save(V0)
    expect(await cloud.pushPathsNow(notesDir, [REL])).toEqual({ pushed: 0, errors: [REL] })
    expect(await serverContent(REL)).toBe(V0)

    await otherDeviceWrites(REL, B)
    serverAnswers()
    fakeClock()
    uploads = 0
    await runSyncCycles()
    expect(disk(REL)).toBe(B)
    expect(await serverContent(REL)).toBe(B)
    expect(journal()[REL]).toBeUndefined()
  }, 15_000)

  it('a clean rejection (no lost answer) is not remembered as an own version', async () => {
    await bootSynced()
    const PHONE = V0.replace('- [ ] Sidebar polish', '- [x] Sidebar polish')
    await otherDeviceWrites(REL, PHONE)
    save(V1)
    expect(await cloud.pushPathsNow(notesDir, [REL])).toEqual({ pushed: 0, errors: [] }) // stale at the first attempt
    expect(uploads).toBe(1)
    // The phone now uploads exactly V1 (same bytes, same updated_at as this
    // device's row would carry): still another device's row — merged normally.
    const row = await serverRowOf(REL)
    const noteKey = await unwrapKey(row.key_ct, env.dek!)
    lastSeq++
    rows.set(row.path_key, { ...(await buildFileUpsertRow(env.dek!, noteKey, REL, V1, T)), seq: lastSeq })
    fakeClock()
    save(V2)
    await cloud.pullNotes(notesDir)
    expect(disk(REL)).toContain('⚠️') // both versions kept: nothing dropped on a guess
    expect(disk(REL)).toContain('IA también')
    expect(disk(REL)).toContain('IAtambién')
  })
})
