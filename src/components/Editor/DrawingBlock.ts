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
    // The paragraph the guard made for input that is about to come: its position, kept in
    // the plugin state and mapped through every transaction. If the selection leaves it
    // while it is still empty — a paste that inserted nothing, a cancelled composition, a
    // key that typed nothing — it is taken out again (an empty paragraph before a list or a
    // table would change the note's markdown). No timers: whatever inserts something later
    // (an image read asynchronously) still finds the caret in it. Making and removing it
    // stay out of the undo history, so neither leaves a step that undoes nothing.
    const guardKey = new PluginKey<number | null>('drawingBlockGuard')
    const emptyParagraphAt = (doc: import('@tiptap/pm/model').Node, pos: number | null): boolean => {
      if (pos === null || pos < 0 || pos > doc.content.size) return false
      const node = doc.nodeAt(pos)
      return !!node && node.type.name === 'paragraph' && node.content.size === 0
    }
    const moveBelow = (view: View): boolean => {
      const pos = selectedDrawingPos(view.state.selection)
      if (pos === null || !view.editable) return false
      const before = view.state.doc.childCount
      const tr = caretBesideDrawing(view.state.tr, pos, 'after', '', true)
      const madeOne = tr.doc.childCount > before
      if (madeOne) tr.setMeta(guardKey, tr.selection.from - 1).setMeta('addToHistory', false)
      view.dispatch(tr)
      return true
    }
    return [
      new Plugin<number | null>({
        key: guardKey,
        state: {
          init: () => null,
          apply(tr, made, _old, state) {
            const set = tr.getMeta(guardKey) as number | null | undefined
            if (set !== undefined) return set
            if (made === null) return null
            const pos = tr.mapping.map(made)
            const node = pos <= state.doc.content.size ? state.doc.nodeAt(pos) : null
            if (!node || node.type.name !== 'paragraph') return null
            // Written into and left: it is the user's paragraph now.
            const inside = state.selection.from >= pos && state.selection.to <= pos + node.nodeSize
            return node.content.size > 0 && !inside ? null : pos
          },
        },
        appendTransaction(_trs, _old, state) {
          const made = guardKey.getState(state) ?? null
          if (!emptyParagraphAt(state.doc, made) || made === null) return null
          const node = state.doc.nodeAt(made)!
          if (state.selection.from >= made && state.selection.to <= made + node.nodeSize) return null
          return state.tr.delete(made, made + node.nodeSize).setMeta(guardKey, null).setMeta('addToHistory', false)
        },
        props: {
          // A key that types a character (not Alt+letter, not a control character): before
          // any text input handling, input rules included. AltGr — Ctrl+Alt, how many
          // layouts type @ # [ — does type.
          handleKeyPress: (view, event) => {
            if (event.charCode < 32 || (event.altKey && !event.ctrlKey) || event.metaKey) return false
            moveBelow(view)
            return false
          },
          handleTextInput: (view, _from, _to, text) => {
            const pos = selectedDrawingPos(view.state.selection)
            if (pos === null || !view.editable) return false
            view.dispatch(caretBesideDrawing(view.state.tr, pos, 'after', text).scrollIntoView())
            return true
          },
          handleDOMEvents: {
            // Before the editor's own paste / IME handling, which then act on the caret in
            // the new paragraph instead of on the selected node. Text and HTML only: pasted
            // or dropped FILES (images) are inserted by Editor.tsx after reading them, and
            // it steps off a selected drawing itself at that moment (leaveSelectedDrawing).
            paste: (view, event) => {
              const data = (event as ClipboardEvent).clipboardData
              const types = data ? Array.from(data.types) : []
              if (types.some((t) => t === 'text/plain' || t === 'text/html')) moveBelow(view)
              return false
            },
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
