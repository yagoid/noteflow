// Agent tasks — "Run": the IO behind the 'agent-run:*' IPC handlers (main.ts).
// The rules — what a request may carry, the gate every launch goes through,
// the launcher script, which terminal, the link of a desktop app — are pure and
// live in agentRun.ts; this file touches the disk, the processes, the
// clipboard, the native dialogs and the OS.
//
// The page is not trusted with what gets launched (see the head of
// agentRun.ts): presets are fixed; a custom command or link — text the page
// can write in settings.json — only runs after the user approved that exact
// text in a NATIVE dialog; a note's folder is only set by the native folder
// dialog; nothing launches with the feature off or for an encrypted note.
// Docs: .agents/context/patterns.md "Tareas con agentes: ejecutar".

import { app, BrowserWindow, clipboard, dialog, shell } from 'electron'
import { execFile, spawn } from 'child_process'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import * as agentRun from './agentRun'
import { agentRunEffort, agentRunModel, type AgentLaunchMode } from './agentTasks'
import * as cliConnect from './cliConnect'
import { isInsideDir, resolveSystemNode } from './systemNode'

/** The texts of the native dialogs, in the app's language (electron/i18n.ts → dialogs). */
export interface AgentRunDialogTexts {
  chooseAgentFolder: string
  agentApproveCommand: string
  agentApproveCommandDetail: string
  agentApproveCommandConfirm: string
  agentApproveUrl: string
  agentApproveUrlDetail: string
  agentApproveUrlWeb: string
  agentApproveUrlConfirm: string
  agentApproveCancel: string
}

/** What main.ts lends: its settings.json, its notes and its texts. */
export interface AgentRunHost {
  readSettings(): Record<string, unknown>
  writeSettings(data: Record<string, unknown>): void
  /** Set when the notes dir is not the default one (NOTEFLOW_NOTES_DIR): the CLI must use the same. */
  notesDirOverride: string | null
  /** Is the note encrypted on disk? (Unknown note → false: the CLI will not find its tasks anyway.) */
  noteEncrypted(noteId: string): boolean
  texts(): AgentRunDialogTexts
}

const DRY_RUN_TIMEOUT_MS = 30_000
/** `node --version` answers in milliseconds; one that does not is not a usable Node. */
const NODE_VERSION_TIMEOUT_MS = 5_000
/** 'agent-run:info' (whether "Run" is offered at all) may reuse an answer this old; a launch always looks again. */
const NODE_INFO_TTL_MS = 5 * 60_000
/** A launch reuses what its own gate found a moment ago instead of asking `node --version` twice. */
const NODE_GATE_TTL_MS = 10_000
/** How long a terminal has to fail before it counts as opened. */
const TERMINAL_SETTLE_MS = 400

export type AgentPreflightResult = { ok: true; folder: string } | agentRun.AgentRunFailure

export type AgentTerminalResult = { ok: true } | agentRun.AgentRunFailure

export type AgentAppResult =
  | { ok: true; app: Exclude<AgentLaunchMode, 'terminal'>; /** The prompt was copied instead of sent in the link: paste it there. */ promptCopied: boolean }
  | agentRun.AgentRunFailure

// ── Whether this build can run the CLI in a terminal ─────────────────────────

/**
 * Can "Run" open a terminal with the bundled CLI? Not in the Microsoft Store
 * build: it ships no usable CLI — the package's exe cannot be started from a
 * terminal outside the package, and the CLI's settings and locks would land in
 * the package's private, virtualized AppData. (Desktop apps through a link
 * still work there.)
 */
export function terminalAvailable(): boolean {
  return cliConnect.cliAvailable()
}

// ── What runs the CLI inside the terminal ────────────────────────────────────
//
// macOS / Linux: this Electron as Node (ELECTRON_RUN_AS_NODE), like runCli.
// Windows: NOT the app's binary. electron.exe / NoteFlow.exe is a GUI subsystem
// program: started from a console it does not get the console as its stdio, and
// neither does the agent `noteflow run` starts with `stdio: 'inherit'` — the
// agent came up with no interactive terminal, and the CLI, seeing no TTY,
// marked the tasks `interrupted` without asking. (Measured in a real console
// window opened the way this file opens it: parent = node.exe → stdin and
// stdout are TTYs in parent and child; parent = electron.exe as Node → neither
// is, in either.) So on Windows the terminal runs the CLI with the computer's
// own node.exe (systemNode.ts: PATH, absolute, Node 18+), and without one
// nothing is launched ('node_not_found').

