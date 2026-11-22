// Agent tasks in the desktop app — the pure module (electron/agentTasks.ts and
// its renderer mirror src/lib/agentTasks.ts): the 🤖 marker of a task line, the
// blocks of a note folder's reserved agent.md, orphans, discard by age, ids and
// settings. Three guarantees:
//   - the two mirrors are the same text;
//   - both behave exactly like the CLI's functions of the same name (the CLI
//     is the writer of agent.md: same input → same output, byte for byte);
//   - the rules the sync shares (agent.md is not a section).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import * as main from '../../electron/agentTasks'
import * as renderer from '../../src/lib/agentTasks'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

const ROBOT = '\u{1F916}'
const DUE = '\u{1F4C5}'
const ALARM = '\u{23F0}'
const PRIO = '\u{1F53A}'
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-20T12:00:00.000Z')

type Block = main.AgentBlock
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const TASK_LINES = [
  `- [ ] Fix X ${DUE}2026-12-01 ${ALARM}09:30 ${PRIO}high ${ROBOT}k3f9a:running`,
  `  * [x] Done thing ${ROBOT}a1b2c:done`,
  `- [ ] T ${ROBOT}k3f9a:review ${DUE}2026-12-01`,
  `- [ ] T ${ROBOT}k3f9a:paused-by-app`,
  `- [ ] ${ROBOT}k3f9a:queued`,
  `- [ ] ${ROBOT}k3f9a:queued text after`,
  `- [ ] two ${ROBOT}aaaaa:x markers ${ROBOT}bbbbb:y`,
  `- [ ] glued${ROBOT}k3f9a:queued`,
  `- [ ] upper ${ROBOT}K3F9A:queued`,
  `- [ ] short ${ROBOT}k3f9:queued`,
  `- [ ] punct ${ROBOT}k3f9a:queued!`,
  '- [ ] plain',
  '- [ ]',
  '- plain bullet',
  'paragraph',
  `> - [ ] quoted ${ROBOT}k3f9a:queued`,
  '',
]

const AGENT_DOCS = [
  '',
  'text outside\n',
  '<!-- task:k3f9a -->\ntitle: Fix X\nsection: Tasks\nstate: done\ncreatedAt: 2026-11-20T10:00:00.000Z\n---\n## Report\nline\n<!-- /task:k3f9a -->\n',
  // CRLF, BOM, an unknown key, a repeated key (the last wins), no report
  '\uFEFF<!-- task:aaaa1 -->\r\ntitle: A\r\nfuture: yes\r\nprogress: one\r\nprogress: two\r\n---\r\n<!-- /task:aaaa1 -->\r\n',
  // the marks of a sync conflict inside a header, then the body
  '<!-- task:aaaa1 -->\ntitle: A\n> ⚠️ Sync conflict — version from the merging device:\n\norphanedAt: 2026-11-01T00:00:00.000Z\n\n> ⚠️ Already synced version:\n\norphanedAt: 2026-11-02T00:00:00.000Z\n\n> ⚠️ End of sync conflict\n---\nbody\n<!-- /task:aaaa1 -->\n',
  // a block left open ends at the next one; a repeated id keeps its first block
  '<!-- task:aaaa1 -->\ntitle: open\n---\nreport\n<!-- task:bbbb2 -->\ntitle: B\n---\n<!-- /task:bbbb2 -->\n\n<!-- task:aaaa1 -->\ntitle: again\n---\n<!-- /task:aaaa1 -->\n',
  // no separator: everything is header; a body line that looks like a delimiter
  '<!-- task:aaaa1 -->\ntitle: no separator\nnot a key\n<!-- /task:aaaa1 -->\n',
  '<!-- task:aaaa1 -->\ntitle: A\n---\n\n\n  \nfirst\n\\<!-- /task:aaaa1 -->\n\\<!-- task:zzzz9 -->\nlast\n\n\n<!-- /task:aaaa1 -->\n',
]

describe('the two mirrors', () => {
  it('electron/agentTasks.ts and src/lib/agentTasks.ts hold the same code below the marker line', () => {
    const body = (file: string) => {
      const text = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf-8').replace(/\r\n/g, '\n')
      const at = text.indexOf('// ── mirrored below this line ──')
      expect(at).toBeGreaterThan(0)
      return text.slice(at)
    }
    expect(body('src/lib/agentTasks.ts')).toBe(body('electron/agentTasks.ts'))
  })
})

