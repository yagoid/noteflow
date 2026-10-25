#!/usr/bin/env node
// End-to-end test of the in-app updater (the titlebar "update" button) against REAL
// packaged builds, on Windows (NSIS) and Linux (AppImage / .deb). macOS is out of scope.
//
// One run = one scenario:
//   1. install/prepare an OLD build (--from),
//   2. launch it isolated (--user-data-dir + NOTEFLOW_NOTES_DIR in a fresh temp dir),
//   3. monkeypatch the OLD app's main process so GitHub is replaced by a FAKE release whose
//      assets are the files of --to (exact file names only — a wrong asset name in the old
//      binary must 404 and fail the test, never be masked),
//   4. click the update button and let the old binary's own code download + install,
//   5. verify the target build ended up installed and relaunched, then relaunch it again
//      isolated and check app.getVersion() and that no update is offered any more.
//
// COUPLING: the fake feed patches `require('https').get` (app:check-update) and
// `electron.net.fetch` (app:download-and-install) in electron/main.ts. If the updater
// switches HTTP client, update installFeed() below. Asset names: electron/updateAsset.ts.
//
// SIDE EFFECTS (read before running locally):
//   - win: kills every running NoteFlow.exe, installs over the REAL per-user install
//     (%LOCALAPPDATA%\Programs\noteflow) and the installer's --force-run relaunch starts
//     NoteFlow with your REAL profile for a few seconds (the harness kills it).
//   - linux-deb: needs NON-interactive sudo (`sudo -n true` must succeed; the app runs
//     detached from your tty, so a cached `sudo -v` is usually not enough). It installs the
//     `noteflow` package system-wide.
//   - linux-appimage: everything happens on a temp copy of the AppImage.
//
// Run `node scripts/update-e2e.cjs --help` for usage. Docs: .claude/context/release.md
// § "Test E2E del updater".
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const ROOT = path.join(__dirname, '..')
const REPO = 'yagoid/noteflow'
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_PREFIX = `https://github.com/${REPO}/releases/`
const DOWNLOAD_BASE = `${RELEASES_PREFIX}latest/download/`
const KINDS = ['win', 'linux-appimage', 'linux-deb']

// Versions whose updater is KNOWN to be broken for a kind. A failing run FROM one of these
// versions is reported as "KNOWN BROKEN (expected)" with exit 0, so CI stays green but
// honest. Nothing else is whitelisted. Remove an entry once that version is no longer the
// published one people update from.
const KNOWN_BROKEN = {
  '2.0.0': {
    'linux-appimage':
      'v2.0.0 picks the Linux asset by distro, not by "runs from an AppImage": on Debian-based ' +
      'systems it installs the .deb with pkexec (the AppImage stays old), elsewhere it builds ' +
      'NoteFlow-X-x86_64.AppImage, which is never published. See release.md "Puntos conocidos".',
  },
}

const EXIT = { PASS: 0, FAIL: 1, ERROR: 2 }

const HELP = `
NoteFlow updater end-to-end test (Windows NSIS / Linux AppImage / Linux .deb).

USAGE
  node scripts/update-e2e.cjs --from <src> --to <dir> [options]
  node scripts/update-e2e.cjs --package <version> [--kind <k>] [--package-dir <dir>] [--no-rebuild]

SCENARIO OPTIONS
  --kind win|linux-appimage|linux-deb
                     Default: win on Windows, linux-appimage on Linux.
  --from <src>       OLD build to update FROM:
                       <file>            a Setup.exe / .AppImage / .deb
                       <dir>             an electron-builder output dir (artifact picked
                                         by kind; version from latest*.yml or the name)
                       release:latest    the published latest release (GitHub API)
                       release:vX.Y.Z    a published release by tag
                     Release assets are downloaded unauthenticated; GITHUB_TOKEN is used
                     for the API call if set.
  --to <dir>         Dir with the TARGET artifacts (e.g. release/). Target version from
                     latest.yml / latest-linux.yml, fallback: the artifact file name. Every
                     top-level file of this dir is served by EXACT name as
                     ${DOWNLOAD_BASE}<name>;
                     any other name is a 404.
  --out <dir>        Screenshots, log and result.json (default: a new dir under the OS
                     temp dir).
  --keep-installed   Don't uninstall the target at the end (by default it is uninstalled
                     only if NoteFlow was NOT installed before the run).
  --appimage-mode auto|fuse|extract
                     How the AppImage runs. auto (default) = FUSE if /dev/fuse,
                     fusermount and libfuse.so.2 are present, else
                     APPIMAGE_EXTRACT_AND_RUN=1. The run fails early (exit 2) if the
                     launched app does not see AppImage semantics (APPIMAGE/APPDIR).
  --timeout-min <n>  Minutes to wait for the old app to exit after the click (default 5).
  --dry-run          Resolve and print the plan (artifacts, versions, served files)
                     without installing or launching anything.

PACKAGE MODE ("next version" helper)
  Re-packages the ALREADY BUILT app (dist/ + dist-electron/, run \`npm run build\` first)
  with another version, without rebuilding the code, so the candidate can be tested as the
  OLD side ("the version we ship can update itself later"):
    node scripts/update-e2e.cjs --package 2.1.0-e2e.next
  = npx electron-builder <targets> --x64 --publish never
      -c.extraMetadata.version=<version> -c.directories.output=<package-dir>
  --kind             win → --win nsis, linux-appimage → --linux AppImage,
                     linux-deb → --linux deb, linux → both (default: this platform;
                     on Linux both).
  --package-dir      Output dir (default release-e2e-next/, gitignored).
  --no-rebuild       Pass -c.npmRebuild=false (native deps already rebuilt for Electron).

EXIT CODES
  0  PASS, or KNOWN BROKEN (expected) — see the KNOWN_BROKEN table in this script
  1  FAIL — the updater did not take the old build to the target
  2  ERROR — the harness could not run the scenario (bad args, missing sudo, download
     failure, environment without AppImage semantics…)

EXAMPLES
  Windows, published latest → local candidate:
    node scripts/update-e2e.cjs --kind win --from release:latest --to release
  Windows, candidate → re-packaged next version:
    node scripts/update-e2e.cjs --package 2.1.0-e2e.next --no-rebuild
    node scripts/update-e2e.cjs --kind win --from release --to release-e2e-next
  Linux (needs an X server; use xvfb-run -a when headless):
    xvfb-run -a node scripts/update-e2e.cjs --kind linux-appimage --from release:latest --to release
    xvfb-run -a node scripts/update-e2e.cjs --kind linux-deb --from release --to release-e2e-next
`

// ── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = new Set(['--keep-installed', '--dry-run', '--help', '-h', '--no-rebuild'])
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i]
    let v
    const eq = a.indexOf('=')
    if (a.startsWith('--') && eq > 0) { v = a.slice(eq + 1); a = a.slice(0, eq) }
    if (flags.has(a)) { out[a.replace(/^-+/, '')] = true; continue }
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`)
    if (v === undefined) {
      v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`Missing value for ${a}`)
    }
    out[a.slice(2)] = v
  }
  return out
}

// ── Logging ──────────────────────────────────────────────────────────────────

let LOG_FILE = null
const logBuffer = []
function writeLog(line) {
  console.log(line)
  if (LOG_FILE) fs.appendFileSync(LOG_FILE, line + '\n')
  else logBuffer.push(line)
}
function setLogFile(file) {
  LOG_FILE = file
  if (logBuffer.length) fs.appendFileSync(file, logBuffer.join('\n') + '\n')
  logBuffer.length = 0
}
const log = (msg) => writeLog(`[update-e2e] ${msg}`)
const warn = (msg) => writeLog(`[update-e2e] WARN ${msg}`)
let stepNo = 0
const step = (msg) => writeLog(`\n[update-e2e] ── step ${++stepNo}: ${msg}`)

class HarnessError extends Error {}          // → exit 2 (could not run)
class TestFailure extends Error {}           // → exit 1 (updater broken)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, { timeoutMs, intervalMs = 1000, label }) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (last) return last
    await sleep(intervalMs)
  }
  if (label) log(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${label}`)
  return null
}

// ── Artifacts ────────────────────────────────────────────────────────────────

// MIRROR of the names electron/updateAsset.ts asks for (and electron-builder produces,
// see tests/electron/updateAsset.test.ts). Used only to find artifacts; what is served
// to the old app is always the real file name.
function assetName(kind, version) {
  if (kind === 'win') return `NoteFlow-${version}-Setup.exe`
  if (kind === 'linux-appimage') return `NoteFlow-${version}.AppImage`
  return `noteflow_${version}_amd64.deb`
}
const KIND_EXT = { win: '.exe', 'linux-appimage': '.appimage', 'linux-deb': '.deb' }
const NAME_RE = {
  win: /^NoteFlow-(.+)-Setup\.exe$/i,
  'linux-appimage': /^NoteFlow-(.+?)(?:-x86_64)?\.AppImage$/i,
  'linux-deb': /^noteflow_(.+)_amd64\.deb$/i,
}
const versionFromName = (kind, file) => (path.basename(file).match(NAME_RE[kind]) || [])[1] || null
// electron-builder writes the deb control Version with '-' → '~' (LinuxTargetHelper.getSanitizedVersion).
const debVersion = (v) => v.replace(/-/g, '~')

function ymlVersion(dir, kind) {
  const yml = path.join(dir, kind === 'win' ? 'latest.yml' : 'latest-linux.yml')
  if (!fs.existsSync(yml)) return null
  const m = fs.readFileSync(yml, 'utf8').match(/^version:\s*['"]?([^'"\s]+)/m)
  return m ? m[1] : null
}

function resolveDirArtifact(dir, kind) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new HarnessError(`Not a directory: ${dir}`)
  const ext = KIND_EXT[kind]
  const files = fs.readdirSync(dir).filter((f) => {
    const full = path.join(dir, f)
    return f.toLowerCase().endsWith(ext) && fs.statSync(full).isFile() && !/uninstall/i.test(f)
  })
  const yml = ymlVersion(dir, kind)
  if (yml) {
    const expected = assetName(kind, yml)
    if (files.includes(expected)) return { file: path.join(dir, expected), version: yml }
    warn(`${dir}: latest*.yml says v${yml} but there is no ${expected} — the updater would 404 on it`)
  }
  const matching = files.filter((f) => versionFromName(kind, f))
  if (matching.length === 1) {
    return { file: path.join(dir, matching[0]), version: yml || versionFromName(kind, matching[0]) }
  }
  if (matching.length === 0) throw new HarnessError(`No ${ext} artifact for ${kind} in ${dir}`)
  throw new HarnessError(`Several ${ext} artifacts in ${dir} and no matching latest*.yml: ${matching.join(', ')}`)
}

function githubHeaders() {
  const h = { 'User-Agent': 'noteflow-update-e2e', Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return h
}

async function fetchRelease(spec) {
  const ref = spec.slice('release:'.length)
  const url = ref === 'latest'
    ? API_LATEST
    : `https://api.github.com/repos/${REPO}/releases/tags/${ref.startsWith('v') ? ref : 'v' + ref}`
  log(`GitHub API: ${url}${process.env.GITHUB_TOKEN ? ' (authenticated)' : ''}`)
  const res = await fetch(url, { headers: githubHeaders() })
  if (!res.ok) throw new HarnessError(`GitHub API ${url} → HTTP ${res.status}`)
  return res.json()
}

async function downloadTo(url, dest) {
  // Public asset: no token (it would also travel to the redirect host).
  const res = await fetch(url, { headers: { 'User-Agent': 'noteflow-update-e2e' }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new HarnessError(`Download ${url} → HTTP ${res.status}`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest))
  return dest
}

async function resolveFrom(spec, kind, downloadDir, dryRun) {
  if (spec.startsWith('release:')) {
    const rel = await fetchRelease(spec)
    const version = String(rel.tag_name || '').replace(/^v/, '')
    if (!version) throw new HarnessError(`Release ${spec} has no tag_name`)
    const name = assetName(kind, version)
    const asset = (rel.assets || []).find((a) => a.name === name)
    if (!asset) {
      const names = (rel.assets || []).map((a) => a.name).join(', ')
      throw new HarnessError(`Release v${version} has no asset ${name}. Assets: ${names || '(none)'}`)
    }
    if (dryRun) return { file: asset.browser_download_url, version, downloaded: false }
    const dest = path.join(downloadDir, name)
    log(`downloading ${asset.browser_download_url} (${(asset.size / 1e6).toFixed(1)} MB)`)
    await downloadTo(asset.browser_download_url, dest)
    return { file: dest, version, downloaded: true }
  }
  const p = path.resolve(spec)
  if (!fs.existsSync(p)) throw new HarnessError(`--from not found: ${p}`)
  if (fs.statSync(p).isDirectory()) return resolveDirArtifact(p, kind)
  return { file: p, version: versionFromName(kind, p) }
}

function servedFiles(dir) {
  const files = {}
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isFile()) files[name] = { path: full, size: st.size }
  }
  return files
}

function sha256(file) {
  const h = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(1 << 20)
    let n
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n))
  } finally { fs.closeSync(fd) }
  return h.digest('hex')
}

