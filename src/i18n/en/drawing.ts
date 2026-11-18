// Drawing block (Excalidraw): the block in the note (components/Editor/DrawingBlockView)
// and the drawing overlay (components/Drawing).
export const drawing = {
  // Block in the note.
  label: 'Drawing',
  mermaidLabel: 'Mermaid diagram',
  edit: 'Edit',
  editHint: 'Edit the drawing (double-click, or Enter with the block selected)',
  resize: 'Drag to change the height',
  loading: 'Loading canvas…',
  empty: 'Empty drawing',
  previewError: 'This drawing could not be shown: {error}',
  mermaidImageHint: 'Shown as a picture: this kind of Mermaid diagram cannot be edited as a drawing.',
  mermaidImageOnly: 'This kind of Mermaid diagram is drawn as a single picture, so it cannot be turned into an editable drawing. Change its text in text mode instead.',

  // Overlay.
  title: 'Drawing',
  done: 'Done',
  mermaidNotice: 'This is a Mermaid diagram. If you change it here and press Done it becomes a drawing, and can no longer be edited as text or by the AI.',
  discardTitle: 'Discard changes?',
  discardMessage: 'The changes you made to this drawing will be lost.',
  discardConfirm: 'Discard',
  discardKeep: 'Keep editing',
}
