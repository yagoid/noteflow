"use strict";
// Origin of the notes dir — which remote this device's notes dir belongs to,
// per sync backend. Backend-agnostic: GitHub Sync uses it today; NoteFlow Cloud
// (identity = account userId) and the CLI read and write the same key.
//
// The problem it solves: the local notes dir does not know which remote it was
// reconciled with. Connecting GitHub to repo A, disconnecting and connecting to
// repo B used to merge everything: A's notes were uploaded to B without asking.
// Now each backend remembers the identity it last reconciled the dir with
// (`settings.json → syncOrigin`, userData — LOCAL, never synced) and a change of
// identity with local notes on disk asks the user first (merge / use only the
// remote's notes / cancel).
//
// Shape of `settings.syncOrigin` (Cloud and the CLI read it — keep it stable):
//   { github?: { repoId: number; owner: string; repo: string; stale?: true },
//     cloud?:  { userId: string; email?: string; stale?: true } }
// `github.repoId` is GitHub's numeric repo id (survives renames and transfers);
// it is always written when known — the app fetches it before adopting an
// identity, so it is only missing if GET /repos/{owner}/{repo} failed at that
// moment (the next successful pull backfills it). Comparison: by repoId when
// both sides have it, else owner/repo case-insensitively. `cloud.email` is a
// LABEL only (the dialog shows it); Cloud compares by userId.
//
// `stale: true` (only ever written as `true`; absent = current): the notes on
// disk no longer come from that remote — the OTHER backend's "use only the
// notes from …" replaced them. A stale record asks before syncing whenever
// there are synced notes on disk, even with the same identity; without notes
// it is adopted again ('stale-empty', which resets that remote's state). Every
// adoption (withSyncOrigin) writes the record without it.
//
// Pure decision + pure helpers over a parsed settings object, plus thin file
// wrappers (fs only, no Electron) — same pattern as syncState.ts. Tested in
// tests/electron/syncOrigin.test.ts.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYNC_ORIGIN_KEY = void 0;
exports.sameIdentity = sameIdentity;
exports.identityLabel = identityLabel;
exports.identityArchiveLabel = identityArchiveLabel;
exports.sanitizeLabel = sanitizeLabel;
exports.readSyncOrigin = readSyncOrigin;
exports.getStoredIdentity = getStoredIdentity;
exports.resolveStoredCloudOrigin = resolveStoredCloudOrigin;
exports.withSyncOrigin = withSyncOrigin;
exports.withOriginMarkedStale = withOriginMarkedStale;
exports.decideOrigin = decideOrigin;
exports.hasSyncedLocalNotes = hasSyncedLocalNotes;
exports.readSettingsStrict = readSettingsStrict;
exports.writeSyncOriginFile = writeSyncOriginFile;
exports.markSyncOriginStaleFile = markSyncOriginStaleFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const settingsFile_1 = require("./settingsFile");
const localOnlyNotes_1 = require("./localOnlyNotes");
/** Key of the origin record inside settings.json. */
exports.SYNC_ORIGIN_KEY = 'syncOrigin';
// ── Comparison ────────────────────────────────────────────────────────────────
/**
 * Same remote? GitHub: by numeric repoId when BOTH sides carry it (a renamed or
 * transferred repo keeps its id), otherwise owner/repo case-insensitively
 * (GitHub names are case-insensitive). Cloud: by userId. Different kinds never match.
 */
function sameIdentity(a, b) {
    if (a.kind === 'github' && b.kind === 'github') {
        if (typeof a.repoId === 'number' && typeof b.repoId === 'number')
            return a.repoId === b.repoId;
        return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase();
    }
    if (a.kind === 'cloud' && b.kind === 'cloud')
        return a.userId === b.userId;
    return false;
}
/** Whether every stored field already equals the new identity's (nothing to rewrite). */
function identicalRecord(stored, next) {
    if (stored.kind === 'github' && next.kind === 'github') {
        return (stored.owner === next.owner &&
            stored.repo === next.repo &&
            (next.repoId === undefined || stored.repoId === next.repoId));
    }
    if (stored.kind === 'cloud' && next.kind === 'cloud') {
        // The email is only a label, but refreshing it keeps the dialog's text current.
        return stored.userId === next.userId && (next.email === undefined || stored.email === next.email);
    }
    return false;
}
// ── Labels ────────────────────────────────────────────────────────────────────
/** Human-readable label: 'owner/repo' for GitHub; for Cloud the recorded email, else the userId. */
function identityLabel(id) {
    return id.kind === 'github' ? `${id.owner}/${id.repo}` : id.email || id.userId;
}
/**
 * Folder-name-safe label of an identity, used to name its archive folder:
 * 'github-<owner>-<repo>' / 'cloud-<first 8 chars of the userId>'. Only
 * [a-z0-9._-], lowercased, bounded.
 */
