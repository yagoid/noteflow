// Pure decisions added to electron/cloudSyncLogic.ts for the second hardening
// round of NoteFlow Cloud: conditional uploads (RPC of migration 0011), the
// pull retry set (failed applies), the owner of the persisted sync state
// (account switch) and the root-metadata merge of the first sync.
import { describe, it, expect } from 'vitest'
import {
  classifyConditionalUpsert,
  parsePullRetry,
  mergeRetryRows,
  nextPullRetry,
  PULL_RETRY_MAX_DECRYPT_ATTEMPTS,
  PULL_RETRY_MAX_APPLY_ATTEMPTS,
  countDroppedRetries,
  shouldResetCloudState,
  isMergeableMetadata,
  mergeMetadataById,
  planMetadataPull,
} from '../../electron/cloudSyncLogic'

describe('classifyConditionalUpsert (POST rpc/cloud_upsert_file)', () => {
  it('true → uploaded, false → stale (server holds a newer version)', () => {
    expect(classifyConditionalUpsert(200, true)).toBe('uploaded')
    expect(classifyConditionalUpsert(200, false)).toBe('stale')
  })

  it('a missing function (0011 not deployed) → missing, for the plain-upsert fallback', () => {
    expect(classifyConditionalUpsert(404, { code: 'PGRST202', message: 'Could not find the function' })).toBe('missing')
    expect(classifyConditionalUpsert(404, null)).toBe('missing')
    expect(classifyConditionalUpsert(400, { code: 'PGRST202' })).toBe('missing')
  })

  it('RLS 403 → forbidden (subscription error); other HTTP failures → error', () => {
    expect(classifyConditionalUpsert(403, { code: '42501' })).toBe('forbidden')
    expect(classifyConditionalUpsert(401, null)).toBe('error')
    expect(classifyConditionalUpsert(500, null)).toBe('error')
  })

  it('anything but an explicit false on success counts as uploaded', () => {
    expect(classifyConditionalUpsert(200, null)).toBe('uploaded')
    expect(classifyConditionalUpsert(204, null)).toBe('uploaded')
  })
})

