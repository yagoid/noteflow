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

// The marker as a model may write it back: any case, loose spacing (`[Drawing #1]`,
// `[drawing  #2]`, `[drawing#2]`), with or without the summary, brackets escaped or not.
// Groups: 1 / 3 = the spaces around it, 2 = the number.
const MARKER_RE = /([ \t]*)\\?\[\s*drawing\s*#\s*(\d+)\s*(?::[^\]\n]*)?\\?\]([ \t]*)/gi

/**
 * The number each scene of `md` goes by in the marker view, in order: 1, 2, 3… SKIPPING
 * every number a marker-looking text of the section itself already uses ("see
 * [Drawing #1] of the spec" → the first scene is #2). A marker and a text of the user are
 * then never the same thing: the view of a section goes back to that section exactly, and
 * a text the user wrote is never taken for a drawing. Collapse and restore both number
 * from the same section, so they agree.
 */
function sceneNumbering(md: string): () => number {
  const taken = new Set<number>()
  const text = mapDrawingBlocks(md, (block) => (block.kind === 'excalidraw' ? [] : null))
  for (const m of text.matchAll(MARKER_RE)) taken.add(Number(m[2]))
  let n = 0
  return () => {
    do n++
    while (taken.has(n))
    return n
  }
}

/**
 * The markdown with its SCENE blocks collapsed (Mermaid source blocks are already text
 * and stay as they are):
 *   - 'text': one line with what the drawing says — what search and word counts read;
 *   - 'marker': the numbered `[drawing #n: …]` line a model sees (restoreCollapsedDrawings
 *     puts the block back when the model returns it). Numbers: see sceneNumbering.
 */
export function collapseDrawings(md: string, mode: 'text' | 'marker'): string {
  const number = mode === 'marker' ? sceneNumbering(md) : null
  return mapDrawingBlocks(md, (block) => {
    if (block.kind !== 'excalidraw') return null
    if (number) return [drawingMarker(block, number())]
    const summary = sceneSummary(block)
    return summary ? [summary] : []
  })
}

/** The markdown without any drawing block (tags: nothing inside a drawing is a `#tag`). */
export function stripDrawings(md: string): string {
  return mapDrawingBlocks(md, () => [])
}

// What is left of a line once its markers are out is dropped when it is only a quote,
// heading or list prefix (the model put the marker in a line of its own kind).
const LINE_PREFIX_RE = /^[ \t>]*(?:#{1,6}[ \t]*|(?:[-*+]|\d+\.)(?:[ \t]+(?:\[[ x]\][ \t]*)?)?)?/
// Structures a block can't be dropped into: a table row, a kanban board.
const TABLE_ROW_RE = /^[ \t]*\|/
const BOARD_OPEN_RE = /^<!--[ \t]*kanban(?:[ \t][^\n]*)?-->[ \t]*$/
const BOARD_CLOSE_RE = /^<!--[ \t]*\/kanban[ \t]*-->[ \t]*$/

/**
 * What a marker leaves in its line once taken out: one space where it sat between two
 * words, nothing at the end of the line, and at its start only the indentation the line
 * had (`before`, there). Only the marker's own gap is touched — the rest of the line
 * (inline code, aligned text) keeps its spacing.
 */
function markerGap(before: string, after: string, atStart: boolean, atEnd: boolean): string {
  if (atEnd) return ''
  if (atStart) return before
  return before && after ? ' ' : before + after
}

/**
 * Undo collapseDrawings(…, 'marker') on a text a model rewrote. The model can't recreate a
 * scene, so a scene is never lost here:
 *   - a `[drawing #n…]` marker — alone on its line or anywhere in one (a list item, a
 *     quote, a heading, mid-sentence) — becomes the n-th scene block of `original` again,
 *     as a block of its own at that place (the rest of the line stays above it);
 *   - inside a table row or a kanban board the block would break the structure: it goes
 *     right AFTER the table / board;
 *   - a scene whose marker the model left out (or only wrote inside a code fence) is kept:
 *     appended at the end of the section — after closing a fence the model left open, so
 *     the drawing isn't swallowed by the code. Deleting a drawing is the user's job;
 *   - only markers of scenes `original` really has are touched: a number with no scene is
 *     the user's own text and stays — and a number the user already wrote in `original`
 *     ("see [Drawing #1] of the spec") is never the number of a scene (sceneNumbering); a
 *     second marker of the same scene is dropped; a text whose original had no scene is
 *     returned as it is.
 * Line endings follow `next`.
 */
export function restoreCollapsedDrawings(original: string, next: string): string {
  // By the number the collapse gave each one (insertion order = document order).
  const scenes = new Map<number, string[]>()
  const number = sceneNumbering(original)
  mapDrawingBlocks(original, (block, _n, lines) => {
    if (block.kind === 'excalidraw') scenes.set(number(), lines)
    return null
  })
  if (scenes.size === 0) return next
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
    if (used.has(n)) return
    if (out.length > 0 && out[out.length - 1].trim() !== '') out.push(eol)
    for (const line of scenes.get(n)!) out.push(line + eol)
    blankDue = true
    used.add(n)
  }
  // Scenes whose marker sat in a table row / a board: placed once that structure ends.
  let deferred: number[] = []
  const flush = () => {
    for (const n of deferred) pushScene(n)
    deferred = []
  }
  let inFence = false
  let inBoard = false
  for (const raw of next.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) inFence = false
      push(raw)
      continue
    }
    const isRow = TABLE_ROW_RE.test(line)
    if (deferred.length > 0 && !inBoard && !isRow) flush()
    if (FENCE_OPEN_RE.test(line)) {
      inFence = true
      push(raw)
      continue
    }
    if (!inBoard && BOARD_OPEN_RE.test(line)) inBoard = true
    const found: number[] = []
    const rest = line.replace(MARKER_RE, (marker: string, before: string, digits: string, after: string, offset: number) => {
      const n = Number(digits)
      if (!scenes.has(n)) return marker
      if (!used.has(n) && !found.includes(n) && !deferred.includes(n)) found.push(n)
      return markerGap(before, after, line.slice(0, offset).trim() === '', line.slice(offset + marker.length).trim() === '')
    })
    if (rest === line) {
      push(raw)
    } else if (isRow || inBoard) {
      push(rest + eol)
      deferred.push(...found)
    } else {
      if (rest.replace(LINE_PREFIX_RE, '').trim() !== '') push(rest + eol)
      for (const n of found) pushScene(n)
    }
    if (inBoard && BOARD_CLOSE_RE.test(line)) {
      inBoard = false
      flush()
    }
  }
  flush()
  let closed = !inFence
  for (const n of scenes.keys()) {
    if (used.has(n)) continue
    // At the end of the text, after one blank line (not glued to its last line) — and
    // outside a code fence the model never closed.
    while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
    if (!closed) {
      out.push('```' + eol)
      closed = true
    }
    pushScene(n)
  }
  if (out.length > 0 && out[out.length - 1].endsWith('\r')) out[out.length - 1] = out[out.length - 1].slice(0, -1)
  return out.join('\n')
}
