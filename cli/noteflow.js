#!/usr/bin/env node
'use strict'
// v2.3.0 — human-readable version marker (keep in sync with CLI_VERSION below)

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const { randomBytes, webcrypto, createHash } = require('node:crypto')
const { execSync } = require('node:child_process')
const readline = require('node:readline')

// ── Constants ────────────────────────────────────────────────────────────────

// ⚠️ keep in sync with the "// v" header comment above (informational marker;
// self-update compares full file contents, not this version).
const CLI_VERSION = '2.3.0'

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
// templates.json, which the GitHub METADATA_FILES list above does not.
const CLOUD_METADATA_FILES = ['groups.json', 'folders.json', 'section-colors.json', 'note-order.json', 'templates.json', 'ui-settings.json']

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

function getToken() {
  const sync = getSyncSettings()
  if (!sync.encryptedToken) return null
  if (sync.encryptedToken.startsWith('safe:')) return null
  const decoded = Buffer.from(sync.encryptedToken, 'base64').toString('utf-8')
  if (!/^[\x20-\x7e]+$/.test(decoded)) return null
  return decoded
}

// ── NoteFlow Cloud settings (CLI-owned) ───────────────────────────────────────
//
// The CLI keeps its OWN GoTrue session in settings.cliAccount and its OWN sync
// state in settings.cliCloud. It must NEVER read or write settings.account /
// settings.cloudSync (the desktop app's): GoTrue ROTATES the refresh token on
// every grant, so a shared session would sign the app and the CLI out of each
// other on every refresh. The refresh token is stored base64-encoded — same
// trade-off as the CLI's GitHub token (a plain Node process has no safeStorage).

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

// { enabled, pullSeq, lastSync, userId, pendingUpserts, forceUpserts, pullRetry } — the CLI's own cursor/lastSync,
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
// The pull is last-writer-wins per note folder: a newer remote anchor replaces
// the local folder wholesale. When that folder still holds a local edit the
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
 * Throws when note.md is missing or has no frontmatter.
 */
function buildConflictCopy(localFiles, { newId, title, nowIso }) {
  const anchor = localFiles[NOTE_MD]
  if (anchor === undefined) throw new Error('conflict copy: the local folder has no note.md')
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
  for (const [name, content] of Object.entries(localFiles)) if (name !== NOTE_MD) files[name] = content
  return { dir: noteDirname(newId, title), files }
}

