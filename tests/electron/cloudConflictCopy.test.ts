// Conflict copies of the NoteFlow Cloud pull (QA "B2"): an offline edit that is
// still pending in the journal must not vanish when the pull applies a newer
// remote version of its folder (wholesale) or deletes a known-lost version
// (anchor tombstone, planAnchorTombstone → 'lost'). Pure decisions of
// electron/cloudSyncLogic.ts + the journal flag of electron/syncState.ts.
import { describe, it, expect } from 'vitest'
import yaml from 'js-yaml'
import {
  planConflictCopy,
  buildConflictCopy,
  anchorTitle,
  conflictCopyTitle,
  planLocalPush,
  planMetadataPull,
  metadataPendingForPull,
} from '../../electron/cloudSyncLogic'
import {
  emptySyncState,
  journalRecord,
  journalMarkDirStale,
  journalMarkDirConflictCopied,
  journalComplete,
  conflictCopyCandidates,
  planAnchorTombstone,
} from '../../electron/syncState'
import { serializeNoteFolder, splitFrontmatter, noteDirname, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import { noteDirname as rendererNoteDirname } from '../../src/lib/noteUtils'

const DIR = 'groceries-abc12345'
const T_LOCAL = '2026-10-20T09:00:00.000Z'
const T_REMOTE = '2026-10-20T10:00:00.000Z'
const NOW = '2026-10-21T08:30:00.000Z'

function note(updated: string, sections: Array<{ id: string; content: string }>, extra?: Partial<DiskNote>): DiskNote {
  return {
    id: 'abc12345',
    title: 'Groceries',
    tags: ['home'],
    created: '2026-10-01T00:00:00.000Z',
    updated,
    group: 'g1',
    folder: 'f1',
    favorited: true,
    sections: sections.map((s) => ({ id: s.id, name: s.id.toUpperCase(), content: s.content })),
    ...extra,
  }
}

/** Folder files keyed by '<dir>/<file>' (what the pull compares). */
function rel(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([f, c]) => [`${DIR}/${f}`, c]))
}

function frontmatterOf(noteMd: string): Record<string, unknown> {
  return yaml.load(splitFrontmatter(noteMd).frontmatter) as Record<string, unknown>
}

