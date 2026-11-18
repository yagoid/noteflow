// Editor-side actions around drawing blocks. The node is DrawingBlock.ts, its view
// DrawingBlockView.tsx; the format lives in lib/drawing/drawingBlock.ts.
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
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

/** Open the overlay of the drawing node at `pos` (Enter on the selected node). */
export function editDrawingAt(editor: Editor, pos: number): boolean {
  const dom = editor.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return false
  dom.dispatchEvent(new CustomEvent(DRAWING_EDIT_EVENT))
  return true
}
