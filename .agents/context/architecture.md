# NoteFlow — Arquitectura, IPC y almacenamiento

## Repositorio y proyectos relacionados

- **GitHub:** https://github.com/yagoid/noteflow
- **Rama principal:** `main`
- **Directorio local:** raíz del repo clonado (la ruta absoluta varía por máquina).
- **Versión actual:** ver `package.json` (`version`). Convención `vX.Y.Z`.
- **Licencia:** ver el campo `license` de `package.json`.
- **Documentación del proyecto:** vive en `.agents/context/*.md` (este directorio); el **índice/mapa**
  está en el `AGENTS.md` de la raíz, que se carga en cada sesión.
- **Proyectos/skills hermanas:**
  - `noteflow-features` (skill) → funcionalidades, UI, UX, atajos (perspectiva de producto/usuario).
  - `noteflow-cli` (skill) → guía del CLI companion para agentes (lo que el CLI no avisa); la referencia completa es `noteflow help <comando>`.
  - `noteflow-mobile` (skill) → app móvil hermana (React Native + Expo), comparte el formato de nota.

## Estructura de directorios

```
noteflow/
├── electron/
│   ├── main.ts          # Proceso principal: IPC, tray, ventanas, settings, alarmas,
│   │                    #   auto-update, temp-notes, single-instance, fs.watch, sticky anim
│   ├── preload.ts       # Bridge IPC expuesto al renderer como window.noteflow
│   ├── noteFormat.ts    # Formato v2 en el main (espejo de src/lib/noteUtils.ts):
│   │                    #   parseNoteDir, serializeNoteFolder, listNoteDirs, parser legacy v1
│   ├── migration.ts     # Migración única v1→v2 (flat .md → carpetas), idempotente
│   ├── localOnlyNotes.ts # Notas solo-locales (`localOnly: true` en note.md): detección + carpetas que el
│   │                    #   sync puede tocar (listSyncedNoteDirs) — testeada; ver sync.md "Notas solo-locales"
│   ├── linkedNotes.ts   # Notas vinculadas (archivo de texto externo editado en su sitio: Markdown o texto
│   │                    #   plano): validación texto/binario, registro + caché en userData,
│   │                    #   watchers por carpeta padre, escritura atómica con huella, assets/ — testeado con
│   │                    #   ficheros reales; ver patterns.md § "Notas vinculadas"
│   ├── linkedNotesLogic.ts # Pura: saneo del registro, rutas, texto vs binario (NUL/UTF-8), split/reensamblado
│   │                    #   byte-exacto (BOM/EOL/frontmatter solo en Markdown),
│   │                    #   decisiones eco/conflicto, nombres en assets/, notas temporales — testeada
│   ├── welcomeNote.ts   # Nota de bienvenida de la primera ejecución (decisión pura + contenido EN/ES) —
│   │                    #   testeada; la crea main.ts al arrancar (seedWelcomeNoteIfFirstRun)
│   ├── githubSync.ts    # Sync con GitHub (Device Flow OAuth, push/pull por carpeta,
│   │                    #   Trees API, migración remota, cifrado token)
│   ├── cliConnect.ts    # Ajustes → Sync → "Connect the CLI too": ejecuta el CLI empaquetado (Cloud) y
│   │                    #   escribe su settings.json (GitHub); lógica pura en cliConnectLogic.ts — ver patterns.md § CLI
│   ├── syncState.ts     # Lógica pura del journal de mutaciones + sha-cache (la usan GitHub y Cloud)
│   │                    #   + decisiones de tres vías de la subida condicionada de GitHub — ver sync.md
│   ├── conflictCopy.ts  # Lado disco de las copias de conflicto (escribir la copia + aviso de sesión),
│   │                    #   compartido por cloudSync.ts y githubSync.ts — ver sync.md / monetization.md
│   ├── githubMerge.ts   # Pura: fusión por fichero del camino de conflicto del pull de GitHub (adapta los shas
│   │                    #   a planThreeWayDir + mergeSectionText de Cloud) — ver sync.md "Subida condicionada (QA B3)"
│   ├── cloudBaseStore.ts # Almacén direccionado por contenido del texto de las bases de sección de Cloud
│   │                    #   (userData/cloud-base-content/<sha256>) para el diff3 de mergeSectionText — ver monetization.md
│   ├── mirrorPlan.ts    # Lógica pura del espejo local→GitHub (plan + allowlist de borrado) — ver sync.md
│   ├── syncOrigin.ts    # Origen del dir de notas por backend (settings.syncOrigin): decisión pura proceed/ask
│   │                    #   (stale, dir del registro), identidades, etiquetas, RMW del settings y defaultNotesDir()
│   │                    #   (el dir por defecto; main.ts lo usa) — testeada; ver sync.md "Origen del dir de notas"
│   ├── notesArchive.ts  # Archivo local de las notas sincronizables ("usar solo las del remoto"): mover sin
│   │                    #   borrar, EXDEV, rollback, metadatos filtrados, manifest — testeado; ver sync.md
│   ├── syncHistory.ts   # Lógica pura del historial de actividad en memoria (gráfica de la tarjeta de sync) — ver sync.md
│   ├── activityLog.ts   # Lógica pura del log de ediciones por día y dispositivo (userData/activity-log.json):
│   │                    #   parse/dedupe/poda — testeada; lo persiste main (canales activity:*)
│   ├── syncProvider.ts  # Interfaz SyncProvider + getActiveSyncProvider() (GitHub ⟂ Cloud) — ver sync.md
│   ├── snippetsFile.ts  # Pura: saneo de snippets.json (fragmentos del toolbar) en lectura y escritura — testeada
│   ├── whatsNewSeen.ts  # Pura: saneo/unión de settings.whatsNewSeen (tour "What's new") — testeada;
│   │                    #   espejo de src/lib/whatsNew.ts — ver patterns.md
│   ├── stickyBounds.ts  # Pura: geometría y estado plegado recordados de las stickies
│   │                    #   (settings.stickyBounds, por PC): saneo/LRU/visibilidad en displays —
│   │                    #   testeada; ver patterns.md § Ventanas sticky
│   ├── tempNoteExpiry.ts # Lógica pura: cuándo puede correr el autoborrado de notas temporales
│   │                    #   (con sync, solo tras un pull limpio) — testeada; ver patterns.md
│   ├── updateAsset.ts   # Lógica pura del auto-update: qué asset/URL ofrecer por plataforma y
│   │                    #   allowlist de rutas descargables — testeada; ver patterns.md
│   ├── relaunchArgs.ts  # Pura: args del relanzamiento tras salir de un lanzamiento que llegó durante la
│   │                    #   salida (second-instance) — testeada; ver patterns.md § Single instance
│   ├── openWithArgs.ts  # Pura: qué argumentos de un lanzamiento (argv, second-instance, open-file) son
│   │                    #   archivos a abrir ("Abrir con NoteFlow") — testeada; ver patterns.md § "Notas vinculadas"
│   ├── v8Flags.ts       # Pura: valor del switch `js-flags` de los renderers (`--heap-growing-percent=30`,
│   │                    #   acota el crecimiento del heap de V8/Blink) — testeada; ver patterns.md § Memoria del renderer
│   ├── feedback.ts      # Formulario de feedback (Ajustes → About): INSERT en public.feedback vía PostgREST,
│   │                    #   con el token de la sesión si la hay y si no anónimo (no exige cuenta) — migración 0015
│   ├── feedbackLogic.ts # Pura: validación del payload (tipo, mensaje 1..5000, email opcional laxo), fila a
│   │                    #   insertar y decisión ante 401/403 — testeada (incluye el espejo de límites de la 0015)
│   ├── account.ts       # Cuenta NoteFlow (Supabase Auth email+OTP vía REST, sesión en main,
│   │                    #   refresh token cifrado, entitlements) — ver monetization.md
│   ├── accountTransition.ts # Lógica pura del sign-out/sign-in: qué apagar (Cloud, DEK, IA gestionada),
│   │                    #   qué activar al iniciar sesión o al suscribirse (registro accountRestore,
│   │                    #   baseline de entitlements) — testeada; ver monetization.md §§ 3-4
│   ├── cloudAccessErrors.ts # Pura: errores etiquetados "sin token" (sin sesión / inalcanzable /
│   │                    #   llavero bloqueado) y su mensaje — testeada; ver monetization.md § 2 (token discriminado)
│   ├── cloudConfig.ts   # URL + anon key del proyecto Supabase real (la anon key es pública por diseño)
│   ├── cloudCrypto.ts   # Capa criptográfica pura de NoteFlow Cloud (DEK/KEK/recovery, AES-GCM, path_key)
│   ├── cloudKeys.ts     # Sesión de claves E2EE en main (setup/unlock/lock, DEK solo en memoria,
│   │                    #   cache safeStorage) + helper supabaseRest — ver monetization.md § 4
│   ├── cloudSync.ts     # Motor de sync de NoteFlow Cloud (push/pull/tombstones vía PostgREST)
│   ├── cloudSyncLogic.ts# Lógica pura del motor (mapeo fila↔fichero, conflictos, cursor) — testeada
│   ├── cloudVersions.ts # Historial de versiones por sección (lista / descifra / captura antes de
│   │                    #   restaurar vía RPC cloud_snapshot_file) — ver monetization.md § 4
│   ├── cloudVersionsLogic.ts # Lógica pura del historial (endpoints, validación del destino, mapeo
│   │                    #   de filas y de errores HTTP) — testeada (tests/electron/cloudVersions.test.ts)
│   ├── entitlements.ts  # computeEntitlements(rows) pura ({ai,cloud} desde subscriptions)
│   └── ai/              # Índice semántico local + LLM ("El Cerebro" Fases 1-3)
│       ├── protocol.ts  #   Tipos de mensajes worker↔main + constantes (modelo, schema)
│       ├── aiIndex.ts   #   Lifecycle del worker en el main (fork/respawn, debounce, API)
│       ├── aiWorker.ts  #   utilityProcess: embeddings (Transformers.js) + SQLite index
│       ├── chatContext.ts #  Contexto explícito del chat del editor → bloques del prompt (puro, testeado)
│       ├── chatUndo.ts  #   Deshacer ediciones del agente: snapshots/huella/plan (puro, testeado)
│       └── llm/         #   Proveedor LLM (Fase 3, corre en main; key NUNCA va al renderer)
│           ├── presets.ts          #     Catálogo de proveedores (anthropic | openai-compatible)
│           ├── managedCatalog.ts   #     Catálogo de modelos de NoteFlow AI (del proxy, cacheado; puro, testeado)
│           ├── types.ts            #     LlmProvider, ChatMessage, config (por preset)
│           ├── secret.ts           #     Cifrado de API key (safeStorage, espejo de githubSync)
│           ├── anthropic.ts        #     Provider SDK @anthropic-ai/sdk (messages.stream)
│           ├── openaiCompatible.ts #     Provider fetch SSE (OpenAI/DeepSeek/MiniMax/Ollama/…)
│           └── index.ts            #     getProvider/resolveConfig/toPublic + DEFAULT_LLM_CONFIG
├── cli/
│   ├── noteflow.js      # CLI companion (Node.js standalone, sin deps de Electron)
│   ├── noteflow.cmd     # Wrapper Windows cmd.exe (entra en PATH vía NSIS) — ⚠ trunca argv multilínea
│   ├── noteflow.ps1     # Wrapper PowerShell (PS lo prefiere sobre .cmd en PATH; pasa argv multilínea/Unicode intactos, reenvía stdin de la tubería en UTF-8 y fuerza OutputEncoding UTF-8 — ver patterns.md § CLI; con ExecutionPolicy Restricted falla → usar noteflow.cmd o RemoteSigned)
│   ├── install-cli.sh   # Instalador headless Linux/RPi (curl | sudo bash)
│   └── noteflow-cli/SKILL.md  # Skill publicada del CLI (npx skills add ...)
├── build/
│   ├── nsis-include.nsh        # NSIS: añade/quita resources\cli del PATH de usuario (Win)
│   ├── linux-postinstall.sh    # deb: setuid chrome-sandbox + symlink CLI en /usr/local/bin
│   └── linux-postremove.sh     # deb: limpia symlink CLI y statoverride del sandbox
├── src/
│   ├── App.tsx           # Raíz React: router por hash (#sticky / #section-window / principal),
│   │                    #   fija el rol de ventana del store; carga notas, atajos globales, paneles split
│   ├── main.tsx          # Entry point renderer, init de tema
│   ├── stores/
│   │   ├── notesStore.ts             # Estado de notas (Zustand) — loadNotes (batch), CRUD, paneles del
│   │   │                             #   split (openPanes/activePaneId), escrituras en cola por nota
│   │   │                             #   (updateSection/mutateSections), rol de ventana (main/sticky/section)
│   │   ├── groupsStore.ts            # Grupos — persistidos en groups.json (IPC)
│   │   ├── templatesStore.ts         # Plantillas de nota — persistidas en templates.json (IPC)
│   │   ├── snippetsStore.ts          # Fragmentos del toolbar — snippets.json (IPC, carga perezosa, autoguardado)
│   │   ├── themeStore.ts             # Tema/fuente/acento/colores editor + último tema oscuro/claro — SINCRONIZADO en ui-settings.json (IPC sendSync); escala de UI y estilo de secciones del sidebar en localStorage (por dispositivo)
│   │   ├── languageStore.ts          # Idioma UI (i18n) — settings.json vía IPC; dict de src/i18n; cambio en caliente vía broadcast
│   │   ├── editorSettingsStore.ts    # Fuente/tamaño/ancho legible/índice (TOC) del editor — SINCRONIZADO en ui-settings.json (IPC)
│   │   ├── sectionTagColorsStore.ts  # Color por nombre de sección — section-colors.json
│   │   ├── aiStore.ts                # Estado del índice IA (enabled, related, grafo, progreso) vía IPC ai:*
│   │   ├── whatsNewStore.ts          # Tour "What's new": ids vistos (settings.json vía IPC whats-new:*) + tour abierto
│   │   ├── identityStore.ts          # Cuenta (sesión + plan) y backend de sync vivo para la línea de identidad del pie del sidebar (account:/sync:/cloud: status, ref-count connectIdentity)
│   │   └── aiChatStore.ts            # Estado del chat/LLM (config por proveedor, modelos, mensajes, sesiones) vía IPC ai:llm-*/ai:chat*/ai:chats-*
│   ├── components/
│   │   ├── Editor/
│   │   │   ├── Editor.tsx               # Instancia TipTap (conversión md↔html en lib/markdownHtml.ts)
│   │   │   ├── editorExtensions.ts      #   extensiones que definen el esquema (nodos/marcas/atributos); las usan Editor.tsx y el harness de round-trip
│   │   │   ├── NoteEditor.tsx           # Wrapper con tabs de secciones (click derecho → NoteContextMenu), atajos de fuente
│   │   │   ├── undoHistory.ts           #   cachés (una por ventana) del historial undo/redo por sección + poda al borrar/bloquear (ver patterns.md)
│   │   │   ├── EditorToolbar.tsx        # Toolbar de formato
│   │   │   ├── SnippetsButton.tsx       #   botón partido de fragmentos (insertar el por defecto / elegir) + SnippetsModal.tsx
│   │   │   ├── snippetCommands.ts       #   inserción de un fragmento expandido como markdown (slice inline o de bloques)
│   │   │   ├── EditorToc.tsx            # Índice flotante H1–H3 (+ useEditorToc.ts: lectura del doc)
│   │   │   ├── DeadlineTaskItem.ts      # Extensión TipTap: task item con deadline+alarma
│   │   │   ├── DeadlineTaskItemView.tsx # NodeView React para DeadlineTaskItem (asa ⋮⋮, casilla, triggers)
│   │   │   ├── taskDrag.ts              #   arrastrar tareas por el asa (ghost, línea de drop, auto-scroll)
│   │   │   ├── taskToggle.ts            #   marcar/desmarcar (+ "marcadas al final" con animación FLIP)
│   │   │   ├── ListItemMove.ts          #   Alt+↑/↓: mover el ítem de lista con sus subítems
│   │   │   ├── pointerDrag.ts           #   helpers del drag por pointer events (kanban + tareas)
│   │   │   ├── TaskPickers.tsx          # Pickers de deadline/alarma e importancia (tareas + tarjetas kanban)
│   │   │   ├── taskBadge.ts             #   helpers compartidos: color/formato del badge, posición del picker
│   │   │   ├── KanbanBoard.ts           # Nodo TipTap atom del tablero kanban (ver patterns.md)
│   │   │   ├── KanbanBoardView.tsx      #   NodeView React: columnas, drag & drop, menús, búsqueda
│   │   │   ├── KanbanParts.tsx          #   piezas: tarjeta, editor inline, menú de opciones
│   │   │   ├── kanbanCommands.ts        #   insertar tablero, lista de tareas ↔ tablero
│   │   │   ├── SectionRelation.ts       # Nodo inline atom de relación sección↔sección (+ SectionRelationView.tsx)
│   │   │   ├── SlashCommands.ts         # Menú `/` (@tiptap/suggestion) + SlashCommandMenu.tsx
│   │   │   ├── SectionLinkPicker.tsx    # Buscador de secciones del comando "Link section"
│   │   │   ├── CodeBlockWithCopy.tsx    # NodeView: code block con botón copiar
│   │   │   ├── ResizableImage.tsx       # NodeView: imagen redimensionable
│   │   │   ├── TableContextMenu.tsx     # Menú contextual de tablas
│   │   │   ├── tableUtils.ts            #   alineación por columna (getColumnAlign/setColumnAlign)
│   │   │   ├── tableOps.ts              #   comandos de tabla sin UI: mover/ordenar/duplicar/vaciar… (ver patterns.md)
│   │   │   ├── TableKeymap.ts           #   atajos de tabla (Alt+↑/↓, Mod+Enter, Mod+D…; acordes en lib/tableShortcuts.ts)
│   │   │   ├── tableClipboard.ts        #   copiar celdas como TSV, handlePaste del editor, normalizar tablas pegadas
│   │   │   ├── SearchHighlightExtension.ts # Resaltado de matches de búsqueda in-note
│   │   │   ├── InNoteSearchBar.tsx      # Barra búsqueda dentro de la nota (modo markdown)
│   │   │   └── RawNoteSearchBar.tsx     # Barra búsqueda dentro de la nota (modo texto, `isRawMode`)
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx              # Lista de notas, filtros, búsqueda, grupos/carpetas
│   │   │   ├── NoteGroupHeader.tsx      # Cabecera de grupo (nombre→vista de contenido del grupo; resto→colapsar)
│   │   │   ├── NoteFolderHeader.tsx     # Cabecera colapsable de carpeta (dentro de grupo) + FolderGlyph /
│   │   │   │                            #   FolderIcon / FolderListIcon (icono de una carpeta concreta)
│   │   │   ├── NoteSectionMap.tsx       # Secciones de la fila de nota: línea plegada → peek al hover → mapa
│   │   │   │                            #   abierto (patterns.md "Sidebar: item de nota"); + SectionCell.tsx
│   │   │   │                            #   (celda), NoteSectionFlip.tsx (FLIP entre filas), useSectionInk.ts
│   │   │   ├── SectionTabsRow.tsx       # Fila de celdas de sección con scroll horizontal (ajuste "Scroll row"
│   │   │   │                            #   de la fila y del peek de grupo); + useOpenNoteSection.ts
│   │   │   ├── SidebarShell.tsx         # Aloja el Sidebar fijado (en el layout) o flotante (panel
│   │   │   │                            #   superpuesto + mini-vista); ver patterns.md "Sidebar flotante"
│   │   │   ├── MiniSidebar.tsx          # Mini-vista sin texto del sidebar (modo flotante)
│   │   │   ├── SidebarIdentity.tsx      # Pie: línea de identidad (inicial · usuario · almacenamiento/plan ⌄)
│   │   │   ├── SidebarFooterMenu.tsx    # Pie: menú ⋯ (sync sin plan · tema claro/oscuro · secciones · archivadas) + menú del plan
│   │   │   ├── sidebarAnchor.ts         # Anclas de contenido (data-sidebar-anchor) que mide el panel flotante
│   │   │   └── useSidebarGroups.ts      # Hook: useMemo de lib/sidebarGroups.ts (agrupa/ordena por grupo→carpeta)
│   │   ├── ContentView/                 # Vista de contenido unificada (sustituye editor; patterns.md
│   │   │   │                            #   "Vista de contenido unificada"; lógica pura en lib/contentView.ts)
│   │   │   ├── ContentView.tsx          #   Cabecera (buscador + selector de orden, `noteflow:content-view-sort`) + estado (lugar, selección, multiselección, teclado, anchos de columna)
│   │   │   ├── PlacesRail.tsx           #   Columna 1: All / Favorites / grupos+carpetas / Ungrouped (+ Folder / + Group, rename, drop)
│   │   │   ├── NoteTimeline.tsx         #   Columna 2: notas con sus secciones (filas memo): por bloques de fecha o como en la sidebar (cabeceras de grupo y subcabeceras de carpeta)
│   │   │   └── SectionPreviewPane.tsx   #   Columna 3: contenido real de la sección (solo lectura) + "Open in the editor"
│   │   ├── SelectionBar.tsx             # Barra flotante de acciones por lotes sobre notas (vista de contenido)
│   │   ├── GroupContextMenu.tsx         # Menú contextual de grupo (sidebar + columna de lugares de la vista de contenido)
│   │   ├── FolderContextMenu.tsx        # Menú contextual de carpeta (ídem); clases comunes en contextMenuStyles.ts
│   │   ├── NoteOverview/
│   │   │   ├── NoteOverview.tsx         # Vista de nota (sustituye editor): el mapa de secciones con la
│   │   │   │                            #   vista previa dentro (bloque reticulado, lib/noteOverviewGrid.ts)
│   │   │   └── SectionCardContent.tsx   #   Cuerpo + pie de una tarjeta de sección (celda y preview)
│   │   ├── SectionPreview/              # Previsualización de sección reutilizable
│   │   │   ├── SectionHoverCard.tsx     #   Tarjeta de preview (hover y cerebro): celda de la vista de nota en apaisado
│   │   │   ├── previewSize.ts           #   Tamaño fijo 360×190 de la tarjeta + ancho capado en ventanas estrechas
│   │   │   ├── HoverPreviewProvider.tsx #   Provider + popover flotante de hover (sidebar/grupos/editor/IA);
│   │   │   │                            #     1 popover central, cierra con cualquier click (pointerdown global)
│   │   │   └── hoverPreviewContext.ts   #   Contexto + hook useSectionHoverPreview (archivo aparte: fast-refresh)
│   │   ├── AiPanel/                     # Panel de IA (Fase 3) — mitad izq. de la vista cerebro + chat del editor
│   │   │   ├── AiPanel.tsx              #   Contenedor con pestañas Chat / Related / Profile / ⚙ Settings
│   │   │   ├── ChatView.tsx             #   Chat streaming + selector de modelo + historial + citas + deshacer
│   │   │   │                            #     (variante compact/renderHeader/contextBar para el chat del editor)
│   │   │   ├── AiChatButton.tsx         #   Botón del chat en la fila del título (y ancla del sidebar, aiChatAnchor.ts)
│   │   │   ├── AiChatSidebar.tsx        #   Chat flotante a la derecha del editor (ai.md → Chat en el editor)
│   │   │   ├── ChatContextBar.tsx       #   Barra "Contexto:" (sección / nota / todas las notas)
│   │   │   ├── AiChatWindowApp.tsx      #   Ventana de chat despegada (#ai-chat)
│   │   │   ├── RelatedView.tsx          #   "Related notes" por sección (movido aquí del cerebro)
│   │   │   ├── LlmConfigView.tsx        #   Fuente del asistente: selector NoteFlow AI | proveedor propio/IA local (+ baseUrl, key, modelo, test)
│   │   │   ├── ProfileFlow.tsx          #   Cuestionario por secciones (chips/tags/text/choice + archivos + enlaces) → genera nota de perfil
│   │   │   └── profileQuestions.ts      #   Esquema data-driven (PROFILE_SECTIONS: Professional/Personal/Your style/AI; proxy + binarias Big Five) + PROFILE_FIELDS + detectLocale()
│   │   ├── Brain/                       # Vista cerebro ("El Cerebro" Fase 2 — grafo de notas)
│   │   │   ├── BrainView.tsx            #   Split AiPanel | canvas (Fase 3); divisor redimensionable;
│   │   │   │                            #     ELIGE el render: 3D si hay WebGL, si no fallback 2D
│   │   │   ├── BrainScene.tsx           #   *** RENDER POR DEFECTO *** — cerebro 3D inmersivo
│   │   │   │                            #     (three.js: alambre + puntos con oclusión real, bloom, órbita,
│   │   │   │                            #     impulsos/ondas/latido; ver ai.md § Render 3D)
│   │   │   ├── brainLook.ts             #   BRAIN_LOOK: todos los números del aspecto 3D + presupuestos
│   │   │   ├── brainShaders.ts          #   GLSL del 3D (líneas, puntos, nodos, pasada final "grade")
│   │   │   ├── brainData.ts             #   Datos derivados del grafo para el 3D (rutas, fibras, foco; puro,
│   │   │   │                            #     sin three) — testeado
│   │   │   ├── brainBuffers.ts          #   Empaquetado compacto de segmentos de línea (44 B) — testeado
│   │   │   ├── brainMesh.ts             #   Malla 3D del cerebro, de forma FIJA (cerebro levantado por perfiles
│   │   │   │                            #     medidos + giros/surcos como geometría + entramado interior +
│   │   │   │                            #     cerebelo + tronco; pesos por arista/vértice; rutas A*). Singleton
│   │   │   │                            #     de sesión (getBrainMesh) — testeado (ver ai.md § Vista cerebro)
│   │   │   ├── assignVertices.ts        #   Asigna cada nodo del grafo a un vértice de la malla 3D (notas en la
│   │   │   │                            #     corteza, grupos repartidos, perfil de IA en el núcleo) — testeado
│   │   │   ├── BrainCanvas.tsx          #   FALLBACK 2D (sin WebGL): <canvas> + d3-force, pan/zoom/drag
│   │   │   ├── useBrainGraph.ts         #   Modelo compartido: nodos (grupo/carpeta/nota/sección; `centered` en el
│   │   │   │                            #     grupo del perfil de IA, `groupId` en lo que cuelga de un grupo)
│   │   │   │                            #     + 2 capas de aristas — testeado
│   │   │   ├── useForceLayout.ts        #   Simulación d3-force del fallback 2D (estructura + contenido)
│   │   │   ├── brainColors.ts           #   Resuelve color de nodo → RGB: CSS var del tema o hex libre
│   │   │   │                            #   (readColor; lo usan 2D y 3D)
│   │   │   └── BrainNodePreview.tsx     #   Tarjeta de preview (SectionHoverCard) clicable al pulsar un nodo nota/sección (click→navega)
│   │   ├── NoteCard/                    # Tarjeta de nota en sidebar
│   │   ├── TitleBar.tsx                 # Barra de título personalizada (frameless);
│   │   │                                #   el ⚙ abre la ventana de Ajustes (SettingsModal)
│   │   ├── SyncStatusButton.tsx         # Botón ☁ de la titlebar + tarjeta de estado al hover
│   │   ├── useActiveSyncStatus.ts       # Hook: status del backend activo (sync:get-active-status) + push-state; titlebar y Ajustes → Sync
│   │   ├── syncStatusText.ts            # Etiqueta del estado de sync + "hace x min" (i18n), compartido titlebar/Ajustes
│   │   ├── OriginChoiceDialog.tsx       # Diálogo "tus notas vienen de otro remoto" (fusionar / solo las del
│   │   │                                #   remoto / cancelar), por backend; lo monta TitleBar — ver sync.md
│   │   ├── Settings/                    # Ventana de Ajustes unificada (overlay split nav+contenido)
│   │   │   ├── SettingsModal.tsx        #   Contenedor: nav izquierda + panel derecho según sección
│   │   │   ├── GeneralPanel.tsx         #   Idioma + sección Activity (ActivitySummary.tsx) + IA local (toggle/reindex) + perfil + skill del CLI
│   │   │   ├── AppearancePanel.tsx      #   Tema/fuente/acento/colores del editor/escala + preview
│   │   │   ├── EditorPanel.tsx          #   Font size / fuente / ancho / índice / tareas marcadas al final
│   │   │   ├── TemplatesPanel.tsx       #   Plantillas de nota (listar/usar/renombrar/borrar)
│   │   │   ├── StartupPanel.tsx         #   Autostart + stickies al arrancar
│   │   │   ├── SyncPanel.tsx            #   Enrutado de vistas: elección inicial / vista general del backend activo / detalle
│   │   │   ├── SyncOverview.tsx         #   Vista general con backend activo: tarjeta de estado + mapa, lista de datos, otros proveedores, pie
│   │   │   ├── SyncMap.tsx              #   Mapa de sync informativo (role=img; lógica pura en src/lib/syncOverview.ts)
│   │   │   ├── SyncOriginNotices.tsx    #   Origen del dir de notas: aviso "Choose…" bajo la tarjeta de estado + acceso a las copias locales (fila / línea)
│   │   │   ├── GitHubSync.tsx           #   GitHub: setup (device flow), vista general y fila "Paused" (en la de Cloud); estado en useGitHubSync.ts
│   │   │   ├── CliConnectRow.tsx        #   Fila "noteflow CLI" (Cloud: código; GitHub: copia del token); estado en useCliConnect.ts
│   │   │   ├── CloudPanel.tsx           #   NoteFlow Cloud (cifrado, suscripción): vista general si está activo, si no el detalle — ver monetization.md
│   │   │   ├── AccountPanel.tsx         #   Cuenta NoteFlow (OTP, entitlements) — ver monetization.md
│   │   │   ├── AiPanel.tsx              #   Solo el proveedor del LLM (LlmConfigView embebido)
│   │   │   ├── DataPanel.tsx            #   Export/Import (lanza ExportImportModal) + dir de notas
│   │   │   ├── ShortcutsPanel.tsx       #   Lista de atajos (fuente de verdad de los atajos)
│   │   │   ├── TutorialPanel.tsx        #   Tutorial: "Play full tour" + tarjeta por diapositiva del tour
│   │   │   └── AboutPanel.tsx           #   Versión (app:get-version) + check/instalar updates (en la Store, solo un aviso: app:get-distribution) + repo
│   │   ├── CommandPalette/             # Paleta de comandos
│   │   ├── WhatsNew/                   # Tour "What's new" (popup de arranque + Ajustes → Tutorial) — ver patterns.md
│   │   │   ├── whatsNewSlides.ts       #   Las diapositivas (datos: id, since, icono, acento, atajos) — ampliar aquí
│   │   │   ├── whatsNewMedia.ts        #   Clips src/assets/whats-new/<id>[.<lang>].webm vía import.meta.glob
│   │   │   ├── SlideVisual.tsx         #   Marco de ventana + <video> / fallback animado + chips de atajos
│   │   │   ├── WhatsNewTour.tsx        #   El modal (navegación, animaciones, foco, marcado como visto)
│   │   │   └── WhatsNewHost.tsx        #   Montado en MainApp: disparo de arranque + render del tour
│   │   ├── LinkedNote/                 # Notas vinculadas (archivo de texto externo) — ver patterns.md § "Notas vinculadas"
│   │   │   ├── LinkedNotesHost.tsx     #   (ventana principal) selector "Link file…", aviso del 1er vínculo,
│   │   │   │                           #   drop de archivos (no imágenes) desde el SO (captura), re-chequeo al enfocar
│   │   │   ├── LinkedNoteHeader.tsx    #   Cabecera en el editor (ruta, estado, acciones, banner de conflicto) +
│   │   │   │                           #   LinkedNoteCompactBar (sticky)
│   │   │   ├── LinkedConflictModal.tsx #   "Compare…": diff lado a lado + resultado combinado editable
│   │   │   ├── LinkedFileIcon.tsx      #   Icono por tipo (FileSymlink = Markdown, FileCode = texto plano)
│   │   │   └── linkedActions.ts        #   requestLinkFile (evento), tono del estado, helpers de ruta/drop
│   │   ├── VersionHistory/             # Panel "Version history" de una sección (NoteFlow Cloud) — ver patterns.md
│   │   │   ├── VersionHistoryPanel.tsx #   Modal: línea de tiempo por días, Cambios | Vista previa, Copiar /
│   │   │   │                           #   Restaurar como sección nueva / Restaurar esta versión, estados sin Cloud
│   │   │   ├── VersionHistoryParts.tsx #   Piezas de presentación (filas, diff, diálogo de captura fallida)
│   │   │   └── versionHistoryUi.ts     #   Clases compartidas (solo tokens del tema)
│   │   ├── ConfirmModal.tsx            # Modal de confirmación genérico (`hideCancel` = solo informativo)
│   │   ├── EncryptionModal.tsx         # Modal cifrar/descifrar notas
│   │   ├── ExportImportModal.tsx       # Modal exportar/importar notas (flujo, lanzado desde DataPanel)
│   │   ├── StickyApp.tsx               # Ventana sticky flotante (fold/unfold)
│   │   └── SectionWindowApp.tsx        # Ventana "Open in new window": solo-editor de una nota/sección
│   ├── lib/
│   │   ├── noteUtils.ts          # parseNoteFolder, serializeNoteFolder, buildNoteWritePayload,
│   │   │                         #   noteFingerprint, noteDirname, extractTags, default title…
│   │   ├── cryptoUtils.ts        # Cifrado AES-256-GCM + PBKDF2 (WebCrypto)
│   │   ├── alarmUtils.ts         # Recolección de alarmas/deadlines (líneas de tarea, también indentadas) — testeado
│   │   ├── paneUtils.ts          # Modelo puro de paneles del split (abrir/cerrar/reordenar/enfocar) — testeado
│   │   ├── archivedNotes.ts      # Notas que main movió al archivo local (`notes-archived`): cuáles salen del
│   │   │                         #   store y dónde queda el editor (puro; solo memoria, nunca borra) — testeado
│   │   ├── tocUtils.ts           # Lógica pura del índice flotante del editor (entradas, activo) — testeado
│   │   ├── folderIcons.ts        # Set curado de iconos de carpeta (clave estable → icono lucide) +
│   │   │                         #   resolveFolderIcon — testeado
│   │   ├── miniSidebar.ts        # Lógica pura del sidebar flotante (filas de la mini-vista, ventana,
│   │   │                         #   ancla/posición del panel, reglas de visibilidad compartidas) — testeado
│   │   ├── keyedQueue.ts         # Cola serial por clave (escrituras de una nota en orden) — testeada
│   │   ├── linkedNotes.ts        # Notas vinculadas en el renderer: wire → nota, Markdown vs texto plano
│   │   │                         #   (isPlainTextLinked, sectionShowsRaw), ruta → vinculada (findLinkedNoteByPath),
│   │   │                         #   decisión de recarga (apply/adopt/keep/conflict), URL `nflinked:` de
│   │   │                         #   imágenes, bloque de código al copiar texto plano — testeado
│   │   ├── linkedMarkdown.ts     # Conservar el fuente de los bloques no editados al guardar una vinculada
│   │   │                         #   (preserveUnchangedBlocks) — testeado
│   │   ├── syncStatus.ts         # Estado mostrado por el botón de sync (prioridades) + edad relativa — testeado
│   │   ├── encryptedSession.ts   # Re-descifrado con la contraseña de sesión tras recargar + guarda
│   │   │                         #   anti-borrado de escrituras de notas cifradas — testeado
│   │   ├── sectionUtils.ts       # Operaciones puras sobre la lista de secciones (patch/move/duplicate/restore)
│   │   ├── versionHistory.ts     # Historial de versiones: agrupado por días, horas escrita → reemplazada,
│   │   │                         #   diff por líneas, nombre de la sección restaurada, estado del panel,
│   │   │                         #   plan tras la captura — testeado
│   │   ├── sectionRestore.ts     # Marca de "restauración forzada" por ventana: el editor aplica la versión
│   │   │                         #   como sustitución exacta y un paso propio de Ctrl+Z (ver patterns.md) — testeado
│   │   ├── sectionMap.ts         # Mapa de secciones del editor: simulación del wrap/plegado, lado de caída
│   │   │                         #   al reordenar, contraste de la tinta — testeado
│   │   ├── sectionInk.ts         # resolveSectionInk: tinta legible sobre un color de sección sólido (lee las
│   │   │                         #   vars del tema; mapa del editor + vista de nota)
│   │   ├── noteOverviewGrid.ts   # Vista de nota: columnas por ancho, filas justificadas, foco por flechas,
│   │   │                         #   pie de tarjeta (tareas/palabras), recorte del preview — testeado
│   │   ├── activitySummary.ts    # Ajustes → General → Activity: totales (notas/secciones/palabras/tareas) y
│   │   │                         #   notas más tocadas en 28 días (log por dispositivo ∪ updated ∪ created) — testeado
│   │   ├── contentView.ts        # Vista de contenido: lugares (all/fav/none/g:/f:), filtro por lugar y archivadas,
│   │   │                         #   bloques por fecha, orden "como en el sidebar" (buildNoteList), ruta de la fila,
│   │   │                         #   selección por defecto y rango — testeado
│   │   ├── sidebarGroups.ts      # Modelo de la lista del sidebar: orden base (created desc) + agrupado
│   │   │                         #   grupo→carpeta con noteOrder (buildSidebarItems) — testeado vía contentView
│   │   ├── aiGroup.ts            # AI_GROUP_NAME ('IA Generated', el grupo fijo del perfil de IA) + isAiGroupName
│   │   │                         #   (lo leen ProfileFlow y el grafo del cerebro)
│   │   ├── searchUtils.ts        # Helpers de búsqueda (normalización, matching)
│   │   ├── keyScope.ts           # OWN_KEYS_PROPS/ownsKeys: campos que los atajos globales (capture) respetan
│   │   ├── tagColors.ts          # getTagColor — color por nombre de tag (8 vars del tema o hex libre);
│   │   │                         #   normalizeGroupColor (validación) y colorChannels (TODO render de
│   │   │                         #   color de grupo/sección debe pasar por él, no interpolar `var(...)`)
│   │   ├── markdownHtml.ts       # Conversión markdown↔HTML (htmlFromMarkdown/htmlToMarkdown);
│   │   │                         #   usado por el editor TipTap, los previews (vista de nota, tarjeta de preview, panel de la vista de contenido) y el chat IA — testeado
│   │   ├── markdownInline.ts     # Hoja compartida: inlineToHtml, escapeHtml, anotaciones de tarea 📅⏰🔺
│   │   ├── kanban.ts             # Tableros kanban en la nota: modelo + md↔datos↔HTML (ver patterns.md) — testeado
│   │   ├── kanbanOps.ts          #   transformaciones puras del tablero (columnas, tarjetas, columna done,
│   │   │                         #   conversión con listas de tareas) — testeado
│   │   ├── kanbanSearch.ts       #   búsqueda en nota dentro de tableros (conteo + resaltado) — testeado
│   │   ├── tableData.ts          # Tablas sobre string[][]: números, orden, resumen, copiar md/TSV, parsear
│   │   │                         #   TSV/CSV pegado, detector de TSV (ver patterns.md) — testeado
│   │   ├── tableShortcuts.ts     # Acordes de los atajos de tabla por plataforma (keymap + Ajustes) — testeado
│   │   ├── tablePaste.ts         # Decisiones de pegado (¿copia de ProseMirror?, ¿rango de hoja de cálculo?,
│   │   │                         #   ¿imagen de una tabla?) — testeado
│   │   ├── listItemMove.ts       # Mover ítems de lista con su subárbol (drag de tareas, Alt+↑/↓, marcadas
│   │   │                         #   al final, slash) como transacciones ProseMirror — testeado
│   │   ├── whatsNew.ts           # Lógica pura del tour "What's new" (qué mostrar, saneo, media) — testeado
│   │   ├── snippets.ts           # Fragmentos: variables {date:FORMATO}, tokenizador de formato estilo
│   │   │                         #   moment, sugerencias y operaciones de lista — testeado (ver patterns.md)
│   │   └── themes.ts             # Definición de los 14 temas (CSS vars)
│   ├── i18n/                     # Sistema i18n propio (EN/ES, sin deps): en/ = fuente de verdad
│   │                            #   del tipo Messages, es/ forzado a paridad; format.ts (tf/plural),
│   │                            #   resolveLang/getMessages, hook useT(). Namespaces por área
│   │                            #   (common, settings, sidebar, shell, editor, palette, aiPanel, brain…).
│   │                            #   Constantes de módulo con labels → factories getXxx(t) (SlashCommands,
│   │                            #   profileQuestions, chatSuggestions, comandos de CommandPalette).
│   │                            #   Fechas: dateLocale.ts (Lang→Locale de date-fns) + formatDate.ts
│   │                            #   (wrapper de format() que lee dateLocale del languageStore).
│   │                            #   electron/i18n.ts es un espejo autónomo del proceso main (tray,
│   │                            #   notificaciones y títulos de diálogos nativos; no comparte módulo
│   │                            #   con src/), resuelto en call-time desde settings.json (mainMessages())
│   └── types/
│       └── index.ts             # Tipos TS + declaración global window.noteflow
├── supabase/              # Backend de la cuenta NoteFlow (Fase 4): migrations/*.sql + README
│                          #   del operador (crear proyecto, plantilla OTP) — ver monetization.md
├── dist-electron/         # Output compilado de electron/ (COMMITEADO — incluir en commits)
├── docs/                  # Web de marketing (proyecto Astro independiente, npm propio) — ver release.md
├── public/                # Iconos, assets estáticos
├── release/               # Output de electron-builder (gitignored)
├── PKGBUILD               # Paquete Arch (electron del sistema, NOTEFLOW_NATIVE) — ROTO/no soportado, ver release.md
└── .github/workflows/
    ├── release.yml        # CI/CD: build matrix (win+linux+mac) + release al pushear un tag
    ├── update-e2e.yml     # E2E del updater sobre builds empaquetadas (manual, antes de publicar)
    └── pages.yml          # Build Astro de docs/ + deploy a GitHub Pages (push a main que toque docs/** o pages.yml)
```

