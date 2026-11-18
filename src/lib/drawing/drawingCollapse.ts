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
  const summary = sceneSummary(block)
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

const MARKER_LINE_RE = /^[ \t]*\[drawing #(\d+)(?::[^\n]*)?\][ \t]*$/

/**
 * Undo collapseDrawings(…, 'marker') on a text a model rewrote: each `[drawing #n…]` line
 * becomes the n-th scene block of `original` again, whatever the model did to the summary
 * after the number. A marker whose number has no block, or a second marker with the same
 * number, is removed. A scene the model left out is gone — the same rule as an image it
 * leaves out (restoreStrippedImages).
 */
export function restoreCollapsedDrawings(original: string, next: string): string {
  const scenes: string[][] = []
  mapDrawingBlocks(original, (block, _n, lines) => {
    if (block.kind === 'excalidraw') scenes.push(lines)
    return null
  })
  if (!/\[drawing #\d+/.test(next)) return next
  const used = new Set<number>()
  const out: string[] = []
  for (const raw of next.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const m = line.match(MARKER_LINE_RE)
    if (!m) { out.push(raw); continue }
    const n = Number(m[1])
    const scene = scenes[n - 1]
    if (!scene || used.has(n)) continue
    used.add(n)
    out.push(...scene)
  }
  return out.join('\n')
}
