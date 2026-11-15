import { Extension } from '@tiptap/core'
import { moveItemBy } from '../../lib/listItemMove'

/**
 * Alt+↑ / Alt+↓: move the list item around the caret (task, bullet or
 * numbered; with its sub-items) above its previous / below its next sibling —
 * one transaction, one Ctrl+Z (lib/listItemMove.ts). Outside a list, at the
 * ends of one or in a read-only editor the keys pass through.
 */
export const ListItemMove = Extension.create({
  name: 'listItemMove',

  addKeyboardShortcuts() {
    const move = (dir: -1 | 1) => () => {
      if (!this.editor.isEditable) return false
      const tr = moveItemBy(this.editor.state, dir)
      if (!tr) return false
      this.editor.view.dispatch(tr)
      return true
    }
    return { 'Alt-ArrowUp': move(-1), 'Alt-ArrowDown': move(1) }
  },
})
