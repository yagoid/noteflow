// Parity of the CLI's per-file three-way reconcile (cli/noteflow.js) with the
// app's pure decisions (electron/cloudSyncLogic.ts, migration 0014): same
// hashes, same upload classification, same bootstrap rules and — the hard part,
// since the CLI has no YAML library and edits note.md as text blocks — the
// same planThreeWayDir / mergeAnchors outcome over a grid of local × remote
// edits, with anchors written by the app (js-yaml) AND by the CLI itself.
// note.md results are compared by what js-yaml loads from them (the CLI keeps
// untouched lines as they are instead of re-dumping the whole frontmatter).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import yaml from 'js-yaml'
import {
  CLOUD_BASE_UPSERT_RPC,
  TOMBSTONE_BASE_HASH,
  UNKNOWN_BASE_HASH,
  hashForBase,
  classifyBaseUpsert,
  planFileReconcile,
  mergeAnchors,
  planThreeWayDir,
  filesNeedingCatchUp,
  needsBasesBootstrap,
  planPullQuery,
  synthesizeBootstrapBases,
  parseBootstrapPending,
  nextBootstrapPending,
  buildConflictCopy,
  mergeSectionText,
  DEFAULT_SECTION_CONFLICT_LABELS,
  SECTION_CONFLICT_LABEL_TEMPLATES_EN,
  sectionConflictLabels,
  type ThreeWayRemoteRow,
  type ThreeWayDirPlan,
  type AnchorMergeInput,
} from '../../electron/cloudSyncLogic'
import type { CloudBase } from '../../electron/syncState'
import { serializeNoteFolder, splitFrontmatter, NOTE_MD, type DiskNote } from '../../electron/noteFormat'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

const DIR = 'noteflow-abc12345'
const ANCHOR = `${DIR}/${NOTE_MD}`
const T0 = '2026-10-30T18:00:00.000Z'
const T_EARLY = '2026-11-01T08:00:00.000Z'
const T_LATE = '2026-11-02T10:00:00.000Z'
const NOW = '2026-11-03T09:00:00.000Z'

type Sections = Record<string, string>
type SectionMeta = { aiHidden?: boolean }

function note(updated: string, sections: Sections, extra?: Partial<DiskNote>, meta?: Record<string, SectionMeta>): DiskNote {
  return {
    id: 'abc12345',
    title: 'NOTEFLOW',
    tags: ['dev'],
    created: '2026-10-01T00:00:00.000Z',
    updated,
    sections: Object.entries(sections).map(([id, content]) => ({ id, name: id.toUpperCase(), content, ...(meta?.[id] ?? {}) })),
    ...extra,
  }
}

/** relPath → content; `cliFormat` writes note.md with the CLI's own serializer. */
function folder(n: DiskNote, cliFormat = false): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, content] of Object.entries(serializeNoteFolder(n, { preserveUpdated: true }).files)) {
    out[`${DIR}/${name}`] = content
  }
  if (cliFormat) out[ANCHOR] = cli.serializeNoteMd(n, { preserveUpdated: true })
  return out
}

function loadAnchor(content: string): { fm: unknown; body: string } {
  const { frontmatter, body } = splitFrontmatter(content)
  return { fm: yaml.load(frontmatter), body }
}

/** A plan with note.md writes reduced to what js-yaml loads from them. */
function comparable(plan: ThreeWayDirPlan) {
  return {
    ...plan,
    writes: plan.writes.map((w) => ({ relPath: w.relPath, content: w.relPath === ANCHOR ? loadAnchor(w.content) : w.content })),
  }
}

const BASE: Sections = { a: 'a v1', b: 'b v1', c: 'c v1' }