for (const [name, mod] of [['electron', main], ['renderer', renderer]] as const) {
  describe(`parity with the CLI (${name} mirror)`, () => {
    it('constants', () => {
      expect(mod.AGENT_MD).toBe(cli.AGENT_MD)
      expect([...mod.AGENT_TASK_STATES]).toEqual(cli.AGENT_TASK_STATES)
      expect(mod.AGENT_MARKER_RE.source).toBe((cli.AGENT_MARKER_RE as RegExp).source)
      expect(mod.AGENT_MARKER_RE.flags).toBe((cli.AGENT_MARKER_RE as RegExp).flags)
      expect(String(mod.AGENT_DESKTOP_SESSION_RE)).toBe(String(cli.AGENT_DESKTOP_SESSION_RE))
    })

    it('agentDesktopSessionHere: a valid desktopSession of a task started on this machine (hostnames ignore case)', () => {
      const S = 'local_3c827525-171f-463a-92a7-3e8615c8987e'
      expect(mod.agentDesktopSessionHere({ desktopSession: S, machine: 'Desk' }, 'Desk')).toBe(S)
      expect(mod.agentDesktopSessionHere({ desktopSession: ` ${S} `, machine: ' DESK ' }, 'desk')).toBe(S)
      expect(mod.agentDesktopSessionHere({ desktopSession: S, machine: 'Laptop' }, 'Desk')).toBeNull()
      expect(mod.agentDesktopSessionHere({ desktopSession: S }, 'Desk')).toBeNull()
      expect(mod.agentDesktopSessionHere({ desktopSession: S, machine: 'Desk' }, null)).toBeNull()
      expect(mod.agentDesktopSessionHere({ desktopSession: S, machine: '' }, '')).toBeNull()
      expect(mod.agentDesktopSessionHere({ desktopSession: 'last', machine: 'Desk' }, 'Desk')).toBeNull()
      expect(mod.agentDesktopSessionHere({ machine: 'Desk' }, 'Desk')).toBeNull()
      expect(mod.agentDesktopSessionHere(undefined, 'Desk')).toBeNull()
    })

    it('parseAgentTaskLine / withAgentMarker: the same reading and the same line, for every shape', () => {
      for (const line of TASK_LINES) {
        expect(mod.parseAgentTaskLine(line)).toEqual(cli.parseAgentTaskLine(line))
        for (const state of ['done', null]) {
          expect(mod.withAgentMarker(line, 'zzzz9', state)).toBe(cli.withAgentMarker(line, 'zzzz9', state))
        }
      }
    })

    it('agentTaskLines: fences (CommonMark), CRLF and a BOM', () => {
      const contents = [
        TASK_LINES.join('\n'),
        TASK_LINES.join('\r\n'),
        `\uFEFF- [ ] first ${ROBOT}aaaa1:queued\n\`\`\`\n- [ ] in code ${ROBOT}bbbb2:queued\n\`\`\`\n~~~~\n- [ ] tilde\n~~~\n- [ ] still code\n~~~~\n- [ ] out ${ROBOT}cccc3:done`,
        `\`\`\`x\`\`\` inline\n- [ ] a task ${ROBOT}aaaa1:queued\n\`\`\`\n- [ ] after an open fence ${ROBOT}bbbb2:queued`,
      ]
      for (const content of contents) expect(mod.agentTaskLines(content)).toEqual(cli.agentTaskLines(content))
    })

    it('agentTaskLines: a task with line breaks (continuation lines) reads the same', () => {
      const contents = [
        `- [x] First part ${ROBOT}aaaa1:done\nSecond part 📅2026-01-02\n  indented: a child\n- [ ] next`,
        `- [ ] a\r\nb\r\n\r\nc\r\n  - [ ] sub ${ROBOT}bbbb2:queued\r\nsub more\r\n<!-- /kanban -->`,
        `- [ ] a\n\`\`\`x\`\`\` inline\n\`\`\`\n- [ ] in code\n\`\`\`\n- [ ] b\n# heading\n1. item`,
        // A BOM before an indented first task is not indentation: its continuation is read the same.
        '\uFEFF  - [ ] x\n  y',
        // QA yilsf: a line indented deeper than the task, not an item, continues its text (what the
        // editor shows) \u2014 except under a kanban card, where it is the card's extra.
        `- [ ] parent\n  - [ ] sub ${ROBOT}cccc3:queued\n    detail\n- [ ] top\n      deep detail\nlazy`,
        `<!-- kanban done="Done" -->\n- To do\n  - [ ] card ${ROBOT}dddd4:queued\n    extra\n- Done\n<!-- /kanban -->\n- [ ] after\n    its text`,
      ]
      for (const content of contents) expect(mod.agentTaskLines(content)).toEqual(cli.agentTaskLines(content))
      const lines = ['<!-- kanban -->', '- A', '  - [ ] c', '<!-- /kanban -->', '- [ ] d']
      for (let i = 0; i < lines.length; i++) expect(mod.agentInKanbanBoard(lines, i)).toBe(cli.agentInKanbanBoard(lines, i))
      for (const line of ['text', '  text', '', '  ', '- x', '-', '2. x', '<!-- kanban -->', '```js', '```x``` y', '~~~', '# h', '| a |']) {
        expect(mod.agentTaskContinues(line)).toBe(cli.agentTaskContinues(line))
      }
    })

    it('agentIdsIn: every mention, wherever it is', () => {
      const sections = [
        { content: `${ROBOT}aaaa1:x\n> - [ ] quoted ${ROBOT}bbbb2:queued\n\`\`\`\n- [ ] code ${ROBOT}cccc3:done\n` },
        { content: `text ${ROBOT}dddd4:x and ${ROBOT}short:` },
        { content: null },
      ]
      expect([...mod.agentIdsIn(sections)].sort()).toEqual([...(cli.agentIdsIn(sections) as Set<string>)].sort())
      expect([...mod.agentIdsIn(sections)].sort()).toEqual(['aaaa1', 'bbbb2', 'cccc3', 'dddd4', 'short'])
      expect(mod.agentIdsIn(null).size).toBe(0)
    })

    it('agentDisplayState: no-signal is derived, only for running / waiting', () => {
      const ago = (min: number) => new Date(NOW - min * 60000).toISOString()
      for (const state of ['queued', 'running', 'waiting', 'review', 'done', 'failed', 'interrupted', 'whatever']) {
        for (const signal of [ago(1), ago(89), ago(91), ago(9999), undefined, 'not a date']) {
          for (const stale of [10, 90]) {
            expect(mod.agentDisplayState(state, signal, stale, NOW)).toBe(cli.agentDisplayState(state, signal, stale, NOW))
          }
        }
      }
      expect(mod.agentDisplayState('running', ago(91), 90, NOW)).toBe('no-signal')
      expect(mod.agentDisplayState('running', ago(89), 90, NOW)).toBe('running')
    })

    it('parseAgentDoc → the same blocks; serializeAgentDoc → the same bytes', () => {
      for (const doc of AGENT_DOCS) {
        const blocks = mod.parseAgentDoc(doc)
        expect(blocks).toEqual(cli.parseAgentDoc(doc))
        expect(mod.serializeAgentDoc(blocks)).toBe(cli.serializeAgentDoc(cli.parseAgentDoc(doc)))
        // Canonical: what it writes reads back the same, and writes the same again.
        const written = mod.serializeAgentDoc(blocks)
        expect(mod.parseAgentDoc(written)).toEqual(blocks)
        expect(mod.serializeAgentDoc(mod.parseAgentDoc(written))).toBe(written)
      }
      const odd: Block[] = [{ id: 'aaaa1', meta: { zeta: 'last', state: 'done', title: 'two\nlines ', empty: '' }, body: 'a\r\nb\n<!-- task:bbbb2 -->\n\n' }]
      expect(mod.serializeAgentDoc(odd)).toBe(cli.serializeAgentDoc(clone(odd)))
      expect(mod.serializeAgentDoc([])).toBe('')
    })

    it('maintainAgentBlocks: orphans are stamped, dropped a week later, and un-stamped when the id is back', () => {
      const blocks = (): Block[] => [
        { id: 'aaaa1', meta: { title: 'alive' }, body: '' },
        { id: 'bbbb2', meta: { title: 'new orphan' }, body: '' },
        { id: 'cccc3', meta: { title: 'old orphan', orphanedAt: new Date(NOW - 8 * DAY).toISOString() }, body: '' },
        { id: 'dddd4', meta: { title: 'recent orphan', orphanedAt: new Date(NOW - 6 * DAY).toISOString() }, body: '' },
        { id: 'eeee5', meta: { title: 'came back', orphanedAt: new Date(NOW - 8 * DAY).toISOString() }, body: '' },
      ]
      const live = new Set(['aaaa1', 'eeee5'])
      const mine = mod.maintainAgentBlocks(blocks(), live, NOW)
      expect(mine).toEqual(cli.maintainAgentBlocks(blocks(), live, NOW))
      expect(mine.changed).toBe(true)
      expect(mine.blocks.map((b) => b.id)).toEqual(['aaaa1', 'bbbb2', 'dddd4', 'eeee5'])
      expect(mine.blocks[1].meta.orphanedAt).toBe(new Date(NOW).toISOString())
      expect(mine.blocks[3].meta.orphanedAt).toBeUndefined()
      expect(mod.maintainAgentBlocks([{ id: 'aaaa1', meta: {}, body: '' }], new Set(['aaaa1']), NOW).changed).toBe(false)
    })

    it('agentTaskText: what people see — no marker, no annotations', () => {
      for (const line of TASK_LINES) {
        const parsed = mod.parseAgentTaskLine(line)
        if (parsed) expect(mod.agentTaskText(parsed.body)).toBe(cli.agentTaskText(parsed.body))
      }
    })

    it('settings: the keys the CLI reads sanitize the same', () => {
      // The CLI's reader is not exported: these are its rules (agentTaskSettings).
      expect(mod.sanitizeAgentTaskSettings(undefined)).toEqual({ enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, launch: 'terminal', agent: 'claude', agentCommand: '', agentUrl: '', batchMode: 'parallel', commit: false, models: {}, efforts: {} })
      expect(mod.sanitizeAgentTaskSettings({ enabled: true, onFinish: 'review', staleMinutes: 15, discardAfterDays: 0 }))
        .toEqual({ enabled: true, onFinish: 'review', staleMinutes: 15, discardAfterDays: 0, launch: 'terminal', agent: 'claude', agentCommand: '', agentUrl: '', batchMode: 'parallel', commit: false, models: {}, efforts: {} })
      expect(mod.sanitizeAgentTaskSettings({ enabled: 'yes', onFinish: 'delete', staleMinutes: -1, discardAfterDays: -3 }))
        .toEqual({ enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, launch: 'terminal', agent: 'claude', agentCommand: '', agentUrl: '', batchMode: 'parallel', commit: false, models: {}, efforts: {} })
      expect(mod.sanitizeAgentTaskSettings({ staleMinutes: '45', discardAfterDays: '7' })).toMatchObject({ staleMinutes: 45, discardAfterDays: 7 })
      expect(mod.sanitizeAgentTaskSettings([1, 2])).toEqual(mod.DEFAULT_AGENT_TASK_SETTINGS)
    })

    it('settings: several tasks — in parallel (the default) or one after another, nothing else', () => {
      expect(mod.sanitizeAgentTaskSettings({ batchMode: 'parallel' }).batchMode).toBe('parallel')
      // A choice the user saved is kept.
      expect(mod.sanitizeAgentTaskSettings({ batchMode: 'sequential' }).batchMode).toBe('sequential')
      for (const junk of [undefined, null, 'SEQUENTIAL', 'both', 1, true, ['sequential']]) {
        expect(mod.sanitizeAgentTaskSettings({ batchMode: junk }).batchMode).toBe('parallel')
      }
    })

    it('settings: the model of each agent — only the presets that take one, only a name --model takes', () => {
      const models = (raw: unknown) => mod.sanitizeAgentTaskSettings({ models: raw }).models
      expect(models({ claude: ' opus ', codex: 'gpt-5-codex', gemini: 'gemini-2.5-pro' })).toEqual({ claude: 'opus', codex: 'gpt-5-codex', gemini: 'gemini-2.5-pro' })
      expect(models({ claude: 'sonnet[1m]', codex: 'org/model:v1@x', gemini: 'a.b_c-d' })).toEqual({ claude: 'sonnet[1m]', codex: 'org/model:v1@x', gemini: 'a.b_c-d' })
      // OpenCode, a custom command, an alias, a key of the prototype: not kept.
      expect(models({ opencode: 'anthropic/claude', custom: 'x', 'claude-code': 'opus', __proto__: { claude: 'opus' } })).toEqual({})
      // A name that is not ONE plain argument: dropped, never written.
      for (const junk of ['', '   ', 'two words', '--model', '-x', '"opus"', 'a;b', 'a&b', '%PATH%', 'now!', 'a^b', 'a\nb', 'x'.repeat(101), 7, null, ['opus'], {}]) {
        expect(models({ claude: junk }), String(junk)).toEqual({})
      }
      for (const junk of [undefined, null, 'opus', ['opus'], 3]) expect(models(junk)).toEqual({})
      expect(models({ claude: 'x'.repeat(100) })).toEqual({ claude: 'x'.repeat(100) })
    })

    it('settings: the effort of each agent — only Claude Code, only a level of the closed list', () => {
      const efforts = (raw: unknown) => mod.sanitizeAgentTaskSettings({ efforts: raw }).efforts
      for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) expect(efforts({ claude: level })).toEqual({ claude: level })
      expect([...mod.AGENT_EFFORT_LEVELS]).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
      // Another agent, an alias, a key of the prototype: not kept.
      expect(efforts({ codex: 'high', gemini: 'high', opencode: 'high', custom: 'high', 'claude-code': 'high', __proto__: { claude: 'high' } })).toEqual({})
      // Anything that is not exactly one of the levels: dropped, never written.
      for (const junk of ['', ' high ', 'HIGH', 'High', 'extreme', 'high --x', 'ultra', 3, null, true, ['high'], { high: 1 }]) {
        expect(efforts({ claude: junk }), String(junk)).toEqual({})
      }
      for (const junk of [undefined, null, 'high', ['high'], 3]) expect(efforts(junk)).toEqual({})
      expect(mod.isAgentEffort('xhigh')).toBe(true)
      expect(mod.isAgentEffort('toString')).toBe(false)
    })

    it('agentRunEffort: only Claude Code in a terminal, with one set', () => {
      const s = (raw: Record<string, unknown>) => mod.sanitizeAgentTaskSettings({ efforts: { claude: 'xhigh' }, ...raw })
      expect(mod.agentRunEffort(s({}))).toBe('xhigh')
      expect(mod.agentRunEffort(s({ agent: 'claude-code' }))).toBe('xhigh')
      for (const raw of [{ agent: 'codex' }, { agent: 'gemini' }, { agent: 'opencode' }, { agent: 'custom', agentCommand: 'claude {prompt}' }, { launch: 'claude-desktop' }, { efforts: {} }]) {
        expect(mod.agentRunEffort(s(raw)), JSON.stringify(raw)).toBeNull()
      }
    })

    it('agentRunModel: only a terminal agent that takes a model, with one set', () => {
      const s = (raw: Record<string, unknown>) => mod.sanitizeAgentTaskSettings({ models: { claude: 'opus', codex: 'gpt-5', gemini: 'gemini-2.5-flash' }, ...raw })
      expect(mod.agentRunModel(s({}))).toBe('opus')
      expect(mod.agentRunModel(s({ agent: 'codex' }))).toBe('gpt-5')
      expect(mod.agentRunModel(s({ agent: 'gemini-cli' }))).toBe('gemini-2.5-flash')
      for (const raw of [{ agent: 'opencode' }, { agent: 'custom', agentCommand: 'x {prompt}' }, { launch: 'claude-desktop' }, { launch: 'codex-app', agent: 'codex' }, { models: {} }]) {
        expect(mod.agentRunModel(s(raw)), JSON.stringify(raw)).toBeNull()
      }
    })

    it('settings: what "Run" launches — the mode, the agent (the key noteflow run reads), the command and the link', () => {
      const launch = (raw: unknown) => {
        const { launch, agent, agentCommand, agentUrl } = mod.sanitizeAgentTaskSettings(raw)
        return { launch, agent, agentCommand, agentUrl }
      }
      expect(launch({})).toEqual({ launch: 'terminal', agent: 'claude', agentCommand: '', agentUrl: '' })
      for (const mode of ['terminal', 'claude-desktop', 'codex-app', 'custom-url']) expect(launch({ launch: mode }).launch).toBe(mode)
      for (const junk of ['shell', 'TERMINAL', 7, null, ['terminal']]) expect(launch({ launch: junk }).launch).toBe('terminal')
      // The CLI's presets and their aliases, in any case; and what the CLI resolves them to.
      for (const [raw, preset] of [['claude', 'claude'], ['Codex', 'codex'], ['gemini-cli', 'gemini'], ['claude-code', 'claude'], ['codex-cli', 'codex'], ['opencode', 'opencode'], [' custom ', 'custom']]) {
        expect(launch({ agent: raw }).agent, raw).toBe(preset)
        if (preset !== 'custom') expect(cli.resolveRunAgent(undefined, { agent: raw }).name, raw).toBe(preset)
      }
      for (const junk of [7, null, {}, '   ']) expect(launch({ agent: junk }).agent).toBe('claude')
      // A command of its own written by hand for the CLI shows as custom, with that text as its command.
      expect(launch({ agent: 'aider --yes {prompt}' })).toMatchObject({ agent: 'custom', agentCommand: 'aider --yes {prompt}' })
      expect(launch({ agent: 'aider', agentCommand: 'mine {prompt}' })).toMatchObject({ agent: 'custom', agentCommand: 'mine {prompt}' })
      // Templates: one line, trimmed, no control characters, bounded.
      expect(launch({ agentCommand: '  my-agent\n{prompt}\u0007 ', agentUrl: ' my://x?p={prompt}\r\n ' })).toMatchObject({ agentCommand: 'my-agent {prompt}', agentUrl: 'my://x?p={prompt}' })
      expect(launch({ agentCommand: 'x'.repeat(5000), agentUrl: 42 })).toMatchObject({ agentCommand: 'x'.repeat(2000), agentUrl: '' })
    })
  })
}

