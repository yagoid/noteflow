// settings.json holds the CLI's GitHub token and Cloud refresh token base64-
// encoded (a plain Node process has no safeStorage), so on POSIX its mode is
// the only barrier against other local users: the CLI keeps it 0600 on every
// write and heals a world-readable one on startup, even for read-only commands.
// Settings and notes live in throwaway dirs (APPDATA / XDG_CONFIG_HOME +
// NOTEFLOW_NOTES_DIR); only local commands run — no network. POSIX modes don't
// exist on Windows, where these tests are skipped.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../cli/noteflow.js')
const isWindows = process.platform === 'win32'

let tmp: string
const settingsDir = () => path.join(tmp, 'config', 'noteflow')
const settingsPath = () => path.join(settingsDir(), 'settings.json')
const mode = (p: string) => fs.statSync(p).mode & 0o777

function run(args: string[]): void {
  execFileSync(process.execPath, [CLI, ...args], {
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
}

function writeLegacySettings(fileMode: number): void {
  fs.mkdirSync(settingsDir(), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify({ language: 'en', githubSync: { enabled: false } }), 'utf-8')
  fs.chmodSync(settingsPath(), fileMode)
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-perms-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('settings.json permissions (POSIX)', () => {
  it.skipIf(isWindows)('creates settings.json as 0600 (and its dir as 0700) on first write', () => {
    run(['logout'])
    expect(mode(settingsPath())).toBe(0o600)
    expect(mode(settingsDir())).toBe(0o700)
  })

  it.skipIf(isWindows)('tightens a pre-existing 0644 settings.json on write, keeping its other fields', () => {
    writeLegacySettings(0o644)
    run(['logout'])
    expect(mode(settingsPath())).toBe(0o600)
    expect(JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))).toEqual({ language: 'en' })
  })

  it.skipIf(isWindows)('tightens a pre-existing 0644 settings.json on a read-only command', () => {
    writeLegacySettings(0o644)
    run(['list'])
    expect(mode(settingsPath())).toBe(0o600)
  })

  it.skipIf(isWindows)('leaves an already owner-only file alone', () => {
    writeLegacySettings(0o400)
    run(['list'])
    expect(mode(settingsPath())).toBe(0o400)
  })
})
