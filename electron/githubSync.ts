import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { writeSettingsFile } from './settingsFile'
import {
  NOTE_MD,
  NOTE_FORMAT_VERSION,
  FORMAT_MARKER_FILE,
  listNoteDirs,
  parseLegacyNoteRaw,
  serializeNoteFolder,
} from './noteFormat'
import {
  type SyncState,
  emptySyncState,
  parseSyncState,
  serializeSyncState,
  journalRecord,
  journalRecordIfAbsent,
  journalComplete,
  journalFail,
  journalMarkStale,
  journalMarkDirConflictCopied,
  journalCompleteDir,
  journalClearStale,
  resolveRetryAction,
  shouldPullSkipDir,
  shouldPullSkipFile,
  shouldDeletionRuleSkipDir,
  planRemoteDirDelete,
  planSectionRefresh,
  shouldRefreshSections,
  type TreeBlobRef,
  shouldRunDeletionRule,
  isGitHubEmptyRepoError,
  getCachedSha,
  setCachedSha,
  pruneShas,
  isNoteFilePath,
  planConditionalUpsert,
  planConditionalDelete,
  remoteDirChangesSinceBase,
  hasStaleOpUnder,
  planGithubDirConflict,
  dropCachedShasUnder,
  type ThreeWayShas,
} from './syncState'
import { type MirrorFile, gitBlobSha, planMirror, remoteHasContent } from './mirrorPlan'
import { listAnchorSectionFiles, planConflictCopy } from './cloudSyncLogic'
import { type ConflictCopiesNotice, type WrittenConflictCopy, appendConflictCopyNotice, writeConflictCopy } from './conflictCopy'
import { type SyncHistoryEntry, createSyncHistory } from './syncHistory'

// ── Constants ─────────────────────────────────────────────────────────────────

const README_CONTENT = `# Your notes are synced with GitHub

Your NoteFlow notes are automatically backed up to a **private GitHub repository** — only you can access them.

## Your privacy is protected

This repository is **private**. As long as it stays that way, nobody else can see or access your notes.

## How sync works

- Every time you create, edit, or delete a note in NoteFlow, changes are pushed here automatically.
- When you open NoteFlow, it pulls any remote changes so your notes stay in sync across devices.
- You can also trigger a manual sync from the GitHub panel in the app.

---

You are reading this note inside NoteFlow. It lives in your GitHub repository as \`README.md\` and will stay in sync like any other note.
`

// Root-level JSON files that sync alongside the note folders.
// folders.json / note-order.json were historically pushed but never pulled —
// fixed here as part of the v2 format work.
const METADATA_FILENAMES = ['groups.json', 'folders.json', 'section-colors.json', 'note-order.json', 'templates.json', 'ui-settings.json'] as const

/**
 * Cadence of the GitHub auto-sync loop (the timer itself lives in main.ts).
 * Exported so the titlebar status card can show the real interval
 * (see getActiveSyncStatus in syncProvider.ts).
 */
export const GITHUB_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitHubSyncSettings {
  enabled: boolean
  encryptedToken?: string  // base64-encoded encrypted PAT
  owner?: string
  repo?: string
  lastSync?: string
  remoteFormatMigratedAt?: string  // set once the remote repo is confirmed on format v2
  /**
   * One-shot: set when NoteFlow Cloud takes over (GitHub Sync pauses and its
   * `lastSync` freezes), consumed by the first successful pull — which skips the
   * local-deletion rule and re-uploads every note dir. Absent = false, so
   * existing settings.json files keep behaving exactly as before.
   */
  needsFullReconcile?: boolean
}

export type InitialPullStatus = 'pending' | 'ok' | 'failed'

export interface SyncStatus {
  enabled: boolean
  connected: boolean
  owner?: string
  repo?: string
  lastSync?: string
  error?: string
  initialPullStatus: InitialPullStatus
  /**
   * Conflict copies the pull made this session (in memory only), accumulated
   * until the user dismisses the notice (dismissConflictCopies) — shown in the
   * titlebar sync status card, same notice as NoteFlow Cloud.
   */
  conflictCopies?: ConflictCopiesNotice
}

// ── Settings helpers ──────────────────────────────────────────────────────────

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  writeSettingsFile(getSettingsPath(), data) // owner-only (0600) on POSIX
}

/**
 * Is NoteFlow Cloud the active sync provider? Read FLAT from settings.json —
 * importing cloudSync.ts here would be a cycle (it imports this module).
 *
 * Deliberately NOT using readSettings(): that one swallows every failure into
 * `{}`, which for this guard means "Cloud is off" → the pull would delete local
 * notes because settings.json happened to be unreadable. This one is
 * **fail-closed**: an unreadable/corrupt file answers "assume Cloud is on" (no
 * deletions). A missing `cloudSync` section — the normal GitHub-only user — is
 * NOT a failure and answers false, so the deletion rule keeps working for them.
 */
function isCloudSyncEnabledFailClosed(): boolean {
  let raw: string
  try {
    raw = fs.readFileSync(getSettingsPath(), 'utf-8')
  } catch {
    // Missing file: GitHub can't be connected either (the token lives there), so
    // pullNotes returns early — answering true here costs nothing.
    return true
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return (parsed.cloudSync as { enabled?: boolean } | undefined)?.enabled === true
  } catch {
    return true // corrupt JSON — can't prove Cloud is off, so don't delete
  }
}

// ── Token encryption ──────────────────────────────────────────────────────────

// Prefix to distinguish safeStorage-encrypted tokens from plain base64 fallback.
// Without this, if safeStorage availability changes between encryption and
// decryption (common on Linux where keyring availability can vary), the wrong
// method would be used, causing "Ciphertext does not appear to be encrypted".
const SAFE_STORAGE_PREFIX = 'safe:'

function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return SAFE_STORAGE_PREFIX + safeStorage.encryptString(token).toString('base64')
  }
  // Fallback: base64 only (less secure, but avoids blocking the feature)
  return Buffer.from(token).toString('base64')
}

function decryptToken(encrypted: string): string {
  if (encrypted.startsWith(SAFE_STORAGE_PREFIX)) {
    return safeStorage.decryptString(Buffer.from(encrypted.slice(SAFE_STORAGE_PREFIX.length), 'base64'))
  }
  // Legacy token (no prefix): could be safeStorage-encrypted or plain base64.
  // Try safeStorage first; if it fails, fall back to plain base64.
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      // Not a safeStorage ciphertext — treat as plain base64 fallback
    }
  }
  return Buffer.from(encrypted, 'base64').toString('utf-8')
}

const GITHUB_CLIENT_ID = 'Ov23liut9QOJ2pJFF0KR'

// ── GitHub REST API (raw https, no external deps) ─────────────────────────────

/** An error answer of the GitHub API: GitHub's own `message` plus the HTTP status. */
class GitHubApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/**
 * A conditional mutation was NOT sent: the remote file (or, for a deleteDir,
 * a file of the folder) changed since this device last reconciled it
 * (planConditionalUpsert / planConditionalDelete / remoteDirChangesSinceBase).
 * Not a failure to report: the callers flag the op `stale` (no syncError) and
 * ask for a pull, which applies the remote version and keeps the local one as
 * a conflict copy when it differs. A caller that does not know this type
 * treats it as a plain failure — the op stays journaled (fail-safe).
 */
export class RemoteChangedError extends Error {
  constructor(readonly relPath: string) {
    super(`"${relPath}" changed on GitHub since this device last synced it`)
    this.name = 'RemoteChangedError'
  }
}

async function githubRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: endpoint,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'NoteFlow-App',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          if (res.statusCode === 204) return resolve(null)
          try {
            const json = JSON.parse(raw)
            if (res.statusCode && res.statusCode >= 400) {
              reject(new GitHubApiError(json.message ?? `HTTP ${res.statusCode}`, res.statusCode))
            } else {
              resolve(json)
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: unparseable response`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('GitHub API request timed out'))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

// Auth requests go to github.com (not api.github.com) with form-encoded body
async function githubAuthPost(path: string, params: Record<string, string>): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(params).toString()
    const req = https.request(
      {
        hostname: 'github.com',
        path,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'NoteFlow-App',
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw) as Record<string, string>)
          } catch {
            reject(new Error(`Auth request failed: ${raw}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Auth request timed out')) })
    req.write(payload)
    req.end()
  })
}

// ── GitHub API operations ─────────────────────────────────────────────────────

async function validateToken(token: string): Promise<string> {
  const user = (await githubRequest(token, 'GET', '/user')) as { login: string }
  return user.login
}

async function ensureRepo(token: string, owner: string, repo: string): Promise<void> {
  try {
    await githubRequest(token, 'GET', `/repos/${owner}/${repo}`)
  } catch {
    await githubRequest(token, 'POST', '/user/repos', {
      name: repo,
      private: true,
      description: 'NoteFlow notes — auto-synced',
      auto_init: true,
    })
    // Brief pause for GitHub to initialize the repo
    await new Promise((r) => setTimeout(r, 1500))

    // Replace default README with informative content
    await upsertRemoteFile(token, owner, repo, 'README.md', README_CONTENT)
  }
}

// Remote paths are notes-dir-relative with forward slashes ('<dir>/<file>.md'
// for note files, bare filenames for root metadata). The Contents API accepts
// slash paths verbatim — but each SEGMENT must be URL-encoded individually
// (encoding the whole path would escape the separators).
function encodeRemotePath(relPath: string): string {
  return relPath.split('/').map(encodeURIComponent).join('/')
}

interface TreeBlob {
  path: string
  sha: string
}

// Cached per connection; reset on disconnect
let cachedDefaultBranch: string | null = null

async function getDefaultBranch(token: string, owner: string, repo: string): Promise<string> {
  if (cachedDefaultBranch) return cachedDefaultBranch
  const info = (await githubRequest(token, 'GET', `/repos/${owner}/${repo}`)) as { default_branch?: string }
  cachedDefaultBranch = info.default_branch || 'main'
  return cachedDefaultBranch
}

/**
 * Recursive listing of every blob in the repo via the Git Trees API — the
 * Contents API only lists one directory level, the tree call returns the whole
 * folder-per-note layout in a single request.
 *
 * Do NOT catch here — let network/API errors propagate to the caller (pullNotes).
 * Returning [] on error would make the deletion logic treat all local notes as
 * "remotely deleted" and wipe them from disk when there is no internet connection.
 * The ONLY exception is a repo with no commits yet (isGitHubEmptyRepoError): that
 * is a genuinely empty remote, answered as an empty, complete listing.
 */
async function listRemoteTree(token: string, owner: string, repo: string): Promise<TreeBlob[]> {
  return (await fetchRemoteTree(token, owner, repo)).blobs
}

/** listRemoteTree plus whether GitHub truncated the listing (pullNotes needs to know). */
async function fetchRemoteTree(
  token: string,
  owner: string,
  repo: string
): Promise<{ blobs: TreeBlob[]; truncated: boolean }> {
  const branch = await getDefaultBranch(token, owner, repo)
  let res: { tree?: Array<{ path: string; type: string; sha: string }>; truncated?: boolean }
  try {
    res = (await githubRequest(
      token,
      'GET',
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    )) as typeof res
  } catch (err: unknown) {
    // Existing EMPTY repo (409 "Git Repository is empty."): nothing remote yet —
    // the pull succeeds with no files and the catch-up uploads the local notes.
    if (err instanceof GitHubApiError && isGitHubEmptyRepoError(err.status, err.message)) {
      return { blobs: [], truncated: false }
    }
    throw err
  }
  const truncated = res?.truncated === true
  if (truncated) console.warn('[GitHubSync] tree listing truncated — repo unusually large')
  const blobs = (res?.tree ?? [])
    .filter((t) => t.type === 'blob')
    .map(({ path: p, sha }) => ({ path: p, sha }))
  return { blobs, truncated }
}

/** Git blob sha of a local file (notes-dir-relative), or null if it can't be read. */
function localBlobSha(notesDir: string, relPath: string): string | null {
  try {
    return gitBlobSha(fs.readFileSync(path.join(notesDir, relPath), 'utf-8'))
  } catch {
    return null
  }
}

/** Groups tree blobs into note directories: dir → set of .md filenames inside it. */
function groupRemoteNoteDirs(blobs: TreeBlob[]): Map<string, Set<string>> {
  const dirs = new Map<string, Set<string>>()
  for (const b of blobs) {
    const i = b.path.indexOf('/')
    if (i <= 0) continue
    const rest = b.path.slice(i + 1)
    if (rest.includes('/') || !rest.endsWith('.md')) continue // deeper nesting / non-md: not ours
    const dir = b.path.slice(0, i)
    let set = dirs.get(dir)
    if (!set) { set = new Set(); dirs.set(dir, set) }
    set.add(rest)
  }
  // Only dirs anchored by a note.md are notes
  for (const [dir, files] of dirs) {
    if (!files.has(NOTE_MD)) dirs.delete(dir)
  }
  return dirs
}

