import { Node } from '@tiptap/core'
import {
  drawingFromHtmlData,
  drawingHtmlDataFromElement,
  drawingHtmlDataToMarkdown,
  drawingText,
  drawingToHtml,
  type DrawingHtmlData,
} from '../../lib/drawing/drawingBlock'

export const DRAWING_NODE_NAME = 'drawingBlock'

// In-note drawing block (format + md↔html: lib/drawing/drawingBlock.ts). Schema
// only, for now: a block ATOM that carries the block through the editor so that
// opening and saving a note never loses it — htmlFromMarkdown emits
// `div[data-type="drawing"]`, and without a node for it ProseMirror would drop
// the div and with it the drawing. No NodeView yet: it shows the fallback
// `<pre>` of drawingToHtml (the drawing's text), not editable.
//
// Lossless round-trip, like the kanban board: parseHTML reads the data-*
// attributes (drawingHtmlDataFromElement) and renderHTML writes back exactly the
// HTML htmlFromMarkdown emits, which editor.getHTML() → htmlToMarkdown() saves.
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
})
