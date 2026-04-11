#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const { randomBytes } = require('node:crypto')
const { execSync } = require('node:child_process')
const readline = require('node:readline')

// ── Constants ────────────────────────────────────────────────────────────────

const GITHUB_CLIENT_ID = 'Ov23liut9QOJ2pJFF0KR'
const DEFAULT_REPO = 'noteflow-notes'
const GROUP_COLORS = ['--accent', '--accent-2', '--red', '--cyan', '--purple', '--text', '--orange', '--pink']

// ── Paths ────────────────────────────────────────────────────────────────────

const NOTES_DIR = process.platform === 'linux'
  ? path.join(os.homedir(), '.local', 'share', 'noteflow-notes')
  : path.join(os.homedir(), 'noteflow-notes')

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

function noteFilename(id, title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
  return `${slug ? slug + '-' : ''}${id}.md`
}

function out(msg) { console.log(msg) }
function err(msg) { console.error(`  Error: ${msg}`) }

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

// ── YAML parser ───────────────────────────────────────────────────────────────

function splitFrontmatter(raw) {
  const s = raw.replace(/\r\n/g, '\n')
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
  return note
}

// ── YAML serializer ───────────────────────────────────────────────────────────

function serializeNote(note) {
  let y = ''
  y += `id: ${q(note.id)}\n`
  y += `title: ${q(note.title)}\n`
  y += `tags: [${(note.tags || []).map(q).join(', ')}]\n`
  y += `created: ${q(note.created)}\n`
  y += `updated: ${q(note.updated)}\n`
  y += 'sections:\n'
  for (const s of note.sections) {
    y += `  - id: ${q(s.id)}\n`
    y += `    name: ${q(s.name)}\n`
    const c = s.content || ''
    if (c === '') {
      y += '    content: ""\n'
    } else if (c.includes('\n')) {
      const hasTrailing = c.endsWith('\n')
      const contentLines = hasTrailing ? c.slice(0, -1).split('\n') : c.split('\n')
      y += `    content: ${hasTrailing ? '|' : '|-'}\n`
      for (const line of contentLines) y += '      ' + line + '\n'
    } else {
      y += `    content: ${q(c)}\n`
    }
    if (s.isRawMode) y += '    isRawMode: true\n'
  }
  if (note.archived) y += 'archived: true\n'
  if (note.pinned)   y += 'pinned: true\n'
  if (note.group)    y += `group: ${q(note.group)}\n`
  const body = note.sections[0]?.content || ''
  return `---\n${y}---\n${body}`
}

// ── Note file helpers ─────────────────────────────────────────────────────────

function loadAllNotes() {
  if (!fs.existsSync(NOTES_DIR)) return []
  return fs.readdirSync(NOTES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(NOTES_DIR, f)
      const raw = fs.readFileSync(filePath, 'utf-8')
      if (raw.includes('encryption:')) return null
      const { frontmatter } = splitFrontmatter(raw)
      const note = parseNoteYaml(frontmatter)
      return { ...note, filePath, filename: f, raw }
    })
    .filter(Boolean)
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

