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
exports.CLOUD_MERGEABLE_METADATA = exports.PULL_RETRY_CHUNK = exports.PULL_RETRY_MAX_APPLY_ATTEMPTS = exports.PULL_RETRY_MAX_DECRYPT_ATTEMPTS = exports.CLOUD_CONDITIONAL_UPSERT_RPC = exports.CLOUD_PAGE_SIZE = exports.CLOUD_PULL_COLUMNS = exports.CLOUD_METADATA_FILENAMES = void 0;
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
exports.collectSeqPages = collectSeqPages;
exports.parseRowSeq = parseRowSeq;
exports.nextPullSeq = nextPullSeq;
exports.buildFileUpsertRow = buildFileUpsertRow;
exports.decryptFileRow = decryptFileRow;
exports.classifyConditionalUpsert = classifyConditionalUpsert;
exports.parsePullRetry = parsePullRetry;
exports.mergeRetryRows = mergeRetryRows;
exports.nextPullRetry = nextPullRetry;
exports.countDroppedRetries = countDroppedRetries;
exports.shouldResetCloudState = shouldResetCloudState;
exports.isMergeableMetadata = isMergeableMetadata;
exports.mergeMetadataById = mergeMetadataById;
exports.metadataPendingForPull = metadataPendingForPull;
exports.planMetadataPull = planMetadataPull;
exports.planRemoteDelete = planRemoteDelete;
exports.planLocalPush = planLocalPush;
exports.planConflictCopy = planConflictCopy;
exports.anchorTitle = anchorTitle;
exports.conflictCopyTitle = conflictCopyTitle;
exports.buildConflictCopy = buildConflictCopy;
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
/** Rows per page of every Cloud listing — PostgREST caps responses (Supabase default max-rows 1000). */
exports.CLOUD_PAGE_SIZE = 1000;
/**
 * Reads a WHOLE `public.files` listing by KEYSET pagination over `seq`:
 * `fetchPage(after)` must request `order=seq.asc&seq=gt.<after>&limit=<pageSize>`
 * (plus its own filters) and resolve with that page — or throw. Stops at the
 * first short page. Not offsets/Range: an upsert moves a row to a higher seq,
 * so an offset window shifts mid-listing and can skip rows; a keyset can't.
 * A full page whose last seq doesn't move the keyset forward throws (it would
 * loop forever). Any failed page propagates: the callers never act on a
 * partial listing — a capped listing is exactly how a note deletion used to
 * tombstone nothing and still be marked done. Used by the pull
 * (fetchChangedRows) and by the deletion listing (listRemotePaths).
 * Mirror: collectSeqPages in cli/noteflow.js.
 */
async function collectSeqPages(fetchPage, afterSeq, pageSize = exports.CLOUD_PAGE_SIZE, errorLabel = 'Cloud listing failed') {
    const rows = [];
    let after = afterSeq;
    for (;;) {
        const page = await fetchPage(after);
        rows.push(...page);
        if (page.length < pageSize)
            return rows;
        const last = parseRowSeq(page[page.length - 1].seq);
        if (last === null || last <= after)
            throw new Error(`${errorLabel} (invalid seq paging)`);
        after = last;
    }
}
/** A row's seq as a safe non-negative integer, or null (bigint may arrive as a string). */
function parseRowSeq(value) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
/**
 * Advances the incremental-pull watermark to the max `seq` of ALL fetched rows
 * — rows that failed to apply or decrypt included: holding the watermark on
 * them would re-fetch the whole tail forever. Failed rows are kept alive by
 * the pull retry set instead (settings.cloudSync.pullRetry, see
 * nextPullRetry), persisted in the same write as the watermark. Starts at
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
// ── Conditional uploads (migration 0011) ──────────────────────────────────────
/** RPC of migration 0011 that note rows go through ('<dir>/note.md' and its sections). */
exports.CLOUD_CONDITIONAL_UPSERT_RPC = 'cloud_upsert_file';
function classifyConditionalUpsert(status, json) {
    const code = json && typeof json === 'object' ? json.code : undefined;
    if (status === 404 || code === 'PGRST202')
        return 'missing';
    if (status === 403)
        return 'forbidden';
    if (status >= 400)
        return 'error';
    return json === false ? 'stale' : 'uploaded';
}
/** Undecryptable rows are given up after this many pulls (permanent corruption must not keep the error forever). */
exports.PULL_RETRY_MAX_DECRYPT_ATTEMPTS = 5;
/**
 * Rows that fail to APPLY are given up after this many pulls (~hours of
 * 5-minute safety-net pulls, more with Realtime): enough for a transient lock
 * (antivirus, sync client) to clear, while a permanent local error
 * (ENAMETOOLONG, EACCES) doesn't block "Mirror to GitHub" and show the error
 * forever.
 */