function rootFlatNoteBlobs(blobs: TreeBlob[]): TreeBlob[] {
  return blobs.filter((b) => !b.path.includes('/') && b.path.endsWith('.md') && b.path !== 'README.md')
}

async function getRemoteFile(
  token: string,
  owner: string,
  repo: string,
  relPath: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const file = (await githubRequest(
      token,
      'GET',
      `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`
    )) as { content: string; sha: string }
    const content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    return { content, sha: file.sha }
  } catch {
    return null
  }
}

// Serialized entry points — every push/delete goes through one of these two, so
// wrapping them here serializes the whole module's remote writes (see enqueueMutation).
// Being the single funnel, they are also where the activity history counts
// uploads: 1 per PUT/DELETE that actually reached GitHub (identical-content skips,
// superseded uploads and already-gone deletes count 0), and a failed mutation
// records ok=false. A conditional mutation held back because the remote moved
// (RemoteChangedError) is not a failure: it records nothing.
function upsertRemoteFile(
  token: string,
  owner: string,
  repo: string,
  relPath: string,
  content: string,
  opts: MutationOptions = {},
): Promise<UpsertOutcome> {
  return enqueueMutation(() => upsertRemoteFileNow(token, owner, repo, relPath, content, opts)).then(
    (outcome) => {
      if (outcome === 'written') syncHistory.record(1, true)
      return outcome
    },
    (err: unknown) => {
      if (!(err instanceof RemoteChangedError)) syncHistory.record(0, false)
      throw err
    },
  )
}

function removeRemoteFile(token: string, owner: string, repo: string, relPath: string, opts: MutationOptions = {}): Promise<void> {
  return enqueueMutation(() => removeRemoteFileNow(token, owner, repo, relPath, opts)).then(
    (removed) => { if (removed) syncHistory.record(1, true) },
    (err: unknown) => {
      if (!(err instanceof RemoteChangedError)) syncHistory.record(0, false)
      throw err
    },
  )
}

function isConflictError(msg: string): boolean {
  return msg.includes('is at') || msg.includes('conflict') || msg.includes('422') || msg.includes('409')
}

function isNotFoundError(msg: string): boolean {
  return msg.includes('Not Found') || msg.includes('404')
}

/**
 * Result of one upload: the PUT landed ('written'), the remote already held
 * exactly this content ('identical', no PUT), or the content is no longer what
 * is on disk ('superseded', no PUT — see the disk-still-current check).
 */
type UpsertOutcome = 'written' | 'identical' | 'superseded'

interface MutationOptions {
  /**
   * Unconditional mutation (mirrorToGitHub, and the blobs of a deleteDir that
   * already passed its folder-level check): GitHub is overwritten with the
   * local state no matter what it holds.
   */
  force?: boolean
  /**
   * The notes dir — enables the disk-still-current check of a conditional
   * upload. Without it (unknown notes dir) the check is skipped.
   */
  notesDir?: string
}

/**
 * Does this mutation go through the three-way check? Note files only, never
 * forced, and only while GitHub is the ACTIVE provider: with NoteFlow Cloud on
 * (read fail-closed — unreadable settings answer "Cloud on") GitHub is a
 * write-only mirror of Cloud's truth, and its uploads stay unconditional.
 * Evaluated when the queued mutation RUNS, not when it was scheduled.
 */
function isConditionalMutation(relPath: string, opts: MutationOptions): boolean {
  return opts.force !== true && isNoteFilePath(relPath) && !isCloudSyncEnabledFailClosed()
}

async function upsertRemoteFileNow(
  token: string,
  owner: string,
  repo: string,
  relPath: string,
  content: string,
  opts: MutationOptions = {},
  _retrying = false
): Promise<UpsertOutcome> {
  const conditional = isConditionalMutation(relPath, opts)

  // Disk-still-current check: a debounced/queued upload carries the content
  // captured when it was scheduled. If the file on disk is no longer exactly
  // that (or is gone), something newer replaced it — a later local save arms
  // its own push, a pull's resolution of the folder wrote the remote version —
  // so sending this one would at best be a wasted commit and at worst revert
  // the remote. No PUT, no journal change, no error.
  if (conditional && opts.notesDir) {
    let onDisk: string | null
    try {
      onDisk = fs.readFileSync(path.join(opts.notesDir, relPath), 'utf-8')
    } catch {
      onDisk = null
    }
    if (onDisk !== content) return 'superseded'
  }

  let sha: string | undefined
  try {
    const existing = (await githubRequest(
      token,
      'GET',
      `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`
    )) as { sha?: unknown }
    // Anything that isn't a plain file (a directory answers with an array) has no
    // usable sha — fall through and let the PUT decide, never skip on ambiguity.
    if (typeof existing.sha === 'string') sha = existing.sha
  } catch {
    // File doesn't exist yet — will be created. (Any GET failure lands here: a
    // PUT without `sha` can only CREATE — GitHub rejects it when the file
    // exists, and the retry below re-reads it.)
  }

  // ⚠️ A PUT only happens when the content actually differs. The Contents API's
  // `sha` IS the git blob sha, so the GET we already need for the concurrency
  // token also answers "would this change anything?" for free. GitHub accepts an
  // identical PUT and commits it anyway (a commit whose tree equals its parent's):
  // saving one note re-queues its whole dir, so a note with 8 sections produced 8
  // empty commits — ~24% of the user's repo history. Callers that count this as
  // `pushed` and clear the journal stay correct: the remote already holds exactly
  // this content, so the intent IS satisfied.
  const localSha = gitBlobSha(content)
  if (sha !== undefined && sha === localSha) {
    recordPushedBase(relPath, localSha)
    return 'identical'
  }

  // ⚠️ Three-way check (QA B3): the `sha` above is only the Contents API's
  // concurrency token — a PUT carrying it always lands, even over a version
  // another device uploaded after this device last saw the file. The base is
  // the blob this device last reconciled (sha cache); if the remote moved away
  // from it, the PUT is held back and the pull resolves the folder.
  if (conditional && planConditionalUpsert(getCachedSha(getState(), relPath), sha ?? null, localSha) === 'conflict') {
    throw new RemoteChangedError(relPath)
  }

  // note.md carries the title; section files fall back to '<dir>/<file>' label
  const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m)
  const label = titleMatch ? titleMatch[1].trim() : relPath.replace(/\.md$/, '')
  try {
    await githubRequest(
      token,
      'PUT',
      `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`,
      {
        message: sha ? `update: ${label}` : `add: ${label}`,
        content: Buffer.from(content).toString('base64'),
        ...(sha ? { sha } : {}),
      }
    )
  } catch (err: unknown) {
    // SHA conflict: another push updated the file between our GET and PUT.
    // Re-fetch the current SHA and retry once (re-evaluating the three-way check).
    const msg = err instanceof Error ? err.message : String(err)
    if (!_retrying && isConflictError(msg)) {
      return upsertRemoteFileNow(token, owner, repo, relPath, content, opts, true)
    }
    throw err
  }
  recordPushedBase(relPath, localSha)
  return 'written'
}

