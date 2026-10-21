import { describe, it, expect } from 'vitest'
import {
  type SyncState,
  emptySyncState,
  parseSyncState,
  serializeSyncState,
  journalRecord,
  journalRecordIfAbsent,
  journalComplete,
  journalFail,
  journalMarkStale,
  journalMarkDirStale,
  journalMarkDirConflictCopied,
  conflictCopyCandidates,
  planAnchorTombstone,
  resolveRetryAction,
  shouldPullSkipDir,
  shouldPullSkipFile,
  shouldDeletionRuleSkipDir,
  hasPendingUpsert,
  planRemoteDirDelete,
  planSectionRefresh,
  shouldRefreshSections,
  shouldRunDeletionRule,
  isGitHubEmptyRepoError,
  getCachedSha,
  setCachedSha,
  pruneShas,
} from '../../electron/syncState'

const NOW = '2026-07-06T10:00:00.000Z'
const LATER = '2026-07-06T11:00:00.000Z'

describe('parseSyncState (tolerant deserialization)', () => {
  it('degrades to empty state for missing/corrupt input, never throws', () => {
    const empty = emptySyncState()
    expect(parseSyncState(null)).toEqual(empty)
    expect(parseSyncState(undefined)).toEqual(empty)
    expect(parseSyncState('')).toEqual(empty)
    expect(parseSyncState('not json {{{')).toEqual(empty)
    expect(parseSyncState('42')).toEqual(empty)
    expect(parseSyncState('"a string"')).toEqual(empty)
    expect(parseSyncState('[]')).toEqual(empty)
    expect(parseSyncState('{}')).toEqual(empty)
  })

  it('drops malformed entries individually, keeps valid ones', () => {
    const raw = JSON.stringify({
      version: 1,
      ops: {
        'good-dir/note.md': { op: 'upsert', queuedAt: NOW, attempts: 2 },
        'bad-op': { op: 'explode', queuedAt: NOW, attempts: 0 },
        'not-an-object': 'nope',
        'missing-fields': { op: 'delete' },
      },
      shas: { 'a/note.md': 'abc123', bogus: 42 },
    })
    const state = parseSyncState(raw)
    expect(state.ops['good-dir/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 2 })
    expect(state.ops['bad-op']).toBeUndefined()
    expect(state.ops['not-an-object']).toBeUndefined()
    // Missing queuedAt/attempts are defaulted, not dropped — the op type is what matters.
    expect(state.ops['missing-fields'].op).toBe('delete')
    expect(state.ops['missing-fields'].attempts).toBe(0)
    expect(state.shas['a/note.md']).toBe('abc123')
    expect(state.shas['bogus']).toBeUndefined()
  })

  it('round-trips through serializeSyncState', () => {
    const state = emptySyncState()
    journalRecord(state, 'x/note.md', 'upsert', NOW)
    journalFail(state, 'x/note.md', 'upsert')
    setCachedSha(state, 'y/note.md', 'sha-y')
    expect(parseSyncState(serializeSyncState(state))).toEqual(state)
  })
})

describe('journal transitions', () => {
  it('records a new op and reports change; re-recording the same op is a no-op', () => {
    const state = emptySyncState()
    expect(journalRecord(state, 'a/note.md', 'upsert', NOW)).toBe(true)
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0 })

    journalFail(state, 'a/note.md', 'upsert')
    // Debounce re-arm: same op again keeps queuedAt and attempts, no persist needed.
    expect(journalRecord(state, 'a/note.md', 'upsert', LATER)).toBe(false)
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 1 })
  })

  it('a different op replaces the entry (delete supersedes a pending upsert)', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/sec1.md', 'upsert', NOW)
    journalFail(state, 'a/sec1.md', 'upsert')
    expect(journalRecord(state, 'a/sec1.md', 'delete', LATER)).toBe(true)
    expect(state.ops['a/sec1.md']).toEqual({ op: 'delete', queuedAt: LATER, attempts: 0 })
  })

  it('recording a deleteDir drops all file-level ops under the dir', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalRecord(state, 'a/sec1.md', 'delete', NOW)
    journalRecord(state, 'ab/note.md', 'upsert', NOW) // prefix-sibling dir must survive
    journalRecord(state, 'a', 'deleteDir', LATER)
    expect(state.ops['a/note.md']).toBeUndefined()
    expect(state.ops['a/sec1.md']).toBeUndefined()
    expect(state.ops['ab/note.md']).toBeDefined()
    expect(state.ops['a']).toEqual({ op: 'deleteDir', queuedAt: LATER, attempts: 0 })
  })

  it('complete removes the entry only when the op matches', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'delete', NOW)
    // A stale upsert completion must not clear the newer delete intent.
    expect(journalComplete(state, 'a/note.md', 'upsert')).toBe(false)
    expect(state.ops['a/note.md']).toBeDefined()
    expect(journalComplete(state, 'a/note.md', 'delete')).toBe(true)
    expect(state.ops['a/note.md']).toBeUndefined()
    expect(journalComplete(state, 'a/note.md', 'delete')).toBe(false) // already gone
  })

  it('same-op re-record does NOT create a distinct entry: a later complete removes it (retry race)', () => {
    // Documents the journal side of the retrySyncJournal race: while a retry
    // push for K is in flight, a user edit re-records the same 'upsert' — a
    // no-op that keeps the ORIGINAL entry. A journalComplete when the retry
    // lands would therefore erase the NEWER intent too. The journal cannot
    // distinguish the two, which is why githubSync.retrySyncJournal must skip
    // the completion when a debounce timer was armed mid-flight (imperative
    // pushTimers check) and why the debounced push catch re-records before
    // failing (its entry may have been completed under it).
    const state = emptySyncState()
    journalRecord(state, 'k/note.md', 'upsert', NOW) // journaled, retry starts
    expect(journalRecord(state, 'k/note.md', 'upsert', LATER)).toBe(false) // edit mid-flight
    expect(journalComplete(state, 'k/note.md', 'upsert')).toBe(true) // retry lands…
    expect(state.ops['k/note.md']).toBeUndefined() // …and the newer intent is gone with it
  })

  it('journalRecordIfAbsent creates the entry only when the key is empty', () => {
    const state = emptySyncState()
    expect(journalRecordIfAbsent(state, 'a/note.md', 'upsert', NOW)).toBe(true)
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0 })
    // Same op present → untouched (attempts keep accumulating via journalFail).
    journalFail(state, 'a/note.md', 'upsert')
    expect(journalRecordIfAbsent(state, 'a/note.md', 'upsert', LATER)).toBe(false)
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 1 })
  })

  it('journalRecordIfAbsent does NOT clobber a newer delete intent (correlated-failure race)', () => {
    // Reviewer sequence: (1) debounced upsert of section K in flight;
    // (2) user deletes K → scheduleDelete records 'delete' (replaces the upsert);
    // (3) the in-flight upsert FAILS → its catch re-journals. With plain
    // journalRecord this would REPLACE the 'delete' with 'upsert'; then
    // (4) the delete also fails (outage) → journalFail('delete') is an
    // op-mismatch no-op; (5) the journal holds {K: upsert} for a locally
    // deleted file → next retry resolves to 'discard' and the remote delete is
    // silently lost. journalRecordIfAbsent keeps the delete intent alive.
    const state = emptySyncState()
    journalRecord(state, 'k/sec1.md', 'upsert', NOW) // (1)
    journalRecord(state, 'k/sec1.md', 'delete', LATER) // (2)
    expect(journalRecordIfAbsent(state, 'k/sec1.md', 'upsert', LATER)).toBe(false) // (3)
    expect(journalFail(state, 'k/sec1.md', 'upsert')).toBe(false) // op mismatch — no-op
    expect(state.ops['k/sec1.md']).toEqual({ op: 'delete', queuedAt: LATER, attempts: 0 })
    // (5) the retry executes the delete instead of discarding a stale upsert
    expect(resolveRetryAction(state.ops['k/sec1.md'].op, false)).toBe('delete')
  })

  it('fail increments attempts and keeps the entry — never drops it', () => {
    const state = emptySyncState()
    journalRecord(state, 'a', 'deleteDir', NOW)
    for (let i = 0; i < 100; i++) expect(journalFail(state, 'a', 'deleteDir')).toBe(true)
    expect(state.ops['a']).toEqual({ op: 'deleteDir', queuedAt: NOW, attempts: 100 })
    expect(journalFail(state, 'a', 'delete')).toBe(false) // op mismatch — no-op
    expect(journalFail(state, 'missing', 'upsert')).toBe(false)
  })
})

