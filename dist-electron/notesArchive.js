"use strict";
// Local archive of the synced notes — "use only the remote's notes" when the
// notes dir switches to another sync identity (syncOrigin.ts). NEVER deletes:
// the notes that would sync are MOVED out of the notes dir into
// `<archiveRoot>/<label>-<ISO with ':' → '-'>/`, so the pull that follows brings
// only the new remote's notes and nothing of the previous origin is uploaded.
// Backend-agnostic (GitHub today, NoteFlow Cloud later): the caller injects the
// archive root (main.ts: userData/notes-archive) and the label ('github-…',
// 'cloud-…'). No Electron imports; tested in tests/electron/notesArchive.test.ts.
//
// Layout of one archive:
//   <archiveDir>/manifest.json         origin, date, what was moved (for a future "restore")
//   <archiveDir>/notes/<noteDir>/…      the note folders, as they were
//   <archiveDir>/notes/<metadata>.json  the root metadata files, as they were
//
// What moves and what stays:
// - Note folders that sync (listSyncedNoteDirs). Local-only notes (localOnly:
//   true) stay; linked notes live outside the notes dir and are never seen.
// - Root metadata describing that set: groups, folders, note order, section
//   colours, templates, snippets — moved whole. groups/folders/note-order/
//   section-colors may ALSO describe notes that stay (a local-only note's group,
//   its place in the order, its sections' colours; a linked note's group or
//   folder): for those the original is archived complete and a FILTERED copy
//   with only the entries the remaining notes use is left in its place (none
//   used → no file left).
// - ui-settings.json is this device's appearance: COPIED into the archive and
//   left in place.
//
// Anti-loss: never a half state. Each item is renamed; across volumes (EXDEV) it
// is copied, verified byte for byte and only then removed from the source. Any
// failure undoes everything already done, in reverse order, and throws
// NotesArchiveError. If the undo itself fails nothing more is deleted: the
// error lists what stayed in the archive (where it is safe).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotesArchiveError = exports.ARCHIVE_MANIFEST = exports.COPIED_METADATA_FILES = exports.ARCHIVED_METADATA_FILES = void 0;
exports.archiveTimestamp = archiveTimestamp;
exports.archiveFolderName = archiveFolderName;
exports.filterMetadataForKept = filterMetadataForKept;
exports.collectKeptRefs = collectKeptRefs;
exports.archiveSyncedNotes = archiveSyncedNotes;
exports.listArchives = listArchives;
exports.hasArchives = hasArchives;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const noteFormat_1 = require("./noteFormat");
const localOnlyNotes_1 = require("./localOnlyNotes");
const syncOrigin_1 = require("./syncOrigin");
/** Root metadata files archived (moved) with the notes. */
exports.ARCHIVED_METADATA_FILES = [
    'groups.json',
    'folders.json',
    'section-colors.json',
    'note-order.json',
    'templates.json',
    'snippets.json',
];
/** Root files copied into the archive but left in place (device appearance). */
exports.COPIED_METADATA_FILES = ['ui-settings.json'];
exports.ARCHIVE_MANIFEST = 'manifest.json';
const ARCHIVE_NOTES_SUBDIR = 'notes';
const defaultOps = {
    rename: (from, to) => fs_1.default.renameSync(from, to),
    copy: (from, to) => fs_1.default.cpSync(from, to, { recursive: true, force: true, errorOnExist: false }),
    remove: (target) => fs_1.default.rmSync(target, { recursive: true }),
    writeFile: (file, content) => fs_1.default.writeFileSync(file, content, 'utf-8'),
};
class NotesArchiveError extends Error {
    constructor(message, 
    /** True when every step was undone (the notes dir is exactly as before). */
    rolledBack, 
    /** When the undo failed: what stayed where ("<original> → <archive copy>"). */
    stranded, archiveDir) {
        super(message);
        this.rolledBack = rolledBack;
        this.stranded = stranded;
        this.archiveDir = archiveDir;
        this.name = 'NotesArchiveError';
    }
}
exports.NotesArchiveError = NotesArchiveError;
// ── Labels and paths ──────────────────────────────────────────────────────────
/** '2026-11-16T10:20:30.000Z' → '2026-11-16T10-20-30.000Z' (folder-name safe on every OS). */
function archiveTimestamp(now) {
    return now.toISOString().replace(/:/g, '-');
}
/** Folder name of an archive: '<sanitized label>-<timestamp>'. */
function archiveFolderName(label, now) {
    return `${(0, syncOrigin_1.sanitizeLabel)(label)}-${archiveTimestamp(now)}`;
}
function isRecord(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}
/**
 * The part of a root metadata file the notes that stay still use, serialized
 * like main.ts writes it (2-space JSON) — or null when nothing is used or the
 * file can't be understood (then it is archived whole, nothing left behind).
 * Only groups/folders/note-order/section-colors can be filtered; the rest → null.
 */
