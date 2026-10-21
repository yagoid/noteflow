// Focus/event ownership helpers for the TipTap editor (components/Editor/Editor.tsx).
// Kept DOM-shape-only (closest/contains) so they're unit-testable without a DOM.

/**
 * Editor UI that is NOT ProseMirror text: NodeView widgets with their own fields
 * (the kanban board) and the popups they portal to <body> (kanban menu, task
 * deadline/importance pickers). Events born there must not drive the editor's
 * own wrapper handlers (image paste/drop, Ctrl+Shift+B…), which act on the
 * ProseMirror selection — possibly a NodeSelection on the very board.
 */
export const EDITOR_WIDGET_SELECTOR =
  '[data-kanban-interactive], .kanban-menu, .task-deadline-popover, .task-importance-popover'

interface ClosestTarget {
  closest(selector: string): unknown
}

export function isEditorWidgetTarget(target: unknown): boolean {
  const el = target as Partial<ClosestTarget> | null
  return typeof el?.closest === 'function' && el.closest(EDITOR_WIDGET_SELECTOR) != null
}

const FIELD_TAGS = new Set(['TEXTAREA', 'INPUT', 'SELECT'])

/**
 * Whether focus sits in a text field of a NodeView widget inside this editor —
 * e.g. an open kanban card textarea, whose uncommitted draft lives outside
 * ProseMirror (`editor.isFocused` is false there). The external-content sync
 * defers replacing the document meanwhile and re-runs once focus leaves it
 * (the field commits on that blur). Focus on the board root itself doesn't
 * count: there's no draft to protect, and deferring would let the next board
 * edit save the stale document.
 *
 * Only counts while the document has focus (pass `document.hasFocus()`):
 * activeElement stays put after the window goes to the background, and an open
 * card field commits on that blur anyway.
 */
export function widgetFieldHasFocus(
  documentHasFocus: boolean,
  viewDom: { contains(node: unknown): boolean },
  active: unknown,
): boolean {
  if (!documentHasFocus || active == null || !viewDom.contains(active)) return false
  const { tagName, type } = active as { tagName?: unknown; type?: unknown }
  if (typeof tagName !== 'string' || !FIELD_TAGS.has(tagName.toUpperCase())) return false
  // A checkbox holds no draft (it applies on click).
  if (type === 'checkbox' || type === 'radio') return false
  return isEditorWidgetTarget(active)
}