describe('resolveRetryAction', () => {
  it('discards an upsert whose local file no longer exists', () => {
    expect(resolveRetryAction('upsert', false)).toBe('discard')
    expect(resolveRetryAction('upsert', true)).toBe('upsert')
  })

  it('always executes deletes regardless of local file existence', () => {
    expect(resolveRetryAction('delete', false)).toBe('delete')
    expect(resolveRetryAction('delete', true)).toBe('delete')
    expect(resolveRetryAction('deleteDir', false)).toBe('deleteDir')
    expect(resolveRetryAction('deleteDir', true)).toBe('deleteDir')
  })
})

describe('pull decisions', () => {
  it('shouldPullSkipDir: only a pending deleteDir for that dir skips it', () => {
    const state = emptySyncState()
    journalRecord(state, 'gone', 'deleteDir', NOW)
    journalRecord(state, 'edited/note.md', 'upsert', NOW)
    expect(shouldPullSkipDir(state, 'gone')).toBe(true)
    expect(shouldPullSkipDir(state, 'edited')).toBe(false)
    expect(shouldPullSkipDir(state, 'other')).toBe(false)
  })

  it('shouldPullSkipFile: only a pending delete for that file skips it', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/sec1.md', 'delete', NOW)
    journalRecord(state, 'a/sec2.md', 'upsert', NOW)
    expect(shouldPullSkipFile(state, 'a/sec1.md')).toBe(true)
    expect(shouldPullSkipFile(state, 'a/sec2.md')).toBe(false)
    expect(shouldPullSkipFile(state, 'a/other.md')).toBe(false)
  })

  it('shouldDeletionRuleSkipDir: a pending upsert under the dir protects it from local deletion', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalRecord(state, 'b/sec1.md', 'delete', NOW) // deletes don't protect
    journalRecord(state, 'groups.json', 'upsert', NOW) // root metadata protects no dir
    expect(shouldDeletionRuleSkipDir(state, 'a')).toBe(true)
    expect(shouldDeletionRuleSkipDir(state, 'b')).toBe(false)
    expect(shouldDeletionRuleSkipDir(state, 'groups.json')).toBe(false)
    // Prefix-sibling dir must not be protected by 'a/...' upserts
    expect(shouldDeletionRuleSkipDir(state, 'ab')).toBe(false)
  })

  it('an upsert satisfied without pushing (mirror: remote already identical) stops protecting the dir', () => {
    // The mirror cancels pending debounce timers, so their journaled upserts
    // must be completed even for files it did NOT upload (byte-identical on the
    // remote). Left behind, they would disarm the pull's deletion rule for that
    // note dir forever — see the `unchanged` loop in mirrorToGitHub.
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    expect(shouldDeletionRuleSkipDir(state, 'a')).toBe(true)
    expect(journalComplete(state, 'a/note.md', 'upsert')).toBe(true)
    expect(shouldDeletionRuleSkipDir(state, 'a')).toBe(false)
  })
})

