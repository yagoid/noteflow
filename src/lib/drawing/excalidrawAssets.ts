// Where Excalidraw finds its self-hosted canvas fonts (see the `noteflow:excalidraw-fonts`
// plugin in vite.config.ts: `<app root>/excalidraw/fonts/<Family>/<file>.woff2`).
//
// Excalidraw 0.18 resolves each font as `new URL('./fonts/…', EXCALIDRAW_ASSET_PATH)`, and a
// path starting with `/` or `./` is first resolved against `window.location.origin` — which is
// the bare `file://` in the packaged app (it would point at the root of the disk). So the
// value must be an ABSOLUTE URL built from the document: `http://localhost:5173/excalidraw/`
// in dev, `file:///…/dist/excalidraw/` when packaged.
//
// Must run before the Excalidraw module is evaluated (every dynamic import of it goes
// through loadExcalidraw below).

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[]
  }
}

export function ensureExcalidrawAssetPath(): void {
  if (window.EXCALIDRAW_ASSET_PATH) return
  // location.href minus hash/query, so it also works in windows routed by hash.
  window.EXCALIDRAW_ASSET_PATH = new URL('excalidraw/', window.location.href.split(/[?#]/)[0]).toString()
}

/** The only door to the Excalidraw package: a lazy chunk, with the asset path already set. */
export function loadExcalidraw(): Promise<typeof import('@excalidraw/excalidraw')> {
  ensureExcalidrawAssetPath()
  return import('@excalidraw/excalidraw')
}
