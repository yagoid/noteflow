// Linked notes (external .md files): keep the user's own Markdown source for
// everything they didn't touch. The rich editor saves its own serialization
// (htmlToMarkdown), which can spell unchanged parts differently (`*` bullets →
// `-`, `__bold__` → `**bold**`, spacing…): written as is, one typo fix would
// rewrite the whole file and show up as a huge diff in the project's Git
// history. preserveUnchangedBlocks puts back the original text of every
// top-level block whose rendering didn't change, and only accepts the result if
// it renders exactly like what the editor has (otherwise the editor's text wins).
// Pure — tests in tests/lib/linkedMarkdown.test.ts.

import { diffSequences } from './externalContentSync'

// How the rich editor of a linked note renders + serializes markdown (parse with the plain
// schema, serialize back). Registered by Editor.tsx, which owns the schema; the store uses it
// to keep unchanged blocks verbatim (preserveUnchangedBlocks). Without it, edits are written
// as the editor serializes them.
let linkedNormalizer: ((md: string) => string) | null = null
export function setLinkedNormalizer(fn: (md: string) => string): void { linkedNormalizer = fn }
export function getLinkedNormalizer(): ((md: string) => string) | null { return linkedNormalizer }

export interface TopBlocks {
  /** Text before the first block (blank lines with their newlines), verbatim. */
  lead: string
  /** Top-level blocks, verbatim (no surrounding blank lines nor final newline). */
  blocks: string[]
  /**
   * `seps[i]` = the verbatim text after blocks[i]: up to blocks[i + 1] (its line
   * break + the blank lines), or to the end of the text for the last block.
   */
  seps: string[]
}

const FENCE_OPEN_RE = /^```/
const FENCE_CLOSE_RE = /^```[ \t]*$/

/**
 * Splits markdown into its top-level blocks at blank lines. A fenced code block
 * (``` in column 0 up to its closing ```) is never split, whatever blank lines
 * it holds. `joinTopBlocks(splitTopBlocks(md)) === md`.
 */
export function splitTopBlocks(md: string): TopBlocks {
  const lines = md.split('\n')
  // [start, end) line ranges of the blocks.
  const ranges: Array<[number, number]> = []
  let start = -1
  let inFence = false
  lines.forEach((line, i) => {
    if (!inFence && !line.trim()) {
      if (start >= 0) { ranges.push([start, i]); start = -1 }
      return
    }
    if (start < 0) start = i
    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) inFence = false
    } else if (FENCE_OPEN_RE.test(line)) {
      inFence = true
    }
  })
  if (start >= 0) ranges.push([start, lines.length])
  if (ranges.length === 0) return { lead: md, blocks: [], seps: [] }
  const lead = lines.slice(0, ranges[0][0]).map((l) => `${l}\n`).join('')
  const blocks = ranges.map(([s, e]) => lines.slice(s, e).join('\n'))
  const seps = ranges.map(([, end], k) => {
    const next = ranges[k + 1]
    return next
      ? `\n${lines.slice(end, next[0]).map((l) => `${l}\n`).join('')}`
      : lines.slice(end).map((l) => `\n${l}`).join('')
  })
  return { lead, blocks, seps }
}

/** Inverse of splitTopBlocks. */
export function joinTopBlocks({ lead, blocks, seps }: TopBlocks): string {
  return lead + blocks.map((b, i) => b + (seps[i] ?? '')).join('')
}

/**
 * `text` with the blank lines before its first block and after its last one
 * taken from `from`. Those edges never render (the editor trims them), so the
 * file keeps its own — e.g. the blank line after a YAML frontmatter, or the
 * trailing blank lines of a document — whatever the editor's text has there.
 */
export function withBlankEdges(text: string, from: string): string {
  const f = splitTopBlocks(from)
  const t = splitTopBlocks(text)
  if (f.blocks.length === 0 || t.blocks.length === 0) return text
  return joinTopBlocks({ lead: f.lead, blocks: t.blocks, seps: [...t.seps.slice(0, -1), f.seps[f.seps.length - 1]] })
}

