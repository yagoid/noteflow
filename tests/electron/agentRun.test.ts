// "Run" of the agent tasks, main's pure side (electron/agentRun.ts): what a
// request may carry, the arguments of `noteflow run`, the launcher script per
// platform, which terminal, the link of a desktop app and its validation.
//
// No terminal, no agent and no link is ever opened here. The launcher scripts
// are also RUN — by the real interpreter, with Node standing in for the app's
// binary and a script that only records its arguments — to prove that every
// path reaches the program byte for byte.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { patchAgentTaskSettings, sanitizeAgentTaskSettings } from '../../electron/agentTasks'
import {
  AGENT_RUN_SCRIPT_TTL_MS,
  AGENT_RUN_TEXT_TTL_MS,
  AGENT_URL_DENIED_SCHEMES,
  AGENT_URL_MAX,
  AGENT_URL_PROMPT_MAX,
  AGENT_APPROVALS_MAX,
  agentApprovalHash,
  agentCustomLaunch,
  agentFolderOf,
  authorizeAgentLaunch,
  isAgentLaunchApproved,
  safeComspec,
  withAgentApproval,
  type AgentCustomLaunch,
  type AgentLaunchGate,
  agentRunAgentArgs,
  agentRunCliArgs,
  agentRunTmpExpired,
  agentTerminalPlans,
  agentUrlTemplateScheme,
  buildAgentAppUrl,
  buildAgentLauncherScript,
  interpretAgentDryRun,
  parseAgentAppRequest,
  parseAgentTerminalRequest,
  withAgentFolder,
  type AgentLauncherInput,
} from '../../electron/agentRun'

const WINDOWS = process.platform === 'win32'

describe('what the renderer may send', () => {
  it('a terminal run: a note id, well-formed task ids (no repeats) and text — nothing else gets through', () => {
    expect(parseAgentTerminalRequest({ noteId: 'abc12345', ids: ['k3f9a', 'b7x2q', 'k3f9a'], context: ' ctx ' }))
      .toEqual({ noteId: 'abc12345', ids: ['k3f9a', 'b7x2q'], context: ' ctx ', prompt: null })
    // A prompt is ignored when there are tasks; a blank context is no context.
    expect(parseAgentTerminalRequest({ noteId: 'n', ids: ['k3f9a'], context: '  \n', prompt: 'x' }))
      .toEqual({ noteId: 'n', ids: ['k3f9a'], context: null, prompt: null })
    // No tasks: the whole prompt, and it is required.
    expect(parseAgentTerminalRequest({ noteId: 'n', ids: [], prompt: 'do it' })).toEqual({ noteId: 'n', ids: [], context: null, prompt: 'do it' })
    expect(parseAgentTerminalRequest({ noteId: 'n', ids: [] })).toBeNull()
    expect(parseAgentTerminalRequest({ noteId: 'n', prompt: '   ' })).toBeNull()
  })

  it.each([
    ['an id that is not 5 of [a-z0-9]', { noteId: 'n', ids: ['K3F9A'] }],
    ['an id that carries a flag', { noteId: 'n', ids: ['--agent'] }],
    ['an id with shell text', { noteId: 'n', ids: ['a&b|c'] }],
    ['an id that is not a string', { noteId: 'n', ids: [12345] }],
    ['a note id that is a path', { noteId: '..\\..\\x', ids: ['k3f9a'] }],
    ['no note id', { ids: ['k3f9a'] }],
    ['ids that are not a list', { noteId: 'n', ids: 'k3f9a' }],
    ['a context that is not text', { noteId: 'n', ids: ['k3f9a'], context: { toString: () => 'x' } }],
    ['too many tasks', { noteId: 'n', ids: Array.from({ length: 101 }, (_, i) => `a${String(i).padStart(4, '0')}`) }],
    ['a text that is too long', { noteId: 'n', ids: [], prompt: 'x'.repeat(1_000_001) }],
    ['not an object', 'run k3f9a'],
  ])('refused: %s', (_name, raw) => {
    expect(parseAgentTerminalRequest(raw)).toBeNull()
  })

  it('opening an app: a note id and a prompt', () => {
    expect(parseAgentAppRequest({ noteId: 'n1', prompt: 'hello' })).toEqual({ noteId: 'n1', prompt: 'hello' })
    expect(parseAgentAppRequest({ noteId: 'n1', prompt: '' })).toBeNull()
    expect(parseAgentAppRequest({ noteId: 'a/b', prompt: 'x' })).toBeNull()
    expect(parseAgentAppRequest({ noteId: 'n1', prompt: 'x', url: 'file:///etc/passwd' })).toEqual({ noteId: 'n1', prompt: 'x' }) // a link is never taken from the page
  })
})

describe("the note's project folder (settings.json → agentTasks.folders)", () => {
  it('is kept per note, next to every other key of agentTasks', () => {
    const stored = { enabled: true, agent: 'codex', future: 1, folders: { other: 'D:\\x' } }
    const next = withAgentFolder(stored, 'n1', 'C:\\My Project')
    expect(next).toEqual({ enabled: true, agent: 'codex', future: 1, folders: { other: 'D:\\x', n1: 'C:\\My Project' } })
    expect(agentFolderOf(next, 'n1')).toBe('C:\\My Project')
    expect(agentFolderOf(next, 'nope')).toBe('')
    expect(withAgentFolder(next, 'n1', null)).toEqual(stored)
    expect(stored.folders).toEqual({ other: 'D:\\x' }) // not mutated
  })

  it('tolerates anything in the file', () => {
    expect(agentFolderOf(undefined, 'n1')).toBe('')
    expect(agentFolderOf({ folders: ['x'] }, '0')).toBe('')
    expect(agentFolderOf({ folders: { n1: 42 } }, 'n1')).toBe('')
    expect(agentFolderOf({ folders: {} }, 'constructor')).toBe('') // nothing inherited
    expect(withAgentFolder('garbage', 'n1', '/p')).toEqual({ folders: { n1: '/p' } })
  })
})

