// Pure logic of Settings → Sync → "Connect the CLI too" (electron/cliConnect.ts
// does the IO). The CLI (cli/noteflow.js) keeps its OWN sync credentials in its
// own settings.json — and on Windows that file IS the app's userData
// settings.json (`%APPDATA%\noteflow` = `%APPDATA%\NoteFlow`, NTFS is
// case-insensitive) — so everything here reads/patches a parsed settings
// object WITHOUT touching anything that is the app's:
//  - Cloud: the CLI's session is `cliAccount` (+ `cliCloud`), only ever written
//    by the CLI itself (`cloud login`/`logout`, run as a child process). Here
//    we just read whether it exists and its email — never its refresh token.
//  - GitHub: the CLI syncs with `githubSync`. On Windows that key is the app's,
//    whose token is safeStorage-encrypted (`safe:…`) and unreadable by a plain
//    Node process. The app's encrypted token must never be replaced or
//    downgraded, so there the plaintext copy goes to the CLI-owned key
//    `cliGithubToken` = { owner, token: base64 }, which the CLI's getToken()
//    uses when githubSync's token is unreadable (resolveGithubToken in the
//    CLI — mirrored below). On macOS/Linux the CLI's file is its own, and the
//    app writes githubSync the way `noteflow login` does (completeGithubLogin).

import path from 'path'

/** What Settings → Sync shows about the CLI. Mirror in src/types/index.ts. */
export interface CliConnectStatus {
  /** The bundled CLI script was found (resources/cli in a build, cli/ in dev). */
  available: boolean
  cloud: { connected: boolean; email?: string }
  github: {
    connected: boolean
    owner?: string
    repo?: string
    /**
     * False when the CLI reads the very same `githubSync` token the app uses
     * (Windows, app token stored as plain base64): removing it would
     * disconnect the app too, so only the app's own "Disconnect" can.
     */
    canDisconnect: boolean
  }
}

export type CliConnectError =
  | 'cliMissing' // the bundled CLI was not found
  | 'notSignedIn' // Cloud: the app has no account session (no email to use)
  | 'notConnected' // GitHub: the app has no connected repo / readable token
  | 'noRepo' // GitHub: the CLI's (app-shared) settings have no githubSync to attach the copy to
  | 'mismatch' // GitHub: the CLI's settings point at another repo (see planGithubConnect)
  | 'invalidCode' // Cloud: wrong or expired code (GoTrue can't tell them apart)
  | 'rateLimited' // Cloud: 429
  | 'network'
  | 'failed'

/** Mirror in src/types/index.ts. `detail` = the CLI's own (English) error line, when there is one. */
export type CliConnectResult =
  | { ok: true; status: CliConnectStatus }
  | { ok: false; error: CliConnectError; detail?: string }

type Settings = Record<string, unknown>

interface GithubSyncLike {
  enabled?: boolean
  encryptedToken?: string
  owner?: string
  repo?: string
}

export interface CliGithubToken {
  owner: string
  /** base64 of the plaintext token — the CLI has no safeStorage. */
  token: string
}

// ── Paths ─────────────────────────────────────────────────────────────────────

/** Where the CLI keeps its settings.json — mirror of getSettingsDir() in cli/noteflow.js. */
export function cliSettingsPath(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string,
): string {
  const p = platform === 'win32' ? path.win32 : path.posix
  const dir = platform === 'win32'
    ? p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), 'noteflow')
    : p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), 'noteflow')
  return p.join(dir, 'settings.json')
}

/**
 * Is the CLI's settings.json a desktop app's settings.json too? On Windows it
 * always is: `%APPDATA%\noteflow` is the packaged app's userData (even when
 * THIS instance runs with another user-data-dir, as `npm run dev` does). On
 * macOS/Linux the CLI's `~/.config/noteflow` is never the app's
 * (`~/Library/Application Support/NoteFlow`, `~/.config/NoteFlow`).
 */
export function isCliSettingsShared(platform: NodeJS.Platform): boolean {
  return platform === 'win32'
}

