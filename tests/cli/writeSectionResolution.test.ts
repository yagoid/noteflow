// Section resolution of the CLI's write/destructive commands (cli/noteflow.js):
// `set`, `section rename` and `section delete` match the EXACT section name only
// (case-insensitive, '#n' among duplicates). Regression net for a real data loss:
// `noteflow set <note> EN --text …` overwrote "Comentario", because the old
// matcher fell back to substrings ("comentario".includes("en")) — and
// `section delete <note> EN` would have deleted it. Loose matching stays opt-in
// for the read-only `read`/`path`.
// Real writes through the real CLI, isolated: notes AND settings (APPDATA /
// XDG_CONFIG_HOME) live in throwaway dirs, so no GitHub/Cloud session exists and
// nothing is pushed anywhere.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../cli/noteflow.js')
const TITLE = 'Project Alpha'

let tmp: string
let notesDir: string
let noteDir: string

/** Writes a v2 note folder whose section i has body `body <name>`. */
function writeNote(sectionNames: string[]) {
  const id = 'testid01'
  noteDir = path.join(notesDir, `note-${id}`)
  fs.mkdirSync(noteDir, { recursive: true })
  const index = sectionNames
    .map((name, i) => `  - id: "sec${i}"\n    name: "${name}"\n    file: "sec${i}.md"\n    isRawMode: true`)
    .join('\n')
  fs.writeFileSync(
    path.join(noteDir, 'note.md'),
    `---\nid: "${id}"\ntitle: "${TITLE}"\ntags: []\ncreated: "2026-07-01T10:00:00.000Z"\n`
      + `updated: "2026-07-01T10:00:00.000Z"\nformatVersion: 2\nsections:\n${index}\n---\n`,
    'utf-8',
  )
  sectionNames.forEach((name, i) => fs.writeFileSync(path.join(noteDir, `sec${i}.md`), `body ${name}\n`, 'utf-8'))
}

type Run = { status: number; stdout: string; stderr: string }

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

type Section = { name: string; content: string }

/** The note's sections as the CLI reads them back from disk. */
function sections(): Section[] {
  const r = run(['read', TITLE, '--json'])
  expect(r.status, r.stderr).toBe(0)
  return (JSON.parse(r.stdout) as { sections: Section[] }).sections.map(s => ({ name: s.name, content: s.content }))
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-cli-write-'))
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(notesDir)
  fs.writeFileSync(path.join(notesDir, '.noteflow-format'), '2', 'utf-8')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('set', () => {
  it('creates "EN" and leaves "Comentario" intact (substring is not a match)', () => {
    writeNote(['Note', 'Comentario'])
    const r = run(['set', TITLE, 'EN', '--text', 'english text'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('Created section "EN"')
    expect(r.stderr).toContain('Note: no section named "EN" — created it. Similar existing: Comentario')
    expect(r.stdout).not.toContain('Similar existing') // the hint never pollutes stdout
    expect(sections()).toEqual([
      { name: 'Note', content: 'body Note\n' },
      { name: 'Comentario', content: 'body Comentario\n' },
      { name: 'EN', content: 'english text' },
    ])
  })

  it('keeps --json stdout pure while hinting on stderr', () => {
    writeNote(['Note', 'Comentario'])
    const r = run(['set', TITLE, 'EN', '--text', 'x', '--json'])
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toMatchObject({ section: 'EN', createdSection: true })
    expect(r.stderr).toContain('Similar existing: Comentario')
  })

  it('--dry-run reports the creation and writes nothing', () => {
    writeNote(['Note', 'Comentario'])
    const before = fs.readFileSync(path.join(noteDir, 'note.md'), 'utf-8')
    const r = run(['set', TITLE, 'EN', '--text', 'x', '--dry-run', '--json'])
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toMatchObject({ section: 'EN', createdSection: true, dryRun: true })
    expect(r.stderr).toContain('no section named "EN" — would create it. Similar existing: Comentario')
    expect(fs.readFileSync(path.join(noteDir, 'note.md'), 'utf-8')).toBe(before)
  })

  it('overwrites an exact (case-insensitive) match without any hint', () => {
    writeNote(['Note', 'Comentario'])
    const r = run(['set', TITLE, 'comentario', '--text', 'new'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).not.toContain('Similar existing')
    expect(sections()).toEqual([
      { name: 'Note', content: 'body Note\n' },
      { name: 'Comentario', content: 'new' },
    ])
  })

  it('still fails on duplicate exact names without #n', () => {
    writeNote(['Tasks', 'Tasks'])
    const r = run(['set', TITLE, 'Tasks', '--text', 'x'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Disambiguate with "Tasks#1" … "Tasks#2"')
  })
})

describe('section delete / rename', () => {
  it('delete refuses a substring-only name, suggests it and deletes nothing', () => {
    writeNote(['Note', 'Comentario'])
    const r = run(['section', 'delete', TITLE, 'EN', '--yes'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('No section "EN" in "Project Alpha". Sections: Note, Comentario.')
    expect(r.stderr).toContain('Did you mean: "Comentario"?')
    expect(sections().map(s => s.name)).toEqual(['Note', 'Comentario'])
    expect(fs.existsSync(path.join(noteDir, 'sec1.md'))).toBe(true)
  })

  it('rename refuses a substring-only name and renames nothing', () => {
    writeNote(['Note', 'Comentario'])
    const r = run(['section', 'rename', TITLE, 'EN', 'English'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Did you mean: "Comentario"?')
    expect(sections().map(s => s.name)).toEqual(['Note', 'Comentario'])
  })

  it('omits the suggestion when nothing is similar', () => {
    writeNote(['Note', 'Comentario'])
    const r = run(['section', 'delete', TITLE, 'Deploy', '--yes'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('No section "Deploy"')
    expect(r.stderr).not.toContain('Did you mean')
  })

  it('delete and rename act on an exact (case-insensitive) name', () => {
    writeNote(['Note', 'Comentario', 'Scratch'])
    expect(run(['section', 'rename', TITLE, 'comentario', 'Comment']).status).toBe(0)
    expect(run(['section', 'delete', TITLE, 'SCRATCH', '--yes']).status).toBe(0)
    expect(sections().map(s => s.name)).toEqual(['Note', 'Comment'])
  })
})

describe('read stays forgiving (read-only)', () => {
  it('reads a unique substring match and announces it on stderr', () => {
    writeNote(['Note', 'Comentario'])
    const r = run(['read', TITLE, 'EN'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('body Comentario\n\n')
    expect(r.stderr).toContain('Note: matched section "Comentario"')
  })

  it('falls back to word matching when no substring matches', () => {
    writeNote(['Note', 'Variables Entorno'])
    const r = run(['read', TITLE, 'Variables de entorno'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('body Variables Entorno\n\n')
  })

  it('fails on several loose candidates instead of guessing', () => {
    writeNote(['Tasks backend', 'Tasks frontend'])
    const r = run(['read', TITLE, 'Tasks'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Ambiguous section "Tasks"')
  })
})
