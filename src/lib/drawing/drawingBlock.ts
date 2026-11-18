// ── In-note drawing blocks ───────────────────────────────────────────────────
//
// A drawing is plain markdown inside a section: two HTML comment markers around
// ONE code fence, whose info string says which variant it is.
//
//   <!-- drawing -->                      <!-- drawing height="320" -->
//   ```mermaid                            ```excalidraw
//   flowchart TD                          {"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}
//     A[Idea] --> B{Worth it?}            {"id":"a1","type":"rectangle","x":10,"y":20,"width":120,"height":60,…}
//   ```                                   {"id":"a2","type":"text","x":20,"y":30,…,"text":"Idea"}
//   <!-- /drawing -->                     {"file":{"id":"f1","mimeType":"image/png","created":1,"dataURL":"data:…"}}
//                                         ```
//                                         <!-- /drawing -->
//
// - **Source** (`mermaid`): the Mermaid text, verbatim. What the AI and the CLI write.
// - **Scene** (`excalidraw`): one JSON object per line — a header, then one line per
//   element (in z-order), then one line per image file. One element per line is what
//   makes a git diff readable and lets the line merge of the sync engines
//   (mergeSectionText) work per element. The serialization is canonical (see
//   serializeSceneBody): the same scene always gives the same bytes.
//
// Blank lines around the fence and between scene lines are tolerated (not emitted).
// Anything else makes it NOT a drawing: parseDrawingMarkdown returns null and
// markdownHtml renders the region as the ordinary markdown it is (two comment lines
// and a code block), so a malformed block — a sync conflict inside it, above all —
// is never rewritten. Pure (no React/DOM globals, no Excalidraw import): used by
// markdownHtml.ts, which every window loads.

import { escapeHtml } from '../markdownInline'

/** A scene element: Excalidraw's own JSON, opaque here but for `id` and `type`. */
export interface DrawingElement {
  id: string
  type: string
  [key: string]: unknown
}

/** An image of the scene (Excalidraw's BinaryFileData without volatile fields). */
export interface DrawingFile {
  id: string
  mimeType: string
  dataURL: string
  [key: string]: unknown
}

export interface DrawingSceneData {
  /** Only APP_STATE_KEYS survive serialization. */
  appState: Record<string, unknown>
  /** In z-order (back to front). */
  elements: DrawingElement[]
  files: Record<string, DrawingFile>
}

interface DrawingBlockBase {
  /** Raw attribute string of the opening marker, e.g. `height="320"`. Preserved verbatim
   *  on round-trip; read/written with getKanbanAttr / setKanbanAttr (same syntax). */
  attrs: string
}

export type DrawingBlock =
  | (DrawingBlockBase & { kind: 'mermaid'; source: string })
  | (DrawingBlockBase & { kind: 'excalidraw'; scene: DrawingSceneData })

export type DrawingKind = DrawingBlock['kind']

/** Opening marker (column 0); group 1 = raw attributes. */
export const DRAWING_OPEN_RE = /^<!--[ \t]*drawing(?:[ \t]+(.*?))?[ \t]*-->[ \t]*$/
/** Closing marker (column 0). */
export const DRAWING_CLOSE_RE = /^<!--[ \t]*\/drawing[ \t]*-->[ \t]*$/

// The fence of a drawing: 3+ backticks and exactly one of the two info strings.
const DRAWING_FENCE_RE = /^(`{3,})(mermaid|excalidraw)[ \t]*$/
// A line that is only backticks: closes a fence opened with that many or fewer.
const BACKTICK_LINE_RE = /^(`{3,})[ \t]*$/
// A marker line of a sync conflict block (mergeSectionText: `> ⚠️ Sync conflict…`,
// localized — the sign is the constant part). Inside a Mermaid source it would
// otherwise pass as diagram text.
const CONFLICT_MARKER_RE = /^>[ \t]*⚠/

// ── Scene body (the content of the `excalidraw` fence) ───────────────────────

/** Version of the scene format written in the header. A block whose header says a later one
 *  is not a drawing for this build (it stays text): an older client must not rewrite a format
 *  it doesn't know. */
const SCENE_VERSION = 2
const isLaterVersion = (version: unknown) => typeof version === 'number' && version > SCENE_VERSION

