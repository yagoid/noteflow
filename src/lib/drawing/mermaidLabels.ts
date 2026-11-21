// Label text of a converted Mermaid drawing (pure). Mermaid writes a line break inside a
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
