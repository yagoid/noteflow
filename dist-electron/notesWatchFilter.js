"use strict";
// Pure helpers for the notes-dir watcher (startNotesWatcher in main.ts) and the
// conditional note writes (applyNoteWrite). Covered by tests/electron/notesWatchFilter.test.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnNoteWrites = exports.OWN_WRITE_TTL_MS = exports.GROUPS_METADATA_FILES = void 0;
exports.isGroupsMetadataFile = isGroupsMetadataFile;
exports.contentHash = contentHash;
exports.settleNoteDirEvents = settleNoteDirEvents;
exports.sameNoteFileText = sameNoteFileText;
exports.changedExpectedFiles = changedExpectedFiles;
const node_crypto_1 = require("node:crypto");
/**
 * Root-level metadata files that groupsStore.loadGroups() reads. An external
 * write to any of them (the CLI creating/renaming/deleting a group or folder)
 * must reach the renderer, or its next group action would rewrite the whole
 * list from memory and undo it.
 */
exports.GROUPS_METADATA_FILES = ['groups.json', 'folders.json', 'note-order.json'];
/**
 * Is this watcher path (relative to the notes dir, forward slashes) one of the
 * groups metadata files? Only exact root-level names match: a temp file of an
 * atomic tmp+rename write is ignored, and the final rename reports the real name.
 */
function isGroupsMetadataFile(rel) {
    return exports.GROUPS_METADATA_FILES.includes(rel);
}
// ── Echoes of the app's own note writes (applyNoteWrite) ─────────────────────
//
// The watcher used to ignore EVERY event of a note folder for 1.5 s after the app
// wrote it (a time window). With the editor saving ~400 ms after each keystroke,
// a folder being typed in was blind for ~2 s after the last key: a CLI write landing
// then (`noteflow add`, an agent's `task finish`) was taken for our own echo, never
// reached the editor, and the next keystroke overwrote it. Now main remembers WHAT
// it wrote to each file (a hash) and, when the folder's events settle, compares the
// disk with it: the same bytes are our echo; anything else is an external change.
const NOTE_MD_FILE = 'note.md';
/** Hash of a file's bytes: a string is hashed as the UTF-8 that writeFileSync puts on disk. */
function contentHash(content) {
    return (0, node_crypto_1.createHash)('sha1').update(content).digest('hex');
}
/** How long a recorded write is remembered (only bounds memory: a matching disk is our echo whenever it is seen). */
exports.OWN_WRITE_TTL_MS = 60000;
/**
 * What the app last wrote to each note file ('<dir>/<file>', forward slashes),
 * to tell the watcher's events of its own writes from external ones by content.
 */
class OwnNoteWrites {
    constructor(ttlMs = exports.OWN_WRITE_TTL_MS) {
        this.ttlMs = ttlMs;
        this.files = new Map();
        this.dirs = new Map(); // note dir → time of our last write to it
        this.lastPrune = 0;
    }
    /** We are writing `content` to `<dir>/<file>` (null: deleting it). Call it right before the disk changes. */
    record(dir, file, content, now) {
        this.prune(now);
        this.files.set(`${dir}/${file}`, { hash: content === null ? null : contentHash(content), at: now });
        this.dirs.set(dir, now);
    }
    /** Did we write the folder `dir` in the last `withinMs`? */
    wroteDirWithin(dir, withinMs, now) {
        const at = this.dirs.get(dir);
        return at !== undefined && now - at <= withinMs;
    }
    /** Do we remember a write to `dir` (any of its files)? */
    knowsDir(dir, now) {
        return this.wroteDirWithin(dir, this.ttlMs, now);
    }
    /**
     * Is the disk content of `rel` (null = missing) our own last write to it? An
     * unknown or expired file is not. A file found different is forgotten: the
     * disk is no longer ours, so a later event bringing back our old bytes (a pull
     * restoring them) is external too.
     */
    isEcho(rel, disk, now) {
        const own = this.files.get(rel);
        if (!own || now - own.at > this.ttlMs)
            return false;
        if (own.hash === (disk === null ? null : contentHash(disk)))
            return true;
        this.files.delete(rel);
        return false;
    }
    /** Entries recorded (tests). */
    get size() {
        return this.files.size;
    }
    prune(now) {
        if (now - this.lastPrune < this.ttlMs / 6)
            return;
        this.lastPrune = now;
        for (const [rel, own] of this.files)
            if (now - own.at > this.ttlMs)
                this.files.delete(rel);
        for (const [dir, at] of this.dirs)
            if (now - at > this.ttlMs)
                this.dirs.delete(dir);
    }
}
exports.OwnNoteWrites = OwnNoteWrites;
/**
 * The settled events of one note folder (`rels`: '<dir>' and/or '<dir>/<file>.md'
 * paths, gathered by the watcher's per-folder debounce), judged against our own
 * writes once the writes settled. `read` gives a file's bytes now (null = missing).
 * - each file whose disk content is not our last write to it is external
 *   (`externalFiles`, which feed the live catch-up);
 * - an event of the folder itself is external unless we wrote that folder and its
 *   note.md is still there (a deleted or new-from-elsewhere folder is not ours).
 * `external`: the folder must be reloaded by the windows.
 */
function settleNoteDirEvents(own, dir, rels, read, now) {
    const externalFiles = [];
    let dirExternal = false;
    for (const rel of rels) {
        if (rel === dir) {
            if (!dirExternal)
                dirExternal = !own.knowsDir(dir, now) || read(`${dir}/${NOTE_MD_FILE}`) === null;
        }
        else if (!own.isEcho(rel, read(rel), now)) {
            externalFiles.push(rel);
        }
    }
    return { external: dirExternal || externalFiles.length > 0, externalFiles };
}
// ── Conditional note writes (applyNoteWrite's `expectFiles`) ─────────────────
/** Text compare of a note file as the renderer reads it: BOM and CRLF don't count, a missing file reads as empty. */
function sameNoteFileText(disk, expected) {
    const norm = (s) => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    return disk === expected || norm(disk ?? '') === norm(expected);
}
/**
 * The files of `expect` (file → the content the renderer's copy believes is on
 * disk) whose disk text (`read`, null = missing) is another one. Empty = the
 * conditional write may go ahead.
 */
function changedExpectedFiles(expect, read) {
    return Object.entries(expect).filter(([file, text]) => !sameNoteFileText(read(file), text)).map(([file]) => file);
}