/** The only app state a note keeps: the look of the canvas, nothing of the session. */
const APP_STATE_KEYS = ['gridModeEnabled', 'gridSize', 'gridStep', 'viewBackgroundColor'] as const

// Bookkeeping Excalidraw rebuilds on load (restoreElements: version → 1,
// versionNonce → 0, updated → now, isDeleted → false). It only serves live
// collaboration, and it changes on every touch: left out, an element that ends up
// where it was serializes to the same line.
const VOLATILE_ELEMENT_KEYS = new Set(['isDeleted', 'updated', 'version', 'versionNonce'])
const VOLATILE_FILE_KEYS = new Set(['lastRetrieved'])

// Decimals kept. Geometry in scene pixels: 2 (1/100 px). Everything else that can be
// fractional (angle in radians, binding focus / fixedPoint ratios, freedraw
// pressures, line height…): 4. Integers are never touched.
const GEOMETRY_KEYS = new Set(['x', 'y', 'width', 'height', 'points', 'gap', 'fontSize'])
const GEOMETRY_DECIMALS = 2
const DEFAULT_DECIMALS = 4

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function roundNumber(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0
  if (Number.isInteger(n)) return n
  const f = 10 ** decimals
  const r = Math.round(n * f) / f
  return Object.is(r, -0) ? 0 : r
}

/** Canonical copy of a JSON value: object keys sorted, numbers rounded, undefined dropped. */
function canonicalValue(value: unknown, decimals: number): unknown {
  if (typeof value === 'number') return roundNumber(value, decimals)
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : canonicalValue(v, decimals)))
  if (isRecord(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalValue(value[key], decimals)
    }
    return out
  }
  return value
}

/** One canonical JSON line: `first` keys in that order, then the rest sorted. */
function canonicalLine(obj: Record<string, unknown>, first: readonly string[], skip: ReadonlySet<string>): string {
  const out: Record<string, unknown> = {}
  const put = (key: string) => {
    if (obj[key] === undefined || skip.has(key)) return
    out[key] = canonicalValue(obj[key], GEOMETRY_KEYS.has(key) ? GEOMETRY_DECIMALS : DEFAULT_DECIMALS)
  }
  for (const key of first) put(key)
  for (const key of Object.keys(obj).sort()) if (!first.includes(key)) put(key)
  // U+2028/2029 are line terminators for some tools: keep the line a line.
  return JSON.stringify(out).replace(LINE_SEPARATORS_RE, (c) => (c.charCodeAt(0) === 0x2028 ? '\\u2028' : '\\u2029'))
}

const LINE_SEPARATORS_RE = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g')
const ELEMENT_FIRST_KEYS = ['id', 'type', 'x', 'y', 'width', 'height']
const FILE_FIRST_KEYS = ['id', 'mimeType']
const NO_KEYS: ReadonlySet<string> = new Set()

/**
 * The lines of a scene, canonical: same scene → same bytes, whatever the key
 * order or float noise of the input.
 *   1. header   `{"type":"excalidraw","version":2,"appState":{…}}` (appState only
 *      with APP_STATE_KEYS, omitted when empty)
 *   2. one line per element that isn't deleted, in the order given (z-order):
 *      `id`, `type`, `x`, `y`, `width`, `height`, then the other keys sorted;
 *      nested objects with sorted keys; volatile bookkeeping left out;
 *      `boundElements: null` written `[]`
 *   3. one `{"file":{…}}` line per image still used by an element, sorted by id
 */
export function serializeSceneBody(scene: DrawingSceneData): string[] {
  const appState: Record<string, unknown> = {}
  for (const key of APP_STATE_KEYS) {
    if (scene.appState[key] !== undefined && scene.appState[key] !== null) appState[key] = scene.appState[key]
  }
  const header: Record<string, unknown> = { type: 'excalidraw', version: SCENE_VERSION }
  if (Object.keys(appState).length > 0) header.appState = appState
  const lines = [canonicalLine(header, ['type', 'version', 'appState'], NO_KEYS)]

  const usedFiles = new Set<string>()
  for (const element of scene.elements) {
    if (element.isDeleted === true) continue
    if (typeof element.fileId === 'string') usedFiles.add(element.fileId)
    // Excalidraw writes `boundElements: null` on a new element and `[]` once it has been
    // loaded (restoreElements): one spelling, or the line would change by reopening.
    const normalized = element.boundElements === null ? { ...element, boundElements: [] } : element
    lines.push(canonicalLine(normalized, ELEMENT_FIRST_KEYS, VOLATILE_ELEMENT_KEYS))
  }
  for (const id of Object.keys(scene.files).sort()) {
    if (!usedFiles.has(id)) continue
    const file = canonicalLine({ ...scene.files[id], id }, FILE_FIRST_KEYS, VOLATILE_FILE_KEYS)
    lines.push(`{"file":${file}}`)
  }
  return lines
}

