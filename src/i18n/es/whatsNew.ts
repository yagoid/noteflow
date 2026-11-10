import type { Messages } from '../en'

// Espejo de en/whatsNew.ts. Los `{placeholders}` de los cuerpos son los atajos de cada
// diapositiva (los rellena el componente con las etiquetas de la plataforma).
export const whatsNew: Messages['whatsNew'] = {
  titleDiscover: 'Descubre NoteFlow',
  titleNew: 'Novedades de NoteFlow v{version}',
  titleNewNoVersion: 'Novedades de NoteFlow',
  dialogLabel: 'Novedades de NoteFlow',
  counter: '{current} / {total}',
  back: 'Atrás',
  next: 'Siguiente',
  skip: 'Saltar',
  startWriting: 'Empezar a escribir',
  close: 'Cerrar el tour',
  progressLabel: 'Diapositivas del tour',
  goToSlide: 'Ir a la diapositiva {n}: {title}',
  keysLabel: 'Atajos',
  keyboardHint: '← → para moverte · Esc para cerrar',

  slides: {
    sections: {
      title: 'Notas que crecen a lo ancho',
      body: 'Cada nota guarda secciones en pestañas: un proyecto, muchas páginas. {newSection} crea una y {nextSection} salta entre ellas.',
    },
    kanban: {
      title: 'Un kanban dentro de tu nota',
      body: 'Escribe /kanban y arrastra tarjetas entre columnas. Por debajo es markdown plano, así que se sincroniza en todas partes.',
    },
    'links-palette': {
      title: 'Enlaza lo que quieras, salta a donde quieras',
      body: 'Escribe / → Enlazar sección para conectar ideas entre notas. {palette} abre la paleta de comandos para llegar a cualquier nota o acción.',
    },
    'quick-capture': {
      title: 'Captura en un segundo',
      body: '{showApp} trae NoteFlow desde cualquier sitio. ¿Necesitas un borrador? {tempNote} crea una nota temporal que se borra sola en 24 h.',
    },
    windows: {
      title: 'Sticky notes y ventanas separadas',
      body: 'Fija una sección encima de todo con {sticky} o sácala a su propia ventana para trabajar en paralelo.',
    },
    brain: {
      title: 'Conoce el Cerebro',
      body: 'Cada nota es un nodo; cada enlace e idea relacionada, una conexión. Explora tu conocimiento como un grafo vivo, calculado en tu equipo.',
    },
    ai: {
      title: 'IA que conoce tus notas',
      body: 'Chatea con tus notas, deja que el agente las organice y haz crecer tu segundo cerebro. Conecta tu propia API o usa NoteFlow AI.',
    },
    agents: {
      title: 'Tus agentes de IA también toman notas',
      body: 'Claude Code, Codex o cualquier script pueden leer y escribir tus notas con el CLI noteflow. Pídeselo con tus palabras: los cambios aparecen al momento en la app.',
    },
    sync: {
      title: 'Tus notas, en todos tus dispositivos',
      body: 'Sincroniza en privado con tu propio repo de GitHub o activa NoteFlow Cloud con cifrado de extremo a extremo opcional.',
    },
    'section-map': {
      title: 'Todas tus secciones de un vistazo',
      body: 'Bajo cada nota del sidebar, una línea fina dibuja sus secciones: deja el ratón encima para desplegarlas y haz clic en una para ir directo. ¿Prefieres la fila siempre visible? Cámbialo en Ajustes → Apariencia → Secciones en la barra lateral.',
    },
    'floating-sidebar': {
      title: 'Un sidebar que se aparta',
      body: '{toggle} pliega el sidebar en un minimapa finísimo: acerca el ratón al borde izquierdo y vuelve a aparecer. Déjalo sobre un grupo cerrado para ver sus notas sin abrirlo.',
    },
    snippets: {
      title: 'Fragmentos a un clic',
      body: 'El botón del sello en la barra de herramientas inserta tu fragmento por defecto en el cursor, con la fecha de hoy. Su flecha muestra el resto y te deja crear los tuyos.',
    },
    more: {
      title: 'Y mucho más',
      body: 'Pequeños detalles que marcan la diferencia. Los irás encontrando por el camino.',
    },
  },

  extras: {
    encrypted: 'Notas cifradas',
    templates: 'Plantillas',
    themes: 'Temas y acentos',
    alarms: 'Tareas con alarma',
    split: 'Vista dividida ({split})',
    cli: 'CLI para tu terminal y agentes',
    import: 'Importar de Notion y Keep',
  },

  settings: {
    playTour: 'Ver el tour completo',
    playTourHint: 'Un repaso rápido y visual de todo lo que puede hacer NoteFlow.',
    slidesTitle: 'Diapositivas',
    newBadge: 'Nuevo',
    openSlide: 'Abrir «{title}»',
    sinceVersion: 'v{version}',
  },
}
