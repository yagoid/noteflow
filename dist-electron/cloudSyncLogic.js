"use strict";
// Pure logic for NoteFlow Cloud sync (phase 4.2, stage 2): row↔file mapping,
// timestamp resolution, conflict decisions and the encrypt/decrypt bridge
// between notes-dir-relative files and rows of public.files (migration 0004).
// Lives in electron/ but imports nothing from Electron — cloudSync.ts injects
// all IO — following the same pure-module pattern as syncState.ts /
// entitlements.ts. Covered by tests/electron/cloudSync.test.ts.
//
// Model recap (see .claude/context/monetization.md § 4): one row per file,
// keyed by an opaque deterministic path_key; every column *_ct is a sealed
// AES-256-GCM blob (cloudCrypto.ts); updated_at is plaintext ON PURPOSE — it is
// the basis of conflict resolution (note folder = unit of conflict, same rule
// as the GitHub Sync pull). The incremental pull does NOT use it as a cursor
// (it is the EDIT time, set by clients): it pages by `seq`, a change number the
// server assigns on every write (migration 0008).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOUD_PULL_COLUMNS = exports.CLOUD_METADATA_FILENAMES = void 0;
exports.noteDirOf = noteDirOf;
exports.isAnchorPath = isAnchorPath;
exports.isSafeCloudRelPath = isSafeCloudRelPath;
exports.listAnchorSectionFiles = listAnchorSectionFiles;
exports.extractUpdatedTimestamp = extractUpdatedTimestamp;
exports.parseUpdatedTimestamp = parseUpdatedTimestamp;
exports.resolveRowUpdatedAt = resolveRowUpdatedAt;
exports.shouldApplyRemoteDir = shouldApplyRemoteDir;
exports.shouldApplyRemoteSection = shouldApplyRemoteSection;
exports.shouldApplyRemoteDeletion = shouldApplyRemoteDeletion;
exports.groupEntriesByDir = groupEntriesByDir;
exports.planPullQuery = planPullQuery;
exports.parseRowSeq = parseRowSeq;
exports.nextPullSeq = nextPullSeq;
exports.buildFileUpsertRow = buildFileUpsertRow;
exports.decryptFileRow = decryptFileRow;
const js_yaml_1 = __importDefault(require("js-yaml"));
const noteFormat_1 = require("./noteFormat");
const cloudCrypto_1 = require("./cloudCrypto");
// Root-level JSON files that sync alongside the note folders.
// ⚠️ Keep in sync with METADATA_FILENAMES in githubSync.ts (private there).
exports.CLOUD_METADATA_FILENAMES = [
    'groups.json',
    'folders.json',
    'section-colors.json',
    'note-order.json',
    'templates.json',
    'ui-settings.json',
];
/** Columns every pull/anchor read selects (keep `seq`: it feeds the cursor). */
exports.CLOUD_PULL_COLUMNS = 'path_key,path_ct,content_ct,key_ct,updated_at,deleted,seq';
// ── Path mapping ──────────────────────────────────────────────────────────────
/**
 * Note directory of a notes-dir-relative path ('<dir>/<file>.md' → '<dir>'),
 * or null for root-level files (metadata json). The dir is the unit of both
 * the shared per-note key and conflict resolution.
 */
function noteDirOf(relPath) {
    const i = relPath.indexOf('/');
    return i > 0 ? relPath.slice(0, i) : null;
}
/** True for '<dir>/note.md' — the anchor whose `updated:` decides conflicts. */
function isAnchorPath(relPath) {
    const dir = noteDirOf(relPath);
    return dir !== null && relPath === `${dir}/${noteFormat_1.NOTE_MD}`;
}
/**
 * Whether a DECRYPTED relPath is safe to write inside the notes dir. Pulled
 * paths come from server-stored ciphertext — a compromised server can't forge
 * them (GCM would fail without the DEK), but defense in depth costs nothing:
 * only '<dir>/<file>.md' (one level deep) or a known root metadata json,
 * never traversal segments or separators that escape the notes dir.
 */
function isSafeCloudRelPath(relPath) {
    if (!relPath || relPath.includes('\\') || relPath.startsWith('/'))
        return false;
    const parts = relPath.split('/');
    if (parts.some((p) => !p || p === '.' || p === '..'))
        return false;
    if (parts.length === 1)
        return exports.CLOUD_METADATA_FILENAMES.includes(relPath);
    return parts.length === 2 && parts[1].endsWith('.md');
}
/**
 * Section files a note.md (anchor) references: `sections[].file` of its
 * frontmatter (fallback '<id>.md', same as parseNoteDir), deduped. Encrypted
 * notes keep everything inside note.md → []. Only plain one-level '.md'
 * filenames survive (no separators, no dot segments, never note.md itself) —
 * the pull uses this list to fetch the sections of an anchor it applies that
 * did not travel in the same batch. Mirror: listAnchorSectionFiles in cli/noteflow.js.
 */
