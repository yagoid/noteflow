// Drawing blocks as TEXT in the main process and the AI worker: what a model and the
// semantic index see of a drawing, and how a section a model rewrote gets its drawings back.
//
// A drawing block is plain markdown in a section (format: src/lib/drawing/drawingBlock.ts,
// .agents/context/note-format.md): two comment markers around one code fence — `mermaid`
// (the source, text) or `excalidraw` (the scene: one JSON object per line). A scene must
// never reach a model nor an embedding as JSON: it is collapsed to one numbered line,
// `[drawing #n: label · label ; A → B]`.
//
// ⚠ MIRROR of src/lib/drawing/drawingCollapse.ts (+ the parts of drawingBlock.ts it needs:
// block matching, scene validity, drawingText). electron/ can't import from src/, so the
// logic is repeated here, self-contained. tests/lib/drawingCollapse.test.ts runs both on
// random documents and fails on any difference: change them together.

type Json = Record<string, unknown>

const OPEN_HINT_RE = /^<!--[ \t]*drawing/m
const DRAWING_OPEN_RE = /^<!--[ \t]*drawing(?:[ \t]+(.*?))?[ \t]*-->[ \t]*$/
const DRAWING_CLOSE_RE = /^<!--[ \t]*\/drawing[ \t]*-->[ \t]*$/
const DRAWING_FENCE_RE = /^(`{3,})(mermaid|excalidraw)[ \t]*$/
const BACKTICK_LINE_RE = /^(`{3,})[ \t]*$/
const CONFLICT_MARKER_RE = /^>[ \t]*⚠/
const FENCE_OPEN_RE = /^```/
const FENCE_CLOSE_RE = /^```[ \t]*$/
const SCENE_VERSION = 2

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isElement = (v: unknown): boolean =>
  isRecord(v) && typeof v.id === 'string' && v.id !== '' && typeof v.type === 'string' && v.type !== ''
const isDataUrl = (v: unknown): boolean => typeof v === 'string' && v.startsWith('data:')
const isLaterVersion = (version: unknown) => typeof version === 'number' && version > SCENE_VERSION

function parseJsonObject(text: string): Json | null {
  try {
    const v: unknown = JSON.parse(text)
    return isRecord(v) ? v : null
  } catch {
    return null
  }
}

function elementsOfDocument(doc: Json): Json[] | null {
  if (doc.type !== 'excalidraw' || !Array.isArray(doc.elements) || isLaterVersion(doc.version)) return null
  const ids = new Set<string>()
  const elements: Json[] = []
  for (const el of doc.elements) {
    if (!isElement(el) || ids.has((el as Json).id as string)) return null
    ids.add((el as Json).id as string)
    elements.push(el as Json)
  }
  if (doc.files !== undefined && doc.files !== null) {
    if (!isRecord(doc.files)) return null
    for (const file of Object.values(doc.files)) {
      if (!isRecord(file) || !isDataUrl(file.dataURL) || typeof file.mimeType !== 'string') return null
    }
  }
  return elements
}

/** The elements of a scene body, or null when it isn't a valid scene (parseSceneBody). */
function sceneElements(body: readonly string[]): Json[] | null {
  const lines = body.filter((l) => l.trim() !== '')
  if (lines.length === 0) return null
  const header = parseJsonObject(lines[0])
  if (!header) {
    const doc = parseJsonObject(body.join('\n'))
    return doc ? elementsOfDocument(doc) : null
  }
  if (header.type !== 'excalidraw' || isLaterVersion(header.version)) return null
  if (header.appState !== undefined && !isRecord(header.appState)) return null
  if (Array.isArray(header.elements)) return lines.length === 1 ? elementsOfDocument(header) : null

  const elements: Json[] = []
  const ids = new Set<string>()
  const files = new Set<string>()
  for (const line of lines.slice(1)) {
    const obj = parseJsonObject(line)
    if (!obj) return null
    if (isElement(obj)) {
      if (ids.has(obj.id as string)) return null
      ids.add(obj.id as string)
      elements.push(obj)
      continue
    }
    const file = obj.file
    if (Object.keys(obj).length !== 1 || !isRecord(file)) return null
    if (typeof file.id !== 'string' || !file.id || !isDataUrl(file.dataURL) || typeof file.mimeType !== 'string') return null
    if (files.has(file.id)) return null
    files.add(file.id)
  }
  return elements
}

interface Matched {
  kind: 'mermaid' | 'excalidraw'
  /** Scene elements (excalidraw only). */
  elements: Json[]
  end: number
}

