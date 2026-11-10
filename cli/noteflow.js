#!/usr/bin/env node
'use strict'
// v2.10.0 — human-readable version marker (keep in sync with CLI_VERSION below)

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const { randomBytes, webcrypto, createHash } = require('node:crypto')
const { execSync, execFileSync } = require('node:child_process')
const readline = require('node:readline')

// ── Constants ────────────────────────────────────────────────────────────────

// ⚠️ keep in sync with the "// v" header comment above (informational marker;
// self-update compares full file contents, not this version).
const CLI_VERSION = '2.10.0'

const GITHUB_CLIENT_ID = 'Ov23liut9QOJ2pJFF0KR'
const DEFAULT_REPO = 'noteflow-notes'

// NoteFlow Cloud (Supabase). ⚠️ keep in sync with electron/cloudConfig.ts.
// Public by design, same model as GITHUB_CLIENT_ID: the anon key grants nothing
// by itself — security comes from RLS policies and per-user Auth JWTs.
const SUPABASE_URL = 'https://bolnhekicavuzscdjoty.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_1Ifj7iwZ7w_Xx5B2aLcDfQ_4AbBeFFx'
const CLOUD_KEYS_URL = `${SUPABASE_URL}/functions/v1/cloud-keys`
const GROUP_COLORS = ['--accent', '--accent-2', '--red', '--cyan', '--purple', '--text', '--orange', '--pink']

// On-disk format v2: one DIRECTORY per note ('<slug>-<id>/') containing a
// frontmatter-only note.md (metadata + section index) plus one '<secId>.md'
// per section (plain markdown body). Mirrors the desktop app's format.
const NOTE_MD = 'note.md'
const FORMAT_VERSION = 2
const FORMAT_MARKER = '.noteflow-format'
const METADATA_FILES = ['groups.json', 'folders.json', 'section-colors.json', 'note-order.json', 'ui-settings.json']

// Root metadata files synced to NoteFlow Cloud. ⚠️ keep in sync with
// CLOUD_METADATA_FILENAMES in electron/cloudSyncLogic.ts — note it carries
// templates.json and snippets.json, which the GitHub METADATA_FILES list above does not.
const CLOUD_METADATA_FILES = ['groups.json', 'folders.json', 'section-colors.json', 'note-order.json', 'templates.json', 'snippets.json', 'ui-settings.json']

// ── Paths ────────────────────────────────────────────────────────────────────

// NOTEFLOW_NOTES_DIR overrides the default location (scripting / testing)
const NOTES_DIR = process.env.NOTEFLOW_NOTES_DIR || (process.platform === 'linux'
  ? path.join(os.homedir(), '.local', 'share', 'noteflow-notes')
  : path.join(os.homedir(), 'noteflow-notes'))

function getSettingsDir() {
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'noteflow')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'noteflow')
}

const SETTINGS_PATH = path.join(getSettingsDir(), 'settings.json')

// ── Utilities ────────────────────────────────────────────────────────────────

function nanoid(n) {
  return randomBytes(n).toString('base64url').slice(0, n)
}

function q(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

function getTodayTitle() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

function noteDirname(id, title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
  return `${slug ? slug + '-' : ''}${id}`
}

// With --json, stdout must carry ONLY the JSON payload: every informational
// line (sync status, warnings, "Created section"…) is rerouted to stderr.
let jsonMode = false
function out(msg) { if (jsonMode) console.error(msg); else console.log(msg) }
function err(msg) { console.error(`  Error: ${msg}`) }

/**
 * Ends the command with `code`. ⚠️ Never call process.exit() in this file: on
 * Windows (seen on Node 24) a hard exit while a fetch/https keep-alive socket is
 * still open intermittently aborts the process with the libuv assertion
 * `!(handle->flags & UV_HANDLE_CLOSING)` (src\win\async.c) — and with exit code
 * 127 instead of 1. Instead the code goes to process.exitCode and a CliExit
 * unwinds to the handler at the bottom of main(); Node then exits NATURALLY once
 * the event loop drains (idle keep-alive sockets are unref'd, so it doesn't wait
 * for them). Like process.exit, it never returns: code after it does not run.
 * An enclosing try/catch would intercept it — keep exit() out of try blocks.
 */
class CliExit extends Error {
  constructor(code) { super(`exit ${code}`); this.exitCode = code }
}
function exit(code) {
  process.exitCode = code
  throw new CliExit(code)
}

/**
 * JSON.stringify with every non-ASCII char escaped as \uXXXX so the output
 * survives any console codepage (PowerShell 5.1 mangles raw UTF-8 otherwise).
 * Escaping per UTF-16 code unit keeps surrogate pairs valid JSON.
 */
function toJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

/** Writes a machine-readable result to stdout (the only stdout line in --json mode). */
function jsonOut(value) { process.stdout.write(toJson(value) + '\n') }

function lineCount(content) { return content ? content.split('\n').length : 0 }

// ── Settings ─────────────────────────────────────────────────────────────────

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) }
  catch { return {} }
}

/**
 * POSIX only: makes settings.json owner-only (0600) when group/others have ANY
 * access. The file holds the GitHub token (scope `repo`) and the Cloud refresh
 * token base64-encoded, NOT encrypted — a plain Node process has no safeStorage —
 * so its mode is the only barrier against other local users (same model as `gh`
 * or ~/.ssh). Best-effort and silent: a missing file, a filesystem without POSIX
 * modes or a file owned by someone else must never fail the command.
 */
function restrictSettingsPerms() {
  if (process.platform === 'win32') return
  try {
    if (fs.statSync(SETTINGS_PATH).mode & 0o077) fs.chmodSync(SETTINGS_PATH, 0o600)
  } catch { /* ignore */ }
}

function writeSettings(data) {
  const dir = path.dirname(SETTINGS_PATH)
  // 0700 only when WE create it (Chromium creates the app's userData the same
  // way); an existing dir is left alone — the 0600 on the file is what matters.
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  // Written IN PLACE (no tmp + rename): the inode — and so the mode — survives,
  // and the desktop app's writers do the same. Tighten BEFORE writing so a
  // legacy 0644 file never holds the new token, even briefly; `mode` covers the
  // create case (it is ignored when the file already exists).
  restrictSettingsPerms()
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

function getSyncSettings() { return readSettings().githubSync || { enabled: false } }

/** Pure: a base64 GitHub token the CLI can read, or null (absent, or the app's safeStorage ciphertext). */
function decodeGithubToken(b64) {
  if (typeof b64 !== 'string' || !b64 || b64.startsWith('safe:')) return null
  const decoded = Buffer.from(b64, 'base64').toString('utf-8')
  return /^[\x20-\x7e]+$/.test(decoded) ? decoded : null
}

/**
 * Pure: the GitHub token the CLI syncs with, or null. First githubSync's own
 * (base64, written by `noteflow login`). When that one is the desktop app's
 * safeStorage ciphertext (`safe:…`, or a legacy unprefixed one) — on Windows
 * this settings.json IS the app's — the CLI's own copy `cliGithubToken`
 * ({ owner, token: base64 }), written by the app's Settings → Sync → "Connect
 * the CLI too" so the app's encrypted token is never replaced. The copy only
 * counts for the same GitHub account as githubSync (`owner`): a copy left from
 * an earlier connection is ignored. Mirror of resolveCliGithubToken
 * (electron/cliConnectLogic.ts).
 */
function resolveGithubToken(sync, cliToken) {
  if (!sync || !sync.encryptedToken) return null
  const own = decodeGithubToken(sync.encryptedToken)
  if (own) return own
  if (cliToken && typeof cliToken === 'object' && typeof cliToken.owner === 'string' && cliToken.owner === sync.owner) {
    return decodeGithubToken(cliToken.token)
  }
  return null
}

function getToken() {
  const settings = readSettings()
  return resolveGithubToken(settings.githubSync, settings.cliGithubToken)
}

// ── NoteFlow Cloud settings (CLI-owned) ───────────────────────────────────────
//
// The CLI keeps its OWN GoTrue session in settings.cliAccount and its OWN sync
// state in settings.cliCloud. It must NEVER read or write settings.account /
// settings.cloudSync (the desktop app's): GoTrue ROTATES the refresh token on
// every grant, so a shared session would sign the app and the CLI out of each
// other on every refresh. The refresh token is stored base64-encoded — same
// trade-off as the CLI's GitHub token (a plain Node process has no safeStorage).
// Sole exception, read-only: readDesktopAppInfo() checks whether the app HAS a
// session (and its email) for the `status --json` hint — never its token.

function getCliAccount() {
  const a = readSettings().cliAccount
  return a && a.refreshToken ? a : null
}

function saveCliAccount(account) {
  const settings = readSettings()
  settings.cliAccount = account
  writeSettings(settings) // writeSettings keeps the file owner-only (0600) on POSIX
}

function clearCliAccount() {
  const settings = readSettings()
  delete settings.cliAccount
  writeSettings(settings)
}

// ── Desktop app hint (read-only) ──────────────────────────────────────────────
//
// `status --json` tells an agent whether the user is signed in to NoteFlow
// Cloud in the DESKTOP app, so it can offer that backend (with that email)
// when the CLI has no sync. Electron's userData is `<appData>/NoteFlow` (its
// app name is package.json's productName): the CLI's own settings.json on
// Windows (case-insensitive), a different file on macOS and Linux. Only the
// PRESENCE of the app's session is read — never its refresh token — plus the
// email, which the app stores in clear, and its GitHub owner/repo (no token);
// the sessions themselves stay the app's.

/** Pure: where the desktop app's settings.json lives (empty = unknown OS). */
function desktopSettingsCandidates(platform, env, home) {
  if (platform === 'win32') {
    return [path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'NoteFlow', 'settings.json')]
  }
  if (platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'NoteFlow', 'settings.json')]
  // NOT the lowercase ~/.config/noteflow: that is the CLI's own file, which
  // exists without the app — it would turn "app not found" into a false "no".
  if (platform === 'linux') return [path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'NoteFlow', 'settings.json')]
  return []
}

/**
 * Pure: the `desktopApp` field of `status --json` from the app's parsed
 * settings.json (null = not found / unknown). Mirrors the app's own rule
 * (electron/account.ts getAccountStatus): signed in = refresh token + userId.
 */
function desktopAppInfo(settings) {
  if (!settings || typeof settings !== 'object') return null
  const a = settings.account && typeof settings.account === 'object' ? settings.account : null
  const cloudSignedIn = !!(a && a.encryptedRefreshToken && a.userId)
  const info = {
    cloudSignedIn,
    cloudSyncEnabled: cloudSignedIn && !!(settings.cloudSync && settings.cloudSync.enabled === true),
  }
  if (cloudSignedIn && typeof a.email === 'string' && a.email.includes('@')) info.cloudEmail = a.email
  // The app's GitHub repo (owner/repo aren't secret; its token is never read):
  // on macOS/Linux the CLI's own githubSync lives in another file, so
  // `github.tokenAccessible: false` can't reveal the app's connection there.
  const gh = settings.githubSync
  info.github = gh && typeof gh === 'object' && gh.enabled && typeof gh.owner === 'string' && gh.owner
    && typeof gh.repo === 'string' && gh.repo
    ? { owner: gh.owner, repo: gh.repo }
    : null
  return info
}

function readDesktopAppInfo() {
  for (const file of desktopSettingsCandidates(process.platform, process.env, os.homedir())) {
    let raw
    try { raw = fs.readFileSync(file, 'utf-8') } catch { continue }
    try { return desktopAppInfo(JSON.parse(raw)) } catch { return null }
  }
  return null
}

// { enabled, pullSeq, lastSync, userId, pendingUpserts, forceUpserts, pullRetry,
// basesBootstrapped, basesBootstrapPending } — the CLI's own cursor/lastSync,
// never the desktop app's settings.cloudSync (each client reconciles
// independently). `pullSeq` = watermark of the server-assigned `seq` already
// reconciled (migration 0008); a legacy `pullCursor` (updated_at cursor of
// earlier versions) no longer filters anything — without `pullSeq` it triggers
// one full reconcile, and the first seq pull removes it. `userId` = the
// account that cursor/lastSync belong to: it
// outlives `cloud logout` (which drops cliAccount) so a re-login can tell
// "same account → resume incrementally" from "another account → start over".
// `pullRetry` = remote rows whose apply failed here (path_key → { relPath?,
// attempts }), re-fetched by every pull until they apply — written in the same
// write as pullSeq (mirror of the app's settings.cloudSync.pullRetry).
// `forceUpserts` ⊆ pendingUpserts = files of a folder kept over a remote
// tombstone whose FORCED re-upload hasn't landed yet: `noteflow push` and the
// per-command push upload them unconditionally (a conditional upload would be
// rejected against the newer tombstone forever) — mirror of the app's
// SyncJournalOp.force.
// `basesBootstrapped` = the one-time bases bootstrap pull is done (written with
// pullSeq, see needsBasesBootstrap); `basesBootstrapPending` = folders whose
// bootstrap reconcile failed, with its context (see nextBootstrapPending). The
// per-file bases themselves live in cli-cloud-state.json (see cliCloudBase).
function getCliCloud() {
  return readSettings().cliCloud || { enabled: false }
}

function patchCliCloud(patch) {
  const settings = readSettings()
  const next = { ...(settings.cliCloud || { enabled: false }), ...patch }
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
  settings.cliCloud = next
  writeSettings(settings)
}

/**
 * Pure: the cliCloud to keep for the signed-in `userId`. The cursor's owner is
 * `c.userId`, or else `presumedOwner` (at login: the account that was still
 * signed in before it, if any).
 *  - Another account: pullSeq/pullCursor/lastSync are dropped and the owner
 *    rebound — a foreign watermark would make the incremental pull skip every
 *    row of this account below it (`seq > pullSeq`).
 *  - Unknown owner (state written before the owner was recorded, by a session
 *    that is gone): the current account is ADOPTED, cursor kept. Resetting is
 *    not free: with no state at all the pull skips tombstones (`deleted=eq.false`),
 *    so notes deleted elsewhere stay on disk and the next push resurrects them
 *    remotely. Adopting only goes wrong for someone who switched accounts
 *    before this rule existed — and that costs hidden-but-intact older notes,
 *    not destroyed data.
 * Without a userId there is nothing to compare. Same object returned = no change.
 */
function cliCloudForUser(c, userId, presumedOwner) {
  if (!userId) return c
  const owner = c.userId || presumedOwner
  if (!owner || owner === userId) return c.userId === userId ? c : { ...c, userId }
  const next = { ...c, userId }
  delete next.pullSeq
  delete next.pullCursor
  delete next.lastSync
  delete next.pendingUpserts // the other account's unsent edits don't guard this one's tombstones
  delete next.pullRetry // the other account's failed rows don't exist in this one
  delete next.forceUpserts
  // The bases (cli-cloud-state.json) are dropped by bindCliCloudToAccount; the
  // bootstrap flags describe them — a fresh account starts with a first sync.
  delete next.basesBootstrapped
  delete next.basesBootstrapPending
  return next
}

// ── Cloud: pending uploads (minimal journal) ──────────────────────────────────
// `cliCloud.pendingUpserts` = relPaths whose Cloud upload FAILED and has not
// succeeded since (the CLI has no retry queue: `noteflow push` re-uploads).
// Mirror of the app's journal guards: a remote tombstone must not delete an
// edit that never reached the server — a later successful upload of ANOTHER
// note moves lastSync past it, so `updated <= lastSync` alone can't see it.

/** Pure: the pending list after an upload attempt — `failed` added, `uploaded` removed (deduped). */
function nextPendingUpserts(pending, failed, uploaded) {
  const out = (Array.isArray(pending) ? pending : []).filter(p => typeof p === 'string' && !uploaded.includes(p))
  for (const f of failed) if (!out.includes(f)) out.push(f)
  return out
}

/** Pure mirror of shouldDeletionRuleSkipDir (electron/syncState.ts): any pending upload under '<dir>/'. */
function pendingUnderDir(pending, dir) {
  return (Array.isArray(pending) ? pending : []).some(p => typeof p === 'string' && p.startsWith(`${dir}/`))
}

/** Pure mirror of hasPendingUpsert (electron/syncState.ts): a pending upload of exactly this file. */
function isPendingUpsert(pending, relPath) {
  return Array.isArray(pending) && pending.includes(relPath)
}

/** Pending entries whose local file still exists (a gone file has nothing left to protect). */
function existingPendingUpserts(list) {
  return (Array.isArray(list) ? list : []).filter(rel => typeof rel === 'string' && fs.existsSync(path.join(NOTES_DIR, rel)))
}

/** Empty list → field removed from settings. */
function storedPendingUpserts(list) {
  return list.length ? list : undefined
}

/**
 * Pure: the pending list without what a pull reconciled to the server's
 * content — every entry under a folder applied wholesale (`dirs`: the local
 * folder lost, its pending edits are the losing version) and the exact
 * `paths` written / found identical. Mirror of the app's settleDirUploads /
 * settlePathUpload.
 */
function dropReconciledPending(pending, dirs, paths) {
  return (Array.isArray(pending) ? pending : []).filter(p =>
    typeof p === 'string' && !paths.includes(p) && !dirs.some(d => p.startsWith(`${d}/`)))
}

/**
 * Pure: note folders with rows still in the pull retry set (a failed apply
 * may have left them half-written: anchor new, a section old). `noteflow push`
 * skips them — uploading the old section with the new anchor's `updated`
 * would be accepted (a tie) and clobber the server's newer section. Mirror of
 * the app flagging the folder's pending uploads stale before applying it.
 */
function dirsPendingRetry(pullRetry) {
  const dirs = new Set()
  for (const v of Object.values(pullRetry || {})) {
    const dir = v && typeof v.relPath === 'string' ? noteDirOf(v.relPath) : null
    if (dir) dirs.add(dir)
  }
  return dirs
}

// ── Cloud: conflict copies (mirror of electron/cloudSyncLogic.ts) ─────────────
// For a folder WITHOUT a base the pull is still last-writer-wins per note
// folder (with a base it merges per file — see planThreeWayDir — and copies
// only the conflicting sections): a newer remote anchor replaces the local
// folder wholesale. When that folder still holds a local edit the
// server never accepted (a pending upload — failed or rejected as stale), the
// LOCAL version is first kept as a conflict copy: a new note folder with a new
// id, same group/folder/sections, title '<title> (conflict copy <date>)'.

/** note.md minus its top-level `updated:` line (every save rewrites it). */
function anchorWithoutUpdated(content) {
  return content.replace(/\r\n/g, '\n').replace(/^updated:[^\n]*(\n|$)/m, '')
}

/**
 * Pure mirror of planConflictCopy (electron/cloudSyncLogic.ts): a copy is
 * needed iff some pending path exists locally (`local[rel]` not null) and
 * differs from the content the server version leaves (`server[rel]`, null /
 * absent = deleted or unknown). note.md is compared without `updated:`,
 * sections byte-for-byte. Encrypted notes compare the anchor only — a
 * re-encryption changes the ciphertext, so they usually get a copy (safe: the
 * CLI can't decrypt to tell).
 */
function planConflictCopy(candidates, local, server) {
  for (const rel of candidates) {
    const mine = local[rel]
    if (mine === null || mine === undefined) continue
    const theirs = server[rel]
    if (theirs === null || theirs === undefined) return true
    if (isAnchorPath(rel) ? anchorWithoutUpdated(mine) !== anchorWithoutUpdated(theirs) : mine !== theirs) return true
  }
  return false
}

/** A one-line YAML scalar as written by js-yaml (plain, "double" or 'single' quoted). */
function yamlScalarValue(raw) {
  const v = raw.trim()
  if (v.startsWith('"')) { try { return String(JSON.parse(v)) } catch { return unquote(v) } }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'")
  return v
}

/** Title of a note.md (same default as the parsers: 'Untitled'). Mirror of anchorTitle. */
function anchorTitle(content) {
  const { frontmatter } = splitFrontmatter(content)
  const m = frontmatter.match(/^title:[ \t]*(.*)$/m)
  const title = m ? yamlScalarValue(m[1]) : ''
  return title === '' ? 'Untitled' : title
}

/** '<original> (<label> YYYY-MM-DD HH:mm)', local time. Mirror of conflictCopyTitle. */
function conflictCopyTitle(original, label, now) {
  const p = n => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`
  return `${original} (${label} ${stamp})`
}

/**
 * Mirror of buildConflictCopy: the local folder's files (`localFiles`: name →
 * content, note.md required) with a new `id`, `title` and `updated` in
 * note.md — everything else (group, folder, tags, sections list, encryption
 * block…) is kept as is: the CLI has no YAML library, so only those three
 * top-level lines are rewritten (a multi-line value's continuation lines are
 * dropped). Section files are copied byte-for-byte under the same names.
 * `onlySections` (filenames) restricts the copy to those sections: its note.md
 * lists only them and only their files are copied (the Cloud three-way pull
 * keeps just the sections in conflict). If the sections list can't be read as
 * text blocks (parseAnchorFm), the WHOLE folder is copied instead — more than
 * needed, never less. Throws when note.md is missing or has no frontmatter.
 */
function buildConflictCopy(localFiles, { newId, title, nowIso, onlySections }) {
  let anchor = localFiles[NOTE_MD]
  if (anchor === undefined) throw new Error('conflict copy: the local folder has no note.md')
  let only = onlySections ? new Set(onlySections) : null
  if (only) {
    const fm = parseAnchorFm(anchor)
    if (!fm) {
      only = null
    } else {
      const items = fmSectionItems(fm)
      if (items !== null) {
        setFmBlock(fm.blocks, 'sections', renderSectionItems(items.filter(it => {
          const file = sectionItemFile(it)
          return file !== null && only.has(file)
        })))
        anchor = renderAnchorFm(fm.blocks, fm.body)
      }
    }
  }
  const { frontmatter, body } = splitFrontmatter(anchor)
  if (!frontmatter) throw new Error('conflict copy: unreadable note.md frontmatter')
  const values = { id: q(newId), title: q(title), updated: q(nowIso) }
  const lines = frontmatter.split('\n')
  const kept = []
  const seen = new Set()
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(id|title|updated):/)
    if (m && !seen.has(m[1])) {
      seen.add(m[1])
      kept.push(`${m[1]}: ${values[m[1]]}`)
      while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) i++
      continue
    }
    kept.push(lines[i])
  }
  for (const key of ['id', 'title', 'updated']) if (!seen.has(key)) kept.push(`${key}: ${values[key]}`)
  const files = { [NOTE_MD]: `---\n${kept.join('\n')}\n---\n${body}` }
  for (const [name, content] of Object.entries(localFiles)) {
    if (name !== NOTE_MD && (!only || only.has(name))) files[name] = content
  }
  return { dir: noteDirname(newId, title), files }
}

/** The app's language setting (settings.json `language`: en | es | system) → 'en' | 'es'. */
function uiLanguage() {
  const setting = readSettings().language
  if (setting === 'en' || setting === 'es') return setting
  let locale = ''
  try { locale = Intl.DateTimeFormat().resolvedOptions().locale || '' } catch { locale = '' }
  return locale.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/** "conflict copy" in the app's language setting. */
function conflictCopyLabel() {
  return uiLanguage() === 'es' ? 'copia en conflicto' : 'conflict copy'
}

/**
 * Marker lines of the conflict blocks a section merge writes, in the app's
 * language: named after this computer + " (CLI)" and the merge time (the
 * merged text syncs to every device — never "this device").
 */
function conflictMarkerLabels() {
  return sectionConflictLabels(SECTION_CONFLICT_LABEL_TEMPLATES[uiLanguage()], `${os.hostname()} (CLI)`, new Date())
}

/**
 * Before the local folder '<dir>' is overwritten wholesale by the remote
 * version (Cloud pull; GitHub push that found the note changed there): keeps
 * its LOCAL version as a conflict copy when a candidate file under it — a
 * pending upload (Cloud), a file changed since its base (GitHub) — differs from
 * what the remote version leaves (`server`: relPath → content after the apply).
 * Returns { dir, title, relPaths } of the copy written to disk, or null. Throws
 * if the copy can't be written (the caller must not overwrite the folder).
 */
function preserveConflictCopy(dir, pending, server) {
  const candidates = (Array.isArray(pending) ? pending : []).filter(p => typeof p === 'string' && p.startsWith(`${dir}/`))
  if (!candidates.length) return null
  const local = {}
  for (const rel of candidates) {
    try { local[rel] = fs.readFileSync(path.join(NOTES_DIR, rel), 'utf-8') } catch { local[rel] = null }
  }
  if (!planConflictCopy(candidates, local, server)) return null
  return writeConflictCopyDir(dir)
}

/**
 * Writes the conflict copy of the local folder '<dir>' — whole, or only the
 * sections `onlySections` (filenames; Cloud three-way pull) — as a new note
 * folder. Returns { dir, title, relPaths }; throws if it can't be written
 * (nothing is left half-written; the caller must not touch the folder).
 */
function writeConflictCopyDir(dir, onlySections) {
  const localDirPath = path.join(NOTES_DIR, dir)
  const localFiles = {}
  for (const f of fs.readdirSync(localDirPath)) {
    if (f.endsWith('.md')) localFiles[f] = fs.readFileSync(path.join(localDirPath, f), 'utf-8')
  }
  const now = new Date()
  const title = conflictCopyTitle(anchorTitle(localFiles[NOTE_MD] || ''), conflictCopyLabel(), now)
  let copy
  do {
    copy = buildConflictCopy(localFiles, { newId: nanoid(8), title, nowIso: now.toISOString(), onlySections })
  } while (fs.existsSync(path.join(NOTES_DIR, copy.dir)))
  const copyPath = path.join(NOTES_DIR, copy.dir)
  let created = false
  try {
    fs.mkdirSync(copyPath) // not recursive: never writes into a folder that appeared meanwhile
    created = true
    for (const [name, content] of Object.entries(copy.files)) fs.writeFileSync(path.join(copyPath, name), content, 'utf-8')
  } catch (e) {
    if (created) { try { fs.rmSync(copyPath, { recursive: true, force: true }) } catch { /* best effort */ } }
    throw e
  }
  return { dir: copy.dir, title, relPaths: Object.keys(copy.files).map(f => `${copy.dir}/${f}`) }
}

// ── Cloud: note.md frontmatter as text blocks ─────────────────────────────────
// The CLI has no YAML library, but the three-way pull must edit a note.md
// frontmatter structurally (re-list sections, OR aiHidden/favorited, unite
// tags). It is handled as TOP-LEVEL BLOCKS of text — a `key:` line plus its
// indented continuation lines — which is how js-yaml (the app) and
// serializeNoteMd (the CLI) write it. Untouched blocks keep their exact text;
// rewritten ones are emitted as YAML that js-yaml reads back to the same data
// the app's mergeAnchors produces (parity pinned in tests/cli/cloudThreeWay.test.ts).
// Whatever this reader does not understand (duplicate keys, a non-key line at
// column 0, a flow-style sections list) is UNREADABLE — like a YAML parse
// error in the app (an unreadable anchor in conflict → whole-folder copy).

/** Mirror of splitFrontmatter in electron/noteFormat.ts (incl. a closing '---' at EOF); null = no frontmatter. */
function splitAnchorFrontmatter(content) {
  const s = content.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!s.startsWith('---\n')) return null
  const end = s.indexOf('\n---\n', 4)
  if (end === -1) return s.endsWith('\n---') ? { frontmatter: s.slice(4, -4), body: '' } : null
  return { frontmatter: s.slice(4, end), body: s.slice(end + 5) }
}

const FM_KEY_RE = /^([A-Za-z_][\w-]*):(.*)$/
const YAML_TRUE_RE = /^(true|True|TRUE)$/
const YAML_NULL_RE = /^(|~|null|Null|NULL)$/

/** note.md → { blocks: [{ key, inline, lines }], body } or null (no / unreadable frontmatter). */
function parseAnchorFm(content) {
  const split = splitAnchorFrontmatter(content)
  if (!split || !split.frontmatter) return null
  const blocks = []
  const keys = new Set()
  for (const line of split.frontmatter.split('\n')) {
    const m = line.match(FM_KEY_RE)
    if (m && (m[2] === '' || /^\s/.test(m[2]))) {
      if (keys.has(m[1])) return null // duplicate key: js-yaml rejects the document
      keys.add(m[1])
      blocks.push({ key: m[1], inline: m[2].trim(), lines: [line] })
      continue
    }
    const blank = line.trim() === '' || line.startsWith('#')
    if (blank || /^\s/.test(line) || line === '-' || line.startsWith('- ')) {
      if (blocks.length === 0) { if (blank) continue; return null }
      blocks[blocks.length - 1].lines.push(line)
      continue
    }
    return null
  }
  // The values this reader interprets must read unambiguously — a comment, an
  // unclosed quote or flow content it can't split counts as unreadable (never
  // a silent misread: a wrong `file` would drop a section from a merge).
  for (const b of blocks) {
    if (['favorited', 'pinned', 'encryption'].includes(b.key) && !yamlInlineReadable(b.inline)) return null
    if (b.key === 'tags' && fmStringList(b) === undefined) return null
  }
  const sections = blocks.find(b => b.key === 'sections')
  if (sections && parseSectionItems(sections) === undefined) return null
  return { blocks, body: split.body }
}

/**
 * Is this inline YAML value one scalar with nothing after it? False for a
 * ` #` comment outside quotes, an unclosed quoted scalar (it continues on the
 * next lines) or text after the closing quote.
 */
function yamlInlineReadable(raw) {
  const v = raw.trim()
  if (v === '') return true
  if (v[0] === '"' || v[0] === "'") {
    const quote = v[0]
    let i = 1
    for (; i < v.length; i++) {
      if (quote === '"' && v[i] === '\\') { i++; continue }
      if (v[i] === quote) {
        if (quote === "'" && v[i + 1] === "'") { i++; continue }
        break
      }
    }
    return i < v.length && v.slice(i + 1).trim() === ''
  }
  return !/(^|\s)#/.test(v)
}

function fmBlock(fm, key) {
  return fm.blocks.find(b => b.key === key) || null
}

/** Replaces the block `key` in place (keeps its position) or appends it. */
function setFmBlock(blocks, key, lines) {
  const block = { key, inline: lines[0].slice(key.length + 1).trim(), lines }
  const i = blocks.findIndex(b => b.key === key)
  if (i === -1) blocks.push(block)
  else blocks[i] = block
}

function renderAnchorFm(blocks, body) {
  return `---\n${blocks.flatMap(b => b.lines).join('\n')}\n---\n${body}`
}

function fmHasNested(block) {
  return block.lines.slice(1).some(l => l.trim() !== '' && !l.trim().startsWith('#'))
}

/** `key: true` (a YAML boolean true). */
function fmIsTrue(block) {
  return !!block && YAML_TRUE_RE.test(block.inline) && !fmHasNested(block)
}

/** JS truthiness of the block's YAML value (`Boolean(data.encryption)` in the app). */
function fmTruthy(block) {
  if (!block) return false
  if (block.inline === '') return fmHasNested(block)
  return !/^(~|null|Null|NULL|false|False|FALSE|0|""|'')$/.test(block.inline)
}

function fmEncrypted(fm) {
  return fmTruthy(fmBlock(fm, 'encryption'))
}

/** Plain YAML scalars that do NOT load as strings (numbers, booleans, null). */
function yamlPlainNonString(raw) {
  return /^(~|null|Null|NULL|true|True|TRUE|false|False|FALSE|[-+]?\.(inf|Inf|INF)|\.(nan|NaN|NAN))$/.test(raw) ||
    /^[-+]?(\d[\d_]*(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(raw) || /^0x[0-9a-fA-F_]+$/.test(raw) || /^0o[0-7_]+$/.test(raw)
}

/** One flow/block list item as a string, or null when it doesn't load as a string. */
function yamlStringItem(raw) {
  const v = raw.trim()
  if (v === '') return null
  if (v.startsWith('"') || v.startsWith("'")) return yamlScalarValue(v)
  return yamlPlainNonString(v) ? null : v
}

/** Splits the inside of a flow sequence on the commas outside quotes. */
function splitFlowItems(text) {
  const items = []
  let cur = '', quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      cur += ch
      if (quote === '"' && ch === '\\' && i + 1 < text.length) { cur += text[++i]; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === ',') { items.push(cur); cur = ''; continue }
    cur += ch
  }
  items.push(cur)
  return items
}

/**
 * The string items of a list block (`stringArray` in the app); null when the
 * value is not a list; undefined when unreadable (a flow list that doesn't
 * close on its line, nested flow items, comments, nested block content).
 */
function fmStringList(block) {
  if (!block) return null
  const inline = block.inline
  if (inline.startsWith('[')) {
    if (!inline.endsWith(']') || fmHasNested(block)) return undefined
    const items = splitFlowItems(inline.slice(1, -1))
    if (items.some(it => /^[[{]/.test(it.trim()) || !yamlInlineReadable(it))) return undefined
    return items.map(yamlStringItem).filter(v => v !== null)
  }
  if (!yamlInlineReadable(inline)) return undefined
  if (inline !== '') return null
  const rest = block.lines.slice(1).filter(l => l.trim() !== '' && !l.trim().startsWith('#'))
  if (rest.length === 0) return null
  const dash = rest[0].length - rest[0].trimStart().length
  const out = []
  for (const line of rest) {
    const indent = line.length - line.trimStart().length
    if (indent !== dash || line[indent] !== '-') return undefined
    const raw = line.slice(indent + 1)
    if (/^\s*[[{&*!|>]/.test(raw) || !yamlInlineReadable(raw)) return undefined
    const v = yamlStringItem(raw)
    if (v !== null) out.push(v)
  }
  return out
}

/**
 * Items of a `sections:` block: an array of { lines, d, fieldIndent, fields }
 * (fields = raw scalar text of each `key: value` of the item), `null` when the
 * value is not a list (absent / null), `undefined` when unreadable.
 */
function parseSectionItems(block) {
  if (block.cachedItems !== undefined) return block.cachedItems
  const result = (() => {
    const inline = block.inline
    if (inline === '[]') return fmHasNested(block) ? undefined : []
    if (!YAML_NULL_RE.test(inline)) return undefined // flow style / scalar: not written by any NoteFlow client
    const items = []
    let d = -1, cur = null
    for (const line of block.lines.slice(1)) {
      const trimmed = line.trim()
      if (trimmed === '' || (cur === null && trimmed.startsWith('#'))) { if (cur) cur.lines.push(line); continue }
      const indent = line.length - line.trimStart().length
      const isDash = line[indent] === '-' && (line.length === indent + 1 || line[indent + 1] === ' ')
      if (d === -1) {
        if (!isDash) return undefined
        d = indent
      }
      if (isDash && indent === d) { cur = { lines: [line], d }; items.push(cur); continue }
      if (indent <= d) return undefined
      cur.lines.push(line)
    }
    if (items.length === 0) return null
    if (inline !== '') return undefined // `sections: null` followed by items is not YAML
    const finished = items.map(finishSectionItem)
    return finished.some(it => it === undefined) ? undefined : finished
  })()
  block.cachedItems = result
  return result
}

// Fields of a section item the merge interprets: their value must be a plain one-line scalar.
const SECTION_READ_FIELDS = ['id', 'file', 'aiHidden']

/**
 * One `- key: value` item of `sections:` → { …item, fieldIndent, fields }, or
 * undefined when it is not a block mapping this reader can read for sure: a
 * flow / anchored / quoted-key item, a line at field level that is not
 * `key: value`, a repeated field (js-yaml rejects it), or an `id` / `file` /
 * `aiHidden` whose value is not a plain one-line scalar (comment, unclosed
 * quote, block scalar, nested content).
 */
function finishSectionItem(item) {
  const first = item.lines[0]
  const afterDash = first.slice(item.d + 1)
  const pad = afterDash.length - afterDash.trimStart().length
  const next = item.lines.slice(1).find(l => l.trim() !== '' && !l.trim().startsWith('#'))
  const fieldIndent = afterDash.trim() !== '' ? item.d + 1 + pad : next ? next.length - next.trimStart().length : item.d + 2
  const fields = {}
  let lastKey = null
  const take = (text) => {
    const m = text.match(/^([A-Za-z_][\w-]*):(?:[ \t]+(.*))?$/)
    if (!m || m[1] in fields) return false
    const value = (m[2] || '').trim()
    if (SECTION_READ_FIELDS.includes(m[1]) && (/^[[{&*!|>]/.test(value) || !yamlInlineReadable(value))) return false
    fields[m[1]] = value
    lastKey = m[1]
    return true
  }
  if (afterDash.trim() !== '' && !take(afterDash.trim())) return undefined
  for (const line of item.lines.slice(1)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const indent = line.length - line.trimStart().length
    if (indent === fieldIndent) {
      if (!take(trimmed)) return undefined
    } else if (indent < fieldIndent || SECTION_READ_FIELDS.includes(lastKey)) {
      return undefined // misaligned, or nested content under a field the merge reads
    }
  }
  return { ...item, fieldIndent, fields }
}

/** The file a sections[] item points at (fallback '<id>.md'), or null. Mirror of sectionFileOf. */
function sectionItemFile(item) {
  const { file, id } = item.fields
  if (file !== undefined && !YAML_NULL_RE.test(file)) return yamlScalarValue(file)
  if (id !== undefined && !YAML_NULL_RE.test(id)) return `${yamlScalarValue(id)}.md`
  return null
}

function sectionItemHidden(item) {
  return item.fields.aiHidden !== undefined && YAML_TRUE_RE.test(item.fields.aiHidden)
}

/** The item with `aiHidden: true` (replacing an existing `aiHidden:` field, or appended). */
function withSectionHidden(item) {
  const lines = [...item.lines]
  const fieldLine = `${' '.repeat(item.fieldIndent)}aiHidden: true`
  const i = lines.findIndex((l, n) => n > 0 && l.length - l.trimStart().length === item.fieldIndent && /^aiHidden:/.test(l.trim()))
  if (i !== -1) {
    lines[i] = fieldLine
  } else {
    let at = lines.length
    while (at > 1 && lines[at - 1].trim() === '') at--
    lines.splice(at, 0, fieldLine)
  }
  return { ...item, lines, fields: { ...item.fields, aiHidden: 'true' } }
}

/** `sections:` block lines for these items, re-indented to the js-yaml layout ('  - '). */
function renderSectionItems(items) {
  if (items.length === 0) return ['sections: []']
  const out = ['sections:']
  for (const item of items) {
    for (const line of item.lines) out.push(line.trim() === '' ? '' : `  ${line.slice(item.d)}`)
  }
  return out
}

/** Sections list of a parsed note.md (null = not a list). */
function fmSectionItems(fm) {
  const block = fmBlock(fm, 'sections')
  return block ? parseSectionItems(block) : null
}

// ── Cloud: three-way reconcile per file (mirror of electron/cloudSyncLogic.ts) ─
// The pull used to decide a note folder by note.md's `updated:` alone (LWW): a
// device that edited one section offline after missing a remote edit of
// another kept its whole folder ("newer") and the conditional upload clobbered
// the remote section everywhere (reproduced in production, 2026-11-03). Every
// client now remembers, per file, its BASE — the server seq it last reconciled
// + a hash of that content (the CLI keeps them in cli-cloud-state.json, see
// cliCloudBase) — and the pull compares base / local / remote PER FILE. Uploads
// carry the base seq (cloud_upsert_file_v2, migration 0014). No base known →
// the historical rules, unchanged. Pure mirrors — parity pinned in
// tests/cli/cloudThreeWay.test.ts against the app's TypeScript.

/** RPC of migration 0014 (compare-and-swap on the file's base seq). Mirror of CLOUD_BASE_UPSERT_RPC. */
const CLOUD_BASE_UPSERT_RPC = 'cloud_upsert_file_v2'
/** Base hash of a remote TOMBSTONE a local edit is kept over. Mirror of TOMBSTONE_BASE_HASH. */
const TOMBSTONE_BASE_HASH = ''
/** Hash of a synthesized base whose content is unknown (never equals a real hash). Mirror of UNKNOWN_BASE_HASH. */
const UNKNOWN_BASE_HASH = 'unknown'

/** sha-256 (hex) of a note file for its base; note.md WITHOUT its `updated:` line. Mirror of hashForBase. */
function hashForBase(relPath, content) {
  const text = isAnchorPath(relPath) ? anchorWithoutUpdated(content) : content
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Pure mirror of classifyBaseUpsert: outcome of `POST rpc/cloud_upsert_file_v2`
 * → { outcome: 'uploaded' | 'stale' | 'missing' | 'forbidden' | 'error', seq }.
 * The function answers the new seq, or JSON null when stale.
 */
function classifyBaseUpsert(status, json) {
  const code = json && typeof json === 'object' ? json.code : undefined
  if (status === 404 || code === 'PGRST202') return { outcome: 'missing', seq: null }
  if (status === 403) return { outcome: 'forbidden', seq: null }
  if (status >= 400) return { outcome: 'error', seq: null }
  if (json === null || json === undefined) return { outcome: 'stale', seq: null }
  return { outcome: 'uploaded', seq: parseRowSeq(json) }
}

/** Pure mirror of planFileReconcile: what the pull does with ONE remote row of a file, given its base. */
function planFileReconcile(s) {
  if (!s.base || s.remoteSeq === null) return 'legacy'
  if (s.remoteSeq < s.base.seq) return 'outdated'
  if (s.remoteSeq === s.base.seq) return 'keep'
  const localChanged = s.pending || s.localHash !== s.base.hash
  if (!localChanged) return 'apply'
  if (s.localHash === s.remoteHash) return 'adopt'
  if (s.remoteHash === null) return 'keep-local'
  if (s.localHash === null) return 'apply' // deleted here, edited remotely: the remote edit wins
  return 'conflict'
}

function anchorHashOf(content) {
  return createHash('sha256').update(anchorWithoutUpdated(content), 'utf8').digest('hex')
}

function updatedMsOf(content) {
  return parseUpdatedTimestamp(extractUpdatedTimestamp(content))
}

/** `content` with the value of its first top-level `updated:` line replaced. Mirror of withUpdated. */
function withUpdated(content, value) {
  return content.replace(/^updated:[^\r\n]*/m, `updated: ${JSON.stringify(value)}`)
}

/** Mirror of anchorsNeedWholeCopy: two changed anchors that can't be merged (encrypted / unreadable). */
function anchorsNeedWholeCopy(local, remote, baseHash) {
  const lh = anchorHashOf(local)
  const rh = anchorHashOf(remote)
  if (lh === rh || lh === baseHash || rh === baseHash) return false
  const l = parseAnchorFm(local)
  const r = parseAnchorFm(remote)
  return !l || !r || fmEncrypted(l) || fmEncrypted(r)
}

/**
 * Pure mirror of mergeAnchors (electron/cloudSyncLogic.ts): frontmatter merge
 * of note.md compared WITHOUT `updated:` against the base hash — same rules
 * (one side changed → that side; both → the remote frontmatter + the local-only
 * sections whose file exists here, minus the remote-only ones deleted here
 * since the base; `aiHidden` per section and `favorited` OR-ed, `tags` united,
 * `updated` = now; encrypted/unreadable → 'whole'), and in every case the
 * sections whose local change is kept stay listed. Textual instead of a YAML
 * re-dump: the result loads (js-yaml) to the same data as the app's.
 * `m` = { local, remote, baseHash, sectionFilesOnDisk, knownSectionFiles,
 * folderKeepsLocalChanges, keptLocalSectionFiles, restoredRemoteSectionFiles?, nowIso }.
 */
function mergeAnchors(m) {
  const chosen = chooseAnchor(m)
  return chosen.source === 'whole' ? chosen : withKeptLocalSections(chosen, m)
}

function chooseAnchor(m) {
  const lh = anchorHashOf(m.local)
  const rh = anchorHashOf(m.remote)
  const localMs = updatedMsOf(m.local)
  const remoteMs = updatedMsOf(m.remote)
  const bumpToLocal = m.folderKeepsLocalChanges && localMs !== null && (remoteMs === null || localMs > remoteMs)

  if (lh === rh) return bumpToLocal ? { content: m.local, source: 'local' } : { content: m.remote, source: 'remote' }
  if (lh === m.baseHash) {
    if (!bumpToLocal) return { content: m.remote, source: 'remote' }
    const content = withUpdated(m.remote, extractUpdatedTimestamp(m.local) || m.nowIso)
    return content === m.remote ? { content, source: 'remote' } : { content, source: 'merged' }
  }
  if (rh === m.baseHash) {
    // Only the local changed — never move the server's `updated` backwards.
    if (remoteMs !== null && (localMs === null || remoteMs >= localMs)) {
      const content = withUpdated(m.local, m.nowIso)
      return content === m.local ? { content, source: 'local' } : { content, source: 'merged' }
    }
    return { content: m.local, source: 'local' }
  }

  const l = parseAnchorFm(m.local)
  const r = parseAnchorFm(m.remote)
  if (!l || !r || fmEncrypted(l) || fmEncrypted(r)) return { content: m.remote, source: 'whole' }
  const remoteItems = fmSectionItems(r) || []
  const localItems = fmSectionItems(l) || []
  const localByFile = new Map()
  for (const item of localItems) {
    const file = sectionItemFile(item)
    if (file !== null) localByFile.set(file, item)
  }
  const remoteListed = new Set(remoteItems.map(sectionItemFile).filter(f => f !== null))
  const kept = remoteItems
    .filter(item => {
      const file = sectionItemFile(item)
      if (file === null || localByFile.has(file) || m.sectionFilesOnDisk.has(file)) return true
      // Listed only remotely and missing here: deleted on this device since the
      // base when it was known; otherwise added remotely.
      return !m.knownSectionFiles.has(file)
    })
    .map(item => {
      // Hidden from the AI on EITHER side stays hidden.
      const file = sectionItemFile(item)
      const mine = file === null ? undefined : localByFile.get(file)
      return mine && sectionItemHidden(mine) && !sectionItemHidden(item) ? withSectionHidden(item) : item
    })
  const added = localItems.filter(item => {
    const file = sectionItemFile(item)
    return file !== null && !remoteListed.has(file) && m.sectionFilesOnDisk.has(file)
  })
  const blocks = [...r.blocks]
  setFmBlock(blocks, 'sections', renderSectionItems([...kept, ...added]))
  setFmBlock(blocks, 'updated', [`updated: ${JSON.stringify(m.nowIso)}`])
  const rTags = fmStringList(fmBlock(r, 'tags'))
  const lTags = fmStringList(fmBlock(l, 'tags'))
  if (rTags !== null || lTags !== null) {
    const tags = [...new Set([...(rTags || []), ...(lTags || [])])]
    setFmBlock(blocks, 'tags', [`tags: [${tags.map(t => JSON.stringify(t)).join(', ')}]`])
  }
  if (fmIsTrue(fmBlock(l, 'favorited')) || fmIsTrue(fmBlock(l, 'pinned'))) setFmBlock(blocks, 'favorited', ['favorited: true'])
  return { content: renderAnchorFm(blocks, r.body), source: 'merged' }
}

/** Mirror of withKeptLocalSections: kept local / restored remote sections stay listed in whatever anchor won. */
function withKeptLocalSections(chosen, m) {
  const restored = m.restoredRemoteSectionFiles || new Set()
  if (m.keptLocalSectionFiles.size === 0 && restored.size === 0) return chosen
  const fm = parseAnchorFm(chosen.content)
  if (!fm || fmEncrypted(fm)) return chosen
  const items = fmSectionItems(fm) || []
  const listed = new Set(items.map(sectionItemFile).filter(f => f !== null))
  const extras = []
  for (const [side, files] of [[m.local, m.keptLocalSectionFiles], [m.remote, restored]]) {
    if (files.size === 0) continue
    const other = parseAnchorFm(side)
    const otherItems = other ? fmSectionItems(other) : null
    if (!otherItems) continue
    for (const item of otherItems) {
      const file = sectionItemFile(item)
      if (file === null || listed.has(file) || !files.has(file)) continue
      listed.add(file)
      extras.push(item)
    }
  }
  if (extras.length === 0) return chosen
  const blocks = [...fm.blocks]
  setFmBlock(blocks, 'sections', renderSectionItems([...items, ...extras]))
  setFmBlock(blocks, 'updated', [`updated: ${JSON.stringify(m.nowIso)}`])
  return { content: renderAnchorFm(blocks, fm.body), source: 'merged' }
}

/**
 * Mirror of relistAnchorSections: `anchor` with the `sections` entries of
 * `from` whose file is in `files` and that `anchor` does not list appended
 * (`updated` = nowIso; unchanged when none) — null when either anchor is
 * unreadable or encrypted.
 */
function relistAnchorSections(anchor, from, files, nowIso) {
  const fm = parseAnchorFm(anchor)
  const src = parseAnchorFm(from)
  if (!fm || !src || fmEncrypted(fm) || fmEncrypted(src)) return null
  const items = fmSectionItems(fm) || []
  const listed = new Set(items.map(sectionItemFile).filter(f => f !== null))
  const extras = []
  for (const item of fmSectionItems(src) || []) {
    const file = sectionItemFile(item)
    if (file === null || listed.has(file) || !files.has(file)) continue
    listed.add(file)
    extras.push(item)
  }
  if (extras.length === 0) return anchor
  const blocks = [...fm.blocks]
  setFmBlock(blocks, 'sections', renderSectionItems([...items, ...extras]))
  setFmBlock(blocks, 'updated', [`updated: ${JSON.stringify(nowIso)}`])
  return renderAnchorFm(blocks, fm.body)
}

/** Mirror of planLegacySection: the historical per-section rule (no base). */
function planLegacySection(row, local, pending, localUpdatedMs) {
  if (row.content === null) {
    if (local === null) return 'adopt' // already gone
    if (pending) return 'keep-local'
    return shouldApplyRemoteSection(row.updatedAtMs, localUpdatedMs) ? 'apply' : 'keep'
  }
  if (local === null) return 'apply' // missing here: nothing local to lose
  if (local === row.content) return 'adopt'
  if (!shouldApplyRemoteSection(row.updatedAtMs, localUpdatedMs)) return 'keep'
  return pending ? 'conflict' : 'apply'
}

// ── Cloud: line merge of a section both sides changed ─────────────────────────
// Pure mirror of mergeSectionText (electron/cloudSyncLogic.ts): a section file
// changed here AND remotely since its base is merged line by line — diff3
// against the base content (cli-cloud-base-content/, see readCliBaseContent)
// when known, a two-way union otherwise — instead of a conflict copy;
// overlapping, different edits keep both versions in the note between markers.

/** Mirror of DEFAULT_SECTION_CONFLICT_LABELS (rendered as `> <text>`; device-neutral fallback). */
const DEFAULT_SECTION_CONFLICT_LABELS = {
  local: '⚠️ Sync conflict — version from the merging device:',
  remote: '⚠️ Sync conflict — version already synced:',
  end: '⚠️ End of sync conflict',
}
/** Mirrors of SECTION_CONFLICT_LABEL_TEMPLATES_EN and electron/i18n.ts sync.conflictMarkers (es). */
const SECTION_CONFLICT_LABEL_TEMPLATES = {
  en: {
    local: '⚠️ Sync conflict ({time}) — version from {device}:',
    remote: '⚠️ Sync conflict — version already synced:',
    end: '⚠️ End of sync conflict',
  },
  es: {
    local: '⚠️ Conflicto de sincronización ({time}) — versión de {device}:',
    remote: '⚠️ Conflicto de sincronización — versión ya sincronizada:',
    end: '⚠️ Fin del conflicto de sincronización',
  },
}

/** Pure mirror of sectionConflictLabels: the markers of a merge made on `device` at `now` (local time). */
function sectionConflictLabels(templates, device, now) {
  const p = n => String(n).padStart(2, '0')
  const time = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`
  const name = String(device || '').trim() || '?'
  const fill = t => t.replace(/\{time\}/g, time).replace(/\{device\}/g, () => name)
  return { local: fill(templates.local), remote: fill(templates.remote), end: fill(templates.end) }
}
const MERGE_MAX_EDIT_DISTANCE = 1500

function splitMergeLines(text) {
  if (text === '') return { lines: [], eol: null, finalNewline: false }
  const eol = text.includes('\r\n') ? '\r\n' : text.includes('\n') ? '\n' : null
  const lines = text.split(/\r?\n/)
  const finalNewline = lines[lines.length - 1] === ''
  if (finalNewline) lines.pop()
  return { lines, eol, finalNewline }
}

/** Myers diff of the middle (no common prefix/suffix): matched index pairs, ascending. */
function myersMatches(a, b) {
  const n = a.length, m = b.length
  if (n === 0 || m === 0) return []
  const max = n + m
  const off = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace = []
  let found = -1
  for (let d = 0; d <= max && found < 0; d++) {
    if (d > MERGE_MAX_EDIT_DISTANCE) return []
    trace.push(v.slice(off - d - 1, off + d + 2))
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) { x++; y++ }
      v[off + k] = x
      if (x >= n && y >= m) { found = d; break }
    }
  }
  const out = []
  let x = n, y = m
  for (let d = found; d >= 0; d--) {
    const w = trace[d]
    const at = k => w[k + d + 1]
    const k = x - y
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1
    const prevX = at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) { out.push([x - 1, y - 1]); x--; y-- }
    x = prevX
    y = prevY
  }
  return out.reverse()
}

function lineMatches(a, b) {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length, endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const out = []
  for (let i = 0; i < start; i++) out.push([i, i])
  for (const [i, j] of myersMatches(a.slice(start, endA), b.slice(start, endB))) out.push([i + start, j + start])
  for (let i = 0; i < a.length - endA; i++) out.push([endA + i, endB + i])
  return out
}

function sameLines(a, b) {
  return a.length === b.length && a.every((l, i) => l === b[i])
}

// insertsOnly: both sides only added lines there (per the base) → both kept, remote first, no conflict.
function unionPieces(a, b, out, insertsOnly = false) {
  let i = 0, j = 0
  const hunk = (ei, ej) => {
    const la = a.slice(i, ei), lb = b.slice(j, ej)
    if (la.length > 0 && lb.length > 0 && !insertsOnly) {
      out.push({ local: la, remote: lb })
      return
    }
    for (const line of lb) out.push({ line, side: 'remote' })
    for (const line of la) out.push({ line, side: 'local' })
  }
  for (const [x, y] of lineMatches(a, b)) {
    hunk(x, y)
    out.push({ line: a[x], side: 'both' })
    i = x + 1
    j = y + 1
  }
  hunk(a.length, b.length)
}

function diff3Pieces(o, a, b, out) {
  const ma = new Map(lineMatches(o, a))
  const mb = new Map(lineMatches(o, b))
  let io = 0, ia = 0, ib = 0
  const chunk = (eo, ea, eb) => {
    const co = o.slice(io, eo), ca = a.slice(ia, ea), cb = b.slice(ib, eb)
    if (sameLines(ca, co)) for (const line of cb) out.push({ line, side: sameLines(cb, co) ? 'both' : 'remote' })
    else if (sameLines(cb, co)) for (const line of ca) out.push({ line, side: 'local' })
    else if (sameLines(ca, cb)) for (const line of ca) out.push({ line, side: 'both' })
    else unionPieces(ca, cb, out, co.length === 0)
  }
  for (let k = 0; k < o.length; k++) {
    const x = ma.get(k), y = mb.get(k)
    if (x === undefined || y === undefined || x < ia || y < ib) continue
    chunk(k, x, y)
    out.push({ line: o[k], side: 'both' })
    io = k + 1
    ia = x + 1
    ib = y + 1
  }
  chunk(o.length, a.length, b.length)
}

/** Pure mirror of mergeSectionText: → { content, conflicts }. */
function mergeSectionText(base, local, remote, labels = DEFAULT_SECTION_CONFLICT_LABELS) {
  const l = splitMergeLines(local)
  const r = splitMergeLines(remote)
  const o = base === null ? null : splitMergeLines(base)
  const pieces = []
  if (o) diff3Pieces(o.lines, l.lines, r.lines, pieces)
  else unionPieces(l.lines, r.lines, pieces)
  const lines = []
  let conflicts = 0
  let padNext = false
  for (const p of pieces) {
    if ('line' in p) {
      if (padNext && p.line.trim() !== '') lines.push('')
      padNext = false
      lines.push(p.line)
      continue
    }
    conflicts++
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('')
    lines.push(`> ${labels.local}`, '', ...p.local, '', `> ${labels.remote}`, '', ...p.remote, '', `> ${labels.end}`)
    padNext = true
  }
  let finalNewline
  const last = pieces[pieces.length - 1]
  if (o) {
    if (l.finalNewline === o.finalNewline) finalNewline = r.finalNewline
    else if (r.finalNewline === o.finalNewline) finalNewline = l.finalNewline
    else finalNewline = l.finalNewline || r.finalNewline
  } else if (last && 'line' in last && last.side === 'local') {
    finalNewline = l.finalNewline
  } else if (last && 'line' in last && last.side === 'remote') {
    finalNewline = r.finalNewline
  } else {
    finalNewline = l.finalNewline || r.finalNewline
  }
  const eol = r.eol ?? l.eol ?? (o ? o.eol : null) ?? '\n'
  const content = lines.length === 0 ? '' : lines.join(eol) + (finalNewline ? eol : '')
  return { content, conflicts }
}

/** Mirror of anchorLooksEncrypted: an encrypted note's sections are never merged. */
function anchorLooksEncrypted(content) {
  return /^encryption:/m.test(content)
}

/**
 * Pure mirror of planThreeWayDir (electron/cloudSyncLogic.ts): three-way
 * reconcile of ONE local note folder whose anchor has a known base. `input` =
 * { dir, local (relPath → content, must hold note.md), remote ([{ relPath,
 * seq, content (null = tombstone), updatedAtMs }]), bases, pendingUpserts,
 * staleUpserts, copiedUpserts, pendingDeletes (Sets), inFlightHashes?,
 * baseContent? ((relPath, hash) → text | null), conflictLabels?, nowIso }.
 * Returns { writes (sections first, note.md last), removes, bases (null =
 * drop), settle, upload, force, copySections, copyWhole,
 * conflictMarkerSections, baseContents }.
 */
function planThreeWayDir(input) {
  const { dir } = input
  const prefix = `${dir}/`
  const anchorRel = `${dir}/${NOTE_MD}`
  const plan = {
    writes: [], removes: [], bases: {}, settle: [], upload: [], force: [], copySections: [], copyWhole: false,
    conflictMarkerSections: [], baseContents: {},
  }
  const localAnchor = input.local[anchorRel]
  if (localAnchor === undefined) throw new Error('three-way reconcile: the local folder has no note.md')
  const localUpdatedMs = updatedMsOf(localAnchor)
  const fileName = rel => rel.slice(prefix.length)
  const anchorRow = input.remote.find(r => r.relPath === anchorRel && r.content !== null) || null
  // The echo of an upload of this device still waiting for its answer → adopted as the base.
  const echoBase = (rel, row) => {
    const base = input.bases[rel]
    if (row.content === null || row.seq === null || (base && row.seq <= base.seq)) return base
    const hash = hashForBase(rel, row.content)
    if (!input.inFlightHashes || input.inFlightHashes.get(rel) !== hash) return base
    plan.bases[rel] = { seq: row.seq, hash }
    if (rel !== anchorRel) plan.baseContents[rel] = row.content
    return plan.bases[rel]
  }
  const anchorBase = anchorRow ? echoBase(anchorRel, anchorRow) : input.bases[anchorRel]

  // 1. The anchor's verdict first: an unmergeable conflict turns the whole folder remote.
  let anchorAction = 'keep'
  let whole = false
  if (anchorRow) {
    anchorAction = planFileReconcile({
      base: anchorBase,
      localHash: hashForBase(anchorRel, localAnchor),
      pending: input.pendingUpserts.has(anchorRel),
      remoteSeq: anchorRow.seq,
      remoteHash: hashForBase(anchorRel, anchorRow.content),
    })
    whole = anchorAction === 'conflict' && anchorBase !== undefined &&
      anchorsNeedWholeCopy(localAnchor, anchorRow.content, anchorBase.hash)
  }

  // 2. Sections, one file at a time.
  const keptLocal = new Set()
  const restored = new Set()
  const conflicts = []
  const after = new Map() // relPath → content once applied (null = removed)
  const recordBase = (rel, seq, content) => {
    if (content === null) plan.bases[rel] = null
    else if (seq !== null) {
      plan.bases[rel] = { seq, hash: hashForBase(rel, content) }
      if (rel !== anchorRel) plan.baseContents[rel] = content
    }
  }
  // Sections of an encrypted note are never merged — the conflict copy, as before.
  const mergeable = !anchorLooksEncrypted(localAnchor) && !(anchorRow && anchorLooksEncrypted(anchorRow.content))
  const labels = input.conflictLabels || DEFAULT_SECTION_CONFLICT_LABELS
  // The line merge of a section both sides changed, or null → the conflict copy (safety net).
  const mergeSection = (rel, base, local, remote) => {
    if (!mergeable) return null
    try {
      let baseText = null
      if (base && base.hash !== TOMBSTONE_BASE_HASH && base.hash !== UNKNOWN_BASE_HASH && input.baseContent) {
        const text = input.baseContent(rel, base.hash)
        if (typeof text === 'string' && hashForBase(rel, text) === base.hash) baseText = text
      }
      const merged = mergeSectionText(baseText, local, remote, labels)
      if (!merged || typeof merged.content !== 'string' || !Number.isSafeInteger(merged.conflicts) || merged.conflicts < 0) return null
      return merged
    } catch {
      return null
    }
  }
  for (const row of input.remote) {
    const rel = row.relPath
    if (rel === anchorRel || !rel.startsWith(prefix) || input.pendingDeletes.has(rel)) continue
    const local = input.local[rel] ?? null
    const pending = input.pendingUpserts.has(rel)
    const base = echoBase(rel, row)
    let action = planFileReconcile({
      base,
      localHash: local === null ? null : hashForBase(rel, local),
      pending,
      remoteSeq: row.seq,
      remoteHash: row.content === null ? null : hashForBase(rel, row.content),
    })
    if (action === 'legacy') action = planLegacySection(row, local, pending, localUpdatedMs)
    if (whole && action !== 'outdated') action = local === row.content ? 'adopt' : 'apply'
    switch (action) {
      case 'outdated':
        break
      case 'keep': {
        if (local === null) break
        const changed = base ? pending || hashForBase(rel, local) !== base.hash : true
        if (!changed) break
        keptLocal.add(fileName(rel))
        if (input.staleUpserts.has(rel) || (base !== undefined && !pending)) plan.upload.push(rel)
        break
      }
      case 'apply':
        if (row.content === null) {
          if (local !== null) plan.removes.push(rel)
        } else if (local !== row.content) {
          plan.writes.push({ relPath: rel, content: row.content })
          if (local === null) restored.add(fileName(rel))
        }
        after.set(rel, row.content)
        recordBase(rel, row.seq, row.content)
        plan.settle.push(rel)
        break
      case 'adopt':
        after.set(rel, row.content)
        recordBase(rel, row.seq, row.content)
        plan.settle.push(rel)
        break
      case 'keep-local': {
        const tombstoneNewer = shouldApplyRemoteSection(row.updatedAtMs, localUpdatedMs)
        keptLocal.add(fileName(rel))
        if (base !== undefined && row.seq !== null) plan.bases[rel] = { seq: row.seq, hash: TOMBSTONE_BASE_HASH }
        if (tombstoneNewer || base !== undefined || input.staleUpserts.has(rel)) plan.upload.push(rel)
        if (tombstoneNewer) plan.force.push(rel)
        break
      }
      case 'conflict': {
        // Both changed, differently: merged line by line (base = the remote, the
        // result goes up on top of its seq); not mergeable → the conflict copy.
        const remoteText = row.content
        const merged = local === null ? null : mergeSection(rel, base, local, remoteText)
        recordBase(rel, row.seq, remoteText)
        if (merged === null || merged.content === remoteText) {
          if (merged === null) conflicts.push(rel)
          if (local !== remoteText) plan.writes.push({ relPath: rel, content: remoteText })
          after.set(rel, remoteText)
          plan.settle.push(rel)
          break
        }
        if (merged.content !== local) plan.writes.push({ relPath: rel, content: merged.content })
        after.set(rel, merged.content)
        keptLocal.add(fileName(rel))
        plan.upload.push(rel)
        if (merged.conflicts > 0) plan.conflictMarkerSections.push(fileName(rel))
        break
      }
    }
  }

  // Local section edits this batch did not touch are kept too.
  for (const [rel, content] of Object.entries(input.local)) {
    if (rel === anchorRel || !rel.startsWith(prefix) || after.has(rel)) continue
    const base = input.bases[rel]
    if (input.pendingUpserts.has(rel) || (base !== undefined && hashForBase(rel, content) !== base.hash)) {
      keptLocal.add(fileName(rel))
    }
  }

  // 3. The anchor, once the sections are known.
  if (anchorRow && anchorAction !== 'outdated' && anchorAction !== 'keep') {
    const remote = anchorRow.content
    let final
    if (anchorAction === 'legacy' || anchorBase === undefined) {
      final = shouldApplyRemoteDir(updatedMsOf(remote), localUpdatedMs) ? remote : localAnchor
    } else if (whole) {
      final = remote
    } else {
      const onDisk = new Set()
      for (const rel of Object.keys(input.local)) if (rel !== anchorRel && rel.startsWith(prefix)) onDisk.add(fileName(rel))
      for (const [rel, content] of after) {
        if (content === null) onDisk.delete(fileName(rel))
        else onDisk.add(fileName(rel))
      }
      const known = new Set()
      for (const rel of Object.keys(input.bases)) if (rel !== anchorRel && rel.startsWith(prefix)) known.add(fileName(rel))
      final = mergeAnchors({
        local: localAnchor,
        remote,
        baseHash: anchorBase.hash,
        sectionFilesOnDisk: onDisk,
        knownSectionFiles: known,
        folderKeepsLocalChanges: keptLocal.size > 0,
        keptLocalSectionFiles: keptLocal,
        restoredRemoteSectionFiles: restored,
        nowIso: input.nowIso,
      }).content
    }
    const legacy = anchorAction === 'legacy' || anchorBase === undefined
    if (!legacy) recordBase(anchorRel, anchorRow.seq, remote)
    if (final !== localAnchor) plan.writes.push({ relPath: anchorRel, content: final })
    if (final === remote) plan.settle.push(anchorRel)
    else if (!legacy) plan.upload.push(anchorRel)
  } else if (anchorAction === 'keep' && anchorBase !== undefined) {
    const pending = input.pendingUpserts.has(anchorRel)
    if (input.staleUpserts.has(anchorRel) || (!pending && hashForBase(anchorRel, localAnchor) !== anchorBase.hash)) {
      plan.upload.push(anchorRel)
    }
  }

  // 4. Conflict copy.
  if (whole) {
    for (const rel of input.pendingUpserts) if (rel.startsWith(prefix) && !plan.settle.includes(rel)) plan.settle.push(rel)
    plan.upload = []
    plan.force = []
    const pendingUnder = [...input.pendingUpserts].filter(rel => rel.startsWith(prefix))
    plan.copyWhole = !(pendingUnder.length > 0 && pendingUnder.every(rel => input.copiedUpserts.has(rel)))
  } else {
    plan.copySections = conflicts.filter(rel => !input.copiedUpserts.has(rel)).map(fileName)
  }
  return plan
}

/**
 * Pure mirror of planGithubDirMerge (electron/githubMerge.ts): the per-file
 * MERGE of a note folder GitHub held back (githubResolveConflictDir), through
 * the same planner as the Cloud pull (planThreeWayDir, synthetic seqs: 1 =
 * "still the base", 2 = "moved"). `o` = { dir, files: [{ path, base (cached
 * blob sha | undefined), remote ({ sha, content } | null), local (content |
 * null), localSha, baseContent? }], labels?, nowIso }. Returns { writes
 * (sections first, note.md last), removes, copySections (section FILENAMES
 * deleted on GitHub but edited here: the deletion is applied, the local
 * version goes to a copy of only them), conflictMarkerSections, final
 * (relPath → content of every local '.md' once applied) } — or null when it
 * can't be merged (anchor missing on a side, encrypted / unreadable anchor in
 * conflict, a section not mergeable): the historical conflict copy then.
 */
function planGithubDirMerge(o) {
  const anchorRel = `${o.dir}/${NOTE_MD}`
  const prefix = `${o.dir}/`
  const files = o.files.filter(f => f.path.startsWith(prefix) && f.path.endsWith('.md'))
  const anchor = files.find(f => f.path === anchorRel)
  if (!anchor || anchor.local === null || anchor.remote === null) return null

  // Deleted on GitHub, edited here since its base: the deletion wins in the
  // note, the local text goes to a copy (the planner sees it as gone here too).
  const deletedRemotely = files.filter(f =>
    f.path !== anchorRel && f.base !== undefined && f.remote === null && f.local !== null && f.localSha !== f.base)
  const goneHere = new Set(deletedRemotely.map(f => f.path))

  const local = {}
  const bases = {}
  const baseText = new Map()
  const remote = []
  for (const f of files) {
    const localContent = goneHere.has(f.path) ? null : f.local
    if (localContent !== null) local[f.path] = localContent
    if (f.base !== undefined) {
      let hash = UNKNOWN_BASE_HASH
      if (typeof f.baseContent === 'string') {
        hash = hashForBase(f.path, f.baseContent)
        baseText.set(f.path, f.baseContent)
      } else if (f.local !== null && f.localSha === f.base) {
        hash = hashForBase(f.path, f.local)
      } else if (f.remote !== null && f.remote.sha === f.base) {
        hash = hashForBase(f.path, f.remote.content)
      }
      bases[f.path] = { seq: 1, hash }
    } else {
      bases[f.path] = { seq: 1, hash: UNKNOWN_BASE_HASH }
    }
    if (f.remote !== null) {
      const atBase = f.base !== undefined && f.remote.sha === f.base
      remote.push({ relPath: f.path, seq: atBase ? 1 : 2, content: f.remote.content, updatedAtMs: 0 })
    } else if (f.base !== undefined) {
      remote.push({ relPath: f.path, seq: 2, content: null, updatedAtMs: 0 }) // deleted on GitHub
    }
  }

  const plan = planThreeWayDir({
    dir: o.dir,
    local,
    remote,
    bases,
    pendingUpserts: new Set(),
    staleUpserts: new Set(),
    copiedUpserts: new Set(),
    pendingDeletes: new Set(),
    baseContent: (rel, hash) => {
      const text = baseText.get(rel)
      return text !== undefined && hashForBase(rel, text) === hash ? text : null
    },
    conflictLabels: o.labels,
    nowIso: o.nowIso,
  })
  if (plan.copyWhole || plan.copySections.length > 0) return null

  const final = {}
  for (const f of files) if (f.local !== null) final[f.path] = f.local
  const removes = [...plan.removes, ...deletedRemotely.map(f => f.path)]
  for (const rel of removes) delete final[rel]
  for (const w of plan.writes) final[w.relPath] = w.content

  // A section the local note.md lists whose file stays here must stay listed
  // (e.g. deleted on GitHub, edited here and re-created there by this
  // machine's own unconditional PUT before the anchor's merge: "unchanged",
  // and GitHub's anchor does not list it). Unlisted, the next write deletes it.
  let writes = plan.writes
  const onDisk = new Set(Object.keys(final).filter(rel => rel !== anchorRel).map(rel => rel.slice(prefix.length)))
  if (onDisk.size > 0) {
    const relisted = relistAnchorSections(final[anchorRel], anchor.local, onDisk, o.nowIso)
    if (relisted === null) return null // unreadable / encrypted: the conflict copy instead
    if (relisted !== final[anchorRel]) {
      final[anchorRel] = relisted
      writes = [...writes.filter(w => w.relPath !== anchorRel), ...(relisted !== anchor.local ? [{ relPath: anchorRel, content: relisted }] : [])]
    }
  }
  return {
    writes,
    removes,
    copySections: deletedRemotely.map(f => f.path.slice(prefix.length)),
    conflictMarkerSections: plan.conflictMarkerSections,
    final,
  }
}

/** Pure mirror of filesNeedingCatchUp: with a base, only files that differ from it; without, `dirGate`. */
function filesNeedingCatchUp(files, bases, dirGate) {
  const out = []
  for (const f of files) {
    const base = bases[f.relPath]
    if (base ? hashForBase(f.relPath, f.content) !== base.hash : dirGate) out.push(f.relPath)
  }
  return out
}

/**
 * Pure mirror of needsBasesBootstrap: an install that synced before bases
 * existed (pullSeq / legacy cursor / lastSync) and has not bootstrapped yet
 * (`basesBootstrapped`, written with pullSeq) → this pull is the one-time
 * bases bootstrap (full reconcile, every local folder three-way).
 */
function needsBasesBootstrap(c) {
  if (c.basesBootstrapped === true) return false
  const hasPullSeq = typeof c.pullSeq === 'number' && Number.isSafeInteger(c.pullSeq) && c.pullSeq >= 0
  return hasPullSeq || Boolean(c.pullCursor) || Boolean(c.lastSync)
}

/**
 * Pure mirror of synthesizeBootstrapBases: bases of one local folder for the
 * bootstrap pull, for the files without a real base — a row already SEEN
 * (seq <= seenSeq, not in the retry set) → a real base (`seen`, persisted); an
 * unseen row → an ASSUMED base (planner only) just below its seq: unknown
 * content when the file is pending or the folder has unjournaled local edits
 * (note.md not pending but `updated` after lastSync), else the local file's own hash.
 */
function synthesizeBootstrapBases(o) {
  const prefix = `${o.dir}/`
  const anchorRel = `${o.dir}/${NOTE_MD}`
  const seen = {}
  const assumed = {}
  const localAnchor = o.local[anchorRel]
  const localUpdatedMs = localAnchor === undefined ? null : updatedMsOf(localAnchor)
  const unjournaled =
    !o.pendingUpserts.has(anchorRel) && o.lastSyncMs !== null && localUpdatedMs !== null && localUpdatedMs > o.lastSyncMs
  for (const row of o.remote) {
    const rel = row.relPath
    if (!rel.startsWith(prefix) || o.bases[rel] || row.seq === null) continue
    if (o.seenSeq !== null && row.seq <= o.seenSeq && !o.notSeen.has(rel)) {
      if (row.content !== null) seen[rel] = { seq: row.seq, hash: hashForBase(rel, row.content) }
      continue
    }
    const local = o.local[rel]
    const hash = o.pendingUpserts.has(rel) || unjournaled
      ? UNKNOWN_BASE_HASH
      : local === undefined ? TOMBSTONE_BASE_HASH : hashForBase(rel, local)
    assumed[rel] = { seq: row.seq - 1, hash }
  }
  return { seen, assumed }
}

function stringList(value) {
  return Array.isArray(value) ? value.filter(v => typeof v === 'string') : []
}

/** Pure mirror of parseBootstrapPending (cliCloud.basesBootstrapPending; null = none / malformed). */
function parseBootstrapPending(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const dirs = stringList(raw.dirs)
  if (dirs.length === 0) return null
  const num = x => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : null)
  return { seenSeq: num(raw.seenSeq), lastSyncMs: num(raw.lastSyncMs), retryKeys: stringList(raw.retryKeys), dirs }
}

/** Pure mirror of nextBootstrapPending: the folders whose bootstrap reconcile still has to succeed. */
function nextBootstrapPending(prev, pull) {
  if (pull.started) return pull.failed.size > 0 ? { ...pull.started, dirs: [...pull.failed] } : null
  if (!prev) return null
  const dirs = prev.dirs.filter(d => !pull.done.has(d))
  return dirs.length > 0 ? { ...prev, dirs } : null
}

/**
 * Applies cliCloudForUser to the persisted state for the signed-in account.
 * Runs before every Cloud pull/reconcile and at login (there with the previous
 * session's userId as `presumedOwner`). Returns true when a cursor/lastSync
 * was actually discarded.
 */
function bindCliCloudToAccount(presumedOwner) {
  const account = getCliAccount()
  if (!account) return false
  const settings = readSettings()
  const c = settings.cliCloud || { enabled: false }
  const next = cliCloudForUser(c, account.userId, presumedOwner)
  if (next === c) return false
  const owner = c.userId || presumedOwner
  settings.cliCloud = next
  writeSettings(settings)
  // Another account's bases would make every upload of this one stale (or worse, match a foreign seq).
  if (owner && owner !== account.userId) clearCliCloudBases()
  else cloudBasesCache = null // owner adopted: re-read under it
  return !!(
    (c.pullSeq !== undefined && next.pullSeq === undefined) ||
    (c.pullCursor && !next.pullCursor) ||
    (c.lastSync && !next.lastSync)
  )
}

// ── Cloud: per-file bases (cli-cloud-state.json) ──────────────────────────────
// relPath → { seq, hash } (see hashForBase): the server seq of the version of
// each note file this CLI last reconciled. Kept OUT of settings.json — it grows
// with the corpus and, on Windows, settings.json is the desktop app's too
// (same choice as cli-github-state.json, and as the app, whose
// bases live in cloud-sync-state.json, apart from its settings). Owned by
// cliCloud.userId: a file written for another account reads as empty.
// Changes are buffered in memory (one invocation may record thousands) and
// written by flushCliCloudBases, which re-reads the file first (another CLI
// process may have written it meanwhile) and applies only this run's changes.

const CLOUD_BASES_PATH = path.join(getSettingsDir(), 'cli-cloud-state.json')
let cloudBasesCache = null // relPath → base, as last read/written
const cloudBaseDelta = new Map() // relPath → base | null (drop), not written yet

function readCloudBasesFile(owner) {
  const out = {}
  try {
    const data = JSON.parse(fs.readFileSync(CLOUD_BASES_PATH, 'utf-8'))
    if (!owner || !data || data.userId !== owner || !data.bases || typeof data.bases !== 'object' || Array.isArray(data.bases)) return out
    for (const [rel, v] of Object.entries(data.bases)) {
      if (v && typeof v === 'object' && typeof v.seq === 'number' && Number.isSafeInteger(v.seq) && v.seq >= 0 &&
          typeof v.hash === 'string') out[rel] = { seq: v.seq, hash: v.hash }
    }
  } catch { /* missing or corrupt — no bases (historical rules) */ }
  return out
}

function loadedCloudBases() {
  if (!cloudBasesCache) cloudBasesCache = readCloudBasesFile(getCliCloud().userId)
  return cloudBasesCache
}

/** Base of a note file, or undefined when unknown. */
function cliCloudBase(relPath) {
  if (cloudBaseDelta.has(relPath)) return cloudBaseDelta.get(relPath) || undefined
  return loadedCloudBases()[relPath]
}

/** Every known base (file + this run's unwritten changes). */
function cliCloudBasesSnapshot() {
  const out = { ...loadedCloudBases() }
  for (const [rel, base] of cloudBaseDelta) {
    if (base) out[rel] = base
    else delete out[rel]
  }
  return out
}

/** Sets (or, with null, drops) a base — buffered until flushCliCloudBases. */
function setCliCloudBase(relPath, base) {
  cloudBaseDelta.set(relPath, base ? { seq: base.seq, hash: base.hash } : null)
}

/** Drops the bases of every file under '<dir>/' (the folder is gone). */
function dropCliCloudBasesUnder(dir) {
  const prefix = `${dir}/`
  for (const rel of Object.keys(cliCloudBasesSnapshot())) if (rel.startsWith(prefix)) cloudBaseDelta.set(rel, null)
}

/** The disk now holds this remote row (written or found identical): its base. A tombstone drops it. */
function recordPulledBase(entry) {
  if (entry.deleted) setCliCloudBase(entry.relPath, null)
  else if (entry.seq !== null && entry.seq !== undefined) {
    storeCliBaseContent(entry.relPath, entry.content)
    setCliCloudBase(entry.relPath, { seq: entry.seq, hash: hashForBase(entry.relPath, entry.content) })
  }
}

/** Writes this run's base changes on top of the file's CURRENT content (tmp + rename). Throws on IO errors. */
function flushCliCloudBases() {
  if (cloudBaseDelta.size === 0) return
  const owner = getCliCloud().userId
  const bases = readCloudBasesFile(owner)
  for (const [rel, base] of cloudBaseDelta) {
    if (base) bases[rel] = base
    else delete bases[rel]
  }
  const dir = path.dirname(CLOUD_BASES_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = `${CLOUD_BASES_PATH}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ userId: owner || null, bases }), { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tmp, CLOUD_BASES_PATH)
  cloudBasesCache = bases
  cloudBaseDelta.clear()
}

/** flushCliCloudBases where a failure must not fail the command (the upload already landed). Returns whether it was saved. */
function flushCliCloudBasesBestEffort() {
  try {
    flushCliCloudBases()
    return true
  } catch (e) {
    console.error(`  Warning: could not save the Cloud sync state (${e.message}) — the next pull re-establishes it`)
    return false
  }
}

/** Account switch: every base belonged to the previous account. */
function clearCliCloudBases() {
  cloudBaseDelta.clear()
  cloudBasesCache = {}
  try { fs.unlinkSync(CLOUD_BASES_PATH) } catch { /* not there */ }
  try { fs.rmSync(CLOUD_BASE_CONTENT_DIR, { recursive: true, force: true }) } catch { /* best effort */ }
}

// ── Cloud: base contents (cli-cloud-base-content/) ────────────────────────────
// The text behind the base hash of each SECTION file, for the line merge of a
// section both sides changed (diff3 — mergeSectionText). Content-addressed:
// one file per hash (sha-256 of the content = hashForBase of a section), next
// to cli-cloud-state.json; mirror of the app's electron/cloudBaseStore.ts. A
// missing / corrupt blob only means "unknown" → two-way union. Pruned at the
// end of a correct pull (blobs no base references), dropped on account switch.

const CLOUD_BASE_CONTENT_DIR = path.join(getSettingsDir(), 'cli-cloud-base-content')
const BASE_BLOB_RE = /^[0-9a-f]{64}$/

function isSectionRelPath(relPath) {
  return noteDirOf(relPath) !== null && !isAnchorPath(relPath)
}

/** A section's base was just recorded with this content: keep the text behind its hash (best effort). */
function storeCliBaseContent(relPath, content) {
  if (!isSectionRelPath(relPath)) return
  const file = path.join(CLOUD_BASE_CONTENT_DIR, createHash('sha256').update(content, 'utf8').digest('hex'))
  try {
    if (fs.existsSync(file)) return
    fs.mkdirSync(CLOUD_BASE_CONTENT_DIR, { recursive: true, mode: 0o700 })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, content, { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tmp, file)
  } catch { /* only the diff3 is lost — the merge falls back to the two-way union */ }
}

/** The content stored under `hash`, or null (unknown, missing or corrupt). */
function readCliBaseContent(hash) {
  if (!BASE_BLOB_RE.test(hash)) return null
  try {
    const content = fs.readFileSync(path.join(CLOUD_BASE_CONTENT_DIR, hash), 'utf-8')
    return createHash('sha256').update(content, 'utf8').digest('hex') === hash ? content : null
  } catch {
    return null
  }
}

/** End of a correct pull: drop the base contents no section base references any more. */
function pruneCliBaseContents() {
  let names
  try { names = fs.readdirSync(CLOUD_BASE_CONTENT_DIR) } catch { return }
  const keep = new Set()
  for (const [rel, base] of Object.entries(cliCloudBasesSnapshot())) if (isSectionRelPath(rel)) keep.add(base.hash)
  for (const name of names) {
    if (BASE_BLOB_RE.test(name) && keep.has(name)) continue
    try { fs.unlinkSync(path.join(CLOUD_BASE_CONTENT_DIR, name)) } catch { /* gone meanwhile */ }
  }
}

/**
 * Note files to upload (of `relPaths`): a pending one (failed / stale / forced)
 * always; one with a base only when its content differs from it (an untouched
 * section must never go up over a newer remote one — filesNeedingCatchUp);
 * one without a base, as before (always). `alwaysAnchor`: note.md goes up
 * regardless (a command's own edit: it carries the new `updated`, like every
 * save of the app). Files gone from disk are skipped.
 */
function cloudFilesToUpload(relPaths, { alwaysAnchor = false } = {}) {
  const pending = getCliCloud().pendingUpserts
  return relPaths.filter(rel => {
    if (!fs.existsSync(path.join(NOTES_DIR, rel))) return false
    if ((alwaysAnchor && isAnchorPath(rel)) || isPendingUpsert(pending, rel)) return true
    const base = cliCloudBase(rel)
    if (!base) return true
    let content
    try { content = fs.readFileSync(path.join(NOTES_DIR, rel), 'utf-8') } catch { return false }
    return filesNeedingCatchUp([{ relPath: rel, content }], { [rel]: base }, true).length > 0
  })
}

/** Cloud takes priority over GitHub whenever the CLI is signed in and Cloud is enabled. */
function cloudActive() {
  return !!(getCliCloud().enabled && getCliAccount())
}

// ── Groups ────────────────────────────────────────────────────────────────────

function readGroups() {
  const p = path.join(NOTES_DIR, 'groups.json')
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
  catch { return [] }
}

function writeGroups(groups) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  fs.writeFileSync(path.join(NOTES_DIR, 'groups.json'), JSON.stringify(groups, null, 2), 'utf-8')
}

function findGroup(nameOrId) {
  const groups = readGroups()
  const q = nameOrId.toLowerCase()
  return groups.find(g => g.id === nameOrId || g.name.toLowerCase() === q || g.name.toLowerCase().includes(q))
}

// ── Folders (single nesting level inside a group: group → folder → note) ───────

function readFolders() {
  const p = path.join(NOTES_DIR, 'folders.json')
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
  catch { return [] }
}

function writeFolders(folders) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  fs.writeFileSync(path.join(NOTES_DIR, 'folders.json'), JSON.stringify(folders, null, 2), 'utf-8')
}

/** Folders matching a name/id, optionally scoped to a group (names repeat across groups). */
function findFolders(nameOrId, groupId) {
  let folders = readFolders()
  if (groupId) folders = folders.filter(f => f.groupId === groupId)
  const q = nameOrId.toLowerCase()
  const exact = folders.filter(f => f.id === nameOrId || f.name.toLowerCase() === q)
  if (exact.length) return exact
  return folders.filter(f => f.name.toLowerCase().includes(q))
}

/** Resolves a single folder, exiting with a helpful error on 0/many matches. --group narrows. */
function resolveFolder(nameOrId, opts) {
  let groupId
  if (opts.group) {
    const g = findGroup(opts.group)
    if (!g) { err(`Group not found: "${opts.group}"`); exit(1) }
    groupId = g.id
  }
  const matches = findFolders(nameOrId, groupId)
  if (!matches.length) { err(`No folder found: "${nameOrId}"`); exit(1) }
  if (matches.length > 1) {
    const groups = readGroups()
    out('  Multiple folders match — narrow with --group:')
    matches.forEach(f => {
      const g = groups.find(gr => gr.id === f.groupId)
      out(`    ${f.name}  (group: ${g ? g.name : '?'})`)
    })
    exit(1)
  }
  return matches[0]
}

/**
 * --group [--folder] of 'add'/'new' → { groupId, folderId? }, or null without
 * --group. Exits 1 on an unknown group, a folder missing from (or ambiguous in)
 * that group, or --folder without --group — callers run it before writing.
 */
function resolveGroupPlacement(opts) {
  if (!opts.group) {
    if (opts.folder) { err('--folder requires --group'); exit(1) }
    return null
  }
  const g = findGroup(opts.group)
  if (!g) { err(`Group not found: "${opts.group}"`); exit(1) }
  if (!opts.folder) return { groupId: g.id }
  const matches = findFolders(opts.folder, g.id)
  if (!matches.length) { err(`Folder "${opts.folder}" not found in group "${g.name}"`); exit(1) }
  if (matches.length > 1) { err(`Multiple folders match "${opts.folder}" in "${g.name}"`); exit(1) }
  return { groupId: g.id, folderId: matches[0].id }
}

// ── YAML parser ───────────────────────────────────────────────────────────────

function splitFrontmatter(raw) {
  // Strip UTF-8 BOM (external editors like Notepad may add it)
  const s = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!s.startsWith('---\n')) return { frontmatter: '', body: s }
  const end = s.indexOf('\n---\n', 4)
  if (end === -1) return { frontmatter: '', body: s }
  return { frontmatter: s.slice(4, end), body: s.slice(end + 5) }
}

function unquote(s) {
  s = s.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1)
  return s
}

function parseNoteYaml(yamlStr) {
  const note = { tags: [], sections: [] }
  const lines = yamlStr.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) { i++; continue }
    const key = m[1], val = m[2].trim()
    if (key === 'encryption') {
      note.encryption = true; i++
      while (i < lines.length && (lines[i].startsWith('  ') || !lines[i].trim())) i++
      continue
    }
    if (key === 'sections') {
      i++; let sec = null
      while (i < lines.length) {
        const sl = lines[i]
        if (!sl.startsWith('  ') && sl.trim()) break
        const itemMatch = sl.match(/^\s+- (\w+):\s*(.*)$/)
        if (itemMatch) {
          if (sec) note.sections.push(sec)
          sec = {}
          if (itemMatch[1] === 'isRawMode') sec.isRawMode = itemMatch[2].trim() === 'true'
          else if (itemMatch[1] === 'aiHidden') sec.aiHidden = itemMatch[2].trim() === 'true'
          else sec[itemMatch[1]] = unquote(itemMatch[2])
          i++; continue
        }
        const propMatch = sl.match(/^\s{4}(\w+):\s*(.*)$/)
        if (propMatch && sec) {
          const pval = propMatch[2].trim()
          const blockMatch = pval.match(/^\|([+-]?)$/)
          if (blockMatch) {
            const chomp = blockMatch[1]; let content = ''; i++
            while (i < lines.length) {
              const cl = lines[i]
              if (cl.trim() === '') { content += '\n'; i++; continue }
              if (cl.match(/^ {6}/)) { content += cl.slice(6) + '\n'; i++; continue }
              break
            }
            if (chomp === '-') content = content.replace(/\n+$/, '')
            else if (chomp !== '+') content = content.replace(/\n+$/, '\n')
            sec[propMatch[1]] = content; continue
          }
          if (propMatch[1] === 'isRawMode') sec.isRawMode = pval === 'true'
          else if (propMatch[1] === 'aiHidden') sec.aiHidden = pval === 'true'
          else sec[propMatch[1]] = unquote(pval)
          i++; continue
        }
        i++
      }
      if (sec) note.sections.push(sec)
      continue
    }
    if (val.startsWith('[')) {
      note[key] = val === '[]' ? [] : val.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean)
    } else if (val === 'true' || val === 'false') {
      note[key] = val === 'true'
    } else {
      note[key] = unquote(val)
    }
    i++
  }
  // tags must always be an array (older notes may carry `tags: ""` or a bare string)
  if (typeof note.tags === 'string')
    note.tags = note.tags.trim() ? note.tags.split(',').map(t => unquote(t.trim())).filter(Boolean) : []
  else if (!Array.isArray(note.tags)) note.tags = []
  return note
}

// ── YAML serializer (format v2: frontmatter-only note.md + section files) ────

function serializeNoteMd(note, opts = {}) {
  let y = ''
  y += `id: ${q(note.id)}\n`
  y += `title: ${q(note.title)}\n`
  y += `tags: [${(note.tags || []).map(q).join(', ')}]\n`
  y += `created: ${q(note.created)}\n`
  y += `updated: ${q(opts.preserveUpdated ? note.updated : new Date().toISOString())}\n`
  y += `formatVersion: ${FORMAT_VERSION}\n`
  y += 'sections:\n'
  for (const s of note.sections) {
    y += `  - id: ${q(s.id)}\n`
    y += `    name: ${q(s.name)}\n`
    y += `    file: ${q(s.id + '.md')}\n`
    if (s.isRawMode) y += '    isRawMode: true\n'
    if (s.aiHidden) y += '    aiHidden: true\n'
    if (s.created) y += `    created: ${q(s.created)}\n`
  }
  if (note.archived)   y += 'archived: true\n'
  if (note.favorited)  y += 'favorited: true\n'
  if (note.group)    y += `group: ${q(note.group)}\n`
  if (note.folder)   y += `folder: ${q(note.folder)}\n`
  return `---\n${y}---\n`
}

// ── Note folder helpers ───────────────────────────────────────────────────────

/** Reads one note directory; returns null if it isn't a note dir or is encrypted. */
function readNoteFolder(dirname) {
  const dirPath = path.join(NOTES_DIR, dirname)
  const anchorPath = path.join(dirPath, NOTE_MD)
  let raw
  try { raw = fs.readFileSync(anchorPath, 'utf-8') } catch { return null }
  const { frontmatter } = splitFrontmatter(raw)
  const note = parseNoteYaml(frontmatter)
  if (note.encryption) return null
  for (const s of note.sections) {
    const file = s.file || `${s.id}.md`
    try { s.content = fs.readFileSync(path.join(dirPath, path.basename(file)), 'utf-8').replace(/\r\n/g, '\n') }
    catch { s.content = '' }
  }
  return { ...note, filePath: dirPath, dirname, raw }
}

function loadAllNotes() {
  if (!fs.existsSync(NOTES_DIR)) return []
  return fs.readdirSync(NOTES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(NOTES_DIR, e.name, NOTE_MD)))
    .map(e => readNoteFolder(e.name))
    .filter(Boolean)
}

/**
 * Writes a note folder: note.md + one '<secId>.md' per section, removing
 * section files that no longer belong. Returns the relative file names written
 * (for sync pushing).
 */
function writeNoteFolder(dirname, note, opts = {}) {
  const dirPath = path.join(NOTES_DIR, dirname)
  fs.mkdirSync(dirPath, { recursive: true })
  const written = []
  const keep = new Set([NOTE_MD])
  fs.writeFileSync(path.join(dirPath, NOTE_MD), serializeNoteMd(note, opts), 'utf-8')
  written.push(NOTE_MD)
  for (const s of note.sections) {
    const file = `${s.id}.md`
    keep.add(file)
    fs.writeFileSync(path.join(dirPath, file), s.content || '', 'utf-8')
    written.push(file)
  }
  for (const f of fs.readdirSync(dirPath)) {
    if (f.endsWith('.md') && !keep.has(f)) {
      try { fs.unlinkSync(path.join(dirPath, f)) } catch { /* ignore */ }
    }
  }
  return written
}

/** Absolute path of a section's markdown file (same resolution readNoteFolder uses). */
function sectionFilePath(note, sec) {
  return path.join(path.resolve(note.filePath), path.basename(sec.file || `${sec.id}.md`))
}

function findNoteByTitle(titleQuery) {
  const notes = loadAllNotes()
  const q = titleQuery.toLowerCase()
  // Exact match first
  const exact = notes.find(n => n.title && n.title.toLowerCase() === q)
  if (exact) return [exact]
  // Partial
  return notes.filter(n => n.title && n.title.toLowerCase().includes(q))
}

function findTodayNote() {
  const today = getTodayTitle()
  const matches = findNoteByTitle(today)
  if (!matches.length) return null
  // Most recently updated
  return matches.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0]
}

function extractUpdatedTimestamp(content) {
  const match = content.match(/^updated:\s*['"]?([^'">\n]+)['"]?\s*$/m)
  return match ? match[1].trim() : null
}

// ── Note / section resolution by name (no opaque ids on the CLI surface) ───────

/** Resolves a single note by (partial) title, exiting with a helpful error on 0/many matches. */
function resolveNote(titleQuery) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); exit(1) }
  failIfAmbiguousNote(matches)
  return matches[0]
}

/** Several (partial) title matches: list them and exit 1 — never pick one. */
function failIfAmbiguousNote(matches) {
  if (matches.length <= 1) return
  out('  Multiple matches — be more specific:')
  matches.forEach(n => out(`    ${n.title}  (${n.dirname}/)`))
  exit(1)
}

function sectionNamesOf(note) {
  return (note.sections || []).map(s => s.name).join(', ') || '(none)'
}

/** A section name may carry a 1-based '#<n>' suffix to pick among same-named duplicates. */
function parseSectionRef(name) {
  const m = name.match(/^(.*)#(\d+)$/)
  if (m) return { baseName: m[1], ordinal: parseInt(m[2], 10) }
  return { baseName: name, ordinal: null }
}

// Filler words dropped before comparing section names loosely (see sectionTokens).
const SECTION_STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'en', 'para', 'con', 'of', 'the', 'a', 'and', 'to'])

/** Section name → set of meaningful tokens (diacritics stripped, lowercased, stopwords dropped). */
function sectionTokens(name) {
  const plain = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return new Set(plain.split(/[^\p{L}\p{N}]+/u).filter(t => t && !SECTION_STOPWORDS.has(t)))
}

/**
 * Sections whose tokens are a superset of the query's — a forgiving last resort
 * for agents that half-remember a name ('Variables de entorno' → 'Variables Entorno').
 * Read-only by design: see the `loose` option of matchSectionOrNull.
 */
function fuzzySectionMatches(sections, name) {
  const wanted = [...sectionTokens(name)]
  if (!wanted.length) return []
  return (sections || []).filter(s => {
    const have = sectionTokens(s.name)
    return wanted.every(t => have.has(t))
  })
}

/**
 * The loose candidates for a section name, in the order matchSectionOrNull tries
 * them: case-insensitive substring hits first and, only when there are none, the
 * token matches of fuzzySectionMatches. Pure: callers decide whether a candidate
 * may be USED (read/path, unique only) or merely SUGGESTED (write commands).
 */
function looseSectionMatches(sections, name) {
  const q = String(name || '').toLowerCase()
  if (!q) return []
  const partial = (sections || []).filter(s => s.name.toLowerCase().includes(q))
  return partial.length ? partial : fuzzySectionMatches(sections, name)
}

/**
 * Finds a section by name. Section names are NOT unique in NoteFlow, so:
 *  - 'Name#2' targets the 2nd section named 'Name' (1-based).
 *  - an exact (case-insensitive) single match wins; multiple exact matches exit
 *    with a '#n' hint.
 *  - with { loose: true }, a last resort: a single loose match wins (substring,
 *    then token words — see looseSectionMatches) and is announced on stderr;
 *    several loose candidates exit as ambiguous.
 * Returns the section or null (no match at all). Ambiguity/out-of-range exit the process.
 *
 * `loose` is opt-in and enabled ONLY by the read-only commands (`read`, `path`):
 * guessing there costs nothing, while 'add'/'set' would overwrite the wrong
 * section ('set Note EN' once clobbered "Comentario": "comentario" contains "en")
 * and 'section rename'/'section delete' would destroy it. Write commands only
 * SUGGEST loose candidates (see similarSectionsNote / resolveSection).
 */
function matchSectionOrNull(note, name, { loose = false } = {}) {
  const { baseName, ordinal } = parseSectionRef(name)
  const q = baseName.toLowerCase()
  const exact = (note.sections || []).filter(s => s.name.toLowerCase() === q)
  if (ordinal != null) {
    if (exact[ordinal - 1]) return exact[ordinal - 1]
    err(`"${baseName}#${ordinal}" out of range in "${note.title}" — there ${exact.length === 1 ? 'is' : 'are'} ${exact.length} section(s) named "${baseName}"`)
    exit(1)
  }
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    err(`Multiple sections named "${baseName}" in "${note.title}". Disambiguate with "${baseName}#1" … "${baseName}#${exact.length}".`)
    exit(1)
  }
  if (loose) {
    const candidates = looseSectionMatches(note.sections, baseName)
    if (candidates.length === 1) {
      // stderr on purpose: stdout of read/path stays verbatim and pipe-safe.
      console.error(`  Note: matched section "${candidates[0].name}"`)
      return candidates[0]
    }
    if (candidates.length > 1) {
      err(`Ambiguous section "${baseName}" in "${note.title}" — matches: ${candidates.map(s => s.name).join(', ')}. Use the exact name.`)
      exit(1)
    }
  }
  return null
}

/**
 * Like matchSectionOrNull but exits when nothing matches (read/path/rename/delete
 * must target an existing section). Without `loose`, the loose candidates are
 * offered as a "Did you mean" hint — never acted upon.
 */
function resolveSection(note, name, opts = {}) {
  const sec = matchSectionOrNull(note, name, opts)
  if (sec) return sec
  const { baseName } = parseSectionRef(name)
  const similar = opts.loose ? [] : looseSectionMatches(note.sections, baseName)
  const hint = similar.length ? ` Did you mean: ${similar.map(s => `"${s.name}"`).join(', ')}?` : ''
  err(`No section "${baseName}" in "${note.title}". Sections: ${sectionNamesOf(note)}.${hint}`)
  exit(1)
}

/** Optimal-string-alignment edit distance: insert/delete/substitute/swap neighbours = 1 edit. */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

/**
 * Section names to offer as "Did you mean" when a write command is given a name
 * with no exact match: the loose candidates first (substring / same words — see
 * looseSectionMatches), then near-misses by spelling ('Improvment' → 'Improvements',
 * 'Urgnet' → 'Urgent'; diacritics and case ignored). Suggestions ONLY — no command
 * acts on them. Unique names, in note order within each tier.
 */
function sectionSuggestions(sections, name) {
  const plain = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const q = plain(name)
  const loose = looseSectionMatches(sections, name).map(s => s.name)
  // Very short queries ('EN') would "match" half the alphabet by spelling.
  const maxEdits = q.length < 3 ? 0 : q.length <= 4 ? 1 : 2
  const typos = maxEdits
    ? (sections || []).map(s => s.name).filter(n => editDistance(q, plain(n)) <= maxEdits)
    : []
  return [...new Set([...loose, ...typos])]
}

/**
 * Exits a write command ('add --section', 'set') whose section has no exact
 * match and no --create: creating on a typo used to leave stray sections behind.
 * Lists the near names first and the existing ones after, so a human or an agent
 * can retry with the right name. With --json the same facts also go to stdout as
 * { error, code, note, section, sections, suggestions } (the CLI's other errors
 * are stderr-only; this one is the agent's self-correction path).
 */
function failUnknownSection(note, baseName, opts) {
  const sections = (note.sections || []).map(s => s.name)
  const suggestions = sectionSuggestions(note.sections, baseName)
  const didYouMean = !suggestions.length ? ''
    : suggestions.length === 1 ? ` Did you mean "${suggestions[0]}"?`
      : ` Did you mean one of: ${suggestions.map(n => `"${n}"`).join(', ')}?`
  const message = `No section named "${baseName}" in "${note.title}".${didYouMean}`
  err(message)
  console.error(`  Existing: ${sectionNamesOf(note)}`)
  console.error('  Use the exact name, or pass --create to create it.')
  if (opts.json) jsonOut({ error: message, code: 'section_not_found', note: note.title, section: baseName, sections, suggestions })
  exit(1)
}

/**
 * stderr line for a write command ('set', 'add --section') that is about to create
 * a section (with --create) while loosely similar ones exist — likely a typo or a
 * half-remembered name. Informational only. Must be computed BEFORE the new
 * section is pushed (it would match itself). Returns '' if none.
 */
function similarSectionsNote(note, baseName, dryRun) {
  const similar = sectionSuggestions(note.sections, baseName)
  if (!similar.length) return ''
  return `  Note: no section named "${baseName}" — ${dryRun ? 'would create' : 'created'} it. Similar existing: ${similar.join(', ')}`
}

/** Raw stdin bytes (decoded by decodeInputBuffer, which also handles UTF-16). */
function readStdin() {
  return new Promise(resolve => {
    const chunks = []
    process.stdin.on('data', c => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)) })
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

/**
 * Pure: bytes with a NUL in most code units of one parity — the shape of
 * UTF-16 text (ASCII-range chars are one byte + one NUL) that no UTF-8 text has.
 */
function looksLikeUtf16(buf) {
  const pairs = Math.floor(Math.min(buf.length, 4096) / 2)
  if (pairs < 2) return false
  let evenNul = 0, oddNul = 0
  for (let i = 0; i < pairs; i++) {
    if (buf[2 * i] === 0) evenNul++
    if (buf[2 * i + 1] === 0) oddNul++
  }
  return Math.max(evenNul, oddNul) / pairs >= 0.3
}

/**
 * Pure: decodes --file / --stdin bytes. UTF-8 by default; a UTF-16 BOM (what
 * PowerShell 5.1's `>` / Out-File write: FF FE) is decoded as such. UTF-16
 * without a BOM can't be told apart reliably → { error } instead of saving
 * garbage. Returns { text } | { error }.
 */
function decodeInputBuffer(buf) {
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return { text: buf.subarray(2).toString('utf16le') }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const body = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1)))
    return { text: body.swap16().toString('utf16le') }
  }
  if (looksLikeUtf16(buf)) {
    return { error: "The content looks like UTF-16 without a byte order mark, which can't be read reliably.\n"
      + '  Pipe it instead (… | noteflow set "<title>" "<section>" --stdin), or save the file as UTF-8\n'
      + "  (PowerShell: … | Out-File -Encoding utf8 <file>, not '>')." }
  }
  return { text: buf.toString('utf-8') }
}

/** Content for `set`/`add`: --text wins, then --file, then stdin (explicit --stdin or a non-TTY pipe). */
async function resolveSetContent(opts) {
  let raw
  let fromStdin = false
  let bytes = null
  if (typeof opts.text === 'string') raw = opts.text
  else if (opts.file) {
    try { bytes = fs.readFileSync(path.resolve(opts.file)) }
    catch (e) { err(`Cannot read --file: ${e.message}`); exit(1) }
  } else if (opts.stdin || !process.stdin.isTTY) { fromStdin = true; bytes = await readStdin() }
  else { err('No content. Provide --text "..." , --file <path>, or pipe content with --stdin'); exit(1) }
  if (bytes) {
    const decoded = decodeInputBuffer(bytes)
    if (decoded.error) { err(decoded.error); exit(1) }
    raw = decoded.text
  }
  // Strip a leading BOM (PowerShell pipes/here-strings add one) and normalize
  // CRLF/CR to LF so piped/echoed input round-trips cleanly.
  const content = raw.replace(/^﻿+/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  // Windows safety net. Two ways to land here with nothing: no content source was
  // given at all (stdin is just not a TTY), or an outdated noteflow.ps1 shim kept
  // stdin for itself in a pipeline, so node saw EOF. 'self-update' only refreshes
  // noteflow.js, so installed shims stay broken — name both causes instead of a
  // bare "no content".
  if (fromStdin && !content && process.platform === 'win32') {
    err('Nothing arrived on stdin.\n'
      + '  Either no content was piped in (pass --text "..." or --file <path>), or the PowerShell\n'
      + '  shim (noteflow.ps1) did not forward the pipe — older shims keep stdin for themselves.\n'
      + '  Workarounds for the latter: write the content to a file and pass --file <path>, or invoke\n'
      + '  the cmd shim explicitly ("text" | noteflow.cmd set ... --stdin). Only reinstalling/updating\n'
      + '  the NoteFlow app refreshes the shims — \'noteflow self-update\' does not.')
    exit(1)
  }
  return content
}

// ── GitHub API ────────────────────────────────────────────────────────────────

function githubRequest(token, method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined
    const req = https.request({
      hostname: 'api.github.com', path: endpoint, method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'NoteFlow-CLI',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        if (res.statusCode === 204) return resolve(null)
        try {
          const json = JSON.parse(raw)
          if (res.statusCode >= 400) reject(Object.assign(new Error(json.message || `HTTP ${res.statusCode}`), { status: res.statusCode }))
          else resolve(json)
        } catch { reject(Object.assign(new Error(`HTTP ${res.statusCode}: unparseable`), { status: res.statusCode })) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')) })
    if (payload) req.write(payload)
    req.end()
  })
}

function githubAuthPost(authPath, params) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(params).toString()
    const req = https.request({
      hostname: 'github.com', path: authPath, method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'NoteFlow-CLI',
      },
    }, (res) => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch { reject(new Error(`Auth request failed: ${raw}`)) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Auth timed out')) })
    req.write(payload)
    req.end()
  })
}

/**
 * Creates the private notes repo only when GitHub says it doesn't exist (404).
 * Any other failure (network, 401, 5xx…) propagates: guessing "missing" there
 * would create a stray repo and point the sync at it.
 */
async function ensureRepo(token, owner, repo) {
  try {
    await githubRequest(token, 'GET', `/repos/${owner}/${repo}`)
  } catch (e) {
    if (e.status !== 404) throw new Error(`Could not check the repo ${owner}/${repo}: ${e.message}`)
    out(`  Creating private repo ${owner}/${repo}...`)
    await githubRequest(token, 'POST', '/user/repos', {
      name: repo, private: true, description: 'NoteFlow notes — auto-synced', auto_init: true,
    })
    await new Promise(r => setTimeout(r, 1500))
  }
}

// Remote paths are notes-dir-relative with forward slashes ('<dir>/<file>.md').
// Each segment must be URL-encoded individually (the separators must survive).
function encodeRemotePath(relPath) {
  return relPath.split('/').map(encodeURIComponent).join('/')
}

async function getDefaultBranch(token, owner, repo) {
  const info = await githubRequest(token, 'GET', `/repos/${owner}/${repo}`)
  return info.default_branch || 'main'
}

/** Recursive blob listing via the Git Trees API (folder-per-note layout). */
async function listRemoteTree(token, owner, repo) {
  const branch = await getDefaultBranch(token, owner, repo)
  const res = await githubRequest(token, 'GET',
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
  return (res.tree || []).filter(t => t.type === 'blob')
}

// ── GitHub: conditional push (mirror of electron/syncState.ts) ────────────────
// The Contents API's `sha` is only a concurrency token: a PUT/DELETE carrying
// the CURRENT sha always lands, so pushing a note another device changed since
// this machine last saw it used to overwrite that change everywhere (QA B3).
// Same three-way check as the desktop app, per note file:
//   B = base: the blob this CLI last reconciled (pulled, or pushed itself) —
//       kept in its OWN cache file next to settings.json (the app's base cache
//       lives in its userData sync-state.json; the two are never shared),
//       keyed by owner/repo and dropped on logout / another repo;
//   R = the blob on GitHub now; L = the blob of the local content.
// Unknown base (no cache yet, first run) = the historical behaviour.
// Only note files ('<dir>/<file>.md') are conditional, and only while the
// desktop app does not have NoteFlow Cloud enabled (GitHub is then its
// write-only mirror and pushes stay unconditional, like the app's).

const GITHUB_BASES_PATH = path.join(getSettingsDir(), 'cli-github-state.json')

/** Git blob sha of a text (sha1("blob <bytes>\0<content>")) — mirror of gitBlobSha (electron/mirrorPlan.ts). */
function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf-8')
  return createHash('sha1').update(`blob ${body.length}\0`, 'utf-8').update(body).digest('hex')
}

/** '<dir>/<file>.md' — the only conditional remote paths. Mirror of isNoteFilePath. */
function isNoteFilePath(relPath) {
  return /^[^/]+\/[^/]+\.md$/.test(relPath)
}

/** Mirror of planConditionalUpsert: 'identical' | 'put' | 'conflict' (remote/local = blob shas, remote null = absent). */
function planConditionalUpsert(base, remote, local) {
  if (remote !== null && remote === local) return 'identical'
  if (remote === null) return 'put'
  if (base === undefined || remote === base) return 'put'
  return 'conflict'
}

/** Mirror of planConditionalDelete: 'gone' | 'delete' | 'conflict'. */
function planConditionalDelete(base, remote) {
  if (remote === null) return 'gone'
  if (base === undefined || remote === base) return 'delete'
  return 'conflict'
}

/** Mirror of remoteDirChangesSinceBase: blobs of a folder whose tree sha moved away from a known base. */
function remoteDirChangesSinceBase(shas, blobs) {
  return blobs.filter(b => shas[b.path] !== undefined && shas[b.path] !== b.sha).map(b => b.path)
}

/**
 * Bases after a pull (pure): a tree blob becomes the base only where the local
 * file now IS that blob (`localShas[path]`, null = absent/unreadable) — the
 * pull skips folders whose local copy is newer, and those keep their previous
 * base so the next push still sees what changed remotely. Bases of paths gone
 * from the (complete) listing are dropped.
 */
function nextPulledBases(prev, blobs, localShas) {
  const next = {}
  for (const b of blobs) {
    if (localShas[b.path] === b.sha) next[b.path] = b.sha
    else if (prev[b.path] !== undefined) next[b.path] = prev[b.path]
  }
  return next
}

/**
 * Local files of a conflicting folder that changed since their base (or have
 * none) — the candidates planConflictCopy compares with the remote version.
 * `localShas`: relPath → blob sha of the local file.
 */
function githubConflictCandidates(shas, localShas) {
  return Object.keys(localShas).filter(rel => localShas[rel] !== null && localShas[rel] !== shas[rel])
}

/** Is the three-way check on? Off while the desktop app has NoteFlow Cloud enabled (same settings.json). */
function githubConditionalActive() {
  const cloud = readSettings().cloudSync
  return !(cloud && cloud.enabled === true)
}

/** The CLI's base shas for the connected repo ({} for no cache / another repo / unreadable file). */
function loadGithubBases(sync) {
  try {
    const data = JSON.parse(fs.readFileSync(GITHUB_BASES_PATH, 'utf-8'))
    if (data && data.owner === sync.owner && data.repo === sync.repo && data.shas && typeof data.shas === 'object') {
      const shas = {}
      for (const [k, v] of Object.entries(data.shas)) if (typeof v === 'string') shas[k] = v
      return shas
    }
  } catch { /* missing or corrupt — no bases (historical behaviour) */ }
  return {}
}

function saveGithubBases(sync, shas) {
  try {
    const dir = path.dirname(GITHUB_BASES_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.writeFileSync(GITHUB_BASES_PATH, JSON.stringify({ owner: sync.owner, repo: sync.repo, shas }), 'utf-8')
  } catch { /* best effort: a lost cache only means "unknown base" next time */ }
}

function clearGithubBases() {
  try { fs.unlinkSync(GITHUB_BASES_PATH) } catch { /* not there */ }
}

/** GET of one remote file: { content, sha } or null (absent / failed). */
async function getRemoteFile(token, owner, repo, relPath) {
  try {
    const f = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`)
    if (typeof f.sha !== 'string' || typeof f.content !== 'string') return null
    return { content: Buffer.from(f.content.replace(/\n/g, ''), 'base64').toString('utf-8'), sha: f.sha }
  } catch { return null }
}

/**
 * Content of a git blob by its sha (GET git/blobs — the base of a line merge),
 * verified against the sha; null when it can't be read (→ two-way union).
 * Mirror of getRemoteBlobContent (electron/githubSync.ts).
 */
async function getRemoteBlobContent(token, owner, repo, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) return null
  try {
    const blob = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/git/blobs/${sha}`)
    if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string') return null
    const content = Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    return gitBlobSha(content) === sha ? content : null
  } catch { return null }
}

/**
 * Uploads one file. Returns 'written' (PUT landed), 'identical' (the remote
 * already holds it — no PUT, no empty commit) or 'conflict' (conditional note
 * file whose remote copy changed since its base — nothing sent). `bases` (the
 * CLI's base cache, updated in place on success) enables the three-way check.
 */
async function upsertRemoteFile(token, owner, repo, relPath, content, bases = null, retrying = false) {
  let sha
  try {
    const existing = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`)
    if (typeof existing.sha === 'string') sha = existing.sha
  } catch { /* new file */ }
  const local = gitBlobSha(content)
  if (sha === local) {
    if (bases) bases[relPath] = local
    return 'identical'
  }
  if (bases && isNoteFilePath(relPath) && githubConditionalActive() &&
      planConditionalUpsert(bases[relPath], sha === undefined ? null : sha, local) === 'conflict') {
    return 'conflict'
  }
  const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m)
  const label = titleMatch ? titleMatch[1].trim() : relPath.replace(/\.md$/, '')
  try {
    await githubRequest(token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`, {
      message: sha ? `update: ${label}` : `add: ${label}`,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    })
  } catch (e) {
    if (!retrying && (e.message.includes('409') || e.message.includes('conflict') || e.message.includes('is at') || e.message.includes('422')))
      return upsertRemoteFile(token, owner, repo, relPath, content, bases, true)
    throw e
  }
  if (bases) bases[relPath] = local
  return 'written'
}

/**
 * Removes one remote file. Returns 'deleted', 'gone' (not there, or the
 * request failed — remote errors are not fatal here, as before) or 'conflict'
 * (conditional note file changed on GitHub since its base — not deleted).
 */
async function removeRemoteFile(token, owner, repo, relPath, message, bases = null) {
  let existing
  try {
    existing = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`)
  } catch { return 'gone' }
  const sha = typeof existing.sha === 'string' ? existing.sha : null
  if (bases && isNoteFilePath(relPath) && githubConditionalActive() &&
      planConditionalDelete(bases[relPath], sha) === 'conflict') {
    return 'conflict'
  }
  try {
    await githubRequest(token, 'DELETE', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`,
      { message: message || `delete: ${relPath}`, sha: existing.sha })
  } catch { return 'gone' /* not there — nothing to do */ }
  if (bases) delete bases[relPath]
  return 'deleted'
}

/**
 * Resolves a note folder whose push was held back (a 'conflict': GitHub's copy
 * changed since its base). Mirror of the desktop app's GitHub conflict path
 * (resolveRemoteDirConflict → mergeGithubConflictDir): the folder is MERGED
 * file by file (githubMergeConflictDir → planGithubDirMerge, the planner and
 * line merge of the Cloud pull) — a section both sides changed is merged line
 * by line (diff3 with the base blob fetched by sha, else a two-way union;
 * overlapping edits keep both versions between ⚠️ markers), note.md's
 * frontmatter with mergeAnchors — and whatever ends different from GitHub goes
 * up through the normal conditional push, on top of the remote shas. Only
 * when it can't be merged (encrypted / unreadable anchor, anchor missing on a
 * side, a local file unreadable, merge failure) the historical path runs: the
 * GitHub version wins the folder and the LOCAL version is kept as a conflict
 * copy when it differs (preserveConflictCopy) — the copy is uploaded right
 * away. Bases of the folder become the remote blobs. Returns { merged,
 * conflictTitle?, copy, uploadFailed } or null when the remote folder could
 * not be read (nothing touched — 'noteflow pull' or the next push retries).
 */
async function githubResolveConflictDir(token, sync, dir, bases) {
  let blobs
  try { blobs = await listRemoteTree(token, sync.owner, sync.repo) } catch { return null }
  const prefix = `${dir}/`
  const remoteBlobs = blobs.filter(b => b.path.startsWith(prefix) && isNoteFilePath(b.path))
  if (!remoteBlobs.some(b => b.path === `${dir}/${NOTE_MD}`)) return null
  const remote = {}
  for (const b of remoteBlobs) {
    const f = await getRemoteFile(token, sync.owner, sync.repo, b.path)
    if (!f) return null
    remote[b.path] = f
  }
  const localDirPath = path.join(NOTES_DIR, dir)
  const localFiles = {} // relPath → content (null = unreadable)
  try {
    for (const f of fs.readdirSync(localDirPath)) {
      if (!f.endsWith('.md')) continue
      try { localFiles[`${dir}/${f}`] = fs.readFileSync(path.join(localDirPath, f), 'utf-8') }
      catch { localFiles[`${dir}/${f}`] = null }
    }
  } catch { /* folder gone locally */ }

  const merged = await githubMergeConflictDir(token, sync, dir, bases, remote, localFiles)
  if (merged) return merged
  // Not mergeable → the historical path: remote folder + conflict copy.

  const localShas = {}
  for (const [rel, content] of Object.entries(localFiles)) localShas[rel] = content === null ? null : gitBlobSha(content)
  const server = {}
  for (const [rel, f] of Object.entries(remote)) server[rel] = f.content
  const copy = preserveConflictCopy(dir, githubConflictCandidates(bases, localShas), server)

  // The remote folder wins (note.md first), local sections it lacks go.
  fs.mkdirSync(localDirPath, { recursive: true })
  const anchorRel = `${dir}/${NOTE_MD}`
  for (const rel of [anchorRel, ...Object.keys(remote).filter(r => r !== anchorRel)]) {
    fs.writeFileSync(path.join(NOTES_DIR, rel), remote[rel].content, 'utf-8')
  }
  for (const lf of fs.readdirSync(localDirPath)) {
    if (lf.endsWith('.md') && lf !== NOTE_MD && !remote[`${dir}/${lf}`]) {
      try { fs.unlinkSync(path.join(localDirPath, lf)) } catch { /* ignore */ }
    }
  }
  for (const rel of Object.keys(bases)) if (rel.startsWith(prefix) && !remote[rel]) delete bases[rel]
  for (const [rel, f] of Object.entries(remote)) bases[rel] = f.sha

  let uploadFailed = false
  if (copy) {
    for (const rel of copy.relPaths) {
      try { await upsertRemoteFile(token, sync.owner, sync.repo, rel, fs.readFileSync(path.join(NOTES_DIR, rel), 'utf-8'), bases) }
      catch { uploadFailed = true }
    }
  }
  return { merged: false, copy, uploadFailed }
}

/**
 * The merge of a conflicting folder (see githubResolveConflictDir), or null
 * when it can't be merged — nothing was touched then. `remote`: relPath →
 * { content, sha } of GitHub's note files; `localFiles`: relPath → local
 * content (null = unreadable → not merged). Executes, like the app's
 * mergeGithubConflictDir: the conflict copy of the sections deleted on GitHub
 * but edited here (only those; throws → the caller's catch, nothing written),
 * local removes and writes (sections, then note.md), the remote blobs as the
 * new bases, then the uploads of whatever ends different from GitHub
 * (sections first, note.md last — the anchor never lists a file GitHub lacks)
 * and the conditional delete of a remote file the merge dropped here.
 */
async function githubMergeConflictDir(token, sync, dir, bases, remote, localFiles) {
  if (Object.values(localFiles).some(c => c === null)) return null
  const prefix = `${dir}/`
  const all = new Set([
    ...Object.keys(remote),
    ...Object.keys(bases).filter(rel => rel.startsWith(prefix) && isNoteFilePath(rel)),
    ...Object.keys(localFiles),
  ])
  const files = []
  for (const rel of all) {
    const local = localFiles[rel] ?? null
    const localSha = local === null ? null : gitBlobSha(local)
    const r = remote[rel] || null
    const base = bases[rel]
    // The base content only for a three-way conflict (diff3); a failed GET = unknown (two-way union).
    let baseContent = null
    if (base !== undefined && r !== null && local !== null && r.sha !== base && localSha !== base && localSha !== r.sha) {
      baseContent = await getRemoteBlobContent(token, sync.owner, sync.repo, base)
    }
    files.push({ path: rel, base, remote: r === null ? null : { sha: r.sha, content: r.content }, local, localSha, baseContent })
  }
  let merge
  try {
    merge = planGithubDirMerge({ dir, files, labels: conflictMarkerLabels(), nowIso: new Date().toISOString() })
  } catch { return null } // safety net: the conflict copy instead
  if (!merge) return null

  const copy = merge.copySections.length > 0 ? writeConflictCopyDir(dir, merge.copySections) : null
  for (const rel of merge.removes) {
    try { fs.unlinkSync(path.join(NOTES_DIR, rel)) } catch { /* already gone */ }
  }
  for (const w of merge.writes) fs.writeFileSync(path.join(NOTES_DIR, w.relPath), w.content, 'utf-8')

  // The remote blobs are the bases now (the merged files go up on top of them).
  const anchorRel = `${prefix}${NOTE_MD}`
  const prevAnchorBase = bases[anchorRel]
  for (const rel of Object.keys(bases)) if (rel.startsWith(prefix) && !remote[rel]) delete bases[rel]
  for (const [rel, f] of Object.entries(remote)) bases[rel] = f.sha

  let uploadFailed = false
  let anchorFailed = false
  const ups = Object.entries(merge.final).filter(([rel, content]) => !remote[rel] || remote[rel].content !== content)
  ups.sort(([a], [b]) => (a === anchorRel ? 1 : b === anchorRel ? -1 : 0))
  for (const [rel, content] of ups) {
    try {
      // 'conflict' = GitHub moved again meanwhile: the next push merges again.
      if ((await upsertRemoteFile(token, sync.owner, sync.repo, rel, content, bases)) === 'conflict') {
        uploadFailed = true
        if (rel === anchorRel) anchorFailed = true
      }
    } catch {
      uploadFailed = true
      if (rel === anchorRel) anchorFailed = true
    }
  }
  // A remote file the merge left deleted here (a local deletion over an
  // unchanged remote file) — only once the merged note.md landed: GitHub's
  // note.md still lists it otherwise. Skipped: the anchor keeps its pre-merge
  // base, so the next push finds it changed on GitHub again and re-merges
  // (deleting it then) instead of a plain PUT that would leave it there.
  const dropped = Object.keys(remote).filter(rel => !(rel in merge.final))
  if (anchorFailed) {
    if (dropped.length > 0 && prevAnchorBase !== undefined) bases[anchorRel] = prevAnchorBase
  } else {
    for (const rel of dropped) {
      if ((await removeRemoteFile(token, sync.owner, sync.repo, rel, `delete: ${rel}`, bases)) === 'conflict') uploadFailed = true
    }
  }
  if (copy) {
    for (const rel of copy.relPaths) {
      try { await upsertRemoteFile(token, sync.owner, sync.repo, rel, fs.readFileSync(path.join(NOTES_DIR, rel), 'utf-8'), bases) }
      catch { uploadFailed = true }
    }
  }
  const anchorContent = merge.final[anchorRel]
  const conflictTitle = merge.conflictMarkerSections.length > 0 && anchorContent !== undefined ? anchorTitle(anchorContent) : undefined
  return { merged: true, conflictTitle, copy, uploadFailed }
}

/** Prints the outcome of githubResolveConflictDir (null = could not resolve). A clean merge prints nothing. */
function reportGithubConflict(dir, res) {
  if (!res) {
    err(`${dir}: changed on GitHub since your last pull — not uploaded. Run 'noteflow pull', then 'noteflow push'`)
    return
  }
  if (res.merged) {
    if (res.conflictTitle !== undefined) {
      out(`  Merged with conflicts: "${res.conflictTitle}" — both versions kept, look for the ⚠️ markers`)
    }
    if (res.copy) out(`  Conflict: local changes kept as "${res.copy.title}"`)
    if (res.uploadFailed) out(`  ${dir}/ was merged here but could not be uploaded yet — run 'noteflow push'`)
    return
  }
  if (res.copy) {
    out(`  Conflict: local changes kept as "${res.copy.title}"`)
    if (res.uploadFailed) out("  The conflict copy could not be uploaded yet — run 'noteflow push'")
  } else {
    out(`  ${dir}/ changed on GitHub — took that version (your local copy had no other changes)`)
  }
}

/**
 * Pushes the given files of a note dir ('<dirname>/<file>') to the active sync
 * backend. Returns { conflicted } — true when GitHub held the note back
 * because it changed there (resolved: merged file by file, or the remote
 * version + a conflict copy — see githubResolveConflictDir).
 */
async function syncPushNoteFiles(dirname, files) {
  if (cloudActive()) {
    // Cloud takes priority: never double-push to GitHub while Cloud is active
    // (mirror of the desktop app's syncProvider routing). Sync errors are
    // reported but never abort the local mutation, which already landed.
    const relPaths = files.map(f => `${dirname}/${f}`)
    const uploaded = [], stale = []
    // What this command changed: note.md always (it carries the new `updated`,
    // like every save of the app), a section only when it differs from its
    // base — writeNoteFolder rewrites EVERY section file, and re-sending an
    // untouched one would clobber a newer remote edit of it.
    let toUpload = []
    try {
      bindCliCloudToAccount() // bases of another account must not decide anything
      toUpload = cloudFilesToUpload(relPaths, { alwaysAnchor: true })
      // Journaled BEFORE any network call: a first reconcile / bases bootstrap
      // pull below then sees this edit as a pending local change (kept, or a
      // conflict copy — never overwritten), and an interrupted upload is
      // retried by `noteflow push`.
      patchCliCloud({ pendingUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().pendingUpserts, toUpload, [])) })
      await cloudEnsureReconciled()
      // That pull may have reconciled (or already re-uploaded) some of them.
      toUpload = cloudFilesToUpload(relPaths, { alwaysAnchor: true })
      const dek = await getCliDek()
      const noteKey = await cloudGetNoteKey(dek, dirname)
      const forced = getCliCloud().forceUpserts
      for (const relPath of toUpload) {
        const force = isPendingUpsert(forced, relPath)
        if ((await cloudPushFile(dek, noteKey, relPath, { force })) === 'stale') stale.push(relPath)
        else uploaded.push(relPath)
      }
      flushCliCloudBasesBestEffort()
      // Bump lastSync like the app's schedulePush: without it a later remote
      // tombstone would be skipped forever (`updated <= lastSync` rule) while
      // the cursor advances past it — and the next push would resurrect the note.
      // A stale (rejected) upload is NOT a sync: no bump, and it stays pending
      // (a local edit the server lacks — the pull's tombstone guards must see it).
      patchCliCloud({
        ...(stale.length ? {} : { lastSync: new Date().toISOString() }),
        pendingUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().pendingUpserts, stale, uploaded)),
        forceUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().forceUpserts, [], uploaded)),
      })
      if (stale.length) out(`  ${stale.length} file(s) ${STALE_UPLOAD_HINT}`)
      else out('  Synced to NoteFlow Cloud')
    } catch (e) {
      flushCliCloudBasesBestEffort() // bases of the uploads that did land
      // Remember what did NOT reach the server: that bump of lastSync by a later
      // successful upload would otherwise expose this edit to a remote tombstone.
      const failed = toUpload.filter(r => !uploaded.includes(r))
      patchCliCloud({
        pendingUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().pendingUpserts, failed, uploaded)),
        forceUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().forceUpserts, [], uploaded)),
      })
      err(`Cloud sync failed: ${e.message} — run 'noteflow push' to retry`)
    }
    return { conflicted: false }
  }
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) return { conflicted: false }
  const token = getToken()
  if (!token) return { conflicted: false }
  const bases = loadGithubBases(sync)
  let conflicted = false
  try {
    for (const f of files) {
      const content = fs.readFileSync(path.join(NOTES_DIR, dirname, f), 'utf-8')
      if ((await upsertRemoteFile(token, sync.owner, sync.repo, `${dirname}/${f}`, content, bases)) === 'conflict') {
        conflicted = true
      }
    }
    if (conflicted) {
      // The note changed on GitHub since this machine last saw it: merge it
      // file by file (or, when it can't be merged, take that version and keep
      // the local one as a conflict copy) — never overwrite.
      const res = await githubResolveConflictDir(token, sync, dirname, bases)
      reportGithubConflict(dirname, res)
      if (res && res.merged && !res.uploadFailed) out('  Synced to GitHub')
    } else {
      out('  Synced to GitHub')
    }
  } catch (e) {
    err(`Sync failed: ${e.message}`)
  }
  saveGithubBases(sync, bases)
  return { conflicted }
}

// ── NoteFlow Cloud: crypto ────────────────────────────────────────────────────
//
// ⚠️ Port of electron/cloudCrypto.ts to plain JS — keep every parameter in sync;
// interoperating with rows the desktop app wrote is the hard requirement here.
// AES-256-GCM sealed blobs: base64url( iv (12 bytes) || ciphertext+tag ). Key
// hierarchy: DEK (master) → per-note key (files.key_ct) → content/path blobs.

const { subtle } = webcrypto
const KEY_BYTES = 32
const IV_BYTES = 12
const PATH_HMAC_INFO = 'noteflow-cloud-path'
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RECOVERY_CODE_LEN = 30 // 6 groups × 5 chars

function toB64Url(bytes) { return Buffer.from(bytes).toString('base64url') }
function fromB64Url(s) { return new Uint8Array(Buffer.from(s, 'base64url')) }

function randomCloudKey() {
  const bytes = new Uint8Array(KEY_BYTES)
  webcrypto.getRandomValues(bytes)
  return bytes
}
const generateDek = randomCloudKey
const generateNoteKey = randomCloudKey

async function importAesKey(raw, usage) {
  if (raw.length !== KEY_BYTES) throw new Error(`expected a ${KEY_BYTES}-byte key, got ${raw.length}`)
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [usage])
}

/** Seals plaintext bytes under an AES-256 key → base64url(iv || ciphertext+tag). */
async function cloudSeal(keyBytes, plaintext) {
  const iv = new Uint8Array(IV_BYTES)
  webcrypto.getRandomValues(iv)
  const key = await importAesKey(keyBytes, 'encrypt')
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  const blob = new Uint8Array(IV_BYTES + ct.length)
  blob.set(iv)
  blob.set(ct, IV_BYTES)
  return toB64Url(blob)
}

/** Opens a sealed blob. Throws on a wrong key or tampered data (GCM tag mismatch). */
async function cloudOpen(keyBytes, sealed) {
  const blob = fromB64Url(sealed)
  if (blob.length <= IV_BYTES) throw new Error('sealed blob too short')
  const key = await importAesKey(keyBytes, 'decrypt')
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, IV_BYTES) }, key, blob.subarray(IV_BYTES))
  return new Uint8Array(plain)
}

async function wrapKey(key, wrappingKey) {
  if (key.length !== KEY_BYTES) throw new Error(`expected a ${KEY_BYTES}-byte key to wrap, got ${key.length}`)
  return cloudSeal(wrappingKey, key)
}

async function unwrapKey(wrapped, wrappingKey) {
  const key = await cloudOpen(wrappingKey, wrapped)
  if (key.length !== KEY_BYTES) throw new Error(`unwrapped key has ${key.length} bytes, expected ${KEY_BYTES}`)
  return key
}

async function encryptContent(noteKey, plaintext) {
  return cloudSeal(noteKey, new TextEncoder().encode(plaintext))
}

async function decryptContent(noteKey, sealed) {
  return new TextDecoder().decode(await cloudOpen(noteKey, sealed))
}

/** PBKDF2-SHA256 passphrase/recovery-code → 256-bit KEK (params mirror the app). */
async function deriveKek(passphrase, salt, iterations) {
  const material = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, KEY_BYTES * 8)
  return new Uint8Array(bits)
}

/** Uppercases and strips anything outside the recovery alphabet (tolerant typing). */
function normalizeRecoveryCode(code) {
  let normalized = ''
  for (const ch of code.toUpperCase()) {
    if (RECOVERY_ALPHABET.includes(ch)) normalized += ch
  }
  return normalized
}

/** A secret is treated as a recovery code only with the EXACT generated length. */
function looksLikeRecoveryCode(input) {
  return normalizeRecoveryCode(input).length === RECOVERY_CODE_LEN
}

/** path_key = base64url(HMAC-SHA256(subkey, relPath)); subkey = HKDF(DEK, info 'noteflow-cloud-path'). */
async function derivePathKeyHmac(dek, relPath) {
  if (dek.length !== KEY_BYTES) throw new Error(`expected a ${KEY_BYTES}-byte DEK, got ${dek.length}`)
  const material = await subtle.importKey('raw', dek, 'HKDF', false, ['deriveBits'])
  const subkeyBits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(PATH_HMAC_INFO) },
    material,
    KEY_BYTES * 8
  )
  const hmacKey = await subtle.importKey('raw', subkeyBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await subtle.sign('HMAC', hmacKey, new TextEncoder().encode(relPath))
  return toB64Url(new Uint8Array(mac))
}

// ── NoteFlow Cloud: row ↔ file mapping (port of electron/cloudSyncLogic.ts) ───

function noteDirOf(relPath) {
  const i = relPath.indexOf('/')
  return i > 0 ? relPath.slice(0, i) : null
}

function isAnchorPath(relPath) {
  const dir = noteDirOf(relPath)
  return dir !== null && relPath === `${dir}/${NOTE_MD}`
}

/** Defense in depth for DECRYPTED remote paths: only '<dir>/<file>.md' or a known root json. */
function isSafeCloudRelPath(relPath) {
  if (!relPath || relPath.includes('\\') || relPath.startsWith('/')) return false
  const parts = relPath.split('/')
  if (parts.some(p => !p || p === '.' || p === '..')) return false
  if (parts.length === 1) return CLOUD_METADATA_FILES.includes(relPath)
  return parts.length === 2 && parts[1].endsWith('.md')
}

/**
 * Section files an anchor (note.md) lists: `sections[].file` (fallback
 * '<id>.md'), deduped; [] for encrypted notes. Only plain one-level '.md'
 * names, never note.md. Mirror of listAnchorSectionFiles in cloudSyncLogic.ts.
 */
function listAnchorSectionFiles(anchorContent) {
  const { frontmatter } = splitFrontmatter(anchorContent)
  if (!frontmatter) return []
  const note = parseNoteYaml(frontmatter)
  if (note.encryption) return []
  const files = []
  for (const sec of note.sections) {
    const name = sec.file != null ? String(sec.file) : sec.id != null ? `${sec.id}.md` : null
    if (name === null || !name.endsWith('.md') || name === NOTE_MD || name.includes('/') ||
        name.includes('\\') || name.startsWith('.') || files.includes(name)) continue
    files.push(name)
  }
  return files
}

function parseUpdatedTimestamp(value) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

// updated_at of a pushed row: anchor → its own frontmatter `updated:`; section
// → the ANCHOR's `updated:` (edits travel as one coherent group in the pull
// window); root json or unparseable frontmatter → nowIso. Mirror of the app.
function resolveRowUpdatedAt(relPath, content, anchorContent, nowIso) {
  const dir = noteDirOf(relPath)
  if (dir === null) return nowIso
  const source = isAnchorPath(relPath) ? content : anchorContent
  const ms = parseUpdatedTimestamp(extractUpdatedTimestamp(source || ''))
  return ms === null ? nowIso : new Date(ms).toISOString()
}

/** Newer remote anchor wins wholesale; missing local = fresh note from another device. */
function shouldApplyRemoteDir(remoteUpdatedMs, localUpdatedMs) {
  if (remoteUpdatedMs === null) return false
  if (localUpdatedMs === null) return true
  return remoteUpdatedMs > localUpdatedMs
}

/** Tombstones delete locally only when the local `updated` is <= lastSync (safety rule). */
function shouldApplyRemoteDeletion(localUpdatedMs, lastSyncMs) {
  if (lastSyncMs === null) return false
  if (localUpdatedMs === null) return false
  return localUpdatedMs <= lastSyncMs
}

/**
 * One remote SECTION row applied on its own (anchor absent from the batch or
 * not newer, local folder exists): sections inherit the `updated:` of their
 * anchor's version, so `>=` = "same version, the section landed later"; a
 * local folder with its own edits has a strictly newer `updated` and wins.
 */
function shouldApplyRemoteSection(sectionUpdatedMs, localUpdatedMs) {
  if (sectionUpdatedMs === null) return false
  if (localUpdatedMs === null) return true
  return sectionUpdatedMs >= localUpdatedMs
}

// Columns every pull/anchor read selects (keep `seq`: it feeds the cursor).
const CLOUD_PULL_COLUMNS = 'path_key,path_ct,content_ct,key_ct,updated_at,deleted,seq'

/**
 * Pull mode: `pullSeq` known → incremental (tombstones included); legacy
 * `pullCursor` or `lastSync` without `pullSeq` → ONE full reconcile from seq 0
 * with tombstones (recovers what the old updated_at cursor skipped); nothing →
 * first sync, live rows only (`deleted=eq.false`). `opts.bootstrapBases` (the
 * one-time bases bootstrap, needsBasesBootstrap) → the full reconcile mode too.
 */
function planPullQuery(c, opts) {
  const hasPullSeq = typeof c.pullSeq === 'number' && Number.isSafeInteger(c.pullSeq) && c.pullSeq >= 0
  if (opts && opts.bootstrapBases && (hasPullSeq || c.pullCursor || c.lastSync)) return { afterSeq: 0, includeDeleted: true }
  if (hasPullSeq) {
    return { afterSeq: c.pullSeq, includeDeleted: true }
  }
  if (c.pullCursor || c.lastSync) return { afterSeq: 0, includeDeleted: true }
  return { afterSeq: 0, includeDeleted: false }
}

/** A row's seq as a safe non-negative integer, or null (bigint may arrive as a string). */
function parseRowSeq(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null
}

// Rows per page of every Cloud listing — PostgREST caps responses (Supabase default max-rows 1000).
const CLOUD_PAGE_SIZE = 1000

/**
 * Reads a WHOLE files listing by KEYSET pagination over `seq` (mirror of
 * collectSeqPages in electron/cloudSyncLogic.ts): `fetchPage(after)` requests
 * `order=seq.asc&seq=gt.<after>&limit=<pageSize>` and resolves with that page
 * or throws. Stops at a short page; a full page that doesn't move the keyset
 * forward throws; a failed page propagates — never act on a partial listing.
 */
async function collectSeqPages(fetchPage, afterSeq, pageSize = CLOUD_PAGE_SIZE, errorLabel = 'Cloud listing failed') {
  const rows = []
  let after = afterSeq
  for (;;) {
    const page = await fetchPage(after)
    rows.push(...page)
    if (page.length < pageSize) return rows
    const last = parseRowSeq(page[page.length - 1].seq)
    if (last === null || last <= after) throw new Error(`${errorLabel} (invalid seq paging)`)
    after = last
  }
}

/**
 * New watermark = max `seq` of ALL fetched rows (undecryptable/unsafe ones
 * too: they never become applicable). Starts at 0 without a watermark.
 */
function nextPullSeq(current, rows) {
  let max = typeof current === 'number' && Number.isSafeInteger(current) && current >= 0 ? current : 0
  for (const row of rows) {
    const seq = parseRowSeq(row.seq)
    if (seq !== null && seq > max) max = seq
  }
  return max
}

// ── Conditional uploads (migration 0011) + pull retry set ──────────────────────
// Ports of electron/cloudSyncLogic.ts — parity pinned in tests/cli/cloudInterop.test.ts.

const CLOUD_CONDITIONAL_UPSERT_RPC = 'cloud_upsert_file'

/**
 * Outcome of `POST /rest/v1/rpc/cloud_upsert_file`: 'uploaded' | 'stale' (the
 * server holds a newer version of the folder — the function returned false) |
 * 'missing' (404 / PGRST202: migration 0011 not deployed → plain upsert) |
 * 'forbidden' (RLS 403) | 'error'.
 */
function classifyConditionalUpsert(status, json) {
  const code = json && typeof json === 'object' ? json.code : undefined
  if (status === 404 || code === 'PGRST202') return 'missing'
  if (status === 403) return 'forbidden'
  if (status >= 400) return 'error'
  return json === false ? 'stale' : 'uploaded'
}

const PULL_RETRY_MAX_DECRYPT_ATTEMPTS = 5
const PULL_RETRY_MAX_APPLY_ATTEMPTS = 50
const PULL_RETRY_CHUNK = 100

/** Tolerant read of cliCloud.pullRetry (path_key → { relPath?, attempts }). */
function parsePullRetry(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, v] of Object.entries(raw)) {
    if (!key || !v || typeof v !== 'object') continue
    const attempts = typeof v.attempts === 'number' && Number.isFinite(v.attempts) && v.attempts >= 0 ? v.attempts : 0
    out[key] = typeof v.relPath === 'string' ? { relPath: v.relPath, attempts } : { attempts }
  }
  return out
}

/** Main fetch + re-fetched retry rows, deduped by path_key (the main fetch wins). */
function mergeRetryRows(mainRows, retryRows) {
  const seen = new Set(mainRows.map(r => r.path_key))
  const out = [...mainRows]
  for (const row of retryRows) {
    if (seen.has(row.path_key)) continue
    seen.add(row.path_key)
    out.push(row)
  }
  return out
}

/**
 * Retry set after a pull, from this pull's failures only (`apply`: Map
 * path_key → relPath; `decrypt`: path_keys). Each kind is dropped once it
 * reaches its max attempts (a permanent error must not stay forever).
 */
function nextPullRetry(prev, failures, maxDecryptAttempts = PULL_RETRY_MAX_DECRYPT_ATTEMPTS,
  maxApplyAttempts = PULL_RETRY_MAX_APPLY_ATTEMPTS) {
  const next = {}
  const decided = new Set()
  for (const [key, relPath] of failures.apply) {
    decided.add(key)
    const attempts = ((prev[key] && prev[key].attempts) || 0) + 1
    if (attempts < maxApplyAttempts) next[key] = { relPath, attempts }
  }
  for (const key of failures.decrypt) {
    if (decided.has(key)) continue
    decided.add(key)
    const attempts = ((prev[key] && prev[key].attempts) || 0) + 1
    if (attempts < maxDecryptAttempts) next[key] = { attempts }
  }
  return next
}

/** How many of this pull's failed rows nextPullRetry gave up on. */
function countDroppedRetries(failures, next) {
  const keys = new Set([...failures.apply.keys(), ...failures.decrypt])
  let dropped = 0
  for (const key of keys) if (!next[key]) dropped++
  return dropped
}

// Root metadata merge — ports of mergeMetadataById / planMetadataPull.
const CLOUD_MERGEABLE_METADATA = ['groups.json', 'folders.json', 'templates.json', 'snippets.json']

function parseIdArray(json) {
  if (json === null) return null
  let data
  try { data = JSON.parse(json) } catch { return null }
  if (!Array.isArray(data)) return null
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string') return null
  }
  return data
}

/** Union by `id` (collisions → `prefer` side, its order first); null when not mergeable. */
function mergeMetadataById(localJson, remoteJson, prefer) {
  const local = parseIdArray(localJson)
  const remote = parseIdArray(remoteJson)
  if (!local || !remote) return null
  const [first, second] = prefer === 'local' ? [local, remote] : [remote, local]
  const ids = new Set()
  const merged = []
  for (const item of [...first, ...second]) {
    if (ids.has(item.id)) continue
    ids.add(item.id)
    merged.push(item)
  }
  return JSON.stringify(merged, null, 2)
}

/**
 * Pull decision for a root metadata file: identical → keep; pending local
 * upload → union preferring local (mergeable) or keep local; first pull →
 * backup + union preferring remote (mergeable) or remote; otherwise remote.
 */
/**
 * Mirror of metadataPendingForPull (electron/cloudSyncLogic.ts): a pending
 * metadata upload is never an "unsynced local edit" on the first reconcile —
 * backup + remote wins / union preferring remote, as documented.
 */
function metadataPendingForPull(pendingUpsert, firstPull) {
  return pendingUpsert && !firstPull
}

function planMetadataPull(relPath, localContent, remoteContent, opts) {
  if (localContent === remoteContent) return { action: 'keep' }
  const backup = opts.firstPull && localContent !== null
  const mergeable = CLOUD_MERGEABLE_METADATA.includes(relPath)
  if (opts.pendingUpsert) {
    if (localContent === null) return { action: 'write', content: remoteContent, backup: false, merged: false }
    const merged = mergeable ? mergeMetadataById(localContent, remoteContent, 'local') : null
    if (merged === null || merged === localContent) return { action: 'keep' }
    return { action: 'write', content: merged, backup, merged: true }
  }
  if (opts.firstPull && localContent !== null && mergeable) {
    const merged = mergeMetadataById(localContent, remoteContent, 'remote')
    if (merged !== null) {
      return merged === localContent ? { action: 'keep' } : { action: 'write', content: merged, backup, merged: true }
    }
  }
  return { action: 'write', content: remoteContent, backup, merged: false }
}

async function buildFileUpsertRow(dek, noteKey, relPath, content, updatedAt, deleted = false) {
  return {
    path_key: await derivePathKeyHmac(dek, relPath),
    path_ct: await encryptContent(noteKey, relPath),
    content_ct: deleted ? '' : await encryptContent(noteKey, content),
    key_ct: await wrapKey(noteKey, dek),
    updated_at: updatedAt,
    deleted,
  }
}

async function decryptFileRow(dek, row) {
  const noteKey = await unwrapKey(row.key_ct, dek)
  const relPath = await decryptContent(noteKey, row.path_ct)
  const content = row.deleted || !row.content_ct ? '' : await decryptContent(noteKey, row.content_ct)
  const updatedAtMs = Date.parse(row.updated_at)
  return {
    relPath,
    content,
    noteKey,
    updatedAt: row.updated_at,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    deleted: row.deleted,
  }
}

// ── NoteFlow Cloud: session + REST ────────────────────────────────────────────

// One access token per invocation: the process lives for seconds and GoTrue
// access tokens last ~1h — no expiry tracking or single-flight needed.
let cloudAccessToken = null

async function supabaseFetch(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  let json = null
  try { json = await res.json() } catch { /* empty body — fine */ }
  return { status: res.status, json }
}

/**
 * Mints an access token from the CLI's persisted refresh token. GoTrue ROTATES
 * the refresh token on every grant — the rotated one is persisted IMMEDIATELY,
 * before the access token is used, so a crash mid-command cannot strand the
 * session on a consumed token. 400/401 = revoked → the session is dropped.
 */
async function getCloudAccessToken() {
  if (cloudAccessToken) return cloudAccessToken
  const account = getCliAccount()
  if (!account) throw new Error('Not signed in to NoteFlow Cloud. Run: noteflow cloud login')
  const refreshToken = Buffer.from(account.refreshToken, 'base64').toString('utf-8')
  const res = await supabaseFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    body: { refresh_token: refreshToken },
  })
  if (res.status === 400 || res.status === 401) {
    clearCliAccount()
    throw new Error('Session expired — run `noteflow cloud login` again.')
  }
  if (res.status >= 400 || !res.json || !res.json.access_token) {
    throw new Error(`Could not refresh the NoteFlow session (HTTP ${res.status})`)
  }
  if (res.json.refresh_token) {
    saveCliAccount({ ...account, refreshToken: Buffer.from(res.json.refresh_token).toString('base64') })
  }
  cloudAccessToken = res.json.access_token
  return cloudAccessToken
}

/** Authenticated PostgREST request against the Supabase project. */
async function cloudRest(endpoint, opts = {}) {
  const token = await getCloudAccessToken()
  return supabaseFetch(`${SUPABASE_URL}${endpoint}`, { ...opts, accessToken: token })
}

/** One retry on network errors / 5xx (upserts are idempotent) — mirror of the app's restWithRetry. */
async function cloudRestWithRetry(fn) {
  try {
    const res = await fn()
    if (res.status >= 500) {
      await new Promise(r => setTimeout(r, 1000))
      return await fn()
    }
    return res
  } catch {
    await new Promise(r => setTimeout(r, 1000))
    return fn()
  }
}

// ── NoteFlow Cloud: DEK per invocation ────────────────────────────────────────

// The DEK lives ONLY in process memory for the duration of one command. It is
// NEVER cached on disk, and neither is the passphrase: in e2ee mode the machine
// must not custody the key — that is the whole point of private mode on a
// headless box. Managed mode re-fetches it from the cloud-keys Edge Function
// on every run instead (one extra round-trip, zero secrets at rest).
let cloudDek = null

// ── Prompts ───────────────────────────────────────────────────────────────────

// Set once stdin is exhausted (EOF on a pipe, Ctrl+D) or a prompt is aborted
// (Ctrl+C closes the readline): later prompts must not wait for a line that can
// never arrive.
let stdinClosed = false

/**
 * Reads one trimmed line. Resolves '' for an empty line (Enter) but `null` when
 * stdin is closed — readline never calls the question() callback on EOF, so the
 * promise would otherwise stay pending forever (and the CLI would end silently).
 * `hidden` mutes the echo on a TTY (passphrases).
 */
function readPromptLine(question, { hidden = false, output = process.stdout } = {}) {
  if (stdinClosed || process.stdin.readableEnded) {
    stdinClosed = true
    return Promise.resolve(null)
  }
  const mute = hidden && process.stdin.isTTY
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output })
    let answered = false
    let muted = false
    if (mute) {
      const write = rl._writeToOutput.bind(rl)
      rl._writeToOutput = (s) => { if (!muted) write(s) }
    }
    rl.on('close', () => {
      if (answered) return
      stdinClosed = true
      output.write('\n') // move off the dangling prompt before any error line
      resolve(null)
    })
    rl.question(`  ${question}`, answer => {
      answered = true
      if (mute) { muted = false; output.write('\n') }
      rl.close()
      resolve(answer.trim())
    })
    if (mute) muted = true // question() wrote the prompt synchronously; keystrokes stay hidden
  })
}

/** One line from stdin; `null` = stdin closed (see readPromptLine). */
function promptLine(question) {
  return readPromptLine(question)
}

/** Interactive prompt with hidden echo (passphrases). Plain line read when stdin is not a TTY. */
function promptHidden(question) {
  return readPromptLine(question, { hidden: true })
}

/**
 * Asks until `parse` accepts the answer (it returns the value, or null to
 * reject). An empty line — Enter pressed too early — or malformed input prints
 * `hint(answer)` and asks again instead of aborting. Returns null when stdin is
 * closed (check `stdinClosed`) or after `attempts` rejected answers.
 */
async function promptUntil(question, parse, hint, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    const answer = await promptLine(question)
    if (answer === null) return null
    const value = parse(answer)
    if (value !== null) return value
    if (i < attempts) out(`  ${hint(answer)}`)
  }
  return null
}

/**
 * Resolves the account's DEK: managed rows via the cloud-keys unlock endpoint;
 * e2ee rows by deriving a KEK from NOTEFLOW_CLOUD_PASSPHRASE (or an interactive
 * hidden prompt) and unwrapping locally — recovery codes are detected by their
 * exact normalized length, like the desktop app.
 */
async function getCliDek() {
  if (cloudDek) return cloudDek
  const res = await cloudRest(
    '/rest/v1/user_keys?select=mode,dek_pass_ct,pass_salt,pass_iterations,dek_recovery_ct,recovery_salt,recovery_iterations'
  )
  if (res.status >= 400) throw new Error(`Could not load the Cloud keys (HTTP ${res.status})`)
  const rows = Array.isArray(res.json) ? res.json : []
  if (!rows.length) {
    throw new Error('No Cloud keys for this account — run `noteflow cloud setup` (or set up Cloud in the desktop app).')
  }
  const row = rows[0]

  if (row.mode === 'managed') {
    const token = await getCloudAccessToken()
    const unlock = await supabaseFetch(`${CLOUD_KEYS_URL}/unlock`, { method: 'POST', body: {}, accessToken: token })
    if (unlock.status >= 400) throw new Error(`Could not unlock the Cloud keys (HTTP ${unlock.status})`)
    const raw = unlock.json && unlock.json.dek
    if (typeof raw !== 'string' || !raw) throw new Error('Unlock response carried no key')
    const dek = fromB64Url(raw)
    if (dek.length !== KEY_BYTES) throw new Error(`unlocked DEK has ${dek.length} bytes, expected ${KEY_BYTES}`)
    cloudDek = dek
    return cloudDek
  }

  // e2ee: the secret comes from the env (headless/scripted) or a hidden prompt.
  let secret = process.env.NOTEFLOW_CLOUD_PASSPHRASE || ''
  if (!secret) secret = await promptHidden('Cloud passphrase (or recovery code): ')
  if (!secret) {
    throw new Error('This account uses private (e2ee) encryption — set NOTEFLOW_CLOUD_PASSPHRASE or enter the passphrase when prompted.')
  }

  let wrapped, kek
  if (looksLikeRecoveryCode(secret) && row.dek_recovery_ct && row.recovery_salt && row.recovery_iterations) {
    wrapped = row.dek_recovery_ct
    kek = await deriveKek(normalizeRecoveryCode(secret), fromB64Url(row.recovery_salt), row.recovery_iterations)
  } else {
    if (!row.dek_pass_ct || !row.pass_salt || !row.pass_iterations) {
      throw new Error('This account has no passphrase-wrapped Cloud key.')
    }
    wrapped = row.dek_pass_ct
    kek = await deriveKek(secret, fromB64Url(row.pass_salt), row.pass_iterations)
  }
  try {
    cloudDek = await unwrapKey(wrapped, kek)
  } catch {
    throw new Error('Wrong passphrase or recovery code.')
  }
  return cloudDek
}

// ── NoteFlow Cloud: push / pull engine ────────────────────────────────────────

// Per-process note-key cache: '<dir>' (note folders) or '<name>.json' (root
// metadata) → key. One remote anchor lookup per scope per invocation.
const cloudNoteKeys = new Map()

async function cloudGetNoteKey(dek, scope) {
  const cached = cloudNoteKeys.get(scope)
  if (cached) return cached
  const anchorRel = scope.endsWith('.json') ? scope : `${scope}/${NOTE_MD}`
  const pathKey = await derivePathKeyHmac(dek, anchorRel)
  const res = await cloudRest(`/rest/v1/files?select=key_ct&path_key=eq.${encodeURIComponent(pathKey)}`)
  let noteKey = null
  if (res.status < 400 && Array.isArray(res.json) && res.json.length > 0) {
    try { noteKey = await unwrapKey(res.json[0].key_ct, dek) } catch { noteKey = null }
  }
  if (!noteKey) noteKey = generateNoteKey()
  cloudNoteKeys.set(scope, noteKey)
  return noteKey
}

// Warned once per invocation when the server lacks the conditional RPC.
let cloudConditionalFallbackWarned = false
// Set once per invocation when the server lacks cloud_upsert_file_v2 (0014): 0011 from then on.
let cloudBaseUpsertMissing = false

/**
 * Uploads one file as an encrypted row → 'uploaded' | 'stale'. Note rows go
 * first through cloud_upsert_file_v2 (migration 0014) with the file's BASE seq
 * (cliCloudBase): written only while the server row is still the version this
 * CLI last reconciled — 'stale' (nothing written) otherwise, whatever the
 * timestamps say; the seq it answers becomes the new base. No base → the RPC
 * applies the updated_at rule of 0011 itself. A server without 0014 → the RPC
 * of 0011 (cloud_upsert_file, rejected when the server holds a newer version of
 * the folder) for the rest of the invocation; without that one either, the
 * plain upsert. Root metadata json and `force` uploads (a folder kept over a
 * remote tombstone) use the plain upsert. Uploads that answer no seq forget the
 * base (the next pull re-establishes it). `e.subscription` marks the RLS 403
 * (stop the whole push). Mirror of the app's uploadFileRow.
 */
async function cloudPushFile(dek, noteKey, relPath, { force = false } = {}) {
  const account = getCliAccount()
  const content = fs.readFileSync(path.join(NOTES_DIR, relPath), 'utf-8')
  const dir = noteDirOf(relPath)
  let anchorContent = null
  if (dir && !isAnchorPath(relPath)) {
    try { anchorContent = fs.readFileSync(path.join(NOTES_DIR, dir, NOTE_MD), 'utf-8') } catch { anchorContent = null }
  }
  const updatedAt = resolveRowUpdatedAt(relPath, content, anchorContent, new Date().toISOString())
  const row = await buildFileUpsertRow(dek, noteKey, relPath, content, updatedAt)
  const subscriptionError = () => {
    const e = new Error('An active NoteFlow Cloud subscription is required to upload changes.')
    e.subscription = true
    return e
  }
  if (dir && !force) {
    const anchorKey = isAnchorPath(relPath) ? null : await derivePathKeyHmac(dek, `${dir}/${NOTE_MD}`)
    if (!cloudBaseUpsertMissing) {
      const base = cliCloudBase(relPath)
      const v2 = await cloudRestWithRetry(() =>
        cloudRest(`/rest/v1/rpc/${CLOUD_BASE_UPSERT_RPC}`, {
          method: 'POST',
          body: {
            p_path_key: row.path_key, p_path_ct: row.path_ct, p_content_ct: row.content_ct,
            p_key_ct: row.key_ct, p_updated_at: row.updated_at, p_base_seq: base ? base.seq : null,
            p_anchor_key: anchorKey,
          },
        })
      )
      const res = classifyBaseUpsert(v2.status, v2.json)
      if (res.outcome === 'stale') return 'stale'
      if (res.outcome === 'uploaded') {
        // The new base: the seq the server just gave this content (unknown → forgotten).
        if (res.seq !== null) storeCliBaseContent(relPath, content)
        setCliCloudBase(relPath, res.seq === null ? null : { seq: res.seq, hash: hashForBase(relPath, content) })
        return 'uploaded'
      }
      if (res.outcome === 'forbidden') throw subscriptionError()
      if (res.outcome === 'error') throw new Error(`Cloud upload failed (HTTP ${v2.status})`)
      cloudBaseUpsertMissing = true // 'missing': 0014 not deployed — 0011 below from now on
      console.error('  Note: NoteFlow Cloud does not support base-checked uploads yet — using timestamp-checked uploads')
    }
    const rpc = await cloudRestWithRetry(() =>
      cloudRest(`/rest/v1/rpc/${CLOUD_CONDITIONAL_UPSERT_RPC}`, {
        method: 'POST',
        body: {
          p_path_key: row.path_key, p_path_ct: row.path_ct, p_content_ct: row.content_ct,
          p_key_ct: row.key_ct, p_updated_at: row.updated_at, p_anchor_key: anchorKey,
        },
      })
    )
    const outcome = classifyConditionalUpsert(rpc.status, rpc.json)
    if (outcome === 'uploaded') {
      setCliCloudBase(relPath, null) // 0011 answers no seq: the base is unknown now
      return outcome
    }
    if (outcome === 'stale') return outcome
    if (outcome === 'forbidden') throw subscriptionError()
    if (outcome === 'error') throw new Error(`Cloud upload failed (HTTP ${rpc.status})`)
    if (!cloudConditionalFallbackWarned) { // 'missing': no regression vs the plain upsert
      cloudConditionalFallbackWarned = true
      console.error('  Note: NoteFlow Cloud does not support conditional uploads yet — uploading unconditionally')
    }
  }
  const res = await cloudRestWithRetry(() =>
    cloudRest('/rest/v1/files?on_conflict=user_id,path_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: account.userId, ...row },
    })
  )
  if (res.status === 403) throw subscriptionError()
  if (res.status >= 400) throw new Error(`Cloud upload failed (HTTP ${res.status})`)
  // Plain upsert (forced / fallback): no seq comes back — forget the base.
  if (dir) setCliCloudBase(relPath, null)
  return 'uploaded'
}

const STALE_UPLOAD_HINT = "not uploaded: a newer version is on NoteFlow Cloud — run 'noteflow pull'"

/**
 * All non-deleted remote rows decrypted to (relPath, pathKey) — whole-note
 * deletes. Paged by keyset over `seq`: a single GET is capped at max-rows
 * (1000), and a note beyond it got no tombstone at all while the delete was
 * reported done. A failed page throws (the delete reports the error).
 */
async function cloudListRemotePaths(dek) {
  const rows = await collectSeqPages(async (after) => {
    const res = await cloudRest(
      `/rest/v1/files?select=path_key,path_ct,key_ct,seq&deleted=eq.false&order=seq.asc&seq=gt.${after}&limit=${CLOUD_PAGE_SIZE}`
    )
    if (res.status >= 400) throw new Error(`Cloud listing failed (HTTP ${res.status})`)
    return Array.isArray(res.json) ? res.json : []
  }, 0)
  const remote = []
  for (const raw of rows) {
    try {
      const noteKey = await unwrapKey(raw.key_ct, dek)
      remote.push({ relPath: await decryptContent(noteKey, raw.path_ct), pathKey: raw.path_key })
    } catch { /* undecryptable row (not this DEK) — skip */ }
  }
  return remote
}

/**
 * Tombstones rows (deleted=true, content blanked) so other devices pick the
 * deletion up on their incremental pull. Without a subscription RLS blocks the
 * UPDATE (403) → falls back to a physical DELETE (allowed by ownership alone).
 */
async function cloudTombstonePathKeys(pathKeys) {
  if (!pathKeys.length) return
  const filter = `path_key=in.(${pathKeys.map(k => `"${k}"`).join(',')})`
  const res = await cloudRestWithRetry(() =>
    cloudRest(`/rest/v1/files?${filter}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { deleted: true, content_ct: '', updated_at: new Date().toISOString() },
    })
  )
  if (res.status < 400) return
  if (res.status !== 403) throw new Error(`Cloud delete failed (HTTP ${res.status})`)
  const del = await cloudRestWithRetry(() =>
    cloudRest(`/rest/v1/files?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  )
  if (del.status >= 400) throw new Error(`Cloud delete failed (HTTP ${del.status})`)
}

async function cloudTombstoneRelPaths(relPaths) {
  if (!relPaths.length) return
  const dek = await getCliDek()
  const pathKeys = []
  for (const p of relPaths) pathKeys.push(await derivePathKeyHmac(dek, p))
  await cloudTombstonePathKeys(pathKeys)
}

// Push gate: never push before the first reconcile — a fresh machine pushing
// old disk state over a newer remote corpus would clobber it (mirror of the
// desktop app's initial-pull gate). Any cursor (pullSeq or a legacy
// pullCursor) or lastSync present = reconciled.
// The one-time bases bootstrap (needsBasesBootstrap) is the same kind of gate:
// until it ran, no file has a base and an upload would fall back to the
// timestamp rule — the very LWW clobber the per-file merge fixes.
async function cloudEnsureReconciled() {
  bindCliCloudToAccount() // another account's cursor ≠ reconciled
  const c = getCliCloud()
  const reconciled = c.pullSeq !== undefined || c.pullCursor || c.lastSync
  if (reconciled && !needsBasesBootstrap(c)) return
  if (!reconciled) out('  First Cloud reconcile…')
  await cloudPullNow()
}

/**
 * Rows changed since the watermark, in seq order — KEYSET pagination
 * (`seq=gt.<last>&order=seq.asc&limit=N` until a short page): unlike offsets,
 * stable while rows are written mid-pull. Mode from planPullQuery.
 */
async function cloudFetchChangedRows(c, bootstrapBases = false) {
  const plan = planPullQuery(c, { bootstrapBases })
  return collectSeqPages(async (after) => {
    const res = await cloudRest(
      `/rest/v1/files?select=${CLOUD_PULL_COLUMNS}&order=seq.asc&seq=gt.${after}&limit=${CLOUD_PAGE_SIZE}` +
        (plan.includeDeleted ? '' : '&deleted=eq.false') // first reconcile: nothing local to delete safely
    )
    if (res.status >= 400) throw new Error(`Cloud pull failed (HTTP ${res.status})`)
    return Array.isArray(res.json) ? res.json : []
  }, plan.afterSeq, CLOUD_PAGE_SIZE, 'Cloud pull failed')
}

/** Fetches + decrypts the remote anchor row of a dir (or null). */
async function cloudFetchRemoteAnchor(dek, dir) {
  const pathKey = await derivePathKeyHmac(dek, `${dir}/${NOTE_MD}`)
  const res = await cloudRest(
    `/rest/v1/files?select=${CLOUD_PULL_COLUMNS}&path_key=eq.${encodeURIComponent(pathKey)}`
  )
  if (res.status >= 400 || !Array.isArray(res.json) || !res.json.length) return null
  try { return { ...(await decryptFileRow(dek, res.json[0])), pathKey, seq: parseRowSeq(res.json[0].seq) } } catch { return null }
}

/**
 * Re-fetches the rows of the pull retry set by path_key (chunks of
 * PULL_RETRY_CHUNK). A failed request aborts the pull (`abortPull`: nothing
 * persisted, the retry set is kept).
 */
async function cloudFetchRowsByPathKeys(pathKeys) {
  const rows = []
  for (let i = 0; i < pathKeys.length; i += PULL_RETRY_CHUNK) {
    const filter = `path_key=in.(${pathKeys.slice(i, i + PULL_RETRY_CHUNK).map(k => `"${k}"`).join(',')})`
    const res = await cloudRest(`/rest/v1/files?select=${CLOUD_PULL_COLUMNS}&${filter}`)
    if (res.status >= 400) throw Object.assign(new Error(`Cloud retry fetch failed (HTTP ${res.status})`), { abortPull: true })
    if (Array.isArray(res.json)) rows.push(...res.json)
  }
  return rows
}

/**
 * Fetches + decrypts specific remote rows by relPath in ONE request
 * (`path_key=in.(…)`) — the sections an applied anchor lists that did not
 * travel in its batch. Absent rows (upload still pending) are simply missing;
 * undecryptable / unexpected-path rows count as errors and are skipped. A
 * failed REQUEST throws an error marked `abortPull`: cloudPullNow re-throws it
 * so the whole pull fails WITHOUT persisting pullSeq/lastSync (idempotent —
 * the next pull retries from the same watermark).
 */
async function cloudFetchRemoteRows(dek, relPaths) {
  if (!relPaths.length) return { entries: [], errors: 0, undecryptable: [] }
  const byKey = new Map()
  for (const rel of relPaths) byKey.set(await derivePathKeyHmac(dek, rel), rel)
  const filter = `path_key=in.(${[...byKey.keys()].map(k => `"${k}"`).join(',')})`
  const abort = (msg) => Object.assign(new Error(`Cloud section fetch failed (${msg})`), { abortPull: true })
  let res
  try {
    res = await cloudRest(`/rest/v1/files?select=${CLOUD_PULL_COLUMNS}&${filter}`)
  } catch (e) {
    throw abort(e.message)
  }
  if (res.status >= 400) throw abort(`HTTP ${res.status}`)
  const entries = []
  const undecryptable = [] // → pull retry set
  let errors = 0
  for (const row of Array.isArray(res.json) ? res.json : []) {
    try {
      const entry = await decryptFileRow(dek, row)
      if (entry.relPath !== byKey.get(row.path_key) || !isSafeCloudRelPath(entry.relPath)) { errors++; continue }
      entries.push({ ...entry, pathKey: row.path_key, seq: parseRowSeq(row.seq) })
    } catch { errors++; undecryptable.push(row.path_key) }
  }
  return { entries, errors, undecryptable }
}

/** Writes (or, for a tombstone, removes) one remote section file; true if the disk changed. */
function cloudApplySectionFile(entry) {
  const localFile = path.join(NOTES_DIR, entry.relPath)
  if (entry.deleted) {
    try { fs.unlinkSync(localFile); return true } catch { return false } // already gone
  }
  try {
    if (fs.readFileSync(localFile, 'utf-8') === entry.content) return false // own row coming back — no-op
  } catch { /* missing locally — write it */ }
  fs.writeFileSync(localFile, entry.content, 'utf-8')
  return true
}

/** Every '.md' of a local note folder: '<dir>/<file>.md' → content. */
function readLocalNoteFiles(dir) {
  const files = {}
  const dirPath = path.join(NOTES_DIR, dir)
  for (const f of fs.readdirSync(dirPath)) {
    if (f.endsWith('.md')) files[`${dir}/${f}`] = fs.readFileSync(path.join(dirPath, f), 'utf-8')
  }
  return files
}

/**
 * Three-way reconcile of a local note folder whose anchor has a known base (or
 * that the bases bootstrap covers) — mirror of the app's reconcileDirThreeWay
 * around the pure planThreeWayDir. Fetches the sections the remote anchor lists
 * that are not in this batch and are missing on disk (or pending here without a
 * base) BEFORE writing anything (a failed request aborts the pull), then:
 * conflict copy first (only the conflicting sections; the whole folder when the
 * anchors can't be merged — throws → retry set, nothing written), removes,
 * writes (sections, then note.md), bases. The CLI's journal is
 * `pendingUpserts`: every entry counts as a pending AND "stale" upload (the CLI
 * has no drain — what must still go up is re-uploaded by the pull itself,
 * including the folder's pending files this batch did not touch); no upload is
 * ever in flight during a pull, and there are no pending deletes or
 * conflict-copied flags. A section both sides changed is merged line by line
 * (planThreeWayDir; diff3 with the stored base content). Returns { changed,
 * copy, errors, settle, upload: [{ relPath, force }], conflictMarkerSections }
 * — the caller drops `settle` from pendingUpserts and re-uploads `upload`
 * (with base = the seq just reconciled).
 */
async function cloudReconcileDirThreeWay(dir, group, anchor, dek, pending, dirBases, ctx, sink) {
  const inGroup = new Set(group.map(e => e.relPath))
  const toFetch = anchor
    ? listAnchorSectionFiles(anchor.content)
        .map(f => `${dir}/${f}`)
        .filter(rel => !inGroup.has(rel) &&
          (!fs.existsSync(path.join(NOTES_DIR, rel)) || (isPendingUpsert(pending, rel) && !dirBases[rel])))
    : []
  const fetched = await cloudFetchRemoteRows(dek, toFetch)
  sink.fetchedForDir.push(...fetched.entries)
  for (const key of fetched.undecryptable) sink.decryptFailures.add(key)

  // Synchronous from here to the end.
  const prefix = `${dir}/`
  const pendingSet = new Set(pending.filter(p => p.startsWith(prefix)))
  const local = readLocalNoteFiles(dir)
  const rows = [...group, ...fetched.entries]
  const remote = rows.map(e => ({
    relPath: e.relPath,
    seq: e.seq === undefined ? null : e.seq,
    content: e.deleted ? null : e.content,
    updatedAtMs: e.updatedAtMs,
  }))
  let bases = dirBases
  if (ctx) {
    // Bootstrap: real bases for rows this CLI had already seen (persisted),
    // assumed ones for the remote changes it had not (planner only).
    const synth = synthesizeBootstrapBases({
      dir,
      local,
      remote,
      bases: dirBases,
      pendingUpserts: pendingSet,
      seenSeq: ctx.seenSeq,
      notSeen: new Set(rows.filter(e => ctx.retryKeys.has(e.pathKey)).map(e => e.relPath)),
      lastSyncMs: ctx.lastSyncMs,
    })
    for (const [rel, base] of Object.entries(synth.seen)) {
      const row = remote.find(r => r.relPath === rel && r.content !== null && hashForBase(rel, r.content) === base.hash)
      if (row) storeCliBaseContent(rel, row.content)
      setCliCloudBase(rel, base)
    }
    bases = { ...synth.assumed, ...dirBases, ...synth.seen }
  }
  const plan = planThreeWayDir({
    dir,
    local,
    remote,
    bases,
    pendingUpserts: pendingSet,
    staleUpserts: pendingSet,
    copiedUpserts: new Set(),
    pendingDeletes: new Set(),
    baseContent: (_rel, hash) => readCliBaseContent(hash),
    conflictLabels: conflictMarkerLabels(),
    nowIso: new Date().toISOString(),
  })

  let copy = null
  if (plan.copyWhole) copy = writeConflictCopyDir(dir)
  else if (plan.copySections.length > 0) copy = writeConflictCopyDir(dir, plan.copySections)

  let changed = 0
  for (const rel of plan.removes) {
    try { fs.unlinkSync(path.join(NOTES_DIR, rel)); changed++ } catch { /* already gone */ }
  }
  for (const w of plan.writes) {
    fs.writeFileSync(path.join(NOTES_DIR, w.relPath), w.content, 'utf-8')
    changed++
  }
  for (const [rel, content] of Object.entries(plan.baseContents)) storeCliBaseContent(rel, content)
  for (const [rel, base] of Object.entries(plan.bases)) setCliCloudBase(rel, base)
  // The app's journal drain runs right after its pull and uploads the pending
  // edits the batch did not touch (a section edited offline whose row did not
  // move). The CLI has no drain: those go up here too — sections before
  // note.md, so the merged anchor never lists content the server lacks.
  // Forced entries (cliCloud.forceUpserts: a folder kept over a tombstone) stay forced.
  const planned = new Set([...plan.settle, ...plan.upload, ...plan.removes])
  const drained = [...pendingSet].filter(rel => !planned.has(rel) && rel in local)
  const upload = [...drained.filter(rel => !isAnchorPath(rel)), ...plan.upload, ...drained.filter(isAnchorPath)]
  // A file already in forceUpserts stays forced whichever way it comes (the
  // app's journal keeps `force` on re-record): a folder kept over an anchor
  // tombstone whose forced re-upload failed would otherwise go up conditional,
  // stale against the newer tombstone, forever.
  const forced = new Set([...plan.force, ...upload.filter(rel => isPendingUpsert(sink.forceUpserts, rel))])
  return {
    changed,
    copy,
    errors: fetched.errors,
    settle: plan.settle,
    upload: upload.map(rel => ({ relPath: rel, force: forced.has(rel) })),
    conflictMarkerSections: plan.conflictMarkerSections,
  }
}

/** Bases grouped by note folder: dir → { relPath → base }. */
function indexBasesByDir(bases) {
  const byDir = new Map()
  for (const [rel, base] of Object.entries(bases)) {
    const dir = noteDirOf(rel)
    if (dir === null) continue
    if (!byDir.has(dir)) byDir.set(dir, {})
    byDir.get(dir)[rel] = base
  }
  return byDir
}

/** Incremental pull — same grouping/conflict/tombstone/loose-section rules as the app's cloudSync.pullNotes. */
async function cloudPullNow() {
  bindCliCloudToAccount()
  const c = getCliCloud()
  const dek = await getCliDek()
  const lastSyncMs = c.lastSync ? Date.parse(c.lastSync) : null
  // Pending uploads whose local file is gone protect nothing (the app's journal
  // drain discards them the same way).
  const pending = existingPendingUpserts(c.pendingUpserts)
  const keptDirs = []
  // Conflict copies written by this pull ({ dir, title, relPaths }) — uploaded below.
  const conflictCopies = []
  // Reconciled to the server's content by this pull → leave pendingUpserts.
  const reconciledDirs = [], reconciledPaths = []
  // Three-way re-uploads ({ relPath, force }): whatever a merged folder ends
  // with that differs from the server, on top of the seq just reconciled.
  const reUploads = []
  // Retry set: rows that failed to apply in earlier pulls ride along with this
  // batch (below the watermark now); this pull's failures replace it.
  const prevRetry = parsePullRetry(c.pullRetry)
  const applyFailures = new Map(), decryptFailures = new Set()
  // One-time bases bootstrap (an install that synced before per-file bases):
  // everything is re-read and every local folder reconciled three-way with
  // synthesized bases — see needsBasesBootstrap / synthesizeBootstrapBases.
  // "Unjournaled" local edits = a note.md not in pendingUpserts whose
  // `updated` is after this CLI's lastSync (the desktop app or an editor wrote
  // it while the CLI was not syncing): treated as unknown → never overwritten.
  const bootstrap = needsBasesBootstrap(c)
  const validLastSyncMs = lastSyncMs !== null && Number.isFinite(lastSyncMs) ? lastSyncMs : null
  const bootstrapCtx = bootstrap
    ? {
        seenSeq: typeof c.pullSeq === 'number' && Number.isSafeInteger(c.pullSeq) && c.pullSeq >= 0 ? c.pullSeq : null,
        retryKeys: new Set(Object.keys(prevRetry)),
        lastSyncMs: validLastSyncMs,
      }
    : null
  // Folders whose bootstrap reconcile failed in an earlier pull keep its context.
  const pendingBootstrap = parseBootstrapPending(c.basesBootstrapPending)
  const pendingBootstrapCtx = pendingBootstrap
    ? { seenSeq: pendingBootstrap.seenSeq, retryKeys: new Set(pendingBootstrap.retryKeys), lastSyncMs: pendingBootstrap.lastSyncMs }
    : null
  const bootstrapFailed = new Set(), bootstrapDone = new Set()
  if (bootstrap) out('  One-time Cloud sync upgrade: reconciling every note file by file…')
  const mainRows = await cloudFetchChangedRows(c, bootstrap)
  const rows = mergeRetryRows(mainRows, await cloudFetchRowsByPathKeys(Object.keys(prevRetry)))

  let errors = 0
  const entries = []
  for (const row of rows) {
    try {
      const entry = await decryptFileRow(dek, row)
      if (!isSafeCloudRelPath(entry.relPath)) { errors++; continue } // permanent — never retried
      entries.push({ ...entry, pathKey: row.path_key, seq: parseRowSeq(row.seq) })
      // Seed the per-folder key cache so pushes reuse the same note key.
      cloudNoteKeys.set(noteDirOf(entry.relPath) || entry.relPath, entry.noteKey)
    } catch { errors++; decryptFailures.add(row.path_key) }
  }

  const dirs = new Map()
  const rootFiles = []
  for (const e of entries) {
    const dir = noteDirOf(e.relPath)
    if (dir === null) { rootFiles.push(e); continue }
    if (!dirs.has(dir)) dirs.set(dir, [])
    dirs.get(dir).push(e)
  }

  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })

  // Bases known before this pull, by note folder (each folder is reconciled once).
  const basesByDir = indexBasesByDir(cliCloudBasesSnapshot())

  let pulled = 0, deleted = 0
  for (const [dir, group] of dirs) {
    const fetchedForDir = [] // rows fetched outside the batch — retried with the folder
    // Bootstrap context of this folder: the bootstrap pull itself, or a folder
    // whose bootstrap reconcile failed before.
    const dirCtx = bootstrapCtx || (pendingBootstrap && pendingBootstrap.dirs.includes(dir) ? pendingBootstrapCtx : null)
    let dirFailed = false
    try {
      const localDirPath = path.join(NOTES_DIR, dir)
      const localAnchorPath = path.join(localDirPath, NOTE_MD)
      const localAnchorContent = fs.existsSync(localAnchorPath) ? fs.readFileSync(localAnchorPath, 'utf-8') : null
      const localExists = localAnchorContent !== null
      const localUpdatedMs = localExists ? parseUpdatedTimestamp(extractUpdatedTimestamp(localAnchorContent)) : null

      // The anchor decides.
      let anchor = group.find(e => isAnchorPath(e.relPath)) || null

      if (anchor && anchor.deleted) {
        // Gone here too: its bases are moot.
        if (!localExists) { dropCliCloudBasesUnder(dir); continue }
        // A pending (failed) upload under '<dir>/' = a local edit the server
        // never got: keep the note and re-upload it whole below (resurrected on
        // purpose, like the app — the local edit wins). The CLI ALWAYS keeps
        // here (no 'lost' case like the app's planAnchorTombstone), so a
        // tombstone never needs a conflict copy.
        if (pendingUnderDir(pending, dir)) { keptDirs.push(dir); continue }
        // Note deleted remotely — apply locally only under the safety rule.
        if (shouldApplyRemoteDeletion(localUpdatedMs, lastSyncMs)) {
          fs.rmSync(localDirPath, { recursive: true, force: true })
          deleted++
          dropCliCloudBasesUnder(dir)
        }
        continue
      }

      if (!anchor && !localExists) {
        // Only section rows of a note not on this machine: fetch its anchor.
        // Absent (never fully uploaded) or deleted → nothing to write.
        anchor = await cloudFetchRemoteAnchor(dek, dir)
        if (!anchor || anchor.deleted) continue
        fetchedForDir.push(anchor)
      }

      const dirBases = basesByDir.get(dir) || {}
      if (localExists && (dirCtx !== null || dirBases[`${dir}/${NOTE_MD}`])) {
        // THREE-WAY (the anchor has a known base): every remote row is decided
        // against its file's base and the local file, not by note.md's
        // `updated:` — an offline edit of one section and a remote edit of
        // another MERGE; a section both sides changed differently
        // is merged line by line (overlapping edits: both versions in the
        // note, between ⚠️ markers). Replaces both branches below for this folder.
        const result = await cloudReconcileDirThreeWay(dir, group, anchor, dek, pending, dirBases, dirCtx,
          { fetchedForDir, decryptFailures, forceUpserts: c.forceUpserts })
        errors += result.errors
        if (result.copy) {
          conflictCopies.push(result.copy)
          out(`  Conflict: local changes kept as "${result.copy.title}"`)
        }
        if (result.conflictMarkerSections.length > 0) {
          let title = dir
          try { title = anchorTitle(fs.readFileSync(localAnchorPath, 'utf-8')) } catch { /* keep the folder name */ }
          out(`  Merged with conflicts: "${title}" — both versions kept, look for the ⚠️ markers`)
        }
        // Reconciled to the server's content (written or identical) → leave pendingUpserts.
        reconciledPaths.push(...result.settle)
        reUploads.push(...result.upload)
        if (result.changed === 0) continue
      } else if (anchor && (!localExists || shouldApplyRemoteDir(anchor.updatedAtMs, localUpdatedMs))) {
        // Newer remote anchor (or a note new to this machine): wholesale.
        // Listed sections NOT in this batch and NOT on disk were uploaded
        // earlier (below the watermark) — fetch them BEFORE writing: an anchor
        // without its section files gets them recreated empty by the next
        // edit, and those blanks would be pushed over the real ones. Listed
        // sections already on disk are up to date or get their own newer row
        // (loose-section rule) — except those with a pending upload: the local
        // folder lost (LWW), their disk content is the losing edit. A stale one
        // without a pending upload in a conflict the local folder won
        // (strictly newer) is the accepted LWW edge, as before.
        const inGroup = new Set(group.map(e => e.relPath))
        const toFetch = listAnchorSectionFiles(anchor.content)
          .map(f => `${dir}/${f}`)
          .filter(rel => !inGroup.has(rel) && (isPendingUpsert(pending, rel) || !fs.existsSync(path.join(NOTES_DIR, rel))))
        const fetched = await cloudFetchRemoteRows(dek, toFetch)
        errors += fetched.errors
        fetchedForDir.push(...fetched.entries)
        for (const key of fetched.undecryptable) decryptFailures.add(key)

        // BEFORE anything is overwritten: a pending local edit that differs
        // from the version about to be applied is kept as a conflict copy
        // (mirror of the app). Server side = the remote anchor + the group's
        // rows + the listed sections just fetched; tombstoned / absent →
        // deleted. A failed copy throws → retry set, folder left untouched.
        if (localExists) {
          const server = { [anchor.relPath]: anchor.content }
          for (const e of [...group, ...fetched.entries]) {
            if (!isAnchorPath(e.relPath)) server[e.relPath] = e.deleted ? null : e.content
          }
          const copy = preserveConflictCopy(dir, pending, server)
          if (copy) {
            conflictCopies.push(copy)
            // Dedupe: the folder's pending uploads are preserved in the copy
            // now — they leave pendingUpserts even if the apply below fails
            // halfway (its retry then can't copy them a second time). Residual:
            // a CLI killed before the state write below copies again next run.
            reconciledDirs.push(dir)
            out(`  Conflict: local changes kept as "${copy.title}"`)
          }
        }

        fs.mkdirSync(localDirPath, { recursive: true })
        fs.writeFileSync(localAnchorPath, anchor.content, 'utf-8')
        // Every row written (or found identical) becomes its file's base: the
        // next pull of this folder goes three-way.
        recordPulledBase(anchor)
        for (const entry of group) {
          if (isAnchorPath(entry.relPath)) continue
          cloudApplySectionFile(entry)
          recordPulledBase(entry)
        }
        // Not on the server yet (pending upload) → arrives later via the
        // loose-section rule; listed-but-tombstoned → left alone.
        for (const entry of fetched.entries) {
          if (entry.deleted) continue
          cloudApplySectionFile(entry)
          recordPulledBase(entry)
        }
        // The local folder lost: its pending uploads carry the losing version.
        reconciledDirs.push(dir)
      } else {
        // Anchor not applied (absent from this batch, or not newer) and the
        // folder exists locally: sections apply ONE BY ONE — an anchor and its
        // sections can land in different pulls (shouldApplyRemoteSection).
        // A remote section about to overwrite a pending (failed/stale) upload
        // keeps the local folder as a conflict copy first, judged only on the
        // overwritten files (identical = own echo → no copy) — mirror of the app.
        const overwrites = group.filter(e =>
          !isAnchorPath(e.relPath) && !e.deleted && isPendingUpsert(pending, e.relPath) &&
          shouldApplyRemoteSection(e.updatedAtMs, localUpdatedMs))
        if (localExists && overwrites.length) {
          const server = {}
          for (const e of overwrites) server[e.relPath] = e.content
          const copy = preserveConflictCopy(dir, Object.keys(server), server)
          if (copy) {
            conflictCopies.push(copy)
            // Dedupe: the whole folder is preserved in the copy — its pending
            // uploads leave pendingUpserts (even if this apply fails halfway),
            // so neither a retry nor the later anchor copies it again (the app
            // flags the whole dir `conflictCopied` for the same reason).
            reconciledDirs.push(dir)
            out(`  Conflict: local changes kept as "${copy.title}"`)
          }
        }
        let changed = 0
        for (const entry of group) {
          if (isAnchorPath(entry.relPath)) continue
          // A section tombstone must not remove a pending (failed) upload of that file.
          if (entry.deleted && isPendingUpsert(pending, entry.relPath)) continue
          if (!shouldApplyRemoteSection(entry.updatedAtMs, localUpdatedMs)) continue
          if (cloudApplySectionFile(entry)) changed++
          recordPulledBase(entry) // the disk now holds the server's version (its base)
          if (!entry.deleted) reconciledPaths.push(entry.relPath) // disk = server's version
        }
        // A remote anchor identical to the local one (typically this CLI's own
        // upload coming back): its pending upload is satisfied, and it becomes
        // the anchor's base (the folder goes three-way from now on).
        if (anchor && localAnchorContent === anchor.content) {
          reconciledPaths.push(anchor.relPath)
          recordPulledBase(anchor)
        }
        if (changed === 0) continue // local is newer, or already identical
      }
      pulled++
      out(`  ${dir}/`)
    } catch (e) {
      dirFailed = true
      if (e.abortPull) throw e // abort the pull: watermark/lastSync stay put
      errors++
      err(`${dir}: ${e.message}`)
      // Retry the WHOLE folder next pull (its rows sit below the watermark now).
      for (const e2 of [...group, ...fetchedForDir]) applyFailures.set(e2.pathKey, e2.relPath)
    } finally {
      if (dirCtx) (dirFailed ? bootstrapFailed : bootstrapDone).add(dir)
    }
  }

  // Root metadata json — remote wins (same LWW as the app / GitHub pull),
  // except a failed local upload (pending: union preferring local, or keep) and
  // the first reconcile (local backed up — outside the notes dir — and the
  // id-array files merged preferring remote). Same planMetadataPull as the app.
  const firstPull = !c.lastSync
  let backupDir = null, backedUp = 0, mergedMetadata = 0
  for (const entry of rootFiles) {
    try {
      if (entry.deleted) continue // metadata is never deleted by the app
      const metadataPath = path.join(NOTES_DIR, entry.relPath)
      const localContent = fs.existsSync(metadataPath) ? fs.readFileSync(metadataPath, 'utf-8') : null
      const pendingMeta = metadataPendingForPull(isPendingUpsert(pending, entry.relPath), firstPull)
      const decision = planMetadataPull(entry.relPath, localContent, entry.content, { pendingUpsert: pendingMeta, firstPull })
      if (decision.action === 'keep') {
        if (localContent === entry.content) reconciledPaths.push(entry.relPath)
        continue
      }
      if (decision.backup && localContent !== null) {
        backupDir = backupDir || path.join(getSettingsDir(), 'cloud-metadata-backups', new Date().toISOString().replace(/:/g, '-'))
        fs.mkdirSync(backupDir, { recursive: true })
        fs.writeFileSync(path.join(backupDir, entry.relPath), localContent, 'utf-8')
        backedUp++
      }
      fs.writeFileSync(metadataPath, decision.content, 'utf-8')
      if (decision.merged) mergedMetadata++
      // A merged pending file stays pending (`noteflow push` uploads the union).
      if (!(pendingMeta && decision.merged)) reconciledPaths.push(entry.relPath)
    } catch { errors++; applyFailures.set(entry.pathKey, entry.relPath) }
  }
  if (backedUp || mergedMetadata) {
    out(`  Metadata: ${backedUp} file(s) backed up to ${backupDir || getSettingsDir()}, ${mergedMetadata} merged`)
  }

  // Max seq of the MAIN fetch; rows that failed to apply/decrypt stay alive in
  // pullRetry (same write), unsafe-path rows are permanent. The legacy
  // updated_at cursor goes away.
  // Every file of a kept folder is marked pending in the SAME write that moves
  // the cursor past its tombstone: if the re-upload below is interrupted, the
  // tombstone is never fetched again, and only this record keeps the folder
  // protected (and re-uploaded whole by `noteflow push`) — mirror of the app's
  // requeueDirForUpload, which journals before pullSeq is saved. Built on the
  // FRESH stored list so a failure recorded meanwhile by another CLI process
  // is not lost; entries whose file is gone are pruned.
  const keptRelPaths = new Map()
  for (const dir of keptDirs) {
    const relPaths = []
    try {
      for (const f of fs.readdirSync(path.join(NOTES_DIR, dir))) if (f.endsWith('.md')) relPaths.push(`${dir}/${f}`)
    } catch { /* unreadable — its pending entries still stand */ }
    keptRelPaths.set(dir, relPaths)
  }
  const failures = { apply: applyFailures, decrypt: decryptFailures }
  const pullRetry = nextPullRetry(prevRetry, failures)
  const dropped = countDroppedRetries(failures, pullRetry)
  if (dropped) out(`  Gave up retrying ${dropped} remote change(s) after repeated failures`)
  // Conflict copies are recorded as pending uploads in the same write (an
  // interrupted upload below is retried by `noteflow push`).
  const keptFlat = [...keptRelPaths.values()].flat()
  const copyFlat = conflictCopies.flatMap(c => c.relPaths)
  // Three-way re-uploads are journaled the same way (and the forced ones as forced).
  const reUploadFlat = reUploads.map(u => u.relPath)
  const reUploadForced = reUploads.filter(u => u.force).map(u => u.relPath)
  // Bases BEFORE the cursor moves: a crash in between only re-reconciles rows
  // whose bases are already right (seq = base → nothing to do). Throws → the
  // pull fails without advancing anything.
  flushCliCloudBases()
  const fresh = getCliCloud()
  patchCliCloud({
    pullSeq: nextPullSeq(c.pullSeq, mainRows), pullCursor: undefined, lastSync: new Date().toISOString(),
    pullRetry: Object.keys(pullRetry).length ? pullRetry : undefined,
    pendingUpserts: storedPendingUpserts(existingPendingUpserts(nextPendingUpserts(
      dropReconciledPending(fresh.pendingUpserts, reconciledDirs, reconciledPaths), [...keptFlat, ...copyFlat, ...reUploadFlat], []))),
    // The kept folder's re-upload is FORCED until it lands — persisted here so
    // an interrupted/failed one is retried forced by `noteflow push`.
    forceUpserts: storedPendingUpserts(existingPendingUpserts(nextPendingUpserts(
      dropReconciledPending(fresh.forceUpserts, reconciledDirs, reconciledPaths), [...keptFlat, ...reUploadForced], []))),
    // Bootstrap done (or never needed: a first sync / an install with bases).
    basesBootstrapped: true,
    // A folder that failed its bootstrap reconcile keeps the context for its retry.
    basesBootstrapPending: nextBootstrapPending(pendingBootstrap, {
      started: bootstrapCtx
        ? { seenSeq: bootstrapCtx.seenSeq, lastSyncMs: bootstrapCtx.lastSyncMs, retryKeys: [...bootstrapCtx.retryKeys] }
        : null,
      failed: bootstrapFailed,
      done: bootstrapDone,
    }) || undefined,
  })
  if (Object.keys(pullRetry).length) {
    out(`  ${Object.keys(pullRetry).length} remote change(s) could not be applied — they will be retried on the next pull`)
  }

  // Notes kept over a remote tombstone: re-upload EVERY file of the folder so
  // all its rows lose the tombstone (re-sending only the pending file would
  // leave the other sections deleted for every other device). FORCED: the
  // tombstone is newer than the local edit by design — a conditional upload
  // would be rejected and the resurrection would silently fail.
  for (const [dir, relPaths] of keptRelPaths) {
    const uploaded = []
    try {
      const noteKey = await cloudGetNoteKey(dek, dir)
      for (const relPath of relPaths) {
        await cloudPushFile(dek, noteKey, relPath, { force: true })
        uploaded.push(relPath)
      }
      out(`  Kept ${dir}/ (deleted elsewhere, but local changes were never uploaded) — uploaded again`)
    } catch (e) {
      errors++
      err(`Kept ${dir}/ (deleted elsewhere, but local changes were never uploaded) — upload failed: ${e.message}. Run 'noteflow push' to retry`)
    }
    // Only what landed leaves the lists (the rest is already recorded above).
    if (uploaded.length) {
      patchCliCloud({
        pendingUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().pendingUpserts, [], uploaded)),
        forceUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().forceUpserts, [], uploaded)),
      })
    }
  }

  // Conflict copies: new folders → fresh note key, conditional uploads (nothing
  // newer can exist for a new path). What doesn't land stays pending.
  for (const copy of conflictCopies) {
    const uploaded = []
    try {
      const noteKey = await cloudGetNoteKey(dek, copy.dir)
      for (const relPath of copy.relPaths) {
        if ((await cloudPushFile(dek, noteKey, relPath)) === 'uploaded') uploaded.push(relPath)
      }
    } catch (e) {
      errors++
      err(`Conflict copy "${copy.title}" — upload failed: ${e.message}. Run 'noteflow push' to retry`)
    }
    if (uploaded.length) {
      patchCliCloud({ pendingUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().pendingUpserts, [], uploaded)) })
    }
  }

  // Three-way merges: re-upload what the folder ends with that differs from
  // the server (a section kept local, the merged note.md…) with base = the seq
  // just reconciled — sections first, note.md last (planThreeWayDir's order).
  // Rejected (stale: another device wrote meanwhile) or failed → stays pending.
  const reUploadDirs = new Map()
  for (const u of reUploads) {
    const dir = noteDirOf(u.relPath)
    if (!reUploadDirs.has(dir)) reUploadDirs.set(dir, [])
    reUploadDirs.get(dir).push(u)
  }
  for (const [dir, list] of reUploadDirs) {
    const uploaded = [], stale = []
    try {
      const noteKey = await cloudGetNoteKey(dek, dir)
      for (const u of list) {
        if (!fs.existsSync(path.join(NOTES_DIR, u.relPath))) continue
        if ((await cloudPushFile(dek, noteKey, u.relPath, { force: u.force })) === 'stale') stale.push(u.relPath)
        else uploaded.push(u.relPath)
      }
    } catch (e) {
      errors++
      err(`${dir}/: upload of the merged note failed: ${e.message}. Run 'noteflow push' to retry`)
    }
    if (stale.length) out(`  ${dir}/: ${stale.length} file(s) ${STALE_UPLOAD_HINT}`)
    flushCliCloudBasesBestEffort()
    if (uploaded.length) {
      patchCliCloud({
        pendingUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().pendingUpserts, [], uploaded)),
        forceUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().forceUpserts, [], uploaded)),
      })
    }
  }
  // Bases of the kept-folder / conflict-copy uploads above; only once they are
  // saved, drop the base contents no section base references any more.
  if (flushCliCloudBasesBestEffort()) pruneCliBaseContents()
  return { pulled, deleted, errors }
}

// ── NoteFlow Cloud: commands ──────────────────────────────────────────────────

// GoTrue's OTP length is a per-project setting (6–10 digits; ours emails 8),
// so accept the whole range rather than pinning one length — the copy below
// says "code", never "N-digit code". Spaces/dashes are tolerated so a pasted
// "1234 5678" works.
const OTP_CODE_RE = /^\d{6,10}$/
// Codes /verify may reject before giving up. GoTrue answers a mistyped code and
// an expired one identically (otp_expired / "Token has expired or is invalid"),
// so a typo can be retried without emailing a new code (and hitting the 429).
const OTP_VERIFY_ATTEMPTS = 3

function normalizeOtpCode(answer) {
  const code = answer.replace(/[\s-]/g, '')
  return OTP_CODE_RE.test(code) ? code : null
}

/** Same detection as electron/account.ts verifyOtp → 'invalidCode'. */
function isInvalidOtpResponse(json) {
  if (!json || typeof json !== 'object') return false
  if (json.error_code === 'otp_expired') return true
  const msg = ['msg', 'message', 'error_description', 'error'].map(k => json[k]).find(v => typeof v === 'string' && v)
  return !!msg && /expired|invalid/i.test(msg)
}

/**
 * Pure: which `cloud login` flow the flags ask for. `--send-code` / `--code`
 * are the non-interactive two-step flow (agents, scripts: no stdin needed) and
 * both demand the email as an argument — there is no prompt to fall back on.
 * Returns { mode: 'interactive' | 'sendCode' | 'code', email, code? } or { error }.
 */
function planCloudLogin(emailArg, opts = {}) {
  const email = (emailArg || '').trim()
  const hasCode = opts.code !== undefined
  if (opts.sendCode && hasCode) return { error: '--send-code and --code cannot be used together' }
  if (!opts.sendCode && !hasCode) {
    if (email && !email.includes('@')) return { error: 'A valid email is required' }
    return { mode: 'interactive', email }
  }
  const flag = opts.sendCode ? '--send-code' : '--code <code>'
  if (!email) return { error: `Usage: noteflow cloud login <email> ${flag}` }
  if (!email.includes('@')) return { error: `"${email}" is not an email address — usage: noteflow cloud login <email> ${flag}` }
  if (opts.sendCode) return { mode: 'sendCode', email }
  const code = normalizeOtpCode(String(opts.code))
  if (!code) return { error: `"${opts.code}" is not a valid sign-in code — pass the digits from the email (spaces and dashes are ignored)` }
  return { mode: 'code', email, code }
}

/** Emails a one-time sign-in code (creates the account on first sign-in). Exits on failure. */
async function sendCloudOtp(email) {
  const otp = await supabaseFetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    body: { email, create_user: true },
  })
  if (otp.status >= 400) {
    err(otp.status === 429
      ? 'Too many attempts — wait a moment and try again'
      : `Could not send the sign-in code (HTTP ${otp.status})`)
    exit(1)
  }
  out(`  Sent a sign-in code to ${email}`)
}

/**
 * Spends ONE /verify attempt. Returns the GoTrue session, or null when the code
 * is wrong or expired (GoTrue can't tell those apart). Exits on any other failure.
 */
async function verifyCloudOtp(email, code) {
  const verify = await supabaseFetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    body: { type: 'email', email, token: code },
  })
  if (verify.status < 400) {
    const session = verify.json
    if (!session || !session.access_token || !session.refresh_token || !session.user) {
      err('Unexpected response from the account service'); exit(1)
    }
    return session
  }
  if (verify.status === 429) { err('Too many attempts — wait a moment and try again'); exit(1) }
  if (!isInvalidOtpResponse(verify.json)) { err(`Could not verify the code (HTTP ${verify.status})`); exit(1) }
  return null
}

// noteflow cloud login [email] [--no-pull]                 interactive (prompts)
// noteflow cloud login <email> --send-code                 step 1: email the code, exit
// noteflow cloud login <email> --code <code> [--no-pull]   step 2: verify it once
async function cmdCloudLogin(emailArg, opts = {}) {
  const plan = planCloudLogin(emailArg, opts)
  if (plan.error) { err(plan.error); exit(1) }

  if (plan.mode === 'sendCode') {
    await sendCloudOtp(plan.email)
    out(`  Next: noteflow cloud login ${plan.email} --code <code>`)
    return
  }

  if (plan.mode === 'code') {
    // No email is sent here: the code from the earlier --send-code stays valid
    // until it expires, so a typo can be retried without hitting the 429.
    const session = await verifyCloudOtp(plan.email, plan.code)
    if (!session) {
      err(`That code is invalid or has expired. Check it and retry with --code, or get a new one: noteflow cloud login ${plan.email} --send-code`)
      exit(1)
    }
    await finishCloudLogin(session, plan.email, opts)
    return
  }

  let email = plan.email
  if (!email) {
    email = await promptUntil('Email: ',
      a => (a.includes('@') ? a : null),
      a => (a ? `"${a}" is not an email address — try again` : 'Type the email of your NoteFlow account'))
    if (!email) { err(stdinClosed ? 'No email entered' : 'A valid email is required'); exit(1) }
  }

  await sendCloudOtp(email)

  // An empty or malformed entry re-prompts locally (the emailed code stays
  // valid); only a well-formed code spends a /verify attempt.
  let session = null
  for (let attempt = 1; !session; attempt++) {
    const code = await promptUntil('Code: ', normalizeOtpCode,
      a => (a ? `"${a}" is not a valid code — paste the code from the email` : 'Paste the code from the email'))
    if (!code) { err(stdinClosed ? 'No code entered' : 'No valid code entered — run `noteflow cloud login` again'); exit(1) }

    session = await verifyCloudOtp(email, code)
    if (session) break
    if (attempt >= OTP_VERIFY_ATTEMPTS) {
      err('That code is invalid or has expired. Run `noteflow cloud login` again to get a new one.'); exit(1)
    }
    const left = OTP_VERIFY_ATTEMPTS - attempt
    out(`  That code is invalid or has expired — check it and try again (${left} ${left === 1 ? 'attempt' : 'attempts'} left)`)
  }
  await finishCloudLogin(session, email, opts)
}

/**
 * Everything after a verified sign-in, shared by the interactive and the
 * `--code` flows: saves the CLI's own session, binds the sync cursor to the
 * account, enables Cloud sync, reports the keys mode and (managed keys) runs
 * the first pull unless --no-pull.
 */
async function finishCloudLogin(session, email, opts) {
  // A re-login without `cloud logout` still has the previous session here: its
  // userId identifies the owner of a cursor written before owners were recorded.
  const previousAccount = getCliAccount()
  saveCliAccount({
    email: session.user.email || email,
    userId: session.user.id,
    refreshToken: Buffer.from(session.refresh_token).toString('base64'),
  })
  // Before any pull (the managed auto-pull below, or a later `noteflow pull`):
  // a cursor kept by `cloud logout` only resumes for the SAME account.
  if (bindCliCloudToAccount(previousAccount ? previousAccount.userId : undefined)) {
    out('  Reset the Cloud sync cursor (it belonged to another account) — the next pull downloads everything')
  }
  patchCliCloud({ enabled: true })
  cloudAccessToken = session.access_token
  out(`  Signed in as ${session.user.email || email} — NoteFlow Cloud sync enabled`)

  // Best-effort: tell the user whether the account already has Cloud keys.
  let keysMode = null
  try {
    const res = await cloudRest('/rest/v1/user_keys?select=mode')
    if (res.status < 400 && Array.isArray(res.json)) {
      if (res.json.length) {
        keysMode = res.json[0].mode
        out(`  Cloud keys: ${keysMode === 'e2ee' ? 'private (e2ee) — passphrase needed to sync' : 'standard (managed)'}`)
      } else {
        out('  No Cloud keys yet — run `noteflow cloud setup` (or set up Cloud in the desktop app)')
      }
    }
  } catch { /* informational only */ }

  // Managed keys unlock silently (no passphrase prompt), so the first pull can
  // run right away — best-effort: the session is already saved and a failure
  // must not look like a failed login. e2ee would need the passphrase (an
  // interactive prompt in the middle of login) → left to `noteflow pull`.
  if (keysMode !== 'managed') return
  if (opts.noPull) {
    out("  Skipped the initial pull (--no-pull). Run 'noteflow pull' to download your notes")
    return
  }
  try {
    await cmdCloudPull()
  } catch (e) {
    if (e instanceof CliExit) throw e // never expected (Cloud is active right after login)
    err(`Initial pull failed: ${e.message}`)
    out("  You are still signed in. Run 'noteflow pull' to retry")
  }
}

// noteflow cloud logout — best-effort server revocation, keeps cursor/lastSync
// (and cliCloud.userId, their owner: a re-login with another account resets them)
async function cmdCloudLogout() {
  const account = getCliAccount()
  if (!account) {
    patchCliCloud({ enabled: false })
    out('  Not signed in')
    return
  }
  try {
    const token = await getCloudAccessToken()
    // scope=local: revoke only the CLI's own session — the default (global)
    // would also sign out the desktop app and every other device.
    await supabaseFetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, { method: 'POST', accessToken: token })
  } catch { /* best-effort revocation */ }
  clearCliAccount()
  patchCliCloud({ enabled: false }) // keeps pullSeq/lastSync/userId — a same-account re-login resumes incrementally
  out('  Signed out of NoteFlow Cloud')
}

// noteflow cloud status [--json]
async function cmdCloudStatus(opts) {
  const account = getCliAccount()
  const c = getCliCloud()
  let keysMode = null // 'managed' | 'e2ee' | 'none' | null (unknown/unreachable)
  if (account) {
    try {
      const res = await cloudRest('/rest/v1/user_keys?select=mode')
      if (res.status < 400 && Array.isArray(res.json)) keysMode = res.json.length ? res.json[0].mode : 'none'
    } catch { /* offline or expired — leave unknown */ }
  }
  const gh = getSyncSettings()
  const noteCount = listLocalNoteDirs().length
  if (opts.json) {
    jsonOut({
      notesDir: NOTES_DIR,
      noteCount,
      cloud: account
        ? {
            email: account.email, enabled: !!c.enabled, keysMode, lastSync: c.lastSync || null,
            pullSeq: typeof c.pullSeq === 'number' ? c.pullSeq : null,
            pullCursor: c.pullCursor || null, // legacy: only until the first seq pull
          }
        : null,
      githubConfigured: !!(gh.enabled && gh.owner && gh.repo),
      desktopApp: readDesktopAppInfo(),
    })
    return
  }
  out('\n  NoteFlow Cloud')
  if (!account) {
    out('  Account:   not signed in — run: noteflow cloud login')
  } else {
    out(`  Account:   ${account.email}`)
    const keysLabel = keysMode === 'none' ? 'none — run: noteflow cloud setup'
      : keysMode === 'e2ee' ? 'private (e2ee)'
      : keysMode === 'managed' ? 'standard (managed)'
      : 'unknown (could not reach the server)'
    out(`  Keys:      ${keysLabel}`)
    out(`  Sync:      ${c.enabled ? 'enabled' : 'disabled'}`)
    if (c.lastSync) out(`  Last sync: ${c.lastSync}`)
    if (typeof c.pullSeq === 'number') out(`  Cursor:    seq ${c.pullSeq}`)
    else if (c.pullCursor) out(`  Cursor:    ${c.pullCursor} (legacy — next pull reconciles fully)`)
  }
  out(`  Notes:     ${noteCount} in ${NOTES_DIR}`)
  if (gh.enabled && gh.owner && gh.repo) {
    out(`  GitHub:    ${gh.owner}/${gh.repo}${cloudActive() ? ' (paused — NoteFlow Cloud takes priority)' : ''}`)
  }
  out('')
}

// noteflow cloud setup — MANAGED mode only: the e2ee setup (passphrase + the
// one-time recovery code UX) lives in the desktop app.
async function cmdCloudSetup() {
  if (!getCliAccount()) { err('Not signed in. Run: noteflow cloud login'); exit(1) }
  const token = await getCloudAccessToken()
  const dek = generateDek()
  const res = await supabaseFetch(`${CLOUD_KEYS_URL}/setup`, {
    method: 'POST',
    body: { dek: toB64Url(dek) },
    accessToken: token,
  })
  if (res.status === 409) { err('Cloud keys already exist for this account'); exit(1) }
  if (res.status >= 400) { err(`Could not set up the Cloud keys (HTTP ${res.status})`); exit(1) }
  out('  Cloud keys created (standard/managed mode)')
  out('  For private end-to-end encryption, set up NoteFlow Cloud in the desktop app instead.')
}

// noteflow cloud push (also plain `noteflow push` while Cloud is active)
async function cmdCloudPush() {
  if (!cloudActive()) { err('Not connected to NoteFlow Cloud. Run: noteflow cloud login'); exit(1) }
  if (!fs.existsSync(NOTES_DIR)) { out('  No notes to push'); return }
  await cloudEnsureReconciled()
  const dek = await getCliDek()

  // Folders whose remote version failed to apply here may be half-written:
  // pushing them would send old sections with the new anchor's timestamp.
  const halfApplied = dirsPendingRetry(getCliCloud().pullRetry)
  const noteFiles = []
  for (const dir of listLocalNoteDirs()) {
    if (halfApplied.has(dir)) continue
    for (const f of fs.readdirSync(path.join(NOTES_DIR, dir))) {
      if (f.endsWith('.md')) noteFiles.push(`${dir}/${f}`)
    }
  }
  // Catch-up of what changed only: a note file with a base goes up when it
  // differs from it (or is pending); without a base, as before (always).
  const relPaths = cloudFilesToUpload(noteFiles)
  const unchanged = noteFiles.length - relPaths.length
  for (const m of CLOUD_METADATA_FILES) {
    if (fs.existsSync(path.join(NOTES_DIR, m))) relPaths.push(m)
  }
  if (halfApplied.size) {
    out(`  Skipping ${halfApplied.size} note(s) whose remote changes are still pending here — run 'noteflow pull' first`)
  }

  out(`  Pushing ${relPaths.length} files to NoteFlow Cloud...${unchanged ? ` (${unchanged} unchanged since the last sync)` : ''}`)
  let pushed = 0, errors = 0
  const uploaded = [], failed = [], stale = []
  const forced = getCliCloud().forceUpserts
  // Stale (rejected: newer on the server) uploads stay pending like failures.
  const savePending = () => {
    flushCliCloudBasesBestEffort()
    patchCliCloud({
      pendingUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().pendingUpserts, [...failed, ...stale], uploaded)),
      forceUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().forceUpserts, [], uploaded)),
    })
  }
  for (const relPath of relPaths) {
    try {
      const noteKey = await cloudGetNoteKey(dek, noteDirOf(relPath) || relPath)
      const force = isPendingUpsert(forced, relPath)
      if ((await cloudPushFile(dek, noteKey, relPath, { force })) === 'stale') { stale.push(relPath); continue }
      uploaded.push(relPath)
      pushed++
      process.stdout.write(`\r  ${pushed}/${relPaths.length}`)
    } catch (e) {
      failed.push(relPath)
      if (e.subscription) { savePending(); process.stdout.write('\n'); err(e.message); exit(1) }
      errors++
      console.error(`\n  Failed: ${relPath} — ${e.message}`)
    }
  }
  savePending()
  patchCliCloud({ lastSync: new Date().toISOString() })
  out(`\n  Done: ${pushed} pushed, ${errors} errors`)
  if (stale.length) out(`  ${stale.length} file(s) ${STALE_UPLOAD_HINT}`)
}

// noteflow cloud pull (also plain `noteflow pull` while Cloud is active)
async function cmdCloudPull() {
  if (!cloudActive()) { err('Not connected to NoteFlow Cloud. Run: noteflow cloud login'); exit(1) }
  out('  Pulling from NoteFlow Cloud...')
  const { pulled, deleted, errors } = await cloudPullNow()
  out(`  Done: ${pulled} pulled, ${deleted} deleted, ${errors} errors`)
}

// ── Confirm prompt ────────────────────────────────────────────────────────────

async function confirm(question) {
  // In --json mode the prompt goes to stderr so stdout stays pure JSON
  const answer = await readPromptLine(`${question} (y/N) `, { output: jsonMode ? process.stderr : process.stdout })
  // No stdin to answer from (pipe/agent/cron): the default "N" — say how to skip the prompt.
  if (answer === null) console.error('  No answer (stdin is closed) — pass --yes to skip this confirmation')
  return answer !== null && answer.toLowerCase() === 'y'
}

/** Best-effort check: is the NoteFlow desktop app running? (it may overwrite CLI metadata edits) */
function isDesktopAppRunning() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      return /"NoteFlow\.exe"/i.test(out)
    }
    const out = execSync('ps -A -o comm=', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    return /(^|\/)noteflow$/im.test(out)
  } catch { return false }
}

/** Warn (to stderr) before mutating shared metadata the desktop app may clobber. */
function warnIfDesktopRunning(opts) {
  if ((opts && opts.json) || process.env.NOTEFLOW_NO_APP_CHECK) return
  if (isDesktopAppRunning())
    console.error('  ⚠ NoteFlow desktop appears to be running — it may overwrite group/folder changes made here. Close it first, or these changes may be lost on its next sync.')
}

// ── Commands ──────────────────────────────────────────────────────────────────

// noteflow add [<text>] [--text <t> | --file <p> | --stdin] [--title <t>] [--section <s>]
//              [--tag <t>] [--group <g>] [--raw|--markdown] [--create] [--dry-run] [--json]
async function cmdAdd(positionalText, opts) {
  // Content: positional arg XOR a flag source (--text/--file/--stdin, same helper as `set`).
  // Windows note: the .cmd shim truncates multi-line argv, so flag/stdin sources
  // are the reliable path for multi-line content.
  const hasFlagSource = typeof opts.text === 'string' || opts.file || opts.stdin
  if (positionalText && hasFlagSource) {
    err('Provide the content either as an argument or via --text/--file/--stdin — not both')
    exit(1)
  }

  // The target (note + group/folder) is resolved BEFORE reading the content, so
  // a wrong name fails fast — before stdin is consumed and before any write
  // (also under --dry-run, which must fail exactly like the real run).
  // --title resolves like every other note command: an exact title wins, a
  // partial one is fine when unique, several matches exit listing them.
  let existing = null
  if (opts.title) {
    const matches = findNoteByTitle(opts.title)
    failIfAmbiguousNote(matches) // also with --create: a near-miss must not spawn a sibling note
    existing = matches[0] || null
    // No match → creating a brand-new note is opt-in (--create), so a typo in
    // --title fails loudly instead of silently spawning a stray note.
    if (!existing && !opts.create) {
      err(`Note "${opts.title}" not found. Pass --create to create it, or use 'noteflow new'.`)
      exit(1)
    }
  } else {
    existing = findTodayNote() // the daily note keeps its auto-create behavior
  }
  // An unknown --group/--folder is an error (same messages as 'new'), never a silent "ungrouped".
  const placement = resolveGroupPlacement(opts)

  let text
  if (positionalText) text = positionalText.replace(/^﻿+/, '').replace(/\r\n?/g, '\n')
  else if (hasFlagSource || !process.stdin.isTTY) text = await resolveSetContent(opts)
  else { err('Usage: noteflow add <text> [options] — or provide content with --text "...", --file <path>, or --stdin'); exit(1) }
  if (!text) { err('No content to add'); exit(1) }
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })

  const targetTitle = opts.title || getTodayTitle()
  const explicitSection = typeof opts.section === 'string' && opts.section !== ''
  const sectionName = explicitSection ? opts.section : 'Note'
  // New sections default to markdown mode (the app renders them); --raw opts into
  // text mode (shown as-is). Existing sections never change mode.
  const isRaw = opts.raw === true
  const bytesWritten = Buffer.byteLength(text, 'utf-8')

  if (existing) {
    const note = readNoteFolder(existing.dirname)
    if (!note) { err(`Could not read note "${existing.title}"`); exit(1) }
    note.sections = note.sections || []

    // Find the target section. An EXPLICIT --section resolves like in `set`: exact
    // name (case-insensitive), '#n' picks among same-named ones, duplicate exact
    // names exit rather than guessing, and NO exact match is an error listing the
    // near/existing names — unless --create, which creates it (loosely similar
    // sections are then mentioned on stderr). Never written into by a loose match.
    // ⚠️ The implicit default ('Note', when no --section is given) must stay
    // exact-or-create WITHOUT the similar-names hint: the user named nothing, so
    // failing or flagging 'Meeting Notes' on every daily append would be noise, and
    // the '#n' parsing / duplicate-name exit must not apply either. Do NOT "unify"
    // these two branches.
    let sec = explicitSection
      ? matchSectionOrNull(note, sectionName)
      : note.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase()) || null
    const createdSection = !sec
    const newSectionName = explicitSection ? parseSectionRef(sectionName).baseName : sectionName
    // Before --dry-run on purpose: a dry run reproduces the error (validate without writing).
    if (createdSection && explicitSection && !opts.create) failUnknownSection(note, newSectionName, opts)
    // Computed before the new section is pushed; stderr keeps --json stdout and pipes clean.
    const similarNote = createdSection && explicitSection ? similarSectionsNote(note, newSectionName, opts.dryRun) : ''
    if (opts.dryRun) {
      if (similarNote) console.error(similarNote)
      const result = { note: note.title, dirname: note.dirname, section: sec ? sec.name : newSectionName, createdNote: false, createdSection, bytesWritten, dryRun: true }
      if (opts.json) { jsonOut(result); return }
      out(`  [dry-run] Would append ${text.length} chars to "${note.title}" → "${result.section}"${createdSection ? ' (new section)' : ''} — nothing written`)
      return
    }
    if (!sec) {
      sec = { id: nanoid(6), name: newSectionName, content: '', isRawMode: isRaw, created: new Date().toISOString() }
      note.sections.push(sec)
      out(`  Created section "${newSectionName}"`)
      if (similarNote) console.error(similarNote)
    }
    const base = (sec.content || '').replace(/\n$/, '')
    sec.content = base ? base + '\n' + text : text
    if (opts.tag && !note.tags.includes(opts.tag)) note.tags.push(opts.tag)
    if (placement) {
      // Like 'move': a folder belongs to one group, so changing the group
      // without --folder takes the note to the new group's root.
      if (placement.folderId) note.folder = placement.folderId
      else if (note.group !== placement.groupId) delete note.folder
      note.group = placement.groupId
    }
    writeNoteFolder(note.dirname, note)
    if (opts.json) jsonOut({ note: note.title, dirname: note.dirname, section: sec.name, createdNote: false, createdSection, bytesWritten })
    else out(`  Added to "${note.title}" → "${sec.name}" (+${text.length} chars)`)
    await syncPushNoteFiles(note.dirname, [NOTE_MD, `${sec.id}.md`])
  } else {
    if (opts.dryRun) {
      // dirname is null: it embeds a random id that only gets minted on real creation
      const result = { note: targetTitle, dirname: null, section: sectionName, createdNote: true, createdSection: true, bytesWritten, dryRun: true }
      if (opts.json) { jsonOut(result); return }
      out(`  [dry-run] Would create note "${targetTitle}" with section "${sectionName}" (${text.length} chars) — nothing written`)
      return
    }
    const id = nanoid(8)
    const now = new Date().toISOString()
    const { groupId, folderId } = placement || {}
    const note = {
      id, title: targetTitle,
      tags: opts.tag ? [opts.tag] : [],
      created: now, updated: now,
      sections: [{ id: nanoid(6), name: sectionName, content: text, isRawMode: isRaw, created: now }],
      ...(groupId ? { group: groupId } : {}),
      ...(folderId ? { folder: folderId } : {}),
    }
    const dirname = noteDirname(id, note.title)
    const written = writeNoteFolder(dirname, note)
    if (opts.json) jsonOut({ note: targetTitle, dirname, section: sectionName, createdNote: true, createdSection: true, bytesWritten })
    else out(`  Created note "${targetTitle}" → "${sectionName}" (dirname: ${dirname})`)
    await syncPushNoteFiles(dirname, written)
  }
}

// noteflow new <title> [--section <s>] [--group <g>] [--folder <f>] [--raw] [--json]
async function cmdNew(title, opts) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  const id = nanoid(8)
  const now = new Date().toISOString()
  const { groupId, folderId } = resolveGroupPlacement(opts) || {}
  const note = {
    id, title, tags: [], created: now, updated: now,
    sections: [{ id: nanoid(6), name: opts.section || 'Note', content: '', isRawMode: opts.raw === true, created: now }],
    ...(groupId ? { group: groupId } : {}),
    ...(folderId ? { folder: folderId } : {}),
  }
  const dirname = noteDirname(id, title)
  const written = writeNoteFolder(dirname, note)
  if (opts.json) { jsonOut({ id, title, dirname }); return }
  out(`  Created "${title}"  →  ${dirname}/`)
  await syncPushNoteFiles(dirname, written)
}

// noteflow list [--tag <t>] [--group <g>] [--archived] [--json]
function cmdList(opts) {
  const notes = loadAllNotes()
  let filtered = notes
  if (opts.tag)      filtered = filtered.filter(n => n.tags && n.tags.includes(opts.tag))
  if (opts.group) {
    const g = findGroup(opts.group)
    filtered = g ? filtered.filter(n => n.group === g.id) : []
  }
  if (opts.folder) {
    const f = resolveFolder(opts.folder, opts)
    filtered = filtered.filter(n => n.folder === f.id)
  }
  if (!opts.archived) filtered = filtered.filter(n => !n.archived)
  filtered.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))

  if (opts.json) {
    jsonOut(filtered.map(n => ({
      id: n.id, title: n.title, tags: n.tags, group: n.group, folder: n.folder,
      created: n.created, updated: n.updated, archived: n.archived, favorited: n.favorited ?? n.pinned ?? false,
      sections: n.sections?.map(s => s.name),
      dirname: n.dirname,
    })))
    return
  }

  if (!filtered.length) { out('  No notes found'); return }
  const groups = readGroups()
  const folders = readFolders()
  out('')
  for (const n of filtered) {
    const g = n.group ? groups.find(gr => gr.id === n.group) : null
    const f = n.folder ? folders.find(fo => fo.id === n.folder) : null
    const tags = n.tags?.length ? `  [${n.tags.join(', ')}]` : ''
    const grp  = g ? `  (${g.name}${f ? ` / ${f.name}` : ''})` : ''
    const fav  = (n.favorited || n.pinned) ? ' ⭐' : ''
    const arc  = n.archived ? ' [archived]' : ''
    out(`  ${n.title}${fav}${arc}${tags}${grp}`)
    out(`    ${n.dirname}/`)
  }
  out('')
}

// noteflow get <title> [--section <s>] [--json]
function cmdGet(titleQuery, opts) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); exit(1) }
  if (matches.length > 1 && !opts.json) {
    out(`  Multiple matches — be more specific:`)
    matches.forEach(n => out(`    ${n.title}  (${n.dirname}/)`))
    exit(1)
  }
  const note = matches[0]

  if (opts.json) {
    const result = {
      id: note.id, title: note.title, tags: note.tags, group: note.group, folder: note.folder,
      created: note.created, updated: note.updated, archived: note.archived, favorited: note.favorited ?? note.pinned ?? false,
      sections: note.sections?.map(s => ({ id: s.id, name: s.name, content: s.content, isRawMode: s.isRawMode })),
      dirname: note.dirname,
    }
    jsonOut(result)
    return
  }

  out(`\n  ${note.title}`)
  out(`  ${'─'.repeat(note.title.length)}`)
  if (note.tags?.length) out(`  Tags: ${note.tags.join(', ')}`)
  out('')
  const sections = opts.section
    ? note.sections?.filter(s => s.name.toLowerCase() === opts.section.toLowerCase())
    : note.sections
  for (const s of sections || []) {
    out(`  [${s.name}]`)
    out(s.content ? s.content.split('\n').map(l => '    ' + l).join('\n') : '    (empty)')
    out('')
  }
}

// noteflow delete <title> [--yes] [--json]
async function cmdDelete(titleQuery, opts) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.dirname}/)`))
    exit(1)
  }
  const note = matches[0]
  if (!opts.yes) {
    const ok = await confirm(`Delete "${note.title}"?`)
    if (!ok) {
      if (opts.json) jsonOut({ deleted: false, note: note.title })
      else out('  Cancelled')
      return
    }
  }
  fs.rmSync(note.filePath, { recursive: true, force: true })
  if (opts.json) jsonOut({ deleted: true, note: note.title })
  else out(`  Deleted "${note.title}"`)

  // Remove the note from the remote too — Cloud (tombstones) takes priority.
  if (cloudActive()) {
    try {
      const dek = await getCliDek()
      // path_key is opaque by design — list + decrypt to find the dir's rows.
      const remote = await cloudListRemotePaths(dek)
      const targets = remote.filter(r => r.relPath.startsWith(`${note.dirname}/`))
      await cloudTombstonePathKeys(targets.map(t => t.pathKey))
      // The folder is gone everywhere: its bases are moot.
      dropCliCloudBasesUnder(note.dirname)
      flushCliCloudBasesBestEffort()
      out('  Deleted from NoteFlow Cloud')
    } catch (e) { err(`Cloud delete failed: ${e.message}`) }
    return
  }

  // Remove the whole note dir from GitHub if connected
  const sync = getSyncSettings()
  if (sync.enabled && sync.owner && sync.repo) {
    const token = getToken()
    if (token) {
      const bases = loadGithubBases(sync)
      try {
        const blobs = await listRemoteTree(token, sync.owner, sync.repo)
        const targets = blobs.filter(b => b.path.startsWith(`${note.dirname}/`))
        if (githubConditionalActive() && remoteDirChangesSinceBase(bases, targets).length > 0) {
          // Changed on GitHub since this machine last saw it: the remote edit
          // wins over the local deletion (nothing deleted there).
          out("  Not deleted on GitHub: the note changed there since your last pull — 'noteflow pull' brings it back")
        } else {
          for (const b of targets) {
            await removeRemoteFile(token, sync.owner, sync.repo, b.path, `delete: ${note.title}`)
          }
          out('  Deleted from GitHub')
        }
      } catch { /* ignore remote errors */ }
      for (const rel of Object.keys(bases)) if (rel.startsWith(`${note.dirname}/`)) delete bases[rel]
      saveGithubBases(sync, bases)
    }
  }
}

// noteflow favorite <title>
async function cmdFavorite(titleQuery) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.dirname}/)`)); exit(1)
  }
  const note = matches[0]
  note.favorited = !(note.favorited || note.pinned)
  delete note.pinned
  writeNoteFolder(note.dirname, note)
  out(`  "${note.title}" ${note.favorited ? 'added to favorites' : 'removed from favorites'}`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD])
}

// noteflow archive <title>
async function cmdArchive(titleQuery) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.dirname}/)`)); exit(1)
  }
  const note = matches[0]
  note.archived = !note.archived
  writeNoteFolder(note.dirname, note)
  out(`  "${note.title}" ${note.archived ? 'archived' : 'unarchived'}`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD])
}

// noteflow rename <old-title> <new-title>
async function cmdRename(oldTitle, newTitle) {
  const matches = findNoteByTitle(oldTitle)
  if (!matches.length) { err(`No note found: "${oldTitle}"`); exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.dirname}/)`)); exit(1)
  }
  const note = matches[0]
  note.title = newTitle
  // The directory name is frozen at creation — only note.md changes
  writeNoteFolder(note.dirname, note)
  out(`  Renamed to "${newTitle}"`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD])
}

// noteflow sections <title>
function cmdSections(titleQuery) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.dirname}/)`)); exit(1)
  }
  const note = matches[0]
  out(`\n  Sections of "${note.title}":`)
  for (const s of note.sections || []) {
    const lines = lineCount(s.content)
    out(`    ${s.name}  (${lines} lines${s.isRawMode ? ', text' : ', markdown'}${s.aiHidden ? ', hidden from AI' : ''})`)
  }
  out('')
}

// noteflow read <title> [section]  — raw, pipe-friendly output (no decoration)
function cmdRead(titleQuery, sectionName, opts) {
  const note = resolveNote(titleQuery)
  if (sectionName) {
    const sec = resolveSection(note, sectionName, { loose: true }) // read-only: a loose name match is safe here
    if (opts.json) {
      jsonOut({ id: note.id, title: note.title, section: sec.name, content: sec.content || '', isRawMode: sec.isRawMode })
      return
    }
    process.stdout.write((sec.content || '') + '\n')
    return
  }
  if (opts.json) {
    jsonOut({
      id: note.id, title: note.title, tags: note.tags, group: note.group, folder: note.folder,
      sections: (note.sections || []).map(s => ({ id: s.id, name: s.name, content: s.content, isRawMode: s.isRawMode })),
      dirname: note.dirname,
    })
    return
  }
  let buf = `# ${note.title}\n`
  if (note.tags?.length) buf += `\ntags: ${note.tags.join(', ')}\n`
  for (const s of note.sections || []) buf += `\n## ${s.name}\n${s.content || ''}\n`
  process.stdout.write(buf)
}

// noteflow path <title> [section]  — absolute paths, pipe-friendly (no decoration)
// Lets an agent edit a section's .md with its own tools instead of read/set round-trips.
// Pair it with 'noteflow touch <title>' afterwards to bump `updated:` and sync.
function cmdPath(titleQuery, sectionName, opts) {
  const note = resolveNote(titleQuery)
  const dir = path.resolve(note.filePath)
  if (sectionName) {
    const sec = resolveSection(note, sectionName, { loose: true }) // read-only: a loose name match is safe here
    const file = sectionFilePath(note, sec)
    if (opts.json) {
      jsonOut({ id: note.id, title: note.title, dir, section: sec.name, file, isRawMode: sec.isRawMode })
      return
    }
    process.stdout.write(file + '\n')
    return
  }
  if (opts.json) {
    jsonOut({
      id: note.id, title: note.title, dir, noteFile: path.join(dir, NOTE_MD),
      sections: (note.sections || []).map(s => ({ id: s.id, name: s.name, file: sectionFilePath(note, s), isRawMode: s.isRawMode })),
    })
    return
  }
  process.stdout.write(dir + '\n')
}

// noteflow touch <title>  — after editing a section .md by hand: bump `updated:` and push
async function cmdTouch(titleQuery) {
  const found = resolveNote(titleQuery)
  // Re-read from disk right before writing: writeNoteFolder rewrites every
  // section file from note.sections[].content, so a stale copy would clobber
  // the very edit we are here to publish.
  const note = readNoteFolder(found.dirname)
  if (!note) { err(`Could not read note "${found.title}"`); exit(1) }
  const written = writeNoteFolder(note.dirname, note)
  const stamp = extractUpdatedTimestamp(fs.readFileSync(path.join(NOTES_DIR, note.dirname, NOTE_MD), 'utf-8'))
  out(`  Updated "${note.title}"  (updated: ${stamp})`)
  await syncPushNoteFiles(note.dirname, written)
}

// noteflow set <title> <section> [--text <t> | --file <p> | --stdin] [--create] [--raw] [--dry-run] [--json]
// Overwrites the section's content (--create: creates it if missing). Complements `add` (append).
async function cmdSet(titleQuery, sectionName, opts) {
  const note = resolveNote(titleQuery)
  // Exact name only — never a loose match: overwriting the wrong section loses
  // data. Duplicate exact names exit with a '#n' hint rather than guessing, and no
  // exact match is an error (with near names) unless --create. Resolved BEFORE
  // reading the content so a wrong name fails fast, before stdin is consumed.
  let sec = matchSectionOrNull(note, sectionName)
  const createdSection = !sec
  if (createdSection && !opts.create) failUnknownSection(note, parseSectionRef(sectionName).baseName, opts)
  const content = await resolveSetContent(opts)
  const bytesWritten = Buffer.byteLength(content, 'utf-8')
  // Computed before the new section is pushed; stderr keeps --json stdout and pipes clean.
  const similarNote = createdSection ? similarSectionsNote(note, parseSectionRef(sectionName).baseName, opts.dryRun) : ''
  if (opts.dryRun) {
    if (similarNote) console.error(similarNote)
    const result = { note: note.title, dirname: note.dirname, section: sec ? sec.name : parseSectionRef(sectionName).baseName, createdNote: false, createdSection, bytesWritten, dryRun: true }
    if (opts.json) { jsonOut(result); return }
    out(`  [dry-run] Would ${createdSection ? 'create' : 'overwrite'} section "${result.section}" in "${note.title}" (${content.length} chars) — nothing written`)
    return
  }
  if (!sec) {
    sec = { id: nanoid(6), name: parseSectionRef(sectionName).baseName, content: '', isRawMode: opts.raw === true, created: new Date().toISOString() }
    note.sections = note.sections || []
    note.sections.push(sec)
  }
  sec.content = content
  writeNoteFolder(note.dirname, note)
  if (createdSection) out(`  Created section "${sec.name}"`)
  if (similarNote) console.error(similarNote)
  if (opts.json) jsonOut({ note: note.title, dirname: note.dirname, section: sec.name, createdNote: false, createdSection, bytesWritten })
  else out(`  Set "${note.title}" → "${sec.name}"  (${content ? lineCount(content) + ' lines' : 'empty'})`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD, `${sec.id}.md`])
}

// noteflow section add <title> <name> [--raw]  — append a new (possibly duplicate-named) section
// (markdown mode by default, --raw for text mode)
async function cmdSectionAdd(titleQuery, name, opts) {
  const note = resolveNote(titleQuery)
  const sec = { id: nanoid(6), name, content: '', isRawMode: opts.raw === true, created: new Date().toISOString() }
  note.sections = note.sections || []
  note.sections.push(sec)
  writeNoteFolder(note.dirname, note)
  out(`  Added section "${name}" to "${note.title}"`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD, `${sec.id}.md`])
}

// noteflow section rename <title> <old> <new>
async function cmdSectionRename(titleQuery, oldName, newName) {
  const note = resolveNote(titleQuery)
  const sec = resolveSection(note, oldName) // exact only: loose candidates are just a "Did you mean"
  const prev = sec.name
  sec.name = newName
  writeNoteFolder(note.dirname, note) // section file is keyed by id — only note.md changes
  out(`  Renamed section "${prev}" → "${newName}" in "${note.title}"`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD])
}

// noteflow section delete <title> <name> [--yes]
async function cmdSectionDelete(titleQuery, name, opts) {
  const note = resolveNote(titleQuery)
  const sec = resolveSection(note, name) // exact only: loose candidates are just a "Did you mean"
  if ((note.sections || []).length <= 1) {
    err(`Cannot delete the last section of "${note.title}" — a note must keep at least one section`)
    exit(1)
  }
  if (!opts.yes) {
    const ok = await confirm(`Delete section "${sec.name}" from "${note.title}"?`)
    if (!ok) { out('  Cancelled'); return }
  }
  const removedFile = `${sec.id}.md`
  note.sections = note.sections.filter(s => s !== sec)
  writeNoteFolder(note.dirname, note) // drops the orphan <id>.md (not in the keep set)
  out(`  Deleted section "${sec.name}" from "${note.title}"`)
  const { conflicted } = await syncPushNoteFiles(note.dirname, [NOTE_MD])
  // Remove the section's file from the remote too, or a pull would resurrect it
  if (cloudActive()) {
    try { await cloudTombstoneRelPaths([`${note.dirname}/${removedFile}`]) }
    catch (e) { err(`Cloud delete failed: ${e.message}`) }
    return
  }
  // The note changed on GitHub and was resolved: merged (the merge already
  // deleted the section there if GitHub had not changed it, or brought it
  // back if it had), or its version taken with a conflict copy — deleting a
  // section of the version just downloaded would break it.
  if (conflicted) return
  const sync = getSyncSettings()
  if (sync.enabled && sync.owner && sync.repo) {
    const token = getToken()
    if (token) {
      const bases = loadGithubBases(sync)
      try {
        const res = await removeRemoteFile(token, sync.owner, sync.repo, `${note.dirname}/${removedFile}`, `delete section: ${sec.name}`, bases)
        if (res === 'conflict') {
          out("  Section not deleted on GitHub: it changed there since your last pull — 'noteflow pull' brings the newer note")
        }
      } catch { /* ignore remote errors */ }
      saveGithubBases(sync, bases)
    }
  }
}

// noteflow groups [--json]
function cmdGroups(opts) {
  const groups = readGroups()
  if (opts.json) { jsonOut(groups); return }
  if (!groups.length) { out('  No groups'); return }
  out('')
  for (const g of groups) out(`  ${g.name}  (id: ${g.id}, color: ${g.color})`)
  out('')
}

// noteflow group create <name> [--color <color>]
function cmdGroupCreate(name, opts) {
  warnIfDesktopRunning(opts)
  const groups = readGroups()
  if (groups.find(g => g.name.toLowerCase() === name.toLowerCase())) {
    err(`Group "${name}" already exists`); exit(1)
  }
  const color = opts.color
    ? (GROUP_COLORS.find(c => c.includes(opts.color)) || '--accent')
    : '--accent'
  const g = { id: nanoid(8), name, color, order: groups.length }
  groups.push(g)
  writeGroups(groups)
  if (opts.json) { jsonOut(g); return }
  out(`  Created group "${name}"  (id: ${g.id})`)
}

// noteflow group delete <name> [--yes]
async function cmdGroupDelete(name, opts) {
  warnIfDesktopRunning(opts)
  const groups = readGroups()
  const g = groups.find(gr => gr.name.toLowerCase() === name.toLowerCase() || gr.id === name)
  if (!g) { err(`Group not found: "${name}"`); exit(1) }
  if (!opts.yes) {
    const ok = await confirm(`Delete group "${g.name}"? (Notes will be ungrouped)`)
    if (!ok) { out('  Cancelled'); return }
  }
  const updated = groups.filter(gr => gr.id !== g.id)
  writeGroups(updated)
  // Drop the group's folders too (they only exist inside a group)
  const folders = readFolders()
  const remainingFolders = folders.filter(f => f.groupId !== g.id)
  if (remainingFolders.length !== folders.length) writeFolders(remainingFolders)
  // Ungroup notes that were in this group (clear both group and folder)
  const notes = loadAllNotes()
  for (const n of notes.filter(n => n.group === g.id)) {
    delete n.group
    delete n.folder
    writeNoteFolder(n.dirname, n)
  }
  out(`  Deleted group "${g.name}"`)
}

// noteflow folders [--group <g>] [--json]
function cmdFolders(opts) {
  let folders = readFolders()
  const groups = readGroups()
  if (opts.group) {
    const g = findGroup(opts.group)
    if (!g) { err(`Group not found: "${opts.group}"`); exit(1) }
    folders = folders.filter(f => f.groupId === g.id)
  }
  if (opts.json) { jsonOut(folders); return }
  if (!folders.length) { out('  No folders'); return }
  const byGroup = new Map()
  for (const f of folders) {
    if (!byGroup.has(f.groupId)) byGroup.set(f.groupId, [])
    byGroup.get(f.groupId).push(f)
  }
  out('')
  for (const [gid, list] of byGroup) {
    const g = groups.find(gr => gr.id === gid)
    out(`  ${g ? g.name : '(unknown group)'}:`)
    for (const f of list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
      out(`    ${f.name}  (id: ${f.id})`)
  }
  out('')
}

// noteflow folder create <name> --group <group>
function cmdFolderCreate(name, opts) {
  warnIfDesktopRunning(opts)
  if (!opts.group) { err('A folder needs a group. Use: noteflow folder create <name> --group <group>'); exit(1) }
  const g = findGroup(opts.group)
  if (!g) { err(`Group not found: "${opts.group}"`); exit(1) }
  const folders = readFolders()
  if (folders.find(f => f.groupId === g.id && f.name.toLowerCase() === name.toLowerCase())) {
    err(`Folder "${name}" already exists in group "${g.name}"`); exit(1)
  }
  const siblings = folders.filter(f => f.groupId === g.id)
  const maxOrder = siblings.length ? Math.max(...siblings.map(f => f.order ?? 0)) : -1
  const folder = { id: nanoid(8), name, groupId: g.id, order: maxOrder + 1 }
  folders.push(folder)
  writeFolders(folders)
  if (opts.json) { jsonOut(folder); return }
  out(`  Created folder "${name}" in group "${g.name}"  (id: ${folder.id})`)
}

// noteflow folder rename <name> <new-name> [--group <g>]
function cmdFolderRename(name, newName, opts) {
  warnIfDesktopRunning(opts)
  const folder = resolveFolder(name, opts)
  const folders = readFolders()
  const g = readGroups().find(gr => gr.id === folder.groupId)
  if (folders.find(f => f.groupId === folder.groupId && f.id !== folder.id && f.name.toLowerCase() === newName.toLowerCase())) {
    err(`Folder "${newName}" already exists in group "${g ? g.name : folder.groupId}"`); exit(1)
  }
  writeFolders(folders.map(f => (f.id === folder.id ? { ...f, name: newName } : f)))
  out(`  Renamed folder "${folder.name}" → "${newName}"`)
}

// noteflow folder delete <name> [--group <g>] [--yes]
async function cmdFolderDelete(name, opts) {
  warnIfDesktopRunning(opts)
  const folder = resolveFolder(name, opts)
  if (!opts.yes) {
    const ok = await confirm(`Delete folder "${folder.name}"? (Notes inside fall back to the group root)`)
    if (!ok) { out('  Cancelled'); return }
  }
  writeFolders(readFolders().filter(f => f.id !== folder.id))
  // Notes in this folder keep their group but lose the folder
  const notes = loadAllNotes()
  for (const n of notes.filter(n => n.folder === folder.id)) {
    delete n.folder
    writeNoteFolder(n.dirname, n)
    await syncPushNoteFiles(n.dirname, [NOTE_MD])
  }
  out(`  Deleted folder "${folder.name}"`)
}

// noteflow move <title> --group <g> [--folder <f>]  |  --ungroup
async function cmdMove(titleQuery, opts) {
  const note = resolveNote(titleQuery)
  if (opts.ungroup) {
    delete note.group
    delete note.folder
    writeNoteFolder(note.dirname, note)
    out(`  Moved "${note.title}" to ungrouped`)
    await syncPushNoteFiles(note.dirname, [NOTE_MD])
    return
  }
  if (!opts.group) { err('Usage: noteflow move <title> --group <g> [--folder <f>]   (or --ungroup)'); exit(1) }
  const g = findGroup(opts.group)
  if (!g) { err(`Group not found: "${opts.group}"`); exit(1) }
  note.group = g.id
  if (opts.folder) {
    const matches = findFolders(opts.folder, g.id)
    if (!matches.length) { err(`Folder "${opts.folder}" not found in group "${g.name}"`); exit(1) }
    if (matches.length > 1) { err(`Multiple folders match "${opts.folder}" in "${g.name}"`); exit(1) }
    note.folder = matches[0].id
  } else {
    delete note.folder // moving to the group root
  }
  writeNoteFolder(note.dirname, note)
  out(`  Moved "${note.title}" → ${g.name}${note.folder ? ` / ${opts.folder}` : ''}`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD])
}

// ── GitHub login (Device Flow) ───────────────────────────────────────────────
//
// `noteflow login --no-wait` asks for the device code and exits; the pending
// grant waits in settings.cliGithubLogin (CLI-owned, like cliAccount/cliCloud;
// the desktop app never reads it) until `noteflow login --finish` polls it.
// Lets an agent with no long-lived terminal hand the code to the user.

/** Pure: the `login` flag combination is invalid → its error message, else null. */
function loginFlagsError(opts = {}) {
  if (opts.noWait && opts.finish) return '--no-wait and --finish cannot be used together'
  if (opts.json && !opts.noWait) return "--json only works with 'login --no-wait' (the other forms print no JSON)"
  return null
}

/**
 * Pure: validates the pending Device Flow grant saved by `login --no-wait`.
 * Returns { ok: true, pending } or { ok: false, reason: 'missing' | 'expired' }
 * (a malformed entry counts as missing: there is nothing usable to poll).
 */
function checkPendingGithubLogin(raw, nowMs) {
  if (!raw || typeof raw !== 'object' || typeof raw.deviceCode !== 'string' || !raw.deviceCode) {
    return { ok: false, reason: 'missing' }
  }
  const expiresMs = Date.parse(raw.expiresAt)
  if (!Number.isFinite(expiresMs)) return { ok: false, reason: 'missing' }
  if (expiresMs <= nowMs) return { ok: false, reason: 'expired' }
  const interval = Number.isFinite(raw.interval) && raw.interval > 0 ? raw.interval : 5
  const repo = typeof raw.repo === 'string' && raw.repo ? raw.repo : DEFAULT_REPO
  const owner = typeof raw.owner === 'string' && raw.owner ? raw.owner : undefined
  return { ok: true, pending: { ...raw, interval, repo, owner, expiresMs } }
}

const GITHUB_NAME_RE = /^[A-Za-z0-9._-]+$/

/**
 * Pure: the `login` repo argument — `repo` or `owner/repo` (default
 * noteflow-notes) → { repo, owner? } | { error }. Validated before asking for
 * a device code. The owner can't be checked until GitHub says who signed in
 * (loginOwnerError).
 */
function parseRepoSpec(spec) {
  if (spec === undefined || spec === null || spec === '') return { repo: DEFAULT_REPO }
  const parts = String(spec).split('/')
  const bad = parts.length > 2 || parts.some(p => !GITHUB_NAME_RE.test(p) || p === '.' || p === '..')
  if (bad) return { error: `"${spec}" is not a valid GitHub repo: use a repo name (letters, digits, '.', '-', '_'), optionally as owner/repo` }
  return parts.length === 2 ? { owner: parts[0], repo: parts[1] } : { repo: parts[0] }
}

/**
 * Pure: an `owner/repo` of ANOTHER account → the error, else null. The CLI only
 * syncs repos of the account that signed in (it creates the repo under it if
 * missing), so a foreign owner must fail before anything is created or saved.
 */
function loginOwnerError(target, userLogin) {
  if (!target.owner || target.owner.toLowerCase() === String(userLogin).toLowerCase()) return null
  return `"${target.owner}/${target.repo}" is not a repo of the account you signed in with (${userLogin}): `
    + 'the CLI only syncs repos of that account. Nothing was created or saved. '
    + `Run 'noteflow login ${target.repo}' to use ${userLogin}/${target.repo}, or sign in to GitHub as ${target.owner} and log in again`
}

/**
 * Pure: the repo `login --finish` connects. The pending grant was requested for
 * a repo and wins; a repo argument is only accepted when it names the same one
 * (a different one is an error, never a silent switch). An owner given now
 * (with no owner pending) is kept so it is still checked against the account.
 * Returns { repo, owner? } | { error }.
 */
function resolveFinishRepo(pendingRepo, repoArg, pendingOwner) {
  const pending = pendingOwner ? { repo: pendingRepo, owner: pendingOwner } : { repo: pendingRepo }
  if (!repoArg) return pending
  const arg = parseRepoSpec(repoArg)
  if (arg.error) return { error: arg.error }
  const sameRepo = arg.repo.toLowerCase() === pendingRepo.toLowerCase()
  const sameOwner = !arg.owner || !pendingOwner || arg.owner.toLowerCase() === pendingOwner.toLowerCase()
  if (sameRepo && sameOwner) return arg.owner && !pendingOwner ? { repo: pendingRepo, owner: arg.owner } : pending
  const label = pendingOwner ? `${pendingOwner}/${pendingRepo}` : pendingRepo
  return { error: `The pending login is for "${label}", not "${repoArg}". Run 'noteflow login --finish' without a repo, or start over with 'noteflow login ${repoArg} --no-wait'` }
}

function setPendingGithubLogin(pending) {
  const settings = readSettings()
  if (pending) settings.cliGithubLogin = pending
  else delete settings.cliGithubLogin
  writeSettings(settings) // owner-only (0600) on POSIX: it holds the device code
}

function openInBrowser(url) {
  try {
    if (process.platform === 'linux') execSync(`xdg-open "${url}" 2>/dev/null`, { stdio: 'ignore' })
    else if (process.platform === 'win32') execSync(`start "" "${url}"`, { stdio: 'ignore', shell: true })
    else if (process.platform === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' })
  } catch { /* headless */ }
}

async function requestGithubDeviceCode() {
  out('\n  Authenticating with GitHub...')
  const data = await githubAuthPost('/login/device/code', { client_id: GITHUB_CLIENT_ID, scope: 'repo' })
  if (data.error) { err(data.error_description || data.error); exit(1) }
  out(`\n  Go to:  ${data.verification_uri}`)
  out(`  Enter:  ${data.user_code}\n`)
  openInBrowser(data.verification_uri)
  return data
}

/**
 * Polls the Device Flow token endpoint until GitHub authorizes, refuses or the
 * code expires (respects `interval` and `slow_down`). `immediate` = first poll
 * right away (`--finish`: the user says they already authorized). Returns
 * { token } | { expired: true } | { error } — the caller decides how to fail.
 */
async function pollGithubDeviceToken(deviceCode, intervalSec, expiresMs, { immediate = false } = {}) {
  let interval = intervalSec * 1000
  let first = immediate
  // Progress dots: stderr under --json, so stdout stays pure JSON.
  const progress = s => (jsonMode ? process.stderr : process.stdout).write(s)
  progress('  Waiting for authorization')
  while (Date.now() < expiresMs) {
    if (!first) await new Promise(r => setTimeout(r, interval))
    first = false
    progress('.')
    const result = await githubAuthPost('/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID, device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
    if (result.access_token) { progress('\n'); return { token: result.access_token } }
    if (result.error === 'slow_down') interval += 5000
    else if (result.error === 'expired_token') { progress('\n'); return { expired: true } }
    else if (result.error !== 'authorization_pending') {
      progress('\n'); return { error: result.error_description || result.error }
    }
  }
  progress('\n')
  return { expired: true }
}

// noteflow login [repo] [--no-pull]              interactive: waits for the grant
// noteflow login [repo] --no-wait [--json]       step 1: print the code, exit
// noteflow login --finish [--no-pull]            step 2: poll the pending grant
async function cmdLogin(repoName, opts = {}) {
  const flagsError = loginFlagsError(opts)
  if (flagsError) { err(flagsError); exit(1) }
  if (opts.finish) { await cmdLoginFinish(repoName, opts); return }

  // `repo` or `owner/repo`, validated before asking GitHub for a code.
  const target = parseRepoSpec(repoName)
  if (target.error) { err(target.error); exit(1) }
  const { repo } = target
  const data = await requestGithubDeviceCode()
  const intervalSec = parseInt(data.interval) || 5
  const expiresMs = Date.now() + parseInt(data.expires_in) * 1000

  if (opts.noWait) {
    const expiresAt = new Date(expiresMs).toISOString()
    setPendingGithubLogin({
      deviceCode: data.device_code, userCode: data.user_code, verificationUri: data.verification_uri,
      interval: intervalSec, expiresAt, repo,
      ...(target.owner ? { owner: target.owner } : {}),
      ...(opts.noPull ? { noPull: true } : {}),
    })
    out(`  Authorize in the browser, then run: noteflow login --finish  (the code expires at ${expiresAt})`)
    if (opts.json) jsonOut({ verificationUri: data.verification_uri, userCode: data.user_code, expiresAt, repo })
    return
  }

  const result = await pollGithubDeviceToken(data.device_code, intervalSec, expiresMs)
  if (result.error) { err(result.error); exit(1) }
  if (!result.token) { err('Authorization expired. Try again.'); exit(1) }
  await completeGithubLogin(result.token, target, opts)
}

async function cmdLoginFinish(repoArg, opts) {
  const argError = repoArg ? parseRepoSpec(repoArg).error : null
  if (argError) { err(argError); exit(1) }
  const check = checkPendingGithubLogin(readSettings().cliGithubLogin, Date.now())
  if (!check.ok) {
    if (check.reason === 'expired') setPendingGithubLogin(null)
    err(check.reason === 'expired'
      ? "The pending GitHub login has expired. Run 'noteflow login --no-wait' again"
      : "No pending GitHub login. Run 'noteflow login --no-wait' first")
    exit(1)
  }
  const { pending } = check
  const target = resolveFinishRepo(pending.repo, repoArg, pending.owner)
  if (target.error) { err(target.error); exit(1) }

  out(`\n  Finishing the GitHub login (code ${pending.userCode || '?'}, repo ${target.repo})...`)
  // A network failure throws out of here and KEEPS the pending grant, so
  // `--finish` can simply be run again; only definitive outcomes drop it.
  const result = await pollGithubDeviceToken(pending.deviceCode, pending.interval, pending.expiresMs, { immediate: true })
  // From here on the device code is spent (GitHub issues one token per code):
  // drop the pending grant now, so a failure while connecting (GET /user,
  // creating the repo) asks for a fresh --no-wait instead of re-polling a dead code.
  setPendingGithubLogin(null)
  if (!result.token) {
    err(result.error
      ? `${String(result.error).replace(/\.+$/, '')}. Run 'noteflow login --no-wait' to start over`
      : "Authorization expired. Run 'noteflow login --no-wait' again")
    exit(1)
  }
  await completeGithubLogin(result.token, target, { ...opts, noPull: opts.noPull || pending.noPull })
}

/**
 * Everything after GitHub granted a token, shared by the interactive and the
 * `--finish` flows: checks an `owner/` prefix against the account, creates the
 * repo if needed, saves githubSync (same-repo rules), drops any pending
 * `--no-wait` grant and runs the first pull. `target` = { repo, owner? }.
 */
async function completeGithubLogin(token, target, opts) {
  const user = await githubRequest(token, 'GET', '/user')
  out(`  Logged in as ${user.login}`)
  // Before ensureRepo and writeSettings: a foreign owner creates/saves nothing.
  const ownerError = loginOwnerError(target, user.login)
  if (ownerError) { err(ownerError); exit(1) }
  const { repo } = target
  await ensureRepo(token, user.login, repo)
  const settings = readSettings()
  // No fresh `lastSync` here: nothing has been synced yet, and on Windows this
  // settings.json is the desktop app's too (on Linux/macOS the app keeps its
  // own in its `NoteFlow` userData dir) — its pull deletes local notes absent
  // from the remote when `updated <= lastSync`.
  // Re-connecting the SAME repo keeps the previous sync state (lastSync,
  // needsFullReconcile…); a different repo starts clean. The pull below
  // writes lastSync once it really ran — and only if the repo already has
  // every local note (see nextGithubLastSync).
  const prev = settings.githubSync
  const sameRepo = prev && prev.owner === user.login && prev.repo === repo
  if (!sameRepo) clearGithubBases() // another repo: no known base (historical behaviour)
  settings.githubSync = {
    ...(sameRepo ? prev : {}),
    enabled: true,
    encryptedToken: Buffer.from(token).toString('base64'),
    owner: user.login, repo,
  }
  delete settings.cliGithubLogin // a grant used (or superseded) — nothing left to finish
  delete settings.cliGithubToken // githubSync now holds a token the CLI reads — the app's copy is stale
  writeSettings(settings)
  out(`  Connected to ${user.login}/${repo}`)
  await pullAfterLogin(opts)
  out('')
}

/**
 * Best-effort first pull right after `login`, so a fresh machine gets its
 * notes without a manual `noteflow pull`. The connection is already saved: a
 * failed pull is reported, never turned into a failed login — cmdPull throws
 * plain Errors (no exit()) precisely so they can be caught here.
 */
async function pullAfterLogin(opts) {
  if (opts.noPull) {
    out("  Skipped the initial pull (--no-pull). Run 'noteflow pull' to download your notes")
    return
  }
  // Same priority as the push/pull routing: while the CLI is signed in to
  // NoteFlow Cloud, GitHub is paused — pulling it now would sync the wrong backend.
  if (cloudActive()) {
    out('  NoteFlow Cloud is the active sync backend — skipped the GitHub pull (GitHub stays paused while it is on)')
    out("  Run 'noteflow pull' to sync from NoteFlow Cloud, or 'noteflow cloud logout' to switch to GitHub")
    return
  }
  out('')
  try {
    await cmdPull()
  } catch (e) {
    if (e instanceof CliExit) throw e // never expected (cmdPull doesn't exit) — keep exit() semantics intact
    err(`Initial pull failed: ${e.message}`)
    out("  You are still connected. Run 'noteflow pull' to retry")
  }
}

function cmdLogout() {
  const settings = readSettings()
  delete settings.githubSync
  delete settings.cliGithubToken // the CLI's copy of the app's token (see resolveGithubToken)
  writeSettings(settings)
  clearGithubBases() // bases of the conditional push belong to that repo
  out('  Disconnected from GitHub')
}

function listLocalNoteDirs() {
  if (!fs.existsSync(NOTES_DIR)) return []
  return fs.readdirSync(NOTES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(NOTES_DIR, e.name, NOTE_MD)))
    .map(e => e.name)
}

async function cmdPush() {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) { err('Not connected. Run: noteflow login'); exit(1) }
  const token = getToken()
  if (!token) { err('Token unavailable (encrypted by desktop app). Run: noteflow login'); exit(1) }
  if (!fs.existsSync(NOTES_DIR)) { out('  No notes to push'); return }
  // Taken BEFORE reading the disk (like the app's push): a note written while
  // this runs must end up with `updated` > lastSync, never below it.
  const startedAt = new Date().toISOString()

  // Every file of every note folder + root metadata + the format marker
  const relPaths = []
  for (const dir of listLocalNoteDirs()) {
    for (const f of fs.readdirSync(path.join(NOTES_DIR, dir))) {
      if (f.endsWith('.md')) relPaths.push(`${dir}/${f}`)
    }
  }
  for (const m of METADATA_FILES) {
    if (fs.existsSync(path.join(NOTES_DIR, m))) relPaths.push(m)
  }

  out(`  Pushing ${relPaths.length} files to ${sync.owner}/${sync.repo}...`)
  // Base of the three-way check (see "GitHub: conditional push"): files whose
  // GitHub copy changed since this machine last saw it are NOT overwritten —
  // their folder is merged file by file and the result uploaded (or, when it
  // can't be merged, takes the GitHub version and the local one is kept as a
  // conflict copy, uploaded too).
  const bases = loadGithubBases(sync)
  const conflictDirs = new Set()
  let pushed = 0, errors = 0, done = 0
  for (const relPath of relPaths) {
    const dir = relPath.includes('/') ? relPath.slice(0, relPath.indexOf('/')) : null
    if (dir && conflictDirs.has(dir)) continue // the whole folder is resolved below
    try {
      const content = fs.readFileSync(path.join(NOTES_DIR, relPath), 'utf-8')
      const outcome = await upsertRemoteFile(token, sync.owner, sync.repo, relPath, content, bases)
      if (outcome === 'conflict') conflictDirs.add(dir)
      else pushed++
      done++; process.stdout.write(`\r  ${done}/${relPaths.length}`)
    } catch (e) { errors++; console.error(`\n  Failed: ${relPath} — ${e.message}`) }
  }
  try { await upsertRemoteFile(token, sync.owner, sync.repo, FORMAT_MARKER, `${FORMAT_VERSION}\n`) } catch { /* ignore */ }
  if (conflictDirs.size) out('')
  let merged = 0 // merged with GitHub's changes and uploaded: synced, not "changed on GitHub"
  for (const dir of conflictDirs) {
    try {
      const res = await githubResolveConflictDir(token, sync, dir, bases)
      reportGithubConflict(dir, res)
      if (!res || res.uploadFailed) errors++
      else if (res.merged) merged++
    } catch (e) { errors++; console.error(`  Failed: ${dir}/ — ${e.message}`) }
  }
  saveGithubBases(sync, bases)
  const held = conflictDirs.size - merged
  out(`\n  Done: ${pushed} pushed, ${errors} errors${merged ? `, ${merged} merged with GitHub` : ''}${held ? `, ${held} changed on GitHub` : ''}`)
  // A failed file may be a note.md the repo still lacks — same rule as the pull.
  if (writeGithubLastSync(sync, errors, startedAt) === null) {
    out(errors > 0
      ? "  Last sync not updated (some files failed) — run 'noteflow push' again"
      : '  Last sync not updated (the GitHub connection changed while pushing)')
  }
}

/**
 * GitHub `lastSync` to keep after a pull/push (pure). It must mean "the repo
 * holds everything on disk": on Windows this settings.json is the desktop
 * app's too (see completeGithubLogin), and its pull deletes local notes absent from the repo
 * with `updated <= lastSync` (shouldRunDeletionRule in electron/syncState.ts).
 * So it only advances to `nowIso` when nothing is left unsynced (`pending` =
 * local-only note dirs after a pull, failed files after a push); otherwise
 * null = keep the previous value (or none).
 */
function nextGithubLastSync(pending, nowIso) {
  return pending > 0 ? null : nowIso
}

/**
 * Pure: the githubSync to persist with a new lastSync — the CURRENT one on disk
 * with only lastSync patched — or null when the connection the command synced
 * (`sync`, read when it started) is gone or now points at another owner/repo.
 * Never the old snapshot: on Windows githubSync is the desktop app's too, and
 * writing it back would undo a disconnect or a token/repo change made meanwhile.
 */
function githubSyncWithLastSync(current, sync, lastSync) {
  if (!current || typeof current !== 'object') return null
  if (current.owner !== sync.owner || current.repo !== sync.repo) return null
  return { ...current, lastSync }
}

/**
 * Persists nextGithubLastSync (no write when it says keep, or when the
 * connection changed meanwhile — see githubSyncWithLastSync). `startedAt` must
 * be taken before the command read the disk. Returns the value written, or null.
 */
function writeGithubLastSync(sync, pending, startedAt) {
  const lastSync = nextGithubLastSync(pending, startedAt)
  if (lastSync === null) return null
  const settings = readSettings() // fresh, right before the write
  const next = githubSyncWithLastSync(settings.githubSync, sync, lastSync)
  if (!next) return null
  settings.githubSync = next
  writeSettings(settings)
  return lastSync
}

/**
 * Pure: local note dirs whose note.md the remote lacks. `remoteDirs` maps a dir
 * to its remote .md files — a dir with sections but no note.md (an interrupted
 * upload) still counts as local-only.
 */
function localOnlyNoteDirs(localDirs, remoteDirs) {
  return localDirs.filter(dir => !(remoteDirs.get(dir) || []).includes(NOTE_MD))
}

/**
 * Hint printed by every GitHub pull that leaves local-only notes. Neutral on
 * purpose: this pull never applies deletions, so a note deleted on another
 * device shows up here too — and pushing it would resurrect it.
 */
function localOnlyHint(n) {
  const notes = n === 1 ? 'note is' : 'notes are'
  return `${n} local ${notes} not on GitHub (new here, or deleted on another device) — run 'noteflow push' to upload ${n === 1 ? 'it' : 'them'} if new`
}

// Errors are THROWN, not exit()ed: `noteflow pull` gets the same "Error: …" +
// exit 1 from the handler at the bottom of main(), while `login` can catch them
// (a failed first pull must not look like a failed login).
// Returns { pulled, skipped, localOnly } (localOnly = local note dirs the remote lacks).
async function cmdPull(opts = {}) {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) throw new Error('Not connected. Run: noteflow login')
  const token = getToken()
  if (!token) throw new Error('Token unavailable (encrypted by desktop app). Run: noteflow login')
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  const force = opts.force === true
  const startedAt = new Date().toISOString() // before reading the disk — see cmdPush
  out(`  Pulling from ${sync.owner}/${sync.repo}...${force ? ' (--force)' : ''}`)

  let blobs = []
  try {
    blobs = await listRemoteTree(token, sync.owner, sync.repo)
  } catch (e) {
    // 404/409 means the repo is empty (just initialized); any other error is real
    if (e.message && !e.message.includes('404') && !e.message.includes('409') && !e.message.toLowerCase().includes('not found') && !e.message.toLowerCase().includes('empty')) {
      throw new Error(`Could not list remote files: ${e.message}`)
    }
  }

  // Group blobs into note dirs ('<dir>/<file>.md' with a note.md anchor)
  const remoteDirs = new Map()
  for (const b of blobs) {
    const i = b.path.indexOf('/')
    if (i <= 0) continue
    const rest = b.path.slice(i + 1)
    if (rest.includes('/') || !rest.endsWith('.md')) continue
    const dir = b.path.slice(0, i)
    if (!remoteDirs.has(dir)) remoteDirs.set(dir, [])
    remoteDirs.get(dir).push(rest)
  }

  async function fetchRemote(relPath) {
    const remote = await githubRequest(token, 'GET', `/repos/${sync.owner}/${sync.repo}/contents/${encodeRemotePath(relPath)}`)
    return Buffer.from(remote.content.replace(/\n/g, ''), 'base64').toString('utf-8')
  }

  let pulled = 0, skipped = 0
  for (const [dir, files] of remoteDirs) {
    if (!files.includes(NOTE_MD)) continue
    try {
      const remoteAnchor = await fetchRemote(`${dir}/${NOTE_MD}`)
      const localDirPath = path.join(NOTES_DIR, dir)
      const localAnchorPath = path.join(localDirPath, NOTE_MD)
      if (!force && fs.existsSync(localAnchorPath)) {
        const lu = extractUpdatedTimestamp(fs.readFileSync(localAnchorPath, 'utf-8'))
        const ru = extractUpdatedTimestamp(remoteAnchor)
        if (lu && ru && ru <= lu) { skipped++; continue }
      }
      fs.mkdirSync(localDirPath, { recursive: true })
      fs.writeFileSync(localAnchorPath, remoteAnchor, 'utf-8')
      for (const f of files) {
        if (f === NOTE_MD) continue
        try { fs.writeFileSync(path.join(localDirPath, f), await fetchRemote(`${dir}/${f}`), 'utf-8') }
        catch { /* skip unreadable section */ }
      }
      // Sections removed remotely → remove their local files
      for (const lf of fs.readdirSync(localDirPath)) {
        if (lf.endsWith('.md') && lf !== NOTE_MD && !files.includes(lf)) {
          try { fs.unlinkSync(path.join(localDirPath, lf)) } catch { /* ignore */ }
        }
      }
      pulled++; out(`  ${dir}/`)
    } catch (e) { err(`${dir}: ${e.message}`) }
  }

  for (const m of METADATA_FILES) {
    try { fs.writeFileSync(path.join(NOTES_DIR, m), await fetchRemote(m), 'utf-8') }
    catch { /* optional */ }
  }
  // Bases of the conditional push: a listed blob becomes the base only where
  // the local file now IS that blob (folders skipped as "local newer" keep
  // their previous base — the next push must still see the remote change).
  const localShas = {}
  for (const b of blobs) {
    try { localShas[b.path] = gitBlobSha(fs.readFileSync(path.join(NOTES_DIR, b.path), 'utf-8')) }
    catch { localShas[b.path] = null }
  }
  saveGithubBases(sync, nextPulledBases(loadGithubBases(sync), blobs, localShas))
  const localOnly = localOnlyNoteDirs(listLocalNoteDirs(), remoteDirs)
  // Local-only notes mean the repo does NOT know everything on disk yet: a
  // fresh lastSync would arm the desktop app's deletion rule against them
  // (see nextGithubLastSync). The push that uploads them writes it instead.
  writeGithubLastSync(sync, localOnly.length, startedAt)
  out(`  Done: ${pulled} pulled${skipped ? `, ${skipped} skipped (local is newer — use --force to override)` : ''}`)
  if (localOnly.length) out(`  ${localOnlyHint(localOnly.length)}`)
  return { pulled, skipped, localOnly }
}

// noteflow migrate — one-time local v1→v2 conversion (flat .md → folders).
// Idempotent; also pushes the new layout and removes remote flat files when
// connected. The desktop app runs the same migration automatically on startup.
async function cmdMigrate() {
  if (!fs.existsSync(NOTES_DIR)) { out('  No notes directory'); return }
  const flat = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md') && f !== 'README.md' &&
    fs.statSync(path.join(NOTES_DIR, f)).isFile())

  let migrated = 0
  for (const filename of flat) {
    try {
      const raw = fs.readFileSync(path.join(NOTES_DIR, filename), 'utf-8')
      const { frontmatter, body } = splitFrontmatter(raw)
      const note = parseNoteYaml(frontmatter)
      if (note.encryption) {
        // Encrypted: keep the original frontmatter verbatim as note.md (the
        // custom parser doesn't preserve the encryption block contents)
        const dir = filename.replace(/\.md$/i, '')
        fs.mkdirSync(path.join(NOTES_DIR, dir), { recursive: true })
        fs.writeFileSync(path.join(NOTES_DIR, dir, NOTE_MD), `---\n${frontmatter}\n---\n`, 'utf-8')
        fs.unlinkSync(path.join(NOTES_DIR, filename))
        migrated++
        continue
      }
      if (!note.sections.length) {
        // Markdown mode (no isRawMode), like the desktop migrator: parseLegacyNoteRaw
        // in electron/noteFormat.ts turns a body-only v1 note into a plain 'Note'.
        note.sections = [{ id: nanoid(6), name: 'Note', content: body }]
      }
      if (!note.id) note.id = nanoid(8)
      const dir = filename.replace(/\.md$/i, '')
      writeNoteFolder(dir, note, { preserveUpdated: true })
      fs.unlinkSync(path.join(NOTES_DIR, filename))
      migrated++
      out(`  ${filename} → ${dir}/`)
    } catch (e) {
      err(`${filename}: ${e.message}`)
    }
  }
  try { fs.writeFileSync(path.join(NOTES_DIR, FORMAT_MARKER), `${FORMAT_VERSION}\n`, 'utf-8') } catch { /* ignore */ }
  out(`  Migrated ${migrated} note(s) to folder format v2`)

  // Remote cleanup when connected: push folders, delete old flat files, marker
  const sync = getSyncSettings()
  const token = getToken()
  if (sync.enabled && sync.owner && sync.repo && token) {
    out('  Migrating remote repo...')
    await cmdPush()
    try {
      const blobs = await listRemoteTree(token, sync.owner, sync.repo)
      for (const b of blobs) {
        if (!b.path.includes('/') && b.path.endsWith('.md') && b.path !== 'README.md') {
          await removeRemoteFile(token, sync.owner, sync.repo, b.path, `migrate: remove flat ${b.path}`)
        }
      }
    } catch (e) { err(`Remote cleanup failed: ${e.message}`) }
    out('  Remote migration complete')
  }
}

const SELF_UPDATE_URL = 'https://raw.githubusercontent.com/yagoid/noteflow/main/cli/noteflow.js'
const SKILL_UPDATE_URL = 'https://raw.githubusercontent.com/yagoid/noteflow/main/cli/noteflow-cli/SKILL.md'

async function cmdSelfUpdate() {
  out('  Checking for updates...')

  // Download new version to a temp file first
  const selfPath = fs.realpathSync(process.argv[1])
  const tmpPath = selfPath + '.tmp'

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath)
    https.get(SELF_UPDATE_URL, { headers: { 'User-Agent': 'NoteFlow-CLI' } }, (res) => {
      if (res.statusCode !== 200) {
        fs.unlinkSync(tmpPath)
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', (e) => { fs.unlinkSync(tmpPath); reject(e) })
    }).on('error', (e) => { try { fs.unlinkSync(tmpPath) } catch {} ; reject(e) })
  })

  // Up-to-date check is a full-content comparison (the "// v" header comment
  // in the script is informational only, not parsed here).
  const newContent = fs.readFileSync(tmpPath, 'utf-8')
  const currentContent = fs.readFileSync(selfPath, 'utf-8')

  if (newContent === currentContent) {
    fs.unlinkSync(tmpPath)
    out('  Already up to date')
  } else {
    // Replace self atomically
    fs.renameSync(tmpPath, selfPath)
    try { fs.chmodSync(selfPath, 0o755) } catch { /* Windows — no-op */ }
    out(`  Updated successfully → ${selfPath}`)
  }

  // Also when the script was already current: a skill copy may be stale (or
  // reverted by an older desktop app). Best-effort, never fails the command.
  try {
    await selfUpdateSkill()
  } catch (e) {
    console.error(`  Warning: could not update the AI agent skill (${e.message})`)
  }
}

// The user-level agent skill dirs that get noteflow-cli/SKILL.md. ⚠️ keep in
// sync with skillAgentDestDirs() in electron/main.ts (the desktop app installs
// the skill there on every launch) and with cli/install-cli.sh.
function skillAgentDestDirs(home) {
  const dirs = [
    path.join(home, '.claude', 'skills', 'noteflow-cli'),
    path.join(home, '.agents', 'skills', 'noteflow-cli'),
  ]
  const windsurfRoot = path.join(home, '.codeium', 'windsurf')
  try {
    if (fs.existsSync(windsurfRoot)) dirs.push(path.join(windsurfRoot, 'skills', 'noteflow-cli'))
  } catch { /* treat as not installed */ }
  return dirs
}

// Rewrites only the SKILL.md copies that already exist: self-update never
// installs the skill where it wasn't — nor brings it back where the user turned
// it off (the app's "Expose CLI skill to AI agents" deletes the copies). Each
// destination is independent; files already identical are left untouched.
function refreshInstalledSkills(home, content) {
  const result = { updated: [], current: [], failed: [] }
  for (const dir of skillAgentDestDirs(home)) {
    const file = path.join(dir, 'SKILL.md')
    try {
      if (!fs.existsSync(file)) continue
      if (fs.readFileSync(file, 'utf-8') === content) { result.current.push(file); continue }
      fs.writeFileSync(file, content, 'utf-8')
      result.updated.push(file)
    } catch {
      result.failed.push(file)
    }
  }
  return result
}

// `sudo noteflow self-update` (needed to rewrite /usr/local/bin/noteflow) runs
// with root's HOME, but the skills live in the invoking user's home.
function skillHome() {
  const user = process.env.SUDO_USER
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
  if (!isRoot || !user || user === 'root' || !/^[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(user)) return os.homedir()
  const quiet = { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
  try {
    const home = execFileSync('getent', ['passwd', user], quiet).split(':')[5]?.trim()
    if (home) return home
  } catch { /* no getent (macOS) */ }
  try {
    const m = execFileSync('dscl', ['.', '-read', `/Users/${user}`, 'NFSHomeDirectory'], quiet)
      .match(/NFSHomeDirectory:\s*(.+)/)
    if (m) return m[1].trim()
  } catch { /* not macOS */ }
  return os.homedir()
}

async function selfUpdateSkill() {
  const home = skillHome()
  const installed = skillAgentDestDirs(home).some(d => fs.existsSync(path.join(d, 'SKILL.md')))
  if (!installed) return
  let content
  try {
    const res = await fetch(SKILL_UPDATE_URL, { headers: { 'User-Agent': 'NoteFlow-CLI' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    content = await res.text()
    if (!content.startsWith('---')) throw new Error('unexpected content')
  } catch (e) {
    console.error(`  Warning: could not update the AI agent skill (${e.message})`)
    return
  }
  const { updated, current, failed } = refreshInstalledSkills(home, content)
  if (updated.length) out(`  AI agent skill updated → ${updated.join(', ')}`)
  else if (current.length) out('  AI agent skill already up to date')
  if (failed.length) console.error(`  Warning: could not write the AI agent skill → ${failed.join(', ')}`)
}

function cmdStatus(opts) {
  const sync = getSyncSettings()
  const noteCount = listLocalNoteDirs().length
  const groups = readGroups()
  if (opts.json) {
    jsonOut({
      notesDir: NOTES_DIR, noteCount,
      github: sync.enabled && sync.owner && sync.repo ? {
        owner: sync.owner, repo: sync.repo, lastSync: sync.lastSync,
        tokenAccessible: !!getToken(),
      } : null,
      groups: groups.length,
      desktopApp: readDesktopAppInfo(),
    })
    return
  }
  out('\n  NoteFlow CLI')
  out(`  Notes:     ${noteCount} in ${NOTES_DIR}`)
  if (groups.length) out(`  Groups:    ${groups.map(g => g.name).join(', ')}`)
  if (sync.enabled && sync.owner && sync.repo) {
    const tokenOk = !!getToken()
    out(`  GitHub:    ${sync.owner}/${sync.repo} ${tokenOk ? '(connected)' : '(token inaccessible — run: noteflow login)'}`)
    if (sync.lastSync) out(`  Last sync: ${sync.lastSync}`)
  } else {
    out('  GitHub:    not connected')
  }
  out('')
}

function cmdHelp(topic) {
  const topics = {
    add: `
  noteflow add [<text>] [options]

  Appends text to today's daily note (auto-created), or to a note picked with
  --title. With --title the note must exist — pass --create to create it.

  Content source (pick ONE — positional <text> or a flag):
    --text "<content>"   Inline text
    --file <path>        Read content from a file (UTF-8, or UTF-16 with a BOM)
    --stdin              Read content from stdin (also auto-used when piped)

  Options:
    --title <title>     Target a note with this title instead of today's date
    --section <name>    Write to an EXISTING section/tab (exact name, see below)
    --create            Create whatever is missing: the --title note and/or the
                        --section (without it, a missing one is an error)
    --tag <tag>         Add a metadata tag to the note
    --group <name>      Assign the note to a group (also moves an existing one)
    --folder <name>     Put the note in a folder of that group (requires --group)
    --raw               New section in text mode: the app shows it as-is, unrendered
    --markdown          New section in markdown mode: the app renders it (default;
                        --rich is an alias)
    --dry-run           Show what would be written (note/section/bytes) without
                        writing — fails exactly like the real run would
    --json              Machine-readable result on stdout; info lines go to stderr

  Section resolution (same as 'set'): an explicit --section must match the EXACT
  name (case-insensitive), "Name#2" picks among same-named sections and several
  same-named ones without "#n" are an error, not a guess. With no exact match it
  FAILS (exit 1) listing similar names ("Did you mean") and the existing ones —
  never a partial/loose match, never a stray section from a typo. Pass --create
  to create it, or 'noteflow section add'. With --json the error is also printed
  on stdout: { error, code: "section_not_found", note, section, sections,
  suggestions }. Without --section the default section "Note" is matched exactly
  and created if missing (quick daily-note appends). A note created by this very
  command (today's daily note, or --title + --create) gets its section created.
  The mode flags only apply to a section created now; existing ones keep theirs.

  --title resolves like the other note commands: an exact title wins, a partial
  one works when it matches a single note, and several matches are an error that
  lists them (nothing written — also with --create). An unknown --group/--folder
  is an error too (exit 1, nothing written). Changing an existing note's group
  without --folder takes it to the new group's root, like 'move'.

  --json result: { note, dirname, section, createdNote, createdSection,
  bytesWritten } (--dry-run adds "dryRun": true; dirname is null for a note that
  would be created).

  Windows: the noteflow.cmd shim truncates multi-line arguments (cmd.exe drops
  everything after the first newline). PowerShell automatically picks the
  noteflow.ps1 shim, which passes them intact, forwards piped stdin as UTF-8 and
  prints accents correctly — but for non-trivial content still prefer --file or
  --stdin. If a piped --stdin arrives empty, your installed noteflow.ps1 predates
  that fix: use --file, or pipe into noteflow.cmd, or update NoteFlow.

  Examples:
    noteflow add "Fix: CORS issue"
    noteflow add "meeting notes" --title "Project Alpha" --section "Meetings"
    noteflow add --file notes.md --title "New Note" --create
    git log --oneline -5 | noteflow add --stdin --section "Log" --create --raw
`,
    list: `
  noteflow list [options]

  Lists notes, most recently updated first. Archived notes are hidden unless
  --archived; encrypted notes are never listed by the CLI.

  Options:
    --tag <tag>     Filter by tag
    --group <name>  Filter by group
    --folder <name> Filter by folder (add --group if the name repeats across groups)
    --archived      Include archived notes
    --json          Output as JSON array: id, title, tags, group, folder, created,
                    updated, archived, favorited, sections (names), dirname

  Example:
    noteflow list --group backend --json
`,
    get: `
  noteflow get <title> [options]

  Shows the content of a note (pretty, human-readable). Title can be partial.
  For machine/agent reading use 'noteflow read' instead (raw, unindented).

  Options:
    --section <name>   Show only this section
    --json             Output as JSON

  Example:
    noteflow get "Project Alpha" --section Tasks --json
`,
    read: `
  noteflow read <title> [section]

  Prints note/section content RAW to stdout — no indentation, no decoration —
  so it is safe to pipe or feed to an agent. Title can be partial.

  Forms:
    noteflow read "Project Alpha"            Whole note as clean markdown
    noteflow read "Project Alpha" "Tasks"    Just that section's body (verbatim)
    noteflow read "Project Alpha" --section Tasks   Same, flag form (multi-word titles)
    noteflow read "Project Alpha" --json     JSON with every section

  Duplicate section names: target one with a 1-based suffix, e.g. "Tasks#2".
  Section names match exactly, then by substring, and finally by words ignoring
  accents/case/filler ("Variables de entorno" finds "Variables Entorno"); a loose
  hit is announced on stderr. Only 'read' and 'path' are that forgiving —
  add/set/section rename/delete demand the exact name (see 'noteflow sections').
`,
    path: `
  noteflow path <title> [section]

  Prints ABSOLUTE paths to stdout — raw, one per line, safe to pipe. Lets an
  agent (or an editor) open the section's .md directly instead of doing
  read/set round-trips. Run 'noteflow touch <title>' after editing a file.

  Forms:
    noteflow path "Project Alpha"            The note's directory
    noteflow path "Project Alpha" "Tasks"    That section's .md file
    noteflow path "Project Alpha" --section Tasks   Same, flag form (multi-word titles)
    noteflow path "Project Alpha" --json     { id, title, dir, noteFile, sections[] }
    noteflow path "Project Alpha" Tasks --json   { id, title, dir, section, file, isRawMode }

  Title can be partial; duplicate section names take a 1-based suffix ("Tasks#2").
  Section names resolve like in 'read', including the loose word match.
`,
    touch: `
  noteflow touch <title>

  Bumps the note's 'updated:' timestamp and pushes it to the active sync backend
  (NoteFlow Cloud when signed in, else GitHub). Run it AFTER editing a section's
  .md by hand — the counterpart of 'noteflow path'.

  The note is re-read from disk first, so your manual edits are what gets synced.
  Files inside the note dir that are not note.md nor a listed section are removed.

  The desktop app already watches the notes dir, so it shows an external edit on
  its own; what 'touch' adds is the 'updated:' bump (the canonical sync timestamp)
  and the push to the backend.

  Example:
    noteflow path "Project Alpha" Tasks      # -> /home/me/noteflow-notes/project-alpha-ab12/sec002.md
    # …edit that file with any editor/tool…
    noteflow touch "Project Alpha"
`,
    set: `
  noteflow set <title> <section> [content source] [--create] [--raw] [--dry-run] [--json]

  Overwrites the content of an existing section (--create: creates the section
  if it doesn't exist). This is the counterpart of 'add', which only appends.
  The note must exist (create notes with 'new' or 'add --title … --create').

  Content source (first one wins):
    --text "<content>"   Inline text
    --file <path>        Read content from a file (UTF-8, or UTF-16 with a BOM)
    --stdin              Read content from stdin (also auto-used when piped)

  PowerShell 5.1's '>' writes UTF-16 with a BOM, which is decoded fine; UTF-16
  without a BOM is refused (exit 1) — pipe the text instead
  (... | noteflow set "<title>" "<section>" --stdin) or use Out-File -Encoding utf8.

  Other options:
    --create             Create the section if it doesn't exist
    --raw                A section created now is in text mode (shown as-is);
                         default: markdown mode (rendered; --markdown/--rich alias it)
    --dry-run            Show what would be written (note/section/bytes) without
                         writing — fails exactly like the real run would
    --json               Machine-readable result on stdout; info lines go to stderr

  Section resolution: the EXACT name only (case-insensitive) — no partial/loose
  match, so "EN" never overwrites "Comentario". "Name#2" picks among same-named
  sections; several same-named ones without "#n" are an error, not a guess. With
  no exact match it FAILS (exit 1) listing similar names ("Did you mean") and the
  existing ones — pass --create to create it with the name you typed. With --json
  the error is also printed on stdout: { error, code: "section_not_found", note,
  section, sections, suggestions }. Check names with 'noteflow sections'.

  Windows: the noteflow.cmd shim truncates multi-line arguments (cmd.exe drops
  everything after the first newline). PowerShell automatically picks the
  noteflow.ps1 shim, which passes them intact, forwards piped stdin as UTF-8 and
  prints accents correctly — but for non-trivial content still prefer --file or
  --stdin. If a piped --stdin arrives empty, your installed noteflow.ps1 predates
  that fix: use --file, or pipe into noteflow.cmd, or update NoteFlow.

  Examples:
    noteflow set "Project Alpha" Tasks --text "- [ ] deploy"
    cat notes.md | noteflow set "Project Alpha" Notes --stdin --create
    noteflow set "Project Alpha" "Tasks#2" --file todo.txt   # 2nd 'Tasks' section
`,
    section: `
  noteflow section list   <title>
  noteflow section add    <title> <name> [--raw]
  noteflow section rename <title> <old> <new>
  noteflow section delete <title> <name> [--yes]

  Manage a note's sections by name (no ids needed). Section names are NOT unique;
  disambiguate duplicates with a 1-based suffix, e.g. "Tasks#2". 'delete' refuses
  to remove the last remaining section. Quote multi-word names. Being destructive,
  'rename'/'delete' only accept the EXACT name (case-insensitive): with no exact
  match they fail, listing the sections and any similar one ("Did you mean").
  'add' always creates a new section (even if one with that name exists), in
  markdown mode (the app renders the markdown); with --raw it is created in text
  mode (the app shows it as-is, unrendered).

  Examples:
    noteflow section add "Project Alpha" "Meeting Notes"
    noteflow section rename "Project Alpha" Tasks To-do
    noteflow section delete "Project Alpha" Scratch --yes
`,
    groups: `
  noteflow groups [--json]
  noteflow group create <name> [--color <red|cyan|purple|orange|pink|accent>]
  noteflow group delete <name> [--yes]

  Colors: accent (default), accent-2, red, cyan, purple, text, orange, pink
  Deleting a group also removes its folders; its notes become ungrouped.
`,
    folders: `
  noteflow folders [--group <g>] [--json]
  noteflow folder create <name> --group <group>
  noteflow folder rename <name> <new-name> [--group <g>]
  noteflow folder delete <name> [--group <g>] [--yes]

  Folders are a single nesting level inside a group (group -> folder -> note).
  A folder always belongs to a group, so 'folder create' requires --group.
  Folder names can repeat across groups; narrow with --group when ambiguous.
  Deleting a folder drops its notes back to the group root (they keep the group).

  Put notes in a folder:
    noteflow new "Sprint 14" --group backend --folder Planning
    noteflow add "text" --group backend --folder Planning
    noteflow move "Sprint 14" --group backend --folder Planning
    noteflow move "Sprint 14" --ungroup            Remove from group/folder
    noteflow list --group backend --folder Planning
`,
    move: `
  noteflow move <title> --group <g> [--folder <f>]
  noteflow move <title> --ungroup

  Moves a note between groups/folders. With --group but no --folder the note
  goes to the group root. --folder requires the folder to exist in that group
  (create it first with 'noteflow folder create'). --ungroup clears both.
`,
    new: `
  noteflow new <title> [--section <s>] [--group <g>] [--folder <f>] [--raw] [--json]

  Creates a new empty note with the given title. Optionally place it in a group
  (and a folder of that group) and name its first section. The section is in
  markdown mode (rendered); --raw makes it text mode. --json prints the note.

  Examples:
    noteflow new "Sprint 14"
    noteflow new "Sprint 14" --group backend --folder Planning --section Tasks
`,
    favorite: `
  noteflow favorite <title>   (alias: pin)

  Toggles the favorite flag on a note. Title can be partial.

  Example:
    noteflow favorite "Project Alpha"
`,
    archive: `
  noteflow archive <title>

  Toggles the archived flag on a note. Archived notes are hidden from 'list'
  unless you pass --archived. Title can be partial.

  Example:
    noteflow archive "Old Project"
`,
    delete: `
  noteflow delete <title> [--yes] [--json]   (alias: rm)

  Deletes a note. Title can be partial; prompts for confirmation unless --yes.
  With no terminal to answer (pipes, agents, cron) the answer is "no": it prints
  'Cancelled', exits 0 and deletes nothing — scripts must pass --yes (same for
  'section delete', 'group delete' and 'folder delete').
  With sync enabled the note is also removed from the remote (Cloud or GitHub).
  --json prints { "deleted": true|false, "note": "<title>" } on stdout.

  Example:
    noteflow delete "Scratch" --yes
`,
    rename: `
  noteflow rename <old> <new>

  Changes a note's title. The on-disk folder name is kept as-is (only the title
  in the note's metadata changes). Old title can be partial.

  Example:
    noteflow rename "Projct Alpha" "Project Alpha"
`,
    login: `
  noteflow login [repo] [--no-pull]
  noteflow login [repo] --no-wait [--no-pull] [--json]
  noteflow login --finish [--no-pull]

  Connects GitHub sync with the Device Flow: open the URL, enter the code, and
  the CLI saves its own token (the desktop app's one is not readable here),
  creates the repo if needed (default: noteflow-notes, private) and pulls it.

  [repo] is 'repo' or 'owner/repo'. A bare name is a repo of whichever account
  you authorize with (created there if missing). With 'owner/repo', authorizing
  with another account fails (exit 1) and nothing is created or saved — the CLI
  only syncs repos of its own account. To connect an EXISTING repo (e.g. the one
  the desktop app uses), pass owner/repo so a wrong account can't create a copy.
  The repo is only created when GitHub answers that it does not exist; any
  other error (network, permissions) fails the login instead.

  Without flags it waits (up to ~15 min) until you authorize in the browser.
  For agents/scripts that can't keep a terminal waiting, split it in two:
    --no-wait   Print the URL and code, save the pending login and exit 0.
                --json prints { verificationUri, userCode, expiresAt, repo }.
    --finish    After authorizing: wait for GitHub to confirm and connect. Uses
                the repo of the pending login (a different repo is an error).
                Without a pending login, or once it expired, it fails — run
                'noteflow login --no-wait' again.
  A new --no-wait replaces the pending login. If --finish is cut off while it
  waits (network error, a tool timeout), the pending login is kept: run --finish
  again. The first pull never overwrites newer local notes; if it fails, the
  login still holds and 'noteflow pull' retries. It uploads nothing: run
  'noteflow push' for notes written before connecting.

  Options:
    --no-pull   Connect only, skip the first pull (with --no-wait it carries
                over to --finish)

  The CLI keeps its own token base64-encoded (not encrypted) in its settings.json:
  %APPDATA%\\noteflow\\settings.json on Windows, ~/.config/noteflow/settings.json
  on Linux/macOS (honours $XDG_CONFIG_HOME), kept owner-only (0600) there.

  Examples:
    noteflow login
    noteflow login my-private-notes
    noteflow login ana/noteflow-notes    # only if you authorize as ana
    noteflow login --no-wait --json      # then, once authorized:
    noteflow login --finish
`,
    cloud: `
  noteflow cloud login [email]    Sign in with an emailed one-time code (standard
                                  keys: then pulls your notes; --no-pull skips it)
  noteflow cloud login <email> --send-code
                                  Non-interactive step 1: email the code and exit
  noteflow cloud login <email> --code <code>
                                  Non-interactive step 2: verify it (no new email;
                                  a wrong/expired code exits 1 and can be retried)
  noteflow cloud logout           Sign out (keeps notes and the sync cursor: signing
                                  back in with the same account resumes from it)
  noteflow cloud status [--json]  Account, keys mode and sync state
  noteflow cloud setup            Create Cloud keys (standard/managed mode)
  noteflow cloud push             Encrypt and upload local changes
  noteflow cloud pull             Download and decrypt remote changes

  NoteFlow Cloud is the account-based encrypted sync (a subscription is needed
  to upload). While signed in with Cloud enabled, plain 'noteflow push', 'pull',
  'status' and the automatic after-command sync use Cloud INSTEAD of GitHub.
  The first push runs an automatic initial pull to reconcile with the remote.

  Sync is per file (each section is a file): edits to different sections on two
  devices merge; if both changed the SAME section, the note keeps the remote
  version and yours goes to a conflict copy holding only those sections
  ("Conflict: local changes kept as …"). An upload made on a stale copy is
  rejected ("not uploaded: a newer version is on NoteFlow Cloud") — run
  'noteflow pull', which merges it, then 'noteflow push'.

  Encryption modes:
    standard (managed)  'noteflow cloud setup' — nothing to remember.
    private (e2ee)      Set up in the DESKTOP app (it shows the one-time
                        recovery code). The CLI then asks for your passphrase or
                        recovery code on each run; set NOTEFLOW_CLOUD_PASSPHRASE
                        to skip the prompt on servers/cron. The key is never
                        stored on this machine.

  Plain 'cloud login' prompts for the email and the code, so it needs a
  terminal. Agents and scripts use the two steps instead (--send-code, then
  --code); both require the email as an argument and never prompt.
`,
    status: `
  noteflow status [--json]

  Shows the note count, the notes directory, groups and the GitHub sync state.
  While signed in to NoteFlow Cloud with sync enabled it shows 'cloud status'
  instead — and its JSON shape (check for the "cloud" key).

  Notes directory: ~/noteflow-notes (Windows, macOS) or
  ~/.local/share/noteflow-notes (Linux). NOTEFLOW_NOTES_DIR overrides it — the
  notes only: the sync session in settings.json still applies, so writes there
  sync to the real account (point APPDATA / XDG_CONFIG_HOME elsewhere too to
  isolate a test).

  --json (GitHub): { notesDir, noteCount, github: { owner, repo, lastSync,
                   tokenAccessible } | null, groups, desktopApp }
  --json (Cloud):  { notesDir, noteCount, cloud: { email, enabled, keysMode,
                   lastSync, pullSeq, pullCursor } | null, githubConfigured,
                   desktopApp }

  tokenAccessible: false  GitHub is set up, but the token belongs to the desktop
                          app (encrypted, unreadable here): run 'noteflow login'
                          to the same repo, or use "Connect the CLI too" in the
                          app (Settings > Sync). Only on Windows, where the CLI
                          and the app share settings.json.
  desktopApp              What the desktop app on this machine syncs with:
                          { cloudSignedIn, cloudSyncEnabled, cloudEmail?,
                          github: { owner, repo } | null }, or null when its
                          settings are not found. Its tokens are never read: the
                          CLI needs its own 'login' / 'cloud login' (or "Connect
                          the CLI too" in the app, Settings > Sync).
`,
    pull: `
  noteflow pull [--force]   (alias: update)

  Downloads remote changes from the active backend (NoteFlow Cloud when signed
  in, else GitHub).

  GitHub: a note is only overwritten when the remote 'updated:' is newer; newer
  local notes are skipped (the next push uploads them). --force (GitHub only)
  overwrites them anyway — it discards newer local edits. The GitHub pull does
  not apply deletions: notes deleted on another device stay here and are
  reported as "local notes not on GitHub" — a push would bring them back, so
  only push them if they are new.

  Cloud: incremental and merged per file (see 'noteflow help cloud').
`,
    push: `
  noteflow push

  Uploads every note to the active backend (NoteFlow Cloud when signed in, else
  GitHub). Ends with "Done: N pushed, E errors". On GitHub a note that changed
  remotely since your last pull is never overwritten: the note takes the GitHub
  version and your local one is kept as a conflict copy ("Conflict: local
  changes kept as …"); if that can't be resolved it says "changed on GitHub
  since your last pull — not uploaded" — run 'noteflow pull', then push again.
  If any file fails, the last-sync time is not advanced — run 'noteflow push'
  again.

  Commands that write already push the files they touch; a sync failure there
  does NOT change the exit code (the local change is saved), so read the output.
`,
    migrate: `
  noteflow migrate

  One-time conversion of v1 notes (one flat '<slug>-<id>.md' per note in the
  notes dir) to the folder format v2 ('<slug>-<id>/note.md' + one .md per
  section). Idempotent. When sync is set up it also uploads the new layout and
  removes the flat files from the remote. The desktop app runs the same local
  migration on startup.
`,
    'self-update': `
  noteflow self-update

  Downloads the latest cli/noteflow.js from GitHub and replaces this script (no
  sync login needed). It also refreshes the AI agent skill (noteflow-cli/SKILL.md)
  in the agent skill dirs where it is already installed (~/.claude/skills,
  ~/.agents/skills, ~/.codeium/windsurf/skills) — it never installs it anywhere
  new. The Windows wrappers (noteflow.cmd / noteflow.ps1) are refreshed by
  updating the NoteFlow app.
`,
  }

  const aliases = { folder: 'folders', group: 'groups', sections: 'section', pin: 'favorite', rm: 'delete', update: 'pull' }
  if (topic && aliases[topic]) topic = aliases[topic]
  if (topic && topics[topic]) { out(topics[topic]); return }

  out(`
  NoteFlow CLI — quick notes from your terminal

  Note commands:
    add <text>            Append text to today's daily note (or --title)
    new <title>           Create a new empty note
    list                  List notes
    get <title>           Show note content (pretty, human-readable)
    read <title> [sec]    Print note/section content RAW (pipe/agent-friendly)
    set <title> <sec>     Overwrite a section's content (--create if it's new)
    path <title> [sec]    Print the absolute path of a section's .md (or the note dir)
    touch <title>         Bump 'updated:' and push (after editing a .md by hand)
    delete <title>        Delete a note
    rename <old> <new>    Rename a note
    move <title>          Move a note to a group/folder (--group/--folder/--ungroup)
    favorite <title>      Toggle favorite on a note
    archive <title>       Toggle archive on a note

  Section commands:
    sections <title>            List sections of a note
    section add <title> <name>      Add a section
    section rename <title> <o> <n>  Rename a section
    section delete <title> <name>   Delete a section

  Group / folder commands:
    groups                List all groups
    group create <name>   Create a group
    group delete <name>   Delete a group
    folders               List folders (group -> folder -> note)
    folder create <name> --group <g>   Create a folder inside a group
    folder rename <name> <new>         Rename a folder
    folder delete <name>               Delete a folder (notes drop to group root)

  Sync commands — pick ONE backend, sign in once, then edits sync on their own:
    login [repo]          GitHub: connect your notes repo and pull it
                          [--no-pull: connect only, skip the first pull]
                          [--no-wait, then --finish: two steps, no waiting] — 'noteflow help login'
    cloud login           NoteFlow Cloud: sign in with your NoteFlow account
                          (encrypted; takes priority over GitHub) — 'noteflow help cloud'
                          [<email> --send-code, then <email> --code <code>: no prompts]
    logout / cloud logout Disconnect GitHub / NoteFlow Cloud
    push                  Upload all notes to the active backend
    pull / update         Download remote changes from the active backend
                          [--force: GitHub only — overwrite even if local is newer]
    status / cloud status Show GitHub / NoteFlow Cloud sync status
    migrate               One-time migration: flat .md notes → folder format v2
    self-update           Update this CLI script (and its installed agent skill)
    version / --version   Print the CLI version

  Flags (a flag a command doesn't support is an error, never ignored):
    --json                Machine-readable JSON output (info lines go to stderr) —
                          list/get/read/path/new/add/set/delete, groups/folders,
                          group create/folder create, status/cloud status, login --no-wait
    --yes                 Skip confirmation prompts
    --dry-run             add/set: resolve the target without writing anything
    --create              add/set: create a missing section (add: or note) —
                          without it an unknown section name is an error
    --raw                 add/set/new/section add: new section in text mode (as-is);
                          default is markdown mode (rendered)

  Agent quickstart (read + write by name, no ids):
    noteflow list --json                      Discover note titles + section names
    noteflow read "<title>" "<section>"       Read one section RAW (pipe-friendly)
    noteflow set  "<title>" "<section>" --text "..."   Overwrite a section
    noteflow add  "..." --title "<title>" --section "<section>"   Append instead
    noteflow path "<title>" "<section>"       Get the .md path, edit it, then:
    noteflow touch "<title>"                  …bump 'updated:' and sync
    Section names must be exact: an unknown one fails with "Did you mean" and the
    existing names (also as JSON with --json) — add --create only for a NEW one.

  AI agent integration:
    NoteFlow ships with an AI agent skill that teaches LLMs how to use this CLI.
    The desktop app and the headless installer (install-cli.sh) already put it
    in ~/.claude/skills and ~/.agents/skills. To add it by hand (Claude Code,
    Cursor, etc.):
      npx skills add yagoid/noteflow/cli/noteflow-cli
    Or fetch the raw skill definition directly:
      https://raw.githubusercontent.com/yagoid/noteflow/main/cli/noteflow-cli/SKILL.md

  Run 'noteflow help <command>' for details on a specific command.

  Examples:
    noteflow add "Fix: CORS issue"
    noteflow add "deploy steps" --section "Tasks" --create --tag urgent
    noteflow new "Project Alpha" --group backend
    noteflow list --group backend
    noteflow read "Project Alpha" "Tasks"
    noteflow set "Project Alpha" "Tasks" --text "- [ ] deploy"
    noteflow path "Project Alpha" "Tasks"
    noteflow touch "Project Alpha"
    noteflow section rename "Project Alpha" Tasks To-do
    noteflow group create backend --color cyan
    noteflow folder create Planning --group backend
    noteflow move "Project Alpha" --group backend --folder Planning
`)
}

// ── Arg parser ────────────────────────────────────────────────────────────────

// Strict by design (agents drive this CLI): unknown flags and value flags
// missing their value are hard errors, never silently dropped.
const BOOLEAN_FLAGS = {
  '--json': ['json', true], '--yes': ['yes', true], '--archived': ['archived', true],
  // New sections are markdown mode by default; --markdown/--rich are explicit
  // spellings of that default (--rich kept so older scripts don't break).
  '--raw': ['raw', true], '--markdown': ['raw', false], '--rich': ['raw', false], '--stdin': ['stdin', true],
  '--ungroup': ['ungroup', true], '--create': ['create', true],
  '--dry-run': ['dryRun', true], '--force': ['force', true],
  '--no-pull': ['noPull', true],
  // Non-interactive two-step sign-ins (agents): login --no-wait / --finish,
  // cloud login <email> --send-code / --code <code>.
  '--no-wait': ['noWait', true], '--finish': ['finish', true], '--send-code': ['sendCode', true],
}
const VALUE_FLAGS = ['--tag', '--title', '--section', '--group', '--folder', '--color', '--text', '--file', '--code']

function parseFlags(args) {
  const flags = {}; const positional = []; const seen = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    // Object.hasOwn: a plain `BOOLEAN_FLAGS[a]` would hit Object.prototype for
    // positionals like "constructor"/"toString" and crash. (VALUE_FLAGS is an
    // array + .includes, which has no such inherited-key pitfall.)
    if (Object.hasOwn(BOOLEAN_FLAGS, a)) {
      const [key, value] = BOOLEAN_FLAGS[a]
      flags[key] = value
      seen.push(a)
    } else if (VALUE_FLAGS.includes(a)) {
      if (i + 1 >= args.length) { err(`Flag ${a} requires a value`); exit(1) }
      flags[a.slice(2)] = args[++i]
      seen.push(a)
    } else if (a.startsWith('--')) {
      err(`Unknown flag: ${a}`)
      exit(1)
    } else positional.push(a)
  }
  return { flags, positional, seen }
}

// Flags each command really reads (beyond --yes). A known flag the command
// doesn't use is an error, never silently ignored: `delete --dry-run` used to
// delete for real, and `--json` on a command with no JSON output left stdout
// empty with exit 0. ⚠️ Keep in sync with what each cmd* reads (and with its
// help): a flag missing here is rejected even if the command honours it.
const GLOBAL_FLAGS = ['--yes'] // harmless where nothing prompts
const RAW_FLAGS = ['--raw', '--markdown', '--rich']
const CONTENT_FLAGS = ['--text', '--file', '--stdin']
const COMMAND_FLAGS = {
  add: [...CONTENT_FLAGS, '--title', '--section', '--create', '--tag', '--group', '--folder', ...RAW_FLAGS, '--dry-run', '--json'],
  set: [...CONTENT_FLAGS, '--section', '--create', ...RAW_FLAGS, '--dry-run', '--json'],
  new: ['--section', '--group', '--folder', ...RAW_FLAGS, '--json'],
  list: ['--tag', '--group', '--folder', '--archived', '--json'],
  get: ['--section', '--json'], read: ['--section', '--json'], path: ['--section', '--json'],
  delete: ['--json'], rename: [], sections: [], touch: [], favorite: [], archive: [],
  'section list': [], 'section add': RAW_FLAGS, 'section rename': [], 'section delete': [],
  move: ['--group', '--folder', '--ungroup'],
  groups: ['--json'], 'group create': ['--color', '--json'], 'group delete': [],
  folders: ['--group', '--json'], 'folder list': ['--group', '--json'], 'folder create': ['--group', '--json'],
  'folder rename': ['--group'], 'folder delete': ['--group'],
  // --json only with --no-wait (loginFlagsError): the other forms print no JSON.
  login: ['--no-pull', '--no-wait', '--finish', '--json'], logout: [],
  push: [], pull: ['--force'], status: ['--json'], migrate: [], 'self-update': [],
  'cloud login': ['--no-pull', '--send-code', '--code'], 'cloud logout': [], 'cloud status': ['--json'],
  'cloud setup': [], 'cloud push': [], 'cloud pull': [],
}
const COMMAND_ALIASES = { rm: 'delete', pin: 'favorite', update: 'pull' }
const SUBCOMMAND_PARENTS = ['section', 'group', 'folder', 'cloud']

/**
 * Pure: the first flag in `seen` that `cmd [sub]` doesn't support → its error
 * message, else null. Unknown commands/subcommands → null (their own usage
 * error follows).
 */
function unsupportedFlagError(cmd, sub, seen) {
  const base = COMMAND_ALIASES[cmd] || cmd
  let key = base, label = cmd
  if (SUBCOMMAND_PARENTS.includes(base)) {
    key = `${base} ${sub === 'rm' ? 'delete' : sub}`
    label = `${cmd} ${sub}`
  }
  if (!Object.hasOwn(COMMAND_FLAGS, key)) return null
  const allowed = COMMAND_FLAGS[key]
  const bad = seen.find(f => !GLOBAL_FLAGS.includes(f) && !allowed.includes(f))
  if (!bad) return null
  return `Flag ${bad} is not supported by '${label}' — nothing was done (see 'noteflow help ${base}')`
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  // Heals a settings.json left world-readable by an older CLI or by the desktop
  // app (which creates it with the umask) — also for read-only commands like
  // `list`, which never go through writeSettings.
  restrictSettingsPerms()

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { cmdHelp(args[1]); return }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') { out(`noteflow CLI v${CLI_VERSION}`); return }

  const { flags, positional, seen } = parseFlags(args.slice(1))
  if (flags.json) jsonMode = true // reroute informational out() lines to stderr
  const flagError = unsupportedFlagError(cmd, positional[0], seen)
  if (flagError) { err(flagError); exit(1) }

  switch (cmd) {
    case 'add': {
      // Content may come as a positional arg or via --text/--file/--stdin — cmdAdd validates
      await cmdAdd(positional.join(' '), flags)
      break
    }
    case 'new': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow new <title>'); exit(1) }
      await cmdNew(title, flags)
      break
    }
    case 'list':    cmdList(flags); break
    case 'get': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow get <title>'); exit(1) }
      cmdGet(title, flags)
      break
    }
    case 'delete':
    case 'rm': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow delete <title>'); exit(1) }
      await cmdDelete(title, flags)
      break
    }
    case 'rename': {
      if (positional.length < 2) { err('Usage: noteflow rename <old-title> <new-title>'); exit(1) }
      const [old, ...rest] = positional
      await cmdRename(old, rest.join(' '))
      break
    }
    case 'sections': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow sections <title>'); exit(1) }
      cmdSections(title)
      break
    }
    case 'read': {
      const title = positional[0]
      if (!title) { err('Usage: noteflow read <title> [section]'); exit(1) }
      const section = flags.section || positional.slice(1).join(' ')
      cmdRead(title, section, flags)
      break
    }
    case 'path': {
      const title = positional[0]
      if (!title) { err('Usage: noteflow path <title> [section]'); exit(1) }
      const section = flags.section || positional.slice(1).join(' ')
      cmdPath(title, section, flags)
      break
    }
    case 'touch': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow touch <title>'); exit(1) }
      await cmdTouch(title)
      break
    }
    case 'set': {
      const title = positional[0]
      const section = flags.section || positional.slice(1).join(' ')
      if (!title || !section) { err('Usage: noteflow set <title> <section> [--text "..." | --file <path> | --stdin]'); exit(1) }
      await cmdSet(title, section, flags)
      break
    }
    case 'section': {
      const sub = positional[0]
      if (sub === 'list') {
        const title = positional.slice(1).join(' ')
        if (!title) { err('Usage: noteflow section list <title>'); exit(1) }
        cmdSections(title)
      } else if (sub === 'add') {
        const title = positional[1]
        const name = positional.slice(2).join(' ')
        if (!title || !name) { err('Usage: noteflow section add <title> <name> [--raw]'); exit(1) }
        await cmdSectionAdd(title, name, flags)
      } else if (sub === 'rename') {
        const title = positional[1]
        const oldName = positional[2]
        const newName = positional.slice(3).join(' ')
        if (!title || !oldName || !newName) { err('Usage: noteflow section rename <title> <old> <new>'); exit(1) }
        await cmdSectionRename(title, oldName, newName)
      } else if (sub === 'delete' || sub === 'rm') {
        const title = positional[1]
        const name = positional.slice(2).join(' ')
        if (!title || !name) { err('Usage: noteflow section delete <title> <name> [--yes]'); exit(1) }
        await cmdSectionDelete(title, name, flags)
      } else {
        err('Usage: noteflow section list|add|rename|delete <title> ...'); exit(1)
      }
      break
    }
    case 'favorite':
    case 'pin': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow favorite <title>'); exit(1) }
      await cmdFavorite(title)
      break
    }
    case 'archive': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow archive <title>'); exit(1) }
      await cmdArchive(title)
      break
    }
    case 'groups':  cmdGroups(flags); break
    case 'group': {
      const sub = positional[0]
      const name = positional.slice(1).join(' ')
      if (sub === 'create') { if (!name) { err('Usage: noteflow group create <name>'); exit(1) }; cmdGroupCreate(name, flags) }
      else if (sub === 'delete' || sub === 'rm') { if (!name) { err('Usage: noteflow group delete <name>'); exit(1) }; await cmdGroupDelete(name, flags) }
      else { err('Usage: noteflow group create|delete <name>'); exit(1) }
      break
    }
    case 'folders': cmdFolders(flags); break
    case 'folder': {
      const sub = positional[0]
      if (sub === 'list') { cmdFolders(flags) }
      else if (sub === 'create') {
        const name = positional.slice(1).join(' ')
        if (!name) { err('Usage: noteflow folder create <name> --group <group>'); exit(1) }
        cmdFolderCreate(name, flags)
      } else if (sub === 'rename') {
        const old = positional[1]
        const next = positional.slice(2).join(' ')
        if (!old || !next) { err('Usage: noteflow folder rename <name> <new-name> [--group <g>]'); exit(1) }
        cmdFolderRename(old, next, flags)
      } else if (sub === 'delete' || sub === 'rm') {
        const name = positional.slice(1).join(' ')
        if (!name) { err('Usage: noteflow folder delete <name> [--group <g>] [--yes]'); exit(1) }
        await cmdFolderDelete(name, flags)
      } else { err('Usage: noteflow folder list|create|rename|delete ...'); exit(1) }
      break
    }
    case 'move': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow move <title> --group <g> [--folder <f>]  (or --ungroup)'); exit(1) }
      await cmdMove(title, flags)
      break
    }
    case 'login':   await cmdLogin(positional[0], flags); break
    case 'logout':  cmdLogout(); break
    // Top-level push/pull/status route to NoteFlow Cloud while it is active
    // (signed in + enabled) and to GitHub otherwise — mirror of the app's
    // syncProvider priority.
    case 'push':    if (cloudActive()) await cmdCloudPush(); else await cmdPush(); break
    case 'pull':
    case 'update':  if (cloudActive()) await cmdCloudPull(); else await cmdPull(flags); break
    case 'cloud': {
      const sub = positional[0]
      if (sub === 'login')       await cmdCloudLogin(positional[1], flags)
      else if (sub === 'logout') await cmdCloudLogout()
      else if (sub === 'status') await cmdCloudStatus(flags)
      else if (sub === 'setup')  await cmdCloudSetup()
      else if (sub === 'push')   await cmdCloudPush()
      else if (sub === 'pull')   await cmdCloudPull()
      else { err('Usage: noteflow cloud login|logout|status|setup|push|pull'); exit(1) }
      break
    }
    case 'migrate':       await cmdMigrate(); break
    case 'self-update':   await cmdSelfUpdate(); break
    case 'status':  if (cloudActive()) await cmdCloudStatus(flags); else cmdStatus(flags); break
    default:
      err(`Unknown command: ${cmd}`)
      cmdHelp()
      exit(1)
  }
}

if (require.main === module) {
  // No process.exit() here either (see exit()): errors set process.exitCode and
  // the process ends on its own once the event loop drains.
  let settled = false
  main()
    .catch(e => {
      if (!(e instanceof CliExit)) err(e.message)
      process.exitCode = e instanceof CliExit ? e.exitCode : 1
      // Safety net, never a delay: unref'd, so it only fires if some stray
      // handle keeps the loop alive — then a late hard exit beats hanging.
      setTimeout(() => process.exit(), 3000).unref()
    })
    .finally(() => { settled = true })
  // The loop drained while main() was still pending: something awaited a promise
  // that can never settle (e.g. a prompt on a closed stdin). Node would exit 0
  // as if the command had succeeded — report it as the failure it is.
  let reported = false
  process.on('beforeExit', () => {
    if (settled || reported) return
    reported = true
    err('The command ended before finishing (no more input?)')
    process.exitCode = 1
  })
} else {
  // Test-only surface: pure crypto + row-mapping functions (so the interop with
  // the desktop app — dist-electron/cloudCrypto.js and cloudSyncLogic.js — can be
  // verified), the note.md parser/serializer (format mirror of src/lib/noteUtils.ts),
  // the pure sync-state decisions (GitHub lastSync, Cloud cursor owner) plus the
  // pure name-matching helpers. The CLI always runs as a script.
  module.exports = {
    sectionTokens, fuzzySectionMatches, looseSectionMatches, editDistance, sectionSuggestions,
    splitFrontmatter, parseNoteYaml, serializeNoteMd,
    toB64Url, fromB64Url, deriveKek, normalizeRecoveryCode, looksLikeRecoveryCode,
    derivePathKeyHmac, wrapKey, unwrapKey, encryptContent, decryptContent,
    generateDek, generateNoteKey,
    noteDirOf, isAnchorPath, isSafeCloudRelPath, listAnchorSectionFiles, parseUpdatedTimestamp,
    resolveRowUpdatedAt, shouldApplyRemoteDir, shouldApplyRemoteSection, shouldApplyRemoteDeletion,
    planPullQuery, parseRowSeq, nextPullSeq, collectSeqPages, buildFileUpsertRow, decryptFileRow,
    CLOUD_METADATA_FILES, CLOUD_PULL_COLUMNS, CLOUD_PAGE_SIZE,
    nextGithubLastSync, githubSyncWithLastSync, localOnlyNoteDirs, localOnlyHint, cliCloudForUser,
    nextPendingUpserts, pendingUnderDir, isPendingUpsert, dropReconciledPending,
    classifyConditionalUpsert, parsePullRetry, mergeRetryRows, nextPullRetry, countDroppedRetries,
    PULL_RETRY_MAX_DECRYPT_ATTEMPTS, PULL_RETRY_MAX_APPLY_ATTEMPTS, PULL_RETRY_CHUNK, CLOUD_CONDITIONAL_UPSERT_RPC,
    mergeMetadataById, planMetadataPull, dirsPendingRetry,
    planConflictCopy, buildConflictCopy, anchorTitle, conflictCopyTitle, metadataPendingForPull,
    normalizeOtpCode, planCloudLogin, decodeGithubToken, resolveGithubToken, getToken,
    loginFlagsError, checkPendingGithubLogin, resolveFinishRepo, desktopSettingsCandidates, desktopAppInfo,
    parseRepoSpec, loginOwnerError, completeGithubLogin, ensureRepo,
    unsupportedFlagError, COMMAND_FLAGS, decodeInputBuffer, looksLikeUtf16,
    gitBlobSha, isNoteFilePath, planConditionalUpsert, planConditionalDelete, remoteDirChangesSinceBase,
    nextPulledBases, githubConflictCandidates, planGithubDirMerge, githubResolveConflictDir, cmdPush, cmdPull,
    // Cloud three-way reconcile (mirrors of electron/cloudSyncLogic.ts) + the
    // Cloud engine entry points, driven by tests against an in-memory server.
    CLOUD_BASE_UPSERT_RPC, TOMBSTONE_BASE_HASH, UNKNOWN_BASE_HASH,
    hashForBase, classifyBaseUpsert, planFileReconcile, mergeAnchors, planThreeWayDir, filesNeedingCatchUp,
    needsBasesBootstrap, synthesizeBootstrapBases, parseBootstrapPending, nextBootstrapPending, parseAnchorFm,
    cloudPullNow, syncPushNoteFiles, cmdCloudPush, bindCliCloudToAccount, cliCloudBasesSnapshot, CLOUD_BASES_PATH,
    mergeSectionText, DEFAULT_SECTION_CONFLICT_LABELS, SECTION_CONFLICT_LABEL_TEMPLATES, sectionConflictLabels,
    conflictMarkerLabels, CLOUD_BASE_CONTENT_DIR,
    skillAgentDestDirs, refreshInstalledSkills,
  }
}
