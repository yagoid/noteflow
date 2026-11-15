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

import fs from 'fs'
import path from 'path'
import * as account from './account'
import * as cloudKeys from './cloudKeys'
import * as cloudSync from './cloudSync'
import { isCloudConfigured } from './cloudConfig'
import { derivePathKeyHmac, unwrapKey, decryptContent } from './cloudCrypto'
import { NOTE_MD } from './noteFormat'
import {
  classifySnapshotFlush,
  classifySnapshotHttp,
  classifyVersionsError,
  classifyVersionsHttp,
  mapVersionRows,
  parseVersionId,
  parseVersionRow,
  parseVersionTarget,
  redactVersionsError,
  resolveSectionRelPath,
  SNAPSHOT_RPC,
  versionGetEndpoint,
  versionListEndpoint,
  withOneRetry,
  type CloudVersionGetResult,
  type CloudVersionsErrorCode,
  type CloudVersionsListResult,
  type CloudVersionsSnapshotErrorCode,
  type CloudVersionsSnapshotResult,
} from './cloudVersionsLogic'

/** Injectable collaborators (tests); defaults are the real modules. */
export interface CloudVersionsDeps {
  isConfigured: () => boolean
  isSignedIn: () => boolean
  getDek: () => Uint8Array | null
  rest: (endpoint: string) => Promise<cloudKeys.SupabaseRestResponse>
  /** POST with a JSON body (the snapshot RPC). */
  restPost: (endpoint: string, body: unknown) => Promise<cloudKeys.SupabaseRestResponse>
  /** Lands the file's pending Cloud upload now (cloudSync.flushPathForSnapshot). */
  flushPath: (notesDir: string, relPath: string) => Promise<cloudSync.SnapshotFlushOutcome>
  retryDelayMs: number
  platform: NodeJS.Platform | string
}

const DEFAULT_DEPS: CloudVersionsDeps = {
  isConfigured: isCloudConfigured,
  isSignedIn: () => account.getAccountStatus().signedIn,
  getDek: () => cloudKeys.getDek(),
  rest: (endpoint) => cloudKeys.supabaseRest(endpoint),
  restPost: (endpoint, body) => cloudKeys.supabaseRest(endpoint, { method: 'POST', body }),
  flushPath: (notesDir, relPath) => cloudSync.flushPathForSnapshot(notesDir, relPath),
  retryDelayMs: 1000,
  platform: process.platform,
}

type Failure = { ok: false; errorCode: CloudVersionsErrorCode }
const fail = (errorCode: CloudVersionsErrorCode): Failure => ({ ok: false, errorCode })

/** The gates + the section's relPath and path_key, shared by list, get and snapshot. */
async function resolvePathKey(
  notesDir: string,
  target: unknown,
  deps: CloudVersionsDeps
): Promise<{ ok: true; dek: Uint8Array; pathKey: string; relPath: string } | Failure> {
  if (!deps.isConfigured()) return fail('unavailable')
  if (!deps.isSignedIn()) return fail('not-signed-in')
  const dek = deps.getDek()
  if (!dek) return fail('locked')
  const parsed = parseVersionTarget(notesDir, target, deps.platform)
  if (!parsed.ok) return parsed
  let noteMd: string
  try {
    noteMd = fs.readFileSync(path.join(notesDir, parsed.dir, NOTE_MD), 'utf-8')
  } catch {
    return fail('invalid-path')
  }
  const resolved = resolveSectionRelPath(parsed.dir, parsed.sectionId, noteMd)
  if (!resolved.ok) return resolved
  return { ok: true, dek, pathKey: await derivePathKeyHmac(dek, resolved.relPath), relPath: resolved.relPath }
}

function logUnexpected(op: string, err: unknown): void {
  console.error(`[CloudVersions] ${op} failed:`, redactVersionsError(err))
}

/** Versions of one section, newest replaced content first (metadata only). */
export async function listSectionVersions(
  notesDir: string,
  target: unknown,
  overrides: Partial<CloudVersionsDeps> = {}
): Promise<CloudVersionsListResult> {
  const deps = { ...DEFAULT_DEPS, ...overrides }
  try {
    const key = await resolvePathKey(notesDir, target, deps)
    if (!key.ok) return key
    const res = await withOneRetry(() => deps.rest(versionListEndpoint(key.pathKey)), deps.retryDelayMs)
    const httpError = classifyVersionsHttp(res.status, res.json)
    if (httpError) {
      if (httpError === 'unknown') console.error('[CloudVersions] list failed: HTTP', res.status)
      return fail(httpError)
    }
    if (!Array.isArray(res.json)) return fail('unknown')
    return { ok: true, versions: mapVersionRows(res.json) }
  } catch (err) {
    const code = classifyVersionsError(err)
    if (code === 'unknown') logUnexpected('list', err)
    return fail(code)
  }
}

