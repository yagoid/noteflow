// How a <title> argument picks a note:
//  - titles are NOT unique in NoteFlow (the app allows several 'Untitled'): with
//    several notes carrying the very same title the CLI used to take one in
//    silence (`path` / `add --title` went to an arbitrary one, `get --json` too).
//    Now that is the same "Multiple matches" error as a partial title, and the
//    folder name it prints (or the note id) resolves exactly one note;
//  - `new` / `rename` onto a title another note has still work, with a notice;
//  - a title that matches nothing suggests the similar ones ("Did you mean").
// Driven through the real CLI with NOTEFLOW_NOTES_DIR and the settings dir
// (APPDATA / XDG_CONFIG_HOME) pointed at throwaway dirs — no sync session
// exists, so nothing is pushed anywhere.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const CLI = require.resolve('../../cli/noteflow.js')
const cli = require(CLI)

type NoteRef = { id?: string; title?: string; dirname?: string; archived?: boolean }
const matchNotesByTitle = cli.matchNotesByTitle as (notes: NoteRef[], query: string) => NoteRef[]
const noteSuggestions = cli.noteSuggestions as (notes: NoteRef[], query: string) => string[]
const duplicateTitleNote = cli.duplicateTitleNote as (others: NoteRef[], title: string, dirname: string) => string

// Each test spawns the CLI several times (a new Node process each): give them room.
const SPAWN_TIMEOUT = { timeout: 60_000 }

let tmp: string

type Run = { status: number; stdout: string; stderr: string }