describe('hasPendingUpsert (remote deletion vs unpushed local edit)', () => {
  it('true only for a pending upsert of exactly that file', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/sec1.md', 'upsert', NOW)
    journalRecord(state, 'a/sec2.md', 'delete', NOW)
    expect(hasPendingUpsert(state, 'a/sec1.md')).toBe(true)
    expect(hasPendingUpsert(state, 'a/sec2.md')).toBe(false) // a delete is not an edit
    expect(hasPendingUpsert(state, 'a/other.md')).toBe(false)
    expect(hasPendingUpsert(state, 'a')).toBe(false) // file-level, not a prefix check
  })

  it('stops once the upsert lands, and a newer delete intent supersedes it', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/sec1.md', 'upsert', NOW)
    journalComplete(state, 'a/sec1.md', 'upsert')
    expect(hasPendingUpsert(state, 'a/sec1.md')).toBe(false)
    journalRecord(state, 'a/sec1.md', 'upsert', NOW)
    journalRecord(state, 'a', 'deleteDir', LATER) // deleting the note drops its file ops
    expect(hasPendingUpsert(state, 'a/sec1.md')).toBe(false)
  })
})

// Cloud anchor tombstone (B): a failed push of N stays journaled while a push
// of ANOTHER note moves lastSync past N's `updated` — the time rule alone would
// delete N. The dir guard is what keeps it (same guard as the GitHub pull).
describe('Cloud tombstone guard: pending upsert under the dir (debounce window included)', () => {
  it('a journaled upsert from timer-arming time protects the whole note', () => {
    const state = emptySyncState()
    journalRecord(state, 'n/sec1.md', 'upsert', NOW) // armed, not fired yet
    expect(shouldDeletionRuleSkipDir(state, 'n')).toBe(true)
    journalComplete(state, 'n/sec1.md', 'upsert') // landed
    expect(shouldDeletionRuleSkipDir(state, 'n')).toBe(false)
  })
})

