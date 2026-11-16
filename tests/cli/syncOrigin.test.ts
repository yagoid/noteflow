// Notes dir origin — the CLI's pure mirror of electron/syncOrigin.ts
// (cli/noteflow.js: sameIdentity, decideOrigin, originScope, readSyncOrigin,
// getStoredIdentity, withSyncOrigin, normalizeNotesDir, sameNotesDir,
// readSettingsStrict, hasSyncedLocalNotes) and its two gates.
//
// Parity: the same inputs go through the app's module and the CLI's and the
// answers are compared — over the whole shared contract of `settings.syncOrigin`:
// identities, `stale`, the Cloud `email` label and the per-record `notesDir`.
// Then the round trip: what one side writes, the other reads and decides on.
// Where the two differ ON PURPOSE the test says so and pins both behaviours:
//  - withSyncOrigin re-adopting the SAME identity: the CLI keeps what the new
//    id lacks (repoId / email / notesDir / unknown fields), the app writes a
//    fresh record;
//  - the gates: the app tags the identity it syncs with its notes dir, so it
//    rewrites a same-identity record to add a missing `notesDir`; the CLI
//    leaves that record alone (both read it as the default dir's);
//  - the Cloud seed: the CLI also knows its own state's owner (cliCloud.userId).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as app from '../../electron/syncOrigin'
import { assertInsideTmp } from '../helpers/tmpGuard'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')
const nodeOs = require('node:os') as typeof os

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = any
type Id = app.SyncIdentity
type Settings = Record<string, unknown>

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
  vi.restoreAllMocks()
  process.env = { ...savedEnv }
  delete require.cache[CLI_PATH]
  fs.rmSync(tmp, { recursive: true, force: true })
})

// Two notes dirs for the pure grids (never created: nothing here touches them).
const DIR_A = path.resolve(os.tmpdir(), 'nf-origin-parity', 'Notes-A')
const DIR_B = path.resolve(os.tmpdir(), 'nf-origin-parity', 'Notes-B')

const GH = (owner: string, repo: string, repoId?: number, extra: { stale?: true; notesDir?: string } = {}): Id =>
  ({ kind: 'github', owner, repo, ...(repoId !== undefined ? { repoId } : {}), ...extra })
const CL = (userId: string, extra: { email?: string; stale?: true; notesDir?: string } = {}): Id =>
  ({ kind: 'cloud', userId, ...extra })

// Identities as they are synced with (`next`): never stale; the app tags them
// with its notes dir, the CLI's gates don't — both shapes are in the grid.
const NEXT: Id[] = [
  GH('ana', 'notes'), GH('ANA', 'Notes'), GH('ana', 'notes', 1), GH('ana', 'renamed', 1), GH('ana', 'notes', 2),
  GH('bob', 'notes'), GH('bob', 'notes', 1),
  GH('ana', 'notes', 1, { notesDir: DIR_A }), GH('ana', 'notes', 1, { notesDir: DIR_B }), GH('bob', 'notes', 3, { notesDir: DIR_A }),
  CL('u1'), CL('u2'),
  CL('u1', { email: 'a@x.io' }), CL('u1', { email: 'new@x.io' }), CL('u2', { email: 'b@x.io' }),
  CL('u1', { notesDir: DIR_A }), CL('u1', { email: 'a@x.io', notesDir: DIR_A }), CL('u1', { email: 'a@x.io', notesDir: DIR_B }),
]

// Identities as they are stored: the same, plus the stale ones.
const STORED: Id[] = [
  ...NEXT,
  GH('ana', 'notes', undefined, { stale: true }), GH('ana', 'notes', 1, { stale: true }),
  GH('ana', 'notes', 1, { stale: true, notesDir: DIR_A }), GH('bob', 'notes', 3, { stale: true, notesDir: DIR_B }),
  CL('u1', { stale: true }), CL('u1', { email: 'a@x.io', stale: true }),
  CL('u1', { email: 'a@x.io', stale: true, notesDir: DIR_A }), CL('u2', { stale: true, notesDir: DIR_B }),
]

// Which notes dir the process syncs and which one is the default.
const DIRS: app.NotesDirContext[] = [
  { current: DIR_A, default: DIR_A },
  { current: DIR_B, default: DIR_A },
  { current: DIR_A + path.sep, default: DIR_A },
  { current: path.join(DIR_A, 'x', '..'), default: DIR_A },
  { current: DIR_A.toUpperCase(), default: DIR_A, platform: 'win32' },
  { current: DIR_A.toUpperCase(), default: DIR_A, platform: 'darwin' },
  { current: DIR_A.toUpperCase(), default: DIR_A, platform: 'linux' },
  { current: DIR_B, default: DIR_B.toLowerCase(), platform: 'win32' },
]

