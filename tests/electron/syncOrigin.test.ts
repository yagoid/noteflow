// electron/syncOrigin.ts — the origin of the notes dir per sync backend: the
// pure decision (proceed / ask), identity comparison, labels and the helpers
// over settings.json (read-modify-write that keeps every other key).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  decideOrigin,
  sameIdentity,
  identityLabel,
  identityArchiveLabel,
  sanitizeLabel,
  readSyncOrigin,
  getStoredIdentity,
  withSyncOrigin,
  hasSyncedLocalNotes,
  readSettingsStrict,
  writeSyncOriginFile,
  type SyncIdentity,
} from '../../electron/syncOrigin'
import { resetLocalOnlyMemory } from '../../electron/localOnlyNotes'

const A: SyncIdentity = { kind: 'github', owner: 'me', repo: 'notes-a', repoId: 1 }
const B: SyncIdentity = { kind: 'github', owner: 'me', repo: 'notes-b', repoId: 2 }
const notes = (has: boolean) => () => has

describe('sameIdentity', () => {
  it('compares GitHub repos by repoId when both sides have it (rename / transfer keeps the id)', () => {
    expect(sameIdentity(A, { kind: 'github', owner: 'other', repo: 'renamed', repoId: 1 })).toBe(true)
    expect(sameIdentity(A, { kind: 'github', owner: 'me', repo: 'notes-a', repoId: 9 })).toBe(false)
  })
  it('falls back to owner/repo, case-insensitively, when an id is missing', () => {
    expect(sameIdentity(A, { kind: 'github', owner: 'ME', repo: 'Notes-A' })).toBe(true)
    expect(sameIdentity({ kind: 'github', owner: 'me', repo: 'notes-a' }, B)).toBe(false)
  })
  it('Cloud compares by userId; different kinds never match', () => {
    expect(sameIdentity({ kind: 'cloud', userId: 'u1' }, { kind: 'cloud', userId: 'u1' })).toBe(true)
    expect(sameIdentity({ kind: 'cloud', userId: 'u1' }, { kind: 'cloud', userId: 'u2' })).toBe(false)
    expect(sameIdentity({ kind: 'cloud', userId: 'me' }, A)).toBe(false)
  })
})

describe('decideOrigin', () => {
  it('no stored origin → proceed and adopt, without asking (first connection / install before the feature)', () => {
    expect(decideOrigin({ stored: undefined, next: B, hasLocalNotes: notes(true) })).toEqual({ action: 'proceed', adopt: true, reason: 'no-origin' })
  })
  it('same identity → proceed; adopts only to refresh a rename or a missing repoId', () => {
    expect(decideOrigin({ stored: A, next: A, hasLocalNotes: notes(true) })).toEqual({ action: 'proceed', adopt: false, reason: 'same' })
    const renamed: SyncIdentity = { kind: 'github', owner: 'me', repo: 'renamed', repoId: 1 }
    expect(decideOrigin({ stored: A, next: renamed, hasLocalNotes: notes(true) })).toEqual({ action: 'proceed', adopt: true, reason: 'same' })
    const noId: SyncIdentity = { kind: 'github', owner: 'me', repo: 'notes-a' }
    expect(decideOrigin({ stored: noId, next: A, hasLocalNotes: notes(true) })).toEqual({ action: 'proceed', adopt: true, reason: 'same' })
    // The new side without id says nothing new: no rewrite.
    expect(decideOrigin({ stored: A, next: noId, hasLocalNotes: notes(true) })).toEqual({ action: 'proceed', adopt: false, reason: 'same' })
  })
  it('another identity without local notes → proceed and adopt (nothing to protect)', () => {
    expect(decideOrigin({ stored: A, next: B, hasLocalNotes: notes(false) })).toEqual({ action: 'proceed', adopt: true, reason: 'changed-empty' })
  })
  it('another identity with local notes → ask', () => {
    expect(decideOrigin({ stored: A, next: B, hasLocalNotes: notes(true) })).toEqual({ action: 'ask', previous: A, next: B })
  })
  it('lists the notes dir only when the identity changed', () => {
    let calls = 0
    const probe = () => { calls++; return true }
    decideOrigin({ stored: undefined, next: B, hasLocalNotes: probe })
    decideOrigin({ stored: A, next: A, hasLocalNotes: probe })
    expect(calls).toBe(0)
    decideOrigin({ stored: A, next: B, hasLocalNotes: probe })
    expect(calls).toBe(1)
  })
  it('works for NoteFlow Cloud identities too', () => {
    const u1: SyncIdentity = { kind: 'cloud', userId: 'u1' }
    const u2: SyncIdentity = { kind: 'cloud', userId: 'u2' }
    expect(decideOrigin({ stored: u1, next: u2, hasLocalNotes: notes(true) })).toEqual({ action: 'ask', previous: u1, next: u2 })
    expect(decideOrigin({ stored: u1, next: u1, hasLocalNotes: notes(true) }).action).toBe('proceed')
  })
})

