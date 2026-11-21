// Agent tasks — "Run": launching an agent from the app. PURE logic only (no
// fs, no spawn, no electron): what the IPC payloads may carry, the arguments of
// `noteflow run`, the launcher script a terminal window executes, which
// terminal to open, and the link that opens a desktop agent app. The IO lives
// in agentRunIo.ts; everything here is covered by tests/electron/agentRun.test.ts.
//
// Two ways to launch (settings.json → agentTasks.launch):
//   - 'terminal': an EXTERNAL terminal window, in the note's project folder,
//     running the bundled CLI (on Windows with the computer's own node.exe —
//     the app's binary gets no console there, see systemNode.ts):
//     `noteflow run <ids> [--context-file f]
//     --on-finish <setting> [--parallel] [--model m] [--effort e]` (tasks: tracked) or
//     `noteflow run --prompt-file f [--model m] [--effort e]`
//     (a selection without tasks: untracked). The terminal never gets a command
//     line built from user text: main writes a small launcher script with every
//     value escaped for that interpreter and the terminal runs THAT file.
//   - a desktop app ('claude-desktop', 'codex-app', 'custom-url'): a link with
//     the prompt and the folder, opened with the OS.
//
// What the page (the renderer) can and cannot make main do — the real guarantee:
//   - A launch request carries a note id, task ids and text. Never a command,
//     a path or a link.
//   - The PRESETS are fixed here and in the CLI (claude, codex, gemini,
//     opencode; claude://, codex://).
//   - A CUSTOM command or link is text of settings.json, and the page CAN write
//     that text (Settings → AI is a page). So it is only ever launched after
//     the user approved THAT EXACT TEXT in a native dialog (main's, not the
//     page's): the approval is the sha256 of kind + text, kept in
//     `agentTasks.approved`, a key no IPC of the page can write. Changing the
//     text asks again. The text that was approved is the one that is launched
//     (it is pinned through the run; settings.json is not read again for it).
//   - The MODEL of a preset (`agentTasks.models`) is text of settings.json the
//     page can write too, but no command: one argument after `--model`, and only
//     a name AGENT_MODEL_RE takes (no spaces, quotes, `%`, `!`, `^`…) — the
//     sanitizer drops anything else, so it needs no approval. The same for the
//     EFFORT of Claude Code (`agentTasks.efforts`): one of a closed list of words.
//   - The project folder of a note is only ever set through the native folder
//     dialog (`agentTasks.folders`, not writable by the page either).
//   - Main also refuses to launch with the feature off or for an encrypted note.
// Docs: .agents/context/patterns.md "Tareas con agentes: ejecutar".

import { createHash } from 'crypto'
import { AGENT_ID_RE, AGENT_MODEL_RE, AGENT_RUN_PRESET_NAMES, isAgentEffort, sanitizeAgentTaskSettings, type AgentLaunchMode, type AgentTaskSettings } from './agentTasks'

// ── What the renderer may send ───────────────────────────────────────────────

/** A note id as the app makes them (nanoid alphabet). */
const NOTE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
/** Tasks of one run. */
export const AGENT_RUN_MAX_TASKS = 100
/** Longest context / prompt text accepted from the renderer (characters). */
export const AGENT_RUN_MAX_TEXT = 1_000_000

export type AgentRunErrorCode =
  // Before anything is launched (ours)
  | 'invalid_request'
  | 'canceled' // the user closed a native dialog (the folder, the approval): nothing happened
  | 'disabled' // the feature is off, or the note is encrypted
  | 'unc_folder' // Windows: a network folder (\\server\share) — cmd cannot work in one
  | 'not_available' // this build cannot open a terminal with the CLI (Microsoft Store)
  | 'cli_missing' // the bundled CLI was not found
  | 'node_not_found' // Windows: no Node.js 18+ in PATH to run the CLI in a terminal (the app's binary gets no console)
  | 'no_folder' // the note has no project folder (or it is gone)
  | 'unsafe_path' // a path cannot be written safely in the launcher script
  | 'no_terminal' // no terminal window could be opened
  | 'invalid_url' // the custom link template is not one the app opens
  | 'open_failed' // the OS refused the link
  // From `noteflow run --dry-run --json`
  | 'agent_not_found'
  | 'agent_invalid'
  | 'no_queued_tasks'
  | 'task_not_found'
  | 'note_not_found'
  | 'section_not_found'
  | 'file_unreadable'
  | 'file_empty'
  | 'failed'

export interface AgentRunFailure {
  ok: false
  code: AgentRunErrorCode
  /** agent_not_found: the agent the CLI looked for. */
  agent?: string
  /** The CLI's own (English) error line, when there is one. */
  detail?: string
}

export interface AgentTerminalRequest {
  noteId: string
  /** Task ids, in the order to run them. Empty = a run without tasks (needs `prompt`). */
  ids: string[]
  /** With tasks: the selected text that is no task, for --context-file. */
  context: string | null
  /** Without tasks: the whole prompt, for --prompt-file. */
  prompt: string | null
}

export function isAgentNoteId(value: unknown): value is string {
  return typeof value === 'string' && NOTE_ID_RE.test(value)
}

function boundedText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.length > AGENT_RUN_MAX_TEXT) return undefined
  return value.trim() === '' ? null : value
}

