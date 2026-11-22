// Labels (and pictures) of a converted Mermaid drawing (pure). Mermaid writes a line break inside a
// node / edge label as `<br>` (`<br/>`, `<br />`) and renders HTML labels, but
// @excalidraw/mermaid-to-excalidraw copies the label text as is: the tag ends up shown
// literally in the Excalidraw text. Normalized on the converted elements (not on the source):
// only label texts are touched, never the rest of the Mermaid syntax.

const BR_RE = /<br\s*\/?>/gi

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

// One pass, so `&amp;lt;` gives `&lt;` (not `<`). Unknown names stay as written.
const ENTITY_RE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g

function decodeEntity(match: string, dec?: string, hex?: string, name?: string): string {
  if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match
  const code = dec ? parseInt(dec, 10) : parseInt(hex ?? '', 16)
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
  // `&nbsp;` / `&#160;` as a plain space: the canvas wraps and measures text by its spaces.
  return code === 0xa0 ? ' ' : String.fromCodePoint(code)
}

/** A label as Mermaid wrote it → the text to draw: `<br>` as a real line break, common HTML entities decoded. */
export function normalizeMermaidLabel(text: string): string {
  if (!text.includes('<') && !text.includes('&')) return text
  return text.replace(BR_RE, '\n').replace(ENTITY_RE, decodeEntity)
}

interface SkeletonWithText {
  text?: unknown
  label?: { text?: unknown } | null
}

/**
 * The element skeletons of a converted Mermaid diagram with their label texts normalized
 * (`text` of text elements, `label.text` of shapes and arrows). Elements without text are
 * returned as they were; nothing is mutated.
 */
export function normalizeMermaidSkeletonTexts<T>(elements: readonly T[]): T[] {
  return elements.map((el) => {
    const e = el as T & SkeletonWithText
    let out = e
    if (typeof e.text === 'string') {
      const text = normalizeMermaidLabel(e.text)
      if (text !== e.text) out = { ...out, text }
    }
    if (e.label && typeof e.label.text === 'string') {
      const text = normalizeMermaidLabel(e.label.text)
      if (text !== e.label.text) out = { ...out, label: { ...e.label, text } }
    }
    return out
  })
}

// ── Label fit ───────────────────────────────────────────────────────────────────
// Mermaid sizes each node for ITS font; Excalidraw then writes the label in its own
// (Excalifont, wider) and wraps it to the shape — a word wider than the room it has is
// broken mid-word ("Decis" / "ion"). Before converting, each node label whose longest word
// doesn't fit gets a smaller font (down to 3/4 of it, never under 12px) and, if that is
// not enough, the shape grows around its centre. Arrow labels are left alone.

/** Excalidraw's padding between a shape and its bound text (BOUND_TEXT_PADDING). */
const BOUND_TEXT_PADDING = 5
/** Excalidraw's default text size (DEFAULT_FONT_SIZE): a label without one is drawn at it. */
const DEFAULT_LABEL_FONT_SIZE = 20
const MIN_LABEL_FONT_SIZE = 12
/** Rounding margin of the measured word (canvas widths are fractional). */
const MEASURE_SLACK = 1

/** Width a label may take in a shape of `width` (Excalidraw's getBoundTextMaxWidth). */
export function labelMaxWidth(type: string, width: number): number {
  if (type === 'ellipse') return Math.round((width / 2) * Math.sqrt(2)) - BOUND_TEXT_PADDING * 2
  if (type === 'diamond') return Math.round(width / 2) - BOUND_TEXT_PADDING * 2
  return width - BOUND_TEXT_PADDING * 2
}

/** Narrowest shape of `type` whose label may be `textWidth` wide (inverse of labelMaxWidth). */
function shapeWidthFor(type: string, textWidth: number): number {
  const inner = textWidth + BOUND_TEXT_PADDING * 2
  if (type === 'ellipse') return Math.ceil((inner * 2) / Math.sqrt(2)) + 1
  if (type === 'diamond') return Math.ceil(inner * 2) + 1
  return Math.ceil(inner)
}