## Arquitectura IPC (Electron)

El renderer NO tiene acceso a Node.js. Toda operación de sistema pasa por IPC:

```
Renderer (React)
  └─ window.noteflow.*         ← expuesto por preload.ts
       └─ ipcRenderer.invoke()/send()/sendSync()
            └─ ipcMain.handle()/on()  ← definido en main.ts
```

Excepción sin IPC: `window.noteflow.setUiZoom(factor)` llama a `webFrame.setZoomFactor` dentro del
propio preload (zoom nativo del "UI text size", ver `patterns.md` → "UI text size").

### Handlers IPC (fuente de verdad: `electron/main.ts` + `electron/preload.ts`)

| Canal | Tipo | Descripción |
|---|---|---|
| `fs:read-all-notes` | handle | Lee TODAS las carpetas de nota en una llamada → `NoteDirRecord[]` (`{dir,path,noteMd,sections:[{file,content}]}`; batch, con reintentos —6 × 800 ms si el listado sale vacío, por el `readdir` vacío transitorio de Windows—, salvo cuando el archivo local acaba de dejar el dir sin notas: `notesDirEmptiedByArchive`, que se limpia cuando un guardado o un pull escriben una nota o un listado vuelve a encontrar alguna; ver `sync.md` "Archivo local") |
| `fs:read-note-dir` | handle | Lee UNA carpeta de nota → `NoteDirRecord \| null` (usado por syncNote) |
| `fs:write-note` | handle | Escritura multi-archivo de una carpeta: `{dir, files, deleteFiles}` (note.md primero) + 1 broadcast + schedulePush por archivo + scheduleIndex |
| `fs:delete-note` | handle | Borra la carpeta entera (rmSync recursivo) + broadcast + scheduleDeleteDir en GitHub |
| `fs:notes-dir` | handle | Devuelve ruta del dir de notas |
| `linked:list` / `linked:get` | handle | Notas vinculadas (archivos de texto externos: Markdown o texto plano; ver `patterns.md` § "Notas vinculadas") → `LinkedNoteWire[]` / una por id o ruta (`null` = no vinculada): metadatos del registro (`isRawMode` siempre `true` si no es Markdown) + `status` (`checking`/`ok`/`missing`/`readonly`/`error` —`tooLarge`/`invalidUtf8`/`binary`/`loneCr`/`unreadable`—; `checking` = aún sin leer desde el arranque) + cuerpo (del disco, o de la caché si no se puede leer todavía) + `hash` + `draft?` (cambios sin escribir guardados en userData). Toda lectura del archivo en main es asíncrona |
| `linked:pick-files` | handle | `{multi, markdown?}` → selector nativo con filtros "All files" y "Markdown" ("All files" primero; "Markdown" primero con `markdown: true`, al localizar una vinculada Markdown), multiselección o uno para "Volver a localizar…" → rutas, que quedan **concedidas** para vincular (`grantLinkPaths`: un solo uso, 5 min) |
| `linked:grant-drop` | on (preload→main) | `(paths)` → concede las rutas de un drop **real** desde el SO. Lo envía el propio preload (listener `drop` en captura, solo `isTrusted`, rutas de `webUtils.getPathForFile`); no está en `window.noteflow`, la página no puede llamarlo |
| `linked:link` | handle | `(paths)` → `{linked, existing, errors}`: valida (ruta absoluta —si no `invalidPath`—, **concedida** por el selector o un drop real —si no `notGranted`; la concesión se consume—, existe, es archivo, fuera del dir de notas, y es **texto**: sin byte NUL —si no `binary`— y UTF-8 válido —si no `invalidUtf8`—; entero si cabe en 2 MB, si no sus primeros 8 KB), deduplica por ruta normalizada (sin distinguir mayúsculas en Windows/macOS) y devuelve la existente en vez de duplicar. Una ruta que el usuario no eligió no entra nunca, aunque la pida el renderer (ver `patterns.md` § "Notas vinculadas" → "Solo rutas concedidas") |
| `linked:relocate` | handle | `(id, newPath)` → `newPath` concedido como en `linked:link` (si no `notGranted`); reapunta el vínculo conservando título/grupo/favorito… y el borrador de cambios sin escribir (que contra el archivo nuevo sale como conflicto) (`alreadyLinked` si otra nota ya usa esa ruta) |
| `linked:unlink` | handle | Quita la nota del registro, su caché, su borrador y su sitio en el orden local. **Nunca toca el archivo** |
| `linked:update-meta` | handle | `(id, patch)` → título-alias, group/folder, favorited, archived, isRawMode (sin efecto en texto plano: siempre Modo texto), aiHidden (solo registro local) |
| `linked:write` | handle | `(id, body, baseHash)` → escribe el cuerpo SOLO si el disco tiene `baseHash` (si no: `{ok:false, reason:'conflict', disk}`); atómico (el tmp se borra ante cualquier fallo), conserva BOM/EOL/salto final/frontmatter (este solo en Markdown); la ruta sale del registro (nunca del renderer); borra el borrador solo si escribe su mismo contenido; si la nota se desvinculó mientras tanto no recrea su caché |
| `linked:set-draft` | handle | `(id, {body, baseHash} \| null)` → guarda/borra el borrador de cambios sin escribir (`userData/linked-notes-cache/<id>.draft.json`). Nunca escribe en el `.md` |
| `linked:asset-data-uri` | handle | `(id, src)` → una imagen con ruta relativa de una nota vinculada **Markdown** como data URI (`null` si la nota no es Markdown, si no es imagen, no es relativa al `.md` registrado, no aparece como imagen en el cuerpo de esa nota, falta o pasa de 10 MB). Para copiar la nota a una nota normal (Duplicate, "Save as template") |
| `linked:save-asset` | handle | `(id, name, mime, bytes)` → copia una imagen a `assets/` junto al `.md` → `{relPath}` (`{ok:false, error:'notMarkdown'}` si la nota no es Markdown) |
| `linked:show-in-folder` | handle | `shell.showItemInFolder` del archivo (o abre su carpeta si falta) |
| `linked:recheck` | handle | Re-lee (async) todos los vinculados (al enfocar la ventana): estado y contenido; emite lo que cambie y resuelve al terminar (el renderer re-sincroniza entonces las notas con cambios sin escribir) |
| `linked:take-open-requests` | handle | "Abrir con NoteFlow": → `{ids, errors}` de los archivos que main recibió del SO (argv / `second-instance` / `open-file`), concedió y vinculó él mismo como **temporales** (`transient`); los entrega una vez y vacía la cola. Solo la ventana principal (otra recibe `{ids: [], errors: []}`). No acepta rutas: el renderer nunca puede pedir vincular nada por aquí |
| `linked:open-requested` | event (main→ventana principal) | Hay archivos abiertos desde el SO en la cola: el renderer los toma con `linked:take-open-requests` (también lo hace al montar, tras la primera `loadNotes`) |
| `linked:keep` | handle | `(id)` → "Keep in NoteFlow": una vinculada temporal pasa a permanente (quita `transient` del registro, broadcast, se indexa) → wire (`null` si no existe) |
| `linked:discard-transient` | handle | `(id)` → `{discarded}`: la ventana principal cerró una temporal; main la desvincula (nunca toca el archivo) solo si sigue temporal, **no tiene borrador** y **ninguna sticky ni ventana de sección la muestra**; en la cola de la nota. Solo la ventana principal |
| `linked:transient-released` | event (main→ventana principal) | `(noteId)`: una sticky o ventana de sección que mostraba esa temporal se cerró (o la de sección pasó a otra nota): la ventana principal re-evalúa si descartarla |
| esquema `nflinked:` | protocol | `nflinked://n/<id>/<src>` (privilegios `standard` + `secure`, sin fetch) sirve SOLO archivos de imagen cuya ruta es relativa a la carpeta del `.md` de una nota vinculada Markdown (nunca para texto plano); puede subir de carpeta (`../img/x.png`). Rechaza esquemas, unidades, rutas absolutas/UNC, `:` y NUL, antes y después de decodificar `%xx` (previews y NodeView de imagen) |
| `app:open-notes-folder` | handle | Abre la carpeta en el explorador |
| `app:choose-notes-dir` | handle | Diálogo para elegir carpeta |
| `app:get-login-item` / `app:set-login-item` | handle | Autostart al login (gestiona `.desktop` propio en Linux). **Versión Store** (`IS_STORE_BUILD`, ver `release.md` § Microsoft Store): `get` → siempre `{openAtLogin:false}`, `set` → `{ok:false}` sin escribir `settings.json` |
| `app:get-version` | handle | Versión actual de la app (`app.getVersion()`) — la usa el panel About |
| `app:get-distribution` | handle | `'store' \| 'direct'`: `'store'` si corre desde el paquete MSIX de la Microsoft Store (`process.windowsStore`). Lo usan Ajustes → About (updates), Startup (autostart), General (skill del CLI) y Sync (`useCliConnect` / `CliConnectRow`) para mostrar una explicación en vez de controles que ahí no funcionan |
| `app:check-update` | handle | Consulta la última release en la API de GitHub → `{hasUpdate, latestVersion?, downloadUrl?, error?}` (`error: true` = el chequeo falló, no "al día"). **Versión Store** (`IS_STORE_BUILD`, ver `release.md` § Microsoft Store): cortocircuita a `{hasUpdate:false}` sin consultar |
| `app:download-and-install` | handle | Descarga el instalador (allowlist de hosts) e instala; emite progreso. **Versión Store** (`IS_STORE_BUILD`, ver `release.md` § Microsoft Store): se niega (`{success:false}`) sin descargar |
| `app:open-url` | handle | Abre URL externa (solo https, validada) |
| `feedback:send` | handle | Formulario "Send feedback" de Ajustes → About: `{kind: 'bug'\|'suggestion'\|'other', message, contact?, includeDiagnostics}` → `{ok:true} \| {ok:false, reason:'invalid'\|'network'\|'server'}`. Main revalida (`feedbackLogic.ts`), añade él mismo el diagnóstico (versión de la app, `process.platform` + arch, `process.getSystemVersion()`, idioma de la UI; no el locale del SO, que lleva la región) **solo** si `includeDiagnostics`, y hace `POST /rest/v1/feedback` (`Prefer: return=minimal`, timeout 15 s) con el access token si hay sesión — si no hay, el llavero está bloqueado o la petición con token se rechaza (401/403), se envía **anónimo** (solo `apikey`; solo un 401 invalida el token, contrato de `account.invalidateAccessToken`). El checkbox de diagnóstico de la UI es opt-in (desmarcado por defecto); lo recoge la política de privacidad de la web (§ 8 Feedback). No exige cuenta. Tabla y RLS en `supabase/migrations/0015_feedback.sql` |
| `settings:get-theme` / `settings:set-theme` | on (sync/async) | Tema en settings.json (sendSync para leer) — hoy es dual-write legacy: la fuente sincronizada del tema es `ui-settings.json` |
| `ui-settings:get` / `ui-settings:set` | on (sync) / handle | Apariencia + ajustes del editor SINCRONIZADOS → `ui-settings.json` (dir de notas). `get` es sendSync (initTheme lo necesita antes del primer paint); `set` recibe un patch PARCIAL que main mergea sobre el fichero (saneador puro en `electron/uiSettings.ts`, con tests), hace broadcast `notes-updated` y `schedulePush`. La escala de UI y el idioma quedan fuera (por dispositivo) |
| `settings:get-language` / `settings:set-language` | on (sync/async) | Idioma UI (`'system'\|'en'\|'es'`) en settings.json; el setter persiste, refresca el tray y hace broadcast `language-changed` a todas las ventanas (cambio en caliente) |
| `settings:get-ui-state` / `settings:set-ui-state` | handle | Estado UI (nota/sección activa, grupos y carpetas colapsados) |
| `settings:get-startup-stickies` / `settings:set-startup-stickies` | handle | Stickies que se abren al arrancar |
| `whats-new:get-seen` | handle | Tour "What's new": `{seen: string[], disabled: boolean}` — ids de diapositiva ya mostradas en este dispositivo (`settings.whatsNewSeen`, saneado) y `disabled` = env `NOTEFLOW_DISABLE_WHATS_NEW=1` (sin popup de arranque) |
| `whats-new:mark-seen` | handle | `(ids)` → unión saneada con `settings.whatsNewSeen` (nunca borra; solo escribe si cambia) → devuelve la lista resultante |
| `groups:get` / `groups:set` | handle | Grupos → `groups.json` (en dir de notas, se sincroniza) |
| `folders:get` / `folders:set` | handle | Carpetas → `folders.json` (en dir de notas, se sincroniza) |
| `section-colors:get` / `section-colors:set` | handle | Color por sección → `section-colors.json` (saneado, se sincroniza) |
| `note-order:get` / `note-order:set` | handle | Orden manual de notas → `note-order.json` (en dir de notas, se sincroniza). Los ids de notas vinculadas (`lnk:`) nunca van al fichero: `set` los separa al orden local de `linked-notes.json` y `get` los recombina (ver `patterns.md` § "Notas vinculadas") |
| `templates:get` / `templates:set` | handle | Plantillas de nota → `templates.json` (en dir de notas, se sincroniza) |
| `snippets:get` / `snippets:set` | handle | Fragmentos del toolbar → `snippets.json` (dir de notas, se sincroniza). Main sanea en las dos direcciones (`electron/snippetsFile.ts`); `set` hace broadcast **`snippets-updated`** (no `notes-updated`, que recargaría todas las notas) a las demás ventanas + `schedulePush` |
| `notes:export` | handle | Exporta a `.noteflow`/`.json`/`.md`/`.txt` (diálogo de guardado) |
| `notes:parse-import-file` | handle | Abre y parsea un archivo de importación (incluye `.md`/`.txt`) |
| `notes:parse-external-import` | handle | Importa de otras apps (`'md-folder'\|'notion'\|'keep'`): solo IO en main, devuelve `ExternalNote[]` normalizado; la conversión html→md y grupos son del renderer (detalle en `patterns.md` → Importación) |
| `notes:write-imported` | handle | Escribe las notas importadas (filenames saneados) |
| `alarms:schedule` | on | Registra el set de alarmas en el motor del main; dispara las vencidas |
| `window:minimize` / `maximize` / `close` | on | Controles de ventana (frameless). Actúan sobre la ventana EMISORA; `close` oculta la principal (tray) y destruye cualquier otra (sticky, ventana de sección) |
| `window:get-id` | on (sync) | webContents id de la ventana (para filtrar broadcasts) |
| `app:get-hardware` | on (sync) | Núcleos, modelo/velocidad de CPU y RAM (`os`); el preload lo lee una vez al cargar → `window.noteflow.hardware` (ver `ai.md`) |
| `app:get-user-name` | on (sync) | Nombre de la carpeta home (`path.basename(os.homedir())`); el preload lo lee una vez → `window.noteflow.systemUserName` (línea de identidad del pie del sidebar) |
| `window:open-sticky` | on | Abre ventana sticky flotante |
| `window:open-section-window` | on | `(noteId, sectionId)` → abre una ventana solo-editor (`#section-window?…`, `SectionWindowApp`); si una ventana de sección ya muestra esa nota+sección, la enfoca |
| `window:section-window-target` | on | La ventana de sección informa de la nota+sección que muestra (para el "enfocar si ya existe" del canal anterior y la recarga tras crash) |
| `window:set-size` | on | Redimensiona la ventana (usado por sticky) |
| `window:set-always-on-top` | on | Alterna `alwaysOnTop` de la ventana emisora (sticky; chincheta de la ventana de chat) |
| `window:fold-to-corner` / `window:unfold` | on | Anima el plegado/desplegado de stickies |
| `sync:get-status` | handle | Estado del sync **GitHub** (`enabled`, `connected`, owner, repo, lastSync, error, `initialPullStatus`, `conflictCopies?`, `conflictMerges?`, `originChoice?: {previous: {owner, repo}, next: {owner, repo}, stale?, staleFrom?: {email?}}` — presente mientras el dir de notas viene de otro repo y no se ha elegido, ver `sync.md` "Origen del dir de notas") |
| `sync:get-active-status` | handle | Estado NORMALIZADO del proveedor **activo** para el botón de la titlebar y su tarjeta de estado: `{backend: 'github'\|'cloud'\|'none', active, lastSync, error, initialPullStatus, pendingUploads, autoSyncIntervalMs?, history?: [{at, files, ok}], filesToday?, conflictCopies?: {count, titles, at}, conflictMerges?: {count, titles, at}, originChoice?: {previous, next, key, stale?, disconnectsGithub?}, github?: {owner, repo}, cloud?: {keysState, keysMode, realtimeConnected}}` (`originChoice` = elección de origen pendiente del backend activo: `previous`/`next` son etiquetas legibles — GitHub `owner/repo`, Cloud el email de la cuenta; `''` = desconocida → el renderer pone un texto genérico —, `key` = clave opaca que vuelve con la respuesta a `sync:resolve-origin`, `stale` = las notas vienen del OTRO backend (`previous` lo nombra), `disconnectsGithub` (solo Cloud) = "usar solo lo remoto" desconecta GitHub Sync; espeja `getActiveSyncProvider()` — ver `syncProvider.ts`/`sync.md`; `conflictCopies` = aviso de copias de conflicto del backend activo, sea Cloud o GitHub; `conflictMerges` = notas fusionadas con marcas de conflicto ⚠️, mismo formato) |
| `sync:dismiss-conflict-copies` | handle | Descarta el aviso de **copias de conflicto** y de **fusiones con marcas** (`conflictMerges`) de la tarjeta del botón de sync (limpia el de **ambos** backends — `cloudSync`/`githubSync.dismissConflictCopies()` — y emite `cloud:status-changed` + `sync:status-changed`); las copias siguen siendo notas |
| `sync:initiate` | handle | Inicia Device Flow OAuth (recibe `repo`); al completar → `sync-auth-complete` (`{ok, owner?, repo?, error?, pendingOriginChoice?}`) + autosync. Con `pendingOriginChoice: true` no hubo pull ni push ni migración: falta la elección de origen |
| `sync:resolve-origin` | handle | `(choice: 'merge' \| 'replace' \| 'cancel', backend?: 'github' \| 'cloud', key?: string)` → `{ok, error?, detail?}` (`backend` por defecto `'github'`; una sola guarda de reentrada para los dos; `key` = `ActiveSyncStatus.originChoice.key` de la elección en pantalla — si la pendiente ya es otra → `not-pending`). Resuelve la elección de origen pendiente de ese backend; si no tiene ninguna → `not-pending` (también con `cancel`). GitHub: `merge` = connect de siempre (pull + subir todo), `replace` = archiva lo local en `userData/notes-archive/` y luego pull (si el archivo falla → `error: 'archive-failed'`, sin pull, sigue pendiente), `cancel` = lo mismo que `sync:disconnect`. Cloud: `merge` = adopta la cuenta y lanza un ciclo (primer sync: baja la cuenta y sube lo local), `replace` = archiva, adopta, desconecta GitHub si estaba conectado y ciclo (solo baja), `cancel` = Cloud off (como "Turn off": `stopCloudAutoSync` + `dropRestoreSurface('cloud')`; sesión, notas y origen intactos). Otros `error`: `invalid`, `busy`, `settings-unreadable`, `settings-unwritable`, `not-connected` (GitHub), `not-enabled`/`not-signed-in` (Cloud) — ver `sync.md` "Origen del dir de notas". Preload: `resolveGithubOrigin(choice, key?)` / `resolveCloudOrigin(choice, key?)` |
| `sync:archives-status` / `sync:open-archives` | handle | `{hasArchives}` = existe alguna copia en `userData/notes-archive/` (carpetas con `manifest.json`) / abre esa carpeta con `shell.openPath` (`{ok}`) — Ajustes → Sync, "Open local copies" (`SyncOriginNotices.tsx`: fila "Local copies" de la vista general, o al pie del selector y de los detalles) |
| `sync:cancel-auth` | handle | Cancela un Device Flow en curso |
| `sync:disconnect` | handle | Desconecta GitHub, para autosync, limpia settings y emite `sync:status-changed` (`disconnectGitHub` solo lo emite si cambia `initialPullStatus`). Después borra la copia del token del CLI (`cliGithubToken`) si quedó huérfana (`cliConnect.cleanupAfterAppGithubDisconnect`; en Windows el `githubSync` borrado era también el del CLI) |
| `cli-connect:get-status` | handle | Ajustes → Sync → "Connect the CLI too": qué tiene el CLI, leído de **su** `settings.json` → `{available, cloud: {connected, email?}, github: {connected, owner?, repo?, canDisconnect}}` (`available` = se encontró el CLI empaquetado; siempre `false` en la versión Store, donde la UI ni muestra la sección). Cloud = presencia de `cliAccount` (nunca se lee su refresh token). Detalle en `patterns.md` § CLI "Conectar también el CLI" |
| `cli-connect:cloud-send-code` / `cli-connect:cloud-verify` | handle | Cloud, pasos 1 y 2: ejecuta el CLI empaquetado (`process.execPath` + `ELECTRON_RUN_AS_NODE=1`) con `cloud login <email> --send-code` y `cloud login <email> --code <código> --no-pull`. El email es el de la cuenta de la app (lo pone main); el código se valida en main (`^\d{6,10}$` tras quitar espacios/guiones) antes de llegar al argv → `{ok:true, status} \| {ok:false, error, detail?}` (`error`: `invalidCode`/`rateLimited`/`network`/`notSignedIn`/`cliMissing`/`failed`/`originChoicePending` — este último sin ejecutar el CLI mientras la elección de origen de Cloud está pendiente; `detail` = línea `Error:` del CLI) |
| `cli-connect:cloud-disconnect` | handle | `cloud logout` del CLI (revoca solo su sesión, `scope=local`) |
| `cli-connect:github-connect` / `cli-connect:github-disconnect` | handle | GitHub: copia owner/repo/token de la app al CLI (`githubSync.getConnectionForCli()`, tras confirmar en la UI) o lo quita. **Nunca** escribe el `githubSync` del fichero en Windows (es el de la app): ahí usa la clave propia del CLI `cliGithubToken`. `error: 'notConnected' \| 'noRepo' \| 'mismatch' \| 'failed' \| 'originChoicePending'` (este último: la elección de origen de GitHub está pendiente o su puerta está cerrada) |
| `sync:pull` | handle | Sync manual de **GitHub** (Settings → Sync → GitHub "Sync now"): drena el journal y luego pull. Rechazado con Cloud activo (`error: 'cloud-enabled'`, ver `sync.md`); con una elección de origen pendiente no sincroniza nada (`error: 'origin-choice-pending'`) |
| `sync:pull-active` | handle | Sync manual enrutado al backend **activo** (Cloud si `enabled`, GitHub si no): pull **y** drain del journal (ver `sync.md`) — lo usa el botón de la titlebar. Cloud con la elección de origen pendiente → no sincroniza (`error: 'origin-choice-pending'`) |
| `sync:mirror-to-github` | handle | **Espejo local → repo**: deja GitHub como copia exacta del disco (sube lo que difiere, borra lo que ya no existe). **Solo con Cloud habilitado** (gate en `main.ts`; si no → `{ok:false, error:'cloud-required'}`). Con la puerta de origen **de Cloud** cerrada (las notas en disco son de otra cuenta, o settings ilegible) → `'origin-choice-pending'` (el mismo código que el motor de GitHub usa como defensa en profundidad). No cambia nada local — ver `sync.md` |
| `account:get-status` | handle | Estado público de la cuenta NoteFlow (`{configured, signedIn, email, entitlements: {ai, cloud}, entitlementsKnown, entitlementsFetchedAt, sessionLocked, aiCheckoutConfigured, cloudCheckoutConfigured, bundleCheckoutConfigured, hasBillingSubscription, bundleUpgradeAvailable}`; `entitlementsKnown: false` = desconocidas, no "sin plan" (ver `monetization.md` § 2); `hasBillingSubscription` = tiene/tuvo una suscripción de Lemon Squeezy, gate de "Manage subscription"; `bundleUpgradeAvailable` = una sola de AI/Cloud vía una sola suscripción de LS activa → el Bundle se ofrece como cambio de plan) — **nunca** tokens |
| `account:request-otp` | handle | Envía el código OTP (8 dígitos) por email (Supabase GoTrue, `create_user: true`) |
| `account:verify-otp` | handle | Verifica `(email, code)` → guarda sesión (refresh token cifrado en `settings.account`) + primer fetch de entitlements |
| `account:sign-out` | handle | Logout best-effort en el servidor (`/auth/v1/logout?scope=local`: solo esta sesión) + limpia la sección `account` y el estado. La app vuelve a su estado gratuito: Cloud `enabled=false`, **sesión de claves borrada** (DEK + cache + `keysMode`/`remoteKeysKnown`), IA gestionada → proveedor BYO/local, y se guarda `accountRestore` (ver `monetization.md` § 4 "Cerrar sesión") |
| `account:delete` | handle | "Delete account": `account.deleteAccount` llama (con el access token, refrescado si hace falta) a la Edge Function `delete-account` (cancela la suscripción de LS y borra usuario + datos de Cloud). Éxito → limpia la sesión como un sign-out (sin `/logout`; el flanco de sign-out hace el teardown habitual) y además el handler apaga Cloud (red de seguridad, **sin tocar las notas locales**) y borra `accountRestore`. Devuelve `{ok, accountGone?, staleSession?}` o `errorCode` `sessionExpired` (401 tras reintentar), `deleteBillingFailed` (502: no se borró nada), `deleteFailed`, `network`…; un fallo deja la sesión como estaba. Ver `monetization.md` "Borrado de cuenta" |
| `account:refresh-entitlements` | handle | Relee `subscriptions` vía PostgREST/RLS y re-deriva `{ai, cloud}` (y las cachea en `account.entitlementsCache`). **Single-flight** (comparte la petición en curso de la misma sesión); un fallo transitorio entra en el **backoff** de reintentos automáticos (también al volver de suspensión / recuperar la red). `errorCode`: `network` (sin conexión — también si falla el refresh del token por red), `sessionLocked` (llavero del sistema bloqueado), `refreshFailed` (error del servidor), `notSignedIn`, `notConfigured`. Ver `monetization.md` § 2 |
| `account:open-checkout` | handle | Abre el checkout de Lemon Squeezy en el navegador con `checkout[custom][user_id]` (URL construida en main — el userId no cruza al renderer) |
| `account:upgrade-to-bundle` | handle | "Upgrade" del Bundle con AI o Cloud ya pagado: `account.upgradeToBundle` llama (con el access token) a la Edge Function `billing-change-plan`, que **cambia el plan** de esa misma suscripción de Lemon Squeezy (prorrateado, cobro inmediato, mismo intervalo) — nunca un segundo checkout; tras el OK re-pide entitlements hasta ver el Bundle. Sin fallback. Ver `monetization.md` § 2 "Pasar al Bundle" |
| `account:open-billing-portal` | handle | "Manage subscription": pide a la Edge Function `billing-portal` (con el access token) el enlace pre-firmado del customer portal de Lemon Squeezy y lo abre con `shell.openExternal`; ante **cualquier** fallo abre el portal genérico de la store (`LEMONSQUEEZY_STORE_PORTAL_URL`, login por email). Ambas URLs pasan la allowlist https + `*.lemonsqueezy.com` (`electron/billingPortal.ts`). Devuelve `{ok, via: 'customerPortal'\|'storePortal'}` o `errorCode: 'billingPortalUnavailable'`. Ver `monetization.md` § 2 |
| `cloud:get-status` | handle | Estado público de NoteFlow Cloud (`{configured, enabled, signedIn, keysState: 'unlocked'\|'locked'\|'no-keys', keysMode: 'managed'\|'e2ee'\|null, lastSync, error, initialPullStatus, realtimeConnected, conflictCopies?, conflictMerges?, originChoice?}`; `originChoice` = `{previous:{userId,email?}, next:{userId,email?}, stale?, staleFrom?:{owner,repo}, githubConnected?}` solo mientras la elección de origen está pendiente) — **nunca** material de claves |
| `cloud:setup` | handle | Passphrase → genera DEK + recovery code, sube `user_keys` y desbloquea; **devuelve el recovery code UNA vez** (no se persiste) — setup en modo e2ee (privado) |
| `cloud:setup-managed` | handle | Setup en modo managed (estándar, el default): genera la DEK y la deposita en la Edge Function `cloud-keys`, que la envuelve con la KEK del operador — sin passphrase ni recovery |
| `cloud:unlock` | handle | Desbloquea la sesión de claves e2ee con passphrase o recovery code (DEK solo en memoria del main + cache safeStorage) |
| `cloud:auto-unlock` | handle | Dispara el unlock silencioso managed (`autoUnlockManaged`, single-flight, nunca lanza) — lo pollea el panel mientras esté `locked`+managed |
| `cloud:upgrade-e2ee` | handle | Upgrade managed → e2ee: re-envuelve la DEK vigente con passphrase + recovery nuevos y anula `dek_managed_ct`; **devuelve el recovery code UNA vez** |
| `cloud:downgrade-managed` | handle | Downgrade e2ee → managed: envía la DEK vigente (requiere `unlocked`) a `cloud-keys/downgrade`, que la envuelve con la KEK del operador y anula las columnas passphrase/recovery (dejan de funcionar). Confirmado y avisado en la UI (ver `monetization.md` § 4) |
| `cloud:lock` | handle | Descarta la DEK en memoria y su cache cifrada |
| `cloud:enable` / `cloud:disable` | handle | Activa/desactiva el motor Cloud (activarlo toma prioridad sobre GitHub Sync — mutuamente excluyentes — y lanza pull inicial + polling); desactivar conserva journal y marcas |
| `cloud:pull` | handle | Sync manual de la nube ("Sync now"): ciclo completo — pull incremental + drain del journal — por el runner single-flight del auto-sync (mismo contrato de broadcast que `sync:pull`). Con la elección de origen pendiente no sincroniza nada (`error: 'origin-choice-pending'`) |
| `cloud:versions-list` | handle | `(target: {notePath, sectionId})` → `{ok:true, versions: CloudVersionMeta[]}` (máx. 200, `seq` desc; lista vacía = sin versiones) \| `{ok:false, errorCode}` — historial de una sección (`electron/cloudVersions.ts`, ver `monetization.md` § 4). No exige `cloudSync.enabled`; nunca lanza |
| `cloud:versions-get` | handle | `(target, id)` → `{ok:true, version: {id, seq, editedAt, reason, content}}` \| `{ok:false, errorCode}` (`not-found` = podada o fuera de los 30 días; `decrypt-failed` también si el `path_key` de la fila no es el del fichero) |
| `cloud:versions-snapshot` | handle | `(target)` → `{ok:true}` \| `{ok:false, errorCode}` — guarda el texto actual de la sección en el historial antes de restaurar: sube lo pendiente de ese fichero (`cloudSync.flushPathForSnapshot`, ver `sync.md`) y llama a la RPC `cloud_snapshot_file`. Códigos propios: `sync-off`, `sync-pending`, `no-subscription` |
| `ai:get-settings` / `ai:set-settings` | handle | Lee/escribe `settings.ai` (enabled, modelId); `set` aplica al worker y emite estado |
| `ai:related` | handle | Notas relacionadas con la **sección activa** (centroides + coseno) |
| `ai:search` | handle | Búsqueda semántica híbrida (vector + FTS5, RRF). La usa el RAG del chat (Fase 3) |
| `ai:graph` | handle | Aristas de contenido nota-a-nota (centroides por nota + coseno) para la vista cerebro (Fase 2) |
| `ai:reindex-all` | handle | Reindexa TODAS las secciones en background (lotes de 16) con progreso |
| `ai:get-stale` | handle | `{stale, count}`: si el índice va por detrás de las notas (main lleva la cuenta, persistida). Se emite además por el evento `ai:index-stale` — detalle en `ai.md` |
| `ai:llm-get-config` / `ai:llm-set-config` | handle | Lee/escribe `settings.aiLlm` (config del LLM por proveedor). `get` saneado (sin key); `set` aplica al **preset activo** (clave/modelo/baseUrl por proveedor) y cifra la key con `safeStorage`. El `baseUrl` se **ignora** (no se persiste) en presets con `editableBaseUrl: false` — sobre todo `noteflow`, cuya credencial es el token de Supabase; `effectiveBaseUrl` aplica la misma regla al leer |
| `ai:llm-presets` | handle | Catálogo de presets de proveedor (`electron/ai/llm/presets.ts`, vía `llm.listPresets()`): el preset `noteflow` lleva el **catálogo efectivo** de modelos (el descargado del proxy y cacheado en `settings.aiManagedCatalog`, o las constantes de respaldo) — ver `ai.md` |
| `ai:llm-list-models` / `ai:llm-test` | handle | Lista modelos del proveedor activo / valida conexión+credenciales. Con `noteflow` activo, `list-models` **re-descarga el catálogo** del proxy (forzado) y devuelve el efectivo; si falla, la caché sigue vigente y solo se informa del error |
| `ai:chat` | handle | Chat **agéntico** con streaming: contexto RAG + bucle de tool-calling, emite por eventos, admite `attachmentIds[]` (detalle en `ai.md` → Chat agéntico). `context?: {allNotes, items[], openNote?}` (solo sidebar del editor / ventana de chat): notas/secciones explícitas y RAG solo con `allNotes`; sin `context` = cerebro (ver `ai.md` → Chat en el editor) |
| `ai:chat-undo` | handle | `(toolCallId, force?)` → deshace una edición de nota del agente desde el snapshot en memoria de main → `{ok:true} \| {ok:false, reason:'modified'\|'unavailable'\|'conflict'\|'encryption'\|'error'}` (`modified` = la nota cambió tras la edición; la UI confirma y reintenta con `force`. `conflict` = habría que re-crear la nota o una sección borrada después; `encryption` = se cifró/descifró después; ninguno se puede forzar) |
| `ai:flush-edits-done` | on | `(token)` — la ventana principal confirma que escribió sus guardados pendientes (respuesta al evento `ai:flush-edits`) |
| `ai:chat-window-open` | handle | (solo ventana principal) `(handoff)` → crea/enfoca la **ventana de chat despegada** y le guarda la conversación |
| `ai:chat-window-is-open` | handle | `boolean` — si la ventana de chat existe (la principal lo consulta tras recargar) |
| `ai:chat-window-get-state` | handle | (solo ventana de chat) `{handoff, editorTarget}` — la conversación entregada + la nota/sección abierta en la principal |
| `ai:chat-window-focus` / `ai:chat-window-recall` | on | Enfoca la ventana de chat / le pide que devuelva la conversación y se cierre ("Traer aquí") |
| `ai:chat-window-return` | on | (solo ventana de chat) `(handoff \| null)` → main lo reenvía a la principal y destruye la ventana |
| `ai:chat-window-editor-target` | on | (solo ventana principal) nota/sección del panel activo `{noteId, noteTitle, sectionId?, sectionName?, encrypted, sectionAiHidden} \| null`; main lo cachea y lo reenvía a la ventana de chat |
| `ai:chat-window-ask` | on | (solo ventana principal) `(prompt)` → "Ask AI" de la paleta con el chat despegado: main enfoca la ventana de chat y le reenvía el prompt (chat nuevo) |
| `ai:chat-window-command` | on | (solo ventana de chat) `{type:'open-note', noteId, sectionId?} \| {type:'open-ai-settings'}` → main enfoca la principal y se lo reenvía |
| `ai:chat-pick-files` / `ai:chat-remove-file` | handle | Adjuntos del chat a la caché `chatFiles` del main (persisten para preguntas de seguimiento); devuelve solo metadatos — los bytes NUNCA cruzan al renderer |
| `ai:chat-cancel` | on | Aborta un `ai:chat` en vuelo por `requestId` (AbortController); también resuelve confirmaciones pendientes |
| `ai:chat-confirm` | on | Resuelve la confirmación de una tool destructiva por `toolCallId` (`{toolCallId, approved}`) |
| `ai:chats-load` / `ai:chats-save` | handle | Historial de chats en `userData/ai-chats.json` (local, NO se sincroniza) |
| `activity:record-edit` | on | `(noteId)` → apunta que el usuario editó esa nota hoy en el log de actividad por dispositivo (`userData/activity-log.json`). Lo envía `applyNoteUpdate` de `notesStore` (todas las ediciones de usuario: editor, sticky, ventana de sección, overviews, menús); main lo llama también para las ediciones de nota del agente del chat (`ToolContext.onNoteEdited`). Nunca desde sync pull, imports, migración ni autoborrado de notas temporales. Escritura con debounce (2 s) + atómica (tmp + rename), flush en `will-quit` |
| `activity:get-log` | handle | `{days: Record<'YYYY-MM-DD', noteId[]>}` (podado) — lo lee la sección Activity de Ajustes → General (`ActivitySummary.tsx`: días tocados por nota en las últimas 4 semanas, lógica en `lib/activitySummary.ts`) |
| `ai:profile-pick-files` / `ai:profile-remove-file` | handle | Segundo cerebro: file picker capado por capacidades del proveedor a una caché en main (solo metadatos al renderer) |
| `ai:profile-generate` | handle | Segundo cerebro: `{fields[], fileIds[], urls[], locale?}` → prompt + adjuntos nativos → LLM → `{title, sections[]}` (detalle en `ai.md` → Segundo cerebro) |
| `ai:profile-get-status` / `ai:profile-set-completed` | handle | `settings.aiProfile` = `{completedAt, noteId?}` (cuestionario mostrado una vez + id de la nota de perfil generada, para enlazar/regenerar sin duplicar). `set-completed(noteId?)`: sin `noteId` = "Not now" (saltado) |