/** The payload of 'agent-run:terminal', validated — null when it is not one. Ids: 5 of [a-z0-9], no repeats. */
export function parseAgentTerminalRequest(raw: unknown): AgentTerminalRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!isAgentNoteId(r.noteId)) return null
  const rawIds = r.ids === undefined || r.ids === null ? [] : r.ids
  if (!Array.isArray(rawIds) || rawIds.length > AGENT_RUN_MAX_TASKS) return null
  const ids: string[] = []
  for (const id of rawIds) {
    if (typeof id !== 'string' || !AGENT_ID_RE.test(id)) return null
    if (!ids.includes(id)) ids.push(id)
  }
  const context = boundedText(r.context)
  const prompt = boundedText(r.prompt)
  if (context === undefined || prompt === undefined) return null
  if (ids.length === 0) return prompt === null ? null : { noteId: r.noteId, ids, context: null, prompt }
  return { noteId: r.noteId, ids, context, prompt: null }
}

/** The payload of 'agent-run:open-app', validated — null when it is not one. */
export function parseAgentAppRequest(raw: unknown): { noteId: string; prompt: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!isAgentNoteId(r.noteId)) return null
  const prompt = boundedText(r.prompt)
  return prompt ? { noteId: r.noteId, prompt } : null
}

// ── The note's project folder (settings.json → agentTasks.folders) ───────────

/** The folder stored for a note, '' when none. */
export function agentFolderOf(storedAgentTasks: unknown, noteId: string): string {
  const s = storedAgentTasks && typeof storedAgentTasks === 'object' && !Array.isArray(storedAgentTasks) ? storedAgentTasks as Record<string, unknown> : {}
  const folders = s.folders && typeof s.folders === 'object' && !Array.isArray(s.folders) ? s.folders as Record<string, unknown> : {}
  const value = Object.prototype.hasOwnProperty.call(folders, noteId) ? folders[noteId] : undefined
  return typeof value === 'string' ? value : ''
}

/** The stored `agentTasks` object with the folder of `noteId` set (or removed, with null). Every other key is kept. */
export function withAgentFolder(storedAgentTasks: unknown, noteId: string, folder: string | null): Record<string, unknown> {
  const base = storedAgentTasks && typeof storedAgentTasks === 'object' && !Array.isArray(storedAgentTasks) ? storedAgentTasks as Record<string, unknown> : {}
  const folders: Record<string, unknown> = base.folders && typeof base.folders === 'object' && !Array.isArray(base.folders) ? { ...base.folders as Record<string, unknown> } : {}
  if (folder) folders[noteId] = folder
  else delete folders[noteId]
  return { ...base, folders }
}

/** Every project folder stored (all the notes'): where a program that runs the CLI must never be looked for. */
export function agentKnownFolders(storedAgentTasks: unknown): string[] {
  const s = storedAgentTasks && typeof storedAgentTasks === 'object' && !Array.isArray(storedAgentTasks) ? storedAgentTasks as Record<string, unknown> : {}
  const folders = s.folders && typeof s.folders === 'object' && !Array.isArray(s.folders) ? Object.values(s.folders as Record<string, unknown>) : []
  return [...new Set(folders.filter((f): f is string => typeof f === 'string' && f !== ''))]
}

// ── 'agent-run:info': is "Run" in a terminal possible here? ──────────────────

export interface AgentRunInfoDeps {
  /** Can this build open a terminal with the CLI? (agentRunIo.terminalAvailable) */
  terminalAvailable: boolean
  platform: NodeJS.Platform
  /** settings.json → `agentTasks`, read NOW. */
  readAgentTasks(): unknown
  /** Looks for a Node.js 18+ in PATH — it RUNS `node --version`. `exclude`: folders it must not be in. */
  probeNode(exclude: readonly string[]): Promise<boolean>
}

/**
 * What 'agent-run:info' answers. `node`: is there something to run the CLI
 * with inside a terminal? Only Windows has to look (systemNode.ts), and looking
 * RUNS a program of PATH — so it is done only when "Run" in a terminal can
 * actually be pressed: the feature ON and the launch mode 'terminal', read
 * here from settings.json (not taken from the page). Otherwise nothing is run
 * and the answer is `true` ("nothing known against it"): with the feature off
 * the app costs what it did before this existed. The page asks again when
 * those settings change. The project folders of every note are excluded.
 */
export async function agentRunInfo(deps: AgentRunInfoDeps): Promise<{ terminal: boolean; node: boolean }> {
  const terminal = deps.terminalAvailable
  if (!terminal || deps.platform !== 'win32') return { terminal, node: true }
  const stored = deps.readAgentTasks()
  const settings = sanitizeAgentTaskSettings(stored)
  if (!settings.enabled || settings.launch !== 'terminal') return { terminal, node: true }
  return { terminal, node: await deps.probeNode(agentKnownFolders(stored)) }
}

// ── The arguments of `noteflow run` ──────────────────────────────────────────

const AGENT_PLACEHOLDER_RE = /\{prompt(?:File)?\}/

// ── Custom commands and links: what needs the user's approval ────────────────

