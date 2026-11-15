"use strict";
// Linked notes ("notas vinculadas"): a NoteFlow note backed by an EXTERNAL
// text file the user picked (README.md of a project, a doc of a Docusaurus/Astro
// site… or any other text file: config.json, a .yaml, a script, a log). Markdown
// files (.md/.markdown) get the Markdown editor; any other text file is always
// edited in text mode, byte-exact. The file is edited in place — never imported, never
// copied into the notes dir — and nothing of NoteFlow (frontmatter, ids,
// metadata) is ever written into it. Everything NoteFlow needs (title alias,
// group/folder, favorite…) lives in a local registry (userData/linked-notes.json,
// never synced). See .agents/context/patterns.md § "Notas vinculadas".
//
// This module is the PURE half (no Electron, no fs): registry sanitizing, path
// normalization/dedupe, the text/binary check, the byte-exact split/reassembly of
// the file (BOM, EOL, final newline, YAML frontmatter of Markdown files), the
// fingerprint decisions (own echo vs
// external change, when a write is a conflict) and the assets/ helpers for
// images. Tested in tests/electron/linkedNotesLogic.test.ts. The IO half is
// electron/linkedNotes.ts.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MD_IMAGE_RE = exports.MAX_INLINED_ASSET_BYTES = exports.LINK_GRANT_TTL_MS = exports.MAX_LINKED_ASSET_BYTES = exports.LINKED_SNIFF_BYTES = exports.MAX_LINKED_FILE_BYTES = exports.LINKED_SECTION_ID = exports.LINKED_ID_PREFIX = void 0;
exports.isLinkedNoteId = isLinkedNoteId;
exports.isMarkdownPath = isMarkdownPath;
exports.createLinkGrants = createLinkGrants;
exports.sanitizeLinkedDraft = sanitizeLinkedDraft;
exports.isCaseInsensitivePlatform = isCaseInsensitivePlatform;
exports.normalizeLinkedPath = normalizeLinkedPath;
exports.linkedPathKey = linkedPathKey;
exports.isPathInside = isPathInside;
exports.sanitizeLinkedRegistry = sanitizeLinkedRegistry;
exports.canDiscardTransient = canDiscardTransient;
exports.dropTransientRecords = dropTransientRecords;
exports.sanitizeNoteOrder = sanitizeNoteOrder;
exports.splitLinkedOrder = splitLinkedOrder;
exports.mergeLinkedOrder = mergeLinkedOrder;
exports.defaultLinkedTitle = defaultLinkedTitle;
exports.linkedCacheFileName = linkedCacheFileName;
exports.linkedDraftFileName = linkedDraftFileName;
exports.decodeLinkedBytes = decodeLinkedBytes;
exports.sniffLinkedBytes = sniffLinkedBytes;
exports.hasLoneCr = hasLoneCr;
exports.encodeMarkdown = encodeMarkdown;
exports.hashBytes = hashBytes;
exports.splitMarkdownFile = splitMarkdownFile;
exports.splitLinkedFile = splitLinkedFile;
exports.assembleMarkdownFile = assembleMarkdownFile;
exports.decideDiskEvent = decideDiskEvent;
exports.decideWrite = decideWrite;
exports.imageMimeOf = imageMimeOf;
exports.isImageFileName = isImageFileName;
exports.linkedAssetFileName = linkedAssetFileName;
exports.resolveLinkedAsset = resolveLinkedAsset;
exports.markdownImageSrcs = markdownImageSrcs;
exports.normalizeImageSrc = normalizeImageSrc;
const crypto_1 = require("crypto");
const path_1 = __importDefault(require("path"));
/** Every linked note id starts with this. `:` never appears in a regular note id (nanoid alphabet). */
exports.LINKED_ID_PREFIX = 'lnk:';
/** The single section of a linked note (the whole file body). */
exports.LINKED_SECTION_ID = 'body';
/**
 * Bigger files open read-only (the editor is not meant for multi-megabyte documents). Also
 * for plain-text files (logs…): the store keeps several copies of the body (content, disk
 * body, synced content, draft) and the semantic index embeds all of it — see patterns.md.
 */