describe('shouldRefreshSections (GitHub same-version section refresh)', () => {
  it('only when GitHub is not a stale mirror', () => {
    expect(shouldRefreshSections(false, false)).toBe(true)
    expect(shouldRefreshSections(false, true)).toBe(false) // Cloud enabled: write-only mirror
    expect(shouldRefreshSections(true, false)).toBe(false) // first pull after Cloud was switched off
    expect(shouldRefreshSections(true, true)).toBe(false)
  })
})

describe('planRemoteDirDelete (GitHub deleteRemoteDirNow)', () => {
  const blobs = [
    { path: 'a/note.md', sha: '1' },
    { path: 'a/s1.md', sha: '2' },
    { path: 'ab/note.md', sha: '3' }, // prefix sibling
    { path: 'groups.json', sha: '4' },
  ]

  it('targets every blob under <dir>/ only', () => {
    expect(planRemoteDirDelete(blobs, false, 'a').map((b) => b.path)).toEqual(['a/note.md', 'a/s1.md'])
    expect(planRemoteDirDelete(blobs, false, 'missing')).toEqual([])
  })

  it('throws on a truncated listing so the deleteDir stays journaled (nothing half-deleted)', () => {
    expect(() => planRemoteDirDelete(blobs, true, 'a')).toThrow(/truncated/)
  })
})

describe('planSectionRefresh (GitHub pull: sections pushed after their anchor)', () => {
  const ALLOWED = { refreshAllowed: true, isListedLocally: () => true }
  const sections = [
    { path: 'n/s1.md', sha: 'remote-1' },
    { path: 'n/s2.md', sha: 'remote-2' },
  ]

  it('steady state: every section sha reconciled → nothing to do, no disk read', () => {
    const state = emptySyncState()
    setCachedSha(state, 'n/s1.md', 'remote-1')
    setCachedSha(state, 'n/s2.md', 'remote-2')
    const reads: string[] = []
    const plan = planSectionRefresh(state, sections, (rel) => { reads.push(rel); return null }, ALLOWED)
    expect(plan).toEqual({ adopt: [], changed: [] })
    expect(reads).toEqual([])
  })

  it('the bug: anchor cached, a section blob changed later → changed', () => {
    const state = emptySyncState()
    setCachedSha(state, 'n/s1.md', 'remote-1')
    setCachedSha(state, 'n/s2.md', 'old-2') // reconciled before the second commit landed
    const plan = planSectionRefresh(state, sections, () => 'old-2', ALLOWED)
    expect(plan.changed).toEqual([{ path: 'n/s2.md', sha: 'remote-2' }])
    expect(plan.adopt).toEqual([])
  })

  it('a section new to this device (missing locally, not cached) → changed', () => {
    const plan = planSectionRefresh(emptySyncState(), [{ path: 'n/s3.md', sha: 'x' }], () => null, ALLOWED)
    expect(plan.changed).toEqual([{ path: 'n/s3.md', sha: 'x' }])
  })

  it('local file already identical (own push / cache from an older build) → adopt, zero requests', () => {
    const plan = planSectionRefresh(emptySyncState(), sections, (rel) => (rel === 'n/s1.md' ? 'remote-1' : 'local-2'), ALLOWED)
    expect(plan.adopt).toEqual([{ path: 'n/s1.md', sha: 'remote-1' }])
    expect(plan.changed).toEqual([{ path: 'n/s2.md', sha: 'remote-2' }])
  })

  it('stale mirror (Cloud on / full reconcile pending): nothing is changed, only identical files are adopted', () => {
    // Cloud brought X' (same anchor version) while GitHub still holds old X:
    // refreshing would write X over X' and the catch-up would drop X'.
    const state = emptySyncState()
    const plan = planSectionRefresh(state, sections, (rel) => (rel === 'n/s1.md' ? 'remote-1' : 'X-prime'), {
      refreshAllowed: false,
      isListedLocally: () => true,
    })
    expect(plan).toEqual({ adopt: [{ path: 'n/s1.md', sha: 'remote-1' }], changed: [] })
    expect(state.shas['n/s2.md']).toBeUndefined() // the planner never caches; the caller won't either
  })

  it('sections the LOCAL anchor does not list are never changed (v1→v2 migration on two devices)', () => {
    // Same legacy note migrated on A and B: same `updated`, different random
    // section ids — B's files must not land on A as orphans.
    const remote = [
      { path: 'n/abc123.md', sha: 'b-1' }, // B's id
      { path: 'n/s1.md', sha: 'remote-1' },
    ]
    const plan = planSectionRefresh(emptySyncState(), remote, () => null, {
      refreshAllowed: true,
      isListedLocally: (rel) => rel === 'n/s1.md',
    })
    expect(plan.changed).toEqual([{ path: 'n/s1.md', sha: 'remote-1' }])
    expect(plan.adopt).toEqual([])
  })

  it('journal guards: a pending upsert (unpushed edit) or pending delete is left alone', () => {
    const state = emptySyncState()
    journalRecord(state, 'n/s1.md', 'upsert', NOW)
    journalRecord(state, 'n/s2.md', 'delete', NOW)
    expect(planSectionRefresh(state, sections, () => null, ALLOWED)).toEqual({ adopt: [], changed: [] })
  })
})

