// End-to-end per-file merge of the CLI's NoteFlow Cloud engine (cli/noteflow.js):
// the real cloudPullNow / syncPushNoteFiles / cmdCloudPush, real crypto, real
// files, against an IN-MEMORY server behind a `fetch` mock that implements the
// SQL of migrations 0011 (cloud_upsert_file: updated_at rule) and 0014
// (cloud_upsert_file_v2: compare-and-swap on the base seq). Notes and settings
// live in throwaway dirs (NOTEFLOW_NOTES_DIR + APPDATA / XDG_CONFIG_HOME) and
// no request ever leaves the process — nothing touches the real Cloud.
//
// The bug (2026-11-03): a device editing a section OFFLINE on top of a version
// that another device had already changed clobbered the other device's
// sections when it reconnected (last-writer-wins per note folder).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { serializeNoteFolder, splitFrontmatter, NOTE_MD, type DiskNote } from '../../electron/noteFormat'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')

const USER = 'user-1'
const DIR = 'noteflow-abc12345'
const ANCHOR = `${DIR}/${NOTE_MD}`
const T0 = '2026-10-30T18:00:00.000Z'
const T_PC = '2026-11-01T20:00:00.000Z'
const T_CLI = '2026-11-02T10:03:00.000Z'

type Row = {
  path_key: string; path_ct: string; content_ct: string; key_ct: string
  updated_at: string; deleted: boolean; seq: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any

/** public.files of ONE user + the RPCs, as PostgREST would answer them. */
class Server {
  rows = new Map<string, Row>()
  seq = 0
  v2Missing = false
  v1Missing = false
  failUploads = false
  offline = false
  calls: string[] = []
  v2BaseSeqs: Array<number | null> = []
  constructor(private cli: Cli, private dek: Uint8Array) {}

  private write(r: Omit<Row, 'seq'>): number {
    const seq = ++this.seq
    this.rows.set(r.path_key, { ...r, seq })
    return seq
  }

  /** A write of another device (the "PC"): straight into the table. */
  async put(noteKey: Uint8Array, relPath: string, content: string, updatedAt: string) {
    const row = await this.cli.buildFileUpsertRow(this.dek, noteKey, relPath, content, updatedAt)
    return this.write(row)
  }

  /** The tombstone PATCH of a section delete on another device (updated_at = deletion time). */
  async tombstone(relPath: string, at: string) {
    const key = await this.cli.derivePathKeyHmac(this.dek, relPath)
    const row = this.rows.get(key)
    if (row) this.write({ ...row, deleted: true, content_ct: '', updated_at: at })
  }

  keyOf(relPath: string): Promise<string> {
    return this.cli.derivePathKeyHmac(this.dek, relPath)
  }

  async seqOf(relPath: string): Promise<number | undefined> {
    return this.rows.get(await this.cli.derivePathKeyHmac(this.dek, relPath))?.seq
  }

  async content(relPath: string): Promise<string | null | undefined> {
    const key = await this.cli.derivePathKeyHmac(this.dek, relPath)
    const row = this.rows.get(key)
    if (!row) return undefined
    if (row.deleted) return null
    const noteKey = await this.cli.unwrapKey(row.key_ct, this.dek)
    return this.cli.decryptContent(noteKey, row.content_ct)
  }

  private newest(keys: Array<string | null>): number {
    let max = -Infinity
    for (const k of keys) {
      const row = k ? this.rows.get(k) : undefined
      if (row) max = Math.max(max, Date.parse(row.updated_at))
    }
    return max
  }

  async handle(url: string, init: { method?: string; body?: string } = {}): Promise<{ status: number; json: unknown }> {
    const u = new URL(url)
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    const p = u.pathname
    if (p === '/auth/v1/token') return { status: 200, json: { access_token: 'at', refresh_token: 'rt2' } }
    if (p === '/rest/v1/user_keys') return { status: 200, json: [{ mode: 'managed' }] }
    if (p === '/functions/v1/cloud-keys/unlock') return { status: 200, json: { dek: Buffer.from(this.dek).toString('base64url') } }
    if (p === '/rest/v1/rpc/cloud_upsert_file_v2') {
      this.calls.push(`v2 ${body.p_path_key}`)
      if (this.v2Missing) return { status: 404, json: { code: 'PGRST202' } }
      if (this.failUploads) return { status: 400, json: null }
      this.v2BaseSeqs.push(body.p_base_seq)
      const row = this.rows.get(body.p_path_key)
      if (body.p_base_seq !== null) {
        if (row && row.seq !== body.p_base_seq) return { status: 200, json: null }
      } else if (this.newest([body.p_path_key, body.p_anchor_key]) > Date.parse(body.p_updated_at)) {
        return { status: 200, json: null }
      }
      return { status: 200, json: this.write(this.rowOf(body)) }
    }
    if (p === '/rest/v1/rpc/cloud_upsert_file') {
      this.calls.push(`v1 ${body.p_path_key}`)
      if (this.v1Missing) return { status: 404, json: { code: 'PGRST202' } }
      if (this.failUploads) return { status: 400, json: null }
      if (this.newest([body.p_path_key, body.p_anchor_key]) > Date.parse(body.p_updated_at)) return { status: 200, json: false }
      this.write(this.rowOf(body))
      return { status: 200, json: true }
    }
    if (p === '/rest/v1/files' && method === 'POST') {
      this.calls.push(`plain ${body.path_key}`)
      if (this.failUploads) return { status: 400, json: null }
      const { user_id: _u, ...row } = body
      this.write(row)
      return { status: 201, json: null }
    }
    if (p === '/rest/v1/files' && method === 'PATCH') {
      for (const key of this.pathKeysOf(u)) {
        const row = this.rows.get(key)
        if (row) this.write({ ...row, ...body })
      }
      return { status: 204, json: null }
    }
    if (p === '/rest/v1/files' && method === 'GET') {
      const keyFilter = u.searchParams.get('path_key')
      let rows = [...this.rows.values()]
      if (keyFilter) {
        const keys = new Set(this.pathKeysOf(u))
        rows = rows.filter((r) => keys.has(r.path_key))
      } else {
        const after = Number((u.searchParams.get('seq') || 'gt.0').slice(3))
        rows = rows.filter((r) => r.seq > after)
        if (u.searchParams.get('deleted') === 'eq.false') rows = rows.filter((r) => !r.deleted)
        rows.sort((a, b) => a.seq - b.seq)
        rows = rows.slice(0, Number(u.searchParams.get('limit') || 1000))
      }
      return { status: 200, json: rows.map((r) => ({ ...r })) }
    }
    return { status: 404, json: { message: `unexpected ${method} ${p}` } }
  }

  private rowOf(body: Record<string, unknown>): Omit<Row, 'seq'> {
    return {
      path_key: body.p_path_key as string, path_ct: body.p_path_ct as string, content_ct: body.p_content_ct as string,
      key_ct: body.p_key_ct as string, updated_at: new Date(body.p_updated_at as string).toISOString(), deleted: false,
    }
  }

  private pathKeysOf(u: URL): string[] {
    const v = u.searchParams.get('path_key') || ''
    if (v.startsWith('eq.')) return [v.slice(3)]
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((k) => k.replace(/^"|"$/g, ''))
    return []
  }
}

let tmp: string
let notesDir: string
let configDir: string
let cli: Cli
let server: Server
let noteKey: Uint8Array
let logs: string[]
const savedEnv = { ...process.env }
const savedFetch = globalThis.fetch

function settingsPath() {
  return path.join(configDir, 'noteflow', 'settings.json')
}
function readSettings(): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
}
function patchCliCloud(patch: Record<string, unknown>) {
  const s = readSettings()
  s.cliCloud = { ...s.cliCloud, ...patch }
  for (const k of Object.keys(s.cliCloud)) if (s.cliCloud[k] === undefined) delete s.cliCloud[k]
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
}