async function removeRemoteFileNow(
  token: string,
  owner: string,
  repo: string,
  relPath: string,
  opts: MutationOptions = {},
  _retrying = false
): Promise<boolean> {
  // Resolves true when a DELETE landed, false when the file was already gone.
  let sha: string
  try {
    const existing = (await githubRequest(
      token,
      'GET',
      `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`
    )) as { sha: string }
    sha = existing.sha
  } catch (err: unknown) {
    // GET failed: a real 404 means it's already gone (success); anything else is a
    // transient error we must surface so the delete isn't silently dropped.
    const msg = err instanceof Error ? err.message : String(err)
    if (isNotFoundError(msg)) {
      forgetRemoteBase(relPath)
      return false
    }
    throw err
  }
  // Three-way check (see upsertRemoteFileNow): deleting a file another device
  // changed since this device last saw it would erase that change everywhere.
  if (
    isConditionalMutation(relPath, opts) &&
    planConditionalDelete(getCachedSha(getState(), relPath), typeof sha === 'string' ? sha : null) === 'conflict'
  ) {
    throw new RemoteChangedError(relPath)
  }
  try {
    await githubRequest(
      token,
      'DELETE',
      `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`,
      { message: `delete: ${relPath}`, sha }
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // SHA moved under us (another commit landed first) — re-fetch and retry once.
    if (!_retrying && isConflictError(msg)) {
      return removeRemoteFileNow(token, owner, repo, relPath, opts, true)
    }
    if (isNotFoundError(msg)) {
      forgetRemoteBase(relPath)
      return false // already deleted — fine
    }
    throw err
  }
  forgetRemoteBase(relPath)
  return true
}

// ── Module state ──────────────────────────────────────────────────────────────

let syncSettings: GitHubSyncSettings | null = null
let syncError: string | undefined
let initialPullStatus: InitialPullStatus = 'pending'

// Fired every time initialPullStatus changes so main.ts can broadcast to renderers.
let statusListener: (() => void) | null = null

// Pending push timers per filename (debounce)
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()

// The notes dir (main.ts sets it at boot via setNotesDir; every entry point that
// receives it refreshes it). Needed by the debounced push's disk-still-current
// check — schedulePush itself only gets a relative path.
let notesDirPath: string | null = null

// Conflict copies made by this session's pulls (see ConflictCopiesNotice) and
// the localized label of their titles — injected by main.ts (the engine can't
// import main), English until then. Same notice as NoteFlow Cloud's.
let conflictCopies: ConflictCopiesNotice | undefined
let conflictCopyLabel: () => string = () => 'conflict copy'

// Fired when a conditional push/delete was held back because the remote moved
// (RemoteChangedError): main.ts runs a GitHub pull soon, which resolves it.
let remoteConflictListener: (() => void) | null = null

// ── Own remote mutations vs the pull's tree listing ───────────────────────────
// The pull lists the tree ONCE and then works for a while (GETs per folder).
// A push of this device landing in between updates the cached base to the
// content it uploaded, while the listing still shows the previous blob: if the
// pull then cached the listed (older) sha, or compared against it, the next
// push would see "remote != base" and report a spurious conflict. Every remote
// mutation of this device bumps a sequence number per path and per note
// folder; the pull (and deleteRemoteDirNow) captures the sequence before its
// listing and ignores what was mutated after it.
let mutationSeq = 0
const lastMutationByPath = new Map<string, number>()
const lastMutationByDir = new Map<string, number>()

function noteOwnRemoteMutation(relPath: string): void {
  mutationSeq++
  lastMutationByPath.set(relPath, mutationSeq)
  const slash = relPath.indexOf('/')
  if (slash > 0) lastMutationByDir.set(relPath.slice(0, slash), mutationSeq)
}

// Sequence numbers captured by listings still in use (pulls, deleteDirs). Map
// entries at or below the oldest of them (or below the current sequence when
// none is live) can never answer "mutated since" again — pruned on release.
const liveListings: number[] = []

function beginListing(): number {
  liveListings.push(mutationSeq)
  return mutationSeq
}

function endListing(seq: number): void {
  const i = liveListings.indexOf(seq)
  if (i >= 0) liveListings.splice(i, 1)
  const floor = liveListings.length > 0 ? Math.min(...liveListings) : mutationSeq
  for (const [k, v] of lastMutationByPath) if (v <= floor) lastMutationByPath.delete(k)
  for (const [k, v] of lastMutationByDir) if (v <= floor) lastMutationByDir.delete(k)
}

function mutatedSince(relPath: string, seq: number): boolean {
  return (lastMutationByPath.get(relPath) ?? 0) > seq
}

function dirMutatedSince(dir: string, seq: number): boolean {
  return (lastMutationByDir.get(dir) ?? 0) > seq
}

/**
 * After a PUT landed (or found the remote already identical): the remote holds
 * exactly `sha`, which becomes this device's base for the path — the next
 * conditional push compares against it (see planConditionalUpsert). Cached for
 * every path (metadata too: the pull then skips it without a GET).
 */
function recordPushedBase(relPath: string, sha: string): void {
  noteOwnRemoteMutation(relPath)
  if (setCachedSha(getState(), relPath, sha)) persistState()
}

/** After a DELETE landed (or found the file gone): there is no base any more. */
function forgetRemoteBase(relPath: string): void {
  noteOwnRemoteMutation(relPath)
  const state = getState()
  if (state.shas[relPath] !== undefined) {
    delete state.shas[relPath]
    persistState()
  }
}

/**
 * A conditional push/delete of `relPath` was held back (RemoteChangedError):
 * the op stays journaled flagged `stale` — still a local change the remote
 * lacks (the deletion guards keep seeing it), but the drain skips it — and a
 * pull is requested, whose conflict path applies the remote folder and keeps
 * the local version as a conflict copy. Not an error: no syncError.
 */
function holdBackForRemoteChange(relPath: string, op: 'upsert' | 'delete'): void {
  const state = getState()
  // IfAbsent: same reasoning as the push catch blocks — never replace a newer
  // intent recorded for the key while the mutation was in flight.
  journalRecordIfAbsent(state, relPath, op, new Date().toISOString())
  journalMarkStale(state, relPath, op)
  persistState()
  console.warn(`[GitHubSync] ${op} held back: the file changed on GitHub since the last sync — a pull will resolve it`)
  remoteConflictListener?.()
}

// Session-only activity history for the titlebar sync card (see syncHistory.ts).
const syncHistory = createSyncHistory()

/** This session's sync activity (oldest first) — exposed via getActiveSyncStatus. */
export function getSyncHistory(): SyncHistoryEntry[] {
  return syncHistory.list()
}

/** Files moved today (local day) this session — the sync card's "X files today". */
export function getSyncFilesToday(): number {
  return syncHistory.filesToday()
}

// ── Durable sync state (journal + reconciled-SHA cache) ───────────────────────
// Persisted in userData/sync-state.json — LOCAL device state, deliberately kept
// out of the notes dir so it never syncs. The journal records every pending
// remote mutation so a failed push/delete survives restarts and gets retried
// (retrySyncJournal); the SHA cache lets pullNotes skip unchanged dirs/files
// without a per-file GET. All transition logic is pure in syncState.ts.

let syncState: SyncState | null = null

function getSyncStatePath(): string {
  return path.join(app.getPath('userData'), 'sync-state.json')
}

function getState(): SyncState {
  if (!syncState) {
    let raw: string | null = null
    try {
      raw = fs.readFileSync(getSyncStatePath(), 'utf-8')
    } catch {
      raw = null // missing file — start empty
    }
    syncState = parseSyncState(raw) // corrupt content also degrades to empty
  }
  return syncState
}

function persistState(): void {
  try {
    fs.writeFileSync(getSyncStatePath(), serializeSyncState(getState()), 'utf-8')
  } catch (err) {
    // Never let state persistence block sync itself.
    console.error('[GitHubSync] failed to persist sync-state.json:', String(err))
  }
}

// ── Remote-mutation serialization ──────────────────────────────────────────────
// The GitHub Contents API commits one change at a time per branch: every PUT/DELETE
// moves the branch HEAD, so a concurrent write holding a now-stale file SHA gets a
// 409/422 conflict. Firing many writes at once (e.g. a batch delete, or saving a
// multi-section note) used to race and silently drop some — the next pull then
// "restored" the lost remote change locally. We funnel ALL remote mutations through
// this single promise chain so they run strictly one-at-a-time. `pendingMutations`
// also lets the auto-sync pull stand down while writes are still draining, closing
// the window where a pull could re-add a note whose remote delete hasn't landed yet.
let mutationChain: Promise<unknown> = Promise.resolve()
let pendingMutations = 0

function enqueueMutation<T>(task: () => Promise<T>): Promise<T> {
  pendingMutations++
  const run = mutationChain.then(task, task)
  // Keep the chain alive regardless of individual task outcomes.
  mutationChain = run.then(
    () => { pendingMutations-- },
    () => { pendingMutations-- },
  )
  return run
}

/** True while remote writes/deletes are queued or in flight (auto-sync defers). */
export function hasPendingRemoteMutations(): boolean {
  return pendingMutations > 0
}

// In-progress Device Flow
interface DeviceFlowState {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresAt: number
  interval: number
  pendingRepo: string
  pollTimer?: ReturnType<typeof setTimeout>
}
let deviceFlow: DeviceFlowState | null = null

// ── Public API ────────────────────────────────────────────────────────────────

export function loadSyncSettings(): GitHubSyncSettings {
  const settings = readSettings()
  syncSettings = (settings.githubSync as GitHubSyncSettings) ?? { enabled: false }
  return syncSettings
}

export function getSyncStatus(): SyncStatus {
  const s = syncSettings ?? loadSyncSettings()
  return {
    enabled: s.enabled,
    connected: !!(s.encryptedToken && s.owner && s.repo),
    owner: s.owner,
    repo: s.repo,
    lastSync: s.lastSync,
    error: syncError,
    initialPullStatus,
    conflictCopies,
  }
}

/** Boot hook (main.ts): the notes dir, for the debounced push's disk-still-current check. */
export function setNotesDir(notesDir: string): void {
  notesDirPath = notesDir
}

/** main.ts injects the localized "conflict copy" label (electron/i18n.ts), resolved at copy time. */
export function setConflictCopyLabel(label: () => string): void {
  conflictCopyLabel = label
}

/** The user dismissed the conflict-copies notice of the sync status card. */
export function dismissConflictCopies(): void {
  conflictCopies = undefined
}

/**
 * Called whenever a conditional push/delete was held back because the remote
 * file changed since this device last saw it — main.ts answers with a pull
 * (whose conflict path resolves the folder).
 */
export function onRemoteConflict(cb: () => void): void {
  remoteConflictListener = cb
}

/**
 * Marks GitHub Sync as needing a full reconcile on its next pull. Called when
 * NoteFlow Cloud takes over (`enableCloudSync`): from that moment GitHub is
 * paused and its `lastSync` stays frozen while notes keep being created/pulled
 * by Cloud, so `lastSync` no longer means "the remote knew everything on disk"
 * and the pull's local-deletion rule would wipe live notes. The next successful
 * pull skips that rule, re-uploads every note dir and clears the flag.
 *
 * Writes BOTH the in-memory cache and settings.json in one go: every push does
 * `settings.githubSync = syncSettings`, so a plain read/write from outside this
 * module would be clobbered by the next push.
 * No-op when there is no connected repo (nothing to reconcile).
 */
export function markNeedsFullReconcile(): void {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.encryptedToken || !s.owner || !s.repo) return
  if (s.needsFullReconcile) return
  syncSettings = { ...s, needsFullReconcile: true }
  const settings = readSettings()
  settings.githubSync = syncSettings
  writeSettings(settings)
}

export function setInitialPullStatus(status: InitialPullStatus): void {
  if (initialPullStatus === status) return
  initialPullStatus = status
  statusListener?.()
}

export function onStatusChanged(cb: () => void): void {
  statusListener = cb
}

// Starts Device Flow. Returns the user_code to display + verification URL to open.
// onComplete is called when auth succeeds or fails (from background polling).
export async function initiateDeviceFlow(
  repo: string,
  notesDir: string,
  onComplete: (result: { ok: boolean; owner?: string; repo?: string; error?: string }) => void
): Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }> {
  // Cancel any existing flow
  cancelDeviceFlow()

  try {
    const data = await githubAuthPost('/login/device/code', {
      client_id: GITHUB_CLIENT_ID,
      scope: 'repo',
    })

    if (data.error) {
      return { ok: false, error: data.error_description ?? data.error }
    }

    deviceFlow = {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresAt: Date.now() + parseInt(data.expires_in) * 1000,
      interval: parseInt(data.interval) || 5,
      pendingRepo: repo,
    }

    // Start polling in background
    schedulePoll(notesDir, onComplete)

    return {
      ok: true,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    return { ok: false, error }
  }
}

function schedulePoll(
  notesDir: string,
  onComplete: (result: { ok: boolean; owner?: string; repo?: string; error?: string }) => void
): void {
  if (!deviceFlow) return

  const intervalMs = deviceFlow.interval * 1000

  deviceFlow.pollTimer = setTimeout(async () => {
    if (!deviceFlow) return

    if (Date.now() > deviceFlow.expiresAt) {
      deviceFlow = null
      onComplete({ ok: false, error: 'Authorization code expired. Please try again.' })
      return
    }

    try {
      const data = await githubAuthPost('/login/oauth/access_token', {
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceFlow.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      })

      if (data.access_token) {
        // Auth complete — finalize connection
        const token = data.access_token
        const repo = deviceFlow.pendingRepo
        deviceFlow = null

        try {
          const owner = await validateToken(token)
          await ensureRepo(token, owner, repo)

          syncSettings = {
            enabled: true,
            encryptedToken: encryptToken(token),
            owner,
            repo,
          }
          syncError = undefined

          const settings = readSettings()
          settings.githubSync = syncSettings
          writeSettings(settings)

          await pullNotes(notesDir)
          onComplete({ ok: true, owner, repo })

          // Push local notes in the background; must not block the "connected"
          // signal to the UI (pushAllNotes does one network request per file).
          pushAllNotes(notesDir).catch((err) => {
            console.error('[GitHubSync] initial pushAll failed:', String(err))
          })
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err)
          syncError = error
          onComplete({ ok: false, error })
        }
      } else if (data.error === 'authorization_pending') {
        // Still waiting — keep polling
        schedulePoll(notesDir, onComplete)
      } else if (data.error === 'slow_down') {
        // Increase interval as requested
        deviceFlow.interval += 5
        schedulePoll(notesDir, onComplete)
      } else {
        // access_denied or other terminal error
        const error = data.error_description ?? data.error ?? 'Authorization failed'
        deviceFlow = null
        onComplete({ ok: false, error })
      }
    } catch (err: unknown) {
      // Network error — retry
      schedulePoll(notesDir, onComplete)
    }
  }, intervalMs)
}

export function cancelDeviceFlow(): void {
  if (deviceFlow?.pollTimer) clearTimeout(deviceFlow.pollTimer)
  deviceFlow = null
}

export function disconnectGitHub(): void {
  // Cancel any pending pushes
  pushTimers.forEach((t) => clearTimeout(t))
  pushTimers.clear()

  syncSettings = { enabled: false }
  syncError = undefined
  conflictCopies = undefined // the notice belongs to the repo we disconnect from
  cachedDefaultBranch = null
  // Drop the journal + SHA cache — they describe the repo we just disconnected from.
  syncState = emptySyncState()
  persistState()
  setInitialPullStatus('pending')

  const settings = readSettings()
  delete settings.githubSync
  writeSettings(settings)
}

/** Groups notes-dir-relative paths by their note folder ('<dir>/<file>' → '<dir>'). */
function groupPathsByDir(paths: Iterable<string>): Map<string, string[]> {
  const byDir = new Map<string, string[]>()
  for (const p of paths) {
    const slash = p.indexOf('/')
    if (slash <= 0) continue
    const dir = p.slice(0, slash)
    let list = byDir.get(dir)
    if (!list) { list = []; byDir.set(dir, list) }
    list.push(p)
  }
  return byDir
}

/**
 * Every file of a note folder — `knownPaths` (listed remotely / cached as a
 * base) plus the '.md' files on disk — with its three shas: cached base,
 * remote (`remoteShaOf`) and local (null = absent / unreadable).
 */
function dirThreeWayShas(
  notesDir: string,
  dir: string,
  remoteShaOf: (relPath: string) => string | null,
  knownPaths: Iterable<string>,
  state: SyncState,
): Array<ThreeWayShas & { path: string }> {
  const all = new Set<string>(knownPaths)
  try {
    for (const f of fs.readdirSync(path.join(notesDir, dir))) {
      if (f.endsWith('.md')) all.add(`${dir}/${f}`)
    }
  } catch { /* folder gone locally */ }
  return [...all].map((p) => ({
    path: p,
    base: getCachedSha(state, p),
    remote: remoteShaOf(p),
    local: localBlobSha(notesDir, p),
  }))
}

interface DirConflictResolution {
  /** 'deferred' = nothing was touched (mutations in flight, a GET failed, Cloud switched on): retried by the next pull. */
  status: 'resolved' | 'deferred'
  /** Local files written or removed to mirror the remote folder. */
  filesWritten: number
  /** The conflict copy written before overwriting, if one was needed. */
  copy?: WrittenConflictCopy
}

/**
 * Conflict path of the GitHub pull for the note folder '<dir>' (see
 * planGithubDirConflict): the REMOTE version wins the folder, and the local
 * version is kept as a conflict copy when it differs — the GitHub counterpart
 * of the Cloud pull's copies (same helpers, same notice). Also the path of a
 * FAST-FORWARD (only the remote moved — mirrored with no copy, whatever the
 * `updated:` timestamps say):
 *   0. Own remote mutations queued/in flight → deferred (they would land
 *      between the GETs and the writes).
 *   1. GET the remote anchor + every remote section — any failure → deferred.
 *   2. From here on SYNCHRONOUS (no save, timer or queued mutation can
 *      interleave): re-check (mutations, own pushes since the listing, Cloud
 *      switched on mid-pull → deferred), re-read the local folder and re-plan
 *      (neither conflict nor fast-forward any more → deferred); the copy
 *      candidates are the local files changed since their base (or with an
 *      unknown base), none only while EVERY pending upsert under the folder is
 *      already `conflictCopied`; planConflictCopy against the remote contents (anchor
 *      without `updated:`). If needed: write the copy (throws → the caller's
 *      per-folder catch, the folder is left untouched), flag the ops
 *      `conflictCopied`, upload the copy through the normal path
 *      (schedulePushUnguarded — the first pull of a boot runs with the push
 *      gate closed) and record the notice.
 *   3. Write the remote folder wholesale (anchor first), delete the local
 *      sections the remote lacks, cache every remote blob as the new base.
 *   4. Settle: cancel the push timers under the folder and complete EVERY op
 *      under it (upserts/deletes, stale or not).
 */