const SETTINGS: Settings[] = [
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
  // stale: only `true` counts.
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', repoId: 1, stale: true } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', stale: 'yes' } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', stale: false } } },
  { syncOrigin: { cloud: { userId: 'u1', stale: true } } },
  { syncOrigin: { cloud: { userId: 'u1', stale: 1 } } },
  // email: a non-empty string.
  { syncOrigin: { cloud: { userId: 'u1', email: 'a@x.io' } } },
  { syncOrigin: { cloud: { userId: 'u1', email: '' } } },
  { syncOrigin: { cloud: { userId: 'u1', email: 5 } } },
  { syncOrigin: { cloud: { userId: 'u1', email: 'a@x.io', stale: true } } },
  // notesDir: a non-empty string, kept as written.
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', repoId: 1, notesDir: DIR_A } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', notesDir: '' } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', notesDir: 7 } } },
  { syncOrigin: { github: { owner: 'ana', repo: 'notes', repoId: 1, stale: true, notesDir: DIR_B } } },
  { syncOrigin: { cloud: { userId: 'u1', email: 'a@x.io', notesDir: DIR_A } } },
  { syncOrigin: { cloud: { userId: 'u1', notesDir: DIR_A + path.sep } } },
  { syncOrigin: { cloud: { userId: 'u1', notesDir: null } } },
  {
    syncOrigin: {
      github: { owner: 'ana', repo: 'notes', repoId: 7, notesDir: DIR_A },
      cloud: { userId: 'u1', email: 'a@x.io', stale: true, notesDir: DIR_A },
    },
    other: true,
  },
]

const show = (v: unknown) => JSON.stringify(v)