describe('the marker in a text that is shown, not saved', () => {
  it('stripAgentMarkers: every marker goes with the space before it, in LF and CRLF texts', () => {
    expect(main.stripAgentMarkers(`- [ ] Fix X ${DUE}2026-12-01 ${ROBOT}k3f9a:running`)).toBe(`- [ ] Fix X ${DUE}2026-12-01`)
    expect(main.stripAgentMarkers(`- [ ] a ${ROBOT}aaaa1:done b\n- [x] c ${ROBOT}bbbb2:review\r\nplain`)).toBe('- [ ] a b\n- [x] c\r\nplain')
    expect(main.stripAgentMarkers(`${ROBOT}aaaa1:done at the start`)).toBe(' at the start')
    // Not a marker: left alone.
    for (const text of [`a${ROBOT}aaaa1:done`, `${ROBOT}aaa1:done`, `robot ${ROBOT} emoji`, 'no marker at all', '']) {
      expect(main.stripAgentMarkers(text)).toBe(text)
    }
  })

  it('agentMarkerText: only a writable id + state', () => {
    expect(main.agentMarkerText('k3f9a', 'running')).toBe(`${ROBOT}k3f9a:running`)
    expect(main.agentMarkerText('k3f9a', 'paused-by-app')).toBe(`${ROBOT}k3f9a:paused-by-app`)
    for (const [id, state] of [['K3F9A', 'done'], ['k3f9', 'done'], ['k3f9a', ''], ['k3f9a', 'two words'], [null, 'done'], ['k3f9a', null]] as const) {
      expect(main.agentMarkerText(id, state)).toBe('')
    }
  })
})

