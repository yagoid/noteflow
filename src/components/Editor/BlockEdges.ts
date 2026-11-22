import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { SuggestionPluginKey } from '@tiptap/suggestion'
import { caretBesideBlock, edgeBlockPos, edgeBlockToLeave, type EdgeAxis, type EdgeSide } from '../../lib/blockEdges'

/**
 * A caret beside a table, code block or atom (kanban board, drawing, rule) that starts
 * or ends the section (rules in lib/blockEdges.ts). With no gap cursor in the editor
 * there is no place for it there: ↑/← at the start of such a block that starts the
 * document make an empty paragraph above it (with the caret in it), ↓/→ at the end of
 * one that ends it make one below — as a selected drawing already did. A click in the
 * empty space below the last block (the editor's bottom padding) or above the first
 * does the same. Elsewhere the keys and clicks are the editor's.
 *
 * Read-only editors never get a paragraph. While the "/" menu is open its arrows win.
 * Priority above the default 100 so the arrows run before the table plugin's and the
 * code block's own (which, at the edge of the document, leave the caret where it is).
 */
export const BlockEdges = Extension.create({
  name: 'blockEdges',

  priority: 160,

  addKeyboardShortcuts() {
    const leave = (side: EdgeSide, axis: EdgeAxis) => () => {
      const { editor } = this
      const { view, state } = editor
      if (!editor.isEditable || view.composing || SuggestionPluginKey.getState(state)?.active) return false
      const pos = edgeBlockToLeave(state.selection, side, axis)
      if (pos === null) return false
      // ↑/↓ from a text block only on its first / last visual line (a long cell wraps).
      if (axis === 'vert' && !(state.selection instanceof NodeSelection)
        && !view.endOfTextblock(side === 'before' ? 'up' : 'down')) return false
      view.dispatch(caretBesideBlock(state.tr, pos, side).scrollIntoView())
      return true
    }
    return {
      ArrowUp: leave('before', 'vert'),
      ArrowLeft: leave('before', 'horiz'),
      ArrowDown: leave('after', 'vert'),
      ArrowRight: leave('after', 'horiz'),
    }
  },

  addProseMirrorPlugins() {
    // A plain click past the edge block — in the editor's own padding, outside every
    // block — puts the caret beside it. The block's box is measured from its DOM.
    const clickBeside = (view: EditorView, event: MouseEvent): boolean => {
      if (!view.editable || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false
      const { doc } = view.state
      for (const side of ['after', 'before'] as const) {
        const pos = edgeBlockPos(doc, side)
        if (pos === null) continue
        const dom = view.nodeDOM(pos)
        if (!(dom instanceof HTMLElement)) continue
        const box = dom.getBoundingClientRect()
        if (side === 'after' ? event.clientY <= box.bottom : event.clientY >= box.top) continue
        view.dispatch(caretBesideBlock(view.state.tr, pos, side))
        view.focus()
        return true
      }
      return false
    }
    return [
      new Plugin({
        key: new PluginKey('blockEdges'),
        props: {
          handleClick: (view, _pos, event) => clickBeside(view, event),
        },
      }),
    ]
  },
})
