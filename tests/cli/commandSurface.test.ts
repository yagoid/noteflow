// Small fixes to what the CLI prints:
//  - an unknown command used to dump the whole help on stdout and only then say
//    "Unknown command" → now just the error on stderr, with the closest command;
//  - `sections` / `section list` take --json;
//  - "(1 lines)" → "1 line";
//  - the "NoteFlow desktop appears to be running" warning only makes sense when
//    the CLI works on the notes dir the app uses (the default one).
// Plus the folder-name slug, which must be the same rule in the three mirrors
// (cli/noteflow.js, electron/noteFormat.ts, src/lib/noteUtils.ts).
// Driven through the real CLI with NOTEFLOW_NOTES_DIR and the settings dir
// (APPDATA / XDG_CONFIG_HOME) pointed at throwaway dirs — no sync session
// exists, so nothing is pushed anywhere.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { noteDirname as rendererNoteDirname } from '../../src/lib/noteUtils'
import { noteDirname as mainNoteDirname } from '../../electron/noteFormat'

const require = createRequire(import.meta.url)
const CLI = require.resolve('../../cli/noteflow.js')
const cli = require(CLI)

const unknownCommandError = cli.unknownCommandError as (cmd: string) => string | null
const cliNoteDirname = cli.noteDirname as (id: string, title: string) => string
const linesLabel = cli.linesLabel as (n: number) => string
const desktopAppSharesNotesDir = cli.desktopAppSharesNotesDir as (notesDir: string, defaultDir: string, platform: string) => boolean
const COMMAND_FLAGS = cli.COMMAND_FLAGS as Record<string, string[]>

// Each test spawns the CLI several times (a new Node process each): give them room.
const SPAWN_TIMEOUT = { timeout: 60_000 }

let tmp: string

type Run = { status: number; stdout: string; stderr: string }