const LIST_LINE_RE = /^(\s*)([-*+]|\d+\.)([ \t])/

function isListBlock(block: string): boolean {
  const first = block.split('\n').find((l) => l.trim())
  return !!first && LIST_LINE_RE.test(first)
}

/** The bullet character the original list uses (`*`, `+` or `-`), when it uses one consistently. */
function bulletOf(block: string): string | null {
  const bullets = new Set(block.split('\n').map((l) => /^\s*([-*+])[ \t]/.exec(l)?.[1]).filter(Boolean))
  return bullets.size === 1 ? [...bullets][0]! : null
}

/** How the original list writes one nesting level: its indentation, bullet (null = ordered) and gap after the marker. */
interface ListLevel { indent: string; bullet: string | null; gap: string }

/**
 * The nesting levels of an original list, shallowest first: level k = the k-th
 * smallest indentation of its item lines (the editor writes level k with 2·k spaces).
 */
function listLevels(block: string): ListLevel[] {
  const byIndent = new Map<number, ListLevel>()
  for (const line of block.split('\n')) {
    const m = /^([ \t]*)([-*+]|\d+\.)([ \t]+)/.exec(line)
    if (!m || byIndent.has(m[1].length)) continue
    byIndent.set(m[1].length, { indent: m[1], bullet: /\d/.test(m[2]) ? null : m[2], gap: m[3] })
  }
  return [...byIndent.entries()].sort((a, b) => a[0] - b[0]).map(([, level]) => level)
}

/**
 * A new or edited item line (as the editor writes it: 2 spaces per level, `-`) in
 * the style of its original siblings: their indentation and bullet (one space after
 * the marker) — so it nests the same in CommonMark renderers (GitHub, Docusaurus…) as in
 * NoteFlow (`*   foo` / `    *   bar` + a new child → `    * baz`, in bar's column). A level one
 * deeper than any original one goes under the previous level's content column.
 */
function restyleListLine(line: string, levels: ListLevel[], bullet: string | null): string {
  const m = /^( *)(-|\d+\.) (.*)$/.exec(line)
  if (!m || m[1].length % 2 !== 0) return line
  const depth = m[1].length / 2
  const ordered = /\d/.test(m[2])
  let level: ListLevel | undefined = levels[depth]
  if (!level) {
    const parent = levels[levels.length - 1]
    if (!parent || depth !== levels.length) return bullet && !ordered ? `${m[1]}${bullet} ${m[3]}` : line
    const column = parent.indent.length + (parent.bullet ?? '1.').length + parent.gap.length
    level = { indent: ' '.repeat(column), bullet: parent.bullet ?? bullet, gap: ' ' }
  }
  const marker = ordered ? m[2] : (level.bullet ?? bullet ?? '-')
  // One space after the marker: NoteFlow reads any further space as text (an original
  // `*   foo` is the text "  foo", which the editor keeps in m[3]), so a wider gap would
  // change the text — the original gap only counts for the deeper levels' column.
  return `${level.indent}${marker} ${m[3]}`
}

/**
 * A changed list block written as close to its original source as possible: every
 * line whose rendering is unchanged keeps its original text (line diff against the
 * original as the editor writes it, when that maps line for line), and new or
 * edited item lines take the style of their original siblings (restyleListLine:
 * indentation, bullet, gap). Null when the result wouldn't render exactly like the
 * editor's block.
 */