function listAnchorSectionFiles(anchorContent) {
    const { frontmatter } = (0, noteFormat_1.splitFrontmatter)(anchorContent);
    if (!frontmatter)
        return [];
    let data;
    try {
        data = js_yaml_1.default.load(frontmatter);
    }
    catch {
        return [];
    }
    if (!data || typeof data !== 'object')
        return [];
    const fm = data;
    if (fm.encryption || !Array.isArray(fm.sections))
        return [];
    const files = [];
    for (const sec of fm.sections) {
        if (!sec || typeof sec !== 'object')
            continue;
        const { id, file } = sec;
        const name = file != null ? String(file) : id != null ? `${String(id)}.md` : null;
        if (name === null || !isPlainSectionFilename(name) || files.includes(name))
            continue;
        files.push(name);
    }
    return files;
}
function isPlainSectionFilename(name) {
    return (name.endsWith('.md') &&
        name !== noteFormat_1.NOTE_MD &&
        !name.includes('/') &&
        !name.includes('\\') &&
        !name.startsWith('.'));
}
// ── Timestamps ────────────────────────────────────────────────────────────────
// Same regex-based extraction as githubSync.ts (private there): the `updated:`
// value of the note.md frontmatter, without a full YAML parse.
function extractUpdatedTimestamp(content) {
    const match = content.match(/^updated:\s*['"]?([^'"\n]+)['"]?\s*$/m);
    return match ? match[1].trim() : null;
}
function parseUpdatedTimestamp(value) {
    if (!value)
        return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
/**
 * updated_at of a pushed row. Decision (documented in monetization.md § 4):
 *   - '<dir>/note.md'   → its own frontmatter `updated:`;
 *   - '<dir>/<sec>.md'  → the ANCHOR's `updated:` (anchorContent read from disk
 *     by the engine) — sections carry no own timestamp, and inheriting the
 *     anchor's guarantees a note edit lands as one coherent group in the
 *     incremental pull window of other devices;
 *   - root metadata json → nowIso (write time — these files have no frontmatter);
 *   - fallback nowIso when the frontmatter is missing or unparseable.
 * Always normalized to ISO so Postgres timestamptz comparisons are exact.
 */
function resolveRowUpdatedAt(relPath, content, anchorContent, nowIso) {
    const dir = noteDirOf(relPath);
    if (dir === null)
        return nowIso;
    const source = isAnchorPath(relPath) ? content : anchorContent;
    const ms = parseUpdatedTimestamp(extractUpdatedTimestamp(source ?? ''));
    return ms === null ? nowIso : new Date(ms).toISOString();
}
// ── Conflict decisions (mirror of the GitHub Sync pull rules) ─────────────────
/**
 * Should the pull write a remote note dir over the local one? Newer remote
 * anchor wins WHOLESALE; missing local = fresh note from another device.
 * Unparseable remote timestamp → never apply (can't reason about it).
 */
function shouldApplyRemoteDir(remoteUpdatedMs, localUpdatedMs) {
    if (remoteUpdatedMs === null)
        return false;
    if (localUpdatedMs === null)
        return true;
    return remoteUpdatedMs > localUpdatedMs;
}
/**
 * Should the pull apply ONE remote section row ('<dir>/<sec>.md', content or
 * tombstone) on its own, when its folder's anchor is not being applied (absent
 * from the batch, or not newer than the local one) and the folder exists
 * locally? Sections inherit the `updated:` of their anchor's version
 * (resolveRowUpdatedAt), so:
 *   - `>=` covers "same version, the section reached the server after the
 *     anchor" (the anchor was applied — or written here — before);
 *   - a local folder with its own newer edits has a strictly greater
 *     `updated`, and is respected.
 * Unparseable/unknown local timestamp → apply (same stance as
 * shouldApplyRemoteDir); unknown remote timestamp → never apply.
 */
function shouldApplyRemoteSection(sectionUpdatedMs, localUpdatedMs) {
    if (sectionUpdatedMs === null)
        return false;
    if (localUpdatedMs === null)
        return true;
    return sectionUpdatedMs >= localUpdatedMs;
}
/**
 * Should a remote tombstone delete the local copy? Safety rule shared with the
 * GitHub pull: only when the local `updated` is <= lastSync — i.e. the remote
 * knew this state and deleted it since. Newer local edits win (they'll be
 * re-pushed); no lastSync (first reconcile) or unknown age → never delete.
 */
function shouldApplyRemoteDeletion(localUpdatedMs, lastSyncMs) {
    if (lastSyncMs === null)
        return false;
    if (localUpdatedMs === null)
        return false;
    return localUpdatedMs <= lastSyncMs;
}
// ── Pull grouping / cursor (seq) ──────────────────────────────────────────────
/** Splits decrypted pull entries into note-dir groups + root-level files. */
function groupEntriesByDir(entries) {
    const dirs = new Map();
    const rootFiles = [];
    for (const e of entries) {
        const dir = noteDirOf(e.relPath);
        if (dir === null) {
            rootFiles.push(e);
            continue;
        }
        let group = dirs.get(dir);
        if (!group) {
            group = [];
            dirs.set(dir, group);
        }
        group.push(e);
    }
    return { dirs, rootFiles };
}
/**
 * Picks the pull mode from the persisted sync state:
 *   - `pullSeq` known → incremental from it, tombstones included;
 *   - no `pullSeq` but a legacy `pullCursor` or a `lastSync` (device coming
 *     from the updated_at-cursor version) → ONE full reconcile from seq 0,
 *     tombstones included: it also recovers whatever the old cursor skipped
 *     (the conflict rules decide what gets applied);
 *   - nothing (first sync) → full, live rows only — with no lastSync there is
 *     nothing local that a tombstone could safely delete.
 */
function planPullQuery(s) {
    if (typeof s.pullSeq === 'number' && Number.isSafeInteger(s.pullSeq) && s.pullSeq >= 0) {
        return { afterSeq: s.pullSeq, includeDeleted: true };
    }
    if (s.pullCursor || s.lastSync)
        return { afterSeq: 0, includeDeleted: true };
    return { afterSeq: 0, includeDeleted: false };
}
/** A row's seq as a safe non-negative integer, or null (bigint may arrive as a string). */
function parseRowSeq(value) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
/**
 * Advances the incremental-pull watermark to the max `seq` of ALL fetched rows
 * — undecryptable and unsafe-path rows included: they will never become
 * decryptable/safe, so waiting on them would re-fetch them forever. Starts at
 * 0 when there was no watermark, so a pull that saw nothing still leaves the
 * device in seq mode. `seq` is assigned by the server on every write
 * (migration 0008) and, per user, becomes visible in order — unlike
 * updated_at, which is the client's EDIT time and would let late uploads fall
 * below the cursor.
 */
function nextPullSeq(current, rows) {
    let max = typeof current === 'number' && Number.isSafeInteger(current) && current >= 0 ? current : 0;
    for (const row of rows) {
        const seq = parseRowSeq(row.seq);
        if (seq !== null && seq > max)
            max = seq;
    }
    return max;
}
// ── Row crypto (cloudCrypto only — no IO) ─────────────────────────────────────
/**
 * Builds the encrypted upsert row for a file. All rows of the same note folder
 * must be built with the SAME noteKey (the engine caches one key per dir);
 * root metadata files get their own per-file key.
 */
async function buildFileUpsertRow(dek, noteKey, relPath, content, updatedAt, deleted = false) {
    return {
        path_key: await (0, cloudCrypto_1.derivePathKeyHmac)(dek, relPath),
        path_ct: await (0, cloudCrypto_1.encryptContent)(noteKey, relPath),
        content_ct: deleted ? '' : await (0, cloudCrypto_1.encryptContent)(noteKey, content),
        key_ct: await (0, cloudCrypto_1.wrapKey)(noteKey, dek),
        updated_at: updatedAt,
        deleted,
    };
}
/**
 * Decrypts a pulled row back to a relPath + content. Throws on a wrong DEK or
 * tampered blobs (GCM auth). Tombstones (deleted, blank content_ct) decrypt to
 * an empty content — their path_ct/key_ct stay intact server-side.
 */
async function decryptFileRow(dek, row) {
    const noteKey = await (0, cloudCrypto_1.unwrapKey)(row.key_ct, dek);
    const relPath = await (0, cloudCrypto_1.decryptContent)(noteKey, row.path_ct);
    const content = row.deleted || !row.content_ct ? '' : await (0, cloudCrypto_1.decryptContent)(noteKey, row.content_ct);
    const updatedAtMs = Date.parse(row.updated_at);
    return {
        relPath,
        content,
        noteKey,
        updatedAt: row.updated_at,
        updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
        deleted: row.deleted,
    };
}
