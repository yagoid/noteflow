// Agent tasks in the CLI (cli/noteflow.js, `noteflow task …`): a checklist task
// handed to an external AI agent. Its state is a marker on the task's own line
// ('🤖<id>:<state>', after the 📅/⏰/🔺 annotations) and the detail lives in the
// note folder's reserved agent.md (one block per task) — see note-format.md
// "Tareas para agentes".
//
// Three layers: the pure helpers (marker, task lines, agent.md), the commands
// through the real CLI, and the sync of agent.md against an in-memory GitHub.
// Real runs are isolated: notes AND settings (APPDATA / XDG_CONFIG_HOME) live in
// throwaway dirs — no sync session exists, nothing leaves the process.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseNoteDir, serializeNoteFolder, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import { gitBlobSha } from '../../electron/mirrorPlan'

const require = createRequire(import.meta.url)
const CLI = require.resolve('../../cli/noteflow.js')
const cli = require(CLI)
const https = require('node:https') as { request: (...a: unknown[]) => unknown }

type TaskLine = { line: string; checked: boolean; body: string; text: string; marker: { id: string; state: string } | null; index: number; more: string[] }
type Block = { id: string; meta: Record<string, string>; body: string }

const AGENT_MD = cli.AGENT_MD as string
const AGENT_MARKER_RE = cli.AGENT_MARKER_RE as RegExp
const parseAgentTaskLine = cli.parseAgentTaskLine as (line: string) => Omit<TaskLine, 'index' | 'more'> | null
const withAgentMarker = cli.withAgentMarker as (line: string, id: string, state: string | null) => string
const withAgentTaskChecked = cli.withAgentTaskChecked as (line: string, checked: boolean) => string
const agentTaskLines = cli.agentTaskLines as (content: string) => TaskLine[]
const agentTaskChildren = cli.agentTaskChildren as (content: string, index: number) => string[]
const agentDisplayState = cli.agentDisplayState as (state: string, lastSignal: string | undefined, staleMinutes: number, nowMs: number) => string
const parseAgentDoc = cli.parseAgentDoc as (text: string) => Block[]
const serializeAgentDoc = cli.serializeAgentDoc as (blocks: Block[]) => string
const maintainAgentBlocks = cli.maintainAgentBlocks as (blocks: Block[], live: Set<string>, nowMs: number) => { blocks: Block[]; changed: boolean }

const ROBOT = '\u{1F916}'
const DUE = '\u{1F4C5}'
const ALARM = '\u{23F0}'
const PRIO = '\u{1F53A}'
const DAY = 24 * 60 * 60 * 1000

// Each test spawns the CLI several times (a new Node process each): give them room.
const SPAWN_TIMEOUT = { timeout: 120_000 }

describe('the marker on a task line', () => {
  it('is read after the date / alarm / priority annotations, and the text comes without any of them', () => {
    const t = parseAgentTaskLine(`- [ ] Fix X ${DUE}2026-12-01 ${ALARM}09:30 ${PRIO}high ${ROBOT}k3f9a:running`)!
    expect(t.marker).toEqual({ id: 'k3f9a', state: 'running' })
    expect(t.text).toBe('Fix X')
    expect(t.checked).toBe(false)
    expect(parseAgentTaskLine(`  * [x] Done thing ${ROBOT}a1b2c:done`)).toMatchObject({ checked: true, text: 'Done thing', marker: { id: 'a1b2c', state: 'done' } })
  })

  it('is one regex: 5 chars [a-z0-9], its own word, any state word', () => {
    expect(AGENT_MARKER_RE.exec(`a ${ROBOT}k3f9a:queued`)!.slice(2, 4)).toEqual(['k3f9a', 'queued'])
    expect(AGENT_MARKER_RE.test(`${ROBOT}k3f9a:queued`)).toBe(true)
    expect(AGENT_MARKER_RE.test(`a ${ROBOT}k3f9:queued`)).toBe(false) // 4 chars
    expect(AGENT_MARKER_RE.test(`a ${ROBOT}K3F9A:queued`)).toBe(false) // upper case
    expect(AGENT_MARKER_RE.test(`a${ROBOT}k3f9a:queued`)).toBe(false) // glued to a word
    expect(AGENT_MARKER_RE.test(`a ${ROBOT}k3f9a:queued!`)).toBe(false)
    // An annotation appended after it by another editor: still read.
    expect(parseAgentTaskLine(`- [ ] T ${ROBOT}k3f9a:review ${DUE}2026-12-01`)!.marker).toEqual({ id: 'k3f9a', state: 'review' })
  })

  it('a state this version does not know is opaque text: parsed, not rewritten by a parse', () => {
    const line = `- [ ] T ${ROBOT}k3f9a:paused-by-app`
    expect(parseAgentTaskLine(line)).toMatchObject({ text: 'T', marker: { id: 'k3f9a', state: 'paused-by-app' } })
  })

  it('not a task: a plain bullet, a paragraph, a task inside a code fence', () => {
    expect(parseAgentTaskLine(`- plain ${ROBOT}k3f9a:queued`)).toBeNull()
    expect(parseAgentTaskLine('text')).toBeNull()
    const tasks = agentTaskLines(['- [ ] a', '```', '- [ ] in code', '```', '- [ ] b'].join('\n'))
    expect(tasks.map((t) => [t.index, t.text])).toEqual([[0, 'a'], [4, 'b']])
  })

  it('code fences: an inline ```x``` opens nothing, a longer fence closes only on its own length', () => {
    const text = (content: string) => agentTaskLines(content).map((t) => t.text)
    expect(text(['```js inline``` text', '- [ ] a'].join('\n'))).toEqual(['a'])
    expect(text(['````', '```', '- [ ] in code', '```', '````', '- [ ] b'].join('\n'))).toEqual(['b'])
    expect(text(['~~~', '```', '- [ ] in code', '~~~', '- [ ] c'].join('\n'))).toEqual(['c'])
    expect(text(['```', '- [ ] in code', '``` not a close', '- [ ] still code'].join('\n'))).toEqual([])
  })

  it('agentIdsIn: an id is alive wherever the note still mentions it — not only on a task line', () => {
    const agentIdsIn = cli.agentIdsIn as (sections: { content: string }[]) => Set<string>
    const content = [
      `- no box ${ROBOT}aaaa1:done`, `> - [ ] quoted ${ROBOT}bbbb2:running`, '```', `- [ ] in an open fence ${ROBOT}cccc3:queued`,
    ].join('\r\n')
    expect(agentTaskLines(content).filter((t) => t.marker)).toEqual([]) // none of them is a task to act on…
    expect([...agentIdsIn([{ content }, { content: `text ${ROBOT}dddd4:x` }])].sort()).toEqual(['aaaa1', 'bbbb2', 'cccc3', 'dddd4']) // …all alive
  })

  it('withAgentMarker writes it at the END (after the annotations), replaces and removes it', () => {
    const base = `- [ ] Fix X ${DUE}2026-12-01 ${ALARM}09:30 ${PRIO}high`
    const queued = withAgentMarker(base, 'k3f9a', 'queued')
    expect(queued).toBe(`${base} ${ROBOT}k3f9a:queued`)
    expect(withAgentMarker(queued, 'k3f9a', 'running')).toBe(`${base} ${ROBOT}k3f9a:running`)
    expect(withAgentMarker(queued, 'k3f9a', null)).toBe(base)
    // A marker left in the middle moves to the end.
    expect(withAgentMarker(`- [ ] T ${ROBOT}k3f9a:queued ${DUE}2026-12-01`, 'k3f9a', 'done')).toBe(`- [ ] T ${DUE}2026-12-01 ${ROBOT}k3f9a:done`)
    expect(withAgentMarker('  - [ ] indented', 'abcde', 'queued')).toBe(`  - [ ] indented ${ROBOT}abcde:queued`)
    expect(withAgentMarker('not a task', 'abcde', 'queued')).toBe('not a task')
  })

  it('withAgentTaskChecked only flips the box', () => {
    expect(withAgentTaskChecked(`  - [ ] T [ ] ${ROBOT}abcde:done`, true)).toBe(`  - [x] T [ ] ${ROBOT}abcde:done`)
    expect(withAgentTaskChecked('- [X] T', false)).toBe('- [ ] T')
  })

  it('agentTaskChildren: what is indented under the task belongs to it, verbatim', () => {
    const content = ['- [ ] parent', '  - child one', '', '    deeper', '  text', '- [ ] sibling', '  - not mine'].join('\r\n')
    expect(agentTaskChildren(content, 0)).toEqual(['  - child one', '', '    deeper', '  text'])
    expect(agentTaskChildren(content, 5)).toEqual(['  - not mine'])
    expect(agentTaskChildren('- [ ] alone\n\n', 0)).toEqual([])
  })

  it('a task with a line break in it: the lines that continue it are its text (what the editor writes for a hard break)', () => {
    // The editor writes a hard break inside a task as the rest of the text on the next line, not indented.
    const content = [
      `- [x] First part ${ROBOT}1ky68:done`, `Second part ${DUE}2026-12-01`, 'third', '- [ ] next', 'its line two',
    ].join('\r\n')
    const [first, next] = agentTaskLines(content)
    expect(first).toMatchObject({ index: 0, text: 'First part Second part third', more: ['Second part', 'third'], marker: { id: '1ky68', state: 'done' } })
    expect(next).toMatchObject({ index: 3, text: 'next its line two', more: ['its line two'] })
    expect(agentTaskLines('- [ ] one line')[0]).toMatchObject({ text: 'one line', more: [] })
    // A BOM before an indented first task: the task is read, and what follows continues it.
    expect(agentTaskLines('\uFEFF  - [ ] x\n  y\n    z')[0]).toMatchObject({ text: 'x y z', more: ['y', 'z'] })
    expect(agentTaskChildren('\uFEFF  - [ ] x\n  y\n    - [ ] z\n- [ ] next', 0)).toEqual(['    - [ ] z'])
    // The continuation stops at a blank line, any list item, a fence, a kanban / drawing marker…
    const stops = (after: string) => agentTaskLines(['- [ ] a', 'b', after, 'c'].join('\n'))[0].more
    for (const after of ['', '- bullet', '  - [ ] sub', '1. ordered', '-', '```', '~~~', '<!-- /kanban -->']) expect(stops(after)).toEqual(['b'])
    // A line indented deeper than the task, not an item, continues its text too — what the
    // editor shows (QA yilsf; it used to be a child here and text once the app rewrote it at column 0).
    expect(agentTaskLines('- [ ] a\n  details\nmore')[0]).toMatchObject({ text: 'a details more', more: ['details', 'more'] })
    expect(agentTaskChildren('- [ ] a\n  details\nmore', 0)).toEqual([])
    const under = ['- [ ] parent', '  - [ ] subtask', '    detail', '- [ ] next'].join('\n')
    expect(agentTaskLines(under).map((t) => t.text)).toEqual(['parent', 'subtask detail', 'next'])
    expect(agentTaskChildren(under, 0)).toEqual(['  - [ ] subtask', '    detail'])
    // The same as after the app rewrites it at column 0.
    expect(agentTaskLines(['- [ ] parent', '  - [ ] subtask', 'detail', '- [ ] next'].join('\n')).map((t) => t.text)).toEqual(['parent', 'subtask detail', 'next'])
    // A subtask's own line break, not indented, continues the SUBTASK.
    const nested = ['- [ ] parent', `  - [ ] child ${ROBOT}abcde:queued`, 'child line two', '  - [ ] child two', '- [ ] sibling'].join('\n')
    expect(agentTaskLines(nested).map((t) => t.text)).toEqual(['parent', 'child child line two', 'child two', 'sibling'])
    // The parent's children: the lazy line of a child does not cut them short; the task's own continuation is not a child.
    expect(agentTaskChildren(nested, 0)).toEqual([`  - [ ] child ${ROBOT}abcde:queued`, 'child line two', '  - [ ] child two'])
    expect(agentTaskChildren('- [ ] a\nb\n  - sub\nsub two\n\nafter', 0)).toEqual(['  - sub', 'sub two'])
    // Kanban: a card's extra lines are indented deeper — details, not text; the closing marker ends the last card.
    const board = ['<!-- kanban -->', '- To do', `  - [ ] card ${ROBOT}abcde:queued`, '    extra', '<!-- /kanban -->'].join('\n')
    expect(agentTaskLines(board)[0]).toMatchObject({ text: 'card', more: [] })
    expect(agentTaskChildren(board, 2)).toEqual(['    extra'])
  })
})

