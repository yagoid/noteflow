import type { GroupColor } from '../types'

export const TAG_COLOR_VARS: readonly GroupColor[] = [
  '--accent',
  '--accent-2',
  '--red',
  '--cyan',
  '--purple',
  '--text',
  '--orange',
  '--pink',
] as const

export type TagColorMap = Partial<Record<string, GroupColor>>

export function normalizeTagColorKey(name: string): string {
  return name.trim().toLowerCase()
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0
  return h
}

function colorVar(name: string): GroupColor {
  return TAG_COLOR_VARS[hashString(name) % TAG_COLOR_VARS.length]
}

function resolveColorVar(name: string, overrides?: TagColorMap): GroupColor {
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
  const v = resolveColorVar(name, overrides)
  return {
    color:      `rgb(var(${v}))`,
    background: `rgb(var(${v}) / 0.12)`,
    border:     `1px solid rgb(var(${v}) / 0.28)`,
  }
}

/** Colores para estado activo/seleccionado (opacidad alta) */
export function getTagColorActive(name: string, overrides?: TagColorMap): TagColorStyle {
  const v = resolveColorVar(name, overrides)
  return {
    color:      `rgb(var(${v}))`,
    background: `rgb(var(${v}) / 0.22)`,
    border:     `1px solid rgb(var(${v}) / 0.5)`,
  }
}

/** Devuelve el style object a pasar como prop `style` */
export function tagStyle(name: string, active: boolean, overrides?: TagColorMap): React.CSSProperties {
  const c = active ? getTagColorActive(name, overrides) : getTagColor(name, overrides)
  return { color: c.color, background: c.background, border: c.border }
}
