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
    'agent-tasks': {
      title: 'Encarga tareas a tu agente de IA',
      body: 'Convierte una tarea de tu checklist en un encargo para tu agente de código (Claude Code, Codex…). Pulsa el icono del robot junto a ella y luego Ejecutar: el agente trabaja en su terminal mientras la nota muestra su progreso en vivo, marca la tarea al acabar y deja su informe a un clic. Actívalo en Ajustes → IA → Tareas con agentes.',
    },
    'linked-files': {
      title: 'Edita cualquier archivo de texto en su sitio',
      body: 'Vincula un archivo Markdown o de texto (el README de un proyecto, un .txt, una configuración) con clic derecho en el + grande o soltándolo en la ventana, o ábrelo desde el sistema ("Abrir con" → NoteFlow). Editas el original: los cambios llegan a su proyecto y a su historial de Git, y lo que cambie fuera aparece aquí. Los archivos vinculados son solo locales.',
    },
    drawings: {
      title: 'Dibuja dentro de tus notas',
      body: 'Escribe /draw para abrir un lienzo y esbozar con formas, flechas y texto; pulsa Hecho y el dibujo queda en la nota, guardado como texto plano que sincroniza como todo lo demás. Los diagramas escritos en Mermaid —por ti, por la IA o por el CLI— también se dibujan, y puedes seguir editándolos a mano.',
    },
    'release-2-3-0': {
      title: 'También nuevo en la v2.3',
      body: 'Mejoras más pequeñas que llegan con esta versión. Pulsa una para ver qué hace y dónde está.',
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
    tables: 'Tablas tipo hoja de cálculo',
    versionHistory: 'Historial de versiones',
    autocomplete: 'Autocompletado con IA (beta)',
    navHistory: 'Atrás y adelante ({nav})',
    dragOut: 'Saca una nota a su ventana',
    taskDrag: 'Arrastra tareas para ordenarlas',
    checkedToBottom: 'Las tareas hechas bajan al final',
    taskProgress: 'Progreso de las checklists',
  },

  extrasInfo: {
    encrypted: 'Abre el menú ⋯ de una nota → Cifrar nota y elige una contraseña. Con clic derecho sobre ella en el sidebar la desbloqueas o la vuelves a bloquear.',
    templates: 'Convierte cualquier nota en plantilla desde su menú ⋯ → Guardar como plantilla. Crea notas nuevas a partir de ella en Ajustes → Plantillas.',
    themes: 'Elige entre 14 temas claros y oscuros en Ajustes → Apariencia y ajusta ahí el color de acento, la fuente y los colores del editor.',
    alarms: 'Pasa el ratón por una tarea y pulsa su icono de calendario para ponerle fecha límite y hora de alarma. Te avisará una notificación del sistema a su hora.',
    split: '{split} sobre una nota del sidebar (o clic derecho → Abrir en paralelo) para abrirla junto a la actual.',
    cli: 'El comando noteflow, que viene con la app, lee y escribe tus notas desde cualquier terminal. Agentes de IA como Claude Code o Codex reciben también su skill (Ajustes → IA → Skill del CLI).',
    import: 'Ve a Ajustes → Datos → Importar notas y elige Notion o Google Keep: te explica cómo exportar tus notas desde allí.',
    tables: 'Inserta una con /table. Pasa el ratón por una celda para ver las asas de su fila y su columna (menús, arrastrar para mover), arrastra el borde derecho de una columna para cambiar su ancho, selecciona celdas para ver su suma y copia o pega desde y hacia Excel o Sheets.',
    versionHistory: 'Con NoteFlow Cloud, cada sección guarda sus versiones anteriores durante 30 días. Abre el menú ⋯ de la sección en el editor (o clic derecho en su pestaña) → Historial de versiones para compararlas, previsualizarlas y restaurar una.',
    autocomplete: 'Con un plan NoteFlow AI, actívalo en Ajustes → IA → Autocompletado. Mientras escribes aparece en gris una continuación corta: Tab la acepta y Esc la descarta.',
    navHistory: 'Los botones laterales del ratón o {nav} te llevan atrás y adelante por las notas y vistas que has visitado, como en un navegador.',
    dragOut: 'Arrastra una nota desde el sidebar o la vista de contenido y suéltala fuera de la ventana de NoteFlow: se abre en su propia ventana, justo donde la sueltas.',
    taskDrag: 'Pasa el ratón por una tarea y arrastra el asa ⋮⋮ de su izquierda para moverla, con sus subtareas, a cualquier punto de la lista.',
    checkedToBottom: 'Activa Ajustes → Editor → Mover las tareas marcadas al final: al marcar una tarea baja al final de su lista, y al desmarcarla vuelve encima de las hechas.',
    taskProgress: 'Con el ancho Legible, cada checklist de dos o más tareas lleva en el margen izquierdo un riel fino que se va llenando al marcarlas. Se desactiva en Ajustes → Editor → Progreso de las checklists.',
  },

  settings: {
    playTour: 'Ver el tour completo',
    playTourHint: 'Un repaso rápido y visual de todo lo que puede hacer NoteFlow.',
    slidesTitle: 'Diapositivas',
    releasesTitle: 'Novedades por versión',
    newBadge: 'Nuevo',
    openSlide: 'Abrir «{title}»',
    sinceVersion: 'v{version}',
  },
}
