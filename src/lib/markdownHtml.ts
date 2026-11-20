// ── Markdown ↔ HTML helpers ──────────────────────────────────────────────────
//
// Shared between the TipTap editor (round-trips note content) and read-only
// renderers like the Note overview miniature preview. Kept framework-free so it
// can live in lib/ and be imported anywhere without dragging in React.
//
// Rules:
//   - Blank line (two newlines) = paragraph break  → </p><p>
//   - Single newline within a paragraph             → <br>  (HardBreak)
//   - Lists: consecutive same-type items are merged into one <ul>/<ol>; items
//     of different types (task / bullet / ordered) never share a list
//
// htmlFromMarkdown must stay the exact inverse of htmlToMarkdown for whatever
// the editor can produce (load → save → load gives back the same document),
// and stable for any other markdown. tests/lib/editorRoundTrip.test.ts checks
// both against the real editor schema; the inherent ambiguities of the format
// are listed there and in .claude/context/patterns.md.
//

import {
  KANBAN_CLOSE_RE,
  KANBAN_OPEN_RE,
  kanbanDataFromElement,
  kanbanDataToHtml,
  parseKanbanMarkdown,
  serializeKanbanMarkdown,
} from './kanban'
import {
  DRAWING_OPEN_RE,
  drawingHtmlDataFromElement,
  drawingHtmlDataToMarkdown,
  drawingToHtml,
  matchDrawingBlock,
  type DrawingBlock,
} from './drawing/drawingBlock'
import {
  escapeHtml,
  extractDeadlineAnnotations,
  flankedMarkPairs,
  inlineToHtml,
  taskAnnotationsToMd,
  type TaskImportance,
} from './markdownInline'
import {
  AUTO_COLUMN_DASHES, COLUMN_WIDTH_ATTR, COLUMN_WIDTH_MAX, COLUMN_WIDTH_VAR, widthFromAttr, widthFromDashes,
} from './tableWidth'

// Sentinel character used to protect blank lines inside code fences and kanban
// boards from the \n\n block-splitter. Must not appear in real user content.
const FENCE_BLANK = '\x00'
// A drawing block (lib/drawing/drawingBlock.ts) while the text goes through the
// block splitter: one line `<token><index>\x00`, its index in `drawingSlots`
// (isolateDrawingBlocks). The token is chosen for each parse (drawingSlotToken) so
// that no line of the text itself can pass for a slot.
const DRAWING_SLOT_STEM = '\x00drawing'

