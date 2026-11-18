// The static preview of a drawing block in a note: an inline SVG made by Excalidraw's own
// exporter, generated when the block is shown (nothing is stored in the note). Loads the
// Excalidraw chunk — and Mermaid, for a source block — on first use, so callers only ask
// for it once the block is on screen.
import { drawingFromHtmlData, type DrawingHtmlData } from './drawingBlock'
import { blockToScene, sceneHasImages, sceneToSvg } from './drawingScene'
import { ensureExcalidrawAssetPath } from './excalidrawAssets'
import { EXCALIDRAW_FONT_FACES } from './excalidrawFontFaces'

export interface DrawingPreview {
  svg: string
  /** A Mermaid diagram type that converts as one picture, not as editable elements. */
  asImage: boolean
  /** No element to show. */
  empty: boolean
}

let fontsRegistered = false

/**
 * The SVG is exported without embedded fonts, so its text needs the canvas families in
 * the document: register Excalidraw's faces (generated table, self-hosted files). FontFace
 * objects load lazily — only the subsets a preview actually uses are fetched.
 */
export function registerDrawingFonts(): void {
  if (fontsRegistered || typeof FontFace === 'undefined') return
  fontsRegistered = true
  ensureExcalidrawAssetPath()
  const base = window.EXCALIDRAW_ASSET_PATH as string
  for (const face of EXCALIDRAW_FONT_FACES) {
    const url = new URL(`fonts/${face.file}`, base).toString()
    document.fonts.add(new FontFace(face.family, `url("${url}") format("woff2")`, {
      display: 'swap',
      style: 'normal',
      weight: face.weight,
      ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
    }))
  }
}

// Previews by content: scrolling a note, switching sections or undoing never regenerates
// one. Small and bounded — an SVG is a few kB, a picture-heavy one much more.
const CACHE_LIMIT = 40
const cache = new Map<string, Promise<DrawingPreview>>()

const cacheKey = (data: DrawingHtmlData, dark: boolean) => `${dark ? 'd' : 'l'}\n${data.kind}\n${data.body}`

/** The preview already made for this content, if any (lets a view paint it at once). */
export function cachedDrawingPreview(data: DrawingHtmlData, dark: boolean): Promise<DrawingPreview> | undefined {
  return cache.get(cacheKey(data, dark))
}

/** Rejects when the block can't be drawn: an invalid scene, a Mermaid source that doesn't parse. */
export function drawingPreview(data: DrawingHtmlData, dark: boolean): Promise<DrawingPreview> {
  const key = cacheKey(data, dark)
  const hit = cache.get(key)
  if (hit) {
    // Most recently used last.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const made = (async (): Promise<DrawingPreview> => {
    const block = drawingFromHtmlData(data)
    if (!block) throw new Error('Invalid drawing')
    registerDrawingFonts()
    const scene = await blockToScene(block)
    const empty = scene.elements.every((el) => el.isDeleted)
    return { svg: empty ? '' : await sceneToSvg(scene, { dark }), asImage: sceneHasImages(scene), empty }
  })()
  cache.set(key, made)
  // A failure isn't worth keeping (a Mermaid source being typed changes at once anyway).
  made.catch(() => { if (cache.get(key) === made) cache.delete(key) })
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return made
}
