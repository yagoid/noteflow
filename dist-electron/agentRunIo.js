"use strict";
// Agent tasks — "Run": the IO behind the 'agent-run:*' IPC handlers (main.ts).
// The rules — what a request may carry, the gate every launch goes through,
// the launcher script, which terminal, the link of a desktop app — are pure and
// live in agentRun.ts; this file touches the disk, the processes, the
// clipboard, the native dialogs and the OS.
//
// The page is not trusted with what gets launched (see the head of
// agentRun.ts): presets are fixed; a custom command or link — text the page
// can write in settings.json — only runs after the user approved that exact
// text in a NATIVE dialog; a note's folder is only set by the native folder
// dialog; nothing launches with the feature off or for an encrypted note.
// Docs: .agents/context/patterns.md "Tareas con agentes: ejecutar".
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.terminalAvailable = terminalAvailable;
exports.info = info;
exports.getFolder = getFolder;
exports.pickFolder = pickFolder;
exports.clearFolder = clearFolder;
exports.sweepTmp = sweepTmp;
exports.preflight = preflight;
exports.runInTerminal = runInTerminal;
exports.openApp = openApp;
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const agentRun = __importStar(require("./agentRun"));
const agentTasks_1 = require("./agentTasks");
const cliConnect = __importStar(require("./cliConnect"));
const systemNode_1 = require("./systemNode");
const DRY_RUN_TIMEOUT_MS = 30000;
/** `node --version` answers in milliseconds; one that does not is not a usable Node. */
const NODE_VERSION_TIMEOUT_MS = 5000;
/** 'agent-run:info' (whether "Run" is offered at all) may reuse an answer this old; a launch always looks again. */
const NODE_INFO_TTL_MS = 5 * 60000;
/** A launch reuses what its own gate found a moment ago instead of asking `node --version` twice. */
const NODE_GATE_TTL_MS = 10000;
/** How long a terminal has to fail before it counts as opened. */
const TERMINAL_SETTLE_MS = 400;
// ── Whether this build can run the CLI in a terminal ─────────────────────────
/**
 * Can "Run" open a terminal with the bundled CLI? Not in the Microsoft Store
 * build: it ships no usable CLI — the package's exe cannot be started from a
 * terminal outside the package, and the CLI's settings and locks would land in
 * the package's private, virtualized AppData. (Desktop apps through a link
 * still work there.)
 */