interface LabelledSkeleton {
  type?: unknown
  x?: unknown
  width?: unknown
  label?: { text?: unknown; fontSize?: unknown } | null
}

/**
 * The element skeletons of a converted Mermaid diagram with every node label's longest
 * word fitting its shape (see above). `measure(text, fontSize)` = the text's width in px
 * in Excalidraw's label font. Nothing is mutated; elements that fit are returned as they were.
 */
export function fitMermaidLabels<T>(elements: readonly T[], measure: (text: string, fontSize: number) => number): T[] {
  return elements.map((el) => {
    const e = el as T & LabelledSkeleton
    const { type, label } = e
    if ((type !== 'rectangle' && type !== 'diamond' && type !== 'ellipse') || !label || typeof label.text !== 'string') return el
    if (typeof e.width !== 'number' || !(e.width > 0)) return el
    const fontSize = typeof label.fontSize === 'number' && label.fontSize > 0 ? label.fontSize : DEFAULT_LABEL_FONT_SIZE
    const words = label.text.split(/\s+/).filter(Boolean)
    if (!words.length) return el
    const widest = Math.max(...words.map((w) => measure(w, fontSize))) + MEASURE_SLACK
    const room = labelMaxWidth(type, e.width)
    if (widest <= room) return el
    const floor = Math.min(fontSize, Math.max(MIN_LABEL_FONT_SIZE, Math.round(fontSize * 0.75)))
    const size = Math.max(floor, Math.floor((fontSize * room) / widest))
    const needed = (widest * size) / fontSize
    const out = { ...e, label: { ...label, fontSize: size } }
    if (needed <= room) return out
    const width = Math.max(e.width, shapeWidthFor(type, needed))
    return { ...out, width, ...(typeof e.x === 'number' ? { x: e.x - (width - e.width) / 2 } : {}) }
  })
}

// ── Picture size ────────────────────────────────────────────────────────────────
// The Mermaid types converted as one picture (pie, gantt…) get the size the package
// measured on its off-screen render, which can come out far smaller than the diagram
// (an SVG sized `100%` in a shrink-to-fit box) — the picture, and its text, then shrink
// with it. The SVG's viewBox is the size Mermaid drew it at.

/** The size a Mermaid picture (an SVG `data:` URL, base64) was drawn at — its viewBox — or null. */
export function mermaidPictureSize(dataURL: string): { width: number; height: number } | null {
  const m = /^data:image\/svg\+xml;base64,(.*)$/.exec(dataURL)
  if (!m) return null
  let svg: string
  try {
    svg = atob(m[1])
  } catch {
    return null
  }
  const box = /<svg\b[^>]*?\sviewBox="\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)\s*"/i.exec(svg)
  const width = Number(box?.[1])
  const height = Number(box?.[2])
  return width > 0 && height > 0 ? { width, height } : null
}

interface PictureSkeleton {
  type?: unknown
  fileId?: unknown
  width?: unknown
  height?: unknown
}

/**
 * The skeletons of a picture-type Mermaid diagram with each image shown at the size its
 * SVG was drawn at (mermaidPictureSize) when that is bigger. Nothing is mutated.
 */
export function fitMermaidPictures<T>(elements: readonly T[], files: Record<string, { dataURL?: unknown }>): T[] {
  return elements.map((el) => {
    const e = el as T & PictureSkeleton
    if (e.type !== 'image' || typeof e.fileId !== 'string' || typeof e.width !== 'number' || typeof e.height !== 'number') return el
    const dataURL = files[e.fileId]?.dataURL
    const size = typeof dataURL === 'string' ? mermaidPictureSize(dataURL) : null
    if (!size || size.width <= e.width) return el
    return { ...e, width: size.width, height: size.height }
  })
}