**Eventos main → renderer** (suscripción vía `window.noteflow.on*`):
`new-note`, `notes-updated` (filePath?, senderId? — `filePath` es la carpeta de una nota, o la ruta del
`.md` de una **nota vinculada**: `syncNote` desvía las rutas `.md` a `syncLinkedNote`),
`notes-archived` (`{noteIds: string[], dirs: string[]}` — "usar solo las notas de…" movió esas notas al
archivo local `userData/notes-archive/`; va a todas las ventanas justo **antes** del `notes-updated` sin
ruta del archivo. `onNotesArchived` → `notesStore.removeArchivedNotes` (vía `bindArchivedNotes()` en
`App.tsx` — `MainApp`, que respalda la ventana principal y las sticky —, `SectionWindowApp.tsx` y
`AiChatWindowApp.tsx`) las quita **solo de
memoria**, nunca borra: la recarga no puede hacerlo porque `loadNotes` ignora un resultado vacío con
notas en el store — ver `sync.md` "Archivo local"), `snippets-updated` (sin payload — otra ventana
guardó `snippets.json`), `groups-updated` (sin payload — el watcher vio `groups.json` / `folders.json` /
`note-order.json` escritos FUERA de la app, p. ej. por el CLI; `App.tsx` (principal y sticky) y
`SectionWindowApp.tsx` recargan solo `groupsStore.loadGroups()`), `update:download-progress` (percent),
`update:installing` (fase de instalación, post-descarga),
`window:visibility` (boolean — solo la ventana principal, en `show`/`hide`/`minimize`/`restore`: `isVisible() && !isMinimized()`; con `backgroundThrottling: false` `document.hidden` nunca cambia, así que `BrainScene` para su bucle con esto vía `onWindowVisibility`),
`sync-auth-complete`, `sync:push-state` (`'pushing'|'idle'`), `sync:status-changed`,
`account:status-changed` (broadcast del status público de la cuenta a todas las ventanas; main lo emite
DESPUÉS de reescribir `settings.aiLlm.active` si toca, y `App.tsx` / `AiChatWindowApp.tsx` recargan la
config LLM del chat con él),
`cloud:status-changed` (broadcast del status público de NoteFlow Cloud — mismo shape que `cloud:get-status`),
`ai:reindex-progress` (`{done,total}`), `ai:index-state` (estado del índice),
`ai:index-stale` (`{stale,count}` — índice por detrás de las notas; OJO: no es lo mismo que `ai:index-state`),
`ai:llm-presets-changed` (sin payload — cambió el catálogo de modelos de NoteFlow AI; `App.tsx` y `AiChatWindowApp.tsx` recargan
presets + config si ya estaban cargados),
`ai:chat-delta` (`{requestId,delta}`), `ai:chat-sources` (`{requestId,sources}`),
`ai:chat-done` (`{requestId,aborted?}`), `ai:chat-error` (`{requestId,error}`),
`ai:chat-tool-call` (`{requestId,toolCallId,name,input,label}` — `label` es la frase en presente
"qué está haciendo" con el objetivo resuelto a título por `agentTools.describeAction`, mostrada en la
fila de actividad mientras la tool corre), `ai:chat-tool-result`
(`{requestId,toolCallId,status,summary,undoable?}` — `undoable` = main guardó un snapshot para
deshacerla), `ai:chat-confirm-request`
(`{requestId,toolCallId,name,input}` — tool destructiva esperando confirmación),
`ai:flush-edits` (`token` — a la ventana principal: escribir los guardados con debounce antes de que un
turno de chat o un undo lea notas; responde `ai:flush-edits-done`), `ai:chat-window-returned`
(`handoff | null` — a la principal: vuelve la conversación de la ventana de chat), `ai:chat-window-command`
(a la principal), `ai:chat-window-editor-target`, `ai:chat-window-request-close` y `ai:chat-window-ask`
(a la ventana de chat).

