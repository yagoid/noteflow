// Random editor documents and markdown for the md↔editor round-trip fuzz
// (tests/lib/editorRoundTrip.test.ts). Deterministic: everything is driven by a
// seeded PRNG, so a failure always reproduces from its seed.
//
// Documents are ProseMirror JSON for the editor schema (editorPipeline.ts).
// The generator only writes what the user can reach in the editor, with plain
// words for text: inline-syntax corner cases (a literal `**`, `# ` or `- ` at
// the start of a line, spaces around marks) are markdownInline's own tests'
// business, and ProseMirror itself collapses the whitespace of parsed HTML, so
// text never has double spaces or spaces next to a hard break / block edge.
//
// Constructs the markdown format can't tell apart from another document are
// NOT avoided silently: the generator makes them too, and `ambiguity()` names
// them, so a test can skip exactly those and nothing else. Keep that list in
// sync with "Ambigüedades del formato" in .claude/context/patterns.md.

import type { Node as PMNode } from '@tiptap/pm/model'
import { createBoard, normalizeBoard } from '../../src/lib/kanbanOps'
import type { KanbanBoardData } from '../../src/lib/kanban'

// ── PRNG ─────────────────────────────────────────────────────────────────────

export interface Rng {
  /** [0, 1) */
  next(): number
  /** Integer in [0, n) */
  int(n: number): number
  pick<T>(items: readonly T[]): T
  chance(p: number): boolean
}

/** mulberry32: tiny, fast and good enough to drive a fuzzer. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  }
}

// ── ProseMirror JSON builders ────────────────────────────────────────────────

export interface JMark { type: string; attrs?: Record<string, unknown> }
export interface JNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JNode[]
  marks?: JMark[]
  text?: string
}

const text = (t: string, marks: JMark[] = []): JNode => (marks.length ? { type: 'text', text: t, marks } : { type: 'text', text: t })
const br = (): JNode => ({ type: 'hardBreak' })
const brs = (n: number): JNode[] => Array.from({ length: n }, br)
export const paragraph = (content: JNode[] = []): JNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' })

// Words that can't be read as markdown syntax wherever they land (start of a
// line included): no `#`, `>`, `|`, `-`/`*`/`+`/`1.` markers, `[`, `` ` ``, `<`.
const WORDS = [
  'alpha', 'beta', 'Gamma', 'día', 'NSL', '5.9.3', 'B42.', 'x', 'tamper', '(nota)',
  'ok?', '¿qué?', 'EAV', 'a/b', '24h', 'über', 'fin.', 'Esperar...', 'v2', 'π',
]

const B: JMark = { type: 'bold' }
const I: JMark = { type: 'italic' }
const U: JMark = { type: 'underline' }
const S: JMark = { type: 'strike' }
const H: JMark = { type: 'highlight' }
const C: JMark = { type: 'code' }
const L: JMark = { type: 'link', attrs: { href: 'https://example.com/a?b=1' } }
const MARK_SETS: JMark[][] = [[B], [I], [U], [S], [H], [C], [L], [B, H], [B, I], [I, U], [S, B], [B, L], [H, I]]

function words(rng: Rng, max = 3): string {
  return Array.from({ length: 1 + rng.int(max) }, () => rng.pick(WORDS)).join(' ')
}

/** Join adjacent text nodes with the same marks, as ProseMirror's parser does. */
function mergeText(nodes: JNode[]): JNode[] {
  const key = (n: JNode) => JSON.stringify((n.marks ?? []).map((m) => m.type).sort())
  const out: JNode[] = []
  for (const n of nodes) {
    const last = out[out.length - 1]
    if (n.type === 'text' && last?.type === 'text' && key(last) === key(n)) {
      out[out.length - 1] = { ...last, text: last.text! + n.text! }
    } else {
      out.push(n)
    }
  }
  return out
}

interface InlineOptions {
  /** Hard breaks: anywhere ('any'), only between words ('inner'), never. */
  breaks: 'any' | 'inner' | 'none'
  /** Inline atoms (images, section relations). */
  atoms: boolean
  /** Chance of an empty textblock. */
  empty: number
  /** Chance of leading breaks (default 0.15). */
  lead?: number
}

