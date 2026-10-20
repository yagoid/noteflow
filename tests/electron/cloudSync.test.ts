import { describe, it, expect } from 'vitest'
import {
  CLOUD_METADATA_FILENAMES,
  noteDirOf,
  isAnchorPath,
  isSafeCloudRelPath,
  extractUpdatedTimestamp,
  parseUpdatedTimestamp,
  resolveRowUpdatedAt,
  shouldApplyRemoteDir,
  shouldApplyRemoteSection,
  shouldApplyRemoteDeletion,
  groupEntriesByDir,
  planPullQuery,
  parseRowSeq,
  nextPullSeq,
  collectSeqPages,
  CLOUD_PAGE_SIZE,
  CLOUD_PULL_COLUMNS,
  listAnchorSectionFiles,
  buildFileUpsertRow,
  decryptFileRow,
} from '../../electron/cloudSyncLogic'
import { generateDek, generateNoteKey, derivePathKeyHmac } from '../../electron/cloudCrypto'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'

const NOW = '2026-07-10T12:00:00.000Z'

const anchorContent = (updated: string) =>
  `---\nid: abc123\ntitle: My note\nupdated: '${updated}'\n---\n`

// ── Path mapping ──────────────────────────────────────────────────────────────

describe('noteDirOf / isAnchorPath', () => {
  it('maps note files to their dir and root files to null', () => {
    expect(noteDirOf('my-note-abc123/note.md')).toBe('my-note-abc123')
    expect(noteDirOf('my-note-abc123/sec001.md')).toBe('my-note-abc123')
    expect(noteDirOf('groups.json')).toBeNull()
  })

  it('identifies the anchor only', () => {
    expect(isAnchorPath('my-note-abc123/note.md')).toBe(true)
    expect(isAnchorPath('my-note-abc123/sec001.md')).toBe(false)
    expect(isAnchorPath('note.md')).toBe(false) // root-level, not a dir anchor
  })
})

describe('isSafeCloudRelPath', () => {
  it('accepts note files one level deep and known root metadata', () => {
    expect(isSafeCloudRelPath('my-note-abc123/note.md')).toBe(true)
    expect(isSafeCloudRelPath('my-note-abc123/sec001.md')).toBe(true)
    for (const f of CLOUD_METADATA_FILENAMES) expect(isSafeCloudRelPath(f)).toBe(true)
  })

  it('rejects traversal, separators and unknown root files', () => {
    expect(isSafeCloudRelPath('../evil.md')).toBe(false)
    expect(isSafeCloudRelPath('dir/../../evil.md')).toBe(false)
    expect(isSafeCloudRelPath('/abs/note.md')).toBe(false)
    expect(isSafeCloudRelPath('dir\\note.md')).toBe(false)
    expect(isSafeCloudRelPath('dir/deeper/note.md')).toBe(false)
    expect(isSafeCloudRelPath('dir/not-markdown.txt')).toBe(false)
    expect(isSafeCloudRelPath('evil.json')).toBe(false)
    expect(isSafeCloudRelPath('')).toBe(false)
  })
})

// ── Timestamps ────────────────────────────────────────────────────────────────