function note(updated: string, sections: Record<string, string>, extra?: Partial<DiskNote>): DiskNote {
  return {
    id: 'abc12345', title: 'NOTEFLOW', tags: ['dev'], created: '2026-10-01T00:00:00.000Z', updated,
    sections: Object.entries(sections).map(([id, content]) => ({ id, name: id.toUpperCase(), content })),
    ...extra,
  }
}
const BASE = { a: 'a v1', b: 'b v1', c: 'c v1' }

/** The "PC" (desktop app) saves a version of the note: note.md + the given sections. */
async function pcSave(n: DiskNote, sections: string[]) {
  const files = serializeNoteFolder(n, { preserveUpdated: true }).files
  for (const name of [...sections.map((s) => `${s}.md`), NOTE_MD]) await server.put(noteKey, `${DIR}/${name}`, files[name], n.updated)
}

const localPath = (rel: string) => path.join(notesDir, rel)
const readLocal = (rel: string) => fs.readFileSync(localPath(rel), 'utf-8')
/** An edit of this machine: section content + note.md's `updated:`. */
function cliEdit(section: string, content: string, updated: string) {
  fs.writeFileSync(localPath(`${DIR}/${section}.md`), content)
  fs.writeFileSync(localPath(ANCHOR), readLocal(ANCHOR).replace(/^updated:.*$/m, `updated: "${updated}"`))
}
const fmOf = (anchor: string) => yaml.load(splitFrontmatter(anchor).frontmatter) as Record<string, unknown>
const otherDirs = () => fs.readdirSync(notesDir).filter((d) => d !== DIR && fs.statSync(path.join(notesDir, d)).isDirectory())

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-3way-'))
  notesDir = path.join(tmp, 'notes')
  configDir = path.join(tmp, 'config')
  fs.mkdirSync(path.join(configDir, 'noteflow'), { recursive: true })
  fs.mkdirSync(notesDir)
  process.env.APPDATA = configDir
  process.env.XDG_CONFIG_HOME = configDir
  process.env.NOTEFLOW_NOTES_DIR = notesDir
  delete process.env.NOTEFLOW_CLOUD_PASSPHRASE
  fs.writeFileSync(settingsPath(), JSON.stringify({
    language: 'en',
    cliAccount: { email: 'me@example.com', userId: USER, refreshToken: Buffer.from('rt').toString('base64') },
    cliCloud: { enabled: true, userId: USER },
  }))
  delete require.cache[CLI_PATH]
  cli = require(CLI_PATH)
  const dek = cli.generateDek()
  noteKey = cli.generateNoteKey()
  server = new Server(cli, dek)
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    if (server.offline) throw new TypeError('fetch failed')
    const res = await server.handle(String(url), init)
    return { status: res.status, json: async () => res.json }
  }) as unknown as typeof fetch
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  // Friday: the PC creates the note; this machine syncs it (first pull).
  await pcSave(note(T0, BASE), ['a', 'b', 'c'])
  await cli.cloudPullNow()
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = savedFetch
  process.env = { ...savedEnv }
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('first sync records the bases', () => {
  it('every file of the pulled note gets {seq, hash}; the bootstrap is marked done', () => {
    const bases = cli.cliCloudBasesSnapshot()
    expect(Object.keys(bases).sort()).toEqual([`${DIR}/a.md`, `${DIR}/b.md`, `${DIR}/c.md`, ANCHOR])
    expect(bases[`${DIR}/a.md`]).toEqual({ seq: 1, hash: cli.hashForBase(`${DIR}/a.md`, 'a v1') })
    expect(readSettings().cliCloud.basesBootstrapped).toBe(true)
    const file = JSON.parse(fs.readFileSync(cli.CLOUD_BASES_PATH, 'utf-8'))
    expect(file.userId).toBe(USER)
    expect(file.bases).toEqual(bases)
  })
})