/** A run of hard breaks: mostly one, sometimes two or three (a blank line is
 *  ambiguous in most places, see ambiguity(); it's made, just less often). */
function breakRun(rng: Rng, blankLine: number): JNode[] {
  return brs(rng.chance(blankLine) ? 2 + rng.int(2) : 1)
}

function inlineSegment(rng: Rng, o: InlineOptions): JNode {
  if (o.atoms && rng.chance(0.05)) {
    return { type: 'sectionRelation', attrs: { noteId: 'n1', sectionId: 's1', sectionName: 'Other section' } }
  }
  if (o.atoms && rng.chance(0.04)) {
    return { type: 'image', attrs: { src: 'https://example.com/a.png', alt: 'pic', title: null, width: rng.chance(0.5) ? 120 : null } }
  }
  return text(words(rng), rng.chance(0.45) ? rng.pick(MARK_SETS) : [])
}

/** Inline content: words, marks, hard breaks at the start/middle/end, runs of 1-3. */
export function inline(rng: Rng, o: InlineOptions): JNode[] {
  if (rng.chance(o.empty)) return o.breaks === 'any' && rng.chance(0.3) ? brs(1 + rng.int(3)) : []
  const out: JNode[] = []
  if (o.breaks === 'any' && rng.chance(o.lead ?? 0.15)) out.push(...breakRun(rng, 0.2))
  const segments = 1 + rng.int(4)
  for (let i = 0; i < segments; i++) {
    if (i > 0) {
      if (o.breaks !== 'none' && rng.chance(0.3)) out.push(...(o.breaks === 'inner' ? brs(1 + rng.int(3)) : breakRun(rng, 0.03)))
      else out.push(text(' '))
    }
    out.push(inlineSegment(rng, o))
  }
  if (o.breaks === 'any' && rng.chance(0.25)) out.push(...breakRun(rng, 0.2))
  return mergeText(out)
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export type ListType = 'bulletList' | 'orderedList' | 'taskList'
export const LIST_TYPES: readonly ListType[] = ['bulletList', 'orderedList', 'taskList']

function taskAttrs(rng: Rng): Record<string, unknown> {
  return {
    checked: rng.chance(0.3),
    due: rng.chance(0.2) ? `2026-10-${String(10 + rng.int(20))}` : null,
    alarm: rng.chance(0.15) ? rng.pick(['09:30', '18:05']) : null,
    importance: rng.chance(0.15) ? rng.pick(['low', 'medium', 'high']) : null,
  }
}

export function listItem(type: ListType, para: JNode, children: JNode[] = [], attrs?: Record<string, unknown>): JNode {
  return type === 'taskList'
    ? { type: 'taskItem', attrs: attrs ?? { checked: false, due: null, alarm: null, importance: null }, content: [para, ...children] }
    : { type: 'listItem', content: [para, ...children] }
}

export function list(type: ListType, items: JNode[]): JNode {
  return { type, content: items }
}

/** Mostly a different list kind (two same-kind lists in a row are ambiguous). */
function otherKind(rng: Rng, kind: ListType): ListType {
  return rng.chance(0.1) ? kind : rng.pick(LIST_TYPES.filter((k) => k !== kind))
}

/** A list at `depth` (0 = top level), nested up to 3 levels with mixed kinds. */
function genList(rng: Rng, depth: number, type: ListType = rng.pick(LIST_TYPES)): JNode {
  const items = Array.from({ length: 1 + rng.int(3) }, (_, index) => {
    // `- ` (an empty bullet item) below a sibling is read as a blank line
    // (ambiguity()): rarer for bullets after the first.
    const bullet = type === 'bulletList' && index > 0
    const para = paragraph(inline(rng, { breaks: 'any', atoms: true, empty: bullet ? 0.02 : 0.08, lead: bullet ? 0.03 : 0.15 }))
    const children: JNode[] = []
    if (depth < 2 && rng.chance(0.35)) {
      children.push(genList(rng, depth + 1))
      if (rng.chance(0.25)) children.push(genList(rng, depth + 1, otherKind(rng, children[0].type as ListType)))
    }
    // Backspace at the start of an item joins it into the one above as a second
    // paragraph (ambiguity() names it).
    if (rng.chance(0.04)) children.unshift(paragraph(inline(rng, { breaks: 'none', atoms: false, empty: 0 })))
    return listItem(type, para, children, type === 'taskList' ? taskAttrs(rng) : undefined)
  })
  return list(type, items)
}

const CODE_LINES = [
  'const a = 1', '  return x', '- not a list', '# not a heading', '<div>&amp;</div>',
  '| a | b |', '> not a quote', '', '\tindented', '**not bold**', 'echo "$HOME"',
]

function genCode(rng: Rng): JNode {
  const lines = Array.from({ length: rng.int(5) }, () => rng.pick(CODE_LINES))
  // htmlToMarkdown writes code.trimEnd(): trailing blank lines / spaces of a
  // code block are not kept (whitespace only), so the generator doesn't end
  // code with them (no CODE_LINES entry ends in a space).
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  const code = lines.join('\n')
  return {
    type: 'codeBlock',
    attrs: { language: rng.pick([null, 'js', 'python', 'bash', 'sql']) },
    ...(code ? { content: [text(code)] } : {}),
  }
}

function genTable(rng: Rng): JNode {
  const cols = 2 + rng.int(2)
  const aligns = Array.from({ length: cols }, () => rng.pick([null, 'left', 'center', 'right']))
  // A markdown table always has a header row and one alignment per column;
  // cells are one line (a break inside one is written as `<br>`; at its edges
  // the serializer trims it), with no merged cells.
  const row = (cell: 'tableHeader' | 'tableCell'): JNode => ({
    type: 'tableRow',
    content: aligns.map((textAlign) => ({
      type: cell,
      attrs: { colspan: 1, rowspan: 1, colwidth: null, textAlign },
      // Enter in a cell starts a second paragraph (ambiguity() names it).
      content: Array.from({ length: rng.chance(0.03) ? 2 : 1 }, () =>
        paragraph(inline(rng, { breaks: 'inner', atoms: false, empty: 0.15 }))),
    })),
  })
  return { type: 'table', content: [row('tableHeader'), ...Array.from({ length: 1 + rng.int(2) }, () => row('tableCell'))] }
}

function genKanban(rng: Rng): JNode {
  const names = ['Todo', 'Doing', 'Done'].slice(0, 1 + rng.int(3))
  const board: KanbanBoardData = createBoard(names, rng.chance(0.6) ? names.length - 1 : null)
  for (const column of board.columns) {
    for (let i = rng.int(3); i > 0; i--) {
      column.cards.push({
        md: rng.chance(0.3) ? `**${words(rng, 2)}** ${words(rng, 2)}` : words(rng),
        checked: rng.chance(0.3),
        due: rng.chance(0.2) ? '2026-10-12' : null,
        alarm: null,
        importance: rng.chance(0.2) ? 'high' : null,
        extra: rng.chance(0.15) ? '    - sub note' : '',
      })
    }
  }
  return { type: 'kanbanBoard', attrs: { board: normalizeBoard(board) } }
}

export type BlockKind =
  | 'paragraph' | 'emptyParagraph' | 'heading' | 'hr' | 'code' | 'quote' | 'table' | 'kanban' | ListType

export function genBlock(rng: Rng, kind: BlockKind): JNode {
  switch (kind) {
    case 'paragraph': return paragraph(inline(rng, { breaks: 'any', atoms: true, empty: 0 }))
    case 'emptyParagraph': return paragraph()
    case 'heading':
      // Headings get hard breaks too (Shift+Enter works in them): ambiguity() names them.
      return { type: 'heading', attrs: { level: 1 + rng.int(3) }, content: inline(rng, { breaks: rng.chance(0.1) ? 'any' : 'none', atoms: false, empty: 0 }) }
    case 'hr': return { type: 'horizontalRule' }
    case 'code': return genCode(rng)
    case 'quote':
      return { type: 'blockquote', content: Array.from({ length: 1 + rng.int(3) }, () => paragraph(inline(rng, { breaks: 'any', atoms: true, empty: 0.2 }))) }
    case 'table': return genTable(rng)
    case 'kanban': return genKanban(rng)
    default: return genList(rng, 0, kind)
  }
}

const TOP_WEIGHTS: [BlockKind, number][] = [
  ['paragraph', 22], ['emptyParagraph', 8], ['heading', 8], ['hr', 4], ['code', 7], ['quote', 6],
  ['table', 5], ['kanban', 3], ['bulletList', 13], ['orderedList', 10], ['taskList', 14],
]

function pickWeighted(rng: Rng): BlockKind {
  const total = TOP_WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let r = rng.int(total)
  for (const [kind, w] of TOP_WEIGHTS) {
    if ((r -= w) < 0) return kind
  }
  return 'paragraph'
}

/** A random document: 1-7 top-level blocks of every kind, in any order. */
export function genDoc(rng: Rng): JNode {
  const kinds: BlockKind[] = []
  for (let i = 1 + rng.int(7); i > 0; i--) {
    const prev = kinds[kinds.length - 1]
    let kind = pickWeighted(rng)
    if (kind === prev && LIST_TYPES.includes(kind as ListType)) kind = otherKind(rng, kind as ListType)
    kinds.push(kind)
  }
  return { type: 'doc', content: kinds.map((kind) => genBlock(rng, kind)) }
}

// ── Inherent ambiguities of the markdown format ──────────────────────────────
//
// Documents that serialize to the same markdown as a DIFFERENT document, so no
// parser could give both back. They can't be fixed without changing the
// on-disk format (shared with the CLI and the mobile app), so the round-trip
// invariants skip them — by name, here, and nothing else. Every entry says what
// the document comes back as.

const isList = (n: PMNode) => n.type.name === 'bulletList' || n.type.name === 'orderedList' || n.type.name === 'taskList'
const isBreak = (n: PMNode | null | undefined) => n?.type.name === 'hardBreak'

function leadingBreaks(textblock: PMNode): number {
  let n = 0
  while (n < textblock.childCount && isBreak(textblock.child(n))) n++
  return n
}

function trailingBreaks(textblock: PMNode): number {
  let n = 0
  while (n < textblock.childCount && isBreak(textblock.child(textblock.childCount - 1 - n))) n++
  return n
}

/** The textblock written last for a block: a paragraph itself, or the deepest
 *  last item's paragraph of a list (listElToMd writes nested lists after their
 *  item's text). null for blocks that can't end in a hard break. */
function lastLine(block: PMNode): PMNode | null {
  if (block.type.name === 'paragraph') return block
  if (isList(block)) return lastLine(block.lastChild!)
  if (block.type.name === 'listItem' || block.type.name === 'taskItem') {
    return block.childCount > 1 && isList(block.lastChild!) ? lastLine(block.lastChild!) : block.firstChild
  }
  return null
}

// The starts of a block for htmlFromMarkdown: heading, list item (also the
// empty `- ` marker), quote, fence, kanban marker, horizontal rule.
const BLOCK_SYNTAX_RE = /^(?:\s*#{1,3}\s+\S|\s*(?:[-*+]|\d+\.)(?:[ \t]|$)|\s*>|```|<!--|\s*---\s*$)/
// A table separator row: it turns a line with a `|` right above it into a table.
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*\|/

/** Continuation lines (after a hard break) that read as block syntax. The
 *  first line of a textblock is safe — the parser has already read it — except
 *  a kanban marker: one left as text (an invalid board) can turn into a valid
 *  board once the lines after it are normalized (list indentation, blank
 *  lines) by a save. */
function hasLiteralSyntax(textblock: PMNode): boolean {
  const lines = textLines(textblock)
  return lines.some((line, i) => line.plain !== null && (i === 0
    ? /^<!--/.test(line.plain)
    : BLOCK_SYNTAX_RE.test(line.plain) || (TABLE_SEPARATOR_RE.test(line.plain) && /\|/.test(lines[i - 1].text))))
}

/** The lines of a textblock (hard breaks split them): their text, and — for
 *  lines that start with unmarked text, written as is — that text as written
 *  (`plain`; null when a mark or an atom writes its own syntax first). */
function textLines(textblock: PMNode): { text: string; plain: string | null }[] {
  const lines: { text: string; plain: string | null }[] = [{ text: '', plain: '' }]
  textblock.forEach((c) => {
    if (isBreak(c)) { lines.push({ text: '', plain: '' }); return }
    const line = lines[lines.length - 1]
    const t = c.isText ? c.text!.replace(/\u00a0/g, ' ') : ''
    if (line.text === '' && line.plain === '' && !(c.isText && c.marks.length === 0)) line.plain = null
    line.text += t
    if (line.plain !== null) line.plain += t
  })
  return lines
}

/** The list that holds the item lastLine() ends in. */
function lastList(list: PMNode): PMNode {
  const item = list.lastChild!
  return item.childCount > 1 && isList(item.lastChild!) ? lastList(item.lastChild!) : list
}

/** Why `doc` can't round-trip through markdown, or null if it must. */
export function ambiguity(doc: PMNode): string | null {
  let found: string | null = null
  const flag = (reason: string) => { found ??= reason }

  const visit = (node: PMNode, parent: PMNode | null) => {
    // Markdown headings are one line (`# a\nb` is a heading followed by a
    // paragraph for every markdown reader, LLM output included): a hard break
    // in a heading is written as a space, and comes back as one (the heading
    // and its text survive: tested on its own in editorRoundTrip.test.ts).
    if (node.type.name === 'heading') {
      node.forEach((c) => { if (isBreak(c)) flag('heading with a hard break') })
    }
    // Two lists of the same kind in a row are written exactly like one list
    // whose item ends in a hard break (`- a\n\n- b`); they come back as that.
    for (let i = 0; i + 1 < node.childCount; i++) {
      if (isList(node.child(i)) && node.child(i).type === node.child(i + 1).type) flag('two same-kind lists in a row')
    }
    // Two hard breaks in a row are a blank line, the paragraph separator:
    // `a<br><br>b` is written exactly like two paragraphs `a` + `b` (in a list
    // item: like the list followed by a paragraph). Table cells write breaks
    // as a literal `<br>`, so they're fine.
    const inCell = parent?.type.name === 'tableCell' || parent?.type.name === 'tableHeader'
    if (node.type.name === 'paragraph' && !inCell) {
      let run = 0
      node.forEach((c) => {
        if (isBreak(c)) run++
        else { if (run >= 2) flag('blank line (2+ breaks) inside a paragraph'); run = 0 }
      })
    }
    // A markdown list item / table cell has one paragraph: extra paragraphs are
    // written as line breaks of the first (`a\nb`, a `<br>` in a cell) and
    // come back as one paragraph with a hard break. (The text never changes.)
    if ((node.type.name === 'listItem' || node.type.name === 'taskItem') && node.childCount > 1 && node.child(1).type.name === 'paragraph') {
      flag('list item with more than one paragraph')
    }
    if (inCell && node.type.name === 'paragraph' && parent!.childCount > 1) flag('table cell with more than one paragraph')
    // An empty bullet item is `- `. Below a sibling the parser reads it as a
    // blank line (legacy "- " lines from the YAML era): it becomes a hard break
    // of the item above (and the text of a bullet item starting with a break,
    // `- ` + next lines, joins that item). The first item of a list has no item
    // above: there `- ` is an empty item and round-trips.
    if (node.type.name === 'listItem' && parent?.type.name === 'bulletList' && parent.firstChild !== node) {
      const para = node.firstChild!
      if (para.childCount === 0 || isBreak(para.firstChild)) flag('empty bullet item / bullet item starting with a break, below a sibling')
    }
    // The content of a quote is written as markdown of its own and read back
    // the same way: the rules between blocks apply inside it too.
    if (node.type.name === 'blockquote') flowAmbiguity(node, flag)
    // Text is written as is (markdown here has no escaping), so a line of text
    // that starts like a block — `# x`, `- x`, `1. x`, `> x`, a fence, a table
    // row, a kanban marker, `---` — is read back as that block wherever it
    // isn't glued to text above it (e.g. once a blank line splits a paragraph,
    // or once it's the first line of one). Typed text rarely does this; pasted
    // or hand-written markdown does.
    if ((node.type.name === 'paragraph' && !inCell) || node.type.name === 'heading') {
      if (hasLiteralSyntax(node)) flag('text line that reads as block syntax')
    }
  }
  visit(doc, null)
  doc.descendants((node, _pos, parent) => { visit(node, parent) })

  flowAmbiguity(doc, flag)

  // htmlToMarkdown trims the whole text: nothing blank survives at either end
  // (whitespace included: a leading `&nbsp;` run is plain spaces once saved).
  const n = doc.childCount
  const firstText = doc.child(0).type.name === 'paragraph' ? doc.child(0).firstChild : null
  if (firstText?.isText && /^\s/.test(firstText.text!)) flag('whitespace at the start of the document')
  let lastBlock: PMNode | null = doc.child(n - 1)
  while (lastBlock && !lastBlock.isTextblock) lastBlock = isList(lastBlock) ? lastLine(lastBlock) : lastBlock.lastChild
  if (lastBlock?.lastChild?.isText && /\s$/.test(lastBlock.lastChild.text!)) flag('whitespace at the end of the document')
  if (n > 1 || doc.child(0).childCount > 0) {
    const first = doc.child(0)
    if (first.type.name === 'paragraph' && (first.childCount === 0 || isBreak(first.firstChild))) {
      flag('empty paragraph / hard break at the start of the document')
    }
    let last = doc.child(n - 1)
    if (last.type.name === 'paragraph' && last.childCount === 0) flag('empty paragraph at the end of the document')
    const line = lastLine(last)
    if (line && trailingBreaks(line) > 0) flag('hard break at the end of the document')
    // …nor the space after an empty ordered or bullet item's marker (`1. ` →
    // `1.`, `- ` → `-`), if it's the last line (also inside a quote): it comes
    // back as text. (A task keeps working: `- [ ]`.)
    while (last.type.name === 'blockquote') last = last.lastChild!
    const lastItemLine = isList(last) ? lastLine(last) : null
    if (lastItemLine && lastItemLine.childCount === 0 && lastList(last).type.name !== 'taskList') {
      flag('empty ordered/bullet item as the last line of the document')
    }
  }

  return found
}

/** The rules between the consecutive blocks of the document or of a quote. */
function flowAmbiguity(flow: PMNode, flag: (reason: string) => void): void {
  for (let i = 0; i < flow.childCount; i++) {
    const block = flow.child(i)
    const line = lastLine(block)
    const trailing = line ? trailingBreaks(line) : 0
    // The end of a quote is like a block boundary (only the last separator is
    // dropped): two trailing breaks there are an empty paragraph too.
    if (i + 1 === flow.childCount && flow.type.name === 'blockquote' && trailing >= 2) {
      flag('two or more trailing breaks at the end of a quote')
    }
    if (i + 1 < flow.childCount) {
      const next = flow.child(i + 1)
      // Between two blocks every pair of newlines is a block separator, so two
      // trailing breaks are written exactly like an empty paragraph after it.
      if (trailing >= 2) flag('two or more trailing breaks before another block')
      // "x<br>" + "y" and "x" + "<br>y" are both `x\n\n\ny`: the break comes
      // back at the start of the paragraph below.
      if (trailing === 1 && next.type.name === 'paragraph') flag('trailing break before a paragraph')
    }
    // …and two leading breaks (incl. a paragraph that is only breaks) are
    // written exactly like an empty paragraph before it.
    if (i > 0 && block.type.name === 'paragraph' && leadingBreaks(block) >= 2) {
      flag('two or more leading breaks in a paragraph')
    }
    // Top-level items of one list: blank lines between them are their hard
    // breaks, but 3+ (two newline pairs) read as an empty paragraph between
    // two lists, the same as `a` with 2 breaks + a list of the same kind.
    // (Nested items are told apart by their indentation: no limit there.)
    if (isList(block)) {
      for (let k = 0; k + 1 < block.childCount; k++) {
        const itemLine = lastLine(block.child(k))
        if (itemLine && trailingBreaks(itemLine) >= 3) flag('list item ending in 3+ breaks before its sibling')
      }
    }
  }
}

// ── Arbitrary markdown ───────────────────────────────────────────────────────
//
// Markdown that NoteFlow didn't write: by hand, by an LLM, by another editor or
// an old build. Lines of every block syntax (also malformed: no space after the
// marker, odd indentation, unclosed fences, `1)` lists…) glued or separated by
// runs of blank lines, plus whole well-formed blocks.

const MD_LINES = [
  'alpha beta', '**bold** text', 'x ==hl== y', 'text with `code`', '[link](https://example.com)',
  '++under++ line', 'a * b', 'C++ and a == b', '![img](https://example.com/a.png)',
  '![img](https://example.com/a.png){width=50}', '[Sec](noteflow://n1/s1)', 'café ñ',
  '# Title', '## Sub **b**', '### Third', '#### four', '#nospace',
  '---', '***',
  '- item', '* star', '+ plus', '-', '- ', '1. one', '2. two', '10. ten', '1) paren',
  '- [ ] task', '- [x] done 📅2026-10-20 ⏰09:30', '- [ ]', '- [ ] ', '- [x](https://example.com)',
  '- [ ] t 🔺high', '  - nested', '    - [ ] deep', '   - three spaces', ' - one space', '\t- tab',
  '  1. nested ol', '  continued', 'lazy continuation',
  '> quote', '>', '> - q item', '> > nested', '>no space', '> ```', '> # q heading',
  '| a | b |', '| --- | --- |', '| 1 | 2 |', '|---|:-:|',
  '```', '```js', 'const x = 1', '```   ',
  '<!-- kanban -->', '<!-- kanban done="Done" -->', '- Todo', '  - [ ] card', '  - [x] card 📅2026-10-12',
  '- Done', '<!-- /kanban -->',
  '   ', ' leading space', 'trailing space ',
]

const MD_SNIPPETS = [
  '| h1 | h2 |\n| :--- | ---: |\n| a | b |\n| c<br>d | e |',
  '```py\ndef f():\n\n    return 1\n```',
  '<!-- kanban done="Done" -->\n- Todo\n  - [ ] one 📅2026-10-12 🔺high\n    - sub\n- Done\n  - [x] two\n<!-- /kanban -->',
  '- [ ] **5.9.3 (tamper).**\n\n- **B42.** texto\n\n- [ ] **5.4.3**\n  - Esperar',
  '> a\n>\n> - b\n> - [ ] c\n>\n> ```js\n> x\n> ```',
  '1. one\n2. two\n   - sub\n3. three',
]

// Lines that are only inline text, and lines that are list items.
const MD_TEXT = new Set([
  'alpha beta', '**bold** text', 'x ==hl== y', 'text with `code`', '[link](https://example.com)',
  '++under++ line', 'a * b', 'C++ and a == b', '![img](https://example.com/a.png)',
  '![img](https://example.com/a.png){width=50}', '[Sec](noteflow://n1/s1)', 'café ñ', '#nospace',
  '1) paren', '  continued', 'lazy continuation', ' leading space', 'trailing space ',
])
const isListLine = (line: string) => /^\s*(?:[-*+]|\d+\.)(?:[ \t]|$)/.test(line)

/**
 * Half the texts are messy (lines glued at random: a line of block syntax
 * glued under text becomes text, see ambiguity()); the other half are tidy:
 * a line of block syntax always starts a block (after a blank line), except a
 * list item glued to the item above.
 */
export function genMarkdown(rng: Rng): string {
  const tidy = rng.chance(0.5)
  const parts: string[] = []
  let prev = ''
  for (let i = 1 + rng.int(25); i > 0; i--) {
    const part = rng.chance(0.08) ? rng.pick(MD_SNIPPETS) : rng.pick(MD_LINES)
    const glueOk = !tidy || MD_TEXT.has(part) || (isListLine(part) && isListLine(prev.split('\n').pop()!))
    if (prev && (rng.chance(0.5) || !glueOk)) parts.push(...Array.from({ length: 1 + rng.int(4) }, () => ''))
    parts.push(part)
    prev = part
  }
  let md = parts.join('\n')
  if (rng.chance(0.1)) md = '\n'.repeat(1 + rng.int(3)) + md
  if (rng.chance(0.1)) md += '\n'.repeat(1 + rng.int(3))
  return rng.chance(0.1) ? md.replace(/\n/g, '\r\n') : md
}
