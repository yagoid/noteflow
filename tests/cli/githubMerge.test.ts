// GitHub conflict path of the CLI (cli/noteflow.js, githubResolveConflictDir):
// a note GitHub held back on push (changed there since this machine's base) is
// MERGED file by file — same planner and line merge as the desktop app's
// GitHub pull (electron/githubMerge.ts) — instead of the remote version
// winning the folder and the local one going to a conflict copy. The copy
// stays only where the app keeps it (encrypted note, unreadable anchor,
// section deleted on GitHub and edited here, merge failure).
//
// End to end: the real syncPushNoteFiles / cmdPush / cmdPull against an
// IN-MEMORY GitHub behind an `https.request` mock (Contents, Trees and Git
// Blobs APIs, with the Contents API's sha check). Notes and settings live in
// throwaway dirs — no request ever leaves the process.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { serializeNoteFolder, splitFrontmatter, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import { planGithubDirMerge, type GithubMergeFile } from '../../electron/githubMerge'
import { gitBlobSha } from '../../electron/mirrorPlan'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')
const https = require('node:https') as { request: (...a: unknown[]) => unknown }

const OWNER = 'me'
const REPO = 'notes'
const DIR = 'groceries-abc12345'
const ANCHOR = `${DIR}/${NOTE_MD}`
const T0 = '2026-10-30T18:00:00.000Z'
const T_PC = '2026-11-01T20:00:00.000Z'
const T_CLI = '2026-11-02T10:03:00.000Z'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any