**Eventos internos del renderer** (`window.dispatchEvent(new CustomEvent('noteflow:…'))`, sin IPC):
la familia `noteflow:open-*` la atiende `TitleBar.tsx` para abrir Ajustes en una sección.
`noteflow:open-settings` es la genérica: `detail {section, intent?}` abre esa sección del
`SettingsModal` (con `initialIntent`); la usa el panel de historial de versiones para llevar a Ajustes
→ Sync en el detalle de NoteFlow Cloud (`{section: 'sync', intent: {offer: 'cloud'}}`: su plan, o el
desbloqueo de claves), tanto desde la oferta sin Cloud como desde el estado de claves bloqueadas.

### Modelo de almacenamiento

**Notas y datos sincronizables** viven en el dir de notas (todo se sube a GitHub si hay sync):

| Plataforma | Ruta |
|---|---|
| Windows | `~/noteflow-notes/` |
| Linux | `~/.local/share/noteflow-notes/` (XDG; migración automática desde `~/noteflow-notes` y `~/scratch-notes`) |
| macOS | `~/noteflow-notes/` (mismo fallback que Windows — **deliberado**: mantiene paridad con el CLI y deja las notas visibles en el home) |

Contenido del dir de notas:
- `<slug>-<id>/` — **una carpeta por nota** (`note.md` + un `.md` por sección; ver "Formato").
- `.noteflow-format` — marcador de versión del formato (`2`).
- `groups.json` — definición de grupos (`{id,name,color,order,archived?}`; `archived?` oculta el
  grupo y sus notas salvo con "Show archived").
