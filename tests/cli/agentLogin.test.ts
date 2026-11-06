// Non-interactive two-step sign-ins of cli/noteflow.js, so an AI agent (no
// stdin, no long-lived terminal) can turn sync on for the user:
//   - `cloud login <email> --send-code` / `--code <code>` (planCloudLogin)
//   - `login --no-wait` / `login --finish` (pending Device Flow grant)
//   - the `desktopApp` hint of `status --json` (the app's Cloud session, read-only)
// Pure helpers are tested directly; the error paths run the CLI against
// throwaway settings/notes dirs and never reach the network.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../cli/noteflow.js')

type CloudPlan = { mode?: 'interactive' | 'sendCode' | 'code'; email?: string; code?: string; error?: string }
const planCloudLogin = cli.planCloudLogin as (email: string | undefined, opts: Record<string, unknown>) => CloudPlan
const loginFlagsError = cli.loginFlagsError as (opts: Record<string, unknown>) => string | null
type PendingCheck = { ok: boolean; reason?: 'missing' | 'expired'; pending?: { repo: string; interval: number; expiresMs: number } }
const checkPendingGithubLogin = cli.checkPendingGithubLogin as (raw: unknown, nowMs: number) => PendingCheck
const resolveFinishRepo = cli.resolveFinishRepo as (pendingRepo: string, repoArg?: string) => { repo?: string; error?: string }
const desktopSettingsCandidates = cli.desktopSettingsCandidates as (platform: string, env: Record<string, string>, home: string) => string[]
const desktopAppInfo = cli.desktopAppInfo as (settings: unknown) => unknown

describe('planCloudLogin', () => {
  it('keeps the interactive flow without flags', () => {
    expect(planCloudLogin(undefined, {})).toEqual({ mode: 'interactive', email: '' })
    expect(planCloudLogin(' me@x.io ', {})).toEqual({ mode: 'interactive', email: 'me@x.io' })
    expect(planCloudLogin('nope', {}).error).toBe('A valid email is required')
  })

  it('--send-code needs the email as an argument', () => {
    expect(planCloudLogin('me@x.io', { sendCode: true })).toEqual({ mode: 'sendCode', email: 'me@x.io' })
    expect(planCloudLogin(undefined, { sendCode: true }).error).toContain('Usage: noteflow cloud login <email> --send-code')
    expect(planCloudLogin('nope', { sendCode: true }).error).toContain('is not an email address')
  })

  it('--code needs the email and a well-formed code (normalized)', () => {
    expect(planCloudLogin('me@x.io', { code: '1234 5678' })).toEqual({ mode: 'code', email: 'me@x.io', code: '12345678' })
    expect(planCloudLogin(undefined, { code: '12345678' }).error).toContain('Usage: noteflow cloud login <email> --code <code>')
    expect(planCloudLogin('me@x.io', { code: '123' }).error).toContain('is not a valid sign-in code')
    expect(planCloudLogin('me@x.io', { code: '' }).error).toContain('is not a valid sign-in code')
  })

  it('--send-code and --code are mutually exclusive', () => {
    expect(planCloudLogin('me@x.io', { sendCode: true, code: '12345678' }).error)
      .toBe('--send-code and --code cannot be used together')
  })
})