function run(args: string[]): Run {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      APPDATA: path.join(tmp, 'config'),
      XDG_CONFIG_HOME: path.join(tmp, 'config'),
      NOTEFLOW_NOTES_DIR: path.join(tmp, 'notes'),
      NOTEFLOW_NO_APP_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function ok(args: string[]): Run {
  const r = run(args)
  expect(r.status, `${args.join(' ')}\n${r.stderr}`).toBe(0)
  return r
}

type Listed = { id: string; title: string; dirname: string; archived?: boolean; sections: string[] }
const listed = (...extra: string[]) => JSON.parse(ok(['list', '--json', ...extra]).stdout) as Listed[]
const contentOf = (dirname: string) => ok(['read', dirname, 'Note']).stdout
const created = (title: string) => JSON.parse(ok(['new', title, '--json']).stdout) as { id: string; title: string; dirname: string }

function todayTitle(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-resolve-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('matchNotesByTitle (pure)', () => {
  const notes: NoteRef[] = [
    { id: 'aaaa1111', title: 'Project Alpha', dirname: 'project-alpha-aaaa1111' },
    { id: 'bbbb2222', title: 'Project Alpha', dirname: 'project-alpha-bbbb2222' },
    { id: 'cccc3333', title: 'project alpha', dirname: 'project-alpha-cccc3333', archived: true },
    { id: 'dddd4444', title: 'Project Beta', dirname: 'project-beta-dddd4444' },
    { id: 'eeee5555', title: 'Alpha', dirname: 'alpha-eeee5555' },
  ]
  const ids = (query: string) => matchNotesByTitle(notes, query).map(n => n.id)

  it('every note with that exact title (case-insensitive), archived ones included', () => {
    expect(ids('Project Alpha')).toEqual(['aaaa1111', 'bbbb2222', 'cccc3333'])
    expect(ids('PROJECT BETA')).toEqual(['dddd4444'])
  })

  it('an exact title wins over the partial matches', () => {
    expect(ids('alpha')).toEqual(['eeee5555'])
  })

  it('the folder name (with or without a trailing slash) or the id designates one note', () => {
    expect(ids('project-alpha-bbbb2222')).toEqual(['bbbb2222'])
    expect(ids('project-alpha-bbbb2222/')).toEqual(['bbbb2222'])
    expect(ids('project-alpha-bbbb2222\\')).toEqual(['bbbb2222'])
    expect(ids('PROJECT-ALPHA-CCCC3333')).toEqual(['cccc3333'])
    expect(ids('aaaa1111')).toEqual(['aaaa1111'])
  })

  it('otherwise the partial matches, or none', () => {
    expect(ids('Project')).toEqual(['aaaa1111', 'bbbb2222', 'cccc3333', 'dddd4444'])
    expect(ids('Beta')).toEqual(['dddd4444'])
    expect(ids('Gamma')).toEqual([])
    expect(ids('project-alpha-')).toEqual([]) // a folder name is never matched partially
  })

  it('a note titled like another note\'s folder name still wins by title', () => {
    const tricky = [...notes, { id: 'ffff6666', title: 'alpha-eeee5555', dirname: 'alpha-eeee5555-ffff6666' }]
    expect(matchNotesByTitle(tricky, 'alpha-eeee5555').map(n => n.id)).toEqual(['ffff6666'])
  })
})

describe('same-titled notes are ambiguous, never a silent pick', SPAWN_TIMEOUT, () => {
  let a: { id: string; dirname: string }
  let b: { id: string; dirname: string }

  beforeEach(() => {
    a = created('Proyecto Alpha')
    b = created('Proyecto Alpha')
    ok(['new', 'Otra'])
  })

  it('every command that takes a title fails listing them, with the folder-name hint', () => {
    const commands = [
      ['path', 'Proyecto Alpha'],
      ['read', 'Proyecto Alpha'],
      ['get', 'Proyecto Alpha'],
      ['get', 'Proyecto Alpha', '--json'],
      ['sections', 'Proyecto Alpha'],
      ['touch', 'Proyecto Alpha'],
      ['add', 'x', '--title', 'Proyecto Alpha'],
      ['add', 'x', '--title', 'Proyecto Alpha', '--create'],
      ['add', 'x', '--title', 'proyecto alpha', '--dry-run', '--json'],
      ['set', 'Proyecto Alpha', 'Note', '--text', 'x'],
      ['rename', 'Proyecto Alpha', 'Renamed'],
      ['favorite', 'Proyecto Alpha'],
      ['archive', 'Proyecto Alpha'],
      ['move', 'Proyecto Alpha', '--ungroup'],
      ['delete', 'Proyecto Alpha', '--yes'],
      ['section', 'add', 'Proyecto Alpha', 'Extra'],
    ]
    for (const args of commands) {
      const r = run(args)
      const text = r.stdout + r.stderr
      expect(r.status, args.join(' ')).toBe(1)
      expect(text, args.join(' ')).toContain('Multiple matches')
      expect(text).toContain(`(${a.dirname}/)`)
      expect(text).toContain(`(${b.dirname}/)`)
      expect(text).toContain('pass its folder name (in parentheses) instead of the title')
      if (args.includes('--json')) expect(r.stdout).toBe('') // stdout stays clean for the JSON reader
    }
    // Nothing was written, renamed, archived, deleted or created.
    const notes = listed('--archived')
    expect(notes.map(n => n.title).sort()).toEqual(['Otra', 'Proyecto Alpha', 'Proyecto Alpha'])
    expect(notes.every(n => !n.archived && n.sections.join() === 'Note')).toBe(true)
    expect(contentOf(a.dirname)).toBe('\n')
    expect(contentOf(b.dirname)).toBe('\n')
  })

  it('the folder name — bare, with a trailing slash — or the id picks exactly one', () => {
    ok(['add', 'into a', '--title', a.dirname])
    ok(['add', 'into b', '--title', `${b.dirname}/`])
    // (a random id may start with '--', which the arg parser would read as a flag)
    ok(['set', b.id.startsWith('-') ? b.dirname : b.id, 'Note', '--text', 'b by id'])
    expect(contentOf(a.dirname)).toBe('into a\n')
    expect(contentOf(b.dirname)).toBe('b by id\n')
    expect(ok(['path', a.dirname]).stdout.trim()).toBe(path.resolve(tmp, 'notes', a.dirname))
    expect((JSON.parse(ok(['get', `${a.dirname}/`, '--json']).stdout) as { id: string }).id).toBe(a.id)
    // …and unties them for good
    ok(['rename', b.dirname, 'Proyecto Beta'])
    expect(ok(['read', 'Proyecto Alpha', 'Note']).stdout).toBe('into a\n')
  })

  it('archived notes count: an archived twin keeps the title ambiguous and is flagged in the list', () => {
    ok(['archive', b.dirname])
    const r = run(['path', 'Proyecto Alpha'])
    expect(r.status).toBe(1)
    expect(r.stdout + r.stderr).toContain(`Proyecto Alpha [archived]  (${b.dirname}/)`)
    expect(r.stdout + r.stderr).toContain(`Proyecto Alpha  (${a.dirname}/)`)
    ok(['archive', b.dirname]) // …which is also how it gets unarchived
    expect(listed().filter(n => n.title === 'Proyecto Alpha')).toHaveLength(2)
  })

  it('partial matches list the same hint', () => {
    const r = run(['read', 'Proyecto'])
    expect(r.status).toBe(1)
    expect(r.stdout + r.stderr).toContain('pass its folder name (in parentheses) instead of the title')
  })
})

describe('creating a duplicate title', SPAWN_TIMEOUT, () => {
  it('new: allowed, with a one-line notice on stderr naming the new folder', () => {
    const first = run(['new', 'Ideas'])
    expect(first.status).toBe(0)
    expect(first.stderr).toBe('')
    const second = run(['new', 'ideas']) // case-insensitive, like the resolution
    expect(second.status).toBe(0)
    expect(second.stdout).toContain('Created "ideas"')
    const dirname = listed().find(n => n.title === 'ideas')!.dirname
    expect(second.stderr.trim()).toBe(
      `Note: another note is already titled "ideas" — the title alone is now ambiguous; use the folder name to tell them apart (this one: ${dirname})`,
    )
    const third = run(['new', 'Ideas', '--json'])
    expect(third.status).toBe(0)
    expect((JSON.parse(third.stdout) as { title: string }).title).toBe('Ideas') // stdout is still only the JSON
    expect(third.stderr).toContain('2 other notes are already titled "Ideas"')
    expect(listed()).toHaveLength(3)
  })

  it('rename: allowed, with the notice; renaming to a free title or re-casing its own says nothing', () => {
    ok(['new', 'Ideas'])
    const other = created('Borrador')
    const r = run(['rename', 'Borrador', 'IDEAS'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Renamed to "IDEAS"')
    expect(r.stderr).toContain(`another note is already titled "IDEAS"`)
    expect(r.stderr).toContain(`(this one: ${other.dirname})`)
    expect(run(['rename', other.dirname, 'Libre']).stderr).toBe('')
    expect(run(['rename', 'Libre', 'LIBRE']).stderr).toBe('')
  })

  it('add --create never duplicates: it only creates when nothing matched', () => {
    ok(['add', 'one', '--title', 'Fresh', '--create'])
    ok(['add', 'two', '--title', 'Fresh', '--create'])
    ok(['add', 'three', '--title', 'fresh', '--create']) // exact, case-insensitive
    ok(['add', 'four', '--title', 'Fre', '--create']) // a unique partial writes into it
    expect(listed().map(n => n.title)).toEqual(['Fresh'])
    expect(ok(['read', 'Fresh', 'Note']).stdout).toBe('one\ntwo\nthree\nfour\n')
  })

  it('duplicateTitleNote (pure): nothing for a free title', () => {
    expect(duplicateTitleNote([{ title: 'A' }, { title: 'B' }], 'C', 'c-1')).toBe('')
    expect(duplicateTitleNote([{ title: 'A' }, { title: 'a' }], 'A', 'a-1')).toContain('2 other notes are already titled "A"')
  })
})

describe('the daily note keeps working', SPAWN_TIMEOUT, () => {
  it('add without --title creates today\'s note once and appends afterwards', () => {
    ok(['add', 'first'])
    ok(['add', 'second'])
    const notes = listed()
    expect(notes.map(n => n.title)).toEqual([todayTitle()])
    expect(ok(['read', todayTitle(), 'Note']).stdout).toBe('first\nsecond\n')
  })

  it('two notes titled like today: it writes into one (the most recent) instead of failing', () => {
    const older = created(todayTitle())
    const newer = created(todayTitle())
    ok(['touch', newer.dirname]) // most recently updated
    const r = run(['add', 'entry'])
    expect(r.status, r.stderr).toBe(0)
    expect(contentOf(newer.dirname)).toBe('entry\n')
    expect(contentOf(older.dirname)).toBe('\n')
    expect(listed()).toHaveLength(2)
  })
})

describe('a title that matches nothing suggests the similar ones', SPAWN_TIMEOUT, () => {
  beforeEach(() => {
    ok(['new', 'Recetas'])
    ok(['new', 'Proyecto Alpha'])
    ok(['new', 'Reunión de equipo'])
  })

  it('noteSuggestions (pure): typos, word typos and accent-insensitive words — at most 3', () => {
    const notes = ['Recetas', 'Proyecto Alpha 2026', 'Reunión de equipo', 'Recetas', 'recetas'].map(title => ({ title }))
    expect(noteSuggestions(notes, 'resetas')).toEqual(['Recetas'])
    expect(noteSuggestions(notes, 'Proyecta Alpha')).toEqual(['Proyecto Alpha 2026']) // each word a typo of one of the title's
    expect(noteSuggestions([{ title: 'Proyecto Alpha' }], 'Proyecto Alfa')).toEqual(['Proyecto Alpha']) // two typos overall
    expect(noteSuggestions(notes, 'equipo reunion')).toEqual(['Reunión de equipo'])
    expect(noteSuggestions(notes, 'zzz')).toEqual([])
    expect(noteSuggestions(notes, 'xy')).toEqual([]) // too short to guess by spelling
    const many = ['Nota 1', 'Nota 2', 'Nota 3', 'Nota 4', 'Nota 5'].map(title => ({ title }))
    expect(noteSuggestions(many, 'Nots 9')).toHaveLength(3)
  })

  it('every "not found" names the similar title', () => {
    const commands = [
      ['read', 'resetas'],
      ['path', 'resetas'],
      ['get', 'resetas'],
      ['sections', 'resetas'],
      ['touch', 'resetas'],
      ['set', 'resetas', 'Note', '--text', 'x'],
      ['rename', 'resetas', 'Otra'],
      ['favorite', 'resetas'],
      ['archive', 'resetas'],
      ['move', 'resetas', '--ungroup'],
      ['delete', 'resetas', '--yes'],
      ['section', 'add', 'resetas', 'Extra'],
    ]
    for (const args of commands) {
      const r = run(args)
      expect(r.status, args.join(' ')).toBe(1)
      expect(r.stderr, args.join(' ')).toContain('Error: No note found: "resetas". Did you mean "Recetas"?')
      expect(r.stdout, args.join(' ')).toBe('')
    }
    expect(listed().map(n => n.title).sort()).toEqual(['Proyecto Alpha', 'Recetas', 'Reunión de equipo'])
  })

  it('add --title: the hint sits before the --create advice', () => {
    const r = run(['add', 'x', '--title', 'Proyecto Alfa'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(
      `Error: Note "Proyecto Alfa" not found. Did you mean "Proyecto Alpha"? Pass --create to create it, or use 'noteflow new'.`,
    )
  })

  it('nothing similar: the plain error, no "Did you mean"', () => {
    const r = run(['read', 'zzz'])
    expect(r.status).toBe(1)
    expect(r.stderr.trim()).toBe('Error: No note found: "zzz"')
    const add = run(['add', 'x', '--title', 'zzz'])
    expect(add.stderr).toContain(`Note "zzz" not found. Pass --create to create it, or use 'noteflow new'.`)
  })

  it('--json: the error also goes to stdout as { error, code, note, suggestions }', () => {
    const read = run(['read', 'reunion', '--json'])
    expect(read.status).toBe(1)
    expect(JSON.parse(read.stdout)).toEqual({
      error: 'No note found: "reunion". Did you mean "Reunión de equipo"?',
      code: 'note_not_found',
      note: 'reunion',
      suggestions: ['Reunión de equipo'],
    })
    const add = run(['add', 'x', '--title', 'zzz', '--json'])
    expect(add.status).toBe(1)
    expect(JSON.parse(add.stdout)).toMatchObject({ code: 'note_not_found', note: 'zzz', suggestions: [] })
  })
})
