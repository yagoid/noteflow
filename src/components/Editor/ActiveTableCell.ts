import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { activeCellRange } from '../../lib/tableActiveCell'

/** Class of the table cell holding the caret (styled in index.css § Tables). */
export const ACTIVE_CELL_CLASS = 'nf-active-cell'

const activeTableCellKey = new PluginKey('activeTableCell')

/**
 * Marks the table cell that holds the caret with ACTIVE_CELL_CLASS, so the CSS
 * can outline it while the editor has focus (`.ProseMirror-focused`). A node
 * decoration only: no schema change, nothing reaches the saved markdown.
 */
export const ActiveTableCell = Extension.create({
  name: 'activeTableCell',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: activeTableCellKey,
        props: {
          decorations(state) {
            const cell = activeCellRange(state.selection)
            if (!cell) return null
            return DecorationSet.create(state.doc, [
              Decoration.node(cell.from, cell.to, { class: ACTIVE_CELL_CLASS }),
            ])
          },
        },
      }),
    ]
  },
})
