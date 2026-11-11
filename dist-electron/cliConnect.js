"use strict";
// Settings → Sync → "Connect the CLI too": gives the bundled CLI
// (cli/noteflow.js) its own access to the backend the app syncs with. Pure
// rules (paths, token mirror, plans) live in cliConnectLogic.ts.
//
//  - NoteFlow Cloud: the CLI must have its OWN GoTrue session (GoTrue rotates
//    the refresh token on every use — a shared one would sign the app and the
//    CLI out of each other), so the app runs the CLI's own non-interactive
//    login: `cloud login <email> --send-code`, then `--code <code> --no-pull`
//    (no pull: the app already syncs the same notes dir), and `cloud logout`.
//    The app never reads the CLI's refresh token.
//  - GitHub: no new authorization — the app hands its token to the CLI (the
//    user confirms first: the CLI stores it base64, without the OS keyring).
//    See planGithubConnect for where it goes on each OS.
//
// The CLI's settings.json is written read-modify-write with a fresh read and
// no await in between, like every writer of the app's settings.json — on
// Windows it is the same file, so the app's keys survive these writes and the
// CLI keys (cliAccount, cliCloud, cliGithubToken…) survive the app's.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatus = getStatus;
exports.cloudSendCode = cloudSendCode;
exports.cloudVerifyCode = cloudVerifyCode;
exports.cloudDisconnect = cloudDisconnect;
exports.githubConnect = githubConnect;
exports.githubDisconnect = githubDisconnect;
exports.cleanupAfterAppGithubDisconnect = cleanupAfterAppGithubDisconnect;
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const settingsFile_1 = require("./settingsFile");
const cliConnectLogic_1 = require("./cliConnectLogic");
const CLI_TIMEOUT_MS = 60000;
function settingsPath() {
    return (0, cliConnectLogic_1.cliSettingsPath)(process.platform, process.env, os_1.default.homedir());
}
const shared = () => (0, cliConnectLogic_1.isCliSettingsShared)(process.platform);
function cliScriptPath() {
    // Same layout as the bundled skill (syncSkillToAgentDirs in main.ts):
    // extraResources in a build, the repo's cli/ in dev (__dirname = dist-electron/).
    return electron_1.app.isPackaged
        ? path_1.default.join(process.resourcesPath, 'cli', 'noteflow.js')
        : path_1.default.join(__dirname, '..', 'cli', 'noteflow.js');
}
// Microsoft Store build: the bundled CLI isn't on PATH, and the CLI's
// settings.json (in AppData) would be written into the package's private,
// virtualized copy, invisible to a CLI installed outside the Store. Settings →
// Sync shows an explanation instead of this section there.
const IS_STORE_BUILD = process.windowsStore === true;
function cliAvailable() {
    if (IS_STORE_BUILD)
        return false;
    try {
        return fs_1.default.existsSync(cliScriptPath());
    }
    catch {
        return false;
    }
}
/**
 * The CLI's parsed settings: `{}` when the file does not exist, null when it
 * exists but can't be read/parsed. Writers must stop on null — writing `{}`
 * back would wipe it (on Windows, the app's own settings with it).
 */
function readCliSettings() {
    let raw;
    try {
        raw = fs_1.default.readFileSync(settingsPath(), 'utf-8');
    }
    catch (err) {
        return err.code === 'ENOENT' ? {} : null;
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function writeCliSettings(data) {
    const file = settingsPath();
    const dir = path_1.default.dirname(file);
    // 0700 only when WE create it — same as the CLI's writeSettings.
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o700 });
    (0, settingsFile_1.writeSettingsFile)(file, data); // owner-only (0600) on POSIX
}
/** The CLI's per-repo GitHub bases cache (GITHUB_BASES_PATH in cli/noteflow.js). */
function clearCliGithubBases() {
    try {
        fs_1.default.unlinkSync(path_1.default.join(path_1.default.dirname(settingsPath()), 'cli-github-state.json'));
    }
    catch {
        // not there
    }
}
function getStatus() {
    const settings = readCliSettings() ?? {};
    return { available: cliAvailable(), ...(0, cliConnectLogic_1.cliStatusFromSettings)(settings, shared()) };
}
/**
 * Runs the bundled CLI with this Electron binary as Node (ELECTRON_RUN_AS_NODE),
 * so no Node install is needed. stdin is closed: only non-interactive commands
 * are run (a prompt would end the CLI with an error, never hang it).
 */