describe('login --no-wait / --finish helpers', () => {
  const now = Date.parse('2026-11-05T10:00:00.000Z')
  const pending = { deviceCode: 'dc', userCode: 'AB-CD', interval: 5, expiresAt: '2026-11-05T10:15:00.000Z', repo: 'notes' }

  it('rejects --no-wait together with --finish', () => {
    expect(loginFlagsError({ noWait: true, finish: true })).toContain('cannot be used together')
    expect(loginFlagsError({ noWait: true })).toBeNull()
    expect(loginFlagsError({ finish: true, noPull: true })).toBeNull()
  })

  it('accepts a live pending grant', () => {
    const r = checkPendingGithubLogin(pending, now)
    expect(r.ok).toBe(true)
    expect(r.pending).toMatchObject({ repo: 'notes', interval: 5, expiresMs: Date.parse(pending.expiresAt) })
  })

  it('reports an expired grant', () => {
    expect(checkPendingGithubLogin(pending, Date.parse(pending.expiresAt))).toEqual({ ok: false, reason: 'expired' })
  })

  it('treats a missing or malformed grant as missing', () => {
    expect(checkPendingGithubLogin(undefined, now)).toEqual({ ok: false, reason: 'missing' })
    expect(checkPendingGithubLogin({ ...pending, deviceCode: '' }, now)).toEqual({ ok: false, reason: 'missing' })
    expect(checkPendingGithubLogin({ ...pending, expiresAt: 'soon' }, now)).toEqual({ ok: false, reason: 'missing' })
  })

  it('falls back to safe defaults for interval and repo', () => {
    const r = checkPendingGithubLogin({ deviceCode: 'dc', expiresAt: pending.expiresAt }, now)
    expect(r.pending).toMatchObject({ interval: 5, repo: 'noteflow-notes' })
  })

  it('--finish keeps the pending repo; a different repo is an error', () => {
    expect(resolveFinishRepo('notes', undefined)).toEqual({ repo: 'notes' })
    expect(resolveFinishRepo('notes', 'notes')).toEqual({ repo: 'notes' })
    expect(resolveFinishRepo('notes', 'other').error).toContain('The pending login is for "notes"')
  })
})

describe('desktopApp hint', () => {
  it('locates the app settings under its productName dir', () => {
    expect(desktopSettingsCandidates('win32', { APPDATA: 'C:\\R' }, 'C:\\H'))
      .toEqual([path.join('C:\\R', 'NoteFlow', 'settings.json')])
    expect(desktopSettingsCandidates('darwin', {}, '/Users/me'))
      .toEqual([path.join('/Users/me', 'Library', 'Application Support', 'NoteFlow', 'settings.json')])
    // Never the CLI's own lowercase ~/.config/noteflow (it exists without the app).
    expect(desktopSettingsCandidates('linux', { XDG_CONFIG_HOME: '/c' }, '/home/me'))
      .toEqual([path.join('/c', 'NoteFlow', 'settings.json')])
    expect(desktopSettingsCandidates('linux', {}, '/home/me'))
      .toEqual([path.join('/home/me', '.config', 'NoteFlow', 'settings.json')])
    expect(desktopSettingsCandidates('freebsd', {}, '/home/me')).toEqual([])
  })

  it('reports the app session and its email, never the token', () => {
    const info = desktopAppInfo({
      account: { email: 'me@x.io', userId: 'u1', encryptedRefreshToken: 'safe:secret' },
      cloudSync: { enabled: true },
    })
    expect(info).toEqual({ cloudSignedIn: true, cloudSyncEnabled: true, cloudEmail: 'me@x.io', github: null })
    expect(JSON.stringify(info)).not.toContain('secret')
  })

  it('is signed out without a refresh token or userId (same rule as the app)', () => {
    expect(desktopAppInfo({ account: { email: 'me@x.io', userId: 'u1' } }))
      .toEqual({ cloudSignedIn: false, cloudSyncEnabled: false, github: null })
    expect(desktopAppInfo({ account: { encryptedRefreshToken: 'safe:x' }, cloudSync: { enabled: true } }))
      .toEqual({ cloudSignedIn: false, cloudSyncEnabled: false, github: null })
    expect(desktopAppInfo({})).toEqual({ cloudSignedIn: false, cloudSyncEnabled: false, github: null })
  })

  it('omits an email that is not plain text', () => {
    expect(desktopAppInfo({ account: { email: 'safe:opaque', userId: 'u1', encryptedRefreshToken: 'x' } }))
      .toEqual({ cloudSignedIn: true, cloudSyncEnabled: false, github: null })
  })

  it("reports the app's GitHub repo, never its token", () => {
    const info = desktopAppInfo({ githubSync: { enabled: true, owner: 'me', repo: 'notes', encryptedToken: 'safe:secret' } })
    expect(info).toEqual({ cloudSignedIn: false, cloudSyncEnabled: false, github: { owner: 'me', repo: 'notes' } })
    expect(JSON.stringify(info)).not.toContain('secret')
    expect(desktopAppInfo({ githubSync: { enabled: false, owner: 'me', repo: 'notes' } }))
      .toEqual({ cloudSignedIn: false, cloudSyncEnabled: false, github: null })
  })

  it('is null when there is no settings file to read', () => {
    expect(desktopAppInfo(null)).toBeNull()
  })
})