exports.PULL_RETRY_MAX_APPLY_ATTEMPTS = 50;
/** Path keys per `path_key=in.(…)` request of the retry re-fetch (keeps the URL short). */
exports.PULL_RETRY_CHUNK = 100;
/** Tolerant read of settings.cloudSync.pullRetry: malformed entries are dropped. */
function parsePullRetry(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return out;
    for (const [key, value] of Object.entries(raw)) {
        if (!key || !value || typeof value !== 'object')
            continue;
        const v = value;
        const attempts = typeof v.attempts === 'number' && Number.isFinite(v.attempts) && v.attempts >= 0 ? v.attempts : 0;
        out[key] = typeof v.relPath === 'string' ? { relPath: v.relPath, attempts } : { attempts };
    }
    return out;
}
/**
 * The pull batch: the main incremental fetch plus the rows re-fetched for the
 * retry set, deduped by path_key — the main fetch wins (same row, and it
 * carries the seq that feeds the watermark).
 */
function mergeRetryRows(mainRows, retryRows) {
    const seen = new Set(mainRows.map((r) => r.path_key));
    const out = [...mainRows];
    for (const row of retryRows) {
        if (seen.has(row.path_key))
            continue;
        seen.add(row.path_key);
        out.push(row);
    }
    return out;
}
/**
 * Retry set to persist after a pull. Built from this pull's failures ONLY:
 * every row of the previous set was re-fetched into the batch, so a key that
 * did not fail again either applied (leaves) or is gone from the server
 * (nothing to apply — leaves too). Apply failures are dropped once they
 * reach PULL_RETRY_MAX_APPLY_ATTEMPTS (a permanent local error must not keep
 * the error forever), decrypt failures once they reach
 * PULL_RETRY_MAX_DECRYPT_ATTEMPTS. Unsafe-path rows never enter (permanent).
 * Callers count what was dropped with countDroppedRetries (log a count only).
 * Mirror: nextPullRetry in cli/noteflow.js.
 */
function nextPullRetry(prev, failures, maxDecryptAttempts = exports.PULL_RETRY_MAX_DECRYPT_ATTEMPTS, maxApplyAttempts = exports.PULL_RETRY_MAX_APPLY_ATTEMPTS) {
    const next = {};
    const decided = new Set();
    for (const [key, relPath] of failures.apply) {
        decided.add(key);
        const attempts = (prev[key]?.attempts ?? 0) + 1;
        if (attempts < maxApplyAttempts)
            next[key] = { relPath, attempts };
    }
    for (const key of failures.decrypt) {
        if (decided.has(key))
            continue;
        decided.add(key);
        const attempts = (prev[key]?.attempts ?? 0) + 1;
        if (attempts < maxDecryptAttempts)
            next[key] = { attempts };
    }
    return next;
}
/** How many of this pull's failed rows nextPullRetry gave up on (reached their max attempts). */
function countDroppedRetries(failures, next) {
    const keys = new Set([...failures.apply.keys(), ...failures.decrypt]);
    let dropped = 0;
    for (const key of keys)
        if (!next[key])
            dropped++;
    return dropped;
}
// ── Account owner of the sync state ───────────────────────────────────────────
/**
 * Must the persisted Cloud sync state (pullSeq/lastSync/pullRetry, the journal,
 * the note-key cache) be discarded for the signed-in account? Only when its
 * recorded owner is ANOTHER account: a foreign watermark would skip every row
 * of this account below it, and a foreign journal would replay the other
 * account's edits/deletions here. An unknown owner (state written before the
 * owner was recorded) is ADOPTED by the caller, not reset — resetting is not
 * free (the first full pull skips tombstones, so notes deleted elsewhere would
 * stay on disk). Signed out (no current user) → nothing to compare. Same
 * semantics as the CLI's cliCloudForUser.
 */
