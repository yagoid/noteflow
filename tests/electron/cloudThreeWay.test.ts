// Three-way reconcile of the NoteFlow Cloud pull (bases + migration 0014).
// The bug it fixes (reproduced in production): the pull decided a folder by
// note.md's `updated:` alone, so a laptop that edited one section OFFLINE
// after another device had uploaded edits of OTHER sections kept its whole
// folder ("newer"), re-queued every file and the 0011 upload (updated_at rule)
// accepted them — the remote sections were clobbered everywhere, no copy.
// Pure decisions of electron/cloudSyncLogic.ts + the base map of
// electron/syncState.ts, plus a scenario simulation against an in-memory
// server that mirrors the SQL of 0014.
import { describe, it, expect } from 'vitest'
import yaml from 'js-yaml'
import {
  hashForBase,
  planFileReconcile,
  mergeAnchors,
  planThreeWayDir,
  filesNeedingCatchUp,
  classifyBaseUpsert,
  needsBasesBootstrap,
  planPullQuery,
  synthesizeBootstrapBases,
  staleResolvePullDelay,
  STALE_PULL_DELAY_MS,
  STALE_PULL_MIN_INTERVAL_MS,
  UNKNOWN_BASE_HASH,
  buildConflictCopy,
  TOMBSTONE_BASE_HASH,
  parseBootstrapPending,
  nextBootstrapPending,
  DEFAULT_SECTION_CONFLICT_LABELS,
  type ThreeWayRemoteRow,
  type ThreeWayDirPlan,
} from '../../electron/cloudSyncLogic'
import {
  emptySyncState,
  parseSyncState,
  serializeSyncState,
  setCloudBase,
  getCloudBase,
  dropCloudBasesUnder,
  journalRecord,
  journalMarkConflictCopied,
  type CloudBase,
} from '../../electron/syncState'
import { serializeNoteFolder, splitFrontmatter, NOTE_MD, type DiskNote } from '../../electron/noteFormat'

const DIR = 'noteflow-abc12345'
const ANCHOR = `${DIR}/${NOTE_MD}`
const T_FRI = '2026-10-30T18:00:00.000Z'
const T_SUN = '2026-11-01T20:00:00.000Z'
const T_MON = '2026-11-02T10:03:00.000Z'
const NOW = '2026-11-02T10:30:00.000Z'

type Sections = Record<string, string> // section id → content

function note(updated: string, sections: Sections, extra?: Partial<DiskNote>): DiskNote {
  return {
    id: 'abc12345',
    title: 'NOTEFLOW',
    tags: ['dev'],
    created: '2026-10-01T00:00:00.000Z',
    updated,
    sections: Object.entries(sections).map(([id, content]) => ({ id, name: id.toUpperCase(), content })),
    ...extra,
  }
}

/** relPath → content of a serialized note folder. */
function folder(n: DiskNote): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, content] of Object.entries(serializeNoteFolder(n, { preserveUpdated: true }).files)) {
    out[`${DIR}/${name}`] = content
  }
  return out
}

/** A section merged two-way/diff3 where both sides changed the same (only) line: both versions between markers. */
function markers(local: string, remote: string): string {
  const L = DEFAULT_SECTION_CONFLICT_LABELS
  return [`> ${L.local}`, '', local, '', `> ${L.remote}`, '', remote, '', `> ${L.end}`].join('\n')
}

function frontmatterOf(anchor: string): Record<string, unknown> {
  return yaml.load(splitFrontmatter(anchor).frontmatter) as Record<string, unknown>
}

function sectionFiles(anchor: string): string[] {
  const fm = frontmatterOf(anchor)
  return (fm.sections as Array<{ file: string }>).map((s) => s.file)
}

const FRIDAY: Sections = { errors: 'errors v1', features: 'features v1', ideas: 'ideas v1' }

// ── hashForBase ───────────────────────────────────────────────────────────────

describe('hashForBase', () => {
  it('hashes note.md without its `updated:` line, sections byte for byte', () => {
    const a = folder(note(T_FRI, FRIDAY))[ANCHOR]
    const b = folder(note(T_MON, FRIDAY))[ANCHOR]
    expect(a).not.toBe(b)
    expect(hashForBase(ANCHOR, a)).toBe(hashForBase(ANCHOR, b))
    expect(hashForBase(ANCHOR, a)).not.toBe(hashForBase(ANCHOR, folder(note(T_FRI, FRIDAY, { title: 'Other' }))[ANCHOR]))
    expect(hashForBase(`${DIR}/errors.md`, 'x')).not.toBe(hashForBase(`${DIR}/errors.md`, 'x '))
    expect(hashForBase(`${DIR}/errors.md`, 'x')).toMatch(/^[0-9a-f]{64}$/)
    expect(TOMBSTONE_BASE_HASH).toBe('')
  })
})

// ── planFileReconcile ─────────────────────────────────────────────────────────

describe('planFileReconcile', () => {
  const base: CloudBase = { seq: 10, hash: 'B' }
  const plan = (o: Partial<Parameters<typeof planFileReconcile>[0]>) =>
    planFileReconcile({ base, localHash: 'B', pending: false, remoteSeq: 12, remoteHash: 'R', ...o })

  it('no base or no usable seq → legacy (historical rules)', () => {
    expect(plan({ base: undefined })).toBe('legacy')
    expect(plan({ remoteSeq: null })).toBe('legacy')
  })
  it('a row older than the base is ignored; the same seq means the remote did not move', () => {
    expect(plan({ remoteSeq: 9 })).toBe('outdated')
    expect(plan({ remoteSeq: 10, localHash: 'L', pending: true })).toBe('keep')
  })
  it('only the remote changed → apply (content or tombstone)', () => {
    expect(plan({})).toBe('apply')
    expect(plan({ remoteHash: null })).toBe('apply')
  })
  it('a pending upsert counts as a local change even with the base content', () => {
    expect(plan({ pending: true })).toBe('conflict')
    expect(plan({ pending: true, remoteHash: 'B' })).toBe('adopt')
  })
  it('both changed to the same content → adopt; both gone → adopt', () => {
    expect(plan({ localHash: 'R' })).toBe('adopt')
    expect(plan({ localHash: null, remoteHash: null })).toBe('adopt')
  })
  it('remote tombstone over a local change → keep-local; local deletion vs remote edit → apply', () => {
    expect(plan({ localHash: 'L', remoteHash: null })).toBe('keep-local')
    expect(plan({ localHash: null })).toBe('apply')
  })
  it('both changed to different contents → conflict', () => {
    expect(plan({ localHash: 'L' })).toBe('conflict')
  })
})

// ── classifyBaseUpsert ────────────────────────────────────────────────────────

describe('classifyBaseUpsert (POST rpc/cloud_upsert_file_v2)', () => {
  it('a seq → uploaded with it (bigint may arrive as a string)', () => {
    expect(classifyBaseUpsert(200, 42)).toEqual({ outcome: 'uploaded', seq: 42 })
    expect(classifyBaseUpsert(200, '43')).toEqual({ outcome: 'uploaded', seq: 43 })
  })
  it('null → stale (the row moved past the base)', () => {
    expect(classifyBaseUpsert(200, null)).toEqual({ outcome: 'stale', seq: null })
  })
  it('unreadable success → uploaded without a seq (the caller forgets the base)', () => {
    expect(classifyBaseUpsert(200, true)).toEqual({ outcome: 'uploaded', seq: null })
  })
  it('missing function / RLS / other failures', () => {
    expect(classifyBaseUpsert(404, { code: 'PGRST202' }).outcome).toBe('missing')
    expect(classifyBaseUpsert(400, { code: 'PGRST202' }).outcome).toBe('missing')
    expect(classifyBaseUpsert(403, { code: '42501' }).outcome).toBe('forbidden')
    expect(classifyBaseUpsert(500, null).outcome).toBe('error')
  })
})

// ── mergeAnchors ──────────────────────────────────────────────────────────────