/** The program that runs the CLI in a terminal: `node` = a real Node.js (Windows), else this Electron as Node. */
interface CliRunner {
  execPath: string
  node: boolean
}

function isRunnableFile(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false
    if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** What `<file> --version` prints — no shell, a short timeout, from the program's own folder. */
function readNodeVersion(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    try {
      execFile(
        file, ['--version'],
        { timeout: NODE_VERSION_TIMEOUT_MS, windowsHide: true, shell: false, cwd: path.dirname(file), env, encoding: 'utf-8' },
        (err, stdout) => resolve(err ? null : String(stdout)),
      )
    } catch {
      resolve(null)
    }
  })
}

// EVERY look excludes the project folders (all the notes' — and the one of the
// run, once known): a node.exe inside one is not even asked for its version.

let lastSystemNode: { at: number; file: string | null; excluded: string } | null = null

const excludeKey = (exclude: readonly string[]): string => [...exclude].map((d) => d.toLowerCase()).sort().join('\n')

/** A Node.js 18+ of PATH, looked for now (and remembered). `exclude`: folders it must not be in. */
async function findSystemNode(exclude: readonly string[]): Promise<string | null> {
  const file = await resolveSystemNode({ platform: process.platform, env: process.env, isRunnable: isRunnableFile, readVersion: readNodeVersion, exclude })
  lastSystemNode = { at: Date.now(), file, excluded: excludeKey(exclude) }
  return file
}

/**
 * The last look, when it is younger than `ttlMs` and still answers for
 * `exclude`: a Node that was found counts unless it is inside one of these
 * folders; "none" only counts for the very same exclusions.
 */
function rememberedNode(exclude: readonly string[], ttlMs: number): { file: string | null } | null {
  const last = lastSystemNode
  if (!last || Date.now() - last.at >= ttlMs) return null
  if (last.file === null) return last.excluded === excludeKey(exclude) ? { file: null } : null
  const file = last.file
  return exclude.some((dir) => isInsideDir('win32', file, dir)) ? null : { file }
}

const knownFolders = (host: AgentRunHost): string[] => agentRun.agentKnownFolders(host.readSettings().agentTasks)

/** Is there something to run the CLI with inside a terminal? Looked for NOW (the gate of a launch). */
async function terminalRuntime(host: AgentRunHost): Promise<boolean> {
  return process.platform !== 'win32' || (await findSystemNode(knownFolders(host))) !== null
}

/**
 * 'agent-run:info'. The rule is agentRun.agentRunInfo: Node is only looked
 * for (a program of PATH is only RUN) on Windows with the feature on and the
 * terminal mode chosen. Then the last look is reused when it is recent — the
 * answer only decides whether the button is shown; a launch asks again. (A
 * PATH changed by an installer only reaches the app when it restarts.)
 */
export function info(host: AgentRunHost): Promise<{ terminal: boolean; node: boolean }> {
  return agentRun.agentRunInfo({
    terminalAvailable: terminalAvailable(),
    platform: process.platform,
    readAgentTasks: () => host.readSettings().agentTasks,
    probeNode: async (exclude) => ((rememberedNode(exclude, NODE_INFO_TTL_MS) ?? { file: await findSystemNode(exclude) }).file !== null),
  })
}

/**
 * The program that runs the CLI for a run in `folder`, null when there is none
 * (Windows without Node.js). The node.exe is never one inside a project
 * folder: a repository's own binary must not be what runs the CLI.
 */
async function cliRunnerFor(host: AgentRunHost, folder: string): Promise<CliRunner | null> {
  if (process.platform !== 'win32') return { execPath: process.execPath, node: false }
  const exclude = [...new Set([folder, ...knownFolders(host)])]
  // The gate has just looked: that answer is used when it still holds for these folders.
  const file = (rememberedNode(exclude, NODE_GATE_TTL_MS) ?? { file: await findSystemNode(exclude) }).file
  return file ? { execPath: file, node: true } : null
}