async function resolveRemoteDirConflict(
  token: string,
  owner: string,
  repo: string,
  notesDir: string,
  dir: string,
  remoteFiles: ReadonlySet<string>,
  treeSeq: number,
  needsFullReconcile: boolean,
): Promise<DirConflictResolution> {
  const deferred: DirConflictResolution = { status: 'deferred', filesWritten: 0 }
  if (hasPendingRemoteMutations()) return deferred

  const remote = new Map<string, { content: string; sha: string }>()
  for (const f of remoteFiles) {
    const rel = `${dir}/${f}`
    // null = the GET failed (getRemoteFile swallows it) or the file vanished
    // since the listing — either way this pass can't mirror the folder.
    const file = await getRemoteFile(token, owner, repo, rel)
    if (!file) return deferred
    remote.set(rel, file)
  }

  // ── Synchronous from here on. ──
  if (
    hasPendingRemoteMutations() ||
    dirMutatedSince(dir, treeSeq) ||
    !shouldRefreshSections(needsFullReconcile, isCloudSyncEnabledFailClosed())
  ) {
    return deferred
  }
  const state = getState()
  const prefix = `${dir}/`
  const cachedUnder = Object.keys(state.shas).filter((p) => p.startsWith(prefix))
  const paths = dirThreeWayShas(notesDir, dir, (rel) => remote.get(rel)?.sha ?? null, [...remote.keys(), ...cachedUnder], state)

  // Re-plan on the fresh local read: if the folder is neither a conflict nor a
  // fast-forward any more (e.g. local now equals remote), nothing to apply.
  const plan = planGithubDirConflict(state, dir, paths)
  if (!plan.conflict && !plan.fastForward) return deferred

  let copy: WrittenConflictCopy | undefined
  const candidates = plan.copyCandidates
  if (candidates.length > 0) {
    const local: Record<string, string | null> = {}
    for (const rel of candidates) {
      try {
        local[rel] = fs.readFileSync(path.join(notesDir, rel), 'utf-8')
      } catch {
        local[rel] = null
      }
    }
    const server: Record<string, string> = {}
    for (const [rel, file] of remote) server[rel] = file.content
    if (planConflictCopy(candidates, local, server)) {
      const now = new Date()
      copy = writeConflictCopy(notesDir, dir, conflictCopyLabel(), now)
      if (journalMarkDirConflictCopied(state, dir)) persistState()
      for (const [name, content] of Object.entries(copy.files)) {
        schedulePushUnguarded(`${copy.dir}/${name}`, content)
      }
      conflictCopies = appendConflictCopyNotice(conflictCopies, copy.title, now.toISOString())
    }
  }

  // Mirror the remote folder (note.md first, like every folder write).
  const localDirPath = path.join(notesDir, dir)
  fs.mkdirSync(localDirPath, { recursive: true })
  const anchorRel = `${dir}/${NOTE_MD}`
  const order = [...remote.keys()].sort((a, b) => (a === anchorRel ? -1 : b === anchorRel ? 1 : 0))
  let filesWritten = 0
  for (const rel of order) {
    const file = remote.get(rel)!
    const target = path.join(notesDir, rel)
    let current: string | null = null
    try {
      current = fs.readFileSync(target, 'utf-8')
    } catch { /* absent locally */ }
    if (current !== file.content) {
      fs.writeFileSync(target, file.content, 'utf-8')
      filesWritten++
    }
  }
  for (const lf of fs.readdirSync(localDirPath)) {
    if (!lf.endsWith('.md') || lf === NOTE_MD || remote.has(`${dir}/${lf}`)) continue
    try {
      fs.unlinkSync(path.join(localDirPath, lf))
      filesWritten++
    } catch { /* ignore */ }
  }

  // The remote blobs are now this device's bases; sections the remote lacks have none.
  for (const [rel, file] of remote) setCachedSha(state, rel, file.sha)
  for (const rel of cachedUnder) if (!remote.has(rel)) delete state.shas[rel]

  // Settle: nothing pending under the folder may land after this.
  for (const key of [...pushTimers.keys()]) {
    if (key.startsWith(prefix)) {
      clearTimeout(pushTimers.get(key)!)
      pushTimers.delete(key)
    }
  }
  journalCompleteDir(state, dir)
  persistState()
  return { status: 'resolved', filesWritten, copy }
}

