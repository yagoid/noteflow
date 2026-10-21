// QA B3 — GitHub Sync used to upload unconditionally: the Contents API `sha` is
// only a concurrency token, so a push queued (or drained from the journal)
// after another device changed the same file overwrote that change everywhere.
// These pin the pure three-way decisions of electron/syncState.ts (base = the
// reconciled-SHA cache, remote = GitHub now, local = this device's content).
// The end-to-end flow through githubSync.ts is in githubConditionalSync.test.ts.
import { describe, it, expect } from 'vitest'
import {
  emptySyncState,
  journalRecord,
  journalMarkStale,
  journalMarkDirConflictCopied,
  journalCompleteDir,
  journalClearStale,
  hasStaleOpUnder,
  dropCachedShasUnder,
  isNoteFilePath,
  isThreeWayConflict,
  planConditionalUpsert,
  planConditionalDelete,
  remoteDirChangesSinceBase,
  planGithubDirConflict,
  shouldRefreshSections,
} from '../../electron/syncState'

const NOW = '2026-10-21T10:00:00.000Z'
const DIR = 'groceries-abc12345'

describe('planConditionalUpsert (push of one note file)', () => {
  it('B3 repro: the remote moved since this device saw it and the local content differs → conflict (no PUT)', () => {
    // base R0 (last pull), another device uploaded R1, this device pushes L1.
    expect(planConditionalUpsert('R0', 'R1', 'L1')).toBe('conflict')
  })

  it('re-sending the BASE content over a newer remote is a conflict too (it would revert the remote edit)', () => {
    expect(planConditionalUpsert('R0', 'R1', 'R0')).toBe('conflict')
  })

  it('own push race: the remote already holds exactly this content → identical (no PUT, no commit)', () => {
    expect(planConditionalUpsert('R0', 'L1', 'L1')).toBe('identical')
    expect(planConditionalUpsert(undefined, 'L1', 'L1')).toBe('identical')
  })

  it('remote still at the base → put', () => {
    expect(planConditionalUpsert('R0', 'R0', 'L1')).toBe('put')
  })

  it('unknown base (cache lost, pre-upgrade, first connect) → historical put, never a spurious conflict', () => {
    expect(planConditionalUpsert(undefined, 'R1', 'L1')).toBe('put')
  })

  it('absent remotely → put (create; a local edit beats a remote deletion, even with a known base)', () => {
    expect(planConditionalUpsert(undefined, null, 'L1')).toBe('put')
    expect(planConditionalUpsert('R0', null, 'L1')).toBe('put')
  })
})

describe('planConditionalDelete (dropped section)', () => {
  it('remote changed since the base → conflict (the remote edit would vanish)', () => {
    expect(planConditionalDelete('R0', 'R1')).toBe('conflict')
  })

  it('remote still at the base, or unknown base → delete', () => {
    expect(planConditionalDelete('R0', 'R0')).toBe('delete')
    expect(planConditionalDelete(undefined, 'R1')).toBe('delete')
  })

  it('nothing on the remote → gone', () => {
    expect(planConditionalDelete('R0', null)).toBe('gone')
    expect(planConditionalDelete(undefined, null)).toBe('gone')
  })
})

describe('remoteDirChangesSinceBase (deleteDir aborts before deleting anything)', () => {
  const state = emptySyncState()
  state.shas[`${DIR}/note.md`] = 'A0'
  state.shas[`${DIR}/s1.md`] = 'S0'

  it('lists the blobs whose tree sha moved away from a known base', () => {
    const blobs = [
      { path: `${DIR}/note.md`, sha: 'A1' },
      { path: `${DIR}/s1.md`, sha: 'S0' },
      { path: `${DIR}/s2.md`, sha: 'X' }, // unknown base → not a change
    ]
    expect(remoteDirChangesSinceBase(state, blobs)).toEqual([`${DIR}/note.md`])
  })

  it('nothing changed → empty (the deletion proceeds)', () => {
    expect(remoteDirChangesSinceBase(state, [{ path: `${DIR}/note.md`, sha: 'A0' }])).toEqual([])
  })

  it('ignores the paths this device itself mutated after the listing', () => {
    const blobs = [{ path: `${DIR}/note.md`, sha: 'A1' }]
    expect(remoteDirChangesSinceBase(state, blobs, (p) => p === `${DIR}/note.md`)).toEqual([])
  })
})