describe('the marker in a section (renderer writes)', () => {
  const content = [
    `- [ ] Fix X ${DUE}2026-12-01 ${ROBOT}k3f9a:running`,
    '  - child',
    `- [x] Other ${ROBOT}a1b2c:done`,
    '```',
    `- [ ] in code ${ROBOT}k3f9a:running`,
    '```',
    `> - [ ] quoted ${ROBOT}k3f9a:running`,
  ].join('\n')

  it('setAgentMarkerInContent changes only the task line(s) of that id — the same line the CLI would write', () => {
    const next = main.setAgentMarkerInContent(content, 'k3f9a', 'review')
    const lines = next.split('\n')
    expect(lines[0]).toBe(cli.withAgentMarker(content.split('\n')[0], 'k3f9a', 'review'))
    expect(lines.slice(1)).toEqual(content.split('\n').slice(1)) // code and quote untouched
    expect(main.setAgentMarkerInContent(content, 'zzzz9', 'done')).toBe(content)
  })

  it('removing the marker (state null) keeps the id out of the task line but never touches other mentions', () => {
    const next = main.setAgentMarkerInContent(content, 'k3f9a', null)
    expect(next.split('\n')[0]).toBe(`- [ ] Fix X ${DUE}2026-12-01`)
    // Still mentioned in the code block and the quote: the block is not an orphan yet (conservative).
    expect(main.agentIdsIn([{ content: next }]).has('k3f9a')).toBe(true)
  })

  it('keeps CRLF line endings and a BOM', () => {
    const crlf = `\uFEFF- [ ] A ${ROBOT}aaaa1:queued\r\n- [ ] B\r\n`
    expect(main.setAgentMarkerInContent(crlf, 'aaaa1', 'running')).toBe(`\uFEFF- [ ] A ${ROBOT}aaaa1:running\r\n- [ ] B\r\n`)
    expect(main.setAgentMarkerInContent(crlf, 'aaaa1', null)).toBe('\uFEFF- [ ] A\r\n- [ ] B\r\n')
  })

  it('clearAgentMarkersInContent: a COPY loses every marker of its task lines', () => {
    const copy = main.clearAgentMarkersInContent(content)
    expect(main.agentTaskLines(copy).filter((t) => t.marker)).toEqual([])
    expect(copy.split('\n')[2]).toBe('- [x] Other')
    const plain = '- [ ] nothing here\ntext'
    expect(main.clearAgentMarkersInContent(plain)).toBe(plain)
  })
})

