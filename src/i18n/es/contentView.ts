// Vista de contenido unificada (components/ContentView/): lugares, notas por fecha y vista previa.
export const contentView = {
  // ── Lugares (columna + cabecera) ────────────────────────────────────────────
  placesLabel: 'Lugares',
  all: 'Todo',
  favorites: 'Favoritas',
  ungrouped: 'Sin grupo',
  addFolder: 'Carpeta',
  addFolderTooltip: 'Nueva carpeta en {name}',
  addGroup: 'Grupo',
  addGroupTooltip: 'Nuevo grupo',
  archivedGroup: 'Grupo archivado',

  // ── Cabecera ────────────────────────────────────────────────────────────────
  lastEdited: 'última edición: {date}',
  searchPlaceholder: 'Buscar nota o sección',
  searchLabel: 'Buscar en esta vista',
  newNote: 'Nota',
  newNoteIn: 'Nueva nota en {name}',
  moreActions: 'Más acciones',
  showArchived: 'Mostrar archivadas',

  // ── Notas por fecha ─────────────────────────────────────────────────────────
  listLabel: 'Notas: ↑ ↓ nota, ← → sección, Intro abre en el editor',
  blockToday: 'Hoy',
  blockYesterday: 'Ayer',
  blockWeek: 'Esta semana',
  blockMonth: 'Últimos 30 días',
  blockOlder: 'Antes',
  inGroup: 'En el grupo',
  encrypted: 'Cifrada',
  archivedNote: 'Archivada',
  selectNote: 'Seleccionar nota',
  noMatches: 'Nada coincide con la búsqueda',
  emptyPlace: 'Aquí no hay notas todavía',

  // ── Vista previa ────────────────────────────────────────────────────────────
  previewLabel: 'Vista previa de la sección',
  closePreview: 'Cerrar la vista previa (Esc)',
  sectionPosition: 'Sección {index} de {total}',
  editedAt: 'editada {date}',
  openInEditor: 'Abrir en el editor',

  // Tiradores entre columnas (lugares | notas | vista previa).
  resizeColumn: 'Arrastra para cambiar el ancho · doble clic para restablecer',

  // ── Atajos (pie) ────────────────────────────────────────────────────────────
  hintNote: 'nota',
  hintSection: 'sección',
  hintOpen: 'abrir en el editor',
  hintClose: 'cerrar',
  hintDrag: 'Arrastra una nota a un lugar para moverla',
}