describe('shouldRunDeletionRule', () => {
  const LAST_SYNC = Date.parse('2026-07-06T09:00:00.000Z')

  it('runs the rule in the normal case: lastSync known, remote on v2, Cloud off, no reconcile pending', () => {
    expect(shouldRunDeletionRule(LAST_SYNC, false, false, true, false)).toBe(true)
  })

  it('never runs while NoteFlow Cloud is enabled (GitHub is a paused, write-only mirror)', () => {
    // The data-loss case: lastSync is old and the remote is a healthy v2 repo,
    // but it never received the notes that arrived through Cloud. Holds with the
    // one-shot flag already consumed — that is the second manual pull.
    expect(shouldRunDeletionRule(LAST_SYNC, false, true, true, false)).toBe(false)
  })

  it('never runs right after Cloud is switched off: disableCloudSync re-arms the reconcile flag', () => {
    // The Cloud→off transition is the other loss path: GitHub resumes with a
    // lastSync it can't trust (notes that arrived via Cloud with an OLDER
    // `updated` were never uploaded). disableCloudSync() marks the flag, so this
    // pull — Cloud already false, lastSync valid, remote a healthy v2 — must not
    // delete. (The marking itself lives in cloudSync.enableCloudSync/
    // disableCloudSync and needs Electron, so only the decision is unit-tested.)
    expect(shouldRunDeletionRule(LAST_SYNC, true, false, true, false)).toBe(false)
    expect(shouldRunDeletionRule(null, true, true, true, false)).toBe(false)
    expect(shouldRunDeletionRule(LAST_SYNC, true, true, false, false)).toBe(false)
  })

  it('never runs without a lastSync (nothing can be assumed deleted remotely)', () => {
    expect(shouldRunDeletionRule(null, false, false, true, false)).toBe(false)
  })

  it('never runs with an unparseable lastSync (NaN would delete everything missing)', () => {
    expect(shouldRunDeletionRule(Number.NaN, false, false, true, false)).toBe(false)
  })

  it('never runs while the remote is not fully on format v2 (additive-only pull)', () => {
    expect(shouldRunDeletionRule(LAST_SYNC, false, false, false, false)).toBe(false)
  })

  it('never runs when GitHub truncated the tree listing (absent from listing ≠ absent from remote)', () => {
    expect(shouldRunDeletionRule(LAST_SYNC, false, false, true, true)).toBe(false)
  })
})

