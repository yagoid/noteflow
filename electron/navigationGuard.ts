// Pure decisions of the navigation guard main.ts installs on every window: no window of
// the app may end up showing remote content. The renderer opens links itself, through
// `app:open-url` (https only, system browser); what reaches these two hooks is everything
// that bypasses it — an `<a target="_blank">` or `window.open()` of a third-party
// component (the drawing canvas: its Help dialog, element hyperlinks), a plain `<a href>`
// in rendered markup, a stray `location = …`.

/** Same document, whatever the hash or query: a reload, or the hash routing of a window. */
export function isSameDocument(current: string, target: string): boolean {
  try {
    const a = new URL(current)
    const b = new URL(target)
    return a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname
  } catch {
    return false
  }
}

/**
 * `will-navigate`: a window only ever stays on the document it was created with (a
 * reload, a hash change). Anything else is cancelled.
 */
export function navigationAllowed(current: string, target: string): boolean {
  return isSameDocument(current, target)
}

/**
 * `setWindowOpenHandler`: never a new Electron window. The URL to hand to the system
 * browser instead, or null — https only, the same rule as `app:open-url`.
 */
export function externalUrlToOpen(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
