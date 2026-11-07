import { hexToRgbTriple, rgbTripleToHex } from './colorUtils'
import type { CustomColor, GroupColor, ThemeColorVar } from '../types'

export const TAG_COLOR_VARS: readonly ThemeColorVar[] = [
  '--accent',
  '--accent-2',
  '--red',
  '--cyan',
  '--purple',
  '--text',
  '--orange',
  '--pink',
] as const

/** Colour of a group created from the sidebar or the content view (recoloured later from its menu). */
export const NEW_GROUP_COLOR: GroupColor = '--accent'

export type TagColorMap = Partial<Record<string, GroupColor>>

const HEX6_RE = /^#[0-9a-f]{6}$/i
const HEX3_RE = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i

export function normalizeTagColorKey(name: string): string {
  return name.trim().toLowerCase()
}

/** True for a free colour ('#rrggbb'), false for a theme CSS var. */
export function isCustomColor(value: string): value is CustomColor {
  return HEX6_RE.test(value)
}

/**
 * Validates a stored colour: a theme var stays as-is, a hex is normalized to lowercase
 * '#rrggbb' ('#rgb' shorthand expanded). Anything else → null (caller falls back to auto).
 * Mirrored in electron/main.ts (sanitizeSectionColors) — main can't import from src/.
 */
export function normalizeGroupColor(value: unknown): GroupColor | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if ((TAG_COLOR_VARS as readonly string[]).includes(v)) return v as ThemeColorVar
  if (HEX6_RE.test(v)) return v.toLowerCase() as CustomColor
  const short = HEX3_RE.exec(v)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() as CustomColor
  return null
}

/**
 * RGB channels of a group/section colour, ready to interpolate with optional alpha:
 * `rgb(${colorChannels(c)})` / `rgb(${colorChannels(c)} / 0.2)`. Works for both theme
 * vars (→ `var(--accent)`) and free hex colours (→ `122 162 247`).
 */
export function colorChannels(color: GroupColor): string {
  return isCustomColor(color) ? hexToRgbTriple(color) : `var(${color})`
}

/** Hex value to seed an `<input type="color">` — resolves theme vars against the live theme. */
export function groupColorToHex(color: GroupColor): string {
  if (isCustomColor(color)) return color
  if (typeof document === 'undefined') return '#808080'
  return rgbTripleToHex(getComputedStyle(document.documentElement).getPropertyValue(color))
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0
  return h
}

function colorVar(name: string): ThemeColorVar {
  return TAG_COLOR_VARS[hashString(name) % TAG_COLOR_VARS.length]
}

/** Colour of a tag/section name: the user override if any, else the hashed theme var. */
export function resolveGroupColor(name: string, overrides?: TagColorMap): GroupColor {
  const key = normalizeTagColorKey(name)
  const override = key ? overrides?.[key] : undefined
  return override ?? colorVar(name)
}

export interface TagColorStyle {
  color: string
  background: string
  border: string
}

/** Colores para estado inactivo (opacidad baja) */
export function getTagColor(name: string, overrides?: TagColorMap): TagColorStyle {
  const c = colorChannels(resolveGroupColor(name, overrides))
  return {
    color:      `rgb(${c})`,
    background: `rgb(${c} / 0.12)`,
    border:     `1px solid rgb(${c} / 0.28)`,
  }
}

/** Colores para estado activo/seleccionado (opacidad alta) */
export function getTagColorActive(name: string, overrides?: TagColorMap): TagColorStyle {
  const c = colorChannels(resolveGroupColor(name, overrides))
  return {
    color:      `rgb(${c})`,
    background: `rgb(${c} / 0.22)`,
    border:     `1px solid rgb(${c} / 0.5)`,
  }
}

/** Devuelve el style object a pasar como prop `style` */
export function tagStyle(name: string, active: boolean, overrides?: TagColorMap): React.CSSProperties {
  const c = active ? getTagColorActive(name, overrides) : getTagColor(name, overrides)
  return { color: c.color, background: c.background, border: c.border }
}