describe('mergeAnchors', () => {
  const baseAnchor = folder(note(T_FRI, FRIDAY))[ANCHOR]
  const baseHash = hashForBase(ANCHOR, baseAnchor)
  const files = new Set(['errors.md', 'features.md', 'ideas.md'])
  const merge = (local: string, remote: string, o?: Partial<Parameters<typeof mergeAnchors>[0]>) =>
    mergeAnchors({
      local,
      remote,
      baseHash,
      sectionFilesOnDisk: files,
      knownSectionFiles: files,
      folderKeepsLocalChanges: false,
      keptLocalSectionFiles: new Set(),
      nowIso: NOW,
      ...o,
    })

  it('same content: the remote, or the local when the folder keeps newer local edits', () => {
    const local = folder(note(T_MON, FRIDAY))[ANCHOR]
    const remote = folder(note(T_SUN, FRIDAY))[ANCHOR]
    expect(merge(local, remote)).toEqual({ content: remote, source: 'remote' })
    expect(merge(local, remote, { folderKeepsLocalChanges: true })).toEqual({ content: local, source: 'local' })
  })

  it('only the remote changed: remote, carrying the later local `updated` when local edits are kept', () => {
    const local = folder(note(T_MON, FRIDAY))[ANCHOR]
    const remote = folder(note(T_SUN, FRIDAY, { tags: ['dev', 'pc'] }))[ANCHOR]
    expect(merge(local, remote).source).toBe('remote')
    const bumped = merge(local, remote, { folderKeepsLocalChanges: true })
    expect(bumped.source).toBe('merged')
    expect(frontmatterOf(bumped.content).updated).toBe(T_MON)
    expect(frontmatterOf(bumped.content).tags).toEqual(['dev', 'pc'])
  })

  it('only the local changed → local', () => {
    const local = folder(note(T_MON, FRIDAY, { title: 'Renamed here' }))[ANCHOR]
    const remote = folder(note(T_SUN, FRIDAY))[ANCHOR]
    expect(merge(local, remote)).toEqual({ content: local, source: 'local' })
  })

  it('both changed: remote frontmatter + local-only sections whose file exists, updated = now', () => {
    const local = folder(note(T_MON, { ...FRIDAY, mine: 'new here' }))[ANCHOR]
    const remote = folder(note(T_SUN, { ...FRIDAY, theirs: 'new there' }, { title: 'Renamed there' }))[ANCHOR]
    const m = merge(local, remote, { sectionFilesOnDisk: new Set([...files, 'mine.md', 'theirs.md']) })
    expect(m.source).toBe('merged')
    const fm = frontmatterOf(m.content)
    expect(fm.title).toBe('Renamed there')
    expect(fm.updated).toBe(NOW)
    expect(sectionFiles(m.content)).toEqual(['errors.md', 'features.md', 'ideas.md', 'theirs.md', 'mine.md'])
    // A local-only section whose file is gone is not listed.
    const m2 = merge(local, remote, { sectionFilesOnDisk: new Set([...files, 'theirs.md']) })
    expect(sectionFiles(m2.content)).not.toContain('mine.md')
  })

  it('both changed: a remote-listed section deleted here since the base stays deleted', () => {
    const local = folder(note(T_MON, { errors: 'errors v1', features: 'features v1' }))[ANCHOR] // ideas deleted here
    const remote = folder(note(T_SUN, FRIDAY, { tags: ['pc'] }))[ANCHOR]
    const onDisk = new Set(['errors.md', 'features.md'])
    expect(sectionFiles(merge(local, remote, { sectionFilesOnDisk: onDisk }).content)).toEqual(['errors.md', 'features.md'])
    // …but one the device never knew (added remotely, its row on its way) is kept.
    expect(sectionFiles(merge(local, remote, { sectionFilesOnDisk: onDisk, knownSectionFiles: onDisk }).content)).toContain(
      'ideas.md',
    )
  })

  it('encrypted anchors that both changed cannot be merged → whole', () => {
    const enc = (u: string, c: string) => folder(note(u, {}, { encryption: { v: 1, ct: c } }))[ANCHOR]
    const base = enc(T_FRI, 'c0')
    const m = mergeAnchors({
      local: enc(T_MON, 'c1'),
      remote: enc(T_SUN, 'c2'),
      baseHash: hashForBase(ANCHOR, base),
      sectionFilesOnDisk: new Set(),
      knownSectionFiles: new Set(),
      folderKeepsLocalChanges: false,
      keptLocalSectionFiles: new Set(),
      nowIso: NOW,
    })
    expect(m).toEqual({ content: enc(T_SUN, 'c2'), source: 'whole' })
  })
})

// ── buildConflictCopy subset ──────────────────────────────────────────────────

describe('buildConflictCopy with onlySections', () => {
  it('copies only the listed sections and its note.md lists only them', () => {
    const local: Record<string, string> = {}
    for (const [rel, content] of Object.entries(folder(note(T_MON, FRIDAY)))) local[rel.slice(DIR.length + 1)] = content
    const copy = buildConflictCopy(local, { newId: 'zz99yy88', title: 'NOTEFLOW (copy)', nowIso: NOW, onlySections: ['features.md'] })
    expect(Object.keys(copy.files).sort()).toEqual(['features.md', NOTE_MD])
    expect(copy.files['features.md']).toBe('features v1')
    expect(sectionFiles(copy.files[NOTE_MD])).toEqual(['features.md'])
    expect(frontmatterOf(copy.files[NOTE_MD]).id).toBe('zz99yy88')
  })
})

// ── filesNeedingCatchUp ───────────────────────────────────────────────────────

describe('filesNeedingCatchUp', () => {
  const f = folder(note(T_MON, { ...FRIDAY, errors: 'errors v2' }))
  const files = Object.entries(f).map(([relPath, content]) => ({ relPath, content }))
  const fri = folder(note(T_FRI, FRIDAY))
  const bases: Record<string, CloudBase> = {}
  Object.entries(fri).forEach(([rel, content], i) => (bases[rel] = { seq: i + 1, hash: hashForBase(rel, content) }))

  it('with bases: only the files that differ from them (note.md ignores `updated:`)', () => {
    expect(filesNeedingCatchUp(files, bases, true)).toEqual([`${DIR}/errors.md`])
    expect(filesNeedingCatchUp(files, bases, false)).toEqual([`${DIR}/errors.md`])
  })
  it('without bases: the historical folder gate decides', () => {
    expect(filesNeedingCatchUp(files, {}, true)).toEqual(files.map((x) => x.relPath))
    expect(filesNeedingCatchUp(files, {}, false)).toEqual([])
  })
})

// ── syncState: bases ──────────────────────────────────────────────────────────