export async function pullNotes(notesDir: string): Promise<{
  pulled: number
  deleted: number
  errors: string[]
  updatedFiles: string[]
  hadDeletions: boolean
  hadMetadataChanges: boolean
  incomplete?: boolean
}> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
    return { pulled: 0, deleted: 0, errors: [], updatedFiles: [], hadDeletions: false, hadMetadataChanges: false }
  }

  let token: string
  try {
    token = decryptToken(s.encryptedToken)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const userFacingError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`
    syncError = userFacingError
    if (initialPullStatus === 'pending') setInitialPullStatus('failed')
    syncHistory.record(0, false)
    return {
      pulled: 0,
      deleted: 0,
      errors: [userFacingError],
      updatedFiles: [],
      hadDeletions: false,
      hadMetadataChanges: false,
    }
  }
  let pulled = 0
  let deleted = 0
  // Files this pull changed on disk (written or removed) — for the activity history.
  let filesDown = 0
  const errors: string[] = []
  const updatedFiles: string[] = []
  let hadMetadataChanges = false
  // Set when this pass silently skipped something it should have reconciled (see
  // SyncPullResult.incomplete). Deliberately NOT an `errors` entry: those are shown
  // verbatim in Settings → Sync, and a transient GET failure isn't user-actionable.
  let incomplete = false
  const previousLastSync = s.lastSync
  // Read the one-shot reconcile flag BEFORE the pull touches the settings: this
  // pull must not trust `lastSync` (GitHub was paused while Cloud was on).
  const needsFullReconcile = s.needsFullReconcile === true
  const state = getState()
  let stateChanged = false
  notesDirPath = notesDir
  // Own pushes that land after the tree listing below must not be compared with
  // (nor cached as) the listed blobs, which are older — see noteOwnRemoteMutation.
  const treeSeq = beginListing()
  const cachePulled = (relPath: string, sha: string): void => {
    if (mutatedSince(relPath, treeSeq)) return
    if (setCachedSha(state, relPath, sha)) stateChanged = true
  }
  let conflictCopiesMade = 0

  try {
    const { blobs, truncated } = await fetchRemoteTree(token, s.owner, s.repo)
    // A truncated listing may be missing note folders entirely.
    if (truncated) incomplete = true
    const treeShaByPath = new Map(blobs.map((b) => [b.path, b.sha]))
    const remoteNoteDirs = groupRemoteNoteDirs(blobs)
    const remoteHasMarker = blobs.some((b) => b.path === FORMAT_MARKER_FILE)
    const remoteHasFlatNotes = rootFlatNoteBlobs(blobs).length > 0
    // Transition guard: while the remote is still (partly) on format v1 — flat
    // .md files present and no v2 marker — the pull is ADDITIVE ONLY. The
    // deletion rule below would otherwise wipe freshly-migrated local folders
    // that the remote simply doesn't have yet.
    const remoteIsV2 = remoteHasMarker && !remoteHasFlatNotes

    // Same-version section refresh (planSectionRefresh) only while GitHub is NOT
    // a stale mirror (Cloud on / full reconcile pending) — shouldRefreshSections.
    // Re-checked right before any refresh write, as late as possible.
    const sectionRefreshAllowed = shouldRefreshSections(needsFullReconcile, isCloudSyncEnabledFailClosed())
    // Conflict path (three-way check per file — planGithubDirConflict): only
    // while GitHub is the ACTIVE provider, i.e. exactly when the section refresh
    // is allowed. As a stale mirror of NoteFlow Cloud (or with a full reconcile
    // pending) the pull keeps its historical behaviour — no conflict copies.
    const conflictsAllowed = sectionRefreshAllowed
    const cachedPathsByDir = conflictsAllowed ? groupPathsByDir(Object.keys(state.shas)) : new Map<string, string[]>()
    // Caches a remote blob the historical rule did NOT apply (local kept).
    // While GitHub is active, never over a known base when the local file is
    // not that blob: it would mark an unapplied remote change as reconciled and
    // the next local edit would PUT over it. Left uncached, that edit's push is
    // held back and the pull resolves the folder.
    const cacheKeptLocal = (relPath: string, sha: string): void => {
      const base = getCachedSha(state, relPath)
      if (conflictsAllowed && base !== undefined && base !== sha && localBlobSha(notesDir, relPath) !== sha) return
      cachePulled(relPath, sha)
    }

    // Pull each remote note directory. The note dir is the unit of conflict
    // resolution: note.md's `updated:` decides, and a newer remote wins
    // WHOLESALE (all its section files mirrored, stale local sections removed).
    for (const [dir, remoteFilesInDir] of remoteNoteDirs) {
      try {
        // Journal guard: a pending remote deleteDir means this dir was deleted
        // locally but the remote delete hasn't landed — pulling it would
        // resurrect the note.
        if (shouldPullSkipDir(state, dir)) continue

        const anchorRel = `${dir}/${NOTE_MD}`
        const anchorTreeSha = treeShaByPath.get(anchorRel)
        const localDirPath = path.join(notesDir, dir)
        const localAnchorPath = path.join(localDirPath, NOTE_MD)
        const sectionBlobs: TreeBlobRef[] = []
        for (const f of remoteFilesInDir) {
          if (f === NOTE_MD) continue
          const sha = treeShaByPath.get(`${dir}/${f}`)
          if (sha) sectionBlobs.push({ path: `${dir}/${f}`, sha })
        }
        // Section files the LOCAL anchor lists (read lazily: only when a section
        // blob is not cached yet) — unlisted remote sections are never refreshed.
        let listedLocally: Set<string> | null = null
        const isListedLocally = (rel: string): boolean => {
          if (!listedLocally) {
            try {
              const files = listAnchorSectionFiles(fs.readFileSync(localAnchorPath, 'utf-8'))
              listedLocally = new Set(files.map((f) => `${dir}/${f}`))
            } catch {
              listedLocally = new Set()
            }
          }
          return listedLocally.has(rel)
        }
        // Section blobs not reconciled yet (planSectionRefresh). The ones the
        // local file already matches are cached right away, without a request.
        const planSections = (): TreeBlobRef[] => {
          const plan = planSectionRefresh(state, sectionBlobs, (rel) => localBlobSha(notesDir, rel), {
            refreshAllowed: sectionRefreshAllowed,
            isListedLocally,
          })
          for (const blob of plan.adopt) cachePulled(blob.path, blob.sha)
          return plan.changed
        }

        // ⚠️ Conflict path (QA B3): some file of this folder changed BOTH here
        // and on GitHub since this device last reconciled it (three-way check
        // against the cached base), or a push/delete of it was already held
        // back (stale op). The historical rule below ("local strictly newer →
        // keep local") would let the next push overwrite the remote edit.
        // Evaluated only when a listed blob differs from its cached base (or a
        // cached one vanished) or a stale op exists — no disk reads in the
        // steady state — and only for a folder that still exists locally (no
        // local version = nothing to keep, the historical flow handles it).
        // Skipped for a folder this device mutated after the listing: its tree
        // shas are older than its cached bases (the push side guards it).
        if (conflictsAllowed && anchorTreeSha && !dirMutatedSince(dir, treeSeq)) {
          const cachedPaths = cachedPathsByDir.get(dir) ?? []
          const treeMoved =
            getCachedSha(state, anchorRel) !== anchorTreeSha ||
            sectionBlobs.some((b) => getCachedSha(state, b.path) !== b.sha) ||
            cachedPaths.some((p) => !treeShaByPath.has(p))
          if ((treeMoved || hasStaleOpUnder(state, dir)) && fs.existsSync(localAnchorPath)) {
            const paths = dirThreeWayShas(
              notesDir,
              dir,
              (rel) => treeShaByPath.get(rel) ?? null,
              [anchorRel, ...sectionBlobs.map((b) => b.path), ...cachedPaths],
              state,
            )
            // A file whose local content already IS the listed blob is
            // reconciled whatever the cache said (e.g. an own push of an older
            // build that never cached it): adopt it as the base, no request.
            for (const p of paths) {
              if (p.remote !== null && p.local === p.remote && p.base !== p.remote) cachePulled(p.path, p.remote)
            }
            // Conflict, or FAST-FORWARD (only the remote moved, every local file
            // still at its base): both mirror the remote folder through the
            // same path — the fast-forward without a copy and whatever the
            // `updated:` timestamps say (clock skew, a web-UI edit that kept
            // `updated` would otherwise keep local, cache the remote sha and let
            // the next local edit PUT over the remote change).
            const dirPlan = planGithubDirConflict(state, dir, paths)
            if (dirPlan.conflict || dirPlan.fastForward) {
              const res = await resolveRemoteDirConflict(
                token, s.owner, s.repo, notesDir, dir, remoteFilesInDir, treeSeq, needsFullReconcile,
              )
              if (res.status === 'deferred') {
                // In-flight mutations or a failed GET: nothing was touched;
                // the next pull retries (the stale ops keep the drain off it).
                incomplete = true
                continue
              }
              filesDown += res.filesWritten
              if (res.copy) {
                conflictCopiesMade++
                updatedFiles.push(res.copy.dirPath) // renderer + AI index pick the new note up
                filesDown += Object.keys(res.copy.files).length
                pulled++
              }
              updatedFiles.push(localDirPath)
              pulled++
              continue
            }
          }
        }

        // SHA cache: if the anchor blob is exactly the one we already
        // reconciled, the note didn't change remotely — skip the dir without
        // any GET... unless a SECTION blob changed: the push uploads note.md
        // and its sections in separate commits, so a pull in between applied
        // the new anchor with the old sections and cached the anchor sha.
        // Checking the section shas too costs no request in the steady state.
        let changedSections: TreeBlobRef[] | null = null
        if (anchorTreeSha && getCachedSha(state, anchorRel) === anchorTreeSha) {
          // Gone locally: keep the historical skip (never resurrect it from here).
          if (!fs.existsSync(localAnchorPath)) continue
          changedSections = planSections()
          if (changedSections.length === 0) continue
        }

        const remoteAnchor = await getRemoteFile(token, s.owner, s.repo, anchorRel)
        if (!remoteAnchor) {
          // The anchor IS in the tree, so null means the GET failed (getRemoteFile
          // swallows network/403/5xx) — this folder was not reconciled.
          incomplete = true
          continue
        }

        const localExists = fs.existsSync(localAnchorPath)
        const localUpdatedTs = localExists
          ? parseUpdatedTimestamp(extractUpdatedTimestamp(fs.readFileSync(localAnchorPath, 'utf-8')))
          : null
        const remoteUpdatedTs = parseUpdatedTimestamp(extractUpdatedTimestamp(remoteAnchor.content))
        const remoteNotNewer =
          localUpdatedTs !== null && remoteUpdatedTs !== null && remoteUpdatedTs <= localUpdatedTs

        // Anchor not applied: local is newer or equal (or the anchor was already
        // reconciled). Decision made, so remember this remote blob as reconciled
        // (skip it without a GET until it changes remotely again).
        if (changedSections !== null || (localExists && remoteNotNewer)) {
          if (anchorTreeSha) cacheKeptLocal(anchorRel, anchorTreeSha)
          changedSections ??= planSections()
          if (changedSections.length === 0) continue
          if (localUpdatedTs !== null && localUpdatedTs === remoteUpdatedTs) {
            // Late re-check: Cloud switched on mid-pull makes GitHub a stale
            // mirror again (shouldRefreshSections) — historical skip, no cache.
            if (!shouldRefreshSections(needsFullReconcile, isCloudSyncEnabledFailClosed())) continue
            // SAME version on both sides (same `updated`): download only the
            // sections whose blob changed — the loose-section rule of the Cloud
            // pull (shouldApplyRemoteSection: section of this version >= local).
            // Pending local upserts/deletes were already left out by the plan.
            let wrote = 0
            for (const blob of changedSections) {
              const remoteSection = await getRemoteFile(token, s.owner, s.repo, blob.path)
              if (!remoteSection) {
                incomplete = true // not cached → retried on the next pull
                continue
              }
              fs.writeFileSync(path.join(notesDir, blob.path), remoteSection.content, 'utf-8')
              filesDown++
              wrote++
              cachePulled(blob.path, remoteSection.sha)
            }
            if (wrote > 0) {
              updatedFiles.push(localDirPath)
              pulled++
            }
          } else if (localUpdatedTs !== null && remoteUpdatedTs !== null && localUpdatedTs > remoteUpdatedTs) {
            // Local strictly newer: respected (LWW per folder) — but NOT cached.
            // Once this device's push lands both anchors are the same version
            // again and the branch above brings in the sections it didn't touch
            // (the push only uploads changed sections, so the remote keeps them).
            // Costs one anchor GET per pull until then; never in a converged state.
          } else {
            // Unknown timestamps, or a reconciled remote anchor that is newer
            // than the local one: can't reason about it — keep the historical
            // skip and remember the decision.
            for (const blob of changedSections) cacheKeptLocal(blob.path, blob.sha)
          }
          continue
        }

        fs.mkdirSync(localDirPath, { recursive: true })
        fs.writeFileSync(localAnchorPath, remoteAnchor.content, 'utf-8')
        filesDown++
        for (const f of remoteFilesInDir) {
          if (f === NOTE_MD) continue
          // Journal guard: don't resurrect a section whose remote delete is pending.
          if (shouldPullSkipFile(state, `${dir}/${f}`)) continue
          const remoteSection = await getRemoteFile(token, s.owner, s.repo, `${dir}/${f}`)
          if (remoteSection) {
            fs.writeFileSync(path.join(localDirPath, f), remoteSection.content, 'utf-8')
            filesDown++
            // Reconciled section blob (see planSectionRefresh).
            cachePulled(`${dir}/${f}`, remoteSection.sha)
          }
        }
        // Sections removed remotely → remove their local files
        try {
          for (const lf of fs.readdirSync(localDirPath)) {
            if (!lf.endsWith('.md') || lf === NOTE_MD) continue
            if (!remoteFilesInDir.has(lf)) {
              try { fs.unlinkSync(path.join(localDirPath, lf)); filesDown++ } catch { /* ignore */ }
            }
          }
        } catch { /* ignore */ }

        if (anchorTreeSha) cachePulled(anchorRel, anchorTreeSha)
        updatedFiles.push(localDirPath)
        pulled++
      } catch (err) {
        errors.push(`${dir}: ${String(err)}`)
      }
    }

    // A stale op of a folder that no longer exists on GitHub at all (complete
    // listing) has nothing left to conflict with: clear the flag so the drain
    // runs it again — an upsert re-creates the note (a local edit beats a
    // remote deletion), a delete finds the file gone. Otherwise it would sit in
    // the journal forever: the drain skips stale ops and no pull resolves a
    // folder the remote lacks.
    if (conflictsAllowed && !truncated) {
      for (const [key, entry] of Object.entries(state.ops)) {
        if (!entry.stale) continue
        const slash = key.indexOf('/')
        if (slash > 0 && remoteNoteDirs.has(key.slice(0, slash))) continue
        if (journalClearStale(state, key)) stateChanged = true
      }
    }

    // Delete local note dirs that no longer exist on remote.
    // Safety rule: only delete if the local note.md's `updated` timestamp is
    // older than the last sync — meaning it was known to the remote at some
    // point and was since deleted. Dirs newer than lastSync were created
    // locally after the last sync and haven't been pushed yet — keep them.
    // The rule is skipped entirely while the remote is pre-v2, a full reconcile
    // is pending, NoteFlow Cloud is the active provider, or the tree listing came
    // back truncated (a dir missing from it may still exist remotely) — see
    // shouldRunDeletionRule in syncState.ts.
    // `cloudEnabled` is read fail-closed and as late as possible, so Cloud being
    // switched on mid-pull still disarms the rule.
    const cloudEnabled = isCloudSyncEnabledFailClosed()
    const lastSyncTime = s.lastSync ? new Date(s.lastSync).getTime() : null
    const runDeletionRule = shouldRunDeletionRule(lastSyncTime, needsFullReconcile, cloudEnabled, remoteIsV2, truncated)
    if (runDeletionRule && lastSyncTime !== null) { // null already excluded above; repeated for narrowing
      for (const dir of listNoteDirs(notesDir)) {
        if (remoteNoteDirs.has(dir)) continue
        // Journal guard: a pending upsert under this dir means its push never
        // landed — the remote absence doesn't mean "deleted remotely", and
        // removing the dir locally would lose the unpushed edit.
        if (shouldDeletionRuleSkipDir(state, dir)) continue
        const localDirPath = path.join(notesDir, dir)
        try {
          const localContent = fs.readFileSync(path.join(localDirPath, NOTE_MD), 'utf-8')
          const localUpdatedTime = parseUpdatedTimestamp(extractUpdatedTimestamp(localContent))
          if (localUpdatedTime === null) continue // can't determine age — skip to be safe
          if (localUpdatedTime > lastSyncTime) continue // created locally after last sync, not yet pushed
          fs.rmSync(localDirPath, { recursive: true, force: true })
          deleted++
          filesDown++
        } catch { /* ignore */ }
      }
    }

    // Pull optional metadata JSON files used by non-note features.
    for (const metadataFilename of METADATA_FILENAMES) {
      try {
        // The tree already tells us whether the file exists and its blob SHA —
        // only GET when it differs from the last reconciled one.
        const metadataTreeSha = treeShaByPath.get(metadataFilename)
        if (!metadataTreeSha) continue // not on remote
        if (getCachedSha(state, metadataFilename) === metadataTreeSha) continue

        const remoteMetadata = await getRemoteFile(token, s.owner, s.repo, metadataFilename)
        if (!remoteMetadata) continue

        const metadataPath = path.join(notesDir, metadataFilename)
        const localContent = fs.existsSync(metadataPath)
          ? fs.readFileSync(metadataPath, 'utf-8')
          : null

        if (localContent !== remoteMetadata.content) {
          fs.writeFileSync(metadataPath, remoteMetadata.content, 'utf-8')
          hadMetadataChanges = true
          filesDown++
        }
        cachePulled(metadataFilename, metadataTreeSha)
      } catch {
        // Optional metadata file is missing or unreadable remotely.
      }
    }

    // Keep the SHA cache bounded: drop entries for blobs gone from the tree —
    // except the paths this device itself pushed after the listing (their
    // cached base is newer than the listing, not gone).
    const keepShas = new Set(blobs.map((b) => b.path))
    for (const [p, seq] of lastMutationByPath) if (seq > treeSeq) keepShas.add(p)
    if (pruneShas(state, keepShas)) stateChanged = true
    if (conflictCopiesMade > 0) {
      console.log(`[GitHubSync] ${conflictCopiesMade} local version(s) kept as conflict copies`)
    }

    // Rebase on the CURRENT in-memory settings, not on the snapshot taken before
    // the network round-trips: anything written meanwhile (remoteFormatMigratedAt,
    // markNeedsFullReconcile) must not be clobbered — same pattern as
    // persistMigratedAt. The one-shot reconcile flag is consumed on the success
    // path ONLY (a failed pull must keep it, the deletion rule is still unsafe),
    // and only if THIS pull honored it: set mid-pull ⇒ it survives to the next.
    const latest = syncSettings ?? s
    syncSettings = {
      ...latest,
      lastSync: new Date().toISOString(),
      needsFullReconcile: needsFullReconcile ? false : latest.needsFullReconcile === true,
    }
    const settings = readSettings()
    settings.githubSync = syncSettings
    writeSettings(settings)
    syncError = undefined
    const wasNotOk = initialPullStatus !== 'ok'
    if (wasNotOk) setInitialPullStatus('ok')
    // Upload catch-up, in a single call whichever conditions apply:
    // - full reconcile (first pull after Cloud took over): re-queues EVERY note
    //   dir (previousLastSync undefined) to put the stale repo back up to date.
    // - Cloud still enabled: GitHub gets no pushes while paused, so each pull
    //   uploads what landed via Cloud since the previous lastSync — that keeps
    //   lastSync trustworthy again for when Cloud is switched off.
    // - gate opening (pending/failed → ok): the historical case.
    // The tree fetched above is handed over so the catch-up can drop the files
    // the remote already holds byte-for-byte, without a single extra request.
    if (wasNotOk || needsFullReconcile || cloudEnabled) {
      const flushed = flushPendingLocalChanges(
        notesDir,
        needsFullReconcile ? undefined : previousLastSync,
        treeShaByPath,
      )
      if (flushed) stateChanged = true
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    syncError = msg
    errors.push(msg)
    if (initialPullStatus === 'pending') setInitialPullStatus('failed')
  }

  endListing(treeSeq)
  if (stateChanged) persistState()
  // Uploads (incl. the catch-up queued above) are counted as they land, by the
  // mutation wrappers; this entry is the download side of the pull.
  syncHistory.record(filesDown, errors.length === 0)

  return {
    pulled,
    deleted,
    errors,
    updatedFiles,
    hadDeletions: deleted > 0,
    hadMetadataChanges,
    ...(incomplete ? { incomplete: true } : {}),
  }
}

/**
 * Every notes-dir-relative file that participates in sync: one entry per '.md'
 * inside each note folder plus the root metadata JSONs that exist on disk.
 * Throws if the notes dir can't be walked — callers decide what that means.
 */
function listLocalSyncPaths(notesDir: string): string[] {
  const relPaths: string[] = []
  for (const dir of listNoteDirs(notesDir)) {
    for (const f of fs.readdirSync(path.join(notesDir, dir))) {
      if (f.endsWith('.md')) relPaths.push(`${dir}/${f}`)
    }
  }
  for (const filename of METADATA_FILENAMES) {
    if (fs.existsSync(path.join(notesDir, filename))) relPaths.push(filename)
  }
  return relPaths
}

export async function pushAllNotes(notesDir: string): Promise<{ pushed: number; errors: string[] }> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return { pushed: 0, errors: [] }

  // Cancel any debounced pushes queued by flushPendingLocalChanges — pushAllNotes
  // does the same work synchronously, so leaving timers active would double-push
  // and produce duplicate commits.
  pushTimers.forEach((t) => clearTimeout(t))
  pushTimers.clear()

  let token: string
  try {
    token = decryptToken(s.encryptedToken)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const userFacingError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`
    syncError = userFacingError
    return { pushed: 0, errors: [userFacingError] }
  }
  let pushed = 0
  const errors: string[] = []

  let relPaths: string[]
  try {
    relPaths = listLocalSyncPaths(notesDir)
  } catch {
    return { pushed: 0, errors: [] }
  }

  notesDirPath = notesDir
  let stateChanged = false
  for (const relPath of relPaths) {
    try {
      const content = fs.readFileSync(path.join(notesDir, relPath), 'utf-8')
      const outcome = await upsertRemoteFile(token, s.owner!, s.repo!, relPath, content, { notesDir })
      // Superseded: the disk moved on while queued — its own push (or the
      // pull that wrote it) owns the path now; leave the journal alone.
      if (outcome === 'superseded') continue
      pushed++
      if (journalComplete(getState(), relPath, 'upsert')) stateChanged = true
    } catch (err) {
      if (err instanceof RemoteChangedError) {
        holdBackForRemoteChange(relPath, 'upsert') // not an error: a pull resolves it
        continue
      }
      errors.push(relPath)
      // Journal the failed upsert so retrySyncJournal picks it up later.
      // IfAbsent: must not clobber a newer delete/deleteDir intent recorded for
      // this key while the push was in flight (see journalRecordIfAbsent).
      journalRecordIfAbsent(getState(), relPath, 'upsert', new Date().toISOString())
      journalFail(getState(), relPath, 'upsert')
      stateChanged = true
      console.error(`[GitHubSync] pushAll failed for ${relPath}:`, String(err))
    }
  }
  if (stateChanged) persistState()

  return { pushed, errors }
}

