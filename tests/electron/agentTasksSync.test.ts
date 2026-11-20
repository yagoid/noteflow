// agent.md (the reserved agent-task file of a note folder) in the desktop sync,
// GitHub and NoteFlow Cloud — the pure planners. The rules, mirror of the CLI's
// (tests/cli/agentTasks*.test.ts):
//   - it travels like a section file (uploaded, downloaded, merged line by line);
//   - it is NOT a section: no anchor ever lists it, a conflict that only
//     touches it is never announced and never makes a partial conflict copy;
//   - a pull never deletes a local agent.md the remote just does not have yet;
//   - its remote delete on Cloud is conditional on the base seq.
// And the golden rule: nothing changes for a note without agent.md (every
// exception is by file name — the existing suites of each planner pin the rest).
import { describe, it, expect } from 'vitest'
import yaml from 'js-yaml'
import {
  hashForBase,
  planThreeWayDir,
  mergeAnchors,
  relistAnchorSections,
  conditionalDeleteQuery,
  conditionalDeleteOutcome,
  agentDeleteYieldsToRow,
  filesNeedingCatchUp,
  listAnchorSectionFiles,
  isSafeCloudRelPath,
  buildConflictCopy,
  type ThreeWayRemoteRow,
  type ThreeWayDirInput,
} from '../../electron/cloudSyncLogic'
import { emptySyncState, planSectionRefresh, setCachedSha, isNoteFilePath, planConditionalDelete, planGithubDirConflict, type CloudBase } from '../../electron/syncState'
import { planGithubDirMerge, type GithubMergeFile } from '../../electron/githubMerge'
import { gitBlobSha, isMirrorDeletable, planMirror } from '../../electron/mirrorPlan'
import { serializeNoteFolder, splitFrontmatter, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import {
  AGENT_MD,
  agentFileDeletedRemotely,
  parseAgentDoc,
  serializeAgentDoc,
  userFacingSectionFiles,
  type AgentBlock,
} from '../../electron/agentTasks'

const DIR = 'tasks-abc12345'
const ANCHOR = `${DIR}/${NOTE_MD}`
const AGENT = `${DIR}/${AGENT_MD}`
const S1 = `${DIR}/s1.md`
const T1 = '2026-11-18T10:00:00.000Z'
const T2 = '2026-11-19T10:00:00.000Z'
const T3 = '2026-11-20T10:00:00.000Z'
const NOW = '2026-11-20T12:00:00.000Z'
const ROBOT = '\u{1F916}'

function folder(updated: string, sections: Record<string, string>, agent?: string): Record<string, string> {
  const n: DiskNote = {
    id: 'abc12345', title: 'Tasks', tags: [], created: T1, updated,
    sections: Object.entries(sections).map(([id, content]) => ({ id, name: id, content })),
  }
  const out: Record<string, string> = {}
  for (const [f, c] of Object.entries(serializeNoteFolder(n, { preserveUpdated: true }).files)) out[`${DIR}/${f}`] = c
  if (agent !== undefined) out[AGENT] = agent
  return out
}

const block = (id: string, meta: Record<string, string>, body = ''): AgentBlock => ({ id, meta: { title: 'Fix it', section: 's1', ...meta }, body })
const doc = (...blocks: AgentBlock[]) => serializeAgentDoc(blocks)
const TASK = `- [ ] Fix it ${ROBOT}k3f9a:running\n- [ ] Other`

/** The section files a note.md lists. */
const listed = (anchor: string) => listAnchorSectionFiles(anchor)
const sectionsOf = (anchor: string) =>
  ((yaml.load(splitFrontmatter(anchor).frontmatter) as { sections?: Array<{ file?: string }> }).sections ?? []).map((s) => s.file)

// ── GitHub ────────────────────────────────────────────────────────────────────

describe('GitHub pull: agent.md is refreshed although no anchor lists it (planSectionRefresh)', () => {
  const blobs = [
    { path: S1, sha: 'remote-s1' },
    { path: AGENT, sha: 'remote-agent' },
    { path: `${DIR}/orphan.md`, sha: 'remote-orphan' },
  ]
  const onlyListed = { refreshAllowed: true, isListedLocally: (rel: string) => rel === S1 }

  it('a changed agent.md blob is `changed` like a listed section; any other unlisted file is still ignored', () => {
    const state = emptySyncState()
    setCachedSha(state, S1, 'remote-s1')
    setCachedSha(state, AGENT, 'old-agent')
    const plan = planSectionRefresh(state, blobs, () => 'something-else', onlyListed)
    expect(plan.changed).toEqual([{ path: AGENT, sha: 'remote-agent' }])
    expect(plan.adopt).toEqual([])
  })

  it('…but never while GitHub is a stale mirror, with an unpushed local change, or when it is already this content', () => {
    const state = emptySyncState()
    expect(planSectionRefresh(state, blobs, () => 'x', { ...onlyListed, refreshAllowed: false }).changed).toEqual([])
    state.ops[AGENT] = { op: 'upsert', queuedAt: NOW, attempts: 0 }
    expect(planSectionRefresh(state, blobs, () => 'x', onlyListed).changed.map((b) => b.path)).toEqual([S1])
    delete state.ops[AGENT]
    const same = planSectionRefresh(state, blobs, (rel) => (rel === AGENT ? 'remote-agent' : 'x'), onlyListed)
    expect(same.adopt).toEqual([{ path: AGENT, sha: 'remote-agent' }])
  })
})

describe('GitHub pull: a local agent.md the remote lacks (agentFileDeletedRemotely)', () => {
  it('written here and never uploaded (no base) → kept', () => {
    expect(agentFileDeletedRemotely(undefined, gitBlobSha(doc(block('k3f9a', { state: 'queued' }))))).toBe(false)
  })
  it('changed here since its base → kept (it goes up again)', () => {
    expect(agentFileDeletedRemotely(gitBlobSha('old'), gitBlobSha('new'))).toBe(false)
  })
  it('synced and untouched here → it was deleted there: the pull may remove it', () => {
    const text = doc(block('k3f9a', { state: 'done' }))
    expect(agentFileDeletedRemotely(gitBlobSha(text), gitBlobSha(text))).toBe(true)
  })
  it('a local-only agent.md is no conflict nor a copy candidate for the folder (it is not even in the three-way view)', () => {
    // dirThreeWayShas only lists remote ∪ cached paths: agent.md without a base is absent from `paths`.
    const paths = [{ path: ANCHOR, base: 'a0', remote: 'a1', local: 'a0' }, { path: S1, base: 's0', remote: 's0', local: 's0' }]
    expect(planGithubDirConflict(emptySyncState(), DIR, paths)).toEqual({ conflict: false, fastForward: true, copyCandidates: [] })
  })
  it('its remote delete is conditional like a section\'s: a file that changed there is not deleted', () => {
    expect(isNoteFilePath(AGENT)).toBe(true)
    expect(planConditionalDelete('base', 'moved')).toBe('conflict')
    expect(planConditionalDelete('base', 'base')).toBe('delete')
  })
})

describe('GitHub merge of a conflicting folder (planGithubDirMerge)', () => {
  const filesOf = (base: Record<string, string>, remote: Record<string, string>, local: Record<string, string>): GithubMergeFile[] =>
    [...new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])].map((p) => ({
      path: p,
      base: base[p] === undefined ? undefined : gitBlobSha(base[p]),
      remote: remote[p] === undefined ? null : { sha: gitBlobSha(remote[p]), content: remote[p] },
      local: local[p] ?? null,
      localSha: local[p] === undefined ? null : gitBlobSha(local[p]),
      baseContent: base[p] ?? null,
    }))
  const A0 = doc(block('k3f9a', { state: 'running', progress: 'starting' }))

  it('both machines wrote different keys of the block → one merged agent.md, no marks, and the anchor does not list it', () => {
    const remoteDoc = doc(block('k3f9a', { state: 'running', progress: 'starting', lastSignal: T2 }))
    const localDoc = doc(block('k3f9a', { state: 'running', progress: 'starting', machine: 'laptop' }))
    const m = planGithubDirMerge({
      dir: DIR,
      files: filesOf(folder(T1, { s1: TASK }, A0), folder(T2, { s1: TASK }, remoteDoc), folder(T3, { s1: `${TASK}\n- [ ] new` }, localDoc)),
      nowIso: NOW,
    })!
    expect(parseAgentDoc(m.final[AGENT])[0].meta).toMatchObject({ lastSignal: T2, machine: 'laptop', progress: 'starting' })
    expect(m.conflictMarkerSections).toEqual([])
    expect(m.copySections).toEqual([])
    expect(listed(m.final[ANCHOR])).toEqual(['s1.md'])
  })

  it('both wrote the SAME header line → marks inside agent.md only: nothing to announce, the reader resolves it', () => {
    const remoteDoc = doc(block('k3f9a', { state: 'running', progress: 'from the server' }))
    const localDoc = doc(block('k3f9a', { state: 'running', progress: 'from here' }))
    const m = planGithubDirMerge({
      dir: DIR,
      files: filesOf(folder(T1, { s1: TASK }, A0), folder(T2, { s1: TASK }, remoteDoc), folder(T3, { s1: TASK }, localDoc)),
      nowIso: NOW,
    })!
    expect(m.conflictMarkerSections).toEqual([AGENT_MD])
    expect(userFacingSectionFiles(m.conflictMarkerSections)).toEqual([]) // → no "merged with conflicts" notice
    expect(m.copySections).toEqual([])
    expect(m.final[AGENT]).toContain('> ⚠')
    // Deterministic on every machine: of a repeated key the LAST value wins (the already-synced version).
    expect(parseAgentDoc(m.final[AGENT])[0].meta.progress).toBe('from the server')
    expect(listed(m.final[ANCHOR])).toEqual(['s1.md'])
  })

  it('a conflict in a section AND in agent.md is announced for the section only', () => {
    const m = planGithubDirMerge({
      dir: DIR,
      files: filesOf(
        folder(T1, { s1: 'milk' }, A0),
        folder(T2, { s1: 'eggs' }, doc(block('k3f9a', { state: 'running', progress: 'server' }))),
        folder(T3, { s1: 'bread' }, doc(block('k3f9a', { state: 'running', progress: 'here' }))),
      ),
      nowIso: NOW,
    })!
    expect([...m.conflictMarkerSections].sort()).toEqual([AGENT_MD, 's1.md'])
    expect(userFacingSectionFiles(m.conflictMarkerSections)).toEqual(['s1.md'])
  })

  it('agent.md deleted on GitHub but changed here → it STAYS (re-uploaded): no partial conflict copy, no removal', () => {
    const localDoc = doc(block('k3f9a', { state: 'done' }, 'the report'))
    const remote = folder(T2, { s1: `${TASK}\nremote line` }) // …and no agent.md
    const m = planGithubDirMerge({
      dir: DIR,
      files: filesOf(folder(T1, { s1: TASK }, A0), remote, folder(T3, { s1: TASK }, localDoc)),
      nowIso: NOW,
    })!
    expect(m.final[AGENT]).toBe(localDoc)
    expect(m.removes).toEqual([])
    expect(m.copySections).toEqual([])
    expect(m.writes.map((w) => w.relPath)).not.toContain(AGENT)
    expect(listed(m.final[ANCHOR])).toEqual(['s1.md'])
    // What ends different from GitHub goes up: agent.md is not there at all.
    expect(remote[AGENT]).toBeUndefined()
  })

  it('a SECTION in that same case keeps the rule it always had (deletion applied + a copy of that section)', () => {
    const base = folder(T1, { s1: TASK, s2: 'two' })
    const m = planGithubDirMerge({ dir: DIR, files: filesOf(base, folder(T2, { s1: `${TASK}!` }), folder(T3, { s1: TASK, s2: 'two edited' })), nowIso: NOW })!
    expect(m.copySections).toEqual(['s2.md'])
    expect(m.removes).toEqual([`${DIR}/s2.md`])
  })

  it('agent.md deleted on GitHub and untouched here → the deletion is applied', () => {
    const m = planGithubDirMerge({
      dir: DIR,
      files: filesOf(folder(T1, { s1: TASK }, A0), folder(T2, { s1: `${TASK}\nremote` }), folder(T3, { s1: `local\n${TASK}` }, A0)),
      nowIso: NOW,
    })!
    expect(m.removes).toEqual([AGENT])
    expect(m.final[AGENT]).toBeUndefined()
    expect(m.copySections).toEqual([])
  })

  it('agent.md deleted here (its last task dismissed) but changed on GitHub → the remote version comes back, no copy', () => {
    const remoteDoc = doc(block('k3f9a', { state: 'done' }, 'a report this device never saw'))
    const local = folder(T3, { s1: '- [ ] Fix it\n- [ ] Other' })
    const m = planGithubDirMerge({ dir: DIR, files: filesOf(folder(T1, { s1: TASK }, A0), folder(T2, { s1: TASK }, remoteDoc), local), nowIso: NOW })!
    expect(m.final[AGENT]).toBe(remoteDoc)
    expect(m.copySections).toEqual([])
    expect(listed(m.final[ANCHOR])).toEqual(['s1.md'])
  })
})

