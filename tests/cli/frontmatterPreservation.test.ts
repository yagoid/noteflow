// Every CLI write rewrites note.md from what its own parser kept, so a
// frontmatter key the CLI reads but does not write back is silently destroyed.
// The bug: `expiresAt` (a temporary note of the desktop app) was dropped by
// serializeNoteMd, so any `add` / `set` / `touch` / `rename` / … on a temporary
// note made it permanent. Same for a legacy `pinned: true` (the old name of
// `favorited`), which lost the favorite.
//
// Here a note is written by the app's REAL serializer (electron/noteFormat.ts)
// with every optional key, real CLI commands are run on it (NOTEFLOW_NOTES_DIR
// and the settings dir pointed at throwaway dirs — no sync session, nothing is
// pushed anywhere), and the app's REAL parser must read the same values back.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { parseNoteDir, serializeNoteFolder, splitFrontmatter, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import { parseNoteFolder } from '../../src/lib/noteUtils'

const require = createRequire(import.meta.url)
const CLI = require.resolve('../../cli/noteflow.js')
const cli = require(CLI)

const CREATED = '2026-01-01T00:00:00.000Z'
const UPDATED = '2026-01-02T00:00:00.000Z'
const SECTION_CREATED = '2026-02-03T04:05:06.000Z'
const SECTION_UPDATED = '2026-02-04T04:05:06.000Z'
const EXPIRES = '2026-12-31T23:59:59.000Z'
const DIR = 'temporary-note-abc12345'

let tmp: string
let notesDir: string

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      APPDATA: path.join(tmp, 'config'),
      XDG_CONFIG_HOME: path.join(tmp, 'config'),
      NOTEFLOW_NOTES_DIR: notesDir,
      NOTEFLOW_NO_APP_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}
function ok(args: string[]) {
  const r = run(args)
  expect(r.status, `${args.join(' ')}\n${r.stderr}`).toBe(0)
  return r
}

/** The desktop app saves a note folder (its real serializer). */
function appWrites(dir: string, note: DiskNote): string {
  const { files } = serializeNoteFolder(note, { preserveUpdated: true })
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(notesDir, dir, name), content)
  return files[NOTE_MD]
}
const appReads = (dir: string) => parseNoteDir(path.join(notesDir, dir)) as DiskNote
const anchor = (dir: string) => fs.readFileSync(path.join(notesDir, dir, NOTE_MD), 'utf-8')
const fmOf = (noteMd: string) => yaml.load(splitFrontmatter(noteMd).frontmatter) as Record<string, unknown>

