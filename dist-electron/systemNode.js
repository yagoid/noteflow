"use strict";
// Finding a real Node.js on this computer. PURE logic only (no fs, no spawn, no
// electron: the two things that touch the machine are injected) — covered by
// tests/electron/systemNode.test.ts. The IO is in agentRunIo.ts.
//
// Why: on Windows the app's binary (electron.exe / NoteFlow.exe) is a GUI
// subsystem program. Started from a console as Node (ELECTRON_RUN_AS_NODE) it
// does NOT get that console as its stdio — neither does what it starts with
// `stdio: 'inherit'`. So "Run" in a terminal cannot use it there: the agent
// would start without an interactive terminal. `noteflow run` needs a console
// program, and that is the user's own node.exe.
// Docs: .agents/context/patterns.md "Tareas con agentes: ejecutar".
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_NODE_MAX_CANDIDATES = exports.SYSTEM_NODE_MIN_MAJOR = void 0;
exports.parseNodeMajor = parseNodeMajor;
exports.isUsableNodeVersion = isUsableNodeVersion;
exports.isInsideDir = isInsideDir;
exports.systemNodeCandidates = systemNodeCandidates;
exports.resolveSystemNode = resolveSystemNode;
const path_1 = __importDefault(require("path"));
/** The CLI (cli/noteflow.js) needs Node 18 or later. */
exports.SYSTEM_NODE_MIN_MAJOR = 18;
/** How many `node` of PATH are asked for their version before giving up. */
exports.SYSTEM_NODE_MAX_CANDIDATES = 8;
/** The major of what `node --version` printed ("v22.3.0\n" → 22), null when it is not a Node version. */
function parseNodeMajor(output) {
    const m = /^v(\d{1,4})\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]*)?$/.exec(String(output ?? '').trim());
    return m ? Number(m[1]) : null;
}
/** Is what `node --version` printed a Node the CLI runs on? */
function isUsableNodeVersion(output) {
    const major = parseNodeMajor(output);
    return major !== null && major >= exports.SYSTEM_NODE_MIN_MAJOR;
}
function pathLib(platform) {
    return platform === 'win32' ? path_1.default.win32 : path_1.default.posix;
}
/** An absolute folder of a local drive (`C:\…`) or of the root (`/…`): never relative, never a network path. */
function isLocalAbsolute(platform, dir) {
    return platform === 'win32' ? /^[A-Za-z]:[\\/]/.test(dir) : dir.startsWith('/');
}
/** Is `file` inside `dir` (or `dir` itself)? Case-insensitive on Windows. Both must be absolute. */
function isInsideDir(platform, file, dir) {
    const lib = pathLib(platform);
    const fold = (p) => (platform === 'win32' ? lib.resolve(p).toLowerCase() : lib.resolve(p));
    const rel = lib.relative(fold(dir), fold(file));
    return rel === '' || (!rel.startsWith('..') && !lib.isAbsolute(rel));
}
/** PATH as the OS gives it: on Windows the variable's name has any case (`Path`). */
function pathVariable(platform, env) {
    if (platform !== 'win32')
        return env.PATH ?? '';
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path' && env[k]);
    return key ? env[key] ?? '' : '';
}
/**
 * Every `node` of PATH, in PATH's order, as absolute paths — `node.exe` on
 * Windows (the console program itself: never a `.cmd` / `.bat` shim, which
 * would put a batch file between the terminal and the CLI), `node` elsewhere.
 * Never looked for:
 *   - in the current folder (a bare name is never resolved against it), nor in
 *     a PATH entry that is relative (`.`, `node_modules\.bin`) or a network
 *     path — those depend on where the process happens to be;
 *   - inside a folder of `exclude` (the project folders of the notes — every
 *     look of the app passes them all: a `node.exe` that a repository carries
 *     must not be the one that runs the CLI, nor be asked for its version).
 */
function systemNodeCandidates(input) {
    const { platform } = input;
    const lib = pathLib(platform);
    const name = platform === 'win32' ? 'node.exe' : 'node';
    const exclude = (input.exclude ?? []).filter((dir) => lib.isAbsolute(dir));
    const seen = new Set();
    const found = [];
    for (const entry of pathVariable(platform, input.env).split(lib.delimiter)) {
        const dir = entry.trim().replace(/^"(.*)"$/, '$1');
        if (!dir || !isLocalAbsolute(platform, dir))
            continue;
        const file = lib.join(dir, name);
        const key = platform === 'win32' ? file.toLowerCase() : file;
        if (seen.has(key))
            continue;
        seen.add(key);
        if (exclude.some((ex) => isInsideDir(platform, file, ex)))
            continue;
        if (input.isRunnable(file))
            found.push(file);
    }
    return found;
}
/**
 * The first `node` of PATH that is Node 18 or later → its absolute path, null
 * when there is none. An older one earlier in PATH is skipped, not fatal.
 */
async function resolveSystemNode(deps) {
    const candidates = systemNodeCandidates(deps).slice(0, exports.SYSTEM_NODE_MAX_CANDIDATES);
    for (const file of candidates) {
        let version;
        try {
            version = await deps.readVersion(file);
        }
        catch {
            version = null;
        }
        if (isUsableNodeVersion(version))
            return file;
    }
    return null;
}
