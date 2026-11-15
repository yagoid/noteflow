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

import { createHash } from 'crypto'
import path from 'path'

/** Every linked note id starts with this. `:` never appears in a regular note id (nanoid alphabet). */
export const LINKED_ID_PREFIX = 'lnk:'
/** The single section of a linked note (the whole file body). */
export const LINKED_SECTION_ID = 'body'
/**
 * Bigger files open read-only (the editor is not meant for multi-megabyte documents). Also
 * for plain-text files (logs…): the store keeps several copies of the body (content, disk
 * body, synced content, draft) and the semantic index embeds all of it — see patterns.md.
 */
export const MAX_LINKED_FILE_BYTES = 2 * 1024 * 1024
/** How much of a file is sniffed for a NUL byte (= binary) when linking a file too big to read whole. */
export const LINKED_SNIFF_BYTES = 8 * 1024
/** Upper bound of one image pasted/dropped into a linked note (copied into assets/). */
export const MAX_LINKED_ASSET_BYTES = 20 * 1024 * 1024

export function isLinkedNoteId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(LINKED_ID_PREFIX) && id.length > LINKED_ID_PREFIX.length
}

/**
 * `.md` / `.markdown`, case-insensitive. A linked Markdown file gets the Markdown editor and
 * its YAML frontmatter hidden; any other linked text file is plain text (always text mode,
 * no frontmatter, no tags, no images).
 */
export function isMarkdownPath(p: unknown): p is string {
  return typeof p === 'string' && /\.(md|markdown)$/i.test(p.trim())
}

// ── Link grants: only files the USER chose can be linked ─────────────────────
//
// Any text file can be linked and then edited, so main must not link whatever path a
// (possibly compromised) renderer sends: `.git/config`, `~/.ssh/authorized_keys`, a
// `.bashrc` or a PowerShell profile would mean code execution. A path can only enter the
// registry (link / relocate) if main GRANTED it first, from a user action: the native
// picker (`linked:pick-files`), a real drop from the OS (seen by the preload, isTrusted),
// or — next — main itself ("Open with NoteFlow"). A grant is single use and expires.

/** How long a granted path may wait to be linked (the first-link notice can sit open meanwhile). */
export const LINK_GRANT_TTL_MS = 5 * 60 * 1000

export interface LinkGrants {
  /** Grants `paths` (each until linked once, or `ttlMs` from `now`). Non-absolute paths are ignored. */
  grant(paths: readonly unknown[], ttlMs?: number, now?: number): void
  /** Whether `p` was granted and still is; a granted path is consumed (single use). */
  consume(p: unknown, now?: number): boolean
  /** Grants still alive (tests). */
  size(now?: number): number
}

/** Grant store keyed by `linkedPathKey` (same case/normalization rules as the registry). */
export function createLinkGrants(platform: Platform = process.platform): LinkGrants {
  const mod = pathModule(platform)
  const expiries = new Map<string, number>()
  const prune = (now: number) => { for (const [k, until] of expiries) if (until <= now) expiries.delete(k) }
  return {
    grant(paths, ttlMs = LINK_GRANT_TTL_MS, now = Date.now()) {
      prune(now)
      for (const p of paths.slice(0, 200)) {
        if (typeof p !== 'string' || !p.trim() || !mod.isAbsolute(p)) continue
        expiries.set(linkedPathKey(p, platform), now + ttlMs)
      }
    },
    consume(p, now = Date.now()) {
      prune(now)
      if (typeof p !== 'string' || !p.trim() || !mod.isAbsolute(p)) return false
      const key = linkedPathKey(p, platform)
      if (!expiries.has(key)) return false
      expiries.delete(key)
      return true
    },
    size(now = Date.now()) {
      prune(now)
      return expiries.size
    },
  }
}

/** One entry of userData/linked-notes.json. */
export interface LinkedNoteRecord {
  id: string
  /** Absolute path of the file as the user picked it (.md or any other text file). */
  path: string
  /** Local alias shown as the note title — editing it never renames the file. */
  title: string
  group?: string
  folder?: string
  favorited?: boolean
  archived?: boolean
  isRawMode?: boolean
  aiHidden?: boolean
  created: string
  updated: string
  /** Fingerprint of the last content NoteFlow read or wrote. */
  known?: LinkedFingerprint
}

export interface LinkedFingerprint {
  hash: string
  size: number
  mtimeMs: number
}

