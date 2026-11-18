// Drawing blocks ↔ Excalidraw: everything that needs the Excalidraw (or Mermaid) package,
// behind dynamic imports — importing this module costs nothing. The on-disk format itself
// is lib/drawing/drawingBlock.ts (pure).
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { DrawingBlock, DrawingElement, DrawingFile, DrawingSceneData } from './drawingBlock'
import { loadExcalidraw } from './excalidrawAssets'

/** A scene as Excalidraw holds it (elements restored: every field present). */
export interface ExcalidrawScene {
  elements: readonly ExcalidrawElement[]
  appState: Partial<AppState>
  files: BinaryFiles
}

/** The scene has image elements: for a Mermaid source, a diagram type converted as a picture. */
export const sceneHasImages = (scene: ExcalidrawScene) => scene.elements.some((el) => el.type === 'image')

/**
 * A stored scene → what Excalidraw can load. Goes through Excalidraw's own `restore`: the
 * stored lines leave out its bookkeeping (version, versionNonce, updated, isDeleted) and a
 * hand-written scene may miss any field.
 */
export async function restoreScene(data: DrawingSceneData): Promise<ExcalidrawScene> {
  const { restore } = await loadExcalidraw()
  // A text written by hand without its size would be dropped by Excalidraw as an
  // invisible element: have it measured. Only then — measuring depends on the fonts
  // loaded, and a scene Excalidraw wrote already carries the right sizes.
  const unsizedText = data.elements.some((el) => el.type === 'text' && !(Number(el.width) > 0 && Number(el.height) > 0))
  const restored = restore(
    { elements: data.elements as unknown as ExcalidrawElement[], appState: data.appState as Partial<AppState>, files: data.files as unknown as BinaryFiles },
    null,
    null,
    { repairBindings: true, refreshDimensions: unsizedText },
  )
  return {
    elements: restored.elements,
    // Only what the note stores: the rest of the app state is the session's.
    appState: data.appState as Partial<AppState>,
    files: restored.files,
  }
}

/** Mermaid source → scene (elements, plus files when the diagram type converts as an image). */
export async function mermaidToScene(source: string): Promise<ExcalidrawScene> {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import('@excalidraw/mermaid-to-excalidraw'),
    loadExcalidraw(),
  ])
  const { elements, files } = await parseMermaidToExcalidraw(source)
  return { elements: convertToExcalidrawElements(elements), appState: {}, files: files ?? {} }
}

/** The scene a block draws: its stored scene restored, or its Mermaid source converted. */
export function blockToScene(block: DrawingBlock): Promise<ExcalidrawScene> {
  return block.kind === 'mermaid' ? mermaidToScene(block.source) : restoreScene(block.scene)
}

/** What Excalidraw holds → the data a block stores (serializeSceneBody filters and orders it). */
export function sceneToData(scene: ExcalidrawScene): DrawingSceneData {
  return {
    appState: scene.appState as Record<string, unknown>,
    elements: scene.elements as unknown as DrawingElement[],
    files: scene.files as unknown as Record<string, DrawingFile>,
  }
}

/**
 * Static SVG of a scene for the in-note preview: transparent background, fonts NOT
 * embedded (the document registers them: drawingPreview.ts), links removed — the markup is
 * inserted inline in the note, where a click on an `<a>` would navigate the window.
 */
export async function sceneToSvg(scene: ExcalidrawScene, opts: { dark?: boolean } = {}): Promise<string> {
  const { exportToSvg } = await loadExcalidraw()
  const svg = await exportToSvg({
    elements: scene.elements,
    appState: { ...scene.appState, exportBackground: false, exportWithDarkMode: !!opts.dark },
    files: scene.files,
    exportPadding: 12,
    skipInliningFonts: true,
  })
  svg.querySelectorAll('a').forEach((a: Element) => {
    a.removeAttribute('href')
    a.removeAttribute('xlink:href')
    a.removeAttribute('target')
  })
  svg.querySelectorAll('script, foreignObject, iframe').forEach((node: Element) => node.remove())
  return svg.outerHTML
}