/** "conflict copy" in the app's language setting (settings.json `language`: en | es | system). */
function conflictCopyLabel() {
  const setting = readSettings().language
  let lang = setting === 'en' || setting === 'es' ? setting : null
  if (!lang) {
    let locale = ''
    try { locale = Intl.DateTimeFormat().resolvedOptions().locale || '' } catch { locale = '' }
    lang = locale.toLowerCase().startsWith('es') ? 'es' : 'en'
  }
  return lang === 'es' ? 'copia en conflicto' : 'conflict copy'
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
  const localDirPath = path.join(NOTES_DIR, dir)
  const localFiles = {}
  for (const f of fs.readdirSync(localDirPath)) {
    if (f.endsWith('.md')) localFiles[f] = fs.readFileSync(path.join(localDirPath, f), 'utf-8')
  }
  const now = new Date()
  const title = conflictCopyTitle(anchorTitle(localFiles[NOTE_MD] || ''), conflictCopyLabel(), now)
  let copy
  do {
    copy = buildConflictCopy(localFiles, { newId: nanoid(8), title, nowIso: now.toISOString() })
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
  settings.cliCloud = next
  writeSettings(settings)
  return !!(
    (c.pullSeq !== undefined && next.pullSeq === undefined) ||
    (c.pullCursor && !next.pullCursor) ||
    (c.lastSync && !next.lastSync)
  )
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
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.dirname}/)`))
    exit(1)
  }
  return matches[0]
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
 * Read-only by design: see the `fuzzy` option of matchSectionOrNull.
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
 * Finds a section by name. Section names are NOT unique in NoteFlow, so:
 *  - 'Name#2' targets the 2nd section named 'Name' (1-based).
 *  - an exact single match wins; multiple exact matches exit with a '#n' hint.
 *  - otherwise a single case-insensitive substring match wins.
 *  - with { fuzzy: true }, a last resort: a single token-subset match wins (see
 *    fuzzySectionMatches) and is announced on stderr.
 * Returns the section or null (no match at all). Ambiguity/out-of-range exit the process.
 *
 * `fuzzy` is opt-in and enabled ONLY by the read-only commands (`read`, `path`):
 * guessing there costs nothing, while 'add'/'set' would write into the wrong
 * section and 'section rename'/'section delete' would destroy it.
 */
function matchSectionOrNull(note, name, { fuzzy = false } = {}) {
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
  const partial = (note.sections || []).filter(s => s.name.toLowerCase().includes(q))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    err(`Ambiguous section "${baseName}" in "${note.title}" — matches: ${partial.map(s => s.name).join(', ')}. Use the exact name.`)
    exit(1)
  }
  if (fuzzy) {
    const loose = fuzzySectionMatches(note.sections, baseName)
    if (loose.length === 1) {
      // stderr on purpose: stdout of read/path stays verbatim and pipe-safe.
      console.error(`  Note: matched section "${loose[0].name}"`)
      return loose[0]
    }
    if (loose.length > 1) {
      err(`Ambiguous section "${baseName}" in "${note.title}" — matches: ${loose.map(s => s.name).join(', ')}. Use the exact name.`)
      exit(1)
    }
  }
  return null
}

/** Like matchSectionOrNull but exits when nothing matches (read/rename/delete must target an existing section). */
function resolveSection(note, name, opts) {
  const sec = matchSectionOrNull(note, name, opts)
  if (!sec) { err(`No section "${parseSectionRef(name).baseName}" in "${note.title}". Sections: ${sectionNamesOf(note)}`); exit(1) }
  return sec
}

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', c => { data += c })
    process.stdin.on('end', () => resolve(data))
  })
}

/** Content for `set`: --text wins, then --file, then stdin (explicit --stdin or a non-TTY pipe). */
async function resolveSetContent(opts) {
  let raw
  let fromStdin = false
  if (typeof opts.text === 'string') raw = opts.text
  else if (opts.file) {
    try { raw = fs.readFileSync(path.resolve(opts.file), 'utf-8') }
    catch (e) { err(`Cannot read --file: ${e.message}`); exit(1) }
  } else if (opts.stdin || !process.stdin.isTTY) { fromStdin = true; raw = await readStdin() }
  else { err('No content. Provide --text "..." , --file <path>, or pipe content with --stdin'); exit(1) }
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
          if (res.statusCode >= 400) reject(new Error(json.message || `HTTP ${res.statusCode}`))
          else resolve(json)
        } catch { reject(new Error(`HTTP ${res.statusCode}: unparseable`)) }
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

async function ensureRepo(token, owner, repo) {
  try {
    await githubRequest(token, 'GET', `/repos/${owner}/${repo}`)
  } catch {
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
 * Resolves a note folder whose push was held back (a 'conflict'): the GitHub
 * version wins the folder and the LOCAL version is kept as a conflict copy
 * when it differs (same helpers and rule as the Cloud pull's copies, and as
 * the desktop app's GitHub pull) — the copy is uploaded right away. Bases of
 * the folder become the remote blobs. Returns { copy, uploadFailed } or null
 * when the remote folder could not be read (nothing touched — 'noteflow pull'
 * or the next push retries).
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
  const localShas = {}
  try {
    for (const f of fs.readdirSync(localDirPath)) {
      if (!f.endsWith('.md')) continue
      try { localShas[`${dir}/${f}`] = gitBlobSha(fs.readFileSync(path.join(localDirPath, f), 'utf-8')) }
      catch { localShas[`${dir}/${f}`] = null }
    }
  } catch { /* folder gone locally */ }
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
  return { copy, uploadFailed }
}

/** Prints the outcome of githubResolveConflictDir (null = could not resolve). */
function reportGithubConflict(dir, res) {
  if (!res) {
    err(`${dir}: changed on GitHub since your last pull — not uploaded. Run 'noteflow pull', then 'noteflow push'`)
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
 * because it changed there (resolved: remote version + conflict copy).
 */
async function syncPushNoteFiles(dirname, files) {
  if (cloudActive()) {
    // Cloud takes priority: never double-push to GitHub while Cloud is active
    // (mirror of the desktop app's syncProvider routing). Sync errors are
    // reported but never abort the local mutation, which already landed.
    const relPaths = files.map(f => `${dirname}/${f}`)
    const uploaded = [], stale = []
    try {
      await cloudEnsureReconciled()
      const dek = await getCliDek()
      const noteKey = await cloudGetNoteKey(dek, dirname)
      const forced = getCliCloud().forceUpserts
      for (const relPath of relPaths) {
        const force = isPendingUpsert(forced, relPath)
        if ((await cloudPushFile(dek, noteKey, relPath, { force })) === 'stale') stale.push(relPath)
        else uploaded.push(relPath)
      }
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
      // Remember what did NOT reach the server: that bump of lastSync by a later
      // successful upload would otherwise expose this edit to a remote tombstone.
      const failed = relPaths.filter(r => !uploaded.includes(r))
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
      // The note changed on GitHub since this machine last saw it: take that
      // version and keep the local one as a conflict copy (never overwrite).
      reportGithubConflict(dirname, await githubResolveConflictDir(token, sync, dirname, bases))
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
 * first sync, live rows only (`deleted=eq.false`).
 */
function planPullQuery(c) {
  if (typeof c.pullSeq === 'number' && Number.isSafeInteger(c.pullSeq) && c.pullSeq >= 0) {
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
const CLOUD_MERGEABLE_METADATA = ['groups.json', 'folders.json', 'templates.json']

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

/**
 * Uploads one file as an encrypted row → 'uploaded' | 'stale'. Note rows go
 * through the CONDITIONAL upsert (RPC of migration 0011): rejected — 'stale',
 * nothing written — when the server already holds a newer version of the
 * folder (this row or its anchor, tombstones included). Root metadata json
 * and `force` uploads (a folder kept over a remote tombstone) use the plain
 * upsert; so does a server without the RPC. `e.subscription` marks the RLS
 * 403 (stop the whole push). Mirror of the app's uploadFileRow.
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
    if (outcome === 'uploaded' || outcome === 'stale') return outcome
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
async function cloudEnsureReconciled() {
  bindCliCloudToAccount() // another account's cursor ≠ reconciled
  const c = getCliCloud()
  if (c.pullSeq !== undefined || c.pullCursor || c.lastSync) return
  out('  First Cloud reconcile…')
  await cloudPullNow()
}

/**
 * Rows changed since the watermark, in seq order — KEYSET pagination
 * (`seq=gt.<last>&order=seq.asc&limit=N` until a short page): unlike offsets,
 * stable while rows are written mid-pull. Mode from planPullQuery.
 */
async function cloudFetchChangedRows(c) {
  const plan = planPullQuery(c)
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
  try { return { ...(await decryptFileRow(dek, res.json[0])), pathKey } } catch { return null }
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
      entries.push({ ...entry, pathKey: row.path_key })
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
  // Retry set: rows that failed to apply in earlier pulls ride along with this
  // batch (below the watermark now); this pull's failures replace it.
  const prevRetry = parsePullRetry(c.pullRetry)
  const applyFailures = new Map(), decryptFailures = new Set()
  const mainRows = await cloudFetchChangedRows(c)
  const rows = mergeRetryRows(mainRows, await cloudFetchRowsByPathKeys(Object.keys(prevRetry)))

  let errors = 0
  const entries = []
  for (const row of rows) {
    try {
      const entry = await decryptFileRow(dek, row)
      if (!isSafeCloudRelPath(entry.relPath)) { errors++; continue } // permanent — never retried
      entries.push({ ...entry, pathKey: row.path_key })
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

  let pulled = 0, deleted = 0
  for (const [dir, group] of dirs) {
    const fetchedForDir = [] // rows fetched outside the batch — retried with the folder
    try {
      const localDirPath = path.join(NOTES_DIR, dir)
      const localAnchorPath = path.join(localDirPath, NOTE_MD)
      const localExists = fs.existsSync(localAnchorPath)
      const localUpdatedMs = localExists
        ? parseUpdatedTimestamp(extractUpdatedTimestamp(fs.readFileSync(localAnchorPath, 'utf-8')))
        : null

      // The anchor decides.
      let anchor = group.find(e => isAnchorPath(e.relPath)) || null

      if (anchor && anchor.deleted) {
        if (!localExists) continue
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

      if (anchor && (!localExists || shouldApplyRemoteDir(anchor.updatedAtMs, localUpdatedMs))) {
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
        for (const entry of group) {
          if (isAnchorPath(entry.relPath)) continue
          cloudApplySectionFile(entry)
        }
        // Not on the server yet (pending upload) → arrives later via the
        // loose-section rule; listed-but-tombstoned → left alone.
        for (const entry of fetched.entries) {
          if (!entry.deleted) cloudApplySectionFile(entry)
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
          if (!entry.deleted) reconciledPaths.push(entry.relPath) // disk = server's version
        }
        if (changed === 0) continue // local is newer, or already identical
      }
      pulled++
      out(`  ${dir}/`)
    } catch (e) {
      if (e.abortPull) throw e // abort the pull: watermark/lastSync stay put
      errors++
      err(`${dir}: ${e.message}`)
      // Retry the WHOLE folder next pull (its rows sit below the watermark now).
      for (const e2 of [...group, ...fetchedForDir]) applyFailures.set(e2.pathKey, e2.relPath)
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
  const fresh = getCliCloud()
  patchCliCloud({
    pullSeq: nextPullSeq(c.pullSeq, mainRows), pullCursor: undefined, lastSync: new Date().toISOString(),
    pullRetry: Object.keys(pullRetry).length ? pullRetry : undefined,
    pendingUpserts: storedPendingUpserts(existingPendingUpserts(nextPendingUpserts(
      dropReconciledPending(fresh.pendingUpserts, reconciledDirs, reconciledPaths), [...keptFlat, ...copyFlat], []))),
    // The kept folder's re-upload is FORCED until it lands — persisted here so
    // an interrupted/failed one is retried forced by `noteflow push`.
    forceUpserts: storedPendingUpserts(existingPendingUpserts(nextPendingUpserts(
      dropReconciledPending(fresh.forceUpserts, reconciledDirs, reconciledPaths), keptFlat, []))),
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

// noteflow cloud login [email] [--no-pull]
async function cmdCloudLogin(emailArg, opts = {}) {
  let email = (emailArg || '').trim()
  if (!email) {
    email = await promptUntil('Email: ',
      a => (a.includes('@') ? a : null),
      a => (a ? `"${a}" is not an email address — try again` : 'Type the email of your NoteFlow account'))
    if (!email) { err(stdinClosed ? 'No email entered' : 'A valid email is required'); exit(1) }
  } else if (!email.includes('@')) { err('A valid email is required'); exit(1) }

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

  // An empty or malformed entry re-prompts locally (the emailed code stays
  // valid); only a well-formed code spends a /verify attempt.
  let session = null
  for (let attempt = 1; !session; attempt++) {
    const code = await promptUntil('Code: ', normalizeOtpCode,
      a => (a ? `"${a}" is not a valid code — paste the code from the email` : 'Paste the code from the email'))
    if (!code) { err(stdinClosed ? 'No code entered' : 'No valid code entered — run `noteflow cloud login` again'); exit(1) }

    const verify = await supabaseFetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      body: { type: 'email', email, token: code },
    })
    if (verify.status < 400) {
      session = verify.json
      if (!session || !session.access_token || !session.refresh_token || !session.user) {
        err('Unexpected response from the account service'); exit(1)
      }
    } else if (verify.status === 429) {
      err('Too many attempts — wait a moment and try again'); exit(1)
    } else if (!isInvalidOtpResponse(verify.json)) {
      err(`Could not verify the code (HTTP ${verify.status})`); exit(1)
    } else if (attempt >= OTP_VERIFY_ATTEMPTS) {
      err('That code is invalid or has expired. Run `noteflow cloud login` again to get a new one.'); exit(1)
    } else {
      const left = OTP_VERIFY_ATTEMPTS - attempt
      out(`  That code is invalid or has expired — check it and try again (${left} ${left === 1 ? 'attempt' : 'attempts'} left)`)
    }
  }
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
  const relPaths = []
  for (const dir of listLocalNoteDirs()) {
    if (halfApplied.has(dir)) continue
    for (const f of fs.readdirSync(path.join(NOTES_DIR, dir))) {
      if (f.endsWith('.md')) relPaths.push(`${dir}/${f}`)
    }
  }
  for (const m of CLOUD_METADATA_FILES) {
    if (fs.existsSync(path.join(NOTES_DIR, m))) relPaths.push(m)
  }
  if (halfApplied.size) {
    out(`  Skipping ${halfApplied.size} note(s) whose remote changes are still pending here — run 'noteflow pull' first`)
  }

  out(`  Pushing ${relPaths.length} files to NoteFlow Cloud...`)
  let pushed = 0, errors = 0
  const uploaded = [], failed = [], stale = []
  const forced = getCliCloud().forceUpserts
  // Stale (rejected: newer on the server) uploads stay pending like failures.
  const savePending = () => patchCliCloud({
    pendingUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().pendingUpserts, [...failed, ...stale], uploaded)),
    forceUpserts: storedPendingUpserts(nextPendingUpserts(getCliCloud().forceUpserts, [], uploaded)),
  })
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
//              [--tag <t>] [--group <g>] [--raw|--rich] [--create] [--dry-run] [--json]
async function cmdAdd(positionalText, opts) {
  // Content: positional arg XOR a flag source (--text/--file/--stdin, same helper as `set`).
  // Windows note: the .cmd shim truncates multi-line argv, so flag/stdin sources
  // are the reliable path for multi-line content.
  const hasFlagSource = typeof opts.text === 'string' || opts.file || opts.stdin
  if (positionalText && hasFlagSource) {
    err('Provide the content either as an argument or via --text/--file/--stdin — not both')
    exit(1)
  }
  let text
  if (positionalText) text = positionalText.replace(/^﻿+/, '').replace(/\r\n?/g, '\n')
  else if (hasFlagSource || !process.stdin.isTTY) text = await resolveSetContent(opts)
  else { err('Usage: noteflow add <text> [options] — or provide content with --text "...", --file <path>, or --stdin'); exit(1) }
  if (!text) { err('No content to add'); exit(1) }
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })

  const targetTitle = opts.title || getTodayTitle()
  const explicitSection = typeof opts.section === 'string' && opts.section !== ''
  const sectionName = explicitSection ? opts.section : 'Note'
  const isRaw = opts.raw !== false // default true (raw/markdown mode)
  const bytesWritten = Buffer.byteLength(text, 'utf-8')

  // Find existing note by title
  let existing = null
  if (opts.title) {
    const matches = findNoteByTitle(opts.title)
    if (matches.length) existing = matches[0]
    // No match → creating a brand-new note is opt-in (--create), so a typo in
    // --title fails loudly instead of silently spawning a stray note.
    if (!existing && !opts.create) {
      err(`Note "${opts.title}" not found. Pass --create to create it, or use 'noteflow new'.`)
      exit(1)
    }
  } else {
    existing = findTodayNote() // the daily note keeps its auto-create behavior
  }

  if (existing) {
    const note = readNoteFolder(existing.dirname)
    if (!note) { err(`Could not read note "${existing.title}"`); exit(1) }
    if (!note.sections.length) note.sections = [{ id: nanoid(6), name: 'Note', content: '', isRawMode: true, created: new Date().toISOString() }]

    // Find or create target section. An EXPLICIT --section resolves like in `set`
    // (partial names hit the existing section instead of spawning a duplicate,
    // '#n' picks among same-named ones, ambiguity exits rather than guessing).
    // ⚠️ The implicit default ('Note', when no --section is given) must stay
    // exact-or-create: the user named nothing, so a substring hit would silently
    // append the daily note to an unrelated section ('Meeting Notes') — or abort
    // as ambiguous with no way out. Do NOT "unify" these two branches.
    let sec = explicitSection
      ? matchSectionOrNull(note, sectionName)
      : note.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase()) || null
    const createdSection = !sec
    const newSectionName = explicitSection ? parseSectionRef(sectionName).baseName : sectionName
    if (opts.dryRun) {
      const result = { note: note.title, dirname: note.dirname, section: sec ? sec.name : newSectionName, createdNote: false, createdSection, bytesWritten, dryRun: true }
      if (opts.json) { jsonOut(result); return }
      out(`  [dry-run] Would append ${text.length} chars to "${note.title}" → "${result.section}"${createdSection ? ' (new section)' : ''} — nothing written`)
      return
    }
    if (!sec) {
      sec = { id: nanoid(6), name: newSectionName, content: '', isRawMode: isRaw, created: new Date().toISOString() }
      note.sections.push(sec)
      out(`  Created section "${newSectionName}"`)
    }
    const base = (sec.content || '').replace(/\n$/, '')
    sec.content = base ? base + '\n' + text : text
    if (opts.tag && !note.tags.includes(opts.tag)) note.tags.push(opts.tag)
    if (opts.group) {
      const g = findGroup(opts.group)
      if (g) {
        note.group = g.id
        if (opts.folder) {
          const matches = findFolders(opts.folder, g.id)
          if (matches.length === 1) note.folder = matches[0].id
          else err(matches.length ? `Multiple folders match "${opts.folder}" in "${g.name}"` : `Folder "${opts.folder}" not found in group "${g.name}"`)
        }
      } else err(`Group not found: "${opts.group}"`)
    } else if (opts.folder) {
      err('--folder requires --group')
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
    let groupId, folderId
    if (opts.group) {
      const g = findGroup(opts.group)
      if (g) {
        groupId = g.id
        if (opts.folder) {
          const matches = findFolders(opts.folder, g.id)
          if (matches.length === 1) folderId = matches[0].id
          else err(matches.length ? `Multiple folders match "${opts.folder}" in "${g.name}"` : `Folder "${opts.folder}" not found in group "${g.name}"`)
        }
      } else err(`Group not found: "${opts.group}"`)
    } else if (opts.folder) {
      err('--folder requires --group')
    }
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

// noteflow new <title> [--section <s>] [--group <g>]
async function cmdNew(title, opts) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  const id = nanoid(8)
  const now = new Date().toISOString()
  let groupId, folderId
  if (opts.group) {
    const g = findGroup(opts.group)
    if (!g) { err(`Group not found: "${opts.group}"`); exit(1) }
    groupId = g.id
    if (opts.folder) {
      const matches = findFolders(opts.folder, g.id)
      if (!matches.length) { err(`Folder "${opts.folder}" not found in group "${g.name}"`); exit(1) }
      if (matches.length > 1) { err(`Multiple folders match "${opts.folder}" in "${g.name}"`); exit(1) }
      folderId = matches[0].id
    }
  } else if (opts.folder) {
    err('--folder requires --group'); exit(1)
  }
  const note = {
    id, title, tags: [], created: now, updated: now,
    sections: [{ id: nanoid(6), name: opts.section || 'Note', content: '', isRawMode: true, created: now }],
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
    out(`    ${s.name}  (${lines} lines${s.isRawMode ? ', raw/markdown' : ', rich'}${s.aiHidden ? ', hidden from AI' : ''})`)
  }
  out('')
}

// noteflow read <title> [section]  — raw, pipe-friendly output (no decoration)
function cmdRead(titleQuery, sectionName, opts) {
  const note = resolveNote(titleQuery)
  if (sectionName) {
    const sec = resolveSection(note, sectionName, { fuzzy: true }) // read-only: a loose name match is safe here
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
    const sec = resolveSection(note, sectionName, { fuzzy: true }) // read-only: a loose name match is safe here
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

// noteflow set <title> <section> [--text <t> | --file <p> | --stdin] [--rich] [--dry-run] [--json]
// Overwrites the section's content (creates it if missing). Complements `add` (append).
async function cmdSet(titleQuery, sectionName, opts) {
  const note = resolveNote(titleQuery)
  const content = await resolveSetContent(opts)
  const bytesWritten = Buffer.byteLength(content, 'utf-8')
  let sec = matchSectionOrNull(note, sectionName) // exits on ambiguity rather than guessing
  const createdSection = !sec
  if (opts.dryRun) {
    const result = { note: note.title, dirname: note.dirname, section: sec ? sec.name : parseSectionRef(sectionName).baseName, createdNote: false, createdSection, bytesWritten, dryRun: true }
    if (opts.json) { jsonOut(result); return }
    out(`  [dry-run] Would ${createdSection ? 'create' : 'overwrite'} section "${result.section}" in "${note.title}" (${content.length} chars) — nothing written`)
    return
  }
  if (!sec) {
    sec = { id: nanoid(6), name: parseSectionRef(sectionName).baseName, content: '', isRawMode: opts.raw !== false, created: new Date().toISOString() }
    note.sections = note.sections || []
    note.sections.push(sec)
  }
  sec.content = content
  writeNoteFolder(note.dirname, note)
  if (createdSection) out(`  Created section "${sec.name}"`)
  if (opts.json) jsonOut({ note: note.title, dirname: note.dirname, section: sec.name, createdNote: false, createdSection, bytesWritten })
  else out(`  Set "${note.title}" → "${sec.name}"  (${content ? lineCount(content) + ' lines' : 'empty'})`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD, `${sec.id}.md`])
}

// noteflow section add <title> <name> [--rich]  — append a new (possibly duplicate-named) section
async function cmdSectionAdd(titleQuery, name, opts) {
  const note = resolveNote(titleQuery)
  const sec = { id: nanoid(6), name, content: '', isRawMode: opts.raw !== false, created: new Date().toISOString() }
  note.sections = note.sections || []
  note.sections.push(sec)
  writeNoteFolder(note.dirname, note)
  out(`  Added section "${name}" to "${note.title}"`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD, `${sec.id}.md`])
}

// noteflow section rename <title> <old> <new>
async function cmdSectionRename(titleQuery, oldName, newName) {
  const note = resolveNote(titleQuery)
  const sec = resolveSection(note, oldName)
  const prev = sec.name
  sec.name = newName
  writeNoteFolder(note.dirname, note) // section file is keyed by id — only note.md changes
  out(`  Renamed section "${prev}" → "${newName}" in "${note.title}"`)
  await syncPushNoteFiles(note.dirname, [NOTE_MD])
}

// noteflow section delete <title> <name> [--yes]
async function cmdSectionDelete(titleQuery, name, opts) {
  const note = resolveNote(titleQuery)
  const sec = resolveSection(note, name)
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
  // The note changed on GitHub and its version was taken (local one kept as a
  // conflict copy): deleting a section of the version just downloaded would
  // break it.
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

// noteflow login [repo] [--no-pull]
async function cmdLogin(repoName, opts = {}) {
  const repo = repoName || DEFAULT_REPO
  out('\n  Authenticating with GitHub...')
  const data = await githubAuthPost('/login/device/code', { client_id: GITHUB_CLIENT_ID, scope: 'repo' })
  if (data.error) { err(data.error_description || data.error); exit(1) }
  out(`\n  Go to:  ${data.verification_uri}`)
  out(`  Enter:  ${data.user_code}\n`)
  try {
    if (process.platform === 'linux') execSync(`xdg-open "${data.verification_uri}" 2>/dev/null`, { stdio: 'ignore' })
    else if (process.platform === 'win32') execSync(`start "" "${data.verification_uri}"`, { stdio: 'ignore', shell: true })
    else if (process.platform === 'darwin') execSync(`open "${data.verification_uri}"`, { stdio: 'ignore' })
  } catch { /* headless */ }

  let interval = (parseInt(data.interval) || 5) * 1000
  const expiresAt = Date.now() + parseInt(data.expires_in) * 1000
  process.stdout.write('  Waiting for authorization')
  while (Date.now() < expiresAt) {
    await new Promise(r => setTimeout(r, interval))
    process.stdout.write('.')
    const result = await githubAuthPost('/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID, device_code: data.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
    if (result.access_token) {
      process.stdout.write('\n')
      const token = result.access_token
      const user = await githubRequest(token, 'GET', '/user')
      out(`  Logged in as ${user.login}`)
      await ensureRepo(token, user.login, repo)
      const settings = readSettings()
      // No fresh `lastSync` here: nothing has been synced yet, and on
      // Windows/Linux this settings.json is the desktop app's too — its pull
      // deletes local notes absent from the remote when `updated <= lastSync`.
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
      writeSettings(settings)
      out(`  Connected to ${user.login}/${repo}`)
      await pullAfterLogin(opts)
      out('')
      return
    }
    if (result.error === 'slow_down') interval += 5000
    else if (result.error !== 'authorization_pending') {
      process.stdout.write('\n'); err(result.error_description || result.error); exit(1)
    }
  }
  process.stdout.write('\n'); err('Authorization expired. Try again.'); exit(1)
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
  // their folder takes the GitHub version and the local one is kept as a
  // conflict copy (uploaded too).
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
  for (const dir of conflictDirs) {
    try {
      const res = await githubResolveConflictDir(token, sync, dir, bases)
      reportGithubConflict(dir, res)
      if (!res || res.uploadFailed) errors++
    } catch (e) { errors++; console.error(`  Failed: ${dir}/ — ${e.message}`) }
  }
  saveGithubBases(sync, bases)
  out(`\n  Done: ${pushed} pushed, ${errors} errors${conflictDirs.size ? `, ${conflictDirs.size} changed on GitHub` : ''}`)
  // A failed file may be a note.md the repo still lacks — same rule as the pull.
  if (writeGithubLastSync(sync, errors, startedAt) === null) {
    out("  Last sync not updated (some files failed) — run 'noteflow push' again")
  }
}

/**
 * GitHub `lastSync` to keep after a pull/push (pure). It must mean "the repo
 * holds everything on disk": on Windows/Linux this settings.json is the
 * desktop app's too, and its pull deletes local notes absent from the repo
 * with `updated <= lastSync` (shouldRunDeletionRule in electron/syncState.ts).
 * So it only advances to `nowIso` when nothing is left unsynced (`pending` =
 * local-only note dirs after a pull, failed files after a push); otherwise
 * null = keep the previous value (or none).
 */
function nextGithubLastSync(pending, nowIso) {
  return pending > 0 ? null : nowIso
}

/**
 * Persists nextGithubLastSync (no write when it says keep). `startedAt` must be
 * taken before the command read the disk. Returns the value written, or null.
 */
function writeGithubLastSync(sync, pending, startedAt) {
  const lastSync = nextGithubLastSync(pending, startedAt)
  if (lastSync === null) return null
  const settings = readSettings()
  settings.githubSync = { ...sync, lastSync }
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
        note.sections = [{ id: nanoid(6), name: 'Note', content: body, isRawMode: true }]
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
    return
  }

  // Replace self atomically
  fs.renameSync(tmpPath, selfPath)
  try { fs.chmodSync(selfPath, 0o755) } catch { /* Windows — no-op */ }
  out(`  Updated successfully → ${selfPath}`)
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
    --file <path>        Read content from a file
    --stdin              Read content from stdin (also auto-used when piped)

  Options:
    --title <title>     Target a note with this title instead of today's date
    --create            With --title: create the note when it doesn't exist
    --section <name>    Write to a section/tab (resolved below; creates it if missing)
    --tag <tag>         Add a metadata tag to the note
    --group <name>      Assign the note to a group (only when creating)
    --folder <name>     Put the note in a folder of that group (requires --group)
    --raw               Force raw/markdown mode for the section (default: true)
    --rich              Use rich text mode for the section
    --dry-run           Show what would be written (note/section/bytes) without writing
    --json              Machine-readable result on stdout; info lines go to stderr

  Section resolution (same as 'set'): an explicit --section matches the exact name
  first, then a single case-insensitive substring ("Variables" hits an existing
  "Variables Entorno" instead of duplicating it), and "Name#2" picks among
  same-named sections; ambiguity is an error, not a guess. Without --section the
  default section "Note" is matched EXACTLY (or created) — never by substring.

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
    git log --oneline -5 | noteflow add --stdin --section "Log"
`,
    list: `
  noteflow list [options]

  Options:
    --tag <tag>     Filter by tag
    --group <name>  Filter by group
    --archived      Include archived notes
    --json          Output as JSON array

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
  add/set/section rename/delete demand an exact-or-substring name.
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
  noteflow set <title> <section> [content source] [--rich] [--dry-run] [--json]

  Overwrites a section's content (creates the section if it doesn't exist).
  This is the counterpart of 'add', which only appends.

  Content source (first one wins):
    --text "<content>"   Inline text
    --file <path>        Read content from a file
    --stdin              Read content from stdin (also auto-used when piped)
    --rich               Create a new section in rich-text mode (default: raw)

  Other options:
    --dry-run            Show what would be written (note/section/bytes) without writing
    --json               Machine-readable result on stdout; info lines go to stderr

  Section resolution: exact name first, then a single case-insensitive substring
  ("Variables" hits an existing "Variables Entorno"), and "Name#2" picks among
  same-named sections; ambiguity is an error, not a guess. With no match at all
  the section is created with the name you typed.

  Windows: the noteflow.cmd shim truncates multi-line arguments (cmd.exe drops
  everything after the first newline). PowerShell automatically picks the
  noteflow.ps1 shim, which passes them intact, forwards piped stdin as UTF-8 and
  prints accents correctly — but for non-trivial content still prefer --file or
  --stdin. If a piped --stdin arrives empty, your installed noteflow.ps1 predates
  that fix: use --file, or pipe into noteflow.cmd, or update NoteFlow.

  Examples:
    noteflow set "Project Alpha" Tasks --text "- [ ] deploy"
    cat notes.md | noteflow set "Project Alpha" Notes --stdin
    noteflow set "Project Alpha" "Tasks#2" --file todo.txt   # 2nd 'Tasks' section
`,
    section: `
  noteflow section list   <title>
  noteflow section add    <title> <name> [--rich]
  noteflow section rename <title> <old> <new>
  noteflow section delete <title> <name> [--yes]

  Manage a note's sections by name (no ids needed). Section names are NOT unique;
  disambiguate duplicates with a 1-based suffix, e.g. "Tasks#2". 'delete' refuses
  to remove the last remaining section. Quote multi-word names. Being destructive,
  'rename'/'delete' only accept exact or substring names — no loose matching.

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
  noteflow new <title> [--section <s>] [--group <g>] [--folder <f>] [--json]

  Creates a new empty note with the given title. Optionally place it in a group
  (and a folder of that group) and name its first section. --json prints the note.

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
    cloud: `
  noteflow cloud login [email]    Sign in with an emailed one-time code (standard
                                  keys: then pulls your notes; --no-pull skips it)
  noteflow cloud logout           Sign out (keeps notes and the sync cursor: signing
                                  back in with the same account resumes from it)
  noteflow cloud status [--json]  Account, keys mode and sync state
  noteflow cloud setup            Create Cloud keys (standard/managed mode)
  noteflow cloud push             Encrypt and upload all notes
  noteflow cloud pull             Download and decrypt remote changes

  NoteFlow Cloud is the account-based encrypted sync (a subscription is needed
  to upload). While signed in with Cloud enabled, plain 'noteflow push', 'pull',
  'status' and the automatic after-command sync use Cloud INSTEAD of GitHub.
  The first push runs an automatic initial pull to reconcile with the remote.

  Encryption modes:
    standard (managed)  'noteflow cloud setup' — nothing to remember.
    private (e2ee)      Set up in the DESKTOP app (it shows the one-time
                        recovery code). The CLI then asks for your passphrase or
                        recovery code on each run; set NOTEFLOW_CLOUD_PASSPHRASE
                        to skip the prompt on servers/cron. The key is never
                        stored on this machine.
