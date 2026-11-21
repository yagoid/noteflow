// agent.md (the reserved agent-task file of a note folder — see
// agentTasks.test.ts) and the CLI's NoteFlow Cloud engine: the real
// `noteflow task` commands, syncPushNoteFiles and cloudPullNow, real crypto and
// real files, against an IN-MEMORY server behind a `fetch` mock (same model as
// cloudThreeWayPull.test.ts: the compare-and-swap of cloud_upsert_file_v2, a
// seq per write, tombstones — plus the conditional tombstone PATCH
// `…&seq=eq.<base>` the CLI sends for a file it deleted). Notes and settings live
// in throwaway dirs (NOTEFLOW_NOTES_DIR + APPDATA / XDG_CONFIG_HOME): no request
// ever leaves the process, nothing touches the real Cloud.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, NOTE_MD, type DiskNote } from '../../electron/noteFormat'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')

const USER = 'user-1'
const DIR = 'plan-abc12345'
const AGENT = `${DIR}/agent.md`
const SECTION = `${DIR}/st.md`
const ROBOT = '\u{1F916}'
const T0 = '2026-10-30T18:00:00.000Z'
const T_PC = '2099-01-01T00:00:00.000Z'

type Row = {
  path_key: string; path_ct: string; content_ct: string; key_ct: string
  updated_at: string; deleted: boolean; seq: number
}
type Block = { id: string; meta: Record<string, string>; body: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any

/** public.files of ONE user + the RPCs, as PostgREST would answer them. */
class Server {
  rows = new Map<string, Row>()
  seq = 0
  patches: string[] = []
  constructor(private cli: Cli, private dek: Uint8Array) {}

  private write(r: Omit<Row, 'seq'>): number {
    const seq = ++this.seq
    this.rows.set(r.path_key, { ...r, seq })
    return seq
  }

  /** A write of another device: straight into the table. */
  async put(noteKey: Uint8Array, relPath: string, content: string, updatedAt: string) {
    return this.write(await this.cli.buildFileUpsertRow(this.dek, noteKey, relPath, content, updatedAt))
  }

  /** The tombstone of a file deleted on another device. */
  async tombstone(relPath: string, at: string) {
    const row = this.rows.get(await this.cli.derivePathKeyHmac(this.dek, relPath))
    if (row) this.write({ ...row, deleted: true, content_ct: '', updated_at: at })
  }

  /** undefined = no row, null = tombstone. */
  async content(relPath: string): Promise<string | null | undefined> {
    const row = this.rows.get(await this.cli.derivePathKeyHmac(this.dek, relPath))
    if (!row) return undefined
    if (row.deleted) return null
    return this.cli.decryptContent(await this.cli.unwrapKey(row.key_ct, this.dek), row.content_ct)
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
    if (p === '/rest/v1/files' && method === 'POST') {
      const { user_id: _u, ...row } = body
      this.write(row)
      return { status: 201, json: null }
    }
    if (p === '/rest/v1/files' && method === 'PATCH') {
      // `seq=eq.N` makes it conditional (the row's CURRENT seq); the answer lists the rows it changed.
      this.patches.push(u.search)
      const seqFilter = u.searchParams.get('seq')
      const changed: Array<{ path_key: string }> = []
      for (const key of this.pathKeysOf(u)) {
        const row = this.rows.get(key)
        if (!row || (seqFilter && row.seq !== Number(seqFilter.slice(3)))) continue
        this.write({ ...row, ...body })
        changed.push({ path_key: key })
      }
      return { status: 200, json: changed }
    }
    if (p === '/rest/v1/files' && method === 'GET') {
      let rows = [...this.rows.values()]
      if (u.searchParams.get('path_key')) {
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

  private pathKeysOf(u: URL): string[] {
    const v = u.searchParams.get('path_key') || ''
    if (v.startsWith('eq.')) return [v.slice(3)]
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((k) => k.replace(/^"|"$/g, ''))
    return []
  }
}

let tmp: string
let notesDir: string
let cli: Cli
let server: Server
let noteKey: Uint8Array
let logs: string[]
const savedEnv = { ...process.env }
const savedFetch = globalThis.fetch

const localPath = (rel: string) => path.join(notesDir, rel)
const readLocal = (rel: string) => fs.readFileSync(localPath(rel), 'utf-8')
const doc = (blocks: Block[]) => cli.serializeAgentDoc(blocks) as string
const parse = (text: string) => cli.parseAgentDoc(text) as Block[]
const block = (id: string, meta: Record<string, string> = {}): Block => ({ id, meta: { title: id, state: 'queued', ...meta }, body: '' })
const otherDirs = () => fs.readdirSync(notesDir).filter((d) => d !== DIR && fs.statSync(path.join(notesDir, d)).isDirectory())
const queuedId = () => new RegExp(`${ROBOT}([a-z0-9]{5}):`, 'u').exec(readLocal(SECTION))![1]
/** `noteflow task queue` of the first task, synced: this machine's agent.md has one block and a base. */
async function queueFirst(): Promise<string> {
  await cli.cmdTask(['queue', 'Plan', 'Tasks'], { match: 'Fix' })
  return queuedId()
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-agent-cloud-'))
  notesDir = path.join(tmp, 'notes')
  const configDir = path.join(tmp, 'config')
  fs.mkdirSync(path.join(configDir, 'noteflow'), { recursive: true })
  fs.mkdirSync(notesDir)
  process.env.APPDATA = configDir
  process.env.XDG_CONFIG_HOME = configDir
  process.env.NOTEFLOW_NOTES_DIR = notesDir
  process.env.NOTEFLOW_NO_APP_CHECK = '1'
  delete process.env.NOTEFLOW_CLOUD_PASSPHRASE
  fs.writeFileSync(path.join(configDir, 'noteflow', 'settings.json'), JSON.stringify({
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
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  // Another device creates the note; this machine syncs it (first pull).
  const n: DiskNote = {
    id: 'abc12345', title: 'Plan', tags: [], created: T0, updated: T0,
    sections: [{ id: 'st', name: 'Tasks', content: '- [ ] Fix it\n- [ ] Other' }],
  }
  const files = serializeNoteFolder(n, { preserveUpdated: true }).files
  for (const name of ['st.md', NOTE_MD]) await server.put(noteKey, `${DIR}/${name}`, files[name], T0)
  await cli.cloudPullNow()
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = savedFetch
  process.env = { ...savedEnv }
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('a task command uploads agent.md like a section file', () => {
  it('queue: the line, note.md and agent.md go up; agent.md gets a base', async () => {
    const id = await queueFirst()
    expect(logs).toContain('  Synced to NoteFlow Cloud')
    expect(await server.content(SECTION)).toBe(`- [ ] Fix it ${ROBOT}${id}:queued\n- [ ] Other`)
    expect(await server.content(AGENT)).toBe(readLocal(AGENT))
    expect(await server.content(`${DIR}/${NOTE_MD}`)).toBe(readLocal(`${DIR}/${NOTE_MD}`))
    expect(readLocal(`${DIR}/${NOTE_MD}`)).not.toContain('agent.md') // not a section
    expect(cli.cliCloudBasesSnapshot()[AGENT]).toEqual({ seq: expect.any(Number), hash: cli.hashForBase(AGENT, readLocal(AGENT)) })
  })
})

describe('agent.md removed with its last block', () => {
  it('unchanged on the server since this machine synced it → tombstoned (conditional on its base seq); the name can come back', async () => {
    const id = await queueFirst()
    const baseSeq = cli.cliCloudBasesSnapshot()[AGENT].seq
    await cli.cmdTask(['dismiss', id], {})
    expect(fs.existsSync(localPath(AGENT))).toBe(false)
    expect(await server.content(AGENT)).toBeNull()
    expect(server.patches.at(-1)).toContain(`seq=eq.${baseSeq}`)
    expect(cli.cliCloudBasesSnapshot()[AGENT]).toBeUndefined()
    // A new agent.md later is a plain new upload, not "stale" against the deleted one.
    logs = []
    await cli.cmdTask(['queue', 'Plan', 'Tasks'], { match: 'Other' })
    expect(await server.content(AGENT)).toBe(readLocal(AGENT))
    expect(logs).toContain('  Synced to NoteFlow Cloud')
    expect(logs.some((l) => l.includes('not uploaded'))).toBe(false)
  })

  it('a newer version on the server (another machine added a block) → NO tombstone; the next pull brings that version back', async () => {
    const id = await queueFirst()
    // Machine B, without this machine having pulled: its agent.md carries two blocks.
    const theirs = doc([...parse(readLocal(AGENT)), block('bbbbb', { state: 'done' })])
    await server.put(noteKey, AGENT, theirs, T_PC)
    await cli.cmdTask(['dismiss', id], {})
    expect(fs.existsSync(localPath(AGENT))).toBe(false) // gone here…
    expect(await server.content(AGENT)).toBe(theirs) // …B's reports are intact on the server
    expect(logs.some((l) => l.includes("agent.md not deleted on NoteFlow Cloud: a newer version is there — 'noteflow pull' brings it back"))).toBe(true)
    await cli.cloudPullNow()
    expect(readLocal(AGENT)).toBe(theirs)
    expect(await server.content(AGENT)).toBe(theirs)
  })

  it('no base for it (never reconciled with the server) → nothing is sent', async () => {
    fs.writeFileSync(localPath(SECTION), `- [ ] Fix it ${ROBOT}k3f9a:queued\n- [ ] Other`)
    fs.writeFileSync(localPath(AGENT), doc([block('k3f9a')])) // written here, never uploaded
    await server.put(noteKey, AGENT, doc([block('bbbbb')]), T_PC) // …while another machine uploaded its own
    await cli.cmdTask(['dismiss', 'k3f9a'], {})
    expect(await server.content(AGENT)).toBe(doc([block('bbbbb')]))
    expect(server.patches).toEqual([])
  })
})

describe('pull (three-way) with agent.md', () => {
  it('tombstoned elsewhere, unchanged here → removed here', async () => {
    await queueFirst()
    await server.tombstone(AGENT, T_PC)
    await cli.cloudPullNow()
    expect(fs.existsSync(localPath(AGENT))).toBe(false)
    expect(cli.cliCloudBasesSnapshot()[AGENT]).toBeUndefined()
    expect(otherDirs()).toEqual([])
  })

  it('tombstoned elsewhere, changed here → kept and uploaded again (no conflict copy)', async () => {
    const id = await queueFirst()
    const mine = doc([block(id, { title: 'Fix it', section: 'Tasks', progress: 'changed here' })])
    fs.writeFileSync(localPath(AGENT), mine)
    await server.tombstone(AGENT, T_PC)
    await cli.cloudPullNow()
    expect(readLocal(AGENT)).toBe(mine)
    expect(await server.content(AGENT)).toBe(mine)
    expect(otherDirs()).toEqual([])
  })

  it('a block added on each side → both kept by the line merge, nothing announced', async () => {
    const id = await queueFirst()
    const base = parse(readLocal(AGENT))
    await server.put(noteKey, AGENT, doc([...base, block('bbbbb')]), T_PC)
    fs.writeFileSync(localPath(AGENT), doc([...base, block('ccccc')]))
    await cli.cloudPullNow()
    const merged = readLocal(AGENT)
    expect(parse(merged).map((b) => b.id).sort()).toEqual(['bbbbb', 'ccccc', id].sort())
    expect(merged).not.toContain('⚠️')
    expect(await server.content(AGENT)).toBe(merged)
    expect(logs.some((l) => l.includes('Merged with conflicts'))).toBe(false)
    expect(otherDirs()).toEqual([])
  })

  it('the same header line on both sides → markers inside agent.md only: not announced, read as the synced version', async () => {
    const id = await queueFirst()
    const withProgress = (p: string) => doc(parse(readLocal(AGENT)).map((b) => ({ ...b, meta: { ...b.meta, progress: p } })))
    fs.writeFileSync(localPath(AGENT), withProgress('p0'))
    await cli.syncPushNoteFiles(DIR, [NOTE_MD, 'agent.md']) // synced: the line exists in the base
    const theirs = withProgress('remote')
    const mine = withProgress('local')
    await server.put(noteKey, AGENT, theirs, T_PC)
    fs.writeFileSync(localPath(AGENT), mine)
    await cli.cloudPullNow()
    expect(readLocal(AGENT)).toContain('⚠️')
    expect(logs.some((l) => l.includes('Merged with conflicts'))).toBe(false)
    expect(parse(readLocal(AGENT)).find((b) => b.id === id)!.meta.progress).toBe('remote')
    expect(otherDirs()).toEqual([])
  })
})

describe('the planner, pure: agent.md is one more file of the folder', () => {
  const anchor = serializeNoteFolder({
    id: 'abc12345', title: 'Plan', tags: [], created: T0, updated: T0,
    sections: [{ id: 'st', name: 'Tasks', content: '' }],
  }, { preserveUpdated: true }).files[NOTE_MD]
  const ANCHOR = `${DIR}/${NOTE_MD}`
  const plan = (local: string | null, remote: string | null) => {
    const base = 'base text'
    return cli.planThreeWayDir({
      dir: DIR,
      local: { [ANCHOR]: anchor, ...(local === null ? {} : { [AGENT]: local }) },
      remote: [{ relPath: AGENT, seq: 7, content: remote, updatedAtMs: Date.parse(T_PC) }],
      bases: { [ANCHOR]: { seq: 1, hash: cli.hashForBase(ANCHOR, anchor) }, [AGENT]: { seq: 2, hash: cli.hashForBase(AGENT, base) } },
      pendingUpserts: new Set(), staleUpserts: new Set(), copiedUpserts: new Set(), pendingDeletes: new Set(),
      baseContent: () => base,
      nowIso: T_PC,
    })
  }

  it('remote tombstone + local unchanged → removed; + local changed → kept and uploaded; deleted here + edited there → restored', () => {
    expect(plan('base text', null)).toMatchObject({ removes: [AGENT], upload: [], copySections: [] })
    expect(plan('changed here', null)).toMatchObject({ removes: [], writes: [], upload: [AGENT], copySections: [] })
    expect(plan(null, 'edited there')).toMatchObject({ writes: [{ relPath: AGENT, content: 'edited there' }], removes: [], copySections: [] })
  })

  it('never listed as a section by the merged note.md', () => {
    const p = plan('changed here', 'changed there')
    expect(p.writes.every((w: { relPath: string; content: string }) => w.relPath !== ANCHOR || !w.content.includes('agent.md'))).toBe(true)
  })
})

// The bug (2026-11-21): an agent ran `task start` → `report` → `finish` while
// the desktop app, open on the same notes dir, synced on its own. Uploads were
// rejected as stale, the agent had to pull + push by hand, and the pull after
// `finish` left the task's line twice, between ⚠️ markers (done here, running
// already synced).
describe('a task command whose upload NoteFlow Cloud rejects (another device synced meanwhile)', () => {
  const ANCHOR = `${DIR}/${NOTE_MD}`
  const pending = () => JSON.parse(fs.readFileSync(path.join(tmp, 'config', 'noteflow', 'settings.json'), 'utf-8')).cliCloud.pendingUpserts
  /** The desktop app uploads a file exactly as it is on this disk (its own bases: it always lands). */
  const appUploads = (rel: string) => server.put(noteKey, rel, readLocal(rel), new Date().toISOString())
  const linesOf = (id: string) => readLocal(SECTION).split('\n').filter((l) => l.includes(`${ROBOT}${id}:`))
  const start = async () => {
    const id = await queueFirst()
    await cli.cmdTask(['start', id], {})
    logs = []
    return id
  }

  it('pulls, merges and uploads again by itself: one sync line, "Synced"', async () => {
    const id = await start()
    for (const rel of [SECTION, AGENT, ANCHOR]) await appUploads(rel)
    await cli.cmdTask(['finish', id], { summary: 'did it' })
    expect(logs.filter((l) => l.includes('Synced to NoteFlow Cloud'))).toHaveLength(1)
    expect(logs.some((l) => l.includes('not uploaded'))).toBe(false)
    expect(pending()).toBeUndefined()
    expect(linesOf(id)).toEqual([`- [x] Fix it ${ROBOT}${id}:done`])
    for (const rel of [SECTION, AGENT, ANCHOR]) expect(await server.content(rel)).toBe(readLocal(rel))
    expect(parse(readLocal(AGENT)).find((b) => b.id === id)!.meta.state).toBe('done')
  })

  it('the real case — the base text of the section is gone: done here + running synced → done, once, no ⚠️', async () => {
    const id = await start()
    fs.rmSync(cli.CLOUD_BASE_CONTENT_DIR, { recursive: true, force: true }) // no diff3: the two-way union
    await appUploads(SECTION) // `running`, under a newer seq
    await cli.cmdTask(['finish', id], { summary: 'did it' })
    expect(readLocal(SECTION)).toBe(`- [x] Fix it ${ROBOT}${id}:done\n- [ ] Other`)
    expect(await server.content(SECTION)).toBe(readLocal(SECTION))
    expect(logs.some((l) => l.includes('Merged with conflicts'))).toBe(false)
    expect(logs).toContain('  Synced to NoteFlow Cloud')
    // The task still answers to its id (it used to fail: "Task id … is on 2 lines").
    logs = []
    await cli.cmdTask(['show', id], {})
    expect(logs.join('\n')).toContain(`Task ${id} — done`)
  })

  it('the line right above the task changed on the server too: `finish` still lands clean', async () => {
    const id = await start()
    // The app (same disk) rewrites the section with one more line next to the task, and syncs.
    fs.writeFileSync(localPath(SECTION), `- [ ] Fix it ${ROBOT}${id}:running\n- [x] Other`)
    await appUploads(SECTION)
    await cli.cmdTask(['finish', id], { summary: 'did it' })
    expect(readLocal(SECTION)).toBe(`- [x] Fix it ${ROBOT}${id}:done\n- [x] Other`)
    expect(await server.content(SECTION)).toBe(readLocal(SECTION))
    expect(logs).toContain('  Synced to NoteFlow Cloud')
  })

  it('the server already says more than this command (done there, a late question here): its line wins', async () => {
    const id = await start()
    const done = `- [x] Fix it ${ROBOT}${id}:done\n- [ ] Other`
    await server.put(noteKey, SECTION, done, T_PC) // another machine closed the task…
    await cli.cmdTask(['ask', id, 'which one?'], {}) // …while this one, late, marks it waiting
    expect(readLocal(SECTION)).toBe(done)
    expect(await server.content(SECTION)).toBe(done)
    expect(logs.some((l) => l.includes('Merged with conflicts'))).toBe(false)
  })

  it('one cycle only: still rejected after the pull and one more upload → the hint, and the files stay pending', async () => {
    const id = await start()
    // Another device writes agent.md right before EVERY upload of it.
    const agentKey = await cli.derivePathKeyHmac((server as unknown as { dek: Uint8Array }).dek, AGENT)
    const handle = server.handle.bind(server)
    let attempts = 0
    server.handle = async (url: string, init: { method?: string; body?: string } = {}) => {
      if (url.includes('/rpc/cloud_upsert_file_v2') && JSON.parse(init.body || '{}').p_path_key === agentKey) {
        attempts++
        await server.put(noteKey, AGENT, `${await server.content(AGENT)}\n`, T_PC)
      }
      return handle(url, init)
    }
    await cli.cmdTask(['report', id, 'working'], {})
    expect(attempts).toBe(3) // the command's own upload, the pull's re-upload, ONE retry
    // The command's own verdict, once (the pull says the same about its re-upload, by folder).
    expect(logs.filter((l) => l.startsWith('  1 file(s) not uploaded: a newer version is on NoteFlow Cloud'))).toHaveLength(1)
    expect(logs.some((l) => l.includes('Synced to NoteFlow Cloud'))).toBe(false)
    expect(pending()).toEqual([AGENT])
  })

  it('the other commands are as before: a rejected upload is reported, nothing is pulled', async () => {
    await queueFirst()
    await appUploads(ANCHOR)
    logs = []
    const before = readLocal(ANCHOR)
    await cli.syncPushNoteFiles(DIR, [NOTE_MD])
    expect(logs).toEqual([expect.stringContaining('1 file(s) not uploaded: a newer version is on NoteFlow Cloud')])
    expect(pending()).toEqual([ANCHOR])
    expect(readLocal(ANCHOR)).toBe(before)
  })
})

describe('several CLI processes on one notes dir (an agent\'s commands under a long-lived `noteflow run`)', () => {
  const ANCHOR = `${DIR}/${NOTE_MD}`
  /** Another CLI process: fresh module state, the same disk and settings. */
  const otherProcess = (): Cli => {
    delete require.cache[CLI_PATH]
    return require(CLI_PATH)
  }

  it('an upload goes up on the bases the LAST process saved, not on the ones this one read earlier', async () => {
    await queueFirst()
    expect(cli.cliCloudBasesSnapshot()[ANCHOR]).toBeDefined() // this process has read the bases
    const other = otherProcess()
    await other.syncPushNoteFiles(DIR, [NOTE_MD]) // note.md gets a newer seq, saved by the other process
    logs = []
    await cli.syncPushNoteFiles(DIR, [NOTE_MD])
    expect(logs).toEqual(['  Synced to NoteFlow Cloud'])
  })

  it('a pull does not prune the base content another process stored since this one read the bases', async () => {
    await queueFirst()
    cli.cliCloudBasesSnapshot()
    const other = otherProcess()
    fs.writeFileSync(localPath(SECTION), `${readLocal(SECTION)}\n- [ ] One more`)
    await other.syncPushNoteFiles(DIR, [NOTE_MD, 'st.md'])
    const hash = other.cliCloudBasesSnapshot()[SECTION].hash
    // Old enough for the grace period not to be what keeps it.
    const old = new Date(Date.now() - 3600000)
    for (const name of fs.readdirSync(cli.CLOUD_BASE_CONTENT_DIR)) fs.utimesSync(path.join(cli.CLOUD_BASE_CONTENT_DIR, name), old, old)
    await cli.cloudPullNow()
    expect(fs.readdirSync(cli.CLOUD_BASE_CONTENT_DIR)).toContain(hash)
  })
})
