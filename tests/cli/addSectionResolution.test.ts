// How `noteflow add` picks its target section. Two deliberately different rules
// live in cmdAdd and this is the regression net for both:
//  - an EXPLICIT --section resolves like `set`: exact name (case-insensitive) or
//    create, '#n' among duplicates, several same-named ones exit. A partial name
//    NEVER lands on an existing section (`--section EN` would append to
//    "Comentario") — loosely similar sections are only listed on stderr;
//  - the IMPLICIT default 'Note' (no --section given) is exact-or-create too, but
//    without the similar-names hint (it would fire on every daily append).
// Driven through the real CLI in --dry-run (writes nothing, syncs nothing) with
// NOTEFLOW_NOTES_DIR and the settings dir (APPDATA / XDG_CONFIG_HOME) pointed at
// throwaway dirs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../cli/noteflow.js')

let tmp: string
let notesDir: string

/** Title of today's daily note, same format cmdAdd derives (DD-MM-YYYY). */
function todayTitle(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

/** Writes a v2 note folder (anchor + one .md per section) into the temp notes dir. */
function writeNote(title: string, sectionNames: string[]) {
  const id = 'testid01'
  const dir = path.join(notesDir, `note-${id}`)
  fs.mkdirSync(dir, { recursive: true })
  const index = sectionNames
    .map((name, i) => `  - id: "sec${i}"\n    name: "${name}"\n    file: "sec${i}.md"\n    isRawMode: true`)
    .join('\n')
  fs.writeFileSync(
    path.join(dir, 'note.md'),
    `---\nid: "${id}"\ntitle: "${title}"\ntags: []\ncreated: "2026-07-01T10:00:00.000Z"\n`
      + `updated: "2026-07-01T10:00:00.000Z"\nformatVersion: 2\nsections:\n${index}\n---\n`,
    'utf-8',
  )
  sectionNames.forEach((_, i) => fs.writeFileSync(path.join(dir, `sec${i}.md`), 'body\n', 'utf-8'))
}

type Run = { status: number; stdout: string; stderr: string }

/** Runs the CLI; stderr is captured on success too (the similar-names hint lives there). */
function run(args: string[]): Run {
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

/** `add ... --dry-run --json`: nothing is written, the resolved target comes back as JSON. */
function addDryRun(args: string[]) {
  const r = run(['add', 'hello', '--dry-run', '--json', ...args])
  expect(r.status, r.stderr).toBe(0)
  return { ...(JSON.parse(r.stdout) as { section: string; createdSection: boolean }), stderr: r.stderr }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-cli-test-'))
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(notesDir)
  fs.writeFileSync(path.join(notesDir, '.noteflow-format'), '2', 'utf-8')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('add without --section (implicit "Note")', () => {
  it('creates "Note" instead of appending to a section that merely contains the word', () => {
    writeNote(todayTitle(), ['Meeting Notes', 'Ideas'])
    const r = addDryRun([])
    expect(r).toMatchObject({ section: 'Note', createdSection: true })
    expect(r.stderr).not.toContain('Similar existing')
  })

  it('does not abort as ambiguous when several sections contain "Note"', () => {
    writeNote(todayTitle(), ['Meeting Notes', 'Notes de la reunion'])
    expect(addDryRun([])).toMatchObject({ section: 'Note', createdSection: true })
  })

  it('still reuses an exact (case-insensitive) "Note" section', () => {
    writeNote(todayTitle(), ['note', 'Ideas'])
    expect(addDryRun([])).toMatchObject({ section: 'note', createdSection: false })
  })
})

describe('add with an explicit --section', () => {
  it('reuses an exact (case-insensitive) match', () => {
    writeNote('Project Alpha', ['Note', 'Variables Entorno'])
    const r = addDryRun(['--title', 'Project Alpha', '--section', 'variables entorno'])
    expect(r).toMatchObject({ section: 'Variables Entorno', createdSection: false })
    expect(r.stderr).not.toContain('Similar existing')
  })

  it('creates the section instead of appending to a substring match, and says so on stderr', () => {
    writeNote('Project Alpha', ['Note', 'Comentario'])
    const r = addDryRun(['--title', 'Project Alpha', '--section', 'EN'])
    expect(r).toMatchObject({ section: 'EN', createdSection: true })
    expect(r.stderr).toContain('no section named "EN" — would create it. Similar existing: Comentario')
  })

  it('creates the section silently when nothing is even similar', () => {
    writeNote('Project Alpha', ['Note'])
    const r = addDryRun(['--title', 'Project Alpha', '--section', 'Deploy'])
    expect(r).toMatchObject({ section: 'Deploy', createdSection: true })
    expect(r.stderr).not.toContain('Similar existing')
  })

  it('picks a same-named section with the 1-based #n suffix', () => {
    writeNote('Project Alpha', ['Tasks', 'Tasks'])
    expect(addDryRun(['--title', 'Project Alpha', '--section', 'Tasks#2']))
      .toMatchObject({ section: 'Tasks', createdSection: false })
  })

  it('fails on duplicate exact names without #n rather than guessing', () => {
    writeNote('Project Alpha', ['Tasks', 'Tasks'])
    const r = run(['add', 'hello', '--dry-run', '--json', '--title', 'Project Alpha', '--section', 'Tasks'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Disambiguate with "Tasks#1" … "Tasks#2"')
  })

  it('lists every loose candidate (substring or words) without picking one', () => {
    writeNote('Project Alpha', ['Tasks backend', 'Tasks frontend'])
    const r = addDryRun(['--title', 'Project Alpha', '--section', 'Tasks'])
    expect(r).toMatchObject({ section: 'Tasks', createdSection: true })
    expect(r.stderr).toContain('Similar existing: Tasks backend, Tasks frontend')
  })

  it('does not use the loose word matching reserved for read/path', () => {
    writeNote('Project Alpha', ['Note', 'Variables Entorno'])
    const r = addDryRun(['--title', 'Project Alpha', '--section', 'Variables de entorno'])
    expect(r).toMatchObject({ section: 'Variables de entorno', createdSection: true })
    expect(r.stderr).toContain('Similar existing: Variables Entorno')
  })
})