describe('the arguments of noteflow run', () => {
  it('tasks: the ids in order, the context file, the "when finished" and the agent', () => {
    expect(agentRunCliArgs({ ids: ['k3f9a', 'b7x2q'], contextFile: '/t/c.md', promptFile: null, onFinish: 'review', agentArgs: ['--agent', 'codex'] }))
      .toEqual(['run', 'k3f9a', 'b7x2q', '--context-file', '/t/c.md', '--on-finish', 'review', '--agent', 'codex'])
    expect(agentRunCliArgs({ ids: ['k3f9a'], contextFile: null, promptFile: null, onFinish: 'check', agentArgs: [] }))
      .toEqual(['run', 'k3f9a', '--on-finish', 'check'])
  })

  it('no tasks: the prompt file alone — no --on-finish, no --context-file (the CLI refuses them)', () => {
    expect(agentRunCliArgs({ ids: [], contextFile: '/t/ignored.md', promptFile: '/t/p.md', onFinish: 'review', agentArgs: ['--agent', 'claude'] }))
      .toEqual(['run', '--prompt-file', '/t/p.md', '--agent', 'claude'])
  })

  const args = (stored: unknown) => agentRunAgentArgs(sanitizeAgentTaskSettings(stored), agentCustomLaunch(stored))

  it('a preset goes by its name — and has nothing to approve', () => {
    expect(args(undefined)).toEqual({ ok: true, args: ['--agent', 'claude'] })
    expect(args({ agent: 'gemini-cli' })).toEqual({ ok: true, args: ['--agent', 'gemini'] })
    expect(args({ agent: 'OpenCode', agentCommand: 'ignored {prompt}' })).toEqual({ ok: true, args: ['--agent', 'opencode'] })
    for (const stored of [undefined, { agent: 'codex' }, { launch: 'claude-desktop', agent: 'custom', agentCommand: 'x' }, { launch: 'codex-app', agentUrl: 'my://x' }]) {
      expect(agentCustomLaunch(stored)).toBeNull()
    }
  })

  it('a custom command ALWAYS goes as the flag\'s value — the CLI never reads it from a settings.json that may have changed', () => {
    const stored = { agent: 'custom', agentCommand: '"C:\\Program Files\\x\\agent.exe" --go {prompt}' }
    expect(agentCustomLaunch(stored)).toEqual({ kind: 'command', text: stored.agentCommand, flag: stored.agentCommand, web: false })
    expect(args(stored)).toEqual({ ok: true, args: ['--agent', stored.agentCommand] })
    // Without a placeholder the template gets the prompt last, as it would in agentCommand; what is approved is what the user wrote.
    expect(agentCustomLaunch({ agent: 'custom', agentCommand: 'my-agent --fast' })).toMatchObject({ text: 'my-agent --fast', flag: 'my-agent --fast {prompt}' })
    expect(args({ agent: 'custom', agentCommand: '' })).toEqual({ ok: false, code: 'agent_invalid' })
    // A command written by hand in `agent` (the CLI takes that): that text, as the CLI would read it.
    expect(agentCustomLaunch({ agent: 'aider {prompt}', agentCommand: 'not this one' })).toMatchObject({ kind: 'command', text: 'aider {prompt}', flag: 'aider {prompt}' })
    expect(args({ agent: 'C:\\Tools\\my agent.exe' })).toEqual({ ok: true, args: ['--agent', 'C:\\Tools\\my agent.exe'] })
    // The custom link.
    expect(agentCustomLaunch({ launch: 'custom-url', agentUrl: 'https://x.example/?q={prompt}' })).toEqual({ kind: 'url', text: 'https://x.example/?q={prompt}', flag: '', web: true })
    expect(agentCustomLaunch({ launch: 'custom-url', agentUrl: 'myagent://new?p={prompt}' })).toMatchObject({ kind: 'url', web: false })
    // A custom agent chosen but never authorized as one: no arguments at all.
    expect(agentRunAgentArgs({ agent: 'custom' }, null)).toEqual({ ok: false, code: 'agent_invalid' })
  })
})

describe('the approval of a custom command / link', () => {
  const command: AgentCustomLaunch = { kind: 'command', text: 'my-agent {prompt}', flag: 'my-agent {prompt}', web: false }

  it('is the sha256 of its kind and its EXACT text: any change — a space, the kind — is another approval', () => {
    expect(agentApprovalHash('command', 'my-agent {prompt}')).toMatch(/^[a-f0-9]{64}$/)
    const hashes = new Set([
      agentApprovalHash('command', 'my-agent {prompt}'),
      agentApprovalHash('command', 'my-agent  {prompt}'),
      agentApprovalHash('command', 'My-agent {prompt}'),
      agentApprovalHash('command', 'my-agent {prompt} --yolo'),
      agentApprovalHash('url', 'my-agent {prompt}'),
    ])
    expect(hashes.size).toBe(5)
  })

  it('approved once, it stays approved until its text changes; every other key of agentTasks is kept', () => {
    const stored = { enabled: true, agent: 'custom', agentCommand: command.text, folders: { n1: '/p' }, future: 1 }
    expect(isAgentLaunchApproved(stored, command)).toBe(false)
    const approved = withAgentApproval(stored, command)
    expect(approved).toEqual({ ...stored, approved: [agentApprovalHash('command', command.text)] })
    expect(isAgentLaunchApproved(approved, command)).toBe(true)
    expect(isAgentLaunchApproved(approved, { kind: 'command', text: 'my-agent {prompt} && curl evil' })).toBe(false)
    expect(isAgentLaunchApproved(approved, { kind: 'url', text: command.text })).toBe(false)
    expect(withAgentApproval(approved, command)).toEqual(approved) // not twice
    // An empty text is never approved, whatever the file says.
    expect(isAgentLaunchApproved({ approved: [agentApprovalHash('command', '')] }, { kind: 'command', text: '' })).toBe(false)
    // Junk in the file is ignored; the list is bounded.
    expect(isAgentLaunchApproved({ approved: 'all' }, command)).toBe(false)
    expect(isAgentLaunchApproved({ approved: [42, 'x', null] }, command)).toBe(false)
    let many: unknown = {}
    for (let i = 0; i < AGENT_APPROVALS_MAX + 5; i++) many = withAgentApproval(many, { kind: 'command', text: `agent-${i} {prompt}` })
    expect((many as { approved: string[] }).approved).toHaveLength(AGENT_APPROVALS_MAX)
    expect(isAgentLaunchApproved(many, { kind: 'command', text: 'agent-0 {prompt}' })).toBe(false)
    expect(isAgentLaunchApproved(many, { kind: 'command', text: `agent-${AGENT_APPROVALS_MAX + 4} {prompt}` })).toBe(true)
  })

  it('the page cannot write an approval — nor a folder: a settings patch that names them changes neither', () => {
    const hash = agentApprovalHash('command', 'evil {prompt}')
    const stored = { enabled: true, folders: { n1: 'C:\\proj' }, approved: ['a'.repeat(64)] }
    const next = patchAgentTaskSettings(stored, { agent: 'custom', agentCommand: 'evil {prompt}', approved: [hash], folders: { n1: 'C:\\Windows' } })
    expect(next.approved).toEqual(['a'.repeat(64)])
    expect(next.folders).toEqual({ n1: 'C:\\proj' })
    expect(isAgentLaunchApproved(next, { kind: 'command', text: 'evil {prompt}' })).toBe(false)
    // Without the keys in the file, a patch does not create them.
    const fresh = patchAgentTaskSettings({}, { approved: [hash], folders: { n1: '/' } })
    expect(fresh).not.toHaveProperty('approved')
    expect(fresh).not.toHaveProperty('folders')
    // The sanitized settings the page receives carry neither.
    expect(sanitizeAgentTaskSettings(stored)).not.toHaveProperty('approved')
    expect(sanitizeAgentTaskSettings(stored)).not.toHaveProperty('folders')
  })
})

