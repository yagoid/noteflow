// Anchor of the editor chat sidebar (AiChatSidebar.tsx): the chat button on the note title row of
// the rightmost pane. The floating sidebar hangs right below it (so the button that folds it stays
// visible) and lines up with its right edge; without an anchor on screen (overviews, brain view,
// no note open) the sidebar isn't shown. Same pattern as Sidebar/sidebarAnchor.ts: a stable
// callback ref tells the sidebar to re-measure when the anchor mounts or unmounts.

export const AI_CHAT_ANCHOR_ATTR = 'data-ai-chat-anchor'

const listeners = new Set<() => void>()

/** Subscribe to the anchor mounting/unmounting. Returns the unsubscribe. */
export function onAiChatAnchorChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Callback ref for the anchor element (module-level, so its identity never changes). */
export function aiChatAnchorRef(_el: HTMLElement | null): void {
  for (const listener of listeners) listener()
}