const HEADING_RE = /^(#{1,3})\s+(.+)$/
// A list block: its first non-blank line starts with a bullet or `1.` marker.
const LIST_MARKER_RE = /^\s*(?:[-*+]|\d+\.)[ \t]/

export interface MarkdownHtmlOptions {
  /**
   * Plain Markdown, for linked notes (an external .md edited in place, see
   * lib/linkedNotes.ts): NoteFlow's own syntax isn't interpreted — kanban
   * boards, drawing blocks, `++underline++`, `==highlight==`, the 📅⏰🔺 task annotations and
   * section-relation pills all stay text, so editing the file never rewrites
   * them. The editor of a linked note uses the matching plain schema
   * (editorExtensions.ts → schemaExtensions({ plain: true })).
   */
  plain?: boolean
  /**
   * Read-only previews only: maps each image src to its display URL (a linked
   * note's relative `assets/x.png`). Never for the editor — the mapped URL
   * would be saved into the Markdown.
   */
  imageSrc?: (src: string) => string
  /**
   * Read the column widths of pipe tables (the separator's dash count, see
   * lib/tableWidth.ts and mdTableToHtml) into `data-nf-colw`. Default true;
   * false where the markdown isn't a note NoteFlow saved: markdown pasted as
   * text, the AI chat (an LLM's output). Always off with `plain` (an external
   * file: its separators are written back as `---`).
   */
  columnWidths?: boolean
}

// Options of the htmlFromMarkdown call in progress (module state like quoteDepth:
// the parse is synchronous and the helpers below are many).
let currentOptions: MarkdownHtmlOptions = {}
const plainMode = () => !!currentOptions.plain
const columnWidthsMode = () => !currentOptions.plain && currentOptions.columnWidths !== false
const inline = (s: string) => inlineToHtml(s, currentOptions)

export function htmlFromMarkdown(md: string, opts?: MarkdownHtmlOptions): string {
  if (!md.trim()) return '<p></p>'
  if (!opts?.plain && !opts?.imageSrc && opts?.columnWidths !== false) return markdownBlocksToHtml(md)
  const previous = currentOptions
  currentOptions = opts
  try {
    return markdownBlocksToHtml(md)
  } finally {
    currentOptions = previous
  }
}

/** htmlFromMarkdown, also for the content of a blockquote (mdBlockquoteToHtml). */
function markdownBlocksToHtml(md: string): string {
  // Normalise line endings
  const src = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // NoteFlow's own blocks are only read at the top level of a note (not in a
  // quote, not in plain mode).
  const ownBlocks = quoteDepth === 0 && !plainMode()
  const outerSlots = drawingSlots
  const outerToken = drawingSlotToken
  if (ownBlocks) {
    drawingSlots = []
    // `\x00drawing:` unless the text holds that very sequence (it can't be typed, but a
    // file can carry anything): then the first `\x00drawing<n>:` it doesn't hold.
    let token = `${DRAWING_SLOT_STEM}:`
    for (let n = 1; src.includes(token); n++) token = `${DRAWING_SLOT_STEM}${n}:`
    drawingSlotToken = token
  }
  try {
    // Drawing blocks go first: each one owns a code fence, so it must be taken
    // out (as a one-line slot) before the fence pass splits it in three.
    const drawn = ownBlocks ? isolateDrawingBlocks(src) : src

    // Isolate closed code fences as their own blocks and protect the blank lines
    // inside them before splitting on \n\n (see isolateCodeFences). Kanban boards
    // go last: their pass needs to know which lines are code (a marker inside a
    // code block is code), and that is only settled once fences are isolated.
    const fenced = isolateCodeFences(drawn)
    const protectedSrc = ownBlocks ? isolateKanbanBlocks(fenced) : fenced

    // Split into "blocks" on blank lines — use exactly \n\n so that multiple
    // consecutive blank lines produce empty blocks, preserving them as <p></p>.
    const blocks = groupBlocks(protectedSrc.split(/\n\n/))

    return blocks.map(blockToHtml).join('') || '<p></p>'
  } finally {
    drawingSlots = outerSlots
    drawingSlotToken = outerToken
  }
}

// The drawing blocks of the top-level parse in progress, by slot index (module
// state like quoteDepth: the parse is synchronous).
let drawingSlots: DrawingBlock[] = []
let drawingSlotToken = `${DRAWING_SLOT_STEM}:`
const drawingSlotLine = (index: number) => `${drawingSlotToken}${index}\x00`

// > 0 while parsing the content of a blockquote: no kanban boards there (the
// schema keeps them at the top level, so a board in a quote would be moved out
// of it); its markers stay quoted text, as they always were.
let quoteDepth = 0

type BlockKind = 'code' | 'drawing' | 'heading' | 'hr' | 'kanban' | 'list' | 'quote' | 'table' | 'paragraph'

/**
 * What a \n\n block renders as. Order matters: drawing slot → code fence →
 * heading → HR → kanban → list → blockquote → table → paragraph (a `>` prefix
 * can't be confused with list markers; a block that starts with the kanban marker
 * but isn't a valid board falls through to the other kinds, as it always has).
 */
function blockKind(lines: string[]): BlockKind {
  // (A text ending in a newline leaves an empty line after the last block's slot.)
  if (drawingSlotOf(lines[0]) && lines.every((l, i) => i === 0 || l === '')) return 'drawing'
  if (/^```/.test(lines[0])) return 'code'
  if (lines.length === 1 && HEADING_RE.test(lines[0])) return 'heading'
  if (lines.length === 1 && lines[0].trim() === '---') return 'hr'
  if (quoteDepth === 0 && !plainMode() && KANBAN_OPEN_RE.test(lines[0]) && parseKanbanMarkdown(unprotectKanban(lines))) return 'kanban'
  const first = lines.find(l => l.trim())
  if (first && LIST_MARKER_RE.test(first)) return 'list'
  if (first && /^\s*>\s?/.test(first)) return 'quote'
  // Strict detection (isTableStart): line 1 must contain a |, line 2 must be
  // a separator row. This avoids reinterpreting paragraphs that contain
  // literal | characters.
  if (lines.length >= 2 && isTableStart(lines[0], lines[1])) return 'table'
  return 'paragraph'
}

function unprotectKanban(lines: string[]): string {
  return lines.map(l => (l === FENCE_BLANK ? '' : l)).join('\n')
}

/** The drawing a slot line stands for (isolateDrawingBlocks), if it is one. */
function drawingSlotOf(line: string): DrawingBlock | undefined {
  if (!line.startsWith(drawingSlotToken) || !line.endsWith('\x00')) return undefined
  const index = line.slice(drawingSlotToken.length, -1)
  return /^\d+$/.test(index) ? drawingSlots[Number(index)] : undefined
}

/**
 * A value as the content of a double-quoted HTML attribute: `&`, `<`, `>` and
 * `"` escaped, so nothing the note's author (or an agent's report) writes can
 * close the attribute and inject markup — this HTML is rendered with innerHTML
 * (previews, kanban cards, the chat, the agent report). getAttribute() /
 * className decode it back, so the round-trip to markdown is unchanged.
 */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

function blockToHtml(block: string): string {
  const lines = block.split('\n')
  switch (blockKind(lines)) {
    // Drawing block (taken out by isolateDrawingBlocks; see drawing/drawingBlock.ts).
    case 'drawing':
      return drawingToHtml(drawingSlotOf(lines[0])!)
    case 'code': {
      const lang = lines[0].slice(3).trim()
      // Trailing blank lines go, as htmlToMarkdown drops them (code.trimEnd()):
      // the protected ones too, so they can't come and go between saves.
      const code = lines.slice(1).join('\n').replace(/```\s*$/, '')
        .replace(new RegExp(FENCE_BLANK, 'g'), '').trimEnd()
      // The info string is the author's text: escaped, it can't leave the attribute.
      return `<pre><code class="language-${escapeAttr(lang)}">${escapeHtml(code)}</code></pre>`
    }
    case 'hr':
      return '<hr>'
    // Kanban board (isolated by isolateKanbanBlocks; see kanban.ts).
    case 'kanban':
      return kanbanDataToHtml(parseKanbanMarkdown(unprotectKanban(lines))!)
    // List block (supports nested/indented items).
    case 'list':
      return mdListBlockToHtml(lines)
    case 'quote':
      return mdBlockquoteToHtml(lines)
    case 'table':
      return mdTableToHtml(lines)
    // A one-line heading, or a paragraph (may span multiple lines — a single \n
    // becomes <br>) that may contain heading lines.
    default:
      return mdParagraphBlockToHtml(lines)
  }
}

/**
 * Lines of a paragraph block (soft breaks as <br>). Markdown written by hand or
 * by an LLM often glues a heading to the text above or below it ("## Title\n-
 * item"): a heading line ends the paragraph, and the lines after it are a
 * block of their own — a list, a table, more text… —, which is exactly how
 * they are read back once saved (htmlToMarkdown separates the heading).
 */
function mdParagraphBlockToHtml(lines: string[]): string {
  const h = lines.findIndex(l => HEADING_RE.test(l))
  if (h === -1) return `<p>${lines.map(inline).join('<br>')}</p>`
  const [, hashes, title] = lines[h].match(HEADING_RE)!
  // The lines above are a block of their own too (a lone `---` is an HR).
  const before = h > 0 ? blockToHtml(lines.slice(0, h).join('\n')) : ''
  const after = h + 1 < lines.length ? blockToHtml(lines.slice(h + 1).join('\n')) : ''
  return `${before}<h${hashes.length}>${inline(title)}</h${hashes.length}>${after}`
}

/** A block being regrouped by groupBlocks. */
interface GroupedBlock {
  text: string
  kind: BlockKind
  /** List blocks: depth and kind of their last top-level item (see listTail). */
  tail?: ListTail | null
}

interface ListTail { depth: number; type: MdListItem['type'] }

/**
 * The last top-level item after `lines`, starting from `tail`. parseMdListItems
 * pops its stack down to an item's depth, so an item is top-level exactly when
 * its depth is ≤ the current top-level item's (the bottom of the stack).
 */
function listTail(tail: ListTail | null, lines: string[]): ListTail | null {
  for (const line of lines) {
    const item = parseListLine(line)
    // An empty marker at the top level is a bullet item unless it's below a
    // bullet sibling (emptyMarkerIsItem); deeper, it's nested, not top-level.
    const type = item?.type ?? (item && (!tail || tail.type !== 'ul') ? 'ul' : null)
    if (item && type && (!tail || item.depth <= tail.depth)) tail = { depth: item.depth, type }
  }
  return tail
}

/**
 * Regroup the raw \n\n blocks into the blocks to render. htmlToMarkdown ends
 * every block with exactly '\n\n', and a textblock that ends in hard breaks
 * writes one extra '\n' per break before that separator; so between two
 * blocks there are 2 + (trailing breaks) newlines, and the splitter leaves
 * an odd one at the start of the next raw block ("\nnext").
 *
 *  - List blocks: blank lines inside a list are hard breaks at the end of the
 *    item above them (listElToMd never writes a blank line between items
 *    otherwise), so a list block absorbs the next raw block when that one
 *    continues it: a nested item (deeper than the list's top-level items),
 *    after any number of blank lines; or a top-level item of the SAME kind
 *    right after a blank line (two same-kind lists in a row read as one list
 *    whose item ends in a break — the format can't tell them apart). A
 *    top-level item of a DIFFERENT kind (task / bullet / ordered) can't be a
 *    sibling in the editor, so it starts a new list, and the one blank line
 *    before it is the block separator.
 *  - The odd '\n' at the start of a raw block is a hard break. Before a
 *    paragraph it stays there (a leading <br>: "x<br>" + "y" and "x" + "<br>y"
 *    are written the same, and this is how it has always been read). Before any
 *    other block (heading, list, fence, table, quote, HR, board) — which can't
 *    start with a break — it belongs to the end of the block above
 *    (attachTrailingBreak), so "x<br>" + "# Title" comes back as written.
 */
function groupBlocks(rawBlocks: string[]): string[] {
  const blocks: GroupedBlock[] = []
  for (const raw of rawBlocks) {
    let lines = raw.split('\n')
    let kind = blockKind(lines)
    if (kind === 'list' && continueList(blocks, raw, lines)) continue
    if (lines.length > 1 && lines[0] === '') {
      const rest = lines.slice(1)
      const restKind = blockKind(rest)
      if (restKind !== 'paragraph' || HEADING_RE.test(rest[0])) {
        attachTrailingBreak(blocks)
        lines = rest
        kind = restKind
      }
    }
    blocks.push({ text: lines.join('\n'), kind, tail: kind === 'list' ? listTail(null, lines) : undefined })
  }
  return blocks.map(b => b.text)
}

/**
 * Append the list block `raw` to the list block before it (only empty blocks
 * in between) if it continues that list — see groupBlocks. Restores the exact
 * source text, so its blank lines become hard breaks in parseMdListItems.
 */
function continueList(blocks: GroupedBlock[], raw: string, lines: string[]): boolean {
  let j = blocks.length - 1
  while (j >= 0 && blocks[j].text === '') j--
  const list = blocks[j]
  if (!list || list.kind !== 'list') return false
  const emptyBlocks = blocks.length - 1 - j
  const first = parseListLine(lines.find(l => l.trim()) ?? '')
  // An empty `- ` marker is a bullet here: continuing a bullet list it's a
  // blank line below a sibling, else it starts a list (emptyMarkerIsItem).
  const type = first ? first.type ?? 'ul' : null
  let continues: boolean
  if (!first || !type || !list.tail) {
    continues = emptyBlocks === 0
  } else if (first.depth > list.tail.depth) {
    continues = true
  } else {
    continues = emptyBlocks === 0 && type === list.tail.type
  }
  if (!continues) return false
  blocks.splice(j + 1)
  list.text += '\n\n'.repeat(emptyBlocks + 1) + raw
  list.tail = listTail(list.tail ?? null, lines)
  return true
}

/**
 * Give the block above a trailing hard break (see groupBlocks): a paragraph —
 * empty or not — or the last item of a list. Blocks that can't end in a break
 * (heading, HR, fence, table, quote, board) and the start of the text drop it.
 */
function attachTrailingBreak(blocks: GroupedBlock[]): void {
  const last = blocks[blocks.length - 1]
  if (!last) return
  const lastLine = last.text.slice(last.text.lastIndexOf('\n') + 1)
  if (last.kind === 'list' || (last.kind === 'paragraph' && !HEADING_RE.test(lastLine))) last.text += '\n'
}

// A fence opens on any column-0 line starting with ``` and closes on the next
// column-0 line that is only ``` (plus trailing spaces) — the same rule the
// code-block branch of htmlFromMarkdown applies to a block's first line.
const FENCE_OPEN_RE = /^```/
const FENCE_CLOSE_RE = /^```[ \t]*$/

/**
 * Pre-pass for htmlFromMarkdown's \n\n block splitter. Fences are paired left
 * to right, each opener with the first closer after it (lines inside a pair are
 * content, not openers; an opener with no closer pairs with nothing; bare ```
 * lines right after a closer that end at a blank line are part of its closing
 * run, not openers). Then, for every pair:
 *   - empty lines inside it become FENCE_BLANK, so the splitter can't tear the
 *     code block apart;
 *   - a block boundary is ensured before the opening line, so a fence glued to
 *     a paragraph or list item is still its own block instead of text;
 *   - the code block runs, as it always has, to the end of its \n\n block — but
 *     if non-fence content is glued after the block's LAST closing line, a
 *     boundary is added there so that content isn't swallowed into the code.
 *
 * Running to the last closer (not the first) keeps nested fences intact:
 * blockElToMd always writes a 3-backtick fence, so a code block whose content
 * has its own ``` lines serializes as "```\n```js\nfoo\n```\n```". Separators
 * are only added where the right one is missing, so markdown whose fence blocks
 * already start a block and end on their closing line (all htmlToMarkdown
 * output) renders exactly as before, with no spurious empty paragraphs.
 * Unpaired (unclosed) fences are left untouched.
 */
function isolateCodeFences(src: string): string {
  const lines = src.split('\n')
  const { closerOf, inPair } = pairFences(lines)

  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const close = closerOf.get(i)
    if (close === undefined) {
      out.push(lines[i])
      continue
    }

    ensureBlockStart(out)
    const { end, last } = fenceBlockEnd(lines, close, inPair)

    out.push(lines[i])
    // Every empty line up to `last` is inside a pair (else the block would end there).
    for (let k = i + 1; k < last; k++) out.push(lines[k] === '' ? FENCE_BLANK : lines[k])
    out.push(lines[last])

    // Content glued after the closing line starts a new block.
    if (last < end) out.push('')
    i = last
  }

  return out.join('\n')
}

/**
 * Pair fence openers with closers (see isolateCodeFences): opener line → closer
 * line, and `inPair`, the lines strictly inside a pair.
 */
function pairFences(lines: string[]): { closerOf: Map<number, number>; inPair: boolean[] } {
  const closerOf = new Map<number, number>()
  const inPair: boolean[] = new Array(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (!FENCE_OPEN_RE.test(lines[i])) continue
    let close = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (FENCE_CLOSE_RE.test(lines[j])) { close = j; break }
    }
    // No closer for this opener means no later line can close a fence either.
    if (close === -1) break
    closerOf.set(i, close)
    for (let k = i + 1; k < close; k++) inPair[k] = true

    // Closing run: bare ``` lines right after the closer that end at a blank
    // line (or the end of the text) close the same code block — that is how a
    // block whose content ends in its own ``` line is written ("…\n```\n```").
    // They must not open a new pair, or the last one would pair with the next
    // fence anywhere later in the text, across blank lines, and merge
    // everything in between into one code block. When the run is followed by
    // content instead, the code block continues past it, so it pairs as usual.
    let runEnd = close
    while (runEnd + 1 < lines.length && FENCE_CLOSE_RE.test(lines[runEnd + 1])) runEnd++
    i = runEnd + 1 === lines.length || lines[runEnd + 1] === '' ? runEnd : close
  }
  return { closerOf, inPair }
}

/**
 * Where the code block of a fence pair ends: its \n\n block ends (`end`) right
 * before the first empty line outside any pair; the code ends on the `last`
 * closing line within that block.
 */
function fenceBlockEnd(lines: string[], close: number, inPair: boolean[]): { end: number; last: number } {
  let end = close
  while (end + 1 < lines.length && (lines[end + 1] !== '' || inPair[end + 1])) end++
  let last = close
  for (let k = close + 1; k <= end; k++) {
    if (FENCE_CLOSE_RE.test(lines[k])) last = k
  }
  return { end, last }
}

/**
 * First pre-pass of htmlFromMarkdown, on the raw text: replaces each drawing
 * block (drawing/drawingBlock.ts: marker, one code fence, marker) by a one-line
 * slot that the passes below carry as an opaque block, and keeps the parsed
 * block in `drawingSlots`. It runs before isolateCodeFences because a drawing
 * owns its fence — that pass would split the region into comment / code / comment.
 *
 * An opening marker counts only outside code: not on a line that a code block
 * of the text as it stands would hold — the pairing and extent isolateCodeFences
 * applies, plus the block of a fence that is never closed, which renders as code
 * to its end (a drawing's own fence starts after its marker, so it never hides it). The region must parse as a drawing (matchDrawingBlock) —
 * otherwise nothing is touched and it renders exactly as before: the markers as
 * text and the fence as an ordinary code block. Like boards, a block boundary is
 * ensured on both sides, and a drawing with a line starting with ``` glued right
 * after its closing marker is left as text (splitting that line off would turn
 * an unpaired fence into a code block).
 *
 * One drawing per round: taking a drawing out can change how the fences after it
 * pair (its fence may be longer than three backticks, which the fence pass
 * doesn't pair), so the code lines are settled again before looking for the next.
 */
function isolateDrawingBlocks(src: string): string {
  if (!/^<!--[ \t]*drawing/m.test(src)) return src
  let lines = src.split('\n')
  for (let from = 0; from < lines.length;) {
    const { closerOf, inPair } = pairFences(lines)
    const inCode: boolean[] = new Array(lines.length).fill(false)
    for (const [open, close] of closerOf) {
      const { last } = fenceBlockEnd(lines, close, inPair)
      for (let k = open; k <= last; k++) inCode[k] = true
    }
    // An opener with no closer is code as well when it starts a block: blockKind reads
    // the whole \n\n block as a code block (the rule of codeBlockLines).
    for (let i = 0; i < lines.length; i++) {
      if (inCode[i] || !FENCE_OPEN_RE.test(lines[i]) || (i > 0 && lines[i - 1] !== '')) continue
      for (let k = i; k < lines.length && lines[k] !== ''; k++) inCode[k] = true
    }

    let found = false
    for (let i = from; i < lines.length; i++) {
      if (inCode[i] || !DRAWING_OPEN_RE.test(lines[i])) continue
      const match = matchDrawingBlock(lines, i)
      if (!match) continue
      const after = lines[match.end + 1]
      const out = lines.slice(0, i)
      ensureBlockStart(out)
      out.push(drawingSlotLine(drawingSlots.length))
      // Content glued after the closing marker starts a new block.
      if (after !== undefined && after !== '') out.push('')
      const next = out.concat(lines.slice(match.end + 1))
      // (A fence glued there that is paired once the drawing is out is fine: the
      // fence pass gives it its own block anyway.)
      if (after !== undefined && FENCE_OPEN_RE.test(after) && !pairFences(next).closerOf.has(out.length)) continue

      drawingSlots.push(match.block)
      from = out.length
      lines = next
      found = true
      break
    }
    if (!found) break
  }
  return lines.join('\n')
}

/**
 * Make the next line pushed onto `out` start a \n\n block: add an empty line
 * when it would be glued to the line above. After one or more blank lines it
 * already does: the splitter consumes newlines in pairs from the left, so an
 * odd run leaves one '\n' at the start of the raw block, which groupBlocks
 * hands to the block above as a trailing hard break ("x<br>" + a fence is
 * written `x\n\n\n```…`). Adding a line there instead would read back as an
 * empty paragraph and lose the break.
 */
function ensureBlockStart(out: string[]): void {
  if (out.length > 0 && out[out.length - 1] !== '') out.push('')
}

/**
 * Which lines of isolateCodeFences' output end up inside a code block: a line
 * starting with ``` at the start of the text or after a blank line (see
 * ensureBlockStart), running to the next empty line — exactly what
 * htmlFromMarkdown renders as code. Blank lines inside paired fences are
 * FENCE_BLANK by now, not empty.
 */
function codeBlockLines(lines: string[]): boolean[] {
  const inCode: boolean[] = new Array(lines.length).fill(false)
  let emptyRun = 0
  let seenContent = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') { emptyRun++; continue }
    const startsBlock = !seenContent || emptyRun > 0
    emptyRun = 0
    seenContent = true
    if (startsBlock && FENCE_OPEN_RE.test(lines[i])) {
      while (i < lines.length && lines[i] !== '') inCode[i++] = true
      i--
    }
  }
  return inCode
}

/**
 * Second pre-pass for htmlFromMarkdown's \n\n block splitter, run on the
 * output of isolateCodeFences: turns each kanban board (kanban.ts) into exactly
 * one block. Openers are paired left to right with the first closer after
 * them; openers inside a code block are code and ignored. A pair becomes a
 * board only if its text parses as one (parseKanbanMarkdown) — otherwise the
 * opener is skipped and the scan goes on from the next line, so malformed or
 * unclosed boards render exactly as before (the markers as literal text). For
 * every board:
 *   - a block boundary is ensured before the opening marker and after the
 *     closing one, adding an empty line only where it's missing (htmlToMarkdown
 *     output already has them, so it renders with no spurious empty paragraphs);
 *   - empty lines inside become FENCE_BLANK, so the splitter can't tear the
 *     board apart (the board branch turns them back into blank lines).
 * A line starting with ``` glued right after the closer would become a code
 * block once split off (such a fence is unpaired: paired ones were already
 * isolated); that board is left as text rather than reinterpret the line.
 */
function isolateKanbanBlocks(src: string): string {
  if (!/^<!--/m.test(src)) return src
  const lines = src.split('\n')
  const inCode = codeBlockLines(lines)

  const closerOf = new Map<number, number>()
  for (let i = 0; i < lines.length; i++) {
    if (inCode[i] || !KANBAN_OPEN_RE.test(lines[i])) continue
    let close = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (KANBAN_CLOSE_RE.test(lines[j])) { close = j; break }
    }
    // No closer for this opener means no later opener has one either.
    if (close === -1) break
    if (close + 1 < lines.length && FENCE_OPEN_RE.test(lines[close + 1])) continue
    // A code block in between makes the region invalid (its ``` line isn't board syntax).
    if (!parseKanbanMarkdown(lines.slice(i, close + 1).join('\n'))) continue
    closerOf.set(i, close)
    i = close
  }
  if (closerOf.size === 0) return src

  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const close = closerOf.get(i)
    if (close === undefined) {
      out.push(lines[i])
      continue
    }
    ensureBlockStart(out)
    for (let k = i; k <= close; k++) out.push(lines[k] === '' ? FENCE_BLANK : lines[k])
    // Content glued after the closing marker starts a new block.
    if (close + 1 < lines.length && lines[close + 1] !== '') out.push('')
    i = close
  }
  return out.join('\n')
}

// ── htmlToMarkdown: DOM-based walker to preserve nested list structure ────────

export function htmlToMarkdown(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  let result = ''
  for (const child of doc.body.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      result += blockElToMd(child as Element)
    }
  }
  return result.trim()
}

function blockElToMd(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'p') return inlineElToMd(el) + '\n\n'
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    // An empty heading (Enter at its start) has no markdown: `### ` alone would
    // come back as the literal text "###". It's written as an empty paragraph.
    const text = headingElToMd(el)
    return text ? `${'#'.repeat(Number(tag[1]))} ${text}\n\n` : '\n\n'
  }
  if (tag === 'hr') return `---\n\n`
  if (tag === 'pre') {
    const codeEl = el.querySelector('code')
    const lang = (codeEl?.className ?? '').replace('language-', '')
    const code = codeEl?.textContent ?? ''
    return `\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n\n`
  }
  // `tableElToMd()` already appends the trailing '\n\n' block separator — do not add another
  // one here or every save/reopen round-trip would inject an extra blank line after the table.
  if (tag === 'table') return tableElToMd(el)
  if (tag === 'blockquote') {
    // Convert each child block to markdown, then prefix every line with `> `
    // (blank lines between paragraphs become a bare `>`). Only the last block's
    // separator is dropped: hard breaks / empty paragraphs at the end of the
    // quote are part of it (mdBlockquoteToHtml parses the content back as is).
    let inner = ''
    for (const c of el.childNodes) {
      if (c.nodeType === Node.ELEMENT_NODE) inner += blockElToMd(c as Element)
    }
    const quoted = (inner.endsWith('\n\n') ? inner.slice(0, -2) : inner)
      .split('\n')
      .map(line => (line ? `> ${line}` : '>'))
      .join('\n')
    return `${quoted}\n\n`
  }
  if (tag === 'ul' || tag === 'ol') return listElToMd(el, 0) + '\n'
  // Kanban board: rebuilt from its data-* attributes (kanban.ts), never from the
  // rendered children — so it must not reach the generic descent below.
  // serializeKanbanMarkdown ends on the closing marker; add the block separator.
  if (tag === 'div' && el.getAttribute('data-type') === 'kanban') {
    return serializeKanbanMarkdown(kanbanDataFromElement(el)) + '\n\n'
  }
  // Drawing block: likewise rebuilt from its data-* attributes (drawingBlock.ts);
  // its children are only a fallback rendering.
  if (tag === 'div' && el.getAttribute('data-type') === 'drawing') {
    return drawingHtmlDataToMarkdown(drawingHtmlDataFromElement(el)) + '\n\n'
  }
  let out = ''
  for (const c of el.childNodes) {
    if (c.nodeType === Node.ELEMENT_NODE) out += blockElToMd(c as Element)
  }
  return out
}

