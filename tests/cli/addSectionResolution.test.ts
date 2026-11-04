// How `noteflow add` picks its target section. Two deliberately different rules
// live in cmdAdd and this is the regression net for both:
//  - an EXPLICIT --section resolves like `set`: exact name (case-insensitive),
//    '#n' among duplicates, several same-named ones exit. No exact match is an
//    ERROR (exit 1, near names as "Did you mean" + the existing ones; JSON too
//    with --json) unless --create — a typo used to leave a stray section behind.
//    A partial name NEVER lands on an existing section (`--section EN` would
//    append to "Comentario");
//  - the IMPLICIT default 'Note' (no --section given) is exact-or-create, without
//    the similar-names hint (it would fire on every daily append).
// Plus the mode of the sections it creates: markdown by default, --raw = text.
// Driven through the real CLI with NOTEFLOW_NOTES_DIR and the settings dir
// (APPDATA / XDG_CONFIG_HOME) pointed at throwaway dirs — no sync session exists,
// so nothing is pushed anywhere.
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

/** Sections (name + mode) of a note as the CLI reads them back from disk. */
function modes(title: string): { name: string; isRawMode: boolean }[] {
  const r = run(['read', title, '--json'])
  expect(r.status, r.stderr).toBe(0)
  return (JSON.parse(r.stdout) as { sections: { name: string; isRawMode?: boolean }[] }).sections
    .map(s => ({ name: s.name, isRawMode: !!s.isRawMode }))
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

  it('really creates "Note" on an existing daily note, without needing --create', () => {
    writeNote(todayTitle(), ['Ideas'])
    const r = run(['add', 'hello'])
    expect(r.status, r.stderr).toBe(0)
    expect(modes(todayTitle())).toEqual([
      { name: 'Ideas', isRawMode: true },
      { name: 'Note', isRawMode: false },
    ])
  })
})

describe('add with an explicit --section', () => {
  it('reuses an exact (case-insensitive) match', () => {
    writeNote('Project Alpha', ['Note', 'Variables Entorno'])
    const r = addDryRun(['--title', 'Project Alpha', '--section', 'variables entorno'])
    expect(r).toMatchObject({ section: 'Variables Entorno', createdSection: false })
    expect(r.stderr).not.toContain('Similar existing')
  })

  it('fails on an unknown name, suggesting the near one and listing the rest', () => {
    writeNote('NOTEFLOW-MOBILE', ['Urgent', 'Features', 'Improvements', 'Errors'])
    const r = run(['add', 'hello', '--title', 'NOTEFLOW-MOBILE', '--section', 'Improvement'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('No section named "Improvement" in "NOTEFLOW-MOBILE". Did you mean "Improvements"?')
    expect(r.stderr).toContain('Existing: Urgent, Features, Improvements, Errors')
    expect(r.stderr).toContain('--create')
    expect(modes('NOTEFLOW-MOBILE').map(s => s.name)).toEqual(['Urgent', 'Features', 'Improvements', 'Errors'])
  })

  it('never appends to a substring match: "EN" fails and suggests "Comentario"', () => {
    writeNote('Project Alpha', ['Note', 'Comentario'])
    const r = run(['add', 'hello', '--title', 'Project Alpha', '--section', 'EN'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Did you mean "Comentario"?')
  })

  it('reproduces the error in --dry-run, and prints it as JSON with --json', () => {
    writeNote('Project Alpha', ['Tasks backend', 'Tasks frontend', 'Ideas'])
    const r = run(['add', 'hello', '--dry-run', '--json', '--title', 'Project Alpha', '--section', 'Tasks'])
    expect(r.status).toBe(1)
    expect(JSON.parse(r.stdout)).toEqual({
      error: 'No section named "Tasks" in "Project Alpha". Did you mean one of: "Tasks backend", "Tasks frontend"?',
      code: 'section_not_found',
      note: 'Project Alpha',
      section: 'Tasks',
      sections: ['Tasks backend', 'Tasks frontend', 'Ideas'],
      suggestions: ['Tasks backend', 'Tasks frontend'],
    })
  })

  it('omits "Did you mean" when nothing is similar', () => {
    writeNote('Project Alpha', ['Note'])
    const r = run(['add', 'hello', '--title', 'Project Alpha', '--section', 'Deploy'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('No section named "Deploy" in "Project Alpha".')
    expect(r.stderr).not.toContain('Did you mean')
  })

  it('also fails on the daily note (only the implicit "Note" is auto-created)', () => {
    writeNote(todayTitle(), ['Note'])
    const r = run(['add', 'hello', '--section', 'Log'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('No section named "Log"')
  })

  it('--create creates it, flagging similar sections on stderr', () => {
    writeNote('Project Alpha', ['Note', 'Comentario'])
    const r = addDryRun(['--title', 'Project Alpha', '--section', 'EN', '--create'])
    expect(r).toMatchObject({ section: 'EN', createdSection: true })
    expect(r.stderr).toContain('no section named "EN" — would create it. Similar existing: Comentario')
  })

  it('--create creates the note AND its section when both are missing', () => {
    const r = run(['add', 'hello', '--title', 'Brand New', '--section', 'Tasks', '--create', '--json'])
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toMatchObject({ note: 'Brand New', section: 'Tasks', createdNote: true, createdSection: true })
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

  it('does not use the loose word matching reserved for read/path', () => {
    writeNote('Project Alpha', ['Note', 'Variables Entorno'])
    const r = addDryRun(['--title', 'Project Alpha', '--section', 'Variables de entorno', '--create'])
    expect(r).toMatchObject({ section: 'Variables de entorno', createdSection: true })
    expect(r.stderr).toContain('Similar existing: Variables Entorno')
  })
})

describe('mode of the sections add creates', () => {
  it('is markdown mode by default, text mode with --raw', () => {
    writeNote('Project Alpha', ['Note'])
    expect(run(['add', 'a', '--title', 'Project Alpha', '--section', 'Md', '--create']).status).toBe(0)
    expect(run(['add', 'b', '--title', 'Project Alpha', '--section', 'Txt', '--create', '--raw']).status).toBe(0)
    expect(run(['add', 'c', '--title', 'Project Alpha', '--section', 'Rich', '--create', '--rich']).status).toBe(0)
    expect(modes('Project Alpha')).toEqual([
      { name: 'Note', isRawMode: true },
      { name: 'Md', isRawMode: false },
      { name: 'Txt', isRawMode: true },
      { name: 'Rich', isRawMode: false },
    ])
  })

  it('never changes the mode of an existing section', () => {
    writeNote('Project Alpha', ['Note'])
    expect(run(['add', 'a', '--title', 'Project Alpha', '--section', 'Note', '--markdown']).status).toBe(0)
    expect(modes('Project Alpha')).toEqual([{ name: 'Note', isRawMode: true }])
  })

  it('creates a brand-new note in markdown mode (or text with --raw)', () => {
    expect(run(['add', 'a', '--title', 'Alpha', '--create']).status).toBe(0)
    expect(run(['add', 'b', '--title', 'Beta', '--create', '--raw']).status).toBe(0)
    expect(modes('Alpha')).toEqual([{ name: 'Note', isRawMode: false }])
    expect(modes('Beta')).toEqual([{ name: 'Note', isRawMode: true }])
  })
})
