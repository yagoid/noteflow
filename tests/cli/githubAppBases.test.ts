// The app's last synced blob as the base of a CLI merge (cli/noteflow.js,
// adoptAppBases). The app keeps its bases in its userData sync-state.json, the
// CLI its own in cli-github-state.json: after the app pulled a version GitHub
// has already moved on from, the CLI diffed it against its OLDER base and found
// a conflict with no local change in it (⚠️ blocks, duplicated lines). Danger
// the other way: the app may be BEHIND the CLI — its base must not win then.
//
// End to end against an in-memory GitHub (as githubMerge.test.ts); every dir —
// HOME and the app's userData included — is a throwaway.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import { serializeSyncState, emptySyncState, type SyncState } from '../../electron/syncState'
import { gitBlobSha } from '../../electron/mirrorPlan'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')
const https = require('node:https') as { request: (...a: unknown[]) => unknown }

const OWNER = 'me'
const REPO = 'notes'
const DIR = 'plans-abc12345'
const ANCHOR = `${DIR}/${NOTE_MD}`
const S1 = `${DIR}/s1.md`
const S2 = `${DIR}/s2.md`
const at = (h: number) => `2026-11-20T${String(h).padStart(2, '0')}:00:00.000Z`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any

/** One repo's default branch: Contents API (sha-checked PUT/DELETE), recursive tree, git blobs. */
class FakeGithub {
  files = new Map<string, string>() // path → content
  blobs = new Map<string, string>() // every sha ever written → content
  calls: string[] = []
  failBlobs = false
  failPuts = new Set<string>() // paths whose PUT answers 500
  // Bytes above which the Contents API does not inline a file (GitHub: 1 MB):
  // `content: ""`, `encoding: "none"`, real sha and size.
  largeThreshold = Infinity

  put(rel: string, content: string) {
    this.files.set(rel, content)
    this.blobs.set(gitBlobSha(content), content)
  }

  handle(method: string, endpoint: string, body: Record<string, unknown> | undefined): { status: number; json: unknown } {
    const u = new URL(endpoint, 'https://api.github.com')
    const p = u.pathname
    const base = `/repos/${OWNER}/${REPO}`
    this.calls.push(`${method} ${decodeURIComponent(p)}`)
    if (p === base && method === 'GET') return { status: 200, json: { default_branch: 'main' } }
    if (p === `${base}/git/trees/main`) {
      return { status: 200, json: { tree: [...this.files].map(([path, c]) => ({ path, type: 'blob', sha: gitBlobSha(c) })) } }
    }
    if (p.startsWith(`${base}/git/blobs/`)) {
      const content = this.failBlobs ? undefined : this.blobs.get(p.slice(`${base}/git/blobs/`.length))
      if (content === undefined) return { status: 404, json: { message: 'Not Found' } }
      return { status: 200, json: { encoding: 'base64', content: Buffer.from(content).toString('base64') } }
    }
    if (p.startsWith(`${base}/contents/`)) {
      const rel = p.slice(`${base}/contents/`.length).split('/').map(decodeURIComponent).join('/')
      const cur = this.files.get(rel)
      const curSha = cur === undefined ? undefined : gitBlobSha(cur)
      if (method === 'GET') {
        if (cur === undefined) return { status: 404, json: { message: 'Not Found' } }
        const size = Buffer.byteLength(cur)
        if (size > this.largeThreshold) return { status: 200, json: { sha: curSha, size, encoding: 'none', content: '' } }
        return { status: 200, json: { sha: curSha, size, encoding: 'base64', content: Buffer.from(cur).toString('base64') } }
      }
      if (method === 'PUT') {
        if (this.failPuts.has(rel)) return { status: 500, json: { message: 'Server Error' } }
        if (body?.sha !== curSha) return { status: 409, json: { message: `${rel} does not match ${String(body?.sha)}` } }
        this.put(rel, Buffer.from(String(body?.content), 'base64').toString('utf-8'))
        return { status: 200, json: { content: { sha: gitBlobSha(this.files.get(rel)!) } } }
      }
      if (method === 'DELETE') {
        if (cur === undefined || body?.sha !== curSha) return { status: 409, json: { message: 'sha mismatch' } }
        this.files.delete(rel)
        return { status: 200, json: {} }
      }
    }
    return { status: 404, json: { message: `unexpected ${method} ${p}` } }
  }
}

