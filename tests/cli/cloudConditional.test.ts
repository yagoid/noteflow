// Parity of the CLI's NoteFlow Cloud client (cli/noteflow.js) with the pure
// decisions of electron/cloudSyncLogic.ts added for conditional uploads
// (migration 0011), the pull retry set and the account switch — plus the
// CLI-only pending-upload bookkeeping of a pull.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  CLOUD_CONDITIONAL_UPSERT_RPC,
  classifyConditionalUpsert,
  parsePullRetry,
  mergeRetryRows,
  nextPullRetry,
  PULL_RETRY_MAX_DECRYPT_ATTEMPTS,
  PULL_RETRY_MAX_APPLY_ATTEMPTS,
  countDroppedRetries,
  mergeMetadataById,
  planMetadataPull,
  PULL_RETRY_CHUNK,
  shouldResetCloudState,
  type PullRetrySet,
} from '../../electron/cloudSyncLogic'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

type CliCloud = {
  enabled: boolean; pullSeq?: number; lastSync?: string; userId?: string
  pendingUpserts?: string[]; forceUpserts?: string[]; pullRetry?: PullRetrySet
}
const cliCloudForUser = cli.cliCloudForUser as (c: CliCloud, userId: string | undefined, presumed?: string) => CliCloud
const dropReconciledPending = cli.dropReconciledPending as (pending: unknown, dirs: string[], paths: string[]) => string[]

describe('conditional upsert parity', () => {
  it('same RPC name and constants', () => {
    expect(cli.CLOUD_CONDITIONAL_UPSERT_RPC).toBe(CLOUD_CONDITIONAL_UPSERT_RPC)
    expect(cli.PULL_RETRY_MAX_DECRYPT_ATTEMPTS).toBe(PULL_RETRY_MAX_DECRYPT_ATTEMPTS)
    expect(cli.PULL_RETRY_MAX_APPLY_ATTEMPTS).toBe(PULL_RETRY_MAX_APPLY_ATTEMPTS)
    expect(cli.PULL_RETRY_CHUNK).toBe(PULL_RETRY_CHUNK)
  })

  it('classifyConditionalUpsert matches the app on every response shape', () => {
    const cases: Array<[number, unknown]> = [
      [200, true], [200, false], [200, null], [204, null],
      [404, { code: 'PGRST202' }], [404, null], [400, { code: 'PGRST202' }],
      [403, { code: '42501' }], [401, null], [500, null], [409, { code: '23505' }],
    ]
    for (const [status, json] of cases) {
      expect(cli.classifyConditionalUpsert(status, json)).toBe(classifyConditionalUpsert(status, json))
    }
  })
})

describe('pull retry set parity', () => {
  it('parsePullRetry', () => {
    const raw = { k1: { relPath: 'a/note.md', attempts: 2 }, k2: { attempts: 1 }, k3: { relPath: 7, attempts: -1 }, k4: 'x' }
    expect(cli.parsePullRetry(raw)).toEqual(parsePullRetry(raw))
    expect(cli.parsePullRetry(undefined)).toEqual(parsePullRetry(undefined))
  })

  it('mergeRetryRows', () => {
    const main = [{ path_key: 'a', seq: 10 }, { path_key: 'b', seq: 11 }]
    const retry = [{ path_key: 'b', seq: 3 }, { path_key: 'c', seq: 4 }]
    expect(cli.mergeRetryRows(main, retry)).toEqual(mergeRetryRows(main, retry))
  })

  it('nextPullRetry (apply failures, decrypt cap, gone rows)', () => {
    const prev: PullRetrySet = { a: { relPath: 'x/note.md', attempts: 1 }, d: { attempts: PULL_RETRY_MAX_DECRYPT_ATTEMPTS - 1 }, e: { attempts: 1 }, gone: { attempts: 3 } }
    const failures = { apply: new Map([['a', 'x/note.md'], ['b', 'x/s.md']]), decrypt: ['d', 'e', 'a'] }
    expect(cli.nextPullRetry(prev, failures)).toEqual(nextPullRetry(prev, failures))
    expect(cli.nextPullRetry(prev, failures)).toEqual({
      a: { relPath: 'x/note.md', attempts: 2 },
      b: { relPath: 'x/s.md', attempts: 1 },
      e: { attempts: 2 },
    })
  })
})

describe('account switch parity (cliCloudForUser ↔ shouldResetCloudState)', () => {
  const state: CliCloud = {
    enabled: true, pullSeq: 42, lastSync: '2026-10-01T00:00:00.000Z', userId: 'user-a',
    pendingUpserts: ['n/note.md'], forceUpserts: ['n/note.md'], pullRetry: { k: { attempts: 1 } },
  }

  it('resets exactly when the app would, dropping pullRetry too', () => {
    for (const [owner, current] of [['user-a', 'user-b'], ['user-a', 'user-a'], [undefined, 'user-b']] as const) {
      const c = { ...state, userId: owner }
      const next = cliCloudForUser(c, current)
      const reset = next.pullSeq === undefined
      expect(reset).toBe(shouldResetCloudState(owner, current))
      if (reset) {
        expect(next.pullRetry).toBeUndefined()
        expect(next.pendingUpserts).toBeUndefined()
        expect(next.forceUpserts).toBeUndefined()
        expect(next.lastSync).toBeUndefined()
      } else {
        expect(next.pullRetry).toEqual(state.pullRetry)
      }
    }
  })
})

