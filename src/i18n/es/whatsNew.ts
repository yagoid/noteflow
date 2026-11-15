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
      body: 'Cada nota guarda secciones en pestañas: un proyecto, muchas páginas. Pulsa + en la barra de pestañas (o {newSection}) para crear una, ponle nombre y escribe; {nextSection} salta entre ellas.',
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
      body: '¿Necesitas un borrador? El botón del temporizador en el sidebar ({tempNote}) abre una nota temporal: apúntalo y se borra sola en 24 h. Cambia cuándo desde su fecha o hazla permanente. Y {showApp} trae NoteFlow desde cualquier sitio.',
    },
    windows: {
      title: 'Sticky notes y ventanas separadas',
      body: 'Fija una sección encima de todo con {sticky} o sácala a su propia ventana para trabajar en paralelo.',
    },
    brain: {
      title: 'Conoce el Cerebro',
      body: 'Cada nota es un nodo y cada enlace una conexión, calculado en tu equipo. En su panel de IA elige un proveedor (tu clave API, un modelo local o NoteFlow AI) y pregunta: se iluminan las notas que usa.',
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
      body: 'Bajo cada nota del sidebar, una línea fina dibuja sus secciones: deja el ratón encima para desplegarlas y haz clic en una para ir directo. ¿Prefieres la fila siempre visible? Cámbialo en el menú ⋯ de abajo del sidebar → Secciones.',
    },
    snippets: {
      title: 'Fragmentos a un clic',
      body: 'El botón del sello en la barra de herramientas inserta tu fragmento por defecto en el cursor, con la fecha de hoy. Su flecha muestra el resto y te deja crear los tuyos.',
    },
    'linked-files': {
      title: 'Edita cualquier archivo Markdown en su sitio',
      body: 'Vincula un .md que ya existe (el README de un proyecto, tu documentación) con clic derecho en el + grande o soltándolo en la ventana. Editas el archivo original: los cambios llegan a su proyecto y a su historial de Git, y lo que cambie fuera aparece aquí. Los archivos vinculados son solo locales.',
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

  extrasInfo: {
    encrypted: 'Abre el menú ⋯ de una nota → Cifrar nota y elige una contraseña. Con clic derecho sobre ella en el sidebar la desbloqueas o la vuelves a bloquear.',
    templates: 'Convierte cualquier nota en plantilla desde su menú ⋯ → Guardar como plantilla. Crea notas nuevas a partir de ella en Ajustes → Plantillas.',
    themes: 'Elige entre 14 temas claros y oscuros en Ajustes → Apariencia y ajusta ahí el color de acento, la fuente y los colores del editor.',
    alarms: 'Pasa el ratón por una tarea y pulsa su icono de calendario para ponerle fecha límite y hora de alarma. Te avisará una notificación del sistema a su hora.',
    split: '{split} sobre una nota del sidebar (o clic derecho → Abrir en paralelo) para abrirla junto a la actual.',
    cli: 'El comando noteflow, que viene con la app, lee y escribe tus notas desde cualquier terminal. Agentes de IA como Claude Code o Codex reciben también su skill (Ajustes → General → Exponer la skill del CLI a los agentes de IA).',
    import: 'Ve a Ajustes → Datos → Importar notas y elige Notion o Google Keep: te explica cómo exportar tus notas desde allí.',
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
