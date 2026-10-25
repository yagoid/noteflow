// In-app updater: which release asset to download, and which URLs may be downloaded.
//
// Pure logic, no Electron/fs imports (same pattern as tempNoteExpiry.ts) so it can be
// unit-tested. main.ts probes the environment (process.platform, process.env.APPIMAGE,
// /etc/debian_version) and feeds the result to pickUpdateTarget(); the
// app:download-and-install handler gates every URL through isAllowedUpdateAssetPath() and
// builds the AppImage relaunch helper with appImageRelaunchSpawnArgs()/sanitizeAppImageEnv().
//
// The asset names MUST match what release.yml publishes (electron-builder config in
// package.json → build): `NoteFlow-X.Y.Z-Setup.exe`, `NoteFlow-X.Y.Z-arm64.dmg`,
// `noteflow_X.Y.Z_amd64.deb` and `NoteFlow-X.Y.Z.AppImage` (no `-x86_64`). A wrong name
// is a 404 for every user of that platform, and the bug ships inside the OLD version,
// so it can only be fixed one release later.
//
// Linux policy:
//   1. Running from OUR AppImage (isRunningFromOwnAppImage) → the AppImage, replaced in
//      place. APPIMAGE alone is not enough: the AppImage runtime exports it to every
//      child process, so a .deb NoteFlow launched from another AppImage (a terminal, a
//      launcher) inherits it and would rename NoteFlow over that other app's file.
//   2. Debian-based (/etc/debian_version) → the .deb, installed with `pkexec dpkg -i`.
//      /usr/bin/dpkg is NOT a Debian signal: Arch users can have dpkg from the AUR, and
//      dpkg -i on Arch would bypass pacman.
//   3. Anything else (Arch, Fedora, source builds…) → no installable asset exists (no
//      pacman/rpm package is published), so we return the releases page. It fails the
//      allow-check on purpose: the renderer's downloadAndInstall() gets
//      { success: false } and falls back to opening the URL in the browser.

import path from 'path'

const REPO_PATH = '/yagoid/noteflow/releases/'
const DOWNLOAD_BASE = 'https://github.com/yagoid/noteflow/releases/latest/download'

/** Fallback when there is no asset we can install for this system. */
export const RELEASES_PAGE_URL = 'https://github.com/yagoid/noteflow/releases/latest'

export type UpdateAssetKind = 'exe' | 'dmg' | 'deb' | 'appimage'

export interface UpdateTargetInput {
  platform: string
  /** Latest version WITHOUT the leading `v` (tag_name of /releases/latest). */
  version: string | undefined
  /** The app runs from its own AppImage (see isRunningFromOwnAppImage). */
  isAppImage: boolean
  /** /etc/debian_version exists. */
  isDebian: boolean
}

export interface AppImageEnv {
  /** process.env.APPIMAGE — path of the .AppImage file (inherited by children!). */
  appImage: string | undefined
  /** process.env.APPDIR — where the runtime mounted that AppImage. */
  appDir: string | undefined
  /** process.execPath of THIS process. */
  execPath: string
}

/**
 * True only when this process is the binary inside the mounted AppImage: APPIMAGE and
 * APPDIR are set AND execPath lives under APPDIR. Compared by path segments, so
 * `/tmp/.mount_ab` does not contain `/tmp/.mount_abc/noteflow`.
 */
export function isRunningFromOwnAppImage({ appImage, appDir, execPath }: AppImageEnv): boolean {
  if (!appImage || !execPath) return false
  const dir = mountDir(appDir)
  if (!dir) return false
  const exe = path.posix.normalize(execPath)
  return exe.startsWith(`${dir}/`)
}

/**
 * APPDIR normalized without trailing slashes, or null when unusable. Must be an absolute
 * mount point; '/' normalizes to '' here and is rejected too (the filesystem root would
 * contain everything).
 */