/**
 * A markdown heading is one line: a hard break inside one (Shift+Enter in a
 * heading, pasted HTML) is written as a space — leading/trailing ones dropped,
 * runs collapsed. Written as is, `### \nTitle` came back as a paragraph with a
 * literal `###` and the title on the next line.
 */
function headingElToMd(el: Element): string {
  const md = inlineElToMd(el)
  return md.includes('\n') ? md.replace(/\s*\n\s*/g, ' ').trim() : md
}

// Underline (`++`) and highlight (`==`) delimiters are collected as tokens and
// only written out once the whole line is known (resolveFlankedMarks): whether
// inlineToHtml reads them back as a mark depends on what surrounds them. Spans
// inlineToHtml holds aside from its mark regexes (code, images, link syntax)
// are `held` tokens.
interface FlankedMark { char: '+' | '='; keep: boolean }
type InlineToken = string | { held: string } | { mark: FlankedMark; open: boolean }

function inlineElToMd(el: Element): string {
  return resolveFlankedMarks(inlineElTokens(el, []))
}

function inlineElTokens(el: Element, out: InlineToken[]): InlineToken[] {
  const wrapped = (c: Element, delim: string) => {
    out.push(delim)
    inlineElTokens(c, out)
    out.push(delim)
  }
  const flanked = (c: Element, char: FlankedMark['char']) => {
    const mark: FlankedMark = { char, keep: true }
    out.push({ mark, open: true })
    inlineElTokens(c, out)
    out.push({ mark, open: false })
  }
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      // &nbsp; in HTML becomes \u00A0 in textContent — restore to regular space
      out.push((child.textContent ?? '').replace(/\u00A0/g, ' '))
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      if (tag === 'strong' || tag === 'b') wrapped(c, '**')
      else if (tag === 'em' || tag === 'i') wrapped(c, '*')
      else if (tag === 's') wrapped(c, '~~')
      else if (tag === 'u') flanked(c, '+')
      else if (tag === 'mark') flanked(c, '=')
      else if (tag === 'code') out.push({ held: `\`${(c.textContent ?? '').replace(/\u00A0/g, ' ')}\`` })
      else if (tag === 'br') out.push('\n')
      else if (tag === 'img') {
        const w = c.getAttribute('width')
        const suffix = w ? `{width=${w}}` : ''
        out.push({ held: `![${c.getAttribute('alt') ?? ''}](${c.getAttribute('src') ?? ''})${suffix}` })
      }
      else if (tag === 'span' && c.getAttribute('data-type') === 'section-relation') {
        const relNoteId = c.getAttribute('data-note-id') ?? ''
        const relSectionId = c.getAttribute('data-section-id') ?? ''
        const relName = (c.textContent ?? '').replace(/\u00A0/g, ' ')
        out.push({ held: '[' }, relName, { held: `](noteflow://${relNoteId}/${relSectionId})` })
      }
      else if (tag === 'a') {
        out.push({ held: '[' })
        inlineElTokens(c, out)
        out.push({ held: `](${c.getAttribute('href') ?? ''})` })
      }
      else inlineElTokens(c, out)
    }
  }
  return out
}

