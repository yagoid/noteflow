// Drawing blocks ↔ Excalidraw: everything that needs the Excalidraw (or Mermaid) package,
// behind dynamic imports — importing this module costs nothing. The on-disk format itself
// is lib/drawing/drawingBlock.ts (pure).
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { DrawingBlock, DrawingElement, DrawingFile, DrawingSceneData } from './drawingBlock'
import { loadExcalidraw } from './excalidrawAssets'
import { fitMermaidLabels, fitMermaidPictures, normalizeMermaidSkeletonTexts } from './mermaidLabels'

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

/** The family Excalidraw writes a converted label in (its DEFAULT_FONT_FAMILY, with its fallbacks). */
const LABEL_FONT = 'Excalifont, Xiaolai, sans-serif'

/**
 * Width of a text in the labels' font, for fitMermaidLabels — measured like Excalidraw
 * does (canvas measureText), once the font is in (registered by drawingPreview.ts; if it
 * isn't, the fallback measures it and the label is left about as before).
 */
async function labelMeasurer(): Promise<(text: string, fontSize: number) => number> {
  await document.fonts.load(`20px ${LABEL_FONT}`).catch(() => undefined)
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return () => 0
  return (text, fontSize) => {
    ctx.font = `${fontSize}px ${LABEL_FONT}`
    return ctx.measureText(text).width
  }
}

/**
 * Mermaid source → scene (elements, plus files when the diagram type converts as an image).
 * `theme`: Mermaid's own theme for the picture of such a type (drawingPreview.ts draws it
 * with 'dark' in a dark theme); the elements of the other types don't depend on it.
 */
export async function mermaidToScene(source: string, opts: { theme?: 'dark' } = {}): Promise<ExcalidrawScene> {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }, measure] = await Promise.all([
    import('@excalidraw/mermaid-to-excalidraw'),
    loadExcalidraw(),
    labelMeasurer(),
  ])
  // The theme reaches mermaid.initialize (the package spreads its config into it, though its
  // type leaves `theme` out). Always set: the last one stays in Mermaid otherwise.
  const config = { startOnLoad: false, theme: opts.theme ?? 'default' }
  const { elements, files } = await parseMermaidToExcalidraw(source, config)
  // Before converting: the texts are measured with their real line breaks, each node
  // label fits its shape without a word broken in two, and a picture keeps its size.
  const skeletons = fitMermaidPictures(fitMermaidLabels(normalizeMermaidSkeletonTexts(elements), measure), files ?? {})
  return { elements: convertToExcalidrawElements(skeletons), appState: {}, files: files ?? {} }
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
  // Event handlers and styles that fetch: nothing in a preview runs or loads anything.
  svg.querySelectorAll('*').forEach((node: Element) => {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name) || (attr.name === 'style' && /url\s*\(/i.test(attr.value))) node.removeAttribute(attr.name)
    }
  })
  return svg.outerHTML
}
