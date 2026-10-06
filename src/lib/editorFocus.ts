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

/**
 * Whether the user is working inside this editor: ProseMirror itself has focus,
 * or focus sits on anything inside its DOM — e.g. a kanban board root or a card
 * textarea, which ProseMirror doesn't count as focused (`editor.isFocused` is
 * false there). The external-content sync must skip while this is true: the
 * debounced save makes the store lag behind the editor, and resetting the
 * content then would drop the edits made in between.
 *
 * The DOM branch only counts while the document has focus (pass
 * `document.hasFocus()`): activeElement stays on the board root after the
 * window goes to the background, and skipping then would leave the editor stale
 * against updates from a sticky window or a sync pull (the next board edit would
 * save the stale content over them). An open card field commits on that blur.
 */
export function editorOwnsFocus(
  proseMirrorFocused: boolean,
  documentHasFocus: boolean,
  viewDom: { contains(node: unknown): boolean },
  active: unknown,
): boolean {
  return proseMirrorFocused || (documentHasFocus && active != null && viewDom.contains(active))
}