exports.MAX_LINKED_FILE_BYTES = 2 * 1024 * 1024;
/** How much of a file is sniffed for a NUL byte (= binary) when linking a file too big to read whole. */
exports.LINKED_SNIFF_BYTES = 8 * 1024;
/** Upper bound of one image pasted/dropped into a linked note (copied into assets/). */
exports.MAX_LINKED_ASSET_BYTES = 20 * 1024 * 1024;
function isLinkedNoteId(id) {
    return typeof id === 'string' && id.startsWith(exports.LINKED_ID_PREFIX) && id.length > exports.LINKED_ID_PREFIX.length;
}
/**
 * `.md` / `.markdown`, case-insensitive. A linked Markdown file gets the Markdown editor and
 * its YAML frontmatter hidden; any other linked text file is plain text (always text mode,
 * no frontmatter, no tags, no images).
 */
function isMarkdownPath(p) {
    return typeof p === 'string' && /\.(md|markdown)$/i.test(p.trim());
}
// ── Link grants: only files the USER chose can be linked ─────────────────────
//
// Any text file can be linked and then edited, so main must not link whatever path a
// (possibly compromised) renderer sends: `.git/config`, `~/.ssh/authorized_keys`, a
// `.bashrc` or a PowerShell profile would mean code execution. A path can only enter the
// registry (link / relocate) if main GRANTED it first, from a user action: the native
// picker (`linked:pick-files`), a real drop from the OS (seen by the preload, isTrusted),
// or main itself for a file the OS opened with NoteFlow (argv / second-instance / open-file,
// see openWithArgs.ts). A grant is single use and expires.
/** How long a granted path may wait to be linked (the first-link notice can sit open meanwhile). */
exports.LINK_GRANT_TTL_MS = 5 * 60 * 1000;
/** Grant store keyed by `linkedPathKey` (same case/normalization rules as the registry). */
function createLinkGrants(platform = process.platform) {
    const mod = pathModule(platform);
    const expiries = new Map();
    const prune = (now) => { for (const [k, until] of expiries)
        if (until <= now)
            expiries.delete(k); };
    return {
        grant(paths, ttlMs = exports.LINK_GRANT_TTL_MS, now = Date.now()) {
            prune(now);
            for (const p of paths.slice(0, 200)) {
                if (typeof p !== 'string' || !p.trim() || !mod.isAbsolute(p))
                    continue;
                expiries.set(linkedPathKey(p, platform), now + ttlMs);
            }
        },
        consume(p, now = Date.now()) {
            prune(now);
            if (typeof p !== 'string' || !p.trim() || !mod.isAbsolute(p))
                return false;
            const key = linkedPathKey(p, platform);
            if (!expiries.has(key))
                return false;
            expiries.delete(key);
            return true;
        },
        size(now = Date.now()) {
            prune(now);
            return expiries.size;
        },
    };
}
function sanitizeLinkedDraft(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const d = raw;
    if (typeof d.body !== 'string')
        return null;
    const baseHash = typeof d.baseHash === 'string' && /^[0-9a-f]{64}$/.test(d.baseHash) ? d.baseHash : null;
    return { body: d.body, baseHash };
}
function pathModule(platform) {
    return platform === 'win32' ? path_1.default.win32 : path_1.default.posix;
}
/** Windows and macOS file systems are case-insensitive by default. */
function isCaseInsensitivePlatform(platform) {
    return platform === 'win32' || platform === 'darwin';
}
/** Absolute, normalized form of a path (no trailing separator). */
function normalizeLinkedPath(p, platform = process.platform) {
    const mod = pathModule(platform);
    const resolved = mod.resolve(p.trim());
    return resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') || resolved : resolved;
}
/** Comparison key of a path: normalized, lower-cased where the file system ignores case. */
function linkedPathKey(p, platform = process.platform) {
    const normalized = normalizeLinkedPath(p, platform);
    return isCaseInsensitivePlatform(platform) ? normalized.toLowerCase() : normalized;
}
/** Whether `p` is `dir` itself or inside it (both normalized, platform case rules). */
function isPathInside(p, dir, platform = process.platform) {
    const mod = pathModule(platform);
    const a = linkedPathKey(p, platform);
    const b = linkedPathKey(dir, platform);
    if (a === b)
        return true;
    const rel = mod.relative(b, a);
    return !!rel && !rel.startsWith('..') && !mod.isAbsolute(rel);
}
const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const optStr = (v, max = 128) => typeof v === 'string' && v.trim() && v.length <= max ? v : undefined;
function sanitizeFingerprint(v) {
    if (!v || typeof v !== 'object')
        return undefined;
    const f = v;
    if (typeof f.hash !== 'string' || !/^[0-9a-f]{64}$/.test(f.hash))
        return undefined;
    const size = typeof f.size === 'number' && Number.isFinite(f.size) && f.size >= 0 ? f.size : 0;
    const mtimeMs = typeof f.mtimeMs === 'number' && Number.isFinite(f.mtimeMs) ? f.mtimeMs : 0;
    return { hash: f.hash, size, mtimeMs };
}
/**
 * Reads linked-notes.json leniently: entries without a valid linked id or an
 * absolute path are dropped (any file type: since text files other than Markdown
 * can be linked, a registry written by an earlier build stays valid as is), the rest keep only known fields with the
 * right types, and duplicates (same id, or same file by `linkedPathKey`) keep
 * the first one. A missing or broken file is an empty registry.
 */
