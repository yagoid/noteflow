// The CLI reads note.md with a hand-rolled line parser and writes it back with
// q() (a YAML double-quoted scalar). The reader used to drop only the outer
// quotes, so every read + write doubled the backslashes of a title or section
// name holding `"` or `\`:
//   title: "a/b: \"c\""  →  title: "a/b: \\\"c\\\""  →  …
// and `read 'a/b: "c"'` answered "No note found". unquote() is now the exact
// inverse of q() and reads what js-yaml (the desktop app) writes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { parseNoteFolder, serializeNoteFolder, NOTE_MD } from '../../src/lib/noteUtils'
import type { Note } from '../../src/types'

const require = createRequire(import.meta.url)
const CLI = require.resolve('../../cli/noteflow.js')
const cli = require(CLI)

type CliSection = { id: string; name: string; file?: string; isRawMode?: boolean; aiHidden?: boolean; created?: string }
type CliNote = { id: string; title: string; tags: string[]; created: string; updated: string; sections: CliSection[] }

const yamlQuote = cli.yamlQuote as (s: string) => string
const unquote = cli.unquote as (s: string) => string
const splitFrontmatter = cli.splitFrontmatter as (raw: string) => { frontmatter: string; body: string }
const parseNoteYaml = cli.parseNoteYaml as (yamlStr: string) => CliNote
const serializeNoteMd = cli.serializeNoteMd as (note: CliNote, opts?: { preserveUpdated?: boolean }) => string
const anchorTitle = cli.anchorTitle as (noteMd: string) => string

const ch = (code: number) => String.fromCharCode(code)
const BS = ch(92) // one backslash
const DQ = '"'
const NBSP = ch(0xa0)
const ESC = ch(0x1b)
const LINE_SEP = ch(0x2028)

// Titles / section names / tags that need care in YAML.
const TRICKY = [
  `a/b: ${DQ}c${DQ}`,
  `C:${BS}temp${BS}nota`,
  `both ${DQ}quoted${DQ} and back${BS}slash`,
  `ends with a backslash${BS}`,
  `${BS}${BS}server${BS}share`,
  `it's`,
  `'single' ${DQ}double${DQ}`,
  `Plan ${DQ}B${DQ}`,
  `${DQ}A${DQ} y ${DQ}B${DQ}`,
  '# not a comment',
  '- not a list',
  'trailing space ',
  'caf' + ch(0xe9) + ' ' + ch(0xf1) + ' ' + ch(0xd83d) + ch(0xde00),
  `no-break${NBSP}space`,
  `escape${ESC}char`,
  `line${LINE_SEP}separator`,
  'tab\there',
  'two\nlines',
  '123',
  'true',
]

const NOW = '2026-01-01T00:00:00.000Z'

