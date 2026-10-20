// Pure sync-state decisions of the CLI (cli/noteflow.js), pinned without any
// network: when a GitHub pull/push may advance `githubSync.lastSync` (shared
// with the desktop app's deletion rule on Windows/Linux), and when the Cloud
// pull cursor kept across `cloud logout` must be dropped because the account
// that signs in is not the one that produced it.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

type CliCloud = { enabled: boolean; pullSeq?: number; pullCursor?: string; lastSync?: string; userId?: string }

const nextGithubLastSync = cli.nextGithubLastSync as (pending: number, nowIso: string) => string | null
const localOnlyNoteDirs = cli.localOnlyNoteDirs as (localDirs: string[], remoteDirs: Map<string, string[]>) => string[]
const localOnlyHint = cli.localOnlyHint as (n: number) => string
const cliCloudForUser = cli.cliCloudForUser as (
  c: CliCloud, userId: string | undefined, presumedOwner?: string,
) => CliCloud

const NOW = '2026-10-11T12:00:00.000Z'

describe('nextGithubLastSync (GitHub pull/push)', () => {
  it('advances to now when nothing is left unsynced', () => {
    expect(nextGithubLastSync(0, NOW)).toBe(NOW)
  })

  it('keeps the previous lastSync when local-only notes / failed files remain', () => {
    expect(nextGithubLastSync(1, NOW)).toBeNull()
    expect(nextGithubLastSync(42, NOW)).toBeNull()
  })
})

describe('localOnlyNoteDirs (GitHub pull)', () => {
  it('counts a remote dir with sections but no note.md as local-only', () => {
    const remote = new Map([['a', ['note.md', 's1.md']], ['b', ['s1.md', 's2.md']]])
    expect(localOnlyNoteDirs(['a', 'b'], remote)).toEqual(['b'])
  })

  it('an empty remote listing (empty repo) leaves every local note local-only', () => {
    expect(localOnlyNoteDirs(['a', 'b'], new Map())).toEqual(['a', 'b'])
    expect(localOnlyNoteDirs([], new Map())).toEqual([])
  })

  it('a partial listing reports only the dirs the remote lacks', () => {
    const remote = new Map([['a', ['note.md']], ['remote-only', ['note.md']]])
    expect(localOnlyNoteDirs(['a', 'b', 'c'], remote)).toEqual(['b', 'c'])
  })
})

describe('localOnlyHint', () => {
  it('stays neutral (new or deleted elsewhere), singular and plural', () => {
    expect(localOnlyHint(1)).toBe(
      "1 local note is not on GitHub (new here, or deleted on another device) — run 'noteflow push' to upload it if new")
    expect(localOnlyHint(3)).toBe(
      "3 local notes are not on GitHub (new here, or deleted on another device) — run 'noteflow push' to upload them if new")
  })
})

describe('cliCloudForUser (Cloud cursor owner)', () => {
  const synced: CliCloud = {
    enabled: false, pullCursor: '2026-10-01T00:00:00.000Z', lastSync: '2026-10-01T00:00:01.000Z', userId: 'user-a',
  }

  it('keeps cursor/lastSync for the same account (same object = nothing to write)', () => {
    expect(cliCloudForUser(synced, 'user-a')).toBe(synced)
  })

  it('drops cursor/lastSync and rebinds the owner for another account', () => {
    const next = cliCloudForUser(synced, 'user-b')
    expect(next).toEqual({ enabled: false, userId: 'user-b' })
    expect(next).not.toHaveProperty('pullCursor')
    expect(next).not.toHaveProperty('lastSync')
    expect(synced.pullCursor).toBeDefined() // input untouched
  })

  // Unknown owner = state from before the owner was recorded. Resetting would
  // drop the tombstones (a cursor-less pull filters deleted=eq.false) and let
  // the next push resurrect notes deleted elsewhere, so it is adopted instead.
  const legacy: CliCloud = { enabled: true, pullCursor: '2026-10-01T00:00:00.000Z', lastSync: '2026-10-01T00:00:01.000Z' }

  it('adopts an unknown owner without dropping the cursor', () => {
    expect(cliCloudForUser(legacy, 'user-a')).toEqual({ ...legacy, userId: 'user-a' })
  })

  it('unknown owner + presumed owner (previous session at login): same account adopts', () => {
    expect(cliCloudForUser(legacy, 'user-a', 'user-a')).toEqual({ ...legacy, userId: 'user-a' })
  })

  it('unknown owner + presumed owner of another account resets', () => {
    expect(cliCloudForUser(legacy, 'user-b', 'user-a')).toEqual({ enabled: true, userId: 'user-b' })
  })

  it('a recorded owner wins over the presumed one', () => {
    expect(cliCloudForUser(synced, 'user-a', 'user-b')).toBe(synced)
    expect(cliCloudForUser(synced, 'user-b', 'user-b')).toEqual({ enabled: false, userId: 'user-b' })
  })

  // Seq-era state (migration 0008): the watermark is pullSeq. A foreign one
  // would skip every row of the new account below it (`seq > pullSeq`).
  const seqSynced: CliCloud = { enabled: true, pullSeq: 1234, lastSync: '2026-10-01T00:00:01.000Z', userId: 'user-a' }

  it('keeps pullSeq for the same account', () => {
    expect(cliCloudForUser(seqSynced, 'user-a')).toBe(seqSynced)
  })

  it('drops pullSeq (and any legacy pullCursor) when another account signs in', () => {
    const next = cliCloudForUser({ ...seqSynced, pullCursor: '2026-10-01T00:00:00.000Z' }, 'user-b')
    expect(next).toEqual({ enabled: true, userId: 'user-b' })
    expect(next).not.toHaveProperty('pullSeq')
    expect(next).not.toHaveProperty('pullCursor')
  })

  it('drops a pullSeq of 0 too (it is still a watermark)', () => {
    expect(cliCloudForUser({ enabled: false, pullSeq: 0, userId: 'user-a' }, 'user-b'))
      .toEqual({ enabled: false, userId: 'user-b' })
  })

  it('just records the owner when there was no cursor yet', () => {
    expect(cliCloudForUser({ enabled: false }, 'user-a')).toEqual({ enabled: false, userId: 'user-a' })
  })

  it('leaves the state alone when the account has no userId to compare', () => {
    expect(cliCloudForUser(synced, undefined)).toBe(synced)
  })
})