describe('parity with electron/syncOrigin.ts — pure functions', () => {
  it('sameIdentity over every pair (stale, email and notesDir never count)', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const a of STORED) for (const b of STORED) {
      expect(cli.sameIdentity(a, b), `${show(a)} ~ ${show(b)}`).toBe(app.sameIdentity(a, b))
    }
    expect(cli.sameIdentity(CL('u1', { email: 'a@x.io', stale: true, notesDir: DIR_A }), CL('u1', { email: 'z@x.io' }))).toBe(true)
  })

  it('decideOrigin over stored × next × local notes: same decision, same reason, same laziness', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const seen = new Set<string>()
    for (const stored of [undefined, ...STORED]) for (const next of NEXT) for (const notes of [false, true]) {
      let appCalls = 0, cliCalls = 0
      const a = app.decideOrigin({ stored, next, hasLocalNotes: () => { appCalls++; return notes } })
      const c = cli.decideOrigin({ stored, next, hasLocalNotes: () => { cliCalls++; return notes } })
      const label = `${show(stored)} → ${show(next)} notes=${notes}`
      expect(c, label).toEqual(a)
      expect(cliCalls, label).toBe(appCalls)
      seen.add(a.action === 'ask' ? (a.stale ? 'ask-stale' : 'ask') : `${a.reason}/${a.adopt}`)
    }
    // The grid reaches every outcome of the contract (without `dirs`).
    expect([...seen].sort()).toEqual(
      ['ask', 'ask-stale', 'changed-empty/true', 'no-origin/true', 'same/false', 'same/true', 'stale-empty/true'],
    )
  })

  it('originScope over stored × notes dirs (a record counts only for its own dir)', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const stored of [undefined, ...STORED]) for (const dirs of DIRS) {
      expect(cli.originScope(stored, dirs), `${show(stored)} @ ${show(dirs)}`).toBe(app.originScope(stored, dirs))
    }
  })

  it("decideOrigin with `dirs` = the CLI's gate order (the dir rule first, then its decideOrigin)", () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    let foreign = 0
    for (const stored of [undefined, ...STORED]) for (const next of NEXT) for (const dirs of DIRS) for (const notes of [false, true]) {
      let appCalls = 0, cliCalls = 0
      const a = app.decideOrigin({ stored, next, hasLocalNotes: () => { appCalls++; return notes }, dirs })
      const c = cli.originScope(stored, dirs) === 'foreign'
        ? { action: 'proceed', adopt: false, reason: 'foreign-dir' }
        : cli.decideOrigin({ stored, next, hasLocalNotes: () => { cliCalls++; return notes } })
      const label = `${show(stored)} → ${show(next)} @ ${show(dirs)} notes=${notes}`
      expect(c, label).toEqual(a)
      expect(cliCalls, label).toBe(appCalls)
      if (a.action === 'proceed' && a.reason === 'foreign-dir') foreign++
    }
    expect(foreign).toBeGreaterThan(0)
  })

  it('readSyncOrigin and getStoredIdentity over malformed and valid settings (stale, email, notesDir)', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const s of SETTINGS) {
      expect(cli.readSyncOrigin(s), show(s)).toEqual(app.readSyncOrigin(s))
      for (const kind of ['github', 'cloud'] as const) {
        expect(cli.getStoredIdentity(s, kind), `${kind} ${show(s)}`).toEqual(app.getStoredIdentity(s, kind))
      }
    }
  })

  // Re-adopting the SAME identity is where the two differ on purpose: the CLI
  // keeps every field of the stored record that the new id doesn't carry.
  function cliKeepsMore(s: Settings, id: Id): boolean {
    const stored = app.getStoredIdentity(s, id.kind)
    if (!stored || !app.sameIdentity(stored, id)) return false
    const record = (s.syncOrigin as Record<string, Record<string, unknown>>)[id.kind]
    return Object.keys(record).some((k) => k !== 'stale' && (id as unknown as Record<string, unknown>)[k] === undefined)
  }

  it('withSyncOrigin over settings × identities: the same record, stale dropped, notesDir normalized', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const ids: Id[] = [...NEXT, GH('ana', 'notes', 7, { notesDir: DIR_B + path.sep }), CL('u1', { email: 'a@x.io', notesDir: path.join(DIR_B, 'x', '..') })]
    let compared = 0, kept = 0
    for (const s of SETTINGS) for (const id of ids) {
      if (cliKeepsMore(s, id)) { kept++; continue }
      const input = structuredClone(s)
      expect(cli.withSyncOrigin(input, id), `${show(s)} ← ${show(id)}`).toEqual(app.withSyncOrigin(s, id))
      expect(input).toEqual(s) // not mutated
      compared++
    }
    expect(compared).toBeGreaterThan(400)
    expect(kept).toBeGreaterThan(0)
  })

  it('…except re-adopting the same identity: the CLI keeps what the id lacks, the app writes a fresh record', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const s = {
      syncOrigin: {
        github: { owner: 'ana', repo: 'notes', repoId: 7, stale: true, notesDir: DIR_A, label: 'mine' },
        cloud: { userId: 'u1', email: 'a@x.io', stale: true, notesDir: DIR_A, label: 'acct' },
      },
    }
    // The same repo by name, an id without repoId / notesDir.
    expect((app.withSyncOrigin(s, GH('ana', 'notes')).syncOrigin as { github: unknown }).github).toEqual({ owner: 'ana', repo: 'notes' })
    expect(cli.withSyncOrigin(s, GH('ana', 'notes')).syncOrigin.github)
      .toEqual({ owner: 'ana', repo: 'notes', repoId: 7, notesDir: DIR_A, label: 'mine' })
    // The same account, an id without email / notesDir.
    expect((app.withSyncOrigin(s, CL('u1')).syncOrigin as { cloud: unknown }).cloud).toEqual({ userId: 'u1' })
    expect(cli.withSyncOrigin(s, CL('u1')).syncOrigin.cloud).toEqual({ userId: 'u1', email: 'a@x.io', notesDir: DIR_A, label: 'acct' })
    // Either way the other side reads the same remote, not stale — and what the
    // id does carry wins on both.
    for (const side of [app, cli]) {
      const written = side.withSyncOrigin(s, GH('ana', 'renamed', 7, { notesDir: DIR_B }))
      for (const reader of [app, cli]) {
        expect(reader.getStoredIdentity(written, 'github')).toEqual(GH('ana', 'renamed', 7, { notesDir: DIR_B }))
      }
    }
  })

  it('normalizeNotesDir and sameNotesDir over dirs × platforms', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const root = path.parse(DIR_A).root
    const dirs = [
      DIR_A, DIR_A + path.sep, DIR_A + path.sep + path.sep, DIR_A + '/', path.join(DIR_A, 'x', '..'), path.join(DIR_A, '.'),
      DIR_A.toUpperCase(), DIR_A.toLowerCase(), DIR_B, root, 'relative-notes', path.join('relative-notes', 'sub') + path.sep,
    ]
    for (const d of dirs) expect(cli.normalizeNotesDir(d), d).toBe(app.normalizeNotesDir(d))
    for (const a of dirs) for (const b of dirs) for (const platform of [undefined, 'win32', 'darwin', 'linux']) {
      expect(cli.sameNotesDir(a, b, platform), `${a} ~ ${b} (${platform})`).toBe(app.sameNotesDir(a, b, platform))
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

describe('the shared contract in words (both sides)', () => {
  it('a stale origin with synced notes asks even for the same identity; without notes it is adopted again', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const side of [app, cli]) {
      const stale = GH('ana', 'notes', 1, { stale: true })
      expect(side.decideOrigin({ stored: stale, next: GH('ana', 'notes', 1), hasLocalNotes: () => true }))
        .toEqual({ action: 'ask', previous: stale, next: GH('ana', 'notes', 1), stale: true })
      expect(side.decideOrigin({ stored: stale, next: GH('ana', 'notes', 1), hasLocalNotes: () => false }))
        .toEqual({ action: 'proceed', adopt: true, reason: 'stale-empty' })
      expect(side.decideOrigin({ stored: stale, next: GH('bob', 'x'), hasLocalNotes: () => true }).action).toBe('ask')
      const staleCloud = CL('u1', { stale: true })
      expect(side.decideOrigin({ stored: staleCloud, next: CL('u1'), hasLocalNotes: () => true }).action).toBe('ask')
      expect(side.decideOrigin({ stored: staleCloud, next: CL('u1'), hasLocalNotes: () => false }))
        .toEqual({ action: 'proceed', adopt: true, reason: 'stale-empty' })
    }
  })

  it('reads stale (only `true`), the Cloud email label and the record notes dir', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const s = { syncOrigin: {
      github: { owner: 'ana', repo: 'notes', repoId: 1, stale: true, notesDir: DIR_A },
      cloud: { userId: 'u1', email: 'a@x.io', stale: 'yes' },
    } }
    for (const side of [app, cli]) {
      expect(side.getStoredIdentity(s, 'github')).toEqual({ kind: 'github', owner: 'ana', repo: 'notes', repoId: 1, stale: true, notesDir: DIR_A })
      expect(side.getStoredIdentity(s, 'cloud')).toEqual({ kind: 'cloud', userId: 'u1', email: 'a@x.io' })
    }
  })

  it('an email change of the same account is rewritten; an id without email is not', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const stored = CL('u1', { email: 'old@x.io' })
    for (const side of [app, cli]) {
      expect(side.decideOrigin({ stored, next: CL('u1', { email: 'new@x.io' }), hasLocalNotes: () => true }))
        .toEqual({ action: 'proceed', adopt: true, reason: 'same' })
      expect(side.decideOrigin({ stored, next: CL('u1'), hasLocalNotes: () => true }))
        .toEqual({ action: 'proceed', adopt: false, reason: 'same' })
    }
  })

  it('an identity tagged with its notes dir refreshes a record that lacks it (or names another spelling)', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    for (const side of [app, cli]) {
      const tagged = GH('ana', 'notes', 1, { notesDir: DIR_A })
      expect(side.decideOrigin({ stored: GH('ana', 'notes', 1), next: tagged, hasLocalNotes: () => true }))
        .toEqual({ action: 'proceed', adopt: true, reason: 'same' })
      expect(side.decideOrigin({ stored: tagged, next: tagged, hasLocalNotes: () => true }))
        .toEqual({ action: 'proceed', adopt: false, reason: 'same' })
      expect(side.decideOrigin({ stored: tagged, next: GH('ana', 'notes', 1), hasLocalNotes: () => true }))
        .toEqual({ action: 'proceed', adopt: false, reason: 'same' })
    }
  })

  it('withSyncOrigin keeps the other backend, unknown keys of syncOrigin and of settings (both sides)', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const s = {
      keep: 1,
      syncOrigin: {
        future: { x: 1 },
        github: { owner: 'ana', repo: 'old', repoId: 1, stale: true, label: 'mine' },
        cloud: { userId: 'u1', email: 'a@x.io', stale: true, label: 'acct' },
      },
    }
    for (const side of [app, cli]) {
      // Another repo / account: a fresh record with the known fields only.
      const gh = side.withSyncOrigin(s, GH('bob', 'x', 9)) as typeof s
      expect(gh.syncOrigin.github).toEqual({ owner: 'bob', repo: 'x', repoId: 9 })
      const other = side.withSyncOrigin(s, CL('u2', { email: 'b@x.io' })) as typeof s
      expect(other.syncOrigin.cloud).toEqual({ userId: 'u2', email: 'b@x.io' })
      // The other backend's record and unknown keys are never touched.
      expect(other.syncOrigin.github).toEqual(s.syncOrigin.github)
      expect(other.syncOrigin.future).toEqual({ x: 1 })
      expect(other.keep).toBe(1)
    }
    // CLI only: the same repo (renamed, same id) keeps the extras, stale dropped.
    expect(cli.withSyncOrigin(s, GH('ana', 'new', 1)).syncOrigin.github).toEqual({ owner: 'ana', repo: 'new', repoId: 1, label: 'mine' })
  })
})