describe('GitHub mirror (Cloud active): agent.md is one more file of the folder', () => {
  const METADATA = ['groups.json']
  const local = (p: string, content: string) => ({ path: p, sha: gitBlobSha(content) })

  it('uploaded when it changed, left when it matches, deleted from the mirror when the note no longer has it', () => {
    expect(isMirrorDeletable(AGENT, METADATA)).toBe(true)
    const anchor = local(ANCHOR, 'A')
    expect(planMirror([anchor, local(AGENT, 'new')], [anchor, local(AGENT, 'old')], METADATA).toUpload).toEqual([AGENT])
    expect(planMirror([anchor, local(AGENT, 'same')], [anchor, local(AGENT, 'same')], METADATA)).toMatchObject({ toUpload: [], toDelete: [] })
    expect(planMirror([anchor], [anchor, local(AGENT, 'old')], METADATA).toDelete).toEqual([{ op: 'delete', key: AGENT, paths: [AGENT] }])
  })
})

// ── NoteFlow Cloud ────────────────────────────────────────────────────────────

describe('Cloud pull: agent.md through the three-way planner (planThreeWayDir)', () => {
  const base = (rel: string, content: string, seq = 5): CloudBase => ({ seq, hash: hashForBase(rel, content) })
  const row = (relPath: string, seq: number, content: string | null): ThreeWayRemoteRow => ({ relPath, seq, content, updatedAtMs: Date.parse(T2) })
  const input = (o: Partial<ThreeWayDirInput> & Pick<ThreeWayDirInput, 'local' | 'remote' | 'bases'>): ThreeWayDirInput => ({
    dir: DIR,
    pendingUpserts: new Set(),
    staleUpserts: new Set(),
    copiedUpserts: new Set(),
    pendingDeletes: new Set(),
    nowIso: NOW,
    ...o,
  })
  const F1 = folder(T1, { s1: TASK })
  const A0 = doc(block('k3f9a', { state: 'running', progress: 'starting' }))
  const basesOf = (files: Record<string, string>, seq = 5): Record<string, CloudBase> =>
    Object.fromEntries(Object.entries(files).map(([rel, content]) => [rel, base(rel, content, seq)]))

  it('a new agent.md row (the CLI of another machine queued a task) is written like a section — and never listed', () => {
    const remoteFolder = folder(T2, { s1: TASK })
    const plan = planThreeWayDir(input({
      local: folder(T1, { s1: '- [ ] Fix it\n- [ ] Other' }),
      remote: [row(ANCHOR, 9, remoteFolder[ANCHOR]), row(S1, 8, TASK), row(AGENT, 7, A0)],
      bases: basesOf(folder(T1, { s1: '- [ ] Fix it\n- [ ] Other' })),
    }))
    expect(plan.writes.find((w) => w.relPath === AGENT)?.content).toBe(A0)
    expect(plan.bases[AGENT]).toEqual({ seq: 7, hash: hashForBase(AGENT, A0) })
    expect(plan.copySections).toEqual([])
    expect(plan.copyWhole).toBe(false)
    const anchor = plan.writes.find((w) => w.relPath === ANCHOR)?.content ?? remoteFolder[ANCHOR]
    expect(sectionsOf(anchor)).toEqual(['s1.md'])
  })

  it('a local agent.md change over an unchanged server version is kept and uploaded; the anchor still lists only sections', () => {
    const local = { ...F1, [AGENT]: doc(block('k3f9a', { state: 'running', progress: 'half way' })) }
    const remoteAnchor = folder(T2, { s1: TASK })[ANCHOR].replace('title: Tasks', 'title: Tasks renamed')
    const plan = planThreeWayDir(input({
      local,
      remote: [row(ANCHOR, 9, remoteAnchor), row(AGENT, 5, A0)],
      bases: basesOf({ ...F1, [AGENT]: A0 }),
    }))
    expect(plan.upload).toContain(AGENT)
    expect(plan.writes.map((w) => w.relPath)).not.toContain(AGENT)
    const anchor = plan.writes.find((w) => w.relPath === ANCHOR)!.content
    expect(sectionsOf(anchor)).toEqual(['s1.md']) // withKeptLocalSections never adds agent.md
    expect(anchor).toContain('Tasks renamed')
  })

  it('both changed → merged line by line and uploaded; marks only inside agent.md are not a user-facing conflict', () => {
    const merged = planThreeWayDir(input({
      local: { ...F1, [AGENT]: doc(block('k3f9a', { state: 'running', progress: 'starting', machine: 'laptop' })) },
      remote: [row(AGENT, 9, doc(block('k3f9a', { state: 'running', progress: 'starting', lastSignal: T2 })))],
      bases: basesOf({ ...F1, [AGENT]: A0 }),
      baseContent: () => A0,
    }))
    expect(parseAgentDoc(merged.writes.find((w) => w.relPath === AGENT)!.content)[0].meta).toMatchObject({ machine: 'laptop', lastSignal: T2 })
    expect(merged.upload).toEqual([AGENT])
    expect(merged.conflictMarkerSections).toEqual([])

    const clash = planThreeWayDir(input({
      local: { ...F1, [AGENT]: doc(block('k3f9a', { state: 'running', progress: 'here' })) },
      remote: [row(AGENT, 9, doc(block('k3f9a', { state: 'running', progress: 'server' })))],
      bases: basesOf({ ...F1, [AGENT]: A0 }),
      baseContent: () => A0,
    }))
    expect(clash.conflictMarkerSections).toEqual([AGENT_MD])
    expect(userFacingSectionFiles(clash.conflictMarkerSections)).toEqual([])
    expect(clash.copySections).toEqual([])
    expect(clash.copyWhole).toBe(false)
  })

  it('the line merge is impossible (encrypted note) → the planner asks for a copy of agent.md; the caller never makes one of only it', () => {
    const encrypted = folder(T1, {})[ANCHOR].replace('formatVersion: 2', 'formatVersion: 2\nencryption:\n  alg: x')
    const plan = planThreeWayDir(input({
      local: { [ANCHOR]: encrypted, [AGENT]: doc(block('k3f9a', { state: 'running', progress: 'here' })) },
      remote: [row(AGENT, 9, doc(block('k3f9a', { state: 'running', progress: 'server' })))],
      bases: { [ANCHOR]: base(ANCHOR, encrypted, 5), [AGENT]: base(AGENT, A0, 5) },
    }))
    expect(plan.copySections).toEqual([AGENT_MD])
    expect(userFacingSectionFiles(plan.copySections)).toEqual([]) // cloudSync: no conflict copy, the server's agent.md is written
    expect(plan.writes.find((w) => w.relPath === AGENT)?.content).toContain('server')
  })

  it('a tombstone over an untouched local agent.md deletes it; over a changed one the local stays and goes up again', () => {
    const untouched = planThreeWayDir(input({ local: { ...F1, [AGENT]: A0 }, remote: [row(AGENT, 9, null)], bases: basesOf({ ...F1, [AGENT]: A0 }) }))
    expect(untouched.removes).toEqual([AGENT])
    expect(untouched.bases[AGENT]).toBeNull()

    const changed = planThreeWayDir(input({
      local: { ...F1, [AGENT]: doc(block('k3f9a', { state: 'done' }, 'report')) },
      remote: [row(AGENT, 9, null)],
      bases: basesOf({ ...F1, [AGENT]: A0 }),
    }))
    expect(changed.removes).toEqual([])
    expect(changed.upload).toEqual([AGENT])
    expect(changed.copySections).toEqual([])
  })

  it('deleted here, edited on the server → the server version is restored (a remote edit beats a local deletion)', () => {
    const remoteDoc = doc(block('k3f9a', { state: 'done' }, 'a report this device never saw'))
    const plan = planThreeWayDir(input({ local: F1, remote: [row(AGENT, 9, remoteDoc)], bases: basesOf({ ...F1, [AGENT]: A0 }) }))
    expect(plan.writes).toEqual([{ relPath: AGENT, content: remoteDoc }])
    expect(plan.copySections).toEqual([])
  })

  it('mergeAnchors / relistAnchorSections never list a file no anchor lists — agent.md included', () => {
    const local = folder(T3, { s1: 'a', s2: 'b' })[ANCHOR]
    const remote = folder(T2, { s1: 'a' })[ANCHOR].replace('title: Tasks', 'title: Renamed')
    const merged = mergeAnchors({
      local,
      remote,
      baseHash: hashForBase(ANCHOR, folder(T1, { s1: 'a' })[ANCHOR]),
      sectionFilesOnDisk: new Set(['s1.md', 's2.md', AGENT_MD]),
      knownSectionFiles: new Set(['s1.md', AGENT_MD]),
      folderKeepsLocalChanges: true,
      keptLocalSectionFiles: new Set([AGENT_MD, 's2.md']),
      restoredRemoteSectionFiles: new Set([AGENT_MD]),
      nowIso: NOW,
    })
    expect(sectionsOf(merged.content)).toEqual(['s1.md', 's2.md'])
    expect(sectionsOf(relistAnchorSections(remote, local, new Set(['s1.md', 's2.md', AGENT_MD]), NOW)!)).toEqual(['s1.md', 's2.md'])
  })

  it('the catch-up after the gate reopens uploads a changed agent.md by its base, like any file', () => {
    const files = [{ relPath: S1, content: TASK }, { relPath: AGENT, content: 'new' }]
    expect(filesNeedingCatchUp(files, { [S1]: base(S1, TASK, 9), [AGENT]: base(AGENT, 'old', 9) }, false)).toEqual([AGENT])
    expect(isSafeCloudRelPath(AGENT)).toBe(true)
  })

  it('a WHOLE-folder conflict copy carries agent.md with the sections (known limit: the ids are then on two notes)', () => {
    const copy = buildConflictCopy({ [NOTE_MD]: F1[ANCHOR], 's1.md': TASK, [AGENT_MD]: A0 }, { newId: 'zzz99999', title: 'Tasks (conflict copy)', nowIso: NOW })
    expect(Object.keys(copy.files).sort()).toEqual([AGENT_MD, NOTE_MD, 's1.md'].sort())
    expect(sectionsOf(copy.files[NOTE_MD])).toEqual(['s1.md'])
  })
})