function refineListBlock(original: string, edited: string, norm: (md: string) => string): string | null {
  const bullet = bulletOf(original)
  const levels = listLevels(original)
  const restyle = (line: string) => restyleListLine(line, levels, bullet)
  const oLines = original.split('\n')
  const nLines = norm(original).split('\n')
  const eLines = edited.split('\n')
  let lines: string[]
  if (nLines.length === oLines.length) {
    // Line i of the editor's version of the original stands for original line i.
    lines = []
    let ai = 0
    let bj = 0
    for (const h of [...diffSequences(nLines, eLines), { aStart: nLines.length, aEnd: nLines.length, bStart: eLines.length, bEnd: eLines.length }]) {
      while (ai < h.aStart && bj < h.bStart) { lines.push(oLines[ai++]); bj++ }
      for (let k = h.bStart; k < h.bEnd; k++) lines.push(restyle(eLines[k]))
      ai = h.aEnd
      bj = h.bEnd
    }
  } else {
    lines = eLines.map(restyle)
  }
  const candidate = lines.join('\n')
  if (candidate === edited) return null
  return norm(candidate) === edited ? candidate : null
}

/**
 * The file text to write for an edit made in the rich editor: `edited` (the
 * editor's serialization) with every block whose rendering is unchanged
 * replaced by its ORIGINAL source from `original` (the body on disk), the
 * original blank lines kept between two original blocks that stay adjacent,
 * the original leading / trailing blank lines ALWAYS kept (they don't render),
 * and a changed list block kept close to its source (refineListBlock: original
 * bullets and unchanged item lines). `normalize(md)` must render markdown and
 * serialize it back the way the editor does. If the result doesn't render to
 * `edited`, the editor's text is written (with the original's blank edges):
 * correctness first, the source is only kept when it means the same thing.
 * `cache` memoizes normalize() per block across saves.
 */
export function preserveUnchangedBlocks(
  original: string,
  edited: string,
  normalize: (md: string) => string,
  cache?: Map<string, string>,
): string {
  if (original === edited) return original
  const norm = (block: string) => {
    if (!cache) return normalize(block)
    let v = cache.get(block)
    if (v === undefined) {
      v = normalize(block)
      if (cache.size > 5000) cache.clear()
      cache.set(block, v)
    }
    return v
  }
  // Nothing renders differently → the file stays byte-identical.
  if (normalize(original) === edited) return original
  const o = splitTopBlocks(original)
  const e = splitTopBlocks(edited)
  if (o.blocks.length === 0 || e.blocks.length === 0) return edited
  const fallback = withBlankEdges(edited, original)
  const oNorm = o.blocks.map(norm)
  // origin[j] = index of the original block the edited block j stands for (or -1);
  // listPair[j] = the original list block a CHANGED edited list block replaced.
  const origin: number[] = new Array(e.blocks.length).fill(-1)
  const listPair: number[] = new Array(e.blocks.length).fill(-1)
  let ai = 0
  let bj = 0
  const hunks = diffSequences(oNorm, e.blocks)
  for (const h of [...hunks, { aStart: oNorm.length, aEnd: oNorm.length, bStart: e.blocks.length, bEnd: e.blocks.length }]) {
    while (ai < h.aStart && bj < h.bStart) origin[bj++] = ai++
    // Inside a hunk, the k-th edited list block replaced the k-th original one.
    const aLists: number[] = []
    for (let a = h.aStart; a < h.aEnd; a++) if (isListBlock(o.blocks[a])) aLists.push(a)
    let k = 0
    for (let b = h.bStart; b < h.bEnd && k < aLists.length; b++) if (isListBlock(e.blocks[b])) listPair[b] = aLists[k++]
    ai = h.aEnd
    bj = h.bEnd
  }
  const last = e.blocks.length - 1
  let out = o.lead
  e.blocks.forEach((block, j) => {
    const oi = origin[j]
    out += oi >= 0 ? o.blocks[oi] : listPair[j] >= 0 ? refineListBlock(o.blocks[listPair[j]], block, norm) ?? block : block
    // Original spacing between two original blocks that are still neighbours; the
    // editor's elsewhere; after the last block, always the original's trailing text.
    const keepSep = oi >= 0 && j < last && origin[j + 1] === oi + 1
    out += j === last ? o.seps[o.blocks.length - 1] : keepSep ? o.seps[oi] : e.seps[j]
  })
  if (out === fallback) return fallback
  const rendered = normalize(out)
  return rendered === edited || rendered === normalize(edited) ? out : fallback
}
