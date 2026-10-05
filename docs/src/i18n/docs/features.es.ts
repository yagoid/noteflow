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
      'Los detalles que hacen distinto a NoteFlow: grupos, carpetas y secciones, plantillas de nota, sticky notes siempre encima que se pliegan a píldora, enlaces sección-a-sección, notas cifradas con AES-256, privacidad de IA por sección, 14 temas y el mapa de teclado completo.',
  },

  hero: {
    kicker: 'NoteFlow · Funcionalidades',
    h1: 'Cada<br />detalle.',
    tagline:
      'Las pequeñas decisiones que hacen que una app de notas no estorbe — organización, stickies, enlaces, privacidad y temas, todo documentado.',
  },

  toc: [
    { id: 'organize', label: 'Organizar' },
    { id: 'templates', label: 'Plantillas' },
    { id: 'sticky', label: 'Sticky notes' },
    { id: 'links', label: 'Enlaces de sección' },
    { id: 'shortcuts', label: 'Atajos' },
    { id: 'views', label: 'Vistas' },
    { id: 'temp', label: 'Notas temporales' },
    { id: 'encryption', label: 'Cifrado' },
    { id: 'ai-hidden', label: 'Ocultar a la IA' },
    { id: 'personalize', label: 'Personalizar' },
  ],

  organize: {
    title: 'Grupos, carpetas, notas — y secciones',
    intro: [
      'NoteFlow mantiene la jerarquía deliberadamente plana: los <strong>grupos</strong> contienen <strong>carpetas</strong>, las carpetas contienen <strong>notas</strong> — un solo nivel de anidación, sin árboles infinitos en los que perderse. Cada grupo tiene su propio <strong>color</strong>, y ese color tiñe todo lo que hay dentro: los puntos junto a sus notas, sus carpetas, su región en la vista cerebro. Las notas sin grupo simplemente viven al final del sidebar.',
    ],
    tree: {
      aria: 'La jerarquía de NoteFlow: grupos con código de color que contienen carpetas, notas y sus tags de sección',
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
    sectionsH3: 'Secciones: pestañas dentro de una nota',
    sectionsP: [
      'El cuarto nivel vive <em>dentro</em> de la nota: cada nota puede tener múltiples <strong>secciones</strong> independientes, mostradas como pestañas en la parte superior del editor. Crea una con <kbd>Ctrl</kbd>+<kbd>T</kbd> (o el botón <code>+</code>), <strong>renómbrala</strong> con doble click en la pestaña, <strong>reordénalas</strong> arrastrando las pestañas, y recórrelas con <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd>.',
    ],
    whyP:
      'Las secciones son lo que mantiene la jerarquía plana sin convertir las notas en cajones de sastre: <strong>una nota = un tema, las secciones = sus facetas</strong>. Una nota de proyecto lleva sus propias <em>Notas</em>, <em>Tareas</em> y <em>Dudas</em> en vez de engendrar tres notas hermanas. Y esa granularidad rinde en todas partes: las secciones aparecen como tags clicables en cada tarjeta de nota, el <a href="%AI_URL%">índice semántico embebe cada sección por separado</a> y los <a href="#links">enlaces</a> apuntan a secciones, no a notas enteras.',
  },

  templates: {
    title: 'Plantillas de nota',
    intro: [
      'Cualquier nota cuya estructura no paras de recrear — una revisión semanal, una nota de reunión, un informe de bug — puede convertirse en <strong>plantilla</strong>: su título más su conjunto de secciones, listos para estampar de nuevo.',
    ],
    steps: [
      {
        title: 'Guarda una',
        desc: 'Abre el menú <code>⋯</code> de la toolbar del editor → <strong>Save as template</strong>. Captura el título y las secciones de la nota actual; un pequeño modal pide el nombre de la plantilla.',
      },
      {
        title: 'Úsalas y gestiónalas',
        desc: '<strong>Settings → Templates</strong> lista todo lo que guardaste. <strong>New note</strong> crea una nota nueva a partir de la plantilla (con ids de sección recién generados) y te lleva directo a ella; las plantillas también se pueden <strong>renombrar</strong> (doble click o el botón ✎) y <strong>borrar</strong> (con confirmación).',
      },
    ],
    syncP:
      'Las plantillas viven en <code>templates.json</code> dentro de tu directorio de notas — así que con GitHub sync activado te siguen a cada máquina, como el resto de tus metadatos.',
  },

  sticky: {
    title: 'Sticky notes que flotan sobre todo',
    intro: [
      'Cualquier sección puede salirse de la ventana principal como una <strong>sticky note</strong>: una pequeña ventana sin marco que se mantiene <strong>siempre encima</strong> de lo que estés haciendo — la checklist junto a tu terminal, la referencia junto a tu navegador. Prueba la de abajo: marca las casillas y pulsa el botón <strong>─</strong> para plegarla.',
    ],
    mock: {
      winTitle: 'Checklist de release',
      items: [
        { done: true, text: 'Etiquetar v2.0.0' },
        { done: true, text: 'Actualizar el changelog' },
        { done: false, text: 'Probar los instaladores' },
        { done: false, text: 'Publicar las release notes' },
      ],
      caption: 'Ctrl+S · siempre encima · se pliega a píldora',
      foldAria: 'Plegar la sticky note a una píldora',
      closeAria: 'Cerrar (decorativo en esta demo)',
    },
    bullets: [
      '<kbd>Ctrl</kbd>+<kbd>S</kbd> abre la <strong>sección actual</strong> como sticky; <kbd>Ctrl</kbd>+<kbd>G</kbd> abre <strong>todas las secciones</strong> de la nota a la vez. También hay un botón <code>⧉</code> en la toolbar del editor.',
      'Las stickies nacen a <strong>300 × 300 px</strong> y se redimensionan libremente (mínimo 200 × 200).',
      'Cada sticky es un editor completo: <strong>WYSIWYG o markdown en crudo</strong>, igual que la ventana principal.',
      'Los cambios se sincronizan con la ventana principal <strong>en tiempo real</strong> — es la misma sección, no una copia.',
      'Abre <strong>tantas como quieras</strong>; las stickies plegadas se apilan como píldoras en la esquina de tu pantalla.',
    ],
    startupH3: 'Stickies al arrancar',
    startupP:
      'En <strong>Settings → Startup</strong>, “Open as sticky at startup” te deja elegir secciones que aparecen como stickies en cuanto inicias sesión — tu día empieza con la checklist ya flotando ahí. Requiere tener activado “Launch on system startup”, y las notas cifradas quedan excluidas del selector.',
  },

  links: {
    title: 'Enlaza secciones con secciones',
    intro: [
      'Mientras escribes en el editor rich, teclea <kbd>/</kbd> y elige <strong>Link section</strong>: un buscador lista todas las secciones de todas las notas (filtra por nombre de sección o título de nota). Elige una y una <strong>pill</strong> — un pequeño chip con icono de enlace y el nombre de la sección — cae en tu texto justo donde estabas escribiendo.',
    ],
    mock: {
      before: 'Lanzar la beta — los pendientes están en ',
      pill: 'Checklist de lanzamiento',
      after: ' antes del viernes.',
      brokenLabel: 'Si la sección destino se borra, la pill queda rota:',
      brokenPill: 'Roadmap antiguo',
      rawLabel: 'el mismo enlace en markdown crudo',
      raw: '[Checklist de lanzamiento](noteflow://k3v9pQ/aB3dE9)',
    },
    bullets: [
      '<strong>Click</strong> en una pill navega a la sección destino — en la misma nota o en cualquier otra. <strong>Hover</strong> muestra la misma previsualización flotante que usa el resto de la app.',
      'La pill muestra el nombre del destino <strong>en vivo</strong>: renombra la sección y todas las pills que apuntan a ella se actualizan. Borra el destino y la pill pasa a estado <strong>roto</strong> (atenuada, tachada, sin navegación).',
      'El buscador excluye notas cifradas, archivadas y temporales; el comando <kbd>/</kbd> existe solo en modo rich.',
    ],
    rawP:
      'Por debajo, una pill no tiene nada de exótico — es un enlace markdown normal, <code>[Nombre](noteflow://noteId/sectionId)</code>, guardado dentro del texto de la sección. Eso es exactamente lo que ves en modo raw, y por eso los enlaces <strong>sobreviven al sync, al export y al import</strong> sin cambios.',
    brainP:
      'Estos enlaces también aparecen como <strong>aristas en la vista cerebro</strong>, conectando las dos secciones — y como son estructura explícita tuya, funcionan incluso con la IA y los embeddings <strong>completamente desactivados</strong>.',
  },

  shortcuts: {
    title: 'El mapa de teclado completo',
    intro: [
      'Todo lo de abajo está también listado dentro de la app, en <strong>Settings → Keyboard shortcuts</strong>.',
    ],
    macNote:
      'En macOS, <kbd>Ctrl</kbd> significa <strong>⌘ Cmd</strong> — salvo la navegación de secciones (<kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd>), que usa el <strong>⌃ Control</strong> literal porque ⌘Tab es el conmutador de apps del sistema.',
    colShortcut: 'Atajo',
    colAction: 'Acción',
    groups: [
      {
        label: 'App',
        rows: [
          { combos: [['Ctrl', 'Shift', 'Space']], desc: 'Mostrar / ocultar NoteFlow (global del sistema, funciona desde cualquier app)' },
          { combos: [['Ctrl', 'N']], desc: 'Nueva nota' },
          { combos: [['Ctrl', 'Shift', 'N']], desc: 'Nueva nota temporal (se autoelimina en 24 h)' },
          { combos: [['Ctrl', 'P']], desc: 'Paleta de comandos' },
          { combos: [['Ctrl', 'Shift', 'F']], desc: 'Buscar en todas las notas (sidebar)' },
          { combos: [['Ctrl', "'"]], desc: 'Mostrar / ocultar el sidebar' },
          { combos: [['Ctrl', 'Click']], desc: 'Abrir una nota en paralelo a la actual (vista dividida)' },
        ],
      },
      {
        label: 'Secciones',
        rows: [
          { combos: [['Ctrl', 'T']], desc: 'Nueva sección' },
          { combos: [['Ctrl', 'W']], desc: 'Eliminar la sección actual' },
          { combos: [['Ctrl', 'Tab']], desc: 'Sección siguiente' },
          { combos: [['Ctrl', 'Shift', 'Tab']], desc: 'Sección anterior' },
          { combos: [['Delete']], desc: 'Borrar la nota seleccionada (cuando no estás editando texto)' },
        ],
      },
      {
        label: 'Sticky notes',
        rows: [
          { combos: [['Ctrl', 'S']], desc: 'Abrir la sección actual como sticky' },
          { combos: [['Ctrl', 'G']], desc: 'Abrir todas las secciones de la nota como stickies' },
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
          { combos: [['Ctrl', 'M']], desc: 'Alternar markdown crudo / texto enriquecido' },
          { combos: [['Ctrl', '+'], ['Ctrl', '−'], ['Ctrl', '0']], desc: 'Tamaño de fuente: aumentar / disminuir / reset' },
        ],
      },
    ],
  },

  views: {
    title: 'Cuatro maneras de verlo todo',
    intro: [
      'Más allá del editor, NoteFlow tiene cuatro <strong>vistas a área completa</strong> que sustituyen la superficie de edición (el sidebar se queda como contexto). Son mutuamente excluyentes — abrir una cierra las demás, y seleccionar cualquier nota te devuelve al editor.',
    ],
    cards: [
      {
        tag: '01 / vista de nota',
        name: 'Una nota, todas sus secciones',
        desc: 'Cada sección de una nota como una tarjeta-editor en miniatura — salta directo a una, renombra la nota inline, añade secciones, o selecciona varias tarjetas para <em>Hide from AI</em> / <em>Delete</em> por lotes. Se abre desde el botón de cuadrícula (⊞) junto a la estrella de favorito, o con click derecho → “Note overview”.',
      },
      {
        tag: '02 / vista de grupo',
        name: 'Un grupo, carpeta a carpeta',
        desc: 'Una banda por carpeta (más “No folder” y “Archived”), cada una una cuadrícula responsiva de tarjetas de nota. Arrastra tarjetas entre bandas para reubicarlas, selecciona varias para favorito / archivar / mover / borrar por lotes, y ensancha las tarjetas con un slider para revelar más secciones. Se abre haciendo click en el nombre de un grupo.',
      },
      {
        tag: '03 / all content',
        name: 'Todo el vault, indexado',
        desc: 'Favoritos, grupos (como tiles en acordeón que se expanden inline) y notas sueltas en una sola pantalla — con su propio buscador y un filtro de fecha (Today / Week / Month, más un calendario con marcadores de actividad por día).',
      },
      {
        tag: '04 / vista cerebro',
        name: 'El grafo',
        desc: 'La ventana se parte en dos mitades redimensionables: el panel de IA (chat, notas relacionadas, perfil) a la izquierda, y el grafo neuronal — aristas de estructura más aristas semánticas de contenido — a la derecha.',
      },
    ],
  },

  temp: {
    title: 'Notas que se limpian solas',
    intro: [
      'Hay notas que merecen morir: un teléfono para hoy, una lista de la compra de un día, un buffer de pegado. Las <strong>notas temporales</strong> viven 24 horas y luego se eliminan solas — sin cementerio de notas de una línea.',
    ],
    bullets: [
      'Crea una con <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>, con el <strong>botón de reloj</strong> junto a “New note”, o con click derecho sobre “New note” → <em>Temporary note (24h)</em>.',
      'La caducidad es un timestamp <code>expiresAt</code> en el frontmatter de la nota — visible, portable, editable.',
      'El proceso principal comprueba <strong>cada minuto</strong> y borra las notas vencidas automáticamente — también del repo de sync remoto, para que no resuciten en otra máquina.',
      'Se marcan con un <strong>icono de reloj ⏱</strong> en el sidebar, y la cabecera del editor muestra exactamente cuándo: <em>“Deletes &lt;fecha · hora&gt;”</em>.',
    ],
  },

  encryption: {
    title: 'Notas cifradas',
    intro: [
      'Las notas con secretos de verdad pueden bloquearse con su propia contraseña, directamente desde el menú contextual de la nota: <strong>Encrypt note</strong> pide una contraseña; <strong>Unlock</strong> la abre solo durante la sesión actual; <strong>Lock</strong> la vuelve a cerrar; <strong>Remove encryption</strong> la convierte de nuevo en una nota normal. Una nota bloqueada no muestra contenido en ninguna parte de la app.',
    ],
    bullets: [
      '<strong>AES-256-GCM</strong>, con la clave derivada vía <strong>PBKDF2 — 310.000 iteraciones de SHA-256</strong>.',
      'Sin master key, sin puerta trasera de recuperación: <strong>pierdes la contraseña, pierdes la nota</strong>. Esa es la gracia.',
      'El <a href="%CLI_URL%">CLI</a> ignora por completo las notas cifradas.',
      'Las notas cifradas nunca entran al <a href="%AI_URL%">índice de IA</a> ni al grafo del cerebro — su texto en claro queda fuera de todo artefacto derivado.',
    ],
  },

  aiHidden: {
    title: 'Secciones que la IA nunca ve',
    intro: [
      'El cifrado es la herramienta pesada; a veces solo quieres que el modelo se salte algo — una nota de salario, una sección de diario, ruido sin más. <strong>Hide from AI</strong> es un toggle por sección: actívalo en el menú <code>⋯</code> del editor, o con click derecho sobre cualquier tag de sección en el sidebar y las vistas.',
    ],
    bullets: [
      'Una sección oculta se cae del <strong>índice semántico</strong> (y se borra de él si ya estaba indexada), nunca entra al <strong>contexto del chat</strong> ni a <strong>Related notes</strong>, desaparece del <strong>grafo del cerebro</strong> y se omite de las <strong>tools del agente</strong> — el modelo ni siquiera ve su id.',
      'Las secciones ocultas llevan un icono <strong>EyeOff</strong> en su pestaña del editor, en los tags del sidebar y en las tarjetas de las vistas; <em>Show to AI</em> revierte el toggle y re-indexa la sección.',
      'El resto de la app trata las secciones ocultas con total normalidad — es una frontera de IA, no de la app.',
    ],
    moreP:
      'La frontera se aplica en el proceso principal, en todas las superficies de IA a la vez — el cuadro completo está en <a href="%AI_URL%">Cómo funciona la IA → privacidad</a>.',
  },

  personalize: {
    title: 'Hazlo tuyo',
    intro: [
      'NoteFlow trae <strong>14 temas afinados a mano</strong> — 11 oscuros, 3 claros — y cada uno empareja su paleta con su propia fuente de UI. El default es <strong>NoteFlow Dark</strong>, el mismo casi-negro cálido + ámbar que estás viendo en este sitio.',
    ],
    darkLabel: 'Oscuros · 11',
    lightLabel: 'Claros · 3',
    moreP:
      'Más allá del tema, <strong>Settings → Appearance</strong> expone los mandos por separado: la <strong>fuente</strong> de toda la app, el <strong>color de acento</strong>, los <strong>colores del editor</strong> (encabezados, cursiva, código inline y la barra de acento de bloques de código y citas) y la <strong>escala</strong> general de la UI. El editor tiene sus propios ajustes de fuente y tamaño, independientes del chrome.',
    widthP:
      'Y para escribir largo, <strong>Settings → Editor → Content width</strong> alterna el editor entre <strong>Full</strong> (el contenido usa toda el área del editor) y <strong>Readable</strong> — una columna centrada de ~72 caracteres, estilo iA Writer, donde solo tablas e imágenes rompen a ancho completo. Además, las secciones con encabezados tienen un <strong>índice</strong>: una columna de rayitas en el borde derecho del editor que, al pasar el ratón, se despliega con los encabezados H1–H3 — pulsa uno para ir hasta él con un scroll suave (se activa o desactiva en <strong>Settings → Editor → Table of contents</strong>).',
  },
};