function sanitizeLinkedRegistry(raw, platform = process.platform, now = new Date().toISOString()) {
    const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray(raw.notes)
            ? raw.notes
            : [];
    const mod = pathModule(platform);
    const ids = new Set();
    const paths = new Set();
    const notes = [];
    for (const item of list) {
        if (!item || typeof item !== 'object')
            continue;
        const r = item;
        if (!isLinkedNoteId(r.id) || r.id.length > 64)
            continue;
        if (typeof r.path !== 'string' || !r.path.trim() || !mod.isAbsolute(r.path))
            continue;
        const key = linkedPathKey(r.path, platform);
        if (ids.has(r.id) || paths.has(key))
            continue;
        ids.add(r.id);
        paths.add(key);
        const filePath = normalizeLinkedPath(r.path, platform);
        const created = isIso(r.created) ? r.created : now;
        const group = optStr(r.group);
        const record = {
            id: r.id,
            path: filePath,
            title: typeof r.title === 'string' ? r.title.slice(0, 500) : defaultLinkedTitle(filePath, platform),
            ...(group ? { group } : {}),
            // A folder requires its group (same rule as regular notes).
            ...(group && optStr(r.folder) ? { folder: optStr(r.folder) } : {}),
            ...(r.favorited === true ? { favorited: true } : {}),
            ...(r.archived === true ? { archived: true } : {}),
            ...(r.isRawMode === true ? { isRawMode: true } : {}),
            ...(r.aiHidden === true ? { aiHidden: true } : {}),
            ...(r.transient === true ? { transient: true } : {}),
            created,
            updated: isIso(r.updated) ? r.updated : created,
        };
        const known = sanitizeFingerprint(r.known);
        if (known)
            record.known = known;
        notes.push(record);
    }
    const order = raw && typeof raw === 'object' && !Array.isArray(raw) ? sanitizeNoteOrder(raw.order) : {};
    return { version: 1, notes, order };
}
// ── Transient linked notes ("Open with NoteFlow") ────────────────────────────
//
// A file the OS opens with NoteFlow is linked as TRANSIENT, like VS Code's preview tab: it
// goes away by itself (unlinked — the file is never touched) once it's closed, unless the
// user keeps it. It's never discarded while it holds edits that aren't in the file (a draft
// in userData: conflict, read-only / missing file, failed write): those wait until resolved.
/**
 * Whether main may discard (unlink) a transient linked note now: it is still transient, has
 * no unwritten draft and isn't shown in a sticky or section window. Whether it's shown in the
 * main window's panes is the main window's call (it asks only once it closed it there).
 */
function canDiscardTransient(rec, state) {
    return !!rec?.transient && !state.hasDraft && !state.openInOtherWindow;
}
/**
 * Startup cleanup: the transient notes left by the last session (closed with the app) are
 * dropped from the registry — and from the local manual order —, except those with a draft
 * (unwritten edits), which stay (still transient) until resolved. Records without the flag
 * (permanent, or written by an earlier build) are kept as they are.
 */
