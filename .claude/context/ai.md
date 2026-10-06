# NoteFlow — "El Cerebro" (índice semántico, vista cerebro, LLM/chat, segundo cerebro)

### Índice semántico local — "El Cerebro" Fases 1-2 (`electron/ai/`, `src/components/Brain/`)
Subsistema de IA **100% local/offline** que indexa cada **sección** de cada nota como un
**embedding** (vector). El índice es un **artefacto derivado y reconstruible** desde los `.md` (si
se borra, se regenera). Plan maestro "El Cerebro": Fase 1 (índice + panel "Related notes", hecha)
→ **Fase 2 (vista cerebro/grafo, hecha)** → **Fase 3 (panel IA: chat RAG + segundo cerebro, hecha;
falta verificar en app real)** → **Fase 4 (nube/monetización — ver
`.claude/context/monetization.md`)**. **Principio: un índice, tres
consumidores** (related ✅, grafo ✅, chat ✅).

- **3 procesos:** renderer (`aiStore` + `AiPanel/RelatedView`) → main (`aiIndex`, lifecycle +
  debounce + progreso) → **`utilityProcess`** (`aiWorker`, no bloquea el main).
- **Worker (`aiWorker.ts`):** embeddings con **Transformers.js** (`@huggingface/transformers`,
  runtime `onnxruntime-node` nativo, cuantización q8→fp32 fallback) + índice **SQLite**
  (`better-sqlite3`) con vectores (`sqlite-vec`, tabla `vec0`) y texto (`FTS5`). **Las notas
  cifradas se omiten** (no entra texto plano al índice).
- **Secciones ocultas a la IA (`NoteSection.aiHidden`):** flag por sección (frontmatter, como
  `isRawMode`; persistido por los tres espejos de formato — `noteUtils.ts`, `noteFormat.ts`,
  `cli/noteflow.js`). Cuando `aiHidden: true` la sección queda **fuera de TODAS las superficies de
  IA**: no se indexa (`aiWorker` la filtra en `reindexNote`/`reindexAll`; al ocultar una ya indexada
  el cleanup de `reindexNote` la borra del índice), no entra al RAG del chat (`buildChatContext` en
  `main.ts` filtra `aiHidden` — defensa en profundidad ante el fallback de vecinos) y las tools no la
  exponen (`get_note`/`list_notes` en `llm/tools.ts` la omiten). Como el modelo no ve su `section_id`,
  tampoco puede editarla. UI: toggle "Hide from AI"/"Show to AI" en (1) el menú ⋯ del editor (sección
  activa) y (2) el `NoteContextMenu` compartido (click derecho sobre un tag de sección en el sidebar,
  en la group overview y sobre las tarjetas de la note overview). Indicador `EyeOff` en la pestaña del
  editor, en los tags del sidebar y como badge en las tarjetas de la note overview.
- **DB:** `userData/ai-index/index.db` (en dev `userData` = `.electron-dev/`). **Fuera del dir de
  notas** → NO se sincroniza a GitHub. Tablas: `notes`, `chunks`, `vec_chunks` (vec0),
  `fts_chunks` (FTS5), `meta` (modelId/dim/schemaVersion). Dimensión **dinámica** (detectada del
  modelo); cambiar `settings.ai.modelId` o el schema dispara **reindex automático**.
- **Modelo por defecto:** `Xenova/paraphrase-multilingual-mpnet-base-v2` (768-d), elegido por
  benchmark sobre las notas reales (ES+EN+código). Se descarga en el primer uso a
  `userData/ai-models`. Alternativa rápida: `paraphrase-multilingual-MiniLM-L12-v2` (384-d).
- **Indexado incremental:** enganchado a `fs:write-note` (`aiIndex.scheduleIndex(dirPath)`,
  debounce 2.5s, una vez por nota) y `fs:delete-note` (`removeFromIndex(dirPath)`). El worker
  **lee la carpeta de la nota desde disco** (`noteFormat.parseNoteDir`); `notes.file_path` en la
  DB guarda el path del DIRECTORIO. Hash por sección para no re-embeber lo que no cambió.
  `stripNoise` quita imágenes base64 y trunca a ~2000 chars antes de embeber (crítico: 157s→6.7s).
  Las notas que llegan por **pull** (GitHub/Cloud) también pasan por `scheduleIndex` vía
  `indexPulledNotes` en `main.ts`.