- `folders.json` — definición de carpetas (subcarpetas de grupos): array `NoteFolder[]`
  (`{id,name,groupId,order,icon?}`). `order` = posición dentro de su grupo (ascendente; el usuario la
  cambia arrastrando carpetas en el sidebar o en la vista de contenido → `groupsStore.reorderFolders`). `icon?` = clave del set curado de `src/lib/folderIcons.ts`
  (ausente o desconocida → icono de carpeta por defecto); se escribe tal cual (sin campo `icon`
  cuando vuelve al predeterminado). CLI, tools de la IA y móvil hacen `{...f, name}` al renombrar, así
  que conservan campos que no conocen: añadir campos opcionales aquí es compatible en ambos sentidos.
- `section-colors.json` — mapa `nombreSección(normalizado) → color`: una CSS var del tema (`--accent`…)
  **o** un hex libre `#rrggbb` (ver "Color de grupos y secciones" en `patterns.md`). No reintroducir un
  validador var-only en `sanitizeSectionColors`: borraría los colores personalizados del usuario al guardar.
- `note-order.json` — orden manual de notas por contexto (`Record<contextKey, string[]>`); contextKey: `'ungrouped'`, `'group:<id>'`, `'folder:<id>'`, `'favorites'`. Gestionado desde `groupsStore` (`noteOrder`, `setContextNoteOrder`).
- `templates.json` — array de plantillas de nota (`NoteTemplate[]`: `{id,name,title,sections,createdAt}`). Gestionado desde `templatesStore`. Crear nota desde plantilla regenera ids de sección y usa `createPopulatedNote`; "Save as template" en el menú ⋯ del editor captura título + secciones (oculto si la nota está cifrada y bloqueada). UI en Settings → Templates.
- `snippets.json` — fragmentos del botón del toolbar: **array plano** en orden de visualización de
  `Snippet` (`{id,name,content,createdAt,isDefault?: true}`); el por defecto es el marcado (si no hay,
  el primero). Array de objetos con id → Cloud lo **fusiona por id** como `templates.json` (si dos
  dispositivos marcan uno cada uno, el saneador deja solo el primero). El saneador de main conserva claves
  desconocidas de cada ítem (compatibilidad hacia delante). No va en `ui-settings.json` porque el móvil
  re-sanea ese fichero y borraría la clave. Sintaxis y decisiones en `patterns.md` § "Editor: fragmentos".
