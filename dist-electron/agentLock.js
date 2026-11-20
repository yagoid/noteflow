"use strict";
// Agent tasks — the lock between processes and the atomic write, on the app's
// side. The CLI (`noteflow task …`, the heartbeat of `noteflow run`) and this
// app write the same files of a note folder (agent.md above all); every one of
// them takes the SAME lock around read → modify → write, and replaces the file
// in one step. The contract is the CLI's (cli/noteflow.js, "the lock between
// processes"), kept identical here:
//
//   file     <CLI settings dir>/agent-locks/<encodeURIComponent(note folder)>.lock
//            The CLI's settings dir, NOT this app's userData: `%APPDATA%\noteflow`
//            on Windows, `$XDG_CONFIG_HOME/noteflow` or `~/.config/noteflow`
//            elsewhere (macOS too) — also under `npm run dev`, whose userData is
//            another folder. Outside the notes dir: nothing syncs or watches it.
//   taken    by creating it exclusively ('wx'); one JSON line { pid, host, at, token }
//   stale    `at` older than 60 s (the file's mtime while the JSON is not there
//            yet), or — same host — no process with that pid. Removed only if its
//            content is still the one that was judged, then tried again.
//   busy     retried every 25 ms. The CLI waits up to 10 s; the app a short
//            while (AGENT_LOCK_APP_WAIT_MS) and WITHOUT blocking the main
//            process: the wait is asynchronous, only the critical section is not.
//   released by deleting the file, only while it still holds our token.
//
// Everything is injected (AgentLockEnv), so the rules are tested with a fake
// disk and, against the CLI's own functions, with the real one
// (tests/electron/agentLock.test.ts). Docs: .agents/context/patterns.md § CLI
// "Lock entre procesos + escritura atómica".
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ATOMIC_RENAME_PAUSE_MS = exports.ATOMIC_RENAME_ATTEMPTS = exports.AGENT_LOCK_APP_WAIT_MS = exports.AGENT_LOCK_RETRY_MS = exports.AGENT_LOCK_STALE_MS = void 0;
exports.agentLockDirFor = agentLockDirFor;
exports.agentLockPath = agentLockPath;
exports.tryAgentLock = tryAgentLock;
exports.releaseAgentLock = releaseAgentLock;
exports.withAgentLock = withAgentLock;
exports.atomicTempPath = atomicTempPath;
exports.writeFileAtomic = writeFileAtomic;
const path_1 = __importDefault(require("path"));
const cliConnectLogic_1 = require("./cliConnectLogic");
exports.AGENT_LOCK_STALE_MS = 60000;
exports.AGENT_LOCK_RETRY_MS = 25;
/** How long the app waits for a busy lock before giving up (a recoverable error). */
exports.AGENT_LOCK_APP_WAIT_MS = 2000;
/** Where the CLI keeps its locks on this machine — the same folder for the app, whatever its userData. */
function agentLockDirFor(platform, env, home) {
    const p = platform === 'win32' ? path_1.default.win32 : path_1.default.posix;
    return p.join(p.dirname((0, cliConnectLogic_1.cliSettingsPath)(platform, env, home)), 'agent-locks');
}
/** The lock file of a note folder (`dirname` = the folder's name). */
function agentLockPath(lockDir, dirname) {
    return path_1.default.join(lockDir, `${encodeURIComponent(dirname)}.lock`);
}
/** The text of a lock whose holder is gone, else null (also for a lock that is no longer there). */
function staleLockText(env, file) {
    let raw;
    let mtimeMs;
    try {
        raw = env.io.readText(file);
        mtimeMs = env.io.mtimeMs(file);
    }
    catch {
        return null;
    }
    let info = null;
    try {
        const parsed = JSON.parse(raw);
        info = parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch {
        info = null; // just created, not written yet: judged by its age
    }
    const at = info && typeof info.at === 'string' ? Date.parse(info.at) : NaN;
    if (env.now() - (Number.isFinite(at) ? at : mtimeMs) > exports.AGENT_LOCK_STALE_MS)
        return raw;
    if (info && info.host === env.host && Number.isInteger(info.pid) && !env.pidAlive(info.pid))
        return raw;
    return null;
}
/** ONE attempt at the lock of a note folder. Never waits, never throws. */
function tryAgentLock(env, dirname) {
    const file = agentLockPath(env.lockDir, dirname);
    try {
        env.io.mkdirp(env.lockDir);
    }
    catch (err) {
        return { status: 'unavailable', error: err instanceof Error ? err.message : String(err) };
    }
    const token = env.newToken();
    try {
        env.io.createExclusive(file, JSON.stringify({ pid: env.pid, host: env.host, at: new Date(env.now()).toISOString(), token }));
        return { status: 'taken', lock: { file, token } };
    }
    catch (err) {
        // Anything but "it exists" (EPERM on Windows while its holder deletes it…): busy, nothing to judge.
        if (err?.code !== 'EEXIST')
            return { status: 'busy', clearedStale: false };
    }
    const stale = staleLockText(env, file);
    if (stale === null)
        return { status: 'busy', clearedStale: false };
    // Removed only if it is still that very lock: another process may have taken it over meanwhile.
    let cleared = false;
    try {
        if (env.io.readText(file) === stale) {
            env.io.unlink(file);
            cleared = true;
        }
    }
    catch {
        // gone already, or not ours to remove
    }
    return { status: 'busy', clearedStale: cleared };
}
/** Lets go of a lock — only while the file still holds our token (taken over as stale: not ours to delete). */
function releaseAgentLock(env, lock) {
    try {
        const info = JSON.parse(env.io.readText(lock.file));
        if (info && typeof info === 'object' && info.token === lock.token)
            env.io.unlink(lock.file);
    }
    catch {
        // gone, or somebody else's by now
    }
}
/**
 * Runs `work` holding the lock of note folder `dirname`. `work` is SYNCHRONOUS
 * (read → change → write, nothing awaited under the lock); the wait for a busy
 * lock is not: it yields to the event loop between attempts (`sleep`), for at
 * most `waitMs`. A lock that stays busy — or a lock folder that cannot be
 * created — is an answer, not an exception: nothing ran, the caller may retry.
 * Whatever `work` throws is rethrown after the lock is released.
 */
async function withAgentLock(env, dirname, work, opts) {
    const deadline = env.now() + (opts.waitMs ?? exports.AGENT_LOCK_APP_WAIT_MS);
    for (;;) {
        const attempt = tryAgentLock(env, dirname);
        if (attempt.status === 'taken') {
            try {
                return { ok: true, value: work() };
            }
            finally {
                releaseAgentLock(env, attempt.lock);
            }
        }
        if (attempt.status === 'unavailable')
            return { ok: false, reason: 'unavailable', detail: attempt.error };
        if (env.now() >= deadline)
            return { ok: false, reason: 'busy' };
        // A stale lock just removed: take it now, without the pause.
        if (!attempt.clearedStale)
            await opts.sleep(exports.AGENT_LOCK_RETRY_MS);
    }
}
/** Attempts at the rename while a reader holds the file open (Windows): ~8 × 15 ms, then the error. */
exports.ATOMIC_RENAME_ATTEMPTS = 8;
exports.ATOMIC_RENAME_PAUSE_MS = 15;
const RENAME_RETRY_CODES = ['EPERM', 'EBUSY', 'EACCES'];
/** The temp file of an atomic write of `file`: a dot-name ending in .tmp, in the same folder — never a '*.md'. */
function atomicTempPath(file, pid, rand) {
    return path_1.default.join(path_1.default.dirname(file), `.${path_1.default.basename(file)}.${pid}.${rand}.tmp`);
}
/**
 * Replaces `file` with `text` in one step: written next to it and renamed over
 * it, so a reader (the CLI, a sync) sees the old file or the new one, never an
 * empty or half-written one. No enumerator of a note folder's '*.md' takes the
 * temp file for a section. On Windows the rename is retried — briefly: this
 * runs in the main process — while a reader holds the file open; then it
 * throws, with the temp file removed.
 */
function writeFileAtomic(io, file, text, pid, rand) {
    const tmp = atomicTempPath(file, pid, rand);
    io.writeText(tmp, text);
    for (let attempt = 1;; attempt++) {
        try {
            io.rename(tmp, file);
            return;
        }
        catch (err) {
            const code = err?.code ?? '';
            if (attempt >= exports.ATOMIC_RENAME_ATTEMPTS || !RENAME_RETRY_CODES.includes(code)) {
                try {
                    io.unlink(tmp);
                }
                catch {
                    // nothing to clean
                }
                throw err;
            }
            io.pause(exports.ATOMIC_RENAME_PAUSE_MS);
        }
    }
}