// Version inside an installed app.asar (package.json). Exact, unlike the Windows
// FileVersion, which electron-builder strips to the numeric x.y.z.
function readAsarVersion(asarPath) {
  const fd = fs.openSync(asarPath, 'r')
  try {
    const head = Buffer.alloc(16)
    fs.readSync(fd, head, 0, 16, 0)
    const headerPickleSize = head.readUInt32LE(4)
    const jsonLen = head.readUInt32LE(12)
    const json = Buffer.alloc(jsonLen)
    fs.readSync(fd, json, 0, jsonLen, 16)
    const entry = JSON.parse(json.toString('utf8')).files['package.json']
    const data = Buffer.alloc(entry.size)
    fs.readSync(fd, data, 0, entry.size, 8 + headerPickleSize + Number(entry.offset))
    return JSON.parse(data.toString('utf8')).version
  } finally { fs.closeSync(fd) }
}

// ── Process helpers ──────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim(), error: r.error }
}

function which(cmd) {
  return run('sh', ['-c', `command -v ${cmd}`]).status === 0
}

function powershell(script, opts = {}) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], opts)
}

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** NoteFlow.exe processes running from `exe`: [{ pid, ppid }]. */
function winProcesses(exe) {
  const r = powershell(
    "@(Get-CimInstance Win32_Process -Filter \"Name='NoteFlow.exe'\" | " +
    `Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq ${psQuote(exe)}) } | ` +
    'ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; ppid = $_.ParentProcessId } }) | ConvertTo-Json -Compress'
  )
  if (!r.stdout) return []
  try {
    const v = JSON.parse(r.stdout)
    return Array.isArray(v) ? v : [v]
  } catch { return [] }
}

/** Main processes only (parent is not another NoteFlow.exe). */
function winRoots(procs) {
  const pids = new Set(procs.map((p) => p.pid))
  return procs.filter((p) => !pids.has(p.ppid))
}

function winKill(pids) {
  for (const pid of pids) run('taskkill', ['/F', '/T', '/PID', String(pid)])
}

function winInstallerRunning() {
  const r = powershell("@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'NoteFlow-*-Setup' }).Count")
  return Number(r.stdout) > 0
}

/** Linux pids whose cmdline or environment contains `marker` (our unique temp dir). */
function linuxPids(marker) {
  const out = []
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue
    try {
      if (fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').includes(marker)) { out.push(Number(d)); continue }
    } catch { continue /* process gone */ }
    try {
      if (fs.readFileSync(`/proc/${d}/environ`, 'utf8').includes(marker)) out.push(Number(d))
    } catch { /* gone, or not ours (environ is owner-only) */ }
  }
  return out
}

const SHELLS = new Set(['sh', 'dash', 'bash', 'busybox', 'sudo', 'pkexec'])

/** New (post-click) pids of this run that are the app itself, not a waiting shell/helper. */
function linuxRelaunchedApp(ctx) {
  return linuxPids(ctx.marker).filter((p) => {
    if (ctx.preClickPids.has(p)) return false
    try { return !SHELLS.has(path.basename(fs.readlinkSync(`/proc/${p}/exe`))) } catch { return false }
  })
}

/**
 * The relaunch counts only if an app process (not the relaunch helper shell) shows up
 * AND is still alive a few seconds later — a new AppImage that crashes on start fails.
 */
async function waitForLinuxRelaunch(ctx) {
  const seen = await waitFor(() => linuxRelaunchedApp(ctx).length > 0, { timeoutMs: 60000, label: 'relaunch' })
  if (!seen) return null
  await sleep(5000)
  const alive = linuxRelaunchedApp(ctx)
  return alive.length ? alive : null
}

async function linuxKill(marker) {
  const found = linuxPids(marker)
  if (!found.length) return 0
  for (const pid of found) { try { process.kill(pid, 'SIGTERM') } catch { /* gone */ } }
  await waitFor(() => linuxPids(marker).length === 0, { timeoutMs: 5000, intervalMs: 250 })
  for (const pid of linuxPids(marker)) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } }
  return found.length
}

// ── Fake release feed (runs INSIDE the app's main process) ──────────────────