describe('the real case: the CLI edits a section offline while the PC edited another', () => {
  it('merges A (CLI) + B (PC): no copy, nothing clobbered, note.md re-uploaded on top of the PC seq', async () => {
    // Weekend: the PC edits B (and its tags) and syncs.
    await pcSave(note(T_PC, { ...BASE, b: 'b PC #pc' }, { tags: ['dev', 'pc'] }), ['b'])
    // Monday: this machine edits A while offline — the upload fails, it stays pending.
    server.failUploads = true
    cliEdit('a', 'a CLI', T_CLI)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'a.md', 'b.md', 'c.md'])
    expect(readSettings().cliCloud.pendingUpserts.sort()).toEqual([`${DIR}/a.md`, ANCHOR])
    // Back online: `noteflow pull`.
    server.failUploads = false
    const pcAnchorSeq = server.seq // pcSave writes note.md last
    const res = await cli.cloudPullNow()
    expect(res.errors).toBe(0)
    expect(otherDirs()).toEqual([]) // no conflict copy
    expect(readLocal(`${DIR}/a.md`)).toBe('a CLI')
    expect(readLocal(`${DIR}/b.md`)).toBe('b PC #pc')
    expect(await server.content(`${DIR}/a.md`)).toBe('a CLI')
    expect(await server.content(`${DIR}/b.md`)).toBe('b PC #pc') // the PC's edit survives
    // note.md: the PC's metadata, the CLI's later `updated` (its edit is the newest).
    const anchor = (await server.content(ANCHOR)) as string
    expect(anchor).toBe(readLocal(ANCHOR))
    expect(fmOf(anchor).tags).toEqual(['dev', 'pc'])
    expect(fmOf(anchor).updated).toBe(T_CLI)
    // Uploaded through the v2 with base = the PC's seq (compare-and-swap).
    expect(server.v2BaseSeqs.at(-1)).toBe(pcAnchorSeq)
    expect(readSettings().cliCloud.pendingUpserts).toBeUndefined()
    const bases = cli.cliCloudBasesSnapshot()
    expect(bases[ANCHOR].seq).toBe(server.seq)
    expect(bases[`${DIR}/a.md`].hash).toBe(cli.hashForBase(`${DIR}/a.md`, 'a CLI'))
  })

  it('both edited B: the PC version goes into the note, a copy holds ONLY the CLI version of B', async () => {
    await pcSave(note(T_PC, { ...BASE, b: 'b PC' }, { tags: ['dev', 'pc'] }), ['b'])
    server.failUploads = true
    cliEdit('b', 'b CLI', T_CLI)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'b.md'])
    server.failUploads = false
    await cli.cloudPullNow()
    expect(readLocal(`${DIR}/b.md`)).toBe('b PC')
    expect(await server.content(`${DIR}/b.md`)).toBe('b PC')
    const [copyDir] = otherDirs()
    expect(copyDir).toBeDefined()
    expect(fs.readdirSync(path.join(notesDir, copyDir)).sort()).toEqual(['b.md', NOTE_MD])
    expect(fs.readFileSync(path.join(notesDir, copyDir, 'b.md'), 'utf-8')).toBe('b CLI')
    const copyFm = fmOf(fs.readFileSync(path.join(notesDir, copyDir, NOTE_MD), 'utf-8'))
    expect((copyFm.sections as Array<{ file: string }>).map((s) => s.file)).toEqual(['b.md'])
    expect(String(copyFm.title)).toMatch(/^NOTEFLOW \(conflict copy /)
    expect(logs.some((l) => l.includes('Conflict: local changes kept as "NOTEFLOW (conflict copy'))).toBe(true)
    // The copy reached the server; nothing stays pending.
    expect(await server.content(`${copyDir}/b.md`)).toBe('b CLI')
    expect(readSettings().cliCloud.pendingUpserts).toBeUndefined()
  })

  it('a section deleted on the PC and edited here offline is kept, listed and re-uploaded', async () => {
    await pcSave(note(T_PC, { a: 'a v1', c: 'c v1' }), [])
    await server.tombstone(`${DIR}/b.md`, T_PC)
    server.failUploads = true
    cliEdit('b', 'b CLI', T_CLI)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'b.md'])
    server.failUploads = false
    await cli.cloudPullNow()
    expect(readLocal(`${DIR}/b.md`)).toBe('b CLI')
    expect(await server.content(`${DIR}/b.md`)).toBe('b CLI')
    const files = (fmOf(readLocal(ANCHOR)).sections as Array<{ file: string }>).map((s) => s.file)
    expect(files).toContain('b.md')
    expect(otherDirs()).toEqual([])
    expect(readSettings().cliCloud.pendingUpserts).toBeUndefined()
  })
})