function filterMetadataForKept(file, content, kept) {
    let data;
    try {
        data = JSON.parse(content);
    }
    catch {
        return null;
    }
    switch (file) {
        case 'groups.json':
        case 'folders.json': {
            if (!Array.isArray(data))
                return null;
            const ids = file === 'groups.json' ? kept.groupIds : kept.folderIds;
            const left = data.filter((item) => isRecord(item) && typeof item.id === 'string' && ids.has(item.id));
            return left.length > 0 ? JSON.stringify(left, null, 2) : null;
        }
        case 'note-order.json': {
            if (!isRecord(data))
                return null;
            const left = {};
            for (const [key, list] of Object.entries(data)) {
                if (!Array.isArray(list))
                    continue;
                const ids = list.filter((id) => typeof id === 'string' && kept.noteIds.has(id));
                if (ids.length > 0)
                    left[key] = ids;
            }
            return Object.keys(left).length > 0 ? JSON.stringify(left, null, 2) : null;
        }
        case 'section-colors.json': {
            if (!isRecord(data))
                return null;
            const left = {};
            for (const [key, value] of Object.entries(data)) {
                if (kept.sectionNames.has(key.trim().toLowerCase()))
                    left[key] = value;
            }
            return Object.keys(left).length > 0 ? JSON.stringify(left, null, 2) : null;
        }
        default:
            return null;
    }
}
/**
 * References of the notes that stay (`keptDirs`, parsed from disk) plus the
 * caller's extra refs (linked notes). A kept folder keeps its group too, read
 * from folders.json (`foldersJson`, may be null).
 */
function collectKeptRefs(notesDir, keptDirs, extra, foldersJson) {
    const kept = { noteIds: new Set(), groupIds: new Set(), folderIds: new Set(), sectionNames: new Set() };
    for (const dir of keptDirs) {
        const note = (0, noteFormat_1.parseNoteDir)(path_1.default.join(notesDir, dir));
        if (!note)
            continue;
        kept.noteIds.add(note.id);
        if (note.group)
            kept.groupIds.add(note.group);
        if (note.folder)
            kept.folderIds.add(note.folder);
        for (const s of note.sections)
            kept.sectionNames.add(s.name.trim().toLowerCase());
    }
    for (const id of extra?.groupIds ?? [])
        if (id)
            kept.groupIds.add(id);
    for (const id of extra?.folderIds ?? [])
        if (id)
            kept.folderIds.add(id);
    for (const id of extra?.noteIds ?? [])
        if (id)
            kept.noteIds.add(id);
    for (const name of extra?.sectionNames ?? []) {
        const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
        if (key)
            kept.sectionNames.add(key);
    }
    if (foldersJson !== null) {
        try {
            const folders = JSON.parse(foldersJson);
            if (Array.isArray(folders)) {
                for (const f of folders) {
                    if (isRecord(f) && typeof f.id === 'string' && kept.folderIds.has(f.id) && typeof f.groupId === 'string') {
                        kept.groupIds.add(f.groupId);
                    }
                }
            }
        }
        catch { /* unparseable: archived whole */ }
    }
    return kept;
}
// ── Moving with verification ──────────────────────────────────────────────────
function errCode(err) {
    return err?.code;
}
/** Relative paths + bytes of every file under `root` (a file root → ['']). */
function readTree(root) {
    const out = new Map();
    const walk = (abs, rel) => {
        const st = fs_1.default.statSync(abs);
        if (st.isDirectory()) {
            for (const name of fs_1.default.readdirSync(abs))
                walk(path_1.default.join(abs, name), rel ? `${rel}/${name}` : name);
        }
        else {
            out.set(rel, fs_1.default.readFileSync(abs));
        }
    };
    walk(root, '');
    return out;
}
/** Throws unless `copy` holds exactly the files of `original`, byte for byte. */
function verifySameTree(original, copy) {
    const a = readTree(original);
    const b = readTree(copy);
    if (a.size !== b.size)
        throw new Error(`copy of ${original} is incomplete`);
    for (const [rel, bytes] of a) {
        const other = b.get(rel);
        if (!other || !other.equals(bytes))
            throw new Error(`copy of ${original} differs at "${rel || path_1.default.basename(original)}"`);
    }
}
/**
 * Moves a file or folder. Same volume: one rename. Across volumes (EXDEV):
 * copy → verify → remove the source; a failed copy leaves the source intact (the
 * partial copy is dropped), a failed removal restores the source from the
 * verified copy before throwing. Throws when it couldn't move; if even the
 * restore failed, the thrown error carries `stranded` (data kept in `to`).
 */