async function installFeed(app, cfg) {
  // NOTE: this function is serialized by Playwright — it can't use anything from the
  // harness scope; everything comes through `c`.
  return app.evaluate((electron, c) => {
    if (!process.mainModule) throw new Error('process.mainModule is not available in this build')
    const req = process.mainModule.require
    const https = req('https')
    const fs = req('fs')
    const { Readable } = req('stream')
    const { EventEmitter } = req('events')
    const g = globalThis
    if (!g.__noteflowUpdateE2E) {
      g.__noteflowUpdateE2E = { log: [], origGet: https.get, origFetch: electron.net.fetch, patched: false }
    }
    const st = g.__noteflowUpdateE2E
    st.cfg = c
    const push = (e) => st.log.push(Object.assign({ t: Date.now() }, e))
    if (!st.patched) {
      st.patched = true
      https.get = function (input, ...rest) {
        const url = typeof input === 'string' ? input : (input && input.href) || String(input)
        if (url !== st.cfg.apiUrl) return st.origGet.call(this, input, ...rest)
        const cb = rest.find((a) => typeof a === 'function')
        push({ kind: 'api', url, status: 200, tag: st.cfg.latestTag })
        const fakeReq = new EventEmitter()
        fakeReq.setTimeout = () => fakeReq
        fakeReq.destroy = () => fakeReq
        fakeReq.end = () => fakeReq
        fakeReq.abort = () => {}
        process.nextTick(() => {
          const res = Readable.from([Buffer.from(JSON.stringify({ tag_name: st.cfg.latestTag }))])
          res.statusCode = 200
          res.headers = { 'content-type': 'application/json' }
          if (cb) cb(res)
          fakeReq.emit('response', res)
        })
        return fakeReq
      }
      electron.net.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input)
        // Every release URL is answered by the fake: a wrong URL must never reach the
        // real GitHub (which could serve a published asset and mask the bug).
        if (!url.toLowerCase().startsWith(st.cfg.releasesPrefix.toLowerCase())) {
          return st.origFetch.call(this, input, init)
        }
        const base = st.cfg.downloadBase.toLowerCase()
        let name = null
        if (url.toLowerCase().startsWith(base)) {
          try { name = decodeURIComponent(url.slice(base.length).split(/[?#]/)[0]) } catch { name = null }
        }
        const file = name !== null && Object.prototype.hasOwnProperty.call(st.cfg.files, name) ? st.cfg.files[name] : null
        if (!file) {
          push({ kind: 'download', url, name, status: 404 })
          return Promise.resolve(new Response('Not Found (update-e2e fake release)', { status: 404 }))
        }
        push({ kind: 'download', url, name, status: 200, size: file.size })
        return Promise.resolve(new Response(Readable.toWeb(fs.createReadStream(file.path)), {
          status: 200,
          headers: { 'content-length': String(file.size), 'content-type': 'application/octet-stream' },
        }))
      }
      // Fallback branches (download failed → open the URL in the browser; unknown
      // package → open the file) must not open anything on the test machine: log them
      // instead — any of them is a failure signal for the harness.
      for (const fn of ['openExternal', 'openPath']) {
        try {
          electron.shell[fn] = async (arg) => { push({ kind: `shell.${fn}`, arg: String(arg) }); return fn === 'openPath' ? '' : undefined }
        } catch (e) {
          push({ kind: 'warn', msg: `could not patch shell.${fn}: ${e}` })
        }
      }
    }
    return {
      httpsGet: https.get !== st.origGet,
      netFetch: electron.net.fetch !== st.origFetch,
      version: electron.app.getVersion(),
      env: { APPIMAGE: process.env.APPIMAGE || null, APPDIR: process.env.APPDIR || null, execPath: process.execPath },
    }
  }, cfg)
}

async function readFeedLog(app) {
  // Bounded: once the app starts quitting, an evaluate may never settle.
  return Promise.race([
    app.evaluate(() => (globalThis.__noteflowUpdateE2E ? globalThis.__noteflowUpdateE2E.log : [])),
    sleep(3000).then(() => { throw new Error('feed log read timed out') }),
  ])
}

function feedConfig(latestVersion, files) {
  return { apiUrl: API_LATEST, releasesPrefix: RELEASES_PREFIX, downloadBase: DOWNLOAD_BASE, latestTag: `v${latestVersion}`, files }
}

const describeLog = (entries) => entries.length
  ? entries.map((e) => `    ${e.kind}${e.status ? ` ${e.status}` : ''} ${e.url || e.arg || e.msg || ''}${e.tag ? ` → ${e.tag}` : ''}`).join('\n')
  : '    (nothing intercepted)'

// Same rule as isRunningFromOwnAppImage() in electron/updateAsset.ts.
function ownAppImage({ APPIMAGE, APPDIR, execPath }) {
  if (!APPIMAGE || !APPDIR || !execPath) return false
  const dir = path.posix.normalize(APPDIR).replace(/\/+$/, '')
  return dir.startsWith('/') && path.posix.normalize(execPath).startsWith(`${dir}/`)
}

// ── Scenario ─────────────────────────────────────────────────────────────────

const updateButton = (page, version) => page.locator(`button[title$=" v${version}"]`)

async function findUpdateButton(app, version, timeoutMs) {
  return waitFor(async () => {
    for (const page of app.windows()) {
      try {
        if (await updateButton(page, version).count()) return page
      } catch { /* window closing */ }
    }
    return null
  }, { timeoutMs, intervalMs: 500 })
}

async function reloadWindows(app) {
  for (const page of app.windows()) {
    try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }) } catch (e) { warn(`reload failed: ${e.message}`) }
  }
}

async function screenshots(page, outDir, prefix) {
  try {
    const width = await page.evaluate(() => window.innerWidth)
    await page.screenshot({ path: path.join(outDir, `${prefix}-titlebar.png`), clip: { x: 0, y: 0, width, height: 48 } })
    await page.screenshot({ path: path.join(outDir, `${prefix}-window.png`) })
    log(`screenshots: ${prefix}-titlebar.png, ${prefix}-window.png`)
  } catch (e) {
    warn(`screenshot failed: ${e.message}`)
  }
}

async function closeApp(app) {
  if (!app) return
  let proc
  // Playwright disposes the app once it has closed: process() then throws.
  try { proc = app.process() } catch { return }
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return
  try {
    await Promise.race([app.close(), sleep(15000).then(() => { throw new Error('close timeout') })])
  } catch {
    try { proc.kill('SIGKILL') } catch { /* gone */ }
  }
}

function pickAppImageMode(requested) {
  if (requested === 'fuse' || requested === 'extract') return requested
  const fuse = fs.existsSync('/dev/fuse') && (which('fusermount') || which('fusermount3')) &&
    run('sh', ['-c', 'ldconfig -p 2>/dev/null | grep -q "libfuse.so.2"']).status === 0
  return fuse ? 'fuse' : 'extract'
}

