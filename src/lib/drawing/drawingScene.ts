// Drawing blocks (spike): the scene model handed around by the overlay, plus the two
// conversions the later phases need — scene → static SVG (preview) and Mermaid → scene
// ("source" variant). Everything heavy is behind a dynamic import, so importing this module
// costs nothing.
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { loadExcalidraw } from './excalidrawAssets'

export interface DrawingScene {
  elements: readonly ExcalidrawElement[]
  appState: Partial<AppState>
  files: BinaryFiles
}

export interface SceneToSvgOptions {
  dark?: boolean
  /** Leave the fonts out of the SVG (no font fetch / subsetting); text falls back when shown standalone. */
  skipInliningFonts?: boolean
}

/** Static SVG markup of a scene, with a transparent background. */
export async function sceneToSvg(scene: DrawingScene, opts: SceneToSvgOptions = {}): Promise<string> {
  const { exportToSvg } = await loadExcalidraw()
  const svg = await exportToSvg({
    elements: scene.elements,
    appState: { ...scene.appState, exportBackground: false, exportWithDarkMode: !!opts.dark },
    files: scene.files,
    exportPadding: 12,
    ...(opts.skipInliningFonts ? { skipInliningFonts: true as const } : {}),
  })
  return svg.outerHTML
}

/** Mermaid source → Excalidraw elements (+ files when the diagram type falls back to an image). */
export async function mermaidToScene(source: string): Promise<Pick<DrawingScene, 'elements' | 'files'>> {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import('@excalidraw/mermaid-to-excalidraw'),
    loadExcalidraw(),
  ])
  const { elements, files } = await parseMermaidToExcalidraw(source)
  return { elements: convertToExcalidrawElements(elements), files: files ?? {} }
}

export const MERMAID_SAMPLE = `flowchart TD
  A[Idea] --> B{Worth it?}
  B -- Yes --> C(Write the note)
  B -- No --> D[Archive]
  C --> E((Done))`
