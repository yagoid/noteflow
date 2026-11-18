// Per-section `updated` in the CLI (cli/noteflow.js), the third mirror of the
// v2 format (note-format.md "`updated` por sección"): the note.md reader/writer
// keeps it, the commands that change a section's content or name stamp it (and
// only that section), and `touch` stamps the sections edited by hand since the
// last save. Real CLI runs are isolated: notes AND settings (APPDATA /
// XDG_CONFIG_HOME) live in throwaway dirs — no sync session, nothing is pushed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseNoteDir, serializeNoteFolder, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import { parseNoteFolder } from '../../src/lib/noteUtils'

const require = createRequire(import.meta.url)
const CLI = require.resolve('../../cli/noteflow.js')
const cli = require(CLI)

type CliSection = { id: string; name: string; content?: string; created?: string; updated?: string }
type CliNote = { id: string; title: string; tags: string[]; created: string; updated: string; sections: CliSection[] }
const parseNoteYaml = cli.parseNoteYaml as (yaml: string) => CliNote
const serializeNoteMd = cli.serializeNoteMd as (note: CliNote, opts?: { preserveUpdated?: boolean }) => string
const splitFrontmatter = cli.splitFrontmatter as (raw: string) => { frontmatter: string }
const editSection = cli.editSection as (sec: CliSection, edit: { name?: string; content?: string }, now?: string) => boolean
const sectionsEditedOutside = cli.sectionsEditedOutside as (mtimes: Record<string, number>, anchorMs: number) => Record<string, string>

const T0 = '2026-01-01T00:00:00.000Z'
const STAMP_A = '2026-02-01T00:00:00.000Z'
const STAMP_B = '2026-02-02T00:00:00.000Z'
const NOW = '2026-03-01T00:00:00.000Z'

describe('note.md mirror', () => {
  it('writes a section updated only when present and reads it back (CLI and app parsers)', () => {
    const noteMd = serializeNoteMd({
      id: 'n1', title: 'T', tags: [], created: T0, updated: T0,
      sections: [{ id: 'a', name: 'Note' }, { id: 'b', name: 'Later', created: T0, updated: STAMP_A }],
    }, { preserveUpdated: true })
    expect(noteMd).toContain(`    updated: "${STAMP_A}"`)
    expect(noteMd.match(/^ {4}updated:/gm)).toHaveLength(1)
    const mine = parseNoteYaml(splitFrontmatter(noteMd).frontmatter)
    expect(mine.sections[0].updated).toBeUndefined()
    expect(mine.sections[1].updated).toBe(STAMP_A)
    const app = parseNoteFolder(noteMd, { 'a.md': '', 'b.md': '' }, '/notes/n1')
    expect(app.sections[0]).not.toHaveProperty('updated')
    expect(app.sections[1].updated).toBe(STAMP_A)
  })

  it('an app-written note.md survives a CLI parse → serialize round-trip', () => {
    const note: DiskNote = {
      id: 'n2', title: 'T', tags: [], created: T0, updated: T0,
      sections: [{ id: 'a', name: 'A', content: '' }, { id: 'b', name: 'B', content: '', updated: STAMP_B }],
    }
    const appMd = serializeNoteFolder(note, { preserveUpdated: true }).files[NOTE_MD]
    const cliMd = serializeNoteMd(parseNoteYaml(splitFrontmatter(appMd).frontmatter), { preserveUpdated: true })
    const back = parseNoteFolder(cliMd, { 'a.md': '', 'b.md': '' }, '/notes/n2')
    expect(back.sections[0]).not.toHaveProperty('updated')
    expect(back.sections[1].updated).toBe(STAMP_B)
  })
})