describe('dropReconciledPending (pull settles pending uploads)', () => {
  it('drops every entry under a folder applied wholesale and the exact reconciled paths', () => {
    const pending = ['a/note.md', 'a/s1.md', 'ab/note.md', 'b/s1.md', 'b/s2.md', 'groups.json']
    expect(dropReconciledPending(pending, ['a'], ['b/s1.md'])).toEqual(['ab/note.md', 'b/s2.md', 'groups.json'])
  })

  it('tolerates a missing list', () => {
    expect(dropReconciledPending(undefined, ['a'], [])).toEqual([])
  })
})

describe('pull retry cap parity', () => {
  it('apply failures are dropped at the max; dropped counts match', () => {
    const apply = new Map([['a', 'x/note.md'], ['b', 'x/s.md']])
    const prev: PullRetrySet = { a: { relPath: 'x/note.md', attempts: PULL_RETRY_MAX_APPLY_ATTEMPTS - 1 }, b: { attempts: 3 } }
    const failures = { apply, decrypt: ['d'] }
    const next = nextPullRetry(prev, failures)
    expect(cli.nextPullRetry(prev, failures)).toEqual(next)
    expect(next.a).toBeUndefined()
    expect(cli.countDroppedRetries(failures, next)).toBe(countDroppedRetries(failures, next))
    expect(countDroppedRetries(failures, next)).toBe(1)
  })
})

describe('metadata merge parity (first reconcile / pending local upload)', () => {
  const L = JSON.stringify([{ id: 'a', name: 'local' }, { id: 'c', name: 'both-local' }], null, 2)
  const R = JSON.stringify([{ id: 'b', name: 'remote' }, { id: 'c', name: 'both-remote' }], null, 2)

  it('mergeMetadataById', () => {
    for (const prefer of ['local', 'remote'] as const) {
      expect(cli.mergeMetadataById(L, R, prefer)).toBe(mergeMetadataById(L, R, prefer))
    }
    expect(cli.mergeMetadataById('{}', R, 'remote')).toBe(mergeMetadataById('{}', R, 'remote'))
    expect(cli.mergeMetadataById(null, R, 'remote')).toBe(mergeMetadataById(null, R, 'remote'))
  })

  it('planMetadataPull on every branch', () => {
    const files = ['groups.json', 'templates.json', 'note-order.json', 'ui-settings.json']
    const locals = [L, null, 'garbage', R]
    for (const rel of files) {
      for (const local of locals) {
        for (const pendingUpsert of [false, true]) {
          for (const firstPull of [false, true]) {
            const opts = { pendingUpsert, firstPull }
            expect(cli.planMetadataPull(rel, local, R, opts)).toEqual(planMetadataPull(rel, local, R, opts))
          }
        }
      }
    }
  })
})

describe('forced re-upload of a kept folder (cliCloud.forceUpserts)', () => {
  const nextPendingUpserts = cli.nextPendingUpserts as (p: unknown, failed: string[], uploaded: string[]) => string[]
  const isPendingUpsert = cli.isPendingUpsert as (p: unknown, rel: string) => boolean

  it('stays forced across a failed attempt and leaves only when it lands (app journal force semantics)', () => {
    let force = nextPendingUpserts(undefined, ['k/note.md', 'k/s1.md'], []) // pull keeps folder k
    force = nextPendingUpserts(force, [], ['k/note.md']) // s1 failed, note.md landed
    expect(isPendingUpsert(force, 'k/s1.md')).toBe(true)
    expect(isPendingUpsert(force, 'k/note.md')).toBe(false)
    force = nextPendingUpserts(force, [], ['k/s1.md'])
    expect(force).toEqual([])
  })

  it('a pull that applies the folder wholesale drops its forced entries too', () => {
    expect(dropReconciledPending(['k/note.md', 'k/s1.md', 'j/note.md'], ['k'], [])).toEqual(['j/note.md'])
  })
})

describe('dirsPendingRetry (noteflow push skips half-applied folders)', () => {
  it('collects the note dirs of retry entries that carry a relPath', () => {
    const dirs = cli.dirsPendingRetry({
      k1: { relPath: 'a/note.md', attempts: 1 },
      k2: { relPath: 'a/s1.md', attempts: 1 },
      k3: { relPath: 'groups.json', attempts: 1 },
      k4: { attempts: 2 },
    }) as Set<string>
    expect([...dirs]).toEqual(['a'])
    expect([...(cli.dirsPendingRetry(undefined) as Set<string>)]).toEqual([])
  })
})