/**
 * Write the `++`/`==` delimiters so that inlineToHtml reads the same marks back:
 *   - a mark spanning a line break is closed before it and reopened after it
 *     (markdown is parsed line by line);
 *   - whitespace at the inner edges moves outside the delimiters (`<u>word </u>`
 *     → `++word++ `): an opener followed by a space never opens;
 *   - a mark that still wouldn't read back exactly — inside a word
 *     (`foo<u>bar</u>`, which has no markdown), or paired differently because of
 *     a literal `++` next to it (`<u>a++ b</u>`) — is written without its
 *     delimiters: the underline/highlight is lost, the text never changes.
 * Literal `++`/`==` in text is written as is: the flanking rules already keep
 * its usual uses ("C++", "C++/C++", "a == b") from reading back as marks.
 */
function resolveFlankedMarks(input: InlineToken[]): string {
  const textOf = (t: InlineToken) => (typeof t === 'string' ? t : 'held' in t ? t.held : '')
  if (input.every((t) => typeof t === 'string' || 'held' in t)) return input.map(textOf).join('')

  // 1. Split marks at line breaks.
  let tokens: InlineToken[] = []
  const openMarks: FlankedMark[] = []
  for (const t of input) {
    if (typeof t !== 'string' && 'mark' in t) {
      if (t.open) {
        openMarks.push(t.mark)
        tokens.push(t)
      } else {
        // Marks nest properly (they come from the DOM tree): this closes the innermost.
        tokens.push({ mark: openMarks.pop() ?? t.mark, open: false })
      }
      continue
    }
    if (typeof t !== 'string' || openMarks.length === 0 || !t.includes('\n')) { tokens.push(t); continue }
    t.split('\n').forEach((part, i) => {
      if (i > 0) {
        for (let k = openMarks.length - 1; k >= 0; k--) tokens.push({ mark: openMarks[k], open: false })
        tokens.push('\n')
        for (let k = 0; k < openMarks.length; k++) {
          openMarks[k] = { char: openMarks[k].char, keep: true }
          tokens.push({ mark: openMarks[k], open: true })
        }
      }
      tokens.push(part)
    })
  }

  // 2. Move edge whitespace out of every mark. Repeated until stable: nested
  //    marks hand it outwards one level per pass.
  const compact = (list: InlineToken[]): InlineToken[] => {
    const res: InlineToken[] = []
    for (const t of list) {
      if (t === '') continue
      const last = res[res.length - 1]
      if (typeof t === 'string' && typeof last === 'string') res[res.length - 1] = last + t
      else res.push(t)
    }
    return res
  }
  for (let moved = true; moved;) {
    moved = false
    tokens = compact(tokens)
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (typeof t === 'string' || !('mark' in t)) continue
      const side = t.open ? i + 1 : i - 1
      const text = tokens[side]
      if (typeof text !== 'string') continue
      const ws = (t.open ? text.match(/^\s+/) : text.match(/\s+$/))?.[0]
      if (!ws) continue
      tokens[side] = t.open ? text.slice(ws.length) : text.slice(0, -ws.length)
      tokens.splice(t.open ? i : i + 1, 0, ws)
      moved = true
      i++
    }
  }

  // 3. Read the line back the way inlineToHtml would (held spans masked with a
  //    neutral character) and drop the first mark that doesn't come back as
  //    written; dropping one changes what its neighbours touch, so repeat.
  const marks = tokens.filter((t): t is { mark: FlankedMark; open: boolean } => typeof t !== 'string' && 'mark' in t)
  for (let changed = true; changed;) {
    changed = false
    let md = ''
    const at = new Map<FlankedMark, { open: number; close: number }>()
    for (const t of tokens) {
      if (typeof t === 'string') md += t
      else if ('held' in t) md += '\uE000'.repeat(t.held.length)
      else if (t.mark.keep) {
        const pos = at.get(t.mark) ?? { open: -1, close: -1 }
        pos[t.open ? 'open' : 'close'] = md.length
        at.set(t.mark, pos)
        md += t.mark.char + t.mark.char
      }
    }
    const readBack = new Set(
      (['+', '='] as const).flatMap((c) => flankedMarkPairs(md, c).map(([o, k]) => `${c}${o}:${k}`)))
    for (const { mark, open } of marks) {
      if (!open || !mark.keep) continue
      const pos = at.get(mark)
      if (pos && readBack.has(`${mark.char}${pos.open}:${pos.close}`)) continue
      mark.keep = false
      changed = true
      break
    }
  }

  return tokens
    .map((t) => (typeof t === 'string' || 'held' in t ? textOf(t) : t.mark.keep ? t.mark.char + t.mark.char : ''))
    .join('')
}

