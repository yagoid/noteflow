// `noteflow history` (cli/noteflow.js): the version history NoteFlow Cloud keeps
// in public.file_versions — list, --show, --restore — run for real (real crypto,
// real files, the real sync of a restore) against an IN-MEMORY server behind a
// `fetch` mock. The server mimics the trigger of the migration: an UPDATE of a
// `files` row whose content changes copies the replaced row to file_versions.
// Notes and settings live in throwaway dirs (NOTEFLOW_NOTES_DIR + APPDATA /
// XDG_CONFIG_HOME) and no request ever leaves the process — nothing touches the
// real Cloud.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, NOTE_MD, type DiskNote } from '../../electron/noteFormat'

const require = createRequire(import.meta.url)
// The CLI's own (CommonJS) readline: the e2ee test fakes its prompt.
const readline = require('node:readline') as typeof import('node:readline')
const CLI_PATH = require.resolve('../../cli/noteflow.js')

const USER = 'user-1'
const DIR = 'project-alpha-abc12345'
const TASKS = `${DIR}/a.md`
const IDEAS = `${DIR}/b.md`
const T0 = '2026-10-30T18:00:00.000Z'
const T1 = '2026-10-31T09:30:00.000Z'
const T2 = '2026-11-01T20:00:00.000Z'
// When the server captured the versions: long ago, outside the 10-minute throttle.
const CAPTURED = '2026-11-02T00:00:00.000Z'

