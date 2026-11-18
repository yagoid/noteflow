import { lazy, Suspense, useEffect } from 'react'
import { useT } from '../../i18n/useT'
import { OWN_KEYS_PROPS, claimKeys } from '../../lib/keyScope'
import { ensureExcalidrawAssetPath } from '../../lib/drawing/excalidrawAssets'
import { flushOpenDrawing, useDrawingEditorStore } from '../../stores/drawingEditorStore'
import { ConfirmModal } from '../ConfirmModal'

// Mounted once per window that can edit drawings (App.tsx → MainApp, SectionWindowApp;
// not stickies). Renders the overlay of the session held by drawingEditorStore. Excalidraw
// lives in the lazy DrawingOverlay chunk: nothing of it is fetched until a drawing is
// first shown or edited.
const DrawingOverlay = lazy(() => {
  ensureExcalidrawAssetPath()
  return import('./DrawingOverlay')
})

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export function DrawingOverlayHost() {
  const t = useT()
  const session = useDrawingEditorStore((s) => s.session)
  const conflict = useDrawingEditorStore((s) => s.conflict)

  useEffect(() => {
    useDrawingEditorStore.getState().setAvailable(true)
    return () => useDrawingEditorStore.getState().setAvailable(false)
  }, [])

  // The window closes or reloads with the canvas open (OS close, app quit, an update
  // restarting the app): hand the drawing over like the editors' pending saves (App.tsx).
  useEffect(() => {
    window.addEventListener('beforeunload', flushOpenDrawing)
    return () => window.removeEventListener('beforeunload', flushOpenDrawing)
  }, [])

  // While the overlay is open every keystroke is its own: the app accelerators (capture
  // phase, App.tsx & co.) step aside whatever has the focus — also <body> (lib/keyScope.ts).
  const open = !!session
  useEffect(() => (open ? claimKeys() : undefined), [open])

  // The note changed while the canvas was open: the work is never dropped silently.
  if (conflict) {
    return (
      <div data-drawing-conflict="" style={NO_DRAG}>
        <ConfirmModal
          title={t.drawing.conflictTitle}
          message={conflict.canInsert ? t.drawing.conflictMessage : t.drawing.conflictMessageGone}
          confirmLabel={conflict.canInsert ? t.drawing.conflictInsert : t.drawing.conflictCopy}
          cancelLabel={t.drawing.conflictDiscard}
          confirmOnEnter={false}
          onConfirm={() => conflict.resolve(true)}
          onCancel={() => conflict.resolve(false)}
        />
      </div>
    )
  }

  if (!session) return null

  return (
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
        <DrawingOverlay session={session} />
      </Suspense>
    </div>
  )
}
