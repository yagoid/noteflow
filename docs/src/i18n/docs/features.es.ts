// Copia en español de la página /features (/noteflow/es/features/). Debe satisfacer
// exactamente la misma forma que features.en.ts (`FeaturesContent`). Los términos
// técnicos y nombres propios (NoteFlow, sticky, markdown, GitHub, nombres de temas,
// WYSIWYG…) se mantienen en su forma original. Los atajos de teclado son idénticos
// en ambos idiomas (solo se traduce la descripción).
import type { FeaturesContent } from './features.en';

export const featuresEs: FeaturesContent = {
  meta: {
    title: 'Funcionalidades de NoteFlow — sticky notes, plantillas, cifrado y más',
    description:
      'Los detalles que hacen distinto a NoteFlow: grupos, carpetas y secciones, plantillas de nota, sticky notes siempre encima que se pliegan a píldora, enlaces sección-a-sección, fragmentos con fechas vivas, notas cifradas con AES-256, privacidad de IA por sección, 14 temas y el mapa de teclado completo.',
  },

  hero: {
    kicker: 'NoteFlow · Funcionalidades',
    h1: 'Cada<br />detalle.',
    tagline: 'Las pequeñas decisiones que hacen que una app de notas no estorbe.',
  },

  toc: [
    { id: 'organize', label: 'Organizar' },
    { id: 'templates', label: 'Plantillas' },
    { id: 'sticky', label: 'Sticky notes' },
    { id: 'links', label: 'Enlaces de sección' },
    { id: 'snippets', label: 'Fragmentos' },
    { id: 'shortcuts', label: 'Atajos' },
    { id: 'views', label: 'Vistas' },
    { id: 'temp', label: 'Notas temporales' },
    { id: 'encryption', label: 'Cifrado' },
    { id: 'ai-hidden', label: 'Ocultar de la IA' },
    { id: 'personalize', label: 'Personalizar' },
  ],

  clip: { play: 'Reproducir clip', pause: 'Pausar clip' },

  organize: {
    title: 'Grupos, carpetas, notas — y secciones',
    lede: 'Árbol plano por fuera, mapa de secciones por dentro: <strong>una nota, un tema; las secciones, sus facetas</strong>, cada una <a href="%AI_URL%">indexada aparte</a>.',
    clipLabel:
      'Grabación de pantalla: al dejar el ratón sobre una nota del sidebar, su línea plegada se despliega en el mapa de secciones, al pasar por una sección aparece su tarjeta de vista previa y un clic la abre en el editor; después, en Ajustes → Apariencia se elige cómo ver las secciones en el sidebar: mapa plegado o fila con scroll.',
    clipCaption: 'señala · previsualiza · abre',
    facts: [
      { title: 'Grupos con color', desc: 'Grupos → carpetas → notas, un solo nivel. Su color tiñe todo lo de dentro.' },
      { title: 'Mapa de secciones', desc: '<kbd>Ctrl</kbd>+<kbd>T</kbd> crea, doble clic renombra, arrastrar reordena, <kbd>Ctrl</kbd>+<kbd>Tab</kbd> las recorre.' },
      { title: 'Sidebar plegado', desc: 'Una línea por nota, un tramo por sección. Pasa el ratón para desplegar y previsualizar.' },
      { title: 'Iconos y vistazos', desc: '27 iconos de carpeta (clic derecho → Cambiar icono). Grupo plegado: pasa el ratón y busca en sus notas.' },
    ],
    tree: {
      aria: 'La jerarquía de NoteFlow: grupos con código de color que contienen carpetas y notas, cada nota con sus secciones dibujadas como un mapa plegado',
      caption: 'grupo → carpeta → nota → secciones',
      groups: [
        {
          name: 'Trabajo',
          folders: [
            {
              name: 'Backend',
              notes: [
                { title: 'Rediseño de la API', sections: ['Notas', 'Tareas'] },
                { title: 'Plan de deploy', sections: ['Checklist'] },
              ],
            },
          ],
          notes: [{ title: 'Registro de reuniones', sections: ['Hoy', 'Dudas'] }],
        },
        {
          name: 'Personal',
          folders: [],
          notes: [{ title: 'Ideas de viaje', sections: ['Sitios', 'Presupuesto'] }],
        },
      ],
      ungroupedLabel: 'Sin grupo',
      ungroupedNotes: [{ title: 'Borrador rápido', sections: ['Ideas'] }],
    },
  },

  templates: {
    title: 'Plantillas de nota',
    lede: 'La nota que no paras de recrear — una revisión semanal, una reunión, un informe de bug — se convierte en <strong>plantilla</strong>: su título más sus secciones.',
    flowAria: 'Cómo funcionan las plantillas: guarda una desde el menú de la nota y crea notas nuevas a partir de ella en Ajustes',
    steps: [
      {
        tag: '01 · guardar',
        path: ['⋯', 'Guardar como plantilla'],
        desc: 'Captura el título y las secciones de la nota abierta.',
      },
      {
        tag: '02 · reutilizar',
        path: ['Ajustes', 'Plantillas', 'Nueva nota'],
        desc: 'Una copia nueva, lista para rellenar. Ahí también se renombran o borran.',
      },
    ],
    syncP: 'Se guardan en <code>templates.json</code>, en tu directorio de notas — y se sincronizan como el resto de tus metadatos.',
  },

  sticky: {
    title: 'Sticky notes que flotan sobre todo',
    lede: 'Cualquier sección se sale a una ventanita sin marco que queda <strong>siempre encima</strong>: <kbd>Ctrl</kbd>+<kbd>S</kbd> para la sección actual, <kbd>Ctrl</kbd>+<kbd>G</kbd> para todas. Prueba la de ejemplo.',
    clipLabel:
      'Grabación de pantalla: Ctrl+S saca la sección abierta de la ventana principal como una sticky note flotante; una tarea escrita en la sticky aparece a la vez en la ventana principal.',
    clipCaption: 'ctrl+s · misma sección, dos ventanas',
    mock: {
      winTitle: 'Checklist de release',
      items: [
        { done: true, text: 'Etiquetar v2.0.0' },
        { done: true, text: 'Actualizar el changelog' },
        { done: false, text: 'Probar los instaladores' },
        { done: false, text: 'Publicar las release notes' },
      ],
      caption: 'marca · pliega a píldora',
      switchHint: 'Cambiar de sección',
      foldAria: 'Plegar la sticky note a una píldora',
      closeAria: 'Cerrar (decorativo en esta demo)',
    },
    facts: [
      { title: 'Se pliega a píldora', desc: 'El botón ─ la pliega; abre tantas como quieras.' },
      { title: 'En vivo, no una copia', desc: 'Lo que escribes aparece en la ventana principal en tiempo real.' },
      { title: 'Cambia de sección', desc: 'El nombre de la sección en la barra de título abre un desplegable con las demás.' },
      { title: 'Al arrancar', desc: '<strong>Ajustes → Inicio</strong> abre las secciones que elijas como stickies al iniciar sesión.' },
    ],
  },

  links: {
    title: 'Enlaza secciones con secciones',
    lede: 'Teclea <kbd>/</kbd> → <strong>Enlazar sección</strong>, elige cualquier sección de cualquier nota y una <strong>pill</strong> viva cae en tu texto.',
    clipLabel:
      'Grabación de pantalla: se teclea / y se elige Enlazar sección, se busca una sección y se inserta como pill; después Ctrl+P abre la paleta de comandos y salta a otra nota.',
    clipCaption: '/ enlazar sección · ctrl+p',
    mock: {
      before: 'Lanzar la beta — pendientes en ',
      pill: 'Checklist de lanzamiento',
      after: '.',
      brokenLabel: 'destino borrado',
      brokenPill: 'Roadmap antiguo',
      rawLabel: 'modo texto',
      raw: '[Checklist de lanzamiento](noteflow://k3v9pQ/aB3dE9)',
    },
    facts: [
      { title: 'Clic · hover', desc: 'Un clic salta a la sección; el hover muestra su vista previa.' },
      { title: 'Siempre vivas', desc: 'Renombra el destino y todas las pills lo siguen; bórralo y la pill queda rota.' },
      { title: 'Sin IA', desc: 'Enlaces markdown normales, dibujados como aristas en el cerebro aunque la IA esté apagada.' },
    ],
    kanban: {
      title: 'Un tablero kanban, dentro de la nota',
      desc: 'El mismo menú <kbd>/</kbd>: <kbd>/kanban</kbd> inserta un tablero de tarjetas que arrastras — guardado como markdown plano.',
      clipLabel: 'Grabación de pantalla: /kanban inserta un tablero en la nota, se añade una tarjeta y se arrastra a la columna Hecho.',
      clipCaption: '/kanban',
    },
  },

  snippets: {
    title: 'Fragmentos, con la fecha ya puesta',
    lede: 'Markdown reutilizable que cae en el cursor con un clic, sellado con la fecha y la hora del momento en que lo insertas.',
    clipLabel:
      'Grabación de pantalla: el botón de sello de la toolbar inserta el fragmento por defecto — la fecha de hoy como encabezado — en el cursor; después su flecha lista todos los fragmentos con vista previa y “Configurar fragmentos…”.',
    clipCaption: 'sello · por defecto · lista',
    mock: {
      sourceLabel: 'fragmento',
      source: '## {date:dddd, D [de] MMMM [de] YYYY} · {time}',
      outputLabel: 'insertado',
      output: 'domingo, 8 de noviembre de 2026 · 09:30',
    },
    facts: [
      { title: 'Botón partido', desc: 'El sello inserta el de por defecto; su chevron lista los demás.' },
      { title: 'En el menú /', desc: 'Escribe parte del nombre, o <kbd>/fragmento</kbd> para verlos todos.' },
      { title: 'Variables vivas', desc: '<code>{date}</code>, <code>{time}</code> o tu propio formato, como <code>{date:dddd, D [de] MMMM}</code>.' },
      { title: 'Sincronizados', desc: 'En <code>snippets.json</code>, por GitHub o por NoteFlow Cloud.' },
    ],
  },

  shortcuts: {
    title: 'El mapa de teclado completo',
    lede: 'También dentro de la app, en <strong>Ajustes → Atajos de teclado</strong>.',
    macNote:
      'En macOS <kbd>Ctrl</kbd> es <strong>⌘</strong> — salvo <kbd>Ctrl</kbd>+<kbd>Tab</kbd> entre secciones, que sigue siendo <strong>⌃ Control</strong>.',
    groups: [
      {
        label: 'App',
        rows: [
          { combos: [['Ctrl', 'Shift', 'Space']], desc: 'Mostrar / ocultar NoteFlow, desde cualquier app' },
          { combos: [['Ctrl', 'N']], desc: 'Nueva nota' },
          { combos: [['Ctrl', 'Shift', 'N']], desc: 'Nueva nota temporal (24 h)' },
          { combos: [['Ctrl', 'P']], desc: 'Paleta de comandos' },
          { combos: [['Ctrl', 'Shift', 'F']], desc: 'Buscar en todas las notas' },
          { combos: [['Ctrl', "'"]], desc: 'Fijar / desfijar el sidebar' },
          { combos: [['Ctrl', 'Click']], desc: 'Abrir una nota en vista dividida' },
        ],
      },
      {
        label: 'Secciones',
        rows: [
          { combos: [['Ctrl', 'T']], desc: 'Nueva sección' },
          { combos: [['Ctrl', 'W']], desc: 'Eliminar la sección actual' },
          { combos: [['Ctrl', 'Tab']], desc: 'Sección siguiente' },
          { combos: [['Ctrl', 'Shift', 'Tab']], desc: 'Sección anterior' },
          { combos: [['Delete']], desc: 'Borrar la nota seleccionada (fuera del editor)' },
        ],
      },
      {
        label: 'Sticky notes',
        rows: [
          { combos: [['Ctrl', 'S']], desc: 'La sección actual como sticky' },
          { combos: [['Ctrl', 'G']], desc: 'Todas las secciones como stickies' },
        ],
      },
      {
        label: 'Editor',
        rows: [
          { combos: [['Ctrl', 'Z'], ['Ctrl', 'Y']], desc: 'Deshacer / rehacer' },
          { combos: [['Ctrl', 'B'], ['Ctrl', 'I'], ['Ctrl', 'U']], desc: 'Negrita / cursiva / subrayado' },
          { combos: [['Ctrl', 'E']], desc: 'Código inline' },
          { combos: [['Ctrl', 'Shift', 'B']], desc: 'Bloque de código' },
          { combos: [['Ctrl', 'F']], desc: 'Buscar dentro de la nota' },
          { combos: [['Ctrl', 'M']], desc: 'Modo texto / markdown' },
          { combos: [['Ctrl', '+'], ['Ctrl', '−'], ['Ctrl', '0']], desc: 'Tamaño de fuente: más / menos / reset' },
        ],
      },
    ],
  },

  views: {
    title: 'Tres maneras de verlo todo',
    lede: 'Tres <strong>vistas a área completa</strong> ocupan el sitio del editor mientras el sidebar se queda como contexto. Elige cualquier nota para volver.',
    cards: [
      {
        tag: '01 / vista de nota',
        name: 'Una nota, todas sus secciones',
        desc: 'Cada sección como una celda con su contenido real. Arrastra, renombra, edita por lotes.',
      },
      {
        tag: '02 / vista de contenido',
        name: 'Todo, o un grupo, por fecha',
        desc: 'Lugares, notas en bloques por fecha y una vista previa de solo lectura, en tres columnas.',
      },
      {
        tag: '03 / vista cerebro',
        name: 'El grafo',
        desc: 'El panel de IA a la izquierda y el grafo neuronal de tus notas a la derecha.',
      },
    ],
    brainClip: {
      label: 'Grabación de pantalla: se abre la vista cerebro con el panel de IA a la izquierda y el grafo 3D de notas a la derecha; se gira el grafo y se pulsa un nodo de nota para previsualizarla.',
      caption: '03 · vista cerebro',
    },
    sidebarClip: {
      label: 'Grabación de pantalla: Ctrl+\' desfija el sidebar y lo deja en un minimapa fino; al llevar el ratón al borde izquierdo el sidebar entero entra deslizando sobre el contenido, y al pasar por un grupo plegado se ven sus notas.',
      caption: 'ctrl+\' · sidebar flotante',
    },
    sidebarNote: '<strong>Sidebar flotante:</strong> <kbd>Ctrl</kbd>+<kbd>\'</kbd> lo pliega en un minimapa; acerca el ratón al borde y entra deslizando.',
  },

  temp: {
    title: 'Notas que se limpian solas',
    lede: 'Para el teléfono que solo necesitas hoy: las <strong>notas temporales</strong> se eliminan solas a las 24 horas.',
    clipLabel:
      'Grabación de pantalla: Ctrl+Shift+N crea una nota temporal con “Se elimina el …” en su cabecera y se escribe una línea; el chevron de al lado abre el menú “Eliminar en” (de 1 h a 48 h, o Hacer permanente) y mueve el borrado a dentro de 8 horas.',
    clipCaption: 'ctrl+shift+n · se borra en 24 h',
    facts: [
      { title: 'Un atajo', desc: '<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>, o el botón de reloj bajo el de nuevo grupo.' },
      { title: 'Borradas en todas partes', desc: 'También del remoto de sync, para que no resuciten.' },
      { title: 'Cambia de idea', desc: 'El chevron de <em>Se elimina el …</em> elige 1–48 h, o la hace permanente.' },
    ],
  },

  encryption: {
    title: 'Notas cifradas',
    lede: 'Bloquea una nota con su propia contraseña desde su menú contextual. Bloqueada, no muestra contenido en ninguna parte de la app.',
    mock: {
      title: 'Contraseñas',
      lines: ['Wi-Fi · luces-del-puerto-42', 'Admin del router · 8Kq!e2', 'Código del portal · 4719'],
      lockedLabel: 'AES-256-GCM',
      lockAria: 'Bloquear la nota de ejemplo',
      unlockAria: 'Desbloquear la nota de ejemplo',
    },
    facts: [
      { title: 'AES-256-GCM', desc: 'Clave derivada con PBKDF2: 310.000 iteraciones de SHA-256.' },
      { title: 'Sin puerta trasera', desc: 'Sin master key ni recuperación: pierdes la contraseña, pierdes la nota.' },
      { title: 'Fuera de alcance', desc: 'Ni el <a href="%CLI_URL%">CLI</a> ni el <a href="%AI_URL%">índice de IA</a> las leen.' },
    ],
  },

  aiHidden: {
    title: 'Secciones que la IA nunca ve',
    lede: '<strong>Ocultar de la IA</strong> es un interruptor por sección, en el menú <code>⋯</code> del editor o en el menú contextual de una sección.',
    mock: {
      aria: 'Tres secciones de una nota alimentan el índice de IA; la oculta de la IA queda cortada antes de llegar',
      sections: ['Roadmap', 'Salario', 'Ideas'],
      hiddenIndex: 1,
      target: 'índice · chat · grafo · tools',
    },
    facts: [
      { title: 'Fuera de toda la IA', desc: 'Índice, contexto del chat, notas relacionadas, grafo del cerebro y tools del agente.' },
      { title: 'Solo para la IA', desc: 'La marca un icono EyeOff; el resto de la app la trata con normalidad.' },
      { title: 'Una sola frontera', desc: 'Se aplica en el proceso principal — ver <a href="%AI_URL%">Cómo funciona la IA → privacidad</a>.' },
    ],
  },

  personalize: {
    title: 'Hazlo tuyo',
    lede: '<strong>14 temas afinados a mano</strong> — 11 oscuros, 3 claros — cada uno con su fuente de UI. El de serie, <strong>NoteFlow Dark</strong>, es el casi-negro cálido + ámbar de este sitio.',
    clipLabel:
      'Grabación de pantalla: en Ajustes → Apariencia, al pulsar las tarjetas de tema toda la app cambia en vivo — NoteFlow Dark, Midnight Blue, Arctic Day, NoteFlow Light.',
    clipCaption: 'ajustes → apariencia · en vivo',
    darkLabel: 'Oscuros · 11',
    lightLabel: 'Claros · 3',
    facts: [
      { title: 'Ajuste fino', desc: 'Fuente, acento, colores del editor y escala de la UI en <strong>Ajustes → Apariencia</strong>.' },
      { title: 'Ancho legible', desc: 'Una columna centrada de ~72 caracteres; solo tablas e imágenes la rompen.' },
      { title: 'Índice', desc: 'Unas rayitas en el borde derecho del editor se despliegan en sus encabezados H1–H3.' },
    ],
  },
};