describe('authorizeAgentLaunch — the gate every launch goes through (dialogs injected)', () => {
  function gate(initial: Record<string, unknown>, over: Partial<AgentLaunchGate> = {}) {
    const state = { stored: initial as unknown, asked: [] as AgentCustomLaunch[], folderAsked: 0, answer: true, picked: 'C:\\picked' as string | null }
    const dirs = new Set(['C:\\proj', 'C:\\picked', '\\\\nas\\share\\proj'])
    const g: AgentLaunchGate = {
      readAgentTasks: () => state.stored,
      updateAgentTasks: (change) => { state.stored = change(state.stored) },
      isDirectory: (folder) => dirs.has(folder),
      noteEncrypted: () => false,
      terminalAvailable: true,
      storeBuild: false,
      platform: 'win32',
      pickFolder: async () => { state.folderAsked++; return state.picked },
      confirmCustom: async (custom) => { state.asked.push(custom); return state.answer },
      ...over,
    }
    return { g, state }
  }
  const BASE = { enabled: true, folders: { n1: 'C:\\proj' } }

  it('a preset: no dialog at all', async () => {
    const { g, state } = gate({ ...BASE, agent: 'codex' })
    expect(await authorizeAgentLaunch(g, 'n1', { mode: 'terminal' })).toMatchObject({ ok: true, folder: 'C:\\proj', custom: null, settings: { agent: 'codex' } })
    expect(state.asked).toEqual([])
    expect(state.stored).toEqual({ ...BASE, agent: 'codex' }) // nothing written
    const app = gate({ ...BASE, launch: 'claude-desktop' })
    expect(await authorizeAgentLaunch(app.g, 'n1', { mode: 'app' })).toMatchObject({ ok: true, custom: null })
    expect(app.state.asked).toEqual([])
  })

  it('a custom command: the native dialog shows its exact text; accepted → remembered, and not asked again', async () => {
    const { g, state } = gate({ ...BASE, agent: 'custom', agentCommand: 'my-agent {prompt}' })
    const first = await authorizeAgentLaunch(g, 'n1', { mode: 'terminal' })
    expect(first).toMatchObject({ ok: true, custom: { kind: 'command', text: 'my-agent {prompt}', flag: 'my-agent {prompt}' } })
    expect(state.asked).toEqual([{ kind: 'command', text: 'my-agent {prompt}', flag: 'my-agent {prompt}', web: false }])
    expect((state.stored as { approved: string[] }).approved).toEqual([agentApprovalHash('command', 'my-agent {prompt}')])
    await authorizeAgentLaunch(g, 'n1', { mode: 'terminal' })
    expect(state.asked).toHaveLength(1)
  })

  it('cancelled: nothing is launched ("canceled"), nothing is remembered — and it asks again next time', async () => {
    const { g, state } = gate({ ...BASE, agent: 'custom', agentCommand: 'my-agent {prompt}' })
    state.answer = false
    expect(await authorizeAgentLaunch(g, 'n1', { mode: 'terminal' })).toEqual({ ok: false, code: 'canceled' })
    expect(state.stored).not.toHaveProperty('approved')
    expect(await authorizeAgentLaunch(g, 'n1', { mode: 'terminal' })).toEqual({ ok: false, code: 'canceled' })
    expect(state.asked).toHaveLength(2)
  })

  it('changing the command invalidates the approval', async () => {
    const { g, state } = gate({ ...BASE, agent: 'custom', agentCommand: 'my-agent {prompt}' })
    await authorizeAgentLaunch(g, 'n1')
    // The page rewrites the command (the only thing it can write): approved text ≠ this text.
    state.stored = patchAgentTaskSettings(state.stored, { agentCommand: 'my-agent {prompt} && curl https://evil.example' })
    state.answer = false
    expect(await authorizeAgentLaunch(g, 'n1', { mode: 'terminal' })).toEqual({ ok: false, code: 'canceled' })
    expect(state.asked.map((a) => a.text)).toEqual(['my-agent {prompt}', 'my-agent {prompt} && curl https://evil.example'])
    // Back to the approved text: no question.
    state.stored = patchAgentTaskSettings(state.stored, { agentCommand: 'my-agent {prompt}' })
    expect(await authorizeAgentLaunch(g, 'n1', { mode: 'terminal' })).toMatchObject({ ok: true })
    expect(state.asked).toHaveLength(2)
  })

  it('what is launched is the text that was judged: a change of settings.json WHILE the dialog is open is not picked up', async () => {
    const { g, state } = gate({ ...BASE, agent: 'custom', agentCommand: 'my-agent {prompt}' })
    g.confirmCustom = async (custom) => {
      state.asked.push(custom)
      state.stored = patchAgentTaskSettings(state.stored, { agentCommand: 'evil {prompt}' })
      return true
    }
    const grant = await authorizeAgentLaunch(g, 'n1', { mode: 'terminal' })
    expect(grant).toMatchObject({ ok: true, custom: { text: 'my-agent {prompt}', flag: 'my-agent {prompt}' } })
    // …and the approval stored is of the text shown, not of the new one.
    expect(isAgentLaunchApproved(state.stored, { kind: 'command', text: 'my-agent {prompt}' })).toBe(true)
    expect(isAgentLaunchApproved(state.stored, { kind: 'command', text: 'evil {prompt}' })).toBe(false)
  })

  it('a custom link: asked the same way, flagged as a web link when it is http(s); an invalid one never reaches the dialog', async () => {
    const web = gate({ ...BASE, launch: 'custom-url', agentUrl: 'https://x.example/run?q={prompt}' })
    expect(await authorizeAgentLaunch(web.g, 'n1', { mode: 'app' })).toMatchObject({ ok: true, custom: { kind: 'url', web: true } })
    expect(web.state.asked).toEqual([{ kind: 'url', text: 'https://x.example/run?q={prompt}', flag: '', web: true }])
    const bad = gate({ ...BASE, launch: 'custom-url', agentUrl: 'file:///C:/Windows/System32/calc.exe' })
    expect(await authorizeAgentLaunch(bad.g, 'n1', { mode: 'app' })).toEqual({ ok: false, code: 'invalid_url' })
    const empty = gate({ ...BASE, launch: 'custom-url' })
    expect(await authorizeAgentLaunch(empty.g, 'n1', { mode: 'app' })).toEqual({ ok: false, code: 'invalid_url' })
    const noCommand = gate({ ...BASE, agent: 'custom' })
    expect(await authorizeAgentLaunch(noCommand.g, 'n1', { mode: 'terminal' })).toEqual({ ok: false, code: 'agent_invalid' })
    expect([...bad.state.asked, ...empty.state.asked, ...noCommand.state.asked]).toEqual([])
  })

  it('refuses with the feature off and for an encrypted note — before any dialog', async () => {
    const off = gate({ ...BASE, enabled: false, agent: 'custom', agentCommand: 'x {prompt}' })
    expect(await authorizeAgentLaunch(off.g, 'n1', { askFolder: true })).toEqual({ ok: false, code: 'disabled' })
    const locked = gate({ ...BASE, agent: 'custom', agentCommand: 'x {prompt}' }, { noteEncrypted: (id) => id === 'n1' })
    expect(await authorizeAgentLaunch(locked.g, 'n1', { askFolder: true })).toEqual({ ok: false, code: 'disabled' })
    expect([...off.state.asked, ...locked.state.asked]).toEqual([])
    expect(off.state.folderAsked + locked.state.folderAsked).toBe(0)
  })

  it('the launch mode must be the one the caller is about to use; a terminal must be possible in this build', async () => {
    const terminal = gate({ ...BASE })
    expect(await authorizeAgentLaunch(terminal.g, 'n1', { mode: 'app' })).toEqual({ ok: false, code: 'invalid_request' })
    const app = gate({ ...BASE, launch: 'codex-app' })
    expect(await authorizeAgentLaunch(app.g, 'n1', { mode: 'terminal' })).toEqual({ ok: false, code: 'invalid_request' })
    expect(await authorizeAgentLaunch(gate({ ...BASE }, { terminalAvailable: false, storeBuild: true }).g, 'n1')).toEqual({ ok: false, code: 'not_available' })
    expect(await authorizeAgentLaunch(gate({ ...BASE }, { terminalAvailable: false }).g, 'n1')).toEqual({ ok: false, code: 'cli_missing' })
    // A desktop app does not need the CLI.
    expect(await authorizeAgentLaunch(gate({ ...BASE, launch: 'codex-app' }, { terminalAvailable: false, storeBuild: true }).g, 'n1')).toMatchObject({ ok: true })
  })

  it('the folder: only the native dialog sets it — asked in the preflight, never by the launch itself', async () => {
    const none = gate({ enabled: true })
    expect(await authorizeAgentLaunch(none.g, 'n1', { mode: 'terminal' })).toEqual({ ok: false, code: 'no_folder' })
    expect(none.state.folderAsked).toBe(0)
    expect(await authorizeAgentLaunch(none.g, 'n1', { askFolder: true })).toMatchObject({ ok: true, folder: 'C:\\picked' })
    expect(none.state.stored).toEqual({ enabled: true, folders: { n1: 'C:\\picked' } })
    // Gone from the disk: asked again; closing the dialog is "canceled" and nothing is stored.
    const gone = gate({ enabled: true, folders: { n1: 'C:\\deleted' } })
    gone.state.picked = null
    expect(await authorizeAgentLaunch(gone.g, 'n1', { askFolder: true })).toEqual({ ok: false, code: 'canceled' })
    expect(gone.state.stored).toEqual({ enabled: true, folders: { n1: 'C:\\deleted' } })
    // The folder is asked BEFORE the approval: cancelling it never shows the second dialog.
    const both = gate({ enabled: true, agent: 'custom', agentCommand: 'x {prompt}' })
    both.state.picked = null
    await authorizeAgentLaunch(both.g, 'n1', { askFolder: true })
    expect(both.state.asked).toEqual([])
  })

  it('Windows: a network folder cannot hold a terminal run (cmd has no UNC current directory) — a desktop app can use it', async () => {
    const unc = { enabled: true, folders: { n1: '\\\\nas\\share\\proj' } }
    expect(await authorizeAgentLaunch(gate(unc).g, 'n1', { mode: 'terminal' })).toEqual({ ok: false, code: 'unc_folder' })
    expect(await authorizeAgentLaunch(gate({ ...unc, launch: 'claude-desktop' }).g, 'n1', { mode: 'app' })).toMatchObject({ ok: true })
    expect(await authorizeAgentLaunch(gate(unc, { platform: 'linux' }).g, 'n1', { mode: 'terminal' })).toMatchObject({ ok: true })
  })
})