- **Índice desactualizado (punto ámbar del botón "Reindex" en la vista cerebro):** la verdad vive en
  **main** — `aiIndex` + `electron/ai/indexStaleness.ts` (lógica pura, con tests). Un dir de nota
  entra en pendientes al escribirse (`scheduleIndex`, **antes** del debounce) y solo sale cuando el
  worker confirma: `index-note`/`remove-note` OK, o `reindex-all` (corte por timestamp — lo editado
  *durante* el rebuild sigue pendiente). Se persiste en `userData/ai-index/pending.json` porque
  `scheduleIndex` **descarta** el trabajo con el worker dormido (idle-stop 90s) y esas ediciones
  quedan sin indexar también entre sesiones. Los cambios no atribuibles a un dir (borrados/metadata
  de un pull, reactivar la IA sin reindex) usan el flag `unknownAt`, que solo limpia un reindex
  completo. Main lo publica por `ai:index-stale` (+ `ai:get-stale` al montar) y `aiStore` solo lo
  refleja. **Nunca derivarlo de `ai:index-state === 'idle'`:** el worker emite `idle` también al
  arrancar, al descargar el modelo por inactividad y en el `catch` de errores — por eso la marca
  antes casi nunca se veía.
- **related (por sección activa):** centroides por sección → **centrado por la media global**
  (corrige anisotropía) → coseno → de otras notas la mejor por nota, hermanas de la misma nota
  individuales → umbral + top-k. **search:** híbrido vector+FTS5 con fusión RRF (para Fase 3).
- **graph (Fase 2, `ai:graph` → `SqliteIndex.contentEdges`):** **centroide por nota** del
  `chunkCache` → centrado por media global + normalización → coseno todas-las-parejas → umbral
  (`0.05`) + poda top-`maxPerNote` (mutual top-k) → `GraphEdge[]` nota-a-nota. Es la **capa de
  contenido** del grafo; la **estructura** (grupo→carpeta→nota) la arma el renderer con
  `useSidebarGroups`. Consumido por `aiStore.fetchGraphEdges` → `useBrainGraph`.
