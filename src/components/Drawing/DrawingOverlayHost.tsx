import { lazy, Suspense, useEffect, useState } from 'react'
import { useT } from '../../i18n/useT'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import { ensureExcalidrawAssetPath } from '../../lib/drawing/excalidrawAssets'
import { DRAWING_DEV_CLOSED_EVENT, DRAWING_DEV_OPEN_EVENT, type DrawingOpenRequest } from './drawingEvents'

// Mounted once in the MAIN window (App.tsx → MainApp). Excalidraw lives in the lazy
// DrawingOverlay chunk: nothing of it is fetched until the overlay first opens, and
// sticky / section / chat windows never reference it.
const DrawingOverlay = lazy(() => {
  ensureExcalidrawAssetPath()
  return import('./DrawingOverlay')
})

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export function DrawingOverlayHost() {
  const t = useT()
  const [request, setRequest] = useState<DrawingOpenRequest | null>(null)

  useEffect(() => {
    const onOpen = (e: Event) => setRequest((e as CustomEvent<DrawingOpenRequest>).detail ?? {})
    window.addEventListener(DRAWING_DEV_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(DRAWING_DEV_OPEN_EVENT, onOpen)
  }, [])

  if (!request) return null

  return (
    // data-own-keys: the app accelerators (capture phase, App.tsx) step aside while a key
    // event comes from inside the overlay, so Excalidraw gets Ctrl+G / Ctrl+F / Ctrl+' …
    // no-drag: the backdrop covers the title bar, whose drag region would swallow clicks.
    <div
      {...OWN_KEYS_PROPS}
      data-drawing-overlay=""
      className="fixed inset-0 z-[60] flex bg-black/60 p-5"
      style={NO_DRAG}
    >
      <Suspense
        fallback={
          <div className="m-auto rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">
            {t.drawing.loading}
          </div>
        }
      >
        <DrawingOverlay
          request={request}
          onClose={(sceneJson) => {
            setRequest(null)
            window.dispatchEvent(new CustomEvent<string>(DRAWING_DEV_CLOSED_EVENT, { detail: sceneJson }))
          }}
        />
      </Suspense>
    </div>
  )
}