function listElToMd(listEl: Element, depth: number): string {
  const prefix = '  '.repeat(depth)
  const isTaskList = listEl.getAttribute('data-type') === 'taskList'
  const isOl = listEl.tagName.toLowerCase() === 'ol'
  let result = ''
  let olIndex = 1

  for (const li of listEl.children) {
    const isTaskItem = li.getAttribute('data-type') === 'taskItem'
    let text = ''
    const nestedListEls: Element[] = []

    for (const child of li.childNodes) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      if (tag === 'p') {
        if (text) text += '\n'
        text += inlineElToMd(c)
      } else if (tag === 'div') {
        // TipTap may wrap task item content in a <div>
        for (const gc of c.childNodes) {
          if (gc.nodeType !== Node.ELEMENT_NODE) continue
          const gcEl = gc as Element
          const gcTag = gcEl.tagName.toLowerCase()
          if (gcTag === 'p') { if (text) text += '\n'; text += inlineElToMd(gcEl) }
          else if (gcTag === 'ul' || gcTag === 'ol') nestedListEls.push(gcEl)
        }
      } else if (tag === 'ul' || tag === 'ol') {
        nestedListEls.push(c)
      }
      // <label> and <input> are intentionally skipped
    }

    if (isTaskItem || isTaskList) {
      const checked   = li.getAttribute('data-checked') === 'true'
      // The agent-task marker (data-agent-id / data-agent-state) is written last.
      const ann       = taskAnnotationsToMd(
        li.getAttribute('data-due'), li.getAttribute('data-alarm'), li.getAttribute('data-importance'),
        li.getAttribute('data-agent-id'), li.getAttribute('data-agent-state'))
      // Annotations belong to the task, not to a specific physical line. For
      // multi-line tasks (soft breaks) keep them on the first line so the parser
      // — which only reads annotations off the `- [ ]` line — round-trips them.
      const nl        = text.indexOf('\n')
      const body      = nl === -1 ? `${text}${ann}` : `${text.slice(0, nl)}${ann}${text.slice(nl)}`
      result += `${prefix}- [${checked ? 'x' : ' '}] ${body}\n`
    } else if (isOl) {
      result += `${prefix}${olIndex++}. ${text}\n`
    } else {
      result += `${prefix}- ${text}\n`
    }

    for (const nested of nestedListEls) {
      result += listElToMd(nested, depth + 1)
    }
  }

  return result
}