function terminalAvailable() {
    return cliConnect.cliAvailable();
}
function isRunnableFile(file) {
    try {
        if (!fs_1.default.statSync(file).isFile())
            return false;
        if (process.platform !== 'win32')
            fs_1.default.accessSync(file, fs_1.default.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
/** What `<file> --version` prints — no shell, a short timeout, from the program's own folder. */
function readNodeVersion(file) {
    return new Promise((resolve) => {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        try {
            (0, child_process_1.execFile)(file, ['--version'], { timeout: NODE_VERSION_TIMEOUT_MS, windowsHide: true, shell: false, cwd: path_1.default.dirname(file), env, encoding: 'utf-8' }, (err, stdout) => resolve(err ? null : String(stdout)));
        }
        catch {
            resolve(null);
        }
    });
}
// EVERY look excludes the project folders (all the notes' — and the one of the
// run, once known): a node.exe inside one is not even asked for its version.
let lastSystemNode = null;
const excludeKey = (exclude) => [...exclude].map((d) => d.toLowerCase()).sort().join('\n');
/** A Node.js 18+ of PATH, looked for now (and remembered). `exclude`: folders it must not be in. */
async function findSystemNode(exclude) {
    const file = await (0, systemNode_1.resolveSystemNode)({ platform: process.platform, env: process.env, isRunnable: isRunnableFile, readVersion: readNodeVersion, exclude });
    lastSystemNode = { at: Date.now(), file, excluded: excludeKey(exclude) };
    return file;
}
/**
 * The last look, when it is younger than `ttlMs` and still answers for
 * `exclude`: a Node that was found counts unless it is inside one of these
 * folders; "none" only counts for the very same exclusions.
 */
function rememberedNode(exclude, ttlMs) {
    const last = lastSystemNode;
    if (!last || Date.now() - last.at >= ttlMs)
        return null;
    if (last.file === null)
        return last.excluded === excludeKey(exclude) ? { file: null } : null;
    const file = last.file;
    return exclude.some((dir) => (0, systemNode_1.isInsideDir)('win32', file, dir)) ? null : { file };
}
const knownFolders = (host) => agentRun.agentKnownFolders(host.readSettings().agentTasks);
/** Is there something to run the CLI with inside a terminal? Looked for NOW (the gate of a launch). */
async function terminalRuntime(host) {
    return process.platform !== 'win32' || (await findSystemNode(knownFolders(host))) !== null;
}
/**
 * 'agent-run:info'. The rule is agentRun.agentRunInfo: Node is only looked
 * for (a program of PATH is only RUN) on Windows with the feature on and the
 * terminal mode chosen. Then the last look is reused when it is recent — the
 * answer only decides whether the button is shown; a launch asks again. (A
 * PATH changed by an installer only reaches the app when it restarts.)
 */
function info(host) {
    return agentRun.agentRunInfo({
        terminalAvailable: terminalAvailable(),
        platform: process.platform,
        readAgentTasks: () => host.readSettings().agentTasks,
        probeNode: async (exclude) => ((rememberedNode(exclude, NODE_INFO_TTL_MS) ?? { file: await findSystemNode(exclude) }).file !== null),
    });
}
/**
 * The program that runs the CLI for a run in `folder`, null when there is none
 * (Windows without Node.js). The node.exe is never one inside a project
 * folder: a repository's own binary must not be what runs the CLI.
 */
async function cliRunnerFor(host, folder) {
    if (process.platform !== 'win32')
        return { execPath: process.execPath, node: false };
    const exclude = [...new Set([folder, ...knownFolders(host)])];
    // The gate has just looked: that answer is used when it still holds for these folders.
    const file = (rememberedNode(exclude, NODE_GATE_TTL_MS) ?? { file: await findSystemNode(exclude) }).file;
    return file ? { execPath: file, node: true } : null;
}
// ── The note's project folder ────────────────────────────────────────────────
function isDirectory(folder) {
    try {
        return path_1.default.isAbsolute(folder) && fs_1.default.statSync(folder).isDirectory();
    }
    catch {
        return false;
    }
}
/** The folder stored for a note and whether it is still there. */
function getFolder(host, noteId) {
    if (!agentRun.isAgentNoteId(noteId))
        return { folder: null, exists: false };
    const folder = agentRun.agentFolderOf(host.readSettings().agentTasks, noteId);
    return folder ? { folder, exists: isDirectory(folder) } : { folder: null, exists: false };
}
/** Read-modify-write of settings.json → agentTasks with a fresh read, nothing awaited in between. */
function updateAgentTasks(host, change) {
    const settings = host.readSettings();
    settings.agentTasks = change(settings.agentTasks);
    host.writeSettings(settings);
}
/** The native folder dialog → the folder chosen, null when it is closed. */
async function askFolder(host, parent, current) {
    const options = {
        title: host.texts().chooseAgentFolder,
        properties: ['openDirectory', 'createDirectory'],
        ...(current ? { defaultPath: current } : {}),
    };
    const result = parent ? await electron_1.dialog.showOpenDialog(parent, options) : await electron_1.dialog.showOpenDialog(options);
    const folder = result.canceled ? undefined : result.filePaths[0];
    return folder && isDirectory(folder) ? folder : null;
}
/** Asks for the note's project folder with the native dialog and remembers it — the only way a folder is ever set. */
async function pickFolder(host, noteId, parent) {
    if (!agentRun.isAgentNoteId(noteId))
        return { canceled: true };
    const current = getFolder(host, noteId);
    const folder = await askFolder(host, parent, current.folder && current.exists ? current.folder : null);
    if (!folder)
        return { canceled: true };
    updateAgentTasks(host, (stored) => agentRun.withAgentFolder(stored, noteId, folder));
    return { folder };
}
function clearFolder(host, noteId) {
    if (agentRun.isAgentNoteId(noteId) && getFolder(host, noteId).folder !== null) {
        updateAgentTasks(host, (stored) => agentRun.withAgentFolder(stored, noteId, null));
    }
}
// ── The gate: the native approval of a custom command / link ─────────────────
/**
 * "Launch this exact command / link with your tasks?" — a native message box
 * (the page cannot draw it, press it nor skip it). The text is shown whole;
 * the default button — and Escape — is Cancel. For an http(s) link it says
 * that the prompt travels in the address.
 */
async function confirmCustom(host, parent, custom) {
    const t = host.texts();
    const command = custom.kind === 'command';
    const detail = [
        custom.text,
        command ? t.agentApproveCommandDetail : t.agentApproveUrlDetail,
        ...(custom.web ? [t.agentApproveUrlWeb] : []),
    ].join('\n\n');
    const options = {
        type: 'warning',
        message: command ? t.agentApproveCommand : t.agentApproveUrl,
        detail,
        buttons: [t.agentApproveCancel, command ? t.agentApproveCommandConfirm : t.agentApproveUrlConfirm],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
    };
    const result = parent ? await electron_1.dialog.showMessageBox(parent, options) : await electron_1.dialog.showMessageBox(options);
    return result.response === 1;
}
function gateFor(host, parent) {
    return {
        readAgentTasks: () => host.readSettings().agentTasks,
        updateAgentTasks: (change) => updateAgentTasks(host, change),
        isDirectory,
        noteEncrypted: (noteId) => host.noteEncrypted(noteId),
        terminalAvailable: terminalAvailable(),
        storeBuild: process.windowsStore === true,
        terminalRuntime: () => terminalRuntime(host),
        platform: process.platform,
        pickFolder: (current) => askFolder(host, parent, current),
        confirmCustom: (custom) => confirmCustom(host, parent, custom),
    };
}
// ── Temporary files ──────────────────────────────────────────────────────────
function tmpDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'tmp');
}
function removeQuietly(file) {
    if (!file)
        return;
    try {
        fs_1.default.unlinkSync(file);
    }
    catch {
        // not there
    }
}
/** Removes the temp files of earlier runs that have outlived their use (agentRunTmpExpired). Called when the app starts. */
function sweepTmp() {
    let names;
    try {
        names = fs_1.default.readdirSync(tmpDir());
    }
    catch {
        return;
    }
    const now = Date.now();
    for (const name of names) {
        const file = path_1.default.join(tmpDir(), name);
        try {
            if (agentRun.agentRunTmpExpired(name, now - fs_1.default.statSync(file).mtimeMs))
                fs_1.default.unlinkSync(file);
        }
        catch {
            // gone, or in use: the next start tries again
        }
    }
}
function newStem() {
    return `${agentRun.AGENT_RUN_TMP_PREFIX}${(0, crypto_1.randomBytes)(6).toString('hex')}`;
}
function writeText(file, text) {
    fs_1.default.mkdirSync(path_1.default.dirname(file), { recursive: true, mode: 0o700 });
    fs_1.default.writeFileSync(file, text, { encoding: 'utf-8', mode: 0o600 });
}
// ── The CLI: its environment, the script, the dry run ────────────────────────
/** What the CLI gets on top of the inherited environment. A real Node is not given ELECTRON_RUN_AS_NODE (the script clears it instead). */
function cliEnv(host, runner) {
    const env = runner.node ? { NOTEFLOW_NO_APP_CHECK: '1' } : { ELECTRON_RUN_AS_NODE: '1', NOTEFLOW_NO_APP_CHECK: '1' };
    if (host.notesDirOverride)
        env.NOTEFLOW_NOTES_DIR = host.notesDirOverride;
    return env;
}
function launcherScript(host, runner, folder, args) {
    return agentRun.buildAgentLauncherScript({
        platform: process.platform, folder, execPath: runner.execPath, cliScript: cliConnect.cliScriptPath(), args,
        env: cliEnv(host, runner), unsetEnv: runner.node ? ['ELECTRON_RUN_AS_NODE'] : [],
    });
}
/**
 * `noteflow run <args> --dry-run --json` in `folder`: would this run start?
 * Changes nothing. Run by the SAME program as the launcher script (on Windows
 * the computer's node.exe), so the agent is looked for the same way both
 * times. Outside Windows "agent not found" does not count: a GUI app's PATH is
 * poorer than the user's shell — the terminal (which runs the user's shell)
 * decides, and says so in its window.
 */
async function dryRun(host, runner, folder, args) {
    const run = await cliConnect.runCliCapture([...args, '--dry-run', '--json'], {
        cwd: folder, timeoutMs: DRY_RUN_TIMEOUT_MS, env: cliEnv(host, runner), ...(runner.node ? { node: runner.execPath } : {}),
    });
    const verdict = agentRun.interpretAgentDryRun(run);
    if (!verdict.ok && verdict.code === 'agent_not_found' && process.platform !== 'win32')
        return { ok: true };
    return verdict;
}
/**
 * 'agent-run:preflight' — everything that can be known BEFORE a task is
 * queued or moved, so a run that cannot start changes nothing in the note:
 * the gate (feature on, note not encrypted, the folder — asked for here when
 * the note has none —, the custom command / link approved in its native
 * dialog) and, for a terminal, that there is something to run the CLI with in
 * it (Windows: Node.js 18+ — 'node_not_found'), that the launcher script can be
 * written for these paths and that the agent is installed (a dry run of the
 * CLI WITHOUT tasks). 'canceled' = the user closed a dialog: nothing happened.
 */
async function preflight(host, noteId, parent) {
    if (!agentRun.isAgentNoteId(noteId))
        return { ok: false, code: 'invalid_request' };
    const grant = await agentRun.authorizeAgentLaunch(gateFor(host, parent), noteId, { askFolder: true });
    if (!grant.ok)
        return grant;
    if (grant.settings.launch !== 'terminal')
        return { ok: true, folder: grant.folder };
    const agent = agentRun.agentRunAgentArgs(grant.settings, grant.custom);
    if (!agent.ok)
        return agent;
    const runner = await cliRunnerFor(host, grant.folder);
    if (!runner)
        return { ok: false, code: 'node_not_found' };
    const probe = path_1.default.join(tmpDir(), `${newStem()}.prompt.md`);
    try {
        const args = agentRun.agentRunCliArgs({ ids: [], contextFile: null, promptFile: probe, onFinish: grant.settings.onFinish, agentArgs: agent.args });
        const script = launcherScript(host, runner, grant.folder, args);
        if (!script.ok)
            return { ok: false, code: script.code, detail: script.value };
        writeText(probe, 'preflight');
        const verdict = await dryRun(host, runner, grant.folder, args);
        return verdict.ok ? { ok: true, folder: grant.folder } : verdict;
    }
    catch (err) {
        return { ok: false, code: 'failed', detail: err instanceof Error ? err.message : String(err) };
    }
    finally {
        removeQuietly(probe);
    }
}
// ── Terminal ─────────────────────────────────────────────────────────────────
function which(name) {
    for (const dir of String(process.env.PATH || '').split(path_1.default.delimiter)) {
        if (!dir)
            continue;
        const file = path_1.default.join(dir, name);
        try {
            if (fs_1.default.statSync(file).isFile()) {
                fs_1.default.accessSync(file, fs_1.default.constants.X_OK);
                return file;
            }
        }
        catch {
            // not here
        }
    }
    return null;
}
/** Windows Terminal's launcher: an app execution alias (a reparse point — lstat, not stat). */
function windowsTerminalPath() {
    const local = process.env.LOCALAPPDATA;
    if (!local)
        return null;
    const file = path_1.default.join(local, 'Microsoft', 'WindowsApps', 'wt.exe');
    try {
        fs_1.default.lstatSync(file);
        return file;
    }
    catch {
        return null;
    }
}
/** Starts one terminal plan: true once it is running (or has handed over and left cleanly), false when it could not start. */
function startTerminal(plan) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (ok) => {
            if (settled)
                return;
            settled = true;
            resolve(ok);
        };
        try {
            const child = (0, child_process_1.spawn)(plan.command, plan.args, {
                cwd: plan.cwd,
                // Never a shell: the command and its arguments go to the OS as they are.
                shell: false,
                detached: !plan.hidden,
                stdio: 'ignore',
                windowsHide: plan.hidden === true,
                windowsVerbatimArguments: plan.verbatim === true,
            });
            child.once('error', () => done(false));
            child.once('spawn', () => {
                // A launcher that fails says so at once (a non-zero exit); one that is
                // still there, or left with 0 after handing over, opened its window.
                const timer = setTimeout(() => done(true), TERMINAL_SETTLE_MS);
                child.once('exit', (code) => {
                    clearTimeout(timer);
                    done(code === 0 || code === null);
                });
            });
            child.unref();
        }
        catch {
            done(false);
        }
    });
}
async function openTerminal(scriptDir, scriptName) {
    const plans = agentRun.agentTerminalPlans(process.platform, {
        scriptDir,
        scriptName,
        which,
        windowsTerminal: process.platform === 'win32' ? windowsTerminalPath() : null,
        comspec: agentRun.safeComspec(process.env),
    });
    for (const plan of plans) {
        if (await startTerminal(plan))
            return true;
        console.warn(`[agent-run] could not open ${plan.name}`);
    }
    return false;
}
/**
 * 'agent-run:terminal'. Through the gate again (no dialog for a folder here:
 * the preflight asked), then: validates the run with `noteflow run … --dry-run
 * --json` (in the note's folder, nothing changed) and, when it would work,
 * opens a terminal window on the launcher script that runs it for real — with
 * the agent that was authorized, given explicitly (`--agent`).
 * The context / prompt travels in a temp file of userData/tmp, never on a
 * command line; it is removed ten minutes later (and when the app starts).
 */