async function upsertRemoteFile(token, owner, repo, filename, content, retrying = false) {
  let sha
  try {
    const existing = await githubRequest(token, 'GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`)
    sha = existing.sha
  } catch { /* new file */ }
  const titleMatch = content.match(/^title:\s*['"]?(.+?)['"]?\s*$/m)
  const label = titleMatch ? titleMatch[1].trim() : filename.replace(/\.md$/, '')
  try {
    await githubRequest(token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`, {
      message: sha ? `update: ${label}` : `add: ${label}`,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    })
  } catch (e) {
    if (!retrying && (e.message.includes('409') || e.message.includes('conflict') || e.message.includes('is at') || e.message.includes('422')))
      return upsertRemoteFile(token, owner, repo, filename, content, true)
    throw e
  }
}

async function syncPushFile(filePath) {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) return
  const token = getToken()
  if (!token) return
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    await upsertRemoteFile(token, sync.owner, sync.repo, path.basename(filePath), content)
    out('  Synced to GitHub')
  } catch (e) {
    err(`Sync failed: ${e.message}`)
  }
}

// ── Confirm prompt ────────────────────────────────────────────────────────────

function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`  ${question} (y/N) `, answer => { rl.close(); resolve(answer.trim().toLowerCase() === 'y') })
  })
}

// ── Commands ──────────────────────────────────────────────────────────────────

// noteflow add <text> [--title <t>] [--section <s>] [--tag <t>] [--group <g>] [--raw|--rich]
async function cmdAdd(text, opts) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })

  const targetTitle = opts.title || getTodayTitle()
  const sectionName = opts.section || 'Note'
  const isRaw = opts.raw !== false // default true (raw/markdown mode)

  // Find existing note by title
  let notePath = null
  if (opts.title) {
    const matches = findNoteByTitle(opts.title)
    if (matches.length) notePath = matches[0].filePath
  } else {
    const todayNote = findTodayNote()
    if (todayNote) notePath = todayNote.filePath
  }

  if (notePath) {
    const raw = fs.readFileSync(notePath, 'utf-8')
    const { frontmatter } = splitFrontmatter(raw)
    const note = parseNoteYaml(frontmatter)
    if (!note.sections.length) note.sections = [{ id: nanoid(6), name: 'Note', content: '', isRawMode: true }]

    // Find or create target section
    let sec = note.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase())
    if (!sec) {
      sec = { id: nanoid(6), name: sectionName, content: '', isRawMode: isRaw }
      note.sections.push(sec)
      out(`  Created section "${sectionName}"`)
    }
    const base = (sec.content || '').replace(/\n$/, '')
    sec.content = base ? base + '\n' + text : text
    note.updated = new Date().toISOString()
    if (opts.tag && !note.tags.includes(opts.tag)) note.tags.push(opts.tag)
    if (opts.group) {
      const g = findGroup(opts.group)
      if (g) note.group = g.id
      else err(`Group not found: "${opts.group}"`)
    }
    fs.writeFileSync(notePath, serializeNote(note), 'utf-8')
    out(`  Added to ${path.basename(notePath)}${opts.section ? ` → ${sectionName}` : ''}`)
    await syncPushFile(notePath)
  } else {
    const id = nanoid(8)
    const now = new Date().toISOString()
    let groupId
    if (opts.group) {
      const g = findGroup(opts.group)
      if (g) groupId = g.id
      else err(`Group not found: "${opts.group}"`)
    }
    const note = {
      id, title: targetTitle,
      tags: opts.tag ? [opts.tag] : [],
      created: now, updated: now,
      sections: [{ id: nanoid(6), name: sectionName, content: text, isRawMode: isRaw }],
      ...(groupId ? { group: groupId } : {}),
    }
    const filename = noteFilename(id, note.title)
    const filePath = path.join(NOTES_DIR, filename)
    fs.writeFileSync(filePath, serializeNote(note), 'utf-8')
    out(`  Created ${filename}`)
    await syncPushFile(filePath)
  }
}

// noteflow new <title> [--section <s>] [--group <g>]
async function cmdNew(title, opts) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  const id = nanoid(8)
  const now = new Date().toISOString()
  let groupId
  if (opts.group) {
    const g = findGroup(opts.group)
    if (g) groupId = g.id
    else { err(`Group not found: "${opts.group}"`); process.exit(1) }
  }
  const note = {
    id, title, tags: [], created: now, updated: now,
    sections: [{ id: nanoid(6), name: opts.section || 'Note', content: '', isRawMode: true }],
    ...(groupId ? { group: groupId } : {}),
  }
  const filename = noteFilename(id, title)
  const filePath = path.join(NOTES_DIR, filename)
  fs.writeFileSync(filePath, serializeNote(note), 'utf-8')
  if (opts.json) { process.stdout.write(JSON.stringify({ id, title, filename }) + '\n'); return }
  out(`  Created "${title}"  →  ${filename}`)
  await syncPushFile(filePath)
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
  if (!opts.archived) filtered = filtered.filter(n => !n.archived)
  filtered.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))

  if (opts.json) {
    process.stdout.write(JSON.stringify(filtered.map(n => ({
      id: n.id, title: n.title, tags: n.tags, group: n.group,
      created: n.created, updated: n.updated, archived: n.archived, pinned: n.pinned,
      sections: n.sections?.map(s => s.name),
      filename: n.filename,
    }))) + '\n')
    return
  }

  if (!filtered.length) { out('  No notes found'); return }
  const groups = readGroups()
  out('')
  for (const n of filtered) {
    const g = n.group ? groups.find(gr => gr.id === n.group) : null
    const tags = n.tags?.length ? `  [${n.tags.join(', ')}]` : ''
    const grp  = g ? `  (${g.name})` : ''
    const pin  = n.pinned ? ' 📌' : ''
    const arc  = n.archived ? ' [archived]' : ''
    out(`  ${n.title}${pin}${arc}${tags}${grp}`)
    out(`    ${n.filename}`)
  }
  out('')
}

// noteflow get <title> [--section <s>] [--json]
function cmdGet(titleQuery, opts) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); process.exit(1) }
  if (matches.length > 1 && !opts.json) {
    out(`  Multiple matches — be more specific:`)
    matches.forEach(n => out(`    ${n.title}  (${n.filename})`))
    process.exit(1)
  }
  const note = matches[0]

  if (opts.json) {
    const result = {
      id: note.id, title: note.title, tags: note.tags, group: note.group,
      created: note.created, updated: note.updated, archived: note.archived, pinned: note.pinned,
      sections: note.sections?.map(s => ({ id: s.id, name: s.name, content: s.content, isRawMode: s.isRawMode })),
      filename: note.filename,
    }
    process.stdout.write(JSON.stringify(result) + '\n')
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

// noteflow delete <title> [--yes]
async function cmdDelete(titleQuery, opts) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); process.exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.filename})`))
    process.exit(1)
  }
  const note = matches[0]
  if (!opts.yes) {
    const ok = await confirm(`Delete "${note.title}"?`)
    if (!ok) { out('  Cancelled'); return }
  }
  fs.unlinkSync(note.filePath)
  out(`  Deleted "${note.title}"`)

  // Remove from GitHub if connected
  const sync = getSyncSettings()
  if (sync.enabled && sync.owner && sync.repo) {
    const token = getToken()
    if (token) {
      try {
        const existing = await githubRequest(token, 'GET',
          `/repos/${sync.owner}/${sync.repo}/contents/${encodeURIComponent(note.filename)}`)
        await githubRequest(token, 'DELETE',
          `/repos/${sync.owner}/${sync.repo}/contents/${encodeURIComponent(note.filename)}`,
          { message: `delete: ${note.title}`, sha: existing.sha })
        out('  Deleted from GitHub')
      } catch { /* ignore remote errors */ }
    }
  }
}

// noteflow pin <title>
async function cmdPin(titleQuery) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); process.exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.filename})`)); process.exit(1)
  }
  const note = matches[0]
  note.pinned = !note.pinned
  note.updated = new Date().toISOString()
  fs.writeFileSync(note.filePath, serializeNote(note), 'utf-8')
  out(`  "${note.title}" ${note.pinned ? 'pinned' : 'unpinned'}`)
  await syncPushFile(note.filePath)
}

// noteflow archive <title>
async function cmdArchive(titleQuery) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); process.exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.filename})`)); process.exit(1)
  }
  const note = matches[0]
  note.archived = !note.archived
  note.updated = new Date().toISOString()
  fs.writeFileSync(note.filePath, serializeNote(note), 'utf-8')
  out(`  "${note.title}" ${note.archived ? 'archived' : 'unarchived'}`)
  await syncPushFile(note.filePath)
}