// ── Nested markdown list parsing (htmlFromMarkdown helpers) ──────────────────

interface MdListItem {
  type: 'ul' | 'ol' | 'task'
  checked: boolean
  text: string
  due: string | null
  alarm: string | null
  importance: TaskImportance | null
  /** Agent-task marker (🤖<id>:<state>) of a task: both set, or both null. */
  agentId: string | null
  agentState: string | null
  children: MdListItem[]
}

interface MdListLine {
  depth: number
  /** null: an empty bullet marker (`- `), which is read as a blank line. */
  type: MdListItem['type'] | null
  checked: boolean
  /** The item text after the marker (task annotations still in it). */
  text: string
}

/** A list item line, or null for a blank line / continuation text. */
function parseListLine(line: string): MdListLine | null {
  if (!line.trim()) return null
  const depth = Math.floor((line.match(/^(\s*)/)?.[1].length ?? 0) / 2)
  // Empty bullet marker (`- `): an empty item or a blank line, see parseMdListItems.
  if (/^\s*[-*+]\s*$/.test(line)) return { depth, type: null, checked: false, text: '' }
  // The checkbox is followed by a space or the end of the line (an empty task
  // at the end of the text, its space trimmed): `- [x](url)` is a bullet item
  // starting with a link, not a checked task.
  const taskMatch = line.match(/^\s*- \[([ x])\](?:[ \t](.*))?$/)
  if (taskMatch) return { depth, type: 'task', checked: taskMatch[1] === 'x', text: taskMatch[2] ?? '' }
  // A space or a tab after the marker, as LIST_MARKER_RE (which makes the block
  // a list) accepts: a first line it accepts must be an item, or it'd be lost.
  const olMatch = line.match(/^\s*(\d+)\.[ \t](.*)$/)
  if (olMatch) return { depth, type: 'ol', checked: false, text: olMatch[2] }
  const ulMatch = line.match(/^\s*[-*+][ \t](.*)$/)
  if (ulMatch) return { depth, type: 'ul', checked: false, text: ulMatch[1] }
  return null
}

/**
 * Whether an empty bullet marker (`- `) at `depth` is an empty bullet item
 * rather than a blank line: unless it sits right below a bullet sibling, it
 * starts a bullet list (the first item of the block, the first child of the
 * item above, or the list after a task/ordered sibling list) — that's how
 * listElToMd writes an empty bullet, or one whose text starts with a hard
 * break (`- ` + the rest on the next lines). The sibling is the shallowest
 * stack entry at `depth` or deeper (they're popped for the new item).
 */
function emptyMarkerIsItem(stack: { depth: number; node: { type: MdListItem['type'] } }[], depth: number): boolean {
  const sibling = stack.find(e => e.depth >= depth)
  return !sibling || sibling.node.type !== 'ul'
}

/**
 * The items of a list block. `lead`: text lines before the first item, which
 * can't belong to any item (kept as a paragraph above the list, never dropped).
 */
function parseMdListItems(lines: string[]): { items: MdListItem[]; lead: string[] } {
  const result: MdListItem[] = []
  const lead: string[] = []
  const stack: { depth: number; node: MdListItem }[] = []

  for (const line of lines) {
    let parsed = parseListLine(line)

    // An empty bullet marker that starts a bullet list is an empty bullet item
    // (emptyMarkerIsItem). Read as a blank line, it went to the wrong item —
    // or, first in the block, to none, and its text was lost.
    if (parsed?.type === null && emptyMarkerIsItem(stack, parsed.depth)) parsed = { ...parsed, type: 'ul' }

    // Blank line or any other empty marker (e.g. "- " left by YAML) — append a
    // line break to the preceding item so it renders as <br> (visual blank
    // line) rather than a new bullet point. Blank lines before the first item
    // go: they're the block separator.
    if (!line.trim() || parsed?.type === null) {
      const lastNode = stack.length > 0 ? stack[stack.length - 1].node
                     : result.length > 0 ? result[result.length - 1]
                     : null
      if (lastNode) lastNode.text += '\n'
      continue
    }

    let item: MdListItem
    if (parsed?.type === 'task') {
      // Plain Markdown (linked notes): 📅⏰🔺 and the agent marker are text, not task attributes.
      const { text: cleanText, due, alarm, importance, agentId, agentState } = plainMode()
        ? { text: parsed.text, due: null, alarm: null, importance: null, agentId: null, agentState: null }
        : extractDeadlineAnnotations(parsed.text)
      item = { type: 'task', checked: parsed.checked, text: cleanText, due, alarm, importance, agentId, agentState, children: [] }
    } else if (parsed?.type) {
      item = { type: parsed.type, checked: false, text: parsed.text, due: null, alarm: null, importance: null, agentId: null, agentState: null, children: [] }
    } else {
      // Continuation line (soft/hard break inside list item) — append to last item.
      if (stack.length > 0) {
        const node = stack[stack.length - 1].node
        if (node.type === 'task' && !plainMode()) {
          // Recover annotations that an older build appended to the last physical
          // line of a multi-line task instead of the first (they'd otherwise show
          // up as literal "🔺low"/"📅…"/"⏰…" text and the attribute would be lost).
          // Only the kinds the task doesn't have yet: once it has a date, a 📅
          // further down is text the user wrote ("was 📅2025-12-20 before slip")
          // and must stay where it is, not be cut out and lost.
          // Same for the agent marker: one that ended on a later line (a soft
          // break typed before it) is the task's while the task has none — the
          // serializer puts it back on the first line, where the CLI reads it.
          const { text: contText, due, alarm, importance, agentId, agentState } = extractDeadlineAnnotations(line.trim(), {
            due: !node.due, alarm: !node.alarm, importance: !node.importance, agent: !node.agentId,
          })
          if (due) node.due = due
          if (alarm) node.alarm = alarm
          if (importance) node.importance = importance
          if (agentId) { node.agentId = agentId; node.agentState = agentState }
          node.text += '\n' + contText
        } else {
          node.text += '\n' + line.trim()
        }
      } else {
        lead.push(line.trim())
      }
      continue
    }

    const depth = parsed.depth
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      result.push(item)
    } else {
      stack[stack.length - 1].node.children.push(item)
    }

    stack.push({ depth, node: item })
  }

  return { items: result, lead }
}