- **Vista cerebro (`src/components/Brain/`):** modo full-screen conmutable (botón "Cerebro" en el
  TitleBar → `notesStore.brainViewOpen`, espejo de `groupViewId`; sustituye el editor en `App.tsx`,
  `setActiveNote` lo cierra). **`BrainView` elige el render según WebGL** (`detectWebGL()`):
  - **`BrainScene.tsx` (3D, POR DEFECTO — Fase 2.5):** cerebro inmersivo con **three.js**
    (`WebGLRenderer` + `EffectComposer`/`UnrealBloomPass` + `OrbitControls`). La forma es una malla
    procedural (`brainMesh.ts`: icosphere deformada + relleno interior + cerebelo + tronco); cada
    nodo del grafo se fija a un vértice (`assignVertices.ts`). Capas: wireframe tenue (vértices=dots,
    aristas), estructura grupo→carpeta→nota y dendritas nota→sección (líneas), sinapsis de contenido
    nota↔nota (ruteadas por la malla), nodos (dot + anillo de color) y labels HTML proyectados. Look
    en `tunerState.ts` (`DEFAULT_LOOK`: bloom, `wireOpacity`, `dotOpacity`, fog…). Impulsos eléctricos:
    pulso único en hover (nodo→relacionada) + chispas ambientales aleatorias por el wireframe.
    `BrainTuner.tsx` es un panel dev de escultura (`SHOW_TUNER=false`). Click en nota → fly-in +
    `openSection`. Forzar 2D: `localStorage 'noteflow:brain-force-2d'`. En equipos de pocos recursos
    el cerebro arranca por defecto en 2D y muestra un popup una-vez ofreciendo cambiar a 3D; la
    elección explícita del usuario (o el legacy force-2D) se marca con `localStorage
    'noteflow:brain-3d-chosen'` y ya no vuelve a nudgear.
    La detección de gama baja (`isLowEndDevice` en `brainSettingsStore.ts`) usa **hardware real** del
    proceso Electron: el preload expone `window.noteflow.hardware`, leído de forma **síncrona** en
    carga del preload vía `ipcRenderer.sendSync('app:get-hardware')` (el handler en `main.ts` calcula
    `os.cpus()` + `os.totalmem()`). Debe venir del proceso principal porque el preload corre
    **sandboxed** (default de Electron 35) y ahí `node:os` no existe. La lógica pura vive en `src/lib/hardware.ts`
    (`isLowEndHardware`, testeada en `tests/lib/hardware.test.ts`) y combina **señales duras** con
    **señales débiles**: son duras (marcan gama baja por sí solas) RAM ≤ 4,5 GiB y ≤ 4 núcleos lógicos;
    son débiles el clock base < 2,0 GHz (parseado del modelo `@ x.xxGHz`; NO se usa `cpus().speed`
    porque en Linux reporta la frecuencia actual fluctuante, no el clock base) y que el modelo sea un
    chip ULV de portátil (sufijo Intel U/Y o AMD serie U). Las débiles solo cuentan dentro del **gate
    de máquina modesta** (≤ 8 núcleos lógicos **y** ≤ 8,5 GiB de RAM): así se sigue cazando el portátil
    ULV tipo i5-8250U (8 hilos, ~7,7 GiB) que la vieja heurística `navigator` (`hardwareConcurrency`/
    `deviceMemory`) no detectaba, pero **sin** marcar como gama baja a portátiles modernos que mueven
    el 3D de sobra (un Ryzen 7 7840U con 16 hilos/16 GiB, o un i7-1355U anunciado como "@ 1.70GHz" que
    turbea muy por encima). Si no hay `window.noteflow.hardware` (contexto sin bridge/tests), cae al
    fallback `navigator` anterior.
  - **`BrainCanvas.tsx` (2D, FALLBACK sin WebGL):** `<canvas>` 2D propio + `d3-force`
    (`useForceLayout.ts`) con pan/zoom/drag/hover.
  Ambos comparten el modelo (`useBrainGraph.ts`) con dos capas de aristas: estructura sólida (color de
  grupo) + contenido tenue (resaltada al seleccionar/hover, con toggle). Excluye notas
  archivadas/cifradas/temporales. Smoke headless: `scripts/ai-graph-smoke.cjs`.
- **Activación:** flag `settings.ai.enabled` (default `false`). **UI principal de activación: el
  overlay/CTA dentro de la vista cerebro** (con IA off el cerebro muestra solo estructura; activar
  desde ahí descarga el modelo + reindexa con barra de progreso). También hay toggle + "Reindex all"
  en **Settings → AI** (`Settings/AiPanel.tsx`). Arranque del worker diferido ~4s tras el boot
  (`primeSettings`).
- **Deps nativas (IMPRESCINDIBLE):** `better-sqlite3` + `onnxruntime-node` + `sqlite-vec` son
  binarios nativos. `package.json` lleva **`"postinstall": "electron-builder install-app-deps"`**
  (recompila para el ABI de Electron tras cada `npm install`) y entradas en **`build.asarUnpack`**.
  Si el worker sale con "exited before init (code 1)": `npx @electron/rebuild -f -o better-sqlite3`.
- **Deps de la Fase 2:** `three` (+ `@types/three`) para el render 3D por defecto (`BrainScene`,
  lazy-loaded → chunk propio) y `d3-force` (+ `@types/d3-force`) para el fallback 2D. Ambas JS puro,
  sin binario nativo (no tocan `asarUnpack` ni el `postinstall`).