describe('pull retry set (failed applies are retried)', () => {
  it('parsePullRetry keeps well-formed entries and drops the rest', () => {
    expect(parsePullRetry(undefined)).toEqual({})
    expect(parsePullRetry([])).toEqual({})
    expect(
      parsePullRetry({
        k1: { relPath: 'a/note.md', attempts: 2 },
        k2: { attempts: 1 },
        k3: { relPath: 7, attempts: -1 },
        k4: 'bogus',
      })
    ).toEqual({ k1: { relPath: 'a/note.md', attempts: 2 }, k2: { attempts: 1 }, k3: { attempts: 0 } })
  })

  it('mergeRetryRows dedupes by path_key and the main fetch wins', () => {
    const main = [{ path_key: 'a', seq: 10 }, { path_key: 'b', seq: 11 }]
    const retry = [{ path_key: 'b', seq: 3 }, { path_key: 'c', seq: 4 }, { path_key: 'c', seq: 4 }]
    expect(mergeRetryRows(main, retry)).toEqual([
      { path_key: 'a', seq: 10 },
      { path_key: 'b', seq: 11 },
      { path_key: 'c', seq: 4 },
    ])
  })

  it('nextPullRetry is built from this pull failures only (applied / gone rows leave)', () => {
    const prev = { a: { relPath: 'x/note.md', attempts: 1 }, gone: { attempts: 3 } }
    const next = nextPullRetry(prev, { apply: new Map([['a', 'x/note.md'], ['b', 'x/s.md']]), decrypt: [] })
    expect(next).toEqual({ a: { relPath: 'x/note.md', attempts: 2 }, b: { relPath: 'x/s.md', attempts: 1 } })
    expect(nextPullRetry(next, { apply: new Map(), decrypt: [] })).toEqual({})
  })

  it('apply failures are dropped at their (high) max; a permanent local error does not stay forever', () => {
    expect(PULL_RETRY_MAX_APPLY_ATTEMPTS).toBeGreaterThan(PULL_RETRY_MAX_DECRYPT_ATTEMPTS)
    const apply = new Map([['a', 'x/note.md']])
    const almost = { a: { relPath: 'x/note.md', attempts: PULL_RETRY_MAX_APPLY_ATTEMPTS - 2 } }
    const next = nextPullRetry(almost, { apply, decrypt: [] })
    expect(next.a.attempts).toBe(PULL_RETRY_MAX_APPLY_ATTEMPTS - 1)
    expect(countDroppedRetries({ apply, decrypt: [] }, next)).toBe(0)
    const last = nextPullRetry(next, { apply, decrypt: [] })
    expect(last).toEqual({})
    expect(countDroppedRetries({ apply, decrypt: [] }, last)).toBe(1)
  })

  it('countDroppedRetries counts each given-up key once', () => {
    const failures = { apply: new Map([['a', 'x/note.md']]), decrypt: ['a', 'd'] }
    const next = nextPullRetry({ a: { attempts: PULL_RETRY_MAX_APPLY_ATTEMPTS }, d: { attempts: 1 } }, failures)
    expect(next).toEqual({ d: { attempts: 2 } })
    expect(countDroppedRetries(failures, next)).toBe(1)
  })

  it('decrypt failures are dropped at the max attempts', () => {
    let set = {}
    for (let i = 1; i < PULL_RETRY_MAX_DECRYPT_ATTEMPTS; i++) {
      set = nextPullRetry(set, { apply: new Map(), decrypt: ['d'] })
      expect(set).toEqual({ d: { attempts: i } })
    }
    expect(nextPullRetry(set, { apply: new Map(), decrypt: ['d'] })).toEqual({})
  })

  it('an apply failure wins over a decrypt failure of the same key', () => {
    const next = nextPullRetry({}, { apply: new Map([['k', 'x/note.md']]), decrypt: ['k'] })
    expect(next).toEqual({ k: { relPath: 'x/note.md', attempts: 1 } })
  })
})

describe('shouldResetCloudState (account switch on this machine)', () => {
  it('resets only when the recorded owner is another account', () => {
    expect(shouldResetCloudState('user-a', 'user-b')).toBe(true)
    expect(shouldResetCloudState('user-a', 'user-a')).toBe(false)
  })

  it('unknown owner is adopted (no reset); signed out never resets', () => {
    expect(shouldResetCloudState(undefined, 'user-b')).toBe(false)
    expect(shouldResetCloudState(null, 'user-b')).toBe(false)
    expect(shouldResetCloudState('user-a', null)).toBe(false)
    expect(shouldResetCloudState('user-a', undefined)).toBe(false)
  })
})

const json = (v: unknown) => JSON.stringify(v, null, 2)