describe('agent.md', () => {
  const blocks: Block[] = [
    { id: 'k3f9a', meta: { title: 'Fix X', section: 'Tasks', state: 'done', createdAt: 'T1', futureKey: 'kept' }, body: '## Report\n\nDid it.' },
    { id: 'a1b2c', meta: { title: 'Other', state: 'queued' }, body: '' },
  ]

  it('one block per task: header of key: value lines, a --- line, the report', () => {
    const text = serializeAgentDoc(blocks)
    expect(text).toBe([
      '<!-- task:k3f9a -->', 'title: Fix X', 'section: Tasks', 'state: done', 'createdAt: T1', 'futureKey: kept', '---',
      '## Report', '', 'Did it.', '<!-- /task:k3f9a -->', '',
      '<!-- task:a1b2c -->', 'title: Other', 'state: queued', '---', '<!-- /task:a1b2c -->', '',
    ].join('\n'))
    expect(parseAgentDoc(text)).toEqual(blocks)
    expect(serializeAgentDoc([])).toBe('')
  })

  it('a value is always one line; a report line that looks like a delimiter is escaped', () => {
    const text = serializeAgentDoc([{ id: 'k3f9a', meta: { progress: 'a\r\nb\n c' }, body: 'x\n<!-- /task:k3f9a -->\ny' }])
    expect(text).toContain('progress: a b c\n')
    expect(text).toContain('\n\\<!-- /task:k3f9a -->\n')
    const back = parseAgentDoc(text)
    expect(back).toHaveLength(1)
    expect(back[0].body).toBe('x\n\\<!-- /task:k3f9a -->\ny')
  })

  it('is read tolerantly: CRLF, stray text, an unclosed block, conflict markers in a header, a repeated id', () => {
    const text = [
      'stray line', '<!-- task:k3f9a -->', 'state: running', '> conflict marker', '', 'state: waiting', 'question: why?', '---', 'body',
      '<!-- task:a1b2c -->', 'state: queued', '<!-- /task:a1b2c -->',
      '<!-- task:k3f9a -->', 'state: failed', '---', '<!-- /task:k3f9a -->',
    ].join('\r\n')
    expect(parseAgentDoc(text)).toEqual([
      { id: 'k3f9a', meta: { state: 'waiting', question: 'why?' }, body: 'body' },
      { id: 'a1b2c', meta: { state: 'queued' }, body: '' },
    ])
    expect(parseAgentDoc('')).toEqual([])
  })

  it('orphans: stamped the first time, dropped after 7 days, un-stamped when the id comes back', () => {
    const now = Date.parse('2026-12-10T00:00:00.000Z')
    const mk = (): Block[] => [
      { id: 'live1', meta: { state: 'queued' }, body: '' },
      { id: 'gone1', meta: { state: 'done' }, body: 'r' },
      { id: 'gone2', meta: { state: 'done', orphanedAt: new Date(now - 6 * DAY).toISOString() }, body: '' },
      { id: 'gone3', meta: { state: 'done', orphanedAt: new Date(now - 7 * DAY).toISOString() }, body: '' },
      { id: 'back1', meta: { state: 'queued', orphanedAt: new Date(now - 2 * DAY).toISOString() }, body: '' },
    ]
    const res = maintainAgentBlocks(mk(), new Set(['live1', 'back1']), now)
    expect(res.changed).toBe(true)
    expect(res.blocks.map((b) => b.id)).toEqual(['live1', 'gone1', 'gone2', 'back1'])
    expect(res.blocks[1].meta.orphanedAt).toBe(new Date(now).toISOString())
    expect(res.blocks[2].meta.orphanedAt).toBe(new Date(now - 6 * DAY).toISOString())
    expect(res.blocks[3].meta).not.toHaveProperty('orphanedAt')
    expect(maintainAgentBlocks([mk()[0]], new Set(['live1']), now).changed).toBe(false)
  })

  it('no-signal is derived: running / waiting with an old (or no) last signal', () => {
    const now = Date.parse('2026-12-10T12:00:00.000Z')
    const ago = (min: number) => new Date(now - min * 60_000).toISOString()
    expect(agentDisplayState('running', ago(89), 90, now)).toBe('running')
    expect(agentDisplayState('running', ago(91), 90, now)).toBe('no-signal')
    expect(agentDisplayState('waiting', ago(91), 90, now)).toBe('no-signal')
    expect(agentDisplayState('running', undefined, 90, now)).toBe('no-signal')
    expect(agentDisplayState('running', ago(20), 10, now)).toBe('no-signal')
    for (const s of ['queued', 'review', 'done', 'failed', 'interrupted', 'whatever']) expect(agentDisplayState(s, ago(9999), 90, now)).toBe(s)
  })
})

// ── The commands, through the real CLI ────────────────────────────────────────

type Run = { status: number; stdout: string; stderr: string }
type ListRow = { id: string; state: string; markerState: string; checked: boolean; section: string; text: string; progress: string | null; percent: number | null; question: string | null }