function dropTransientRecords(registry, hasDraft) {
    const dropped = registry.notes.filter((r) => r.transient && !hasDraft(r.id)).map((r) => r.id);
    if (dropped.length === 0)
        return { notes: registry.notes, order: registry.order, dropped };
    const gone = new Set(dropped);
    const order = {};
    for (const [key, ids] of Object.entries(registry.order)) {
        const kept = ids.filter((id) => !gone.has(id));
        // A local list is only worth keeping while it still holds a linked id (splitLinkedOrder).
        if (kept.some(isLinkedNoteId))
            order[key] = kept;
    }
    return { notes: registry.notes.filter((r) => !gone.has(r.id)), order, dropped };
}
/** A `note-order.json`-shaped map (`contextKey → note ids`), with only string ids kept. */
function sanitizeNoteOrder(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return {};
    const out = {};
    for (const [key, ids] of Object.entries(raw)) {
        if (!key || key.length > 200 || !Array.isArray(ids))
            continue;
        const list = ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 128);
        if (list.length)
            out[key] = [...new Set(list)];
    }
    return out;
}
// ── Manual order: linked ids never go to the synced note-order.json ──────────
//
// A context's manual order (note-order.json, synced) may mix regular and linked
// notes on this device. The synced file keeps only the regular ids; the FULL
// mixed list of every context that holds a linked id stays local, in the
// registry (`order`). Reading merges them back: the synced list decides the
// regular notes' order (another device may have reordered them), and each
// linked id goes right after the regular note it followed locally.
/** Splits a full order map into the synced part (no `lnk:` ids) and the local part (full lists of contexts with a linked id). */
function splitLinkedOrder(order) {
    const synced = {};
    const local = {};
    for (const [key, ids] of Object.entries(order)) {
        const regular = ids.filter((id) => !isLinkedNoteId(id));
        if (regular.length)
            synced[key] = regular;
        if (regular.length !== ids.length)
            local[key] = [...ids];
    }
    return { synced, local };
}
/** Inverse of splitLinkedOrder, tolerant to the synced lists having changed since (see above). */
function mergeLinkedOrder(synced, local) {
    const out = {};
    for (const [key, ids] of Object.entries(synced))
        out[key] = ids.filter((id) => !isLinkedNoteId(id));
    for (const [key, full] of Object.entries(local)) {
        const result = [...(out[key] ?? [])];
        const present = new Set(result);
        // Where the next linked id goes: after the last regular id seen locally (or the
        // linked ones already placed after it).
        let anchorIndex = -1;
        for (const id of full) {
            if (!isLinkedNoteId(id)) {
                if (present.has(id))
                    anchorIndex = result.indexOf(id);
                continue;
            }
            if (present.has(id))
                continue;
            result.splice(anchorIndex + 1, 0, id);
            present.add(id);
            anchorIndex += 1;
        }
        if (result.length)
            out[key] = result;
    }
    return out;
}
/**
 * Default title of a linked note: the file name — without `.md`/`.markdown` for a Markdown
 * file, with its extension for any other (`config.json`: the type is part of what it is).
 */
function defaultLinkedTitle(filePath, platform = process.platform) {
    const base = pathModule(platform).basename(filePath);
    return base.replace(/\.(md|markdown)$/i, '') || base;
}
/** File name of the cached copy of a linked note's content (userData/linked-notes-cache/). */
function linkedCacheFileName(id) {
    return `${id.slice(exports.LINKED_ID_PREFIX.length).replace(/[^A-Za-z0-9_-]/g, '_')}.md`;
}
/** File name of a linked note's unwritten draft, next to its cache. */
function linkedDraftFileName(id) {
    return linkedCacheFileName(id).replace(/\.md$/, '.draft.json');
}
const UTF8_BOM = [0xef, 0xbb, 0xbf];
/**
 * UTF-8 text of the file (strict: invalid sequences are an error) + whether it had a BOM.
 * A NUL byte anywhere makes it `binary`: text files don't have them, and the textarea
 * couldn't round-trip one byte-exact.
 */
function decodeLinkedBytes(bytes) {
    if (bytes.includes(0))
        return { ok: false, error: 'binary' };
    const bom = bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
    try {
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bom ? bytes.subarray(3) : bytes);
        return { ok: true, text, bom };
    }
    catch {
        return { ok: false, error: 'invalidUtf8' };
    }
}
/**
 * Whether the START of a file (`head`, e.g. its first LINKED_SNIFF_BYTES) can be text: no NUL
 * byte (else `binary`) and valid UTF-8 so far (else `invalidUtf8`). A multi-byte character
 * cut at the end of `head` is fine unless `complete` (head is the whole file). Null = text.
 * For linking a file too big to read whole (it's then linked read-only, `tooLarge`).
 */
