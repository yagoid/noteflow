"use strict";
// NoteFlow Cloud per-section version history (I/O). Lists and decrypts the
// rows a server trigger keeps in public.file_versions (the previous content of
// a files row each time its content_ct changes), and asks the server to keep
// the CURRENT content as one more version before the renderer restores an old
// one (snapshot). Pure logic in cloudVersionsLogic.ts; IPC in main.ts
// (cloud:versions-list / cloud:versions-get / cloud:versions-snapshot).
//
// Never returns key material (DEK, note keys) nor the path_key, and never a raw
// error message: every failure is a CloudVersionsErrorCode. Does NOT require
// cloudSync.enabled — the history belongs to the account, so it stays readable
// while signed in with the keys unlocked even after turning Cloud sync off.
//
// Restoring a version has no IPC on purpose: the renderer writes the old text
// as a normal edit, the sync engine uploads it, and the trigger saves the
// replaced content as one more version. The trigger keeps at most one 'edit'
// version per file every 10 minutes, so the renderer first calls the snapshot
// (RPC cloud_snapshot_file, migration 0017): the text about to be replaced is
// then guaranteed to be in the history.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSectionVersions = listSectionVersions;
exports.getSectionVersion = getSectionVersion;
exports.snapshotSectionVersion = snapshotSectionVersion;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const account = __importStar(require("./account"));
const cloudKeys = __importStar(require("./cloudKeys"));
const cloudSync = __importStar(require("./cloudSync"));
const cloudConfig_1 = require("./cloudConfig");
const cloudCrypto_1 = require("./cloudCrypto");
const noteFormat_1 = require("./noteFormat");
const cloudVersionsLogic_1 = require("./cloudVersionsLogic");
const DEFAULT_DEPS = {
    isConfigured: cloudConfig_1.isCloudConfigured,
    isSignedIn: () => account.getAccountStatus().signedIn,
    getDek: () => cloudKeys.getDek(),
    rest: (endpoint) => cloudKeys.supabaseRest(endpoint),
    restPost: (endpoint, body) => cloudKeys.supabaseRest(endpoint, { method: 'POST', body }),
    flushPath: (notesDir, relPath) => cloudSync.flushPathForSnapshot(notesDir, relPath),
    retryDelayMs: 1000,
    platform: process.platform,
};
const fail = (errorCode) => ({ ok: false, errorCode });
/** The gates + the section's relPath and path_key, shared by list, get and snapshot. */
async function resolvePathKey(notesDir, target, deps) {
    if (!deps.isConfigured())
        return fail('unavailable');
    if (!deps.isSignedIn())
        return fail('not-signed-in');
    const dek = deps.getDek();
    if (!dek)
        return fail('locked');
    const parsed = (0, cloudVersionsLogic_1.parseVersionTarget)(notesDir, target, deps.platform);
    if (!parsed.ok)
        return parsed;
    let noteMd;
    try {
        noteMd = fs_1.default.readFileSync(path_1.default.join(notesDir, parsed.dir, noteFormat_1.NOTE_MD), 'utf-8');
    }
    catch {
        return fail('invalid-path');
    }
    const resolved = (0, cloudVersionsLogic_1.resolveSectionRelPath)(parsed.dir, parsed.sectionId, noteMd);
    if (!resolved.ok)
        return resolved;
    return { ok: true, dek, pathKey: await (0, cloudCrypto_1.derivePathKeyHmac)(dek, resolved.relPath), relPath: resolved.relPath };
}
function logUnexpected(op, err) {
    console.error(`[CloudVersions] ${op} failed:`, (0, cloudVersionsLogic_1.redactVersionsError)(err));
}
/** Versions of one section, newest replaced content first (metadata only). */
async function listSectionVersions(notesDir, target, overrides = {}) {
    const deps = { ...DEFAULT_DEPS, ...overrides };
    try {
        const key = await resolvePathKey(notesDir, target, deps);
        if (!key.ok)
            return key;
        const res = await (0, cloudVersionsLogic_1.withOneRetry)(() => deps.rest((0, cloudVersionsLogic_1.versionListEndpoint)(key.pathKey)), deps.retryDelayMs);
        const httpError = (0, cloudVersionsLogic_1.classifyVersionsHttp)(res.status, res.json);
        if (httpError) {
            if (httpError === 'unknown')
                console.error('[CloudVersions] list failed: HTTP', res.status);
            return fail(httpError);
        }
        if (!Array.isArray(res.json))
            return fail('unknown');
        return { ok: true, versions: (0, cloudVersionsLogic_1.mapVersionRows)(res.json) };
    }
    catch (err) {
        const code = (0, cloudVersionsLogic_1.classifyVersionsError)(err);
        if (code === 'unknown')
            logUnexpected('list', err);
        return fail(code);
    }
}
/**
 * One version's decrypted content. The row is fetched by id but only trusted
 * when its path_key is the requested section's (else 'decrypt-failed'): an id
 * alone never lets the renderer read another file's history.
 */
