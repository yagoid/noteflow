// Pure helpers of the GitHub REST transport: decoding a file's text from the
// Contents API / Git Blobs API answers, and the timeout of a request. Imports
// nothing from Electron (only node:crypto and mirrorPlan's gitBlobSha) — same
// pure-module pattern as syncState.ts / mirrorPlan.ts. Covered by
// tests/electron/githubLargeFiles.test.ts.
//
// ⚠️ Mirrored in cli/noteflow.js (decodeContentsApiFile, decodeGitBlob,
// githubRequestTimeoutMs, EMPTY_BLOB_SHA) — keep both sides identical.
import { createHash } from 'crypto'
import { gitBlobSha } from './mirrorPlan'

/** Git blob sha of an empty file (`e69de29…`): a genuinely empty remote file. */
export const EMPTY_BLOB_SHA = gitBlobSha('')

/** The fields of a `GET /repos/{o}/{r}/contents/{path}` (or git/blobs) answer we read. */
export interface GithubFileAnswer {
  content?: unknown
  encoding?: unknown
  sha?: unknown
  size?: unknown
}

/**
 * Text of a Contents API answer, ONLY when it carries the whole file inline —
 * else null (the caller then fetches the bytes from the Git Blobs API).
 *
 * ⚠️ The Contents API (default media type) inlines the content only up to
 * 1 MB: for a file between 1 MB and 100 MB it answers 200 with `content: ""`,
 * `encoding: "none"` and the REAL `sha`/`size`. Decoding that as base64 gave
 * '' — a section with embedded images was written EMPTY locally while its real
 * sha was cached as reconciled, and a later push uploaded the empty version to
 * every device. So: anything but base64 text whose decoded byte length matches
 * `size` (when GitHub sends it) is "not inline". A genuinely empty file
 * (`size: 0`, `content: ""`, base64) still decodes to ''.
 */
export function decodeContentsApiFile(file: GithubFileAnswer): string | null {
  if (file.encoding !== 'base64' || typeof file.content !== 'string') return null
  const bytes = Buffer.from(file.content.replace(/\n/g, ''), 'base64')
  if (typeof file.size === 'number' && bytes.length !== file.size) return null
  return bytes.toString('utf-8')
}

/**
 * Text of a Git Blobs API answer (`GET /repos/{o}/{r}/git/blobs/{sha}`: base64,
 * up to 100 MB) — null unless its BYTES hash to `sha` (truncated, corrupt or
 * another object). Verified on the raw bytes, before the UTF-8 decoding.
 */
export function decodeGitBlob(blob: GithubFileAnswer | null | undefined, sha: string): string | null {
  if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string') return null
  const bytes = Buffer.from(blob.content.replace(/\n/g, ''), 'base64')
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`, 'utf-8').update(bytes).digest('hex')
  return actual === sha ? bytes.toString('utf-8') : null
}

const BASE_TIMEOUT_MS = 15_000
const MS_PER_32KB = 1_000
const MAX_TIMEOUT_MS = 10 * 60_000

/**
 * Socket-idle timeout of one GitHub API request, scaled with the size of the
 * body it SENDS: a multi-MB PUT is written in one go and GitHub then takes a
 * while to commit it, so a fixed 15 s cut slow uploads off. 15 s + 1 s per
 * 32 KB of payload, capped at 10 min. Downloads keep the base value (it is an
 * idle timeout: every data event resets it).
 */
export function githubRequestTimeoutMs(payloadBytes: number): number {
  const bytes = Number.isFinite(payloadBytes) && payloadBytes > 0 ? payloadBytes : 0
  return Math.min(BASE_TIMEOUT_MS + Math.ceil(bytes / 32_768) * MS_PER_32KB, MAX_TIMEOUT_MS)
}