function sniffLinkedBytes(head, complete = false) {
    if (head.includes(0))
        return 'binary';
    try {
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(head, { stream: !complete });
        return null;
    }
    catch {
        return 'invalidUtf8';
    }
}
/**
 * Whether the text has a lone CR (`\r` not followed by `\n`: old Mac line breaks). A
 * textarea turns every one into `\n` in its value, so the first edit in text mode would
 * rewrite all of them — a plain-text linked file with one opens read-only (`loneCr`).
 */
function hasLoneCr(text) {
    return /\r(?!\n)/.test(text);
}
function encodeMarkdown(text, bom) {
    const body = Buffer.from(text, 'utf-8');
    return bom ? Buffer.concat([Buffer.from(UTF8_BOM), body]) : body;
}
function hashBytes(bytes) {
    return (0, crypto_1.createHash)('sha256').update(bytes).digest('hex');
}
const FRONTMATTER_OPEN_RE = /^---[ \t]*\r?\n/;
const FRONTMATTER_CLOSE_RE = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m;
/**
 * Splits the decoded text of a Markdown file into the part the editor edits
 * (`body`) and what must survive an edit untouched. `assembleMarkdownFile(parts,
 * parts.body)` gives back exactly `text` for any file with consistent line
 * endings; a file mixing CRLF and LF is written with its dominant one only when
 * the user edits it. Without `withFrontmatter` (a linked file that isn't Markdown —
 * a .yaml starting with `---`…) nothing is taken as frontmatter: it's all body.
 */