async function runInTerminal(host, raw, parent) {
    const req = agentRun.parseAgentTerminalRequest(raw);
    if (!req)
        return { ok: false, code: 'invalid_request' };
    const grant = await agentRun.authorizeAgentLaunch(gateFor(host, parent), req.noteId, { mode: 'terminal' });
    if (!grant.ok)
        return grant;
    const agent = agentRun.agentRunAgentArgs(grant.settings, grant.custom);
    if (!agent.ok)
        return agent;
    const runner = await cliRunnerFor(host, grant.folder);
    if (!runner)
        return { ok: false, code: 'node_not_found' };
    const dir = tmpDir();
    const stem = newStem();
    const text = req.ids.length > 0 ? req.context : req.prompt;
    const textFile = text === null ? null : path_1.default.join(dir, `${stem}.${req.ids.length > 0 ? 'context' : 'prompt'}.md`);
    let scriptFile = null;
    const cleanUp = () => {
        removeQuietly(textFile);
        removeQuietly(scriptFile);
    };
    try {
        fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o700 });
        if (textFile && text !== null)
            writeText(textFile, text);
        const args = agentRun.agentRunCliArgs({
            ids: req.ids,
            contextFile: req.ids.length > 0 ? textFile : null,
            promptFile: req.ids.length > 0 ? null : textFile,
            onFinish: grant.settings.onFinish,
            batchMode: grant.settings.batchMode,
            model: (0, agentTasks_1.agentRunModel)(grant.settings),
            effort: (0, agentTasks_1.agentRunEffort)(grant.settings),
            agentArgs: agent.args,
        });
        const script = launcherScript(host, runner, grant.folder, args);
        if (!script.ok) {
            cleanUp();
            return { ok: false, code: script.code, detail: script.value };
        }
        const verdict = await dryRun(host, runner, grant.folder, args);
        if (!verdict.ok) {
            cleanUp();
            return verdict;
        }
        const scriptName = `${stem}${script.ext}`;
        scriptFile = path_1.default.join(dir, scriptName);
        fs_1.default.writeFileSync(scriptFile, script.text, { encoding: 'utf-8', mode: 0o700 });
        if (!(await openTerminal(dir, scriptName))) {
            cleanUp();
            return { ok: false, code: 'no_terminal' };
        }
        if (textFile)
            setTimeout(() => removeQuietly(textFile), agentRun.AGENT_RUN_TEXT_TTL_MS).unref();
        return { ok: true };
    }
    catch (err) {
        cleanUp();
        return { ok: false, code: 'failed', detail: err instanceof Error ? err.message : String(err) };
    }
}
// ── Desktop app ──────────────────────────────────────────────────────────────
/**
 * 'agent-run:open-app'. Through the gate, then builds the link here
 * (agentRun.buildAgentAppUrl: fixed schemes for the presets; for a custom link
 * the template that was authorized) and opens it. When the prompt does not fit
 * in a link — or the OS refuses the long one — the prompt goes to the
 * clipboard and the app is opened on the folder alone.
 */