function matchDrawingBlock(lines: readonly string[], start: number): Matched | null {
  const open = lines[start]?.match(DRAWING_OPEN_RE)
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
  if (fence[2] === 'mermaid') {
    return body.some((l) => CONFLICT_MARKER_RE.test(l)) ? null : { kind: 'mermaid', elements: [], end }
  }
  const elements = sceneElements(body)
  return elements ? { kind: 'excalidraw', elements, end } : null
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Labels and connections of a scene, one per line (drawingText of drawingBlock.ts). */
function sceneText(elements: Json[]): string[] {
  const live = elements.filter((el) => el.isDeleted !== true)
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const textOf = (el: Json) => oneLine(str(el.originalText) || str(el.text))
  const labelOf = new Map<string, string>()
  for (const el of live) {
    const container = str(el.containerId)
    if (el.type === 'text' && container && textOf(el) && !labelOf.has(container)) labelOf.set(container, textOf(el))
  }
  const nameOf = (id: unknown): string => {
    if (typeof id !== 'string') return ''
    const el = live.find((e) => e.id === id)
    if (!el) return ''
    return el.type === 'text' ? textOf(el) : labelOf.get(el.id as string) ?? ''
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
    const label = labelOf.get(el.id as string)
    const link = start && end ? `${from} ↔ ${to}` : end ? `${from} → ${to}` : start ? `${to} → ${from}` : `${from} — ${to}`
    links.push(label ? `${link}: ${label}` : link)
  }
  return [...labels, ...links]
}

function sceneSummary(elements: Json[]): string {
  const parts = sceneText(elements).filter(Boolean)
  const links = parts.filter((p) => / (?:→|↔|—) /.test(p))
  const labels = parts.filter((p) => !links.includes(p))
  return [labels.join(' · '), links.join(' ; ')].filter(Boolean).join(' ; ')
}

function mapDrawingBlocks(md: string, replace: (block: Matched, index: number, lines: string[]) => string[] | null): string {
  if (!OPEN_HINT_RE.test(md)) return md
  const raw = md.split('\n')
  const lines = raw.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  const eol = raw.length > 1 && raw[0].endsWith('\r') ? '\r' : ''
  const out: string[] = []
  let inFence = false
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) inFence = false
      out.push(raw[i])
      continue
    }
    const match = line.startsWith('<!--') ? matchDrawingBlock(lines, i) : null
    if (match) {
      const replaced = replace(match, ++count, lines.slice(i, match.end + 1))
      if (replaced) for (const l of replaced) out.push(l + eol)
      else for (let k = i; k <= match.end; k++) out.push(raw[k])
      if (match.end === lines.length - 1 && out.length > 0 && eol) out[out.length - 1] = out[out.length - 1].slice(0, -1)
      i = match.end
      continue
    }
    if (FENCE_OPEN_RE.test(line)) inFence = true
    out.push(raw[i])
  }
  return out.join('\n')
}

/**
 * The markdown with its SCENE blocks collapsed (Mermaid source blocks are text: they stay):
 * 'text' = one line with what the drawing says; 'marker' = the numbered `[drawing #n: …]`
 * line a model sees (restoreCollapsedDrawings puts the block back).
 */
export function collapseDrawings(md: string, mode: 'text' | 'marker'): string {
  let scenes = 0
  return mapDrawingBlocks(md, (block) => {
    if (block.kind !== 'excalidraw') return null
    scenes++
    const summary = sceneSummary(block.elements)
    if (mode === 'marker') {
      // (Brackets of a label become parentheses: the marker must stay one `[…]`.)
      const safe = summary.replace(/\[/g, '(').replace(/\]/g, ')')
      return [safe ? `[drawing #${scenes}: ${safe}]` : `[drawing #${scenes}]`]
    }
    return summary ? [summary] : []
  })
}

/** The markdown without any drawing block (tags: nothing inside a drawing is a `#tag`). */
export function stripDrawings(md: string): string {
  return mapDrawingBlocks(md, () => [])
}

const MARKER_RE = /\[drawing #(\d+)(?::[^\]\n]*)?\]/g
// What is left of a line once its markers are out is dropped when it is only a list or
// quote prefix (the model put the marker in an item of its own).
const LINE_PREFIX_RE = /^[ \t>]*(?:(?:[-*+]|\d+\.)[ \t]+(?:\[[ x]\][ \t]*)?)?/

/**
 * Undo collapseDrawings(…, 'marker') on a text a model rewrote. The model can't recreate a
 * scene, so a scene is never lost here:
 *   - a `[drawing #n…]` marker — alone on its line or anywhere in one (a list item, a
 *     quote, mid-sentence) — becomes the n-th scene block of `original` again, as a block
 *     of its own at that place (the rest of the line stays above it);
 *   - a scene whose marker the model left out (or only wrote inside a code fence) is kept:
 *     appended at the end of the section. Deleting a drawing is the user's job;
 *   - only markers of scenes `original` really has are touched: a number with no scene is
 *     the user's own text and stays; a second marker of the same scene is dropped; a text
 *     whose original had no scene is returned as it is.
 * Line endings follow `next`.
 */
export function restoreCollapsedDrawings(original: string, next: string): string {
  const scenes: string[][] = []
  mapDrawingBlocks(original, (block, _n, lines) => {
    if (block.kind === 'excalidraw') scenes.push(lines)
    return null
  })
  if (scenes.length === 0) return next
  const eol = next.includes('\r\n') ? '\r' : ''
  const used = new Set<number>()
  const out: string[] = []
  let blankDue = false
  const push = (raw: string) => {
    if (blankDue && raw.trim() !== '') out.push(eol)
    blankDue = false
    out.push(raw)
  }
  const pushScene = (n: number) => {
    if (out.length > 0 && out[out.length - 1].trim() !== '') out.push(eol)
    for (const line of scenes[n - 1]) out.push(line + eol)
    blankDue = true
    used.add(n)
  }
  let inFence = false
  for (const raw of next.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) inFence = false
      push(raw)
      continue
    }
    if (FENCE_OPEN_RE.test(line)) {
      inFence = true
      push(raw)
      continue
    }
    const found: number[] = []
    const rest = line.replace(MARKER_RE, (marker, digits: string) => {
      const n = Number(digits)
      if (!scenes[n - 1]) return marker
      if (!used.has(n) && !found.includes(n)) found.push(n)
      return ''
    })
    if (rest === line) {
      push(raw)
      continue
    }
    if (rest.replace(LINE_PREFIX_RE, '').trim() !== '') push(rest.replace(/[ \t]+$/, '') + eol)
    for (const n of found) pushScene(n)
  }
  for (let n = 1; n <= scenes.length; n++) {
    if (used.has(n)) continue
    // At the end of the text, after one blank line (not glued to its last line).
    while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
    pushScene(n)
  }
  if (out.length > 0 && out[out.length - 1].endsWith('\r')) out[out.length - 1] = out[out.length - 1].slice(0, -1)
  return out.join('\n')
}
