import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import {
  drawingFromHtmlData,
  drawingHtmlDataFromElement,
  drawingHtmlDataToMarkdown,
  drawingText,
  drawingToHtml,
  type DrawingHtmlData,
} from '../../lib/drawing/drawingBlock'
import { DrawingBlockView } from './DrawingBlockView'
import { DRAWING_NODE_NAME, caretBesideDrawing, editDrawingAt, selectedDrawingPos } from './drawingCommands'

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
/** Arrow out of a selected drawing at the edge of the document: a paragraph is made there. */
function leaveDrawing(editor: import('@tiptap/core').Editor, side: 'after' | 'before'): boolean {
  const pos = selectedDrawingPos(editor.state.selection)
  if (pos === null) return false
  const { doc } = editor.state
  const atEdge = side === 'after' ? pos + doc.nodeAt(pos)!.nodeSize >= doc.content.size : pos === 0
  if (!atEdge) return false
  // Through a command (its own transaction): also right when run inside another command.
  return editor.commands.command(({ tr }) => {
    caretBesideDrawing(tr, pos, side).scrollIntoView()
    return true
  })
}

/** Ctrl+End / Ctrl+Home when the document ends / starts with a drawing: the caret goes beyond it. */
function pastEdgeDrawing(editor: import('@tiptap/core').Editor, side: 'after' | 'before'): boolean {
  const { doc } = editor.state
  const edge = side === 'after' ? doc.lastChild : doc.firstChild
  if (!edge || edge.type.name !== DRAWING_NODE_NAME) return false
  const pos = side === 'after' ? doc.content.size - edge.nodeSize : 0
  return editor.commands.command(({ tr }) => {
    caretBesideDrawing(tr, pos, side).scrollIntoView()
    return true
  })
}

export const DrawingBlock = Node.create({
  name: DRAWING_NODE_NAME,
  // Top level only, as boards (see editorExtensions.ts → TopLevelDocument).
  group: 'topBlock',
  atom: true,
  selectable: true,
  draggable: false,

  // The section this editor shows (set by Editor.tsx): a drawing session writes to it by
  // identity when its node view is gone (see stores/drawingEditorStore.ts).
  addStorage() {
    return { target: null as { noteId: string; sectionId: string | null } | null }
  },

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
      // At the edge of the document there is no block to move the caret to: the arrows
      // make one (elsewhere they move as usual).
      ArrowDown: ({ editor }) => leaveDrawing(editor, 'after'),
      ArrowRight: ({ editor }) => leaveDrawing(editor, 'after'),
      ArrowUp: ({ editor }) => leaveDrawing(editor, 'before'),
      ArrowLeft: ({ editor }) => leaveDrawing(editor, 'before'),
      // Ctrl+End / Ctrl+Home go to the last / first TEXT position, which is above a drawing
      // that ends the document (below one that starts it): go past the drawing instead.
      'Mod-End': ({ editor }) => pastEdgeDrawing(editor, 'after'),
      'Mod-Home': ({ editor }) => pastEdgeDrawing(editor, 'before'),
    }
  },

  // A selected drawing is never REPLACED by what is typed, pasted or composed: only
  // Backspace / Delete remove it. The text goes to a paragraph right below it. (The
  // default of ProseMirror for a node selection is to replace the node — with a drawing
  // ending a section, Ctrl+End and typing wiped it.)
  //
  // The guard moves the SELECTION first — into an empty paragraph below the drawing — on
  // the DOM events that announce input (keypress of a printable key, paste with content,
  // compositionstart), and lets the input go on from there. It must not wait for
  // handleTextInput: TipTap's input-rules plugin is always first in that chain, and with a
  // node selection it reads the text of the blocks ABOVE as "text before the caret" — a
  // key completing a rule (`*` after "see *note", `#` + space…) replaced that range and
  // the drawing with it. Once the caret is in a paragraph of its own, rules see only that
  // paragraph. The handleTextInput below is kept for input that arrives with no such
  // event (it only runs when no rule fired).
  addProseMirrorPlugins() {
    type View = import('@tiptap/pm/view').EditorView
    /** The paragraph the guard made for input that then never came (removed again). */
    let made: { view: View; pos: number } | null = null
    const moveBelow = (view: View): boolean => {
      const pos = selectedDrawingPos(view.state.selection)
      if (pos === null || !view.editable) return false
      const before = view.state.doc.childCount
      view.dispatch(caretBesideDrawing(view.state.tr, pos, 'after', '', true))
      made = view.state.doc.childCount > before ? { view, pos: view.state.selection.from - 1 } : null
      return true
    }
    /** Nothing was written into the paragraph the guard made: take it out again (an empty
     *  paragraph before a list or a table would change the note's markdown). */
    const dropIfUnused = () => {
      const m = made
      made = null
      if (!m || m.view.isDestroyed) return
      const { state } = m.view
      const node = state.doc.nodeAt(m.pos)
      if (!node || node.type.name !== 'paragraph' || node.content.size > 0) return
      if (state.selection.from !== m.pos + 1 || !state.selection.empty) return
      const drawing = m.pos > 0 ? state.doc.resolve(m.pos).nodeBefore : null
      if (drawing?.type.name !== DRAWING_NODE_NAME) return
      const tr = state.tr.delete(m.pos, m.pos + node.nodeSize)
      m.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, m.pos - drawing.nodeSize)).setMeta('addToHistory', false))
    }
    return [
      new Plugin({
        key: new PluginKey('drawingBlockGuard'),
        props: {
          // A printable key (ProseMirror only calls this for those): before any text input
          // handling, input rules included.
          handleKeyPress: (view) => { moveBelow(view); made = null; return false },
          handleTextInput: (view, _from, _to, text) => {
            const pos = selectedDrawingPos(view.state.selection)
            if (pos === null || !view.editable) return false
            view.dispatch(caretBesideDrawing(view.state.tr, pos, 'after', text).scrollIntoView())
            return true
          },
          handleDOMEvents: {
            // Before the editor's own paste / IME handling, which then act on the caret in
            // the new paragraph instead of on the selected node. Only when there is
            // something to put there; a paste or a composition that ends up writing
            // nothing leaves no paragraph behind.
            paste: (view, event) => {
              const data = (event as ClipboardEvent).clipboardData
              const hasContent = !!data && (data.files.length > 0 || Array.from(data.types).length > 0)
              if (hasContent && moveBelow(view)) setTimeout(dropIfUnused, 0)
              return false
            },
            compositionstart: (view) => { moveBelow(view); return false },
            compositionend: () => { setTimeout(dropIfUnused, 0); return false },
          },
        },
      }),
    ]
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
