import TaskItem, { type TaskItemOptions } from '@tiptap/extension-task-item'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DeadlineTaskItemView } from './DeadlineTaskItemView'
import { dedupeAgentMarkers } from '../../lib/agentTaskNodes'

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
      // Agent-task marker (🤖<id>:<state> on the task's line, lib/agentTasks.ts).
      // Carried through every edit and written back by htmlToMarkdown; no UI
      // of its own here. NOT one of the attributes the pickers clear: only the
      // agent-task actions touch it. `keepOnSplit: false`: Enter inside a task
      // must not give the new item the same id (an id is unique).
      agentId: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-agent-id') || null,
        renderHTML: (attrs) => (attrs.agentId && attrs.agentState ? { 'data-agent-id': attrs.agentId } : {}),
      },
      agentState: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => (el.getAttribute('data-agent-id') ? el.getAttribute('data-agent-state') || null : null),
        renderHTML: (attrs) => (attrs.agentId && attrs.agentState ? { 'data-agent-state': attrs.agentState } : {}),
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
            // The agent marker stays with the task's TEXT: Enter at the very
            // start of a marked task leaves an empty item above and moves the
            // text down — the marker goes down with it. Otherwise the new item
            // has none (the first one keeps it).
            const depth = $from.depth - 1
            const index = $from.index(depth - 1)
            const prev = index > 0 ? $from.node(depth - 1).child(index - 1) : null
            const moved = prev && prev.type.name === this.name && prev.attrs.agentId && prev.childCount === 1 &&
              prev.firstChild?.content.size === 0
              ? { agentId: prev.attrs.agentId, agentState: prev.attrs.agentState }
              : null
            if (moved && prev) {
              // One transaction of its own (both items or neither), before the
              // reset below and independent of it.
              const itemPos = $from.before(depth)
              const item = $from.node(depth)
              this.editor.commands.command(({ tr }) => {
                tr.setNodeMarkup(itemPos - prev.nodeSize, undefined, { ...prev.attrs, agentId: null, agentState: null })
                tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, ...moved })
                return true
              })
            }
            this.editor.commands.updateAttributes(this.name, { due: null, alarm: null, importance: null })
          }
        }

        return handled
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      // A paste (or a copy-drop) of a task that carries an agent marker would
      // leave its id on two items: the pasted copy loses the marker, the item
      // that was already there keeps it. A cut-and-paste (a move) duplicates
      // nothing and is left alone. Only user paste/drop: content that arrives
      // from disk (a sync merge can leave an id on two lines) is never touched.
      new Plugin({
        key: new PluginKey('agentMarkerDedupe'),
        appendTransaction: (transactions, oldState, newState) => {
          const pasted = transactions.some((tr) => {
            if (!tr.docChanged) return false
            const uiEvent = tr.getMeta('uiEvent')
            return tr.getMeta('paste') === true || uiEvent === 'paste' || uiEvent === 'drop'
          })
          if (!pasted) return null
          return dedupeAgentMarkers(newState.tr, oldState.doc, (pos) => {
            let mapped = pos
            for (const tr of transactions) {
              const res = tr.mapping.mapResult(mapped, 1)
              if (res.deleted) return null
              mapped = res.pos
            }
            return mapped
          })
        },
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DeadlineTaskItemView)
  },
})
