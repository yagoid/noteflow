# NoteFlow — Arquitectura, IPC y almacenamiento

## Repositorio y proyectos relacionados

- **GitHub:** https://github.com/yagoid/noteflow
- **Rama principal:** `main`
- **Directorio local:** raíz del repo clonado (la ruta absoluta varía por máquina).
- **Versión actual:** ver `package.json` (`version`). Convención `vX.Y.Z`.
- **Licencia:** ver el campo `license` de `package.json`.
- **Documentación del proyecto:** vive en `.claude/context/*.md` (este directorio); el **índice/mapa**
  está en el `CLAUDE.md` de la raíz, que se carga en cada sesión.
- **Proyectos/skills hermanas:**
  - `noteflow-features` (skill) → funcionalidades, UI, UX, atajos (perspectiva de producto/usuario).
  - `noteflow-cli` (skill) → referencia completa del CLI companion.
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
│   ├── githubSync.ts    # Sync con GitHub (Device Flow OAuth, push/pull por carpeta,
│   │                    #   Trees API, migración remota, cifrado token)
│   ├── syncState.ts     # Lógica pura del journal de mutaciones + sha-cache (la usan GitHub y Cloud)
│   ├── mirrorPlan.ts    # Lógica pura del espejo local→GitHub (plan + allowlist de borrado) — ver sync.md
│   ├── syncProvider.ts  # Interfaz SyncProvider + getActiveSyncProvider() (GitHub ⟂ Cloud) — ver sync.md
│   ├── tempNoteExpiry.ts # Lógica pura: cuándo puede correr el autoborrado de notas temporales
│   │                    #   (con sync, solo tras un pull limpio) — testeada; ver patterns.md
│   ├── account.ts       # Cuenta NoteFlow (Supabase Auth email+OTP vía REST, sesión en main,
│   │                    #   refresh token cifrado, entitlements) — ver monetization.md
│   ├── accountTransition.ts # Lógica pura del sign-out/sign-in: qué apagar (Cloud, DEK, IA gestionada)
│   │                    #   y qué restaurar (registro accountRestore) — testeada; ver monetization.md § 4
│   ├── cloudConfig.ts   # URL + anon key del proyecto Supabase real (la anon key es pública por diseño)
│   ├── cloudCrypto.ts   # Capa criptográfica pura de NoteFlow Cloud (DEK/KEK/recovery, AES-GCM, path_key)
│   ├── cloudKeys.ts     # Sesión de claves E2EE en main (setup/unlock/lock, DEK solo en memoria,
│   │                    #   cache safeStorage) + helper supabaseRest — ver monetization.md § 4
│   ├── cloudSync.ts     # Motor de sync de NoteFlow Cloud (push/pull/tombstones vía PostgREST)
│   ├── cloudSyncLogic.ts# Lógica pura del motor (mapeo fila↔fichero, conflictos, cursor) — testeada
│   ├── entitlements.ts  # computeEntitlements(rows) pura ({ai,cloud} desde subscriptions)
│   └── ai/              # Índice semántico local + LLM ("El Cerebro" Fases 1-3)
│       ├── protocol.ts  #   Tipos de mensajes worker↔main + constantes (modelo, schema)
│       ├── aiIndex.ts   #   Lifecycle del worker en el main (fork/respawn, debounce, API)
│       ├── aiWorker.ts  #   utilityProcess: embeddings (Transformers.js) + SQLite index
│       └── llm/         #   Proveedor LLM (Fase 3, corre en main; key NUNCA va al renderer)
│           ├── presets.ts          #     Catálogo de proveedores (anthropic | openai-compatible)
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
│   │   ├── themeStore.ts             # Tema/fuente/acento/colores editor — SINCRONIZADO en ui-settings.json (IPC sendSync); escala de UI en localStorage (por dispositivo)
│   │   ├── languageStore.ts          # Idioma UI (i18n) — settings.json vía IPC; dict de src/i18n; cambio en caliente vía broadcast
│   │   ├── editorSettingsStore.ts    # Fuente/tamaño/ancho legible/índice (TOC) del editor — SINCRONIZADO en ui-settings.json (IPC)
│   │   ├── sectionTagColorsStore.ts  # Color por nombre de sección — section-colors.json
│   │   ├── aiStore.ts                # Estado del índice IA (enabled, related, grafo, progreso) vía IPC ai:*
│   │   └── aiChatStore.ts            # Estado del chat/LLM (config por proveedor, modelos, mensajes, sesiones) vía IPC ai:llm-*/ai:chat*/ai:chats-*
│   ├── components/
│   │   ├── Editor/
│   │   │   ├── Editor.tsx               # Instancia TipTap (conversión md↔html en lib/markdownHtml.ts)
│   │   │   ├── NoteEditor.tsx           # Wrapper con tabs de secciones, atajos de fuente
│   │   │   ├── SectionNameField.tsx     # Nombre editable de la franja del click derecho en un tab
│   │   │   ├── EditorToolbar.tsx        # Toolbar de formato
│   │   │   ├── EditorToc.tsx            # Índice flotante H1–H3 (+ useEditorToc.ts: lectura del doc)
│   │   │   ├── DeadlineTaskItem.ts      # Extensión TipTap: task item con deadline+alarma
│   │   │   ├── DeadlineTaskItemView.tsx # NodeView React para DeadlineTaskItem
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
│   │   │   ├── SearchHighlightExtension.ts # Resaltado de matches de búsqueda in-note
│   │   │   ├── InNoteSearchBar.tsx      # Barra búsqueda dentro de la nota (modo WYSIWYG)
│   │   │   └── RawNoteSearchBar.tsx     # Barra búsqueda dentro de la nota (modo raw)
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx              # Lista de notas, filtros, búsqueda, grupos/carpetas
│   │   │   ├── NoteGroupHeader.tsx      # Cabecera de grupo (nombre→group overview; resto→colapsar)
│   │   │   ├── NoteFolderHeader.tsx     # Cabecera colapsable de carpeta (dentro de grupo)
│   │   │   ├── SectionTabsRow.tsx       # Fila de tags de secciones en la tarjeta de nota
│   │   │   └── useSidebarGroups.ts      # Hook: agrupa/ordena notas por grupo→carpeta
│   │   ├── OverviewNoteCard.tsx         # Tarjeta de nota compartida (group + all-content) + formatCardDate
│   │   ├── GroupOverview/
│   │   │   └── GroupOverview.tsx        # Vista de grupo (sustituye editor): bandas por carpeta
│   │   │                                #   + "No folder" + "Archived"; reutiliza useSidebarGroups
│   │   ├── NoteOverview/
│   │   │   └── NoteOverview.tsx         # Vista de nota (sustituye editor): una tarjeta por sección,
│   │   │                                #   mini-mock del editor (envuelve SectionPreviewCard)
│   │   ├── AllContentOverview/
│   │   │   └── AllContentOverview.tsx   # Vista "All content" (sustituye editor): índice global —
│   │   │                                #   Favorites + tiles de grupo + notas sueltas; back inteligente
│   │   ├── SectionPreview/              # Previsualización de sección reutilizable
│   │   │   ├── SectionPreviewCard.tsx   #   Tarjeta mini-mock pura (la usan NoteOverview, hover y cerebro)
│   │   │   ├── HoverPreviewProvider.tsx #   Provider + popover flotante de hover (sidebar/grupos/editor/IA);
│   │   │   │                            #     1 popover central, cierra con cualquier click (pointerdown global)
│   │   │   └── hoverPreviewContext.ts   #   Contexto + hook useSectionHoverPreview (archivo aparte: fast-refresh)
│   │   ├── AiPanel/                     # Panel de IA (Fase 3) — mitad izq. de la vista cerebro
│   │   │   ├── AiPanel.tsx              #   Contenedor con pestañas Chat / Related / Profile / ⚙ Settings
│   │   │   ├── ChatView.tsx             #   Chat streaming + selector de modelo + historial + citas
│   │   │   ├── RelatedView.tsx          #   "Related notes" por sección (movido aquí del cerebro)
│   │   │   ├── LlmConfigView.tsx        #   Fuente del asistente: selector NoteFlow AI | proveedor propio/IA local (+ baseUrl, key, modelo, test)
│   │   │   ├── ProfileFlow.tsx          #   Cuestionario por secciones (chips/tags/text/choice + archivos + enlaces) → genera nota de perfil
│   │   │   └── profileQuestions.ts      #   Esquema data-driven (PROFILE_SECTIONS: Professional/Personal/Your style/AI; proxy + binarias Big Five) + PROFILE_FIELDS + detectLocale()
│   │   ├── Brain/                       # Vista cerebro ("El Cerebro" Fase 2 — grafo de notas)
│   │   │   ├── BrainView.tsx            #   Split AiPanel | canvas (Fase 3); divisor redimensionable;
│   │   │   │                            #     ELIGE el render: 3D si hay WebGL, si no fallback 2D
│   │   │   ├── BrainScene.tsx           #   *** RENDER POR DEFECTO *** — cerebro 3D inmersivo
│   │   │   │                            #     (three.js: wireframe + bloom + orbit/zoom + impulsos)
│   │   │   ├── brainMesh.ts             #   Malla 3D procedural del cerebro (icosphere deformada +
│   │   │   │                            #     relleno interior + cerebelo + tronco; edges/BFS path)
│   │   │   ├── assignVertices.ts        #   Asigna cada nodo del grafo a un vértice de la malla 3D
│   │   │   ├── tunerState.ts            #   Params de forma/look del 3D (DEFAULT_LOOK, persistencia)
│   │   │   ├── BrainTuner.tsx           #   Panel dev de escultura de la forma 3D (SHOW_TUNER=false)
│   │   │   ├── BrainCanvas.tsx          #   FALLBACK 2D (sin WebGL): <canvas> + d3-force, pan/zoom/drag
│   │   │   ├── useBrainGraph.ts         #   Modelo compartido: nodos (grupo/carpeta/nota/sección) + 2 capas de aristas
│   │   │   ├── useForceLayout.ts        #   Simulación d3-force del fallback 2D (estructura + contenido)
│   │   │   ├── brainColors.ts           #   Resuelve color de nodo → RGB: CSS var del tema o hex libre
│   │   │   │                            #   (readColor; lo usan 2D y 3D)
│   │   │   └── BrainNodePreview.tsx     #   Ventanita clicable al pulsar un nodo nota/sección (click→navega)
│   │   ├── NoteCard/                    # Tarjeta de nota en sidebar
│   │   ├── TitleBar.tsx                 # Barra de título personalizada (frameless);
│   │   │                                #   el ⚙ abre la ventana de Ajustes (SettingsModal)
│   │   ├── SyncStatusButton.tsx         # Botón ☁ de la titlebar + tarjeta de estado al hover
│   │   ├── Settings/                    # Ventana de Ajustes unificada (overlay split nav+contenido)
│   │   │   ├── SettingsModal.tsx        #   Contenedor: nav izquierda + panel derecho según sección
│   │   │   ├── AppearancePanel.tsx      #   Tema/fuente/acento/colores del editor/escala + preview
│   │   │   ├── EditorPanel.tsx          #   Font size / fuente / ancho
│   │   │   ├── TemplatesPanel.tsx       #   Plantillas de nota (listar/usar/renombrar/borrar)
│   │   │   ├── StartupPanel.tsx         #   Autostart + stickies al arrancar
│   │   │   ├── SyncPanel.tsx            #   Selector de backend (Cloud/GitHub, excluyentes) + sección GitHub
│   │   │   ├── CloudPanel.tsx           #   NoteFlow Cloud (cifrado, suscripción) — ver monetization.md
│   │   │   ├── AccountPanel.tsx         #   Cuenta NoteFlow (OTP, entitlements) — ver monetization.md
│   │   │   ├── AiPanel.tsx              #   Toggle "Local AI" + reindex + skill del CLI para agentes
│   │   │   ├── DataPanel.tsx            #   Export/Import (lanza ExportImportModal) + dir de notas
│   │   │   ├── ShortcutsPanel.tsx       #   Lista de atajos (fuente de verdad de los atajos)
│   │   │   └── AboutPanel.tsx           #   Versión (app:get-version) + check/instalar updates + repo
│   │   ├── CommandPalette/             # Paleta de comandos
│   │   ├── ConfirmModal.tsx            # Modal de confirmación genérico
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
│   │   ├── tocUtils.ts           # Lógica pura del índice flotante del editor (entradas, activo) — testeado
│   │   ├── keyedQueue.ts         # Cola serial por clave (escrituras de una nota en orden) — testeada
│   │   ├── syncStatus.ts         # Estado mostrado por el botón de sync (prioridades) + edad relativa — testeado
│   │   ├── encryptedSession.ts   # Re-descifrado con la contraseña de sesión tras recargar + guarda
│   │   │                         #   anti-borrado de escrituras de notas cifradas — testeado
│   │   ├── sectionUtils.ts       # Operaciones puras sobre la lista de secciones (patch/move/duplicate/restore)
│   │   ├── searchUtils.ts        # Helpers de búsqueda (normalización, matching)
│   │   ├── keyScope.ts           # OWN_KEYS_PROPS/ownsKeys: campos que los atajos globales (capture) respetan
│   │   ├── tagColors.ts          # getTagColor — color por nombre de tag (8 vars del tema o hex libre);
│   │   │                         #   normalizeGroupColor (validación) y colorChannels (TODO render de
│   │   │                         #   color de grupo/sección debe pasar por él, no interpolar `var(...)`)
│   │   ├── markdownHtml.ts       # Conversión markdown↔HTML (htmlFromMarkdown/htmlToMarkdown);
│   │   │                         #   usado por el editor TipTap, SectionPreviewCard (previews) y el chat IA — testeado
│   │   ├── markdownInline.ts     # Hoja compartida: inlineToHtml, escapeHtml, anotaciones de tarea 📅⏰🔺
│   │   ├── kanban.ts             # Tableros kanban en la nota: modelo + md↔datos↔HTML (ver patterns.md) — testeado
│   │   ├── kanbanOps.ts          #   transformaciones puras del tablero (columnas, tarjetas, columna done,
│   │   │                         #   conversión con listas de tareas) — testeado
│   │   ├── kanbanSearch.ts       #   búsqueda en nota dentro de tableros (conteo + resaltado) — testeado
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
├── PKGBUILD               # Build manual/AUR del paquete Arch (electron del sistema, NOTEFLOW_NATIVE)
└── .github/workflows/
    ├── release.yml        # CI/CD: build matrix (win+linux+mac) + release al pushear un tag
    └── pages.yml          # Build Astro de docs/ + deploy a GitHub Pages (push a main que toque docs/**)