`,
  }

  const aliases = { folder: 'folders', group: 'groups', sections: 'section', pin: 'favorite', rm: 'delete' }
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
    set <title> <sec>     Overwrite a section's content (creates it if missing)
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

  Sync commands:
    login [repo]          Connect to GitHub, then pull the repo's notes
                          [--no-pull: connect only, skip the first pull]
    logout                Disconnect from GitHub
    push                  Push all notes (NoteFlow Cloud when signed in, else GitHub)
    pull / update         Pull notes (NoteFlow Cloud when signed in, else GitHub)
                          [--force: GitHub only — overwrite even if local is newer]
    status                Show notes and sync status
    cloud <subcommand>    NoteFlow Cloud (encrypted, account-based sync):
                          login/logout/status/setup/push/pull — 'noteflow help cloud'
    migrate               One-time migration: flat .md notes → folder format v2
    self-update           Update this CLI script to the latest version
    version / --version   Print the CLI version

  Flags available on most commands:
    --json                Machine-readable JSON output (info lines go to stderr)
    --yes                 Skip confirmation prompts
    --dry-run             add/set: resolve the target without writing anything

  Agent quickstart (read + write by name, no ids):
    noteflow list --json                      Discover note titles + section names
    noteflow read "<title>" "<section>"       Read one section RAW (pipe-friendly)
    noteflow set  "<title>" "<section>" --text "..."   Overwrite a section
    noteflow add  "..." --title "<title>" --section "<section>"   Append instead
    noteflow path "<title>" "<section>"       Get the .md path, edit it, then:
    noteflow touch "<title>"                  …bump 'updated:' and sync

  AI agent integration:
    NoteFlow ships with an AI agent skill that teaches LLMs how to use this CLI.
    Install it into your agent (Claude Code, Cursor, etc.) with:
      npx skills add yagoid/noteflow/cli/noteflow-cli
    Or fetch the raw skill definition directly:
      https://raw.githubusercontent.com/yagoid/noteflow/main/cli/noteflow-cli/SKILL.md

  Run 'noteflow help <command>' for details on a specific command.

  Examples:
    noteflow add "Fix: CORS issue"
    noteflow add "deploy steps" --section "Tasks" --tag urgent
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
  '--raw': ['raw', true], '--rich': ['raw', false], '--stdin': ['stdin', true],
  '--ungroup': ['ungroup', true], '--create': ['create', true],
  '--dry-run': ['dryRun', true], '--force': ['force', true],
  '--no-pull': ['noPull', true],
}
const VALUE_FLAGS = ['--tag', '--title', '--section', '--group', '--folder', '--color', '--text', '--file']

function parseFlags(args) {
  const flags = {}; const positional = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    // Object.hasOwn: a plain `BOOLEAN_FLAGS[a]` would hit Object.prototype for
    // positionals like "constructor"/"toString" and crash. (VALUE_FLAGS is an
    // array + .includes, which has no such inherited-key pitfall.)
    if (Object.hasOwn(BOOLEAN_FLAGS, a)) {
      const [key, value] = BOOLEAN_FLAGS[a]
      flags[key] = value
    } else if (VALUE_FLAGS.includes(a)) {
      if (i + 1 >= args.length) { err(`Flag ${a} requires a value`); exit(1) }
      flags[a.slice(2)] = args[++i]
    } else if (a.startsWith('--')) {
      err(`Unknown flag: ${a}`)
      exit(1)
    } else positional.push(a)
  }
  return { flags, positional }
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

  const { flags, positional } = parseFlags(args.slice(1))
  if (flags.json) jsonMode = true // reroute informational out() lines to stderr

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
        if (!title || !name) { err('Usage: noteflow section add <title> <name> [--rich]'); exit(1) }
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
    sectionTokens, fuzzySectionMatches,
    splitFrontmatter, parseNoteYaml, serializeNoteMd,
    toB64Url, fromB64Url, deriveKek, normalizeRecoveryCode, looksLikeRecoveryCode,
    derivePathKeyHmac, wrapKey, unwrapKey, encryptContent, decryptContent,
    generateDek, generateNoteKey,
    noteDirOf, isAnchorPath, isSafeCloudRelPath, listAnchorSectionFiles, parseUpdatedTimestamp,
    resolveRowUpdatedAt, shouldApplyRemoteDir, shouldApplyRemoteSection, shouldApplyRemoteDeletion,
    planPullQuery, parseRowSeq, nextPullSeq, collectSeqPages, buildFileUpsertRow, decryptFileRow,
    CLOUD_METADATA_FILES, CLOUD_PULL_COLUMNS, CLOUD_PAGE_SIZE,
    nextGithubLastSync, localOnlyNoteDirs, localOnlyHint, cliCloudForUser,
    nextPendingUpserts, pendingUnderDir, isPendingUpsert, dropReconciledPending,
    classifyConditionalUpsert, parsePullRetry, mergeRetryRows, nextPullRetry, countDroppedRetries,
    PULL_RETRY_MAX_DECRYPT_ATTEMPTS, PULL_RETRY_MAX_APPLY_ATTEMPTS, PULL_RETRY_CHUNK, CLOUD_CONDITIONAL_UPSERT_RPC,
    mergeMetadataById, planMetadataPull, dirsPendingRetry,
    planConflictCopy, buildConflictCopy, anchorTitle, conflictCopyTitle, metadataPendingForPull,
    normalizeOtpCode,
    gitBlobSha, isNoteFilePath, planConditionalUpsert, planConditionalDelete, remoteDirChangesSinceBase,
    nextPulledBases, githubConflictCandidates,
  }
}