describe('mergeMetadataById (groups / folders / templates)', () => {
  const local = [{ id: 'g1', name: 'Local 1' }, { id: 'g2', name: 'Local only' }]
  const remote = [{ id: 'g3', name: 'Remote only' }, { id: 'g1', name: 'Remote 1' }]

  it('prefer remote: collisions take the remote object, remote order first', () => {
    expect(mergeMetadataById(json(local), json(remote), 'remote')).toBe(
      json([{ id: 'g3', name: 'Remote only' }, { id: 'g1', name: 'Remote 1' }, { id: 'g2', name: 'Local only' }])
    )
  })

  it('prefer local: collisions take the local object, local order first', () => {
    expect(mergeMetadataById(json(local), json(remote), 'local')).toBe(
      json([{ id: 'g1', name: 'Local 1' }, { id: 'g2', name: 'Local only' }, { id: 'g3', name: 'Remote only' }])
    )
  })

  it('not mergeable → null (non-array, items without a string id, bad JSON, missing side)', () => {
    expect(mergeMetadataById('{}', json(remote), 'remote')).toBeNull()
    expect(mergeMetadataById(json([{ id: 1 }]), json(remote), 'remote')).toBeNull()
    expect(mergeMetadataById(json([['g1']]), json(remote), 'remote')).toBeNull()
    expect(mergeMetadataById('not json', json(remote), 'remote')).toBeNull()
    expect(mergeMetadataById(null, json(remote), 'remote')).toBeNull()
  })

  it('empty arrays merge fine', () => {
    expect(mergeMetadataById('[]', json(remote), 'local')).toBe(json(remote))
  })

  it('only the three id-array files are mergeable', () => {
    expect(isMergeableMetadata('groups.json')).toBe(true)
    expect(isMergeableMetadata('folders.json')).toBe(true)
    expect(isMergeableMetadata('templates.json')).toBe(true)
    expect(isMergeableMetadata('note-order.json')).toBe(false)
    expect(isMergeableMetadata('ui-settings.json')).toBe(false)
    expect(isMergeableMetadata('section-colors.json')).toBe(false)
  })
})

describe('planMetadataPull', () => {
  const L = json([{ id: 'a', name: 'local' }])
  const R = json([{ id: 'b', name: 'remote' }])
  const later = { pendingUpsert: false, firstPull: false }

  it('identical content → keep', () => {
    expect(planMetadataPull('groups.json', R, R, { pendingUpsert: true, firstPull: true })).toEqual({ action: 'keep' })
  })

  it('later pulls without a pending edit: remote wins, no backup', () => {
    expect(planMetadataPull('groups.json', L, R, later)).toEqual({ action: 'write', content: R, backup: false, merged: false })
    expect(planMetadataPull('note-order.json', '{"x":1}', '{"y":2}', later)).toEqual({
      action: 'write', content: '{"y":2}', backup: false, merged: false,
    })
  })

  it('first pull: mergeable files get the union preferring remote, backed up', () => {
    expect(planMetadataPull('folders.json', L, R, { pendingUpsert: false, firstPull: true })).toEqual({
      action: 'write',
      content: json([{ id: 'b', name: 'remote' }, { id: 'a', name: 'local' }]),
      backup: true,
      merged: true,
    })
  })

  it('first pull: other files take the remote, backed up; nothing local → no backup', () => {
    expect(planMetadataPull('ui-settings.json', '{"a":1}', '{"b":2}', { pendingUpsert: false, firstPull: true })).toEqual({
      action: 'write', content: '{"b":2}', backup: true, merged: false,
    })
    expect(planMetadataPull('groups.json', null, R, { pendingUpsert: false, firstPull: true })).toEqual({
      action: 'write', content: R, backup: false, merged: false,
    })
  })

  it('first pull: an unmergeable mergeable file falls back to remote (backed up)', () => {
    expect(planMetadataPull('templates.json', 'garbage', R, { pendingUpsert: false, firstPull: true })).toEqual({
      action: 'write', content: R, backup: true, merged: false,
    })
  })

  it('pending local edit: mergeable → union preferring local; others → keep local', () => {
    expect(planMetadataPull('groups.json', L, R, { pendingUpsert: true, firstPull: false })).toEqual({
      action: 'write',
      content: json([{ id: 'a', name: 'local' }, { id: 'b', name: 'remote' }]),
      backup: false,
      merged: true,
    })
    expect(planMetadataPull('section-colors.json', '{"a":1}', '{"b":2}', { pendingUpsert: true, firstPull: false })).toEqual({
      action: 'keep',
    })
  })

  it('pending local edit already containing the remote entries → keep (the drain uploads it)', () => {
    const superset = json([{ id: 'a' }, { id: 'b' }])
    expect(planMetadataPull('groups.json', superset, json([{ id: 'b' }]), { pendingUpsert: true, firstPull: false })).toEqual({
      action: 'keep',
    })
  })
})
