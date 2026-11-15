// NoteFlow Cloud per-section version history — read side (I/O). Lists and
// decrypts the rows a server trigger keeps in public.file_versions (the
// previous content of a files row each time its content_ct changes). Pure
// logic in cloudVersionsLogic.ts; IPC in main.ts (cloud:versions-list /
// cloud:versions-get).
//
// Never returns key material (DEK, note keys) nor the path_key, and never a raw
// error message: every failure is a CloudVersionsErrorCode. Does NOT require
// cloudSync.enabled — the history belongs to the account, so it stays readable
// while signed in with the keys unlocked even after turning Cloud sync off.
//
// Restoring a version has no IPC on purpose: the renderer writes the old text
// as a normal edit, the sync engine uploads it, and the trigger saves the
// replaced content as one more version.

import fs from 'fs'
import path from 'path'
import * as account from './account'
import * as cloudKeys from './cloudKeys'
import { isCloudConfigured } from './cloudConfig'
import { derivePathKeyHmac, unwrapKey, decryptContent } from './cloudCrypto'
import { NOTE_MD } from './noteFormat'
import {
  classifyVersionsError,
  classifyVersionsHttp,
  mapVersionRows,
  parseVersionId,
  parseVersionRow,
  parseVersionTarget,
  redactVersionsError,
  resolveSectionRelPath,
  versionGetEndpoint,
  versionListEndpoint,
  withOneRetry,
  type CloudVersionGetResult,
  type CloudVersionsErrorCode,
  type CloudVersionsListResult,
} from './cloudVersionsLogic'

/** Injectable collaborators (tests); defaults are the real modules. */
export interface CloudVersionsDeps {
  isConfigured: () => boolean
  isSignedIn: () => boolean
  getDek: () => Uint8Array | null
  rest: (endpoint: string) => Promise<cloudKeys.SupabaseRestResponse>
  retryDelayMs: number
  platform: NodeJS.Platform | string
}

const DEFAULT_DEPS: CloudVersionsDeps = {
  isConfigured: isCloudConfigured,
  isSignedIn: () => account.getAccountStatus().signedIn,
  getDek: () => cloudKeys.getDek(),
  rest: (endpoint) => cloudKeys.supabaseRest(endpoint),
  retryDelayMs: 1000,
  platform: process.platform,
}

type Failure = { ok: false; errorCode: CloudVersionsErrorCode }
const fail = (errorCode: CloudVersionsErrorCode): Failure => ({ ok: false, errorCode })

/** The gates + the section's path_key, shared by list and get. */
async function resolvePathKey(
  notesDir: string,
  target: unknown,
  deps: CloudVersionsDeps
): Promise<{ ok: true; dek: Uint8Array; pathKey: string } | Failure> {
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
  return { ok: true, dek, pathKey: await derivePathKeyHmac(dek, resolved.relPath) }
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