/** A custom thing "Run" would launch with the stored settings. */
export interface AgentCustomLaunch {
  kind: 'command' | 'url'
  /** The text of settings.json, exactly as the user is shown it and approves it. */
  text: string
  /** command: the value of `--agent` that means that text to the CLI. */
  flag: string
  /** url: an http(s) link — the prompt travels in the address to that server. */
  web: boolean
}

/**
 * What "Run" would launch that is NOT a preset: the custom command of the
 * terminal mode or the custom link — null for a preset (nothing to approve).
 * An empty `text` means "custom" is chosen but nothing is written.
 *   command: `agent: 'custom'` → `agentCommand` (a template without a
 *     placeholder gets the prompt last: the flag says so explicitly); any other
 *     `agent` that is no preset → that text itself, as the CLI reads it.
 */
export function agentCustomLaunch(storedAgentTasks: unknown): AgentCustomLaunch | null {
  const view = sanitizeAgentTaskSettings(storedAgentTasks)
  if (view.launch === 'custom-url') {
    const text = view.agentUrl
    return { kind: 'url', text, flag: '', web: /^https?:\/\//i.test(text) }
  }
  if (view.launch !== 'terminal' || view.agent !== 'custom') return null
  const s = storedAgentTasks && typeof storedAgentTasks === 'object' ? storedAgentTasks as Record<string, unknown> : {}
  const raw = typeof s.agent === 'string' ? s.agent.trim() : ''
  if (raw.toLowerCase() === 'custom') {
    const text = view.agentCommand
    return { kind: 'command', text, flag: !text || AGENT_PLACEHOLDER_RE.test(text) ? text : `${text} {prompt}`, web: false }
  }
  // A command of its own written by hand in `agent` (what the CLI takes there), cleaned like every template.
  const text = sanitizeAgentTaskSettings({ agentCommand: raw }).agentCommand
  // A name the CLI would take for a preset or for 'custom' must never be passed as a command.
  const named = (AGENT_RUN_PRESET_NAMES as readonly string[]).includes(text.toLowerCase())
  return { kind: 'command', text: named ? '' : text, flag: named ? '' : text, web: false }
}

/** The approval of one custom command / link: sha256 of its kind and its exact text. */
export function agentApprovalHash(kind: 'command' | 'url', text: string): string {
  return createHash('sha256').update(`${kind}\n${text}`, 'utf8').digest('hex')
}

/** How many approvals are remembered (the oldest go first). */
export const AGENT_APPROVALS_MAX = 50

function approvedList(storedAgentTasks: unknown): string[] {
  const s = storedAgentTasks && typeof storedAgentTasks === 'object' && !Array.isArray(storedAgentTasks) ? storedAgentTasks as Record<string, unknown> : {}
  return Array.isArray(s.approved) ? s.approved.filter((h): h is string => typeof h === 'string' && /^[a-f0-9]{64}$/.test(h)) : []
}

/** Has the user approved launching exactly this? (`agentTasks.approved` — written by main alone, after its native dialog.) */
export function isAgentLaunchApproved(storedAgentTasks: unknown, custom: Pick<AgentCustomLaunch, 'kind' | 'text'>): boolean {
  return custom.text !== '' && approvedList(storedAgentTasks).includes(agentApprovalHash(custom.kind, custom.text))
}

/** The stored `agentTasks` object with this approval added. Every other key is kept. */
export function withAgentApproval(storedAgentTasks: unknown, custom: Pick<AgentCustomLaunch, 'kind' | 'text'>): Record<string, unknown> {
  const base = storedAgentTasks && typeof storedAgentTasks === 'object' && !Array.isArray(storedAgentTasks) ? storedAgentTasks as Record<string, unknown> : {}
  const hash = agentApprovalHash(custom.kind, custom.text)
  const approved = [...approvedList(base).filter((h) => h !== hash), hash].slice(-AGENT_APPROVALS_MAX)
  return { ...base, approved }
}

/**
 * `--agent …` for the CLI: a preset by its name, or the custom command that
 * was authorized (`custom`, from authorizeAgentLaunch) as the flag's VALUE —
 * always explicit, so the CLI never reads the command from a settings.json
 * that may have changed since the user approved it.
 */
export function agentRunAgentArgs(settings: Pick<AgentTaskSettings, 'agent'>, custom: AgentCustomLaunch | null): { ok: true; args: string[] } | AgentRunFailure {
  if (!custom) return settings.agent === 'custom' ? { ok: false, code: 'agent_invalid' } : { ok: true, args: ['--agent', settings.agent] }
  if (custom.kind !== 'command' || !custom.flag) return { ok: false, code: 'agent_invalid' }
  return { ok: true, args: ['--agent', custom.flag] }
}

// ── The gate every launch goes through ───────────────────────────────────────

/** What authorizeAgentLaunch needs from the outside (agentRunIo.ts supplies the real ones; the tests, fakes). */
export interface AgentLaunchGate {
  /** settings.json → `agentTasks`, read NOW. */
  readAgentTasks(): unknown
  /** Read-modify-write of that object with a fresh read (nothing awaited inside). */
  updateAgentTasks(change: (stored: unknown) => Record<string, unknown>): void
  isDirectory(folder: string): boolean
  /** Is the note encrypted on disk? (An agent's CLI cannot read it.) */
  noteEncrypted(noteId: string): boolean
  /** Can this build open a terminal with the CLI? And when not: is it the Microsoft Store build? */
  terminalAvailable: boolean
  storeBuild: boolean
  /** Is there a program that can run the CLI INSIDE a terminal? (Windows: a Node.js 18+ of PATH; elsewhere the app's binary.) Only asked for a terminal. */
  terminalRuntime(): Promise<boolean>
  platform: NodeJS.Platform
  /** The native folder dialog → the chosen folder, null when cancelled. Only called with `askFolder`. */
  pickFolder(current: string | null): Promise<string | null>
  /** The native "launch this exact command / link?" dialog → the user's answer. */
  confirmCustom(custom: AgentCustomLaunch): Promise<boolean>
}

export type AgentLaunchGrant = {
  ok: true
  settings: AgentTaskSettings
  folder: string
  /** The custom command / link that is authorized — launch THIS, not what settings.json says later. */
  custom: AgentCustomLaunch | null
}

/**
 * Everything that must hold before an agent is launched for note `noteId`, in
 * this order — and nothing is launched, queued or written when one fails:
 *   1. the feature is on and the note is not encrypted ('disabled');
 *   2. the launch mode is the one the caller is about to use, and a terminal
 *      can be opened in this build — with something to run the CLI in it
 *      ('node_not_found': on Windows that is the computer's Node.js);
 *   3. the note has a project folder that exists — with `askFolder` the native
 *      dialog asks for one ('canceled' when closed), otherwise 'no_folder'. On
 *      Windows a network folder is refused for a terminal ('unc_folder');
 *   4. a custom command / link is well formed and APPROVED: when it is not, the
 *      native dialog shows its exact text ('canceled' when refused) and the
 *      approval is stored.
 * The grant carries the settings and the custom text as they were judged.
 */
export async function authorizeAgentLaunch(
  gate: AgentLaunchGate,
  noteId: string,
  opts: { mode?: 'terminal' | 'app'; askFolder?: boolean } = {},
): Promise<AgentLaunchGrant | AgentRunFailure> {
  const stored = gate.readAgentTasks()
  const settings = sanitizeAgentTaskSettings(stored)
  if (!settings.enabled || gate.noteEncrypted(noteId)) return { ok: false, code: 'disabled' }
  const terminal = settings.launch === 'terminal'
  if (opts.mode && (opts.mode === 'terminal') !== terminal) return { ok: false, code: 'invalid_request' }
  if (terminal && !gate.terminalAvailable) return { ok: false, code: gate.storeBuild ? 'not_available' : 'cli_missing' }
  // Before any dialog: a folder is not asked for a run that cannot start.
  if (terminal && !(await gate.terminalRuntime())) return { ok: false, code: 'node_not_found' }

  // What is launched is decided NOW, before any dialog: a change of settings.json while one is open is not picked up.
  const custom = agentCustomLaunch(stored)
  if (custom && !custom.text) return { ok: false, code: custom.kind === 'url' ? 'invalid_url' : 'agent_invalid' }
  if (custom?.kind === 'url' && agentUrlTemplateScheme(custom.text) === null) return { ok: false, code: 'invalid_url' }

  let folder = agentFolderOf(stored, noteId)
  if (!folder || !gate.isDirectory(folder)) {
    if (!opts.askFolder) return { ok: false, code: 'no_folder' }
    const picked = await gate.pickFolder(folder && gate.isDirectory(folder) ? folder : null)
    if (!picked || !gate.isDirectory(picked)) return { ok: false, code: 'canceled' }
    folder = picked
    gate.updateAgentTasks((now) => withAgentFolder(now, noteId, picked))
  }
  if (terminal && gate.platform === 'win32' && /^[\\/]{2}/.test(folder)) return { ok: false, code: 'unc_folder' }

  if (custom && !isAgentLaunchApproved(gate.readAgentTasks(), custom)) {
    if (!(await gate.confirmCustom(custom))) return { ok: false, code: 'canceled' }
    gate.updateAgentTasks((now) => withAgentApproval(now, custom))
  }
  return { ok: true, settings, folder, custom }
}

/**
 * The CLI arguments of a run (without `--dry-run --json`): tasks + context
 * file, or a prompt file alone. `--parallel` (one subagent per task) only with
 * 2+ tasks and `batchMode` 'parallel' — main's own settings (the grant's), never
 * anything the page sends: with one task the run is the same either way.
 * `--model` (agentRunModel of those settings: a terminal, a preset, a model set
 * for it) on either kind of run; a name AGENT_MODEL_RE refuses is left out.
 * `--effort` likewise (agentRunEffort: a terminal, Claude Code, an effort set);
 * a word that is not one of AGENT_EFFORT_LEVELS is left out. Neither set: the
 * arguments are exactly those of a run without them.
 */
export function agentRunCliArgs(input: {
  ids: readonly string[]
  contextFile: string | null
  promptFile: string | null
  onFinish: 'check' | 'review'
  batchMode?: AgentTaskSettings['batchMode']
  model?: string | null
  effort?: string | null
  agentArgs: readonly string[]
}): string[] {
  // How the agent starts: its model, its effort — each only when there is a valid one.
  const start = [
    ...(input.model && AGENT_MODEL_RE.test(input.model) ? ['--model', input.model] : []),
    ...(isAgentEffort(input.effort) ? ['--effort', input.effort] : []),
  ]
  if (input.ids.length === 0) return ['run', '--prompt-file', input.promptFile ?? '', ...start, ...input.agentArgs]
  return [
    'run', ...input.ids,
    ...(input.contextFile ? ['--context-file', input.contextFile] : []),
    '--on-finish', input.onFinish,
    ...(input.batchMode === 'parallel' && input.ids.length > 1 ? ['--parallel'] : []),
    ...start,
    ...input.agentArgs,
  ]
}

const DRY_RUN_CODES: readonly AgentRunErrorCode[] = [
  'agent_not_found', 'agent_invalid', 'no_queued_tasks', 'task_not_found', 'note_not_found', 'section_not_found', 'file_unreadable', 'file_empty',
]

/** The last line of the CLI's stderr that says something ("  Error: …" → "…"). */
function lastErrorLine(stderr: string): string | undefined {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const line = lines[lines.length - 1]
  return line ? line.replace(/^Error:\s*/, '').slice(0, 500) : undefined
}

/**
 * What `noteflow run … --dry-run --json` said: go ahead, or why not. A known
 * `code` of the CLI's JSON is passed on (with the agent's name for
 * agent_not_found); anything else — no JSON, a usage error, a timeout — is
 * 'failed' with the CLI's last error line.
 */
export function interpretAgentDryRun(run: { code: number | null; stdout: string; stderr: string }): { ok: true } | AgentRunFailure {
  let json: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(run.stdout)
    json = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    json = null
  }
  if (run.code === 0 && json && json.dryRun === true) return { ok: true }
  const code = json && typeof json.code === 'string' ? DRY_RUN_CODES.find((c) => c === json.code) : undefined
  const detail = (json && typeof json.error === 'string' ? json.error.slice(0, 500) : undefined) ?? lastErrorLine(run.stderr)
  if (!code) return { ok: false, code: 'failed', detail }
  const agent = json && typeof json.agent === 'string' ? json.agent.slice(0, 80) : undefined
  return { ok: false, code, ...(code === 'agent_not_found' && agent ? { agent } : {}), detail }
}

