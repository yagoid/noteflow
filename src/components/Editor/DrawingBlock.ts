import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
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

/**
 * Enter (or Shift+Enter) on the selected drawing: a new line BELOW it — an empty paragraph
 * right after the drawing (the one already there if it is empty) with the caret in it. As
 * the guard's paragraph below, it starts an undo group of its own that the text typed next
 * joins. Always handled while a drawing is selected: the editor's own Enter would put the
 * paragraph ABOVE a drawing that starts the note (when more follows it), and its Shift+Enter would replace the
 * drawing with a line break.
 */
function newLineBelowDrawing(editor: import('@tiptap/core').Editor): boolean {
  const pos = selectedDrawingPos(editor.state.selection)
  if (pos === null) return false
  if (!editor.isEditable) return true
  return editor.commands.command(({ tr }) => {
    closeHistory(caretBesideDrawing(tr, pos, 'after', '', true)).scrollIntoView()
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
      // Enter on the selected drawing starts a line below it, as on any text: a note that
      // opens with the drawing selected (it is its first block) can be written right away.
      // Ctrl/Cmd+Enter opens it (as do a double click and its Edit button); Backspace /
      // Delete remove it, as any atom.
      Enter: ({ editor }) => newLineBelowDrawing(editor),
      'Shift-Enter': ({ editor }) => newLineBelowDrawing(editor),
      'Mod-Enter': ({ editor }) => {
        const { selection } = editor.state
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== DRAWING_NODE_NAME) return false
        // Handled even if there is nothing to open: the editor's own Mod-Enter (a line
        // break) would replace the selected drawing.
        editDrawingAt(editor, selection.from)
        return true
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
  // The guard makes that paragraph (or takes an empty one already there) and moves the
  // SELECTION into it on the DOM events that are certain to insert something — and lets
  // the input go on from there. It must not wait for handleTextInput: TipTap's input-rules
  // plugin is always first in that chain, and with a node selection it reads the text of
  // the blocks ABOVE as "text before the caret" — a key completing a rule (`*` after
  // "see *note", `#` + space…) replaced that range and the drawing with it. Once the caret
  // is in a paragraph of its own, rules see only that paragraph.
  //
  // There is nothing temporary about the paragraph: making it is an ordinary edit — a root
  // transaction that changes the document (TipTap emits `update`, so what is saved is
  // always what the editor shows) and that is in the undo history, as the start of a group
  // of its own which the input that follows joins: one Ctrl+Z takes back the text and the
  // paragraph together. Nothing removes it later (no timers, no appended transactions).
  addProseMirrorPlugins() {
    type View = import('@tiptap/pm/view').EditorView
    const moveBelow = (view: View): boolean => {
      const pos = selectedDrawingPos(view.state.selection)
      if (pos === null || !view.editable) return false
      view.dispatch(closeHistory(caretBesideDrawing(view.state.tr, pos, 'after', '', true)))
      return true
    }
    return [
      new Plugin({
        key: new PluginKey('drawingBlockGuard'),
        props: {
          // ProseMirror only calls this for a keypress it is going to act on (a charCode,
          // no Ctrl without Alt, no Cmd on macOS — editHandlers.keypress), and with a node
          // selection it then WRITES the character itself unless it is a line break. Same
          // condition here, so the paragraph is made exactly when a character follows —
          // with Alt as well: Option+key on macOS and AltGr elsewhere type [ ] { } # @ | ~.
          handleKeyPress: (view, event) => {
            if (/[\r\n]/.test(String.fromCharCode(event.charCode))) return false
            moveBelow(view)
            return false
          },
          // Text that arrives with no such event (it only runs when no input rule fired).
          handleTextInput: (view, _from, _to, text) => {
            const pos = selectedDrawingPos(view.state.selection)
            if (pos === null || !view.editable) return false
            view.dispatch(caretBesideDrawing(view.state.tr, pos, 'after', text).scrollIntoView())
            return true
          },
          handleDOMEvents: {
            // Before the editor's own paste / IME handling, which then act on the caret in
            // the new paragraph instead of on the selected node. A paste only when it
            // carries text or HTML (an empty one touches nothing); pasted or dropped FILES
            // (images) are inserted by Editor.tsx after reading them, which steps off a
            // selected drawing itself at that moment (leaveSelectedDrawing).
            paste: (view, event) => {
              const data = (event as ClipboardEvent).clipboardData
              if (data && (data.getData('text/plain') || data.getData('text/html'))) moveBelow(view)
              return false
            },
            // A composition that is then cancelled leaves the (empty) paragraph: an
            // ordinary edit, undoable.
            compositionstart: (view) => { moveBelow(view); return false },
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
