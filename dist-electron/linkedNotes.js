"use strict";
// Linked notes — IO half (main process). Pure logic in linkedNotesLogic.ts; the
// design and invariants are in .agents/context/patterns.md § "Notas vinculadas":
//   - the linked file is NEVER deleted or moved by any code path (unlink only
//     drops the registry entry, its cache and its draft);
//   - a write only happens if the disk still holds the version the edit was
//     based on (hash), atomically (tmp in the same folder + rename), keeping BOM,
//     line endings, final newline and YAML frontmatter byte-exact;
//   - nothing of NoteFlow is ever written into the file;
//   - registry + content cache + drafts live in userData, never in the notes dir
//     (so no sync backend, export, CLI or notes-dir watcher can ever see them).
//
// Every read of a linked file is ASYNC (fs.promises): a file on a network drive
// that stopped answering must not hang the main process at startup, on window
// focus or on a write. Reads and writes of one note run one after another
// (`serial`), so a watcher re-read never interleaves with a write.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__test = void 0;
exports.init = init;
exports.list = list;
exports.get = get;
exports.isLinkedPath = isLinkedPath;
exports.link = link;
exports.relocate = relocate;
exports.unlink = unlink;
exports.updateMeta = updateMeta;
exports.writeBody = writeBody;
exports.setDraft = setDraft;
exports.saveAsset = saveAsset;
exports.resolveAsset = resolveAsset;
exports.assetDataUri = assetDataUri;
exports.recheck = recheck;
exports.mergeNoteOrder = mergeNoteOrder;
exports.splitNoteOrder = splitNoteOrder;
exports.adoptLinkedIdsFromSynced = adoptLinkedIdsFromSynced;
exports.aiNotes = aiNotes;
exports.aiNote = aiNote;
exports.aiIndexKey = aiIndexKey;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const linkedNotesLogic_1 = require("./linkedNotesLogic");
const fsp = fs_1.default.promises;
let options = null;
let records = [];
let localOrder = {};
const runtime = new Map();
const drafts = new Map();
const platform = process.platform;
// ── Per-note serial queue (reads/writes of one note never interleave) ────────
const tails = new Map();
function serial(id, task) {
    const prev = tails.get(id) ?? Promise.resolve();
    const result = prev.then(task, task);
    const tail = result.then(() => undefined, () => undefined);
    tails.set(id, tail);
    void tail.then(() => { if (tails.get(id) === tail)
        tails.delete(id); });
    return result;
}
// ── Persistence (userData) ───────────────────────────────────────────────────
function registryFile() {
    return path_1.default.join(options.userDataDir, 'linked-notes.json');
}
function cacheDir() {
    return path_1.default.join(options.userDataDir, 'linked-notes-cache');
}
function cacheFile(id) {
    return path_1.default.join(cacheDir(), (0, linkedNotesLogic_1.linkedCacheFileName)(id));
}
function draftFile(id) {
    return path_1.default.join(cacheDir(), (0, linkedNotesLogic_1.linkedDraftFileName)(id));
}
/** tmp + rename (no secrets here, unlike settings.json). The tmp never outlives a failure. */
function writeAtomic(file, data) {
    fs_1.default.mkdirSync(path_1.default.dirname(file), { recursive: true });
    const tmp = `${file}.${(0, crypto_1.randomBytes)(4).toString('hex')}.tmp`;
    try {
        fs_1.default.writeFileSync(tmp, data);
        fs_1.default.renameSync(tmp, file);
    }
    catch (err) {
        try {
            fs_1.default.rmSync(tmp, { force: true });
        }
        catch { /* ignore */ }
        throw err;
    }
}
function saveRegistry() {
    try {
        writeAtomic(registryFile(), JSON.stringify({ version: 1, notes: records, order: localOrder }, null, 2));
    }
    catch (err) {
        console.error('[linked] failed to save linked-notes.json:', String(err));
    }
}
function readCache(id) {
    try {
        return fs_1.default.readFileSync(cacheFile(id), 'utf-8');
    }
    catch {
        return null;
    }
}
function writeCache(id, body) {
    try {
        writeAtomic(cacheFile(id), body);
    }
    catch (err) {
        console.error('[linked] failed to cache linked note:', String(err));
    }
}
function readDraft(id) {
    try {
        return (0, linkedNotesLogic_1.sanitizeLinkedDraft)(JSON.parse(fs_1.default.readFileSync(draftFile(id), 'utf-8')));
    }
    catch {
        return null;
    }
}
/**
 * A write "consumes" the draft only when it wrote the draft's own content (the
 * window that held it saving it). Any other write — the agent, another window, a
 * "Keep my version" elsewhere — leaves it: a window still holding unwritten edits
 * keeps them across a restart.
 */
