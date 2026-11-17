import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { CalendarClock, GripVertical } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { badgeColorClass, formatBadgeDate, type Importance } from './taskBadge'
import { TaskMenuPopover } from './TaskPickers'
import { startTaskDrag } from './taskDrag'
import { setTaskChecked } from './taskToggle'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { altKey } from '../../lib/platform'

export function DeadlineTaskItemView({ node, editor, getPos, updateAttributes, extension }: NodeViewProps) {
  const t = useT()
  // Plain Markdown (a linked note): a regular checkbox item, no 📅⏰🔺 pickers.
  const plain = !!(extension.options as { plain?: boolean }).plain
  const { checked, due, alarm, importance } = node.attrs as {
    checked: boolean
    due: string | null
    alarm: string | null
    importance: Importance | null
  }

  const importanceLabels: Record<Importance, string> = {
    low: t.editor.task.importanceLow,
    medium: t.editor.task.importanceMedium,
    high: t.editor.task.importanceHigh,
  }

  // The trigger the task menu (importance + deadline, TaskPickers.tsx) hangs
  // from while it's open — the single button right of the text.
  const [menuTrigger, setMenuTrigger] = useState<HTMLElement | null>(null)
  const [isSticky, setIsSticky] = useState(false)
  const wrapperRef = useRef<HTMLElement>(null)
  // Whether the menu was open when the trigger was pressed: that press already
  // closed it (through the menu's own close, which writes its field drafts), so
  // the click that follows must not reopen it.
  const openOnPress = useRef(false)

  // Detect if we're inside a sticky-editor
  useEffect(() => {
    const el = wrapperRef.current
    if (el) setIsSticky(!!el.closest('.sticky-editor'))
  }, [])

  // Closed from the keyboard (Escape/Enter/"Done"): the focus goes back to the
  // text, where it was before opening. A click outside leaves it where it lands.
  function closeMenu(fromKeyboard: boolean) {
    setMenuTrigger(null)
    if (fromKeyboard && editor.isEditable) editor.view.focus()
  }

  const triggerTitle = [
    importance && tf(t.editor.task.importanceTooltip, { level: importanceLabels[importance] }),
    due && `${tf(t.editor.task.deadlineTooltip, { date: due })}${alarm ? ' ⏰' + alarm : ''}`,
  ].filter(Boolean).join(' · ') || t.editor.task.menu

  // Checkbox: with "Move checked items to the bottom" (Settings → Editor) the
  // task also moves, in the same transaction, and slides there (taskToggle.ts).
  // The setting is read at click time: no re-render of every task when it changes.
  function toggleChecked() {
    const pos = getPos()
    if (typeof pos !== 'number') return
    setTaskChecked(editor, pos, !checked, useEditorSettingsStore.getState().moveCheckedToBottom)
  }

  return (
    <NodeViewWrapper
      as="li"
      ref={wrapperRef}
      data-type="taskItem"
      data-checked={String(checked)}
    >
      {/* Drag handle: out of the flow, in the gutter left of the checkbox (index.css),
          so it never pushes the text. A <button> so ProseMirror's NodeView stopEvent
          leaves the press alone; mousedown is prevented to keep the editor's focus
          and selection. Not in read-only editors. */}
      {editor.isEditable && (
        <button
          type="button"
          className="task-drag-handle"
          contentEditable={false}
          tabIndex={-1}
          title={tf(t.editor.task.dragHandle, { keys: `${altKey}+↑/↓` })}
          aria-label={tf(t.editor.task.dragHandle, { keys: `${altKey}+↑/↓` })}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => startTaskDrag(editor, getPos, e.nativeEvent, wrapperRef.current)}
        >
          <GripVertical size={12} />
        </button>
      )}

      <label className="task-checkbox-label" contentEditable={false}>
        <input
          type="checkbox"
          checked={checked}
          onChange={toggleChecked}
        />
      </label>

      <div className="task-item-body group">
        <NodeViewContent as="div" className="task-content" />

        {!plain && <div className="task-actions" contentEditable={false}>
          {/* One trigger for importance + deadline: the chips of the values set
              (always visible), or a hover-only icon when there are none. */}
          <button
            contentEditable={false}
            className={`task-meta-trigger${due || importance ? ' has-value' : ''}${menuTrigger ? ' is-open' : ''}`}
            onMouseDown={() => { openOnPress.current = !!menuTrigger }}
            onClick={(e) => {
              if (openOnPress.current) {
                openOnPress.current = false
                return
              }
              setMenuTrigger(e.currentTarget)
            }}
            title={triggerTitle}
            aria-label={triggerTitle}
            aria-haspopup="dialog"
            aria-expanded={!!menuTrigger}
            type="button"
          >
            {importance && (
              <span className={`task-importance-dot task-importance-dot--${importance}`} />
            )}
            {due && (
              <span className={`task-badge ${badgeColorClass(due)}`}>
                📅 {formatBadgeDate(due)}
                {alarm && !isSticky && <> ⏰{alarm}</>}
              </span>
            )}
            {!due && !importance && <CalendarClock size={14} className="task-meta-icon" />}
          </button>
        </div>}
      </div>

      {menuTrigger && (
        <TaskMenuPopover
          trigger={menuTrigger}
          due={due}
          alarm={alarm}
          importance={importance}
          onChange={(patch) => updateAttributes(patch)}
          onClose={closeMenu}
        />
      )}
    </NodeViewWrapper>
  )
}