// One side's version of the note, relative to the base.
const VARIANTS: Record<string, (t: string, side: string) => { n: DiskNote }> = {
  same: () => ({ n: note(T0, BASE) }),
  bumpOnly: (t) => ({ n: note(t, BASE) }),
  editA: (t, s) => ({ n: note(t, { ...BASE, a: `a ${s}` }) }),
  editB: (t, s) => ({ n: note(t, { ...BASE, b: `b ${s}` }) }),
  delC: (t) => ({ n: note(t, { a: BASE.a, b: BASE.b }) }),
  addD: (t, s) => ({ n: note(t, { ...BASE, [`d${s}`]: `d ${s}` }) }),
  hideB: (t) => ({ n: note(t, BASE, undefined, { b: { aiHidden: true } }) }),
  fav: (t) => ({ n: note(t, BASE, { favorited: true }) }),
  tagged: (t, s) => ({ n: note(t, { ...BASE, a: `a #${s}` }, { tags: ['dev', s] }) }),
  title: (t, s) => ({ n: note(t, BASE, { title: `Title ${s}` }) }),
}

/** Bases of the base version (seq 1..n) and the remote rows of `remote` vs the base (seq > n). */
function scenario(local: DiskNote, remote: DiskNote, cliLocal: boolean, pendingAll: boolean, remoteAnchorAtBase: boolean) {
  const baseFiles = folder(note(T0, BASE))
  const bases: Record<string, CloudBase> = {}
  let seq = 0
  for (const [rel, content] of Object.entries(baseFiles)) bases[rel] = { seq: ++seq, hash: hashForBase(rel, content) }
  const remoteFiles = folder(remote)
  const rows: ThreeWayRemoteRow[] = []
  const updatedAtMs = Date.parse(remote.updated)
  for (const [rel, content] of Object.entries(remoteFiles)) {
    if (baseFiles[rel] === content) continue
    if (rel === ANCHOR && remoteAnchorAtBase) continue
    rows.push({ relPath: rel, seq: ++seq, content, updatedAtMs })
  }
  for (const rel of Object.keys(baseFiles)) {
    if (!(rel in remoteFiles)) rows.push({ relPath: rel, seq: ++seq, content: null, updatedAtMs })
  }
  if (remoteAnchorAtBase) rows.push({ relPath: ANCHOR, seq: bases[ANCHOR].seq, content: baseFiles[ANCHOR], updatedAtMs })
  const localFiles = folder(local, cliLocal)
  const pending = new Set<string>()
  if (pendingAll) {
    for (const [rel, content] of Object.entries(localFiles)) if (baseFiles[rel] !== content) pending.add(rel)
  }
  return { localFiles, rows, bases, pending }
}

describe('constants, hashes and the v2 upload classification', () => {
  it('same RPC name and sentinel hashes', () => {
    expect(cli.CLOUD_BASE_UPSERT_RPC).toBe(CLOUD_BASE_UPSERT_RPC)
    expect(cli.TOMBSTONE_BASE_HASH).toBe(TOMBSTONE_BASE_HASH)
    expect(cli.UNKNOWN_BASE_HASH).toBe(UNKNOWN_BASE_HASH)
  })

  it('hashForBase: same hash for anchors (app / CLI format, CRLF, `updated:` ignored) and sections', () => {
    const app = folder(note(T0, BASE))[ANCHOR]
    const mine = cli.serializeNoteMd(note(T_LATE, BASE), { preserveUpdated: true })
    for (const c of [app, mine, app.replace(/\n/g, '\r\n'), 'no frontmatter', '']) {
      expect(cli.hashForBase(ANCHOR, c)).toBe(hashForBase(ANCHOR, c))
    }
    for (const c of ['x', 'x\r\n', 'çñ 😀', '']) expect(cli.hashForBase(`${DIR}/a.md`, c)).toBe(hashForBase(`${DIR}/a.md`, c))
    expect(cli.hashForBase(ANCHOR, folder(note(T_LATE, BASE))[ANCHOR])).toBe(cli.hashForBase(ANCHOR, app))
  })

  it('classifyBaseUpsert matches the app on every response shape', () => {
    const cases: Array<[number, unknown]> = [
      [200, 42], [200, '42'], [200, null], [200, undefined], [200, 'x'], [204, null],
      [404, null], [404, { code: 'PGRST202' }], [400, { code: 'PGRST202' }], [403, null], [401, null], [500, null],
    ]
    for (const [status, json] of cases) expect(cli.classifyBaseUpsert(status, json)).toEqual(classifyBaseUpsert(status, json))
  })

  it('planFileReconcile over every combination', () => {
    const bases = [undefined, { seq: 10, hash: 'B' }]
    const hashes = [null, 'B', 'L', 'R']
    for (const base of bases) for (const localHash of hashes) for (const remoteHash of hashes)
      for (const pending of [false, true]) for (const remoteSeq of [null, 9, 10, 12]) {
        const s = { base, localHash, pending, remoteSeq, remoteHash }
        expect(cli.planFileReconcile(s)).toBe(planFileReconcile(s))
      }
  })
})

