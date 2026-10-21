"use strict";
// In-app updater: which release asset to download, and which URLs may be downloaded.
//
// Pure logic, no Electron/fs imports (same pattern as tempNoteExpiry.ts) so it can be
// unit-tested. main.ts probes the environment (process.platform, process.env.APPIMAGE,
// /etc/debian_version) and feeds the result to pickUpdateTarget(); the
// app:download-and-install handler gates every URL through isAllowedUpdateAssetPath().
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
exports.UPDATE_CHECK_FAILED = exports.RELEASES_PAGE_URL = void 0;
exports.isRunningFromOwnAppImage = isRunningFromOwnAppImage;
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
    if (!appImage || !appDir || !execPath)
        return false;
    const dir = path_1.default.posix.normalize(appDir).replace(/\/+$/, '');
    // Must be an absolute mount point; '/' normalizes to '' here and is rejected too
    // (the filesystem root would contain everything).
    if (!dir.startsWith('/'))
        return false;
    const exe = path_1.default.posix.normalize(execPath);
    return exe.startsWith(`${dir}/`);
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
