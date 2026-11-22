// Drawing block (Excalidraw): the block in the note (components/Editor/DrawingBlockView)
// and the drawing overlay (components/Drawing).
export const drawing = {
  // Block in the note.
  label: 'Drawing',
  mermaidLabel: 'Mermaid diagram',
  edit: 'Edit',
  editHint: 'Edit the drawing (double-click, or Ctrl+Enter with the block selected)',
  resize: 'Drag to change the height',
  resizeWidth: 'Drag to change the width (double-click: back to the text width)',
  loading: 'Loading canvas…',
  empty: 'Empty drawing',
  previewError: 'This drawing could not be shown: {error}',
  mermaidImageHint: 'Shown as a picture: this kind of Mermaid diagram cannot be edited as a drawing.',
  mermaidImageOnly: 'This kind of Mermaid diagram is drawn as a single picture, so it cannot be turned into an editable drawing. Change its text in text mode instead.',
  mermaidInvalid: 'This Mermaid text is not valid, so it cannot be opened in the canvas. Fix it in text mode.',

  // Overlay.
  title: 'Drawing',
  done: 'Done',
  mermaidNotice: 'This is a Mermaid diagram. If you change it here and press Done it becomes a drawing, and can no longer be edited as text or by the AI.',
  discardTitle: 'Discard changes?',
  discardMessage: 'The changes you made to this drawing will be lost.',
  discardConfirm: 'Discard',
  discardKeep: 'Keep editing',

  // The note changed under the open canvas (sync, another window).
  conflictTitle: 'The note changed while you were drawing',
  conflictMessage: 'This drawing was changed or removed in the note in the meantime, so your version was not saved over it. You can keep it as a new drawing next to it.',
  conflictMessageGone: 'The note this drawing was in is no longer open, so your version could not be saved. You can copy it and paste it into a note in text mode.',
  conflictInsert: 'Insert as a new drawing',
  conflictCopy: 'Copy the drawing',
  conflictDiscard: 'Discard my version',

  // The drawing could not be written.
  saveFailedTitle: 'The drawing could not be saved',
  saveFailedMessage: 'Writing the note to disk failed. You can try again, or copy the drawing and paste it into a note in text mode later.',
  copyFailedTitle: 'The drawing could not be copied',
  copyFailedMessage: 'The clipboard did not accept the drawing. Try again; if you discard it, this version of the drawing is lost.',
  tryAgain: 'Try again',
}
