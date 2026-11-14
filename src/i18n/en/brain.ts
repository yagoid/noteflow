// The Brain view chrome (header, indexing pills, the enable/disable and low-power
// dialogs). Dialog bodies are full sentences; the words to emphasize are separate
// keys that appear verbatim inside the body and get wrapped at render time (see
// `highlightTerms` in BrainView), so translations stay whole and grammatical.
export const brain = {
  title: 'Brain',
  nodesCount: { one: '{count} node', other: '{count} nodes' },
  dragResize: 'Drag to resize',
  showAiPanel: 'Show AI panel',

  localAi: 'Local AI',
  localAiEnabled: 'Local AI enabled',
  localAiDisabled: 'Local AI disabled',
  indexingInProgress: 'Indexing in progress…',
  reindexStale: 'Notes changed — reindex to update results',
  reindexAll: 'Reindex all notes',
  close: 'Close brain view',
  emptyNotes: 'No notes to display yet.',

  // Progress pill.
  downloadingModelPct: 'Downloading model {pct}%',
  downloadingModel: 'Downloading model…',
  indexingPct: 'Indexing {pct}%',
  indexing: 'Indexing…',
  starting: 'Starting…',

  // Enable / disable dialog.
  disableTitle: 'Disable local AI',
  enableTitle: 'Enable local AI',
  enabling: 'Enabling…',
  contentConnections: 'content connections',
  disableBody: 'Local AI is on. Disabling hides content connections in Brain and stops giving the chat context from your notes. Your existing index is kept, so you can re-enable it later without re-downloading or re-indexing.',
  enableBody: 'Brain already shows your notes and groups structure. Enable local AI (100% offline) to also reveal content connections and give the chat context from your notes. On first use, a small model is downloaded and your notes are indexed — the app may use more CPU for a while.',
  activationFailed: 'Activation failed',

  // Low-powered device dialog.
  lowEndTitle: 'Low-powered device detected',
  view2d: '2D view',
  view3d: '3D view',
  lowEndBody: 'This machine looks low on resources, so Brain is showing the lighter 2D view, which uses less CPU and GPU. You can switch to the 3D view for a more immersive brain — it looks nicer but is heavier on your hardware.',
  keep2d: 'Keep 2D',
  use3d: 'Use 3D',
}