describe('Cloud: the remote delete of agent.md is conditional on the base seq', () => {
  it('conditionalDeleteQuery: a compare-and-swap on path_key + seq; nothing to send without a base', () => {
    expect(conditionalDeleteQuery('abc/def+1=', { seq: 42, hash: 'h' })).toBe('/rest/v1/files?path_key=eq.abc%2Fdef%2B1%3D&seq=eq.42&select=path_key')
    expect(conditionalDeleteQuery('k', undefined)).toBeNull()
    expect(conditionalDeleteQuery('k', { seq: Number.NaN, hash: 'h' })).toBeNull()
    expect(conditionalDeleteQuery('k', { seq: 1.5, hash: 'h' })).toBeNull()
  })

  it('conditionalDeleteOutcome: a returned row = deleted; none = another machine wrote it since (nothing deleted)', () => {
    expect(conditionalDeleteOutcome([{ path_key: 'k' }])).toBe('deleted')
    expect(conditionalDeleteOutcome([])).toBe('changed')
    expect(conditionalDeleteOutcome(null)).toBe('changed')
    expect(conditionalDeleteOutcome({})).toBe('changed')
  })

  it('agentDeleteYieldsToRow: a pending delete never hides a row it could not have removed', () => {
    const b: CloudBase = { seq: 5, hash: 'h' }
    expect(agentDeleteYieldsToRow(b, { seq: 9, deleted: false })).toBe(true) // newer than the base: the CAS would fail
    expect(agentDeleteYieldsToRow(undefined, { seq: 9, deleted: false })).toBe(true) // no base: nothing could be sent
    expect(agentDeleteYieldsToRow(b, { seq: 9, deleted: true })).toBe(true) // already deleted there
    expect(agentDeleteYieldsToRow(b, { seq: null, deleted: false })).toBe(true)
    expect(agentDeleteYieldsToRow(b, { seq: 5, deleted: false })).toBe(false) // still the base: the delete goes on
    expect(agentDeleteYieldsToRow(b, { seq: 4, deleted: false })).toBe(false)
  })
})
