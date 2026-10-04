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
  resolveRetryAction,
  shouldPullSkipDir,
  shouldPullSkipFile,
  shouldDeletionRuleSkipDir,
  shouldRunDeletionRule,
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
