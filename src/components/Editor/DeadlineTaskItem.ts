import TaskItem, { type TaskItemOptions } from '@tiptap/extension-task-item'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { DeadlineTaskItemView } from './DeadlineTaskItemView'

export const DeadlineTaskItem = TaskItem.extend<TaskItemOptions & { plain: boolean }>({
  // Must keep the same name so TaskList can resolve this node type
  name: 'taskItem',

  addOptions() {
    return {
      ...this.parent?.(),
      nested: false,
      // Linked notes (plain Markdown): no deadline / alarm / importance pickers.
      plain: false,
    }
  },

  addAttributes() {
    return {
      // Inherit the 'checked' attribute from TaskItem
      ...this.parent?.(),
      due: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-due') || null,
        renderHTML: (attrs) => (attrs.due ? { 'data-due': attrs.due } : {}),
      },
      alarm: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-alarm') || null,
        renderHTML: (attrs) => (attrs.alarm ? { 'data-alarm': attrs.alarm } : {}),
      },
      importance: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-importance') || null,
        renderHTML: (attrs) =>
          attrs.importance ? { 'data-importance': attrs.importance } : {},
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Enter: () => {
        const handled = this.editor.commands.splitListItem(this.name)

        if (handled) {
          const { $from } = this.editor.state.selection
          if ($from.node(-1)?.type.name === this.name) {
            this.editor.commands.updateAttributes(this.name, { due: null, alarm: null, importance: null })
          }
        }

        return handled
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(DeadlineTaskItemView)
  },
})