describe('planConflictCopy', () => {
  it('the B2 repro: pending (non-stale) anchor + section, newer remote with a different section → copy', () => {
    const local = serializeNoteFolder(note(T_LOCAL, [{ id: 's1', content: 'milk, eggs (offline edit)' }]), { preserveUpdated: true }).files
    const remote = serializeNoteFolder(note(T_REMOTE, [{ id: 's1', content: 'milk, bread' }]), { preserveUpdated: true }).files
    const state = emptySyncState()
    journalRecord(state, `${DIR}/note.md`, 'upsert', T_LOCAL)
    journalRecord(state, `${DIR}/s1.md`, 'upsert', T_LOCAL)
    const candidates = conflictCopyCandidates(state, DIR)
    expect(planConflictCopy(candidates, rel(local), rel(remote))).toBe(true)
  })

  it('identical content (only `updated:` differs) → no copy', () => {
    const local = serializeNoteFolder(note(T_LOCAL, [{ id: 's1', content: 'same' }]), { preserveUpdated: true }).files
    const remote = serializeNoteFolder(note(T_REMOTE, [{ id: 's1', content: 'same' }]), { preserveUpdated: true }).files
    expect(planConflictCopy([`${DIR}/note.md`, `${DIR}/s1.md`], rel(local), rel(remote))).toBe(false)
  })

  it('only one section differs → copy', () => {
    const local = serializeNoteFolder(
      note(T_LOCAL, [{ id: 's1', content: 'a' }, { id: 's2', content: 'local b' }]),
      { preserveUpdated: true },
    ).files
    const remote = serializeNoteFolder(
      note(T_REMOTE, [{ id: 's1', content: 'a' }, { id: 's2', content: 'remote b' }]),
      { preserveUpdated: true },
    ).files
    expect(planConflictCopy([`${DIR}/s1.md`], rel(local), rel(remote))).toBe(false) // the pending one matches
    expect(planConflictCopy([`${DIR}/s1.md`, `${DIR}/s2.md`], rel(local), rel(remote))).toBe(true)
  })

  it('a pending path the server will not have (deleted / unknown) → copy; a pending path gone locally → nothing', () => {
    const local = { [`${DIR}/s9.md`]: 'only here' }
    expect(planConflictCopy([`${DIR}/s9.md`], local, {})).toBe(true)
    expect(planConflictCopy([`${DIR}/s9.md`], local, { [`${DIR}/s9.md`]: null })).toBe(true)
    expect(planConflictCopy([`${DIR}/gone.md`], { [`${DIR}/gone.md`]: null }, {})).toBe(false)
    expect(planConflictCopy([], local, {})).toBe(false)
  })

  it('anchor tombstone vs pending stale edit: lost → every server content null → copy', () => {
    const T_DELETED = Date.parse('2026-10-20T11:00:00.000Z')
    const state = emptySyncState()
    journalRecord(state, `${DIR}/s1.md`, 'upsert', T_LOCAL)
    journalMarkDirStale(state, DIR)
    expect(planAnchorTombstone(state, DIR, Date.parse(T_LOCAL), T_DELETED)).toBe('lost')
    expect(planConflictCopy(conflictCopyCandidates(state, DIR), { [`${DIR}/s1.md`]: 'offline edit' }, {})).toBe(true)
  })

  it('ops already conflictCopied → no candidates → no second copy; a new local edit makes it a candidate again', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/s1.md`, 'upsert', T_LOCAL)
    journalMarkDirConflictCopied(state, DIR)
    const candidates = conflictCopyCandidates(state, DIR)
    expect(candidates).toEqual([])
    expect(planConflictCopy(candidates, { [`${DIR}/s1.md`]: 'x' }, {})).toBe(false)
    journalRecord(state, `${DIR}/s1.md`, 'upsert', NOW)
    expect(conflictCopyCandidates(state, DIR)).toEqual([`${DIR}/s1.md`])
  })
})

describe('per-section apply (anchor not applied): only the overwritten files are judged', () => {
  it('a pending note.md that is not being overwritten does not count; a differing overwritten section does', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/note.md`, 'upsert', T_LOCAL)
    journalRecord(state, `${DIR}/s1.md`, 'upsert', T_LOCAL)
    // The remote batch carries only s1 (its anchor lands in a later pull).
    const overwritten = new Set([`${DIR}/s1.md`])
    const candidates = conflictCopyCandidates(state, DIR).filter((p) => overwritten.has(p))
    expect(candidates).toEqual([`${DIR}/s1.md`])
    const local = { [`${DIR}/note.md`]: '---\nid: a\n---\n', [`${DIR}/s1.md`]: 'offline edit' }
    expect(planConflictCopy(candidates, local, { [`${DIR}/s1.md`]: 'remote edit' })).toBe(true)
    // Unrestricted, the pending anchor (absent from the server map) would wrongly count.
    expect(planConflictCopy([`${DIR}/note.md`], local, { [`${DIR}/s1.md`]: 'offline edit' })).toBe(true)
  })

  it("identical content (this device's own upload coming back) → no copy", () => {
    expect(planConflictCopy([`${DIR}/s1.md`], { [`${DIR}/s1.md`]: 'same' }, { [`${DIR}/s1.md`]: 'same' })).toBe(false)
  })

  it('after a per-section copy the whole dir is flagged: the anchor arriving later makes no second copy', () => {
    const state = emptySyncState()
    journalRecord(state, `${DIR}/note.md`, 'upsert', T_LOCAL)
    journalRecord(state, `${DIR}/s1.md`, 'upsert', T_LOCAL)
    journalMarkDirConflictCopied(state, DIR)
    journalComplete(state, `${DIR}/s1.md`, 'upsert') // settled by the section apply
    expect(conflictCopyCandidates(state, DIR)).toEqual([])
  })
})

