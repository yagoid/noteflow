"use strict";
// Content of the Cloud sync BASES of section files (see SyncState.bases), so
// the three-way pull can merge a section both sides changed line by line
// against the version this device last reconciled (diff3 —
// mergeSectionText). A base only remembers {seq, hash}; this store keeps the
// text behind the hash: one file per hash (content-addressed — the name IS
// sha-256 of the content, which is hashForBase of a section), in a directory
// next to the sync state (userData/cloud-base-content/). A missing or corrupt
// blob only means "base content unknown" → the merge falls back to the
// two-way union; nothing here can lose a note. No Electron imports (the
// caller passes the directory), so it is testable on its own.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeBaseBlob = writeBaseBlob;
exports.readBaseBlob = readBaseBlob;
exports.pruneBaseBlobs = pruneBaseBlobs;
exports.clearBaseBlobs = clearBaseBlobs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const HASH_RE = /^[0-9a-f]{64}$/;
function sha256(content) {
    return (0, crypto_1.createHash)('sha256').update(content, 'utf8').digest('hex');
}
/** Stores `content` under its hash (no-op when already there). Best effort: a failure only loses the diff3. */
function writeBaseBlob(dir, content) {
    const hash = sha256(content);
    const file = path_1.default.join(dir, hash);
    try {
        if (fs_1.default.existsSync(file))
            return;
        fs_1.default.mkdirSync(dir, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        fs_1.default.writeFileSync(tmp, content, 'utf-8');
        fs_1.default.renameSync(tmp, file);
    }
    catch (err) {
        console.warn('[CloudSync] could not store a base content blob:', String(err));
    }
}
/** The content stored under `hash`, or null (unknown hash, missing or corrupt blob). */
function readBaseBlob(dir, hash) {
    if (!HASH_RE.test(hash))
        return null;
    try {
        const content = fs_1.default.readFileSync(path_1.default.join(dir, hash), 'utf-8');
        return sha256(content) === hash ? content : null;
    }
    catch {
        return null;
    }
}
/** Removes every blob (and leftover temp file) whose hash is not in `keep`. Returns how many went. */
function pruneBaseBlobs(dir, keep) {
    let names;
    try {
        names = fs_1.default.readdirSync(dir);
    }
    catch {
        return 0; // no store yet
    }
    let removed = 0;
    for (const name of names) {
        if (HASH_RE.test(name) && keep.has(name))
            continue;
        try {
            fs_1.default.unlinkSync(path_1.default.join(dir, name));
            removed++;
        }
        catch { /* gone meanwhile */ }
    }
    return removed;
}
/** Drops the whole store (account switch: every base belonged to the previous account). */
function clearBaseBlobs(dir) {
    try {
        fs_1.default.rmSync(dir, { recursive: true, force: true });
    }
    catch (err) {
        console.warn('[CloudSync] could not clear the base content store:', String(err));
    }
}