// ── Tokens (mirror of the CLI) ────────────────────────────────────────────────

/** Mirror of decodeGithubToken (cli/noteflow.js): the plaintext of a base64 token, or null. */
export function decodeCliToken(b64: unknown): string | null {
  if (typeof b64 !== 'string' || !b64 || b64.startsWith('safe:')) return null
  const decoded = Buffer.from(b64, 'base64').toString('utf-8')
  return /^[\x20-\x7e]+$/.test(decoded) ? decoded : null
}

export function encodeCliToken(token: string): string {
  return Buffer.from(token, 'utf-8').toString('base64')
}

function asGithubSync(v: unknown): GithubSyncLike | null {
  return v && typeof v === 'object' ? (v as GithubSyncLike) : null
}

function asCliGithubToken(v: unknown): CliGithubToken | null {
  if (!v || typeof v !== 'object') return null
  const t = v as Partial<CliGithubToken>
  return typeof t.owner === 'string' && typeof t.token === 'string' ? { owner: t.owner, token: t.token } : null
}

/**
 * Mirror of resolveGithubToken (cli/noteflow.js): the token the CLI would sync
 * with, and where it comes from. `githubSync`'s own when readable, else the
 * `cliGithubToken` copy — only for the same GitHub owner.
 */
export function resolveCliGithubToken(settings: Settings): { token: string; source: 'githubSync' | 'cliGithubToken' } | null {
  const gh = asGithubSync(settings.githubSync)
  if (!gh || !gh.encryptedToken) return null
  const own = decodeCliToken(gh.encryptedToken)
  if (own) return { token: own, source: 'githubSync' }
  const copy = asCliGithubToken(settings.cliGithubToken)
  if (copy && copy.owner === gh.owner) {
    const token = decodeCliToken(copy.token)
    if (token) return { token, source: 'cliGithubToken' }
  }
  return null
}

// ── Status ────────────────────────────────────────────────────────────────────

/** What the CLI has, read from its parsed settings.json (`shared` = isCliSettingsShared). */
export function cliStatusFromSettings(settings: Settings, shared: boolean): Omit<CliConnectStatus, 'available'> {
  // Same rule as the CLI's getCliAccount(): a session = a refresh token. Only
  // its presence and the email are looked at.
  const a = settings.cliAccount && typeof settings.cliAccount === 'object'
    ? (settings.cliAccount as { email?: unknown; refreshToken?: unknown })
    : null
  const cloud = a && a.refreshToken
    ? { connected: true, ...(typeof a.email === 'string' && a.email ? { email: a.email } : {}) }
    : { connected: false }

  // Same gate as the CLI's push/pull: enabled + owner + repo + a readable token.
  const gh = asGithubSync(settings.githubSync)
  const resolved = gh && gh.enabled && gh.owner && gh.repo ? resolveCliGithubToken(settings) : null
  const github = resolved
    ? {
        connected: true,
        owner: gh!.owner,
        repo: gh!.repo,
        canDisconnect: resolved.source === 'cliGithubToken' || !shared,
      }
    : { connected: false, canDisconnect: false }
  return { cloud, github }
}

// ── GitHub connect / disconnect ───────────────────────────────────────────────

export interface GithubTarget {
  owner: string
  repo: string
  token: string
}

/**
 * The CLI settings after giving it the app's GitHub connection, or why not.
 *  - `githubSync` there is (or may be) a desktop app's — always on Windows, or
 *    whenever its token is unreadable by the CLI (an app's ciphertext): it is
 *    NEVER written. The token goes to `cliGithubToken`, which only works if
 *    that githubSync is the same repo (on a real Windows install it is the
 *    app's own, so it always matches). No githubSync there → 'noRepo',
 *    another repo → 'mismatch' (`npm run dev` on Windows, whose CLI file is
 *    the installed app's — not installed, on Cloud, or on another repo).
 *  - Otherwise (macOS/Linux): githubSync is written like `noteflow login`
 *    does — the same repo keeps its sync state (lastSync…), another starts
 *    clean (no lastSync: the CLI's pull would treat it as a reconciled point)
 *    — and a stale `cliGithubToken` is dropped.
 * `clearBases` = the CLI's cli-github-state.json belongs to another repo.
 */