export interface LinkedRegistry {
  version: 1
  notes: LinkedNoteRecord[]
  /** Local manual order of the contexts holding linked notes (see splitLinkedOrder). */
  order: Record<string, string[]>
}

/** Unwritten content of a linked note (edits not on disk: conflict / read-only / failed write). */
export interface LinkedDraft {
  body: string
  /** Hash of the file version the draft is based on (null: never read from disk). */
  baseHash: string | null
}

export function sanitizeLinkedDraft(raw: unknown): LinkedDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.body !== 'string') return null
  const baseHash = typeof d.baseHash === 'string' && /^[0-9a-f]{64}$/.test(d.baseHash) ? d.baseHash : null
  return { body: d.body, baseHash }
}

type Platform = NodeJS.Platform | string

function pathModule(platform: Platform): typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix
}

/** Windows and macOS file systems are case-insensitive by default. */
export function isCaseInsensitivePlatform(platform: Platform): boolean {
  return platform === 'win32' || platform === 'darwin'
}

/** Absolute, normalized form of a path (no trailing separator). */
export function normalizeLinkedPath(p: string, platform: Platform = process.platform): string {
  const mod = pathModule(platform)
  const resolved = mod.resolve(p.trim())
  return resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') || resolved : resolved
}

/** Comparison key of a path: normalized, lower-cased where the file system ignores case. */
export function linkedPathKey(p: string, platform: Platform = process.platform): string {
  const normalized = normalizeLinkedPath(p, platform)
  return isCaseInsensitivePlatform(platform) ? normalized.toLowerCase() : normalized
}

/** Whether `p` is `dir` itself or inside it (both normalized, platform case rules). */
export function isPathInside(p: string, dir: string, platform: Platform = process.platform): boolean {
  const mod = pathModule(platform)
  const a = linkedPathKey(p, platform)
  const b = linkedPathKey(dir, platform)
  if (a === b) return true
  const rel = mod.relative(b, a)
  return !!rel && !rel.startsWith('..') && !mod.isAbsolute(rel)
}

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const optStr = (v: unknown, max = 128): string | undefined =>
  typeof v === 'string' && v.trim() && v.length <= max ? v : undefined

function sanitizeFingerprint(v: unknown): LinkedFingerprint | undefined {
  if (!v || typeof v !== 'object') return undefined
  const f = v as Record<string, unknown>
  if (typeof f.hash !== 'string' || !/^[0-9a-f]{64}$/.test(f.hash)) return undefined
  const size = typeof f.size === 'number' && Number.isFinite(f.size) && f.size >= 0 ? f.size : 0
  const mtimeMs = typeof f.mtimeMs === 'number' && Number.isFinite(f.mtimeMs) ? f.mtimeMs : 0
  return { hash: f.hash, size, mtimeMs }
}

/**
 * Reads linked-notes.json leniently: entries without a valid linked id or an
 * absolute path are dropped (any file type: since text files other than Markdown
 * can be linked, a registry written by an earlier build stays valid as is), the rest keep only known fields with the
 * right types, and duplicates (same id, or same file by `linkedPathKey`) keep
 * the first one. A missing or broken file is an empty registry.
 */
export function sanitizeLinkedRegistry(raw: unknown, platform: Platform = process.platform, now = new Date().toISOString()): LinkedRegistry {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { notes?: unknown }).notes)
      ? (raw as { notes: unknown[] }).notes
      : []
  const mod = pathModule(platform)
  const ids = new Set<string>()
  const paths = new Set<string>()
  const notes: LinkedNoteRecord[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (!isLinkedNoteId(r.id) || r.id.length > 64) continue
    if (typeof r.path !== 'string' || !r.path.trim() || !mod.isAbsolute(r.path)) continue
    const key = linkedPathKey(r.path as string, platform)
    if (ids.has(r.id) || paths.has(key)) continue
    ids.add(r.id)
    paths.add(key)
    const filePath = normalizeLinkedPath(r.path as string, platform)
    const created = isIso(r.created) ? r.created : now
    const group = optStr(r.group)
    const record: LinkedNoteRecord = {
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
      created,
      updated: isIso(r.updated) ? r.updated : created,
    }
    const known = sanitizeFingerprint(r.known)
    if (known) record.known = known
    notes.push(record)
  }
  const order = raw && typeof raw === 'object' && !Array.isArray(raw) ? sanitizeNoteOrder((raw as { order?: unknown }).order) : {}
  return { version: 1, notes, order }
}

