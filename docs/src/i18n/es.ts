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
    notes: 'Notas',
    themes: 'Temas',
    profile: 'Perfil',
    download: 'Descargar',
    toggleTheme: 'Cambiar tema',
  },

  langSwitch: { label: 'EN', aria: 'View in English' },

  hero: {
    kicker: 'NoteFlow · El Cerebro',
    title: `Notas con<br /><em style="font-style:italic;font-weight:500;">cerebro.</em>`,
    tagline: 'Nuestro nicho es la gente con buen gusto.',
    download: 'Descárgala gratis',
    cta: 'Explora el cerebro ↓',
    scroll: 'Baja',
  },

  notesSection: {
    kicker: 'Qué es NoteFlow',
    h2: 'Notas rápidas. Cero fricción.',
    p: 'Un cuaderno de escritorio dark-first para personas técnicas. Vive en la bandeja del sistema, escribe Markdown plano en tu propio disco y se mantiene fuera del camino hasta que lo necesitas. El cerebro es opcional — la velocidad no.',
    modeRaw: 'Sección de markdown en crudo',
    modeRich: 'Sección de texto enriquecido',
    listAria: 'Funcionalidades de NoteFlow',
    cliCta: 'Referencia del CLI →',
    notes: {
      brain: {
        title: 'Un cerebro que te refleja',
        date: '24 jun 2026 · 22:10',
        tags: ['Cerebro'],
        body: [
          { t: 'p', html: 'NoteFlow convierte tus notas en un <strong>grafo neuronal 3D</strong> vivo. Cuanto más orden les das, más legible se vuelve tu cerebro — se forman clusters, las neuronas se conectan, emerge la estructura.' },
          { t: 'ul', items: ['Grupos ordenados → clusters limpios', 'Notas enlazadas → conexiones más fuertes', 'Cada sección es su propia neurona'] },
          { t: 'p', html: 'Organiza a la izquierda y observa cómo toma forma en la vista <code>Cerebro</code>.' },
        ],
      },
      headless: {
        title: 'Manéjalo sin pantalla',
        date: '21 jun 2026 · 20:48',
        tags: ['CLI'],
        body: [
          { t: 'p', html: '¿Sin pantalla? Sin problema. Ejecuta NoteFlow en una <strong>Raspberry Pi</strong>, un VPS o un servidor casero a través de su CLI companion.' },
          { t: 'code', lines: ['$ ssh pi@home', '$ nf new "Plan de backup" --group infra', '✓ creada · sincronizada'] },
          { t: 'p', html: 'Control total sobre tus notas y grupos desde cualquier terminal — perfecto para scripts y pipelines.' },
        ],
      },
      import: {
        title: 'Trae tus notas contigo',
        date: '17 jun 2026 · 18:33',
        tags: ['Importar'],
        body: [
          { t: 'p', html: 'Cambiar no duele. Importa lo que ya escribiste en otro sitio — NoteFlow habla los formatos que ya usas.' },
          { t: 'check', items: [
            { done: true, text: 'Exportaciones de Notion' },
            { done: true, text: 'Vaults de Obsidian' },
            { done: true, text: 'Google Keep' },
            { done: false, text: '…y Markdown plano de cualquier parte' },
          ] },
        ],
      },
      ai: {
        title: 'IA que te conoce',
        date: '14 jun 2026 · 16:05',
        tags: ['Agente'],
        body: [
          { t: 'p', html: 'El agente lee tu <strong>perfil</strong> y el contexto completo de tus notas antes de responder — así sus respuestas se acercan más a lo que de verdad quieres decir de lo que jamás podría un chat genérico.' },
          { t: 'ul', items: ['Sabe quién eres y cómo trabajas', 'Ve cada nota como contexto', 'Responde en tu idioma, en tus términos'] },
        ],
      },
      sticky: {
        title: 'Fíjala en tu escritorio',
        date: '10 jun 2026 · 13:27',
        tags: ['Sticky'],
        body: [
          { t: 'p', html: 'Saca cualquier nota como una <strong>sticky note</strong> que flota sobre tu escritorio — siempre a la vista mientras trabajas.' },
          { t: 'check', items: [
            { done: true, text: 'Se mantiene encima, fuera de la ventana principal' },
            { done: true, text: 'Los cambios se sincronizan directo con la nota' },
          ] },
        ],
      },
      private: {
        title: 'Privada por diseño',
        date: '06 jun 2026 · 08:52',
        tags: ['Privacidad'],
        body: [
          { t: 'p', html: 'Tus notas, tus reglas. La sincronización pasa por un repo que es <strong>tuyo</strong>, y puedes conectar <strong>modelos de IA locales</strong> para que nada salga nunca de tu máquina.' },
          { t: 'check', items: [
            { done: true, text: 'Sincroniza a un repo de GitHub que controlas' },
            { done: true, text: 'Ejecuta LLMs locales — IA totalmente offline' },
            { done: true, text: 'Tus claves, tus datos, tu disco' },
          ] },
        ],
      },
    },
  },

  showcase: {
    kicker: 'Dark-first · 12 temas',
    h2: `La magia está en <em style="font-style:italic;">los pequeños detalles.</em>`,
    p: 'Doce temas afinados a mano — Carbon, Tokyo Night, Dracula, Parchment y más. Pulsa el interruptor y toda la app le sigue.',
    toggleTheme: 'Cambiar tema',
    themesLabel: 'Temas',
    themesCaption: 'Carbon · Tokyo Night · Midnight · Dracula · Synthwave · Parchment …',
    videoAria: 'Demo de la app de escritorio NoteFlow',
    featuresCta: 'Cada detalle →',
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
    windows: 'Descargar para Windows',
    linux: 'Descargar para Linux',
    versionLabel: 'Última versión',
    disclaimer: `Tus notas se quedan en tu máquina como archivos <span style="font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--ink-dim);">.md</span> planos. La sincronización es tu propio repo privado de GitHub. Usa tu propia clave de modelo. Sin servidores, sin telemetría.`,
    winNote: `Windows puede avisar del instalador: aún no está firmado, no es inseguro — el código es abierto y está en GitHub. Pulsa <strong style="font-weight:500;color:var(--detail);">Más información → Ejecutar de todas formas</strong>.`,
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