let tmp: string
let notesDir: string
let configDir: string
let cli: Cli
let gh: FakeGithub
let logs: string[]
let appShas: Record<string, string>
const savedEnv = { ...process.env }

const statePath = () => path.join(configDir, 'noteflow', 'cli-github-state.json')
const cliState = () => JSON.parse(fs.readFileSync(statePath(), 'utf-8'))
const appStatePath = () => path.join(
  path.dirname(cli.desktopSettingsCandidates(process.platform, process.env, os.homedir())[0]), 'sync-state.json')

function note(updated: string, sections: Record<string, string>): DiskNote {
  return {
    id: 'abc12345', title: 'Plans', tags: [], created: at(0), updated,
    sections: Object.entries(sections).map(([id, content]) => ({ id, name: id.toUpperCase(), content })),
  }
}
const filesOf = (n: DiskNote) => serializeNoteFolder(n, { preserveUpdated: true }).files

/** Another device (the phone) pushes a version to GitHub. */
function remoteSave(n: DiskNote) {
  const files = filesOf(n)
  for (const rel of [...gh.files.keys()]) if (rel.startsWith(`${DIR}/`) && !(rel.slice(DIR.length + 1) in files)) gh.files.delete(rel)
  for (const [name, content] of Object.entries(files)) gh.put(`${DIR}/${name}`, content)
}
const localDir = () => path.join(notesDir, DIR)
const readLocal = (rel: string) => fs.readFileSync(path.join(notesDir, rel), 'utf-8')
const writeLocal = (rel: string, content: string) => fs.writeFileSync(path.join(notesDir, rel), content)
/** Every '.md' on disk, all folders (conflict copies included), joined. */
const allLocalText = () => fs.readdirSync(notesDir, { recursive: true, encoding: 'utf-8' })
  .filter((f) => f.endsWith('.md')).map(readLocal).join('\n')
/** An edit of this machine: the whole folder of `n`. */
function localSave(n: DiskNote) {
  const files = filesOf(n)
  for (const f of fs.readdirSync(localDir())) if (!(f in files)) fs.unlinkSync(path.join(localDir(), f))
  for (const [name, content] of Object.entries(files)) writeLocal(`${DIR}/${name}`, content)
  return Object.keys(files)
}
function writeAppState(patch: Partial<SyncState> = {}) {
  fs.mkdirSync(path.dirname(appStatePath()), { recursive: true })
  fs.writeFileSync(appStatePath(), serializeSyncState({
    ...emptySyncState(), shas: appShas, githubRemote: { owner: OWNER, repo: REPO, repoId: 7 }, ...patch,
  }))
}
/** The app's pull: GitHub's folder on disk, then its shas. */
function appPull() {
  fs.mkdirSync(localDir(), { recursive: true })
  for (const f of fs.readdirSync(localDir())) if (!gh.files.has(`${DIR}/${f}`)) fs.unlinkSync(path.join(localDir(), f))
  appShas = {}
  for (const [rel, content] of gh.files) {
    if (rel.startsWith(`${DIR}/`)) writeLocal(rel, content)
    appShas[rel] = gitBlobSha(content)
  }
  writeAppState()
}
const otherDirs = () => fs.readdirSync(notesDir).filter((d) => d !== DIR && fs.statSync(path.join(notesDir, d)).isDirectory())

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-ghapp-'))
  notesDir = path.join(tmp, 'notes')
  configDir = path.join(tmp, 'config')
  const home = path.join(tmp, 'home')
  fs.mkdirSync(path.join(configDir, 'noteflow'), { recursive: true })
  fs.mkdirSync(notesDir)
  fs.mkdirSync(home)
  process.env.APPDATA = configDir
  process.env.XDG_CONFIG_HOME = configDir
  process.env.HOME = home
  process.env.USERPROFILE = home
  process.env.NOTEFLOW_NOTES_DIR = notesDir
  fs.writeFileSync(path.join(configDir, 'noteflow', 'settings.json'), JSON.stringify({
    language: 'en',
    githubSync: { enabled: true, owner: OWNER, repo: REPO, repoId: 7, encryptedToken: Buffer.from('ghp_test').toString('base64') },
  }))
  delete require.cache[CLI_PATH]
  cli = require(CLI_PATH)
  gh = new FakeGithub()
  appShas = {}
  vi.spyOn(https, 'request').mockImplementation(((opts: { method: string; path: string }, cb: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>
    let payload = ''
    req.setTimeout = () => req
    req.write = (chunk: string) => { payload += chunk }
    req.end = () => {
      const r = gh.handle(opts.method, opts.path, payload ? JSON.parse(payload) : undefined)
      const res = new EventEmitter() as EventEmitter & { statusCode: number }
      res.statusCode = r.status
      queueMicrotask(() => {
        cb(res)
        res.emit('data', JSON.stringify(r.json))
        res.emit('end')
      })
    }
    return req
  }) as never)
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...savedEnv }
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