function run(args: string[], env: Record<string, string | undefined> = {}): Run {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      APPDATA: path.join(tmp, 'config'),
      XDG_CONFIG_HOME: path.join(tmp, 'config'),
      NOTEFLOW_NOTES_DIR: path.join(tmp, 'notes'),
      NOTEFLOW_NO_APP_CHECK: '1',
      ...env,
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

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-surface-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('unknown command', SPAWN_TIMEOUT, () => {
  it('only the error on stderr, with the closest command and the help pointer — exit 1', () => {
    const r = run(['lsit'])
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe("  Error: Unknown command: lsit. Did you mean 'list'?\n  Run 'noteflow help' for the list of commands\n")
  })

  it('nothing close: no suggestion, same pointer', () => {
    const r = run(['frobnicate'])
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe("  Error: Unknown command: frobnicate\n  Run 'noteflow help' for the list of commands\n")
  })

  it('it is reported before its flags are judged', () => {
    const r = run(['lsit', '--nope', '--json'])
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain("Unknown command: lsit. Did you mean 'list'?")
    expect(r.stderr).not.toContain('Unknown flag')
  })

  it('no arguments still prints the help (exit 0)', () => {
    const r = run([])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('NoteFlow CLI — quick notes from your terminal')
    expect(r.stderr).toBe('')
  })

  it('unknownCommandError (pure): null for every command and alias, the closest one otherwise', () => {
    const known = [...new Set(Object.keys(COMMAND_FLAGS).map(k => k.split(' ')[0])), 'rm', 'pin', 'update', 'help', 'version']
    for (const cmd of known) expect(unknownCommandError(cmd), cmd).toBeNull()
    expect(unknownCommandError('sectoin')).toBe("Unknown command: sectoin. Did you mean 'section'?")
    expect(unknownCommandError('gruop')).toBe("Unknown command: gruop. Did you mean 'group'?")
    expect(unknownCommandError('LIST')).toBe("Unknown command: LIST. Did you mean 'list'?")
    expect(unknownCommandError('stauts')).toBe("Unknown command: stauts. Did you mean 'status'?")
    expect(unknownCommandError('ls')).toBe('Unknown command: ls') // too short to guess by spelling
    expect(unknownCommandError('constructor')).toBe('Unknown command: constructor')
  })
})

describe('sections --json', SPAWN_TIMEOUT, () => {
  type SectionJson = { id: string; name: string; lines: number; mode: string; isRawMode: boolean; aiHidden: boolean }

  beforeEach(() => {
    ok(['new', 'Recetas', '--section', 'Tortilla'])
    ok(['set', 'Recetas', 'Tortilla', '--text', 'huevos'])
    ok(['section', 'add', 'Recetas', 'Log', '--raw'])
    ok(['set', 'Recetas', 'Log', '--text', 'a\nb\nc'])
    ok(['section', 'add', 'Recetas', 'Vacia'])
  })

  it('an array with one object per section: id, name, lines, mode, isRawMode, aiHidden', () => {
    const r = ok(['sections', 'Recetas', '--json'])
    const sections = JSON.parse(r.stdout) as SectionJson[]
    expect(sections.every(s => typeof s.id === 'string' && s.id.length > 0)).toBe(true)
    expect(sections.map(s => ({ name: s.name, lines: s.lines, mode: s.mode, isRawMode: s.isRawMode, aiHidden: s.aiHidden }))).toEqual([
      { name: 'Tortilla', lines: 1, mode: 'markdown', isRawMode: false, aiHidden: false },
      { name: 'Log', lines: 3, mode: 'text', isRawMode: true, aiHidden: false },
      { name: 'Vacia', lines: 0, mode: 'markdown', isRawMode: false, aiHidden: false },
    ])
    // Same ids as the other JSON outputs of the note.
    const read = JSON.parse(ok(['read', 'Recetas', '--json']).stdout) as { sections: { id: string }[] }
    expect(sections.map(s => s.id)).toEqual(read.sections.map(s => s.id))
    expect(r.stdout.trim().split('\n')).toHaveLength(1) // stdout is only the JSON
  })

  it("'section list' is the same command", () => {
    expect(ok(['section', 'list', 'Recetas', '--json']).stdout).toBe(ok(['sections', 'Recetas', '--json']).stdout)
    expect(ok(['section', 'list', 'Recetas']).stdout).toBe(ok(['sections', 'Recetas']).stdout)
  })

  it('a section hidden from the AI says so', () => {
    const [dirname] = fs.readdirSync(path.join(tmp, 'notes')).filter(d => d.startsWith('recetas-'))
    const noteMd = path.join(tmp, 'notes', dirname, 'note.md')
    const text = fs.readFileSync(noteMd, 'utf-8')
    fs.writeFileSync(noteMd, text.replace(/(\n {4}name: "Log"\r?\n {4}file: "[^"]+"\r?\n)/, '$1    aiHidden: true\n'), 'utf-8')
    const sections = JSON.parse(ok(['sections', 'Recetas', '--json']).stdout) as SectionJson[]
    expect(sections.map(s => s.aiHidden)).toEqual([false, true, false])
    expect(ok(['sections', 'Recetas']).stdout).toContain('Log  (3 lines, text, hidden from AI)')
  })

  it('the human listing counts lines in singular and plural', () => {
    const out = ok(['sections', 'Recetas']).stdout
    expect(out).toContain('Tortilla  (1 line, markdown)')
    expect(out).toContain('Log  (3 lines, text)')
    expect(out).toContain('Vacia  (0 lines, markdown)')
  })

  it('an unknown note fails like everywhere else, with the JSON error on stdout', () => {
    const r = run(['sections', 'resetas', '--json'])
    expect(r.status).toBe(1)
    expect(JSON.parse(r.stdout)).toMatchObject({ code: 'note_not_found', suggestions: ['Recetas'] })
  })

  it('the general help and the section help say they are the same command', () => {
    const general = ok(['help']).stdout
    expect(general).toContain('sections <title>                List sections of a note (alias: section list)')
    expect(general).toMatch(/--json[\s\S]*sections \(section list\)/)
    const topic = ok(['help', 'section']).stdout
    expect(topic).toContain('noteflow sections       <title> [--json]')
    expect(topic).toContain("noteflow section list   <title> [--json]   (alias: the same command as 'sections')")
    expect(ok(['help', 'sections']).stdout).toBe(topic)
  })
})

describe('line counts in messages', SPAWN_TIMEOUT, () => {
  it("set says '1 line' / 'N lines' / 'empty'", () => {
    ok(['new', 'Nota'])
    expect(ok(['set', 'Nota', 'Note', '--text', 'una']).stdout).toContain('Set "Nota" → "Note"  (1 line)')
    expect(ok(['set', 'Nota', 'Note', '--text', 'una\ndos']).stdout).toContain('Set "Nota" → "Note"  (2 lines)')
    expect(ok(['set', 'Nota', 'Note', '--text', '']).stdout).toContain('Set "Nota" → "Note"  (empty)')
  })

  it('linesLabel (pure)', () => {
    expect([0, 1, 2, 11].map(linesLabel)).toEqual(['0 lines', '1 line', '2 lines', '11 lines'])
  })
})

describe('folder-name slug', () => {
  const ch = (code: number) => String.fromCharCode(code)
  const titles = [
    'Reuni' + ch(0xf3) + 'n 12 nov',
    'Cumplea' + ch(0xf1) + 'os',
    ch(0xd1) + 'and' + ch(0xfa) + ' & caf' + ch(0xe9) + '!!',
    'Cr' + ch(0xe8) + 'me br' + ch(0xfb) + 'l' + ch(0xe9) + 'e ' + ch(0xc0) + ' la carte',
    'Stra' + ch(0xdf) + 'e ' + ch(0xfc) + 'ber ' + ch(0xd8) + 'l', // ß and Ø have no decomposition: dropped, as before
    'e' + ch(0x301) + 'cole already decomposed',
    'My Great Note!',
    'a/b: "c"',
    '   ',
    '',
    'A very long title that goes well beyond forty characters total',
    ch(0xe1).repeat(60),
  ]

  it('accents are transliterated instead of dropped', () => {
    expect(cliNoteDirname('id', titles[0])).toBe('reunion-12-nov-id')
    expect(cliNoteDirname('id', titles[1])).toBe('cumpleanos-id')
    expect(cliNoteDirname('id', titles[2])).toBe('nandu-cafe-id')
    expect(cliNoteDirname('id', titles[3])).toBe('creme-brulee-a-la-carte-id')
    expect(cliNoteDirname('id', titles[4])).toBe('strae-uber-l-id')
    expect(cliNoteDirname('id', titles[5])).toBe('ecole-already-decomposed-id')
    expect(cliNoteDirname('id', titles[11])).toBe('a'.repeat(40) + '-id') // cut AFTER transliterating
  })

  it('the three mirrors (CLI, main process, renderer) give the same name', () => {
    for (const t of titles) {
      expect(cliNoteDirname('id123456', t), t).toBe(rendererNoteDirname('id123456', t))
      expect(mainNoteDirname('id123456', t), t).toBe(rendererNoteDirname('id123456', t))
    }
  })

  it('new uses it', () => {
    const r = ok(['new', titles[0], '--json'])
    expect((JSON.parse(r.stdout) as { dirname: string }).dirname).toMatch(/^reunion-12-nov-/)
  })
})

describe('desktop app warning', () => {
  it('desktopAppSharesNotesDir (pure): only the default notes dir is shared with the app', () => {
    const home = path.join(os.homedir(), 'noteflow-notes')
    expect(desktopAppSharesNotesDir(home, home, process.platform)).toBe(true)
    expect(desktopAppSharesNotesDir(home + path.sep, home, process.platform)).toBe(true)
    expect(desktopAppSharesNotesDir(path.join(os.tmpdir(), 'elsewhere'), home, process.platform)).toBe(false)
    // Same comparison as the notes dir origin (sameNotesDir): case-insensitive on Windows / macOS only.
    expect(desktopAppSharesNotesDir('C:\\Users\\Me\\noteflow-notes', 'c:\\users\\me\\noteflow-notes', 'win32')).toBe(true)
    expect(desktopAppSharesNotesDir('C:\\Users\\Me\\noteflow-notes', 'c:\\users\\me\\noteflow-notes', 'linux')).toBe(false)
  })

  it('a notes dir override never warns, even with the app check on', () => {
    // NOTEFLOW_NO_APP_CHECK unset: the process list is not even consulted for an override dir.
    const r = run(['group', 'create', 'Work'], { NOTEFLOW_NO_APP_CHECK: undefined })
    expect(r.status).toBe(0)
    expect(r.stderr).toBe('')
  })
})