describe('a note kept over a remote delete whose forced re-upload failed', () => {
  it('stays FORCED when a later pull merges the folder (never a conditional upload stuck stale)', async () => {
    // The PC deletes the note while this machine edits it offline.
    for (const f of ['a.md', 'b.md', 'c.md', NOTE_MD]) await server.tombstone(`${DIR}/${f}`, T_PC)
    server.failUploads = true
    cliEdit('a', 'a CLI', T_CLI)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'a.md'])
    // The pull keeps the note (pending edit) but its forced re-upload fails too.
    await cli.cloudPullNow()
    let c = readSettings().cliCloud
    expect(c.forceUpserts.sort()).toEqual([`${DIR}/a.md`, `${DIR}/b.md`, `${DIR}/c.md`, ANCHOR])
    // Later: a section row of the folder comes in (the PC retried its delete of c).
    await server.tombstone(`${DIR}/c.md`, T_PC)
    server.failUploads = false
    server.calls = []
    await cli.cloudPullNow()
    // Every file of the folder went up with the plain (forced) upsert, none through an RPC.
    const keys = await Promise.all(['a.md', 'b.md', 'c.md', NOTE_MD].map((f) => server.keyOf(`${DIR}/${f}`)))
    for (const key of keys) {
      expect(server.calls).toContain(`plain ${key}`)
      expect(server.calls.filter((call) => call.endsWith(key) && !call.startsWith('plain'))).toEqual([])
    }
    expect(await server.content(`${DIR}/c.md`)).toBe('c v1')
    expect(await server.content(`${DIR}/a.md`)).toBe('a CLI')
    c = readSettings().cliCloud
    expect(c.pendingUpserts).toBeUndefined()
    expect(c.forceUpserts).toBeUndefined()
  })
})