const DUP = {
  base: '- [ ] A',
  local: '- [ ] A\n- [ ] B\n- [ ] C',
  remote: '- [ ] A\n- [ ] B 🤖8t6fq:queued\n- [ ] C texto largo 🤖1785a:queued',
}
const MARKS = {
  base: '- [ ] Dividers texto viejo\n- [ ] Imagenes\n- [ ] Sticky\n- [ ] Tokens cuando',
  local: '- [ ] Dividers 🤖lr5xq:queued\n- [ ] Imagenes 🤖gyd8a:queued\n- [ ] Sticky\n- [ ] Diagramas\n- [ ] Tokens cuando dice eso, ha sido eso.',
  remote: '- [ ] Dividers 🤖lr5xq:queued\n- [ ] Imagenes 🤖gyd8a:queued\n- [ ] Sticky\n- [ ] Diagramas 🤖0p2vh:queued\n- [ ] Tokens cuando dice eso, significa eso a precio oficial.',
}

/** CLI (and app) synced at `a`; the phone pushed `b`, the app pulled it; the phone pushed `c`. */
async function staleCliBase(a: string, b: string, c: string) {
  remoteSave(note(at(1), { s1: a, s2: 'same' }))
  appPull()
  await cli.cmdPull()
  remoteSave(note(at(2), { s1: b, s2: 'same' }))
  appPull()
  remoteSave(note(at(3), { s1: c, s2: 'same' }))
  logs = []
}