/**
 * Sibling items → one list per run of consecutive items of the same kind. The
 * editor schema can't mix them (a taskList only holds taskItems), so a mixed
 * run would be split by ProseMirror anyway; rendering it already split keeps
 * the HTML equal to the document it becomes.
 */
function renderMdListItems(items: MdListItem[]): string {
  let html = ''
  for (let i = 0; i < items.length;) {
    const type = items[i].type
    let end = i
    while (end < items.length && items[end].type === type) end++
    const innerHtml = items.slice(i, end).map(renderMdListItem).join('')
    if (type === 'task') html += `<ul data-type="taskList">${innerHtml}</ul>`
    else if (type === 'ol') html += `<ol>${innerHtml}</ol>`
    else html += `<ul>${innerHtml}</ul>`
    i = end
  }
  return html
}

function renderMdListItem(item: MdListItem): string {
  const childHtml = renderMdListItems(item.children)
  const textHtml = item.text.split('\n').map(inline).join('<br>')
  if (item.type === 'task') {
    // These values come out of strict patterns (extractDeadlineAnnotations);
    // escaped all the same, so the attribute never depends on that.
    const dueAttr   = item.due   ? ` data-due="${escapeAttr(item.due)}"`     : ''
    const alarmAttr = item.alarm ? ` data-alarm="${escapeAttr(item.alarm)}"` : ''
    const impAttr   = item.importance ? ` data-importance="${escapeAttr(item.importance)}"` : ''
    // Agent-task marker: carried as attributes (never as text), no UI of its own here.
    const agentAttr = item.agentId && item.agentState
      ? ` data-agent-id="${escapeAttr(item.agentId)}" data-agent-state="${escapeAttr(item.agentState)}"`
      : ''
    return `<li data-checked="${item.checked}" data-type="taskItem"${dueAttr}${alarmAttr}${impAttr}${agentAttr}><label><input type="checkbox"${item.checked ? ' checked' : ''}></label><p>${textHtml}</p>${childHtml}</li>`
  }
  return `<li><p>${textHtml}</p>${childHtml}</li>`
}

function mdListBlockToHtml(lines: string[]): string {
  const { items, lead } = parseMdListItems(lines)
  const leadHtml = lead.length ? `<p>${lead.map(inline).join('<br>')}</p>` : ''
  return leadHtml + renderMdListItems(items)
}

// ── Blockquote parsing (htmlFromMarkdown helper) ─────────────────────────────

/**
 * Render a `> …` markdown block as `<blockquote>…</blockquote>`. Each line's
 * `>` prefix (with its optional single space) is stripped and what's left is
 * parsed as markdown of its own: the exact inverse of blockElToMd, which
 * writes the quote's blocks (paragraphs, lists, code, headings, nested quotes…)
 * and then prefixes every line. An empty quote line (`>` alone) is a blank
 * line: one starts a new paragraph, as always.
 */
function mdBlockquoteToHtml(lines: string[]): string {
  const inner = lines.map(l => l.replace(/^\s*>\s?/, '')).map(l => (l.trim() ? l : ''))
  quoteDepth++
  try {
    return `<blockquote>${markdownBlocksToHtml(inner.join('\n'))}</blockquote>`
  } finally {
    quoteDepth--
  }
}

// ── Pipe table helpers ───────────────────────────────────────────────────────

// A markdown table separator row: only |, :, -, spaces; each cell ≥3 dashes;
// ≥2 cells. Strict (≥3 dashes) so paragraphs with literal | aren't mistaken
// for tables.
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/

// The separator row of a one-column table (`| --- |`, `|:---:|`, `|---`,
// `--- |`…): one cell and at least one pipe — a bare `---` is a horizontal
// rule, never a separator.
const TABLE_SEPARATOR_1COL_RE = /^\s*(?:\|\s*:?-{3,}:?\s*\|?|:?-{3,}:?\s*\|)\s*$/

/**
 * Whether `header` + `sep` start a pipe table: the header has a `|` and `sep`
 * is a separator row. A one-column separator only counts below a one-cell
 * header (as in GFM, both rows have the same number of cells), so a line of
 * prose with a `|` stays prose above a `| --- |`. Shared by block parsing and
 * the paste handler (containsMarkdownTable).
 */
function isTableStart(header: string, sep: string): boolean {
  if (!/\|/.test(header)) return false
  if (TABLE_SEPARATOR_RE.test(sep)) return true
  return TABLE_SEPARATOR_1COL_RE.test(sep) && splitPipeRow(header).length === 1
}

/** True if the text has a header line immediately followed by a separator row. */
export function containsMarkdownTable(md: string): boolean {
  const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (isTableStart(lines[i], lines[i + 1])) return true
  }
  return false
}

/**
 * Heuristic: does this text look like *markdown source* (vs plain prose)?
 *
 * Used by the editor's paste handler to decide whether to parse pasted plain
 * text as markdown. Detects any block-level marker (heading, bullet/task list,
 * ordered list, blockquote, code fence, table) on its own line. Rendered
 * content (copied from a web page) doesn't carry these markers in text/plain,
 * so this stays false there and the native, richer HTML handling is used.
 */
