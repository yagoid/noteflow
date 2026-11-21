// Live catch-up of note files changed on disk by ANOTHER process while the app
// runs (the bundled CLI `noteflow`: an agent's `task start` writing the 🤖
// marker in a section, `task report` writing agent.md…). The notes watcher
// (startNotesWatcher in main.ts) only reloads the renderers; without this, an
// edit made by a CLI with no sync of its own only went up at the next app start
// (the post-pull catch-up, flushPendingLocalChanges). Pure rules here; the
// debounce/IO lives in main.ts and the backend reads in cloudSync.ts /
// githubSync.ts (planLiveCatchUp). See sync.md § "Catch-up en vivo".

import { cliStatusFromSettings } from './cliConnectLogic'

/**
 * A backend's answer for one folder (planLiveCatchUp in cloudSync.ts /
 * githubSync.ts): upload these files (through the guarded schedulePush),
 * try again later (a pull is running), or nothing to do.
 */
export type LiveCatchUpPlan =
  | { kind: 'push'; files: Array<{ relPath: string; content: string }> }
  | { kind: 'retry' }
  | { kind: 'skip' }

/** How long the watcher waits after the last external change of a folder before catching it up. */
export const LIVE_CATCH_UP_DELAY_MS = 4_000

/**
 * How many times one folder's pass may be put off ('retry': a pull running,
 * the first pull not done yet, the app writing that folder) before its change
 * set is dropped — ~10 min at LIVE_CATCH_UP_DELAY_MS. A new external change of
 * the folder starts the count again.
 */
export const LIVE_CATCH_UP_MAX_RETRIES = 150

/** Whether a pass put off `retries` times (this one included) may still be re-armed. */
export function canRetryLiveCatchUp(retries: number): boolean {
  return retries <= LIVE_CATCH_UP_MAX_RETRIES
}

/**
 * GitHub's push gate for the live catch-up (Cloud needs none: its guarded
 * schedulePush JOURNALS while the gate is closed and the first pull's drain
 * uploads it). GitHub's gated schedulePush drops the push, and the catch-up of
 * the pull that opens the gate only takes a base-less file when note.md's
 * `updated` is newer than lastSync — an agent.md-only change would never go
 * up. So: first pull still running ('pending') → 'retry' (the pass waits for
 * it); 'failed' (offline, bad token… until the next pull, minutes away) →
 * 'skip' instead of polling; 'ok' → 'open'.
 */
export function githubLiveCatchUpGate(initialPullStatus: 'pending' | 'ok' | 'failed'): 'open' | 'retry' | 'skip' {
  if (initialPullStatus === 'ok') return 'open'
  return initialPullStatus === 'pending' ? 'retry' : 'skip'
}

/**
 * The note folder file an external change event points at, or null when the
 * event is not a candidate: `rel` is notes-dir-relative with forward slashes
 * ('<dir>' or '<dir>/<file>', as the watcher normalizes it). Only the `.md`
 * files directly inside a note folder count (note.md, sections, agent.md);
 * root files (metadata json, README…), the folder itself, temp files of
 * atomic writes and deeper paths are not.
 */
export function liveCatchUpTarget(rel: string): { dir: string; file: string } | null {
  const parts = rel.split('/')
  if (parts.length !== 2) return null
  const [dir, file] = parts
  // Note dirs never contain a dot (root files do).
  if (!dir || dir.includes('.') || dir.startsWith('.')) return null
  if (!file.endsWith('.md') || file.startsWith('.')) return null
  return { dir, file }
}

/**
 * Which files of ONE note folder the live catch-up uploads. Only the files the
 * watcher saw change outside the app (`changed`, notes-dir-relative paths) are
 * candidates — never the rest of the folder: a file this device did not touch
 * now may differ from its base for reasons the journal/pull already own (a
 * stale op, a pending merge), and a base-less untouched file could be an old
 * version of something newer remotely. Per candidate:
 *   - with a base (`matchesBase` true/false): goes up only when its content
 *     differs from it. An identical one is the echo of a pull, or the version
 *     this device already synced;
 *   - without a base (`matchesBase` null: a new section or a new agent.md the
 *     CLI just created, a note the CLI created): goes up, like the app's own
 *     save of a new file. NO folder gate (`updated` > lastSync, as the
 *     post-pull catch-up uses): writing agent.md does not touch note.md, and
 *     every push of this session moves lastSync — the gate would hold back
 *     exactly the files this exists for. The uploads stay conditional
 *     (Cloud: the server's updated_at rule without a base; GitHub: no PUT
 *     when the repo already holds the same blob).
 */
export function selectLiveCatchUpFiles(
  files: ReadonlyArray<{ relPath: string; content: string }>,
  changed: ReadonlySet<string>,
  matchesBase: (relPath: string, content: string) => boolean | null,
): string[] {
  const out: string[] = []
  for (const f of files) {
    if (!changed.has(f.relPath)) continue
    if (matchesBase(f.relPath, f.content) !== true) out.push(f.relPath)
  }
  return out
}

/** What the app knows of its own sync, to compare with the CLI's. */
export interface AppSyncIdentity {
  /** The app's NoteFlow account (Cloud), when known. */
  cloudUserId?: string | null
  /** The app's GitHub repo. */
  githubOwner?: string
  githubRepo?: string
}

/**
 * Does the CLI of this machine upload its own edits to `backend` (the app's
 * active one)? Then the app leaves them to it: two uploads of the same edit
 * race (the second goes against an older base — harmless, it reconciles as
 * identical, but it is a stale round trip or an extra request for nothing).
 * `cliSettings` = the CLI's parsed settings.json (on Windows the app's own
 * file; on macOS/Linux its `~/.config/noteflow/settings.json`); null = it
 * could not be read → false (catch up: better twice than never).
 *   - Cloud: the CLI routes to Cloud when `cliCloud.enabled` and it has a
 *     session (`cliAccount` with a refresh token) — cloudActive() in the CLI.
 *     A session of ANOTHER account than the app's does not count (its origin
 *     gate would hold its uploads back).
 *   - GitHub: the CLI routes to GitHub only when it is NOT on Cloud, and syncs
 *     there with `githubSync` enabled + owner/repo + a token it can read (its
 *     own base64 one, or the `cliGithubToken` copy) — the same repo as the app.
 */
export function cliSyncsBackend(
  cliSettings: Record<string, unknown> | null,
  backend: 'cloud' | 'github',
  app: AppSyncIdentity,
): boolean {
  if (!cliSettings) return false
  const cliCloud = asObject(cliSettings.cliCloud)
  const cliAccount = asObject(cliSettings.cliAccount)
  const cliOnCloud = cliCloud?.enabled === true && Boolean(cliAccount?.refreshToken)
  if (backend === 'cloud') {
    if (!cliOnCloud) return false
    const cliUserId = typeof cliAccount?.userId === 'string' && cliAccount.userId ? cliAccount.userId : null
    return !(cliUserId && app.cloudUserId && cliUserId !== app.cloudUserId)
  }
  if (cliOnCloud) return false
  const gh = cliStatusFromSettings(cliSettings, false).github
  if (!gh.connected || !gh.owner || !gh.repo) return false
  if (!app.githubOwner || !app.githubRepo) return false
  return gh.owner.toLowerCase() === app.githubOwner.toLowerCase() && gh.repo.toLowerCase() === app.githubRepo.toLowerCase()
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