function sceneFromDocument(doc: Record<string, unknown>): DrawingSceneData | null {
  if (doc.type !== 'excalidraw' || !Array.isArray(doc.elements) || isLaterVersion(doc.version)) return null
  const scene: DrawingSceneData = { appState: isRecord(doc.appState) ? doc.appState : {}, elements: [], files: {} }
  const ids = new Set<string>()
  for (const el of doc.elements) {
    if (!isElement(el) || ids.has(el.id)) return null
    ids.add(el.id)
    scene.elements.push(el)
  }
  if (doc.files !== undefined && doc.files !== null) {
    if (!isRecord(doc.files)) return null
    for (const [id, file] of Object.entries(doc.files)) {
      if (!isRecord(file) || typeof file.dataURL !== 'string' || typeof file.mimeType !== 'string') return null
      scene.files[id] = { ...file, id } as DrawingFile
    }
  }
  return scene
}

function isElement(v: unknown): v is DrawingElement {
  return isRecord(v) && typeof v.id === 'string' && v.id !== '' && typeof v.type === 'string' && v.type !== ''
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text)
    return isRecord(v) ? v : null
  } catch {
    return null
  }
}

/**
 * Read the content of an `excalidraw` fence. Line format (see serializeSceneBody),
 * blank lines ignored; or, as a convenience for pasted scenes, a whole Excalidraw
 * document (`{"type":"excalidraw","elements":[…],…}`, any layout). null when
 * anything is off: a line that isn't a JSON object, no header, a header of a later format
 * version, an element without `id`/`type`, a duplicated id, an unknown kind of line.
 */
export function parseSceneBody(body: readonly string[]): DrawingSceneData | null {
  const lines = body.filter((l) => l.trim() !== '')
  if (lines.length === 0) return null

  const header = parseJsonObject(lines[0])
  if (!header) {
    const doc = parseJsonObject(body.join('\n'))
    return doc ? sceneFromDocument(doc) : null
  }
  if (header.type !== 'excalidraw' || isLaterVersion(header.version)) return null
  if (header.appState !== undefined && !isRecord(header.appState)) return null
  if (Array.isArray(header.elements)) return lines.length === 1 ? sceneFromDocument(header) : null

  const scene: DrawingSceneData = { appState: isRecord(header.appState) ? header.appState : {}, elements: [], files: {} }
  const ids = new Set<string>()
  for (const line of lines.slice(1)) {
    const obj = parseJsonObject(line)
    if (!obj) return null
    if (isElement(obj)) {
      if (ids.has(obj.id)) return null
      ids.add(obj.id)
      scene.elements.push(obj)
      continue
    }
    const file = obj.file
    if (Object.keys(obj).length !== 1 || !isRecord(file)) return null
    if (typeof file.id !== 'string' || !file.id || typeof file.dataURL !== 'string' || typeof file.mimeType !== 'string') return null
    if (scene.files[file.id]) return null
    scene.files[file.id] = file as DrawingFile
  }
  return scene
}

// ── Markdown ↔ block ─────────────────────────────────────────────────────────

/**
 * A drawing block starting at `lines[start]` (its opening marker): the block and
 * the index of its closing marker, or null. The fence is the block's own — its
 * closing line is the first one made only of at least as many backticks as the
 * opening — so it is matched here, not by the code-fence pass of markdownHtml.
 */
