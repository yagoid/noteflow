// v2.10.0: the CLI's own copy of the desktop app's GitHub token
// (`cliGithubToken`, written by the app's Settings → Sync → "Connect the CLI
// too" when githubSync holds the app's safeStorage ciphertext — Windows, shared
// settings.json). Runs the real CLI against throwaway settings/notes dirs; only
// local commands (status, logout), nothing reaches the network.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const CLI_PATH = require.resolve('../../cli/noteflow.js')

const b64 = (s: string) => Buffer.from(s).toString('base64')
const APP_SAFE = 'safe:' + b64('\u0001\u0002ciphertext')

let tmp: string
let configDir: string
const settingsPath = () => path.join(configDir, 'noteflow', 'settings.json')

function writeSettings(data: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(data), 'utf-8')
}

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      APPDATA: configDir,
      XDG_CONFIG_HOME: configDir,
      NOTEFLOW_NOTES_DIR: path.join(tmp, 'notes'),
      NOTEFLOW_NO_APP_CHECK: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-cligh-'))
  configDir = path.join(tmp, 'config')
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('cliGithubToken', () => {
  const appSync = { enabled: true, owner: 'ana', repo: 'noteflow-notes', encryptedToken: APP_SAFE }

  it('makes the app-encrypted connection usable (status --json tokenAccessible)', () => {
    writeSettings({ githubSync: appSync })
    expect(JSON.parse(run('status', '--json').stdout).github.tokenAccessible).toBe(false)

    writeSettings({ githubSync: appSync, cliGithubToken: { owner: 'ana', token: b64('gho_x') } })
    expect(JSON.parse(run('status', '--json').stdout).github.tokenAccessible).toBe(true)

    // A copy for another GitHub account is ignored.
    writeSettings({ githubSync: appSync, cliGithubToken: { owner: 'bob', token: b64('gho_x') } })
    expect(JSON.parse(run('status', '--json').stdout).github.tokenAccessible).toBe(false)
  })

  it('`noteflow logout` removes it with githubSync and keeps every other key', () => {
    writeSettings({
      githubSync: appSync,
      cliGithubToken: { owner: 'ana', token: b64('gho_x') },
      cliAccount: { email: 'a@b.c', refreshToken: b64('rt') },
      theme: 'dark',
    })
    expect(run('logout').status).toBe(0)
    const after = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    expect(after).not.toHaveProperty('githubSync')
    expect(after).not.toHaveProperty('cliGithubToken')
    expect(after.cliAccount).toEqual({ email: 'a@b.c', refreshToken: b64('rt') })
    expect(after.theme).toBe('dark')
  })
})
