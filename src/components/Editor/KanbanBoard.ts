import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { kanbanDataFromElement, kanbanDataToHtml, type KanbanBoardData } from '../../lib/kanban'
import { KANBAN_NODE_NAME, boardToText, normalizeBoard } from '../../lib/kanbanOps'
import { KanbanBoardView } from './KanbanBoardView'

// In-note kanban board (format + md↔html: lib/kanban.ts; state transforms:
// lib/kanbanOps.ts). A block ATOM: ProseMirror never sees the cards as content —
// the whole board lives in one JSON-safe attribute (`board`) and the React
// NodeView edits it only through updateAttributes, so every change is a normal
// transaction (undo/redo, autosave, collaboration with the sync effect).
//
// Lossless round-trip: parseHTML reads the board from the data-* attributes of
// htmlFromMarkdown's `div[data-type="kanban"]` (kanbanDataFromElement) and
// renderHTML writes back EXACTLY that HTML (kanbanDataToHtml), which is what
// editor.getHTML() → htmlToMarkdown() serializes on save. Same path for paste
// (markdown → htmlFromMarkdown → parseSlice) and for copying a selected board.

export const KanbanBoard = Node.create({
  name: KANBAN_NODE_NAME,
  // Its own group, accepted only by the document (see Editor.tsx): a board
  // nested in a list item, quote or table cell would be dropped by the markdown
  // serializer, so ProseMirror must keep boards at the top level (pasting one
  // inside a list splits the list around it).
  group: 'topBlock',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      board: {
        default: { attrs: '', done: null, columns: [] } satisfies KanbanBoardData,
        parseHTML: (el) => kanbanDataFromElement(el),
        // Rendered as a whole by renderHTML below.
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="kanban"]' }]
  },

  renderHTML({ node }) {
    // Build the exact structure htmlFromMarkdown emits (data-* = source of
    // truth for htmlToMarkdown) instead of mirroring it as a DOMOutputSpec.
    const template = document.createElement('template')
    template.innerHTML = kanbanDataToHtml(normalizeBoard(node.attrs.board))
    return template.content.firstElementChild as HTMLElement
  },

  // Plain-text form (clipboard text/plain, editor.getText()): the markdown.
  renderText({ node }) {
    return boardToText(normalizeBoard(node.attrs.board))
  },

  addNodeView() {
    return ReactNodeViewRenderer(KanbanBoardView, {
      // ProseMirror must leave everything inside the board alone (inputs,
      // pointer drags, clicks, keys): the NodeView owns it — its header handle
      // selects the node explicitly (Backspace/Delete then removes it, as any
      // atom). Events on the wrapper outside `.kanban-board` fall through.
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null
        return !!target?.closest?.('[data-kanban-interactive]')
      },
      ignoreMutation: () => true,
    })
  },
})
