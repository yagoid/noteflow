// Editor-side actions around drawing blocks. The node is DrawingBlock.ts, its view
// DrawingBlockView.tsx; the format lives in lib/drawing/drawingBlock.ts.
import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state'
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
 * a text block. `text` is typed into it; `fresh` asks for an empty paragraph of its own
 * even if a paragraph with text follows. A drawing is an atom: without this there is no
 * place for the caret next to one at the edge of a section, and typing with it selected
 * would REPLACE it.
 */
export function caretBesideDrawing(tr: Transaction, pos: number, side: 'after' | 'before', text = '', fresh = false): Transaction {
  const node = tr.doc.nodeAt(pos)
  if (!node || node.type.name !== DRAWING_NODE_NAME) return tr
  const paragraph = tr.doc.type.schema.nodes.paragraph
  if (side === 'after') {
    const at = pos + node.nodeSize
    const next = tr.doc.nodeAt(at)
    // An empty paragraph already there is the place; anything else gets a new one when
    // something is about to be written (`text`, or `fresh`: typed / pasted next) — it must
    // not land inside the next block's content.
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

/**
 * Before inserting something at the selection from outside ProseMirror's own input (an
 * image read from a pasted or dropped file): if a drawing is node-selected, the insert
 * would REPLACE it — step into a paragraph right below it first. True if it moved.
 */
export function leaveSelectedDrawing(editor: Editor): boolean {
  const pos = selectedDrawingPos(editor.state.selection)
  if (pos === null || editor.isDestroyed) return false
  editor.view.dispatch(caretBesideDrawing(editor.state.tr, pos, 'after', '', true))
  return true
}

/** The drawing node the selection is on as a whole (a node selection), if any. */
export function selectedDrawingPos(selection: unknown): number | null {
  return selection instanceof NodeSelection && selection.node.type.name === DRAWING_NODE_NAME ? selection.from : null
}

/** Open the overlay of the drawing node at `pos` (Enter on the selected node). */
export function editDrawingAt(editor: Editor, pos: number): boolean {
  const dom = editor.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return false
  dom.dispatchEvent(new CustomEvent(DRAWING_EDIT_EVENT))
  return true
}