```

## Arquitectura IPC (Electron)

El renderer NO tiene acceso a Node.js. Toda operación de sistema pasa por IPC:

```
Renderer (React)
  └─ window.noteflow.*         ← expuesto por preload.ts
       └─ ipcRenderer.invoke()/send()/sendSync()
            └─ ipcMain.handle()/on()  ← definido en main.ts
```

### Handlers IPC (fuente de verdad: `electron/main.ts` + `electron/preload.ts`)

| Canal | Tipo | Descripción |
|---|---|---|
| `fs:read-all-notes` | handle | Lee TODAS las carpetas de nota en una llamada → `NoteDirRecord[]` (`{dir,path,noteMd,sections:[{file,content}]}`; batch, con reintentos) |
| `fs:read-note-dir` | handle | Lee UNA carpeta de nota → `NoteDirRecord \| null` (usado por syncNote) |
| `fs:write-note` | handle | Escritura multi-archivo de una carpeta: `{dir, files, deleteFiles}` (note.md primero) + 1 broadcast + schedulePush por archivo + scheduleIndex |
| `fs:delete-note` | handle | Borra la carpeta entera (rmSync recursivo) + broadcast + scheduleDeleteDir en GitHub |
| `fs:notes-dir` | handle | Devuelve ruta del dir de notas |
| `app:open-notes-folder` | handle | Abre la carpeta en el explorador |
| `app:choose-notes-dir` | handle | Diálogo para elegir carpeta |
| `app:get-login-item` / `app:set-login-item` | handle | Autostart al login (gestiona `.desktop` propio en Linux) |
| `app:get-version` | handle | Versión actual de la app (`app.getVersion()`) — la usa el panel About |
| `app:check-update` | handle | Consulta la última release en la API de GitHub |
| `app:download-and-install` | handle | Descarga el instalador (allowlist de hosts) e instala; emite progreso |
| `app:open-url` | handle | Abre URL externa (solo https, validada) |
| `settings:get-theme` / `settings:set-theme` | on (sync/async) | Tema en settings.json (sendSync para leer) — hoy es dual-write legacy: la fuente sincronizada del tema es `ui-settings.json` |
| `ui-settings:get` / `ui-settings:set` | on (sync) / handle | Apariencia + ajustes del editor SINCRONIZADOS → `ui-settings.json` (dir de notas). `get` es sendSync (initTheme lo necesita antes del primer paint); `set` recibe un patch PARCIAL que main mergea sobre el fichero (saneador puro en `electron/uiSettings.ts`, con tests), hace broadcast `notes-updated` y `schedulePush`. La escala de UI y el idioma quedan fuera (por dispositivo) |
| `settings:get-language` / `settings:set-language` | on (sync/async) | Idioma UI (`'system'\|'en'\|'es'`) en settings.json; el setter persiste, refresca el tray y hace broadcast `language-changed` a todas las ventanas (cambio en caliente) |
| `settings:get-ui-state` / `settings:set-ui-state` | handle | Estado UI (nota/sección activa, grupos y carpetas colapsados) |
| `settings:get-startup-stickies` / `settings:set-startup-stickies` | handle | Stickies que se abren al arrancar |
| `groups:get` / `groups:set` | handle | Grupos → `groups.json` (en dir de notas, se sincroniza) |
| `folders:get` / `folders:set` | handle | Carpetas → `folders.json` (en dir de notas, se sincroniza) |
| `section-colors:get` / `section-colors:set` | handle | Color por sección → `section-colors.json` (saneado, se sincroniza) |
| `note-order:get` / `note-order:set` | handle | Orden manual de notas → `note-order.json` (en dir de notas, se sincroniza) |
| `templates:get` / `templates:set` | handle | Plantillas de nota → `templates.json` (en dir de notas, se sincroniza) |
| `notes:export` | handle | Exporta a `.noteflow`/`.json`/`.md`/`.txt` (diálogo de guardado) |
| `notes:parse-import-file` | handle | Abre y parsea un archivo de importación (incluye `.md`/`.txt`) |
| `notes:parse-external-import` | handle | Importa de otras apps (`'md-folder'\|'notion'\|'keep'`): solo IO en main, devuelve `ExternalNote[]` normalizado; la conversión html→md y grupos son del renderer (detalle en `patterns.md` → Importación) |
| `notes:write-imported` | handle | Escribe las notas importadas (filenames saneados) |
| `alarms:schedule` | on | Registra el set de alarmas en el motor del main; dispara las vencidas |
| `window:minimize` / `maximize` / `close` | on | Controles de ventana (frameless). Actúan sobre la ventana EMISORA; `close` oculta la principal (tray) y destruye cualquier otra (sticky, ventana de sección) |
| `window:get-id` | on (sync) | webContents id de la ventana (para filtrar broadcasts) |
| `window:open-sticky` | on | Abre ventana sticky flotante |
| `window:open-section-window` | on | `(noteId, sectionId)` → abre una ventana solo-editor (`#section-window?…`, `SectionWindowApp`); si una ventana de sección ya muestra esa nota+sección, la enfoca |
| `window:section-window-target` | on | La ventana de sección informa de la nota+sección que muestra (para el "enfocar si ya existe" del canal anterior y la recarga tras crash) |
| `window:set-size` | on | Redimensiona la ventana (usado por sticky) |
| `window:fold-to-corner` / `window:unfold` | on | Anima el plegado/desplegado de stickies |
| `sync:get-status` | handle | Estado del sync **GitHub** (`enabled`, `connected`, owner, repo, lastSync, error, `initialPullStatus`) |
| `sync:get-active-status` | handle | Estado NORMALIZADO del proveedor **activo** para el botón de la titlebar y su tarjeta de estado: `{backend: 'github'\|'cloud'\|'none', active, lastSync, error, initialPullStatus, pendingUploads, autoSyncIntervalMs?, github?: {owner, repo}, cloud?: {keysState, keysMode, realtimeConnected}}` (espeja `getActiveSyncProvider()` — ver `syncProvider.ts`/`sync.md`) |
| `sync:initiate` | handle | Inicia Device Flow OAuth (recibe `repo`); al completar → `sync-auth-complete` + autosync |
| `sync:cancel-auth` | handle | Cancela un Device Flow en curso |
| `sync:disconnect` | handle | Desconecta GitHub, para autosync, limpia settings |
| `sync:pull` | handle | Pull manual desde el remoto **GitHub** (lo usa Settings → Sync) |
| `sync:pull-active` | handle | Pull manual enrutado al backend **activo** (Cloud si `enabled`, GitHub si no) — lo usa el botón de la titlebar |
| `sync:mirror-to-github` | handle | **Espejo local → repo**: deja GitHub como copia exacta del disco (sube lo que difiere, borra lo que ya no existe). **Solo con Cloud habilitado** (gate en `main.ts`; si no → `{ok:false, error:'cloud-required'}`). No cambia nada local — ver `sync.md` |
| `account:get-status` | handle | Estado público de la cuenta NoteFlow (`{configured, signedIn, email, entitlements: {ai, cloud}, entitlementsFetchedAt, aiCheckoutConfigured, cloudCheckoutConfigured}`) — **nunca** tokens |
| `account:request-otp` | handle | Envía el código OTP de 6 dígitos por email (Supabase GoTrue, `create_user: true`) |
| `account:verify-otp` | handle | Verifica `(email, code)` → guarda sesión (refresh token cifrado en `settings.account`) + primer fetch de entitlements |
| `account:sign-out` | handle | Logout best-effort en el servidor + limpia la sección `account` y el estado. La app vuelve a su estado gratuito: Cloud `enabled=false`, **sesión de claves borrada** (DEK + cache + `keysMode`/`remoteKeysKnown`), IA gestionada → proveedor BYO/local, y se guarda `accountRestore` (ver `monetization.md` § 4 "Cerrar sesión") |
| `account:refresh-entitlements` | handle | Relee `subscriptions` vía PostgREST/RLS y re-deriva `{ai, cloud}` |
| `account:open-checkout` | handle | Abre el checkout de Lemon Squeezy en el navegador con `checkout[custom][user_id]` (URL construida en main — el userId no cruza al renderer) |
| `cloud:get-status` | handle | Estado público de NoteFlow Cloud (`{configured, enabled, signedIn, keysState: 'unlocked'\|'locked'\|'no-keys', keysMode: 'managed'\|'e2ee'\|null, lastSync, error, initialPullStatus, realtimeConnected}`) — **nunca** material de claves |
| `cloud:setup` | handle | Passphrase → genera DEK + recovery code, sube `user_keys` y desbloquea; **devuelve el recovery code UNA vez** (no se persiste) — setup en modo e2ee (privado) |
| `cloud:setup-managed` | handle | Setup en modo managed (estándar, el default): genera la DEK y la deposita en la Edge Function `cloud-keys`, que la envuelve con la KEK del operador — sin passphrase ni recovery |
| `cloud:unlock` | handle | Desbloquea la sesión de claves e2ee con passphrase o recovery code (DEK solo en memoria del main + cache safeStorage) |
| `cloud:auto-unlock` | handle | Dispara el unlock silencioso managed (`autoUnlockManaged`, single-flight, nunca lanza) — lo pollea el panel mientras esté `locked`+managed |
| `cloud:upgrade-e2ee` | handle | Upgrade managed → e2ee: re-envuelve la DEK vigente con passphrase + recovery nuevos y anula `dek_managed_ct`; **devuelve el recovery code UNA vez** |
| `cloud:downgrade-managed` | handle | Downgrade e2ee → managed: envía la DEK vigente (requiere `unlocked`) a `cloud-keys/downgrade`, que la envuelve con la KEK del operador y anula las columnas passphrase/recovery (dejan de funcionar). Confirmado y avisado en la UI (ver `monetization.md` § 4) |
| `cloud:lock` | handle | Descarta la DEK en memoria y su cache cifrada |
| `cloud:enable` / `cloud:disable` | handle | Activa/desactiva el motor Cloud (activarlo toma prioridad sobre GitHub Sync — mutuamente excluyentes — y lanza pull inicial + polling); desactivar conserva journal y marcas |
| `cloud:pull` | handle | Pull manual incremental desde la nube (mismo contrato de broadcast que `sync:pull`) |
| `ai:get-settings` / `ai:set-settings` | handle | Lee/escribe `settings.ai` (enabled, modelId); `set` aplica al worker y emite estado |
| `ai:related` | handle | Notas relacionadas con la **sección activa** (centroides + coseno) |
| `ai:search` | handle | Búsqueda semántica híbrida (vector + FTS5, RRF). La usa el RAG del chat (Fase 3) |
| `ai:graph` | handle | Aristas de contenido nota-a-nota (centroides por nota + coseno) para la vista cerebro (Fase 2) |
| `ai:reindex-all` | handle | Reindexa TODAS las secciones en background (lotes de 16) con progreso |
| `ai:get-stale` | handle | `{stale, count}`: si el índice va por detrás de las notas (main lleva la cuenta, persistida). Se emite además por el evento `ai:index-stale` — detalle en `ai.md` |
| `ai:llm-get-config` / `ai:llm-set-config` | handle | Lee/escribe `settings.aiLlm` (config del LLM por proveedor). `get` saneado (sin key); `set` aplica al **preset activo** (clave/modelo/baseUrl por proveedor) y cifra la key con `safeStorage` |
| `ai:llm-presets` | handle | Catálogo de presets de proveedor (`electron/ai/llm/presets.ts`) |
| `ai:llm-list-models` / `ai:llm-test` | handle | Lista modelos del proveedor activo / valida conexión+credenciales |
| `ai:chat` | handle | Chat **agéntico** con streaming: contexto RAG + bucle de tool-calling, emite por eventos, admite `attachmentIds[]` (detalle en `ai.md` → Chat agéntico) |
| `ai:chat-pick-files` / `ai:chat-remove-file` | handle | Adjuntos del chat a la caché `chatFiles` del main (persisten para preguntas de seguimiento); devuelve solo metadatos — los bytes NUNCA cruzan al renderer |
| `ai:chat-cancel` | on | Aborta un `ai:chat` en vuelo por `requestId` (AbortController); también resuelve confirmaciones pendientes |
| `ai:chat-confirm` | on | Resuelve la confirmación de una tool destructiva por `toolCallId` (`{toolCallId, approved}`) |
| `ai:chats-load` / `ai:chats-save` | handle | Historial de chats en `userData/ai-chats.json` (local, NO se sincroniza) |
| `ai:profile-pick-files` / `ai:profile-remove-file` | handle | Segundo cerebro: file picker capado por capacidades del proveedor a una caché en main (solo metadatos al renderer) |
| `ai:profile-generate` | handle | Segundo cerebro: `{fields[], fileIds[], urls[], locale?}` → prompt + adjuntos nativos → LLM → `{title, sections[]}` (detalle en `ai.md` → Segundo cerebro) |
| `ai:profile-get-status` / `ai:profile-set-completed` | handle | `settings.aiProfile` = `{completedAt, noteId?}` (cuestionario mostrado una vez + id de la nota de perfil generada, para enlazar/regenerar sin duplicar). `set-completed(noteId?)`: sin `noteId` = "Not now" (saltado) |