describe('the app pulled a version the CLI never saw, GitHub moved on', () => {
  for (const [name, t] of Object.entries({ 'marks case': MARKS, 'duplicated lines case': DUP })) {
    it(`noteflow pull takes GitHub's version — ${name}`, async () => {
      await staleCliBase(t.base, t.local, t.remote)
      const appState = fs.readFileSync(appStatePath(), 'utf-8')
      await cli.cmdPull()
      expect(readLocal(S1)).toBe(t.remote)
      expect(readLocal(ANCHOR)).toBe(gh.files.get(ANCHOR))
      expect(cliState().shas[S1]).toBe(gitBlobSha(t.remote))
      expect(fs.readFileSync(appStatePath(), 'utf-8')).toBe(appState) // read only
      expect(logs.some((l) => l.includes('conflicts') || l.includes('noteflow push'))).toBe(false)
      logs = []
      await cli.cmdPull()
      expect(logs.find((l) => l.startsWith('  Done'))).toBe('  Done: 0 pulled')
    })

    it(`noteflow push takes GitHub's version and uploads nothing of the note — ${name}`, async () => {
      await staleCliBase(t.base, t.local, t.remote)
      gh.calls = []
      await cli.cmdPush()
      expect(readLocal(S1)).toBe(t.remote)
      expect(gh.files.get(S1)).toBe(t.remote)
      expect(gh.calls.filter((c) => (c.startsWith('PUT') || c.startsWith('DELETE')) && c.includes(DIR))).toEqual([])
    })

    it(`the push of a command that edited ANOTHER section keeps both — ${name}`, async () => {
      await staleCliBase(t.base, t.local, t.remote)
      const files = localSave(note(at(4), { s1: t.local, s2: 'edited here' }))
      await cli.syncPushNoteFiles(DIR, files)
      expect(gh.files.get(S1)).toBe(t.remote)
      expect(readLocal(S1)).toBe(t.remote)
      expect(gh.files.get(S2)).toBe('edited here')
      expect(gh.files.get(ANCHOR)).toBe(readLocal(ANCHOR))
    })
  }

  it('a failed download keeps the stamp: the retry still adopts', async () => {
    await staleCliBase(DUP.base, DUP.local, DUP.remote)
    const handle = gh.handle.bind(gh)
    gh.handle = (m, e, b) => (e.includes('/contents/') && e.includes('s1.md') ? { status: 500, json: { message: 'x' } } : handle(m, e, b))
    await cli.cmdPull()
    expect(readLocal(S1)).toBe(DUP.local)
    gh.handle = handle
    await cli.cmdPull()
    expect(readLocal(S1)).toBe(DUP.remote)
  })

  it('an encrypted note (not mergeable): the push takes GitHub with no conflict copy', async () => {
    const save = (h: number, c: string) => {
      const n = filesOf(note(at(h), { s1: c }))
      gh.put(ANCHOR, n[NOTE_MD].replace(/^title:/m, 'encryption: "x"\ntitle:'))
      gh.put(S1, c)
    }
    save(1, 'aaa')
    appPull()
    await cli.cmdPull()
    save(2, 'bbb')
    appPull()
    save(3, 'ccc')
    await cli.cmdPush()
    expect(readLocal(S1)).toBe('ccc')
    expect(otherDirs()).toEqual([])
  })
})

describe('a local change is never discarded', () => {
  it('local is not the sha of the app → merged as before', async () => {
    await staleCliBase('one\ntwo\nthree', 'one\ntwo\nTHREE', 'ONE\ntwo\nTHREE')
    writeLocal(S1, 'one\ntwo\nTHREE\nmine')
    await cli.cmdPull()
    expect(readLocal(S1)).toContain('mine')
    await cli.cmdPush()
    expect(gh.files.get(S1)).toContain('mine')
  })

  it('a section edited here survives GitHub deleting it, next to an adopted note.md', async () => {
    await staleCliBase('a', 'b', 'c')
    writeLocal(S2, 'same, edited here')
    remoteSave(note(at(5), { s1: 'c' })) // s2 deleted on GitHub
    await cli.cmdPull()
    expect(allLocalText()).toContain('same, edited here')
    expect(readLocal(S1)).toBe('c')
  })

  it('a section the CLI never synced, edited here, stays when GitHub no longer lists it', async () => {
    remoteSave(note(at(1), { s1: 'a' }))
    appPull()
    await cli.cmdPull()
    remoteSave(note(at(2), { s1: 'b', s3: 'new' }))
    appPull()
    writeLocal(`${DIR}/s3.md`, 'new, edited here')
    remoteSave(note(at(3), { s1: 'c' }))
    await cli.cmdPull()
    expect(readLocal(S1)).toBe('c')
    expect(readLocal(`${DIR}/s3.md`)).toBe('new, edited here')
    expect(readLocal(ANCHOR)).toContain('s3.md')
  })

  // The CLI uploaded B, the app is still at A, the file goes back to A, GitHub → C.
  async function reverted() {
    remoteSave(note(at(1), { s1: 'x\nA\ny\nz', s2: 'same' }))
    appPull()
    await cli.cmdPull()
    await cli.syncPushNoteFiles(DIR, localSave(note(at(2), { s1: 'x\nB\ny\nz', s2: 'same' }))) // the app not told
    expect(cliState().shas[S1]).toBe(gitBlobSha('x\nB\ny\nz'))
    writeLocal(S1, 'x\nA\ny\nz')
    remoteSave(note(at(3), { s1: 'x\nB\ny\nC', s2: 'same' }))
  }
  it('the app is behind this CLI: a revert to its version survives a pull', async () => {
    await reverted()
    await cli.cmdPull()
    expect(readLocal(S1)).toBe('x\nA\ny\nC')
  })
  it('…and a push', async () => {
    await reverted()
    await cli.cmdPush()
    expect(gh.files.get(S1)).toBe('x\nA\ny\nC')
  })

  it("a pull that finds a base again as GitHub's blob renews its stamp", async () => {
    remoteSave(note(at(1), { s1: 'x\nB\ny\nz', s2: 'same' }))
    appPull()
    await cli.cmdPull()
    // GitHub B → A → B; the app only saw A.
    remoteSave(note(at(2), { s1: 'x\nA\ny\nz', s2: 'same' }))
    appPull()
    remoteSave(note(at(3), { s1: 'x\nB\ny\nz', s2: 'same' }))
    await cli.cmdPull()
    localSave(note(at(3), { s1: 'x\nB\ny\nz', s2: 'same' }))
    await cli.cmdPull()
    writeLocal(S1, 'x\nA\ny\nz')
    gh.put(S1, 'x\nB\ny\nC')
    await cli.cmdPull()
    expect(readLocal(S1)).toBe('x\nA\ny\nC')
  })

  it('a mutation of the file pending in the app → not adopted', async () => {
    await staleCliBase(DUP.base, DUP.local, DUP.remote)
    writeAppState({ ops: { [S1]: { op: 'upsert', queuedAt: at(4), attempts: 0 } } })
    await cli.cmdPull()
    expect(readLocal(S1)).not.toBe(DUP.remote)
  })
})

