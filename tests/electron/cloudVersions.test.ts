// NoteFlow Cloud per-section version history (read side): the pure logic of
// electron/cloudVersionsLogic.ts, and a walk through electron/cloudVersions.ts
// with REAL crypto and a simulated fetch (Electron and the account session
// are mocked — no network, no real Cloud account).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  estimatePlaintextSize,
  mapVersionRows,
  parseVersionRow,
  parseVersionTarget,
  parseVersionId,
  resolveSectionRelPath,
  classifyVersionsHttp,
  classifyVersionsError,
  isValidSectionId,
  withOneRetry,
  versionListEndpoint,
  VERSION_LIST_COLUMNS,
  classifySnapshotHttp,
  classifySnapshotFlush,
} from '../../electron/cloudVersionsLogic'
import { encryptContent, generateDek, generateNoteKey, derivePathKeyHmac } from '../../electron/cloudCrypto'
import { buildFileUpsertRow } from '../../electron/cloudSyncLogic'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'
import { NOT_SIGNED_IN_TAG, SESSION_LOCKED_TAG, ACCOUNT_UNREACHABLE_TAG } from '../../electron/cloudAccessErrors'

const session = vi.hoisted(() => ({
  signedIn: true,
  token: { ok: true, token: 'test-token' } as { ok: true; token: string } | { ok: false; reason: 'noSession' | 'network' | 'server' | 'locked' },
}))

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), getVersion: () => '0.0.0', isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
  net: { isOnline: () => true, fetch: () => Promise.reject(new Error('offline in tests')) },
  powerMonitor: { on: () => {} },
}))

vi.mock('../../electron/account', () => ({
  getAccountStatus: () => ({ signedIn: session.signedIn }),
  getAccessTokenResult: async () => session.token,
}))

const T = '2026-11-14T10:00:00.000Z'

function noteMdWith(sections: string): string {
  return `---\nid: abcd1234\ntitle: Plan\ntags: []\ncreated: ${T}\nupdated: ${T}\nformatVersion: 2\nsections:\n${sections}---\n`
}

// ── Pure logic ────────────────────────────────────────────────────────────────

describe('estimatePlaintextSize', () => {
  it('is exact for real sealed blobs of many lengths (ASCII and multi-byte UTF-8)', async () => {
    const key = generateNoteKey()
    const texts: string[] = []
    for (let n = 0; n <= 40; n++) texts.push('x'.repeat(n))
    texts.push('a'.repeat(1000), 'ñ'.repeat(7), 'Notas 📝 con acentos: áéíóú', '漢字'.repeat(33))
    for (const text of texts) {
      const blob = await encryptContent(key, text)
      expect(estimatePlaintextSize(blob.length)).toBe(Buffer.byteLength(text, 'utf8'))
    }
  })

  it('is 0 for an empty, negative or non-finite size', () => {
    expect(estimatePlaintextSize(0)).toBe(0)
    expect(estimatePlaintextSize(-5)).toBe(0)
    expect(estimatePlaintextSize(Number.NaN)).toBe(0)
    expect(estimatePlaintextSize(10)).toBe(0) // shorter than IV + tag
  })
})