// noteflow rename <old-title> <new-title>
async function cmdRename(oldTitle, newTitle) {
  const matches = findNoteByTitle(oldTitle)
  if (!matches.length) { err(`No note found: "${oldTitle}"`); process.exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.filename})`)); process.exit(1)
  }
  const note = matches[0]
  note.title = newTitle
  note.updated = new Date().toISOString()
  fs.writeFileSync(note.filePath, serializeNote(note), 'utf-8')
  out(`  Renamed to "${newTitle}"`)
  await syncPushFile(note.filePath)
}

// noteflow sections <title>
function cmdSections(titleQuery) {
  const matches = findNoteByTitle(titleQuery)
  if (!matches.length) { err(`No note found: "${titleQuery}"`); process.exit(1) }
  if (matches.length > 1) {
    out('  Multiple matches — be more specific:')
    matches.forEach(n => out(`    ${n.title}  (${n.filename})`)); process.exit(1)
  }
  const note = matches[0]
  out(`\n  Sections of "${note.title}":`)
  for (const s of note.sections || []) {
    const lines = (s.content || '').split('\n').filter(Boolean).length
    out(`    ${s.name}  (${lines} lines${s.isRawMode ? ', raw/markdown' : ', rich'})`)
  }
  out('')
}

// noteflow groups [--json]
function cmdGroups(opts) {
  const groups = readGroups()
  if (opts.json) { process.stdout.write(JSON.stringify(groups) + '\n'); return }
  if (!groups.length) { out('  No groups'); return }
  out('')
  for (const g of groups) out(`  ${g.name}  (id: ${g.id}, color: ${g.color})`)
  out('')
}

// noteflow group create <name> [--color <color>]
function cmdGroupCreate(name, opts) {
  const groups = readGroups()
  if (groups.find(g => g.name.toLowerCase() === name.toLowerCase())) {
    err(`Group "${name}" already exists`); process.exit(1)
  }
  const color = opts.color
    ? (GROUP_COLORS.find(c => c.includes(opts.color)) || '--accent')
    : '--accent'
  const g = { id: nanoid(8), name, color, order: groups.length }
  groups.push(g)
  writeGroups(groups)
  if (opts.json) { process.stdout.write(JSON.stringify(g) + '\n'); return }
  out(`  Created group "${name}"  (id: ${g.id})`)
}

// noteflow group delete <name> [--yes]
async function cmdGroupDelete(name, opts) {
  const groups = readGroups()
  const g = groups.find(gr => gr.name.toLowerCase() === name.toLowerCase() || gr.id === name)
  if (!g) { err(`Group not found: "${name}"`); process.exit(1) }
  if (!opts.yes) {
    const ok = await confirm(`Delete group "${g.name}"? (Notes will be ungrouped)`)
    if (!ok) { out('  Cancelled'); return }
  }
  const updated = groups.filter(gr => gr.id !== g.id)
  writeGroups(updated)
  // Ungroup notes that were in this group
  const notes = loadAllNotes()
  for (const n of notes.filter(n => n.group === g.id)) {
    delete n.group
    n.updated = new Date().toISOString()
    fs.writeFileSync(n.filePath, serializeNote(n), 'utf-8')
  }
  out(`  Deleted group "${g.name}"`)
}

// noteflow login [repo]
async function cmdLogin(repoName) {
  const repo = repoName || DEFAULT_REPO
  out('\n  Authenticating with GitHub...')
  const data = await githubAuthPost('/login/device/code', { client_id: GITHUB_CLIENT_ID, scope: 'repo' })
  if (data.error) { err(data.error_description || data.error); process.exit(1) }
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
      process.stdout.write('\n'); err(result.error_description || result.error); process.exit(1)
    }
  }
  process.stdout.write('\n'); err('Authorization expired. Try again.'); process.exit(1)
}

function cmdLogout() {
  const settings = readSettings()
  delete settings.githubSync
  writeSettings(settings)
  out('  Disconnected from GitHub')
}

async function cmdPush() {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) { err('Not connected. Run: noteflow login'); process.exit(1) }
  const token = getToken()
  if (!token) { err('Token unavailable (encrypted by desktop app). Run: noteflow login'); process.exit(1) }
  if (!fs.existsSync(NOTES_DIR)) { out('  No notes to push'); return }
  const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md'))
  out(`  Pushing ${files.length} notes to ${sync.owner}/${sync.repo}...`)
  let pushed = 0, errors = 0
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(NOTES_DIR, file), 'utf-8')
      await upsertRemoteFile(token, sync.owner, sync.repo, file, content)
      pushed++; process.stdout.write(`\r  ${pushed}/${files.length}`)
    } catch (e) { errors++; console.error(`\n  Failed: ${file} — ${e.message}`) }
  }
  const groupsPath = path.join(NOTES_DIR, 'groups.json')
  if (fs.existsSync(groupsPath)) {
    try {
      await upsertRemoteFile(token, sync.owner, sync.repo, 'groups.json', fs.readFileSync(groupsPath, 'utf-8'))
    } catch { /* ignore */ }
  }
  const settings = readSettings()
  settings.githubSync = { ...sync, lastSync: new Date().toISOString() }
  writeSettings(settings)
  out(`\n  Done: ${pushed} pushed, ${errors} errors`)
}

async function cmdPull() {
  const sync = getSyncSettings()
  if (!sync.enabled || !sync.owner || !sync.repo) { err('Not connected. Run: noteflow login'); process.exit(1) }
  const token = getToken()
  if (!token) { err('Token unavailable (encrypted by desktop app). Run: noteflow login'); process.exit(1) }
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true })
  out(`  Pulling from ${sync.owner}/${sync.repo}...`)
  let remoteFiles = []
  try {
    const files = await githubRequest(token, 'GET', `/repos/${sync.owner}/${sync.repo}/contents/`)
    remoteFiles = Array.isArray(files) ? files.filter(f => f.type === 'file' && f.name.endsWith('.md')) : []
  } catch { /* empty repo */ }
  let pulled = 0
  for (const file of remoteFiles) {
    try {
      const remote = await githubRequest(token, 'GET', `/repos/${sync.owner}/${sync.repo}/contents/${encodeURIComponent(file.name)}`)
      const content = Buffer.from(remote.content.replace(/\n/g, ''), 'base64').toString('utf-8')
      const localPath = path.join(NOTES_DIR, file.name)
      if (fs.existsSync(localPath)) {
        const localContent = fs.readFileSync(localPath, 'utf-8')
        const lu = extractUpdatedTimestamp(localContent), ru = extractUpdatedTimestamp(content)
        if (lu && ru && ru <= lu) continue
      }
      fs.writeFileSync(localPath, content, 'utf-8'); pulled++; out(`  ${file.name}`)
    } catch (e) { err(`${file.name}: ${e.message}`) }
  }
  try {
    const remote = await githubRequest(token, 'GET', `/repos/${sync.owner}/${sync.repo}/contents/groups.json`)
    const content = Buffer.from(remote.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    fs.writeFileSync(path.join(NOTES_DIR, 'groups.json'), content, 'utf-8')
  } catch { /* optional */ }
  const settings = readSettings()
  settings.githubSync = { ...sync, lastSync: new Date().toISOString() }
  writeSettings(settings)
  out(`  Done: ${pulled} notes pulled`)
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

  // Extract version comment from downloaded file (first line with "// v")
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
  const noteCount = fs.existsSync(NOTES_DIR) ? fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md')).length : 0
  const groups = readGroups()
  if (opts.json) {
    process.stdout.write(JSON.stringify({
      notesDir: NOTES_DIR, noteCount,
      github: sync.enabled && sync.owner && sync.repo ? {
        owner: sync.owner, repo: sync.repo, lastSync: sync.lastSync,
        tokenAccessible: !!getToken(),
      } : null,
      groups: groups.length,
    }) + '\n')
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
  noteflow add <text> [options]

  Adds text to today's daily note (or a specific note).
  If the note doesn't exist it will be created.

  Options:
    --title <title>     Write to/create a note with this title instead of today's date
    --section <name>    Write to a specific section/tab (creates it if missing)
    --tag <tag>         Add a metadata tag to the note
    --group <name>      Assign the note to a group (only when creating)
    --raw               Force raw/markdown mode for the section (default: true)
    --rich              Use rich text mode for the section

  Examples:
    noteflow add "Fix: CORS issue"
    noteflow add "meeting notes" --title "Project Alpha" --section "Meetings"
    noteflow add "- [ ] deploy" --section "Tasks" --tag urgent
    noteflow add "text" --group backend
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

  Shows the content of a note. Title can be partial.

  Options:
    --section <name>   Show only this section
    --json             Output as JSON

  Example:
    noteflow get "Project Alpha" --section Tasks --json
`,
    groups: `
  noteflow groups [--json]
  noteflow group create <name> [--color <red|cyan|purple|orange|pink|accent>]
  noteflow group delete <name> [--yes]

  Colors: accent (default), accent-2, red, cyan, purple, text, orange, pink
`,
  }

  if (topic && topics[topic]) { out(topics[topic]); return }

  out(`
  NoteFlow CLI — quick notes from your terminal

  Note commands:
    add <text>            Add text to today's daily note
    new <title>           Create a new empty note
    list                  List notes
    get <title>           Show note content
    delete <title>        Delete a note
    rename <old> <new>    Rename a note
    sections <title>      List sections of a note
    pin <title>           Toggle pin on a note
    archive <title>       Toggle archive on a note

  Group commands:
    groups                List all groups
    group create <name>   Create a group
    group delete <name>   Delete a group

  Sync commands:
    login [repo]          Connect to GitHub
    logout                Disconnect from GitHub
    push                  Push all notes to GitHub
    pull / update         Pull notes from GitHub
    status                Show notes and sync status
    self-update           Update this CLI script to the latest version

  Flags available on most commands:
    --json                Machine-readable JSON output
    --yes                 Skip confirmation prompts

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
    noteflow get "Project Alpha" --json
    noteflow group create backend --color cyan
`)
}

