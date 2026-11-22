// Bloque de dibujo (Excalidraw): el bloque en la nota (components/Editor/DrawingBlockView)
// y el overlay de dibujo (components/Drawing).
export const drawing = {
  // Bloque en la nota.
  label: 'Dibujo',
  mermaidLabel: 'Diagrama Mermaid',
  edit: 'Editar',
  editHint: 'Editar el dibujo (doble clic, o Ctrl+Enter con el bloque seleccionado)',
  resize: 'Arrastra para cambiar la altura',
  resizeWidth: 'Arrastra para cambiar el ancho (doble clic: volver al ancho del texto)',
  loading: 'Cargando lienzo…',
  empty: 'Dibujo vacío',
  previewError: 'No se ha podido mostrar este dibujo: {error}',
  mermaidImageHint: 'Se muestra como imagen: este tipo de diagrama Mermaid no se puede editar como dibujo.',
  mermaidImageOnly: 'Este tipo de diagrama Mermaid se dibuja como una sola imagen, así que no se puede convertir en un dibujo editable. Cambia su texto en el modo texto.',
  mermaidInvalid: 'Este texto Mermaid no es válido, así que no se puede abrir en el lienzo. Corrígelo en el modo texto.',

  // Overlay.
  title: 'Dibujo',
  done: 'Hecho',
  mermaidNotice: 'Esto es un diagrama Mermaid. Si lo cambias aquí y pulsas Hecho pasa a ser un dibujo, y ya no se podrá editar como texto ni con la IA.',
  discardTitle: '¿Descartar los cambios?',
  discardMessage: 'Se perderán los cambios que has hecho en este dibujo.',
  discardConfirm: 'Descartar',
  discardKeep: 'Seguir editando',

  // La nota cambió con el lienzo abierto (sync, otra ventana).
  conflictTitle: 'La nota ha cambiado mientras dibujabas',
  conflictMessage: 'Este dibujo se ha cambiado o eliminado en la nota entretanto, así que tu versión no se ha guardado encima. Puedes conservarla como un dibujo nuevo junto a él.',
  conflictMessageGone: 'La nota en la que estaba este dibujo ya no está abierta, así que tu versión no se ha podido guardar. Puedes copiarla y pegarla en una nota en modo texto.',
  conflictInsert: 'Insertar como dibujo nuevo',
  conflictCopy: 'Copiar el dibujo',
  conflictDiscard: 'Descartar mi versión',

  // El dibujo no se ha podido escribir.
  saveFailedTitle: 'No se ha podido guardar el dibujo',
  saveFailedMessage: 'Ha fallado la escritura de la nota en disco. Puedes volver a intentarlo, o copiar el dibujo y pegarlo más tarde en una nota en modo texto.',
  copyFailedTitle: 'No se ha podido copiar el dibujo',
  copyFailedMessage: 'El portapapeles no ha aceptado el dibujo. Vuelve a intentarlo; si lo descartas, esta versión del dibujo se pierde.',
  tryAgain: 'Reintentar',
}