describe('reconciled-SHA cache', () => {
  it('get/set hit and miss, set reports whether anything changed', () => {
    const state = emptySyncState()
    expect(getCachedSha(state, 'a/note.md')).toBeUndefined() // miss
    expect(setCachedSha(state, 'a/note.md', 'sha1')).toBe(true)
    expect(getCachedSha(state, 'a/note.md')).toBe('sha1') // hit
    expect(setCachedSha(state, 'a/note.md', 'sha1')).toBe(false) // unchanged
    expect(setCachedSha(state, 'a/note.md', 'sha2')).toBe(true) // remote moved
    expect(getCachedSha(state, 'a/note.md')).toBe('sha2')
  })

  it('pruneShas drops entries absent from the remote tree and keeps the rest', () => {
    const state = emptySyncState()
    setCachedSha(state, 'a/note.md', 'sha-a')
    setCachedSha(state, 'b/note.md', 'sha-b')
    setCachedSha(state, 'groups.json', 'sha-g')
    expect(pruneShas(state, new Set(['a/note.md', 'groups.json']))).toBe(true)
    expect(state.shas).toEqual({ 'a/note.md': 'sha-a', 'groups.json': 'sha-g' })
    expect(pruneShas(state, new Set(['a/note.md', 'groups.json']))).toBe(false)
  })

  it('pruning does not touch the journal ops', () => {
    const state: SyncState = emptySyncState()
    journalRecord(state, 'a', 'deleteDir', NOW)
    setCachedSha(state, 'a/note.md', 'sha-a')
    pruneShas(state, new Set<string>())
    expect(state.ops['a']).toBeDefined()
    expect(state.shas).toEqual({})
  })
})

describe('Cloud upsert flags: stale (conditional upload rejected) and force (resurrection)', () => {
  it('parse/serialize preserve force on upserts only and stale on upserts + deletes (GitHub), in their exact `true` form', () => {
    const raw = JSON.stringify({
      version: 1,
      ops: {
        'a/note.md': { op: 'upsert', queuedAt: NOW, attempts: 0, stale: true },
        'b/note.md': { op: 'upsert', queuedAt: NOW, attempts: 2, force: true },
        'c/note.md': { op: 'upsert', queuedAt: NOW, attempts: 0, stale: 'yes', force: 1 },
        'd/sec.md': { op: 'delete', queuedAt: NOW, attempts: 0, stale: true, force: true },
        e: { op: 'deleteDir', queuedAt: NOW, attempts: 0, stale: true },
      },
      shas: {},
    })
    const state = parseSyncState(raw)
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0, stale: true })
    expect(state.ops['b/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 2, force: true })
    expect(state.ops['c/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0 })
    // A GitHub section delete held back by the three-way check keeps `stale`; never `force`.
    expect(state.ops['d/sec.md']).toEqual({ op: 'delete', queuedAt: NOW, attempts: 0, stale: true })
    expect(state.ops['e']).toEqual({ op: 'deleteDir', queuedAt: NOW, attempts: 0 })
    expect(parseSyncState(serializeSyncState(state))).toEqual(state)
  })

  it('journalMarkStale flags an existing upsert once and never re-creates a completed one', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    expect(journalMarkStale(state, 'a/note.md')).toBe(true)
    expect(journalMarkStale(state, 'a/note.md')).toBe(false)
    expect(state.ops['a/note.md'].stale).toBe(true)
    // The pull completed it while the upload was in flight → nothing to flag.
    journalComplete(state, 'a/note.md', 'upsert')
    expect(journalMarkStale(state, 'a/note.md')).toBe(false)
    expect(state.ops['a/note.md']).toBeUndefined()
    // Never on a different op.
    journalRecord(state, 'a/sec.md', 'delete', NOW)
    expect(journalMarkStale(state, 'a/sec.md')).toBe(false)
  })

  it('a stale upsert still counts as pending for the deletion guards', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/sec.md', 'upsert', NOW)
    journalMarkStale(state, 'a/sec.md')
    expect(hasPendingUpsert(state, 'a/sec.md')).toBe(true)
    expect(shouldDeletionRuleSkipDir(state, 'a')).toBe(true)
  })

  it('re-recording an upsert clears stale (new local edit) and keeps attempts/queuedAt', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalFail(state, 'a/note.md', 'upsert')
    journalMarkStale(state, 'a/note.md')
    expect(journalRecord(state, 'a/note.md', 'upsert', LATER)).toBe(true)
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 1 })
  })

  it('force is added on request and survives later non-forced records and failures', () => {
    const state = emptySyncState()
    expect(journalRecord(state, 'a/note.md', 'upsert', NOW, { force: true })).toBe(true)
    expect(state.ops['a/note.md'].force).toBe(true)
    expect(journalRecord(state, 'a/note.md', 'upsert', LATER)).toBe(false)
    journalFail(state, 'a/note.md', 'upsert')
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 1, force: true })
    // Forcing an existing plain upsert (live debounce timer) flags it in place.
    journalRecord(state, 'b/note.md', 'upsert', NOW)
    expect(journalRecord(state, 'b/note.md', 'upsert', LATER, { force: true })).toBe(true)
    expect(state.ops['b/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0, force: true })
  })

  it('force only applies to upserts; a delete replacing a forced upsert drops the flag', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/sec.md', 'delete', NOW, { force: true })
    expect(state.ops['a/sec.md']).toEqual({ op: 'delete', queuedAt: NOW, attempts: 0 })
    journalRecord(state, 'b/sec.md', 'upsert', NOW, { force: true })
    journalRecord(state, 'b/sec.md', 'delete', LATER)
    expect(state.ops['b/sec.md']).toEqual({ op: 'delete', queuedAt: LATER, attempts: 0 })
  })

  it('journalRecordIfAbsent passes force through when it creates the entry', () => {
    const state = emptySyncState()
    expect(journalRecordIfAbsent(state, 'a/note.md', 'upsert', NOW, { force: true })).toBe(true)
    expect(state.ops['a/note.md'].force).toBe(true)
  })
})