- **Scripts (`scripts/`):** `ai-smoke.cjs` (test e2e headless related/search), `ai-graph-smoke.cjs`
  (test del grafo: clusters por contenido), `ai-inspect.cjs` (inspecciona la DB real), `ai-bench.cjs`
  (benchmark de modelos → `scripts/bench-out/REPORT.md`), `format-migration-smoke.cjs` (migración
  v1→v2 + round-trip del formato; corre con `node`, sin Electron). Los de IA se ejecutan con
  `unset ELECTRON_RUN_AS_NODE; npx electron scripts/ai-smoke.cjs`.
- **Pendiente:** probar el **build empaquetado** (`npm run dist`) en Win/Linux — validar que
  `asarUnpack` y la descarga del modelo funcionan en el instalado (NO verificado aún). Fase 2:
  **detalle progresivo** (expandir secciones como sub-nodos al seleccionar/zoom) está **diferido**
  (los labels de notas ya aparecen al hacer zoom).

### LLM / chat / segundo cerebro — Fase 3 (`electron/ai/llm/`, `src/components/AiPanel/`)
Capa de **LLM** sobre el índice, independiente del flag de embeddings. **Dos interruptores:**
(1) `settings.ai.enabled` (embeddings) habilita RAG + aristas de contenido; (2) `settings.aiLlm`
(proveedor configurado) habilita chat/generación. El chat funciona sin (1) pero **sin contexto**.

- **El LLM corre en el proceso main**, NO en el `aiWorker` (que sigue solo embeddings+SQLite). La
  API key se cifra por proveedor con `safeStorage` y **nunca llega al renderer** (solo `hasKey`).
- **Proveedores (presets, `electron/ai/llm/presets.ts`):** dos implementaciones —
  `anthropic` (SDK oficial `@anthropic-ai/sdk`, `messages.stream`) y `openai` (fetch SSE a
  `/chat/completions`). Presets: **NoteFlow AI** (gestionado, primero de la lista en `PRESETS`),
  Anthropic, OpenAI, DeepSeek, MiniMax, Moonshot, OpenRouter, Ollama (local), Custom. **Cada preset
  guarda su propia key/modelo/baseUrl** (`aiLlm.byPreset`) → cambiar de proveedor no mezcla
  credenciales. `baseUrl` editable salvo Anthropic y NoteFlow AI. El preset `noteflow` no usa API
  key: su credencial es un access token fresco de la cuenta por request (`resolveConfigAsync`;
  detalle en `.claude/context/monetization.md` § 3). `presetOf()` con id desconocido cae en
  `anthropic`, no en `PRESETS[0]`. **Modelo efectivo** (`effectiveModel`, `llm/index.ts`): el
  guardado o, si no hay, `suggestedModels[0]`; en los presets con **catálogo curado** (los que
  llevan `modelMeta` — hoy solo `noteflow`, cuya lista rota y cuyo proxy rechaza lo que no esté en
  ella) un modelo guardado que ya no esté en `suggestedModels` **también** cae en el primero, para
  que un catálogo renovado no deje al usuario con un modelo inválido. En los presets BYO el modelo
  es libre y se respeta tal cual.
