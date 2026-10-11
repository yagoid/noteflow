// `noteflow pull` throws its errors (instead of exit()ing) so that `login` can
// run it as a best-effort first pull and catch a failure without turning it into
// a failed login. This pins the standalone contract that refactor must keep:
// same "Error: …" line on stderr and exit code 1. Settings and notes live in
// throwaway dirs (APPDATA / XDG_CONFIG_HOME + NOTEFLOW_NOTES_DIR), so nothing
// touches the real GitHub/Cloud sessions and no network call is made.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../cli/noteflow.js')

let tmp: string

type Run = { status: number; stdout: string; stderr: string }

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

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-pull-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('noteflow pull (standalone)', () => {
  it('exits 1 with the usual error line when GitHub is not connected', () => {
    const r = run(['pull'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Error: Not connected. Run: noteflow login')
  })

  it('exits 1 when the stored token is unusable', () => {
    fs.mkdirSync(path.join(tmp, 'config', 'noteflow'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'config', 'noteflow', 'settings.json'),
      JSON.stringify({ githubSync: { enabled: true, encryptedToken: 'safe:opaque', owner: 'o', repo: 'r' } }),
      'utf-8',
    )
    const r = run(['pull'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Error: Token unavailable (encrypted by desktop app). Run: noteflow login')
  })
})

describe('noteflow login --no-pull', () => {
  it('is documented in the help', () => {
    expect(run(['help']).stdout).toContain('--no-pull')
  })
})