describe('noteflow task (real runs, isolated)', SPAWN_TIMEOUT, () => {
  let tmp: string
  let notesDir: string
  let workDir: string
  const DIR = 'plan-abc12345'
  const TITLE = 'Plan'
  const T0 = '2026-01-01T00:00:00.000Z'
  const TASKS = [
    `- [ ] Fix the login ${DUE}2026-12-01 ${PRIO}high`,
    '  - check the redirect',
    '  - and the cookie',
    '- [ ] Write the docs',
    '- [x] Already done',
    '- [ ] Ship it',
  ]

  function run(args: string[], opts: { input?: string; cwd?: string; env?: Record<string, string | undefined> } = {}): Run {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf-8',
      cwd: opts.cwd ?? workDir,
      input: opts.input,
      env: {
        ...process.env,
        APPDATA: path.join(tmp, 'config'),
        XDG_CONFIG_HOME: path.join(tmp, 'config'),
        NOTEFLOW_NOTES_DIR: notesDir,
        NOTEFLOW_NO_APP_CHECK: '1',
        // Not inherited from the Claude Desktop session (or `noteflow run`) this suite may run under.
        CLAUDE_CODE_ENTRYPOINT: undefined,
        CLAUDE_CODE_HOST_SESSION_ID: undefined,
        NOTEFLOW_RUN_ID: undefined,
        NOTEFLOW_RUN_TASKS: undefined,
        NOTEFLOW_RUN_AGENT: undefined,
        NOTEFLOW_RUN_MODEL: undefined,
        ...opts.env,
      },
      stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    })
    return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
  function ok(args: string[], opts: { input?: string; cwd?: string; env?: Record<string, string | undefined> } = {}): Run {
    const r = run(args, opts)
    expect(r.status, `${args.join(' ')}\n${r.stderr}`).toBe(0)
    return r
  }
  function fails(args: string[]): Run {
    const r = run(args)
    expect(r.status, `${args.join(' ')}\n${r.stdout}`).toBe(1)
    return r
  }
  const file = (name: string) => path.join(notesDir, DIR, name)
  const read = (name: string) => fs.readFileSync(file(name), 'utf-8')
  const taskLines = () => read('st.md').split(/\r?\n/)
  const blocks = () => (fs.existsSync(file(AGENT_MD)) ? parseAgentDoc(read(AGENT_MD)) : [])
  const block = (id: string) => blocks().find((b) => b.id === id)!
  const list = (...args: string[]) => JSON.parse(ok(['task', 'list', '--json', ...args]).stdout) as ListRow[]
  const queue = (match: string) => (JSON.parse(ok(['task', 'queue', TITLE, 'Tasks', '--match', match, '--json']).stdout) as { id: string }).id
  const setSettings = (agentTasks: Record<string, unknown>) => {
    fs.mkdirSync(path.join(tmp, 'config', 'noteflow'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'noteflow', 'settings.json'), JSON.stringify({ agentTasks }))
  }
  /** Rewrites one header value of a block by hand (what another machine, or time, would have left). */
  const patchBlock = (id: string, key: string, value: string) => {
    const all = blocks()
    all.find((b) => b.id === id)!.meta[key] = value
    fs.writeFileSync(file(AGENT_MD), serializeAgentDoc(all))
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-agent-tasks-'))
    notesDir = path.join(tmp, 'notes')
    workDir = path.join(tmp, 'work')
    fs.mkdirSync(workDir)
    const { files } = serializeNoteFolder({
      id: 'abc12345', title: TITLE, tags: [], created: T0, updated: T0,
      sections: [
        { id: 'sn', name: 'Notes', content: 'free text' },
        { id: 'st', name: 'Tasks', content: TASKS.join('\n') },
      ],
    }, { preserveUpdated: true })
    fs.mkdirSync(path.join(notesDir, DIR), { recursive: true })
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(file(name), content)
    // Most tests below finish to done: an explicit 'check'. The default (review) has its own test.
    setSettings({ onFinish: 'check' })
  })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('queue marks the one matching task (after its annotations) and records it in agent.md', () => {
    const r = ok(['task', 'queue', TITLE, 'Tasks', '--match', 'login'])
    const id = /Queued ([a-z0-9]{5}): Fix the login/.exec(r.stdout)![1]
    expect(taskLines()[0]).toBe(`${TASKS[0]} ${ROBOT}${id}:queued`)
    expect(taskLines().slice(1)).toEqual(TASKS.slice(1)) // nothing else moved
    expect(block(id).meta).toMatchObject({ title: 'Fix the login', section: 'Tasks', state: 'queued' })
    expect(Date.parse(block(id).meta.createdAt)).toBeGreaterThan(Date.parse(T0))
    // Not a section: note.md still lists the two sections, and both stamps moved like after `touch`.
    const note = parseNoteDir(path.join(notesDir, DIR)) as DiskNote
    expect(note.sections.map((s) => s.name)).toEqual(['Notes', 'Tasks'])
    expect(Date.parse(note.updated)).toBeGreaterThan(Date.parse(T0))
    expect(note.sections[1].updated).toBeDefined()
    expect(note.sections[0].updated).toBeUndefined()
    expect(read('sn.md')).toBe('free text')
  })

  it('queue: no match, several matches or an already marked task → exit 1 with the candidates, nothing written', () => {
    const before = read('st.md')
    const none = fails(['task', 'queue', TITLE, 'Tasks', '--match', 'nothing like this'])
    expect(none.stderr).toContain('No unchecked task of "Tasks"')
    expect(none.stderr).toContain('- Fix the login')
    expect(none.stderr).not.toContain('Already done') // checked tasks are not candidates
    const many = fails(['task', 'queue', TITLE, 'Tasks', '--match', 'i'])
    expect(many.stderr).toContain('fits 3 unchecked tasks')
    expect(read('st.md')).toBe(before)
    expect(fs.existsSync(file(AGENT_MD))).toBe(false)
    const id = queue('login')
    const again = fails(['task', 'queue', TITLE, 'Tasks', '--match', 'login'])
    expect(again.stderr).toContain(`already has an agent marker: ${id} (queued)`)
    expect(fails(['task', 'queue', TITLE, 'Nope', '--match', 'x']).stderr).toContain('Tasks')
  })

  it('next: the first queued task in document order; --any gives an id to the first unchecked one', () => {
    expect(ok(['task', 'next', TITLE]).stdout).toContain('No queued task in "Plan" (pass --any')
    expect(JSON.parse(ok(['task', 'next', TITLE, '--json']).stdout)).toMatchObject({ id: null })
    const any = JSON.parse(ok(['task', 'next', TITLE, '--any', '--json']).stdout) as { id: string; text: string; assigned: boolean; section: string }
    expect(any).toMatchObject({ text: 'Fix the login', assigned: true, section: 'Tasks' })
    expect(taskLines()[0]).toBe(`${TASKS[0]} ${ROBOT}${any.id}:queued`)
    const docs = queue('docs')
    // Still the first one, and nothing is started or written by `next`.
    const before = read('st.md')
    expect(JSON.parse(ok(['task', 'next', TITLE, 'Tasks', '--any', '--json']).stdout)).toMatchObject({ id: any.id, assigned: false })
    expect(read('st.md')).toBe(before)
    ok(['task', 'start', any.id])
    expect(ok(['task', 'next', TITLE]).stdout).toContain(`${docs}  Write the docs`)
  })

  it('next --any: outermost tasks only — a subtask of an open task is part of its brief; under a checked one it counts', () => {
    fs.writeFileSync(file('st.md'), [
      `- [ ] Parent ${ROBOT}aaaa1:running`,
      '  - [ ] child of a running task',
      '- [ ] Open parent',
      '  - [ ] child of an open task',
      '- [x] Checked parent',
      '  - [ ] child of a checked task',
    ].join('\n'))
    const first = JSON.parse(ok(['task', 'next', TITLE, 'Tasks', '--any', '--json']).stdout) as { id: string; text: string }
    expect(first.text).toBe('Open parent')
    ok(['task', 'start', first.id])
    const second = JSON.parse(ok(['task', 'next', TITLE, 'Tasks', '--any', '--json']).stdout) as { id: string; text: string }
    expect(second.text).toBe('child of a checked task')
    expect(taskLines()[1]).toBe('  - [ ] child of a running task')
    expect(taskLines()[3]).toBe('  - [ ] child of an open task')
  })

  it('a kanban card finished with on-finish check moves to the done column, like checking it in the app', () => {
    const board = (lines: string[]) => fs.writeFileSync(file('st.md'), lines.join('\r\n'))
    board([
      'Intro',
      '<!-- kanban done="Done" -->',
      '- To do',
      `  - [ ] Card A ${ROBOT}aaaa1:queued`,
      '    - a detail of A',
      '  - [ ] Card B',
      '- Done',
      '  - [x] Old one',
      '<!-- /kanban -->',
      'After',
    ])
    ok(['task', 'start', 'aaaa1', '--on-finish', 'check'])
    ok(['task', 'finish', 'aaaa1', '--summary', 'did it'])
    expect(read('st.md').split('\r\n')).toEqual([
      'Intro',
      '<!-- kanban done="Done" -->',
      '- To do',
      '  - [ ] Card B',
      '- Done',
      '  - [x] Old one',
      `  - [x] Card A ${ROBOT}aaaa1:done`,
      '    - a detail of A',
      '<!-- /kanban -->',
      'After',
    ])
    // review: left where it is, unchecked.
    board([
      '<!-- kanban done="Done" -->', '- To do', `  - [ ] Card C ${ROBOT}ccc11:queued`, '- Done', '<!-- /kanban -->',
    ])
    ok(['task', 'start', 'ccc11', '--on-finish', 'review'])
    ok(['task', 'finish', 'ccc11', '--summary', 'did it'])
    expect(read('st.md').split('\r\n')[2]).toBe(`  - [ ] Card C ${ROBOT}ccc11:review`)
  })

  it('kanbanCheckedCardMove (pure): no done column, already in it, not a board → nothing moves', () => {
    const move = cli.kanbanCheckedCardMove as (lines: string[], index: number) => string[] | null
    expect(move(['<!-- kanban -->', '- A', '  - [x] c', '- B', '<!-- /kanban -->'], 2)).toBeNull()
    expect(move(['<!-- kanban done="B" -->', '- A', '- B', '  - [x] c', '<!-- /kanban -->'], 3)).toBeNull()
    expect(move(['<!-- kanban done="B" -->', '- A', '  - [x] c', 'loose text', '- B', '<!-- /kanban -->'], 2)).toBeNull()
    expect(move(['- A', '  - [x] c'], 1)).toBeNull()
    expect(move(['<!-- kanban done="B" -->', '- A', '  - [x] c', '- B', '<!-- /kanban -->'], 2))
      .toEqual(['<!-- kanban done="B" -->', '- A', '- B', '  - [x] c', '<!-- /kanban -->'])
  })

  it('section rename renames the section in the agent.md blocks of its tasks right away', () => {
    const id = queue('login')
    expect(block(id).meta.section).toBe('Tasks')
    ok(['section', 'rename', TITLE, 'Tasks', 'To-do'])
    expect(block(id).meta.section).toBe('To-do')
    expect(list()[0]).toMatchObject({ id, section: 'To-do' })
  })

  it('an encrypted note: "is password-protected", not "No note found" — and add --create does not make a twin', () => {
    const encDir = path.join(notesDir, 'vault-zzz99999')
    fs.mkdirSync(encDir)
    fs.writeFileSync(path.join(encDir, NOTE_MD), `---\nid: "zzz99999"\ntitle: "Vault"\ntags: []\ncreated: "${T0}"\nupdated: "${T0}"\nencryption:\n  v: 1\n---\nCIPHERTEXT`)
    for (const args of [['read', 'Vault'], ['add', 'x', '--title', 'Vault'], ['add', 'x', '--title', 'Vault', '--create'], ['task', 'next', 'Vault']]) {
      const r = fails(args)
      expect(r.stderr, args.join(' ')).toContain('"Vault" is password-protected')
    }
    const json = run(['read', 'Vault', '--json'])
    expect(JSON.parse(json.stdout)).toMatchObject({ code: 'note_encrypted', title: 'Vault' })
    expect(fs.readdirSync(notesDir).sort()).toEqual([DIR, 'vault-zzz99999'].sort())
  })

  it('start prints the briefing (task, its indented lines, the rules with the id) and records who runs it', () => {
    const id = queue('login')
    const r = ok(['task', 'start', id, '--agent', 'claude-code'])
    expect(r.stdout).toContain(`TASK ${id}\nNote: Plan\nSection: Tasks\nTask: Fix the login\n`)
    expect(r.stdout).toContain('  - check the redirect\n  - and the cookie\n')
    expect(r.stdout).toContain(`noteflow task report ${id} "<what you are doing>"`)
    expect(r.stdout).toContain(`noteflow task ask ${id} "<question>"`)
    expect(r.stdout).toContain(`noteflow task finish ${id} --file <report.md>`)
    expect(r.stdout).toContain(`noteflow task fail ${id} "<reason>"`)
    expect(r.stdout).toContain('Remaining in this batch: none')
    expect(r.stdout).not.toContain(DUE) // the text is shown without annotations
    expect(taskLines()[0]).toBe(`${TASKS[0]} ${ROBOT}${id}:running`)
    const meta = block(id).meta
    expect(meta).toMatchObject({ state: 'running', machine: os.hostname(), agent: 'claude-code', onFinish: 'check' })
    expect(fs.realpathSync.native(meta.cwd).toLowerCase()).toBe(fs.realpathSync.native(workDir).toLowerCase())
    expect(meta.startedAt).toBe(meta.lastSignal)
    expect(meta).not.toHaveProperty('batch')
    expect(meta).not.toHaveProperty('gitStartHead') // not a git repo
  })

  it('a task with a line break: start shows ALL of it, agent.md titles it whole, the second line is left as it was', () => {
    // The editor writes a hard break inside a task as the next line, not indented.
    fs.writeFileSync(file('st.md'), ['- [ ] Show the folder in the Run button', 'and the percent of each task', '  - a detail', '- [ ] Ship it'].join('\n'))
    const id = queue('folder')
    expect(block(id).meta.title).toBe('Show the folder in the Run button and the percent of each task')
    const r = ok(['task', 'start', id])
    expect(r.stdout).toContain('Task: Show the folder in the Run button\n      and the percent of each task\n')
    expect(r.stdout).toContain('Details (the lines indented under the task, verbatim):\n  - a detail\n')
    expect(taskLines()).toEqual([
      `- [ ] Show the folder in the Run button ${ROBOT}${id}:running`, 'and the percent of each task', '  - a detail', '- [ ] Ship it',
    ])
    // An older CLI titled it by its first line only: the block is brought in line with the whole text.
    patchBlock(id, 'title', 'Show the folder in the Run button')
    ok(['task', 'report', id, 'working'])
    expect(block(id).meta.title).toBe('Show the folder in the Run button and the percent of each task')
  })

  it('a task someone is running cannot be claimed twice; --force takes it over', () => {
    const id = queue('login')
    ok(['task', 'start', id, '--agent', 'first'])
    const before = read(AGENT_MD)
    const r = fails(['task', 'start', id, '--agent', 'second'])
    expect(r.stderr).toContain(`Task ${id} is already running on ${os.hostname()} by first since `)
    expect(r.stderr).toContain('Pass --force to take it over')
    expect(read(AGENT_MD)).toBe(before)
    ok(['task', 'ask', id, 'which one?'])
    expect(fails(['task', 'start', id]).stderr).toContain(`Task ${id} is already waiting`)
    ok(['task', 'start', id, '--agent', 'second', '--force'])
    expect(block(id).meta).toMatchObject({ state: 'running', agent: 'second' })
    expect(block(id).meta).not.toHaveProperty('question')
  })

  it('start from Claude Desktop records its session (desktopSession); outside it, or a new start, it goes', () => {
    const S1 = 'local_3c827525-171f-463a-92a7-3e8615c8987e'
    const S2 = 'local_0b1e2c3d-0000-4000-8000-000000000001'
    const desktop = (session: string) => ({ CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', CLAUDE_CODE_HOST_SESSION_ID: session })
    const id = queue('login')
    ok(['task', 'start', id], { env: desktop(S1) })
    expect(block(id).meta).toMatchObject({ state: 'running', machine: os.hostname(), desktopSession: S1 })
    // Out of AGENT_META_KEYS, like run / model: after the known keys, as the app writes it.
    const header = read(AGENT_MD).split('\n')
    expect(header.indexOf(`desktopSession: ${S1}`)).toBeGreaterThan(header.findIndex((l) => l.startsWith('cwd: ')))
    // report / ask / show keep it.
    ok(['task', 'ask', id, 'which one?'], { env: desktop(S2) })
    ok(['task', 'report', id, 'going on'])
    expect(block(id).meta.desktopSession).toBe(S1)
    expect(ok(['task', 'show', id]).stdout).toContain(`desktopSession: ${S1}`)
    // Another session takes it over: its own id.
    ok(['task', 'start', id, '--force'], { env: desktop(S2) })
    expect(block(id).meta.desktopSession).toBe(S2)
    // A start from a terminal (Claude Code's CLI has another entrypoint and no host session): gone.
    ok(['task', 'start', id, '--force'], { env: { CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CODE_HOST_SESSION_ID: S1 } })
    expect(block(id).meta).not.toHaveProperty('desktopSession')
    // Only an id Claude Desktop's link takes.
    for (const bad of ['last', 'local_', `local_${'a'.repeat(65)}`, 'local_x&y=1', 'local_x y', 'remote_abc']) {
      ok(['task', 'start', id, '--force'], { env: desktop(bad) })
      expect(block(id).meta, bad).not.toHaveProperty('desktopSession')
    }
    // The finish keeps it: the report can still open the conversation.
    ok(['task', 'start', id, '--force'], { env: desktop(S1) })
    ok(['task', 'finish', id, '--summary', 'Done'])
    expect(block(id).meta).toMatchObject({ state: 'done', desktopSession: S1 })
    // Pure: the rule.
    expect(cli.agentDesktopSession(desktop(S1))).toBe(S1)
    expect(cli.agentDesktopSession({ CLAUDE_CODE_HOST_SESSION_ID: S1 })).toBe('')
    expect(cli.agentDesktopSession(undefined)).toBe('')
  })

  it('no-signal: a running task with an old last signal is shown as such and can be started again', () => {
    const id = queue('login')
    ok(['task', 'start', id, '--agent', 'first'])
    expect(list()[0]).toMatchObject({ id, state: 'running', markerState: 'running' })
    patchBlock(id, 'lastSignal', new Date(Date.now() - 91 * 60_000).toISOString())
    expect(list()[0]).toMatchObject({ id, state: 'no-signal', markerState: 'running' })
    expect(list('--state', 'no-signal').map((t) => t.id)).toEqual([id])
    expect(list('--state', 'running')).toEqual([])
    expect(taskLines()[0]).toContain(`${ROBOT}${id}:running`) // derived: never written
    expect(ok(['task', 'show', id]).stdout).toContain(`Task ${id} — no-signal`)
    // agentTasks.staleMinutes (local settings.json) moves the threshold.
    setSettings({ staleMinutes: 600 })
    expect(list()[0].state).toBe('running')
    expect(fails(['task', 'start', id]).stderr).toContain('already running')
    setSettings({ staleMinutes: 90 })
    ok(['task', 'start', id, '--agent', 'second']) // no --force needed
    expect(block(id).meta.agent).toBe('second')
    expect(list()[0].state).toBe('running')
  })

  it('report / ask: progress in one line, waiting with the question, back to running', () => {
    const id = queue('login')
    expect(fails(['task', 'report', id, 'too early']).stderr).toContain(`Task ${id} is queued, not running`)
    ok(['task', 'start', id])
    const started = block(id).meta.lastSignal
    ok(['task', 'report', id, 'reading the code'])
    ok(['task', 'report', id, 'writing\nthe fix'])
    expect(block(id).meta.progress).toBe('writing the fix')
    expect(Date.parse(block(id).meta.lastSignal)).toBeGreaterThanOrEqual(Date.parse(started))
    ok(['task', 'ask', id, 'Keep the old cookie?'])
    expect(taskLines()[0]).toBe(`${TASKS[0]} ${ROBOT}${id}:waiting`)
    expect(block(id).meta).toMatchObject({ state: 'waiting', question: 'Keep the old cookie?' })
    expect(list()[0]).toMatchObject({ state: 'waiting', question: 'Keep the old cookie?' })
    ok(['task', 'report', id, 'user said yes'])
    expect(taskLines()[0]).toBe(`${TASKS[0]} ${ROBOT}${id}:running`)
    expect(block(id).meta).not.toHaveProperty('question')
    expect(fails(['task', 'report', id]).stderr).toContain('Usage: noteflow task report')
  })

  it('report --percent: the agent\'s estimate (0-100), alone or with the text; a bad value changes nothing; start clears it', () => {
    const id = queue('login')
    ok(['task', 'start', id])
    expect(list()[0]).toMatchObject({ id, percent: null })
    expect(ok(['task', 'report', id, 'reading the code', '--percent', '20']).stdout).toContain(`Reported ${id}: 20% · reading the code`)
    expect(block(id).meta).toMatchObject({ progress: 'reading the code', percent: '20' })
    // Out of AGENT_META_KEYS, like model / desktopSession: after the known keys.
    const header = read(AGENT_MD).split('\n')
    expect(header.indexOf('percent: 20')).toBeGreaterThan(header.findIndex((l) => l.startsWith('cwd: ')))
    // '40%' is taken; the text alone keeps the percent, the percent alone keeps the text.
    ok(['task', 'report', id, '--percent', '40%'])
    expect(block(id).meta).toMatchObject({ progress: 'reading the code', percent: '40' })
    ok(['task', 'report', id, 'writing the fix'])
    expect(block(id).meta).toMatchObject({ progress: 'writing the fix', percent: '40' })
    // A bad value: exit 1, nothing written.
    const before = read(AGENT_MD)
    for (const bad of ['101', '-5', '40.5', 'half', '']) {
      const r = fails(['task', 'report', id, 'x', '--percent', bad])
      expect(r.stderr, bad).toContain('--percent takes a whole number from 0 to 100')
    }
    expect(read(AGENT_MD)).toBe(before)
    expect(fails(['task', 'report', id]).stderr).toContain('[--percent <0-100>]')
    // --percent alone brings a waiting task back to running, like any report.
    ok(['task', 'ask', id, 'Keep the old cookie?'])
    ok(['task', 'report', id, '--percent', '60'])
    expect(taskLines()[0]).toBe(`${TASKS[0]} ${ROBOT}${id}:running`)
    expect(block(id).meta).not.toHaveProperty('question')
    // list / show.
    expect(list()[0]).toMatchObject({ id, progress: 'writing the fix', percent: 60 })
    expect(ok(['task', 'list']).stdout).toContain('… 60% · writing the fix')
    expect(JSON.parse(ok(['task', 'show', id, '--json']).stdout)).toMatchObject({ percent: 60, meta: { percent: '60' } })
    // Not a flag of the other commands.
    expect(fails(['task', 'ask', id, 'q', '--percent', '10']).stderr).toContain('--percent')
    // finish keeps it, like the progress line (the app only shows it while the agent works).
    ok(['task', 'finish', id, '--summary', 'Done'])
    expect(block(id).meta).toMatchObject({ state: 'done', progress: 'writing the fix', percent: '60' })
    // A new start clears it, with the progress.
    const other = queue('docs')
    ok(['task', 'start', other])
    ok(['task', 'report', other, '--percent', '30'])
    ok(['task', 'start', other, '--force'])
    expect(block(other).meta).not.toHaveProperty('percent')
    expect(JSON.parse(ok(['task', 'show', other, '--json']).stdout)).toMatchObject({ percent: null })
    // Pure: the rule.
    expect(cli.parseAgentPercent(' 40 % ')).toBe(40)
    expect(cli.parseAgentPercent('100')).toBe(100)
    expect(cli.parseAgentPercent('101')).toBeNull()
    expect(cli.parseAgentPercent(undefined)).toBeNull()
  })

  it('finish needs a report; on-finish check → done and the box checked', () => {
    const id = queue('login')
    ok(['task', 'start', id])
    const before = read('st.md')
    const none = fails(['task', 'finish', id])
    expect(none.stderr).toContain('A report is required to finish a task')
    expect(none.stderr).toContain(`noteflow task finish ${id} --file <report.md>`)
    expect(fails(['task', 'finish', id, '--summary', '   ']).stderr).toContain('The report is empty')
    expect(fails(['task', 'finish', id, '--summary', 'a', '--stdin']).stderr).toContain('only ONE of')
    expect(read('st.md')).toBe(before)
    const report = path.join(tmp, 'report.md')
    fs.writeFileSync(report, '## Done\r\n\r\n- fixed the redirect\r\n')
    const r = ok(['task', 'finish', id, '--file', report])
    expect(r.stdout).toContain(`Finished ${id}: done`)
    expect(r.stdout).toContain('Queue complete')
    expect(taskLines()[0]).toBe(`${TASKS[0].replace('[ ]', '[x]')} ${ROBOT}${id}:done`)
    expect(block(id).body).toBe('## Done\n\n- fixed the redirect')
    expect(block(id).meta.state).toBe('done')
    expect(block(id).meta.finishedAt).toBeDefined()
    const shown = JSON.parse(ok(['task', 'show', id, '--json']).stdout) as { state: string; checked: boolean; report: string; meta: Record<string, string> }
    expect(shown).toMatchObject({ state: 'done', checked: true, report: '## Done\n\n- fixed the redirect' })
    expect(ok(['task', 'show', id]).stdout).toContain('- fixed the redirect')
    // Done is done.
    expect(fails(['task', 'start', id]).stderr).toContain('already done')
    // report / finish / fail on it: "already done", never "Start it first" (start refuses it).
    for (const args of [['task', 'finish', id, '--summary', 'again'], ['task', 'report', id, 'more'], ['task', 'fail', id, 'x'], ['task', 'ask', id, 'q?']]) {
      const r = fails(args)
      expect(r.stderr, args.join(' ')).toContain(`Task ${id} is already done`)
      expect(r.stderr, args.join(' ')).not.toContain('Start it first')
    }
  })

  it('on-finish review → review, the box left alone; the flag beats settings.json, which beats the default (review)', () => {
    const a = queue('login')
    ok(['task', 'start', a, '--on-finish', 'review'])
    expect(ok(['task', 'finish', a, '--stdin'], { input: 'report from stdin\n' }).stdout).toContain("waiting for the user's review")
    expect(taskLines()[0]).toBe(`${TASKS[0]} ${ROBOT}${a}:review`)
    expect(block(a).body).toBe('report from stdin')
    // A task in review can be started again (the user asked for changes).
    ok(['task', 'start', a])
    expect(block(a).meta).toMatchObject({ state: 'running', onFinish: 'review' })

    setSettings({}) // nothing chosen → review, the default
    const b = queue('docs')
    ok(['task', 'start', b])
    expect(block(b).meta.onFinish).toBe('review')
    ok(['task', 'finish', b, '--summary', 'done'])
    expect(taskLines()[3]).toBe(`${TASKS[3]} ${ROBOT}${b}:review`)

    const c = queue('ship')
    ok(['task', 'start', c, '--on-finish', 'check'])
    ok(['task', 'finish', c, '--summary', 'shipped'])
    expect(taskLines()[5]).toBe(`- [x] Ship it ${ROBOT}${c}:done`)
    expect(fails(['task', 'start', a, '--on-finish', 'maybe']).stderr).toContain("--on-finish takes 'check' or 'review'")
  })

  it('a batch: only the first starts, the rest are queued, and finish / fail say which one is next', () => {
    const a = queue('login')
    const b = queue('docs')
    const c = queue('ship')
    ok(['task', 'start', b]) // b was started and failed earlier: it goes back to the queue
    ok(['task', 'fail', b, 'no time'])
    const r = ok(['task', 'start', a, b, c, '--on-finish', 'review'])
    expect(r.stdout).toContain(`TASK ${a}`)
    expect(r.stdout).toContain(`Remaining in this batch (queued, one at a time): ${b}, ${c}`)
    expect(list().map((t) => [t.id, t.state])).toEqual([[a, 'running'], [b, 'queued'], [c, 'queued']])
    for (const id of [a, b, c]) expect(block(id).meta).toMatchObject({ batch: `${a},${b},${c}`, onFinish: 'review' })
    expect(ok(['task', 'finish', a, '--summary', 'one']).stdout).toContain(`Next: noteflow task start ${b}`)
    const second = ok(['task', 'start', b])
    expect(second.stdout).toContain(`Remaining in this batch (queued, one at a time): ${c}`)
    expect(ok(['task', 'fail', b, 'blocked by the API']).stdout).toContain(`Next: noteflow task start ${c}`)
    expect(block(b).meta).toMatchObject({ state: 'failed', failReason: 'blocked by the API' })
    expect(taskLines()[3]).toBe(`${TASKS[3]} ${ROBOT}${b}:failed`)
    ok(['task', 'start', c])
    expect(ok(['task', 'finish', c, '--summary', 'three']).stdout).toContain('Queue complete')
    expect(taskLines()[5]).toBe(`${TASKS[5]} ${ROBOT}${c}:review`) // the batch keeps its on-finish
    // A failed task can be started again.
    ok(['task', 'start', b])
    expect(block(b).meta).not.toHaveProperty('failReason')
  })

  it('dismiss removes the marker and the block, not the checkbox; the file goes with its last block', () => {
    const a = queue('login')
    const b = queue('docs')
    ok(['task', 'start', a])
    ok(['task', 'finish', a, '--summary', 'ok'])
    ok(['task', 'dismiss', a])
    expect(taskLines()[0]).toBe(TASKS[0].replace('[ ]', '[x]'))
    expect(blocks().map((x) => x.id)).toEqual([b])
    ok(['task', 'dismiss', b])
    expect(taskLines()[3]).toBe(TASKS[3])
    expect(fs.existsSync(file(AGENT_MD))).toBe(false)
    expect(ok(['task', 'list']).stdout).toContain('No agent tasks')
  })

  it('an unknown id fails with "Did you mean"', () => {
    const id = queue('login')
    const typo = id.slice(0, 4) + (id[4] === 'z' ? 'y' : 'z')
    const r = fails(['task', 'show', typo, '--json'])
    expect(r.stderr).toContain(`No task found: "${typo}". Did you mean "${id}"?`)
    expect(JSON.parse(r.stdout)).toMatchObject({ code: 'task_not_found', id: typo, suggestions: [id] })
    expect(fails(['task', 'finish', 'nope', '--summary', 'x']).stderr).toContain('No task found: "nope"')
    expect(fails(['task', 'frobnicate']).stderr).toContain('Usage: noteflow task list|queue|next|start')
    expect(fails(['task', 'list', '--dry-run']).stderr).toContain("Flag --dry-run is not supported by 'task list'")
  })

  it('a state this version does not know is never overwritten', () => {
    const id = queue('login')
    fs.writeFileSync(file('st.md'), read('st.md').replace(`${id}:queued`, `${id}:paused-by-app`))
    const before = read('st.md')
    for (const args of [['start', id], ['report', id, 'x'], ['ask', id, 'x'], ['fail', id, 'x'], ['finish', id, '--summary', 'x']]) {
      expect(fails(['task', ...args]).stderr).toContain('which this CLI version does not know')
    }
    expect(read('st.md')).toBe(before)
    expect(list()[0]).toMatchObject({ id, state: 'paused-by-app' })
  })

  it('marker without a block, or block without its marker: repaired, not an error', () => {
    // A marker typed (or merged) with no block: the next write creates it.
    fs.writeFileSync(file('st.md'), read('st.md').replace('- [ ] Ship it', `- [ ] Ship it ${ROBOT}zz9zz:queued`))
    expect(list().map((t) => t.id)).toEqual(['zz9zz'])
    ok(['task', 'start', 'zz9zz'])
    expect(block('zz9zz').meta).toMatchObject({ title: 'Ship it', section: 'Tasks', state: 'running' })
    // The line says one thing and the block another (a sync merge): the line wins.
    patchBlock('zz9zz', 'state', 'done')
    ok(['task', 'report', 'zz9zz', 'still here'])
    expect(block('zz9zz').meta.state).toBe('running')
    // The marker removed by hand: the task is found again by its text and re-marked.
    fs.writeFileSync(file('st.md'), read('st.md').replace(` ${ROBOT}zz9zz:running`, ''))
    expect(ok(['task', 'show', 'zz9zz']).stdout).toContain('its line is no longer in the note')
    ok(['task', 'report', 'zz9zz', 'back'])
    expect(taskLines()[5]).toBe(`- [ ] Ship it ${ROBOT}zz9zz:running`)
    expect(block('zz9zz').meta).not.toHaveProperty('orphanedAt')
  })

  it('a marker on a line that no longer reads as a task keeps its report: no orphan, nothing deleted', () => {
    const lines = [
      `- Alpha ${ROBOT}aaaa1:done`, // the box was removed
      `> - [ ] Beta ${ROBOT}bbbb2:running`, // quoted
      'see ```npm test``` inline',
      `- [ ] Gamma ${ROBOT}cccc3:queued`, // a real task after an inline ``` run
      '```', // a fence left open hides the rest from the task reader
      `- [ ] Delta ${ROBOT}dddd4:queued`,
    ]
    fs.writeFileSync(file('st.md'), lines.join('\n'))
    const doc = serializeAgentDoc(['aaaa1', 'bbbb2', 'cccc3', 'dddd4'].map((id) => ({ id, meta: { title: id, state: 'done' }, body: `report of ${id}` })))
    fs.writeFileSync(file(AGENT_MD), doc)
    ok(['touch', TITLE])
    ok(['set', TITLE, 'Notes', '--text', 'another write'])
    expect(read(AGENT_MD)).toBe(doc)
    expect(list().map((t) => t.id)).toEqual(['cccc3']) // only the real task line is acted on
    ok(['task', 'start', 'cccc3'])
    expect(blocks().map((b) => [b.id, b.meta.orphanedAt])).toEqual([['aaaa1', undefined], ['bbbb2', undefined], ['cccc3', undefined], ['dddd4', undefined]])
    expect(ok(['task', 'show', 'aaaa1']).stdout).toContain('report of aaaa1')
    // A fresh id never reuses one the note still mentions.
    fs.writeFileSync(file('st.md'), read('st.md') + '\n```\n- [ ] Epsilon')
    expect(['aaaa1', 'bbbb2', 'cccc3', 'dddd4']).not.toContain(queue('Epsilon'))
    // Really gone from the note: only then it is an orphan.
    fs.writeFileSync(file('st.md'), read('st.md').replace(`- Alpha ${ROBOT}aaaa1:done\n`, ''))
    ok(['touch', TITLE])
    expect(block('aaaa1').meta.orphanedAt).toBeDefined()
    expect(block('bbbb2').meta).not.toHaveProperty('orphanedAt')
  })

  it('the same id on two lines of one note (a sync merge): a clear error, and dismiss is the way out', () => {
    const id = queue('login')
    ok(['task', 'start', id])
    const running = `${TASKS[0]} ${ROBOT}${id}:running`
    const merged = ['> ⚠️ Sync conflict — version from PC (CLI):', '', running, '', '> ⚠️ Sync conflict — version already synced:', '',
      `${TASKS[0]} ${ROBOT}${id}:waiting`, '', '> ⚠️ End of sync conflict']
    fs.writeFileSync(file('st.md'), read('st.md').replace(running, merged.join('\n')))
    const before = read('st.md')
    for (const args of [['report', id, 'x'], ['finish', id, '--summary', 'x'], ['start', id, '--force'], ['show', id]]) {
      const r = fails(['task', ...args])
      expect(r.stderr).toContain(`Task id ${id} is on 2 lines of "Plan"`)
      expect(r.stderr).toContain(`noteflow task dismiss ${id}`)
      expect(r.stderr).not.toContain('--title')
    }
    expect(read('st.md')).toBe(before)
    ok(['task', 'dismiss', id])
    expect(read('st.md')).not.toContain(ROBOT)
    expect(taskLines().filter((l) => l === TASKS[0])).toHaveLength(2) // both lines stay, unmarked
    expect(fs.existsSync(file(AGENT_MD))).toBe(false)
  })

  it('finish --stdin reads the notes AFTER the report arrived: nothing written meanwhile is lost', async () => {
    const id = queue('login')
    ok(['task', 'start', id])
    const child = spawn(process.execPath, [CLI, 'task', 'finish', id, '--stdin'], {
      cwd: workDir,
      env: {
        ...process.env,
        APPDATA: path.join(tmp, 'config'),
        XDG_CONFIG_HOME: path.join(tmp, 'config'),
        NOTEFLOW_NOTES_DIR: notesDir,
        NOTEFLOW_NO_APP_CHECK: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const exited = new Promise<number | null>((resolve) => child.on('close', resolve))
    await new Promise((resolve) => setTimeout(resolve, 2500)) // it is up and waiting on stdin
    // Meanwhile: another task is queued, a line is added by hand and this task reports.
    const other = queue('docs')
    ok(['add', '- [ ] Added meanwhile', '--title', TITLE, '--section', 'Tasks'])
    ok(['task', 'report', id, 'written while finish waited'])
    child.stdin.end('the report\n')
    expect(await exited).toBe(0)
    expect(taskLines()).toContain(`${TASKS[0].replace('[ ]', '[x]')} ${ROBOT}${id}:done`)
    expect(taskLines()).toContain(`${TASKS[3]} ${ROBOT}${other}:queued`)
    expect(taskLines()).toContain('- [ ] Added meanwhile')
    expect(block(other).meta.state).toBe('queued')
    expect(block(id)).toMatchObject({ body: 'the report', meta: { state: 'done', progress: 'written while finish waited' } })
  })

  it('the ⚠️ markers a sync merge left in a header of agent.md go with the next write of the note', () => {
    const id = queue('login')
    const stamp = (at: string) => `orphanedAt: ${at}`
    const conflicted = read(AGENT_MD).replace('---', ['> ⚠️ Sync conflict — version from PC (CLI):', '', stamp('2026-11-01T00:00:00.000Z'), '',
      '> ⚠️ Sync conflict — version already synced:', '', 'progress: from the other machine', '', '> ⚠️ End of sync conflict', '---'].join('\n'))
    fs.writeFileSync(file(AGENT_MD), conflicted)
    expect(list()[0]).toMatchObject({ id, state: 'queued', progress: 'from the other machine' }) // read through the markers
    ok(['touch', TITLE])
    expect(read(AGENT_MD)).not.toContain('⚠️')
    expect(block(id).meta).toMatchObject({ state: 'queued', progress: 'from the other machine' })
    expect(block(id).meta).not.toHaveProperty('orphanedAt') // the id is alive
    expect(read(AGENT_MD)).toBe(serializeAgentDoc(blocks()))
  })

  it('touch / set / add / section rename / rename keep agent.md (other loose .md files still go)', () => {
    const id = queue('login')
    ok(['task', 'start', id])
    const before = read(AGENT_MD)
    fs.writeFileSync(file('loose.md'), 'temp')
    ok(['touch', TITLE])
    expect(fs.existsSync(file('loose.md'))).toBe(false)
    ok(['set', TITLE, 'Notes', '--text', 'rewritten'])
    ok(['add', 'one more line', '--title', TITLE, '--section', 'Notes'])
    ok(['section', 'rename', TITLE, 'Notes', 'Diary'])
    ok(['section', 'add', TITLE, 'Extra'])
    ok(['section', 'delete', TITLE, 'Extra', '--yes'])
    ok(['rename', TITLE, 'Plan B'])
    ok(['favorite', 'Plan B'])
    expect(read(AGENT_MD)).toBe(before)
    // …and it is never a section.
    const sections = JSON.parse(ok(['sections', 'Plan B', '--json']).stdout) as { name: string }[]
    expect(sections.map((s) => s.name)).toEqual(['Diary', 'Tasks'])
    expect(read(NOTE_MD)).not.toContain(AGENT_MD)
    expect(list()[0]).toMatchObject({ id, state: 'running' })
  })

  it('orphans: a block whose task line is gone is stamped by the next write, removed 7 days later', () => {
    const a = queue('login')
    const b = queue('docs')
    // The user deletes the first task (any CLI write of the note notices).
    ok(['set', TITLE, 'Tasks', '--text', taskLines().slice(3).join('\n')])
    const stamped = block(a).meta.orphanedAt
    expect(Date.parse(stamped)).toBeGreaterThan(Date.parse(T0))
    expect(block(b).meta).not.toHaveProperty('orphanedAt')
    ok(['touch', TITLE])
    expect(block(a).meta.orphanedAt).toBe(stamped) // only the first time
    // The line comes back (an undo): the stamp goes.
    ok(['set', TITLE, 'Tasks', '--text', [`- [ ] Fix the login ${ROBOT}${a}:queued`, ...taskLines()].join('\n')])
    expect(block(a).meta).not.toHaveProperty('orphanedAt')
    // Gone again, and 7 days pass.
    ok(['set', TITLE, 'Tasks', '--text', taskLines().slice(1).join('\n')])
    patchBlock(a, 'orphanedAt', new Date(Date.now() - 6 * DAY).toISOString())
    ok(['touch', TITLE])
    expect(blocks().map((x) => x.id)).toEqual([a, b])
    patchBlock(a, 'orphanedAt', new Date(Date.now() - 8 * DAY).toISOString())
    ok(['task', 'list']) // a read never cleans up
    expect(blocks().map((x) => x.id)).toEqual([a, b])
    ok(['touch', TITLE])
    expect(blocks().map((x) => x.id)).toEqual([b])
    // The last block orphaned and expired: the file goes.
    ok(['set', TITLE, 'Tasks', '--text', '- [ ] nothing marked'])
    patchBlock(b, 'orphanedAt', new Date(Date.now() - 8 * DAY).toISOString())
    ok(['touch', TITLE])
    expect(fs.existsSync(file(AGENT_MD))).toBe(false)
  })

  it('CRLF section files keep their line endings: only the task line changes', () => {
    const crlf = TASKS.join('\r\n') + '\r\n'
    fs.writeFileSync(file('st.md'), crlf)
    const id = queue('login')
    expect(read('st.md')).toBe(crlf.replace(TASKS[0], `${TASKS[0]} ${ROBOT}${id}:queued`))
    ok(['task', 'start', id])
    ok(['task', 'finish', id, '--summary', 'ok'])
    expect(read('st.md')).toBe(crlf.replace(TASKS[0], `${TASKS[0].replace('[ ]', '[x]')} ${ROBOT}${id}:done`))
    ok(['task', 'dismiss', id])
    expect(read('st.md')).toBe(crlf.replace(TASKS[0], TASKS[0].replace('[ ]', '[x]')))
    // LF files stay LF, with or without a final newline.
    fs.writeFileSync(file('st.md'), TASKS.join('\n') + '\n')
    const other = queue('docs')
    expect(read('st.md')).toBe((TASKS.join('\n') + '\n').replace(TASKS[3], `${TASKS[3]} ${ROBOT}${other}:queued`))
    expect(read('sn.md')).toBe('free text') // the other section file is not rewritten
  })

  it('ids are unique across notes, and list filters by note / section / state', () => {
    ok(['new', 'Other', '--section', 'Todo'])
    ok(['set', 'Other', 'Todo', '--text', '- [ ] elsewhere'])
    const a = queue('login')
    const b = (JSON.parse(ok(['task', 'queue', 'Other', 'Todo', '--match', 'elsewhere', '--json']).stdout) as { id: string }).id
    expect(a).not.toBe(b)
    expect(list().map((t) => t.id).sort()).toEqual([a, b].sort())
    expect(list('--title', 'Other').map((t) => t.id)).toEqual([b])
    expect(list('--title', TITLE, '--section', 'Tasks').map((t) => t.id)).toEqual([a])
    expect(list('--section', 'todo').map((t) => t.id)).toEqual([b])
    ok(['task', 'start', b])
    expect(list('--state', 'queued').map((t) => t.id)).toEqual([a])
    expect(fails(['task', 'list', '--state', 'sleeping']).stderr).toContain('Unknown state "sleeping"')
    const human = ok(['task', 'list']).stdout
    expect(human).toContain(`${a}  ${'queued'.padEnd(11)}  Plan › Tasks: Fix the login`)
    expect(human).toContain(`${b}  ${'running'.padEnd(11)}  Other › Todo: elsewhere`)
  })

  it('git facts: branch and HEAD at start, commits and files changed at finish (same repo only)', () => {
    const git = (args: string[], cwd: string) => spawnSync('git', args, { cwd, encoding: 'utf-8' })
    const repo = path.join(tmp, 'repo')
    fs.mkdirSync(repo)
    if (git(['init', '-q', '-b', 'work'], repo).status !== 0) return // no git here: nothing to check
    const commit = (name: string) => {
      fs.writeFileSync(path.join(repo, name), name)
      git(['add', '.'], repo)
      expect(git(['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', name], repo).status).toBe(0)
    }
    commit('a.txt')
    const head = git(['rev-parse', 'HEAD'], repo).stdout.trim()
    const a = queue('login')
    ok(['task', 'start', a], { cwd: repo })
    expect(block(a).meta).toMatchObject({ gitBranch: 'work', gitStartHead: head })
    commit('b.txt')
    commit('c.txt')
    ok(['task', 'finish', a, '--summary', 'ok'], { cwd: repo })
    expect(block(a).meta).toMatchObject({ gitCommits: '2', gitFilesChanged: '2', gitEndHead: git(['rev-parse', 'HEAD'], repo).stdout.trim() })
    // Finished from somewhere else: the git facts are left out, the finish still works.
    const b = queue('docs')
    ok(['task', 'start', b], { cwd: repo })
    ok(['task', 'finish', b, '--summary', 'ok'])
    expect(block(b).meta.state).toBe('done')
    expect(block(b).meta).not.toHaveProperty('gitEndHead')
    expect(block(b).meta).not.toHaveProperty('gitCommits')
  })

  it('git facts: uncommitted changes written during the task count as files changed; older dirt does not', () => {
    const git = (args: string[], cwd: string) => spawnSync('git', args, { cwd, encoding: 'utf-8' })
    const repo = path.join(tmp, 'repo')
    fs.mkdirSync(repo)
    if (git(['init', '-q', '-b', 'work'], repo).status !== 0) return // no git here: nothing to check
    const commitAll = (msg: string, what = '.') => {
      git(['add', what], repo)
      expect(git(['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', msg], repo).status).toBe(0)
    }
    for (const name of ['a.txt', 'b.txt', 'old.txt', 'gone.txt']) fs.writeFileSync(path.join(repo, name), name)
    commitAll('base')
    // Dirty before the task starts (someone else's work in a shared tree): written long ago.
    fs.writeFileSync(path.join(repo, 'old.txt'), 'edited before')
    const past = new Date(Date.now() - 60 * 60 * 1000)
    fs.utimesSync(path.join(repo, 'old.txt'), past, past)
    const a = queue('login')
    ok(['task', 'start', a], { cwd: repo })
    // During the task: one commit (b.txt), then uncommitted work — a modified, b again, a new file in a
    // new folder, a deletion (no time to compare: left out).
    fs.writeFileSync(path.join(repo, 'b.txt'), 'b2')
    commitAll('b', 'b.txt') // old.txt stays dirty
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a2')
    fs.writeFileSync(path.join(repo, 'b.txt'), 'b3')
    fs.mkdirSync(path.join(repo, 'src'))
    fs.writeFileSync(path.join(repo, 'src', 'new file.ts'), 'x')
    fs.rmSync(path.join(repo, 'gone.txt'))
    ok(['task', 'finish', a, '--summary', 'ok'], { cwd: repo })
    expect(block(a).meta).toMatchObject({ gitCommits: '1', gitFilesChanged: '3' }) // b (committed + dirty), a, src/new file.ts

    // No commit at all: only the uncommitted work counts.
    commitAll('clean slate')
    const head = git(['rev-parse', 'HEAD'], repo).stdout.trim()
    const c = queue('docs')
    ok(['task', 'start', c], { cwd: repo })
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a3')
    ok(['task', 'finish', c, '--summary', 'ok'], { cwd: repo })
    expect(block(c).meta).toMatchObject({ gitCommits: '0', gitFilesChanged: '1', gitEndHead: head })

    // A move staged with intent-to-add is a rename in the Y column (` R moved.txt\0orig.txt\0`): its
    // origin path must not be read as an entry of its own ("orig.txt" → "g.txt", here an ignored file
    // written during the task, which would count as a ghost).
    fs.writeFileSync(path.join(repo, 'orig.txt'), 'some content long enough to be detected as a rename\n')
    fs.writeFileSync(path.join(repo, '.gitignore'), 'g.txt\n')
    commitAll('orig')
    const d = queue('Ship')
    ok(['task', 'start', d], { cwd: repo })
    fs.writeFileSync(path.join(repo, 'g.txt'), 'ignored')
    fs.renameSync(path.join(repo, 'orig.txt'), path.join(repo, 'moved.txt'))
    git(['add', '-N', 'moved.txt'], repo)
    ok(['task', 'finish', d, '--summary', 'ok'], { cwd: repo })
    expect(block(d).meta).toMatchObject({ gitCommits: '0', gitFilesChanged: '1' })
  })

  it('briefing: the report in the app language; in a git repo, commit or not per agentTasks.commit', () => {
    const git = (args: string[], cwd: string) => spawnSync('git', args, { cwd, encoding: 'utf-8' })
    const COMMIT = 'This folder is a git repository: before you finish, commit your changes'
    const NO_COMMIT = 'This folder is a git repository: do not commit.'
    // Outside a repo: the language line, no word about commits.
    fs.mkdirSync(path.join(tmp, 'config', 'noteflow'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config', 'noteflow', 'settings.json'), JSON.stringify({ language: 'es', agentTasks: { commit: true } }))
    const a = queue('login')
    const out = ok(['task', 'start', a]).stdout
    expect(out).toContain('- Write the report, the progress lines and the questions in Spanish')
    expect(out).not.toContain('git repository')
    ok(['task', 'fail', a, 'later'])
    const repo = path.join(tmp, 'repo')
    fs.mkdirSync(repo)
    if (git(['init', '-q', '-b', 'work'], repo).status !== 0) return // no git here: nothing more to check
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a')
    git(['add', '.'], repo)
    expect(git(['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'a'], repo).status).toBe(0)
    // In a repo, commit: true → commit.
    const inRepo = ok(['task', 'start', a], { cwd: repo }).stdout
    expect(inRepo).toContain(COMMIT)
    expect(inRepo).not.toContain(NO_COMMIT)
    ok(['task', 'fail', a, 'later'], { cwd: repo })
    // The default (no `commit`, English): leave them uncommitted.
    setSettings({ onFinish: 'check' })
    const byDefault = ok(['task', 'start', a], { cwd: repo }).stdout
    expect(byDefault).toContain(NO_COMMIT)
    expect(byDefault).not.toContain(COMMIT)
    expect(byDefault).toMatch(/- Write the report, the progress lines and the questions in (English|Spanish)/)
  })

  it('help: its own topic and an entry in the general help', () => {
    const topic = ok(['help', 'task']).stdout
    for (const sub of ['list', 'queue', 'next', 'start', 'report', 'ask', 'finish', 'fail', 'show', 'dismiss']) {
      expect(topic).toContain(`noteflow task ${sub}`)
    }
    expect(topic).toContain('agentTasks.staleMinutes')
    expect(ok(['help']).stdout).toContain("Agent task commands (checklist tasks run by an AI agent — 'noteflow help task'):")
  })
})

// ── agent.md and the sync (in-memory GitHub) ──────────────────────────────────

describe('agent.md travels with the note (GitHub)', () => {
  const OWNER = 'me'
  const REPO = 'notes'
  const DIR = 'plan-abc12345'
  const T0 = '2026-10-30T18:00:00.000Z'
  const T1 = '2099-01-01T00:00:00.000Z'
  const savedEnv = { ...process.env }
  const savedArgv = [...process.argv]
  let tmp: string
  let notesDir: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any
  let remote: Map<string, string>
  let blobs: Map<string, string>
  let failBlobs: boolean
  let logs: string[]

  const note =(updated: string, tasks: string): DiskNote => ({
    id: 'abc12345', title: 'Plan', tags: [], created: T0, updated,
    sections: [{ id: 'st', name: 'Tasks', content: tasks }],
  })
  const remoteSave = (n: DiskNote, extra: Record<string, string> = {}) => {
    for (const rel of [...remote.keys()]) if (rel.startsWith(`${DIR}/`)) remote.delete(rel)
    const files = { ...serializeNoteFolder(n, { preserveUpdated: true }).files, ...extra }
    for (const [name, content] of Object.entries(files)) {
      remote.set(`${DIR}/${name}`, content)
      blobs.set(gitBlobSha(content), content)
    }
  }
  const local = (name: string) => path.join(notesDir, DIR, name)
  const agentDoc = (id: string, state: string) => serializeAgentDoc([{ id, meta: { title: 'Fix it', section: 'Tasks', state }, body: 'report' }])

  function handle(method: string, endpoint: string, body: Record<string, unknown> | undefined): { status: number; json: unknown } {
    const p = new URL(endpoint, 'https://api.github.com').pathname
    const base = `/repos/${OWNER}/${REPO}`
    if (p === base && method === 'GET') return { status: 200, json: { default_branch: 'main' } }
    if (p === `${base}/git/trees/main`) {
      return { status: 200, json: { tree: [...remote].map(([rel, c]) => ({ path: rel, type: 'blob', sha: gitBlobSha(c) })) } }
    }
    if (p.startsWith(`${base}/git/blobs/`)) {
      // Every content the repo ever held, by blob sha (the base of a diff3).
      const content = failBlobs ? undefined : blobs.get(p.slice(`${base}/git/blobs/`.length))
      if (content === undefined) return { status: 404, json: { message: 'Not Found' } }
      return { status: 200, json: { encoding: 'base64', content: Buffer.from(content).toString('base64') } }
    }
    if (p.startsWith(`${base}/contents/`)) {
      const rel = p.slice(`${base}/contents/`.length).split('/').map(decodeURIComponent).join('/')
      const cur = remote.get(rel)
      const curSha = cur === undefined ? undefined : gitBlobSha(cur)
      if (method === 'GET') {
        if (cur === undefined) return { status: 404, json: { message: 'Not Found' } }
        return { status: 200, json: { sha: curSha, size: Buffer.byteLength(cur), encoding: 'base64', content: Buffer.from(cur).toString('base64') } }
      }
      if (method === 'PUT') {
        if (body?.sha !== curSha) return { status: 409, json: { message: 'sha mismatch' } }
        remote.set(rel, Buffer.from(String(body?.content), 'base64').toString('utf-8'))
        blobs.set(gitBlobSha(remote.get(rel)!), remote.get(rel)!)
        return { status: 200, json: { content: { sha: gitBlobSha(remote.get(rel)!) } } }
      }
      if (method === 'DELETE') {
        if (cur === undefined || body?.sha !== curSha) return { status: 409, json: { message: 'sha mismatch' } }
        remote.delete(rel)
        return { status: 200, json: {} }
      }
    }
    return { status: 404, json: { message: `unexpected ${method} ${p}` } }
  }

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-agent-sync-'))
    notesDir = path.join(tmp, 'notes')
    const configDir = path.join(tmp, 'config')
    fs.mkdirSync(path.join(configDir, 'noteflow'), { recursive: true })
    fs.mkdirSync(notesDir)
    process.env.APPDATA = configDir
    process.env.XDG_CONFIG_HOME = configDir
    process.env.NOTEFLOW_NOTES_DIR = notesDir
    process.env.NOTEFLOW_NO_APP_CHECK = '1'
    fs.writeFileSync(path.join(configDir, 'noteflow', 'settings.json'), JSON.stringify({
      language: 'en',
      githubSync: { enabled: true, owner: OWNER, repo: REPO, encryptedToken: Buffer.from('ghp_test').toString('base64') },
    }))
    delete require.cache[CLI]
    mod = require(CLI)
    remote = new Map()
    blobs = new Map()
    failBlobs = false
    vi.spyOn(https, 'request').mockImplementation(((opts: { method: string; path: string }, cb: (res: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & Record<string, unknown>
      let payload = ''
      req.setTimeout = () => req
      req.write = (chunk: string) => { payload += chunk }
      req.end = () => {
        const r = handle(opts.method, opts.path, payload ? JSON.parse(payload) : undefined)
        const res = new EventEmitter() as EventEmitter & { statusCode: number }
        res.statusCode = r.status
        queueMicrotask(() => {
          cb(res)
          res.emit('data', JSON.stringify(r.json))
          res.emit('end')
        })
      }
      return req
    }) as never)
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    remoteSave(note(T0, '- [ ] Fix it\n- [ ] Other'))
    await mod.cmdPull()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...savedEnv }
    process.argv = [...savedArgv]
    delete require.cache[CLI]
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  const queuedId = () => /\u{1F916}([a-z0-9]{5}):/u.exec(fs.readFileSync(local('st.md'), 'utf-8'))![1]

  it('a task command uploads the line, note.md and agent.md; dismissing the last task deletes it there too', async () => {
    await mod.cmdTask(['queue', 'Plan', 'Tasks'], { match: 'Fix' })
    const id = queuedId()
    expect(logs).toContain('  Synced to GitHub')
    expect(remote.get(`${DIR}/st.md`)).toBe(`- [ ] Fix it ${ROBOT}${id}:queued\n- [ ] Other`)
    expect(remote.get(`${DIR}/${AGENT_MD}`)).toBe(fs.readFileSync(local(AGENT_MD), 'utf-8'))
    expect(remote.get(`${DIR}/${NOTE_MD}`)).toBe(fs.readFileSync(local(NOTE_MD), 'utf-8'))
    expect(remote.get(`${DIR}/${NOTE_MD}`)).not.toContain(AGENT_MD)
    await mod.cmdTask(['start', id], {})
    expect(parseAgentDoc(remote.get(`${DIR}/${AGENT_MD}`)!)[0].meta.state).toBe('running')
    await mod.cmdTask(['dismiss', id], {})
    expect(fs.existsSync(local(AGENT_MD))).toBe(false)
    expect(remote.has(`${DIR}/${AGENT_MD}`)).toBe(false)
    expect(remote.get(`${DIR}/st.md`)).toBe('- [ ] Fix it\n- [ ] Other')
  })

  it('the orphan bookkeeping of another command (set) goes up with it', async () => {
    await mod.cmdTask(['queue', 'Plan', 'Tasks'], { match: 'Fix' })
    const id = queuedId()
    process.argv = [savedArgv[0], CLI, 'set', 'Plan', 'Tasks', '--text', '- [ ] rewritten'] // the task line is gone
    await mod.main()
    expect(remote.get(`${DIR}/st.md`)).toBe('- [ ] rewritten')
    const block = parseAgentDoc(remote.get(`${DIR}/${AGENT_MD}`)!).find((b) => b.id === id)!
    expect(block.meta.orphanedAt).toBeDefined()
  })

  it('pull brings agent.md down with the note', async () => {
    remoteSave(note(T1, `- [ ] Fix it ${ROBOT}k3f9a:review\n- [ ] Other`), { [AGENT_MD]: agentDoc('k3f9a', 'review') })
    await mod.cmdPull()
    expect(fs.readFileSync(local(AGENT_MD), 'utf-8')).toBe(agentDoc('k3f9a', 'review'))
    expect(fs.readFileSync(local(NOTE_MD), 'utf-8')).not.toContain(AGENT_MD)
  })

  it('pull never deletes a local agent.md GitHub does not have yet; push then uploads it', async () => {
    fs.writeFileSync(local(AGENT_MD), agentDoc('k3f9a', 'queued')) // written here, not uploaded
    fs.writeFileSync(local('loose.md'), 'a section file GitHub dropped')
    remoteSave(note(T1, '- [ ] Fix it (edited on the PC)\n- [ ] Other'))
    await mod.cmdPull()
    expect(fs.readFileSync(local('st.md'), 'utf-8')).toBe('- [ ] Fix it (edited on the PC)\n- [ ] Other') // the pull did apply
    expect(fs.existsSync(local('loose.md'))).toBe(false)
    expect(fs.readFileSync(local(AGENT_MD), 'utf-8')).toBe(agentDoc('k3f9a', 'queued'))
    await mod.cmdPush()
    expect(remote.get(`${DIR}/${AGENT_MD}`)).toBe(agentDoc('k3f9a', 'queued'))
  })

  it('a note merged on push: agent.md deleted on GitHub but changed here stays and goes up again — no conflict copy', async () => {
    remoteSave(note(T1, `- [ ] Fix it ${ROBOT}k3f9a:running\n- [ ] Other`), { [AGENT_MD]: agentDoc('k3f9a', 'running') })
    await mod.cmdPull() // synced: every file has a base
    // Elsewhere: another line edited, and agent.md dropped from the folder.
    remoteSave(note('2099-02-01T00:00:00.000Z', `- [ ] Fix it ${ROBOT}k3f9a:running\n- [ ] Other (edited)`))
    // Here: the report changed and never went up; then a command pushes only note.md.
    fs.writeFileSync(local(AGENT_MD), agentDoc('k3f9a', 'waiting'))
    const { conflicted } = await mod.syncPushNoteFiles(DIR, [NOTE_MD])
    expect(conflicted).toBe(true)
    expect(fs.readdirSync(notesDir).filter((d) => d !== DIR && fs.statSync(path.join(notesDir, d)).isDirectory())).toEqual([])
    expect(fs.readFileSync(local(AGENT_MD), 'utf-8')).toBe(agentDoc('k3f9a', 'waiting'))
    expect(remote.get(`${DIR}/${AGENT_MD}`)).toBe(agentDoc('k3f9a', 'waiting'))
    expect(fs.readFileSync(local('st.md'), 'utf-8')).toContain('Other (edited)')
    expect(fs.readFileSync(local(NOTE_MD), 'utf-8')).not.toContain(AGENT_MD) // still not a section
  })

  describe('agent.md changed on both sides', () => {
    const LINES = `- [ ] Fix it ${ROBOT}k3f9a:running\n- [ ] Other ${ROBOT}bbbbb:queued`
    const one = (progress: string, extra: Record<string, string> = {}): Block => ({ id: 'k3f9a', meta: { title: 'Fix it', state: 'running', progress, ...extra }, body: '' })
    const two: Block = { id: 'bbbbb', meta: { title: 'Other', state: 'queued' }, body: '' }
    const noCopy = () => expect(fs.readdirSync(notesDir).filter((d) => d !== DIR && fs.statSync(path.join(notesDir, d)).isDirectory())).toEqual([])
    const announced = () => logs.some((l) => l.includes('Merged with conflicts'))

    beforeEach(async () => {
      remoteSave(note(T1, LINES), { [AGENT_MD]: serializeAgentDoc([one('p0')]) })
      await mod.cmdPull() // synced: every file has a base
    })

    it('different lines (diff3 with the base blob): one merged file, uploaded, nothing announced', async () => {
      remoteSave(note('2099-02-01T00:00:00.000Z', LINES), { [AGENT_MD]: serializeAgentDoc([one('p0'), two]) }) // a block added elsewhere
      fs.writeFileSync(local(AGENT_MD), serializeAgentDoc([one('local progress')])) // a report here
      await mod.syncPushNoteFiles(DIR, [NOTE_MD, AGENT_MD])
      const merged = fs.readFileSync(local(AGENT_MD), 'utf-8')
      expect(parseAgentDoc(merged)).toEqual([one('local progress'), two])
      expect(merged).toBe(serializeAgentDoc([one('local progress'), two]))
      expect(remote.get(`${DIR}/${AGENT_MD}`)).toBe(merged)
      expect(announced()).toBe(false)
      noCopy()
    })

    it('the same header line: the ⚠️ markers stay inside agent.md, are NOT announced, and the reader resolves them', async () => {
      remoteSave(note('2099-02-01T00:00:00.000Z', LINES), { [AGENT_MD]: serializeAgentDoc([one('remote progress')]) })
      fs.writeFileSync(local(AGENT_MD), serializeAgentDoc([one('local progress')]))
      await mod.syncPushNoteFiles(DIR, [NOTE_MD, AGENT_MD])
      const merged = fs.readFileSync(local(AGENT_MD), 'utf-8')
      expect(merged).toContain('⚠️')
      expect(remote.get(`${DIR}/${AGENT_MD}`)).toBe(merged)
      expect(announced()).toBe(false) // the user never sees that file
      expect(logs).toContain('  Synced to GitHub')
      expect(parseAgentDoc(merged)).toEqual([one('remote progress')]) // the synced version wins, on every machine
      noCopy()
      // The next write of the note leaves the file clean again.
      process.argv = [savedArgv[0], CLI, 'touch', 'Plan']
      await mod.main()
      expect(fs.readFileSync(local(AGENT_MD), 'utf-8')).toBe(serializeAgentDoc([one('remote progress')]))
      expect(remote.get(`${DIR}/${AGENT_MD}`)).toBe(serializeAgentDoc([one('remote progress')]))
    })

    it('no base blob to be had (two-way union): both blocks survive, still no copy and no notice', async () => {
      failBlobs = true
      remoteSave(note('2099-02-01T00:00:00.000Z', LINES), { [AGENT_MD]: serializeAgentDoc([one('p0'), two]) })
      fs.writeFileSync(local(AGENT_MD), serializeAgentDoc([one('p0', { question: 'asked here' })]))
      await mod.syncPushNoteFiles(DIR, [NOTE_MD, AGENT_MD])
      const merged = parseAgentDoc(fs.readFileSync(local(AGENT_MD), 'utf-8'))
      expect(merged.map((b) => b.id).sort()).toEqual(['bbbbb', 'k3f9a'])
      expect(merged.find((b) => b.id === 'k3f9a')!.meta).toMatchObject({ progress: 'p0', question: 'asked here' })
      expect(remote.get(`${DIR}/${AGENT_MD}`)).toBe(fs.readFileSync(local(AGENT_MD), 'utf-8'))
      expect(announced()).toBe(false)
      noCopy()
    })

    it('dismissing the last task does not delete an agent.md that changed on GitHub since the last pull', async () => {
      fs.writeFileSync(local('st.md'), `- [ ] Fix it ${ROBOT}k3f9a:running\n- [ ] Other`)
      const theirs = serializeAgentDoc([one('p0'), two]) // another machine added a block and pushed only that file
      remote.set(`${DIR}/${AGENT_MD}`, theirs)
      await mod.cmdTask(['dismiss', 'k3f9a'], {})
      expect(fs.existsSync(local(AGENT_MD))).toBe(false)
      expect(remote.get(`${DIR}/${AGENT_MD}`)).toBe(theirs) // the conditional DELETE answered 'conflict'
      expect(logs.some((l) => l.includes(`${AGENT_MD} not deleted on GitHub`))).toBe(true)
    })
  })

  it('pull removes an agent.md that was deleted on GitHub and is unchanged here', async () => {
    remoteSave(note(T1, `- [ ] Fix it ${ROBOT}k3f9a:done`), { [AGENT_MD]: agentDoc('k3f9a', 'done') })
    await mod.cmdPull() // synced: agent.md has a base now
    expect(fs.existsSync(local(AGENT_MD))).toBe(true)
    remoteSave(note('2099-02-01T00:00:00.000Z', '- [ ] Fix it')) // dismissed on another device
    await mod.cmdPull()
    expect(fs.existsSync(local(AGENT_MD))).toBe(false)
  })

  it('pull keeps an agent.md deleted on GitHub but changed here since — also when note.md did not move there', async () => {
    remoteSave(note(T1, `- [ ] Fix it ${ROBOT}k3f9a:running`), { [AGENT_MD]: agentDoc('k3f9a', 'running') })
    await mod.cmdPull()
    fs.writeFileSync(local(AGENT_MD), agentDoc('k3f9a', 'waiting')) // a report written here, not uploaded
    remoteSave(note(T1, `- [ ] Fix it ${ROBOT}k3f9a:running`)) // dropped there, same `updated`
    await mod.cmdPull()
    expect(fs.readFileSync(local(AGENT_MD), 'utf-8')).toBe(agentDoc('k3f9a', 'waiting'))
  })
})