describe('uploads with a base (cloud_upsert_file_v2)', () => {
  it('a command push only sends note.md + what changed; a stale note.md stays pending and the pull merges it', async () => {
    await pcSave(note(T_PC, { ...BASE, b: 'b PC' }, { tags: ['dev', 'pc'] }), ['b'])
    cliEdit('a', 'a CLI', T_CLI)
    const lastSync = readSettings().cliCloud.lastSync
    // `touch`-like: every file of the note is passed (writeNoteFolder rewrites them all).
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'a.md', 'b.md', 'c.md'])
    expect(server.calls.filter((c) => c.startsWith('v2')).length).toBe(2) // a.md + note.md, never b/c
    expect(await server.content(`${DIR}/a.md`)).toBe('a CLI')
    expect(await server.content(`${DIR}/b.md`)).toBe('b PC') // untouched b never went up
    expect(logs.some((l) => l.includes("not uploaded: a newer version is on NoteFlow Cloud — run 'noteflow pull'"))).toBe(true)
    const c = readSettings().cliCloud
    expect(c.pendingUpserts).toEqual([ANCHOR])
    expect(c.lastSync).toBe(lastSync) // a stale upload is not a sync
    await cli.cloudPullNow()
    expect(readLocal(`${DIR}/b.md`)).toBe('b PC')
    expect(fmOf((await server.content(ANCHOR)) as string).tags).toEqual(['dev', 'pc'])
    expect(readSettings().cliCloud.pendingUpserts).toBeUndefined()
    expect(otherDirs()).toEqual([])
  })

  it('`noteflow push` catches up only the files that differ from their base', async () => {
    cliEdit('c', 'c CLI', T_CLI)
    server.calls = []
    await cli.cmdCloudPush()
    expect(server.calls.filter((c) => !c.startsWith('plain')).length).toBe(1) // only c.md (note.md differs only in `updated:`)
    expect(await server.content(`${DIR}/c.md`)).toBe('c CLI')
    expect(logs.some((l) => l.includes('Pushing 1 files to NoteFlow Cloud... (3 unchanged since the last sync)'))).toBe(true)
  })

  it('server without 0014 → 0011 for the rest of the run (warned once), the base is forgotten and the next pull re-establishes it', async () => {
    server.v2Missing = true
    cliEdit('a', 'a CLI', T_CLI)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'a.md'])
    expect(server.calls.filter((c) => c.startsWith('v2')).length).toBe(1)
    expect(server.calls.filter((c) => c.startsWith('v1')).length).toBe(2)
    expect(logs.filter((l) => l.includes('does not support base-checked uploads')).length).toBe(1)
    expect(await server.content(`${DIR}/a.md`)).toBe('a CLI')
    expect(cli.cliCloudBasesSnapshot()[`${DIR}/a.md`]).toBeUndefined()
    await cli.cloudPullNow()
    expect(cli.cliCloudBasesSnapshot()[`${DIR}/a.md`]).toEqual({
      seq: await server.seqOf(`${DIR}/a.md`), hash: cli.hashForBase(`${DIR}/a.md`, 'a CLI'),
    })
  })

  it('without 0011 either → plain upsert', async () => {
    server.v2Missing = true
    server.v1Missing = true
    cliEdit('a', 'a CLI', T_CLI)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'a.md'])
    expect(server.calls.filter((c) => c.startsWith('plain')).length).toBe(2)
    expect(await server.content(`${DIR}/a.md`)).toBe('a CLI')
  })
})

