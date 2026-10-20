import { Extension } from '@tiptap/core'
import { createAutoCloseBracketsPlugin, deleteAutoClosedPair } from '../../lib/autoCloseBrackets'

/**
 * IDE-style auto-closing of `()` (see lib/autoCloseBrackets.ts for the rules).
 * Applies everywhere text is typed, code blocks and inline code included.
 */
export const AutoCloseBrackets = Extension.create({
  name: 'autoCloseBrackets',

  // Above the core keymap (priority 100), whose Backspace would otherwise join
  // or delete a single character before ours runs. Ours only fires inside an
  // empty auto-inserted pair, so it can't shadow any other Backspace behaviour.
  priority: 200,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        if (editor.view.composing) return false
        return deleteAutoClosedPair(editor.state, editor.view.dispatch)
      },
    }
  },

  addProseMirrorPlugins() {
    return [createAutoCloseBracketsPlugin()]
  },
})