export function looksLikeMarkdown(md: string): boolean {
  const src = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (const line of src.split('\n')) {
    if (/^\s{0,3}#{1,6}\s+\S/.test(line)) return true   // ATX heading
    if (/^\s*[-*+]\s+\S/.test(line)) return true        // bullet / task list
    if (/^\s*\d+[.)]\s+\S/.test(line)) return true      // ordered list
    if (/^\s*>\s/.test(line)) return true               // blockquote
    if (/^\s*(```|~~~)/.test(line)) return true         // code fence
    if (KANBAN_OPEN_RE.test(line)) return true           // kanban board
    if (DRAWING_OPEN_RE.test(line)) return true          // drawing block
  }
  return containsMarkdownTable(src)
}

function splitPipeRow(line: string): string[] {
  const trimmed = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') { cur += '|'; i++; continue }
    if (ch === '|') { cells.push(cur); cur = ''; continue }
    cur += ch
  }
  cells.push(cur)
  return cells.map(c => c.trim())
}

function parseAlign(sep: string): 'left' | 'center' | 'right' | null {
  const s = sep.trim()
  const L = s.startsWith(':'), R = s.endsWith(':')
  if (L && R) return 'center'
  if (R) return 'right'
  if (L) return 'left'
  return null
}

function renderCell(c: string): string {
  return c.split(/<br\s*\/?>/i).map(inline).join('<br>')
}

// ── Column widths (lib/tableWidth.ts; note-format.md "Tablas: ancho de columna") ──
//
// A width is the dash count of the column's separator cell. Only read when the
// separator is spaced the way NoteFlow writes it and is NOT lined up with the
// header — what formatters (Prettier, VS Code) and most LLMs write is either
// compact (`|------|`) or aligned, and those tables stay automatic.

// Gate 1: NoteFlow's spacing — outer pipes, one space on each side of every
// cell, trailing spaces tolerated (one column too: `| ------ |`).
const CANONICAL_SEPARATOR_RE = /^\| :?-+:?(?: \| :?-+:?)* \|[ \t]*$/

/** Offsets of the unescaped pipes of a row (`\|` is escaped, as in splitPipeRow). */
function pipeOffsets(line: string): number[] {
  const out: number[] = []
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') { i++; continue }
    if (line[i] === '|') out.push(i)
  }
  return out
}

/** Gate 2: the separator's pipes fall where the header's do (every column as wide in both rows). */
function linesUp(header: string, sep: string): boolean {
  const a = pipeOffsets(header)
  const b = pipeOffsets(sep)
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/**
 * The width of each column of a table's separator row (null = automatic), or
 * none at all when a gate fails: a separator that isn't spaced canonically, or
 * one lined up with the header (a formatter's / an LLM's table).
 */
function separatorWidths(header: string, sep: string): (number | null)[] {
  if (!CANONICAL_SEPARATOR_RE.test(sep) || linesUp(header, sep)) return []
  return sep.trimEnd().slice(2, -2).split(' | ').map(cell => widthFromDashes(cell.replace(/:/g, '').length))
}

/** A separator cell: the alignment's colons around `---`, or `width` dashes. */
function separatorCell(align: string | null, width: number | null): string {
  const dashes = '-'.repeat(width ?? AUTO_COLUMN_DASHES)
  if (align === 'center') return `:${dashes}:`
  if (align === 'right') return `${dashes}:`
  if (align === 'left') return `:${dashes}`
  return dashes
}

/**
 * The separator row for `head` (the header line as written). A table with
 * widths must never look lined up with its header (gate 2 would drop them on
 * reading): if it would, its last column with a width gets one dash more (one
 * less at COLUMN_WIDTH_MAX). Stable: the next save writes the same.
 */
function separatorLine(head: string, aligns: (string | null)[], widths: (number | null)[]): string {
  const line = (w: (number | null)[]) => '| ' + aligns.map((a, i) => separatorCell(a, w[i] ?? null)).join(' | ') + ' |'
  const sep = line(widths)
  const last = widths.reduce<number>((at, w, i) => (w !== null ? i : at), -1)
  if (last < 0 || !linesUp(head, sep)) return sep
  const nudged = [...widths]
  nudged[last] = widths[last]! < COLUMN_WIDTH_MAX ? widths[last]! + 1 : widths[last]! - 1
  return line(nudged)
}

function mdTableToHtml(lines: string[]): string {
  const header = splitPipeRow(lines[0])
  const aligns = splitPipeRow(lines[1]).map(parseAlign)
  const widths = columnWidthsMode() ? separatorWidths(lines[0], lines[1]) : []
  // The rows run to the first line without a `|`; whatever is glued below the
  // table (text an LLM wrote right after it…) is a block of its own, not lost.
  let end = 2
  while (end < lines.length && (!lines[end].trim() || /\|/.test(lines[end]))) end++
  const bodyLines = lines.slice(2, end).filter(l => l.trim())
  const rest = end < lines.length ? blockToHtml(lines.slice(end).join('\n')) : ''
  // Every cell of a column carries its alignment and its width (the editor's
  // invariant: a cell is laid out on its own attributes).
  const attrsFor = (i: number) => {
    const width = widths[i] ?? null
    const style = [aligns[i] && `text-align:${aligns[i]}`, width && `${COLUMN_WIDTH_VAR}:${width}`].filter(Boolean).join(';')
    return (width ? ` ${COLUMN_WIDTH_ATTR}="${escapeAttr(String(width))}"` : '') + (style ? ` style="${escapeAttr(style)}"` : '')
  }

  const thead = `<tr>${header.map((c, i) =>
    `<th${attrsFor(i)}>${renderCell(c)}</th>`).join('')}</tr>`

  const tbody = bodyLines.map(l => {
    const cells = splitPipeRow(l)
    while (cells.length < header.length) cells.push('')
    cells.length = header.length
    return `<tr>${cells.map((c, i) =>
      `<td${attrsFor(i)}>${renderCell(c)}</td>`).join('')}</tr>`
  }).join('')

  return `<table>${thead}${tbody}</table>${rest}`
}

function escapeCell(md: string): string {
  return md.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

// A table cell in the editor holds blocks (Enter in a cell starts a new
// paragraph; a list or code block can be pasted in), but a markdown table row
// is one line. The cell's blocks go one per line — a `<br>` in the cell — so
// their text is never glued together ("a" + "b" → "ab"); lists and code keep
// their text, not their structure. A cell holding inline content directly
// (HTML from an import) is written as before.
const CELL_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre', 'blockquote', 'div'])

function isBlockCell(cell: Element): boolean {
  return Array.from(cell.childNodes).every(n =>
    n.nodeType === Node.ELEMENT_NODE
      ? CELL_BLOCK_TAGS.has((n as Element).tagName.toLowerCase())
      : !(n.textContent ?? '').trim())
}

function cellLines(el: Element): string[] {
  const lines: string[] = []
  for (const c of el.children) {
    const tag = c.tagName.toLowerCase()
    if (tag === 'pre') lines.push(...(c.textContent ?? '').split('\n').map(l => (l.trim() ? `\`${l}\`` : '')))
    else if (tag === 'p' || /^h\d$/.test(tag)) lines.push(inlineElToMd(c))
    // A task item's checkbox (<label><input>) has no text: skipped.
    else if (CELL_BLOCK_TAGS.has(tag)) lines.push(...cellLines(c))
  }
  return lines
}

function tableElToMd(tbl: Element): string {
  const rows = Array.from(tbl.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  const headerRow = rows[0]
  const firstHasTh = Array.from(headerRow.children).some(
    c => c.tagName.toLowerCase() === 'th'
  )
  const cellMd = (c: Element) =>
    escapeCell((isBlockCell(c) ? cellLines(c).join('\n') : inlineElToMd(c)).trim()) || ' '

  const headerCells = Array.from(headerRow.children)
  const aligns = headerCells.map(c => {
    const s = (c as HTMLElement).style?.textAlign ?? ''
    return s === 'center' || s === 'right' || s === 'left' ? s : null
  })
  // The column widths (dashes) are read from the header cells.
  const widths = headerCells.map(c => widthFromAttr(c.getAttribute(COLUMN_WIDTH_ATTR)))

  const toLine = (r: Element) =>
    '| ' + Array.from(r.children).map(cellMd).join(' | ') + ' |'

  const head = firstHasTh
    ? toLine(headerRow)
    : '| ' + aligns.map(() => ' ').join(' | ') + ' |'
  const sep  = separatorLine(head, aligns, widths)
  const body = rows.slice(firstHasTh ? 1 : 0).map(toLine).join('\n')

  // Includes the trailing block separator ('\n\n'); `blockElToMd()` must not add more.
  return [head, sep, body].filter(Boolean).join('\n') + '\n\n'
}