describe('editSection', () => {
  it('stamps on a real content or name change only', () => {
    const sec: CliSection = { id: 'a', name: 'A', content: 'x', updated: STAMP_A }
    expect(editSection(sec, { content: 'x' }, NOW)).toBe(false)
    expect(editSection(sec, { name: 'A' }, NOW)).toBe(false)
    expect(sec.updated).toBe(STAMP_A)
    expect(editSection(sec, { content: 'y' }, NOW)).toBe(true)
    expect(sec).toEqual({ id: 'a', name: 'A', content: 'y', updated: NOW })
    expect(editSection(sec, { name: 'B' }, STAMP_B)).toBe(true)
    expect(sec.updated).toBe(STAMP_B)
  })
})

describe('sectionsEditedOutside', () => {
  it('flags the section files written well after note.md, with their mtime', () => {
    const anchor = Date.parse('2026-03-01T10:00:00.000Z')
    const out = sectionsEditedOutside({ same: anchor + 5, later: anchor + 60_000, older: anchor - 60_000, gone: NaN }, anchor)
    expect(out).toEqual({ later: '2026-03-01T10:01:00.000Z' })
    expect(sectionsEditedOutside({ a: anchor + 60_000 }, NaN)).toEqual({})
  })
})

describe('commands (real runs, isolated)', () => {
  let tmp: string
  let notesDir: string
  const DIR = 'plan-abc12345'
  const TITLE = 'Plan'

  function run(args: string[]) {
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
    expect(r.status, `${args.join(' ')}\n${r.stderr}`).toBe(0)
  }
  const sections = () => (parseNoteDir(path.join(notesDir, DIR)) as DiskNote).sections
  const stampOf = (name: string) => sections().find((s) => s.name === name)?.updated

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-sec-updated-'))
    notesDir = path.join(tmp, 'notes')
    const { files } = serializeNoteFolder({
      id: 'abc12345', title: TITLE, tags: [], created: T0, updated: T0,
      sections: [
        { id: 'sa', name: 'Alpha', content: 'one', created: T0, updated: STAMP_A },
        { id: 'sb', name: 'Beta', content: 'two' },
      ],
    }, { preserveUpdated: true })
    fs.mkdirSync(path.join(notesDir, DIR), { recursive: true })
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(notesDir, DIR, name), content)
  })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('set / add stamp the section they write; the other one keeps its stamp', () => {
    run(['set', TITLE, 'Beta', '--text', 'two!'])
    const beta = stampOf('Beta')
    expect(Date.parse(beta!)).toBeGreaterThan(Date.parse(STAMP_B))
    expect(stampOf('Alpha')).toBe(STAMP_A)
    run(['add', 'more', '--title', TITLE, '--section', 'Alpha'])
    expect(stampOf('Alpha')).not.toBe(STAMP_A)
    expect(stampOf('Beta')).toBe(beta)
  })

  it('set with the same content does not stamp; section rename does', () => {
    run(['set', TITLE, 'Alpha', '--text', 'one'])
    expect(stampOf('Alpha')).toBe(STAMP_A)
    run(['section', 'rename', TITLE, 'Alpha', 'First'])
    expect(stampOf('First')).not.toBe(STAMP_A)
  })

  it('a new section is born with updated = created', () => {
    run(['section', 'add', TITLE, 'Gamma'])
    const gamma = sections().find((s) => s.name === 'Gamma')!
    expect(gamma.updated).toBe(gamma.created)
  })

  it('touch stamps only the section file edited by hand since the last save (with its mtime)', () => {
    const file = path.join(notesDir, DIR, 'sb.md')
    fs.writeFileSync(file, 'two, edited by hand')
    const edited = new Date(Date.now() + 60_000)
    fs.utimesSync(file, edited, edited)
    run(['touch', TITLE])
    // The file's mtime (filesystems may round it to the second).
    expect(Math.abs(Date.parse(stampOf('Beta')!) - edited.getTime())).toBeLessThan(2000)
    expect(stampOf('Alpha')).toBe(STAMP_A)
    // A second touch with nothing edited changes no section stamp.
    const beta = stampOf('Beta')
    run(['touch', TITLE])
    expect(stampOf('Beta')).toBe(beta)
    expect(stampOf('Alpha')).toBe(STAMP_A)
  })
})
