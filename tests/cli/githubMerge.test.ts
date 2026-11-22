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
import { EMPTY_BLOB_SHA, decodeContentsApiFile, githubRequestTimeoutMs } from '../../electron/githubContents'

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

  it('no remote delete while the merged note.md could not be uploaded (GitHub would still list the section)', async () => {
    pcSave(note(T_PC, { s1: 'MILK\nflour\neggs', s2: 'call mum' }))
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs' })) // s2 removed here
    gh.failPuts.add(ANCHOR)
    await cli.syncPushNoteFiles(DIR, files)
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call mum') // GitHub's note.md still lists it
    expect(logs.some((l) => l.includes("could not be uploaded yet — run 'noteflow push'"))).toBe(true)
    // The retry merges again and, once the anchor lands, deletes it.
    gh.failPuts.clear()
    await cli.cmdPush()
    expect(gh.files.has(`${DIR}/s2.md`)).toBe(false)
    expect(gh.files.get(ANCHOR)).toBe(readLocal(ANCHOR))
    expect(gh.files.get(ANCHOR)).not.toContain('s2.md')
  })

  it('a section deleted on GitHub, edited here and pushed with the note → the local edit is not lost', async () => {
    pcSave(note(T_PC, { s1: 'MILK\nflour\neggs' })) // s2 deleted on the PC
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum today' }))
    await cli.syncPushNoteFiles(DIR, files) // s2.md is absent on GitHub → plain PUT (like the app's push)
    expect(otherDirs()).toEqual([])
    // Re-created on GitHub before the anchor's merge ("unchanged" for the
    // planner, and GitHub's anchor does not list it): it must stay LISTED —
    // an orphan file would be deleted by the next folder write.
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call mum today')
    expect(readLocal(`${DIR}/s2.md`)).toBe('call mum today')
    expect(readLocal(ANCHOR)).toContain('file: s2.md')
    expect(gh.files.get(ANCHOR)).toBe(readLocal(ANCHOR))
    // …so the next command's folder write keeps it.
    const n = cli.parseNoteYaml(cli.splitFrontmatter(readLocal(ANCHOR)).frontmatter)
    expect((n.sections as Array<{ id: string }>).map((s) => s.id)).toEqual(['s1', 's2'])
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

// QA 2026-11-22: the app uploads a section file another process changed
// WITHOUT touching note.md (its `updated` stays). `noteflow pull` judged each
// note by note.md's `updated` alone → "skipped (local is newer)" (equal
// stamps), the change never came down. Now it decides file by file against
// the bases (planGithubPullDir), like the app's GitHub pull.
describe('noteflow pull: file by file against the bases', () => {
  const done = () => logs.find((l) => l.startsWith('  Done:')) ?? ''

  it('a section changed on GitHub, note.md untouched → pulled (and its base), not "skipped"', async () => {
    const anchorBefore = readLocal(ANCHOR)
    gh.put(`${DIR}/s2.md`, 'call dad') // the app, after an edit of s2.md on its disk
    logs = []
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s2.md`)).toBe('call dad')
    expect(readLocal(ANCHOR)).toBe(anchorBefore)
    expect(done()).toBe('  Done: 1 pulled')
    expect(logs).toContain(`  ${DIR}/`)
    // Reconciled: the next push sends nothing, the next pull pulls nothing.
    gh.calls = []
    await cli.cmdPush()
    expect(gh.calls.filter((c) => (c.startsWith('PUT') || c.startsWith('DELETE')) && c.includes(DIR))).toEqual([])
    logs = []
    await cli.cmdPull()
    expect(done()).toBe('  Done: 0 pulled')
  })

  it('identical notes are not counted as skipped', async () => {
    logs = []
    await cli.cmdPull()
    expect(done()).toBe('  Done: 0 pulled')
    expect(logs.join('\n')).not.toContain('skipped')
  })

  it('changed only here → skipped (local is newer), kept; --force still overwrites it', async () => {
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    logs = []
    await cli.cmdPull()
    expect(done()).toBe('  Done: 0 pulled, 1 skipped (local is newer — use --force to override)')
    expect(readLocal(`${DIR}/s1.md`)).toBe('milk\nflour\neggs\nbread')
    await cli.cmdPull({ force: true })
    expect(readLocal(`${DIR}/s1.md`)).toBe('milk\nflour\neggs')
    expect(readLocal(ANCHOR)).toContain(T0)
  })

  it('another section changed here (not pushed): both kept, the push then uploads only what GitHub lacks', async () => {
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    gh.put(`${DIR}/s2.md`, 'call dad')
    logs = []
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe('milk\nflour\neggs\nbread')
    expect(readLocal(`${DIR}/s2.md`)).toBe('call dad')
    expect(readLocal(ANCHOR)).toContain(T_CLI)
    expect(logs).toContain("  1 note was merged with local changes GitHub does not have yet — run 'noteflow push' to upload it")
    expect(otherDirs()).toEqual([])
    await cli.cmdPush()
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('milk\nflour\neggs\nbread')
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call dad')
    expect(gh.files.get(ANCHOR)).toBe(readLocal(ANCHOR))
    expect(otherDirs()).toEqual([])
  })

  it('the same section changed on both sides → merged line by line (diff3 with the base blob)', async () => {
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    gh.put(`${DIR}/s1.md`, 'MILK\nflour\neggs')
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
    expect(logs.some((l) => l.includes('Merged with conflicts'))).toBe(false)
    await cli.cmdPush()
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
  })

  it('a section deleted on GitHub (untouched here) goes; a new local section, listed and not pushed, stays', async () => {
    pcSave(note(T0, { s1: 'milk\nflour\neggs' })) // s2 dropped on the PC, same `updated`
    await cli.cmdPull()
    expect(fs.existsSync(localPath(`${DIR}/s2.md`))).toBe(false)
    expect(readLocal(ANCHOR)).not.toContain('s2.md')
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs', s3: 'new here' }))
    gh.put(`${DIR}/s1.md`, 'milk\nflour\neggs\njam')
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s3.md`)).toBe('new here')
    expect(readLocal(ANCHOR)).toContain('s3.md')
    expect(readLocal(`${DIR}/s1.md`)).toBe('milk\nflour\neggs\njam')
  })

  it('a section deleted here (not pushed) while GitHub changed another → the push deletes it there, then all is identical', async () => {
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs' })) // s2 deleted here
    gh.put(`${DIR}/s1.md`, 'MILK\nflour\neggs') // only s1.md changes there, note.md untouched
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs')
    expect(fs.existsSync(localPath(`${DIR}/s2.md`))).toBe(false)
    await cli.cmdPush()
    expect(gh.files.has(`${DIR}/s2.md`)).toBe(false)
    expect(gh.files.get(ANCHOR)).toBe(readLocal(ANCHOR))
    expect(gh.files.get(ANCHOR)).not.toContain('s2.md')
    logs = []
    await cli.cmdPull()
    expect(done()).toBe('  Done: 0 pulled')
  })

  it('the push deletes only what GitHub still has as it was: a section changed there since stays (the pull brings it back)', async () => {
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs' })) // s2 deleted here
    gh.put(`${DIR}/s2.md`, 'call dad') // …and changed on the PC meanwhile
    logs = []
    await cli.cmdPush() // note.md goes up; s2.md is not deleted there
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call dad')
    expect(logs.some((l) => l.includes(`${DIR}/s2.md not deleted on GitHub: it changed there since your last pull`))).toBe(true)
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s2.md`)).toBe('call dad')
  })

  it('a whole note gone here is never deleted on GitHub by a push', async () => {
    fs.rmSync(localPath(DIR), { recursive: true })
    await cli.cmdPush()
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call mum')
    expect(gh.files.has(ANCHOR)).toBe(true)
  })

  it('a section file on GitHub that no note.md lists (and never synced here) is not pulled, nor counted as skipped', async () => {
    gh.put(`${DIR}/extra.md`, 'from elsewhere')
    logs = []
    await cli.cmdPull()
    expect(done()).toBe('  Done: 0 pulled')
    expect(fs.existsSync(localPath(`${DIR}/extra.md`))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(configDir, 'noteflow', 'cli-github-state.json'), 'utf-8')).shas).not.toHaveProperty(`${DIR}/extra.md`)
    // …also inside a merge of the folder (another file changed there).
    gh.put(`${DIR}/s1.md`, 'MILK\nflour\neggs')
    logs = []
    await cli.cmdPull()
    expect(done()).toBe('  Done: 1 pulled')
    expect(fs.existsSync(localPath(`${DIR}/extra.md`))).toBe(false)
  })

  // Review 2026-11-22: another device's push half done (its sections go up
  // first, note.md last) left s3.md on GitHub unlisted; the pull must not bring
  // it down with a base, or the next folder write here drops it as unlisted and
  // `noteflow push` deletes it on GitHub — lost on every device.
  it('a section uploaded before its note.md: pull, a write of the note, push → GitHub keeps it', async () => {
    const withS3 = note(T_PC, { s1: 'milk\nflour\neggs', s2: 'call mum', s3: 'new section from the PC' })
    gh.put(`${DIR}/s3.md`, filesOf(withS3)['s3.md']) // note.md not up yet
    gh.put(`${DIR}/s1.md`, 'MILK\nflour\neggs') // and something else moved, so the folder is merged
    await cli.cmdPull()
    if (fs.existsSync(localPath(`${DIR}/s3.md`))) fs.unlinkSync(localPath(`${DIR}/s3.md`)) // what a folder write does to it
    cliSave(note(T_CLI, { s1: 'MILK\nflour\neggs\nbread', s2: 'call mum' })) // a write of this note here
    await cli.cmdPush()
    expect(gh.files.get(`${DIR}/s3.md`)).toBe('new section from the PC')
    // Its note.md lands: the next pull brings s3 down.
    gh.put(ANCHOR, filesOf(withS3)[NOTE_MD])
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s3.md`)).toBe('new section from the PC')
  })

  it('the push deletes a section only if the note.md of the base listed it (a synced file it never listed stays)', async () => {
    // A base for a file no note.md lists (what a push's merge records for every remote file).
    gh.put(`${DIR}/loose.md`, 'kept')
    const statePath = path.join(configDir, 'noteflow', 'cli-github-state.json')
    const st = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    st.shas[`${DIR}/loose.md`] = gitBlobSha('kept')
    fs.writeFileSync(statePath, JSON.stringify(st))
    cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    await cli.cmdPush()
    expect(gh.files.get(`${DIR}/loose.md`)).toBe('kept')
  })

  // QA 2026-11-22 (aj6g1): the PUSH's merge (githubResolveConflictDir →
  // githubMergeConflictDir) gave a base to every remote file, and its `dropped`
  // list deleted on GitHub whatever the merged folder lacked — also a section
  // another device uploaded before its note.md. Same rule as the pull now.
  it('push merge: a section on GitHub that no note.md lists gets no base and is never deleted there', async () => {
    const statePath = path.join(configDir, 'noteflow', 'cli-github-state.json')
    const withS3 = note(T_PC, { s1: 'milk\nflour\neggs', s2: 'call mum', s3: 'new section from the PC' })
    gh.put(`${DIR}/s3.md`, filesOf(withS3)['s3.md']) // the PC's push half done: note.md not up yet
    gh.put(`${DIR}/s1.md`, 'MILK\nflour\neggs') // and GitHub changed the note: the push merges
    let files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    expect((await cli.syncPushNoteFiles(DIR, files)).conflicted).toBe(true)
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs\nbread')
    expect(gh.files.get(`${DIR}/s3.md`)).toBe('new section from the PC')
    expect(fs.existsSync(localPath(`${DIR}/s3.md`))).toBe(false)
    expect(JSON.parse(fs.readFileSync(statePath, 'utf-8')).shas).not.toHaveProperty(`${DIR}/s3.md`)
    // Another write here and another change there: merged again, s3 still there.
    gh.put(`${DIR}/s2.md`, 'call dad')
    files = cliSave(note('2026-11-03T10:00:00.000Z', { s1: 'MILK\nflour\neggs\nbread\njam', s2: 'call mum' }))
    await cli.syncPushNoteFiles(DIR, files)
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call dad')
    expect(gh.files.get(`${DIR}/s3.md`)).toBe('new section from the PC')
    // Its note.md lands: the next pull brings s3 down.
    gh.put(ANCHOR, filesOf({ ...withS3, updated: '2099-01-01T00:00:00.000Z' })[NOTE_MD])
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s3.md`)).toBe('new section from the PC')
  })

  it('push merge: a section the base note.md listed and the merged one no longer does is deleted there (a real removal)', async () => {
    gh.put(`${DIR}/s1.md`, 'MILK\nflour\neggs') // GitHub changed another section
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs' })) // s2 removed here
    expect((await cli.syncPushNoteFiles(DIR, files)).conflicted).toBe(true)
    expect(gh.files.has(`${DIR}/s2.md`)).toBe(false)
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('MILK\nflour\neggs')
  })

  it('push merge: a synced file the base note.md never listed, deleted here, stays on GitHub', async () => {
    gh.put(`${DIR}/loose.md`, 'kept')
    const statePath = path.join(configDir, 'noteflow', 'cli-github-state.json')
    const st = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    st.shas[`${DIR}/loose.md`] = gitBlobSha('kept')
    fs.writeFileSync(statePath, JSON.stringify(st))
    gh.put(`${DIR}/s1.md`, 'MILK\nflour\neggs') // the push merges
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs\nbread', s2: 'call mum' }))
    await cli.syncPushNoteFiles(DIR, files)
    expect(gh.files.get(`${DIR}/loose.md`)).toBe('kept')
  })

  it('with NoteFlow Cloud on (GitHub a mirror) the bases are not trusted: note.md decides, as before', async () => {
    const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    fs.writeFileSync(settingsPath(), JSON.stringify({ ...s, cloudSync: { enabled: true } }))
    gh.put(`${DIR}/s2.md`, 'call dad')
    logs = []
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s2.md`)).toBe('call mum')
    expect(done()).toBe('  Done: 0 pulled, 1 skipped (local is newer — use --force to override)')
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