describe('one-time bases bootstrap (an install that synced before bases existed)', () => {
  /** Forget the bases: the state of a CLI updated from a version without them. */
  function preBasesInstall() {
    fs.rmSync(cli.CLOUD_BASES_PATH, { force: true })
    patchCliCloud({ basesBootstrapped: undefined })
    delete require.cache[CLI_PATH]
    cli = require(CLI_PATH)
  }

  it('offline edit of A + unseen PC edit of B → merged, no copy; seen rows become real bases', async () => {
    preBasesInstall()
    const seen = readSettings().cliCloud.pullSeq
    await pcSave(note(T_PC, { ...BASE, b: 'b PC' }, { tags: ['dev', 'pc'] }), ['b'])
    server.offline = true
    cliEdit('a', 'a CLI', T_CLI)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'a.md'])
    // Offline: neither the bootstrap pull nor the upload ran — the edit is journaled.
    expect(readSettings().cliCloud.basesBootstrapped).toBeUndefined()
    expect(readSettings().cliCloud.pendingUpserts.sort()).toEqual([`${DIR}/a.md`, ANCHOR])
    server.offline = false
    await cli.cloudPullNow()
    expect(logs.some((l) => l.includes('One-time Cloud sync upgrade'))).toBe(true)
    expect(otherDirs()).toEqual([])
    expect(readLocal(`${DIR}/b.md`)).toBe('b PC')
    expect(await server.content(`${DIR}/b.md`)).toBe('b PC')
    expect(await server.content(`${DIR}/a.md`)).toBe('a CLI')
    const c = readSettings().cliCloud
    expect(c.basesBootstrapped).toBe(true)
    expect(c.basesBootstrapPending).toBeUndefined()
    expect(c.pendingUpserts).toBeUndefined()
    const bases = cli.cliCloudBasesSnapshot()
    expect(bases[`${DIR}/c.md`]).toEqual({ seq: 3, hash: cli.hashForBase(`${DIR}/c.md`, 'c v1') })
    expect(bases[`${DIR}/c.md`].seq).toBeLessThanOrEqual(seen)
  })

  it('an UNJOURNALED local edit (the app / an editor wrote it, `updated` after lastSync) of a section the PC also changed → copy, never overwritten', async () => {
    preBasesInstall()
    await pcSave(note(T_PC, { ...BASE, b: 'b PC' }), ['b'])
    cliEdit('b', 'b written by the app', '2099-01-01T00:00:00.000Z')
    await cli.cloudPullNow()
    expect(readLocal(`${DIR}/b.md`)).toBe('b PC')
    const [copyDir] = otherDirs()
    expect(fs.readFileSync(path.join(notesDir, copyDir, 'b.md'), 'utf-8')).toBe('b written by the app')
  })

  it('a command push before the bootstrap runs it first (never a timestamp-only upload over unseen remote edits)', async () => {
    preBasesInstall()
    await pcSave(note(T_PC, { ...BASE, b: 'b PC' }), ['b'])
    cliEdit('a', 'a CLI', T_CLI)
    // `noteflow set NOTEFLOW a`: note.md + the section it wrote.
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'a.md'])
    expect(readSettings().cliCloud.basesBootstrapped).toBe(true)
    expect(await server.content(`${DIR}/b.md`)).toBe('b PC')
    expect(readLocal(`${DIR}/b.md`)).toBe('b PC')
    expect(await server.content(`${DIR}/a.md`)).toBe('a CLI')
    expect(otherDirs()).toEqual([])
  })

  it('a `touch` (every section passed) before the bootstrap: an unseen remote edit lands in the note, the local text in a copy', async () => {
    // Without bases the CLI can't tell which sections an external editor changed
    // before `touch`: every one is a local edit → conservative (copy, never overwrite).
    preBasesInstall()
    await pcSave(note(T_PC, { ...BASE, b: 'b PC' }), ['b'])
    cliEdit('a', 'a CLI', T_CLI)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'a.md', 'b.md', 'c.md'])
    expect(await server.content(`${DIR}/b.md`)).toBe('b PC')
    expect(readLocal(`${DIR}/b.md`)).toBe('b PC')
    expect(await server.content(`${DIR}/a.md`)).toBe('a CLI')
    const [copyDir] = otherDirs()
    expect(fs.readdirSync(path.join(notesDir, copyDir)).sort()).toEqual(['b.md', NOTE_MD])
  })

  it('a folder whose bootstrap reconcile fails keeps the bootstrap context (persisted) until it reconciles', async () => {
    preBasesInstall()
    const seen = readSettings().cliCloud.pullSeq
    await pcSave(note(T_PC, { ...BASE, b: 'b PC' }), ['b'])
    // A directory where a section file should be: reading the folder fails.
    fs.mkdirSync(localPath(`${DIR}/zz.md`))
    await cli.cloudPullNow()
    let c = readSettings().cliCloud
    expect(c.basesBootstrapped).toBe(true)
    expect(c.basesBootstrapPending).toMatchObject({ seenSeq: seen, dirs: [DIR] })
    expect(Object.keys(c.pullRetry ?? {}).length).toBeGreaterThan(0)
    fs.rmdirSync(localPath(`${DIR}/zz.md`))
    cliEdit('a', 'a CLI', T_CLI)
    await cli.cloudPullNow()
    c = readSettings().cliCloud
    expect(c.basesBootstrapPending).toBeUndefined()
    expect(readLocal(`${DIR}/b.md`)).toBe('b PC') // unseen row applied with the bootstrap rules
  })
})