// ── Mirror local → remote ─────────────────────────────────────────────────────

/** Guard failure of a mirror run — the renderer localizes these codes. */
export type MirrorFailureCode = 'not-connected' | 'in-progress' | 'token'

/**
 * Things the mirror decided NOT to do, as codes the renderer localizes. Kept
 * apart from `errors` (raw GitHub API messages, shown verbatim) precisely
 * because these are OUR user-facing sentences and must be translated.
 */
export type MirrorWarningCode = 'deletions-skipped-unreadable'

export interface MirrorResult {
  ok: boolean
  pushed: number
  deleted: number
  /** Files already byte-identical on the remote (skipped without any request). */
  skipped: number
  errors: string[]
  warnings: MirrorWarningCode[]
  /** Set instead of running when a guard rejected the call. */
  error?: MirrorFailureCode
}

let mirrorInFlight = false

/**
 * Paths the MIRROR records in the reconciled-SHA cache for files it found
 * IDENTICAL on the remote (no request at all): note.md anchors + root
 * metadata. Identical sections are adopted on the next pull by comparing with
 * the local file (planSectionRefresh). Every file it actually UPLOADS is cached
 * by upsertRemoteFileNow itself (recordPushedBase), sections included.
 */
function isShaCachedPath(relPath: string): boolean {
  return relPath.endsWith(`/${NOTE_MD}`) || (METADATA_FILENAMES as readonly string[]).includes(relPath)
}

/**
 * Makes the remote repo an EXACT copy of the notes dir: uploads every file that
 * is missing or differs, DELETES every remote path that no longer exists locally
 * (strict allowlist in mirrorPlan.ts — README, the format marker and any dotfile
 * are never touched; inside a folder, only REAL remote note folders anchored by
 * note.md) and re-asserts the v2 format marker. The deletion phase is skipped
 * WHOLESALE if any local file could not be read: an incomplete local snapshot
 * makes "missing locally" mean nothing.
 *
 * Exists because GitHub becomes a write-only mirror while NoteFlow Cloud owns
 * the sync loop: it never receives deletions, and notes arriving from another
 * device with an old `updated` are not picked up by the pull's flush, so the repo
 * silently rots. The action is only offered with Cloud enabled — the gate lives
 * in main.ts (`sync:mirror-to-github`), since importing cloudSync.ts here would
 * be a cycle.
 *
 * Every remote write/delete goes through upsertRemoteFile/removeRemoteFile (the
 * serialized mutation queue) and is journaled with the same keys as the regular
 * push/delete paths — a gone note folder as ONE 'deleteDir' on '<dir>', which is
 * the key the pull's guard honors (per-file 'delete' entries would NOT stop the
 * pull from rewriting the note.md anchor).
 * ⚠️ That journal does NOT mean automatic retry here: the mirror only runs with
 * Cloud enabled, and in that state nothing drains the GitHub journal (the
 * auto-sync tick returns early and retrySyncJournal is gated on
 * initialPullStatus === 'ok'). It is crash-safety + a guard for the manual pull;
 * the real recovery is running the mirror again, and `syncError` / the returned
 * `errors` are the only signal. If Cloud is later switched off, a journaled
 * 'deleteDir' is retried via deleteRemoteDirNow, which sweeps EVERY blob under
 * the folder — exactly like deleting a note normally does.
 * On a fully clean run `lastSync` is bumped and `needsFullReconcile` is
 * consumed: after an exact mirror the repo really does know everything on disk,
 * which is what those two flags mean. Any error leaves both untouched.
 *
 * Deliberately NOT gated on `initialPullStatus === 'ok'` like the push paths:
 * that gate exists so a stale local file can't overwrite a newer remote one, and
 * overwriting the remote with the local state is precisely what the user asked
 * for here (Cloud is the source of truth, GitHub is the mirror). It also could
 * never run otherwise — while Cloud is on, the GitHub auto-sync tick is skipped,
 * so the initial pull may never have happened.
 */
export async function mirrorToGitHub(notesDir: string): Promise<MirrorResult> {
  const idle = { pushed: 0, deleted: 0, skipped: 0, errors: [] as string[], warnings: [] as MirrorWarningCode[] }
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return { ok: false, ...idle, error: 'not-connected' }
  // Reentrancy guard: a double click must not run two passes (they would fight
  // over the same paths in the mutation queue).
  if (mirrorInFlight) return { ok: false, ...idle, error: 'in-progress' }

  let token: string
  try {
    token = decryptToken(s.encryptedToken)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const userFacingError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`
    syncError = userFacingError
    statusListener?.()
    return { ok: false, ...idle, errors: [userFacingError], error: 'token' }
  }

  const owner = s.owner
  const repo = s.repo
  // Taken BEFORE reading disk: on a clean run this becomes `lastSync`, so a note
  // written WHILE the mirror ran keeps `updated > lastSync` and is never exposed
  // to the pull's deletion rule (it just wasn't part of this snapshot).
  const startedAt = new Date().toISOString()
  const observedNeedsFullReconcile = s.needsFullReconcile === true

  // Same reason as pushAllNotes: this uploads the current on-disk content
  // synchronously, so leaving debounced timers armed would double-push.
  pushTimers.forEach((t) => clearTimeout(t))
  pushTimers.clear()

  mirrorInFlight = true
  let pushed = 0
  let deleted = 0
  let skipped = 0
  const errors: string[] = []
  const warnings: MirrorWarningCode[] = []
  const state = getState()
  let stateChanged = false

  try {
    // Prove the notes dir is readable BEFORE trusting an empty local set.
    // listNoteDirs swallows a failed readdir and returns [] (deliberately
    // tolerant — other callers rely on that), which here would be
    // indistinguishable from "the user deleted every note": the plan would
    // delete every note folder from the repo AND the run would look clean
    // (lastSync bumped, needsFullReconcile consumed). Throwing sends it to the
    // outer catch instead. An EMPTY but readable dir still works — mirroring an
    // empty local state does empty the repo's notes, which is the point of the
    // action and what the confirmation dialog warns about.
    fs.readdirSync(notesDir)

    const localFiles: MirrorFile[] = []
    // An unreadable local file makes the local snapshot INCOMPLETE, and every
    // deletion decision is "the remote has it, we don't". Uploading anyway is
    // harmless, but deleting would remove live data: an unreadable note.md
    // (EACCES, antivirus lock, file in use) would look exactly like a deleted
    // note and take its whole folder off the remote.
    let localReadFailed = false
    for (const relPath of listLocalSyncPaths(notesDir)) {
      try {
        localFiles.push({
          path: relPath,
          sha: gitBlobSha(fs.readFileSync(path.join(notesDir, relPath), 'utf-8')),
        })
      } catch (err) {
        // Unreadable local file: report it and keep going, but the run is no
        // longer clean (lastSync stays put — the repo isn't an exact copy).
        errors.push(`${relPath}: ${String(err)}`)
        localReadFailed = true
      }
    }

    const blobs = await listRemoteTree(token, owner, repo)
    const plan = planMirror(localFiles, blobs, METADATA_FILENAMES)
    skipped = plan.unchanged.length
    const localShaByPath = new Map(localFiles.map((f) => [f.path, f.sha]))
    // Paths the remote will hold once this run finishes — used to prune the SHA cache.
    const remainingRemote = new Set(blobs.map((b) => b.path))

    // Identical anchors/metadata are reconciled by definition: caching their SHA
    // lets the next pull skip them without a GET, and (for the metadata JSONs)
    // is what stops a stale repo from overwriting local groups/folders/order.
    for (const relPath of plan.unchanged) {
      // Clear any journaled 'upsert' for this path: a debounced push may have
      // armed (and journaled) a timer we cancelled above, and the remote already
      // holds exactly this content, so the intent IS satisfied. Leaving it would
      // strand the entry forever — shouldDeletionRuleSkipDir would then disarm
      // the pull's local-deletion rule for that note dir indefinitely.
      if (journalComplete(state, relPath, 'upsert')) stateChanged = true
      if (!isShaCachedPath(relPath)) continue
      if (setCachedSha(state, relPath, localShaByPath.get(relPath)!)) stateChanged = true
    }

    for (const relPath of plan.toUpload) {
      try {
        const content = fs.readFileSync(path.join(notesDir, relPath), 'utf-8')
        // Forced: GitHub is the write-only mirror of Cloud here, never conditional.
        await upsertRemoteFile(token, owner, repo, relPath, content, { force: true })
        pushed++
        remainingRemote.add(relPath)
        if (journalComplete(state, relPath, 'upsert')) stateChanged = true
        if (isShaCachedPath(relPath) && setCachedSha(state, relPath, gitBlobSha(content))) stateChanged = true
      } catch (err) {
        errors.push(`${relPath}: ${String(err)}`)
        // Journal the failed upsert so retrySyncJournal picks it up later.
        // IfAbsent: must not clobber a newer delete/deleteDir intent recorded for
        // this key while the push was in flight (see journalRecordIfAbsent).
        journalRecordIfAbsent(state, relPath, 'upsert', new Date().toISOString())
        journalFail(state, relPath, 'upsert')
        stateChanged = true
        console.error(`[GitHubSync] mirror upload failed for ${relPath}:`, String(err))
      }
    }

    // Deletions only run on a COMPLETE local snapshot — see localReadFailed.
    if (localReadFailed) {
      // A CODE, not a sentence: this one is our own user-facing text, so the
      // renderer translates it (the raw strings in `errors` are GitHub's).
      warnings.push('deletions-skipped-unreadable')
      console.warn('[GitHubSync] mirror: skipping deletions, local snapshot incomplete')
    } else {
      for (const entry of plan.toDelete) {
        // Journal BEFORE attempting it: a lost remote delete makes the file
        // reappear on the next pull, so it must survive a crash/outage. A whole
        // note folder is ONE 'deleteDir' op keyed by '<dir>' (see MirrorDeletion):
        // that is the only key the pull's guard honors for the note.md anchor.
        // Note journalRecord('deleteDir') drops any file-level op under '<dir>/',
        // which is why the per-file entries of a gone folder are never recorded.
        // persistState() right here (like scheduleDelete/scheduleDeleteDir): the
        // finally-block flush is too late — a crash mid-folder would leave the
        // repo half-deleted with NO journal entry, and the next manual pull would
        // resurrect the note from the note.md still sitting on the remote.
        if (journalRecord(state, entry.key, entry.op, new Date().toISOString())) persistState()
        let failed = false
        for (const relPath of entry.paths) {
          try {
            await removeRemoteFile(token, owner, repo, relPath, { force: true })
            deleted++
            remainingRemote.delete(relPath)
          } catch (err) {
            // One blob failing must not abort the rest of the folder, but the
            // entry stays journaled so the whole delete is retried as a unit.
            failed = true
            errors.push(`${relPath}: ${String(err)}`)
            syncError = `Failed to delete ${relPath} on GitHub: ${String(err)}`
            console.error('[GitHubSync] mirror delete failed:', String(err))
          }
        }
        if (failed) {
          journalFail(state, entry.key, entry.op)
          stateChanged = true
        } else if (journalComplete(state, entry.key, entry.op)) {
          stateChanged = true
        }
      }
    }

    // A mirror asserts "the remote is v2" — make sure the marker says so.
    if (!remainingRemote.has(FORMAT_MARKER_FILE)) {
      try {
        await upsertRemoteFile(token, owner, repo, FORMAT_MARKER_FILE, `${NOTE_FORMAT_VERSION}\n`)
        remainingRemote.add(FORMAT_MARKER_FILE)
      } catch (err) {
        errors.push(`${FORMAT_MARKER_FILE}: ${String(err)}`)
      }
    }

    if (pruneShas(state, remainingRemote)) stateChanged = true

    if (errors.length === 0) {
      // Rebase on the CURRENT settings, never on the `s` snapshot taken before
      // the network round-trips (same pattern as persistMigratedAt): anything
      // written meanwhile — remoteFormatMigratedAt, markNeedsFullReconcile —
      // must survive. The one-shot flag is only consumed if THIS run observed it.
      const latest = syncSettings ?? s
      syncSettings = {
        ...latest,
        lastSync: startedAt,
        needsFullReconcile: observedNeedsFullReconcile ? false : latest.needsFullReconcile === true,
      }
      const settings = readSettings()
      settings.githubSync = syncSettings
      writeSettings(settings)
      syncError = undefined
    }
  } catch (err: unknown) {
    // Tree listing / notes-dir walk failed — nothing was reconciled.
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(msg)
    syncError = msg
    console.error('[GitHubSync] mirror failed:', msg)
  } finally {
    mirrorInFlight = false
    if (stateChanged) persistState()
    statusListener?.()
  }

  return { ok: errors.length === 0, pushed, deleted, skipped, errors, warnings }
}

/**
 * Pushes a specific set of notes-dir-relative files NOW (awaited, no debounce),
 * reading their current content from disk. Used by bulk imports: the per-file
 * `schedulePush` path bumps `lastSync` to "now" on each completion, so while a
 * large batch drains, a racing auto-sync pull sees the not-yet-pushed notes as
 * `updated <= lastSync` and DELETES them. Landing them on the remote up front
 * makes them immune to that deletion (the pull keeps any dir present remotely).
 * Does NOT bump `lastSync` (the freshly-imported notes are newer than it, and
 * leaving it untouched avoids exposing OTHER pending local notes to deletion).
 * No-op while the push gate is closed — `flushPendingLocalChanges` will push
 * them after the first successful pull.
 */
export async function pushPathsNow(notesDir: string, relPaths: string[]): Promise<{ pushed: number; errors: string[] }> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return { pushed: 0, errors: [] }
  if (initialPullStatus !== 'ok') return { pushed: 0, errors: [] }

  let token: string
  try {
    token = decryptToken(s.encryptedToken)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    syncError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`
    return { pushed: 0, errors: [syncError] }
  }

  let pushed = 0
  const errors: string[] = []
  let stateChanged = false
  notesDirPath = notesDir
  for (const relPath of relPaths) {
    // Supersede any debounced timer for this path — we're pushing it now.
    const existing = pushTimers.get(relPath)
    if (existing) { clearTimeout(existing); pushTimers.delete(relPath) }
    try {
      const content = fs.readFileSync(path.join(notesDir, relPath), 'utf-8')
      const outcome = await upsertRemoteFile(token, s.owner!, s.repo!, relPath, content, { notesDir })
      if (outcome === 'superseded') continue // the disk moved on — its own push owns it
      pushed++
      if (journalComplete(getState(), relPath, 'upsert')) stateChanged = true
    } catch (err) {
      if (err instanceof RemoteChangedError) {
        // Not a failure: the file changed on GitHub — a pull resolves it.
        holdBackForRemoteChange(relPath, 'upsert')
        continue
      }
      errors.push(relPath)
      // Journal the failed upsert so retrySyncJournal picks it up later.
      // IfAbsent: must not clobber a newer delete/deleteDir intent recorded for
      // this key while the push was in flight (see journalRecordIfAbsent).
      journalRecordIfAbsent(getState(), relPath, 'upsert', new Date().toISOString())
      journalFail(getState(), relPath, 'upsert')
      stateChanged = true
      console.error(`[GitHubSync] pushPathsNow failed for ${relPath}:`, String(err))
    }
  }
  if (stateChanged) persistState()
  if (pushed > 0) syncError = undefined
  return { pushed, errors }
}