function mountDir(appDir: string | undefined): string | null {
  if (!appDir) return null
  const dir = path.posix.normalize(appDir).replace(/\/+$/, '')
  return dir.startsWith('/') ? dir : null
}

/** `p` is `dir` itself or lies under it (by path segments). `dir` comes from mountDir(). */
function isAtOrUnder(p: string, dir: string): boolean {
  const n = path.posix.normalize(p).replace(/\/+$/, '')
  return n === dir || n.startsWith(`${dir}/`)
}

// ── AppImage relaunch after the in-place update ──────────────────────────────────────
//
// NOT app.relaunch({ execPath }): on Linux Electron relaunches through a helper that is
// /proc/self/exe — the binary inside the OLD AppImage's FUSE mount (/tmp/.mount_XXX). When
// this process exits the AppImage runtime unmounts it and the helper dies before it starts
// the new AppImage (seen in CI on ubuntu-latest; with APPIMAGE_EXTRACT_AND_RUN=1 the
// extracted dir survives, which hid it). main.ts instead spawns a detached /bin/sh, which
// lives outside the mount, waits for this pid to be gone (so the new instance doesn't lose
// requestSingleInstanceLock() to the dying one) and execs the new AppImage.

/**
 * The wait loop: polls `kill -0 "$1"` every 0.2 s (1 s where `sleep` has no fractions),
 * capped at 150 rounds (~30 s) so a stuck or reused pid can't make it loop forever, then
 * execs "$2". Both are positional parameters: the path is never interpolated into the
 * script, so spaces/quotes/`$` in it are inert.
 */
export const APPIMAGE_RELAUNCH_SCRIPT =
  'i=0; while kill -0 "$1" 2>/dev/null && [ "$i" -lt 150 ]; do sleep 0.2 2>/dev/null || sleep 1; i=$((i+1)); done; exec "$2"'

/**
 * command + argv for spawn(): `/bin/sh -c <script> noteflow-relaunch <pid> <appImagePath>`
 * ($0 = `noteflow-relaunch`, the name `ps` shows). Throws on a non-positive/non-integer pid
 * or a relative path (the caller falls back to app.relaunch).
 */