function identityArchiveLabel(id) {
    const raw = id.kind === 'github' ? `github-${id.owner}-${id.repo}` : `cloud-${id.userId.slice(0, 8)}`;
    return sanitizeLabel(raw);
}
/** [a-z0-9._-] only (other runs → '-'), no leading dots/dashes, at most 80 chars; never empty. */
function sanitizeLabel(raw) {
    const cleaned = raw
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[.-]+/, '')
        .slice(0, 80)
        .replace(/[.-]+$/, '');
    return cleaned || 'origin';
}
// ── Reading / writing the record inside a parsed settings object ─────────────
function isObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}
/** Tolerant parse of `settings.syncOrigin` (malformed entries are ignored). */
function readSyncOrigin(settings) {
    const raw = settings[exports.SYNC_ORIGIN_KEY];
    if (!isObject(raw))
        return {};
    const out = {};
    const gh = raw.github;
    if (isObject(gh) && typeof gh.owner === 'string' && gh.owner && typeof gh.repo === 'string' && gh.repo) {
        out.github = { owner: gh.owner, repo: gh.repo };
        if (typeof gh.repoId === 'number' && Number.isFinite(gh.repoId))
            out.github = { repoId: gh.repoId, ...out.github };
        if (gh.stale === true)
            out.github.stale = true;
    }
    const cl = raw.cloud;
    if (isObject(cl) && typeof cl.userId === 'string' && cl.userId) {
        out.cloud = { userId: cl.userId };
        if (typeof cl.email === 'string' && cl.email)
            out.cloud.email = cl.email;
        if (cl.stale === true)
            out.cloud.stale = true;
    }
    return out;
}
/** The identity stored for one backend, or undefined (never reconciled / unknown). */
function getStoredIdentity(settings, kind) {
    const origin = readSyncOrigin(settings);
    if (kind === 'github') {
        const gh = origin.github;
        return gh
            ? {
                kind: 'github',
                owner: gh.owner,
                repo: gh.repo,
                ...(gh.repoId !== undefined ? { repoId: gh.repoId } : {}),
                ...(gh.stale ? { stale: true } : {}),
            }
            : undefined;
    }
    const cl = origin.cloud;
    return cl
        ? {
            kind: 'cloud',
            userId: cl.userId,
            ...(cl.email ? { email: cl.email } : {}),
            ...(cl.stale ? { stale: true } : {}),
        }
        : undefined;
}
/**
 * The Cloud origin of the notes dir, SEEDED from the sync state's owner when
 * no origin was ever recorded: an install from before this feature that used
 * Cloud has `settings.cloudSync.userId` (the account its pullSeq / journal
 * belong to) — that account IS where the notes on disk came from. Without the
 * seed, a user who signed out of A before updating and then signs in with B
 * would adopt B without being asked. `seeded: true` = the caller must persist
 * it (strictly) before anything overwrites cloudSync.userId. Nothing at all
 * (Cloud never used here) → undefined: the first connection adopts silently.
 */
function resolveStoredCloudOrigin(settings) {
    const stored = getStoredIdentity(settings, 'cloud');
    if (stored?.kind === 'cloud')
        return { identity: stored, seeded: false };
    const cloudSync = settings.cloudSync;
    const owner = isObject(cloudSync) ? cloudSync.userId : undefined;
    return typeof owner === 'string' && owner ? { identity: { kind: 'cloud', userId: owner }, seeded: true } : undefined;
}
/**
 * A copy of `settings` with the backend's origin set to `id` — always WITHOUT
 * `stale` (adopting means the notes on disk now belong to that remote). Every
 * other key — including the other backend's origin and unknown keys written
 * by a newer client — is preserved. Does not mutate the input.
 */