describe('unquote is the exact inverse of the CLI writer', () => {
  it('q() → unquote() gives the string back, and js-yaml reads the same', () => {
    for (const s of TRICKY) {
      const written = yamlQuote(s)
      expect(written, s).not.toMatch(/[\r\n]/) // always one line
      expect(unquote(written), s).toBe(s)
      expect((yaml.load(`t: ${written}`) as { t: unknown }).t, s).toBe(s)
    }
  })

  it('reads the one-line scalars js-yaml writes (the app dump options)', () => {
    for (const s of TRICKY) {
      const dumped = yaml.dump({ t: s }, { lineWidth: -1, quotingType: '"' }).replace(/\n$/, '')
      if (dumped.includes('\n')) continue // block scalar (multi-line value): not a one-line scalar
      expect(unquote(dumped.slice('t: '.length)), dumped).toBe(s)
    }
  })

  it('undoes every YAML double-quoted escape exactly like js-yaml', () => {
    const raw = [
      `${DQ}${BS}${BS} ${BS}${DQ} ${BS}/ ${BS}0 ${BS}a ${BS}b ${BS}t ${BS}n ${BS}v ${BS}f ${BS}r ${BS}e${DQ}`,
      `${DQ}${BS}N ${BS}_ ${BS}L ${BS}P ${BS}  end${DQ}`,
      `${DQ}${BS}x41 ${BS}u00e9 ${BS}U0001F600 ${BS}ud83d${BS}ude00${DQ}`,
    ]
    for (const scalar of raw) {
      expect(unquote(scalar), scalar).toBe((yaml.load(`t: ${scalar}`) as { t: string }).t)
    }
  })

  it("single-quoted: '' is one quote; plain scalars come back as they are", () => {
    expect(unquote(`'it''s'`)).toBe(`it's`)
    expect(unquote(`'''q'''`)).toBe(`'q'`)
    expect(unquote(`'a ${BS}n ${DQ}b${DQ}'`)).toBe(`a ${BS}n ${DQ}b${DQ}`) // no escapes in single quotes
    expect(unquote(`Plan ${DQ}B${DQ}`)).toBe(`Plan ${DQ}B${DQ}`)
    expect(unquote(`C:${BS}temp`)).toBe(`C:${BS}temp`)
    expect(unquote(`  spaced  `)).toBe('spaced')
  })

  it('a trailing comment after the closing quote is ignored; malformed input never throws', () => {
    expect(unquote(`${DQ}a ${BS}${DQ}b${BS}${DQ}${DQ}  # note`)).toBe(`a ${DQ}b${DQ}`)
    expect(unquote(`'x'  # note`)).toBe('x')
    expect(unquote(`${DQ}unknown ${BS}q escape${DQ}`)).toBe(`unknown ${BS}q escape`) // kept verbatim
    expect(unquote(`${DQ}bad ${BS}xZZ hex${DQ}`)).toBe(`bad ${BS}xZZ hex`)
    expect(unquote(`${DQ}never closed`)).toBe(`${DQ}never closed`)
    expect(unquote(`${DQ}a${DQ}b${DQ}`)).toBe(`a${DQ}b`) // old best-effort rule: outer quotes off
    expect(unquote(DQ)).toBe(DQ)
    expect(unquote('')).toBe('')
  })
})

describe('note.md read + write is idempotent (title, section names, tags)', () => {
  const noteWith = (text: string): CliNote => ({
    id: 'n1', title: text, tags: [text], created: NOW, updated: NOW,
    sections: [{ id: 'a', name: text }, { id: 'b', name: `${text} 2`, isRawMode: true }],
  })

  it('serialize → parse → serialize, five times, never changes a byte', () => {
    for (const s of TRICKY) {
      const first = serializeNoteMd(noteWith(s), { preserveUpdated: true })
      let md = first
      for (let i = 0; i < 5; i++) {
        const parsed = parseNoteYaml(splitFrontmatter(md).frontmatter)
        expect(parsed.title, s).toBe(s)
        expect(parsed.sections.map(sec => sec.name), s).toEqual([s, `${s} 2`])
        md = serializeNoteMd(parsed, { preserveUpdated: true })
      }
      expect(md, s).toBe(first)
      expect(anchorTitle(md), s).toBe(s)
    }
  })

  it('a tag holding a comma or a quote survives (flow list split outside quotes)', () => {
    const tags = ['plain', 'a,b', `q${DQ}uote`, `back${BS}slash`]
    const md = serializeNoteMd({ ...noteWith('T'), tags }, { preserveUpdated: true })
    expect(parseNoteYaml(splitFrontmatter(md).frontmatter).tags).toEqual(tags)
  })

  it('an app-written note.md (js-yaml) is read with the same title, names and tags', () => {
    for (const s of TRICKY.filter(t => !t.includes('\n'))) {
      const note: Note = {
        id: 'n2', title: s, tags: ['alpha', 'beta'], created: NOW, updated: NOW,
        archived: false, favorited: false, raw: '', filePath: '/notes/n2',
        sections: [{ id: 'a', name: s, content: '' }, { id: 'b', name: 'Later', content: '' }],
      }
      const appMd = serializeNoteFolder(note).files[NOTE_MD]
      const cliNote = parseNoteYaml(splitFrontmatter(appMd).frontmatter)
      expect(cliNote.title, s).toBe(s)
      expect(cliNote.sections.map(sec => sec.name), s).toEqual([s, 'Later'])
      // js-yaml writes tags as a block list ('tags:' + '  - item'): they used to be dropped.
      expect(cliNote.tags, s).toEqual(['alpha', 'beta'])
      // …and what the CLI writes back is read by the app with nothing changed.
      const back = parseNoteFolder(serializeNoteMd(cliNote, { preserveUpdated: true }), { 'a.md': '', 'b.md': '' }, '/notes/n2')
      expect(back.title, s).toBe(s)
      expect(back.sections.map(sec => sec.name), s).toEqual([s, 'Later'])
      expect(back.tags, s).toEqual(['alpha', 'beta'])
    }
  })
})