async function getSectionVersion(notesDir, target, id, overrides = {}) {
    const deps = { ...DEFAULT_DEPS, ...overrides };
    try {
        const key = await resolvePathKey(notesDir, target, deps);
        if (!key.ok)
            return key;
        const versionId = (0, cloudVersionsLogic_1.parseVersionId)(id);
        if (versionId === null)
            return fail('invalid-path');
        const res = await (0, cloudVersionsLogic_1.withOneRetry)(() => deps.rest((0, cloudVersionsLogic_1.versionGetEndpoint)(versionId)), deps.retryDelayMs);
        const httpError = (0, cloudVersionsLogic_1.classifyVersionsHttp)(res.status, res.json);
        if (httpError) {
            if (httpError === 'unknown')
                console.error('[CloudVersions] get failed: HTTP', res.status);
            return fail(httpError);
        }
        if (!Array.isArray(res.json))
            return fail('unknown');
        if (res.json.length === 0)
            return fail('not-found');
        const row = (0, cloudVersionsLogic_1.parseVersionRow)(res.json[0]);
        if (!row.ok)
            return row;
        if (row.id !== versionId)
            return fail('unknown');
        if (row.pathKey !== key.pathKey)
            return fail('decrypt-failed');
        let content = '';
        if (row.contentCt) {
            try {
                const noteKey = await (0, cloudCrypto_1.unwrapKey)(row.keyCt, key.dek);
                content = await (0, cloudCrypto_1.decryptContent)(noteKey, row.contentCt);
            }
            catch {
                return fail('decrypt-failed');
            }
        }
        return { ok: true, version: { id: row.id, seq: row.seq, editedAt: row.editedAt, reason: row.reason, content } };
    }
    catch (err) {
        const code = (0, cloudVersionsLogic_1.classifyVersionsError)(err);
        if (code === 'unknown')
            logUnexpected('get', err);
        return fail(code);
    }
}
/** The read-side codes the snapshot never reports (it reads no version row). */
function toSnapshotCode(code) {
    return code === 'not-found' || code === 'decrypt-failed' ? 'unknown' : code;
}
/** Whether the section file holds any text on this device (a missing file holds none). */
function localFileHasContent(notesDir, relPath) {
    try {
        return fs_1.default.readFileSync(path_1.default.join(notesDir, relPath), 'utf-8').length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Keeps the section's CURRENT content as one more version, before a restore
 * replaces it. First makes sure the server holds this device's text — its
 * pending upload is landed now through the sync engine (never a second upload
 * path) — then calls the snapshot RPC. `{ ok: true }` only when the history is
 * known to hold the current text, or there is no text to keep (no live server
 * row and an empty / missing local file). The renderer flushes its pending
 * editor saves and waits for the note's write queue before calling.
 */
async function snapshotSectionVersion(notesDir, target, overrides = {}) {
    const deps = { ...DEFAULT_DEPS, ...overrides };
    try {
        const key = await resolvePathKey(notesDir, target, deps);
        if (!key.ok)
            return { ok: false, errorCode: toSnapshotCode(key.errorCode) };
        const flushError = (0, cloudVersionsLogic_1.classifySnapshotFlush)(await deps.flushPath(notesDir, key.relPath));
        if (flushError)
            return { ok: false, errorCode: flushError };
        const res = await (0, cloudVersionsLogic_1.withOneRetry)(() => deps.restPost(`/rest/v1/rpc/${cloudVersionsLogic_1.SNAPSHOT_RPC}`, { p_path_key: key.pathKey }), deps.retryDelayMs);
        const answer = (0, cloudVersionsLogic_1.classifySnapshotHttp)(res.status, res.json);
        if (answer === 'captured')
            return { ok: true };
        if (answer === 'no-row') {
            // Nothing on the server to keep: fine only when there is no text here either.
            return localFileHasContent(notesDir, key.relPath) ? { ok: false, errorCode: 'sync-pending' } : { ok: true };
        }
        if (answer === 'unknown')
            console.error('[CloudVersions] snapshot failed: HTTP', res.status);
        return { ok: false, errorCode: answer };
    }
    catch (err) {
        const code = (0, cloudVersionsLogic_1.classifyVersionsError)(err);
        if (code === 'unknown')
            logUnexpected('snapshot', err);
        return { ok: false, errorCode: toSnapshotCode(code) };
    }
}
