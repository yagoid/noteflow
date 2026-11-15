// Linked notes in the renderer: a NoteFlow note backed by an external text file
// (electron/linkedNotes.ts) — a Markdown file (.md/.markdown: Markdown editor) or
// any other text file (plain text: always in text mode, no tags, no images). Here:
// turning main's wire records into store notes, the reload decision when the file
// changed (apply / keep / conflict), image sources and copies into regular notes.
// Pure — tests in tests/lib/linkedNotes.test.ts. Design and invariants:
// .agents/context/patterns.md § "Notas vinculadas".

import type { LinkedNoteState, LinkedNoteWire, Note, NoteSection } from '../types'
import { extractTags } from './noteUtils'

/** Mirror of LINKED_ID_PREFIX / LINKED_SECTION_ID in electron/linkedNotesLogic.ts. */
export const LINKED_ID_PREFIX = 'lnk:'
export const LINKED_SECTION_ID = 'body'

export function isLinkedNoteId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(LINKED_ID_PREFIX)
}

export function isLinkedNote(note: Pick<Note, 'linked'> | null | undefined): note is Note & { linked: LinkedNoteState } {
  return !!note?.linked
}

/** `.md` / `.markdown`, case-insensitive — mirror of isMarkdownPath in electron/linkedNotesLogic.ts. */
export function isMarkdownFilePath(p: string | null | undefined): boolean {
  return !!p && /\.(md|markdown)$/i.test(p.trim())
}

/**
 * A linked note whose file isn't Markdown (config.json, a .yaml, a script, a log): plain
 * text. It's ALWAYS in text mode (byte-exact textarea, never the Markdown editor, no
 * toolbar / slash menu / snippets), has no tags and no images, and its previews show it as
 * preformatted text.
 */
export function isPlainTextLinked(note: Pick<Note, 'linked'> | null | undefined): boolean {
  return !!note?.linked && !isMarkdownFilePath(note.linked.path)
}

/** Whether a section shows in text mode: its own flag, or forced (a plain-text linked note). */
export function sectionShowsRaw(note: Pick<Note, 'linked'> | null | undefined, section: Pick<NoteSection, 'isRawMode'> | null | undefined): boolean {
  return !!section?.isRawMode || isPlainTextLinked(note)
}

/** Tags of a linked file's body: only Markdown has them (`#` in a .py or a .yaml is a comment). */
export function linkedTagsOf(filePath: string, body: string): string[] {
  return isMarkdownFilePath(filePath) ? extractTags(body) : []
}

/**
 * Comparison key of a file path in the renderer: separators unified and, where the file
 * system ignores case (Windows, macOS — like linkedPathKey in main), lower-cased.
 */