describe('planThreeWayDir — parity grid (local × remote edits)', () => {
  const names = Object.keys(VARIANTS)
  it('same plan as the app for every combination, app- and CLI-written local anchors', () => {
    let compared = 0, merged = 0, markers = 0, uploads = 0
    for (const ln of names) for (const rn of names) for (const cliLocal of [false, true]) for (const pendingAll of [false, true]) {
      for (const [lt, rt] of [[T_LATE, T_EARLY], [T_EARLY, T_LATE]]) {
        const { localFiles, rows, bases, pending } = scenario(VARIANTS[ln](lt, 'local').n, VARIANTS[rn](rt, 'remote').n, cliLocal, pendingAll, false)
        const input = {
          dir: DIR, local: localFiles, remote: rows, bases, pendingUpserts: pending, staleUpserts: pending,
          copiedUpserts: new Set<string>(), pendingDeletes: new Set<string>(), nowIso: NOW,
        }
        const app = planThreeWayDir(input)
        const mine = cli.planThreeWayDir(input) as ThreeWayDirPlan
        expect({ ln, rn, cliLocal, pendingAll, lt, plan: comparable(mine) }).toEqual({ ln, rn, cliLocal, pendingAll, lt, plan: comparable(app) })
        compared++
        const anchorWrite = mine.writes.find((w) => w.relPath === ANCHOR)?.content
        const remoteAnchor = rows.find((r) => r.relPath === ANCHOR)?.content
        if (anchorWrite !== undefined && anchorWrite !== remoteAnchor) merged++
        expect(mine.copySections).toEqual([]) // a section conflict is merged, never copied
        if (mine.conflictMarkerSections.length > 0) markers++
        if (mine.upload.length > 0) uploads++
      }
    }
    expect(compared).toBe(names.length * names.length * 8)
    // The grid really goes through the interesting paths.
    expect(merged).toBeGreaterThan(50)
    expect(markers).toBeGreaterThan(5)
    expect(uploads).toBeGreaterThan(50)
  })

  it('a remote anchor still at its base seq (keep) and rows older than the base (outdated)', () => {
    for (const ln of names) {
      const { localFiles, rows, bases, pending } = scenario(VARIANTS[ln](T_LATE, 'local').n, VARIANTS.editB(T_EARLY, 'remote').n, false, true, true)
      const older = { ...bases, [`${DIR}/b.md`]: { seq: 99, hash: 'x' } }
      for (const b of [bases, older]) {
        const input = {
          dir: DIR, local: localFiles, remote: rows, bases: b, pendingUpserts: pending, staleUpserts: pending,
          copiedUpserts: new Set<string>(), pendingDeletes: new Set<string>(), nowIso: NOW,
        }
        expect(comparable(cli.planThreeWayDir(input))).toEqual(comparable(planThreeWayDir(input)))
      }
    }
  })

  it('the same plan with base contents (diff3) and localized labels', () => {
    const baseFiles = folder(note(T0, BASE))
    const byHash = new Map(Object.entries(baseFiles).map(([rel, c]) => [hashForBase(rel, c), c]))
    const labels = { local: 'ESTE', remote: 'OTRO', end: 'FIN' }
    for (const ln of ['editA', 'editB', 'tagged']) for (const rn of ['editA', 'editB', 'delC']) {
      const { localFiles, rows, bases, pending } = scenario(VARIANTS[ln](T_LATE, 'local').n, VARIANTS[rn](T_EARLY, 'remote').n, false, true, false)
      const input = {
        dir: DIR, local: localFiles, remote: rows, bases, pendingUpserts: pending, staleUpserts: pending,
        copiedUpserts: new Set<string>(), pendingDeletes: new Set<string>(), nowIso: NOW,
        baseContent: (_rel: string, hash: string) => byHash.get(hash) ?? null, conflictLabels: labels,
      }
      expect(comparable(cli.planThreeWayDir(input))).toEqual(comparable(planThreeWayDir(input)))
    }
  })

  it('rows without a base (legacy per-section rule), pending deletes and echo hashes', () => {
    const { localFiles, rows, pending } = scenario(VARIANTS.editA(T_LATE, 'local').n, VARIANTS.editB(T_EARLY, 'remote').n, true, true, false)
    const anchorOnly = { [ANCHOR]: { seq: 1, hash: hashForBase(ANCHOR, folder(note(T0, BASE))[ANCHOR]) } }
    const echo = new Map(rows.filter((r) => r.content !== null).map((r) => [r.relPath, hashForBase(r.relPath, r.content as string)]))
    for (const extra of [{}, { pendingDeletes: new Set([`${DIR}/b.md`]) }, { inFlightHashes: echo }]) {
      const input = {
        dir: DIR, local: localFiles, remote: rows, bases: anchorOnly, pendingUpserts: pending, staleUpserts: new Set<string>(),
        copiedUpserts: new Set<string>(), pendingDeletes: new Set<string>(), nowIso: NOW, ...extra,
      }
      expect(comparable(cli.planThreeWayDir(input))).toEqual(comparable(planThreeWayDir(input)))
    }
  })

  it('an encrypted note both sides changed → the whole folder goes to a copy, like the app', () => {
    const enc = (u: string, c: string) => folder(note(u, {}, { encryption: { v: 1, ct: c } }))[ANCHOR]
    const input = {
      dir: DIR,
      local: { [ANCHOR]: enc(T_LATE, 'c1') },
      remote: [{ relPath: ANCHOR, seq: 5, content: enc(T_EARLY, 'c2'), updatedAtMs: Date.parse(T_EARLY) }],
      bases: { [ANCHOR]: { seq: 1, hash: hashForBase(ANCHOR, enc(T0, 'c0')) } },
      pendingUpserts: new Set([ANCHOR]), staleUpserts: new Set([ANCHOR]), copiedUpserts: new Set<string>(),
      pendingDeletes: new Set<string>(), nowIso: NOW,
    }
    const mine = cli.planThreeWayDir(input) as ThreeWayDirPlan
    expect(mine).toEqual(planThreeWayDir(input))
    expect(mine.copyWhole).toBe(true)
  })
})