function withSyncOrigin(settings, id) {
    const current = isObject(settings[exports.SYNC_ORIGIN_KEY]) ? { ...settings[exports.SYNC_ORIGIN_KEY] } : {};
    if (id.kind === 'github') {
        current.github = {
            ...(typeof id.repoId === 'number' ? { repoId: id.repoId } : {}),
            owner: id.owner,
            repo: id.repo,
        };
    }
    else {
        current.cloud = { userId: id.userId, ...(id.email ? { email: id.email } : {}) };
    }
    return { ...settings, [exports.SYNC_ORIGIN_KEY]: current };
}
/**
 * A copy of `settings` with the backend's origin record marked `stale: true`
 * (the other backend's "use only the notes from …" just replaced the notes on
 * disk). No record for that backend → nothing is created (a backend never
 * reconciled here has nothing to protect). Every other key of the record and
 * of settings is preserved. Does not mutate the input.
 */
function withOriginMarkedStale(settings, kind) {
    const origin = settings[exports.SYNC_ORIGIN_KEY];
    if (!isObject(origin) || !isObject(origin[kind]))
        return settings;
    return { ...settings, [exports.SYNC_ORIGIN_KEY]: { ...origin, [kind]: { ...origin[kind], stale: true } } };
}
/**
 * Should syncing with `next` go ahead, or must the user choose first?
 * Asks only when there are synced notes on disk AND either the identity
 * changed or the stored record is stale (the notes came from the other
 * backend). `hasLocalNotes` is lazy — the dir is only listed when it matters —
 * and must answer true when it can't tell (fail-closed).
 */
function decideOrigin(input) {
    const { stored, next } = input;
    if (!stored)
        return { action: 'proceed', adopt: true, reason: 'no-origin' };
    if (stored.stale) {
        if (!input.hasLocalNotes())
            return { action: 'proceed', adopt: true, reason: 'stale-empty' };
        return { action: 'ask', previous: stored, next, stale: true };
    }
    if (sameIdentity(stored, next))
        return { action: 'proceed', adopt: !identicalRecord(stored, next), reason: 'same' };
    if (!input.hasLocalNotes())
        return { action: 'proceed', adopt: true, reason: 'changed-empty' };
    return { action: 'ask', previous: stored, next };
}
// ── IO wrappers (fs only) ─────────────────────────────────────────────────────
/**
 * Are there notes on disk that would sync (folders with a note.md, minus the
 * local-only ones)? Fail-closed: a notes dir that can't be listed — or isn't
 * given — answers true. An existing but EMPTY dir answers false.
 */
function hasSyncedLocalNotes(notesDir) {
    if (!notesDir)
        return true;
    try {
        fs_1.default.readdirSync(notesDir); // listNoteDirs swallows errors into [] — probe explicitly
    }
    catch (err) {
        // A notes dir that doesn't exist yet holds no notes.
        return err?.code !== 'ENOENT';
    }
    try {
        return (0, localOnlyNotes_1.listSyncedNoteDirs)(notesDir).length > 0;
    }
    catch {
        return true;
    }
}
/** settings.json parsed, or null when it can't be read/parsed (fail-closed callers). Missing file → {}. */
function readSettingsStrict(settingsPath) {
    let raw;
    try {
        raw = fs_1.default.readFileSync(settingsPath, 'utf-8');
    }
    catch (err) {
        return err?.code === 'ENOENT' ? {} : null;
    }
    try {
        const parsed = JSON.parse(raw);
        return isObject(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
/**
 * Read-modify-write of the backend's origin in settings.json: re-reads the file
 * right before writing so keys written by others (the CLI shares this file on
 * Windows) are kept. Refuses (returns false) when the file exists but can't be
 * parsed — writing would wipe it.
 */
function writeSyncOriginFile(settingsPath, id) {
    return updateSettingsFileStrict(settingsPath, (current) => withSyncOrigin(current, id));
}
/** Read-modify-write marking the backend's origin stale (withOriginMarkedStale); same refusals as writeSyncOriginFile. */
function markSyncOriginStaleFile(settingsPath, kind) {
    return updateSettingsFileStrict(settingsPath, (current) => withOriginMarkedStale(current, kind));
}
function updateSettingsFileStrict(settingsPath, update) {
    const current = readSettingsStrict(settingsPath);
    if (current === null)
        return false;
    try {
        fs_1.default.mkdirSync(path_1.default.dirname(settingsPath), { recursive: true });
        (0, settingsFile_1.writeSettingsFile)(settingsPath, update(current));
        return true;
    }
    catch {
        return false;
    }
}
