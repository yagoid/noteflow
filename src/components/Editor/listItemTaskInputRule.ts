import { InputRule } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode, type NodeType } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { canJoin } from '@tiptap/pm/transform'

/** `[ ] `, `[x] ` or `[X] ` (`[] ` too, like the stock rule) at the start of a list item. */
const listItemTaskInputRegex = /^\s*\[([ xX]?)\]\s$/

/**
 * Turns the bullet (or numbered) list item the caret is in into a task item
 * when `[ ] ` / `[x] ` is typed at the very start of its text — i.e. typing
 * `- [ ] ` live gives a checkbox, the same thing htmlFromMarkdown builds when
 * the `.md` is reopened (before, the editor showed a bullet with a literal
 * `[ ]` that was saved as a task).
 *
 * The stock TaskItem rule can't do it: it is a wrappingInputRule, and a
 * listItem must open with a paragraph, so there is nothing it can wrap. This
 * one rebuilds the list instead. A list can't mix bullet and task items, so
 * only the current item converts: the siblings before / after it stay in a
 * list of the original type (a numbered tail restarts at 1, like the `.md`;
 * a save + reopen gives the three lists back as they were). The item keeps
 * its nested children, and the new task list joins an adjacent task list, so
 * converting the bullets one by one ends in a single list.
 *
 * A plain InputRule, so `undoInputRule` (Backspace right after) puts the
 * literal `[ ] ` back like any other input rule.
 *
 * Port of the mobile app's rule (noteflow-mobile, editor-web/extensions/DeadlineTaskItem.ts).
 */
export function listItemToTaskInputRule(taskItemType: NodeType): InputRule {
  return new InputRule({
    find: listItemTaskInputRegex,
    handler: ({ state, range, match }) => {
      const taskListType = state.schema.nodes.taskList
      const $from = state.doc.resolve(range.from)
      // doc > … > list > listItem > paragraph, with the match at the start of
      // the item's first paragraph.
      const itemDepth = $from.depth - 1
      if (!taskListType || itemDepth < 2 || $from.parentOffset !== 0) return null
      if ($from.node(itemDepth).type.name !== 'listItem' || $from.index(itemDepth) !== 0) return null
      if (!taskItemType.validContent($from.node(itemDepth).content)) return null

      const { tr } = state
      tr.delete(range.from, range.to)

      const $start = tr.doc.resolve(range.from)
      const item = $start.node(itemDepth)
      const list = $start.node(itemDepth - 1)
      const listPos = $start.before(itemDepth - 1)
      const index = $start.index(itemDepth - 1)

      const siblings: ProseMirrorNode[] = []
      list.forEach((child) => siblings.push(child))
      const before = siblings.slice(0, index)
      const after = siblings.slice(index + 1)
      const tailAttrs = 'start' in list.attrs ? { ...list.attrs, start: 1 } : list.attrs

      const taskList = taskListType.create(
        null,
        taskItemType.create({ checked: match[1] === 'x' || match[1] === 'X' }, item.content),
      )
      const nodes = [
        ...(before.length ? [list.type.create(list.attrs, before)] : []),
        taskList,
        ...(after.length ? [list.type.create(tailAttrs, after)] : []),
      ]

      const listIndex = $start.index(itemDepth - 2)
      if (!$start.node(itemDepth - 2).canReplace(listIndex, listIndex + 1, Fragment.from(nodes))) {
        return null
      }

      tr.replaceWith(listPos, listPos + list.nodeSize, nodes)

      // Caret at the start of the task's paragraph (taskList > taskItem > p),
      // where the rest of the item's text continues. Set before the joins:
      // the transaction maps it through them.
      const taskListPos = listPos + (before.length ? nodes[0].nodeSize : 0)
      tr.setSelection(TextSelection.create(tr.doc, taskListPos + 3))

      // After first: joining there doesn't move the position of the one before.
      const isTaskList = (node: ProseMirrorNode | null) => node?.type === taskListType
      const taskListEnd = taskListPos + taskList.nodeSize
      if (isTaskList(tr.doc.resolve(taskListEnd).nodeAfter) && canJoin(tr.doc, taskListEnd)) {
        tr.join(taskListEnd)
      }
      if (isTaskList(tr.doc.resolve(taskListPos).nodeBefore) && canJoin(tr.doc, taskListPos)) {
        tr.join(taskListPos)
      }
    },
  })
}