// ── The note's project folder ────────────────────────────────────────────────

function isDirectory(folder: string): boolean {
  try {
    return path.isAbsolute(folder) && fs.statSync(folder).isDirectory()
  } catch {
    return false
  }
}

/** The folder stored for a note and whether it is still there. */
export function getFolder(host: AgentRunHost, noteId: unknown): { folder: string | null; exists: boolean } {
  if (!agentRun.isAgentNoteId(noteId)) return { folder: null, exists: false }
  const folder = agentRun.agentFolderOf(host.readSettings().agentTasks, noteId)
  return folder ? { folder, exists: isDirectory(folder) } : { folder: null, exists: false }
}

/** Read-modify-write of settings.json → agentTasks with a fresh read, nothing awaited in between. */
function updateAgentTasks(host: AgentRunHost, change: (stored: unknown) => Record<string, unknown>): void {
  const settings = host.readSettings()
  settings.agentTasks = change(settings.agentTasks)
  host.writeSettings(settings)
}

/** The native folder dialog → the folder chosen, null when it is closed. */
async function askFolder(host: AgentRunHost, parent: BrowserWindow | null, current: string | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: host.texts().chooseAgentFolder,
    properties: ['openDirectory', 'createDirectory'],
    ...(current ? { defaultPath: current } : {}),
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  const folder = result.canceled ? undefined : result.filePaths[0]
  return folder && isDirectory(folder) ? folder : null
}

/** Asks for the note's project folder with the native dialog and remembers it — the only way a folder is ever set. */
export async function pickFolder(host: AgentRunHost, noteId: unknown, parent: BrowserWindow | null): Promise<{ folder: string } | { canceled: true }> {
  if (!agentRun.isAgentNoteId(noteId)) return { canceled: true }
  const current = getFolder(host, noteId)
  const folder = await askFolder(host, parent, current.folder && current.exists ? current.folder : null)
  if (!folder) return { canceled: true }
  updateAgentTasks(host, (stored) => agentRun.withAgentFolder(stored, noteId, folder))
  return { folder }
}

export function clearFolder(host: AgentRunHost, noteId: unknown): void {
  if (agentRun.isAgentNoteId(noteId) && getFolder(host, noteId).folder !== null) {
    updateAgentTasks(host, (stored) => agentRun.withAgentFolder(stored, noteId, null))
  }
}

// ── The gate: the native approval of a custom command / link ─────────────────

/**
 * "Launch this exact command / link with your tasks?" — a native message box
 * (the page cannot draw it, press it nor skip it). The text is shown whole;
 * the default button — and Escape — is Cancel. For an http(s) link it says
 * that the prompt travels in the address.
 */
async function confirmCustom(host: AgentRunHost, parent: BrowserWindow | null, custom: agentRun.AgentCustomLaunch): Promise<boolean> {
  const t = host.texts()
  const command = custom.kind === 'command'
  const detail = [
    custom.text,
    command ? t.agentApproveCommandDetail : t.agentApproveUrlDetail,
    ...(custom.web ? [t.agentApproveUrlWeb] : []),
  ].join('\n\n')
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    message: command ? t.agentApproveCommand : t.agentApproveUrl,
    detail,
    buttons: [t.agentApproveCancel, command ? t.agentApproveCommandConfirm : t.agentApproveUrlConfirm],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  }
  const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  return result.response === 1
}

function gateFor(host: AgentRunHost, parent: BrowserWindow | null): agentRun.AgentLaunchGate {
  return {
    readAgentTasks: () => host.readSettings().agentTasks,
    updateAgentTasks: (change) => updateAgentTasks(host, change),
    isDirectory,
    noteEncrypted: (noteId) => host.noteEncrypted(noteId),
    terminalAvailable: terminalAvailable(),
    storeBuild: process.windowsStore === true,
    terminalRuntime: () => terminalRuntime(host),
    platform: process.platform,
    pickFolder: (current) => askFolder(host, parent, current),
    confirmCustom: (custom) => confirmCustom(host, parent, custom),
  }
}