**Eventos main → renderer** (suscripción vía `window.noteflow.on*`):
`new-note`, `notes-updated` (filePath?, senderId?), `update:download-progress` (percent),
`update:installing` (fase de instalación, post-descarga),
`sync-auth-complete`, `sync:push-state` (`'pushing'|'idle'`), `sync:status-changed`,
`account:status-changed` (broadcast del status público de la cuenta a todas las ventanas),
`cloud:status-changed` (broadcast del status público de NoteFlow Cloud — mismo shape que `cloud:get-status`),
`ai:reindex-progress` (`{done,total}`), `ai:index-state` (estado del índice),
`ai:index-stale` (`{stale,count}` — índice por detrás de las notas; OJO: no es lo mismo que `ai:index-state`),
`ai:chat-delta` (`{requestId,delta}`), `ai:chat-sources` (`{requestId,sources}`),
`ai:chat-done` (`{requestId,aborted?}`), `ai:chat-error` (`{requestId,error}`),
`ai:chat-tool-call` (`{requestId,toolCallId,name,input,label}` — `label` es la frase en presente
"qué está haciendo" con el objetivo resuelto a título por `agentTools.describeAction`, mostrada en la
fila de actividad mientras la tool corre), `ai:chat-tool-result`
(`{requestId,toolCallId,status,summary}`), `ai:chat-confirm-request`
(`{requestId,toolCallId,name,input}` — tool destructiva esperando confirmación).

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
- `folders.json` — definición de carpetas (subcarpetas de grupos).
- `section-colors.json` — mapa `nombreSección(normalizado) → color`: una CSS var del tema (`--accent`…)
  **o** un hex libre `#rrggbb` (ver "Color de grupos y secciones" en `patterns.md`). No reintroducir un
  validador var-only en `sanitizeSectionColors`: borraría los colores personalizados del usuario al guardar.
