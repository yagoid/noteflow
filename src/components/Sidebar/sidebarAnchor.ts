// Content anchors for the floating sidebar (SidebarShell.tsx). An anchor is the
// box where a view's text lives — the editor's scroller wrapper (below the
// toolbar), the raw-mode textarea, an overview's scroll body (below its header).
// The floating panel and the mini-view line up with the leftmost anchor on
// screen. Anchors carry SIDEBAR_ANCHOR_ATTR and use `sidebarAnchorRef` as their
// (stable) callback ref, so the shell re-measures when one mounts or unmounts —
// no subtree MutationObserver over the editor needed.

export const SIDEBAR_ANCHOR_ATTR = 'data-sidebar-anchor'

const listeners = new Set<() => void>()

/** Subscribe to anchors mounting/unmounting. Returns the unsubscribe. */
export function onSidebarAnchorChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Callback ref for an anchor element (module-level, so its identity never changes). */
export function sidebarAnchorRef(_el: HTMLElement | null): void {
  for (const listener of listeners) listener()
}

/**
 * Gives focus back to the text of the active pane (Escape in the floating
 * sidebar). Falls back to the first anchor on screen. No-op when the view has
 * no editable text (overviews, empty editor).
 */
export function focusContentAnchor(root: ParentNode, activePaneId: string | null): void {
  const selector = `[${SIDEBAR_ANCHOR_ATTR}]`
  const paneAnchor = activePaneId
    ? root.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(activePaneId)}"] ${selector}`)
    : null
  const anchor = paneAnchor ?? root.querySelector<HTMLElement>(selector)
  if (!anchor) return
  const target = anchor.matches('textarea')
    ? anchor
    : anchor.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"], textarea')
  target?.focus({ preventScroll: true })
}