describe('mergeAnchors — field merges in text (no YAML library in the CLI)', () => {
  const files = new Set(['a.md', 'b.md', 'c.md'])
  const baseAnchor = folder(note(T0, BASE))[ANCHOR]
  const input = (local: string, remote: string, o?: Partial<AnchorMergeInput>): AnchorMergeInput => ({
    local, remote, baseHash: hashForBase(ANCHOR, baseAnchor), sectionFilesOnDisk: files, knownSectionFiles: files,
    folderKeepsLocalChanges: false, keptLocalSectionFiles: new Set(), nowIso: NOW, ...o,
  })
  const same = (m: AnchorMergeInput) => {
    const app = mergeAnchors(m)
    const mine = cli.mergeAnchors(m) as { content: string; source: string }
    expect(mine.source).toBe(app.source)
    expect(loadAnchor(mine.content)).toEqual(loadAnchor(app.content))
    return mine
  }

  it('both changed: aiHidden (per section) and favorited OR-ed, tags united, updated = now', () => {
    for (const cliLocal of [false, true]) {
      const local = folder(note(T_LATE, BASE, { favorited: true, tags: ['dev', 'mine'] }, { b: { aiHidden: true } }), cliLocal)[ANCHOR]
      const remote = folder(note(T_EARLY, BASE, { title: 'Renamed there', tags: ['dev', 'theirs'] }))[ANCHOR]
      const m = same(input(local, remote))
      expect(m.source).toBe('merged')
      const fm = loadAnchor(m.content).fm as Record<string, unknown>
      expect(fm.title).toBe('Renamed there')
      expect(fm.favorited).toBe(true)
      expect(fm.tags).toEqual(['dev', 'theirs', 'mine'])
      expect(fm.updated).toBe(NOW)
      expect((fm.sections as Array<{ id: string; aiHidden?: boolean }>).find((s) => s.id === 'b')?.aiHidden).toBe(true)
    }
  })

  it('only the local changed but the remote `updated` is later → local with updated = now (never backwards)', () => {
    const local = folder(note(T_EARLY, BASE, { title: 'Mine' }))[ANCHOR]
    const remote = folder(note(T_LATE, BASE))[ANCHOR]
    const m = same(input(local, remote))
    expect((loadAnchor(m.content).fm as Record<string, unknown>).updated).toBe(NOW)
  })

  it('kept local sections and restored remote ones stay listed whatever side won', () => {
    const local = folder(note(T_LATE, { ...BASE, mine: 'kept' }), true)[ANCHOR]
    const remote = folder(note(T_EARLY, { a: 'a v1', b: 'b v1', theirs: 'x' }))[ANCHOR]
    same(input(local, remote, { keptLocalSectionFiles: new Set(['mine.md', 'c.md']), restoredRemoteSectionFiles: new Set(['theirs.md']) }))
    same(input(baseAnchor, remote, { keptLocalSectionFiles: new Set(['c.md']), folderKeepsLocalChanges: true }))
  })

  it('unreadable / encrypted anchors that both changed → whole', () => {
    const broken = '---\nid: x\nid: y\n---\n'
    const remote = folder(note(T_EARLY, BASE, { title: 'R' }))[ANCHOR]
    expect(same(input(broken, remote)).source).toBe('whole')
    expect(cli.parseAnchorFm(broken)).toBeNull()
    expect(cli.parseAnchorFm('no frontmatter')).toBeNull()
  })
})