describe('what noteflow run --dry-run --json said', () => {
  const ok = JSON.stringify({ dryRun: true, tracked: true, ids: ['k3f9a'] })
  it('exit 0 with its JSON: go ahead', () => {
    expect(interpretAgentDryRun({ code: 0, stdout: ok, stderr: '' })).toEqual({ ok: true })
  })

  it.each(['agent_not_found', 'agent_invalid', 'no_queued_tasks', 'task_not_found', 'note_not_found', 'section_not_found', 'file_unreadable', 'file_empty'] as const)(
    'the code %s is passed on',
    (code) => {
      const stdout = JSON.stringify({ error: 'English text', code, agent: 'claude', command: 'claude' })
      const res = interpretAgentDryRun({ code: 1, stdout, stderr: '  Error: English text\n' })
      expect(res).toMatchObject({ ok: false, code, detail: 'English text' })
      expect('agent' in res && res.agent).toBe(code === 'agent_not_found' ? 'claude' : false)
    },
  )

  it('anything else is a plain failure with the CLI\'s last line: a usage error, a crash, a timeout, a code we do not know', () => {
    expect(interpretAgentDryRun({ code: 1, stdout: '', stderr: '\n  Error: --on-finish needs tasks\n' })).toEqual({ ok: false, code: 'failed', detail: '--on-finish needs tasks' })
    expect(interpretAgentDryRun({ code: null, stdout: '', stderr: '' })).toEqual({ ok: false, code: 'failed', detail: undefined })
    expect(interpretAgentDryRun({ code: 1, stdout: JSON.stringify({ error: 'x', code: 'from_the_future' }), stderr: '' })).toEqual({ ok: false, code: 'failed', detail: 'x' })
    expect(interpretAgentDryRun({ code: 0, stdout: 'not json', stderr: '' })).toMatchObject({ ok: false, code: 'failed' })
    // Exit 1 with a dry-run JSON is not a pass either.
    expect(interpretAgentDryRun({ code: 1, stdout: ok, stderr: '' })).toMatchObject({ ok: false, code: 'failed' })
  })
})

// ── The launcher script ──────────────────────────────────────────────────────

const ENV = { ELECTRON_RUN_AS_NODE: '1', NOTEFLOW_NO_APP_CHECK: '1' }

