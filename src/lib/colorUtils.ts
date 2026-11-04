// Shared RGB ↔ hex conversions.
// Theme CSS vars hold colours as space-separated channel triples ("122 162 247") so they can be
// composed with alpha (`rgb(var(--accent) / 0.2)`); the native `<input type="color">` speaks
// '#rrggbb'. These helpers bridge both worlds.

/** '#7aa2f7' → [122, 162, 247]. Invalid input degrades to black. */
export function hexToRgbChannels(hex: string): [number, number, number] {
  const m = hex.trim().replace('#', '')
  const full = m.length === 3 ? `${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}` : m
  const n = parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** '#7aa2f7' → '122 162 247' (the CSS-var channel format). */
export function hexToRgbTriple(hex: string): string {
  return hexToRgbChannels(hex).join(' ')
}

/** '122 162 247' → '#7aa2f7'. Accepts comma-separated triples too. */
export function rgbTripleToHex(rgb: string): string {
  const [r, g, b] = rgb.trim().split(/[\s,]+/).map(Number)
  const h = (n: number) => Math.max(0, Math.min(255, n || 0)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * Stored-colour sentinel for "follow the theme's text colour" (Settings → Appearance: accent and
 * editor colours). Persisted as-is in ui-settings.json (electron/uiSettings.ts accepts it) and
 * resolved to the active theme's `--text` triple every time the theme is applied, so the CSS vars
 * always carry a real "r g b" triple (consumers parse them via getComputedStyle).
 */
export const THEME_TEXT_COLOR = 'text'

/** A stored colour override → the "r g b" triple to apply (`THEME_TEXT_COLOR` → `textTriple`). */
export function resolveThemeColor(value: string, textTriple: string): string {
  return value === THEME_TEXT_COLOR ? textTriple : value
}