export function planGithubConnect(
  settings: Settings,
  target: GithubTarget,
  shared: boolean,
): { ok: true; settings: Settings; clearBases: boolean } | { ok: false; error: 'noRepo' | 'mismatch' } {
  const gh = asGithubSync(settings.githubSync)
  const ghTokenIsForeign = !!gh?.encryptedToken && decodeCliToken(gh.encryptedToken) === null
  if (shared || ghTokenIsForeign) {
    if (!gh || !gh.owner || !gh.repo) return { ok: false, error: 'noRepo' }
    if (gh.owner !== target.owner || gh.repo !== target.repo) return { ok: false, error: 'mismatch' }
    const copy: CliGithubToken = { owner: target.owner, token: encodeCliToken(target.token) }
    return { ok: true, settings: { ...settings, cliGithubToken: copy }, clearBases: false }
  }
  const sameRepo = !!gh && gh.owner === target.owner && gh.repo === target.repo
  const next: Settings = {
    ...settings,
    githubSync: {
      ...(sameRepo ? gh : {}),
      enabled: true,
      encryptedToken: encodeCliToken(target.token),
      owner: target.owner,
      repo: target.repo,
    },
  }
  delete next.cliGithubToken
  return { ok: true, settings: next, clearBases: !sameRepo }
}

/**
 * The CLI settings after removing ONLY the CLI's GitHub access, or null when
 * there is nothing the app may remove. `cliGithubToken` always goes; the
 * CLI's `githubSync` only where it is the CLI's own file (not shared) — on
 * Windows it is the app's connection and stays untouched.
 */
export function planGithubDisconnect(
  settings: Settings,
  shared: boolean,
): { settings: Settings; clearBases: boolean } | null {
  const hasCopy = 'cliGithubToken' in settings
  const dropSync = !shared && !!asGithubSync(settings.githubSync)
  if (!hasCopy && !dropSync) return null
  const next: Settings = { ...settings }
  delete next.cliGithubToken
  if (dropSync) delete next.githubSync
  return { settings: next, clearBases: dropSync }
}

/**
 * The CLI settings without a `cliGithubToken` that no longer matches its
 * githubSync (gone, or another owner), or null when there is nothing to drop.
 * Run after the app disconnects GitHub: on Windows that deletes the shared
 * githubSync, and the CLI's copy of the token must not stay behind.
 */
export function dropOrphanCliGithubToken(settings: Settings): Settings | null {
  if (!('cliGithubToken' in settings)) return null
  const copy = asCliGithubToken(settings.cliGithubToken)
  const gh = asGithubSync(settings.githubSync)
  if (copy && gh && gh.encryptedToken && gh.owner === copy.owner) return null
  const next: Settings = { ...settings }
  delete next.cliGithubToken
  return next
}

// ── CLI child process ─────────────────────────────────────────────────────────

/**
 * Maps a failed `noteflow cloud login|logout` run (its stderr) to an error
 * code. The CLI prints `  Error: <message>`; `detail` is that message.
 */
export function classifyCliCloudError(stderr: string): { error: CliConnectError; detail?: string } {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const errLine = [...lines].reverse().find((l) => l.startsWith('Error:'))
  const detail = (errLine ? errLine.slice('Error:'.length).trim() : lines[lines.length - 1]) || undefined
  const text = detail ?? ''
  if (/invalid or has expired|is not a valid sign-in code/i.test(text)) return { error: 'invalidCode', detail }
  if (/too many attempts/i.test(text)) return { error: 'rateLimited', detail }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|timeout|aborted/i.test(text)) {
    return { error: 'network', detail }
  }
  return { error: 'failed', detail }
}