- `ui-settings.json` — apariencia (tema, último tema oscuro/claro `lastDarkThemeId`/`lastLightThemeId`
  para el Light / Dark del ⋯ del footer, fuente de app, acento, colores del editor) + ajustes del
  editor (tamaño/familia de fuente, ancho legible, índice flotante `showToc`, tareas marcadas al final
  `moveCheckedToBottom`) sincronizados entre dispositivos. Formato y
  saneado/merge en `electron/uiSettings.ts` (módulo puro, tests en `tests/electron/uiSettings.test.ts`).
  **Espejo en noteflow-mobile** (`src/core/uiSettings.ts`): su saneador también descarta claves
  desconocidas y el móvil re-sanea el fichero antes de cada escritura (`appearanceStore`), así que un
  campo nuevo que no se porte allí se borra en cuanto el móvil guarda su apariencia (p. ej. un cambio de
  acento). Todo campo nuevo del esquema hay que añadirlo en los dos. **Estado del espejo (2026-11-16):**
  el móvil ya conoce todas las claves actuales. El centinela `'text'` de `accent`/`editorColors.*` (color
  "texto" adaptativo) y `lastDarkThemeId`/`lastLightThemeId` llegaron en `09b9e28` (2026-11-14, publicado
  en la prueba cerrada 5, 1.0.0). `editor.moveCheckedToBottom` llegó en `9345c7d` (2026-11-16), **aún sin
  publicar**: hasta la siguiente versión del móvil, una escritura de apariencia desde el móvil instalado lo
  borra y los desktops vuelven al valor por defecto (desactivado) en su siguiente arranque
  (`reloadUiSettings` conserva el valor en memoria si la clave falta). Los **desktops anteriores** a cada
  cambio siguen borrando esas claves en cualquier escritura de `ui-settings.json` — detalle en **Color
  "texto" adaptativo** (sección "Colores del editor") y "Light / Dark recuerda el último tema de cada
  tipo" de `patterns.md`.
  Claves de override tri-estado: AUSENTE = nunca escrita (los stores caen a las fuentes legacy
  locales y hacen seed una vez), `null` = override borrado explícitamente ("sigue al tema"),
  string = valor. Los stores (`themeStore`, `editorSettingsStore`) siguen dual-escribiendo las
  fuentes legacy (settings.json / localStorage) por compatibilidad con downgrade. NO se
  sincronizan: escala de UI (`noteflow-ui-scale`, localStorage), estilo de las secciones en las filas
  del sidebar (`noteflow-sidebar-sections`: ausente = mapa plegado, `'row'` = fila con scroll;
  localStorage) ni idioma (por dispositivo).