describe('the launcher script: Windows (.cmd)', () => {
  const base: AgentLauncherInput = {
    platform: 'win32',
    folder: 'C:\\Users\\Ana\\My Project',
    execPath: 'C:\\Users\\Ana\\AppData\\Local\\Programs\\NoteFlow\\NoteFlow.exe',
    cliScript: 'C:\\Users\\Ana\\AppData\\Local\\Programs\\NoteFlow\\resources\\cli\\noteflow.js',
    args: ['run', 'k3f9a', 'b7x2q', '--context-file', 'C:\\Users\\Ana\\AppData\\Roaming\\NoteFlow\\tmp\\agent-run-0a1b2c3d4e5f.context.md', '--on-finish', 'check', '--agent', 'claude'],
    env: ENV,
  }

  it('two tasks, a context and a folder with spaces — the exact text', () => {
    const script = buildAgentLauncherScript(base)
    expect(script).toEqual({
      ok: true,
      ext: '.cmd',
      text: [
        '@echo off',
        'cd /d "C:\\Users\\Ana\\My Project" || exit /b 1',
        'setlocal DisableDelayedExpansion',
        'set "ELECTRON_RUN_AS_NODE=1"',
        'set "NOTEFLOW_NO_APP_CHECK=1"',
        '"C:\\Users\\Ana\\AppData\\Local\\Programs\\NoteFlow\\NoteFlow.exe" "C:\\Users\\Ana\\AppData\\Local\\Programs\\NoteFlow\\resources\\cli\\noteflow.js" run k3f9a b7x2q --context-file "C:\\Users\\Ana\\AppData\\Roaming\\NoteFlow\\tmp\\agent-run-0a1b2c3d4e5f.context.md" --on-finish check --agent claude',
        'endlocal',
        '',
      ].join('\r\n'),
    })
  })

  it('`%` is doubled, `& ^ ! ( )` stay inside the quotes, and the code page only changes for non-ASCII text', () => {
    const script = buildAgentLauncherScript({ ...base, folder: 'D:\\50% done & co (x) ^y !z' })
    expect(script.ok && script.text.split('\r\n')[1]).toBe('cd /d "D:\\50%% done & co (x) ^y !z" || exit /b 1')
    expect(script.ok && script.text).not.toContain('chcp')
    const accents = buildAgentLauncherScript({ ...base, folder: 'C:\\Proyectos\\añadir café' })
    expect(accents.ok && accents.text.split('\r\n').slice(0, 3)).toEqual(['@echo off', 'chcp 65001 >nul', 'cd /d "C:\\Proyectos\\añadir café" || exit /b 1'])
  })

  it('the folder is entered BEFORE setlocal (which restores the directory): the prompt that stays is in the project', () => {
    const script = buildAgentLauncherScript(base)
    const lines = script.ok ? script.text.split('\r\n') : []
    expect(lines.findIndex((l) => l.startsWith('cd /d'))).toBeLessThan(lines.indexOf('setlocal DisableDelayedExpansion'))
  })

  it('a network folder is refused with its own code: `cd /d` cannot enter a UNC path', () => {
    for (const folder of ['\\\\nas\\share\\proj', '//nas/share/proj', '\\\\?\\C:\\long']) {
      expect(buildAgentLauncherScript({ ...base, folder })).toEqual({ ok: false, code: 'unc_folder', value: folder })
    }
  })

  it('an argument that holds a double quote (a custom command) is written with no quote cmd can see: carets all the way', () => {
    const script = buildAgentLauncherScript({ ...base, args: ['run', 'k3f9a', '--agent', '"C:\\Program Files\\x\\agent.exe" --go {prompt} & 50%'] })
    expect(script.ok && script.text.split('\r\n')[5].endsWith('run k3f9a --agent ^"\\^"C:\\Program Files\\x\\agent.exe\\^" --go {prompt} ^& 50%%^"')).toBe(true)
  })

  it('an argument that ends in a backslash keeps it (it must not escape the closing quote)', () => {
    const script = buildAgentLauncherScript({ ...base, args: ['run', '--prompt-file', 'C:\\with space\\'] })
    expect(script.ok && script.text).toContain('--prompt-file "C:\\with space\\\\"')
  })

  it.each([
    ['a double quote in the folder', { folder: 'C:\\a"b' }],
    ['a line break in the folder', { folder: 'C:\\a\r\nwhoami' }],
    ['a line break in an argument with quotes', { args: ['run', '--agent', '"x"\r\ncalc'] }],
    ['a control character in the CLI path', { cliScript: 'C:\\x\u0007\\noteflow.js' }],
    ['an environment name that is not one', { env: { 'A&B': '1' } }],
  ])('refuses what it cannot write safely: %s', (_name, over) => {
    expect(buildAgentLauncherScript({ ...base, ...over })).toMatchObject({ ok: false, code: 'unsafe_path' })
  })
})

describe('the launcher script: macOS / Linux (sh)', () => {
  const base: AgentLauncherInput = {
    platform: 'linux',
    folder: '/home/ana/my project',
    execPath: '/opt/NoteFlow/noteflow',
    cliScript: '/opt/NoteFlow/resources/cli/noteflow.js',
    args: ['run', 'k3f9a', '--context-file', '/home/ana/.config/NoteFlow/tmp/agent-run-0a1b.context.md', '--on-finish', 'review', '--agent', 'claude'],
    env: ENV,
  }

  it('the exact text: cd, the CLI through the user\'s zsh / bash (its PATH), a shell left open', () => {
    const command = 'env ELECTRON_RUN_AS_NODE=1 NOTEFLOW_NO_APP_CHECK=1 /opt/NoteFlow/noteflow /opt/NoteFlow/resources/cli/noteflow.js run k3f9a --context-file /home/ana/.config/NoteFlow/tmp/agent-run-0a1b.context.md --on-finish review --agent claude'
    expect(buildAgentLauncherScript(base)).toEqual({
      ok: true,
      ext: '.sh',
      text: [
        '#!/bin/sh',
        "if cd -- '/home/ana/my project'; then",
        '  case "${SHELL##*/}" in',
        `    zsh|bash) "$SHELL" -l -i -c '${command}' ;;`,
        `    *) ${command} ;;`,
        '  esac',
        'fi',
        'exec "${SHELL:-/bin/sh}"',
        '',
      ].join('\n'),
    })
    expect(buildAgentLauncherScript({ ...base, platform: 'darwin' })).toMatchObject({ ok: true, ext: '.command' })
  })

  it("everything that is not a plain word is single-quoted; a quote inside becomes '\\''", () => {
    const script = buildAgentLauncherScript({ ...base, folder: "/home/ana/it's $HOME `x` \"q\" & co", args: ['run', '--agent', 'my agent {prompt}'] })
    const text = script.ok ? script.text : ''
    expect(text).toContain(`if cd -- '/home/ana/it'\\''s $HOME \`x\` "q" & co'; then`)
    expect(text).toContain(`    *) env ELECTRON_RUN_AS_NODE=1 NOTEFLOW_NO_APP_CHECK=1 /opt/NoteFlow/noteflow /opt/NoteFlow/resources/cli/noteflow.js run --agent 'my agent {prompt}' ;;`)
  })

  it('refuses a control character (a line break would start a new command)', () => {
    expect(buildAgentLauncherScript({ ...base, folder: '/home/a\nrm -rf x' })).toMatchObject({ ok: false, code: 'unsafe_path' })
  })
})