- `note-order.json` — orden manual de notas por contexto (`Record<contextKey, string[]>`); contextKey: `'ungrouped'`, `'group:<id>'`, `'folder:<id>'`, `'favorites'`. Gestionado desde `groupsStore` (`noteOrder`, `setContextNoteOrder`).
- `templates.json` — array de plantillas de nota (`NoteTemplate[]`: `{id,name,title,sections,createdAt}`). Gestionado desde `templatesStore`. Crear nota desde plantilla regenera ids de sección y usa `createPopulatedNote`; "Save as template" en el menú ⋯ del editor captura título + secciones (oculto si la nota está cifrada y bloqueada). UI en Settings → Templates.
- `ui-settings.json` — apariencia (tema, fuente de app, acento, colores del editor) + ajustes del
  editor (tamaño/familia de fuente, ancho legible, índice flotante `showToc`) sincronizados entre dispositivos. Formato y
  saneado/merge en `electron/uiSettings.ts` (módulo puro, tests en `tests/electron/uiSettings.test.ts`).
  **Espejo en noteflow-mobile** (`src/core/uiSettings.ts`): su saneador también descarta claves
  desconocidas y el móvil re-sanea el fichero antes de cada escritura (`appearanceStore`), así que un
  campo nuevo que no se porte allí se borra en cuanto el móvil guarda su apariencia (p. ej. un cambio de
  acento). Todo campo nuevo del esquema hay que añadirlo en los dos.
  Claves de override tri-estado: AUSENTE = nunca escrita (los stores caen a las fuentes legacy
  locales y hacen seed una vez), `null` = override borrado explícitamente ("sigue al tema"),
  string = valor. Los stores (`themeStore`, `editorSettingsStore`) siguen dual-escribiendo las
  fuentes legacy (settings.json / localStorage) por compatibilidad con downgrade. NO se
  sincronizan: escala de UI (`noteflow-ui-scale`, localStorage) ni idioma (por dispositivo).

