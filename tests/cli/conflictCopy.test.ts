// Parity of the CLI's conflict copies (cli/noteflow.js cloudPullNow) with the
// app's pure decisions (electron/cloudSyncLogic.ts): same "copy needed" rule,
// same copy shape (new id/title/updated, everything else kept), same dir slug.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import yaml from 'js-yaml'
import {
  planConflictCopy,
  buildConflictCopy,
  anchorTitle,
  conflictCopyTitle,
  metadataPendingForPull,
} from '../../electron/cloudSyncLogic'
import { serializeNoteFolder, splitFrontmatter, NOTE_MD, type DiskNote } from '../../electron/noteFormat'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

type Files = Record<string, string>
type Contents = Record<string, string | null>
const cliPlan = cli.planConflictCopy as (c: string[], l: Contents, s: Contents) => boolean
const cliBuild = cli.buildConflictCopy as (f: Files, o: { newId: string; title: string; nowIso: string }) => { dir: string; files: Files }
const cliTitle = cli.anchorTitle as (c: string) => string
const cliCopyTitle = cli.conflictCopyTitle as (o: string, l: string, n: Date) => string

const DIR = 'groceries-abc12345'
const NOW = '2026-10-21T08:30:00.000Z'

function folder(updated: string, s1: string, extra?: Partial<DiskNote>): Files {
  const note: DiskNote = {
    id: 'abc12345', title: 'Groceries', tags: ['home'], created: '2026-10-01T00:00:00.000Z', updated,
    group: 'g1', folder: 'f1', sections: [{ id: 's1', name: 'Note', content: s1 }], ...extra,
  }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}
const rel = (files: Files): Contents => Object.fromEntries(Object.entries(files).map(([f, c]) => [`${DIR}/${f}`, c]))
const fm = (noteMd: string) => yaml.load(splitFrontmatter(noteMd).frontmatter) as Record<string, unknown>

describe('CLI conflict copy — parity with the app', () => {
  it('same "copy needed" decision', () => {
    const cases: Array<[string[], Contents, Contents]> = [
      [[`${DIR}/note.md`, `${DIR}/s1.md`], rel(folder('2026-10-20T09:00:00.000Z', 'local')), rel(folder('2026-10-20T10:00:00.000Z', 'remote'))],
      [[`${DIR}/note.md`, `${DIR}/s1.md`], rel(folder('2026-10-20T09:00:00.000Z', 'same')), rel(folder('2026-10-20T10:00:00.000Z', 'same'))],
      [[`${DIR}/s1.md`], { [`${DIR}/s1.md`]: 'x' }, {}],
      [[`${DIR}/s1.md`], { [`${DIR}/s1.md`]: null }, {}],
    ]
    for (const [c, l, s] of cases) expect(cliPlan(c, l, s)).toBe(planConflictCopy(c, l, s))
    expect(cases.map(([c, l, s]) => cliPlan(c, l, s))).toEqual([true, false, true, false])
  })

  it('same copy: dir, data (id/title/updated replaced, the rest kept) and section files', () => {
    const local = folder('2026-10-20T09:00:00.000Z', 'offline edit', { favorited: true, expiresAt: '2026-12-01T00:00:00.000Z' })
    const opts = { newId: 'zz99yy88', title: 'Groceries "x" (conflict copy 2026-10-21 10:30)', nowIso: NOW }
    const app = buildConflictCopy(local, opts)
    const mine = cliBuild(local, opts)
    expect(mine.dir).toBe(app.dir)
    expect(Object.keys(mine.files).sort()).toEqual(Object.keys(app.files).sort())
    expect(mine.files['s1.md']).toBe('offline edit')
    expect(fm(mine.files[NOTE_MD])).toEqual(fm(app.files[NOTE_MD]))
    expect(fm(mine.files[NOTE_MD]).title).toBe(opts.title)
  })

  it('encrypted note: the encryption block survives the CLI rewrite', () => {
    // Real NoteEncryption shape (src/lib/cryptoUtils.ts) — numeric iterations included.
    const encryption = {
      alg: 'aes-256-gcm+pbkdf2',
      salt: 'qL0cZ3h1u8Yt2pW9xR4m7A',
      iv: 'Zk3n8QwE1rTy6uIo',
      ciphertext: 'c2VjdGlvbnMtY2lwaGVydGV4dC1wbHVzLWdjbS10YWc_-',
      iterations: 600000,
      hashAlg: 'SHA-512',
    }
    const local = folder('2026-10-20T09:00:00.000Z', '', { encryption, sections: [] })
    const mine = cliBuild(local, { newId: 'enc00001', title: 'T (conflict copy 2026-10-21 10:30)', nowIso: NOW })
    expect(Object.keys(mine.files)).toEqual([NOTE_MD])
    expect(fm(mine.files[NOTE_MD]).encryption).toEqual(encryption)
    expect(typeof (fm(mine.files[NOTE_MD]).encryption as { iterations: unknown }).iterations).toBe('number')
    // The CLI only rewrites id/title/updated: the block's lines stay byte-identical.
    const block = (md: string) => md.slice(md.indexOf('encryption:')).split('\n').filter((l) => l.startsWith('  '))
    expect(block(local[NOTE_MD])).toHaveLength(6)
    expect(block(mine.files[NOTE_MD])).toEqual(block(local[NOTE_MD]))
  })

  it('same first-pull rule for pending metadata (metadataPendingForPull)', () => {
    for (const p of [true, false]) for (const f of [true, false]) {
      expect(cli.metadataPendingForPull(p, f)).toBe(metadataPendingForPull(p, f))
    }
  })

  it('same title helpers', () => {
    for (const md of ['---\nid: a\ntitle: "Hello: world"\n---\n', '---\nid: a\ntitle: Plain\n---\n', '---\nid: a\n---\n']) {
      expect(cliTitle(md)).toBe(anchorTitle(md))
    }
    const d = new Date(2026, 0, 5, 7, 3)
    expect(cliCopyTitle('Groceries', 'conflict copy', d)).toBe(conflictCopyTitle('Groceries', 'conflict copy', d))
  })
})