async function openApp(host, raw, parent) {
    const req = agentRun.parseAgentAppRequest(raw);
    if (!req)
        return { ok: false, code: 'invalid_request' };
    const grant = await agentRun.authorizeAgentLaunch(gateFor(host, parent), req.noteId, { mode: 'app' });
    if (!grant.ok)
        return grant;
    const launch = grant.settings.launch;
    if (launch === 'terminal')
        return { ok: false, code: 'invalid_request' };
    const input = { prompt: req.prompt, folder: grant.folder, template: grant.custom?.kind === 'url' ? grant.custom.text : '' };
    const link = agentRun.buildAgentAppUrl(launch, input);
    if (!link.ok)
        return link;
    const open = async (url) => {
        try {
            await electron_1.shell.openExternal(url);
            return true;
        }
        catch (err) {
            console.warn('[agent-run] the OS refused the link:', err instanceof Error ? err.message : err);
            return false;
        }
    };
    if (!link.promptOmitted) {
        if (await open(link.url))
            return { ok: true, app: launch, promptCopied: false };
        // Too long for this OS, perhaps: once more with the folder alone.
    }
    const bare = link.promptOmitted ? link : agentRun.buildAgentAppUrl(launch, { ...input, omitPrompt: true });
    if (!bare.ok)
        return bare;
    electron_1.clipboard.writeText(req.prompt);
    if (await open(bare.url))
        return { ok: true, app: launch, promptCopied: true };
    return { ok: false, code: 'open_failed' };
}
