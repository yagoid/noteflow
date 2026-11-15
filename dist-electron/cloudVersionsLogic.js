"use strict";
// Pure logic of the NoteFlow Cloud per-section version history (read side).
// No Electron, no fs, no network: the I/O lives in cloudVersions.ts. Covered
// by tests/electron/cloudVersions.test.ts.
//
// Server side, a trigger copies the PREVIOUS row of public.files into
// public.file_versions whenever its content_ct changes. The copied blobs are
// the same sealed columns as files (content_ct / key_ct / path_ct, see
// cloudCrypto.ts), so a version decrypts exactly like a pulled file row. The
// renderer names a section by (note folder, section id); main resolves it to
// the notes-dir-relative path '<dir>/<file>.md' the sync engine uploads, and
// from there to the opaque path_key (HMAC under the DEK) the rows are keyed by.
//
// The types below are mirrored in src/types/index.ts (the renderer copy) —
// electron/ does not import from src/. Keep both in sync.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION_LIST_LIMIT = exports.VERSION_GET_COLUMNS = exports.VERSION_LIST_COLUMNS = void 0;
exports.versionListEndpoint = versionListEndpoint;
exports.versionGetEndpoint = versionGetEndpoint;
exports.isValidSectionId = isValidSectionId;
exports.parseVersionTarget = parseVersionTarget;
exports.resolveSectionRelPath = resolveSectionRelPath;
exports.parseVersionId = parseVersionId;
exports.estimatePlaintextSize = estimatePlaintextSize;
exports.mapVersionRows = mapVersionRows;
exports.parseVersionRow = parseVersionRow;
exports.classifyVersionsHttp = classifyVersionsHttp;
exports.classifyVersionsError = classifyVersionsError;
exports.withOneRetry = withOneRetry;
exports.redactVersionsError = redactVersionsError;
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const noteFormat_1 = require("./noteFormat");
const cloudSyncLogic_1 = require("./cloudSyncLogic");
const cloudAccessErrors_1 = require("./cloudAccessErrors");
const localOnlyNotes_1 = require("./localOnlyNotes");
const linkedNotesLogic_1 = require("./linkedNotesLogic");
/** Columns of the list query (no blobs). */
exports.VERSION_LIST_COLUMNS = 'id,seq,updated_at,created_at,size,reason';
/** Columns of the single-version query. */
exports.VERSION_GET_COLUMNS = 'id,path_key,content_ct,key_ct,updated_at,seq,reason';
/** Server-side cap on the listed versions of one file. */
exports.VERSION_LIST_LIMIT = 200;
const REASONS = ['edit', 'delete', 'shrink'];
const MAX_SECTION_ID_LENGTH = 128;
// ── Queries ───────────────────────────────────────────────────────────────────
function versionListEndpoint(pathKey) {
    return (`/rest/v1/file_versions?path_key=eq.${encodeURIComponent(pathKey)}` +
        `&select=${exports.VERSION_LIST_COLUMNS}&order=seq.desc&limit=${exports.VERSION_LIST_LIMIT}`);
}
function versionGetEndpoint(id) {
    return `/rest/v1/file_versions?id=eq.${encodeURIComponent(String(id))}&select=${exports.VERSION_GET_COLUMNS}`;
}
/**
 * Section ids name a file ('<id>.md' fallback) — reject anything that could
 * point elsewhere: separators, dot segments, control chars, absurd lengths.
 */
function isValidSectionId(id) {
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_SECTION_ID_LENGTH)
        return false;
    if (id === '.' || id === '..' || id.includes('/') || id.includes('\\'))
        return false;
    for (let i = 0; i < id.length; i++) {
        if (id.charCodeAt(i) < 0x20)
            return false; // control chars (NUL included)
    }
    return true;
}
/**
 * Validates the renderer's target: `notePath` must be an absolute path whose
 * parent is EXACTLY the notes dir (normalized, case-insensitive where the file
 * system is — same rules as linked notes), so only a direct child folder of
 * the notes dir can be named. Returns that folder's name (`dir`).
 * Every failure is 'invalid-path'.
 */