describe('journalMarkDirStale (wholesale apply of a newer remote folder)', () => {
  it('flags every pending upsert under the dir (forced ones too), nothing else', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalRecord(state, 'a/s1.md', 'upsert', NOW, { force: true })
    journalRecord(state, 'a/s2.md', 'delete', NOW)
    journalRecord(state, 'ab/note.md', 'upsert', NOW)
    expect(journalMarkDirStale(state, 'a')).toBe(true)
    expect(state.ops['a/note.md'].stale).toBe(true)
    expect(state.ops['a/s1.md'].stale).toBe(true)
    expect(state.ops['a/s2.md']).toEqual({ op: 'delete', queuedAt: NOW, attempts: 0 })
    expect(state.ops['ab/note.md'].stale).toBeUndefined()
    expect(journalMarkDirStale(state, 'a')).toBe(false) // already flagged
  })
})

describe('planAnchorTombstone (remote deletion of a folder that exists locally)', () => {
  const T_DELETED = Date.parse('2026-07-06T10:30:00.000Z')
  const allStale = () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalRecord(state, 'a/s1.md', 'upsert', NOW)
    journalMarkDirStale(state, 'a')
    return state
  }

  it('nothing pending → none (usual deletion rule)', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/s1.md', 'delete', NOW)
    journalRecord(state, 'ab/note.md', 'upsert', NOW)
    expect(planAnchorTombstone(state, 'a', T_DELETED - 1, T_DELETED)).toBe('none')
  })

  it('a non-stale pending upsert → keep (forced resurrection)', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalRecord(state, 'a/s1.md', 'upsert', NOW)
    journalMarkStale(state, 'a/s1.md')
    expect(planAnchorTombstone(state, 'a', T_DELETED - 1, T_DELETED)).toBe('keep')
  })

  it('every pending upsert stale + local not newer than the deletion → lost', () => {
    expect(planAnchorTombstone(allStale(), 'a', T_DELETED - 60_000, T_DELETED)).toBe('lost')
    expect(planAnchorTombstone(allStale(), 'a', T_DELETED, T_DELETED)).toBe('lost') // equal
  })

  it('every pending upsert stale but the local note is newer than the deletion → keep (unjournaled edit)', () => {
    // Edited while the push gate was closed (keys locked, before the first pull)
    // or by the CLI: the journal never saw it, the local `updated` did.
    expect(planAnchorTombstone(allStale(), 'a', T_DELETED + 1, T_DELETED)).toBe('keep')
  })

  it('every pending upsert stale but the local `updated` is unknown → keep (never delete blind)', () => {
    expect(planAnchorTombstone(allStale(), 'a', null, T_DELETED)).toBe('keep')
  })
})

