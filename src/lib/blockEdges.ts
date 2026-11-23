// A caret beside the blocks that start or end a section. The editor has no gap
// cursor: next to a top-level block that opens or closes the section — a table, a
// code block, an atom (kanban board, drawing, horizontal rule), a list or checklist,
// a quote, or text itself (a paragraph, a heading) — there is no empty line for the
// caret when nothing else is on that side, so nothing could be written above a table
// or a checklist that opens a section, or below a board that closes it, and a click
// past the text only put the caret into it.
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
 * A top-level block that, at the edge of the section, gets an empty line beside it:
 * every block but an empty paragraph, which already is that line (so the lines are
 * never made in a chain).
 */
export function needsEdgeParagraph(node: PMNode): boolean {
  return !(node.type.name === 'paragraph' && node.content.size === 0)
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
 *   the first / last paragraph; in a list, the first item's first paragraph / the
 *   deepest last item's last one; in a quote, its first / last paragraph; a top-level
 *   paragraph or heading itself. Whether the caret is on that text block's first /
 *   last visual LINE is up to the view (BlockEdges.ts: view.endOfTextblock).
 *
 * A top-level paragraph or heading is left with ↑/↓ only: ←/→ at the start / end of
 * the text are too common a keystroke to make a line.
 */
export function edgeBlockToLeave(selection: Selection, side: EdgeSide, axis: EdgeAxis): number | null {
  const doc = selection.$from.doc
  const pos = edgeBlockPos(doc, side)
  if (pos === null) return null
  if (selection instanceof NodeSelection) return selection.from === pos ? pos : null
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const $pos = selection.$from
  if ($pos.depth < 1 || $pos.before(1) !== pos) return null
  if (axis === 'horiz' && $pos.depth === 1 && !$pos.parent.type.spec.code) return null
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
