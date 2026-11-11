// Settings → Sync → "Connect the CLI too": gives the bundled CLI
// (cli/noteflow.js) its own access to the backend the app syncs with. Pure
// rules (paths, token mirror, plans) live in cliConnectLogic.ts.
//
//  - NoteFlow Cloud: the CLI must have its OWN GoTrue session (GoTrue rotates
//    the refresh token on every use — a shared one would sign the app and the
//    CLI out of each other), so the app runs the CLI's own non-interactive
//    login: `cloud login <email> --send-code`, then `--code <code> --no-pull`
//    (no pull: the app already syncs the same notes dir), and `cloud logout`.
//    The app never reads the CLI's refresh token.
//  - GitHub: no new authorization — the app hands its token to the CLI (the
//    user confirms first: the CLI stores it base64, without the OS keyring).
//    See planGithubConnect for where it goes on each OS.
//
// The CLI's settings.json is written read-modify-write with a fresh read and
// no await in between, like every writer of the app's settings.json — on
// Windows it is the same file, so the app's keys survive these writes and the
// CLI keys (cliAccount, cliCloud, cliGithubToken…) survive the app's.

import { app } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeSettingsFile } from './settingsFile'
import {
  classifyCliCloudError,
  cliSettingsPath,
  cliStatusFromSettings,
  dropOrphanCliGithubToken,
  isCliSettingsShared,
  planGithubConnect,
  planGithubDisconnect,
  type CliConnectResult,
  type CliConnectStatus,
  type GithubTarget,
} from './cliConnectLogic'

const CLI_TIMEOUT_MS = 60_000

function settingsPath(): string {
  return cliSettingsPath(process.platform, process.env, os.homedir())
}

const shared = (): boolean => isCliSettingsShared(process.platform)

function cliScriptPath(): string {
  // Same layout as the bundled skill (syncSkillToAgentDirs in main.ts):
  // extraResources in a build, the repo's cli/ in dev (__dirname = dist-electron/).
  return app.isPackaged
    ? path.join(process.resourcesPath, 'cli', 'noteflow.js')
    : path.join(__dirname, '..', 'cli', 'noteflow.js')
}

// Microsoft Store build: the bundled CLI isn't on PATH, and the CLI's
// settings.json (in AppData) would be written into the package's private,
// virtualized copy, invisible to a CLI installed outside the Store. Settings →
// Sync shows an explanation instead of this section there.
const IS_STORE_BUILD = process.windowsStore === true

function cliAvailable(): boolean {
  if (IS_STORE_BUILD) return false
  try {
    return fs.existsSync(cliScriptPath())
  } catch {
    return false
  }
}

/**
 * The CLI's parsed settings: `{}` when the file does not exist, null when it
 * exists but can't be read/parsed. Writers must stop on null — writing `{}`
 * back would wipe it (on Windows, the app's own settings with it).
 */
function readCliSettings(): Record<string, unknown> | null {
  let raw: string
  try {
    raw = fs.readFileSync(settingsPath(), 'utf-8')
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? {} : null
  }
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeCliSettings(data: Record<string, unknown>): void {
  const file = settingsPath()
  const dir = path.dirname(file)
  // 0700 only when WE create it — same as the CLI's writeSettings.
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeSettingsFile(file, data) // owner-only (0600) on POSIX
}

/** The CLI's per-repo GitHub bases cache (GITHUB_BASES_PATH in cli/noteflow.js). */
function clearCliGithubBases(): void {
  try {
    fs.unlinkSync(path.join(path.dirname(settingsPath()), 'cli-github-state.json'))
  } catch {
    // not there
  }
}

export function getStatus(): CliConnectStatus {
  const settings = readCliSettings() ?? {}
  return { available: cliAvailable(), ...cliStatusFromSettings(settings, shared()) }
}

// ── CLI child process ─────────────────────────────────────────────────────────

interface CliRun {
  code: number | null
  stderr: string
}

/**
 * Runs the bundled CLI with this Electron binary as Node (ELECTRON_RUN_AS_NODE),
 * so no Node install is needed. stdin is closed: only non-interactive commands
 * are run (a prompt would end the CLI with an error, never hang it).
 */
function runCli(args: string[]): Promise<CliRun> {
  return new Promise((resolve) => {
    let stderr = ''
    let settled = false
    const child = spawn(process.execPath, [cliScriptPath(), ...args], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NOTEFLOW_NO_APP_CHECK: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    // Events only fire after this executor returns, so `timer` is always set.
    const timer = setTimeout(() => {
      child.kill()
      finish({ code: null, stderr: `${stderr}\n  Error: network timeout` })
    }, CLI_TIMEOUT_MS)
    function finish(run: CliRun) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(run)
    }
    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (err) => finish({ code: null, stderr: `  Error: ${err.message}` }))
    child.on('close', (code) => finish({ code, stderr }))
  })
}

async function runCloudCommand(args: string[]): Promise<CliConnectResult> {
  if (!cliAvailable()) return { ok: false, error: 'cliMissing' }
  const run = await runCli(args)
  if (run.code !== 0) return { ok: false, ...classifyCliCloudError(run.stderr) }
  return { ok: true, status: getStatus() }
}

// ── Cloud ─────────────────────────────────────────────────────────────────────

/** Step 1: the CLI emails a sign-in code to `email` (the app's account). */
export function cloudSendCode(email: string): Promise<CliConnectResult> {
  return runCloudCommand(['cloud', 'login', email, '--send-code'])
}

/** Step 2: the CLI verifies the code and saves ITS session (cliAccount) — no pull. */
export async function cloudVerifyCode(email: string, code: string): Promise<CliConnectResult> {
  const result = await runCloudCommand(['cloud', 'login', email, '--code', code, '--no-pull'])
  // Exit 0 with no session on disk would mean the CLI's write was lost.
  if (result.ok && !result.status.cloud.connected) return { ok: false, error: 'failed' }
  return result
}

/** `cloud logout` of the CLI: revokes only the CLI's own session (scope=local). */
export function cloudDisconnect(): Promise<CliConnectResult> {
  return runCloudCommand(['cloud', 'logout'])
}

// ── GitHub ────────────────────────────────────────────────────────────────────

export function githubConnect(target: GithubTarget): CliConnectResult {
  if (IS_STORE_BUILD) return { ok: false, error: 'cliMissing' }
  const settings = readCliSettings()
  if (!settings) return { ok: false, error: 'failed' }
  const plan = planGithubConnect(settings, target, shared())
  if (!plan.ok) return { ok: false, error: plan.error }
  writeCliSettings(plan.settings)
  if (plan.clearBases) clearCliGithubBases()
  return { ok: true, status: getStatus() }
}

export function githubDisconnect(): CliConnectResult {
  if (IS_STORE_BUILD) return { ok: false, error: 'cliMissing' }
  const settings = readCliSettings()
  if (!settings) return { ok: false, error: 'failed' }
  const plan = planGithubDisconnect(settings, shared())
  if (plan) {
    writeCliSettings(plan.settings)
    if (plan.clearBases) clearCliGithubBases()
  }
  return { ok: true, status: getStatus() }
}

/**
 * After the app disconnects GitHub: drop the CLI's token copy if it no longer
 * matches any connection (on Windows the app just deleted the shared
 * githubSync). Best-effort — never fails the app's disconnect.
 */
export function cleanupAfterAppGithubDisconnect(): void {
  try {
    const settings = readCliSettings()
    if (!settings) return
    const next = dropOrphanCliGithubToken(settings)
    if (next) writeCliSettings(next)
  } catch (err) {
    console.error('[cliConnect] cleanup after GitHub disconnect failed:', err)
  }
}