/** A `note-order.json`-shaped map (`contextKey → note ids`), with only string ids kept. */
export function sanitizeNoteOrder(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string[]> = {}
  for (const [key, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || key.length > 200 || !Array.isArray(ids)) continue
    const list = ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128)
    if (list.length) out[key] = [...new Set(list)]
  }
  return out
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
export function splitLinkedOrder(order: Record<string, string[]>): { synced: Record<string, string[]>; local: Record<string, string[]> } {
  const synced: Record<string, string[]> = {}
  const local: Record<string, string[]> = {}
  for (const [key, ids] of Object.entries(order)) {
    const regular = ids.filter((id) => !isLinkedNoteId(id))
    if (regular.length) synced[key] = regular
    if (regular.length !== ids.length) local[key] = [...ids]
  }
  return { synced, local }
}

/** Inverse of splitLinkedOrder, tolerant to the synced lists having changed since (see above). */
export function mergeLinkedOrder(synced: Record<string, string[]>, local: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [key, ids] of Object.entries(synced)) out[key] = ids.filter((id) => !isLinkedNoteId(id))
  for (const [key, full] of Object.entries(local)) {
    const result = [...(out[key] ?? [])]
    const present = new Set(result)
    // Where the next linked id goes: after the last regular id seen locally (or the
    // linked ones already placed after it).
    let anchorIndex = -1
    for (const id of full) {
      if (!isLinkedNoteId(id)) {
        if (present.has(id)) anchorIndex = result.indexOf(id)
        continue
      }
      if (present.has(id)) continue
      result.splice(anchorIndex + 1, 0, id)
      present.add(id)
      anchorIndex += 1
    }
    if (result.length) out[key] = result
  }
  return out
}

/**
 * Default title of a linked note: the file name — without `.md`/`.markdown` for a Markdown
 * file, with its extension for any other (`config.json`: the type is part of what it is).
 */
export function defaultLinkedTitle(filePath: string, platform: Platform = process.platform): string {
  const base = pathModule(platform).basename(filePath)
  return base.replace(/\.(md|markdown)$/i, '') || base
}

/** File name of the cached copy of a linked note's content (userData/linked-notes-cache/). */
export function linkedCacheFileName(id: string): string {
  return `${id.slice(LINKED_ID_PREFIX.length).replace(/[^A-Za-z0-9_-]/g, '_')}.md`
}

/** File name of a linked note's unwritten draft, next to its cache. */
export function linkedDraftFileName(id: string): string {
  return linkedCacheFileName(id).replace(/\.md$/, '.draft.json')
}

// ── File bytes ⇄ editable body (byte-exact) ──────────────────────────────────

/** `binary`: the file has a NUL byte (an image, a PDF, an Office file, UTF-16 text…). */
export type LinkedDecodeError = 'invalidUtf8' | 'binary'

const UTF8_BOM = [0xef, 0xbb, 0xbf]

/**
 * UTF-8 text of the file (strict: invalid sequences are an error) + whether it had a BOM.
 * A NUL byte anywhere makes it `binary`: text files don't have them, and the textarea
 * couldn't round-trip one byte-exact.
 */
export function decodeLinkedBytes(bytes: Uint8Array): { ok: true; text: string; bom: boolean } | { ok: false; error: LinkedDecodeError } {
  if (bytes.includes(0)) return { ok: false, error: 'binary' }
  const bom = bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2]
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bom ? bytes.subarray(3) : bytes)
    return { ok: true, text, bom }
  } catch {
    return { ok: false, error: 'invalidUtf8' }
  }
}

/**
 * Whether the START of a file (`head`, e.g. its first LINKED_SNIFF_BYTES) can be text: no NUL
 * byte (else `binary`) and valid UTF-8 so far (else `invalidUtf8`). A multi-byte character
 * cut at the end of `head` is fine unless `complete` (head is the whole file). Null = text.
 * For linking a file too big to read whole (it's then linked read-only, `tooLarge`).
 */
export function sniffLinkedBytes(head: Uint8Array, complete = false): LinkedDecodeError | null {
  if (head.includes(0)) return 'binary'
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(head, { stream: !complete })
    return null
  } catch {
    return 'invalidUtf8'
  }
}

/**
 * Whether the text has a lone CR (`\r` not followed by `\n`: old Mac line breaks). A
 * textarea turns every one into `\n` in its value, so the first edit in text mode would
 * rewrite all of them — a plain-text linked file with one opens read-only (`loneCr`).
 */
export function hasLoneCr(text: string): boolean {
  return /\r(?!\n)/.test(text)
}