/**
 * Debounced single-file push. `relPath` is the notes-dir-relative remote path
 * ('<dir>/<file>.md' for note files, '<name>.json' for root metadata) and is
 * also the debounce key — two files of the same note debounce independently.
 */
export function schedulePush(relPath: string, content: string, onStart?: () => void, onComplete?: (error?: string) => void): void {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
    onComplete?.()
    return
  }

  // Gate: defer pushes until the initial pull has succeeded — otherwise a stale
  // local file could overwrite a newer remote version (data loss). The on-disk
  // write already happened in the caller, so no data is lost by deferring.
  // Pending changes are flushed automatically when pullNotes transitions to 'ok'.
  if (initialPullStatus !== 'ok') {
    console.warn(`[GitHubSync] Push deferred for ${relPath}: initialPullStatus=${initialPullStatus}`)
    onComplete?.(`sync-gated:${initialPullStatus}`)
    return
  }

  schedulePushUnguarded(relPath, content, onStart, onComplete)
}

function schedulePushUnguarded(relPath: string, content: string, onStart?: () => void, onComplete?: (error?: string) => void): void {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
    onComplete?.()
    return
  }

  // Debounce: reset timer if already queued for this file.
  // Previous callbacks are intentionally discarded — the new call supersedes them.
  const existing = pushTimers.get(relPath)
  if (existing) clearTimeout(existing)

  // Journal the pending upsert at timer-arming time (not when it fires) so it
  // survives the app closing during the debounce window. Cleared on success;
  // kept on failure so retrySyncJournal re-pushes the on-disk content later.
  if (journalRecord(getState(), relPath, 'upsert', new Date().toISOString())) persistState()

  const timer = setTimeout(async () => {
    pushTimers.delete(relPath)
    onStart?.() // timer fired → HTTP request is about to start
    try {
      const token = decryptToken(s.encryptedToken!)
      const outcome = await upsertRemoteFile(token, s.owner!, s.repo!, relPath, content, {
        notesDir: notesDirPath ?? undefined,
      })
      if (outcome === 'superseded') {
        // The file on disk is no longer this content: a newer save re-armed
        // its own timer, or a pull wrote the remote version. Nothing was sent;
        // the journal entry (if any) belongs to whoever replaced it.
        onComplete?.()
        return
      }
      if (journalComplete(getState(), relPath, 'upsert')) persistState()
      // Rebase on the CURRENT settings, never on the `s` captured when the timer
      // was armed: this closure can outlive it by minutes (5s debounce + the
      // serialized mutation queue), and spreading the stale snapshot would drop
      // whatever was written meanwhile — e.g. needsFullReconcile, silently
      // re-arming the deletion rule. Same pattern as persistMigratedAt.
      const latest = syncSettings ?? s
      syncSettings = { ...latest, lastSync: new Date().toISOString() }
      const settings = readSettings()
      settings.githubSync = syncSettings
      writeSettings(settings)
      syncError = undefined
      onComplete?.()
    } catch (err: unknown) {
      if (err instanceof RemoteChangedError) {
        // The file changed on GitHub since this device last saw it: nothing was
        // sent (no syncError, no lastSync bump) — the op stays journaled as
        // stale and the pull this requests resolves the folder.
        holdBackForRemoteChange(relPath, 'upsert')
        onComplete?.()
        return
      }
      // Re-record before failing: the entry may have been completed by a racing
      // retrySyncJournal while this push was in flight — journalFail alone would
      // be a no-op then and the failed push would be silently lost (same pattern
      // as the pushPathsNow/pushAllNotes catch blocks). IfAbsent: must not
      // clobber a newer delete/deleteDir intent recorded for this key while the
      // push was in flight — e.g. scheduleDelete of this very section — or a
      // correlated delete failure would leave an 'upsert' entry for a locally
      // deleted file, which the retry then DISCARDS: remote delete lost.
      journalRecordIfAbsent(getState(), relPath, 'upsert', new Date().toISOString())
      journalFail(getState(), relPath, 'upsert')
      persistState()
      syncError = err instanceof Error ? err.message : String(err)
      console.error('[GitHubSync] push failed:', syncError)
      onComplete?.(syncError)
    }
  }, 5000) // 5s debounce — avoids spamming API while typing

  pushTimers.set(relPath, timer)
}

// Called when pullNotes transitions from pending/failed → ok (and on every pull
// while Cloud owns the writes, or when a full reconcile is pending). Scans the
// note directories and re-queues pushes for every file of any note whose note.md
// is newer than the previous lastSync (i.e. edits the push gate never saw).
// Survives restarts: detection is purely on-disk.
//
// The note.md timestamp can't tell WHICH section changed, so the dir-level gate
// selects the whole folder; `remoteShaByPath` (the tree the pull ALREADY fetched)
// then drops file by file whatever the remote holds byte-for-byte. Without it a
// title edit on a note with 8 sections queued 9 pushes, 8 of them no-ops.
// Returns true when the journal changed — the caller persists the state.
function flushPendingLocalChanges(
  notesDir: string,
  previousLastSync: string | undefined,
  remoteShaByPath?: ReadonlyMap<string, string>,
): boolean {
  const lastSyncMs = previousLastSync ? Date.parse(previousLastSync) : null
  const state = getState()
  let stateChanged = false
  for (const dir of listNoteDirs(notesDir)) {
    const dirPath = path.join(notesDir, dir)
    try {
      const anchor = fs.readFileSync(path.join(dirPath, NOTE_MD), 'utf-8')
      const updatedMs = parseUpdatedTimestamp(extractUpdatedTimestamp(anchor))
      if (updatedMs === null) continue
      if (lastSyncMs !== null && updatedMs <= lastSyncMs) continue
      for (const f of fs.readdirSync(dirPath)) {
        if (!f.endsWith('.md')) continue
        const relPath = `${dir}/${f}`
        try {
          const content = fs.readFileSync(path.join(dirPath, f), 'utf-8')
          if (remoteHasContent(remoteShaByPath, relPath, content)) {
            // Same reasoning as the mirror's `unchanged` pass: the remote already
            // has this content, so a journaled 'upsert' (a debounce timer armed
            // before the app closed, or a push that failed) is satisfied. Leaving
            // it stranded would disarm the pull's local-deletion rule for this dir
            // forever (shouldDeletionRuleSkipDir).
            if (journalComplete(state, relPath, 'upsert')) stateChanged = true
            continue
          }
          schedulePushUnguarded(relPath, content)
        } catch { /* unreadable file — skip */ }
      }
    } catch {
      // Unreadable dir — skip.
    }
  }
  return stateChanged
}

/** Removes a single remote file ('<dir>/<file>.md') — used for dropped sections. */
export async function scheduleDelete(relPath: string): Promise<void> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return

  // Cancel any pending push for this file before deleting
  const existing = pushTimers.get(relPath)
  if (existing) {
    clearTimeout(existing)
    pushTimers.delete(relPath)
  }

  // Journal the delete before attempting it — a lost remote delete makes the
  // section resurrect on the next pull. Also supersedes any journaled upsert
  // for this path.
  if (journalRecord(getState(), relPath, 'delete', new Date().toISOString())) persistState()

  try {
    const token = decryptToken(s.encryptedToken)
    await removeRemoteFile(token, s.owner, s.repo, relPath)
    if (journalComplete(getState(), relPath, 'delete')) persistState()
  } catch (err: unknown) {
    if (err instanceof RemoteChangedError) {
      // The section changed on GitHub since this device last saw it: deleting
      // it would erase that edit. Held back (stale) — the pull this requests
      // restores the remote folder (local version kept as a conflict copy).
      holdBackForRemoteChange(relPath, 'delete')
      return
    }
    journalFail(getState(), relPath, 'delete')
    persistState()
    syncError = `Failed to delete ${relPath} on GitHub: ${String(err)}`
    console.error('[GitHubSync] delete failed:', String(err))
  }
}