function shouldResetCloudState(storedOwner, currentUserId) {
    if (!currentUserId || !storedOwner)
        return false;
    return storedOwner !== currentUserId;
}
// ── Root metadata merge (first sync / unsynced local edits) ───────────────────
/** Root metadata files that are arrays of `{ id }` objects and can be merged by id. */
exports.CLOUD_MERGEABLE_METADATA = ['groups.json', 'folders.json', 'templates.json'];
function isMergeableMetadata(relPath) {
    return exports.CLOUD_MERGEABLE_METADATA.includes(relPath);
}
function parseIdArray(json) {
    if (json === null)
        return null;
    let data;
    try {
        data = JSON.parse(json);
    }
    catch {
        return null;
    }
    if (!Array.isArray(data))
        return null;
    for (const item of data) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            return null;
        if (typeof item.id !== 'string')
            return null;
    }
    return data;
}
/**
 * Union by `id` of two metadata JSON arrays (groups.json / folders.json /
 * templates.json — arrays of objects with a string id). Colliding ids take the
 * `prefer` side's object; the preferred side's order comes first, then the
 * other side's extras in their order. Returns the merged JSON in the app's
 * on-disk format (2-space indent), or null when either side isn't such an
 * array (not mergeable — the caller picks a side). These entries have no
 * tombstones, so one deleted on a single side comes back from the other:
 * accepted — losing a device's groups/folders/templates is worse.
 */
function mergeMetadataById(localJson, remoteJson, prefer) {
    const local = parseIdArray(localJson);
    const remote = parseIdArray(remoteJson);
    if (!local || !remote)
        return null;
    const [first, second] = prefer === 'local' ? [local, remote] : [remote, local];
    const ids = new Set();
    const merged = [];
    for (const item of [...first, ...second]) {
        if (ids.has(item.id))
            continue;
        ids.add(item.id);
        merged.push(item);
    }
    return JSON.stringify(merged, null, 2);
}
/**
 * Whether the pull treats a root metadata file as an UNSYNCED LOCAL EDIT
 * (planMetadataPull's `pendingUpsert`). Never on the first pull of a device or
 * account (`firstPull`): a pending op there may be a gate-closed journal entry
 * (fresh device with e2ee locked, a restart after a failed first sync, the
 * boot-time ui-settings seed, an account switch) — honoring it would keep the
 * local file and the first-sync catch-up would push it over the account's copy
 * (account A's ui-settings/note-order into account B). The first pull keeps
 * its documented rule instead: backup, then remote wins / union preferring
 * remote; the op is settled and the catch-up uploads what ended on disk.
 * Mirror: metadataPendingForPull in cli/noteflow.js.
 */
function metadataPendingForPull(pendingUpsert, firstPull) {
    return pendingUpsert && !firstPull;
}
/**
 * Pull decision for a root metadata file (remote content vs the local file):
 *   - identical → keep;
 *   - pending local upsert (an unsynced local edit — the pull runs BEFORE the
 *     journal drain): mergeable files get the union preferring LOCAL (the op
 *     stays and uploads it); the others keep the local file (local wins, the
 *     drain uploads it);
 *   - first pull of this device/account (no previous lastSync): the local file
 *     is backed up before being overwritten; mergeable files get the union
 *     preferring REMOTE (the first-sync catch-up then uploads it), the others
 *     take the remote;
 *   - otherwise → remote wins (LWW, as the GitHub pull).
 * An unmergeable pair (malformed JSON on either side) falls back to the
 * non-merge rule of its case. `backup` is only ever set on the first pull.
 */