- **UI del proveedor (`LlmConfigView`, embebida en Settings → IA y en la pestaña "settings" del panel
  del cerebro):** **selector de dos cards mutuamente excluyentes** (mismo patrón que Settings → Sync,
  con badge Activo/Inactivo) — **NoteFlow AI** (gestionado) vs **proveedor propio / IA local** (BYO key
  u Ollama). Las cards van **sin borde**: la elección se lee solo del relleno de acento
  (`bg-accent/[0.08]`, el tono de Settings → Sync). **Radios:** manda el lenguaje del panel del cerebro
  (`Card` de `AiPanel/ui.tsx`: `rounded-xl` en cajas, `rounded-lg` en controles) — se usa igual en
  Ajustes, y **Settings → Sync/Cloud se alinearon a él** (2026-07). Las **dos cards se ven siempre**
  (también sin entitlement); debajo, tras un `border-t`, se pinta **solo** la sección del modo elegido.
  NoteFlow AI **no aparece en el `<select>`** (que solo lista el resto de presets); su sección es la
  barra de consumo mensual + el gate (aviso ámbar → Ajustes → Cuenta) o el botón "Use NoteFlow AI"
  (solo con entitlement `ai`).
  - **Campo "Model":** texto libre en los presets BYO, pero **solo lectura** (`disabled` + hint
    `modelCuratedHint`) en los de catálogo curado (`preset.modelMeta`) — ahí se elige con los chips.
    Si fuera editable, teclear un id que no está en el catálogo lo persistiría en `ps.model` mientras
    `effectiveModel` sigue resolviendo al primer modelo curado: guardado y usado divergirían (y el
    input "saltaría" a cada tecla). Main aplica la misma regla como defensa en profundidad:
    `ai:llm-set-config` descarta un `model` que `llm.acceptsModel()` rechace.
  - `mode` (`'noteflow' | 'byo'`) es **estado de vista**, no el proveedor activo: se resuelve **una
    vez** desde `llmConfig.active` cuando la config está disponible (lazy init desde
    `useAiChatStore.getState()`, o una suscripción al store si aún no ha cargado) y **no se mueve solo**
    — que main active NoteFlow AI tras suscribirse no debe sacar al usuario de la vista en la que está
    (mismo contrato que `backend` en `SyncPanel`).
  - En modo BYO hay un `byoId` local al que se enlaza el `<select>` (si el activo es `noteflow`, cae en
    `anthropic`). **baseUrl / API key / modelo / test solo se muestran cuando `byoId === llmConfig.active`**:
    esos campos escriben sobre la config del **proveedor activo**, así que editarlos sin activar el
    proveedor elegido corrompería la config del otro. Mientras no coincidan, solo se ofrece el `<select>`
    + botón "Use this provider" (`setLlmConfig({ active })`).
- **RAG (`ai:chat` en main):** embebe la pregunta vía `aiIndex.search` (híbrido) → expande vecinos
  con `aiIndex.graph` → lee secciones de disco (`noteFormat.parseNoteDir`) → monta system prompt con
  contexto → stream. Emite `ai:chat-sources` (notas usadas) antes de los deltas. **Privacidad:** solo
  salen pregunta + chunks recuperados; las cifradas ya están fuera del índice.
- **Chat agéntico (tool-calling):** el chat **NO usa el CLI** — actúa con **function calling nativo**
  ejecutado en el main. Piezas: `electron/ai/llm/types.ts` (`ToolSchema`/`ToolCall`/`ToolResult`/
  `AgentMessage` + método `LlmProvider.streamTurn` que streamea texto y devuelve `toolCalls`),
  `anthropic.ts` (mapea a content blocks `tool_use`/`tool_result`; el `tool_use` llega completo tras
  el stream) y `openaiCompatible.ts` (añade `tools`+`tool_choice:auto` al payload y **acumula
  `delta.tool_calls` por índice** en el SSE). El **catálogo + ejecutor** vive en
  `electron/ai/llm/tools.ts` (`TOOLS`, `DESTRUCTIVE_TOOLS`, `executeTool(name,input,ctx)`),
  **desacoplado de main por DI** (`ToolContext`): lee/parsea con `noteFormat` y escribe reusando los
  primitivos factorizados del main `applyNoteWrite` / `applyNoteDelete` / `applyGroupsSet` /
  `applyFoldersSet` (heredan broadcast `notes-updated` + `schedulePush` + `scheduleIndex`; **sin
  senderId** → la propia ventana del chat también refresca). Tools v1: `list_notes`, `get_note`,
  `list_groups`, `search_notes`, `create_note`, `update_note`, `add_section`, `update_section`,
  `rename_section`, `create_group`, `create_folder`, `rename_group`, `rename_folder`, `delete_*`.
  Las **notas cifradas** se listan pero no se leen/editan. El **bucle** en `ai:chat` itera
  `streamTurn`→ejecutar tools→realimentar `role:'tool'` hasta que no haya `toolCalls` (máx. 12 pasos,
  `MAX_AGENT_STEPS`). **Tools siempre activas** (el modelo decide); **solo las destructivas piden
  confirmación**: el main emite `ai:chat-confirm-request` y `await`ea `chatConfirms` (resuelto por
  `ai:chat-confirm`); si se cancela, devuelve un `ToolResult` "user declined" sin abortar el turno.
