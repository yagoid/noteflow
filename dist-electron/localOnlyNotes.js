"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_ONLY_KEY = void 0;
exports.isLocalOnlyNoteMd = isLocalOnlyNoteMd;
exports.noteDirOfSyncPath = noteDirOfSyncPath;
exports.isLocalOnlyDir = isLocalOnlyDir;
exports.isLocalOnlySyncPath = isLocalOnlySyncPath;
exports.listSyncedNoteDirs = listSyncedNoteDirs;
exports.primeLocalOnlyDirs = primeLocalOnlyDirs;
exports.resetLocalOnlyMemory = resetLocalOnlyMemory;
/**
 * localOnlyNotes.ts — notes that never leave this device.
 *
 * A note whose anchor (`note.md`) carries `localOnly: true` in its frontmatter
 * is skipped by EVERY sync path of both backends (GitHub Sync and NoteFlow
 * Cloud): no push, no journal entry, no remote delete, no catch-up upload, no
 * mirror, and the GitHub pull's deletion rule never removes it (it is absent
 * from the remote by design). Today only the first-run welcome note
 * (welcomeNote.ts) is created with the flag; the user cannot set it. It stays
 * local-only for as long as the anchor keeps the key (editing the note keeps
 * it: the three format mirrors round-trip `localOnly`).
 *
 * The flag lives in the note itself, so it survives restarts and is honoured by
 * the CLI too (its own mirror of `isLocalOnlyAnchor` in cli/noteflow.js).
 *
 * Deletions: once a note folder is removed from disk its anchor can no longer
 * be read, so every positive answer is remembered in memory (`knownLocalOnly`)
 * and answers for a folder that is gone. main.ts primes the set at startup
 * (`primeLocalOnlyDirs`), so deleting the welcome note in a later session does
 * not reach the remote either.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const noteFormat_1 = require("./noteFormat");
/** Frontmatter key of the flag (top level of note.md). */
exports.LOCAL_ONLY_KEY = 'localOnly';
// Only an UNQUOTED YAML boolean true (true/True/TRUE — what js-yaml reads as
// `true`): the parsers keep the flag only when it is the boolean, so a quoted
// "true" (a string) must not exclude the note from sync either.
const LOCAL_ONLY_LINE = /^localOnly:[ \t]*(?:true|True|TRUE)[ \t]*(?:#.*)?$/m;
/**
 * Pure: whether a note.md declares `localOnly: true`. Only the TOP-LEVEL key of
 * the frontmatter counts (section entries are indented; a `localOnly:` line in
 * a body never matches because only the frontmatter is inspected).
 */
function isLocalOnlyNoteMd(noteMd) {
    const { frontmatter } = (0, noteFormat_1.splitFrontmatter)(noteMd);
    if (!frontmatter)
        return false;
    return LOCAL_ONLY_LINE.test(frontmatter);
}
/**
 * Pure: the note folder a notes-dir-relative sync path belongs to
 * ('<dir>/<file>' → '<dir>'), or null for a root file (metadata JSONs, the
 * format marker) — those always sync.
 */
function noteDirOfSyncPath(relPath) {
    const normalized = relPath.replace(/\\/g, '/');
    const slash = normalized.indexOf('/');
    if (slash <= 0)
        return null;
    return normalized.slice(0, slash);
}
// Folders seen with the flag. Answers for a folder whose anchor is gone
// (deleted note) — see the module comment.
const knownLocalOnly = new Set();
/**
 * Whether the note folder `dir` is local-only. Reads its anchor when it exists
 * (and refreshes the memory either way); falls back to the memory when it can't
 * be read (folder just deleted).
 */
function isLocalOnlyDir(notesDir, dir) {
    let noteMd;
    try {
        noteMd = fs_1.default.readFileSync(path_1.default.join(notesDir, dir, noteFormat_1.NOTE_MD), 'utf-8');
    }
    catch {
        return knownLocalOnly.has(dir);
    }
    const localOnly = isLocalOnlyNoteMd(noteMd);
    if (localOnly)
        knownLocalOnly.add(dir);
    else
        knownLocalOnly.delete(dir);
    return localOnly;
}
/**
 * Whether a notes-dir-relative FILE path ('<dir>/<file>') is under a local-only
 * note. Root files are never local-only. For a whole folder use isLocalOnlyDir.
 */
function isLocalOnlySyncPath(notesDir, relPath) {
    if (!notesDir)
        return false;
    const dir = noteDirOfSyncPath(relPath);
    if (!dir)
        return false;
    return isLocalOnlyDir(notesDir, dir);
}
/** listNoteDirs minus the local-only notes: the folders sync may upload or reconcile. */
function listSyncedNoteDirs(notesDir) {
    return (0, noteFormat_1.listNoteDirs)(notesDir).filter((dir) => !isLocalOnlyDir(notesDir, dir));
}
/** Startup hook (main.ts): remembers every local-only folder on disk. */
function primeLocalOnlyDirs(notesDir) {
    for (const dir of (0, noteFormat_1.listNoteDirs)(notesDir))
        isLocalOnlyDir(notesDir, dir);
}
/** Test hook: forgets the in-memory set. */
function resetLocalOnlyMemory() {
    knownLocalOnly.clear();
}