// ── Arg parser ────────────────────────────────────────────────────────────────

function parseFlags(args) {
  const flags = {}; const positional = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--json')     { flags.json = true }
    else if (a === '--yes') { flags.yes = true }
    else if (a === '--archived') { flags.archived = true }
    else if (a === '--raw') { flags.raw = true }
    else if (a === '--rich') { flags.raw = false }
    else if ((a === '--tag' || a === '--title' || a === '--section' || a === '--group' || a === '--color') && args[i + 1]) {
      flags[a.slice(2)] = args[++i]
    }
    else if (a.startsWith('--')) { /* unknown flag, ignore */ }
    else positional.push(a)
  }
  return { flags, positional }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { cmdHelp(args[1]); return }

  const { flags, positional } = parseFlags(args.slice(1))

  switch (cmd) {
    case 'add': {
      const text = positional.join(' ')
      if (!text) { err('Usage: noteflow add <text> [options]'); process.exit(1) }
      await cmdAdd(text, flags)
      break
    }
    case 'new': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow new <title>'); process.exit(1) }
      await cmdNew(title, flags)
      break
    }
    case 'list':    cmdList(flags); break
    case 'get': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow get <title>'); process.exit(1) }
      cmdGet(title, flags)
      break
    }
    case 'delete':
    case 'rm': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow delete <title>'); process.exit(1) }
      await cmdDelete(title, flags)
      break
    }
    case 'rename': {
      if (positional.length < 2) { err('Usage: noteflow rename <old-title> <new-title>'); process.exit(1) }
      const [old, ...rest] = positional
      await cmdRename(old, rest.join(' '))
      break
    }
    case 'sections': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow sections <title>'); process.exit(1) }
      cmdSections(title)
      break
    }
    case 'pin': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow pin <title>'); process.exit(1) }
      await cmdPin(title)
      break
    }
    case 'archive': {
      const title = positional.join(' ')
      if (!title) { err('Usage: noteflow archive <title>'); process.exit(1) }
      await cmdArchive(title)
      break
    }
    case 'groups':  cmdGroups(flags); break
    case 'group': {
      const sub = positional[0]
      const name = positional.slice(1).join(' ')
      if (sub === 'create') { if (!name) { err('Usage: noteflow group create <name>'); process.exit(1) }; cmdGroupCreate(name, flags) }
      else if (sub === 'delete' || sub === 'rm') { if (!name) { err('Usage: noteflow group delete <name>'); process.exit(1) }; await cmdGroupDelete(name, flags) }
      else { err('Usage: noteflow group create|delete <name>'); process.exit(1) }
      break
    }
    case 'login':   await cmdLogin(positional[0]); break
    case 'logout':  cmdLogout(); break
    case 'push':    await cmdPush(); break
    case 'pull':
    case 'update':        await cmdPull(); break
    case 'self-update':   await cmdSelfUpdate(); break
    case 'status':  cmdStatus(flags); break
    default:
      err(`Unknown command: ${cmd}`)
      cmdHelp()
      process.exit(1)
  }
}

main().catch(e => { err(e.message); process.exit(1) })