describe('the launcher script, run by the real interpreter (Node stands in for the app; nothing is launched)', () => {
  let tmp: string
  let recorder: string
  // Every character a path may carry and a shell may misread — a folder, and an argument.
  const NASTY = WINDOWS ? "50% & co (x) ^y !z 'q' ñandú 東京 $HOME `b`" : `50% & co (x) ^y !z 'q' "dq" ñandú 東京 $HOME \`b\` \\`

  beforeAll(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-launcher-')))
    recorder = path.join(tmp, 'rec ord&er.cjs')
    fs.writeFileSync(recorder, [
      "const fs = require('fs')",
      'fs.writeFileSync(process.env.NF_TEST_OUT, JSON.stringify({',
      '  argv: process.argv.slice(2), cwd: process.cwd(), ran: process.env.ELECTRON_RUN_AS_NODE, notes: process.env.NOTEFLOW_NOTES_DIR,',
      '}))',
    ].join('\n'))
  })
  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  function launch(platform: NodeJS.Platform, run: (scriptFile: string, out: string) => void) {
    const folder = path.join(tmp, NASTY)
    fs.mkdirSync(folder, { recursive: true })
    const textFile = path.join(folder, 'agent-run-ab12.context.md')
    // The custom command as the app passes it: quotes, a path with spaces, and every shell character after it.
    const args = ['run', 'k3f9a', 'b7x2q', '--context-file', textFile, '--on-finish', 'check', '--agent', `"C:\\Program Files\\x y\\agent.exe" "a \\"q\\" b\\\\" {prompt} ${NASTY}`]
    const script = buildAgentLauncherScript({
      platform, folder, execPath: process.execPath, cliScript: recorder, args,
      env: { ELECTRON_RUN_AS_NODE: '1', NOTEFLOW_NOTES_DIR: folder },
    })
    if (!script.ok) throw new Error(`unsafe: ${script.value}`)
    const scriptFile = path.join(tmp, `agent-run-test${script.ext}`)
    fs.writeFileSync(scriptFile, script.text, { encoding: 'utf-8', mode: 0o700 })
    const out = path.join(tmp, `out-${platform}.json`)
    fs.rmSync(out, { force: true })
    run(scriptFile, out)
    const seen = JSON.parse(fs.readFileSync(out, 'utf-8')) as { argv: string[]; cwd: string; ran: string; notes: string }
    expect(seen.argv).toEqual(args)
    expect(fs.realpathSync(seen.cwd).toLowerCase()).toBe(fs.realpathSync(folder).toLowerCase())
    expect(seen).toMatchObject({ ran: '1', notes: folder })
  }

  it.runIf(WINDOWS)('cmd.exe: spaces, %, &, ^, !, parentheses and non-ASCII reach the program intact', () => {
    launch('win32', (scriptFile, out) => {
      // As the app starts it (cmd.exe /d /v:off … .\<file name>, from the script's folder) — with /c instead of /k: no window stays.
      const r = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/v:off', '/c', `.\\${path.basename(scriptFile)}`], {
        cwd: path.dirname(scriptFile), env: { ...process.env, NF_TEST_OUT: out, ELECTRON_RUN_AS_NODE: undefined }, encoding: 'utf-8', windowsHide: true,
      })
      expect(r.status, r.stderr).toBe(0)
    })
  })

  // The branch real users take: zsh / bash as $SHELL → the command goes through it, login + interactive.
  // Git Bash stands in on Windows. HOME is an empty folder: no rc file of this machine runs.
  const bash = WINDOWS
    ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'].find((f) => fs.existsSync(f)) ?? null
    : ['/bin/bash', '/usr/bin/bash', '/bin/zsh'].find((f) => fs.existsSync(f)) ?? null
  it.runIf(bash !== null)('bash / zsh as $SHELL: the command reaches the program intact through `"$SHELL" -l -i -c`', () => {
    const home = path.join(tmp, 'empty-home')
    fs.mkdirSync(home, { recursive: true })
    launch(WINDOWS ? 'linux' : process.platform, (scriptFile, out) => {
      const r = spawnSync(bash!, [scriptFile], {
        env: {
          ...process.env, NF_TEST_OUT: out, HOME: home, ELECTRON_RUN_AS_NODE: undefined,
          // Inside Git Bash: its own bash by its POSIX name; keep the folder (its profile would cd to HOME) and the arguments as they are.
          SHELL: WINDOWS ? '/usr/bin/bash' : bash!, CHERE_INVOKING: '1', MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*',
        },
        encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, windowsHide: true,
      })
      expect(r.status, r.stderr).toBe(0)
    })
  }, 90_000)

  const sh = WINDOWS ? null : '/bin/sh'
  it.runIf(sh !== null)('sh: quotes, $, backticks, backslashes and non-ASCII reach the program intact (the direct branch)', () => {
    launch(process.platform, (scriptFile, out) => {
      // SHELL=/bin/true: the direct branch runs, and the final `exec $SHELL` ends at once.
      const r = spawnSync(sh!, [scriptFile], { env: { ...process.env, NF_TEST_OUT: out, SHELL: '/bin/true', ELECTRON_RUN_AS_NODE: undefined }, encoding: 'utf-8' })
      expect(r.status, r.stderr).toBe(0)
    })
  })
})

// ── Which terminal ───────────────────────────────────────────────────────────