/**
 * One version's decrypted content. The row is fetched by id but only trusted
 * when its path_key is the requested section's (else 'decrypt-failed'): an id
 * alone never lets the renderer read another file's history.
 */
export async function getSectionVersion(
  notesDir: string,
  target: unknown,
  id: unknown,
  overrides: Partial<CloudVersionsDeps> = {}
): Promise<CloudVersionGetResult> {
  const deps = { ...DEFAULT_DEPS, ...overrides }
  try {
    const key = await resolvePathKey(notesDir, target, deps)
    if (!key.ok) return key
    const versionId = parseVersionId(id)
    if (versionId === null) return fail('invalid-path')
    const res = await withOneRetry(() => deps.rest(versionGetEndpoint(versionId)), deps.retryDelayMs)
    const httpError = classifyVersionsHttp(res.status, res.json)
    if (httpError) {
      if (httpError === 'unknown') console.error('[CloudVersions] get failed: HTTP', res.status)
      return fail(httpError)
    }
    if (!Array.isArray(res.json)) return fail('unknown')
    if (res.json.length === 0) return fail('not-found')
    const row = parseVersionRow(res.json[0])
    if (!row.ok) return row
    if (row.id !== versionId) return fail('unknown')
    if (row.pathKey !== key.pathKey) return fail('decrypt-failed')
    let content = ''
    if (row.contentCt) {
      try {
        const noteKey = await unwrapKey(row.keyCt, key.dek)
        content = await decryptContent(noteKey, row.contentCt)
      } catch {
        return fail('decrypt-failed')
      }
    }
    return { ok: true, version: { id: row.id, seq: row.seq, editedAt: row.editedAt, reason: row.reason, content } }
  } catch (err) {
    const code = classifyVersionsError(err)
    if (code === 'unknown') logUnexpected('get', err)
    return fail(code)
  }
}

/** The read-side codes the snapshot never reports (it reads no version row). */
function toSnapshotCode(code: CloudVersionsErrorCode): CloudVersionsSnapshotErrorCode {
  return code === 'not-found' || code === 'decrypt-failed' ? 'unknown' : code
}

/** Whether the section file holds any text on this device (a missing file holds none). */
function localFileHasContent(notesDir: string, relPath: string): boolean {
  try {
    return fs.readFileSync(path.join(notesDir, relPath), 'utf-8').length > 0
  } catch {
    return false
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
export async function snapshotSectionVersion(
  notesDir: string,
  target: unknown,
  overrides: Partial<CloudVersionsDeps> = {}
): Promise<CloudVersionsSnapshotResult> {
  const deps = { ...DEFAULT_DEPS, ...overrides }
  try {
    const key = await resolvePathKey(notesDir, target, deps)
    if (!key.ok) return { ok: false, errorCode: toSnapshotCode(key.errorCode) }
    const flushError = classifySnapshotFlush(await deps.flushPath(notesDir, key.relPath))
    if (flushError) return { ok: false, errorCode: flushError }
    const res = await withOneRetry(
      () => deps.restPost(`/rest/v1/rpc/${SNAPSHOT_RPC}`, { p_path_key: key.pathKey }),
      deps.retryDelayMs
    )
    const answer = classifySnapshotHttp(res.status, res.json)
    if (answer === 'captured') return { ok: true }
    if (answer === 'no-row') {
      // Nothing on the server to keep: fine only when there is no text here either.
      return localFileHasContent(notesDir, key.relPath) ? { ok: false, errorCode: 'sync-pending' } : { ok: true }
    }
    if (answer === 'unknown') console.error('[CloudVersions] snapshot failed: HTTP', res.status)
    return { ok: false, errorCode: answer }
  } catch (err) {
    const code = classifyVersionsError(err)
    if (code === 'unknown') logUnexpected('snapshot', err)
    return { ok: false, errorCode: toSnapshotCode(code) }
  }
}