// ── The launcher script ──────────────────────────────────────────────────────

export interface AgentLauncherInput {
  platform: NodeJS.Platform
  /** The note's project folder: where the agent works. */
  folder: string
  /**
   * The program that runs the CLI and the CLI's script. Windows: the computer's
   * node.exe (a console program — the app's binary, a GUI one, gets no console
   * as its stdio: systemNode.ts). macOS / Linux: this Electron, as Node.
   */
  execPath: string
  cliScript: string
  /** agentRunCliArgs. */
  args: readonly string[]
  /** Set for the CLI only (NOTEFLOW_NO_APP_CHECK=1…): names are fixed by the caller, values are escaped here. */
  env: Readonly<Record<string, string>>
  /** Variables the CLI must NOT inherit (ELECTRON_RUN_AS_NODE, when a real Node runs it). Fixed names. */
  unsetEnv?: readonly string[]
}

export type AgentLauncherScript =
  | { ok: true; text: string; ext: '.cmd' | '.command' | '.sh' }
  | { ok: false; code: 'unsafe_path' | 'unc_folder'; value: string }

/** A control character (a line break above all): never written in a script nor accepted in a link. */
const CONTROL_RE = /\p{Cc}/u
const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/
/** Written bare in either script: ids, flags, 'check'. Everything else is quoted. */
const BARE_WORD_RE = /^[A-Za-z0-9._:=/-]+$/

