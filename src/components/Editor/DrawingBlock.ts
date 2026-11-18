import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import {
  drawingFromHtmlData,
  drawingHtmlDataFromElement,
  drawingHtmlDataToMarkdown,
  drawingText,
  drawingToHtml,
  type DrawingHtmlData,
} from '../../lib/drawing/drawingBlock'
import { DrawingBlockView } from './DrawingBlockView'
import { DRAWING_NODE_NAME, editDrawingAt } from './drawingCommands'

export { DRAWING_NODE_NAME }

// In-note drawing block (format + md↔html: lib/drawing/drawingBlock.ts). A block ATOM:
// the whole block lives in one JSON-safe attribute (`drawing`: kind, marker attributes
// and the fence content), which the React NodeView (DrawingBlockView.tsx) changes only
// through updateAttributes — every edit is one ordinary transaction (undo/redo, autosave).
//
// Lossless round-trip, like the kanban board: parseHTML reads the data-* attributes of
// htmlFromMarkdown's `div[data-type="drawing"]` (drawingHtmlDataFromElement) and
// renderHTML writes back exactly that HTML, which editor.getHTML() → htmlToMarkdown()
// saves. Without this node ProseMirror would drop the div, and with it the drawing.
export const DrawingBlock = Node.create({
  name: DRAWING_NODE_NAME,
  // Top level only, as boards (see editorExtensions.ts → TopLevelDocument).
  group: 'topBlock',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      drawing: {
        default: { kind: 'mermaid', attrs: '', body: '' } satisfies DrawingHtmlData,
        parseHTML: (el) => drawingHtmlDataFromElement(el),
        // Rendered as a whole by renderHTML below.
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="drawing"]' }]
  },

  renderHTML({ node }) {
    const data = node.attrs.drawing as DrawingHtmlData
    const block = drawingFromHtmlData(data)
    const el = document.createElement('div')
    if (block) {
      const template = document.createElement('template')
      template.innerHTML = drawingToHtml(block)
      return template.content.firstElementChild as HTMLElement
    }
    // A body that doesn't parse (never from our own HTML): keep the data as it is.
    el.setAttribute('data-type', 'drawing')
    el.setAttribute('data-kind', data.kind)
    el.setAttribute('data-attrs', data.attrs)
    el.setAttribute('data-body', data.body)
    return el
  },

  // Plain-text form (clipboard text/plain, editor.getText()): what the drawing says.
  renderText({ node }) {
    const data = node.attrs.drawing as DrawingHtmlData
    const block = drawingFromHtmlData(data)
    return block ? drawingText(block) : drawingHtmlDataToMarkdown(data)
  },

  addKeyboardShortcuts() {
    return {
      // Enter on the selected drawing opens it (Backspace / Delete remove it, as any atom).
      Enter: ({ editor }) => {
        const { selection } = editor.state
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== DRAWING_NODE_NAME) return false
        return editDrawingAt(editor, selection.from)
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingBlockView, {
      // The node view's own controls (edit button, resize handle) keep their events;
      // everywhere else ProseMirror handles them (a click selects the node).
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null
        return !!target?.closest?.('[data-drawing-interactive]')
      },
      ignoreMutation: () => true,
    })
  },
})
