// Settings → Sync → "Connect the CLI too" (electron/cliConnectLogic.ts): where
// the CLI's settings live, what the app reports about them, and how the GitHub
// connection is handed over without ever replacing the app's encrypted token
// (on Windows the CLI's settings.json IS the app's). The CLI side of the token
// rule (resolveGithubToken) is checked against the same cases at the end.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  classifyCliCloudError,
  cliSettingsPath,
  cliStatusFromSettings,
  decodeCliToken,
  dropOrphanCliGithubToken,
  encodeCliToken,
  isCliSettingsShared,
  planGithubConnect,
  planGithubDisconnect,
  resolveCliGithubToken,
} from '../../electron/cliConnectLogic'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cli: any = require('../../cli/noteflow.js')

const b64 = (s: string) => Buffer.from(s).toString('base64')
const APP_SAFE = 'safe:' + b64('\u0001\u0002ciphertext')
const target = { owner: 'ana', repo: 'noteflow-notes', token: 'gho_secret' }

describe('cliSettingsPath / isCliSettingsShared', () => {
  it('Windows: %APPDATA%\\noteflow (the app userData, case-insensitive)', () => {
    expect(cliSettingsPath('win32', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'C:\\Users\\a'))
      .toBe('C:\\Users\\a\\AppData\\Roaming\\noteflow\\settings.json')
    expect(cliSettingsPath('win32', {}, 'C:\\Users\\a')).toBe('C:\\Users\\a\\AppData\\Roaming\\noteflow\\settings.json')
    expect(isCliSettingsShared('win32')).toBe(true)
  })

  it('macOS/Linux: ${XDG_CONFIG_HOME:-~/.config}/noteflow — never the app file', () => {
    expect(cliSettingsPath('linux', {}, '/home/a')).toBe('/home/a/.config/noteflow/settings.json')
    expect(cliSettingsPath('darwin', { XDG_CONFIG_HOME: '/x' }, '/Users/a')).toBe('/x/noteflow/settings.json')
    expect(isCliSettingsShared('linux')).toBe(false)
    expect(isCliSettingsShared('darwin')).toBe(false)
  })
})

describe('tokens', () => {
  it('decodes plain base64, rejects the app ciphertext and binary', () => {
    expect(decodeCliToken(b64('gho_x'))).toBe('gho_x')
    expect(decodeCliToken(APP_SAFE)).toBeNull()
    expect(decodeCliToken(b64('\u0001\u00ff'))).toBeNull()
    expect(decodeCliToken(undefined)).toBeNull()
    expect(decodeCliToken(encodeCliToken('gho_y'))).toBe('gho_y')
  })

  it('githubSync token first; the cliGithubToken copy only for the same owner', () => {
    const gh = { enabled: true, owner: 'ana', repo: 'r' }
    expect(resolveCliGithubToken({ githubSync: { ...gh, encryptedToken: b64('own') } }))
      .toEqual({ token: 'own', source: 'githubSync' })
    expect(resolveCliGithubToken({
      githubSync: { ...gh, encryptedToken: APP_SAFE },
      cliGithubToken: { owner: 'ana', token: b64('copy') },
    })).toEqual({ token: 'copy', source: 'cliGithubToken' })
    expect(resolveCliGithubToken({
      githubSync: { ...gh, encryptedToken: APP_SAFE },
      cliGithubToken: { owner: 'bob', token: b64('copy') },
    })).toBeNull()
    // No githubSync token at all (app disconnected): the copy alone is not a connection.
    expect(resolveCliGithubToken({ cliGithubToken: { owner: 'ana', token: b64('copy') } })).toBeNull()
  })
})