describe('conflictCopied (Cloud pull kept the local version as a conflict copy)', () => {
  it('journalMarkDirConflictCopied flags every pending upsert under the dir (stale or not), nothing else', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalRecord(state, 'a/s1.md', 'upsert', NOW)
    journalMarkStale(state, 'a/s1.md')
    journalRecord(state, 'a/s2.md', 'delete', NOW)
    journalRecord(state, 'ab/note.md', 'upsert', NOW)
    expect(conflictCopyCandidates(state, 'a').sort()).toEqual(['a/note.md', 'a/s1.md'])
    expect(journalMarkDirConflictCopied(state, 'a')).toBe(true)
    expect(state.ops['a/note.md'].conflictCopied).toBe(true)
    expect(state.ops['a/s1.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0, stale: true, conflictCopied: true })
    expect(state.ops['a/s2.md']).toEqual({ op: 'delete', queuedAt: NOW, attempts: 0 })
    expect(state.ops['ab/note.md'].conflictCopied).toBeUndefined()
    expect(journalMarkDirConflictCopied(state, 'a')).toBe(false) // already flagged
    // Already copied → no candidates left: a retried apply makes no second copy.
    expect(conflictCopyCandidates(state, 'a')).toEqual([])
    expect(conflictCopyCandidates(state, 'ab')).toEqual(['ab/note.md'])
  })

  it('flagged ops still count as pending for the deletion guards', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalMarkDirConflictCopied(state, 'a')
    expect(hasPendingUpsert(state, 'a/note.md')).toBe(true)
    expect(shouldDeletionRuleSkipDir(state, 'a')).toBe(true)
  })

  it('re-recording an upsert (new local edit) clears the flag', () => {
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalMarkDirStale(state, 'a')
    journalMarkDirConflictCopied(state, 'a')
    expect(journalRecord(state, 'a/note.md', 'upsert', LATER)).toBe(true)
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0 })
    expect(conflictCopyCandidates(state, 'a')).toEqual(['a/note.md'])
  })

  it('parse/serialize keep the flag on upserts only, in its exact `true` form', () => {
    const raw = JSON.stringify({
      version: 1,
      ops: {
        'a/note.md': { op: 'upsert', queuedAt: NOW, attempts: 0, stale: true, conflictCopied: true },
        'b/note.md': { op: 'upsert', queuedAt: NOW, attempts: 0, conflictCopied: 'yes' },
        'c/sec.md': { op: 'delete', queuedAt: NOW, attempts: 0, conflictCopied: true },
      },
      shas: {},
    })
    const state = parseSyncState(raw)
    expect(state.ops['a/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0, stale: true, conflictCopied: true })
    expect(state.ops['b/note.md']).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0 })
    expect(state.ops['c/sec.md']).toEqual({ op: 'delete', queuedAt: NOW, attempts: 0 })
    expect(parseSyncState(serializeSyncState(state))).toEqual(state)
  })

  it('planAnchorTombstone is unaffected by the flag (keep / lost semantics unchanged)', () => {
    const T_DELETED = Date.parse('2026-07-06T10:30:00.000Z')
    const state = emptySyncState()
    journalRecord(state, 'a/note.md', 'upsert', NOW)
    journalMarkDirConflictCopied(state, 'a')
    expect(planAnchorTombstone(state, 'a', T_DELETED - 1, T_DELETED)).toBe('keep')
    journalMarkDirStale(state, 'a')
    expect(planAnchorTombstone(state, 'a', T_DELETED - 1, T_DELETED)).toBe('lost')
  })
})

describe('isGitHubEmptyRepoError', () => {
  it('recognises GitHub answers for a repo with no commits yet', () => {
    expect(isGitHubEmptyRepoError(409, 'Git Repository is empty.')).toBe(true) // Git Trees API
    expect(isGitHubEmptyRepoError(404, 'This repository is empty.')).toBe(true) // Contents API
  })

  it('keeps every other error an error', () => {
    expect(isGitHubEmptyRepoError(409, 'is at abc123 but expected def456')).toBe(false) // write conflict
    expect(isGitHubEmptyRepoError(404, 'Not Found')).toBe(false)
    expect(isGitHubEmptyRepoError(500, 'Git Repository is empty.')).toBe(false)
    expect(isGitHubEmptyRepoError(undefined, 'Git Repository is empty.')).toBe(false)
  })

  it('an empty listing never triggers the deletion rule (no v2 marker)', () => {
    // pullNotes derives remoteIsV2 from the marker blob, absent in an empty repo.
    expect(shouldRunDeletionRule(Date.now(), false, false, false, false)).toBe(false)
  })
})
