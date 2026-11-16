// Notes dir origin — the CLI's pure mirror of electron/syncOrigin.ts
// (cli/noteflow.js: sameIdentity, decideOrigin, readSyncOrigin,
// getStoredIdentity, withSyncOrigin, readSettingsStrict, hasSyncedLocalNotes).
//
// Parity: a grid of inputs run through both and compared. The app's module on
// this branch predates two additive fields of the shared contract — `stale`
// (both backends) and `cloud.email` — so the grid only uses inputs without
// them, and the CLI-only rules (stale, email, the extras kept when re-adopting
// the same identity) have their own tests below.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as app from '../../electron/syncOrigin'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any

let tmp: string
const savedEnv = { ...process.env }

function loadCli(notesDir: string): Cli {
  process.env.APPDATA = path.join(tmp, 'config')
  process.env.XDG_CONFIG_HOME = path.join(tmp, 'config')
  process.env.NOTEFLOW_NOTES_DIR = notesDir
  delete require.cache[CLI_PATH]
  return require(CLI_PATH)
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-origin-')) })
afterEach(() => {
  process.env = { ...savedEnv }
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

const GH = (owner: string, repo: string, repoId?: number) =>
  ({ kind: 'github' as const, owner, repo, ...(repoId !== undefined ? { repoId } : {}) })
const CL = (userId: string) => ({ kind: 'cloud' as const, userId })

const IDS = [
  GH('ana', 'notes'), GH('ANA', 'Notes'), GH('ana', 'notes', 1), GH('ana', 'renamed', 1), GH('ana', 'notes', 2),
  GH('bob', 'notes'), GH('bob', 'notes', 1), CL('u1'), CL('u2'),
]

const SETTINGS: Record<string, unknown>[] = [
  {},
  { syncOrigin: null },
  { syncOrigin: [] },
  { syncOrigin: 'x' },
  { syncOrigin: {} },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes' } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', repoId: 7 } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', repoId: 'seven' } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', repoId: Number.NaN } } },
  { syncOrigin: { github: { owner: '', repo: 'notes' } } },
  { syncOrigin: { github: { owner: 'ana' } } },
  { syncOrigin: { github: [] } },
  { syncOrigin: { cloud: { userId: 'u1' } } },
  { syncOrigin: { cloud: { userId: '' } } },
  { syncOrigin: { cloud: { userId: 5 } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', repoId: 7 }, cloud: { userId: 'u1' } }, other: true },
]

describe('parity with electron/syncOrigin.ts', () => {
  it('sameIdentity over every pair', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const a of IDS) for (const b of IDS) {
      expect(cli.sameIdentity(a, b), `${JSON.stringify(a)} ~ ${JSON.stringify(b)}`).toBe(app.sameIdentity(a, b))
    }
  })

  it('decideOrigin over stored × next × local notes (and the same laziness)', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const stored of [undefined, ...IDS]) for (const next of IDS) for (const notes of [false, true]) {
      let appCalls = 0, cliCalls = 0
      const a = app.decideOrigin({ stored, next, hasLocalNotes: () => { appCalls++; return notes } })
      const c = cli.decideOrigin({ stored, next, hasLocalNotes: () => { cliCalls++; return notes } })
      const label = `${JSON.stringify(stored)} → ${JSON.stringify(next)} notes=${notes}`
      expect(c, label).toEqual(a)
      expect(cliCalls, label).toBe(appCalls)
    }
  })

  it('readSyncOrigin and getStoredIdentity over malformed and valid settings', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const s of SETTINGS) {
      expect(cli.readSyncOrigin(s), JSON.stringify(s)).toEqual(app.readSyncOrigin(s))
      for (const kind of ['github', 'cloud'] as const) {
        expect(cli.getStoredIdentity(s, kind), `${kind} ${JSON.stringify(s)}`).toEqual(app.getStoredIdentity(s, kind))
      }
    }
  })

  it('withSyncOrigin over settings × identities (records without unknown fields)', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const s of SETTINGS) for (const id of IDS) {
      // Documented divergence: re-adopting the SAME GitHub repo by name with an
      // id lacking the repoId keeps the stored one in the CLI (the app drops it).
      const stored = app.getStoredIdentity(s, 'github')
      if (id.kind === 'github' && id.repoId === undefined && stored?.kind === 'github' && stored.repoId !== undefined &&
          app.sameIdentity(stored, id)) continue
      const input = structuredClone(s)
      expect(cli.withSyncOrigin(input, id), `${JSON.stringify(s)} ← ${JSON.stringify(id)}`).toEqual(app.withSyncOrigin(s, id))
      expect(input).toEqual(s) // not mutated
    }
  })

  it('readSettingsStrict: missing → {}, unparseable / not an object → null', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const file = path.join(tmp, 's.json')
    const cases: Array<string | null> = [null, '{"a":1}', '{broken', '[]', '"text"', '42', '']
    for (const content of cases) {
      if (content === null) fs.rmSync(file, { force: true })
      else fs.writeFileSync(file, content)
      expect(cli.readSettingsStrict(file), String(content)).toEqual(app.readSettingsStrict(file))
    }
    fs.rmSync(file, { force: true })
    fs.mkdirSync(file) // a directory: EISDIR, not ENOENT → unreadable
    expect(cli.readSettingsStrict(file)).toBeNull()
    expect(app.readSettingsStrict(file)).toBeNull()
  })

  it('hasSyncedLocalNotes: missing dir, empty, a note, only local-only notes, not a dir', () => {
    const note = (dir: string, extra = '') => {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'note.md'), `---\nid: x\ntitle: X\n${extra}---\n`)
    }
    const dirs: Record<string, () => string> = {
      missing: () => path.join(tmp, 'nope'),
      empty: () => { const d = path.join(tmp, 'empty'); fs.mkdirSync(d); return d },
      'one note': () => { const d = path.join(tmp, 'one'); note(path.join(d, 'x-1')); return d },
      'local-only only': () => { const d = path.join(tmp, 'lo'); note(path.join(d, 'x-2'), 'localOnly: true\n'); return d },
      'folder without note.md': () => { const d = path.join(tmp, 'bare'); fs.mkdirSync(path.join(d, 'x-3'), { recursive: true }); return d },
      'a file': () => { const f = path.join(tmp, 'file'); fs.writeFileSync(f, 'x'); return f },
    }
    for (const [label, make] of Object.entries(dirs)) {
      const dir = make()
      const cli = loadCli(dir)
      expect(cli.hasSyncedLocalNotes(), label).toBe(app.hasSyncedLocalNotes(dir))
    }
  })
})