describe('labels', () => {
  it('identityLabel', () => {
    expect(identityLabel(A)).toBe('me/notes-a')
    expect(identityLabel({ kind: 'cloud', userId: 'abc' })).toBe('abc')
  })
  it('archive labels are folder-name safe', () => {
    expect(identityArchiveLabel({ kind: 'github', owner: 'Me', repo: 'My Notes!' })).toBe('github-me-my-notes')
    expect(identityArchiveLabel({ kind: 'cloud', userId: '0123456789abcdef' })).toBe('cloud-01234567')
    expect(sanitizeLabel('../..//')).toBe('origin')
    expect(sanitizeLabel('a:b\\c')).toBe('a-b-c')
    expect(sanitizeLabel('x'.repeat(200)).length).toBeLessThanOrEqual(80)
  })
})

describe('settings helpers', () => {
  it('readSyncOrigin ignores malformed entries', () => {
    expect(readSyncOrigin({})).toEqual({})
    expect(readSyncOrigin({ syncOrigin: 'x' })).toEqual({})
    expect(readSyncOrigin({ syncOrigin: { github: { owner: 'me' }, cloud: { userId: 3 } } })).toEqual({})
    expect(readSyncOrigin({ syncOrigin: { github: { owner: 'me', repo: 'r', repoId: 'nope' } } })).toEqual({ github: { owner: 'me', repo: 'r' } })
  })
  it('getStoredIdentity / withSyncOrigin round-trip and keep every other key', () => {
    const settings = { theme: 'carbon', syncOrigin: { cloud: { userId: 'u1' }, future: 1 }, githubSync: { owner: 'me' } }
    const next = withSyncOrigin(settings, A)
    expect(next).toEqual({
      theme: 'carbon',
      githubSync: { owner: 'me' },
      syncOrigin: { cloud: { userId: 'u1' }, future: 1, github: { repoId: 1, owner: 'me', repo: 'notes-a' } },
    })
    expect(settings.syncOrigin).toEqual({ cloud: { userId: 'u1' }, future: 1 }) // input untouched
    expect(getStoredIdentity(next, 'github')).toEqual(A)
    expect(getStoredIdentity(next, 'cloud')).toEqual({ kind: 'cloud', userId: 'u1' })
    expect(getStoredIdentity({}, 'github')).toBeUndefined()
    // Without a known id the key is simply absent.
    expect(withSyncOrigin({}, { kind: 'github', owner: 'me', repo: 'r' })).toEqual({ syncOrigin: { github: { owner: 'me', repo: 'r' } } })
  })
})

describe('file wrappers', () => {
  let tmp: string
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-sync-origin-'))
    resetLocalOnlyMemory()
  })
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('writeSyncOriginFile re-reads the file and keeps keys written by others', () => {
    const file = path.join(tmp, 'settings.json')
    fs.writeFileSync(file, JSON.stringify({ cliCloud: { enabled: true }, githubSync: { owner: 'me', repo: 'notes-a' } }))
    expect(writeSyncOriginFile(file, A)).toBe(true)
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      cliCloud: { enabled: true },
      githubSync: { owner: 'me', repo: 'notes-a' },
      syncOrigin: { github: { repoId: 1, owner: 'me', repo: 'notes-a' } },
    })
  })
  it('never overwrites a settings.json it cannot parse; a missing one is created', () => {
    const file = path.join(tmp, 'settings.json')
    fs.writeFileSync(file, '{ not json')
    expect(readSettingsStrict(file)).toBeNull()
    expect(writeSyncOriginFile(file, A)).toBe(false)
    expect(fs.readFileSync(file, 'utf-8')).toBe('{ not json')
    const fresh = path.join(tmp, 'new', 'settings.json')
    expect(readSettingsStrict(fresh)).toEqual({})
    expect(writeSyncOriginFile(fresh, B)).toBe(true)
    expect(JSON.parse(fs.readFileSync(fresh, 'utf-8')).syncOrigin.github.repoId).toBe(2)
  })
  it('hasSyncedLocalNotes: local-only notes do not count; unreadable dir fails closed', () => {
    const dir = path.join(tmp, 'notes')
    expect(hasSyncedLocalNotes(dir)).toBe(false) // missing dir: no notes
    fs.mkdirSync(dir)
    expect(hasSyncedLocalNotes(dir)).toBe(false)
    fs.mkdirSync(path.join(dir, 'welcome-aaaa'))
    fs.writeFileSync(path.join(dir, 'welcome-aaaa', 'note.md'), '---\nid: aaaa\nlocalOnly: true\n---\n')
    expect(hasSyncedLocalNotes(dir)).toBe(false)
    fs.mkdirSync(path.join(dir, 'real-bbbb'))
    fs.writeFileSync(path.join(dir, 'real-bbbb', 'note.md'), '---\nid: bbbb\n---\n')
    expect(hasSyncedLocalNotes(dir)).toBe(true)
    expect(hasSyncedLocalNotes(null)).toBe(true)
    const notADir = path.join(tmp, 'file.txt')
    fs.writeFileSync(notADir, 'x')
    expect(hasSyncedLocalNotes(notADir)).toBe(true) // ENOTDIR: can't tell → has notes
  })
})
