// Drawing block (Excalidraw) — components/Drawing. Spike stage: the overlay is only
// reachable from a development-only palette command.
export const drawing = {
  devCommand: { label: 'Drawing canvas (dev)', description: 'Open the Excalidraw overlay (development only)' },
  title: 'Drawing',
  loading: 'Loading canvas…',
  done: 'Done',
  exportSvg: 'Export SVG',
  mermaidSample: 'Mermaid sample',
  svgPreviewAlt: 'SVG preview of the drawing',
  svgResult: 'SVG {size} · embedded fonts: {embedded} · {ms} ms',
  mermaidResult: 'Mermaid → {count} elements ({images} as image)',
  failed: 'Failed: {error}',
}