describe('resolveRowUpdatedAt', () => {
  it('anchor rows use their own frontmatter updated (normalized to ISO)', () => {
    const content = anchorContent('2026-07-01T08:30:00.000Z')
    expect(resolveRowUpdatedAt('dir-a/note.md', content, null, NOW)).toBe('2026-07-01T08:30:00.000Z')
  })

  it('section rows inherit the anchor timestamp', () => {
    const anchor = anchorContent('2026-07-02T09:00:00.000Z')
    expect(resolveRowUpdatedAt('dir-a/sec001.md', '# body', anchor, NOW)).toBe('2026-07-02T09:00:00.000Z')
  })

  it('root metadata and missing/unparseable frontmatter fall back to now', () => {
    expect(resolveRowUpdatedAt('groups.json', '[]', null, NOW)).toBe(NOW)
    expect(resolveRowUpdatedAt('dir-a/note.md', 'no frontmatter here', null, NOW)).toBe(NOW)
    expect(resolveRowUpdatedAt('dir-a/sec001.md', '# body', null, NOW)).toBe(NOW)
    expect(resolveRowUpdatedAt('dir-a/note.md', anchorContent('not-a-date'), null, NOW)).toBe(NOW)
  })

  it('extract/parse helpers behave like the GitHub sync ones', () => {
    expect(extractUpdatedTimestamp(anchorContent('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z')
    expect(extractUpdatedTimestamp('nothing')).toBeNull()
    expect(parseUpdatedTimestamp('2026-01-01T00:00:00.000Z')).toBe(Date.parse('2026-01-01T00:00:00.000Z'))
    expect(parseUpdatedTimestamp('garbage')).toBeNull()
    expect(parseUpdatedTimestamp(null)).toBeNull()
  })
})

// ── Conflict decisions ────────────────────────────────────────────────────────

describe('shouldApplyRemoteDir', () => {
  it('newer remote wins; equal or older does not', () => {
    expect(shouldApplyRemoteDir(2000, 1000)).toBe(true)
    expect(shouldApplyRemoteDir(1000, 1000)).toBe(false)
    expect(shouldApplyRemoteDir(500, 1000)).toBe(false)
  })

  it('missing local applies; unparseable remote never applies', () => {
    expect(shouldApplyRemoteDir(2000, null)).toBe(true)
    expect(shouldApplyRemoteDir(null, 1000)).toBe(false)
    expect(shouldApplyRemoteDir(null, null)).toBe(false)
  })
})

describe('shouldApplyRemoteDeletion', () => {
  it('deletes only when the local copy predates the last sync', () => {
    expect(shouldApplyRemoteDeletion(1000, 2000)).toBe(true)
    expect(shouldApplyRemoteDeletion(2000, 2000)).toBe(true)
    expect(shouldApplyRemoteDeletion(3000, 2000)).toBe(false) // newer local edit wins
  })

  it('never deletes on the first reconcile or with unknown local age', () => {
    expect(shouldApplyRemoteDeletion(1000, null)).toBe(false)
    expect(shouldApplyRemoteDeletion(null, 2000)).toBe(false)
  })
})

// ── Pull grouping / cursor ────────────────────────────────────────────────────

describe('groupEntriesByDir', () => {
  it('splits entries into note-dir groups and root files', () => {
    const entries = [
      { relPath: 'dir-a/note.md' },
      { relPath: 'dir-a/sec001.md' },
      { relPath: 'dir-b/note.md' },
      { relPath: 'groups.json' },
    ]
    const { dirs, rootFiles } = groupEntriesByDir(entries)
    expect([...dirs.keys()].sort()).toEqual(['dir-a', 'dir-b'])
    expect(dirs.get('dir-a')).toHaveLength(2)
    expect(rootFiles.map((e) => e.relPath)).toEqual(['groups.json'])
  })
})

describe('shouldApplyRemoteSection (loose section rows)', () => {
  it('applies a section of the SAME version (it landed after its anchor)', () => {
    expect(shouldApplyRemoteSection(1000, 1000)).toBe(true)
  })

  it('applies a section of a newer version whose anchor is not in this batch', () => {
    expect(shouldApplyRemoteSection(2000, 1000)).toBe(true)
  })

  it('respects a local folder with its own newer edits', () => {
    expect(shouldApplyRemoteSection(1000, 2000)).toBe(false)
  })

  it('unknown local timestamp → apply; unknown remote timestamp → never', () => {
    expect(shouldApplyRemoteSection(1000, null)).toBe(true)
    expect(shouldApplyRemoteSection(null, 1000)).toBe(false)
    expect(shouldApplyRemoteSection(null, null)).toBe(false)
  })
})

describe('planPullQuery (pull mode)', () => {
  it('incremental from pullSeq, tombstones included', () => {
    expect(planPullQuery({ pullSeq: 42, lastSync: NOW })).toEqual({ afterSeq: 42, includeDeleted: true })
    expect(planPullQuery({ pullSeq: 0 })).toEqual({ afterSeq: 0, includeDeleted: true })
  })

  it('pullSeq wins over a leftover legacy cursor', () => {
    expect(planPullQuery({ pullSeq: 7, pullCursor: NOW })).toEqual({ afterSeq: 7, includeDeleted: true })
  })

  it('device from the updated_at-cursor version → one full reconcile WITH tombstones', () => {
    expect(planPullQuery({ pullCursor: NOW, lastSync: NOW })).toEqual({ afterSeq: 0, includeDeleted: true })
    expect(planPullQuery({ pullCursor: NOW })).toEqual({ afterSeq: 0, includeDeleted: true })
    expect(planPullQuery({ lastSync: NOW })).toEqual({ afterSeq: 0, includeDeleted: true })
  })

  it('first sync → full, live rows only', () => {
    expect(planPullQuery({})).toEqual({ afterSeq: 0, includeDeleted: false })
  })

  it('ignores a corrupt pullSeq (falls back to the legacy/first-sync modes)', () => {
    expect(planPullQuery({ pullSeq: -1, lastSync: NOW })).toEqual({ afterSeq: 0, includeDeleted: true })
    expect(planPullQuery({ pullSeq: 1.5 })).toEqual({ afterSeq: 0, includeDeleted: false })
    expect(planPullQuery({ pullSeq: '9' as unknown as number })).toEqual({ afterSeq: 0, includeDeleted: false })
  })
})

describe('parseRowSeq', () => {
  it('accepts safe non-negative integers, also as bigint strings', () => {
    expect(parseRowSeq(12)).toBe(12)
    expect(parseRowSeq('12')).toBe(12)
    expect(parseRowSeq(0)).toBe(0)
  })

  it('rejects anything else', () => {
    for (const v of [undefined, null, '', ' ', 'x', -1, 1.5, Number.NaN, 2 ** 60, {}]) {
      expect(parseRowSeq(v), String(v)).toBeNull()
    }
  })
})

// A fake PostgREST `files` listing: keyset over seq, capped at max-rows.
function fakeListing(total: number, maxRows = CLOUD_PAGE_SIZE) {
  const rows = Array.from({ length: total }, (_, i) => ({ seq: i + 1, path_key: `k${i + 1}` }))
  const calls: number[] = []
  const fetchPage = async (after: number) => {
    calls.push(after)
    return rows.filter((r) => r.seq > after).slice(0, maxRows)
  }
  return { rows, calls, fetchPage }
}

describe('collectSeqPages (keyset pagination of every Cloud listing)', () => {
  it('reads past the 1000-row cap: a note beyond it is listed (deletion bug A)', async () => {
    const { calls, fetchPage } = fakeListing(2345)
    const rows = await collectSeqPages(fetchPage, 0)
    expect(rows).toHaveLength(2345)
    expect(rows.some((r) => r.path_key === 'k2345')).toBe(true)
    expect(calls).toEqual([0, 1000, 2000])
  })

  it('an exact multiple of the page size ends on the empty page', async () => {
    const { calls, fetchPage } = fakeListing(2000)
    expect(await collectSeqPages(fetchPage, 0)).toHaveLength(2000)
    expect(calls).toEqual([0, 1000, 2000])
  })

  it('starts after the given seq (incremental pull)', async () => {
    const { calls, fetchPage } = fakeListing(10)
    expect((await collectSeqPages(fetchPage, 7)).map((r) => r.seq)).toEqual([8, 9, 10])
    expect(calls).toEqual([7])
  })

  it('a full page that does not advance the keyset throws (never loops, never truncates)', async () => {
    const stuck = async () => Array.from({ length: 3 }, () => ({ seq: 5 }))
    await expect(collectSeqPages(stuck, 5, 3, 'Cloud listing failed')).rejects.toThrow(
      'Cloud listing failed (invalid seq paging)'
    )
    const noSeq = async () => [{}, {}, {}]
    await expect(collectSeqPages(noSeq, 0, 3, 'Cloud pull failed')).rejects.toThrow('Cloud pull failed (invalid seq paging)')
  })

  it('a failed page propagates: no partial listing is ever returned', async () => {
    const { fetchPage } = fakeListing(1500)
    const flaky = async (after: number) => {
      if (after > 0) throw new Error('Cloud listing failed (HTTP 503)')
      return fetchPage(after)
    }
    await expect(collectSeqPages(flaky, 0)).rejects.toThrow('HTTP 503')
  })
})

describe('nextPullSeq', () => {
  it('advances to the max seq of ALL fetched rows, whatever their order', () => {
    expect(nextPullSeq(10, [{ seq: 14 }, { seq: 12 }, { seq: 13 }])).toBe(14)
  })

  it('never goes backwards', () => {
    expect(nextPullSeq(20, [{ seq: 3 }])).toBe(20)
    expect(nextPullSeq(20, [])).toBe(20)
  })

  it('starts at 0 without a watermark (a pull that saw nothing still enters seq mode)', () => {
    expect(nextPullSeq(undefined, [])).toBe(0)
    expect(nextPullSeq(undefined, [{ seq: 5 }])).toBe(5)
  })

  it('skips rows with a missing/garbage seq and accepts bigint strings', () => {
    expect(nextPullSeq(1, [{ seq: 'garbage' }, {}, { seq: '9' }])).toBe(9)
  })

  // The regression of the updated_at cursor: a row uploaded LATE carries an
  // old edit time but a fresh seq, so it is not left behind the watermark.
  it('is independent of updated_at (late uploads are not skipped)', () => {
    const rows = [
      { seq: 101, updated_at: '2026-07-10T00:00:00.000Z' },
      { seq: 102, updated_at: '2026-01-01T00:00:00.000Z' }, // offline edit drained late
    ]
    expect(nextPullSeq(100, rows)).toBe(102)
  })
})

describe('listAnchorSectionFiles (sections an applied anchor must bring along)', () => {
  const note: DiskNote = {
    id: 'abc123',
    title: 'My: "note"',
    tags: ['a'],
    created: NOW,
    updated: NOW,
    sections: [
      { id: 'sec001', name: 'One', content: 'first' },
      { id: 'sec002', name: 'Two: tricky', content: 'second', isRawMode: true, created: NOW },
    ],
  }

  it('lists sections[].file of a real serialized note.md, in order', () => {
    const { files } = serializeNoteFolder(note)
    expect(listAnchorSectionFiles(files['note.md'])).toEqual(['sec001.md', 'sec002.md'])
  })

  it('encrypted notes keep everything in note.md → no section files', () => {
    const { files } = serializeNoteFolder({ ...note, encryption: { v: 1, iv: 'x', data: 'y' } })
    expect(listAnchorSectionFiles(files['note.md'])).toEqual([])
  })

  it('falls back to <id>.md, dedupes and drops unsafe names', () => {
    const md = [
      '---',
      'id: x',
      'sections:',
      '  - id: s1',
      '    name: A',
      '  - id: s2',
      '    file: s2.md',
      '  - id: s3',
      '    file: s2.md',
      '  - id: s4',
      '    file: ../evil.md',
      '  - id: s5',
      '    file: note.md',
      '  - id: s6',
      '    file: sub/x.md',
      '  - id: s7',
      '    file: notes.txt',
      '  - name: no id or file',
      '---',
      '',
    ].join('\n')
    expect(listAnchorSectionFiles(md)).toEqual(['s1.md', 's2.md'])
  })

  it('no frontmatter / malformed YAML / no sections → []', () => {
    expect(listAnchorSectionFiles('just text')).toEqual([])
    expect(listAnchorSectionFiles('---\nsections: [unclosed\n---\n')).toEqual([])
    expect(listAnchorSectionFiles('---\nid: x\n---\n')).toEqual([])
  })
})

describe('CLOUD_PULL_COLUMNS', () => {
  it('selects seq (the cursor) besides every column decryptFileRow needs', () => {
    const cols = CLOUD_PULL_COLUMNS.split(',')
    for (const c of ['path_key', 'path_ct', 'content_ct', 'key_ct', 'updated_at', 'deleted', 'seq']) {
      expect(cols).toContain(c)
    }
  })
})

// ── Row crypto (file ↔ files-table row) ───────────────────────────────────────

describe('buildFileUpsertRow / decryptFileRow', () => {
  it('round-trips a file through an encrypted row', async () => {
    const dek = generateDek()
    const noteKey = generateNoteKey()
    const relPath = 'mi-nota-abc123/note.md'
    const content = anchorContent('2026-07-01T08:30:00.000Z')

    const row = await buildFileUpsertRow(dek, noteKey, relPath, content, '2026-07-01T08:30:00.000Z')
    expect(row.path_key).toBe(await derivePathKeyHmac(dek, relPath))
    expect(row.deleted).toBe(false)
    expect(row.updated_at).toBe('2026-07-01T08:30:00.000Z')
    // nothing plaintext leaks into the ciphertext columns
    expect(row.path_ct).not.toContain('mi-nota')
    expect(row.content_ct).not.toContain('My note')

    const entry = await decryptFileRow(dek, row)
    expect(entry.relPath).toBe(relPath)
    expect(entry.content).toBe(content)
    expect(entry.deleted).toBe(false)
    expect(entry.updatedAtMs).toBe(Date.parse('2026-07-01T08:30:00.000Z'))
    expect(entry.noteKey).toEqual(noteKey)
  })

  it('rows of the same folder share the note key; a wrong DEK cannot decrypt', async () => {
    const dek = generateDek()
    const noteKey = generateNoteKey()
    const anchor = await buildFileUpsertRow(dek, noteKey, 'dir-a/note.md', 'a', NOW)
    const section = await buildFileUpsertRow(dek, noteKey, 'dir-a/sec001.md', 'b', NOW)
    expect((await decryptFileRow(dek, anchor)).noteKey).toEqual((await decryptFileRow(dek, section)).noteKey)
    await expect(decryptFileRow(generateDek(), anchor)).rejects.toThrow()
  })

  it('tombstone rows blank the content and decrypt to an empty string', async () => {
    const dek = generateDek()
    const row = await buildFileUpsertRow(dek, generateNoteKey(), 'dir-a/sec001.md', 'ignored', NOW, true)
    expect(row.deleted).toBe(true)
    expect(row.content_ct).toBe('')
    const entry = await decryptFileRow(dek, row)
    expect(entry.deleted).toBe(true)
    expect(entry.content).toBe('')
    expect(entry.relPath).toBe('dir-a/sec001.md') // path stays recoverable
  })
})