describe('note.md text reader: what it cannot read for sure is unreadable, never misread', () => {
  // Both sides changed the title (→ field merge); the local one added `mine`
  // (its file is on disk). The app keeps `mine` in the merged anchor; a CLI that
  // misread the local sections list would silently drop it. Each odd but valid
  // YAML below must end as the app's result or as a whole-folder copy.
  const files = new Set(['a.md', 'b.md', 'c.md', 'mine.md'])
  const baseAnchor = folder(note(T0, BASE))[ANCHOR]
  const localApp = folder(note(T_LATE, { ...BASE, mine: 'mine' }, { title: 'Local', tags: ['dev', 'mine'] }))[ANCHOR]
  const remote = folder(note(T_EARLY, BASE, { title: 'Remote' }))[ANCHOR]
  const item = '  - id: mine\n    name: MINE\n    file: mine.md\n'
  const input = (local: string): AnchorMergeInput => ({
    local, remote, baseHash: hashForBase(ANCHOR, baseAnchor), sectionFilesOnDisk: files, knownSectionFiles: new Set(['a.md', 'b.md', 'c.md']),
    folderKeepsLocalChanges: false, keptLocalSectionFiles: new Set(), nowIso: NOW,
  })
  const listed = (content: string) =>
    ((loadAnchor(content).fm as { sections: Array<{ file: string }> }).sections).map((s) => s.file)

  it('the plain js-yaml layout merges like the app (control)', () => {
    expect(localApp).toContain(item)
    const mine = cli.mergeAnchors(input(localApp))
    expect(mine.source).toBe('merged')
    expect(listed(mine.content)).toContain('mine.md')
    expect(loadAnchor(mine.content)).toEqual(loadAnchor(mergeAnchors(input(localApp)).content))
  })

  const cases: Array<[string, string]> = [
    ['a flow-style item', localApp.replace(item, '  - {id: mine, name: MINE, file: mine.md}\n')],
    ['a trailing comment on `file`', localApp.replace('    file: mine.md\n', '    file: "mine.md" # moved\n')],
    ['a trailing comment on `aiHidden`', localApp.replace('    file: mine.md\n', '    file: mine.md\n    aiHidden: true # private\n')],
    ['a repeated field', localApp.replace('    file: mine.md\n', '    file: mine.md\n    file: other.md\n')],
    ['a field-level line that is not key: value', localApp.replace('    name: MINE\n', '    name: MINE\n    just text\n')],
    ['a multi-line flow tags list', localApp.replace(/^tags:\n {2}- dev\n {2}- mine\n/m, 'tags: [dev,\n  mine]\n')],
    ['an unclosed flow tags list', localApp.replace(/^tags:\n {2}- dev\n {2}- mine\n/m, 'tags: [dev, mine\n')],
    ['a comment after `favorited`', localApp.replace(/^title:/m, 'favorited: true # star\ntitle:')],
  ]
  for (const [label, local] of cases) {
    it(`${label}: the app's merge or a whole-folder copy — never a merge that drops data`, () => {
      expect(local).not.toBe(localApp)
      const app = mergeAnchors(input(local))
      const mine = cli.mergeAnchors(input(local)) as { content: string; source: string }
      if (mine.source === 'whole') {
        expect(mine.content).toBe(remote)
      } else {
        expect(mine.source).toBe(app.source)
        expect(loadAnchor(mine.content)).toEqual(loadAnchor(app.content))
      }
      expect(cli.parseAnchorFm(local)).toBeNull()
      // Through the planner: the whole local folder goes to a copy.
      const localFiles = { ...folder(note(T_LATE, { ...BASE, mine: 'mine' })), [ANCHOR]: local }
      const rows = [{ relPath: ANCHOR, seq: 9, content: remote, updatedAtMs: Date.parse(T_EARLY) }]
      const bases = { [ANCHOR]: { seq: 1, hash: hashForBase(ANCHOR, baseAnchor) } }
      const plan = cli.planThreeWayDir({
        dir: DIR, local: localFiles, remote: rows, bases, pendingUpserts: new Set([ANCHOR]), staleUpserts: new Set([ANCHOR]),
        copiedUpserts: new Set(), pendingDeletes: new Set(), nowIso: NOW,
      }) as ThreeWayDirPlan
      expect(plan.copyWhole).toBe(true)
    })
  }

  it('a repeated field: the app cannot read it either → both whole', () => {
    const local = localApp.replace('    file: mine.md\n', '    file: mine.md\n    file: other.md\n')
    expect(mergeAnchors(input(local)).source).toBe('whole')
    expect(cli.mergeAnchors(input(local)).source).toBe('whole')
  })
})