describe('cliStatusFromSettings', () => {
  it('Cloud = presence of the CLI session (email only, never the token)', () => {
    const s = cliStatusFromSettings({ cliAccount: { email: 'a@b.c', userId: 'u', refreshToken: b64('rt') } }, true)
    expect(s.cloud).toEqual({ connected: true, email: 'a@b.c' })
    // The app's own session does not count.
    expect(cliStatusFromSettings({ account: { email: 'a@b.c', encryptedRefreshToken: 'x', userId: 'u' } }, true).cloud)
      .toEqual({ connected: false })
  })

  it('GitHub: the app token alone (Windows) is not connected; the copy is, and can be removed', () => {
    const appOnly = { githubSync: { enabled: true, owner: 'ana', repo: 'r', encryptedToken: APP_SAFE } }
    expect(cliStatusFromSettings(appOnly, true).github).toEqual({ connected: false, canDisconnect: false })
    const withCopy = { ...appOnly, cliGithubToken: { owner: 'ana', token: b64('t') } }
    expect(cliStatusFromSettings(withCopy, true).github)
      .toEqual({ connected: true, owner: 'ana', repo: 'r', canDisconnect: true })
  })

  it('GitHub: a readable githubSync token is removable only where the file is the CLI\'s own', () => {
    const s = { githubSync: { enabled: true, owner: 'ana', repo: 'r', encryptedToken: b64('t') } }
    expect(cliStatusFromSettings(s, true).github.canDisconnect).toBe(false) // Windows: it is the app's too
    expect(cliStatusFromSettings(s, false).github).toEqual({ connected: true, owner: 'ana', repo: 'r', canDisconnect: true })
    expect(cliStatusFromSettings({ githubSync: { ...s.githubSync, enabled: false } }, false).github.connected).toBe(false)
  })
})

describe('planGithubConnect', () => {
  it('Windows: never touches the app githubSync — writes the cliGithubToken copy', () => {
    const app = { enabled: true, owner: 'ana', repo: 'noteflow-notes', encryptedToken: APP_SAFE, lastSync: 'L' }
    const settings = { githubSync: app, account: { x: 1 }, cliAccount: { refreshToken: 'r' }, theme: 'dark' }
    const plan = planGithubConnect(settings, target, true)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.settings.githubSync).toBe(app)
    expect(plan.settings.cliGithubToken).toEqual({ owner: 'ana', token: b64('gho_secret') })
    expect(plan.settings.account).toEqual({ x: 1 })
    expect(plan.settings.cliAccount).toEqual({ refreshToken: 'r' })
    expect(plan.clearBases).toBe(false)
    expect(resolveCliGithubToken(plan.settings)?.token).toBe('gho_secret')
    expect(settings).not.toHaveProperty('cliGithubToken') // input not mutated
  })

  it('Windows: no githubSync there → noRepo; another repo → mismatch; nothing written', () => {
    expect(planGithubConnect({ githubSync: { owner: 'bob', repo: 'x', encryptedToken: APP_SAFE } }, target, true))
      .toEqual({ ok: false, error: 'mismatch' })
    expect(planGithubConnect({ githubSync: { owner: 'ana', repo: 'other', encryptedToken: APP_SAFE } }, target, true))
      .toEqual({ ok: false, error: 'mismatch' })
    expect(planGithubConnect({}, target, true)).toEqual({ ok: false, error: 'noRepo' })
    expect(planGithubConnect({ githubSync: { enabled: false } }, target, true)).toEqual({ ok: false, error: 'noRepo' })
  })

  it('an unreadable (app) token is protected on any OS', () => {
    const plan = planGithubConnect({ githubSync: { owner: 'ana', repo: 'noteflow-notes', encryptedToken: APP_SAFE } }, target, false)
    expect(plan.ok && plan.settings.githubSync).toEqual({ owner: 'ana', repo: 'noteflow-notes', encryptedToken: APP_SAFE })
  })

  it('macOS/Linux: writes githubSync like `noteflow login` (same repo keeps state, another starts clean)', () => {
    const fresh = planGithubConnect({ cliGithubToken: { owner: 'ana', token: 'x' } }, target, false)
    expect(fresh).toEqual({
      ok: true,
      clearBases: true,
      settings: { githubSync: { enabled: true, encryptedToken: b64('gho_secret'), owner: 'ana', repo: 'noteflow-notes' } },
    })
    const same = planGithubConnect(
      { githubSync: { enabled: false, owner: 'ana', repo: 'noteflow-notes', lastSync: 'L', encryptedToken: b64('old') } },
      target,
      false,
    )
    expect(same.ok && same.settings.githubSync).toEqual({
      enabled: true, owner: 'ana', repo: 'noteflow-notes', lastSync: 'L', encryptedToken: b64('gho_secret'),
    })
    expect(same.ok && same.clearBases).toBe(false)
    const other = planGithubConnect({ githubSync: { owner: 'ana', repo: 'old', lastSync: 'L', encryptedToken: b64('o') } }, target, false)
    expect(other.ok && other.settings.githubSync).not.toHaveProperty('lastSync')
  })
})

