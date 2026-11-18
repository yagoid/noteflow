import type { DrawingScene } from '../../lib/drawing/drawingScene'

// Spike entry point of the drawing overlay (no user-facing entry yet): the dev-only palette
// command fires OPEN; DrawingOverlayHost answers with CLOSED carrying the scene as JSON.
export const DRAWING_DEV_OPEN_EVENT = 'noteflow:dev-open-drawing'
export const DRAWING_DEV_CLOSED_EVENT = 'noteflow:dev-drawing-closed'

export interface DrawingOpenRequest {
  /** Scene to edit. */
  scene?: DrawingScene
  /** Mermaid source to convert and load as the initial scene. */
  mermaid?: string
  /** Spike probe: export the SVG without embedding the fonts (`skipInliningFonts`). */
  svgWithoutFonts?: boolean
}

export function requestDevDrawing(request: DrawingOpenRequest = {}): void {
  window.dispatchEvent(new CustomEvent<DrawingOpenRequest>(DRAWING_DEV_OPEN_EVENT, { detail: request }))
}