// ── CLI runs (no network) ─────────────────────────────────────────────────────

let tmp: string
type Run = { status: number; stdout: string; stderr: string }
const settingsPath = () => path.join(tmp, 'config', 'noteflow', 'settings.json')

function run(args: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
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
    return { status: 0, stdout, stderr: '' }
  } catch (e) {
    const x = e as { status: number; stdout: string; stderr: string }
    return { status: x.status, stdout: x.stdout ?? '', stderr: x.stderr ?? '' }
  }
}

function writeSettings(data: unknown): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(data), 'utf-8')
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-agentlogin-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('non-interactive login error paths', () => {
  it('cloud login --code without an email is a usage error (no prompt)', () => {
    const r = run(['cloud', 'login', '--code', '12345678'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Usage: noteflow cloud login <email> --code <code>')
  })

  it('cloud login --send-code with --code fails before any request', () => {
    const r = run(['cloud', 'login', 'me@x.io', '--send-code', '--code', '12345678'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('--send-code and --code cannot be used together')
  })

  it('login --finish without a pending login points to --no-wait', () => {
    const r = run(['login', '--finish'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain("No pending GitHub login. Run 'noteflow login --no-wait' first")
  })

  it('login --finish drops an expired pending login', () => {
    writeSettings({ language: 'en', cliGithubLogin: { deviceCode: 'dc', interval: 5, expiresAt: '2020-01-01T00:00:00.000Z', repo: 'r' } })
    const r = run(['login', '--finish'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('has expired')
    expect(JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))).toEqual({ language: 'en' })
  })

  it('login --finish with another repo than the pending one fails and keeps it', () => {
    const pending = { deviceCode: 'dc', interval: 5, expiresAt: '2099-01-01T00:00:00.000Z', repo: 'notes' }
    writeSettings({ cliGithubLogin: pending })
    const r = run(['login', 'other', '--finish'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('The pending login is for "notes"')
    expect(JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')).cliGithubLogin).toEqual(pending)
  })

  it('documents the new flags in the help', () => {
    expect(run(['help', 'login']).stdout).toContain('--finish')
    expect(run(['help', 'cloud']).stdout).toContain('--send-code')
  })
})

describe('status --json desktopApp', () => {
  // The app's userData is <appData>/NoteFlow (Electron uses package.json's
  // productName). On Windows that is the CLI's own dir (NTFS ignores case).
  const appSettingsPath = () => path.join(tmp, 'config', 'NoteFlow', 'settings.json')

  it.skipIf(process.platform !== 'win32' && process.platform !== 'linux')(
    'reports the desktop app Cloud session found in its settings.json',
    () => {
      fs.mkdirSync(path.dirname(appSettingsPath()), { recursive: true })
      fs.writeFileSync(appSettingsPath(), JSON.stringify({ account: { email: 'me@x.io', userId: 'u1', encryptedRefreshToken: 'safe:x' } }), 'utf-8')
      const r = run(['status', '--json'])
      expect(r.status).toBe(0)
      expect(JSON.parse(r.stdout).desktopApp).toEqual({ cloudSignedIn: true, cloudSyncEnabled: false, cloudEmail: 'me@x.io', github: null })
    },
  )

  it.skipIf(process.platform !== 'linux')(
    "is null on Linux when only the CLI's own ~/.config/noteflow exists",
    () => {
      writeSettings({ account: { email: 'me@x.io', userId: 'u1', encryptedRefreshToken: 'safe:x' } })
      const r = run(['status', '--json'])
      expect(r.status).toBe(0)
      expect(JSON.parse(r.stdout).desktopApp).toBeNull()
    },
  )
})