describe('round trip: what one side writes, the other reads and decides on', () => {
  const plain = NEXT.filter((id) => id.notesDir === undefined)

  it('the CLI adopts → the app reads the same identity for that dir and neither asks nor rewrites', () => {
    const notesDir = path.join(tmp, 'notes')
    const cli = loadCli(notesDir)
    const here = app.normalizeNotesDir(notesDir)
    const dirs = { current: notesDir, default: notesDir }
    for (const id of plain) {
      const written = cli.withSyncOrigin({ other: true }, cli.withNotesDir(id))
      const stored = app.getStoredIdentity(written, id.kind)
      expect(stored, show(id)).toEqual({ ...id, notesDir: here })
      expect(app.originScope(stored, dirs)).toBe('own')
      // The app syncs with the identity tagged with its dir: nothing to do.
      expect(app.decideOrigin({ stored, next: { ...id, notesDir: here }, hasLocalNotes: () => true, dirs }), show(id))
        .toEqual({ action: 'proceed', adopt: false, reason: 'same' })
      // From another notes dir the app leaves the CLI's record alone.
      expect(app.decideOrigin({ stored, next: { ...id, notesDir: DIR_B }, hasLocalNotes: () => true, dirs: { current: DIR_B, default: notesDir } }))
        .toEqual({ action: 'proceed', adopt: false, reason: 'foreign-dir' })
    }
  })

  it('the app adopts → the CLI reads the same identity, places it here and neither asks nor rewrites', () => {
    const notesDir = path.join(tmp, 'notes')
    const cli = loadCli(notesDir)
    for (const id of plain) {
      const written = app.withSyncOrigin({ other: true }, { ...id, notesDir: notesDir + path.sep })
      const stored = cli.getStoredIdentity(written, id.kind)
      expect(stored, show(id)).toEqual(app.getStoredIdentity(written, id.kind))
      expect(stored.notesDir).toBe(cli.normalizeNotesDir(notesDir))
      expect(cli.originPlacement(stored)).toBe('here')
      expect(cli.decideOrigin({ stored, next: id, hasLocalNotes: () => true }), show(id))
        .toEqual({ action: 'proceed', adopt: false, reason: 'same' })
      expect(cli.decideOrigin({ stored, next: cli.withNotesDir(id), hasLocalNotes: () => true }))
        .toEqual({ action: 'proceed', adopt: false, reason: 'same' })
    }
    // …and a record the app wrote for another notes dir is not this dir's.
    const elsewhere = app.withSyncOrigin({}, GH('ana', 'notes', 1, { notesDir: DIR_B }))
    expect(cli.originPlacement(cli.getStoredIdentity(elsewhere, 'github'))).toBe('elsewhere')
  })

  it("the app's \"use only the notes from …\" marks the other backend stale → the CLI asks; its adoption clears it for the app", () => {
    const notesDir = path.join(tmp, 'notes')
    const cli = loadCli(notesDir)
    const dirs = { current: notesDir, default: notesDir }
    for (const id of plain) {
      const adopted = app.withSyncOrigin({}, { ...id, notesDir })
      const marked = app.withOriginMarkedStale(adopted, id.kind, dirs)
      const stored = cli.getStoredIdentity(marked, id.kind)
      expect(stored.stale, show(id)).toBe(true)
      expect(cli.decideOrigin({ stored, next: id, hasLocalNotes: () => true }))
        .toEqual({ action: 'ask', previous: stored, next: id, stale: true })
      expect(cli.decideOrigin({ stored, next: id, hasLocalNotes: () => false }))
        .toEqual({ action: 'proceed', adopt: true, reason: 'stale-empty' })
      // `noteflow origin merge` (an adoption) writes the record without stale.
      const resolved = cli.withSyncOrigin(marked, cli.withNotesDir(id))
      const back = app.getStoredIdentity(resolved, id.kind)
      expect(back).toEqual({ ...id, notesDir: app.normalizeNotesDir(notesDir) })
      expect(app.decideOrigin({ stored: back, next: { ...id, notesDir: app.normalizeNotesDir(notesDir) }, hasLocalNotes: () => true, dirs }))
        .toEqual({ action: 'proceed', adopt: false, reason: 'same' })
    }
    // A record of another notes dir is not marked — and the CLI reads it as such.
    const foreign = app.withSyncOrigin({}, GH('ana', 'notes', 1, { notesDir: DIR_B }))
    expect(cli.getStoredIdentity(app.withOriginMarkedStale(foreign, 'github', dirs), 'github').stale).toBeUndefined()
  })

  it('the Cloud seed: both take the owner the app recorded (cloudSync.userId); the CLI also knows its own', () => {
    const cli = loadCli(path.join(tmp, 'notes'))
    const withAppOwner = { cloudSync: { userId: 'app' }, cliCloud: { userId: 'cli' } }
    expect(cli.cloudOriginSeed(withAppOwner, 'prev')).toBe('app')
    expect(app.resolveStoredCloudOrigin(withAppOwner)).toEqual({ identity: { kind: 'cloud', userId: 'app' }, seeded: true })
    // CLI only (its own Cloud state, then the account signed in before a `cloud login`).
    expect(cli.cloudOriginSeed({ cloudSync: { enabled: true }, cliCloud: { userId: 'cli' } }, 'prev')).toBe('cli')
    expect(cli.cloudOriginSeed({ cliCloud: {} }, 'prev')).toBe('prev')
    expect(cli.cloudOriginSeed({}, undefined)).toBeUndefined()
    expect(app.resolveStoredCloudOrigin({ cliCloud: { userId: 'cli' } })).toBeUndefined()
    // A recorded origin always wins over any seed, on both sides.
    const recorded = { ...withAppOwner, syncOrigin: { cloud: { userId: 'u9', email: 'z@x.io' } } }
    expect(app.resolveStoredCloudOrigin(recorded)).toEqual({ identity: CL('u9', { email: 'z@x.io' }), seeded: false })
    expect(cli.getStoredIdentity(recorded, 'cloud')).toEqual(CL('u9', { email: 'z@x.io' }))
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

// The CLI's gates read settings.json and the notes on disk; here the SAME file
// and dir go through them and through the app's decision as its gates call it
// (stored record of the file, the connection tagged with the notes dir, `dirs`).
describe("the gates over one settings.json: the CLI's state = the app's decision", () => {
  const TOKEN = Buffer.from('ghp_test').toString('base64')
  let home: string
  let cli: Cli

  /**
   * Loads the CLI under a throwaway home — so the default notes dir is ours —
   * on that default dir or on an override. → the notes dir.
   */
  function boot(where: 'default' | 'override'): string {
    home = path.join(tmp, 'home')
    // os.homedir() is mocked (not HOME / USERPROFILE) so the CLI — which reads
    // it at load — takes the throwaway home's default dir as its own.
    vi.spyOn(nodeOs, 'homedir').mockReturnValue(home)
    fs.mkdirSync(path.join(tmp, 'config', 'noteflow'), { recursive: true })
    // The dir the tests empty and fill (setNotes) is derived from the throwaway
    // home EXPLICITLY, never through os.homedir(): if the mock stopped reaching
    // a module, that would be the real ~/noteflow-notes.
    const notesDir = assertInsideTmp(where === 'default' ? defaultDir() : path.join(tmp, 'override-notes'), tmp)
    cli = loadCli(notesDir)
    assertInsideTmp(cli.SETTINGS_PATH, tmp)
    return notesDir
  }
  /** The default notes dir under the throwaway home (explicit — see boot). */
  const defaultDir = () => app.defaultNotesDir(home)
  const writeSettings = (s: Settings) => fs.writeFileSync(assertInsideTmp(cli.SETTINGS_PATH, tmp), JSON.stringify(s))
  function setNotes(dir: string, synced: boolean) {
    assertInsideTmp(dir, tmp) // before the rmSync: only ever a dir of this test
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    if (!synced) return
    fs.mkdirSync(path.join(dir, 'groceries-abc12345'))
    fs.writeFileSync(path.join(dir, 'groceries-abc12345', 'note.md'), '---\nid: abc12345\ntitle: Groceries\n---\n')
  }

  /** What the app's gate would decide for this file and dir. */
  function appDecision(kind: 'github' | 'cloud', next: Id, tagged: boolean) {
    const settings = app.readSettingsStrict(cli.SETTINGS_PATH) as Settings
    const dirs = { current: cli.NOTES_DIR, default: defaultDir() }
    const stored = kind === 'github' ? app.getStoredIdentity(settings, 'github') : app.resolveStoredCloudOrigin(settings, dirs)?.identity
    return app.decideOrigin({
      stored,
      next: tagged ? { ...next, notesDir: app.normalizeNotesDir(cli.NOTES_DIR) } : next,
      hasLocalNotes: () => app.hasSyncedLocalNotes(cli.NOTES_DIR),
      dirs,
    })
  }

  /** The CLI's gate state must be the app's decision; `adopt` is compared apart. */
  function expectSameGate(gate: { state: string; reason?: string; previous?: Id }, decision: app.OriginDecision, label: string) {
    if (decision.action === 'ask') {
      expect(gate.state, label).toBe('ask')
      // The same remote (a seeded Cloud owner carries no notes dir in the CLI's gate).
      expect(app.sameIdentity(gate.previous as Id, decision.previous), label).toBe(true)
      expect(gate.previous?.stale === true, label).toBe(decision.stale === true)
    } else {
      expect(gate.state, label).toBe('clear')
      expect(gate.reason, label).toBe(decision.reason === 'foreign-dir' ? 'other-dir' : decision.reason)
    }
  }

  it("the default notes dir is the same one (a record without notesDir belongs to it on both sides)", () => {
    boot('override')
    // Both sides resolve it from os.homedir(): the mocked home reaches the two.
    expect(cli.DEFAULT_NOTES_DIR).toBe(defaultDir())
    expect(app.defaultNotesDir()).toBe(defaultDir())
    expect(cli.DEFAULT_NOTES_DIR.startsWith(home)).toBe(true)
  })

  const githubRecords = (here: string, elsewhere: string): Array<Record<string, unknown> | undefined> => [
    undefined,
    { owner: 'me', repo: 'b', repoId: 2 },
    { owner: 'me', repo: 'b', repoId: 2, notesDir: here },
    { owner: 'ME', repo: 'B' },
    { owner: 'me', repo: 'old-name', repoId: 2, notesDir: here },
    { owner: 'me', repo: 'b', repoId: 2, stale: true },
    { owner: 'me', repo: 'b', repoId: 2, stale: true, notesDir: here },
    { owner: 'me', repo: 'a', repoId: 1 },
    { owner: 'me', repo: 'a', repoId: 1, notesDir: here },
    { owner: 'me', repo: 'a', repoId: 1, stale: true, notesDir: here },
    { owner: 'me', repo: 'a', repoId: 1, notesDir: elsewhere },
    { owner: 'me', repo: 'b', repoId: 2, notesDir: elsewhere },
    { owner: 'me', repo: 'b', repoId: 2, stale: true, notesDir: elsewhere },
  ]

  for (const where of ['the default notes dir', 'an override'] as const) {
    it(`GitHub, on ${where}: record × notes on disk`, () => {
      const notesDir = boot(where === 'the default notes dir' ? 'default' : 'override')
      const next = GH('me', 'b', 2)
      const outcomes = new Set<string>()
      for (const record of githubRecords(app.normalizeNotesDir(notesDir), path.join(tmp, 'elsewhere'))) for (const synced of [false, true]) {
        setNotes(notesDir, synced)
        writeSettings({
          githubSync: { enabled: true, owner: 'me', repo: 'b', repoId: 2, encryptedToken: TOKEN, lastSync: 'L' },
          ...(record ? { syncOrigin: { github: record } } : {}),
        })
        const before = fs.readFileSync(cli.SETTINGS_PATH, 'utf-8')
        const gate = cli.evaluateGithubOrigin({ write: false })
        const label = `${show(record)} notes=${synced}`
        const decision = appDecision('github', next, true)
        expectSameGate(gate, decision, label)
        // adopt: the CLI's gate doesn't tag the connection with the notes dir.
        if (decision.action === 'proceed' && decision.reason !== 'foreign-dir') {
          const untagged = appDecision('github', next, false)
          expect(gate.adopt, label).toBe(untagged.action === 'proceed' && untagged.adopt)
        }
        expect(fs.readFileSync(cli.SETTINGS_PATH, 'utf-8'), label).toBe(before) // write: false
        outcomes.add(decision.action === 'ask' ? 'ask' : decision.reason)
      }
      expect([...outcomes].sort()).toEqual(
        where === 'the default notes dir'
          ? ['ask', 'changed-empty', 'foreign-dir', 'no-origin', 'same', 'stale-empty']
          : ['ask', 'changed-empty', 'foreign-dir', 'same', 'stale-empty'],
      )
    })
  }

  it('GitHub: with the desktop app on NoteFlow Cloud neither side asks (GitHub is its mirror)', () => {
    const notesDir = boot('default')
    setNotes(notesDir, true)
    writeSettings({
      cloudSync: { enabled: true, userId: 'u1' },
      githubSync: { enabled: true, owner: 'me', repo: 'b', repoId: 2, encryptedToken: TOKEN },
      syncOrigin: { github: { owner: 'me', repo: 'a', repoId: 1 } },
    })
    // The app's gate is 'clear' here before any decision (githubSync.ts); the CLI says why.
    expect(cli.evaluateGithubOrigin({ write: false })).toMatchObject({ state: 'clear', reason: 'cloud-mirror' })
  })

  const cloudRecords = (here: string, elsewhere: string): Array<Record<string, unknown> | undefined> => [
    undefined,
    { userId: 'u2' },
    { userId: 'u2', email: 'b@x.io', notesDir: here },
    { userId: 'u2', email: 'old@x.io', notesDir: here },
    { userId: 'u2', email: 'b@x.io', stale: true, notesDir: here },
    { userId: 'u1' },
    { userId: 'u1', email: 'a@x.io', notesDir: here },
    { userId: 'u1', stale: true },
    { userId: 'u1', email: 'a@x.io', notesDir: elsewhere },
    { userId: 'u2', email: 'b@x.io', notesDir: elsewhere },
  ]

  for (const where of ['the default notes dir', 'an override'] as const) {
    it(`NoteFlow Cloud, on ${where}: record × the app's recorded owner × notes on disk`, () => {
      const notesDir = boot(where === 'the default notes dir' ? 'default' : 'override')
      const next = CL('u2', { email: 'b@x.io' })
      const outcomes = new Set<string>()
      for (const record of cloudRecords(app.normalizeNotesDir(notesDir), path.join(tmp, 'elsewhere'))) {
        for (const owner of [undefined, 'u1', 'u2']) for (const synced of [false, true]) {
          setNotes(notesDir, synced)
          writeSettings({
            cliAccount: { email: 'b@x.io', userId: 'u2', refreshToken: Buffer.from('rt').toString('base64') },
            cliCloud: { enabled: true },
            // The seed both sides share: the owner of the app's Cloud state.
            ...(owner ? { cloudSync: { userId: owner } } : {}),
            ...(record ? { syncOrigin: { cloud: record } } : {}),
          })
          const before = fs.readFileSync(cli.SETTINGS_PATH, 'utf-8')
          const gate = cli.evaluateCloudOrigin({ write: false })
          const label = `${show(record)} owner=${owner} notes=${synced}`
          const decision = appDecision('cloud', next, true)
          expectSameGate(gate, decision, label)
          expect(fs.readFileSync(cli.SETTINGS_PATH, 'utf-8'), label).toBe(before)
          outcomes.add(decision.action === 'ask' ? 'ask' : decision.reason)
        }
      }
      expect([...outcomes].sort()).toEqual(
        where === 'the default notes dir'
          ? ['ask', 'changed-empty', 'foreign-dir', 'no-origin', 'same', 'stale-empty']
          : ['ask', 'changed-empty', 'foreign-dir', 'same', 'stale-empty'],
      )
    })
  }

  it('a same-identity record without notesDir: the app rewrites it to add the dir, the CLI leaves it (both proceed)', () => {
    const notesDir = boot('default')
    setNotes(notesDir, true)
    writeSettings({
      githubSync: { enabled: true, owner: 'me', repo: 'b', repoId: 2, encryptedToken: TOKEN },
      syncOrigin: { github: { owner: 'me', repo: 'b', repoId: 2 } },
    })
    expect(appDecision('github', GH('me', 'b', 2), true)).toEqual({ action: 'proceed', adopt: true, reason: 'same' })
    const before = fs.readFileSync(cli.SETTINGS_PATH, 'utf-8')
    expect(cli.evaluateGithubOrigin()).toMatchObject({ state: 'clear', reason: 'same', adopt: false })
    expect(fs.readFileSync(cli.SETTINGS_PATH, 'utf-8')).toBe(before)
    // Once the app has rewritten it, the CLI still reads it as this dir's.
    app.writeSyncOriginFile(cli.SETTINGS_PATH, GH('me', 'b', 2, { notesDir }))
    expect(cli.evaluateGithubOrigin()).toMatchObject({ state: 'clear', reason: 'same', adopt: false })
    expect(cli.getStoredIdentity(cli.readSettingsStrict(), 'github').notesDir).toBe(app.normalizeNotesDir(notesDir))
  })

  it("through the file: the app's stale mark closes the CLI's gate; the CLI's adoption reopens the app's", () => {
    const notesDir = boot('default')
    setNotes(notesDir, true)
    const dirs = { current: notesDir, default: notesDir }
    writeSettings({ githubSync: { enabled: true, owner: 'me', repo: 'b', repoId: 2, encryptedToken: TOKEN, lastSync: 'L' } })
    // The app records the repo, then its Cloud "use only the notes from …" marks it stale.
    expect(app.writeSyncOriginFile(cli.SETTINGS_PATH, GH('me', 'b', 2, { notesDir }))).toBe(true)
    expect(cli.evaluateGithubOrigin({ write: false })).toMatchObject({ state: 'clear', reason: 'same' })
    expect(app.markSyncOriginStaleFile(cli.SETTINGS_PATH, 'github', dirs)).toBe(true)
    const gate = cli.evaluateGithubOrigin()
    expect(gate.state).toBe('ask')
    expect(gate.previous.stale).toBe(true)
    // `noteflow origin merge` adopts strictly: the app then sees its own repo, current.
    expect(cli.adoptGithubOrigin(gate.next, true)).toEqual({ ok: true })
    const settings = app.readSettingsStrict(cli.SETTINGS_PATH) as Settings
    expect(app.getStoredIdentity(settings, 'github')).toEqual(GH('me', 'b', 2, { notesDir: app.normalizeNotesDir(notesDir) }))
    expect((settings.githubSync as { lastSync?: string }).lastSync).toBeUndefined() // the reset
    expect(appDecision('github', GH('me', 'b', 2), true)).toEqual({ action: 'proceed', adopt: false, reason: 'same' })
  })
})
