// Editor-side actions around drawing blocks. The node is DrawingBlock.ts, its view
// DrawingBlockView.tsx; the format lives in lib/drawing/drawingBlock.ts.
import type { Editor } from '@tiptap/core'
import { NodeSelection, type Transaction } from '@tiptap/pm/state'
import { caretBesideBlock } from '../../lib/blockEdges'
import { serializeSceneBody, type DrawingHtmlData } from '../../lib/drawing/drawingBlock'

export const DRAWING_NODE_NAME = 'drawingBlock'

/** DOM event the node view listens to on its wrapper: open the drawing overlay. */
export const DRAWING_EDIT_EVENT = 'noteflow:drawing-edit'

// Set by insertDrawing right before the node is inserted; the node view that mounts next
// takes it and opens the overlay (a new drawing goes straight to the canvas).
let openOnInsert = false
export function consumeOpenOnInsert(): boolean {
  const open = openOnInsert
  openOnInsert = false
  return open
}

const emptyDrawing = (): DrawingHtmlData => ({
  kind: 'excalidraw',
  attrs: '',
  body: serializeSceneBody({ appState: { viewBackgroundColor: 'transparent' }, elements: [], files: {} }).join('\n'),
})

/**
 * Insert an empty drawing at the top level and open it: it replaces the current top-level
 * block when that is an empty paragraph, otherwise it goes right after it (drawings only
 * live at the top level, like boards). An empty paragraph is added after it when it would
 * end the document. Closing the overlay without drawing removes the block again.
 */
export function insertDrawing(editor: Editor) {
  const { $from } = editor.state.selection
  let from = $from.pos
  let to = $from.pos
  if ($from.depth > 0) {
    const block = $from.node(1)
    const start = $from.before(1)
    const end = start + block.nodeSize
    if (block.type.name === 'paragraph' && block.content.size === 0) { from = start; to = end } else { from = end; to = end }
  }
  const atEnd = to >= editor.state.doc.content.size
  const content: Record<string, unknown>[] = [{ type: DRAWING_NODE_NAME, attrs: { drawing: emptyDrawing() } }]
  if (atEnd) content.push({ type: 'paragraph' })
  openOnInsert = true
  const inserted = editor.chain().insertContentAt({ from, to }, content).command(({ tr }) => {
    if (tr.doc.nodeAt(from)?.type.name === DRAWING_NODE_NAME) tr.setSelection(NodeSelection.create(tr.doc, from))
    return true
  }).run()
  if (!inserted) openOnInsert = false
}


/**
 * Puts the caret in a text block right after (or before) the drawing at `pos`, creating an
 * empty paragraph there when the drawing ends (starts) the document or the neighbour isn't
 * a text block (lib/blockEdges.ts → caretBesideBlock, shared with tables, boards and code
 * blocks at the edge of a section). `text` is typed into it; `fresh` asks for an empty
 * paragraph of its own even if a paragraph with text follows. A drawing is an atom:
 * without this there is no place for the caret next to one at the edge of a section, and
 * typing with it selected would REPLACE it.
 */
export function caretBesideDrawing(tr: Transaction, pos: number, side: 'after' | 'before', text = '', fresh = false): Transaction {
  if (tr.doc.nodeAt(pos)?.type.name !== DRAWING_NODE_NAME) return tr
  return caretBesideBlock(tr, pos, side, text, fresh)
}

/**
 * Before inserting something at the selection from outside ProseMirror's own input (an
 * image read from a pasted or dropped file, a snippet or a section link from the
 * toolbar): if a drawing is node-selected, the insert would REPLACE it — step into a
 * paragraph right below it first. True if it moved.
 */
export function leaveSelectedDrawing(editor: Editor): boolean {
  const pos = selectedDrawingPos(editor.state.selection)
  if (pos === null || editor.isDestroyed) return false
  editor.view.dispatch(caretBesideDrawing(editor.state.tr, pos, 'after', '', true))
  return true
}

/** The same on a transaction being built (a command, or an insert made in the same step). */
export function stepOffSelectedDrawing(tr: Transaction): Transaction {
  const pos = selectedDrawingPos(tr.selection)
  return pos === null ? tr : caretBesideDrawing(tr, pos, 'after', '', true)
}

/** The drawing node the selection is on as a whole (a node selection), if any. */
export function selectedDrawingPos(selection: unknown): number | null {
  return selection instanceof NodeSelection && selection.node.type.name === DRAWING_NODE_NAME ? selection.from : null
}

/** Open the overlay of the drawing node at `pos` (Ctrl/Cmd+Enter on the selected node). */
export function editDrawingAt(editor: Editor, pos: number): boolean {
  const dom = editor.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return false
  dom.dispatchEvent(new CustomEvent(DRAWING_EDIT_EVENT))
  return true
}