async function runScenario(opts) {
  const kind = opts.kind
  const isWin = kind === 'win'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.resolve(opts.out || path.join(os.tmpdir(), `noteflow-update-e2e-${kind}-${stamp}`))
  fs.mkdirSync(outDir, { recursive: true })
  setLogFile(path.join(outDir, 'update-e2e.log'))

  // A unique work dir: profile, notes, downloads, AppImage copy, pkexec shim. Its path
  // also marks (in argv) every Linux process this run starts, for cleanup.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-update-e2e-'))
  const profileDir = path.join(workDir, 'profile')
  const notesDir = path.join(workDir, 'notes')
  for (const d of [profileDir, notesDir]) fs.mkdirSync(d, { recursive: true })

  const result = { outcome: null, kind, from: opts.from, to: opts.to, oldVersion: null, targetVersion: null, feedLog: [], reason: null }
  // Linux: every process of this run carries the unique work dir in its argv or its
  // environment (NOTEFLOW_NOTES_DIR, APPIMAGE). The environment matters: the AppImage
  // updater relaunches via a detached /bin/sh that execs the AppImage path (under the
  // work dir) with no other args, dropping APPIMAGE/APPDIR but keeping NOTEFLOW_NOTES_DIR
  // (main.ts relaunchAppImageAfterExit; older builds used app.relaunch({ execPath })).
  const ctx = {
    apps: [], workDir, preexisting: null, installed: false, exe: null,
    marker: workDir, preClickPids: new Set(),
  }
  let exitCode = EXIT.ERROR

  const cleanupProcesses = async () => {
    for (const a of ctx.apps) await closeApp(a)
    if (isWin) {
      if (ctx.exe) {
        const roots = winRoots(winProcesses(ctx.exe)).filter((p) => ctx.startedPids.has(p.pid) || ctx.afterClick)
        if (roots.length) { log(`killing ${roots.length} NoteFlow process(es) started by this run`); winKill(roots.map((p) => p.pid)) }
      }
    } else {
      const n = await linuxKill(ctx.marker)
      if (n) log(`killed ${n} leftover process(es)`)
    }
  }
  ctx.startedPids = new Set()
  const onSignal = async () => { warn('interrupted — cleaning up'); await cleanupProcesses(); process.exit(130) }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  log(`kind=${kind}  from=${opts.from}  to=${opts.to}`)
  log(`out=${outDir}`)
  log(`work=${workDir}`)

  try {
    if (!isWin && process.platform !== 'linux') throw new HarnessError(`${kind} needs Linux`)
    if (isWin && process.platform !== 'win32') throw new HarnessError('win needs Windows')

    // ── Resolve target + old ────────────────────────────────────────────────
    step('resolve target and old artifacts')
    const toDir = path.resolve(opts.to)
    const target = resolveDirArtifact(toDir, kind)
    result.targetVersion = target.version
    const files = servedFiles(toDir)
    log(`target v${target.version}: ${target.file}`)
    log(`fake release serves ${Object.keys(files).length} file(s) from ${toDir}`)
    const from = await resolveFrom(opts.from, kind, path.join(workDir, 'download'), false)
    log(`old artifact: ${from.file}${from.version ? ` (v${from.version} by name)` : ''}`)
    if (from.version && from.version === target.version) {
      throw new HarnessError(`old and target are both v${target.version}: the updater only offers a DIFFERENT version`)
    }
    const targetSha = kind === 'linux-appimage' ? sha256(target.file) : null

    // ── Prepare old ─────────────────────────────────────────────────────────
    step(`prepare the old build (${kind})`)
    const env = { ...process.env, NOTEFLOW_NOTES_DIR: notesDir }
    // Not for the app: ELECTRON_RUN_AS_NODE would turn it into plain Node, and CI tokens
    // have no business in the app under test.
    for (const k of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'GITHUB_TOKEN', 'GH_TOKEN']) delete env[k]
    for (const k of ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD', 'APPIMAGE_EXTRACT_AND_RUN']) delete env[k]
    const shimDir = path.join(workDir, 'bin')
    const pkexecLog = path.join(outDir, 'pkexec.log')

    if (isWin) {
      const installDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'noteflow')
      ctx.exe = path.join(installDir, 'NoteFlow.exe')
      ctx.asar = path.join(installDir, 'resources', 'app.asar')
      if (fs.existsSync(ctx.asar)) {
        try { ctx.preexisting = readAsarVersion(ctx.asar) } catch { ctx.preexisting = 'unknown' }
        warn(`NoteFlow v${ctx.preexisting} is installed for this user: it will be REPLACED (per-user install at ${installDir})`)
      }
      warn('closing every running NoteFlow.exe (taskkill /F /IM NoteFlow.exe)')
      run('taskkill', ['/F', '/T', '/IM', 'NoteFlow.exe'])
      await sleep(1500)
      log(`installing ${path.basename(from.file)} /S …`)
      const r = run(from.file, ['/S'], { timeout: 5 * 60 * 1000, stdio: 'ignore' })
      if (r.error || r.status !== 0) throw new HarnessError(`silent install failed (status ${r.status}${r.error ? `, ${r.error.message}` : ''})`)
      ctx.installed = true
      if (!fs.existsSync(ctx.exe)) throw new HarnessError(`installed exe not found: ${ctx.exe}`)
      const v = readAsarVersion(ctx.asar)
      log(`installed: ${ctx.exe} (app.asar v${v})`)
      if (from.version && v !== from.version) throw new HarnessError(`expected v${from.version} installed, app.asar says v${v}`)
    } else if (kind === 'linux-appimage') {
      const dir = path.join(workDir, 'appimage')
      fs.mkdirSync(dir, { recursive: true })
      ctx.exe = path.join(dir, path.basename(from.file))
      fs.copyFileSync(from.file, ctx.exe)
      fs.chmodSync(ctx.exe, 0o755)
      const mode = pickAppImageMode(opts['appimage-mode'] || 'auto')
      if (mode === 'extract') env.APPIMAGE_EXTRACT_AND_RUN = '1'
      log(`AppImage copy: ${ctx.exe} (mode: ${mode}${mode === 'extract' ? ', APPIMAGE_EXTRACT_AND_RUN=1' : ''})`)
      // A pkexec that never elevates: an AppImage must update itself in place; if the old
      // binary tries `pkexec dpkg -i` instead (v2.0.0 on Debian), log it and refuse.
      fs.mkdirSync(shimDir, { recursive: true })
      fs.writeFileSync(path.join(shimDir, 'pkexec'),
        `#!/bin/sh\necho "pkexec $*" >> '${pkexecLog}'\necho "update-e2e: pkexec blocked in the AppImage scenario" >&2\nexit 1\n`, { mode: 0o755 })
      env.PATH = `${shimDir}:${env.PATH}`
    } else {
      if (!fs.existsSync('/etc/debian_version')) throw new HarnessError('linux-deb needs a Debian-based system (/etc/debian_version)')
      if (run('sudo', ['-n', 'true']).status !== 0) {
        throw new HarnessError('linux-deb needs non-interactive sudo (`sudo -n true` failed). Use a NOPASSWD sudoers rule for this user (CI runners have it).')
      }
      const q = run('dpkg-query', ['-W', '-f=${Status} ${Version}', 'noteflow'])
      if (q.status === 0 && q.stdout.startsWith('install ok installed')) {
        ctx.preexisting = q.stdout.split(' ').pop()
        warn(`package noteflow ${ctx.preexisting} is installed: it will be REPLACED`)
      }
      log(`installing ${from.file} with apt-get …`)
      let r = run('sudo', ['-n', 'apt-get', 'install', '-y', '--allow-downgrades', path.resolve(from.file)], { stdio: 'inherit' })
      if (r.status !== 0) {
        warn('apt-get install failed, trying dpkg -i + apt-get -f install')
        run('sudo', ['-n', 'dpkg', '-i', path.resolve(from.file)], { stdio: 'inherit' })
        r = run('sudo', ['-n', 'apt-get', 'install', '-f', '-y'], { stdio: 'inherit' })
        if (r.status !== 0) throw new HarnessError('could not install the old .deb')
      }
      ctx.installed = true
      ctx.exe = '/opt/NoteFlow/noteflow'
      if (!fs.existsSync(ctx.exe)) throw new HarnessError(`installed exe not found: ${ctx.exe}`)
      const v = run('dpkg-query', ['-W', '-f=${Version}', 'noteflow']).stdout
      log(`installed package noteflow ${v}`)
      if (from.version && v !== debVersion(from.version)) throw new HarnessError(`expected noteflow ${debVersion(from.version)}, dpkg says ${v}`)
      // The real code path runs `pkexec dpkg -i <deb>`: route it to sudo -n so it works
      // headless. Only the launched app's PATH sees this shim.
      fs.mkdirSync(shimDir, { recursive: true })
      fs.writeFileSync(path.join(shimDir, 'pkexec'),
        `#!/bin/sh\necho "pkexec $*" >> '${pkexecLog}'\nsudo -n "$@" >> '${pkexecLog}' 2>&1\nrc=$?\necho "exit $rc" >> '${pkexecLog}'\nexit $rc\n`, { mode: 0o755 })
      env.PATH = `${shimDir}:${env.PATH}`
    }

    // ── Launch old ──────────────────────────────────────────────────────────
    step('launch the old build (isolated profile + notes dir)')
    const { _electron } = require('playwright')
    const launch = async () => {
      const app = await _electron.launch({
        executablePath: ctx.exe,
        args: [`--user-data-dir=${profileDir}`],
        env,
        timeout: 180000,
      })
      ctx.apps.push(app)
      await app.firstWindow({ timeout: 180000 })
      if (isWin) for (const p of winProcesses(ctx.exe)) ctx.startedPids.add(p.pid)
      return app
    }
    const oldApp = await launch()
    const patched = await installFeed(oldApp, feedConfig(target.version, files))
    result.oldVersion = patched.version
    log(`old app running: v${patched.version} (https.get patched: ${patched.httpsGet}, net.fetch patched: ${patched.netFetch})`)
    if (!patched.httpsGet || !patched.netFetch) throw new HarnessError('could not patch the old app\'s HTTP client')
    if (patched.version === target.version) throw new HarnessError(`old app already reports v${target.version}`)
    if (kind === 'linux-appimage') {
      log(`AppImage env: APPIMAGE=${patched.env.APPIMAGE} APPDIR=${patched.env.APPDIR} execPath=${patched.env.execPath}`)
      if (patched.env.APPIMAGE && patched.env.APPIMAGE !== ctx.exe) warn(`APPIMAGE is not our copy (${ctx.exe})`)
      if (!ownAppImage(patched.env)) {
        throw new HarnessError('the launched app does not see AppImage semantics (APPIMAGE/APPDIR/execPath) — try --appimage-mode fuse (install libfuse2)')
      }
    }

    // ── Update button ───────────────────────────────────────────────────────
    step(`fake release v${target.version}: reload and look for the update button`)
    await reloadWindows(oldApp)
    const page = await findUpdateButton(oldApp, target.version, 30000)
    result.feedLog = await readFeedLog(oldApp).catch(() => result.feedLog)
    if (!page) {
      if (oldApp.windows()[0]) await screenshots(oldApp.windows()[0], outDir, 'old-no-button')
      throw new TestFailure(`no update button with title ending in " v${target.version}" after reload. Intercepted:\n${describeLog(result.feedLog)}`)
    }
    const btn = updateButton(page, target.version).first()
    log(`update button: title="${await btn.getAttribute('title')}"`)
    await screenshots(page, outDir, 'old-update-button')

    // ── Click ───────────────────────────────────────────────────────────────
    step('click the update button and wait for the old app to exit')
    const proc = oldApp.process()
    const exited = new Promise((resolve) => {
      if (proc.exitCode !== null || proc.signalCode !== null) resolve()
      else proc.once('exit', () => resolve())
    })
    let hasExited = false
    exited.then(() => { hasExited = true })
    ctx.afterClick = true
    if (!isWin) ctx.preClickPids = new Set(linuxPids(ctx.marker))
    const clickedAt = Date.now()
    try {
      await btn.click({ timeout: 15000 })
    } catch (e) {
      if (!hasExited && !result.feedLog.some((x) => x.kind === 'download')) {
        warn(`normal click failed (${e.message.split('\n')[0]}), dispatching a DOM click`)
        try { await btn.dispatchEvent('click') } catch { /* app may be quitting */ }
      }
    }
    const timeoutMs = Number(opts['timeout-min'] || 5) * 60 * 1000
    let failSignal = null
    while (!hasExited && Date.now() - clickedAt < timeoutMs) {
      try { result.feedLog = await readFeedLog(oldApp) } catch { /* quitting */ }
      const bad = result.feedLog.find((x) => (x.kind === 'download' && x.status === 404) || x.kind.startsWith('shell.'))
      const pk = kind === 'linux-appimage' && fs.existsSync(pkexecLog) ? fs.readFileSync(pkexecLog, 'utf8').trim() : ''
      if (bad || pk) { failSignal = bad ? `${bad.kind} ${bad.status || ''} ${bad.url || bad.arg}` : `the old app ran: ${pk}`; break }
      await Promise.race([exited, sleep(1000)])
    }
    if (failSignal || !hasExited) {
      const pk = fs.existsSync(pkexecLog) ? `\n  pkexec log:\n${fs.readFileSync(pkexecLog, 'utf8').replace(/^/gm, '    ')}` : ''
      const p = oldApp.windows()[0]
      if (p) await screenshots(p, outDir, 'old-after-click')
      throw new TestFailure(`${failSignal ? `failure signal: ${failSignal}` : `the old app did not exit within ${timeoutMs / 60000} min`}\n  intercepted:\n${describeLog(result.feedLog)}${pk}`)
    }
    log(`old app exited ${Math.round((Date.now() - clickedAt) / 1000)}s after the click. Intercepted:\n${describeLog(result.feedLog)}`)
    const dl = result.feedLog.filter((x) => x.kind === 'download')
    if (!dl.some((x) => x.status === 200)) throw new TestFailure('the old app exited without downloading an asset from the fake release')

    // ── Verify install ──────────────────────────────────────────────────────
    step('verify the target is installed and was relaunched')
    if (isWin) {
      const done = await waitFor(() => {
        let v = null
        try { v = readAsarVersion(ctx.asar) } catch { /* being replaced */ }
        if (v !== target.version) return null
        const roots = winRoots(winProcesses(ctx.exe)).filter((p) => !ctx.startedPids.has(p.pid))
        return roots.length ? roots : null
      }, { timeoutMs: 3 * 60 * 1000, intervalMs: 2000, label: 'install + --force-run relaunch' })
      let v = null
      try { v = readAsarVersion(ctx.asar) } catch { /* missing */ }
      const fv = powershell(`(Get-Item ${psQuote(ctx.exe)}).VersionInfo | ForEach-Object { $_.ProductVersion + ' / ' + $_.FileVersion }`).stdout
      log(`installed app.asar v${v}; exe ProductVersion/FileVersion ${fv}`)
      if (v !== target.version) throw new TestFailure(`installed version is v${v}, expected v${target.version}`)
      if (!done) throw new TestFailure('v' + target.version + ' installed but the installer did not relaunch NoteFlow (--force-run)')
      log(`relaunched by the installer: pid ${done.map((p) => p.pid).join(', ')}`)
      await waitFor(() => !winInstallerRunning(), { timeoutMs: 60000, intervalMs: 1000, label: 'installer exit' })
      await sleep(2000)
      // NB: this relaunch uses the REAL profile (no --user-data-dir): kill it right away.
      winKill(done.map((p) => p.pid))
      log('killed the relaunched instance')
    } else if (kind === 'linux-appimage') {
      const ok = await waitFor(() => {
        try { return fs.statSync(ctx.exe).size === fs.statSync(target.file).size && sha256(ctx.exe) === targetSha } catch { return false }
      }, { timeoutMs: 3 * 60 * 1000, intervalMs: 2000, label: 'AppImage replaced in place' })
      if (!ok) throw new TestFailure(`${ctx.exe} was not replaced by the target AppImage (sha256 differs)`)
      log(`${path.basename(ctx.exe)} now has the target's sha256 ${targetSha.slice(0, 16)}…`)
      const relaunched = await waitForLinuxRelaunch(ctx)
      if (!relaunched) throw new TestFailure('AppImage replaced but NoteFlow was not relaunched (or did not stay up)')
      log(`relaunched (pid ${relaunched.join(', ')}); killed ${await linuxKill(ctx.marker)} process(es)`)
    } else {
      const want = debVersion(target.version)
      const ok = await waitFor(() => run('dpkg-query', ['-W', '-f=${Version}', 'noteflow']).stdout === want,
        { timeoutMs: 3 * 60 * 1000, intervalMs: 2000, label: `dpkg noteflow ${want}` })
      if (!ok) throw new TestFailure(`dpkg says noteflow ${run('dpkg-query', ['-W', '-f=${Version}', 'noteflow']).stdout}, expected ${want}`)
      log(`dpkg: noteflow ${want} installed`)
      const relaunched = await waitForLinuxRelaunch(ctx)
      if (!relaunched) throw new TestFailure('package upgraded but NoteFlow was not relaunched (app.relaunch) or did not stay up')
      log(`relaunched (pid ${relaunched.join(', ')}); killed ${await linuxKill(ctx.marker)} process(es)`)
    }

    // ── Relaunch target ─────────────────────────────────────────────────────
    step('launch the installed target (same isolated profile) and check it is up to date')
    ctx.startedPids = new Set()
    ctx.afterClick = false
    let newApp, p2
    try {
      newApp = await launch()
      p2 = await installFeed(newApp, feedConfig(target.version, files))
    } catch (e) {
      throw new TestFailure(`the installed target does not start: ${e.message.split('\n')[0]}`)
    }
    log(`installed app reports v${p2.version}`)
    if (p2.version !== target.version) throw new TestFailure(`app.getVersion() is v${p2.version}, expected v${target.version}`)
    await reloadWindows(newApp)
    const apiHit = await waitFor(async () => (await readFeedLog(newApp).catch(() => [])).some((x) => x.kind === 'api'), { timeoutMs: 20000, intervalMs: 500 })
    if (!apiHit) warn('the new app did not query releases/latest after reload')
    await sleep(2000)
    let shown = 0
    for (const pg of newApp.windows()) { try { shown += await updateButton(pg, target.version).count() } catch { /* closing */ } }
    if (newApp.windows()[0]) await screenshots(newApp.windows()[0], outDir, 'new-up-to-date')
    if (shown) throw new TestFailure(`the installed v${target.version} still offers an update to v${target.version}`)
    log('no update offered — up to date')
    await closeApp(newApp)

    result.outcome = 'pass'
    exitCode = EXIT.PASS
  } catch (err) {
    result.reason = err.message
    if (err instanceof TestFailure) {
      const reasonKB = result.oldVersion && KNOWN_BROKEN[result.oldVersion] && KNOWN_BROKEN[result.oldVersion][kind]
      if (reasonKB) {
        result.outcome = 'known-broken'
        exitCode = EXIT.PASS
      } else {
        result.outcome = 'fail'
        exitCode = EXIT.FAIL
      }
    } else {
      result.outcome = 'error'
      exitCode = EXIT.ERROR
      if (!(err instanceof HarnessError)) result.reason = err.stack || err.message
    }
  } finally {
    await cleanupProcesses()
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    await uninstallIfNeeded(kind, ctx, opts)
    if (result.outcome === 'pass' || result.outcome === 'known-broken') {
      try { fs.rmSync(workDir, { recursive: true, force: true }) } catch { /* locked */ }
    } else {
      log(`work dir kept for debugging: ${workDir}`)
    }
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2))
  }

  const kbReason = result.oldVersion && KNOWN_BROKEN[result.oldVersion] && KNOWN_BROKEN[result.oldVersion][kind]
  writeLog('')
  if (result.outcome === 'pass') {
    log(`PASS  ${kind}: v${result.oldVersion} → v${result.targetVersion}`)
    if (kbReason) warn(`v${result.oldVersion}/${kind} is listed in KNOWN_BROKEN but PASSED — remove the entry`)
  } else if (result.outcome === 'known-broken') {
    log(`KNOWN BROKEN (expected)  ${kind}: v${result.oldVersion} → v${result.targetVersion}`)
    log(`  why it is expected: ${kbReason}`)
    log(`  what happened: ${result.reason}`)
  } else if (result.outcome === 'fail') {
    log(`FAIL  ${kind}: v${result.oldVersion || '?'} → v${result.targetVersion || '?'}\n  ${result.reason}`)
  } else {
    log(`ERROR (harness/environment, not a verdict on the updater)\n  ${result.reason}`)
  }
  log(`result: ${path.join(outDir, 'result.json')}`)
  return exitCode
}