type Row = {
  path_key: string; path_ct: string; content_ct: string; key_ct: string
  updated_at: string; deleted: boolean; seq: number
}
type Version = Omit<Row, 'deleted'> & { id: number; size: number; reason: string; created_at: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any

/** public.files + public.file_versions of ONE user, as PostgREST would answer them. */
class Server {
  rows = new Map<string, Row>()
  versions: Version[] = []
  seq = 0
  versionId = 100
  captureVersions = false
  capturedAt = CAPTURED
  versionsMissing = false
  versionsStatus = 0
  /** id asked for → id answered (a server returning the wrong row). */
  redirectId = new Map<number, number>()
  requests: string[] = []
  versionQueries: URLSearchParams[] = []
  /** user_keys row of a private (e2ee) account, instead of managed. */
  e2eeKeys: Record<string, unknown> | null = null
  constructor(private cli: Cli, private dek: Uint8Array) {}

  get dekBytes(): Uint8Array { return this.dek }

  /** The trigger: an update that changes content_ct keeps the replaced row. */
  private write(r: Omit<Row, 'seq'>): number {
    const old = this.rows.get(r.path_key)
    if (this.captureVersions && old && !old.deleted && old.content_ct !== r.content_ct) {
      this.versions.push({
        id: ++this.versionId, path_key: old.path_key, path_ct: old.path_ct, content_ct: old.content_ct,
        key_ct: old.key_ct, updated_at: old.updated_at, seq: old.seq, size: old.content_ct.length,
        reason: 'edit', created_at: this.capturedAt,
      })
    }
    const seq = ++this.seq
    this.rows.set(r.path_key, { ...r, seq })
    return seq
  }

  /** A write of another device (the "PC"): straight into the table. */
  async put(noteKey: Uint8Array, relPath: string, content: string, updatedAt: string) {
    return this.write(await this.cli.buildFileUpsertRow(this.dek, noteKey, relPath, content, updatedAt))
  }

  /**
   * A version row seeded directly (e.g. reason delete/shrink). `encryptAs` forges
   * its path_ct; `tombstone` copies a deleted row (content_ct blanked, like files).
   */
  async addVersion(noteKey: Uint8Array, relPath: string, content: string, o: {
    updatedAt: string; reason?: string; createdAt?: string; seq?: number; encryptAs?: string; tombstone?: boolean
  }) {
    const row = await this.cli.buildFileUpsertRow(this.dek, noteKey, o.encryptAs ?? relPath, content, o.updatedAt, o.tombstone === true)
    const v: Version = {
      id: ++this.versionId, path_key: await this.keyOf(relPath), path_ct: row.path_ct, content_ct: row.content_ct,
      key_ct: row.key_ct, updated_at: o.updatedAt, seq: o.seq ?? ++this.seq, size: row.content_ct.length,
      reason: o.reason ?? 'edit', created_at: o.createdAt ?? CAPTURED,
    }
    this.versions.push(v)
    return v
  }

  keyOf(relPath: string): Promise<string> {
    return this.cli.derivePathKeyHmac(this.dek, relPath)
  }

  async content(relPath: string): Promise<string | undefined> {
    const row = this.rows.get(await this.keyOf(relPath))
    if (!row) return undefined
    return this.cli.decryptContent(await this.cli.unwrapKey(row.key_ct, this.dek), row.content_ct)
  }

  async versionContents(relPath: string): Promise<string[]> {
    const key = await this.keyOf(relPath)
    const out: string[] = []
    for (const v of [...this.versions].filter((x) => x.path_key === key).sort((a, b) => b.seq - a.seq)) {
      out.push(await this.cli.decryptContent(await this.cli.unwrapKey(v.key_ct, this.dek), v.content_ct))
    }
    return out
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
    this.requests.push(`${method} ${p}`)
    if (p === '/auth/v1/token') return { status: 200, json: { access_token: 'at', refresh_token: 'rt2' } }
    if (p === '/rest/v1/user_keys') return { status: 200, json: [this.e2eeKeys ?? { mode: 'managed' }] }
    if (p === '/functions/v1/cloud-keys/unlock') return { status: 200, json: { dek: Buffer.from(this.dek).toString('base64url') } }
    if (p === '/rest/v1/file_versions' && method === 'GET') {
      this.versionQueries.push(u.searchParams)
      if (this.versionsMissing) {
        return { status: 404, json: { code: 'PGRST205', message: "Could not find the table 'public.file_versions' in the schema cache" } }
      }
      if (this.versionsStatus) return { status: this.versionsStatus, json: { message: 'boom' } }
      let rows = [...this.versions]
      const id = u.searchParams.get('id')
      if (id) {
        const asked = Number(id.slice(3))
        const answered = this.redirectId.get(asked) ?? asked
        rows = rows.filter((v) => v.id === answered)
      }
      const key = u.searchParams.get('path_key')
      if (key) rows = rows.filter((v) => v.path_key === key.slice(3))
      if (u.searchParams.get('order') === 'seq.desc') rows.sort((a, b) => b.seq - a.seq)
      rows = rows.slice(0, Number(u.searchParams.get('limit') || 1000))
      const cols = (u.searchParams.get('select') || '').split(',')
      return { status: 200, json: rows.map((v) => Object.fromEntries(cols.map((c) => [c, v[c as keyof Version]]))) }
    }
    if (p === '/rest/v1/rpc/cloud_upsert_file_v2') {
      const row = this.rows.get(body.p_path_key)
      if (body.p_base_seq !== null) {
        if (row && row.seq !== body.p_base_seq) return { status: 200, json: null }
      } else if (this.newest([body.p_path_key, body.p_anchor_key]) > Date.parse(body.p_updated_at)) {
        return { status: 200, json: null }
      }
      return {
        status: 200,
        json: this.write({
          path_key: body.p_path_key, path_ct: body.p_path_ct, content_ct: body.p_content_ct, key_ct: body.p_key_ct,
          updated_at: new Date(body.p_updated_at).toISOString(), deleted: false,
        }),
      }
    }
    if (p === '/rest/v1/files' && method === 'GET') {
      const keyFilter = u.searchParams.get('path_key')
      let rows = [...this.rows.values()]
      if (keyFilter) {
        const keys = keyFilter.startsWith('eq.') ? [keyFilter.slice(3)]
          : keyFilter.slice(4, -1).split(',').map((k) => k.replace(/^"|"$/g, ''))
        rows = rows.filter((r) => keys.includes(r.path_key))
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
}

let tmp: string
let notesDir: string
let configDir: string
let cli: Cli
let server: Server
let noteKey: Uint8Array
let logs: string[]
let stdout: string
const savedEnv = { ...process.env }
const savedFetch = globalThis.fetch

const settingsPath = () => path.join(configDir, 'noteflow', 'settings.json')
const readLocal = (rel: string) => fs.readFileSync(path.join(notesDir, rel), 'utf-8')
const logged = (text: string) => logs.some((l) => l.includes(text))
const noteMdUpdated = () => /^updated: "?([^"\n]+)"?$/m.exec(readLocal(`${DIR}/${NOTE_MD}`))?.[1]

function note(updated: string, tasks: string, ideas = 'ideas v1'): DiskNote {
  return {
    id: 'abc12345', title: 'Project Alpha', tags: [], created: '2026-10-01T00:00:00.000Z', updated,
    sections: [{ id: 'a', name: 'Tasks', content: tasks }, { id: 'b', name: 'Ideas', content: ideas }],
  }
}

/** The "PC" (desktop app) saves a version of the note: note.md + the given sections. */
async function pcSave(n: DiskNote, sections: string[]) {
  const files = serializeNoteFolder(n, { preserveUpdated: true }).files
  for (const name of [...sections.map((s) => `${s}.md`), NOTE_MD]) await server.put(noteKey, `${DIR}/${name}`, files[name], n.updated)
}

/** A note folder that only exists on this machine (written straight to disk). */
function writeLocalNote(dir: string, n: DiskNote) {
  const files = serializeNoteFolder(n, { preserveUpdated: true }).files
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(notesDir, dir, name), content)
}

const history = (title: string, section: string, opts: Record<string, unknown> = {}) => cli.cmdHistory(title, section, opts)
const failsWith = async (p: Promise<unknown>, text: string) => {
  await expect(p).rejects.toMatchObject({ exitCode: 1 })
  expect(logged(text)).toBe(true)
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-history-'))
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
    const res = await server.handle(String(url), init)
    return { status: res.status, json: async () => res.json }
  }) as unknown as typeof fetch
  logs = []
  stdout = ''
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { stdout += String(chunk); return true })

  // The PC creates the note and edits Tasks twice; Cloud keeps the replaced
  // versions. This machine syncs it: local Tasks = "tasks v3".
  await pcSave(note(T0, 'tasks v1'), ['a', 'b'])
  server.captureVersions = true
  await pcSave(note(T1, 'tasks v2'), ['a'])
  await pcSave(note(T2, 'tasks v3'), ['a'])
  await cli.cloudPullNow()
  expect(readLocal(TASKS)).toBe('tasks v3')
  logs = []
  server.requests = []
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = savedFetch
  process.env = { ...savedEnv }
  process.exitCode = undefined // exit() inside the CLI sets it; never leak it into the runner
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('pure helpers', () => {
  it('parses version numbers and rejects bad flag combinations', () => {
    expect(cli.parseHistoryIndex('2')).toBe(2)
    for (const bad of ['0', '-1', '1.5', 'abc', '', ' ']) expect(cli.parseHistoryIndex(bad)).toBeNull()
    expect(cli.historyFlagsError({ show: '1', restore: '1' })).toMatch(/cannot be combined/)
    expect(cli.historyFlagsError({ dryRun: true })).toMatch(/only applies to --restore/)
    expect(cli.historyFlagsError({ show: '0' })).toMatch(/needs a version number/)
    expect(cli.historyFlagsError({ restore: '3', dryRun: true })).toBeNull()
  })

  it('the size of a sealed blob gives back the content bytes', async () => {
    for (const text of ['', 'x', 'tasks v2', 'ñandú — ✓'.repeat(50), 'a'.repeat(5000)]) {
      const sealed = await cli.encryptContent(noteKey, text)
      expect(cli.historyContentBytes(sealed.length)).toBe(Buffer.byteLength(text, 'utf-8'))
    }
    expect(cli.formatHistoryBytes(512)).toBe('512 B')
    expect(cli.formatHistoryBytes(1229)).toBe('1.2 KB')
    expect(cli.formatHistoryBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('orders by seq (newest first) whatever the server order', () => {
    const v = cli.planHistoryVersions([
      { id: 1, seq: '3', updated_at: T0, created_at: CAPTURED, size: 60, reason: 'edit' },
      { id: 2, seq: 9, updated_at: T1, created_at: CAPTURED, size: 60, reason: 'delete' },
    ])
    expect(v.map((x: { id: number; index: number }) => [x.index, x.id])).toEqual([[1, 2], [2, 1]])
  })
})

describe('list', () => {
  it('newest first, numbered from 1, with date, size and only the non-edit reasons', async () => {
    // Seeded out of order: a shrink between the two edits, a delete before them all.
    await server.addVersion(noteKey, TASKS, 'tasks v0 (long)', { updatedAt: '2026-10-20T08:00:00.000Z', reason: 'delete', seq: 0 })
    const v1Seq = server.versions.find((v) => v.updated_at === T0)!.seq
    await server.addVersion(noteKey, TASKS, 'tasks v1.5', { updatedAt: '2026-10-31T00:00:00.000Z', reason: 'shrink', seq: v1Seq + 1 })
    await history('Project Alpha', 'Tasks')
    const lines = logs.filter((l) => /^\s{4}\d/.test(l))
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe(`    1  ${cli.formatHistoryDate(T1)}  8 B`)
    expect(lines[1]).toBe(`    2  ${cli.formatHistoryDate('2026-10-31T00:00:00.000Z')}  10 B      before a large shrink`)
    expect(lines[2]).toBe(`    3  ${cli.formatHistoryDate(T0)}  8 B`)
    expect(lines[3]).toBe(`    4  ${cli.formatHistoryDate('2026-10-20T08:00:00.000Z')}  15 B      before delete`)
    expect(logged('Version history of "Project Alpha" → "Tasks"')).toBe(true)
    expect(stdout).toBe('')
    // One request, for the section's own rows, never their content.
    expect(server.versionQueries).toHaveLength(1)
    const q = server.versionQueries[0]
    expect(q.get('path_key')).toBe(`eq.${await server.keyOf(TASKS)}`)
    expect(q.get('select')!.split(',').sort()).toEqual(['created_at', 'id', 'reason', 'seq', 'size', 'updated_at'])
    expect(q.get('order')).toBe('seq.desc')
  })

  it('--json: { note, section, versions[] } on stdout', async () => {
    await history('Project Alpha', 'Tasks', { json: true })
    const json = JSON.parse(stdout)
    expect(json.note).toBe('Project Alpha')
    expect(json.section).toBe('Tasks')
    expect(json.versions).toEqual([
      expect.objectContaining({ index: 1, updatedAt: T1, createdAt: CAPTURED, size: 8, reason: 'edit' }),
      expect.objectContaining({ index: 2, updatedAt: T0, createdAt: CAPTURED, size: 8, reason: 'edit' }),
    ])
    expect(Object.keys(json.versions[0]).sort()).toEqual(['createdAt', 'deleted', 'id', 'index', 'reason', 'seq', 'size', 'updatedAt'])
    expect(json.versions[0].deleted).toBe(false)
    expect(json.versions[0].seq).toBeGreaterThan(json.versions[1].seq)
  })

  it('a section with no versions says so (exit 0)', async () => {
    await history('Project Alpha', 'Ideas')
    expect(logged('No versions yet for "Ideas" in "Project Alpha"')).toBe(true)
    expect(process.exitCode).toBeUndefined()
  })

  it('the section name is matched exactly (no loose match) and the number is checked', async () => {
    await failsWith(history('Project Alpha', 'Task'), 'No section "Task" in "Project Alpha"')
    await failsWith(history('Project Alpha', 'Tasks', { show: '3' }), 'No version 3 for "Tasks"')
  })
})

describe('--show', () => {
  it('prints the exact content of version n and writes nothing', async () => {
    const before = readLocal(TASKS)
    const anchorBefore = readLocal(`${DIR}/${NOTE_MD}`)
    await history('Project Alpha', 'Tasks', { show: '2' })
    expect(stdout).toBe('tasks v1\n')
    expect(readLocal(TASKS)).toBe(before)
    expect(readLocal(`${DIR}/${NOTE_MD}`)).toBe(anchorBefore)
    expect(server.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('--json: { note, section, index, id, updatedAt, reason, content }', async () => {
    await history('Project Alpha', 'Tasks', { show: '1', json: true })
    const json = JSON.parse(stdout)
    expect(json).toEqual({
      note: 'Project Alpha', section: 'Tasks', index: 1, id: expect.any(Number), updatedAt: T1, reason: 'edit', content: 'tasks v2',
    })
  })

  it('refuses a row of another section (server answering the wrong id)', async () => {
    await pcSave(note('2026-11-01T21:00:00.000Z', 'tasks v3', 'ideas v2'), ['b']) // Ideas gets a version
    await cli.cloudPullNow()
    const ideasKey = await server.keyOf(IDEAS)
    const tasksKey = await server.keyOf(TASKS)
    const ideasVersion = server.versions.find((v) => v.path_key === ideasKey)!
    const newestTasks = server.versions.find((v) => v.path_key === tasksKey && v.updated_at === T1)!
    server.redirectId.set(newestTasks.id, ideasVersion.id)
    stdout = ''
    await failsWith(history('Project Alpha', 'Tasks', { show: '1' }), 'Version 1 does not belong to "Tasks"')
    expect(stdout).toBe('')
  })

  it('refuses a row whose encrypted path is another file, even under the right path_key', async () => {
    await server.addVersion(noteKey, TASKS, 'forged', { updatedAt: '2026-11-01T22:00:00.000Z', encryptAs: IDEAS })
    await failsWith(history('Project Alpha', 'Tasks', { restore: '1' }), 'Version 1 does not belong to "Tasks"')
    expect(readLocal(TASKS)).toBe('tasks v3')
  })
})

describe('--restore', () => {
  it('replaces the section like an edit: on disk, updated bumped, uploaded — and the replaced content is kept', async () => {
    const updatedBefore = noteMdUpdated()
    await history('Project Alpha', 'Tasks', { restore: '2' })
    expect(readLocal(TASKS)).toBe('tasks v1')
    expect(readLocal(IDEAS)).toBe('ideas v1')
    expect(Date.parse(noteMdUpdated()!)).toBeGreaterThan(Date.parse(updatedBefore!))
    expect(await server.content(TASKS)).toBe('tasks v1')
    expect(await server.content(`${DIR}/${NOTE_MD}`)).toBe(readLocal(`${DIR}/${NOTE_MD}`))
    // The server's trigger kept what the restore replaced: the restore is reversible.
    expect((await server.versionContents(TASKS))[0]).toBe('tasks v3')
    expect(logged(`Restored version 2 (${cli.formatHistoryDate(T0)}) of "Tasks" in "Project Alpha"`)).toBe(true)
    expect(logged('NoteFlow Cloud keeps the version it replaces in the history (local edits that never synced are not kept)')).toBe(true)
    expect(logged('Synced to NoteFlow Cloud')).toBe(true)
  })

  it('--json result', async () => {
    await history('Project Alpha', 'Tasks', { restore: '1', json: true })
    expect(JSON.parse(stdout)).toEqual({
      note: 'Project Alpha', dirname: DIR, section: 'Tasks', index: 1, id: expect.any(Number), updatedAt: T1,
      reason: 'edit', bytesWritten: 8, restored: true, unchanged: false,
    })
    expect(readLocal(TASKS)).toBe('tasks v2')
  })

  it('--dry-run writes and uploads nothing', async () => {
    const anchorBefore = readLocal(`${DIR}/${NOTE_MD}`)
    await history('Project Alpha', 'Tasks', { restore: '2', dryRun: true, json: true })
    expect(JSON.parse(stdout)).toMatchObject({ index: 2, restored: false, unchanged: false, dryRun: true })
    expect(readLocal(TASKS)).toBe('tasks v3')
    expect(readLocal(`${DIR}/${NOTE_MD}`)).toBe(anchorBefore)
    expect(server.requests.some((r) => r.startsWith('POST /rest'))).toBe(false)
  })

  it('identical content: nothing written, says so', async () => {
    await server.addVersion(noteKey, TASKS, 'tasks v3', { updatedAt: '2026-11-01T23:00:00.000Z' })
    const anchorBefore = readLocal(`${DIR}/${NOTE_MD}`)
    await history('Project Alpha', 'Tasks', { restore: '1' })
    expect(logged('already has the content of version 1')).toBe(true)
    expect(readLocal(`${DIR}/${NOTE_MD}`)).toBe(anchorBefore)
    expect(server.requests.some((r) => r.startsWith('POST /rest'))).toBe(false)
  })

  it('warns when the newest version is under 10 minutes old (the replaced content may not be kept)', async () => {
    await server.addVersion(noteKey, TASKS, 'tasks v2.9', { updatedAt: '2026-11-01T23:00:00.000Z', createdAt: new Date().toISOString() })
    await history('Project Alpha', 'Tasks', { restore: '3' })
    expect(logged('saved a version less than 10 minutes ago')).toBe(true)
    expect(readLocal(TASKS)).toBe('tasks v1')
  })
})

describe('deletion markers (a tombstone row copied into the history)', () => {
  it('listed as such; --show and --restore refuse it instead of emptying the section', async () => {
    await server.addVersion(noteKey, TASKS, '', { updatedAt: '2026-11-01T22:00:00.000Z', reason: 'edit', tombstone: true })
    await history('Project Alpha', 'Tasks')
    expect(logs.filter((l) => /^\s{4}\d/.test(l))[0]).toBe(`    1  ${cli.formatHistoryDate('2026-11-01T22:00:00.000Z')}  -         deletion marker (no content)`)
    stdout = ''
    await failsWith(history('Project Alpha', 'Tasks', { show: '1' }), 'Version 1 is a deletion marker')
    expect(stdout).toBe('')
    await failsWith(history('Project Alpha', 'Tasks', { restore: '1' }), 'Version 1 is a deletion marker')
    expect(readLocal(TASKS)).toBe('tasks v3')
    expect(server.requests.some((r) => r.startsWith('POST /rest'))).toBe(false)
  })
})

describe('private (e2ee) account', () => {
  it('the passphrase prompt goes to stderr: --show output stays pure data', async () => {
    const pass = 'correct horse battery staple'
    const salt = new Uint8Array(16).fill(7)
    const kek = await cli.deriveKek(pass, salt, 1000)
    server.e2eeKeys = {
      mode: 'e2ee', dek_pass_ct: await cli.wrapKey(server.dekBytes, kek), pass_salt: cli.toB64Url(salt), pass_iterations: 1000,
    }
    // A fresh process: the DEK of the managed pull in beforeEach is cached in memory.
    delete require.cache[CLI_PATH]
    cli = require(CLI_PATH)
    const outputs: unknown[] = []
    const questions: string[] = []
    vi.spyOn(readline, 'createInterface').mockImplementation(((o: { output: unknown }) => {
      outputs.push(o.output)
      return {
        on: () => undefined, close: () => undefined, _writeToOutput: () => undefined,
        question: (q: string, cb: (a: string) => void) => { questions.push(q); cb(pass) },
      }
    }) as unknown as typeof readline.createInterface)
    await history('Project Alpha', 'Tasks', { show: '2' })
    expect(questions).toEqual(['  Cloud passphrase (or recovery code): '])
    expect(outputs).toEqual([process.stderr])
    expect(stdout).toBe('tasks v1\n')
  })
})

describe('refusals (exit 1, nothing done)', () => {
  it('a version number out of range', async () => {
    await failsWith(history('Project Alpha', 'Tasks', { restore: '5' }), 'No version 5 for "Tasks" in "Project Alpha" — there are 2 versions')
    expect(readLocal(TASKS)).toBe('tasks v3')
  })

  it('--show with --restore, or a bad number, before any request', async () => {
    await failsWith(history('Project Alpha', 'Tasks', { show: '1', restore: '1' }), 'cannot be combined')
    await failsWith(history('Project Alpha', 'Tasks', { show: '0' }), '--show needs a version number')
    expect(server.requests).toEqual([])
  })

  it('a server without the history yet (404 PGRST205)', async () => {
    server.versionsMissing = true
    await failsWith(history('Project Alpha', 'Tasks'), 'Version history is not available on NoteFlow Cloud yet')
  })

  it('another HTTP error reports its status', async () => {
    server.versionsStatus = 403
    await failsWith(history('Project Alpha', 'Tasks'), 'Could not load the version history from NoteFlow Cloud (HTTP 403)')
  })

  it('Cloud not active: points to cloud login, no request', async () => {
    const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    s.cliCloud.enabled = false
    fs.writeFileSync(settingsPath(), JSON.stringify(s))
    await failsWith(history('Project Alpha', 'Tasks'), "Version history comes from NoteFlow Cloud, which is not active in this CLI — sign in with 'noteflow cloud login'")
    expect(server.requests).toEqual([])
  })

  it('a local-only note', async () => {
    writeLocalNote('welcome-loc12345', {
      id: 'loc12345', title: 'Welcome', tags: [], created: T0, updated: T0, localOnly: true,
      sections: [{ id: 'w', name: 'Note', content: 'hi' }],
    })
    await failsWith(history('Welcome', ''), '"Welcome" is a local-only note — it is never synced, so it has no version history')
    expect(server.requests).toEqual([])
  })

  it('a password-protected note', async () => {
    fs.mkdirSync(path.join(notesDir, 'secret-enc12345'))
    fs.writeFileSync(path.join(notesDir, 'secret-enc12345', NOTE_MD), [
      '---', 'id: enc12345', 'title: "Secret plans"', 'tags: []', `created: "${T0}"`, `updated: "${T0}"`, 'formatVersion: 2',
      'encryption:', '  alg: aes-256-gcm+pbkdf2', '  salt: c2FsdA', '  iv: aXY', '  ciphertext: Y3Q', '---', '',
    ].join('\n'))
    await failsWith(history('Secret', ''), '"Secret plans" is password-protected — password-protected notes have no version history')
    expect(server.requests).toEqual([])
  })

  it('a note with several sections and no section given lists them', async () => {
    await failsWith(history('Project Alpha', ''), '"Project Alpha" has 2 sections — pick one with --section. Sections: Tasks, Ideas.')
    expect(server.requests).toEqual([])
  })

  it('a single-section note needs no section', async () => {
    const soloKey = cli.generateNoteKey()
    const solo: DiskNote = { id: 'solo1234', title: 'Solo', tags: [], created: T0, updated: T0, sections: [{ id: 's', name: 'Note', content: 'one' }] }
    const files = serializeNoteFolder(solo, { preserveUpdated: true }).files
    await server.put(soloKey, 'solo-solo1234/s.md', files['s.md'], T0)
    await server.put(soloKey, `solo-solo1234/${NOTE_MD}`, files[NOTE_MD], T0)
    await server.put(soloKey, 'solo-solo1234/s.md', 'two', T1)
    await server.put(soloKey, `solo-solo1234/${NOTE_MD}`, files[NOTE_MD].replace(/^updated:.*$/m, `updated: '${T1}'`), T1)
    await cli.cloudPullNow()
    stdout = ''
    await history('Solo', '', { show: '1' })
    expect(stdout).toBe('one\n')
  })
})