export function encodeMarkdown(text: string, bom: boolean): Buffer {
  const body = Buffer.from(text, 'utf-8')
  return bom ? Buffer.concat([Buffer.from(UTF8_BOM), body]) : body
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** What a file is made of: everything the editor does NOT edit is kept verbatim. */
export interface MarkdownFileParts {
  bom: boolean
  /** Dominant line ending of the file (CRLF when it has more CRLF than bare LF). */
  eol: '\n' | '\r\n'
  /** Leading YAML frontmatter, byte-exact (delimiters and line endings included) — '' if none. */
  frontmatter: string
  /** Whether the file ended with a line break (the body hides that last one). */
  finalNewline: boolean
  /** What the editor shows: the rest of the file, LF line endings, without the last line break. */
  body: string
}

const FRONTMATTER_OPEN_RE = /^---[ \t]*\r?\n/
const FRONTMATTER_CLOSE_RE = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m

/**
 * Splits the decoded text of a Markdown file into the part the editor edits
 * (`body`) and what must survive an edit untouched. `assembleMarkdownFile(parts,
 * parts.body)` gives back exactly `text` for any file with consistent line
 * endings; a file mixing CRLF and LF is written with its dominant one only when
 * the user edits it. Without `withFrontmatter` (a linked file that isn't Markdown —
 * a .yaml starting with `---`…) nothing is taken as frontmatter: it's all body.
 */
export function splitMarkdownFile(text: string, bom = false, withFrontmatter = true): MarkdownFileParts {
  let frontmatter = ''
  let rest = text
  const open = withFrontmatter ? FRONTMATTER_OPEN_RE.exec(text) : null
  if (open) {
    const after = text.slice(open[0].length)
    const close = FRONTMATTER_CLOSE_RE.exec(after)
    // Only YAML-looking blocks (empty, or with a `key:` line): a document that
    // merely starts with a `---` rule keeps it in the editable body.
    const inner = close ? after.slice(0, close.index) : ''
    if (close && (!inner.trim() || /^[\w$"'-][^:\n]*:/m.test(inner))) {
      const end = open[0].length + close.index + close[0].length
      frontmatter = text.slice(0, end)
      rest = text.slice(end)
    }
  }
  const crlf = (rest.match(/\r\n/g) ?? []).length
  const lf = (rest.match(/\n/g) ?? []).length - crlf
  // A body without line breaks follows the frontmatter's.
  const fmCrlf = (frontmatter.match(/\r\n/g) ?? []).length
  const eol: '\n' | '\r\n' = crlf > lf || (crlf === 0 && lf === 0 && fmCrlf > 0) ? '\r\n' : '\n'
  const normalized = rest.replace(/\r\n/g, '\n')
  const finalNewline = normalized.endsWith('\n')
  return { bom, eol, frontmatter, finalNewline, body: finalNewline ? normalized.slice(0, -1) : normalized }
}

/** splitMarkdownFile with the frontmatter rule of the linked file's type (only Markdown has one). */
export function splitLinkedFile(filePath: string, text: string, bom = false): MarkdownFileParts {
  return splitMarkdownFile(text, bom, isMarkdownPath(filePath))
}

/** The file text for an edited `body`: frontmatter verbatim, the file's EOL and final newline. */
export function assembleMarkdownFile(parts: Pick<MarkdownFileParts, 'eol' | 'frontmatter' | 'finalNewline'>, body: string): string {
  const lf = body.replace(/\r\n/g, '\n')
  const withEol = parts.eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf
  return parts.frontmatter + withEol + (parts.finalNewline ? parts.eol : '')
}

// ── Fingerprint decisions ─────────────────────────────────────────────────────

/**
 * A watcher event on the file: `echo` when the disk still holds the content
 * NoteFlow last read or wrote (our own save coming back, or a touch that
 * changed nothing) — decided by content hash, not by a time window —, `missing`
 * when the file is gone, `external` otherwise.
 */
export function decideDiskEvent(knownHash: string | null | undefined, diskHash: string | null): 'echo' | 'external' | 'missing' {
  if (diskHash === null) return 'missing'
  return knownHash && knownHash === diskHash ? 'echo' : 'external'
}

/**
 * Whether an edit may be written: only when the disk still holds the version
 * the edit was based on (`baseHash`). Anything else is a `conflict` (the file
 * changed outside since) or `missing` (it's gone) — never overwritten silently.
 */
export function decideWrite(baseHash: string | null | undefined, diskHash: string | null): 'write' | 'conflict' | 'missing' {
  if (diskHash === null) return 'missing'
  return baseHash && baseHash === diskHash ? 'write' : 'conflict'
}

// ── Images: assets/ next to the .md ──────────────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'])
const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/x-icon': 'ico',
}

/** Biggest image inlined as a data URI when a linked note is copied into a regular one. */
export const MAX_INLINED_ASSET_BYTES = 10 * 1024 * 1024

/** MIME type of an image file name (by extension), or null. */
export function imageMimeOf(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  const found = Object.entries(MIME_EXT).find(([, e]) => e === ext)
  if (found) return found[0]
  return ext === 'jpeg' ? 'image/jpeg' : null
}

export function isImageFileName(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return IMAGE_EXTS.has(ext)
}

/**
 * Name for an image copied into the note's assets/ folder: the original name
 * slugged (or `image` for a pasted clipboard image) + a timestamp, with an
 * extension that matches the image type; `-2`, `-3`… if it's already taken.
 */
export function linkedAssetFileName(originalName: string, mime: string, taken: (name: string) => boolean, now: Date = new Date()): string {
  const rawExt = originalName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  const ext = IMAGE_EXTS.has(rawExt) ? (rawExt === 'jpeg' ? 'jpg' : rawExt) : (MIME_EXT[mime] ?? 'png')
  const stem = originalName.replace(/\.[^.]*$/, '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const base = `${stem && stem !== 'image' ? stem : 'image'}-${stamp}`
  let name = `${base}.${ext}`
  for (let i = 2; taken(name); i++) name = `${base}-${i}.${ext}`
  return name
}

/**
 * Absolute path of an image referenced RELATIVELY by a linked file (`assets/a.png`,
 * `../img/b.svg`, `./c.jpg`), resolved against the file's folder. Null for
 * anything that isn't a relative path to an image (URLs, data:, absolute paths,
 * other file types): only images are ever served from the linked file's
 * surroundings. With `decode`, a `%20`-style encoded path is decoded first.
 */
export function resolveLinkedAsset(mdPath: string, src: string, platform: Platform = process.platform, decode = true): string | null {
  const mod = pathModule(platform)
  let rel = src.trim().replace(/^<|>$/g, '').replace(/[?#].*$/, '')
  if (!isSafeRelativePath(rel)) return null
  if (decode && /%[0-9a-f]{2}/i.test(rel)) {
    try { rel = decodeURIComponent(rel) } catch { return null }
    // Checked again on the decoded text: `%2Fetc%2Fa.png`, `C%3A%5Ca.png`, `%5C%5Chost%5Ca.png`…
    if (!isSafeRelativePath(rel)) return null
  }
  if (!isImageFileName(rel)) return null
  const resolved = mod.resolve(mod.dirname(mdPath), rel)
  return isImageFileName(resolved) ? resolved : null
}

/**
 * A path RELATIVE to the linked file's folder (may go up with `../`): no URL
 * scheme, no drive (`C:`, `C:foo`), no absolute or UNC path (`/x`, `\x`, `//host`,
 * `\\host`), no `:` at all (Windows alternate data streams) and no NUL byte.
 */
function isSafeRelativePath(rel: string): boolean {
  if (!rel || rel.includes('\0') || rel.includes(':')) return false
  if (rel.startsWith('/') || rel.startsWith('\\')) return false
  if (path.posix.isAbsolute(rel) || path.win32.isAbsolute(rel)) return false
  return true
}

/**
 * The image sources a Markdown text references (`![alt](src)`, also with a
 * `"title"` / `'title'` and `<…>`-wrapped sources), normalized (trimmed, without
 * the angle brackets); code spans are skipped. Images by reference
 * (`![alt][ref]`) aren't listed. Mirror of the parsing in inlineLinkedImages
 * (src/lib/linkedNotes.ts).
 */
export function markdownImageSrcs(md: string): string[] {
  const out: string[] = []
  for (const m of md.matchAll(MD_IMAGE_RE)) {
    if (m[1]) continue
    out.push(normalizeImageSrc(m[3]))
  }
  return out
}

/** `(code)` | `![alt](src "title")` — group 1 = code fence run, 2 = alt, 3 = src, 4 = title. */
export const MD_IMAGE_RE = /(`+)[\s\S]*?\1|!\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+("[^"\n]*"|'[^'\n]*'))?\s*\)/g

export function normalizeImageSrc(src: string): string {
  return src.trim().replace(/^<([\s\S]*)>$/, '$1').trim()
}