describe('no usable app state → exactly the previous behaviour', () => {
  const cases: Record<string, () => void> = {
    absent: () => fs.rmSync(appStatePath()),
    'corrupt (half written)': () => fs.writeFileSync(appStatePath(), '{"version":1,"ops":{},"sha'),
    'unknown version': () => fs.writeFileSync(appStatePath(), fs.readFileSync(appStatePath(), 'utf-8').replace('"version":1', '"version":2')),
    'no githubRemote': () => writeAppState({ githubRemote: undefined }),
    'another repo': () => writeAppState({ githubRemote: { owner: OWNER, repo: 'other', repoId: 7 } }),
    'same name, another repoId': () => writeAppState({ githubRemote: { owner: OWNER, repo: REPO, repoId: 8 } }),
    'CLI state without stamps (2.25.1)': () => {
      const st = cliState()
      delete st.appShas
      fs.writeFileSync(statePath(), JSON.stringify(st))
    },
  }
  for (const [name, spoil] of Object.entries(cases)) {
    it(name, async () => {
      await staleCliBase(DUP.base, DUP.local, DUP.remote)
      spoil()
      const expected = cli.mergeSectionText(DUP.base, DUP.local, DUP.remote).content
      expect(expected).not.toBe(DUP.remote)
      await cli.cmdPull()
      expect(readLocal(S1)).toBe(expected)
    })
  }

  it('with no app state a base gets no stamp; the first save that can read it fills it in', async () => {
    remoteSave(note(at(1), { s1: 'a', s2: 'b' }))
    await cli.cmdPull()
    expect(cliState().appShas).toBeUndefined()
    appPull()
    await cli.cmdPull()
    expect(cliState().appShas[S1]).toBe(gitBlobSha('a'))
  })

  it('stamps: kept while the base stands, renewed when it changes or is confirmed, dropped with an unreadable app', () => {
    const app = { ops: {}, shas: { [S1]: 'new' } }
    const prev = { shas: { [S1]: 'b' }, appShas: { [S1]: 'old' } }
    const run = (shas: object, confirmed: string[], a: unknown) => cli.nextAppShaStamps(prev, shas, new Set(confirmed), a)
    expect(run({ [S1]: 'b' }, [], app)).toEqual({ [S1]: 'old' })
    expect(run({ [S1]: 'b' }, [], null)).toEqual({ [S1]: 'old' })
    expect(run({ [S1]: 'b' }, [S1], app)).toEqual({ [S1]: 'new' })
    expect(run({ [S1]: 'b2' }, [], app)).toEqual({ [S1]: 'new' })
    expect(run({ [S1]: 'b2' }, [], null)).toEqual({})
    expect(run({ [S2]: 'b', 'groups.json': 'g' }, [], app)).toEqual({ [S2]: null })
  })
})

