// Spanish copy for the marketing landing (/noteflow/es/). Must satisfy the exact
// same shape as en.ts (`Content = typeof en`) so no key is ever left untranslated.
// Technical terms and proper nouns (NoteFlow, RAG, CLI, GitHub, Markdown, theme
// names, model vendors…) are intentionally kept in their original form.
import type { Content } from './en';

export const es: Content = {
  meta: {
    title: 'NoteFlow — Notas con cerebro',
    description:
      'Un cuaderno de escritorio dark-first para personas técnicas. Markdown plano en tu disco, un grafo neuronal 3D de tus notas, chat con IA agéntica, una CLI headless y sincroniza a tu manera — un repo privado de GitHub o la nube gestionada. Gratis y open-source, para Windows y Linux.',
  },
  jsonLdDescription:
    'Un segundo cerebro local-first para personas técnicas: notas en markdown, un grafo neuronal 3D, chat con IA agéntica, una CLI headless y sincroniza a tu manera — un repo privado de GitHub o la nube gestionada.',

  rail: {
    home: 'inicio',
    brain: 'El Cerebro',
    what: 'Qué es',
    profile: 'Perfil',
    download: 'Descargar',
    toggleTheme: 'Cambiar tema',
  },

  langSwitch: { label: 'EN', aria: 'View in English' },

  hero: {
    kicker: 'NoteFlow · El Cerebro',
    title: `Notas con<br /><em style="font-style:italic;font-weight:500;">cerebro.</em>`,
    tagline: 'Agiliza la experiencia',
    download: 'Descárgala gratis',
    cta: 'Explora el cerebro ↓',
    scroll: 'Baja',
  },

  intro: {
    kicker: 'Qué es NoteFlow',
    h2: 'Notas rápidas. Cero fricción.',
    p: 'Un cuaderno de escritorio dark-first para personas técnicas. Vive en la bandeja del sistema, escribe Markdown plano en tu propio disco y no estorba hasta que lo necesitas. El cerebro es opcional — la velocidad no.',
    mosaicAria: 'NoteFlow en clips cortos',
    toggleTheme: 'Cambia el tema — todos los clips le siguen',
    pauseClips: 'Pausar clips',
    playClips: 'Reproducir clips',
    cliCta: 'Referencia del CLI →',
    featuresCta: 'Cada detalle →',
    clips: {
      demo: { caption: 'Recorrido · toda la app', label: 'Un recorrido por la app de escritorio NoteFlow' },
      agents: { caption: 'Agente IA · CLI', label: 'Tu agente de IA escribe en tus notas: desde una terminal ejecuta noteflow sections y noteflow add, y la tarea aparece en vivo en NoteFlow' },
      'sections-tab': { caption: 'Ctrl+Tab · secciones', label: 'Ctrl+Tab recorriendo las secciones de una nota' },
      'temp-note': { caption: 'Ctrl+Shift+N · nota temporal', label: 'Ctrl+Shift+N abre una nota temporal que se borra sola a las 24 horas' },
      kanban: { caption: '/kanban · arrastra', label: 'Un tablero kanban dentro de una nota, con una tarjeta arrastrada a otra columna' },
      'slash-snippets': { caption: 'Menú / · fragmentos', label: 'El menú / insertando un fragmento con la fecha de hoy' },
      sticky: { caption: 'Sticky · secciones', label: 'Una sticky note flotante cambiando de sección desde su título' },
      'section-preview': { caption: 'Hover · vista previa', label: 'Al pasar sobre el mapa de secciones de una nota se previsualiza esa sección' },
      themes: { caption: '14 temas', label: 'Cambiando entre varios temas de NoteFlow' },
    },
  },

  brain: {
    kicker: 'El Cerebro · IA local',
    h2: `Cada nota se convierte en <em style="font-style:italic;">una neurona.</em>`,
    p: `Un índice semántico convierte tus notas en un grafo vivo. La estructura que construiste se cablea con líneas sólidas; las relaciones que encontró la IA se encienden como sinapsis a través del núcleo. Haz una pregunta y las notas que usó <span style="color:var(--ink-strong);">brillan</span>.`,
    chatHeader: 'Chat — anclado en tus notas',
    chatHint: 'Haz una pregunta abajo.<br />Mira cómo el cerebro ilumina las notas de las que lee.',
    tryAsking: 'Prueba a preguntar',
    hoverHint: 'arrastra · scroll para zoom · pasa sobre una nota',
    contentOn: 'Capa de contenido · on',
    contentOff: 'Capa de contenido · off',
    cards: [
      { tag: '01 / GRAFO', title: 'Dos capas de conexiones', p: 'Las líneas sólidas son la jerarquía que construiste. Las sinapsis tenues son lo que notó la IA — incluso entre grupos distintos.' },
      { tag: '02 / CHAT', title: 'Chatea con tus notas', p: 'Las respuestas RAG llegan en streaming con citas clicables — y el agente puede crear, mover y organizar notas por ti.' },
      { tag: '03 / PRIVADO', title: '100% local & tuyo', p: 'El índice semántico nunca sale de tu máquina. Usa tu propia clave de modelo — Anthropic, OpenAI, Ollama, lo que sea.' },
    ],
    aiCta: 'Cómo funciona la IA →',
  },

  profile: {
    kicker: 'Perfil · El segundo cerebro',
    h2: `Una IA que <em style="font-style:italic;">de verdad te conoce.</em>`,
    p: `Nada de escribir un ensayo sobre ti. NoteFlow pregunta lo fácil — unos cuantos favoritos, algún esto-o-aquello — y deduce quién eres a partir de lo que esas elecciones <span style="color:var(--ink-strong);">suelen significar</span>. Luego escribe tu perfil como una nota editable.`,
    signal: {
      heading: 'Señal de baja fricción',
      weekends: { label: 'Findes', a: 'Planeados', b: 'Improvisados' },
      recharge: { label: 'Recargar', a: 'Con gente', b: 'A solas' },
      deadlines: { label: 'Deadlines', a: 'Con tiempo', b: 'A última hora' },
      albums: { label: 'Álbumes', value: '3 añadidos' },
      dreamTrip: { label: 'Viaje soñado', value: 'Patagonia, sin prisa' },
    },
    generate: 'Generar perfil',
    card: {
      badge: 'Perfil',
      title: 'Quién eres',
      date: '06/2026',
      howYouWork: { label: 'Cómo trabajas', text: 'Piensas en sistemas y buscas profundidad antes que amplitud. Una pista de despegue planeada gana a improvisar; entregas pronto y luego refinas.' },
      howToTalk: { label: 'Cómo hablarte', text: 'Directo y conciso. Sáltate el calentamiento — primero la respuesta, luego el razonamiento.' },
      inferred: 'inferido de 6 respuestas · 2 documentos · editable como cualquier nota',
    },
    disclaimer: `Descrito en rasgos abstractos — nunca por los títulos exactos que diste. Los favoritos se quedan en una sección de baja relevancia a la que se le dice a la IA que <span style="color:var(--ink-dim);">no</span> saque sin que se lo pidas. El modelo lee tus documentos directamente; NoteFlow nunca los guarda en un servidor.`,
  },

  download: {
    kicker: 'Gratis · Abierto · Privado',
    h2: `Dale un <em style="font-style:italic;">cerebro</em> a tus notas.`,
    windows: 'Windows · Microsoft Store',
    linux: 'Descargar para Linux',
    winStoreNote: `La versión de la Store no trae el CLI y no puede abrirse sola al iniciar Windows. Para las dos cosas, <a data-dl="win-exe" href="https://github.com/yagoid/noteflow/releases/latest" target="_blank" rel="noopener" style="color:var(--ink);text-decoration:underline;text-underline-offset:3px;">usa el instalador de GitHub</a>.`,
    versionLabel: 'Última versión',
    disclaimer: `Tus notas se quedan en tu máquina como archivos <span style="font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--ink-dim);">.md</span> planos. La sincronización es tu propio repo privado de GitHub. Usa tu propia clave de modelo. Sin servidores, sin telemetría.`,
    winNote: `Windows puede avisar del instalador de GitHub: aún no está firmado, no es inseguro — el código es abierto y está en GitHub. Pulsa <strong style="font-weight:500;color:var(--detail);">Más información → Ejecutar de todas formas</strong>. La versión de la Store no muestra este aviso.`,
    footer: {
      brand: 'NoteFlow',
      tagline: 'Notas rápidas, con cerebro.',
      groups: {
        docs: 'Docs',
        project: 'Proyecto',
        legal: 'Legal',
      },
      cliDocs: 'Docs del CLI',
      aiDocs: 'Cómo funciona la IA',
      featuresDocs: 'Funcionalidades',
      pricingDocs: 'Precios',
      source: 'Código',
      privacy: 'Privacidad',
      terms: 'Términos',
      legalNotice: 'Aviso legal',
      cookies: 'Cookies',
      copyright: '© 2026 · App de notas técnicas',
    },
  },

  chatPresets: [
    {
      q: '¿Cómo se conectan RAG y los agentes en mis notas?',
      a: 'Tu nota de “Arquitecturas RAG” enlaza estrechamente con “Bucles agénticos” — la recuperación alimenta el contexto del agente, y ambas remiten a tu trabajo de “Evaluación de LLMs”. El hilo llega incluso a tu borrador “Blog: segundo cerebro”.',
      cites: ['rag', 'agents', 'eval', 'blog-brain'],
      citeLabels: ['Arquitecturas RAG', 'Bucles agénticos', 'Evaluación de LLMs'],
    },
    {
      q: 'Resume lo que sé sobre el frontend.',
      a: 'Lo llevan dos notas: “Patrones de React” (hooks, rendimiento, estado) y “Arquitectura CSS”. Están muy relacionadas — tus notas de rendimiento se apoyan en las mismas ideas de estructura que tu capa de CSS.',
      cites: ['react-patterns', 'css-arch'],
      citeLabels: ['Patrones de React', 'Arquitectura CSS'],
    },
    {
      q: 'Organiza mis notas de IA en un grupo.',
      a: 'Hecho. Reuní tus cuatro notas sueltas de IA — “Arquitecturas RAG”, “Bucles agénticos”, “Embeddings” y “Evaluación de LLMs” — en un nuevo grupo “Investigación”, y enlacé las dos que no paraban de referenciarse. Tu cerebro acaba de ganar un cluster.',
      cites: ['rag', 'agents', 'embeddings', 'eval'],
      citeLabels: ['Arquitecturas RAG', 'Bucles agénticos', 'Embeddings', 'Evaluación de LLMs'],
    },
  ],
};