describe('push gate closed (offline boot, keys locked): the edit is journaled', () => {
  it('planLocalPush: disabled/unconfigured → ignore; gate closed → journal; gate open → push', () => {
    expect(planLocalPush({ enabled: false, configured: true, initialPullStatus: 'ok' })).toBe('ignore')
    expect(planLocalPush({ enabled: true, configured: false, initialPullStatus: 'ok' })).toBe('ignore')
    expect(planLocalPush({ enabled: true, configured: true, initialPullStatus: 'pending' })).toBe('journal')
    expect(planLocalPush({ enabled: true, configured: true, initialPullStatus: 'failed' })).toBe('journal')
    expect(planLocalPush({ enabled: true, configured: true, initialPullStatus: 'ok' })).toBe('push')
  })

  it('a gate-closed edit (journaled, no timer) is a conflict-copy candidate and guards a remote deletion', () => {
    // Boot offline → edit (schedulePush journals it) → the first pull brings a newer remote version.
    const state = emptySyncState()
    journalRecord(state, `${DIR}/s1.md`, 'upsert', T_LOCAL)
    const candidates = conflictCopyCandidates(state, DIR)
    expect(candidates).toEqual([`${DIR}/s1.md`])
    expect(planConflictCopy(candidates, { [`${DIR}/s1.md`]: 'offline edit' }, { [`${DIR}/s1.md`]: 'remote' })).toBe(true)
    // Remote deletion of the note: the unsent edit keeps it (forced resurrection), as for any pending edit.
    expect(planAnchorTombstone(state, DIR, Date.parse(T_LOCAL), Date.parse(T_REMOTE))).toBe('keep')
  })
})

describe('gate-journaled metadata on the FIRST pull keeps the documented first-sync rule', () => {
  const LOCAL_A = '{"theme":"dark-of-account-a"}'
  const REMOTE_B = '{"theme":"light-of-account-b"}'

  it('metadataPendingForPull: pending only counts when there is a previous lastSync', () => {
    expect(metadataPendingForPull(true, true)).toBe(false)
    expect(metadataPendingForPull(true, false)).toBe(true)
    expect(metadataPendingForPull(false, false)).toBe(false)
    expect(metadataPendingForPull(false, true)).toBe(false)
  })

  it('non-mergeable (ui-settings.json) journaled while gated: first pull → backup + remote wins, not kept', () => {
    const pendingUpsert = metadataPendingForPull(true, true)
    expect(planMetadataPull('ui-settings.json', LOCAL_A, REMOTE_B, { pendingUpsert, firstPull: true })).toEqual({
      action: 'write', content: REMOTE_B, backup: true, merged: false,
    })
    // A later pull (lastSync set): the same pending edit is a local edit again → kept.
    expect(
      planMetadataPull('ui-settings.json', LOCAL_A, REMOTE_B, { pendingUpsert: metadataPendingForPull(true, false), firstPull: false }),
    ).toEqual({ action: 'keep' })
  })

  it('mergeable (groups.json) journaled while gated: first pull → union preferring REMOTE, with backup', () => {
    const local = JSON.stringify([{ id: 'g1', name: 'local name' }, { id: 'g2', name: 'only local' }])
    const remote = JSON.stringify([{ id: 'g1', name: 'remote name' }])
    const d = planMetadataPull('groups.json', local, remote, { pendingUpsert: metadataPendingForPull(true, true), firstPull: true })
    expect(d.action).toBe('write')
    if (d.action !== 'write') return
    expect(d.backup).toBe(true)
    expect(d.merged).toBe(true)
    expect(JSON.parse(d.content)).toEqual([{ id: 'g1', name: 'remote name' }, { id: 'g2', name: 'only local' }])
  })
})