> El dir es configurable desde Settings → "Choose notes directory".

**Ajustes locales (NO se sincronizan)** en `settings.json` (nota: `theme` sigue aquí como
dual-write legacy — la fuente sincronizada es `ui-settings.json` del dir de notas):
- **Windows:** `%APPDATA%\noteflow\settings.json`
- **Linux:** `~/.config/NoteFlow/settings.json` (`$XDG_CONFIG_HOME` si está definido)
- **macOS:** `~/Library/Application Support/NoteFlow/settings.json`
- (vía `app.getPath('userData')` = `<appData>/<app.name>`, y Electron toma `app.name` del
  **`productName`** de `package.json` — `NoteFlow` —, no de `name`; comprobado: `app.getName()`
  devuelve `NoteFlow`). En Windows la carpeta aparece como `noteflow` si la creó antes el CLI: es
  la misma (NTFS no distingue mayúsculas).

> **Seguridad / modelo de amenaza.** La app cifra los secretos con `safeStorage` (base64 solo
> como fallback si el SO no lo ofrece). El **CLI** comparte este fichero **solo en Windows**: usa
> `%APPDATA%\noteflow` (= `NoteFlow`, sin distinguir mayúsculas) y en Linux/macOS
> `${XDG_CONFIG_HOME:-~/.config}/noteflow`, que en Linux es **otra** carpeta que `~/.config/NoteFlow`
> (sistema de ficheros sensible a mayúsculas) — así que allí la app y el CLI no comparten
> `githubSync`, y `status --json` lee el de la app aparte para la pista `desktopApp` (ver
> `patterns.md` § CLI). Como un
> proceso Node no tiene `safeStorage`, guarda su token de GitHub (`githubSync.encryptedToken`, scope
> `repo`, o la copia `cliGithubToken` que escribe la app con "Connect the CLI too") y su refresh token
> de Cloud (`cliAccount.refreshToken`) **solo en base64**. Lo que los
> protege es el permiso del fichero: en Linux/macOS el CLI deja `settings.json` en **`0600`**
> (`restrictSettingsPerms()` al arrancar cualquier comando + `writeSettings`). Se protege frente a
> otros usuarios locales, no frente a procesos del mismo usuario (el criterio de `gh` / `~/.ssh`).
> Los writers de la app (`writeSettings` en `main.ts`, `githubSync.ts`, `account.ts`, `cloudSync.ts`,
> `cloudKeys.ts`, y `cliConnect.ts` sobre el `settings.json` del CLI) escriben todos vía `writeSettingsFile` (`electron/settingsFile.ts`): **in-place**
> con `writeFileSync` y `mode: 0o600` (aplica al crear el fichero), más un `chmod 0600` previo si el
> fichero existente está más abierto — en POSIX `settings.json` queda siempre owner-only, también
> cuando lo crea la app. Un writer nuevo de este fichero debe usar ese helper. **No** cambies a
> tmp + rename sin crear el tmp en `0600`, porque deshaces el endurecimiento.