function planMetadataPull(relPath, localContent, remoteContent, opts) {
    if (localContent === remoteContent)
        return { action: 'keep' };
    const backup = opts.firstPull && localContent !== null;
    if (opts.pendingUpsert) {
        if (localContent === null)
            return { action: 'write', content: remoteContent, backup: false, merged: false };
        const merged = isMergeableMetadata(relPath) ? mergeMetadataById(localContent, remoteContent, 'local') : null;
        if (merged === null || merged === localContent)
            return { action: 'keep' };
        return { action: 'write', content: merged, backup, merged: true };
    }
    if (opts.firstPull && localContent !== null && isMergeableMetadata(relPath)) {
        const merged = mergeMetadataById(localContent, remoteContent, 'remote');
        if (merged !== null) {
            return merged === localContent
                ? { action: 'keep' }
                : { action: 'write', content: merged, backup, merged: true };
        }
    }
    return { action: 'write', content: remoteContent, backup, merged: false };
}
/**
 * Decides how a remote delete proceeds — a two-step decision: call it first
 * WITHOUT `patchStatus` (what to try), then again with the tombstone PATCH's
 * HTTP status (what to do with its answer).
 *
 * Deletes are tombstones (PATCH deleted=true) so other devices see them on
 * their incremental pull. RLS gates that UPDATE on the cloud entitlement, so a
 * user KNOWN to have no subscription falls back to a physical DELETE (allowed
 * by ownership alone; other devices are not notified — they can't push either).
 * That fallback is destructive for every other device, so it is only taken on
 * a VERIFIED entitlement: one fetched in this run. Unknown entitlements (never
 * fetched) and the on-disk cache (`verified: false`) only ever tombstone; a 403
 * then means 'defer' — the caller throws, the op stays journaled and is retried
 * once the entitlements are verified.
 *  - entitled: the local view says the cloud entitlement is active.
 *  - verified: that view comes from a fetch made in this run.
 *  - patchStatus: HTTP status of the tombstone PATCH (omit on the first step).
 */
function planRemoteDelete(s) {
    if (s.patchStatus === undefined)
        return s.entitled || !s.verified ? 'tombstone' : 'delete';
    if (s.patchStatus < 400)
        return 'done';
    if (s.patchStatus !== 403)
        return 'fail';
    // 403 from RLS: no active entitlement server-side. Only a verified local view
    // may fall through to the physical DELETE (a stale verified `true` included).
    return s.verified ? 'delete' : 'defer';
}
function planLocalPush(s) {
    if (!s.enabled || !s.configured)
        return 'ignore';
    return s.initialPullStatus === 'ok' ? 'push' : 'journal';
}
// ── Conflict copies (offline edit vs a newer remote version) ──────────────────
// The pull is last-writer-wins per note folder. When it is about to overwrite
// (newer remote anchor, applied wholesale) or delete (anchor tombstone over a
// known-lost version) a folder that still holds a local edit the server never
// accepted (a pending upsert in the journal), that edit would vanish silently
// everywhere. Instead the LOCAL version is first kept as a conflict copy — a
// new note folder with a new id — and the pull then proceeds as before.
// Mirror: planConflictCopy / buildConflictCopy in cli/noteflow.js.
/** note.md minus its top-level `updated:` line (every save rewrites it). */
function anchorWithoutUpdated(content) {
    return content.replace(/\r\n/g, '\n').replace(/^updated:[^\n]*(\n|$)/m, '');
}
/**
 * Does the pull have to keep a conflict copy before overwriting/deleting a
 * folder? `candidates` = the pending upserts under '<dir>/' not yet copied
 * (conflictCopyCandidates, syncState.ts); `local` = their content on disk
 * (null / absent = the file no longer exists → contributes nothing);
 * `server` = the content each path will have after the apply (null / absent =
 * deleted, unknown or not on the server). A copy is needed iff some pending
 * path exists locally and differs from the server's: the anchor (note.md) is
 * compared WITHOUT its `updated:` line (it always differs), sections
 * byte-for-byte. For an anchor tombstone every server content is null → a copy
 * whenever a pending file still exists locally.
 *
 * Encrypted notes (an `encryption:` block in note.md, no section files): only
 * the anchor can be compared, and re-encrypting changes the iv/ciphertext even
 * when the plaintext is identical — so a copy is usually made even for "the
 * same" content. That is deliberate and safe: the main process cannot decrypt
 * the note to tell, and a superfluous copy costs far less than a lost edit.
 */