describe('isThreeWayConflict', () => {
  it('B defined && R !== B && L !== B && L !== R', () => {
    expect(isThreeWayConflict({ base: 'B', remote: 'R', local: 'L' })).toBe(true)
    expect(isThreeWayConflict({ base: 'B', remote: 'R', local: 'B' })).toBe(false) // local unchanged
    expect(isThreeWayConflict({ base: 'B', remote: 'B', local: 'L' })).toBe(false) // remote unchanged
    expect(isThreeWayConflict({ base: 'B', remote: 'X', local: 'X' })).toBe(false) // same change both sides
    expect(isThreeWayConflict({ base: undefined, remote: 'R', local: 'L' })).toBe(false) // unknown base
  })

  it('absent sides count as a value (null): remote deleted while edited locally, or deleted locally while edited remotely', () => {
    expect(isThreeWayConflict({ base: 'B', remote: null, local: 'L' })).toBe(true)
    expect(isThreeWayConflict({ base: 'B', remote: 'R', local: null })).toBe(true)
    expect(isThreeWayConflict({ base: 'B', remote: null, local: null })).toBe(false)
  })
})

describe('planGithubDirConflict (pull, per remote note folder)', () => {
  const files = (anchor: [string | undefined, string | null, string | null], s1: [string | undefined, string | null, string | null]) => [
    { path: `${DIR}/note.md`, base: anchor[0], remote: anchor[1], local: anchor[2] },
    { path: `${DIR}/s1.md`, base: s1[0], remote: s1[1], local: s1[2] },
  ]

  it('without any journal entry (e.g. a CLI edit with the app closed): three-way conflict → conflict path, local changes are the copy candidates', () => {
    const state = emptySyncState()
    const plan = planGithubDirConflict(state, DIR, files(['A0', 'A1', 'A2'], ['S0', 'S1', 'S2']))
    expect(plan).toEqual({ conflict: true, fastForward: false, copyCandidates: [`${DIR}/note.md`, `${DIR}/s1.md`] })
  })

  it('the "local strictly newer" pull of B3: anchor edited on both sides, a section only remotely → conflict', () => {
    const plan = planGithubDirConflict(emptySyncState(), DIR, files(['A0', 'A1', 'A2'], ['S0', 'S1', 'S0']))
    expect(plan.conflict).toBe(true)
    expect(plan.copyCandidates).toEqual([`${DIR}/note.md`]) // s1 unchanged locally
  })

  it('only the remote changed → no conflict but a FAST-FORWARD (applied whatever `updated:` says, no copy)', () => {
    expect(planGithubDirConflict(emptySyncState(), DIR, files(['A0', 'A1', 'A0'], ['S0', 'S1', 'S0']))).toEqual({
      conflict: false,
      fastForward: true,
      copyCandidates: [],
    })
    // Remote renamed only the anchor (e.g. web-UI edit keeping `updated`): still a fast-forward.
    expect(planGithubDirConflict(emptySyncState(), DIR, files(['A0', 'A1', 'A0'], ['S0', 'S0', 'S0'])).fastForward).toBe(true)
    // A section deleted remotely while untouched locally, or added remotely (no base, absent locally).
    expect(planGithubDirConflict(emptySyncState(), DIR, files(['A0', 'A1', 'A0'], ['S0', null, 'S0'])).fastForward).toBe(true)
    expect(planGithubDirConflict(emptySyncState(), DIR, files(['A0', 'A1', 'A0'], [undefined, 'S9', null])).fastForward).toBe(true)
  })

  it('no fast-forward when nothing moved, when local diverges with an unknown base, or with the same change on both sides', () => {
    expect(planGithubDirConflict(emptySyncState(), DIR, files(['A0', 'A0', 'A0'], ['S0', 'S0', 'S0'])).fastForward).toBe(false)
    // A local section never pushed (no base, differs) keeps the historical flow.
    expect(planGithubDirConflict(emptySyncState(), DIR, files(['A0', 'A1', 'A0'], [undefined, null, 'N'])).fastForward).toBe(false)
    // Local already equal to the remote: nothing to apply (the gate adopts it as the base).
    expect(planGithubDirConflict(emptySyncState(), DIR, files(['A0', 'A1', 'A1'], ['S0', 'S0', 'S0'])).fastForward).toBe(false)
  })

  it('unknown bases → neither conflict nor fast-forward (historical behaviour)', () => {
    const plan = planGithubDirConflict(emptySyncState(), DIR, files([undefined, 'A1', 'A2'], [undefined, 'S1', 'S2']))
    expect(plan.conflict).toBe(false)
    expect(plan.fastForward).toBe(false)
    expect(planGithubDirConflict(emptySyncState(), DIR, files([undefined, 'A1', 'A0'], [undefined, 'S1', 'S0'])).fastForward).toBe(false)
  })

  it('a stale op under the folder forces the conflict path (the push already found the remote moved)', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/s1.md`, 'upsert', NOW)
    journalMarkStale(state, `${DIR}/s1.md`)
    const plan = planGithubDirConflict(state, DIR, files(['A0', 'A0', 'A0'], ['S0', 'S1', 'S2']))
    expect(plan.conflict).toBe(true)
    // A stale section DELETE too (its file is gone locally → not a copy candidate).
    const state2 = emptySyncState()
    journalRecord(state2, `${DIR}/s1.md`, 'delete', NOW)
    journalMarkStale(state2, `${DIR}/s1.md`, 'delete')
    const plan2 = planGithubDirConflict(state2, DIR, files(['A0', 'A1', 'A2'], ['S0', 'S1', null]))
    expect(plan2).toEqual({ conflict: true, fastForward: false, copyCandidates: [`${DIR}/note.md`] })
  })

  it('dedupe: an op already flagged conflictCopied (half-failed apply retried) → conflict path but no second copy', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/s1.md`, 'upsert', NOW)
    journalMarkStale(state, `${DIR}/s1.md`)
    journalMarkDirConflictCopied(state, DIR)
    expect(planGithubDirConflict(state, DIR, files(['A0', 'A1', 'A2'], ['S0', 'S1', 'S2']))).toEqual({
      conflict: true,
      fastForward: false,
      copyCandidates: [],
    })
  })

  it('dedupe is per op: a newer pending upsert WITHOUT the flag (an edit after the copy) brings the copy back', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/s1.md`, 'upsert', NOW)
    journalMarkStale(state, `${DIR}/s1.md`)
    journalMarkDirConflictCopied(state, DIR)
    journalRecord(state, `${DIR}/s2.md`, 'upsert', NOW) // edited after the half-failed apply
    const plan = planGithubDirConflict(state, DIR, [
      { path: `${DIR}/note.md`, base: 'A0', remote: 'A1', local: 'A2' },
      { path: `${DIR}/s1.md`, base: 'S0', remote: 'S1', local: 'S2' },
      { path: `${DIR}/s2.md`, base: 'T0', remote: 'T0', local: 'T9' },
    ])
    expect(plan.conflict).toBe(true)
    expect(plan.copyCandidates).toEqual([`${DIR}/note.md`, `${DIR}/s1.md`, `${DIR}/s2.md`])
  })

  it('a local file with an unknown base is a candidate (compared with the remote content by planConflictCopy)', () => {
    const plan = planGithubDirConflict(emptySyncState(), DIR, [
      { path: `${DIR}/note.md`, base: 'A0', remote: 'A1', local: 'A2' },
      { path: `${DIR}/new.md`, base: undefined, remote: null, local: 'N' },
    ])
    expect(plan.copyCandidates).toEqual([`${DIR}/note.md`, `${DIR}/new.md`])
  })
})

describe('stale-mirror mode keeps the historical behaviour', () => {
  it('the conflict path is gated like the section refresh: off with Cloud enabled or a full reconcile pending', () => {
    // githubSync.pullNotes: conflictsAllowed = shouldRefreshSections(...)
    expect(shouldRefreshSections(false, false)).toBe(true)
    expect(shouldRefreshSections(false, true)).toBe(false)
    expect(shouldRefreshSections(true, false)).toBe(false)
  })
})

describe('journal helpers of the GitHub conflict path', () => {
  it('journalMarkStale flags a GitHub section delete; the Cloud default (upsert) never touches a delete', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/s1.md`, 'delete', NOW)
    expect(journalMarkStale(state, `${DIR}/s1.md`)).toBe(false) // Cloud's call: upsert only
    expect(state.ops[`${DIR}/s1.md`].stale).toBeUndefined()
    expect(journalMarkStale(state, `${DIR}/s1.md`, 'delete')).toBe(true)
    expect(state.ops[`${DIR}/s1.md`].stale).toBe(true)
    expect(journalMarkStale(state, `${DIR}/gone.md`, 'delete')).toBe(false) // never re-created
    // A new delete intent of the same file clears it (journalRecord, same op).
    journalRecord(state, `${DIR}/s1.md`, 'delete', NOW)
    expect(state.ops[`${DIR}/s1.md`].stale).toBeUndefined()
  })

  it('hasStaleOpUnder / journalClearStale', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/s1.md`, 'upsert', NOW)
    expect(hasStaleOpUnder(state, DIR)).toBe(false)
    journalMarkStale(state, `${DIR}/s1.md`)
    expect(hasStaleOpUnder(state, DIR)).toBe(true)
    expect(hasStaleOpUnder(state, 'other')).toBe(false)
    expect(journalClearStale(state, `${DIR}/s1.md`)).toBe(true)
    expect(journalClearStale(state, `${DIR}/s1.md`)).toBe(false)
    expect(state.ops[`${DIR}/s1.md`]).toEqual({ op: 'upsert', queuedAt: NOW, attempts: 0 })
  })

  it('journalCompleteDir settles every op under the folder (upserts and deletes, stale or not), never its deleteDir key or another folder', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/note.md`, 'upsert', NOW)
    journalRecord(state, `${DIR}/s1.md`, 'delete', NOW)
    journalMarkStale(state, `${DIR}/s1.md`, 'delete')
    journalRecord(state, `${DIR}-2/note.md`, 'upsert', NOW) // prefix lookalike
    journalRecord(state, 'other', 'deleteDir', NOW)
    expect(journalCompleteDir(state, DIR)).toBe(true)
    expect(Object.keys(state.ops).sort()).toEqual([`${DIR}-2/note.md`, 'other'])
    expect(journalCompleteDir(state, DIR)).toBe(false)
  })

  it('dropCachedShasUnder forgets the bases of one folder only', () => {
    const state = emptySyncState()
    state.shas[`${DIR}/note.md`] = 'a'
    state.shas[`${DIR}/s1.md`] = 'b'
    state.shas[`${DIR}-2/note.md`] = 'c'
    state.shas['groups.json'] = 'd'
    expect(dropCachedShasUnder(state, DIR)).toBe(true)
    expect(state.shas).toEqual({ [`${DIR}-2/note.md`]: 'c', 'groups.json': 'd' })
  })

  it('isNoteFilePath: only <dir>/<file>.md is conditional', () => {
    expect(isNoteFilePath(`${DIR}/note.md`)).toBe(true)
    expect(isNoteFilePath(`${DIR}/s1.md`)).toBe(true)
    expect(isNoteFilePath('groups.json')).toBe(false)
    expect(isNoteFilePath('README.md')).toBe(false)
    expect(isNoteFilePath('.noteflow-format')).toBe(false)
    expect(isNoteFilePath('a/b/c.md')).toBe(false)
  })
})
