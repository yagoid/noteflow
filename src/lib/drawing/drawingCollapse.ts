// Drawing blocks as TEXT, for everything that reads a section's markdown without rendering
// it: search, word counts, tags, text previews, and (through its mirror in the main
// process, electron/drawingText.ts) what the AI sees. A scene block is JSON — hundreds of
// lines of ids, seeds and colours that must never be searched, counted, tagged or sent to a
// model; what it SAYS is drawingText (its labels and connections).
//
// ⚠ MIRROR: electron/drawingText.ts implements the same functions for the main process and
// the AI worker (electron/ can't import from src/). tests/lib/drawingCollapse.test.ts
// checks both give the same output on random documents: change them together.
import { drawingText, matchDrawingBlock, type DrawingBlock } from './drawingBlock'

const OPEN_HINT_RE = /^<!--[ \t]*drawing/m
const FENCE_OPEN_RE = /^```/
const FENCE_CLOSE_RE = /^```[ \t]*$/

/**
 * Rewrites the drawing blocks of a markdown text: `replace` gets each valid block (its
 * running number from 1, and its own lines) and returns the lines to put in its place, or
 * null to leave it as it is. Everything else is returned untouched, line endings included.
 * A block inside a code fence isn't one (the markers are code), and neither is an invalid
 * one. Lighter than htmlFromMarkdown's own pass on purpose — the odd case it reads
 * differently (a drawing glued under an unclosed fence) only changes what a search or a
 * count sees, never what is stored.
 */
export function mapDrawingBlocks(
  md: string,
  replace: (block: DrawingBlock, index: number, lines: string[]) => string[] | null,
): string {
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
      const replaced = replace(match.block, ++count, lines.slice(i, match.end + 1))
      if (replaced) for (const l of replaced) out.push(l + eol)
      else for (let k = i; k <= match.end; k++) out.push(raw[k])
      // The last line of the text has no line ending of its own.
      if (match.end === lines.length - 1 && out.length > 0 && eol) out[out.length - 1] = out[out.length - 1].slice(0, -1)
      i = match.end
      continue
    }
    if (FENCE_OPEN_RE.test(line)) inFence = true
    out.push(raw[i])
  }
  return out.join('\n')
}

/** What a scene says, on one line: `label · label ; A → B ; C — D` ('' = nothing). */
export function sceneSummary(block: DrawingBlock): string {
  const parts = drawingText(block).split('\n').filter(Boolean)
  const links = parts.filter((p) => / (?:→|↔|—) /.test(p))
  const labels = parts.filter((p) => !links.includes(p))
  return [labels.join(' · '), links.join(' ; ')].filter(Boolean).join(' ; ')
}

/** The one-line stand-in of the n-th scene block for a model: `[drawing #2: A · B ; A → B]`. */
export function drawingMarker(block: DrawingBlock, n: number): string {
  // (Brackets of a label become parentheses: the marker must stay one `[…]`.)
  const summary = sceneSummary(block).replace(/\[/g, '(').replace(/\]/g, ')')
  return summary ? `[drawing #${n}: ${summary}]` : `[drawing #${n}]`
}

/**
 * The markdown with its SCENE blocks collapsed (Mermaid source blocks are already text
 * and stay as they are):
 *   - 'text': one line with what the drawing says — what search and word counts read;
 *   - 'marker': the numbered `[drawing #n: …]` line a model sees (restoreCollapsedDrawings
 *     puts the block back when the model returns it).
 */
export function collapseDrawings(md: string, mode: 'text' | 'marker'): string {
  let scenes = 0
  return mapDrawingBlocks(md, (block) => {
    if (block.kind !== 'excalidraw') return null
    scenes++
    if (mode === 'marker') return [drawingMarker(block, scenes)]
    const summary = sceneSummary(block)
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
