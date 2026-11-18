// Bloque de dibujo (Excalidraw): el bloque en la nota (components/Editor/DrawingBlockView)
// y el overlay de dibujo (components/Drawing).
export const drawing = {
  // Bloque en la nota.
  label: 'Dibujo',
  mermaidLabel: 'Diagrama Mermaid',
  edit: 'Editar',
  editHint: 'Editar el dibujo (doble clic, o Enter con el bloque seleccionado)',
  resize: 'Arrastra para cambiar la altura',
  loading: 'Cargando lienzo…',
  empty: 'Dibujo vacío',
  previewError: 'No se ha podido mostrar este dibujo: {error}',
  mermaidImageHint: 'Se muestra como imagen: este tipo de diagrama Mermaid no se puede editar como dibujo.',
  mermaidImageOnly: 'Este tipo de diagrama Mermaid se dibuja como una sola imagen, así que no se puede convertir en un dibujo editable. Cambia su texto en el modo texto.',

  // Overlay.
  title: 'Dibujo',
  done: 'Hecho',
  mermaidNotice: 'Esto es un diagrama Mermaid. Si lo cambias aquí y pulsas Hecho pasa a ser un dibujo, y ya no se podrá editar como texto ni con la IA.',
  discardTitle: '¿Descartar los cambios?',
  discardMessage: 'Se perderán los cambios que has hecho en este dibujo.',
  discardConfirm: 'Descartar',
  discardKeep: 'Seguir editando',
}
