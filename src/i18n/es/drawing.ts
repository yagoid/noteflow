// Bloque de dibujo (Excalidraw) — components/Drawing. Fase de spike: el overlay solo se
// abre desde un comando de la paleta que existe únicamente en desarrollo.
export const drawing = {
  devCommand: { label: 'Lienzo de dibujo (dev)', description: 'Abre el overlay de Excalidraw (solo desarrollo)' },
  title: 'Dibujo',
  loading: 'Cargando lienzo…',
  done: 'Hecho',
  exportSvg: 'Exportar SVG',
  mermaidSample: 'Ejemplo de Mermaid',
  svgPreviewAlt: 'Vista previa en SVG del dibujo',
  svgResult: 'SVG {size} · fuentes incrustadas: {embedded} · {ms} ms',
  mermaidResult: 'Mermaid → {count} elementos ({images} como imagen)',
  failed: 'Error: {error}',
}
