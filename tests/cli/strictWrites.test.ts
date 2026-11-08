// Writes that used to "succeed" silently with the wrong result, now hard errors
// (exit 1, nothing written) or fixed:
//  - `add --title` with a partial title matching several notes wrote into the
//    first one → now resolves like resolveNote (exact wins, unique partial ok,
//    several = error listing them), also with --create;
//  - `add --group/--folder` that doesn't exist printed an error, wrote anyway
//    and exited 0 → exit 1 before writing (also under --dry-run);
//  - `add --group` on a note in a folder of another group kept that stale folder;
//  - a known flag the command doesn't read was ignored (`delete --yes --dry-run`
//    deleted for real) → per-command flag table;
//  - `--file`/`--stdin` in UTF-16 (PowerShell 5.1's `>`) were read as UTF-8 and
//    saved garbage → decoded with a BOM, refused without one.
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

let tmp: string

type Run = { status: number; stdout: string; stderr: string }

function run(args: string[], input?: string | Buffer): Run {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      APPDATA: path.join(tmp, 'config'),
      XDG_CONFIG_HOME: path.join(tmp, 'config'),
      NOTEFLOW_NOTES_DIR: path.join(tmp, 'notes'),
      NOTEFLOW_NO_APP_CHECK: '1',
    },
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  })
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function ok(args: string[], input?: string | Buffer): Run {
  const r = run(args, input)
  expect(r.status, `${args.join(' ')}\n${r.stderr}`).toBe(0)
  return r
}

type NoteJson = { title: string; group?: string; folder?: string; sections: { name: string; content: string }[] }
const note = (title: string) => JSON.parse(ok(['get', title, '--json']).stdout) as NoteJson
const groupId = (name: string) => (JSON.parse(ok(['groups', '--json']).stdout) as { id: string; name: string }[]).find(g => g.name === name)!.id
const folderId = (name: string) => (JSON.parse(ok(['folders', '--json']).stdout) as { id: string; name: string }[]).find(f => f.name === name)!.id
const titles = () => (JSON.parse(ok(['list', '--json']).stdout) as { title: string }[]).map(n => n.title).sort()

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-strict-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('add --title resolves like the other note commands', () => {
  beforeEach(() => {
    ok(['new', 'Project Alpha'])
    ok(['new', 'Project Beta'])
    ok(['new', 'Alpha'])
  })

  it('several partial matches: exit 1 listing them, nothing written', () => {
    const r = run(['add', 'hello', '--title', 'Project'])
    expect(r.status).toBe(1)
    expect(r.stdout + r.stderr).toContain('Multiple matches')
    expect(r.stdout + r.stderr).toContain('Project Alpha')
    expect(r.stdout + r.stderr).toContain('Project Beta')
    expect(note('Project Alpha').sections[0].content).toBe('')
    expect(note('Project Beta').sections[0].content).toBe('')
  })

  it('several partial matches stay an error with --create and --dry-run', () => {
    expect(run(['add', 'hello', '--title', 'Project', '--create']).status).toBe(1)
    expect(run(['add', 'hello', '--title', 'Project', '--dry-run', '--json']).status).toBe(1)
    expect(titles()).toEqual(['Alpha', 'Project Alpha', 'Project Beta'])
  })

  it('an exact title wins over partial ones; a unique partial one is fine', () => {
    ok(['add', 'exact', '--title', 'alpha'])
    expect(note('Alpha').sections[0].content).toBe('exact')
    ok(['add', 'partial', '--title', 'Beta'])
    expect(note('Project Beta').sections[0].content).toBe('partial')
  })

  it('no match still needs --create, which creates the note', () => {
    expect(run(['add', 'x', '--title', 'Gamma']).status).toBe(1)
    ok(['add', 'x', '--title', 'Gamma', '--create'])
    expect(note('Gamma').sections[0].content).toBe('x')
  })
})