describe('mapVersionRows', () => {
  const row = (o: Record<string, unknown>) => ({
    id: 1, seq: 10, updated_at: T, created_at: '2026-11-14T11:00:00.000Z', size: 40, reason: 'edit', ...o,
  })

  it('maps columns to the contract and estimates the size', () => {
    expect(mapVersionRows([row({ size: 40 })])).toEqual([
      { id: 1, seq: 10, editedAt: T, savedAt: '2026-11-14T11:00:00.000Z', size: 2, reason: 'edit' },
    ])
  })

  it('accepts bigint columns as numeric strings and normalizes timestamps to ISO', () => {
    const [v] = mapVersionRows([row({ id: '7', seq: '12', size: '40', updated_at: '2026-11-14T10:00:00.123456+00:00' })])
    expect(v).toMatchObject({ id: 7, seq: 12, size: 2, editedAt: '2026-11-14T10:00:00.123Z' })
  })

  it('drops malformed rows without hiding the rest', () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 1.5 }),
      row({ id: 'abc' }),
      row({ id: 0 }),
      row({ seq: null }),
      row({ seq: -1 }),
      row({ updated_at: 'not a date' }),
      row({ created_at: undefined }),
      row({ size: 'big' }),
      row({ size: null }),
      null,
      'row',
    ]
    expect(mapVersionRows(rows).map((v) => v.id)).toEqual([1])
  })

  it('keeps manual snapshots, and reads an unknown or missing reason as a plain edit', () => {
    const out = mapVersionRows([
      row({ id: 1, seq: 1, reason: 'manual' }),
      row({ id: 2, seq: 2, reason: 'restore' }),
      row({ id: 3, seq: 3, reason: null }),
      row({ id: 4, seq: 4, reason: 'shrink' }),
    ])
    expect(out.map((v) => [v.id, v.reason])).toEqual([[4, 'shrink'], [3, 'edit'], [2, 'edit'], [1, 'manual']])
  })

  it('sorts by seq DESC, then id DESC', () => {
    const out = mapVersionRows([
      row({ id: 1, seq: 5 }),
      row({ id: 2, seq: 9 }),
      row({ id: 4, seq: 7 }),
      row({ id: 3, seq: 7 }),
    ])
    expect(out.map((v) => [v.seq, v.id])).toEqual([[9, 2], [7, 4], [7, 3], [5, 1]])
  })

  it('maps a non-array body to []', () => {
    expect(mapVersionRows({ code: 'x' })).toEqual([])
    expect(mapVersionRows(null)).toEqual([])
  })
})

describe('parseVersionRow', () => {
  const ok = { id: 3, seq: 8, updated_at: T, reason: 'delete', path_key: 'pk', content_ct: 'ct', key_ct: 'kc' }
  it('accepts a well-formed row (content_ct may be empty)', () => {
    expect(parseVersionRow(ok)).toMatchObject({ ok: true, id: 3, seq: 8, reason: 'delete', pathKey: 'pk' })
    expect(parseVersionRow({ ...ok, content_ct: '', key_ct: '' })).toMatchObject({ ok: true, contentCt: '' })
  })
  it('malformed metadata → unknown; unusable blobs → decrypt-failed', () => {
    expect(parseVersionRow({ ...ok, seq: 'x' })).toEqual({ ok: false, errorCode: 'unknown' })
    expect(parseVersionRow({ ...ok, path_key: null })).toEqual({ ok: false, errorCode: 'unknown' })
    expect(parseVersionRow({ ...ok, reason: 'manual' })).toMatchObject({ ok: true, reason: 'manual' })
    expect(parseVersionRow({ ...ok, reason: 'nope' })).toMatchObject({ ok: true, reason: 'edit' })
    expect(parseVersionRow({ ...ok, key_ct: null })).toEqual({ ok: false, errorCode: 'decrypt-failed' })
    expect(parseVersionRow({ ...ok, key_ct: '' })).toEqual({ ok: false, errorCode: 'decrypt-failed' })
    expect(parseVersionRow({ ...ok, content_ct: 5 })).toEqual({ ok: false, errorCode: 'decrypt-failed' })
  })
})