// ── Temporary files ──────────────────────────────────────────────────────────

function tmpDir(): string {
  return path.join(app.getPath('userData'), 'tmp')
}

function removeQuietly(file: string | null): void {
  if (!file) return
  try {
    fs.unlinkSync(file)
  } catch {
    // not there
  }
}

/** Removes the temp files of earlier runs that have outlived their use (agentRunTmpExpired). Called when the app starts. */
export function sweepTmp(): void {
  let names: string[]
  try {
    names = fs.readdirSync(tmpDir())
  } catch {
    return
  }
  const now = Date.now()
  for (const name of names) {
    const file = path.join(tmpDir(), name)
    try {
      if (agentRun.agentRunTmpExpired(name, now - fs.statSync(file).mtimeMs)) fs.unlinkSync(file)
    } catch {
      // gone, or in use: the next start tries again
    }
  }
}

function newStem(): string {
  return `${agentRun.AGENT_RUN_TMP_PREFIX}${randomBytes(6).toString('hex')}`
}

function writeText(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, text, { encoding: 'utf-8', mode: 0o600 })
}

// ── The CLI: its environment, the script, the dry run ────────────────────────

/** What the CLI gets on top of the inherited environment. A real Node is not given ELECTRON_RUN_AS_NODE (the script clears it instead). */
function cliEnv(host: AgentRunHost, runner: CliRunner): Record<string, string> {
  const env: Record<string, string> = runner.node ? { NOTEFLOW_NO_APP_CHECK: '1' } : { ELECTRON_RUN_AS_NODE: '1', NOTEFLOW_NO_APP_CHECK: '1' }
  if (host.notesDirOverride) env.NOTEFLOW_NOTES_DIR = host.notesDirOverride
  return env
}

function launcherScript(host: AgentRunHost, runner: CliRunner, folder: string, args: readonly string[]): agentRun.AgentLauncherScript {
  return agentRun.buildAgentLauncherScript({
    platform: process.platform, folder, execPath: runner.execPath, cliScript: cliConnect.cliScriptPath(), args,
    env: cliEnv(host, runner), unsetEnv: runner.node ? ['ELECTRON_RUN_AS_NODE'] : [],
  })
}

/**
 * `noteflow run <args> --dry-run --json` in `folder`: would this run start?
 * Changes nothing. Run by the SAME program as the launcher script (on Windows
 * the computer's node.exe), so the agent is looked for the same way both
 * times. Outside Windows "agent not found" does not count: a GUI app's PATH is
 * poorer than the user's shell — the terminal (which runs the user's shell)
 * decides, and says so in its window.
 */
async function dryRun(host: AgentRunHost, runner: CliRunner, folder: string, args: readonly string[]): Promise<{ ok: true } | agentRun.AgentRunFailure> {
  const run = await cliConnect.runCliCapture([...args, '--dry-run', '--json'], {
    cwd: folder, timeoutMs: DRY_RUN_TIMEOUT_MS, env: cliEnv(host, runner), ...(runner.node ? { node: runner.execPath } : {}),
  })
  const verdict = agentRun.interpretAgentDryRun(run)
  if (!verdict.ok && verdict.code === 'agent_not_found' && process.platform !== 'win32') return { ok: true }
  return verdict
}

/**
 * 'agent-run:preflight' — everything that can be known BEFORE a task is
 * queued or moved, so a run that cannot start changes nothing in the note:
 * the gate (feature on, note not encrypted, the folder — asked for here when
 * the note has none —, the custom command / link approved in its native
 * dialog) and, for a terminal, that there is something to run the CLI with in
 * it (Windows: Node.js 18+ — 'node_not_found'), that the launcher script can be
 * written for these paths and that the agent is installed (a dry run of the
 * CLI WITHOUT tasks). 'canceled' = the user closed a dialog: nothing happened.
 */