export function appImageRelaunchSpawnArgs(pid: number, appImagePath: string): { command: string; args: string[] } {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid pid: ${pid}`)
  if (!appImagePath.startsWith('/')) throw new Error(`AppImage path must be absolute: ${appImagePath}`)
  return {
    command: '/bin/sh',
    args: ['-c', APPIMAGE_RELAUNCH_SCRIPT, 'noteflow-relaunch', String(pid), appImagePath],
  }
}

/** Set by the AppImage runtime / AppRun for the OLD AppImage; the new one sets its own. */
const APPIMAGE_RUNTIME_VARS = ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD']

/**
 * Environment for the relaunched AppImage: `env` without APPIMAGE/APPDIR/ARGV0/OWD and
 * without the entries that point into the old mount. Generic over every variable: its
 * value is split on `:` and the entries at or under `appDir` are removed (PATH,
 * LD_LIBRARY_PATH, XDG_DATA_DIRS, GSETTINGS_SCHEMA_DIR, QT_PLUGIN_PATH, PYTHONPATH,
 * PERLLIB…); a variable left with no non-empty entry is dropped. Variables with no entry
 * in the mount are kept byte-for-byte (NOTEFLOW_NOTES_DIR, DISPLAY=:0…). Undefined values
 * are dropped. Without a usable `appDir` only the runtime variables are removed.
 */
export function sanitizeAppImageEnv(
  env: Record<string, string | undefined>,
  appDir: string | undefined
): Record<string, string> {
  const dir = mountDir(appDir)
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || APPIMAGE_RUNTIME_VARS.includes(key)) continue
    if (!dir) { out[key] = value; continue }
    const entries = value.split(':')
    const kept = entries.filter((e) => !(e.startsWith('/') && isAtOrUnder(e, dir)))
    if (kept.length === entries.length) { out[key] = value; continue }
    if (kept.some((e) => e !== '')) out[key] = kept.join(':')
  }
  return out
}

/**
 * Working dir for the relaunch helper: the current one, unless it is inside the old mount
 * (it would keep the mount busy and vanish on unmount) — then `fallback` (home).
 */
export function appImageRelaunchCwd(cwd: string, appDir: string | undefined, fallback: string): string {
  const dir = mountDir(appDir)
  return dir && isAtOrUnder(cwd, dir) ? fallback : cwd
}

/** URL the updater should offer: an asset download URL, or RELEASES_PAGE_URL. */
export function pickUpdateTarget({ platform, version, isAppImage, isDebian }: UpdateTargetInput): string {
  if (!version) return RELEASES_PAGE_URL
  const v = encodeURIComponent(version)
  switch (platform) {
    case 'win32':
      return `${DOWNLOAD_BASE}/NoteFlow-${v}-Setup.exe`
    case 'darwin':
      // macOS ships a single Apple Silicon (arm64) DMG.
      return `${DOWNLOAD_BASE}/NoteFlow-${v}-arm64.dmg`
    case 'linux':
      if (isAppImage) return `${DOWNLOAD_BASE}/NoteFlow-${v}.AppImage`
      if (isDebian) return `${DOWNLOAD_BASE}/noteflow_${v}_amd64.deb`
      return RELEASES_PAGE_URL
    default:
      return RELEASES_PAGE_URL
  }
}

/** Kind of installable asset a file name/path refers to (case-insensitive), or null. */
export function updateAssetKind(fileName: string): UpdateAssetKind | null {
  const name = fileName.toLowerCase()
  if (name.endsWith('.exe')) return 'exe'
  if (name.endsWith('.dmg')) return 'dmg'
  if (name.endsWith('.deb')) return 'deb'
  if (name.endsWith('.appimage')) return 'appimage'
  return null
}

/**
 * Whether a github.com URL pathname is one of OUR release assets with an installable
 * extension. The host is checked by the caller. GitHub owner/repo are
 * case-insensitive, so the comparison is too.
 */
export function isAllowedUpdateAssetPath(pathname: string): boolean {
  if (!pathname.toLowerCase().startsWith(REPO_PATH)) return false
  return updateAssetKind(pathname) !== null
}

/**
 * Answer of the app:check-update IPC. `error: true` means the check itself
 * failed (offline, timeout, GitHub rate limit, unparseable answer) — it says
 * NOTHING about whether the app is up to date, so the UI must not claim it is.
 * MIRROR: the checkUpdate() return type in electron/preload.ts and src/types/index.ts.
 */
export interface UpdateCheckResult {
  hasUpdate: boolean
  latestVersion?: string
  downloadUrl?: string
  error?: true
}

export const UPDATE_CHECK_FAILED: UpdateCheckResult = { hasUpdate: false, error: true }

/**
 * Builds the app:check-update answer from GitHub's /releases/latest response.
 * `pickTarget` maps the latest version to the download URL (pickUpdateTarget
 * with the probed environment). Any non-2xx status, unparseable body or missing
 * tag_name is a failed check, never "up to date".
 */
export function buildUpdateCheckResult(
  statusCode: number | undefined,
  body: string,
  currentVersion: string,
  pickTarget: (latestVersion: string) => string
): UpdateCheckResult {
  if (!statusCode || statusCode < 200 || statusCode >= 300) return UPDATE_CHECK_FAILED
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return UPDATE_CHECK_FAILED
  }
  const tag = (json as { tag_name?: unknown } | null)?.tag_name
  if (typeof tag !== 'string' || !tag.trim()) return UPDATE_CHECK_FAILED
  const latestVersion = tag.trim().replace(/^v/, '')
  return {
    hasUpdate: latestVersion !== currentVersion,
    latestVersion,
    downloadUrl: pickTarget(latestVersion),
  }
}