describe('which terminal', () => {
  const ctx = {
    scriptDir: 'C:\\Users\\Ana & co\\AppData\\Roaming\\NoteFlow\\tmp',
    scriptName: 'agent-run-0a1b2c3d4e5f.cmd',
    which: () => null,
    windowsTerminal: 'C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
    comspec: 'C:\\Windows\\System32\\cmd.exe',
  }

  it('Windows: Windows Terminal first, then cmd — the script named by its file name alone, its folder as the working directory', () => {
    expect(agentTerminalPlans('win32', ctx)).toEqual([
      { name: 'Windows Terminal', command: ctx.windowsTerminal, args: ['-d', ctx.scriptDir, ctx.comspec, '/d', '/v:off', '/k', `.\\${ctx.scriptName}`], cwd: ctx.scriptDir },
      {
        name: 'cmd', command: ctx.comspec, args: ['/d', '/s', '/c', '"start "NoteFlow" C:\\Windows\\System32\\cmd.exe /d /v:off /k .\\agent-run-0a1b2c3d4e5f.cmd"'],
        cwd: ctx.scriptDir, verbatim: true, hidden: true,
      },
    ])
    // cmd.exe is never named bare: the working directory is a folder of temp files, searched first.
    for (const plan of agentTerminalPlans('win32', ctx)) expect(plan.args.join(' ')).not.toMatch(/(^|[ "])cmd\.exe/)
    expect(agentTerminalPlans('win32', { ...ctx, comspec: 'cmd.exe' })).toEqual([])
    expect(agentTerminalPlans('win32', { ...ctx, comspec: 'C:\\evil & dir\\cmd.exe' })).toEqual([])
    // No path ever appears in the one command line cmd parses.
    const cmd = agentTerminalPlans('win32', ctx)[1]
    expect(cmd.args.join(' ')).not.toContain('Ana')
  })

  it('Windows: no Windows Terminal — or a folder it would split on `;` — leaves cmd alone', () => {
    expect(agentTerminalPlans('win32', { ...ctx, windowsTerminal: null }).map((p) => p.name)).toEqual(['cmd'])
    expect(agentTerminalPlans('win32', { ...ctx, scriptDir: 'C:\\a;b\\tmp' }).map((p) => p.name)).toEqual(['cmd'])
  })

  it('macOS: Terminal.app on the script', () => {
    expect(agentTerminalPlans('darwin', { ...ctx, scriptDir: '/Users/ana/Library/Application Support/NoteFlow/tmp', scriptName: 'agent-run-0a.command' }))
      .toEqual([{ name: 'Terminal', command: '/usr/bin/open', args: ['-a', 'Terminal', '/Users/ana/Library/Application Support/NoteFlow/tmp/agent-run-0a.command'] }])
  })

  it('Linux: the installed ones, in order, each with the script as ONE argument', () => {
    const installed = new Set(['konsole', 'xterm', 'gnome-terminal'])
    const plans = agentTerminalPlans('linux', {
      ...ctx, scriptDir: '/home/ana/.config/Note Flow/tmp', scriptName: 'agent-run-0a.sh', which: (name) => (installed.has(name) ? `/usr/bin/${name}` : null),
    })
    const script = '/home/ana/.config/Note Flow/tmp/agent-run-0a.sh'
    expect(plans.map((p) => [p.command, p.args])).toEqual([
      ['/usr/bin/gnome-terminal', ['--', script]],
      ['/usr/bin/konsole', ['-e', script]],
      ['/usr/bin/xterm', ['-e', script]],
    ])
    expect(agentTerminalPlans('linux', { ...ctx, scriptDir: '/t', scriptName: 'agent-run-0a.sh' })).toEqual([]) // none installed
    const all = agentTerminalPlans('linux', { ...ctx, scriptDir: '/t', scriptName: 'agent-run-0a.sh', which: (name) => `/usr/bin/${name}` })
    expect(all.map((p) => path.posix.basename(p.command))).toEqual(['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'])
    expect(all[3].args).toEqual(['-x', '/t/agent-run-0a.sh'])
  })

  it('safeComspec: an absolute cmd.exe — %ComSpec% when it is a plain one, else under %SystemRoot%, else the usual place', () => {
    expect(safeComspec({ ComSpec: 'C:\\WINDOWS\\system32\\cmd.exe' })).toBe('C:\\WINDOWS\\system32\\cmd.exe')
    expect(safeComspec({ COMSPEC: 'D:\\Win\\System32\\cmd.exe' })).toBe('D:\\Win\\System32\\cmd.exe')
    for (const bad of ['cmd.exe', '.\\cmd.exe', 'C:\\tmp\\evil.exe', 'C:\\a b\\cmd.exe', 'C:\\a&b\\cmd.exe', '\\\\nas\\x\\cmd.exe', '']) {
      expect(safeComspec({ ComSpec: bad, SystemRoot: 'E:\\Windows' }), bad).toBe('E:\\Windows\\System32\\cmd.exe')
    }
    expect(safeComspec({ ComSpec: 'powershell.exe', windir: 'F:\\W' })).toBe('F:\\W\\System32\\cmd.exe')
    expect(safeComspec({})).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(safeComspec({ SystemRoot: 'C:\\Win dows' })).toBe('C:\\Windows\\System32\\cmd.exe')
  })

  it('a script name main did not make opens nothing', () => {
    for (const scriptName of ['run & calc.cmd', '..\\x.cmd', 'a b.cmd', '']) {
      expect(agentTerminalPlans('win32', { ...ctx, scriptName })).toEqual([])
      expect(agentTerminalPlans('linux', { ...ctx, scriptName, which: (n) => `/usr/bin/${n}` })).toEqual([])
    }
  })
})

// ── The link of a desktop app ────────────────────────────────────────────────

describe('the link of a desktop app', () => {
  const prompt = 'Haz esta tarea: k3f9a\n«año» & 100% #1 ?x=y'
  const folder = 'C:\\Users\\Ana\\My Project & co'

  it('Claude Desktop and Codex: fixed links, both values URL-encoded', () => {
    expect(buildAgentAppUrl('claude-desktop', { prompt, folder })).toEqual({
      ok: true, scheme: 'claude', promptOmitted: false,
      url: `claude://code/new?q=${encodeURIComponent(prompt)}&folder=${encodeURIComponent(folder)}`,
    })
    expect(buildAgentAppUrl('codex-app', { prompt, folder })).toEqual({
      ok: true, scheme: 'codex', promptOmitted: false,
      url: `codex://new?prompt=${encodeURIComponent(prompt)}&path=${encodeURIComponent(folder)}`,
    })
    const url = new URL((buildAgentAppUrl('claude-desktop', { prompt, folder }) as { url: string }).url)
    expect(url.searchParams.get('q')).toBe(prompt)
    expect(url.searchParams.get('folder')).toBe(folder)
    // A template in the settings never changes a preset's link.
    expect(buildAgentAppUrl('codex-app', { prompt: 'p', folder: '/f', template: 'file:///x?{prompt}' })).toMatchObject({ url: 'codex://new?prompt=p&path=%2Ff' })
  })

  it('a custom link: the placeholders filled in once, URL-encoded', () => {
    expect(buildAgentAppUrl('custom-url', { prompt: 'a {folder} b', folder: '/home/a b', template: '  myagent://new?p={prompt}&d={folder}&again={prompt} ' })).toEqual({
      ok: true, scheme: 'myagent', promptOmitted: false,
      url: 'myagent://new?p=a%20%7Bfolder%7D%20b&d=%2Fhome%2Fa%20b&again=a%20%7Bfolder%7D%20b',
    })
    expect(buildAgentAppUrl('custom-url', { prompt: 'x', folder: '/f', template: 'https://example.com/run?q={prompt}' })).toMatchObject({ ok: true, scheme: 'https' })
  })

  it('a long prompt is never cut: the link carries the folder alone and says so', () => {
    const long = 'x'.repeat(AGENT_URL_PROMPT_MAX + 1)
    expect(buildAgentAppUrl('claude-desktop', { prompt: long, folder: '/f' })).toEqual({ ok: true, scheme: 'claude', promptOmitted: true, url: 'claude://code/new?folder=%2Ff' })
    expect(buildAgentAppUrl('codex-app', { prompt: long, folder: '/f' })).toMatchObject({ promptOmitted: true, url: 'codex://new?path=%2Ff' })
    expect(buildAgentAppUrl('custom-url', { prompt: long, folder: '/f', template: 'my://x?p={prompt}&d={folder}' })).toMatchObject({ promptOmitted: true, url: 'my://x?p=&d=%2Ff' })
    // Under the character limit but over the link's once encoded (every 'ñ' is six characters).
    const wide = 'ñ'.repeat(AGENT_URL_PROMPT_MAX)
    expect(encodeURIComponent(wide).length).toBeGreaterThan(AGENT_URL_MAX)
    expect(buildAgentAppUrl('claude-desktop', { prompt: wide, folder: '/f' })).toMatchObject({ promptOmitted: true, url: 'claude://code/new?folder=%2Ff' })
    // Just inside both limits: sent whole.
    expect(buildAgentAppUrl('claude-desktop', { prompt: 'x'.repeat(AGENT_URL_PROMPT_MAX), folder: '/f' })).toMatchObject({ promptOmitted: false })
    // Asked for without the prompt (the OS refused the long link).
    expect(buildAgentAppUrl('claude-desktop', { prompt: 'short', folder: '/f', omitPrompt: true })).toMatchObject({ promptOmitted: true, url: 'claude://code/new?folder=%2Ff' })
    // A link that is too long even without the prompt is not opened.
    expect(buildAgentAppUrl('claude-desktop', { prompt: 'p', folder: `/${'d'.repeat(AGENT_URL_MAX)}` })).toEqual({ ok: false, code: 'invalid_url' })
  })

  it('the terminal mode has no link', () => {
    expect(buildAgentAppUrl('terminal', { prompt: 'p', folder: '/f' })).toEqual({ ok: false, code: 'invalid_url' })
  })

  it.each([
    'file:///C:/Windows/System32/calc.exe?{prompt}',
    'FILE://host/share/{prompt}',
    'javascript://%0Aalert(1)//{prompt}',
    'data://text/html,{prompt}',
    'vbscript://x{prompt}',
    'blob://x',
    'about://blank',
    'chrome://settings/{prompt}',
    'ms-msdt://-id PCWDiagnostic /skip force /param "{prompt}"',
    'ms-msdt://x?{prompt}',
    'search-ms://query={prompt}&crumb=location:\\\\evil\\share',
    'ms-officecmd://{prompt}',
    'ms-settings://privacy',
    'Ms-Word://ofe|u|{prompt}',
    'smb://evil/share/{folder}',
    'ssh://host/{prompt}',
    'itms-services://?action=download-manifest&url={prompt}',
    'help://anchor={prompt}',
    'cifs://evil/share/{folder}',
    'vnc://evil.example/{prompt}',
    'rdp://full%20address=s:evil.example',
    'x-man-page://1/{prompt}',
    'applescript://com.apple.scripteditor?action=new&script={prompt}',
    'shortcuts://run-shortcut?name={prompt}',
  ])('a custom link the app never opens: %s', (template) => {
    expect(agentUrlTemplateScheme(template)).toBeNull()
    expect(buildAgentAppUrl('custom-url', { prompt: 'p', folder: '/f', template })).toEqual({ ok: false, code: 'invalid_url' })
  })

  it.each([
    ['no scheme', 'new?prompt={prompt}'],
    ['a scheme without //', 'myagent:new?p={prompt}'],
    ['a placeholder as the scheme', '{prompt}://x'],
    ['a scheme that starts with a digit', '1app://x'],
    ['a space in it', 'myagent://new?p={prompt} --flag'],
    ['a line break in it', 'myagent://new\n?p={prompt}'],
    ['empty', '   '],
    ['too long', `myagent://${'x'.repeat(2000)}`],
  ])('a custom link that is not a link: %s', (_name, template) => {
    expect(agentUrlTemplateScheme(template)).toBeNull()
    expect(buildAgentAppUrl('custom-url', { prompt: 'p', folder: '/f', template })).toEqual({ ok: false, code: 'invalid_url' })
  })

  it('the deny list names the dangerous families, and every ms-* scheme is refused beyond it', () => {
    for (const scheme of ['file', 'javascript', 'data', 'vbscript', 'blob', 'about', 'chrome', 'ms-msdt', 'search-ms', 'ms-officecmd',
      'help', 'cifs', 'vnc', 'x-man-page', 'applescript', 'rdp']) {
      expect(AGENT_URL_DENIED_SCHEMES).toContain(scheme)
    }
    expect(agentUrlTemplateScheme('ms-anything-new://x')).toBeNull()
    expect(agentUrlTemplateScheme('cursor://new?prompt={prompt}')).toBe('cursor')
    expect(agentUrlTemplateScheme('VSCode://ext.agent/run?q={prompt}')).toBe('vscode')
  })

  it('what the prompt contains can never change the scheme or add a second link', () => {
    const evil = 'x&folder=/etc#" file:///etc/passwd javascript:alert(1)\n\r'
    const built = buildAgentAppUrl('custom-url', { prompt: evil, folder: '/f', template: 'my://run?q={prompt}&folder={folder}' })
    expect(built.ok && new URL(built.url).protocol).toBe('my:')
    expect(built.ok && new URL(built.url).searchParams.get('q')).toBe(evil)
    expect(built.ok && new URL(built.url).searchParams.get('folder')).toBe('/f')
    expect(built.ok && /[\s"]/.test(built.url)).toBe(false)
  })
})

describe('the temp files of a run', () => {
  it('the text (context / prompt) goes after ten minutes, the script after a week; nothing else is touched', () => {
    expect(agentRunTmpExpired('agent-run-0a1b.context.md', AGENT_RUN_TEXT_TTL_MS + 1)).toBe(true)
    expect(agentRunTmpExpired('agent-run-0a1b.prompt.md', AGENT_RUN_TEXT_TTL_MS - 1)).toBe(false)
    expect(agentRunTmpExpired('agent-run-0a1b.cmd', AGENT_RUN_TEXT_TTL_MS + 1)).toBe(false)
    expect(agentRunTmpExpired('agent-run-0a1b.cmd', AGENT_RUN_SCRIPT_TTL_MS + 1)).toBe(true)
    expect(agentRunTmpExpired('something-else.md', Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})