describe('CLI-only rules of the shared contract', () => {
  it('a stale origin with synced notes asks even for the same identity; without notes it adopts with the reset', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const stale = { ...GH('ana', 'notes', 1), stale: true }
    expect(cli.decideOrigin({ stored: stale, next: GH('ana', 'notes', 1), hasLocalNotes: () => true }))
      .toEqual({ action: 'ask', previous: stale, next: GH('ana', 'notes', 1) })
    expect(cli.decideOrigin({ stored: stale, next: GH('ana', 'notes', 1), hasLocalNotes: () => false }))
      .toEqual({ action: 'proceed', adopt: true, reason: 'changed-empty' })
    expect(cli.decideOrigin({ stored: stale, next: GH('bob', 'x'), hasLocalNotes: () => true }).action).toBe('ask')
    const staleCloud = { ...CL('u1'), stale: true }
    expect(cli.decideOrigin({ stored: staleCloud, next: CL('u1'), hasLocalNotes: () => true }).action).toBe('ask')
    expect(cli.decideOrigin({ stored: staleCloud, next: CL('u1'), hasLocalNotes: () => false }))
      .toEqual({ action: 'proceed', adopt: true, reason: 'changed-empty' })
  })

  it('reads stale (only `true`) and the Cloud email label', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const s = { syncOrigin: {
      github: { owner: 'ana', repo: 'notes', repoId: 1, stale: true },
      cloud: { userId: 'u1', email: 'a@x.io', stale: 'yes' },
    } }
    expect(cli.getStoredIdentity(s, 'github')).toEqual({ kind: 'github', owner: 'ana', repo: 'notes', repoId: 1, stale: true })
    expect(cli.getStoredIdentity(s, 'cloud')).toEqual({ kind: 'cloud', userId: 'u1', email: 'a@x.io' })
  })

  it('an email change of the same account is rewritten; an id without email is not', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const stored = { kind: 'cloud', userId: 'u1', email: 'old@x.io' }
    expect(cli.decideOrigin({ stored, next: { kind: 'cloud', userId: 'u1', email: 'new@x.io' }, hasLocalNotes: () => true }))
      .toEqual({ action: 'proceed', adopt: true, reason: 'same' })
    expect(cli.decideOrigin({ stored, next: { kind: 'cloud', userId: 'u1' }, hasLocalNotes: () => true }))
      .toEqual({ action: 'proceed', adopt: false, reason: 'same' })
  })

  it('withSyncOrigin drops stale, keeps unknown keys, and keeps the record extras only for the same identity', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const s = {
      keep: 1,
      syncOrigin: {
        future: { x: 1 },
        github: { owner: 'ana', repo: 'old', repoId: 1, stale: true, label: 'mine' },
        cloud: { userId: 'u1', email: 'a@x.io', stale: true, label: 'acct' },
      },
    }
    // Same repo (renamed, same id): extras kept, stale dropped.
    expect(cli.withSyncOrigin(s, GH('ana', 'new', 1)).syncOrigin.github).toEqual({ owner: 'ana', repo: 'new', repoId: 1, label: 'mine' })
    // Another repo: a fresh record with the known fields only.
    expect(cli.withSyncOrigin(s, GH('bob', 'x', 9)).syncOrigin.github).toEqual({ owner: 'bob', repo: 'x', repoId: 9 })
    // Same account without an email in the id: the stored email stays.
    expect(cli.withSyncOrigin(s, CL('u1')).syncOrigin.cloud).toEqual({ userId: 'u1', email: 'a@x.io', label: 'acct' })
    const other = cli.withSyncOrigin(s, { kind: 'cloud', userId: 'u2', email: 'b@x.io' })
    expect(other.syncOrigin.cloud).toEqual({ userId: 'u2', email: 'b@x.io' })
    // The other backend's record and unknown keys are never touched.
    expect(other.syncOrigin.github).toEqual(s.syncOrigin.github)
    expect(other.syncOrigin.future).toEqual({ x: 1 })
    expect(other.keep).toBe(1)
  })

  it('cloudOriginSeed: the app owner, else the CLI state owner, else the presumed owner', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    expect(cli.cloudOriginSeed({ cloudSync: { userId: 'app' }, cliCloud: { userId: 'cli' } }, 'prev')).toBe('app')
    expect(cli.cloudOriginSeed({ cloudSync: { enabled: true }, cliCloud: { userId: 'cli' } }, 'prev')).toBe('cli')
    expect(cli.cloudOriginSeed({ cliCloud: {} }, 'prev')).toBe('prev')
    expect(cli.cloudOriginSeed({}, undefined)).toBeUndefined()
  })

  it('cliCloudReset is the account-switch reset of cliCloudForUser', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const c = {
      enabled: true, userId: 'a', pullSeq: 3, pullCursor: 'x', lastSync: 'y', pendingUpserts: ['n/a.md'],
      pullRetry: {}, forceUpserts: [], basesBootstrapped: true, basesBootstrapPending: { dirs: [] },
    }
    expect(cli.cliCloudReset(c, 'b')).toEqual({ enabled: true, userId: 'b' })
    expect(cli.cliCloudReset(c, 'b')).toEqual(cli.cliCloudForUser(c, 'b'))
  })
})
