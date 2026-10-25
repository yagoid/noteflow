"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPDATE_CHECK_FAILED = exports.APPIMAGE_RELAUNCH_SCRIPT = exports.RELEASES_PAGE_URL = void 0;
exports.isRunningFromOwnAppImage = isRunningFromOwnAppImage;
exports.appImageRelaunchSpawnArgs = appImageRelaunchSpawnArgs;
exports.sanitizeAppImageEnv = sanitizeAppImageEnv;
exports.appImageRelaunchCwd = appImageRelaunchCwd;
exports.pickUpdateTarget = pickUpdateTarget;
exports.updateAssetKind = updateAssetKind;
exports.isAllowedUpdateAssetPath = isAllowedUpdateAssetPath;
exports.buildUpdateCheckResult = buildUpdateCheckResult;
const path_1 = __importDefault(require("path"));
const REPO_PATH = '/yagoid/noteflow/releases/';
const DOWNLOAD_BASE = 'https://github.com/yagoid/noteflow/releases/latest/download';
/** Fallback when there is no asset we can install for this system. */
exports.RELEASES_PAGE_URL = 'https://github.com/yagoid/noteflow/releases/latest';
/**
 * True only when this process is the binary inside the mounted AppImage: APPIMAGE and
 * APPDIR are set AND execPath lives under APPDIR. Compared by path segments, so
 * `/tmp/.mount_ab` does not contain `/tmp/.mount_abc/noteflow`.
 */
function isRunningFromOwnAppImage({ appImage, appDir, execPath }) {
    if (!appImage || !execPath)
        return false;
    const dir = mountDir(appDir);
    if (!dir)
        return false;
    const exe = path_1.default.posix.normalize(execPath);
    return exe.startsWith(`${dir}/`);
}
/**
 * APPDIR normalized without trailing slashes, or null when unusable. Must be an absolute
 * mount point; '/' normalizes to '' here and is rejected too (the filesystem root would
 * contain everything).
 */
function mountDir(appDir) {
    if (!appDir)
        return null;
    const dir = path_1.default.posix.normalize(appDir).replace(/\/+$/, '');
    return dir.startsWith('/') ? dir : null;
}
/** `p` is `dir` itself or lies under it (by path segments). `dir` comes from mountDir(). */
function isAtOrUnder(p, dir) {
    const n = path_1.default.posix.normalize(p).replace(/\/+$/, '');
    return n === dir || n.startsWith(`${dir}/`);
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
exports.APPIMAGE_RELAUNCH_SCRIPT = 'i=0; while kill -0 "$1" 2>/dev/null && [ "$i" -lt 150 ]; do sleep 0.2 2>/dev/null || sleep 1; i=$((i+1)); done; exec "$2"';
/**
 * command + argv for spawn(): `/bin/sh -c <script> noteflow-relaunch <pid> <appImagePath>`
 * ($0 = `noteflow-relaunch`, the name `ps` shows). Throws on a non-positive/non-integer pid
 * or a relative path (the caller falls back to app.relaunch).
 */
function appImageRelaunchSpawnArgs(pid, appImagePath) {
    if (!Number.isInteger(pid) || pid <= 0)
        throw new Error(`Invalid pid: ${pid}`);
    if (!appImagePath.startsWith('/'))
        throw new Error(`AppImage path must be absolute: ${appImagePath}`);
    return {
        command: '/bin/sh',
        args: ['-c', exports.APPIMAGE_RELAUNCH_SCRIPT, 'noteflow-relaunch', String(pid), appImagePath],
    };
}
/** Set by the AppImage runtime / AppRun for the OLD AppImage; the new one sets its own. */
const APPIMAGE_RUNTIME_VARS = ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD'];
/**
 * Environment for the relaunched AppImage: `env` without APPIMAGE/APPDIR/ARGV0/OWD and
 * without the entries that point into the old mount. Generic over every variable: its
 * value is split on `:` and the entries at or under `appDir` are removed (PATH,
 * LD_LIBRARY_PATH, XDG_DATA_DIRS, GSETTINGS_SCHEMA_DIR, QT_PLUGIN_PATH, PYTHONPATH,
 * PERLLIB…); a variable left with no non-empty entry is dropped. Variables with no entry
 * in the mount are kept byte-for-byte (NOTEFLOW_NOTES_DIR, DISPLAY=:0…). Undefined values
 * are dropped. Without a usable `appDir` only the runtime variables are removed.
 */
function sanitizeAppImageEnv(env, appDir) {
    const dir = mountDir(appDir);
    const out = {};
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined || APPIMAGE_RUNTIME_VARS.includes(key))
            continue;
        if (!dir) {
            out[key] = value;
            continue;
        }
        const entries = value.split(':');
        const kept = entries.filter((e) => !(e.startsWith('/') && isAtOrUnder(e, dir)));
        if (kept.length === entries.length) {
            out[key] = value;
            continue;
        }
        if (kept.some((e) => e !== ''))
            out[key] = kept.join(':');
    }
    return out;
}
/**
 * Working dir for the relaunch helper: the current one, unless it is inside the old mount
 * (it would keep the mount busy and vanish on unmount) — then `fallback` (home).
 */