export function matchDrawingBlock(lines: readonly string[], start: number): { block: DrawingBlock; end: number } | null {
  const open = lines[start]?.match(DRAWING_OPEN_RE)
  // `-->` inside the attributes: the comment ends there for any HTML reader, and the
  // attributes couldn't be written back verbatim. Not a marker.
  if (!open || (open[1] ?? '').includes('-->')) return null
  let i = start + 1
  while (i < lines.length && lines[i].trim() === '') i++
  const fence = lines[i]?.match(DRAWING_FENCE_RE)
  if (!fence) return null

  const bodyStart = i + 1
  let bodyEnd = -1
  for (let j = bodyStart; j < lines.length; j++) {
    const m = lines[j].match(BACKTICK_LINE_RE)
    if (m && m[1].length >= fence[1].length) { bodyEnd = j; break }
  }
  if (bodyEnd === -1) return null
  let end = bodyEnd + 1
  while (end < lines.length && lines[end].trim() === '') end++
  if (end >= lines.length || !DRAWING_CLOSE_RE.test(lines[end])) return null

  const body = lines.slice(bodyStart, bodyEnd)
  const attrs = (open[1] ?? '').trim()
  if (fence[2] === 'mermaid') {
    if (body.some((l) => CONFLICT_MARKER_RE.test(l))) return null
    return { block: { kind: 'mermaid', attrs, source: body.join('\n') }, end }
  }
  const scene = parseSceneBody(body)
  return scene ? { block: { kind: 'excalidraw', attrs, scene }, end } : null
}

/**
 * Parse a whole drawing block (opening marker … closing marker; surrounding blank
 * lines ignored). Returns null when it isn't a valid one — callers must then
 * leave the text alone.
 */
export function parseDrawingMarkdown(text: string): DrawingBlock | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && !lines[0].trim()) lines.shift()
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()
  const match = matchDrawingBlock(lines, 0)
  return match && match.end === lines.length - 1 ? match.block : null
}

/** The fence content of a block: the Mermaid source lines, or the canonical scene lines. */
export function drawingBodyLines(block: DrawingBlock): string[] {
  if (block.kind === 'excalidraw') return serializeSceneBody(block.scene)
  return block.source === '' ? [] : block.source.replace(/\r\n?/g, '\n').split('\n')
}