- **Errores a mitad de respuesta (nunca se pierden):** como cada paso del bucle agéntico es una
  petición propia, un fallo (típico: agotar la cuota mensual del plan gestionado, 429 con
  `monthly_quota_exceeded`) suele llegar **después** de que el modelo ya haya escrito texto. Ojo al
  camino de cada tipo de fallo: el **429 de cuota** lo rechaza el proxy ANTES de reenviar, así que
  llega como **error HTTP al arrancar el paso** (rama `!res.ok`); los **frames SSE de error** cubren
  los fallos de OpenRouter a media stream. Dos piezas lo garantizan: (1)
  `openaiCompatible.streamTurn` **no se traga los frames SSE de error** (`data: {"error":…}`) — el
  `JSON.parse` sigue ignorando keepalives/frames partidos, pero un payload con `error` **lanza**
  (con el **código máquina delante**, porque `friendlyChatError` hace `raw.includes(...)`) y cancela
  el reader; el provider de Anthropic ya propaga por SDK. (2) En el renderer, `ChatTurn` tiene
  **`error`** (el turno entero *es* el error → burbuja roja) y **`errorText`** (falló tras emitir
  texto → se conserva la respuesta parcial como Markdown y el error se pinta en una fila roja debajo,
  `ChatView`). Antes el listener `onAiChatError` hacía `last.content || ⚠…` y descartaba el error si
  ya había texto: la respuesta se cortaba a medias sin ninguna señal.
- **Indicador de progreso del chat (invariante "si no hay indicador, ha terminado"):** mientras
  `streaming` es true **siempre** hay un cue al pie de la conversación hasta done/error/cancel.
  Componente `ChatActivityIndicator` en `ChatView` (se suscribe él mismo con selectores primitivos y
  tiene su propio timer → el chequeo de inactividad no re-renderiza la lista de mensajes); la regla es
  pura en `src/lib/chatActivity.ts` (`chatActivityCue`, test en `tests/lib/chatActivity.test.ts`):
  tool en curso o tarjeta de confirmación → nada (esa fila/tarjeta ya es el feedback);
  `awaitingModelText` (inicio o tras un tool result) o **sin delta desde hace `STREAM_IDLE_MS`
  (1,3 s)** → fila **"Thinking…"**; texto fluyendo → tres puntos pulsando (accent, texto sr-only).
  El fallback por inactividad cubre el hueco típico del bucle agéntico: preámbulo ("Voy a buscar…")
  y luego segundos generando los argumentos del tool call antes de que llegue `ai:chat-tool-call`.
  El store guarda `lastDeltaAt` (ms del último delta del turno; `null` al enviar). Ambas variantes
  comparten caja (`h-6`) para no mover el layout al alternar.
- **Iluminación de fuentes:** las notas citadas se "encienden" en el cerebro — pulso/halo aditivo
  brillante en 3D (`litGroup` en `BrainScene`, parpadeo por `sin`) y glow + anillo en 2D
  (`BrainCanvas`). NO se fuerzan etiquetas (eso metía ruido). Prop `highlightedNoteIds`.
- **Historial de chats:** sesiones en `userData/ai-chats.json` (local), gestionadas por `aiChatStore`
  (crear/abrir/borrar; se persiste al terminar cada respuesta). Selector de modelo en el chat
  (cambia el modelo del preset activo). Textos del panel vía i18n (`src/i18n/{en,es}/aiPanel.ts`).