describe('buildConflictCopy', () => {
  const title = 'Groceries (conflict copy 2026-10-21 10:30)'

  it('new id / dir / title / updated; same group, folder, tags, sections; the LOCAL content', () => {
    const local = serializeNoteFolder(
      note(T_LOCAL, [{ id: 's1', content: 'milk, eggs (offline edit)' }, { id: 's2', content: 'second' }]),
      { preserveUpdated: true },
    ).files
    const copy = buildConflictCopy(local, { newId: 'zz99yy88', title, nowIso: NOW })
    expect(copy.dir).toBe(noteDirname('zz99yy88', title))
    expect(copy.dir).toBe('groceries-conflict-copy-2026-10-21-1030-zz99yy88')
    const fm = frontmatterOf(copy.files[NOTE_MD])
    expect(fm.id).toBe('zz99yy88')
    expect(fm.title).toBe(title)
    expect(fm.updated).toBe(NOW)
    expect(fm.group).toBe('g1')
    expect(fm.folder).toBe('f1')
    expect(fm.tags).toEqual(['home'])
    expect(fm.favorited).toBe(true)
    expect(fm.created).toBe('2026-10-01T00:00:00.000Z')
    expect(fm.sections).toEqual(frontmatterOf(local[NOTE_MD]).sections)
    expect(copy.files['s1.md']).toBe('milk, eggs (offline edit)')
    expect(copy.files['s2.md']).toBe('second')
    expect(Object.keys(copy.files).sort()).toEqual(['note.md', 's1.md', 's2.md'])
    // Same wrapper / yaml options as serializeNoteFolder.
    expect(copy.files[NOTE_MD].startsWith('---\n')).toBe(true)
    expect(copy.files[NOTE_MD].endsWith('\n---\n')).toBe(true)
  })

  it('encrypted note → the encryption block is kept intact, no section files', () => {
    // Real NoteEncryption shape (src/lib/cryptoUtils.ts) — numeric iterations included.
    const encryption = {
      alg: 'aes-256-gcm+pbkdf2',
      salt: 'qL0cZ3h1u8Yt2pW9xR4m7A',
      iv: 'Zk3n8QwE1rTy6uIo',
      ciphertext: 'c2VjdGlvbnMtY2lwaGVydGV4dC1wbHVzLWdjbS10YWc_-',
      iterations: 600000,
      hashAlg: 'SHA-512',
    }
    const local = serializeNoteFolder(note(T_LOCAL, [], { encryption }), { preserveUpdated: true }).files
    expect(Object.keys(local)).toEqual([NOTE_MD])
    const copy = buildConflictCopy(local, { newId: 'enc00001', title, nowIso: NOW })
    expect(Object.keys(copy.files)).toEqual([NOTE_MD])
    const fm = frontmatterOf(copy.files[NOTE_MD])
    expect(fm.encryption).toEqual(encryption)
    expect(typeof (fm.encryption as { iterations: unknown }).iterations).toBe('number')
    // The block's lines are byte-identical to the original's.
    const block = (md: string) => md.slice(md.indexOf('encryption:')).split('\n').filter((l) => l.startsWith('  '))
    expect(block(local[NOTE_MD])).toHaveLength(6)
    expect(block(copy.files[NOTE_MD])).toEqual(block(local[NOTE_MD]))
    expect(fm.sections).toBeUndefined()
    expect(fm.id).toBe('enc00001')
  })

  it('unquoted timestamps (Date under js-yaml) come back as ISO strings', () => {
    const local = { [NOTE_MD]: '---\nid: abc\ntitle: T\ncreated: 2026-10-01T00:00:00.000Z\nupdated: 2026-10-02T00:00:00.000Z\n---\n' }
    const fm = frontmatterOf(buildConflictCopy(local, { newId: 'n1', title: 'T2', nowIso: NOW }).files[NOTE_MD])
    expect(fm.created).toBe('2026-10-01T00:00:00.000Z')
  })

  it('throws without note.md or with an unreadable frontmatter (the folder is then not overwritten)', () => {
    expect(() => buildConflictCopy({ 's1.md': 'x' }, { newId: 'n', title: 't', nowIso: NOW })).toThrow()
    expect(() => buildConflictCopy({ [NOTE_MD]: 'no frontmatter' }, { newId: 'n', title: 't', nowIso: NOW })).toThrow()
  })
})

describe('copy title + dir slug', () => {
  it("'<title> (<label> YYYY-MM-DD HH:mm)' in local time", () => {
    const d = new Date(2026, 0, 5, 7, 3) // local
    expect(conflictCopyTitle('Groceries', 'conflict copy', d)).toBe('Groceries (conflict copy 2026-01-05 07:03)')
    expect(conflictCopyTitle('Compra', 'copia en conflicto', d)).toBe('Compra (copia en conflicto 2026-01-05 07:03)')
  })

  it('anchorTitle reads the title (Untitled fallback)', () => {
    expect(anchorTitle('---\nid: a\ntitle: "Hello: world"\n---\n')).toBe('Hello: world')
    expect(anchorTitle('---\nid: a\n---\n')).toBe('Untitled')
    expect(anchorTitle('garbage')).toBe('Untitled')
  })

  it('noteDirname mirrors the renderer slug rule', () => {
    for (const t of ['Groceries (conflict copy 2026-10-21 10:30)', 'Ñandú & café!!', '', '   ', 'A very long title that goes well beyond forty characters total']) {
      expect(noteDirname('id123456', t)).toBe(rendererNoteDirname('id123456', t))
    }
  })
})