describe('add --group / --folder', () => {
  beforeEach(() => {
    ok(['group', 'create', 'Work'])
    ok(['group', 'create', 'Home'])
    ok(['folder', 'create', 'Planning', '--group', 'Work'])
    ok(['new', 'Sprint', '--group', 'Work', '--folder', 'Planning'])
  })

  it('an unknown group fails before writing — existing note, new note and --dry-run', () => {
    for (const args of [
      ['add', 'x', '--title', 'Sprint', '--group', 'Nope'],
      ['add', 'x', '--title', 'Fresh', '--create', '--group', 'Nope'],
      ['add', 'x', '--group', 'Nope'], // today's daily note
      ['add', 'x', '--title', 'Sprint', '--group', 'Nope', '--dry-run'],
    ]) {
      const r = run(args)
      expect(r.status, args.join(' ')).toBe(1)
      expect(r.stderr).toContain('Group not found: "Nope"')
    }
    expect(note('Sprint').sections[0].content).toBe('')
    expect(titles()).toEqual(['Sprint'])
  })

  it('an unknown folder, or --folder without --group, fails before writing', () => {
    const r = run(['add', 'x', '--title', 'Sprint', '--group', 'Work', '--folder', 'Nope'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Folder "Nope" not found in group "Work"')
    const r2 = run(['add', 'x', '--title', 'Sprint', '--folder', 'Planning', '--dry-run'])
    expect(r2.status).toBe(1)
    expect(r2.stderr).toContain('--folder requires --group')
    expect(note('Sprint').sections[0].content).toBe('')
  })

  it('moving to another group without --folder clears the old folder (like move)', () => {
    ok(['add', 'x', '--title', 'Sprint', '--group', 'Home'])
    const n = note('Sprint')
    expect(n.group).toBe(groupId('Home'))
    expect(n.folder).toBeUndefined()
  })

  it('the same group without --folder keeps the folder; --folder sets it', () => {
    ok(['add', 'x', '--title', 'Sprint', '--group', 'Work'])
    expect(note('Sprint').folder).toBe(folderId('Planning'))
    ok(['folder', 'create', 'Ideas', '--group', 'Home'])
    ok(['add', 'y', '--title', 'Sprint', '--group', 'Home', '--folder', 'Ideas'])
    expect(note('Sprint')).toMatchObject({ group: groupId('Home'), folder: folderId('Ideas') })
  })
})

describe('per-command flag validation', () => {
  const flagError = cli.unsupportedFlagError as (cmd: string, sub: string | undefined, seen: string[]) => string | null

  it('delete --yes --dry-run fails and deletes nothing', () => {
    ok(['new', 'Scratch'])
    const r = run(['delete', 'Scratch', '--yes', '--dry-run'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain("Flag --dry-run is not supported by 'delete'")
    expect(titles()).toEqual(['Scratch'])
  })

  it('names the command as typed (aliases, subcommands)', () => {
    expect(flagError('rm', 'X', ['--dry-run'])).toContain("by 'rm'")
    expect(flagError('section', 'rm', ['--dry-run'])).toContain("by 'section rm'")
    expect(flagError('cloud', 'push', ['--force'])).toContain("Flag --force is not supported by 'cloud push'")
    expect(flagError('new', 'X', ['--tag'])).toContain("Flag --tag is not supported by 'new'")
    expect(flagError('push', undefined, ['--force'])).toContain("by 'push'")
  })

  it('accepts every documented combination', () => {
    const okCombos: [string, string | undefined, string[]][] = [
      ['add', undefined, ['--text', '--title', '--section', '--create', '--tag', '--group', '--folder', '--raw', '--dry-run', '--json']],
      ['add', undefined, ['--file', '--markdown']], ['add', undefined, ['--stdin', '--rich']],
      ['set', 'T', ['--stdin', '--section', '--create', '--raw', '--dry-run', '--json']],
      ['new', 'T', ['--section', '--group', '--folder', '--raw', '--json']],
      ['list', undefined, ['--tag', '--group', '--folder', '--archived', '--json']],
      ['get', 'T', ['--section', '--json']], ['read', 'T', ['--section', '--json']], ['path', 'T', ['--section', '--json']],
      ['delete', 'T', ['--yes', '--json']], ['rm', 'T', ['--yes']],
      ['section', 'add', ['--raw']], ['section', 'delete', ['--yes']], ['section', 'rm', ['--yes']],
      ['move', 'T', ['--group', '--folder']], ['move', 'T', ['--ungroup']],
      ['groups', undefined, ['--json']], ['group', 'create', ['--color', '--json']], ['group', 'delete', ['--yes']],
      ['folders', undefined, ['--group', '--json']], ['folder', 'list', ['--group']], ['folder', 'create', ['--group', '--json']],
      ['folder', 'rename', ['--group']], ['folder', 'delete', ['--group', '--yes']],
      ['login', undefined, ['--no-pull']], ['login', 'r', ['--no-wait', '--no-pull', '--json']], ['login', undefined, ['--finish', '--no-pull']],
      ['cloud', 'login', ['--send-code']], ['cloud', 'login', ['--code', '--no-pull']], ['cloud', 'status', ['--json']],
      ['pull', undefined, ['--force']], ['update', undefined, ['--force']], ['status', undefined, ['--json']],
    ]
    for (const [cmd, sub, seen] of okCombos) expect(flagError(cmd, sub, seen), `${cmd} ${sub ?? ''} ${seen.join(' ')}`).toBeNull()
  })

  it('--json only where the command really prints JSON', () => {
    for (const [cmd, sub] of [['sections', 'T'], ['touch', 'T'], ['move', 'T'], ['push', undefined], ['section', 'add'],
      ['group', 'delete'], ['folder', 'rename'], ['cloud', 'push'], ['rename', 'T'], ['pull', undefined]] as [string, string | undefined][]) {
      expect(flagError(cmd, sub, ['--json']), `${cmd} ${sub ?? ''}`).toContain('Flag --json is not supported')
    }
    ok(['new', 'Doc'])
    const r = run(['sections', 'Doc', '--json'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain("Flag --json is not supported by 'sections'")
    // login: only --no-wait prints JSON (checked before any request)
    expect(cli.loginFlagsError({ json: true })).toContain("--json only works with 'login --no-wait'")
    expect(cli.loginFlagsError({ json: true, finish: true })).toContain('--json only works')
    expect(cli.loginFlagsError({ json: true, noWait: true })).toBeNull()
    const l = run(['login', '--finish', '--json'])
    expect(l.status).toBe(1)
    expect(l.stderr).toContain('--json only works')
  })

  it('leaves unknown commands/subcommands to their own usage error', () => {
    expect(flagError('frobnicate', undefined, ['--dry-run'])).toBeNull()
    expect(flagError('section', 'bogus', ['--dry-run'])).toBeNull()
    const r = run(['section', 'bogus', '--dry-run'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Usage: noteflow section')
  })

  it('every known flag is accepted by at least one command', () => {
    const table = cli.COMMAND_FLAGS as Record<string, string[]>
    const all = new Set(Object.values(table).flat().concat(['--json', '--yes']))
    const help = run(['help']).stdout
    for (const f of ['--archived', '--ungroup', '--force', '--no-pull', '--no-wait', '--finish', '--send-code', '--code', '--color', '--title', '--tag']) {
      expect(all.has(f), f).toBe(true)
    }
    expect(help).toContain("a flag a command doesn't support is an error")
  })
})

describe('--file / --stdin encodings', () => {
  const decode = cli.decodeInputBuffer as (b: Buffer) => { text?: string; error?: string }
  const TEXT = 'línea uno\r\n- [ ] ñandú ✓\r\n'
  const utf16le = (s: string) => Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(s, 'utf16le')])
  const utf16be = (s: string) => Buffer.concat([Buffer.from([0xFE, 0xFF]), Buffer.from(s, 'utf16le').swap16()])

  it('decodes UTF-8, UTF-16LE/BE with BOM; refuses BOM-less UTF-16', () => {
    expect(decode(Buffer.from(TEXT, 'utf-8')).text).toBe(TEXT)
    expect(decode(utf16le(TEXT)).text).toBe(TEXT)
    expect(decode(utf16be(TEXT)).text).toBe(TEXT)
    expect(decode(Buffer.from(TEXT, 'utf16le')).error).toContain('UTF-16')
    expect(decode(Buffer.from(TEXT, 'utf16le').swap16()).error).toContain('UTF-16')
    expect(decode(Buffer.alloc(0)).text).toBe('')
    expect(decode(Buffer.from('a', 'utf-8')).text).toBe('a')
  })

  beforeEach(() => { ok(['new', 'Doc', '--section', 'Body']) })

  it('set --file with PowerShell 5.1 output (UTF-16LE + BOM) stores the real text', () => {
    const file = path.join(tmp, 'sec.md')
    fs.writeFileSync(file, utf16le(TEXT))
    ok(['set', 'Doc', 'Body', '--file', file])
    expect(note('Doc').sections[0].content).toBe('línea uno\n- [ ] ñandú ✓')
  })

  it('set --stdin and add --file decode a UTF-16 BOM too', () => {
    ok(['set', 'Doc', 'Body', '--stdin'], utf16be('desde stdin'))
    expect(note('Doc').sections[0].content).toBe('desde stdin')
    const file = path.join(tmp, 'more.md')
    fs.writeFileSync(file, utf16le('más'))
    ok(['add', '--file', file, '--title', 'Doc', '--section', 'Body'])
    expect(note('Doc').sections[0].content).toBe('desde stdin\nmás')
  })

  it('BOM-less UTF-16 fails (exit 1) with the way out, writing nothing', () => {
    const file = path.join(tmp, 'nobom.md')
    fs.writeFileSync(file, Buffer.from(TEXT, 'utf16le'))
    for (const args of [['set', 'Doc', 'Body', '--file', file], ['add', '--file', file, '--title', 'Doc', '--section', 'Body']]) {
      const r = run(args)
      expect(r.status, args.join(' ')).toBe(1)
      expect(r.stderr).toContain('looks like UTF-16')
      expect(r.stderr).toContain('--stdin')
      expect(r.stderr).toContain('Out-File -Encoding utf8')
    }
    expect(note('Doc').sections[0].content).toBe('')
  })
})