export async function preflight(host: AgentRunHost, noteId: unknown, parent: BrowserWindow | null): Promise<AgentPreflightResult> {
  if (!agentRun.isAgentNoteId(noteId)) return { ok: false, code: 'invalid_request' }
  const grant = await agentRun.authorizeAgentLaunch(gateFor(host, parent), noteId, { askFolder: true })
  if (!grant.ok) return grant
  if (grant.settings.launch !== 'terminal') return { ok: true, folder: grant.folder }
  const agent = agentRun.agentRunAgentArgs(grant.settings, grant.custom)
  if (!agent.ok) return agent
  const runner = await cliRunnerFor(host, grant.folder)
  if (!runner) return { ok: false, code: 'node_not_found' }
  const probe = path.join(tmpDir(), `${newStem()}.prompt.md`)
  try {
    const args = agentRun.agentRunCliArgs({ ids: [], contextFile: null, promptFile: probe, onFinish: grant.settings.onFinish, agentArgs: agent.args })
    const script = launcherScript(host, runner, grant.folder, args)
    if (!script.ok) return { ok: false, code: script.code, detail: script.value }
    writeText(probe, 'preflight')
    const verdict = await dryRun(host, runner, grant.folder, args)
    return verdict.ok ? { ok: true, folder: grant.folder } : verdict
  } catch (err) {
    return { ok: false, code: 'failed', detail: err instanceof Error ? err.message : String(err) }
  } finally {
    removeQuietly(probe)
  }
}

// ── Terminal ─────────────────────────────────────────────────────────────────

function which(name: string): string | null {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue
    const file = path.join(dir, name)
    try {
      if (fs.statSync(file).isFile()) {
        fs.accessSync(file, fs.constants.X_OK)
        return file
      }
    } catch {
      // not here
    }
  }
  return null
}

/** Windows Terminal's launcher: an app execution alias (a reparse point — lstat, not stat). */
function windowsTerminalPath(): string | null {
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  const file = path.join(local, 'Microsoft', 'WindowsApps', 'wt.exe')
  try {
    fs.lstatSync(file)
    return file
  } catch {
    return null
  }
}

/** Starts one terminal plan: true once it is running (or has handed over and left cleanly), false when it could not start. */
function startTerminal(plan: agentRun.AgentTerminalPlan): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const child = spawn(plan.command, plan.args, {
        cwd: plan.cwd,
        // Never a shell: the command and its arguments go to the OS as they are.
        shell: false,
        detached: !plan.hidden,
        stdio: 'ignore',
        windowsHide: plan.hidden === true,
        windowsVerbatimArguments: plan.verbatim === true,
      })
      child.once('error', () => done(false))
      child.once('spawn', () => {
        // A launcher that fails says so at once (a non-zero exit); one that is
        // still there, or left with 0 after handing over, opened its window.
        const timer = setTimeout(() => done(true), TERMINAL_SETTLE_MS)
        child.once('exit', (code) => {
          clearTimeout(timer)
          done(code === 0 || code === null)
        })
      })
      child.unref()
    } catch {
      done(false)
    }
  })
}

async function openTerminal(scriptDir: string, scriptName: string): Promise<boolean> {
  const plans = agentRun.agentTerminalPlans(process.platform, {
    scriptDir,
    scriptName,
    which,
    windowsTerminal: process.platform === 'win32' ? windowsTerminalPath() : null,
    comspec: agentRun.safeComspec(process.env),
  })
  for (const plan of plans) {
    if (await startTerminal(plan)) return true
    console.warn(`[agent-run] could not open ${plan.name}`)
  }
  return false
}

/**
 * 'agent-run:terminal'. Through the gate again (no dialog for a folder here:
 * the preflight asked), then: validates the run with `noteflow run … --dry-run
 * --json` (in the note's folder, nothing changed) and, when it would work,
 * opens a terminal window on the launcher script that runs it for real — with
 * the agent that was authorized, given explicitly (`--agent`).
 * The context / prompt travels in a temp file of userData/tmp, never on a
 * command line; it is removed ten minutes later (and when the app starts).
 */