class UnsafeValue extends Error {
  constructor(readonly value: string) {
    super('unsafe value')
  }
}

/**
 * A value inside a DOUBLE-QUOTED word of a batch FILE. Inside quotes cmd takes
 * `& | < > ( ) ^` literally and — the script turns delayed expansion off — `!`
 * too; `%` is the one live character and `%%` writes it. What cannot be
 * written at all: a `"` (it would close the word; no Windows path has one) and
 * control characters (a line break would start a new command).
 */
function winBatchText(value: string): string {
  if (value.includes('"') || CONTROL_RE.test(value)) throw new UnsafeValue(value)
  return value.replace(/%/g, '%%')
}

/**
 * A value as ONE argument of a program in a batch file: quoted, a trailing `\`
 * doubled (it would escape the closing quote for the program).
 *
 * A value that itself holds a `"` (a custom command: `"C:\Program Files\x.exe"
 * {prompt}`) cannot sit inside cmd's quotes — each `"` would flip them. It is
 * written with NO quote that cmd sees: first as the program's argument (the C
 * runtime's rules: `\"` for a quote, the backslashes before one doubled, the
 * whole in quotes), then every character cmd acts on — those quotes included —
 * gets a `^` in front (and `%` is doubled, the batch-file way). The same
 * scheme cross-spawn uses, here inside a batch file.
 */