describe('deletions do not change', () => {
  const AGENT = `${DIR}/agent.md`
  const bases = { [ANCHOR]: 'o', [S1]: 'o1', [AGENT]: 'oa' }
  const app = { ops: {}, shas: { [ANCHOR]: 'l', [S1]: 'l1', [AGENT]: 'la' } }
  const local = { [ANCHOR]: 'l', [S1]: 'l1', [AGENT]: 'la' }

  it('files deleted on GitHub keep the base of the CLI', () => {
    expect(cli.adoptAppBases(DIR, bases, bases, app, { [ANCHOR]: 'r' }, local)).toEqual({ ...bases, [ANCHOR]: 'l' })
  })
  it('files gone here keep it too, and so does note.md', () => {
    expect(cli.adoptAppBases(DIR, bases, bases, app, { [ANCHOR]: 'r', [S1]: 'r1', [AGENT]: 'ra' }, { [ANCHOR]: 'l', [AGENT]: 'la' }))
      .toEqual({ ...bases, [AGENT]: 'la' })
  })
  it('never a base for a path without one', () => {
    expect(cli.adoptAppBases(DIR, {}, { [S1]: null }, app, { [S1]: 'r' }, local)).toEqual({})
  })
  it('a base that already is the remote or the local blob is left alone', () => {
    expect(cli.adoptAppBases(DIR, bases, { [S1]: 'x' }, app, { [S1]: 'o1' }, local)).toEqual(bases)
  })

  it('agent.md deleted on GitHub, synced here by the app: kept, as before', async () => {
    await staleCliBase('a', 'b', 'c')
    gh.put(AGENT, 'v1')
    appPull()
    await cli.cmdPull() // the CLI has a base for agent.md
    gh.put(AGENT, 'v2')
    appPull()
    gh.files.delete(AGENT)
    gh.put(S1, 'd')
    await cli.cmdPull()
    expect(readLocal(S1)).toBe('d')
    expect(readLocal(AGENT)).toBe('v2')
  })

  it('a section file on GitHub no note.md lists gets no base and is not deleted', async () => {
    await staleCliBase(DUP.base, DUP.local, DUP.remote)
    gh.put(`${DIR}/loose.md`, 'half done push')
    appShas[`${DIR}/loose.md`] = gitBlobSha('half done push')
    writeAppState()
    await cli.cmdPull()
    expect(readLocal(S1)).toBe(DUP.remote)
    expect(cliState().shas).not.toHaveProperty(`${DIR}/loose.md`)
    expect(fs.existsSync(path.join(localDir(), 'loose.md'))).toBe(false)
    await cli.cmdPush()
    expect(gh.files.get(`${DIR}/loose.md`)).toBe('half done push')
  })

  it('a synced section missing here: same outcome with and without the app state', async () => {
    const run = async (withApp: boolean) => {
      await staleCliBase('a', 'b', 'c')
      fs.unlinkSync(path.join(localDir(), 's2.md'))
      if (!withApp) fs.rmSync(appStatePath())
      await cli.cmdPull()
      await cli.cmdPush()
      const out = { gh: [...gh.files.keys()].sort(), local: fs.readdirSync(localDir()).sort() }
      fs.rmSync(localDir(), { recursive: true })
      fs.rmSync(statePath())
      gh.files.clear()
      return out
    }
    expect(await run(true)).toEqual(await run(false))
  })

  it('a section removed here and unchanged on GitHub is still deleted there by the push', async () => {
    await staleCliBase('a', 'b', 'c')
    localSave(note(at(4), { s1: 'b' }))
    await cli.cmdPush()
    expect(gh.files.has(S2)).toBe(false)
    expect(gh.files.get(S1)).toBe('c')
  })
})