function parseVersionTarget(notesDir, target, platform = process.platform) {
    const invalid = { ok: false, errorCode: 'invalid-path' };
    if (!target || typeof target !== 'object')
        return invalid;
    const { notePath, sectionId } = target;
    if (typeof notePath !== 'string' || !notePath.trim() || notePath.includes('\0'))
        return invalid;
    if (!isValidSectionId(sectionId))
        return invalid;
    const mod = platform === 'win32' ? path_1.default.win32 : path_1.default.posix;
    if (!mod.isAbsolute(notePath) || !mod.isAbsolute(notesDir))
        return invalid;
    const resolved = (0, linkedNotesLogic_1.normalizeLinkedPath)(notePath, platform);
    const parent = mod.dirname(resolved);
    if (parent === resolved)
        return invalid; // a root ('/', 'C:\')
    if ((0, linkedNotesLogic_1.linkedPathKey)(parent, platform) !== (0, linkedNotesLogic_1.linkedPathKey)(notesDir, platform))
        return invalid;
    const dir = mod.basename(resolved);
    if (!dir || dir === '.' || dir === '..' || dir.includes('/') || dir.includes('\\'))
        return invalid;
    return { ok: true, dir, sectionId };
}
/**
 * Resolves a section to the relPath the sync engine uploads it under:
 * '<dir>/<file>' where `file` is `sections[].file` of the section's entry in
 * note.md (fallback '<id>.md', same as parseNoteDir). A section that is NOT in
 * note.md also resolves to '<sectionId>.md' — that keeps the history of a
 * deleted section reachable. Local-only notes never reach the server and
 * password-protected notes keep their sections inside note.md →
 * 'unsupported-note'. The result must pass isSafeCloudRelPath and never be the
 * anchor itself; anything else is 'invalid-path'.
 */
function resolveSectionRelPath(dir, sectionId, noteMd) {
    const invalid = { ok: false, errorCode: 'invalid-path' };
    if (!isValidSectionId(sectionId))
        return invalid;
    if ((0, localOnlyNotes_1.isLocalOnlyNoteMd)(noteMd))
        return { ok: false, errorCode: 'unsupported-note' };
    const { frontmatter } = (0, noteFormat_1.splitFrontmatter)(noteMd);
    let data = {};
    if (frontmatter) {
        try {
            const loaded = js_yaml_1.default.load(frontmatter);
            if (loaded && typeof loaded === 'object')
                data = loaded;
        }
        catch {
            // Malformed YAML: same fallback as noteFormat.loadFrontmatter ({}), so the
            // section resolves to the '<id>.md' file the app and the sync really use.
        }
    }
    if (data.encryption)
        return { ok: false, errorCode: 'unsupported-note' };
    let file = `${sectionId}.md`;
    if (Array.isArray(data.sections)) {
        for (const sec of data.sections) {
            if (!sec || typeof sec !== 'object')
                continue;
            const entry = sec;
            if (entry.id == null || String(entry.id) !== sectionId)
                continue;
            file = entry.file != null ? String(entry.file) : `${sectionId}.md`;
            break;
        }
    }
    if (file === noteFormat_1.NOTE_MD || file.startsWith('.') || file.includes('/') || file.includes('\\'))
        return invalid;
    const relPath = `${dir}/${file}`;
    if (!(0, cloudSyncLogic_1.isSafeCloudRelPath)(relPath))
        return invalid;
    return { ok: true, relPath };
}
/** A version id from the renderer: a positive safe integer, or null (→ 'invalid-path'). */
function parseVersionId(id) {
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}
// ── Rows ──────────────────────────────────────────────────────────────────────
/**
 * Plaintext bytes behind a sealed blob of `sealedLength` characters. The blob
 * is unpadded base64url of (12-byte IV + n plaintext bytes + 16-byte GCM tag),
 * and floor(len * 3 / 4) recovers the exact byte count of unpadded base64, so
 * the estimate is exact for a well-formed blob. Fed with file_versions.size
 * (octet_length(content_ct) — the base64url string is ASCII). 0 when ≤ 0.
 */
