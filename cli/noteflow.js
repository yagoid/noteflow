#!/usr/bin/env node
'use strict'
// v2.2.0 — human-readable version marker (keep in sync with CLI_VERSION below)

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const { randomBytes, webcrypto } = require('node:crypto')
const { execSync } = require('node:child_process')
const readline = require('node:readline')

// ── Constants ────────────────────────────────────────────────────────────────

// ⚠️ keep in sync with the "// v" header comment above (informational marker;
// self-update compares full file contents, not this version).
const CLI_VERSION = '2.2.0'

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

function writeSettings(data) {
  const dir = path.dirname(SETTINGS_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8')
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
  writeSettings(settings)
  // Best-effort: the file now holds a session token — make it owner-only on POSIX.
  if (process.platform !== 'win32') {
    try { fs.chmodSync(SETTINGS_PATH, 0o600) } catch { /* ignore */ }
  }
}

function clearCliAccount() {
  const settings = readSettings()
  delete settings.cliAccount
  writeSettings(settings)
}

// { enabled, pullCursor, lastSync } — the CLI's own cursor/lastSync, never the
// desktop app's settings.cloudSync (each client reconciles independently).
function getCliCloud() {
  return readSettings().cliCloud || { enabled: false }
}

function patchCliCloud(patch) {
  const settings = readSettings()
  settings.cliCloud = { ...(settings.cliCloud || { enabled: false }), ...patch }
  writeSettings(settings)
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

async function upsertRemoteFile(token, owner, repo, relPath, content, retrying = false) {
  let sha
  try {
    const existing = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`)
    sha = existing.sha
  } catch { /* new file */ }
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
      return upsertRemoteFile(token, owner, repo, relPath, content, true)
    throw e
  }
}

async function removeRemoteFile(token, owner, repo, relPath, message) {
  try {
    const existing = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`)
    await githubRequest(token, 'DELETE', `/repos/${owner}/${repo}/contents/${encodeRemotePath(relPath)}`,
      { message: message || `delete: ${relPath}`, sha: existing.sha })
  } catch { /* not there — nothing to do */ }
}

/** Pushes the given files of a note dir ('<dirname>/<file>') to the active sync backend. */
async function syncPushNoteFiles(dirname, files) {
  if (cloudActive()) {
    // Cloud takes priority: never double-push to GitHub while Cloud is active
    // (mirror of the desktop app's syncProvider routing). Sync errors are
    // reported but never abort the local mutation, which already landed.
    try {
      await cloudEnsureReconciled()
      const dek = await getCliDek()
      const noteKey = await cloudGetNoteKey(dek, dirname)
      for (const f of files) await cloudPushFile(dek, noteKey, `${dirname}/${f}`)
      // Bump lastSync like the app's schedulePush: without it a later remote
      // tombstone would be skipped forever (`updated <= lastSync` rule) while
      // the cursor advances past it — and the next push would resurrect the note.
      patchCliCloud({ lastSync: new Date().toISOString() })
      out('  Synced to NoteFlow Cloud')
    } catch (e) {
      err(`Cloud sync failed: ${e.message}`)
    }
    return
  }
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) return
  const token = getToken()
  if (!token) return
  try {
    for (const f of files) {
      const content = fs.readFileSync(path.join(NOTES_DIR, dirname, f), 'utf-8')
      await upsertRemoteFile(token, sync.owner, sync.repo, `${dirname}/${f}`, content)
    }
    out('  Synced to GitHub')
  } catch (e) {
    err(`Sync failed: ${e.message}`)
  }
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

/** Advances the incremental-pull cursor to the max remote updated_at reconciled. */
function nextPullCursor(current, entries) {
  let maxMs = current ? Date.parse(current) : null
  let maxIso = current
  for (const e of entries) {
    const ms = Date.parse(e.updatedAt)
    if (!Number.isFinite(ms)) continue
    if (maxMs === null || ms > maxMs) {
      maxMs = ms
      maxIso = new Date(ms).toISOString()
    }
  }
  return maxIso
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

/** Uploads one file as an encrypted upsert row. `e.subscription` marks the RLS 403 (stop the whole push). */
async function cloudPushFile(dek, noteKey, relPath) {
  const account = getCliAccount()
  const content = fs.readFileSync(path.join(NOTES_DIR, relPath), 'utf-8')
  const dir = noteDirOf(relPath)
  let anchorContent = null
  if (dir && !isAnchorPath(relPath)) {
    try { anchorContent = fs.readFileSync(path.join(NOTES_DIR, dir, NOTE_MD), 'utf-8') } catch { anchorContent = null }
  }
  const updatedAt = resolveRowUpdatedAt(relPath, content, anchorContent, new Date().toISOString())
  const row = await buildFileUpsertRow(dek, noteKey, relPath, content, updatedAt)
  const res = await cloudRestWithRetry(() =>
    cloudRest('/rest/v1/files?on_conflict=user_id,path_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: account.userId, ...row },
    })
  )
  if (res.status === 403) {
    const e = new Error('An active NoteFlow Cloud subscription is required to upload changes.')
    e.subscription = true
    throw e
  }
  if (res.status >= 400) throw new Error(`Cloud upload failed (HTTP ${res.status})`)
}

/** All non-deleted remote rows decrypted to (relPath, pathKey) — whole-note deletes. */
async function cloudListRemotePaths(dek) {
  const res = await cloudRest('/rest/v1/files?select=path_key,path_ct,key_ct&deleted=eq.false')
  if (res.status >= 400) throw new Error(`Cloud listing failed (HTTP ${res.status})`)
  const remote = []
  for (const raw of Array.isArray(res.json) ? res.json : []) {
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
// desktop app's initial-pull gate). Cursor or lastSync present = reconciled.
async function cloudEnsureReconciled() {
  const c = getCliCloud()
  if (c.pullCursor || c.lastSync) return
  out('  First Cloud reconcile…')
  await cloudPullNow()
}

async function cloudFetchChangedRows(cursor) {
  const PAGE = 1000 // PostgREST caps responses (Supabase default max-rows)
  const rows = []
  const base =
    '/rest/v1/files?select=path_key,path_ct,content_ct,key_ct,updated_at,deleted&order=updated_at.asc' +
    (cursor
      ? `&updated_at=gt.${encodeURIComponent(cursor)}`
      : '&deleted=eq.false') // first reconcile: nothing local to delete safely
  for (let offset = 0; ; offset += PAGE) {
    const res = await cloudRest(base, {
      headers: { Range: `${offset}-${offset + PAGE - 1}`, 'Range-Unit': 'items' },
    })
    if (res.status === 416) break // requested range past the end — done paging
    if (res.status >= 400) throw new Error(`Cloud pull failed (HTTP ${res.status})`)
    const page = Array.isArray(res.json) ? res.json : []
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/** Fetches + decrypts the remote anchor row of a dir (or null). */
async function cloudFetchRemoteAnchor(dek, dir) {
  const pathKey = await derivePathKeyHmac(dek, `${dir}/${NOTE_MD}`)
  const res = await cloudRest(
    `/rest/v1/files?select=path_key,path_ct,content_ct,key_ct,updated_at,deleted&path_key=eq.${encodeURIComponent(pathKey)}`
  )
  if (res.status >= 400 || !Array.isArray(res.json) || !res.json.length) return null
  try { return await decryptFileRow(dek, res.json[0]) } catch { return null }
}

/** Incremental pull — same grouping/conflict/tombstone rules as the app's cloudSync.pullNotes. */
async function cloudPullNow() {
  const c = getCliCloud()
  const dek = await getCliDek()
  const lastSyncMs = c.lastSync ? Date.parse(c.lastSync) : null
  const rows = await cloudFetchChangedRows(c.pullCursor)

  let errors = 0
  const entries = []
  for (const row of rows) {
    try {
      const entry = await decryptFileRow(dek, row)
      if (!isSafeCloudRelPath(entry.relPath)) { errors++; continue }
      entries.push(entry)
      // Seed the per-folder key cache so pushes reuse the same note key.
      cloudNoteKeys.set(noteDirOf(entry.relPath) || entry.relPath, entry.noteKey)
    } catch { errors++ }
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
    try {
      // The anchor decides. If the window only carried section rows
      // (interrupted push on the origin device), fetch it separately.
      let anchor = group.find(e => isAnchorPath(e.relPath)) || null
      if (!anchor) anchor = await cloudFetchRemoteAnchor(dek, dir)
      if (!anchor) continue // never fully uploaded — skip

      const localDirPath = path.join(NOTES_DIR, dir)
      const localAnchorPath = path.join(localDirPath, NOTE_MD)
      let localUpdatedMs = null
      if (fs.existsSync(localAnchorPath)) {
        localUpdatedMs = parseUpdatedTimestamp(extractUpdatedTimestamp(fs.readFileSync(localAnchorPath, 'utf-8')))
      }

      if (anchor.deleted) {
        // Note deleted remotely — apply locally only under the safety rule.
        if (fs.existsSync(localAnchorPath) && shouldApplyRemoteDeletion(localUpdatedMs, lastSyncMs)) {
          fs.rmSync(localDirPath, { recursive: true, force: true })
          deleted++
        }
        continue
      }

      if (fs.existsSync(localAnchorPath) && !shouldApplyRemoteDir(anchor.updatedAtMs, localUpdatedMs)) {
        continue // local is newer or equal — cursor advances anyway
      }

      fs.mkdirSync(localDirPath, { recursive: true })
      fs.writeFileSync(localAnchorPath, anchor.content, 'utf-8')
      for (const entry of group) {
        if (isAnchorPath(entry.relPath)) continue
        const localFile = path.join(NOTES_DIR, entry.relPath)
        if (entry.deleted) {
          try { fs.unlinkSync(localFile) } catch { /* already gone */ }
        } else {
          fs.writeFileSync(localFile, entry.content, 'utf-8')
        }
      }
      pulled++
      out(`  ${dir}/`)
    } catch (e) {
      errors++
      err(`${dir}: ${e.message}`)
    }
  }

  // Root metadata json — remote write wins (same LWW as the app / GitHub pull).
  for (const entry of rootFiles) {
    try {
      if (entry.deleted) continue // metadata is never deleted by the app
      const metadataPath = path.join(NOTES_DIR, entry.relPath)
      const localContent = fs.existsSync(metadataPath) ? fs.readFileSync(metadataPath, 'utf-8') : null
      if (localContent !== entry.content) fs.writeFileSync(metadataPath, entry.content, 'utf-8')
    } catch { errors++ }
  }

  patchCliCloud({ pullCursor: nextPullCursor(c.pullCursor, entries), lastSync: new Date().toISOString() })
  return { pulled, deleted, errors }
}

// ── NoteFlow Cloud: commands ──────────────────────────────────────────────────

// The project's GoTrue emails 6-digit codes (⚠️ keep in sync with the "Sent a
// 6-digit code" copy). Spaces/dashes are tolerated so a pasted "123 456" works.
const OTP_CODE_RE = /^\d{6}$/
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

// noteflow cloud login [email]
async function cmdCloudLogin(emailArg) {
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
  out(`  Sent a 6-digit code to ${email}`)

  // An empty or malformed entry re-prompts locally (the emailed code stays
  // valid); only a well-formed code spends a /verify attempt.
  let session = null
  for (let attempt = 1; !session; attempt++) {
    const code = await promptUntil('Code: ', normalizeOtpCode,
      a => (a ? `"${a}" is not a 6-digit code — paste the code from the email` : 'Paste the 6-digit code from the email'))
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
  saveCliAccount({
    email: session.user.email || email,
    userId: session.user.id,
    refreshToken: Buffer.from(session.refresh_token).toString('base64'),
  })
  patchCliCloud({ enabled: true })
  cloudAccessToken = session.access_token
  out(`  Signed in as ${session.user.email || email} — NoteFlow Cloud sync enabled`)

  // Best-effort: tell the user whether the account already has Cloud keys.
  try {
    const res = await cloudRest('/rest/v1/user_keys?select=mode')
    if (res.status < 400 && Array.isArray(res.json)) {
      if (res.json.length) {
        out(`  Cloud keys: ${res.json[0].mode === 'e2ee' ? 'private (e2ee) — passphrase needed to sync' : 'standard (managed)'}`)
      } else {
        out('  No Cloud keys yet — run `noteflow cloud setup` (or set up Cloud in the desktop app)')
      }
    }
  } catch { /* informational only */ }
}

// noteflow cloud logout — best-effort server revocation, keeps cursor/lastSync
async function cmdCloudLogout() {
  const account = getCliAccount()
  if (!account) {
    patchCliCloud({ enabled: false })
    out('  Not signed in')
    return
  }
  try {
    const token = await getCloudAccessToken()
    await supabaseFetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', accessToken: token })
  } catch { /* best-effort revocation */ }
  clearCliAccount()
  patchCliCloud({ enabled: false }) // keeps pullCursor/lastSync — re-login resumes incrementally
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
        ? { email: account.email, enabled: !!c.enabled, keysMode, lastSync: c.lastSync || null, pullCursor: c.pullCursor || null }
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
    if (c.pullCursor) out(`  Cursor:    ${c.pullCursor}`)
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

  const relPaths = []
  for (const dir of listLocalNoteDirs()) {
    for (const f of fs.readdirSync(path.join(NOTES_DIR, dir))) {
      if (f.endsWith('.md')) relPaths.push(`${dir}/${f}`)
    }
  }
  for (const m of CLOUD_METADATA_FILES) {
    if (fs.existsSync(path.join(NOTES_DIR, m))) relPaths.push(m)
  }

  out(`  Pushing ${relPaths.length} files to NoteFlow Cloud...`)
  let pushed = 0, errors = 0
  for (const relPath of relPaths) {
    try {
      const noteKey = await cloudGetNoteKey(dek, noteDirOf(relPath) || relPath)
      await cloudPushFile(dek, noteKey, relPath)
      pushed++
      process.stdout.write(`\r  ${pushed}/${relPaths.length}`)
    } catch (e) {
      if (e.subscription) { process.stdout.write('\n'); err(e.message); exit(1) }
      errors++
      console.error(`\n  Failed: ${relPath} — ${e.message}`)
    }
  }
  patchCliCloud({ lastSync: new Date().toISOString() })
  out(`\n  Done: ${pushed} pushed, ${errors} errors`)
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
    if (!note.sections.length) note.sections = [{ id: nanoid(6), name: 'Note', content: '', isRawMode: true }]

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
      sec = { id: nanoid(6), name: newSectionName, content: '', isRawMode: isRaw }
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
      sections: [{ id: nanoid(6), name: sectionName, content: text, isRawMode: isRaw }],
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
    sections: [{ id: nanoid(6), name: opts.section || 'Note', content: '', isRawMode: true }],
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
      try {
        const blobs = await listRemoteTree(token, sync.owner, sync.repo)
        for (const b of blobs) {
          if (b.path.startsWith(`${note.dirname}/`)) {
            await removeRemoteFile(token, sync.owner, sync.repo, b.path, `delete: ${note.title}`)
          }
        }
        out('  Deleted from GitHub')
      } catch { /* ignore remote errors */ }
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
    sec = { id: nanoid(6), name: parseSectionRef(sectionName).baseName, content: '', isRawMode: opts.raw !== false }
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
  const sec = { id: nanoid(6), name, content: '', isRawMode: opts.raw !== false }
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
  await syncPushNoteFiles(note.dirname, [NOTE_MD])
  // Remove the section's file from the remote too, or a pull would resurrect it
  if (cloudActive()) {
    try { await cloudTombstoneRelPaths([`${note.dirname}/${removedFile}`]) }
    catch (e) { err(`Cloud delete failed: ${e.message}`) }
    return
  }
  const sync = getSyncSettings()
  if (sync.enabled && sync.owner && sync.repo) {
    const token = getToken()
    if (token) {
      try { await removeRemoteFile(token, sync.owner, sync.repo, `${note.dirname}/${removedFile}`, `delete section: ${sec.name}`) }
      catch { /* ignore remote errors */ }
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

// noteflow login [repo]
async function cmdLogin(repoName) {
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
      settings.githubSync = {
        enabled: true,
        encryptedToken: Buffer.from(token).toString('base64'),
        owner: user.login, repo, lastSync: new Date().toISOString(),
      }
      writeSettings(settings)
      out(`  Connected to ${user.login}/${repo}`)
      out("  Run 'noteflow push' to upload existing notes\n")
      return
    }
    if (result.error === 'slow_down') interval += 5000
    else if (result.error !== 'authorization_pending') {
      process.stdout.write('\n'); err(result.error_description || result.error); exit(1)
    }
  }
  process.stdout.write('\n'); err('Authorization expired. Try again.'); exit(1)
}

function cmdLogout() {
  const settings = readSettings()
  delete settings.githubSync
  writeSettings(settings)
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
  let pushed = 0, errors = 0
  for (const relPath of relPaths) {
    try {
      const content = fs.readFileSync(path.join(NOTES_DIR, relPath), 'utf-8')
      await upsertRemoteFile(token, sync.owner, sync.repo, relPath, content)
      pushed++; process.stdout.write(`\r  ${pushed}/${relPaths.length}`)
    } catch (e) { errors++; console.error(`\n  Failed: ${relPath} — ${e.message}`) }
  }
  try { await upsertRemoteFile(token, sync.owner, sync.repo, FORMAT_MARKER, `${FORMAT_VERSION}\n`) } catch { /* ignore */ }
  const settings = readSettings()
  settings.githubSync = { ...sync, lastSync: new Date().toISOString() }
  writeSettings(settings)
  out(`\n  Done: ${pushed} pushed, ${errors} errors`)
}

async function cmdPull(opts = {}) {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) { err('Not connected. Run: noteflow login'); exit(1) }
  const token = getToken()
  if (!token) { err('Token unavailable (encrypted by desktop app). Run: noteflow login'); exit(1) }
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  const force = opts.force === true
  out(`  Pulling from ${sync.owner}/${sync.repo}...${force ? ' (--force)' : ''}`)

  let blobs = []
  try {
    blobs = await listRemoteTree(token, sync.owner, sync.repo)
  } catch (e) {
    // 404/409 means the repo is empty (just initialized); any other error is real
    if (e.message && !e.message.includes('404') && !e.message.includes('409') && !e.message.toLowerCase().includes('not found') && !e.message.toLowerCase().includes('empty')) {
      err(`Could not list remote files: ${e.message}`)
      exit(1)
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
  const settings = readSettings()
  settings.githubSync = { ...sync, lastSync: new Date().toISOString() }
  writeSettings(settings)
  out(`  Done: ${pulled} pulled${skipped ? `, ${skipped} skipped (local is newer — use --force to override)` : ''}`)
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
  noteflow cloud login [email]    Sign in with an emailed 6-digit code
  noteflow cloud logout           Sign out (keeps notes and the sync cursor)
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
    login [repo]          Connect to GitHub
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
    case 'login':   await cmdLogin(positional[0]); break
    case 'logout':  cmdLogout(); break
    // Top-level push/pull/status route to NoteFlow Cloud while it is active
    // (signed in + enabled) and to GitHub otherwise — mirror of the app's
    // syncProvider priority.
    case 'push':    if (cloudActive()) await cmdCloudPush(); else await cmdPush(); break
    case 'pull':
    case 'update':  if (cloudActive()) await cmdCloudPull(); else await cmdPull(flags); break
    case 'cloud': {
      const sub = positional[0]
      if (sub === 'login')       await cmdCloudLogin(positional[1])
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
  // verified) plus the pure name-matching helpers. The CLI always runs as a script.
  module.exports = {
    sectionTokens, fuzzySectionMatches,
    toB64Url, fromB64Url, deriveKek, normalizeRecoveryCode, looksLikeRecoveryCode,
    derivePathKeyHmac, wrapKey, unwrapKey, encryptContent, decryptContent,
    generateDek, generateNoteKey,
    noteDirOf, isAnchorPath, isSafeCloudRelPath, parseUpdatedTimestamp,
    resolveRowUpdatedAt, shouldApplyRemoteDir, shouldApplyRemoteDeletion,
    nextPullCursor, buildFileUpsertRow, decryptFileRow,
    CLOUD_METADATA_FILES,
  }
}