function planConflictCopy(candidates, local, server) {
    for (const relPath of candidates) {
        const mine = local[relPath];
        if (mine === null || mine === undefined)
            continue;
        const theirs = server[relPath];
        if (theirs === null || theirs === undefined)
            return true;
        const differs = isAnchorPath(relPath)
            ? anchorWithoutUpdated(mine) !== anchorWithoutUpdated(theirs)
            : mine !== theirs;
        if (differs)
            return true;
    }
    return false;
}
// js-yaml parses unquoted ISO timestamps as Date objects: back to ISO strings
// (what the app itself writes) before re-dumping the frontmatter.
function datesToIso(value) {
    if (value instanceof Date)
        return value.toISOString();
    if (Array.isArray(value))
        return value.map(datesToIso);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value))
            out[k] = datesToIso(v);
        return out;
    }
    return value;
}
function loadAnchorFrontmatter(anchorContent) {
    const { frontmatter, body } = (0, noteFormat_1.splitFrontmatter)(anchorContent);
    if (!frontmatter)
        return null;
    let data;
    try {
        data = js_yaml_1.default.load(frontmatter);
    }
    catch {
        return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return null;
    return { data: datesToIso(data), body };
}
/** Title of a note.md (same default as the parsers: 'Untitled'). */
function anchorTitle(anchorContent) {
    const fm = loadAnchorFrontmatter(anchorContent);
    const title = fm?.data.title;
    return title === undefined || title === null || title === '' ? 'Untitled' : String(title);
}
/**
 * Title of a conflict copy: '<original> (<label> YYYY-MM-DD HH:mm)', local
 * time. `label` comes localized from the caller ("conflict copy").
 */
function conflictCopyTitle(original, label, now) {
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
    return `${original} (${label} ${stamp})`;
}
/**
 * Builds the conflict copy of a local note folder (`localFiles`: filename →
 * content, note.md required). The note.md frontmatter keeps EVERYTHING
 * (group, folder, tags, created, archived, favorited, expiresAt, the sections
 * list with the same `file` names, the encryption block…) except `id`,
 * `title` and `updated` (= nowIso), re-dumped with the same yaml options as
 * serializeNoteFolder; section files are copied byte-for-byte under the same
 * filenames, so `sections[].file` stays valid. An encrypted note keeps its
 * encryption block: the copy opens with the same password (the title is clear
 * frontmatter, so it is renamed all the same). Dir = '<slug>-<newId>' with the
 * app's slug rule (noteDirname). Throws when note.md is missing or its
 * frontmatter is unreadable — the caller must then NOT overwrite the folder.
 */
function buildConflictCopy(localFiles, opts) {
    const anchor = localFiles[noteFormat_1.NOTE_MD];
    if (anchor === undefined)
        throw new Error('conflict copy: the local folder has no note.md');
    const fm = loadAnchorFrontmatter(anchor);
    if (!fm)
        throw new Error('conflict copy: unreadable note.md frontmatter');
    // Assigning existing keys keeps their position in the dump.
    const data = { ...fm.data, id: opts.newId, title: opts.title, updated: opts.nowIso };
    const yamlStr = js_yaml_1.default.dump(data, { lineWidth: -1, quotingType: '"' });
    const files = { [noteFormat_1.NOTE_MD]: `---\n${yamlStr}---\n${fm.body}` };
    for (const [name, content] of Object.entries(localFiles)) {
        if (name !== noteFormat_1.NOTE_MD)
            files[name] = content;
    }
    return { dir: (0, noteFormat_1.noteDirname)(opts.newId, opts.title), files };
}