// ── Through the real CLI ──────────────────────────────────────────────────────
// NOTEFLOW_NOTES_DIR and the settings dir (APPDATA / XDG_CONFIG_HOME) point at
// throwaway dirs — no sync session exists, so nothing is pushed anywhere.

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

type ListedNote = { title: string; dirname: string; sections: string[] }
const listed = () => JSON.parse(ok(['list', '--json']).stdout) as ListedNote[]
/** The note.md on disk, loaded with js-yaml — what the desktop app sees. */
const onDisk = (dirname: string) =>
  yaml.load(splitFrontmatter(fs.readFileSync(path.join(tmp, 'notes', dirname, 'note.md'), 'utf-8')).frontmatter) as
    { title: string; sections: { name: string }[] }

describe('CLI round-trip of titles and section names with quotes and backslashes', SPAWN_TIMEOUT, () => {
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-yaml-')) })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  const titles = [
    `a/b: ${DQ}c${DQ}`,
    `C:${BS}temp${BS}nota`,
    `both ${DQ}q${DQ} and ${BS}b`,
    `it's 'quoted'`,
  ]

  it('a title stays the same after creating the note and writing to it several times', () => {
    for (const title of titles) {
      ok(['new', title])
      for (let i = 0; i < 4; i++) ok(['add', `line ${i}`, '--title', title])
      ok(['touch', title])
    }
    const notes = listed()
    expect(notes.map(n => n.title).sort()).toEqual([...titles].sort())
    for (const n of notes) expect(onDisk(n.dirname).title).toBe(n.title)
    // read / get / add --title find each note by its real title
    for (const title of titles) {
      expect(ok(['read', title]).stdout).toContain(`# ${title}\n`)
      expect((JSON.parse(ok(['get', title, '--json']).stdout) as { title: string }).title).toBe(title)
      expect(ok(['read', title, 'Note']).stdout).toBe('line 0\nline 1\nline 2\nline 3\n')
    }
  })

  it('a section name stays the same after several writes to the note', () => {
    ok(['new', 'Host'])
    for (const name of titles) ok(['section', 'add', 'Host', name])
    for (let i = 0; i < 4; i++) ok(['add', `line ${i}`, '--title', 'Host'])
    ok(['section', 'rename', 'Host', titles[0], `${titles[0]} ${BS} renamed`])
    const expected = ['Note', `${titles[0]} ${BS} renamed`, ...titles.slice(1)]
    const [note] = listed()
    expect(note.sections).toEqual(expected)
    expect(onDisk(note.dirname).sections.map(s => s.name)).toEqual(expected)
    // …and each one is addressable by its real name
    for (const name of expected.slice(1)) {
      ok(['set', 'Host', name, '--text', 'x'])
      expect(ok(['read', 'Host', name]).stdout).toBe('x\n')
    }
  })
})