async function uninstallIfNeeded(kind, ctx, opts) {
  if (!ctx.installed) return
  if (opts['keep-installed']) { log('--keep-installed: leaving the installed build in place'); return }
  if (ctx.preexisting) {
    warn(`NoteFlow ${ctx.preexisting} was installed before this run and has been replaced; reinstall it if needed`)
    return
  }
  if (kind === 'win') {
    const un = path.join(path.dirname(ctx.exe), 'Uninstall NoteFlow.exe')
    if (fs.existsSync(un)) {
      log('uninstalling (NoteFlow was not installed before this run)')
      run(un, ['/S'], { timeout: 3 * 60 * 1000, stdio: 'ignore' })
    }
  } else if (kind === 'linux-deb') {
    log('removing package noteflow (it was not installed before this run)')
    run('sudo', ['-n', 'dpkg', '-r', 'noteflow'], { stdio: 'inherit' })
  }
}

// ── Package mode ─────────────────────────────────────────────────────────────

function packageMode(opts) {
  const version = opts.package
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new HarnessError(`Not a semver version: ${version}`)
  for (const f of ['dist/index.html', 'dist-electron/main.js']) {
    if (!fs.existsSync(path.join(ROOT, f))) throw new HarnessError(`${f} missing — run \`npm run build\` first`)
  }
  const kind = opts.kind || (process.platform === 'win32' ? 'win' : 'linux')
  const targets = {
    win: ['--win', 'nsis'],
    'linux-appimage': ['--linux', 'AppImage'],
    'linux-deb': ['--linux', 'deb'],
    linux: ['--linux', 'deb', 'AppImage'],
  }[kind]
  if (!targets) throw new HarnessError(`--kind for --package must be win, linux-appimage, linux-deb or linux`)
  const outDir = opts['package-dir'] || 'release-e2e-next'
  const args = [
    require.resolve('electron-builder/cli.js'), ...targets, '--x64', '--publish', 'never',
    `-c.extraMetadata.version=${version}`, `-c.directories.output=${outDir}`,
  ]
  if (opts['no-rebuild']) args.push('-c.npmRebuild=false')
  log(`electron-builder ${args.slice(1).join(' ')}`)
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  })
  if (r.status !== 0) throw new HarnessError(`electron-builder failed (status ${r.status})`)
  log(`packaged v${version} into ${path.resolve(ROOT, outDir)}`)
  return EXIT.PASS
}