describe('planGithubDisconnect / dropOrphanCliGithubToken', () => {
  it('Windows: removes only the copy; the shared githubSync stays', () => {
    const gh = { owner: 'ana', repo: 'r', encryptedToken: APP_SAFE }
    expect(planGithubDisconnect({ githubSync: gh, cliGithubToken: { owner: 'ana', token: 't' } }, true))
      .toEqual({ settings: { githubSync: gh }, clearBases: false })
    expect(planGithubDisconnect({ githubSync: { ...gh, encryptedToken: b64('t') } }, true)).toBeNull()
  })

  it('macOS/Linux: drops the CLI githubSync (its own file)', () => {
    expect(planGithubDisconnect({ githubSync: { owner: 'a' }, theme: 'x' }, false))
      .toEqual({ settings: { theme: 'x' }, clearBases: true })
    expect(planGithubDisconnect({ theme: 'x' }, false)).toBeNull()
  })

  it('an orphan copy (no githubSync / another owner) is dropped; a live one is kept', () => {
    const copy = { owner: 'ana', token: 't' }
    expect(dropOrphanCliGithubToken({ cliGithubToken: copy, theme: 'x' })).toEqual({ theme: 'x' })
    expect(dropOrphanCliGithubToken({ cliGithubToken: copy, githubSync: { owner: 'bob', encryptedToken: APP_SAFE } }))
      .toEqual({ githubSync: { owner: 'bob', encryptedToken: APP_SAFE } })
    expect(dropOrphanCliGithubToken({ cliGithubToken: copy, githubSync: { owner: 'ana', encryptedToken: APP_SAFE } })).toBeNull()
    expect(dropOrphanCliGithubToken({ theme: 'x' })).toBeNull()
  })
})

describe('classifyCliCloudError', () => {
  it('maps the CLI error lines', () => {
    expect(classifyCliCloudError('  Error: That code is invalid or has expired. Check it and retry\n'))
      .toMatchObject({ error: 'invalidCode' })
    expect(classifyCliCloudError('  Error: "abc" is not a valid sign-in code — pass the digits'))
      .toMatchObject({ error: 'invalidCode' })
    expect(classifyCliCloudError('  Error: Too many attempts — wait a moment and try again'))
      .toMatchObject({ error: 'rateLimited' })
    expect(classifyCliCloudError('  Error: fetch failed')).toEqual({ error: 'network', detail: 'fetch failed' })
    expect(classifyCliCloudError('  Sent…\n  Error: Could not send the sign-in code (HTTP 500)\n'))
      .toEqual({ error: 'failed', detail: 'Could not send the sign-in code (HTTP 500)' })
    expect(classifyCliCloudError('')).toEqual({ error: 'failed', detail: undefined })
  })
})

describe('CLI mirror (cli/noteflow.js resolveGithubToken)', () => {
  const cases: Array<Record<string, unknown>> = [
    { githubSync: { owner: 'ana', encryptedToken: b64('own') } },
    { githubSync: { owner: 'ana', encryptedToken: APP_SAFE }, cliGithubToken: { owner: 'ana', token: b64('copy') } },
    { githubSync: { owner: 'ana', encryptedToken: APP_SAFE }, cliGithubToken: { owner: 'bob', token: b64('copy') } },
    { githubSync: { owner: 'ana', encryptedToken: APP_SAFE } },
    { githubSync: { owner: 'ana', encryptedToken: b64('\u0001bin') }, cliGithubToken: { owner: 'ana', token: b64('copy') } },
    { cliGithubToken: { owner: 'ana', token: b64('copy') } },
  ]
  it.each(cases.map((c, i) => [i, c]))('case %i agrees with the app', (_i, settings) => {
    const s = settings as Record<string, unknown>
    expect(cli.resolveGithubToken(s.githubSync, s.cliGithubToken)).toBe(resolveCliGithubToken(s)?.token ?? null)
  })
})