/** One repo's default branch: Contents API (sha-checked PUT/DELETE), recursive tree, git blobs. */
class FakeGithub {
  files = new Map<string, string>() // path → content
  blobs = new Map<string, string>() // every sha ever written → content
  calls: string[] = []
  failBlobs = false

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
        return { status: 200, json: { sha: curSha, content: Buffer.from(cur).toString('base64') } }
      }
      if (method === 'PUT') {
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
const savedEnv = { ...process.env }

function settingsPath() {
  return path.join(configDir, 'noteflow', 'settings.json')
}

function note(updated: string, sections: Record<string, string>, extra?: Partial<DiskNote>): DiskNote {
  return {
    id: 'abc12345', title: 'Groceries', tags: ['home'], created: '2026-10-01T00:00:00.000Z', updated,
    sections: Object.entries(sections).map(([id, content]) => ({ id, name: id.toUpperCase(), content })),
    ...extra,
  }
}
const filesOf = (n: DiskNote) => serializeNoteFolder(n, { preserveUpdated: true }).files

/** The "PC" (desktop app) pushes a version of the note to GitHub. */
function pcSave(n: DiskNote) {
  const files = filesOf(n)
  for (const rel of [...gh.files.keys()]) if (rel.startsWith(`${DIR}/`) && !(rel.slice(DIR.length + 1) in files)) gh.files.delete(rel)
  for (const [name, content] of Object.entries(files)) gh.put(`${DIR}/${name}`, content)
}

const localPath = (rel: string) => path.join(notesDir, rel)
const readLocal = (rel: string) => fs.readFileSync(localPath(rel), 'utf-8')
/** An edit of this machine (what a CLI command writes): the whole folder of `n`. */
function cliSave(n: DiskNote) {
  const files = filesOf(n)
  for (const f of fs.readdirSync(localPath(DIR))) if (!(f in files)) fs.unlinkSync(localPath(`${DIR}/${f}`))
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(localPath(`${DIR}/${name}`), content)
  return Object.keys(files)
}
const otherDirs = () => fs.readdirSync(notesDir).filter((d) => d !== DIR && fs.statSync(path.join(notesDir, d)).isDirectory())
const LABEL_LOCAL = `> ⚠️ Sync conflict (T) — version from ${os.hostname()} (CLI):`
const untimed = (s: string) => s.replace(/\(\d{4}-\d\d-\d\d \d\d:\d\d\)/g, '(T)')

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-ghmerge-'))
  notesDir = path.join(tmp, 'notes')
  configDir = path.join(tmp, 'config')
  fs.mkdirSync(path.join(configDir, 'noteflow'), { recursive: true })
  fs.mkdirSync(notesDir)
  process.env.APPDATA = configDir
  process.env.XDG_CONFIG_HOME = configDir
  process.env.NOTEFLOW_NOTES_DIR = notesDir
  fs.writeFileSync(settingsPath(), JSON.stringify({
    language: 'en',
    githubSync: { enabled: true, owner: OWNER, repo: REPO, encryptedToken: Buffer.from('ghp_test').toString('base64') },
  }))
  delete require.cache[CLI_PATH]
  cli = require(CLI_PATH)
  gh = new FakeGithub()
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

  // The PC creates the note; this machine pulls it (its bases = those blobs).
  pcSave(note(T0, { s1: 'milk\nflour\neggs', s2: 'call mum' }))
  await cli.cmdPull()
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...savedEnv }
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('CLI GitHub push of a note changed there since the last pull', () => {
  it('a line added here + a remote change of another line → one merged note, no copy, no notice', async () => {
    pcSave(note(T_PC, { s1: 'MILK\nflour\neggs', s2: 'call mum' }))
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    const { conflicted } = await cli.syncPushNoteFiles(DIR, files)
    expect(conflicted).toBe(true)
    expect(otherDirs()).toEqual([]) // no conflict copy
    expect(readLocal(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
    expect(gh.files.get(ANCHOR)).toBe(readLocal(ANCHOR))
    expect(readLocal(ANCHOR)).toContain(T_CLI) // the later local `updated` wins
    expect(gh.calls.some((c) => c.startsWith('GET /repos/me/notes/git/blobs/'))).toBe(true) // diff3 base
    expect(logs.some((l) => l.includes('Merged with conflicts'))).toBe(false)
    expect(logs.some((l) => l.includes('Conflict: local changes kept'))).toBe(false)
    expect(logs.some((l) => l.includes('Synced to GitHub'))).toBe(true)
    // The bases follow the uploaded blobs: the next push is a no-op, not a conflict.
    gh.calls = []
    expect((await cli.syncPushNoteFiles(DIR, files)).conflicted).toBe(false)
    expect(gh.calls.filter((c) => c.startsWith('PUT'))).toEqual([])
  })

  it('different sections changed on each side → both kept', async () => {
    pcSave(note(T_PC, { s1: 'milk\nflour\neggs', s2: 'call mum (PC)' }))
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    await cli.syncPushNoteFiles(DIR, files)
    expect(otherDirs()).toEqual([])
    expect(readLocal(`${DIR}/s2.md`)).toBe('call mum (PC)')
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('milk\nflour\neggs\nbread')
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call mum (PC)')
  })

  it('the same line changed on both sides → both versions between ⚠️ markers in the note, uploaded, notice', async () => {
    pcSave(note(T_PC, { s1: 'milk\nflour\neggs', s2: 'call dad' }))
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs', s2: 'call grandma' }))
    await cli.syncPushNoteFiles(DIR, files)
    expect(otherDirs()).toEqual([])
    const merged = readLocal(`${DIR}/s2.md`)
    expect(untimed(merged)).toBe([
      LABEL_LOCAL, '', 'call grandma', '', '> ⚠️ Sync conflict — version already synced:', '', 'call dad', '',
      '> ⚠️ End of sync conflict',
    ].join('\n'))
    expect(gh.files.get(`${DIR}/s2.md`)).toBe(merged)
    expect(logs).toContain('  Merged with conflicts: "Groceries" — both versions kept, look for the ⚠️ markers')
    expect(logs.some((l) => l.includes('Conflict: local changes kept'))).toBe(false)
  })

  it('base blob unreadable → two-way union (still no copy)', async () => {
    gh.failBlobs = true
    pcSave(note(T_PC, { s1: 'milk\nflour\neggs\njam', s2: 'call mum' }))
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\njam\nbread', s2: 'call mum' }))
    await cli.syncPushNoteFiles(DIR, files)
    expect(otherDirs()).toEqual([])
    expect(readLocal(`${DIR}/s1.md`)).toBe('milk\nflour\neggs\njam\nbread')
  })

  it('`noteflow push` takes the same merge path', async () => {
    pcSave(note(T_PC, { s1: 'MILK\nflour\neggs', s2: 'call mum' }))
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    await cli.cmdPush()
    expect(otherDirs()).toEqual([])
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
    expect(gh.files.get(ANCHOR)).toBe(readLocal(ANCHOR))
    // Synced, not held back: the summary does not say "changed on GitHub".
    const done = logs.find((l) => l.includes('Done:') && l.includes('pushed')) ?? ''
    expect(done).toContain('0 errors, 1 merged with GitHub')
    expect(done).not.toContain('changed on GitHub')
  })

  it('a section deleted here and untouched on GitHub stays deleted there too', async () => {
    pcSave(note(T_PC, { s1: 'MILK\nflour\neggs', s2: 'call mum' }))
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs' })) // s2 removed here
    await cli.syncPushNoteFiles(DIR, files)
    expect(fs.existsSync(localPath(`${DIR}/s2.md`))).toBe(false)
    expect(gh.files.has(`${DIR}/s2.md`)).toBe(false)
    expect(gh.files.get(ANCHOR)).not.toContain('s2.md')
    expect(readLocal(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs')
  })

  it('a section deleted on GitHub, edited here and pushed with the note → the local edit is not lost', async () => {
    pcSave(note(T_PC, { s1: 'MILK\nflour\neggs' })) // s2 deleted on the PC
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum today' }))
    await cli.syncPushNoteFiles(DIR, files) // s2.md is absent on GitHub → plain PUT (like the app's push)
    expect(otherDirs()).toEqual([])
    // Re-created on GitHub before the anchor's merge; the merged note.md (only
    // the remote changed its sections) no longer lists it — the orphan-file
    // residual documented for the app (sync.md, QA B3), same planner here.
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call mum today')
    expect(readLocal(`${DIR}/s2.md`)).toBe('call mum today')
    expect(readLocal(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
  })

  it('a section deleted on GitHub and edited here (not pushed) → deletion applied, a copy of only that section', async () => {
    pcSave(note(T_PC, { s1: 'MILK\nflour\neggs' })) // s2 deleted on the PC
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum today' }))
    // A later command that only rewrites note.md (e.g. `noteflow favorite`) pushes just the anchor.
    await cli.syncPushNoteFiles(DIR, [NOTE_MD])
    expect(fs.existsSync(localPath(`${DIR}/s2.md`))).toBe(false)
    expect(readLocal(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
    expect(gh.files.has(`${DIR}/s2.md`)).toBe(false)
    const copies = otherDirs()
    expect(copies).toHaveLength(1)
    const copyFiles = fs.readdirSync(path.join(notesDir, copies[0])).sort()
    expect(copyFiles).toEqual(['note.md', 's2.md'])
    expect(fs.readFileSync(path.join(notesDir, copies[0], 's2.md'), 'utf-8')).toBe('call mum today')
    expect(gh.files.get(`${copies[0]}/s2.md`)).toBe('call mum today') // uploaded
    expect(logs.some((l) => l.includes('Conflict: local changes kept as "Groceries (conflict copy'))).toBe(true)
  })
})

describe('encrypted note: the conflict copy, as before', () => {
  beforeEach(async () => {
    pcSave(note(T0, {}, { encryption: { v: 1, ct: 'c0' } } as Partial<DiskNote>))
    await cli.cmdPull({ force: true })
  })

  it('both sides changed it → the GitHub version wins the folder, the local one is kept as a copy', async () => {
    pcSave(note(T_PC, {}, { encryption: { v: 1, ct: 'c-pc' } } as Partial<DiskNote>))
    const files = cliSave(note(T_CLI, {}, { encryption: { v: 1, ct: 'c-cli' } } as Partial<DiskNote>))
    await cli.syncPushNoteFiles(DIR, files)
    expect(readLocal(ANCHOR)).toContain('c-pc')
    const copies = otherDirs()
    expect(copies).toHaveLength(1)
    expect(fs.readFileSync(path.join(notesDir, copies[0], NOTE_MD), 'utf-8')).toContain('c-cli')
    expect(logs.some((l) => l.includes('Conflict: local changes kept as'))).toBe(true)
    expect(logs.some((l) => l.includes('Merged with conflicts'))).toBe(false)
  })
})

describe('planGithubDirMerge: CLI ↔ app parity', () => {
  const NOW = '2026-11-06T10:00:00.000Z'
  const LABELS = { local: 'L', remote: 'R', end: 'E' }
  const folder = (updated: string, sections: Record<string, string>, extra?: Partial<DiskNote>) => {
    const out: Record<string, string> = {}
    for (const [f, c] of Object.entries(filesOf(note(updated, sections, extra)))) out[`${DIR}/${f}`] = c
    return out
  }
  const threeWay = (base: Record<string, string>, remote: Record<string, string>, local: Record<string, string>, withBase = true): GithubMergeFile[] =>
    [...new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])].map((p) => ({
      path: p,
      base: base[p] === undefined ? undefined : gitBlobSha(base[p]),
      remote: remote[p] === undefined ? null : { sha: gitBlobSha(remote[p]), content: remote[p] },
      local: local[p] ?? null,
      localSha: local[p] === undefined ? null : gitBlobSha(local[p]),
      baseContent: withBase ? (base[p] ?? null) : null,
    }))
  const T1 = '2026-10-01T00:00:00.000Z', T2 = '2026-10-02T00:00:00.000Z', T3 = '2026-10-03T00:00:00.000Z'
  const enc = (u: string, ct: string) => folder(u, {}, { encryption: { v: 1, ct } } as Partial<DiskNote>)
  const cases: Array<[string, GithubMergeFile[]]> = [
    ['line added + remote change', threeWay(folder(T1, { s1: 'a\nb' }), folder(T2, { s1: 'A\nb' }), folder(T3, { s1: 'a\nb\nc' }))],
    ['same line', threeWay(folder(T1, { s1: 'a' }), folder(T2, { s1: 'b' }), folder(T3, { s1: 'c' }))],
    ['no base content', threeWay(folder(T1, { s1: 'a' }), folder(T2, { s1: 'a\nb' }), folder(T3, { s1: 'a\nb\nc' }), false)],
    ['sections on each side', threeWay(folder(T1, { s1: 'a', s2: 'b' }), folder(T2, { s1: 'a', s2: 'B' }), folder(T3, { s1: 'A', s2: 'b' }))],
    ['deleted on GitHub, edited here', threeWay(folder(T1, { s1: 'a', s2: 'b' }), folder(T2, { s1: 'a' }), folder(T3, { s1: 'a', s2: 'b2' }))],
    ['deleted here, untouched there', threeWay(folder(T1, { s1: 'a', s2: 'b' }), folder(T2, { s1: 'A', s2: 'b' }), folder(T3, { s1: 'a' }))],
    ['added on both sides', threeWay(folder(T1, { s1: 'a' }), folder(T2, { s1: 'a', s2: 'r' }), folder(T3, { s1: 'a', s3: 'l' }))],
    ['tags/favorited', threeWay(folder(T1, { s1: 'a' }), folder(T2, { s1: 'a' }, { tags: ['x'] }), folder(T3, { s1: 'b' }, { favorited: true }))],
    ['encrypted', threeWay(enc(T1, 'c0'), enc(T2, 'c1'), enc(T3, 'c2'))],
    ['remote anchor missing', threeWay(folder(T1, { s1: 'a' }), { [`${DIR}/s1.md`]: 'x' }, folder(T3, { s1: 'y' }))],
  ]
  // The CLI rewrites note.md's frontmatter textually (no YAML library), the app
  // re-dumps it: the parity is in the DATA it loads to (js-yaml), not the bytes.
  const parsedAnchor = (content: string) => {
    const { frontmatter, body } = splitFrontmatter(content)
    return { fm: yaml.load(frontmatter), body }
  }
  const normalized = (m: ReturnType<typeof planGithubDirMerge>) => m && {
    ...m,
    writes: m.writes.map((w) => (w.relPath === ANCHOR ? { ...w, content: parsedAnchor(w.content) } : w)),
    final: Object.fromEntries(Object.entries(m.final).map(([k, v]) => [k, k === ANCHOR ? parsedAnchor(v) : v])),
  }
  for (const [name, files] of cases) {
    it(name, () => {
      const input = { dir: DIR, files, labels: LABELS, nowIso: NOW }
      expect(normalized(cli.planGithubDirMerge(input))).toEqual(normalized(planGithubDirMerge(input)))
    })
  }
})