function appImageRelaunchCwd(cwd, appDir, fallback) {
    const dir = mountDir(appDir);
    return dir && isAtOrUnder(cwd, dir) ? fallback : cwd;
}
/** URL the updater should offer: an asset download URL, or RELEASES_PAGE_URL. */
function pickUpdateTarget({ platform, version, isAppImage, isDebian }) {
    if (!version)
        return exports.RELEASES_PAGE_URL;
    const v = encodeURIComponent(version);
    switch (platform) {
        case 'win32':
            return `${DOWNLOAD_BASE}/NoteFlow-${v}-Setup.exe`;
        case 'darwin':
            // macOS ships a single Apple Silicon (arm64) DMG.
            return `${DOWNLOAD_BASE}/NoteFlow-${v}-arm64.dmg`;
        case 'linux':
            if (isAppImage)
                return `${DOWNLOAD_BASE}/NoteFlow-${v}.AppImage`;
            if (isDebian)
                return `${DOWNLOAD_BASE}/noteflow_${v}_amd64.deb`;
            return exports.RELEASES_PAGE_URL;
        default:
            return exports.RELEASES_PAGE_URL;
    }
}
/** Kind of installable asset a file name/path refers to (case-insensitive), or null. */
function updateAssetKind(fileName) {
    const name = fileName.toLowerCase();
    if (name.endsWith('.exe'))
        return 'exe';
    if (name.endsWith('.dmg'))
        return 'dmg';
    if (name.endsWith('.deb'))
        return 'deb';
    if (name.endsWith('.appimage'))
        return 'appimage';
    return null;
}
/**
 * Whether a github.com URL pathname is one of OUR release assets with an installable
 * extension. The host is checked by the caller. GitHub owner/repo are
 * case-insensitive, so the comparison is too.
 */
function isAllowedUpdateAssetPath(pathname) {
    if (!pathname.toLowerCase().startsWith(REPO_PATH))
        return false;
    return updateAssetKind(pathname) !== null;
}
exports.UPDATE_CHECK_FAILED = { hasUpdate: false, error: true };
/**
 * Builds the app:check-update answer from GitHub's /releases/latest response.
 * `pickTarget` maps the latest version to the download URL (pickUpdateTarget
 * with the probed environment). Any non-2xx status, unparseable body or missing
 * tag_name is a failed check, never "up to date".
 */
function buildUpdateCheckResult(statusCode, body, currentVersion, pickTarget) {
    if (!statusCode || statusCode < 200 || statusCode >= 300)
        return exports.UPDATE_CHECK_FAILED;
    let json;
    try {
        json = JSON.parse(body);
    }
    catch {
        return exports.UPDATE_CHECK_FAILED;
    }
    const tag = json?.tag_name;
    if (typeof tag !== 'string' || !tag.trim())
        return exports.UPDATE_CHECK_FAILED;
    const latestVersion = tag.trim().replace(/^v/, '');
    return {
        hasUpdate: latestVersion !== currentVersion,
        latestVersion,
        downloadUrl: pickTarget(latestVersion),
    };
}
