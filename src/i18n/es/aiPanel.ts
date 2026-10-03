import type { Messages } from '../en'

export const aiPanel: Messages['aiPanel'] = {
  tabs: {
    chat: 'Chat',
    related: 'Relacionadas',
    profile: 'Perfil',
  },
  providerTooltip: 'Proveedor de IA',
  collapse: 'Contraer el panel de IA',
  remove: 'Quitar',

  chat: {
    running: {
      list_notes: 'Listando notas…',
      get_note: 'Leyendo nota…',
      list_groups: 'Listando grupos…',
      search_notes: 'Buscando notas…',
      create_note: 'Creando nota…',
      update_note: 'Actualizando nota…',
      add_section: 'Añadiendo sección…',
      update_section: 'Actualizando sección…',
      rename_section: 'Renombrando sección…',
      create_group: 'Creando grupo…',
      create_folder: 'Creando carpeta…',
      rename_group: 'Renombrando grupo…',
      rename_folder: 'Renombrando carpeta…',
      delete_note: 'Borrando nota…',
      delete_section: 'Borrando sección…',
      delete_group: 'Borrando grupo…',
      delete_folder: 'Borrando carpeta…',
    },
    confirm: {
      delete_note: '¿Borrar esta nota de forma permanente?',
      delete_section: '¿Borrar esta sección?',
      delete_group: '¿Borrar este grupo? Sus notas se conservan pero quedan sin grupo.',
      delete_folder: '¿Borrar esta carpeta? Sus notas mantienen su grupo.',
      fallback: '¿Confirmar esta acción?',
    },
    confirmBtn: 'Confirmar',
    thinking: 'Pensando…',
    responding: 'Escribiendo respuesta…',

    attachHint: 'Adjuntar archivos — {list}',
    attachHintBasic: 'Adjuntar archivos de texto y código',
    messagePlaceholder: 'Escribe un mensaje…',
    stop: 'Detener',
    send: 'Enviar',

    notConfigured: 'Conecta un modelo (tu clave de Anthropic/OpenAI o un Ollama local) para chatear con tus notas.',
    configureProvider: 'Configurar proveedor',

    historyTooltip: 'Historial de chats',
    newChat: 'Chat nuevo',
    modelSelectTitle: 'Modelo usado para la próxima pregunta',
    noModel: '(sin modelo)',
    loadModelsTitle: 'Cargar modelos del proveedor',
    noSavedChats: 'Aún no hay chats guardados.',
    deleteChat: 'Borrar chat',
    emptyHint: 'Pregunta sobre tus notas. Iluminaré las que use en el cerebro.',

    suggestions: {
      generic: ['Resume las notas recientes', '¿En qué estoy trabajando?', 'Encuentra un tema'],
      note: ['Resume {name}', 'Reorganiza {name}', 'Mejora {name}', 'Busca notas como {name}', '¿Qué hay en {name}?', 'Convierte {name} en tareas'],
      section: ['Amplía la sección {name}', 'Ordena {name}'],
    },
  },

  fileTypes: {
    pdf: 'PDF',
    images: 'imágenes',
    textCode: 'texto y código',
  },

  related: {
    enablePrompt: 'Activa la IA local (en el cerebro) para ver notas relacionadas por contenido.',
    intro: 'Notas y secciones que la IA local encuentra más parecidas en contenido a la que elijas abajo — revelando conexiones entre tus notas.',
    from: 'Desde',
    selectNote: 'Selecciona una nota',
    searchNotes: 'Buscar notas…',
    noNotes: 'Sin notas',
    indexing: 'Indexando…',
    finding: 'Buscando notas relacionadas…',
    none: 'No se encontraron notas relacionadas.',
    untitledSection: 'Sección sin título',
    thisNote: '↻ esta nota',
  },

  provider: {
    provider: 'Proveedor',
    hintAnthropic: 'Claude mediante la API oficial (con tu propia clave).',
    hintOpenAiCompat: 'Endpoint compatible con OpenAI (con tu propia clave).',
    hintLocal: 'Local / sin clave API necesaria.',
    paidLabel: 'De pago',
    noteflowSignIn: 'Inicia sesión en tu cuenta de NoteFlow para usarlo.',
    noteflowNeedsSubscription: 'Requiere una suscripción a NoteFlow AI — gestiona tu plan en Ajustes → Cuenta.',
    goToAccount: 'Ir a Cuenta',
    chooseSourceDesc: 'Elige una fuente para el asistente: el plan gestionado NoteFlow AI, o un proveedor propio.',
    badgeActive: 'Activo',
    badgeInactive: 'Inactivo',
    noteflowCard: {
      subtitle: 'Plan gestionado — chatea con tus notas sin ninguna clave API.',
      useButton: 'Usar NoteFlow AI',
      usage: '{used} / {limit} tokens este mes',
    },
    byoCard: {
      title: 'Tu proveedor / IA local',
      subtitle: 'OpenAI, Anthropic, OpenRouter… con tu propia clave API, o un modelo local (Ollama).',
      useButton: 'Usar este proveedor',
    },
    modelQuotaSuffix: '({mult}× cuota)',
    baseUrl: 'URL base',
    apiKey: 'Clave API',
    keySaved: 'Clave guardada',
    model: 'Modelo',
    modelCuratedHint: 'Plan gestionado — elige uno de los modelos de abajo.',
    load: 'Cargar',
    error: 'Error',
    testConnection: 'Probar conexión',
    connected: '✓ Conectado',
  },

  profile: {
    createTitle: 'Crea tu perfil',
    createIntro: 'Toca lo que encaje, añade unas etiquetas — con eso basta. La IA completa el resto y escribe una nota de perfil editable en tu idioma, que se usa como contexto para mejores respuestas.',
    addMore: 'Añadir más — opcional',
    files: 'Archivos',
    addFiles: 'Añadir archivos',
    filesHint: 'La IA los lee directamente. Aquí se admiten: {types}.',
    links: 'Enlaces',
    linksPlaceholder: 'LinkedIn, portfolio, GitHub, X…',
    notNow: 'Ahora no',
    generate: 'Generar perfil',
    generating: 'Generando…',
    generateError: 'No se pudo generar el perfil',
    acceptFiles: 'archivos de {types}',
    acceptFilesBasic: 'archivos de texto y código',

    createdTitle: 'Perfil creado',
    createdIntro: 'La IA conserva tu nota de perfil como contexto para mejores respuestas. Edítala como cualquier otra nota, o empieza de cero para reconstruirla.',
    yourNote: 'Tu nota de perfil',
    noteDeleted: 'La nota de perfil se borró. Empieza de cero para crear una nueva.',
    startOver: 'Empezar de cero',
  },

  profileForm: {
    professional: {
      title: 'Profesional',
      description: 'Trabajo, estudios y en qué pones tu foco.',
      about: {
        label: '¿A qué te dedicas?',
        hint: 'Trabajo, estudios o en qué pasas la mayor parte del tiempo. Con una línea basta.',
        placeholder: 'p. ej. Estudio arquitectura / Llevo una pequeña panadería / Backend en una startup',
      },
      tools: {
        label: 'Herramientas y apps que usas a menudo',
        hint: 'Opcional — desde Notion hasta un lenguaje de programación.',
        placeholder: 'Escribe una herramienta y pulsa Enter',
        options: ['Notion', 'Excel', 'Figma', 'Obsidian', 'Photoshop', 'VS Code', 'Python', 'TypeScript'],
      },
      goals: {
        label: '¿En qué estás centrado?',
        options: ['Aprender algo nuevo', 'Crear un hábito', 'Organizarme', 'Sacar un proyecto', 'Encontrar trabajo', 'Mejorar mi salud', 'Crecimiento personal', 'Ganar más'],
      },
    },
    personal: {
      title: 'Personal',
      description: 'Unos cuantos favoritos — no le des muchas vueltas, lo primero que se te ocurra.',
      name: {
        label: 'Tu nombre',
        placeholder: 'Opcional — ¿cómo debería llamarte la IA?',
      },
      interests: {
        label: 'Intereses y pasiones',
        placeholder: 'Escribe algo que te encante y pulsa Enter',
        options: ['Lectura', 'Música', 'Videojuegos', 'Deporte', 'Cocina', 'Viajes', 'Arte', 'Ciencia', 'Tecnología', 'Fotografía', 'Escritura', 'Naturaleza'],
      },
      music: {
        label: 'Canciones o artistas a los que siempre vuelves',
        hint: 'Con unos pocos basta — el gusto dice más de lo que crees.',
        placeholder: 'Escribe una canción o artista y pulsa Enter',
      },
      screen: {
        label: 'Películas o series favoritas',
        hint: 'Esas que reverías cualquier día.',
        placeholder: 'Escribe una película o serie y pulsa Enter',
      },
      books: {
        label: 'Libros que te marcaron',
        hint: 'Opcional.',
        placeholder: 'Escribe un libro y pulsa Enter',
      },
      dreamTrip: {
        label: 'Un lugar al que te encantaría ir',
        hint: 'Opcional — un viaje soñado o un sitio en el que piensas a menudo.',
        placeholder: 'p. ej. una ruta por Islandia / una cabaña tranquila en la montaña',
      },
    },
    style: {
      title: 'Tu estilo',
      description: 'Toques rápidos — no hay respuestas correctas, déjate llevar por el instinto.',
      personality: {
        label: '¿Cómo te describirías?',
        options: ['Curioso', 'Analítico', 'Creativo', 'Organizado', 'Espontáneo', 'Introvertido', 'Extrovertido', 'Detallista', 'Visión de conjunto', 'Pragmático', 'Ambicioso', 'Relajado'],
      },
      q_weekend: {
        label: 'Tu fin de semana ideal es…',
        options: ['Planeado con antelación', 'Decidido sobre la marcha'],
      },
      q_recharge: {
        label: 'Recargas pilas…',
        options: ['Con tiempo a solas', 'Rodeado de gente'],
      },
      q_drawn: {
        label: 'Te atrae más…',
        options: ['Una idea nueva y atrevida', 'Un método probado y fiable'],
      },
      q_space: {
        label: 'Tu espacio suele ser…',
        options: ['Minimalista y ordenado', 'Lleno de cosas que te gustan'],
      },
      q_decide: {
        label: 'Al decidir, confías en…',
        options: ['La lógica y los datos', 'Tu instinto y las personas implicadas'],
      },
      q_trip: {
        label: 'Un viaje que elegirías…',
        options: ['Un itinerario completo', 'Deambular sin plan'],
      },
    },
    assistant: {
      title: 'Trabajar con la IA',
      description: 'Cómo te gustaría que el asistente estuviera a tu lado.',
      communication: {
        label: '¿Cómo debería hablarte la IA?',
        options: ['Conciso y directo', 'Detallado y a fondo', 'Cercano y amigable', 'Formal', 'Motivador', 'Rebate mis ideas', 'Paso a paso', 'Con ejemplos'],
      },
      extra: {
        label: 'Algo más',
        placeholder: 'Opcional — cualquier otra cosa que ayude a la IA a entenderte',
      },
    },
  },
}