/** Serialize a block from the fence language, attributes and fence content. */
function blockMarkdown(kind: DrawingKind, rawAttrs: string, body: readonly string[]): string {
  // Longer than any backtick-only line of the content (indented ones count too: for
  // other markdown readers they would close the fence).
  let ticks = 3
  for (const line of body) {
    const m = line.match(/^\s*(`{3,})\s*$/)
    if (m) ticks = Math.max(ticks, m[1].length + 1)
  }
  const fence = '`'.repeat(ticks)
  const attrs = rawAttrs.replace(/\s*\n\s*/g, ' ').trim()
  return [attrs ? `<!-- drawing ${attrs} -->` : '<!-- drawing -->', `${fence}${kind}`, ...body, fence, '<!-- /drawing -->'].join('\n')
}

/**
 * Serialize a block to markdown, from the opening to the closing marker (no
 * trailing newline). Always re-parses with parseDrawingMarkdown, except what a parse
 * never produces: a Mermaid source carrying a sync conflict marker line, attributes
 * holding `-->` (they are written as given: opaque).
 */
export function serializeDrawingMarkdown(block: DrawingBlock): string {
  return blockMarkdown(block.kind, block.attrs, drawingBodyLines(block))
}

// ── Block ↔ HTML ─────────────────────────────────────────────────────────────

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;')
}

/**
 * HTML of a drawing, rendered by htmlFromMarkdown (previews and the editor). The
 * data-* attributes are the source of truth for the way back (drawingFromElement):
 * `data-body` is the fence content. The `<pre>` child is only what a renderer
 * without a drawing view shows (drawingText): it is never read back.
 *
 *   <div data-type="drawing" data-kind="mermaid|excalidraw" data-attrs="…" data-body="…">
 *     <pre data-drawing-fallback><code>…</code></pre>
 *   </div>
 */
export function drawingToHtml(block: DrawingBlock): string {
  const body = drawingBodyLines(block).join('\n')
  return `<div data-type="drawing" data-kind="${block.kind}" data-attrs="${escapeAttr(block.attrs)}"` +
    ` data-body="${escapeAttr(body)}">` +
    `<pre data-drawing-fallback=""><code>${escapeHtml(drawingText(block))}</code></pre></div>`
}

/** What a `div[data-type="drawing"]` carries, as stored (the editor node keeps exactly this). */
export interface DrawingHtmlData {
  kind: DrawingKind
  attrs: string
  /** Fence content, lines joined with '\n'. */
  body: string
}

export function drawingHtmlDataFromElement(el: Element): DrawingHtmlData {
  return {
    kind: el.getAttribute('data-kind') === 'excalidraw' ? 'excalidraw' : 'mermaid',
    attrs: el.getAttribute('data-attrs') ?? '',
    body: (el.getAttribute('data-body') ?? '').replace(/\r\n?/g, '\n'),
  }
}

/** The block of some HTML data; null if its scene body doesn't parse (never for our own HTML). */
export function drawingFromHtmlData(data: DrawingHtmlData): DrawingBlock | null {
  const body = data.body === '' ? [] : data.body.split('\n')
  if (data.kind === 'mermaid') return { kind: 'mermaid', attrs: data.attrs, source: body.join('\n') }
  const scene = parseSceneBody(body)
  return scene ? { kind: 'excalidraw', attrs: data.attrs, scene } : null
}

/**
 * Markdown of some HTML data. A scene is re-serialized (canonical); a body that
 * doesn't parse is written as it came rather than dropped.
 */
export function drawingHtmlDataToMarkdown(data: DrawingHtmlData): string {
  // Every save of a section comes through here for each of its drawings (parse + canonical
  // re-serialization of the whole scene): the same data always gives the same text.
  const key = `${data.kind}\n${data.attrs}\n${data.body}`
  const hit = markdownCache.get(key)
  if (hit !== undefined) return hit
  const block = drawingFromHtmlData(data)
  const md = block ? serializeDrawingMarkdown(block) : blockMarkdown(data.kind, data.attrs, data.body.split('\n'))
  markdownCache.set(key, md)
  while (markdownCache.size > MARKDOWN_CACHE_LIMIT) markdownCache.delete(markdownCache.keys().next().value as string)
  return md
}

const MARKDOWN_CACHE_LIMIT = 24
const markdownCache = new Map<string, string>()

// ── Readable text (search, AI context, word count) ───────────────────────────

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * What a drawing says, as text. Source: the Mermaid text. Scene: the text of its
 * labels (one per line, in z-order; a shape's label once, under the shape), then
 * the connections its arrows make between labelled elements ("A → B", "A — B"
 * when the arrow has no heads, "A ↔ B" with two; with the arrow's own label,
 * "A → B: label").
 */
export function drawingText(block: DrawingBlock): string {
  if (block.kind === 'mermaid') return block.source.trim()
  const { elements } = block.scene
  const live = elements.filter((el) => el.isDeleted !== true)
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const textOf = (el: DrawingElement) => oneLine(str(el.originalText) || str(el.text))

  // A container's label is a text element pointing at it (containerId).
  const labelOf = new Map<string, string>()
  for (const el of live) {
    const container = str(el.containerId)
    if (el.type === 'text' && container && textOf(el) && !labelOf.has(container)) labelOf.set(container, textOf(el))
  }
  const nameOf = (id: unknown): string => {
    if (typeof id !== 'string') return ''
    const el = live.find((e) => e.id === id)
    if (!el) return ''
    return el.type === 'text' ? textOf(el) : labelOf.get(el.id) ?? ''
  }
  const boundId = (binding: unknown) => (isRecord(binding) ? binding.elementId : undefined)

  const labels: string[] = []
  const links: string[] = []
  for (const el of live) {
    if (el.type === 'text') {
      if (textOf(el)) labels.push(textOf(el))
      continue
    }
    if (el.type !== 'arrow' && el.type !== 'line') continue
    const from = nameOf(boundId(el.startBinding))
    const to = nameOf(boundId(el.endBinding))
    if (!from || !to) continue
    const start = el.startArrowhead != null
    const end = el.endArrowhead != null
    const label = labelOf.get(el.id)
    const link = start && end ? `${from} ↔ ${to}` : end ? `${from} → ${to}` : start ? `${to} → ${from}` : `${from} — ${to}`
    links.push(label ? `${link}: ${label}` : link)
  }
  return [...labels, ...links].join('\n')
}