describe('account switch', () => {
  it('drops the bases file and the bootstrap flags with the cursor', async () => {
    patchCliCloud({ basesBootstrapPending: { seenSeq: 1, lastSyncMs: null, retryKeys: [], dirs: [DIR] } })
    expect(fs.existsSync(cli.CLOUD_BASES_PATH)).toBe(true)
    const s = readSettings()
    s.cliAccount.userId = 'user-2'
    fs.writeFileSync(settingsPath(), JSON.stringify(s))
    expect(cli.bindCliCloudToAccount()).toBe(true)
    expect(fs.existsSync(cli.CLOUD_BASES_PATH)).toBe(false)
    expect(cli.cliCloudBasesSnapshot()).toEqual({})
    const c = readSettings().cliCloud
    expect(c.userId).toBe('user-2')
    expect(c.basesBootstrapped).toBeUndefined()
    expect(c.basesBootstrapPending).toBeUndefined()
    expect(c.pullSeq).toBeUndefined()
  })

  it('cliCloudForUser (pure) drops the bootstrap flags only on a real switch', () => {
    const c = { enabled: true, userId: 'a', pullSeq: 3, basesBootstrapped: true, basesBootstrapPending: { dirs: ['x'] } }
    expect(cli.cliCloudForUser(c, 'a')).toBe(c)
    const next = cli.cliCloudForUser(c, 'b')
    expect(next.basesBootstrapped).toBeUndefined()
    expect(next.basesBootstrapPending).toBeUndefined()
  })
})