describe('discard of finished blocks by age (agentTasks.discardAfterDays)', () => {
  const at = (days: number) => new Date(NOW - days * DAY).toISOString()
  const blocks: Block[] = [
    { id: 'done1', meta: { state: 'done', finishedAt: at(31) }, body: 'report' },
    { id: 'done2', meta: { state: 'done', finishedAt: at(29) }, body: '' },
    { id: 'fail1', meta: { state: 'failed', finishedAt: at(40) }, body: '' },
    { id: 'revw1', meta: { state: 'review', finishedAt: at(400) }, body: '' },
    { id: 'runn1', meta: { state: 'running', lastSignal: at(400) }, body: '' },
    { id: 'nodat', meta: { state: 'done' }, body: '' },
    { id: 'sign1', meta: { state: 'done', lastSignal: at(60), createdAt: at(90) }, body: '' },
    { id: 'unkn1', meta: { state: 'paused-by-app', finishedAt: at(400) }, body: '' },
  ]

  it('only done / failed, only older than the term; a block without any date is never discarded', () => {
    expect(main.discardableAgentIds(blocks, 30, NOW)).toEqual(['done1', 'fail1', 'sign1'])
    expect(main.discardableAgentIds(blocks, 35, NOW)).toEqual(['fail1', 'sign1'])
  })

  it('0 (or garbage) = never', () => {
    for (const days of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(main.discardableAgentIds(blocks, days, NOW)).toEqual([])
  })

  it('the LINE rules over the block: a task reopened on its line is kept, one finished on its line goes', () => {
    const lines = new Map([['done1', 'running'], ['revw1', 'done']])
    expect(main.discardableAgentIds(blocks, 30, NOW, lines)).toEqual(['fail1', 'revw1', 'sign1'])
  })

  it('withoutAgentBlock removes one block; the same array when the id is not there', () => {
    expect(main.withoutAgentBlock(blocks, 'done1').map((b) => b.id)).not.toContain('done1')
    expect(main.withoutAgentBlock(blocks, 'zzzz9')).toBe(blocks)
    expect(main.serializeAgentDoc(main.withoutAgentBlock([blocks[0]], 'done1'))).toBe('') // the file goes with its last block
  })
})

describe('ids', () => {
  it('newAgentTaskId: 5 chars [a-z0-9], never one already taken', () => {
    const bytes = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5]
    let i = 0
    const id = main.newAgentTaskId(new Set(['aaaaa']), () => bytes[i++ % bytes.length])
    expect(id).toBe('bcdef')
    for (let n = 0; n < 50; n++) expect(main.newAgentTaskId(new Set())).toMatch(main.AGENT_ID_RE)
  })
})

