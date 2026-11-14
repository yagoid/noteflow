// The palette the web's brain is drawn with. Like the app's brainColors.ts it resolves CSS
// variables (space-separated RGB triples on :root) to numbers, but against the site's tokens
// (src/styles/brain-site.css): background --brain-bg, ink --brain-text, and the group colours the
// sample graph uses (--accent, --purple, …) remapped to their saturated --brain-* synapse twins.
// The scene then puts them through the app's own colour treatment (BRAIN_LOOK.color).

export type RGB = [number, number, number]

export interface BrainPalette {
  bg: RGB
  text: RGB
  /** Resolve a group colour (CSS var like '--accent', or '#rrggbb') to its RGB, cached. */
  color: (color: string) => RGB
}

const BRAIN_ACCENTS: Record<string, string> = {
  '--accent': '--brain-accent', '--accent-2': '--brain-accent-2', '--purple': '--brain-purple',
  '--orange': '--brain-orange', '--cyan': '--brain-cyan', '--pink': '--brain-pink', '--red': '--brain-red',
  '--text': '--brain-text',
}

export function readVar(name: string): RGB {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const parts = raw.split(/[\s,]+/).map(Number)
  if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) return [parts[0], parts[1], parts[2]]
  return [128, 128, 128]
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16)
  return Number.isNaN(n) ? [128, 128, 128] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Read fresh whenever the theme changes (the scene is rebuilt then). */
export function readBrainPalette(): BrainPalette {
  const cache = new Map<string, RGB>()
  const color = (value: string): RGB => {
    let c = cache.get(value)
    if (!c) {
      c = value.startsWith('#') ? hexToRgb(value) : readVar(BRAIN_ACCENTS[value] ?? value)
      cache.set(value, c)
    }
    return c
  }
  return { bg: readVar('--brain-bg'), text: color('--text'), color }
}