function moveItem(from, to, ops) {
    try {
        ops.rename(from, to);
        return;
    }
    catch (err) {
        if (errCode(err) !== 'EXDEV')
            throw err;
    }
    try {
        ops.copy(from, to);
        verifySameTree(from, to);
    }
    catch (err) {
        try {
            ops.remove(to);
        }
        catch { /* partial copy of an intact source */ }
        throw err;
    }
    try {
        ops.remove(from);
    }
    catch (err) {
        // The source may be half removed: put it back from the verified copy.
        try {
            ops.copy(to, from);
            verifySameTree(to, from);
            try {
                ops.remove(to);
            }
            catch { /* duplicate left in the archive — harmless */ }
        }
        catch {
            const stranded = new Error(`could not finish moving ${from}; a complete copy is in ${to}`);
            stranded.stranded = `${from} → ${to}`;
            throw stranded;
        }
        throw err;
    }
}
/** Undoes `steps` in reverse. Returns what could not be put back ("<original> → <archive>"). */
function rollback(steps, ops) {
    const stranded = [];
    for (const step of [...steps].reverse()) {
        try {
            if (step.kind === 'move') {
                // A filtered remainder may sit at `from`: a file rename replaces it
                // atomically (and the EXDEV path copies over it).
                moveItem(step.to, step.from, ops);
            }
            else if (step.kind === 'copy') {
                ops.remove(step.to); // a duplicate of a file that never moved
            }
            // 'write' (filtered remainder): replaced by the move-back of its original.
        }
        catch (err) {
            if (step.kind === 'move') {
                stranded.push(err.stranded ?? `${step.from} → ${step.to}`);
            }
        }
    }
    return stranded;
}
function readNoteId(notesDir, dir) {
    try {
        const md = fs_1.default.readFileSync(path_1.default.join(notesDir, dir, noteFormat_1.NOTE_MD), 'utf-8');
        const m = md.match(/^id:[ \t]*['"]?([^'"\r\n]+?)['"]?[ \t]*$/m);
        return m ? m[1] : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Moves every synced note folder and the metadata describing them out of the
 * notes dir into a new archive folder (see the module comment). Synchronous on
 * purpose: nothing else in the main process can write the notes dir while it
 * runs. Throws NotesArchiveError — after undoing everything — on any failure,
 * including a notes dir that can't be listed (nothing is moved then).
 */
function archiveSyncedNotes(opts) {
    const ops = { ...defaultOps, ...opts.fsOps };
    const now = opts.now ?? new Date();
    const label = (0, syncOrigin_1.sanitizeLabel)(opts.label);
    const notesDir = opts.notesDir;
    let entries;
    try {
        entries = fs_1.default.readdirSync(notesDir); // listNoteDirs would swallow a failure into "no notes"
    }
    catch (err) {
        throw new NotesArchiveError(`cannot read the notes folder: ${String(err)}`, true, []);
    }
    const synced = (0, localOnlyNotes_1.listSyncedNoteDirs)(notesDir);
    const syncedSet = new Set(synced);
    const keptDirs = entries.filter((name) => !syncedSet.has(name) && fs_1.default.existsSync(path_1.default.join(notesDir, name, noteFormat_1.NOTE_MD)));
    const movedNoteIds = synced.map((dir) => readNoteId(notesDir, dir)).filter((id) => !!id);
    const readRoot = (file) => {
        try {
            return fs_1.default.readFileSync(path_1.default.join(notesDir, file), 'utf-8');
        }
        catch {
            return null;
        }
    };
    const kept = collectKeptRefs(notesDir, keptDirs, opts.keep, readRoot('folders.json'));
    // Unique archive folder (two switches in the same millisecond, or a clock step back).
    let archiveDir = path_1.default.join(opts.archiveRoot, archiveFolderName(label, now));
    for (let n = 2; fs_1.default.existsSync(archiveDir); n++) {
        archiveDir = path_1.default.join(opts.archiveRoot, `${archiveFolderName(label, now)}-${n}`);
    }
    const archivedNotes = path_1.default.join(archiveDir, ARCHIVE_NOTES_SUBDIR);
    try {
        fs_1.default.mkdirSync(archivedNotes, { recursive: true });
    }
    catch (err) {
        throw new NotesArchiveError(`cannot create the archive folder: ${String(err)}`, true, []);
    }
    const steps = [];
    const movedDirs = [];
    const movedFiles = [];
    const filteredFiles = [];
    const copiedFiles = [];
    try {
        for (const dir of synced) {
            const from = path_1.default.join(notesDir, dir);
            const to = path_1.default.join(archivedNotes, dir);
            moveItem(from, to, ops);
            steps.push({ kind: 'move', from, to, label: dir });
            movedDirs.push(dir);
        }
        for (const file of exports.ARCHIVED_METADATA_FILES) {
            const from = path_1.default.join(notesDir, file);
            const content = readRoot(file);
            if (content === null && !fs_1.default.existsSync(from))
                continue;
            const to = path_1.default.join(archivedNotes, file);
            moveItem(from, to, ops);
            steps.push({ kind: 'move', from, to, label: file });
            movedFiles.push(file);
            const remainder = content === null ? null : filterMetadataForKept(file, content, kept);
            if (remainder !== null) {
                ops.writeFile(from, remainder);
                steps.push({ kind: 'write', file: from });
                filteredFiles.push(file);
            }
        }
        for (const file of exports.COPIED_METADATA_FILES) {
            const from = path_1.default.join(notesDir, file);
            if (!fs_1.default.existsSync(from))
                continue;
            const to = path_1.default.join(archivedNotes, file);
            ops.copy(from, to);
            steps.push({ kind: 'copy', to });
            verifySameTree(from, to);
            copiedFiles.push(file);
        }
        const manifest = {
            version: 1,
            createdAt: now.toISOString(),
            label,
            ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
            notesDir,
            movedDirs,
            movedFiles,
            filteredFiles,
            copiedFiles,
        };
        ops.writeFile(path_1.default.join(archiveDir, exports.ARCHIVE_MANIFEST), JSON.stringify(manifest, null, 2));
    }
    catch (err) {
        const immediate = err.stranded;
        const stranded = [...(immediate ? [immediate] : []), ...rollback(steps, ops)];
        if (stranded.length === 0) {
            // Everything is back: drop the (now empty) archive folder — non-recursive,
            // so anything unexpected left in it stays.
            try {
                fs_1.default.rmSync(path_1.default.join(archiveDir, exports.ARCHIVE_MANIFEST), { force: true });
            }
            catch { /* ignore */ }
            try {
                fs_1.default.rmdirSync(archivedNotes);
            }
            catch { /* not empty: keep */ }
            try {
                fs_1.default.rmdirSync(archiveDir);
            }
            catch { /* not empty: keep */ }
        }
        throw new NotesArchiveError(`could not archive the local notes: ${err instanceof Error ? err.message : String(err)}`, stranded.length === 0, stranded, stranded.length === 0 ? undefined : archiveDir);
    }
    return { archiveDir, movedDirs, movedNoteIds, movedFiles, filteredFiles, copiedFiles };
}
/** Archives under `archiveRoot` (folders with a manifest), newest first. Missing root → []. */
function listArchives(archiveRoot) {
    let names;
    try {
        names = fs_1.default.readdirSync(archiveRoot);
    }
    catch {
        return [];
    }
    const out = [];
    for (const name of names) {
        const dir = path_1.default.join(archiveRoot, name);
        try {
            const manifest = JSON.parse(fs_1.default.readFileSync(path_1.default.join(dir, exports.ARCHIVE_MANIFEST), 'utf-8'));
            out.push({
                name,
                dir,
                ...(typeof manifest.createdAt === 'string' ? { createdAt: manifest.createdAt } : {}),
                ...(typeof manifest.label === 'string' ? { label: manifest.label } : {}),
            });
        }
        catch { /* not an archive (or still being written) */ }
    }
    return out.sort((a, b) => (b.createdAt ?? b.name).localeCompare(a.createdAt ?? a.name));
}
function hasArchives(archiveRoot) {
    return listArchives(archiveRoot).length > 0;
}
