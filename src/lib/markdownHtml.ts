// ── Markdown ↔ HTML helpers ──────────────────────────────────────────────────
//
// Shared between the TipTap editor (round-trips note content) and read-only
// renderers like the Note overview miniature preview. Kept framework-free so it
// can live in lib/ and be imported anywhere without dragging in React.
//
// Rules:
//   - Blank line (two newlines) = paragraph break  → </p><p>
//   - Single newline within a paragraph             → <br>  (HardBreak)
//   - Lists: consecutive same-type items are merged into one <ul>/<ol>
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
  escapeHtml,
  extractDeadlineAnnotations,
  inlineToHtml,
  taskAnnotationsToMd,
  type TaskImportance,
} from './markdownInline'

// Sentinel character used to protect blank lines inside code fences and kanban
// boards from the \n\n block-splitter. Must not appear in real user content.
const FENCE_BLANK = '\x00'

export function htmlFromMarkdown(md: string): string {
  if (!md.trim()) return '<p></p>'

  // Normalise line endings
  const src = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Isolate closed code fences as their own blocks and protect the blank lines
  // inside them before splitting on \n\n (see isolateCodeFences). Kanban boards
  // go second: their pass needs to know which lines are code (a marker inside a
  // code block is code), and that is only settled once fences are isolated.
  const protectedSrc = isolateKanbanBlocks(isolateCodeFences(src))

  // Split into "blocks" on blank lines — use exactly \n\n so that multiple
  // consecutive blank lines produce empty blocks, preserving them as <p></p>.
  const rawBlocks = protectedSrc.split(/\n\n/)
  const htmlBlocks: string[] = []

  // Merge consecutive list blocks so that blank lines between list items
  // (stored as \n\n in markdown) are preserved as hard breaks inside the
  // preceding item rather than splitting into separate disconnected lists.
  const isBlockAList = (b: string) => {
    const first = b.split('\n').find(l => l.trim())
    return !!first && /^\s*(?:[-*+]|\d+\.)[ \t]/.test(first)
  }
  const blocks: string[] = []
  for (const raw of rawBlocks) {
    if (isBlockAList(raw) && blocks.length > 0 && isBlockAList(blocks[blocks.length - 1])) {
      blocks[blocks.length - 1] += '\n\n' + raw
    } else {
      blocks.push(raw)
    }
  }

  for (const block of blocks) {
    const lines = block.split('\n')

    // ── Code fence ──────────────────────────────────────────────────────────
    if (/^```/.test(lines[0])) {
      const lang = lines[0].slice(3).trim()
      const code = lines.slice(1).join('\n').replace(/```\s*$/, '').trimEnd()
        .replace(new RegExp(FENCE_BLANK, 'g'), '')
      htmlBlocks.push(`<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`)
      continue
    }

    // ── Headings ─────────────────────────────────────────────────────────────
    if (lines.length === 1) {
      const hm = lines[0].match(/^(#{1,3})\s+(.+)$/)
      if (hm) {
        const level = hm[1].length
        htmlBlocks.push(`<h${level}>${inlineToHtml(hm[2])}</h${level}>`)
        continue
      }
    }

    // ── Horizontal Rule ──────────────────────────────────────────────────────
    if (lines.length === 1 && lines[0].trim() === '---') {
      htmlBlocks.push('<hr>')
      continue
    }

    // ── Kanban board (isolated by isolateKanbanBlocks; see kanban.ts) ─────────
    // Only a block that parses as a board: anything else starting with the
    // marker falls through and renders as text, as it always has.
    if (KANBAN_OPEN_RE.test(lines[0])) {
      const board = parseKanbanMarkdown(lines.map(l => (l === FENCE_BLANK ? '' : l)).join('\n'))
      if (board) {
        htmlBlocks.push(kanbanDataToHtml(board))
        continue
      }
    }

    // ── List block (supports nested/indented items) ───────────────────────────
    const firstMeaningfulLine = lines.find(l => l.trim())
    const isListBlock = !!firstMeaningfulLine && /^\s*(?:[-*+]|\d+\.)[ \t]/.test(firstMeaningfulLine)

    if (isListBlock) {
      htmlBlocks.push(mdListBlockToHtml(lines))
      continue
    }

    // ── Blockquote (`> …`) ────────────────────────────────────────────────────
    // A block is a blockquote when its first meaningful line starts with `>`.
    // Lists are checked above, so a `> ` prefix can't be confused with `-`/`*`/`+`
    // bullets or `\d+.` ordered items (those never begin with `>`).
    const isBlockquote = !!firstMeaningfulLine && /^\s*>\s?/.test(firstMeaningfulLine)

    if (isBlockquote) {
      htmlBlocks.push(mdBlockquoteToHtml(lines))
      continue
    }

    // ── Pipe table ──────────────────────────────────────────────────────────
    // Strict detection: line 1 must contain a |, line 2 must be a separator
    // row with only |, :, -, spaces; every cell ≥3 dashes; ≥2 cells. This
    // avoids reinterpreting paragraphs that contain literal | characters.
    const isPipeTable =
      lines.length >= 2 &&
      /\|/.test(lines[0]) &&
      TABLE_SEPARATOR_RE.test(lines[1])

    if (isPipeTable) {
      htmlBlocks.push(mdTableToHtml(lines))
      continue
    }

    // ── Paragraph (may span multiple lines — single \n becomes <br>) ────────
    const paraContent = lines
      .map((l) => {
        const hm = l.match(/^(#{1,3})\s+(.+)$/)
        if (hm) {
          const level = hm[1].length
          return `</p><h${level}>${inlineToHtml(hm[2])}</h${level}><p>`
        }
        return inlineToHtml(l)
      })
      .join('<br>')
      // clean up <p></p> artefacts from heading injection
      .replace(/<p><\/p>/g, '')
      .replace(/<\/p><br>/g, '</p>')
      .replace(/<br><p>/g, '<p>')

    htmlBlocks.push(`<p>${paraContent}</p>`)
  }

  return htmlBlocks.join('') || '<p></p>'
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

  // Pair openers with closers; `inPair` marks the lines strictly inside a pair.
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

  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const close = closerOf.get(i)
    if (close === undefined) {
      out.push(lines[i])
      continue
    }

    ensureBlockStart(out)

    // The block ends right before the first empty line outside any pair; the
    // code ends on the last closing line within that block.
    let end = close
    while (end + 1 < lines.length && (lines[end + 1] !== '' || inPair[end + 1])) end++
    let last = close
    for (let k = close + 1; k <= end; k++) {
      if (FENCE_CLOSE_RE.test(lines[k])) last = k
    }

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
 * Make the next line pushed onto `out` start a \n\n block. The splitter
 * consumes newlines in pairs from the left, so a line starts a block only if
 * the run of newlines right before it is even. Add one empty line when it's
 * odd (incl. no blank line at all).
 */
function ensureBlockStart(out: string[]): void {
  if (out.length === 0) return
  let trailingEmpty = 0
  while (trailingEmpty < out.length && out[out.length - 1 - trailingEmpty] === '') trailingEmpty++
  const newlineRun = trailingEmpty === out.length ? trailingEmpty : trailingEmpty + 1
  if (newlineRun % 2 === 1) out.push('')
}

/**
 * Which lines of isolateCodeFences' output end up inside a code block: a block
 * (see ensureBlockStart for the parity rule) whose first line starts with ```,
 * running to the next empty line — exactly what htmlFromMarkdown renders as
 * code. Blank lines inside paired fences are FENCE_BLANK by now, not empty.
 */
function codeBlockLines(lines: string[]): boolean[] {
  const inCode: boolean[] = new Array(lines.length).fill(false)
  let emptyRun = 0
  let seenContent = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') { emptyRun++; continue }
    const newlineRun = seenContent ? emptyRun + 1 : emptyRun
    emptyRun = 0
    seenContent = true
    if (newlineRun % 2 === 0 && FENCE_OPEN_RE.test(lines[i])) {
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
  if (tag === 'h1') return `# ${inlineElToMd(el)}\n\n`
  if (tag === 'h2') return `## ${inlineElToMd(el)}\n\n`
  if (tag === 'h3') return `### ${inlineElToMd(el)}\n\n`
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
    // (blank lines between paragraphs become a bare `>`).
    let inner = ''
    for (const c of el.childNodes) {
      if (c.nodeType === Node.ELEMENT_NODE) inner += blockElToMd(c as Element)
    }
    const quoted = inner
      .replace(/\n+$/, '')
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
  let out = ''
  for (const c of el.childNodes) {
    if (c.nodeType === Node.ELEMENT_NODE) out += blockElToMd(c as Element)
  }
  return out
}

function inlineElToMd(el: Element): string {
  let result = ''
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      // &nbsp; in HTML becomes \u00A0 in textContent — restore to regular space
      result += (child.textContent ?? '').replace(/\u00A0/g, ' ')
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      if (tag === 'strong' || tag === 'b') result += `**${inlineElToMd(c)}**`
      else if (tag === 'em' || tag === 'i') result += `*${inlineElToMd(c)}*`
      else if (tag === 's') result += `~~${inlineElToMd(c)}~~`
      else if (tag === 'u') result += `++${inlineElToMd(c)}++`
      else if (tag === 'mark') result += `==${inlineElToMd(c)}==`
      else if (tag === 'code') result += `\`${(c.textContent ?? '').replace(/\u00A0/g, ' ')}\``
      else if (tag === 'br') result += '\n'
      else if (tag === 'img') {
        const w = c.getAttribute('width')
        const suffix = w ? `{width=${w}}` : ''
        result += `![${c.getAttribute('alt') ?? ''}](${c.getAttribute('src') ?? ''})${suffix}`
      }
      else if (tag === 'span' && c.getAttribute('data-type') === 'section-relation') {
        const relNoteId = c.getAttribute('data-note-id') ?? ''
        const relSectionId = c.getAttribute('data-section-id') ?? ''
        const relName = (c.textContent ?? '').replace(/\u00A0/g, ' ')
        result += `[${relName}](noteflow://${relNoteId}/${relSectionId})`
      }
      else if (tag === 'a') result += `[${inlineElToMd(c)}](${c.getAttribute('href') ?? ''})`
      else result += inlineElToMd(c)
    }
  }
  return result
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
      const ann       = taskAnnotationsToMd(
        li.getAttribute('data-due'), li.getAttribute('data-alarm'), li.getAttribute('data-importance'))
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
  children: MdListItem[]
}

function parseMdListItems(lines: string[]): MdListItem[] {
  const result: MdListItem[] = []
  const stack: { depth: number; node: MdListItem }[] = []

  for (const line of lines) {
    // Blank line or empty list item (e.g. "- " left by YAML) — append a line
    // break to the preceding item so it renders as <br> (visual blank line)
    // rather than a new bullet point.
    const isEmptyListMarker = /^\s*[-*+]\s*$/.test(line)
    if (!line.trim() || isEmptyListMarker) {
      const lastNode = stack.length > 0 ? stack[stack.length - 1].node
                     : result.length > 0 ? result[result.length - 1]
                     : null
      if (lastNode) lastNode.text += '\n'
      continue
    }

    const indentLen = line.match(/^(\s*)/)?.[1].length ?? 0
    const depth = Math.floor(indentLen / 2)

    const taskMatch = line.match(/^\s*- \[([ x])\] ?(.*)$/)
    const olMatch = line.match(/^\s*(\d+)\. (.*)$/)
    const ulMatch = line.match(/^\s*[-*+] (.*)$/)

    let item: MdListItem
    if (taskMatch) {
      const { text: cleanText, due, alarm, importance } = extractDeadlineAnnotations(taskMatch[2])
      item = { type: 'task', checked: taskMatch[1] === 'x', text: cleanText, due, alarm, importance, children: [] }
    } else if (olMatch) {
      item = { type: 'ol', checked: false, text: olMatch[2], due: null, alarm: null, importance: null, children: [] }
    } else if (ulMatch) {
      item = { type: 'ul', checked: false, text: ulMatch[1], due: null, alarm: null, importance: null, children: [] }
    } else {
      // Continuation line (soft/hard break inside list item) — append to last item.
      if (stack.length > 0) {
        const node = stack[stack.length - 1].node
        if (node.type === 'task') {
          // Recover annotations that an older build appended to the last physical
          // line of a multi-line task instead of the first (they'd otherwise show
          // up as literal "🔺low"/"📅…"/"⏰…" text and the attribute would be lost).
          const { text: contText, due, alarm, importance } = extractDeadlineAnnotations(line.trim())
          if (due && !node.due) node.due = due
          if (alarm && !node.alarm) node.alarm = alarm
          if (importance && !node.importance) node.importance = importance
          node.text += '\n' + contText
        } else {
          node.text += '\n' + line.trim()
        }
      }
      continue
    }

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

  return result
}

function renderMdListItems(items: MdListItem[]): string {
  if (items.length === 0) return ''

  const firstType = items[0].type
  const isTask = firstType === 'task'
  const isOl = firstType === 'ol'

  const innerHtml = items.map(item => {
    const childHtml = item.children.length > 0 ? renderMdListItems(item.children) : ''
    if (item.type === 'task') {
      const dueAttr   = item.due   ? ` data-due="${item.due}"`     : ''
      const alarmAttr = item.alarm ? ` data-alarm="${item.alarm}"` : ''
      const impAttr   = item.importance ? ` data-importance="${item.importance}"` : ''
      return `<li data-checked="${item.checked}" data-type="taskItem"${dueAttr}${alarmAttr}${impAttr}><label><input type="checkbox"${item.checked ? ' checked' : ''}></label><p>${item.text.split('\n').map(inlineToHtml).join('<br>')}</p>${childHtml}</li>`
    }
    return `<li><p>${item.text.split('\n').map(inlineToHtml).join('<br>')}</p>${childHtml}</li>`
  }).join('')

  if (isTask) return `<ul data-type="taskList">${innerHtml}</ul>`
  if (isOl) return `<ol>${innerHtml}</ol>`
  return `<ul>${innerHtml}</ul>`
}

function mdListBlockToHtml(lines: string[]): string {
  return renderMdListItems(parseMdListItems(lines))
}

// ── Blockquote parsing (htmlFromMarkdown helper) ─────────────────────────────

/**
 * Render a `> …` markdown block as `<blockquote><p>…</p>…</blockquote>`.
 * Each line's `>` prefix (with its optional single space) is stripped; runs of
 * consecutive non-empty lines become one `<p>` (soft breaks as `<br>`), and an
 * empty quote line (`>` alone) starts a new paragraph.
 */
function mdBlockquoteToHtml(lines: string[]): string {
  const inner = lines.map(l => l.replace(/^\s*>\s?/, ''))
  const paragraphs: string[][] = []
  let current: string[] = []
  for (const line of inner) {
    if (line.trim() === '') {
      if (current.length) { paragraphs.push(current); current = [] }
    } else {
      current.push(line)
    }
  }
  if (current.length) paragraphs.push(current)
  if (paragraphs.length === 0) return '<blockquote><p></p></blockquote>'
  const html = paragraphs
    .map(para => `<p>${para.map(inlineToHtml).join('<br>')}</p>`)
    .join('')
  return `<blockquote>${html}</blockquote>`
}

// ── Pipe table helpers ───────────────────────────────────────────────────────

// A markdown table separator row: only |, :, -, spaces; each cell ≥3 dashes;
// ≥2 cells. Strict (≥3 dashes) so paragraphs with literal | aren't mistaken
// for tables. Shared by block parsing and the paste handler.
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/

/** True if the text has a header line immediately followed by a separator row. */
export function containsMarkdownTable(md: string): boolean {
  const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (/\|/.test(lines[i]) && TABLE_SEPARATOR_RE.test(lines[i + 1])) return true
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
  return c.split(/<br\s*\/?>/i).map(inlineToHtml).join('<br>')
}

function mdTableToHtml(lines: string[]): string {
  const header = splitPipeRow(lines[0])
  const aligns = splitPipeRow(lines[1]).map(parseAlign)
  const bodyLines = lines.slice(2).filter(l => l.trim() && /\|/.test(l))
  const styleFor = (i: number) =>
    aligns[i] ? ` style="text-align:${aligns[i]}"` : ''

  const thead = `<tr>${header.map((c, i) =>
    `<th${styleFor(i)}>${renderCell(c)}</th>`).join('')}</tr>`

  const tbody = bodyLines.map(l => {
    const cells = splitPipeRow(l)
    while (cells.length < header.length) cells.push('')
    cells.length = header.length
    return `<tr>${cells.map((c, i) =>
      `<td${styleFor(i)}>${renderCell(c)}</td>`).join('')}</tr>`
  }).join('')

  return `<table>${thead}${tbody}</table>`
}

function escapeCell(md: string): string {
  return md.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

function tableElToMd(tbl: Element): string {
  const rows = Array.from(tbl.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  const headerRow = rows[0]
  const firstHasTh = Array.from(headerRow.children).some(
    c => c.tagName.toLowerCase() === 'th'
  )
  const cellMd = (c: Element) =>
    escapeCell(inlineElToMd(c).trim()) || ' '

  const aligns = Array.from(headerRow.children).map(c => {
    const s = (c as HTMLElement).style?.textAlign ?? ''
    if (s === 'center') return ':---:'
    if (s === 'right')  return '---:'
    if (s === 'left')   return ':---'
    return '---'
  })

  const toLine = (r: Element) =>
    '| ' + Array.from(r.children).map(cellMd).join(' | ') + ' |'

  const head = firstHasTh
    ? toLine(headerRow)
    : '| ' + aligns.map(() => ' ').join(' | ') + ' |'
  const sep  = '| ' + aligns.join(' | ') + ' |'
  const body = rows.slice(firstHasTh ? 1 : 0).map(toLine).join('\n')

  // Includes the trailing block separator ('\n\n'); `blockElToMd()` must not add more.
  return [head, sep, body].filter(Boolean).join('\n') + '\n\n'
}
