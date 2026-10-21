// QA B3 in the CLI (cli/noteflow.js): `noteflow push` and the automatic push of
// every editing command used to PUT over whatever GitHub held. They now run the
// same three-way check as the desktop app, with the CLI's own base cache
// (cli-github-state.json). These pin the pure helpers and their parity with
// electron/syncState.ts / electron/mirrorPlan.ts — no network.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  isNoteFilePath,
  planConditionalUpsert,
  planConditionalDelete,
  remoteDirChangesSinceBase,
  emptySyncState,
} from '../../electron/syncState'
import { gitBlobSha } from '../../electron/mirrorPlan'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

type Shas = Record<string, string>
const cliBlobSha = cli.gitBlobSha as (c: string) => string
const cliIsNoteFile = cli.isNoteFilePath as (p: string) => boolean
const cliUpsert = cli.planConditionalUpsert as (b: string | undefined, r: string | null, l: string) => string
const cliDelete = cli.planConditionalDelete as (b: string | undefined, r: string | null) => string
const cliDirChanges = cli.remoteDirChangesSinceBase as (shas: Shas, blobs: { path: string; sha: string }[]) => string[]
const nextPulledBases = cli.nextPulledBases as (
  prev: Shas, blobs: { path: string; sha: string }[], localShas: Record<string, string | null>,
) => Shas
const candidates = cli.githubConflictCandidates as (shas: Shas, localShas: Record<string, string | null>) => string[]

const DIR = 'groceries-abc12345'

describe('CLI ↔ app parity of the three-way check', () => {
  it('gitBlobSha matches the app (and git) byte for byte', () => {
    for (const c of ['', 'hello\n', 'ñandú — emoji 🛒\r\nline 2']) expect(cliBlobSha(c)).toBe(gitBlobSha(c))
    expect(cliBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a') // `git hash-object`
  })

  it('planConditionalUpsert / planConditionalDelete / isNoteFilePath answer like the app on every case', () => {
    const bases = [undefined, 'B']
    const remotes = [null, 'B', 'R', 'L']
    for (const b of bases) {
      for (const r of remotes) {
        expect(cliUpsert(b, r, 'L')).toBe(planConditionalUpsert(b, r, 'L'))
        expect(cliDelete(b, r)).toBe(planConditionalDelete(b, r))
      }
    }
    for (const p of [`${DIR}/note.md`, `${DIR}/s1.md`, 'groups.json', 'README.md', 'a/b/c.md', '.noteflow-format']) {
      expect(cliIsNoteFile(p)).toBe(isNoteFilePath(p))
    }
  })

  it('remoteDirChangesSinceBase matches the app', () => {
    const state = emptySyncState()
    state.shas = { [`${DIR}/note.md`]: 'A0', [`${DIR}/s1.md`]: 'S0' }
    const blobs = [
      { path: `${DIR}/note.md`, sha: 'A1' },
      { path: `${DIR}/s1.md`, sha: 'S0' },
      { path: `${DIR}/s2.md`, sha: 'X' },
    ]
    expect(cliDirChanges(state.shas, blobs)).toEqual(remoteDirChangesSinceBase(state, blobs))
    expect(cliDirChanges(state.shas, blobs)).toEqual([`${DIR}/note.md`])
  })
})

describe('B3 decisions in the CLI', () => {
  it('a note changed on GitHub since the last pull is not overwritten by `noteflow push`', () => {
    expect(cliUpsert('R0', 'R1', 'L1')).toBe('conflict')
  })

  it('no base cache yet (first run, other repo, after logout) = historical behaviour', () => {
    expect(cliUpsert(undefined, 'R1', 'L1')).toBe('put')
    expect(cliDelete(undefined, 'R1')).toBe('delete')
  })

  it('identical content is never re-PUT (no empty commits)', () => {
    expect(cliUpsert('R0', 'L1', 'L1')).toBe('identical')
  })
})

describe('nextPulledBases (bases after `noteflow pull`)', () => {
  it('a listed blob becomes the base only where the local file now IS that blob', () => {
    const blobs = [
      { path: `${DIR}/note.md`, sha: 'A1' }, // pulled → local equals
      { path: `${DIR}/s1.md`, sha: 'S1' }, // skipped ("local newer") → keeps its old base
      { path: 'new-x/note.md', sha: 'N1' }, // local differs, no previous base → none
    ]
    const local = { [`${DIR}/note.md`]: 'A1', [`${DIR}/s1.md`]: 'S2', 'new-x/note.md': 'N2' }
    const prev = { [`${DIR}/note.md`]: 'A0', [`${DIR}/s1.md`]: 'S0', 'gone/note.md': 'G0' }
    expect(nextPulledBases(prev, blobs, local)).toEqual({ [`${DIR}/note.md`]: 'A1', [`${DIR}/s1.md`]: 'S0' })
  })

  it('a path gone from the listing loses its base; an absent local file keeps the previous one', () => {
    expect(nextPulledBases({ 'a/note.md': 'A0', 'b/note.md': 'B0' }, [{ path: 'a/note.md', sha: 'A1' }], { 'a/note.md': null }))
      .toEqual({ 'a/note.md': 'A0' })
  })
})

describe('githubConflictCandidates (what the conflict copy compares with GitHub)', () => {
  it('local files changed since their base, or without one', () => {
    const shas = { [`${DIR}/note.md`]: 'A0', [`${DIR}/s1.md`]: 'S0' }
    const local = { [`${DIR}/note.md`]: 'A2', [`${DIR}/s1.md`]: 'S0', [`${DIR}/s9.md`]: 'N', [`${DIR}/x.md`]: null }
    expect(candidates(shas, local)).toEqual([`${DIR}/note.md`, `${DIR}/s9.md`])
  })
})