export async function runInTerminal(host: AgentRunHost, raw: unknown, parent: BrowserWindow | null): Promise<AgentTerminalResult> {
  const req = agentRun.parseAgentTerminalRequest(raw)
  if (!req) return { ok: false, code: 'invalid_request' }
  const grant = await agentRun.authorizeAgentLaunch(gateFor(host, parent), req.noteId, { mode: 'terminal' })
  if (!grant.ok) return grant
  const agent = agentRun.agentRunAgentArgs(grant.settings, grant.custom)
  if (!agent.ok) return agent
  const runner = await cliRunnerFor(host, grant.folder)
  if (!runner) return { ok: false, code: 'node_not_found' }

  const dir = tmpDir()
  const stem = newStem()
  const text = req.ids.length > 0 ? req.context : req.prompt
  const textFile = text === null ? null : path.join(dir, `${stem}.${req.ids.length > 0 ? 'context' : 'prompt'}.md`)
  let scriptFile: string | null = null
  const cleanUp = () => {
    removeQuietly(textFile)
    removeQuietly(scriptFile)
  }
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    if (textFile && text !== null) writeText(textFile, text)
    const args = agentRun.agentRunCliArgs({
      ids: req.ids,
      contextFile: req.ids.length > 0 ? textFile : null,
      promptFile: req.ids.length > 0 ? null : textFile,
      onFinish: grant.settings.onFinish,
      batchMode: grant.settings.batchMode,
      model: agentRunModel(grant.settings),
      effort: agentRunEffort(grant.settings),
      agentArgs: agent.args,
    })
    const script = launcherScript(host, runner, grant.folder, args)
    if (!script.ok) {
      cleanUp()
      return { ok: false, code: script.code, detail: script.value }
    }
    const verdict = await dryRun(host, runner, grant.folder, args)
    if (!verdict.ok) {
      cleanUp()
      return verdict
    }
    const scriptName = `${stem}${script.ext}`
    scriptFile = path.join(dir, scriptName)
    fs.writeFileSync(scriptFile, script.text, { encoding: 'utf-8', mode: 0o700 })
    if (!(await openTerminal(dir, scriptName))) {
      cleanUp()
      return { ok: false, code: 'no_terminal' }
    }
    if (textFile) setTimeout(() => removeQuietly(textFile), agentRun.AGENT_RUN_TEXT_TTL_MS).unref()
    return { ok: true }
  } catch (err) {
    cleanUp()
    return { ok: false, code: 'failed', detail: err instanceof Error ? err.message : String(err) }
  }
}

// ── Desktop app ──────────────────────────────────────────────────────────────

/**
 * 'agent-run:open-app'. Through the gate, then builds the link here
 * (agentRun.buildAgentAppUrl: fixed schemes for the presets; for a custom link
 * the template that was authorized) and opens it. When the prompt does not fit
 * in a link — or the OS refuses the long one — the prompt goes to the
 * clipboard and the app is opened on the folder alone.
 */
export async function openApp(host: AgentRunHost, raw: unknown, parent: BrowserWindow | null): Promise<AgentAppResult> {
  const req = agentRun.parseAgentAppRequest(raw)
  if (!req) return { ok: false, code: 'invalid_request' }
  const grant = await agentRun.authorizeAgentLaunch(gateFor(host, parent), req.noteId, { mode: 'app' })
  if (!grant.ok) return grant
  const launch = grant.settings.launch
  if (launch === 'terminal') return { ok: false, code: 'invalid_request' }
  const input = { prompt: req.prompt, folder: grant.folder, template: grant.custom?.kind === 'url' ? grant.custom.text : '' }
  const link = agentRun.buildAgentAppUrl(launch, input)
  if (!link.ok) return link

  const open = async (url: string): Promise<boolean> => {
    try {
      await shell.openExternal(url)
      return true
    } catch (err) {
      console.warn('[agent-run] the OS refused the link:', err instanceof Error ? err.message : err)
      return false
    }
  }
  if (!link.promptOmitted) {
    if (await open(link.url)) return { ok: true, app: launch, promptCopied: false }
    // Too long for this OS, perhaps: once more with the folder alone.
  }
  const bare = link.promptOmitted ? link : agentRun.buildAgentAppUrl(launch, { ...input, omitPrompt: true })
  if (!bare.ok) return bare
  clipboard.writeText(req.prompt)
  if (await open(bare.url)) return { ok: true, app: launch, promptCopied: true }
  return { ok: false, code: 'open_failed' }
}