describe('noteflow pull: root metadata (first login to a repo that has its own groups)', () => {
  const json = (v: unknown) => JSON.stringify(v, null, 2)
  const LOCAL = json([{ id: 'qa', name: 'QA-Grupo' }])
  const REMOTE = json([{ id: 'work', name: 'Work' }])
  const UNION = json([{ id: 'work', name: 'Work' }, { id: 'qa', name: 'QA-Grupo' }])
  const backups = () => path.join(configDir, 'noteflow', 'github-metadata-backups')

  it('no base for groups.json → merged (not overwritten), local backed up, `push` uploads the union', async () => {
    fs.writeFileSync(localPath('groups.json'), LOCAL)
    gh.put('groups.json', REMOTE)
    await cli.cmdPull()
    expect(readLocal('groups.json')).toBe(UNION)
    const [stamp] = fs.readdirSync(backups())
    expect(fs.readFileSync(path.join(backups(), stamp, 'groups.json'), 'utf-8')).toBe(LOCAL)
    expect(gh.files.get('groups.json')).toBe(REMOTE) // the pull itself uploads nothing
    expect(logs.some((l) => l.includes("groups.json has local entries not on GitHub — run 'noteflow push'"))).toBe(true)

    await cli.cmdPush()
    expect(gh.files.get('groups.json')).toBe(UNION)
    logs.length = 0
    await cli.cmdPull() // reconciled now: nothing merged or backed up again
    expect(readLocal('groups.json')).toBe(UNION)
    expect(fs.readdirSync(backups())).toHaveLength(1)
    expect(logs.some((l) => l.includes('groups.json'))).toBe(false)
  })

  it('reconciled: unchanged on GitHub keeps a local edit; changed on GitHub wins (as before)', async () => {
    gh.put('groups.json', REMOTE)
    await cli.cmdPull() // base = REMOTE
    expect(readLocal('groups.json')).toBe(REMOTE)

    fs.writeFileSync(localPath('groups.json'), UNION) // a local edit not pushed yet
    await cli.cmdPull()
    expect(readLocal('groups.json')).toBe(UNION)

    fs.rmSync(localPath('groups.json')) // gone locally, unchanged on GitHub → restored
    await cli.cmdPull()
    expect(readLocal('groups.json')).toBe(REMOTE)

    const OTHER = json([{ id: 'home', name: 'Home' }])
    gh.put('groups.json', OTHER)
    await cli.cmdPull()
    expect(readLocal('groups.json')).toBe(OTHER)
    expect(fs.existsSync(backups())).toBe(false)
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
    ['re-created by the own PUT (orphan guard)', (() => {
      const f = threeWay(folder(T1, { s1: 'a', s2: 'b' }), { ...folder(T2, { s1: 'a' }), [`${DIR}/s2.md`]: 'b2' }, folder(T3, { s1: 'a', s2: 'b2' }))
      const s2 = f.find((x) => x.path === `${DIR}/s2.md`)!
      s2.base = gitBlobSha('b2')
      s2.baseContent = 'b2'
      return f
    })()],
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

// Files over 1 MB: the Contents API answers `content: ""`, `encoding: "none"`
// (real sha and size). Before 2.11.1 the CLI decoded that as '' — `noteflow
// pull` and the conflict merge wrote an image-heavy section EMPTY, and the
// next push uploaded it. Now the bytes come from the Git Blobs API (verified),
// fail-closed; `noteflow pull` repairs files an earlier pull emptied, once.
describe('GitHub files over the Contents API limit', () => {
  const BIG = `![img](data:image/png;base64,${'iVBORw0KGgo'.repeat(300)})\nholiday photos ✓`
  const statePath = () => path.join(configDir, 'noteflow', 'cli-github-state.json')
  const cliState = () => JSON.parse(fs.readFileSync(statePath(), 'utf-8'))

  beforeEach(() => {
    gh.largeThreshold = 1000 // note.md stays inline, BIG does not
  })

  it('`noteflow pull` of a newer remote note with a big section writes the real content (and its base)', async () => {
    pcSave(note(T_PC, { s1: BIG, s2: 'call mum' }))
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
    expect(readLocal(ANCHOR)).toContain(T_PC)
    expect(cliState().shas[`${DIR}/s1.md`]).toBe(gitBlobSha(BIG))
  })

  it('blob download failing → the folder is left as it was (error), nothing emptied', async () => {
    pcSave(note(T_PC, { s1: BIG, s2: 'call dad' }))
    gh.failBlobs = true
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe('milk\nflour\neggs')
    expect(readLocal(`${DIR}/s2.md`)).toBe('call mum')
    expect(readLocal(ANCHOR)).toContain(T0)
    expect(logs.some((l) => l.includes(`could not download ${DIR}/s1.md from GitHub`))).toBe(true)
    gh.failBlobs = false
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
  })

  it('conflict merge with a big section changed on GitHub keeps it (here and there)', async () => {
    pcSave(note(T_PC, { s1: BIG, s2: 'call mum' }))
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs', s2: 'call dad' }))
    const { conflicted } = await cli.syncPushNoteFiles(DIR, files)
    expect(conflicted).toBe(true)
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
    expect(gh.files.get(`${DIR}/s1.md`)).toBe(BIG)
    expect(gh.files.get(`${DIR}/s2.md`)).toBe('call dad')
    expect(otherDirs()).toEqual([])
  })

  it('conflict merge whose big remote section can not be downloaded → nothing written, nothing uploaded', async () => {
    pcSave(note(T_PC, { s1: BIG, s2: 'call mum' }))
    const files = cliSave(note(T_CLI, { s1: 'milk\nflour\neggs', s2: 'call dad' }))
    gh.failBlobs = true
    gh.calls = []
    await cli.syncPushNoteFiles(DIR, files)
    expect(readLocal(`${DIR}/s1.md`)).toBe('milk\nflour\neggs')
    expect(readLocal(`${DIR}/s2.md`)).toBe('call dad')
    expect(gh.files.get(`${DIR}/s1.md`)).toBe(BIG)
    expect(gh.calls.filter((c) => c.startsWith('PUT') && c.includes(`${DIR}/s1.md`))).toEqual([])
  })

  it('a machine emptied by an earlier pull: the empty upload is refused until `noteflow pull` restores the file once', async () => {
    pcSave(note(T0, { s1: BIG, s2: 'call mum' }))
    // What the old pull left: the section empty here; the repair flag absent (pre-2.11.1 state file).
    fs.writeFileSync(localPath(`${DIR}/s1.md`), '')
    const st = cliState()
    delete st.emptyFileRepairDone
    fs.writeFileSync(statePath(), JSON.stringify(st))

    await cli.syncPushNoteFiles(DIR, ['s1.md'])
    expect(gh.files.get(`${DIR}/s1.md`)).toBe(BIG) // not wiped
    expect(logs.some((l) => l.includes("is empty here but not on GitHub — run 'noteflow pull' once"))).toBe(true)
    expect(logs.some((l) => l.includes('If you emptied it on purpose, clear it again after the pull'))).toBe(true)

    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
    expect(logs).toContain('  Restored 1 file(s) an earlier sync had left empty')
    expect(cliState().emptyFileRepairDone).toBe(true)
    expect(cliState().shas[`${DIR}/s1.md`]).toBe(gitBlobSha(BIG))

    // From then on, emptying a section is a normal edit.
    fs.writeFileSync(localPath(`${DIR}/s1.md`), '')
    await cli.syncPushNoteFiles(DIR, ['s1.md'])
    expect(gh.files.get(`${DIR}/s1.md`)).toBe('')
    // …and a later pull does not "restore" it.
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe('')
  })

  it('with NoteFlow Cloud on (GitHub a mirror) the pull restores nothing and the repair stays pending', async () => {
    pcSave(note(T0, { s1: BIG, s2: 'call mum' }))
    fs.writeFileSync(localPath(`${DIR}/s1.md`), '')
    const st = cliState()
    delete st.emptyFileRepairDone
    fs.writeFileSync(statePath(), JSON.stringify(st))
    const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    fs.writeFileSync(settingsPath(), JSON.stringify({ ...s, cloudSync: { enabled: true } }))
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s1.md`)).toBe('')
    expect(cliState().emptyFileRepairDone).toBeUndefined()
  })

  it('a genuinely empty remote section is pulled as empty', async () => {
    pcSave(note(T_PC, { s1: BIG, s2: '' }))
    await cli.cmdPull()
    expect(readLocal(`${DIR}/s2.md`)).toBe('')
    expect(readLocal(`${DIR}/s1.md`)).toBe(BIG)
  })

  it('pure helpers mirror the app (electron/githubContents.ts)', () => {
    expect(cli.EMPTY_BLOB_SHA).toBe(EMPTY_BLOB_SHA)
    for (const n of [0, -1, 1, 32_768, 32_769, 5 * 1024 * 1024, 500 * 1024 * 1024]) {
      expect(cli.githubRequestTimeoutMs(n)).toBe(githubRequestTimeoutMs(n))
    }
    const b64 = (s: string) => Buffer.from(s).toString('base64')
    const answers = [
      { encoding: 'base64', content: b64('héllo'), size: Buffer.byteLength('héllo') },
      { encoding: 'none', content: '', size: 2_000_000 },
      { encoding: 'base64', content: b64('partial'), size: 999 },
      { encoding: 'base64', content: '', size: 0 },
      { encoding: 'base64', content: b64('no size') },
    ]
    for (const a of answers) expect(cli.decodeContentsApiFile(a)).toBe(decodeContentsApiFile(a))
    expect(cli.decodeGitBlob({ encoding: 'base64', content: b64(BIG) }, gitBlobSha(BIG))).toBe(BIG)
    expect(cli.decodeGitBlob({ encoding: 'base64', content: b64(BIG.slice(1)) }, gitBlobSha(BIG))).toBeNull()
  })
})