describe('conflict copy holding only the conflicting sections', () => {
  it('same files and note.md data as the app (app- and CLI-written anchors)', () => {
    for (const cliLocal of [false, true]) {
      const local: Record<string, string> = {}
      for (const [rel, content] of Object.entries(folder(note(T_LATE, BASE, undefined, { b: { aiHidden: true } }), cliLocal))) {
        local[rel.slice(DIR.length + 1)] = content
      }
      const opts = { newId: 'zz99yy88', title: 'NOTEFLOW (conflict copy 2026-11-03 10:00)', nowIso: NOW, onlySections: ['b.md'] }
      const app = buildConflictCopy(local, opts)
      const mine = cli.buildConflictCopy(local, opts) as { dir: string; files: Record<string, string> }
      expect(mine.dir).toBe(app.dir)
      expect(Object.keys(mine.files).sort()).toEqual(['b.md', NOTE_MD])
      expect(loadAnchor(mine.files[NOTE_MD])).toEqual(loadAnchor(app.files[NOTE_MD]))
    }
  })
})

describe('catch-up and bootstrap parity', () => {
  it('filesNeedingCatchUp', () => {
    const f = folder(note(T_LATE, { ...BASE, a: 'a v2' }))
    const files = Object.entries(f).map(([relPath, content]) => ({ relPath, content }))
    const baseFiles = folder(note(T0, BASE))
    const bases: Record<string, CloudBase> = {}
    for (const [rel, content] of Object.entries(baseFiles)) if (rel !== `${DIR}/c.md`) bases[rel] = { seq: 1, hash: hashForBase(rel, content) }
    for (const gate of [false, true]) expect(cli.filesNeedingCatchUp(files, bases, gate)).toEqual(filesNeedingCatchUp(files, bases, gate))
    expect(cli.filesNeedingCatchUp(files, bases, false)).toEqual([`${DIR}/a.md`])
  })

  it('needsBasesBootstrap and planPullQuery(bootstrapBases)', () => {
    const states = [
      {}, { pullSeq: 4 }, { lastSync: T0 }, { pullCursor: T0 }, { pullSeq: 4, basesBootstrapped: true }, { pullSeq: -1 },
    ]
    for (const s of states) {
      expect(cli.needsBasesBootstrap(s)).toBe(needsBasesBootstrap(s))
      for (const bootstrapBases of [false, true]) {
        expect(cli.planPullQuery(s, { bootstrapBases })).toEqual(planPullQuery(s, { bootstrapBases }))
      }
      expect(cli.planPullQuery(s)).toEqual(planPullQuery(s))
    }
  })

  it('synthesizeBootstrapBases (seen / unseen, pending, unjournaled, retry set)', () => {
    const { localFiles, rows } = scenario(VARIANTS.editA(T_LATE, 'local').n, VARIANTS.editB(T_EARLY, 'remote').n, false, false, true)
    const allRows = [...rows, { relPath: `${DIR}/a.md`, seq: 2, content: 'a v1', updatedAtMs: 0 }, { relPath: `${DIR}/x.md`, seq: 3, content: null, updatedAtMs: 0 }]
    const variants = [
      { seenSeq: 4, lastSyncMs: Date.parse(T_LATE) + 1, pending: [] as string[], notSeen: [] as string[] },
      { seenSeq: 4, lastSyncMs: Date.parse(T_EARLY), pending: [], notSeen: [] },
      { seenSeq: 4, lastSyncMs: null, pending: [`${DIR}/a.md`, ANCHOR], notSeen: [`${DIR}/a.md`] },
      { seenSeq: null, lastSyncMs: Date.parse(T0), pending: [`${DIR}/b.md`], notSeen: [] },
    ]
    for (const v of variants) {
      const o = {
        dir: DIR, local: localFiles, remote: allRows, bases: { [`${DIR}/c.md`]: { seq: 3, hash: 'h' } },
        pendingUpserts: new Set(v.pending), seenSeq: v.seenSeq, notSeen: new Set(v.notSeen), lastSyncMs: v.lastSyncMs,
      }
      expect(cli.synthesizeBootstrapBases(o)).toEqual(synthesizeBootstrapBases(o))
    }
  })

  it('parseBootstrapPending / nextBootstrapPending', () => {
    const raws = [
      undefined, null, [], { dirs: [] }, { dirs: ['a', 3], seenSeq: 4, lastSyncMs: -1, retryKeys: ['k', 1] },
      { dirs: ['a'], seenSeq: 1.5 },
    ]
    for (const raw of raws) expect(cli.parseBootstrapPending(raw)).toEqual(parseBootstrapPending(raw))
    const prev = { seenSeq: 4, lastSyncMs: 7, retryKeys: ['k'], dirs: ['a', 'b'] }
    const pulls = [
      { started: { seenSeq: 9, lastSyncMs: null, retryKeys: [] }, failed: new Set(['x']), done: new Set(['y']) },
      { started: { seenSeq: 9, lastSyncMs: null, retryKeys: [] }, failed: new Set<string>(), done: new Set<string>() },
      { started: null, failed: new Set(['b']), done: new Set(['a']) },
      { started: null, failed: new Set<string>(), done: new Set(['a', 'b']) },
    ]
    for (const p of pulls) {
      expect(cli.nextBootstrapPending(prev, p)).toEqual(nextBootstrapPending(prev, p))
      expect(cli.nextBootstrapPending(null, p)).toEqual(nextBootstrapPending(null, p))
    }
  })
})