/** Every optional key the app writes: note level + section level. */
function fullNote(extra?: Partial<DiskNote>): DiskNote {
  return {
    id: 'abc12345', title: 'Temporary note', tags: ['dev', 'two words'], created: CREATED, updated: UPDATED,
    archived: true, favorited: true, group: 'grp00001', folder: 'fld00001', expiresAt: EXPIRES,
    sections: [
      { id: 'sec001', name: 'Note', content: 'body', isRawMode: true, aiHidden: true, created: SECTION_CREATED, updated: SECTION_UPDATED },
      { id: 'sec002', name: 'Tasks', content: '- [ ] one' },
    ],
    ...extra,
  }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-fm-'))
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(notesDir, { recursive: true })
  fs.writeFileSync(path.join(notesDir, 'groups.json'), JSON.stringify([{ id: 'grp00001', name: 'Work', color: '--accent', order: 0 }]))
  fs.writeFileSync(path.join(notesDir, 'folders.json'), JSON.stringify([{ id: 'fld00001', name: 'Planning', groupId: 'grp00001', order: 0 }]))
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('the serializer writes back every key the app writes', () => {
  it('parse → serialize keeps expiresAt, where the app puts it (after folder, before localOnly)', () => {
    const appMd = serializeNoteFolder(fullNote({ localOnly: true }), { preserveUpdated: true }).files[NOTE_MD]
    const cliMd = cli.serializeNoteMd(cli.parseNoteYaml(cli.splitFrontmatter(appMd).frontmatter), { preserveUpdated: true }) as string
    expect(cliMd).toContain(`expiresAt: "${EXPIRES}"\n`)
    // Same keys, same order, same values as the app's own file.
    expect(Object.keys(fmOf(cliMd))).toEqual(Object.keys(fmOf(appMd)))
    expect(fmOf(cliMd)).toEqual(fmOf(appMd))
    expect(Object.keys(fmOf(cliMd)).slice(-4)).toEqual(['group', 'folder', 'expiresAt', 'localOnly'])
    // Both app parsers (main + renderer) read it back.
    const contents = { 'sec001.md': 'body', 'sec002.md': '- [ ] one' }
    expect(parseNoteFolder(cliMd, contents, '/notes/x').expiresAt).toBe(EXPIRES)
  })

  it('an unquoted timestamp (hand-edited / another writer) is kept too', () => {
    const appMd = serializeNoteFolder(fullNote(), { preserveUpdated: true }).files[NOTE_MD]
    const unquoted = appMd.replace(/^expiresAt:.*$/m, `expiresAt: ${EXPIRES}`)
    expect(unquoted).not.toBe(appMd.replace(/^expiresAt:.*$/m, ''))
    const cliMd = cli.serializeNoteMd(cli.parseNoteYaml(cli.splitFrontmatter(unquoted).frontmatter), { preserveUpdated: true }) as string
    expect(fmOf(cliMd).expiresAt).toBe(EXPIRES)
  })

  it('a note without expiresAt gets none', () => {
    const appMd = serializeNoteFolder(fullNote({ expiresAt: undefined }), { preserveUpdated: true }).files[NOTE_MD]
    const cliMd = cli.serializeNoteMd(cli.parseNoteYaml(cli.splitFrontmatter(appMd).frontmatter), { preserveUpdated: true }) as string
    expect(cliMd).not.toContain('expiresAt')
  })

  it('a legacy `pinned: true` stays a favorite (written as favorited, like the app)', () => {
    const appMd = serializeNoteFolder(fullNote({ favorited: false }), { preserveUpdated: true }).files[NOTE_MD]
    expect(appMd).not.toContain('favorited')
    const legacy = appMd.replace(/^archived: true$/m, 'archived: true\npinned: true')
    const cliMd = cli.serializeNoteMd(cli.parseNoteYaml(cli.splitFrontmatter(legacy).frontmatter), { preserveUpdated: true }) as string
    expect(fmOf(cliMd).favorited).toBe(true)
    expect(cliMd).not.toContain('pinned')
    // An explicit `favorited: false` wins over `pinned`, as in the app (favorited ?? pinned).
    const off = legacy.replace(/^pinned: true$/m, 'favorited: false\npinned: true')
    const cliOff = cli.serializeNoteMd(cli.parseNoteYaml(cli.splitFrontmatter(off).frontmatter), { preserveUpdated: true }) as string
    expect(cliOff).not.toContain('favorited')
  })
})

// Each test spawns the CLI a dozen times (a new Node process each): give them room
// (the default 5 s is not enough when the whole suite runs in parallel).
describe('a temporary note written by the app survives the CLI commands that write', { timeout: 60_000 }, () => {
  it('add, set, touch, rename, section add/rename/delete, favorite, archive, move: the app reads the same values', () => {
    appWrites(DIR, fullNote())
    const before = appReads(DIR)
    expect(before.expiresAt).toBe(EXPIRES)

    const steps: string[][] = [
      ['add', 'appended', '--title', 'Temporary note', '--section', 'Tasks'],
      ['set', 'Temporary note', 'Tasks', '--text', '- [x] one'],
      ['touch', 'Temporary note'],
      ['rename', 'Temporary note', 'Still temporary'],
      ['section', 'add', 'Still temporary', 'Extra'],
      ['section', 'rename', 'Still temporary', 'Extra', 'Extra 2'],
      ['section', 'delete', 'Still temporary', 'Extra 2', '--yes'],
      ['favorite', 'Still temporary'], // toggles off…
      ['favorite', 'Still temporary'], // …and back on
      ['archive', 'Still temporary'],
      ['archive', 'Still temporary'],
      ['move', 'Still temporary', '--ungroup'],
      ['move', 'Still temporary', '--group', 'Work', '--folder', 'Planning'],
    ]
    for (const args of steps) {
      ok(args)
      // After EVERY write, not only at the end.
      expect(appReads(DIR).expiresAt, args.join(' ')).toBe(EXPIRES)
    }

    const after = appReads(DIR)
    expect(after.updated).not.toBe(UPDATED) // the CLI did write
    expect({ ...after, updated: UPDATED }).toEqual({
      ...before,
      title: 'Still temporary',
      // The untouched section keeps its stamp; the one `add`/`set` edited gets a new one.
      sections: [before.sections[0], { ...before.sections[1], content: '- [x] one', updated: after.sections[1].updated }],
    })
    expect(after.sections[0].updated).toBe(SECTION_UPDATED)
    expect(Date.parse(after.sections[1].updated!)).toBeGreaterThan(Date.parse(UPDATED))
    expect(anchor(DIR)).toContain(`expiresAt: "${EXPIRES}"`)
  })

  it('a local-only temporary note keeps both keys', () => {
    appWrites(DIR, fullNote({ localOnly: true }))
    ok(['add', 'x', '--title', 'Temporary note', '--section', 'Tasks'])
    const after = appReads(DIR)
    expect(after.expiresAt).toBe(EXPIRES)
    expect(after.localOnly).toBe(true)
  })

  it('group delete / folder delete (they rewrite every note of the group) keep it', () => {
    appWrites(DIR, fullNote())
    ok(['folder', 'delete', 'Planning', '--group', 'Work', '--yes'])
    expect(appReads(DIR)).toMatchObject({ expiresAt: EXPIRES, group: 'grp00001' })
    expect(appReads(DIR).folder).toBeUndefined()
    ok(['group', 'delete', 'Work', '--yes'])
    expect(appReads(DIR).expiresAt).toBe(EXPIRES)
    expect(appReads(DIR).group).toBeUndefined()
  })
})
