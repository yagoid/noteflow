const COLOR_VARS = [
  '--accent',
  '--accent-2',
  '--red',
  '--cyan',
  '--purple',
  '--text',
  '--orange',
  '--pink',
] as const

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0
  return h
}

function colorVar(name: string): string {
  return COLOR_VARS[hashString(name) % COLOR_VARS.length]
}

export interface TagColorStyle {
  color: string
  background: string
  border: string
}

/** Colores para estado inactivo (opacidad baja) */
export function getTagColor(name: string): TagColorStyle {
  const v = colorVar(name)
  return {
    color:      `rgb(var(${v}))`,
    background: `rgb(var(${v}) / 0.12)`,
    border:     `1px solid rgb(var(${v}) / 0.28)`,
  }
}

/** Colores para estado activo/seleccionado (opacidad alta) */
export function getTagColorActive(name: string): TagColorStyle {
  const v = colorVar(name)
  return {
    color:      `rgb(var(${v}))`,
    background: `rgb(var(${v}) / 0.22)`,
    border:     `1px solid rgb(var(${v}) / 0.5)`,
  }
}

/** Devuelve el style object a pasar como prop `style` */
export function tagStyle(name: string, active: boolean): React.CSSProperties {
  const c = active ? getTagColorActive(name) : getTagColor(name)
  return { color: c.color, background: c.background, border: c.border }
}
