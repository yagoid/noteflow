// "Is something open on top of the app?" — read from the DOM, so no modal or menu has to
// report itself to a store. Used by the main window's back / forward (components/
// useNavHistory.ts): it must not change the note under an open dialog or menu.

/** Marker for floating menus that aren't `role="menu"` (the shared ContextMenu). */
export const OVERLAY_PROPS = { 'data-overlay': '' } as const

const OVERLAY_SELECTOR = [
  '[aria-modal="true"]',  // dialogs: Confirm, Encryption, Snippets, version history, What's new…
  '[role="menu"]',        // dropdown menus (table, snippets, chat, sidebar footer…)
  '[data-overlay]',       // context menus (ContextMenu)
].join(', ')

/**
 * True while a dialog, menu or context menu is open. Besides the markers above, every app
 * modal is a full-screen `fixed inset-0` overlay with a dark `bg-black/…` backdrop (Settings,
 * command palette, Export / Import, editor dialogs, section link picker) — the same rule the
 * "What's new" startup popup waits on (WhatsNew/WhatsNewHost.tsx).
 */
export function hasOpenOverlay(root: ParentNode = document): boolean {
  if (root.querySelector(OVERLAY_SELECTOR)) return true
  return Array.from(root.querySelectorAll<HTMLElement>('.fixed.inset-0')).some(
    (el) => /(^|\s)bg-black\//.test(el.className),
  )
}
