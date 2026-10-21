"use strict";
// Disk side of the conflict copies, shared by both sync backends (cloudSync.ts
// and githubSync.ts). The DECISION (planConflictCopy) and the copy's content
// (buildConflictCopy, conflictCopyTitle, anchorTitle) are pure in
// cloudSyncLogic.ts; this module only reads the local folder, writes the copy
// as a new note folder and keeps the session notice. No Electron imports.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFLICT_COPY_TITLES_MAX = void 0;
exports.appendConflictCopyNotice = appendConflictCopyNotice;
exports.writeConflictCopy = writeConflictCopy;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const noteFormat_1 = require("./noteFormat");
const cloudSyncLogic_1 = require("./cloudSyncLogic");
exports.CONFLICT_COPY_TITLES_MAX = 10;
/** The notice after one more copy titled `title` at `at` (accumulates until dismissed). */
function appendConflictCopyNotice(prev, title, at) {
    return {
        count: (prev?.count ?? 0) + 1,
        titles: [...(prev?.titles ?? []), title].slice(-exports.CONFLICT_COPY_TITLES_MAX),
        at,
    };
}
/**
 * Writes the conflict copy of the LOCAL note folder '<dir>' — the WHOLE folder
 * (every section), so it opens as the complete local version of the note — as
 * a new note folder with a fresh id and the title '<title> (<label> <date>)'
 * (buildConflictCopy). `label` is the localized "conflict copy". The copy's
 * folder is created non-recursively (never writes into a folder that appeared
 * meanwhile); a half-written copy is removed again and the error THROWN, so
 * the caller must then leave the original folder untouched.
 */
function writeConflictCopy(notesDir, dir, label, now) {
    const localDirPath = path_1.default.join(notesDir, dir);
    const localFiles = {};
    for (const f of fs_1.default.readdirSync(localDirPath)) {
        if (f.endsWith('.md'))
            localFiles[f] = fs_1.default.readFileSync(path_1.default.join(localDirPath, f), 'utf-8');
    }
    const title = (0, cloudSyncLogic_1.conflictCopyTitle)((0, cloudSyncLogic_1.anchorTitle)(localFiles[noteFormat_1.NOTE_MD] ?? ''), label, now);
    let copy = (0, cloudSyncLogic_1.buildConflictCopy)(localFiles, { newId: (0, noteFormat_1.newNoteId)(), title, nowIso: now.toISOString() });
    while (fs_1.default.existsSync(path_1.default.join(notesDir, copy.dir))) {
        copy = (0, cloudSyncLogic_1.buildConflictCopy)(localFiles, { newId: (0, noteFormat_1.newNoteId)(), title, nowIso: now.toISOString() });
    }
    const copyPath = path_1.default.join(notesDir, copy.dir);
    let created = false;
    try {
        fs_1.default.mkdirSync(copyPath); // not recursive: never writes into a folder that appeared meanwhile
        created = true;
        for (const [name, content] of Object.entries(copy.files)) {
            fs_1.default.writeFileSync(path_1.default.join(copyPath, name), content, 'utf-8');
        }
    }
    catch (err) {
        // A half-written copy would show up as a broken note: remove it (only if
        // this call created it). The original folder is left untouched.
        if (created) {
            try {
                fs_1.default.rmSync(copyPath, { recursive: true, force: true });
            }
            catch { /* best effort */ }
        }
        throw err;
    }
    return { dir: copy.dir, dirPath: copyPath, title, files: copy.files };
}