describe('settings.json agentTasks', () => {
  it('a patch keeps the keys it does not name — also the ones this build does not know', () => {
    const stored = { onFinish: 'review', staleMinutes: 15, future: { x: 1 } }
    expect(main.patchAgentTaskSettings(stored, { enabled: true })).toEqual({
      enabled: true, onFinish: 'review', staleMinutes: 15, discardAfterDays: 30, future: { x: 1 },
    })
    expect(main.patchAgentTaskSettings(stored, { staleMinutes: 'x', onFinish: 'nope', other: 1 })).toEqual({
      enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, future: { x: 1 },
    })
    // The launch keys are only written when a patch names them.
    expect(main.patchAgentTaskSettings(undefined, undefined)).toEqual({ enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30 })
  })

  it('the launch keys: written only when the patch names them, sanitized; the folders and a hand-written agent survive', () => {
    const stored = { enabled: true, agent: 'aider --yes {prompt}', folders: { n1: 'C:\\proj' }, future: 1 }
    // Toggling something else does not rewrite the agent the user set for the CLI.
    expect(main.patchAgentTaskSettings(stored, { onFinish: 'review' })).toEqual({
      enabled: true, onFinish: 'review', staleMinutes: 90, discardAfterDays: 30, agent: 'aider --yes {prompt}', folders: { n1: 'C:\\proj' }, future: 1,
    })
    const next = main.patchAgentTaskSettings(stored, { launch: 'terminal', agent: 'codex', agentCommand: ' x {prompt} ', agentUrl: 'my://a?p={prompt}', folders: { evil: '/' } })
    expect(next).toMatchObject({ launch: 'terminal', agent: 'codex', agentCommand: 'x {prompt}', agentUrl: 'my://a?p={prompt}', folders: { n1: 'C:\\proj' }, future: 1 })
    // Junk never reaches the file.
    expect(main.patchAgentTaskSettings({}, { launch: 'powershell', agent: 'rm -rf / {prompt}' })).toMatchObject({ launch: 'terminal', agent: 'custom' })
    expect(main.patchAgentTaskSettings({}, { launch: 'codex-app' })).toEqual({ enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, launch: 'codex-app' })
    // Several tasks: written when named, sanitized, and kept when something else changes.
    const parallel = main.patchAgentTaskSettings({}, { batchMode: 'parallel' })
    expect(parallel).toEqual({ enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, batchMode: 'parallel' })
    expect(main.patchAgentTaskSettings(parallel, { onFinish: 'review' })).toMatchObject({ batchMode: 'parallel', onFinish: 'review' })
    expect(main.patchAgentTaskSettings(parallel, { batchMode: 'all-at-once' })).toMatchObject({ batchMode: 'parallel' })
    expect(renderer.patchAgentTaskSettings({}, { batchMode: 'parallel' })).toEqual(parallel)
    // Parallel is the default, but a saved 'sequential' stays when something else changes; an unset one is never written.
    const sequential = main.patchAgentTaskSettings({}, { batchMode: 'sequential' })
    expect(sequential).toMatchObject({ batchMode: 'sequential' })
    expect(main.patchAgentTaskSettings(sequential, { onFinish: 'review' })).toMatchObject({ batchMode: 'sequential', onFinish: 'review' })
    expect(main.sanitizeAgentTaskSettings(main.patchAgentTaskSettings(sequential, { enabled: true })).batchMode).toBe('sequential')
    expect('batchMode' in main.patchAgentTaskSettings({}, { enabled: true })).toBe(false)
    expect(renderer.patchAgentTaskSettings({}, { batchMode: 'sequential' })).toEqual(sequential)
    // `commit`: only an explicit true reads so; written only when a patch names it, then kept.
    expect(main.sanitizeAgentTaskSettings({ commit: 'yes' }).commit).toBe(false)
    expect('commit' in main.patchAgentTaskSettings({}, { enabled: true })).toBe(false)
    const committing = main.patchAgentTaskSettings({}, { commit: true })
    expect(committing).toMatchObject({ commit: true })
    expect(main.patchAgentTaskSettings(committing, { onFinish: 'review' })).toMatchObject({ commit: true, onFinish: 'review' })
    expect(main.patchAgentTaskSettings(committing, { commit: false })).toMatchObject({ commit: false })
    expect(renderer.patchAgentTaskSettings({}, { commit: true })).toEqual(committing)
    // The models: written when named, merged by agent ('' = back to the default), junk dropped, kept otherwise.
    const opus = main.patchAgentTaskSettings({}, { models: { claude: 'opus' } })
    expect(opus).toEqual({ enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, models: { claude: 'opus' } })
    const both = main.patchAgentTaskSettings(opus, { models: { gemini: 'gemini-2.5-pro' } })
    expect(both.models).toEqual({ claude: 'opus', gemini: 'gemini-2.5-pro' })
    expect(main.patchAgentTaskSettings(both, { models: { claude: '' } }).models).toEqual({ gemini: 'gemini-2.5-pro' })
    expect(main.patchAgentTaskSettings(both, { models: { claude: 'rm -rf /', opencode: 'x/y' } }).models).toEqual({ gemini: 'gemini-2.5-pro' })
    expect(main.patchAgentTaskSettings(both, { onFinish: 'review' }).models).toEqual(both.models)
    expect(main.patchAgentTaskSettings({ models: { claude: 'bad name', codex: 'gpt-5' } }, { models: { gemini: 'g' } }).models).toEqual({ codex: 'gpt-5', gemini: 'g' })
    expect(renderer.patchAgentTaskSettings(opus, { models: { gemini: 'gemini-2.5-pro' } })).toEqual(both)
    // Without a patch that names it, a stored object is not rewritten (not even its junk).
    expect(main.patchAgentTaskSettings({ models: { claude: 'bad name' } }, { onFinish: 'review' }).models).toEqual({ claude: 'bad name' })
    // The efforts: the same — written when named, merged by agent ('' = back to the default), junk dropped.
    const high = main.patchAgentTaskSettings({}, { efforts: { claude: 'high' } })
    expect(high).toEqual({ enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, efforts: { claude: 'high' } })
    expect(main.patchAgentTaskSettings(high, { efforts: { claude: 'max' } }).efforts).toEqual({ claude: 'max' })
    expect(main.patchAgentTaskSettings(high, { efforts: { claude: '' } }).efforts).toEqual({})
    expect(main.patchAgentTaskSettings(high, { efforts: { claude: 'ultra', codex: 'low' } }).efforts).toEqual({})
    expect(main.patchAgentTaskSettings(high, { models: { claude: 'opus' } })).toMatchObject({ efforts: { claude: 'high' }, models: { claude: 'opus' } })
    expect(main.patchAgentTaskSettings(high, { onFinish: 'review' }).efforts).toEqual({ claude: 'high' })
    expect(renderer.patchAgentTaskSettings(high, { efforts: { claude: 'low' } })).toEqual(main.patchAgentTaskSettings(high, { efforts: { claude: 'low' } }))
    // Without a patch that names it, a stored object is not rewritten (not even its junk).
    expect(main.patchAgentTaskSettings({ efforts: { claude: 'ultra' } }, { onFinish: 'review' }).efforts).toEqual({ claude: 'ultra' })
    // What the app writes is what `noteflow run` reads.
    const custom = main.patchAgentTaskSettings({}, { agent: 'custom', agentCommand: 'my-agent --go {prompt}' })
    expect(cli.resolveRunAgent(undefined, { agent: custom.agent, agentCommand: custom.agentCommand })).toMatchObject({ name: 'my-agent', template: ['my-agent', '--go', '{prompt}'] })
  })
})

