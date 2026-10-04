import type { Messages } from '../en'

export const palette: Messages['palette'] = {
  commands: {
    newNote: { label: 'Nueva nota', description: 'Crear una nota en blanco · Ctrl+N' },
    newTempNote: { label: 'Nueva nota temporal', description: 'Se borra sola en 24 h · Ctrl+Shift+N' },
    createGroup: { label: 'Crear grupo', description: 'Organiza tus notas en un grupo nuevo' },
    openBrain: { label: 'Abrir el Cerebro', description: 'Explora tus notas como un grafo 3D' },
    aiChat: { label: 'Chatear con la IA', description: 'Pregunta lo que sea a tus notas' },
    aiAsk: { label: 'Preguntar a la IA…', description: 'Escribe una pregunta y envíala directa al chat' },
    aiRelated: { label: 'Buscar notas relacionadas', description: 'Conexiones sugeridas por la IA para una nota' },
    aiProfile: { label: 'Perfil de IA', description: 'Revisa o configura tu segundo cerebro' },
    aiSettings: { label: 'Ajustes del proveedor de IA', description: 'Configura el modelo de chat y la clave API' },
    export: { label: 'Exportar notas', description: 'Guarda las notas en un archivo' },
    import: { label: 'Importar notas', description: 'Carga notas desde un archivo' },
    sync: { label: 'Sincronizar notas', description: 'Descarga lo último de GitHub' },
    githubSync: { label: 'GitHub Sync', description: 'Abre la configuración de sincronización' },
    checkUpdate: { label: 'Buscar actualizaciones', description: 'Comprueba si hay una versión nueva de NoteFlow' },
    startup: { label: 'Ajustes de arranque', description: 'Autoarranque y notas fijas al iniciar' },
    openFolder: { label: 'Abrir la carpeta de notas' },
    shortcuts: { label: 'Atajos de teclado', description: 'Abre la referencia de atajos' },
    openSectionWindow: { label: 'Abrir sección en ventana nueva', description: 'Edita la sección activa en su propia ventana' },
  },

  searchPlaceholder: 'Busca notas o ejecuta un comando...',
  groupNamePlaceholder: 'Nombre del grupo...',
  askPlaceholder: 'Pregunta lo que sea a tus notas…',
  commandsBreadcrumb: 'Comandos ›',

  press: 'Pulsa',
  createSuffix: 'para crear',
  typeGroupName: 'Escribe un nombre para el nuevo grupo',
  escToGoBack: 'Esc para volver',
  askSuffix: 'para preguntar a la IA sobre tus notas',
  typeQuestion: 'Escribe una pregunta para la IA',
  opensBrainChat: 'Abre el chat del Cerebro · Esc para volver',

  quickShortcuts: 'Atajos rápidos',
  hide: 'ocultar',
  scPalette: 'paleta',
  scNote: 'nota',
  scSearch: 'buscar',
  scRawEditor: 'crudo/editor',

  results: { one: '{count} resultado', other: '{count} resultados' },
  noResults: 'Sin resultados para "{query}"',
  commandsHeader: 'Comandos',
  notesHeader: 'Notas',

  footer: {
    navigate: 'navegar',
    select: 'seleccionar',
    close: 'cerrar',
    toggle: 'abrir/cerrar',
    ask: 'preguntar',
    create: 'crear',
    back: 'volver',
  },
}