function winBatchArg(value: string): string {
  if (value !== '' && BARE_WORD_RE.test(value)) return value
  if (!value.includes('"')) return `"${winBatchText(value).replace(/\\+$/, (run) => run + run)}"`
  if (CONTROL_RE.test(value)) throw new UnsafeValue(value)
  const forProgram = `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/, (run) => run + run)}"`
  return forProgram.replace(/%/g, '%%').replace(/[()!^"<>&|]/g, '^$&')
}

/** A value as one word of a POSIX shell: single-quoted (nothing is special inside), `'` as `'\''`. */
function shQuote(value: string): string {
  if (CONTROL_RE.test(value)) throw new UnsafeValue(value)
  if (value !== '' && BARE_WORD_RE.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * The script a terminal window runs: go to the project folder, run the bundled
 * CLI with `execPath` (`noteflow` need not be in PATH) and leave a shell open
 * there, so the run's summary can be read.
 *
 *   Windows (.cmd, CRLF; started as `cmd.exe /d /v:off /k <file>`): `cd /d`
 *     comes BEFORE `setlocal` (which also restores the directory when the
 *     script ends), so the prompt that stays is in the project folder and the
 *     CLI's variables are gone from it. `chcp 65001` only when the script has
 *     non-ASCII text (the file is UTF-8, no BOM). A variable of `unsetEnv` is
 *     cleared (`set "NAME="`) before the ones that are set.
 *   macOS (.command) / Linux (.sh): `sh`, every value single-quoted, the
 *     variables set for the CLI's command alone (`env [-u NAME] NAME=value …`), then
 *     `exec $SHELL`. With zsh or bash as the user's shell the command runs
 *     through it as a login + interactive shell (`$SHELL -l -i -c '…'`): the
 *     PATH an agent is installed in (npm, nvm, ~/.local/bin, Homebrew) is
 *     usually set in its rc files, which a bare `sh` script never reads.
 *
 * A value that cannot be written safely for that interpreter (a `"` or a
 * control character on Windows; a control character elsewhere) makes the whole
 * script fail: nothing is launched.
 */
export function buildAgentLauncherScript(input: AgentLauncherInput): AgentLauncherScript {
  const env = Object.entries(input.env)
  const unset = [...(input.unsetEnv ?? [])]
  for (const name of [...env.map(([n]) => n), ...unset]) if (!ENV_NAME_RE.test(name)) return { ok: false, code: 'unsafe_path', value: name }
  try {
    if (input.platform === 'win32') {
      // A network folder: cmd refuses a UNC path as its current directory (`cd /d` fails).
      if (/^[\\/]{2}/.test(input.folder)) return { ok: false, code: 'unc_folder', value: input.folder }
      const command = [input.execPath, input.cliScript, ...input.args].map((a, i) => (i < 2 ? `"${winBatchText(a)}"` : winBatchArg(a))).join(' ')
      const lines = [
        '@echo off',
        `cd /d "${winBatchText(input.folder)}" || exit /b 1`,
        'setlocal DisableDelayedExpansion',
        ...unset.map((name) => `set "${name}="`),
        ...env.map(([name, value]) => `set "${name}=${winBatchText(value)}"`),
        command,
        'endlocal',
      ]
      if (/[^\x20-\x7e]/.test(lines.join(''))) lines.splice(1, 0, 'chcp 65001 >nul')
      return { ok: true, ext: '.cmd', text: `${lines.join('\r\n')}\r\n` }
    }
    const assignments = env.map(([name, value]) => `${name}=${shQuote(value)}`)
    const command = ['env', ...unset.flatMap((name) => ['-u', name]), ...assignments, ...[input.execPath, input.cliScript, ...input.args].map(shQuote)].join(' ')
    const text = [
      '#!/bin/sh',
      `if cd -- ${shQuote(input.folder)}; then`,
      '  case "${SHELL##*/}" in',
      `    zsh|bash) "$SHELL" -l -i -c ${shQuote(command)} ;;`,
      `    *) ${command} ;;`,
      '  esac',
      'fi',
      'exec "${SHELL:-/bin/sh}"',
      '',
    ].join('\n')
    return { ok: true, ext: input.platform === 'darwin' ? '.command' : '.sh', text }
  } catch (err) {
    if (err instanceof UnsafeValue) return { ok: false, code: 'unsafe_path', value: err.value }
    throw err
  }
}

// ── Which terminal ───────────────────────────────────────────────────────────

export interface AgentTerminalPlan {
  /** For the logs. */
  name: string
  command: string
  args: string[]
  /** The working directory of the spawn (CreateProcess sets it: no parsing). */
  cwd?: string
  /** The args are one ready-made cmd.exe command line. */
  verbatim?: boolean
  /** The process spawned is a hidden go-between (`cmd /c start`), not the terminal itself. */
  hidden?: boolean
}

export interface AgentTerminalContext {
  /** The launcher script: its folder and its file name (a name main makes: [a-z0-9.-] only). */
  scriptDir: string
  scriptName: string
  /** The absolute path of a program of PATH, null when it is not installed. */
  which(name: string): string | null
  /** Windows: wt.exe (Windows Terminal), null when it is not installed. */
  windowsTerminal: string | null
  /** Windows: the ABSOLUTE path of cmd.exe (safeComspec). */
  comspec: string
}

/** An absolute cmd.exe path made of plain characters only: it is written, unquoted, in a command line. */
const SAFE_COMSPEC_RE = /^[A-Za-z]:(?:\\[A-Za-z0-9_.-]+)+\\cmd\.exe$/i

/**
 * The absolute path of cmd.exe: %ComSpec% when it is a plain absolute path to
 * a cmd.exe, else %SystemRoot%\System32\cmd.exe, else the usual place. Never
 * the bare name: the terminal is started from userData/tmp, and both
 * CreateProcess and `start` look in the current folder first.
 */
export function safeComspec(env: Record<string, string | undefined>): string {
  const candidates = [env.ComSpec, env.COMSPEC, env.SystemRoot && `${env.SystemRoot}\\System32\\cmd.exe`, env.windir && `${env.windir}\\System32\\cmd.exe`]
  return candidates.find((c): c is string => typeof c === 'string' && SAFE_COMSPEC_RE.test(c)) ?? 'C:\\Windows\\System32\\cmd.exe'
}

const SAFE_SCRIPT_NAME_RE = /^[a-z0-9][a-z0-9.-]*$/

/**
 * The terminals to try, in order (the first that starts wins):
 *   Windows — Windows Terminal (`wt.exe -d <dir> <cmd.exe> /d /v:off /k .\<script>`),
 *     then `<cmd.exe> /c start` (a new console window). The script is named by
 *     its FILE NAME alone, with its folder as the working directory, so no
 *     path of the user's is ever parsed by cmd; cmd.exe itself goes by its
 *     absolute path (safeComspec) — the working directory is a folder of
 *     temp files and a bare `cmd.exe` would be looked for there first.
 *     Windows Terminal is skipped when that folder has a `;` (its own command
 *     separator) or a `"`.
 *   macOS — Terminal.app (`open -a Terminal <script.command>`).
 *   Linux — x-terminal-emulator, gnome-terminal, konsole, xfce4-terminal,
 *     xterm: the ones installed, each with the script as ONE argument.
 * Empty when the script's name is not one main makes.
 */
export function agentTerminalPlans(platform: NodeJS.Platform, ctx: AgentTerminalContext): AgentTerminalPlan[] {
  if (!SAFE_SCRIPT_NAME_RE.test(ctx.scriptName)) return []
  if (platform === 'win32') {
    if (!SAFE_COMSPEC_RE.test(ctx.comspec)) return []
    const plans: AgentTerminalPlan[] = []
    // `.\<name>`, not the bare name: with NoDefaultCurrentDirectoryInExePath set, cmd does not look in the current folder.
    const shell = [ctx.comspec, '/d', '/v:off', '/k', `.\\${ctx.scriptName}`]
    if (ctx.windowsTerminal && !/[;"]/.test(ctx.scriptDir)) {
      plans.push({ name: 'Windows Terminal', command: ctx.windowsTerminal, args: ['-d', ctx.scriptDir, ...shell], cwd: ctx.scriptDir })
    }
    plans.push({
      name: 'cmd',
      command: ctx.comspec,
      args: ['/d', '/s', '/c', `"start "NoteFlow" ${shell.join(' ')}"`],
      cwd: ctx.scriptDir,
      verbatim: true,
      hidden: true,
    })
    return plans
  }
  const script = `${ctx.scriptDir.replace(/\/+$/, '')}/${ctx.scriptName}`
  if (platform === 'darwin') return [{ name: 'Terminal', command: '/usr/bin/open', args: ['-a', 'Terminal', script] }]
  const candidates: Array<[string, string[]]> = [
    ['x-terminal-emulator', ['-e', script]],
    ['gnome-terminal', ['--', script]],
    ['konsole', ['-e', script]],
    ['xfce4-terminal', ['-x', script]],
    ['xterm', ['-e', script]],
  ]
  const plans: AgentTerminalPlan[] = []
  for (const [name, args] of candidates) {
    const found = ctx.which(name)
    if (found) plans.push({ name, command: found, args, cwd: ctx.scriptDir })
  }
  return plans
}

// ── Desktop apps: the link ───────────────────────────────────────────────────

/** Past these the prompt does not travel in the link: it is copied and the app opens on the folder alone. */
export const AGENT_URL_PROMPT_MAX = 12_000
export const AGENT_URL_MAX = 30_000

/**
 * Schemes a CUSTOM link may never use — the app would hand them, with text the
 * note contains, to whatever the OS has registered:
 *   - local content and script: file, javascript, data, vbscript, blob, about,
 *     view-source, jar, res, mhtml, mk, its, ms-its, hcp, shell;
 *   - browser internals: chrome, chrome-extension, chrome-untrusted, devtools,
 *     edge, brave, opera, moz-extension, resource;
 *   - network file / remote shells and desktops: ftp, sftp, smb, cifs, nfs,
 *     afp, dav, davs, webdav, ssh, telnet, rlogin, ldap, ldaps, vnc, rdp;
 *   - installers and system handlers with a history of running code:
 *     search, search-ms, ms-msdt, ms-officecmd, ms-appinstaller, ms-cxh,
 *     ms-cxh-full, itms-services, steam, com.epicgames.launcher;
 *   - help viewers and automation: help, x-man-page, man, info, applescript,
 *     shortcuts, workflow, x-apple.systempreferences, microsoft-edge.
 * On top of the list, EVERY scheme that starts with `ms-` is refused (Windows'
 * own handlers: none is an agent app, several have been attack surface).
 */
export const AGENT_URL_DENIED_SCHEMES: readonly string[] = [
  'file', 'javascript', 'data', 'vbscript', 'blob', 'about', 'view-source', 'jar', 'res', 'mhtml', 'mk', 'its', 'ms-its', 'hcp', 'shell',
  'chrome', 'chrome-extension', 'chrome-untrusted', 'devtools', 'edge', 'brave', 'opera', 'moz-extension', 'resource',
  'ftp', 'sftp', 'smb', 'cifs', 'nfs', 'afp', 'dav', 'davs', 'webdav', 'ssh', 'telnet', 'rlogin', 'ldap', 'ldaps', 'vnc', 'rdp',
  'search', 'search-ms', 'ms-msdt', 'ms-officecmd', 'ms-appinstaller', 'ms-cxh', 'ms-cxh-full', 'itms-services', 'steam', 'com.epicgames.launcher',
  'help', 'x-man-page', 'man', 'info', 'applescript', 'shortcuts', 'workflow', 'x-apple.systempreferences', 'microsoft-edge',
]

const URL_SCHEME_RE = /^([a-z][a-z0-9+.-]*):\/\//i

/** The scheme (lower case) of a custom link template the app may open, null when it may not. */
export function agentUrlTemplateScheme(template: string): string | null {
  const text = template.trim()
  if (!text || text.length > 2000 || /\s/.test(text) || CONTROL_RE.test(text)) return null
  const scheme = URL_SCHEME_RE.exec(text)?.[1].toLowerCase()
  if (!scheme || scheme.startsWith('ms-') || AGENT_URL_DENIED_SCHEMES.includes(scheme)) return null
  return scheme
}

export type AgentAppUrl =
  | { ok: true; url: string; scheme: string; /** The prompt did not fit: the link carries the folder alone. */ promptOmitted: boolean }
  | { ok: false; code: 'invalid_url' }

function fillAgentUrl(launch: Exclude<AgentLaunchMode, 'terminal'>, template: string, prompt: string | null, folder: string): string {
  const p = prompt === null ? null : encodeURIComponent(prompt)
  const f = encodeURIComponent(folder)
  if (launch === 'claude-desktop') return `claude://code/new?${p === null ? '' : `q=${p}&`}folder=${f}`
  if (launch === 'codex-app') return `codex://new?${p === null ? '' : `prompt=${p}&`}path=${f}`
  // One pass over the template: what a value expands to is never read again as a placeholder.
  return template.trim().replace(/\{(prompt|folder)\}/g, (_m, key: string) => (key === 'prompt' ? p ?? '' : f))
}

/**
 * The link that opens a desktop agent app on `folder` with `prompt` filled in.
 * Built HERE from the stored settings — the presets are fixed (`claude://`,
 * `codex://`), a custom template must pass agentUrlTemplateScheme, and both
 * values are URL-encoded. A prompt over AGENT_URL_PROMPT_MAX characters, or a
 * link over AGENT_URL_MAX, is never cut: the link is rebuilt without the
 * prompt (`promptOmitted`; the caller copies it for the user to paste).
 * `omitPrompt`: build that folder-only link straight away.
 */
export function buildAgentAppUrl(
  launch: AgentLaunchMode,
  input: { prompt: string; folder: string; template?: string; omitPrompt?: boolean },
): AgentAppUrl {
  if (launch === 'terminal') return { ok: false, code: 'invalid_url' }
  const template = input.template ?? ''
  const scheme = launch === 'claude-desktop' ? 'claude' : launch === 'codex-app' ? 'codex' : agentUrlTemplateScheme(template)
  if (!scheme) return { ok: false, code: 'invalid_url' }
  let promptOmitted = input.omitPrompt === true || input.prompt.length > AGENT_URL_PROMPT_MAX
  let url = fillAgentUrl(launch, template, promptOmitted ? null : input.prompt, input.folder)
  if (!promptOmitted && url.length > AGENT_URL_MAX) {
    promptOmitted = true
    url = fillAgentUrl(launch, template, null, input.folder)
  }
  if (url.length > AGENT_URL_MAX) return { ok: false, code: 'invalid_url' }
  // The finished link must still be a link of that very scheme.
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, code: 'invalid_url' }
  }
  if (parsed.protocol !== `${scheme}:`) return { ok: false, code: 'invalid_url' }
  return { ok: true, url, scheme, promptOmitted }
}

// ── Temporary files (userData/tmp) ───────────────────────────────────────────

export const AGENT_RUN_TMP_PREFIX = 'agent-run-'
/** The context / prompt of a run holds the user's text: gone ten minutes later (the CLI reads it as it starts). */
export const AGENT_RUN_TEXT_TTL_MS = 10 * 60_000
/** The launcher script holds paths and ids only, and cmd reads it until the session ends: kept a week. */
export const AGENT_RUN_SCRIPT_TTL_MS = 7 * 24 * 60 * 60_000

/** Is `name` a temp file of a run that has outlived its use? (`ageMs`: since it was last written.) */
export function agentRunTmpExpired(name: string, ageMs: number): boolean {
  if (!name.startsWith(AGENT_RUN_TMP_PREFIX)) return false
  return ageMs > (name.endsWith('.md') ? AGENT_RUN_TEXT_TTL_MS : AGENT_RUN_SCRIPT_TTL_MS)
}