- **Enrutado del panel desde la paleta de comandos:** `aiChatStore` expone `panelTab`/`pendingPrompt`
  + `openAiPanel(tab, prompt?)` (tipo `PanelTab = 'chat'|'related'|'profile'|'settings'`). La
  `CommandPalette` abre la brain view (`setBrainView(true)`) y llama `openAiPanel` para que el
  `AiPanel` cambie de pestaña reactivamente (un `useEffect` consume `panelTab` y gana sobre el
  auto-routing de primera vez). **Auto-routing de primera vez (`AiPanel`):** solo enruta a
  `settings` cuando **no hay proveedor configurado** (onboarding); con proveedor el panel aterriza
  **siempre en `chat`**. La pestaña `profile` **nunca se abre sola** — se llega pulsándola, desde la
  paleta o desde Settings → AI. El comando inline **"Ask AI"** pasa un `prompt`: `openAiPanel`
  arranca un chat nuevo y deja `pendingPrompt`, que `ChatView` auto-envía en cuanto hay proveedor
  configurado (si no, queda en cola). Sin IPC nuevo — es routing in-renderer vía store.
- **Segundo cerebro (cuestionario de baja fricción):** el `ProfileFlow` vive en la pestaña
  **Profile** del panel de IA y **solo se abre a petición del usuario** (pestaña, paleta de comandos
  o Settings → AI); no hay auto-apertura al entrar al cerebro. La UI es **data-driven** desde
  `profileQuestions.ts` (`PROFILE_SECTIONS` → secciones **Professional / Personal / Your style /
  Working with the AI**; campos tipo `chips`/`tags`/`text`/**`choice`** — `PROFILE_FIELDS` los aplana).
  **Diseño indirecto > directo:** la mayor señal viene de **preguntas-proxy de baja fricción**
  (música/cine/libros favoritos, viaje soñado) y **binarias "esto o lo otro"** (`choice`,
  single-select) pensadas para tap-ear el **Big Five (OCEAN)** — el modelo las interpreta como
  **priors suaves** (correlaciones modestas, nunca veredictos). Se conservan algunos chips directos
  de auto-descripción (enfoque **híbrido**). El usuario también puede **adjuntar archivos** y
  **enlaces**. Al generar, `ai:profile-generate` recibe `{fields (con `section`), fileIds, urls,
  locale}` (agrupa las respuestas por sección en el prompt) y el LLM **infiere/abstrae/organiza** en
  una nota de perfil (creada por `notesStore`). El `locale` (en qué idioma escribe el LLM el perfil) lo
fija `detectLocale()` según el **ajuste de idioma de la app** (`languageStore`, no `navigator.language`),
de modo que el perfil sigue el idioma de la UI (NO cambia el idioma del **chat**, que sigue detectando
el idioma del texto del usuario). El **esquema del wizard** (labels/hints/opciones) es i18n vía la
factory `getProfileQuestions(t)` (namespace `aiPanel.profileForm`); marcas en opciones (Notion, Figma,
Python…) quedan literales. **Borrador persistente:** las
  respuestas del wizard viven en `aiChatStore.profileDraft` (no en `useState`) para sobrevivir al
  desmontaje de `ProfileFlow` al cambiar de pestaña (p. ej. ir a Settings a arreglar el proveedor tras un
  fallo y volver). Es **de sesión** (los bytes de los adjuntos viven en la caché del main, también de
  sesión); se limpia (`resetProfileDraft`) tras generar con éxito. **Tras generar:** la pestaña Profile
  muestra `ProfileSummary` (estado "Profile created" con enlace a la nota + "Start over") en vez del wizard
  vacío; `AiPanel` decide por `aiProfile.noteId`. **Regenerar** (Start over → Generate) **reusa la misma
  nota** (`existingNoteId`) en vez de crear un duplicado. **Privacidad/abstracción:**
  el cuerpo describe a la persona en **rasgos/valores abstractos** (lo que un favorito *representa*,
  no el título); los favoritos literales van en una sección final **"Soft signals (raw — do not
  cite)"** marcada como background-only. El `CHAT_SYSTEM_BASE` además prohíbe name-dropping de esas
  preferencias en chats no relacionados (recomendar directo, sin "como te gusta X…").
- **Adjuntos nativos (la app NUNCA procesa documentos):** la capa LLM admite `Attachment`
  (`{kind:'pdf'|'image', mediaType, data:base64}`) vía `ChatOptions.attachments`; `anthropic.ts`
  los mapea a bloques `document`/`image` y `openaiCompatible.ts` las imágenes a `image_url` parts.
  Qué se ofrece lo decide `providerCapabilities(preset, activeModel)` (en `llm/index.ts`, expuesto en
  `LlmConfigPublic.capabilities`): **PDF solo Anthropic**; las **imágenes son por preset** porque el
  soporte de visión es **dependiente del modelo** — cada preset declara un default `images?` en
  `presets.ts` (false en los de solo-texto: **DeepSeek/MiniMax/Moonshot**, que rechazan `image_url`
  con un 400; true en los vision-capaces/flexibles: OpenAI/OpenRouter/Ollama/Custom). **Excepción:
  los presets con `modelMeta`** (hoy solo `noteflow`, cuyo catálogo mezcla modelos con y sin visión)
  refinan el flag **por modelo activo** — manda `modelMeta[activeModel].images` sobre el default del
  preset (text-only en el catálogo gestionado: los dos DeepSeek y `xiaomi/mimo-v2.5-pro` — **tres de
  los cinco modelos ×1**). ⚠️ **El modelo por defecto del plan gestionado (`suggestedModels[0]`, hoy
  `deepseek/deepseek-v4-pro`) es text-only**, así que quien active NoteFlow AI sin tocar el selector
  **no verá adjuntar imágenes** hasta que elija un modelo con visión: no dar por hecho que el plan
  gestionado trae visión "de serie". `.txt/.md` se
  incrustan como texto (universal). DOCX/OCR no se soportan (requerirían procesar). El picker capa las
  extensiones y `ai:chat` filtra los adjuntos por `caps` (defensa en profundidad: si cambias a un
  proveedor sin imágenes, los adjuntos de imagen no se envían). **Archivos de texto/código:** se admite
  una lista amplia de extensiones de texto plano (`TEXT_EXTS` en `main.ts`: .txt/.md + código .py/.js/
  .ts/.go/.rs/… + config .json/.yaml/.toml/… + .sql/.html/.css/…) — todo lo que **ya es texto**, sin
  parsear; se incrustan verbatim (cap 20k chars/archivo). Formatos binarios/estructurados (docx, xlsx)
  no. **Error amable:** si mandas una imagen a un modelo de solo-texto, `friendlyChatError` detecta el
  fallo típico (HTTP 400 `unknown variant image_url`) y devuelve un mensaje claro en vez del JSON crudo.
  Los **enlaces** se descargan con `net.fetch` + `fetchReadableText`
  (https validado, timeout 8s, strip HTML→texto, cap 6000 chars) y van como contexto.
  - **En el chat** (no solo el perfil): el composer de `ChatView` tiene un botón 📎 (`pickAttachments`
    en `aiChatStore`) que abre `ai:chat-pick-files`; los adjuntos pendientes se muestran como chips
    removibles y se cuelgan del turno de usuario al enviar (`ChatTurn.attachments`, metadatos solo).
    `sendMessage` reenvía los `attachmentIds` de **cada** turno en el payload, así las preguntas de
    seguimiento conservan la imagen/PDF en contexto (los bytes viven en `chatFiles` toda la sesión de
    app; al reabrir un chat guardado en disco los bytes ya no están, solo se ven los chips). El picker
    escala las extensiones por `capabilities` (mismo helper `pickFilesIntoCache` que el perfil).
- **Dep nueva:** `@anthropic-ai/sdk` (JS puro, sin binario nativo → no toca `asarUnpack`/postinstall).
- **Smoke:** `scripts/ai-chat-smoke.cjs` (servidor mock OpenAI-compatible; corre con `node`, sin
  Electron): listar modelos, streaming, abort, **tool-calling** (acumulación de `tool_calls`
  fragmentados por índice + turno de seguimiento con `role:'tool'`) y **adjuntos** (imagen →
  `content` array con `image_url`). El mock usa `res.on('close')`
  para limpiar el `setInterval` (con `req.on('close')` Node moderno lo mataba al consumir el body).
- **Pendiente:** verificación manual en app real (necesita key/Ollama); monetización/nube (Fase 4,
  diseño en `.claude/context/monetization.md`).