describe('agent.md is not a section (rules the sync shares)', () => {
  it('isAgentFile / isAgentFilePath', () => {
    expect(main.isAgentFile('agent.md')).toBe(true)
    expect(main.isAgentFile('Agent.md')).toBe(false)
    expect(main.isAgentFilePath('note-abc/agent.md')).toBe(true)
    for (const rel of ['agent.md', 'note-abc/agent.md.bak', 'note-abc/x/agent.md', 'note-abc/note.md', 'note-abc/agent']) {
      expect(main.isAgentFilePath(rel)).toBe(false)
    }
  })

  it('agentFileDeletedRemotely: only a file this device had synced and has not changed since', () => {
    expect(main.agentFileDeletedRemotely('sha-1', 'sha-1')).toBe(true)
    expect(main.agentFileDeletedRemotely('sha-1', 'sha-2')).toBe(false) // changed here
    expect(main.agentFileDeletedRemotely(undefined, 'sha-1')).toBe(false) // never uploaded
    expect(main.agentFileDeletedRemotely('sha-1', null)).toBe(false)
  })

  it('userFacingSectionFiles: conflicts and partial copies are never about agent.md', () => {
    expect(main.userFacingSectionFiles(['agent.md'])).toEqual([])
    expect(main.userFacingSectionFiles(['s1.md', 'agent.md', 's2.md'])).toEqual(['s1.md', 's2.md'])
  })
})