> El dir es configurable desde Settings → "Choose notes directory".

**Ajustes locales (NO se sincronizan)** en `settings.json` (nota: `theme` sigue aquí como
dual-write legacy — la fuente sincronizada es `ui-settings.json` del dir de notas):
- **Windows:** `%APPDATA%\noteflow\settings.json`
- **Linux:** `~/.config/noteflow/settings.json`
- **macOS:** `~/Library/Application Support/NoteFlow/settings.json`
- (vía `app.getPath('userData')`)

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
    "collapsedFolderIds": ["fld001"]
  },
  "startupStickies": [
    { "noteId": "xyz", "sectionId": "sec001" }
  ],
  "githubSync": {
    "enabled": true,
    "encryptedToken": "<cifrado con safeStorage o base64 fallback>",
    "owner": "username",
    "repo": "noteflow-notes",
    "lastSync": "2026-03-25T10:00:00.000Z"
  },
  "account": {
    "email": "user@example.com",
    "userId": "<uuid de auth.users>",
    "encryptedRefreshToken": "<cifrado con safeStorage o base64 fallback>"
  },
  "cloudSync": {
    "enabled": true,
    "lastSync": "2026-07-10T12:00:00.000Z",
    "pullCursor": "2026-07-10T11:58:03.214Z",
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
  "aiProfile": { "completedAt": "2026-06-14T10:00:00.000Z", "noteId": "abc12345" }
}
```

> **Importante:** grupos/carpetas/colores de sección NO están en `settings.json` — están en
> archivos JSON dentro del dir de notas para poder sincronizarse entre dispositivos. El **historial
> de chats** vive en `userData/ai-chats.json` (local, no se sincroniza); las **API keys del LLM** se
> cifran por proveedor en `settings.aiLlm.byPreset[*].encryptedApiKey` (nunca cruzan al renderer).
> Los **journals de sync** viven en `userData/sync-state.json` (GitHub) y
> `userData/cloud-sync-state.json` (NoteFlow Cloud) — estado LOCAL del dispositivo, nunca en el dir
> de notas. `accountRestore` recuerda, **sin secretos** (email + dos booleanos), qué features de
> pago tenía activas la sesión que cerró, para volver a activarlas si vuelve a entrar la MISMA
> cuenta con la entitlement viva (ver `monetization.md` § 4 "Cerrar sesión").