function estimatePlaintextSize(sealedLength) {
    if (!Number.isFinite(sealedLength) || sealedLength <= 0)
        return 0;
    return Math.max(0, Math.floor((sealedLength * 3) / 4) - 28);
}
/** bigint columns may arrive as numbers or numeric strings. */
function parseBigint(value, min) {
    const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
    return typeof n === 'number' && Number.isSafeInteger(n) && n >= min ? n : null;
}
function parseIso(value) {
    if (typeof value !== 'string' || !value)
        return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function parseReason(value) {
    return typeof value === 'string' && REASONS.includes(value)
        ? value
        : null;
}
/** Metadata of one row, or null when any field is malformed. */
function parseVersionMeta(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const r = raw;
    const id = parseBigint(r.id, 1);
    const seq = parseBigint(r.seq, 0);
    const editedAt = parseIso(r.updated_at);
    const savedAt = parseIso(r.created_at);
    const reason = parseReason(r.reason);
    const size = typeof r.size === 'string' && r.size.trim() !== '' ? Number(r.size) : r.size;
    if (id === null || seq === null || editedAt === null || savedAt === null || reason === null)
        return null;
    if (typeof size !== 'number' || !Number.isFinite(size))
        return null;
    return { id, seq, editedAt, savedAt, size: estimatePlaintextSize(size), reason };
}
/**
 * Maps the list response to metadata: malformed rows are dropped (one bad row
 * never hides the rest), sorted by seq DESC then id DESC (newest replaced
 * content first). A non-array body maps to [].
 */
function mapVersionRows(json) {
    if (!Array.isArray(json))
        return [];
    const out = [];
    for (const raw of json) {
        const meta = parseVersionMeta(raw);
        if (meta)
            out.push(meta);
    }
    return out.sort((a, b) => b.seq - a.seq || b.id - a.id);
}
/**
 * Validates a single-version row. Malformed metadata (id/seq/updated_at/
 * reason/path_key) → 'unknown'; missing or non-string blobs → 'decrypt-failed'
 * (the content can't be opened). content_ct may be '' (decrypts to '').
 */
function parseVersionRow(raw) {
    if (!raw || typeof raw !== 'object')
        return { ok: false, errorCode: 'unknown' };
    const r = raw;
    const id = parseBigint(r.id, 1);
    const seq = parseBigint(r.seq, 0);
    const editedAt = parseIso(r.updated_at);
    const reason = parseReason(r.reason);
    if (id === null || seq === null || editedAt === null || reason === null)
        return { ok: false, errorCode: 'unknown' };
    if (typeof r.path_key !== 'string' || !r.path_key)
        return { ok: false, errorCode: 'unknown' };
    if (typeof r.content_ct !== 'string' || typeof r.key_ct !== 'string' || (r.content_ct && !r.key_ct)) {
        return { ok: false, errorCode: 'decrypt-failed' };
    }
    return { ok: true, id, seq, editedAt, reason, pathKey: r.path_key, contentCt: r.content_ct, keyCt: r.key_ct };
}
// ── Errors ────────────────────────────────────────────────────────────────────
/**
 * HTTP answer of a file_versions request → error code, or null when it is a
 * success. 404 / PGRST205 (table not in the schema cache) = a server without
 * the history migration: 'unavailable', not a hard error.
 */
function classifyVersionsHttp(status, json) {
    const code = json && typeof json === 'object' ? json.code : undefined;
    if (status === 404 || code === 'PGRST205')
        return 'unavailable';
    if (status >= 400 || status < 200)
        return 'unknown';
    return null;
}
/** An error thrown around a request (supabaseRest / fetch) → error code. */
function classifyVersionsError(err) {
    switch ((0, cloudAccessErrors_1.classifyCloudAccessError)(err)) {
        case 'notSignedIn':
            return 'not-signed-in';
        case 'locked':
            return 'session-locked';
        case 'unreachable':
            return 'unreachable';
        default:
            return 'unknown';
    }
}
/**
 * Same policy as cloudSync's restWithRetry — one retry after `delayMs` on a
 * thrown error (network) or a 5xx — except that signed-out / keychain-locked
 * failures are not retried: a second later the answer is the same.
 */
async function withOneRetry(fn, delayMs) {
    const wait = () => new Promise((r) => setTimeout(r, delayMs));
    try {
        const res = await fn();
        if (res.status >= 500) {
            await wait();
            return await fn();
        }
        return res;
    }
    catch (err) {
        const text = String(err);
        if (text.includes(cloudAccessErrors_1.NOT_SIGNED_IN_TAG) || text.includes(cloudAccessErrors_1.SESSION_LOCKED_TAG))
            throw err;
        await wait();
        return fn();
    }
}
/**
 * Console-safe text of an error (same rule as cloudSync's redactError): logs
 * never carry relPaths (they contain note titles), so Node fs errors — which
 * embed the file path — are logged by their code only.
 */
function redactVersionsError(err) {
    const e = err;
    if (e && typeof e === 'object' && typeof e.code === 'string' && e.path !== undefined)
        return e.code;
    return err instanceof Error ? err.message : String(err);
}