describe('SyncState.bases', () => {
  it('round-trips, drops malformed entries and is omitted while empty (GitHub file shape)', () => {
    const state = emptySyncState()
    expect(serializeSyncState(state)).not.toContain('bases')
    expect(setCloudBase(state, ANCHOR, { seq: 3, hash: 'h' })).toBe(true)
    expect(setCloudBase(state, ANCHOR, { seq: 3, hash: 'h' })).toBe(false)
    expect(parseSyncState(serializeSyncState(state))).toEqual(state)
    const raw = JSON.stringify({
      version: 1,
      ops: {},
      shas: {},
      bases: { a: { seq: 1, hash: 'x' }, b: { seq: -1, hash: 'x' }, c: { seq: 1.5, hash: 'x' }, d: { seq: 2 }, e: 'nope' },
    })
    expect(parseSyncState(raw).bases).toEqual({ a: { seq: 1, hash: 'x' } })
    expect(parseSyncState('{"version":1,"ops":{},"shas":{}}').bases).toEqual({})
  })

  it('setCloudBase(null) / dropCloudBasesUnder forget bases', () => {
    const state = emptySyncState()
    setCloudBase(state, ANCHOR, { seq: 1, hash: 'a' })
    setCloudBase(state, `${DIR}/errors.md`, { seq: 2, hash: 'b' })
    setCloudBase(state, 'other-x/note.md', { seq: 3, hash: 'c' })
    expect(setCloudBase(state, `${DIR}/errors.md`, null)).toBe(true)
    expect(setCloudBase(state, `${DIR}/errors.md`, null)).toBe(false)
    expect(dropCloudBasesUnder(state, DIR)).toBe(true)
    expect(getCloudBase(state, ANCHOR)).toBeUndefined()
    expect(getCloudBase(state, 'other-x/note.md')).toEqual({ seq: 3, hash: 'c' })
  })

  it('journalMarkConflictCopied flags only the given pending upserts', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/errors.md`, 'upsert', NOW)
    journalRecord(state, `${DIR}/features.md`, 'upsert', NOW)
    expect(journalMarkConflictCopied(state, [`${DIR}/errors.md`, `${DIR}/gone.md`])).toBe(true)
    expect(state.ops[`${DIR}/errors.md`].conflictCopied).toBe(true)
    expect(state.ops[`${DIR}/features.md`].conflictCopied).toBeUndefined()
    expect(journalMarkConflictCopied(state, [`${DIR}/errors.md`])).toBe(false)
  })
})

// ── Scenario: offline edit vs remote edits of other sections ──────────────────
// In-memory server with the semantics of cloud_upsert_file_v2 (0014) and two
// devices that pull (planThreeWayDir), execute the plan and upload what is
// pending — the same loop as cloudSync.ts, minus IO and crypto.

interface Row {
  seq: number
  content: string | null
  updatedAt: number
}

class Server {
  rows = new Map<string, Row>()
  private seq = 0
  /** cloud_upsert_file_v2: new seq, or null when stale. */
  upsert(rel: string, content: string, updatedAt: number, baseSeq: number | null): number | null {
    const row = this.rows.get(rel)
    if (baseSeq !== null) {
      if (row && row.seq !== baseSeq) return null
    } else {
      const anchor = this.rows.get(`${rel.split('/')[0]}/${NOTE_MD}`)
      const newest = Math.max(row?.updatedAt ?? -Infinity, anchor?.updatedAt ?? -Infinity)
      if (newest > updatedAt) return null
    }
    const seq = ++this.seq
    this.rows.set(rel, { seq, content, updatedAt })
    return seq
  }
  /** The tombstone PATCH of a section delete (updated_at = deletion time). */
  tombstone(rel: string, at: number) {
    this.rows.set(rel, { seq: ++this.seq, content: null, updatedAt: at })
  }
  since(afterSeq: number): Array<[string, Row]> {
    return [...this.rows.entries()].filter(([, r]) => r.seq > afterSeq).sort((a, b) => a[1].seq - b[1].seq)
  }
  content(rel: string): string | null | undefined {
    return this.rows.get(rel)?.content
  }
}

class Device {
  files: Record<string, string> = {}
  bases: Record<string, CloudBase> = {}
  pending = new Set<string>()
  stale = new Set<string>()
  pullSeq = 0
  copies: Array<Record<string, string>> = []
  lastPlan: ThreeWayDirPlan | null = null
  /** The base content store (cloudBaseStore.ts): hash → content of section bases. */
  blobs = new Map<string, string>()

  constructor(private server: Server, private nowIso: string) {}

  /** A save of the editor: note.md + the sections that changed, journaled. */
  save(n: DiskNote, changedSections: string[]) {
    const f = folder(n)
    for (const rel of [ANCHOR, ...changedSections.map((id) => `${DIR}/${id}.md`)]) {
      this.files[rel] = f[rel]
      this.pending.add(rel)
      this.stale.delete(rel)
    }
  }

  private anchorUpdatedMs(): number {
    return Date.parse(String(frontmatterOf(this.files[ANCHOR]).updated))
  }

  /** Drains the journal (upload of the on-disk content with the base seq). */
  upload() {
    for (const rel of [...this.pending]) {
      if (this.stale.has(rel)) continue
      const content = this.files[rel]
      const seq = this.server.upsert(rel, content, this.anchorUpdatedMs(), this.bases[rel]?.seq ?? null)
      if (seq === null) {
        this.stale.add(rel)
        continue
      }
      this.bases[rel] = { seq, hash: hashForBase(rel, content) }
      if (rel !== ANCHOR) this.blobs.set(hashForBase(rel, content), content)
      this.pending.delete(rel)
    }
  }

  /**
   * One pull of the folder (three-way: the anchor base is known). `bootstrap`
   * = the one-time bases bootstrap of a device that synced with a build
   * without bases: every row is re-read and bases are synthesized
   * (synthesizeBootstrapBases), with `lastSyncMs` of its previous sync.
   */
  pull(bootstrap?: { lastSyncMs: number }) {
    const rows = this.server.since(bootstrap ? 0 : this.pullSeq)
    if (rows.length === 0) return
    const remote: ThreeWayRemoteRow[] = rows.map(([relPath, r]) => ({
      relPath,
      seq: r.seq,
      content: r.content,
      updatedAtMs: r.updatedAt,
    }))
    let bases = this.bases
    if (bootstrap) {
      const synth = synthesizeBootstrapBases({
        dir: DIR,
        local: { ...this.files },
        remote,
        bases: this.bases,
        pendingUpserts: new Set(this.pending),
        seenSeq: this.pullSeq,
        notSeen: new Set(),
        lastSyncMs: bootstrap.lastSyncMs,
      })
      Object.assign(this.bases, synth.seen)
      for (const r of remote) if (r.content !== null && r.relPath !== ANCHOR) this.blobs.set(hashForBase(r.relPath, r.content), r.content)
      bases = { ...synth.assumed, ...this.bases }
    }
    const plan = planThreeWayDir({
      dir: DIR,
      local: { ...this.files },
      remote,
      bases,
      pendingUpserts: new Set(this.pending),
      staleUpserts: new Set(this.stale),
      copiedUpserts: new Set(),
      pendingDeletes: new Set(),
      baseContent: (_rel, hash) => this.blobs.get(hash) ?? null,
      nowIso: this.nowIso,
    })
    this.lastPlan = plan
    for (const [rel, content] of Object.entries(plan.baseContents)) this.blobs.set(hashForBase(rel, content), content)
    if (plan.copySections.length > 0) {
      const local: Record<string, string> = {}
      for (const [rel, content] of Object.entries(this.files)) local[rel.slice(DIR.length + 1)] = content
      this.copies.push(
        buildConflictCopy(local, { newId: 'copy0001', title: 'copy', nowIso: this.nowIso, onlySections: plan.copySections }).files,
      )
    }
    for (const rel of plan.removes) delete this.files[rel]
    for (const w of plan.writes) this.files[w.relPath] = w.content
    for (const [rel, base] of Object.entries(plan.bases)) {
      if (base) this.bases[rel] = base
      else delete this.bases[rel]
    }
    for (const rel of plan.settle) {
      this.pending.delete(rel)
      this.stale.delete(rel)
    }
    for (const rel of plan.upload) {
      this.pending.add(rel)
      this.stale.delete(rel)
    }
    this.pullSeq = Math.max(...rows.map(([, r]) => r.seq))
    // First pull after the gate reopens: catch-up of what differs from its base.
    const files = Object.entries(this.files).map(([relPath, content]) => ({ relPath, content }))
    for (const rel of filesNeedingCatchUp(files, this.bases, false)) this.pending.add(rel)
  }
}

/** Both devices synced on Friday: same files, same bases. */
function syncedFriday() {
  const server = new Server()
  const fri = folder(note(T_FRI, FRIDAY))
  for (const [rel, content] of Object.entries(fri)) server.upsert(rel, content, Date.parse(T_FRI), null)
  const mk = () => {
    const d = new Device(server, NOW)
    d.files = { ...fri }
    for (const [rel, r] of server.rows) {
      d.bases[rel] = { seq: r.seq, hash: hashForBase(rel, r.content as string) }
      if (rel !== ANCHOR) d.blobs.set(hashForBase(rel, r.content as string), r.content as string)
    }
    d.pullSeq = Math.max(...[...server.rows.values()].map((r) => r.seq))
    return d
  }
  return { server, laptop: mk(), pc: mk() }
}

/** Both devices sync one more version of the note (`sections`) — it becomes their base everywhere. */
function syncedWith(sections: Sections, server: Server, ...devices: Device[]): Sections {
  const [first, ...rest] = devices
  first.save(note(T_FRI, sections), Object.keys(sections))
  first.upload()
  for (const d of rest) d.pull()
  return sections
}

describe('scenario: laptop edits offline while the PC edited other sections', () => {
  it('merges: section A from the laptop + B and C from the PC, no conflict copy, nothing clobbered', () => {
    const { server, laptop, pc } = syncedFriday()
    // Weekend: the PC edits Errors and Features and syncs.
    pc.save(note(T_SUN, { ...FRIDAY, errors: 'errors PC', features: 'features PC' }), ['errors', 'features'])
    pc.upload()
    expect(pc.pending.size).toBe(0)
    // Monday: the laptop boots OFFLINE and edits Ideas (journaled, gate closed).
    laptop.save(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' }), ['ideas'])
    // Back online: pull FIRST (it used to see "local newer" and keep everything).
    laptop.pull()
    expect(laptop.copies).toEqual([])
    expect(laptop.files[`${DIR}/errors.md`]).toBe('errors PC')
    expect(laptop.files[`${DIR}/features.md`]).toBe('features PC')
    expect(laptop.files[`${DIR}/ideas.md`]).toBe('ideas laptop')
    // The anchor keeps the laptop's later `updated` (its edit is the newest) and goes up.
    expect(frontmatterOf(laptop.files[ANCHOR]).updated).toBe(T_MON)
    expect([...laptop.pending].sort()).toEqual([`${DIR}/ideas.md`, ANCHOR])
    // Only what the laptop changed is uploaded — never the PC's sections.
    laptop.upload()
    expect(laptop.pending.size).toBe(0)
    expect(server.content(`${DIR}/errors.md`)).toBe('errors PC')
    expect(server.content(`${DIR}/features.md`)).toBe('features PC')
    expect(server.content(`${DIR}/ideas.md`)).toBe('ideas laptop')
    // The PC converges to the same note.
    pc.pull()
    expect(pc.copies).toEqual([])
    expect(pc.files).toEqual(laptop.files)
    expect(pc.pending.size).toBe(0)
  })

  it('both edited the same line of a section: both versions stay IN the note between markers, no copy', () => {
    const { server, laptop, pc } = syncedFriday()
    pc.save(note(T_SUN, { ...FRIDAY, errors: 'errors PC', features: 'features PC' }), ['errors', 'features'])
    pc.upload()
    laptop.save(note(T_MON, { ...FRIDAY, errors: 'errors laptop', ideas: 'ideas laptop' }), ['errors', 'ideas'])
    laptop.pull()
    // The note: C (features) from the PC, A (ideas) from the laptop, B (errors) with both.
    expect(laptop.files[`${DIR}/errors.md`]).toBe(markers('errors laptop', 'errors PC'))
    expect(laptop.files[`${DIR}/features.md`]).toBe('features PC')
    expect(laptop.files[`${DIR}/ideas.md`]).toBe('ideas laptop')
    expect(laptop.lastPlan?.copySections).toEqual([])
    expect(laptop.lastPlan?.conflictMarkerSections).toEqual(['errors.md'])
    expect(laptop.copies).toEqual([])
    // The merged section goes up on top of the PC's seq (its base now).
    expect(laptop.bases[`${DIR}/errors.md`]).toEqual({ seq: server.rows.get(`${DIR}/errors.md`)!.seq, hash: hashForBase(`${DIR}/errors.md`, 'errors PC') })
    expect(laptop.pending.has(`${DIR}/errors.md`)).toBe(true)
    laptop.upload()
    expect(laptop.pending.size).toBe(0)
    expect(server.content(`${DIR}/errors.md`)).toBe(markers('errors laptop', 'errors PC'))
    expect(server.content(`${DIR}/ideas.md`)).toBe('ideas laptop')
    expect(server.content(`${DIR}/features.md`)).toBe('features PC')
    pc.pull()
    expect(pc.files).toEqual(laptop.files)
    expect(pc.copies).toEqual([])
  })

  it('both edited ONLY the same section, on different lines: a clean merge, uploaded, no copy', () => {
    const { server, laptop, pc } = syncedFriday()
    const v1 = 'one\ntwo\nthree'
    const synced = syncedWith({ ...FRIDAY, errors: v1 }, server, laptop, pc)
    pc.save(note(T_SUN, { ...synced, errors: 'one PC\ntwo\nthree' }), ['errors'])
    pc.upload()
    laptop.save(note(T_MON, { ...synced, errors: 'one\ntwo\nthree laptop' }), ['errors'])
    laptop.pull()
    expect(laptop.lastPlan?.copySections).toEqual([])
    expect(laptop.lastPlan?.conflictMarkerSections).toEqual([])
    expect(laptop.files[`${DIR}/errors.md`]).toBe('one PC\ntwo\nthree laptop')
    laptop.upload()
    expect(server.content(`${DIR}/errors.md`)).toBe('one PC\ntwo\nthree laptop')
    pc.pull()
    expect(pc.files).toEqual(laptop.files)
  })

  it('the historical bug, for the record: the 0011 rule (no bases) lets the offline laptop clobber the PC', () => {
    const { server, laptop, pc } = syncedFriday()
    pc.save(note(T_SUN, { ...FRIDAY, errors: 'errors PC' }), ['errors'])
    pc.upload()
    laptop.save(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' }), ['ideas'])
    // Without bases, every file of the folder re-queued by the old catch-up
    // goes up through the updated_at rule — and the laptop is "newer".
    for (const [rel, content] of Object.entries(laptop.files)) {
      server.upsert(rel, content, Date.parse(T_MON), null)
    }
    expect(server.content(`${DIR}/errors.md`)).toBe('errors v1') // the PC's edit is gone
  })
})

// ── planThreeWayDir: other rows ───────────────────────────────────────────────

describe('planThreeWayDir', () => {
  const fri = folder(note(T_FRI, FRIDAY))
  const bases: Record<string, CloudBase> = {}
  Object.entries(fri).forEach(([rel, content], i) => (bases[rel] = { seq: i + 1, hash: hashForBase(rel, content) }))
  const input = (o: Partial<Parameters<typeof planThreeWayDir>[0]>) =>
    planThreeWayDir({
      dir: DIR,
      local: fri,
      remote: [],
      bases,
      pendingUpserts: new Set(),
      staleUpserts: new Set(),
      copiedUpserts: new Set(),
      pendingDeletes: new Set(),
      nowIso: NOW,
      ...o,
    })
  const row = (file: string, seq: number, content: string | null): ThreeWayRemoteRow => ({
    relPath: `${DIR}/${file}`,
    seq,
    content,
    updatedAtMs: Date.parse(T_SUN),
  })

  it('a remote tombstone of an untouched section removes it and drops its base', () => {
    const plan = input({ remote: [row('ideas.md', 20, null)] })
    expect(plan.removes).toEqual([`${DIR}/ideas.md`])
    expect(plan.bases[`${DIR}/ideas.md`]).toBeNull()
  })

  it('a remote tombstone of a locally edited section keeps it and re-uploads it on top of the tombstone', () => {
    const local = { ...folder(note(T_MON, FRIDAY)), [`${DIR}/ideas.md`]: 'ideas laptop' }
    const plan = input({ local, remote: [row('ideas.md', 20, null)], pendingUpserts: new Set([`${DIR}/ideas.md`]) })
    expect(plan.removes).toEqual([])
    expect(plan.bases[`${DIR}/ideas.md`]).toEqual({ seq: 20, hash: TOMBSTONE_BASE_HASH })
    expect(plan.upload).toEqual([`${DIR}/ideas.md`])
    expect(plan.force).toEqual([])
    // A tombstone NEWER than the local version: forced (an updated_at fallback would reject it).
    const older = { ...fri, [`${DIR}/ideas.md`]: 'ideas laptop' }
    const forced = input({ local: older, remote: [row('ideas.md', 20, null)], pendingUpserts: new Set([`${DIR}/ideas.md`]) })
    expect(forced.upload).toEqual([`${DIR}/ideas.md`])
    expect(forced.force).toEqual([`${DIR}/ideas.md`])
  })

  it('a section with a pending local delete is never written back', () => {
    const plan = input({ remote: [row('ideas.md', 20, 'ideas PC')], pendingDeletes: new Set([`${DIR}/ideas.md`]) })
    expect(plan.writes).toEqual([])
  })

  it('a row older than the base (this device uploaded since) is ignored', () => {
    const plan = input({ remote: [row('errors.md', 1, 'stale echo')] })
    expect(plan).toMatchObject({ writes: [], removes: [], settle: [], upload: [] })
  })

  it('a stale op whose row did not move is re-queued (the drain skips stale ops)', () => {
    const local = { ...fri, [`${DIR}/errors.md`]: 'errors laptop' }
    const plan = input({
      local,
      remote: [row('errors.md', bases[`${DIR}/errors.md`].seq, 'errors v1')],
      pendingUpserts: new Set([`${DIR}/errors.md`]),
      staleUpserts: new Set([`${DIR}/errors.md`]),
    })
    expect(plan.upload).toEqual([`${DIR}/errors.md`])
    expect(plan.writes).toEqual([])
  })

  it('a section both changed is merged with the base content (diff3), recorded as the new base content', () => {
    const rel = `${DIR}/errors.md`
    const local = { ...fri, [rel]: 'errors v1\nlaptop line' }
    const plan = input({
      local,
      remote: [row('errors.md', 20, 'PC line\nerrors v1')],
      pendingUpserts: new Set([rel]),
      baseContent: (r, hash) => (r === rel && hash === bases[rel].hash ? 'errors v1' : null),
    })
    expect(plan.writes).toEqual([{ relPath: rel, content: 'PC line\nerrors v1\nlaptop line' }])
    expect(plan.bases[rel]).toEqual({ seq: 20, hash: hashForBase(rel, 'PC line\nerrors v1') })
    expect(plan.baseContents[rel]).toBe('PC line\nerrors v1')
    expect(plan.upload).toContain(rel)
    expect(plan.settle).not.toContain(rel)
    expect(plan.conflictMarkerSections).toEqual([])
    // A blob that does not match the base hash is ignored (two-way union: same result here).
    const wrong = input({ local, remote: [row('errors.md', 20, 'PC line\nerrors v1')], pendingUpserts: new Set([rel]), baseContent: () => 'garbage' })
    expect(wrong.writes).toEqual(plan.writes)
  })

  it('a merge that ends equal to the remote is applied (settled, nothing to upload)', () => {
    const rel = `${DIR}/errors.md`
    const plan = input({
      local: { ...fri, [rel]: 'errors v1\nshared' },
      remote: [row('errors.md', 20, 'errors v1\nshared\nmore')],
      pendingUpserts: new Set([rel]),
      baseContent: () => 'errors v1',
    })
    expect(plan.writes).toEqual([{ relPath: rel, content: 'errors v1\nshared\nmore' }])
    expect(plan.settle).toContain(rel)
    expect(plan.upload).not.toContain(rel)
  })

  it('an encrypted note is never merged: copy of the section (and a copy already made is not made again)', () => {
    const rel = `${DIR}/errors.md`
    const encLocal = { ...fri, [ANCHOR]: fri[ANCHOR].replace(/^title:/m, 'encryption:\n  v: 1\ntitle:'), [rel]: 'errors laptop' }
    const plan = input({ local: encLocal, remote: [row('errors.md', 20, 'errors PC')], pendingUpserts: new Set([rel]) })
    expect(plan.copySections).toEqual(['errors.md'])
    expect(plan.writes).toEqual([{ relPath: rel, content: 'errors PC' }])
    const again = input({
      local: encLocal,
      remote: [row('errors.md', 20, 'errors PC')],
      pendingUpserts: new Set([rel]),
      copiedUpserts: new Set([rel]),
    })
    expect(again.copySections).toEqual([])
    expect(again.writes).toEqual([{ relPath: rel, content: 'errors PC' }])
  })

  it('the merge failing (safety net) falls back to the conflict copy', () => {
    const rel = `${DIR}/errors.md`
    const plan = input({
      local: { ...fri, [rel]: 'errors laptop' },
      remote: [row('errors.md', 20, 'errors PC')],
      pendingUpserts: new Set([rel]),
      baseContent: () => {
        throw new Error('disk')
      },
    })
    expect(plan.copySections).toEqual(['errors.md'])
    expect(plan.writes).toEqual([{ relPath: rel, content: 'errors PC' }])
  })

  it('a row without a base keeps the historical per-section rule (anchor `updated` decides; pending → two-way merge)', () => {
    const noIdeas = { ...bases }
    delete noIdeas[`${DIR}/ideas.md`]
    const local = { ...folder(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' })) }
    // Remote older than the local anchor → kept.
    expect(input({ local, bases: noIdeas, remote: [row('ideas.md', 20, 'ideas PC')] }).writes).toEqual([])
    // Remote newer + pending local edit → merged two-way (no base content): both versions.
    const newer = { ...row('ideas.md', 20, 'ideas PC'), updatedAtMs: Date.parse(NOW) }
    const plan = input({ local, bases: noIdeas, remote: [newer], pendingUpserts: new Set([`${DIR}/ideas.md`]) })
    expect(plan.writes.find((w) => w.relPath === `${DIR}/ideas.md`)?.content).toBe(markers('ideas laptop', 'ideas PC'))
    expect(plan.copySections).toEqual([])
    expect(plan.conflictMarkerSections).toEqual(['ideas.md'])
  })

  it('an encrypted note in conflict: the remote wins wholesale and the whole local folder is copied', () => {
    const enc = (u: string, c: string) => folder(note(u, {}, { encryption: { v: 1, ct: c } }))
    const base = enc(T_FRI, 'c0')
    const local = enc(T_MON, 'c1')
    const remote = enc(T_SUN, 'c2')
    const plan = input({
      local,
      bases: { [ANCHOR]: { seq: 5, hash: hashForBase(ANCHOR, base[ANCHOR]) } },
      remote: [{ relPath: ANCHOR, seq: 9, content: remote[ANCHOR], updatedAtMs: Date.parse(T_SUN) }],
      pendingUpserts: new Set([ANCHOR]),
    })
    expect(plan.copyWhole).toBe(true)
    expect(plan.writes).toEqual([{ relPath: ANCHOR, content: remote[ANCHOR] }])
    expect(plan.settle).toContain(ANCHOR)
    expect(plan.upload).toEqual([])
    expect(plan.bases[ANCHOR]).toEqual({ seq: 9, hash: hashForBase(ANCHOR, remote[ANCHOR]) })
  })

  it('writes sections before note.md', () => {
    const remote = folder(note(T_SUN, { ...FRIDAY, errors: 'errors PC' }, { tags: ['pc'] }))
    const plan = input({
      local: folder(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' })),
      remote: [
        { relPath: ANCHOR, seq: 20, content: remote[ANCHOR], updatedAtMs: Date.parse(T_SUN) },
        row('errors.md', 21, 'errors PC'),
      ],
      pendingUpserts: new Set([ANCHOR, `${DIR}/ideas.md`]),
    })
    expect(plan.writes.map((w) => w.relPath)).toEqual([`${DIR}/errors.md`, ANCHOR])
    // Remote frontmatter (tags) + the later local `updated`, uploaded on top of seq 20.
    const fm = frontmatterOf(plan.writes[1].content)
    expect(fm.tags).toEqual(['pc'])
    expect(fm.updated).toBe(T_MON)
    expect(plan.upload).toEqual([ANCHOR])
    expect(plan.bases[ANCHOR]).toEqual({ seq: 20, hash: hashForBase(ANCHOR, remote[ANCHOR]) })
  })
})

// ── One-time bases bootstrap (devices that synced before bases existed) ──────

describe('needsBasesBootstrap / planPullQuery(bootstrapBases)', () => {
  it('only a device with previous sync state that has not bootstrapped yet', () => {
    expect(needsBasesBootstrap({ pullSeq: 40 })).toBe(true)
    expect(needsBasesBootstrap({ lastSync: NOW })).toBe(true)
    expect(needsBasesBootstrap({ pullCursor: NOW })).toBe(true)
    expect(needsBasesBootstrap({ pullSeq: 40, basesBootstrapped: true })).toBe(false)
    expect(needsBasesBootstrap({})).toBe(false) // first sync: bases come with it
  })
  it('the bootstrap pull re-reads everything, tombstones included; otherwise unchanged', () => {
    expect(planPullQuery({ pullSeq: 40 }, { bootstrapBases: true })).toEqual({ afterSeq: 0, includeDeleted: true })
    expect(planPullQuery({ pullSeq: 40 })).toEqual({ afterSeq: 40, includeDeleted: true })
    expect(planPullQuery({}, { bootstrapBases: true })).toEqual({ afterSeq: 0, includeDeleted: false })
  })
})

describe('synthesizeBootstrapBases', () => {
  const local = folder(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' }))
  const row = (file: string, seq: number, content: string | null): ThreeWayRemoteRow => ({
    relPath: `${DIR}/${file}`,
    seq,
    content,
    updatedAtMs: Date.parse(T_SUN),
  })
  const synth = (o: Partial<Parameters<typeof synthesizeBootstrapBases>[0]>) =>
    synthesizeBootstrapBases({
      dir: DIR,
      local,
      remote: [],
      bases: {},
      pendingUpserts: new Set(),
      seenSeq: 10,
      notSeen: new Set(),
      lastSyncMs: Date.parse(T_FRI),
      ...o,
    })

  it('a row already seen (seq <= watermark) becomes a real base; a seen tombstone gets none', () => {
    const r = synth({ remote: [row('ideas.md', 3, 'ideas v1'), row('gone.md', 4, null)] })
    expect(r.seen).toEqual({ [`${DIR}/ideas.md`]: { seq: 3, hash: hashForBase(`${DIR}/ideas.md`, 'ideas v1') } })
    expect(r.assumed).toEqual({})
  })
  it('an unseen row: pending → unknown content; not pending → the local file is the base', () => {
    const r = synth({
      remote: [row('ideas.md', 12, 'ideas PC'), row('errors.md', 13, 'errors PC'), row('new.md', 14, 'new')],
      pendingUpserts: new Set([ANCHOR, `${DIR}/ideas.md`]),
    })
    expect(r.assumed[`${DIR}/ideas.md`]).toEqual({ seq: 11, hash: UNKNOWN_BASE_HASH })
    expect(r.assumed[`${DIR}/errors.md`]).toEqual({ seq: 12, hash: hashForBase(`${DIR}/errors.md`, 'errors v1') })
    expect(r.assumed[`${DIR}/new.md`]).toEqual({ seq: 13, hash: TOMBSTONE_BASE_HASH })
  })
  it('unjournaled local edits (note.md not pending but newer than lastSync) → unknown content for every unseen row', () => {
    const r = synth({ remote: [row('errors.md', 13, 'errors PC')] })
    expect(r.assumed[`${DIR}/errors.md`].hash).toBe(UNKNOWN_BASE_HASH)
  })
  it('retry-set rows count as unseen; files with a real base are left alone; no watermark = all unseen', () => {
    const r1 = synth({
      remote: [row('errors.md', 3, 'errors v1')],
      notSeen: new Set([`${DIR}/errors.md`]),
      lastSyncMs: Date.parse(NOW),
    })
    expect(r1.seen).toEqual({})
    expect(r1.assumed[`${DIR}/errors.md`].seq).toBe(2)
    const r2 = synth({ remote: [row('errors.md', 3, 'x')], bases: { [`${DIR}/errors.md`]: { seq: 3, hash: 'h' } } })
    expect(r2).toEqual({ seen: {}, assumed: {} })
    const r3 = synth({ remote: [row('errors.md', 3, 'errors v1')], seenSeq: null, lastSyncMs: Date.parse(NOW) })
    expect(Object.keys(r3.assumed)).toEqual([`${DIR}/errors.md`])
  })
})

/** Both devices synced on Friday, the laptop with a build WITHOUT bases (only its watermark). */
function syncedFridayLaptopWithoutBases() {
  const s = syncedFriday()
  s.laptop.bases = {}
  return s
}

describe('scenario: laptop just updated (no bases yet) edits offline before its first pull', () => {
  const lastSyncMs = Date.parse(T_FRI) + 60_000

  it('the bootstrap pull merges: the PC section is not lost, the laptop section is kept, no copy', () => {
    const { server, laptop, pc } = syncedFridayLaptopWithoutBases()
    pc.save(note(T_SUN, { ...FRIDAY, errors: 'errors PC' }), ['errors'])
    pc.upload()
    laptop.save(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' }), ['ideas'])
    laptop.pull({ lastSyncMs })
    expect(laptop.copies).toEqual([])
    expect(laptop.files[`${DIR}/errors.md`]).toBe('errors PC')
    expect(laptop.files[`${DIR}/ideas.md`]).toBe('ideas laptop')
    laptop.upload()
    expect(laptop.pending.size).toBe(0)
    expect(server.content(`${DIR}/errors.md`)).toBe('errors PC') // B survives
    expect(server.content(`${DIR}/ideas.md`)).toBe('ideas laptop')
    pc.pull()
    expect(pc.files).toEqual(laptop.files)
    // Every file of the folder now has a real base: later pulls are plain three-way.
    expect(Object.keys(laptop.bases).sort()).toEqual(Object.keys(laptop.files).sort())
  })

  it('both edited the same section: merged two-way (content unknown) — both versions in the note, never a silent overwrite', () => {
    const { server, laptop, pc } = syncedFridayLaptopWithoutBases()
    pc.save(note(T_SUN, { ...FRIDAY, errors: 'errors PC' }), ['errors'])
    pc.upload()
    laptop.save(note(T_MON, { ...FRIDAY, errors: 'errors laptop' }), ['errors'])
    laptop.pull({ lastSyncMs })
    expect(laptop.files[`${DIR}/errors.md`]).toBe(markers('errors laptop', 'errors PC'))
    expect(laptop.copies).toEqual([])
    laptop.upload()
    expect(server.content(`${DIR}/errors.md`)).toBe(markers('errors laptop', 'errors PC'))
  })

  it('no remote change: the offline edit is simply kept and uploaded (no spurious copy, the note is not reverted)', () => {
    const { server, laptop } = syncedFridayLaptopWithoutBases()
    laptop.save(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' }), ['ideas'])
    laptop.pull({ lastSyncMs })
    expect(laptop.copies).toEqual([])
    expect(laptop.files[`${DIR}/ideas.md`]).toBe('ideas laptop')
    laptop.upload()
    expect(server.content(`${DIR}/ideas.md`)).toBe('ideas laptop')
  })

  it('an UNJOURNALED local edit (Cloud disabled / CLI) of a section the PC also changed → both kept, not overwritten', () => {
    const { laptop, pc } = syncedFridayLaptopWithoutBases()
    pc.save(note(T_SUN, { ...FRIDAY, errors: 'errors PC' }), ['errors'])
    pc.upload()
    laptop.save(note(T_MON, { ...FRIDAY, errors: 'errors cli' }), ['errors'])
    laptop.pending.clear() // never journaled by the app
    laptop.pull({ lastSyncMs })
    expect(laptop.files[`${DIR}/errors.md`]).toBe(markers('errors cli', 'errors PC'))
    expect(laptop.copies).toEqual([])
  })
})

describe('staleResolvePullDelay', () => {
  it('debounces, with a floor between two stale-triggered pulls', () => {
    expect(staleResolvePullDelay(1_000_000, 0)).toBe(STALE_PULL_DELAY_MS)
    expect(staleResolvePullDelay(1_000_000, 1_000_000 - 5_000)).toBe(STALE_PULL_MIN_INTERVAL_MS - 5_000)
    expect(staleResolvePullDelay(1_000_000, 1_000_000 - 29_000)).toBe(STALE_PULL_DELAY_MS)
  })
})

// ── Review round: sections added / deleted remotely, anchor metadata, echoes ──

describe('review: a section ADDED on the other device while this one edited another offline', () => {
  it('planThreeWayDir writes the new section (no base, missing here) and the anchor lists it', () => {
    const fri = folder(note(T_FRI, FRIDAY))
    const bases: Record<string, CloudBase> = {}
    Object.entries(fri).forEach(([rel, content], i) => (bases[rel] = { seq: i + 1, hash: hashForBase(rel, content) }))
    const remote = folder(note(T_SUN, { ...FRIDAY, added: 'NEW REMOTE' }))
    const plan = planThreeWayDir({
      dir: DIR,
      local: folder(note(T_MON, { ...FRIDAY, errors: 'errors LOCAL' })),
      bases,
      remote: [
        { relPath: ANCHOR, seq: 10, content: remote[ANCHOR], updatedAtMs: Date.parse(T_SUN) },
        { relPath: `${DIR}/added.md`, seq: 11, content: 'NEW REMOTE', updatedAtMs: Date.parse(T_SUN) },
      ],
      pendingUpserts: new Set([ANCHOR, `${DIR}/errors.md`]),
      staleUpserts: new Set(),
      copiedUpserts: new Set(),
      pendingDeletes: new Set(),
      nowIso: NOW,
    })
    expect(plan.writes.find((w) => w.relPath === `${DIR}/added.md`)?.content).toBe('NEW REMOTE')
    const anchor = plan.writes.find((w) => w.relPath === ANCHOR)?.content as string
    expect(sectionFiles(anchor)).toContain('added.md')
    expect(sectionFiles(anchor)).toContain('errors.md')
    expect(plan.copySections).toEqual([])
  })

  it('scenario: the laptop gets the PC section and the server keeps its content (never uploaded blank)', () => {
    const { server, laptop, pc } = syncedFriday()
    pc.save(note(T_SUN, { ...FRIDAY, added: 'added by PC' }), ['added'])
    pc.upload()
    laptop.save(note(T_MON, { ...FRIDAY, errors: 'errors laptop' }), ['errors'])
    laptop.pull()
    expect(laptop.files[`${DIR}/added.md`]).toBe('added by PC')
    expect(sectionFiles(laptop.files[ANCHOR])).toEqual(['errors.md', 'features.md', 'ideas.md', 'added.md'])
    laptop.upload()
    expect(server.content(`${DIR}/added.md`)).toBe('added by PC')
    expect(server.content(`${DIR}/errors.md`)).toBe('errors laptop')
    pc.pull()
    expect(pc.files).toEqual(laptop.files)
  })
})

describe('review: a section DELETED on the other device while this one edited it offline', () => {
  it('scenario: the edit is kept AND stays listed in the anchor (no invisible orphan), and comes back on the PC', () => {
    const { server, laptop, pc } = syncedFriday()
    // PC removes Ideas: new anchor without it + the section tombstone.
    pc.save(note(T_SUN, { errors: 'errors v1', features: 'features v1' }), [])
    pc.upload()
    server.tombstone(`${DIR}/ideas.md`, Date.parse(T_SUN))
    delete pc.files[`${DIR}/ideas.md`]
    // Laptop edits Ideas offline.
    laptop.save(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' }), ['ideas'])
    laptop.pull()
    expect(laptop.files[`${DIR}/ideas.md`]).toBe('ideas laptop')
    expect(sectionFiles(laptop.files[ANCHOR])).toContain('ideas.md')
    expect(laptop.pending.has(`${DIR}/ideas.md`)).toBe(true)
    expect(laptop.pending.has(ANCHOR)).toBe(true)
    laptop.upload()
    expect(server.content(`${DIR}/ideas.md`)).toBe('ideas laptop')
    expect(sectionFiles(server.content(ANCHOR) as string)).toContain('ideas.md')
    pc.pull()
    expect(pc.files[`${DIR}/ideas.md`]).toBe('ideas laptop')
    expect(sectionFiles(pc.files[ANCHOR])).toContain('ideas.md')
  })
})

describe('review: a section deleted HERE and edited on the other device', () => {
  it('the remote edit comes back AND is listed again by the (local) anchor', () => {
    const fri = folder(note(T_FRI, FRIDAY))
    const bases: Record<string, CloudBase> = {}
    Object.entries(fri).forEach(([rel, content], i) => (bases[rel] = { seq: i + 1, hash: hashForBase(rel, content) }))
    const local = folder(note(T_MON, { errors: 'errors v1', features: 'features v1' })) // ideas deleted here
    const remote = folder(note(T_SUN, { ...FRIDAY, ideas: 'ideas PC' }))
    const plan = planThreeWayDir({
      dir: DIR,
      local,
      bases,
      remote: [
        { relPath: ANCHOR, seq: 10, content: remote[ANCHOR], updatedAtMs: Date.parse(T_SUN) },
        { relPath: `${DIR}/ideas.md`, seq: 11, content: 'ideas PC', updatedAtMs: Date.parse(T_SUN) },
      ],
      pendingUpserts: new Set([ANCHOR]),
      staleUpserts: new Set(),
      copiedUpserts: new Set(),
      pendingDeletes: new Set(), // the tombstone already landed
      nowIso: NOW,
    })
    expect(plan.writes.find((w) => w.relPath === `${DIR}/ideas.md`)?.content).toBe('ideas PC')
    expect(sectionFiles(plan.writes.find((w) => w.relPath === ANCHOR)?.content as string)).toEqual([
      'errors.md',
      'features.md',
      'ideas.md',
    ])
    expect(plan.upload).toContain(ANCHOR)
  })
})

describe('review: mergeAnchors keeps local metadata', () => {
  const base = folder(note(T_FRI, FRIDAY))
  const baseHash = hashForBase(ANCHOR, base[ANCHOR])
  const files = new Set(['errors.md', 'features.md', 'ideas.md'])
  const anchorOf = (n: DiskNote) => folder(n)[ANCHOR]
  const merge = (local: string, remote: string, kept = new Set<string>()) =>
    mergeAnchors({
      local,
      remote,
      baseHash,
      sectionFilesOnDisk: files,
      knownSectionFiles: files,
      folderKeepsLocalChanges: kept.size > 0,
      keptLocalSectionFiles: kept,
      nowIso: NOW,
    })

  it('both changed: aiHidden (per section) and favorited are OR-ed, tags united', () => {
    const local = note(T_MON, FRIDAY, { tags: ['dev', 'mine'], favorited: true })
    local.sections[1] = { ...local.sections[1], aiHidden: true }
    const remote = note(T_SUN, FRIDAY, { tags: ['dev', 'theirs'], title: 'Renamed there' })
    const m = merge(anchorOf(local), anchorOf(remote))
    expect(m.source).toBe('merged')
    const fm = frontmatterOf(m.content)
    const secs = fm.sections as Array<{ file: string; aiHidden?: boolean }>
    expect(secs.find((s) => s.file === 'features.md')?.aiHidden).toBe(true)
    expect(secs.find((s) => s.file === 'errors.md')?.aiHidden).toBeUndefined()
    expect(fm.favorited).toBe(true)
    expect(fm.tags).toEqual(['dev', 'theirs', 'mine'])
    expect(fm.title).toBe('Renamed there')
  })

  it('only the local changed but the remote `updated` is later: `updated` becomes now (never moves backwards)', () => {
    const local = anchorOf(note(T_SUN, FRIDAY, { title: 'Renamed here' }))
    const remote = anchorOf(note(T_MON, FRIDAY))
    const m = merge(local, remote)
    expect(frontmatterOf(m.content).title).toBe('Renamed here')
    expect(frontmatterOf(m.content).updated).toBe(NOW)
    // A local `updated` already later is kept as is.
    const later = anchorOf(note(T_MON, FRIDAY, { title: 'Renamed here' }))
    expect(merge(later, anchorOf(note(T_SUN, FRIDAY)))).toEqual({ content: later, source: 'local' })
  })

  it('a kept local section missing from the winning anchor is listed again (every branch)', () => {
    const local = anchorOf(note(T_MON, FRIDAY))
    const remote = anchorOf(note(T_SUN, { errors: 'errors v1', features: 'features v1' })) // ideas removed there
    expect(sectionFiles(merge(local, remote).content)).toEqual(['errors.md', 'features.md'])
    const kept = merge(local, remote, new Set(['ideas.md']))
    expect(kept.source).toBe('merged')
    expect(sectionFiles(kept.content)).toEqual(['errors.md', 'features.md', 'ideas.md'])
    expect(frontmatterOf(kept.content).updated).toBe(NOW)
  })
})

describe('review: echo of an upload still in flight', () => {
  it('is adopted as the base (no copy of the newer local save)', () => {
    const fri = folder(note(T_FRI, FRIDAY))
    const bases: Record<string, CloudBase> = {}
    Object.entries(fri).forEach(([rel, content], i) => (bases[rel] = { seq: i + 1, hash: hashForBase(rel, content) }))
    const rel = `${DIR}/errors.md`
    const input = {
      dir: DIR,
      local: { ...fri, [rel]: 'errors second save' },
      bases,
      remote: [{ relPath: rel, seq: 20, content: 'errors first save', updatedAtMs: Date.parse(T_MON) }],
      pendingUpserts: new Set([rel]),
      staleUpserts: new Set<string>(),
      copiedUpserts: new Set<string>(),
      pendingDeletes: new Set<string>(),
      nowIso: NOW,
    }
    // Without the in-flight hash it looks like a conflict…
    expect(planThreeWayDir(input).conflictMarkerSections).toEqual(['errors.md'])
    // …with it, the row is this device's own first save: base, keep the second save.
    const plan = planThreeWayDir({ ...input, inFlightHashes: new Map([[rel, hashForBase(rel, 'errors first save')]]) })
    expect(plan.conflictMarkerSections).toEqual([])
    expect(plan.copySections).toEqual([])
    expect(plan.writes).toEqual([])
    expect(plan.bases[rel]).toEqual({ seq: 20, hash: hashForBase(rel, 'errors first save') })
  })
})

describe('review: folders whose bootstrap reconcile failed keep the bootstrap context', () => {
  const started = { seenSeq: 40, lastSyncMs: 1000, retryKeys: ['k1'] }
  it('the bootstrap pull records exactly its failed folders', () => {
    expect(nextBootstrapPending(null, { started, failed: new Set(['a', 'b']), done: new Set(['c']) })).toEqual({
      ...started,
      dirs: ['a', 'b'],
    })
    expect(nextBootstrapPending(null, { started, failed: new Set(), done: new Set(['c']) })).toBeNull()
  })
  it('later pulls drop the folders that reconciled; failed ones stay; empty → removed', () => {
    const prev = { ...started, dirs: ['a', 'b'] }
    expect(nextBootstrapPending(prev, { started: null, failed: new Set(['b']), done: new Set(['a']) })).toEqual({
      ...started,
      dirs: ['b'],
    })
    expect(nextBootstrapPending(prev, { started: null, failed: new Set(), done: new Set(['a', 'b']) })).toBeNull()
    expect(nextBootstrapPending(null, { started: null, failed: new Set(), done: new Set() })).toBeNull()
  })
  it('parses tolerantly', () => {
    expect(parseBootstrapPending({ seenSeq: 4, lastSyncMs: 9, retryKeys: ['x', 1], dirs: ['d'] })).toEqual({
      seenSeq: 4,
      lastSyncMs: 9,
      retryKeys: ['x'],
      dirs: ['d'],
    })
    expect(parseBootstrapPending({ dirs: [] })).toBeNull()
    expect(parseBootstrapPending('nope')).toBeNull()
    expect(parseBootstrapPending({ seenSeq: -1, dirs: ['d'] })).toEqual({ seenSeq: null, lastSyncMs: null, retryKeys: [], dirs: ['d'] })
  })

  it('scenario: a laptop whose bootstrap failed on a folder still merges it on the retry (B is not lost)', () => {
    const { server, laptop, pc } = syncedFridayLaptopWithoutBases()
    const lastSyncMs = Date.parse(T_FRI) + 60_000
    const seenSeq = laptop.pullSeq
    pc.save(note(T_SUN, { ...FRIDAY, errors: 'errors PC' }), ['errors'])
    pc.upload()
    laptop.save(note(T_MON, { ...FRIDAY, ideas: 'ideas laptop' }), ['ideas'])
    // The bootstrap pull failed on this folder (disk error): nothing written, the
    // watermark moved on, the folder is pending with the bootstrap context.
    const pending = nextBootstrapPending(null, {
      started: { seenSeq, lastSyncMs, retryKeys: [] },
      failed: new Set([DIR]),
      done: new Set(),
    })
    expect(pending?.dirs).toEqual([DIR])
    // Retry: the folder's rows come back (retry set) and get that context.
    laptop.pull({ lastSyncMs: pending!.lastSyncMs as number })
    expect(laptop.files[`${DIR}/errors.md`]).toBe('errors PC')
    laptop.upload()
    expect(server.content(`${DIR}/errors.md`)).toBe('errors PC')
    expect(server.content(`${DIR}/ideas.md`)).toBe('ideas laptop')
  })
})

describe('the real case (2026-11-06): the CLI appended a line on top of a remote change the app had already written to disk', () => {
  it('a stale upload, then the pull leaves ONE note with both changes — no copy', () => {
    const { server, laptop: cli, pc } = syncedFriday()
    const improvements = '- [ ] one\n- [ ] two'
    syncedWith({ ...FRIDAY, errors: improvements }, server, pc, cli)
    // The PC adds an item; the desktop app on the CLI's machine downloads it
    // (same notes dir) — but the CLI's own base stays at the old version.
    const withDesktop = `${improvements}\n- [ ] desktop`
    pc.save(note(T_SUN, { ...FRIDAY, errors: withDesktop }), ['errors'])
    pc.upload()
    cli.files[`${DIR}/errors.md`] = withDesktop
    cli.files[ANCHOR] = server.content(ANCHOR) as string
    // `noteflow add "- [ ] cli" --section …`: appends at the end, push is stale.
    const added = `${withDesktop}\n- [ ] cli`
    cli.save(note(T_MON, { ...FRIDAY, errors: added }), ['errors'])
    cli.upload()
    expect(cli.stale.has(`${DIR}/errors.md`)).toBe(true)
    // `noteflow pull`.
    cli.pull()
    expect(cli.copies).toEqual([])
    expect(cli.lastPlan?.copySections).toEqual([])
    expect(cli.lastPlan?.conflictMarkerSections).toEqual([])
    expect(cli.files[`${DIR}/errors.md`]).toBe(added)
    cli.upload()
    expect(cli.pending.size).toBe(0)
    expect(server.content(`${DIR}/errors.md`)).toBe(added)
    pc.pull()
    expect(pc.files[`${DIR}/errors.md`]).toBe(added)
    expect(pc.copies).toEqual([])
  })

  it('the same without any base content (bases from before the base store): the two-way union gives the same note', () => {
    const { server, laptop: cli, pc } = syncedFriday()
    const improvements = '- [ ] one\n- [ ] two\n'
    syncedWith({ ...FRIDAY, errors: improvements }, server, pc, cli)
    cli.blobs.clear()
    const withDesktop = `${improvements}- [ ] desktop\n`
    pc.save(note(T_SUN, { ...FRIDAY, errors: withDesktop }), ['errors'])
    pc.upload()
    cli.files[`${DIR}/errors.md`] = withDesktop
    const added = `${withDesktop}- [ ] cli\n`
    cli.save(note(T_MON, { ...FRIDAY, errors: added }), ['errors'])
    cli.upload()
    cli.pull()
    expect(cli.copies).toEqual([])
    expect(cli.files[`${DIR}/errors.md`]).toBe(added)
    cli.upload()
    expect(server.content(`${DIR}/errors.md`)).toBe(added)
  })
})
