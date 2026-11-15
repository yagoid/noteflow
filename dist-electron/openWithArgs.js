"use strict";
// "Open with NoteFlow": the files the OS — or a terminal (`NoteFlow file.md`) — asks NoteFlow
// to open. They arrive in the command line of the first launch (process.argv), in the argv a
// second launch forwards through 'second-instance' (Windows / Linux), or one by one through
// macOS's 'open-file' event. main.ts links each as a TRANSIENT linked note (a grant of its
// own: linkedNotes.grantLinkPaths) and opens it — see patterns.md § "Notas vinculadas" →
// "Abrir desde el sistema / notas temporales".
//
// Pure (no Electron, the file check injected) so it can be unit-tested
// (tests/electron/openWithArgs.test.ts), like relaunchArgs.ts.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LAUNCH_FILES = void 0;
exports.fileUrlToPath = fileUrlToPath;
exports.openTargets = openTargets;
exports.launchFilePaths = launchFilePaths;
exports.uniqueOpenPaths = uniqueOpenPaths;
exports.absolutizeFileArgs = absolutizeFileArgs;
const path_1 = __importDefault(require("path"));
const linkedNotesLogic_1 = require("./linkedNotesLogic");
/** At most this many files from one launch (a glob gone wrong must not link a whole folder). */
exports.MAX_LAUNCH_FILES = 50;
function pathModule(platform) {
    return platform === 'win32' ? path_1.default.win32 : path_1.default.posix;
}
/**
 * A command-line switch (`--x`, `--x=y`, `-x`). On Windows a single leading `/` is one too
 * (Chromium's switch prefix there); `//host/share` is a UNC path, not a switch.
 */
function isSwitch(arg, platform) {
    return arg.startsWith('-') || (platform === 'win32' && /^\/(?!\/)/.test(arg));
}
/**
 * A `file:` URL (Linux desktop entries launch with `%U`, which may hand local files over as
 * URLs) → the local path; null for any other URL, a remote host or a malformed one.
 */
function fileUrlToPath(arg, platform = process.platform) {
    if (!/^file:/i.test(arg))
        return null;
    let url;
    try {
        url = new URL(arg);
    }
    catch {
        return null;
    }
    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    }
    catch {
        return null;
    }
    if (pathname.includes('\0'))
        return null;
    const host = url.hostname && url.hostname.toLowerCase() !== 'localhost' ? url.hostname : '';
    if (platform === 'win32') {
        const local = pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
        return host ? `\\\\${host}${local}` : local;
    }
    return host ? null : pathname;
}
/**
 * The files to open among `args` (positional arguments or 'open-file' paths): switches and
 * URLs other than `file:` dropped, `file:` URLs turned into paths, relative paths resolved
 * against `cwd`, then only EXISTING regular files that aren't excluded — normalized and
 * de-duplicated (platform case rules), in order, at most MAX_LAUNCH_FILES. Any extension: a
 * linked note can be any text file, and main refuses a binary one when it links it.
 */
function openTargets(args, opts) {
    const platform = opts.platform ?? process.platform;
    const mod = pathModule(platform);
    const excluded = new Set((opts.exclude ?? []).filter((p) => typeof p === 'string' && p.trim()).map((p) => (0, linkedNotesLogic_1.linkedPathKey)(mod.resolve(opts.cwd, p), platform)));
    const seen = new Set();
    const out = [];
    for (const arg of args) {
        if (out.length >= exports.MAX_LAUNCH_FILES)
            break;
        if (typeof arg !== 'string' || !arg.trim() || arg.includes('\0') || isSwitch(arg, platform))
            continue;
        let candidate = arg;
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg))
            candidate = fileUrlToPath(arg, platform); // a URL: only file:
        if (!candidate)
            continue;
        const absolute = mod.resolve(opts.cwd, candidate);
        const key = (0, linkedNotesLogic_1.linkedPathKey)(absolute, platform);
        if (excluded.has(key) || seen.has(key))
            continue;
        if (!opts.isFile(absolute))
            continue;
        seen.add(key);
        out.push(absolute);
    }
    return out;
}
/**
 * The files to open from a launch's argv (`process.argv` of this process, or the argv of a
 * 'second-instance'): argv[0] is the executable; in dev / e2e (`defaultApp`) the first
 * positional argument is the app path. Chromium puts the switches of a forwarded argv BEFORE
 * the positional arguments, so "first positional" is counted after dropping switches.
 */
function launchFilePaths(argv, opts) {
    const platform = opts.platform ?? process.platform;
    const positional = argv.slice(1).filter((a) => typeof a === 'string' && !!a.trim() && !isSwitch(a, platform));
    return openTargets(opts.defaultApp ? positional.slice(1) : positional, opts);
}
/**
 * The pending files of one batch, each once (platform case rules), in order. The same file can
 * be queued twice (opened again while a slow startup was still loading the registry, or in our
 * own argv AND a 'second-instance'): linking it twice would consume its single-use grant on the
 * first copy and report the second as `notGranted`.
 */
function uniqueOpenPaths(paths, platform = process.platform) {
    const seen = new Set();
    const out = [];
    for (const p of paths) {
        if (typeof p !== 'string' || !p.trim())
            continue;
        const key = (0, linkedNotesLogic_1.linkedPathKey)(p, platform);
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(p);
    }
    return out;
}
/**
 * Relaunch args (a launch that arrived while quitting, relaunched after exit): a RELATIVE
 * argument naming an existing file is made absolute against the launching process's
 * directory — the relaunched process starts in ours. Everything else is kept as is.
 */
function absolutizeFileArgs(args, cwd, isFile, platform = process.platform) {
    const mod = pathModule(platform);
    return args.map((arg) => {
        if (!arg || isSwitch(arg, platform) || mod.isAbsolute(arg) || /^[a-z][a-z0-9+.-]*:/i.test(arg))
            return arg;
        const absolute = mod.resolve(cwd, arg);
        return isFile(absolute) ? absolute : arg;
    });
}