/**
 * Deletes every remote blob under '<dir>/'. One blob failure must not abort the
 * rest (a half-deleted dir would be re-pulled on the next sync), but the call
 * THROWS if any blob failed so callers journal it for retry. It also throws,
 * before deleting anything, when the tree listing came back truncated
 * (planRemoteDirDelete): files of the folder may be missing from it, and the
 * caller would complete the journal entry with part of the note still remote.
 * And — while GitHub is the active provider — it throws RemoteChangedError,
 * again before deleting anything, when a file of the folder changed on GitHub
 * since this device last reconciled it (remoteDirChangesSinceBase): the remote
 * edit beats the local deletion (see handleDeleteDirConflict).
 */
async function deleteRemoteDirNow(token: string, owner: string, repo: string, dir: string): Promise<void> {
  const listedAt = beginListing()
  let targets: TreeBlobRef[]
  try {
    const { blobs, truncated } = await fetchRemoteTree(token, owner, repo)
    targets = planRemoteDirDelete(blobs, truncated, dir)
    if (!isCloudSyncEnabledFailClosed()) {
      // Files this device itself pushed after the listing are older in it than
      // their cached base — not a remote change.
      const changed = remoteDirChangesSinceBase(getState(), targets, (p) => mutatedSince(p, listedAt))
      if (changed.length > 0) throw new RemoteChangedError(dir)
    }
  } finally {
    endListing(listedAt)
  }
  let failures = 0
  let lastError = ''
  for (const b of targets) {
    try {
      // Forced: the folder-level check above already decided (a per-file
      // check now could leave the folder half-deleted).
      await removeRemoteFile(token, owner, repo, b.path, { force: true })
    } catch (err: unknown) {
      failures++
      lastError = String(err)
      console.error(`[GitHubSync] delete dir blob failed for ${b.path}:`, String(err))
    }
  }
  if (failures > 0) throw new Error(`${failures} file(s) could not be deleted (${lastError})`)
}

/**
 * A deleteDir found the note changed on GitHub since this device last saw it
 * (RemoteChangedError from deleteRemoteDirNow, nothing was deleted): the remote
 * edit beats the local deletion. The 'deleteDir' op is completed (it must not
 * be retried) and the cached bases under the folder dropped, so the next pull
 * — requested right away — downloads the remote note again as a folder this
 * device doesn't have. Logged only, no UI notice: the note simply comes back.
 */
function handleDeleteDirConflict(dir: string): void {
  const state = getState()
  journalComplete(state, dir, 'deleteDir')
  dropCachedShasUnder(state, dir)
  persistState()
  console.warn('[GitHubSync] note deletion not applied on GitHub: the note changed there since the last sync — it will be downloaded again')
  remoteConflictListener?.()
}

/** Removes a whole remote note directory (every blob under '<dir>/'). */
export async function scheduleDeleteDir(dir: string): Promise<void> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return

  // Cancel any pending pushes for files inside this dir
  for (const key of [...pushTimers.keys()]) {
    if (key.startsWith(`${dir}/`)) {
      clearTimeout(pushTimers.get(key)!)
      pushTimers.delete(key)
    }
  }

  // Journal the dir delete before attempting it (also drops any file-level ops
  // under the dir — they are superseded). A lost remote delete makes the note
  // resurrect on the next pull, so failures keep the entry for retry.
  if (journalRecord(getState(), dir, 'deleteDir', new Date().toISOString())) persistState()

  try {
    const token = decryptToken(s.encryptedToken)
    await deleteRemoteDirNow(token, s.owner, s.repo, dir)
    if (journalComplete(getState(), dir, 'deleteDir')) persistState()
  } catch (err: unknown) {
    if (err instanceof RemoteChangedError) {
      handleDeleteDirConflict(dir)
      return
    }
    journalFail(getState(), dir, 'deleteDir')
    persistState()
    syncError = `Failed to delete note folder "${dir}" on GitHub: ${String(err)}`
    console.error('[GitHubSync] delete dir failed:', String(err))
  }
}

// ── Journal retry (durability for failed remote mutations) ───────────────────

let retryInFlight = false

/**
 * Drains the persistent journal of pending remote mutations, executing each op:
 * upserts re-read the CURRENT on-disk content (an upsert whose local file is
 * gone is discarded — its removal is covered by its own delete/deleteDir
 * entry); deletes/deleteDirs re-run the remote removal. Successful ops leave
 * the journal; failed ones stay (attempts++) for the next round — there is no
 * attempt cap that would silently drop a delete (a lost remote delete = a note
 * that resurrects). Called from main.ts on every auto-sync tick BEFORE
 * pullNotes, and once after the initial pull succeeds.
 *
 * Retried upserts do NOT bump `lastSync` — same rationale as pushPathsNow:
 * bumping it would expose OTHER still-pending local notes to the pull's
 * deletion rule.
 *
 * Gated on initialPullStatus === 'ok' like regular pushes: retrying before the
 * first successful pull could overwrite a newer remote version.
 *
 * `stale` ops are skipped: their conditional mutation was already held back
 * because the file changed on GitHub — re-sending would be held back again;
 * the pull resolves them. A conditional mutation held back NOW
 * (RemoteChangedError) flags its op stale and asks for a pull — no syncError.
 */
export async function retrySyncJournal(notesDir: string): Promise<void> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return
  if (initialPullStatus !== 'ok') return
  if (retryInFlight) return

  const state = getState()
  const entries = Object.entries(state.ops)
    .sort((a, b) => a[1].queuedAt.localeCompare(b[1].queuedAt))
  if (entries.length === 0) return

  retryInFlight = true
  try {
    let token: string
    try {
      token = decryptToken(s.encryptedToken)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      syncError = `Failed to decrypt GitHub token. Please reconnect GitHub sync. (${msg})`
      return
    }
    const owner = s.owner
    const repo = s.repo
    notesDirPath = notesDir

    for (const [key, entry] of entries) {
      // Completed or replaced meanwhile (e.g. a pull resolved the folder, or a
      // newer intent was recorded) — the snapshot entry is no longer the op.
      if (state.ops[key] !== entry) continue
      // Held back by a conditional check — the pull resolves it.
      if (entry.stale) continue
      // A live debounce timer for this path will push fresher content shortly —
      // let it handle the upsert instead of racing it here.
      if (entry.op === 'upsert' && pushTimers.has(key)) continue

      const action = resolveRetryAction(entry.op, fs.existsSync(path.join(notesDir, key)))
      if (action === 'discard') {
        if (journalComplete(state, key, entry.op)) persistState()
        continue
      }

      try {
        if (action === 'upsert') {
          const content = fs.readFileSync(path.join(notesDir, key), 'utf-8')
          const outcome = await upsertRemoteFile(token, owner, repo, key, content, { notesDir })
          // The disk moved on while queued: whatever replaced it owns the path
          // now (its own timer, or the pull) — leave the entry to them.
          if (outcome === 'superseded') continue
          // Race guard: if the user edited this file WHILE the retry push was in
          // flight, schedulePushUnguarded armed a new debounce timer and its
          // journalRecord was a same-op no-op (the entry we're retrying was kept).
          // Completing it here would erase that NEWER intent — if the app closed
          // during the debounce window, the fresh edit would be lost from the
          // journal. Leave the entry alive; the pending timer will complete or
          // fail it.
          if (pushTimers.has(key)) continue
        } else if (action === 'delete') {
          await removeRemoteFile(token, owner, repo, key)
        } else {
          await deleteRemoteDirNow(token, owner, repo, key)
        }
        if (journalComplete(state, key, entry.op)) persistState()
      } catch (err: unknown) {
        if (err instanceof RemoteChangedError) {
          if (entry.op === 'deleteDir') handleDeleteDirConflict(key)
          else holdBackForRemoteChange(key, entry.op)
          continue
        }
        journalFail(state, key, entry.op)
        persistState()
        syncError = `Sync retry (${entry.op} ${key}) failed: ${String(err)}`
        console.error(`[GitHubSync] journal retry failed for ${entry.op} ${key}:`, String(err))
      }
    }
  } finally {
    retryInFlight = false
  }
}

// ── One-time remote format migration (v1 flat files → v2 folders) ────────────

let remoteMigrationInFlight = false

/**
 * Brings the remote repo to format v2: converts any remaining root-level flat
 * note files into folders, pushes every local note folder, deletes the old
 * flat files and finally uploads the `.noteflow-format` marker. Idempotent and
 * cheap once done (guarded by `remoteFormatMigratedAt` in settings).
 *
 * Sequencing safety: callers run this AFTER a successful pull (which is
 * additive-only while the remote is v1), and the marker is pushed LAST so
 * other v2 clients keep their deletion logic disabled until the conversion
 * has fully landed. Returns true when a migration actually ran.
 */
export async function migrateRemoteToV2IfNeeded(notesDir: string): Promise<boolean> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return false
  if (s.remoteFormatMigratedAt) return false
  if (initialPullStatus !== 'ok') return false
  if (remoteMigrationInFlight) return false
  remoteMigrationInFlight = true

  try {
    const token = decryptToken(s.encryptedToken)
    const blobs = await listRemoteTree(token, s.owner, s.repo)
    const hasMarker = blobs.some((b) => b.path === FORMAT_MARKER_FILE)
    const flatNotes = rootFlatNoteBlobs(blobs)

    if (hasMarker && flatNotes.length === 0) {
      // Remote already fully v2 (migrated by another device) — just record it.
      persistMigratedAt(s)
      return false
    }

    console.log(`[GitHubSync] migrating remote to format v2 (${flatNotes.length} flat note(s))`)

    // 1) Convert remote flat notes locally first so nothing is lost: notes that
    //    only exist remotely (or are NEWER remotely — an old client pushed after
    //    our local migration) are written as local folders before deletion.
    for (const blob of flatNotes) {
      try {
        const remote = await getRemoteFile(token, s.owner, s.repo, blob.path)
        if (!remote) continue
        const dir = blob.path.replace(/\.md$/i, '')
        const localAnchorPath = path.join(notesDir, dir, NOTE_MD)
        if (fs.existsSync(localAnchorPath)) {
          const localTs = parseUpdatedTimestamp(extractUpdatedTimestamp(fs.readFileSync(localAnchorPath, 'utf-8')))
          const remoteTs = parseUpdatedTimestamp(extractUpdatedTimestamp(remote.content))
          if (localTs !== null && remoteTs !== null && remoteTs <= localTs) continue // local folder is current
        }
        const note = parseLegacyNoteRaw(remote.content)
        const { files } = serializeNoteFolder(note, { preserveUpdated: true })
        fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
        for (const [f, content] of Object.entries(files)) {
          fs.writeFileSync(path.join(notesDir, dir, f), content, 'utf-8')
        }
      } catch (err) {
        console.error(`[GitHubSync] remote migration: failed to convert ${blob.path}:`, String(err))
      }
    }

    // 2) Push every local note folder + metadata
    await pushAllNotes(notesDir)

    // 3) Delete the old flat files from the remote
    for (const blob of flatNotes) {
      try {
        await removeRemoteFile(token, s.owner, s.repo, blob.path)
      } catch (err) {
        console.error(`[GitHubSync] remote migration: failed to delete ${blob.path}:`, String(err))
      }
    }

    // 4) Marker LAST — it flips other clients into full v2 behaviour
    await upsertRemoteFile(token, s.owner, s.repo, FORMAT_MARKER_FILE, `${NOTE_FORMAT_VERSION}\n`)
    persistMigratedAt(s)
    console.log('[GitHubSync] remote format migration complete')
    return true
  } finally {
    remoteMigrationInFlight = false
  }
}

function persistMigratedAt(s: GitHubSyncSettings): void {
  // Re-read the live settings — a debounced push may have bumped lastSync
  // while the migration was running.
  const latest = syncSettings ?? s
  syncSettings = { ...latest, remoteFormatMigratedAt: new Date().toISOString() }
  const settings = readSettings()
  settings.githubSync = syncSettings
  writeSettings(settings)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractUpdatedTimestamp(content: string): string | null {
  const match = content.match(/^updated:\s*['"]?([^'"\n]+)['"]?\s*$/m)
  return match ? match[1].trim() : null
}

function parseUpdatedTimestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}