function runCli(args) {
    return new Promise((resolve) => {
        let stderr = '';
        let settled = false;
        const child = (0, child_process_1.spawn)(process.execPath, [cliScriptPath(), ...args], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NOTEFLOW_NO_APP_CHECK: '1' },
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
        });
        // Events only fire after this executor returns, so `timer` is always set.
        const timer = setTimeout(() => {
            child.kill();
            finish({ code: null, stderr: `${stderr}\n  Error: network timeout` });
        }, CLI_TIMEOUT_MS);
        function finish(run) {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(run);
        }
        child.stderr?.setEncoding('utf-8');
        child.stderr?.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', (err) => finish({ code: null, stderr: `  Error: ${err.message}` }));
        child.on('close', (code) => finish({ code, stderr }));
    });
}
async function runCloudCommand(args) {
    if (!cliAvailable())
        return { ok: false, error: 'cliMissing' };
    const run = await runCli(args);
    if (run.code !== 0)
        return { ok: false, ...(0, cliConnectLogic_1.classifyCliCloudError)(run.stderr) };
    return { ok: true, status: getStatus() };
}
// ── Cloud ─────────────────────────────────────────────────────────────────────
/** Step 1: the CLI emails a sign-in code to `email` (the app's account). */
function cloudSendCode(email) {
    return runCloudCommand(['cloud', 'login', email, '--send-code']);
}
/** Step 2: the CLI verifies the code and saves ITS session (cliAccount) — no pull. */
async function cloudVerifyCode(email, code) {
    const result = await runCloudCommand(['cloud', 'login', email, '--code', code, '--no-pull']);
    // Exit 0 with no session on disk would mean the CLI's write was lost.
    if (result.ok && !result.status.cloud.connected)
        return { ok: false, error: 'failed' };
    return result;
}
/** `cloud logout` of the CLI: revokes only the CLI's own session (scope=local). */
function cloudDisconnect() {
    return runCloudCommand(['cloud', 'logout']);
}
// ── GitHub ────────────────────────────────────────────────────────────────────
function githubConnect(target) {
    if (IS_STORE_BUILD)
        return { ok: false, error: 'cliMissing' };
    const settings = readCliSettings();
    if (!settings)
        return { ok: false, error: 'failed' };
    const plan = (0, cliConnectLogic_1.planGithubConnect)(settings, target, shared());
    if (!plan.ok)
        return { ok: false, error: plan.error };
    writeCliSettings(plan.settings);
    if (plan.clearBases)
        clearCliGithubBases();
    return { ok: true, status: getStatus() };
}
function githubDisconnect() {
    if (IS_STORE_BUILD)
        return { ok: false, error: 'cliMissing' };
    const settings = readCliSettings();
    if (!settings)
        return { ok: false, error: 'failed' };
    const plan = (0, cliConnectLogic_1.planGithubDisconnect)(settings, shared());
    if (plan) {
        writeCliSettings(plan.settings);
        if (plan.clearBases)
            clearCliGithubBases();
    }
    return { ok: true, status: getStatus() };
}
/**
 * After the app disconnects GitHub: drop the CLI's token copy if it no longer
 * matches any connection (on Windows the app just deleted the shared
 * githubSync). Best-effort — never fails the app's disconnect.
 */
function cleanupAfterAppGithubDisconnect() {
    try {
        const settings = readCliSettings();
        if (!settings)
            return;
        const next = (0, cliConnectLogic_1.dropOrphanCliGithubToken)(settings);
        if (next)
            writeCliSettings(next);
    }
    catch (err) {
        console.error('[cliConnect] cleanup after GitHub disconnect failed:', err);
    }
}