describe('mergeSectionText — CLI mirror', () => {
  it('same constants, templates and labels (EN mirror of the app; ES mirror of electron/i18n.ts)', async () => {
    expect(cli.DEFAULT_SECTION_CONFLICT_LABELS).toEqual(DEFAULT_SECTION_CONFLICT_LABELS)
    expect(cli.SECTION_CONFLICT_LABEL_TEMPLATES.en).toEqual(SECTION_CONFLICT_LABEL_TEMPLATES_EN)
    const { getMessages } = await import('../../electron/i18n')
    expect(cli.SECTION_CONFLICT_LABEL_TEMPLATES.en).toEqual(getMessages('en').sync.conflictMarkers)
    expect(cli.SECTION_CONFLICT_LABEL_TEMPLATES.es).toEqual(getMessages('es').sync.conflictMarkers)
    const now = new Date(2026, 10, 6, 9, 38)
    for (const lang of ['en', 'es']) for (const device of ['DESKTOP-ABC (CLI)', '', 'a$&b']) {
      expect(cli.sectionConflictLabels(cli.SECTION_CONFLICT_LABEL_TEMPLATES[lang], device, now))
        .toEqual(sectionConflictLabels(cli.SECTION_CONFLICT_LABEL_TEMPLATES[lang], device, now))
    }
  })

  it('same result over a grid of bases × local × remote (endings, final newlines, conflicts, appends)', () => {
    const texts = [
      '', '\n', 'a', 'a\n', 'a\nb\nc', 'a\nb\nc\n', 'a\r\nb\r\nc\r\n', 'a\nb\nc\nd', 'a\nB\nc', 'x\na\nb\nc',
      'a\nb\nc\nd\ne', 'a\nc', '- [ ] one\n- [ ] two\n- [ ] three', 'a\n\n\nb', 'z',
    ]
    let compared = 0
    for (const base of [null, ...texts]) for (const local of texts) for (const remote of texts) {
      expect(cli.mergeSectionText(base, local, remote)).toEqual(mergeSectionText(base, local, remote))
      compared++
    }
    expect(compared).toBe((texts.length + 1) * texts.length * texts.length)
  })

  it('same result on large / random inputs (Myers path, the distance cap)', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const mutate = (lines: string[]) => lines.flatMap((l) => (rnd() < 0.1 ? [] : rnd() < 0.1 ? [l, `n${Math.floor(rnd() * 50)}`] : rnd() < 0.05 ? [`c${l}`] : [l]))
    for (let t = 0; t < 30; t++) {
      const base = Array.from({ length: 60 + Math.floor(rnd() * 200) }, (_, i) => `l${i % 37}`)
      const b = base.join('\n')
      const l = mutate(base).join('\n')
      const r = mutate(base).join('\n')
      expect(cli.mergeSectionText(b, l, r)).toEqual(mergeSectionText(b, l, r))
      expect(cli.mergeSectionText(null, l, r)).toEqual(mergeSectionText(null, l, r))
    }
    const big = (p: string) => Array.from({ length: 2500 }, (_, i) => `${p}${i}`).join('\n')
    expect(cli.mergeSectionText(null, big('a'), big('b'))).toEqual(mergeSectionText(null, big('a'), big('b')))
  })
})