Estructura de `settings.json`:
```json
{
  "theme": "carbon",
  "language": "system",
  "openAtLogin": false,
  "uiState": {
    "activeNoteId": "xyz",
    "activeSectionId": "sec001",
    "collapsedGroupIds": ["abc12345"],
    "collapsedFolderIds": ["fld001"],
    "sidebarMode": "floating"
  },
  "startupStickies": [
    { "noteId": "xyz", "sectionId": "sec001" }
  ],
  "stickyBounds": {
    "xyz/sec001": {
      "expanded": { "x": 800, "y": 120, "width": 320, "height": 380 },
      "folded":   { "x": 40, "y": 1000, "width": 220, "height": 39 },
      "isFolded": true
    }
  },
  "githubSync": {
    "enabled": true,
    "encryptedToken": "<cifrado con safeStorage o base64 fallback>",
    "owner": "username",
    "repo": "noteflow-notes",
    "repoId": 123456789,
    "lastSync": "2026-03-25T10:00:00.000Z"
  },
  "syncOrigin": {
    "github": { "repoId": 123456789, "owner": "username", "repo": "noteflow-notes", "notesDir": "<ruta absoluta del dir de notas>" },
    "cloud": { "userId": "<uuid de auth.users>", "email": "user@example.com", "notesDir": "<ruta absoluta del dir de notas>" }
  },
  "account": {
    "email": "user@example.com",
    "userId": "<uuid de auth.users>",
    "encryptedRefreshToken": "<cifrado con safeStorage o base64 fallback>",
    "entitlementsCache": { "userId": "<uuid>", "ai": true, "cloud": false, "fetchedAt": "<ISO>", "billing": true, "bundleUpgrade": true }
  },
  "cloudSync": {
    "enabled": true,
    "lastSync": "2026-07-10T12:00:00.000Z",
    "pullSeq": 18342,
    "encryptedDek": "safe:<solo si safeStorage está disponible — NUNCA base64 fallback>",
    "keysMode": "managed"
  },
  "accountRestore": {
    "identity": "user@example.com",
    "cloudEnabled": true,
    "aiManaged": true
  },
  "ai": { "enabled": false, "modelId": "..." },
  "aiLlm": {
    "active": "anthropic",
    "lastByoProvider": "ollama",
    "byPreset": {
      "anthropic": { "model": "claude-opus-4-8", "encryptedApiKey": "<safe:...>" },
      "ollama":    { "baseUrl": "http://localhost:11434/v1", "model": "..." }
    }
  },
  "aiManagedCatalog": {
    "models": [{ "id": "deepseek/deepseek-v4.1-flash-1017", "costIndex": 1, "images": true, "recommended": true }],
    "updatedAt": "2026-10-24T10:00:00.000Z"
  },
  "aiProfile": { "completedAt": "2026-06-14T10:00:00.000Z", "noteId": "abc12345" },
  "whatsNewSeen": ["sections", "kanban", "links-palette"],
  "welcomeNoteSeeded": true,
  "aiChatWindow": { "bounds": { "x": 1200, "y": 120, "width": 440, "height": 680 } }
}
```

> **Importante:** grupos/carpetas/colores de sección NO están en `settings.json` — están en
> archivos JSON dentro del dir de notas para poder sincronizarse entre dispositivos. El **historial
> de chats** vive en `userData/ai-chats.json` (local, no se sincroniza); las **API keys del LLM** se
> cifran por proveedor en `settings.aiLlm.byPreset[*].encryptedApiKey` (nunca cruzan al renderer).
> `aiManagedCatalog` es la **caché** del catálogo de modelos de NoteFlow AI que sirve el proxy
> (`GET /models`); no es configuración del usuario (su modelo elegido sigue en `aiLlm`) y nunca se
> pisa con una descarga fallida o inválida (ver `ai.md`).
> `uiState` es estado de UI **local** de este dispositivo (`getUiState`/`setUiState`; el handler
> fusiona el patch tal cual, sin sanear: el renderer valida al leer): nota/sección activas, grupos y
> carpetas colapsados y `sidebarMode` (`'pinned'` | `'floating'`, ausente = fijado; ver `patterns.md`
> "Sidebar flotante").
> `syncOrigin` = **origen del dir de notas** por backend: el remoto con el que este dispositivo
> reconcilió por última vez sus notas (GitHub: `repoId` numérico de la API — sobrevive a renombrados —
> + `owner`/`repo`; Cloud: `userId` + `email` como etiqueta). Opcionales: `stale: true` (las notas en
> disco las sustituyó el "usar solo las de…" del OTRO backend) y `notesDir` (el dir de notas que
> describe el registro; ausente = el dir por defecto — un registro solo cuenta para su dir). Lo escriben
> la app y el CLI con read-modify-write sobre el fichero; **`disconnectGitHub` no lo borra**. Un cambio
> de identidad (o un registro `stale`) con notas sincronizables en disco bloquea el sync de ese backend
> hasta que el usuario elige (ver `sync.md` "Origen del dir de notas"). `githubSync.repoId` = id numérico del repo conectado (se guarda al conectar; las
> conexiones anteriores lo reciben en su siguiente pull).
> Las **copias locales** de "Usar solo las notas del remoto" viven en `userData/notes-archive/<etiqueta>-<ISO
> con ':'→'-'>/` (`manifest.json` + `notes/` con las carpetas de nota y los json movidos) — fuera del dir
> de notas, nunca se sincronizan ni se borran solas (`electron/notesArchive.ts`).
> Los **journals de sync** viven en `userData/sync-state.json` (GitHub) y
> `userData/cloud-sync-state.json` (NoteFlow Cloud; guarda también las **bases** de la fusión en tres
> vías por fichero, ver `monetization.md` § 4) — estado LOCAL del dispositivo, nunca en el dir
> de notas. El **log de actividad** vive en `userData/activity-log.json` (local, NO se sincroniza,
> fichero aparte para no engordar `settings.json`): `{version: 1, days: {'YYYY-MM-DD' (día local):
> noteId[]}}` con los ids (sin duplicados; nunca títulos ni contenido) de las notas que el usuario
> editó cada día en ESTE dispositivo; se podan los días de más de 120 en cada escritura. Lógica
> pura en `electron/activityLog.ts`; como no guarda secretos se escribe con tmp + rename (la regla
> in-place del apartado "Seguridad" de arriba es solo para `settings.json`).
> Las **notas vinculadas** (archivos de texto externos editados en su sitio) guardan su estado en
> `userData/linked-notes.json` (`{version: 1, notes: [{id: 'lnk:…', path, title, group?, folder?,
> favorited?, archived?, isRawMode?, aiHidden?, created, updated, known?: {hash, size, mtimeMs},
> transient?: true}], order: {contextKey: id[]}}` — `order` = listas completas del orden manual de los
> contextos con alguna vinculada, que nunca van a `note-order.json`; `transient` = abierta desde el sistema
> ("Abrir con NoteFlow") y no mantenida: se descarta al cerrarla y al arrancar (salvo con borrador), sin sitio en
> el orden ni índice de IA; sin el campo = permanente (registros anteriores incluidos); saneado al leer por
> `sanitizeLinkedRegistry`; tmp + rename, sin secretos),
> una **caché del último contenido conocido** por nota en `userData/linked-notes-cache/<id>.md` (para seguir
> mostrándola si el archivo falta o mientras se lee al arrancar) y, mientras tenga cambios sin escribir
> (conflicto, archivo de solo lectura o ausente), un **borrador** `<id>.draft.json` (`{body, baseHash}`).
> Local, NO se sincroniza, y nada de esto va al dir de notas (ver `patterns.md` § "Notas vinculadas").
> `aiChatWindow.bounds` = tamaño/posición de la ventana de chat despegada (se guarda al cerrarla;
> la posición se descarta si ya no cae en ninguna pantalla). El ancho del sidebar de chat del editor va
> en `localStorage` (`noteflow-ai-chat-width`), no aquí.
> `whatsNewSeen` = ids de las diapositivas del tour "What's new" que ESTE dispositivo ya mostró
> (unión, deduplicada y saneada en main por `electron/whatsNewSeen.ts`); decide qué sale en el popup
> de arranque — ver `patterns.md` → "Tour What's new".
> `welcomeNoteSeeded` = la decisión de la **nota de bienvenida** ya se tomó en este dispositivo (se
> creara o no). Al arrancar, tras la migración v1→v2 y antes del pull inicial y del watcher,
> `seedWelcomeNoteIfFirstRun()` (`main.ts`, decisión pura `planWelcomeNote` en `electron/welcomeNote.ts`)
> crea la nota solo en una **instalación nueva**: `settings.json` **no existe** todavía (nada lo escribe
> antes en el arranque; comprobado — es la señal fiable, porque la clave es nueva y ningún usuario existente
> la tiene), el dir de notas no tiene ninguna nota (carpeta con `note.md` ni `.md` suelto; dir ilegible =
> "tiene notas"; el listado se reintenta como en `fs:read-all-notes` —6 × 800 ms— salvo si este arranque
> acaba de crear el dir, que está vacío seguro) y no hay GitHub Sync ni Cloud con `enabled: true`. Un
> `settings.json` existente sin la clave = usuario que actualiza → solo se escribe la clave (un `readdir`
> vacío transitorio de Windows al arrancar no puede colarle la nota). En cualquier caso distinto de crear
> solo se escribe la clave, así que no se recrea si el usuario la borra. En Windows el CLI comparte
> `settings.json`: quien usó el CLI antes de instalar la app tampoco la recibe. Un `settings.json` que
> existe pero no parsea no se toca (escribirlo lo borraría): la decisión espera a un arranque en que se
> lea bien. Si falla escribir la nota, se borra
> la carpeta a medias y no se apunta la clave; solo se reintenta si en el siguiente arranque `settings.json` sigue sin existir (lo normal es que otro código ya lo haya escrito durante la sesión, y entonces solo se apunta la clave). La nota es **solo-local**
> (`localOnly: true`, ver `sync.md` "Notas solo-locales"), con el contenido en el idioma de la UI de ese
> momento y las teclas de la plataforma (⌘/⌃ en macOS).
> `accountRestore` es una activación pendiente de las features de pago, **sin secretos** (email +
> dos booleanos): la escribe el sign-out (qué tenía activo la sesión que cerró) y el sign-in cuando
> las entitlements aún no se conocen ("activar lo que resulte pagado"); se consume cuando llegan.
> Un nuevo login lo sustituye (ver `monetization.md` § 4 "Cerrar sesión" → "Al iniciar sesión").