function consumeDraft(id, body, written) {
    const draft = drafts.get(id);
    if (draft && (draft.body === body || draft.body === written))
        deleteDraft(id);
}
function deleteDraft(id) {
    drafts.delete(id);
    try {
        fs_1.default.rmSync(draftFile(id), { force: true });
    }
    catch { /* ignore */ }
}
/** Symlinks are written through to their target (a rename would replace the link itself). */
async function realTarget(filePath) {
    try {
        return await fsp.realpath(filePath);
    }
    catch {
        return filePath;
    }
}
async function isWritable(filePath) {
    try {
        await fsp.access(filePath, fs_1.default.constants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function readDisk(filePath) {
    let stat;
    try {
        stat = await fsp.stat(filePath);
    }
    catch (err) {
        const code = err.code;
        return code === 'ENOENT' || code === 'ENOTDIR' ? { kind: 'missing' } : { kind: 'error', error: 'unreadable' };
    }
    if (!stat.isFile())
        return { kind: 'missing' };
    if (stat.size > linkedNotesLogic_1.MAX_LINKED_FILE_BYTES)
        return { kind: 'error', error: 'tooLarge', mtimeMs: stat.mtimeMs };
    let bytes;
    try {
        bytes = await fsp.readFile(filePath);
    }
    catch {
        return { kind: 'error', error: 'unreadable', mtimeMs: stat.mtimeMs };
    }
    const decoded = (0, linkedNotesLogic_1.decodeMarkdownBytes)(bytes);
    if (!decoded.ok)
        return { kind: 'error', error: decoded.error, mtimeMs: stat.mtimeMs };
    return {
        kind: 'ok', bytes, text: decoded.text, bom: decoded.bom, hash: (0, linkedNotesLogic_1.hashBytes)(bytes),
        mtimeMs: stat.mtimeMs, size: stat.size, writable: await isWritable(filePath),
    };
}
/**
 * Re-reads one linked file into `runtime` (and the cache / the known
 * fingerprint when its content changed). Returns what changed, for the caller
 * to broadcast / reindex. Call it through `serial`.
 */
async function refresh(rec) {
    const prev = runtime.get(rec.id);
    const disk = await readDisk(rec.path);
    if (!records.includes(rec))
        return { changed: false, contentChanged: false }; // unlinked meanwhile
    let next;
    if (disk.kind === 'ok') {
        const body = (0, linkedNotesLogic_1.splitMarkdownFile)(disk.text, disk.bom).body;
        next = { status: disk.writable ? 'ok' : 'readonly', body, hash: disk.hash, mtimeMs: disk.mtimeMs };
        // Echo (our own write coming back, or a touch) = same hash as the last known
        // content: nothing to persist. Anything else is new content from outside.
        if ((0, linkedNotesLogic_1.decideDiskEvent)(prev?.hash ?? rec.known?.hash, disk.hash) === 'external' || rec.known?.hash !== disk.hash) {
            if (rec.known?.hash !== disk.hash) {
                rec.known = { hash: disk.hash, size: disk.size, mtimeMs: disk.mtimeMs };
                saveRegistry();
            }
            if (readCache(rec.id) !== body)
                writeCache(rec.id, body);
        }
    }
    else {
        // Missing / unreadable: keep showing the last known content (read-only).
        const body = prev?.body ?? readCache(rec.id) ?? '';
        next = disk.kind === 'missing'
            ? { status: 'missing', body, hash: null, mtimeMs: prev?.mtimeMs ?? 0 }
            : { status: 'error', error: disk.error, body, hash: null, mtimeMs: disk.mtimeMs ?? prev?.mtimeMs ?? 0 };
    }
    runtime.set(rec.id, next);
    const changed = !prev || prev.status !== next.status || prev.error !== next.error || prev.hash !== next.hash;
    return { changed, contentChanged: !prev || prev.body !== next.body };
}
/** Not read yet since startup: the cached content, read-only, until refresh() lands. */
function checkingRuntime(rec) {
    return { status: 'checking', body: readCache(rec.id) ?? '', hash: null, mtimeMs: rec.known?.mtimeMs ?? 0 };
}
function toWire(rec) {
    const rt = runtime.get(rec.id) ?? checkingRuntime(rec);
    const updated = rt.mtimeMs > 0 ? new Date(rt.mtimeMs).toISOString() : rec.updated;
    const draft = drafts.get(rec.id);
    return {
        id: rec.id,
        path: rec.path,
        title: rec.title,
        ...(rec.group ? { group: rec.group } : {}),
        ...(rec.group && rec.folder ? { folder: rec.folder } : {}),
        favorited: !!rec.favorited,
        archived: !!rec.archived,
        isRawMode: !!rec.isRawMode,
        aiHidden: !!rec.aiHidden,
        created: rec.created,
        updated,
        sectionName: path_1.default.basename(rec.path),
        status: rt.status,
        ...(rt.error ? { error: rt.error } : {}),
        body: rt.body,
        hash: rt.hash,
        ...(draft ? { draft } : {}),
    };
}
function find(id) {
    return (0, linkedNotesLogic_1.isLinkedNoteId)(id) ? records.find((r) => r.id === id) : undefined;
}
function findByPath(p) {
    const key = (0, linkedNotesLogic_1.linkedPathKey)(p, platform);
    return records.find((r) => (0, linkedNotesLogic_1.linkedPathKey)(r.path, platform) === key);
}
// ── Watchers: one per parent folder, filtered by file name ───────────────────
// The FOLDER is watched (not the file): editors and `git checkout` often save
// through a rename, which a watcher on the file itself stops seeing.
const dirWatchers = new Map();
const eventTimers = new Map();
const WATCH_DEBOUNCE_MS = 200;
const sameName = (a, b) => platform === 'win32' || platform === 'darwin' ? a.toLowerCase() === b.toLowerCase() : a === b;
function onDirEvent(dir, filename) {
    for (const rec of records) {
        if ((0, linkedNotesLogic_1.linkedPathKey)(path_1.default.dirname(rec.path), platform) !== (0, linkedNotesLogic_1.linkedPathKey)(dir, platform))
            continue;
        if (filename && !sameName(path_1.default.basename(filename), path_1.default.basename(rec.path)))
            continue;
        const existing = eventTimers.get(rec.id);
        if (existing)
            clearTimeout(existing);
        eventTimers.set(rec.id, setTimeout(() => {
            eventTimers.delete(rec.id);
            void checkOne(rec.id);
        }, WATCH_DEBOUNCE_MS));
    }
}
/** Re-reads one file and tells every window when something visible changed. */
function checkOne(id) {
    return serial(id, async () => {
        const rec = find(id);
        if (!rec)
            return;
        const { changed, contentChanged } = await refresh(rec);
        if (changed)
            options?.broadcast(rec.path);
        if (contentChanged)
            options?.onIndexChange?.(rec.id);
    });
}
/** Whether `dir` is an existing folder (async: an unreachable drive never blocks main). */
let probeDir = async (dir) => {
    try {
        return (await fsp.stat(dir)).isDirectory();
    }
    catch {
        return false;
    }
};
function openWatcher(key, dir) {
    if (dirWatchers.has(key))
        return;
    try {
        const watcher = fs_1.default.watch(dir, { persistent: false }, (_type, filename) => {
            onDirEvent(dir, filename ? String(filename) : null);
        });
        watcher.on('error', () => {
            try {
                watcher.close();
            }
            catch { /* ignore */ }
            if (dirWatchers.get(key)?.watcher === watcher)
                dirWatchers.delete(key);
            onDirEvent(dir, null); // the folder may be gone: re-check its files
        });
        dirWatchers.set(key, { dir, watcher });
    }
    catch {
        // Folder missing (moved/deleted): its notes show as missing; recheck() retries.
    }
}
// Bumped by every rewatch(): only the latest call may close watchers or open the
// probed ones (an older, slower call must not undo what a newer one decided).
let rewatchGeneration = 0;
/** The folders that need a watcher now: known reachable, and to probe (file missing / unreadable). */
function watchPlan() {
    const known = new Map();
    const toProbe = new Map();
    for (const rec of records) {
        const rt = runtime.get(rec.id);
        if (!rt || rt.status === 'checking')
            continue;
        const dir = path_1.default.dirname(rec.path);
        const key = (0, linkedNotesLogic_1.linkedPathKey)(dir, platform);
        if (rt.status === 'missing' || (rt.status === 'error' && rt.error === 'unreadable'))
            toProbe.set(key, dir);
        else
            known.set(key, dir);
    }
    for (const key of known.keys())
        toProbe.delete(key);
    return { known, toProbe };
}
/**
 * One watcher per folder of a linked file. A file that was read at the last check
 * proves its folder is reachable: watched at once. A file that's missing (or
 * couldn't even be stat'ed) still gets its folder watched if that folder exists —
 * checked asynchronously, without delaying the known ones —, so the file
 * reappearing at the same path is seen at once. A folder that doesn't answer or
 * doesn't exist isn't watched (fs.watch on a dead network drive could block);
 * recheck() tries again on the next window focus. Only the most recent call closes
 * watchers or opens probed ones, from the registry as it is when its probes end.
 */
async function rewatch() {
    const generation = ++rewatchGeneration;
    const { known, toProbe } = watchPlan();
    for (const [key, dir] of known)
        openWatcher(key, dir);
    const probed = await Promise.all([...toProbe].map(async ([key, dir]) => [key, dir, await probeDir(dir)]));
    if (generation !== rewatchGeneration)
        return;
    // The registry may have changed while probing (a note unlinked / relocated): re-plan.
    const now = watchPlan();
    const wanted = new Map(now.known);
    for (const [key, dir, exists] of probed)
        if (exists && now.toProbe.has(key))
            wanted.set(key, dir);
    for (const [key, entry] of dirWatchers) {
        if (wanted.has(key))
            continue;
        try {
            entry.watcher.close();
        }
        catch { /* ignore */ }
        dirWatchers.delete(key);
    }
    for (const [key, dir] of wanted)
        openWatcher(key, dir);
}
/** Test hooks: the watched folders, and a replacement for the folder probe. */
exports.__test = {
    watchedDirs: () => [...dirWatchers.values()].map((w) => w.dir),
    setDirProbe: (fn) => { probeDir = fn; },
    rewatch: () => rewatch(),
};
// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Loads the registry, the cached contents and the drafts (all in userData) and
 * starts reading the linked files in the background: nothing here waits on them,
 * so the windows can open at once (their notes show as `checking` until read).
 * Resolves when every file has been read (tests; main doesn't wait for it).
 */
function init(opts) {
    options = opts;
    let raw = null;
    try {
        raw = JSON.parse(fs_1.default.readFileSync(registryFile(), 'utf-8'));
    }
    catch { /* none yet */ }
    const registry = (0, linkedNotesLogic_1.sanitizeLinkedRegistry)(raw, platform);
    records = registry.notes;
    localOrder = registry.order;
    runtime.clear();
    drafts.clear();
    for (const rec of records) {
        runtime.set(rec.id, checkingRuntime(rec));
        const draft = readDraft(rec.id);
        if (draft)
            drafts.set(rec.id, draft);
    }
    return recheck();
}
function list() {
    return records.map(toWire);
}
/** One linked note by id or by file path; null when it isn't (or no longer is) linked. */
function get(idOrPath) {
    if (typeof idOrPath !== 'string' || !idOrPath)
        return null;
    const rec = (0, linkedNotesLogic_1.isLinkedNoteId)(idOrPath) ? find(idOrPath) : findByPath(idOrPath);
    return rec ? toWire(rec) : null;
}
/** Whether `p` is (case rules of the platform) the path of a linked file. */
function isLinkedPath(p) {
    return typeof p === 'string' && !!p && !!findByPath(p);
}
async function validateLinkTarget(p) {
    if (!(0, linkedNotesLogic_1.isMarkdownPath)(p) || !path_1.default.isAbsolute(p))
        return { ok: false, error: 'notMarkdown' };
    const filePath = (0, linkedNotesLogic_1.normalizeLinkedPath)(p, platform);
    // Files of the notes dir are already notes (or sync metadata): editing them as
    // linked notes would fight the sync and the regular editor.
    if (options && (0, linkedNotesLogic_1.isPathInside)(filePath, options.notesDir, platform))
        return { ok: false, error: 'insideNotesDir' };
    let stat;
    try {
        stat = await fsp.stat(filePath);
    }
    catch {
        return { ok: false, error: 'notFound' };
    }
    if (!stat.isFile())
        return { ok: false, error: 'notAFile' };
    try {
        if (options && (0, linkedNotesLogic_1.isPathInside)(await fsp.realpath(filePath), await fsp.realpath(options.notesDir), platform)) {
            return { ok: false, error: 'insideNotesDir' };
        }
    }
    catch { /* notes dir missing: nothing to compare */ }
    return { ok: true, filePath };
}
function newLinkedId() {
    return linkedNotesLogic_1.LINKED_ID_PREFIX + (0, crypto_1.randomBytes)(8).toString('base64url').slice(0, 10);
}
/**
 * Links Markdown files. An already linked file (same path, platform case rules)
 * is returned as `existing` instead of being linked twice.
 */
async function link(paths, senderId) {
    const result = { linked: [], existing: [], errors: [] };
    const list = Array.isArray(paths) ? paths.slice(0, 200) : [];
    let added = false;
    for (const p of list) {
        const label = typeof p === 'string' ? p : '';
        const valid = await validateLinkTarget(p);
        if (!valid.ok) {
            result.errors.push({ path: label, error: valid.error });
            continue;
        }
        const already = findByPath(valid.filePath);
        if (already) {
            result.existing.push(toWire(already));
            continue;
        }
        const now = new Date().toISOString();
        const rec = {
            id: newLinkedId(),
            path: valid.filePath,
            title: (0, linkedNotesLogic_1.defaultLinkedTitle)(valid.filePath, platform),
            created: now,
            updated: now,
        };
        records.push(rec);
        await serial(rec.id, () => refresh(rec));
        added = true;
        result.linked.push(toWire(rec));
        options?.broadcast(rec.path, senderId);
        options?.onIndexChange?.(rec.id);
    }
    if (added) {
        saveRegistry();
        void rewatch();
    }
    return result;
}
/** Points a linked note at another file, keeping everything else (title, group, favorite…). */
async function relocate(id, newPath, senderId) {
    const rec = find(id);
    if (!rec)
        return { ok: false, error: 'notLinked' };
    const valid = await validateLinkTarget(newPath);
    if (!valid.ok)
        return { ok: false, error: valid.error };
    const other = findByPath(valid.filePath);
    if (other && other.id !== rec.id)
        return { ok: false, error: 'alreadyLinked' };
    return serial(rec.id, async () => {
        const oldPath = rec.path;
        rec.path = valid.filePath;
        delete rec.known;
        runtime.delete(rec.id);
        // A draft (unwritten edits) is KEPT: restored against the new file it can't match its
        // base, so it shows as a conflict and the user chooses (banner / Compare…).
        await refresh(rec);
        saveRegistry();
        void rewatch();
        if ((0, linkedNotesLogic_1.linkedPathKey)(oldPath, platform) !== (0, linkedNotesLogic_1.linkedPathKey)(rec.path, platform))
            options?.broadcast(oldPath, senderId);
        options?.broadcast(rec.path, senderId);
        options?.onIndexChange?.(rec.id);
        return { ok: true, note: toWire(rec) };
    });
}
/**
 * Removes a linked note from NoteFlow: its registry entry, its cached content,
 * its draft and its place in the local manual order. The linked FILE is never
 * touched — this is the only "delete" a linked note has.
 */
function unlink(id, senderId) {
    const rec = find(id);
    if (!rec)
        return false;
    records = records.filter((r) => r.id !== rec.id);
    runtime.delete(rec.id);
    const timer = eventTimers.get(rec.id);
    if (timer) {
        clearTimeout(timer);
        eventTimers.delete(rec.id);
    }
    try {
        fs_1.default.rmSync(cacheFile(rec.id), { force: true });
    }
    catch { /* ignore */ }
    deleteDraft(rec.id);
    for (const [key, ids] of Object.entries(localOrder)) {
        const kept = ids.filter((x) => x !== rec.id);
        if (kept.some(linkedNotesLogic_1.isLinkedNoteId))
            localOrder[key] = kept;
        else
            delete localOrder[key];
    }
    saveRegistry();
    void rewatch();
    options?.broadcast(rec.path, senderId);
    options?.onRemoved?.(rec.id);
    return true;
}
/** Local metadata of a linked note (title alias, group/folder, flags). Never touches the file. */
function updateMeta(id, patch, senderId) {
    const rec = find(id);
    if (!rec || !patch || typeof patch !== 'object')
        return null;
    const p = patch;
    const before = JSON.stringify(rec);
    const reindex = ('title' in p && p.title !== rec.title) || ('aiHidden' in p && !!p.aiHidden !== !!rec.aiHidden);
    if (typeof p.title === 'string')
        rec.title = p.title.slice(0, 500);
    if ('group' in p) {
        if (typeof p.group === 'string' && p.group.trim() && p.group.length <= 128)
            rec.group = p.group;
        else
            delete rec.group;
    }
    if ('folder' in p) {
        if (typeof p.folder === 'string' && p.folder.trim() && p.folder.length <= 128)
            rec.folder = p.folder;
        else
            delete rec.folder;
    }
    if (!rec.group)
        delete rec.folder;
    for (const flag of ['favorited', 'archived', 'isRawMode', 'aiHidden']) {
        if (flag in p) {
            if (p[flag] === true)
                rec[flag] = true;
            else
                delete rec[flag];
        }
    }
    if (JSON.stringify(rec) !== before) {
        rec.updated = new Date().toISOString();
        saveRegistry();
        options?.broadcast(rec.path, senderId);
        if (reindex)
            options?.onIndexChange?.(rec.id);
    }
    return toWire(rec);
}
/**
 * Atomic replace of `target` by `bytes` (tmp in the same folder + rename), keeping
 * its mode. The tmp file is removed on ANY failure: it must never be left behind
 * in the user's project.
 */
async function replaceFileAtomically(target, bytes) {
    const dir = path_1.default.dirname(target);
    const tmp = path_1.default.join(dir, `.${path_1.default.basename(target)}.${(0, crypto_1.randomBytes)(4).toString('hex')}.noteflow-tmp`);
    let mode;
    try {
        mode = (await fsp.stat(target)).mode & 0o7777;
    }
    catch { /* new file */ }
    try {
        await fsp.writeFile(tmp, bytes, mode !== undefined && platform !== 'win32' ? { mode } : undefined);
        await fsp.rename(tmp, target);
    }
    catch (err) {
        try {
            await fsp.rm(tmp, { force: true });
        }
        catch { /* ignore */ }
        const code = err.code;
        // Windows refuses to rename over a file another program holds open with a
        // sharing lock (EPERM/EBUSY/EACCES) — then write in place, still guarded by
        // the hash check that just ran.
        if (platform === 'win32' && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')) {
            await fsp.writeFile(target, bytes);
            return;
        }
        throw err;
    }
}
/**
 * Writes an edited body to the linked file — only if the file still has the
 * content the edit was based on (`baseHash`); otherwise reports a conflict with
 * the disk version. Frontmatter, BOM, line endings and final newline are kept.
 * A write of the draft's own content drops the draft (consumeDraft).
 */
function writeBody(id, body, baseHash, senderId) {
    const rec = find(id);
    if (!rec)
        return Promise.resolve({ ok: false, reason: 'notLinked' });
    if (typeof body !== 'string')
        return Promise.resolve({ ok: false, reason: 'error', error: 'invalidBody' });
    return serial(rec.id, async () => {
        const target = await realTarget(rec.path);
        const disk = await readDisk(target);
        if (!records.includes(rec))
            return { ok: false, reason: 'notLinked' };
        const report = async () => {
            const { changed, contentChanged } = await refresh(rec);
            if (changed)
                options?.broadcast(rec.path);
            if (contentChanged)
                options?.onIndexChange?.(rec.id);
        };
        if (disk.kind === 'missing') {
            await report();
            return { ok: false, reason: 'missing' };
        }
        if (disk.kind === 'error') {
            await report();
            return { ok: false, reason: 'error', error: disk.error };
        }
        const parts = (0, linkedNotesLogic_1.splitMarkdownFile)(disk.text, disk.bom);
        if ((0, linkedNotesLogic_1.decideWrite)(typeof baseHash === 'string' ? baseHash : null, disk.hash) === 'conflict') {
            // Changed outside since the edit's base: never overwrite. Remember the new
            // disk version (other windows reload it if they have nothing pending).
            await report();
            return { ok: false, reason: 'conflict', disk: { body: parts.body, hash: disk.hash } };
        }
        const nextText = (0, linkedNotesLogic_1.assembleMarkdownFile)(parts, body);
        const nextBytes = (0, linkedNotesLogic_1.encodeMarkdown)(nextText, disk.bom);
        if (nextBytes.equals(disk.bytes)) {
            consumeDraft(rec.id, body, parts.body);
            return { ok: true, hash: disk.hash, body: parts.body };
        }
        if (nextBytes.length > linkedNotesLogic_1.MAX_LINKED_FILE_BYTES)
            return { ok: false, reason: 'error', error: 'tooLarge' };
        if (!disk.writable) {
            await report();
            return { ok: false, reason: 'readonly' };
        }
        try {
            await replaceFileAtomically(target, nextBytes);
        }
        catch (err) {
            const code = err.code;
            if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
                await report();
                return { ok: false, reason: 'readonly' };
            }
            return { ok: false, reason: 'error', error: String(err) };
        }
        const hash = (0, linkedNotesLogic_1.hashBytes)(nextBytes);
        const written = (0, linkedNotesLogic_1.splitMarkdownFile)(nextText, disk.bom).body;
        // Unlinked while the write was in flight: the file has the edit, but nothing of the
        // note (cache, registry entry, draft) is recreated.
        if (!records.includes(rec))
            return { ok: false, reason: 'notLinked' };
        let mtimeMs = Date.now();
        try {
            mtimeMs = (await fsp.stat(target)).mtimeMs;
        }
        catch { /* keep now */ }
        rec.known = { hash, size: nextBytes.length, mtimeMs };
        rec.updated = new Date().toISOString();
        runtime.set(rec.id, { status: 'ok', body: written, hash, mtimeMs });
        writeCache(rec.id, written);
        consumeDraft(rec.id, body, written);
        saveRegistry();
        options?.broadcast(rec.path, senderId);
        options?.onIndexChange?.(rec.id);
        return { ok: true, hash, body: written };
    });
}
/**
 * Keeps edits that aren't in the file yet (conflict, read-only, failed write) in
 * userData so they survive a restart; `null` drops it (the note is in sync again).
 * Never written to the .md by itself: restored as unsaved content, it goes through
 * the regular hash-checked write.
 */
function setDraft(id, draft) {
    const rec = find(id);
    if (!rec)
        return;
    const clean = draft === null ? null : (0, linkedNotesLogic_1.sanitizeLinkedDraft)(draft);
    if (!clean) {
        if (drafts.has(rec.id))
            deleteDraft(rec.id);
        return;
    }
    const prev = drafts.get(rec.id);
    if (prev && prev.body === clean.body && prev.baseHash === clean.baseHash)
        return;
    drafts.set(rec.id, clean);
    try {
        writeAtomic(draftFile(rec.id), JSON.stringify(clean));
    }
    catch (err) {
        console.error('[linked] failed to save draft:', String(err));
    }
}
/**
 * Copies an image pasted/dropped into a linked note to an `assets/` folder next
 * to the .md (created if needed, unique name) → the RELATIVE path to link it with.
 */
async function saveAsset(id, name, mime, data) {
    const rec = find(id);
    if (!rec)
        return { ok: false, error: 'notLinked' };
    const rt = runtime.get(rec.id);
    if (rt?.status !== 'ok')
        return { ok: false, error: rt?.status ?? 'missing' };
    const bytes = data instanceof Uint8Array ? Buffer.from(data) : null;
    if (!bytes || bytes.length === 0)
        return { ok: false, error: 'empty' };
    if (bytes.length > linkedNotesLogic_1.MAX_LINKED_ASSET_BYTES)
        return { ok: false, error: 'tooLarge' };
    const mimeType = typeof mime === 'string' ? mime : '';
    if (!mimeType.startsWith('image/'))
        return { ok: false, error: 'notImage' };
    const assetsDir = path_1.default.join(path_1.default.dirname(await realTarget(rec.path)), 'assets');
    try {
        await fsp.mkdir(assetsDir, { recursive: true });
        const taken = new Set(await fsp.readdir(assetsDir));
        const fileName = (0, linkedNotesLogic_1.linkedAssetFileName)(typeof name === 'string' ? name : '', mimeType, (n) => taken.has(n));
        await fsp.writeFile(path_1.default.join(assetsDir, fileName), bytes, { flag: 'wx' });
        return { ok: true, relPath: `assets/${fileName}` };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
}
/**
 * Absolute path of an image referenced relatively by a linked note (protocol
 * handler), or null. Relative to the .md's folder (`../` may go up), images only.
 */
async function resolveAsset(id, src) {
    const rec = find(id);
    if (!rec || typeof src !== 'string')
        return null;
    // A literal name with `%xx` in it (rare) first, then its decoded form (`my%20shot.png`).
    for (const decode of [false, true]) {
        const candidate = (0, linkedNotesLogic_1.resolveLinkedAsset)(rec.path, src, platform, decode);
        if (!candidate || !(0, linkedNotesLogic_1.isImageFileName)(candidate))
            continue;
        try {
            if ((await fsp.stat(candidate)).isFile())
                return candidate;
        }
        catch { /* next */ }
    }
    return null;
}
/**
 * An image a linked note references relatively, as a data URI — for copying the note's
 * content into a REGULAR note (duplicate, template), whose images live inline. Same
 * checks as the nflinked: scheme (images only, relative to the registered .md), up to
 * MAX_INLINED_ASSET_BYTES; null otherwise (the caller keeps the path as it was).
 */
async function assetDataUri(id, src) {
    // Only an image the note really shows (its body as last read — or cached — or its
    // unwritten draft): `../` is allowed in relative paths, so this keeps a buggy caller
    // from reading out images the note doesn't show. Defense in depth only, NOT a security
    // boundary: a compromised renderer can put any src in the body (linked:write) or the
    // draft first. A real boundary would mean bounding `../` (e.g. to the file's repo root).
    const rec = find(id);
    if (!rec || typeof src !== 'string')
        return null;
    const wanted = (0, linkedNotesLogic_1.normalizeImageSrc)(src);
    const bodies = [runtime.get(rec.id)?.body ?? readCache(rec.id) ?? '', drafts.get(rec.id)?.body ?? ''];
    if (!bodies.some((b) => (0, linkedNotesLogic_1.markdownImageSrcs)(b).includes(wanted)))
        return null;
    const file = await resolveAsset(id, wanted);
    const mime = file ? (0, linkedNotesLogic_1.imageMimeOf)(file) : null;
    if (!file || !mime)
        return null;
    try {
        if ((await fsp.stat(file)).size > linkedNotesLogic_1.MAX_INLINED_ASSET_BYTES)
            return null;
        return `data:${mime};base64,${(await fsp.readFile(file)).toString('base64')}`;
    }
    catch {
        return null;
    }
}
/** Re-reads every linked file (startup, window focus): status (read-only / missing / back) and content. */
async function recheck() {
    await Promise.all(records.map((rec) => checkOne(rec.id)));
    await rewatch();
}
// ── Manual order (note-order.json without linked ids) ────────────────────────
/** note-order.json as read from disk → the order the app uses (linked ids put back from the local order). */
function mergeNoteOrder(syncedRaw) {
    return (0, linkedNotesLogic_1.mergeLinkedOrder)((0, linkedNotesLogic_1.sanitizeNoteOrder)(syncedRaw), localOrder);
}
/**
 * The order the app wants to save → what goes to note-order.json (no linked id
 * ever: a linked note only exists on this device). The full lists of the contexts
 * with a linked note are kept in the local registry.
 */
function splitNoteOrder(order) {
    const known = new Set(records.map((r) => r.id));
    const clean = (0, linkedNotesLogic_1.sanitizeNoteOrder)(order);
    // Ids of notes unlinked since don't need a place any more.
    for (const key of Object.keys(clean))
        clean[key] = clean[key].filter((id) => !(0, linkedNotesLogic_1.isLinkedNoteId)(id) || known.has(id));
    const { synced, local } = (0, linkedNotesLogic_1.splitLinkedOrder)(clean);
    if (JSON.stringify(local) !== JSON.stringify(localOrder)) {
        localOrder = local;
        saveRegistry();
    }
    return synced;
}
/**
 * Linked ids found in a note-order.json written by an earlier build: moved into
 * the local order (contexts the local order doesn't have yet) → the cleaned file
 * content, or null when there was nothing to clean.
 */
function adoptLinkedIdsFromSynced(syncedRaw) {
    const clean = (0, linkedNotesLogic_1.sanitizeNoteOrder)(syncedRaw);
    const { synced, local } = (0, linkedNotesLogic_1.splitLinkedOrder)(clean);
    if (Object.keys(local).length === 0)
        return null;
    let changed = false;
    for (const [key, ids] of Object.entries(local)) {
        if (localOrder[key])
            continue;
        localOrder[key] = ids;
        changed = true;
    }
    if (changed)
        saveRegistry();
    return synced;
}
/** Notes for the semantic index — one section, the body (cached content when the file can't be read). */
function aiNotes() {
    return records.map((rec) => aiNote(rec.id)).filter((n) => n !== null);
}
function aiNote(id) {
    const rec = find(id);
    if (!rec)
        return null;
    const wire = toWire(rec);
    return {
        key: aiIndexKey(rec.id),
        note: {
            noteId: rec.id,
            title: rec.title,
            encrypted: false,
            sections: [{ id: linkedNotesLogic_1.LINKED_SECTION_ID, name: wire.sectionName, content: wire.body, ...(rec.aiHidden ? { aiHidden: true } : {}) }],
        },
    };
}
/** Key a linked note is stored under in the semantic index (its `file_path` column). */
function aiIndexKey(id) {
    return `linked://${id}`;
}
