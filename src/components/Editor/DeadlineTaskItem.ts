import TaskItem, { type TaskItemOptions } from '@tiptap/extension-task-item'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DeadlineTaskItemView } from './DeadlineTaskItemView'
import { agentMarkerChanges, dedupeAgentMarkers } from '../../lib/agentTaskNodes'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { agentNoteId } from './useAgentTask'
import { listItemToTaskInputRule } from './listItemTaskInputRule'

export const DeadlineTaskItem = TaskItem.extend<TaskItemOptions & { plain: boolean }, { noteId: string | null }>({
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

  // The note this editor shows (set by Editor.tsx -> setAgentNoteId): the agent
  // actions of a task, and of a kanban card, need it to reach the note's
  // agent.md. Null in an editor that belongs to no note.
  addStorage() {
    return { noteId: null }
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
      // Carried through every edit and written back by htmlToMarkdown; shown as
      // the task's agent chip (AgentTaskChip.tsx). NOT one of the attributes
      // the pickers clear: only the agent-task actions touch it. `keepOnSplit: false`: Enter inside a task
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

  addInputRules() {
    // Stock rule: `[ ] ` at the start of a plain paragraph. Ours: the same
    // inside a bullet / numbered list item, where the stock one can't apply.
    return [...(this.parent?.() ?? []), listItemToTaskInputRule(this.type)]
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Enter: () => {
        const handled = this.editor.commands.splitListItem(this.name)

        if (handled) {
          const { $from } = this.editor.state.selection
          if ($from.node(-1)?.type.name === this.name) {
            // Everything a task carries — its checkbox, deadline, alarm,
            // importance and agent marker — stays with the task's TEXT. Enter
            // at the very start of a task leaves an empty item above and moves
            // the text down: all of it goes down with the text and the empty
            // item above is a blank task. Anywhere else the first item keeps
            // it all and the new one starts without a deadline, alarm or
            // importance (unchecked and unmarked already: `keepOnSplit: false`).
            const depth = $from.depth - 1
            const index = $from.index(depth - 1)
            const prev = index > 0 ? $from.node(depth - 1).child(index - 1) : null
            const itemPos = $from.before(depth)
            const item = $from.node(depth)
            const blank = { checked: false, due: null, alarm: null, importance: null, agentId: null, agentState: null }
            const splitAtStart = !!prev && prev.type.name === this.name && prev.childCount === 1 &&
              prev.firstChild?.content.size === 0
            // One transaction (both items or neither).
            this.editor.commands.command(({ tr }) => {
              if (splitAtStart && prev) {
                const carried = Object.fromEntries(Object.keys(blank).map((key) => [key, prev.attrs[key]]))
                tr.setNodeMarkup(itemPos - prev.nodeSize, undefined, { ...prev.attrs, ...blank })
                tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, ...carried })
              } else {
                tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, due: null, alarm: null, importance: null })
              }
              return true
            })
          }
        }

        return handled
      },
    }
  },

  // The block follows the line (agentTasksStore.followLines): every edit of
  // this editor that changes an agent marker — of a task item or a kanban card:
  // an action of the report, the checkbox, an undo / redo — reaches the task's
  // block in agent.md once it is saved. So a Ctrl+Z never leaves the line and
  // the report saying different things, and one that brings back a discarded
  // task brings back its report. The edits that are saved are the ones
  // followed: content from disk (`preventUpdate`) is someone else's change.
  onTransaction({ transaction }) {
    if (!transaction.docChanged || transaction.getMeta('preventUpdate')) return
    const noteId = agentNoteId(this.editor)
    if (!noteId) return
    const changes = agentMarkerChanges(transaction.before, this.editor.state.doc)
    if (!changes) return
    // After the dispatch, once the editor's update has scheduled the save the reconcile waits for.
    queueMicrotask(() => useAgentTasksStore.getState().followLines(noteId, changes))
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