// ── Dry run ──────────────────────────────────────────────────────────────────

async function dryRun(opts) {
  const kind = opts.kind
  log(`DRY RUN kind=${kind}`)
  const toDir = path.resolve(opts.to)
  const target = resolveDirArtifact(toDir, kind)
  log(`target: v${target.version}  ${target.file}`)
  log(`served files: ${Object.keys(servedFiles(toDir)).join(', ')}`)
  log(`the old app must request: ${DOWNLOAD_BASE}${assetName(kind, target.version)}  (current updater naming)`)
  const from = await resolveFrom(opts.from, kind, null, true)
  log(`old: ${from.version ? `v${from.version}` : '(version from the running app)'}  ${from.file}`)
  if (from.version && from.version === target.version) warn(`old and target are both v${target.version}: a real run would stop here (exit 2)`)
  const kb = from.version && KNOWN_BROKEN[from.version] && KNOWN_BROKEN[from.version][kind]
  if (kb) log(`KNOWN BROKEN for v${from.version}/${kind}: ${kb}`)
  if (kind === 'linux-appimage' && process.platform === 'linux') log(`AppImage mode: ${pickAppImageMode(opts['appimage-mode'] || 'auto')}`)
  log('nothing installed or launched')
  return EXIT.PASS
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) } catch (e) { console.error(e.message); console.error(HELP); return EXIT.ERROR }
  if (opts.help || opts.h) { console.log(HELP); return EXIT.PASS }
  try {
    if (opts.package) return packageMode(opts)
    opts.kind = opts.kind || (process.platform === 'win32' ? 'win' : 'linux-appimage')
    if (!KINDS.includes(opts.kind)) throw new HarnessError(`--kind must be one of ${KINDS.join(', ')}`)
    if (!opts.from || !opts.to) throw new HarnessError('--from and --to are required (see --help)')
    if (opts['appimage-mode'] && !['auto', 'fuse', 'extract'].includes(opts['appimage-mode'])) {
      throw new HarnessError('--appimage-mode must be auto, fuse or extract')
    }
    if (opts['dry-run']) return await dryRun(opts)
    return await runScenario(opts)
  } catch (e) {
    console.error(`[update-e2e] ERROR ${e instanceof HarnessError ? e.message : e.stack || e}`)
    return EXIT.ERROR
  }
}

// exitCode instead of process.exit(): exiting while fetch() sockets are still closing
// trips a libuv assertion on Windows (Node 24). The unref'd timer only fires if some
// handle keeps the process alive.
main().then((code) => {
  process.exitCode = code
  setTimeout(() => process.exit(code), 10000).unref()
})