function splitMarkdownFile(text, bom = false, withFrontmatter = true) {
    let frontmatter = '';
    let rest = text;
    const open = withFrontmatter ? FRONTMATTER_OPEN_RE.exec(text) : null;
    if (open) {
        const after = text.slice(open[0].length);
        const close = FRONTMATTER_CLOSE_RE.exec(after);
        // Only YAML-looking blocks (empty, or with a `key:` line): a document that
        // merely starts with a `---` rule keeps it in the editable body.
        const inner = close ? after.slice(0, close.index) : '';
        if (close && (!inner.trim() || /^[\w$"'-][^:\n]*:/m.test(inner))) {
            const end = open[0].length + close.index + close[0].length;
            frontmatter = text.slice(0, end);
            rest = text.slice(end);
        }
    }
    const crlf = (rest.match(/\r\n/g) ?? []).length;
    const lf = (rest.match(/\n/g) ?? []).length - crlf;
    // A body without line breaks follows the frontmatter's.
    const fmCrlf = (frontmatter.match(/\r\n/g) ?? []).length;
    const eol = crlf > lf || (crlf === 0 && lf === 0 && fmCrlf > 0) ? '\r\n' : '\n';
    const normalized = rest.replace(/\r\n/g, '\n');
    const finalNewline = normalized.endsWith('\n');
    return { bom, eol, frontmatter, finalNewline, body: finalNewline ? normalized.slice(0, -1) : normalized };
}
/** splitMarkdownFile with the frontmatter rule of the linked file's type (only Markdown has one). */
function splitLinkedFile(filePath, text, bom = false) {
    return splitMarkdownFile(text, bom, isMarkdownPath(filePath));
}
/** The file text for an edited `body`: frontmatter verbatim, the file's EOL and final newline. */
function assembleMarkdownFile(parts, body) {
    const lf = body.replace(/\r\n/g, '\n');
    const withEol = parts.eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf;
    return parts.frontmatter + withEol + (parts.finalNewline ? parts.eol : '');
}
// ── Fingerprint decisions ─────────────────────────────────────────────────────
/**
 * A watcher event on the file: `echo` when the disk still holds the content
 * NoteFlow last read or wrote (our own save coming back, or a touch that
 * changed nothing) — decided by content hash, not by a time window —, `missing`
 * when the file is gone, `external` otherwise.
 */
function decideDiskEvent(knownHash, diskHash) {
    if (diskHash === null)
        return 'missing';
    return knownHash && knownHash === diskHash ? 'echo' : 'external';
}
/**
 * Whether an edit may be written: only when the disk still holds the version
 * the edit was based on (`baseHash`). Anything else is a `conflict` (the file
 * changed outside since) or `missing` (it's gone) — never overwritten silently.
 */
function decideWrite(baseHash, diskHash) {
    if (diskHash === null)
        return 'missing';
    return baseHash && baseHash === diskHash ? 'write' : 'conflict';
}
// ── Images: assets/ next to the .md ──────────────────────────────────────────
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico']);
const MIME_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/x-icon': 'ico',
};
/** Biggest image inlined as a data URI when a linked note is copied into a regular one. */
exports.MAX_INLINED_ASSET_BYTES = 10 * 1024 * 1024;
/** MIME type of an image file name (by extension), or null. */
function imageMimeOf(name) {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    const found = Object.entries(MIME_EXT).find(([, e]) => e === ext);
    if (found)
        return found[0];
    return ext === 'jpeg' ? 'image/jpeg' : null;
}
function isImageFileName(name) {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    return IMAGE_EXTS.has(ext);
}
/**
 * Name for an image copied into the note's assets/ folder: the original name
 * slugged (or `image` for a pasted clipboard image) + a timestamp, with an
 * extension that matches the image type; `-2`, `-3`… if it's already taken.
 */
function linkedAssetFileName(originalName, mime, taken, now = new Date()) {
    const rawExt = originalName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
    const ext = IMAGE_EXTS.has(rawExt) ? (rawExt === 'jpeg' ? 'jpg' : rawExt) : (MIME_EXT[mime] ?? 'png');
    const stem = originalName.replace(/\.[^.]*$/, '')
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const base = `${stem && stem !== 'image' ? stem : 'image'}-${stamp}`;
    let name = `${base}.${ext}`;
    for (let i = 2; taken(name); i++)
        name = `${base}-${i}.${ext}`;
    return name;
}
/**
 * Absolute path of an image referenced RELATIVELY by a linked file (`assets/a.png`,
 * `../img/b.svg`, `./c.jpg`), resolved against the file's folder. Null for
 * anything that isn't a relative path to an image (URLs, data:, absolute paths,
 * other file types): only images are ever served from the linked file's
 * surroundings. With `decode`, a `%20`-style encoded path is decoded first.
 */
function resolveLinkedAsset(mdPath, src, platform = process.platform, decode = true) {
    const mod = pathModule(platform);
    let rel = src.trim().replace(/^<|>$/g, '').replace(/[?#].*$/, '');
    if (!isSafeRelativePath(rel))
        return null;
    if (decode && /%[0-9a-f]{2}/i.test(rel)) {
        try {
            rel = decodeURIComponent(rel);
        }
        catch {
            return null;
        }
        // Checked again on the decoded text: `%2Fetc%2Fa.png`, `C%3A%5Ca.png`, `%5C%5Chost%5Ca.png`…
        if (!isSafeRelativePath(rel))
            return null;
    }
    if (!isImageFileName(rel))
        return null;
    const resolved = mod.resolve(mod.dirname(mdPath), rel);
    return isImageFileName(resolved) ? resolved : null;
}
/**
 * A path RELATIVE to the linked file's folder (may go up with `../`): no URL
 * scheme, no drive (`C:`, `C:foo`), no absolute or UNC path (`/x`, `\x`, `//host`,
 * `\\host`), no `:` at all (Windows alternate data streams) and no NUL byte.
 */
function isSafeRelativePath(rel) {
    if (!rel || rel.includes('\0') || rel.includes(':'))
        return false;
    if (rel.startsWith('/') || rel.startsWith('\\'))
        return false;
    if (path_1.default.posix.isAbsolute(rel) || path_1.default.win32.isAbsolute(rel))
        return false;
    return true;
}
/**
 * The image sources a Markdown text references (`![alt](src)`, also with a
 * `"title"` / `'title'` and `<…>`-wrapped sources), normalized (trimmed, without
 * the angle brackets); code spans are skipped. Images by reference
 * (`![alt][ref]`) aren't listed. Mirror of the parsing in inlineLinkedImages
 * (src/lib/linkedNotes.ts).
 */
function markdownImageSrcs(md) {
    const out = [];
    for (const m of md.matchAll(exports.MD_IMAGE_RE)) {
        if (m[1])
            continue;
        out.push(normalizeImageSrc(m[3]));
    }
    return out;
}
/** `(code)` | `![alt](src "title")` — group 1 = code fence run, 2 = alt, 3 = src, 4 = title. */
exports.MD_IMAGE_RE = /(`+)[\s\S]*?\1|!\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+("[^"\n]*"|'[^'\n]*'))?\s*\)/g;
function normalizeImageSrc(src) {
    return src.trim().replace(/^<([\s\S]*)>$/, '$1').trim();
}