describe('the file as a whole (what the main process does with it)', () => {
  const live = `- [ ] Fix it ${ROBOT}aaaa1:running`
  const two = main.serializeAgentDoc([
    { id: 'aaaa1', meta: { title: 'Fix it', state: 'running' }, body: '' },
    { id: 'bbbb2', meta: { title: 'Gone', state: 'done' }, body: 'report' },
  ])

  it('maintainAgentDoc: a block whose id no section mentions is stamped; nothing to rewrite when all are alive', () => {
    const res = main.maintainAgentDoc(two, [{ content: live }], null, NOW)
    expect(res.rewrite).toBe(true)
    expect(res.blocks.map((b) => [b.id, b.meta.orphanedAt])).toEqual([['aaaa1', undefined], ['bbbb2', new Date(NOW).toISOString()]])
    expect(main.maintainAgentDoc(two, [{ content: `${live}\n${ROBOT}bbbb2:done` }], null, NOW).rewrite).toBe(false)
  })

  it('…ids the caller still holds in memory (an editor with unsaved changes) are never orphaned', () => {
    expect(main.maintainAgentDoc(two, [{ content: live }], ['bbbb2', 'not-an-id', 7], NOW).rewrite).toBe(false)
  })

  it('…the same decision as the CLI on the same file and sections', () => {
    const mine = main.maintainAgentDoc(two, [{ content: live }], null, NOW)
    const theirs = cli.maintainAgentBlocks(cli.parseAgentDoc(two), cli.agentIdsIn([{ content: live }]), NOW)
    expect(mine.blocks).toEqual(theirs.blocks)
    expect(main.serializeAgentDoc(mine.blocks)).toBe(cli.serializeAgentDoc(theirs.blocks))
  })

  it('…the ⚠️ marks of a sync merge go with the first canonical write', () => {
    const marked = two.replace('state: running', '> ⚠️ Sync conflict — x:\n\nstate: waiting\n\n> ⚠️ Already synced version:\n\nstate: running\n\n> ⚠️ End of sync conflict')
    const res = main.maintainAgentDoc(marked, [{ content: `${live}\n${ROBOT}bbbb2:done` }], null, NOW)
    expect(res.rewrite).toBe(true)
    expect(main.serializeAgentDoc(res.blocks)).toBe(two)
  })

  it('planAgentFileWrite: write only what changed, delete the file with its last block, never create an empty one', () => {
    const blocks = main.parseAgentDoc(two)
    expect(main.planAgentFileWrite(two, blocks)).toEqual({ kind: 'none' })
    expect(main.planAgentFileWrite(two.replace(/\n/g, '\r\n'), blocks)).toEqual({ kind: 'write', content: two }) // back to LF
    expect(main.planAgentFileWrite(null, blocks)).toEqual({ kind: 'write', content: two })
    expect(main.planAgentFileWrite(two, [])).toEqual({ kind: 'delete' })
    expect(main.planAgentFileWrite(null, [])).toEqual({ kind: 'none' })
    // Dismissing one of two blocks keeps the other, byte for byte as the CLI writes it.
    const one = main.planAgentFileWrite(two, main.withoutAgentBlock(blocks, 'bbbb2'))
    expect(one).toEqual({ kind: 'write', content: cli.serializeAgentDoc(cli.parseAgentDoc(two).filter((b: { id: string }) => b.id !== 'bbbb2')) })
  })
})