describe('parseVersionTarget', () => {
  const posixDir = '/home/u/noteflow-notes'
  const winDir = 'C:\\Users\\u\\noteflow-notes'

  it('accepts a direct child folder of the notes dir', () => {
    expect(parseVersionTarget(posixDir, { notePath: `${posixDir}/plan-abcd1234`, sectionId: 's1' }, 'linux'))
      .toEqual({ ok: true, dir: 'plan-abcd1234', sectionId: 's1' })
    expect(parseVersionTarget(posixDir, { notePath: `${posixDir}/plan-abcd1234/`, sectionId: 's1' }, 'linux'))
      .toMatchObject({ ok: true, dir: 'plan-abcd1234' })
  })

  it('follows the platform case rules', () => {
    expect(parseVersionTarget(winDir, { notePath: 'c:\\users\\U\\NOTEFLOW-NOTES\\Plan-abcd1234', sectionId: 's1' }, 'win32'))
      .toEqual({ ok: true, dir: 'Plan-abcd1234', sectionId: 's1' })
    expect(parseVersionTarget(posixDir, { notePath: '/home/u/NoteFlow-Notes/plan-abcd1234', sectionId: 's1' }, 'linux'))
      .toEqual({ ok: false, errorCode: 'invalid-path' })
  })

  it('rejects paths outside the notes dir, nested, traversals, relatives and the dir itself', () => {
    const bad = [
      '/home/u/other/plan-abcd1234',
      `${posixDir}/plan-abcd1234/s1.md`,
      `${posixDir}/../plan-abcd1234`,
      `${posixDir}/x/../../plan-abcd1234`,
      'noteflow-notes/plan-abcd1234',
      posixDir,
      '/',
      '',
    ]
    for (const notePath of bad) {
      expect(parseVersionTarget(posixDir, { notePath, sectionId: 's1' }, 'linux')).toEqual({ ok: false, errorCode: 'invalid-path' })
    }
  })

  it('rejects malformed targets and unsafe section ids', () => {
    const notePath = `${posixDir}/plan-abcd1234`
    for (const target of [null, 'x', {}, { notePath }, { notePath: 5, sectionId: 's1' }]) {
      expect(parseVersionTarget(posixDir, target, 'linux')).toEqual({ ok: false, errorCode: 'invalid-path' })
    }
    for (const sectionId of ['', '.', '..', 'a/b', 'a\\b', '../s1', 'x\u0000', 'a'.repeat(129), 7]) {
      expect(isValidSectionId(sectionId)).toBe(false)
      expect(parseVersionTarget(posixDir, { notePath, sectionId }, 'linux')).toEqual({ ok: false, errorCode: 'invalid-path' })
    }
  })
})

describe('resolveSectionRelPath', () => {
  const dir = 'plan-abcd1234'

  it('uses sections[].file of the section entry', () => {
    const md = noteMdWith('  - id: s1\n    name: Main\n    file: renamed.md\n  - id: s2\n    name: Other\n')
    expect(resolveSectionRelPath(dir, 's1', md)).toEqual({ ok: true, relPath: `${dir}/renamed.md` })
  })

  it('falls back to <id>.md for an entry without file, and for a section absent from note.md', () => {
    const md = noteMdWith('  - id: s1\n    name: Main\n    file: renamed.md\n  - id: s2\n    name: Other\n')
    expect(resolveSectionRelPath(dir, 's2', md)).toEqual({ ok: true, relPath: `${dir}/s2.md` })
    expect(resolveSectionRelPath(dir, 'gone', md)).toEqual({ ok: true, relPath: `${dir}/gone.md` })
  })

  it('works with what serializeNoteFolder writes (numeric-looking ids included)', () => {
    const note: DiskNote = { id: 'abcd1234', title: 'Plan', tags: [], created: T, updated: T, sections: [{ id: '123', name: 'A', content: 'x' }] }
    const md = serializeNoteFolder(note, { preserveUpdated: true }).files['note.md']
    expect(resolveSectionRelPath(dir, '123', md)).toEqual({ ok: true, relPath: `${dir}/123.md` })
  })

  it('never resolves to note.md nor to an unsafe file', () => {
    expect(resolveSectionRelPath(dir, 'note', noteMdWith('  - id: s1\n'))).toEqual({ ok: false, errorCode: 'invalid-path' })
    for (const file of ['note.md', '../x.md', 'sub/x.md', 'a\\b.md', '.hidden.md', 'x.txt']) {
      const md = noteMdWith(`  - id: s1\n    file: "${file.replace(/\\/g, '\\\\')}"\n`)
      expect(resolveSectionRelPath(dir, 's1', md)).toEqual({ ok: false, errorCode: 'invalid-path' })
    }
  })

  it('malformed YAML falls back to <id>.md, like noteFormat.loadFrontmatter', () => {
    const broken = `---\nid: b\ntitle: [unclosed\nsections:\n  - id: s1\n    file: renamed.md\n---\n`
    expect(resolveSectionRelPath(dir, 's1', broken)).toEqual({ ok: true, relPath: `${dir}/s1.md` })
  })

  it('local-only and password-protected notes are unsupported', () => {
    const localOnly = `---\nid: w\ntitle: Welcome\nlocalOnly: true\nsections:\n  - id: s1\n---\n`
    expect(resolveSectionRelPath(dir, 's1', localOnly)).toEqual({ ok: false, errorCode: 'unsupported-note' })
    const encrypted = `---\nid: e\ntitle: Secret\nencryption:\n  v: 1\n  salt: abc\n---\n`
    expect(resolveSectionRelPath(dir, 's1', encrypted)).toEqual({ ok: false, errorCode: 'unsupported-note' })
  })
})

