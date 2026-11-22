// A caret beside the blocks that start or end a section. The editor has no gap
// cursor: next to a top-level block that is not a text block of its own — a table,
// a code block, an atom (kanban board, drawing, horizontal rule) — there is no
// position for the caret when nothing else is on that side, so nothing could be
// written above a table that opens a section, or below a board that closes it.
// The arrows (and a click in the empty space past the block) make the paragraph
// that is missing there: components/Editor/BlockEdges.ts drives this, the drawing
// node (DrawingBlock.ts) makes it the same way through caretBesideBlock.
//
// The paragraph is an ordinary edit and stays; an empty paragraph at the start or
// the end of a section is not written by htmlToMarkdown, so moving around changes
// nothing saved. Pure ProseMirror, tested in tests/lib/blockEdges.test.ts.

import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type Selection, type Transaction } from '@tiptap/pm/state'

export type EdgeSide = 'before' | 'after'
/** Arrow axis: ↑/↓ leave from the first / last LINE of the block, ←/→ only from its first / last position. */
export type EdgeAxis = 'vert' | 'horiz'

/**
 * A top-level block with no place for the caret beside it: a table, a code block or
 * an atom. Text blocks (paragraphs, headings) are that place themselves, and lists /
 * quotes have Enter on an empty line to step out of them.
 */
export function needsEdgeParagraph(node: PMNode): boolean {
  return node.isAtom || !!node.type.spec.code || node.type.spec.tableRole === 'table'
}

/** Position of the top-level block on `side` of the document when it needs a paragraph beside it. */
export function edgeBlockPos(doc: PMNode, side: EdgeSide): number | null {
  const block = side === 'before' ? doc.firstChild : doc.lastChild
  if (!block || !needsEdgeParagraph(block)) return null
  return side === 'before' ? 0 : doc.content.size - block.nodeSize
}

/**
 * The edge block (its position) the selection leaves with an arrow towards `side`, or
 * null when the arrow is the editor's: the block must start (`before`) / end (`after`)
 * the document and need a paragraph there (edgeBlockPos), and the selection be
 * - the block itself, selected as a node (an atom), or
 * - an empty caret at its edge: for ←/→ its very first / last position; for ↑/↓ a
 *   text block on its first / last row — in every cell of the first / last table row,
 *   the first / last paragraph. Whether the caret is on that text block's first / last
 *   visual LINE is up to the view (BlockEdges.ts: view.endOfTextblock).
 */
export function edgeBlockToLeave(selection: Selection, side: EdgeSide, axis: EdgeAxis): number | null {
  const doc = selection.$from.doc
  const pos = edgeBlockPos(doc, side)
  if (pos === null) return null
  if (selection instanceof NodeSelection) return selection.from === pos ? pos : null
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const $pos = selection.$from
  if ($pos.depth < 1 || $pos.before(1) !== pos) return null
  // Every ancestor between the block and the caret's text block: the first (last) child.
  // On ↑/↓ any cell of a row will do — cells sit side by side, on the same line.
  for (let d = 1; d < $pos.depth; d++) {
    if (axis === 'vert' && $pos.node(d).type.spec.tableRole === 'row') continue
    const index = $pos.index(d)
    if (side === 'before' ? index !== 0 : index !== $pos.node(d).childCount - 1) return null
  }
  if (axis === 'horiz' && $pos.parentOffset !== (side === 'before' ? 0 : $pos.parent.content.size)) return null
  return pos
}

/**
 * Puts the caret in a text block right after (or before) the top-level block at `pos`,
 * creating an empty paragraph there when the block ends (starts) the document or the
 * neighbour isn't a paragraph. `text` is typed into it; `fresh` asks for an empty
 * paragraph of its own even if a paragraph with text follows (something is about to
 * be typed or pasted: it must not land inside the next block's content).
 */
export function caretBesideBlock(tr: Transaction, pos: number, side: EdgeSide, text = '', fresh = false): Transaction {
  const node = tr.doc.nodeAt(pos)
  if (!node) return tr
  const paragraph = tr.doc.type.schema.nodes.paragraph
  if (side === 'after') {
    const at = pos + node.nodeSize
    const next = tr.doc.nodeAt(at)
    // An empty paragraph already there is the place; anything else gets a new one when
    // something is about to be written.
    if (!(next?.type === paragraph && (next.content.size === 0 || (!text && !fresh)))) tr.insert(at, paragraph.create())
    if (text) tr.insertText(text, at + 1)
    return tr.setSelection(TextSelection.create(tr.doc, at + 1 + text.length))
  }
  const before = pos > 0 ? tr.doc.resolve(pos).nodeBefore : null
  if (before?.type === paragraph && !text) return tr.setSelection(TextSelection.create(tr.doc, pos - 1))
  tr.insert(pos, paragraph.create())
  if (text) tr.insertText(text, pos + 1)
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1 + text.length))
}