export function linkedPathKey(p: string, platform: string): string {
  const unified = platform === 'win32' ? p.replace(/\//g, '\\') : p
  const trimmed = unified.length > 1 ? unified.replace(/[\\/]+$/, '') || unified : unified
  return platform === 'win32' || platform === 'darwin' ? trimmed.toLowerCase() : trimmed
}

/**
 * The linked note of `notes` backed by the file at `p` (a `notes-updated` path), by the
 * store's own record of linked notes — not by extension: any text file can be linked, and
 * a note FOLDER path never matches one.
 */
export function findLinkedNoteByPath<N extends Pick<Note, 'linked'>>(notes: readonly N[], p: string | null | undefined, platform: string): N | undefined {
  if (!p) return undefined
  const key = linkedPathKey(p, platform)
  return notes.find((n) => !!n.linked && linkedPathKey(n.linked.path, platform) === key)
}

/** Read-only while the file can't be written: missing, read-only, unreadable/too large. */
export function isLinkedReadOnly(note: Pick<Note, 'linked'> | null | undefined): boolean {
  return !!note?.linked && note.linked.status !== 'ok'
}

/** The note shows content that isn't in the file (a failed / refused write, a conflict, a restored draft). */
export function isLinkedDirty(note: Pick<Note, 'linked' | 'sections'> | null | undefined): boolean {
  return !!note?.linked && (!!note.linked.conflict || (note.sections[0]?.content ?? '') !== note.linked.syncedContent)
}

/** What userData should keep for a linked note: its unwritten content, or null when it's in sync. */
export function linkedDraftOf(note: Pick<Note, 'linked' | 'sections'>): { body: string; baseHash: string | null } | null {
  if (!note.linked || !isLinkedDirty(note)) return null
  return { body: note.sections[0]?.content ?? '', baseHash: note.linked.baseHash }
}

/**
 * A store note for a linked file, as main describes it. The body is the single
 * section. With a draft (edits not written before a restart) the draft is the
 * content and the note starts dirty: based on the disk version it was edited
 * from → written on the next sync; the file changed since → conflict.
 */
export function linkedNoteFromWire(wire: LinkedNoteWire): Note {
  const note = linkedNoteFromWireClean(wire)
  const draft = wire.draft
  if (!draft || (draft.body === wire.body && draft.baseHash === wire.hash)) return note
  const linked: LinkedNoteState = { ...note.linked!, baseHash: draft.baseHash }
  // Not based on the version on disk (it changed since, it's another file after a
  // relocate, or the draft was never based on a read): the user chooses.
  if (wire.hash && draft.baseHash !== wire.hash) {
    linked.conflict = { diskBody: wire.body, diskHash: wire.hash }
  }
  return { ...note, sections: [{ ...note.sections[0], content: draft.body }], tags: linkedTagsOf(wire.path, draft.body), linked }
}

function linkedNoteFromWireClean(wire: LinkedNoteWire): Note {
  // Plain text (not Markdown) is always in text mode, whatever the registry says.
  const rawMode = wire.isRawMode || !isMarkdownFilePath(wire.path)
  return {
    id: wire.id,
    title: wire.title,
    tags: linkedTagsOf(wire.path, wire.body),
    created: wire.created,
    updated: wire.updated,
    archived: wire.archived,
    favorited: wire.favorited,
    ...(wire.group ? { group: wire.group } : {}),
    ...(wire.group && wire.folder ? { folder: wire.folder } : {}),
    sections: [{
      id: LINKED_SECTION_ID,
      name: wire.sectionName,
      content: wire.body,
      created: wire.created,
      ...(rawMode ? { isRawMode: true } : {}),
      ...(wire.aiHidden ? { aiHidden: true } : {}),
    }],
    raw: '',
    filePath: wire.path,
    linked: {
      path: wire.path,
      status: wire.status,
      ...(wire.error ? { error: wire.error } : {}),
      baseHash: wire.hash,
      diskBody: wire.body,
      syncedContent: wire.body,
    },
  }
}

export type LinkedReloadDecision =
  /** Nothing new from the disk's content (maybe status/metadata): keep the content. */
  | 'keep'
  /** The disk already holds what the note shows: adopt its version as the base. */
  | 'adopt'
  /** New disk content and nothing local pending: show it. */
  | 'apply'
  /** New disk content while there are local edits not on disk: never overwrite either. */
  | 'conflict'

/**
 * What to do with a linked note when main reports its file (`incoming`): the
 * disk content only replaces the note's when the note has no edit of its own
 * that isn't on disk (`pending` debounced save, content different from the last
 * synced one, or an open conflict). Unreadable/missing files never change the
 * content (they are read-only).
 */
export function decideLinkedReload(input: {
  localContent: string
  state: LinkedNoteState
  pending: boolean
  incomingHash: string | null
  incomingBody: string
}): LinkedReloadDecision {
  const { localContent, state, pending, incomingHash, incomingBody } = input
  if (incomingHash === null) return 'keep'
  if (incomingHash === state.baseHash && !state.conflict) return 'keep'
  if (incomingBody === localContent && !pending) return 'adopt'
  const dirty = pending || !!state.conflict || localContent !== state.syncedContent
  return dirty ? 'conflict' : 'apply'
}

/**
 * Merges main's view of a linked note into the store's copy. Metadata always
 * follows main (title alias, group, flags, status); the content follows
 * decideLinkedReload.
 */
export function mergeLinkedWire(existing: Note & { linked: LinkedNoteState }, wire: LinkedNoteWire, pending: boolean): { note: Note; decision: LinkedReloadDecision } {
  // Drafts only seed a note entering the store (startup / new window): here the store's
  // own content is what is local.
  const fresh = linkedNoteFromWireClean(wire)
  const localContent = existing.sections[0]?.content ?? ''
  const decision = decideLinkedReload({
    localContent, state: existing.linked, pending, incomingHash: wire.hash, incomingBody: wire.body,
  })
  const meta = { ...fresh, sections: [{ ...fresh.sections[0], content: localContent }] }
  const status = { status: wire.status, ...(wire.error ? { error: wire.error } : {}) }
  const base = { ...existing.linked, path: wire.path }
  delete base.error
  switch (decision) {
    case 'apply':
      return { note: fresh, decision }
    case 'adopt': {
      const { conflict: _conflict, ...rest } = base
      return { note: { ...meta, tags: existing.tags, linked: { ...rest, ...status, baseHash: wire.hash, diskBody: wire.body, syncedContent: localContent } }, decision }
    }
    case 'conflict':
      return {
        note: { ...meta, tags: existing.tags, linked: { ...base, ...status, conflict: { diskBody: wire.body, diskHash: wire.hash! } } },
        decision,
      }
    case 'keep':
      return { note: { ...meta, tags: existing.tags, linked: { ...base, ...status } }, decision }
  }
}

/**
 * htmlFromMarkdown options for a read-only preview of a linked note (`linkedNoteId`):
 * plain Markdown + its relative images resolved. Undefined for any other note.
 */
export function linkedPreviewOptions(linkedNoteId: string | null | undefined): { plain: true; imageSrc: (src: string) => string } | undefined {
  if (!linkedNoteId) return undefined
  return { plain: true, imageSrc: (src) => linkedImageSrc(linkedNoteId, src) }
}

/**
 * Display URL of an image of a linked note. Relative paths (`assets/a.png`,
 * `../img/b.svg`) are served by main from the linked file's folder through the
 * `nflinked:` scheme — the Markdown keeps the relative path. Anything else
 * (data:, http(s):, an absolute path…) is returned unchanged.
 */
export function linkedImageSrc(noteId: string, src: string): string {
  const s = src.trim()
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//') || s.startsWith('/') || s.startsWith('\\')) return src
  return `nflinked://n/${encodeURIComponent(noteId)}/${encodeURIComponent(s)}`
}

/** Total size of the images inlined in one copy (decoded bytes); past it, the rest keep their paths. */
export const INLINE_IMAGES_BUDGET_BYTES = 25 * 1024 * 1024

// `(code)` | `![alt](src "title")` — group 1 = code span run, 2 = alt, 3 = src, 4 = title.
// Mirror of MD_IMAGE_RE in electron/linkedNotesLogic.ts (main only serves a src it finds
// the same way in the note's body).
const MD_IMAGE_RE = /(`+)[\s\S]*?\1|!\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+("[^"\n]*"|'[^'\n]*'))?\s*\)/g

/** `<…>`-wrapped sources unwrapped, trimmed — mirror of normalizeImageSrc in main. */
function normalizeImageSrc(src: string): string {
  return src.trim().replace(/^<([\s\S]*)>$/, '$1').trim()
}

/**
 * A linked note's markdown made self-contained for a REGULAR note (duplicate, save
 * as template): every image with a relative path (`assets/a.png`, `../img/b.svg`,
 * also `![alt](<a b.png> "title")`) becomes the data URI `toDataUri` returns for
 * it — regular notes keep their images inline — and stays as it was when that
 * fails (null). Fetched one at a time, each distinct source once, up to
 * `budgetBytes` in total: past it, the remaining images keep their paths. A title
 * is dropped (NoteFlow's notes have no image titles: it would become part of the
 * src). Code spans and images by reference (`![alt][ref]`) are left alone.
 */
export async function inlineLinkedImages(
  md: string,
  toDataUri: (src: string) => Promise<string | null>,
  budgetBytes = INLINE_IMAGES_BUDGET_BYTES,
): Promise<string> {
  const jobs: Array<{ start: number; end: number; alt: string; src: string }> = []
  for (const m of md.matchAll(MD_IMAGE_RE)) {
    if (m[1]) continue // inside a code span
    const src = normalizeImageSrc(m[3])
    if (!src || linkedImageSrc('x', src) === src) continue // not a relative path
    jobs.push({ start: m.index!, end: m.index! + m[0].length, alt: m[2], src })
  }
  if (jobs.length === 0) return md
  const uris = new Map<string, string | null>()
  let spent = 0
  let exhausted = false
  for (const { src } of jobs) {
    if (uris.has(src) || exhausted) continue
    const uri = await toDataUri(src).catch(() => null)
    const bytes = uri ? Math.ceil(((uri.length - uri.indexOf(',') - 1) * 3) / 4) : 0
    if (uri && spent + bytes > budgetBytes) { exhausted = true; uris.set(src, null); continue }
    spent += bytes
    uris.set(src, uri)
  }
  let out = ''
  let pos = 0
  for (const j of jobs) {
    const uri = uris.get(j.src)
    out += md.slice(pos, j.start) + (uri ? `![${j.alt}](${uri})` : md.slice(j.start, j.end))
    pos = j.end
  }
  return out + md.slice(pos)
}

// Fence language of a plain-text file copied into a regular note, by extension. Anything
// else uses the extension itself when it looks like a language id (`toml`, `ini`, `sql`…).
const CODE_LANGUAGE_BY_EXT: Record<string, string> = {
  yml: 'yaml', py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', rb: 'ruby', rs: 'rust',
  sh: 'bash', zsh: 'bash', ps1: 'powershell', psm1: 'powershell', bat: 'dos', cmd: 'dos',
  kt: 'kotlin', cs: 'csharp', 'c++': 'cpp', cc: 'cpp', hpp: 'cpp', h: 'c', htm: 'html',
  txt: '', log: '', text: '',
}

/** Code fence language for a file name (`config.json` → `json`, `run.py` → `python`; '' = none). */
export function codeLanguageOf(fileName: string): string {
  const ext = /\.([^.\\/]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? ''
  if (!ext) return ''
  if (ext in CODE_LANGUAGE_BY_EXT) return CODE_LANGUAGE_BY_EXT[ext]
  return /^[a-z][a-z0-9+#-]{0,19}$/.test(ext) ? ext : ''
}

/**
 * A plain-text file's body as ONE fenced code block (```json … ```), for copying a plain-text
 * linked note into a regular note (duplicate, save as template). The fence is longer than
 * any run of backticks at the start of a line of the body, so the content can't close it.
 */
export function plainTextAsCodeBlock(fileName: string, body: string): string {
  let longest = 0
  for (const m of body.matchAll(/^[ \t]*(`{3,})/gm)) longest = Math.max(longest, m[1].length)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${codeLanguageOf(fileName)}\n${body}\n${fence}`
}