describe('parseVersionId', () => {
  it('accepts positive safe integers only', () => {
    expect(parseVersionId(42)).toBe(42)
    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '42', null, undefined]) {
      expect(parseVersionId(bad)).toBeNull()
    }
  })
})

describe('error classification', () => {
  it('HTTP: 404 / PGRST205 → unavailable, other errors → unknown, 2xx → null', () => {
    expect(classifyVersionsHttp(404, { code: 'PGRST205', message: 'not found' })).toBe('unavailable')
    expect(classifyVersionsHttp(404, null)).toBe('unavailable')
    expect(classifyVersionsHttp(400, { code: 'PGRST205' })).toBe('unavailable')
    expect(classifyVersionsHttp(401, null)).toBe('unknown')
    expect(classifyVersionsHttp(500, null)).toBe('unknown')
    expect(classifyVersionsHttp(200, [])).toBeNull()
  })

  it('access errors map to their codes, anything else → unknown', () => {
    expect(classifyVersionsError(new Error(NOT_SIGNED_IN_TAG))).toBe('not-signed-in')
    expect(classifyVersionsError(new Error(SESSION_LOCKED_TAG))).toBe('session-locked')
    expect(classifyVersionsError(new Error(ACCOUNT_UNREACHABLE_TAG))).toBe('unreachable')
    expect(classifyVersionsError(new TypeError('fetch failed'))).toBe('unreachable')
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    expect(classifyVersionsError(timeout)).toBe('unreachable')
    expect(classifyVersionsError(new Error('boom'))).toBe('unknown')
  })

  it('withOneRetry: no retry for signed-out / keychain-locked', async () => {
    const fn = vi.fn(async () => { throw new Error(NOT_SIGNED_IN_TAG) })
    await expect(withOneRetry(fn, 0)).rejects.toThrow(NOT_SIGNED_IN_TAG)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('snapshot classification', () => {
  it('RPC answer: true / false / missing function / no subscription / server / other', () => {
    expect(classifySnapshotHttp(200, true)).toBe('captured')
    expect(classifySnapshotHttp(200, false)).toBe('no-row')
    expect(classifySnapshotHttp(404, { code: 'PGRST202', message: 'Could not find the function' })).toBe('unavailable')
    expect(classifySnapshotHttp(404, null)).toBe('unavailable')
    expect(classifySnapshotHttp(400, { code: 'PGRST202' })).toBe('unavailable')
    expect(classifySnapshotHttp(403, { code: '42501' })).toBe('no-subscription')
    expect(classifySnapshotHttp(401, { code: '42501' })).toBe('no-subscription')
    expect(classifySnapshotHttp(503, null)).toBe('unreachable')
    expect(classifySnapshotHttp(400, { code: 'XX000' })).toBe('unknown')
    expect(classifySnapshotHttp(200, null)).toBe('unknown')
    expect(classifySnapshotHttp(200, [true])).toBe('unknown')
  })

  it('pending-upload outcome: only clean / uploaded let the snapshot run', () => {
    expect(classifySnapshotFlush('clean')).toBeNull()
    expect(classifySnapshotFlush('uploaded')).toBeNull()
    expect(classifySnapshotFlush('disabled')).toBe('sync-off')
    expect(classifySnapshotFlush('forbidden')).toBe('no-subscription')
    expect(classifySnapshotFlush('gated')).toBe('sync-pending')
    expect(classifySnapshotFlush('stale')).toBe('sync-pending')
    expect(classifySnapshotFlush('failed')).toBe('sync-pending')
  })
})

// ── I/O walk (real crypto, simulated fetch) ───────────────────────────────────

describe('cloudVersions I/O', () => {
  let tmp: string
  let notesDir: string
  let dek: Uint8Array
  let cv: typeof import('../../electron/cloudVersions')
  const DIR = 'plan-abcd1234'
  const REL = `${DIR}/s1.md`
  let fetchMock: ReturnType<typeof vi.fn>
  const reply = (status: number, body: unknown) => ({ status, json: async () => body })
  const target = () => ({ notePath: path.join(notesDir, DIR), sectionId: 's1' })
  const deps = () => ({ getDek: () => dek, retryDelayMs: 0 })

  async function versionRow(id: number, relPath: string, content: string, extra: Record<string, unknown> = {}) {
    const row = await buildFileUpsertRow(dek, generateNoteKey(), relPath, content, T)
    return { id, path_key: row.path_key, content_ct: row.content_ct, key_ct: row.key_ct, updated_at: T, seq: 30 + id, reason: 'edit', ...extra }
  }

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-cloud-versions-'))
    notesDir = path.join(tmp, 'notes')
    fs.mkdirSync(path.join(notesDir, DIR), { recursive: true })
    const note: DiskNote = { id: 'abcd1234', title: 'Plan', tags: [], created: T, updated: T, sections: [{ id: 's1', name: 'Main', content: 'now' }] }
    for (const [f, c] of Object.entries(serializeNoteFolder(note, { preserveUpdated: true }).files)) {
      fs.writeFileSync(path.join(notesDir, DIR, f), c, 'utf-8')
    }
    dek = generateDek()
    session.signedIn = true
    session.token = { ok: true, token: 'test-token' }
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    cv = await import('../../electron/cloudVersions')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('lists with the section path_key and the contract params, then decrypts a version', async () => {
    const pathKey = await derivePathKeyHmac(dek, REL)
    fetchMock.mockResolvedValueOnce(reply(200, [
      { id: 1, seq: 31, updated_at: T, created_at: T, size: 60, reason: 'edit' },
      { id: 2, seq: 32, updated_at: T, created_at: T, size: '0', reason: 'delete' },
    ]))
    const list = await cv.listSectionVersions(notesDir, target(), deps())
    expect(list).toEqual({
      ok: true,
      versions: [
        { id: 2, seq: 32, editedAt: T, savedAt: T, size: 0, reason: 'delete' },
        { id: 1, seq: 31, editedAt: T, savedAt: T, size: 17, reason: 'edit' },
      ],
    })
    const [url, init] = fetchMock.mock.calls[0]
    const u = new URL(url as string)
    expect(u.pathname).toBe('/rest/v1/file_versions')
    expect(u.searchParams.get('path_key')).toBe(`eq.${pathKey}`)
    expect(u.searchParams.get('select')).toBe(VERSION_LIST_COLUMNS)
    expect(u.searchParams.get('order')).toBe('seq.desc')
    expect(u.searchParams.get('limit')).toBe('200')
    expect(url).toContain(versionListEndpoint(pathKey))
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer test-token')

    const text = 'old text — con acentos 📝'
    fetchMock.mockResolvedValueOnce(reply(200, [await versionRow(1, REL, text)]))
    const got = await cv.getSectionVersion(notesDir, target(), 1, deps())
    expect(got).toEqual({ ok: true, version: { id: 1, seq: 31, editedAt: T, reason: 'edit', content: text } })
    const getUrl = new URL(fetchMock.mock.calls[1][0] as string)
    expect(getUrl.searchParams.get('id')).toBe('eq.1')
  })

  it('a row of another file is never decrypted (path_key mismatch → decrypt-failed)', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, [await versionRow(5, `${DIR}/other.md`, 'secret')]))
    expect(await cv.getSectionVersion(notesDir, target(), 5, deps())).toEqual({ ok: false, errorCode: 'decrypt-failed' })
  })

  it('a row sealed under another DEK → decrypt-failed', async () => {
    const row = await versionRow(5, REL, 'x')
    const foreign = await buildFileUpsertRow(generateDek(), generateNoteKey(), REL, 'x', T)
    fetchMock.mockResolvedValueOnce(reply(200, [{ ...row, key_ct: foreign.key_ct }]))
    expect(await cv.getSectionVersion(notesDir, target(), 5, deps())).toEqual({ ok: false, errorCode: 'decrypt-failed' })
  })

  it('empty content_ct decrypts to an empty text', async () => {
    const row = await versionRow(6, REL, 'x', { content_ct: '' })
    fetchMock.mockResolvedValueOnce(reply(200, [row]))
    expect(await cv.getSectionVersion(notesDir, target(), 6, deps())).toMatchObject({ ok: true, version: { content: '' } })
  })

  it('server without the migration → unavailable', async () => {
    fetchMock.mockResolvedValue(reply(404, { code: 'PGRST205', message: "Could not find the table 'public.file_versions'" }))
    expect(await cv.listSectionVersions(notesDir, target(), deps())).toEqual({ ok: false, errorCode: 'unavailable' })
    expect(await cv.getSectionVersion(notesDir, target(), 1, deps())).toEqual({ ok: false, errorCode: 'unavailable' })
  })

  it('get of a pruned version → not-found', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, []))
    expect(await cv.getSectionVersion(notesDir, target(), 9, deps())).toEqual({ ok: false, errorCode: 'not-found' })
  })

  it('retries once after a 5xx', async () => {
    fetchMock.mockResolvedValueOnce(reply(503, null)).mockResolvedValueOnce(reply(200, []))
    expect(await cv.listSectionVersions(notesDir, target(), deps())).toEqual({ ok: true, versions: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('two network failures → unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect(await cv.listSectionVersions(notesDir, target(), deps())).toEqual({ ok: false, errorCode: 'unreachable' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gates: not configured, signed out, locked keys, keychain-locked session', async () => {
    expect(await cv.listSectionVersions(notesDir, target(), { ...deps(), isConfigured: () => false }))
      .toEqual({ ok: false, errorCode: 'unavailable' })
    session.signedIn = false
    expect(await cv.listSectionVersions(notesDir, target(), deps())).toEqual({ ok: false, errorCode: 'not-signed-in' })
    session.signedIn = true
    expect(await cv.listSectionVersions(notesDir, target(), { ...deps(), getDek: () => null }))
      .toEqual({ ok: false, errorCode: 'locked' })
    session.token = { ok: false, reason: 'locked' }
    expect(await cv.getSectionVersion(notesDir, target(), 1, deps())).toEqual({ ok: false, errorCode: 'session-locked' })
    session.token = { ok: false, reason: 'noSession' }
    expect(await cv.listSectionVersions(notesDir, target(), deps())).toEqual({ ok: false, errorCode: 'not-signed-in' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('invalid targets and ids never reach the server', async () => {
    expect(await cv.listSectionVersions(notesDir, { notePath: path.join(notesDir, 'missing-1234'), sectionId: 's1' }, deps()))
      .toEqual({ ok: false, errorCode: 'invalid-path' })
    expect(await cv.listSectionVersions(notesDir, { notePath: tmp, sectionId: 's1' }, deps()))
      .toEqual({ ok: false, errorCode: 'invalid-path' })
    expect(await cv.getSectionVersion(notesDir, target(), -3, deps())).toEqual({ ok: false, errorCode: 'invalid-path' })
    fs.writeFileSync(path.join(notesDir, DIR, 'note.md'), `---\nid: abcd1234\nlocalOnly: true\n---\n`, 'utf-8')
    expect(await cv.listSectionVersions(notesDir, target(), deps())).toEqual({ ok: false, errorCode: 'unsupported-note' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  describe('snapshotSectionVersion', () => {
    const flushed: string[] = []
    const snapDeps = (outcome: Parameters<typeof classifySnapshotFlush>[0] = 'clean') => ({
      ...deps(),
      flushPath: async (_dir: string, relPath: string) => { flushed.push(relPath); return outcome },
    })
    beforeEach(() => { flushed.length = 0 })

    it('lands the pending upload of the section file, then calls the RPC with its path_key', async () => {
      const pathKey = await derivePathKeyHmac(dek, REL)
      fetchMock.mockResolvedValueOnce(reply(200, true))
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps('uploaded'))).toEqual({ ok: true })
      expect(flushed).toEqual([REL])
      const [url, init] = fetchMock.mock.calls[0]
      expect(new URL(url as string).pathname).toBe('/rest/v1/rpc/cloud_snapshot_file')
      const req = init as { method: string; body: string; headers: Record<string, string> }
      expect(req.method).toBe('POST')
      expect(JSON.parse(req.body)).toEqual({ p_path_key: pathKey })
      expect(req.headers['Content-Type']).toBe('application/json')
    })

    it('false (no live row): ok only when the local file has no text', async () => {
      fetchMock.mockResolvedValue(reply(200, false))
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: false, errorCode: 'sync-pending' })
      fs.writeFileSync(path.join(notesDir, REL), '', 'utf-8')
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: true })
      fs.rmSync(path.join(notesDir, REL))
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: true })
    })

    it('server without migration 0017 (404 PGRST202) → unavailable', async () => {
      fetchMock.mockResolvedValue(reply(404, { code: 'PGRST202', message: 'Could not find the function public.cloud_snapshot_file' }))
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: false, errorCode: 'unavailable' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('403 / 42501 → no-subscription (not retried)', async () => {
      fetchMock.mockResolvedValue(reply(403, { code: '42501', message: 'permission denied' }))
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: false, errorCode: 'no-subscription' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('network: one retry, then unreachable; a 5xx then true → ok; two 5xx → unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: false, errorCode: 'unreachable' })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      fetchMock.mockReset()
      fetchMock.mockResolvedValueOnce(reply(502, null)).mockResolvedValueOnce(reply(200, true))
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: true })
      fetchMock.mockReset()
      fetchMock.mockResolvedValue(reply(500, null))
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: false, errorCode: 'unreachable' })
    })

    it('a pending upload that cannot land stops before the RPC', async () => {
      const cases = [
        ['disabled', 'sync-off'],
        ['gated', 'sync-pending'],
        ['stale', 'sync-pending'],
        ['failed', 'sync-pending'],
        ['forbidden', 'no-subscription'],
      ] as const
      for (const [outcome, errorCode] of cases) {
        expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps(outcome))).toEqual({ ok: false, errorCode })
      }
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('gates and target validation run before any flush or request', async () => {
      expect(await cv.snapshotSectionVersion(notesDir, target(), { ...snapDeps(), getDek: () => null }))
        .toEqual({ ok: false, errorCode: 'locked' })
      expect(await cv.snapshotSectionVersion(notesDir, target(), { ...snapDeps(), isConfigured: () => false }))
        .toEqual({ ok: false, errorCode: 'unavailable' })
      session.signedIn = false
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: false, errorCode: 'not-signed-in' })
      session.signedIn = true
      expect(await cv.snapshotSectionVersion(notesDir, { notePath: tmp, sectionId: 's1' }, snapDeps()))
        .toEqual({ ok: false, errorCode: 'invalid-path' })
      expect(await cv.snapshotSectionVersion(notesDir, { notePath: path.join(notesDir, DIR), sectionId: '../s1' }, snapDeps()))
        .toEqual({ ok: false, errorCode: 'invalid-path' })
      expect(await cv.snapshotSectionVersion(notesDir, null, snapDeps())).toEqual({ ok: false, errorCode: 'invalid-path' })
      fs.writeFileSync(path.join(notesDir, DIR, 'note.md'), `---\nid: abcd1234\nlocalOnly: true\n---\n`, 'utf-8')
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: false, errorCode: 'unsupported-note' })
      expect(flushed).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('a keychain-locked session → session-locked (no retry)', async () => {
      session.token = { ok: false, reason: 'locked' }
      expect(await cv.snapshotSectionVersion(notesDir, target(), snapDeps())).toEqual({ ok: false, errorCode: 'session-locked' })
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
